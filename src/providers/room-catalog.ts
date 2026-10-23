import type { RoomCatalog } from '../rooms/planner';
import { kindForEntity, mapEntity, roomEntityIds, type Hass } from './home-assistant';

const candidateIds = new WeakMap<object, readonly string[]>();
/** Cached registry enumeration; current entity models remain scoped to selected members. */
export function createRoomCatalog(hass: Hass, options: { includeCandidates?: boolean } = {}): RoomCatalog {
  const registry = hass.entities;
  const key = registry ?? hass.states;
  let ids = options.includeCandidates === false ? [] : candidateIds.get(key);
  if (!ids) {
    ids = Object.keys(registry ?? hass.states).filter((id) => {
      const entry = registry?.[id];
      return /^[a-z_]+\.[a-z0-9_]+$/.test(id) && !entry?.hidden_by && !entry?.disabled_by && !entry?.entity_category;
    }).sort();
    candidateIds.set(key, ids);
  }
  return {
    areas: Object.entries(hass.areas ?? {}).map(([id, area]) => ({ id, name: area.name })).sort((a, b) => a.name.localeCompare(b.name)),
    entityIds: [...ids], registryAvailable: !!registry,
    areaEntityIds: (area) => roomEntityIds(hass, area),
    entity: (id) => mapEntity(hass.states[id], kindForEntity(id), id, hass),
    kind: kindForEntity,
  };
}
