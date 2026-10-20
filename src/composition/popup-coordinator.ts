/** Per-card popup lifecycle. The environment seam keeps navigation independent of Lit/HA. */
export interface PopupOptions {
  id?: string;
  scope?: string;
  timeout?: number;
  swipe?: boolean;
  trigger?: boolean;
  preview?: boolean;
}
export type PopupReason = 'manual' | 'navigation' | 'trigger' | 'dismiss' | 'timeout' | 'swipe' | 'disconnect';
export interface PopupEnvironment {
  events: EventTarget;
  visibility: EventTarget;
  hash(): string;
  url(): string;
  state(): unknown;
  push(state: unknown, url: string): void;
  replace(state: unknown, url: string): void;
  back(): void;
  schedule(callback: () => void, milliseconds: number): unknown;
  cancel(timer: unknown): void;
}
const browserEnvironment = (): PopupEnvironment => ({
  events: window, visibility: document,
  hash: () => location.hash, url: () => location.pathname + location.search + location.hash,
  state: () => history.state,
  push: (state, url) => history.pushState(state, '', url),
  replace: (state, url) => history.replaceState(state, '', url),
  back: () => history.back(),
  schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
});
const peers = new WeakMap<EventTarget, Set<PopupCoordinator>>();
let sequence = 0;
const marker = '__navetPopup';

