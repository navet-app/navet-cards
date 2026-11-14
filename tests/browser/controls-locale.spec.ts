import { test, expect, type Locator, type Page } from '@playwright/test';

async function host(page: Page, language = 'en', theme = 'dark') {
  await page.route('**/controls-locale-host.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main style="max-width:360px;margin:auto"></main></body></html>'}));
  await page.goto('/controls-locale-host.html');
  await page.evaluate(async ({language,theme}) => {
    await import('/dist/modular/navet-cards.js' as string);
    const w=window as any; w.localeCalls=[];
    // Intentionally make HA's global theme disagree with each per-card theme.
    document.documentElement.style.setProperty('--card-background-color',theme === 'dark' ? '#ffffff' : '#111111');
    document.documentElement.style.setProperty('--primary-text-color',theme === 'dark' ? '#111111' : '#ffffff');
    const raw=(id:string,attributes:Record<string,unknown>,state='on')=>({entity_id:id,state,attributes});
    w.localeHost={language,locale:{language},states:{
      'humidifier.locale':raw('humidifier.locale',{friendly_name:'Comfort fixture',supported_features:1,min_humidity:30,max_humidity:80,available_modes:['normal','eco'],mode:'future'}),
      'water_heater.locale':raw('water_heater.locale',{friendly_name:'Water fixture',supported_features:7,min_temp:40,max_temp:70,operation_list:['eco','electric']},'future'),
      'remote.locale':raw('remote.locale',{friendly_name:'Remote fixture',supported_features:4,activity_list:['Watch TV','Listen to music']},'off'),
      'media_player.locale':raw('media_player.locale',{friendly_name:'Group fixture',supported_features:524288},'playing'),
      'media_player.other':raw('media_player.other',{friendly_name:'Other speaker'},'off'),
      'media_player.offline':raw('media_player.offline',{friendly_name:'Offline speaker'},'unavailable'),
    },async callService(...args:unknown[]){w.localeCalls.push(args);}};
    w.localeCards={};
    for(const [kind,entity] of [['humidifier','humidifier.locale'],['water-heater','water_heater.locale'],['remote','remote.locale'],['media','media_player.locale']]){
      const card=document.createElement(`navet-${kind}-card`) as any; card.id=`locale-${kind}`;
      card.setConfig({type:`custom:navet-${kind}-card`,entity,appearance:{theme}});card.hass=w.localeHost;document.querySelector('main')!.append(card);w.localeCards[kind]=card;
    }
  },{language,theme});
}

