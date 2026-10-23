import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActionConfig } from '../src/config';
import { runConfiguredAction, type ActionContext, type ActionIntent } from '../src/actions/execute';
import { assertActionSequenceBounds } from '../src/actions/sequences';

const step = (name: string): ActionConfig => ({ action: 'perform-action', perform_action: `script.${name}` });
function context(overrides: Partial<ActionContext> = {}) {
  const calls: ActionIntent[] = [];
  return { calls, host: { active: () => true, confirm: () => true, dispatch: (intent: ActionIntent) => { calls.push(intent); }, ...overrides } satisfies ActionContext };
}

test('nested action sequences await each step and snapshot all saved configuration', async () => {
  let finish!: () => void;
  const { calls, host } = context({ dispatch: async intent => {
    calls.push(intent);
    if (calls.length === 1) await new Promise<void>(done => { finish = done; });
  } });
  const config: ActionConfig = { action: 'sequence', sequence: [step('first'), { action: 'sequence', sequence: [step('second'), { action: 'navigate', navigation_path: '#done' }] }] };
  const pending = runConfiguredAction(config, 'remote.living_room', host);
  assert.equal(calls.length, 1);
  config.sequence![1].sequence![0].perform_action = 'script.mutated';
  finish(); await pending;
  assert.deepEqual(calls, [
    { type: 'perform-action', name: 'script.first', data: {}, target: { entity_id: 'remote.living_room' } },
    { type: 'perform-action', name: 'script.second', data: {}, target: { entity_id: 'remote.living_room' } },
    { type: 'navigate', path: '#done' },
  ]);
});

test('sequence errors stop by default and continue only at an explicitly opted-in sequence', async () => {
  const { calls, host } = context({ dispatch: intent => { calls.push(intent); if (intent.type === 'perform-action' && intent.name === 'script.failed') throw new Error('Service rejected'); } });
  const sequence: ActionConfig = { action: 'sequence', sequence: [step('first'), step('failed'), step('last')] };
  await assert.rejects(runConfiguredAction(sequence, undefined, host), /Service rejected/);
  assert.equal(calls.length, 2);
  calls.length = 0;
  await runConfiguredAction({ ...sequence, continue_on_error: true }, undefined, host);
  assert.equal(calls.length, 3);
  calls.length = 0;
  await runConfiguredAction({ action: 'sequence', continue_on_error: true, sequence: [sequence, step('outer_last')] }, undefined, host);
  assert.deepEqual(calls.filter(intent => intent.type === 'perform-action').map(intent => intent.name), ['script.first', 'script.failed', 'script.outer_last']);
});

test('root and step confirmations run in order and cancellation stops even continue-on-error sequences', async () => {
  const confirmed: string[] = [];
  const { calls, host } = context({ confirm: message => { confirmed.push(message); return message !== 'Stop here'; } });
  await runConfiguredAction({ action: 'sequence', continue_on_error: true, confirmation: { text: 'Run all?' }, sequence: [step('first'), { ...step('cancelled'), confirmation: { text: 'Stop here' } }, step('last')] }, undefined, host);
  assert.deepEqual(confirmed, ['Run all?', 'Stop here']); assert.equal(calls.length, 1);
});

test('abort cancels pending confirmation promptly and stale acceptance dispatches nothing', { timeout: 1000 }, async () => {
  const abort = new AbortController(); let accept!: (value: boolean) => void;
  const { calls, host } = context({ signal: abort.signal, confirm: () => new Promise<boolean>(done => { accept = done; }) });
  const pending = runConfiguredAction({ action: 'sequence', confirmation: true, sequence: [step('first'), step('last')] }, undefined, host);
  abort.abort(); await pending;
  accept(true); await Promise.resolve(); assert.deepEqual(calls, []);
});

test('abort cannot undo a dispatched service but stops all remaining sequence effects', { timeout: 1000 }, async () => {
  const abort = new AbortController(); let rejectService!: (error: Error) => void;
  const { calls, host } = context({ signal: abort.signal, dispatch: intent => { calls.push(intent); return new Promise<void>((_, reject) => { rejectService = reject; }); } });
  const pending = runConfiguredAction({ action: 'sequence', continue_on_error: true, sequence: [step('first'), { action: 'assist' }, { action: 'back' }] }, undefined, host);
  abort.abort(); await pending;
  rejectService(new Error('Late rejected response')); await Promise.resolve();
  assert.equal(calls.length, 1);
});

test('preview, stale identity and already-aborted actions produce no effects', async () => {
  const abort = new AbortController(); abort.abort();
  for (const overrides of [{ active: () => false }, { signal: abort.signal }]) {
    const { calls, host } = context({ ...overrides, confirm: () => { throw new Error('Must not confirm'); } });
    await runConfiguredAction({ action: 'sequence', confirmation: true, sequence: [step('first')] }, undefined, host);
    assert.deepEqual(calls, []);
  }
  let active = true;
  const { calls, host } = context({ active: () => active, dispatch: intent => { calls.push(intent); active = false; } });
  await runConfiguredAction({ action: 'sequence', sequence: [step('first'), step('last')] }, undefined, host);
  assert.equal(calls.length, 1);
});

test('Assist uses HA defaults and custom DOM events preserve complete foreign action data', async () => {
  const { calls, host } = context();
  await runConfiguredAction({ action: 'assist' }, undefined, host);
  await runConfiguredAction({ action: 'assist', pipeline_id: 'preferred', start_listening: true }, undefined, host);
  const custom = { action: 'fire-dom-event' as const, browser_mod: { service: 'browser_mod.popup', data: { title: 'Living room' } } };
  await runConfiguredAction(custom, undefined, host);
  assert.deepEqual(calls, [{ type: 'assist', pipeline_id: 'last_used', start_listening: false }, { type: 'assist', pipeline_id: 'preferred', start_listening: true }, { type: 'fire-dom-event', config: custom }]);
  const last = calls[2];
  if (last.type === 'fire-dom-event') (last.config as typeof custom).browser_mod.data.title = 'Host mutation';
  assert.equal(custom.browser_mod.data.title, 'Living room');
});

test('malformed, excessively nested or broad sequences fail before any intent', async () => {
  const deep: Record<string, unknown> = { action: 'sequence', sequence: [step('first')] };
  let child = deep;
  for (let index = 0; index < 10; index++) { const next = { action: 'sequence', sequence: [child] }; child = next; }
  const malformed: unknown[] = [{ action: 'sequence', sequence: [] }, { action: 'sequence', sequence: [false] }, { action: 'sequence', sequence: Array(25).fill(step('first')) }, { action: 'sequence', sequence: [step('first')], continue_on_error: 'yes' }, child, { action: 'sequence', sequence: Array.from({ length: 24 }, () => ({ action: 'sequence', sequence: Array.from({ length: 24 }, () => step('first')) })) }];
  const { calls, host } = context();
  for (const config of malformed) { assert.throws(() => assertActionSequenceBounds(config)); await assert.rejects(runConfiguredAction(config as ActionConfig, undefined, host)); }
  assert.deepEqual(calls, []);
});
