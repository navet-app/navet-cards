import type { Hass, HassEntity } from './home-assistant';

export type MediaGroupCommand = { type: 'media_join'; members: string[] } | { type: 'media_unjoin' };
export type MediaGroupCapability = MediaGroupCommand['type'];
export interface MediaGroupFields { mediaGroupMembers?: string[]; }
export interface MediaGroupCandidate { id: string; name: string; available: boolean; }
const grouping = 524288;
const mediaId = (id: string) => /^media_player\.[a-z0-9_]+$/.test(id);
const available = (raw: HassEntity) => !['unknown','unavailable','missing'].includes(raw.state);

/** GROUPING and group_members are the HA media-player contracts, not integration guesses. */
export function mapMediaGroups(raw: HassEntity | undefined): MediaGroupFields & { capabilities: MediaGroupCapability[] } {
  if (!raw || !mediaId(raw.entity_id)) return { capabilities: [] };
  const features = raw.attributes.supported_features;
  const supported = typeof features === 'number' && Number.isSafeInteger(features) && features >= 0 && (features & grouping) !== 0;
  const members = raw.attributes.group_members;
  return {
    capabilities: supported ? ['media_join','media_unjoin'] : [],
    mediaGroupMembers: Array.isArray(members) ? [...new Set(members.filter((id): id is string => typeof id === 'string' && mediaId(id)))] : undefined,
  };
}

/** Candidate presence does not establish cross-integration grouping compatibility. */
export function listMediaGroupCandidates(hass: Pick<Hass, 'states'>, owner: string): MediaGroupCandidate[] {
  if (!mediaId(owner)) return [];
  return Object.entries(hass.states).filter(([id,raw]) => id !== owner && mediaId(id) && raw.entity_id === id).map(([id,raw]) => ({
    id, name: typeof raw.attributes.friendly_name === 'string' && raw.attributes.friendly_name.trim() ? raw.attributes.friendly_name : id,
    available: available(raw),
  })).sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Revalidate the owner and every explicitly selected member against the latest HA state. */
export function prepareMediaGroupCommand(hass: Pick<Hass, 'states'>, id: string, command: MediaGroupCommand) {
  const raw = hass.states[id];
  if (!mediaId(id) || !raw || raw.entity_id !== id || !available(raw)) throw new Error('The owning media player is unavailable.');
  const current = mapMediaGroups(raw);
  if (!current.capabilities.includes(command.type)) throw new Error('This media player does not support grouping.');
  if (command.type === 'media_unjoin') return { domain: 'media_player', service: 'unjoin', data: {}, target: { entity_id: id } };
  if (command.type !== 'media_join' || !Array.isArray(command.members) || !command.members.length || command.members.some((member) => typeof member !== 'string' || !mediaId(member) || member === id) || new Set(command.members).size !== command.members.length) throw new Error('Choose one or more unique media players other than the owning player.');
  for (const member of command.members) {
    const candidate = hass.states[member];
    if (!candidate || candidate.entity_id !== member || !available(candidate)) throw new Error(`The selected media player ${member} is unavailable.`);
  }
  return { domain: 'media_player', service: 'join', data: { group_members: [...command.members] }, target: { entity_id: id } };
}
