import { expect, test } from '@playwright/test';
import { mapEntity } from '../../src/providers/home-assistant';

const colorLight = mapEntity({ entity_id: 'light.fixture', state: 'on', attributes: {
  friendly_name: 'Dining pendants', supported_color_modes: ['hs'], hs_color: [32, 70],
  supported_features: 4, effect_list: ['off', 'Candle'], effect: 'off',
} }, 'light', 'light.fixture');

test('light color widget emits normalized intents and remains read-only while disabled or unavailable', async ({ page }, info) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => (window as any).cards?.length === 7);
  await page.evaluate(() => { const w = window as any; const state = w.demoHass.states['light.kitchen']; w.demoHass = { ...w.demoHass, states: { ...w.demoHass.states, 'light.kitchen': { ...state, attributes: { ...state.attributes, supported_color_modes: ['hs'], hs_color: [32,70] } } } }; w.cards[0].setConfig({ ...w.configs[0], layout: 'comfortable' }); w.syncCards(); });
  await page.locator('navet-light-card').getByText('Color and effects', { exact: true }).click();
  await page.waitForFunction(() => customElements.get('navet-light-color'));
  await page.evaluate(entity => {
    const w = window as any;
    w.colorIntents = [];
    const control = document.createElement('navet-light-color') as any;
    control.id = 'color-control'; control.entity = entity;
    control.addEventListener('control-command', (event: any) => w.colorIntents.push(event.detail.command));
    document.querySelector('main')!.replaceChildren(control);
  }, colorLight);
  const control = page.locator('#color-control');
  await expect(control.getByRole('slider', { name: 'Hue', exact: true })).toHaveValue('32');
  await expect(control.getByRole('slider', { name: 'Saturation', exact: true })).toHaveValue('70');
  await control.getByRole('slider', { name: 'Hue', exact: true }).evaluate((input: HTMLInputElement) => { input.value = '120'; });
  await control.getByRole('slider', { name: 'Hue', exact: true }).dispatchEvent('change');
  await control.getByRole('combobox', { name: 'Effect', exact: true }).selectOption('Candle');
  expect(await page.evaluate(() => (window as any).colorIntents)).toEqual([
    { type: 'color', hue: 120, saturation: 70 }, { type: 'effect', value: 'Candle' },
  ]);
  await page.evaluate(async () => {
    const el = document.querySelector('#color-control') as any;
    el.disabled = true; await el.updateComplete;
    el.shadowRoot.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
    el.shadowRoot.querySelector('select').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(control.getByRole('slider', { name: 'Hue', exact: true })).toBeDisabled();
  await page.evaluate(async () => {
    const el = document.querySelector('#color-control') as any;
    el.disabled = false; el.entity = { ...el.entity, available: false }; await el.updateComplete;
    el.shadowRoot.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(await page.evaluate(() => (window as any).colorIntents)).toHaveLength(2);
  await expect(control.getByRole('combobox', { name: 'Effect', exact: true })).toBeDisabled();
  await info.attach('light-color-controls.png', { body: await control.screenshot(), contentType: 'image/png' });
});
