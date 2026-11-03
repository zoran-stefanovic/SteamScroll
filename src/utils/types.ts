import type { JsonObject } from "@elgato/utils";

export interface SteamGameWithType {
    appid: string;
    name: string;
    icon: string;
    type: string;
}

export interface SteamGameOption extends JsonObject {
    appid: string;
    name: string;
    type: string;
    provider?: string;
}

export interface CustomSteamFilter extends JsonObject {
    id: string;
    name: string;
    appids: string[];
    updatedAt: string;
}

export interface FilterSettings extends JsonObject {
    filteroptions: string[];
    customSteamDir?: string;
    reverseDirection?: boolean;
    lastScrollIndex?: number;
    selectedCustomFilterId?: string | null;
    libraries?: string[];
    collectionSchema?: number;
}

export interface GlobalPluginSettings extends JsonObject {
    customFilters: CustomSteamFilter[];
    epicCustomFilters?: CustomSteamFilter[];
    gameCollections?: CustomSteamFilter[];
    deletedGameCollections?: string[];
}

export interface SteamGamesResponse extends JsonObject {
    games: SteamGameOption[];
    steamDir: string;
    error?: string;
}
