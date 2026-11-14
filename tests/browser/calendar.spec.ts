import {test,expect} from '@playwright/test';
import {kitchenFixture} from '../fixtures/kitchen';
test.beforeEach(async({page})=>{
  await page.goto('/demo/index.html');
  await page.waitForFunction(()=>customElements.get('navet-calendar-card'));
  await page.evaluate(fixture=>{
    const w=window as any;w.calendarCalls=[];w.calendarEffects=[];
    const today=new Date().toISOString().slice(0,10);
    w.calendarHost={...fixture,config:{time_zone:'Europe/Stockholm'},states:{...fixture.states,'calendar.family':{entity_id:'calendar.family',state:'off',attributes:{friendly_name:'Family'}},'calendar.work':{entity_id:'calendar.work',state:'off',attributes:{friendly_name:'Work'}}},async callApi(method:string,path:string){w.calendarCalls.push([method,path]);if(path.includes('calendar.work')&&w.denyWork)throw {status:403};return [{uid:'lunch',summary:path.includes('calendar.work')?'Planning':'Family lunch',start:{dateTime:`${today}T12:00:00+02:00`},end:{dateTime:`${today}T13:00:00+02:00`},location:'Kitchen',description:'Bring food <script>unsafe</script>'},{uid:'holiday',summary:'Holiday',start:{date:today},end:{date:new Date(Date.parse(`${today}T12:00:00Z`)+86400000).toISOString().slice(0,10)}}];},async callService(...args:unknown[]){w.calendarEffects.push(args);}};
    w.mountCalendar=(options:unknown={},preview=false)=>{const card=document.createElement('navet-calendar-card') as any;card.id='calendar-card';card.preview=preview;card.setConfig({type:'custom:navet-calendar-card',calendar:{entities:['calendar.family'],...(options as object)}});card.hass=w.calendarHost;document.querySelector('main')!.prepend(card);w.calendarCard=card;return card;};
  },kitchenFixture);
});
test('multi-calendar agenda dedupes queries and keyboard details remain read-only on phone',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{const w=window as any;w.mountCalendar({entities:['calendar.family','calendar.work']});const second=w.mountCalendar({entities:['calendar.family']});second.id='calendar-copy';});
  const agenda=page.locator('#calendar-card navet-calendar');
  await expect(agenda.getByRole('button',{name:/Family lunch/})).toBeVisible();await expect(agenda.getByRole('button',{name:/Planning/})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).calendarCalls.length)).toBe(2);
  await agenda.getByRole('button',{name:/Family lunch/}).focus();await page.keyboard.press('Enter');
  const details=agenda.getByRole('dialog',{name:'Event details'});await expect(details).toBeVisible();await expect(details).toContainText('Bring food <script>unsafe</script>');expect(await details.locator('script').count()).toBe(0);await page.keyboard.press('Escape');await expect(details).not.toBeVisible();
  await expect(agenda.getByRole('button',{name:/Family lunch/})).toBeFocused();expect(await page.evaluate(()=>(window as any).calendarEffects)).toEqual([]);
  expect(await agenda.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);await page.locator('#calendar-card').screenshot({path:info.outputPath('calendar-phone.png')});
});
test('preview never fetches; independent failures preserve other calendars; filters and event actions work',async({page})=>{
  await page.evaluate(()=>{(window as any).mountCalendar({},true);});await expect(page.locator('#calendar-card navet-calendar')).toContainText('Calendar preview');expect(await page.evaluate(()=>(window as any).calendarCalls)).toEqual([]);
  await page.evaluate(()=>{const w=window as any;w.calendarCard.remove();w.denyWork=true;w.mountCalendar({entities:['calendar.family','calendar.work'],filter:'Family',limit:1,event_action:{action:'perform-action',perform_action:'light.turn_on',target:{entity_id:'light.kitchen_ceiling'}}});});
  const agenda=page.locator('#calendar-card navet-calendar');await expect(agenda.getByRole('button',{name:/Family lunch/})).toBeVisible();await expect(agenda).toContainText('Access denied');await expect(agenda.getByRole('button',{name:/Holiday/})).toHaveCount(0);
  await agenda.getByRole('button',{name:/Family lunch/}).click();await expect.poll(()=>page.evaluate(()=>(window as any).calendarEffects.length)).toBe(1);
});
test('visual calendar editor preserves unknown YAML and invalid drafts across common edits',async({page})=>{
  await page.evaluate(async()=>{const editor=document.createElement('navet-calendar-editor') as any;editor.id='calendar-editor';editor.hass=(window as any).calendarHost;editor.config={type:'custom:navet-calendar-card',calendar:{entities:['calendar.family'],future:{keep:true}}};editor.addEventListener('calendar-config-changed',(event:any)=>{(window as any).calendarEdited=event.detail.config;editor.config=event.detail.config;});document.querySelector('main')!.prepend(editor);});
  const editor=page.locator('#calendar-editor');await editor.getByLabel('Days to show').fill('3');await editor.getByLabel('Days to show').dispatchEvent('change');await editor.getByLabel('Filter text').fill('Kitchen');await editor.getByLabel('Filter text').dispatchEvent('change');
  expect(await page.evaluate(()=>(window as any).calendarEdited.calendar)).toMatchObject({entities:['calendar.family'],days:3,filter:'Kitchen',future:{keep:true}});
  await editor.getByLabel('Days to show').fill('0');await editor.getByLabel('Days to show').dispatchEvent('change');await expect(editor.getByRole('alert')).toBeVisible();
  await page.evaluate(()=>{const e=document.querySelector('#calendar-editor') as any;e.config={...(window as any).calendarEdited,name:'Agenda'};});await expect(editor.getByLabel('Days to show')).toHaveValue('0');
});
test('disconnect cancels pending responses and reconnect starts a fresh observation',async({page})=>{
  await page.evaluate(()=>{const w=window as any;w.calendarHost.callApi=async()=>{w.calendarCalls.push('pending');return new Promise(resolve=>w.resolveCalendar=resolve);};w.mountCalendar();});await expect.poll(()=>page.evaluate(()=>(window as any).calendarCalls.length)).toBe(1);
  await page.evaluate(()=>{const w=window as any;w.calendarCard.remove();w.resolveCalendar([]);});await page.evaluate(()=>{const w=window as any;document.querySelector('main')!.prepend(w.calendarCard);});await expect.poll(()=>page.evaluate(()=>(window as any).calendarCalls.length)).toBe(2);await page.evaluate(()=>{(window as any).calendarCard.remove();(window as any).resolveCalendar([]);});
});
