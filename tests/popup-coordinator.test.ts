import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PopupCoordinator, type PopupEnvironment, type PopupReason } from '../src/composition/popup-coordinator';

class TrackedTarget extends EventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (listener) { const set = this.listeners.get(type) ?? new Set(); set.add(listener); this.listeners.set(type, set); }
    super.addEventListener(type, listener, options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    if (listener) this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  get count() { return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0); }
}
function fixture(initial = '/dashboard/rooms?edit=1', asynchronousBack = false) {
  const events = new TrackedTarget(); const visibility = new TrackedTarget();
  const entries: { url: string; state: unknown }[] = [{ url: initial, state: { host: 'retained' } }];
  const timers = new Map<number, { callback: () => void; milliseconds: number }>();
  let timerId = 0; let pendingBack = false; let writes = 0;
  const notify = () => events.dispatchEvent(new Event('popstate'));
  const finishBack = () => { if (entries.length > 1) entries.pop(); pendingBack = false; notify(); };
  const environment: PopupEnvironment = {
    events, visibility,
    hash: () => new URL(entries.at(-1)!.url, 'https://ha.invalid').hash,
    url: () => entries.at(-1)!.url,
    state: () => entries.at(-1)!.state,
    push(state, url) { writes++; entries.push({ state, url: url.startsWith('#') ? entries.at(-1)!.url.split('#')[0] + url : url }); },
    replace(state, url) { writes++; entries[entries.length - 1] = { state, url }; },
    back() { writes++; if (asynchronousBack) pendingBack = true; else finishBack(); },
    schedule(callback, milliseconds) { timers.set(++timerId, { callback, milliseconds }); return timerId; },
    cancel(timer) { timers.delete(timer as number); },
  };
  const changes: [boolean, PopupReason][] = [];
  const coordinator = new PopupCoordinator((open, reason) => changes.push([open, reason]), environment);
  const navigate = (hash: string) => { environment.push({}, `/dashboard/rooms?edit=1${hash}`); notify(); };
  return { coordinator, environment, events, visibility, entries, timers, changes, navigate, finishBack, get pendingBack() { return pendingBack; }, get writes() { return writes; } };
}

test('popup preserves host history, scoped hash, active ownership and browser back', () => {
  const f = fixture();
  f.coordinator.configure({ id: '#kitchen', scope: 'ground' }); f.coordinator.connect();
  f.coordinator.open();
  assert.equal(f.coordinator.hash, '#ground--kitchen');
  assert.equal(f.environment.hash(), '#ground--kitchen');
  assert.equal((f.environment.state() as { host: string }).host, 'retained');
  const second = new PopupCoordinator(() => {}, f.environment);
  second.configure({ id: '#office', scope: 'ground' }); second.connect(); second.open();
  assert.equal(f.coordinator.active, false); assert.equal(second.active, true);
  f.environment.back();
  assert.equal(f.coordinator.active, true); assert.equal(second.active, false);
  f.coordinator.close();
  assert.equal(f.environment.url(), '/dashboard/rooms?edit=1');
  assert.deepEqual(f.changes, [[true, 'manual'], [false, 'navigation'], [true, 'navigation'], [false, 'dismiss']]);
  f.coordinator.disconnect(); second.disconnect();
});

test('direct links reconcile on foreground and duplicate hashes open one owner', () => {
  const f = fixture('/dashboard/rooms#kitchen');
  f.coordinator.configure({ id: '#kitchen' }); f.coordinator.connect();
  const duplicate = new PopupCoordinator(() => {}, f.environment);
  duplicate.configure({ id: '#kitchen' }); duplicate.connect(); duplicate.open();
  assert.equal(f.coordinator.active, true); assert.equal(duplicate.active, false);
  f.coordinator.close();
  assert.equal(f.environment.url(), '/dashboard/rooms');
  f.environment.replace({}, '/dashboard/rooms#kitchen');
  f.visibility.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.coordinator.active, true);
  f.coordinator.disconnect(); duplicate.disconnect();
});

test('dismissed state triggers stay latched across hass updates and reconnect until false', () => {
  const f = fixture();
  f.coordinator.configure({ id: '#kitchen', trigger: true }); f.coordinator.connect();
  assert.equal(f.coordinator.active, true);
  f.coordinator.close();
  for (let index = 0; index < 4; index++) f.coordinator.configure({ id: '#kitchen', trigger: true });
  f.coordinator.disconnect(); f.coordinator.connect();
  assert.equal(f.coordinator.active, false);
  f.coordinator.configure({ id: '#kitchen', trigger: false });
  f.coordinator.configure({ id: '#kitchen', trigger: true });
  assert.equal(f.coordinator.active, true);
  f.coordinator.disconnect();
});

