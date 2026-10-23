import { mapUpdate, prepareUpdateCommand } from './updates';
import { mapMediaGroups, prepareMediaGroupCommand } from './media-groups';
import { mapRemote, prepareRemoteCommand } from './remote';
import type { CardEntity, CardKind, CardCommand, Capability, LightColorMode, MediaRepeatMode } from '../core';
import { resourceUrl } from '../config';
import { PermissionDeniedError } from '../core';

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}
export interface Hass {
  callWS?<T>(message: Record<string, unknown>): Promise<T>;
  callApi?<T>(method: string, path: string): Promise<T>;
  states: Record<string, HassEntity>;
  language?: string;
  locale?: { language?: string };
  themes?: { darkMode?: boolean };
  config?: { time_zone?: string; unit_system?: { temperature?: string } };
  entities?: Record<
    string,
    {
      area_id?: string | null;
      device_id?: string | null;
      entity_category?: string | null;
      hidden_by?: string | null;
      disabled_by?: string | null;
    }
  >;
  devices?: Record<string, { area_id?: string | null }>;
  areas?: Record<string, { name: string }>;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  formatEntityState?(entity: HassEntity): string;
  formatEntityAttributeValue?(entity: HassEntity, attribute: string, value?: unknown): string;
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): string =>
  v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const clamp = (v: number, max = 100) => Math.min(max, Math.max(0, v));

// Current HA feature flags and service parameters remain at the provider boundary.
// Verified against home-assistant/core 2026.10.2 climate/const.py and vacuum/const.py.
const deviceOptions = {
  climate_preset: { domain: 'climate', bit: 16, list: 'preset_modes', current: 'preset_mode', options: 'climatePresets', selected: 'climatePreset', service: 'set_preset_mode', parameter: 'preset_mode' },
  climate_fan: { domain: 'climate', bit: 8, list: 'fan_modes', current: 'fan_mode', options: 'climateFans', selected: 'climateFan', service: 'set_fan_mode', parameter: 'fan_mode' },
  climate_swing: { domain: 'climate', bit: 32, list: 'swing_modes', current: 'swing_mode', options: 'climateSwings', selected: 'climateSwing', service: 'set_swing_mode', parameter: 'swing_mode' },
  climate_swing_horizontal: { domain: 'climate', bit: 512, list: 'swing_horizontal_modes', current: 'swing_horizontal_mode', options: 'climateSwingHorizontals', selected: 'climateSwingHorizontal', service: 'set_swing_horizontal_mode', parameter: 'swing_horizontal_mode' },
  vacuum_speed: { domain: 'vacuum', bit: 32, list: 'fan_speed_list', current: 'fan_speed', options: 'vacuumSpeeds', selected: 'vacuumSpeed', service: 'set_fan_speed', parameter: 'fan_speed' },
} as const;

