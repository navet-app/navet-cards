import type { ActionConfig } from '../config';

export interface GestureActions { tap?: ActionConfig; hold?: ActionConfig; double?: ActionConfig }

/** One instance per interactive surface, so icon and card gestures never share timers. */
export class CardGesture {
  private holdTimer?: ReturnType<typeof setTimeout>;
  private tapTimer?: ReturnType<typeof setTimeout>;
  private held = false;
  private origin?: { x: number; y: number };
  constructor(private readonly dispatch: (action?: ActionConfig) => void, private readonly enabled: () => boolean) {}

  click(detail: number, actions: GestureActions) {
    if (this.held) { this.held = false; return; }
    if (!this.enabled()) return;
    if (detail === 0 || !actions.double) { this.dispatch(actions.tap); return; }
    if (this.tapTimer) {
      clearTimeout(this.tapTimer); this.tapTimer = undefined;
      this.dispatch(actions.double);
    } else {
      const action = actions.tap;
      this.tapTimer = setTimeout(() => { this.tapTimer = undefined; if (this.enabled()) this.dispatch(action); }, 280);
    }
  }
  down(event: Pick<PointerEvent, 'button' | 'clientX' | 'clientY'>, actions: GestureActions) {
    this.up(); this.held = false;
    if (event.button !== 0 || !actions.hold || !this.enabled()) return;
    this.origin = { x: event.clientX, y: event.clientY };
    const action = actions.hold;
    this.holdTimer = setTimeout(() => {
      this.holdTimer = undefined;
      if (!this.enabled()) return;
      this.held = true;
      if (this.tapTimer) clearTimeout(this.tapTimer);
      this.tapTimer = undefined;
      this.dispatch(action);
    }, 500);
  }
  move(event: Pick<PointerEvent, 'clientX' | 'clientY'>) {
    if (this.origin && Math.hypot(event.clientX - this.origin.x, event.clientY - this.origin.y) > 10) this.cancelPointer();
  }
  up() {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = undefined; this.origin = undefined;
  }
  cancelPointer() { this.up(); this.held = true; }
  cancel() {
    this.up();
    if (this.tapTimer) clearTimeout(this.tapTimer);
    this.tapTimer = undefined; this.held = false;
  }
}
