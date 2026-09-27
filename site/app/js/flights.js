// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — live flights.
// Every aircraft is drawn as a plane-shaped pointer, turned to its real heading, in ONE instanced
// mesh (tens of thousands of planes cost a single draw call). Selecting a flight opens a
// "seatback" moving-map panel like the ones on airline screens: altitude, speed, outside air
// temperature, route progress, time to go, weather at the destination and a photo of the aircraft.

import { THREE } from '../vendor/vendor.min.mjs';
import { getFeed } from './feeds.js';
import { haversineKm, greatCirclePoints, fmtLat, fmtLng, localSolarTime } from './astro.js';

const R = 100;
const MAX = 20000;
const history = new Map(); // icao -> [[lat, lng, altFt, t], ...]
let mesh = null; let lastList = [];
let worldCache = null; let worldAt = 0;
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

async function loadFlights(o, ctx) {
  const { lat, lng } = ctx.pov;
  let res = null;
  if (o.scope === 'world') {
    if (worldCache && Date.now() - worldAt < 60_000) res = worldCache; // OpenSky anonymous quota: keep it gentle
    else {
      try {
        res = { src: 'OpenSky Network (worldwide)', ac: fromOpenSky(await getFeed('opensky', 'https://opensky-network.org/api/states/all', { ttl: 55_000, timeout: 25_000 })) };
        worldCache = res; worldAt = Date.now();
      } catch { /* fall through to regional */ }
    }
  }
  if (!res) {
    try {
      res = { src: 'adsb.lol (within 250 nm of view)', ac: fromAdsbLol(await getFeed('adsblol', `https://api.adsb.lol/v2/lat/${lat.toFixed(2)}/lon/${lng.toFixed(2)}/dist/250`, { ttl: 8_000 })) };
    } catch {
      res = { src: 'airplanes.live (within 250 nm of view)', ac: fromAdsbLol(await getFeed('airplaneslive', `https://api.airplanes.live/v2/point/${lat.toFixed(2)}/${lng.toFixed(2)}/250`, { ttl: 8_000 })) };
    }
  }
  const now = Date.now();
  for (const a of res.ac) {
    const h = history.get(a.id) ?? [];
    const last = h.at(-1);
    if (!last || last[0] !== a.lat || last[1] !== a.lng) h.push([a.lat, a.lng, a.altFt, now]);
    if (h.length > 60) h.shift();
    history.set(a.id, h);
  }
  return res;
}

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
function ensureMesh() {
  if (mesh) return mesh;
  mesh = new THREE.InstancedMesh(planeGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), MAX);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 5;
  return mesh;
}
const tmp = { m: new THREE.Matrix4(), p: new THREE.Vector3(), n: new THREE.Vector3(), e: new THREE.Vector3(), u: new THREE.Vector3(), d: new THREE.Vector3(), r: new THREE.Vector3(), c: new THREE.Color() };
const altColor = (ft, ground) => (ground ? '#8aa0b3' : ft < 10000 ? '#7ed6c4' : ft < 25000 ? '#ffd37a' : '#f2f5f7');
const exaggeration = (camAlt) => 1 + Math.min(30, camAlt * 14);

/** Place every plane. Size follows the camera so pointers stay a readable size on screen. */
export function layoutPlanes(globe, camAlt, list = lastList) {
  const m = ensureMesh(); lastList = list;
  const size = Math.max(0.0012, Math.min(1.6, camAlt * R * 0.014));
  const ex = exaggeration(camAlt);
  let i = 0;
  for (const a of list) {
    if (i >= MAX) break;
    const alt = a.ground ? 0.0002 : 0.0004 + (a.altFt / 3281 / 6371) * ex;
    const P = globe.getCoords(a.lat, a.lng, alt); const Pn = globe.getCoords(a.lat + 0.02, a.lng, alt); const Pe = globe.getCoords(a.lat, a.lng + 0.02, alt);
    tmp.p.set(P.x, P.y, P.z); tmp.u.copy(tmp.p).normalize();
    tmp.n.set(Pn.x - P.x, Pn.y - P.y, Pn.z - P.z).normalize(); tmp.e.set(Pe.x - P.x, Pe.y - P.y, Pe.z - P.z).normalize();
    const h = (a.trk ?? 0) * Math.PI / 180;
    tmp.d.copy(tmp.n).multiplyScalar(Math.cos(h)).addScaledVector(tmp.e, Math.sin(h)).normalize();
    tmp.r.crossVectors(tmp.d, tmp.u).normalize();
    const sel = flightState.selected === a.id; const k = sel ? size * 2.2 : size;
    tmp.m.makeBasis(tmp.r.multiplyScalar(k), tmp.d.multiplyScalar(k), tmp.u.clone().multiplyScalar(k)).setPosition(tmp.p);
    m.setMatrixAt(i, tmp.m);
    tmp.c.set(sel ? '#f07a63' : altColor(a.altFt, a.ground)); m.setColorAt(i, tmp.c);
    a._alt = alt; i += 1;
  }
  m.count = i; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
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
    id: 'aircraft', group: 'live', label: 'Live flights', swatch: '#f2f5f7', on: false, refresh: 12_000, pinless: true,
    sources: ['opensky', 'adsblol', 'airplaneslive', 'adsbdb'],
    options: [{ id: 'scope', label: 'Coverage', choices: [['world', 'Whole world'], ['near', 'Near my view (more detail)']], value: 'world' }],
    load: (o, ctx) => loadFlights(o, ctx),
    channels(d, ctx) {
      layoutPlanes(ctx.globe, ctx.pov.altitude, d.ac);
      const out = { custom: [{ obj: ensureMesh() }], pick: d.ac.map((a) => ({ lat: a.lat, lng: a.lng, alt: a._alt ?? 0, ref: { layer: 'aircraft', d: { ...a, src: d.src } } })) };
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
      what: 'Aircraft broadcasting their position right now, drawn as plane pointers turned to their real heading. White is above 25,000 ft, yellow 10,000–25,000 ft, teal below 10,000 ft, grey on the ground. Click a plane for its seatback-style flight view.',
      how: 'Planes work out where they are with satellite navigation and broadcast it about twice a second on 1090 MHz (ADS-B). Thousands of volunteer receivers share what they hear. “Whole world” reads the OpenSky Network once a minute; “Near my view” reads adsb.lol every few seconds within about 460 km of the centre of the screen. Heights are exaggerated so you can see them.',
      try: 'Pick a long-haul flight over an ocean, open its flight view and choose Follow. Then compare the “outside temperature” with the standard-atmosphere formula in the Learn page.',
      refs: ['opensky', 'adsblol', 'adsbdb'],
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
