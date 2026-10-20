import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,validateAction,type ActionConfig} from '../src/config';
const base={type:'custom:navet-switch-card',entity:'switch.one'};
test('Assist, custom events and nested action sequences round trip with foreign fields',()=>{
 const input={...base,tap_action:{action:'sequence',continue_on_error:true,foreign:{keep:true},sequence:[{action:'assist',pipeline_id:'preferred',start_listening:false},{action:'fire-dom-event',browser_mod:{service:'browser_mod.popup',data:{title:'Example'}}},{action:'sequence',sequence:[{action:'toggle'},{action:'navigate',navigation_path:'#room'}]}]}};
 const output=validateConfig(input,'switch');assert.deepEqual(output,input);(output.tap_action!.foreign as {keep:boolean}).keep=false;assert.equal(input.tap_action.foreign.keep,true);
});
test('sequence validation rejects malformed and excessively nested action graphs',()=>{
 for(const action of [{action:'assist',pipeline_id:''},{action:'assist',start_listening:'yes'},{action:'sequence',sequence:[]},{action:'sequence',sequence:[{action:'unknown'}]},{action:'sequence',sequence:[{action:'none'}],continue_on_error:'yes'},{action:'sequence',sequence:[{action:'url',url_path:'javascript:alert(1)'}]}])assert.throws(()=>validateConfig({...base,tap_action:action},'switch'));
 let action:ActionConfig={action:'none'};for(let i=0;i<10;i++)action={action:'sequence',sequence:[action]};assert.throws(()=>validateAction(action));
 assert.throws(()=>validateConfig({type:'custom:navet-sensor-card',entity:'sensor.one',tap_action:{action:'sequence',sequence:[{action:'toggle'}]}},'sensor'));
});
test('entityless chips support Assist and events but cannot hide owner-dependent actions in sequences',()=>{
 const type='custom:navet-chips-card';assert.doesNotThrow(()=>validateConfig({type,chips:[{id:'assist',tap_action:{action:'assist'}},{id:'event',tap_action:{action:'fire-dom-event',custom:{keep:true}}},{id:'sequence',tap_action:{action:'sequence',sequence:[{action:'navigate',navigation_path:'#room'}]}}]},'chips'));
 for(const leaf of ['toggle','more-info'])assert.throws(()=>validateConfig({type,chips:[{id:'bad',tap_action:{action:'sequence',sequence:[{action:leaf}]}}]},'chips'));
});
