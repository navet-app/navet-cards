import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/recipe-scope-host.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main style="max-width:600px"></main></body></html>' }));
  await page.goto('/recipe-scope-host.html');
  await page.evaluate(async () => {
    await import('/dist/modular/navet-cards.js' as string);
    await (customElements.get('navet-switch-card') as any).getConfigElement();
    await customElements.whenDefined('navet-child-cards');
    const w = window as any; w.scopeCreated = []; w.foreignDisconnected = 0; w.scopeCommandCalls = [];
    class ForeignChild extends HTMLElement { config: any; hass: any; disconnectedCallback() { w.foreignDisconnected++; } connectedCallback() { this.textContent = 'Opaque foreign child'; } }
    customElements.define('recipe-foreign-fixture', ForeignChild);
    w.loadCardHelpers = async () => ({ createCardElement(config: any) {
      const tag = config.type.startsWith('custom:navet-') ? config.type.slice(7) : 'recipe-foreign-fixture';
      const child = document.createElement(tag) as any;
      if (child.setConfig) child.setConfig(config); else child.config = config;
      w.scopeCreated.push(child); return child;
    }});
    w.scopeHass = { states: { 'switch.first': { entity_id: 'switch.first', state: 'off', attributes: {} }, 'switch.second': { entity_id: 'switch.second', state: 'on', attributes: {} } }, callService: async (...args: any[]) => { w.scopeCommandCalls.push(args); } };
    w.scopeDefinitions = { first: { config: { name: 'First definition', entity: 'switch.first' } }, second: { config: { name: 'Second definition', entity: 'switch.second' } } };
    w.addScopedHost = (cards: any[], definitions = w.scopeDefinitions, id = 'scoped-host') => {
      const host = document.createElement('navet-child-cards') as any; host.id = id; host.cards = structuredClone(cards); host.definitions = structuredClone(definitions); host.hass = w.scopeHass; document.querySelector('main')!.append(host); return host;
    };
  });
});

test('definition changes affect only intended children and preserve literal foreign cards and source references', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.scopeHost = w.addScopedHost([{ type: 'custom:navet-switch-card', use: ['first'] }, { type: 'custom:navet-switch-card', use: ['second'] }, { type: 'custom:bubble-card', use: ['not-a-navet-definition'], variables: { literal: '${opaque}' }, definitions: { arbitrary: 'opaque' }, name: '${literal}' }]);
  });
  const host = page.locator('#scoped-host');
  await expect(host.getByRole('button', { name: 'First definition', exact: true })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Second definition', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const w = window as any; w.beforeScopeChildren = [...w.scopeHost.shadowRoot.querySelectorAll('.child')].map((row: any) => row.firstElementChild);
    w.scopeHost.definitions = { ...w.scopeHost.definitions, first: { config: { name: 'First updated', entity: 'switch.second' } } };
  });
  await expect(host.getByRole('button', { name: 'First updated', exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const w = window as any; const children = [...w.scopeHost.shadowRoot.querySelectorAll('.child')].map((row: any) => row.firstElementChild);
    return { same: children.map((child: any, index: number) => child === w.beforeScopeChildren[index]), source: w.scopeHost.cards[0], foreign: children[2].config, inheritedLeafMetadata: children[0].config.definitions, created: w.scopeCreated.length, foreignDisconnected: w.foreignDisconnected };
  })).toEqual({ same: [true, true, true], source: { type: 'custom:navet-switch-card', use: ['first'] }, foreign: { type: 'custom:bubble-card', use: ['not-a-navet-definition'], variables: { literal: '${opaque}' }, definitions: { arbitrary: 'opaque' }, name: '${literal}' }, inheritedLeafMetadata: undefined, created: 3, foreignDisconnected: 0 });
  await host.locator('navet-switch-card').first().locator('.icon').click();
  expect(await page.evaluate(() => (window as any).scopeCommandCalls[0])).toEqual(['switch', 'turn_off', {}, { entity_id: 'switch.second' }]);
  await page.evaluate(() => { const w = window as any; w.scopeHost.hass = { ...w.scopeHass, marker: 'updated' }; w.scopeHost.editMode = true; w.scopeHost.preview = true; });
  expect(await host.locator('navet-switch-card').first().evaluate((child: any) => ({ marker: child.hass.marker, preview: child.preview }))).toEqual({ marker: 'updated', preview: true });
  expect(await host.locator('recipe-foreign-fixture').evaluate((child: any) => child.editMode)).toBe(true);
});

