# Terra Atlas live-data

Machine-written snapshots for https://normansrule.github.io/worldmonitor/app/ — rebuilt every ~10 minutes by `.github/workflows/live.yml` on the main branch. Nothing here is edited by hand; each run replaces the whole branch.

Last run: 2026-10-09T01:08:26.203Z

- **flights**: ok — 9204 aircraft from OpenSky Network (worldwide, API client), 625 KB
- **gdacs**: ok — 100 events
- **launches**: ok — fresh enough
- **tle**: ok — fresh enough

Data: OpenSky Network / airplanes.live / adsb.lol (flights), The Space Devs (launches), GDACS (disaster alerts), CelesTrak (orbits). See docs/REFERENCES.md on main for licences.
