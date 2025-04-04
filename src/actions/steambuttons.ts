// src/actions/steamButtonsPageAction.ts
import streamDeck, {
    action,
    SingletonAction,
    WillAppearEvent,
    KeyDownEvent,
    DidReceiveSettingsEvent,
    JsonObject
  } from "@elgato/streamdeck";
  import { getSteamGamesWithTypes } from "../utils/steam-games";
  import { SteamGameWithType } from "../utils/types";
  
  // Our settings extend JsonObject.
  interface ButtonPageSettings extends JsonObject {
    pageIndex?: number;
    customSteamDir?: string;
    filteroptions?: string[];
    totalKeys?: number;
    buttonIndex?: number;
    lastScrollIndex?: number;
  }
  
  @action({ UUID: "com.zstefanovic.steamscroll.buttons" })
  export class SteamButtonsPageAction extends SingletonAction<JsonObject> {
    // Global state for the page.
    private pageIndex: number = 0;
    private games: SteamGameWithType[] = [];
    private defaultSteamDir: string = "C:/Program Files (x86)/Steam";
    private customSteamDir: string = this.defaultSteamDir;
    // For each key’s unique context, we store its button index.
    private contexts: { [context: string]: number } = {};
    // Total keys (buttons) available in this multi-action. Default to 8.
    private totalKeys: number = 8;
  
    // Helper: returns the effective Steam directory.
    private getEffectiveSteamDir(): string {
      return this.customSteamDir && this.customSteamDir.trim() !== ""
        ? this.customSteamDir
        : this.defaultSteamDir;
    }
  
    // Called when a key appears.
    override async onWillAppear(ev: WillAppearEvent<JsonObject>): Promise<void> {
      // (Using a type assertion because TS types may not include our needed properties.)
      const payload = ev as any;
      const context: string = payload.context;
      const settings: ButtonPageSettings = (payload.payload && payload.payload.settings) || {};
  
      // Load settings
      this.pageIndex = settings.pageIndex ?? 0;
      this.customSteamDir =
        settings.customSteamDir && settings.customSteamDir.trim() !== ""
          ? settings.customSteamDir
          : this.defaultSteamDir;
      this.totalKeys = settings.totalKeys ?? 8;
  
      // Determine the button's index.
      // Either use settings.buttonIndex or try to parse the context (which in your case should be unique per key).
      const buttonIndex =
        settings.buttonIndex !== undefined ? settings.buttonIndex : parseInt(context) || 0;
      this.contexts[context] = buttonIndex;
  
      // Load the Steam games.
      this.games = await getSteamGamesWithTypes(this.getEffectiveSteamDir());
  
      // Apply filtering if provided.
      if (settings.filteroptions && settings.filteroptions.length > 0) {
        const filters = settings.filteroptions.map((f) => f.toLowerCase());
        this.games = this.games.filter(game => filters.includes(game.type.toLowerCase()));
      } else {
        // Default filter: show all types.
        settings.filteroptions = ["game", "tool", "application"];
        this.saveSettingsForKey(context, settings);
      }
  
      this.updateFeedbackForKey(context);
    }
  
    // Called when a key is pressed.
    override async onKeyDown(ev: KeyDownEvent<JsonObject>): Promise<void> {
      const payload = ev as any;
      const context: string = payload.context;
      const buttonIndex = this.contexts[context];
      if (buttonIndex === undefined) return;
  
      // Button 0 is reserved for "Back" and the last key for "Next".
      if (buttonIndex === 0) {
        if (this.pageIndex > 0) {
          this.pageIndex--;
          this.saveSettingsForKey(context, {
            pageIndex: this.pageIndex,
            customSteamDir: this.customSteamDir,
            totalKeys: this.totalKeys
          });
          this.updateAllKeysFeedback();
        }
        return;
      }
      if (buttonIndex === this.totalKeys - 1) {
        if (this.hasNextPage()) {
          this.pageIndex++;
          this.saveSettingsForKey(context, {
            pageIndex: this.pageIndex,
            customSteamDir: this.customSteamDir,
            totalKeys: this.totalKeys
          });
          this.updateAllKeysFeedback();
        }
        return;
      }
  
      // Otherwise, it's a game button.
      const gameIndex = this.getGameIndexForKey(buttonIndex);
      const game = this.games[gameIndex];
      if (game) {
        this.launchGame(game);
      }
    }
  
    // Called when settings are updated.
    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonObject>): Promise<void> {
      const payload = ev as any;
      const context: string = payload.context;
      const settings: ButtonPageSettings = (payload.payload && payload.payload.settings) || {};
      this.pageIndex = settings.pageIndex ?? this.pageIndex;
      this.customSteamDir =
        settings.customSteamDir && settings.customSteamDir.trim() !== ""
          ? settings.customSteamDir
          : this.defaultSteamDir;
      this.totalKeys = settings.totalKeys ?? this.totalKeys;
  
      // Reload games.
      this.games = await getSteamGamesWithTypes(this.getEffectiveSteamDir());
      if (settings.filteroptions && settings.filteroptions.length > 0) {
        const filters = settings.filteroptions.map((f) => f.toLowerCase());
        this.games = this.games.filter(game => filters.includes(game.type.toLowerCase()));
      }
      this.updateAllKeysFeedback();
    }
  
    // Given a button index (not the game index), compute the corresponding game index.
    private getGameIndexForKey(buttonIndex: number): number {
      // Reserve index 0 for Back and the last key for Next.
      const gamesPerPage = this.totalKeys - 2;
      return this.pageIndex * gamesPerPage + (buttonIndex - 1);
    }
  
    private hasNextPage(): boolean {
      const gamesPerPage = this.totalKeys - 2;
      return (this.pageIndex + 1) * gamesPerPage < this.games.length;
    }
  
    // Update the feedback (title and image) for a specific key.
    private updateFeedbackForKey(context: string): void {
      const buttonIndex = this.contexts[context];
      if (buttonIndex === 0) {
        // Back button: show a back icon if not on first page.
        const icon = this.pageIndex > 0 ? "back_icon.png" : "";
        this.setFeedback(context, icon, "");
      } else if (buttonIndex === this.totalKeys - 1) {
        // Next button: show a next icon if there is a next page.
        const icon = this.hasNextPage() ? "next_icon.png" : "";
        this.setFeedback(context, icon, "");
      } else {
        const gameIndex = this.getGameIndexForKey(buttonIndex);
        const game = this.games[gameIndex];
        if (game) {
          this.setFeedback(context, game.icon, game.name);
        } else {
          // Clear the key if no game.
          this.setFeedback(context, "", "");
        }
      }
    }
  
    // Update all keys in the multi-action.
    private updateAllKeysFeedback(): void {
      for (const ctx in this.contexts) {
        this.updateFeedbackForKey(ctx);
      }
    }
  
    // Save settings for a particular key using the global plugin API.
    private saveSettingsForKey(context: string, settings: ButtonPageSettings): void {
      // (Using a type assertion on streamDeck to access setSettings.)
      (streamDeck as any).setSettings({ context, payload: settings });
    }
  
    // Launch a Steam game using the steam:// protocol.
    private launchGame(game: SteamGameWithType): void {
      console.log(`Launching game: ${game.name}`);
      import("child_process").then(({ exec }) => {
        exec(`start steam://rungameid/${game.appid}`, (err) => {
          if (err) {
            console.error(`Failed to launch game: ${err.message}`);
          }
        });
      });
    }
  
    // Set feedback on a key by setting its title and image.
    private setFeedback(context: string, icon: string, title: string): void {
      // Since the global streamDeck API in our TS definitions does not have setTitle/setImage,
      // we cast streamDeck to any.
      const sd = streamDeck as any;
      sd.setTitle({ context, title });
      sd.setImage({ context, image: icon });
    }
  }
  