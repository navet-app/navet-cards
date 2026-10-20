import { LitElement, html, css, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { validateConfig, type CardConfig, type ChipConfig } from '../config';
import type { Hass } from '../providers/home-assistant';
import './action-field';
import './condition-field';

/** Stable-ID list editor. Invalid action drafts remain local until the whole card validates. */
export class NavetChipsEditor extends LitElement {
  static properties={hass:{attribute:false}};
  hass?:Hass;
  private external?:CardConfig;
  private draft?:CardConfig;
  private error='';
  get config(){return this.external;}
  set config(value:CardConfig|undefined){
    if(value===this.external)return;
    const keys=['chips','title','subtitle'] as const;
    const signature=(config?:CardConfig)=>JSON.stringify(keys.map(key=>config?.[key]));
    const local=this.draft;
    const preserve=value&&local&&this.external&&signature(value)===signature(this.external);
    this.external=value;this.draft=value?structuredClone(value):undefined;
    if(preserve&&this.draft)for(const key of keys){if(Object.hasOwn(local,key))Object.defineProperty(this.draft,key,{value:structuredClone(local[key]),enumerable:true,writable:true,configurable:true});else delete this.draft[key];}
    if(!preserve)this.error='';this.requestUpdate();
  }
  static styles=css`
    :host{display:block;min-width:0;color:inherit;font:inherit}.fields,.item{display:grid;gap:10px;min-width:0}.item{border:1px solid var(--divider-color,#aaa);border-radius:12px;padding:12px}label{display:grid;gap:5px;font-size:13px;min-width:0}input,select,button{box-sizing:border-box;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;min-height:44px;padding:8px;max-width:100%}input,select{width:100%;min-width:0}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}.check{display:flex;gap:8px;align-items:center}.check input{width:20px;min-height:20px}.buttons{display:flex;flex-wrap:wrap;gap:6px}.buttons button{flex:1}details{border:1px solid var(--divider-color,#aaa);border-radius:10px;padding:10px;min-width:0}summary{cursor:pointer}p{font-size:12px;line-height:1.5}.error{color:var(--error-color,#b33)}
  `;
  private commit(next:CardConfig){
    this.draft=next;
    try{const config=validateConfig(next,'chips');this.error='';this.dispatchEvent(new CustomEvent('chips-config-changed',{detail:{config},bubbles:true,composed:true}));}
    catch(error){this.error=(error as Error).message;}this.requestUpdate();
  }
  private field(index:number,key:keyof ChipConfig,value:unknown){
    const next=structuredClone(this.draft!);const chip=next.chips![index];
    if(value===undefined||value==='')delete chip[key];else chip[key]=value as never;
    this.commit(next);
  }
  private updateTitle(key:'title'|'subtitle',event:Event){const next=structuredClone(this.draft!);const value=(event.target as HTMLInputElement).value;if(value)next[key]=value;else delete next[key];this.commit(next);}
  private add(type: 'entity'|'action'|'separator'|'spacer'='entity'){
    const next=structuredClone(this.draft!);const chips=next.chips??[];let number=chips.length+1;while(chips.some(chip=>chip.id===`chip-${number}`))number++;
    const entity=Object.keys(this.hass?.states??{})[0];
    next.chips=[...chips,type==='separator'||type==='spacer'?{id:`chip-${number}`,type}:type==='action'||!entity?{id:`chip-${number}`,name:'Navigation',tap_action:{action:'navigate',navigation_path:'/lovelace/0'}}:{id:`chip-${number}`,entity}];this.commit(next);
  }
  private move(index:number,delta:number){const next=structuredClone(this.draft!);const chips=next.chips!;[chips[index],chips[index+delta]]=[chips[index+delta],chips[index]];this.commit(next);}
  private entity(chip:ChipConfig,index:number){
    if(customElements.get('ha-form'))return html`<ha-form .hass=${this.hass} .data=${{entity:chip.entity}} .schema=${[{name:'entity',selector:{entity:{}}}]} .computeLabel=${()=>'Entity (optional)'} @value-changed=${(event:CustomEvent)=>{event.stopPropagation();this.field(index,'entity',event.detail.value.entity);}}></ha-form>`;
    return html`<label>Entity (optional)<select aria-label="Entity (optional)" .value=${chip.entity??''} @change=${(event:Event)=>this.field(index,'entity',(event.target as HTMLSelectElement).value)}><option value="">Action or navigation</option>${[...new Set([...(chip.entity?[chip.entity]:[]),...Object.keys(this.hass?.states??{})])].map(id=>html`<option value=${id} .selected=${live(chip.entity===id)}>${this.hass?.states[id]?.attributes.friendly_name??id} · ${id}</option>`)}</select></label>`;
  }
  private icon(chip:ChipConfig,index:number){return customElements.get('ha-form')?html`<ha-form .hass=${this.hass} .data=${{icon:chip.icon}} .schema=${[{name:'icon',selector:{icon:{}}}]} .computeLabel=${()=>'Icon'} @value-changed=${(event:CustomEvent)=>{event.stopPropagation();this.field(index,'icon',event.detail.value.icon);}}></ha-form>`:html`<label>Icon<input .value=${chip.icon??''} @change=${(event:Event)=>this.field(index,'icon',(event.target as HTMLInputElement).value)}></label>`;}
  private action(chip:ChipConfig,index:number,key:'tap_action'|'hold_action'|'double_tap_action',label:string){return html`<navet-action-field .hass=${this.hass} .value=${chip[key]??{action:key==='tap_action'&&chip.entity?'more-info':'none'}} label=${label} .allowToggle=${!!chip.entity} @value-changed=${(event:CustomEvent)=>{event.stopPropagation();this.field(index,key,event.detail.value);}}></navet-action-field>`;}
  render(){
    const c=this.draft;if(!c)return nothing;const chips=c.chips??[];
    return html`<div class="fields"><label>Title<input .value=${c.title??''} @change=${(event:Event)=>this.updateTitle('title',event)}></label><label>Subtitle<input .value=${c.subtitle??''} @change=${(event:Event)=>this.updateTitle('subtitle',event)}></label>
      ${chips.map((chip,index)=>html`<div class="item" data-chip-id=${chip.id}><strong>Chip ${index+1}</strong><label>Chip type<select aria-label="Chip type" .value=${chip.type??(chip.entity?'entity':'action')} @change=${(event:Event)=>this.field(index,'type',(event.target as HTMLSelectElement).value)}><option value="entity">Entity</option><option value="action">Action</option><option value="separator">Separator</option><option value="spacer">Spacer</option></select></label>${chip.type==='separator'||chip.type==='spacer'?html`<p>${chip.type==='separator'?'A line separates groups of chips. The optional name describes the separator to assistive technology.':'Flexible empty space separates chip groups on a row.'} Existing entity and action fields are preserved when changing type.</p>`:html`${this.entity(chip,index)}`}<label>Chip name<input .value=${chip.name??''} @change=${(event:Event)=>this.field(index,'name',(event.target as HTMLInputElement).value)}></label>${chip.type==='separator'||chip.type==='spacer'?nothing:html`${this.icon(chip,index)}<label class="check"><input type="checkbox" .checked=${chip.show_state!==false} @change=${(event:Event)=>this.field(index,'show_state',(event.target as HTMLInputElement).checked)}>Show state</label>`}
        <navet-condition-field .hass=${this.hass} .value=${chip.visible_when} @value-changed=${(event:CustomEvent)=>{event.stopPropagation();this.field(index,'visible_when',event.detail.value);}}></navet-condition-field>
        ${chip.type==='separator'||chip.type==='spacer'?nothing:html`${this.action(chip,index,'tap_action','Chip tap action')}<details><summary>Chip gestures</summary><div class="fields">${this.action(chip,index,'hold_action','Chip hold action')}${this.action(chip,index,'double_tap_action','Chip double tap action')}</div></details>`}
        <div class="buttons"><button type="button" aria-label=${`Move chip ${index+1} up`} ?disabled=${index===0} @click=${()=>this.move(index,-1)}>Move up</button><button type="button" aria-label=${`Move chip ${index+1} down`} ?disabled=${index===chips.length-1} @click=${()=>this.move(index,1)}>Move down</button><button type="button" aria-label=${`Remove chip ${index+1}`} @click=${()=>this.commit({...structuredClone(c),chips:chips.filter((_,i)=>i!==index)})}>Remove</button></div>
      </div>`)}
      <div class="buttons"><button type="button" ?disabled=${chips.length>=24} @click=${()=>this.add()}>Add entity chip</button><button type="button" ?disabled=${chips.length>=24} @click=${()=>this.add('action')}>Add action chip</button><button type="button" ?disabled=${chips.length>=24} @click=${()=>this.add('separator')}>Add separator</button><button type="button" ?disabled=${chips.length>=24} @click=${()=>this.add('spacer')}>Add spacer</button></div>
      ${!chips.length?html`<p>Start with an entity, navigation or service action. Entity chips open native details by default.</p>`:nothing}${this.error?html`<p class="error" role="alert">${this.error}</p>`:nothing}
    </div>`;
  }
}
if(!customElements.get('navet-chips-editor'))customElements.define('navet-chips-editor',NavetChipsEditor);
