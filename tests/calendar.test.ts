import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarWindow,dateStart,selectEvents} from '../src/data/calendar';
import {calendarEvents,normalizeCalendar,observeCalendar} from '../src/providers/calendar';
import type {Hass} from '../src/providers/home-assistant';
const zone='Europe/Stockholm';
const query={entity:'calendar.family',start:Date.parse('2026-10-20T00:00:00Z'),end:Date.parse('2026-10-27T00:00:00Z'),timeZone:zone};
const rows=[{summary:'Family lunch',start:{dateTime:'2026-10-20T12:00:00+02:00'},end:{dateTime:'2026-10-20T13:00:00+02:00'},description:'Bring food',location:'Kitchen'},{summary:'Holiday',start:{date:'2026-10-25'},end:{date:'2026-10-26'}}];
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function host(response:unknown=rows):Hass{return {config:{time_zone:zone},states:{'calendar.family':{entity_id:'calendar.family',state:'off',attributes:{friendly_name:'Family'}}},async callService(){},async callApi<T>(){return response as T;}};}
test('calendar day windows follow host timezone across both DST changes',()=>{
  assert.equal(dateStart('2026-03-29',zone),Date.parse('2026-03-28T23:00:00Z'));
  const spring=calendarWindow(Date.parse('2026-03-29T10:00:00Z'),zone,1);assert.equal(spring.end-spring.start,23*3600000);
  const autumn=calendarWindow(Date.parse('2026-10-25T10:00:00Z'),zone,1);assert.equal(autumn.end-autumn.start,25*3600000);
  assert.equal(calendarWindow(Date.parse('2026-10-25T23:30:00Z'),zone,1).start,Date.parse('2026-10-25T23:00:00Z'));
  assert.equal(calendarWindow(Date.parse('2026-10-25T10:00:00Z'),zone,1,-1).start,Date.parse('2026-10-23T22:00:00Z'));
});
test('calendar normalizes offsets and exclusive all-day dates, rejects malformed and outside events',()=>{
  const events=normalizeCalendar([...rows,{summary:'Naive',start:{dateTime:'2026-10-20T10:00:00'},end:{dateTime:'2026-10-20T11:00:00'}},{summary:'Bad',start:{date:'2026-99-99'},end:{date:'2026-99-99'}},{summary:'Outside',start:{date:'2026-10-28'},end:{date:'2026-10-29'}},{summary:'Backwards',start:{date:'2026-10-22'},end:{date:'2026-10-21'}}],query);
  assert.equal(events.length,2);assert.equal(events[0].start,Date.parse('2026-10-20T10:00:00Z'));assert.equal(events[0].location,'Kitchen');assert.equal(events[1].end-events[1].start,25*3600000);assert.equal(events[1].endDate,'2026-10-26');
  assert.equal(selectEvents(events,'kitchen',1)[0].summary,'Family lunch');assert.deepEqual(selectEvents(events,'nonexistent'),[]);
});
test('calendar REST path encodes explicit exclusive range and rejects missing/offline/invalid response',async()=>{
  const hass=host();const calls:unknown[]=[];hass.callApi=async<T>(...args:unknown[])=>{calls.push(args);return rows as T;};
  assert.equal((await calendarEvents(hass,query))?.length,2);assert.deepEqual(calls,[['GET','calendars/calendar.family?start=2026-10-20T00%3A00%3A00.000Z&end=2026-10-27T00%3A00%3A00.000Z']]);
  await assert.rejects(calendarEvents({...hass,states:{}},query));hass.states['calendar.family'].state='unavailable';await assert.rejects(calendarEvents(hass,query));assert.equal(calls.length,1);
  assert.equal(await calendarEvents({...host(),callApi:undefined},query),null);await assert.rejects(calendarEvents(host({events:rows}),query),/Invalid calendar response/);
});
test('calendar observations share host queries across state replacements and release ignores stale results',async()=>{
  let calls=0;let resolve!:(value:unknown)=>void;const hass=host();hass.callApi=async<T>()=>{calls++;return await new Promise<unknown>(done=>{resolve=done;}) as T;};
  const a=observeCalendar(hass,query,()=>{}),b=observeCalendar({...hass,states:{...hass.states}},query,()=>{});await flush();assert.equal(calls,1);
  a.release();b.release();resolve(rows);await flush();assert.equal(b.snapshot.status,'loading');
  const c=observeCalendar(hass,query,()=>{});await flush();assert.equal(calls,2);resolve(rows);await flush();assert.equal(c.snapshot.status,'ready');
  const d=observeCalendar({...hass,callApi:async<T>()=>[] as T},query,()=>{});await flush();assert.equal(d.snapshot.status,'empty');assert.equal(c.snapshot.data.length,2);c.release();d.release();
});
test('hidden calendar observations perform no request until visible and expose permissions honestly',async()=>{
  let calls=0;const hass=host();hass.callApi=async()=>{calls++;throw {status:403};};const observation=observeCalendar(hass,query,()=>{},{visible:false});await flush();assert.equal(calls,0);observation.setVisible(true);await flush();assert.equal(calls,1);assert.equal(observation.snapshot.status,'denied');observation.setVisible(false);observation.release();
});
test('unchanged on/off edits invalidate calendar queries; host service replacement isolates snapshots',async()=>{
  let calls=0;const hass=host();hass.callApi=async<T>()=>{calls++;return rows as T;};
  const first=observeCalendar(hass,query,()=>{});await flush();assert.equal(calls,1);
  const changed={...hass,states:{...hass.states,'calendar.family':{...hass.states['calendar.family'],last_updated:'2026-10-20T10:00:00Z',attributes:{...hass.states['calendar.family'].attributes,message:'New event'}}}};
  const second=observeCalendar(changed,query,()=>{});await flush();assert.equal(calls,2);
  const isolated=observeCalendar({...changed,async callService(){}},query,()=>{});await flush();assert.equal(calls,3);first.release();second.release();isolated.release();
});
