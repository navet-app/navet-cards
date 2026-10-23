import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCondition, conditionEntityIds, evaluateCondition, validateCondition } from '../src/conditions/index';

const states = {
  'sensor.temperature': { state: '21.5', attributes: { temperature: 19, empty: '', missing: null, flag: false } },
  'light.kitchen': { state: 'on' },
  'switch.offline': { state: 'unavailable' },
  'sensor.unknown': { state: 'unknown' },
};

test('conditions preserve legacy exact states and explicit missing/availability semantics', () => {
  assert.equal(evaluateCondition(undefined, states), true);
  assert.equal(evaluateCondition({ entity: 'light.kitchen', state: 'on' }, states), true);
  assert.equal(evaluateCondition({ entity: 'light.missing', state: 'off' }, states), false);
  assert.equal(evaluateCondition({ entity: 'switch.offline', state: 'unavailable' }, states), true);
  for (const entity of ['light.missing', 'switch.offline', 'sensor.unknown']) {
    assert.equal(evaluateCondition({ entity, available: false }, states), true);
    assert.equal(evaluateCondition({ entity, available: true }, states), false);
  }
});

test('numeric ranges are exclusive and reject missing, empty, nonnumeric and unavailable values', () => {
  assert.equal(evaluateCondition({ entity: 'sensor.temperature', above: 20, below: 22 }, states), true);
  assert.equal(evaluateCondition({ entity: 'sensor.temperature', above: 21.5 }, states), false);
  assert.equal(evaluateCondition({ entity: 'sensor.temperature', below: 21.5 }, states), false);
  assert.equal(evaluateCondition({ entity: 'sensor.temperature', attribute: 'temperature', below: 20 }, states), true);
  for (const attribute of ['empty', 'missing', 'flag', 'absent']) assert.equal(evaluateCondition({ entity: 'sensor.temperature', attribute, above: -1 }, states), false);
  assert.equal(evaluateCondition({ entity: 'switch.offline', above: -1 }, states), false);
});

test('compiled composite conditions deduplicate dependencies and snapshot configuration', () => {
  const source = { all: [
    { entity: 'light.kitchen', state: 'on' },
    { any: [{ entity: 'sensor.temperature', above: 20 }, { entity: 'light.kitchen', state: 'off' }] },
    { not: { entity: 'switch.offline', available: true } },
  ] };
  const compiled = compileCondition(source);
  assert.deepEqual(compiled.entities, ['light.kitchen', 'sensor.temperature', 'switch.offline']);
  assert.deepEqual(conditionEntityIds(validateCondition(source)), compiled.entities);
  source.all[0].state = 'off';
  assert.equal(compiled.evaluate(states), true);
  assert.equal(compiled.evaluate({ ...states, 'light.kitchen': { state: 'off' } }), false);
});

test('invalid expressions fail before runtime evaluation', () => {
  for (const value of [null, [], {}, { all: [] }, { any: 'bad' }, { not: {} },
    { entity: 'bad', state: 'on' }, { entity: 'light.kitchen', state: true },
    { entity: 'light.kitchen', available: 'yes' }, { entity: 'light.kitchen' },
    { entity: 'light.kitchen', above: Infinity }, { entity: 'light.kitchen', above: 10, below: 5 },
    { entity: 'light.kitchen', above: 0, attribute: '' },
    { entity: 'light.kitchen', state: 'on', available: true },
    { entity: 'light.kitchen', state: 'on', all: [{ entity: 'light.kitchen', state: 'on' }] },
  ]) assert.throws(() => validateCondition(value));
  let deep: unknown = { entity: 'light.kitchen', state: 'on' };
  for (let i = 0; i < 10; i++) deep = { not: deep };
  assert.throws(() => validateCondition(deep));
  assert.throws(() => validateCondition({ all: Array.from({ length: 24 }, () => ({ any: Array.from({ length: 24 }, () => ({ entity: 'light.kitchen', state: 'on' })) })) }), /256/);
});

test('attribute equality compares own literal scalar values with strict types', () => {
  const attributes = Object.assign(Object.create({ inherited: true }), { flag: false, count: 0, text: '0', nullable: null, 'literal.key': true, literal: { key: false } });
  const host = { 'sensor.test': { state: 'on', attributes } };
  for (const [attribute, equals] of [['flag', false], ['count', 0], ['text', '0'], ['nullable', null], ['literal.key', true]] as const)
    assert.equal(evaluateCondition(validateCondition({ entity: 'sensor.test', attribute, equals }), host), true);
  for (const [attribute, equals] of [['flag', 'false'], ['count', '0'], ['text', 0], ['absent', null], ['inherited', true], ['literal.key', false], ['literal', null]] as const)
    assert.equal(evaluateCondition(validateCondition({ entity: 'sensor.test', attribute, equals }), host), false);
  for (const state of ['unavailable', 'unknown'])
    assert.equal(evaluateCondition({ entity: 'sensor.test', attribute: 'nullable', equals: null }, { 'sensor.test': { state, attributes } }), false);
  assert.equal(evaluateCondition({ entity: 'sensor.missing', attribute: 'nullable', equals: null }, host), false);
});

test('attribute equality validates its shape and preserves foreign fields in compiled snapshots', () => {
  for (const condition of [
    { entity: 'sensor.test', equals: 5 }, { entity: 'sensor.test', attribute: ' ', equals: null },
    ...[[], {}, undefined, Infinity, NaN].map((equals) => ({ entity: 'sensor.test', attribute: 'value', equals })),
    ...[{ state: 'on' }, { available: true }, { above: 1 }, { below: 4 }].map((extra) => ({ entity: 'sensor.test', attribute: 'value', equals: 3, ...extra })),
    { entity: 'sensor.test', state: 'on', attribute: 'flag' }, { entity: 'sensor.test', available: true, attribute: 'flag' },
  ]) assert.throws(() => validateCondition(condition));
  const input = { entity: 'sensor.test', attribute: 'flag', equals: false, future: { keep: true } };
  assert.deepEqual(validateCondition(input), input);
  const compiled = compileCondition(input);
  input.equals = true;
  assert.deepEqual(compiled.entities, ['sensor.test']);
  assert.equal(compiled.evaluate({ 'sensor.test': { state: 'on', attributes: { flag: false } } }), true);
});
