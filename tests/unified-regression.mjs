import assert from 'node:assert/strict';
import {load} from './load-ts.mjs';
const helpers=load('src/utils/libraries.ts');
assert.deepEqual(Array.from(helpers.selectedLibraries(undefined,'all')),['steam','epic','battlenet']);
assert.equal(helpers.selectedLibraries([],'steam').length,0);
const globals={customFilters:[{id:'s',name:'Legacy Steam',appids:['1'],updatedAt:''}],epicCustomFilters:[{id:'s',name:'Legacy Epic',appids:['epic:n:i:a'],updatedAt:''}],gameCollections:[{id:'mixed',name:'Mixed',appids:['1','epic:n:i:a','battlenet:d3:x'],updatedAt:''}]};
const sdk={SingletonAction:class{},action:()=>x=>x,logger:{createScope:()=>({info(){},warn(){},error(){}})},settings:{getGlobalSettings:async()=>globals,onDidReceiveGlobalSettings(){}},ui:{onSendToPlugin(){},sendToPropertyInspector:async r=>replies.push(r)}};
const steam=[{appid:'1',name:'A game',type:'game',icon:''},{appid:'2',name:'B tool',type:'tool',icon:''},{appid:'3',name:'C demo',type:'demo',icon:''}];
const epic=[{appid:'epic:n:i:a',name:'D epic',type:'game',icon:''}];
const bnet=[{appid:'battlenet:d3:x',name:'E bnet',type:'game',icon:'',productCode:'d3',launchId:'D3'}];
const launches=[],replies=[],timers=[];let epicError=false,launchError=false,bnetDiscoveryOptions;
const {SteamScroll}=load('src/actions/steamscroll.ts',{
    '@elgato/streamdeck':{...sdk,default:sdk},'fs':{existsSync:()=>true},
    '../utils/steam-location':{findSteamDirectory:async p=>p||'C:/Program Files (x86)/Steam',clearSteamLocationCache(){}},'../utils/steam-games':{getSteamGamesWithTypes:async()=>steam},
    '../utils/epic-games':{epicRoot:()=>'/epic',discoverEpicGames:async()=>{if(epicError)throw Error('broken');return {games:epic,warnings:[]};},launchEpicGame:async g=>launches.push(g.appid)},
    '../utils/battlenet-games':{discoverBattleNetGames:async options=>{bnetDiscoveryOptions=options;return {games:bnet,warnings:[]};},launchBattleNetGame:async g=>{if(launchError)throw Error('launcher unavailable');launches.push(g.appid);}},
    'node:child_process':{execFile:(file,args,options,done)=>{launches.push(options.env.GAME_SCROLLER_STEAM_URI);done(null);}}
},{setTimeout:(callback,delay)=>{const timer={callback,delay,unref(){},cancelled:false};timers.push(timer);return timer;},clearTimeout:timer=>{timer.cancelled=true;}});
const action=new SteamScroll('all');
const dial=id=>({id,saved:{},writes:0,async getSettings(){return this.saved;},async setSettings(s){this.saved=s;this.writes++;},async setFeedback(f){this.feedback=f;}});
const a=dial('a'),b=dial('b');
await action.onWillAppear({action:a,payload:{settings:{filteroptions:['tool'],libraries:['steam','epic','battlenet'],futureField:42}}});
assert.equal(bnetDiscoveryOptions.icons,false,'Battle.net discovery returns metadata without serial icon extraction');
assert.deepEqual(Array.from(action.contexts.get('a').filteredGames,g=>g.appid),['2','epic:n:i:a','battlenet:d3:x']);
await action.onWillAppear({action:b,payload:{settings:{filteroptions:['game'],libraries:['steam']}}});
assert.deepEqual(Array.from(action.contexts.get('b').filteredGames,g=>g.appid),['1','3']);
await action.setContext('a',a,{filteroptions:['game'],libraries:['steam','epic','battlenet'],selectedCustomFilterId:'mixed',collectionSchema:1,futureField:42});
assert.equal(action.contexts.get('a').filteredGames.length,3);
await action.onDialRotate({action:a,payload:{ticks:1}});
assert.equal(a.saved.futureField,42);assert.equal(a.saved.libraries.length,3);assert.equal(a.saved.collectionSchema,1);
for(let i=0;i<3;i++){action.contexts.get('a').currentIndex=i;await action.onDialDown({action:a});}
assert.deepEqual(launches,['steam://rungameid/1','epic:n:i:a','battlenet:d3:x']);
await action.onDialDown({action:a});assert.equal(launches.length,3);
assert.equal(a.feedback.providerName.value,'Launching game');
assert.equal(a.feedback.prevGameIcon.value,'');
assert.equal(a.feedback.nextGameTitle.value,'');
const firstFrame=a.feedback.currentGameIcon.value;
assert.match(firstFrame,/^data:image\/svg\+xml;base64,/);
const frameTimer=timers.findLast(timer=>timer.delay===80&&!timer.cancelled);
await frameTimer.callback();await Promise.resolve();
assert.notEqual(a.feedback.currentGameIcon.value,firstFrame);
action.contexts.get('a').currentIndex=1;
for(const timer of timers.filter(timer=>timer.delay===3000&&!timer.cancelled)) timer.callback();
assert.equal(a.feedback.providerName.value,'Epic');
assert.equal(a.feedback.currentGameTitle.value,'D epic');
assert.equal(action.launchPending.size,0);
assert.equal(action.launchAnimations.size,0);
const gone=dial('gone');
await action.onWillAppear({action:gone,payload:{settings:{libraries:['battlenet']}}});
await action.onDialDown({action:gone});
const beforeDisappear=gone.feedback;
action.onWillDisappear({action:gone});
for(const timer of timers.splice(0).filter(timer=>!timer.cancelled)) await timer.callback();
assert.equal(gone.feedback,beforeDisappear);
assert.equal(action.launchAnimations.size,0);
await action.onWillAppear({action:gone,payload:{settings:{libraries:['battlenet']}}});
launchError=true;
await action.onDialDown({action:gone});
assert.equal(gone.feedback.providerName.value,'Launch failed');
assert.equal(gone.feedback.currentGameIcon.value,'');
assert.equal(action.launchAnimations.size,0);
for(const timer of timers.splice(0).filter(timer=>!timer.cancelled)) await timer.callback();
assert.equal(gone.feedback.providerName.value,'Battle.net');
launchError=false;
await action.onDialDown({action:gone});
await action.onDialRotate({action:gone,payload:{ticks:1}});
assert.equal(action.launchAnimations.size,0);
assert.equal(gone.feedback.providerName.value,'Battle.net');
for(const timer of timers.splice(0).filter(timer=>!timer.cancelled)) await timer.callback();
const writes=a.writes;await action.onDidReceiveSettings({action:a,payload:{settings:a.saved}});assert.equal(a.writes,writes);
await action.setContext('a',a,{filteroptions:['game'],libraries:[]});assert.equal(action.contexts.get('a').filteredGames.length,0);assert.equal(a.feedback.currentGameTitle.value,'Choose libraries');
await action.setContext('a',a,{filteroptions:['game'],libraries:['epic']});assert.equal(action.contexts.get('a').filteredGames.length,1);
epicError=true;
await action.handlePropertyInspectorMessage({action:a,payload:{__type:'request',id:'test',path:'public:/all-refresh'}});
assert(replies.at(-1).body.games.some(g=>g.appid==='1'));assert(replies.at(-1).body.games.some(g=>g.appid==='battlenet:d3:x'));assert.match(replies.at(-1).body.error,/epic library unavailable/);
assert.equal(action.contexts.get('b').filteredGames.length,2);
console.log('PASS: mixed libraries/collections, per-instance selection, Steam-only types, preserved settings, correct three-provider launch routing, repeat-press suppression, empty libraries and provider failure isolation. All launches mocked.');
