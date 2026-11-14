import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { isNavetChild, loadChildCardHelpers, scopedChildConfig, type ChildCardConfig } from '../composition/child-cards';
import type { Hass } from '../providers/home-assistant';
import { recipeDefinitions, type RecipeDefinitions } from '../config/recipes';

type NativeEditor = HTMLElement & { hass?: Hass; setConfig?: (config: ChildCardConfig) => void; value?: ChildCardConfig; lovelace?: unknown };
/** Full child configs remain opaque. HA's editor owns each child's schema. */
export class NavetChildCardsEditor extends LitElement {
  static properties = { cards: { attribute: false }, definitions: { attribute: false }, hass: { attribute: false }, lovelace: { attribute: false } };
  cards: ChildCardConfig[] = [];
  definitions: RecipeDefinitions = {};
  hass?: Hass;
  lovelace?: unknown;
  private selected = -1;
  private adding = false;
  private editor?: NativeEditor;
  private editorSignature = '';
  private generation = 0;
  private error = '';
  private loading = false;
  private customType = '';
  private jsonDraft?: string;
  static styles = css`
    :host{display:block;min-width:0}.list,.edit,.add{display:grid;gap:10px;min-width:0}.item{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--divider-color,#aaa)}.label{flex:1;min-width:100px;overflow-wrap:anywhere}button,input,select,textarea{box-sizing:border-box;font:inherit;color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;min-height:44px;padding:8px;max-width:100%}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}.edit,.add{border:1px solid var(--divider-color,#aaa);border-radius:10px;padding:12px;margin-top:10px}label{display:grid;gap:6px}p{font-size:13px;line-height:1.5}.error{color:var(--error-color,#b33)}textarea{width:100%;min-height:180px;font-family:monospace;resize:vertical}hui-card-picker{display:block;max-height:560px;overflow:auto}hui-card-element-editor{display:block;min-width:0}
  `;
  disconnectedCallback() { this.generation++; this.editor = undefined; this.editorSignature = ''; super.disconnectedCallback(); }
  connectedCallback() { super.connectedCallback(); this.requestUpdate(); }
  protected updated(changed: PropertyValues) {
    if (this.selected >= this.cards.length) this.selected = -1;
    const config = this.cards[this.selected];
    const signature = config ? this.signature(this.selected, config) : '';
    if (signature !== this.editorSignature) { void this.loadEditor(signature); return; }
    if (changed.has('hass') && this.editor) this.editor.hass = this.hass;
    if (changed.has('lovelace') && this.editor) this.editor.lovelace = this.lovelace ?? { views: [] };
  }
  private scopedEditorConfig(config: ChildCardConfig): ChildCardConfig {
    if (!isNavetChild(config)) return structuredClone(config);
    const definitions = recipeDefinitions(config, this.definitions);
    return { ...structuredClone(config), ...(Object.keys(definitions).length ? { definitions } : {}) };
  }
  private signature(index: number, config: ChildCardConfig) { return `${index}:${JSON.stringify(this.scopedEditorConfig(config))}`; }
  private sourcePatch(patch: ChildCardConfig, original: ChildCardConfig): ChildCardConfig {
    const result = structuredClone(patch);
    if (!isNavetChild(original) || !result.definitions || typeof result.definitions !== 'object' || Array.isArray(result.definitions)) return result;
    const local = original.definitions && typeof original.definitions === 'object' && !Array.isArray(original.definitions) ? original.definitions as RecipeDefinitions : {};
    const definitions = Object.fromEntries(Object.entries(result.definitions).filter(([name, value]) => Object.hasOwn(local, name) || JSON.stringify(value) !== JSON.stringify(this.definitions[name])));
    if (Object.keys(definitions).length) result.definitions = definitions;
    else delete result.definitions;
    return result;
  }
  private commit(cards: ChildCardConfig[]) {
    this.cards = structuredClone(cards);
    this.dispatchEvent(new CustomEvent('child-cards-changed', { detail: { cards: structuredClone(cards) }, bubbles: true, composed: true }));
    this.requestUpdate();
  }
  private add(config: ChildCardConfig) {
    if (!config || typeof config.type !== 'string' || !config.type.trim()) { this.error = 'Choose a card type.'; this.requestUpdate(); return; }
    this.jsonDraft = undefined; this.selected = this.cards.length; this.adding = false; this.error = '';
    this.commit([...structuredClone(this.cards), structuredClone(config)]);
  }
  private move(index: number, delta: number) {
    const next = structuredClone(this.cards); [next[index], next[index + delta]] = [next[index + delta], next[index]];
    this.jsonDraft = undefined; this.selected = -1; this.commit(next);
  }
  private async loadEditor(signature: string) {
    const generation = ++this.generation;
    this.editorSignature = signature; this.editor = undefined; this.error = ''; this.loading = !!signature; this.requestUpdate();
    if (!signature) return;
    const index = this.selected; const original = structuredClone(this.cards[index]);
    const scoped = this.scopedEditorConfig(original);
    try {
      let editor: NativeEditor;
      if (customElements.get('hui-card-element-editor')) {
        editor = document.createElement('hui-card-element-editor') as NativeEditor;
        editor.hass = this.hass;
        editor.value = structuredClone(scoped); editor.lovelace = this.lovelace ?? { views: [] };
      } else {
        const helpers = await loadChildCardHelpers();
        const card = await helpers.createCardElement(scopedChildConfig(original, this.definitions));
        const constructor = card.constructor as typeof HTMLElement & { getConfigElement?: () => HTMLElement | Promise<HTMLElement> };
        if (!constructor.getConfigElement) throw new Error('This card does not expose a visual editor in this Home Assistant session. Its existing configuration is preserved.');
        editor = await constructor.getConfigElement() as NativeEditor;
        editor.setConfig?.(structuredClone(scoped));
      }
      if (generation !== this.generation || !this.isConnected) return;
      editor.hass = this.hass;
      editor.addEventListener('config-changed', (event) => {
        event.stopPropagation();
        if (generation !== this.generation || this.selected !== index || !this.isConnected) return;
        if ((event as CustomEvent).detail?.error) { this.error = (event as CustomEvent).detail.error; this.requestUpdate(); return; }
        this.error = '';
        const patch = (event as CustomEvent).detail?.config;
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;
        // An editor may omit foreign top-level keys. Keep those opaque values intact.
        const config = { ...structuredClone(this.cards[index]), ...this.sourcePatch(patch, this.cards[index]) };
        if (typeof config.type !== 'string' || !config.type.trim()) return;
        const next = structuredClone(this.cards); next[index] = config;
        // Keep a focused native editor alive across ordinary field changes.
        this.editorSignature = this.signature(index, config);
        this.commit(next);
      });
      this.editor = editor;
    } catch (error) { if (generation === this.generation) this.error = (error as Error).message; }
    finally { if (generation === this.generation) { this.loading = false; this.requestUpdate(); } }
  }
  private replaceConfig() {
    try {
      const config = JSON.parse(this.jsonDraft ?? JSON.stringify(this.cards[this.selected]));
      if (!config || typeof config !== 'object' || Array.isArray(config) || typeof config.type !== 'string' || !config.type.trim()) throw new Error('Child configuration must be an object with a nonempty type.');
      const next = structuredClone(this.cards); next[this.selected] = config;
      this.jsonDraft = undefined; this.error = ''; this.editorSignature = ''; this.commit(next);
    } catch (error) { this.error = (error as Error).message; this.requestUpdate(); }
  }
  render() {
    const nativePicker = !!customElements.get('hui-card-picker');
    return html`<div class="list">${this.cards.map((config,index) => html`<div class="item"><span class="label">${index + 1}. ${typeof config.name === 'string' ? config.name : config.type}</span>
      <button type="button" aria-label=${`Edit child card ${index + 1}`} @click=${() => { this.jsonDraft = undefined; this.selected = this.selected === index ? -1 : index; this.adding = false; this.requestUpdate(); }}>Edit</button>
      <button type="button" aria-label=${`Move child card ${index + 1} up`} ?disabled=${index === 0} @click=${() => this.move(index,-1)}>Up</button>
      <button type="button" aria-label=${`Move child card ${index + 1} down`} ?disabled=${index === this.cards.length - 1} @click=${() => this.move(index,1)}>Down</button>
      <button type="button" aria-label=${`Remove child card ${index + 1}`} @click=${() => { this.jsonDraft = undefined; this.selected = -1; this.commit(this.cards.filter((_,i) => i !== index)); }}>Remove</button></div>`)}
      <button type="button" @click=${() => { this.adding = !this.adding; this.selected = -1; this.requestUpdate(); }}>${this.adding ? 'Cancel adding child card' : 'Add child card'}</button></div>
      ${this.adding ? html`<div class="add">${nativePicker ? html`<hui-card-picker .hass=${this.hass} .lovelace=${this.lovelace ?? { views: [] }} @config-changed=${(event: CustomEvent) => { event.stopPropagation(); this.add(event.detail.config); }}></hui-card-picker>` : html`<p>Choose a native card below. Home Assistant's full card picker becomes available when loaded by the dashboard editor.</p><label>Native child card<select aria-label="Native child card" @change=${(event: Event) => { const type = (event.target as HTMLSelectElement).value; if (type) this.add({ type }); }}><option value="">Choose a card</option>${[['tile','Tile'],['history-graph','History graph'],['calendar','Calendar'],['entities','Entities'],['markdown','Markdown'],['vertical-stack','Vertical stack'],['grid','Grid']].map(([type,name]) => html`<option value=${type}>${name}</option>`)}</select></label>
      <label>Installed custom card type<input placeholder="custom:example-card" .value=${this.customType} @input=${(event: Event) => { this.customType = (event.target as HTMLInputElement).value; }}></label><button type="button" @click=${() => this.add({type:this.customType.trim()})}>Add installed custom card</button>`}</div>` : nothing}
      ${this.selected >= 0 ? html`<div class="edit"><strong>Child card ${this.selected + 1}</strong><p>Visual edits preserve existing top-level fields omitted by the child editor. To remove a saved field, use Replace complete configuration below.</p>${this.loading ? html`<p role="status">Loading child editor…</p>` : this.editor ?? nothing}<details><summary>Replace complete configuration</summary><p>This replaces the whole child configuration, including removing fields. Nested settings are preserved exactly as entered.</p><label>Child configuration JSON<textarea aria-label="Child configuration JSON" .value=${this.jsonDraft ?? JSON.stringify(this.cards[this.selected],null,2)} @input=${(event: Event) => { this.jsonDraft = (event.target as HTMLTextAreaElement).value; }}></textarea></label><button type="button" @click=${this.replaceConfig}>Replace child configuration</button></details></div>` : nothing}
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}`;
  }
}
if (!customElements.get('navet-child-cards-editor')) customElements.define('navet-child-cards-editor', NavetChildCardsEditor);
