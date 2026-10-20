import { test, expect } from '@playwright/test';
import { kitchenFixture } from '../fixtures/kitchen';

test('100 simulated room cycles release controls, navigation and subscriptions across reconnect',async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/demo/index.html');
  await page.waitForFunction(()=>Boolean(customElements.get('navet-room-card')));
  const result=await page.evaluate(async fixture=>{
    const w=window as any;
    const calls:unknown[][]=[];
    const details:string[]=[];
    const requests={forecast:0,history:0};
    let subscribed=0,released=0,reconnects=0,relevantUpdates=0,maxClosedControls=0,maxOpenWidgets=0;
    const card=document.createElement('navet-room-card') as any;
    card.id='room-soak';
    const config={type:'custom:navet-room-card',config_version:2,area:'kitchen',name:'Kitchen lifecycle fixture',panel_id:'#room-soak',room:{membership:{mode:'area'}}};
    let host:any={...fixture,
      async callService(...args:unknown[]){calls.push(args);},
      async callWS(){requests.forecast++;return {};},
      async callApi(){requests.history++;return [];},
    };
    const context=(event:any)=>{
      if(event.target!==card)return;
      subscribed++;
      event.callback(host.states,()=>released++);
    };
    const detail=(event:any)=>{if(event.composedPath().includes(card))details.push(event.detail.entityId);};
    document.addEventListener('context-request',context);
    document.addEventListener('hass-more-info',detail);
    card.setConfig(config);
    card.hass=host;
    document.querySelector('#cards')!.append(card);
    await card.updateComplete;
    const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
    const settle=async()=>{await card.updateComplete;await Promise.resolve();await card.updateComplete;};
    const controls=()=>Array.from(card.shadowRoot.querySelectorAll('button')).find((button:any)=>button.getAttribute('aria-label')==='Controls') as HTMLButtonElement;
    const widgets='navet-light-color,navet-climate-range,navet-cover-tilt';
    for(let cycle=0;cycle<100;cycle++){
      const opener=controls();
      assert(opener,'Room controls opener exists');
      opener.focus();opener.click();
      await settle();
      const dialog=card.shadowRoot.querySelector('dialog') as HTMLDialogElement;
      assert(dialog.open,`Cycle ${cycle}: room dialog opened`);
      assert(location.hash==='#room-soak',`Cycle ${cycle}: hash registered`);
      assert(card.shadowRoot.querySelectorAll('.room-control').length===7,`Cycle ${cycle}: expected seven members`);
      maxOpenWidgets=Math.max(maxOpenWidgets,card.shadowRoot.querySelectorAll(widgets).length);
      if(cycle%10===0){
        const old=host.states['sensor.kitchen_temperature'];
        const value=(21.3+cycle/100).toFixed(1);
        host={...host,states:{...host.states,'sensor.kitchen_temperature':{...old,state:value}}};
        card.hass=host;await settle();relevantUpdates++;
        const row=Array.from(card.shadowRoot.querySelectorAll('.room-row')).find((row:any)=>row.textContent.includes('Room temperature')) as HTMLElement;
        assert(row.textContent?.includes(value),`Cycle ${cycle}: relevant state update rendered`);
      }
      if(cycle===0||cycle===51){
        const coffee=Array.from(card.shadowRoot.querySelectorAll('.room-control')).find((row:any)=>row.textContent.includes('Espresso machine')) as HTMLElement;
        const toggle=coffee.querySelector('.inline-actions button') as HTMLButtonElement;
        assert(toggle&&!toggle.disabled,`Cycle ${cycle}: live switch control exists`);
        toggle.click();await settle();
        assert(calls.length===(cycle===0?1:2),`Cycle ${cycle}: exactly one command per click`);
      }
      // Traversing our popup history entry completes on popstate, after Lit's microtasks.
      const navigationComplete = new Promise<void>((resolve,reject)=>{
        const timeout=setTimeout(()=>{window.removeEventListener('popstate',navigated);reject(new Error(`Cycle ${cycle}: room history traversal timed out`));},1000);
        const navigated=()=>{clearTimeout(timeout);resolve();};
        window.addEventListener('popstate',navigated,{once:true});
      });
      if(cycle===75){
        const row=Array.from(card.shadowRoot.querySelectorAll('.room-row')).find((row:any)=>row.textContent.includes('Room temperature')) as HTMLButtonElement;
        row.click();
      }else (dialog.querySelector('.dialog-header button') as HTMLButtonElement).click();
      await navigationComplete;
      await settle();
      assert(!dialog.open,`Cycle ${cycle}: native dialog closed`);
      assert(location.hash==='',`Cycle ${cycle}: room hash cleared`);
      assert(card.shadowRoot.activeElement===opener,`Cycle ${cycle}: focus restored`);
      const retained=card.shadowRoot.querySelectorAll('.room-control,'+widgets).length;
      maxClosedControls=Math.max(maxClosedControls,retained);
      assert(retained===0,`Cycle ${cycle}: closed controls removed`);
      assert(calls.length===(cycle>=51?2:1),`Cycle ${cycle}: no spontaneous/duplicate commands`);
      assert(!card.dataObservation,`Cycle ${cycle}: no room data observer retained`);
      if(cycle===50){
        card.remove();
        assert(released===1,'Disconnect released the first context subscription');
        history.replaceState(null,'','#room-soak');window.dispatchEvent(new Event('location-changed'));
        await settle();
        assert(!dialog.open&&!card.roomOpen,'Detached navigation does not reopen the room');
        history.replaceState(null,'',location.pathname+location.search);
        document.querySelector('#cards')!.append(card);await settle();reconnects++;
        assert(card.shadowRoot.querySelectorAll('.room-control').length===0,'Reconnect starts with controls closed');
      }
    }
    card.remove();
    document.removeEventListener('context-request',context);
    document.removeEventListener('hass-more-info',detail);
    await settle();
    return {fixture:'simulated kitchen v2',cycles:100,reconnects,relevantUpdates,subscribed,released,maxClosedControls,maxOpenWidgets,commands:calls.length,details,requests,finalHash:location.hash,finalDialogOpen:!!card.shadowRoot.querySelector('dialog[open]'),finalDataObserver:!!card.dataObservation};
  },kitchenFixture);
  expect(result).toEqual({fixture:'simulated kitchen v2',cycles:100,reconnects:1,relevantUpdates:10,subscribed:2,released:2,maxClosedControls:0,maxOpenWidgets:1,commands:2,details:['sensor.kitchen_temperature'],requests:{forecast:0,history:0},finalHash:'',finalDialogOpen:false,finalDataObserver:false});
  expect(errors).toEqual([]);
  await info.attach('room-lifecycle-100-cycles.json',{body:JSON.stringify({...result,unhandledErrors:errors},null,2),contentType:'application/json'});
});
