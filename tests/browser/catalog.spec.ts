import { test, expect } from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/demo/index.html');await expect(page.locator('#catalog > *')).toHaveCount(27);});
test('new entity controls use native services and unavailable entities disable actions',async({page})=>{
  const fan=page.locator('navet-fan-card');await fan.getByRole('slider',{name:'Speed'}).fill('60');
  await page.locator('navet-lock-card').getByRole('slider',{name:'Slide to unlock'}).fill('100');
  await expect(page.locator('navet-vacuum-card').getByRole('button',{name:'Stop',exact:true})).toHaveCount(0);
  await page.locator('navet-vacuum-card').getByRole('button',{name:'Start cleaning'}).click();
  await expect(page.locator('navet-vacuum-card').getByRole('button',{name:'Stop',exact:true})).toBeVisible();await expect(page.locator('navet-vacuum-card').getByRole('button',{name:'Pause',exact:true})).toHaveCount(0);
  await page.locator('navet-vacuum-card').getByRole('button',{name:'Return to dock'}).click();
  await page.locator('navet-scene-card').getByRole('button',{name:'Run action'}).click();
  await page.locator('navet-script-card').getByRole('button',{name:'Good night',exact:true}).click();
  await page.locator('navet-button-card').getByRole('button',{name:'Evening routine',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).calls.map((c:any)=>[c.domain,c.service]))).toEqual([['fan','set_percentage'],['lock','unlock'],['vacuum','start'],['vacuum','return_to_base'],['scene','turn_on'],['script','turn_on'],['scene','turn_on']]);
  await page.evaluate(()=>{const w=window as any;w.demoHass={...w.demoHass,states:{...w.demoHass.states,'fan.office':{...w.demoHass.states['fan.office'],state:'unavailable'},'lock.front':{...w.demoHass.states['lock.front'],state:'unavailable'}}};w.syncCards();});
  await expect(fan).toContainText('Unavailable');await expect(fan.getByRole('slider')).toHaveCount(0);await expect(fan.getByRole('button',{name:'On',exact:true})).toBeDisabled();await expect(page.locator('navet-lock-card').getByRole('slider')).toBeDisabled();
});
test('composite readings update when members change and preserve unavailable states',async({page})=>{
  const info=page.locator('navet-info-card');await expect(info).toContainText('420 W');
  await page.evaluate(()=>{const w=window as any;w.demoHass={...w.demoHass,states:{...w.demoHass.states,'sensor.power':{...w.demoHass.states['sensor.power'],state:'610'},'sensor.battery':{...w.demoHass.states['sensor.battery'],state:'unavailable'}}};w.syncCards();});
  await expect(info).toContainText('610 W');await expect(page.locator('navet-energy-now-card')).toContainText('610');await expect(page.locator('navet-battery-card')).toContainText('Unavailable');
  await info.getByRole('button',{name:/Current load/}).click();await expect(page.locator('#events')).toHaveText('More info · sensor.power');
  await page.locator('navet-media-stack-card').getByRole('button',{name:'Pause',exact:true}).click();await expect(page.locator('navet-media-stack-card').getByRole('button',{name:'Play',exact:true})).toBeVisible();
});
test('note edits persist to a text helper and password helpers stay private',async({page})=>{
  const note=page.locator('navet-note-card');await note.getByRole('button',{name:'Note',exact:true}).click();await note.getByRole('textbox',{name:'Note'}).fill('Buy coffee');await note.getByRole('button',{name:'Save note'}).click();
  expect(await page.evaluate(()=>(window as any).calls.at(-1))).toEqual({domain:'input_text',service:'set_value',data:{value:'Buy coffee'},target:{entity_id:'input_text.note'}});
  await expect(note.getByRole('dialog')).not.toBeVisible();await expect(note.getByRole('button',{name:'Note',exact:true})).toContainText('Buy coffee');await expect(note.getByRole('button',{name:'Note',exact:true})).toBeFocused();
  await page.evaluate(()=>{const w=window as any;w.demoHass={...w.demoHass,states:{...w.demoHass.states,'input_text.note':{...w.demoHass.states['input_text.note'],state:'hidden password',attributes:{mode:'password'}}}};w.syncCards();});
  await expect(note).not.toContainText('hidden password');await expect(note.getByRole('textbox')).toHaveCount(0);await expect(note).toContainText('private text');
});
test('photo failures show a fallback and configured content stays literal',async({page})=>{
  const photo=page.locator('navet-photo-card');await expect(photo.getByRole('img')).toBeVisible();await photo.getByRole('img').dispatchEvent('error');await expect(photo).toContainText('Image unavailable');
  await page.evaluate(()=>{const w=window as any;w.catalogCards.find((c:any)=>c.tagName==='NAVET-NOTE-CARD').setConfig({type:'custom:navet-note-card',content:'<img src=x onerror=alert(1)>',name:'Static note'});});
  await expect(page.locator('navet-note-card')).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('navet-note-card').locator('img')).toHaveCount(0);
});
test('custom editors preserve advanced YAML when content and entity lists change',async({page})=>{
  expect(await page.evaluate(()=>(window as any).customCards.length)).toBe(34);
  expect(await page.evaluate(()=>(window as any).customCards.find((c:any)=>c.type==='navet-info-card').getEntitySuggestion((window as any).demoHass,'sensor.power').config)).toEqual({type:'custom:navet-info-card',entities:['sensor.power']});
  await page.evaluate(()=>{const editor=document.querySelector('navet-card-editor') as any;editor.setConfig({type:'custom:navet-info-card',entities:['sensor.power'],extra:{kept:true},tap_action:{action:'perform-action',perform_action:'scene.turn_on',target:{entity_id:'scene.evening'}}});(window as any).edited=[];editor.addEventListener('config-changed',(e:any)=>(window as any).edited.push(e.detail.config));});
  await page.locator('#editor-panel').evaluate((e:HTMLDetailsElement)=>e.open=true);await page.locator('#editor navet-ordered-entities').getByLabel('Add entity',{exact:true}).selectOption('sensor.energy');
  expect(await page.evaluate(()=>(window as any).edited.at(-1))).toMatchObject({entities:['sensor.power','sensor.energy'],extra:{kept:true},tap_action:{target:{entity_id:'scene.evening'}}});
});
test('catalog fits desktop and phone themes and provides screenshots',async({page})=>{
  for(const width of [1280,390]){await page.setViewportSize({width,height:900});for(const theme of ['dark','light','black','glass']){
    await page.evaluate(theme=>{const w=window as any;w.catalogCards.forEach((card:any)=>card.setConfig({...card.config,appearance:{...card.config.appearance,theme}}));},theme);
    if(theme==='light')await page.getByRole('button',{name:'Light theme',exact:true}).click();
    const overflow=await page.locator('#catalog > *').evaluateAll(cards=>cards.filter(card=>{const surface=card.shadowRoot?.querySelector('.card');return surface && surface.scrollWidth>surface.clientWidth+1;}).map(card=>card.tagName));expect(overflow).toEqual([]);
    await page.locator('#catalog').screenshot({path:`test-results/catalog-${width}-${theme}.png`});
    if(theme==='light')await page.getByRole('button',{name:'Dark theme',exact:true}).click();
  }}
});
test('lock slide requires completion and supports keyboard with cancellation',async({page})=>{
  const lock=page.locator('navet-lock-card');const slider=lock.getByRole('slider',{name:'Slide to unlock'});
  await slider.fill('50');expect(await page.evaluate(()=>(window as any).calls)).toEqual([]);
  await slider.evaluate((input:HTMLInputElement)=>{input.value='85';input.dispatchEvent(new Event('pointercancel',{bubbles:true}));});await expect(slider).toHaveValue('0');
  await slider.focus();await slider.press('End');await expect(lock.getByRole('slider',{name:'Slide to lock'})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).calls.map((c:any)=>c.service))).toEqual(['unlock']);
});
test('every added family fits its default Sections height',async({page})=>{
  await page.locator('#catalog > *').evaluateAll(cards=>cards.forEach(card=>{const element=card as HTMLElement & {getGridOptions:()=>{rows:number|'auto',columns:number}};const grid=element.getGridOptions();element.style.height=grid.rows==='auto'?'auto':`${grid.rows*56+(grid.rows-1)*8}px`;element.style.width=grid.columns===3?'80px':grid.columns===6?'168px':'344px';}));
  const overflow=await page.locator('#catalog > *').evaluateAll(cards=>cards.filter(card=>{const surface=card.shadowRoot?.querySelector('.card');return surface && (surface.scrollWidth>surface.clientWidth+1 || surface.scrollHeight>surface.clientHeight+1);}).map(card=>card.tagName));expect(overflow).toEqual([]);
});