/** Scoped subset of Navet normalization; raw HA data stops at this module. */
export function mapEntity(
  entity: HassEntity | undefined,
  kind: CardKind,
  id: string,
  hass?: Hass,
  attribute?: string,
  unit?: string,
): CardEntity {
  if (['entity', 'info', 'battery', 'ups', 'energy-now', 'media-stack'].includes(kind)) kind = kindForEntity(id);
  const a = entity?.attributes ?? {};
  const state = entity?.state ?? 'missing';
  const features = finite(a.supported_features) ? a.supported_features : 0;
  const capabilities: Capability[] = [];
  const remote = kind === 'remote' ? mapRemote(entity) : undefined;
  if (remote) capabilities.push(...remote.capabilities);
  const update = kind === 'update' ? mapUpdate(entity) : undefined;
  if (update) capabilities.push(...update.capabilities);
  const mediaGroups = kind === 'media' ? mapMediaGroups(entity) : undefined;
  if (mediaGroups) capabilities.push(...mediaGroups.capabilities);
  const deviceOptionState: Partial<CardEntity> = {};
  if (kind === 'climate' || kind === 'vacuum') for (const [type, spec] of Object.entries(deviceOptions)) {
    if (kind !== spec.domain) continue;
    const raw = a[spec.list];
    const options = Array.isArray(raw) ? [...new Set(raw.filter((value): value is string => typeof value === 'string' && value.length > 0))] : [];
    deviceOptionState[spec.options] = options;
    deviceOptionState[spec.selected] = typeof a[spec.current] === 'string' ? a[spec.current] as string : undefined;
    if (features & spec.bit && options.length) capabilities.push(type as Capability);
  }
  if (['light', 'switch'].includes(kind)) capabilities.push('toggle');
  const comfortKind = kind === 'humidifier' || kind === 'water-heater';
  const humidifierModes = kind === 'humidifier' && Array.isArray(a.available_modes) ? [...new Set(a.available_modes.filter((v): v is string => typeof v === 'string' && v.length > 0))] : [];
  const waterOperations = kind === 'water-heater' && Array.isArray(a.operation_list) ? [...new Set(a.operation_list.filter((v): v is string => typeof v === 'string' && v.length > 0))] : [];
  const minHumidity = finite(a.min_humidity) ? a.min_humidity : 0;
  const maxHumidity = finite(a.max_humidity) ? a.max_humidity : 100;
  if (kind === 'humidifier') {
    capabilities.push('toggle','power_on','power_off');
    if (minHumidity >= 0 && maxHumidity <= 100 && minHumidity < maxHumidity) capabilities.push('humidity');
    if (features & 1 && humidifierModes.length) capabilities.push('humidifier_mode');
  }
  if (kind === 'water-heater') {
    if (features & 8) capabilities.push('power_on','power_off');
    if (features & 1 && finite(a.min_temp) && finite(a.max_temp) && a.min_temp < a.max_temp) capabilities.push('temperature');
    if (features & 2 && waterOperations.length) capabilities.push('water_operation');
    if (features & 4) capabilities.push('away_mode');
  }
  const fanPresets = kind === 'fan' && Array.isArray(a.preset_modes) ? [...new Set(a.preset_modes.filter((mode): mode is string => typeof mode === 'string' && mode.length > 0))] : [];
  if (kind === 'fan') {
    // FanEntityFeature flags verified against HA 2026.10.2 fan/const.py.
    if (features & 2) capabilities.push('oscillate');
    if (features & 4) capabilities.push('direction');
    if (features & 8 && fanPresets.length) capabilities.push('fan_preset');
    if (features & 1) capabilities.push('speed');
    if ((features & 48) === 48) capabilities.push('toggle');
  }
  if (kind === 'lock' && !a.code_format) capabilities.push('lock', 'unlock');
  if (kind === 'vacuum') {
    if (features & 8192) capabilities.push('start');
    if (features & 8) capabilities.push('stop');
    if (features & 16) capabilities.push('return_home');
    if (features & 4) capabilities.push('pause');
  }
  if (['scene', 'script', 'button'].includes(kind)) capabilities.push('activate');
  if (kind === 'note' && ['input_text', 'text'].includes(id.split('.')[0]) && a.mode !== 'password') capabilities.push('text');
  const modes = Array.isArray(a.supported_color_modes) ? a.supported_color_modes : [];
  if (
    kind === 'light' &&
    (finite(a.brightness) ||
      modes.some((m) =>
        ['brightness', 'color_temp', 'hs', 'rgb', 'rgbw', 'rgbww', 'xy', 'white'].includes(
          String(m),
        ),
      ) ||
      (features & 1) !== 0)
  )
    capabilities.push('brightness');
  const colorModes = [...new Set(modes.filter((mode): mode is LightColorMode => typeof mode === 'string' && ['hs','rgb','rgbw','rgbww','xy'].includes(mode)))];
  if (kind === 'light' && colorModes.length) capabilities.push('color');
  const effects = Array.isArray(a.effect_list) ? [...new Set(a.effect_list.filter((effect): effect is string => typeof effect === 'string' && effect.length > 0))] : [];
  if (kind === 'light' && (features & 4) && effects.length) capabilities.push('effect');
  const hs = Array.isArray(a.hs_color) && a.hs_color.length === 2 && finite(a.hs_color[0]) && a.hs_color[0] >= 0 && a.hs_color[0] <= 360 && finite(a.hs_color[1]) && a.hs_color[1] >= 0 && a.hs_color[1] <= 100
    ? { hue: a.hs_color[0], saturation: a.hs_color[1] } : rgbToHueSaturation(a.rgb_color);
  if (kind === 'media') {
    if (features & 16384) capabilities.push('play');
    if (features & 1) capabilities.push('pause');
    if (features & 4) capabilities.push('volume');
    // Official MediaPlayerEntityFeature values: core/2026.9.1 media_player/const.py.
    if (features & 2) capabilities.push('seek');
    if (features & 128) capabilities.push('power_on');
    if (features & 256) capabilities.push('power_off');
    if (features & 32768) capabilities.push('shuffle');
    if (features & 262144) capabilities.push('repeat');
  }
  if (kind === 'climate' && features & 1 && finite(a.temperature)) capabilities.push('temperature');
  // HA ClimateEntityFeature.TARGET_TEMPERATURE_RANGE = 2 (2026.10.2).
  const rangeSupported = kind === 'climate' && !!(features & 2);
  if (rangeSupported && finite(a.target_temp_low) && finite(a.target_temp_high) && a.target_temp_low <= a.target_temp_high) capabilities.push('temperature_range');
  if (kind === 'cover') {
    // HA CoverEntityFeature tilt flags are independent of movement flags.
    if (features & 16) capabilities.push('tilt_open');
    if (features & 32) capabilities.push('tilt_close');
    if (features & 64) capabilities.push('tilt_stop');
    if (features & 128) capabilities.push('tilt');
    if (features & 1) capabilities.push('open');
    if (features & 2) capabilities.push('close');
    if (features & 8) capabilities.push('stop');
    if (features & 4 && finite(a.current_position)) capabilities.push('position');
  }
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  const options = strings(a.options);
  const hvacModes = strings(a.hvac_modes);
  const sources = strings(a.source_list);
  if (kind === 'number' && finite(a.min) && finite(a.max) && a.max > a.min && Number.isFinite(Number(state))) capabilities.push('number');
  if (kind === 'select' && options.length) capabilities.push('select');
  if (kind === 'climate' && hvacModes.length) capabilities.push('hvac_mode');
  if (kind === 'light' && modes.includes('color_temp') && finite(a.min_color_temp_kelvin) && finite(a.max_color_temp_kelvin)) capabilities.push('color_temperature');
  if (kind === 'media') {
    if (features & 32) capabilities.push('next');
    if (features & 16) capabilities.push('previous');
    if (features & 8) capabilities.push('mute');
    if (features & 2048 && sources.length) capabilities.push('source');
  }
  const mediaReady = kind === 'media' && !['off', 'standby'].includes(state);
  const duration = mediaReady && finite(a.media_duration) && a.media_duration > 0 ? a.media_duration : undefined;
  const elapsed = mediaReady && finite(a.media_position) && a.media_position >= 0 && (duration === undefined || a.media_position <= duration) ? a.media_position : undefined;
  const updatedAt = mediaReady && typeof a.media_position_updated_at === 'string' ? Date.parse(a.media_position_updated_at) : NaN;
  const repeatModes: MediaRepeatMode[] = kind === 'media' && (features & 262144) ? ['off', 'one', 'all'] : [];
  const raw = attribute ? a[attribute] : state;
  const rendered =
    attribute && entity && hass?.formatEntityAttributeValue
      ? hass.formatEntityAttributeValue(entity, attribute, raw)
      : text(raw);
  return {
    ...deviceOptionState,
    ...(update ?? {}),
    mediaGroupMembers: mediaGroups?.mediaGroupMembers,
    remoteActivity: remote?.remoteActivity, remoteActivities: remote?.remoteActivities,
    targetHumidity: kind === 'humidifier' && finite(a.humidity) && a.humidity >= minHumidity && a.humidity <= maxHumidity ? a.humidity : undefined,
    currentHumidity: kind === 'humidifier' && finite(a.current_humidity) && a.current_humidity >= 0 && a.current_humidity <= 100 ? a.current_humidity : undefined,
    minHumidity: kind === 'humidifier' ? minHumidity : undefined,
    maxHumidity: kind === 'humidifier' ? maxHumidity : undefined,
    stepHumidity: kind === 'humidifier' ? finite(a.target_humidity_step) && Number.isInteger(a.target_humidity_step) && a.target_humidity_step > 0 ? a.target_humidity_step : 1 : undefined,
    humidifierModes, humidifierMode: kind === 'humidifier' && typeof a.mode === 'string' ? a.mode : undefined,
    waterOperations, waterOperation: kind === 'water-heater' ? state : undefined,
    awayMode: kind === 'water-heater' && (a.away_mode === 'on' || a.away_mode === 'off') ? a.away_mode === 'on' : undefined,
    id: `home_assistant:${id}`,
    externalId: id,
    name: text(a.friendly_name) || id,
    fanPresets: kind === 'fan' ? fanPresets : undefined,
    fanPreset: kind === 'fan' && typeof a.preset_mode === 'string' ? a.preset_mode : undefined,
    oscillating: kind === 'fan' && typeof a.oscillating === 'boolean' ? a.oscillating : undefined,
    direction: kind === 'fan' && (a.direction === 'forward' || a.direction === 'reverse') ? a.direction : undefined,
    directions: kind === 'fan' && (features & 4) ? ['forward', 'reverse'] : undefined,
    speed: finite(a.percentage) ? clamp(a.percentage) : 0,
    battery: finite(a.battery_level) ? clamp(a.battery_level) : undefined,
    humidity: finite(a.humidity) ? a.humidity : undefined,
    deviceClass: text(a.device_class),
    areaName: hass?.areas?.[hass.entities?.[id]?.area_id ?? hass.devices?.[hass.entities?.[id]?.device_id ?? '']?.area_id ?? '']?.name,
    feelsLike: finite(a.apparent_temperature) ? a.apparent_temperature : undefined,
    cleanedArea: finite(a.cleaned_area) ? a.cleaned_area : undefined,
    cleaningMinutes: finite(a.cleaning_time) ? a.cleaning_time : undefined,
    textMax: finite(a.max) ? a.max : 255, textMin: finite(a.min) ? a.min : 0, secret: a.mode === 'password',
    state,
    value: a.mode === 'password' ? '••••' : rendered,
    unit: unit ?? (attribute ? '' : kind === 'weather' ? text(a.temperature_unit) : text(a.unit_of_measurement)),
    available: !!entity && state !== 'unavailable' && (state !== 'unknown' || ['scene', 'button'].includes(kind)),
    active: kind === 'water-heater' ? !['off','unknown','unavailable','missing'].includes(state) : [
      'on',
      'playing',
      'open',
      'opening',
      'closing',
      'heat',
      'cool',
      'auto',
      'heat_cool',
      'dry',
      'fan_only', 'home', 'cleaning', 'locked',
    ].includes(state),
    capabilities,
    number: Number.isFinite(Number(state)) ? Number(state) : undefined,
    minNumber: finite(a.min) ? a.min : undefined,
    maxNumber: finite(a.max) ? a.max : undefined,
    stepNumber: finite(a.step) && a.step > 0 ? a.step : 1,
    options, hvacModes, sources, source: text(a.source), muted: a.is_volume_muted === true,
    color: kind === 'light' && colorModes.length ? hs : undefined,
    colorModes: kind === 'light' ? colorModes : undefined,
    effects: kind === 'light' ? effects : undefined,
    effect: kind === 'light' && typeof a.effect === 'string' ? a.effect : undefined,
    color_temperature: finite(a.color_temp_kelvin) ? a.color_temp_kelvin : undefined,
    minKelvin: finite(a.min_color_temp_kelvin) ? a.min_color_temp_kelvin : undefined,
    maxKelvin: finite(a.max_color_temp_kelvin) ? a.max_color_temp_kelvin : undefined,
    brightness: finite(a.brightness) ? Math.round((clamp(a.brightness, 255) / 255) * 100) : 0,
    volume: finite(a.volume_level) ? Math.round(clamp(a.volume_level, 1) * 100) : 0,
    temperature: finite(a.temperature) && (kind !== 'water-heater' || finite(a.min_temp) && finite(a.max_temp) && a.temperature >= a.min_temp && a.temperature <= a.max_temp) ? a.temperature : undefined,
    targetTemperatureLow: rangeSupported && finite(a.target_temp_low) ? a.target_temp_low : undefined,
    targetTemperatureHigh: rangeSupported && finite(a.target_temp_high) ? a.target_temp_high : undefined,
    temperatureUnit: kind === 'climate' || kind === 'water-heater' ? hass?.config?.unit_system?.temperature ?? text(a.temperature_unit) : undefined,
    tiltPosition: kind === 'cover' && finite(a.current_tilt_position) && a.current_tilt_position >= 0 && a.current_tilt_position <= 100 ? a.current_tilt_position : undefined,
    minTemperature: finite(a.min_temp) ? a.min_temp : comfortKind ? undefined : 7,
    maxTemperature: finite(a.max_temp) ? a.max_temp : comfortKind ? undefined : 35,
    stepTemperature:
      finite(a.target_temp_step) && a.target_temp_step > 0 ? a.target_temp_step : kind === 'water-heater' ? 1 : 0.5,
    position: finite(a.current_position) ? clamp(a.current_position) : undefined,
    currentTemperature: finite(a.current_temperature) ? a.current_temperature : undefined,
    climateAction: text(a.hvac_action),
    artist: text(a.media_artist),
    artwork:
      resourceUrl(a.entity_picture)
        ? a.entity_picture
        : undefined,
    duration, elapsed,
    mediaPositionUpdatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined,
    repeatModes,
    repeat: mediaReady && repeatModes.includes(a.repeat as MediaRepeatMode) ? a.repeat as MediaRepeatMode : undefined,
    shuffle: mediaReady && typeof a.shuffle === 'boolean' ? a.shuffle : undefined,
    subtitle:
      kind === 'media'
        ? text(a.media_title)
        : kind === 'climate' && finite(a.current_temperature)
          ? `${a.current_temperature}${hass?.config?.unit_system?.temperature ?? '°C'}`
          : undefined,
  };
}
// Registry objects are replaced by HA on registry changes. State updates reuse them.
// Weak keys let disconnected hosts and old registries be collected.
const roomIndexes = new WeakMap<NonNullable<Hass['entities']>, WeakMap<object, Map<string, string[]>>>();
const noDevices = {};
export function roomEntityIds(hass: Hass, area: string | undefined, explicit?: string[]): string[] {
  if (explicit) return [...new Set(explicit)];
  if (!area || !hass.entities) return [];
  let byDevices = roomIndexes.get(hass.entities);
  if (!byDevices) roomIndexes.set(hass.entities, byDevices = new WeakMap());
  const devices = hass.devices ?? noDevices;
  let index = byDevices.get(devices);
  if (!index) {
    index = new Map();
    for (const [id, e] of Object.entries(hass.entities)) {
      if (!['light', 'switch', 'input_boolean', 'sensor', 'binary_sensor', 'climate', 'media_player', 'cover', 'number', 'input_number', 'select', 'input_select', 'fan', 'lock', 'vacuum', 'person', 'weather', 'scene', 'script', 'humidifier', 'water_heater', 'remote', 'update'].includes(id.split('.')[0]) || e.hidden_by || e.disabled_by || e.entity_category) continue;
      const owner = e.area_id ?? (e.device_id ? hass.devices?.[e.device_id]?.area_id : null);
      if (!owner) continue;
      const members = index.get(owner) ?? [];
      members.push(id);
      index.set(owner, members);
    }
    for (const members of index.values()) members.sort();
    byDevices.set(devices, index);
  }
  // Do not expose mutable cached arrays to consumers.
  return [...(index.get(area) ?? [])];
}
export function kindForEntity(id: string): CardKind {
  return (
    (
      {
        fan: 'fan', lock: 'lock', vacuum: 'vacuum', person: 'person', device_tracker: 'person', weather: 'weather',
        scene: 'scene', script: 'script', button: 'button', input_button: 'button', input_text: 'note', text: 'note', image: 'photo',
        light: 'light',
        switch: 'switch',
        input_boolean: 'switch',
        media_player: 'media',
        climate: 'climate', humidifier: 'humidifier', water_heater: 'water-heater', remote: 'remote', update: 'update',
        cover: 'cover',
        number: 'number', input_number: 'number', select: 'select', input_select: 'select',
      } as Record<string, CardKind>
    )[id.split('.')[0]] ?? 'sensor'
  );
}

