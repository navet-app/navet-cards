import {test,expect} from '@playwright/test';
import {kitchenFixture} from '../fixtures/kitchen';

test.beforeEach(async({page})=>{
  await page.goto('/demo/index.html');
  await page.waitForFunction(()=>customElements.get('navet-sub-controls-card')&&customElements.get('navet-sub-controls-editor'));
  await page.evaluate(fixture=>{
    const w=window as any;w.independentCalls=[];w.independentDetails=[];
    w.independentHass={...fixture,async callService(...args:unknown[]){w.independentCalls.push(args);}};
    document.addEventListener('hass-more-info',(event:any)=>w.independentDetails.push(event.detail.entityId));
    w.mountIndependent=(config:unknown,preview=false)=>{
      const card=document.createElement('navet-sub-controls-card') as any;card.id='independent';card.preview=preview;
      card.setConfig({type:'custom:navet-sub-controls-card',sub_controls:[],...(config as object)});card.hass=w.independentHass;document.querySelector('main')!.append(card);w.independentCard=card;return card;
    };
  },kitchenFixture);
});

test('registered standalone sub-controls reuse grouped controls with current entity ownership',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>(window as any).customCards.find((entry:any)=>entry.type==='navet-sub-controls-card').getEntitySuggestion((window as any).independentHass,'switch.kitchen_coffee').config)).toEqual({type:'custom:navet-sub-controls-card',sub_controls:[{entity:'switch.kitchen_coffee'}]});
  await page.evaluate(()=>{(window as any).mountIndependent({name:'Kitchen controls',sub_control_groups:[{id:'comfort',name:'Comfort',collapsed:true}],sub_controls:[
    {entity:'switch.kitchen_coffee',name:'Coffee',control:'toggle'},
    {entity:'light.kitchen_ceiling',name:'Ceiling',control:'slider',group:'comfort'},
    {entity:'sensor.kitchen_temperature',name:'Temperature',control:'state',read_only:true},
  ]});});
  const card=page.locator('#independent'),widget=card.locator('navet-sub-controls');
  await expect(widget).toHaveCount(1);
  await expect(widget.getByRole('slider')).toHaveCount(0);
  await widget.getByRole('button',{name:'On',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).independentCalls[0])).toEqual(['switch','turn_on',{}, {entity_id:'switch.kitchen_coffee'}]);
  await widget.getByRole('button',{name:'Comfort',exact:true}).click();
  await widget.getByRole('slider',{name:'Ceiling Brightness',exact:true}).fill('35');
  expect(await page.evaluate(()=>(window as any).independentCalls[1])).toEqual(['light','turn_on',{brightness_pct:35},{entity_id:'light.kitchen_ceiling'}]);
  await widget.getByRole('button',{name:'Coffee',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).independentDetails)).toEqual(['switch.kitchen_coffee']);
  await expect(widget.getByRole('button',{name:'Temperature',exact:true})).toBeDisabled();
  expect(await card.evaluate((element:any)=>element.getGridOptions().rows)).toBe('auto');
  expect(await card.evaluate(element=>{const surface=element.shadowRoot!.querySelector('.card')!;return surface.scrollWidth<=surface.clientWidth+1;})).toBe(true);
  await card.screenshot({path:info.outputPath('standalone-sub-controls-phone.png')});
});

test('standalone preview disables member effects and saved conditions update without root entity',async({page})=>{
  await page.evaluate(()=>{(window as any).mountIndependent({sub_controls:[{entity:'switch.kitchen_coffee',name:'Coffee',control:'toggle',visible_when:{entity:'binary_sensor.kitchen_window',state:'off'}}]},true);});
  const widget=page.locator('#independent navet-sub-controls');
  await expect(widget.getByRole('button',{name:'On',exact:true})).toBeDisabled();
  await widget.getByRole('button',{name:'On',exact:true}).dispatchEvent('click');
  await widget.getByRole('button',{name:'Coffee',exact:true}).dispatchEvent('click');
  expect(await page.evaluate(()=>(window as any).independentCalls)).toEqual([]);
  expect(await page.evaluate(()=>(window as any).independentDetails)).toEqual([]);
  await page.evaluate(()=>{const w=window as any;w.independentCard.preview=false;w.independentCard.hass={...w.independentHass,states:{...w.independentHass.states,'binary_sensor.kitchen_window':{...w.independentHass.states['binary_sensor.kitchen_window'],state:'on'}}};});
  await expect(widget.getByRole('button')).toHaveCount(0);
});

test('standalone visual authoring starts empty, emits one editor and preserves advanced fields',async({page})=>{
  await page.evaluate(()=>{
    const w=window as any;const editor=document.createElement('navet-card-editor') as any;editor.id='independent-editor';editor.hass=w.independentHass;
    editor.setConfig({type:'custom:navet-sub-controls-card',sub_controls:[],future:{keep:true}});
    editor.addEventListener('config-changed',(event:any)=>w.independentSaved=structuredClone(event.detail.config));document.querySelector('main')!.append(editor);
  });
  const editor=page.locator('#independent-editor'),list=editor.locator('navet-sub-controls-editor');
  await expect(list).toHaveCount(1);
  const summary=editor.locator('summary').filter({hasText:/^Sub-controls$/});
  if(await summary.count())await summary.click();
  await list.getByRole('button',{name:'Add sub-control',exact:true}).click();
  await list.getByLabel('Entity',{exact:true}).selectOption('switch.kitchen_coffee');
  await list.getByLabel('Control',{exact:true}).selectOption('toggle');
  await list.getByLabel('Name',{exact:true}).fill('Coffee');await list.getByLabel('Name',{exact:true}).dispatchEvent('change');
  const saved=await page.evaluate(()=>(window as any).independentSaved);
  expect(saved).toMatchObject({type:'custom:navet-sub-controls-card',sub_controls:[{entity:'switch.kitchen_coffee',control:'toggle',name:'Coffee'}],future:{keep:true}});
  expect(saved.entity).toBeUndefined();
  await page.evaluate(()=>{const w=window as any;w.mountIndependent(w.independentSaved);});
  await expect(page.locator('#independent navet-sub-controls').getByRole('button',{name:'On',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).independentCalls)).toEqual([]);
});
