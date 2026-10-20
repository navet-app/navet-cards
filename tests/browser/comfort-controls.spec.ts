import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.goto('/demo/index.html');await page.waitForFunction(()=>customElements.get('navet-water-heater-card'));
 await page.evaluate(()=>{
  const w=window as any;w.comfortCalls=[];
  w.comfortHost={config:{unit_system:{temperature:'°C'}},states:{
   'humidifier.study':{entity_id:'humidifier.study',state:'on',attributes:{friendly_name:'Study humidifier',supported_features:1,humidity:45,current_humidity:39,min_humidity:30,max_humidity:80,available_modes:['normal','eco'],mode:'normal'}},
   'water_heater.home':{entity_id:'water_heater.home',state:'eco',attributes:{friendly_name:'Hot water',supported_features:15,temperature:52,current_temperature:49,min_temp:40,max_temp:70,operation_list:['off','eco','electric'],away_mode:'off'}},
  },async callService(...args:unknown[]){w.comfortCalls.push(args);}};
  w.comfortCards=[];w.mountComfort=(kind:string,config:unknown={})=>{const card=document.createElement(`navet-${kind}-card`) as any;card.id=`comfort-${w.comfortCards.length}`;card.setConfig({type:`custom:navet-${kind}-card`,...(config as object)});card.hass=w.comfortHost;document.querySelector('main')!.append(card);w.comfortCards.push(card);return card;};
  w.comfortSync=()=>w.comfortCards.forEach((card:any)=>card.hass=w.comfortHost);
  w.mountComfort('humidifier',{entity:'humidifier.study'});w.mountComfort('water-heater',{entity:'water_heater.home'});
 });
});
test('standalone comfort dialogs dispatch humidity, heater options and advertised power to exact owners',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 const humidity=page.locator('#comfort-0');await humidity.getByRole('button',{name:'Controls',exact:true}).click();
 await humidity.getByRole('slider',{name:'Target humidity',exact:true}).fill('50');
 await humidity.getByRole('combobox',{name:'Humidity mode',exact:true}).selectOption('eco');
 await page.keyboard.press('Escape');
 const water=page.locator('#comfort-1');await water.getByRole('button',{name:'Controls',exact:true}).click();
 await water.getByRole('slider',{name:'Target temperature',exact:true}).fill('55');
 await water.getByRole('combobox',{name:'Operation mode',exact:true}).selectOption('electric');
 await water.getByRole('combobox',{name:'Away mode',exact:true}).selectOption('true');
 expect(await page.evaluate(()=>(window as any).comfortCalls)).toEqual([
  ['humidifier','set_humidity',{humidity:50},{entity_id:'humidifier.study'}],['humidifier','set_mode',{mode:'eco'},{entity_id:'humidifier.study'}],
  ['water_heater','set_temperature',{temperature:55},{entity_id:'water_heater.home'}],['water_heater','set_operation_mode',{operation_mode:'electric'},{entity_id:'water_heater.home'}],['water_heater','set_away_mode',{away_mode:true},{entity_id:'water_heater.home'}],
 ]);
 expect(await water.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await water.getByRole('dialog').screenshot({path:info.outputPath('comfort-water-phone.png')});
 await page.keyboard.press('Escape');await water.getByRole('button',{name:'Off',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).comfortCalls.at(-1))).toEqual(['water_heater','turn_off',{}, {entity_id:'water_heater.home'}]);
});
test('comfort unknown targets remain placeholders and previews cannot dispatch forged changes',async({page})=>{
 await page.evaluate(()=>{const w=window as any;for(const id of ['humidifier.study','water_heater.home']){const raw=w.comfortHost.states[id];w.comfortHost.states[id]={...raw,attributes:{...raw.attributes,humidity:undefined,temperature:undefined,mode:'future',away_mode:undefined}};}w.comfortHost={...w.comfortHost};w.comfortSync();});
 const humidity=page.locator('#comfort-0');await humidity.getByRole('button',{name:'Controls',exact:true}).click();
 await expect(humidity.getByRole('slider')).toHaveCount(0);await expect(humidity.locator('navet-comfort-controls')).toContainText('Target humidity · current unknown');
 await expect(humidity.getByRole('combobox',{name:'Humidity mode',exact:true})).toHaveValue('');
 await page.evaluate(()=>{(window as any).comfortCards[0].preview=true;});
 await expect(humidity.getByRole('combobox')).toBeDisabled();
 await humidity.getByRole('combobox').evaluate((el:HTMLSelectElement)=>{el.value='eco';el.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(await page.evaluate(()=>(window as any).comfortCalls)).toEqual([]);
});
test('comfort room controls and standalone sub-controls preserve device ownership',async({page})=>{
 await page.evaluate(()=>{const w=window as any;w.mountComfort('room',{name:'Comfort room',entities:['humidifier.study','water_heater.home']});w.mountComfort('sub-controls',{sub_controls:[{entity:'humidifier.study',name:'Humidity',control:'slider'},{entity:'water_heater.home',name:'Water',control:'select'}]});});
 const room=page.locator('#comfort-2');await room.getByRole('button',{name:'Controls',exact:true}).click();
 await room.getByRole('slider',{name:'Target humidity',exact:true}).fill('60');
 await room.getByRole('combobox',{name:'Operation mode',exact:true}).selectOption('electric');
 await page.keyboard.press('Escape');
 const sub=page.locator('#comfort-3 navet-sub-controls');
 await sub.getByRole('slider',{name:'Humidity Humidity',exact:true}).fill('55');
 await sub.getByRole('combobox',{name:'Water Away mode',exact:true}).selectOption('on');
 expect(await page.evaluate(()=>(window as any).comfortCalls)).toEqual([
  ['humidifier','set_humidity',{humidity:60},{entity_id:'humidifier.study'}],['water_heater','set_operation_mode',{operation_mode:'electric'},{entity_id:'water_heater.home'}],
  ['humidifier','set_humidity',{humidity:55},{entity_id:'humidifier.study'}],['water_heater','set_away_mode',{away_mode:true},{entity_id:'water_heater.home'}],
 ]);
});
