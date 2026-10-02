// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — live flights.
// Every aircraft is drawn as a plane-shaped pointer, turned to its real heading, in ONE instanced
// mesh (tens of thousands of planes cost a single draw call). Selecting a flight opens a
// "seatback" moving-map panel like the ones on airline screens: altitude, speed, outside air
// temperature, route progress, time to go, weather at the destination and a photo of the aircraft.

import { THREE } from '../vendor/vendor.min.mjs';
import { getFeed, getSnapshot, isDesktop, liveProxy, viaOf, feedsReady } from './feeds.js';
import { haversineKm, greatCirclePoints, fmtLat, fmtLng, localSolarTime } from './astro.js';

const R = 100;
const MAX = 20000;
const history = new Map(); // icao -> [[lat, lng, altFt, t], ...]
let mesh = null; let lastList = []; const WRAP = { obj: null }; // one stable datum, so globe.gl never swaps (and removes) the shared mesh
export const flightState = { selected: null, follow: false, route: {} };

// --------------------------------------------------------------- data
function fromAdsbLol(j) {
  return (j.ac ?? []).filter((a) => a.lat != null && a.lon != null).map((a) => ({
    id: a.hex, call: (a.flight ?? '').trim(), lat: a.lat, lng: a.lon,
    altFt: typeof a.alt_baro === 'number' ? a.alt_baro : 0, ground: a.alt_baro === 'ground',
    kt: a.gs ?? null, trk: a.track ?? a.true_heading ?? 0, vs: a.baro_rate ?? null,
    type: a.t, reg: a.r, desc: a.desc, squawk: a.squawk, cat: a.category,
  }));
}
function fromOpenSky(j) {
  return (j.states ?? []).filter((s) => s[5] != null && s[6] != null).map((s) => ({
    id: s[0], call: (s[1] ?? '').trim(), lat: s[6], lng: s[5], country: s[2],
    altFt: (s[13] ?? s[7] ?? 0) * 3.281, ground: !!s[8], kt: s[9] != null ? s[9] * 1.944 : null,
    trk: s[10] ?? 0, vs: s[11] != null ? s[11] * 196.85 : null, squawk: s[14],
  }));
}

// Rows from the live-data snapshot (tools/fetch-live.mjs), turned into the same objects as the live parsers.
let snapRows = null; let snapKey = '';
function fromSnapshot(j) {
  const key = `${j.generatedAt}|${j.ac?.length}`;
  if (snapKey === key) return snapRows;
  const f = j.fields; const k = Object.fromEntries(f.map((n, i) => [n, i]));
  snapRows = (j.ac ?? []).map((r) => ({ id: r[k.id], call: r[k.call] ?? '', lat0: r[k.lat], lng0: r[k.lng], lat: r[k.lat], lng: r[k.lng], altFt: r[k.altFt] ?? 0, ground: !!r[k.ground],
    kt: r[k.kt], trk: r[k.trk] ?? 0, vs: r[k.vs], squawk: r[k.squawk] ?? undefined, type: r[k.type] ?? undefined, reg: r[k.reg] ?? undefined }));
  snapKey = key; return snapRows;
}
/** Dead reckoning: move each airborne plane along its heading at its speed since the snapshot was taken. */
function projectForward(list, ageMin) {
  const hrs = Math.min(ageMin, 25) / 60;
  for (const a of list) {
    if (a.ground || !a.kt || a.kt < 50) { a.lat = a.lat0; a.lng = a.lng0; continue; }
    const km = a.kt * 1.852 * hrs; const h = (a.trk ?? 0) * Math.PI / 180;
    const lat = Math.max(-89, Math.min(89, a.lat0 + (km * Math.cos(h)) / 111.2));
    let lng = a.lng0 + (km * Math.sin(h)) / (111.2 * Math.max(0.05, Math.cos(a.lat0 * Math.PI / 180)));
    lng = ((lng + 540) % 360) - 180;
    a.lat = Math.round(lat * 1e4) / 1e4; a.lng = Math.round(lng * 1e4) / 1e4;
  }
  return list;
}
const ago = (min) => (min < 1.5 ? 'under 2 min' : min < 90 ? `${Math.round(min)} min` : `${Math.round(min / 60)} h`);
async function snapshotFlights() {
  const j = await getSnapshot('livedata', 'flights.json', { ttl: 60_000 });
  const age = (Date.now() - Date.parse(j.generatedAt)) / 60_000;
  const ac = projectForward(fromSnapshot(j), age);
  return {
    src: `${j.src} · snapshot ${ago(age)} old`, ac, snapshotAge: age,
    statusNote: `${ac.length.toLocaleString()} aircraft from the live-data snapshot (${ago(age)} old${age > 1 ? ', positions projected forward along each heading' : ''}).${age > 40 ? ' The snapshot is stale: check the “Live data snapshot” workflow on GitHub.' : ''}`,
  };
}
const canReachLive = () => isDesktop || !!liveProxy();
let regionalFailed = false; // web without proxy: after one refusal, stop asking community exchanges this session

