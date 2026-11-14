import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, mapEntity, roomEntityIds, kindForEntity, type Hass } from '../src/providers/home-assistant';
import { createRoomCatalog } from '../src/providers/room-catalog';
import { planRoom } from '../src/rooms/planner';

function host() {
  const calls:unknown[][]=[];
  const hass:Hass={states:{
    'remote.lounge':{entity_id:'remote.lounge',state:'off',attributes:{supported_features:4,activity_list:['TV','Music'],current_activity:'TV'}},
    'humidifier.study':{entity_id:'humidifier.study',state:'on',attributes:{humidity:45,min_humidity:30,max_humidity:80}},
    'water_heater.home':{entity_id:'water_heater.home',state:'eco',attributes:{supported_features:2,operation_list:['eco','electric']}},
    'media_player.lounge':{entity_id:'media_player.lounge',state:'playing',attributes:{supported_features:524288}},
    'media_player.kitchen':{entity_id:'media_player.kitchen',state:'idle',attributes:{}},
  },async callService(...args){calls.push(args);}};
  return {hass,calls};
}
test('new comfort and remote domains participate in live area membership and native room recipes',()=>{
  const {hass}=host();hass.areas={kitchen:{name:'Kitchen'}};hass.entities=Object.fromEntries(Object.keys(hass.states).map(id=>[id,{area_id:'kitchen'}]));
  assert.deepEqual(roomEntityIds(hass,'kitchen'),Object.keys(hass.states).sort());
  const plan=planRoom({type:'custom:navet-room-card',config_version:2,area:'kitchen',room:{membership:{mode:'area'}}},createRoomCatalog(hass));
  assert.equal(plan.members.find(m=>m.entity==='remote.lounge')?.kind,'remote');
  assert.equal(plan.members.find(m=>m.entity==='remote.lounge')?.role,'media');
  assert.equal(plan.members.find(m=>m.entity==='humidifier.study')?.role,'climate');
  assert.equal(plan.members.find(m=>m.entity==='water_heater.home')?.model.active,true);
});
test('the shared command executor delegates remote activities and rejects stale current options',async()=>{
  const {hass,calls}=host();const id='remote.lounge';const model=mapEntity(hass.states[id],kindForEntity(id),id,hass);
  await executeCommand(hass,model,{type:'remote_activity',value:'Music'});
  await executeCommand(hass,model,{type:'power_off'});
  assert.deepEqual(calls,[['remote','turn_on',{activity:'Music'},{entity_id:id}],['remote','turn_off',{}, {entity_id:id}]]);
  hass.states[id].attributes.activity_list=['TV'];
  await assert.rejects(executeCommand(hass,model,{type:'remote_activity',value:'Music'}));
  assert.equal(calls.length,2);
});
test('the shared command executor groups only explicitly selected current media owners',async()=>{
  const {hass,calls}=host();const id='media_player.lounge';const model=mapEntity(hass.states[id],'media',id,hass);
  await executeCommand(hass,model,{type:'media_join',members:['media_player.kitchen']});
  await executeCommand(hass,model,{type:'media_unjoin'});
  assert.deepEqual(calls,[['media_player','join',{group_members:['media_player.kitchen']},{entity_id:id}],['media_player','unjoin',{}, {entity_id:id}]]);
  hass.states['media_player.kitchen'].state='unavailable';
  await assert.rejects(executeCommand(hass,model,{type:'media_join',members:['media_player.kitchen']}));
  assert.equal(calls.length,2);
});
