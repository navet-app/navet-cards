import { LitElement, html, nothing, svg, adoptStyles, supportsAdoptingStyleSheets } from 'lit';
import { live } from 'lit/directives/live.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { CardEntity, CardKind, CardCommand, ForecastDay, HistoryPoint } from './core';
import { PermissionDeniedError } from './core';
import {
  tagFor, MULTI_KINDS, CONTENT_KINDS,
  type CardConfig,
  type ActionConfig,
  domainAllowed,
  validateConfig,
} from './config';
import {
  executeCommand,
  prepareHostEditor,
  callHostService,
  mapEntity,
  roomEntityIds,
  kindForEntity,
  type Hass,
} from './providers/home-assistant';
import { translate } from './i18n';
import { cardStyles } from './styles';
import { readingGlyph, customContentKind } from './reading-glyph';
import type { customContent as CustomContentRenderer } from './custom-content';
import { icon } from './icons';
import type { CardDataObservation, CardDataSnapshot } from './providers/card-data';
import type { ClimateOrb } from './climate-orb';
import './climate-orb';
import { runConfiguredAction } from './actions/execute';
import { CardGesture } from './actions/gestures';
import { conditionEntityIds, evaluateCondition } from './conditions';
import { listMediaGroupCandidates } from './providers/media-groups';
import { resolveRecipes } from './config/recipes';
import type { DisplayTemplateField,DisplayTemplateSnapshot,TemplateObservation } from './data/templates';
import { PressController, type PressPhase } from './actions/press';
import { ProtectionGate } from './actions/protection';
import { PopupCoordinator } from './composition/popup-coordinator';
import { planRoom, resolveRoomMemberIds, type RoomPlannedMember, type RoomPlan } from './rooms/planner';
import { createRoomCatalog } from './providers/room-catalog';

type ContextRequest = Event & {
  context: string;
  subscribe: boolean;
  callback: (states: Hass['states'], unsubscribe?: () => void) => void;
};

export class NavetCard extends LitElement {
  static styles = cardStyles;
  static kind: CardKind = 'switch';
  static async getConfigElement() {
    await prepareHostEditor();
    await import('./editor');
    return document.createElement('navet-card-editor');
  }
  static getStubConfig(hass?: Hass) {
    const kind = this.kind;
    if (kind === 'composition') return {cards:[],definitions:{}};
    if (kind === 'calendar') return {calendar:{entities:[]}};
    if (kind === 'chips') return { chips: [] };
    if (kind === 'sub-controls') return { sub_controls: [] };
    if (kind === 'navigation') return { links: [{ name: 'Home', path: '/lovelace/0' }] };
    if (kind === 'note') return {content: 'Write your note here'};
    if (kind === 'photo') return {image: '/local/photo.jpg', name: 'Photo'};
    if (kind === 'button') return {name: 'Action', tap_action: {action: 'navigate', navigation_path: '/lovelace/0'}};
    if (MULTI_KINDS.includes(kind)) return {entities: Object.keys(hass?.states ?? {}).filter(id => domainAllowed(kind,id)).slice(0,3)};
    if (kind === 'room') return { config_version: 2, room: { membership: { mode: 'explicit', entities: [] } } };
    const entity = Object.keys(hass?.states ?? {}).find((id) => domainAllowed(kind, id));
    return entity ? { entity } : {};
  }
  private config?: CardConfig;
  private templateObservers=new Map<DisplayTemplateField,TemplateObservation<DisplayTemplateSnapshot>>();
  private templateSnapshots=new Map<DisplayTemplateField,DisplayTemplateSnapshot>();
  private templateHost?:Hass;
  private templateKey='';
  private templateGeneration=0;
  private templateVisibility=()=>{const visible=!document.hidden&&!this.isPreview;for(const observation of this.templateObservers.values())observation.setVisible(visible);};
  private releaseTemplates(){this.templateGeneration++;for(const observation of this.templateObservers.values())observation.release();this.templateObservers.clear();this.templateSnapshots.clear();this.templateHost=undefined;this.templateKey='';this.removeAttribute('data-template-hidden');}
  private templateValue(field:DisplayTemplateField){const snapshot=this.templateSnapshots.get(field);return snapshot?.status==='ready'?snapshot.value:undefined;}
  private async refreshTemplates(){
    const specs=this.config?.display_templates,host=this.host;
    if(!host||!this.isConnected||this.isPreview||!specs||!Object.keys(specs).length){if(this.templateKey)this.releaseTemplates();return;}
    const key=JSON.stringify(specs),connection=(host as Hass&{connection?:object}).connection;
    if(key===this.templateKey&&(this.templateHost as Hass&{connection?:object}|undefined)?.connection===connection&&this.templateHost?.callService===host.callService&&this.templateHost?.callApi===host.callApi){this.templateVisibility();return;}
    this.releaseTemplates();this.templateHost=host;this.templateKey=key;const generation=this.templateGeneration;
    try{
      const {observeDisplayTemplate}=await import('./providers/templates');
      if(generation!==this.templateGeneration||this.disposed||this.isPreview)return;
      for(const [field,spec]of Object.entries(specs)) {
        const name=field as DisplayTemplateField;
        const observation=observeDisplayTemplate(host,name,spec,snapshot=>{if(generation!==this.templateGeneration||this.disposed)return;this.templateSnapshots.set(name,snapshot);if(name==='visible')this.toggleAttribute('data-template-hidden',snapshot.status==='ready'&&snapshot.value===false);if(name==='visible'&&snapshot.status==='ready'&&snapshot.value===false){this.press.cancel();this.actionAbort?.abort();}this.requestUpdate();},{visible:!document.hidden});
        this.templateObservers.set(name,observation);
      }
    }catch(error){if(generation===this.templateGeneration){for(const field of Object.keys(specs))this.templateSnapshots.set(field as DisplayTemplateField,{status:'error',stale:false,error:error instanceof Error?error.message:'Could not load templates.'});this.requestUpdate();}}
  }

