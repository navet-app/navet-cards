import { test, expect } from '@playwright/test';

test('card and icon gestures stay independent and pending actions cancel in preview or replacement', async ({ page }) => {
  await page.goto('/demo/');
  await page.evaluate(() => {
    const w = window as any;
    w.cards[0].setConfig({ ...w.configs[0], tap_action: { action: 'more-info' },
      icon_tap_action: { action: 'perform-action', perform_action: 'scene.turn_on', target: { entity_id: 'scene.evening' } },
      icon_double_tap_action: { action: 'more-info' } });
  });
  const light = page.locator('navet-light-card');
  await light.getByRole('button', { name: 'Kitchen lights', exact: true }).click();
  await expect(page.locator('#events')).toHaveText('More info · light.kitchen');
  const icon = light.getByRole('button', { name: 'Kitchen lights icon', exact: true });
  await icon.click();
  await expect.poll(() => page.evaluate(() => (window as any).calls.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).calls[0].target)).toEqual({ entity_id: 'scene.evening' });
  await icon.dblclick();
  await expect(page.locator('#events')).toHaveText('More info · light.kitchen');
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(1);
  await icon.click();
  await page.evaluate(() => { (window as any).cards[0].preview = true; });
  // A new config clears the same pending timers even if preview is disabled again.
  await page.evaluate(() => { const w = window as any; w.cards[0].setConfig(w.configs[0]); w.cards[0].preview = false; });
  await page.waitForTimeout(320);
  expect(await page.evaluate(() => (window as any).calls.length)).toBe(1);
});
