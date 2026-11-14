import { LitElement, html, css, nothing } from 'lit';
import { translate } from '../i18n';
import { live } from 'lit/directives/live.js';
import type { CardEntity, CardCommand } from '../core';

/** Normalized comfort controls; the owning provider validates commands again. */
export class NavetComfortControls extends LitElement {
  static properties={entity:{attribute:false},disabled:{type:Boolean},language:{}};
  entity?:CardEntity;
  disabled=false;
  language='en';
  private t(key:string){return translate(key,this.language);}
  private cancelled=new Set<string>();
  static styles=css`:host{display:block;min-width:0;color:var(--text,inherit)}label{display:grid;gap:6px;padding:10px 0;min-width:0;font:inherit;font-size:12px}label span{display:flex;justify-content:space-between;gap:8px}select,input{box-sizing:border-box;min-width:0;width:100%;min-height:44px;font:inherit;color:inherit}select{background:var(--surface,var(--card-background-color,#fff));border:1px solid var(--edge,var(--divider-color,#aaa));border-radius:8px;padding:8px}option{color:CanvasText;background-color:Canvas}input{margin:0;accent-color:var(--accent,var(--primary-color,#f97316))}:disabled{opacity:.6}.unknown{font-size:12px;opacity:.75}`;
  private emit(command:CardCommand){if(this.disabled||!this.entity?.available||!this.entity.capabilities.includes(command.type as never))return;this.dispatchEvent(new CustomEvent('control-command',{detail:{command},bubbles:true,composed:true}));}
  private slider(type:'humidity'|'temperature',label:string,value:number|undefined,min:number,max:number,step:number,unit:string){
    // A missing reported target is a text placeholder, never an invented slider position.
    if(value===undefined)return html`<p class="unknown">${label} · ${this.t('currentUnknown')}</p>`;
    return html`<label><span>${label}<output>${value} ${unit}</output></span><input aria-label=${label} type="range" .min=${String(min)} .max=${String(max)} .step=${String(step)} .value=${live(String(value))} ?disabled=${this.disabled||!this.entity?.available}
      @pointerdown=${()=>this.cancelled.delete(type)} @keydown=${()=>this.cancelled.delete(type)}
      @pointercancel=${(event:Event)=>{this.cancelled.add(type);(event.target as HTMLInputElement).value=String(value);}}
      @change=${(event:Event)=>{if(this.cancelled.delete(type)){(event.target as HTMLInputElement).value=String(value);return;}this.emit({type,value:Number((event.target as HTMLInputElement).value)});}}></label>`;
  }
  private choices(type:'humidifier_mode'|'water_operation',label:string,options:string[],current?:string){
    const selected=options.includes(current??'')?current:'';
    return html`<label>${label}<select aria-label=${label} .value=${live(selected??'')} ?disabled=${this.disabled||!this.entity?.available} @change=${(event:Event)=>this.emit({type,value:(event.target as HTMLSelectElement).value})}>${!selected?html`<option value="" disabled selected>${this.t('chooseOptionUnknown')}</option>`:nothing}${options.map(value=>html`<option value=${value} .selected=${value===selected}>${value}</option>`)}</select></label>`;
  }
  render(){const e=this.entity;if(!e)return nothing;return html`
    ${e.capabilities.includes('humidity')?this.slider('humidity',this.t('targetHumidity'),e.targetHumidity,e.minHumidity!,e.maxHumidity!,e.stepHumidity??1,'%'):nothing}
    ${e.capabilities.includes('temperature')?this.slider('temperature',this.t('temperature'),e.temperature,e.minTemperature!,e.maxTemperature!,e.stepTemperature??1,e.temperatureUnit??e.unit):nothing}
    ${e.capabilities.includes('humidifier_mode')?this.choices('humidifier_mode',this.t('humidifier_mode'),e.humidifierModes??[],e.humidifierMode):nothing}
    ${e.capabilities.includes('water_operation')?this.choices('water_operation',this.t('water_operation'),e.waterOperations??[],e.waterOperation):nothing}
    ${e.capabilities.includes('away_mode')?html`<label>${this.t('away_mode')}<select aria-label=${this.t('away_mode')} .value=${live(e.awayMode===undefined?'':String(e.awayMode))} ?disabled=${this.disabled||!e.available} @change=${(event:Event)=>{const value=(event.target as HTMLSelectElement).value;if(value==='true'||value==='false')this.emit({type:'away_mode',value:value==='true'});}}>${e.awayMode===undefined?html`<option value="" disabled selected>${this.t('chooseOptionUnknown')}</option>`:nothing}<option value="false" .selected=${e.awayMode===false}>${this.t('off')}</option><option value="true" .selected=${e.awayMode===true}>${this.t('on')}</option></select></label>`:nothing}`;}
}
if(!customElements.get('navet-comfort-controls'))customElements.define('navet-comfort-controls',NavetComfortControls);
