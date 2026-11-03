import streamDeck from "@elgato/streamdeck";
import { SteamScroll } from "./actions/steamscroll";
import { EpicScroll } from "./actions/epicscroll";

import { GameScroll } from "./actions/gamescroll";
import { BattleNetScroll } from "./actions/battlenetscroll";

// Enable TRACE logging to see detailed messages
streamDeck.logger.setLevel("trace");

// Register the dial action...
streamDeck.actions.registerAction(new SteamScroll());
streamDeck.actions.registerAction(new EpicScroll());
streamDeck.actions.registerAction(new GameScroll());
streamDeck.actions.registerAction(new BattleNetScroll());



// Finally, connect to the Stream Deck.
streamDeck.connect();
