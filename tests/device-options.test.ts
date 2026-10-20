import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapEntity, executeCommand, type Hass, type HassEntity } from '../src/providers/home-assistant';
import type { CardCommand } from '../src/core';

const rawClimate = (attrs: Record<string, unknown> = {}, state='heat'): HassEntity => ({entity_id:'climate.dining',state,attributes:{supported_features:8|16|32|512,fan_modes:['low','high'],fan_mode:'low',preset_modes:['eco','comfort'],preset_mode:'eco',swing_modes:['off','vertical'],swing_mode:'off',swing_horizontal_modes:['off','on'],swing_horizontal_mode:'off',...attrs}});
const rawVacuum = (attrs: Record<string, unknown> = {}, state='docked'): HassEntity => ({entity_id:'vacuum.dining',state,attributes:{supported_features:32,fan_speed_list:['Quiet','Turbo'],fan_speed:'Quiet',...attrs}});
const setup = () => {
  const calls: unknown[][]=[];
  const host:Hass={states:{'climate.dining':rawClimate(),'vacuum.dining':rawVacuum()},async callService(...args){calls.push(args);}};
  return {host,calls,climate:mapEntity(host.states['climate.dining'],'climate','climate.dining'),vacuum:mapEntity(host.states['vacuum.dining'],'vacuum','vacuum.dining')};
};

test('climate and vacuum options require independent feature flags and nonempty advertised lists',()=>{
  const {climate,vacuum}=setup();
  for(const capability of ['climate_preset','climate_fan','climate_swing','climate_swing_horizontal'] as const) assert.ok(climate.capabilities.includes(capability));
  assert.deepEqual(climate.climateFans,['low','high']);
  assert.deepEqual(climate.climateSwingHorizontals,['off','on']);
  assert.equal(vacuum.vacuumSpeed,'Quiet');assert.deepEqual(vacuum.vacuumSpeeds,['Quiet','Turbo']);
  assert.ok(vacuum.capabilities.includes('vacuum_speed'));
  const none=mapEntity(rawClimate({supported_features:0}),'climate','climate.dining');
  assert.deepEqual(none.capabilities,[]);
  const sparse=mapEntity(rawClimate({preset_modes:[],fan_modes:null,swing_modes:[null,5,''],swing_horizontal_modes:[]}),'climate','climate.dining');
  assert.deepEqual(sparse.capabilities,[]);
  assert.ok(!mapEntity(rawVacuum({supported_features:0}),'vacuum','vacuum.dining').capabilities.includes('vacuum_speed'));
});

test('options preserve unknown current state and sanitize lists without inventing a selection',()=>{
  const climate=mapEntity(rawClimate({preset_mode:null,preset_modes:['eco','eco',null,4,'']}),'climate','climate.dining');
  assert.equal(climate.climatePreset,undefined);assert.deepEqual(climate.climatePresets,['eco']);
  const vacuum=mapEntity(rawVacuum({fan_speed:null}),'vacuum','vacuum.dining');
  assert.equal(vacuum.vacuumSpeed,undefined);
});

test('device option commands use exact services, parameters and owning targets',async()=>{
  const {host,calls,climate,vacuum}=setup();
  for(const command of [{type:'climate_preset',value:'comfort'},{type:'climate_fan',value:'high'},{type:'climate_swing',value:'vertical'},{type:'climate_swing_horizontal',value:'on'}] as CardCommand[])await executeCommand(host,climate,command);
  await executeCommand(host,vacuum,{type:'vacuum_speed',value:'Turbo'});
  assert.deepEqual(calls,[
    ['climate','set_preset_mode',{preset_mode:'comfort'},{entity_id:'climate.dining'}],
    ['climate','set_fan_mode',{fan_mode:'high'},{entity_id:'climate.dining'}],
    ['climate','set_swing_mode',{swing_mode:'vertical'},{entity_id:'climate.dining'}],
    ['climate','set_swing_horizontal_mode',{swing_horizontal_mode:'on'},{entity_id:'climate.dining'}],
    ['vacuum','set_fan_speed',{fan_speed:'Turbo'},{entity_id:'vacuum.dining'}],
  ]);
});

test('dispatch rechecks current options, flags, availability and domain after rendering',async()=>{
  const {host,calls,climate,vacuum}=setup();
  host.states['climate.dining']=rawClimate({preset_modes:['away']});
  await assert.rejects(executeCommand(host,climate,{type:'climate_preset',value:'eco'}));
  await executeCommand(host,climate,{type:'climate_preset',value:'away'});
  host.states['climate.dining']=rawClimate({supported_features:0});
  for(const command of [{type:'climate_fan',value:'high'},{type:'climate_swing',value:'vertical'},{type:'climate_swing_horizontal',value:'on'}] as CardCommand[])await assert.rejects(executeCommand(host,climate,command));
  host.states['vacuum.dining']=rawVacuum({fan_speed_list:['Auto']});
  await assert.rejects(executeCommand(host,vacuum,{type:'vacuum_speed',value:'Turbo'}));
  host.states['vacuum.dining']=rawVacuum({},'unavailable');
  await assert.rejects(executeCommand(host,vacuum,{type:'vacuum_speed',value:'Quiet'}));
  await assert.rejects(executeCommand(host,climate,{type:'vacuum_speed',value:'Quiet'}));
  delete host.states['climate.dining'];
  await assert.rejects(executeCommand(host,climate,{type:'climate_preset',value:'away'}));
  assert.deepEqual(calls,[['climate','set_preset_mode',{preset_mode:'away'},{entity_id:'climate.dining'}]]);
});
