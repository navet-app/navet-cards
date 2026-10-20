import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import type { Hass } from '../providers/home-assistant';
import { resolveRecipes, type RecipeDefinitions } from '../config/recipes';

export type ChildCardConfig = { type: string; [key: string]: unknown };
export type ChildCardElement = HTMLElement & {
  hass?: Hass; preview?: boolean; editMode?: boolean; layout?: string;
  getCardSize?: () => number | Promise<number>;
  getGridOptions?: () => { rows?: number | 'auto'; columns?: number | 'full'; min_rows?: number; min_columns?: number };
};
export type CardHelpers = { createCardElement: (config: ChildCardConfig) => ChildCardElement | Promise<ChildCardElement> };
/** HA owns card loading and custom element registration. Never reconstruct its tag names. */
export async function loadChildCardHelpers(): Promise<CardHelpers> {
  const loader = (window as Window & { loadCardHelpers?: () => Promise<CardHelpers> }).loadCardHelpers;
  if (!loader) throw new Error('Home Assistant card helpers are unavailable. Open this dashboard in Home Assistant.');
  const helpers = await loader();
  if (typeof helpers?.createCardElement !== 'function') throw new Error('Home Assistant card helpers could not be loaded.');
  return helpers;
}

export const isNavetChild = (config: ChildCardConfig): boolean => /^custom:navet-[a-z-]+-card$/.test(config.type);
/** Foreign child schemas are opaque; only Navet cards receive this explicit local scope. */
export function scopedChildConfig(config: ChildCardConfig, definitions: RecipeDefinitions = {}): ChildCardConfig {
  if (!isNavetChild(config)) return structuredClone(config);
  const resolved = resolveRecipes(config, definitions) as ChildCardConfig;
  if (!Array.isArray(resolved.cards) || !resolved.cards.length) delete resolved.definitions;
  return resolved;
}