/** Normalize service failures at the host boundary, including HA's plain WS errors. */
export async function callHostService(
  hass: Hass,
  domain: string,
  service: string,
  data: Record<string, unknown>,
  target: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await hass.callService(domain, service, data, target);
  } catch (error) {
    const details = error && typeof error === 'object' && 'error' in error ? error.error : error;
    if (
      details &&
      typeof details === 'object' &&
      'code' in details &&
      (details.code === 'unauthorized' ||
        (details.code === 'home_assistant_error' &&
          'message' in details &&
          details.message === 'Unauthorized'))
    )
      throw new PermissionDeniedError('You do not have permission to run this action.');
    throw error;
  }
}

export async function executeCommand(
  hass: Hass,
  entity: CardEntity,
  command: CardCommand,
): Promise<void> {
  if (!entity.available) throw new Error('This entity is unavailable.');
  const domain = entity.externalId.split('.')[0];
  const target = { entity_id: entity.externalId };
  let service: string;
  let data: Record<string, unknown> = {};
  if (command.type === 'update_install' || command.type === 'update_skip' || command.type === 'update_clear_skipped') {
    const intent = prepareUpdateCommand(hass,entity.externalId,command);
    await callHostService(hass,intent.domain,intent.service,intent.data,intent.target); return;
  }
  if (command.type === 'media_join' || command.type === 'media_unjoin') {
    const intent = prepareMediaGroupCommand(hass,entity.externalId,command);
    await callHostService(hass,intent.domain,intent.service,intent.data,intent.target); return;
  }
  if (domain === 'remote') {
    if (!['remote_activity','power_on','power_off'].includes(command.type)) throw new Error('This remote command is not supported.');
    const intent = prepareRemoteCommand(hass, entity.externalId, command as import('./remote').RemoteCommand);
    await callHostService(hass,intent.domain,intent.service,intent.data,intent.target); return;
  }
  // Comfort commands re-read the exact owner before interpreting capability flags.
  if (domain === 'humidifier' || domain === 'water_heater') {
    const raw = hass.states[entity.externalId];
    if (!raw || raw.entity_id !== entity.externalId) throw new Error('The owning comfort device is unavailable.');
    const current = mapEntity(raw, domain === 'humidifier' ? 'humidifier' : 'water-heater', entity.externalId, hass);
    if (!current.available || !current.capabilities.includes(command.type as Capability)) throw new Error('This comfort control is not supported.');
    if (command.type === 'power_on' || command.type === 'power_off') service = command.type === 'power_on' ? 'turn_on' : 'turn_off';
    else if (command.type === 'toggle' && domain === 'humidifier') service = current.state === 'on' ? 'turn_off' : 'turn_on';
    else if (command.type === 'humidity') {
      if (!Number.isInteger(command.value) || command.value < current.minHumidity! || command.value > current.maxHumidity!) throw new Error('Humidity is outside the supported integer range.');
      service = 'set_humidity'; data = { humidity: command.value };
    } else if (command.type === 'temperature') {
      if (!finite(command.value) || command.value < current.minTemperature! || command.value > current.maxTemperature!) throw new Error('Temperature is outside the supported range.');
      service = 'set_temperature'; data = { temperature: command.value };
    } else if (command.type === 'humidifier_mode' && current.humidifierModes?.includes(command.value)) { service = 'set_mode'; data = { mode: command.value }; }
    else if (command.type === 'water_operation' && current.waterOperations?.includes(command.value)) { service = 'set_operation_mode'; data = { operation_mode: command.value }; }
    else if (command.type === 'away_mode' && typeof command.value === 'boolean') { service = 'set_away_mode'; data = { away_mode: command.value }; }
    else throw new Error('This comfort option is not supported.');
    await callHostService(hass, domain, service, data, target); return;
  }
  switch (command.type) {
    case 'remote_activity': throw new Error('This command needs a remote.');
    case 'humidity':
    case 'humidifier_mode':
    case 'water_operation':
    case 'away_mode': throw new Error('This command needs a comfort device.');
    case 'seek':
    case 'repeat':
    case 'shuffle':
    case 'power_on':
    case 'power_off': {
      const raw = hass.states[entity.externalId];
      if (domain !== 'media_player' || !raw || raw.entity_id !== entity.externalId) throw new Error('The owning media player is unavailable.');
      const current = mapEntity(raw, 'media', entity.externalId, hass);
      if (!current.available) throw new Error('This media player is unavailable.');
      if (!current.capabilities.includes(command.type)) throw new Error('This media control is not supported.');
      if (command.type === 'power_on' || command.type === 'power_off') {
        service = command.type === 'power_on' ? 'turn_on' : 'turn_off';
      } else {
        if (['off','standby'].includes(current.state)) throw new Error('Turn on the media player before changing playback options.');
        if (command.type === 'seek') {
          if (!finite(current.duration) || !finite(current.elapsed) || !finite(command.value) || command.value < 0 || command.value > current.duration) throw new Error('Seek needs a known position and a target within the current duration.');
          service = 'media_seek'; data = { seek_position: command.value };
        } else if (command.type === 'repeat') {
          if (!current.repeatModes?.includes(command.value)) throw new Error('Repeat mode is not supported.');
          service = 'repeat_set'; data = { repeat: command.value };
        } else if (command.type === 'shuffle') {
          if (typeof command.value !== 'boolean') throw new Error('Shuffle must be true or false.');
          service = 'shuffle_set'; data = { shuffle: command.value };
        } else throw new Error('This media control is not supported.');
      }
      break;
    }
    case 'climate_preset':
    case 'climate_fan':
    case 'climate_swing':
    case 'climate_swing_horizontal':
    case 'vacuum_speed': {
      const spec = deviceOptions[command.type];
      const raw = hass.states[entity.externalId];
      if (domain !== spec.domain || !raw) throw new Error('This device is unavailable.');
      const current = mapEntity(raw, spec.domain, entity.externalId, hass);
      if (!current.available) throw new Error('This device is unavailable.');
      if (!current.capabilities.includes(command.type) || !current[spec.options]?.includes(command.value)) throw new Error('This device option is not supported.');
      service = spec.service; data = { [spec.parameter]: command.value }; break;
    }
    case 'fan_preset':
    case 'oscillate':
    case 'direction': {
      // Recheck the owning entity at dispatch: a host may replace capabilities or
      // options between rendering a selector and delivering its change event.
      const raw = hass.states[entity.externalId];
      if (domain !== 'fan' || !raw) throw new Error('This fan is unavailable.');
      const current = mapEntity(raw, 'fan', entity.externalId, hass);
      if (!current.available) throw new Error('This fan is unavailable.');
      if (!current.capabilities.includes(command.type)) throw new Error('This fan control is not supported.');
      if (command.type === 'fan_preset') {
        if (!current.fanPresets?.includes(command.value)) throw new Error('Fan preset is not supported.');
        service = 'set_preset_mode'; data = { preset_mode: command.value };
      } else if (command.type === 'direction') {
        if (!current.directions?.includes(command.value as 'forward' | 'reverse')) throw new Error('Fan direction is not supported.');
        service = 'set_direction'; data = { direction: command.value };
      } else {
        if (typeof command.value !== 'boolean') throw new Error('Oscillation must be true or false.');
        service = 'oscillate'; data = { oscillating: command.value };
      }
      break;
    }
    case 'temperature_range': {
      if (domain !== 'climate' || !entity.capabilities.includes('temperature_range')) throw new Error('Temperature range is not supported.');
      const min = entity.minTemperature, max = entity.maxTemperature, step = entity.stepTemperature;
      if (!finite(min) || !finite(max) || min >= max || !finite(step) || step <= 0 || !finite(command.low) || !finite(command.high) || command.low < min || command.high > max || command.low > command.high)
        throw new Error('Temperature range is outside the supported limits.');
      const aligned = (value: number) => Math.abs((value-min)/step - Math.round((value-min)/step)) <= 1e-7;
      if (!aligned(command.low) || !aligned(command.high)) throw new Error('Temperature range must follow the supported step.');
      service = 'set_temperature'; data = { target_temp_low: command.low, target_temp_high: command.high }; break;
    }
    case 'tilt':
      if (domain !== 'cover' || !entity.capabilities.includes('tilt')) throw new Error('Tilt position is not supported.');
      if (!finite(command.value) || command.value < 0 || command.value > 100) throw new Error('Tilt position must be between 0 and 100.');
      service = 'set_cover_tilt_position'; data = { tilt_position: command.value }; break;
    case 'tilt_open':
    case 'tilt_close':
    case 'tilt_stop':
      if (domain !== 'cover' || !entity.capabilities.includes(command.type)) throw new Error('This tilt control is not supported.');
      service = command.type === 'tilt_open' ? 'open_cover_tilt' : command.type === 'tilt_close' ? 'close_cover_tilt' : 'stop_cover_tilt'; break;
    case 'color': {
      if (domain !== 'light' || !entity.capabilities.includes('color') || !entity.colorModes?.length) throw new Error('Color is not supported.');
      if (!finite(command.hue) || command.hue < 0 || command.hue > 360 || !finite(command.saturation) || command.saturation < 0 || command.saturation > 100) throw new Error('Color is outside the supported range.');
      service = 'turn_on';
      // One color parameter per call. HA translates HS for XY/RGBW/RGBWW devices.
      // https://contributors.home-assistant.io/core/entities/light/#turn-on
      data = !entity.colorModes.includes('hs') && entity.colorModes.includes('rgb')
        ? { rgb_color: hueSaturationToRgb(command.hue, command.saturation) }
        : { hs_color: [command.hue, command.saturation] };
      break;
    }
    case 'effect':
      if (domain !== 'light' || !entity.capabilities.includes('effect') || !entity.effects?.includes(command.value)) throw new Error('Effect is not supported.');
      service = 'turn_on'; data = { effect: command.value }; break;
    case 'speed':
      if (!entity.capabilities.includes('speed') || !Number.isFinite(command.value) || command.value < 0 || command.value > 100) throw new Error('Speed is not supported or outside the supported range.');
      service = 'set_percentage'; data = { percentage: command.value }; break;
    case 'lock':
    case 'unlock':
    case 'start':
    case 'return_home':
    case 'activate':
      if (!entity.capabilities.includes(command.type)) throw new Error('This control is not supported.');
      service = command.type === 'activate' ? (['button', 'input_button'].includes(domain) ? 'press' : 'turn_on') : command.type === 'return_home' ? 'return_to_base' : command.type; break;
    case 'text':
      if (!entity.capabilities.includes('text') || command.value.length < (entity.textMin ?? 0) || command.value.length > (entity.textMax ?? 255)) throw new Error('Note length is outside the supported range.');
      service = 'set_value'; data = { value: command.value }; break;
    case 'pause':
      if (domain !== 'vacuum' || !entity.capabilities.includes('pause')) throw new Error('Pause is not supported.');
      service = 'pause'; break;
    case 'number':
    case 'color_temperature': {
      if (!entity.capabilities.includes(command.type)) throw new Error('This control is not supported.');
      const min = command.type === 'number' ? entity.minNumber! : entity.minKelvin!;
      const max = command.type === 'number' ? entity.maxNumber! : entity.maxKelvin!;
      if (!Number.isFinite(command.value) || command.value < min || command.value > max) throw new Error('Value is outside the supported range.');
      service = command.type === 'number' ? 'set_value' : 'turn_on';
      data = command.type === 'number' ? { value: command.value } : { color_temp_kelvin: command.value };
      break;
    }
    case 'select':
    case 'hvac_mode':
    case 'source': {
      const options = command.type === 'select' ? entity.options : command.type === 'hvac_mode' ? entity.hvacModes : entity.sources;
      if (!entity.capabilities.includes(command.type) || !options?.includes(command.value)) throw new Error('Option is not supported.');
      service = command.type === 'select' ? 'select_option' : command.type === 'hvac_mode' ? 'set_hvac_mode' : 'select_source';
      data = { [command.type === 'select' ? 'option' : command.type === 'hvac_mode' ? 'hvac_mode' : 'source']: command.value };
      break;
    }
    case 'next':
    case 'previous':
    case 'mute':
      if (!entity.capabilities.includes(command.type)) throw new Error('This control is not supported.');
      service = command.type === 'next' ? 'media_next_track' : command.type === 'previous' ? 'media_previous_track' : 'volume_mute';
      if (command.type === 'mute') data = { is_volume_muted: !entity.muted };
      break;
    case 'toggle':
      if (!entity.capabilities.includes('toggle')) throw new Error('Toggle is not supported.');
      service = entity.active ? 'turn_off' : 'turn_on';
      break;
    case 'brightness':
      if (!entity.capabilities.includes('brightness'))
        throw new Error('Brightness is not supported.');
      if (!Number.isFinite(command.value)) throw new Error('Brightness must be a number.');
      service = command.value <= 0 ? 'turn_off' : 'turn_on';
      if (command.value > 0) data = { brightness_pct: clamp(command.value) };
      break;
    case 'play_pause': {
      const capability = entity.state === 'playing' ? 'pause' : 'play';
      if (!entity.capabilities.includes(capability)) throw new Error('Playback is not supported.');
      service = entity.state === 'playing' ? 'media_pause' : 'media_play';
      break;
    }
    case 'volume':
      if (!entity.capabilities.includes('volume')) throw new Error('Volume is not supported.');
      if (!Number.isFinite(command.value)) throw new Error('Volume must be a number.');
      service = 'volume_set';
      data = { volume_level: clamp(command.value) / 100 };
      break;
    case 'temperature':
      if (!entity.capabilities.includes('temperature'))
        throw new Error('Temperature is not supported.');
      if (
        !Number.isFinite(command.value) ||
        command.value < entity.minTemperature! ||
        command.value > entity.maxTemperature!
      )
        throw new Error('Temperature is outside the supported range.');
      service = 'set_temperature';
      data = { temperature: command.value };
      break;
    case 'position':
      if (!entity.capabilities.includes('position')) throw new Error('Position is not supported.');
      if (!Number.isFinite(command.value)) throw new Error('Position must be a number.');
      service = 'set_cover_position';
      data = { position: clamp(command.value) };
      break;
    default:
      if (!entity.capabilities.includes(command.type))
        throw new Error('This control is not supported.');
      service = domain === 'vacuum' && command.type === 'stop' ? 'stop' : `${command.type}_cover`;
  }
  await callHostService(hass, domain, service, data, target);
}

