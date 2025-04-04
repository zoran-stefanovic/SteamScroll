import streamDeck, { LogLevel } from "@elgato/streamdeck";
import { SteamScroll } from "./actions/steamscroll";

// Enable TRACE logging to see detailed messages
streamDeck.logger.setLevel(LogLevel.TRACE);

// Register the dial action...
streamDeck.actions.registerAction(new SteamScroll());



// Finally, connect to the Stream Deck.
streamDeck.connect();