test('gallery includes all registered families and helper controls update simulated state',async({page})=>{
  const missing=await page.evaluate(()=>{const w=window as any;return w.customCards.filter((entry:any)=>!document.querySelector(entry.type)).map((entry:any)=>entry.type);});
  expect(missing).toEqual([]);
  const number=page.locator('#catalog navet-number-card');
  await number.getByRole('slider').press('ArrowRight');
  expect(await page.evaluate(()=>(window as any).demoHass.states['input_number.watering'].state)).toBe(16);
  const select=page.locator('#catalog navet-select-card');
  await select.getByRole('combobox').selectOption('Away');
  await expect(select.getByRole('combobox')).toHaveValue('Away');
  expect(await page.evaluate(()=>(window as any).demoHass.states['input_select.house'].state)).toBe('Away');
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'Extra-small switch',exact:true}).click();
  await page.screenshot({path:'test-results/full-catalog.png',fullPage:true});
  await page.evaluate(()=>{const comparison=document.createElement('div');comparison.id='readings-comparison';comparison.style.cssText='display:grid;grid-template-columns:344px 344px;gap:16px;padding:16px;background:#16191f;';for(const tag of ['navet-info-card','navet-battery-card']){const card=document.querySelector(tag) as HTMLElement;card.style.height='168px';comparison.append(card);}document.body.append(comparison);});
  await page.locator('#readings-comparison').screenshot({path:'test-results/readings-spacing.png'});
});

