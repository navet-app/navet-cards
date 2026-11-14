/** Declarative conditions: no template evaluation or device side effects. */
export type Condition = (
  | { entity: string; state: string }
  | { entity: string; available: boolean }
  | { entity: string; attribute: string; equals: string | number | boolean | null }
  | { entity: string; attribute?: string; above?: number; below?: number }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
) & { [key: string]: unknown };
export type ConditionStates = Record<string, { state: string; attributes?: Record<string, unknown> } | undefined>;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validateCondition(value: unknown, depth = 0, budget = { nodes: 0 }): Condition {
  if (++budget.nodes > 256) throw new Error('Conditions may contain at most 256 nodes.');
  if (!object(value) || depth > 8) throw new Error('Condition must be an object nested at most eight levels.');
  const forms = ['all', 'any', 'not', 'entity'].filter(key => key in value);
  if (forms.length !== 1) throw new Error('Choose one condition form.');
  for (const key of ['all', 'any']) if (key in value) {
    const children = value[key];
    if (!Array.isArray(children) || !children.length || children.length > 24) throw new Error('Condition groups need 1–24 children.');
    children.forEach(child => validateCondition(child, depth + 1, budget));
    return value as Condition;
  }
  if ('not' in value) { validateCondition(value.not, depth + 1, budget); return value as Condition; }
  if (typeof value.entity !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(value.entity)) throw new Error('Condition needs an entity ID.');
  const leaves = ['state', 'available', 'above', 'below', 'equals'].filter(key => key in value);
  if (!leaves.length || (['state','available','equals'].some(key => key in value) && leaves.length !== 1)) throw new Error('Choose state, availability, attribute equality or numeric bounds.');
  if ('state' in value && typeof value.state !== 'string') throw new Error('Condition state must be text.');
  if ('available' in value && typeof value.available !== 'boolean') throw new Error('Availability must be true or false.');
  for (const key of ['above', 'below']) if (key in value && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) throw new Error('Numeric bounds must be finite.');
  if ('attribute' in value && (typeof value.attribute !== 'string' || !value.attribute.trim())) throw new Error('Attribute must be nonempty text.');
  if ('attribute' in value && ('state' in value || 'available' in value)) throw new Error('Use equals for attribute equality; state and availability apply to the entity.');
  if ('equals' in value) {
    if (!('attribute' in value)) throw new Error('Attribute equality needs an attribute name.');
    const scalar = value.equals;
    if (scalar !== null && !['string','number','boolean'].includes(typeof scalar)) throw new Error('Attribute value must be a string, finite number, boolean or null.');
    if (typeof scalar === 'number' && !Number.isFinite(scalar)) throw new Error('Attribute value must be finite.');
  }
  if (typeof value.above === 'number' && typeof value.below === 'number' && value.above >= value.below) throw new Error('Lower bound must be below upper bound.');
  return value as Condition;
}
export function conditionEntityIds(condition?: Condition): string[] {
  if (!condition) return [];
  if ('entity' in condition) return [condition.entity as string];
  if ('not' in condition) return conditionEntityIds(condition.not as Condition);
  return [...new Set(((condition.all ?? condition.any) as Condition[]).flatMap(conditionEntityIds))];
}
export function evaluateCondition(condition: Condition | undefined, states: ConditionStates): boolean {
  if (!condition) return true;
  if ('all' in condition) return (condition.all as Condition[]).every(child => evaluateCondition(child, states));
  if ('any' in condition) return (condition.any as Condition[]).some(child => evaluateCondition(child, states));
  if ('not' in condition) return !evaluateCondition(condition.not as Condition, states);
  const entity = states[condition.entity as string];
  const available = !!entity && !['unknown', 'unavailable'].includes(entity.state);
  if ('available' in condition) return condition.available === available;
  if ('state' in condition) return !!entity && entity.state === condition.state;
  if (!available) return false;
  if ('equals' in condition) {
    const attributes = entity!.attributes;
    const key = condition.attribute as string;
    return !!attributes && Object.hasOwn(attributes, key) && attributes[key] === condition.equals;
  }
  const raw = condition.attribute ? entity!.attributes?.[condition.attribute as string] : entity!.state;
  if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) return false;
  const value = Number(raw);
  return Number.isFinite(value) && (condition.above === undefined || value > (condition.above as number)) && (condition.below === undefined || value < (condition.below as number));
}
export function compileCondition(input: unknown) {
  const condition = structuredClone(validateCondition(input));
  return { entities: conditionEntityIds(condition), evaluate: (states: ConditionStates) => evaluateCondition(condition, states) };
}
