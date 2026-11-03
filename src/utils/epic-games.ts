import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import type { SteamGameWithType } from "./types";
import { EPIC_ICON_FALLBACK } from "./epic-icons";

export interface EpicGame extends SteamGameWithType {
    namespace: string;
    catalogItemId: string;
    appName: string;
    installLocation: string;
    executable: string;
}
export interface EpicLibrary { games: EpicGame[]; warnings: string[] }
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const str = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const flag = (value: unknown): boolean => value === true || value === "true" || value === 1;
export const epicRoot = (): string => path.join(process.env.PROGRAMDATA || "C:/ProgramData", "Epic");

/** Each ID component is independently encoded; separators are encoded exactly once. */
export function epicLaunchUri(game: Pick<EpicGame, "namespace" | "catalogItemId" | "appName">): string {
    const parts = [game.namespace, game.catalogItemId, game.appName];
    if (parts.some(part => !part || /[\u0000-\u001f]/.test(part))) throw new Error("Invalid Epic game identifier.");
    return `com.epicgames.launcher://apps/${parts.map(encodeURIComponent).join("%3A")}?action=launch&silent=true`;
}

async function exists(target: string, directory = false): Promise<boolean> {
    try { const stat = await fs.stat(target); return directory ? stat.isDirectory() : stat.isFile(); }
    catch { return false; }
}

/** Read only install metadata; never executes or authenticates a game. */
export async function discoverEpicGames(root = epicRoot()): Promise<EpicLibrary> {
    const warnings: string[] = [];
    let supplementary: RecordValue[] = [];
    try {
        const data = object(JSON.parse((await fs.readFile(path.join(root, "UnrealEngineLauncher", "LauncherInstalled.dat"), "utf8")).replace(/^\uFEFF/, "")));
        supplementary = Array.isArray(data.InstallationList) ? data.InstallationList.map(object) : [];
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") warnings.push("Epic installation index could not be read.");
    }
    const manifestDir = path.join(root, "EpicGamesLauncher", "Data", "Manifests");
    let files: string[];
    try { files = (await fs.readdir(manifestDir)).filter(name => name.toLowerCase().endsWith(".item")).sort(); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { games: [], warnings };
        throw new Error("Unable to read Epic manifests. Check access to the Epic installation folder.");
    }
    const games = new Map<string, EpicGame>();
    for (const file of files) {
        let manifest: RecordValue;
        try { manifest = object(JSON.parse((await fs.readFile(path.join(manifestDir, file), "utf8")).replace(/^\uFEFF/, ""))); }
        catch { warnings.push("An unreadable Epic manifest was skipped."); continue; }
        const appName = str(manifest.AppName);
        const categories = Array.isArray(manifest.AppCategories) ? manifest.AppCategories.map(value => str(value).toLowerCase()) : [];
        const mainGame = str(manifest.MainGameAppName);
        if (!appName || flag(manifest.bIsIncompleteInstall) || manifest.bIsApplication === false ||
            (mainGame && mainGame !== appName) || categories.some(value => /(^|[._-])(dlc|plugin|plugins|ue|engine|unreal)([._-]|$)/i.test(value)) ||
            /^UE[_\d]/i.test(appName)) continue;
        const extra = supplementary.find(item => str(item.AppName) === appName) || {};
        const namespace = str(manifest.CatalogNamespace) || str(extra.NamespaceId);
        const catalogItemId = str(manifest.CatalogItemId) || str(extra.ItemId);
        const installLocation = str(manifest.InstallLocation) || str(extra.InstallLocation);
        const executable = str(manifest.LaunchExecutable);
        const name = str(manifest.DisplayName);
        if (!namespace || !catalogItemId || !name || !installLocation || !executable || namespace.toLowerCase() === "ue") continue;
        // A dat-only record cannot prove a launchable game. Require an item manifest and a local exe inside its installation.
        const install = path.resolve(installLocation);
        const launch = path.resolve(install, executable);
        const relative = path.relative(install, launch);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !/\.exe$/i.test(launch) ||
            !(await exists(install, true)) || !(await exists(launch))) continue;
        const appid = `epic:${[namespace, catalogItemId, appName].map(encodeURIComponent).join(":")}`;
        if (!games.has(appid)) games.set(appid, { appid, name, namespace, catalogItemId, appName, installLocation: install, executable: launch, type: "game", icon: EPIC_ICON_FALLBACK });
    }
    return { games: [...games.values()].sort((a, b) => a.name.localeCompare(b.name)), warnings };
}

/** Use Windows' registered protocol handler without interpolating metadata into a shell command. */
export async function launchEpicGame(game: EpicGame): Promise<void> {
    if (!(await exists(game.installLocation, true))) throw new Error("This Epic game is no longer installed. Refresh the library.");
    const uri = epicLaunchUri(game);
    const script = "$ErrorActionPreference='Stop'; if (-not (Test-Path -LiteralPath 'Registry::HKEY_CLASSES_ROOT\\com.epicgames.launcher')) { throw 'Epic Games Launcher is not registered. Open or reinstall the launcher.' }; Start-Process -FilePath $env:GAME_SCROLLER_EPIC_URI";
    await new Promise<void>((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
        { windowsHide: true, env: { ...process.env, GAME_SCROLLER_EPIC_URI: uri }, timeout: 15000 },
        error => error ? reject(new Error("Could not request launch. Open Epic Games Launcher, verify its installation and sign in, then try again.")) : resolve()));
}
