/** Provider-neutral calendar data. End boundaries are exclusive. */
export interface CalendarEvent {
  readonly id: string;
  readonly entity: string;
  readonly summary: string;
  readonly start: number;
  readonly end: number;
  readonly allDay: boolean;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly description?: string;
  readonly location?: string;
}
export interface CalendarQuery { entity: string; start: number; end: number; timeZone: string }
export function validTimeZone(value?: string): string {
  try { if(value){new Intl.DateTimeFormat('en',{timeZone:value}).format();return value;} } catch { /* Invalid host timezone: use browser timezone. */ }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
export function localDate(time: number,timeZone: string): string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(time);
  const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function shiftDate(date:string,days:number):string { return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10); }
/** Resolve a wall-clock midnight without assuming a day is 24 hours across DST. */
export function dateStart(date:string,timeZone:string):number {
  const target=Date.parse(`${date}T00:00:00Z`);
  let result=target;
  const format=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let index=0;index<4;index++){
    const parts=format.formatToParts(result);const value=(type:string)=>Number(parts.find(p=>p.type===type)!.value);
    const wall=Date.UTC(value('year'),value('month')-1,value('day'),value('hour'),value('minute'),value('second'));
    const delta=target-wall;if(!delta)break;result+=delta;
  }
  return result;
}
export function calendarWindow(now:number,timeZone:string,days=7,offset=0):{start:number;end:number} {
  const first=shiftDate(localDate(now,timeZone),offset);
  return {start:dateStart(first,timeZone),end:dateStart(shiftDate(first,days),timeZone)};
}
export function selectEvents(events:readonly CalendarEvent[],filter='',limit=20):CalendarEvent[] {
  const needle=filter.trim().toLocaleLowerCase();
  return events.filter(event=>!needle||`${event.summary}\n${event.description??''}\n${event.location??''}`.toLocaleLowerCase().includes(needle))
    .sort((a,b)=>a.start-b.start||Number(b.allDay)-Number(a.allDay)||a.summary.localeCompare(b.summary)||a.id.localeCompare(b.id)).slice(0,limit);
}
export interface CalendarConfig {
  entities: string[];
  days?: number;
  offset_days?: number;
  limit?: number;
  filter?: string;
  show_location?: boolean;
  event_action?: import('../config').ActionConfig;
  [key:string]:unknown;
}
