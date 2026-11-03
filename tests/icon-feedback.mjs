import assert from 'node:assert/strict';
import { load } from './load-ts.mjs';

const sdk={SingletonAction:class{},action:()=>x=>x,logger:{createScope:()=>({info(){},warn(){},error(){}})},settings:{getGlobalSettings:async()=>({}),onDidReceiveGlobalSettings(){}},ui:{onSendToPlugin(){}}};
const {SteamScroll}=load('src/actions/steamscroll.ts',{
    '@elgato/streamdeck':{...sdk,default:sdk},
    '../utils/steam-location':{findSteamDirectory:async()=>'',clearSteamLocationCache(){}},
    '../utils/steam-games':{getSteamGamesWithTypes:async()=>[]},
    '../utils/battlenet-games':{discoverBattleNetGames:async()=>({games:[],warnings:[]})},
    '../utils/epic-games':{discoverEpicGames:async()=>({games:[],warnings:[]}),epicRoot:()=>''},
    '../utils/epic-icons':{EPIC_ICON_FALLBACK:'fallback',getEpicIcon:async exe=>`icon:${exe}`}
});

for (const count of [1,2]) {
    const action=new SteamScroll('epic');
    const key=JSON.stringify(['C:/steam',['epic']]);
    const games=Array.from({length:count},(_,i)=>({appid:`epic:${i}`,name:`Game ${i}`,type:'game',icon:'fallback',executable:`game-${i}.exe`}));
    action.gamesCache.set(key,games);
    let feedback;
    const context={dialAction:{setFeedback:async value=>{feedback=value;}},steamDir:'C:/steam',libraries:['epic'],filteredGames:games,currentIndex:0};
    action.contexts.set('dial',context);
    action.loadGameIcons(key,games);
    await new Promise(resolve=>setTimeout(resolve,0));
    const expectedPrev=count===1?'icon:game-0.exe':'icon:game-1.exe';
    assert.equal(feedback.prevGameIcon.value,expectedPrev);
    assert.equal(feedback.currentGameIcon.value,'icon:game-0.exe');
    assert.equal(feedback.nextGameIcon.value,expectedPrev);
}
console.log('PASS: progressive icon feedback fills previous/current/next slots for one- and two-game libraries.');
