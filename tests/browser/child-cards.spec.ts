import { test, expect, type Page } from '@playwright/test';

async function host(page: Page, preview = false) {
  await page.route('**/child-cards-host.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main style="max-width:500px"></main></body></html>' }));
  await page.goto('/child-cards-host.html');
  await page.evaluate(async ({ preview }) => {
    await import('/dist/modular/navet-cards.js' as string);
    const w = window as any;
    w.childCreated = 0; w.childDisconnected = 0; w.childActions = 0; w.createdConfigs = [];
    class ChildFixture extends HTMLElement {
      config: any; hass: any; preview = false; editMode = false;
      connectedCallback() { this.textContent = `${this.config.type} ${this.config.name ?? ''}`; this.tabIndex = 0; this.onclick = () => { w.childActions++; }; }
      disconnectedCallback() { w.childDisconnected++; }
      getCardSize() { return this.config.units ?? 3; }
      getGridOptions() { return { rows: this.config.rows ?? 2, columns: 6 }; }
    }
    customElements.define('child-fixture', ChildFixture);
    w.loadCardHelpers = async () => ({ createCardElement(config: any) {
      w.childCreated++; w.createdConfigs.push(structuredClone(config));
      if (config.type === 'broken') throw new Error('Fixture failure');
      const element = document.createElement('child-fixture') as any; element.config = config;
      config.helper_mutation = true; return element;
    }});
    const card = document.createElement('navet-room-card') as any;
    card.id = 'composition-owner'; card.preview = preview;
    card.setConfig({ type: 'custom:navet-room-card', name: 'Composition fixture', entities: ['sensor.fixture'], cards: [
      { type: 'tile', name: 'First child', units: 2, rows: 2, opaque: { nested: ['unchanged'] } },
      { type: 'history-graph', name: 'Second child', units: 4, rows: 3 },
      { type: 'broken', name: 'Broken child' },
    ] });
    card.hass = { states: { 'sensor.fixture': { entity_id: 'sensor.fixture', state: '21', attributes: { friendly_name: 'Fixture reading' } } }, callService: async () => undefined };
    document.querySelector('main')!.append(card); w.owner = card;
    // A room only loads composition after opening its dialog. The fixture below imports
    // the actual build chunk to test the host separately from popup integration.
  }, { preview });
  // The host is an optional module, locate its emitted chunk independently of root wiring.
  const manifest = await (await page.request.get('/dist/modular/artifact-manifest.json')).json();
  const chunk = manifest.files.find((file: { path: string }) => /\/child-cards-[^/]+\.js$/.test(file.path))?.path;
  if (chunk) await page.evaluate(async path => { await import(path); }, `/dist/modular/${chunk}`);
  await page.evaluate(async () => {
    const w = window as any;
    await customElements.whenDefined('navet-child-cards');
    const host = document.createElement('navet-child-cards') as any; host.id = 'child-host';
    host.cards = [
      { type: 'tile', name: 'First child', units: 2, rows: 2, opaque: { nested: ['unchanged'] } },
      { type: 'history-graph', name: 'Second child', units: 4, rows: 3 },
      { type: 'broken' },
    ];
    host.hass = w.owner.hass; host.preview = w.owner.preview;
    document.querySelector('main')!.append(host); w.childHost = host;
  });
}

test('child cards isolate failures and config mutations, preserve details events, update hass and aggregate sizing', async ({ page }) => {
  await host(page);
  const hostElement = page.locator('#child-host');
  await expect(hostElement).toContainText('First child');
  await expect(hostElement).toContainText('Fixture failure');
  expect(await page.evaluate(async () => {
    const h = (window as any).childHost;
    return { size: await h.getCardSize(), grid: h.getGridOptions(), config: h.cards[0] };
  })).toEqual({ size: 9, grid: { columns: 'full', rows: 'auto', min_columns: 1, min_rows: 1 }, config: { type: 'tile', name: 'First child', units: 2, rows: 2, opaque: { nested: ['unchanged'] } } });
  await page.evaluate(() => {
    const w = window as any; w.detailsSeen = false;
    w.childHost.addEventListener('hass-more-info', () => w.detailsSeen = true);
    w.childHost.shadowRoot.querySelector('child-fixture').dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: 'light.fixture' }, bubbles: true, composed: true }));
    w.childHost.hass = { ...w.childHost.hass, marker: 'new host' }; w.childHost.editMode = true;
    w.childHost.cards = w.childHost.cards.slice(0, 2); w.childHost.layout = 'grid'; w.childHost.columns = 2;
  });
  await expect(hostElement.locator('child-fixture')).toHaveCount(2);
  expect(await page.evaluate(async () => {
    const w = window as any; const e = w.childHost.shadowRoot.querySelector('child-fixture');
    return { details: w.detailsSeen, marker: e.hass.marker, edit: e.editMode, size: await w.childHost.getCardSize(), grid: w.childHost.getGridOptions() };
  })).toEqual({ details: true, marker: 'new host', edit: true, size: 4, grid: { columns: 'full', rows: 3, min_columns: 1, min_rows: 1 } });
});

