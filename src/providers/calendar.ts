import { DataCoordinator, type DataObservation, type DataSnapshot, type ObserveOptions } from '../data/coordinator';
import { dateStart, validTimeZone, type CalendarEvent, type CalendarQuery } from '../data/calendar';
import type { Hass } from './home-assistant';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
function endpoint(value:unknown,timeZone:string):{time:number;date?:string}|undefined {
  if(!object(value))return;
  if(typeof value.date==='string'&&datePattern.test(value.date)&&Number.isFinite(Date.parse(`${value.date}T00:00:00Z`))&&new Date(`${value.date}T00:00:00Z`).toISOString().slice(0,10)===value.date)return {time:dateStart(value.date,timeZone),date:value.date};
  // Offsets are mandatory: never interpret an event in the browser's timezone.
  if(typeof value.dateTime==='string'&&/(?:Z|[+-]\d\d:\d\d)$/i.test(value.dateTime)){const time=Date.parse(value.dateTime);if(Number.isFinite(time))return {time};}
}
export function normalizeCalendar(value:unknown,query:CalendarQuery):CalendarEvent[] {
  return (Array.isArray(value)?value:[]).flatMap((row,index)=>{
    if(!object(row)||typeof row.summary!=='string')return [];
    const start=endpoint(row.start,query.timeZone),end=endpoint(row.end,query.timeZone);
    if(!start||!end||Boolean(start.date)!==Boolean(end.date)||end.time<start.time||end.time<=query.start||start.time>=query.end)return [];
    return [{id:`${query.entity}:${String(row.uid??index)}:${start.time}`,entity:query.entity,summary:row.summary,start:start.time,end:end.time,allDay:!!start.date,startDate:start.date,endDate:end.date,description:typeof row.description==='string'?row.description:undefined,location:typeof row.location==='string'?row.location:undefined}];
  });
}
export function calendarTimeZone(hass?:Hass):string {return validTimeZone((hass?.config as {time_zone?:string}|undefined)?.time_zone);}
export function calendarRevision(hass:Hass,entity:string):string { const state=hass.states[entity];return JSON.stringify([state?.state,state?.last_updated,state?.attributes]); }
export function calendarName(hass:Hass|undefined,entity:string):string {const name=hass?.states[entity]?.attributes.friendly_name;return typeof name==='string'?name:entity;}
export async function calendarEvents(hass:Hass,query:CalendarQuery):Promise<CalendarEvent[]|null> {
  if(!hass.callApi)return null;
  if(!query.entity.startsWith('calendar.')||!hass.states[query.entity])throw {code:'not_found',message:'Calendar entity is missing'};
  if(['unavailable','unknown'].includes(hass.states[query.entity].state))throw {code:'offline',message:'Calendar is unavailable'};
  const path=`calendars/${encodeURIComponent(query.entity)}?start=${encodeURIComponent(new Date(query.start).toISOString())}&end=${encodeURIComponent(new Date(query.end).toISOString())}`;
  const response=await hass.callApi<unknown>('GET',path);
  if(!Array.isArray(response))throw new Error('Invalid calendar response');
  return normalizeCalendar(response,query);
}
const coordinator=new DataCoordinator();
const scopes=new WeakMap<object,WeakMap<object,object>>();
function scope(hass:Hass):object {
  const connection=(hass as Hass&{connection?:object}).connection;if(connection)return connection;
  let transports=scopes.get(hass.callService);if(!transports)scopes.set(hass.callService,transports=new WeakMap());
  const transport=hass.callApi??hass.callService;let value=transports.get(transport);if(!value)transports.set(transport,value={});return value;
}
export function observeCalendar(hass:Hass,query:CalendarQuery,listener:(snapshot:DataSnapshot<CalendarEvent>)=>void,options:ObserveOptions={}):DataObservation<CalendarEvent> {
  const state=hass.states[query.entity]?.state;const support=Boolean(hass.callApi);const unavailable=state===undefined||state==='unknown'||state==='unavailable';
  const key=JSON.stringify([query.entity,query.start,query.end,query.timeZone,support,unavailable,calendarRevision(hass,query.entity)]);
  return coordinator.observe(scope(hass),key,()=>calendarEvents(hass,query),listener,{freshnessMs:300000,refreshMs:300000,...options});
}
