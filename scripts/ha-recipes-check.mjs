import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,copyFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

// Explicit bounded verification: fresh contexts, disposable loopback host, no HA config writes.
const sessionPath=resolve(process.env.NAVET_HA_SESSION??'.ha-validation/2026.9.4/session.json');
assert.ok(sessionPath.startsWith(resolve('.ha-validation')+sep));
const stored=JSON.parse(await readFile(sessionPath,'utf8'));
const session={base:stored.base,version:stored.version,name:stored.name,username:stored.username,password:stored.password};
const redact=value=>[stored.username,stored.password,stored.access_token,stored.refresh_token].filter(item=>typeof item==='string'&&item).reduce((text,item)=>text.replaceAll(item,'[redacted]'),String(value));
const url=new URL(session.base);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.equal(session.version,'2026.9.4');assert.equal(url.port,'18124');assert.equal(session.name,'navet-cards-ha-2026-9-4');
const prefix='competition-recipes';
const root=resolve(sessionPath,'..','config','www',prefix),output=resolve(sessionPath,'..',`recipes-evidence-${prefix}`);
await mkdir(root,{recursive:true});await mkdir(output,{recursive:true});
await copyFile('dist/navet-cards.js',resolve(root,'navet-cards.js'));await cp('dist/modular',resolve(root,'navet-modular'),{recursive:true});
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const browser=await chromium.launch({channel:process.env.NAVET_BROWSER_CHANNEL??'chrome',headless:true});
const results=[];
try{
 for(const profile of ['standalone','modular']){
  const context=await browser.newContext({viewport:profile==='standalone'?{width:1280,height:900}:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(20000);
  let stage='login',serviceCalls=0;const errors=[];
  page.on('pageerror',()=>errors.push('page error'));
  page.on('websocket',socket=>socket.on('framesent',({payload})=>{try{if(JSON.parse(String(payload)).type==='call_service')serviceCalls++;}catch{}}));
  const entry=profile==='modular'?'navet-modular/navet-cards.js':'navet-cards.js';
  await page.route('**/local/navet-cards.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:`import ${JSON.stringify(`${session.base}/local/${prefix}/${entry}`)};`}));
  try{
   await page.goto(`${session.base}/navet-verification/masonry`);await page.locator('input[name="username"]').fill(session.username);await page.locator('input[name="password"]').fill(session.password);await page.getByRole('button',{name:/log in|sign in/i}).click();
   await page.waitForFunction(()=>!!document.querySelector('home-assistant')?.hass?.states&&customElements.get('navet-composition-card'));
   stage='mount native composition';
   await page.evaluate(async()=>{
    const app=document.querySelector('home-assistant'),hass=app.hass,sensor=Object.keys(hass.states).find(id=>id.startsWith('sensor.')&&Number.isFinite(Number(hass.states[id].state)));if(!sensor)throw new Error('Numeric demo sensor required');
    const helpers=await window.loadCardHelpers();const grid=helpers.createCardElement({type:'grid',cards:[]});await grid.constructor.getConfigElement();
    const config={type:'custom:navet-composition-card',config_version:2,definitions:{reading:{variables:{label:'Default'},config:{type:'custom:navet-sensor-card',entity:sensor,name:'Shared ${label}'}}},cards:[{type:'custom:navet-sensor-card',use:['reading'],variables:{label:'First'}},{type:'custom:navet-sensor-card',use:['reading']},{type:'tile',entity:sensor,name:'Native identity',future_native_field:{keep:true}}],future_recipe_field:{preserved:true}};
    window.recipeSource=structuredClone(config);
    const host=document.createElement('section');host.id='ha-recipes-proof';host.style.cssText='position:fixed;inset:0;z-index:1000;overflow:auto;padding:16px;box-sizing:border-box;background:var(--primary-background-color,#fff);color:var(--primary-text-color,#222)';
    const card=document.createElement('navet-composition-card');card.id='ha-recipe-runtime';card.setConfig(structuredClone(config));card.hass=hass;host.append(card);
    const editor=await customElements.get('navet-composition-card').getConfigElement();editor.id='ha-recipe-editor';editor.hass=hass;editor.setConfig(structuredClone(config));editor.addEventListener('config-changed',event=>{window.recipeSaved=structuredClone(event.detail.config);});host.append(editor);
    const main=app.shadowRoot.querySelector('home-assistant-main');(main?.shadowRoot??app.shadowRoot).append(host);window.recipeProofHost=host;
   });
   const runtime=page.locator('#ha-recipe-runtime'),editor=page.locator('#ha-recipe-editor');
   await runtime.getByText('Shared First',{exact:true}).waitFor();await runtime.getByText('Shared Default',{exact:true}).waitFor();await runtime.locator('hui-tile-card').waitFor();
   assert.equal(await runtime.locator('navet-sensor-card').count(),2);
   stage='shared definition update';
   await runtime.evaluate(card=>{window.recipeNativeBefore=card.shadowRoot.querySelector('navet-child-cards').shadowRoot.querySelector('hui-tile-card');const changed=structuredClone(window.recipeSource);changed.definitions.reading.config.name='Updated ${label}';card.setConfig(changed);card.hass=document.querySelector('home-assistant').hass;});
   await runtime.getByText('Updated First',{exact:true}).waitFor();await runtime.getByText('Updated Default',{exact:true}).waitFor();
   assert.equal(await runtime.evaluate(card=>card.shadowRoot.querySelector('navet-child-cards').shadowRoot.querySelector('hui-tile-card')===window.recipeNativeBefore),true,'Unrelated native tile survives scope updates');
   assert.equal(await runtime.evaluate(card=>card.shadowRoot.querySelector('navet-child-cards').shadowRoot.querySelector('hui-tile-card').hass.connection===document.querySelector('home-assistant').hass.connection),true);
   await runtime.screenshot({path:resolve(output,`${profile}-scoped-runtime.png`)});
   stage='visual reuse';
   await editor.locator('summary').filter({hasText:/^Reusable configurations$/}).click();const recipes=editor.locator('navet-recipes-editor');
   await recipes.getByLabel('Use definitions: add reference').selectOption('reading');await recipes.getByRole('button',{name:'Add variable',exact:true}).first().click();
   await recipes.getByLabel('Card variables: variable1 name').fill('rootLabel');await recipes.getByLabel('Card variables: variable1 name').press('Tab');await recipes.getByLabel('Card variables: rootLabel value').fill('Room');await recipes.getByLabel('Card variables: rootLabel value').press('Tab');
   await recipes.getByLabel('New definition name').fill('visual');await recipes.getByRole('button',{name:'Create definition',exact:true}).click();assert.equal(await recipes.getByLabel('New definition name').inputValue(),'');
   await recipes.getByRole('button',{name:'Edit definition reading',exact:true}).click();
   const native=recipes.locator('navet-child-cards-editor');await native.getByRole('button',{name:'Edit child card 1',exact:true}).click();
   // The complete referenced definition is edited by the actual Navet visual editor hosted by HA.
   await native.locator('navet-card-editor').waitFor({state:'attached'});
   const definitionEditor=native.locator('navet-card-editor');assert.ok(await definitionEditor.locator('ha-form').count()>0,'Native HA selector present');
   await recipes.getByRole('button',{name:'Export definitions',exact:true}).click();const exported=JSON.parse(await recipes.getByLabel('Definitions export JSON').inputValue());assert.ok(exported.reading&&exported.visual);
   await recipes.locator('strong').first().scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,`${profile}-native-recipes-editor.png`)});
   stage='roundtrip import materialize';
   await native.getByRole('button',{name:'Edit child card 1',exact:true}).click();
   await recipes.getByText('Import definitions',{exact:true}).click();await recipes.getByLabel('Definitions import JSON').fill(JSON.stringify(exported));await recipes.getByRole('button',{name:'Replace definitions from import',exact:true}).click();
   let saved=await page.evaluate(()=>window.recipeSaved);assert.deepEqual(saved.future_recipe_field,{preserved:true});assert.deepEqual(saved.use,['reading']);assert.equal(saved.variables.rootLabel,'Room');assert.deepEqual(saved.cards[2].future_native_field,{keep:true});
   await editor.evaluate((element,saved)=>element.setConfig(structuredClone(saved)),saved);assert.equal(await recipes.getByLabel('Card variables: rootLabel value').inputValue(),'Room');
   await recipes.getByRole('button',{name:'Materialize this card',exact:true}).click();saved=await page.evaluate(()=>window.recipeSaved);assert.equal(saved.use,undefined);assert.equal(saved.variables,undefined);assert.deepEqual(saved.cards[0].use,['reading']);assert.deepEqual(saved.future_recipe_field,{preserved:true});
   await editor.evaluate((element,saved)=>element.setConfig(structuredClone(saved)),saved);assert.equal(await editor.evaluate(element=>element.scrollWidth<=element.clientWidth),true,'Editor fits viewport');assert.equal(serviceCalls,0);assert.deepEqual(errors,[]);
   results.push({profile,status:'passed',version:session.version,viewport:page.viewportSize(),entrySha256:await sha(resolve(root,entry)),sensorChildren:2,sharedDefinitionUpdate:true,unrelatedNativeIdentity:true,nativeChildEditor:true,visualVariables:true,createImportExportMaterialize:true,sourceRoundtrip:true,serviceCalls,pageErrors:errors});
  }catch(error){await page.screenshot({path:resolve(output,`${profile}-failure.png`)}).catch(()=>{});const reason=stage==='login'?'Login failed':redact(error.message).split('\n')[0].slice(0,250);results.push({profile,status:'failed',stage,reason,version:session.version,entrySha256:await sha(resolve(root,entry)),serviceCalls,pageErrors:errors});}
  await context.close();
 }
}finally{await browser.close();}
await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));if(results.some(result=>result.status!=='passed'))process.exitCode=1;
