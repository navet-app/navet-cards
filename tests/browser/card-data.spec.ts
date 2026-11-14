import { test, expect, type Page } from '@playwright/test';

type Mount = {kinds?: ('weather'|'energy-now')[];below?:boolean;preview?:boolean;hidden?:boolean;support?:number};
const forecast = {response:{'weather.shared':{forecast:[{datetime:'2026-10-20T12:00:00Z',temperature:17,templow:9,condition:'sunny'}]}}};
const history = [[{state:'0',last_changed:'2026-10-20T10:00:00Z'},{state:'30',last_changed:'2026-10-20T11:00:00Z'}]];
async function mount(page:Page, options:Mount={}) {
  await page.setViewportSize({width:900,height:1000});
  await page.route('**/card-data-host.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/card-data-host.html');
  await page.evaluate(async options=>{
    (window as any).hiddenForData = !!options.hidden;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=> (window as any).hiddenForData});
    const resource='/dist/modular/navet-cards.js';
    await import(resource);
    const host = {
      states:{
        'weather.shared':{entity_id:'weather.shared',state:'sunny',attributes:{friendly_name:'Shared weather',temperature:12,supported_features:options.support ?? 1}},
        'sensor.power':{entity_id:'sensor.power',state:'120',attributes:{friendly_name:'Shared power',unit_of_measurement:'W'}},
      },
      async callService(){},
      async callWS(message:unknown){
        const result = await fetch('/fake-ha/forecast',{method:'POST',body:JSON.stringify(message)});
        if(!result.ok) throw await result.json();
        return result.json();
      },
      async callApi(method:string,path:string){
        const result = await fetch('/fake-ha/history?path='+encodeURIComponent(path),{method});
        if(!result.ok) throw await result.json();
        return result.json();
      },
    };
    (window as any).dataHost = host;
    (window as any).dataCards = [];
    if(options.below){const spacer=document.createElement('div');spacer.style.height='3000px';document.body.append(spacer);}
    const container=document.createElement('div');
    container.style.cssText='display:flex;flex-wrap:wrap;gap:12px';
    document.body.append(container);
    for(const kind of options.kinds ?? ['weather']) {
      const card=document.createElement(`navet-${kind}-card`) as any;
      card.style.cssText='display:block;width:360px';
      card.preview=!!options.preview;
      card.setConfig({type:`custom:navet-${kind}-card`,...(kind==='weather'?{entity:'weather.shared'}:{entities:['sensor.power']})});
      card.hass=host;
      container.append(card);
      (window as any).dataCards.push(card);
    }
  },options);
  // Let actual IntersectionObserver and Lit layout finish before negative assertions.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}
async function respond(page:Page) {
  const counts={forecast:0,history:0};
  await page.route('**/fake-ha/forecast',route=>{counts.forecast++;return route.fulfill({json:forecast});});
  await page.route('**/fake-ha/history?*',route=>{counts.history++;return route.fulfill({json:history});});
  return counts;
}

test('visible equivalent cards share forecast/history work across HA state-object replacements',async({page})=>{
  const counts=await respond(page);
  await mount(page,{kinds:['weather','weather','energy-now','energy-now']});
  await expect(page.locator('navet-weather-card').first().locator('.forecast-row')).toContainText('17°');
  await expect.poll(()=>counts.history).toBe(1);
  expect(counts).toEqual({forecast:1,history:1});
  await page.evaluate(()=>{
    const host=(window as any).dataHost;
    const next={...host,states:{...host.states,'sensor.unrelated':{entity_id:'sensor.unrelated',state:'1',attributes:{}}}};
    for(const card of (window as any).dataCards) card.hass=next;
  });
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(counts).toEqual({forecast:1,history:1});
  await expect(page.locator('navet-weather-card').nth(1).locator('.forecast-row')).toContainText('17°');
});

test('below-viewport cards load neither optional data module nor requests until visible',async({page})=>{
  const counts=await respond(page);
  const dataModules:string[]=[];
  page.on('request',request=>{if(/\/card-data-[^/]+\.js/.test(request.url()))dataModules.push(request.url());});
  await mount(page,{below:true});
  expect(counts.forecast).toBe(0);
  expect(dataModules).toEqual([]);
  await page.locator('navet-weather-card').scrollIntoViewIfNeeded();
  await expect(page.locator('navet-weather-card .forecast-row')).toContainText('17°');
  expect(counts.forecast).toBe(1);
  expect(dataModules).toHaveLength(1);
});

