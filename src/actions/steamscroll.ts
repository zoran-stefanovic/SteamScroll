import streamDeck, {
    action,
    DialAction,
    DialDownEvent,
    DialRotateEvent,
    DidReceiveSettingsEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import * as fs from "fs";
import * as path from "path";
import { getSteamGamesWithTypes } from "../utils/steam-games";
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
}

const DEFAULT_FILTERS = ["game", "tool", "application"];

@action({ UUID: "com.zstefanovic.steamscroll.dial" })
export class SteamScroll extends SingletonAction<FilterSettings> {
    private readonly defaultSteamDir = "C:/Program Files (x86)/Steam";
    private readonly contexts = new Map<string, ContextData>();
    private readonly initializingContexts = new Map<string, boolean>();
    private readonly gamesCache = new Map<string, SteamGameWithType[]>();
    private readonly pendingLoads = new Map<string, Promise<SteamGameWithType[]>>();
    private globalSettings: GlobalPluginSettings = { customFilters: [] };

    constructor() {
        super();
        void this.initializeGlobalSettings();
        streamDeck.settings.onDidReceiveGlobalSettings<GlobalPluginSettings>((ev) => {
            this.globalSettings = this.normalizeGlobalSettings(ev.settings);
            void this.refreshAllContexts();
        });
        streamDeck.ui.onSendToPlugin<PluginRouteRequest, FilterSettings>((ev) => {
            void this.handlePropertyInspectorMessage(ev);
        });
    }

    private async handlePropertyInspectorMessage(
        ev: { action: { getSettings: () => Promise<FilterSettings> }; payload: PluginRouteRequest }
    ): Promise<void> {
        const payload = ev.payload;
        if (payload.__type !== "request" || payload.path !== "public:/steam-games" || typeof payload.id !== "string") {
            return;
        }

        const settings = await ev.action.getSettings();
        const body = await this.getSteamGamesResponse(settings);
        const response: PluginRouteResponse = {
            __type: "response",
            id: payload.id,
            path: payload.path,
            status: 200,
            body
        };

        if (!payload.unidirectional) {
            await streamDeck.ui.sendToPropertyInspector(response);
        }
    }

    private async getSteamGamesResponse(settings: FilterSettings): Promise<SteamGamesResponse> {
        const steamDir = this.getEffectiveSteamDir(settings.customSteamDir);
        const validationError = this.validateSteamDir(steamDir);

        if (validationError) {
            return {
                games: [],
                steamDir,
                error: validationError
            };
        }

        const games = await this.loadGamesForDir(steamDir);
        const compactGames: SteamGameOption[] = games.map((game) => ({
            appid: game.appid,
            name: game.name,
            type: game.type
        }));

        return {
            games: compactGames,
            steamDir
        };
    }

    private normalizeGameType(type: string): string {
        return type.toLowerCase().trim();
    }

    private normalizeSteamDir(steamDir: string): string {
        return steamDir.replace(/[\\/]+$/, "");
    }

    private getEffectiveSteamDir(customSteamDir?: string): string {
        return customSteamDir && customSteamDir.trim() !== ""
            ? this.normalizeSteamDir(customSteamDir)
            : this.defaultSteamDir;
    }

    private normalizeFilters(filters?: string[]): string[] {
        const normalized = (filters && filters.length > 0 ? filters : DEFAULT_FILTERS)
            .map((filter) => this.normalizeGameType(filter));
        return Array.from(new Set(normalized));
    }

