import { expect, test, type Locator, type Page } from '@playwright/test';
import { kitchenFixture } from '../fixtures/kitchen';

// This journey's expanded dataset intentionally leaves the shared seven-member fixture intact.
const journeyFixture = structuredClone(kitchenFixture);
Object.assign(journeyFixture.entities, {
  'light.kitchen_task': { area_id: 'kitchen' },
  'sensor.kitchen_humidity': { area_id: 'kitchen' },
  'binary_sensor.kitchen_motion': { area_id: 'kitchen' },
  'number.kitchen_target': { area_id: 'kitchen' },
  'scene.kitchen_evening': { area_id: 'kitchen' },
});
Object.assign(journeyFixture.states, {
  'light.kitchen_task': { entity_id: 'light.kitchen_task', state: 'off', attributes: { friendly_name: 'Worktop light', supported_color_modes: ['onoff'] } },
  'sensor.kitchen_humidity': { entity_id: 'sensor.kitchen_humidity', state: '45', attributes: { friendly_name: 'Kitchen humidity', device_class: 'humidity', unit_of_measurement: '%' } },
  'binary_sensor.kitchen_motion': { entity_id: 'binary_sensor.kitchen_motion', state: 'on', attributes: { friendly_name: 'Kitchen motion', device_class: 'occupancy' } },
  'number.kitchen_target': { entity_id: 'number.kitchen_target', state: '20', attributes: { friendly_name: 'Room target', min: 10, max: 30, step: 1 } },
  'scene.kitchen_evening': { entity_id: 'scene.kitchen_evening', state: 'unknown', attributes: { friendly_name: 'Evening scene' } },
});
const initial = {
  type: 'custom:navet-room-card', config_version: 2,
  room: { membership: { mode: 'explicit', entities: [] } },
  custom_field: { retain: ['future', { nested: true }] },
  appearance: { future_appearance: true },
};

async function field(locator: Locator, value: string) {
  await locator.fill(value); await locator.dispatchEvent('change');
}
async function mount(page: Page, config: unknown) {
  await page.waitForFunction(() => customElements.get('navet-card-editor') && customElements.get('navet-room-card'));
  await page.evaluate(({ fixture, config }) => {
    const w = window as any;
    w.journeyCalls = [];
    w.journeyInput = structuredClone(config);
    w.journeyHost = { ...fixture, async callService(...args: unknown[]) { w.journeyCalls.push(args); } };
    const editor = document.createElement('navet-card-editor') as any;
    editor.id = 'journey-editor'; editor.hass = w.journeyHost; editor.setConfig(config);
    editor.addEventListener('config-changed', (event: any) => { w.journeySaved = JSON.parse(JSON.stringify(event.detail.config)); });
    document.querySelector('main')!.append(editor);
  }, { fixture: journeyFixture, config });
}

