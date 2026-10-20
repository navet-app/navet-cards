import { live } from 'lit/directives/live.js';
import { LitElement, html, css, nothing } from 'lit';
import {
  domainAllowed, MULTI_KINDS, CONTENT_KINDS,
  type CardConfig,
  type ActionConfig,
  validateConfig,
  KINDS,
  tagFor,
} from './config';
import type { CardKind } from './core';
import type { Hass } from './providers/home-assistant';
import { roomEntityIds } from './providers/home-assistant';
import { translate } from './i18n';
import './editor/ordered-entities';
import './editor/action-field';
import './editor/condition-field';
import './editor/room-editor';
import './editor/sub-controls';
import './editor/chips';
import './editor/calendar';
import './editor/recipes';
import './editor/templates';
import './editor/interaction-fields';
import './editor/child-cards';
import { resolveRecipes } from './config/recipes';
import { resolveRoomMemberIds } from './rooms/planner';

type ActionKey = 'tap_action' | 'hold_action' | 'double_tap_action' | 'icon_tap_action' | 'icon_hold_action' | 'icon_double_tap_action';

export class NavetCardEditor extends LitElement {
  private currentHass?: Hass;
  private entityOptions: string[] = [];
  get hass() { return this.currentHass; }
  set hass(value: Hass | undefined) {
    const old = this.currentHass;
    this.currentHass = value;
    const children=this.renderRoot?.querySelector<HTMLElement & {hass?:Hass}>('navet-child-cards-editor');
    if(children)children.hass=value;
    if (!old || old.entities !== value?.entities || old.areas !== value?.areas || old.devices !== value?.devices || old.language !== value?.language || old.locale !== value?.locale || old.themes !== value?.themes) {
      this.entityOptions = Object.keys(value?.states ?? {});
      this.requestUpdate();
    } else if (this.kind === 'room' && this.config && value && resolveRoomMemberIds(this.config,{areaEntityIds:area=>roomEntityIds(value,area)}).some(id=>old.states[id] !== value.states[id])) this.requestUpdate();
  }
  private config?: CardConfig;
  private error = '';
  static styles = css`
    :host { display:block; font-family:var(--paper-font-body1_-_font-family, system-ui); color:var(--primary-text-color, #222); }
    * { box-sizing:border-box; } form { display:grid; gap:16px; } label { display:grid; gap:6px; font-size:13px; }
    input, select { font:inherit; color:inherit; background:var(--card-background-color, #fff); border:1px solid var(--divider-color, #aaa); border-radius:8px; min-height:42px; padding:10px; width:100%; }
    input:focus-visible, select:focus-visible { outline:2px solid var(--primary-color, #ea8c55); outline-offset:2px; }
    .pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; } .check { display:flex; align-items:center; } .check input { width:18px; min-height:18px; }
    details { padding:12px; border:1px solid var(--divider-color, #bbb); border-radius:12px; } summary { cursor:pointer; font-size:14px; } .fields { display:grid; gap:12px; margin-top:14px; }
    .item { border-top:1px solid var(--divider-color,#bbb); padding:12px 0; display:grid; gap:10px; } button { min-height:36px; border:1px solid var(--divider-color,#aaa); border-radius:8px; padding:8px; color:inherit; background:var(--card-background-color,#fff); cursor:pointer; } textarea { color:inherit; background:var(--card-background-color,#fff); font:inherit; }
    p { font-size:12px; line-height:1.5; } .error { color:var(--error-color, #b33); } @media(max-width:350px) { .pair { grid-template-columns:1fr; } }
  `;
  setConfig(config: CardConfig) {
    this.config = structuredClone(config);
    this.error = '';
    this.requestUpdate();
  }
  private get kind(): CardKind {
    return KINDS.find((kind) => this.config?.type === `custom:${tagFor(kind)}`) ?? 'switch';
  }
  private t(key: string) {
    return translate(key, this.hass?.locale?.language ?? this.hass?.language);
  }
  private changeConfig(key: string, value: unknown, parent?: string) {
    if (!this.config) return;
    const next = structuredClone(this.config);
    if (parent) {
      const nested = { ...((next[parent] as Record<string, unknown>) ?? {}) };
      if (value === '' || value === undefined) delete nested[key];
      else nested[key] = value;
      if (Object.keys(nested).length) next[parent] = nested;
      else delete next[parent];
    } else if (value === '' || value === undefined) delete next[key];
    else next[key] = value;
    this.commit(next);
  }
  private commit(next: CardConfig) {
    this.config = next;
    try {
      validateConfig(next, this.kind);
      this.error = '';
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: structuredClone(next) }, bubbles: true, composed: true }));
    } catch (error) { this.error = error instanceof Error ? error.message : 'Invalid configuration.'; }
    this.requestUpdate();
  }
  private listChange(key: 'sub_controls' | 'links', index: number, field: string, value: unknown) {
    const next = structuredClone(this.config!);
    const list = next[key] as unknown as Record<string, unknown>[];
    if (value === '') delete list[index][field]; else list[index][field] = value;
    this.commit(next);
  }
  private removeItem(key: 'sub_controls' | 'links', index: number) {
    const next = structuredClone(this.config!);
    next[key]?.splice(index,1);
    this.commit(next);
  }
  private picker(key: string, value: unknown, selector: Record<string,unknown>, change: (value: unknown)=>void) {
    if (customElements.get('ha-form')) return html`<ha-form .hass=${this.hass} .data=${{[key]: value}} .schema=${[{name:key,selector}]} .computeLabel=${()=>this.t(key)} @value-changed=${(e: CustomEvent)=>{e.stopPropagation();change(e.detail.value[key]);}}></ha-form>`;
    if ('area' in selector) return html`<label>${this.t(key)}<select .value=${String(value ?? '')} @change=${(e: Event)=>change((e.target as HTMLSelectElement).value)}><option value="" .selected=${live(!value)}>Choose an area</option>${Object.entries(this.hass?.areas ?? {}).map(([id,area])=>html`<option value=${id} .selected=${live(id === value)}>${area.name}</option>`)}</select></label>`;
    const options = this.entityOptions.filter(id => key !== 'entity' || this.kind === 'room' || domainAllowed(this.kind,id));
    return html`<label>${this.t(key)}<select .value=${String(value ?? '')} @change=${(e: Event)=>change((e.target as HTMLSelectElement).value)}><option value="" .selected=${live(!value)}>Choose an entity</option>${options.map(id=>html`<option value=${id} .selected=${live(id === value)}>${this.hass?.states[id]?.attributes.friendly_name ?? id} · ${id}</option>`)}</select></label>`;
  }
  private field(key: string, value: unknown, parent?: string, type = 'text') {
    return html`<label>${this.t(key)}<input type=${type} .value=${String(value ?? '')} @change=${(
      e: Event,
    ) => {
      const value = (e.target as HTMLInputElement).value;
      this.changeConfig(key, type === 'number' && value !== '' ? Number(value) : value, parent);
    }} /></label>`;
  }
  private action(key: ActionKey) {
    const value = this.config?.[key];
    return html`<details><summary>${key.replaceAll('_',' ')}</summary><div class="fields">
      ${!value ? html`<p>Uses the card's default action.</p>` : nothing}
      <navet-action-field .hass=${this.hass} .value=${value ?? {action:'none'}} .allowToggle=${['light','switch','fan','humidifier'].includes(this.kind)}
        @value-changed=${(event:CustomEvent)=>{event.stopPropagation();this.changeConfig(key,event.detail.value);}}></navet-action-field>
      <button type="button" @click=${()=>this.changeConfig(key,undefined)}>Reset to default</button>
    </div></details>`;
  }
  private links() {
    return html`<div>${(this.config?.links ?? []).map((link,i)=>html`<div class="item"><label>Link ${i+1} name<input .value=${link.name} @change=${(e:Event)=>this.listChange('links',i,'name',(e.target as HTMLInputElement).value)}></label><label>Link ${i+1} path or room hash<input .value=${link.path} @change=${(e:Event)=>this.listChange('links',i,'path',(e.target as HTMLInputElement).value)}></label><button type="button" @click=${()=>this.removeItem('links',i)}>Remove link ${i+1}</button></div>`)}<button type="button" ?disabled=${(this.config?.links?.length ?? 0)>=20} @click=${()=>this.changeConfig('links',[...(this.config?.links ?? []),{name:'Home',path:'/lovelace/0'}])}>Add link</button></div>`;
  }
  private gallery() {
    const images = this.config?.images ?? [];
    const move = (index:number,delta:number) => { const next=[...images]; [next[index],next[index+delta]]=[next[index+delta],next[index]];this.changeConfig('images',next); };
    return html`<details><summary>Photo gallery</summary><div class="fields">${images.map((url,index)=>html`<div class="item"><label>Photo ${index+1} URL<input .value=${url} @change=${(event:Event)=>{const next=[...images];next[index]=(event.target as HTMLInputElement).value;this.changeConfig('images',next);}}></label><div class="pair"><button type="button" ?disabled=${index===0} @click=${()=>move(index,-1)}>Move photo ${index+1} up</button><button type="button" ?disabled=${index===images.length-1} @click=${()=>move(index,1)}>Move photo ${index+1} down</button></div><button type="button" @click=${()=>this.changeConfig('images',images.length===1?undefined:images.filter((_,i)=>i!==index))}>Remove photo ${index+1}</button></div>`)}<button type="button" ?disabled=${images.length>=24} @click=${()=>this.changeConfig('images',[...images,this.config?.image ?? '/local/photo.jpg'])}>Add photo</button><p>A gallery takes precedence over the single image. Removing every gallery photo restores the single image or selected image entity.</p></div></details>`;
  }
  private popupFields() {
    const popup = this.config?.popup;
    return html`<details><summary>Popup behavior</summary><div class="fields">
      ${this.field('panel_id',this.config?.panel_id)}${this.field('scope',popup?.scope,'popup')}
      <label>Popup size<select .value=${popup?.size ?? 'default'} @change=${(event:Event)=>this.changeConfig('size',(event.target as HTMLSelectElement).value,'popup')}>${['default','wide','fullscreen'].map(value=>html`<option value=${value} .selected=${live(value === (popup?.size ?? 'default'))}>${value}</option>`)}</select></label>
      ${this.field('timeout',popup?.timeout,'popup','number')}<p>Timeout is measured in seconds; zero disables automatic closing.</p>
      <label class="check"><input type="checkbox" .checked=${popup?.swipe === true} @change=${(event:Event)=>this.changeConfig('swipe',(event.target as HTMLInputElement).checked,'popup')}>Swipe down on the popup header to close</label>
      <navet-condition-field label="Open popup when" .value=${popup?.trigger} .hass=${this.hass} @value-changed=${(event:CustomEvent)=>{event.stopPropagation();this.changeConfig('trigger',event.detail.value,'popup');}}></navet-condition-field>
      <p>A dismissed trigger must become false before it can open the popup again. Scoped links use #scope--panel.</p>
    </div></details>`;
  }
  protected render() {
    const c = this.config;
    if (!c) return nothing;
    let inherited:Record<string,unknown>={};try{if(c.use?.length)inherited=resolveRecipes(c);}catch{/* Local recipe editor owns invalid drafts. */}
    return html`<form @submit=${(e: Event) => e.preventDefault()}>
      ${c.use?.length ? html`<p>Using ${c.use.join(', ')}. ${inherited.entity ? html`Inherited entity: ${String(inherited.entity)}.` : nothing} Fields edited here override shared definitions.</p>` : nothing}
      ${this.kind === 'calendar' ? html`<navet-calendar-editor .config=${c} .hass=${this.hass} @calendar-config-changed=${(event:CustomEvent<{config:CardConfig}>)=>{event.stopPropagation();this.commit(event.detail.config);}}></navet-calendar-editor>` : this.kind === 'composition' ? nothing : this.kind === 'chips' ? html`<navet-chips-editor .config=${c} .hass=${this.hass} @chips-config-changed=${(event:CustomEvent<{config:CardConfig}>)=>{event.stopPropagation();this.commit(event.detail.config);}}></navet-chips-editor>` : this.kind === 'sub-controls' ? nothing : MULTI_KINDS.includes(this.kind) ? html`<navet-ordered-entities .value=${c.entities ?? []} .hass=${this.hass} .domains=${this.kind === 'media-stack' ? ['media_player'] : this.kind === 'energy-now' ? ['sensor'] : ['sensor','binary_sensor']} label="Selected entities" @value-changed=${(e:CustomEvent)=>{e.stopPropagation();this.changeConfig('entities',e.detail.value);}}></navet-ordered-entities><p>Choose readings in display order. Energy Now uses power first, daily energy second.</p>` : CONTENT_KINDS.includes(this.kind) ? html`${this.picker('entity',c.entity,{entity:{filter:{domain:this.entityOptions.filter(id=>domainAllowed(this.kind,id)).map(id=>id.split('.')[0]).filter((v,i,a)=>a.indexOf(v)===i)}}},value=>this.changeConfig('entity',value))}${this.kind === 'note' ? html`<label>${this.t('content')}<textarea rows="4" .value=${c.content ?? ''} @change=${(e:Event)=>this.changeConfig('content',(e.target as HTMLTextAreaElement).value)}></textarea></label><p>${this.t('noteHelp')}</p>` : this.kind === 'photo' ? html`${this.field('image',c.image)}${this.field('alt',c.alt)}` : nothing}` : this.kind === 'navigation' ? this.links() : this.kind === 'room' ? html`<navet-room-editor .config=${c} .hass=${this.hass} @room-config-changed=${(e:CustomEvent)=>{e.stopPropagation();this.commit(e.detail.config);}}></navet-room-editor>` : this.picker('entity',c.entity,{entity:{filter:{domain:this.entityOptions.filter(id=>domainAllowed(this.kind,id)).map(id=>id.split('.')[0]).filter((v,i,a)=>a.indexOf(v)===i)}}},value=>this.changeConfig('entity',value))}
      ${this.kind === 'room' ? html`<details><summary>Room navigation links</summary>${this.links()}</details>${this.popupFields()}` : nothing}
      ${['room','navigation'].includes(this.kind) ? html`<details><summary>Navigation placement</summary><div class="fields"><label>Navigation position<select .value=${c.navigation_position ?? 'inline'} @change=${(e:Event)=>this.changeConfig('navigation_position',(e.target as HTMLSelectElement).value)}>${['inline','sticky','fixed'].map(value=>html`<option value=${value} .selected=${live(value === (c.navigation_position ?? 'inline'))}>${value}</option>`)}</select></label>${this.field('navigation_offset',c.navigation_offset,undefined,'number')}</div></details>` : nothing}
      ${this.kind === 'photo' ? this.gallery() : nothing}
      <div class="pair">${this.field('name', c.name)}${customElements.get('ha-form') ? html`<ha-form .hass=${this.hass} .data=${{icon:c.icon}} .schema=${[{name:'icon',selector:{icon:{}}}]} .computeLabel=${()=>this.t('icon')} @value-changed=${(e:CustomEvent)=>{e.stopPropagation();this.changeConfig('icon',e.detail.value.icon);}}></ha-form>` : this.field('icon', c.icon)}</div>
      <label>${this.t('layout')}<select .value=${c.layout ?? 'compact'} @change=${(e: Event) => this.changeConfig('layout', (e.target as HTMLSelectElement).value)}><option value="compact" .selected=${live(!c.layout || c.layout === 'compact')}>Compact</option><option value="comfortable" .selected=${live(c.layout === 'comfortable')}>Comfortable</option><option value="row" .selected=${live(c.layout === 'row')}>Row</option></select></label>
      ${this.kind === 'switch' ? html`<label>${this.t('size')}<select .value=${c.size ?? 'small'} @change=${(e: Event) => this.changeConfig('size', (e.target as HTMLSelectElement).value)}><option value="small" .selected=${live(c.size !== 'extra-small')}>${this.t('small')}</option><option value="extra-small" .selected=${live(c.size === 'extra-small')}>${this.t('extraSmall')}</option></select></label>` : nothing}
      <label class="check"><input type="checkbox" .checked=${c.show_state !== false} @change=${(e: Event) => this.changeConfig('show_state', (e.target as HTMLInputElement).checked)} />${this.t('show_state')}</label>
      ${this.kind === 'light' ? html`<label class="check"><input type="checkbox" .checked=${c.show_brightness !== false} @change=${(e: Event) => this.changeConfig('show_brightness', (e.target as HTMLInputElement).checked)} />${this.t('show_brightness')}</label>` : nothing}
      ${this.kind === 'sensor' ? html`<div class="pair">${this.field('attribute', c.attribute)}${this.field('unit', c.unit)}</div>` : nothing}
      <details><summary>Appearance</summary><div class="fields"><div class="pair">${this.field('accent', c.appearance?.accent ?? '#f97316', 'appearance', 'color')}${this.field('radius', c.appearance?.radius, 'appearance', 'number')}</div><button type="button" @click=${()=>this.changeConfig('accent',undefined,'appearance')}>Use theme accent</button>
      <label>Preset<select .value=${c.appearance?.preset ?? 'warm'} @change=${(e:Event)=>this.changeConfig('preset',(e.target as HTMLSelectElement).value,'appearance')}>${['warm','neutral','cool'].map(v=>html`<option value=${v} .selected=${live(v === (c.appearance?.preset ?? 'warm'))}>${v}</option>`)}</select></label>
      <label>Effects<select .value=${c.appearance?.effects ?? 'low'} @change=${(e:Event)=>this.changeConfig('effects',(e.target as HTMLSelectElement).value,'appearance')}><option value="low" .selected=${live(c.appearance?.effects !== 'high')}>Low</option><option value="high" .selected=${live(c.appearance?.effects === 'high')}>High</option></select></label>
      <label>${this.t('theme')}<select .value=${c.appearance?.theme ?? 'auto'} @change=${(e: Event) => this.changeConfig('theme', (e.target as HTMLSelectElement).value, 'appearance')}>${['auto', 'light', 'dark', 'black', 'glass'].map((theme) => html`<option value=${theme} .selected=${live(theme === (c.appearance?.theme ?? 'auto'))}>${theme}</option>`)}</select></label></div></details>
      <details><summary>Sub-controls</summary><div class="fields"><navet-sub-controls-editor .config=${c} .hass=${this.hass} @sub-controls-config-changed=${(event:CustomEvent<{config:CardConfig}>)=>{event.stopPropagation();this.commit(event.detail.config);}}></navet-sub-controls-editor></div></details>
      <details><summary>Reusable configurations</summary><div class="fields"><navet-recipes-editor .config=${c} .hass=${this.hass} @recipes-config-changed=${(event:CustomEvent<{config:CardConfig}>)=>{event.stopPropagation();this.commit(event.detail.config);}}></navet-recipes-editor></div></details>
      <details><summary>HA display templates</summary><div class="fields"><navet-templates-editor .config=${c} .hass=${this.hass} @templates-config-changed=${(event:CustomEvent<{config:CardConfig}>)=>{event.stopPropagation();this.commit(event.detail.config);}}></navet-templates-editor></div></details>
      <navet-interaction-fields .allowPress=${!['calendar','chips','sub-controls','composition'].includes(this.kind)} .config=${c} .hass=${this.hass} @interaction-config-changed=${(event:CustomEvent)=>{event.stopPropagation();this.commit(event.detail.value);}}></navet-interaction-fields>
      <details><summary>Child cards</summary><div class="fields"><navet-child-cards-editor .definitions=${c.definitions} .cards=${c.cards ?? []} .hass=${this.hass} @child-cards-changed=${(event:CustomEvent)=>{event.stopPropagation();this.changeConfig('cards',event.detail.cards);}}></navet-child-cards-editor><label>Child card layout<select .value=${c.cards_layout ?? 'vertical'} @change=${(event:Event)=>this.changeConfig('cards_layout',(event.target as HTMLSelectElement).value)}>${['vertical','horizontal','grid'].map(value=>html`<option value=${value} .selected=${live(value === (c.cards_layout ?? 'vertical'))}>${value}</option>`)}</select></label>${this.field('cards_columns',c.cards_columns,undefined,'number')}</div></details>
      ${!['chips','sub-controls'].includes(this.kind) ? html`${this.action('tap_action')}${this.action('hold_action')}${this.action('double_tap_action')}<details><summary>Icon gestures</summary><div class="fields">${this.action('icon_tap_action')}${this.action('icon_hold_action')}${this.action('icon_double_tap_action')}</div></details>` : nothing}
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
    </form>`;
  }
}

if (!customElements.get('navet-card-editor')) customElements.define('navet-card-editor', NavetCardEditor);
