import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapUpdate,prepareUpdateCommand,type UpdateCommand} from '../src/providers/updates';
import type {HassEntity} from '../src/providers/home-assistant';
function fixture(attributes:Record<string,unknown>={},state='on'){
 const raw:HassEntity={entity_id:'update.router',state,attributes:{supported_features:1,installed_version:'1.0',latest_version:'2.0',in_progress:false,auto_update:false,...attributes}};
 return {raw,host:{states:{[raw.entity_id]:raw}}};
}
test('update feature gates installation while skip follows auto-update policy independently',()=>{
 assert.deepEqual(mapUpdate(fixture().raw).capabilities,['update_install','update_skip']);
 assert.deepEqual(mapUpdate(fixture({supported_features:0}).raw).capabilities,['update_skip']);
 assert.deepEqual(mapUpdate(fixture({auto_update:true}).raw).capabilities,['update_install']);
 assert.deepEqual(mapUpdate(fixture({auto_update:undefined}).raw).capabilities,['update_install']);
 assert.deepEqual(mapUpdate(fixture({skipped_version:'2.0'},'off').raw).capabilities,['update_install','update_clear_skipped']);
 assert.deepEqual(mapUpdate(fixture({latest_version:'1.0'},'off').raw).capabilities,[]);
 assert.deepEqual(mapUpdate(fixture({latest_version:'0.9'},'off').raw).capabilities,[]);
 for(const state of ['unknown','unavailable','missing'])assert.deepEqual(mapUpdate(fixture({},state).raw).capabilities,[]);
 assert.deepEqual(mapUpdate(undefined),{capabilities:[]});
});
test('update preserves only known version strings, literal summaries and safe release links',()=>{
 const {raw}=fixture({release_summary:'<img src=x onerror=alert(1)>',release_url:'https://example.com/release'});const before=structuredClone(raw);
 const mapped=mapUpdate(raw);assert.equal(mapped.updateReleaseSummary,raw.attributes.release_summary);assert.equal(mapped.updateReleaseUrl,'https://example.com/release');assert.deepEqual(raw,before);
 for(const release_url of ['javascript:alert(1)','data:text/html,a','//evil.test','https://example.com/\nother',{},null])assert.equal(mapUpdate(fixture({release_url}).raw).updateReleaseUrl,undefined);
 for(const latest_version of [null,undefined,'',4,{},' ']){const value=mapUpdate(fixture({latest_version}).raw);assert.equal(value.updateLatestVersion,undefined);assert.deepEqual(value.capabilities,[]);}
});
test('update normalizes minimum numeric progress including zero and current percentage without inventing progress',()=>{
 for(const value of [0,45,100]){const mapped=mapUpdate(fixture({supported_features:5,in_progress:value}).raw);assert.equal(mapped.updateInProgress,true);assert.equal(mapped.updatePercentage,value);assert.deepEqual(mapped.capabilities,[]);}
 assert.equal(mapUpdate(fixture({supported_features:5,in_progress:true,update_percentage:42.5}).raw).updatePercentage,42.5);
 assert.equal(mapUpdate(fixture({supported_features:1,in_progress:true,update_percentage:42}).raw).updatePercentage,undefined);
 assert.equal(mapUpdate(fixture({supported_features:5,in_progress:false,update_percentage:42}).raw).updatePercentage,undefined);
 for(const in_progress of [undefined,null,'false',-1,101]){const mapped=mapUpdate(fixture({in_progress}).raw);assert.equal(mapped.updateInProgress,undefined);assert.deepEqual(mapped.capabilities,[]);}
});
test('update latest-only commands produce exact services without version or backup overrides',()=>{
 const {raw,host}=fixture();const target={entity_id:raw.entity_id};
 assert.deepEqual(prepareUpdateCommand(host,raw.entity_id,{type:'update_install',latestVersion:'2.0'}),{domain:'update',service:'install',data:{},target});
 assert.deepEqual(prepareUpdateCommand(host,raw.entity_id,{type:'update_skip',latestVersion:'2.0'}),{domain:'update',service:'skip',data:{},target});
 raw.state='off';raw.attributes.skipped_version='2.0';
 assert.deepEqual(prepareUpdateCommand(host,raw.entity_id,{type:'update_clear_skipped',skippedVersion:'2.0'}),{domain:'update',service:'clear_skipped',data:{},target});
});
test('update dispatch rechecks offered versions, exact owner, progress, automatic policy and support',()=>{
 for(const attributes of [{latest_version:'3.0'},{installed_version:'2.0'},{in_progress:true},{supported_features:0},{in_progress:undefined}]){
  const {raw,host}=fixture();host.states[raw.entity_id]={...raw,attributes:{...raw.attributes,...attributes}};assert.throws(()=>prepareUpdateCommand(host,raw.entity_id,{type:'update_install',latestVersion:'2.0'}));
 }
 for(const rawChange of [{entity_id:'update.other'},{state:'unavailable'},{state:'off'}]){const {raw,host}=fixture();host.states[raw.entity_id]={...raw,...rawChange};assert.throws(()=>prepareUpdateCommand(host,raw.entity_id,{type:'update_install',latestVersion:'2.0'}));}
 const {raw,host}=fixture({auto_update:true});assert.throws(()=>prepareUpdateCommand(host,raw.entity_id,{type:'update_skip',latestVersion:'2.0'}));
 raw.attributes.auto_update=false;raw.attributes.skipped_version='2.0';assert.throws(()=>prepareUpdateCommand(host,raw.entity_id,{type:'update_clear_skipped',skippedVersion:'1.5'}));
 assert.throws(()=>prepareUpdateCommand(host,raw.entity_id,{type:'update_install',latestVersion:undefined} as unknown as UpdateCommand));
 assert.throws(()=>prepareUpdateCommand(host,'switch.router',{type:'update_install',latestVersion:'2.0'}));
 delete host.states[raw.entity_id];assert.throws(()=>prepareUpdateCommand(host,raw.entity_id,{type:'update_install',latestVersion:'2.0'}));
});
