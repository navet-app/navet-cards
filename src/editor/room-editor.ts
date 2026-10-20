import { LitElement, html, css, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { ref } from 'lit/directives/ref.js';
import { validateConfig, type CardConfig } from '../config';
import { serializeConfigDraft } from '../config/draft';
import { createRoomCatalog } from '../providers/room-catalog';
import type { Hass } from '../providers/home-assistant';
import { planRoom, ROOM_RECIPES, ROOM_ROLES, type RoomPlan, type RoomPlannedMember } from '../rooms/planner';
import type { RoomMember, RoomSection } from '../rooms/types';
import './ordered-entities';

/** Local visual draft. Save emits a complete validated config; cancel never touches HA config. */
export class NavetRoomEditor extends LitElement {
  static properties = { hass: { attribute: false } };
  hass?: Hass;
  private saved?: CardConfig;
  private draft?: CardConfig;
  private error = '';
  private snapshot = '';
  private showSnapshot = false;
  private previewElement?: Element;
  private previewConfig?: CardConfig;
  get config() { return this.saved; }
  set config(value: CardConfig | undefined) {
    if (value === this.saved) return;
    const setupKeys = ['config_version', 'room', 'area', 'entities', 'panel_id'] as const;
    const setup = (config: CardConfig) => setupKeys.map((key) => config[key]);
    const local = this.draft;
    const keepDraft = value && this.saved && local && JSON.stringify(setup(value)) === JSON.stringify(setup(this.saved));
    this.saved = value;
    this.draft = value ? structuredClone(value) : undefined;
    if (keepDraft && this.draft && local) for (const key of setupKeys) {
      if (Object.hasOwn(local, key)) Object.defineProperty(this.draft, key, { value: structuredClone(local[key]), enumerable: true, writable: true, configurable: true });
      else delete this.draft[key];
    }
    this.error = '';
    this.requestUpdate();
  }
  static styles = css`
    :host{display:block;color:var(--primary-text-color,#222);font:14px system-ui}*{box-sizing:border-box}
    .setup,.fields{display:grid;gap:12px;min-width:0}label{display:grid;gap:5px;min-width:0}p,small{font-size:12px;line-height:1.5;overflow-wrap:anywhere}details,.member,.preview,navet-ordered-entities{min-width:0}
    input,select,textarea,button{font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:10px;min-height:42px;max-width:100%}
    input,select,textarea{width:100%}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--primary-color,#ea8c55);outline-offset:2px}
    .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;min-width:0}.row>*{flex:1;min-width:0}.row button{flex:0 0 auto}small{display:block;opacity:.75}navet-room-card{display:block;width:100%;max-width:360px;height:220px;margin:10px 0}
    details,.preview{border:1px solid var(--divider-color,#bbb);border-radius:10px;padding:12px}summary{cursor:pointer;font-weight:600}.fields{margin-top:12px}.member{border-top:1px solid var(--divider-color,#bbb);padding-top:12px}.check{display:flex;gap:8px;align-items:center}.check input{width:20px;min-height:20px}.error{color:var(--error-color,#b33)}.muted{opacity:.75}ul{padding-left:22px}.preview h4{margin:12px 0 6px}.preview li{margin:6px 0}
    @media(max-width:420px){.row{align-items:stretch}.row>label{flex-basis:100%}}
  `;
  private get plan(): RoomPlan | undefined {
    return this.draft && this.hass ? planRoom(this.draft, createRoomCatalog(this.hass)) : undefined;
  }
  private edit(patch: Record<string, unknown>) {
    if (!this.draft) return;
    try { this.draft = serializeConfigDraft(this.draft, patch, 'room'); this.error = ''; }
    catch (error) { this.error = error instanceof Error ? error.message : 'Invalid room configuration.'; }
    this.requestUpdate();
  }
  private save() {
    if (!this.draft) return;
    try {
      const config = validateConfig(this.draft, 'room');
      this.dispatchEvent(new CustomEvent('room-config-changed', { detail: { config }, bubbles: true, composed: true }));
      this.saved = config; this.draft = structuredClone(config); this.error = '';
    } catch (error) { this.error = error instanceof Error ? error.message : 'Invalid room configuration.'; }
    this.requestUpdate();
  }
  private enableSetup() {
    if (!this.draft) return;
    this.edit({ config_version: 2, room: { membership: this.draft.entities ? { mode: 'explicit', entities: this.draft.entities } : this.draft.area ? { mode: 'area' } : { mode: 'explicit', entities: [] } } });
  }
  private materializedMembers(plan = this.plan): RoomMember[] {
    const existing = new Map((this.draft?.room?.members ?? []).map((member) => [member.entity, member]));
    const active = plan?.members.map((member) => ({ ...existing.get(member.entity), id: member.id, entity: member.entity })) ?? [];
    const activeEntities = new Set(active.map((member) => member.entity));
    return [...active, ...[...existing.values()].filter((member) => !activeEntities.has(member.entity))];
  }
  private memberEdit(member: RoomPlannedMember, patch: Partial<RoomMember>) {
    this.edit({ room: { members: this.materializedMembers().map((row) => row.id === member.id ? { ...row, ...patch } : row) } });
  }
  private explicit(entities: string[]) {
    this.edit({ room: { membership: { mode: 'explicit', entities, include: undefined, exclude: undefined } } });
  }
  private mode(mode: string) {
    if (mode === 'explicit') this.explicit(this.plan?.memberIds ?? []);
    else {
      const area = this.draft?.area ?? Object.keys(this.hass?.areas ?? {})[0];
      if (!area) { this.error = 'No area registry is available. Select entities explicitly.'; this.requestUpdate(); return; }
      this.edit({ area, room: { membership: { mode: 'area', entities: undefined, include: undefined, exclude: undefined } } });
    }
  }
  private chooseRecipe(recipe: string) {
    const plan = this.plan;
    if (!plan) return;
    const members = this.materializedMembers(plan).map((member) => ({ ...member, recipe, control: recipe === 'state' ? 'state' : 'auto' }));
    const group = (id: string, name: string, predicate: (member: RoomPlannedMember) => boolean): RoomSection => ({ id, name, members: plan.members.filter(predicate).map((member) => member.id) });
    let sections: RoomSection[] | undefined;
    if (recipe === 'kitchen') sections = [group('readings', 'Readings', (m) => !m.model.capabilities.length), group('lights', 'Lighting', (m) => m.kind === 'light'), group('devices', 'Devices', (m) => m.model.capabilities.length > 0 && m.kind !== 'light')];
    if (recipe === 'comfort') sections = [group('comfort', 'Comfort readings', (m) => !m.model.capabilities.length), group('comfort-controls', 'Comfort controls', (m) => ['climate', 'cover', 'fan', 'humidifier', 'water-heater'].includes(m.kind)), group('other', 'Other devices', (m) => m.model.capabilities.length > 0 && !['climate', 'cover', 'fan', 'humidifier', 'water-heater'].includes(m.kind))];
    if (recipe === 'media') sections = [group('media', 'Media', (m) => ['media','remote'].includes(m.kind)), group('other', 'Room', (m) => !['media','remote'].includes(m.kind))];
    if (recipe === 'entry') sections = [group('entry', 'Entry and security', (m) => ['security', 'door', 'window', 'occupancy'].includes(m.role)), group('other', 'Room', (m) => !['security', 'door', 'window', 'occupancy'].includes(m.role))];
    this.edit({ room: { members, sections: sections?.filter((section) => section.members.length) } });
  }
  private sectionEdit(index: number, patch: Partial<RoomSection>) {
    const sections = structuredClone(this.draft?.room?.sections ?? []);
    sections[index] = { ...sections[index], ...patch };
    this.edit({ room: { sections } });
  }
  private moveSection(index: number, delta: number) {
    const sections = [...(this.draft?.room?.sections ?? [])];
    [sections[index], sections[index + delta]] = [sections[index + delta], sections[index]];
    this.edit({ room: { sections } });
  }
  private remap(member: RoomPlannedMember, entity: string) {
    const plan = this.plan;
    if (!plan || entity === member.entity) return;
    if (plan.memberIds.includes(entity)) { this.error = 'That entity is already in this room. Choose a different entity.'; this.requestUpdate(); return; }
    this.edit({ room: {
      membership: { mode: 'explicit', entities: plan.memberIds.map((id) => id === member.entity ? entity : id), include: undefined, exclude: undefined },
      members: this.materializedMembers(plan).map((row) => row.id === member.id ? { ...row, entity } : row),
    } });
  }
  private importSnapshot() {
    try {
      const imported = validateConfig(JSON.parse(this.snapshot), 'room');
      this.draft = structuredClone(imported); this.error = '';
      if (!this.draft.room) this.enableSetup();
    } catch (error) { this.error = error instanceof Error ? error.message : 'Invalid room snapshot.'; }
    this.requestUpdate();
  }
  private entityOptions(selected?: string) {
    const ids = this.hass ? createRoomCatalog(this.hass).entityIds : [];
    if (selected && !ids.includes(selected)) ids.unshift(selected);
    return ids.map((id) => html`<option value=${id} .selected=${live(id === selected)}>${this.hass?.states[id]?.attributes.friendly_name ?? id} · ${id}</option>`);
  }
  private preview(element: Element | undefined) {
    if (!element || !this.draft) return;
    const card = element as HTMLElement & { preview: boolean; hass?: Hass; setConfig(config: CardConfig): void };
    if (!card.preview) card.preview = true;
    if (this.previewElement !== element || this.previewConfig !== this.draft) {
      card.setConfig(this.draft);
      this.previewElement = element; this.previewConfig = this.draft;
    }
    card.hass = this.hass;
  }
  render() {
    const c = this.draft;
    if (!c) return nothing;
    const plan = this.plan;
    const room = c.config_version === 2 ? c.room : undefined;
    return html`<div class="setup">
      ${!room ? html`<p>Keep the existing room, or customize membership, controls and sections visually.</p><button type="button" @click=${() => this.enableSetup()}>Customize room setup</button>
        <label>Room area<select aria-label="Room area" .value=${c.area ?? ''} @change=${(e: Event) => this.edit({ area: (e.target as HTMLSelectElement).value || undefined })}><option value="">Choose an area</option>${Object.entries(this.hass?.areas ?? {}).map(([id, area]) => html`<option value=${id} .selected=${live(c.area === id)}>${area.name}</option>`)}</select></label>
        <navet-ordered-entities .value=${c.entities ?? []} .hass=${this.hass} label="Explicit room entities" @value-changed=${(e: CustomEvent) => { e.stopPropagation(); this.edit({ entities: e.detail.value.length ? e.detail.value : undefined }); }}></navet-ordered-entities>` : html`
      <label>Membership<select aria-label="Membership" .value=${room.membership.mode} @change=${(e: Event) => this.mode((e.target as HTMLSelectElement).value)}><option value="area" .selected=${live(room.membership.mode === 'area')}>Live area membership</option><option value="explicit" .selected=${live(room.membership.mode === 'explicit')}>Selected entities (snapshot)</option></select></label>
      ${room.membership.mode === 'area' ? html`
        <label>Room area<select aria-label="Room area" .value=${c.area ?? ''} @change=${(e: Event) => this.edit({ area: (e.target as HTMLSelectElement).value })}>${Object.entries(this.hass?.areas ?? {}).map(([id, area]) => html`<option value=${id} .selected=${live(c.area === id)}>${area.name}</option>`)}</select></label>
        <p>New eligible entities in this area join automatically. Exclusions always win.</p>
        <details><summary>Include and exclude entities</summary><div class="fields">
          <navet-ordered-entities .value=${room.membership.include ?? []} .hass=${this.hass} label="Additional entities" @value-changed=${(e: CustomEvent) => { e.stopPropagation(); this.edit({ room: { membership: { include: e.detail.value } } }); }}></navet-ordered-entities>
          <navet-ordered-entities .value=${room.membership.exclude ?? []} .hass=${this.hass} label="Excluded entities" @value-changed=${(e: CustomEvent) => { e.stopPropagation(); this.edit({ room: { membership: { exclude: e.detail.value } } }); }}></navet-ordered-entities>
        </div></details><button type="button" @click=${() => this.explicit(plan?.memberIds ?? [])}>Freeze current membership as snapshot</button>` : html`
        <navet-ordered-entities .value=${room.membership.entities ?? []} .hass=${this.hass} label="Room entities" @value-changed=${(e: CustomEvent) => { e.stopPropagation(); this.explicit(e.detail.value); }}></navet-ordered-entities>
        ${!this.hass?.entities ? html`<p>No area registry is available. Entity selection works without it.</p>` : nothing}`}
      <label>Apply room recipe<select aria-label="Apply room recipe" .value=${''} @change=${(e: Event) => { this.chooseRecipe((e.target as HTMLSelectElement).value); (e.target as HTMLSelectElement).value = ''; }}><option value="">Choose a starting layout</option>${ROOM_RECIPES.map((recipe) => html`<option value=${recipe}>${recipe}</option>`)}</select></label>
      <details><summary>Device labels, roles and controls</summary><div class="fields">${plan?.members.map((member) => {
        const saved = room.members?.find((row) => row.entity === member.entity);
        return html`<div class="member"><strong>${member.model.name}</strong><small>${member.entity}</small><div class="row">
          <label>Label for ${member.entity}<input .value=${saved?.name ?? ''} @change=${(e: Event) => this.memberEdit(member, { name: (e.target as HTMLInputElement).value || undefined })}></label>
          <label>Role for ${member.entity}<select aria-label=${`Role for ${member.entity}`} .value=${saved?.role ?? 'auto'} @change=${(e: Event) => this.memberEdit(member, { role: (e.target as HTMLSelectElement).value })}>${ROOM_ROLES.map((role) => html`<option value=${role} .selected=${live((saved?.role ?? 'auto') === role)}>${role}</option>`)}</select></label>
          <label>Control for ${member.entity}<select aria-label=${`Control for ${member.entity}`} .value=${saved?.control ?? 'auto'} @change=${(e: Event) => this.memberEdit(member, { control: (e.target as HTMLSelectElement).value as RoomMember['control'] })}>${['auto', 'state', 'toggle', 'slider', 'select'].map((control) => html`<option value=${control} .selected=${live((saved?.control ?? 'auto') === control)}>${control}</option>`)}</select></label>
        </div></div>`;
      })}</div></details>
      <details><summary>Sections and order</summary><div class="fields">
        <label class="check"><input type="checkbox" .checked=${room.sections === undefined} @change=${(e: Event) => this.edit({ room: { members: this.materializedMembers(), sections: (e.target as HTMLInputElement).checked ? undefined : plan?.sections.map((section) => ({ id: section.id, name: section.name, members: section.members.map((member) => member.id) })) ?? [] } })}>Arrange sections automatically</label>
        ${room.sections?.map((section, index) => html`<div class="member"><div class="row"><label>Section ${index + 1} name<input .value=${section.name ?? ''} @change=${(e: Event) => this.sectionEdit(index, { name: (e.target as HTMLInputElement).value })}></label><button type="button" aria-label=${`Move section ${index + 1} up`} ?disabled=${index === 0} @click=${() => this.moveSection(index, -1)}>↑</button><button type="button" aria-label=${`Move section ${index + 1} down`} ?disabled=${index === room.sections!.length - 1} @click=${() => this.moveSection(index, 1)}>↓</button><button type="button" aria-label=${`Remove section ${index + 1}`} @click=${() => this.edit({ room: { sections: room.sections!.filter((_, n) => n !== index) } })}>Remove</button></div>
          <navet-ordered-entities .value=${section.members.map((id) => room.members?.find((member) => member.id === id)?.entity).filter((id): id is string => !!id)} .hass=${this.hass} label=${`Entities in section ${index + 1}`} @value-changed=${(e: CustomEvent) => { e.stopPropagation(); const wanted = e.detail.value as string[]; const all = this.materializedMembers(); const missing = wanted.filter((id) => !all.some((m) => m.entity === id)); if (missing.length) { this.error = 'Add entities to room membership before putting them in a section.'; this.requestUpdate(); return; } this.sectionEdit(index, { members: wanted.map((id) => all.find((m) => m.entity === id)!.id) }); }}></navet-ordered-entities>
        </div>`)}
        <button type="button" @click=${() => { const sections = room.sections ?? []; let n = sections.length + 1; while (sections.some((section) => section.id === `section-${n}`)) n++; this.edit({ room: { members: this.materializedMembers(), sections: [...sections, { id: `section-${n}`, name: 'New section', members: [] }] } }); }}>Add section</button>
      </div></details>
      <details><summary>Duplicate, import and remap</summary><div class="fields"><p>Export a room snapshot, import it into another room card, then choose its area and remap each entity. Commands are never sent from this editor.</p>
        <button type="button" @click=${() => { this.snapshot = JSON.stringify(c, null, 2); this.showSnapshot = true; this.requestUpdate(); }}>Export room snapshot</button><button type="button" @click=${() => { this.showSnapshot = true; this.requestUpdate(); }}>Import room snapshot</button>
        ${this.showSnapshot ? html`<label>Room snapshot JSON<textarea rows="8" .value=${this.snapshot} @input=${(e: Event) => { this.snapshot = (e.target as HTMLTextAreaElement).value; }}></textarea></label><button type="button" @click=${() => this.importSnapshot()}>Load snapshot into draft</button>` : nothing}
        ${plan?.members.map((member) => html`<label>Remap ${member.entity}<select aria-label=${`Remap ${member.entity}`} .value=${member.entity} @change=${(e: Event) => this.remap(member, (e.target as HTMLSelectElement).value)}>${this.entityOptions(member.entity)}</select></label>`)}
      </div></details>`}
      <label>Room panel hash<input .value=${c.panel_id ?? ''} placeholder="#kitchen" @change=${(e: Event) => this.edit({ panel_id: (e.target as HTMLInputElement).value || undefined })}></label>
      <div class="preview" aria-label="Room setup preview"><strong>Read-only room preview</strong><navet-room-card ${ref((element) => this.preview(element))}></navet-room-card><p>${plan?.members.length ?? 0} entities · ${room?.membership.mode === 'area' ? 'live area' : room ? 'snapshot' : 'existing membership'}</p>${plan?.sections.map((section) => html`<h4>${section.name}</h4><ul>${section.members.map((member) => html`<li>${member.model.name} · ${member.model.value} ${member.model.unit}${member.model.available ? '' : ' · Unavailable'} · ${member.control}</li>`)}</ul>`)}${plan?.members.length === 0 ? html`<p>No entities selected. Add entities or choose an area.</p>` : nothing}${plan?.diagnostics.map((diagnostic) => html`<p role="status">${diagnostic.message}</p>`)}</div>
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      <div class="row"><button type="button" @click=${() => this.save()}>Save room setup</button><button type="button" @click=${() => { this.draft = this.saved ? structuredClone(this.saved) : undefined; this.error = ''; this.requestUpdate(); }}>Cancel room changes</button></div>
    </div>`;
  }
}
if (!customElements.get('navet-room-editor')) customElements.define('navet-room-editor', NavetRoomEditor);
