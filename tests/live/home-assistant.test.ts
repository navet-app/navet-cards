import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { mapEntity, roomEntityIds, executeCommand, type Hass } from '../../src/providers/home-assistant';
import type { CardKind, Capability, CardCommand } from '../../src/core';
import { PermissionDeniedError } from '../../src/core';

// Opt-in only: sessions are created by scripts/ha-validation.mjs for disposable demo hosts.
const sessionPath = resolve(process.env.NAVET_HA_SESSION ?? 'missing-session');
assert.ok(sessionPath.startsWith(resolve('.ha-validation') + sep), 'Use a disposable .ha-validation session');
const session = JSON.parse(await readFile(sessionPath, 'utf8'));
assert.equal(new URL(session.base).hostname, '127.0.0.1');
assert.ok(Number(new URL(session.base).port) >= 18000, 'Disposable HA uses its dedicated high port');
assert.equal(session.name, `navet-cards-ha-${session.version.replaceAll('.', '-')}`);
const refreshed = await fetch(session.base + '/auth/token', {
  method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refresh_token, client_id: session.base + '/' }),
});
assert.equal(refreshed.status, 200, 'Disposable session refresh succeeds');
session.access_token = (await refreshed.json()).access_token;
const socket = new WebSocket(`${session.base.replace('http:', 'ws:')}/api/websocket`);
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
let id = 0;
await new Promise<void>((done, reject) => {
  const timer = setTimeout(() => reject(new Error('HA authentication timed out')), 30000);
  socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('HA socket failed')); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: session.access_token }));
    if (message.type === 'auth_ok') { clearTimeout(timer); done(); }
    if (message.type === 'auth_invalid') { clearTimeout(timer); reject(new Error('HA authentication failed')); }
    if (message.type === 'result') {
      const request = pending.get(message.id);
      pending.delete(message.id);
      message.success ? request?.resolve(message.result) : request?.reject(new Error(JSON.stringify(message.error)));
    }
  });
});
function call(type: string, data: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${type} timed out`)); }, 30000);
    pending.set(requestId, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: requestId, type, ...data }));
  });
}
async function host(): Promise<Hass> {
  const [states, config, entities, devices, areas] = await Promise.all([
    call('get_states'), call('get_config'), call('config/entity_registry/list'),
    call('config/device_registry/list'), call('config/area_registry/list'),
  ]);
  return {
    states: Object.fromEntries(states.map((state: any) => [state.entity_id, state])), config,
    entities: Object.fromEntries(entities.map((entity: any) => [entity.entity_id, entity])),
    devices: Object.fromEntries(devices.map((device: any) => [device.id, device])),
    areas: Object.fromEntries(areas.map((area: any) => [area.area_id, area])),
    async callService(domain, service, data, target) {
      await call('call_service', { domain, service, service_data: data, target });
    },
  };
}
async function entity(kind: CardKind, externalId: string) {
  const hass = await host();
  return { hass, model: mapEntity(hass.states[externalId], kind, externalId, hass) };
}
async function eventually(check: () => Promise<boolean>) {
  for (let i = 0; i < 60; i++) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.fail('HA backend state did not converge');
}
async function serviceAs(token: string, domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>) {
  const connection = new WebSocket(`${session.base.replace('http:', 'ws:')}/api/websocket`);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Restricted service timed out')), 30000);
      connection.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Restricted connection failed')); });
      connection.addEventListener('message', ({ data: raw }) => {
        const message = JSON.parse(String(raw));
        if (message.type === 'auth_required') connection.send(JSON.stringify({ type: 'auth', access_token: token }));
        if (message.type === 'auth_invalid') { clearTimeout(timer); reject(new Error('Restricted auth failed')); }
        if (message.type === 'auth_ok') connection.send(JSON.stringify({ id: 1, type: 'call_service', domain, service, service_data: data, target }));
        if (message.type === 'result') {
          clearTimeout(timer);
          message.success ? resolve(message.result) : reject(message.error);
        }
      });
    });
  } finally { connection.close(); }
}

test(`live Home Assistant ${session.version}: real capability and service round trips`, async t => {
  const exercised: {capability:string;entityId:string;value:unknown}[] = [];
  const skipped: {capability:string;reason:string}[] = [];
  try {
    const config = await call('get_config');
    assert.equal(config.version, session.version);
    const light = await entity('light', 'light.bed_light');
    assert.ok(light.model.capabilities.includes('brightness'));
    await executeCommand(light.hass, light.model, { type: 'brightness', value: 40 });
    await eventually(async () => (await entity('light', 'light.bed_light')).model.brightness === 40);
    const sw = await entity('switch', 'input_boolean.navet_test');
    await executeCommand(sw.hass, sw.model, { type: 'toggle' });
    await eventually(async () => (await entity('switch', 'input_boolean.navet_test')).model.active !== sw.model.active);
    const climate = await entity('climate', 'climate.hvac');
    await executeCommand(climate.hass, climate.model, { type: 'temperature', value: 23 });
    await eventually(async () => (await entity('climate', 'climate.hvac')).model.temperature === 23);
    const media = await entity('media', 'media_player.living_room');
    await executeCommand(media.hass, media.model, { type: 'volume', value: 35 });
    await eventually(async () => (await entity('media', 'media_player.living_room')).model.volume === 35);
    const playback = await entity('media', 'media_player.living_room');
    await executeCommand(playback.hass, playback.model, { type: 'play_pause' });
    await eventually(async () => (await entity('media', 'media_player.living_room')).model.state !== playback.model.state);
    const cover = await entity('cover', 'cover.living_room_window');
    await executeCommand(cover.hass, cover.model, { type: 'position', value: 40 });
    await eventually(async () => (await entity('cover', 'cover.living_room_window')).model.position === 40);
    // Discover actual demo capabilities; never synthesize support flags or entity state.
    const depthHost = await host();
    const supported = (kind: CardKind, capability: Capability, source = depthHost) => Object.entries(source.states)
      .filter(([id]) => id.startsWith(`${kind === 'media' ? 'media_player' : kind}.`))
      .map(([id, state]) => mapEntity(state, kind, id, source))
      .filter(model => model.available && model.capabilities.includes(capability));
    const colorLight = supported('light', 'color')[0];
    if (colorLight) {
      const hue = (colorLight.color?.hue ?? 0) < 180 ? 240 : 60;
      await executeCommand(depthHost, colorLight, {type:'color',hue,saturation:75});
      await eventually(async()=>{
        const actual = (await entity('light', colorLight.externalId)).model.color;
        return !!actual && Math.abs(actual.hue-hue) < 2.5 && Math.abs(actual.saturation-75) < 2.5;
      });
      exercised.push({capability:'color',entityId:colorLight.externalId,value:{hue,saturation:75}});
    } else skipped.push({capability:'color',reason:'No available demo light advertises a supported color mode.'});
    const effectLight = supported('light', 'effect', await host()).find(model=>model.effects?.some(effect=>effect!==model.effect));
    if (effectLight) {
      const effect = effectLight.effects!.find(effect=>effect!==effectLight.effect)!;
      await executeCommand(depthHost,effectLight,{type:'effect',value:effect});
      await eventually(async()=>(await entity('light',effectLight.externalId)).model.effect===effect);
      exercised.push({capability:'effect',entityId:effectLight.externalId,value:effect});
    } else skipped.push({capability:'effect',reason:'No available demo light advertises a different selectable effect.'});
    const rangedClimate = supported('climate','temperature_range')[0];
    if (rangedClimate) {
      const min=rangedClimate.minTemperature!, max=rangedClimate.maxTemperature!, step=rangedClimate.stepTemperature!;
      const low = min + step * Math.max(0,Math.floor((max-min)/step/3));
      const high = min + step * Math.floor((max-min)/step*2/3);
      const nextLow = low === rangedClimate.targetTemperatureLow && high === rangedClimate.targetTemperatureHigh ? Math.min(high,low+step) : low;
      await executeCommand(depthHost,rangedClimate,{type:'temperature_range',low:nextLow,high});
      await eventually(async()=>{
        const actual=(await entity('climate',rangedClimate.externalId)).model;
        return actual.targetTemperatureLow===nextLow && actual.targetTemperatureHigh===high;
      });
      exercised.push({capability:'temperature_range',entityId:rangedClimate.externalId,value:{low:nextLow,high}});
    } else skipped.push({capability:'temperature_range',reason:'No available demo climate advertises a range with both target bounds.'});
    const tiltedCover = supported('cover','tilt').find(model=>model.tiltPosition!==undefined);
    if (tiltedCover) {
      const value=tiltedCover.tiltPosition===40?60:40;
      await executeCommand(depthHost,tiltedCover,{type:'tilt',value});
      await eventually(async()=>(await entity('cover',tiltedCover.externalId)).model.tiltPosition===value);
      exercised.push({capability:'tilt',entityId:tiltedCover.externalId,value});
    } else skipped.push({capability:'tilt',reason:'No available demo cover advertises tilt positioning with readable tilt state.'});
    // Read the actual host again for each option command: the production provider
    // rechecks these lists and feature flags at dispatch. Unknown current modes
    // are reported as skips rather than guessed or manufactured via REST state.
    for (const option of [
      {kind:'climate',capability:'climate_preset',options:'climatePresets',selected:'climatePreset'},
      {kind:'climate',capability:'climate_fan',options:'climateFans',selected:'climateFan'},
      {kind:'climate',capability:'climate_swing',options:'climateSwings',selected:'climateSwing'},
      {kind:'climate',capability:'climate_swing_horizontal',options:'climateSwingHorizontals',selected:'climateSwingHorizontal'},
      {kind:'vacuum',capability:'vacuum_speed',options:'vacuumSpeeds',selected:'vacuumSpeed'},
    ] as const) {
      const currentHost = await host();
      const candidate = supported(option.kind, option.capability, currentHost).find(model => {
        const options = model[option.options], current = model[option.selected];
        return typeof current === 'string' && options?.includes(current) && options.some(value => value !== current);
      });
      if (!candidate) {
        skipped.push({capability:option.capability,reason:`No available demo ${option.kind} advertises a valid current option and a different selectable option.`});
        continue;
      }
      const value = candidate[option.options]!.find(value => value !== candidate[option.selected])!;
      const command: CardCommand = {type:option.capability,value};
      await executeCommand(currentHost, candidate, command);
      await eventually(async () => (await entity(option.kind,candidate.externalId)).model[option.selected] === value);
      exercised.push({capability:option.capability,entityId:candidate.externalId,value});
    }
    if (process.env.NAVET_LIVE_SKIP_DEMO_MEDIA_SEEK === '1') {
      assert.ok(['2026.9.4','2024.6.4'].includes(session.version), 'The audited demo seek exception is limited to the two verified disposable versions.');
      skipped.push({capability:'seek',reason:'demo advertises SEEK but backend NotImplementedError confirmed on2026.9.4/2024.6.4'});
    } else {
      const seekHost = await host();
      const seekPlayer = supported('media','seek',seekHost).find(model => model.duration !== undefined && model.elapsed !== undefined);
      if (seekPlayer) {
        const duration = seekPlayer.duration!, previousPosition = seekPlayer.elapsed!;
        const value = duration * (previousPosition < duration / 2 ? 0.75 : 0.25);
        await executeCommand(seekHost,seekPlayer,{type:'seek',value});
        await eventually(async()=>{
          const actual = (await entity('media',seekPlayer.externalId)).model.elapsed;
          return actual !== undefined && Math.abs(actual-value) <= Math.min(0.5,duration/10);
        });
        exercised.push({capability:'seek',entityId:seekPlayer.externalId,value:{positionSeconds:value,durationSeconds:duration,previousPositionSeconds:previousPosition}});
      } else skipped.push({capability:'seek',reason:'No available demo media player advertises seeking with a known current position and positive duration.'});
    }
    const repeatHost = await host();
    const repeatPlayer = supported('media','repeat',repeatHost).find(model=>model.repeat !== undefined && model.repeatModes?.includes(model.repeat));
    if (repeatPlayer) {
      const value = repeatPlayer.repeatModes!.find(value=>value!==repeatPlayer.repeat)!;
      await executeCommand(repeatHost,repeatPlayer,{type:'repeat',value});
      await eventually(async()=>(await entity('media',repeatPlayer.externalId)).model.repeat===value);
      exercised.push({capability:'repeat',entityId:repeatPlayer.externalId,value});
    } else skipped.push({capability:'repeat',reason:'No available demo media player advertises repeat with a known valid current mode.'});
    const shuffleHost = await host();
    const shufflePlayer = supported('media','shuffle',shuffleHost).find(model=>typeof model.shuffle==='boolean');
    if (shufflePlayer) {
      const value = !shufflePlayer.shuffle;
      await executeCommand(shuffleHost,shufflePlayer,{type:'shuffle',value});
      await eventually(async()=>(await entity('media',shufflePlayer.externalId)).model.shuffle===value);
      exercised.push({capability:'shuffle',entityId:shufflePlayer.externalId,value});
    } else skipped.push({capability:'shuffle',reason:'No available demo media player advertises shuffle with a known current boolean value.'});
    const powerHost = await host();
    const powerPlayer = supported('media','power_off',powerHost).find(model=>model.capabilities.includes('power_on') && !['off','standby'].includes(model.state));
    if (powerPlayer) {
      let turnedOff = false;
      try {
        await executeCommand(powerHost,powerPlayer,{type:'power_off'}); turnedOff = true;
        await eventually(async()=>['off','standby'].includes((await entity('media',powerPlayer.externalId)).model.state));
      } finally {
        if (turnedOff) {
          const current = await entity('media',powerPlayer.externalId);
          await executeCommand(current.hass,current.model,{type:'power_on'});
          await eventually(async()=>{
            const actual = (await entity('media',powerPlayer.externalId)).model;
            return actual.available && !['off','standby'].includes(actual.state);
          });
        }
      }
      exercised.push({capability:'media_power_pair',entityId:powerPlayer.externalId,value:{commands:['power_off','power_on'],flags:'both advertised; independent single-flag device coverage not established'}});
    } else skipped.push({capability:'media_power_pair',reason:'No available active demo media player advertises both power-off and power-on capabilities.'});
    const sensor = await entity('sensor', 'sensor.outside_temperature');
    assert.ok(sensor.model.available);
    assert.equal(sensor.model.unit, '°C');
    const hass = await host();
    const area = Object.entries(hass.areas!).find(([, area]) => area.name === 'Navet test room')![0];
    assert.deepEqual(roomEntityIds(hass, area), ['input_boolean.navet_test', 'light.bed_light', 'sensor.outside_temperature']);
    const dashboard = await call('lovelace/config', { url_path: 'navet-verification' });
    assert.equal(dashboard.views.length, 4);
    assert.ok(dashboard.views[1].sections[0].cards.some((card: any) => card.type === 'custom:navet-light-card'));
    // Keep existing live contracts; add disposable helper service round trips.
    let numberId: string | undefined;
    let selectId: string | undefined;
    try {
      numberId = (await call('input_number/create', { name: 'Navet delivery offset', min: -10, max: 10, step: 0.5, initial: -2 })).id;
      selectId = (await call('input_select/create', { name: 'Navet delivery mode', options: ['Eco', 'Comfort'], initial: 'Eco' })).id;
      assert.ok(numberId); assert.ok(selectId);
      await eventually(async()=>!!(await host()).states[`input_number.${numberId}`] && !!(await host()).states[`input_select.${selectId}`]);
      const number = await entity('number', `input_number.${numberId}`);
      await executeCommand(number.hass, number.model, { type: 'number', value: -1.5 });
      await eventually(async()=>(await entity('number', `input_number.${numberId}`)).model.number === -1.5);
      const select = await entity('select', `input_select.${selectId}`);
      await executeCommand(select.hass, select.model, { type: 'select', value: 'Comfort' });
      await eventually(async()=>(await entity('select', `input_select.${selectId}`)).model.state === 'Comfort');
      const heating = await entity('climate', 'climate.hvac');
      if (heating.model.hvacModes?.includes('off')) {
        await executeCommand(heating.hass, heating.model, {type:'hvac_mode',value:'off'});
        await eventually(async()=>(await entity('climate','climate.hvac')).model.state === 'off');
        if (heating.model.hvacModes.includes(heating.model.state)) await executeCommand(heating.hass,heating.model,{type:'hvac_mode',value:heating.model.state});
      }
    } finally {
      if (numberId) await call('input_number/delete', {input_number_id:numberId});
      if (selectId) await call('input_select/delete', {input_select_id:selectId});
    }
    for (const [role, user] of Object.entries(session.verificationUsers) as [string, any][]) {
      const flow = await fetch(session.base + '/auth/login_flow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: session.base + '/', handler: ['homeassistant', null], redirect_uri: session.base + '/' }),
      }).then((response) => response.json());
      const login = await fetch(session.base + '/auth/login_flow/' + flow.flow_id, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: session.base + '/', username: user.username, password: user.password }),
      }).then((response) => response.json());
      assert.equal(login.type, 'create_entry');
      const tokens = await fetch(session.base + '/auth/token', {
        method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code: login.result, client_id: session.base + '/' }),
      }).then((response) => response.json());
      try {
        const state = await fetch(session.base + '/api/states/input_boolean.navet_test', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        assert.equal(state.status, 200, `${role} can read entity state`);
        const service = await fetch(session.base + '/api/services/input_boolean/turn_on', {
          method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity_id: 'input_boolean.navet_test' }),
        });
        if (role === 'readonly') assert.ok([401, 403].includes(service.status), 'Read-only service is denied by HA');
        else assert.equal(service.status, 200, 'Household member can control entities');
        const restrictedHost: Hass = { states: hass.states, callService: (domain, service, data, target) => serviceAs(tokens.access_token, domain, service, data, target) };
        const model = mapEntity(hass.states['input_boolean.navet_test'], 'switch', 'input_boolean.navet_test');
        if (role === 'readonly') await assert.rejects(executeCommand(restrictedHost, model, { type: 'toggle' }), PermissionDeniedError);
        else await executeCommand(restrictedHost, model, { type: 'toggle' });
      } finally {
        await fetch(session.base + '/auth/token', { method: 'POST', body: new URLSearchParams({ action: 'revoke', token: tokens.refresh_token }) });
      }
    }
  } finally {
    t.diagnostic(JSON.stringify({version:session.version,scope:'isolated demo backend capability/service round trips',exercised,skipped}));
    socket.close();
  }
});
