import { LitElement, html, css, nothing } from 'lit';
import type { CardEntity, CardCommand, Capability } from '../core';
export class NavetCoverTilt extends LitElement {
  static properties = { entity: { attribute: false }, disabled: { type: Boolean } };
  entity?: CardEntity;
  disabled = false;
  static styles = css`:host{display:block;min-width:0}.tilt{display:grid;gap:10px;padding:12px 0}.actions{display:flex;flex-wrap:wrap;gap:6px}button{flex:1;min-height:40px;min-width:60px;padding:8px;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px}label{display:grid;gap:6px;font-size:12px}input{width:100%;min-height:32px;box-sizing:border-box;accent-color:var(--primary-color,#ea8c55)}p{font-size:12px;margin:0}`;
  private emit(command: CardCommand) {
    if (this.disabled || !this.entity?.available) return;
    this.dispatchEvent(new CustomEvent('control-command', { detail: { command }, bubbles: true, composed: true }));
  }
  render() {
    const e = this.entity;
    if (!e) return nothing;
    const has = (capability: Capability) => e.capabilities.includes(capability);
    const disabled = this.disabled || !e.available;
    return html`<div class="tilt">${has('tilt') ? html`<label>Tilt${e.tiltPosition === undefined ? ' · position unknown' : ` · ${Math.round(e.tiltPosition)}%`}<input aria-label="Tilt position" type="range" min="0" max="100" step="1" .value=${String(e.tiltPosition ?? 50)} ?disabled=${disabled || e.tiltPosition === undefined} @change=${(event: Event) => this.emit({ type: 'tilt', value: Number((event.target as HTMLInputElement).value) })}></label>` : nothing}<div class="actions">${has('tilt_open') ? html`<button type="button" ?disabled=${disabled} @click=${() => this.emit({ type: 'tilt_open' })}>Open tilt</button>` : nothing}${has('tilt_stop') ? html`<button type="button" ?disabled=${disabled} @click=${() => this.emit({ type: 'tilt_stop' })}>Stop tilt</button>` : nothing}${has('tilt_close') ? html`<button type="button" ?disabled=${disabled} @click=${() => this.emit({ type: 'tilt_close' })}>Close tilt</button>` : nothing}</div></div>`;
  }
}
if (!customElements.get('navet-cover-tilt')) customElements.define('navet-cover-tilt', NavetCoverTilt);