    private normalizeGlobalSettings(settings?: Partial<GlobalPluginSettings>): GlobalPluginSettings {
        const customFilters = Array.isArray(settings?.customFilters)
            ? settings.customFilters
                .filter((filter): filter is CustomSteamFilter => {
                    return Boolean(
                        filter &&
                        typeof filter.id === "string" &&
                        typeof filter.name === "string" &&
                        Array.isArray(filter.appids)
                    );
                })
                .map((filter) => ({
                    id: filter.id,
                    name: filter.name,
                    appids: filter.appids.map((appid) => String(appid)),
                    updatedAt: typeof filter.updatedAt === "string" ? filter.updatedAt : new Date(0).toISOString()
                }))
            : [];

        return { customFilters };
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

    private validateSteamDir(steamDir: string): string | null {
        const appInfoPath = path.join(this.normalizeSteamDir(steamDir), "appcache", "appinfo.vdf");
        return fs.existsSync(appInfoPath) ? null : "Bad Steam Dir";
    }

    private async loadGamesForDir(steamDir: string): Promise<SteamGameWithType[]> {
        const normalizedSteamDir = this.normalizeSteamDir(steamDir);
        const cachedGames = this.gamesCache.get(normalizedSteamDir);
        if (cachedGames) {
            return cachedGames;
        }

        const pendingLoad = this.pendingLoads.get(normalizedSteamDir);
        if (pendingLoad) {
            return pendingLoad;
        }

        const loadPromise = getSteamGamesWithTypes(normalizedSteamDir)
            .then((games) => {
                this.gamesCache.set(normalizedSteamDir, games);
                this.pendingLoads.delete(normalizedSteamDir);
                return games;
            })
            .catch((error) => {
                this.pendingLoads.delete(normalizedSteamDir);
                throw error;
            });

        this.pendingLoads.set(normalizedSteamDir, loadPromise);
        return loadPromise;
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

        const allGames = await this.loadGamesForDir(contextData.steamDir);
        const activeCustomFilter = this.getCustomFilter(contextData.selectedCustomFilterId);
        const selectedAppIds = activeCustomFilter ? new Set(activeCustomFilter.appids) : null;

        contextData.filteredGames = allGames.filter((game) => {
            const normalizedType = this.normalizeGameType(game.type);
            const matchesType = contextData.filters.some((filter) => normalizedType === filter);
            if (!matchesType) {
                return false;
            }

            if (!selectedAppIds) {
                return true;
            }

            return selectedAppIds.has(game.appid);
        });

        if (contextData.filteredGames.length > 0 && contextData.currentIndex >= contextData.filteredGames.length) {
            contextData.currentIndex = contextData.currentIndex % contextData.filteredGames.length;
        } else if (contextData.filteredGames.length === 0) {
            contextData.currentIndex = 0;
        }

        this.updateWheelForContext(context);
    }

    private updateWheelForContext(context: string): void {
        const contextData = this.contexts.get(context);
        if (!contextData) {
            return;
        }

        if (contextData.filteredGames.length === 0) {
            void contextData.dialAction.setFeedback({
                prevGameIcon: { value: "" },
                prevGameTitle: { value: "" },
                currentGameIcon: { value: "" },
                currentGameTitle: { value: "No games" },
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
                    customSteamDir: contextData.steamDir,
                    filteroptions: contextData.filters,
                    lastScrollIndex: contextData.currentIndex,
                    selectedCustomFilterId: null
                });
            }

            await this.applyFiltersForContext(context);
        }
    }

    private async setContext(
        context: string,
        dialAction: DialAction<FilterSettings>,
        settings: FilterSettings
    ): Promise<void> {
        const filters = this.normalizeFilters(settings.filteroptions);
        const steamDir = this.getEffectiveSteamDir(settings.customSteamDir);
        const selectedCustomFilterId = settings.selectedCustomFilterId ?? null;

        this.contexts.set(context, {
            dialAction,
            steamDir,
            filters,
            currentIndex: typeof settings.lastScrollIndex === "number" ? settings.lastScrollIndex : 0,
            filteredGames: [],
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
            const settings = await dialAction.getSettings<FilterSettings>();
            const steamDir = this.getEffectiveSteamDir(settings.customSteamDir);
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
                customSteamDir: steamDir,
                filteroptions: this.normalizeFilters(settings.filteroptions),
                lastScrollIndex: settings.lastScrollIndex,
                selectedCustomFilterId: settings.selectedCustomFilterId ?? null
            });

            await dialAction.setSettings({
                customSteamDir: steamDir,
                filteroptions: this.contexts.get(context)?.filters ?? DEFAULT_FILTERS,
                lastScrollIndex: this.contexts.get(context)?.currentIndex ?? 0,
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
        if (ticks > 0) {
            contextData.currentIndex = (contextData.currentIndex - 1 + contextData.filteredGames.length) % contextData.filteredGames.length;
        } else if (ticks < 0) {
            contextData.currentIndex = (contextData.currentIndex + 1) % contextData.filteredGames.length;
        }

        await dialAction.setSettings({
            customSteamDir: contextData.steamDir,
            filteroptions: contextData.filters,
            lastScrollIndex: contextData.currentIndex,
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

        try {
            const { exec } = await import("child_process");
            exec(`start steam://rungameid/${currentGame.appid}`, (err) => {
                if (err) {
                    logger.error(`Failed to launch game: ${err.message}`);
                } else {
                    logger.info(`Game launched successfully: ${currentGame.name}`);
                }
            });
        } catch (error) {
            logger.error("Error executing game launch:", error);
        }
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<FilterSettings>): Promise<void> {
        const dialAction = ev.action as DialAction<FilterSettings>;
        const context = dialAction.id;
        const settings = ev.payload.settings;
        const steamDir = this.getEffectiveSteamDir(settings.customSteamDir);
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

        await dialAction.setSettings({
            customSteamDir: contextData.steamDir,
            filteroptions: contextData.filters,
            lastScrollIndex: contextData.currentIndex,
            selectedCustomFilterId: contextData.selectedCustomFilterId
        });
    }
}
