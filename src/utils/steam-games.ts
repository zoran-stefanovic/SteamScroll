import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { SteamAppInfoFetcher } from './SteamAppInfoFetcher';
import { SteamGameWithType } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logger = console; // Replace with your actual logger
const steamLibraryCachePath = "C:\\Program Files (x86)\\Steam\\appcache\\librarycache";

async function fetchIconFromLocalCache(appId: string): Promise<string | null> {
    const iconFilePath = path.join(steamLibraryCachePath, `${appId}_icon.jpg`);

    if (fs.existsSync(iconFilePath)) {
        logger.info(`Found icon for AppID ${appId} at ${iconFilePath}`);
        const imageData = fs.readFileSync(iconFilePath);
        return `data:image/jpeg;base64,${imageData.toString('base64')}`;
    } else {
        logger.warn(`Icon not found for AppID ${appId} in ${steamLibraryCachePath}`);
        return null;
    }
}



function getLibraryPaths(): string[] {
    const steamConfigPath = "C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf";
    logger.info('Retrieving library paths...');
    try {
        const vdfContent = fs.readFileSync(steamConfigPath, 'utf-8');
        const libraryPaths: string[] = [];

        const matches = vdfContent.match(/"path"\s+"([^"]+)"/g);
        if (matches) {
            matches.forEach((match) => {
                const [, libraryPath] = match.match(/"path"\s+"([^"]+)"/) || [];
                if (libraryPath) libraryPaths.push(libraryPath);
            });
        }

        logger.info(`Found library paths: ${libraryPaths.join(", ")}`);
        return libraryPaths;
    } catch (err) {
        logger.error("Error reading libraryfolders.vdf:", err);
        return [];
    }
}

function getInstalledGames(): { appid: string; name: string }[] {
    const libraryPaths = getLibraryPaths();
    const installedGames: { appid: string; name: string }[] = [];

    libraryPaths.forEach((libraryPath) => {
        const appsPath = path.join(libraryPath, "steamapps");
        const acfFiles = fs.readdirSync(appsPath).filter(file => file.endsWith(".acf"));

        acfFiles.forEach((file) => {
            const acfContent = fs.readFileSync(path.join(appsPath, file), 'utf-8');
            const appidMatch = acfContent.match(/"appid"\s+"(\d+)"/);
            const nameMatch = acfContent.match(/"name"\s+"([^"]+)"/);

            if (appidMatch && nameMatch) {
                installedGames.push({
                    appid: appidMatch[1],
                    name: nameMatch[1]
                });
            }
        });
    });

    logger.info(`Installed games found: ${installedGames.length}`);
    return installedGames;
}

export async function getSteamGamesWithTypes(): Promise<SteamGameWithType[]> {
    try {
        const installedGames = getInstalledGames();
        const fetcher = new SteamAppInfoFetcher();
        const appInfoPath = "C:/Program Files (x86)/Steam/appcache/appinfo.vdf";

        const appInfo = await fetcher.fetchAppInfo(appInfoPath);

        const appInfoMap = new Map<string, string>();
        for (const app of appInfo) {
            appInfoMap.set(app.appId.toString(), app.type);
        }

        const steamGames: SteamGameWithType[] = [];

        for (const game of installedGames) {
            const iconBase64 = await fetchIconFromLocalCache(game.appid);

            steamGames.push({
                name: game.name,
                appid: game.appid,
                icon: iconBase64 || "", // Ensure `icon` is always a string
                type: appInfoMap.get(game.appid) || "Unknown", // Ensure `type` is always a string
            });
        }

        return steamGames;
    } catch (err) {
        logger.error("Error retrieving Steam games:", err);
        return [];
    }
}
