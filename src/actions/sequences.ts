/** Bounds cover the entire action tree, including nested sequences, before side effects. */
export function assertActionSequenceBounds(value: unknown, depth = 0, budget = { nodes: 0 }): void {
  if (++budget.nodes > 256 || depth > 8) throw new Error('Action sequences support at most 256 actions and eight nested levels.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each sequence step must be an action object.');
  const action = value as Record<string, unknown>;
  if (action.action !== 'sequence') return;
  if (!Array.isArray(action.sequence) || !action.sequence.length || action.sequence.length > 24) throw new Error('An action sequence needs 1–24 steps.');
  if (action.continue_on_error !== undefined && typeof action.continue_on_error !== 'boolean') throw new Error('continue_on_error must be true or false.');
  action.sequence.forEach(step => assertActionSequenceBounds(step, depth + 1, budget));
}

const aborted = Symbol('aborted');
/** Stop waiting promptly on disconnect, while still consuming an in-flight rejection. */
export async function awaitAction<T>(pending: T | PromiseLike<T>, signal?: AbortSignal): Promise<T | typeof aborted> {
  if (!signal) return await pending;
  if (signal.aborted) { void Promise.resolve(pending).catch(() => undefined); return aborted; }
  return await new Promise<T | typeof aborted>((resolve, reject) => {
    const cancel = () => { signal.removeEventListener('abort', cancel); resolve(aborted); };
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(pending).then(value => { signal.removeEventListener('abort', cancel); resolve(value); }, error => { signal.removeEventListener('abort', cancel); reject(error); });
  });
}
export const actionWasAborted = (value: unknown): boolean => value === aborted;
