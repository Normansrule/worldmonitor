#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas: the "live-data" snapshot.
//
// Several of the best live feeds cannot be read straight from a web page because they don't send
// Cross-Origin Resource Sharing (CORS) headers. Flight trackers are the main example.
// This script runs on GitHub Actions every ~10 minutes (.github/workflows/live.yml). It fetches those
// feeds server-side and writes small JSON files that the workflow force-pushes to an orphan branch
// called `live-data`. raw.githubusercontent.com serves that branch with CORS headers, so the site reads
// it from any browser. The desktop app and the optional proxy fetch live instead.
//
// Usage: node tools/fetch-live.mjs <outDir>
// Optional env: OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET (free OpenSky API client, better quota)
import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'live';
mkdirSync(OUT, { recursive: true });
const UA = { 'User-Agent': 'TerraAtlas/1.7 (+https://github.com/Normansrule/worldmonitor; educational globe)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[live]', ...a);
const status = { generatedAt: new Date().toISOString(), feeds: {} };

async function get(url, { type = 'json', timeout = 45_000, headers = {} } = {}) {
  const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return type === 'text' ? r.text() : r.json();
}
const write = (name, obj) => { const s = typeof obj === 'string' ? obj : JSON.stringify(obj); writeFileSync(join(OUT, name), s); return s.length; };
const ageMin = (name) => {
  const p = join(OUT, name); if (!existsSync(p)) return Infinity;
  try { const j = JSON.parse(readFileSync(p, 'utf8')); if (j.generatedAt) return (Date.now() - Date.parse(j.generatedAt)) / 60_000; } catch { /* text file */ }
  return (Date.now() - statSync(p).mtimeMs) / 60_000;
};

// ------------------------------------------------------------------ flights
// Compact rows: [icao24, callsign, lat, lng, altFt, onGround(0|1), knots, track°, vertical ft/min, squawk, type, registration]
const FIELDS = ['id', 'call', 'lat', 'lng', 'altFt', 'ground', 'kt', 'trk', 'vs', 'squawk', 'type', 'reg'];
const r1 = (x, d = 0) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

