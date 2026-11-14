import { expect, test, type Locator } from '@playwright/test';

async function changeSlider(locator: Locator, value: number) {
  await locator.evaluate((input: HTMLInputElement, next) => { input.value = String(next); }, value);
  await locator.dispatchEvent('change');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => (window as any).cards?.length === 7);
  await page.evaluate(() => {
    const w = window as any;
    const state = (entity_id: string, value: string, attributes: Record<string, unknown>) => ({ entity_id, state: value, attributes });
    w.advancedCalls = [];
    w.failAdvanced = false;
    w.advancedHost = {
      language: 'en', config: { unit_system: { temperature: '°F' } },
      states: {
        'light.dining_color': state('light.dining_color', 'on', { friendly_name: 'Dining color', supported_color_modes: ['hs'], hs_color: [32,70], supported_features: 4, effect_list: ['off','Candle'], effect: 'off', brightness: 153 }),
        'climate.dining_range': state('climate.dining_range', 'heat_cool', { friendly_name: 'Dining range', supported_features: 2, target_temp_low: 65, target_temp_high: 75, min_temp: 50, max_temp: 90, target_temp_step: 1, current_temperature: 70 }),
        'cover.dining_tilt': state('cover.dining_tilt', 'open', { friendly_name: 'Dining blind', supported_features: 255, current_position: 80, current_tilt_position: 40 }),
      },
      async callService(domain: string, service: string, data: Record<string, unknown>, target: { entity_id: string }) {
        if (w.failAdvanced) { w.failAdvanced = false; throw new Error('The device did not respond. Try again.'); }
        w.advancedCalls.push({ domain, service, data, target });
        const old = w.advancedHost.states[target.entity_id];
        const attributes = { ...old.attributes };
        if (data.hs_color) attributes.hs_color = data.hs_color;
        if (data.effect) attributes.effect = data.effect;
        if (data.target_temp_low !== undefined) attributes.target_temp_low = data.target_temp_low;
        if (data.target_temp_high !== undefined) attributes.target_temp_high = data.target_temp_high;
        if (data.tilt_position !== undefined) attributes.current_tilt_position = data.tilt_position;
        if (service === 'open_cover_tilt') attributes.current_tilt_position = 100;
        if (service === 'close_cover_tilt') attributes.current_tilt_position = 0;
        w.advancedHost = { ...w.advancedHost, states: { ...w.advancedHost.states, [target.entity_id]: { ...old, attributes } } };
        w.advancedSync();
      },
    };
    const configs = [
      { type: 'custom:navet-light-card', entity: 'light.dining_color', layout: 'comfortable' },
      { type: 'custom:navet-climate-card', entity: 'climate.dining_range', layout: 'comfortable' },
      { type: 'custom:navet-cover-card', entity: 'cover.dining_tilt' },
      { type: 'custom:navet-room-card', entities: ['light.dining_color','climate.dining_range','cover.dining_tilt'], name: 'Dining room' },
    ];
    const main = document.querySelector('main')!;
    main.replaceChildren();
    main.setAttribute('style', 'max-width:400px;padding:16px;display:grid;gap:16px');
    w.advancedCards = configs.map((config, i) => {
      const card = document.createElement(config.type.replace('custom:', '')) as any;
      card.id = `advanced-${i}`; card.setConfig(config); card.hass = w.advancedHost;
      main.append(card); return card;
    });
    w.advancedSync = () => w.advancedCards.forEach((card: any) => { card.hass = w.advancedHost; });
  });
});

test('dedicated cards submit color, Fahrenheit range and tilt to their own entities', async ({ page }) => {
  const light = page.locator('#advanced-0');
  await light.getByText('Color and effects', { exact: true }).click();
  await changeSlider(light.getByRole('slider', { name: 'Hue', exact: true }), 120);
  await light.getByRole('combobox', { name: 'Effect', exact: true }).selectOption('Candle');
  const climate = page.locator('#advanced-1');
  await climate.getByRole('button', { name: 'Temperature range', exact: true }).click();
  await expect(climate.locator('navet-climate-range')).toContainText('°F');
  await climate.getByRole('spinbutton', { name: 'Low target', exact: true }).focus();
  await page.keyboard.press('ArrowUp');
  await climate.getByRole('button', { name: 'Apply range', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(climate.getByRole('dialog')).toHaveCount(0);
  await expect(climate.getByRole('button', { name: 'Temperature range', exact: true })).toBeFocused();
  const cover = page.locator('#advanced-2');
  await cover.getByRole('button', { name: 'Tilt', exact: true }).click();
  await changeSlider(cover.getByRole('slider', { name: 'Tilt position', exact: true }), 65);
  await cover.getByRole('button', { name: 'Stop tilt', exact: true }).click();
  expect(await page.evaluate(() => (window as any).advancedCalls)).toEqual([
    { domain: 'light', service: 'turn_on', data: { hs_color: [120,70] }, target: { entity_id: 'light.dining_color' } },
    { domain: 'light', service: 'turn_on', data: { effect: 'Candle' }, target: { entity_id: 'light.dining_color' } },
    { domain: 'climate', service: 'set_temperature', data: { target_temp_low: 66, target_temp_high: 75 }, target: { entity_id: 'climate.dining_range' } },
    { domain: 'cover', service: 'set_cover_tilt_position', data: { tilt_position: 65 }, target: { entity_id: 'cover.dining_tilt' } },
    { domain: 'cover', service: 'stop_cover_tilt', data: {}, target: { entity_id: 'cover.dining_tilt' } },
  ]);
});

test('room auto controls route the owning member, validate range drafts and recover after a failed command', async ({ page }) => {
  const room = page.locator('#advanced-3');
  await room.getByRole('button', { name: 'Controls', exact: true }).click();
  const light = room.locator('.room-control').filter({ has: page.getByRole('button', { name: /Dining color/ }) });
  const climate = room.locator('.room-control').filter({ has: page.getByRole('button', { name: /Dining range/ }) });
  const cover = room.locator('.room-control').filter({ has: page.getByRole('button', { name: /Dining blind/ }) });
  await changeSlider(light.getByRole('slider', { name: 'Saturation', exact: true }), 50);
  await climate.getByRole('spinbutton', { name: 'Low target', exact: true }).fill('80');
  await expect(climate.getByRole('button', { name: 'Apply range', exact: true })).toBeDisabled();
  await expect(climate.getByRole('alert')).toContainText('Low target');
  await climate.getByRole('spinbutton', { name: 'High target', exact: true }).fill('82');
  await climate.getByRole('button', { name: 'Apply range', exact: true }).click();
  await page.evaluate(() => { (window as any).failAdvanced = true; });
  await cover.getByRole('button', { name: 'Open tilt', exact: true }).click();
  await expect(room.getByRole('alert')).toHaveText('The device did not respond. Try again.');
  await cover.getByRole('button', { name: 'Open tilt', exact: true }).click();
  await expect(room.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).advancedCalls)).toEqual([
    { domain: 'light', service: 'turn_on', data: { hs_color: [32,50] }, target: { entity_id: 'light.dining_color' } },
    { domain: 'climate', service: 'set_temperature', data: { target_temp_low: 80, target_temp_high: 82 }, target: { entity_id: 'climate.dining_range' } },
    { domain: 'cover', service: 'open_cover_tilt', data: {}, target: { entity_id: 'cover.dining_tilt' } },
  ]);
});

