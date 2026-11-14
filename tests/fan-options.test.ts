import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, mapEntity, type Hass, type HassEntity } from '../src/providers/home-assistant';
import type { CardCommand } from '../src/core';

const rawFan = (attributes: Record<string, unknown> = {}, state = 'on'): HassEntity => ({ entity_id: 'fan.dining', state, attributes: {
  supported_features: 14, preset_modes: ['Sleep', 'Breeze'], preset_mode: 'Sleep', oscillating: false, direction: 'forward', ...attributes,
} });
const setup = (raw = rawFan()) => {
  const calls: unknown[][] = [];
  const host: Hass = { states: { 'fan.dining': raw }, async callService(...args) { calls.push(args); } };
  return { host, calls, model: mapEntity(raw, 'fan', 'fan.dining') };
};

test('fan options advertise independently from speed and toggle; state remains unknown when missing', () => {
  const model = mapEntity(rawFan(), 'fan', 'fan.dining');
  assert.deepEqual(model.capabilities, ['oscillate', 'direction', 'fan_preset']);
  assert.deepEqual(model.fanPresets, ['Sleep', 'Breeze']);
  assert.deepEqual(model.directions, ['forward', 'reverse']);
  assert.equal(model.oscillating, false);
  const unknown = mapEntity(rawFan({ preset_mode: null, direction: 'invalid', oscillating: null }), 'fan', 'fan.dining');
  assert.equal(unknown.fanPreset, undefined); assert.equal(unknown.direction, undefined); assert.equal(unknown.oscillating, undefined);
  const speedOnly = mapEntity(rawFan({ supported_features: 1 }), 'fan', 'fan.dining');
  assert.deepEqual(speedOnly.capabilities, ['speed']);
});

test('each advertised fan option sends its exact service payload and owning target', async () => {
  const { host, calls, model } = setup();
  for (const command of [{ type: 'fan_preset', value: 'Breeze' }, { type: 'oscillate', value: true }, { type: 'direction', value: 'reverse' }] as CardCommand[]) await executeCommand(host, model, command);
  assert.deepEqual(calls, [
    ['fan','set_preset_mode',{preset_mode:'Breeze'},{entity_id:'fan.dining'}],
    ['fan','oscillate',{oscillating:true},{entity_id:'fan.dining'}],
    ['fan','set_direction',{direction:'reverse'},{entity_id:'fan.dining'}],
  ]);
});

test('preset list is sanitized and invalid modes, directions and oscillation values never reach the host', async () => {
  const { host, calls, model } = setup(rawFan({ preset_modes: ['Sleep','Sleep',null,2,''] }));
  assert.deepEqual(model.fanPresets, ['Sleep']);
  for (const command of [{ type: 'fan_preset', value: 'Breeze' }, { type: 'direction', value: 'left' }, { type: 'oscillate', value: 'true' }] as unknown as CardCommand[]) await assert.rejects(executeCommand(host, model, command));
  assert.deepEqual(calls, []);
  assert.ok(!mapEntity(rawFan({ preset_modes: [] }), 'fan', 'fan.dining').capabilities.includes('fan_preset'));
});

test('dispatch rechecks current flags and preset options after a rendered model becomes stale', async () => {
  const { host, calls, model } = setup();
  host.states['fan.dining'] = rawFan({ preset_modes: ['Eco'] });
  await assert.rejects(executeCommand(host, model, { type: 'fan_preset', value: 'Sleep' }));
  await executeCommand(host, model, { type: 'fan_preset', value: 'Eco' });
  host.states['fan.dining'] = rawFan({ supported_features: 0 });
  for (const command of [{ type: 'fan_preset', value: 'Sleep' }, { type: 'direction', value: 'forward' }, { type: 'oscillate', value: false }] as CardCommand[]) await assert.rejects(executeCommand(host, model, command));
  assert.deepEqual(calls, [['fan','set_preset_mode',{preset_mode:'Eco'},{entity_id:'fan.dining'}]]);
});

test('dispatch rejects unavailable, missing and wrong-domain owners without a service call', async () => {
  const { host, calls, model } = setup();
  host.states['fan.dining'] = rawFan({}, 'unavailable');
  await assert.rejects(executeCommand(host, model, { type:'oscillate', value:true }));
  delete host.states['fan.dining'];
  await assert.rejects(executeCommand(host, model, { type:'direction', value:'reverse' }));
  const wrong = { ...model, externalId:'light.dining' };
  host.states['light.dining'] = rawFan();
  await assert.rejects(executeCommand(host, wrong, { type:'fan_preset', value:'Sleep' }));
  assert.deepEqual(calls, []);
});
