import { LitElement, html, css, nothing } from 'lit';
import type { CardEntity, CardCommand } from '../core';
export class NavetVacuumOptions extends LitElement {
  static properties = { entity: { attribute: false }, disabled: { type: Boolean } };
  entity?: CardEntity;
  disabled = false;
  static styles = css`:host{display:block;min-width:0}label{display:grid;gap:6px;min-width:0;padding:12px 0;font:inherit;font-size:12px}select{box-sizing:border-box;min-width:0;width:100%;min-height:40px;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px}select:disabled{opacity:.6}`;
  private emit(value: string) {
    const e = this.entity;
    if (this.disabled || !e?.available || !e.capabilities.includes('vacuum_speed') || !e.vacuumSpeeds?.includes(value)) return;
    const command: CardCommand = { type: 'vacuum_speed', value };
    this.dispatchEvent(new CustomEvent('control-command', { detail: { command }, bubbles: true, composed: true }));
  }
  render() {
    const e = this.entity;
    if (!e?.capabilities.includes('vacuum_speed') || !e.vacuumSpeeds?.length) return nothing;
    const selected = e.vacuumSpeeds.includes(e.vacuumSpeed ?? '') ? e.vacuumSpeed : '';
    return html`<label>Fan speed<select aria-label="Fan speed" .value=${selected} ?disabled=${this.disabled || !e.available} @change=${(event: Event) => this.emit((event.target as HTMLSelectElement).value)}>${!selected ? html`<option value="" disabled selected>Choose speed · current unknown</option>` : nothing}${e.vacuumSpeeds.map(value => html`<option value=${value} .selected=${value === selected}>${value}</option>`)}</select></label>`;
  }
}
if (!customElements.get('navet-vacuum-options')) customElements.define('navet-vacuum-options', NavetVacuumOptions);