async function liveRegional(lat, lng) {
  const la = lat.toFixed(2); const lo = lng.toFixed(2);
  const tries = [
    ['airplaneslive', 'airplanes.live', `https://api.airplanes.live/v2/point/${la}/${lo}/250`],
    ['adsblol', 'adsb.lol', `https://api.adsb.lol/v2/lat/${la}/lon/${lo}/dist/250`],
    ['adsbfi', 'adsb.fi', `https://opendata.adsb.fi/api/v2/lat/${la}/lon/${lo}/dist/250`],
  ];
  let last = null;
  for (const [id, name, url] of tries) {
    try { const ac = fromAdsbLol(await getFeed(id, url, { ttl: 8_000, timeout: 12_000 })); if (!ac.length) throw new Error(`${name}: no aircraft here`); return { src: `${name} · live, within 250 nm of view${viaOf(url) === 'proxy' ? ' (via your proxy)' : ''}`, ac, statusNote: `${ac.length.toLocaleString()} aircraft live from ${name} near the centre of the view.` }; } catch (e) { last = e; }
  }
  throw last;
}
async function liveWorld() {
  const url = 'https://opensky-network.org/api/states/all';
  const ac = fromOpenSky(await getFeed('opensky', url, { ttl: 85_000, timeout: 30_000 }));
  if (ac.length < 500) throw new Error('OpenSky returned almost nothing');
  return { src: `OpenSky Network · live, worldwide${viaOf(url) === 'proxy' ? ' (via your proxy)' : isDesktop ? ' (desktop app)' : ''}`, ac, statusNote: `${ac.length.toLocaleString()} aircraft live from the OpenSky Network, refreshed every 90 seconds.` };
}

async function loadFlights(o, ctx) {
  await feedsReady;
  const { lat, lng } = ctx.pov;
  const errors = [];
  const attempt = async (fn) => { try { return await fn(); } catch (e) { errors.push(e.message); return null; } };
  let res = null;
  if (o.scope === 'near') {
    if (canReachLive() || !regionalFailed) { res = await attempt(() => liveRegional(lat, lng)); if (!res && !canReachLive()) regionalFailed = true; }
    if (!res) res = await attempt(snapshotFlights);
  } else {
    if (canReachLive()) res = await attempt(liveWorld);
    if (!res) res = await attempt(snapshotFlights);
    if (!res && (canReachLive() || !regionalFailed)) { res = await attempt(() => liveRegional(lat, lng)); if (!res && !canReachLive()) regionalFailed = true; }
  }
  if (!res) {
    throw Object.assign(new Error(errors.join(' · ') || 'no flight source answered'), {
      help: isDesktop
        ? `No flight source answered (${errors.join('; ')}). The desktop app asks OpenSky, airplanes.live, adsb.lol and adsb.fi directly, so check your internet connection or firewall; it retries every few seconds.`
        : `No flight source answered (${errors.join('; ')}). Browsers block direct requests to flight trackers (they send no CORS headers), so the website reads a snapshot that GitHub Actions rebuilds every 10 minutes. If you run your own copy: GitHub → Actions → “Live data snapshot” → Run workflow, then reload. Or use the desktop app, which reads flights live.`,
    });
  }
  const now = Date.now();
  for (const a of res.ac) {
    const h = history.get(a.id) ?? [];
    const last = h.at(-1);
    if (!last || last[0] !== a.lat || last[1] !== a.lng) h.push([a.lat, a.lng, a.altFt, now]);
    if (h.length > 60) h.shift();
    history.set(a.id, h);
  }
  if (history.size > 60000) for (const k of [...history.keys()].slice(0, 20000)) history.delete(k);
  // Base fix for gliding: between refreshes each plane keeps moving along its heading at its speed.
  for (const a of res.ac) { a._bLat = a.lat; a._bLng = a.lng; a._bT = now; a.src = res.src; }
  return res;
}

