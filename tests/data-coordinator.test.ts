import test from 'node:test';
import assert from 'node:assert/strict';
import { DataCoordinator, type DataClock, type DataSnapshot } from '../src/data/coordinator';

class Clock implements DataClock {
  time = 0;
  next = 1;
  timers = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  setTimeout = (callback: () => void, delay: number) => {
    const id = this.next++;
    this.timers.set(id, { at: this.time + delay, callback });
    return id;
  };
  clearTimeout = (id: unknown) => { this.timers.delete(id as number); };
  advance(ms: number) {
    this.time += ms;
    for (const [id, timer] of [...this.timers]) if (timer.at <= this.time) {
      this.timers.delete(id);
      timer.callback();
    }
  }
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('equivalent observers share in-flight work and fresh snapshots, hosts and queries stay separate', async () => {
  const clock = new Clock(), coordinator = new DataCoordinator(clock), scope = {};
  let calls = 0;
  const pending = deferred<number[]>();
  const loader = () => { calls++; return pending.promise; };
  const seen: DataSnapshot<number>[] = [];
  const first = coordinator.observe(scope, 'q', loader, snapshot => seen.push(snapshot));
  const second = coordinator.observe(scope, 'q', loader, () => {});
  await flush();
  assert.equal(calls, 1);
  pending.resolve([0]);
  await flush();
  assert.equal(first.snapshot.status, 'ready');
  assert.deepEqual(second.snapshot.data, [0]);
  assert.equal(clock.timers.size, 1);
  const third = coordinator.observe(scope, 'q', loader, () => {});
  await flush();
  assert.equal(calls, 1);
  const anotherHost = coordinator.observe({}, 'q', async () => { calls++; return [2]; }, () => {});
  const anotherQuery = coordinator.observe(scope, 'other', async () => { calls++; return [3]; }, () => {});
  await flush();
  assert.equal(calls, 3);
  assert.ok(seen.some(snapshot => snapshot.status === 'ready'));
  for (const observer of [first, second, third, anotherHost, anotherQuery]) observer.release();
  assert.equal(clock.timers.size, 0);
});

test('all hidden/released observers stop timers and obsolete results cannot paint on resumption', async () => {
  const clock = new Clock(), coordinator = new DataCoordinator(clock), scope = {};
  const old = deferred<number[]>(), fresh = deferred<number[]>();
  let calls = 0;
  const seen: number[] = [];
  const observation = coordinator.observe(scope, 'q', () => ++calls === 1 ? old.promise : fresh.promise, snapshot => seen.push(...snapshot.data));
  await flush();
  observation.setVisible(false);
  observation.setVisible(true);
  await flush();
  assert.equal(calls, 2);
  fresh.resolve([2]);
  await flush();
  old.resolve([1]);
  await flush();
  assert.deepEqual(observation.snapshot.data, [2]);
  assert.ok(!seen.includes(1));
  observation.release();
  observation.release();
  assert.equal(clock.timers.size, 0);
  clock.advance(1000000);
  await flush();
  assert.equal(calls, 2);
});

test('freshness, visibility, refresh invalidation and retry preserve honest snapshot states', async () => {
  const clock = new Clock(), coordinator = new DataCoordinator(clock), scope = {};
  let calls = 0;
  const observation = coordinator.observe<number>(scope, 'q', async () => {
    calls++;
    if (calls === 2) throw { status: 403, message: 'denied' };
    return calls === 3 ? [] : [calls];
  }, () => {}, { freshnessMs: 100, refreshMs: 100 });
  await flush();
  observation.setVisible(false);
  clock.advance(50);
  observation.setVisible(true);
  await flush();
  assert.equal(calls, 1);
  clock.advance(100);
  await flush();
  assert.equal(observation.snapshot.status, 'denied');
  assert.equal(observation.snapshot.stale, true);
  assert.deepEqual(observation.snapshot.data, [1]);
  observation.refresh();
  await flush();
  assert.equal(observation.snapshot.status, 'empty');
  assert.equal(observation.snapshot.stale, false);
  observation.release();
  assert.equal(clock.timers.size, 0);
});

test('unsupported, offline and error states differ; inactive creation makes no requests', async () => {
  const clock = new Clock(), coordinator = new DataCoordinator(clock);
  let calls = 0;
  const observation = coordinator.observe({}, 'q', async () => {
    calls++;
    if (calls === 1) return null;
    if (calls === 2) throw { code: 'connection_lost' };
    throw new Error('failed');
  }, () => {}, { visible: false, refreshMs: 0 });
  await flush();
  assert.equal(calls, 0);
  observation.setVisible(true);
  await flush();
  assert.equal(observation.snapshot.status, 'unsupported');
  observation.refresh();
  await flush();
  assert.equal(observation.snapshot.status, 'offline');
  observation.refresh();
  await flush();
  assert.equal(observation.snapshot.status, 'error');
  assert.equal(clock.timers.size, 0);
  observation.release();
});

test('explicit invalidation discards old requests and stale completion after final release', async () => {
  const clock = new Clock(), coordinator = new DataCoordinator(clock);
  const requests = [deferred<number[]>(), deferred<number[]>()];
  let calls = 0, notifications = 0;
  const observation = coordinator.observe({}, 'q', () => requests[calls++].promise, () => notifications++);
  await flush();
  observation.refresh();
  await flush();
  assert.equal(calls, 1);
  observation.refresh({ invalidate: true });
  await flush();
  assert.equal(calls, 2);
  requests[0].resolve([1]);
  await flush();
  assert.equal(observation.snapshot.status, 'loading');
  observation.release();
  const before = notifications;
  requests[1].resolve([2]);
  await flush();
  assert.equal(notifications, before);
  assert.equal(clock.timers.size, 0);
});

test('visible failures retry on a bounded schedule and released queries never retry', async () => {
  const clock = new Clock(), coordinator = new DataCoordinator(clock);
  let calls = 0;
  const observation = coordinator.observe({}, 'q', async () => {
    if (++calls < 3) throw new Error('temporary');
    return [3];
  }, () => {}, {refreshMs:300000});
  await flush();
  assert.equal(observation.snapshot.status, 'error');
  clock.advance(30000);
  await flush();
  assert.equal(calls, 2);
  clock.advance(60000);
  await flush();
  assert.equal(calls, 3);
  assert.equal(observation.snapshot.status, 'ready');
  observation.release();
  clock.advance(600000);
  await flush();
  assert.equal(calls, 3);
  assert.equal(clock.timers.size, 0);
});

test('idle snapshot cache is bounded without eviction timers', async () => {
  const clock = new Clock(), coordinator = new DataCoordinator(clock, 1), scope = {};
  let calls = 0;
  const first = coordinator.observe(scope, 'old', async () => {calls++;return [1];}, () => {});
  const second = coordinator.observe(scope, 'new', async () => {calls++;return [2];}, () => {});
  await flush();
  first.release();
  second.release();
  assert.equal(clock.timers.size, 0);
  const again = coordinator.observe(scope, 'old', async () => {calls++;return [3];}, () => {});
  await flush();
  assert.equal(calls, 3);
  assert.deepEqual(again.snapshot.data, [3]);
  again.release();
});
