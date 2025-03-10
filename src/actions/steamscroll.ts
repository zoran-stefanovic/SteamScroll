import streamDeck, {
    action,
    SingletonAction,
    WillAppearEvent,
    DialRotateEvent,
    DialDownEvent,
} from "@elgato/streamdeck";
import { getSteamGamesWithTypes } from "../utils/steam-games";
import { SteamGameWithType } from "../utils/types";
import { JsonObject, JsonValue } from '@elgato/streamdeck';
import * as fs from 'fs';
import * as path from 'path';

const initlogger = streamDeck.logger.createScope("steamscroll");

interface GameType {
    name: string;
    icon: string;
    type: string;
}

interface FilterSettings extends JsonObject {
    filteroptions: string[];
    customSteamDir?: string;
    [key: string]: JsonValue;
}

interface ContextData {
    dialAction: any;
    filters: string[];
    currentIndex: number;
    filteredGames: SteamGameWithType[];
}

@action({ UUID: "com.zstefanovic.steamscroll.dial" })
export class SteamScroll extends SingletonAction {
    private allGames: SteamGameWithType[] = [];
    private filteredGames: SteamGameWithType[] = [];
    private selectedFilters: string[] = ["game", "tool", "application"];
    private currentIndex: number = 0;
    private currentDialAction: any = null;
    private initializingContexts: Map<string, boolean> = new Map();
    private contexts: Map<string, ContextData> = new Map();
    private isLoading: boolean = true;
    private loadError: string | null = null;
    // Nieuwe property om de custom Steam directory op te slaan
    private customSteamDir?: string;

    constructor() {
        super();
        this.initializeGames();
    }

    private normalizeGameType(type: string): string {
        return type.toLowerCase().trim();
    }

