import type { CardKind } from '../core';
import { validateConfig, type CardConfig } from '../config';

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Clone a saved config before visual editing; never retain HA-owned references. */
export function createConfigDraft(config: CardConfig): CardConfig {
  return structuredClone(config);
}

function merge(original: unknown, patch: unknown): unknown {
  if (Array.isArray(patch)) {
    // Replacement order and removals come from the editor. Preserve advanced fields
    // on stable-ID rows which remain, including when rows have been reordered.
    return patch.map((item) => {
      const previous = object(item) && typeof item.id === 'string' && Array.isArray(original)
        ? original.find((row) => object(row) && row.id === item.id) : undefined;
      return merge(previous, item);
    });
  }
  if (!object(patch)) return structuredClone(patch);
  const result: Record<string, unknown> = object(original) ? structuredClone(original) : {};
  for (const [key, value] of Object.entries(patch)) {
    // An explicit undefined deletes an optional known field; omitted keys survive.
    if (value === undefined) delete result[key];
    else Object.defineProperty(result, key, { value: merge(result[key], value), enumerable: true, configurable: true, writable: true });
  }
  return result;
}

/** Save a partial visual draft while retaining unknown YAML fields at every edited object. */
export function serializeConfigDraft(original: CardConfig, patch: Record<string, unknown>, kind: CardKind): CardConfig {
  return validateConfig(merge(original, patch), kind);
}