/** Ask the host to load its own editor components; the standalone preview keeps its fallback. */
export async function prepareHostEditor(): Promise<void> {
  if (customElements.get('ha-form')) return;
  const host = window as Window & { loadCardHelpers?: () => Promise<{ createCardElement(config: Record<string, unknown>): HTMLElement }> };
  if (!host.loadCardHelpers) return;
  try {
    const helpers = await host.loadCardHelpers();
    const tile = helpers.createCardElement({ type: 'tile', entity: 'sensor.navet_editor' });
    const constructor = tile.constructor as typeof HTMLElement & { getConfigElement?: () => HTMLElement | Promise<HTMLElement> };
    await constructor.getConfigElement?.();
  } catch {
    // Custom cards must remain editable when host UI components cannot be loaded.
  }
}

/** RGB state is a fallback when a host omits HA's converted HS attribute. */
function rgbToHueSaturation(raw: unknown): { hue: number; saturation: number } | undefined {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(v => finite(v) && v >= 0 && v <= 255)) return undefined;
  const [r,g,b] = raw.map(v => v / 255);
  const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max - min;
  const h = !delta ? 0 : max === r ? ((g-b)/delta) % 6 : max === g ? (b-r)/delta + 2 : (r-g)/delta + 4;
  return { hue: (h * 60 + 360) % 360, saturation: max === 0 ? 0 : delta / max * 100 };
}
function hueSaturationToRgb(hue: number, saturation: number): number[] {
  const h = (hue % 360) / 60, s = saturation / 100;
  const x = s * (1 - Math.abs(h % 2 - 1)), m = 1-s;
  const channels = h < 1 ? [s,x,0] : h < 2 ? [x,s,0] : h < 3 ? [0,s,x] : h < 4 ? [0,x,s] : h < 5 ? [x,0,s] : [s,0,x];
  return channels.map(v => Math.round((v + m) * 255));
}
