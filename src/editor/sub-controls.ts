import { LitElement, html, css, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { validateConfig, type CardConfig, type SubControl, type ActionConfig } from '../config';
import type { Hass } from '../providers/home-assistant';
import type { CardKind } from '../core';
import { KINDS, tagFor } from '../config';
import './action-field';
import './condition-field';

/** Controlled visual list with a local invalid draft; all unknown row fields are retained. */
export class NavetSubControlsEditor extends LitElement {
  static properties = { hass: { attribute: false } };
  hass?: Hass;
  private external?: CardConfig;
  private draft?: CardConfig;
  private error = '';
  get config() { return this.external; }
  set config(value: CardConfig | undefined) {
    if (value === this.external) return;
    const keys = ['sub_controls','sub_control_groups','sub_controls_position'] as const;
    const signature = (config?: CardConfig) => JSON.stringify(keys.map((key) => config?.[key]));
    const local = this.draft;
    const preserve = local && this.external && value && signature(this.external) === signature(value);
    this.external = value; this.draft = value ? structuredClone(value) : undefined;
    if (preserve && this.draft) for (const key of keys) {
      if (Object.hasOwn(local, key)) Object.defineProperty(this.draft, key, { value: structuredClone(local[key]), enumerable: true, writable: true, configurable: true });
      else delete this.draft[key];
    }
    if (!preserve) this.error = '';
    this.requestUpdate();
  }
  static styles = css`
    :host{display:block;min-width:0;color:inherit;font:inherit}.fields,.item{display:grid;gap:10px;min-width:0}.item{border-top:1px solid var(--divider-color,#aaa);padding:12px 0}.pair{display:flex;flex-wrap:wrap;gap:8px}.pair>*{flex:1;min-width:120px}label{display:grid;gap:5px;min-width:0;font-size:13px}input,select,button{box-sizing:border-box;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;min-height:42px;padding:8px;max-width:100%}input,select{width:100%;min-width:0}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}.check{display:flex;align-items:center;gap:8px}.check input{width:20px;min-height:20px}.buttons{display:flex;gap:6px;flex-wrap:wrap}details{border:1px solid var(--divider-color,#aaa);border-radius:10px;padding:10px;min-width:0}summary{cursor:pointer}p{font-size:12px;line-height:1.5}.error{color:var(--error-color,#b33)}
  `;
  private commit(next: CardConfig) {
    this.draft = next;
    try {
      const kind = KINDS.find((kind) => next.type === `custom:${tagFor(kind)}`) as CardKind | undefined;
      if (!kind) throw new Error('Unknown owning card type.');
      const config = validateConfig(next, kind); this.error = '';
      this.dispatchEvent(new CustomEvent('sub-controls-config-changed', { detail: { config }, bubbles: true, composed: true }));
    } catch (error) { this.error = (error as Error).message; }
    this.requestUpdate();
  }
  private updateRow(index: number, field: keyof SubControl, value: unknown) {
    const next = structuredClone(this.draft!);
    const row = next.sub_controls![index];
    if (value === undefined || value === '') delete row[field]; else row[field] = value as never;
    this.commit(next);
  }
  private move(index: number, delta: number) {
    const next = structuredClone(this.draft!); const list = next.sub_controls!;
    [list[index],list[index + delta]] = [list[index + delta],list[index]]; this.commit(next);
  }
  private text(index: number, field: 'name'|'icon'|'attribute'|'unit', label: string) {
    return html`<label>${label}<input .value=${this.draft?.sub_controls?.[index][field] ?? ''} @change=${(event: Event) => this.updateRow(index, field, (event.target as HTMLInputElement).value)}></label>`;
  }
  private entity(index: number, sub: SubControl) {
    if (customElements.get('ha-form')) return html`<ha-form .hass=${this.hass} .data=${{entity:sub.entity}} .schema=${[{name:'entity',selector:{entity:{}}}]} .computeLabel=${() => 'Entity'} @value-changed=${(event: CustomEvent) => { event.stopPropagation(); this.updateRow(index, 'entity', event.detail.value.entity); }}></ha-form>`;
    return html`<label>Entity<select aria-label="Entity" .value=${sub.entity} @change=${(event: Event) => this.updateRow(index, 'entity', (event.target as HTMLSelectElement).value)}>${[...new Set([sub.entity,...Object.keys(this.hass?.states ?? {})])].map((id) => html`<option value=${id} .selected=${live(id === sub.entity)}>${this.hass?.states[id]?.attributes.friendly_name ?? id} · ${id}</option>`)}</select></label>`;
  }
  private icon(index: number, sub: SubControl) {
    return customElements.get('ha-form') ? html`<ha-form .hass=${this.hass} .data=${{icon:sub.icon}} .schema=${[{name:'icon',selector:{icon:{}}}]} .computeLabel=${() => 'Icon'} @value-changed=${(event: CustomEvent) => { event.stopPropagation(); this.updateRow(index, 'icon', event.detail.value.icon); }}></ha-form>` : this.text(index, 'icon', 'Icon');
  }
  private action(index: number, field: 'tap_action'|'hold_action'|'double_tap_action', label: string) {
    const value = this.draft?.sub_controls?.[index][field] as ActionConfig | undefined;
    return html`<navet-action-field .hass=${this.hass} .value=${value ?? {action:field === 'tap_action' ? 'more-info' : 'none'}} label=${label} @value-changed=${(event: CustomEvent) => { event.stopPropagation(); this.updateRow(index, field, event.detail.value); }}></navet-action-field>`;
  }
  render() {
    const c = this.draft;
    if (!c) return nothing;
    const controls = c.sub_controls ?? [];
    const groups = c.sub_control_groups ?? [];
    return html`<div class="fields"><label>Sub-control position<select aria-label="Sub-control position" .value=${c.sub_controls_position ?? 'bottom'} @change=${(event: Event) => this.commit({ ...structuredClone(c), sub_controls_position: (event.target as HTMLSelectElement).value as 'top'|'bottom' })}><option value="bottom" .selected=${c.sub_controls_position !== 'top'}>Below card content</option><option value="top" .selected=${c.sub_controls_position === 'top'}>Above card content</option></select></label>
      ${controls.map((sub, index) => html`<div class="item">${this.entity(index,sub)}${this.text(index,'name','Name')}
        <label>Control<select aria-label="Control" .value=${sub.control ?? 'state'} @change=${(event: Event) => this.updateRow(index,'control',(event.target as HTMLSelectElement).value)}>${['state','toggle','slider','select'].map((control) => html`<option value=${control} .selected=${live((sub.control ?? 'state') === control)}>${control}</option>`)}</select></label>
        <details><summary>Display and grouping</summary><div class="fields">${this.icon(index,sub)}<div class="pair">${this.text(index,'attribute','Attribute')}${this.text(index,'unit','Unit')}</div>
          ${(['show_name','show_state','read_only'] as const).map((key) => html`<label class="check"><input type="checkbox" .checked=${key === 'read_only' ? sub[key] === true : sub[key] !== false} @change=${(event: Event) => this.updateRow(index,key,(event.target as HTMLInputElement).checked)}>${{show_name:'Show name',show_state:'Show state',read_only:'Read only'}[key]}</label>`)}
          <label>Group<select aria-label="Group" .value=${sub.group ?? ''} @change=${(event: Event) => this.updateRow(index,'group',(event.target as HTMLSelectElement).value)}><option value="">Ungrouped</option>${groups.map((group) => html`<option value=${group.id} .selected=${sub.group === group.id}>${group.name}</option>`)}</select></label>
        </div></details>
        <navet-condition-field .hass=${this.hass} .value=${sub.visible_when} @value-changed=${(event: CustomEvent) => { event.stopPropagation(); this.updateRow(index,'visible_when',event.detail.value); }}></navet-condition-field>
        ${this.action(index,'tap_action','Sub-control tap action')}<details><summary>Sub-control gestures</summary><div class="fields">${this.action(index,'hold_action','Sub-control hold action')}${this.action(index,'double_tap_action','Sub-control double tap action')}</div></details>
        <div class="buttons"><button type="button" aria-label=${`Move sub-control ${index+1} up`} ?disabled=${index === 0} @click=${() => this.move(index,-1)}>Move up</button><button type="button" aria-label=${`Move sub-control ${index+1} down`} ?disabled=${index === controls.length-1} @click=${() => this.move(index,1)}>Move down</button><button type="button" @click=${() => this.commit({ ...structuredClone(c), sub_controls: controls.filter((_,i) => i !== index) })}>Remove sub-control</button></div>
      </div>`)}
      <button type="button" ?disabled=${controls.length >= 8} @click=${() => this.commit({ ...structuredClone(c), sub_controls: [...controls,{entity:Object.keys(this.hass?.states ?? {})[0] ?? 'sensor.example',control:'state'}] })}>Add sub-control</button>
      <details><summary>Sub-control groups</summary><div class="fields">${groups.map((group,index) => html`<div class="item"><label>Group ${index+1} name<input .value=${group.name} @change=${(event: Event) => { const next=structuredClone(c);next.sub_control_groups![index].name=(event.target as HTMLInputElement).value;this.commit(next); }}></label><label class="check"><input type="checkbox" .checked=${group.collapsed === true} @change=${(event: Event) => { const next=structuredClone(c);next.sub_control_groups![index].collapsed=(event.target as HTMLInputElement).checked;this.commit(next); }}>Group ${index+1} starts collapsed</label><button type="button" @click=${() => { const next=structuredClone(c);next.sub_control_groups=groups.filter((_,i) => i !== index);next.sub_controls=controls.map((row) => { const copy={...row};if(copy.group===group.id)delete copy.group;return copy; });this.commit(next); }}>Remove group ${index+1}</button></div>`)}
        <button type="button" ?disabled=${groups.length >= 8} @click=${() => { let n=groups.length+1;while(groups.some((group)=>group.id===`group-${n}`))n++;this.commit({ ...structuredClone(c),sub_control_groups:[...groups,{id:`group-${n}`,name:'New group'}] }); }}>Add group</button>
      </div></details>${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
    </div>`;
  }
}
if (!customElements.get('navet-sub-controls-editor')) customElements.define('navet-sub-controls-editor', NavetSubControlsEditor);
