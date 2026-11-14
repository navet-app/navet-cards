import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { translate } from '../i18n';
import type { CardEntity } from '../core';
import type { MediaGroupCandidate, MediaGroupCommand, MediaGroupFields } from '../providers/media-groups';

/** Explicit grouping UI receives normalized candidates only; the provider validates dispatch. */
export class NavetMediaGroups extends LitElement {
  static properties = { entity: { attribute: false }, candidates: { attribute: false }, disabled: { type: Boolean }, preview: { type: Boolean }, language: {} };
  entity?: CardEntity & MediaGroupFields;
  candidates: MediaGroupCandidate[] = [];
  disabled = false;
  preview = false;
  language = 'en';
  private t(key: string) { return translate(key,this.language); }
  private selected = new Set<string>();
  private context = '';
  static styles = css`
    :host{display:block;min-width:0;color:var(--text,inherit)}.group{display:grid;gap:10px;padding:12px 0}h3{margin:0;font-size:14px}p{font-size:12px;line-height:1.5;margin:0}ul{margin:0;padding-inline-start:20px;font-size:13px;overflow-wrap:anywhere}fieldset{margin:0;border:1px solid var(--edge,var(--divider-color,#aaa));border-radius:10px;padding:8px;min-width:0}legend{font-size:12px;padding:0 4px}label{display:flex;align-items:center;gap:8px;min-height:44px;font-size:13px;overflow-wrap:anywhere}input{flex:0 0 auto;width:20px;height:20px;accent-color:var(--accent,var(--primary-color,#ea8c55))}.hint{font-size:11px;opacity:.7}.buttons{display:flex;gap:8px;flex-wrap:wrap}button{flex:1;min-height:44px;box-sizing:border-box;font:inherit;color:inherit;background:var(--control,transparent);border:1px solid var(--edge,var(--divider-color,#aaa));border-radius:8px;padding:8px}button:disabled{opacity:.5}label:has(input:disabled){opacity:.65}
  `;
  private signature() {
    const entity = this.entity;
    return JSON.stringify([entity?.externalId,entity?.available,entity?.capabilities.filter((cap) => cap === 'media_join' || cap === 'media_unjoin'),entity?.mediaGroupMembers,this.candidates,this.disabled,this.preview]);
  }
  protected willUpdate(_changed: PropertyValues) {
    const context = this.signature();
    if (context !== this.context) { this.selected.clear(); this.context = context; }
  }
  disconnectedCallback() { this.selected.clear(); this.context = ''; super.disconnectedCallback(); }
  private emit(command: MediaGroupCommand) {
    const entity = this.entity;
    if (this.preview || this.disabled || !entity?.available || !entity.capabilities.includes(command.type) || this.context !== this.signature()) return;
    if (command.type === 'media_join' && (!command.members.length || command.members.some((id) => id === entity.externalId || !this.candidates.some((candidate) => candidate.id === id && candidate.available)))) return;
    this.dispatchEvent(new CustomEvent('control-command', { detail: { command }, bubbles: true, composed: true }));
    this.selected.clear(); this.requestUpdate();
  }
  render() {
    const entity = this.entity;
    if (!entity || !entity.capabilities.some((cap) => cap === 'media_join' || cap === 'media_unjoin')) return nothing;
    const disabled = this.disabled || this.preview || !entity.available;
    const candidates = this.candidates.filter((candidate) => candidate.id !== entity.externalId);
    const name = (id: string) => id === entity.externalId ? entity.name : candidates.find((candidate) => candidate.id === id)?.name ?? id;
    return html`<section class="group" aria-label=${this.t('mediaGrouping')}><h3>${this.t('mediaGrouping')}</h3>
      <p>${this.t('reportedGroupMembers')}</p>${entity.mediaGroupMembers === undefined ? html`<p>${this.t('groupMembershipUnknown')}</p>` : entity.mediaGroupMembers.length ? html`<ul>${entity.mediaGroupMembers.map((id) => html`<li>${name(id)}</li>`)}</ul>` : html`<p>${this.t('noGroupMembersReported')}</p>`}
      ${entity.capabilities.includes('media_join') ? html`<fieldset ?disabled=${disabled}><legend>${this.t('playersJoinTo').replace('{name}',entity.name)}</legend>${candidates.length ? candidates.map((candidate) => html`<label><input type="checkbox" .checked=${this.selected.has(candidate.id)} ?disabled=${disabled || !candidate.available} @change=${(event: Event) => { if (disabled || !candidate.available || this.context !== this.signature()) return; if ((event.target as HTMLInputElement).checked) this.selected.add(candidate.id); else this.selected.delete(candidate.id); this.requestUpdate(); }}><span>${candidate.name}${!candidate.available ? html` <span class="hint">${this.t('unavailable')}</span>` : nothing}</span></label>`) : html`<p>${this.t('noOtherMediaPlayers')}</p>`}</fieldset><p>${this.t('groupCompatibility')}</p>` : nothing}
      <div class="buttons">${entity.capabilities.includes('media_join') ? html`<button type="button" ?disabled=${disabled || !this.selected.size} @click=${() => this.emit({type:'media_join',members:[...this.selected]})}>${this.t('joinSelected')}</button>` : nothing}${entity.capabilities.includes('media_unjoin') ? html`<button type="button" ?disabled=${disabled} @click=${() => this.emit({type:'media_unjoin'})}>${this.t('leaveGroup')}</button>` : nothing}</div>
    </section>`;
  }
}
if (!customElements.get('navet-media-groups')) customElements.define('navet-media-groups', NavetMediaGroups);
