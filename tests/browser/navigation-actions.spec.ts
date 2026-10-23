import { expect, test } from '@playwright/test';
import { kitchenFixture } from '../fixtures/kitchen';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => customElements.get('navet-button-card') && customElements.get('navet-action-field'));
  await page.evaluate((fixture) => {
    const w = window as any;
    w.navigationServices = []; w.openedUrls = [];
    w.navigationHost = { ...fixture, async callService(...args: unknown[]) { w.navigationServices.push(args); } };
    window.open = ((...args: unknown[]) => { w.openedUrls.push(args); return null; }) as typeof window.open;
    w.navigationCard = (id: string, action: unknown, preview = false) => {
      const card = document.createElement('navet-button-card') as any;
      card.id = id; card.preview = preview;
      card.setConfig({ type: 'custom:navet-button-card', name: id, tap_action: action }); card.hass = w.navigationHost;
      document.querySelector('main')!.append(card); return card;
    };
  }, kitchenFixture);
});

test('external URL opens with noopener, cancellation and preview send no effects or services', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.navigationCard('Open help', { action: 'url', url_path: 'https://example.com/navet-help' });
    w.navigationCard('Preview help', { action: 'url', url_path: 'https://example.com/preview' }, true);
    w.navigationCard('Preview back', { action: 'back' }, true);
    w.navigationCard('Cancelled help', { action: 'url', url_path: 'https://example.com/cancelled', confirmation: true });
    window.confirm = () => false;
  });
  const before = page.url();
  await page.locator('#Open\\ help').getByRole('button', { name: 'Open help', exact: true }).click();
  const opened = await page.evaluate(() => (window as any).openedUrls);
  expect(opened).toHaveLength(1);
  expect(opened[0][0]).toBe('https://example.com/navet-help');
  expect(opened[0][1]).toBe('_blank');
  expect(opened[0][2].split(',')).toContain('noopener');
  await page.locator('#Cancelled\\ help').getByRole('button', { name: 'Cancelled help', exact: true }).click();
  for (const name of ['Preview help', 'Preview back']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeDisabled();
    await button.dispatchEvent('click');
  }
  expect(await page.evaluate(() => (window as any).openedUrls)).toEqual(opened);
  expect(page.url()).toBe(before);
  expect(await page.evaluate(() => (window as any).navigationServices)).toEqual([]);
});

test('back restores history after room navigation and replacement preserves history length', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    history.replaceState(null, '', '#action-origin');
    w.navigationCard('Enter room', { action: 'navigate', navigation_path: '#action-room' });
    w.navigationCard('Back', { action: 'back' });
    w.navigationCard('Replace location', { action: 'navigate', navigation_path: '#action-replaced', navigation_replace: true });
    const room = document.createElement('navet-room-card') as any;
    room.id = 'navigation-room'; room.setConfig({ type: 'custom:navet-room-card', area: 'kitchen', panel_id: '#action-room' }); room.hass = w.navigationHost;
    document.querySelector('main')!.append(room);
  });
  await page.getByRole('button', { name: 'Enter room', exact: true }).click();
  await expect(page.locator('#navigation-room').getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('#action-room');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#action-origin');
  await expect(page.locator('#navigation-room').getByRole('dialog')).not.toBeVisible();
  const length = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Replace location', exact: true }).click();
  expect(await page.evaluate(() => location.hash)).toBe('#action-replaced');
  expect(await page.evaluate(() => history.length)).toBe(length);
  expect(await page.evaluate(() => (window as any).navigationServices)).toEqual([]);
});

test('action editor authors external URLs, back and replacement without YAML or side effects', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    const field = document.createElement('navet-action-field') as any;
    field.id = 'navigation-action-field'; field.hass = w.navigationHost; field.value = { action: 'none', future: { keep: true } };
    field.addEventListener('value-changed', (event: any) => { w.lastNavigationAction = structuredClone(event.detail.value); field.value = event.detail.value; });
    document.querySelector('main')!.append(field);
  });
  const field = page.locator('#navigation-action-field');
  await field.getByLabel('Action type', { exact: true }).selectOption('url');
  await field.getByLabel('External URL', { exact: true }).fill('https://example.com/help');
  await field.getByLabel('External URL', { exact: true }).dispatchEvent('change');
  expect(await page.evaluate(() => (window as any).lastNavigationAction)).toMatchObject({ action: 'url', url_path: 'https://example.com/help', future: { keep: true } });
  await field.getByLabel('Action type', { exact: true }).selectOption('back');
  expect((await page.evaluate(() => (window as any).lastNavigationAction)).action).toBe('back');
  await field.getByLabel('Action type', { exact: true }).selectOption('navigate');
  await field.getByLabel('Navigation path', { exact: true }).fill('#kitchen');
  await field.getByLabel('Navigation path', { exact: true }).dispatchEvent('change');
  await field.getByLabel('Replace current history entry', { exact: true }).check();
  expect(await page.evaluate(() => (window as any).lastNavigationAction)).toMatchObject({ action: 'navigate', navigation_path: '#kitchen', navigation_replace: true });
  expect(await page.evaluate(() => (window as any).openedUrls)).toEqual([]);
  expect(await page.evaluate(() => (window as any).navigationServices)).toEqual([]);
});
