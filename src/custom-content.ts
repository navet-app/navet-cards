import { html, nothing, svg } from 'lit';
import type { CardCommand, CardEntity, CardKind, HistoryPoint } from './core';
import type { CardConfig } from './config';
import { icon } from './icons';
import { readingGlyph } from './reading-glyph';
export { readingGlyph } from './reading-glyph';
export { customContentStyles } from './custom-content-styles';

export interface CustomContentContext {
  kind: CardKind;
  history: HistoryPoint[];
  editNote: () => unknown;
  photoIndex: number;
  photoShuffle: boolean;
  togglePhotoShuffle: () => void;
  changePhoto: (index: number) => void;
  config: CardConfig;
  entity: CardEntity;
  members: CardEntity[];
  disabled: boolean;
  t: (key: string) => string;
  details: (id: string) => void;
  command: (command: CardCommand, entity: CardEntity) => unknown;
  perform: () => unknown;
  imageFailed: boolean;
  onImageError: () => void;
}

/** Custom widgets consume the same normalized entities and command boundary as entity cards. */

export function customContent(c: CustomContentContext) {
  const { config, entity, members, t } = c;
  const reading = (e: CardEntity) => e.available ? `${e.value}${e.unit ? ` ${e.unit}` : ''}` : t(e.state);
  switch (c.kind) {
    case 'info':
      return html`<div class="widget-readings"><div class="compact-readings">${members.map(e=>html`<button class="widget-row sensor-reading" ?disabled=${c.disabled} @click=${()=>c.details(e.externalId)}><span class="reading-label">${icon(readingGlyph(e))}<span>${e.name}</span></span><strong>${reading(e)}</strong></button>`)}</div></div>`;
    case 'ups': {
      const battery=members.find(e=>e.deviceClass === 'battery' || /battery|charge/i.test(`${e.externalId} ${e.name}`));
      const status=members.find(e=>!e.unit && e !== battery);
      const online=status?.available && /^(ol|online|on line)$/i.test(status.value);
      const metrics=members.filter(e=>e !== battery && e !== status);
      return html`<div class="ups-summary">${battery ? html`<button class="ups-battery metric" ?disabled=${c.disabled} @click=${()=>c.details(battery.externalId)}>${battery.available ? battery.value : '—'}<span class="unit">${battery.available ? battery.unit : ''}</span><span class="ups-battery-label state">${battery.name}</span></button>` : nothing}${status ? html`<button class=${`ups-status ${online ? 'online' : 'warning'}`} ?disabled=${c.disabled} @click=${()=>c.details(status.externalId)}>${reading(status)}</button>` : nothing}</div><div class="ups-metrics">${metrics.map(e=>html`<button ?disabled=${c.disabled} @click=${()=>c.details(e.externalId)}><span class="state">${e.name}</span><strong>${reading(e)}</strong></button>`)}</div>`;
    }
    case 'battery': {
      const sorted = [...members].sort((a, b) => (a.available ? Number(a.value) : Infinity) - (b.available ? Number(b.value) : Infinity));
      return html`<div class="widget-readings"><div class="compact-readings">${sorted.map(e => {
        const percent = e.available && e.unit === '%' && Number.isFinite(Number(e.value)) && Number(e.value) >= 0 && Number(e.value) <= 100 ? Number(e.value) : undefined;
        const color = percent === undefined ? 'var(--muted)' : percent <= 20 ? '#ef4444' : percent <= 40 ? '#f97316' : 'var(--accent)';
        return html`<button class="widget-row battery-row" style=${`--battery-color:${color}`} ?disabled=${c.disabled} @click=${() => c.details(e.externalId)}><span class="reading-label">${svg`<svg viewBox="0 0 20 20" aria-hidden="true" fill="none"><rect x="2.25" y="5" width="14.5" height="10" rx="2.25" stroke="currentColor" stroke-width="1.5"/><rect x="17.25" y="8" width="1.75" height="4" rx=".75" fill="currentColor"/><rect x="4" y="6.75" width="11" height="6.5" rx="1.1" fill="currentColor" opacity=".18"/>${percent !== undefined ? svg`<rect x="4" y="6.75" width=${percent*.11} height="6.5" rx="1.1" fill="currentColor"/>` : nothing}</svg>`}<span>${e.name}</span></span>${percent !== undefined ? html`<progress aria-label=${e.name} max="100" value=${percent}></progress>` : nothing}<strong>${reading(e)}</strong></button>`;
      })}</div></div>`;
    }
    case 'energy-now': {
      const points=c.history;
      const min=Math.min(0,...points.map(p=>p.value)),max=Math.max(1,...points.map(p=>p.value));
      const start=points[0]?.time ?? 0,span=Math.max(1,(points.at(-1)?.time ?? 0)-start);
      const coordinates=points.map(p=>`${((p.time-start)/span*320).toFixed(1)},${(66-(p.value-min)/(max-min)*60).toFixed(1)}`).join(' ');
      return html`<div class="energy-reading">${members.slice(0,2).map((e,i)=>html`<button class=${i === 0 ? 'energy-primary' : 'energy-secondary'} aria-label=${`${e.name} ${reading(e)}`} ?disabled=${c.disabled} @click=${()=>c.details(e.externalId)}><strong>${e.available ? e.value : '—'}<span>${e.available ? e.unit : ''}</span></strong><span class="state">${e.name}</span></button>`)}</div><div class="energy-chart">${points.length > 1 ? html`${svg`<svg viewBox="0 0 320 72" preserveAspectRatio="none" role="img" aria-label=${t('powerHistory')}><polygon points=${`0,72 ${coordinates} 320,72`} fill="currentColor" opacity=".12"/><polyline points=${coordinates} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`}<div class="chart-times"><span>${new Date(start).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</span><span>${new Date(points.at(-1)!.time).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</span></div>` : html`<span class="state">${t('noHistory')}</span>`}</div>`;
    }
    case 'note': {
      if (config.entity && !entity.available) return html`<p class="notice">${t(entity.state)}</p>`;
      if (entity.secret) return html`<p class="notice">${t('privateText')}</p>`;
      const content = config.entity ? entity.value : config.content ?? '';
      return html`<div class="note-paper">${entity.capabilities.includes('text') ? html`<button class="note-open" aria-label=${t('note')} ?disabled=${c.disabled || !entity.available} @click=${c.editNote}>${content || t('emptyNote')}</button>` : html`<p>${content || t('emptyNote')}</p>`}</div>`;
    }
    case 'photo': {
      const images = config.images ?? (config.image ? [config.image] : entity.available && entity.artwork ? [entity.artwork] : []);
      const next = (direction:number) => c.changePhoto(c.photoShuffle ? (c.photoIndex+1+Math.floor(Math.random()*(images.length-1)))%images.length : (c.photoIndex+direction+images.length)%images.length);
      const image = images[c.photoIndex % Math.max(1,images.length)];
      return html`${image && !c.imageFailed ? html`<img class="photo-image" src=${image} alt=${config.alt ?? ''} loading="lazy" decoding="async" referrerpolicy="no-referrer" @error=${c.onImageError}>` : html`<div class="photo-placeholder">${icon('photo')}<span class="state">${t('imageUnavailable')}</span></div>`}${images.length > 1 ? html`<button class="action photo-shuffle" aria-label=${t('shufflePhotos')} aria-pressed=${c.photoShuffle} ?disabled=${c.disabled} @click=${c.togglePhotoShuffle}>${icon('shuffle')}</button><div class="photo-controls"><button class="action" aria-label=${t('previousPhoto')} ?disabled=${c.disabled} @click=${()=>next(-1)}>${icon('previous')}</button><div class="photo-dots">${images.map((_,i)=>html`<button aria-label=${`${t('photo')} ${i+1}`} aria-pressed=${i===c.photoIndex} ?disabled=${c.disabled} @click=${()=>c.changePhoto(i)}></button>`)}</div><button class="action" aria-label=${t('nextPhoto')} ?disabled=${c.disabled} @click=${()=>next(1)}>${icon('next')}</button></div>` : nothing}`;
    }
    case 'button':
      return nothing;
    default: return undefined;
  }
}
