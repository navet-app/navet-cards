import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => customElements.get('navet-button-card') && customElements.get('navet-action-field'));
  await page.evaluate(() => {
    const w = window as any;
    document.querySelector('main')!.replaceChildren();
    w.sequenceCalls = []; w.sequenceEvents = [];
    w.sequenceHost = { states: {}, async callService(domain: string, service: string, data: unknown, target: unknown) { w.sequenceCalls.push({ domain, service, data, target }); if (service === 'failed') throw new Error('Rejected fixture service'); } };
    document.addEventListener('hass-action', (event: any) => w.sequenceEvents.push({ type: 'hass-action', detail: structuredClone(event.detail) }));
    document.addEventListener('ll-custom', (event: any) => w.sequenceEvents.push({ type: 'll-custom', detail: structuredClone(event.detail) }));
    w.addSequenceCard = (action: unknown, preview = false) => {
      const card = document.createElement('navet-button-card') as any;
      card.id = 'sequence-card'; card.preview = preview;
      card.setConfig({ type: 'custom:navet-button-card', name: 'Run sequence', tap_action: action }); card.hass = w.sequenceHost;
      document.querySelector('main')!.append(card); w.sequenceCard = card; return card;
    };
  });
});

test('sequences await services before HA Assist and standard custom DOM events', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.addSequenceCard({ action: 'sequence', sequence: [{ action: 'perform-action', perform_action: 'script.first' }, { action: 'assist', pipeline_id: 'preferred', start_listening: false }, { action: 'fire-dom-event', browser_mod: { service: 'browser_mod.popup', data: { title: 'Room tools' } } }] });
  });
  await page.getByRole('button', { name: 'Run sequence', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).sequenceEvents.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).sequenceCalls)).toEqual([{ domain: 'script', service: 'first', data: {}, target: {} }]);
  expect(await page.evaluate(() => (window as any).sequenceEvents)).toEqual([
    { type: 'hass-action', detail: { config: { tap_action: { action: 'assist', pipeline_id: 'preferred', start_listening: false } }, action: 'tap' } },
    { type: 'll-custom', detail: { action: 'fire-dom-event', browser_mod: { service: 'browser_mod.popup', data: { title: 'Room tools' } } } },
  ]);
});

test('configuration replacement cancels remaining effects after an in-flight service', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.sequenceHost.callService = (...args: unknown[]) => { w.sequenceCalls.push(args); return new Promise<void>(done => { w.finishSequenceService = done; }); };
    w.addSequenceCard({ action: 'sequence', sequence: [{ action: 'perform-action', perform_action: 'script.first' }, { action: 'fire-dom-event', stale: true }] });
  });
  await page.getByRole('button', { name: 'Run sequence', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).sequenceCalls.length)).toBe(1);
  await page.evaluate(async () => {
    const w = window as any;
    w.sequenceCard.setConfig({ type: 'custom:navet-button-card', name: 'New configuration', tap_action: { action: 'fire-dom-event', replacement: true } });
    w.finishSequenceService(); await w.sequenceCard.updateComplete;
  });
  expect(await page.evaluate(() => (window as any).sequenceEvents)).toEqual([]);
  await expect(page.getByRole('button', { name: 'New configuration', exact: true })).toBeEnabled();
});

test('explicit cancellation releases a waiting sequence and blocks its later DOM effects', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const w = window as any;
    w.sequenceHost.callService = (...args: unknown[]) => { w.sequenceCalls.push(args); return new Promise<void>(done => { w.finishSequenceService = done; }); };
    w.addSequenceCard({ action: 'sequence', sequence: [{ action: 'perform-action', perform_action: 'script.first' }, { action: 'fire-dom-event', cancelled: true }] });
  });
  await page.getByRole('button', { name: 'Run sequence', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).sequenceCalls.length)).toBe(1);
  await page.screenshot({ path: info.outputPath('phone-sequence-cancel.png') });
  await page.getByRole('button', { name: 'Cancel action', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel action', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run sequence', exact: true })).toBeEnabled();
  await page.evaluate(() => { (window as any).finishSequenceService(); });
  expect(await page.evaluate(() => (window as any).sequenceEvents)).toEqual([]);
});

