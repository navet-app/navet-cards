import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile}from'node:fs/promises';import{resolve,sep}from'node:path';
import {subscribeTemplate,type TemplateConnection}from'../../src/providers/templates';
import{displayTemplateSnapshot,type TemplateSnapshot,type TemplateUnsubscribe}from'../../src/data/templates';

// Explicit opt-in, read-only and restricted to the isolated validation host.
const path=resolve(process.env.NAVET_HA_SESSION??'missing-session');
assert.ok(path.startsWith(resolve('.ha-validation')+sep));
const session=JSON.parse(await readFile(path,'utf8'));const base=new URL(session.base);
assert.equal(base.hostname,'127.0.0.1');assert.equal(base.protocol,'http:');assert.ok(Number(base.port)>=18000&&Number(base.port)<19000);
assert.equal(session.name,`navet-cards-ha-${session.version.replaceAll('.','-')}`);

test(`live Home Assistant ${session.version}: read-only Jinja subscriptions and cleanup`,async t=>{
  const response=await fetch(`${session.base}/auth/token`,{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:session.refresh_token,client_id:`${session.base}/`})});
  assert.equal(response.status,200,'Disposable session refresh');const token=(await response.json()).access_token;
  const socket=new WebSocket(`${session.base.replace('http:','ws:')}/api/websocket`);
  let next=0;const commands=new Set<string>();
  const requests=new Map<number,{resolve:(value:any)=>void,reject:(error:any)=>void}>();
  const callbacks=new Map<number,(message:any)=>void>();
  const send=(message:Record<string,unknown>)=>{assert.ok(['render_template','unsubscribe_events'].includes(String(message.type)),'Read-only template transport');commands.add(String(message.type));const id=++next;return{id,promise:new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(id);reject(Error('Read-only template command timed out'));},15000);requests.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});}),send:()=>socket.send(JSON.stringify({id,...message}))};};
  try{
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Disposable HA authentication timed out')),15000);socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Disposable HA socket failed'));});socket.addEventListener('message',({data})=>{const message=JSON.parse(String(data));if(message.type==='auth_required')socket.send(JSON.stringify({type:'auth',access_token:token}));if(message.type==='auth_ok'){clearTimeout(timer);resolve();}if(message.type==='auth_invalid'){clearTimeout(timer);reject(Error('Disposable HA authentication failed'));}if(message.type==='result'){const request=requests.get(message.id);requests.delete(message.id);message.success?request?.resolve(message.result):request?.reject(message.error);}if(message.type==='event')callbacks.get(message.id)?.(message.event);});});
    const connection:TemplateConnection={connected:true,async subscribeMessage(callback,message){const command=send(message);callbacks.set(command.id,callback);command.send();try{await command.promise;}catch(error){callbacks.delete(command.id);throw error;}return async()=>{callbacks.delete(command.id);const unsub=send({type:'unsubscribe_events',subscription:command.id});unsub.send();await unsub.promise;};}};
    const host={states:{},connection};
    async function first(spec:{template:string;variables?:Record<string,unknown>}){let resolve!:(snapshot:TemplateSnapshot)=>void;let reject!:(error:Error)=>void;const result=new Promise<TemplateSnapshot>((done,fail)=>{resolve=done;reject=fail;});const timer=setTimeout(()=>reject(Error('Template result timed out')),15000);let unsubscribe:TemplateUnsubscribe|undefined;try{unsubscribe=await subscribeTemplate(host,spec,resolve);const value=await result;return value;}finally{clearTimeout(timer);await unsubscribe?.();}}
    const constant=await first({template:'Navet {{ value + 2 }}',variables:{value:40}});assert.equal(constant.status,'ready');assert.equal(displayTemplateSnapshot('name',constant).value,'Navet 42');
    const visibility=await first({template:"{{ is_state('light.bed_light', 'on') }}"});assert.equal(visibility.status,'ready');assert.equal(typeof displayTemplateSnapshot('visible',visibility).value,'boolean');
    let rejected=false;try{const broken=await first({template:'{{ invalid syntax'});rejected=broken.status==='error';}catch(error){rejected=String((error as {code?:unknown}).code)==='template_error';}assert.equal(rejected,true,'Backend reports invalid Jinja');
    assert.equal(callbacks.size,0,'Every subscription released');assert.equal(requests.size,0,'Every unsubscribe acknowledged');
    t.diagnostic(JSON.stringify({version:session.version,constantVariables:true,entityReadBoolean:true,invalidSyntaxReported:true,activeCallbacks:callbacks.size,commands:[...commands],serviceCommands:0}));
  }finally{socket.close();}
});