test('preview and unavailable states block advanced card controls; unknown tilt preserves discrete commands', async ({ page }) => {
  const light = page.locator('#advanced-0'), climate = page.locator('#advanced-1'), cover = page.locator('#advanced-2');
  await light.getByText('Color and effects', { exact: true }).click();
  await page.evaluate(() => { (window as any).advancedCards[0].preview = true; });
  await expect(light.getByRole('slider', { name: 'Hue', exact: true })).toBeDisabled();
  await changeSlider(light.getByRole('slider', { name: 'Hue', exact: true }), 200);
  await page.evaluate(() => {
    const w = window as any; w.advancedCards[0].preview = false;
    w.advancedHost = { ...w.advancedHost, states: { ...w.advancedHost.states, 'light.dining_color': { ...w.advancedHost.states['light.dining_color'], state: 'unavailable' } } }; w.advancedSync();
  });
  await expect(light.getByRole('slider', { name: 'Hue', exact: true })).toBeDisabled();

  await climate.getByRole('button', { name: 'Temperature range', exact: true }).click();
  await page.evaluate(() => { (window as any).advancedCards[1].preview = true; });
  await expect(climate.getByRole('button', { name: 'Apply range', exact: true })).toBeDisabled();
  await climate.locator('navet-climate-range').evaluate((el: any) => el.shadowRoot.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await page.evaluate(() => {
    const w = window as any; w.advancedCards[1].preview = false;
    w.advancedHost = { ...w.advancedHost, states: { ...w.advancedHost.states, 'climate.dining_range': { ...w.advancedHost.states['climate.dining_range'], state: 'unavailable' } } }; w.advancedSync();
  });
  await expect(climate.getByRole('button', { name: 'Apply range', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(climate.getByRole('dialog')).toHaveCount(0);

  await cover.getByRole('button', { name: 'Tilt', exact: true }).click();
  await page.evaluate(() => { (window as any).advancedCards[2].preview = true; });
  await expect(cover.getByRole('slider', { name: 'Tilt position', exact: true })).toBeDisabled();
  await changeSlider(cover.getByRole('slider', { name: 'Tilt position', exact: true }), 90);
  await page.evaluate(() => {
    const w = window as any; w.advancedCards[2].preview = false;
    w.advancedHost = { ...w.advancedHost, states: { ...w.advancedHost.states, 'cover.dining_tilt': { ...w.advancedHost.states['cover.dining_tilt'], state: 'unavailable' } } }; w.advancedSync();
  });
  await expect(cover.getByRole('button', { name: 'Open tilt', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).advancedCalls)).toEqual([]);
  await page.evaluate(() => {
    const w = window as any, old = w.advancedHost.states['cover.dining_tilt'];
    w.advancedHost = { ...w.advancedHost, states: { ...w.advancedHost.states, 'cover.dining_tilt': { ...old, state: 'open', attributes: { ...old.attributes, current_tilt_position: undefined } } } }; w.advancedSync();
  });
  await expect(cover.getByRole('slider', { name: 'Tilt position', exact: true })).toBeDisabled();
  await expect(cover.locator('navet-cover-tilt')).toContainText('position unknown');
  await cover.getByRole('button', { name: 'Close tilt', exact: true }).click();
  expect(await page.evaluate(() => (window as any).advancedCalls)).toEqual([{ domain: 'cover', service: 'close_cover_tilt', data: {}, target: { entity_id: 'cover.dining_tilt' } }]);
});

test('advanced room controls stay within a phone dialog and release after closing', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const room = page.locator('#advanced-3');
  await room.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(room.locator('navet-light-color')).toBeVisible();
  await expect(room.locator('navet-climate-range')).toBeVisible();
  await expect(room.locator('navet-cover-tilt')).toBeVisible();
  expect(await room.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await info.attach('phone-advanced-room.png', { body: await room.getByRole('dialog').screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(room.locator('.room-control')).toHaveCount(0);
  await expect(room.locator('navet-climate-range')).toHaveCount(0);
});