test('note draft survives failure, supports retry and Escape restores focus',async({page})=>{
  const note=page.locator('navet-note-card');await note.getByRole('button',{name:'Note',exact:true}).click();
  await note.getByRole('textbox').fill('Keep this edited draft');await page.evaluate(()=>document.querySelector<HTMLButtonElement>('#fail')!.click());
  await note.getByRole('button',{name:'Save note'}).click();await expect(note.getByRole('dialog')).toBeVisible();await expect(note.getByRole('textbox')).toHaveValue('Keep this edited draft');
  await note.getByRole('button',{name:'Save note'}).click();await expect(note.getByRole('dialog')).not.toBeVisible();await expect(note.getByRole('button',{name:'Note',exact:true})).toContainText('Keep this edited draft');
  await note.getByRole('button',{name:'Note',exact:true}).click();await note.getByRole('textbox').fill('Discard this unsaved edit');await page.keyboard.press('Escape');await expect(note.getByRole('button',{name:'Note',exact:true})).toBeFocused();await expect(note.getByRole('button',{name:'Note',exact:true})).not.toContainText('Discard');
});
test('whole-card actions, script icon and Person hold retain distinct configured actions',async({page})=>{
  await page.evaluate(()=>{const w=window as any;w.catalogCards.find((c:any)=>c.tagName==='NAVET-SCRIPT-CARD').setConfig({type:'custom:navet-script-card',entity:'script.goodnight',tap_action:{action:'more-info'}});w.catalogCards.find((c:any)=>c.tagName==='NAVET-PERSON-CARD').setConfig({type:'custom:navet-person-card',entity:'person.alex',hold_action:{action:'perform-action',perform_action:'scene.turn_on',target:{entity_id:'scene.evening'}}});});
  await page.locator('navet-script-card').getByRole('button',{name:'Run action',exact:true}).click();expect(await page.evaluate(()=>(window as any).calls.at(-1).target)).toEqual({entity_id:'script.goodnight'});
  const person=page.locator('navet-person-card').getByRole('button',{name:'Alex',exact:true});await person.dispatchEvent('pointerdown',{button:0,clientX:5,clientY:5});await page.waitForTimeout(550);await person.dispatchEvent('pointerup');await person.click();expect(await page.evaluate(()=>(window as any).calls.map((c:any)=>c.target.entity_id))).toEqual(['script.goodnight','scene.evening']);
});
test('photo navigation and media selection stay within configured sources',async({page})=>{
  await page.evaluate(()=>{const w=window as any;w.catalogCards.find((c:any)=>c.tagName==='NAVET-PHOTO-CARD').setConfig({type:'custom:navet-photo-card',images:['/demo/landscape.svg','/demo/landscape.svg?second'],alt:'Gallery'});w.demoHass={...w.demoHass,states:{...w.demoHass.states,'media_player.study':{entity_id:'media_player.study',state:'paused',attributes:{friendly_name:'Study speaker',media_title:'Jazz',supported_features:16389}}}};w.catalogCards.find((c:any)=>c.tagName==='NAVET-MEDIA-STACK-CARD').setConfig({type:'custom:navet-media-stack-card',entities:['media_player.kitchen','media_player.study']});w.syncCards();});
  const photo=page.locator('navet-photo-card');await photo.getByRole('button',{name:'Next photo'}).click();await expect(photo.getByRole('img')).toHaveAttribute('src','/demo/landscape.svg?second');await photo.getByRole('button',{name:'Previous photo'}).click();await expect(photo.getByRole('img')).toHaveAttribute('src','/demo/landscape.svg');await photo.getByRole('button',{name:'Shuffle photos'}).click();await expect(photo.getByRole('button',{name:'Shuffle photos'})).toHaveAttribute('aria-pressed','true');await photo.getByRole('button',{name:'Next photo'}).click();await expect(photo.getByRole('img')).toHaveAttribute('src','/demo/landscape.svg?second');
  const stack=page.locator('navet-media-stack-card');await stack.getByRole('combobox',{name:'Speaker',exact:true}).selectOption('media_player.study');await expect(stack).toContainText('Jazz');await stack.getByRole('button',{name:'Play',exact:true}).click();expect(await page.evaluate(()=>(window as any).calls.at(-1).target)).toEqual({entity_id:'media_player.study'});await stack.getByRole('button',{name:'Details',exact:true}).click();await expect(page.locator('#events')).toContainText('media_player.study');
});
test('forecast and power history show supplied data and ignore stale async responses',async({page})=>{
  await page.locator('navet-weather-card').scrollIntoViewIfNeeded();
  await expect(page.locator('navet-weather-card').locator('.forecast-row > div')).toHaveCount(7);
  await page.locator('navet-energy-now-card').scrollIntoViewIfNeeded();
  await expect(page.locator('navet-energy-now-card').getByRole('img',{name:'Power history'})).toBeVisible();
  await page.locator('navet-weather-card').scrollIntoViewIfNeeded();
  await page.evaluate(()=>{const w=window as any;w.weatherResolve=undefined;w.demoHass={...w.demoHass,callWS:()=>new Promise(resolve=>w.weatherResolve=resolve),states:{...w.demoHass.states,'weather.second':{entity_id:'weather.second',state:'cloudy',attributes:{friendly_name:'Second place',supported_features:1,temperature:9,temperature_unit:'°C'}}}};const card=w.catalogCards.find((c:any)=>c.tagName==='NAVET-WEATHER-CARD');card.hass=w.demoHass;card.setConfig({type:'custom:navet-weather-card',entity:'weather.second'});});
  await page.waitForFunction(()=>typeof (window as any).weatherResolve==='function');
  await page.evaluate(async()=>{const w=window as any;const staleResolve=w.weatherResolve;const card=w.catalogCards.find((c:any)=>c.tagName==='NAVET-WEATHER-CARD');card.setConfig({type:'custom:navet-weather-card',entity:'weather.home'});staleResolve({response:{'weather.second':{forecast:[{datetime:new Date().toISOString(),temperature:99}]}}});await Promise.resolve();await card.updateComplete;});
  await expect(page.locator('navet-weather-card')).not.toContainText('99');
});