test('local overrides and separate scopes remain isolated, and materialized detached copies stay independent', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.localScope = w.addScopedHost([{ type: 'custom:navet-switch-card', use: ['first'], definitions: { first: { config: { name: 'Local override', entity: 'switch.second' } } } }], w.scopeDefinitions, 'local-scope');
    w.otherScope = w.addScopedHost([{ type: 'custom:navet-switch-card', use: ['first'] }], { first: { config: { name: 'Other isolated scope', entity: 'switch.first' } } }, 'other-scope');
  });
  await expect(page.locator('#local-scope').getByRole('button', { name: 'Local override', exact: true })).toBeVisible();
  await expect(page.locator('#other-scope').getByRole('button', { name: 'Other isolated scope', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const w = window as any; const resolved = structuredClone(w.localScope.shadowRoot.querySelector('navet-switch-card').config);
    w.localScope.cards = [resolved]; w.localScope.definitions = { first: { config: { name: 'Later external definition', entity: 'switch.first' } } };
  });
  await expect(page.locator('#local-scope').getByRole('button', { name: 'Local override', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).localScope.cards[0].use)).toBeUndefined();
  await expect(page.locator('#other-scope').getByRole('button', { name: 'Other isolated scope', exact: true })).toBeVisible();
});

test('nested Navet composition carries explicit scope while unchanged descendants keep their elements', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.nestedScope = w.addScopedHost([{ type: 'custom:navet-composition-card', cards: [{ type: 'custom:navet-switch-card', use: ['first'] }, { type: 'custom:navet-switch-card', use: ['second'] }] }]);
  });
  const host = page.locator('#scoped-host');
  await expect(host.getByRole('button', { name: 'First definition', exact: true })).toBeVisible();
  await page.evaluate(() => { const w = window as any; w.beforeNestedSecond = w.scopeCreated.find((child: any) => child.config?.name === 'Second definition'); w.nestedScope.definitions = { ...w.nestedScope.definitions, first: { config: { name: 'Nested updated', entity: 'switch.first' } } }; });
  await expect(host.getByRole('button', { name: 'Nested updated', exact: true })).toBeVisible();
  expect(await page.evaluate(() => { const w = window as any; return { connected: w.beforeNestedSecond.isConnected, secondCreated: w.scopeCreated.filter((child: any) => child.config?.name === 'Second definition').length }; })).toEqual({ connected: true, secondCreated: 1 });
});

test('child visual edits preserve recipe references and local definitions without saving inherited scope', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    class ScopedEditor extends HTMLElement {
      value: any; hass: any; lovelace: any;
      connectedCallback() { this.innerHTML = '<button>Emit scoped edit</button>'; this.querySelector('button')!.onclick = () => this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: { ...structuredClone(this.value), name: 'Edited child override' } }, bubbles: true, composed: true })); }
    }
    customElements.define('hui-card-element-editor', ScopedEditor);
    const editor = document.createElement('navet-child-cards-editor') as any; editor.id = 'scoped-editor'; editor.definitions = w.scopeDefinitions; editor.hass = w.scopeHass; editor.lovelace = { marker: 'context' };
    editor.cards = [{ type: 'custom:navet-switch-card', use: ['first'], variables: { chosen: 'value' }, definitions: { local: { config: { icon: 'mdi:star' } } }, foreign: { preserved: true } }, { type: 'custom:bubble-card', use: ['literal'] }];
    editor.addEventListener('child-cards-changed', (event: any) => { w.scopeEditorSaved = event.detail.cards; });
    document.querySelector('main')!.append(editor); w.scopeEditor = editor;
  });
  await page.getByRole('button', { name: 'Edit child card 1', exact: true }).click();
  expect(await page.locator('hui-card-element-editor').evaluate((editor: any) => ({ definitions: Object.keys(editor.value.definitions), use: editor.value.use, context: editor.lovelace.marker, sameHass: editor.hass === (window as any).scopeHass }))).toEqual({ definitions: ['first', 'second', 'local'], use: ['first'], context: 'context', sameHass: true });
  await page.getByRole('button', { name: 'Emit scoped edit', exact: true }).click();
  expect(await page.evaluate(() => (window as any).scopeEditorSaved[0])).toEqual({ type: 'custom:navet-switch-card', use: ['first'], variables: { chosen: 'value' }, definitions: { local: { config: { icon: 'mdi:star' } } }, foreign: { preserved: true }, name: 'Edited child override' });
  await page.locator('hui-card-element-editor').evaluate((editor: any) => {
    const patch = structuredClone(editor.value); patch.definitions.first.config.name = 'Child edited shared override';
    editor.dispatchEvent(new CustomEvent('config-changed', { detail: { config: patch }, bubbles: true, composed: true }));
  });
  expect(await page.evaluate(() => Object.keys((window as any).scopeEditorSaved[0].definitions))).toEqual(['first', 'local']);
  expect(await page.evaluate(() => (window as any).scopeEditorSaved[0].definitions.first.config.name)).toBe('Child edited shared override');
  await page.getByRole('button', { name: 'Edit child card 2', exact: true }).click();
  expect(await page.locator('hui-card-element-editor').evaluate((editor: any) => editor.value)).toEqual({ type: 'custom:bubble-card', use: ['literal'] });
});
