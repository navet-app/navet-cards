import { expect, test, type Locator } from '@playwright/test';

async function seek(input: Locator, value: number, event = 'change') {
  await input.evaluate((el: HTMLInputElement, next) => { el.value = String(next); }, value);
  await input.dispatchEvent(event);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForFunction(() => (window as any).cards?.length === 7);
  await page.evaluate(() => {
    const w = window as any;
    const state = (id: string, features = 2|128|256|32768|262144) => ({entity_id:id,state:'playing',attributes:{friendly_name:id.endsWith('row')?'Row player':'Dining player',supported_features:features,media_duration:300,media_position:40,media_position_updated_at:'2026-10-20T10:00:00Z',repeat:'off',shuffle:false}});
    w.mediaCalls=[]; w.mediaFailure=false;
    w.mediaHost={language:'en',states:{'media_player.dining':state('media_player.dining'),'media_player.row':state('media_player.row'),'media_player.unsupported':state('media_player.unsupported',0)},
      async callService(domain:string,service:string,data:Record<string,unknown>,target:{entity_id:string}) {
        if(w.mediaFailure){w.mediaFailure=false;throw new Error('Media command denied.');}
        w.mediaCalls.push({domain,service,data,target});
        const old=w.mediaHost.states[target.entity_id], attributes={...old.attributes};
        if(service==='media_seek')attributes.media_position=data.seek_position;
        if(service==='repeat_set')attributes.repeat=data.repeat;
        if(service==='shuffle_set')attributes.shuffle=data.shuffle;
        w.mediaHost={...w.mediaHost,states:{...w.mediaHost.states,[target.entity_id]:{...old,state:service==='turn_off'?'off':service==='turn_on'?'idle':old.state,attributes}}};w.mediaSync();
      },
    };
    const configs=[{type:'custom:navet-media-card',entity:'media_player.dining'},{type:'custom:navet-room-card',name:'Dining media',entities:['media_player.dining','media_player.row']},{type:'custom:navet-media-card',entity:'media_player.row',layout:'row'},{type:'custom:navet-media-card',entity:'media_player.unsupported'}];
    const main=document.querySelector('main')!;main.replaceChildren();main.setAttribute('style','max-width:400px;padding:16px;display:grid;gap:16px');
    w.mediaCards=configs.map((config,i)=>{const card=document.createElement(config.type.replace('custom:','')) as any;card.id=`media-${i}`;card.setConfig(config);card.hass=w.mediaHost;main.append(card);return card;});
    w.mediaSync=()=>w.mediaCards.forEach((card:any)=>{card.hass=w.mediaHost;});
    w.mediaPatch=(id:string,state:string|undefined,attributes:Record<string,unknown>)=>{const old=w.mediaHost.states[id];w.mediaHost={...w.mediaHost,states:{...w.mediaHost.states,[id]:{...old,state:state??old.state,attributes:{...old.attributes,...attributes}}}};w.mediaSync();};
  });
});

test('native media modal commits advertised options, contains errors and restores focus', async ({ page }) => {
  const card=page.locator('#media-0'), opener=card.getByRole('button',{name:'Controls',exact:true});
  await expect(page.locator('#media-3').getByRole('button',{name:'Controls',exact:true})).toHaveCount(0);
  await opener.click();
  await seek(card.getByRole('slider',{name:'Playback position'}),125);
  await card.getByRole('combobox',{name:'Repeat',exact:true}).selectOption('one');
  await card.getByRole('combobox',{name:'Shuffle',exact:true}).selectOption('true');
  await page.evaluate(()=>{(window as any).mediaFailure=true;});
  await card.getByRole('button',{name:'Power off',exact:true}).click();
  await expect(card.getByRole('dialog').getByRole('alert')).toHaveText('Media command denied.');
  await card.getByRole('button',{name:'Power off',exact:true}).click();
  await expect(card.getByRole('slider',{name:'Playback position'})).toBeDisabled();
  await card.getByRole('button',{name:'Power on',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).mediaCalls)).toEqual([
    {domain:'media_player',service:'media_seek',data:{seek_position:125},target:{entity_id:'media_player.dining'}},
    {domain:'media_player',service:'repeat_set',data:{repeat:'one'},target:{entity_id:'media_player.dining'}},
    {domain:'media_player',service:'shuffle_set',data:{shuffle:true},target:{entity_id:'media_player.dining'}},
    {domain:'media_player',service:'turn_off',data:{},target:{entity_id:'media_player.dining'}},
    {domain:'media_player',service:'turn_on',data:{},target:{entity_id:'media_player.dining'}},
  ]);
  await page.keyboard.press('Escape');await expect(card.getByRole('dialog')).toHaveCount(0);await expect(opener).toBeFocused();
  await expect(card.locator('navet-media-options')).toHaveCount(0);
});

