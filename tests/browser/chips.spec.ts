import { expect,test } from '@playwright/test';
import { kitchenFixture } from '../fixtures/kitchen';

test.beforeEach(async({page})=>{
  await page.goto('/demo/index.html');
  await page.waitForFunction(()=>customElements.get('navet-chips-card')&&customElements.get('navet-chips-editor'));
  await page.evaluate((fixture)=>{
    const w=window as any;w.chipCalls=[];w.chipDetails=[];
    w.chipHost={...fixture,states:{...fixture.states,'weather.home':{entity_id:'weather.home',state:'sunny',attributes:{friendly_name:'Weather',temperature:21,temperature_unit:'°C'}}},async callService(...args:unknown[]){w.chipCalls.push(args);}};
    document.addEventListener('hass-more-info',(event:any)=>w.chipDetails.push(event.detail.entityId));
    w.mountChips=(config:unknown,preview=false)=>{const card=document.createElement('navet-chips-card') as any;card.id='chips-card';card.preview=preview;card.setConfig({type:'custom:navet-chips-card',chips:[],...(config as object)});card.hass=w.chipHost;document.querySelector('main')!.append(card);w.chipsCard=card;return card;};
  },kitchenFixture);
});

test('compact entity/weather/actions wrap on phone with 44px keyboard targets and native ownership',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{(window as any).mountChips({title:'At home',subtitle:'Everyday room controls',chips:[
    {id:'temperature',entity:'sensor.kitchen_temperature',name:'Room temperature',icon:'mdi:thermometer'},
    {id:'weather',entity:'weather.home'},
    {id:'coffee',entity:'switch.kitchen_coffee',name:'Coffee',tap_action:{action:'toggle'}},
    {id:'navigation',name:'Kitchen',tap_action:{action:'navigate',navigation_path:'#chips-kitchen'}},
  ]});});
  const widget=page.locator('#chips-card navet-chips');
  await expect(widget.getByRole('heading',{name:'At home'})).toBeVisible();
  await expect(widget.getByRole('button',{name:'Weather',exact:true})).toContainText(/21 °C/);
  const reading=widget.getByRole('button',{name:'Room temperature',exact:true});
  await reading.focus();await reading.press('Enter');
  expect(await page.evaluate(()=>(window as any).chipDetails)).toEqual(['sensor.kitchen_temperature']);
  await widget.getByRole('button',{name:'Coffee',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).chipCalls.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).chipCalls[0])).toEqual(['switch','turn_on',{}, {entity_id:'switch.kitchen_coffee'}]);
  const bounds=await widget.getByRole('button').evaluateAll(elements=>elements.map(element=>({height:element.getBoundingClientRect().height,width:element.getBoundingClientRect().width})));
  expect(bounds.every(box=>box.height>=44&&box.width>=44)).toBe(true);
  expect(await widget.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.locator('#chips-card').screenshot({path:info.outputPath('chips-phone.png')});
});

test('navigation active state follows location and preview blocks all chip effects',async({page})=>{
  await page.evaluate(()=>{(window as any).mountChips({chips:[{id:'kitchen',name:'Kitchen',tap_action:{action:'navigate',navigation_path:'#chips-kitchen'}},{id:'details',entity:'sensor.kitchen_temperature',name:'Temperature'}]});});
  const widget=page.locator('#chips-card navet-chips');
  const kitchen=widget.getByRole('button',{name:'Kitchen',exact:true});
  await kitchen.click();
  await expect(kitchen).toHaveAttribute('aria-current','page');
  await page.evaluate(()=>{history.replaceState(null,'','#chips-hall');window.dispatchEvent(new Event('location-changed'));});
  await expect(kitchen).not.toHaveAttribute('aria-current','page');
  await page.evaluate(()=>{(window as any).chipsCard.preview=true;});
  const hash=await page.evaluate(()=>location.hash);
  await expect(kitchen).toBeDisabled();
  await kitchen.dispatchEvent('click');
  await widget.getByRole('button',{name:'Temperature',exact:true}).dispatchEvent('click');
  expect(await page.evaluate(()=>location.hash)).toBe(hash);
  expect(await page.evaluate(()=>(window as any).chipCalls)).toEqual([]);
  expect(await page.evaluate(()=>(window as any).chipDetails)).toEqual([]);
});

