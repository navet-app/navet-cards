import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {executeCommand,mapEntity,kindForEntity,type Hass} from '../../src/providers/home-assistant';
import type {CardCommand,Capability} from '../../src/core';

// Explicit disposable session only. Credentials remain in memory and are never logged.
const sessionPath=resolve(process.env.NAVET_HA_SESSION??'missing-session');
assert.ok(sessionPath.startsWith(resolve('.ha-validation')+sep));
const session=JSON.parse(await readFile(sessionPath,'utf8'));
assert.equal(new URL(session.base).hostname,'127.0.0.1');
assert.ok(Number(new URL(session.base).port)>=18000);
assert.equal(session.name,`navet-cards-ha-${session.version.replaceAll('.','-')}`);
const refreshed=await fetch(session.base+'/auth/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:session.refresh_token,client_id:session.base+'/'})});
assert.equal(refreshed.status,200,'Disposable session refresh succeeds');
const accessToken=(await refreshed.json()).access_token;
const socket=new WebSocket(`${session.base.replace('http:','ws:')}/api/websocket`);
const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
let nextId=0;
await new Promise<void>((done,reject)=>{
 const timer=setTimeout(()=>reject(new Error('Disposable HA authentication timed out')),15000);
 socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Disposable HA socket failed'));});
 socket.addEventListener('message',({data})=>{
  const message=JSON.parse(String(data));
  if(message.type==='auth_required')socket.send(JSON.stringify({type:'auth',access_token:accessToken}));
  if(message.type==='auth_ok'){clearTimeout(timer);done();}
  if(message.type==='auth_invalid'){clearTimeout(timer);reject(new Error('Disposable HA authentication failed'));}
  if(message.type==='result'){const request=pending.get(message.id);pending.delete(message.id);message.success?request?.resolve(message.result):request?.reject(new Error(JSON.stringify(message.error)));}
 });
});
function call(type:string,data:Record<string,unknown>={}):Promise<any>{return new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${type} timed out`));},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id,type,...data}));});}
async function host():Promise<Hass>{const [states,config]=await Promise.all([call('get_states'),call('get_config')]);return {states:Object.fromEntries(states.map((state:any)=>[state.entity_id,state])),config,async callService(domain,service,data,target){await call('call_service',{domain,service,service_data:data,target});}};}
async function current(id:string){const hass=await host();return {hass,model:mapEntity(hass.states[id],kindForEntity(id),id,hass)};}
const checks=[
 {domain:'humidifier',cap:'humidity',field:'targetHumidity'},
 {domain:'humidifier',cap:'humidifier_mode',field:'humidifierMode',list:'humidifierModes'},
 {domain:'water_heater',cap:'temperature',field:'temperature'},
 {domain:'water_heater',cap:'water_operation',field:'waterOperation',list:'waterOperations'},
 {domain:'water_heater',cap:'away_mode',field:'awayMode'},
 {domain:'remote',cap:'remote_activity',field:'remoteActivity',list:'remoteActivities'},
] as const;

test(`live Home Assistant ${session.version}: comfort and remote commands`,async t=>{
 const exercised:unknown[]=[];const skipped:unknown[]=[];
 try{
  assert.equal((await call('get_config')).version,session.version);
  const initial=await host();
  const discovered=Object.entries(initial.states).filter(([id])=>['humidifier','water_heater','remote'].includes(id.split('.')[0])).map(([id,raw])=>({entityId:id,state:raw.state,features:raw.attributes.supported_features??0,capabilities:mapEntity(raw,kindForEntity(id),id,initial).capabilities}));
  t.diagnostic(JSON.stringify({version:session.version,discovered}));
  for(const spec of checks)await t.test(spec.cap,async sub=>{
   const hass=await host();
   const candidate=Object.entries(hass.states).filter(([id])=>id.startsWith(spec.domain+'.')).map(([id,raw])=>mapEntity(raw,kindForEntity(id),id,hass)).find(model=>{
    if(!model.available||!model.capabilities.includes(spec.cap as Capability))return false;
    const value=model[spec.field];
    if('list' in spec)return typeof value==='string'&&model[spec.list]?.includes(value)&&model[spec.list]!.some(option=>option!==value);
    return spec.cap==='away_mode'?typeof value==='boolean':typeof value==='number'&&Number.isFinite(value);
   });
   if(!candidate){const reason=`No available demo ${spec.domain} advertises ${spec.cap} with a known current value and a different valid target.`;skipped.push({capability:spec.cap,reason});sub.skip(reason);return;}
   const original=candidate[spec.field];let value:unknown;
   if('list' in spec)value=candidate[spec.list]!.find(option=>option!==original);
   else if(spec.cap==='away_mode')value=!original;
   else{const humidity=spec.cap==='humidity';const min=humidity?candidate.minHumidity!:candidate.minTemperature!;const max=humidity?candidate.maxHumidity!:candidate.maxTemperature!;const step=humidity?candidate.stepHumidity!:candidate.stepTemperature!;value=Number(original)+step<=max?Number(original)+step:Number(original)-step;assert.ok(Number(value)>=min&&Number(value)<=max);}
   let accepted=false;
   try{
    await executeCommand(hass,candidate,{type:spec.cap,value} as CardCommand);accepted=true;
    assert.equal((await current(candidate.externalId)).model[spec.field],value,'Service readback matches requested value');
    exercised.push({capability:spec.cap,entityId:candidate.externalId,value});
   }finally{if(accepted){const fresh=await current(candidate.externalId);await executeCommand(fresh.hass,fresh.model,{type:spec.cap,value:original} as CardCommand);assert.equal((await current(candidate.externalId)).model[spec.field],original,'Restored original reported value');}}
  });
  for(const domain of ['humidifier','water_heater','remote'])await t.test(`${domain} power pair`,async sub=>{
   const hass=await host();const candidate=Object.entries(hass.states).filter(([id])=>id.startsWith(domain+'.')).map(([id,raw])=>mapEntity(raw,kindForEntity(id),id,hass)).find(model=>model.available&&model.capabilities.includes('power_on')&&model.capabilities.includes('power_off')&&(domain!=='water_heater'||model.waterOperations?.includes(model.state)));
   if(!candidate){const reason=`No available demo ${domain} advertises paired power with readable restorable state.`;skipped.push({capability:`${domain}_power`,reason});sub.skip(reason);return;}
   let accepted=false;
   try{
    const first=candidate.active?'power_off':'power_on';await executeCommand(hass,candidate,{type:first});accepted=true;
    const after=await current(candidate.externalId);assert.equal(after.model.active,!candidate.active,'Power state changed');
    await executeCommand(after.hass,after.model,{type:candidate.active?'power_on':'power_off'});
    assert.equal((await current(candidate.externalId)).model.active,candidate.active,'Power state restored');
    exercised.push({capability:`${domain}_power`,entityId:candidate.externalId,offOnReadback:true});
   }finally{if(accepted){let fresh=await current(candidate.externalId);if(fresh.model.active!==candidate.active){await executeCommand(fresh.hass,fresh.model,{type:candidate.active?'power_on':'power_off'});fresh=await current(candidate.externalId);}if(domain==='water_heater'&&candidate.waterOperation&&fresh.model.waterOperation!==candidate.waterOperation){await executeCommand(fresh.hass,fresh.model,{type:'water_operation',value:candidate.waterOperation});}if(domain==='remote'&&candidate.remoteActivity&&candidate.remoteActivities?.includes(candidate.remoteActivity)&&fresh.model.remoteActivity!==candidate.remoteActivity){await executeCommand(fresh.hass,fresh.model,{type:'remote_activity',value:candidate.remoteActivity});}}}
  });
 }finally{t.diagnostic(JSON.stringify({version:session.version,scope:'isolated real demo backend; no synthetic state',exercised,skipped}));socket.close();}
});
