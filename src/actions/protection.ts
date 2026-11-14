/** A per-card accidental-action guard, never an authorization or security boundary. */
export interface ProtectionConfig { enabled?: boolean; unlock_duration?: number; [key: string]: unknown }
export class ProtectionGate {
  private configuration?: ProtectionConfig;
  private until = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly changed: () => void = () => {}, private readonly now = () => Date.now()) {}
  configure(value?: ProtectionConfig) {
    if (this.configuration === value) return;
    this.configuration = value; this.lock();
  }
  get locked() { return this.configuration?.enabled === true && this.now() >= this.until; }
  allows() { return !this.locked; }
  unlock() {
    if (this.configuration?.enabled !== true) return;
    this.clear();
    const requested = this.configuration.unlock_duration;
    const duration = typeof requested === 'number' && Number.isFinite(requested) && requested > 0 ? requested : 5;
    this.until = this.now() + duration * 1000;
    this.timer = setTimeout(() => this.lock(), duration * 1000);
    this.changed();
  }
  lock() { this.clear(); this.until = 0; this.changed(); }
  dispose() { this.clear(); this.until = 0; }
  private clear() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
}
