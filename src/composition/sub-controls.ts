import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { live } from 'lit/directives/live.js';
import type { ActionConfig, CardConfig, SubControl } from '../config';
import type { CardCommand, CardEntity, Capability } from '../core';
import { evaluateCondition } from '../conditions';
import { CardGesture } from '../actions/gestures';
import { kindForEntity, mapEntity, type Hass } from '../providers/home-assistant';
import { translate } from '../i18n';

type SliderType = 'brightness'|'volume'|'temperature'|'position'|'number'|'color_temperature'|'speed'|'humidity';
const sliders: SliderType[] = ['brightness','volume','temperature','position','number','color_temperature','speed','humidity'];

/** Deferred per-card composition. Emits intents; the owning card owns all host side effects. */
export class NavetSubControls extends LitElement {
  static properties = { config: { attribute: false }, hass: { attribute: false }, disabled: { type: Boolean }, preview: { type: Boolean } };
  config?: CardConfig;
  hass?: Hass;
  disabled = false;
  preview = false;
  private gestures = new Map<number, CardGesture>();
  private collapsed = new Map<string, boolean>();
  private cancelledSliders = new Set<string>();
  private heldRows = new Set<number>();
  private groupSignature = '';
  static styles = css`
    :host{display:block;min-width:0;font:inherit;color:inherit}.list{display:grid;gap:8px}.sub-control{display:grid;gap:6px;min-width:0;padding:8px;border:1px solid var(--navet-card-border,var(--divider-color,#7774));border-radius:12px}
    button,select,input{box-sizing:border-box;font:inherit;color:inherit;min-height:40px;max-width:100%}button,select{border:1px solid var(--divider-color,#7774);border-radius:9px;background:var(--card-background-color,#8881);padding:8px}button{cursor:pointer}button:disabled,select:disabled,input:disabled{opacity:.55;cursor:default}.sub-name{display:flex;align-items:center;gap:8px;text-align:left;width:100%}.identity{flex:1;min-width:0;overflow-wrap:anywhere}.state{display:block;font-size:12px;opacity:.75;overflow-wrap:anywhere}ha-icon{flex:none;width:20px;height:20px}.controls{display:grid;gap:8px}label{display:grid;gap:4px;font-size:12px}label span{display:flex;justify-content:space-between;gap:8px}input,select{width:100%;min-width:0}input{margin:0;accent-color:var(--primary-color,#f97316)}.group{min-width:0}.group-toggle{width:100%;display:flex;justify-content:space-between;gap:8px;text-align:left;margin-bottom:6px}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--primary-color,#f97316);outline-offset:2px}
  `;
  private t(key: string) { return translate(key, this.hass?.locale?.language ?? this.hass?.language); }
  private cancelGestures() { this.gestures.forEach((gesture) => gesture.cancel()); this.gestures.clear(); this.cancelledSliders.clear(); }
  protected willUpdate(changed: PropertyValues) {
    if (changed.has('config') || changed.has('disabled') || changed.has('preview')) this.cancelGestures();
    const signature = JSON.stringify(this.config?.sub_control_groups?.map(({ id, collapsed }) => [id, collapsed]));
    if (signature !== this.groupSignature) {
      this.groupSignature = signature;
      this.collapsed = new Map(this.config?.sub_control_groups?.map((group) => [group.id, group.collapsed ?? false]));
    }
  }
  disconnectedCallback() { this.cancelGestures(); this.heldRows.clear(); super.disconnectedCallback(); }
  private blocked(sub: SubControl) { return this.disabled || this.preview || sub.read_only === true; }
  private active(sub: SubControl, index: number) {
    return this.isConnected && this.config?.sub_controls?.[index] === sub && !this.blocked(sub)
      && !(sub.group && this.collapsed.get(sub.group))
      && evaluateCondition(sub.visible_when, this.hass?.states ?? {});
  }
  private event(type: string, detail: unknown) { this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })); }
  private gesture(sub: SubControl, index: number) {
    let gesture = this.gestures.get(index);
    if (!gesture) {
      gesture = new CardGesture((action?: ActionConfig) => {
        if (action && action === sub.hold_action) this.heldRows.add(index);
        if (action) this.event('sub-control-action', { entity: sub.entity, action });
        else this.event('sub-control-details', { entity: sub.entity });
      }, () => this.active(sub,index));
      this.gestures.set(index, gesture);
    }
    return gesture;
  }
  private command(sub: SubControl, index: number, command: CardCommand) {
    if (this.active(sub,index) && mapEntity(this.hass?.states[sub.entity],kindForEntity(sub.entity),sub.entity,this.hass).available) this.event('sub-control-command', { entity: sub.entity, command });
  }
  private slider(sub: SubControl, index: number, model: CardEntity, type: SliderType) {
    const min = type === 'humidity' ? model.minHumidity ?? 0 : type === 'temperature' ? model.minTemperature ?? 7 : type === 'number' ? model.minNumber ?? 0 : type === 'color_temperature' ? model.minKelvin ?? 2000 : 0;
    const max = type === 'humidity' ? model.maxHumidity ?? 100 : type === 'temperature' ? model.maxTemperature ?? 35 : type === 'number' ? model.maxNumber ?? 100 : type === 'color_temperature' ? model.maxKelvin ?? 6500 : 100;
    const step = type === 'humidity' ? model.stepHumidity ?? 1 : type === 'temperature' ? model.stepTemperature ?? .5 : type === 'number' ? model.stepNumber ?? 1 : 1;
    const value = type === 'humidity' ? model.targetHumidity : type === 'number' ? model.number : type === 'color_temperature' ? model.color_temperature : model[type];
    if (type === 'humidity' && value === undefined) return html`<p>Target humidity · current unknown</p>`;
    const key = `${index}:${type}`;
    return html`<label><span>${this.t(type)}<output>${value ?? '—'}${type === 'color_temperature' ? ' K' : type === 'temperature' || type === 'number' ? ` ${type === 'temperature' ? model.temperatureUnit ?? model.unit : model.unit}` : '%'}</output></span><input aria-label=${`${sub.name ?? model.name} ${this.t(type)}`} type="range" .min=${String(min)} .max=${String(max)} .step=${String(step)} .value=${live(String(value ?? min))} ?disabled=${this.blocked(sub) || !model.available}
      @pointerdown=${() => this.cancelledSliders.delete(key)} @keydown=${() => this.cancelledSliders.delete(key)}
      @pointercancel=${(event: PointerEvent) => { this.cancelledSliders.add(key); (event.target as HTMLInputElement).value=String(value ?? min); }}
      @change=${(event: Event) => { if(this.cancelledSliders.delete(key)){(event.target as HTMLInputElement).value=String(value ?? min);return;}this.command(sub,index,{type,value:Number((event.target as HTMLInputElement).value)}); }}></label>`;
  }
  private choices(sub: SubControl, index: number, model: CardEntity, type: 'select'|'hvac_mode'|'source'|'humidifier_mode'|'water_operation'|'away_mode'|'remote_activity') {
    const options = type === 'remote_activity' ? model.remoteActivities : type === 'away_mode' ? ['off','on'] : type === 'humidifier_mode' ? model.humidifierModes : type === 'water_operation' ? model.waterOperations : type === 'select' ? model.options : type === 'hvac_mode' ? model.hvacModes : model.sources;
    const value = type === 'remote_activity' ? model.remoteActivity : type === 'away_mode' ? model.awayMode === undefined ? '' : model.awayMode ? 'on' : 'off' : type === 'humidifier_mode' ? model.humidifierMode : type === 'water_operation' ? model.waterOperation : type === 'source' ? model.source : model.state;
    return html`<label>${this.t(type)}<select aria-label=${`${sub.name ?? model.name} ${this.t(type)}`} .value=${live(value ?? '')} ?disabled=${this.blocked(sub) || !model.available} @change=${(event: Event) => {const value=(event.target as HTMLSelectElement).value;if(options?.includes(value))this.command(sub,index,type === 'away_mode' ? {type,value:value==='on'} : { type, value });}}>${!options?.includes(value ?? '') ? html`<option value="">${this.t('selectOption')}</option>` : nothing}${options?.map((option) => html`<option value=${option} .selected=${live(option === value)}>${option}</option>`)}</select></label>`;
  }
  private member(sub: SubControl, index: number) {
    if (!evaluateCondition(sub.visible_when, this.hass?.states ?? {})) return nothing;
    const model = mapEntity(this.hass?.states[sub.entity], kindForEntity(sub.entity), sub.entity, this.hass, sub.attribute, sub.unit);
    const gesture = this.gesture(sub, index);
    const actions = { tap: sub.tap_action, hold: sub.hold_action, double: sub.double_tap_action };
    const state = `${model.available ? this.t(model.value) : this.t(model.state)} ${model.available ? model.unit : ''}`;
    return html`<div class="sub-control" data-entity=${sub.entity}><button class="sub-name" aria-label=${sub.name ?? model.name} ?disabled=${this.blocked(sub)}
      @click=${(event: MouseEvent) => { if(this.heldRows.delete(index)){gesture.cancel();if(event.detail>0)return;}gesture.click(event.detail,actions); }} @pointerdown=${(event: PointerEvent) => {this.heldRows.delete(index);gesture.down(event,actions);}} @pointermove=${(event: PointerEvent) => gesture.move(event)} @pointerup=${() => gesture.up()} @pointerleave=${() => gesture.up()} @pointercancel=${() => gesture.cancelPointer()} @contextmenu=${(event: Event) => { if (sub.hold_action) event.preventDefault(); }}>
      ${sub.icon ? html`<ha-icon .icon=${sub.icon}></ha-icon>` : nothing}<span class="identity">${sub.show_name !== false ? html`<span>${sub.name ?? model.name}</span>` : nothing}${sub.show_state !== false ? html`<span class="state">${state}</span>` : nothing}</span>
    </button><div class="controls">${sub.control === 'toggle' && model.capabilities.includes('toggle') ? html`<button class="sub-toggle" aria-label=${this.t(model.active ? 'off' : 'on')} ?disabled=${this.blocked(sub) || !model.available} @click=${() => this.command(sub,index,{ type: 'toggle' })}>${this.t(model.active ? 'off' : 'on')}</button>` : nothing}
    ${sub.control === 'slider' ? sliders.filter((type) => model.capabilities.includes(type)).map((type) => this.slider(sub,index,model,type)) : nothing}
    ${sub.control === 'select' ? (['select','hvac_mode','source','humidifier_mode','water_operation','away_mode','remote_activity'] as const).filter((type) => model.capabilities.includes(type as Capability)).map((type) => this.choices(sub,index,model,type)) : nothing}</div></div>`;
  }
  render() {
    const controls = this.config?.sub_controls ?? [];
    const rows = (group?: string) => controls.map((sub, index) => sub.group === group ? this.member(sub, index) : nothing);
    return html`<div class="list">${rows()}${this.config?.sub_control_groups?.map((group) => {
      const collapsed = this.collapsed.get(group.id) ?? group.collapsed ?? false;
      return html`<section class="group"><button class="group-toggle" aria-expanded=${String(!collapsed)} @click=${() => { this.cancelGestures(); this.collapsed.set(group.id, !collapsed); this.requestUpdate(); }}>${group.name}<span aria-hidden="true">${collapsed ? '+' : '−'}</span></button>${collapsed ? nothing : html`<div class="list">${rows(group.id)}</div>`}</section>`;
    })}</div>`;
  }
}
if (!customElements.get('navet-sub-controls')) customElements.define('navet-sub-controls', NavetSubControls);
