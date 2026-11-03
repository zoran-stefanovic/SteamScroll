import { action } from "@elgato/streamdeck";
import { SteamScroll } from "./steamscroll";

@action({ UUID: "com.zstefanovic.steamscroll.battlenetdial" })
export class BattleNetScroll extends SteamScroll {
    constructor() { super("battlenet"); }
}
