# SteamScroll 2.4.1.0

- Include Steam demos in the Games base filter, including existing saved collections (#11).
- Add a per-dial Reverse scroll direction checkbox, off by default to preserve the existing direction (#12).
- Respect the magnitude of signed encoder ticks and wrap the selection correctly.
- Preserve plugin/action UUIDs, SDK requirements and the collection format.

Validation: `node tests/regression.mjs` covers demo/type/collection filtering, 28 tick/direction cases, independent instances, saved settings and empty collections. Rollup build and official Elgato CLI validation/packaging passed. Live Property Inspector persistence was verified across plugin and full application restarts, including two instances with opposite settings. The owner confirmed physical operation on Stream Deck +. An installed demo was unavailable for a live demo-specific test.

The distribution package is delivered separately, consistent with the repository excluding generated plugin binaries.
