import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';

const DEFAULT_STEAM = 'C:/Program Files (x86)/Steam';
let cached: { until: number; paths: string[] } | undefined;
let pending: Promise<string[]> | undefined;
export function clearSteamLocationCache(): void { cached = undefined; }

async function registryPaths(): Promise<string[]> {
    if (cached && cached.until > Date.now()) return cached.paths;
    if (pending) return pending;
    const script = "$ErrorActionPreference='Stop';$paths=@();foreach($key in @('HKCU:\\Software\\Valve\\Steam','HKLM:\\SOFTWARE\\Valve\\Steam','HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam')){$v=Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue;if($v.SteamPath){$paths+=[string]$v.SteamPath};if($v.InstallPath){$paths+=[string]$v.InstallPath}};ConvertTo-Json -InputObject @($paths) -Compress";
    pending = new Promise<string[]>(resolve => {
        const powershell = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
        execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10000, maxBuffer: 65536 }, (error, output) => {
            if (error) return resolve([]);
            try { const value: unknown = JSON.parse(output.trim()); resolve(Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : []); }
            catch { resolve([]); }
        });
    });
    try { const paths = await pending; cached = { until: Date.now() + 30000, paths }; return paths; }
    finally { pending = undefined; }
}

/** Registry first; legacy user setting and conventional paths are validated fallbacks. */
export async function findSteamDirectory(legacyPath?: string): Promise<string> {
    const candidates = [...await registryPaths(), legacyPath, path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Steam'), path.join(process.env.ProgramFiles || 'C:/Program Files', 'Steam')];
    for (const candidate of candidates) {
        if (!candidate || !/^[a-z]:[\\/]/i.test(candidate) || /[\x00-\x1f]/.test(candidate)) continue;
        const root = path.normalize(candidate.trim()).replace(/[\\/]+$/, '');
        try {
            if (fs.statSync(path.join(root, 'steam.exe')).isFile() && fs.statSync(path.join(root, 'steamapps', 'libraryfolders.vdf')).isFile()) return root;
        } catch { /* Skip stale registrations and disconnected drives. */ }
    }
    return DEFAULT_STEAM;
}
