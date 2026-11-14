/** Presentation-only HA template outputs. No template result can become a command. */
export type DisplayTemplateField = 'name' | 'state' | 'icon' | 'picture' | 'color' | 'visible';
export interface DisplayTemplateSpec { template: string; variables?: Record<string, unknown>; [key: string]: unknown }
export type DisplayTemplates = Partial<Record<DisplayTemplateField, DisplayTemplateSpec>>;
export type TemplateStatus = 'loading' | 'ready' | 'unsupported' | 'denied' | 'offline' | 'error';
export interface TemplateSnapshot { readonly status: TemplateStatus; readonly value?: unknown; readonly stale: boolean; readonly error?: string }
export interface DisplayTemplateSnapshot extends Omit<TemplateSnapshot, 'value'> { readonly value?: string | boolean }
export interface TemplateObservation<T = TemplateSnapshot> { readonly snapshot: T; setVisible(visible: boolean): void; retry(): void; release(): void }
export type TemplateUnsubscribe = () => void | Promise<unknown>;
export type TemplateSubscribe = (listener: (snapshot: TemplateSnapshot) => void) => Promise<TemplateUnsubscribe>;
type Subscriber = { visible: boolean; listener: (snapshot: TemplateSnapshot) => void };
type Entry = { subscribers: Set<Subscriber>; snapshot: TemplateSnapshot; subscribe: TemplateSubscribe; generation: number; running: boolean; unsubscribe?: TemplateUnsubscribe };
const stopSubscription = (unsubscribe?: TemplateUnsubscribe) => { try { void Promise.resolve(unsubscribe?.()).catch(() => {}); } catch { /* Disconnection already removed the remote subscription. */ } };
export function templateErrorStatus(error: unknown): TemplateStatus {
  const value = error as { code?: unknown; status?: unknown; message?: unknown } | undefined;
  const code = String(value?.code ?? value?.status ?? '');
  if (['401','403','unauthorized','forbidden','not_allowed','permission_denied'].includes(code)) return 'denied';
  if (['connection_lost','not_connected','offline'].includes(code)) return 'offline';
  if (['unknown_command','unsupported'].includes(code)) return 'unsupported';
  return 'error';
}
/** Shared live streams; hidden entries hold no remote subscription or timer. */
export class TemplateCoordinator {
  private scopes = new WeakMap<object, Map<string, Entry>>();
  observe(scope: object, key: string, subscribe: TemplateSubscribe, listener: Subscriber['listener'], options: { visible?: boolean } = {}): TemplateObservation {
    let entries = this.scopes.get(scope); if (!entries) this.scopes.set(scope, entries = new Map());
    let entry = entries.get(key);
    if (!entry) { entry = { subscribers: new Set(), snapshot: Object.freeze({status:'loading',stale:false}), subscribe, generation:0,running:false }; entries.set(key,entry); }
    const current = entry; current.subscribe = subscribe;
    const subscriber = { visible: options.visible !== false, listener }; current.subscribers.add(subscriber);
    let released = false;
    const active = () => [...current.subscribers].some(sub => sub.visible);
    const tell = (sub: Subscriber) => { try { sub.listener(current.snapshot); } catch { /* A detached view cannot break another card. */ } };
    const notify = () => { for (const sub of current.subscribers) if (sub.visible) tell(sub); };
    const stop = () => { current.generation++;current.running=false;const unsubscribe=current.unsubscribe;current.unsubscribe=undefined;stopSubscription(unsubscribe); };
    const start = () => {
      if (!active() || current.running) return;
      current.running=true;const generation=++current.generation;
      current.snapshot=Object.freeze({...current.snapshot,status:'loading',stale:current.snapshot.value!==undefined,error:undefined});notify();
      Promise.resolve().then(() => {
        if(generation!==current.generation||!active()) return undefined;
        return current.subscribe(snapshot => {
          if(generation!==current.generation||!active())return;
          current.snapshot=Object.freeze({...snapshot,stale:snapshot.status==='ready'?false:snapshot.value!==undefined||current.snapshot.value!==undefined,value:snapshot.status==='ready'?snapshot.value:current.snapshot.value});notify();
        });
      }).then(unsubscribe => {
        if(!unsubscribe)return;
        if(generation!==current.generation||!active())stopSubscription(unsubscribe);
        else current.unsubscribe=unsubscribe;
      },error=>{
        if(generation!==current.generation||!active())return;
        current.running=false;
        current.snapshot=Object.freeze({...current.snapshot,status:templateErrorStatus(error),stale:current.snapshot.value!==undefined,error:typeof(error as {message?:unknown})?.message==='string'?(error as Error).message:'Template subscription failed'});notify();
      });
    };
    if(subscriber.visible){tell(subscriber);start();}
    return {
      get snapshot(){return current.snapshot;},
      setVisible(visible){if(released||visible===subscriber.visible)return;subscriber.visible=visible;if(!active())stop();else if(visible){tell(subscriber);start();}},
      retry(){if(released||!subscriber.visible)return;stop();start();},
      release(){if(released)return;released=true;current.subscribers.delete(subscriber);if(!active())stop();if(!current.subscribers.size){current.subscribe=async()=>()=>{};entries!.delete(key);}},
    };
  }
}
/** Canonical JSON preserves array order and shares equivalent variable objects. */
export function templateKey(spec: DisplayTemplateSpec): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])) : value;
  return JSON.stringify([spec.template,canonical(spec.variables??{})]);
}
const colors=new Set(['transparent','currentcolor','black','white','red','green','blue','yellow','orange','purple','pink','gray','grey','brown','cyan','magenta','lime','teal','navy','olive','maroon','silver','aqua','fuchsia','rebeccapurple']);
export function normalizeTemplateOutput(field: DisplayTemplateField, value: unknown): string | boolean {
  if(field==='visible') {
    if(typeof value==='boolean')return value;
    if(typeof value==='number'&&(value===0||value===1))return value===1;
    if(typeof value==='string'&&['true','false','on','off','1','0','yes','no'].includes(value.trim().toLowerCase()))return ['true','on','1','yes'].includes(value.trim().toLowerCase());
    throw Error('Visibility template must return a boolean.');
  }
  if(!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw Error('Display template must return text or a scalar value.');
  const text=String(value);
  if(field==='name'||field==='state')return text;
  if(field==='icon'&&/^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(text.trim()))return text.trim();
  if(field==='picture'&&!/[\\\r\n]/.test(text)&&(/^https?:\/\/[^\s]+$/i.test(text)||(text.startsWith('/')&&!text.startsWith('//'))))return text;
  if(field==='color'){
    const color=text.trim();const syntax=/^#(?:[a-f0-9]{3,4}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(color)||colors.has(color.toLowerCase())||/^(?:rgb|rgba|hsl|hsla)\([\d.,%+\-\s/]+\)$/i.test(color);
    if(syntax&&(typeof CSS==='undefined'||CSS.supports('color',color)))return color;
  }
  throw Error(`Invalid ${field} template output.`);
}
export function displayTemplateSnapshot(field: DisplayTemplateField, snapshot: TemplateSnapshot): DisplayTemplateSnapshot {
  if(snapshot.status!=='ready')return {...snapshot,value:undefined};
  try{return {...snapshot,value:normalizeTemplateOutput(field,snapshot.value)};}
  catch(error){return {status:'error',stale:false,error:(error as Error).message};}
}
