# Game Scroller

Turn. Choose. Play.

Version **3.1.0.0** adds one combined game library for Steam, Epic Games and Battle.net. Turn the dial to browse; press to request launch through the selected game's launcher.

## Choose libraries

Add **Game Scroller** to a dial for all three launchers. Every action has the same library checkboxes: select one launcher or any combination. Each dial keeps its own libraries, collection, type filters, position and reverse-direction setting. Refresh after installing or removing games.

## Collections and filters

Collections can contain games from all launchers. Open **Manage collections**, create or edit a collection, select entries and save. The editor shows all discovered libraries. A dial displays the entries matching both its selected libraries and its active collection.

**Steam type filters** distinguish Games (including demos), Tools and Applications. They apply only to Steam; Epic and Battle.net games remain visible regardless of those type checkboxes. Identically named games from different launchers remain separate entries with provider labels.

Existing Steam and Epic action UUIDs and default library choices are preserved. Legacy collections remain available, with their original data retained. New collection changes use shared storage, so a collection can be selected from any action.

## Launcher support

Steam reads its configured libraries and local app information. Epic uses local manifests and requires a complete installation with a local executable; DLC, engine content and stale entries are excluded.

Battle.net uses local product metadata, uninstall registrations and expected game files. The first version supports the researched Diablo III, Diablo IV and Overwatch installations, plus WoW Retail/Classic/Classic Era mappings. Unknown products are reported and test variants without a mapping cannot be launched. Starting is best effort using `Battle.net.exe --exec="launch CODE"`. The launcher handles login, updates and automatic downloads; Game Scroller does not authenticate accounts or directly execute game binaries. See BATTLE-NET.md in the source repository for implementation details and limitations.

**Launching game** means the command was sent; it does not confirm the game is running. If needed, open the launcher, handle its prompts and try again. Icons use local artwork/resources with a placeholder when unavailable.

## Requirements and development

Windows 10+, Stream Deck 6.9+ and a supported dial device. Existing plugin identity and flat Pocket Pixel artwork are retained.

Run `npm run typecheck`, `npm test`, `npm run build`, then the official `streamdeck validate` and `streamdeck pack` commands. Automated tests mock launches. `node tests/inspect-battlenet.mjs` performs read-only local discovery.

Version 3.1.0.0 has been installed and tested locally. A physical Stream Deck + dial successfully started Diablo III through Battle.net. Other Battle.net game launches have not been verified. Automated tests mock launch transport. Marketplace publication is pending.
