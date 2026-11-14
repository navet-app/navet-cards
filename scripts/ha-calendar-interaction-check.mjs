import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

// Read-only disposable HA frontend proof. Never logs or evaluates the session object.
const sessionFile = resolve(process.env.NAVET_HA_SESSION ?? '.ha-validation/2026.9.4/session.json');
assert.ok(sessionFile.startsWith(resolve('.ha-validation') + sep));
const session = JSON.parse(await readFile(sessionFile, 'utf8'));
const redact = value => ['username', 'password', 'access_token', 'refresh_token'].reduce((message, key) => typeof session[key] === 'string' && session[key] ? message.replaceAll(session[key], '[redacted]') : message, String(value));
const base = new URL(session.base);
assert.equal(base.hostname, '127.0.0.1'); assert.equal(base.protocol, 'http:');
assert.equal(session.version, '2026.9.4'); assert.equal(Number(base.port), 18124);
assert.equal(session.name, 'navet-cards-ha-2026-9-4');
const prefix = process.env.NAVET_HA_ARTIFACT_PREFIX ?? 'competition-m6';
assert.match(prefix, /^[a-z0-9][a-z0-9_-]{0,63}$/);
const output = resolve(sessionFile, '..', `calendar-interaction-evidence-${prefix}`);
await mkdir(output, { recursive: true });
const results = [];
const browser = await chromium.launch({ channel: process.env.NAVET_BROWSER_CHANNEL ?? 'chrome', headless: true });
try {
  for (const profile of ['standalone', 'modular']) {
    const context = await browser.newContext({ viewport: profile === 'standalone' ? { width: 1280, height: 900 } : { width: 390, height: 844 } });
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const pageErrors = []; let serviceCalls = 0; let authenticated = false;
    const api = []; let calendarRequests = 0; const resources = new Set();
    page.on('pageerror', error => pageErrors.push(redact(error.message)));
    page.on('websocket', socket => socket.on('framesent', ({ payload }) => { try { if (JSON.parse(String(payload)).type === 'call_service') serviceCalls++; } catch {} }));
    page.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/calendars/')) api.push({ path: url.pathname, status: response.status() }); });
    page.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/calendars/')) calendarRequests++; if (url.pathname.startsWith(`/local/${prefix}/`)) resources.add(url.pathname); });
    const entryPath = `/local/${prefix}/${profile === 'modular' ? 'navet-modular/' : ''}navet-cards.js`;
    const entry = resolve(sessionFile, '..', 'config', 'www', prefix, ...(profile === 'modular' ? ['navet-modular'] : []), 'navet-cards.js');
    const entrySha256 = createHash('sha256').update(await readFile(entry)).digest('hex');
    await page.route('**/local/navet-cards.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: `import ${JSON.stringify(`${session.base}${entryPath}`)};` }));
    try {
      await page.goto(`${session.base}/navet-verification/masonry`);
      await page.locator('input[name="username"]').fill(session.username);
      await page.locator('input[name="password"]').fill(session.password);
      await page.getByRole('button', { name: /log in|sign in/i }).click();
      await page.waitForFunction(() => !!document.querySelector('home-assistant')?.hass?.states && customElements.get('navet-calendar-card'));
      authenticated = true;
      const calendars = await page.evaluate(async () => {
        const app = document.querySelector('home-assistant');
        const calendars = Object.keys(app.hass.states).filter(id => id.startsWith('calendar.')).map(id => ({ id, name: app.hass.states[id].attributes.friendly_name ?? id }));
        const mount = document.createElement('section'); mount.id = 'calendar-interaction-proof'; mount.style.cssText = 'position:fixed;inset:0;z-index:1000;overflow:auto;padding:20px;box-sizing:border-box;background:var(--primary-background-color,#fff);color:var(--primary-text-color,#222)';
        const main = app.shadowRoot.querySelector('home-assistant-main'); (main?.shadowRoot ?? app.shadowRoot).append(mount); window.navetInteractionMount = mount;
        const editor = await customElements.get('navet-calendar-card').getConfigElement(); editor.id = 'actual-calendar-editor'; editor.hass = app.hass;
        editor.setConfig({ type: 'custom:navet-calendar-card', name: 'Actual calendar agenda', calendar: { entities: [], days: 7 }, future_calendar_field: { preserved: true } });
        editor.addEventListener('config-changed', event => { window.actualCalendarSaved = structuredClone(event.detail.config); });
        mount.append(editor); return calendars;
      });
      assert.ok(calendars.length, 'Actual disposable host needs calendar entities; no synthetic events are created');
      const editor = page.locator('#actual-calendar-editor'); const calendarEditor = editor.locator('navet-calendar-editor');
      const nativeForm = calendarEditor.locator('ha-form').first();
      await nativeForm.locator('ha-selector').waitFor({ state: 'attached' });
      assert.equal(await nativeForm.evaluate(form => form.schema[0].selector.entity.multiple), true);
      await nativeForm.click();
      const search = page.locator('input:focus').first(); await search.fill(calendars[0].name); await search.press('ArrowDown'); await search.press('Enter');
      await page.waitForFunction(id => window.actualCalendarSaved?.calendar?.entities?.includes(id), calendars[0].id);
      await page.keyboard.press('Escape');
      await calendarEditor.getByLabel('Days to show', { exact: true }).fill('14'); await calendarEditor.getByLabel('Days to show', { exact: true }).press('Tab');
      const saved = await page.evaluate(() => window.actualCalendarSaved);
      assert.equal(saved.calendar.days, 14); assert.deepEqual(saved.future_calendar_field, { preserved: true });
      await page.evaluate(config => window.navetInteractionMount.querySelector('#actual-calendar-editor').setConfig(JSON.parse(JSON.stringify(config))), saved);
      assert.equal(await calendarEditor.getByLabel('Days to show', { exact: true }).inputValue(), '14');
      assert.equal(await nativeForm.evaluate(form => form.data.entities.length), 1);
      await calendarEditor.scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(output, `${profile}-native-calendar-editor.png`) });
      await page.evaluate(config => {
        const card = document.createElement('navet-calendar-card'); card.id = 'actual-agenda'; card.style.cssText = 'max-width:500px;height:auto'; card.setConfig(config); card.hass = document.querySelector('home-assistant').hass;
        window.navetInteractionMount.replaceChildren(card);
      }, saved);
      const agenda = page.locator('#actual-agenda navet-calendar');
      await agenda.waitFor({ state: 'attached' });
      await page.waitForFunction(() => { const calendar = document.querySelector('home-assistant').shadowRoot.querySelector('home-assistant-main')?.shadowRoot.querySelector('#calendar-interaction-proof')?.querySelector('#actual-agenda')?.shadowRoot.querySelector('navet-calendar'); return calendar?.shadowRoot && !calendar.shadowRoot.textContent.includes('Loading'); });
      // The backend response must arrive; event count is evidence, never fabricated for this check.
      if (!api.some(item => item.status === 200)) await page.waitForResponse(response => new URL(response.url()).pathname.startsWith('/api/calendars/') && response.status() === 200);
      assert.ok(api.some(item => item.status === 200), 'Calendar GET returns 200');
      const eventCount = await agenda.locator('button.event').count(); let details = 'not exercised: actual window has no events';
      if (eventCount) { await agenda.locator('button.event').first().click(); await agenda.getByRole('dialog', { name: 'Event details' }).waitFor({ state: 'visible' }); assert.equal(await agenda.getByRole('dialog').locator('input,textarea,select').count(), 0); await page.screenshot({ path: resolve(output, `${profile}-calendar-event-details.png`) }); await agenda.getByRole('button', { name: 'Close', exact: true }).click(); details = 'passed: actual event, read-only dialog'; }
      await page.screenshot({ path: resolve(output, `${profile}-calendar-agenda.png`) });
      await page.evaluate(() => {
        const app = document.querySelector('home-assistant'); const entity = Object.keys(app.hass.states).find(id => id.startsWith('switch.')) ?? Object.keys(app.hass.states).find(id => id.startsWith('light.'));
        if (!entity) throw new Error('Need an actual toggle entity for UI-only proof');
        window.actualInteractionCalls = [];
        const host = { ...app.hass, callService: async (...args) => { window.actualInteractionCalls.push(args); } };
        const card = document.createElement('navet-switch-card'); card.id = 'actual-protected-card'; card.setConfig({ type: 'custom:navet-switch-card', entity, name: 'Protected momentary fixture', protection: { enabled: true, unlock_duration: 1 }, press_action: { action: 'perform-action', perform_action: 'script.fixture_press' }, release_action: { action: 'perform-action', perform_action: 'script.fixture_release' } }); card.hass = host;
        window.navetInteractionMount.replaceChildren(card); window.actualProtectedCard = card;
      });
      const protectedCard = page.locator('#actual-protected-card'); const primary = protectedCard.locator('.primary');
      assert.equal(await primary.isDisabled(), true); await protectedCard.getByRole('button', { name: 'Unlock controls', exact: true }).click();
      await primary.focus(); await page.keyboard.down('Space'); await page.keyboard.up('Space');
      await page.waitForFunction(() => window.actualInteractionCalls.length === 2);
      assert.deepEqual(await page.evaluate(() => window.actualInteractionCalls.map(call => call.slice(0, 2))), [['script', 'fixture_press'], ['script', 'fixture_release']]);
      await protectedCard.getByRole('button', { name: 'Unlock controls', exact: true }).waitFor({ state: 'visible' }); assert.equal(await primary.isDisabled(), true);
      await page.screenshot({ path: resolve(output, `${profile}-protected-momentary.png`) });
      const callsBefore = calendarRequests;
      await page.evaluate(config => {
        const preview = document.createElement('navet-calendar-card'); preview.id = 'actual-calendar-preview'; preview.preview = true; preview.setConfig(config); preview.hass = document.querySelector('home-assistant').hass;
        window.actualProtectedCard.preview = true; window.navetInteractionMount.append(preview);
      }, saved);
      const preview = page.locator('#actual-calendar-preview navet-calendar'); await preview.waitFor({ state: 'attached' });
      assert.equal(await preview.getByRole('button', { name: 'Refresh calendars', exact: true }).isDisabled(), true);
      const unlock = protectedCard.getByRole('button', { name: 'Unlock controls', exact: true }); if (await unlock.count()) assert.equal(await unlock.isDisabled(), true);
      assert.equal(calendarRequests, callsBefore, 'Preview did not fetch calendar data'); assert.equal(serviceCalls, 0, 'No backend service commands sent'); assert.deepEqual(pageErrors, []);
      if (profile === 'modular') assert.ok([...resources].some(path => path.includes('/chunks/')));
      results.push({ profile, status: 'passed', version: session.version, viewport: page.viewportSize(), entrySha256, nativeCalendarSelector: true, savedCalendar: saved.calendar, unknownFieldRoundtrip: true, actualCalendarResponses: api, actualEventCount: eventCount, eventDetails: details, protectionExpiry: true, mockOnlyMomentaryDispatches: 2, backendServiceCalls: serviceCalls, previewCalendarRequests: calendarRequests - callsBefore, pageErrors, runtimeRequests: [...resources].sort() });
    } catch (error) {
      if (authenticated) await page.screenshot({ path: resolve(output, `${profile}-failure.png`) }).catch(() => {});
      results.push({ profile, status: 'failed', version: session.version, reason: redact(error.message), pageErrors });
      throw new Error(redact(error.message));
    } finally {
      await writeFile(resolve(output, 'results.json'), JSON.stringify({ scope: 'Actual disposable HA frontend; calendar GETs only. Interaction dispatch uses overridden callService, never backend services. No household/HACS acceptance.', results }, null, 2));
      await context.close();
    }
  }
  console.log(`Calendar/interaction frontend proof passed: ${results.map(result => result.profile).join(', ')}. Evidence: ${output}`);
} finally { await browser.close(); }
