export type RecipeScalar=string|number|boolean|null;
export interface RecipeDefinition { extends?:string[]; variables?:Record<string,RecipeScalar>;config:Record<string,unknown>;[key:string]:unknown }
export type RecipeDefinitions=Record<string,RecipeDefinition>;
export interface RecipeSource {definitions?:RecipeDefinitions;use?:string[];variables?:Record<string,RecipeScalar>}
const forbidden=new Set(['__proto__','constructor','prototype']);
const keyed=new Set(['chips','sub_controls','sub_control_groups']);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function fail(message:string):never{throw new Error(`Reusable configuration: ${message}`);}
function safeKey(key:string){if(forbidden.has(key))fail(`unsafe key "${key}".`);}
function copy(value:unknown,depth=0,budget={nodes:0}):unknown {
  if(depth>48||++budget.nodes>50000)fail('configuration exceeds the nesting or node safety limit.');
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
  if(Array.isArray(value))return value.map(item=>copy(item,depth+1,budget));
  if(record(value)){
    if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)fail('only JSON configuration objects are supported.');
    const result:Record<string,unknown>={};
    for(const key of Object.keys(value)){safeKey(key);const descriptor=Object.getOwnPropertyDescriptor(value,key)!;if(!('value'in descriptor))fail('accessor properties are unsupported.');if(descriptor.value!==undefined)result[key]=copy(descriptor.value,depth+1,budget);}
    return result;
  }
  fail('only JSON configuration values are supported.');
}
function variables(value:unknown,label:string):Record<string,RecipeScalar>{
  if(value===undefined)return {};if(!record(value))fail(`${label} variables must be an object.`);
  for(const [name,item]of Object.entries(value)){safeKey(name);if(!/^[A-Za-z_][\w.-]*$/.test(name))fail(`invalid variable name "${name}".`);if(item!==null&&!['string','boolean','number'].includes(typeof item)||typeof item==='number'&&!Number.isFinite(item))fail(`variable "${name}" must be a scalar.`);}
  return value as Record<string,RecipeScalar>;
}
function references(value:unknown,label:string):string[]{if(value===undefined)return [];if(!Array.isArray(value)||value.some(item=>typeof item!=='string'||!item.trim()))fail(`${label} must be a list of names.`);return value as string[];}
function definitions(value:unknown):RecipeDefinitions{
  if(value===undefined)return {};if(!record(value))fail('definitions must be an object.');
  for(const [name,definition]of Object.entries(value)){safeKey(name);if(!name.trim()||!record(definition)||!record(definition.config))fail(`definition "${name}" needs a configuration object.`);references(definition.extends,`definition "${name}" extends`);variables(definition.variables,`definition "${name}"`);}
  return value as RecipeDefinitions;
}
/** Local HA-owned scope; a child's definitions shadow inherited names as whole definitions. */
export function recipeDefinitions(source:Record<string,unknown>,inherited:RecipeDefinitions={}):RecipeDefinitions{
  const parent=definitions(copy(inherited)),local=definitions(source.definitions===undefined?undefined:copy(source.definitions));return {...parent,...local};
}
export function hasRecipeReferences(source:Record<string,unknown>):boolean{return source.use!==undefined||source.variables!==undefined||source.definitions!==undefined;}
/** Materialize exactly one card. No source mutation, evaluation, registries or host access. */
export function resolveRecipes(source:Record<string,unknown>,inherited:RecipeDefinitions={}):Record<string,unknown>{
  if(!record(source))fail('card configuration must be an object.');
  const input=copy(source) as Record<string,unknown>,scope=recipeDefinitions(input,inherited);
  let operations=0;
  const work=()=>{if(++operations>100000)fail('inheritance expansion exceeds the safety limit.');};
  const merge=(base:unknown,patch:unknown,path:string[]=[],depth=0):unknown=>{
    work();if(depth>48)fail('merged configuration exceeds the nesting safety limit.');
    if(record(base)&&record(patch)){const result={...base};for(const [key,value]of Object.entries(patch)){safeKey(key);result[key]=merge(result[key],value,[...path,key],depth+1);}return result;}
    if(path.length===1&&keyed.has(path[0])&&Array.isArray(base)&&Array.isArray(patch)){
      if(!patch.length)return [];
      const ids=(items:unknown[])=>items.every(item=>record(item)&&typeof item.id==='string'&&!!item.id)&&new Set(items.map(item=>(item as Record<string,unknown>).id)).size===items.length;
      if(ids(base)&&ids(patch)){const result=[...base],indices=new Map(base.map((item,index)=>[(item as Record<string,unknown>).id,index]));for(const item of patch){work();const id=(item as Record<string,unknown>).id,index=indices.get(id);if(index===undefined){indices.set(id,result.length);result.push(item);}else result[index]=merge(result[index],item,[...path,'item'],depth+1);}return result;}
    }
    return patch;
  };
  type Resolved={config:Record<string,unknown>;variables:Record<string,RecipeScalar>;depth:number};
  const cache=new Map<string,Resolved>(),visiting=new Set<string>();
  const resolve=(name:string,chain:string[]=[]):Resolved=>{
    work();safeKey(name);if(chain.length>=32)fail('inheritance exceeds 32 levels.');if(visiting.has(name))fail(`inheritance cycle: ${[...chain,name].join(' → ')}.`);
    const cached=cache.get(name);if(cached)return cached;const definition=Object.hasOwn(scope,name)?scope[name]:undefined;if(!definition)fail(`missing definition "${name}".`);
    visiting.add(name);let result:Resolved={config:{},variables:{},depth:1};
    for(const parent of references(definition.extends,`definition "${name}" extends`)){const resolved=resolve(parent,[...chain,name]);result={config:merge(result.config,resolved.config) as Record<string,unknown>,variables:{...result.variables,...resolved.variables},depth:Math.max(result.depth,resolved.depth+1)};}
    result={config:merge(result.config,definition.config) as Record<string,unknown>,variables:{...result.variables,...variables(definition.variables,`definition "${name}"`)},depth:result.depth};if(result.depth>32)fail('inheritance exceeds 32 levels.');
    visiting.delete(name);cache.set(name,result);return result;
  };
  // Diagnose broken definitions even before they are selected; the editor retains invalid drafts locally.
  for(const name of Object.keys(scope))resolve(name);
  let merged:Record<string,unknown>={},defaults:Record<string,RecipeScalar>={};
  for(const name of references(input.use,'use')){const resolved=resolve(name);merged=merge(merged,resolved.config) as Record<string,unknown>;defaults={...defaults,...resolved.variables};}
  merged=merge(merged,input) as Record<string,unknown>;
  const values={...defaults,...variables(input.variables,'card')};
  const interpolate=(value:unknown,root=false):unknown=>{
    work();if(typeof value==='string'){
      const exact=value.match(/^\$\{([A-Za-z_][\w.-]*)\}$/);if(exact){if(!Object.hasOwn(values,exact[1]))fail(`missing variable "${exact[1]}".`);return values[exact[1]];}
      return value.replace(/\$\{([A-Za-z_][\w.-]*)\}/g,(_match,name:string)=>{if(!Object.hasOwn(values,name))fail(`missing variable "${name}".`);return String(values[name]);});
    }
    if(Array.isArray(value))return value.map(item=>interpolate(item));
    if(record(value)){
      // A nested card owns its own variable context. Child hosts resolve it explicitly.
      if(!root&&typeof value.type==='string')return value;
      return Object.fromEntries(Object.entries(value).filter(([key])=>!root||!['use','variables','definitions'].includes(key)).map(([key,item])=>[key,interpolate(item)]));
    }
    return value;
  };
  const output=(input.use!==undefined||input.variables!==undefined?interpolate(merged,true):{...merged}) as Record<string,unknown>;delete output.use;delete output.variables;delete output.definitions;
  if(Object.keys(scope).length)output.definitions=scope;
  return copy(output) as Record<string,unknown>;
}
