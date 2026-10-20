import { test, expect } from '@playwright/test';
import { kitchenFixture, legacyKitchenConfig } from '../fixtures/kitchen';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => customElements.get('navet-room-editor'));
  await page.evaluate(({ fixture, config }) => {
    const w = window as any;
    w.roomEditorCalls = [];
    w.roomEditorInput = structuredClone(config);
    w.roomEditorHost = { ...fixture, async callService(...args: unknown[]) { w.roomEditorCalls.push(args); } };
    const editor = document.createElement('navet-room-editor') as any;
    editor.id = 'room-setup'; editor.config = w.roomEditorInput; editor.hass = w.roomEditorHost;
    editor.addEventListener('room-config-changed', (event: any) => { w.savedRoomSetup = JSON.parse(JSON.stringify(event.detail.config)); });
    document.querySelector('main')!.append(editor);
  }, { fixture: kitchenFixture, config: legacyKitchenConfig });
});

test('authors kitchen recipe without YAML, previews read-only and reopens losslessly', async ({ page }, info) => {
  const editor = page.locator('#room-setup');
  await editor.getByRole('button', { name: 'Customize room setup' }).click();
  await editor.getByLabel('Apply room recipe').selectOption('kitchen');
  await editor.locator('summary').filter({ hasText: 'Device labels, roles and controls' }).click();
  await editor.getByLabel('Label for switch.kitchen_coffee', { exact: true }).fill('Morning coffee');
  await editor.getByLabel('Label for switch.kitchen_coffee', { exact: true }).dispatchEvent('change');
  await editor.getByLabel('Control for switch.kitchen_coffee', { exact: true }).selectOption('state');
  await editor.locator('summary').filter({ hasText: 'Sections and order' }).click();
  await editor.getByLabel('Section 1 name', { exact: true }).fill('Kitchen readings');
  await editor.getByLabel('Section 1 name', { exact: true }).dispatchEvent('change');
  await editor.getByRole('button', { name: 'Move section 3 up', exact: true }).click();
  const preview = editor.locator('navet-room-card');
  await preview.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(preview.locator('.room-row').filter({ hasText: 'Morning coffee' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).roomEditorCalls)).toEqual([]);
  expect(await page.evaluate(() => (window as any).savedRoomSetup)).toBeUndefined();
  await page.keyboard.press('Escape');
  await editor.getByRole('button', { name: 'Save room setup', exact: true }).click();
  const saved = await page.evaluate(() => (window as any).savedRoomSetup);
  expect(saved.config_version).toBe(2);
  expect(saved.room.membership.mode).toBe('area');
  expect(saved.room.sections.map((section: any) => section.id)).toEqual(['readings', 'devices', 'lights']);
  expect(saved.room.members.find((member: any) => member.entity === 'switch.kitchen_coffee')).toMatchObject({ name: 'Morning coffee', control: 'state' });
  expect(saved.custom_field).toEqual(legacyKitchenConfig.custom_field);
  expect(saved.hold_action).toEqual(legacyKitchenConfig.hold_action);
  expect(saved.grid_options).toEqual(legacyKitchenConfig.grid_options);
  expect(await page.evaluate(() => (window as any).roomEditorInput)).toEqual(legacyKitchenConfig);
  await page.evaluate(() => {
    const w = window as any;
    (document.querySelector('#room-setup') as any).config = JSON.parse(JSON.stringify(w.savedRoomSetup));
  });
  await expect(editor.getByLabel('Membership', { exact: true })).toHaveValue('area');
  await editor.screenshot({ path: info.outputPath('room-setup-kitchen.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.screenshot({ path: info.outputPath('room-setup-kitchen-phone.png') });
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await info.attach('kitchen-room-snapshot.json', { body: JSON.stringify(saved, null, 2), contentType: 'application/json' });
});

test('live exclusions and snapshot membership stay explicit; cancel discards draft', async ({ page }) => {
  const editor = page.locator('#room-setup');
  await editor.getByRole('button', { name: 'Customize room setup' }).click();
  await editor.locator('summary').filter({ hasText: 'Include and exclude entities' }).click();
  const excluded = editor.locator('navet-ordered-entities').filter({ hasText: 'Excluded entities' });
  await excluded.getByLabel('Add entity', { exact: true }).selectOption('switch.kitchen_coffee');
  await expect(editor.getByLabel('Room setup preview')).toContainText('6 entities');
  await editor.getByRole('button', { name: 'Freeze current membership as snapshot' }).click();
  await expect(editor.getByLabel('Membership', { exact: true })).toHaveValue('explicit');
  await editor.getByRole('button', { name: 'Save room setup', exact: true }).click();
  const saved = await page.evaluate(() => (window as any).savedRoomSetup);
  expect(saved.room.membership.entities).toHaveLength(6);
  expect(saved.room.membership.entities).not.toContain('switch.kitchen_coffee');
  expect(saved.room.membership.exclude).toBeUndefined();
  await editor.getByLabel('Membership', { exact: true }).selectOption('area');
  await editor.getByLabel('Room area', { exact: true }).selectOption('hall');
  await editor.getByRole('button', { name: 'Cancel room changes', exact: true }).click();
  await expect(editor.getByLabel('Membership', { exact: true })).toHaveValue('explicit');
  expect(await page.evaluate(() => (window as any).savedRoomSetup)).toEqual(saved);
});

test('snapshot import and visual entity remap preserve source and advanced fields', async ({ page }) => {
  const editor = page.locator('#room-setup');
  await editor.getByRole('button', { name: 'Customize room setup' }).click();
  await editor.getByLabel('Apply room recipe').selectOption('entry');
  await editor.locator('summary').filter({ hasText: 'Duplicate, import and remap' }).click();
  await editor.getByRole('button', { name: 'Export room snapshot', exact: true }).click();
  const snapshot = await editor.getByLabel('Room snapshot JSON').inputValue();
  await editor.getByLabel('Room snapshot JSON').fill(snapshot);
  await editor.getByRole('button', { name: 'Load snapshot into draft' }).click();
  await editor.getByLabel('Remap light.kitchen_ceiling', { exact: true }).selectOption('light.hall_override');
  await editor.getByRole('button', { name: 'Save room setup', exact: true }).click();
  const saved = await page.evaluate(() => (window as any).savedRoomSetup);
  expect(saved.room.membership.mode).toBe('explicit');
  expect(saved.room.membership.entities).toContain('light.hall_override');
  expect(saved.room.membership.entities).not.toContain('light.kitchen_ceiling');
  expect(saved.custom_field).toEqual(legacyKitchenConfig.custom_field);
  expect(JSON.parse(snapshot).room.members.some((member: any) => member.entity === 'light.kitchen_ceiling')).toBe(true);
  expect(await page.evaluate(() => (window as any).roomEditorCalls)).toEqual([]);
  await editor.getByLabel('Room snapshot JSON').fill('{malformed');
  await editor.getByRole('button', { name: 'Load snapshot into draft' }).click();
  await expect(editor.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => (window as any).savedRoomSetup)).toEqual(saved);
});

test('missing registry supports explicit room setup and empty room preview', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    const editor = document.querySelector('#room-setup') as any;
    editor.config = { type: 'custom:navet-room-card', config_version: 2, room: { membership: { mode: 'explicit', entities: [] } } };
    editor.hass = { ...w.roomEditorHost, entities: undefined, areas: undefined, devices: undefined };
  });
  const editor = page.locator('#room-setup');
  await expect(editor.getByText('No area registry is available. Entity selection works without it.')).toBeVisible();
  await expect(editor.getByLabel('Room setup preview')).toContainText('No entities selected');
  await editor.locator('navet-ordered-entities').getByLabel('Add entity', { exact: true }).selectOption('light.kitchen_ceiling');
  await expect(editor.getByLabel('Room setup preview')).toContainText('1 entities');
  await editor.getByRole('button', { name: 'Save room setup', exact: true }).click();
  expect((await page.evaluate(() => (window as any).savedRoomSetup)).room.membership.entities).toEqual(['light.kitchen_ceiling']);
});

