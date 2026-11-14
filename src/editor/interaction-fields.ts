import { LitElement, html, css, nothing } from 'lit';
import type { ActionConfig, CardConfig } from '../config';
import type { Hass } from '../providers/home-assistant';
import type { ProtectionConfig } from '../actions/protection';
import './action-field';
type InteractionConfig = CardConfig & { press_action?: ActionConfig; release_action?: ActionConfig; repeat_action?: ActionConfig; repeat_interval?: number; protection?: ProtectionConfig };
/** Controlled editor: always preserves foreign and advanced YAML fields. */
export class NavetInteractionFields extends LitElement {
  static properties = { config: { attribute: false }, hass: { attribute: false }, allowPress: { type: Boolean, attribute: false } };
  allowPress = true;
  config?: InteractionConfig;
  hass?: Hass;
  static styles = css`:host{display:block}details{border:1px solid var(--divider-color,#aaa);border-radius:10px;padding:12px}summary{cursor:pointer;padding:8px}label{display:flex;gap:8px;align-items:center;margin:12px 0}input[type=number]{font:inherit;color:inherit;background:var(--card-background-color,#fff);padding:8px;min-width:0;width:90px}p{font-size:13px}navet-action-field{margin-block:10px}`;
  private emit(patch: Partial<InteractionConfig>) {
    if (!this.config) return;
    this.dispatchEvent(new CustomEvent('interaction-config-changed', { detail: { value: { ...structuredClone(this.config), ...patch } }, bubbles: true, composed: true }));
  }
  private action(key: 'press_action' | 'release_action' | 'repeat_action', event: CustomEvent<{ value: ActionConfig }>) { event.stopPropagation(); this.emit({ [key]: event.detail.value }); }
  render() {
    const config = this.config;
    if (!config) return nothing;
    return html`<details><summary>Press and protection</summary>${this.allowPress ? html`<p>Press actions run while holding the main action surface. Release runs once when the press ends or is cancelled. Scrolling cancels the press. Configure release to stop a momentary command.</p>
    ${(['press_action', 'release_action', 'repeat_action'] as const).map((key, index) => html`<navet-action-field .value=${config[key]} .hass=${this.hass} .serviceOnly=${true} .label=${['Press action', 'Release action', 'Repeat while pressed'][index]} @value-changed=${(event: CustomEvent<{ value: ActionConfig }>) => this.action(key, event)}></navet-action-field>`)}
    <label>Repeat interval (ms)<input type="number" min="100" step="50" .value=${String(config.repeat_interval ?? 500)} @change=${(event: Event) => { const value = Number((event.target as HTMLInputElement).value); if (Number.isFinite(value) && value >= 100) this.emit({ repeat_interval: value }); }}></label>` : nothing}
    <label><input type="checkbox" .checked=${config.protection?.enabled === true} @change=${(event: Event) => this.emit({ protection: { ...config.protection, enabled: (event.target as HTMLInputElement).checked } })}>Require unlocking before controls and actions</label>
    ${config.protection?.enabled ? html`<label>Unlock duration (seconds)<input type="number" min="1" step="1" .value=${String(config.protection.unlock_duration ?? 5)} @change=${(event: Event) => { const value = Number((event.target as HTMLInputElement).value); if (Number.isFinite(value) && value > 0) this.emit({ protection: { ...config.protection, unlock_duration: value } }); }}></label><p>This prevents accidental taps. It does not provide authentication or protect services elsewhere in Home Assistant.</p>` : nothing}</details>`;
  }
}
if (!customElements.get('navet-interaction-fields')) customElements.define('navet-interaction-fields', NavetInteractionFields);