/** Move every airborne plane forward from its last fix (dead reckoning, at most 3 minutes ahead). */
function glideTo(list, now) {
  for (const a of list) {
    if (a._bT == null || a.ground || !a.kt || a.kt < 50) continue;
    const hrs = Math.min(now - a._bT, 180_000) / 3.6e6; const km = a.kt * 1.852 * hrs; const h = (a.trk ?? 0) * Math.PI / 180;
    a.lat = Math.max(-89.5, Math.min(89.5, a._bLat + (km * Math.cos(h)) / 111.2));
    a.lng = ((a._bLng + (km * Math.sin(h)) / (111.2 * Math.max(0.05, Math.cos(a._bLat * Math.PI / 180))) + 540) % 360) - 180;
  }
}
let lastPick = [];
/** Called a few times a second: planes glide smoothly instead of jumping at each refresh. */
let rebasedAt = 0;
export function glidePlanes(globe, camAlt) {
  if (!lastList.length) return null;
  const now = Date.now();
  const sel = flightState.selected ? lastList.find((a) => a.id === flightState.selected) ?? null : null;
  if (now - rebasedAt > 5000) { // the shader does the in-between motion; re-base the true positions every 5 s
    rebasedAt = now;
    layoutPlanes(globe, camAlt, lastList);
    for (const p of lastPick) { const a = p.ref.d; p.lat = a.lat; p.lng = a.lng; p.alt = a._alt ?? p.alt; }
    lastPick.__v = now; // the click index for planes is rebuilt next time markers are laid out
  } else if (sel) glideTo([sel], now); // the selected plane's numbers and the follow camera stay exact
  return sel;
}
export const flightsNow = () => lastList;

// --------------------------------------------------------------- plane-shaped instanced pointers
function planeGeometry() {
  const s = new THREE.Shape();
  const P = [[0, 1], [0.1, 0.72], [0.11, 0.25], [0.95, -0.1], [0.95, -0.27], [0.11, -0.12], [0.08, -0.62], [0.36, -0.82], [0.36, -0.95], [0, -0.88]];
  s.moveTo(...P[0]);
  for (const p of P.slice(1)) s.lineTo(...p);
  for (const p of P.slice(1, -1).reverse()) s.lineTo(-p[0], p[1]);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}
// Planes glide on the GPU: each instance carries its velocity, and the vertex shader moves it by
// velocity × seconds since the last layout. Motion is perfectly smooth at any frame rate and costs
// nothing on the CPU; the CPU only re-bases positions every few seconds.
const glide = { value: 0 }; let layoutAt = performance.now();
const KT_TO_UNITS_PER_S = 0.514444 / 1000 / (6371 / R); // knots → globe units per second
function ensureMesh() {
  if (mesh) return mesh;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDt = glide;
    sh.vertexShader = `attribute vec3 instanceVel;\nuniform float uDt;\n${sh.vertexShader.replace('#include <project_vertex>', `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  mvPosition.xyz += instanceVel * uDt;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`)}`;
  };
  mat.customProgramCacheKey = () => 'terra-plane-glide';
  mesh = new THREE.InstancedMesh(planeGeometry(), mat, MAX);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.geometry.setAttribute('instanceVel', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 5; mesh.raycast = () => {};
  mesh.onBeforeRender = () => { glide.value = Math.min(30, (performance.now() - layoutAt) / 1000); };
  return mesh;
}
const tmp = { m: new THREE.Matrix4(), p: new THREE.Vector3(), n: new THREE.Vector3(), e: new THREE.Vector3(), u: new THREE.Vector3(), d: new THREE.Vector3(), r: new THREE.Vector3(), c: new THREE.Color() };
export const EMERGENCY = new Set(['7500', '7600', '7700', 7500, 7600, 7700]);
const altColor = (ft, ground) => (ground ? '#8aa0b3' : ft < 10000 ? '#7ed6c4' : ft < 25000 ? '#ffd37a' : '#f2f5f7');
// Heights are exaggerated so you can see them, but only gently from far away (planes floating hundreds of
// km up made a fuzzy halo around the planet's edge).
const exaggeration = (camAlt) => 1 + Math.min(8, camAlt * 5);

