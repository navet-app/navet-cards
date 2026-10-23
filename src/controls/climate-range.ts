import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import type { CardEntity, CardCommand } from '../core';
/** Atomic target pair; drafts never call a host or change the displayed device state. */
export class NavetClimateRange extends LitElement {
  static properties = { entity: { attribute: false }, disabled: { type: Boolean }, low: { state: true }, high: { state: true } };
  entity?: CardEntity;
  disabled = false;
  private low = NaN;
  private high = NaN;
  private signature = '';
  static styles = css`:host{display:block;min-width:0}form{display:grid;gap:10px;padding:12px 0}.pair{display:flex;flex-wrap:wrap;gap:10px}label{display:grid;gap:6px;flex:1 1 100px;min-width:0;font:inherit;font-size:12px}input,button{box-sizing:border-box;min-height:40px;min-width:0;width:100%;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px}button{cursor:pointer}button:disabled{opacity:.5}p{font-size:12px;margin:0}[role=alert]{color:var(--error-color,#d66)}`;
  protected willUpdate(changed: PropertyValues) {
    if (!changed.has('entity')) return;
    const e = this.entity;
    const signature = JSON.stringify([e?.externalId,e?.targetTemperatureLow,e?.targetTemperatureHigh,e?.minTemperature,e?.maxTemperature,e?.stepTemperature,e?.available]);
    if (signature !== this.signature) { this.signature = signature; this.low = e?.targetTemperatureLow ?? NaN; this.high = e?.targetTemperatureHigh ?? NaN; }
  }
  private get error() {
    const e = this.entity;
    const min = e?.minTemperature, max = e?.maxTemperature, step = e?.stepTemperature;
    if (min === undefined || max === undefined || step === undefined || !Number.isFinite(min) || !Number.isFinite(max) || min >= max || step <= 0) return 'Temperature limits are not reported.';
    if (!Number.isFinite(this.low) || !Number.isFinite(this.high)) return 'Enter both target temperatures.';
    if (this.low > this.high) return 'Low target must not exceed high target.';
    if (this.low < min || this.high > max) return `Targets must be between ${min} and ${max}.`;
    if ([this.low,this.high].some(value => Math.abs((value-min)/step - Math.round((value-min)/step)) > 1e-7)) return `Targets must follow the ${step}° step.`;
    return '';
  }
  private apply(event: Event) {
    event.preventDefault();
    if (this.disabled || !this.entity?.available || !this.entity.capabilities.includes('temperature_range') || this.error) return;
    const command: CardCommand = { type: 'temperature_range', low: this.low, high: this.high };
    this.dispatchEvent(new CustomEvent('control-command', { detail: { command }, bubbles: true, composed: true }));
  }
  render() {
    const e = this.entity;
    if (!e?.capabilities.includes('temperature_range')) return nothing;
    const disabled = this.disabled || !e.available;
    return html`<form @submit=${this.apply}><p>Target range${e.temperatureUnit ? ` (${e.temperatureUnit})` : ''}</p><div class="pair"><label>Low target<input aria-label="Low target" type="number" .min=${String(e.minTemperature)} .max=${String(e.maxTemperature)} .step=${String(e.stepTemperature)} .value=${Number.isFinite(this.low) ? String(this.low) : ''} ?disabled=${disabled} @input=${(event: Event) => { this.low = (event.target as HTMLInputElement).valueAsNumber; }}></label><label>High target<input aria-label="High target" type="number" .min=${String(e.minTemperature)} .max=${String(e.maxTemperature)} .step=${String(e.stepTemperature)} .value=${Number.isFinite(this.high) ? String(this.high) : ''} ?disabled=${disabled} @input=${(event: Event) => { this.high = (event.target as HTMLInputElement).valueAsNumber; }}></label></div>${this.error ? html`<p role="alert">${this.error}</p>` : nothing}<button type="submit" ?disabled=${disabled || !!this.error}>Apply range</button></form>`;
  }
}
if (!customElements.get('navet-climate-range')) customElements.define('navet-climate-range', NavetClimateRange);
