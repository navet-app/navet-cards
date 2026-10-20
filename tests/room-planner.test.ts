import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomCatalog } from '../src/providers/room-catalog';
import { planRoom, resolveRoomMemberIds, roomMemberId } from '../src/rooms/planner';
import { validateConfig, type CardConfig } from '../src/config';
import type { Hass } from '../src/providers/home-assistant';
import { kitchenFixture, legacyKitchenConfig } from './fixtures/kitchen';

const host = (): Hass => ({ ...structuredClone(kitchenFixture), async callService() { throw new Error('Planner must not call host services'); } });
const config = (): CardConfig => ({ type: 'custom:navet-room-card', config_version: 2, area: 'kitchen', room: { membership: { mode: 'area' } } });

test('catalog reuses area index ownership and filters diagnostic/hidden/disabled candidates', () => {
  const hass = host();
  const catalog = createRoomCatalog(hass);
  const plan = planRoom(config(), catalog);
  assert.equal(plan.members.length, 7);
  assert.equal(plan.memberIds.includes('light.hall_override'), false);
  assert.equal(catalog.entityIds.includes('switch.kitchen_hidden'), false);
  assert.equal(catalog.entityIds.includes('switch.kitchen_disabled'), false);
  assert.equal(catalog.entityIds.includes('sensor.kitchen_battery'), false);
  assert.equal(plan.members.find((member) => member.entity === 'sensor.kitchen_temperature')?.role, 'temperature');
  assert.equal(plan.members.find((member) => member.entity === 'binary_sensor.kitchen_window')?.role, 'window');
  assert.equal(plan.members.find((member) => member.entity === 'media_player.kitchen_radio')?.model.available, false);
  hass.devices = { ...hass.devices, climate: { area_id: 'hall' } };
  assert.equal(planRoom(config(), createRoomCatalog(hass)).members.length, 5);
});

test('legacy flat order and explicit membership precedence remain unchanged', () => {
  const catalog = createRoomCatalog(host());
  const legacy = validateConfig({ ...legacyKitchenConfig, entities: ['switch.kitchen_coffee', 'light.hall_override', 'switch.kitchen_coffee'] }, 'room');
  const plan = planRoom(legacy, catalog);
  assert.equal(plan.legacy, true);
  assert.deepEqual(plan.memberIds, ['switch.kitchen_coffee', 'light.hall_override']);
  assert.equal(plan.sections.length, 1);
  assert.equal(plan.sections[0].name, '');
  assert.deepEqual(plan.sections[0].members, plan.members);
});

test('v2 exclusions win inclusions and explicit empty membership is deterministic', () => {
  const catalog = createRoomCatalog(host());
  const input = config();
  input.entities = ['light.legacy'];
  input.room!.membership = { mode: 'explicit', entities: [], include: ['light.hall_override', 'switch.kitchen_coffee'], exclude: ['switch.kitchen_coffee'] };
  assert.deepEqual(resolveRoomMemberIds(input, catalog), ['light.hall_override']);
  assert.deepEqual(planRoom(input, catalog).memberIds, ['light.hall_override']);
  input.room!.membership.include = [];
  assert.deepEqual(planRoom(input, catalog).sections, []);
});

test('ordered custom sections and overrides normalize models without mutation', () => {
  const hass = host();
  const input = config();
  input.room!.members = [
    { id: 'coffee', entity: 'switch.kitchen_coffee', name: 'Morning coffee', control: 'toggle', recipe: 'kitchen' },
    { id: 'temperature', entity: 'sensor.kitchen_temperature', name: 'Air', control: 'slider' },
  ];
  input.room!.sections = [{ id: 'first', name: 'Morning', members: ['coffee', 'temperature'] }, { id: 'empty', name: 'Later', members: [] }];
  const before = structuredClone({ input, states: hass.states });
  const plan = planRoom(input, createRoomCatalog(hass));
  assert.deepEqual(plan.sections.map((section) => section.id), ['first', 'empty']);
  assert.deepEqual(plan.sections[0].members.map((member) => member.model.name), ['Morning coffee', 'Air']);
  assert.equal(plan.sections[0].members[1].control, 'state');
  assert.equal(plan.diagnostics.some((item) => item.code === 'unsupported_control'), true);
  assert.deepEqual({ input, states: hass.states }, before);
  assert.deepEqual(planRoom(input, createRoomCatalog(hass)), plan);
});

test('missing entities, ambiguous roles and missing registries produce explicit diagnostics', () => {
  const hass = host();
  const input = config();
  input.room!.membership = { mode: 'explicit', entities: ['sensor.kitchen_temperature', 'sensor.other', 'sensor.missing'] };
  hass.states['sensor.other'] = { entity_id: 'sensor.other', state: '20', attributes: { device_class: 'temperature' } };
  const plan = planRoom(input, createRoomCatalog(hass));
  assert.ok(plan.diagnostics.some((item) => item.code === 'ambiguous_role'));
  assert.ok(plan.diagnostics.some((item) => item.code === 'missing_entity' && item.entity === 'sensor.missing'));
  delete hass.entities;
  assert.ok(planRoom(config(), createRoomCatalog(hass)).diagnostics.some((item) => item.code === 'registry_unavailable'));
});

test('membership resolution never enumerates states or maps unrelated models', () => {
  const hass = host();
  const input = config();
  const expected = resolveRoomMemberIds(input, { areaEntityIds: (area) => createRoomCatalog(hass).areaEntityIds(area) });
  const forbiddenStates = new Proxy({}, { ownKeys() { throw new Error('Unrelated state enumeration'); } });
  hass.states = forbiddenStates;
  const actual = resolveRoomMemberIds(input, { areaEntityIds: (area) => createRoomCatalog(hass).areaEntityIds(area) });
  assert.deepEqual(actual, expected);
  assert.ok(roomMemberId(`sensor.${'a'.repeat(100)}`).length <= 64);
});
