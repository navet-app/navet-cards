import type { Hass } from './home-assistant';
import { TemplateCoordinator, templateKey, displayTemplateSnapshot, type DisplayTemplateField, type DisplayTemplateSpec, type DisplayTemplateSnapshot, type TemplateObservation, type TemplateSnapshot, type TemplateUnsubscribe } from '../data/templates';

export interface TemplateConnection {
  connected?: boolean;
  subscribeMessage<T>(listener: (message: T) => void, message: Record<string,unknown>): Promise<TemplateUnsubscribe>;
  addEventListener?(type: 'ready' | 'disconnected', listener: () => void): void;
  removeEventListener?(type: 'ready' | 'disconnected', listener: () => void): void;
}
type TemplateHost = Pick<Hass,'states'> & { connection?: TemplateConnection };
type RenderMessage = { result?: unknown; error?: unknown; level?: string };
const coordinator=new TemplateCoordinator();
/** HA 2024.6.4/2026.9.4 websocket_api/commands.py and frontend data/ws-templates.ts. */
export async function subscribeTemplate(hass: TemplateHost, spec: DisplayTemplateSpec, listener: (snapshot: TemplateSnapshot) => void): Promise<TemplateUnsubscribe> {
  const connection=hass.connection;
  if(!connection?.subscribeMessage){listener({status:'unsupported',stale:false,error:'Home Assistant template subscriptions are unavailable.'});return ()=>{};}
  const offline=()=>listener({status:'offline',stale:true,error:'Home Assistant is disconnected.'});
  const ready=()=>listener({status:'loading',stale:true});
  connection.addEventListener?.('disconnected',offline);connection.addEventListener?.('ready',ready);
  if(connection.connected===false)offline();
  try{
    const unsubscribe=await connection.subscribeMessage<RenderMessage>(message=>{
      if(typeof message.error==='string'&&message.level!=='WARNING')listener({status:'error',stale:false,error:message.error});
      else if(Object.hasOwn(message,'result'))listener({status:'ready',value:message.result,stale:false});
    },{type:'render_template',template:spec.template,...(spec.variables?{variables:structuredClone(spec.variables)}:{}),strict:true,report_errors:true,timeout:5});
    return ()=>{connection.removeEventListener?.('disconnected',offline);connection.removeEventListener?.('ready',ready);return unsubscribe();};
  }catch(error){connection.removeEventListener?.('disconnected',offline);connection.removeEventListener?.('ready',ready);throw error;}
}
export function observeDisplayTemplate(hass: TemplateHost, field: DisplayTemplateField, spec: DisplayTemplateSpec, listener: (snapshot: DisplayTemplateSnapshot) => void, options: { visible?: boolean } = {}): TemplateObservation<DisplayTemplateSnapshot> {
  const observation=coordinator.observe(hass.connection??hass,templateKey(spec),callback=>subscribeTemplate(hass,spec,callback),snapshot=>listener(displayTemplateSnapshot(field,snapshot)),options);
  return {get snapshot(){return displayTemplateSnapshot(field,observation.snapshot);},setVisible:visible=>observation.setVisible(visible),retry:()=>observation.retry(),release:()=>observation.release()};
}