test('chip gestures dispatch once and pending work cancels after hidden/config/disconnect changes',async({page})=>{
  await page.evaluate(()=>{(window as any).mountChips({chips:[{id:'light',entity:'light.kitchen_ceiling',name:'Ceiling',visible_when:{entity:'binary_sensor.kitchen_window',state:'off'},tap_action:{action:'perform-action',perform_action:'light.turn_on'},hold_action:{action:'perform-action',perform_action:'light.turn_off'},double_tap_action:{action:'perform-action',perform_action:'light.toggle'}}]});});
  const name=page.locator('#chips-card navet-chips').getByRole('button',{name:'Ceiling',exact:true});
  await expect(name).toBeVisible();await page.clock.install();
  await name.click();await page.clock.fastForward(300);
  await expect.poll(()=>page.evaluate(()=>(window as any).chipCalls.length)).toBe(1);
  await name.dispatchEvent('pointerdown',{button:0,clientX:5,clientY:5});await page.clock.fastForward(510);await name.dispatchEvent('pointerup');await name.dispatchEvent('click',{detail:1});
  await name.dblclick();await page.clock.fastForward(300);
  await expect.poll(()=>page.evaluate(()=>(window as any).chipCalls.length)).toBe(3);
  expect(await page.evaluate(()=>(window as any).chipCalls.map((call:any[])=>call.slice(0,2)))).toEqual([['light','turn_on'],['light','turn_off'],['light','toggle']]);
  await name.dispatchEvent('pointerdown',{button:0,clientX:5,clientY:5});
  await page.evaluate(async()=>{const w=window as any;w.chipHost={...w.chipHost,states:{...w.chipHost.states,'binary_sensor.kitchen_window':{...w.chipHost.states['binary_sensor.kitchen_window'],state:'on'}}};w.chipsCard.hass=w.chipHost;await w.chipsCard.updateComplete;});
  await page.clock.fastForward(600);await expect(name).toHaveCount(0);
  await page.evaluate(()=>{const w=window as any;w.chipsCard.setConfig({type:'custom:navet-chips-card',chips:[{id:'new',name:'Replacement',tap_action:{action:'navigate',navigation_path:'#new'}}]});});
  const replacement=page.locator('#chips-card navet-chips').getByRole('button',{name:'Replacement',exact:true});
  await replacement.dispatchEvent('pointerdown',{button:0,clientX:5,clientY:5});
  await page.evaluate(()=>{(window as any).chipsCard.remove();});await page.clock.fastForward(600);
  expect(await page.evaluate(()=>(window as any).chipCalls.length)).toBe(3);
});

test('chips editor authors from empty config, preserves stable IDs/unknown fields and pending invalid actions',async({page})=>{
  await page.evaluate(()=>{
    const w=window as any;const editor=document.createElement('navet-card-editor') as any;
    editor.id='chips-editor';editor.hass=w.chipHost;editor.setConfig({type:'custom:navet-chips-card',chips:[],future:{keep:true}});
    editor.addEventListener('config-changed',(event:any)=>w.chipsSaved=structuredClone(event.detail.config));document.querySelector('main')!.append(editor);
  });
  const outer=page.locator('#chips-editor');const editor=outer.locator('navet-chips-editor');
  await editor.getByLabel('Title',{exact:true}).fill('Rooms');await editor.getByLabel('Title',{exact:true}).dispatchEvent('change');
  await editor.getByRole('button',{name:'Add entity chip',exact:true}).click();
  await editor.getByRole('button',{name:'Add action chip',exact:true}).click();
  const action=editor.locator('.item').nth(1);
  await action.getByLabel('Chip name',{exact:true}).fill('Kitchen');await action.getByLabel('Chip name',{exact:true}).dispatchEvent('change');
  const field=action.locator('navet-action-field').first();
  await field.getByLabel('Navigation path',{exact:true}).fill('#kitchen');await field.getByLabel('Navigation path',{exact:true}).dispatchEvent('change');
  await editor.getByRole('button',{name:'Move chip 2 up',exact:true}).click();
  expect((await page.evaluate(()=>(window as any).chipsSaved)).chips.map((chip:any)=>chip.id)).toEqual(['chip-2','chip-1']);
  const first=editor.locator('.item').first();const actionField=first.locator('navet-action-field').first();
  await actionField.getByLabel('Action type',{exact:true}).selectOption('url');
  await actionField.getByLabel('External URL',{exact:true}).fill('javascript:alert(1)');await actionField.getByLabel('External URL',{exact:true}).dispatchEvent('change');
  await expect(editor.getByRole('alert')).toBeVisible();
  await outer.getByLabel('Name',{exact:true}).fill('Common card name');await outer.getByLabel('Name',{exact:true}).dispatchEvent('change');
  await expect(actionField.getByLabel('External URL',{exact:true})).toHaveValue('javascript:alert(1)');
  await actionField.getByLabel('External URL',{exact:true}).fill('https://example.com/help');await actionField.getByLabel('External URL',{exact:true}).dispatchEvent('change');
  await expect(editor.getByRole('alert')).toHaveCount(0);
  const saved=await page.evaluate(()=>(window as any).chipsSaved);
  expect(saved.future).toEqual({keep:true});expect(saved.title).toBe('Rooms');expect(saved.name).toBe('Common card name');expect(saved.chips[0].tap_action.url_path).toBe('https://example.com/help');
  await page.evaluate(()=>{const w=window as any;(document.querySelector('#chips-editor') as any).setConfig(JSON.parse(JSON.stringify(w.chipsSaved)));});
  await expect(editor.getByLabel('Title',{exact:true})).toHaveValue('Rooms');
  expect(await page.evaluate(()=>(window as any).chipCalls)).toEqual([]);
});

