import{test,expect}from'@playwright/test';
import{kitchenFixture}from'../fixtures/kitchen';
test.beforeEach(async({page})=>{
  await page.goto('/demo/index.html');await page.waitForFunction(()=>customElements.get('navet-entity-card'));
  await page.evaluate(fixture=>{
    const w=window as any;w.templateCalls=[];w.templateStops=[];w.templateEffects=[];w.templateListeners=new Map();w.templateConnectionEvents=new Map();
    const connection={connected:true,subscribeMessage:async(callback:any,message:any)=>{const index=w.templateCalls.length;w.templateCalls.push(structuredClone(message));w.templateListeners.set(index,callback);return()=>{w.templateStops.push(index);w.templateListeners.delete(index);};},addEventListener:(type:string,callback:any)=>{if(!w.templateConnectionEvents.has(type))w.templateConnectionEvents.set(type,new Set());w.templateConnectionEvents.get(type).add(callback);},removeEventListener:(type:string,callback:any)=>w.templateConnectionEvents.get(type)?.delete(callback)};
    w.templateHost={...fixture,connection,async callService(...args:unknown[]){w.templateEffects.push(args);}};
    w.templateMount=(templates:any,preview=false)=>{const card=document.createElement('navet-entity-card')as any;card.id=`template-card-${document.querySelectorAll('[id^="template-card-"]').length}`;card.preview=preview;card.setConfig({type:'custom:navet-entity-card',entity:'sensor.kitchen_temperature',name:'Fallback name',display_templates:templates});card.hass=w.templateHost;document.querySelector('main')!.prepend(card);return card;};
  },kitchenFixture);
});
test('shared display streams render escaped text, recover per field and release on disconnect',async({page})=>{
  await page.evaluate(()=>{const w=window as any;w.templateCard=w.templateMount({name:{template:'{{ label }}',variables:{label:'Name'}},state:{template:'{{ label }}',variables:{label:'Name'}}});w.templateCopy=w.templateMount({name:{template:'{{ label }}',variables:{label:'Name'}}});});
  await expect.poll(()=>page.evaluate(()=>(window as any).templateCalls.length)).toBe(1);
  await page.evaluate(()=>{(window as any).templateListeners.get(0)({result:'<script>unsafe</script>'});});
  const card=page.locator('#template-card-0');await expect(card).toContainText('<script>unsafe</script>');await expect(card.locator('script')).toHaveCount(0);
  await page.evaluate(()=>{(window as any).templateListeners.get(0)({error:'Template syntax failure',level:'ERROR'});});
  await expect(card).toContainText('Fallback name');await expect(card).toContainText('Template syntax failure');
  await page.evaluate(()=>{(window as any).templateListeners.get(0)({result:'Recovered name'});});await expect(card).toContainText('Recovered name');await expect(card).not.toContainText('Template syntax failure');
  await page.evaluate(()=>{const w=window as any;w.templateCard.remove();});expect(await page.evaluate(()=>(window as any).templateStops.length)).toBe(0);
  await page.evaluate(()=>{const w=window as any;w.templateCopy.remove();});await expect.poll(()=>page.evaluate(()=>(window as any).templateStops.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).templateEffects)).toEqual([]);
});
test('visibility false remains subscribed and recovers; preview never subscribes or changes entity commands',async({page})=>{
  await page.evaluate(()=>{const w=window as any;w.templateCard=w.templateMount({visible:{template:'{{ visible }}'}});});await expect.poll(()=>page.evaluate(()=>(window as any).templateCalls.length)).toBe(1);
  await page.evaluate(()=>{(window as any).templateListeners.get(0)({result:false});});await expect(page.locator('#template-card-0')).not.toBeVisible();expect(await page.evaluate(()=>(window as any).templateStops)).toEqual([]);
  await page.evaluate(()=>{(window as any).templateListeners.get(0)({result:true});});await expect(page.locator('#template-card-0')).toBeVisible();
  await page.evaluate(()=>{const w=window as any;w.templateCard.remove();w.templateMount({name:{template:'{{ name }}'}},true);});await expect(page.locator('#template-card-0')).toContainText('Fallback name');expect(await page.evaluate(()=>(window as any).templateCalls.length)).toBe(1);expect(await page.evaluate(()=>(window as any).templateEffects)).toEqual([]);
});
test('visual template editor preserves invalid variable drafts, opaque fields and common edits on phone',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(async()=>{await(customElements.get('navet-entity-card')as any).getConfigElement();const editor=document.createElement('navet-templates-editor')as any;editor.id='templates-editor';editor.hass=(window as any).templateHost;editor.config={type:'custom:navet-entity-card',entity:'sensor.kitchen_temperature',future:{preserved:true},display_templates:{name:{template:'{{ label }}',variables:{label:'Kitchen'},future:{nested:true}}}};editor.addEventListener('templates-config-changed',(event:any)=>{(window as any).templateSaved=event.detail.config;editor.config=event.detail.config;});document.querySelector('main')!.prepend(editor);});
  const editor=page.locator('#templates-editor');await editor.getByLabel('Name template',{exact:true}).fill('{{ label | upper }}');await expect.poll(()=>page.evaluate(()=>(window as any).templateSaved?.display_templates.name.template)).toBe('{{ label | upper }}');
  await editor.getByLabel('Name variables (JSON)',{exact:true}).fill('{broken');await expect(editor.getByRole('alert')).toBeVisible();
  await page.evaluate(()=>{const e=document.querySelector('#templates-editor')as any;e.config={...(window as any).templateSaved,name:'Common edit'};});await expect(editor.getByLabel('Name variables (JSON)',{exact:true})).toHaveValue('{broken');
  await editor.getByLabel('Name variables (JSON)',{exact:true}).fill('{"label":"Updated"}');await expect(editor.getByRole('alert')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).templateSaved)).toMatchObject({name:'Common edit',future:{preserved:true},display_templates:{name:{template:'{{ label | upper }}',variables:{label:'Updated'},future:{nested:true}}}});
  await editor.getByLabel('Visibility template enabled',{exact:true}).check();await expect(editor.getByLabel('Visibility template',{exact:true})).toHaveValue('{{ true }}');
  expect(await editor.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);await editor.screenshot({path:info.outputPath('templates-editor-phone.png')});expect(await page.evaluate(()=>(window as any).templateEffects)).toEqual([]);
});