    private async waitForGamesLoaded(): Promise<void> {
        if (!this.filteredGames || this.filteredGames.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    private async initializeGames(): Promise<void> {
        try {
            initlogger.info("Loading Steam games...");
            this.isLoading = true;
            // Gebruik de customSteamDir (of default) bij het laden van de games
            this.allGames = await getSteamGamesWithTypes(this.customSteamDir);
            this.isLoading = false;
            
            // Update alle contexts nadat de games zijn geladen
            for (const [context, contextData] of this.contexts.entries()) {
                await this.applyFiltersForContext(context);
                this.updateWheelForContext(context);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : 'Unknown error occurred';
                
            this.loadError = errorMessage;
            initlogger.error("Failed to load games:", errorMessage);
        }
    }
    
    private async applyFilters(): Promise<void> {
        if (!this.selectedFilters || !this.allGames) {
            return;
        }

        this.filteredGames = this.allGames.filter(game => {
            const normalizedType = this.normalizeGameType(game.type);
            return this.selectedFilters.some(filter => 
                this.normalizeGameType(filter) === normalizedType
            );
        });

        initlogger.debug(`Filtered games count: ${this.filteredGames.length}`);
    }

    private async applyFiltersForContext(context: string): Promise<void> {
        if (this.isLoading) {
            return;
        }
        
        const contextData = this.contexts.get(context);
        if (!contextData || !this.allGames) return;

        const filteredGames = this.allGames.filter(game => {
            const normalizedType = this.normalizeGameType(game.type);
            return contextData.filters.some(filter => 
                this.normalizeGameType(filter) === normalizedType
            );
        });

        contextData.filteredGames = filteredGames;
        initlogger.debug(`Filtered games count for context ${context}: ${filteredGames.length}`);
        
        this.updateWheelForContext(context);
    }

    private updateWheel(dialAction: any): void {
        if (this.filteredGames.length === 0) {
            dialAction.setFeedback({
                currentGameTitle: { value: "Loading.." },
            });
            return;
        }
 
        const prevIndex = (this.currentIndex - 1 + this.filteredGames.length) % this.filteredGames.length;
        const nextIndex = (this.currentIndex + 1) % this.filteredGames.length;

        const prevGame = this.filteredGames[prevIndex];
        const currentGame = this.filteredGames[this.currentIndex];
        const nextGame = this.filteredGames[nextIndex];

        dialAction.setFeedback({
            prevGameIcon: { value: prevGame.icon },
            prevGameTitle: { value: prevGame.name },
            currentGameIcon: { value: currentGame.icon },
            currentGameTitle: { value: currentGame.name },
            nextGameIcon: { value: nextGame.icon },
            nextGameTitle: { value: nextGame.name },
        });
    } 

    private updateWheelForContext(context: string): void {
        const contextData = this.contexts.get(context);
        if (!contextData) return;

        if (contextData.filteredGames.length === 0) {
            contextData.dialAction.setFeedback({
                currentGameTitle: { value: "Loading.." },
            });
            return;
        }
 
        const prevIndex = (contextData.currentIndex - 1 + contextData.filteredGames.length) % contextData.filteredGames.length;
        const nextIndex = (contextData.currentIndex + 1) % contextData.filteredGames.length;

        const prevGame = contextData.filteredGames[prevIndex];
        const currentGame = contextData.filteredGames[contextData.currentIndex];
        const nextGame = contextData.filteredGames[nextIndex];

        contextData.dialAction.setFeedback({
            prevGameIcon: { value: prevGame.icon },
            prevGameTitle: { value: prevGame.name },
            currentGameIcon: { value: currentGame.icon },
            currentGameTitle: { value: currentGame.name },
            nextGameIcon: { value: nextGame.icon },
            nextGameTitle: { value: nextGame.name },
        });
    }

    private async handleContext(context: string, action: any, filters: string[]): Promise<void> {
        this.contexts.set(context, {
            dialAction: action,
            filters: filters.map(f => this.normalizeGameType(f)),
            currentIndex: 0,
            filteredGames: []
        });
        
        await this.applyFiltersForContext(context);
        this.updateWheelForContext(context);
    }

    override async onWillAppear(ev: WillAppearEvent): Promise<void> {
        const context = ev.action.id;
        initlogger.debug("Processing event:", context);
        
        if (this.initializingContexts.get(context)) {
            initlogger.warn(`Already initializing context: ${context}`);
            return;
        }
        
        this.initializingContexts.set(context, true);
        
        try {
            this.currentDialAction = ev.action as any;
            const settings = await ev.action.getSettings<FilterSettings>();
    
            // Accept customSteamDir even if it's an empty string.
            if (settings.customSteamDir !== undefined) {
                this.customSteamDir = settings.customSteamDir;
            }
            
            if (!settings?.filteroptions) {
                throw new Error("Invalid filter settings");
            }
            
            this.selectedFilters = settings.filteroptions.map(f => this.normalizeGameType(f));
    
            // When building the actual path, substitute the default if the value is empty.
            const steamDir = (this.customSteamDir !== undefined && this.customSteamDir !== "" ? this.customSteamDir : "C:/Program Files (x86)/Steam");
            const normalizedSteamDir = steamDir.replace(/[\\/]+$/, "");
            const appInfoPath = path.join(normalizedSteamDir, "appcache", "appinfo.vdf");
    
            // Check if appinfo.vdf exists—if not, set feedback and stop further processing.
            if (!fs.existsSync(appInfoPath)) {
                this.currentDialAction?.setFeedback({
                    currentGameIcon: { value: "" },
                    currentGameTitle: { value: "Bad Steam Dir" }
                });
                return;
            }
            
            // If valid, load the games using the resolved steamDir.
            this.allGames = await getSteamGamesWithTypes(steamDir);
            await this.waitForGamesLoaded();
            await this.applyFilters();
            await this.updateWheel(this.currentDialAction);
        } catch (error) {
            initlogger.error(`Error in onWillAppear: ${error}`);
            this.currentDialAction?.setFeedback({
                currentGameTitle: { value: "Error loading games" }
            });
        } finally {
            this.initializingContexts.set(context, false);
        }
    }
    

    override async onDialRotate(event: DialRotateEvent): Promise<void> {
        const context = event.action.id;
        const contextData = this.contexts.get(context);
        
        if (!contextData || contextData.filteredGames.length === 0) {
            initlogger.info("No games to scroll through.");
            return;
        }

        const ticks = event.payload.ticks;

        if (ticks > 0) {
            contextData.currentIndex = (contextData.currentIndex + 1) % contextData.filteredGames.length;
        } else if (ticks < 0) {
            contextData.currentIndex = (contextData.currentIndex - 1 + contextData.filteredGames.length) % contextData.filteredGames.length;
        }

        this.updateWheelForContext(context);
    }

    override async onDialDown(event: DialDownEvent): Promise<void> {
        const context = event.action.id;
        const contextData = this.contexts.get(context);
        
        if (!contextData || contextData.filteredGames.length === 0) {
            initlogger.info("No games available to launch.");
            return;
        }

        const currentGame = contextData.filteredGames[contextData.currentIndex];
        initlogger.info(`Launching game: ${currentGame.name}`);

        try {
            const { exec } = await import("child_process");
            exec(`start steam://rungameid/${currentGame.appid}`, (err) => {
                if (err) {
                    initlogger.error(`Failed to launch game: ${err.message}`);
                } else {
                    initlogger.info(`Game launched successfully: ${currentGame.name}`);
                }
            });
        } catch (error) {
            initlogger.error("Error executing game launch:", error);
        }
    }
 
    override async onDidReceiveSettings(ev: any): Promise<void> {
        const context = ev.action.id;
        const settings = ev.payload.settings as FilterSettings;
        
        // Process customSteamDir if it exists (even if it's an empty string)
        if (settings.customSteamDir !== undefined) {
            this.customSteamDir = settings.customSteamDir;
            const steamDir = (this.customSteamDir === "" ? "C:/Program Files (x86)/Steam" : this.customSteamDir);
            const normalizedSteamDir = steamDir.replace(/[\\/]+$/, "");
            const appInfoPath = path.join(normalizedSteamDir, "appcache", "appinfo.vdf");
        
            // If the file doesn't exist, set feedback and stop further processing.
            if (!fs.existsSync(appInfoPath)) {
                ev.action.setFeedback({
                    currentGameIcon: { value: "" },
                    currentGameTitle: { value: "Bad Steam Dir" }
                });
                return;
            } else {
                this.allGames = await getSteamGamesWithTypes(steamDir);
            }
        }
        
        // Always update context with filter options, whether or not customSteamDir changed.
        await this.handleContext(context, ev.action, settings?.filteroptions || []);
    }
    
    
}
 