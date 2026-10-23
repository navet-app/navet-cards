/** Press effects are serialized. A dispatched press always gets one cleanup release,
 * even when preview/configuration/lifecycle changes prohibit further presses. */
export type PressPhase = 'press' | 'repeat' | 'release';
export interface PressOptions {
  enabled: () => boolean;
  dispatch: (phase: PressPhase) => unknown | Promise<unknown>;
  interval?: () => number | undefined;
  repeat?: () => boolean;
  onError?: (error: unknown) => void;
}
export class PressController {
  private session?: { pointer?: number; key?: string; x: number; y: number; cancelled: boolean; pending: Promise<void>; releasing: boolean };
  private timer?: ReturnType<typeof setTimeout>;
  private dispose?: () => void;
  constructor(private readonly options: PressOptions) {}
  get active() { return !!this.session; }
  pointerDown(event: Pick<PointerEvent, 'button' | 'pointerId' | 'clientX' | 'clientY'>): boolean {
    if (event.button !== 0) return false;
    return this.start({ pointer: event.pointerId, x: event.clientX, y: event.clientY });
  }
  pointerMove(event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>) {
    const current = this.session;
    if (current?.pointer === event.pointerId && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 10) this.cancel();
  }
  pointerUp(event: Pick<PointerEvent, 'pointerId'>) { if (this.session?.pointer === event.pointerId) this.cancel(); }
  pointerCancel(event: Pick<PointerEvent, 'pointerId'>) { this.pointerUp(event); }
  keyDown(event: Pick<KeyboardEvent, 'key' | 'repeat' | 'preventDefault'>): boolean {
    if (![' ', 'Enter'].includes(event.key)) return false;
    event.preventDefault();
    if (event.repeat) return true;
    return this.start({ key: event.key, x: 0, y: 0 });
  }
  keyUp(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>) {
    if (this.session?.key !== event.key) return;
    event.preventDefault(); this.cancel();
  }
  private start(origin: { pointer?: number; key?: string; x: number; y: number }): boolean {
    if (this.session || !this.options.enabled()) return false;
    const current = { ...origin, cancelled: false, releasing: false, pending: Promise.resolve() };
    this.session = current;
    // Invoke synchronously so a quick pointer-up cannot silently discard an initiated press.
    current.pending = this.invoke('press');
    void current.pending.then(() => this.schedule(current));
    return true;
  }
  private async invoke(phase: PressPhase) {
    try { await this.options.dispatch(phase); }
    catch (error) { this.options.onError?.(error); if (phase !== 'release') this.cancel(); }
  }
  private schedule(current: NonNullable<PressController['session']>) {
    if (this.session !== current || current.cancelled) return;
    if (!this.options.enabled()) { this.cancel(); return; }
    if (!this.options.repeat?.()) return;
    const supplied = this.options.interval?.();
    const interval = typeof supplied === 'number' && Number.isFinite(supplied) ? Math.max(100, supplied) : 500;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.session !== current || current.cancelled) return;
      if (!this.options.enabled()) { this.cancel(); return; }
      current.pending = this.invoke('repeat');
      void current.pending.then(() => this.schedule(current));
    }, interval);
  }
  /** Idempotent. Release waits for an in-flight repeat, never overlaps it. */
  cancel() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const current = this.session;
    if (!current || current.releasing) return;
    current.cancelled = true; current.releasing = true;
    void current.pending.then(async () => {
      await this.invoke('release');
      if (this.session === current) this.session = undefined;
    });
  }
  attach(target: Window, owner: Document) {
    this.detach();
    const cancel = () => this.cancel();
    const visibility = () => { if (owner.hidden) this.cancel(); };
    const up = (event: PointerEvent) => this.pointerUp(event);
    const move = (event: PointerEvent) => this.pointerMove(event);
    const key = (event: KeyboardEvent) => this.keyUp(event);
    target.addEventListener('blur', cancel);
    target.addEventListener('scroll', cancel, true);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('lostpointercapture', up);
    target.addEventListener('pointermove', move);
    target.addEventListener('keyup', key);
    owner.addEventListener('visibilitychange', visibility);
    this.dispose = () => {
      target.removeEventListener('blur', cancel);
      target.removeEventListener('scroll', cancel, true);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      target.removeEventListener('lostpointercapture', up);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('keyup', key);
      owner.removeEventListener('visibilitychange', visibility);
    };
  }
  detach() { this.dispose?.(); this.dispose = undefined; this.cancel(); }
}
