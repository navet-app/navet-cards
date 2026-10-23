import type { Hass, HassEntity } from './home-assistant';

export interface RemoteFields {
  remoteActivity?: string;
  remoteActivities?: string[];
}
export type RemoteCommand = { type: 'remote_activity'; value: string } | { type: 'power_on' | 'power_off' };
export type RemoteCapability = RemoteCommand['type'];
const remoteId = (id: string) => /^remote\.[a-z0-9_]+$/.test(id);

/** RemoteEntity is a ToggleEntity; ACTIVITY=4 is independent of its power services.
 * Verified against official HA core remote/__init__.py at 2024.6.4 and 2026.9.4.
 */
export function mapRemote(raw: HassEntity | undefined): RemoteFields & { capabilities: RemoteCapability[] } {
  if (!raw || !remoteId(raw.entity_id)) return { capabilities: [] };
  const attributes = raw.attributes;
  const features = typeof attributes.supported_features === 'number' && Number.isInteger(attributes.supported_features) && attributes.supported_features >= 0 ? attributes.supported_features : 0;
  const activities = Array.isArray(attributes.activity_list) ? [...new Set(attributes.activity_list.filter((value): value is string => typeof value === 'string' && !!value.trim()))] : [];
  const capabilities: RemoteCapability[] = ['power_on', 'power_off'];
  if ((features & 4) && activities.length) capabilities.push('remote_activity');
  return {
    capabilities,
    remoteActivities: features & 4 ? activities : [],
    remoteActivity: features & 4 && typeof attributes.current_activity === 'string' && attributes.current_activity.trim() ? attributes.current_activity : undefined,
  };
}

/** Resolve against the current provider snapshot immediately before dispatch. */
export function prepareRemoteCommand(hass: Pick<Hass, 'states'>, id: string, command: RemoteCommand) {
  const raw = hass.states[id];
  if (!remoteId(id) || !raw || raw.entity_id !== id || ['unknown', 'unavailable', 'missing'].includes(raw.state)) throw new Error('The owning remote is unavailable.');
  const current = mapRemote(raw);
  let service: string;
  let data: Record<string, unknown> = {};
  if (command.type === 'remote_activity') {
    if (!current.capabilities.includes('remote_activity') || typeof command.value !== 'string' || !current.remoteActivities?.includes(command.value)) throw new Error('This remote activity is not supported.');
    service = 'turn_on'; data = { activity: command.value };
  } else if (command.type === 'power_on' || command.type === 'power_off') service = command.type === 'power_on' ? 'turn_on' : 'turn_off';
  else throw new Error('This remote command is not supported.');
  return { domain: 'remote', service, data, target: { entity_id: id } };
}