/** Place every plane. Size follows the camera so pointers stay a readable size on screen.
    Written straight into the instance buffers with plain maths (no per-plane library calls), because it
    runs twice a second for up to 20,000 planes while they glide. */
const D2R = Math.PI / 180;
const colorCache = new Map();
const rgbOf = (hex) => { let c = colorCache.get(hex); if (!c) { tmp.c.set(hex); c = [tmp.c.r, tmp.c.g, tmp.c.b]; colorCache.set(hex, c); } return c; };
export function layoutPlanes(globe, camAlt, list = lastList) {
  const m = ensureMesh(); lastList = list;
  glideTo(list, Date.now()); // start from where each plane is now, so a re-layout never makes planes jump back
  const size = Math.max(0.0012, Math.min(1.3, camAlt * R * 0.0115));
  const ex = exaggeration(camAlt);
  const M = m.instanceMatrix.array; const C = m.instanceColor.array; const V = m.geometry.attributes.instanceVel.array;
  layoutAt = performance.now(); glide.value = 0;
  let i = 0;
  for (const a of list) {
    if (i >= MAX) break;
    const alt = a.ground ? 0.0002 : 0.0004 + (a.altFt / 3281 / 6371) * ex;
    // three-globe's convention: phi from the north pole, theta = 90° − longitude
    const phi = (90 - a.lat) * D2R; const th = (90 - a.lng) * D2R; const rr = R * (1 + alt);
    const sp = Math.sin(phi); const cp = Math.cos(phi); const st = Math.sin(th); const ct = Math.cos(th);
    const ux = sp * ct; const uy = cp; const uz = sp * st; // up
    const ex_ = st; const ez = -ct; // east (y = 0)
    const nx = -cp * ct; const ny = sp; const nz = -cp * st; // north
    const h = (a.trk ?? 0) * D2R; const ch = Math.cos(h); const sh = Math.sin(h);
    const dx = nx * ch + ex_ * sh; const dy = ny * ch; const dz = nz * ch + ez * sh; // nose direction
    const rx = dy * uz - dz * uy; const ry = dz * ux - dx * uz; const rz = dx * uy - dy * ux; // right wing = nose × up
    const sel = flightState.selected === a.id; const em = EMERGENCY.has(a.squawk); const k = sel || em ? size * 2.2 : size;
    const o = i * 16;
    M[o] = rx * k; M[o + 1] = ry * k; M[o + 2] = rz * k; M[o + 3] = 0;
    M[o + 4] = dx * k; M[o + 5] = dy * k; M[o + 6] = dz * k; M[o + 7] = 0;
    M[o + 8] = ux * k; M[o + 9] = uy * k; M[o + 10] = uz * k; M[o + 11] = 0;
    M[o + 12] = ux * rr; M[o + 13] = uy * rr; M[o + 14] = uz * rr; M[o + 15] = 1;
    const col = rgbOf(sel ? '#f07a63' : em ? '#ff3b30' : altColor(a.altFt, a.ground));
    C[i * 3] = col[0]; C[i * 3 + 1] = col[1]; C[i * 3 + 2] = col[2];
    const v = a.ground || !a.kt ? 0 : a.kt * KT_TO_UNITS_PER_S; V[i * 3] = dx * v; V[i * 3 + 1] = dy * v; V[i * 3 + 2] = dz * v;
    a._alt = alt; i += 1;
  }
  m.count = i;
  const im = m.instanceMatrix; im.clearUpdateRanges?.(); im.addUpdateRange?.(0, Math.max(16, i * 16)); im.needsUpdate = true;
  const c = m.instanceColor; c.clearUpdateRanges?.(); c.addUpdateRange?.(0, Math.max(3, i * 3)); c.needsUpdate = true;
  const va = m.geometry.attributes.instanceVel; va.clearUpdateRanges?.(); va.addUpdateRange?.(0, Math.max(3, i * 3)); va.needsUpdate = true;
}

