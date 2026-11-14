import { LitElement, html, css, nothing } from 'lit';
import type { CardEntity, CardCommand } from '../core';
/** Provider-neutral color controls. The owning card routes intents and reports errors. */
export class NavetLightColor extends LitElement {
  static properties = { entity: { attribute: false }, disabled: { type: Boolean } };
  entity?: CardEntity;
  disabled = false;
  static styles = css`:host{display:block;min-width:0}.colors{display:grid;gap:12px;padding:12px 0}label{display:grid;grid-template-columns:1fr auto;gap:6px;font:inherit;font-size:12px}input{grid-column:1/-1;width:100%;min-height:32px;margin:0;accent-color:var(--primary-color,#ea8c55)}.hue{background:linear-gradient(to right,red,#ff0,#0f0,#0ff,#00f,#f0f,red);border-radius:8px}select{grid-column:1/-1;min-height:40px;max-width:100%;padding:8px;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px}output{font-variant-numeric:tabular-nums}p{margin:0;font-size:12px;opacity:.7}`;
  private emit(command: CardCommand) {
    if (this.disabled || !this.entity?.available) return;
    this.dispatchEvent(new CustomEvent('control-command', { detail: { command }, bubbles: true, composed: true }));
  }
  private color(event: Event, part: 'hue' | 'saturation') {
    const input = event.target as HTMLInputElement;
    const values = { hue: this.entity?.color?.hue ?? 0, saturation: this.entity?.color?.saturation ?? 100, [part]: Number(input.value) };
    this.emit({ type: 'color', ...values });
  }
  render() {
    const e = this.entity;
    if (!e) return nothing;
    const disabled = this.disabled || !e.available;
    const color = e.color;
    return html`<div class="colors">
      ${e.capabilities.includes('color') ? html`${!color ? html`<p>Current color is not reported. Choose a hue and saturation.</p>` : nothing}<label>Hue<output>${color ? Math.round(color.hue) : '—'}°</output><input class="hue" aria-label="Hue" type="range" min="0" max="360" step="1" .value=${String(color?.hue ?? 0)} ?disabled=${disabled} @change=${(event: Event) => this.color(event, 'hue')}></label><label>Saturation<output>${color ? Math.round(color.saturation) : '—'}%</output><input aria-label="Saturation" type="range" min="0" max="100" step="1" .value=${String(color?.saturation ?? 100)} ?disabled=${disabled} @change=${(event: Event) => this.color(event, 'saturation')}></label>` : nothing}
      ${e.capabilities.includes('effect') && e.effects?.length ? html`<label>Effect<select aria-label="Effect" .value=${e.effect ?? ''} ?disabled=${disabled} @change=${(event: Event) => this.emit({ type: 'effect', value: (event.target as HTMLSelectElement).value })}>${!e.effects.includes(e.effect ?? '') ? html`<option value="" disabled selected>Choose effect</option>` : nothing}${e.effects.map(effect => html`<option value=${effect} .selected=${effect === e.effect}>${effect}</option>`)}</select></label>` : nothing}
    </div>`;
  }
}
if (!customElements.get('navet-light-color')) customElements.define('navet-light-color', NavetLightColor);