test('a toggle step does not invalidate the following service step', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.sequenceHost.states['switch.sequence'] = { entity_id: 'switch.sequence', state: 'off', attributes: { friendly_name: 'Sequence lamp' } };
    const card = document.createElement('navet-switch-card') as any;
    card.setConfig({ type: 'custom:navet-switch-card', entity: 'switch.sequence', name: 'Toggle then run', tap_action: { action: 'sequence', sequence: [{ action: 'toggle' }, { action: 'perform-action', perform_action: 'script.after_toggle', target: { entity_id: 'script.follow_up' } }] } });
    card.hass = w.sequenceHost; document.querySelector('main')!.append(card);
  });
  await page.getByRole('button', { name: 'Toggle then run', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).sequenceCalls.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).sequenceCalls)).toEqual([
    { domain: 'switch', service: 'turn_on', data: {}, target: { entity_id: 'switch.sequence' } },
    { domain: 'script', service: 'after_toggle', data: {}, target: { entity_id: 'script.follow_up' } },
  ]);
});

test('continuing sequences recover from service errors while previews remain inactive', async ({ page }) => {
  await page.evaluate(() => (window as any).addSequenceCard({ action: 'sequence', continue_on_error: true, sequence: [{ action: 'perform-action', perform_action: 'script.failed' }, { action: 'fire-dom-event', recovered: true }] }));
  await page.getByRole('button', { name: 'Run sequence', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).sequenceEvents.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).sequenceEvents[0])).toEqual({ type: 'll-custom', detail: { action: 'fire-dom-event', recovered: true } });
  await page.evaluate(() => { (window as any).sequenceCard.preview = true; });
  await page.getByRole('button', { name: 'Run sequence', exact: true }).dispatchEvent('click');
  expect(await page.evaluate(() => (window as any).sequenceCalls.length)).toBe(1);
});

test('visual editor authors nested steps, Assist and foreign custom-event payloads losslessly', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const w = window as any;
    const field = document.createElement('navet-action-field') as any;
    field.id = 'sequence-editor'; field.value = { action: 'none', future: { keep: true } };
    field.addEventListener('value-changed', (event: any) => { w.sequenceDraft = structuredClone(event.detail.value); field.value = event.detail.value; });
    document.querySelector('main')!.append(field);
  });
  const field = page.locator('#sequence-editor');
  await field.getByRole('combobox', { name: 'Action type', exact: true }).selectOption('sequence');
  const first = field.locator('.sequence-step').first().locator('navet-action-field');
  await first.getByRole('combobox', { name: 'Action type', exact: true }).selectOption('assist');
  await first.getByLabel('Assist pipeline', { exact: true }).fill('preferred');
  await first.getByLabel('Assist pipeline', { exact: true }).dispatchEvent('change');
  await first.getByLabel('Start listening', { exact: true }).check();
  await field.getByRole('button', { name: 'Add action step', exact: true }).click();
  const second = field.locator('.sequence-step').nth(1).locator('navet-action-field');
  await second.getByRole('combobox', { name: 'Action type', exact: true }).selectOption('fire-dom-event');
  await second.getByLabel('Custom event fields (JSON)', { exact: true }).fill('{"browser_mod":{"service":"browser_mod.popup","data":{"title":"Tools"}}}');
  await second.getByLabel('Custom event fields (JSON)', { exact: true }).dispatchEvent('change');
  await field.getByRole('button', { name: 'Move step 2 up', exact: true }).click();
  await field.getByLabel('Continue after a failed step', { exact: true }).check();
  expect(await page.evaluate(() => (window as any).sequenceDraft)).toEqual({ action: 'sequence', future: { keep: true }, continue_on_error: true, sequence: [{ action: 'fire-dom-event', browser_mod: { service: 'browser_mod.popup', data: { title: 'Tools' } } }, { action: 'assist', pipeline_id: 'preferred', start_listening: true }] });
  expect(await page.evaluate(() => (window as any).sequenceCalls)).toEqual([]);
  expect(await field.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('phone-sequence-editor.png'), fullPage: true });
});