type Entry = { config: ChildCardConfig; element?: ChildCardElement; error?: string };
/** Children exist only while active. Each receives an isolated config copy and normal HA state. */
export class NavetChildCards extends LitElement {
  static properties = {
    cards: { attribute: false }, definitions: { attribute: false }, hass: { attribute: false }, active: { type: Boolean },
    preview: { type: Boolean }, editMode: { type: Boolean }, layout: {}, columns: { type: Number },
  };
  cards: ChildCardConfig[] = [];
  definitions: RecipeDefinitions = {};
  hass?: Hass;
  active = true;
  preview = false;
  editMode = false;
  layout: 'vertical' | 'horizontal' | 'grid' = 'vertical';
  columns = 2;
  private entries: Entry[] = [];
  private generation = 0;
  private signature = '';
  private loading = false;
  private helperError = '';
  static styles = css`
    :host{display:block;min-width:0;width:100%}.children{display:grid;gap:var(--vertical-stack-card-gap,8px);min-width:0}.child{min-width:0;max-width:100%}.child>*{display:block;min-width:0;max-width:100%}.error{padding:12px;border:1px solid var(--error-color,#b33);border-radius:10px;font:inherit;overflow-wrap:anywhere}.error p{margin:0 0 8px}button{font:inherit;min-height:44px;padding:8px 12px;color:var(--primary-text-color,inherit);background:var(--card-background-color,transparent);border:1px solid var(--divider-color,#888);border-radius:8px}.preview-note{font-size:12px;margin:0 0 8px;color:var(--secondary-text-color,inherit)}
  `;
  connectedCallback() { super.connectedCallback(); this.requestUpdate(); }
  disconnectedCallback() { this.release(); super.disconnectedCallback(); }
  private release() {
    this.generation++; this.entries = []; this.loading = false; this.signature = '';
  }
  protected updated(changed: PropertyValues) {
    if (!this.active || !this.isConnected) { if (this.entries.length || this.loading) this.release(); return; }
    const configs = this.resolvedCards();
    const signature = JSON.stringify(configs);
    if (signature !== this.signature) { void this.build(signature, configs); return; }
    if (changed.has('hass') || changed.has('preview') || changed.has('editMode')) {
      let changedEntry = false;
      for (const entry of this.entries) if (entry.element) {
        try { this.propagate(entry.element); }
        catch (error) { entry.element = undefined; entry.error = (error as Error).message; changedEntry = true; }
      }
      if (changedEntry) this.requestUpdate();
    }
  }
  private propagate(element: ChildCardElement) {
    element.preview = this.preview; element.editMode = this.editMode;
    element.hass = this.hass;
  }
  private resolvedCards(): Entry[] {
    return this.cards.map(config => {
      try { return { config: scopedChildConfig(config, this.definitions) }; }
      catch (error) { return { config: structuredClone(config), error: (error as Error).message }; }
    });
  }
  private async build(signature: string, configs = this.resolvedCards(), force = false) {
    const generation = ++this.generation;
    const previous = this.entries;
    this.signature = signature; this.loading = true; this.helperError = '';
    this.requestUpdate();
    try {
      const helpers = await loadChildCardHelpers();
      if (generation !== this.generation || !this.active || !this.isConnected) return;
      const available = new Set(previous);
      const entries = await Promise.all(configs.map(async (source, index): Promise<Entry> => {
        const { config } = source;
        if (source.error) return source;
        try {
          const same = !force ? previous.find(entry => available.has(entry) && entry.element && JSON.stringify(entry.config) === JSON.stringify(config)) : undefined;
          if (same) { available.delete(same); this.propagate(same.element!); return same; }
          const local = previous[index];
          if (!force && local?.element && available.has(local) && isNavetChild(config) && local.config.type === config.type) {
            const element = local.element as ChildCardElement & { setConfig?: (config: ChildCardConfig) => void };
            if (element.setConfig) { available.delete(local); element.setConfig(structuredClone(config)); this.propagate(element); local.config = structuredClone(config); return local; }
          }
          const element = await helpers.createCardElement(structuredClone(config));
          if (!(element instanceof HTMLElement)) throw new Error('The child did not return a card element.');
          if (generation !== this.generation || !this.active || !this.isConnected) return { config };
          this.propagate(element);
          const entry: Entry = { config, element };
          element.addEventListener('ll-rebuild', (event) => {
            event.stopPropagation();
            if (this.isConnected && this.active && this.entries.includes(entry)) void this.build(this.signature, this.resolvedCards(), true);
          }, { once: true });
          return entry;
        } catch (error) { return { config, error: (error as Error).message || 'Unable to create child card.' }; }
      }));
      if (generation !== this.generation || !this.active || !this.isConnected) return;
      this.entries = entries;
    } catch (error) {
      if (generation !== this.generation) return;
      this.helperError = (error as Error).message; this.entries = [];
    } finally {
      if (generation === this.generation) { this.loading = false; this.requestUpdate(); }
    }
  }
  /** Masonry units; unknown or failing children use HA's conventional three-row estimate. */
  async getCardSize() {
    const sizes = await Promise.all(this.entries.map(async (entry) => {
      try { const size = await entry.element?.getCardSize?.(); return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 3; }
      catch { return 3; }
    }));
    if (this.layout === 'horizontal') return Math.max(0, ...sizes);
    if (this.layout === 'grid') { let total = 0; for (let i = 0; i < sizes.length; i += this.columnCount) total += Math.max(...sizes.slice(i, i + this.columnCount)); return total; }
    return sizes.reduce((sum, size) => sum + size, 0);
  }
  private get columnCount() { return Number.isFinite(this.columns) ? Math.max(1, Math.floor(this.columns)) : 2; }
  getGridOptions() {
    const rows = this.entries.map((entry) => {
      try { const rows = entry.element?.getGridOptions?.().rows; return typeof rows === 'number' && Number.isFinite(rows) && rows > 0 ? rows : undefined; }
      catch { return undefined; }
    });
    if (rows.some((row) => row === undefined)) return { columns: 'full' as const, rows: 'auto' as const, min_columns: 1, min_rows: 1 };
    const sizes = rows as number[];
    let total = 0;
    const columns = this.layout === 'horizontal' ? Math.max(1, sizes.length) : this.layout === 'grid' ? this.columnCount : 1;
    for (let i = 0; i < sizes.length; i += columns) total += Math.max(...sizes.slice(i, i + columns));
    return { columns: 'full' as const, rows: Math.max(1, total), min_columns: 1, min_rows: 1 };
  }
  private retry() { const configs = this.resolvedCards(); void this.build(JSON.stringify(configs), configs, true); }
  render() {
    if (!this.active || !this.cards.length) return nothing;
    const columns = this.layout === 'horizontal' ? Math.max(1, this.cards.length) : this.layout === 'grid' ? this.columnCount : 1;
    return html`${this.preview ? html`<p class="preview-note">Child card preview · interactions disabled</p>` : nothing}
      ${this.loading ? html`<p role="status">Loading child cards…</p>` : nothing}
      ${this.helperError ? html`<div class="error" role="alert"><p>${this.helperError}</p><button @click=${this.retry}>Retry child cards</button></div>` : nothing}
      <div class="children" style=${`grid-template-columns:repeat(${columns},minmax(0,1fr))`} ?inert=${this.preview || this.loading} aria-busy=${this.loading}>
        ${this.entries.map((entry, index) => html`<div class="child" data-child=${index}>${entry.error ? html`<div class="error" role="alert"><p>Child ${index + 1} (${entry.config.type}): ${entry.error}</p><button @click=${this.retry}>Retry child cards</button></div>` : entry.element ?? nothing}</div>`)}
      </div>`;
  }
}
if (!customElements.get('navet-child-cards')) customElements.define('navet-child-cards', NavetChildCards);
