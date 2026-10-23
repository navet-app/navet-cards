import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => (window as any).cards?.length === 7);
  await page.evaluate(() => {
    const w = window as any;
    const climate = (id: string, supported_features = 8|16|32|512) => ({entity_id:id,state:'heat',attributes:{friendly_name:'Dining climate',supported_features,preset_modes:['eco','comfort'],preset_mode:'eco',fan_modes:['low','high'],fan_mode:'low',swing_modes:['off','vertical'],swing_mode:'off',swing_horizontal_modes:['off','on'],swing_horizontal_mode:'off'}});
    const vacuum = (id: string, supported_features = 32) => ({entity_id:id,state:'docked',attributes:{friendly_name:'Dining vacuum',supported_features,fan_speed_list:['Quiet','Turbo'],fan_speed:'Quiet'}});
    w.deviceCalls=[];
    w.deviceHost={language:'en',states:{'climate.dining':climate('climate.dining'),'vacuum.dining':vacuum('vacuum.dining'),'climate.unsupported':climate('climate.unsupported',0),'vacuum.unsupported':vacuum('vacuum.unsupported',0)},
      async callService(domain: string,service: string,data: Record<string,unknown>,target:{entity_id:string}) {
        w.deviceCalls.push({domain,service,data,target});
        const old=w.deviceHost.states[target.entity_id];
        w.deviceHost={...w.deviceHost,states:{...w.deviceHost.states,[target.entity_id]:{...old,attributes:{...old.attributes,...data}}}};
        w.deviceSync();
      },
    };
    const configs=[{type:'custom:navet-climate-card',entity:'climate.dining'},{type:'custom:navet-vacuum-card',entity:'vacuum.dining'},{type:'custom:navet-room-card',entities:['climate.dining','vacuum.dining'],name:'Dining devices'},{type:'custom:navet-climate-card',entity:'climate.unsupported'},{type:'custom:navet-vacuum-card',entity:'vacuum.unsupported'}];
    const main=document.querySelector('main')!;main.replaceChildren();main.setAttribute('style','max-width:400px;display:grid;gap:16px;padding:16px');
    w.deviceCards=configs.map((config,i)=>{const el=document.createElement(config.type.replace('custom:','')) as any;el.id=`device-${i}`;el.setConfig(config);el.hass=w.deviceHost;main.append(el);return el;});
    w.deviceSync=()=>w.deviceCards.forEach((el:any)=>{el.hass=w.deviceHost;});
  });
});

test('climate and cleaning option modals submit advertised selections to the owning domain', async ({ page }) => {
  const climate=page.locator('#device-0');
  await expect(page.locator('#device-3').getByRole('button',{name:'Climate options',exact:true})).toHaveCount(0);
  await expect(page.locator('#device-4').getByRole('button',{name:'Cleaning options',exact:true})).toHaveCount(0);
  await climate.getByRole('button',{name:'Climate options',exact:true}).click();
  const preset=climate.getByRole('combobox',{name:'Preset mode',exact:true});
  // Tab commits typeahead without opening the native select popup on Linux.
  await expect(preset).toBeEnabled();await preset.focus();await page.keyboard.press('c');await page.keyboard.press('Tab');
  await expect(preset).toHaveValue('comfort');
  await climate.getByRole('combobox',{name:'Fan mode',exact:true}).selectOption('high');
  await climate.getByRole('combobox',{name:'Swing mode',exact:true}).selectOption('vertical');
  await climate.getByRole('combobox',{name:'Horizontal swing',exact:true}).selectOption('on');
  await page.keyboard.press('Escape');
  await expect(climate.getByRole('dialog')).toHaveCount(0);
  await expect(climate.getByRole('button',{name:'Climate options',exact:true})).toBeFocused();
  const vacuum=page.locator('#device-1');
  await vacuum.getByRole('button',{name:'Cleaning options',exact:true}).click();
  await vacuum.getByRole('combobox',{name:'Fan speed',exact:true}).selectOption('Turbo');
  expect(await page.evaluate(()=>(window as any).deviceCalls)).toEqual([
    {domain:'climate',service:'set_preset_mode',data:{preset_mode:'comfort'},target:{entity_id:'climate.dining'}},
    {domain:'climate',service:'set_fan_mode',data:{fan_mode:'high'},target:{entity_id:'climate.dining'}},
    {domain:'climate',service:'set_swing_mode',data:{swing_mode:'vertical'},target:{entity_id:'climate.dining'}},
    {domain:'climate',service:'set_swing_horizontal_mode',data:{swing_horizontal_mode:'on'},target:{entity_id:'climate.dining'}},
    {domain:'vacuum',service:'set_fan_speed',data:{fan_speed:'Turbo'},target:{entity_id:'vacuum.dining'}},
  ]);
});

