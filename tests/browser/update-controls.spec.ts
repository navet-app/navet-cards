import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.goto('/demo/index.html');await page.waitForFunction(()=>customElements.get('navet-update-card'));
 await page.evaluate(()=>{
  const w=window as any;w.updateCalls=[];w.updateConfirmations=[];
  w.updateHost={states:{'update.router':{entity_id:'update.router',state:'on',attributes:{friendly_name:'Router software',supported_features:5,installed_version:'1.0',latest_version:'2.0',in_progress:false,auto_update:false,release_summary:'<strong>Literal release summary</strong>',release_url:'https://example.com/releases'}}},async callService(...args:unknown[]){w.updateCalls.push(args);}};
  const card=document.createElement('navet-update-card') as any;card.id='update-under-test';card.setConfig({type:'custom:navet-update-card',entity:'update.router'});card.hass=w.updateHost;document.querySelector('main')!.append(card);w.updateCard=card;
  w.confirm=(message:string)=>{w.updateConfirmations.push(message);return false;};
 });
});
test('update controls are explicit, literal and require confirmation before simulated installation',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 const card=page.locator('#update-under-test');await card.getByRole('button',{name:'Controls',exact:true}).click();
 const widget=card.locator('navet-update-controls');
 await expect(widget).toContainText('1.0');await expect(widget).toContainText('2.0');
 await expect(widget.locator('strong')).toHaveCount(0);await expect(widget).toContainText('<strong>Literal release summary</strong>');
 await expect(widget.getByRole('link',{name:'Release page'})).toHaveAttribute('rel','noopener noreferrer');
 expect(await page.evaluate(()=>(window as any).updateCalls)).toEqual([]);
 await widget.getByRole('button',{name:'Install latest',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).updateCalls)).toEqual([]);
 expect(await page.evaluate(()=>(window as any).updateConfirmations)).toHaveLength(1);
 await page.evaluate(()=>{const w=window as any;w.confirm=(message:string)=>{w.updateConfirmations.push(message);return true;};});
 await widget.getByRole('button',{name:'Install latest',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).updateCalls)).toEqual([['update','install',{}, {entity_id:'update.router'}]]);
 expect(await page.evaluate(()=>(window as any).updateConfirmations[1])).toContain('2.0');
 expect(await card.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await card.getByRole('dialog').screenshot({path:info.outputPath('update-controls-phone.png')});
});
test('update skip/clear and numeric minimum-version progress respect current state',async({page})=>{
 const card=page.locator('#update-under-test');await card.getByRole('button',{name:'Controls',exact:true}).click();
 const widget=card.locator('navet-update-controls');
 await widget.getByRole('button',{name:'Skip version',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).updateCalls)).toEqual([['update','skip',{}, {entity_id:'update.router'}]]);
 await page.evaluate(()=>{const w=window as any;const raw=w.updateHost.states['update.router'];w.updateHost={...w.updateHost,states:{'update.router':{...raw,state:'off',attributes:{...raw.attributes,skipped_version:'2.0'}}}};w.updateCard.hass=w.updateHost;});
 await widget.getByRole('button',{name:'Clear skipped',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).updateCalls.at(-1))).toEqual(['update','clear_skipped',{}, {entity_id:'update.router'}]);
 await page.evaluate(()=>{const w=window as any;const raw=w.updateHost.states['update.router'];w.updateHost={...w.updateHost,states:{'update.router':{...raw,attributes:{...raw.attributes,in_progress:0}}}};w.updateCard.hass=w.updateHost;});
 await expect(widget.getByRole('status')).toContainText('Installing · 0%');
 await expect(widget.getByRole('progressbar')).toHaveAttribute('value','0');
 await expect(widget.getByRole('button')).toHaveCount(0);
});
test('preview blocks update commands and links; offered-version changes during confirmation abort installation',async({page})=>{
 const card=page.locator('#update-under-test');await card.getByRole('button',{name:'Controls',exact:true}).click();
 const widget=card.locator('navet-update-controls');
 await page.evaluate(()=>{(window as any).updateCard.preview=true;});
 await expect(widget.getByRole('button',{name:'Install latest',exact:true})).toBeDisabled();
 await expect(widget.locator('a')).not.toHaveAttribute('href');
 await widget.getByRole('button',{name:'Install latest',exact:true}).dispatchEvent('click');
 expect(await page.evaluate(()=>(window as any).updateConfirmations)).toEqual([]);
 await page.evaluate(()=>{const w=window as any;w.updateCard.preview=false;w.confirm=()=>{const raw=w.updateHost.states['update.router'];w.updateHost.states['update.router']={...raw,attributes:{...raw.attributes,latest_version:'3.0'}};return true;};});
 await widget.getByRole('button',{name:'Install latest',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).updateCalls)).toEqual([]);
 await expect(card).toContainText(/changed|latest/i);
});
