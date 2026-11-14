import { expect, test } from '@playwright/test';
import { kitchenFixture } from '../fixtures/kitchen';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => (window as any).cards?.length === 7);
  await page.evaluate(fixture => {
    const w = window as any;
    const main = document.querySelector('main')!;
    main.replaceChildren(); main.setAttribute('style', 'display:grid;gap:20px;max-width:560px;padding:20px;margin:auto');
    history.replaceState({ host: 'preserve' }, '', location.pathname);
    w.popupCalls = []; w.popupDetails = []; w.popupCards = []; w.popupEventOrder = [];
    window.addEventListener('popstate', () => w.popupEventOrder.push('popstate'));
    w.popupHost = { ...fixture, async callService(...args: unknown[]) { w.popupCalls.push(args); } };
    document.addEventListener('hass-more-info', (event: any) => {
      w.popupEventOrder.push('details');
      w.popupDetails.push({ id: event.detail.entityId, modalOpen: !!document.querySelector('#popup-kitchen')!.shadowRoot!.querySelector('dialog[open]') });
    });
    w.addPopup = (id: string, options = {}, preview = false) => {
      const card = document.createElement('navet-room-card') as any;
      card.id = id; card.preview = preview;
      card.setConfig({ type: 'custom:navet-room-card', name: id, area: 'kitchen', panel_id: '#kitchen', popup: { scope: 'ground', ...options } });
      card.hass = w.popupHost; main.append(card); w.popupCards.push(card); return card;
    };
    w.addPopup('popup-kitchen');
    w.updatePopupState = (state: string) => {
      const old = w.popupHost.states['binary_sensor.kitchen_window'];
      w.popupHost = { ...w.popupHost, states: { ...w.popupHost.states, 'binary_sensor.kitchen_window': { ...old, state } } };
      w.popupCards.forEach((card: any) => { card.hass = w.popupHost; });
    };
  }, kitchenFixture);
});

test('scoped panels switch once, reconcile direct links and return with browser back', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.addPopup('popup-upstairs', { scope: 'upstairs' });
    w.addPopup('popup-duplicate');
    w.navigatePopup = (hash: string) => { history.pushState({}, '', hash); window.dispatchEvent(new Event('location-changed')); };
    w.navigatePopup('#ground--kitchen');
  });
  const first = page.locator('#popup-kitchen'), second = page.locator('#popup-upstairs');
  await expect(first.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#popup-duplicate').getByRole('dialog')).not.toBeVisible();
  await page.evaluate(() => (window as any).navigatePopup('#upstairs--kitchen'));
  await expect(second.getByRole('dialog')).toBeVisible();
  await expect(first.getByRole('dialog')).not.toBeVisible();
  await page.goBack();
  await expect(first.getByRole('dialog')).toBeVisible();
  await expect(second.getByRole('dialog')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(first.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('state trigger dismissal survives relevant updates until a false-to-true transition', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.popupCards[0].setConfig({ type: 'custom:navet-room-card', area: 'kitchen', panel_id: '#kitchen', popup: { scope: 'ground', trigger: { entity: 'binary_sensor.kitchen_window', state: 'on' } } });
    w.updatePopupState('on');
  });
  const room = page.locator('#popup-kitchen');
  await expect(room.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  await page.evaluate(() => { const w = window as any; for (let index = 0; index < 4; index++) w.updatePopupState('on'); });
  await expect(room.getByRole('dialog')).not.toBeVisible();
  await expect(room.locator('.room-control')).toHaveCount(0);
  await page.evaluate(() => { const w = window as any; w.updatePopupState('off'); w.updatePopupState('on'); });
  await expect(room.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => (window as any).popupCalls)).toEqual([]);
});

