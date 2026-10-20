import type { CardKind } from './core';
import type { RoomConfig } from './rooms/types';
import { configError, ConfigValidationError, type ConfigDiagnostic } from './config/diagnostics';
import { validateRoomConfig } from './config/room';
import type { ProtectionConfig } from './actions/protection';
import { resolveRecipes, hasRecipeReferences, type RecipeDefinitions, type RecipeScalar } from './config/recipes';
import type { DisplayTemplates } from './data/templates';
import type { CalendarConfig } from './data/calendar';
import { validateCondition, type Condition } from './conditions';

export { ConfigValidationError, type ConfigDiagnostic } from './config/diagnostics';

export const KINDS: CardKind[] = ['light', 'switch', 'sensor', 'room', 'media', 'climate', 'cover', 'number', 'select', 'navigation',
  'fan', 'lock', 'vacuum', 'person', 'weather', 'scene', 'script', 'entity',
  'info', 'note', 'photo', 'button', 'battery', 'ups', 'energy-now', 'media-stack', 'chips', 'sub-controls', 'humidifier', 'water-heater', 'remote', 'update', 'calendar', 'composition'];
export const MULTI_KINDS: CardKind[] = ['info', 'battery', 'ups', 'energy-now', 'media-stack'];
export const CONTENT_KINDS: CardKind[] = ['note', 'photo', 'button', 'chips', 'sub-controls', 'calendar', 'composition'];
export const tagFor = (kind: CardKind) => `navet-${kind}-card`;
export interface ActionConfig {
  action: 'none' | 'toggle' | 'more-info' | 'navigate' | 'perform-action' | 'url' | 'back' | 'assist' | 'fire-dom-event' | 'sequence';
  pipeline_id?: string;
  start_listening?: boolean;
  sequence?: ActionConfig[];
  continue_on_error?: boolean;
  [key: string]: unknown;
  navigation_path?: string;
  navigation_replace?: boolean;
  url_path?: string;
  perform_action?: string;
  target?: Record<string, unknown>;
  data?: Record<string, unknown>;
  confirmation?: boolean | { text?: string };
}
export interface SubControl {
  entity: string;
  name?: string;
  icon?: string;
  attribute?: string;
  unit?: string;
  show_name?: boolean;
  show_state?: boolean;
  read_only?: boolean;
  group?: string;
  control?: 'state' | 'toggle' | 'slider' | 'select';
  visible_when?: Condition;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
  [key: string]: unknown;
}
export interface SubControlGroup { id: string; name: string; collapsed?: boolean; [key: string]: unknown; }
export interface NavigationLink { name: string; path: string; }
export interface ChipConfig {
  id: string;
  type?: 'entity' | 'action' | 'separator' | 'spacer';
  entity?: string;
  name?: string;
  icon?: string;
  show_state?: boolean;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
  visible_when?: Condition;
  [key: string]: unknown;
}
export interface CardConfig {
  type: string;
  definitions?: RecipeDefinitions;
  use?: string[];
  variables?: Record<string,RecipeScalar>;
  display_templates?: DisplayTemplates;
  title?: string;
  subtitle?: string;
  chips?: ChipConfig[];
  config_version?: 1 | 2;
  room?: RoomConfig;
  calendar?: CalendarConfig;
  protection?: ProtectionConfig;
  press_action?: ActionConfig;
  release_action?: ActionConfig;
  repeat_action?: ActionConfig;
  repeat_interval?: number;
  entity?: string;
  entities?: string[];
  area?: string;
  name?: string;
  icon?: string;
  attribute?: string;
  unit?: string;
  content?: string;
  image?: string;
  images?: string[];
  alt?: string;
  size?: 'small' | 'extra-small';
  layout?: 'compact' | 'comfortable' | 'row';
  panel_id?: string;
  popup?: { scope?: string; size?: 'default' | 'wide' | 'fullscreen'; timeout?: number; swipe?: boolean; trigger?: Condition; [key: string]: unknown };
  cards?: Array<Record<string, unknown> & { type: string }>;
  cards_layout?: 'vertical' | 'horizontal' | 'grid';
  cards_columns?: number;
  navigation_position?: 'inline' | 'sticky' | 'fixed';
  navigation_offset?: number;
  sub_controls?: SubControl[];
  sub_controls_position?: 'top' | 'bottom';
  sub_control_groups?: SubControlGroup[];
  links?: NavigationLink[];
  show_state?: boolean;
  show_brightness?: boolean;
  appearance?: {
    accent?: string;
    radius?: number;
    effects?: 'low' | 'high';
    preset?: 'warm' | 'neutral' | 'cool';
    theme?: 'auto' | 'light' | 'dark' | 'black' | 'glass';
  };
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
  icon_tap_action?: ActionConfig;
  icon_hold_action?: ActionConfig;
  icon_double_tap_action?: ActionConfig;
  grid_options?: { columns?: number | 'full'; rows?: number | 'auto'; [key: string]: unknown };
  [key: string]: unknown;
}
export const domainAllowed = (kind: CardKind, entity: string) => {
  const domain = entity.split('.')[0];
  if (kind === 'entity' || kind === 'chips' || kind === 'sub-controls') return /^[a-z_]+\.[a-z0-9_]+$/.test(entity);
  return (
    {
      fan: ['fan'], lock: ['lock'], vacuum: ['vacuum'], person: ['person', 'device_tracker'],
      weather: ['weather'], scene: ['scene'], script: ['script'], entity: [],
      info: ['sensor', 'binary_sensor'], battery: ['sensor', 'binary_sensor'], ups: ['sensor', 'binary_sensor'],
      'energy-now': ['sensor'], 'media-stack': ['media_player'], note: ['input_text', 'text'],
      photo: ['image'], button: ['button', 'input_button', 'scene', 'script'],
      light: ['light'],
      switch: ['switch', 'input_boolean'],
      sensor: ['sensor', 'binary_sensor'],
      media: ['media_player'],
      climate: ['climate'], humidifier: ['humidifier'], 'water-heater': ['water_heater'], remote: ['remote'], update: ['update'], calendar: ['calendar'], composition: [],
      cover: ['cover'],
        room: [], navigation: [], chips: [], 'sub-controls': [], number: ['number', 'input_number'], select: ['select', 'input_select'],
    } as Record<CardKind, string[]>
  )[kind].includes(domain);
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function fail(message: string): never {
  return configError(message);
}
export const localPath = (v: unknown): v is string => typeof v === 'string' && (/^#[a-z0-9_-]+$/i.test(v) || (v.startsWith('/') && !v.startsWith('//') && !/[\\\r\n]/.test(v)));
const entityId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(v);

export const resourceUrl = (v: unknown): v is string => typeof v === 'string' && !/[\\\r\n]/.test(v) && (/^https?:\/\/[^\s]+$/i.test(v) || (v.startsWith('/') && !v.startsWith('//')));

/** External navigation is deliberately separate from local dashboard navigation. */
export function externalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !/^https?:\/\/[^\s\\]+$/i.test(value) || /[\u0000-\u001f\u007f]/.test(value)) return false;
  try { return !!new URL(value).hostname; } catch { return false; }
}

