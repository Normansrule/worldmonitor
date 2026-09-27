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

Nothing under `src/`, `server/`, `api/`, `shared/` or other upstream directories has been changed.
"World Monitor" is the original author's project name; Terra Atlas does not use it as its own brand.

Third-party components bundled in `site/` keep their own licences — see [`docs/REFERENCES.md`](docs/REFERENCES.md) and `site/credits/`.
