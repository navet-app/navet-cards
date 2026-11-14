import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config';

const room = {type:'custom:navet-room-card',config_version:2,room:{membership:{mode:'explicit',entities:[]}}};
test('popup and opaque child configurations clone losslessly without mutating input',()=>{
  const input={...room,panel_id:'#kitchen',popup:{scope:'downstairs',size:'wide',timeout:30,swipe:true,trigger:{entity:'binary_sensor.motion',state:'on'},future:true},cards:[{type:'tile',entity:'light.kitchen',features:[{type:'light-brightness'}]},{type:'custom:unknown-card',future:{nested:['kept']}}],cards_layout:'grid',cards_columns:2,navigation_position:'fixed',navigation_offset:12};
  const result=validateConfig(input,'room');
  assert.deepEqual(result,input);
  result.cards![1].future={nested:[]};
  assert.deepEqual(input.cards[1].future,{nested:['kept']});
});
test('popup validation rejects invalid scope, size, trigger, timeout and unsupported owners',()=>{
  for(const popup of [true,{scope:'floor'},{size:'giant'},{timeout:-1},{timeout:Infinity},{timeout:'20'},{swipe:'yes'},{trigger:{entity:'bad',state:'on'}}]) assert.throws(()=>validateConfig({...room,popup},'room'));
  assert.throws(()=>validateConfig({type:'custom:navet-switch-card',entity:'switch.one',popup:{}},'switch'));
  assert.throws(()=>validateConfig({...room,panel_id:'#b--c',popup:{scope:'a'}},'room'));
  assert.throws(()=>validateConfig({...room,panel_id:'#c',popup:{scope:'a--b'}},'room'));
  assert.deepEqual(validateConfig({...room,popup:{timeout:0}},'room'),{...room,popup:{timeout:0}});
});
test('child-card validation retains future data but rejects malformed card collections and layout',()=>{
  for(const extra of [{cards:{}},{cards:[{}]},{cards:[{type:''}]},{cards:[{type:9}]},{cards_layout:'random'},{cards_columns:0},{cards_columns:2.5}]) assert.throws(()=>validateConfig({...room,...extra},'room'));
  assert.deepEqual(validateConfig({...room,cards:[]},'room'),{...room,cards:[]});
});
test('separator and spacer chips preserve dormant fields and validate conditions',()=>{
  const input={type:'custom:navet-chips-card',chips:[{id:'section',type:'separator',name:'Downstairs',foreign:{keep:true},tap_action:{future:true}},{id:'gap',type:'spacer',visible_when:{entity:'light.kitchen',state:'on'}}]};
  assert.deepEqual(validateConfig(input,'chips'),input);
  for(const chip of [{id:'bad',type:'unknown'},{id:'bad',type:'entity'},{id:'bad',type:'separator',name:9},{id:'bad',type:'spacer',visible_when:{entity:'bad',state:'on'}}]) assert.throws(()=>validateConfig({type:input.type,chips:[chip]},'chips'));
});
test('standalone sub-controls allow empty authoring and retain nested configuration',()=>{
  const input={type:'custom:navet-sub-controls-card',sub_controls:[{entity:'light.kitchen',control:'slider',future:true}],future:{keep:true}};
  assert.deepEqual(validateConfig(input,'sub-controls'),input);
  assert.deepEqual(validateConfig({type:input.type,sub_controls:[]},'sub-controls'),{type:input.type,sub_controls:[]});
  assert.throws(()=>validateConfig({type:input.type},'sub-controls'));
});
