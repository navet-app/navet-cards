import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig} from '../src/config';
test('momentary service sequences and transient protection preserve foreign configuration',()=>{
 const input={type:'custom:navet-button-card',name:'Momentary',tap_action:{action:'none'},press_action:{action:'perform-action',perform_action:'script.turn_on',target:{entity_id:'script.start'}},release_action:{action:'sequence',sequence:[{action:'perform-action',perform_action:'script.turn_on',target:{entity_id:'script.stop'}}]},repeat_action:{action:'none'},repeat_interval:150,protection:{enabled:true,unlock_duration:2,future:true},future:{keep:true}};
 assert.deepEqual(validateConfig(input,'button'),input);
 for(const extra of [{press_action:{action:'navigate',navigation_path:'#room'}},{release_action:{action:'perform-action',perform_action:'script.turn_on',confirmation:true}},{repeat_interval:0},{protection:{enabled:'yes'}},{protection:{unlock_duration:0}}])assert.throws(()=>validateConfig({...input,...extra},'button'));
});
test('calendar accepts empty visual drafts and validates calendar domains, date windows, event actions and unknown fields',()=>{
 const input={type:'custom:navet-calendar-card',calendar:{entities:['calendar.home','calendar.work'],days:8,offset_days:-1,limit:30,filter:'trip',show_location:true,event_action:{action:'more-info'},future:{keep:true}}};
 assert.deepEqual(validateConfig(input,'calendar'),input);
 assert.doesNotThrow(()=>validateConfig({type:input.type,calendar:{entities:[]}},'calendar'));
 for(const patch of [{entities:['light.bad']},{days:0},{offset_days:1.5},{limit:0},{filter:5},{event_action:{action:'toggle'}}])assert.throws(()=>validateConfig({...input,calendar:{...input.calendar,...patch}},'calendar'));
});
