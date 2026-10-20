import { expect, test } from '@playwright/test';
import { kitchenFixture } from '../fixtures/kitchen';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => customElements.get('navet-condition-field'));
  await page.evaluate((fixture) => {
    const w = window as any;
    w.attributeCalls = [];
    w.attributeHost = { ...fixture, states: { ...fixture.states,
      'sensor.kitchen_temperature': { ...fixture.states['sensor.kitchen_temperature'], attributes: { ...fixture.states['sensor.kitchen_temperature'].attributes, enabled: true, limit: 0, nullable: null } },
    }, async callService(...args: unknown[]) { w.attributeCalls.push(args); } };
    w.attributeInput = { type: 'custom:navet-switch-card', entity: 'switch.kitchen_coffee', name: 'Coffee', future_card: { keep: true }, sub_controls: [{
      entity: 'light.kitchen_ceiling', name: 'Conditional light', control: 'toggle', future_sub: { keep: true },
      visible_when: { entity: 'sensor.kitchen_temperature', state: '21.3', future_condition: { keep: true } },
    }] };
    const editor = document.createElement('navet-card-editor') as any;
    editor.id = 'attribute-editor'; editor.hass = w.attributeHost; editor.setConfig(w.attributeInput);
    editor.addEventListener('config-changed', (event: any) => { w.attributeSaved = structuredClone(event.detail.config); });
    document.querySelector('main')!.append(editor);
  }, kitchenFixture);
});

test('parent editor authors typed attribute equality and runtime follows only relevant attribute updates', async ({ page }) => {
  const editor = page.locator('#attribute-editor');
  await editor.locator('summary').filter({ hasText: /^Sub-controls$/ }).click();
  const field = editor.locator('navet-condition-field');
  await field.getByLabel('Condition type', { exact: true }).selectOption('attribute');
  await field.getByLabel('Attribute name', { exact: true }).fill('enabled');
  await field.getByLabel('Attribute name', { exact: true }).dispatchEvent('change');
  await field.getByLabel('Attribute value type', { exact: true }).selectOption('boolean');
  await field.getByLabel('Attribute equals', { exact: true }).selectOption('true');
  const saved = await page.evaluate(() => (window as any).attributeSaved);
  expect(saved.sub_controls[0].visible_when).toEqual({ entity: 'sensor.kitchen_temperature', attribute: 'enabled', equals: true, future_condition: { keep: true } });
  expect(saved.future_card).toEqual({ keep: true });
  expect(saved.sub_controls[0].future_sub).toEqual({ keep: true });
  await page.evaluate(() => {
    const w = window as any;
    const editor = document.querySelector('#attribute-editor') as any;
    editor.setConfig(JSON.parse(JSON.stringify(w.attributeSaved)));
    for (const preview of [false, true]) {
      const card = document.createElement('navet-switch-card') as any;
      card.id = preview ? 'attribute-preview' : 'attribute-live'; card.preview = preview;
      card.setConfig(w.attributeSaved); card.hass = w.attributeHost;
      document.querySelector('main')!.append(card);
    }
  });
  await expect(field.getByLabel('Attribute value type', { exact: true })).toHaveValue('boolean');
  await expect(field.getByLabel('Attribute equals', { exact: true })).toHaveValue('true');
  const live = page.locator('#attribute-live');
  const preview = page.locator('#attribute-preview');
  await expect(live.getByRole('button', { name: /Conditional light/ })).toBeVisible();
  await expect(preview.getByRole('button', { name: /Conditional light/ })).toBeDisabled();
  const hash = await page.evaluate(() => location.hash);
  await preview.getByRole('button', { name: /Conditional light/ }).dispatchEvent('click');
  const updates = await page.evaluate(async () => {
    const w = window as any;
    const card = document.querySelector('#attribute-live') as any;
    let renders = 0;
    const render = card.render.bind(card); card.render = () => { renders++; return render(); };
    w.attributeHost = { ...w.attributeHost, states: { ...w.attributeHost.states, 'sensor.hall_motion': { ...w.attributeHost.states['sensor.hall_motion'], state: '20' } } };
    card.hass = w.attributeHost; await card.updateComplete;
    const unrelated = renders;
    const sensor = w.attributeHost.states['sensor.kitchen_temperature'];
    w.attributeHost = { ...w.attributeHost, states: { ...w.attributeHost.states, 'sensor.kitchen_temperature': { ...sensor, attributes: { ...sensor.attributes, enabled: false } } } };
    card.hass = w.attributeHost; await card.updateComplete;
    return { unrelated, relevant: renders - unrelated };
  });
  expect(updates.unrelated).toBe(0);
  expect(updates.relevant).toBeGreaterThan(0);
  await expect(live.getByRole('button', { name: /Conditional light/ })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).attributeCalls)).toEqual([]);
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  expect(await page.evaluate(() => (window as any).attributeInput.sub_controls[0].visible_when)).toEqual({ entity: 'sensor.kitchen_temperature', state: '21.3', future_condition: { keep: true } });
});

test('attribute fields preserve invalid numeric drafts, strict values, mode changes and null semantics', async ({ page }) => {
  const editor = page.locator('#attribute-editor');
  await editor.locator('summary').filter({ hasText: /^Sub-controls$/ }).click();
  const field = editor.locator('navet-condition-field');
  await field.getByLabel('Condition type', { exact: true }).selectOption('attribute');
  await field.getByLabel('Attribute name', { exact: true }).fill('limit');
  await field.getByLabel('Attribute name', { exact: true }).dispatchEvent('change');
  await field.getByLabel('Attribute value type', { exact: true }).selectOption('number');
  await field.getByLabel('Attribute equals', { exact: true }).fill('');
  await field.getByLabel('Attribute equals', { exact: true }).dispatchEvent('change');
  await expect(field.getByRole('alert')).toContainText('finite');
  expect((await page.evaluate(() => (window as any).attributeSaved)).sub_controls[0].visible_when.equals).toBe(0);
  await field.getByLabel('Attribute equals', { exact: true }).fill('5');
  await field.getByLabel('Attribute equals', { exact: true }).dispatchEvent('change');
  await expect(field.getByRole('alert')).toHaveCount(0);
  expect((await page.evaluate(() => (window as any).attributeSaved)).sub_controls[0].visible_when.equals).toBe(5);
  await field.getByLabel('Attribute value type', { exact: true }).selectOption('null');
  await expect(field).toContainText('not a missing attribute');
  expect((await page.evaluate(() => (window as any).attributeSaved)).sub_controls[0].visible_when.equals).toBeNull();
  await field.getByLabel('Condition type', { exact: true }).selectOption('state');
  const state = (await page.evaluate(() => (window as any).attributeSaved)).sub_controls[0].visible_when;
  expect(state).toEqual({ entity: 'sensor.kitchen_temperature', state: 'on', future_condition: { keep: true } });
});
