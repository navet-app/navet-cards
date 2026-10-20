import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type Manifest = {entry:string;files:{path:string;imports:{path:string;kind:string}[]}[]};
const readManifest = async (): Promise<Manifest> => JSON.parse(await readFile('dist/modular/artifact-manifest.json','utf8'));
function staticClosure(manifest: Manifest, entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const imported of manifest.files.find(file=>file.path === entry)!.imports) if (imported.kind !== 'dynamic-import') staticClosure(manifest,imported.path,seen);
  return seen;
}
async function blankHost(page: Page) {
  await page.route('**/artifact-host.html', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/artifact-host.html');
}
async function mountCard(page: Page, resource: string) {
  await page.evaluate(async url => {
    await import(url);
    const Constructor = customElements.get('navet-light-card') as any;
    (window as any).artifactConstructor = Constructor;
    (window as any).artifactCalls = [];
    const card = new Constructor();
    card.setConfig({type:'custom:navet-light-card',entity:'light.artifact',name:'Artifact light'});
    card.hass = {states:{'light.artifact':{entity_id:'light.artifact',state:'off',attributes:{friendly_name:'Artifact light',supported_color_modes:['brightness'],brightness:128}}},async callService(domain:string,service:string) {(window as any).artifactCalls.push({domain,service});}};
    document.body.append(card);
  }, resource);
  await expect(page.locator('navet-light-card')).toBeVisible();
}

for (const prefix of ['/dist/modular/', '/hacsfiles/navet-cards/', '/reverse/proxy/local/navet/']) {
  test(`modular resource loads complete relative closure and lazy editor at ${prefix}`, async ({page}) => {
    const manifest = await readManifest();
    const loaded = new Set<string>();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    if (prefix !== '/dist/modular/') await page.route(`**${prefix}**`, async route => {
      const url = new URL(route.request().url());
      const suffix = url.pathname.slice(prefix.length);
      await route.fulfill({response:await route.fetch({url:`${url.origin}/dist/modular/${suffix}`})});
    });
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith(prefix) && response.ok()) loaded.add(path.slice(prefix.length));
    });
    await blankHost(page);
    await mountCard(page,prefix+manifest.entry);
    expect(await page.evaluate(()=>Boolean(customElements.get('navet-card-editor')))).toBe(false);
    expect([...loaded].some(path=>path.includes('/editor-'))).toBe(false);
    const tag = await page.evaluate(async()=> (await (window as any).artifactConstructor.getConfigElement()).localName);
    expect(tag).toBe('navet-card-editor');
    const expected = staticClosure(manifest,manifest.entry);
    staticClosure(manifest,manifest.files.find(file=>/\/editor-/.test(file.path))!.path,expected);
    await expect.poll(()=>loaded.size).toBe(expected.size);
    expect([...loaded].sort()).toEqual([...expected].sort());
    await page.locator('navet-light-card').getByRole('button',{name:'Artifact light',exact:true}).click();
    expect(await page.evaluate(()=>(window as any).artifactCalls)).toEqual([{domain:'light',service:'turn_on'}]);
    expect(errors).toEqual([]);
  });
}

test('missing editor chunk rejects explicitly while native card controls remain usable', async ({page}) => {
  const manifest = await readManifest();
  const editor = manifest.files.find(file=>/\/editor-/.test(file.path));
  expect(editor).toBeTruthy();
  await page.route(`**/dist/modular/${editor!.path}`,route=>route.fulfill({status:404,contentType:'text/plain',body:'Editor chunk unavailable'}));
  await blankHost(page);
  await mountCard(page,'/dist/modular/'+manifest.entry);
  const error = await page.evaluate(async()=>{
    try {await (window as any).artifactConstructor.getConfigElement();return '';}
    catch (error) {return String(error);}
  });
  expect(error).toMatch(/fetch|import|module/i);
  expect(await page.evaluate(()=>Boolean(customElements.get('navet-card-editor')))).toBe(false);
  await page.locator('navet-light-card').getByRole('button',{name:'Artifact light',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).artifactCalls.length)).toBe(1);
});

test('simulated upgrade retains old hashed chunks for a previously open tab', async ({page}) => {
  const manifest = await readManifest();
  const retained = new Map(await Promise.all(manifest.files.map(async file=>[file.path,await readFile(`dist/modular/${file.path}`)] as const)));
  const prefix = '/upgrade/hacsfiles/navet-cards/';
  let upgraded = false;
  const oldChunkLoads: string[] = [];
  await page.route(`**${prefix}**`,async route=>{
    const path = new URL(route.request().url()).pathname.slice(prefix.length);
    if (upgraded && path !== manifest.entry) oldChunkLoads.push(path);
    const bytes = retained.get(path);
    await route.fulfill(bytes ? {contentType:'text/javascript',body:bytes} : {status:404,body:'missing'});
  });
  await blankHost(page);
  await mountCard(page,prefix+manifest.entry);
  // Simulate entry replacement while retaining the old deployment's immutable chunks.
  // This fixture demonstrates the required retention policy; it is not HACS evidence.
  retained.set(manifest.entry,Buffer.from('/* successor deployment entry */'));
  upgraded = true;
  const tag = await page.evaluate(async()=> (await (window as any).artifactConstructor.getConfigElement()).localName);
  expect(tag).toBe('navet-card-editor');
  expect(oldChunkLoads.some(path=>/\/editor-/.test(path))).toBe(true);
  await page.locator('navet-light-card').getByRole('button',{name:'Artifact light',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).artifactCalls.length)).toBe(1);
});
