import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Manifest={files:{path:string}[]};
const contentAsset=async()=>{
  const manifest:Manifest=JSON.parse(await readFile('dist/modular/artifact-manifest.json','utf8'));
  const path=manifest.files.find(file=>/\/custom-content-/.test(file.path))?.path;
  expect(path,'rich content must be a real optional chunk').toBeTruthy();
  return '/dist/modular/'+path;
};
async function host(page:Page){
  await page.route('**/lazy-content-host.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/lazy-content-host.html');
  await page.evaluate(async()=>{
    const resource='/dist/modular/navet-cards.js';await import(resource);
    (window as any).contentCalls=[];
    (window as any).contentHost={states:{
      'light.content':{entity_id:'light.content',state:'off',attributes:{friendly_name:'Content fixture light',supported_color_modes:['onoff']}},
      'sensor.content_temperature':{entity_id:'sensor.content_temperature',state:'21',attributes:{friendly_name:'Content temperature',unit_of_measurement:'°C'}},
    },async callService(domain:string,service:string){(window as any).contentCalls.push({domain,service});}};
    (window as any).mountContentCard=(kind:string,config:Record<string,unknown>,id:string)=>{
      const card=document.createElement(`navet-${kind}-card`) as any;
      card.id=id;card.setConfig({type:`custom:navet-${kind}-card`,...config});
      card.hass=(window as any).contentHost;document.body.append(card);return card;
    };
  });
}

test('everyday light/room view and light editor exclude rich content until a supported card renders',async({page})=>{
  const asset=await contentAsset();
  const requests:string[]=[];
  page.on('request',request=>{if(new URL(request.url()).pathname===asset)requests.push(request.url());});
  await host(page);
  await page.evaluate(async()=>{
    const mount=(window as any).mountContentCard;
    mount('light',{entity:'light.content'},'everyday-light');
    mount('room',{entities:['light.content'],name:'Everyday room'},'everyday-room');
    mount('button',{name:'Everyday action',tap_action:{action:'navigate',navigation_path:'/demo/index.html'}},'everyday-action');
    const Constructor=customElements.get('navet-light-card') as any;
    const editor=await Constructor.getConfigElement();
    editor.id='everyday-editor';editor.hass=(window as any).contentHost;editor.setConfig({type:'custom:navet-light-card',entity:'light.content'});document.body.append(editor);
    await editor.updateComplete;
  });
  await expect(page.locator('#everyday-light')).toBeVisible();
  await expect(page.locator('#everyday-editor')).toBeVisible();
  expect(requests).toEqual([]);
  await page.evaluate(()=>{(window as any).mountContentCard('note',{content:'Lazy note is ready'},'rich-note');});
  await expect(page.locator('#rich-note')).toContainText('Lazy note is ready');
  expect(requests).toHaveLength(1);
  await page.locator('#everyday-light').getByRole('button',{name:'Content fixture light',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).contentCalls)).toEqual([{domain:'light',service:'turn_on'}]);
});

test('supported rich families share one chunk and configuration edits render the current content',async({page})=>{
  const asset=await contentAsset();let requests=0;
  page.on('request',request=>{if(new URL(request.url()).pathname===asset)requests++;});
  await host(page);
  await page.evaluate(()=>{
    const mount=(window as any).mountContentCard;
    mount('info',{entities:['sensor.content_temperature']},'rich-info');
    mount('note',{content:'Original note'},'rich-note');
  });
  await expect(page.locator('#rich-info')).toContainText('Content temperature');
  await expect(page.locator('#rich-info')).toContainText('21 °C');
  await expect(page.locator('#rich-note')).toContainText('Original note');
  await page.evaluate(async()=>{
    const Constructor=customElements.get('navet-note-card') as any;
    const editor=await Constructor.getConfigElement();
    editor.id='rich-editor';editor.hass=(window as any).contentHost;
    editor.setConfig({type:'custom:navet-note-card',content:'Original note'});
    editor.addEventListener('config-changed',(event:any)=>{
      (window as any).savedContentConfig=JSON.parse(JSON.stringify(event.detail.config));
      (document.querySelector('#rich-note') as any).setConfig(event.detail.config);
    });
    document.body.append(editor);
  });
  await page.locator('#rich-editor').getByLabel('Note content',{exact:true}).fill('Edited through visual editor');
  await page.locator('#rich-editor').getByLabel('Note content',{exact:true}).dispatchEvent('change');
  await expect(page.locator('#rich-note')).toContainText('Edited through visual editor');
  await page.evaluate(()=>{
    const card=document.querySelector('#rich-note') as any;
    card.remove();card.setConfig((window as any).savedContentConfig);document.body.append(card);
  });
  await expect(page.locator('#rich-note')).toContainText('Edited through visual editor');
  await expect(page.locator('#rich-note')).not.toContainText('Original note');
  expect(requests).toBe(1);
});

test('rich-content import failure is contained and everyday controls still work',async({page})=>{
  const asset=await contentAsset();const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**'+asset,route=>route.fulfill({status:404,body:'Rich-content artifact missing'}));
  await host(page);
  await page.evaluate(()=>{
    const mount=(window as any).mountContentCard;
    mount('light',{entity:'light.content'},'everyday-light');
    mount('note',{content:'Unavailable rich note'},'rich-note');
  });
  await expect(page.locator('#rich-note')).toContainText('Card content could not be loaded');
  await expect(page.locator('#rich-note')).not.toContainText('Unavailable rich note');
  await page.locator('#everyday-light').getByRole('button',{name:'Content fixture light',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).contentCalls)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('late rich-content completion respects changed configuration and disconnect/reconnect',async({page})=>{
  const asset=await contentAsset();let started=false;let finish!:()=>void;
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**'+asset,async route=>{
    started=true;await new Promise<void>(resolve=>{finish=resolve;});await route.fulfill({response:await route.fetch()});
  });
  await host(page);
  await page.evaluate(()=>{(window as any).lateContentCard=(window as any).mountContentCard('note',{content:'Old pending content'},'late-content');});
  await expect.poll(()=>started).toBe(true);
  await page.evaluate(()=>{
    const card=(window as any).lateContentCard;card.remove();
    card.setConfig({type:'custom:navet-note-card',content:'Current reconnected content'});
  });
  const response=page.waitForResponse('**'+asset);finish();await response;
  await page.evaluate(()=>{document.body.append((window as any).lateContentCard);});
  await expect(page.locator('#late-content')).toContainText('Current reconnected content');
  await expect(page.locator('#late-content')).not.toContainText('Old pending content');
  expect(errors).toEqual([]);
});
