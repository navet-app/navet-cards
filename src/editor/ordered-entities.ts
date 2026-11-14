import { LitElement, html, css } from 'lit';
import type { Hass } from '../providers/home-assistant';
export class NavetOrderedEntities extends LitElement {
  static properties = { value: { attribute: false }, hass: { attribute: false }, label: {}, domains: { attribute: false } };
  value: string[] = [];
  hass?: Hass;
  label = 'Room entities';
  domains?: string[];
  static styles = css`:host{display:block;min-width:0;max-width:100%}*{box-sizing:border-box} ol{padding:0;list-style:none}li{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0;min-width:0}li span{flex:1 1 130px;min-width:0;overflow-wrap:anywhere}.buttons{display:flex;flex-wrap:wrap;gap:6px;min-width:0}button,select{font:inherit;min-height:40px;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px}label{display:grid;gap:6px;min-width:0}select{max-width:100%;min-width:0}small{display:block;opacity:.7;overflow-wrap:anywhere}`;
  private emit(value: string[]) { this.dispatchEvent(new CustomEvent('value-changed', { detail: { value: [...new Set(value)] }, bubbles: true, composed: true })); }
  private move(index: number, delta: number) { const value = [...this.value]; [value[index], value[index + delta]] = [value[index + delta], value[index]]; this.emit(value); }
  render() {
    const options = Object.keys(this.hass?.states ?? {}).filter(id => !this.value.includes(id) && (!this.domains || this.domains.includes(id.split('.')[0])));
    return html`<label>${this.label}</label><ol>${this.value.map((id, i) => html`<li><span>${this.hass?.states[id]?.attributes.friendly_name ?? id}<small>${id}</small></span><div class="buttons"><button type="button" aria-label=${`Move ${id} up`} ?disabled=${i === 0} @click=${() => this.move(i, -1)}>↑</button><button type="button" aria-label=${`Move ${id} down`} ?disabled=${i === this.value.length - 1} @click=${() => this.move(i, 1)}>↓</button><button type="button" aria-label=${`Remove ${id}`} @click=${() => this.emit(this.value.filter((_, n) => n !== i))}>Remove</button></div></li>`)}</ol>
      ${customElements.get('ha-form') ? html`<ha-form .hass=${this.hass} .data=${{entity: undefined}} .schema=${[{name:'entity', selector:{entity:this.domains ? {filter:{domain:this.domains}} : {}}}]} .computeLabel=${() => 'Add entity'} @value-changed=${(e: CustomEvent) => { e.stopPropagation(); const id = e.detail.value?.entity; if (typeof id === 'string') this.emit([...this.value, id]); }}></ha-form>` : html`<label>Add entity<select aria-label="Add entity" .value=${''} @change=${(e: Event) => { const el = e.target as HTMLSelectElement; if (el.value) this.emit([...this.value, el.value]); el.value = ''; }}><option value="">Choose an entity</option>${options.map(id => html`<option value=${id}>${this.hass?.states[id]?.attributes.friendly_name ?? id} · ${id}</option>`)}</select></label>`}`;
  }
}
if (!customElements.get('navet-ordered-entities')) customElements.define('navet-ordered-entities', NavetOrderedEntities);