test('unsaved room draft survives edits to parent card name and appearance', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    document.querySelector('#room-setup')!.remove();
    const outer = document.createElement('navet-card-editor') as any;
    outer.id = 'parent-editor'; outer.hass = w.roomEditorHost; outer.setConfig(w.roomEditorInput);
    outer.addEventListener('config-changed', (event: any) => { w.savedOuterRoom = structuredClone(event.detail.config); });
    document.querySelector('main')!.append(outer);
  });
  const outer = page.locator('#parent-editor');
  const room = outer.locator('navet-room-editor');
  await room.getByRole('button', { name: 'Customize room setup' }).click();
  await room.getByLabel('Apply room recipe').selectOption('kitchen');
  await outer.getByLabel('Name', { exact: true }).fill('Breakfast kitchen');
  await outer.getByLabel('Name', { exact: true }).dispatchEvent('change');
  await outer.locator('summary').filter({ hasText: /^Appearance$/ }).click();
  await outer.getByLabel('Accent color', { exact: true }).fill('#abcdef');
  await outer.getByLabel('Accent color', { exact: true }).dispatchEvent('change');
  await expect(room.getByLabel('Membership', { exact: true })).toHaveValue('area');
  await expect(room.getByLabel('Room setup preview')).toContainText('Lighting');
  await room.getByRole('button', { name: 'Save room setup', exact: true }).click();
  const saved = await page.evaluate(() => (window as any).savedOuterRoom);
  expect(saved.name).toBe('Breakfast kitchen');
  expect(saved.appearance.accent).toBe('#abcdef');
  expect(saved.config_version).toBe(2);
  expect(saved.room.sections.map((section: any) => section.id)).toEqual(['readings', 'lights', 'devices']);
  expect(saved.custom_field).toEqual(legacyKitchenConfig.custom_field);
});

test('relevant live updates preserve the open parent room preview without commands or navigation', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    document.querySelector('#room-setup')!.remove();
    const outer = document.createElement('navet-card-editor') as any;
    outer.id = 'live-parent-editor'; outer.hass = w.roomEditorHost;
    outer.setConfig({ type: 'custom:navet-room-card', config_version: 2, area: 'kitchen', panel_id: '#preview-live', room: { membership: { mode: 'area' } } });
    document.querySelector('main')!.append(outer);
  });
  const outer = page.locator('#live-parent-editor');
  const preview = outer.locator('navet-room-editor navet-room-card');
  const hash = await page.evaluate(() => location.hash);
  await preview.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(preview.getByRole('dialog')).toBeVisible();
  const coffee = preview.locator('.room-control').filter({ hasText: 'Espresso machine' });
  await expect(coffee).toContainText('Off');
  await page.evaluate(async () => {
    const w = window as any;
    w.roomEditorHost = { ...w.roomEditorHost, states: { ...w.roomEditorHost.states, 'switch.kitchen_coffee': { ...w.roomEditorHost.states['switch.kitchen_coffee'], state: 'on' } } };
    const editor = document.querySelector('#live-parent-editor') as any;
    editor.hass = w.roomEditorHost; await editor.updateComplete;
  });
  await expect(preview.getByRole('dialog')).toBeVisible();
  await expect(coffee).toContainText('On');
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  expect(await page.evaluate(() => (window as any).roomEditorCalls)).toEqual([]);
});
