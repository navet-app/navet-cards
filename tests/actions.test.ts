import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConfiguredAction, type ActionIntent } from '../src/actions/execute';

test('configured actions retain explicit targets and isolate host mutations from saved configuration', async () => {
  const action = { action: 'perform-action' as const, perform_action: 'scene.turn_on', data: { transition: 2 }, target: { area_id: 'kitchen' } };
  const intents: ActionIntent[] = [];
  await runConfiguredAction(action, 'light.kitchen', { active: () => true, confirm: () => true, dispatch: intent => {
    intents.push(structuredClone(intent));
    if (intent.type === 'perform-action') intent.data.transition = 99;
  } });
  assert.deepEqual(intents, [{ type: 'perform-action', name: 'scene.turn_on', data: { transition: 2 }, target: { area_id: 'kitchen' } }]);
  assert.equal(action.data.transition, 2);
});

test('confirmation cancels stale configuration and snapshots the originally selected action', async () => {
  let active = true;
  let resolve!: (value: boolean) => void;
  const calls: ActionIntent[] = [];
  const action = { action: 'navigate' as const, navigation_path: '#kitchen', confirmation: { text: 'Open room?' } };
  const pending = runConfiguredAction(action, undefined, { active: () => active, confirm: text => {
    assert.equal(text, 'Open room?');
    return new Promise<boolean>(done => { resolve = done; });
  }, dispatch: intent => { calls.push(intent); } });
  action.navigation_path = '#changed';
  active = false;
  resolve(true);
  await pending;
  assert.equal(calls.length, 0);
  await runConfiguredAction({ action: 'toggle', confirmation: true }, 'switch.example', { active: () => true, confirm: () => false, dispatch: intent => { calls.push(intent); } });
  await runConfiguredAction({ action: 'more-info' }, 'sensor.example', { active: () => false, confirm: () => true, dispatch: intent => { calls.push(intent); } });
  assert.equal(calls.length, 0);
});

test('default service ownership, navigation and more-info intents remain distinct', async () => {
  const calls: ActionIntent[] = [];
  const context = { active: () => true, confirm: () => true, dispatch: (intent: ActionIntent) => { calls.push(intent); } };
  await runConfiguredAction({ action: 'perform-action', perform_action: 'script.turn_on' }, 'script.goodnight', context);
  await runConfiguredAction({ action: 'more-info' }, 'sensor.temperature', context);
  await runConfiguredAction({ action: 'navigate', navigation_path: '#kitchen' }, undefined, context);
  await runConfiguredAction({ action: 'none', confirmation: true }, undefined, context);
  assert.deepEqual(calls, [
    { type: 'perform-action', name: 'script.turn_on', data: {}, target: { entity_id: 'script.goodnight' } },
    { type: 'more-info', entity: 'sensor.temperature' },
    { type: 'navigate', path: '#kitchen' },
  ]);
});

test('URL, back and replace navigation emit distinct intents without entity or service targets', async () => {
  const calls: ActionIntent[] = [];
  const context = { active: () => true, confirm: () => true, dispatch: (intent: ActionIntent) => { calls.push(intent); } };
  await runConfiguredAction({ action: 'url', url_path: 'https://example.com/help' }, 'light.ignored', context);
  await runConfiguredAction({ action: 'back' }, 'light.ignored', context);
  await runConfiguredAction({ action: 'navigate', navigation_path: '#room', navigation_replace: true }, undefined, context);
  await runConfiguredAction({ action: 'navigate', navigation_path: '/lovelace/home', navigation_replace: false }, undefined, context);
  assert.deepEqual(calls, [
    { type: 'url', url: 'https://example.com/help' }, { type: 'back' },
    { type: 'navigate', path: '#room', replace: true },
    { type: 'navigate', path: '/lovelace/home', replace: false },
  ]);
});

test('external navigation snapshots confirmation and blocks stale, cancelled or inactive actions', async () => {
  let resolve!: (accepted: boolean) => void;
  const calls: ActionIntent[] = [];
  const action = { action: 'url' as const, url_path: 'https://example.com/original', confirmation: true };
  const pending = runConfiguredAction(action, undefined, { active: () => true, confirm: () => new Promise<boolean>((done) => { resolve = done; }), dispatch: (intent) => { calls.push(intent); } });
  action.url_path = 'https://example.com/changed'; resolve(true); await pending;
  assert.deepEqual(calls, [{ type: 'url', url: 'https://example.com/original' }]);
  for (const action of [{ action: 'url' as const, url_path: 'https://example.com', confirmation: true }, { action: 'back' as const, confirmation: true }]) {
    await runConfiguredAction(action, undefined, { active: () => false, confirm: () => { throw new Error('Inactive actions must not confirm'); }, dispatch: () => { throw new Error('Inactive action dispatched'); } });
    await runConfiguredAction(action, undefined, { active: () => true, confirm: () => false, dispatch: () => { throw new Error('Cancelled action dispatched'); } });
    let active = true;
    await runConfiguredAction(action, undefined, { active: () => active, confirm: () => { active = false; return true; }, dispatch: () => { throw new Error('Stale action dispatched'); } });
  }
});
