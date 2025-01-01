import streamDeck, {
    action,
    SingletonAction,
    WillAppearEvent,
    DialRotateEvent,
    DialDownEvent,
} from "@elgato/streamdeck";
import { exec } from "child_process";
import { getSteamGames } from "../utils/steam-games"; // Adjust the path based on your project structure

const initlogger = streamDeck.logger.createScope("steamscroll");

@action({ UUID: "com.zstefanovic.steamscroll.dial" })
export class SteamScroll extends SingletonAction {
    private async updateWheel(dialAction: any): Promise<void> {
        const prevIndex = (this.currentIndex - 1 + this.installedGames.length) % this.installedGames.length;
        const nextIndex = (this.currentIndex + 1) % this.installedGames.length;
    
        const prevGame = this.installedGames[prevIndex];
        const currentGame = this.installedGames[this.currentIndex];
        const nextGame = this.installedGames[nextIndex];
    
        // Set feedback
        dialAction.setFeedback({
            prevGameIcon: { value: prevGame.icon },
            prevGameTitle: { value: prevGame.name },
            currentGameIcon: { value: currentGame.icon },
            currentGameTitle: { value: currentGame.name },
            nextGameIcon: { value: nextGame.icon },
            nextGameTitle: { value: nextGame.name }
        });
    }
    
    private installedGames: { appid: string; name: string; icon: string }[] = [];
    private currentIndex: number = 0;

    constructor() {
        super(); 
        // Call the async initialization method
        this.initializeGames();
    }

    override onWillAppear(ev: WillAppearEvent): void | Promise<void> {
        const dialAction = ev.action as any; // Use 'any' to bypass TypeScript issues
    
        if (this.installedGames.length === 0) {
            // Set a loading indicator initially
            dialAction.setFeedback({
                currentGameTitle: { value: "Loading..." }
            });
    
            // Wait for games to load and update the feedback
            const updateFeedback = async () => {
                while (this.installedGames.length === 0) {
                    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for loading
                }
    
                // Once games are loaded, update the wheel layout
                this.updateWheel(dialAction);
            };
    
            updateFeedback();
        } else {
            // Games are already loaded, update the wheel layout
            this.updateWheel(dialAction);
        }
    }
    

    private async initializeGames(): Promise<void> {
        try {
            // Retrieve the list of Steam games
            const games = await getSteamGames();
    
            // Map the result to ensure `icon` is always a string
            this.installedGames = games.map(game => ({
                appid: game.appid,
                name: game.name,
                icon: game.icon || "" // Provide a default value if `icon` is null
            }));
    
            if (this.installedGames.length === 0) {
                initlogger.warn("No Steam games found.");
            } else {
                initlogger.info("Installed games loaded:", this.installedGames);
            }
        } catch (error) {
            initlogger.error("Failed to initialize SteamGames:", error);
            this.installedGames = []; // Set an empty array to avoid issues
        }
    }
    

    override async onDialRotate(event: DialRotateEvent): Promise<void> {
        const ticks = event.payload.ticks;

    if (this.installedGames.length === 0) {
        initlogger.info("No games to scroll through.");
        return;
    }

    // Update the current index based on dial rotation
    if (ticks > 0) {
        this.currentIndex = (this.currentIndex + 1) % this.installedGames.length;
    } else if (ticks < 0) {
        this.currentIndex = (this.currentIndex - 1 + this.installedGames.length) % this.installedGames.length;
    }

    // Update the wheel layout
    const dialAction = event.action as any;
    this.updateWheel(dialAction);
    }

    override async onDialDown(event: DialDownEvent): Promise<void> {
        // Ensure there are games to launch
        if (this.installedGames.length === 0) {
            console.log("No games available to launch.");
            await event.action.setTitle("No games to launch");
            return;
        }

        const currentGame = this.installedGames[this.currentIndex];
        console.log(`Launching game: ${currentGame.name}`);

        exec(`start steam://rungameid/${currentGame.appid}`, (err) => {
            if (err) {
                console.error(`Failed to launch game: ${err.message}`);
                event.action.setTitle("Launch failed"); // Optionally notify the user
            } else {
                console.log(`Game launched successfully: ${currentGame.name}`);
            }
        });
    }

    
}
