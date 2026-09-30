# Notice — Terra Atlas is a modified version of World Monitor

This repository is a fork of **[World Monitor](https://github.com/koala73/worldmonitor)**,
Copyright (C) 2024-2026 Elie Habib, licensed under the GNU Affero General Public License v3.0 only (AGPL-3.0-only).

**Terra Atlas** additions and modifications — Copyright (C) 2026 Aleksander Norman — are released under the same
licence (see [`LICENSE`](LICENSE)). As required by section 5 of the AGPL, this file states the changes:

| Date | Change |
|---|---|
| 2026-09 | Added `site/` — a static, server-free multi-page website for GitHub Pages: landing page, the Terra Atlas 3D globe app (`site/app/`), learning hub, Fluid lab, download page and credits. |
| 2026-09 | Added `tools/extract-upstream-data.mjs`, which exports World Monitor's curated static datasets (from `src/config` and `shared/`) to `site/app/data/worldmonitor-static.json`. Upstream datasets are unmodified apart from dropping fields the static site does not use. |
| 2026-09 | Copied World Monitor's textures and country outlines into `site/app/`. |
| 2026-09 | Added `desktop/` — a Tauri 2 desktop shell that packages `site/`. |
| 2026-09 | Added `video/` (Remotion promo), `.github/workflows/pages.yml`, `desktop.yml`, `video.yml`; parked upstream workflows in `.github/workflows-upstream/`. |
| 2026-09 | Replaced `README.md` with the Terra Atlas README; the original is kept as `README.worldmonitor.md`. |

| 2026-09 | v1.1: live flights with a seatback flight view, public traffic cameras and OpenStreetMap-mapped licence-plate readers (`tools/fetch-cameras.mjs`, `tools/fetch-alpr.mjs`, `.github/workflows/data.yml`), clickable satellites, city and airport layers, map-style pins and navigation, and faster loading. |
| 2026-09 | v1.2: London and Hong Kong cameras, video clips, a density view for 150,000+ mapped licence-plate readers, weekly ALPR refresh. |
| 2026-09 | v1.3: live ticker, feed and live tour; GDELT news pins; official crime-report layer; camera wall; Apply button and presets; layer counts; flight emergencies; fixes for shared-object removal and stale address-bar layer lists. |
| 2026-09 | v1.4: Overwatch HUD and area scan, NASA GIBS overlays, power plants (WRI), internet facilities (PeeringDB) and KiwiSDR receivers (`tools/fetch-networks.mjs`), Baltic ships and Finnish cameras (Digitraffic), satellite footprints. |
| 2026-09 | v1.5: fast marker renderer (instanced columns, sprite pins and names, grid-index picking), decluttering and cluster badges, hover cards, time-sliced updates, shader pre-compilation, quality governor. |
| 2026-09 | v1.6: time machine (`clock.js`), Trace connections, rocket launches and GDACS alerts (`launches.js`), wind and temperature (`wind.js`, `tools/fetch-weather.mjs` in the Pages deploy), ground-anchored pins at every zoom. |
| 2026-09 | v1.7: live-data snapshot for CORS-blocked feeds (`tools/fetch-live.mjs`, `.github/workflows/live.yml`, orphan `live-data` branch), fallback routes in `feeds.js` (desktop native fetch → direct → optional proxy → snapshot) and dead-reckoned flights (`flights.js`); desktop `fetch_text` Rust command with a host allowlist (`desktop/src-tauri/src/lib.rs`, adds the `reqwest` crate, MIT/Apache-2.0); optional Cloudflare Worker proxy (`proxy/`); idle render governor (`perf.js`); Moon and tides (`moon.js`, `astro.js` moonState); command palette, saved views, ISS ride-along and flights board (`extras.js`); visible per-layer source notes. |
| 2026-09 | v1.8: markers redrawn as bare type symbols (`icons.js` rewritten as 55 vector glyphs; `markers.js` `drawGlyph`, centred sprites, badge hit-testing), symbol sizes by importance, per-layer symbol keys and filters (`main.js`), type-specific symbols for ships (AIS type), power plants (fuel), crime (category), natural events, GDACS, internet buildings, Sun, Moon and space stations; symbols in hover cards, field notes and the Live feed (`live.js`). |

Nothing under `src/`, `server/`, `api/`, `shared/` or other upstream directories has been changed.
"World Monitor" is the original author's project name; Terra Atlas does not use it as its own brand.

Third-party components bundled in `site/` keep their own licences — see [`docs/REFERENCES.md`](docs/REFERENCES.md) and `site/credits/`.
