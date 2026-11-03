# Battle.net provider

This is a best-effort adapter; no public Blizzard desktop-launch API contract is assumed.

Discovery reads only installation metadata: `%ProgramData%/Battle.net/Agent/product.db`, uninstall registrations, per-install `.product.db`, `.build.info`, expected executables and data directories. No account configuration, cookies or credentials are accessed. Absolute metadata paths support installations on other drives. Missing/stale installs and launcher components are excluded. Unknown IDs produce warnings rather than guessed commands.

Mappings in `src/utils/battlenet-games.ts` distinguish installation codes, variant and launch IDs. Current executable mappings cover D3/D4/Overwatch and WoW Retail/Classic/Classic Era. Additional products need verified executable/variant mappings. A nonempty data directory and build metadata establish an installation candidate, not full asset integrity. Updates may be outstanding; the launcher handles these. Optional prerelease downloads do not become separate games.

Launch re-discovers the selected installation, rejects ambiguous copies, validates the launcher and game Authenticode publisher, and passes one allowlisted `--exec=launch CODE` argument with `shell:false`. It never directly starts a game executable. If Battle.net is not already running, it opens the launcher, waits seven seconds and sends one request. This bounded delay is best effort; slow startup or login may still require the user to open Battle.net and press again. There is no automatic retry loop, download control or login automation.

The shared local Windows icon extractor is reused with a separate `battlenet-icons` cache. Missing/extraction-failed icons use a bundled glyph. Icons are resource reads, not executable launches.

Sources consulted:

- [Lutris mappings and launch syntax](https://github.com/lutris/lutris/blob/master/lutris/services/battlenet.py)
- [Playnite launcher lifecycle](https://github.com/JosefNemec/PlayniteExtensions/blob/master/source/Libraries/BattleNetLibrary/BattleNetGameController.cs)
- [Community protobuf schema](https://github.com/TinkoLiu/blizzard-product-parser/blob/master/src/assets/bundle.json)
- [Elgato dial actions](https://docs.elgato.com/streamdeck/sdk/v2/guides/dials/)

Local read-only check: `node tests/inspect-battlenet.mjs`. Automated fixtures: `node tests/battlenet-regression.mjs`. No game launches occur in either command.
