/** Simulated HA data, deliberately distinct from demo defaults; never live-device evidence. */
const state = (entity_id: string, value: string, attributes: Record<string, unknown>) => ({
  entity_id, state: value, attributes,
});

export const kitchenFixture = {
  language: 'en',
  locale: { language: 'en' },
  config: { unit_system: { temperature: '°C' } },
  areas: { kitchen: { name: 'Kitchen and dining' }, hall: { name: 'Hall' } },
  devices: { ceiling: { area_id: 'kitchen' }, climate: { area_id: 'kitchen' }, hall: { area_id: 'hall' } },
  entities: {
    'light.kitchen_ceiling': { device_id: 'ceiling' },
    'switch.kitchen_coffee': { area_id: 'kitchen' },
    'sensor.kitchen_temperature': { device_id: 'climate' },
    'binary_sensor.kitchen_window': { area_id: 'kitchen' },
    'cover.kitchen_blind': { area_id: 'kitchen' },
    'climate.kitchen_radiator': { device_id: 'climate' },
    'media_player.kitchen_radio': { area_id: 'kitchen' },
    // An explicit entity area overrides its device's kitchen assignment.
    'light.hall_override': { device_id: 'ceiling', area_id: 'hall' },
    'sensor.kitchen_battery': { area_id: 'kitchen', entity_category: 'diagnostic' },
    'switch.kitchen_hidden': { area_id: 'kitchen', hidden_by: 'user' },
    'switch.kitchen_disabled': { area_id: 'kitchen', disabled_by: 'integration' },
    'sensor.hall_motion': { device_id: 'hall' },
  },
  states: {
    'light.kitchen_ceiling': state('light.kitchen_ceiling', 'on', { friendly_name: 'Ceiling pendants', supported_color_modes: ['color_temp', 'hs'], color_mode: 'hs', brightness: 153, hs_color: [32, 70], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 }),
    'switch.kitchen_coffee': state('switch.kitchen_coffee', 'off', { friendly_name: 'Espresso machine' }),
    'sensor.kitchen_temperature': state('sensor.kitchen_temperature', '21.3', { friendly_name: 'Room temperature', device_class: 'temperature', state_class: 'measurement', unit_of_measurement: '°C' }),
    'binary_sensor.kitchen_window': state('binary_sensor.kitchen_window', 'off', { friendly_name: 'Window contact', device_class: 'window' }),
    'cover.kitchen_blind': state('cover.kitchen_blind', 'open', { friendly_name: 'Dining blind', device_class: 'blind', supported_features: 15, current_position: 60 }),
    'climate.kitchen_radiator': state('climate.kitchen_radiator', 'heat', { friendly_name: 'Radiator', supported_features: 1, hvac_modes: ['off', 'heat'], current_temperature: 21.3, temperature: 22, min_temp: 7, max_temp: 30, target_temp_step: 0.5 }),
    'media_player.kitchen_radio': state('media_player.kitchen_radio', 'unavailable', { friendly_name: 'Kitchen radio', supported_features: 16389 }),
    'light.hall_override': state('light.hall_override', 'off', { friendly_name: 'Hall pendant', supported_color_modes: ['onoff'] }),
    'sensor.kitchen_battery': state('sensor.kitchen_battery', '85', { friendly_name: 'Battery diagnostic', device_class: 'battery', unit_of_measurement: '%' }),
    'switch.kitchen_hidden': state('switch.kitchen_hidden', 'off', { friendly_name: 'Hidden outlet' }),
    'switch.kitchen_disabled': state('switch.kitchen_disabled', 'unavailable', { friendly_name: 'Disabled outlet' }),
    'sensor.hall_motion': state('sensor.hall_motion', '0', { friendly_name: 'Hall counter' }),
  },
};

export const kitchenMemberNames = ['Window contact', 'Radiator', 'Dining blind', 'Ceiling pendants', 'Kitchen radio', 'Room temperature', 'Espresso machine'];

/** Advanced fields must survive every visual edit and saved-config reopen. */
export const legacyKitchenConfig = {
  type: 'custom:navet-room-card', area: 'kitchen', name: 'Kitchen and dining', panel_id: '#fixture-kitchen',
  appearance: { accent: '#c98b55', radius: 20 },
  hold_action: { action: 'perform-action', perform_action: 'scene.turn_on', target: { entity_id: 'scene.kitchen_evening' }, data: { transition: 2 } },
  grid_options: { columns: 12, rows: 3 },
  custom_field: { revision: 1, preserve: ['future', { nested: true }] },
};
