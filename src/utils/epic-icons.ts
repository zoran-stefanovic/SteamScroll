import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";

const fallbackSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" rx="8" fill="#123F31"/><path d="M28 19L52 36 28 53Z" fill="#BDD0B2"/></svg>';
export const EPIC_ICON_FALLBACK = `data:image/svg+xml;base64,${Buffer.from(fallbackSvg).toString("base64")}`;
const pending = new Map<string, Promise<string>>();
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function isPng(bytes: Buffer): boolean { return bytes.length > 24 && bytes.length < 1024 * 1024 && bytes.subarray(0, 8).equals(pngSignature); }

/** Reads an executable's icon resource without starting the executable. */
export async function extractWindowsIcon(executable: string): Promise<Buffer> {
    const script = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; $icon=[Drawing.Icon]::ExtractAssociatedIcon($env:GAME_SCROLLER_ICON_SOURCE); if($null -eq $icon){throw 'No icon resource'}; $bitmap=$null; $stream=$null; try { $bitmap=$icon.ToBitmap(); $stream=[IO.MemoryStream]::new(); $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png); [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray())) } finally { if($stream){$stream.Dispose()}; if($bitmap){$bitmap.Dispose()}; $icon.Dispose() }";
    return new Promise<Buffer>((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
        { windowsHide: true, env: { ...process.env, GAME_SCROLLER_ICON_SOURCE: executable }, timeout: 10000, maxBuffer: 2 * 1024 * 1024 },
        (error, stdout) => error ? reject(error) : resolve(Buffer.from(stdout.trim(), "base64"))));
}

/** File identity invalidates icons after game updates; only successful PNGs persist. */
export async function getEpicIcon(executable: string, options: { cacheDir?: string; extract?: (executable: string) => Promise<Buffer> } = {}): Promise<string> {
    const cacheDir = options.cacheDir ?? path.join(process.env.LOCALAPPDATA || process.env.TEMP || ".", "GameScroller", "epic-icons");
    let key: string;
    try {
        const stat = await fs.stat(executable);
        if (!stat.isFile()) return EPIC_ICON_FALLBACK;
        key = createHash("sha256").update(JSON.stringify([path.resolve(executable).toLowerCase(), stat.size, stat.mtimeMs])).digest("hex");
    } catch { return EPIC_ICON_FALLBACK; }
    const cacheFile = path.join(cacheDir, `${key}.png`);
    if (pending.has(cacheFile)) return pending.get(cacheFile)!;
    const work = (async () => {
        try {
            const cached = await fs.readFile(cacheFile);
            if (isPng(cached)) return `data:image/png;base64,${cached.toString("base64")}`;
        } catch { /* An absent/unreadable cache must not prevent extraction. */ }
        try {
            const bytes = await (options.extract ?? extractWindowsIcon)(executable);
            if (!isPng(bytes)) return EPIC_ICON_FALLBACK;
            try { await fs.mkdir(cacheDir, { recursive: true }); await fs.writeFile(cacheFile, bytes); } catch { /* The image still works without a writable cache. */ }
            return `data:image/png;base64,${bytes.toString("base64")}`;
        } catch { return EPIC_ICON_FALLBACK; }
    })();
    pending.set(cacheFile, work);
    try { return await work; } finally { pending.delete(cacheFile); }
}