function actionNeedsEntity(action: ActionConfig): boolean {
  return action.action === 'toggle' || action.action === 'more-info' || action.action === 'sequence' && !!action.sequence?.some(actionNeedsEntity);
}

/** Validate nested action graphs once, with a shared node budget across each sequence. */
export function validateAction(action: unknown, allowToggle = true, depth = 0, budget = {nodes:0}): asserts action is ActionConfig {
  if (!object(action) || ++budget.nodes > 256 || depth > 8) fail('Actions must be objects nested at most eight levels and contain at most 256 nodes.');
  if (!['none','toggle','more-info','navigate','perform-action','url','back','assist','fire-dom-event','sequence'].includes(String(action.action))) fail('Unsupported action.');
  if (action.action === 'toggle' && !allowToggle) fail('toggle is supported on light, switch, fan and humidifier cards.');
  if (action.action === 'navigate' && !localPath(action.navigation_path)) fail('navigation_path must be a local path or panel hash.');
  if (action.navigation_replace !== undefined && typeof action.navigation_replace !== 'boolean') fail('navigation_replace must be true or false.');
  if (action.action === 'url' && !externalUrl(action.url_path)) fail('url_path must be an absolute HTTP(S) URL.');
  if (action.action === 'perform-action' && (typeof action.perform_action !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(action.perform_action))) fail('perform_action must be domain.action.');
  if (action.target !== undefined && !object(action.target)) fail('action target must be an object.');
  if (action.data !== undefined && !object(action.data)) fail('action data must be an object.');
  if (action.confirmation !== undefined && typeof action.confirmation !== 'boolean' && !object(action.confirmation)) fail('confirmation must be a boolean or object.');
  if (object(action.confirmation) && action.confirmation.text !== undefined && typeof action.confirmation.text !== 'string') fail('confirmation text must be text.');
  if (action.action === 'assist') {
    if (action.pipeline_id !== undefined && (typeof action.pipeline_id !== 'string' || !action.pipeline_id.trim())) fail('Assist pipeline_id must be nonempty text.');
    if (action.start_listening !== undefined && typeof action.start_listening !== 'boolean') fail('Assist start_listening must be true or false.');
  }
  if (action.action === 'sequence') {
    if (!Array.isArray(action.sequence) || !action.sequence.length || action.sequence.length > 24) fail('A sequence needs 1–24 actions.');
    for (const step of action.sequence) validateAction(step, allowToggle, depth + 1, budget);
    if (action.continue_on_error !== undefined && typeof action.continue_on_error !== 'boolean') fail('continue_on_error must be true or false.');
  }
}

