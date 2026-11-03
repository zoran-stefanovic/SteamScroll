import { action } from "@elgato/streamdeck";
import { SteamScroll } from "./steamscroll";

@action({ UUID: "com.zstefanovic.steamscroll.epicdial" })
export class EpicScroll extends SteamScroll {
    constructor() { super("epic"); }
}
