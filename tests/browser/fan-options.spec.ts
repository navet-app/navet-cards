import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => (window as any).cards?.length === 7);
  await page.evaluate(() => {
    const w = window as any;
    const fan = (id: string, name: string, features = 14) => ({entity_id:id,state:'on',attributes:{friendly_name:name,supported_features:features,preset_modes:['Sleep','Breeze'],preset_mode:'Sleep',direction:'forward',oscillating:false,percentage:33}});
    w.fanCalls = [];
    w.fanHost = {
      language:'en',states:{'fan.dining':fan('fan.dining','Dining fan'),'fan.bedroom':fan('fan.bedroom','Bedroom fan'),'fan.basic':fan('fan.basic','Basic fan',1)},
      async callService(domain: string, service: string, data: Record<string, unknown>, target: {entity_id:string}) {
        w.fanCalls.push({domain,service,data,target});
        const old = w.fanHost.states[target.entity_id];
        w.fanHost = {...w.fanHost,states:{...w.fanHost.states,[target.entity_id]:{...old,attributes:{...old.attributes,...data}}}};
        w.fanSync();
      },
    };
    const configs = [
      {type:'custom:navet-fan-card',entity:'fan.dining'},
      {type:'custom:navet-fan-card',entity:'fan.basic'},
      {type:'custom:navet-room-card',entities:['fan.dining','fan.bedroom'],name:'Fans'},
    ];
    const main = document.querySelector('main')!; main.replaceChildren(); main.setAttribute('style','max-width:400px;display:grid;gap:16px;padding:16px');
    w.fanCards = configs.map((config,i) => {const el = document.createElement(config.type.replace('custom:','')) as any;el.id=`fan-${i}`;el.setConfig(config);el.hass=w.fanHost;main.append(el);return el;});
    w.fanSync = () => w.fanCards.forEach((el:any)=>{el.hass=w.fanHost;});
  });
});

test('fan modal and room options send exact services to the selected owner without requiring speed', async ({ page }, info) => {
  const card = page.locator('#fan-0');
  await expect(card.getByRole('slider')).toHaveCount(0);
  await expect(page.locator('#fan-1').getByRole('button',{name:'Fan options',exact:true})).toHaveCount(0);
  await card.getByRole('button',{name:'Fan options',exact:true}).click();
  await card.getByRole('combobox',{name:'Preset mode',exact:true}).selectOption('Breeze');
  await card.getByRole('combobox',{name:'Oscillation',exact:true}).selectOption('true');
  const direction = card.getByRole('combobox',{name:'Direction',exact:true});
  await expect(direction).toBeEnabled();
  // Enter opens a native select popup on Linux; Tab commits typeahead and leaves it.
  await direction.focus(); await page.keyboard.press('r'); await page.keyboard.press('Tab');
  await expect(direction).toHaveValue('reverse');
  await page.keyboard.press('Escape');
  await expect(card.getByRole('dialog')).toHaveCount(0);
  await expect(card.getByRole('button',{name:'Fan options',exact:true})).toBeFocused();
  const room = page.locator('#fan-2'); await room.getByRole('button',{name:'Controls',exact:true}).click();
  const bedroom = room.locator('.room-control').filter({has:page.getByRole('button',{name:/Bedroom fan/})});
  await bedroom.getByRole('combobox',{name:'Preset mode',exact:true}).selectOption('Breeze');
  expect(await page.evaluate(()=>(window as any).fanCalls)).toEqual([
    {domain:'fan',service:'set_preset_mode',data:{preset_mode:'Breeze'},target:{entity_id:'fan.dining'}},
    {domain:'fan',service:'oscillate',data:{oscillating:true},target:{entity_id:'fan.dining'}},
    {domain:'fan',service:'set_direction',data:{direction:'reverse'},target:{entity_id:'fan.dining'}},
    {domain:'fan',service:'set_preset_mode',data:{preset_mode:'Breeze'},target:{entity_id:'fan.bedroom'}},
  ]);
  await page.setViewportSize({width:390,height:844});
  expect(await room.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await info.attach('phone-fan-options.png',{body:await room.getByRole('dialog').screenshot(),contentType:'image/png'});
});

test('closing options during an in-flight command restores focus after the opener is enabled', async ({ page }) => {
  const card = page.locator('#fan-0');
  const opener = card.getByRole('button',{name:'Fan options',exact:true});
  await opener.click();
  await page.evaluate(()=>{
    const w=window as any, service=w.fanHost.callService;
    w.fanHost.callService=async(...args:any[])=>{
      await new Promise<void>(resolve=>{w.finishFanCommand=resolve;});
      return service(...args);
    };
  });
  await card.getByRole('combobox',{name:'Preset mode',exact:true}).selectOption('Breeze');
  await expect(opener).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(card.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeDisabled();
  await page.evaluate(()=>(window as any).finishFanCommand());
  await expect(opener).toBeEnabled();
  await expect(opener).toBeFocused();
});

test('preview and unavailable fan options reject synthetic changes, unknown values stay unselected', async ({ page }) => {
  const card = page.locator('#fan-0');
  await page.evaluate(()=>{const w=window as any;const old=w.fanHost.states['fan.dining'];w.fanHost={...w.fanHost,states:{...w.fanHost.states,'fan.dining':{...old,attributes:{...old.attributes,preset_mode:undefined,oscillating:undefined,direction:undefined}}}};w.fanSync();});
  await card.getByRole('button',{name:'Fan options',exact:true}).click();
  for(const name of ['Preset mode','Oscillation','Direction']) await expect(card.getByRole('combobox',{name,exact:true})).toHaveValue('');
  await page.evaluate(()=>{(window as any).fanCards[0].preview=true;});
  await expect(card.getByRole('combobox',{name:'Preset mode',exact:true})).toBeDisabled();
  await card.getByRole('combobox',{name:'Preset mode',exact:true}).evaluate((el:HTMLSelectElement)=>{el.value='Breeze';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.evaluate(()=>{const w=window as any;w.fanCards[0].preview=false;const old=w.fanHost.states['fan.dining'];w.fanHost={...w.fanHost,states:{...w.fanHost.states,'fan.dining':{...old,state:'unavailable'}}};w.fanSync();});
  for(const name of ['Preset mode','Oscillation','Direction']) await expect(card.getByRole('combobox',{name,exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).fanCalls)).toEqual([]);
});
