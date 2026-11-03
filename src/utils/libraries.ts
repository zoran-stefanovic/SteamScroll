import type { CustomSteamFilter, GlobalPluginSettings, SteamGameWithType } from './types';

export const LIBRARIES = ['steam', 'epic', 'battlenet'] as const;
export type LibraryId = typeof LIBRARIES[number];
export type LibraryPreset = LibraryId | 'all';
export function selectedLibraries(value: unknown, preset: LibraryPreset): LibraryId[] {
    if (!Array.isArray(value)) return preset === 'all' ? [...LIBRARIES] : [preset];
    return LIBRARIES.filter(id => value.includes(id));
}
export function gameProvider(game: Pick<SteamGameWithType, 'appid'>): LibraryId {
    return game.appid.startsWith('epic:') ? 'epic' : game.appid.startsWith('battlenet:') ? 'battlenet' : 'steam';
}
export function matchesSteamType(game: SteamGameWithType, filters: string[]): boolean {
    if (gameProvider(game) !== 'steam') return true;
    const type = game.type.toLowerCase();
    return filters.some(filter => type === filter || (filter === 'game' && type === 'demo'));
}
// Preserve old keys on disk. Shared collections are an overlay, including deletion tombstones.
export function sharedCollections(settings: Partial<GlobalPluginSettings> = {}): CustomSteamFilter[] {
    const valid = (value: unknown): CustomSteamFilter[] => Array.isArray(value) ? value.filter(f => f && typeof f.id === 'string' && typeof f.name === 'string' && Array.isArray(f.appids)).map(f => ({id:f.id, name:f.name, appids:f.appids.filter((id: unknown) => typeof id === 'string'), updatedAt:typeof f.updatedAt === 'string' ? f.updatedAt : ''})) : [];
    const legacy = [...valid(settings.customFilters), ...valid(settings.epicCustomFilters).map(f => ({...f, id:`legacy-epic:${f.id}`}))];
    const result = new Map(legacy.map(f => [f.id, f]));
    for (const f of valid(settings.gameCollections)) result.set(f.id, f);
    const deleted = Array.isArray(settings.deletedGameCollections) ? settings.deletedGameCollections : [];
    return [...result.values()].filter(f => !deleted.includes(f.id));
}
export function selectedCollectionId(value: unknown, preset: LibraryPreset, schema: unknown): string | null {
    if (typeof value !== 'string' || !value) return null;
    return preset === 'epic' && schema !== 1 ? `legacy-epic:${value}` : value;
}
