import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
let launchError = null, launchCall;
import { load } from './load-ts.mjs';
const epic = load('src/utils/epic-games.ts', { './epic-icons': { EPIC_ICON_FALLBACK: 'fallback-icon' }, 'node:child_process': { execFile: (...args) => {
    launchCall = args; args.at(-1)(launchError);
} } });
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'game-scroller-test-'));
try {
    const manifestDir = path.join(root, 'EpicGamesLauncher', 'Data', 'Manifests');
    const install = path.join(root, 'Game');
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.mkdir(install); await fs.writeFile(path.join(install, 'game.exe'), 'fixture only; never executed');
    const base = { DisplayName: 'Fixture game', AppName: 'game', CatalogNamespace: 'namespace', CatalogItemId: 'item', InstallLocation: install, LaunchExecutable: 'game.exe', bIsIncompleteInstall: false, bIsApplication: true, AppCategories: ['games'] };
    const put = (name, data) => fs.writeFile(path.join(manifestDir, `${name}.item`), JSON.stringify(data));
    await put('valid', base); await put('duplicate', base);
    await put('third', { ...base, AppName: 'third', DisplayName: 'Third game' });
    await put('incomplete', { ...base, AppName: 'incomplete', bIsIncompleteInstall: true });
    await put('incomplete-string', { ...base, AppName: 'incomplete-string', bIsIncompleteInstall: 'true' });
    await put('dlc', { ...base, AppName: 'dlc', MainGameAppName: 'game' });
    await put('plugin', { ...base, AppName: 'plugin', AppCategories: ['ue.plugins'] });
    await put('engine', { ...base, AppName: 'UE_5.6' });
    await put('not-application', { ...base, AppName: 'content', bIsApplication: false });
    await put('missing', { ...base, AppName: 'missing', LaunchExecutable: 'missing.exe' });
    await put('stale', { ...base, AppName: 'stale', InstallLocation: path.join(root, 'removed') });
    await put('traversal', { ...base, AppName: 'traversal', LaunchExecutable: '../outside.exe' });
    await put('nonlaunchable', { ...base, AppName: 'nonlaunchable', LaunchExecutable: '' });
    await fs.writeFile(path.join(manifestDir, 'broken.item'), '{bad');
    await fs.mkdir(path.join(root, 'UnrealEngineLauncher'));
    await fs.writeFile(path.join(root, 'UnrealEngineLauncher', 'LauncherInstalled.dat'), JSON.stringify({ InstallationList: [
        { AppName: 'supplemented', NamespaceId: 'ns', ItemId: 'id', InstallLocation: install },
        { AppName: 'dat-only', NamespaceId: 'ns', ItemId: 'id', InstallLocation: install }
    ] }));
    await put('supplemented', { ...base, AppName: 'supplemented', CatalogNamespace: '', CatalogItemId: '', InstallLocation: '' });
    const library = await epic.discoverEpicGames(root);
    assert.equal(library.games.length, 3); assert.equal(library.warnings.length, 1);
    assert(library.games.every(game => game.appid.startsWith('epic:')));
    assert.equal(epic.epicLaunchUri({ namespace: 'a b', catalogItemId: 'i&?', appName: 'x/y%:' }), 'com.epicgames.launcher://apps/a%20b%3Ai%26%3F%3Ax%2Fy%25%3A?action=launch&silent=true');
    assert.throws(() => epic.epicLaunchUri({ namespace: '', catalogItemId: 'i', appName: 'a' }));
    assert.equal((await epic.discoverEpicGames(path.join(root, 'absent'))).games.length, 0);
    await epic.launchEpicGame(library.games[0]);
    assert.equal(launchCall[0], 'powershell.exe');
    assert(!launchCall[1].join(' ').includes('Fixture game'));
    assert.equal(launchCall[2].env.GAME_SCROLLER_EPIC_URI, epic.epicLaunchUri(library.games[0]));
    launchError = new Error('No protocol handler');
    await assert.rejects(epic.launchEpicGame(library.games[0]), /Could not request launch/);
    await assert.rejects(epic.launchEpicGame({ ...library.games[0], installLocation: path.join(root, 'removed') }), /no longer installed/);

    const listeners = [], replies = [];
    let releaseIcons;
    const iconGate = new Promise(resolve => { releaseIcons = resolve; });
    let iconCalls = 0;
    const sdk = { SingletonAction: class {}, action: () => value => value, logger: { createScope: () => ({ info(){}, warn(){}, error(){} }) },
        settings: { getGlobalSettings: async () => ({ customFilters: [{ id: 'steam', name: 'Old Steam collection', appids: ['123'] }], epicCustomFilters: [{ id: 'epic', name: 'Epic collection', appids: [library.games[0].appid] }] }), onDidReceiveGlobalSettings(){} },
        ui: { onSendToPlugin: listener => listeners.push(listener), sendToPropertyInspector: async value => replies.push(value) } };
    let discoveries = 0;
    const { SteamScroll } = load('src/actions/steamscroll.ts', { '@elgato/streamdeck': { ...sdk, default: sdk }, '../utils/steam-location':{findSteamDirectory:async p=>p||'C:/Program Files (x86)/Steam',clearSteamLocationCache(){}},'../utils/steam-games': { getSteamGamesWithTypes: async () => [{ appid: '123', name: 'Steam game', type: 'game', icon: '' }] },
        '../utils/battlenet-games': {discoverBattleNetGames:async()=>({games:[],warnings:[]})}, '../utils/epic-icons': { getEpicIcon: async () => { iconCalls++; await iconGate; return `loaded-icon-${iconCalls}`; } }, '../utils/epic-games': { ...epic, epicRoot: () => root, discoverEpicGames: async directory => { discoveries++; return epic.discoverEpicGames(directory); } } });
    const plugin = new SteamScroll('epic');
    const dial = id => ({ id, saved: { filteroptions: ['game'] }, writes: 0, async getSettings(){ return this.saved; }, async setSettings(value){ this.writes++; this.saved = value; }, async setFeedback(value){ this.feedback = value; } });
    const a = dial('a'), b = dial('b');
    await plugin.onWillAppear({ action: a, payload: { settings: a.saved } }); await plugin.onWillAppear({ action: b, payload: { settings: b.saved } });
    assert.equal(discoveries, 1);
    assert(iconCalls > 0, 'icon extraction starts after metadata discovery');
    assert(plugin.gamesCache.values().next().value.every(game => game.icon === 'fallback-icon'), 'metadata is cached immediately with fallback icons');
    const listStart = Date.now();
    await plugin.handlePropertyInspectorMessage({ action: a, payload: { __type: 'request', path: 'public:/epic-games', id: 'early-list' } });
    assert(Date.now() - listStart < 1000, 'game list resolves while icon extraction remains blocked');
    assert(replies.at(-1).body.games.length >= 3);
    releaseIcons();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert(plugin.gamesCache.values().next().value.some(game => game.icon.startsWith('loaded-icon-')), 'background icon completion updates the cached game');
    assert.equal(plugin.globalSettings.customFilters.find(f=>f.id==='legacy-epic:epic').id, 'legacy-epic:epic');
    for (const ticks of [-5, -2, -1, 0, 1, 2, 5]) {
        await plugin.setContext('a', a, { filteroptions: ['game'], reverseDirection: false });
        await plugin.setContext('b', b, { filteroptions: ['game'], reverseDirection: true });
        await plugin.onDialRotate({ action: a, payload: { ticks } });
        await plugin.onDialRotate({ action: b, payload: { ticks } });
        assert.equal(plugin.contexts.get('a').currentIndex, ((-ticks % 3) + 3) % 3);
        assert.equal(plugin.contexts.get('b').currentIndex, ((ticks % 3) + 3) % 3);
    }
    const writes = a.writes;
    await plugin.onDidReceiveSettings({ action: a, payload: { settings: a.saved } }); assert.equal(a.writes, writes);
    await plugin.setContext('a', a, { filteroptions: ['game'], selectedCustomFilterId: 'epic' });
    assert.equal(plugin.contexts.get('a').filteredGames.length, 1);
    await plugin.onDialRotate({ action: a, payload: { ticks: 5 } }); assert.equal(plugin.contexts.get('a').currentIndex, 0);
    await plugin.handlePropertyInspectorMessage({ action: a, payload: { __type: 'request', path: 'public:/epic-refresh', id: 'refresh' } });
    assert.equal(discoveries, 4); assert(replies.at(-1).body.games.length >= 3);
    plugin.onWillDisappear({ action: b }); assert(!plugin.contexts.has('b'));
    const steam = new SteamScroll(); await steam.globalSettingsReady;
    assert.equal(steam.globalSettings.customFilters[0].appids[0], '123');
    plugin.loadGamesForDir = async () => { throw new Error('Fixture access error'); };
    await plugin.handlePropertyInspectorMessage({ action: a, payload: { __type: 'request', path: 'public:/epic-games', id: 'error' } });
    assert.match(replies.at(-1).body.error, /Fixture access error/);
    await fs.mkdir(path.join(root,'appcache'),{recursive:true}); await fs.writeFile(path.join(root,'appcache','appinfo.vdf'),'fixture'); assert.equal((await steam.loadGamesForDir(root)).length, 1);
    console.log('PASS: Epic filesystem discovery returns metadata before blocked icon extraction; background icons update cache incrementally; JSON errors, supplemental index, stale/incomplete/DLC/plugins/nonlaunchables, deduplication, encoded URI, missing launcher simulation, per-provider collections/cache/error isolation, two instances, ±ticks, one/zero games, refresh, settings without feedback loop. No game or launcher executed.');
} finally { await fs.rm(root, { recursive: true, force: true }); }
