import {test,expect} from '@playwright/test';import {kitchenFixture} from '../fixtures/kitchen';
test.beforeEach(async({page})=>{await page.goto('/demo/index.html');await page.waitForFunction(()=>customElements.get('navet-composition-card'));await page.evaluate(async fixture=>{
 const w=window as any;w.recipeHost={...fixture,async callService(...args:unknown[]){(w.recipeEffects??=[]).push(args);}};
 const Owner=customElements.get('navet-composition-card') as any;await Owner.getConfigElement();
 w.mountRecipe=(config:unknown)=>{w.recipeSource=config;const card=document.createElement('navet-light-card') as any;card.id='recipe-card';card.setConfig({type:'custom:navet-light-card',...(config as object)});card.hass=w.recipeHost;document.querySelector('main')!.prepend(card);w.recipeCard=card;};
 },kitchenFixture);});
test('standalone references resolve variables while saved source retains reusable fields',async({page})=>{
 await page.evaluate(()=>{(window as any).mountRecipe({definitions:{light:{variables:{entity:'light.kitchen_ceiling'},config:{entity:'${entity}',name:'Reusable room light'}}},use:['light']});});
 const card=page.locator('#recipe-card');await expect(card).toContainText('Reusable room light');
 expect(await page.evaluate(()=>(window as any).recipeSource.use)).toEqual(['light']);
 await card.getByRole('button',{name:/^(On|Off)$/}).first().click();await expect.poll(()=>page.evaluate(()=>(window as any).recipeEffects?.length??0)).toBe(1);expect(await page.evaluate(()=>(window as any).recipeEffects[0][3].entity_id)).toBe('light.kitchen_ceiling');
});
test('visual named definitions, ordered references, typed variables and materialize preserve foreign fields',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{const editor=document.createElement('navet-recipes-editor') as any;editor.id='recipe-editor';editor.hass=(window as any).recipeHost;editor.config={type:'custom:navet-button-card',foreign:{keep:true}};editor.addEventListener('recipes-config-changed',(event:any)=>{(window as any).recipeEdited=event.detail.config;editor.config=event.detail.config;});document.querySelector('main')!.prepend(editor);});
 const editor=page.locator('#recipe-editor');await editor.getByLabel('New definition name').fill('welcome');await editor.getByRole('button',{name:'Create definition',exact:true}).click();await expect(editor.getByLabel('New definition name')).toHaveValue('');
 await editor.getByLabel('Use definitions: add reference').selectOption('welcome');await editor.getByRole('button',{name:'Add variable',exact:true}).first().click();await editor.getByLabel('Card variables: variable1 name').fill('count');await editor.getByLabel('Card variables: variable1 name').dispatchEvent('change');await editor.getByLabel('Card variables: count type').selectOption('number');await editor.getByLabel('Card variables: count value').fill('4');await editor.getByLabel('Card variables: count value').dispatchEvent('change');
 expect(await page.evaluate(()=>(window as any).recipeEdited)).toMatchObject({use:['welcome'],variables:{count:4},foreign:{keep:true}});
 await editor.getByRole('button',{name:'Export definitions',exact:true}).click();expect(JSON.parse(await editor.getByLabel('Definitions export JSON').inputValue())).toHaveProperty('welcome');
 expect(await editor.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);await editor.screenshot({path:info.outputPath('recipes-editor-phone.png')});
 await editor.getByRole('button',{name:'Materialize this card',exact:true}).click();expect(await page.evaluate(()=>(window as any).recipeEdited.use)).toBeUndefined();expect(await page.evaluate(()=>(window as any).recipeEdited.variables)).toBeUndefined();expect(await page.evaluate(()=>(window as any).recipeEdited.foreign)).toEqual({keep:true});
});
test('import validates cycles and retains useful invalid drafts without replacing saved source',async({page})=>{
 await page.evaluate(()=>{const editor=document.createElement('navet-recipes-editor') as any;editor.id='recipe-editor';editor.hass=(window as any).recipeHost;editor.config={type:'custom:navet-button-card',definitions:{base:{config:{name:'Base'}}},use:['base']};editor.addEventListener('recipes-config-changed',(event:any)=>(window as any).recipeEdited=event.detail.config);document.querySelector('main')!.prepend(editor);});
 const editor=page.locator('#recipe-editor');await editor.getByText('Import definitions',{exact:true}).click();await editor.getByLabel('Definitions import JSON').fill(JSON.stringify({base:{extends:['base'],config:{}}}));await editor.getByRole('button',{name:'Replace definitions from import'}).click();await expect(editor.getByRole('alert')).toContainText('cycle');expect(await page.evaluate(()=>(window as any).recipeEdited)).toBeUndefined();
 await editor.getByLabel('Definitions import JSON').fill(JSON.stringify({base:{config:{name:'Imported',foreign:{kept:true}}}}));await editor.getByRole('button',{name:'Replace definitions from import'}).click();expect(await page.evaluate(()=>(window as any).recipeEdited.definitions.base.config.foreign)).toEqual({kept:true});
});