test('separator and spacer chips are noninteractive, conditional layout primitives on phone',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{(window as any).mountChips({title:'Room groups',chips:[
    {id:'room',entity:'sensor.kitchen_temperature',name:'Kitchen'},
    {id:'space',type:'spacer',entity:'switch.kitchen_coffee',tap_action:{action:'toggle'}},
    {id:'navigate',name:'Open room',tap_action:{action:'navigate',navigation_path:'#layout-room'}},
    {id:'line',type:'separator',name:'Device controls',visible_when:{entity:'binary_sensor.kitchen_window',state:'off'},tap_action:{action:'navigate',navigation_path:'#must-not-open'}},
    {id:'coffee',entity:'switch.kitchen_coffee',name:'Coffee'},
  ]});});
  const widget=page.locator('#chips-card navet-chips');
  await expect(widget.getByRole('button')).toHaveCount(3);
  await expect(widget.getByRole('separator',{name:'Device controls'})).toBeVisible();
  const spacer=widget.locator('[data-chip-id="space"]');
  await expect(spacer).toHaveAttribute('aria-hidden','true');
  await spacer.dispatchEvent('click');await widget.getByRole('separator').dispatchEvent('click');
  expect(await page.evaluate(()=>(window as any).chipCalls)).toEqual([]);
  expect(await page.evaluate(()=>location.hash)).not.toBe('#must-not-open');
  expect(await widget.getByRole('separator').evaluate(element=>element.getBoundingClientRect().width)).toBeGreaterThan(250);
  expect(await widget.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.locator('#chips-card').screenshot({path:info.outputPath('chips-layout-phone.png')});
  await page.evaluate(()=>{const w=window as any;w.chipsCard.hass={...w.chipHost,states:{...w.chipHost.states,'binary_sensor.kitchen_window':{...w.chipHost.states['binary_sensor.kitchen_window'],state:'on'}}};});
  await expect(widget.getByRole('separator')).toHaveCount(0);
});

test('visual layout editing preserves dormant fields and restores interactive chips',async({page})=>{
  await page.evaluate(()=>{
    const w=window as any;const editor=document.createElement('navet-card-editor') as any;
    editor.id='chips-editor';editor.hass=w.chipHost;editor.setConfig({type:'custom:navet-chips-card',chips:[{id:'existing',entity:'switch.kitchen_coffee',name:'Coffee',tap_action:{action:'toggle'},future_chip:{keep:true}}],future:{keep:true}});
    editor.addEventListener('config-changed',(event:any)=>w.chipsSaved=structuredClone(event.detail.config));document.querySelector('main')!.append(editor);
  });
  const editor=page.locator('#chips-editor navet-chips-editor');
  const first=editor.locator('.item').first();
  await first.getByLabel('Chip type',{exact:true}).selectOption('separator');
  await expect(first.locator('navet-action-field')).toHaveCount(0);
  await expect(first.getByLabel('Entity (optional)',{exact:true})).toHaveCount(0);
  await editor.getByRole('button',{name:'Add spacer',exact:true}).click();
  await editor.getByRole('button',{name:'Add separator',exact:true}).click();
  await editor.getByRole('button',{name:'Move chip 3 up',exact:true}).click();
  let saved=await page.evaluate(()=>(window as any).chipsSaved);
  expect(saved.chips.map((chip:any)=>chip.type)).toEqual(['separator','separator','spacer']);
  expect(saved.chips[0]).toMatchObject({entity:'switch.kitchen_coffee',tap_action:{action:'toggle'},future_chip:{keep:true}});
  expect(saved.future).toEqual({keep:true});
  await first.getByLabel('Chip type',{exact:true}).selectOption('entity');
  await expect(first.locator('navet-action-field')).toHaveCount(3);
  saved=await page.evaluate(()=>(window as any).chipsSaved);
  expect(saved.chips[0]).toMatchObject({type:'entity',entity:'switch.kitchen_coffee',tap_action:{action:'toggle'},future_chip:{keep:true}});
  expect(await page.evaluate(()=>(window as any).chipCalls)).toEqual([]);
});
