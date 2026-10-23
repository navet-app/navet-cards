import { test, expect } from '@playwright/test';
import { kitchenFixture } from '../fixtures/kitchen';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => customElements.get('navet-switch-card') && customElements.get('navet-sub-controls-editor'));
  await page.evaluate((fixture) => {
    const w = window as any;
    w.richCalls = [];
    w.richHost = { ...fixture, states: { ...fixture.states, 'sensor.kitchen_temperature': { ...fixture.states['sensor.kitchen_temperature'], attributes: { ...fixture.states['sensor.kitchen_temperature'].attributes, humidity: 45 } } }, async callService(...args: unknown[]) { w.richCalls.push(args); } };
    w.mountRich = (config: unknown, preview = false) => {
      const card = document.createElement('navet-switch-card') as any;
      card.id = 'rich-card';card.preview=preview;card.setConfig({type:'custom:navet-switch-card',entity:'switch.kitchen_coffee',name:'Coffee',...(config as object)});card.hass=w.richHost;
      document.querySelector('main')!.append(card);w.richCard=card;return card;
    };
  }, kitchenFixture);
});

test('groups lazily mount read-only attribute readings, honor display overrides and preserve source', async ({ page }, info) => {
  await page.evaluate(() => {
    const w=window as any;
    w.richInput={sub_controls_position:'top',sub_control_groups:[{id:'comfort',name:'Comfort',collapsed:true}],sub_controls:[{entity:'sensor.kitchen_temperature',group:'comfort',name:'Humidity',icon:'mdi:water-percent',attribute:'humidity',unit:'%',show_name:false,show_state:true,read_only:true,control:'state'}]};
    w.mountRich(w.richInput);
  });
  const widget=page.locator('#rich-card navet-sub-controls');
  await expect(widget.locator('.sub-control')).toHaveCount(0);
  await widget.getByRole('button',{name:'Comfort',exact:true}).click();
  await expect(widget.locator('.sub-control')).toHaveCount(1);
  await expect(widget.locator('.state')).toHaveText('45 %');
  await expect(widget.locator('ha-icon')).toHaveCount(1);
  const reading=widget.getByRole('button',{name:'Humidity',exact:true});
  await expect(reading).toBeDisabled();
  await expect(reading).not.toHaveText(/Humidity/);
  await reading.dispatchEvent('click');
  expect(await page.evaluate(()=>(window as any).richCalls)).toEqual([]);
  await widget.getByRole('button',{name:'Comfort',exact:true}).click();
  await expect(widget.locator('.sub-control')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).richInput.sub_control_groups[0].collapsed)).toBe(true);
  await page.setViewportSize({width:390,height:844});
  await widget.getByRole('button',{name:'Comfort',exact:true}).click();
  await page.locator('#rich-card').screenshot({path:info.outputPath('rich-sub-controls-phone.png')});
  expect(await widget.evaluate((element)=>element.scrollWidth<=element.clientWidth)).toBe(true);
});

