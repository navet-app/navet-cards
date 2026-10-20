import { expect, test } from '@playwright/test';
import { kitchenFixture, kitchenMemberNames, legacyKitchenConfig } from '../fixtures/kitchen';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => (window as any).cards?.length === 7);
  await page.evaluate(({ fixture, config }) => {
    const w = window as any;
    w.fixtureCalls = [];
    w.fixtureHost = { ...fixture, async callService(...args: unknown[]) { w.fixtureCalls.push(args); } };
    const card = document.createElement('navet-room-card') as any;
    card.id = 'fixture-room';
    card.setConfig(config);
    card.hass = w.fixtureHost;
    document.querySelector('#cards')!.append(card);
    w.fixtureRoom = card;
  }, { fixture: kitchenFixture, config: legacyKitchenConfig });
});

test('registry ownership remains correct after device moves and disconnected navigation', async ({ page }, info) => {
  const room = page.locator('#fixture-room');
  await room.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(room.locator('.room-row > span:first-child')).toHaveText(kitchenMemberNames);
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const w = window as any;
    const card = w.fixtureRoom;
    let subscribed = 0, released = 0;
    const context = (event: any) => {
      if (event.target !== card) return;
      subscribed++;
      event.callback(w.fixtureHost.states, () => released++);
    };
    document.addEventListener('context-request', context);
    let maxClosedRows = 0;
    // Navigation while detached must not open or retain a hidden panel.
    for (let i = 0; i < 12; i++) {
      card.remove();
      history.replaceState(null, '', '#fixture-kitchen');
      window.dispatchEvent(new Event('location-changed'));
      history.replaceState(null, '', location.pathname);
      document.querySelector('#cards')!.append(card);
      await card.updateComplete;
      maxClosedRows = Math.max(maxClosedRows, card.shadowRoot.querySelectorAll('.room-control').length);
    }
    card.remove();
    document.removeEventListener('context-request', context);
    w.fixtureHost = { ...w.fixtureHost, devices: { ...w.fixtureHost.devices, climate: { area_id: 'hall' } } };
    card.hass = w.fixtureHost;
    document.querySelector('#cards')!.append(card);
    await card.updateComplete;
    return { reconnects: 12, subscribed, released, maxClosedRows };
  });
  expect(result).toEqual({ reconnects: 12, subscribed: 12, released: 12, maxClosedRows: 0 });
  await room.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(room.locator('.room-row > span:first-child')).toHaveText(kitchenMemberNames.filter(name => !['Radiator', 'Room temperature'].includes(name)));
  await expect(room.locator('.room-row').filter({ hasText: 'Kitchen radio' })).toContainText('Unavailable');
  const updates = await page.evaluate(async () => {
    const w = window as any;
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const old = w.fixtureHost.states['switch.kitchen_coffee'];
      w.fixtureHost = { ...w.fixtureHost, states: { ...w.fixtureHost.states,
        'switch.kitchen_coffee': { ...old, state: i % 2 ? 'on' : 'off' },
        'sensor.hall_motion': { ...w.fixtureHost.states['sensor.hall_motion'], state: String(i) },
      } };
      const start = performance.now();
      w.fixtureRoom.hass = w.fixtureHost;
      await w.fixtureRoom.updateComplete;
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    return { relevantUpdates: samples.length, updateP50Ms: samples[15], updateP95Ms: samples[28], openRows: w.fixtureRoom.shadowRoot.querySelectorAll('.room-control').length };
  });
  await expect(room.locator('.room-row').filter({ hasText: 'Espresso machine' })).toContainText('On');
  expect(updates.openRows).toBe(5);
  await info.attach('room-reconnect-baseline.json', { body: JSON.stringify({ dataset: 'simulated kitchen v1', ...result, ...updates }, null, 2), contentType: 'application/json' });
});

test('saved visual room edit preserves legacy fields and opens as a read-only preview', async ({ page }, info) => {
  await page.evaluate(config => {
    const w = window as any;
    w.fixtureInput = structuredClone(config);
    const editor = document.createElement('navet-card-editor') as any;
    editor.id = 'fixture-editor';
    editor.hass = w.fixtureHost;
    editor.setConfig(w.fixtureInput);
    editor.addEventListener('config-changed', (event: any) => { w.fixtureSaved = JSON.parse(JSON.stringify(event.detail.config)); });
    document.querySelector('main')!.append(editor);
  }, legacyKitchenConfig);
  const editor = page.locator('#fixture-editor');
  await editor.getByLabel('Name', { exact: true }).fill('Breakfast room');
  await editor.getByLabel('Name', { exact: true }).dispatchEvent('change');
  const saved = await page.evaluate(() => (window as any).fixtureSaved);
  expect(saved).toEqual({ ...legacyKitchenConfig, name: 'Breakfast room' });
  expect(await page.evaluate(() => (window as any).fixtureInput)).toEqual(legacyKitchenConfig);
  await page.evaluate(async () => {
    const w = window as any;
    document.querySelector('#fixture-editor')!.remove();
    const reopened = document.createElement('navet-card-editor') as any;
    reopened.id = 'fixture-editor';
    reopened.hass = w.fixtureHost;
    reopened.setConfig(w.fixtureSaved);
    document.querySelector('main')!.append(reopened);
    w.fixtureRoom.setConfig(w.fixtureSaved);
    w.fixtureRoom.preview = true;
    history.replaceState(null, '', '#fixture-kitchen');
    window.dispatchEvent(new Event('location-changed'));
    await w.fixtureRoom.updateComplete;
  });
  await expect(editor.getByLabel('Name', { exact: true })).toHaveValue('Breakfast room');
  const room = page.locator('#fixture-room');
  await expect(room.getByRole('button', { name: 'Controls', exact: true })).toBeEnabled();
  await expect(room.locator('.room-control')).toHaveCount(0);
  await expect(room.getByRole('dialog')).not.toBeVisible();
  const previewHash = await page.evaluate(() => location.hash);
  await room.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(room.getByRole('dialog')).toBeVisible();
  await expect(room.locator('.room-control')).toHaveCount(7);
  expect(await room.locator('.room-control button:enabled, .room-control input:enabled, .room-control select:enabled').count()).toBe(0);
  expect(await page.evaluate(() => location.hash)).toBe(previewHash);
  await page.keyboard.press('Escape');
  await expect(room.locator('.room-control')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).fixtureCalls)).toEqual([]);
  await info.attach('room-config-roundtrip.json', { body: JSON.stringify({ dataset: 'simulated kitchen v1', saved, previewServiceCalls: 0, closedRows: 0 }, null, 2), contentType: 'application/json' });
});
