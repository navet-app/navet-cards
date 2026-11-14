import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainAllowed, validateConfig } from '../src/config';

const type='custom:navet-chips-card';
test('chips support empty authoring, stable ordered entity/action rows and lossless isolated config',()=>{
  assert.deepEqual(validateConfig({type,chips:[]},'chips'),{type,chips:[]});
  const input={type,title:'Rooms',subtitle:'Choose a room',future_card:{keep:true},chips:[
    {id:'temperature',entity:'sensor.temperature',show_state:true,visible_when:{entity:'light.kitchen',state:'on'},future_chip:{keep:true}},
    {id:'kitchen',name:'Kitchen',icon:'mdi:countertop',tap_action:{action:'navigate',navigation_path:'#kitchen'}},
    {id:'back',tap_action:{action:'back'}},
  ]};
  const output=validateConfig(input,'chips');
  assert.deepEqual(output,input);
  (output.chips![0].future_chip as {keep:boolean}).keep=false;
  assert.equal(input.chips[0].future_chip?.keep,true);
  assert.deepEqual(output.chips!.map(chip=>chip.id),['temperature','kitchen','back']);
  assert.equal(domainAllowed('chips','weather.home'),true);
});
test('chips reject duplicate IDs, invalid data, unusable actions and oversized lists',()=>{
  for(const chips of [
    undefined,{},Array.from({length:25},(_,i)=>({id:`c-${i}`,entity:'sensor.temperature'})),
    [{id:'duplicate',entity:'sensor.temperature'},{id:'duplicate',entity:'light.kitchen'}],
    [{id:'bad id',entity:'light.kitchen'}],[{id:'missing-action'}],
    [{id:'none',tap_action:{action:'none'}}],[{id:'toggle',tap_action:{action:'toggle'}}],
    [{id:'details',tap_action:{action:'more-info'}}],[{id:'url',tap_action:{action:'url',url_path:'javascript:alert(1)'}}],
    [{id:'bad-entity',entity:'bad'}],[{id:'boolean',entity:'sensor.temperature',show_state:'yes'}],
    [{id:'icon',entity:'sensor.temperature',icon:'not an icon'}],
    [{id:'condition',entity:'sensor.temperature',visible_when:{entity:'bad',state:'on'}}],
    [{id:'double',entity:'light.kitchen',double_tap_action:{action:'navigate',navigation_path:'//evil'}}],
  ])assert.throws(()=>validateConfig({type,chips},'chips'));
  assert.throws(()=>validateConfig({type,chips:[],title:9},'chips'));
});
test('entityless hold actions and entity-specific toggles retain supported gesture validation',()=>{
  const input={type,chips:[{id:'hold',tap_action:{action:'none'},hold_action:{action:'url',url_path:'https://example.com'}},{id:'light',entity:'light.kitchen',tap_action:{action:'toggle'},double_tap_action:{action:'more-info'}}]};
  assert.deepEqual(validateConfig(input,'chips'),input);
});
test('new chips fields do not reinterpret foreign advanced fields on existing card kinds',()=>{
  const legacy={type:'custom:navet-switch-card',entity:'switch.coffee',title:{advanced:true},subtitle:['foreign'],chips:{future:true}};
  assert.deepEqual(validateConfig(legacy,'switch'),legacy);
});