export class PopupCoordinator {
  private readonly environment: PopupEnvironment;
  private readonly token = ++sequence;
  private options: PopupOptions = {};
  private attached = false;
  private opened = false;
  private timer?: unknown;
  private triggerConsumed = false;
  private dismissedHash?: string;
  private pendingNavigation?: { promise: Promise<void>; finish: () => void };
  constructor(private readonly onChange: (open: boolean, reason: PopupReason) => void, environment?: PopupEnvironment) {
    this.environment = environment ?? browserEnvironment();
  }
  get active() { return this.opened; }
  get hash() {
    return this.options.id ? this.options.scope ? `#${this.options.scope}--${this.options.id.replace(/^#/, '')}` : this.options.id : undefined;
  }
  configure(options: PopupOptions) {
    const previousHash = this.hash;
    const previousTimeout = this.options.timeout;
    const previousPreview = this.options.preview;
    this.options = { ...options };
    if (!options.trigger) this.triggerConsumed = false;
    if (previousHash !== this.hash) {
      this.dismissedHash = undefined;
      this.triggerConsumed = false;
    }
    if (options.preview) { if (!previousPreview) this.setOpen(false, 'navigation'); }
    else if (this.attached) {
      this.reconcile();
      if (previousHash !== this.hash) this.triggerConsumed = false;
      this.consumeTrigger();
    }
    if ((previousTimeout !== options.timeout || previousPreview !== options.preview) && this.opened) this.resetTimer();
  }
  connect() {
    if (this.attached) return;
    this.attached = true;
    const group = peers.get(this.environment.events) ?? new Set<PopupCoordinator>();
    group.add(this); peers.set(this.environment.events, group);
    for (const event of ['hashchange', 'popstate', 'location-changed', 'pageshow']) this.environment.events.addEventListener(event, this.reconcile);
    this.environment.visibility.addEventListener('visibilitychange', this.reconcile);
    this.reconcile();
    this.consumeTrigger();
  }
  disconnect() {
    if (!this.attached) return;
    this.attached = false;
    for (const event of ['hashchange', 'popstate', 'location-changed', 'pageshow']) this.environment.events.removeEventListener(event, this.reconcile);
    this.environment.visibility.removeEventListener('visibilitychange', this.reconcile);
    this.pendingNavigation?.finish();
    peers.get(this.environment.events)?.delete(this);
    this.setOpen(false, 'disconnect');
    // Reconnecting to the same active hash is supported, but a stale trigger stays consumed.
  }
  open(reason: PopupReason = 'manual') {
    if (!this.attached) return;
    if (this.options.preview) {
      if (reason === 'manual') this.setOpen(true, reason);
      return;
    }
    if (this.hash && !this.ownsHash()) return;
    this.dismissedHash = undefined;
    if (this.hash && this.environment.hash() !== this.hash) {
      const state = this.environment.state();
      this.environment.push({ ...(state && typeof state === 'object' ? state : {}), [marker]: this.token }, this.hash);
    }
    for (const peer of peers.get(this.environment.events) ?? []) if (peer !== this && peer.opened) peer.setOpen(false, 'navigation');
    this.setOpen(true, reason);
    this.environment.events.dispatchEvent(new Event('location-changed'));
  }
  close(reason: PopupReason = 'dismiss'): Promise<void> {
    if (!this.opened) return this.pendingNavigation?.promise ?? Promise.resolve();
    if (this.options.trigger) this.triggerConsumed = true;
    this.dismissedHash = this.hash;
    this.setOpen(false, reason);
    if (!this.options.preview && this.hash && this.environment.hash() === this.hash) {
      const state = this.environment.state();
      if (state && typeof state === 'object' && (state as Record<string, unknown>)[marker] === this.token) {
        const completion = this.waitForNavigation();
        this.environment.back();
        this.environment.events.dispatchEvent(new Event('location-changed'));
        return completion;
      }
      this.environment.replace(state, this.environment.url().split('#')[0]);
      this.environment.events.dispatchEvent(new Event('location-changed'));
    }
    return Promise.resolve();
  }
  /** A deliberate downward gesture; vertical scroll/taps and horizontal motion are ignored. */
  swipe(startX: number, startY: number, endX: number, endY: number) {
    if (this.options.swipe !== true || !this.opened) return false;
    const distance = endY - startY;
    if (![startX, startY, endX, endY].every(Number.isFinite) || distance < 80 || distance < Math.abs(endX - startX) * 1.5) return false;
    this.close('swipe');
    return true;
  }
  private ownsHash() {
    return ![...(peers.get(this.environment.events) ?? [])].some(peer => peer !== this && !peer.options.preview && peer.hash === this.hash && peer.token < this.token);
  }
  private reconcile = () => {
    if (!this.attached || this.options.preview) return;
    const current = this.environment.hash();
    if (this.dismissedHash !== current) this.dismissedHash = undefined;
    if (!this.hash) return;
    const matches = current === this.hash && this.dismissedHash !== current && this.ownsHash();
    if (matches) {
      for (const peer of peers.get(this.environment.events) ?? []) if (peer !== this && peer.opened) peer.setOpen(false, 'navigation');
    }
    this.setOpen(matches, 'navigation');
  };
  private consumeTrigger() {
    if (!this.options.trigger || this.triggerConsumed || this.options.preview || !this.attached) return;
    this.triggerConsumed = true;
    this.open('trigger');
  }
  private setOpen(open: boolean, reason: PopupReason) {
    if (this.opened === open) return;
    this.opened = open;
    if (!open && this.options.trigger) this.triggerConsumed = true;
    this.resetTimer();
    this.onChange(open, reason);
  }
  private resetTimer() {
    if (this.timer !== undefined) this.environment.cancel(this.timer);
    this.timer = undefined;
    const timeout = this.options.timeout;
    if (this.opened && !this.options.preview && typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0) this.timer = this.environment.schedule(() => this.close('timeout'), timeout * 1000);
  }
  private waitForNavigation(): Promise<void> {
    this.pendingNavigation?.finish();
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    let timer: unknown;
    const finish = () => {
      this.environment.events.removeEventListener('popstate', navigated);
      this.environment.cancel(timer);
      if (this.pendingNavigation?.promise === promise) this.pendingNavigation = undefined;
      resolve();
    };
    const navigated = () => { if (this.environment.hash() !== this.hash) finish(); };
    this.pendingNavigation = { promise, finish };
    this.environment.events.addEventListener('popstate', navigated);
    // Hosts may suppress traversal; never leave an interaction waiting indefinitely.
    timer = this.environment.schedule(finish, 1000);
    return promise;
  }
}