test('a changed template picture recovers from a failed photo without changing its saved image',async({page})=>{
  await page.route('**/template-photo-failed.svg',route=>route.fulfill({status:404,body:''}));
  await page.route('**/template-photo-valid.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="orange"/></svg>'}));
  await page.evaluate(()=>{const w=window as any;const card=document.createElement('navet-photo-card')as any;card.id='template-photo';card.setConfig({type:'custom:navet-photo-card',image:'/local/original.jpg',display_templates:{picture:{template:'{{ picture }}'}}});card.hass=w.templateHost;document.querySelector('main')!.prepend(card);});
  await expect.poll(()=>page.evaluate(()=>(window as any).templateCalls.length)).toBe(1);
  const failed=page.waitForResponse(response=>response.url().endsWith('/template-photo-failed.svg'));
  await page.evaluate(()=>{(window as any).templateListeners.get(0)({result:'/template-photo-failed.svg'});});
  expect((await failed).status()).toBe(404);
  await expect(page.locator('#template-photo img')).toHaveCount(0);
  await page.evaluate(()=>{(window as any).templateListeners.get(0)({result:'/template-photo-valid.svg'});});
  await expect(page.locator('#template-photo img')).toHaveAttribute('src','/template-photo-valid.svg');
  await expect.poll(()=>page.locator('#template-photo img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(32);
  expect(await page.evaluate(()=>(document.querySelector('#template-photo')as any).config.image)).toBe('/local/original.jpg');
});
