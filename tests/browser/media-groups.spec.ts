import { test, expect, type Page } from '@playwright/test';

async function host(page: Page) {
  await page.route('**/media-groups-host.html', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main style="max-width:360px"></main></body></html>'}));
  await page.goto('/media-groups-host.html');
  await page.evaluate(async () => {
    await import('/dist/modular/navet-cards.js' as string);
    const w = window as any; w.groupCalls = []; w.groupFailures = 0;
    const state = (id: string, name: string, status = 'playing', features = 0) => ({entity_id:id,state:status,attributes:{friendly_name:name,supported_features:features}});
    w.groupHass = { states: {
      'media_player.living': {...state('media_player.living','Living speaker','playing',524288|4),attributes:{friendly_name:'Living speaker',supported_features:524288|4,volume_level:.3,group_members:['media_player.living']}},
      'media_player.kitchen':state('media_player.kitchen','Kitchen speaker','off'),
      'media_player.bedroom':state('media_player.bedroom','Bedroom speaker'),
      'media_player.offline':state('media_player.offline','Offline speaker','unavailable'),
      'light.other':state('light.other','Not a speaker'),
    }, async callService(...args: unknown[]) { w.groupCalls.push(args); if (w.groupFailures > 0) { w.groupFailures--; throw new Error('The integrations cannot group these players.'); } } };
    const card = document.createElement('navet-media-card') as any;
    card.id = 'group-owner'; card.setConfig({type:'custom:navet-media-card',entity:'media_player.living'}); card.hass = w.groupHass;
    document.querySelector('main')!.append(card); w.groupOwner = card;
  });
  await page.locator('#group-owner').getByRole('button', {name:'Controls',exact:true}).click();
  await expect(page.locator('#group-owner navet-media-groups')).toBeVisible();
}

test('media grouping joins only explicitly checked players and unjoins the exact owning player', async ({page}) => {
  await host(page);
  const widget = page.locator('#group-owner navet-media-groups');
  await expect(widget.getByRole('checkbox')).toHaveCount(3);
  await expect(widget.getByRole('checkbox',{name:/Offline speaker/})).toBeDisabled();
  await expect(widget.getByRole('button',{name:'Join selected',exact:true})).toBeDisabled();
  await widget.getByRole('checkbox',{name:'Kitchen speaker',exact:true}).check();
  await widget.getByRole('button',{name:'Join selected',exact:true}).click();
  await expect(widget.getByRole('button',{name:'Leave group',exact:true})).toBeEnabled();
  await widget.getByRole('button',{name:'Leave group',exact:true}).click();
  expect(await page.evaluate(() => (window as any).groupCalls)).toEqual([
    ['media_player','join',{group_members:['media_player.kitchen']},{entity_id:'media_player.living'}],
    ['media_player','unjoin',{},{entity_id:'media_player.living'}],
  ]);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/navet-media-grouping-phone.png'});
  const bounds = await widget.boundingBox(); expect(bounds!.width).toBeLessThanOrEqual(390);
});

test('grouping rejects a selected player that becomes unavailable and exposes server compatibility failures', async ({page}) => {
  await host(page);
  const widget = page.locator('#group-owner navet-media-groups');
  await widget.getByRole('checkbox',{name:'Kitchen speaker',exact:true}).check();
  // The native widget is deliberately stale here; provider validation still reads current HA state.
  await page.evaluate(() => {
    const w=window as any; w.groupHass.states['media_player.kitchen']={...w.groupHass.states['media_player.kitchen'],state:'unavailable'};
  });
  await widget.getByRole('button',{name:'Join selected',exact:true}).click();
  await expect(page.locator('#group-owner').getByRole('alert')).toContainText('unavailable');
  expect(await page.evaluate(() => (window as any).groupCalls)).toEqual([]);
  await widget.getByRole('checkbox',{name:'Bedroom speaker',exact:true}).check();
  await page.evaluate(() => { (window as any).groupFailures = 1; });
  await widget.getByRole('button',{name:'Join selected',exact:true}).click();
  await expect(page.locator('#group-owner').getByRole('alert')).toContainText('integrations cannot group');
  await widget.getByRole('checkbox',{name:'Bedroom speaker',exact:true}).check();
  await widget.getByRole('button',{name:'Join selected',exact:true}).click();
  await expect(page.locator('#group-owner').getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).groupCalls.length)).toBe(2);
});

test('selection resets on current owner, candidate context and lifecycle changes; stale queued clicks do nothing', async ({page}) => {
  await host(page);
  const widget = page.locator('#group-owner navet-media-groups');
  await widget.getByRole('checkbox',{name:'Kitchen speaker',exact:true}).check();
  await widget.evaluate((widget:any) => {
    const w=window as any;
    const click=widget.shadowRoot.querySelector('button');
    widget.entity={...widget.entity,externalId:'media_player.bedroom'};
    click.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true}));
    w.isolatedGroups=widget;
  });
  expect(await page.evaluate(() => (window as any).groupCalls)).toEqual([]);
  await expect(widget.getByRole('button',{name:'Join selected',exact:true})).toBeDisabled();
  await widget.getByRole('checkbox',{name:'Kitchen speaker',exact:true}).check();
  await page.evaluate(() => { const widget=(window as any).isolatedGroups; widget.candidates=widget.candidates.map((candidate:any)=>({...candidate,name:candidate.name+' updated'})); });
  await expect(widget.getByRole('checkbox',{name:'Kitchen speaker updated',exact:true})).not.toBeChecked();
  await widget.getByRole('checkbox',{name:'Kitchen speaker updated',exact:true}).check();
  await page.keyboard.press('Escape');
  await expect(page.locator('#group-owner navet-media-groups')).toHaveCount(0);
  await page.locator('#group-owner').getByRole('button',{name:'Controls',exact:true}).click();
  await expect(page.locator('#group-owner navet-media-groups').getByRole('button',{name:'Join selected',exact:true})).toBeDisabled();
});

test('preview, disabled and withdrawn grouping capabilities prevent widget commands', async ({page}) => {
  await host(page);
  const widget = page.locator('#group-owner navet-media-groups');
  await widget.evaluate((widget:any) => {
    const w=window as any; w.isolatedGroups=widget;
    widget.preview=true;
  });
  await expect(widget.getByRole('checkbox',{name:'Kitchen speaker',exact:true})).toBeDisabled();
  await widget.getByRole('button',{name:'Leave group',exact:true}).dispatchEvent('click');
  await page.evaluate(() => { const widget=(window as any).isolatedGroups; widget.preview=false; widget.disabled=true; });
  await expect(widget.getByRole('button',{name:'Leave group',exact:true})).toBeDisabled();
  await widget.getByRole('button',{name:'Leave group',exact:true}).dispatchEvent('click');
  await page.evaluate(() => { const widget=(window as any).isolatedGroups; widget.disabled=false; widget.entity={...widget.entity,capabilities:[]}; });
  await expect(widget.getByRole('checkbox')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).groupCalls)).toEqual([]);
});
