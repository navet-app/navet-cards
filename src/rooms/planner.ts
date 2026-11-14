import type { CardConfig } from '../config';
import type { CardEntity, CardKind } from '../core';
import type { RoomMember } from './types';

export interface RoomCatalog {
  areas: { id: string; name: string }[];
  entityIds: string[];
  registryAvailable: boolean;
  areaEntityIds(area: string): string[];
  entity(id: string): CardEntity;
  kind(id: string): CardKind;
}
export interface RoomDiagnostic { code: string; message: string; entity?: string; path?: string; }
export interface RoomPlannedMember {
  id: string;
  entity: string;
  model: CardEntity;
  kind: CardKind;
  role: string;
  recipe: string;
  control: NonNullable<RoomMember['control']>;
  icon?: string;
}
export interface RoomPlannedSection { id: string; name: string; members: RoomPlannedMember[]; }
export interface RoomPlan {
  members: RoomPlannedMember[];
  /** Entity IDs used for membership and summaries, regardless of visible section selection. */
  memberIds: string[];
  sections: RoomPlannedSection[];
  diagnostics: RoomDiagnostic[];
  relevantEntityIds: string[];
  legacy: boolean;
}

export const ROOM_RECIPES = ['auto', 'kitchen', 'comfort', 'media', 'entry', 'state'] as const;
export const ROOM_ROLES = ['auto', 'temperature', 'humidity', 'power', 'energy', 'illuminance', 'occupancy', 'window', 'door', 'light', 'switch', 'climate', 'cover', 'media', 'security', 'reading', 'device'] as const;
/** Auto IDs depend only on entity identity, so registry order and edits never rewrite them. */
export const roomMemberId = (entity: string) => {
  const readable = `e-${entity.replace(/\./g, '-')}`;
  if (readable.length <= 64) return readable;
  let hash = 2166136261;
  for (const char of entity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${readable.slice(0, 54)}-${(hash >>> 0).toString(16)}`;
};

/** Membership only: safe for update filtering, with no state enumeration or model mapping. */
export function resolveRoomMemberIds(config: CardConfig, catalog: Pick<RoomCatalog, 'areaEntityIds'>): string[] {
  const membership = config.config_version === 2 ? config.room?.membership : undefined;
  const initial = membership
    ? membership.mode === 'area' ? catalog.areaEntityIds(config.area ?? '') : membership.entities ?? []
    : config.entities ?? catalog.areaEntityIds(config.area ?? '');
  const excluded = new Set(membership?.exclude ?? []);
  return [...new Set([...initial, ...(membership?.include ?? [])])].filter((id) => !excluded.has(id));
}

function defaultRole(model: CardEntity, kind: CardKind): string {
  if (model.deviceClass && (ROOM_ROLES as readonly string[]).includes(model.deviceClass)) return model.deviceClass;
  if (['light', 'switch', 'climate', 'cover', 'media'].includes(kind)) return kind;
  if (['humidifier','water-heater'].includes(kind)) return 'climate';
  if (kind === 'remote') return 'media';
  if (['lock', 'person'].includes(kind)) return 'security';
  return ['sensor', 'weather'].includes(kind) ? 'reading' : 'device';
}
function controlSupported(control: RoomPlannedMember['control'], model: CardEntity): boolean {
  if (control === 'auto' || control === 'state') return true;
  if (control === 'toggle') return model.capabilities.includes('toggle');
  if (control === 'select') return model.capabilities.some((cap) => ['select', 'hvac_mode', 'source', 'fan_preset', 'oscillate', 'direction', 'climate_preset', 'climate_fan', 'climate_swing', 'climate_swing_horizontal', 'vacuum_speed', 'repeat', 'shuffle', 'humidifier_mode', 'water_operation', 'away_mode', 'remote_activity','media_join','media_unjoin'].includes(cap));
  return model.capabilities.some((cap) => ['brightness', 'temperature', 'temperature_range', 'position', 'tilt', 'volume', 'number', 'speed', 'humidity'].includes(cap));
}

/** Resolve only membership IDs through the provider boundary; never scan raw host states. */
export function planRoom(config: CardConfig, catalog: RoomCatalog): RoomPlan {
  const diagnostics: RoomDiagnostic[] = [];
  const room = config.config_version === 2 ? config.room : undefined;
  const membership = room?.membership;
  const memberIds = resolveRoomMemberIds(config, catalog);
  if ((membership?.mode === 'area' || (!config.entities && config.area)) && !catalog.registryAvailable)
    diagnostics.push({ code: 'registry_unavailable', message: 'Area registry unavailable. Choose explicit entities to set up this room.' });
  const overrides = new Map((room?.members ?? []).map((member) => [member.entity, member]));
  const members = memberIds.map((entity): RoomPlannedMember => {
    const override = overrides.get(entity);
    const source = catalog.entity(entity);
    const kind = catalog.kind(entity);
    const model = { ...source, capabilities: [...source.capabilities], ...(override?.name !== undefined ? { name: override.name } : {}) };
    let role = override?.role ?? 'auto';
    if (!(ROOM_ROLES as readonly string[]).includes(role)) {
      diagnostics.push({ code: 'unknown_role', entity, message: `Unknown role “${role}”; using the entity's default role.` }); role = 'auto';
    }
    if (role === 'auto') role = defaultRole(model, kind);
    let recipe = override?.recipe ?? 'auto';
    // Domain recipes are accepted alongside room recipes for explicit entity overrides.
    if (!(ROOM_RECIPES as readonly string[]).includes(recipe) && recipe !== kind) {
      diagnostics.push({ code: 'unknown_recipe', entity, message: `Unknown recipe “${recipe}”; using automatic controls.` }); recipe = 'auto';
    }
    let control = override?.control ?? (recipe === 'state' ? 'state' : 'auto');
    if (!controlSupported(control, model)) {
      diagnostics.push({ code: 'unsupported_control', entity, message: `${model.name} does not support ${control}; showing its state.` }); control = 'state';
    }
    if (model.state === 'missing') diagnostics.push({ code: 'missing_entity', entity, message: `Entity ${entity} is missing.` });
    return { id: override?.id ?? roomMemberId(entity), entity, model, kind, role, recipe, control, icon: override?.icon };
  });
  for (const override of room?.members ?? []) if (!memberIds.includes(override.entity))
    diagnostics.push({ code: 'inactive_override', entity: override.entity, message: `Settings for ${override.entity} are retained outside the current membership.` });
  for (const role of ['temperature', 'humidity', 'power', 'occupancy']) {
    const candidates = members.filter((member) => member.role === role);
    if (candidates.length > 1) diagnostics.push({ code: 'ambiguous_role', message: `Multiple ${role} readings: label or remove the extra readings to clarify the room.` });
  }
  const byId = new Map(members.map((member) => [member.id, member]));
  let sections: RoomPlannedSection[];
  if (!room) sections = [{ id: 'legacy', name: '', members }];
  else if (room.sections !== undefined) sections = room.sections.map((section) => ({
    id: section.id, name: section.name ?? '', members: section.members.flatMap((id) => {
      const member = byId.get(id);
      if (!member) diagnostics.push({ code: 'inactive_section_member', path: `room.sections.${section.id}`, message: `Section member ${id} is outside the current membership.` });
      return member ? [member] : [];
    }),
  }));
  else {
    const readings = members.filter((member) => member.control === 'state' || !member.model.capabilities.length);
    const readingIds = new Set(readings.map((member) => member.id));
    sections = [
      { id: 'readings', name: 'Readings', members: readings },
      { id: 'controls', name: 'Devices', members: members.filter((member) => !readingIds.has(member.id)) },
    ].filter((section) => section.members.length);
  }
  return { members, memberIds, sections, diagnostics, relevantEntityIds: [...memberIds], legacy: !room };
}
