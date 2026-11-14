import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => customElements.get('navet-remote-card'));
  await page.evaluate(() => {
    const w = window as any;
    w.remoteCalls = [];
    const raw = (id: string, supported_features = 4) => ({ entity_id: id, state: 'off', attributes: { friendly_name: 'Living room remote', supported_features, activity_list: ['Watch TV', 'Listen to music'], current_activity: 'Watch TV' } });
    w.remoteHost = { language: 'en', states: { 'remote.living_room': raw('remote.living_room'), 'remote.basic': raw('remote.basic', 0) },
      async callService(domain: string, service: string, data: Record<string, unknown>, target: { entity_id: string }) {
        w.remoteCalls.push({ domain, service, data, target });
        const old = w.remoteHost.states[target.entity_id];
        w.remoteHost = { ...w.remoteHost, states: { ...w.remoteHost.states, [target.entity_id]: { ...old, state: service === 'turn_off' ? 'off' : 'on', attributes: { ...old.attributes, ...(data.activity ? { current_activity: data.activity } : {}) } } } };
        w.syncRemote();
      },
    };
    const main = document.querySelector('main')!;
    main.replaceChildren(); main.setAttribute('style', 'display:grid;gap:16px;max-width:400px;padding:16px;margin:auto');
    w.remoteCards = [{ type: 'custom:navet-remote-card', entity: 'remote.living_room' }, { type: 'custom:navet-remote-card', entity: 'remote.basic' }, { type: 'custom:navet-room-card', name: 'Living room', entities: ['remote.living_room'] }].map((config, index) => {
      const card = document.createElement(config.type.replace('custom:', '')) as any;
      card.id = `remote-${index}`; card.setConfig(config); card.hass = w.remoteHost; main.append(card); return card;
    });
    w.syncRemote = () => w.remoteCards.forEach((card: any) => { card.hass = w.remoteHost; });
  });
});

test('advertised remote activity starts from off and power services target the owning remote', async ({ page }) => {
  const card = page.locator('#remote-0');
  await page.locator('#remote-1').getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(page.locator('#remote-1').getByRole('combobox', { name: 'Activity', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Controls', exact: true }).click();
  await card.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('Listen to music');
  await expect(card.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue('Listen to music');
  await card.getByRole('button', { name: 'Turn off', exact: true }).click();
  await card.getByRole('button', { name: 'Turn on', exact: true }).click();
  expect(await page.evaluate(() => (window as any).remoteCalls)).toEqual([
    { domain: 'remote', service: 'turn_on', data: { activity: 'Listen to music' }, target: { entity_id: 'remote.living_room' } },
    { domain: 'remote', service: 'turn_off', data: {}, target: { entity_id: 'remote.living_room' } },
    { domain: 'remote', service: 'turn_on', data: {}, target: { entity_id: 'remote.living_room' } },
  ]);
});

test('remote options work inside a phone room and disappear when closed', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const room = page.locator('#remote-2');
  await room.getByRole('button', { name: 'Controls', exact: true }).click();
  await room.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('Listen to music');
  await expect(room.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue('Listen to music');
  expect(await room.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('phone-remote-room.png') });
  await page.keyboard.press('Escape');
  await expect(room.locator('navet-remote-controls')).toHaveCount(0);
  expect((await page.evaluate(() => (window as any).remoteCalls)).length).toBe(1);
});

test('unknown activity stays unselected and preview or replaced capabilities block effects', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any, raw = w.remoteHost.states['remote.living_room'];
    w.remoteHost = { ...w.remoteHost, states: { ...w.remoteHost.states, 'remote.living_room': { ...raw, attributes: { ...raw.attributes, current_activity: null } } } }; w.syncRemote();
  });
  const card = page.locator('#remote-0');
  await card.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(card.getByRole('combobox', { name: 'Activity', exact: true })).toHaveValue('');
  await page.evaluate(() => { (window as any).remoteCards[0].preview = true; });
  await expect(card.getByRole('combobox', { name: 'Activity', exact: true })).toBeDisabled();
  await card.getByRole('combobox', { name: 'Activity', exact: true }).evaluate((element: HTMLSelectElement) => { element.value = 'Listen to music'; element.dispatchEvent(new Event('change', { bubbles: true })); });
  await card.getByRole('button', { name: 'Turn on', exact: true }).dispatchEvent('click');
  expect(await page.evaluate(() => (window as any).remoteCalls)).toEqual([]);
  await page.evaluate(() => {
    const w = window as any, raw = w.remoteHost.states['remote.living_room'];
    w.remoteCards[0].preview = false;
    w.remoteHost = { ...w.remoteHost, states: { ...w.remoteHost.states, 'remote.living_room': { ...raw, attributes: { ...raw.attributes, supported_features: 0 } } } }; w.syncRemote();
  });
  await expect(card.getByRole('combobox', { name: 'Activity', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).remoteCalls)).toEqual([]);
});