test('secondary gestures keep their owner and cancel pending work when hidden, collapsed, disabled or disconnected', async ({ page }) => {
  await page.evaluate(() => {
    const w=window as any;
    w.richGestureConfig={sub_control_groups:[{id:'actions',name:'Actions'}],sub_controls:[{entity:'light.kitchen_ceiling',name:'Ceiling',group:'actions',visible_when:{entity:'binary_sensor.kitchen_window',state:'off'},tap_action:{action:'perform-action',perform_action:'light.turn_on'},hold_action:{action:'perform-action',perform_action:'light.turn_off'},double_tap_action:{action:'perform-action',perform_action:'light.toggle'}}]};
    w.mountRich(w.richGestureConfig);
  });
  const name=page.locator('#rich-card navet-sub-controls').getByRole('button',{name:'Ceiling',exact:true});
  await expect(name).toBeVisible();
  await page.clock.install();
  await name.click();await page.clock.fastForward(300);
  await expect.poll(()=>page.evaluate(()=>(window as any).richCalls.length)).toBe(1);
  await name.dispatchEvent('pointerdown',{button:0,clientX:5,clientY:5});await page.clock.fastForward(510);await name.dispatchEvent('pointerup');
  await expect.poll(()=>page.evaluate(()=>(window as any).richCalls.length)).toBe(2);
  await name.dispatchEvent('click',{detail:1}); // Suppress the click generated after a completed hold.
  await name.dblclick();await page.clock.fastForward(300);
  await expect.poll(()=>page.evaluate(()=>(window as any).richCalls.length)).toBe(3);
  expect(await page.evaluate(()=>(window as any).richCalls)).toEqual([
    ['light','turn_on',{}, {entity_id:'light.kitchen_ceiling'}],['light','turn_off',{}, {entity_id:'light.kitchen_ceiling'}],['light','toggle',{}, {entity_id:'light.kitchen_ceiling'}],
  ]);
  // A condition can change after pointerdown while the same saved configuration remains.
  await name.dispatchEvent('pointerdown',{button:0,clientX:5,clientY:5});
  await page.evaluate(async()=>{const w=window as any;w.richHost={...w.richHost,states:{...w.richHost.states,'binary_sensor.kitchen_window':{...w.richHost.states['binary_sensor.kitchen_window'],state:'on'}}};w.richCard.hass=w.richHost;await w.richCard.updateComplete;});
  await page.clock.fastForward(600);
  await expect(name).toHaveCount(0);
  await page.evaluate(async()=>{const w=window as any;w.richHost={...w.richHost,states:{...w.richHost.states,'binary_sensor.kitchen_window':{...w.richHost.states['binary_sensor.kitchen_window'],state:'off'}}};w.richCard.hass=w.richHost;await w.richCard.updateComplete;});
  await name.dispatchEvent('pointerdown',{button:0,clientX:5,clientY:5});
  await page.locator('#rich-card navet-sub-controls').getByRole('button',{name:'Actions',exact:true}).click();
  await page.clock.fastForward(600);
  await page.locator('#rich-card navet-sub-controls').getByRole('button',{name:'Actions',exact:true}).click();
  await name.dispatchEvent('pointerdown',{button:0,clientX:5,clientY:5});
  await page.evaluate(()=>{(window as any).richCard.preview=true;});await page.clock.fastForward(600);
  await page.evaluate(()=>{(window as any).richCard.preview=false;});
  await name.dispatchEvent('pointerdown',{button:0,clientX:5,clientY:5});
  await page.evaluate(()=>{(window as any).richCard.remove();});await page.clock.fastForward(600);
  expect(await page.evaluate(()=>(window as any).richCalls.length)).toBe(3);
});

test('cancelled sliders do not commit; keyboard and a new pointer interaction still work', async ({ page }) => {
  await page.evaluate(()=>{(window as any).mountRich({sub_controls:[{entity:'light.kitchen_ceiling',name:'Ceiling',control:'slider'}]});});
  const slider=page.locator('#rich-card navet-sub-controls').getByRole('slider',{name:'Ceiling Brightness',exact:true});
  await expect(slider).toBeVisible();
  await slider.evaluate((element)=>{(element as HTMLInputElement).value='90';element.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(await page.evaluate(()=>(window as any).richCalls)).toEqual([]);
  await slider.press('ArrowRight');
  await expect.poll(()=>page.evaluate(()=>(window as any).richCalls.length)).toBe(1);
  await slider.evaluate((element)=>{element.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));(element as HTMLInputElement).value='75';element.dispatchEvent(new Event('change',{bubbles:true}));});
  await expect.poll(()=>page.evaluate(()=>(window as any).richCalls.length)).toBe(2);
  expect(await page.evaluate(()=>(window as any).richCalls[1])).toMatchObject(['light','turn_on',{brightness_pct:75},{entity_id:'light.kitchen_ceiling'}]);
});

