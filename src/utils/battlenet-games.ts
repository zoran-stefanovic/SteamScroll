import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import type { SteamGameWithType } from './types';
import { getEpicIcon } from './epic-icons';

interface Product { uid: string; code: string; installPath: string; playable: boolean | null; installed: boolean | null; updateComplete: boolean | null }
interface Definition { name: string; variant: string; launchId: string | null; uids: string[]; exes: string[] }
// Best-effort mappings, not a Blizzard API contract. Sources and tested scope: BATTLE-NET.md.
export const BNET_PRODUCTS: Record<string, Definition> = {
    d3: { name:'Diablo III', variant:'Retail', launchId:'D3', uids:['diablo3'], exes:['x64/Diablo III64.exe','Diablo III.exe'] },
    fenris: { name:'Diablo IV', variant:'Retail', launchId:'Fen', uids:['fenris'], exes:['Diablo IV.exe'] },
    pro: { name:'Overwatch', variant:'Retail', launchId:'Pro', uids:['prometheus'], exes:['_retail_/Overwatch.exe'] },
    wow: { name:'World of Warcraft', variant:'Retail', launchId:'WoW', uids:['wow'], exes:['_retail_/Wow.exe'] },
    wow_classic: { name:'World of Warcraft', variant:'Classic', launchId:'WoW_wow_classic', uids:['wow_classic'], exes:['_classic_/WowClassic.exe'] },
    wow_classic_era: { name:'World of Warcraft', variant:'Classic Era', launchId:'WoW_wow_classic_era', uids:['wow_classic_era'], exes:['_classic_era_/WowClassic.exe'] },
    d3t: { name:'Diablo III', variant:'PTR', launchId:null, uids:['diablo3_ptr','diablo3_test'], exes:['x64/Diablo III64.exe','Diablo III.exe'] },
    wowt: { name:'World of Warcraft', variant:'PTR', launchId:null, uids:['wow_ptr'], exes:['_ptr_/WowT.exe','_ptr_/Wow.exe'] },
    wow_beta: { name:'World of Warcraft', variant:'Beta', launchId:null, uids:['wow_beta'], exes:['_beta_/WowB.exe'] }
};
export interface BattleNetGame extends SteamGameWithType {
    productCode: string; launchId: string | null; installLocation: string; executable: string; variant: string; status: string;
}
interface WireField { id: number; wire: number; value?: Buffer | bigint }
function wireFields(bytes: Buffer): WireField[] {
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Database too large');
    let pos = 0;
    const fields: WireField[] = [];
    function varint(): bigint {
        let value = 0n;
        for (let i=0;i<10;i++) {
            if (pos >= bytes.length) throw new Error('Truncated varint');
            const b = bytes[pos++];
            if (i===9 && b>1) throw new Error('Invalid varint');
            value |= BigInt(b & 127) << BigInt(i*7);
            if (!(b & 128)) return value;
        }
        throw new Error('Invalid varint');
    }
    while (pos < bytes.length) {
        if (fields.length >= 20000) throw new Error('Too many fields');
        const tag = varint(), id = Number(tag >> 3n), wire = Number(tag & 7n);
        if (id<1 || id>536870911) throw new Error('Invalid field');
        let value: Buffer | bigint | undefined;
        if (wire===0) value=varint();
        else if (wire===2) {
            const length=Number(varint());
            if (!Number.isSafeInteger(length) || pos+length>bytes.length) throw new Error('Truncated field');
            value=bytes.subarray(pos,pos+length); pos+=length;
        } else if (wire===1 || wire===5) {
            pos+=wire===1 ? 8 : 4;
            if (pos>bytes.length) throw new Error('Truncated fixed field');
        } else throw new Error('Unsupported wire type');
        fields.push({id,wire,value});
    }
    return fields;
}
function field(fields: WireField[], id: number, wire=2): Buffer | bigint | undefined {
    const found=fields.filter(f=>f.id===id);
    if (found.length>1 || (found.length && found[0].wire!==wire)) throw new Error('Invalid field type');
    return found[0]?.value;
}
function sub(fields: WireField[], id: number): WireField[] { const value=field(fields,id); return Buffer.isBuffer(value) ? wireFields(value) : []; }
function text(fields: WireField[], id: number): string {
    const value=field(fields,id);
    if (!Buffer.isBuffer(value)) return '';
    if (value.length>4096) throw new Error('Oversized string');
    const result=new TextDecoder('utf-8',{fatal:true}).decode(value);
    if (/[\x00-\x1f]/.test(result)) throw new Error('Invalid string');
    return result;
}
function flag(fields: WireField[], id: number): boolean | null {
    const value=field(fields,id,0);
    if (value===undefined) return null;
    if (value!==0n && value!==1n) throw new Error('Invalid flag');
    return value===1n;
}
function product(bytes: Buffer): Product {
    const fields=wireFields(bytes), state=sub(sub(fields,4),1);
    return {uid:text(fields,1), code:text(fields,2), installPath:text(sub(fields,3),1), installed:flag(state,1), playable:flag(state,2), updateComplete:flag(state,3)};
}
export function parseBattleNetDatabase(bytes: Buffer): Product[] {
    const records=wireFields(bytes).filter(f=>f.id===1);
    if (!records.length) throw new Error('No installation records');
    return records.map(f=>{ if (!Buffer.isBuffer(f.value)) throw new Error('Invalid product'); return product(f.value); });
}
export function safeBattleNetPath(value: string): boolean {
    return /^[a-z]:[\\/]/i.test(value) && !/[\x00-\x1f<>"|?*]/.test(value) && !value.slice(2).includes(':') && !value.split(/[\\/]/).some(s=>s==='..'||/[ .]$/.test(s));
}
async function realLocal(value: string): Promise<string> {
    if (!safeBattleNetPath(value)) throw new Error('Unsafe installation path');
    const real=await fs.realpath(value);
    if (!safeBattleNetPath(real)) throw new Error('Unsafe resolved path');
    return real;
}
async function contained(root: string, relative: string): Promise<string> {
    const real=await realLocal(path.join(root,relative)), rel=path.relative(root,real);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path escapes installation');
    return real;
}
const psRoot=path.join(process.env.SystemRoot || 'C:/Windows','System32/WindowsPowerShell/v1.0');
async function powershell(script: string, env: Record<string,string> = {}): Promise<string> {
    return new Promise((resolve,reject)=>execFile(path.join(psRoot,'powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:15000,maxBuffer:2*1024*1024,env:{...process.env,PSModulePath:path.join(psRoot,'Modules'),...env}},(error,out)=>error ? reject(new Error('Battle.net installation information could not be read.')) : resolve(out.trim())));
}
interface RegistryEntry { name: string; installPath: string; uid: string }
async function readRegistry(): Promise<RegistryEntry[]> {
    const script="$keys=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); $rows=@(Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -eq 'Battle.net' -or $_.UninstallString -match 'Battle\\.net.*--uid='} | ForEach-Object {$uid='';if($_.UninstallString -match '--uid=([a-zA-Z0-9_.-]+)'){$uid=$Matches[1]};[PSCustomObject]@{name=$_.DisplayName;installPath=$_.InstallLocation;uid=$uid}});ConvertTo-Json -InputObject $rows -Compress";
    const value: unknown=JSON.parse(await powershell(script)||'[]');
    return Array.isArray(value) ? value.filter(r=>r && typeof r.name==='string' && typeof r.installPath==='string' && typeof r.uid==='string') : [];
}
async function smallRead(file: string): Promise<Buffer> { if ((await fs.stat(file)).size>8*1024*1024) throw new Error('Metadata too large'); return fs.readFile(file); }
export async function discoverBattleNetGames(options: { dbPath?: string; registry?: RegistryEntry[]; icons?: boolean } = {}): Promise<{ games: BattleNetGame[]; warnings: string[] }> {
    const warnings: string[]=[], records: Product[]=[];
    try { records.push(...parseBattleNetDatabase(await smallRead(options.dbPath || path.join(process.env.ProgramData || 'C:/ProgramData','Battle.net/Agent/product.db')))); }
    catch (e) { if ((e as NodeJS.ErrnoException).code!=='ENOENT') warnings.push('Battle.net product database is unreadable. Using installation registrations.'); }
    let entries: RegistryEntry[]=[];
    try { entries=options.registry ?? await readRegistry(); } catch { warnings.push('Battle.net installation registrations are unavailable.'); }
    for (const entry of entries) {
        if (entry.name==='Battle.net' || records.some(r=>r.uid===entry.uid && path.normalize(r.installPath).toLowerCase()===path.normalize(entry.installPath).toLowerCase())) continue;
        const code=Object.keys(BNET_PRODUCTS).find(k=>BNET_PRODUCTS[k].uids.includes(entry.uid));
        if (!code) { warnings.push(`Unsupported Battle.net product: ${entry.uid}`); continue; }
        let r: Product={uid:entry.uid,code,installPath:entry.installPath,installed:null,playable:null,updateComplete:null};
        try { const root=await realLocal(entry.installPath); const local=product(await smallRead(await contained(root,'.product.db'))); if (local.code===code) r={...local,installPath:root}; } catch { /* Files are validated below. */ }
        records.push(r);
    }
    const games=new Map<string,BattleNetGame>();
    for (const r of records) {
        if (['agent','bna'].includes(r.code)) continue;
        const def=Object.hasOwn(BNET_PRODUCTS,r.code) ? BNET_PRODUCTS[r.code] : undefined;
        if (!def) { warnings.push(`Unsupported Battle.net product: ${r.code}`); continue; }
        try {
            const root=await realLocal(r.installPath);
            let executable='';
            for (const rel of def.exes) { try { const file=await contained(root,rel); if ((await fs.stat(file)).isFile()) { executable=file; break; } } catch { /* Try next architecture. */ } }
            if (!executable) continue;
            const build=(await smallRead(await contained(root,'.build.info'))).toString('utf8');
            const lines=build.trim().split(/\r?\n/), headers=lines.shift()!.split('|').map(s=>s.split('!')[0]), active=headers.indexOf('Active');
            if (active<0 || !lines.some(line=>line.split('|')[active]==='1')) continue;
            if (!(await fs.readdir(await contained(root,'Data'))).length) continue;
            if (r.installed===false) continue;
            const appid=`battlenet:${r.code}:${createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,16)}`;
            const icon=options.icons===false ? '' : await getEpicIcon(executable,{cacheDir:path.join(process.env.LOCALAPPDATA || process.env.TEMP || '.', 'GameScroller','battlenet-icons')});
            games.set(appid,{appid,name:def.variant==='Retail' ? def.name : `${def.name} (${def.variant})`,type:'game',icon,productCode:r.code,launchId:def.launchId,installLocation:root,executable,variant:def.variant,status:r.playable===false || r.updateComplete===false ? 'Update required — Battle.net will handle it' : 'Launch through Battle.net'});
        } catch { /* Stale registrations and inaccessible volumes do not become launchable entries. */ }
    }
    return {games:[...games.values()].sort((a,b)=>a.name.localeCompare(b.name)),warnings:[...new Set(warnings)]};
}
async function signedByBlizzard(file: string): Promise<boolean> {
    const value=JSON.parse(await powershell("$ErrorActionPreference='Stop';$s=Get-AuthenticodeSignature -LiteralPath $env:GAME_SCROLLER_BNET_FILE;[PSCustomObject]@{status=[string]$s.Status;subject=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress",{GAME_SCROLLER_BNET_FILE:file}));
    return value.status==='Valid' && /(?:^|,\s*)O="?Blizzard Entertainment, Inc\."?(?:,|$)/.test(value.subject || '');
}
export function battleNetLaunchArgs(game: Pick<BattleNetGame,'productCode'|'launchId'>): string[] {
    const def=Object.hasOwn(BNET_PRODUCTS,game.productCode) ? BNET_PRODUCTS[game.productCode] : undefined;
    if (!def?.launchId || def.launchId!==game.launchId) throw new Error('This Battle.net variant has no verified launch mapping.');
    return [`--exec=launch ${def.launchId}`];
}
async function send(file: string, args: string[]): Promise<void> {
    await new Promise<void>((resolve,reject)=>{ const child=spawn(file,args,{shell:false,detached:true,stdio:'ignore'}); child.once('error',()=>reject(new Error('Battle.net could not be started.'))); child.once('spawn',()=>{child.unref();resolve();}); });
}
let launching=false;
export async function launchBattleNetGame(game: BattleNetGame): Promise<void> {
    if (launching) throw new Error('A Battle.net launch request is already in progress.');
    launching=true;
    try {
        const args=battleNetLaunchArgs(game), current=await discoverBattleNetGames({icons:false});
        const matches=current.games.filter(g=>g.launchId===game.launchId);
        if (matches.length!==1 || matches[0].appid!==game.appid) throw new Error('Battle.net installation is missing or ambiguous. Refresh the library.');
        let launcher='';
        for (const entry of await readRegistry()) if (entry.name==='Battle.net') {
            try { const candidate=await contained(await realLocal(entry.installPath),'Battle.net.exe'); if (await signedByBlizzard(candidate)) {launcher=candidate;break;} } catch { /* Fail closed. */ }
        }
        if (!launcher) throw new Error('A trusted Battle.net launcher was not found.');
        if (!(await signedByBlizzard(matches[0].executable))) throw new Error('The game executable signature could not be verified.');
        const running=await powershell("$p=@(Get-Process -Name 'Battle.net' -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $env:GAME_SCROLLER_BNET_FILE});if($p.Count -gt 0){'yes'}else{'no'}",{GAME_SCROLLER_BNET_FILE:launcher});
        if (running!=='yes') { await send(launcher,[]); await new Promise(resolve=>setTimeout(resolve,7000)); }
        await send(launcher,args);
        // Best effort: no retry loop, login automation, download control or game-success claim.
    } finally { launching=false; }
}