test('seek previews and pointer cancellation send nothing until a subsequent committed gesture', async ({ page }) => {
  const card=page.locator('#media-0');await card.getByRole('button',{name:'Controls',exact:true}).click();
  const slider=card.getByRole('slider',{name:'Playback position'});
  await slider.dispatchEvent('pointerdown');await seek(slider,140,'input');
  expect(await page.evaluate(()=>(window as any).mediaCalls)).toEqual([]);
  await slider.dispatchEvent('pointercancel');await seek(slider,140);
  await expect(slider).toHaveValue('40');
  expect(await page.evaluate(()=>(window as any).mediaCalls)).toEqual([]);
  await slider.dispatchEvent('keydown',{key:'ArrowRight'});await seek(slider,41);
  await expect(slider).toHaveValue('41');
  expect(await page.evaluate(()=>(window as any).mediaCalls)).toEqual([{domain:'media_player',service:'media_seek',data:{seek_position:41},target:{entity_id:'media_player.dining'}}]);
});

test('unknown, preview, unavailable and off values block synthetic playback commands honestly', async ({ page }) => {
  const card=page.locator('#media-0');await card.getByRole('button',{name:'Controls',exact:true}).click();
  await page.evaluate(()=>{(window as any).mediaPatch('media_player.dining',undefined,{media_position:undefined,repeat:undefined,shuffle:undefined});});
  const slider=card.getByRole('slider',{name:'Playback position'}), repeat=card.getByRole('combobox',{name:'Repeat',exact:true}), shuffle=card.getByRole('combobox',{name:'Shuffle',exact:true});
  await expect(slider).toBeDisabled();await expect(repeat).toHaveValue('');await expect(shuffle).toHaveValue('');
  await expect(card.locator('navet-media-options')).toContainText('Position or duration is not reported.');
  await seek(slider,100);
  await page.evaluate(()=>{const w=window as any;w.mediaPatch('media_player.dining','off',{media_position:40});});
  await expect(repeat).toBeDisabled();await expect(shuffle).toBeDisabled();
  await repeat.evaluate((el:HTMLSelectElement)=>{el.value='all';el.dispatchEvent(new Event('change'));});
  await shuffle.evaluate((el:HTMLSelectElement)=>{el.value='true';el.dispatchEvent(new Event('change'));});
  await page.evaluate(()=>{const w=window as any;w.mediaPatch('media_player.dining','playing',{});w.mediaCards[0].preview=true;});
  await expect(card.getByRole('button',{name:'Power on',exact:true})).toBeDisabled();
  await card.getByRole('button',{name:'Power on',exact:true}).dispatchEvent('click');
  await page.evaluate(()=>{const w=window as any;w.mediaCards[0].preview=false;w.mediaPatch('media_player.dining','unavailable',{});});
  await expect(repeat).toBeDisabled();await seek(slider,100);
  expect(await page.evaluate(()=>(window as any).mediaCalls)).toEqual([]);
});

test('phone room and row controls keep the owning player and release closed widgets', async ({ page }, info) => {
  await page.setViewportSize({width:390,height:844});
  const room=page.locator('#media-1');await room.getByRole('button',{name:'Controls',exact:true}).click();
  const dining=room.locator('.room-control').filter({has:page.getByRole('button',{name:/Dining player/})}), rowMember=room.locator('.room-control').filter({has:page.getByRole('button',{name:/Row player/})});
  await dining.getByRole('combobox',{name:'Repeat',exact:true}).selectOption('all');
  await rowMember.getByRole('combobox',{name:'Shuffle',exact:true}).selectOption('true');
  expect(await room.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  const screenshot=info.outputPath('phone-media-options.png');
  await room.getByRole('dialog').screenshot({path:screenshot});
  await info.attach('phone-media-options.png',{path:screenshot,contentType:'image/png'});
  await page.keyboard.press('Escape');await expect(room.locator('navet-media-options')).toHaveCount(0);
  const row=page.locator('#media-2');await row.getByText('Controls',{exact:true}).click();
  await seek(row.getByRole('slider',{name:'Playback position'}),90);
  expect(await page.evaluate(()=>(window as any).mediaCalls)).toEqual([
    {domain:'media_player',service:'repeat_set',data:{repeat:'all'},target:{entity_id:'media_player.dining'}},
    {domain:'media_player',service:'shuffle_set',data:{shuffle:true},target:{entity_id:'media_player.row'}},
    {domain:'media_player',service:'media_seek',data:{seek_position:90},target:{entity_id:'media_player.row'}},
  ]);
  await row.getByText('Controls',{exact:true}).click();await expect(row.locator('navet-media-options')).toHaveCount(0);
});