test('preview cards remain request-free while visible and after state reassignment',async({page})=>{
  const counts=await respond(page);
  await mount(page,{preview:true,kinds:['weather','energy-now']});
  await page.evaluate(()=>{for(const card of (window as any).dataCards)card.hass={...(window as any).dataHost};});
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(counts).toEqual({forecast:0,history:0});
  await expect(page.locator('.data-status')).toHaveCount(0);
});

test('disconnect ignores a late forecast result and releases observer state',async({page})=>{
  let complete!:()=>void;
  let started=false;
  await page.route('**/fake-ha/forecast',async route=>{
    started=true;
    await new Promise<void>(resolve=>{complete=resolve;});
    await route.fulfill({json:forecast});
  });
  await mount(page);
  await expect.poll(()=>started).toBe(true);
  await page.evaluate(()=>{
    const card=(window as any).dataCards[0];
    (window as any).detachedDataCard=card;
    card.remove();
  });
  const response=page.waitForResponse('**/fake-ha/forecast');
  complete();
  await response;
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(await page.evaluate(()=>({points:(window as any).detachedDataCard.supplementary.length,observation:!!(window as any).detachedDataCard.dataObservation}))).toEqual({points:0,observation:false});
});

test('capability changes replace unsupported cached data with a supported forecast',async({page})=>{
  const counts=await respond(page);
  await mount(page,{support:0});
  await expect(page.locator('navet-weather-card').getByRole('status')).toContainText('not supported');
  expect(counts.forecast).toBe(0);
  await page.evaluate(()=>{
    const host=(window as any).dataHost;
    const next={...host,states:{...host.states,'weather.shared':{...host.states['weather.shared'],attributes:{...host.states['weather.shared'].attributes,supported_features:1}}}};
    (window as any).dataCards[0].hass=next;
  });
  await expect(page.locator('navet-weather-card .forecast-row')).toContainText('17°');
  expect(counts.forecast).toBe(1);
});

test('offline forecast and denied history retain distinct visible statuses',async({page})=>{
  await page.route('**/fake-ha/forecast',route=>route.fulfill({status:503,json:{code:'connection_lost',message:'Disconnected'}}));
  await page.route('**/fake-ha/history?*',route=>route.fulfill({status:403,json:{status:403,message:'Forbidden'}}));
  await mount(page,{kinds:['weather','energy-now']});
  await expect(page.locator('navet-weather-card').getByRole('status')).toHaveText('Data connection is offline.');
  await expect(page.locator('navet-energy-now-card').getByRole('status')).toHaveText('You do not have permission to read this data.');
});

test('an initially hidden document begins data work when it becomes visible',async({page})=>{
  const counts=await respond(page);
  await mount(page,{hidden:true});
  expect(counts.forecast).toBe(0);
  await page.evaluate(()=>{(window as any).hiddenForData=false;document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('navet-weather-card .forecast-row')).toContainText('17°');
  expect(counts.forecast).toBe(1);
});

test('household connection replacement does not reuse an earlier household snapshot',async({page})=>{
  let calls=0;
  await page.route('**/fake-ha/forecast',route=>{
    calls++;
    return route.fulfill({json:{response:{'weather.shared':{forecast:[{datetime:'2026-10-20T12:00:00Z',temperature:calls===1?17:23,condition:'sunny'}]}}}});
  });
  await mount(page);
  await expect(page.locator('navet-weather-card .forecast-row')).toContainText('17°');
  await page.evaluate(()=>{
    const next={...(window as any).dataHost,connection:{}};
    (window as any).dataCards[0].hass=next;
  });
  await expect(page.locator('navet-weather-card .forecast-row')).toContainText('23°');
  expect(calls).toBe(2);
});

test('hiding and releasing one shared subscriber leaves the other functional',async({page})=>{
  let calls=0;
  await page.route('**/fake-ha/forecast',route=>{
    calls++;
    return route.fulfill({json:{response:{'weather.shared':{forecast:[{datetime:'2026-10-20T12:00:00Z',temperature:calls===1?17:24,condition:'sunny'}]}}}});
  });
  await mount(page,{kinds:['weather','weather']});
  await expect(page.locator('navet-weather-card').nth(1).locator('.forecast-row')).toContainText('17°');
  expect(calls).toBe(1);
  await page.locator('navet-weather-card').first().evaluate(card=>(card as HTMLElement).style.display='none');
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await page.evaluate(()=>{
    const [hidden,visible]=(window as any).dataCards;
    hidden.dataObservation.refresh();
    hidden.remove();
    visible.dataObservation.refresh();
  });
  await expect(page.locator('navet-weather-card .forecast-row')).toContainText('24°');
  expect(calls).toBe(2);
});
