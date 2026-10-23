export type DataStatus = 'loading' | 'ready' | 'empty' | 'unsupported' | 'denied' | 'offline' | 'error';
export interface DataSnapshot<T> {
  readonly status: DataStatus;
  readonly data: readonly T[];
  readonly stale: boolean;
  readonly updatedAt?: number;
  readonly error?: string;
}
export interface ObserveOptions {
  visible?: boolean;
  freshnessMs?: number;
  refreshMs?: number;
}
export interface DataObservation<T> {
  readonly snapshot: DataSnapshot<T>;
  setVisible(visible: boolean): void;
  refresh(options?: { invalidate?: boolean }): void;
  release(): void;
}
export interface DataClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(timer: unknown): void;
}
const systemClock: DataClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: timer => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
};
type Subscriber<T> = { listener: (snapshot: DataSnapshot<T>) => void; visible: boolean; freshnessMs: number; refreshMs: number };
type Entry<T> = {
  snapshot: DataSnapshot<T>;
  settled?: DataSnapshot<T>;
  subscribers: Set<Subscriber<T>>;
  loader: () => Promise<readonly T[] | null>;
  generation: number;
  inFlight: boolean;
  timer?: unknown;
  failures: number;
};
function errorStatus(error: unknown): DataStatus {
  const value = error as { code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown } | null;
  const code = String(value?.code ?? value?.status ?? value?.statusCode ?? '');
  if (['401', '403', 'unauthorized', 'forbidden', 'not_allowed', 'permission_denied'].includes(code)) return 'denied';
  if (['connection_lost', 'not_connected', 'offline'].includes(code)) return 'offline';
  return 'error';
}

/** Host/query scoped work. Inactive entries retain bounded snapshots without timers. */
export class DataCoordinator {
  private scopes = new WeakMap<object, Map<string, Entry<unknown>>>();
  constructor(private clock: DataClock = systemClock, private maxIdleEntries = 64) {}

  observe<T>(scope: object, key: string, loader: () => Promise<readonly T[] | null>, listener: (snapshot: DataSnapshot<T>) => void, options: ObserveOptions = {}): DataObservation<T> {
    let entries = this.scopes.get(scope);
    if (!entries) this.scopes.set(scope, entries = new Map());
    let entry = entries.get(key) as Entry<T> | undefined;
    if (!entry) {
      entry = { snapshot: Object.freeze({ status: 'loading', data: Object.freeze([]), stale: false }), subscribers: new Set(), loader, generation: 0, inFlight: false, failures: 0 };
      entries.set(key, entry as Entry<unknown>);
    }
    entry.loader = loader;
    const duration = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! >= 0 ? Math.min(value!, 86400000) : fallback;
    const subscriber: Subscriber<T> = { listener, visible: options.visible !== false, freshnessMs: duration(options.freshnessMs, 300000), refreshMs: duration(options.refreshMs, 300000) };
    entry.subscribers.add(subscriber);
    let released = false;
    const current = entry;
    const notify = () => {
      for (const sub of current.subscribers) if (sub.visible) {
        try { sub.listener(current.snapshot); } catch { /* One detached/broken view cannot prevent other observers. */ }
      }
    };
    const active = () => [...current.subscribers].filter(sub => sub.visible);
    const cancelTimer = () => {
      if (current.timer !== undefined) this.clock.clearTimeout(current.timer);
      current.timer = undefined;
    };
    const stop = () => {
      cancelTimer();
      current.generation++;
      current.inFlight = false;
      if (current.settled) current.snapshot = current.settled;
    };
    const schedule = () => {
      cancelTimer();
      const intervals = active().map(sub => sub.refreshMs).filter(ms => ms > 0);
      if (!intervals.length) return;
      const interval = Math.min(...intervals);
      const delay = current.failures ? Math.min(interval, 30000 * 2 ** Math.min(current.failures - 1, 4)) : interval;
      current.timer = this.clock.setTimeout(() => { current.timer = undefined; request(true); }, delay);
    };
    const stale = () => current.snapshot.updatedAt === undefined || active().some(sub => this.clock.now() - current.snapshot.updatedAt! >= sub.freshnessMs);
    const request = (force = false) => {
      if (!active().length || current.inFlight) return;
      if (!force && !stale()) { schedule(); return; }
      cancelTimer();
      const generation = ++current.generation;
      current.inFlight = true;
      current.snapshot = Object.freeze({ ...current.snapshot, status: 'loading', stale: current.snapshot.updatedAt !== undefined, error: undefined });
      notify();
      Promise.resolve().then(() => {
        // The observer can release synchronously in its loading listener.
        if (generation !== current.generation || !active().length) return undefined;
        return current.loader();
      }).then(data => {
        if (generation !== current.generation || !active().length || data === undefined) return;
        current.inFlight = false;
        current.failures = 0;
        current.snapshot = Object.freeze({ status: data === null ? 'unsupported' : data.length ? 'ready' : 'empty', data: Object.freeze(data ? [...data] : []), stale: false, updatedAt: this.clock.now() });
        current.settled = current.snapshot;
        notify();
        schedule();
      }, error => {
        if (generation !== current.generation || !active().length) return;
        current.inFlight = false;
        current.failures++;
        current.snapshot = Object.freeze({ ...current.snapshot, status: errorStatus(error), stale: current.snapshot.updatedAt !== undefined, error: error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? 'Data request failed') });
        current.settled = current.snapshot;
        notify();
        schedule();
      });
    };
    if (subscriber.visible) {
      try { listener(current.snapshot); } catch { /* See notify. */ }
      request();
    }
    // Eviction never interrupts a used query and requires no background timer.
    const prune = () => {
      const idle = [...entries].filter(([, value]) => !value.subscribers.size);
      while (idle.length > this.maxIdleEntries) entries.delete(idle.shift()![0]);
    };
    prune();
    return {
      get snapshot() { return current.snapshot; },
      setVisible: visible => {
        if (released || subscriber.visible === visible) return;
        subscriber.visible = visible;
        if (!active().length) stop();
        else if (visible) { try { listener(current.snapshot); } catch { /* See notify. */ } request(); }
        else schedule();
      },
      refresh: ({ invalidate = false } = {}) => {
        if (released || !subscriber.visible) return;
        if (invalidate) stop();
        request(true);
      },
      release: () => {
        if (released) return;
        released = true;
        current.subscribers.delete(subscriber);
        if (!current.subscribers.size) current.loader = async () => null;
        if (!active().length) stop();
        else schedule();
        prune();
      },
    };
  }
}
