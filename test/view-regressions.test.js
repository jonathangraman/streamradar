import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as core from '../core.js';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('returning from details retains the loaded home state and restores the scroll position',()=>{
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{scrollTop:0,querySelector:()=>null});return nodes.get(id);};let fetches=0,renders=0;
 const context=vm.createContext({$,route:{view:'detail'},historyDepth:1,homeLoaded:true,homeScroll:450,page:6,results:[1,2,3],history:{pushState:()=>{}},detailSequence:core.createSequence(),actorSequence:core.createSequence(),document:{querySelectorAll:()=>[]},requestAnimationFrame:fn=>fn(),refreshHome:()=>fetches++,renderActiveHome:()=>renders++});
 vm.runInContext(source.slice(source.indexOf('function showRoute('),source.indexOf('function goBack(')),context);context.showRoute({view:'home'},false);
 assert.equal(fetches,0);assert.equal(renders,1);assert.equal(context.page,6);assert.equal($('home-scroll').scrollTop,450);
});
test('an account sync refresh renders the current search instead of old catalogue cards',()=>{
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:id==='home-search-input'?'Dracula':''});return nodes.get(id);};
 const context=vm.createContext({...core,$,metadataEpoch:0,accountState:{epoch:0},library:core.emptyLibrary(),watchMetadata:new Map(),items:new Map(),similarSeed:null,route:{view:'home'},homeLoaded:true,results:[{id:2,type:'movie',title:'Wrong old catalogue',date:'2020-01-01'}],searchResults:[{id:1,type:'movie',title:'Dracula',date:'2025-01-01'}],region:'US',searchOfferText:new Map(),visibleTitles:x=>x,remember:x=>x,poster:()=>'',esc:core.escapeHTML,card:x=>x.title});
 vm.runInContext(source.slice(source.indexOf('function renderActiveHome('),source.indexOf('let episodeSequence=')),context);
 const start=source.indexOf('setLibrary:next=>{')+'setLibrary:'.length,end=source.indexOf('\n}});',start)+2;
 vm.runInContext('var synced='+source.slice(start,end),context);context.synced(core.emptyLibrary());
 assert.match($('grid').innerHTML,/Dracula/);assert.match($('grid').innerHTML,/search-result/);assert.doesNotMatch($('grid').innerHTML,/Wrong old catalogue/);
});
test('finale badge uses service-season guard and does not treat cancellation as an intentional series finale',()=>{
 const context=vm.createContext({...core,today:()=> '2026-10-29'});vm.runInContext(source.slice(source.indexOf('function finaleLabel('),source.indexOf('function posterTags(')),context);
 const item={type:'tv',catalogService:'netflix',networks:[{id:6}],status:'Canceled',last_episode_to_air:{season_number:2,episode_number:10,air_date:'2026-10-28'},seasons:[{season_number:2,episode_count:10}]};
 assert.equal(context.finaleLabel(item),null);assert.equal(context.finaleLabel({...item,catalogService:'all'}).text,'SEASON FINALE');
});
