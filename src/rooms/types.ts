/** Saved room authoring contract. Array order is presentation order; IDs survive reordering. */
export interface RoomMembership {
  mode: 'area' | 'explicit';
  /** Used only in explicit mode. Area mode derives membership from the card's area. */
  entities?: string[];
  /** Explicit additions/removals after membership resolution. Exclusion wins. */
  include?: string[];
  exclude?: string[];
  [key: string]: unknown;
}

export interface RoomMember {
  id: string;
  entity: string;
  recipe?: string;
  role?: string;
  name?: string;
  icon?: string;
  control?: 'auto' | 'state' | 'toggle' | 'slider' | 'select';
  [key: string]: unknown;
}

export interface RoomSection {
  id: string;
  name?: string;
  /** References RoomMember.id, not entity IDs. */
  members: string[];
  [key: string]: unknown;
}

export interface RoomConfig {
  membership: RoomMembership;
  /** Optional per-entity overrides. Unlisted catalog entities retain recipe defaults. */
  members?: RoomMember[];
  /** Omitted means automatic sections; an empty list deliberately displays no sections. */
  sections?: RoomSection[];
  [key: string]: unknown;
}
