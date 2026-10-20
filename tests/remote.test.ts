import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapRemote, prepareRemoteCommand, type RemoteCommand } from '../src/providers/remote';
import type { HassEntity } from '../src/providers/home-assistant';

function fixture(attributes: Record<string, unknown> = {}, state = 'on') {
  const raw: HassEntity = { entity_id: 'remote.living_room', state, attributes: { supported_features: 4, activity_list: ['Watch TV', 'Listen to music'], current_activity: 'Watch TV', ...attributes } };
  return { raw, host: { states: { [raw.entity_id]: raw } } };
}

test('remote activities require advertised support and exact nonempty options', () => {
  const { raw } = fixture({ activity_list: ['Watch TV', '', ' ', 'Watch TV', 4, 'Listen to music'] });
  const original = structuredClone(raw);
  assert.deepEqual(mapRemote(raw), { capabilities: ['power_on', 'power_off', 'remote_activity'], remoteActivities: ['Watch TV', 'Listen to music'], remoteActivity: 'Watch TV' });
  assert.deepEqual(raw, original);
  for (const supported_features of [0, 1, 2, 3, undefined, '4', -1, 4.5]) {
    const model = mapRemote(fixture({ supported_features }).raw);
    assert.deepEqual(model.capabilities, ['power_on', 'power_off']);
    assert.deepEqual(model.remoteActivities, []); assert.equal(model.remoteActivity, undefined);
  }
  assert.deepEqual(mapRemote(fixture({ activity_list: [] }).raw).capabilities, ['power_on', 'power_off']);
  assert.equal(mapRemote(fixture({ current_activity: null }).raw).remoteActivity, undefined);
  assert.deepEqual(mapRemote(undefined), { capabilities: [] });
  assert.deepEqual(mapRemote({ ...raw, entity_id: 'switch.living_room' }), { capabilities: [] });
});

test('remote commands use exact owner targets and permit starting activities while off', () => {
  const { host } = fixture({}, 'off');
  const target = { entity_id: 'remote.living_room' };
  assert.deepEqual(prepareRemoteCommand(host, target.entity_id, { type: 'remote_activity', value: 'Listen to music' }), { domain: 'remote', service: 'turn_on', data: { activity: 'Listen to music' }, target });
  for (const type of ['power_on', 'power_off'] as const) assert.deepEqual(prepareRemoteCommand(host, target.entity_id, { type }), { domain: 'remote', service: type === 'power_on' ? 'turn_on' : 'turn_off', data: {}, target });
});

test('remote dispatch rechecks removed, mismatched, unavailable and changed owners', () => {
  const { raw, host } = fixture();
  const command: RemoteCommand = { type: 'remote_activity', value: 'Watch TV' };
  for (const state of ['unknown', 'unavailable', 'missing']) {
    raw.state = state;
    assert.throws(() => prepareRemoteCommand(host, raw.entity_id, command), /unavailable/);
    assert.throws(() => prepareRemoteCommand(host, raw.entity_id, { type: 'power_on' }), /unavailable/);
  }
  raw.state = 'on'; raw.attributes.activity_list = ['Listen to music'];
  assert.throws(() => prepareRemoteCommand(host, raw.entity_id, command), /not supported/);
  raw.attributes.activity_list = ['Watch TV']; raw.attributes.supported_features = 0;
  assert.throws(() => prepareRemoteCommand(host, raw.entity_id, command), /not supported/);
  raw.entity_id = 'remote.other';
  assert.throws(() => prepareRemoteCommand(host, 'remote.living_room', command), /unavailable/);
  assert.throws(() => prepareRemoteCommand({ states: {} }, 'remote.living_room', command), /unavailable/);
  assert.throws(() => prepareRemoteCommand({ states: { 'switch.living_room': { ...raw, entity_id: 'switch.living_room' } } }, 'switch.living_room', command), /unavailable/);
});

test('remote dispatch rejects invented activities and unsupported commands', () => {
  const { host, raw } = fixture();
  for (const value of ['', 'watch tv', ' Watch TV ', 'PowerOff', 3, undefined]) assert.throws(() => prepareRemoteCommand(host, raw.entity_id, { type: 'remote_activity', value } as RemoteCommand), /not supported/);
  assert.throws(() => prepareRemoteCommand(host, raw.entity_id, { type: 'send_command', value: 'PLAY' } as unknown as RemoteCommand), /not supported/);
});
