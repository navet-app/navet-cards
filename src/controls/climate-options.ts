import { LitElement, html, css, nothing } from 'lit';
import type { CardEntity, CardCommand, Capability } from '../core';
const fields = [
  { type: 'climate_preset', label: 'Preset mode', options: 'climatePresets', selected: 'climatePreset' },
  { type: 'climate_fan', label: 'Fan mode', options: 'climateFans', selected: 'climateFan' },
  { type: 'climate_swing', label: 'Swing mode', options: 'climateSwings', selected: 'climateSwing' },
  { type: 'climate_swing_horizontal', label: 'Horizontal swing', options: 'climateSwingHorizontals', selected: 'climateSwingHorizontal' },
] as const;
export class NavetClimateOptions extends LitElement {
  static properties = { entity: { attribute: false }, disabled: { type: Boolean } };
  entity?: CardEntity;
  disabled = false;
  static styles = css`:host{display:block;min-width:0}.options{display:grid;gap:12px;padding:12px 0}label{display:grid;gap:6px;min-width:0;font:inherit;font-size:12px}select{box-sizing:border-box;min-width:0;width:100%;min-height:40px;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px}select:disabled{opacity:.6}`;
  private emit(command: CardCommand) {
    if (this.disabled || !this.entity?.available || !this.entity.capabilities.includes(command.type as Capability)) return;
    this.dispatchEvent(new CustomEvent('control-command', { detail: { command }, bubbles: true, composed: true }));
  }
  render() {
    const e = this.entity;
    if (!e) return nothing;
    return html`<div class="options">${fields.map(field => {
      const options = e[field.options];
      if (!e.capabilities.includes(field.type) || !options?.length) return nothing;
      const selected = options.includes(e[field.selected] ?? '') ? e[field.selected] : '';
      return html`<label>${field.label}<select aria-label=${field.label} .value=${selected} ?disabled=${this.disabled || !e.available} @change=${(event: Event) => this.emit({ type: field.type, value: (event.target as HTMLSelectElement).value })}>${!selected ? html`<option value="" disabled selected>Choose option · current unknown</option>` : nothing}${options.map(value => html`<option value=${value} .selected=${value === selected}>${value}</option>`)}</select></label>`;
    })}</div>`;
  }
}
if (!customElements.get('navet-climate-options')) customElements.define('navet-climate-options', NavetClimateOptions);
