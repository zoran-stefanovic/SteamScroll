# Game Scroller 3.1.0.0

SteamScroll is now Game Scroller, with Steam, Epic Games and Battle.net in one configurable dial action. The plugin UUID is unchanged. This repository provides the current source and installation package; Marketplace publication is pending.

## Features

- One visible **Game Scroller** action; choose one launcher or any combination. Legacy action UUIDs remain hidden compatibility entries, preserving existing dials and settings.
- Shared collections across launchers. Existing Steam and Epic collections remain available, including colliding legacy IDs.
- Steam installation detection through Windows registry entries, with an optional fallback folder. Steam library folders can be on other drives.
- Epic detection from local manifests and Battle.net detection from local installation metadata and validated files.
- Steam-only Games/Tools/Applications filters; demos are included in Games.
- Reverse scroll direction and independent library/collection settings per dial.
- Local game icons load progressively after the game list, with fallback artwork while unavailable. Background updates preserve launch feedback.
- **Launching game** animation during a launch request, followed by restoration of the game selection. This is not confirmation that a game has finished starting.
- Compact settings and updated Game Scroller artwork.

## Review fixes

- Snapshot collection state before asynchronous settings reads so a concurrently added collection is not incorrectly marked deleted.
- Return game metadata without waiting for executable icon extraction. Two workers per scan update icons progressively, including collections with only one or two games.
- Give library requests an explicit 20-second timeout for remaining registry/parser work.
- Replace the stale repository installer with a package whose manifest and runtime match this version.

## Validation and limitations

TypeScript typecheck, all eight regression suites, Rollup build and official Elgato validation passed. Automatic tests mock game launches. A physical dial launch of Diablo III was verified locally; Diablo IV, Overwatch and other variants have not been verified by launch.

Battle.net commands remain best effort. Sign-in, updates and prompts are handled by the launcher. See [BATTLE-NET.md](BATTLE-NET.md).

Known issue: a slow initialization may finish after a dial disappears during a rapid page/profile switch. The lifecycle-race finding from the review is not fixed in this version.