test('changing panel identity reconciles the old panel and consumes its new trigger once', () => {
  const f = fixture();
  f.coordinator.configure({ id: '#kitchen', trigger: true }); f.coordinator.connect();
  f.coordinator.close();
  f.coordinator.configure({ id: '#office', trigger: true });
  assert.equal(f.coordinator.active, true); assert.equal(f.environment.hash(), '#office');
  f.coordinator.configure({ id: '#bedroom', trigger: true });
  assert.equal(f.coordinator.active, true); assert.equal(f.environment.hash(), '#bedroom');
  f.coordinator.close();
  f.coordinator.configure({ id: '#bedroom', trigger: true });
  assert.equal(f.coordinator.active, false);
  f.coordinator.disconnect();
});

test('timeouts remain stable across hass updates and cleanup removes all resources', () => {
  const f = fixture();
  f.coordinator.configure({ timeout: 5, trigger: true }); f.coordinator.connect();
  assert.equal(f.timers.size, 1);
  const timer = [...f.timers][0];
  assert.equal(timer[1].milliseconds, 5000);
  f.coordinator.configure({ timeout: 5, trigger: true });
  assert.equal([...f.timers.keys()][0], timer[0]);
  timer[1].callback();
  assert.deepEqual(f.changes.at(-1), [false, 'timeout']);
  assert.equal(f.timers.size, 0);
  for (let index = 0; index < 3; index++) {
    f.coordinator.disconnect(); assert.equal(f.events.count + f.visibility.count + f.timers.size, 0);
    f.coordinator.connect(); f.coordinator.open();
    assert.equal(f.events.count, 4); assert.equal(f.visibility.count, 1); assert.equal(f.timers.size, 1);
  }
  f.coordinator.disconnect();
  assert.equal(f.events.count + f.visibility.count + f.timers.size, 0);
});

test('preview permits manual read-only popup without navigation, triggers or timers', () => {
  const f = fixture('/dashboard/rooms#kitchen');
  f.coordinator.configure({ id: '#kitchen', preview: true, timeout: 1, trigger: true }); f.coordinator.connect();
  assert.equal(f.coordinator.active, false);
  f.coordinator.open();
  f.coordinator.configure({ id: '#kitchen', preview: true, timeout: 1, trigger: true });
  assert.equal(f.coordinator.active, true);
  assert.equal(f.timers.size, 0); assert.equal(f.writes, 0);
  f.coordinator.close(); f.coordinator.disconnect();
  assert.equal(f.writes, 0);
});

test('downward swipe requires deliberate vertical distance and handles async back safely', () => {
  const f = fixture('/dashboard/rooms', true);
  f.coordinator.configure({ id: '#kitchen', swipe: true, trigger: true }); f.coordinator.connect();
  assert.equal(f.coordinator.swipe(0, 0, 100, 110), false);
  assert.equal(f.coordinator.swipe(0, 0, 2, 60), false);
  assert.equal(f.coordinator.swipe(0, 0, 2, 90), true);
  assert.equal(f.pendingBack, true);
  f.coordinator.configure({ id: '#kitchen', swipe: true, trigger: true });
  f.events.dispatchEvent(new Event('location-changed'));
  assert.equal(f.coordinator.active, false);
  f.finishBack();
  assert.equal(f.environment.hash(), ''); assert.equal(f.coordinator.active, false);
  f.coordinator.disconnect();
});

test('close completion waits for browser traversal before follow-up dialogs', async () => {
  const f = fixture('/dashboard/rooms', true);
  f.coordinator.configure({ id: '#kitchen' }); f.coordinator.connect(); f.coordinator.open();
  let details = 0;
  const completion = f.coordinator.close().then(() => { details++; });
  await Promise.resolve();
  assert.equal(f.coordinator.active, false); assert.equal(details, 0);
  assert.equal(f.events.count, 5); assert.equal(f.timers.size, 1);
  assert.equal([...f.timers.values()][0].milliseconds, 1000);
  f.finishBack(); await completion;
  assert.equal(details, 1); assert.equal(f.events.count, 4); assert.equal(f.timers.size, 0);
  f.coordinator.disconnect();
});

test('close completion cannot hang when traversal is suppressed or card disconnects', async () => {
  const f = fixture('/dashboard/rooms', true);
  f.coordinator.configure({ id: '#kitchen' }); f.coordinator.connect(); f.coordinator.open();
  const completion = f.coordinator.close();
  [...f.timers.values()][0].callback(); await completion;
  assert.equal(f.events.count, 4); assert.equal(f.timers.size, 0);
  f.finishBack(); f.coordinator.open();
  const disconnected = f.coordinator.close();
  f.coordinator.disconnect(); await disconnected;
  assert.equal(f.events.count + f.visibility.count + f.timers.size, 0);
});
