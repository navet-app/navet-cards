import { ConfigValidationError, type ConfigDiagnostic } from './diagnostics';
import type { RoomConfig } from '../rooms/types';

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const entityId = (value: unknown): value is string => typeof value === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(value);
const stableId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);

/** Validate without filling defaults, rewriting IDs or changing HA-owned data. */
export function validateRoomConfig(input: unknown, area: unknown): asserts input is RoomConfig {
  const diagnostics: ConfigDiagnostic[] = [];
  const error = (path: string, message: string, code: ConfigDiagnostic['code'] = 'invalid_room') =>
    diagnostics.push({ code, path, message, severity: 'error' });
  const list = (value: unknown, path: string) => {
    if (!Array.isArray(value) || !value.every(entityId)) error(path, `${path} must be a list of entity IDs.`);
    else if (new Set(value).size !== value.length) error(path, `${path} must not contain duplicate entities.`);
  };
  if (!object(input)) error('$.room', 'room must be an object.');
  else {
    const membership = input.membership;
    if (!object(membership)) error('$.room.membership', 'room membership must be an object.');
    else {
      if (!['area', 'explicit'].includes(String(membership.mode))) error('$.room.membership.mode', 'membership mode must be area or explicit.');
      if (membership.mode === 'area' && (typeof area !== 'string' || !area.trim())) error('$.area', 'area membership needs an area ID.');
      if (membership.mode === 'explicit' && membership.entities === undefined) error('$.room.membership.entities', 'explicit membership needs an entities list.');
      if (membership.mode === 'area' && membership.entities !== undefined) error('$.room.membership.entities', 'area membership uses include/exclude instead of entities.');
      for (const key of ['entities', 'include', 'exclude']) if (membership[key] !== undefined) list(membership[key], `$.room.membership.${key}`);
    }
    const memberIds = new Set<string>();
    const memberEntities = new Set<string>();
    if (input.members !== undefined) {
      if (!Array.isArray(input.members)) error('$.room.members', 'room members must be a list.');
      else input.members.forEach((member, index) => {
        const path = `$.room.members[${index}]`;
        if (!object(member)) { error(path, 'room member must be an object.'); return; }
        if (!stableId(member.id)) error(`${path}.id`, 'member ID must be 1–64 letters, numbers, underscores or hyphens.');
        else if (memberIds.has(member.id)) error(`${path}.id`, `Duplicate member ID: ${member.id}.`, 'duplicate_id');
        else memberIds.add(member.id);
        if (!entityId(member.entity)) error(`${path}.entity`, 'member needs an entity ID.');
        else if (memberEntities.has(member.entity)) error(`${path}.entity`, `Duplicate member entity: ${member.entity}.`, 'duplicate_id');
        else memberEntities.add(member.entity);
        if (member.name !== undefined && typeof member.name !== 'string') error(`${path}.name`, 'member name must be text.');
        for (const key of ['recipe', 'role']) if (member[key] !== undefined && !stableId(member[key])) error(`${path}.${key}`, `${key} must be a 1–64 character identifier.`);
        if (member.icon !== undefined && (typeof member.icon !== 'string' || !/^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(member.icon))) error(`${path}.icon`, 'member icon must use a namespace, such as mdi:lightbulb.');
        if (member.control !== undefined && !['auto', 'state', 'toggle', 'slider', 'select'].includes(String(member.control))) error(`${path}.control`, 'unsupported member control.');
      });
    }
    if (input.sections !== undefined) {
      if (!Array.isArray(input.sections)) error('$.room.sections', 'room sections must be a list.');
      else {
        const sectionIds = new Set<string>();
        input.sections.forEach((section, index) => {
          const path = `$.room.sections[${index}]`;
          if (!object(section)) { error(path, 'room section must be an object.'); return; }
          if (!stableId(section.id)) error(`${path}.id`, 'section needs a stable ID.');
          else if (sectionIds.has(section.id)) error(`${path}.id`, `Duplicate section ID: ${section.id}.`, 'duplicate_id');
          else sectionIds.add(section.id);
          if (section.name !== undefined && typeof section.name !== 'string') error(`${path}.name`, 'section name must be text.');
          if (!Array.isArray(section.members)) error(`${path}.members`, 'section members must reference member IDs.');
          else {
            const references = new Set<string>();
            section.members.forEach((id, memberIndex) => {
              if (typeof id !== 'string' || !memberIds.has(id)) error(`${path}.members[${memberIndex}]`, `Unknown member reference: ${String(id)}.`, 'unknown_reference');
              else if (references.has(id)) error(`${path}.members[${memberIndex}]`, `Duplicate member reference: ${id}.`, 'duplicate_id');
              else references.add(id);
            });
          }
        });
      }
    }
  }
  if (diagnostics.length) throw new ConfigValidationError(diagnostics);
}
