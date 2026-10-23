import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PressController, type PressPhase } from '../src/actions/press';
const down = (pointerId = 1) => ({ button: 0, pointerId, clientX: 10, clientY: 10 });
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
const wait = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));

test('press invokes immediately and every cancellation emits one ordered release', async () => {
  const phases: PressPhase[] = []; let resolve!: () => void;
  const controller = new PressController({ enabled: () => true, dispatch: phase => { phases.push(phase); if (phase === 'press') return new Promise<void>(done => { resolve = done; }); } });
  assert.equal(controller.pointerDown(down()), true);
  assert.deepEqual(phases, ['press']);
  controller.pointerCancel(down()); controller.cancel(); controller.detach();
  assert.equal(controller.active, true); assert.equal(controller.pointerDown(down(2)), false);
  resolve(); await flush();
  assert.deepEqual(phases, ['press', 'release']); assert.equal(controller.active, false);
});

test('preview and disabled guard suppress start; changed guard still permits cleanup release', async () => {
  const phases: PressPhase[] = []; let enabled = false;
  const controller = new PressController({ enabled: () => enabled, dispatch: phase => { phases.push(phase); }, repeat: () => true, interval: () => 100 });
  assert.equal(controller.pointerDown(down()), false);
  enabled = true; controller.pointerDown(down()); enabled = false;
  await flush();
  assert.deepEqual(phases, ['press', 'release']); assert.equal(controller.active, false);
});

test('repeat awaits each dispatch and release waits for a pending repeat', async () => {
  const phases: PressPhase[] = []; let finish!: () => void;
  const controller = new PressController({ enabled: () => true, interval: () => 100, repeat: () => true, dispatch: phase => { phases.push(phase); if (phase === 'repeat') return new Promise<void>(done => { finish = done; }); } });
  controller.pointerDown(down()); await flush(); await wait(115);
  assert.deepEqual(phases, ['press', 'repeat']);
  await wait(115); assert.deepEqual(phases, ['press', 'repeat']);
  controller.pointerUp(down()); await flush(); assert.deepEqual(phases, ['press', 'repeat']);
  finish(); await flush(); assert.deepEqual(phases, ['press', 'repeat', 'release']);
  await wait(115); assert.equal(phases.length, 3);
});

test('pointer identity, primary button and movement thresholds protect scrolling', async () => {
  const phases: PressPhase[] = [];
  const controller = new PressController({ enabled: () => true, dispatch: phase => { phases.push(phase); } });
  assert.equal(controller.pointerDown({ ...down(), button: 2 }), false);
  controller.pointerDown(down()); controller.pointerUp({ pointerId: 5 });
  controller.pointerMove({ pointerId: 5, clientX: 90, clientY: 90 }); assert.equal(controller.active, true);
  controller.pointerMove({ pointerId: 1, clientX: 21, clientY: 10 }); await flush();
  assert.deepEqual(phases, ['press', 'release']);
});

test('Space and Enter prevent native actions, ignore OS repeats and release only matching key', async () => {
  for (const key of [' ', 'Enter']) {
    const phases: PressPhase[] = []; let prevented = 0;
    const controller = new PressController({ enabled: () => true, dispatch: phase => { phases.push(phase); } });
    const event = { key, repeat: false, preventDefault: () => { prevented++; } };
    assert.equal(controller.keyDown({ ...event, key: 'Tab' }), false);
    assert.equal(controller.keyDown(event), true); controller.keyDown({ ...event, repeat: true });
    controller.keyUp({ ...event, key: 'Escape' }); assert.equal(controller.active, true);
    controller.keyUp(event); await flush();
    assert.deepEqual(phases, ['press', 'release']); assert.equal(prevented, 3);
  }
});

test('blur, scrolling, hidden document and lost pointer capture cancel, and listeners detach', async () => {
  for (const kind of ['blur', 'scroll', 'visibilitychange', 'lostpointercapture']) {
    const target = new EventTarget(); const owner = Object.assign(new EventTarget(), { hidden: false });
    const phases: PressPhase[] = [];
    const controller = new PressController({ enabled: () => true, dispatch: phase => { phases.push(phase); } });
    controller.attach(target as Window, owner as unknown as Document); controller.pointerDown(down());
    if (kind === 'visibilitychange') { owner.hidden = true; owner.dispatchEvent(new Event(kind)); }
    else target.dispatchEvent(Object.assign(new Event(kind), { pointerId: 1 }));
    await flush(); assert.deepEqual(phases, ['press', 'release'], kind);
    controller.detach(); controller.pointerDown(down()); target.dispatchEvent(new Event('blur')); await flush();
    assert.equal(controller.active, true); controller.cancel(); await flush();
  }
});

test('rejected press reports error and still performs exactly one release', async () => {
  const phases: PressPhase[] = []; const errors: unknown[] = [];
  const controller = new PressController({ enabled: () => true, dispatch: async phase => { phases.push(phase); if (phase === 'press') throw new Error('Service rejected'); }, onError: error => { errors.push(error); } });
  controller.pointerDown(down()); await flush();
  assert.deepEqual(phases, ['press', 'release']); assert.equal(errors.length, 1); assert.equal(controller.active, false);
});