  private currentHass?: Hass;
  private states?: Hass['states'];
  private unsubscribe?: () => void;
  private error = '';
  private contentRenderer?: typeof CustomContentRenderer;
  private contentLoad?: Promise<unknown>;
  private contentFailed = false;
  private supplementary: ForecastDay[] | HistoryPoint[] = [];
  private dataKey = '';
  private dataHost?: Hass;
  private dataObservation?: CardDataObservation;
  private dataSnapshot?: CardDataSnapshot;
  private dataToken?: object;
  private dataVisible = false;
  private controlModules = new Map<string,Promise<unknown>>();
  private failedControlModules = new Set<string>();
  private advancedOpen?: {type:'range'|'tilt'|'fan'|'climate-options'|'vacuum-options'|'media-options'|'comfort'|'remote'|'update';entity:string;opener?:HTMLElement};
  private colorOpen = false;
  private rowOpen = false;
  private dataIntersection?: IntersectionObserver;
  private dataVisibility = () => this.dataObservation?.setVisible(this.dataVisible && !document.hidden && !this.isPreview);
  private resumeDataVisibility = () => { this.dataVisibility(); if (!document.hidden) void this.refreshData(); };
  private releaseData() {
    this.dataToken = undefined;
    this.dataObservation?.release(); this.dataObservation = undefined;
    this.dataKey = ''; this.dataHost = undefined; this.dataSnapshot = undefined; this.supplementary = [];
  }
  private async refreshData() {
    const id = this.kind === 'weather' ? this.config?.entity : this.kind === 'energy-now' ? this.config?.entities?.[0] : undefined;
    if (!id) return;
    const host = this.host;
    if (!host || !this.isConnected || this.isPreview) { this.releaseData(); return; }
    const key = `${this.kind}:${id}:${this.kind === 'weather' ? Number(host.states[id]?.attributes.supported_features) & 1 : ''}`;
    const previous = this.dataHost;
    if (key === this.dataKey && previous?.callService === host.callService && previous?.callWS === host.callWS && previous?.callApi === host.callApi && (previous as Hass & {connection?:object})?.connection === (host as Hass & {connection?:object}).connection) {
      this.dataVisibility(); return;
    }
    if (!this.dataVisible || document.hidden) { this.dataVisibility(); return; }
    this.releaseData();
    this.dataKey = key; this.dataHost = host;
    const token = this.dataToken = {};
    this.dataSnapshot = {status:'loading',data:[],stale:false};
    this.requestUpdate();
    try {
      const { observeCardData } = await import('./providers/card-data');
      if (this.disposed || this.isPreview || token !== this.dataToken) return;
      this.dataObservation = observeCardData(host,{type:this.kind === 'weather' ? 'forecast' : 'history',entityId:id},snapshot=>{
        if (this.disposed || token !== this.dataToken) return;
        this.dataSnapshot = snapshot;
        this.supplementary = [...snapshot.data] as ForecastDay[] | HistoryPoint[];
        this.requestUpdate();
      },{visible:this.dataVisible && !document.hidden});
    } catch {
      if (this.disposed || token !== this.dataToken) return;
      this.dataSnapshot = {status:'error',data:[],stale:false};
      this.requestUpdate();
    }
  }
  private sliderDrafts = new Map<string, number>();
  private busy = false;
  private roomOpen = false;
  private photoIndex = 0;
  private photoShuffle = false;
  private noteOpener?: HTMLElement;
  private noteDraft = '';
  private selectedPlayer = '';
  private async editNote() {
    if (this.disabled || !this.entity().available) return;
    this.noteDraft = this.entity().value; this.requestUpdate();
    this.noteOpener = (this.renderRoot as ShadowRoot).activeElement as HTMLElement;
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLDialogElement>('.note-dialog')?.showModal();
  }
  private closeNote() { this.renderRoot.querySelector<HTMLDialogElement>('.note-dialog')?.close(); this.noteOpener?.focus(); }
  private roomOpener?: HTMLElement;
  private popup = new PopupCoordinator(open => { void this.displayRoom(open); });
  private backdropDown = false;
  private swipeStart?: { x: number; y: number; pointer: number };
  private syncPanel = () => {
    if (this.kind === 'room') this.popup.configure({
      id: this.config?.panel_id, scope: this.config?.popup?.scope,
      timeout: this.config?.popup?.timeout, swipe: this.config?.popup?.swipe,
      preview: this.isPreview || !this.host,
      trigger: !!this.config?.popup?.trigger && evaluateCondition(this.config.popup.trigger, this.host?.states ?? {}),
    });
  };
  private navigationChanged = () => this.requestUpdate();
  private failedArtwork?: string;
  private isPreview = false;
  private actionAbort?: AbortController;
  private sequenceRunning = false;
  private pressSession?: { source: CardConfig; config: CardConfig; host: Hass; owner?: string };
  private protection = new ProtectionGate(()=>{if(this.protection.locked){this.press?.cancel();this.actionAbort?.abort();}this.requestUpdate();});
  private press = new PressController({
    enabled:()=>!this.disabled&&!this.disposed&&this.momentary,
    interval:()=>this.pressSession?.config.repeat_interval,
    repeat:()=>!!this.pressSession?.config.repeat_action && this.pressSession.config.repeat_action.action!=='none',
    dispatch:phase=>this.pressEffect(phase),
    onError:error=>{if(!this.disposed){this.error=error instanceof Error?error.message:this.t('error');this.requestUpdate();}},
  });
  private get momentary(){return !!(this.config?.press_action || this.config?.release_action || this.config?.repeat_action);}
  private syncPress(){if(this.isConnected&&this.momentary)this.press.attach(window,document);else this.press.detach();}
  private async pressEffect(phase:PressPhase){
    if(phase==='press'){
      if(!this.config||!this.host||this.disabled)return;
      this.pressSession={source:this.config,config:structuredClone(this.config),host:this.host,owner:this.config.entity};this.requestUpdate();
    }
    const session=this.pressSession;if(!session)return;
    const action=session.config[phase==='press'?'press_action':phase==='repeat'?'repeat_action':'release_action'];
    try{if(action)await runConfiguredAction(action,session.owner,{
      active:()=>phase==='release'||!this.disabled&&!this.disposed&&this.config===session.source,
      confirm:()=>false,
      dispatch:async intent=>{if(intent.type!=='perform-action')return;const [domain,service]=intent.name.split('.');await callHostService(session.host,domain,service,intent.data,intent.target);},
    });}finally{if(phase==='release'&&this.pressSession===session){this.pressSession=undefined;this.requestUpdate();}}
  }
  private primaryGesture = new CardGesture(action => { void this.perform(action); }, () => !this.disabled && !this.disposed);
  private iconGesture = new CardGesture(action => {
    if (action) void this.perform(action);
    else if (this.entity().capabilities.includes('toggle')) void this.command({ type: 'toggle' });
    else this.moreInfo();
  }, () => !this.disabled && !this.disposed);
  private disposed = false;
  private operation = 0;
  private get kind() {
    return (this.constructor as typeof NavetCard).kind;
  }
  private get language() {
    return this.currentHass?.locale?.language ?? this.currentHass?.language ?? 'en';
  }
  private t(key: string) {
    return translate(key, this.language);
  }
  private get host(): Hass | undefined {
    return (
      this.currentHass && { ...this.currentHass, states: this.states ?? this.currentHass.states }
    );
  }
  get hass() {
    return this.currentHass;
  }
  set hass(hass: Hass | undefined) {
    const previous = this.host;
    const previousIds = this.ids(previous);
    this.currentHass = hass;
    this.states = hass?.states;
    this.propagateHostedState();
    const nextIds = this.ids(hass);
    if (
      !previous ||
      previousIds.join('|') !== nextIds.join('|') ||
      nextIds.some((id) => previous.states[id] !== hass?.states[id]) ||
      previous.language !== hass?.language ||
      previous.locale !== hass?.locale ||
      previous.themes !== hass?.themes ||
      previous.config !== hass?.config ||
      previous.callApi !== hass?.callApi || previous.callService !== hass?.callService || previous.callWS !== hass?.callWS ||
      (previous as Hass&{connection?:object}).connection !== (hass as Hass&{connection?:object}|undefined)?.connection ||
      (this.kind === 'room' && previous.areas !== hass?.areas)
    )
      this.requestUpdate();
    if (this.isConnected) { this.syncPanel(); void this.refreshData();void this.refreshTemplates(); }
  }
  set preview(value: boolean) {
    this.isPreview = !!value;
    if (this.isPreview) this.cancelGesture();
    if (this.isConnected) this.syncPanel();
    this.requestUpdate();
    this.refreshData();void this.refreshTemplates();
    if (!this.isPreview && this.isConnected) this.syncPanel();
  }
  get preview() {
    return this.isPreview;
  }
  set editMode(value: boolean) {
    this.preview = value;
  }
  setConfig(input: unknown) {
    const source = validateConfig(input, this.kind);
    const config = resolveRecipes(source) as unknown as CardConfig;
    this.releaseTemplates();
    this.renderRoot?.querySelector<ClimateOrb>('navet-climate-orb')?.cancelInteraction();
    this.press.cancel();
    this.releaseData();
    this.photoIndex = 0; this.photoShuffle = false; this.selectedPlayer = '';
    this.advancedOpen = undefined;
    this.colorOpen = false; this.rowOpen = false;
    this.popup.disconnect();
    this.config = config;
    this.protection.configure(config.protection);
    this.dataset.kind = this.kind;
    this.dataset.size = this.compactFamily ? config.size ?? 'small' : 'medium';
    this.sliderDrafts.clear();
    this.failedArtwork = undefined;
    this.operation++;
    this.busy = false;
    this.error = '';
    this.cancelGesture();
    this.roomOpen = false;
    this.renderRoot?.querySelector<HTMLDialogElement>('dialog')?.close();
    this.requestUpdate();
    this.syncPress();
    if (this.isConnected) { this.syncPanel(); if (this.kind === 'room') this.popup.connect(); void this.refreshData();void this.refreshTemplates(); }
  }
  private get compactFamily() { return ['switch', 'button', 'scene', 'script', 'person', 'lock'].includes(this.kind); }
  private get defaultRows() {
    if (this.kind === 'chips' || this.kind === 'sub-controls' || this.kind === 'calendar' || this.kind === 'composition') return 1;
    if (this.kind === 'navigation' || this.config?.layout === 'row') return 2;
    if (this.config?.layout === 'comfortable') return 4;
    if (this.kind === 'switch' && this.config?.size === 'extra-small') return 2;
    return 3;
  }
  getCardSize() {
    if(this.templateValue('visible')===false)return 0;
    const base = Math.ceil((this.defaultRows * 56 + (this.defaultRows - 1) * 8) / 50);
    if (this.kind === 'room' || !this.config?.cards?.length) return base;
    const children = this.renderRoot?.querySelector<HTMLElement & {getCardSize(): Promise<number>}>('navet-child-cards');
    return children?.getCardSize ? children.getCardSize().then(size=>base + size) : base + this.config.cards.length * 3;
  }
  getGridOptions() {
    const columns = this.config?.layout === 'row' || !this.compactFamily ? 12 : 6;
    return {
      columns,
      min_columns: columns,
      rows: this.kind === 'calendar' || this.kind === 'composition' || this.kind !== 'room' && this.config?.cards?.length || this.kind === 'chips' || this.config?.sub_controls?.length || this.config?.links?.length || this.config?.layout === 'row' ? 'auto' : this.defaultRows,
      min_rows: this.defaultRows,
      ...this.config?.grid_options,
    };
  }
  connectedCallback() {
    super.connectedCallback();
    this.disposed = false;
    this.syncPress();
    if(this.config?.protection?.enabled)this.requestUpdate();
    if (this.contentRenderer || this.contentFailed) this.requestUpdate();
    if (this.kind === 'weather' || this.kind === 'energy-now') {
      document.addEventListener('visibilitychange',this.resumeDataVisibility);
      if (typeof IntersectionObserver !== 'undefined') {
        this.dataIntersection = new IntersectionObserver(entries=>{
          this.dataVisible = entries.some(entry=>entry.isIntersecting);
          this.dataVisibility(); this.refreshData();
        });
        this.dataIntersection.observe(this);
      } else this.dataVisible = true;
    }
    void this.refreshData();void this.refreshTemplates();
    document.addEventListener('visibilitychange',this.templateVisibility);
    if (this.kind === 'room') {
      this.syncPanel();
      this.popup.connect();
    }
    if (this.kind === 'navigation' || this.kind === 'room') for (const type of ['hashchange', 'popstate', 'location-changed']) window.addEventListener(type, this.navigationChanged);
    const event = new Event('context-request', {
      bubbles: true,
      composed: true,
      cancelable: true,
    }) as ContextRequest;
    event.context = 'states';
    event.subscribe = true;
    event.callback = (states, unsubscribe) => {
      if (this.disposed) {
        unsubscribe?.();
        return;
      }
      if (unsubscribe && unsubscribe !== this.unsubscribe) {
        this.unsubscribe?.();
        this.unsubscribe = unsubscribe;
      }
      const previous = this.states;
      this.states = states;
      this.propagateHostedState();
      this.syncPanel();
      if (!previous || this.ids(this.host).some((id) => previous[id] !== states[id]))
        this.requestUpdate();
    };
    this.dispatchEvent(event);
  }
  disconnectedCallback() {
    this.disposed = true;
    this.press.detach();this.protection.dispose();this.releaseTemplates();
    document.removeEventListener('visibilitychange',this.templateVisibility);
    this.releaseData();
    this.dataIntersection?.disconnect(); this.dataIntersection = undefined; this.dataVisible = false;
    document.removeEventListener('visibilitychange',this.resumeDataVisibility);
    this.popup.disconnect();
    for (const type of ['hashchange', 'popstate', 'location-changed']) window.removeEventListener(type, this.navigationChanged);
    this.roomOpen = false;
    this.colorOpen = false; this.rowOpen = false;
    this.advancedOpen = undefined;
    this.sliderDrafts.clear();
    this.operation++;
    this.busy = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.cancelGesture();
    this.renderRoot.querySelector<HTMLDialogElement>('dialog')?.close();
    super.disconnectedCallback();
  }
  private memberIds(hass?: Hass) {
    if (MULTI_KINDS.includes(this.kind)) return [...new Set(this.config?.entities ?? [])];
    return this.kind === 'room' && hass && this.config
      ? resolveRoomMemberIds(this.config, { areaEntityIds: area => roomEntityIds(hass, area) })
      : this.config?.entity
        ? [this.config.entity]
        : [];
  }
  private ids(hass?: Hass) {
    return [...new Set([
      ...this.memberIds(hass),
      ...conditionEntityIds(this.config?.popup?.trigger),
      ...(this.kind==='calendar' ? this.config?.calendar?.entities ?? [] : []),
      ...(this.config?.sub_controls ?? []).flatMap(sub => [sub.entity, ...conditionEntityIds(sub.visible_when)]),
      ...(this.kind === 'chips' ? this.config?.chips ?? [] : []).flatMap(chip => [...(chip.entity ? [chip.entity] : []), ...conditionEntityIds(chip.visible_when)]),
    ])];
  }
  private entity(id = this.config?.entity ?? '', kind = this.kind, primary = id === this.config?.entity): CardEntity {
    return mapEntity(
      this.host?.states[id],
      kind,
      id,
      this.host,
      primary ? this.config?.attribute : undefined,
      primary ? this.config?.unit : undefined,
    );
  }
  private get disabled() {
    return this.isPreview || this.busy || !this.host || this.protection.locked || this.templateValue('visible')===false;
  }
  private moreInfo(id = this.config?.entity) {
    if (!id || this.isPreview) return;
    this.dispatchEvent(
      new CustomEvent('hass-more-info', {
        detail: { entityId: id },
        bubbles: true,
        composed: true,
      }),
    );
  }
  private async run(work: () => Promise<unknown>) {
    if (this.disabled) return;
    const operation = ++this.operation;
    this.busy = true;
    this.error = '';
    this.requestUpdate();
    try {
      await work();
    } catch (error) {
      if (!this.disposed && operation === this.operation)
        this.error =
          error instanceof PermissionDeniedError
            ? this.t('permissionDenied')
            : error instanceof Error
              ? error.message
              : this.t('error');
    } finally {
      if (!this.disposed && operation === this.operation) {
        this.busy = false;
        this.requestUpdate();
      }
    }
  }
  private async command(command: CardCommand, entity = this.entity()) {
    if (command.type === 'update_install') {
      const config=this.config;
      if (this.disabled || this.disposed || !window.confirm(`Install ${command.latestVersion} on ${entity.name}?`) || this.disabled || this.disposed || this.config!==config) return;
    }
    if (this.host) await this.run(() => executeCommand(this.host!, this.entity(entity.externalId, kindForEntity(entity.externalId), false), command));
  }
  private async perform(action?: ActionConfig, target = this.config?.entity) {
    if (this.disabled) return;
    if (!action) {
      if (this.kind === 'room') await this.openRoom();
      else if (this.entity().capabilities.includes('toggle') && this.entity().available)
        await this.command({ type: 'toggle' });
      else if (this.entity().capabilities.includes('activate') && this.entity().available) await this.command({type:'activate'});
      else this.moreInfo();
      return;
    }
    this.actionAbort?.abort();
    const controller = this.actionAbort = new AbortController();
    const config = this.config;
    this.sequenceRunning = action.action === 'sequence';
    try {
      await this.run(() => runConfiguredAction(action, target, {
        signal: controller.signal,
        active: () => !this.isPreview && !this.disposed && !controller.signal.aborted && this.config === config,
        confirm: message => window.confirm(message),
        dispatch: async intent => {
          if (intent.type === 'toggle') {
            if (!this.host) throw new Error('Home Assistant is unavailable.');
            await executeCommand(this.host,this.entity(intent.entity,kindForEntity(intent.entity ?? ''),false),{type:'toggle'});
          } else if (intent.type === 'more-info') this.moreInfo(intent.entity);
          else if (intent.type === 'navigate') {
            if (intent.replace) history.replaceState(null, '', intent.path);
            else history.pushState(null, '', intent.path);
            window.dispatchEvent(new Event('location-changed'));
          } else if (intent.type === 'url') window.open(intent.url, '_blank', 'noopener,noreferrer');
          else if (intent.type === 'back') history.back();
          else if (intent.type === 'assist') this.dispatchEvent(new CustomEvent('hass-action',{detail:{config:{tap_action:{action:'assist',pipeline_id:intent.pipeline_id,start_listening:intent.start_listening}},action:'tap'},bubbles:true,composed:true}));
          else if (intent.type === 'fire-dom-event') this.dispatchEvent(new CustomEvent('ll-custom',{detail:intent.config,bubbles:true,composed:true}));
          else if (intent.type === 'perform-action') {
            if (!this.host) throw new Error('Home Assistant is unavailable.');
            const [domain, service] = intent.name.split('.');
            await callHostService(this.host,domain,service,intent.data,intent.target);
          }
        },
      }));
    } finally {
      if (this.actionAbort === controller) { this.actionAbort=undefined; this.sequenceRunning=false; this.requestUpdate(); }
    }
  }

