import { LitElement, html, css, nothing } from 'lit';
import type { CardEntity, CardCommand } from '../core';
/** Advertised fan options only. The parent owns host access and command errors. */
export class NavetFanOptions extends LitElement {
  static properties = { entity: { attribute: false }, disabled: { type: Boolean } };
  entity?: CardEntity;
  disabled = false;
  static styles = css`:host{display:block;min-width:0}.options{display:grid;gap:12px;padding:12px 0}label{display:grid;gap:6px;min-width:0;font:inherit;font-size:12px}select{box-sizing:border-box;min-width:0;width:100%;min-height:40px;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px}select:disabled{opacity:.6}`;
  private emit(command: CardCommand) {
    const e = this.entity;
    if (this.disabled || !e?.available || !e.capabilities.includes(command.type as 'fan_preset'|'oscillate'|'direction')) return;
    this.dispatchEvent(new CustomEvent('control-command', { detail: { command }, bubbles: true, composed: true }));
  }
  render() {
    const e = this.entity;
    if (!e) return nothing;
    const disabled = this.disabled || !e.available;
    const preset = e.fanPresets?.includes(e.fanPreset ?? '') ? e.fanPreset : '';
    const direction = e.directions?.includes(e.direction!) ? e.direction : '';
    return html`<div class="options">
      ${e.capabilities.includes('fan_preset') && e.fanPresets?.length ? html`<label>Preset mode<select aria-label="Preset mode" .value=${preset} ?disabled=${disabled} @change=${(event: Event) => this.emit({type:'fan_preset',value:(event.target as HTMLSelectElement).value})}>${!preset ? html`<option value="" disabled selected>Choose preset · current unknown</option>` : nothing}${e.fanPresets.map(mode => html`<option value=${mode} .selected=${mode === preset}>${mode}</option>`)}</select></label>` : nothing}
      ${e.capabilities.includes('oscillate') ? html`<label>Oscillation<select aria-label="Oscillation" .value=${e.oscillating === undefined ? '' : String(e.oscillating)} ?disabled=${disabled} @change=${(event: Event) => {const value=(event.target as HTMLSelectElement).value;if(value === 'true' || value === 'false')this.emit({type:'oscillate',value:value === 'true'});}}>${e.oscillating === undefined ? html`<option value="" disabled selected>Choose oscillation · current unknown</option>` : nothing}<option value="true" .selected=${e.oscillating === true}>On</option><option value="false" .selected=${e.oscillating === false}>Off</option></select></label>` : nothing}
      ${e.capabilities.includes('direction') && e.directions?.length ? html`<label>Direction<select aria-label="Direction" .value=${direction} ?disabled=${disabled} @change=${(event: Event) => this.emit({type:'direction',value:(event.target as HTMLSelectElement).value})}>${!direction ? html`<option value="" disabled selected>Choose direction · current unknown</option>` : nothing}${e.directions.map(value => html`<option value=${value} .selected=${value === direction}>${value === 'forward' ? 'Forward' : 'Reverse'}</option>`)}</select></label>` : nothing}
    </div>`;
  }
}
if (!customElements.get('navet-fan-options')) customElements.define('navet-fan-options', NavetFanOptions);
