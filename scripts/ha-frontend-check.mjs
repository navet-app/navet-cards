import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

// Explicit opt-in only. This harness never creates users, changes registries or saves dashboards.
const sessionFile = resolve(process.env.NAVET_HA_SESSION ?? '.ha-validation/2026.9.4/session.json');
assert.ok(sessionFile.startsWith(resolve('.ha-validation') + sep), 'Use an isolated .ha-validation session');
const session = JSON.parse(await readFile(sessionFile, 'utf8'));
const sanitize = (message) => ['password','username','access_token','refresh_token'].reduce((text, key) => typeof session[key] === 'string' && session[key] ? text.replaceAll(session[key], '[redacted]') : text, String(message));
const base = new URL(session.base);
assert.equal(base.hostname, '127.0.0.1', 'Only disposable loopback HA hosts are supported');
assert.equal(base.protocol, 'http:');
assert.ok(Number(base.port) >= 18000 && Number(base.port) < 19000, 'Use a disposable test port, never household HA');
assert.equal(session.name, `navet-cards-ha-${session.version.replaceAll('.', '-')}`);
const artifactPrefix = process.env.NAVET_HA_ARTIFACT_PREFIX ?? '';
assert.ok(!artifactPrefix || /^[a-z0-9][a-z0-9_-]{0,63}$/.test(artifactPrefix), 'Use a single safe artifact directory name');
const localRoot = `/local/${artifactPrefix ? `${artifactPrefix}/` : ''}`;
const output = resolve(sessionFile, '..', `frontend-evidence${artifactPrefix ? `-${artifactPrefix}` : ''}`);
await mkdir(output, { recursive: true });
/** Actual native children; this does not install competitor resources or write HA config. */
async function verifyNativeChildren(page, profile) {
  const entityInfo = await page.evaluate(() => {
    const app = document.querySelector('home-assistant');
    const ids = Object.keys(app.hass.states);
    const light = ids.includes('light.bed_light') ? 'light.bed_light' : ids.find((id) => id.startsWith('light.'));
    const sensor = ids.find((id) => id.startsWith('sensor.') && Number.isFinite(Number(app.hass.states[id].state)));
    const calendar = ids.find((id) => id.startsWith('calendar.'));
    if (!light || !sensor) throw new Error('The disposable host needs light and numeric sensor demo entities');
    const config = {
      type: 'custom:navet-room-card', config_version: 2, name: 'Native child composition',
      room: { membership: { mode: 'explicit', entities: [light] } },
      cards: [
        { type: 'tile', entity: light, name: 'Native child light', tap_action: { action: 'more-info' }, icon_tap_action: { action: 'more-info' } },
        { type: 'history-graph', entities: [sensor], hours_to_show: 1, title: 'Native child history' },
        { type: 'calendar', entities: [calendar ?? 'calendar.navet_missing_fixture'], initial_view: 'listWeek', title: 'Native child calendar' },
        { type: 'custom:navet-missing-composition-fixture', future_child_field: { preserved: ['opaque'] } },
      ],
    };
    const host = window.navetFrontendMount; host.replaceChildren();
    const card = document.createElement('navet-room-card'); card.id = 'native-composition-card'; card.style.maxWidth = '450px';
    card.setConfig(config); card.hass = app.hass; host.append(card);
    window.navetNativeChildConfig = structuredClone(config);
    return { light, sensor, calendar: calendar ?? null };
  });
  const owner = page.locator('#native-composition-card');
  assert.equal(await owner.locator('navet-child-cards').count(), 0, 'Closed rooms do not mount child hosts');
  await owner.getByRole('button', { name: 'Controls', exact: true }).click();
  const childHost = owner.locator('navet-child-cards');
  for (const tag of ['hui-tile-card','hui-history-graph-card','hui-calendar-card']) await childHost.locator(tag).waitFor({ state: 'attached' });
  await childHost.locator('hui-tile-card').getByText('Native child light', { exact: true }).waitFor({ state: 'visible' });
  await childHost.locator('hui-error-card').waitFor({ state: 'attached' });
  const liveState = await childHost.evaluate((host) => {
    const children = [...host.shadowRoot.querySelectorAll('.child')].map((row) => row.firstElementChild);
    window.navetNativeChildrenBeforeClose = children;
    return { tags: children.map((child) => child?.localName), connected: children.every((child) => child.isConnected), stateConnection: children.slice(0,3).every((child) => child.hass?.connection === document.querySelector('home-assistant').hass.connection) };
  });
  assert.equal(liveState.connected, true);
  assert.equal(liveState.stateConnection, true, 'Native children receive the real HA connection');
  assert.deepEqual(liveState.tags.slice(0,3), ['hui-tile-card','hui-history-graph-card','hui-calendar-card']);
  await page.screenshot({ path: resolve(output, `${profile}-native-child-popup.png`) });
  await page.keyboard.press('Escape');
  await owner.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await owner.locator('navet-child-cards').count(), 0);
  assert.equal(await page.evaluate(() => window.navetNativeChildrenBeforeClose.every((child) => !child.isConnected)), true, 'Closing releases every native child');
  await owner.getByRole('button', { name: 'Controls', exact: true }).click();
  await owner.locator('hui-tile-card').getByText('Native child light', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await owner.locator('navet-child-cards').evaluate((host) => host.shadowRoot.querySelector('hui-tile-card') !== window.navetNativeChildrenBeforeClose[0]), true, 'Reopening creates a fresh native child');
  await page.keyboard.press('Escape');
  await owner.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.evaluate(async () => {
    const app = document.querySelector('home-assistant');
    const helpers = await window.loadCardHelpers();
    // HA's native grid editor loads its own nested picker/editor components.
    const grid = helpers.createCardElement({ type: 'grid', cards: [] });
    await grid.constructor.getConfigElement();
    const Owner = customElements.get('navet-room-card');
    const editor = await Owner.getConfigElement();
    editor.id = 'native-composition-editor'; editor.hass = app.hass;
    editor.setConfig(window.navetNativeChildConfig);
    editor.addEventListener('config-changed', (event) => window.navetNativeChildSaved = structuredClone(event.detail.config));
    window.navetFrontendMount.replaceChildren(editor);
  });
  const editor = page.locator('#native-composition-editor');
  await editor.locator('summary').filter({ hasText: /^Child cards$/ }).click();
  const childEditor = editor.locator('navet-child-cards-editor');
  await childEditor.getByRole('button', { name: 'Edit child card 1', exact: true }).click();
  const tileEditor = childEditor.locator('hui-tile-card-editor');
  await tileEditor.locator('ha-form').first().waitFor({ state: 'attached' });
  // Exercise HA's actual editor schema and update event, preserving its native rendering.
  await tileEditor.evaluate((element) => {
    const forms = [...element.shadowRoot.querySelectorAll('ha-form')];
    const form = forms.find((form) => {
      const schema = JSON.stringify(form.schema ?? []);
      return schema.includes('"name":"name"');
    }) ?? forms[0];
    form.dispatchEvent(new CustomEvent('value-changed', { detail: { value: { ...form.data, name: 'Native edited child' } }, bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => window.navetNativeChildSaved?.cards?.[0]?.name === 'Native edited child');
  const edited = await page.evaluate(() => window.navetNativeChildSaved);
  assert.deepEqual(edited.cards[3].future_child_field, { preserved: ['opaque'] });
  await childEditor.getByRole('button', { name: 'Move child card 1 down', exact: true }).click();
  const reordered = await page.evaluate(() => window.navetNativeChildSaved);
  assert.equal(reordered.cards[1].name, 'Native edited child');
  assert.deepEqual(reordered.cards[3].future_child_field, { preserved: ['opaque'] });
  await childEditor.getByRole('button', { name: 'Add child card', exact: true }).click();
  await childEditor.locator('hui-card-picker').waitFor({ state: 'attached' });
  assert.equal(await childEditor.locator('hui-card-picker').evaluate((element) => element.hass === document.querySelector('home-assistant').hass), true);
  await childEditor.getByRole('button', { name: 'Cancel adding child card', exact: true }).click();
  await page.evaluate((config) => window.navetFrontendMount.querySelector('#native-composition-editor').setConfig(JSON.parse(JSON.stringify(config))), reordered);
  await editor.locator('navet-room-editor').getByRole('button', { name: 'Save room setup', exact: true }).click();
  const reopened = await page.evaluate(() => window.navetNativeChildSaved);
  assert.deepEqual(reopened.cards, reordered.cards, 'Opaque nested configurations survive save and JSON reopen');
  await childEditor.getByRole('button', { name: 'Edit child card 2', exact: true }).click();
  await childEditor.locator('hui-tile-card-editor ha-form').first().waitFor({ state: 'attached' });
  await childEditor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, `${profile}-native-child-editor.png`) });
  await page.evaluate((config) => {
    const preview = document.createElement('navet-room-card'); preview.id = 'native-child-preview'; preview.preview = true;
    preview.setConfig(config); preview.hass = document.querySelector('home-assistant').hass;
    window.navetFrontendMount.replaceChildren(preview);
  }, reordered);
  const preview = page.locator('#native-child-preview');
  await preview.getByRole('button', { name: 'Controls', exact: true }).click();
  await preview.locator('hui-tile-card').waitFor({ state: 'attached' });
  assert.equal(await preview.locator('navet-child-cards .children').getAttribute('inert'), '');
  assert.equal(await preview.locator('hui-tile-card').evaluate((element) => element.preview), true);
  await page.screenshot({ path: resolve(output, `${profile}-native-child-preview.png`) });
  await page.keyboard.press('Escape');
  return { nativeChildren: liveState.tags, nativeChildEditor: true, nativeChildPicker: true, childRoundtrip: true, childActiveOnly: true, calendarEntity: entityInfo.calendar, calendarBackend: entityInfo.calendar ? 'available; events not asserted' : 'missing; native element/editor only', childPreview: 'inert; no service calls' };
}

