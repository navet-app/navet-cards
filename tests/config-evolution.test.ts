import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configDiagnostics, ConfigValidationError, validateConfig, type CardConfig } from '../src/config';
import { createConfigDraft, serializeConfigDraft } from '../src/config/draft';
import { roomEntityIds, type Hass } from '../src/providers/home-assistant';

const room = (): CardConfig => ({
  type: 'custom:navet-room-card', config_version: 2, area: 'kitchen',
  room: {
    membership: { mode: 'area', include: ['light.table'], exclude: ['sensor.diagnostic'], future_membership: { retain: true } },
    members: [
      { id: 'temperature', entity: 'sensor.temperature', role: 'temperature', control: 'state', future_member: { retain: true } },
      { id: 'light', entity: 'light.table', recipe: 'light', icon: 'mdi:lightbulb', control: 'auto' },
    ],
    sections: [
      { id: 'readings', name: 'Readings', members: ['temperature'], future_section: { retain: true } },
      { id: 'controls', name: 'Controls', members: ['light'] },
    ],
    future_room: { retain: true },
  },
  future_top: { retain: true },
});

test('legacy configs remain unchanged, isolated and retain explicit membership precedence', () => {
  const legacy = { type: 'custom:navet-room-card', area: 'kitchen', entities: ['light.outside'], advanced: { retain: true } };
  const saved = validateConfig(legacy, 'room');
  assert.deepEqual(saved, legacy);
  assert.deepEqual(validateConfig({ ...legacy, config_version: 1 }, 'room'), { ...legacy, config_version: 1 });
  (saved.advanced as { retain: boolean }).retain = false;
  assert.equal(legacy.advanced.retain, true);
  const host: Hass = { states: {}, entities: { 'light.inside': { area_id: 'kitchen' } }, async callService() {} };
  assert.deepEqual(roomEntityIds(host, saved.area, saved.entities), ['light.outside']);
});

test('invalid popup and every chip condition return field diagnostics without changing the draft', () => {
  for (const condition of [null, { entity: 'bad', state: 'on' }, { all: [] }]) {
    const cases = [{ kind: 'room' as const, input: { type: 'custom:navet-room-card', area: 'kitchen', popup: { trigger: condition } }, path: '$.popup.trigger' }];
    for (const type of ['entity', 'action', 'separator', 'spacer']) {
      const chip = { id: 'invalid', type, visible_when: condition,
        ...(type === 'entity' ? { entity: 'sensor.temperature' } : type === 'action' ? { tap_action: { action: 'back' } } : {}) };
      const input = { type: 'custom:navet-chips-card', chips: [{ id: 'valid', entity: 'sensor.temperature' }, chip] };
      const before = structuredClone(input);
      const diagnostics = configDiagnostics(input, 'chips');
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].path, '$.chips[1].visible_when');
      assert.equal(diagnostics[0].code, 'invalid_config');
      assert.throws(() => validateConfig(input, 'chips'), ConfigValidationError);
      assert.deepEqual(input, before);
    }
    for (const {kind, input, path} of cases) {
      const before = structuredClone(input);
      const diagnostics = configDiagnostics(input, kind);
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0].path, path);
      assert.equal(diagnostics[0].code, 'invalid_config');
      assert.throws(() => validateConfig(input, kind), ConfigValidationError);
      assert.deepEqual(input, before);
    }
  }
});

test('v2 rooms validate deterministically without mutation, sorting or default insertion', () => {
  const input = room();
  const snapshot = structuredClone(input);
  const a = validateConfig(input, 'room');
  const b = validateConfig(input, 'room');
  assert.deepEqual(a, snapshot);
  assert.deepEqual(b, a);
  a.room!.sections!.reverse();
  a.room!.membership.include!.push('light.other');
  assert.deepEqual(input, snapshot);
  assert.deepEqual(b, snapshot);
});

test('explicit v2 membership supports empty authoring and overrides a legacy entity selection', () => {
  const input = { type: 'custom:navet-room-card', config_version: 2, entities: ['light.legacy'], room: { membership: { mode: 'explicit', entities: [] }, sections: [] } };
  assert.deepEqual(validateConfig(input, 'room'), input);
  assert.throws(() => validateConfig({ type: input.type, entities: [] }, 'room'));
  assert.throws(() => validateConfig({ ...input, room: { membership: { mode: 'area' } } }, 'room'));
});

test('future/malformed versions are rejected with a structured field diagnostic', () => {
  for (const config_version of [0, 3, 2.5, '2', null]) {
    assert.deepEqual(configDiagnostics({ type: 'custom:navet-room-card', area: 'kitchen', config_version }, 'room').map(({ code, path }) => ({ code, path })), [{ code: 'unsupported_version', path: '$.config_version' }]);
  }
  assert.throws(() => validateConfig({ ...room(), config_version: 9 }, 'room'), ConfigValidationError);
  assert.throws(() => validateConfig({ ...room(), config_version: undefined }, 'room'));
  assert.throws(() => validateConfig({ type: 'custom:navet-switch-card', entity: 'switch.test', config_version: 2, room: room().room }, 'switch'));
});

