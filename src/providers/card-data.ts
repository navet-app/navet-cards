import { DataCoordinator, type DataObservation, type DataSnapshot, type ObserveOptions } from '../data/coordinator';
import type { ForecastDay, HistoryPoint } from '../core';
import type { Hass } from './home-assistant';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function normalizeForecast(value: unknown): ForecastDay[] {
  return (Array.isArray(value) ? value : []).flatMap(v => {
    if (!record(v) || !number(v.temperature) || typeof v.datetime !== 'string') return [];
    const time = Date.parse(v.datetime);
    return Number.isFinite(time) ? [{time, high:v.temperature, low:number(v.templow) ? v.templow : undefined, condition:typeof v.condition === 'string' ? v.condition : 'unknown'}] : [];
  }).sort((a,b)=>a.time-b.time).slice(0,7);
}
export async function weatherForecast(hass: Hass, id: string): Promise<ForecastDay[]> {
  if (!hass.callWS || !(Number(hass.states[id]?.attributes.supported_features) & 1)) return [];
  const result = await hass.callWS<unknown>({type:'call_service',domain:'weather',service:'get_forecasts',service_data:{type:'daily'},target:{entity_id:id},return_response:true});
  const response = record(result) && record(result.response) ? result.response[id] : undefined;
  return normalizeForecast(record(response) ? response.forecast : undefined);
}
export function normalizeHistory(value: unknown): HistoryPoint[] {
  const rows = Array.isArray(value) && Array.isArray(value[0]) ? value[0] : [];
  const points = rows.flatMap(v=>{
    if (!record(v) || typeof v.state !== 'string' || !v.state.trim() || typeof v.last_changed !== 'string') return [];
    const time=Date.parse(v.last_changed), reading=Number(v.state);
    return Number.isFinite(time) && Number.isFinite(reading) ? [{time,value:reading}] : [];
  }).sort((a,b)=>a.time-b.time);
  const stride=Math.max(1,Math.ceil(points.length/256));
  return points.filter((_,i)=>i%stride===0 || i===points.length-1);
}
export async function energyHistory(hass: Hass, id: string): Promise<HistoryPoint[]> {
  if (!hass.callApi) return [];
  return normalizeHistory(await hass.callApi('GET',`history/period/${encodeURIComponent(new Date(Date.now()-86400000).toISOString())}?filter_entity_id=${encodeURIComponent(id)}&minimal_response&no_attributes`));
}

// Transport functions are stable across HA's per-state hass object replacements.
// Callers with another host model can provide their own explicit household scope.
export type CardDataQuery = { type: 'forecast' | 'history'; entityId: string };
export type CardDataPoint = ForecastDay | HistoryPoint;
export type CardDataSnapshot = DataSnapshot<CardDataPoint>;
export type CardDataObservation = DataObservation<CardDataPoint>;
const sharedData = new DataCoordinator();
const scopes = new WeakMap<object, WeakMap<object, object>>();
function hostScope(hass: Hass, query: CardDataQuery): object {
  const connection = (hass as Hass & { connection?: object }).connection;
  if (connection && typeof connection === 'object') return connection;
  const service = hass.callService;
  const transport = (query.type === 'forecast' ? hass.callWS : hass.callApi) ?? service;
  let transports = scopes.get(service);
  if (!transports) scopes.set(service, transports = new WeakMap());
  let scope = transports.get(transport);
  if (!scope) transports.set(transport, scope = {});
  return scope;
}
export function observeCardData(hass: Hass, query: CardDataQuery, listener: (snapshot: CardDataSnapshot) => void, options: ObserveOptions & { scope?: object } = {}): CardDataObservation {
  const support = query.type === 'forecast' ? Boolean(hass.callWS && (Number(hass.states[query.entityId]?.attributes.supported_features) & 1)) : Boolean(hass.callApi);
  const key = `${query.type}:${query.entityId}:${support}`;
  return sharedData.observe<CardDataPoint>(options.scope ?? hostScope(hass, query), key, async () => {
    if (query.type === 'forecast') {
      if (!hass.callWS || !(Number(hass.states[query.entityId]?.attributes.supported_features) & 1)) return null;
      return weatherForecast(hass, query.entityId);
    }
    if (!hass.callApi) return null;
    return energyHistory(hass, query.entityId);
  }, listener, { freshnessMs: query.type === 'forecast' ? 1800000 : 300000, refreshMs: query.type === 'forecast' ? 1800000 : 300000, ...options });
}
