import assert from 'node:assert/strict';
import path from 'node:path';
import {load} from './load-ts.mjs';
let entries=['F:/Steam'],error=false,calls=0;
const valid=new Set();
const allow=root=>{valid.add(path.normalize(path.join(root,'steam.exe')));valid.add(path.normalize(path.join(root,'steamapps/libraryfolders.vdf')));};
const finder=load('src/utils/steam-location.ts',{
 'node:fs':{statSync:p=>{if(!valid.has(path.normalize(p)))throw Error('missing');return {isFile:()=>true};}},
 'node:child_process':{execFile:(exe,args,options,done)=>{calls++;done(error?Error('registry unavailable'):null,JSON.stringify(entries));}}
});
allow('F:/Steam');allow('E:/LegacySteam');
assert.equal(await finder.findSteamDirectory('E:/LegacySteam'),path.normalize('F:/Steam'));
await finder.findSteamDirectory();assert.equal(calls,1);
entries=['Z:/Removed','F:/Steam'];finder.clearSteamLocationCache();
assert.equal(await finder.findSteamDirectory(),path.normalize('F:/Steam'));
entries=['Z:/Removed'];finder.clearSteamLocationCache();
assert.equal(await finder.findSteamDirectory('E:/LegacySteam'),path.normalize('E:/LegacySteam'));
error=true;finder.clearSteamLocationCache();
assert.equal(await finder.findSteamDirectory('E:/LegacySteam'),path.normalize('E:/LegacySteam'));
valid.clear();finder.clearSteamLocationCache();
assert.equal(await finder.findSteamDirectory(),'C:/Program Files (x86)/Steam');
error=false;entries=['F:/OnlyExe'];valid.add(path.normalize('F:/OnlyExe/steam.exe'));finder.clearSteamLocationCache();
assert.equal(await finder.findSteamDirectory(),'C:/Program Files (x86)/Steam');
console.log('PASS: automatic nonstandard Steam root, registry priority/cache/refresh, stale registration, legacy fallback, unavailable registry, absent installation and missing library index. No processes launched.');