async function assertContrast(widget: Locator) {
  const results=await widget.evaluate((host) => {
    const rgb=(text:string)=>{const parts=text.match(/[\d.]+/g)?.map(Number)??[];const scale=text.startsWith('color(srgb')?255:1;return [(parts[0]??0)*scale,(parts[1]??0)*scale,(parts[2]??0)*scale,parts[3]??1];};
    const blend=(front:number[],back:number[])=>front.slice(0,3).map((value,index)=>value*front[3]+back[index]*(1-front[3]));
    const luminance=(values:number[])=>values.slice(0,3).map(value=>{const channel=value/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
    const ratio=(a:number[],b:number[])=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const outer=host.getRootNode() as ShadowRoot;
    const dialog=outer.querySelector('dialog[open]')!;
    const surface=getComputedStyle(dialog);
    const stops=[...surface.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(match=>rgb(match[0]));
    const backgrounds=stops.length?stops:[rgb(surface.backgroundColor)];
    return [...host.shadowRoot!.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('button:enabled,select:enabled')].map(element=>{
      const style=getComputedStyle(element);
      const fillStops=[...style.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(match=>rgb(match[0]));
      const fills=fillStops.length?fillStops:[rgb(style.backgroundColor)];
      const color=rgb(style.color);
      return {tag:element.localName,label:element.getAttribute('aria-label')??element.textContent?.trim(),contrast:Math.min(...backgrounds.flatMap(background=>fills.map(fill=>ratio(color,blend(fill,background)))))};
    });
  });
  expect(results.length).toBeGreaterThan(0);
  for(const result of results) expect(result.contrast,`${result.tag} ${result.label} contrast`).toBeGreaterThanOrEqual(4.5);
}

for (const theme of ['dark','light']) test(`comfort, remote and grouping controls retain contrast with ${theme} cards in the opposite HA theme`,async({page})=>{
  await host(page,'en',theme);await page.setViewportSize({width:390,height:844});
  for(const [kind,tag] of [['humidifier','navet-comfort-controls'],['remote','navet-remote-controls'],['media','navet-media-groups']]){
    const card=page.locator(`#locale-${kind}`);await card.getByRole('button',{name:'Controls',exact:true}).click();
    const widget=card.locator(tag);await expect(widget).toBeVisible();
    await assertContrast(widget);
    if(kind==='remote'){
      const colors=await widget.locator('option').first().evaluate(option=>{const style=getComputedStyle(option);return {text:style.color,background:style.backgroundColor};});
      expect(colors.text).not.toBe(colors.background);
    }
    await page.screenshot({path:`/tmp/navet-controls-${theme}-${kind}-phone.png`});
    await page.keyboard.press('Escape');
  }
  expect(await page.evaluate(()=>(window as any).localeCalls)).toEqual([]);
});

test('Swedish control labels, unknown placeholders and grouping explanations follow host language without preview commands',async({page})=>{
  await host(page,'sv-SE','dark');await page.setViewportSize({width:390,height:844});
  const humidity=page.locator('#locale-humidifier');await humidity.getByRole('button',{name:'Kontroller',exact:true}).click();
  await expect(humidity.locator('navet-comfort-controls')).toContainText('Målluftfuktighet · aktuellt värde okänt');
  await expect(humidity.getByRole('combobox',{name:'Fuktighetsläge',exact:true})).toHaveValue('');
  await expect(humidity.locator('navet-comfort-controls option').first()).toHaveText('Välj alternativ · aktuellt värde okänt');
  await page.evaluate(()=>{(window as any).localeCards.humidifier.preview=true;});
  await expect(humidity.getByRole('combobox')).toBeDisabled();
  await humidity.getByRole('combobox').evaluate((element:HTMLSelectElement)=>{element.value='eco';element.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.keyboard.press('Escape');
  const water=page.locator('#locale-water-heater');await water.getByRole('button',{name:'Kontroller',exact:true}).click();
  await expect(water.getByRole('combobox',{name:'Bortaläge',exact:true})).toHaveValue('');
  await expect(water.getByRole('combobox',{name:'Driftläge',exact:true})).toHaveValue('');
  await page.keyboard.press('Escape');
  const remote=page.locator('#locale-remote');await remote.getByRole('button',{name:'Kontroller',exact:true}).click();
  await expect(remote.getByRole('button',{name:'Slå på',exact:true})).toBeVisible();
  await expect(remote.getByRole('button',{name:'Stäng av',exact:true})).toBeVisible();
  await expect(remote.getByRole('combobox',{name:'Aktivitet',exact:true})).toHaveValue('');
  await expect(remote.locator('navet-remote-controls option').first()).toHaveText('Välj aktivitet · aktuellt värde okänt');
  await page.screenshot({path:'/tmp/navet-controls-sv-remote-phone.png'});
  await page.keyboard.press('Escape');
  const group=page.locator('#locale-media');await group.getByRole('button',{name:'Kontroller',exact:true}).click();
  await expect(group.getByRole('region',{name:'Gruppera mediaspelare'})).toBeVisible();
  await expect(group.locator('navet-media-groups')).toContainText('Gruppmedlemskap rapporteras inte.');
  await expect(group.locator('navet-media-groups')).toContainText('Välj spelare uttryckligen.');
  await expect(group.getByRole('button',{name:'Lämna grupp',exact:true})).toBeEnabled();
  await page.evaluate(()=>{(window as any).localeCards.media.preview=true;});
  await expect(group.getByRole('button',{name:'Lämna grupp',exact:true})).toBeDisabled();
  await group.getByRole('button',{name:'Lämna grupp',exact:true}).dispatchEvent('click');
  await page.screenshot({path:'/tmp/navet-controls-sv-group-phone.png'});
  expect(await page.evaluate(()=>(window as any).localeCalls)).toEqual([]);
});