async function openskyToken() {
  const id = process.env.OPENSKY_CLIENT_ID; const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const r = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...UA },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }), signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`OpenSky token HTTP ${r.status}`);
  return (await r.json()).access_token;
}
async function fromOpenSky() {
  let token = null;
  try { token = await openskyToken(); } catch (e) { log('OpenSky login failed, trying anonymous:', e.message); }
  const j = await get('https://opensky-network.org/api/states/all', { timeout: 60_000, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const rows = (j.states ?? []).filter((s) => s[5] != null && s[6] != null).map((s) => [
    s[0], (s[1] ?? '').trim(), r1(s[6], 3), r1(s[5], 3), r1((s[13] ?? s[7] ?? 0) * 3.281), s[8] ? 1 : 0,
    s[9] != null ? r1(s[9] * 1.944) : null, r1(s[10] ?? 0), s[11] != null ? r1(s[11] * 196.85) : null, s[14] ?? null, null, null,
  ]);
  return { src: `OpenSky Network (worldwide${token ? ', API client' : ', anonymous'})`, at: (j.time ?? Date.now() / 1000) * 1000, rows };
}
// Regional fallback: community ADS-B exchanges only answer "within N nautical miles of a point", so we
// sweep the busiest airspace (1 request a second to respect their limits) and merge by ICAO address.
const HUBS = [
  [40.6, -74], [42, -87.9], [33.9, -84.4], [32.9, -97], [39.8, -104.7], [34, -118.4], [37.6, -122.4], [47.5, -122.3], [25.8, -80.3], [29.9, -95.3],
  [38.9, -77], [44.9, -93.2], [36.1, -115.2], [33.4, -112], [43.7, -79.6], [49.2, -123.2], [45.5, -73.7], [19.4, -99.1], [21.3, -157.9], [61.2, -150],
  [51.5, -0.4], [49, 2.5], [50, 8.6], [52.3, 4.8], [48.4, 11.8], [41.3, 2.1], [40.5, -3.6], [41.8, 12.3], [47.5, 19.3], [55.6, 12.6], [59.7, 17.9], [52.2, 21],
  [41.3, 28.8], [55.9, 37.4], [25.3, 55.4], [25.3, 51.6], [24.9, 46.7], [30.1, 31.4], [28.6, 77.1], [19.1, 72.9], [13.2, 77.7], [1.36, 103.99], [13.7, 100.7],
  [22.3, 113.9], [31.1, 121.8], [40.1, 116.6], [37.5, 126.4], [35.6, 139.8], [34.4, 135.2], [-33.9, 151.2], [-37.7, 144.8], [-27.4, 153.1], [-31.9, 116],
  [-36.9, 174.8], [-23.4, -46.5], [-34.8, -58.5], [4.7, -74.1], [-12, -77.1], [-33.4, -70.8], [-26.1, 28.2], [-1.3, 36.9], [6.6, 3.3], [9.0, 38.8], [36.7, 3.2],
  [64, -22.6], [53.4, -6.2], [60.2, 11.1], [38.8, -9.1], [37.9, 23.9], [45.4, -75.7], [39.2, -76.7], [35.2, -80.9], [30.2, -97.7], [39.3, -94.7], [40.8, -111.9],
];
function rowFromAdsb(a) {
  return [a.hex, (a.flight ?? '').trim(), r1(a.lat, 3), r1(a.lon, 3), typeof a.alt_baro === 'number' ? a.alt_baro : 0, a.alt_baro === 'ground' ? 1 : 0,
    r1(a.gs), r1(a.track ?? a.true_heading ?? 0), a.baro_rate ?? null, a.squawk ?? null, a.t ?? null, a.r ?? null];
}
async function fromExchanges() {
  const APIS = [
    ['airplanes.live', (la, lo) => `https://api.airplanes.live/v2/point/${la}/${lo}/250`],
    ['adsb.lol', (la, lo) => `https://api.adsb.lol/v2/lat/${la}/lon/${lo}/dist/250`],
    ['adsb.fi', (la, lo) => `https://opendata.adsb.fi/api/v2/lat/${la}/lon/${lo}/dist/250`],
  ];
  for (const [name, url] of APIS) {
    const seen = new Map(); let ok = 0; let fail = 0;
    for (const [la, lo] of HUBS) {
      try { const j = await get(url(la, lo), { timeout: 20_000 }); ok += 1; for (const a of j.ac ?? []) if (a.lat != null && a.lon != null) seen.set(a.hex, rowFromAdsb(a)); } catch (e) { fail += 1; if (fail === 1) log(name, e.message); }
      if (fail >= 4 && ok === 0) break; // this exchange is refusing us; try the next one
      await sleep(1100);
    }
    if (seen.size > 500) return { src: `${name} (${ok} regions around major airports)`, at: Date.now(), rows: [...seen.values()] };
    log(`${name}: only ${seen.size} aircraft (${ok} ok, ${fail} failed)`);
  }
  throw new Error('no flight source answered');
}
async function flights() {
  let res = null;
  try { res = await fromOpenSky(); if (res.rows.length < 1000) throw new Error(`only ${res.rows.length} aircraft`); } catch (e) { log('OpenSky:', e.message); res = null; }
  if (!res) res = await fromExchanges();
  const n = write('flights.json', { generatedAt: new Date(res.at).toISOString(), src: res.src, fields: FIELDS, ac: res.rows });
  return `${res.rows.length} aircraft from ${res.src}, ${(n / 1024).toFixed(0)} KB`;
}

// ------------------------------------------------------------------ slower feeds (only refreshed when stale)
async function launches() {
  if (ageMin('launches-upcoming.json') < 55) return 'fresh enough';
  for (const which of ['upcoming', 'previous']) {
    const j = await get(`https://ll.thespacedevs.com/2.2.0/launch/${which}/?limit=25&mode=detailed`);
    write(`launches-${which}.json`, { ...j, generatedAt: new Date().toISOString() });
    await sleep(3000);
  }
  return 'upcoming + previous';
}
async function gdacs() {
  const j = await get('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;WF;DR&alertlevel=Green;Orange;Red');
  write('gdacs.json', { ...j, generatedAt: new Date().toISOString() });
  return `${j.features?.length ?? 0} events`;
}
async function tles() {
  // CelesTrak asks that a group is downloaded at most once every two hours.
  if (ageMin('tle-meta.json') < 115) return 'fresh enough';
  const out = [];
  for (const g of ['stations', 'visual', 'weather', 'gps-ops', 'geo', 'starlink']) {
    try { const t = await get(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`, { type: 'text', timeout: 90_000 }); if (t.includes('\n1 ')) { write(`tle-${g}.txt`, t); out.push(g); } } catch (e) { log(`TLE ${g}:`, e.message); }
    await sleep(2000);
  }
  if (out.length) write('tle-meta.json', { generatedAt: new Date().toISOString(), groups: out });
  return out.join(', ') || 'none';
}

for (const [name, fn] of [['flights', flights], ['gdacs', gdacs], ['launches', launches], ['tle', tles]]) {
  try { const note = await fn(); status.feeds[name] = { ok: true, note }; log(name, '→', note); } catch (e) { status.feeds[name] = { ok: false, note: e.message }; log(name, 'FAILED:', e.message); }
}
write('status.json', status);
write('README.md', `# Terra Atlas live-data\n\nMachine-written snapshots for https://normansrule.github.io/worldmonitor/app/ — rebuilt every ~10 minutes by \`.github/workflows/live.yml\` on the main branch. Nothing here is edited by hand; each run replaces the whole branch.\n\nLast run: ${status.generatedAt}\n\n${Object.entries(status.feeds).map(([k, v]) => `- **${k}**: ${v.ok ? 'ok' : 'failed'} — ${v.note}`).join('\n')}\n\nData: OpenSky Network / airplanes.live / adsb.lol (flights), The Space Devs (launches), GDACS (disaster alerts), CelesTrak (orbits). See docs/REFERENCES.md on main for licences.\n`);
if (!status.feeds.flights?.ok && !existsSync(join(OUT, 'flights.json'))) process.exitCode = 1;
