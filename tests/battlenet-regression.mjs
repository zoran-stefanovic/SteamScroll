import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {load} from './load-ts.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'game-scroller-bnet-'));
function v(n){const a=[];do{let b=n&127;n>>>=7;if(n)b|=128;a.push(b);}while(n);return Buffer.from(a);}
const field=(id,b)=>Buffer.concat([v(id*8+2),v(b.length),b]);
const str=(id,s)=>field(id,Buffer.from(s));
const flag=(id,b)=>Buffer.from([id*8,b?1:0]);
function record(code,dir,uid=code){return Buffer.concat([str(1,uid),str(2,code),field(3,str(1,dir)),field(4,field(1,Buffer.concat([flag(1,true),flag(2,true),flag(3,true)])))]);}
let registry=[],signed=true,running=true;const spawned=[];
const bnet=load('src/utils/battlenet-games.ts',{
    './epic-icons':{getEpicIcon:async()=> 'fixture-icon'},
    'node:child_process':{
        execFile:(file,args,options,done)=>{
            const script=args.at(-1);
            const output=script.includes('$keys=')?JSON.stringify(registry):script.includes('Get-AuthenticodeSignature')?JSON.stringify({status:signed?'Valid':'NotSigned',subject:'CN="Blizzard Entertainment, Inc.", O="Blizzard Entertainment, Inc.", C=US'}):running?'yes':'no';
            done(null,output);
        },
        spawn:(file,args,options)=>{spawned.push({file,args,options});const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}
    }
},{process:{...process,env:{...process.env,ProgramData:root}},setTimeout:(fn)=>{queueMicrotask(fn);return 0;}});
async function install(name,exe){const dir=path.join(root,name);await fs.mkdir(path.dirname(path.join(dir,exe)),{recursive:true});await fs.writeFile(path.join(dir,exe),'fixture, never executed');await fs.writeFile(path.join(dir,'.build.info'),'Active!DEC:1|Version!STRING:0\n1|fixture\n');await fs.mkdir(path.join(dir,'Data'));await fs.writeFile(path.join(dir,'Data','fixture'),'data');return dir;}
try {
    const d3=await install('Custom Games/D3','x64/Diablo III64.exe');
    const ptr=await install('Custom Games/D3 PTR','x64/Diablo III64.exe');
    const launcher=path.join(root,'Launcher');await fs.mkdir(launcher);await fs.writeFile(path.join(launcher,'Battle.net.exe'),'fixture, never executed');
    registry=[{name:'Battle.net',uid:'battle.net',installPath:launcher},{name:'Diablo III',uid:'diablo3',installPath:d3}];
    const db=path.join(root,'Battle.net/Agent/product.db');await fs.mkdir(path.dirname(db),{recursive:true});
    await fs.writeFile(db,Buffer.concat([field(1,record('agent',root)),field(1,record('d3',d3,'diablo3')),field(1,record('d3',d3,'diablo3')),field(1,record('d3t',ptr)),field(1,record('unknown',root)),field(1,record('fenris',path.join(root,'removed')))]));
    const result=await bnet.discoverBattleNetGames();
    assert.equal(result.games.length,2);assert(result.warnings.some(w=>w.includes('unknown')));
    const game=result.games.find(g=>g.productCode==='d3'),test=result.games.find(g=>g.productCode==='d3t');
    assert.equal(game.launchId,'D3');assert.equal(test.variant,'PTR');assert.equal(test.launchId,null);
    assert.deepEqual(Array.from(bnet.battleNetLaunchArgs(game)),['--exec=launch D3']);
    assert.throws(()=>bnet.battleNetLaunchArgs({...game,launchId:'D3 & calc'}));assert.throws(()=>bnet.battleNetLaunchArgs(test));
    assert.throws(()=>bnet.parseBattleNetDatabase(Buffer.from([10,255])));assert.throws(()=>bnet.parseBattleNetDatabase(Buffer.alloc(8*1024*1024+1)));
    assert(bnet.safeBattleNetPath('Z:\\Custom Games\\Game'));for(const p of ['\\\\server\\game','C:relative','C:\\a\\..\\evil.exe','C:\\a.exe:stream','C:\\x\n.exe'])assert(!bnet.safeBattleNetPath(p));
    await bnet.launchBattleNetGame(game);assert.equal(spawned.length,1);assert.equal(spawned[0].options.shell,false);assert.equal(spawned[0].file,path.join(launcher,'Battle.net.exe'));
    running=false;await bnet.launchBattleNetGame(game);assert.equal(spawned.length,3);assert.equal(spawned[1].args.length,0);assert.equal(spawned[2].args[0],'--exec=launch D3');
    signed=false;await assert.rejects(bnet.launchBattleNetGame(game),/trusted/);assert.equal(spawned.length,3);signed=true;
    registry=registry.filter(r=>r.name!=='Battle.net');await assert.rejects(bnet.launchBattleNetGame(game),/trusted/);assert.equal(spawned.length,3);
    await fs.writeFile(db,Buffer.from([10,255]));const fallback=await bnet.discoverBattleNetGames();assert.equal(fallback.games.length,1);assert(fallback.warnings.length);
    await fs.rename(db,db+'.fixture');assert.equal((await bnet.discoverBattleNetGames()).games.length,1);
    await fs.rename(path.join(d3,'x64/Diablo III64.exe'),path.join(d3,'x64/removed.fixture'));assert.equal((await bnet.discoverBattleNetGames()).games.length,0);
    await assert.rejects(bnet.launchBattleNetGame(game),/missing or ambiguous/);assert.equal(spawned.length,3);
    console.log('PASS: Battle.net binary parsing, component exclusion, duplicate/variant/custom-root detection, unknown/corrupt/missing database, removed game, safe paths, launch mapping, trusted launcher, warm/cold launch sequencing. All process launches mocked.');
} finally {
    const relative=path.relative(await fs.realpath(os.tmpdir()),await fs.realpath(root));
    if(!relative || relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(root).startsWith('game-scroller-bnet-'))throw Error('Unsafe fixture cleanup');
    await fs.rm(root,{recursive:true});
}
