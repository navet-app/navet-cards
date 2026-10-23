import { LitElement, html, css, nothing } from 'lit';
import type { ActionConfig } from '../config';
import type { Hass } from '../providers/home-assistant';
export class NavetActionField extends LitElement {
  static properties = { value: { attribute: false, noAccessor: true }, allowToggle: { type: Boolean, attribute: false }, serviceOnly: { type: Boolean, attribute: false }, hass: { attribute: false }, label: {}, depth: { type: Number, attribute: false }, error: { state: true } };
  private draft: ActionConfig = { action: 'none' };
  private external?: ActionConfig;
  allowToggle = true;
  serviceOnly = false;
  get value(): ActionConfig { return this.draft; }
  set value(value: ActionConfig | undefined) {
    if (value === this.external) return;
    const old = this.draft;
    this.external = value;
    this.draft = structuredClone(value ?? { action: 'none' });
    this.requestUpdate('value', old);
  }
  hass?: Hass;
  label = 'Action';
  depth = 0;
  private error = '';
  static styles = css`:host{display:block;min-width:0}fieldset{min-width:0;border:1px solid var(--divider-color,#aaa);border-radius:10px;display:grid;gap:12px;padding:12px}label{display:grid;gap:6px;font-size:13px}input,select,textarea{box-sizing:border-box;width:100%;min-height:40px;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px}.check{display:flex;align-items:center}.check input{width:20px}button{min-height:40px;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:6px 10px}.step-actions{display:flex;flex-wrap:wrap;gap:8px}p{font-size:12px} [role=alert]{color:var(--error-color,#b33)}`;
  private emit(patch: Record<string, unknown>) {
    this.error = '';
    this.draft = { ...structuredClone(this.value), ...patch } as ActionConfig;
    if (this.serviceOnly) this.clearConfirmations(this.draft);
    this.requestUpdate();
    this.dispatchEvent(new CustomEvent('value-changed', { detail: { value: structuredClone(this.draft) }, bubbles: true, composed: true }));
  }
  private clearConfirmations(action: ActionConfig) {
    delete action.confirmation;
    action.sequence?.forEach(step => this.clearConfirmations(step));
  }
  private target(key: string, value: string) {
    const target = { ...this.value.target };
    if (value.trim()) target[key] = value.split(',').map(id => id.trim()).filter(Boolean);
    else delete target[key];
    this.emit({ target });
  }
  private json(event: Event) {
    try {
      const text = (event.target as HTMLTextAreaElement).value;
      const data: unknown = text.trim() ? JSON.parse(text) : {};
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Service data must be a JSON object.');
      this.emit({ data });
    } catch { this.error = 'Service data must be a valid JSON object.'; }
  }
  private customFields(event: Event) {
    try {
      const data: unknown = JSON.parse((event.target as HTMLTextAreaElement).value || '{}');
      if (!data || typeof data !== 'object' || Array.isArray(data) || 'action' in data || 'confirmation' in data) throw new Error();
      this.error = '';
      this.draft = { ...structuredClone(data), action: 'fire-dom-event', ...(this.value.confirmation !== undefined ? { confirmation: structuredClone(this.value.confirmation) } : {}) } as ActionConfig;
      this.requestUpdate();
      this.dispatchEvent(new CustomEvent('value-changed', { detail: { value: structuredClone(this.draft) }, bubbles: true, composed: true }));
    } catch { this.error = 'Custom event fields must be a JSON object without action or confirmation keys.'; }
  }
  private editStep(index: number, value: ActionConfig) {
    const sequence = structuredClone(this.value.sequence ?? []);
    sequence[index] = structuredClone(value); this.emit({ sequence });
  }
  private moveStep(index: number, direction: number) {
    const sequence = structuredClone(this.value.sequence ?? []);
    const next = index + direction;
    if (next < 0 || next >= sequence.length) return;
    [sequence[index], sequence[next]] = [sequence[next], sequence[index]]; this.emit({ sequence });
  }
  render() {
    const v = this.value;
    const targetText = (key: string) => { const value = v.target?.[key]; return Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : ''; };
    const services = (this.hass as Hass & { services?: Record<string, Record<string, unknown>> } | undefined)?.services ?? {};
    return html`<fieldset><legend>${this.label}</legend><label>Action type<select aria-label="Action type" .value=${v.action} @change=${(e: Event) => { const action = (e.target as HTMLSelectElement).value; this.emit({ action, ...(action === 'sequence' && !v.sequence?.length ? { sequence: [{ action: 'none' }] } : {}) }); }}>${['none','toggle','more-info','navigate','url','back','perform-action','assist','fire-dom-event','sequence'].filter(action => (!this.serviceOnly || ['none','perform-action','sequence'].includes(action)) && (this.allowToggle || action !== 'toggle' || v.action === 'toggle')).map(action => html`<option value=${action} .selected=${action === v.action} ?disabled=${action === 'toggle' && !this.allowToggle || action === 'sequence' && this.depth >= 8}>${{'none':'No action','toggle':'Toggle','more-info':'More info','navigate':'Navigate','url':'Open URL','back':'Go back','perform-action':'Perform action','assist':'Assist','fire-dom-event':'Custom DOM event','sequence':'Action sequence'}[action]}</option>`)}</select></label>
    ${v.action === 'assist' ? html`<label>Assist pipeline<input .value=${v.pipeline_id ?? ''} placeholder="last_used" @change=${(event: Event) => this.emit({ pipeline_id: (event.target as HTMLInputElement).value.trim() || undefined })}></label><p>Use last_used, preferred, or a pipeline ID.</p><label class="check"><input type="checkbox" .checked=${v.start_listening === true} @change=${(event: Event) => this.emit({ start_listening: (event.target as HTMLInputElement).checked })}>Start listening</label>` : nothing}
    ${v.action === 'fire-dom-event' ? html`<p>Emits Home Assistant's ll-custom event with this action configuration.</p><label>Custom event fields (JSON)<textarea rows="4" .value=${JSON.stringify(Object.fromEntries(Object.entries(v).filter(([key]) => !['action','confirmation'].includes(key))), null, 2)} @change=${this.customFields}></textarea></label>` : nothing}
    ${v.action === 'sequence' ? html`<p>${this.serviceOnly ? 'Service steps run in order. Release cleanup runs once after an initiated press, including after cancellation.' : 'Steps run in order. Cancelling a confirmation stops the sequence. Changes to the card cancel remaining steps; completed actions stay applied.'}</p>${(v.sequence ?? []).map((step, index) => html`<section class="sequence-step"><navet-action-field .value=${step} .hass=${this.hass} .depth=${this.depth + 1} .allowToggle=${this.allowToggle} .serviceOnly=${this.serviceOnly} .label=${`Step ${index + 1}`} @value-changed=${(event: CustomEvent<{ value: ActionConfig }>) => { event.stopPropagation(); this.editStep(index, event.detail.value); }}></navet-action-field><div class="step-actions"><button ?disabled=${index === 0} @click=${() => this.moveStep(index, -1)} aria-label=${`Move step ${index + 1} up`}>Up</button><button ?disabled=${index === (v.sequence?.length ?? 0) - 1} @click=${() => this.moveStep(index, 1)} aria-label=${`Move step ${index + 1} down`}>Down</button><button ?disabled=${(v.sequence?.length ?? 0) <= 1} @click=${() => this.emit({ sequence: v.sequence?.filter((_, position) => position !== index) })} aria-label=${`Remove step ${index + 1}`}>Remove</button></div></section>`)}<button ?disabled=${(v.sequence?.length ?? 0) >= 24} @click=${() => this.emit({ sequence: [...(v.sequence ?? []), { action: 'none' }] })}>Add action step</button><label class="check"><input type="checkbox" .checked=${v.continue_on_error === true} @change=${(event: Event) => this.emit({ continue_on_error: (event.target as HTMLInputElement).checked })}>Continue after a failed step</label>` : nothing}
    ${v.action === 'navigate' ? html`<label>Navigation path<input .value=${v.navigation_path ?? ''} placeholder="/lovelace/kitchen or #kitchen" @change=${(e: Event) => this.emit({ navigation_path: (e.target as HTMLInputElement).value })}></label><label class="check"><input type="checkbox" .checked=${v.navigation_replace === true} @change=${(e: Event) => this.emit({ navigation_replace: (e.target as HTMLInputElement).checked })}>Replace current history entry</label>` : nothing}
    ${v.action === 'url' ? html`<label>External URL<input type="url" .value=${v.url_path ?? ''} placeholder="https://example.com" @change=${(e: Event) => this.emit({ url_path: (e.target as HTMLInputElement).value })}></label>` : nothing}
    ${v.action === 'perform-action' ? html`<label>Service<input list="services" .value=${v.perform_action ?? ''} placeholder="scene.turn_on" @change=${(e: Event) => this.emit({ perform_action: (e.target as HTMLInputElement).value })}></label><datalist id="services">${Object.entries(services).flatMap(([domain, entries]) => Object.keys(entries).map(name => html`<option value=${`${domain}.${name}`}></option>`))}</datalist>
    <label>Target entities<input list="targets" .value=${targetText('entity_id')} placeholder="scene.evening" @change=${(e: Event) => this.target('entity_id', (e.target as HTMLInputElement).value)}></label><datalist id="targets">${Object.keys(this.hass?.states ?? {}).map(id => html`<option value=${id}>${this.hass?.states[id]?.attributes.friendly_name ?? id}</option>`)}</datalist>
    <label>Target areas<input list="areas" .value=${targetText('area_id')} @change=${(e: Event) => this.target('area_id', (e.target as HTMLInputElement).value)}></label><datalist id="areas">${Object.entries(this.hass?.areas ?? {}).map(([id, area]) => html`<option value=${id}>${area.name}</option>`)}</datalist><p>Separate multiple target IDs with commas.</p>
    <details><summary>Advanced service data</summary><label>Service data (JSON)<textarea rows="4" .value=${JSON.stringify(v.data ?? {}, null, 2)} @change=${this.json}></textarea></label></details>` : nothing}
    ${!this.serviceOnly && v.action !== 'none' ? html`<label class="check"><input type="checkbox" .checked=${!!v.confirmation} @change=${(e: Event) => this.emit({ confirmation: (e.target as HTMLInputElement).checked ? (v.confirmation || true) : false })}>Confirm before running</label>${v.confirmation ? html`<label>Confirmation message<input .value=${typeof v.confirmation === 'object' ? v.confirmation.text ?? '' : ''} @change=${(e: Event) => this.emit({ confirmation: { ...(typeof v.confirmation === 'object' ? v.confirmation : {}), text: (e.target as HTMLInputElement).value } })}></label>` : nothing}` : nothing}
    ${this.serviceOnly && !['none', 'perform-action', 'sequence'].includes(v.action) ? html`<p role="alert">Momentary actions require a service action or a sequence of service actions. Choose an action type to replace this unsupported action.</p>` : nothing}
    ${this.error ? html`<p role="alert">${this.error}</p>` : nothing}</fieldset>`;
  }
}
if (!customElements.get('navet-action-field')) customElements.define('navet-action-field', NavetActionField);