  private primaryClick(event: MouseEvent) {
    if(this.momentary){event.preventDefault();return;}
    this.primaryGesture.click(event.detail, { tap: this.config?.tap_action, hold: this.config?.hold_action, double: this.config?.double_tap_action });
  }
  private pointerDown(event: PointerEvent) {
    if(this.momentary){this.press.pointerDown(event);return;}
    this.primaryGesture.down(event, { tap: this.config?.tap_action, hold: this.config?.hold_action, double: this.config?.double_tap_action });
  }
  private pointerMove(event: PointerEvent) {
    if(this.momentary){this.press.pointerMove(event);return;}
    this.primaryGesture.move(event);
  }
  private cancelHold() {
    this.press.cancel();
    this.primaryGesture.up();
  }
  private cancelGesture() {
    this.press.cancel();
    this.primaryGesture.cancel(); this.iconGesture.cancel();
    this.actionAbort?.abort(); this.actionAbort=undefined; this.sequenceRunning=false;
  }
  private openRoom() {
    if (this.disposed || !this.host || this.busy) return;
    this.popup.open();
  }
  private async displayRoom(open: boolean) {
    if (open && (this.disposed || !this.host)) return;
    const operation = this.operation;
    if (open) this.roomOpener = (this.renderRoot as ShadowRoot)?.activeElement as HTMLElement | undefined;
    this.roomOpen = open;
    this.sliderDrafts.clear();
    this.requestUpdate();
    if (open) {
      await this.updateComplete;
      if (this.disposed || !this.roomOpen || operation !== this.operation) return;
      this.renderRoot.querySelector<HTMLDialogElement>('.room-dialog')?.showModal();
    } else {
      this.renderRoot?.querySelector<HTMLDialogElement>('.room-dialog')?.close();
      this.roomOpener?.focus();
    }
  }
  private closeRoom = () => this.popup.close();
  private navigation() {
    const active = (path: string) => path.startsWith('#') ? location.hash === path : location.pathname + location.search + location.hash === path;
    return html`<nav class=${`navigation navigation-${this.config?.navigation_position ?? 'inline'}`} style=${styleMap({'--navigation-offset': `${this.config?.navigation_offset ?? 0}px`})} aria-label=${this.config?.name ?? this.t('navigation')}>${this.config?.links?.map(link=>html`<button class="nav-link" aria-current=${active(link.path) ? 'page' : nothing} ?disabled=${this.disabled} @click=${()=>this.perform({action:'navigate',navigation_path:link.path})}>${link.name}</button>`)}</nav>`;
  }
  private propagateHostedState() {
    for (const element of this.renderRoot?.querySelectorAll<HTMLElement & {hass?:Hass}>('navet-child-cards') ?? []) element.hass = this.host;
    const host=this.host;
    if(host) for(const element of this.renderRoot?.querySelectorAll<HTMLElement & {entity?:CardEntity;candidates:ReturnType<typeof listMediaGroupCandidates>}>('navet-media-groups') ?? []) if(element.entity)element.candidates=listMediaGroupCandidates(host,element.entity.externalId);
  }
  private childCards(active = true) {
    if (!this.config?.cards?.length || !active) return nothing;
    const key = 'child-cards';
    if (!this.controlModules.has(key)) this.controlModules.set(key, import('./composition/child-cards').then(()=>{if(!this.disposed)this.requestUpdate();}).catch(()=>{this.failedControlModules.add(key);if(!this.disposed)this.requestUpdate();}));
    if (this.failedControlModules.has(key)) return html`<p role="alert">${this.t('content_error')}</p>`;
    return html`<navet-child-cards .definitions=${this.config.definitions} ?inert=${this.protection.locked || this.isPreview} .cards=${this.config.cards} .hass=${this.host} .active=${active} .preview=${this.isPreview} .editMode=${this.isPreview} .layout=${this.config.cards_layout ?? 'vertical'} .columns=${this.config.cards_columns ?? 2} @hass-more-info=${async (event:CustomEvent<{entityId?:string}>)=>{if(this.kind !== 'room')return;event.stopPropagation();const id=event.detail?.entityId;const operation=this.operation;await this.closeRoom();if(!this.disposed && operation===this.operation && typeof id==='string')this.moreInfo(id);}}></navet-child-cards>`;
  }
  private choice(entity: CardEntity, type: 'select' | 'hvac_mode' | 'source') {
    if (!entity.capabilities.includes(type)) return nothing;
    const options = type === 'select' ? entity.options : type === 'hvac_mode' ? entity.hvacModes : entity.sources;
    const value = type === 'source' ? entity.source : entity.state;
    return html`<label class="choice"><span>${this.t(type)}</span><select aria-label=${this.t(type)} .value=${value ?? ''} ?disabled=${this.disabled || !entity.available}
      @change=${(e: Event) => this.command({type, value: (e.target as HTMLSelectElement).value}, entity)}>
      ${!options?.includes(value ?? '') ? html`<option value="" .selected=${live(true)}>${this.t(entity.available ? 'selectOption' : entity.state)}</option>` : nothing}
      ${options?.map(option => html`<option value=${option} .selected=${live(option === value)}>${this.t(option)}</option>`)}
    </select></label>`;
  }
  private colorControls(entity: CardEntity) {
    if (!entity.capabilities.some(cap=>cap === 'color' || cap === 'effect')) return nothing;
    return this.advancedControl('color',entity);
  }
  private advancedControl(type:'color'|'range'|'tilt'|'fan'|'climate-options'|'vacuum-options'|'media-options'|'comfort'|'remote'|'update',entity:CardEntity) {
    if (!this.controlModules.has(type)) {
      const load = import('./controls/advanced-controls');
      this.controlModules.set(type,load.then(()=>{if(!this.disposed)this.requestUpdate();}).catch(()=>{this.failedControlModules.add(type);if(!this.disposed)this.requestUpdate();}));
    }
    if (this.failedControlModules.has(type)) return html`<p class="notice" role="status">${this.t('content_error')}</p>`;
    const config = this.config;
    const dispatch = (event:CustomEvent<{command:CardCommand}>)=>{event.stopPropagation();if(this.config===config)void this.command(event.detail.command,entity);};
    const disabled = this.disabled || !entity.available;
    if (type === 'comfort') return html`<navet-comfort-controls .language=${this.language} .entity=${entity} .disabled=${disabled} @control-command=${dispatch}></navet-comfort-controls>`;
    if (type === 'update') return html`<navet-update-controls .entity=${entity} .disabled=${disabled} @control-command=${dispatch}></navet-update-controls>`;
    if (type === 'remote') return html`<navet-remote-controls .language=${this.language} .entity=${entity} .disabled=${disabled} @control-command=${dispatch}></navet-remote-controls>`;
    if (type === 'media-options') return html`<navet-media-options .entity=${entity} .disabled=${disabled} @control-command=${dispatch}></navet-media-options>${entity.capabilities.some(cap=>cap==='media_join'||cap==='media_unjoin') ? html`<navet-media-groups .language=${this.language} .entity=${entity} .candidates=${this.host ? listMediaGroupCandidates(this.host,entity.externalId) : []} .disabled=${disabled} .preview=${this.isPreview} @control-command=${dispatch}></navet-media-groups>` : nothing}`;
    if (type === 'climate-options') return html`<navet-climate-options .entity=${entity} .disabled=${disabled} @control-command=${dispatch}></navet-climate-options>`;
    if (type === 'vacuum-options') return html`<navet-vacuum-options .entity=${entity} .disabled=${disabled} @control-command=${dispatch}></navet-vacuum-options>`;
    if (type === 'fan') return html`<navet-fan-options .entity=${entity} .disabled=${disabled} @control-command=${dispatch}></navet-fan-options>`;
    if (type === 'range') return html`<navet-climate-range .entity=${entity} .disabled=${disabled} @control-command=${dispatch}></navet-climate-range>`;
    if (type === 'tilt') return html`<navet-cover-tilt .entity=${entity} .disabled=${disabled} @control-command=${dispatch}></navet-cover-tilt>`;
    return html`<navet-light-color .entity=${entity} .disabled=${disabled} @control-command=${dispatch}></navet-light-color>`;
  }
  private async openAdvanced(type:'range'|'tilt'|'fan'|'climate-options'|'vacuum-options'|'media-options'|'comfort'|'remote'|'update',entity:CardEntity) {
    if (this.disabled) return;
    const opening = {type,entity:entity.externalId,opener:(this.renderRoot as ShadowRoot).activeElement as HTMLElement};
    this.advancedOpen = opening;
    this.requestUpdate();
    await this.updateComplete;
    if (!this.disposed && !this.isPreview && this.advancedOpen === opening) this.renderRoot.querySelector<HTMLDialogElement>('.advanced-dialog')?.showModal();
  }
  private closeAdvanced() {
    const opener = this.advancedOpen?.opener;
    this.advancedOpen = undefined;
    this.renderRoot.querySelector<HTMLDialogElement>('.advanced-dialog')?.close();
    this.requestUpdate(); opener?.focus();
  }
  private fanControls(entity: CardEntity) {
    return entity.capabilities.some(cap=>['fan_preset','oscillate','direction'].includes(cap)) ? this.advancedControl('fan',entity) : nothing;
  }
  private deviceOptions(entity: CardEntity) {
    return html`${entity.capabilities.some(cap=>['climate_preset','climate_fan','climate_swing','climate_swing_horizontal'].includes(cap)) ? this.advancedControl('climate-options',entity) : nothing}${entity.capabilities.includes('vacuum_speed') ? this.advancedControl('vacuum-options',entity) : nothing}${entity.externalId.startsWith('media_player.') && entity.capabilities.some(cap=>['seek','repeat','shuffle','power_on','power_off','media_join','media_unjoin'].includes(cap)) ? this.advancedControl('media-options',entity) : nothing}${['humidifier.','water_heater.'].some(prefix=>entity.externalId.startsWith(prefix)) ? this.advancedControl('comfort',entity) : nothing}${entity.externalId.startsWith('remote.') ? this.advancedControl('remote',entity) : nothing}${entity.externalId.startsWith('update.') ? this.advancedControl('update',entity) : nothing}`;
  }
  private inlineControls(entity: CardEntity, control: RoomPlannedMember['control'] = 'auto') {
    if (control === 'state') return nothing;
    const unavailable = this.disabled || !entity.available;
    if (control === 'select') return html`${this.choice(entity,'select')}${this.choice(entity,'hvac_mode')}${this.choice(entity,'source')}${this.fanControls(entity)}${this.deviceOptions(entity)}`;
    if (control === 'slider') return html`${(['brightness','volume','temperature','position','number','color_temperature','speed'] as const).filter(type=>entity.capabilities.includes(type)).map(type=>this.slider(entity,type,true))}${entity.capabilities.includes('temperature_range') ? this.advancedControl('range',entity) : nothing}${entity.capabilities.includes('tilt') ? this.advancedControl('tilt',entity) : nothing}${entity.externalId.startsWith('humidifier.') ? this.advancedControl('comfort',entity) : nothing}`;
    if (control === 'toggle') return entity.capabilities.includes('toggle') ? this.action(this.t(entity.active ? 'off' : 'on'), 'switch', () => this.command({type:'toggle'}, entity), unavailable) : nothing;
    return html`<div class="inline-actions">
      ${entity.capabilities.includes('toggle') ? this.action(this.t(entity.active ? 'off' : 'on'), 'switch', () => this.command({type:'toggle'}, entity), unavailable) : nothing}
      ${entity.capabilities.includes('activate') ? this.action(this.t('runAction'), 'play', () => this.command({type:'activate'},entity),unavailable) : nothing}
      ${(['start','pause','return_home'] as const).filter(type=>entity.capabilities.includes(type)).map(type=>this.action(this.t(type),type === 'start' ? 'play' : type,()=>this.command({type},entity),unavailable))}
      ${entity.capabilities.includes(entity.state === 'playing' ? 'pause' : 'play') ? this.action(this.t(entity.state === 'playing' ? 'pause' : 'play'), entity.state === 'playing' ? 'pause' : 'play', () => this.command({type:'play_pause'}, entity), unavailable) : nothing}
      ${(['previous','next','mute'] as const).filter(type=>entity.capabilities.includes(type)).map(type=>this.action(this.t(type === 'mute' && entity.muted ? 'unmute' : type),type,()=>this.command({type},entity),unavailable))}
      ${(['open','stop','close'] as const).filter(type=>entity.capabilities.includes(type)).map(type=>this.action(this.t(type),type,()=>this.command({type},entity),unavailable))}
    </div>${(['brightness','volume','temperature','position','number','color_temperature','speed'] as const).filter(type=>entity.capabilities.includes(type)).map(type=>this.slider(entity,type,true))}
    ${this.choice(entity,'select')}${this.choice(entity,'hvac_mode')}${this.choice(entity,'source')}${this.fanControls(entity)}${this.deviceOptions(entity)}${this.colorControls(entity)}${entity.capabilities.includes('temperature_range') ? this.advancedControl('range',entity) : nothing}${entity.capabilities.some(cap=>cap.startsWith('tilt')) ? this.advancedControl('tilt',entity) : nothing}`;
  }
  private calendar(){
    const key='calendar';if(!this.controlModules.has(key))this.controlModules.set(key,import('./composition/calendar').then(()=>{if(!this.disposed)this.requestUpdate();}).catch(()=>{this.failedControlModules.add(key);if(!this.disposed)this.requestUpdate();}));
    if(this.failedControlModules.has(key))return html`<p role="alert">${this.t('content_error')}</p>`;
    return html`<navet-calendar .config=${this.config} .hass=${this.host} .preview=${this.isPreview} .disabled=${this.disabled} @calendar-action=${(event:CustomEvent<{entity:string;action:ActionConfig}>)=>{event.stopPropagation();if((event.currentTarget as HTMLElement&{config?:CardConfig}).config===this.config&&this.config?.calendar?.entities.includes(event.detail.entity))void this.perform(event.detail.action,event.detail.entity);}}></navet-calendar>`;
  }
  private subControls() {
    if (!this.config?.sub_controls?.length && this.kind === 'sub-controls') return html`<p class="notice">Add sub-controls in the visual editor.</p>`;
    const key = 'sub-controls';
    if (!this.controlModules.has(key)) this.controlModules.set(key,import('./composition/sub-controls').then(()=>{if(!this.disposed)this.requestUpdate();}).catch(()=>{this.failedControlModules.add(key);if(!this.disposed)this.requestUpdate();}));
    if (this.failedControlModules.has(key)) return html`<p class="notice" role="status">${this.t('content_error')}</p>`;
    return html`<navet-sub-controls .config=${this.config} .hass=${this.host} .disabled=${this.disabled} .preview=${this.isPreview}
      @sub-control-command=${(event:CustomEvent<{entity:string;command:CardCommand}>)=>{event.stopPropagation();if ((event.currentTarget as HTMLElement & {config?:CardConfig}).config !== this.config) return;void this.command(event.detail.command,this.entity(event.detail.entity,kindForEntity(event.detail.entity),false));}}
      @sub-control-action=${(event:CustomEvent<{entity:string;action:ActionConfig}>)=>{event.stopPropagation();if ((event.currentTarget as HTMLElement & {config?:CardConfig}).config !== this.config) return;void this.perform(event.detail.action,event.detail.entity);}}
      @sub-control-details=${(event:CustomEvent<{entity:string}>)=>{event.stopPropagation();if ((event.currentTarget as HTMLElement & {config?:CardConfig}).config !== this.config) return;this.moreInfo(event.detail.entity);}}></navet-sub-controls>`;
  }
  private chips() {
    const key = 'chips';
    if (!this.controlModules.has(key)) this.controlModules.set(key,import('./composition/chips').then(()=>{if(!this.disposed)this.requestUpdate();}).catch(()=>{this.failedControlModules.add(key);if(!this.disposed)this.requestUpdate();}));
    if (this.failedControlModules.has(key)) return html`<p class="notice" role="status">${this.t('content_error')}</p>`;
    return html`<navet-chips .config=${this.config} .hass=${this.host} .disabled=${this.disabled} .preview=${this.isPreview}
      @chip-action=${(event:CustomEvent<{entity?:string;action:ActionConfig}>)=>{event.stopPropagation();if ((event.currentTarget as HTMLElement & {config?:CardConfig}).config !== this.config) return;void this.perform(event.detail.action,event.detail.entity);}}
      @chip-details=${(event:CustomEvent<{entity:string}>)=>{event.stopPropagation();if ((event.currentTarget as HTMLElement & {config?:CardConfig}).config !== this.config) return;this.moreInfo(event.detail.entity);}}></navet-chips>`;
  }
  private slider(entity: CardEntity, type: 'brightness' | 'volume' | 'temperature' | 'position' | 'number' | 'color_temperature' | 'speed', inline = false) {
    if (
      !entity.capabilities.includes(type) ||
      (type === 'brightness' && this.config?.show_brightness === false)
    )
      return nothing;
    const draftKey = `${entity.externalId}:${type}`;
    const min = type === 'temperature' ? entity.minTemperature! : type === 'number' ? entity.minNumber! : type === 'color_temperature' ? entity.minKelvin! : 0;
    const max = type === 'temperature' ? entity.maxTemperature! : type === 'number' ? entity.maxNumber! : type === 'color_temperature' ? entity.maxKelvin! : 100;
    const step = type === 'temperature' ? entity.stepTemperature! : type === 'number' ? entity.stepNumber! : 1;
    const value = this.sliderDrafts.get(draftKey) ?? entity[type] ?? min;
    const progress = Math.min(100, Math.max(0, (value - min) / (max - min) * 100));
    const unit =
      type === 'temperature' ? (this.host?.config?.unit_system?.temperature ?? '°C') : type === 'number' ? entity.unit : type === 'color_temperature' ? 'K' : '%';
    return html`<label class=${`slider ${!inline && type === 'position' ? 'cover-position' : !inline && type === 'temperature' ? 'temperature-slider' : ''}`}><span class="slider-label"><span>${this.t(type)}</span><output>${value}${unit}</output></span>
      <input type="range" style=${styleMap({ '--progress': `${progress}%` })} aria-label=${this.t(type)} min=${min} max=${max} step=${step} .value=${String(value)} ?disabled=${this.disabled || !entity.available}
        @input=${(e: Event) => {
          this.sliderDrafts.set(draftKey, Number((e.target as HTMLInputElement).value));
          this.requestUpdate();
        }}
        @change=${(e: Event) => {
          void this.command(
            { type, value: Number((e.target as HTMLInputElement).value) },
            entity,
          ).finally(() => {
            this.sliderDrafts.delete(draftKey);
            this.requestUpdate();
          });
        }} />
    </label>`;
  }
  private action(
    label: string,
    glyph: string,
    work: () => unknown,
    disabled = this.disabled,
    extra = '',
  ) {
    return html`<button class=${`action ${extra}`} aria-label=${label} title=${label} ?disabled=${disabled} @click=${work}>${icon(glyph)}</button>`;
  }
  private details() {
    return this.action(
      this.t('details'),
      'details',
      () => this.moreInfo(this.kind === 'media-stack' ? this.selectedPlayer || this.config?.entities?.[0] : undefined),
      this.disabled,
      'details',
    );
  }
  private temperatureStep(entity: CardEntity, direction: number) {
    const value = Math.max(
      entity.minTemperature!,
      Math.min(
        entity.maxTemperature!,
        (entity.temperature ?? entity.minTemperature!) + direction * entity.stepTemperature!,
      ),
    );
    void this.command({ type: 'temperature', value: Number(value.toFixed(3)) }, entity);
  }
  private familyContent(entity: CardEntity, value: string, members: CardEntity[], room?: RoomPlan) {
    if (this.kind === 'media-stack') entity = members.find(e=>e.externalId === this.selectedPlayer) ?? members[0] ?? entity;
    const unavailable = this.disabled || !entity.available;
    if (this.config?.layout === 'row' && !['room','navigation','number','select','lock',...MULTI_KINDS,...CONTENT_KINDS].includes(this.kind)) {
      return html`<div class="row-value">${this.config?.show_state === false ? nothing : html`<span class="state">${entity.available ? (entity.subtitle || this.t(entity.value)) : value} ${entity.unit}</span>`}</div>
        <details class="advanced-controls" .open=${this.rowOpen} @toggle=${(event:Event)=>{this.rowOpen=(event.currentTarget as HTMLDetailsElement).open;this.requestUpdate();}}><summary>${this.t('controls')}</summary>${this.rowOpen ? html`${this.inlineControls(entity)}${this.details()}` : nothing}</details>`;
    }
    if (this.kind === 'composition') return this.config?.cards?.length?nothing:html`<p class="notice">Add child cards and reusable definitions in the visual editor.</p>`;
    if (this.kind === 'calendar') return this.calendar();
    if (this.kind === 'chips') return this.chips();
    if (this.kind === 'sub-controls') return this.subControls();
    if (this.kind === 'button') return nothing;
    if (customContentKind(this.kind)) {
      if (!this.contentLoad) this.contentLoad = import('./custom-content').then(module=>{this.contentRenderer=module.customContent;adoptStyles(this.renderRoot as ShadowRoot,supportsAdoptingStyleSheets ? [cardStyles,module.customContentStyles] : [module.customContentStyles]);if(!this.disposed)this.requestUpdate();}).catch(()=>{this.contentFailed=true;if(!this.disposed)this.requestUpdate();});
      if (!this.contentRenderer) return html`<p class="notice" role="status">${this.t(this.contentFailed ? 'content_error' : 'loading')}</p>`;
      const contentImage=typeof this.templateValue('picture')==='string'?this.templateValue('picture') as string:this.config?.images?.[this.photoIndex] ?? this.config?.image ?? entity.artwork;
      return this.contentRenderer({kind:this.kind, config:typeof this.templateValue('picture')==='string'&&this.kind==='photo'?{...this.config!,image:this.templateValue('picture') as string,images:undefined}:this.config!, entity, members, disabled:this.disabled, t:key=>this.t(key), details:id=>this.moreInfo(id), command:(command,e)=>this.command(command,e), perform:()=>this.perform(this.config?.tap_action), history:this.kind === 'energy-now' ? this.supplementary as HistoryPoint[] : [], editNote:()=>this.editNote(), photoIndex:typeof this.templateValue('picture')==='string'?0:this.photoIndex, photoShuffle:this.photoShuffle, togglePhotoShuffle:()=>{this.photoShuffle=!this.photoShuffle;this.requestUpdate();}, changePhoto:(index)=>{this.photoIndex=index;this.failedArtwork=undefined;this.requestUpdate();}, imageFailed:this.failedArtwork === contentImage, onImageError:()=>{ this.failedArtwork=contentImage; this.requestUpdate(); }});
    }
    switch (this.kind) {
      case 'update': return html`<span class="state">${entity.updateInstalledVersion ?? '—'} → ${entity.updateLatestVersion ?? '—'}</span><div class="actions">${this.action(this.t('controls'),'details',()=>this.openAdvanced('update',entity),unavailable)}${this.details()}</div>`;
      case 'humidifier':
      case 'water-heater':
      case 'remote': {
        const control = this.kind === 'remote' ? 'remote' : 'comfort';
        const power = entity.active ? 'power_off' : 'power_on';
        return html`<span class="state">${value}</span><div class="actions">${entity.capabilities.includes(power) ? this.action(this.t(entity.active ? 'off' : 'on'),'switch',()=>this.command({type:power},entity),unavailable) : nothing}${this.action(this.t('controls'),'details',()=>this.openAdvanced(control,entity),unavailable)}${this.details()}</div>`;
      }
      case 'fan':
        return html`${entity.available ? this.slider(entity,'speed') : html`<span class="state">${value}</span>`}<div class="actions">${entity.capabilities.includes('speed') ? [33,66,100].map(value=>html`<button class=${`action fan-preset ${entity.active && entity.speed === value ? 'selected' : ''}`} aria-pressed=${entity.active && entity.speed === value} aria-label=${`${this.t('speed')} ${value}%`} ?disabled=${unavailable} @click=${()=>this.command({type:'speed',value},entity)}>${icon('fan')}<span>${value}</span></button>`) : nothing}${entity.capabilities.some(cap=>['fan_preset','oscillate','direction'].includes(cap)) ? this.action(this.t('fanOptions'),'fan',()=>this.openAdvanced('fan',entity),unavailable) : nothing}${this.details()}</div>`;
      case 'lock':
        { const type = entity.state === 'locked' ? 'unlock' : 'lock';
        return html`<div class="lock-symbol">${icon(entity.state === 'locked' ? 'lock' : 'unlock')}</div><span class="state lock-state">${value}</span>${entity.capabilities.includes(type) ? html`<label class="lock-confirm"><span>${this.t(type === 'unlock' ? 'slideUnlock' : 'slideLock')}</span><input type="range" min="0" max="100" .value=${'0'} aria-label=${this.t(type === 'unlock' ? 'slideUnlock' : 'slideLock')} @pointercancel=${(event:PointerEvent)=>{(event.target as HTMLInputElement).value='0';}} ?disabled=${unavailable || !['locked','unlocked'].includes(entity.state)} @change=${(event:Event)=>{const input=event.target as HTMLInputElement;if(Number(input.value)>=95)void this.command({type},entity);input.value='0';}}></label>` : nothing}`;
      }
      case 'vacuum': {
        const running=['cleaning','mopping'].includes(entity.state);
        const control=running ? entity.capabilities.includes('stop') ? 'stop' : 'pause' : 'start';
        return html`<div class="vacuum-summary"><div><strong class="vacuum-state">${value}</strong><div class="vacuum-facts">${entity.battery !== undefined && entity.available ? html`<span>${icon('battery')}${entity.battery}%</span>` : nothing}${entity.cleanedArea !== undefined && entity.available ? html`<span>${entity.cleanedArea} m²</span>` : nothing}${entity.cleaningMinutes !== undefined && entity.available ? html`<span>${entity.cleaningMinutes} min</span>` : nothing}</div></div><div class="vacuum-robot" aria-hidden="true">${svg`<svg viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="36" stroke="currentColor" opacity=".3"/><path d="M7 41A33 33 0 0 1 73 41" stroke="currentColor" opacity=".55" stroke-width="2.5" stroke-linecap="round"/><rect x="32" y="5" width="16" height="4" rx="2" fill="currentColor" opacity=".65"/><path d="M12 49H68" stroke="currentColor" opacity=".2"/><circle cx="40" cy="31" r="13" fill="currentColor" opacity=".1"/><circle cx="40" cy="29" r="12" stroke="currentColor" opacity=".6"/><circle cx="40" cy="29" r="8.5" fill="currentColor" opacity=".14"/><circle cx="40" cy="29" r="2" fill="currentColor" opacity=".8"/><circle cx="40" cy="58" r="7" fill="#f97316"/><path d="M40 53v10m-5-5h10m-8.5-3.5 7 7m0-7-7 7" stroke="white" stroke-width="1"/><path d="M27 69H53" stroke="currentColor" opacity=".45" stroke-width="2" stroke-linecap="round"/></svg>`}</div></div><div class="actions">${entity.capabilities.includes(control) ? this.action(this.t(control),control === 'start' ? 'play' : control === 'stop' ? 'square' : 'pause',()=>this.command({type:control},entity),unavailable) : nothing}${entity.capabilities.includes('return_home') && !entity.capabilities.includes('vacuum_speed') ? this.action(this.t('return_home'),'return_home',()=>this.command({type:'return_home'},entity),unavailable) : nothing}${entity.capabilities.includes('vacuum_speed') ? this.action(this.t('vacuumOptions'),'vacuum',()=>this.openAdvanced('vacuum-options',entity),unavailable) : nothing}${this.details()}</div>`;
      }
      case 'person':
        return html`<button class="person-body" aria-label=${entity.name} ?disabled=${this.disabled} @click=${this.primaryClick} @pointerdown=${this.pointerDown} @pointermove=${this.pointerMove} @pointerup=${this.cancelHold} @pointerleave=${this.cancelHold} @pointercancel=${()=>{this.primaryGesture.cancelPointer();}} @contextmenu=${(event:Event)=>{if(this.config?.hold_action)event.preventDefault();}}>${entity.available && entity.artwork && this.failedArtwork !== entity.artwork ? html`<img src=${entity.artwork} alt="" referrerpolicy="no-referrer" @error=${()=>{this.failedArtwork=entity.artwork;this.requestUpdate();}}>` : html`<span class="avatar">${icon('person')}</span>`}<span class="person-identity"><span class="eyebrow">${value}</span><span class="name">${this.config?.name ?? entity.name}</span></span></button><div class="actions">${this.details()}</div>`;
      case 'weather': {
        const forecast = entity.available ? this.supplementary as ForecastDay[] : [];
        const today=forecast[0];
        return html`<div class="weather-body"><div><div class="metric">${entity.available ? entity.temperature ?? '—' : '—'}<span class="unit">${entity.available ? entity.unit : ''}</span></div><div class="state">${today ? html`↑ ${today.high}° ${today.low !== undefined ? html`↓ ${today.low}°` : nothing}` : nothing}${entity.available && entity.feelsLike !== undefined ? html` · ${this.t('feelsLike')} ${entity.feelsLike}°` : nothing}</div></div><div class="weather-condition">${icon(entity.state === 'sunny' ? 'weather' : entity.state.includes('rain') ? 'rain' : entity.state === 'clear-night' ? 'moon' : 'cloud')}<span class="state">${value}</span></div></div><div class="weather-footer"><div class="forecast-row">${forecast.map(day=>html`<div><span>${new Intl.DateTimeFormat(this.language,{weekday:'short'}).format(day.time)}</span>${icon(day.condition === 'sunny' ? 'weather' : day.condition.includes('rain') ? 'rain' : 'cloud')}<strong>${Math.round(day.high)}°</strong></div>`)}</div>${this.details()}</div>`;
      }
      case 'scene':
        return html`<div class="actions"><span class="state action-room">${entity.areaName ?? ''}</span>${this.action(this.t('runAction'),'play',()=>this.command({type:'activate'},entity),unavailable,'accent')}${this.details()}</div>`;
      case 'script':
        return html`<div class="actions">${this.details()}</div>`;
      case 'entity':
        return html`<div class="sensor-value"><div class=${`metric ${value.length > 10 ? 'long' : ''}`}>${entity.available ? entity.value : value}<span class="unit">${entity.available ? entity.unit : ''}</span></div></div><div class="actions">${this.details()}</div>`;
      case 'light':
        return html`${this.config?.show_state !== false && !entity.available ? html`<span class="state">${value}</span>` : nothing}
          ${this.slider(entity, 'brightness')}${entity.capabilities.includes('color_temperature') && this.config?.layout === 'comfortable' ? html`<details class="advanced-controls"><summary>${this.t('color_temperature')}</summary>${this.slider(entity,'color_temperature')}</details>` : nothing}
          ${entity.capabilities.some(cap=>cap === 'color' || cap === 'effect') ? html`<details class="advanced-controls" .open=${this.colorOpen} @toggle=${(event:Event)=>{this.colorOpen=(event.currentTarget as HTMLDetailsElement).open;this.requestUpdate();}}><summary>${this.t('colorEffects')}</summary>${this.colorOpen ? this.colorControls(entity) : nothing}</details>` : nothing}
          <div class="actions">${entity.capabilities.includes('brightness') && this.config?.show_brightness !== false ? [100, 50].map((preset) => html`<button class=${`action ${entity.active && entity.brightness === preset ? 'selected' : ''}`} aria-label=${`${this.t('brightness')} ${preset}%`} aria-pressed=${entity.active && entity.brightness === preset} ?disabled=${unavailable} @click=${() => this.command({ type: 'brightness', value: preset }, entity)}>${preset}</button>`) : nothing}${this.details()}</div>`;
      case 'switch':
        return !entity.available && this.config?.show_state !== false
          ? html`<span class="state">${value}</span>`
          : nothing;
      case 'sensor':
        return this.config?.show_state === false
          ? nothing
          : html`<div class="sensor-value"><div class=${`metric ${value.length > 10 ? 'long' : ''}`}><span>${value}</span>${entity.available ? html`<span class="unit">${entity.unit}</span>` : nothing}</div></div>`;
      case 'climate': {
        const advanced = entity.capabilities.includes('temperature_range') || entity.capabilities.some(cap=>['climate_preset','climate_fan','climate_swing','climate_swing_horizontal'].includes(cap));
        const unit = this.host?.config?.unit_system?.temperature ?? '°C';
        const operating =
          entity.climateAction === 'heating'
            ? this.t('heating')
            : entity.climateAction === 'cooling'
              ? this.t('cooling')
              : this.t(entity.state);
        return html`${entity.capabilities.includes('temperature_range') && !entity.capabilities.includes('temperature') ? nothing : html`<navet-climate-orb .value=${this.sliderDrafts.get(`${entity.externalId}:temperature`) ?? entity.temperature ?? entity.minTemperature ?? 7}
          .min=${entity.minTemperature ?? 7} .max=${entity.maxTemperature ?? 30} .step=${entity.stepTemperature ?? .5}
          .disabled=${unavailable} .interactive=${entity.capabilities.includes('temperature')}
          .label=${this.t('temperature')} .unit=${unit}
          @value-input=${(e: CustomEvent<{value: number}>) => { this.sliderDrafts.set(`${entity.externalId}:temperature`, e.detail.value); this.requestUpdate(); }}
          @value-cancel=${() => { this.sliderDrafts.delete(`${entity.externalId}:temperature`); this.requestUpdate(); }}
          @value-commit=${(e: CustomEvent<{value: number}>) => {
            void this.command({type:'temperature',value:e.detail.value},entity).finally(() => { this.sliderDrafts.delete(`${entity.externalId}:temperature`); this.requestUpdate(); });
          }}></navet-climate-orb>`}
          <div class="climate-value">${
            this.config?.show_state !== false
              ? html`<div class="metric">${entity.available ? (entity.currentTemperature ?? entity.temperature ?? '—') : '—'}<span class="unit">${unit}</span></div>
          <div class="state climate-state">${entity.available ? `${entity.state === 'heat' ? this.t('heatTo') : entity.state === 'cool' ? this.t('coolTo') : operating}${entity.temperature !== undefined ? ` ${(this.sliderDrafts.get(`${entity.externalId}:temperature`) ?? entity.temperature)}${unit}` : ''}` : value}</div>`
              : nothing
          }</div>
          ${this.config?.layout === 'comfortable' && !advanced ? this.choice(entity,'hvac_mode') : nothing}<div class="actions">${advanced ? this.action(this.t(entity.capabilities.includes('temperature_range') ? 'temperatureRange' : 'climateOptions'),'climate',()=>this.openAdvanced(entity.capabilities.includes('temperature_range') ? 'range' : 'climate-options',entity),unavailable) : nothing}${!advanced && entity.capabilities.includes('temperature') ? html`${this.action(this.t('decreaseTemperature'), 'minus', () => this.temperatureStep(entity, -1), unavailable || entity.temperature! <= entity.minTemperature!)}${this.action(this.t('increaseTemperature'), 'plus', () => this.temperatureStep(entity, 1), unavailable || entity.temperature! >= entity.maxTemperature!)}` : nothing}${this.details()}</div>`;
      }
      case 'cover':
        return html`<div class="cover-fill" style=${styleMap({ '--closure': String((100 - (this.sliderDrafts.get(`${entity.externalId}:position`) ?? entity.position ?? (entity.active ? 100 : 0))) / 100) })}></div>${this.slider(entity, 'position')}
          <div class="cover-value">${this.config?.show_state !== false ? html`<div class="metric">${entity.available && entity.position !== undefined ? `${this.sliderDrafts.get(`${entity.externalId}:position`) ?? entity.position}%` : '—'}</div><div class="state">${value}</div>` : nothing}</div>
          <div class="actions">${(['open', 'stop', 'close'] as const).filter((type) => entity.capabilities.includes(type)).map((type) => this.action(this.t(type), type, () => this.command({ type }, entity), unavailable))}${entity.capabilities.some(cap=>cap.startsWith('tilt')) ? this.action(this.t('tilt'),'cover',()=>this.openAdvanced('tilt',entity),unavailable) : nothing}${this.details()}</div>`;
      case 'media-stack':
      case 'media': {
        const time = (seconds: number) =>
          `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
        return html`${this.kind === 'media-stack' && members.length > 1 ? html`<select class="player-select" aria-label=${this.t('media')} @change=${(event:Event)=>{this.selectedPlayer=(event.target as HTMLSelectElement).value;this.requestUpdate();}}>${members.map(e=>html`<option value=${e.externalId} ?selected=${e.externalId===entity.externalId}>${e.name}</option>`)}</select>` : nothing}<div class="artwork">${
          entity.available && entity.artwork && this.failedArtwork !== entity.artwork
            ? html`<img src=${entity.artwork} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error=${() => {
                this.failedArtwork = entity.artwork;
                this.requestUpdate();
              }} />`
            : icon('disc')
        }</div>
          ${this.config?.show_state !== false ? html`<div class="media-info"><div class="state track">${entity.available ? entity.subtitle || value : value}</div>${entity.available && entity.artist ? html`<div class="artist">${entity.artist}</div>` : nothing}</div>` : nothing}
          ${entity.available && entity.duration ? html`<div class="timeline"><span>${time(Math.min(entity.elapsed ?? 0, entity.duration))}</span><progress aria-label=${this.t('position')} max=${entity.duration} value=${entity.elapsed ?? 0}></progress><span>${time(entity.duration)}</span></div>` : nothing}
          <div class="actions">${entity.capabilities.some(cap=>['volume','next','previous','mute','source','seek','repeat','shuffle','power_on','power_off','media_join','media_unjoin'].includes(cap)) ? this.action(this.t(entity.capabilities.some(cap=>['next','previous','mute','source','seek','repeat','shuffle','power_on','power_off','media_join','media_unjoin'].includes(cap)) ? 'controls' : 'volume'),'volume',()=>this.openAdvanced('media-options',entity),unavailable) : nothing}${entity.capabilities.includes(entity.state === 'playing' ? 'pause' : 'play') ? this.action(this.t(entity.state === 'playing' ? 'pause' : 'play'), entity.state === 'playing' ? 'pause' : 'play', () => this.command({ type: 'play_pause' }, entity), unavailable, 'media-playback') : nothing}${this.details()}</div>`;
      }
      case 'number':
        return html`${!entity.available && this.config?.show_state !== false ? html`<span class="state">${value}</span>` : nothing}${this.slider(entity,'number')}<div class="actions">${this.details()}</div>`;
      case 'select':
        return html`${this.choice(entity,'select')}<div class="actions">${this.details()}</div>`;
      case 'navigation':
        return this.navigation();
      case 'room': {
        const count = members.filter((member) => member.available && member.active).length;
        return html`<div class="room-summary"><span class="room-count">${count}</span><span class="state">${this.t('active')} · ${members.length} ${this.t('entities')}</span></div>
          ${room && !room.legacy ? html`<div class="room-overview">${room.members.filter(member=>['temperature','humidity','occupancy'].includes(member.role)).slice(0,3).map(member=>html`<button ?disabled=${this.disabled} @click=${()=>this.moreInfo(member.entity)}><span>${member.model.name}</span><strong>${member.model.available ? `${this.t(member.model.value)} ${member.model.unit}` : this.t(member.model.state)}</strong></button>`)}</div>` : html`<div class="room-members">${members.slice(0, 4).map((member) => html`<button class="icon" aria-label=${member.name} title=${member.name} ?disabled=${this.disabled} @click=${() => this.moreInfo(member.externalId)}>${icon(kindForEntity(member.externalId))}</button>`)}</div>`}
          ${!members.length ? html`<p class="notice">${this.t(this.config?.area && !this.host?.entities ? 'roomUnavailable' : 'roomEmpty')}</p>` : nothing}
          <div class="actions">${this.action(this.t('controls'), 'details', () => this.openRoom(), this.busy || !this.host || (!members.length && !this.config?.cards?.length), 'details')}</div>${this.config?.links?.length ? this.navigation() : nothing}`;
      }
    }
  }
  protected render() {
    if (!this.config) return nothing;
    const config = this.config;
    let entity = this.entity();
    const host = this.host;
    const ids = this.memberIds(host);
    const room = this.kind === 'room' && host ? planRoom(config,createRoomCatalog(host,{includeCandidates:false})) : undefined;
    const members = room ? room.members.map(member=>member.model) : MULTI_KINDS.includes(this.kind) ? ids.map((id) => this.entity(id, kindForEntity(id), false)) : [];
    if (this.kind === 'media-stack') entity = members.find(e=>e.externalId === this.selectedPlayer) ?? members[0] ?? entity;
    const templateName=this.templateValue('name'),templateState=this.templateValue('state'),templatePicture=this.templateValue('picture'),templateColor=this.templateValue('color'),templateIcon=this.templateValue('icon');
    if(this.templateValue('visible')===false)return nothing;
    entity={...entity,...(typeof templateName==='string'?{name:templateName}:{}),...(typeof templateState==='string'?{value:templateState,subtitle:templateState}:{}),...(typeof templatePicture==='string'?{artwork:templatePicture}:{})};
    const iconName=typeof templateIcon==='string'?templateIcon:config.icon;
    const active =
      (this.kind === 'room' || MULTI_KINDS.includes(this.kind))
        ? members.some((e) => e.active && e.available)
        : entity.active && entity.available;
    const name =
      (typeof templateName==='string'?templateName:config.name) ??
      (this.kind === 'media-stack' ? entity.name : this.kind === 'room' ? (host?.areas?.[config.area ?? '']?.name ?? this.t('room')) : this.kind === 'navigation' || MULTI_KINDS.includes(this.kind) || CONTENT_KINDS.includes(this.kind) && !config.entity ? this.t(this.kind) : entity.name);
    const value = typeof templateState==='string'?templateState:!host
      ? this.t('loading')
      : !entity.available
        ? this.t(entity.state)
        : ['sensor','entity'].includes(this.kind)
          ? entity.value
          : this.t(entity.state);
    const appearance = config.appearance;
    const theme =
      appearance?.theme && appearance.theme !== 'auto'
        ? appearance.theme
        : host?.themes?.darkMode === false
          ? 'light'
          : 'dark';
    const accent =
      (typeof templateColor==='string'?templateColor:appearance?.accent) ?? (appearance?.preset === 'neutral' ? '#94a3b8' : appearance?.preset === 'cool' ? '#38bdf8' : undefined) ??
      (this.kind === 'info' ? '#14b8a6' : this.kind === 'fan' ? '#3b82f6' : this.kind === 'lock' ? (entity.state === 'locked' ? '#22c55e' : '#ef4444') : this.kind === 'sensor'
        ? '#fda4af'
        : this.kind === 'climate' && (entity.state === 'cool' || entity.climateAction === 'cooling')
          ? '#38bdf8'
          : '#f97316');
    const styles = {
      '--navet-card-accent': typeof templateColor==='string'?templateColor:appearance?.accent,
      '--family-accent': accent,
      '--navet-card-radius':
        appearance?.radius !== undefined ? `${appearance.radius}px` : undefined,
    };
    const glyph =
      this.kind === 'climate' && (entity.state === 'cool' || entity.climateAction === 'cooling')
        ? 'cool'
        : this.kind === 'info' && members[0] ? readingGlyph(members[0]) : this.kind === 'script' ? 'play' : this.kind === 'button' ? 'film' : this.kind;
    const toggles = entity.capabilities.includes('toggle');
    const customIcon = !!(config.icon_tap_action || config.icon_hold_action || config.icon_double_tap_action);
    const iconActions = { tap: config.icon_tap_action, hold: config.icon_hold_action, double: config.icon_double_tap_action };
    const eyebrow = this.kind === 'ups' && members[0]?.areaName ? members[0].areaName : ['info','battery','ups','energy-now'].includes(this.kind) ? this.t('widget') : this.kind === 'lock' ? value : this.kind === 'sensor' && ['°C','°F'].includes(entity.unit) ? this.t('temperatureReading') : this.t(this.kind);
    return html`<div class="card" style=${styleMap(styles)} data-kind=${this.kind} data-size=${this.compactFamily ? config.size ?? 'small' : 'medium'} data-theme=${theme} data-layout=${config.layout ?? 'compact'} data-effects=${appearance?.effects ?? 'low'} data-condition=${this.kind === 'weather' ? entity.state : ''} ?data-active=${active && !['info','battery','ups','energy-now','media-stack','person','note','entity','photo'].includes(this.kind)} aria-busy=${this.busy}>
      ${this.kind !== 'person' && this.kind !== 'chips' && this.kind !== 'calendar' ? html`<div class="header">
        ${this.kind === 'script' && !customIcon ? this.action(this.t('runAction'),'play',()=>this.command({type:'activate'},entity),this.disabled || !entity.available,'script-trigger') : toggles || customIcon ? html`<button class="icon" aria-label=${customIcon ? `${name} icon` : this.t(entity.active ? 'off' : 'on')} title=${this.t(entity.active ? 'off' : 'on')} aria-pressed=${entity.active} ?disabled=${this.disabled || (!customIcon && !entity.available)}
          @click=${(event:MouseEvent)=>this.iconGesture.click(event.detail,iconActions)}
          @pointerdown=${(event:PointerEvent)=>this.iconGesture.down(event,iconActions)} @pointermove=${(event:PointerEvent)=>this.iconGesture.move(event)}
          @pointerup=${()=>this.iconGesture.up()} @pointerleave=${()=>this.iconGesture.up()} @pointercancel=${()=>this.iconGesture.cancelPointer()}
          @contextmenu=${(event:Event)=>{if(config.icon_hold_action)event.preventDefault();}}>${iconName ? html`<ha-icon .icon=${iconName}></ha-icon>` : icon(glyph)}</button>` : html`<span class="icon" aria-hidden="true">${iconName ? html`<ha-icon .icon=${iconName}></ha-icon>` : icon(glyph)}</span>`}
        ${!config.entity && this.kind !== 'room' && !config.tap_action && !this.momentary ? html`<span class="primary"><span class="labels"><span class="eyebrow">${eyebrow}</span><span class="name">${name}</span></span></span>` : html`<button class="primary" ?disabled=${this.disabled} aria-label=${name} ?data-momentary=${this.momentary} aria-pressed=${this.momentary?!!this.pressSession:nothing} @keydown=${(event:KeyboardEvent)=>{if(this.momentary)this.press.keyDown(event);}} @keyup=${(event:KeyboardEvent)=>{if(this.momentary)this.press.keyUp(event);}}
          @click=${this.primaryClick} @pointerdown=${this.pointerDown} @pointermove=${this.pointerMove} @pointerup=${this.cancelHold} @pointerleave=${this.cancelHold} @pointercancel=${() => {
            this.press.cancel();this.primaryGesture.cancelPointer();
          }} @contextmenu=${(e: Event) => {
            if (config.hold_action) e.preventDefault();
          }}>
          <span class="labels"><span class="eyebrow">${eyebrow}</span><span class="name">${name}</span></span>
        </button>`}
        ${(this.kind === 'switch' && config.size !== 'extra-small') || this.kind === 'sensor' ? this.action(this.t('details'), 'details', () => this.moreInfo(), this.disabled, this.kind === 'sensor' ? 'sensor-details' : 'switch-details') : nothing}
      </div>` : nothing}
      ${this.kind !== 'sub-controls' && config.sub_controls?.length && config.sub_controls_position === 'top' ? this.subControls() : nothing}${this.familyContent(entity, value, members, room)}${this.dataSnapshot && this.dataSnapshot.status !== 'ready' ? html`<p class="notice data-status" role="status">${this.t(`data_${this.dataSnapshot.status}`)}${this.dataSnapshot.stale ? ` · ${this.t('data_stale')}` : ''}</p>` : nothing}${this.kind !== 'sub-controls' && config.sub_controls?.length && config.sub_controls_position !== 'top' ? this.subControls() : nothing}
      ${[...this.templateSnapshots].filter(([,snapshot])=>!['ready','loading'].includes(snapshot.status)).map(([field,snapshot])=>html`<p class="template-error" role="status" data-template-field=${field}>${field} template · ${snapshot.status}: ${snapshot.error??''}<button class="template-retry" @click=${()=>this.templateObservers.get(field)?.retry()}>Retry template</button></p>`)}
      ${config.protection?.enabled ? html`<button class="protection-control" ?disabled=${this.isPreview} @click=${()=>{if(!this.isPreview){if(this.protection.locked)this.protection.unlock();else this.protection.lock();}}}>${this.protection.locked?'Unlock controls':'Lock controls'}</button>` : nothing}
      ${this.sequenceRunning ? html`<button class="action sequence-cancel" aria-label="Cancel action" ?disabled=${this.actionAbort?.signal.aborted} @click=${()=>{this.actionAbort?.abort();this.requestUpdate();}}>Cancel action</button>` : nothing}
      ${this.kind !== 'room' ? this.childCards() : nothing}
      ${this.advancedOpen ? html`<dialog class="advanced-dialog" aria-label=${this.t(({range:'temperatureRange',tilt:'tilt',fan:'fanOptions','climate-options':'climateOptions','vacuum-options':'vacuumOptions','media-options':'mediaOptions',comfort:'comfortOptions',remote:'remoteOptions',update:'updateOptions'})[this.advancedOpen.type])} @cancel=${()=>this.closeAdvanced()} @close=${(event:Event)=>{if(this.advancedOpen && !(event.currentTarget as HTMLDialogElement).open)this.closeAdvanced();}}><div class="dialog-header"><h2>${name}</h2><button class="action" aria-label=${this.t('close')} @click=${()=>this.closeAdvanced()}>×</button></div><div class="advanced-content">${['range','climate-options','vacuum-options','media-options'].includes(this.advancedOpen.type) ? this.inlineControls(this.entity(this.advancedOpen.entity,kindForEntity(this.advancedOpen.entity))) : this.advancedControl(this.advancedOpen.type,this.entity(this.advancedOpen.entity,kindForEntity(this.advancedOpen.entity)))}${this.error ? html`<p role="alert">${this.error}</p>` : nothing}</div></dialog>` : nothing}
      ${this.kind === 'photo' && (config.tap_action || config.hold_action || config.double_tap_action) ? html`<button class="photo-primary" aria-label=${name} ?disabled=${this.disabled} @click=${this.primaryClick} @pointerdown=${this.pointerDown} @pointermove=${this.pointerMove} @pointerup=${this.cancelHold} @pointerleave=${this.cancelHold} @pointercancel=${()=>{this.primaryGesture.cancelPointer();}} @contextmenu=${(event:Event)=>{if(config.hold_action)event.preventDefault();}}></button>` : nothing}
      ${
        this.error && !this.advancedOpen
          ? html`<div class="error-row"><p class="notice error" role="alert">${this.error}</p><button class="dismiss" aria-label=${this.t('close')} @click=${() => {
              this.error = '';
              this.requestUpdate();
            }}>×</button></div>`
          : nothing
      }
      ${this.kind === 'note' && entity.capabilities.includes('text') && !entity.secret ? html`<dialog class="note-dialog" aria-labelledby="note-title" @close=${()=>this.noteOpener?.focus()} @cancel=${()=>this.closeNote()}><form @submit=${async (event:Event)=>{event.preventDefault();const input=(event.currentTarget as HTMLFormElement).querySelector('textarea')!;await this.command({type:'text',value:input.value},entity);if(!this.error)this.closeNote();}}><div class="dialog-header"><h2 id="note-title">${name}</h2><button type="button" class="action" aria-label=${this.t('close')} @click=${()=>this.closeNote()}>×</button></div><textarea aria-label=${this.t('note')} .value=${live(this.noteDraft)} @input=${(event:Event)=>{this.noteDraft=(event.target as HTMLTextAreaElement).value;}} minlength=${entity.textMin ?? 0} maxlength=${entity.textMax ?? 255} ?disabled=${this.disabled || !entity.available}></textarea><div class="dialog-footer"><button class="action" aria-label=${this.t('save')} ?disabled=${this.disabled || !entity.available}>${icon('check')}</button></div>${this.error ? html`<p class="notice error" role="alert">${this.error}</p>` : nothing}</form></dialog>` : nothing}
      ${
        this.kind === 'room'
          ? html`<dialog class="room-dialog" data-size=${config.popup?.size ?? 'default'} aria-labelledby="room-title"
          @pointerdown=${(event: PointerEvent)=>{ this.backdropDown = event.target === event.currentTarget; if (this.backdropDown || (event.target as HTMLElement).closest('.dialog-header') && !(event.target as HTMLElement).closest('button,input,select,a,textarea')) this.swipeStart = {x:event.clientX,y:event.clientY,pointer:event.pointerId}; }}
          @pointerup=${(event: PointerEvent)=>{const start=this.swipeStart;this.swipeStart=undefined;if(start?.pointer===event.pointerId)this.popup.swipe(start.x,start.y,event.clientX,event.clientY);}}
          @pointercancel=${()=>{this.swipeStart=undefined;this.backdropDown=false;}} @close=${(e: Event)=> { if (this.roomOpen && !(e.currentTarget as HTMLDialogElement).open) this.closeRoom(); }} @cancel=${()=>this.closeRoom()} @click=${(e: Event) => {
              if (e.target === e.currentTarget && this.backdropDown) this.closeRoom();
              this.backdropDown = false;
            }}>
        <div class="dialog-header"><h2 id="room-title">${name}</h2><button class="action" aria-label=${this.t('close')} @click=${this.closeRoom}>×</button></div>
        <div class="room-list">${this.roomOpen && room ? repeat(room.sections,section=>section.id,section=>html`<section class="room-section">${section.name ? html`<h3>${section.name}</h3>` : nothing}${repeat(section.members,member=>member.id,
          (member) =>
            html`<div class="room-control" data-member-id=${member.id}><button class="room-row" ?disabled=${this.isPreview} @click=${async () => {
              const operation = this.operation;
              await this.closeRoom();
              if (!this.disposed && !this.isPreview && operation === this.operation) this.moreInfo(member.entity);
            }}><span>${member.icon ? html`<ha-icon .icon=${member.icon}></ha-icon>` : nothing}${member.model.name}</span><span>${this.t(member.model.available ? member.model.value : member.model.state)}${member.model.unit && member.model.available ? ` ${member.model.unit}` : ''}</span></button>${this.inlineControls(member.model,member.control)}</div>`,
        )}</section>`) : nothing}</div>
        ${this.childCards(this.roomOpen)}
        <div class="dialog-footer"><button class="action accent" @click=${this.closeRoom}>${this.t('close')}</button></div>
      </dialog>`
          : nothing
      }
    </div>`;
  }
}