test('Photo keeps configured whole-image actions while gallery controls remain separate',async({page})=>{
  await page.evaluate(()=>{const w=window as any;w.catalogCards.find((c:any)=>c.tagName==='NAVET-PHOTO-CARD').setConfig({type:'custom:navet-photo-card',name:'Gallery action',images:['/demo/landscape.svg','/demo/landscape.svg?next'],tap_action:{action:'perform-action',perform_action:'scene.turn_on',target:{entity_id:'scene.evening'}}});});
  const photo=page.locator('navet-photo-card');await photo.getByRole('button',{name:'Next photo'}).click();expect(await page.evaluate(()=>(window as any).calls)).toEqual([]);await photo.getByRole('button',{name:'Gallery action',exact:true}).click();expect(await page.evaluate(()=>(window as any).calls.at(-1).target)).toEqual({entity_id:'scene.evening'});
});

test('small lock keeps its circular symbol clear of the header and slide control',async({page})=>{
  const lock=page.locator('navet-lock-card');
  for(const width of [155,168,178]){
    await lock.evaluate((card:HTMLElement,width)=>{card.style.width=`${width}px`;card.style.height='168px';},width);
    const boxes=await lock.evaluate(card=>{
      const rect=(selector:string)=>{const box=card.shadowRoot!.querySelector(selector)!.getBoundingClientRect();return {width:box.width,height:box.height,top:box.top,bottom:box.bottom};};
      return {header:rect('.header'),symbol:rect('.lock-symbol'),slide:rect('.lock-confirm')};
    });
    expect(boxes.symbol.width).toBe(64);expect(boxes.symbol.height).toBe(64);
    expect(boxes.symbol.top).toBeGreaterThanOrEqual(boxes.header.bottom);
    expect(boxes.symbol.bottom).toBeLessThanOrEqual(boxes.slide.top);
    if(width===178){await lock.evaluate((card:HTMLElement)=>{card.style.height='176px';});const text=await lock.locator('.lock-confirm span').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getClientRects().length;});expect(text).toBe(1);}
    await lock.screenshot({path:`test-results/lock-small-${width}.png`});
  }
});