// --------------------------------------------------------------- enrichment (adsbdb)
async function aircraftInfo(hex) {
  try { return (await getFeed('adsbdb', `https://api.adsbdb.com/v0/aircraft/${hex}`, { ttl: 86_400_000 })).response?.aircraft ?? null; } catch { return null; }
}
async function routeInfo(call) {
  if (!call) return null;
  if (flightState.route[call] !== undefined) return flightState.route[call];
  try { flightState.route[call] = (await getFeed('adsbdb', `https://api.adsbdb.com/v0/callsign/${call}`, { ttl: 86_400_000 })).response?.flightroute ?? null; } catch { flightState.route[call] = null; }
  return flightState.route[call];
}
/** Standard-atmosphere outside air temperature — what the seatback screen is estimating too. */
const isaTempC = (ft) => { const km = ft / 3281; return km <= 11 ? 15 - 6.5 * km : -56.5; };

// --------------------------------------------------------------- the layer
export function flightsLayer(api) {
  return {
    id: 'aircraft', group: 'live', label: 'Live flights', swatch: '#8ecbff', on: false, refresh: 12_000, pinless: true,
    sources: ['opensky', 'adsblol', 'airplaneslive', 'adsbdb', 'livedata'],
    options: [{ id: 'scope', label: 'Coverage', choices: [['world', 'Whole world'], ['near', 'Near my view (more detail)']], value: 'world' }],
    load: (o, ctx) => loadFlights(o, ctx),
    channels(d, ctx) {
      layoutPlanes(ctx.globe, ctx.pov.altitude, d.ac);
      WRAP.obj = ensureMesh();
      lastPick = d.ac.map((a) => ({ lat: a.lat, lng: a.lng, alt: a._alt ?? 0, ref: { layer: 'aircraft', d: a } }));
      const out = { custom: [WRAP], pick: lastPick };
      const em = d.ac.filter((a) => EMERGENCY.has(a.squawk));
      if (em.length) out.rings = em.map((a) => ({ lat: a.lat, lng: a.lng, color: '#ff3b30', maxR: 1.6, speed: 2, period: 900 }));
      const sel = d.ac.find((a) => a.id === flightState.selected);
      if (sel) {
        const h = history.get(sel.id) ?? [];
        const ex = exaggeration(ctx.pov.altitude);
        if (h.length > 1) out.paths = [{ pts: h.map(([la, lo, ft]) => [la, lo, 0.0004 + (ft / 3281 / 6371) * ex]), color: ['rgba(240,122,99,0.1)', 'rgba(240,122,99,0.95)'], stroke: 0.6, passive: true }];
        const r = flightState.route[sel.call];
        if (r?.destination) out.arcs = [{ sLat: sel.lat, sLng: sel.lng, eLat: r.destination.latitude, eLng: r.destination.longitude, color: ['rgba(227,181,91,0.9)', 'rgba(227,181,91,0.2)'], stroke: 0.5, alt: 0.02, dashLen: 0.03, dashGap: 0.015, animMs: 3000 }];
        if (flightState.follow) api.followTo(sel.lat, sel.lng);
        if (api.isOpen(`flight:${sel.id}`)) updateDeck(sel);
      }
      return out;
    },
    open: (a) => openDeck(a, api),
    learn: {
      what: 'Aircraft broadcasting their position right now. Planes squawking an emergency code (7500, 7600, 7700) are drawn large in red with a pulsing ring and appear in the Live feed. Every plane is a pointer turned to its real heading. White is above 25,000 ft, yellow 10,000–25,000 ft, teal below 10,000 ft, grey on the ground. Click a plane for its seatback-style flight view.',
      how: 'Planes work out where they are with satellite navigation and broadcast it about twice a second on 1090 MHz (ADS-B). Thousands of volunteer receivers share what they hear. Flight trackers don’t let web pages read them directly (no CORS headers), so on the website a GitHub Actions job saves a worldwide snapshot every 10 minutes, and your browser moves each plane forward along its heading at its speed until the next one arrives (dead reckoning, as navigators did before satellites). The desktop app, or the optional proxy, reads OpenSky every 90 seconds and airplanes.live / adsb.lol every few seconds for “Near my view”. Heights are exaggerated so you can see them.',
      try: 'Pick a long-haul flight over an ocean, open its flight view and choose Follow. Then compare the “outside temperature” with the standard-atmosphere formula in the Learn page.',
      refs: ['opensky', 'airplaneslive', 'adsblol', 'adsbdb', 'livedata'],
    },
  };
}