test('inactive children disconnect, reopen fresh, and stale helper resolutions cannot mount', async ({ page }) => {
  await host(page);
  await expect(page.locator('#child-host child-fixture')).toHaveCount(2);
  await page.evaluate(() => { (window as any).childHost.active = false; });
  await expect(page.locator('#child-host child-fixture')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).childDisconnected)).toBe(2);
  await page.evaluate(() => { const w = window as any; w.loadCardHelpers = () => new Promise(resolve => w.resolveHelpers = resolve); w.childHost.active = true; });
  await expect(page.locator('#child-host')).toContainText('Loading child cards');
  await page.evaluate(() => {
    const w = window as any; w.childHost.active = false;
  });
  await expect(page.locator('#child-host')).toBeEmpty();
  await page.evaluate(() => {
    const w = window as any; w.resolveHelpers({ createCardElement() { const e = document.createElement('child-fixture') as any; e.config = { type: 'late' }; return e; } });
    w.loadCardHelpers = async () => ({ createCardElement(config: any) { const e = document.createElement('child-fixture') as any; e.config = config; return e; } });
  });
  await expect(page.locator('#child-host child-fixture')).toHaveCount(0);
  await page.evaluate(() => { (window as any).childHost.active = true; });
  await expect(page.locator('#child-host child-fixture')).toHaveCount(3);
  await page.evaluate(() => { const h = (window as any).childHost; h.remove(); document.querySelector('main')!.append(h); });
  await expect(page.locator('#child-host child-fixture')).toHaveCount(3);
});

test('preview propagates to children and blocks pointer and keyboard interaction with inert', async ({ page }) => {
  await host(page, true);
  await expect(page.locator('#child-host child-fixture')).toHaveCount(2);
  expect(await page.locator('#child-host .children').getAttribute('inert')).toBe('');
  expect(await page.evaluate(() => (window as any).childHost.shadowRoot.querySelector('child-fixture').preview)).toBe(true);
  await page.locator('#child-host child-fixture').first().click({ force: true });
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).childActions)).toBe(0);
});

test('helper loading failure offers an explicit retry', async ({ page }) => {
  await host(page);
  await expect(page.locator('#child-host child-fixture')).toHaveCount(2);
  await page.evaluate(() => { const w = window as any; delete w.loadCardHelpers; w.childHost.cards = [{ type: 'tile', name: 'Retry fixture' }]; });
  await expect(page.locator('#child-host')).toContainText('card helpers are unavailable');
  await page.evaluate(() => { (window as any).loadCardHelpers = async () => ({ createCardElement(config: any) { const element = document.createElement('child-fixture') as any; element.config = config; return element; } }); });
  await page.locator('#child-host').getByRole('button', { name: 'Retry child cards' }).click();
  await expect(page.locator('#child-host')).toContainText('Retry fixture');
});

