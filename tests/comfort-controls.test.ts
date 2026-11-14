import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeCommand,mapEntity,kindForEntity,type Hass,type HassEntity} from '../src/providers/home-assistant';
import type {CardCommand} from '../src/core';
import {validateConfig,domainAllowed} from '../src/config';
function fixture(domain:'humidifier'|'water_heater',attributes:Record<string,unknown>={},state?:string){
 const raw:HassEntity={entity_id:`${domain}.home`,state:state??(domain==='humidifier'?'on':'eco'),attributes:domain==='humidifier'?{humidity:45,current_humidity:39,min_humidity:30,max_humidity:80,supported_features:1,available_modes:['normal','eco'],mode:'normal',...attributes}:{temperature:52,current_temperature:49,min_temp:40,max_temp:70,supported_features:15,operation_list:['off','eco','electric'],away_mode:'off',...attributes}};
 const calls:unknown[][]=[];const host:Hass={config:{unit_system:{temperature:'°F'}},states:{[raw.entity_id]:raw},async callService(...args){calls.push(args);}};
 return {raw,host,calls,model:mapEntity(raw,kindForEntity(raw.entity_id),raw.entity_id,host)};
}
test('comfort kinds map only their own domains and allow standalone entity configuration',()=>{
 for(const [domain,kind] of [['humidifier','humidifier'],['water_heater','water-heater']] as const){
  assert.equal(kindForEntity(`${domain}.home`),kind);assert.equal(domainAllowed(kind,`${domain}.home`),true);
  assert.equal(domainAllowed(kind,'climate.home'),false);assert.deepEqual(validateConfig({type:`custom:navet-${kind}-card`,entity:`${domain}.home`},kind),{type:`custom:navet-${kind}-card`,entity:`${domain}.home`});
 }
});
test('humidifier base target and power do not depend on MODES feature, and unknowns remain unknown',()=>{
 const {model,raw}=fixture('humidifier',{supported_features:0,humidity:undefined,current_humidity:'39',target_humidity_step:undefined});const before=structuredClone(raw);
 assert.deepEqual(model.capabilities,['toggle','power_on','power_off','humidity']);assert.equal(model.targetHumidity,undefined);assert.equal(model.currentHumidity,undefined);assert.equal(model.stepHumidity,1);assert.deepEqual(raw,before);
 assert.equal(fixture('humidifier',{min_humidity:90,max_humidity:20}).model.capabilities.includes('humidity'),false);
 assert.equal(fixture('humidifier',{humidity:90}).model.targetHumidity,undefined);
 assert.deepEqual(fixture('humidifier',{available_modes:['eco','eco',null,3,'']}).model.humidifierModes,['eco']);
});
test('water heater controls need advertised bits and never infer toggle or temperature unit conversion',()=>{
 const none=fixture('water_heater',{supported_features:0}).model;assert.deepEqual(none.capabilities,[]);
 const {model}=fixture('water_heater');assert.equal(model.temperature,52);assert.equal(model.temperatureUnit,'°F');assert.equal(model.awayMode,false);assert.equal(model.stepTemperature,1);assert.equal(model.capabilities.includes('toggle'),false);
 for(const [bit,cap] of [[1,'temperature'],[2,'water_operation'],[4,'away_mode']] as const)assert.deepEqual(fixture('water_heater',{supported_features:bit}).model.capabilities,[cap]);
 assert.deepEqual(fixture('water_heater',{supported_features:8}).model.capabilities,['power_on','power_off']);
 assert.equal(fixture('water_heater',{away_mode:true}).model.awayMode,undefined);
 assert.equal(fixture('water_heater',{min_temp:undefined}).model.capabilities.includes('temperature'),false);
});
test('comfort commands dispatch exact service parameters to the current owning entity',async()=>{
 for(const domain of ['humidifier','water_heater'] as const){
  const {model,host,calls}=fixture(domain);
  const commands:CardCommand[]=domain==='humidifier'?[{type:'humidity',value:50},{type:'humidifier_mode',value:'eco'},{type:'toggle'},{type:'power_on'},{type:'power_off'}]:[{type:'temperature',value:55.5},{type:'water_operation',value:'electric'},{type:'away_mode',value:true},{type:'away_mode',value:false},{type:'power_on'},{type:'power_off'}];
  for(const command of commands)await executeCommand(host,model,command);
  const data=domain==='humidifier'?[['set_humidity',{humidity:50}],['set_mode',{mode:'eco'}],['turn_off',{}],['turn_on',{}],['turn_off',{}]]:[['set_temperature',{temperature:55.5}],['set_operation_mode',{operation_mode:'electric'}],['set_away_mode',{away_mode:true}],['set_away_mode',{away_mode:false}],['turn_on',{}],['turn_off',{}]];
  assert.deepEqual(calls,data.map(([service,payload])=>[domain,service,payload,{entity_id:`${domain}.home`} ]));
 }
});
test('comfort rejects stale owner, changed capabilities/options/ranges and malformed targets',async()=>{
 for(const domain of ['humidifier','water_heater'] as const){
  const command:CardCommand=domain==='humidifier'?{type:'humidifier_mode',value:'eco'}:{type:'water_operation',value:'eco'};
  for(const change of [{state:'unavailable'},{entity_id:'climate.other'},{attributes:{supported_features:0}},{attributes:{supported_features:15,available_modes:['normal'],operation_list:['electric']}}]){
   const {host,raw,model,calls}=fixture(domain);host.states[raw.entity_id]={...raw,...change};await assert.rejects(executeCommand(host,model,command));assert.equal(calls.length,0);
  }
 }
 for(const value of [-1,29,81,100.5,NaN,Infinity,'45']){const {host,model,calls}=fixture('humidifier');await assert.rejects(executeCommand(host,model,{type:'humidity',value} as CardCommand));assert.equal(calls.length,0);}
 for(const value of [39,71,NaN,Infinity,'52']){const {host,model,calls}=fixture('water_heater');await assert.rejects(executeCommand(host,model,{type:'temperature',value} as CardCommand));assert.equal(calls.length,0);}
 const {host,model,raw,calls}=fixture('humidifier');host.states[raw.entity_id]={...raw,attributes:{...raw.attributes,max_humidity:40}};await assert.rejects(executeCommand(host,model,{type:'humidity',value:45}));assert.equal(calls.length,0);
});
