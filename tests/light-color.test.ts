import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, mapEntity, type Hass, type HassEntity } from '../src/providers/home-assistant';
import type { CardCommand } from '../src/core';

const light = (attributes: Record<string, unknown>, state = 'on'): HassEntity => ({ entity_id: 'light.color', state, attributes });
const mapped = (attributes: Record<string, unknown>, state = 'on') => mapEntity(light(attributes, state), 'light', 'light.color');
const recorder = () => {
  const calls: unknown[][] = [];
  const host: Hass = { states: {}, async callService(...args) { calls.push(args); } };
  return { host, calls };
};

test('color capability comes from declared modes, not incidental converted state attributes', () => {
  for (const mode of ['hs', 'rgb', 'xy', 'rgbw', 'rgbww']) {
    const entity = mapped({ supported_color_modes: [mode], hs_color: [32, 70] });
    assert.ok(entity.capabilities.includes('color'));
    assert.deepEqual(entity.color, { hue: 32, saturation: 70 });
  }
  for (const mode of ['onoff', 'brightness', 'color_temp', 'white', 'unknown']) {
    const entity = mapped({ supported_color_modes: [mode], hs_color: [32, 70], rgb_color: [255, 0, 0] });
    assert.ok(!entity.capabilities.includes('color'));
    assert.equal(entity.color, undefined);
  }
});

test('normalized RGB fallback derives hue and saturation without treating brightness as saturation', () => {
  assert.deepEqual(mapped({ supported_color_modes: ['rgb'], rgb_color: [0, 64, 0] }).color, { hue: 120, saturation: 100 });
  assert.deepEqual(mapped({ supported_color_modes: ['rgb'], rgb_color: [64, 64, 64] }).color, { hue: 0, saturation: 0 });
  assert.deepEqual(mapped({ supported_color_modes: ['rgb'], rgb_color: [0, 0, 0] }).color, { hue: 0, saturation: 0 });
  assert.equal(mapped({ supported_color_modes: ['rgb'], hs_color: [NaN, 20], rgb_color: [256, 0, 0] }).color, undefined);
});

test('color commands route one supported color parameter without changing brightness or temperature', async () => {
  const { host, calls } = recorder();
  for (const mode of ['hs', 'xy', 'rgbw', 'rgbww']) {
    await executeCommand(host, mapped({ supported_color_modes: [mode], brightness: 128, color_temp_kelvin: 3000 }), { type: 'color', hue: 120, saturation: 100 });
    assert.deepEqual(calls.at(-1), ['light', 'turn_on', { hs_color: [120, 100] }, { entity_id: 'light.color' }]);
  }
  await executeCommand(host, mapped({ supported_color_modes: ['rgb'] }), { type: 'color', hue: 120, saturation: 100 });
  assert.deepEqual(calls.at(-1), ['light', 'turn_on', { rgb_color: [0, 255, 0] }, { entity_id: 'light.color' }]);
  await executeCommand(host, mapped({ supported_color_modes: ['rgb'] }), { type: 'color', hue: 360, saturation: 0 });
  assert.deepEqual(calls.at(-1), ['light', 'turn_on', { rgb_color: [255, 255, 255] }, { entity_id: 'light.color' }]);
});

test('invalid, unavailable and unsupported color commands fail before any host call', async () => {
  const { host, calls } = recorder();
  const entity = mapped({ supported_color_modes: ['hs'] });
  for (const command of [
    { type: 'color', hue: -1, saturation: 50 }, { type: 'color', hue: 361, saturation: 50 },
    { type: 'color', hue: NaN, saturation: 50 }, { type: 'color', hue: 20, saturation: Infinity },
    { type: 'color', hue: 20, saturation: -1 }, { type: 'color', hue: 20, saturation: 101 },
  ] as CardCommand[]) await assert.rejects(executeCommand(host, entity, command));
  await assert.rejects(executeCommand(host, mapped({ supported_color_modes: ['color_temp'] }), { type: 'color', hue: 20, saturation: 30 }));
  await assert.rejects(executeCommand(host, mapped({ supported_color_modes: ['hs'] }, 'unavailable'), { type: 'color', hue: 20, saturation: 30 }));
  assert.deepEqual(calls, []);
});

test('effects require the feature flag and current list, including off only when explicitly offered', async () => {
  const { host, calls } = recorder();
  const attributes = { supported_color_modes: ['hs'], supported_features: 4, effect_list: ['off', 'Candle', 'Candle', '', null], effect: 'Candle' };
  const entity = mapped(attributes);
  assert.ok(entity.capabilities.includes('effect'));
  assert.deepEqual(entity.effects, ['off', 'Candle']);
  assert.equal(entity.effect, 'Candle');
  await executeCommand(host, entity, { type: 'effect', value: 'off' });
  assert.deepEqual(calls, [['light', 'turn_on', { effect: 'off' }, { entity_id: 'light.color' }]]);
  await assert.rejects(executeCommand(host, entity, { type: 'effect', value: 'rainbow' }));
  await assert.rejects(executeCommand(host, mapped({ ...attributes, supported_features: 0 }), { type: 'effect', value: 'Candle' }));
  assert.equal(calls.length, 1);
  assert.ok(!mapped({ supported_features: 4, effect_list: [] }).capabilities.includes('effect'));
});
