import streamDeck, {
    action,
    DialAction,
    DialDownEvent,
    DialRotateEvent,
    DidReceiveSettingsEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import * as fs from "fs";
import * as path from "path";
import { selectedLibraries, gameProvider, matchesSteamType, sharedCollections, selectedCollectionId, type LibraryPreset, type LibraryId } from "../utils/libraries";
import { discoverBattleNetGames, launchBattleNetGame, type BattleNetGame } from "../utils/battlenet-games";
import { execFile } from "node:child_process";
import { findSteamDirectory, clearSteamLocationCache } from "../utils/steam-location";
import { getSteamGamesWithTypes } from "../utils/steam-games";
import { discoverEpicGames, epicRoot, launchEpicGame, type EpicGame } from "../utils/epic-games";
import { EPIC_ICON_FALLBACK, getEpicIcon } from "../utils/epic-icons";
import {
    CustomSteamFilter,
    FilterSettings,
    GlobalPluginSettings,
    SteamGameOption,
    SteamGameWithType,
    SteamGamesResponse
} from "../utils/types";

const logger = streamDeck.logger.createScope("steamscroll");

interface PluginRouteRequest extends JsonObject {
    __type?: string;
    id?: string;
    path?: string;
    unidirectional?: boolean;
    body?: JsonValue;
}

interface PluginRouteResponse extends JsonObject {
    __type: "response";
    id: string;
    path: string;
    status: number;
    body: SteamGamesResponse;
}

interface ContextData {
    dialAction: DialAction<FilterSettings>;
    steamDir: string;
    filters: string[];
    currentIndex: number;
    filteredGames: SteamGameWithType[];
    selectedCustomFilterId: string | null;
    reverseDirection: boolean;
    libraries: LibraryId[];
    settings: FilterSettings;
}

const DEFAULT_FILTERS = ["game", "tool", "application"];
const LAUNCH_FRAMES = Array.from({ length: 12 }, (_, frame) =>
    `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="20" fill="none" stroke="#253542" stroke-width="5"/><path d="M30 10 A20 20 0 0 1 50 30" fill="none" stroke="#66D9FF" stroke-width="5" stroke-linecap="round" transform="rotate(${frame * 30} 30 30)"/></svg>`).toString("base64")}`);

@action({ UUID: "com.zstefanovic.steamscroll.dial" })
export class SteamScroll extends SingletonAction<FilterSettings> {
    private readonly contexts = new Map<string, ContextData>();
    private readonly initializingContexts = new Map<string, boolean>();
    private readonly gamesCache = new Map<string, SteamGameWithType[]>();
    private readonly pendingLoads = new Map<string, Promise<SteamGameWithType[]>>();
    private globalSettings: GlobalPluginSettings = { customFilters: [] };
    private readonly globalSettingsReady: Promise<void>;
    private readonly libraryWarnings = new Map<string, string>();
    private readonly loadedAt = new Map<string, number>();
    private readonly launchPending = new Set<string>();
    private readonly launchAnimations = new Map<string, { timer?: ReturnType<typeof setTimeout> }>();
    private readonly launchFeedbackUntil = new Map<string, number>();

    private stopLaunchAnimation(context: string): void {
        const animation = this.launchAnimations.get(context);
        if (animation?.timer) clearTimeout(animation.timer);
        this.launchAnimations.delete(context);
    }

    private loadGameIcons(key: string, games: SteamGameWithType[]): void {
        const iconGames = games.filter(game => (game.appid.startsWith("epic:") || game.appid.startsWith("battlenet:")) && typeof (game as EpicGame).executable === "string");
        if (!iconGames.length) return;
        const [normalizedDir, libraries] = JSON.parse(key) as [string, LibraryId[]];
        // Keep extraction bounded so a large library does not spawn a PowerShell process per game.
        void (async () => {
            let next = 0;
            const worker = async () => {
                    while (next < iconGames.length) {
                    const game = iconGames[next++] as EpicGame | BattleNetGame;
                    const cacheDir = game.appid.startsWith("battlenet:") ? path.join(process.env.LOCALAPPDATA || process.env.TEMP || ".", "GameScroller", "battlenet-icons") : undefined;
                    const icon = await getEpicIcon(game.executable, cacheDir ? { cacheDir } : {});
                    const current = this.gamesCache.get(key);
                    if (current !== games) return;
                    const cachedGame = current.find(item => item.appid === game.appid) as EpicGame | undefined;
                    if (!cachedGame || cachedGame.executable !== game.executable || cachedGame.icon === icon) continue;
                    cachedGame.icon = icon;
                    for (const [context, data] of this.contexts) {
                        if (this.normalizeSteamDir(data.steamDir) !== normalizedDir || JSON.stringify(data.libraries) !== JSON.stringify(libraries)) continue;
                        const visibleGame = data.filteredGames.find(item => item.appid === game.appid) as EpicGame | undefined;
                        if (!visibleGame || visibleGame.executable !== game.executable) continue;
                        visibleGame.icon = icon;
                        if (this.launchAnimations.has(context) || (this.launchFeedbackUntil.get(context) ?? 0) > Date.now()) continue;
                        // Refresh icons only: leave titles, provider feedback and current selection untouched.
                        const count = data.filteredGames.length;
                        if (!count) continue;
                        const feedback: Record<string, { value: string }> = {};
                        for (const [slot, index] of [["prev", (data.currentIndex - 1 + count) % count], ["current", data.currentIndex], ["next", (data.currentIndex + 1) % count]] as const) {
                            feedback[`${slot}GameIcon`] = { value: data.filteredGames[index].icon };
                        }
                        void data.dialAction.setFeedback(feedback).catch(error => logger.warn("Could not refresh game icon:", error));
                    }
                }
            };
            await Promise.all([worker(), worker()]);
        })().catch(error => logger.warn("Could not load Epic game icons:", error));
    }

    private startLaunchAnimation(context: string, data: ContextData) {
        this.stopLaunchAnimation(context);
        const animation: { timer?: ReturnType<typeof setTimeout> } = {};
        this.launchAnimations.set(context, animation);
        let frame = 0;
        const render = async () => {
            if (this.launchAnimations.get(context) !== animation) return;
            if (this.contexts.get(context) !== data) {
                this.stopLaunchAnimation(context);
                return;
            }
            try {
                await data.dialAction.setFeedback({
                    prevGameIcon: { value: "" }, prevGameTitle: { value: "" },
                    currentGameIcon: { value: LAUNCH_FRAMES[frame++ % LAUNCH_FRAMES.length] },
                    currentGameTitle: { value: "" },
                    nextGameIcon: { value: "" }, nextGameTitle: { value: "" },
                    providerName: { value: "Launching game" }
                });
                if (this.launchAnimations.get(context) === animation) {
                    animation.timer = setTimeout(() => { void render(); }, 80);
                    animation.timer.unref();
                }
            } catch (error) {
                if (this.launchAnimations.get(context) === animation) this.stopLaunchAnimation(context);
                logger.warn("Could not update launch animation:", error);
            }
        };
        void render();
        return animation;
    }

    constructor(private readonly provider: LibraryPreset = "steam") {
        super();
        this.globalSettingsReady = this.initializeGlobalSettings();
        streamDeck.settings.onDidReceiveGlobalSettings<GlobalPluginSettings>((ev) => {
            this.globalSettings = this.normalizeGlobalSettings(ev.settings);
            void this.refreshAllContexts().catch(error => logger.error("Could not refresh library:", error));
        });
        streamDeck.ui.onSendToPlugin<PluginRouteRequest, FilterSettings>((ev) => {
            void this.handlePropertyInspectorMessage(ev).catch(error => logger.error("Library request failed:", error));
        });
    }

    private async handlePropertyInspectorMessage(
        ev: { action: { getSettings: () => Promise<FilterSettings> }; payload: PluginRouteRequest }
    ): Promise<void> {
        const payload = ev.payload;
        if (payload.__type !== "request" || ![ `public:/${this.provider}-games`, `public:/${this.provider}-refresh` ].includes(payload.path ?? "") || typeof payload.id !== "string") {
            return;
        }

        const settings = await ev.action.getSettings();
        let body: SteamGamesResponse;
        try {
            if (payload.path?.endsWith("-refresh")) {
                await Promise.allSettled(this.pendingLoads.values());
                this.gamesCache.clear();
                clearSteamLocationCache();
            }
            body = await this.getSteamGamesResponse(settings);
            if (payload.path?.endsWith("-refresh")) await this.refreshAllContexts();
        } catch (error) {
            body = { games: [], steamDir: await this.getEffectiveSteamDir(settings.customSteamDir), error: error instanceof Error ? error.message : "Unable to read the game library." };
        }
        const response: PluginRouteResponse = {
            __type: "response",
            id: payload.id,
            path: payload.path!,
            status: 200,
            body
        };

        if (!payload.unidirectional) {
            await streamDeck.ui.sendToPropertyInspector(response);
        }
    }

    private async getSteamGamesResponse(settings: FilterSettings): Promise<SteamGamesResponse> {
        const steamDir = await this.getEffectiveSteamDir(settings.customSteamDir);
        const validationError = this.validateSteamDir(steamDir);

        if (validationError) {
            return {
                games: [],
                steamDir,
                error: validationError
            };
        }

        const games = await this.loadGamesForDir(steamDir, ["steam", "epic", "battlenet"]);
        const compactGames: SteamGameOption[] = games.map((game) => ({
            appid: game.appid,
            name: game.name,
            type: game.type,
            provider: gameProvider(game)
        }));

        return {
            games: compactGames,
            steamDir,
            ...(this.libraryWarnings.get(JSON.stringify([this.normalizeSteamDir(steamDir), ["steam", "epic", "battlenet"]])) ? { error: this.libraryWarnings.get(JSON.stringify([this.normalizeSteamDir(steamDir), ["steam", "epic", "battlenet"]])) } : {})
        };
    }

    private normalizeGameType(type: string): string {
        return type.toLowerCase().trim();
    }

    private normalizeSteamDir(steamDir: string): string {
        return steamDir.replace(/[\\/]+$/, "");
    }

    private async getEffectiveSteamDir(customSteamDir?: string): Promise<string> {
        const legacy = this.provider === "epic" && customSteamDir && path.normalize(customSteamDir).toLowerCase() === path.normalize(epicRoot()).toLowerCase() ? undefined : customSteamDir;
        return findSteamDirectory(legacy);
    }
    private normalizeFilters(filters?: string[]): string[] {
        const normalized = (filters && filters.length > 0 ? filters : DEFAULT_FILTERS)
            .map((filter) => this.normalizeGameType(filter));
        return Array.from(new Set(normalized));
    }

    private normalizeGlobalSettings(settings?: Partial<GlobalPluginSettings>): GlobalPluginSettings {
        return { customFilters: sharedCollections(settings) };
    }

    private async initializeGlobalSettings(): Promise<void> {
        try {
            const settings = await streamDeck.settings.getGlobalSettings<GlobalPluginSettings>();
            this.globalSettings = this.normalizeGlobalSettings(settings);
        } catch (error) {
            logger.error("Failed to load global settings:", error);
            this.globalSettings = { customFilters: [] };
        }
    }

    private validateSteamDir(_steamDir: string): string | null {
        // Providers fail independently; an absent Steam install must not hide other libraries.
        return null;
    }

    private async loadGamesForDir(steamDir: string, libraries = selectedLibraries(undefined, this.provider)): Promise<SteamGameWithType[]> {
        const key = JSON.stringify([this.normalizeSteamDir(steamDir), libraries]);
        const cached = this.gamesCache.get(key);
        if (cached && Date.now() - (this.loadedAt.get(key) || 0) < 30000) return cached;
        const pending = this.pendingLoads.get(key);
        if (pending) return pending;
        const load = (async () => {
            const results = await Promise.allSettled(libraries.map(async provider => {
                if (provider === "epic") return discoverEpicGames(epicRoot());
                if (provider === "battlenet") return discoverBattleNetGames({ icons: false });
                if (!fs.existsSync(path.join(steamDir, "appcache", "appinfo.vdf"))) return { games: [], warnings: ["Steam library unavailable. Check the Steam folder."] };
                return { games: await getSteamGamesWithTypes(steamDir), warnings: [] };
            }));
            const games: SteamGameWithType[] = [], warnings: string[] = [];
            results.forEach((result, i) => {
                if (result.status === "fulfilled") { games.push(...result.value.games); warnings.push(...result.value.warnings); }
                else warnings.push(`${libraries[i]} library unavailable.`);
            });
            this.libraryWarnings.set(key, warnings.join(" "));
            const unique = [...new Map(games.map(game => [game.appid, game.appid.startsWith("battlenet:") && !game.icon ? { ...game, icon: EPIC_ICON_FALLBACK } : game])).values()].sort((a,b) => a.name.localeCompare(b.name) || a.appid.localeCompare(b.appid));
            this.gamesCache.set(key, unique);
            this.loadedAt.set(key, Date.now());
            this.loadGameIcons(key, unique);
            return unique;
        })();
        this.pendingLoads.set(key, load);
        try { return await load; } finally { this.pendingLoads.delete(key); }
    }

    private getCustomFilter(filterId: string | null): CustomSteamFilter | null {
        if (!filterId) {
            return null;
        }

        return this.globalSettings.customFilters.find((filter) => filter.id === filterId) ?? null;
    }

    private async applyFiltersForContext(context: string): Promise<void> {
        const contextData = this.contexts.get(context);
        if (!contextData) {
            return;
        }

        const allGames = await this.loadGamesForDir(contextData.steamDir, contextData.libraries);
        if (this.contexts.get(context) !== contextData) return;
        const previousId = contextData.filteredGames[contextData.currentIndex]?.appid;
        const activeCustomFilter = this.getCustomFilter(contextData.selectedCustomFilterId);
        const selectedAppIds = activeCustomFilter ? new Set(activeCustomFilter.appids) : null;

        contextData.filteredGames = allGames.filter((game) => {
            const matchesType = matchesSteamType(game, contextData.filters);
            if (!matchesType) {
                return false;
            }

            if (!selectedAppIds) {
                return true;
            }

            return selectedAppIds.has(game.appid);
        });

        if (contextData.filteredGames.length > 0) {
            const previousIndex = contextData.filteredGames.findIndex(game => game.appid === previousId);
            if (previousIndex >= 0) contextData.currentIndex = previousIndex;
            const count = contextData.filteredGames.length;
            contextData.currentIndex = ((contextData.currentIndex % count) + count) % count;
        } else if (contextData.filteredGames.length === 0) {
            contextData.currentIndex = 0;
        }

        this.updateWheelForContext(context);
    }

    private updateWheelForContext(context: string): void {
        this.stopLaunchAnimation(context);
        const contextData = this.contexts.get(context);
        if (!contextData) {
            return;
        }

        if (contextData.filteredGames.length === 0) {
            void contextData.dialAction.setFeedback({
                prevGameIcon: { value: "" },
                prevGameTitle: { value: "" },
                currentGameIcon: { value: "" },
                currentGameTitle: { value: contextData.libraries.length ? "No games" : "Choose libraries" },
                providerName: { value: "" },
                nextGameIcon: { value: "" },
                nextGameTitle: { value: "" }
            });
            return;
        }

        const prevIndex = (contextData.currentIndex - 1 + contextData.filteredGames.length) % contextData.filteredGames.length;
        const nextIndex = (contextData.currentIndex + 1) % contextData.filteredGames.length;
        const prevGame = contextData.filteredGames[prevIndex];
        const currentGame = contextData.filteredGames[contextData.currentIndex];
        const nextGame = contextData.filteredGames[nextIndex];

        void contextData.dialAction.setFeedback({
            prevGameIcon: { value: prevGame.icon },
            prevGameTitle: { value: prevGame.name },
            currentGameIcon: { value: currentGame.icon },
            currentGameTitle: { value: currentGame.name },
            providerName: { value: {steam:"Steam",epic:"Epic",battlenet:"Battle.net"}[gameProvider(currentGame)] },
            nextGameIcon: { value: nextGame.icon },
            nextGameTitle: { value: nextGame.name }
        });
    }

    private async refreshAllContexts(): Promise<void> {
        for (const context of this.contexts.keys()) {
            const contextData = this.contexts.get(context);
            if (!contextData) {
                continue;
            }

            if (contextData.selectedCustomFilterId && !this.getCustomFilter(contextData.selectedCustomFilterId)) {
                contextData.selectedCustomFilterId = null;
                await contextData.dialAction.setSettings({
                    ...contextData.settings,
                    libraries: contextData.libraries, collectionSchema: 1,
                    customSteamDir: contextData.settings.customSteamDir,
                    filteroptions: contextData.filters,
                    lastScrollIndex: contextData.currentIndex,
                    reverseDirection: contextData.reverseDirection,
                    selectedCustomFilterId: null
                });
            }

            contextData.steamDir = await this.getEffectiveSteamDir(contextData.settings.customSteamDir);
            await this.applyFiltersForContext(context);
        }
    }

    private async setContext(
        context: string,
        dialAction: DialAction<FilterSettings>,
        settings: FilterSettings
    ): Promise<void> {
        await this.globalSettingsReady;
        const filters = this.normalizeFilters(settings.filteroptions);
        const steamDir = await this.getEffectiveSteamDir(settings.customSteamDir);
        const selectedCustomFilterId = selectedCollectionId(settings.selectedCustomFilterId, this.provider, settings.collectionSchema);

        this.contexts.set(context, {
            dialAction,
            libraries: selectedLibraries(settings.libraries, this.provider),
            settings: { ...settings, collectionSchema: 1, selectedCustomFilterId },
            steamDir,
            filters,
            currentIndex: Number.isSafeInteger(settings.lastScrollIndex) ? settings.lastScrollIndex! : 0,
            filteredGames: [],
            reverseDirection: settings.reverseDirection === true,
            selectedCustomFilterId: this.getCustomFilter(selectedCustomFilterId) ? selectedCustomFilterId : null
        });

        await this.applyFiltersForContext(context);
    }

    override async onWillAppear(ev: WillAppearEvent<FilterSettings>): Promise<void> {
        const dialAction = ev.action as DialAction<FilterSettings>;
        const context = dialAction.id;

        if (this.initializingContexts.get(context)) {
            logger.warn(`Already initializing context: ${context}`);
            return;
        }

        this.initializingContexts.set(context, true);

        try {
            const settings = ev.payload.settings;
            const steamDir = await this.getEffectiveSteamDir(settings.customSteamDir);
            const validationError = this.validateSteamDir(steamDir);

            if (validationError) {
                await dialAction.setFeedback({
                    prevGameIcon: { value: "" },
                    prevGameTitle: { value: "" },
                    currentGameIcon: { value: "" },
                    currentGameTitle: { value: validationError },
                    nextGameIcon: { value: "" },
                    nextGameTitle: { value: "" }
                });
                return;
            }

            await this.setContext(context, dialAction, {
                ...settings,
                customSteamDir: settings.customSteamDir,
                filteroptions: this.normalizeFilters(settings.filteroptions),
                lastScrollIndex: settings.lastScrollIndex,
                reverseDirection: settings.reverseDirection === true,
                selectedCustomFilterId: settings.selectedCustomFilterId ?? null
            });

            await dialAction.setSettings({
                ...settings,
                libraries: this.contexts.get(context)?.libraries, collectionSchema: 1,
                customSteamDir: settings.customSteamDir,
                filteroptions: this.contexts.get(context)?.filters ?? DEFAULT_FILTERS,
                lastScrollIndex: this.contexts.get(context)?.currentIndex ?? 0,
                reverseDirection: this.contexts.get(context)?.reverseDirection ?? false,
                selectedCustomFilterId: this.contexts.get(context)?.selectedCustomFilterId ?? null
            });
        } catch (error) {
            logger.error(`Error in onWillAppear: ${error}`);
            await dialAction.setFeedback({
                currentGameTitle: { value: "Error loading games" }
            });
        } finally {
            this.initializingContexts.set(context, false);
        }
    }

    override async onDialRotate(event: DialRotateEvent<FilterSettings>): Promise<void> {
        const dialAction = event.action as DialAction<FilterSettings>;
        const contextData = this.contexts.get(dialAction.id);

        if (!contextData || contextData.filteredGames.length === 0) {
            logger.info("No games to scroll through.");
            return;
        }

        const ticks = event.payload.ticks;
        if (!Number.isSafeInteger(ticks) || ticks === 0) return;
        const delta = ticks * (contextData.reverseDirection ? 1 : -1);
        const count = contextData.filteredGames.length;
        contextData.currentIndex = ((contextData.currentIndex + delta) % count + count) % count;

        await dialAction.setSettings({
            ...contextData.settings,
            libraries: contextData.libraries, collectionSchema: 1,
            customSteamDir: contextData.settings.customSteamDir,
            filteroptions: contextData.filters,
            lastScrollIndex: contextData.currentIndex,
            reverseDirection: contextData.reverseDirection,
            selectedCustomFilterId: contextData.selectedCustomFilterId
        });

        this.updateWheelForContext(dialAction.id);
    }

    override async onDialDown(event: DialDownEvent<FilterSettings>): Promise<void> {
        const dialAction = event.action as DialAction<FilterSettings>;
        const contextData = this.contexts.get(dialAction.id);

        if (!contextData || contextData.filteredGames.length === 0) {
            logger.info("No games available to launch.");
            return;
        }

        const currentGame = contextData.filteredGames[contextData.currentIndex];
        logger.info(`Launching game: ${currentGame.name}`);

        if (this.launchPending.has(currentGame.appid)) return;
        this.launchPending.add(currentGame.appid);
        const animation = this.startLaunchAnimation(dialAction.id, contextData);
        let launchFailed = false;
        try {
            const provider = gameProvider(currentGame);
            if (provider === "epic") await launchEpicGame(currentGame as EpicGame);
            else if (provider === "battlenet") await launchBattleNetGame(currentGame as BattleNetGame);
            else {
                if (!/^\d+$/.test(currentGame.appid)) throw new Error("Invalid Steam app ID.");
                const script = "Start-Process -FilePath $env:GAME_SCROLLER_STEAM_URI -ErrorAction Stop";
                await new Promise<void>((resolve,reject) => execFile("powershell.exe", ["-NoProfile","-NonInteractive","-Command",script],
                    {windowsHide:true,timeout:15000,env:{...process.env,GAME_SCROLLER_STEAM_URI:`steam://rungameid/${currentGame.appid}`}}, error => error ? reject(error) : resolve()));
            }
            logger.info(`${provider} launch request sent.`);
        } catch (error) {
            logger.error("Error requesting game launch:", error);
            if (this.launchAnimations.get(dialAction.id) === animation) {
                this.stopLaunchAnimation(dialAction.id);
                this.launchFeedbackUntil.set(dialAction.id, Date.now() + 3000);
                launchFailed = true;
                await dialAction.setFeedback({ currentGameIcon: { value: "" }, currentGameTitle: { value: "Check launcher" }, providerName: { value: "Launch failed" } });
            }
        } finally {
            setTimeout(() => {
                this.launchPending.delete(currentGame.appid);
                // Restore the current selection, even if the dial moved during launch.
                // A replaced/disappeared context must not receive stale feedback.
                if (this.contexts.get(dialAction.id) === contextData &&
                    (this.launchAnimations.get(dialAction.id) === animation ||
                     (launchFailed && !this.launchAnimations.has(dialAction.id)))) {
                    this.updateWheelForContext(dialAction.id);
                }
            }, 3000).unref();
        }
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<FilterSettings>): Promise<void> {
        const dialAction = ev.action as DialAction<FilterSettings>;
        const context = dialAction.id;
        const settings = ev.payload.settings;
        const steamDir = await this.getEffectiveSteamDir(settings.customSteamDir);
        const validationError = this.validateSteamDir(steamDir);

        if (validationError) {
            await dialAction.setFeedback({
                prevGameIcon: { value: "" },
                prevGameTitle: { value: "" },
                currentGameIcon: { value: "" },
                currentGameTitle: { value: validationError },
                nextGameIcon: { value: "" },
                nextGameTitle: { value: "" }
            });
            return;
        }

        const previousContext = this.contexts.get(context);
        const previousSteamDir = previousContext?.steamDir;
        await this.setContext(context, dialAction, settings);

        if (previousSteamDir !== steamDir) {
            logger.info(`Steam directory changed for ${context}: ${steamDir}`);
        }

        const contextData = this.contexts.get(context);
        if (!contextData) {
            return;
        }

        // Settings notifications must not write settings back: that can create an event loop.
    }

    override onWillDisappear(ev: WillDisappearEvent<FilterSettings>): void {
        this.stopLaunchAnimation(ev.action.id);
        this.contexts.delete(ev.action.id);
        this.initializingContexts.delete(ev.action.id);
    }
}
