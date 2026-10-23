import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import type { CardConfig, ChipConfig, ActionConfig } from '../config';
import { CardGesture } from '../actions/gestures';
import { evaluateCondition } from '../conditions';
import { kindForEntity, mapEntity, type Hass } from '../providers/home-assistant';
import { translate } from '../i18n';

/** Compact native entity/action composition. No host service or navigation side effects here. */
export class NavetChips extends LitElement {
  static properties = { config: { attribute: false }, hass: { attribute: false }, disabled: { type: Boolean }, preview: { type: Boolean } };
  config?: CardConfig;
  hass?: Hass;
  disabled = false;
  preview = false;
  private gestures = new Map<string, CardGesture>();
  private held = new Set<string>();
  private locationChanged = () => this.requestUpdate();
  static styles = css`
    :host{display:block;min-width:0;color:inherit;font:inherit}.title{font-size:16px;font-weight:600;margin:0 0 6px;overflow-wrap:anywhere}.subtitle{font-size:12px;opacity:.75;margin:0 0 12px;overflow-wrap:anywhere}.chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0}
    button{box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;min-height:44px;min-width:44px;max-width:100%;padding:8px 12px;border:1px solid var(--navet-card-border,var(--divider-color,#7774));border-radius:24px;background:var(--card-background-color,#8881);color:inherit;font:inherit;font-size:13px;text-align:left;cursor:pointer}button:disabled{opacity:.55;cursor:default}button:focus-visible{outline:2px solid var(--primary-color,#f97316);outline-offset:2px}.active{border-color:var(--primary-color,#f97316);background:color-mix(in srgb,var(--primary-color,#f97316) 15%,transparent)}ha-icon{width:20px;height:20px;flex:none}.labels{min-width:0;overflow-wrap:anywhere}.state{display:block;font-size:12px;opacity:.75}.empty{font-size:12px;opacity:.75}.separator{flex-basis:100%;width:100%;margin:4px 0;border:0;border-top:1px solid var(--navet-card-border,var(--divider-color,#7774))}.spacer{flex:1 0 24px;min-width:24px;min-height:1px}
  `;
  connectedCallback() { super.connectedCallback(); window.addEventListener('location-changed',this.locationChanged);window.addEventListener('popstate',this.locationChanged);window.addEventListener('hashchange',this.locationChanged); }
  disconnectedCallback() { this.cancel();this.held.clear();window.removeEventListener('location-changed',this.locationChanged);window.removeEventListener('popstate',this.locationChanged);window.removeEventListener('hashchange',this.locationChanged);super.disconnectedCallback(); }
  private cancel() { this.gestures.forEach((gesture)=>gesture.cancel());this.gestures.clear(); }
  protected willUpdate(changed: PropertyValues) { if(changed.has('config')||changed.has('disabled')||changed.has('preview'))this.cancel(); }
  private enabled(chip: ChipConfig) { return this.isConnected && !this.disabled && !this.preview && this.config?.chips?.includes(chip) === true && evaluateCondition(chip.visible_when,this.hass?.states??{}); }
  private emit(type: string,detail: unknown) { this.dispatchEvent(new CustomEvent(type,{detail,bubbles:true,composed:true})); }
  private gesture(chip: ChipConfig) {
    let gesture=this.gestures.get(chip.id);
    if(!gesture){gesture=new CardGesture((action?:ActionConfig)=>{
      if(action&&action===chip.hold_action)this.held.add(chip.id);
      if(action)this.emit('chip-action',{entity:chip.entity,action});
      else if(chip.entity)this.emit('chip-details',{entity:chip.entity});
    },()=>this.enabled(chip));this.gestures.set(chip.id,gesture);}
    return gesture;
  }
  private active(chip: ChipConfig) {
    const action=chip.tap_action;
    if(action?.action!=='navigate'||!action.navigation_path)return false;
    if(action.navigation_path.startsWith('#'))return location.hash===action.navigation_path;
    const target=new URL(action.navigation_path,location.href);
    return target.pathname===location.pathname&&target.search===location.search&&target.hash===location.hash;
  }
  private label(chip: ChipConfig) { return chip.name ?? ({navigate:'Navigate',url:'Open URL',back:'Go back','perform-action':'Run action'} as Record<string,string>)[chip.tap_action?.action??''] ?? 'Action'; }
  render() {
    const title=this.config?.title??this.config?.name;
    const chips=this.config?.chips??[];
    return html`${title?html`<h2 class="title">${title}</h2>`:nothing}${this.config?.subtitle?html`<p class="subtitle">${this.config.subtitle}</p>`:nothing}<div class="chips">${chips.map((chip)=>{
      if(!evaluateCondition(chip.visible_when,this.hass?.states??{}))return nothing;
      if(chip.type==='separator')return html`<hr class="separator" data-chip-id=${chip.id} aria-label=${chip.name||nothing}>`;
      if(chip.type==='spacer')return html`<span class="spacer" data-chip-id=${chip.id} aria-hidden="true"></span>`;
      const kind=chip.entity?kindForEntity(chip.entity):undefined;
      const model=chip.entity&&kind?mapEntity(this.hass?.states[chip.entity],kind,chip.entity,this.hass):undefined;
      const name=chip.name??model?.name??this.label(chip);
      const gesture=this.gesture(chip);
      const actions={tap:chip.tap_action,hold:chip.hold_action,double:chip.double_tap_action};
      const active=this.active(chip);
      const value=model?translate(model.available?model.value:model.state,this.hass?.locale?.language??this.hass?.language):'';
      const state=model?.available&&kind==='weather'?`${value}${model.temperature!==undefined?` · ${model.temperature} ${model.unit}`:''}`:`${value}${model?.available&&model.unit?` ${model.unit}`:''}`;
      return html`<button class=${active?'active':''} data-chip-id=${chip.id} aria-label=${name} aria-current=${active?'page':nothing} ?disabled=${this.disabled||this.preview}
        @click=${(event:MouseEvent)=>{if(this.held.delete(chip.id)){gesture.cancel();if(event.detail>0)return;}gesture.click(event.detail,actions);}}
        @pointerdown=${(event:PointerEvent)=>{this.held.delete(chip.id);gesture.down(event,actions);}} @pointermove=${(event:PointerEvent)=>gesture.move(event)} @pointerup=${()=>gesture.up()} @pointerleave=${()=>gesture.up()} @pointercancel=${()=>gesture.cancelPointer()} @contextmenu=${(event:Event)=>{if(chip.hold_action)event.preventDefault();}}>
        ${chip.icon?html`<ha-icon .icon=${chip.icon}></ha-icon>`:nothing}<span class="labels"><span>${name}</span>${model&&chip.show_state!==false?html`<span class="state">${state}</span>`:nothing}</span>
      </button>`;
    })}</div>${!chips.length?html`<p class="empty">Add entity, action or navigation chips in the visual editor.</p>`:nothing}`;
  }
}
if(!customElements.get('navet-chips'))customElements.define('navet-chips',NavetChips);
