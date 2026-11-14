import {LitElement,html,css,nothing} from 'lit';
import type {CardEntity} from '../core';
import type {UpdateCapability,UpdateCommand,UpdateFields} from '../providers/updates';

type UpdateEntity=Omit<CardEntity,'capabilities'>&UpdateFields&{capabilities:(CardEntity['capabilities'][number]|UpdateCapability)[]};
/** Emits deliberate intents only. The owner confirms installation before dispatch. */
export class NavetUpdateControls extends LitElement {
  static properties={entity:{attribute:false},disabled:{type:Boolean}};
  entity?:UpdateEntity;
  disabled=false;
  static styles=css`:host{display:block;min-width:0;font:inherit}dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;font-size:13px}dt{opacity:.75}dd{margin:0;text-align:right;overflow-wrap:anywhere}.summary{font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:8px}button,a{box-sizing:border-box;min-height:44px;padding:10px 12px;border:1px solid var(--divider-color,#aaa);border-radius:10px;background:var(--card-background-color,#fff);color:inherit;font:inherit;font-size:13px}button{cursor:pointer}button:disabled,a[aria-disabled=true]{opacity:.6;cursor:default}a{display:inline-flex;align-items:center;text-decoration:none;margin:8px 0}progress{width:100%;height:16px;accent-color:var(--primary-color,#f97316)}.status{font-size:13px}button:focus-visible,a:focus-visible{outline:2px solid var(--primary-color,#f97316);outline-offset:2px}`;
  private emit(command:UpdateCommand){const e=this.entity;if(this.disabled||!e?.available||!e.capabilities.includes(command.type))return;this.dispatchEvent(new CustomEvent('control-command',{detail:{command},bubbles:true,composed:true}));}
  render(){const e=this.entity;if(!e)return nothing;const disabled=this.disabled||!e.available;return html`
    <dl><dt>Installed version</dt><dd>${e.updateInstalledVersion??'Unknown'}</dd><dt>Latest version</dt><dd>${e.updateLatestVersion??'Unknown'}</dd>${e.updateSkippedVersion?html`<dt>Skipped version</dt><dd>${e.updateSkippedVersion}</dd>`:nothing}</dl>
    ${e.updateInProgress?html`<p class="status" role="status">Installing${e.updatePercentage!==undefined?` · ${e.updatePercentage}%`:'…'}</p>${e.updatePercentage!==undefined?html`<progress aria-label="Installation progress" max="100" value=${e.updatePercentage}></progress>`:html`<progress aria-label="Installation in progress"></progress>`}`:nothing}
    ${e.updateReleaseSummary?html`<p class="summary">${e.updateReleaseSummary}</p>`:nothing}
    ${e.updateReleaseUrl?html`<a href=${disabled?nothing:e.updateReleaseUrl} target="_blank" rel="noopener noreferrer" aria-disabled=${String(disabled)} tabindex=${disabled?-1:0}>Release page</a>`:nothing}
    <div class="actions">${e.capabilities.includes('update_install')&&e.updateLatestVersion?html`<button ?disabled=${disabled} @click=${()=>this.emit({type:'update_install',latestVersion:e.updateLatestVersion!})}>Install latest</button>`:nothing}
    ${e.capabilities.includes('update_skip')&&e.updateLatestVersion?html`<button ?disabled=${disabled} @click=${()=>this.emit({type:'update_skip',latestVersion:e.updateLatestVersion!})}>Skip version</button>`:nothing}
    ${e.capabilities.includes('update_clear_skipped')&&e.updateSkippedVersion?html`<button ?disabled=${disabled} @click=${()=>this.emit({type:'update_clear_skipped',skippedVersion:e.updateSkippedVersion!})}>Clear skipped</button>`:nothing}</div>`;}
}
if(!customElements.get('navet-update-controls'))customElements.define('navet-update-controls',NavetUpdateControls);