test('room device options keep ownership and fit a phone dialog', async ({ page }, info) => {
  await page.setViewportSize({width:390,height:844});
  const room=page.locator('#device-2');await room.getByRole('button',{name:'Controls',exact:true}).click();
  const climate=room.locator('.room-control').filter({has:page.getByRole('button',{name:/Dining climate/})});
  const vacuum=room.locator('.room-control').filter({has:page.getByRole('button',{name:/Dining vacuum/})});
  await climate.getByRole('combobox',{name:'Preset mode',exact:true}).selectOption('comfort');
  await vacuum.getByRole('combobox',{name:'Fan speed',exact:true}).selectOption('Turbo');
  expect(await page.evaluate(()=>(window as any).deviceCalls)).toEqual([
    {domain:'climate',service:'set_preset_mode',data:{preset_mode:'comfort'},target:{entity_id:'climate.dining'}},
    {domain:'vacuum',service:'set_fan_speed',data:{fan_speed:'Turbo'},target:{entity_id:'vacuum.dining'}},
  ]);
  expect(await room.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await info.attach('phone-device-options.png',{body:await room.getByRole('dialog').screenshot(),contentType:'image/png'});
  await page.keyboard.press('Escape');
  await expect(room.locator('navet-climate-options')).toHaveCount(0);
  await expect(room.locator('navet-vacuum-options')).toHaveCount(0);
});

test('unknown options stay unselected and previews or unavailable devices cannot send changes', async ({ page }) => {
  await page.evaluate(()=>{
    const w=window as any,climate=w.deviceHost.states['climate.dining'],vacuum=w.deviceHost.states['vacuum.dining'];
    w.deviceHost={...w.deviceHost,states:{...w.deviceHost.states,'climate.dining':{...climate,attributes:{...climate.attributes,preset_mode:undefined,fan_mode:undefined,swing_mode:undefined,swing_horizontal_mode:undefined}},'vacuum.dining':{...vacuum,attributes:{...vacuum.attributes,fan_speed:undefined}}}};w.deviceSync();
  });
  const climate=page.locator('#device-0');await climate.getByRole('button',{name:'Climate options',exact:true}).click();
  for(const name of ['Preset mode','Fan mode','Swing mode','Horizontal swing'])await expect(climate.getByRole('combobox',{name,exact:true})).toHaveValue('');
  await page.evaluate(()=>{(window as any).deviceCards[0].preview=true;});
  for(const name of ['Preset mode','Fan mode','Swing mode','Horizontal swing'])await expect(climate.getByRole('combobox',{name,exact:true})).toBeDisabled();
  await climate.getByRole('combobox',{name:'Fan mode',exact:true}).evaluate((el:HTMLSelectElement)=>{el.value='high';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.keyboard.press('Escape');
  const vacuum=page.locator('#device-1');await vacuum.getByRole('button',{name:'Cleaning options',exact:true}).click();
  await expect(vacuum.getByRole('combobox',{name:'Fan speed',exact:true})).toHaveValue('');
  await page.evaluate(()=>{const w=window as any,old=w.deviceHost.states['vacuum.dining'];w.deviceHost={...w.deviceHost,states:{...w.deviceHost.states,'vacuum.dining':{...old,state:'unavailable'}}};w.deviceSync();});
  await expect(vacuum.getByRole('combobox',{name:'Fan speed',exact:true})).toBeDisabled();
  await vacuum.getByRole('combobox',{name:'Fan speed',exact:true}).evaluate((el:HTMLSelectElement)=>{el.value='Turbo';el.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(await page.evaluate(()=>(window as any).deviceCalls)).toEqual([]);
});

test('mixed capability climate and vacuum actions remain reachable in narrow fixed footprints', async ({ page }, info) => {
  test.setTimeout(40000);
  await page.setViewportSize({width:1000,height:1000});
  await page.evaluate(()=>{
    const w=window as any,states={...w.deviceHost.states};
    const climate=states['climate.dining'];
    states['climate.dining']={...climate,attributes:{...climate.attributes,supported_features:8|16|32|512|1|2,temperature:22,target_temp_low:18,target_temp_high:24,current_temperature:21,min_temp:7,max_temp:30,target_temp_step:0.5,hvac_modes:['off','heat','heat_cool']}};
    const vacuum=states['vacuum.dining'];
    states['vacuum.dining']={...vacuum,state:'cleaning',attributes:{...vacuum.attributes,supported_features:32|8192|4|8|16,battery_level:72}};
    w.deviceHost={...w.deviceHost,states};w.deviceSync();
    for(const card of w.deviceCards.slice(2))card.remove();
  });
  const failures: unknown[]=[];
  for(const layout of ['compact','comfortable'] as const)for(const width of [144,178,320]){
    const height=layout==='comfortable'?248:176;
    await page.evaluate(async ({layout,width,height})=>{
      const w=window as any;
      for(const [i,entity] of ['climate.dining','vacuum.dining'].entries()){
        const card=w.deviceCards[i];card.setConfig({type:`custom:navet-${i?'vacuum':'climate'}-card`,entity,layout});
        card.style.width=`${width}px`;card.style.height=`${height}px`;await card.updateComplete;
      }
    },{layout,width,height});
    for(const [index,kind] of ['climate','vacuum'].entries()){
      const card=page.locator(`#device-${index}`);
      const clipped=await card.evaluate(el=>{
        const surface=el.shadowRoot!.querySelector('.card')!.getBoundingClientRect();
        return [...el.shadowRoot!.querySelectorAll('.actions button')].flatMap(button=>{
          const rect=button.getBoundingClientRect();
          return rect.left<surface.left||rect.right>surface.right||rect.top<surface.top||rect.bottom>surface.bottom? [{label:button.getAttribute('aria-label'),x:rect.x-surface.x,y:rect.y-surface.y,width:rect.width,height:rect.height,surfaceWidth:surface.width,surfaceHeight:surface.height}]:[];
        });
      });
      if(layout==='compact'&&width===144)await info.attach(`${kind}-compact-144.png`,{body:await card.screenshot(),contentType:'image/png'});
      if(clipped.length){
        failures.push({kind,layout,width,height,clipped});
        await info.attach(`${kind}-${layout}-${width}-clipped.png`,{body:await card.screenshot(),contentType:'image/png'});
        continue;
      }
      for(const button of await card.locator('.actions button').all()){
        try{await button.click({trial:true,timeout:800});}catch(error){failures.push({kind,layout,width,height,label:await button.getAttribute('aria-label'),reason:String(error)});}
      }
    }
  }
  const climate=page.locator('#device-0');
  await climate.getByRole('button',{name:'Temperature range',exact:true}).click();
  const climateDialog=climate.getByRole('dialog');
  await expect(climateDialog.getByRole('slider',{name:'Target temperature',exact:true})).toBeVisible();
  await expect(climateDialog.getByRole('spinbutton',{name:'Low target',exact:true})).toBeVisible();
  for(const name of ['Preset mode','Fan mode','Swing mode','Horizontal swing','Heating mode'])await expect(climateDialog.getByRole('combobox',{name,exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  const vacuum=page.locator('#device-1');
  await vacuum.getByRole('button',{name:'Cleaning options',exact:true}).click();
  const vacuumDialog=vacuum.getByRole('dialog');
  await expect(vacuumDialog.getByRole('combobox',{name:'Fan speed',exact:true})).toBeVisible();
  await vacuumDialog.getByRole('button',{name:'Return to dock',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).deviceCalls)).toEqual([{domain:'vacuum',service:'return_to_base',data:{},target:{entity_id:'vacuum.dining'}}]);
  await info.attach('mixed-device-layout.json',{body:JSON.stringify({widths:[144,178,320],heights:{compact:176,comfortable:248},failures},null,2),contentType:'application/json'});
  expect(failures).toEqual([]);
});
