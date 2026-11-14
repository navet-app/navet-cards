import { LitElement, html, css, nothing } from 'lit';
import type { CardCommand, CardEntity, Capability, MediaRepeatMode } from '../core';

/** Reported-position controls only: this widget owns no clock or background work. */
export class NavetMediaOptions extends LitElement {
  static properties = { entity: { attribute: false }, disabled: { type: Boolean } };
  entity?: CardEntity;
  disabled = false;
  private seekDraft?: number;
  private seekOwner?: string;
  private seekCanceled = false;
  static styles = css`:host{display:block;min-width:0}.options{display:grid;gap:12px;padding:12px 0}label{display:grid;gap:6px;min-width:0;font:inherit;font-size:12px}.position-label{display:flex;justify-content:space-between;gap:8px}output{font-variant-numeric:tabular-nums}select,input{box-sizing:border-box;min-width:0;width:100%;min-height:36px;font:inherit;accent-color:var(--primary-color,#ea8c55)}select,button{color:inherit;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:8px}button{min-height:40px;font:inherit;flex:1}.power{display:flex;flex-wrap:wrap;gap:8px}p{font-size:12px;margin:0;opacity:.7}`;
  private emit(command: CardCommand) {
    const entity = this.entity;
    if (this.disabled || !entity?.available || !entity.capabilities.includes(command.type as Capability)) return;
    if (command.type !== 'power_on' && command.type !== 'power_off' && ['off','standby'].includes(entity.state)) return;
    this.dispatchEvent(new CustomEvent('control-command', {detail:{command},bubbles:true,composed:true}));
  }
  private seek(event: Event, commit: boolean) {
    const input = event.target as HTMLInputElement;
    const entity = this.entity, value = input.valueAsNumber;
    if (this.seekCanceled) { input.value=String(entity?.elapsed ?? 0); return; }
    if (!entity || this.disabled || !entity.available || ['off','standby'].includes(entity.state) || !entity.capabilities.includes('seek') || entity.duration === undefined || !Number.isFinite(entity.duration) || entity.duration <= 0 || entity.elapsed === undefined || !Number.isFinite(entity.elapsed) || entity.elapsed < 0 || entity.elapsed > entity.duration || !Number.isFinite(value) || value < 0 || value > entity.duration) return;
    this.seekOwner = entity.externalId;
    this.seekDraft = commit ? undefined : value;
    if (commit) this.emit({type:'seek',value});
    this.requestUpdate();
  }
  private cancelSeek(event: PointerEvent) {
    this.seekCanceled = true; this.seekDraft = undefined; this.seekOwner = undefined;
    (event.currentTarget as HTMLInputElement).value=String(this.entity?.elapsed ?? 0);
    this.requestUpdate();
  }
  render() {
    const e = this.entity;
    if (!e || !e.capabilities.some(cap=>['seek','repeat','shuffle','power_on','power_off'].includes(cap))) return nothing;
    const disabled = this.disabled || !e.available;
    const playbackDisabled = disabled || ['off','standby'].includes(e.state);
    const seekKnown = e.elapsed !== undefined && Number.isFinite(e.elapsed) && e.elapsed >= 0 && e.duration !== undefined && Number.isFinite(e.duration) && e.duration > 0 && e.elapsed <= e.duration;
    const position = this.seekOwner === e.externalId && this.seekDraft !== undefined && this.seekDraft <= (e.duration ?? 0) ? this.seekDraft : e.elapsed;
    const time = (value: number | undefined) => value === undefined ? '—' : `${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
    return html`<div class="options">
      ${e.capabilities.includes('seek') ? html`<label><span class="position-label">Playback position<output>${time(position)} / ${time(e.duration)}</output></span><input aria-label="Playback position" type="range" min="0" max=${String(e.duration ?? 1)} step="1" .value=${String(position ?? 0)} ?disabled=${playbackDisabled || !seekKnown} @pointerdown=${()=>{this.seekCanceled=false;}} @keydown=${()=>{this.seekCanceled=false;}} @pointercancel=${this.cancelSeek} @input=${(event:Event)=>this.seek(event,false)} @change=${(event:Event)=>this.seek(event,true)}></label>${!seekKnown ? html`<p>Position or duration is not reported.</p>` : nothing}` : nothing}
      ${e.capabilities.includes('repeat') && e.repeatModes?.length ? html`<label>Repeat<select aria-label="Repeat" .value=${e.repeat ?? ''} ?disabled=${playbackDisabled} @change=${(event:Event)=>{const value=(event.target as HTMLSelectElement).value;if(e.repeatModes?.includes(value as MediaRepeatMode))this.emit({type:'repeat',value:value as MediaRepeatMode});}}>${!e.repeat ? html`<option value="" disabled .selected=${true}>Choose repeat · current unknown</option>` : nothing}${e.repeatModes.map(mode=>html`<option value=${mode} .selected=${mode===e.repeat}>${mode}</option>`)}</select></label>` : nothing}
      ${e.capabilities.includes('shuffle') ? html`<label>Shuffle<select aria-label="Shuffle" .value=${e.shuffle === undefined ? '' : String(e.shuffle)} ?disabled=${playbackDisabled} @change=${(event:Event)=>{const value=(event.target as HTMLSelectElement).value;if(value==='true'||value==='false')this.emit({type:'shuffle',value:value==='true'});}}>${e.shuffle === undefined ? html`<option value="" disabled .selected=${true}>Choose shuffle · current unknown</option>` : nothing}<option value="false" .selected=${e.shuffle===false}>Off</option><option value="true" .selected=${e.shuffle===true}>On</option></select></label>` : nothing}
      ${e.capabilities.some(cap=>cap==='power_on'||cap==='power_off') ? html`<div class="power">${e.capabilities.includes('power_on') ? html`<button type="button" ?disabled=${disabled} @click=${()=>this.emit({type:'power_on'})}>Power on</button>` : nothing}${e.capabilities.includes('power_off') ? html`<button type="button" ?disabled=${disabled} @click=${()=>this.emit({type:'power_off'})}>Power off</button>` : nothing}</div>` : nothing}
    </div>`;
  }
}
if (!customElements.get('navet-media-options')) customElements.define('navet-media-options', NavetMediaOptions);