test('room diagnostics identify duplicate IDs, dangling references and invalid fields together', () => {
  const input = room();
  input.room!.members!.push({ id: 'light', entity: 'bad entity', control: 'unsupported' as never });
  input.room!.sections![0].members.push('missing');
  input.room!.sections!.push({ id: 'readings', members: [] });
  const diagnostics = configDiagnostics(input, 'room');
  assert.ok(diagnostics.some((item) => item.code === 'duplicate_id' && item.path === '$.room.members[2].id'));
  assert.ok(diagnostics.some((item) => item.code === 'unknown_reference' && item.path === '$.room.sections[0].members[1]'));
  assert.ok(diagnostics.some((item) => item.path === '$.room.members[2].entity'));
  assert.ok(diagnostics.some((item) => item.path === '$.room.members[2].control'));
  assert.ok(diagnostics.some((item) => item.code === 'duplicate_id' && item.path === '$.room.sections[2].id'));
});

test('lossless partial draft save preserves unknown YAML fields through reorder and reopen', () => {
  const original = room();
  const before = structuredClone(original);
  const draft = createConfigDraft(original);
  draft.name = 'Draft only';
  assert.equal(original.name, undefined);
  const result = serializeConfigDraft(original, {
    name: 'Kitchen',
    room: {
      membership: { include: ['light.table', 'light.worktop'] },
      members: [{ id: 'light', entity: 'light.table', control: 'state' }, { id: 'temperature', entity: 'sensor.temperature', name: 'Air' }],
      sections: [{ id: 'controls', name: 'Devices', members: ['light'] }, { id: 'readings', members: ['temperature'] }],
    },
  }, 'room');
  assert.deepEqual(original, before);
  assert.deepEqual(result.future_top, { retain: true });
  assert.deepEqual(result.room!.future_room, { retain: true });
  assert.deepEqual(result.room!.membership.future_membership, { retain: true });
  assert.equal(result.room!.members![0].icon, 'mdi:lightbulb');
  assert.deepEqual(result.room!.members![1].future_member, { retain: true });
  assert.deepEqual(result.room!.sections![1].future_section, { retain: true });
  assert.equal(result.room!.sections![1].name, 'Readings');
  assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(result)), 'room'), result);
});

test('draft save supports deliberate deletions and fails atomically on invalid configuration', () => {
  const original = room();
  const before = structuredClone(original);
  const saved = serializeConfigDraft(original, {
    icon: undefined,
    room: { members: [{ id: 'light', entity: 'light.table' }], sections: [{ id: 'controls', members: ['light'], name: undefined }] },
  }, 'room');
  assert.equal(saved.room!.members!.length, 1);
  assert.equal(saved.room!.sections!.length, 1);
  assert.equal(Object.hasOwn(saved.room!.sections![0], 'name'), false);
  assert.throws(() => serializeConfigDraft(original, { room: { membership: { mode: 'unknown' } } }, 'room'), ConfigValidationError);
  assert.deepEqual(original, before);
});

test('legacy partial appearance edits retain advanced configuration without migration', () => {
  const original = validateConfig({ type: 'custom:navet-switch-card', entity: 'switch.test', appearance: { accent: '#123456', future: 5 }, future: { nested: true } }, 'switch');
  const saved = serializeConfigDraft(original, { appearance: { radius: 8 } }, 'switch');
  assert.deepEqual(saved.appearance, { accent: '#123456', radius: 8, future: 5 });
  assert.equal(saved.config_version, undefined);
  assert.deepEqual(saved.future, { nested: true });
});

test('icon gestures share card action validation and remain independent configuration', () => {
  const input = { type: 'custom:navet-switch-card', entity: 'switch.test', tap_action: { action: 'more-info' }, icon_tap_action: { action: 'toggle' }, icon_hold_action: { action: 'none' }, icon_double_tap_action: { action: 'navigate', navigation_path: '#kitchen' } };
  assert.deepEqual(validateConfig(input, 'switch'), input);
  for (const key of ['icon_tap_action', 'icon_hold_action', 'icon_double_tap_action']) {
    assert.throws(() => validateConfig({ type: 'custom:navet-sensor-card', entity: 'sensor.test', [key]: { action: 'toggle' } }, 'sensor'));
    assert.throws(() => validateConfig({ ...input, [key]: { action: 'navigate', navigation_path: 'https://example.com' } }, 'switch'));
  }
});

test('external URL actions accept absolute HTTP(S) and reject unsafe or malformed destinations', () => {
  const base = { type: 'custom:navet-button-card', name: 'External page' };
  for (const url_path of ['https://example.com', 'http://localhost:8123/path?a=1#part', 'HTTPS://example.com/path']) {
    assert.equal(validateConfig({ ...base, tap_action: { action: 'url', url_path } }, 'button').tap_action!.url_path, url_path);
  }
  for (const url_path of ['javascript:alert(1)', 'data:text/html,hello', '//example.com', '/local/help', '#room', 'https:', 'https://', 'http://[bad', 'https://example.com\\evil', 'https://example.com\n', 'https://exa mple.com', 'ftp://example.com', 'https://example.com:\u0000']) {
    assert.throws(() => validateConfig({ ...base, tap_action: { action: 'url', url_path } }, 'button'), ConfigValidationError);
  }
  assert.deepEqual(validateConfig({ ...base, tap_action: { action: 'back' } }, 'button').tap_action, { action: 'back' });
  assert.throws(() => validateConfig({ ...base, tap_action: { action: 'url' } }, 'button'));
  assert.throws(() => validateConfig({ ...base, tap_action: { action: 'navigate', navigation_path: 'https://example.com' } }, 'button'));
  assert.throws(() => validateConfig({ ...base, tap_action: { action: 'navigate', navigation_path: '#room', navigation_replace: 'yes' } }, 'button'));
  assert.equal(validateConfig({ ...base, tap_action: { action: 'navigate', navigation_path: '#room', navigation_replace: true } }, 'button').tap_action!.navigation_replace, true);
});
