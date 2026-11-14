import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveRecipes,recipeDefinitions,type RecipeDefinitions} from '../src/config/recipes';
test('recipes resolve ordered multiple inheritance with typed variables and preserve source',()=>{
 const source={definitions:{base:{variables:{entity:'light.base',enabled:true},config:{entity:'${entity}',name:'Light ${entity}',appearance:{color:'orange',radius:24},value:'${enabled}'}},override:{extends:['base'],config:{appearance:{radius:12},name:'Custom'}}},use:['base','override'],variables:{entity:'light.local',enabled:false},appearance:{accent:'blue'}};
 const before=structuredClone(source),resolved=resolveRecipes(source);assert.equal(resolved.entity,'light.local');assert.equal(resolved.name,'Custom');assert.equal(resolved.value,false);assert.deepEqual(resolved.appearance,{color:'orange',radius:12,accent:'blue'});assert.equal(resolved.use,undefined);assert.equal(resolved.variables,undefined);assert.deepEqual(source,before);(resolved.appearance as any).radius=99;assert.equal(source.appearance.accent,'blue');
});
test('recipes merge explicit stable IDs only in Navet root lists; opaque arrays replace',()=>{
 const resolved=resolveRecipes({definitions:{base:{config:{chips:[{id:'a',entity:'light.a',foreign:{keep:true}},{id:'b',name:'B'}],cards:[{type:'custom:other',id:'a',options:[1,2]}],foreign:[{id:'a',x:1}]}}},use:['base'],chips:[{id:'a',name:'A'},{id:'c',name:'C'}],cards:[{type:'tile',id:'a'}],foreign:[{id:'a',y:2}]});
 assert.deepEqual(resolved.chips,[{id:'a',entity:'light.a',foreign:{keep:true},name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}]);assert.deepEqual(resolved.cards,[{type:'tile',id:'a'}]);assert.deepEqual(resolved.foreign,[{id:'a',y:2}]);
});
test('local scope shadows inherited definitions without mutation and nested cards retain references',()=>{
 const inherited:RecipeDefinitions={base:{config:{name:'Parent'}}};const source={definitions:{base:{config:{name:'Local'}}},use:['base'],cards:[{type:'custom:navet-button-card',use:['base'],variables:{label:'Child'},name:'${label}'}]};
 assert.equal(resolveRecipes(source,inherited).name,'Local');assert.deepEqual((resolveRecipes(source,inherited).cards as any[])[0],source.cards[0]);assert.equal(inherited.base.config.name,'Parent');assert.equal(recipeDefinitions(source,inherited).base.config.name,'Local');
});
test('recipe diagnostics reject missing names, cycles, missing variables and unsafe JSON',()=>{
 assert.throws(()=>resolveRecipes({use:['missing']}),/missing definition/);assert.throws(()=>resolveRecipes({definitions:{a:{extends:['b'],config:{}},b:{extends:['a'],config:{}}}}),/inheritance cycle/);
 assert.throws(()=>resolveRecipes({use:['a'],definitions:{a:{config:{name:'${unknown}'}}}}),/missing variable/);
 assert.throws(()=>resolveRecipes(JSON.parse('{"definitions":{"__proto__":{"config":{}}}}')),/unsafe key/);assert.throws(()=>resolveRecipes({variables:{a:{}}}),/scalar/);assert.throws(()=>resolveRecipes({definitions:{a:{config:{nested:JSON.parse('{"constructor":1}')}}}}),/unsafe key/);
 const source:Record<string,unknown>={};source.circular=source;assert.throws(()=>resolveRecipes(source),/nesting or node/);assert.throws(()=>resolveRecipes({get unsafe(){throw new Error('Getter executed');}}),/accessor/);
});
test('plain configs retain literal placeholders; exact scalar placeholders stay typed without recursive evaluation',()=>{
 assert.deepEqual(resolveRecipes({name:'Literal ${thing}'}),{name:'Literal ${thing}'});
 const result=resolveRecipes({variables:{count:3,missing:null,literal:'${not_evaluated}'},name:'Count ${count}',value:'${count}',nullable:'${missing}',literal:'${literal}'});assert.deepEqual(result,{name:'Count 3',value:3,nullable:null,literal:'${not_evaluated}'});
});
test('recipes reject deep inheritance, preserve foreign fields and do not merge duplicate IDs',()=>{
 const definitions:RecipeDefinitions={};for(let index=0;index<34;index++)definitions[`d${index}`]={config:{},...(index?{extends:[`d${index-1}`]}:{})};
 assert.throws(()=>resolveRecipes({definitions,use:['d33']}),/32 levels/);
 const result=resolveRecipes({definitions:{base:{config:{chips:[{id:'a',name:'old'}],foreign:{nested:['opaque']}}}},use:['base'],chips:[{id:'a',name:'one'},{id:'a',name:'two'}]});assert.deepEqual(result.chips,[{id:'a',name:'one'},{id:'a',name:'two'}]);assert.deepEqual(result.foreign,{nested:['opaque']});
});
test('prototype names cannot become implicit definitions and an explicit empty list clears inherited members',()=>{
 assert.throws(()=>resolveRecipes({use:['toString']}),/missing definition/);
 assert.deepEqual(resolveRecipes({definitions:{base:{config:{chips:[{id:'a',name:'A'}]}}},use:['base'],chips:[]}).chips,[]);
});
test('foreign and Navet child objects keep independent placeholder contexts during parent interpolation',()=>{
 const cards=[{type:'custom:button-card',label:'`${entity}`',variables:{own:'value'}},{type:'custom:navet-button-card',name:'${child}',variables:{child:'Child'}}];
 const resolved=resolveRecipes({variables:{entity:'parent'},name:'${entity}',cards});assert.equal(resolved.name,'parent');assert.deepEqual(resolved.cards,cards);
});
