import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

// Explicit disposable-host opt-in. No resource registry, dashboard or account writes.
const sessionFile = resolve(process.env.NAVET_HA_SESSION ?? '.ha-validation/2026.9.4/session.json');
assert.ok(sessionFile.startsWith(resolve('.ha-validation') + sep));
const session = JSON.parse(await readFile(sessionFile, 'utf8'));
const base = new URL(session.base);
assert.equal(base.hostname, '127.0.0.1'); assert.equal(base.protocol, 'http:');
assert.ok(Number(base.port) >= 18000 && Number(base.port) < 19000);
assert.equal(session.name, `navet-cards-ha-${session.version.replaceAll('.', '-')}`);
const prefix = process.env.NAVET_HA_ARTIFACT_PREFIX ?? 'competition-m5';
assert.match(prefix, /^[a-z0-9][a-z0-9_-]{0,63}$/);
const root = resolve(sessionFile, '..', 'config', 'www', prefix);
const pins = [
  ['Clooos/Bubble-Card','v3.4.2','bubble-card.js','d526dfd815af6a022b8f7355874fc96f2df859aa213cff7b374f7d913a6436ae'],
  ['piitaya/lovelace-mushroom','v5.2.3','mushroom.js','631668268e474d5357e0f17f161322499ea5c93a910431477e112653d7aa456b'],
  ['custom-cards/button-card','v7.0.1','button-card.js','5d6e9c6afca01e8014653fa56bb5d6aa9248d832c34fb944a7f2c36329bc22d1'],
];
if (process.env.NAVET_HA_FETCH_COMPETITORS === '1') {
  const downloaded = []; await mkdir(resolve(root,'competitors'),{recursive:true});
  for (const [repo,tag,name,sha256] of pins) {
    const url=`https://github.com/${repo}/releases/download/${tag}/${name}`;
    const response=await fetch(url);assert.equal(response.ok,true,`Official asset download failed: ${name}`);
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256);
    await writeFile(resolve(root,'competitors',name),bytes);
    downloaded.push({repo,tag,name,url,release:`https://github.com/${repo}/releases/tag/${tag}`,sha256,bytes:bytes.length});
  }
  await writeFile(resolve(root,'competitors/manifest.json'),JSON.stringify(downloaded,null,2));
}
const fixtures = JSON.parse(await readFile(resolve(root, 'competitors/manifest.json'), 'utf8'));
assert.deepEqual(fixtures.map(({repo,tag,name,sha256})=>[repo,tag,name,sha256]),pins);
assert.deepEqual(fixtures.map(({ tag }) => tag), ['v3.4.2','v5.2.3','v7.0.1']);
for (const fixture of fixtures) {
  assert.match(fixture.url, /^https:\/\/github\.com\//);
  assert.equal(createHash('sha256').update(await readFile(resolve(root, 'competitors', fixture.name))).digest('hex'), fixture.sha256);
}
const output = resolve(sessionFile, '..', `coexistence-evidence-${prefix}`); await mkdir(output, { recursive: true });
const redact = (value) => ['username','password','access_token','refresh_token'].reduce((text,key) => session[key] ? text.replaceAll(session[key], '[redacted]') : text, String(value));
const browser = await chromium.launch({ channel: process.env.NAVET_BROWSER_CHANNEL ?? 'chrome', headless: true });
const results = [];
try {
  for (const profile of ['standalone','modular']) {
    const context = await browser.newContext({ viewport: profile === 'standalone' ? { width:1280,height:900 } : { width:390,height:844 } });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    let serviceCalls = 0; const errors = []; let authenticated = false;
    page.on('pageerror', (error) => errors.push(redact(error.message)));
    page.on('websocket', (socket) => socket.on('framesent', ({payload}) => { try { if (JSON.parse(String(payload)).type === 'call_service') serviceCalls++; } catch {} }));
    const entry = `${profile === 'modular' ? 'navet-modular/' : ''}navet-cards.js`;
    const entrySha256 = createHash('sha256').update(await readFile(resolve(root, entry))).digest('hex');
    await page.route('**/local/navet-cards.js*', (route) => route.fulfill({ contentType:'application/javascript',body:`import ${JSON.stringify(`${session.base}/local/${prefix}/${entry}`)};` }));
    try {
      await page.goto(`${session.base}/navet-verification/masonry`);
      await page.locator('input[name="username"]').fill(session.username); await page.locator('input[name="password"]').fill(session.password);
      const submit = page.getByRole('button', {name:/log in|sign in/i}); if (await submit.count()) await submit.click(); else await page.locator('input[name="password"]').press('Enter');
      await page.waitForFunction(() => document.querySelector('home-assistant')?.hass?.states && customElements.get('navet-room-card')); authenticated = true;
      await page.evaluate(async ({ prefix, fixtures }) => {
        for (const fixture of fixtures) await import(`/local/${prefix}/competitors/${fixture.name}`);
        // Observe setter delivery without assuming competitor APIs expose a hass getter.
        window.coexistenceAssignments = new WeakMap();
        for (const tag of ['bubble-card','mushroom-entity-card','button-card']) {
          const prototype=customElements.get(tag).prototype;
          let owner=prototype; while(owner && !Object.getOwnPropertyDescriptor(owner,'hass')) owner=Object.getPrototypeOf(owner);
          const descriptor=owner && Object.getOwnPropertyDescriptor(owner,'hass');
          if(!descriptor?.set) throw Error(`${tag} lacks its expected HA state setter`);
          Object.defineProperty(prototype,'hass',{...descriptor,set(value){window.coexistenceAssignments.set(this,value);descriptor.set.call(this,value);}});
        }
        const app = document.querySelector('home-assistant');
        const host = document.createElement('section'); host.id='coexistence-mount'; host.style.cssText='position:fixed;inset:0;z-index:1000;overflow:auto;padding:16px;background:var(--primary-background-color);color:var(--primary-text-color)';
        (app.shadowRoot.querySelector('home-assistant-main')?.shadowRoot ?? app.shadowRoot).append(host); window.coexistenceMount = host;
        const light = app.hass.states['light.bed_light'] ? 'light.bed_light' : Object.keys(app.hass.states).find(id=>id.startsWith('light.'));
        if (!light) throw Error('Demo light required');
        const cards = [
          {type:'custom:bubble-card',card_type:'button',button_type:'name',entity:light,name:'Bubble child',button_action:{tap_action:{action:'more-info'}},tap_action:{action:'more-info'},future_child_field:{preserved:true}},
          {type:'custom:mushroom-entity-card',entity:light,name:'Mushroom child',tap_action:{action:'more-info'}},
          {type:'custom:button-card',entity:light,name:'Button child',tap_action:{action:'more-info'},future_child_field:{preserved:true}},
        ];
        const config={type:'custom:navet-room-card',config_version:2,name:'Competitor children',room:{membership:{mode:'explicit',entities:[light]}},cards};
        const card=document.createElement('navet-room-card'); card.id='coexistence-room'; card.style.maxWidth='480px'; card.setConfig(config); card.hass=app.hass;host.append(card);window.coexistenceConfig=config;
      }, {prefix,fixtures});
      const owner=page.locator('#coexistence-room');
      assert.equal(await owner.locator('navet-child-cards').count(),0);
      await owner.getByRole('button',{name:'Controls',exact:true}).click();
      const host=owner.locator('navet-child-cards');
      for (const tag of ['bubble-card','mushroom-entity-card','button-card']) await host.locator(tag).waitFor({state:'visible'});
      const rendered = await host.evaluate(async (element) => {
        const children=[...element.shadowRoot.querySelectorAll('.child')].map(row=>row.firstElementChild);window.coexistenceChildren=children;
        const size=await element.getCardSize();const grid=element.getGridOptions();
        return {tags:children.map(c=>c.localName),size,grid,connected:children.every(c=>c.isConnected),hass:children.every(c=>window.coexistenceAssignments.get(c)?.connection===document.querySelector('home-assistant').hass.connection),widths:children.map(c=>c.getBoundingClientRect().width),hostWidth:element.getBoundingClientRect().width,bodyOverflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(rendered.connected,true,'Children connected');assert.equal(rendered.hass,true,'Real HA state connection');assert.ok(rendered.size>0,'Positive child size');
      assert.ok(rendered.widths.every(width=>width>0&&width<=rendered.hostWidth+1));
      assert.equal(rendered.bodyOverflow,false);
      await page.screenshot({path:resolve(output,`${profile}-competitor-popup.png`)});
      await host.evaluate((element)=>{const hass={...document.querySelector('home-assistant').hass};window.coexistenceHass=hass;element.hass=hass;});
      await page.waitForFunction(()=>window.coexistenceChildren.every(child=>window.coexistenceAssignments.get(child)===window.coexistenceHass));
      await page.keyboard.press('Escape');await owner.getByRole('dialog').waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>window.coexistenceChildren.every(child=>!child.isConnected)),true,'All children disconnected after closing');
      await owner.getByRole('button',{name:'Controls',exact:true}).click();await host.locator('button-card').waitFor({state:'visible'});
      assert.equal(await host.evaluate(element=>element.shadowRoot.querySelector('button-card')!==window.coexistenceChildren[2]),true,'Reopening creates fresh child');
      await page.keyboard.press('Escape');
      // Use the actual HA-backed child editor rather than a fake competitor editor.
      await page.evaluate(async()=>{
        const helpers=await window.loadCardHelpers();const grid=helpers.createCardElement({type:'grid',cards:[]});await grid.constructor.getConfigElement();
        const editor=await customElements.get('navet-room-card').getConfigElement();editor.id='coexistence-editor';editor.hass=document.querySelector('home-assistant').hass;editor.setConfig(window.coexistenceConfig);
        editor.addEventListener('config-changed',event=>window.coexistenceSaved=structuredClone(event.detail.config));window.coexistenceMount.replaceChildren(editor);
      });
      const editor=page.locator('#coexistence-editor');await editor.locator('summary').filter({hasText:/^Child cards$/}).click();
      const childEditor=editor.locator('navet-child-cards-editor');const editorEvidence=[];
      for(const [index,tag] of ['bubble-card-editor','mushroom-entity-card-editor',null].entries()){
        await childEditor.getByRole('button',{name:`Edit child card ${index+1}`,exact:true}).click();
        if(tag) { const actualTag=await page.evaluate(async(index)=>{const tag=['bubble-card','mushroom-entity-card'][index];return (await customElements.get(tag).getConfigElement()).localName;},index); await childEditor.locator(actualTag).waitFor({state:'attached'}); }
        else await childEditor.getByText('Replace complete configuration',{exact:true}).waitFor({state:'attached'});
        const evidence=await childEditor.evaluate(element=>({tags:[...element.shadowRoot.querySelectorAll('*')].filter(el=>el.localName.endsWith('-editor')).map(el=>el.localName),error:element.shadowRoot.querySelector('[role="alert"]')?.textContent??null}));
        editorEvidence.push({index,visualEditor:tag,evidence});
        if(index===0)await page.screenshot({path:resolve(output,`${profile}-bubble-editor.png`)});
      }
      // JSON replacement is supported for every opaque config, including button-card (no visual editor).
      await childEditor.getByText('Replace complete configuration',{exact:true}).click();
      const replacement=await page.evaluate(()=>({...window.coexistenceConfig.cards[2],name:'Edited Button child'}));
      await childEditor.getByLabel('Child configuration JSON',{exact:true}).fill(JSON.stringify(replacement));
      await childEditor.getByRole('button',{name:'Replace child configuration',exact:true}).click();
      await page.waitForFunction(()=>window.coexistenceSaved?.cards[2]?.name==='Edited Button child');
      assert.equal(await page.evaluate(()=>[0,2].every(index=>window.coexistenceSaved.cards[index].future_child_field.preserved)),true,'Foreign child fields survive replacement');
      await page.evaluate(()=>{const card=document.createElement('navet-room-card');card.id='coexistence-preview';card.preview=true;card.setConfig(JSON.parse(JSON.stringify(window.coexistenceSaved)));card.hass=document.querySelector('home-assistant').hass;window.coexistenceMount.replaceChildren(card);});
      const preview=page.locator('#coexistence-preview');await preview.getByRole('button',{name:'Controls',exact:true}).click();
      await preview.locator('navet-child-cards button-card').waitFor({state:'visible'});
      assert.equal(await preview.locator('navet-child-cards .children').getAttribute('inert'),'');
      assert.equal(await preview.locator('navet-child-cards').evaluate(element=>[...element.shadowRoot.querySelectorAll('.child')].every(row=>row.firstElementChild.preview===true)),true,'Child preview flag');
      await page.screenshot({path:resolve(output,`${profile}-competitor-preview.png`)});
      assert.equal(serviceCalls,0);assert.deepEqual(errors,[]);
      results.push({version:session.version,profile,entrySha256,status:'passed',rendered,editorEvidence,statePropagation:true,closeDisconnect:true,reopenFresh:true,jsonRoundtrip:true,previewInert:true,serviceCalls,pageErrors:errors});
    }catch(error){if(authenticated){await page.screenshot({path:resolve(output,`${profile}-failure.png`)});const diagnostic=await page.locator('navet-child-cards-editor').evaluate(element=>{const walk=root=>[...root.children].flatMap(child=>[{tag:child.localName,text:child.localName.includes('error')?child.textContent:null},...(child.shadowRoot?walk(child.shadowRoot):[]),...walk(child)]);return {selected:element.selected,loading:element.loading,error:element.error,signature:element.editorSignature,nodes:walk(element.shadowRoot)};}).catch(()=>null);await writeFile(resolve(output,`${profile}-diagnostic.json`),JSON.stringify(diagnostic,null,2));}results.push({version:session.version,profile,entrySha256,status:'failed',reason:redact(error.message),pageErrors:errors});throw Error(redact(error.stack));}
    finally{await writeFile(resolve(output,'results.json'),JSON.stringify({scope:'Pinned competitor children in disposable HA; no HACS, household, competitor popup or service-action acceptance',fixtures,results},null,2));await context.close();}
  }
  console.log(`Pinned competitor coexistence checks passed: ${session.version}; ${results.map(r=>r.profile).join(', ')}. Evidence: ${output}`);
}finally{await browser.close();}
