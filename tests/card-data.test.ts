import {test} from 'node:test';
import assert from 'node:assert/strict';
import {energyHistory,normalizeForecast,normalizeHistory,weatherForecast,observeCardData} from '../src/providers/card-data';
import type {Hass} from '../src/providers/home-assistant';

test('forecast requests are capability checked, scoped and normalize response data',async()=>{
  const calls:unknown[]=[];
  const host:Hass={states:{'weather.home':{entity_id:'weather.home',state:'sunny',attributes:{supported_features:1}}},async callService(){},async callWS<T>(message:Record<string,unknown>){calls.push(message);return {response:{'weather.home':{forecast:[{datetime:'2026-10-07T12:00:00Z',temperature:0,templow:-2,condition:'cloudy'},{datetime:'invalid',temperature:12}]}}} as T;}};
  assert.deepEqual(await weatherForecast(host,'weather.home'),[{time:Date.parse('2026-10-07T12:00:00Z'),high:0,low:-2,condition:'cloudy'}]);
  assert.deepEqual(calls,[{type:'call_service',domain:'weather',service:'get_forecasts',service_data:{type:'daily'},target:{entity_id:'weather.home'},return_response:true}]);
  host.states['weather.home'].attributes.supported_features=2;
  assert.deepEqual(await weatherForecast(host,'weather.home'),[]);assert.equal(calls.length,1);
  assert.deepEqual(normalizeForecast([{datetime:'2026-10-07',temperature:'2'},{datetime:'2026-10-07',temperature:Infinity}]),[]);
});
test('energy history keeps zero, excludes unavailable and invalid readings, and uses host API',async()=>{
  const rows=[[{state:'0',last_changed:'2026-10-07T10:00:00Z'},{state:'unknown',last_changed:'2026-10-07T11:00:00Z'},{state:'120',last_changed:'invalid'},{state:'42',last_changed:'2026-10-07T12:00:00Z'}]];
  assert.deepEqual(normalizeHistory(rows),[{time:Date.parse('2026-10-07T10:00:00Z'),value:0},{time:Date.parse('2026-10-07T12:00:00Z'),value:42}]);
  const paths:string[]=[];const host:Hass={states:{},async callService(){},async callApi<T>(method:string,path:string){assert.equal(method,'GET');paths.push(path);return rows as T;}};
  assert.equal((await energyHistory(host,'sensor.power')).length,2);assert.match(paths[0],/^history\/period\/.+\?filter_entity_id=sensor.power&minimal_response&no_attributes$/);
  assert.deepEqual(await energyHistory({states:{},async callService(){}},'sensor.power'),[]);
  const dense=normalizeHistory([Array.from({length:100000},(_,i)=>({state:String(i),last_changed:new Date(1700000000000+i*1000).toISOString()}))]);
  assert.ok(dense.length<=257);assert.equal(dense[0].value,0);assert.equal(dense.at(-1)?.value,99999);
});

const flushData = () => new Promise<void>(resolve => setImmediate(resolve));
test('card observations dedupe across HA state-object replacements and isolate transports', async t => {
  let calls = 0;
  const host: Hass = {
    states: {'weather.home': {entity_id:'weather.home',state:'sunny',attributes:{supported_features:1}}},
    async callService() {},
    async callWS<T>() { calls++; return { response: { 'weather.home': { forecast: [{ datetime: '2026-10-20', temperature: 12 }] } } } as T; },
  };
  const first = observeCardData(host, {type:'forecast',entityId:'weather.home'}, () => {});
  const second = observeCardData({...host, states:{...host.states}}, {type:'forecast',entityId:'weather.home'}, () => {});
  t.after(() => {first.release();second.release();});
  await flushData();
  assert.equal(calls, 1);
  assert.equal(first.snapshot.status, 'ready');
  assert.deepEqual(first.snapshot.data, second.snapshot.data);
  const other = observeCardData({...host, async callWS<T>() {calls++;return {response:{'weather.home':{forecast:[]}}} as T;}}, {type:'forecast',entityId:'weather.home'}, () => {});
  t.after(() => other.release());
  await flushData();
  assert.equal(calls, 2);
  assert.equal(other.snapshot.status, 'empty');
  assert.equal(first.snapshot.status, 'ready');
});

test('unsupported observations do not make requests and denied history remains distinct from empty', async t => {
  let calls = 0;
  const host: Hass = { states: {}, async callService() {}, async callWS<T>() { calls++; return {} as T; }, async callApi<T>(): Promise<T> { throw { status:403, message:'Not allowed' }; } };
  const forecast = observeCardData(host, {type:'forecast',entityId:'weather.home'}, () => {});
  const history = observeCardData(host, {type:'history',entityId:'sensor.power'}, () => {});
  t.after(() => {forecast.release();history.release();});
  await flushData();
  assert.equal(calls, 0);
  assert.equal(forecast.snapshot.status, 'unsupported');
  assert.equal(history.snapshot.status, 'denied');
  assert.equal(history.snapshot.error, 'Not allowed');
});

test('new capability support invalidates a cached unsupported query on the same host', async t => {
  let calls = 0;
  const host: Hass = {states:{'weather.home':{entity_id:'weather.home',state:'sunny',attributes:{supported_features:0}}},async callService(){},async callWS<T>() {calls++;return {response:{'weather.home':{forecast:[{datetime:'2026-10-20',temperature:15}]}}} as T;}};
  const unsupported = observeCardData(host,{type:'forecast',entityId:'weather.home'},()=>{});
  await flushData();
  assert.equal(unsupported.snapshot.status,'unsupported');
  unsupported.release();
  const supported = observeCardData({...host,states:{'weather.home':{...host.states['weather.home'],attributes:{supported_features:1}}}},{type:'forecast',entityId:'weather.home'},()=>{});
  t.after(()=>supported.release());
  await flushData();
  assert.equal(calls,1);
  assert.equal(supported.snapshot.status,'ready');
});
