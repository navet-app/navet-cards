import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapEntity, executeCommand, type Hass } from '../src/providers/home-assistant';
import type { CardCommand } from '../src/core';

const climate = (attributes: Record<string, unknown> = {}, state = 'heat_cool') => mapEntity({ entity_id: 'climate.dining', state, attributes: {
  supported_features: 2, target_temp_low: 18, target_temp_high: 24, min_temp: 7, max_temp: 30, target_temp_step: 0.5, ...attributes,
} }, 'climate', 'climate.dining');
const cover = (supported_features: number, current_tilt_position?: number) => mapEntity({ entity_id: 'cover.dining', state: 'open', attributes: { supported_features, current_tilt_position } }, 'cover', 'cover.dining');
const recorder = () => {
  const calls: unknown[][] = [];
  const host: Hass = { states: {}, async callService(...args) { calls.push(args); } };
  return { host, calls };
};

test('temperature range requires the feature and a valid reported pair; single targets remain separate', () => {
  assert.ok(climate().capabilities.includes('temperature_range'));
  assert.equal(climate().targetTemperatureLow, 18);
  assert.equal(climate().targetTemperatureHigh, 24);
  const single = climate({ supported_features: 1, temperature: 22 });
  assert.ok(single.capabilities.includes('temperature'));
  assert.ok(!single.capabilities.includes('temperature_range'));
  assert.equal(single.targetTemperatureLow, undefined);
  for (const attributes of [{ target_temp_high: null }, { target_temp_low: NaN }, { target_temp_low: 26, target_temp_high: 20 }]) assert.ok(!climate(attributes).capabilities.includes('temperature_range'));
});

test('range command submits the atomic ordered pair to its owning climate without changing HVAC mode', async () => {
  const { host, calls } = recorder();
  await executeCommand(host, climate(), { type: 'temperature_range', low: 18.5, high: 24.5 });
  assert.deepEqual(calls, [['climate', 'set_temperature', { target_temp_low: 18.5, target_temp_high: 24.5 }, { entity_id: 'climate.dining' }]]);
  await executeCommand(host, climate({ min_temp: 50, max_temp: 90, target_temp_step: 1, target_temp_low: 65, target_temp_high: 75 }), { type: 'temperature_range', low: 66, high: 76 });
  assert.deepEqual(calls.at(-1), ['climate', 'set_temperature', { target_temp_low: 66, target_temp_high: 76 }, { entity_id: 'climate.dining' }]);
  // HA permits equal endpoints and floating point step arithmetic.
  await executeCommand(host, climate({ min_temp: 7.1, target_temp_step: 0.1 }), { type: 'temperature_range', low: 18.2, high: 18.2 });
});

test('range limits, step, availability and feature rejection occur before any host call', async () => {
  const { host, calls } = recorder();
  for (const command of [
    { type: 'temperature_range', low: 25, high: 20 },
    { type: 'temperature_range', low: 6, high: 22 },
    { type: 'temperature_range', low: 18, high: 31 },
    { type: 'temperature_range', low: NaN, high: 24 },
    { type: 'temperature_range', low: 18, high: Infinity },
    { type: 'temperature_range', low: 18.1, high: 24 },
  ] as CardCommand[]) await assert.rejects(executeCommand(host, climate(), command));
  await assert.rejects(executeCommand(host, climate({ supported_features: 1 }), { type: 'temperature_range', low: 18, high: 24 }));
  await assert.rejects(executeCommand(host, climate({}, 'unavailable'), { type: 'temperature_range', low: 18, high: 24 }));
  assert.deepEqual(calls, []);
});

test('tilt capabilities are independent of cover movement and use exact owning-cover services', async () => {
  const { host, calls } = recorder();
  const model = cover(16 | 32 | 64 | 128, 40);
  assert.equal(model.tiltPosition, 40);
  assert.ok(!model.capabilities.includes('open'));
  for (const [command, service, data] of [
    [{ type: 'tilt', value: 65 }, 'set_cover_tilt_position', { tilt_position: 65 }],
    [{ type: 'tilt_open' }, 'open_cover_tilt', {}],
    [{ type: 'tilt_close' }, 'close_cover_tilt', {}],
    [{ type: 'tilt_stop' }, 'stop_cover_tilt', {}],
  ] as [CardCommand, string, Record<string, unknown>][]) {
    await executeCommand(host, model, command);
    assert.deepEqual(calls.at(-1), ['cover', service, data, { entity_id: 'cover.dining' }]);
  }
});

test('unknown tilt positions remain unknown; each unsupported tilt action is rejected', async () => {
  const { host, calls } = recorder();
  assert.equal(cover(128).tiltPosition, undefined);
  assert.equal(cover(128, 101).tiltPosition, undefined);
  for (const command of [{ type: 'tilt', value: -1 }, { type: 'tilt', value: 101 }, { type: 'tilt', value: NaN }] as CardCommand[]) await assert.rejects(executeCommand(host, cover(128, 40), command));
  for (const command of [{ type: 'tilt', value: 50 }, { type: 'tilt_open' }, { type: 'tilt_close' }, { type: 'tilt_stop' }] as CardCommand[]) await assert.rejects(executeCommand(host, cover(15, 40), command));
  assert.deepEqual(calls, []);
});