export function validateConfig(input: unknown, kind: CardKind): CardConfig {
  if(object(input)&&hasRecipeReferences(input)) {
    let resolved:Record<string,unknown>;
    try{resolved=resolveRecipes(input);}catch(error){configError(error instanceof Error?error.message:'Invalid reusable configuration.','$.use','invalid_config');}
    validatePlainConfig(resolved!,kind);
    return structuredClone(input) as unknown as CardConfig;
  }
  return validatePlainConfig(input,kind);
}
function validatePlainConfig(input: unknown, kind: CardKind): CardConfig {
  if (!object(input)) fail('configuration must be an object.');
  if (input.config_version !== undefined && input.config_version !== 1 && input.config_version !== 2)
    configError('unsupported config_version; supported versions are 1 and 2.', '$.config_version', 'unsupported_version');
  if (input.room !== undefined && (input.config_version !== 2 || kind !== 'room'))
    configError('structured room configuration requires config_version: 2 on a room card.', '$.room', 'invalid_room');
  if (input.type !== `custom:${tagFor(kind)}`) fail(`type must be custom:${tagFor(kind)}.`);
  if (kind === 'room') {
    if (input.area !== undefined && (typeof input.area !== 'string' || !input.area.trim()))
      fail('area must be an area ID.');
    if (input.config_version === 2 && input.room !== undefined) {
      validateRoomConfig(input.room, input.area);
    } else {
      if (
        input.entities !== undefined &&
        (!Array.isArray(input.entities) || !input.entities.length || !input.entities.every(entityId))
      )
        fail('entities must be a nonempty list of entity IDs.');
      if (!input.area && !input.entities) fail('a room needs area or entities.');
    }
  } else if (kind === 'navigation') {
    if (!Array.isArray(input.links) || !input.links.length || input.links.length > 20) fail('navigation needs 1–20 links.');
    for (const link of input.links) {
      if (!object(link) || typeof link.name !== 'string' || !link.name.trim() || !localPath(link.path)) fail('links need a name and local path or panel hash.');
    }
  } else if (kind === 'composition') {
    if(!Array.isArray(input.cards))fail('composition needs a cards list.');
  } else if (kind === 'calendar') {
    if (!object(input.calendar) || !Array.isArray(input.calendar.entities) || !input.calendar.entities.every(id=>entityId(id) && id.startsWith('calendar.'))) fail('calendar needs a list of calendar entities.');
    const c=input.calendar;
    for(const [key,min,max] of [['days',1,366],['offset_days',-366,366],['limit',1,500]] as const) if(c[key]!==undefined && (typeof c[key]!=='number' || !Number.isInteger(c[key]) || c[key]<min || c[key]>max)) fail(`calendar ${key} must be an integer from ${min} to ${max}.`);
    if(c.filter!==undefined && typeof c.filter!=='string')fail('calendar filter must be text.');
    if(c.show_location!==undefined && typeof c.show_location!=='boolean')fail('calendar show_location must be true or false.');
    if(c.event_action!==undefined)validateAction(c.event_action,false);
  } else if (kind === 'sub-controls') {
    if (!Array.isArray(input.sub_controls)) fail('a sub-controls card needs a sub_controls list.');
  } else if (kind === 'chips') {
    for (const key of ['title','subtitle']) if (input[key] !== undefined && typeof input[key] !== 'string') fail(`${key} must be text.`);
    if (!Array.isArray(input.chips) || input.chips.length > 24) fail('chips must contain at most 24 items.');
    const ids = new Set<string>();
    for (const chip of input.chips) {
      if (!object(chip) || typeof chip.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(chip.id)) fail('chips need a stable ID.');
      if (ids.has(chip.id)) fail('chip IDs must be unique.');
      ids.add(chip.id);
      if (chip.type !== undefined && !['entity','action','separator','spacer'].includes(String(chip.type))) fail('unsupported chip type.');
      if (chip.type === 'separator' || chip.type === 'spacer') {
        if (chip.name !== undefined && typeof chip.name !== 'string') fail('chip name must be text.');
        if (chip.visible_when !== undefined) validateCondition(chip.visible_when);
        continue;
      }
      if (chip.type === 'entity' && !entityId(chip.entity)) fail('entity chips need an entity.');
      if (chip.entity !== undefined && !entityId(chip.entity)) fail('chip entity must be an entity ID.');
      if (chip.name !== undefined && typeof chip.name !== 'string') fail('chip name must be text.');
      if (chip.icon !== undefined && (typeof chip.icon !== 'string' || !/^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(chip.icon))) fail('chip icon must use a namespace.');
      if (chip.show_state !== undefined && typeof chip.show_state !== 'boolean') fail('chip show_state must be true or false.');
      if (chip.visible_when !== undefined) validateCondition(chip.visible_when);
      const actions = ['tap_action','hold_action','double_tap_action'].map((key) => chip[key]);
      for (const action of actions) if (action !== undefined) {
        validateConfig({type:'custom:navet-switch-card',entity:'switch.validation',tap_action:action},'switch');
        if (!chip.entity && object(action) && actionNeedsEntity(action as unknown as ActionConfig)) fail('toggle and more-info chip actions need an entity.');
      }
      if (!chip.entity && !actions.some((action) => object(action) && ['navigate','url','back','perform-action','assist','fire-dom-event','sequence'].includes(String(action.action)))) fail('a chip needs an entity or a useful action.');
    }
  } else if (MULTI_KINDS.includes(kind)) {
    if (!Array.isArray(input.entities) || !input.entities.length || input.entities.length > 24 || !input.entities.every(id => entityId(id) && domainAllowed(kind, id)))
      fail(`${kind} needs 1–24 supported entities.`);
  } else if (CONTENT_KINDS.includes(kind)) {
    if (input.entity !== undefined && (!entityId(input.entity) || !domainAllowed(kind, input.entity))) fail(`unsupported ${kind} entity.`);
    if (kind === 'photo' && !input.entity && !resourceUrl(input.image) && !(Array.isArray(input.images) && input.images.length)) fail('photo needs an image URL or image entity.');
    if (kind === 'note' && !input.entity && typeof input.content !== 'string') fail('note needs content or a text entity.');
    if (kind === 'button' && !input.entity && !['press_action','release_action','repeat_action'].some(key=>object(input[key]) && input[key].action!=='none') && (!object(input.tap_action) || input.tap_action.action === 'none' || input.tap_action.action === 'more-info' || input.tap_action.action === 'toggle')) fail('action card needs an entity or a navigation/service action.');
  } else if (!entityId(input.entity) || !domainAllowed(kind, input.entity)) {
    fail(`entity must reference a supported ${kind} entity.`);
  }
  for (const key of ['name', 'icon', 'attribute', 'unit', 'content', 'image', 'alt']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') fail(`${key} must be text.`);
  }
  if (input.images !== undefined && (kind !== 'photo' || !Array.isArray(input.images) || !input.images.length || input.images.length > 24 || !input.images.every(resourceUrl))) fail('images must contain 1–24 HTTP(S) URLs or local paths.');
  if (input.image !== undefined && !resourceUrl(input.image)) fail('image must be an HTTP(S) URL or local path.');
  if (input.icon !== undefined && !/^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(String(input.icon)))
    fail('icon must use a namespace, such as mdi:lightbulb.');
  if (input.layout !== undefined && !['compact', 'comfortable', 'row'].includes(String(input.layout)))
    fail('layout must be compact, comfortable or row.');
  if (input.size !== undefined && (kind !== 'switch' || !['small', 'extra-small'].includes(String(input.size))))
    fail('switch size must be small or extra-small.');
  for (const key of ['show_state', 'show_brightness'])
    if (input[key] !== undefined && typeof input[key] !== 'boolean')
      fail(`${key} must be true or false.`);
  if (input.appearance !== undefined) {
    if (!object(input.appearance)) fail('appearance must be an object.');
    const a = input.appearance;
    if (a.effects !== undefined && !['low', 'high'].includes(String(a.effects))) fail('effects must be low or high.');
    if (a.preset !== undefined && !['warm', 'neutral', 'cool'].includes(String(a.preset))) fail('unknown appearance preset.');
    if (
      a.accent !== undefined &&
      (typeof a.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(a.accent))
    )
      fail('accent must be a six-digit hex color.');
    if (
      a.radius !== undefined &&
      (typeof a.radius !== 'number' || !Number.isFinite(a.radius) || a.radius < 0 || a.radius > 48)
    )
      fail('radius must be between 0 and 48.');
    if (
      a.theme !== undefined &&
      !['auto', 'light', 'dark', 'black', 'glass'].includes(String(a.theme))
    )
      fail('unknown appearance theme.');
  }
  for (const key of ['tap_action', 'hold_action', 'double_tap_action', 'icon_tap_action', 'icon_hold_action', 'icon_double_tap_action']) {
    if (input[key] !== undefined) validateAction(input[key], ['light','switch','fan','humidifier'].includes(kind));
  }
  if(input.display_templates!==undefined) {
    if(!object(input.display_templates))fail('display_templates must be an object.');
    for(const [field,spec]of Object.entries(input.display_templates)) {
      if(!['name','state','icon','picture','color','visible'].includes(field)||!object(spec)||typeof spec.template!=='string'||!spec.template.trim())fail('Display templates need a supported field and nonempty template.');
      if(spec.variables!==undefined&&!object(spec.variables))fail('Template variables must be an object.');
    }
  }
  for(const key of ['press_action','release_action','repeat_action']) if(input[key]!==undefined) {
    if(['calendar','chips','sub-controls','composition'].includes(kind))fail('Momentary actions require a main card action surface.');
    validateAction(input[key],false);
    const serviceOnly=(value:ActionConfig):boolean=>!value.confirmation && (value.action==='none' || value.action==='perform-action' || value.action==='sequence' && !!value.sequence?.every(serviceOnly));
    if(!serviceOnly(input[key] as ActionConfig))fail('Momentary actions support services, none and service-only sequences without confirmations.');
  }
  if(input.repeat_interval!==undefined && (typeof input.repeat_interval!=='number' || !Number.isFinite(input.repeat_interval) || input.repeat_interval<100 || input.repeat_interval>60000))fail('repeat_interval must be 100–60000 milliseconds.');
  if(input.protection!==undefined) {
    if(!object(input.protection))fail('protection must be an object.');
    if(input.protection.enabled!==undefined && typeof input.protection.enabled!=='boolean')fail('protection enabled must be true or false.');
    if(input.protection.unlock_duration!==undefined && (typeof input.protection.unlock_duration!=='number' || !Number.isFinite(input.protection.unlock_duration) || input.protection.unlock_duration<=0 || input.protection.unlock_duration>3600))fail('unlock_duration must be greater than zero and at most 3600 seconds.');
  }
  if (input.panel_id !== undefined && (kind !== 'room' || typeof input.panel_id !== 'string' || !/^#[a-z0-9_-]+$/i.test(input.panel_id))) fail('panel_id must be a unique room hash, such as #kitchen.');
  if (input.popup !== undefined) {
    if (kind !== 'room' || !object(input.popup)) fail('popup options require a room card.');
    const popup = input.popup as Record<string, unknown>;
    if (popup.scope !== undefined && (typeof popup.scope !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(popup.scope) || !input.panel_id)) fail('popup scope requires a panel_id and a stable scope ID.');
    if (popup.scope !== undefined && (String(popup.scope).includes('--') || String(input.panel_id).includes('--'))) fail('scoped panel IDs and scopes cannot contain the reserved double-hyphen separator.');
    if (popup.size !== undefined && !['default','wide','fullscreen'].includes(String(popup.size))) fail('popup size must be default, wide or fullscreen.');
    if (popup.timeout !== undefined && (typeof popup.timeout !== 'number' || !Number.isFinite(popup.timeout) || popup.timeout < 0 || popup.timeout > 86400)) fail('popup timeout must be 0–86400 seconds.');
    if (popup.swipe !== undefined && typeof popup.swipe !== 'boolean') fail('popup swipe must be true or false.');
    if (popup.trigger !== undefined) validateCondition(popup.trigger);
  }
  if (input.cards !== undefined && (!Array.isArray(input.cards) || !input.cards.every(card => object(card) && typeof card.type === 'string' && !!card.type.trim()))) fail('child cards must be a list of card configurations with a type.');
  if (input.cards_layout !== undefined && !['vertical','horizontal','grid'].includes(String(input.cards_layout))) fail('cards_layout must be vertical, horizontal or grid.');
  if (input.cards_columns !== undefined && (typeof input.cards_columns !== 'number' || !Number.isInteger(input.cards_columns) || input.cards_columns < 1 || input.cards_columns > 12)) fail('cards_columns must be an integer from 1 to 12.');
  if (input.navigation_position !== undefined && (!['navigation','room'].includes(kind) || !['inline','sticky','fixed'].includes(String(input.navigation_position)))) fail('navigation_position requires inline, sticky or fixed on a navigation or room card.');
  if (input.navigation_offset !== undefined && (!['navigation','room'].includes(kind) || typeof input.navigation_offset !== 'number' || !Number.isFinite(input.navigation_offset) || input.navigation_offset < 0)) fail('navigation_offset must be a nonnegative pixel offset on a navigation or room card.');
  if (kind === 'room' && input.links !== undefined) {
    if (!Array.isArray(input.links) || input.links.length > 20) fail('room links must contain at most 20 links.');
    for (const link of input.links) if (!object(link) || typeof link.name !== 'string' || !link.name.trim() || !localPath(link.path)) fail('links need a name and local path or panel hash.');
  }
  if (input.sub_controls_position !== undefined && !['top','bottom'].includes(String(input.sub_controls_position))) fail('sub_controls_position must be top or bottom.');
  const subGroups = new Set<string>();
  if (input.sub_control_groups !== undefined) {
    if (!Array.isArray(input.sub_control_groups) || input.sub_control_groups.length > 8) fail('sub_control_groups must contain at most eight groups.');
    for (const group of input.sub_control_groups) {
      if (!object(group) || typeof group.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(group.id) || typeof group.name !== 'string' || !group.name.trim()) fail('sub-control groups need a stable ID and name.');
      if (subGroups.has(group.id)) fail('sub-control group IDs must be unique.');
      subGroups.add(group.id);
      if (group.collapsed !== undefined && typeof group.collapsed !== 'boolean') fail('group collapsed must be true or false.');
    }
  }
  if (input.sub_controls !== undefined) {
    if (!Array.isArray(input.sub_controls) || input.sub_controls.length > 8) fail('sub_controls must contain at most eight controls.');
    for (const sub of input.sub_controls) {
      if (!object(sub) || !entityId(sub.entity)) fail('sub-controls need an entity.');
      if (sub.name !== undefined && typeof sub.name !== 'string') fail('sub-control name must be text.');
      for (const key of ['attribute','unit']) if (sub[key] !== undefined && typeof sub[key] !== 'string') fail(`sub-control ${key} must be text.`);
      if (sub.icon !== undefined && (typeof sub.icon !== 'string' || !/^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(sub.icon))) fail('sub-control icon must use a namespace.');
      for (const key of ['show_name','show_state','read_only']) if (sub[key] !== undefined && typeof sub[key] !== 'boolean') fail(`sub-control ${key} must be true or false.`);
      if (sub.group !== undefined && (typeof sub.group !== 'string' || !subGroups.has(sub.group))) fail('sub-control group must reference a declared group ID.');
      if (sub.control !== undefined && !['state', 'toggle', 'slider', 'select'].includes(String(sub.control))) fail('unsupported sub-control.');
      if (sub.visible_when !== undefined) {
        try { validateCondition(sub.visible_when); } catch (error) { fail(error instanceof Error ? error.message : 'Invalid visibility condition.'); }
      }
      for (const key of ['tap_action','hold_action','double_tap_action']) if (sub[key] !== undefined) validateConfig({ type: 'custom:navet-switch-card', entity: 'switch.validation', [key]: sub[key] }, 'switch');
    }
  }
  if (input.grid_options !== undefined) {
    if (!object(input.grid_options)) fail('grid_options must be an object.');
    const { columns, rows } = input.grid_options;
    if (
      columns !== undefined &&
      columns !== 'full' &&
      (typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1 || columns > 12)
    )
      fail('grid columns must be 1–12 or full.');
    if (
      rows !== undefined &&
      rows !== 'auto' &&
      (typeof rows !== 'number' || !Number.isFinite(rows) || rows < 1)
    )
      fail('grid rows must be at least 1 or auto.');
  }
  // Configuration is HA-owned JSON. Clone before applying defaults or editing.
  return structuredClone(input) as unknown as CardConfig;
}

/** Editor-friendly validation. Legacy errors keep their messages and use the root path. */
export function configDiagnostics(input: unknown, kind: CardKind): readonly ConfigDiagnostic[] {
  try { validateConfig(input, kind); return []; }
  catch (error) {
    if (error instanceof ConfigValidationError) return error.diagnostics;
    throw error;
  }
}