// --------------------------------------------------------------- seatback moving-map panel
function deckNumbers(a) {
  const r = flightState.route[a.call];
  let prog = null;
  if (r?.origin && r?.destination) {
    const done = haversineKm(r.origin.latitude, r.origin.longitude, a.lat, a.lng);
    const togo = haversineKm(a.lat, a.lng, r.destination.latitude, r.destination.longitude);
    const kmh = a.kt ? a.kt * 1.852 : null;
    prog = { done, togo, frac: Math.max(0, Math.min(1, done / (done + togo))), eta: kmh && kmh > 150 ? togo / kmh : null };
  }
  return { r, prog };
}
function statsHtml(a) {
  const { prog } = deckNumbers(a);
  const hh = (h) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')} min`;
  const cells = [
    ['Altitude', a.ground ? 'On the ground' : `${Math.round(a.altFt).toLocaleString()} ft`, a.ground ? '' : `${Math.round(a.altFt / 3.281).toLocaleString()} m`],
    ['Ground speed', a.kt ? `${Math.round(a.kt * 1.1508)} mph` : '—', a.kt ? `${Math.round(a.kt * 1.852)} km/h · ${Math.round(a.kt)} kt` : ''],
    ['Heading', `${Math.round(a.trk ?? 0)}°`, compass(a.trk ?? 0)],
    ['Outside air (est.)', a.ground ? '—' : `${Math.round(isaTempC(a.altFt))} °C`, a.ground ? '' : `${Math.round(isaTempC(a.altFt) * 9 / 5 + 32)} °F standard atmosphere`],
    ['Distance to go', prog ? `${Math.round(prog.togo).toLocaleString()} km` : '—', prog ? `${Math.round(prog.togo / 1.609).toLocaleString()} mi` : 'route unknown'],
    ['Time to go', prog?.eta != null ? hh(prog.eta) : '—', prog?.eta != null ? 'at current speed' : ''],
    ['Climb rate', a.vs != null ? `${Math.round(a.vs).toLocaleString()} ft/min` : '—', a.vs > 300 ? 'climbing' : a.vs < -300 ? 'descending' : 'level'],
    ['Local time below', localSolarTime(a.lng), 'solar time'],
  ];
  return cells.map(([k, v, s]) => `<div class="cell"><span>${k}</span><b>${v}</b><small>${s}</small></div>`).join('');
}
const compass = (d) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((d % 360) + 360) % 360 / 45) % 8];

function progressHtml(a) {
  const { r, prog } = deckNumbers(a);
  if (!r?.origin) return '<p class="muted">Route not published for this callsign — many private, cargo and military flights do not share one.</p>';
  const pct = Math.round((prog?.frac ?? 0) * 100);
  return `<div class="route">
    <div class="ends"><div><b>${r.origin.iata_code ?? r.origin.icao_code}</b><small>${r.origin.municipality ?? r.origin.name}</small></div>
    <div class="right"><b>${r.destination.iata_code ?? r.destination.icao_code}</b><small>${r.destination.municipality ?? r.destination.name}</small></div></div>
    <div class="track"><i style="width:${pct}%"></i><span class="plane" style="left:${pct}%">✈</span></div>
    <small class="muted">${pct}% of the great-circle distance flown</small></div>`;
}

function updateDeck(a) {
  const s = document.getElementById('deck-stats'); if (s) s.innerHTML = statsHtml(a);
  const p = document.getElementById('deck-route'); if (p) p.innerHTML = progressHtml(a);
  const pos = document.getElementById('deck-pos'); if (pos) pos.textContent = `${fmtLat(a.lat)}, ${fmtLng(a.lng)}`;
}

