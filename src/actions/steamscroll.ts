import streamDeck, {
    action,
    SingletonAction,
    WillAppearEvent,
    DialRotateEvent,
    DialDownEvent,
    DialAction,
    JsonObject
  } from "@elgato/streamdeck";
  import { getSteamGamesWithTypes } from "../utils/steam-games";
  import { SteamGameWithType } from "../utils/types";
  import { JsonValue } from '@elgato/streamdeck';
  import * as fs from 'fs';
  import * as path from 'path';
  
  const initlogger = streamDeck.logger.createScope("steamscroll");
  
  interface FilterSettings extends JsonObject {
    filteroptions: string[];
    customSteamDir?: string;
    lastScrollIndex?: number;
    [key: string]: JsonValue;
  }
  
  interface ContextData {
    dialAction: DialAction<JsonObject>;
    filters: string[];
    currentIndex: number;
    filteredGames: SteamGameWithType[];
  }
  
  @action({ UUID: "com.zstefanovic.steamscroll.dial" })
  export class SteamScroll extends SingletonAction {
    private allGames: SteamGameWithType[] = [];
    private currentDialAction: DialAction<JsonObject> | null = null;
    private initializingContexts: Map<string, boolean> = new Map();
    private contexts: Map<string, ContextData> = new Map();
    private isLoading: boolean = true;
    private loadError: string | null = null;
    private customSteamDir?: string;
    private defaultSteamDir = "C:/Program Files (x86)/Steam";
  
    constructor() {
      super();
      this.initializeGames();
    }
  
    private normalizeGameType(type: string): string {
      return type.toLowerCase().trim();
    }
  
    // Returns the effective Steam directory: custom if non-empty, else default.
    private getEffectiveSteamDir(): string {
      return this.customSteamDir && this.customSteamDir.trim() !== ""
        ? this.customSteamDir
        : this.defaultSteamDir;
    }
  
    private async waitForGamesLoaded(): Promise<void> {
      if (!this.allGames || this.allGames.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  
    private async initializeGames(): Promise<void> {
      try {
        initlogger.info("Loading Steam games...");
        this.isLoading = true;
        const steamDir = this.getEffectiveSteamDir();
        this.allGames = await getSteamGamesWithTypes(steamDir);
        this.isLoading = false;
        
        // Refresh each context after games are loaded
        for (const [context, _] of this.contexts.entries()) {
          await this.applyFiltersForContext(context);
          this.updateWheelForContext(context);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        this.loadError = errorMessage;
        initlogger.error("Failed to load games:", errorMessage);
      }
    }
  
    private async applyFiltersForContext(context: string): Promise<void> {
      if (this.isLoading) {
        return;
      }
      const contextData = this.contexts.get(context);
      if (!contextData || !this.allGames) return;
  
      // Filter the games based on each context's filters
      const filteredGames = this.allGames.filter(game => {
        const normalizedType = this.normalizeGameType(game.type);
        initlogger.debug(`Game "${game.name}" has type: "${normalizedType}"`);
        // Using strict equality; change to includes() if needed.
        return contextData.filters.some(filter => normalizedType === filter);
      });
  
      contextData.filteredGames = filteredGames;
      initlogger.debug(`Filtered games count for context ${context}: ${filteredGames.length}`);
      this.updateWheelForContext(context);
    }
  
    private updateWheelForContext(context: string): void {
      const contextData = this.contexts.get(context);
      if (!contextData) return;
  
      // If the stored index is too high, wrap it into the valid range.
      if (contextData.filteredGames.length > 0 && contextData.currentIndex >= contextData.filteredGames.length) {
        contextData.currentIndex = contextData.currentIndex % contextData.filteredGames.length;
      }
  
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
  
    private async handleContext(
      context: string,
      action: DialAction<JsonObject>,
      filters: string[],
      initialIndex: number = 0
    ): Promise<void> {
      this.contexts.set(context, {
        dialAction: action,
        filters: filters.map(f => this.normalizeGameType(f)),
        currentIndex: initialIndex,
        filteredGames: []
      });
      await this.applyFiltersForContext(context);
      this.updateWheelForContext(context);
    }
  
    override async onWillAppear(ev: WillAppearEvent): Promise<void> {
      const dialAction = ev.action as DialAction<JsonObject>;
      const context = dialAction.id;
      initlogger.debug("Processing onWillAppear for context:", context);
  
      if (this.initializingContexts.get(context)) {
        initlogger.warn(`Already initializing context: ${context}`);
        return;
      }
      
      this.initializingContexts.set(context, true);
      
      try {
        this.currentDialAction = dialAction;
        const settings = await dialAction.getSettings<FilterSettings>();
  
        // Treat an empty customSteamDir as the default.
        this.customSteamDir = settings.customSteamDir && settings.customSteamDir.trim() !== ""
          ? settings.customSteamDir
          : this.defaultSteamDir;
  
        // If no filter options are provided, default to ['game','tool','application'].
        if (!settings?.filteroptions || settings.filteroptions.length === 0) {
          initlogger.warn("No filter settings found, defaulting to ['game','tool','application']");
          settings.filteroptions = ['game', 'tool', 'application'];
        }
        const contextFilters = settings.filteroptions.map(f => this.normalizeGameType(f));
        const lastScrollIndex = settings.lastScrollIndex !== undefined ? settings.lastScrollIndex : 0;
        
        const steamDir = this.getEffectiveSteamDir();
        const normalizedSteamDir = steamDir.replace(/[\\/]+$/, "");
        const appInfoPath = path.join(normalizedSteamDir, "appcache", "appinfo.vdf");
      
        if (!fs.existsSync(appInfoPath)) {
          dialAction.setFeedback({
            currentGameIcon: { value: "" },
            currentGameTitle: { value: "Bad Steam Dir" }
          });
          return;
        }
        
        this.allGames = await getSteamGamesWithTypes(steamDir);
        await this.waitForGamesLoaded();
        await this.handleContext(context, dialAction, contextFilters, lastScrollIndex);
        await this.updateWheelForContext(context);
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
        const dialAction = event.action as DialAction<JsonObject>;
        const context = dialAction.id;
        const contextData = this.contexts.get(context);
      
        if (!contextData || contextData.filteredGames.length === 0) {
          initlogger.info("No games to scroll through.");
          return;
        }
      
        const ticks = event.payload.ticks;
      
        if (ticks > 0) {
          contextData.currentIndex = (contextData.currentIndex - 1 + contextData.filteredGames.length) % contextData.filteredGames.length;
        } else if (ticks < 0) {
          contextData.currentIndex = (contextData.currentIndex + 1) % contextData.filteredGames.length;
        }
      
        // Include customSteamDir to preserve the custom path on update
        await dialAction.setSettings({
          customSteamDir: this.customSteamDir,
          filteroptions: contextData.filters,
          lastScrollIndex: contextData.currentIndex
        });
      
        this.updateWheelForContext(context);
      }
      
   
    override async onDialDown(event: DialDownEvent): Promise<void> {
      const dialAction = event.action as DialAction<JsonObject>;
      const context = dialAction.id;
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
        const dialAction = ev.action as DialAction<JsonObject>;
        const context = dialAction.id;
        const settings = ev.payload.settings as FilterSettings;
        const contextData = this.contexts.get(context);
        if (!contextData) return;
      
        // Determine the new custom directory: if empty, use the default.
        const newDir = settings.customSteamDir && settings.customSteamDir.trim() !== ""
          ? settings.customSteamDir
          : this.defaultSteamDir;
        // Store the old effective directory before updating.
        const oldEffectiveDir = this.getEffectiveSteamDir();
        // Update the global customSteamDir.
        this.customSteamDir = newDir;
      
        // If no filteroptions are provided (or it's an empty array), default them.
        const defaultFilters = ['game', 'tool', 'application'];
        const newFilters = (settings.filteroptions && settings.filteroptions.length > 0)
          ? settings.filteroptions.map(f => this.normalizeGameType(f))
          : defaultFilters;
        const currentFilters = contextData.filters;
      
        const shouldReloadGames = newDir !== oldEffectiveDir;
        const shouldReapplyFilters = JSON.stringify(newFilters) !== JSON.stringify(currentFilters);
      
        if (shouldReloadGames || shouldReapplyFilters) {
          if (shouldReloadGames) {
            const normalizedSteamDir = newDir.replace(/[\\/]+$/, "");
            const appInfoPath = path.join(normalizedSteamDir, "appcache", "appinfo.vdf");
            if (!fs.existsSync(appInfoPath)) {
              dialAction.setFeedback({
                currentGameIcon: { value: "" },
                currentGameTitle: { value: "Bad Steam Dir" }
              });
              return;
            }
            this.allGames = await getSteamGamesWithTypes(newDir);
          }
          await this.handleContext(context, dialAction, newFilters);
        }
      
        if (typeof settings.lastScrollIndex === "number" && contextData.currentIndex !== settings.lastScrollIndex) {
          contextData.currentIndex = settings.lastScrollIndex;
          this.updateWheelForContext(context);
        }
    }
      
  }
  