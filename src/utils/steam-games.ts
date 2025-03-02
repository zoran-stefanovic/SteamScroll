import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { SteamAppInfoFetcher } from './SteamAppInfoFetcher';
import { SteamGameWithType } from "./types";
import streamDeck from '@elgato/streamdeck';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logger = streamDeck.logger.createScope("steamgamests"); // Replace with your actual logger

/**
 * Retrieves the paths of Steam library folders from `libraryfolders.vdf`
 * @param customSteamDir Custom Steam installation directory
 * @returns Array of library paths
 */
function getLibraryPaths(customSteamDir?: string): string[] { 
    // Default to the standard Steam path if none is provided
    let steamDir = customSteamDir || "C:/Program Files (x86)/Steam";
    

    // Normalize the path: Remove any trailing slashes to avoid double separators
    steamDir = steamDir.replace(/[\\/]+$/, "");

    // Construct the full path
    const steamConfigPath = `${steamDir}\\steamapps\\libraryfolders.vdf`;
    logger.info(`Using Steam config path: ${steamConfigPath}`);

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

/**
 * Retrieves a list of installed games from the Steam library folders.
 * @param customSteamDir Custom Steam installation directory
 * @returns Array of installed games with app IDs and names
 */
function getInstalledGames(customSteamDir?: string): { appid: string; name: string }[] {
    const libraryPaths = getLibraryPaths(customSteamDir);
    const installedGames: { appid: string; name: string }[] = [];

    libraryPaths.forEach((libraryPath) => {
        const appsPath = path.join(libraryPath, "steamapps");
        if (!fs.existsSync(appsPath)) return;

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

/**
 * Retrieves Steam games with types and their associated icons.
 * @param customSteamDir Custom Steam installation directory
 * @returns Promise resolving to an array of SteamGameWithType objects
 */
export async function getSteamGamesWithTypes(customSteamDir?: string): Promise<SteamGameWithType[]> {
    try {
        // Get installed games using the correct Steam path
        const installedGames = getInstalledGames(customSteamDir);
        const fetcher = new SteamAppInfoFetcher();

        // Normalize and construct the correct path for appinfo.vdf
        let steamDir = customSteamDir || "C:/Program Files (x86)/Steam";
        steamDir = steamDir.replace(/[\\/]+$/, ""); // Normalize the path
        const appInfoPath = `${steamDir}\\appcache\\appinfo.vdf`;

        logger.info(`Using appinfo path: ${appInfoPath}`);
        const appInfo = await fetcher.fetchAppInfo(appInfoPath);

        // Create a map of app info for quick lookup
        const appInfoMap = new Map<string, { type: string; iconPath: string | null }>();
        for (const app of appInfo) {
            appInfoMap.set(app.appId.toString(), {
                type: app.type,
                iconPath: app.iconPath || null,
            }); 
        }

        // Process installed games
        const steamGames: SteamGameWithType[] = [];

        for (const game of installedGames) {
            const appInfo = appInfoMap.get(game.appid);

            // Build the correct icon path
            const iconPath = appInfo?.iconPath
                ? path.join(steamDir, "appcache", "librarycache", game.appid, appInfo.iconPath)
                : "imgs/noiconplaceholder.jpeg";
            
            const iconPathCheck = `${iconPath}.jpg`;
            const finalIconPath = fs.existsSync(iconPathCheck) ? iconPath : "imgs/noiconplaceholder.jpeg";
            


            steamGames.push({
                name: game.name,
                appid: game.appid,
                icon: finalIconPath, // Ensure the correct path is assigned
                type: appInfo?.type || "Unknown", // Ensure `type` is always valid
            });
        }
 
        return steamGames;
    } catch (err) {
        logger.error("Error retrieving Steam games:", err);
        return [];
    }
}