test('complete parent room journey authors, reloads and controls the selected owning entities', async ({ page }, info) => {
  await page.goto('/demo/index.html');
  await mount(page, initial);
  const editor = page.locator('#journey-editor');
  const roomEditor = editor.locator('navet-room-editor');
  await roomEditor.getByLabel('Membership', { exact: true }).selectOption('area');
  await roomEditor.getByLabel('Room area', { exact: true }).selectOption('kitchen');
  await roomEditor.getByLabel('Apply room recipe', { exact: true }).selectOption('kitchen');
  await roomEditor.locator('summary').filter({ hasText: /^Device labels, roles and controls$/ }).click();
  await roomEditor.getByLabel('Role for sensor.kitchen_temperature', { exact: true }).selectOption('temperature');
  await roomEditor.getByLabel('Role for binary_sensor.kitchen_motion', { exact: true }).selectOption('occupancy');
  await roomEditor.locator('summary').filter({ hasText: /^Include and exclude entities$/ }).click();
  const exclusions = roomEditor.locator('navet-ordered-entities').filter({ hasText: 'Excluded entities' });
  await exclusions.getByLabel('Add entity', { exact: true }).selectOption('media_player.kitchen_radio');
  await roomEditor.locator('summary').filter({ hasText: /^Sections and order$/ }).click();
  await roomEditor.getByRole('button', { name: 'Move section 3 up', exact: true }).click();
  await field(roomEditor.getByLabel('Section 1 name', { exact: true }), 'Kitchen readings');
  await field(roomEditor.getByLabel('Room panel hash', { exact: true }), '#journey-kitchen');
  await roomEditor.getByRole('button', { name: 'Save room setup', exact: true }).click();
  await field(editor.getByLabel('Name', { exact: true }), 'Everyday kitchen');
  await field(editor.getByLabel('Icon', { exact: true }), 'mdi:countertop');
  await editor.locator('summary').filter({ hasText: /^Appearance$/ }).click();
  await field(editor.getByLabel('Accent color', { exact: true }), '#b87846');
  const sub = editor.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Sub-controls$/ }) });
  await sub.locator('summary').filter({ hasText: /^Sub-controls$/ }).click();
  await sub.getByRole('button', { name: 'Add sub-control', exact: true }).click();
  await sub.locator('.item > label select').first().selectOption('scene.kitchen_evening');
  await field(sub.getByLabel('Name', { exact: true }), 'Evening shortcut');
  const condition = sub.locator('navet-condition-field');
  await condition.getByLabel('Condition type', { exact: true }).selectOption('state');
  await field(condition.getByLabel('Condition entity', { exact: true }), 'binary_sensor.kitchen_motion');
  await field(condition.getByLabel('Entity state', { exact: true }), 'on');
  const action = sub.locator('navet-action-field').filter({ has: page.getByText('Sub-control tap action', { exact: true }) });
  await action.getByLabel('Action type', { exact: true }).selectOption('perform-action');
  await field(action.getByLabel('Service', { exact: true }), 'scene.turn_on');
  await editor.locator('summary').filter({ hasText: /^Room navigation links$/ }).click();
  await editor.getByRole('button', { name: 'Add link', exact: true }).click();
  await field(editor.getByLabel('Link 1 name', { exact: true }), 'Hall');
  await field(editor.getByLabel('Link 1 path or room hash', { exact: true }), '#hall');
  const saved = await page.evaluate(() => (window as any).journeySaved);
  expect(saved.room.membership).toEqual({ mode: 'area', exclude: ['media_player.kitchen_radio'] });
  expect(saved.room.sections.map((section: any) => section.id)).toEqual(['readings', 'devices', 'lights']);
  expect(saved.room.members.find((member: any) => member.entity === 'sensor.kitchen_temperature').role).toBe('temperature');
  expect(saved.room.members.find((member: any) => member.entity === 'binary_sensor.kitchen_motion').role).toBe('occupancy');
  expect(saved.sub_controls[0]).toMatchObject({ entity: 'scene.kitchen_evening', name: 'Evening shortcut', visible_when: { entity: 'binary_sensor.kitchen_motion', state: 'on' }, tap_action: { action: 'perform-action', perform_action: 'scene.turn_on' } });
  expect(saved.links).toEqual([{ name: 'Hall', path: '#hall' }]);
  expect(saved.custom_field).toEqual(initial.custom_field);
  expect(saved.appearance).toEqual({ ...initial.appearance, accent: '#b87846' });
  expect(await page.evaluate(() => (window as any).journeyCalls)).toEqual([]);
  const preview = roomEditor.locator('navet-room-card');
  await expect(preview.getByRole('button', { name: /Evening shortcut/ })).toBeDisabled();
  await expect(preview.getByRole('button', { name: 'Hall', exact: true })).toBeDisabled();
  const originalHash = await page.evaluate(() => location.hash);
  await preview.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(preview.getByRole('dialog')).toBeVisible();
  expect(await preview.locator('.room-control button:enabled, .room-control input:enabled, .room-control select:enabled').count()).toBe(0);
  expect(await page.evaluate(() => location.hash)).toBe(originalHash);
  expect(await page.evaluate(() => (window as any).journeyCalls)).toEqual([]);
  await page.keyboard.press('Escape');
  // A browser reload and JSON transport exercise saved configuration rather than retained objects.
  await page.reload();
  await mount(page, JSON.parse(JSON.stringify(saved)));
  await expect(editor.getByLabel('Name', { exact: true }).first()).toHaveValue('Everyday kitchen');
  await roomEditor.getByRole('button', { name: 'Save room setup', exact: true }).click();
  expect(await page.evaluate(() => (window as any).journeySaved)).toEqual(saved);
  await page.evaluate(() => {
    const w = window as any;
    const card = document.createElement('navet-room-card') as any;
    card.id = 'journey-card'; card.setConfig(w.journeySaved); card.hass = w.journeyHost;
    document.querySelector('main')!.append(card);
  });
  const card = page.locator('#journey-card');
  await card.getByRole('button', { name: /Evening shortcut/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).journeyCalls.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).journeyCalls[0])).toEqual(['scene', 'turn_on', {}, { entity_id: 'scene.kitchen_evening' }]);
  await card.getByRole('button', { name: 'Controls', exact: true }).click();
  const coffee = card.locator('.room-control').filter({ hasText: 'Espresso machine' });
  await coffee.getByRole('button', { name: 'On', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).journeyCalls.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).journeyCalls[1])).toEqual(['switch', 'turn_on', {}, { entity_id: 'switch.kitchen_coffee' }]);
  await expect(card.locator('.room-control').filter({ hasText: 'Kitchen radio' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Hall', exact: true }).click();
  expect(await page.evaluate(() => location.hash)).toBe('#hall');
  await page.evaluate(async () => {
    const w = window as any;
    const card = document.querySelector('#journey-card') as any;
    w.journeyHost = { ...w.journeyHost, states: { ...w.journeyHost.states, 'binary_sensor.kitchen_motion': { ...w.journeyHost.states['binary_sensor.kitchen_motion'], state: 'off' } } };
    card.hass = w.journeyHost; await card.updateComplete;
  });
  await expect(card.getByRole('button', { name: /Evening shortcut/ })).toHaveCount(0);
  await info.attach('room-journey-config.json', { body: JSON.stringify(saved, null, 2), contentType: 'application/json' });
});

test('photo gallery visually adds, reorders and removes images while preserving advanced config', async ({ page }) => {
  await page.goto('/demo/index.html');
  const photo = { type: 'custom:navet-photo-card', image: '/local/fallback.jpg', images: ['/local/one.jpg', '/local/two.jpg'], alt: 'Kitchen memories', custom_field: { nested: { retain: true } }, appearance: { radius: 18, future: true } };
  await mount(page, photo);
  const editor = page.locator('#journey-editor');
  await editor.locator('summary').filter({ hasText: /^Photo gallery$/ }).click();
  await editor.getByRole('button', { name: 'Add photo', exact: true }).click();
  await field(editor.getByLabel('Photo 3 URL', { exact: true }), '/local/three.jpg');
  await editor.getByRole('button', { name: 'Move photo 3 up', exact: true }).click();
  await editor.getByRole('button', { name: 'Remove photo 1', exact: true }).click();
  expect(await page.evaluate(() => (window as any).journeySaved)).toEqual({ ...photo, images: ['/local/three.jpg', '/local/two.jpg'] });
  expect(await page.evaluate(() => (window as any).journeyInput)).toEqual(photo);
  expect(await page.evaluate(() => (window as any).journeyCalls)).toEqual([]);
});
