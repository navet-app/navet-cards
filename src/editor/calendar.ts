import { LitElement,html,css,nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { validateConfig,type CardConfig } from '../config';
import type { CalendarConfig } from '../data/calendar';
import type { Hass } from '../providers/home-assistant';
import './action-field';
export class NavetCalendarEditor extends LitElement {
  static properties={hass:{attribute:false}};hass?:Hass;
  private external?:CardConfig;private draft?:CardConfig;private error='';
  get config(){return this.external;}
  set config(value:CardConfig|undefined){if(value===this.external)return;const local=this.draft,preserve=value&&local&&this.external&&JSON.stringify(value.calendar)===JSON.stringify(this.external.calendar);this.external=value;this.draft=value?structuredClone(value):undefined;if(preserve&&this.draft)this.draft.calendar=structuredClone(local.calendar);if(!preserve)this.error='';this.requestUpdate();}
  static styles=css`:host{display:block;font:inherit;color:inherit}.fields{display:grid;gap:12px}label{display:grid;gap:5px;font-size:13px}input,select,button{box-sizing:border-box;min-height:44px;border:1px solid var(--divider-color,#888);border-radius:8px;background:var(--card-background-color,#fff);color:inherit;font:inherit;padding:8px;max-width:100%}select{width:100%}.entity{display:flex;align-items:center;gap:8px}.entity input,.check input{width:20px;min-height:20px}.check{display:flex;align-items:center;gap:8px}p{font-size:12px;line-height:1.5}.error{color:var(--error-color,#b33)}`;
  private word(en:string,sv:string){return (this.hass?.locale?.language??this.hass?.language??'en').startsWith('sv')?sv:en;}
  private field(key:keyof CalendarConfig,value:unknown){const next=structuredClone(this.draft!);next.calendar??={entities:[]};if(value===undefined||value==='')delete next.calendar[key];else next.calendar[key]=value as never;this.draft=next;try{const config=validateConfig(next,'calendar');this.error='';this.dispatchEvent(new CustomEvent('calendar-config-changed',{detail:{config},bubbles:true,composed:true}));}catch(error){this.error=(error as Error).message;}this.requestUpdate();}
  render(){const c=this.draft?.calendar??{entities:[]};if(!this.draft)return nothing;const entities=[...new Set([...c.entities,...Object.keys(this.hass?.states??{}).filter(id=>id.startsWith('calendar.'))])];
    return html`<div class="fields">
      ${customElements.get('ha-form')?html`<ha-form .hass=${this.hass} .data=${{entities:c.entities}} .schema=${[{name:'entities',selector:{entity:{domain:'calendar',multiple:true}}}]} .computeLabel=${()=>this.word('Calendars','Kalendrar')} @value-changed=${(event:CustomEvent)=>{event.stopPropagation();this.field('entities',event.detail.value.entities??[]);}}></ha-form>`:html`<fieldset><legend>${this.word('Calendars','Kalendrar')}</legend>${entities.map(id=>html`<label class="entity"><input type="checkbox" .checked=${c.entities.includes(id)} @change=${(event:Event)=>this.field('entities',(event.target as HTMLInputElement).checked?[...c.entities,id]:c.entities.filter(entity=>entity!==id))}>${this.hass?.states[id]?.attributes.friendly_name??id} · ${id}</label>`)}${!entities.length?html`<p>${this.word('No calendar entities available. Add a calendar integration first.','Inga kalenderentiteter finns. Lägg till en kalenderintegration först.')}</p>`:nothing}</fieldset>`}
      <label>${this.word('Days to show','Antal dagar')}<input type="number" min="1" max="366" .value=${live(String(c.days??7))} @change=${(event:Event)=>this.field('days',Number((event.target as HTMLInputElement).value))}></label>
      <label>${this.word('Start offset (days)','Startförskjutning (dagar)')}<input type="number" min="-366" max="366" .value=${live(String(c.offset_days??0))} @change=${(event:Event)=>this.field('offset_days',Number((event.target as HTMLInputElement).value))}></label>
      <label>${this.word('Maximum events','Högsta antal händelser')}<input type="number" min="1" max="200" .value=${live(String(c.limit??20))} @change=${(event:Event)=>this.field('limit',Number((event.target as HTMLInputElement).value))}></label>
      <label>${this.word('Filter text','Filtertext')}<input .value=${live(c.filter??'')} @change=${(event:Event)=>this.field('filter',(event.target as HTMLInputElement).value)}></label>
      <label class="check"><input type="checkbox" .checked=${c.show_location!==false} @change=${(event:Event)=>this.field('show_location',(event.target as HTMLInputElement).checked)}>${this.word('Show event location','Visa händelsens plats')}</label>
      <p>${this.word('Dates follow your Home Assistant timezone. All-day end dates are exclusive. Event details are read-only by default.','Datum följer din Home Assistant-tidszon. Slutdatum för heldagshändelser är exklusiva. Händelsedetaljer är skrivskyddade som standard.')}</p>
      <navet-action-field .hass=${this.hass} .value=${c.event_action??{action:'none'}} label=${this.word('Event action (optional)','Händelseåtgärd (valfri)')} .allowToggle=${false} @value-changed=${(event:CustomEvent)=>{event.stopPropagation();this.field('event_action',event.detail.value?.action==='none'?undefined:event.detail.value);}}></navet-action-field>
      ${this.error?html`<p class="error" role="alert">${this.error}</p>`:nothing}</div>`;
  }
}
if(!customElements.get('navet-calendar-editor'))customElements.define('navet-calendar-editor',NavetCalendarEditor);
