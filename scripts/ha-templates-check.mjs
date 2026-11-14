import assert from 'node:assert/strict';
import{readFile,mkdir,writeFile}from'node:fs/promises';import{resolve,sep}from'node:path';import{createHash}from'node:crypto';import{chromium}from'@playwright/test';
// Read-only frontend acceptance against explicitly isolated disposable HA only.
const sessionFile=resolve(process.env.NAVET_HA_SESSION??'.ha-validation/2026.9.4/session.json');assert.ok(sessionFile.startsWith(resolve('.ha-validation')+sep));
const session=JSON.parse(await readFile(sessionFile,'utf8'));const base=new URL(session.base);assert.equal(base.hostname,'127.0.0.1');assert.equal(base.protocol,'http:');assert.ok(Number(base.port)>=18000&&Number(base.port)<19000);assert.equal(session.name,`navet-cards-ha-${session.version.replaceAll('.','-')}`);
const prefix=process.env.NAVET_HA_ARTIFACT_PREFIX??'competition-templates';assert.match(prefix,/^[a-z0-9][a-z0-9_-]{0,63}$/);
const output=resolve(sessionFile,'..',`template-evidence-${prefix}`);await mkdir(output,{recursive:true});
const redact=value=>['username','password','access_token','refresh_token'].reduce((text,key)=>session[key]?text.replaceAll(session[key],'[redacted]'):text,String(value));
const browser=await chromium.launch({channel:process.env.NAVET_BROWSER_CHANNEL??'chrome',headless:true});const results=[];
try{for(const profile of['standalone','modular']){
  const context=await browser.newContext({viewport:profile==='standalone'?{width:1280,height:900}:{width:390,height:844}});const page=await context.newPage();page.setDefaultTimeout(15000);
  const entry=`${profile==='modular'?'navet-modular/':''}navet-cards.js`;const entrySha256=createHash('sha256').update(await readFile(resolve(sessionFile,'..','config','www',prefix,entry))).digest('hex');
  let serviceCalls=0,templateRequests=0;const errors=[];
  page.on('pageerror',error=>errors.push(redact(error.message)));page.on('websocket',socket=>socket.on('framesent',({payload})=>{try{const message=JSON.parse(String(payload));if(message.type==='call_service')serviceCalls++;if(message.type==='render_template')templateRequests++;}catch{}}));
  await page.route('**/local/navet-cards.js*',route=>route.fulfill({contentType:'application/javascript',body:`import ${JSON.stringify(`${session.base}/local/${prefix}/${entry}`)};`}));
  try{
    await page.goto(`${session.base}/navet-verification/masonry`);await page.locator('input[name="username"]').fill(session.username);await page.locator('input[name="password"]').fill(session.password);const submit=page.getByRole('button',{name:/log in|sign in/i});if(await submit.count())await submit.click();else await page.locator('input[name="password"]').press('Enter');
    await page.waitForFunction(()=>document.querySelector('home-assistant')?.hass?.states&&customElements.get('navet-entity-card'));
    await page.evaluate(async()=>{
      const app=document.querySelector('home-assistant');const editor=await customElements.get('navet-entity-card').getConfigElement();editor.id='template-native-editor';editor.hass=app.hass;
      const entity=Object.keys(app.hass.states).find(id=>id.startsWith('sensor.')&&Number.isFinite(Number(app.hass.states[id].state)));if(!entity)throw Error('Numeric demo sensor required');
      editor.setConfig({type:'custom:navet-entity-card',config_version:2,entity,name:'Native fallback',future_card:{keep:true},display_templates:{name:{template:'{{ label }}',variables:{label:'Before'},future_spec:{keep:true}}}});
      editor.addEventListener('config-changed',event=>window.nativeTemplateSaved=structuredClone(event.detail.config));
      const host=document.createElement('section');host.style.cssText='position:fixed;inset:0;z-index:1000;overflow:auto;padding:16px;background:var(--primary-background-color);color:var(--primary-text-color)';host.id='native-template-mount';window.nativeTemplateMount=host;
      (app.shadowRoot.querySelector('home-assistant-main')?.shadowRoot??app.shadowRoot).append(host);host.append(editor);
    });
    const editor=page.locator('#template-native-editor');await editor.locator('summary').filter({hasText:/^HA display templates$/}).click();const fields=editor.locator('navet-templates-editor');
    await fields.getByLabel('Name template',{exact:true}).fill('{{ label | upper }}');await fields.getByLabel('Name variables (JSON)',{exact:true}).fill('{"label":"native template"}');
    await page.waitForFunction(()=>window.nativeTemplateSaved?.display_templates.name.variables.label==='native template');
    const saved=await page.evaluate(()=>window.nativeTemplateSaved);assert.deepEqual(saved.future_card,{keep:true});assert.deepEqual(saved.display_templates.name.future_spec,{keep:true});
    await fields.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,`${profile}-native-template-editor.png`)});
    await page.evaluate(config=>{
      config.display_templates.state={template:'{{ 6 * 7 }}'};config.display_templates.icon={template:'{{ "mdi:home" }}'};config.display_templates.color={template:'{{ "#336699" }}'};config.display_templates.visible={template:'{{ true }}'};
      window.nativeTemplateRuntimeConfig=structuredClone(config);const card=document.createElement('navet-entity-card');card.id='native-template-card';card.style.cssText='display:block;max-width:450px;height:176px';card.setConfig(JSON.parse(JSON.stringify(config)));card.hass=document.querySelector('home-assistant').hass;window.nativeTemplateMount.replaceChildren(card);
    },saved);
    const card=page.locator('#native-template-card');await card.getByText('NATIVE TEMPLATE',{exact:true}).waitFor({state:'visible'});
    await page.waitForFunction(()=>['name','state','icon','color','visible'].every(field=>document.querySelector('home-assistant').shadowRoot.querySelector('home-assistant-main').shadowRoot.querySelector('#native-template-card')?.templateSnapshots?.get(field)?.status==='ready'));
    const display=await card.evaluate(element=>({state:element.templateSnapshots.get('state').value,icon:element.templateSnapshots.get('icon').value,color:element.templateSnapshots.get('color').value,visible:element.templateSnapshots.get('visible').value}));assert.deepEqual(display,{state:'42',icon:'mdi:home',color:'#336699',visible:true});
    await page.screenshot({path:resolve(output,`${profile}-native-template-runtime.png`)});
    await card.evaluate(element=>{const config=structuredClone(window.nativeTemplateRuntimeConfig);config.display_templates.name.template='{{ invalid syntax';element.setConfig(config);});
    await card.locator('.template-error[data-template-field="name"]').waitFor({state:'visible'});await card.getByText('Native fallback',{exact:true}).waitFor({state:'visible'});
    await card.evaluate(element=>element.setConfig(structuredClone(window.nativeTemplateRuntimeConfig)));await card.getByText('NATIVE TEMPLATE',{exact:true}).waitFor({state:'visible'});assert.equal(await card.locator('.template-error').count(),0);
    const beforePreview=templateRequests;
    await page.evaluate(()=>{const card=document.createElement('navet-entity-card');card.id='native-template-preview';card.preview=true;card.setConfig(structuredClone(window.nativeTemplateRuntimeConfig));card.hass=document.querySelector('home-assistant').hass;window.nativeTemplateMount.replaceChildren(card);});
    await page.locator('#native-template-preview').getByText('Native fallback',{exact:true}).waitFor({state:'visible'});assert.equal(templateRequests,beforePreview,'Preview adds no template subscriptions');assert.equal(serviceCalls,0);assert.deepEqual(errors,[]);
    results.push({version:session.version,profile,entrySha256,status:'passed',nativeEditorRoundtrip:true,displayFields:['name','state','icon','color','visible'],invalidJinjaFallback:true,recovery:true,previewSubscriptions:0,serviceCalls,pageErrors:errors});
  }catch(error){results.push({version:session.version,profile,entrySha256,status:'failed',reason:redact(error.message),pageErrors:errors});throw Error(redact(error.stack));}
  finally{await writeFile(resolve(output,'results.json'),JSON.stringify({scope:'Disposable real HA Jinja editor-to-card pipeline; no household or permission acceptance',results},null,2));await context.close();}
}console.log(`Native HA template pipeline passed: ${session.version}; ${results.map(result=>result.profile).join(', ')}. Evidence: ${output}`);}finally{await browser.close();}