test('timeout closes once and native details follow popup close without losing dashboard route', async ({ page }) => {
  const room = page.locator('#popup-kitchen');
  await page.evaluate(() => {
    (window as any).popupCards[0].setConfig({ type: 'custom:navet-room-card', area: 'kitchen', panel_id: '#kitchen', popup: { scope: 'ground', timeout: 0.3 } });
  });
  await room.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(room.getByRole('dialog')).toBeVisible();
  await expect(room.getByRole('dialog')).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  await page.evaluate(() => { (window as any).popupCards[0].setConfig({ type: 'custom:navet-room-card', area: 'kitchen', panel_id: '#kitchen', popup: { scope: 'ground' } }); });
  const dashboardRoute = new URL(page.url()).pathname;
  await page.evaluate(() => { (window as any).popupEventOrder = []; });
  await room.getByRole('button', { name: 'Controls', exact: true }).click();
  await room.locator('.room-row').filter({ hasText: 'Window contact' }).click();
  await expect(room.getByRole('dialog')).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  await expect.poll(() => page.evaluate(() => (window as any).popupDetails.length)).toBe(1);
  expect(new URL(page.url()).pathname).toBe(dashboardRoute);
  expect(await page.evaluate(() => (window as any).popupDetails)).toEqual([{ id: 'binary_sensor.kitchen_window', modalOpen: false }]);
  expect(await page.evaluate(() => (window as any).popupEventOrder)).toEqual(['popstate', 'details']);
});

test('preview ignores hash and trigger but opens read-only without changing history', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any, card = w.popupCards[0];
    card.preview = true;
    card.setConfig({ type: 'custom:navet-room-card', area: 'kitchen', panel_id: '#kitchen', popup: { scope: 'ground', timeout: 0.1, trigger: { entity: 'light.kitchen_ceiling', state: 'on' } } });
    history.replaceState({}, '', '#ground--kitchen'); window.dispatchEvent(new Event('location-changed'));
  });
  const room = page.locator('#popup-kitchen');
  await expect(room.getByRole('dialog')).not.toBeVisible();
  const length = await page.evaluate(() => history.length);
  await room.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(room.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => (window as any).updatePopupState('on'));
  await expect(room.getByRole('dialog')).toBeVisible();
  expect(await room.locator('.room-control button:enabled, .room-control input:enabled, .room-control select:enabled').count()).toBe(0);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => ({ length: history.length, hash: location.hash, calls: (window as any).popupCalls }))).toEqual({ length, hash: '#ground--kitchen', calls: [] });
});

test('phone footer has active navigation and fullscreen popup supports header swipe', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const w = window as any;
    w.popupCards[0].setConfig({ type: 'custom:navet-room-card', name: 'Kitchen controls', area: 'kitchen', panel_id: '#kitchen', popup: { scope: 'ground', size: 'fullscreen', swipe: true } });
    const navigation = document.createElement('navet-navigation-card') as any;
    navigation.id = 'popup-navigation'; navigation.setConfig({ type: 'custom:navet-navigation-card', name: 'Rooms', navigation_position: 'fixed', navigation_offset: 12, links: [{ name: 'Home', path: '#home' }, { name: 'Kitchen', path: '#ground--kitchen' }] });
    navigation.hass = w.popupHost; document.querySelector('main')!.append(navigation);
    history.replaceState({}, '', '#home'); window.dispatchEvent(new Event('location-changed'));
  });
  const navigation = page.locator('#popup-navigation');
  await expect(navigation.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
  const geometry = await navigation.getByRole('navigation').evaluate(element => {
    const rect = element.getBoundingClientRect(); return { position: getComputedStyle(element).position, bottom: innerHeight - rect.bottom, width: rect.width, right: rect.right };
  });
  expect(geometry.position).toBe('fixed'); expect(geometry.bottom).toBeCloseTo(12); expect(geometry.width).toBeLessThan(390); expect(geometry.right).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('phone-fixed-navigation.png') });
  await navigation.getByRole('button', { name: 'Kitchen', exact: true }).click();
  await expect(navigation.getByRole('button', { name: 'Kitchen', exact: true })).toHaveAttribute('aria-current', 'page');
  const room = page.locator('#popup-kitchen'), dialog = room.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const rect = await dialog.boundingBox(); expect(rect?.width).toBeCloseTo(390); expect(rect?.height).toBeCloseTo(844);
  await page.screenshot({ path: info.outputPath('phone-fullscreen-popup.png') });
  const header = room.locator('.dialog-header h2');
  await header.dispatchEvent('pointerdown', { pointerId: 1, clientX: 30, clientY: 30 });
  await dialog.dispatchEvent('pointerup', { pointerId: 1, clientX: 35, clientY: 130 });
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => (window as any).popupCalls)).toEqual([]);
});
