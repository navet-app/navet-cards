import { LitElement, html, css, nothing } from 'lit';
import { translate } from '../i18n';
import type { CardEntity } from '../core';
import type { RemoteCapability, RemoteCommand, RemoteFields } from '../providers/remote';

type RemoteEntity = Omit<CardEntity, 'capabilities'> & RemoteFields & { capabilities: (CardEntity['capabilities'][number] | RemoteCapability)[] };

export class NavetRemoteControls extends LitElement {
  static properties = { entity: { attribute: false }, disabled: { type: Boolean }, language: {} };
  entity?: RemoteEntity;
  disabled = false;
  language = 'en';
  private t(key: string) { return translate(key,this.language); }
  static styles = css`:host{display:block;min-width:0;color:var(--text,inherit)}.power{display:flex;flex-wrap:wrap;gap:8px}button,select{box-sizing:border-box;min-height:44px;font:inherit;color:inherit;background:var(--control,transparent);border:1px solid var(--edge,var(--divider-color,#aaa));border-radius:10px;padding:8px 12px}button:disabled,select:disabled{opacity:.6}label{display:grid;gap:6px;min-width:0;padding:12px 0;font:inherit;font-size:12px}select{min-width:0;width:100%;background:var(--surface,var(--card-background-color,#fff))}option{color:CanvasText;background-color:Canvas}`;
  private emit(command: RemoteCommand) {
    const entity = this.entity;
    if (this.disabled || !entity?.available || !entity.capabilities.includes(command.type)) return;
    if (command.type === 'remote_activity' && !entity.remoteActivities?.includes(command.value)) return;
    this.dispatchEvent(new CustomEvent('control-command', { detail: { command }, bubbles: true, composed: true }));
  }
  render() {
    const entity = this.entity;
    if (!entity) return nothing;
    const disabled = this.disabled || !entity.available;
    const activities = entity.remoteActivities;
    const selected = activities?.includes(entity.remoteActivity ?? '') ? entity.remoteActivity : '';
    return html`<div class="power">${entity.capabilities.includes('power_on') ? html`<button ?disabled=${disabled} @click=${() => this.emit({ type: 'power_on' })}>${this.t('turnOn')}</button>` : nothing}${entity.capabilities.includes('power_off') ? html`<button ?disabled=${disabled} @click=${() => this.emit({ type: 'power_off' })}>${this.t('turnOff')}</button>` : nothing}</div>
      ${entity.capabilities.includes('remote_activity') && activities?.length ? html`<label>${this.t('remoteActivity')}<select aria-label=${this.t('remoteActivity')} .value=${selected} ?disabled=${disabled} @change=${(event: Event) => this.emit({ type: 'remote_activity', value: (event.target as HTMLSelectElement).value })}>${!selected ? html`<option value="" disabled selected>${this.t('chooseActivityUnknown')}</option>` : nothing}${activities.map(value => html`<option value=${value} .selected=${value === selected}>${value}</option>`)}</select></label>` : nothing}`;
  }
}
if (!customElements.get('navet-remote-controls')) customElements.define('navet-remote-controls', NavetRemoteControls);