test('offline and missing subentities retain native details while device controls remain disabled', async ({ page }) => {
  await page.evaluate(()=>{
    const w=window as any;w.richDetails=[];
    document.addEventListener('hass-more-info',(event:any)=>w.richDetails.push(event.detail.entityId));
    w.mountRich({sub_controls:[{entity:'media_player.kitchen_radio',name:'Offline radio',control:'slider'},{entity:'light.missing',name:'Missing light',control:'toggle'}]});
  });
  const widget=page.locator('#rich-card navet-sub-controls');
  await widget.getByRole('button',{name:'Offline radio',exact:true}).click();
  await widget.getByRole('button',{name:'Missing light',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).richDetails)).toEqual(['media_player.kitchen_radio','light.missing']);
  await expect(widget.getByRole('slider')).toBeDisabled();
  await expect(widget.locator('.sub-toggle')).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).richCalls)).toEqual([]);
});

test('visual editor reorders rich controls and groups while retaining unknown fields and invalid drafts', async ({ page }) => {
  await page.evaluate(()=>{
    const w=window as any;
    const editor=document.createElement('navet-card-editor') as any;editor.id='rich-editor';editor.hass=w.richHost;
    w.richEditorInput={type:'custom:navet-switch-card',entity:'switch.kitchen_coffee',future_card:{keep:true},sub_controls:[{entity:'light.kitchen_ceiling',name:'Ceiling',control:'slider',future_sub:{keep:true}},{entity:'sensor.kitchen_temperature',name:'Reading',control:'state'}]};
    editor.setConfig(w.richEditorInput);editor.addEventListener('config-changed',(event:any)=>{w.richSaved=structuredClone(event.detail.config);});document.querySelector('main')!.append(editor);
  });
  const parent=page.locator('#rich-editor');
  await parent.locator('summary').filter({hasText:/^Sub-controls$/}).click();
  const editor=parent.locator('navet-sub-controls-editor');
  await editor.getByLabel('Sub-control position',{exact:true}).selectOption('top');
  await editor.locator('summary').filter({hasText:/^Sub-control groups$/}).click();
  await editor.getByRole('button',{name:'Add group',exact:true}).click();
  await editor.getByLabel('Group 1 name',{exact:true}).fill('Comfort');await editor.getByLabel('Group 1 name',{exact:true}).dispatchEvent('change');
  await editor.getByLabel('Group 1 starts collapsed',{exact:true}).check();
  const row=editor.locator('.item').filter({has:page.getByLabel('Name',{exact:true})}).first();
  await row.locator('summary').filter({hasText:/^Display and grouping$/}).click();
  await row.getByLabel('Icon',{exact:true}).fill('mdi:lightbulb');await row.getByLabel('Icon',{exact:true}).dispatchEvent('change');
  await row.getByLabel('Group',{exact:true}).selectOption('group-1');
  await row.getByLabel('Read only',{exact:true}).check();
  await row.getByLabel('Show state',{exact:true}).uncheck();
  await editor.getByRole('button',{name:'Move sub-control 1 down',exact:true}).click();
  const saved=await page.evaluate(()=>(window as any).richSaved);
  expect(saved.sub_controls_position).toBe('top');
  expect(saved.sub_control_groups).toEqual([{id:'group-1',name:'Comfort',collapsed:true}]);
  expect(saved.sub_controls[1]).toMatchObject({entity:'light.kitchen_ceiling',icon:'mdi:lightbulb',group:'group-1',read_only:true,show_state:false,future_sub:{keep:true}});
  expect(saved.future_card).toEqual({keep:true});
  await editor.getByLabel('Group 1 name',{exact:true}).fill('');await editor.getByLabel('Group 1 name',{exact:true}).dispatchEvent('change');
  await expect(editor.getByRole('alert')).toBeVisible();
  expect((await page.evaluate(()=>(window as any).richSaved)).sub_control_groups[0].name).toBe('Comfort');
  await editor.getByLabel('Group 1 name',{exact:true}).fill('Climate');await editor.getByLabel('Group 1 name',{exact:true}).dispatchEvent('change');
  await expect(editor.getByRole('alert')).toHaveCount(0);
  expect((await page.evaluate(()=>(window as any).richSaved)).sub_control_groups[0].name).toBe('Climate');
  expect(await page.evaluate(()=>(window as any).richEditorInput.sub_controls[0].future_sub)).toEqual({keep:true});
  expect(await page.evaluate(()=>(window as any).richCalls)).toEqual([]);
});
