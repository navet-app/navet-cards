import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => customElements.get('navet-switch-card'));
  await page.evaluate(() => {
    const w = window as any;
    document.querySelector('main')!.replaceChildren(); w.pressCalls = []; w.pressEvents = [];
    w.pressHost = { states: { 'switch.original': { entity_id: 'switch.original', state: 'off', attributes: { friendly_name: 'Original' } }, 'switch.replacement': { entity_id: 'switch.replacement', state: 'off', attributes: { friendly_name: 'Replacement' } } }, async callService(domain: string, service: string, data: unknown, target: unknown) { w.pressCalls.push({ domain, service, data, target }); } };
    document.addEventListener('ll-custom', (event: any) => w.pressEvents.push(event.detail));
    w.addPressCard = (extra: unknown = {}) => {
      const card = document.createElement('navet-switch-card') as any;
      card.id = 'press-card'; card.setConfig({ type: 'custom:navet-switch-card', entity: 'switch.original', name: 'Press device', tap_action: { action: 'fire-dom-event', unexpectedTap: true }, press_action: { action: 'perform-action', perform_action: 'script.press' }, release_action: { action: 'perform-action', perform_action: 'script.release' }, ...extra as object });
      card.hass = w.pressHost; document.querySelector('main')!.append(card); w.pressCard = card; return card;
    };
  });
});

test('momentary main surface supports pointer, Space and Enter without a trailing tap', async ({ page }) => {
  await page.evaluate(() => (window as any).addPressCard());
  const surface = page.locator('#press-card .primary');
  await expect(surface).toHaveAttribute('data-momentary', '');
  await surface.hover(); await page.mouse.down();
  await expect.poll(() => page.evaluate(() => (window as any).pressCalls.map((call: any) => call.service))).toEqual(['press']);
  await page.mouse.up();
  for (const key of ['Space', 'Enter']) { await surface.focus(); await page.keyboard.down(key); await page.keyboard.up(key); }
  await expect.poll(() => page.evaluate(() => (window as any).pressCalls.map((call: any) => call.service))).toEqual(['press', 'release', 'press', 'release', 'press', 'release']);
  expect(await page.evaluate(() => (window as any).pressEvents)).toEqual([]);
});

test('repeat stops on cancellation and releases the original owner after replacement and disconnect', async ({ page }) => {
  await page.evaluate(() => (window as any).addPressCard({ repeat_action: { action: 'perform-action', perform_action: 'script.repeat' }, repeat_interval: 100 }));
  const surface = page.locator('#press-card .primary');
  await surface.hover(); await page.mouse.down();
  await expect.poll(() => page.evaluate(() => (window as any).pressCalls.some((call: any) => call.service === 'repeat'))).toBe(true);
  await page.evaluate(() => {
    const w = window as any;
    w.pressCard.setConfig({ type: 'custom:navet-switch-card', entity: 'switch.replacement', name: 'Replacement', press_action: { action: 'perform-action', perform_action: 'script.new_press' }, release_action: { action: 'perform-action', perform_action: 'script.new_release' } });
  });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).pressCalls.at(-1)?.service)).toBe('release');
  expect(await page.evaluate(() => (window as any).pressCalls.at(-1).target)).toEqual({ entity_id: 'switch.original' });
  await surface.hover(); await page.mouse.down();
  await expect.poll(() => page.evaluate(() => (window as any).pressCalls.at(-1)?.service)).toBe('new_press');
  await page.evaluate(() => (window as any).pressCard.remove()); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).pressCalls.at(-1)?.service)).toBe('new_release');
  expect(await page.evaluate(() => (window as any).pressCalls.filter((call: any) => call.service === 'release').length)).toBe(1);
});

test('protection gates direct controls and configured actions; preview cannot unlock', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (window as any).addPressCard({ press_action: undefined, release_action: undefined, protection: { enabled: true, unlock_duration: 1 } }));
  const surface = page.locator('#press-card .primary');
  await expect(surface).toBeDisabled();
  await expect(page.getByRole('button', { name: 'On', exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('phone-protected-controls.png') });
  await page.getByRole('button', { name: 'Unlock controls', exact: true }).click();
  await surface.click(); await expect.poll(() => page.evaluate(() => (window as any).pressEvents.length)).toBe(1);
  await page.getByRole('button', { name: 'On', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pressCalls.length)).toBe(1);
  await expect(surface).toBeDisabled({ timeout: 3000 });
  await page.evaluate(() => { (window as any).pressCard.preview = true; });
  const unlock = page.getByRole('button', { name: 'Unlock controls', exact: true });
  if (await unlock.count()) await expect(unlock).toBeDisabled();
  expect(await page.evaluate(() => (window as any).pressCalls.length)).toBe(1);
});

test('interaction editor preserves foreign fields and restricts momentary actions recursively', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any; await (customElements.get('navet-switch-card') as any).getConfigElement();
    await customElements.whenDefined('navet-interaction-fields');
    const editor = document.createElement('navet-interaction-fields') as any;
    editor.config = { type: 'custom:navet-switch-card', entity: 'switch.original', vendor: { preserved: true }, protection: { enabled: false, future: 7 }, press_action: { action: 'sequence', sequence: [{ action: 'perform-action', perform_action: 'script.press', confirmation: true }] } };
    editor.hass = w.pressHost; editor.addEventListener('interaction-config-changed', (event: any) => { w.interactionValue = event.detail.value; editor.config = event.detail.value; });
    document.querySelector('main')!.append(editor);
  });
  await page.getByText('Press and protection', { exact: true }).click();
  const editor = page.locator('navet-interaction-fields');
  const options = await editor.locator('navet-action-field').first().getByLabel('Action type', { exact: true }).first().locator('option').allTextContents();
  expect(options).toEqual(['No action', 'Perform action', 'Action sequence']);
  await expect(editor.getByText('Confirm before running', { exact: true })).toHaveCount(0);
  await editor.getByLabel('Require unlocking before controls and actions').check();
  await editor.getByLabel('Unlock duration (seconds)').fill('8'); await editor.getByLabel('Unlock duration (seconds)').dispatchEvent('change');
  await editor.getByLabel('Service', { exact: true }).fill('script.updated');
  await editor.getByLabel('Service', { exact: true }).dispatchEvent('change');
  const value = await page.evaluate(() => (window as any).interactionValue);
  expect(value.press_action.sequence[0].confirmation).toBeUndefined(); expect(value.press_action.sequence[0].perform_action).toBe('script.updated');
  expect(value.vendor).toEqual({ preserved: true }); expect(value.protection).toEqual({ enabled: true, future: 7, unlock_duration: 8 });
});