async function openDeck(a, api) {
  flightState.selected = a.id; flightState.follow = false;
  api.openNotes('Flight view', `
    <div class="deck" data-key="flight:${a.id}">
      <p class="kicker">${a.src ?? ''}</p>
      <h3>${api.esc(a.call || a.id.toUpperCase())}</h3>
      <p class="sub" id="deck-airline">${api.esc([a.desc ?? a.type, a.reg].filter(Boolean).join(' · ') || 'Looking up aircraft…')}</p>
      <div id="deck-route">${progressHtml(a)}</div>
      <div class="stats" id="deck-stats">${statsHtml(a)}</div>
      <p class="muted" id="deck-pos">${fmtLat(a.lat)}, ${fmtLng(a.lng)}</p>
      <div class="row">
        <button class="btn" data-deck="follow">Follow this flight</button>
        <button class="btn ghost" data-deck="window">Window view</button>
        <button class="btn ghost" data-deck="stop">Stop following</button>
        <button class="btn ghost" data-share="1">Copy link</button>
      </div>
      <div id="deck-photo"></div><div id="deck-dest"></div>
      <h4>How the seatback map works</h4>
      <p>Airline moving maps take the same numbers from the aircraft’s own navigation system. Here they come from the plane’s ADS-B broadcast; the outside temperature is estimated from the standard atmosphere (−6.5 °C per km up to 11 km, then −56.5 °C), which is how cruise temperatures of about −50 °C arise.</p>
      <p class="muted">Squawk ${api.esc(a.squawk ?? '—')} · ICAO address ${api.esc(a.id)} · <a href="https://globe.adsb.lol/?icao=${encodeURIComponent(a.id)}" target="_blank" rel="noopener">Track on adsb.lol</a></p>
    </div>`, `flight:${a.id}`);
  api.refreshLayer('aircraft', { soft: true });
  const [info, route] = await Promise.all([aircraftInfo(a.id), routeInfo(a.call)]);
  if (!api.isOpen(`flight:${a.id}`)) return;
  if (info) {
    document.getElementById('deck-airline').textContent = [info.manufacturer, info.type, info.registration, info.registered_owner].filter(Boolean).join(' · ');
    if (info.url_photo_thumbnail) document.getElementById('deck-photo').innerHTML = `<figure class="photo"><img src="${info.url_photo_thumbnail}" alt="Photo of ${api.esc(info.registration ?? 'the aircraft')}" loading="lazy" /><figcaption>Photo via <a href="${info.url_photo ?? '#'}" target="_blank" rel="noopener">airport-data / adsbdb</a></figcaption></figure>`;
  }
  if (route) {
    const air = route.airline ? `${route.airline.name}${route.airline.country ? ` (${route.airline.country})` : ''}` : '';
    if (air) document.getElementById('deck-airline').textContent = `${air} · ${document.getElementById('deck-airline').textContent}`;
    updateDeck(a);
    const d = route.destination;
    try {
      const w = await getFeed('openmeteo', `https://api.open-meteo.com/v1/forecast?latitude=${d.latitude}&longitude=${d.longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`);
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: w.timezone });
      document.getElementById('deck-dest').innerHTML = `<h4>At ${api.esc(d.municipality ?? d.name)}</h4><dl><dt>Local time</dt><dd>${t} (${api.esc(w.timezone)})</dd><dt>Weather</dt><dd>${api.wmo(w.current.weather_code)}, ${w.current.temperature_2m} °C, wind ${w.current.wind_speed_10m} km/h</dd><dt>Airport</dt><dd>${api.esc(d.name)} · ${api.esc(d.country_name ?? '')}</dd></dl>`;
    } catch { /* optional */ }
    api.refreshLayer('aircraft', { soft: true });
  }
}
export function deckAction(kind, api) {
  const a = lastList.find((x) => x.id === flightState.selected); if (!a) return;
  if (kind === 'follow') { flightState.follow = true; api.fly(a.lat, a.lng, Math.min(api.state.pov.altitude, 0.6), false); }
  if (kind === 'window') { flightState.follow = true; api.setBase('imagery'); api.fly(a.lat, a.lng, Math.max(0.012, a.altFt / 3281 / 6371 * 3), false); }
  if (kind === 'stop') flightState.follow = false;
}
export const aircraftCount = () => lastList.length;
export { greatCirclePoints };
