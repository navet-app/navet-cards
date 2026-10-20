import { expect, test } from '@playwright/test';
import { kitchenFixture } from '../fixtures/kitchen';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => customElements.get('navet-action-field') && customElements.get('navet-ordered-entities') && customElements.get('navet-condition-field'));
  await page.evaluate(fixture => {
    const w = window as any;
    w.fieldChanges = [];
    w.fieldCalls = [];
    w.fieldHost = { ...fixture, services: { scene: { turn_on: {} }, light: { turn_on: {}, turn_off: {} } }, callService(...args: unknown[]) { w.fieldCalls.push(args); } };
    w.mountField = (tag: string, value: unknown) => {
      const el = document.createElement(tag) as any;
      el.id = 'field';
      el.value = structuredClone(value);
      el.hass = w.fieldHost;
      el.addEventListener('value-changed', (event: any) => { w.fieldChanges.push(event.detail.value); el.value = event.detail.value; });
      document.querySelector('main')!.replaceChildren(el);
      return el;
    };
  }, kitchenFixture);
});

test('ordered entity selector preserves order through add, move and remove in fallback and native host', async ({ page }) => {
  await page.evaluate(() => { const field = (window as any).mountField('navet-ordered-entities', ['light.kitchen_ceiling', 'switch.kitchen_coffee']); field.domains = ['light', 'cover', 'climate']; });
  const field = page.locator('#field');
  await expect(field).toContainText('Ceiling pendants');
  await expect(field).toContainText('Espresso machine');
  await expect(field.getByLabel('Add entity', { exact: true }).locator('option[value="sensor.kitchen_temperature"]')).toHaveCount(0);
  await field.getByRole('button', { name: 'Move light.kitchen_ceiling down', exact: true }).click();
  await field.getByLabel('Add entity', { exact: true }).selectOption('cover.kitchen_blind');
  await field.getByRole('button', { name: 'Remove switch.kitchen_coffee', exact: true }).click();
  expect(await page.evaluate(() => (window as any).fieldChanges.at(-1))).toEqual(['light.kitchen_ceiling', 'cover.kitchen_blind']);
  await page.evaluate(async () => {
    class Form extends HTMLElement {}
    customElements.define('ha-form', Form);
    const field = document.querySelector('#field') as any;
    field.requestUpdate(); await field.updateComplete;
    field.shadowRoot.querySelector('ha-form').dispatchEvent(new CustomEvent('value-changed', { detail: { value: { entity: 'climate.kitchen_radiator' } }, bubbles: true, composed: true }));
  });
  expect(await page.evaluate(() => (window as any).fieldChanges.at(-1))).toEqual(['light.kitchen_ceiling', 'cover.kitchen_blind', 'climate.kitchen_radiator']);
  expect(await page.evaluate(() => (window as any).fieldCalls)).toEqual([]);
});

test('service authoring preserves advanced fields, handles invalid drafts, and sends no commands', async ({ page }, info) => {
  const original = { action: 'perform-action', perform_action: 'scene.turn_on', target: { device_id: ['keep-device'] }, data: { transition: 2 }, future: { retain: true } };
  await page.evaluate(value => (window as any).mountField('navet-action-field', value), original);
  const field = page.locator('#field');
  await field.getByLabel('Target entities', { exact: true }).fill('scene.evening, scene.dinner');
  await field.getByLabel('Target entities', { exact: true }).dispatchEvent('change');
  await field.getByLabel('Target areas', { exact: true }).fill('kitchen');
  await field.getByLabel('Target areas', { exact: true }).dispatchEvent('change');
  await field.getByLabel('Confirm before running', { exact: true }).check();
  await field.getByLabel('Confirmation message', { exact: true }).fill('Set the evening scene?');
  await field.getByLabel('Confirmation message', { exact: true }).dispatchEvent('change');
  await field.getByText('Advanced service data', { exact: true }).click();
  const data = field.getByLabel('Service data (JSON)', { exact: true });
  await data.fill('{'); await data.dispatchEvent('change');
  await expect(field.getByRole('alert')).toBeVisible();
  await data.fill('{"transition":4,"brightness_pct":40}'); await data.dispatchEvent('change');
  await expect(field.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).fieldChanges.at(-1))).toEqual({ ...original,
    target: { device_id: ['keep-device'], entity_id: ['scene.evening', 'scene.dinner'], area_id: ['kitchen'] },
    data: { transition: 4, brightness_pct: 40 }, confirmation: { text: 'Set the evening scene?' },
  });
  expect(await page.evaluate(() => (window as any).fieldCalls)).toEqual([]);
  await info.attach('action-editor.png', { body: await field.screenshot(), contentType: 'image/png' });
});

test('conditions author state and availability while preserving unrelated extension fields', async ({ page }) => {
  await page.evaluate(() => (window as any).mountField('navet-condition-field', { entity: 'light.kitchen_ceiling', state: 'on', future: { keep: true } }));
  const field = page.locator('#field');
  await field.getByLabel('Entity state', { exact: true }).fill('off');
  await field.getByLabel('Entity state', { exact: true }).dispatchEvent('change');
  await field.getByLabel('Condition type', { exact: true }).selectOption('availability');
  await field.getByLabel('Availability', { exact: true }).selectOption('false');
  expect(await page.evaluate(() => (window as any).fieldChanges.at(-1))).toEqual({ entity: 'light.kitchen_ceiling', available: false, future: { keep: true } });
  await field.getByLabel('Condition type', { exact: true }).selectOption('numeric');
  await field.getByLabel('Above (exclusive)', { exact: true }).fill('10');
  await field.getByLabel('Above (exclusive)', { exact: true }).dispatchEvent('change');
  await field.getByLabel('Below (exclusive)', { exact: true }).fill('5');
  await field.getByLabel('Below (exclusive)', { exact: true }).dispatchEvent('change');
  await expect(field.getByRole('alert')).toContainText('Lower bound');
  expect(await page.evaluate(() => (window as any).fieldChanges.at(-1))).toMatchObject({ above: 10 });
  await field.getByLabel('Condition type', { exact: true }).selectOption('none');
  expect(await page.evaluate(() => (window as any).fieldChanges.at(-1))).toBeUndefined();
});


test('incomplete action drafts remain editable until the parent accepts them', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    const field = document.createElement('navet-action-field') as any;
    field.id = 'field'; field.value = { action: 'none', future: 'keep' };
    field.allowToggle = false;
    field.addEventListener('value-changed', (event: any) => w.fieldChanges.push(event.detail.value));
    document.querySelector('main')!.replaceChildren(field);
  });
  const field = page.locator('#field');
  await expect(field.getByLabel('Action type').locator('option[value="toggle"]')).toHaveCount(0);
  await field.getByLabel('Action type').selectOption('perform-action');
  await field.getByLabel('Service', { exact: true }).fill('scene.turn_on');
  await field.getByLabel('Service', { exact: true }).dispatchEvent('change');
  await field.getByLabel('Target entities', { exact: true }).fill('scene.evening');
  await field.getByLabel('Target entities', { exact: true }).dispatchEvent('change');
  expect(await page.evaluate(() => (window as any).fieldChanges.at(-1))).toEqual({ action: 'perform-action', future: 'keep', perform_action: 'scene.turn_on', target: { entity_id: ['scene.evening'] } });
});
