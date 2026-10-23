import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import type { CardConfig } from '../config';
import type { Hass } from '../providers/home-assistant';
import { calendarName,calendarTimeZone,calendarRevision,observeCalendar } from '../providers/calendar';
import { calendarWindow,selectEvents,type CalendarEvent } from '../data/calendar';
import type { DataObservation,DataSnapshot } from '../data/coordinator';

/** Read-only agenda. All host transport stays in the calendar provider. */
export class NavetCalendar extends LitElement {
  static properties={config:{attribute:false},hass:{attribute:false},preview:{type:Boolean},disabled:{type:Boolean}};
  config?:CardConfig;hass?:Hass;preview=false;disabled=false;
  private observations=new Map<string,DataObservation<CalendarEvent>>();
  private snapshots=new Map<string,DataSnapshot<CalendarEvent>>();
  private signature='';private host?:object;private hostService?:object;private observer?:IntersectionObserver;private inViewport=true;private timer?:ReturnType<typeof setTimeout>;private selected?:CalendarEvent;private returnFocus?:HTMLElement;
  private visibility=()=>this.sync();
  private reconnect=()=>{for(const observation of this.observations.values())observation.refresh({invalidate:true});};
  private language(){return this.hass?.locale?.language??this.hass?.language??'en';}
  private word(en:string,sv:string){return this.language().startsWith('sv')?sv:en;}
  static styles=css`
    :host{display:block;min-width:0;color:inherit;font:inherit}.heading{display:flex;align-items:center;justify-content:space-between;gap:8px}h2{font-size:16px;margin:0;overflow-wrap:anywhere}.events{display:grid;gap:6px;margin:12px 0 0;padding:0;list-style:none}button{box-sizing:border-box;min-height:44px;border:1px solid var(--divider-color,#8886);border-radius:10px;background:var(--control,var(--card-background-color,#fff));color:var(--text,inherit);font:inherit;cursor:pointer;padding:9px 12px}button:focus-visible{outline:2px solid var(--primary-color,#f97316);outline-offset:2px}button:disabled{cursor:default;opacity:.65}.event{width:100%;display:grid;gap:4px;text-align:left;overflow-wrap:anywhere}.meta,.status{font-size:12px;line-height:1.5;opacity:.8}.summary{font-weight:600}.status{margin:10px 0}.problem{color:var(--error-color,#b33);opacity:1}dialog{box-sizing:border-box;max-width:min(460px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid var(--divider-color,#777);border-radius:16px;padding:20px;background:var(--surface,var(--card-background-color,#fff));color:var(--text,var(--primary-text-color,#222));font:inherit}dialog::backdrop{background:#0008}dialog p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}dialog h2{margin-bottom:12px}.close{width:100%;margin-top:12px}
  `;
  connectedCallback(){super.connectedCallback();document.addEventListener('visibilitychange',this.visibility);window.addEventListener('online',this.reconnect);if(typeof IntersectionObserver!=='undefined'){this.observer=new IntersectionObserver(entries=>{this.inViewport=entries[0]?.isIntersecting??true;this.sync();});this.observer.observe(this);}this.requestUpdate();}
  disconnectedCallback(){this.observer?.disconnect();this.observer=undefined;document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('online',this.reconnect);this.release();super.disconnectedCallback();}
  protected updated(changed:PropertyValues){if(changed.has('config')||changed.has('hass')||changed.has('preview')){if(changed.has('config')||changed.has('preview'))this.close();this.sync();}}
  private release(){for(const observation of this.observations.values())observation.release();this.observations.clear();this.snapshots.clear();this.signature='';this.host=undefined;this.hostService=undefined;if(this.timer)clearTimeout(this.timer);this.timer=undefined;this.selected=undefined;}
  private sync(){
    if(!this.isConnected)return;
    if(this.timer)clearTimeout(this.timer);this.timer=undefined;
    const options=this.config?.calendar,hass=this.hass;
    if(this.preview||!hass||!options){this.release();this.requestUpdate();return;}
    const visible=this.inViewport&&document.visibilityState!=='hidden';
    const timeZone=calendarTimeZone(hass),window=calendarWindow(Date.now(),timeZone,options.days??7,options.offset_days??0);
    const host=(hass as Hass&{connection?:object}).connection??hass.callApi??hass.callService;
    const signature=JSON.stringify([options.entities,window,timeZone,options.entities.map(id=>calendarRevision(hass,id)),Boolean(hass.callApi)]);
    if(signature!==this.signature||host!==this.host||hass.callService!==this.hostService){
      this.release();this.signature=signature;this.host=host;this.hostService=hass.callService;
      for(const entity of new Set(options.entities)){
        const observation=observeCalendar(hass,{entity,...window,timeZone},snapshot=>{this.snapshots.set(entity,snapshot);this.requestUpdate();},{visible});this.observations.set(entity,observation);
      }
    }else for(const observation of this.observations.values())observation.setVisible(visible);
    if(visible)this.timer=setTimeout(()=>this.sync(),60000);
    this.requestUpdate();
  }
  private format(time:number,allDay=false){const locale=this.language(),timeZone=calendarTimeZone(this.hass);try{return new Intl.DateTimeFormat(locale,{timeZone,dateStyle:'medium',...(!allDay?{timeStyle:'short'}:{})}).format(time);}catch{return new Intl.DateTimeFormat('en',{timeZone,dateStyle:'medium',...(!allDay?{timeStyle:'short'}:{})}).format(time);}}
  private range(event:CalendarEvent){return event.allDay?`${this.format(event.start,true)} · ${this.word('All day','Hela dagen')}${event.startDate&&event.endDate&&event.endDate!==new Date(Date.parse(`${event.startDate}T12:00:00Z`)+86400000).toISOString().slice(0,10)?` – ${this.format(event.end-1,true)}`:''}`:`${this.format(event.start)} – ${this.format(event.end)}`;}
  private activate(event:CalendarEvent,target:HTMLElement){
    if(this.disabled||this.preview||!this.isConnected||!this.config?.calendar?.entities.includes(event.entity))return;
    const action=this.config.calendar.event_action;
    if(action){this.dispatchEvent(new CustomEvent('calendar-action',{detail:{entity:event.entity,action},bubbles:true,composed:true}));return;}
    this.selected=event;this.returnFocus=target;this.requestUpdate();void this.updateComplete.then(()=>{if(this.selected===event&&!this.preview&&this.isConnected)this.renderRoot.querySelector('dialog')?.showModal();});
  }
  private close(){const dialog=this.renderRoot.querySelector('dialog');if(dialog?.open)dialog.close();this.selected=undefined;this.returnFocus?.focus();this.returnFocus=undefined;}
  render(){
    const options=this.config?.calendar,events=selectEvents([...this.snapshots.values()].flatMap(s=>s.data),options?.filter,options?.limit??20),selected=this.selected;
    const statuses=[...this.snapshots].filter(([,snapshot])=>snapshot.status!=='ready'&&snapshot.status!=='empty');
    return html`<div class="heading"><h2>${this.config?.name??this.word('Calendar','Kalender')}</h2><button aria-label=${this.word('Refresh calendars','Uppdatera kalendrar')} ?disabled=${this.preview||this.disabled||!this.observations.size} @click=${()=>{for(const observation of this.observations.values())observation.refresh({invalidate:true});}}>${this.word('Refresh','Uppdatera')}</button></div>
      ${this.preview?html`<p class="status">${this.word('Calendar preview. Events load when saved.','Kalenderförhandsvisning. Händelser hämtas när kortet sparas.')}</p>`:nothing}
      ${!options?.entities.length?html`<p class="status">${this.word('Choose calendars in the visual editor.','Välj kalendrar i den visuella redigeraren.')}</p>`:nothing}
      ${statuses.map(([entity,snapshot])=>html`<p role="status" class=${`status ${snapshot.status==='loading'?'':'problem'}`}>${calendarName(this.hass,entity)} · ${this.status(snapshot)}${snapshot.stale?` · ${this.word('Showing saved events','Visar sparade händelser')}`:''}</p>`)}
      ${!events.length&&this.snapshots.size>0&&statuses.length===0?html`<p class="status">${this.word('No events in this date window.','Inga händelser inom datumintervallet.')}</p>`:nothing}
      <ol class="events">${events.map(event=>html`<li><button class="event" ?disabled=${this.disabled||this.preview} @click=${(click:Event)=>this.activate(event,click.currentTarget as HTMLElement)}><span class="summary">${event.summary}</span><span class="meta">${this.range(event)}</span><span class="meta">${calendarName(this.hass,event.entity)}${options?.show_location!==false&&event.location?` · ${event.location}`:''}</span></button></li>`)}</ol>
      <dialog aria-label=${this.word('Event details','Händelsedetaljer')} @cancel=${()=>{this.selected=undefined;this.returnFocus?.focus();}} @close=${()=>{this.selected=undefined;this.returnFocus?.focus();}}>${selected?html`<h2>${selected.summary}</h2><p>${this.range(selected)}</p><p>${calendarName(this.hass,selected.entity)}</p>${selected.location?html`<p>${selected.location}</p>`:nothing}${selected.description?html`<p>${selected.description}</p>`:nothing}`:nothing}<button class="close" @click=${()=>{this.close();this.requestUpdate();}}>${this.word('Close','Stäng')}</button></dialog>`;
  }
  private status(snapshot:DataSnapshot<CalendarEvent>){switch(snapshot.status){case'loading':return this.word('Loading events…','Hämtar händelser…');case'denied':return this.word('Access denied','Åtkomst nekad');case'offline':return this.word('Calendar unavailable','Kalendern är inte tillgänglig');case'unsupported':return this.word('Calendar API unavailable','Kalender-API saknas');default:return this.word('Could not load events. Try Refresh.','Kunde inte hämta händelser. Försök uppdatera.');}}
}
if(!customElements.get('navet-calendar'))customElements.define('navet-calendar',NavetCalendar);
