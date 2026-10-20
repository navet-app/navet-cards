import type { ActionConfig } from '../config';
import { assertActionSequenceBounds, awaitAction, actionWasAborted } from './sequences';

/** Intents stay provider-neutral; the host adapter owns service translation/errors. */
export type ActionIntent =
  | { type: 'toggle' | 'more-info'; entity?: string }
  | { type: 'navigate'; path: string; replace?: boolean }
  | { type: 'url'; url: string }
  | { type: 'back' }
  | { type: 'assist'; pipeline_id: string; start_listening: boolean }
  | { type: 'fire-dom-event'; config: ActionConfig }
  | { type: 'perform-action'; name: string; data: Record<string, unknown>; target: Record<string, unknown> };

export interface ActionContext {
  signal?: AbortSignal;
  active: () => boolean;
  confirm: (message: string) => boolean | Promise<boolean>;
  dispatch: (intent: ActionIntent) => void | Promise<unknown>;
}

/** Confirmation may outlive a card/configuration. Recheck before every side effect. */
export async function runConfiguredAction(action: ActionConfig, entity: string | undefined, context: ActionContext): Promise<void> {
  const active = () => !context.signal?.aborted && context.active();
  if (!active() || action.action === 'none') return;
  assertActionSequenceBounds(action);
  // Snapshot HA-owned configuration before yielding to a host confirmation UI.
  const config = structuredClone(action);
  const run = async (config: ActionConfig): Promise<boolean> => {
    if (!active()) return false;
    if (config.action === 'none') return true;
    if (config.confirmation) {
      const message = typeof config.confirmation === 'object' ? config.confirmation.text ?? 'Run this action?' : 'Run this action?';
      const accepted = await awaitAction(context.confirm(message), context.signal);
      if (accepted !== true || !active()) return false;
    }
    if (config.action === 'sequence') {
      for (const step of config.sequence!) {
        try { if (!await run(step)) return false; }
        catch (error) { if (!active()) return false; if (!config.continue_on_error) throw error; }
      }
      return true;
    }
    if (!active()) return false;
    let intent: ActionIntent;
    switch (config.action) {
    case 'toggle':
    case 'more-info':
      intent = { type: config.action, entity }; break;
    case 'navigate':
      intent = { type: 'navigate', path: config.navigation_path!, ...(config.navigation_replace !== undefined ? { replace: config.navigation_replace } : {}) }; break;
    case 'url':
      intent = { type: 'url', url: config.url_path! }; break;
    case 'back':
      intent = { type: 'back' }; break;
    case 'assist':
      intent = { type: 'assist', pipeline_id: config.pipeline_id ?? 'last_used', start_listening: config.start_listening ?? false }; break;
    case 'fire-dom-event':
      intent = { type: 'fire-dom-event', config: structuredClone(config) }; break;
    case 'perform-action':
      intent = { type: 'perform-action', name: config.perform_action!, data: config.data ?? {}, target: config.target ?? (entity ? { entity_id: entity } : {}) }; break;
    default: throw new Error('This action is not supported.');
    }
    return !actionWasAborted(await awaitAction(context.dispatch(intent), context.signal)) && active();
  };
  await run(config);
}
