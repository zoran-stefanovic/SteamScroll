import { action } from "@elgato/streamdeck";
import { SteamScroll } from "./steamscroll";

@action({ UUID: "com.zstefanovic.steamscroll.librarydial" })
export class GameScroll extends SteamScroll {
    constructor() { super("all"); }
}