const browser = await chromium.launch({ channel: process.env.NAVET_BROWSER_CHANNEL ?? 'chrome', headless: true });
const results = [];
try {
  for (const profile of ['standalone', 'modular']) {
    const context = await browser.newContext({ viewport: profile === 'standalone' ? { width: 1280, height: 900 } : { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    let serviceCalls = 0;
    const resourceRequests = new Set();
    const failures = [];
    page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => {
      try { if (JSON.parse(String(payload)).type === 'call_service') serviceCalls++; } catch { /* Not a JSON command. */ }
    }));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/local/')) resourceRequests.add(url.pathname);
    });
    page.on('pageerror', (error) => failures.push(error.message));
    if (profile === 'modular' || artifactPrefix) await page.route('**/local/navet-cards.js*', async (route) => {
      // Fresh context: the standalone resource is never evaluated alongside the modular profile.
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: `import ${JSON.stringify(`${session.base}${localRoot}${profile === 'modular' ? 'navet-modular/' : ''}navet-cards.js`)};` });
    });
    let authenticated = false;
    const entryFile = resolve(sessionFile, '..', 'config', 'www', artifactPrefix, ...(profile === 'modular' ? ['navet-modular', 'navet-cards.js'] : ['navet-cards.js']));
    const entrySha256 = createHash('sha256').update(await readFile(entryFile)).digest('hex');
    try {
      await page.goto(`${session.base}/navet-verification/masonry`);
      await page.locator('input[name="username"]').fill(session.username);
      await page.locator('input[name="password"]').fill(session.password);
      const signIn = page.getByRole('button', { name: /log in|sign in/i });
      // The minimum frontend uses an older submit component without this button role.
      if (await signIn.count()) await signIn.click();
      else await page.locator('input[name="password"]').press('Enter');
      await page.waitForFunction(() => !!document.querySelector('home-assistant')?.hass?.states && customElements.get('navet-room-card'));
      authenticated = true;
      await page.evaluate(async () => {
        const app = document.querySelector('home-assistant');
        const Card = customElements.get('navet-room-card');
        const editor = await Card.getConfigElement();
        const host = document.createElement('section');
        host.id = 'navet-frontend-verification';
        host.style.cssText = 'position:fixed;inset:0;z-index:1000;overflow:auto;padding:20px;background:var(--primary-background-color,#fff);color:var(--primary-text-color,#222)';
        editor.id = 'native-room-editor'; editor.hass = app.hass;
        editor.setConfig({ type: 'custom:navet-room-card', config_version: 2, room: { membership: { mode: 'explicit', entities: [] } }, future_field: { preserved: true } });
        editor.addEventListener('config-changed', (event) => { window.navetFrontendSaved = structuredClone(event.detail.config); });
        host.append(editor);
        const main = app.shadowRoot.querySelector('home-assistant-main');
        (main?.shadowRoot ?? app.shadowRoot).append(host);
        window.navetFrontendMount = host;
      });
      const editor = page.locator('#native-room-editor');
      const room = editor.locator('navet-room-editor');
      assert.ok(await room.locator('ha-form').count(), 'Native HA form is rendered for the entity selector');
      await room.locator('ha-form ha-selector').first().waitFor({ state: 'attached' });
      await page.screenshot({ path: resolve(output, `${profile}-native-selectors.png`) });
      await room.getByLabel('Membership', { exact: true }).selectOption('area');
      const area = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.areas).find((id) => id === 'navet_test_room') ?? Object.keys(document.querySelector('home-assistant').hass.areas)[0]);
      assert.ok(area, 'Disposable host supplies an area registry');
      await room.getByLabel('Room area', { exact: true }).selectOption(area);
      await room.getByLabel('Apply room recipe', { exact: true }).selectOption('kitchen');
      const preview = room.locator('navet-room-card');
      const hash = await page.evaluate(() => location.hash);
      await preview.getByRole('button', { name: 'Controls', exact: true }).click();
      assert.equal(await preview.getByRole('dialog').isVisible(), true);
      assert.equal(await preview.locator('.room-control button:enabled,.room-control input:enabled,.room-control select:enabled').count(), 0);
      assert.equal(await page.evaluate(() => location.hash), hash);
      assert.equal(serviceCalls, 0, 'Preview/editor never send host commands');
      await page.keyboard.press('Escape');
      await room.getByRole('button', { name: 'Save room setup', exact: true }).click();
      let saved = await page.evaluate(() => window.navetFrontendSaved);
      assert.equal(saved.config_version, 2);
      assert.equal(saved.room.membership.mode, 'area');
      assert.deepEqual(saved.future_field, { preserved: true });
      await page.evaluate((saved) => {
        const editor = window.navetFrontendMount.querySelector('#native-room-editor');
        editor.setConfig(JSON.parse(JSON.stringify(saved)));
      }, saved);
      await room.getByRole('button', { name: 'Save room setup', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.navetFrontendSaved), saved);
      await editor.locator('summary').filter({ hasText: /^Sub-controls$/ }).click();
      const subEditor = editor.locator('navet-sub-controls-editor');
      await subEditor.getByRole('button', { name: 'Add sub-control', exact: true }).click();
      await subEditor.locator('ha-form ha-selector').first().waitFor({ state: 'attached' });
      await subEditor.getByLabel('Name', { exact: true }).fill('Native secondary reading');
      await subEditor.getByLabel('Name', { exact: true }).dispatchEvent('change');
      await subEditor.locator('summary').filter({ hasText: /^Display and grouping$/ }).click();
      await subEditor.getByLabel('Read only', { exact: true }).check();
      saved = await page.evaluate(() => window.navetFrontendSaved);
      assert.equal(saved.sub_controls[0].name, 'Native secondary reading');
      assert.equal(saved.sub_controls[0].read_only, true);
      await page.evaluate((saved) => window.navetFrontendMount.querySelector('#native-room-editor').setConfig(JSON.parse(JSON.stringify(saved))), saved);
      assert.equal(await subEditor.getByLabel('Name', { exact: true }).inputValue(), 'Native secondary reading');
      assert.equal(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth), true, 'Editor fits its viewport');
      await page.screenshot({ path: resolve(output, `${profile}-room-editor.png`) });
      await page.evaluate(async () => {
        const app = document.querySelector('home-assistant');
        const Card = customElements.get('navet-chips-card');
        if (!Card) throw new Error('The candidate did not register its chips card');
        const editor = await Card.getConfigElement();
        editor.id = 'native-chips-editor'; editor.hass = app.hass;
        editor.setConfig({ type: 'custom:navet-chips-card', chips: [], future_chips_field: { preserved: true } });
        editor.addEventListener('config-changed', (event) => { window.navetFrontendChipsSaved = structuredClone(event.detail.config); });
        window.navetFrontendMount.append(editor);
      });
      const chipsOuter = page.locator('#native-chips-editor');
      const chipsEditor = chipsOuter.locator('navet-chips-editor');
      await chipsEditor.getByLabel('Title', { exact: true }).fill('Native quick actions');
      await chipsEditor.getByLabel('Title', { exact: true }).press('Tab');
      await chipsEditor.getByLabel('Subtitle', { exact: true }).fill('Disposable demo host');
      await chipsEditor.getByLabel('Subtitle', { exact: true }).press('Tab');
      await chipsEditor.getByRole('button', { name: 'Add entity chip', exact: true }).click();
      const entityChip = chipsEditor.locator('.item').first();
      const entityForm = entityChip.locator('ha-form').first();
      await entityForm.locator('ha-selector').waitFor({ state: 'attached' });
      // Exercise HA's native entity picker rather than replacing it with a mock form.
      await entityForm.click();
      const entitySearch = page.locator('input:focus').first();
      await entitySearch.fill('Bed Light');
      await entitySearch.press('ArrowDown'); await entitySearch.press('Enter');
      await page.waitForFunction(() => window.navetFrontendChipsSaved?.chips?.[0]?.entity === 'light.bed_light');
      // A pointer click also proves the native picker released its focus trap.
      await entityChip.getByLabel('Chip name', { exact: true }).click();
      await entityChip.getByLabel('Chip name', { exact: true }).fill('Bedside light');
      await entityChip.getByLabel('Chip name', { exact: true }).press('Tab');
      assert.equal(await page.evaluate(() => window.navetFrontendChipsSaved.chips[0].name), 'Bedside light', 'Native entity chip label commits before reordering');
      await page.screenshot({ path: resolve(output, `${profile}-native-chips-selectors.png`) });
      await chipsEditor.getByRole('button', { name: 'Add action chip', exact: true }).click();
      const actionChip = chipsEditor.locator('.item').nth(1);
      await actionChip.getByLabel('Chip name', { exact: true }).fill('Room');
      await actionChip.getByLabel('Chip name', { exact: true }).press('Tab');
      const chipAction = actionChip.locator('navet-action-field').first();
      await chipAction.getByLabel('Navigation path', { exact: true }).fill('#native-composition');
      await chipAction.getByLabel('Navigation path', { exact: true }).press('Tab');
      await chipsEditor.getByRole('button', { name: 'Move chip 2 up', exact: true }).click();
      const chipsSaved = await page.evaluate(() => window.navetFrontendChipsSaved);
      assert.equal(chipsSaved.title, 'Native quick actions');
      assert.equal(chipsSaved.subtitle, 'Disposable demo host');
      assert.deepEqual(chipsSaved.chips.map((chip) => chip.id), ['chip-2', 'chip-1']);
      assert.equal(chipsSaved.chips[1].entity, 'light.bed_light');
      assert.equal(chipsSaved.chips[1].name, 'Bedside light', 'Chip label survives native editor reordering');
      assert.equal(chipsSaved.chips[0].tap_action.navigation_path, '#native-composition');
      assert.deepEqual(chipsSaved.future_chips_field, { preserved: true });
      await page.evaluate((saved) => window.navetFrontendMount.querySelector('#native-chips-editor').setConfig(JSON.parse(JSON.stringify(saved))), chipsSaved);
      await chipsEditor.getByLabel('Subtitle', { exact: true }).dispatchEvent('change');
      assert.deepEqual(await page.evaluate(() => window.navetFrontendChipsSaved), chipsSaved);
      await page.evaluate((saved) => {
        const app = document.querySelector('home-assistant');
        const preview = document.createElement('navet-chips-card');
        preview.id = 'native-chips-preview'; preview.preview = true;
        preview.setConfig(saved); preview.hass = app.hass;
        preview.style.cssText = 'max-width:450px;height:auto;margin:20px 0';
        window.navetFrontendMount.append(preview);
      }, chipsSaved);
      const chipsPreview = page.locator('#native-chips-preview navet-chips');
      await chipsPreview.getByRole('button', { name: 'Room', exact: true }).waitFor();
      const chipHash = await page.evaluate(() => location.hash);
      assert.equal(await chipsPreview.getByRole('button', { name: 'Room', exact: true }).isDisabled(), true);
      assert.equal(await chipsPreview.getByRole('button', { name: 'Bedside light', exact: true }).isDisabled(), true);
      await chipsPreview.getByRole('button', { name: 'Room', exact: true }).dispatchEvent('click');
      await chipsPreview.getByRole('button', { name: 'Bedside light', exact: true }).dispatchEvent('click');
      assert.equal(await page.evaluate(() => location.hash), chipHash);
      assert.equal(serviceCalls, 0, 'Native chips editing and preview never send commands');
      assert.equal(await chipsEditor.evaluate((element) => element.scrollWidth <= element.clientWidth), true, 'Chips editor fits its viewport');
      await chipsEditor.getByLabel('Title', { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(output, `${profile}-native-chips-editor.png`) });
      await chipsPreview.scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(output, `${profile}-native-chips-preview.png`) });
      const childEvidence = await verifyNativeChildren(page, profile);
      assert.equal(serviceCalls, 0, 'Native child composition editing and preview never send commands');
      await page.evaluate((saved) => {
        const app = document.querySelector('home-assistant');
        const host = window.navetFrontendMount;
        host.replaceChildren();
        const card = document.createElement('navet-room-card'); card.id = 'native-room-card'; card.style.cssText = 'max-width:450px;height:260px';
        card.setConfig(saved); card.hass = app.hass; host.append(card);
      }, saved);
      const card = page.locator('#native-room-card');
      await card.getByRole('button', { name: 'Controls', exact: true }).click();
      await card.locator('.room-row').first().click();
      await page.evaluate(() => { window.navetFrontendMount.style.visibility = 'hidden'; });
      // The modern host uses display:contents; the minimum frontend uses an MDC surface.
      await page.locator('ha-more-info-dialog').locator('dialog[open]:visible, [role="dialog"]:visible, [role="alertdialog"]:visible, .mdc-dialog__surface:visible').first().waitFor({ state: 'visible' });
      assert.equal(serviceCalls, 0, 'Native details opening is read-only');
      await page.screenshot({ path: resolve(output, `${profile}-native-details.png`) });
      if (profile === 'modular') assert.ok([...resourceRequests].some((path) => path.startsWith(`${localRoot}navet-modular/chunks/`)), 'Deferred relative chunks were requested');
      assert.deepEqual(failures, [], 'The candidate produced no unhandled page errors');
      results.push({ profile, status: 'passed', viewport: page.viewportSize(), version: session.version, entrySha256, nativeForm: true, nativeSubControlEditor: true, nativeChipsEditor: true, chipCount: chipsSaved.chips.length, chipRoundtrip: true, previewServiceCalls: serviceCalls, savedVersion: saved.config_version, nativeDetails: true, ...childEvidence, runtimeFilesRequested: [...resourceRequests].sort(), pageErrors: failures });
    } catch (error) {
      if (authenticated) await page.screenshot({ path: resolve(output, `${profile}-failure.png`) });
      results.push({ profile, status: 'failed', version: session.version, reason: sanitize(error.message), pageErrors: failures.map(sanitize) });
      throw new Error(sanitize(error.message));
    } finally {
      await writeFile(resolve(output, 'results.json'), JSON.stringify({ scope: 'Disposable rendered Home Assistant with demo entities; not household/HACS acceptance', results }, null, 2));
      await context.close();
    }
  }
  console.log(`Rendered disposable HA checks passed for ${results.map((item) => item.profile).join(', ')}. Evidence: ${output}`);
} finally { await browser.close(); }
