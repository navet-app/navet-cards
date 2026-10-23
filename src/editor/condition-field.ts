import { LitElement, html, css, nothing } from 'lit';
import { validateCondition, type Condition } from '../conditions';
import type { Hass } from '../providers/home-assistant';
export class NavetConditionField extends LitElement {
  static properties = { value: { attribute: false, noAccessor: true }, hass: { attribute: false }, label: {}, error: { state: true } };
  private draft?: Condition;
  private external?: Condition;
  get value() { return this.draft; }
  set value(value: Condition | undefined) {
    if (value === this.external) return;
    this.external = value; this.draft = structuredClone(value); this.error = ''; this.requestUpdate();
  }
  hass?: Hass;
  label = 'Visibility condition';
  private error = '';
  static styles = css`:host{display:block}fieldset{border:1px solid var(--divider-color,#aaa);border-radius:10px;display:grid;gap:12px;padding:12px}label{display:grid;gap:6px;font-size:13px}input,select,textarea{box-sizing:border-box;width:100%;font:inherit;min-height:40px;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px}[role=alert]{color:var(--error-color,#b33)}`;
  private emit(value?: Condition) {
    this.draft = structuredClone(value);
    try {
      if (value) validateCondition(value);
      this.error = '';
      this.dispatchEvent(new CustomEvent('value-changed', { detail: { value: structuredClone(value) }, bubbles: true, composed: true }));
    } catch (error) { this.error = (error as Error).message; }
    this.requestUpdate();
  }
  private patch(patch: Record<string, unknown>, mode?: string) { if (mode && this.mode !== mode) return; this.emit({ ...structuredClone(this.value), ...patch } as Condition); }
  private get mode() { const v = this.value; return !v ? 'none' : 'state' in v ? 'state' : 'available' in v ? 'availability' : 'equals' in v ? 'attribute' : 'entity' in v ? 'numeric' : 'group'; }
  private setMode(mode: string) {
    const value = { ...structuredClone(this.value) } as Record<string, unknown>;
    const entity = value.entity ?? Object.keys(this.hass?.states ?? {})[0] ?? 'sensor.example';
    for (const key of ['entity','state','available','attribute','above','below','equals','all','any','not']) delete value[key];
    if (mode === 'none') this.emit(undefined);
    else if (mode === 'state') this.emit({ ...value, entity, state: 'on' } as Condition);
    else if (mode === 'availability') this.emit({ ...value, entity, available: true } as Condition);
    else if (mode === 'numeric') this.emit({ ...value, entity, above: 0 } as Condition);
    else if (mode === 'attribute') this.emit({ ...value, entity, attribute: 'friendly_name', equals: '' } as Condition);
    else this.emit({ ...value, all: [{ entity: entity as string, state: 'on' }] });
  }
  private bound(key: string, event: Event) {
    if (this.mode !== 'numeric') return;
    const raw = (event.target as HTMLInputElement).value;
    const value = { ...this.value } as Record<string, unknown>;
    if (!raw.trim()) delete value[key]; else value[key] = Number(raw);
    this.emit(value as Condition);
  }
  private scalarType(type: string) {
    if (this.mode !== 'attribute') return;
    this.patch({ equals: type === 'number' ? 0 : type === 'boolean' ? false : type === 'null' ? null : '' }, 'attribute');
  }
  private get valueType() { const value = this.value?.equals; return value === null ? 'null' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string'; }
  private scalarValue(event: Event, type: string) {
    if (this.mode !== 'attribute' || this.valueType !== type) return;
    const raw = (event.target as HTMLInputElement).value;
    this.patch({ equals: type === 'number' ? raw.trim() ? Number(raw) : NaN : type === 'boolean' ? raw === 'true' : raw }, 'attribute');
  }
  render() {
    const v = this.value;
    const scalarType = this.valueType;
    return html`<fieldset><legend>${this.label}</legend><label>Condition type<select aria-label="Condition type" .value=${this.mode} @change=${(e: Event) => this.setMode((e.target as HTMLSelectElement).value)}><option value="none" .selected=${this.mode === 'none'}>Always visible</option><option value="state" .selected=${this.mode === 'state'}>Entity state</option><option value="availability" .selected=${this.mode === 'availability'}>Entity availability</option><option value="numeric" .selected=${this.mode === 'numeric'}>Numeric range</option><option value="attribute" .selected=${this.mode === 'attribute'}>Attribute value</option><option value="group" .selected=${this.mode === 'group'}>Combined conditions (JSON)</option></select></label>
    ${v && 'entity' in v ? html`<label>Condition entity<input list="condition-entities" .value=${v.entity as string} @change=${(e: Event) => this.patch({ entity: (e.target as HTMLInputElement).value })}></label><datalist id="condition-entities">${Object.keys(this.hass?.states ?? {}).map(id => html`<option value=${id}>${this.hass?.states[id]?.attributes.friendly_name ?? id}</option>`)}</datalist>` : nothing}
    ${this.mode === 'state' ? html`<label>Entity state<input .value=${v?.state as string} @change=${(e: Event) => this.patch({ state: (e.target as HTMLInputElement).value }, 'state')}></label>` : nothing}
    ${this.mode === 'availability' ? html`<label>Availability<select aria-label="Availability" .value=${String(v?.available)} @change=${(e: Event) => this.patch({ available: (e.target as HTMLSelectElement).value === 'true' }, 'availability')}><option value="true" .selected=${v?.available === true}>Available</option><option value="false" .selected=${v?.available === false}>Unavailable or missing</option></select></label>` : nothing}
    ${this.mode === 'attribute' ? html`<label>Attribute name<input .value=${v?.attribute as string} @change=${(e: Event) => this.patch({ attribute: (e.target as HTMLInputElement).value }, 'attribute')}></label><label>Attribute value type<select aria-label="Attribute value type" .value=${scalarType} @change=${(e: Event) => this.scalarType((e.target as HTMLSelectElement).value)}>${['string','number','boolean','null'].map(type => html`<option value=${type} .selected=${scalarType === type}>${type}</option>`)}</select></label>${scalarType === 'null' ? html`<p>Matches an explicitly reported null attribute, not a missing attribute.</p>` : scalarType === 'boolean' ? html`<label>Attribute equals<select aria-label="Attribute equals" .value=${String(v?.equals)} @change=${(e: Event) => this.scalarValue(e, scalarType)}><option value="false" .selected=${v?.equals === false}>false</option><option value="true" .selected=${v?.equals === true}>true</option></select></label>` : html`<label>Attribute equals<input type=${scalarType === 'number' ? 'number' : 'text'} step="any" .value=${typeof v?.equals === 'number' && !Number.isFinite(v.equals) ? '' : String(v?.equals ?? '')} @change=${(e: Event) => this.scalarValue(e, scalarType)}></label>`}<p>Types must match exactly. Attribute names are literal keys.</p>` : nothing}
    ${this.mode === 'numeric' ? html`<label>Attribute (optional)<input .value=${(v?.attribute as string) ?? ''} @change=${(e: Event) => { if (this.mode !== 'numeric') return; const value = { ...v } as Record<string, unknown>; const attribute = (e.target as HTMLInputElement).value; if (attribute) value.attribute = attribute; else delete value.attribute; this.emit(value as Condition); }}></label><label>Above (exclusive)<input type="number" step="any" .value=${v?.above === undefined ? '' : String(v.above)} @change=${(e: Event) => this.bound('above', e)}></label><label>Below (exclusive)<input type="number" step="any" .value=${v?.below === undefined ? '' : String(v.below)} @change=${(e: Event) => this.bound('below', e)}></label>` : nothing}
    ${this.mode === 'group' ? html`<p>Use all, any or not to combine entity conditions.</p><label>Combined conditions (JSON)<textarea rows="8" .value=${JSON.stringify(v, null, 2)} @change=${(e: Event) => { try { this.emit(validateCondition(JSON.parse((e.target as HTMLTextAreaElement).value))); } catch (error) { this.error = (error as Error).message; } }}></textarea></label>` : nothing}
    ${this.error ? html`<p role="alert">${this.error}</p>` : nothing}</fieldset>`;
  }
}
if (!customElements.get('navet-condition-field')) customElements.define('navet-condition-field', NavetConditionField);
