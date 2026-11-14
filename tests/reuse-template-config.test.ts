import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,ConfigValidationError} from '../src/config';
import {resolveRecipes} from '../src/config/recipes';
test('validation checks effective recipes while returning untouched source references for HA saving',()=>{
 const input={type:'custom:navet-light-card',definitions:{base:{config:{entity:'${entity}',appearance:{theme:'dark'}},variables:{entity:'light.kitchen'}}},use:['base'],variables:{entity:'light.bedroom'},name:'Bedside',foreign:{keep:true}};
 const saved=validateConfig(input,'light');assert.deepEqual(saved,input);assert.equal(Object.hasOwn(saved,'entity'),false);assert.equal(resolveRecipes(saved).entity,'light.bedroom');
 assert.equal((resolveRecipes(saved).appearance as {theme:string}).theme,'dark');assert.deepEqual(input.variables,{entity:'light.bedroom'});
});
test('composition scope stays in local config and invalid recipe graphs produce structured diagnostics',()=>{
 const input={type:'custom:navet-composition-card',definitions:{reading:{config:{entity:'sensor.one'}}},cards:[{type:'custom:navet-sensor-card',use:['reading']},{type:'custom:unknown-card',variables:{literal:'${untouched}'}}]};
 assert.deepEqual(validateConfig(input,'composition'),input);
 assert.throws(()=>validateConfig({type:'custom:navet-light-card',use:['missing']},'light'),error=>error instanceof ConfigValidationError&&error.diagnostics[0].path==='$.use');
 assert.throws(()=>validateConfig({type:'custom:navet-light-card',definitions:{wrong:{config:{entity:'switch.one'}}},use:['wrong']},'light'));
});
test('typed chips interpolate parent variables while child cards keep independent contexts',()=>{
 const input={type:'custom:navet-chips-card',variables:{entity:'sensor.room',label:'Room',enabled:true},chips:[
  {id:'reading',type:'entity',entity:'${entity}',name:'${label}',show_state:'${enabled}'},
  {id:'action',type:'action',name:'Go to ${label}',tap_action:{action:'navigate',navigation_path:'/rooms/${label}'}},
  {id:'separator',type:'separator',name:'${label}'},{id:'space',type:'spacer',visible_when:{entity:'${entity}',available:true}},
 ],cards:[{type:'custom:button-card',name:'${childOnly}'},{type:'custom:navet-button-card',variables:{childOnly:'Child'},name:'${childOnly}'}]};
 const before=structuredClone(input);assert.deepEqual(validateConfig(input,'chips'),before);
 const output=resolveRecipes(input);
 assert.deepEqual(output.chips,[{id:'reading',type:'entity',entity:'sensor.room',name:'Room',show_state:true},{id:'action',type:'action',name:'Go to Room',tap_action:{action:'navigate',navigation_path:'/rooms/Room'}},{id:'separator',type:'separator',name:'Room'},{id:'space',type:'spacer',visible_when:{entity:'sensor.room',available:true}}]);
 assert.deepEqual(output.cards,input.cards);assert.deepEqual(input,before);
 (output.cards as {name:string}[])[0].name='Changed';assert.deepEqual(input,before);
});
test('display template specifications preserve foreign fields and reject invalid fields or variable shapes',()=>{
 const input={type:'custom:navet-sensor-card',entity:'sensor.one',display_templates:{name:{template:'{{ label }}',variables:{label:'Reading'},future:{keep:true}},visible:{template:'{{ true }}'}}};
 assert.deepEqual(validateConfig(input,'sensor'),input);
 for(const display_templates of [{unknown:{template:'{{ true }}'}},{name:{template:''}},{state:{template:'{{ 1 }}',variables:[]}},{color:{template:7}}])assert.throws(()=>validateConfig({...input,display_templates},'sensor'));
});
