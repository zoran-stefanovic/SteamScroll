import streamDeck, {
    action,
    SingletonAction,
    WillAppearEvent,
    DialRotateEvent,
    DialDownEvent,
} from "@elgato/streamdeck";
import { getSteamGamesWithTypes } from "../utils/steam-games";
import { SteamGameWithType } from "../utils/types";
const initlogger = streamDeck.logger.createScope("steamscroll");

@action({ UUID: "com.zstefanovic.steamscroll.dial" })
export class SteamScroll extends SingletonAction {
    private allGames: SteamGameWithType[] = [];
    private filteredGames: SteamGameWithType[] = [];
    private selectedFilters: string[] = ["Game", "Tool", "Application"]; // Default: all types
    private currentIndex: number = 0; 
    private currentDialAction: any = null; // Add this line
    private isInitializing: boolean = false;

    constructor() {
        super();
        this.initializeGames();
    }

    private async initializeGames(): Promise<void> {
        try {
            initlogger.info("Loading Steam games...");
            if (this.currentDialAction) {
                this.currentDialAction.setFeedback({
                    currentGameTitle: { value: "Loading..." }
                });
            }

            const games = await getSteamGamesWithTypes();
            this.allGames = games;
            
            // Only apply filters after games are loaded
            if (this.allGames.length > 0) {
                this.applyFilters();
                if (this.currentDialAction) {
                    this.updateWheel(this.currentDialAction);
                }
            }

        } catch (error) {
            initlogger.error("Failed to initialize games:", error);
            this.allGames = [];
        }
    }
    
    private applyFilters(): void {
        // Log the current filters
        
        initlogger.info("Selected filters:", this.selectedFilters);
    
        if (this.selectedFilters.length === 0) {
            // No filters selected, show all games
            this.filteredGames = this.allGames;
        } else {
            // Normalize filters to lowercase
            const normalizedFilters = this.selectedFilters.map((filter) => filter.toLowerCase());
            initlogger.debug("Normalized filters:", normalizedFilters);
    
            // Filter games based on selected filters
            this.filteredGames = this.allGames.filter((game) => {
                // Normalize game type for comparison
                const gameType = game.type.toLowerCase();
                const matchesFilter = normalizedFilters.includes(gameType);
    
                if (!matchesFilter) {
                    initlogger.debug(`Filtered out game: ${game.name} (Type: ${game.type}, Normalized: ${gameType})`);
                }
    
                return matchesFilter;
            });
        }
    
        // Log the filtered games
        initlogger.info("Filtered games after applying filters:", this.filteredGames);
    
        // Reset index after applying filters
        this.currentIndex = 0;
    }
    

    private updateWheel(dialAction: any): void {
        if (this.filteredGames.length === 0) {
            dialAction.setFeedback({
                currentGameTitle: { value: "No games available" },
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

    override async onWillAppear(ev: WillAppearEvent): Promise<void> {
        if (this.isInitializing) return;
        this.isInitializing = true;

        this.currentDialAction = ev.action as any;
        const dialAction = ev.action as any;
        const settings = await ev.action.getSettings<{ filteroptions: string[] }>();
        
        dialAction.setFeedback({
            currentGameTitle: { value: "Loading..." },
        });

        this.selectedFilters = settings?.filteroptions || [];
        this.applyFilters();
        this.updateWheel(dialAction);
        
        this.isInitializing = false;
    }

    override async onDialRotate(event: DialRotateEvent): Promise<void> {
        if (this.filteredGames.length === 0) {
            initlogger.info("No games to scroll through.");
            return;
        }

        const ticks = event.payload.ticks;

        if (ticks > 0) {
            this.currentIndex = (this.currentIndex + 1) % this.filteredGames.length;
        } else if (ticks < 0) {
            this.currentIndex = (this.currentIndex - 1 + this.filteredGames.length) % this.filteredGames.length;
        }

        const dialAction = event.action as any;
        this.updateWheel(dialAction);
    }

    override async onDialDown(event: DialDownEvent): Promise<void> {
        if (this.filteredGames.length === 0) {
            initlogger.info("No games available to launch.");
            return;
        }

        const currentGame = this.filteredGames[this.currentIndex];
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
        if (this.isInitializing) return;
        const settings = ev.payload.settings;
    
        // Update selectedFilters with settings or default to an empty array
        this.selectedFilters = settings?.filteroptions || [];
        initlogger.info("Received settings:", settings);
        initlogger.info("Selected filters initialized as:", this.selectedFilters);
    
        // Apply the filters
        this.applyFilters();
    
        // Update wheel settings if needed
        const dialAction = ev.action as any;
        this.updateWheel(dialAction);
    }
}
