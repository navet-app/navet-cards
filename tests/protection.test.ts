import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProtectionGate } from '../src/actions/protection';

test('protection defaults off; enabled cards start locked and unlock only transiently', () => {
  let now = 1000; let changes = 0;
  const gate = new ProtectionGate(() => { changes++; }, () => now);
  assert.equal(gate.allows(), true);
  gate.configure({ enabled: true, unlock_duration: 2 }); assert.equal(gate.locked, true);
  gate.unlock(); assert.equal(gate.allows(), true);
  now += 1999; assert.equal(gate.allows(), true);
  now++; assert.equal(gate.locked, true); assert.equal(changes, 2);
  gate.dispose();
});

test('new configuration and disconnect relock; same configuration preserves transient state', () => {
  const gate = new ProtectionGate(); const config = { enabled: true, unlock_duration: 5 };
  gate.configure(config); gate.unlock(); gate.configure(config); assert.equal(gate.locked, false);
  gate.configure({ ...config }); assert.equal(gate.locked, true);
  gate.unlock(); gate.dispose(); assert.equal(gate.locked, true);
  gate.configure({ enabled: false }); assert.equal(gate.allows(), true);
});

test('expiry triggers rendering callback without polling and disposal cancels notification', async () => {
  let changes = 0;
  const gate = new ProtectionGate(() => { changes++; });
  gate.configure({ enabled: true, unlock_duration: 0.015 }); gate.unlock();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(gate.locked, true); assert.equal(changes, 3);
  gate.unlock(); gate.dispose(); const afterDispose = changes;
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(changes, afterDispose);
});
