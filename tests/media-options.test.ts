import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, mapEntity, type Hass, type HassEntity } from '../src/providers/home-assistant';
import type { Capability, CardCommand } from '../src/core';

const bits = {seek:2,repeat:262144,shuffle:32768,power_on:128,power_off:256};
const all = Object.values(bits).reduce((sum,bit)=>sum|bit,0);
function fixture(attributes:Record<string,unknown>={},state='playing') {
  const raw:HassEntity={entity_id:'media_player.dining',state,attributes:{supported_features:all,media_duration:300,media_position:40,media_position_updated_at:'2026-10-20T12:00:00+02:00',repeat:'off',shuffle:false,...attributes}};
  const calls:unknown[][]=[];
  const host:Hass={states:{[raw.entity_id]:raw},async callService(...args){calls.push(args);}};
  return {raw,calls,host,model:mapEntity(raw,'media',raw.entity_id,host)};
}

test('each media option is advertised independently and incidental attributes grant no controls',()=>{
  for(const [cap,bit] of Object.entries(bits)){
    const {model}=fixture({supported_features:bit});
    assert.deepEqual(model.capabilities.filter(value=>value in bits),[cap]);
  }
  const {model}=fixture({supported_features:0});
  assert.deepEqual(model.capabilities,[]);
  assert.deepEqual(model.repeatModes,[]);
  assert.equal(model.repeat,undefined);
});

test('media state normalizes honest position, duration, timestamps and unknown repeat/shuffle values',()=>{
  const {raw,model}=fixture({media_position:0});
  const original=structuredClone(raw);
  assert.equal(model.elapsed,0);assert.equal(model.duration,300);
  assert.equal(model.mediaPositionUpdatedAt,Date.parse('2026-10-20T10:00:00Z'));
  assert.deepEqual(model.repeatModes,['off','one','all']);assert.equal(model.repeat,'off');assert.equal(model.shuffle,false);
  assert.deepEqual(raw,original);
  for(const value of [undefined,-1,Infinity,NaN,301,'40'])assert.equal(fixture({media_position:value}).model.elapsed,undefined);
  for(const value of [undefined,0,-1,Infinity,NaN,'300'])assert.equal(fixture({media_duration:value}).model.duration,undefined);
  assert.equal(fixture({media_position_updated_at:'invalid'}).model.mediaPositionUpdatedAt,undefined);
  assert.equal(fixture({repeat:'future',shuffle:'false'}).model.repeat,undefined);
  assert.equal(fixture({repeat:'future',shuffle:'false'}).model.shuffle,undefined);
  for(const state of ['off','standby']){
    const powered=fixture({},state).model;
    assert.equal(powered.elapsed,undefined);assert.equal(powered.duration,undefined);
    assert.equal(powered.repeat,undefined);assert.equal(powered.shuffle,undefined);
    assert.ok(powered.capabilities.includes('power_on'));
  }
});

test('typed media commands use exact HA services, payloads and owning-player targets',async()=>{
  const {host,model,calls}=fixture();
  for(const command of [{type:'seek',value:0},{type:'seek',value:120.5},{type:'repeat',value:'one'},{type:'shuffle',value:true},{type:'shuffle',value:false},{type:'power_on'},{type:'power_off'}] as CardCommand[])await executeCommand(host,model,command);
  const target={entity_id:'media_player.dining'};
  assert.deepEqual(calls,[
    ['media_player','media_seek',{seek_position:0},target],['media_player','media_seek',{seek_position:120.5},target],
    ['media_player','repeat_set',{repeat:'one'},target],['media_player','shuffle_set',{shuffle:true},target],['media_player','shuffle_set',{shuffle:false},target],
    ['media_player','turn_on',{},target],['media_player','turn_off',{},target],
  ]);
});

test('media dispatch rechecks changed flags, owner and availability before every new action',async()=>{
  for(const type of Object.keys(bits) as (keyof typeof bits)[]){
    const {host,model,raw,calls}=fixture();
    host.states[raw.entity_id]={...raw,attributes:{...raw.attributes,supported_features:0}};
    const command:CardCommand=type==='seek'?{type,value:30}:type==='repeat'?{type,value:'one'}:type==='shuffle'?{type,value:true}:{type};
    await assert.rejects(executeCommand(host,model,command));assert.equal(calls.length,0);
  }
  const {host,model,raw,calls}=fixture();
  host.states[raw.entity_id]={...raw,state:'unavailable'};
  await assert.rejects(executeCommand(host,model,{type:'power_on'}));
  host.states[raw.entity_id]={...raw,entity_id:'media_player.other'};
  await assert.rejects(executeCommand(host,model,{type:'repeat',value:'one'}));
  await assert.rejects(executeCommand(host,{...model,externalId:'light.other'},{type:'power_on'}));
  assert.equal(calls.length,0);
});

test('seek rejects invalid targets, unknown positions and changed duration without clamping or service calls',async()=>{
  for(const value of [-1,301,NaN,Infinity]){
    const {host,model,calls}=fixture();await assert.rejects(executeCommand(host,model,{type:'seek',value}));assert.equal(calls.length,0);
  }
  for(const attributes of [{media_duration:undefined},{media_position:undefined},{media_position:400}]){
    const {host,model,calls}=fixture(attributes);await assert.rejects(executeCommand(host,model,{type:'seek',value:20}));assert.equal(calls.length,0);
  }
  const {host,model,raw,calls}=fixture();host.states[raw.entity_id]={...raw,attributes:{...raw.attributes,media_duration:50}};
  await assert.rejects(executeCommand(host,model,{type:'seek',value:100}));assert.equal(calls.length,0);
});

test('repeat/shuffle validation and powered-off gating preserve independent power support',async()=>{
  const {host,model,calls}=fixture();
  for(const command of [{type:'repeat',value:'random'},{type:'shuffle',value:'false'}])await assert.rejects(executeCommand(host,model,command as CardCommand));
  assert.equal(calls.length,0);
  for(const state of ['off','standby','on','buffering','paused']){
    const current=fixture({},state);
    await executeCommand(current.host,current.model,{type:'power_on'});await executeCommand(current.host,current.model,{type:'power_off'});
    assert.equal(current.calls.length,2);
    if(['off','standby'].includes(state))for(const command of [{type:'seek',value:20},{type:'repeat',value:'all'},{type:'shuffle',value:false}] as CardCommand[])await assert.rejects(executeCommand(current.host,current.model,command));
  }
  for(const [cap,bit] of Object.entries(bits))assert.equal(fixture({supported_features:all^bit}).model.capabilities.includes(cap as Capability),false);
});