test('native child picker and editor preserve opaque data while adding, editing and reordering', async ({ page }) => {
  await host(page);
  await page.evaluate(async () => {
    const Owner = customElements.get('navet-room-card') as any; await Owner.getConfigElement();
    class Picker extends HTMLElement {
      connectedCallback() { this.innerHTML = '<button>Add native calendar</button>'; this.querySelector('button')!.onclick = () => this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: { type: 'calendar', entities: ['calendar.fixture'] } }, bubbles: true, composed: true })); }
    }
    class Editor extends HTMLElement {
      value: any; hass: any;
      connectedCallback() { this.innerHTML = '<button>Change child name</button>'; this.querySelector('button')!.onclick = () => this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: { type: this.value.type, name: 'Edited native child' } }, bubbles: true, composed: true })); }
    }
    customElements.define('hui-card-picker', Picker); customElements.define('hui-card-element-editor', Editor);
    const element = document.createElement('navet-child-cards-editor') as any; element.id = 'child-editor'; element.hass = (window as any).owner.hass;
    element.cards = [{ type: 'tile', name: 'Opaque original', foreign: { deep: ['keep'] }, entity: 'light.fixture' }];
    element.addEventListener('child-cards-changed', (event: any) => (window as any).savedChildren = event.detail.cards);
    document.querySelector('main')!.append(element);
  });
  await page.locator('#child-editor').getByRole('button', { name: 'Edit child card 1', exact: true }).click();
  await page.getByRole('button', { name: 'Change child name' }).click();
  expect(await page.evaluate(() => (window as any).savedChildren[0])).toEqual({ type: 'tile', name: 'Edited native child', foreign: { deep: ['keep'] }, entity: 'light.fixture' });
  await page.locator('#child-editor').getByRole('button', { name: 'Add child card', exact: true }).click();
  await page.getByRole('button', { name: 'Add native calendar' }).click();
  await expect(page.locator('#child-editor')).toContainText('2. calendar');
  await page.getByRole('button', { name: 'Move child card 2 up' }).click();
  expect(await page.evaluate(() => (window as any).savedChildren.map((card: any) => card.type))).toEqual(['calendar', 'tile']);
  await page.getByRole('button', { name: 'Remove child card 1' }).click();
  expect(await page.evaluate(() => (window as any).savedChildren[0].foreign)).toEqual({ deep: ['keep'] });
  await page.getByRole('button', { name: 'Edit child card 1', exact: true }).click();
  await page.getByText('Replace complete configuration', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Child configuration JSON' }).fill('{"type":"tile","entity":"light.fixture","foreign":{"deep":["keep"]}}');
  await page.getByRole('button', { name: 'Replace child configuration', exact: true }).click();
  expect(await page.evaluate(() => (window as any).savedChildren[0])).toEqual({ type: 'tile', entity: 'light.fixture', foreign: { deep: ['keep'] } });
});

test('room composition mounts only while its popup is open and returns focus after Escape', async ({ page }) => {
  await host(page);
  await expect(page.locator('#child-host child-fixture')).toHaveCount(2);
  await page.evaluate(() => { (window as any).childHost.remove(); (window as any).childCreated = 0; (window as any).childDisconnected = 0; });
  const owner = page.locator('#composition-owner');
  await expect(owner.locator('child-fixture')).toHaveCount(0);
  const collapsedSizing = await page.evaluate(async () => {
    const owner = (window as any).owner;
    const reference = document.createElement('navet-room-card') as any;
    reference.setConfig({ type: 'custom:navet-room-card', name: 'Reference room', entities: ['sensor.fixture'] });
    return { owner: await owner.getCardSize(), reference: await reference.getCardSize(), rows: owner.getGridOptions().rows, referenceRows: reference.getGridOptions().rows };
  });
  expect(collapsedSizing.owner).toBe(collapsedSizing.reference);
  expect(collapsedSizing.rows).toBe(collapsedSizing.referenceRows);
  const opener = owner.getByRole('button', { name: 'Composition fixture', exact: true });
  await opener.click();
  await expect(owner.getByRole('dialog')).toBeVisible();
  await expect(owner.locator('child-fixture')).toHaveCount(2);
  await page.screenshot({ path: '/tmp/navet-child-composition-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(owner.getByRole('dialog')).not.toBeVisible();
  await expect(owner.locator('child-fixture')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).childDisconnected)).toBe(2);
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(owner.locator('child-fixture')).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).childCreated)).toBe(6);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/navet-child-composition-phone.png' });
  expect(await owner.getByRole('dialog').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
});


test('parent forwards child-only state updates without rerendering unrelated room content', async ({ page }) => {
  await host(page);
  const owner = page.locator('#composition-owner');
  await owner.getByRole('button', {name:'Composition fixture',exact:true}).click();
  await expect(owner.locator('child-fixture')).toHaveCount(2);
  await page.evaluate(async () => {
    const card = (window as any).owner;
    const state = {entity_id:'sensor.child_only',state:'42',attributes:{}};
    card.hass = {...card.hass,states:{...card.hass.states,'sensor.child_only':state}};
  });
  await expect.poll(()=>owner.locator('child-fixture').first().evaluate((el:any)=>el.hass?.states['sensor.child_only']?.state)).toBe('42');
});
