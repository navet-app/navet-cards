import type { CardEntity, CardKind } from './core';

/** Everyday reading icons stay independent of the optional rich-content renderer. */
export const readingGlyph = (entity: CardEntity) => ['°C','°F','C','F'].includes(entity.unit) ? 'sensor' : ['W','kW','kWh','Wh'].includes(entity.unit) ? 'energy-now' : entity.unit === '%' ? 'humidity' : 'gauge';
export const customContentKind = (kind: CardKind): boolean => ['info', 'ups', 'battery', 'energy-now', 'note', 'photo'].includes(kind);
