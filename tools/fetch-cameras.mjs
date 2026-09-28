#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — collect public traffic-camera lists into site/app/data/cameras.json.
// Runs daily in GitHub Actions (.github/workflows/data.yml). Each source is optional: if one is down,
// the others are still written. Only camera metadata is stored; images always load from the agency.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const OUT = 'site/app/data/cameras.json';
const UA = { 'User-Agent': 'TerraAtlas/1.1 (+https://github.com/koala73/worldmonitor fork; educational map)' };
const UA_JSON = { ...UA, Accept: 'application/json' };
const get = async (url, type = 'json') => {
  const r = await fetch(url, { headers: UA_JSON, signal: AbortSignal.timeout(60_000) });
  const body = await r.text();
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}: ${body.slice(0, 160)}`);
  if (type === 'text') return body;
  try { return JSON.parse(body); } catch { throw new Error(`${url} → not JSON: ${body.slice(0, 160)}`); }
};
const round = (x) => Math.round(x * 1e5) / 1e5;
const ok = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

async function caltrans() {
  const out = [];
  for (let d = 1; d <= 12; d++) {
    const dd = String(d).padStart(2, '0');
    try {
      const j = await get(`https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${dd}.json`);
      for (const { cctv: c } of j.data ?? []) {
        const loc = c.location ?? {}; const img = c.imageData?.static?.currentImageURL; const stream = c.imageData?.streamingVideoURL;
        const lat = Number(loc.latitude); const lng = Number(loc.longitude);
        if (c.inService !== 'true' || !img || !ok(lat, lng)) continue;
        out.push([`ct${d}-${c.index}`, `${loc.locationName ?? loc.nearbyPlace ?? 'Camera'}`.trim(), round(lat), round(lng), img,
          stream && /^https:.*\.m3u8$/.test(stream) ? stream : '', 0, [loc.route, loc.direction, loc.county].filter(Boolean).join(' · ')]);
      }
      console.log(`caltrans d${dd}: ok`);
    } catch (e) { console.warn(`caltrans d${dd}: ${e.message}`); }
  }
  return out;
}
async function nyc() {
  const j = await get('https://webcams.nyctmc.org/api/cameras');
  return j.filter((c) => c.isOnline !== false && ok(c.latitude, c.longitude)).map((c) => [`nyc-${c.id}`, c.name, round(c.latitude), round(c.longitude), c.imageUrl ?? `https://webcams.nyctmc.org/api/cameras/${c.id}/image`, '', 1, c.area ?? '']);
}
// Many 511 systems share the same "api/v2/get/cameras" format.
async function five11(base, si, prefix) {
  const j = await get(`${base}/api/v2/get/cameras?format=json&lang=en`);
  const out = [];
  for (const c of j) {
    const lat = Number(c.Latitude); const lng = Number(c.Longitude);
    if (!ok(lat, lng)) continue;
    const views = c.Views?.length ? c.Views : [{ Url: c.Url, Status: c.Status, Description: c.Name }];
    views.filter((v) => v.Url && v.Status !== 'Disabled').forEach((v, k) => out.push([`${prefix}-${c.Id ?? c.ID}-${k}`, `${c.Location ?? c.Name ?? c.Roadway ?? 'Camera'}${v.Description && views.length > 1 ? ` (${v.Description})` : ''}`, round(lat), round(lng), v.Url, '', si, [c.Roadway, c.Direction].filter((x) => x && x !== 'Unknown').join(' · ')]));
  }
  return out;
}

// Transport for London JamCams — ~900 cameras, each with a still and a short live video clip.
async function tfl() {
  const j = await get('https://api.tfl.gov.uk/Place/Type/JamCam');
  return j.filter((c) => ok(c.lat, c.lon)).map((c) => {
    const prop = Object.fromEntries((c.additionalProperties ?? []).map((p) => [p.key, p.value]));
    if (prop.available === 'false' || !prop.imageUrl) return null;
    return [`tfl-${c.id}`, c.commonName, round(c.lat), round(c.lon), prop.imageUrl, prop.videoUrl ?? '', 4, 'London'];
  }).filter(Boolean);
}
// Hong Kong Transport Department traffic snapshots (XML list).
async function hongKong() {
  const xml = await get('https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml', 'text');
  const tag = (block, t) => (block.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) ?? [])[1]?.trim().replace(/&amp;/g, '&').replace(/&apos;/g, "'");
  return [...xml.matchAll(/<image>([\s\S]*?)<\/image>/g)].map(([, b]) => {
    const lat = Number(tag(b, 'latitude')); const lng = Number(tag(b, 'longitude')); const url = tag(b, 'url');
    if (!ok(lat, lng) || !url) return null;
    return [`hk-${tag(b, 'key')}`, tag(b, 'description') ?? 'Camera', round(lat), round(lng), url, '', 5, [tag(b, 'district'), tag(b, 'region')].filter(Boolean).join(' · ')];
  }).filter(Boolean);
}

// Fintraffic weather cameras, Finland (CC BY 4.0) — every station has several fixed views ("presets").
async function finland() {
  const j = await get('https://tie.digitraffic.fi/api/weathercam/v1/stations');
  const out = [];
  for (const f of j.features ?? []) {
    const [lng, lat] = f.geometry?.coordinates ?? []; if (!ok(lat, lng)) continue;
    for (const p of (f.properties.presets ?? []).filter((x) => x.inCollection !== false).slice(0, 2)) out.push([`fi-${p.id}`, f.properties.name ?? p.id, round(lat), round(lng), `https://weathercam.digitraffic.fi/${p.id}.jpg`, '', 6, 'Finland']);
  }
  return out;
}

const SOURCES = [
  { name: 'Caltrans (California DOT)', run: caltrans },
  { name: 'NYC DOT', run: nyc },
  { name: '511 Ontario', run: () => five11('https://511on.ca', 2, 'on') },
  { name: '511 Alberta', run: () => five11('https://511.alberta.ca', 3, 'ab') },
  { name: 'Transport for London (JamCams)', run: tfl },
  { name: 'Hong Kong Transport Department', run: hongKong },
  { name: 'Fintraffic weather cameras (Finland)', run: finland },
];
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const cams = []; const sources = [];
for (const [i, s] of SOURCES.entries()) {
  let rows = [];
  try { rows = await s.run(); } catch (e) { console.warn(`${s.name}: ${e.message}`); }
  if (!rows.length && prev) rows = prev.cams.filter((c) => c[6] === i), console.warn(`${s.name}: keeping ${rows.length} cameras from the previous run`);
  cams.push(...rows); sources.push({ name: s.name, count: rows.length });
  console.log(`${s.name}: ${rows.length}`);
}
if (!cams.length) { console.error('No cameras collected; leaving the existing file alone.'); process.exit(prev ? 0 : 1); }
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), sources, cams }));
console.log(`wrote ${cams.length} cameras to ${OUT}`);
