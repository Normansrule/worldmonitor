// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — main application.
// Copyright (C) 2026 Aleksander Norman. Builds on World Monitor, Copyright (C) 2024-2026 Elie Habib
// (https://github.com/koala73/worldmonitor). Licensed under the GNU AGPL v3.0 only; see LICENSE.

import { Globe, THREE } from '../vendor/vendor.min.mjs';
import { LAYERS, GROUPS, layerById, worldMonitorData, plateLabel } from './layers.js';
import { getFeed, getLocal } from './feeds.js';
import * as astro from './astro.js';
import { SOURCES } from './sources.js';
import { TOURS } from './tours.js';
import { Quiz, buildQuestionPool } from './quiz.js';
import { flightsLayer, flightState, layoutPlanes, deckAction } from './flights.js';
import { camerasLayer, alprLayer, stopCameraMedia, alprRow } from './cameras.js';
import { citiesLayer, airportsLayer } from './places.js';
import { installNavigation } from './nav.js';
import { newsLayer } from './news.js';
import { crimeLayer } from './crime.js';
import { installLive } from './live.js';
import { openWall } from './cameras.js';
import { powerLayer, internetLayer, radioLayer, shipsLayer, overlayLayer } from './networks.js';
import { installHud } from './hud.js';
import { MarkerRenderer, GeoIndex, iconsReady } from './markers.js';
import { installPerformance } from './perf.js';
import { smallCircle } from './astro.js';
export const VERSION = '1.5';
const NEW_VERSION = (() => { try { return localStorage.getItem('terra-atlas-version') !== VERSION; } catch { return false; } })();

import { ICONS } from './icons.js';
import { orbitOf } from './layers.js';
import { passes } from './satellites.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const R = 100; // globe.gl globe radius in scene units
const isMobile = matchMedia('(max-width: 860px)').matches;

// ------------------------------------------------------------------ state
const state = {
  base: 'daynight', detailTiles: null, autoDetail: true,
  on: new Set(LAYERS.filter((l) => l.on).map((l) => l.id)),
  opts: Object.fromEntries(LAYERS.map((l) => [l.id, Object.fromEntries((l.options ?? []).map((o) => [o.id, structuredClone(o.value)]))])),
  data: {}, chan: {}, lstatus: {}, loadedAt: {},
  hover: null, mode: null, pov: { lat: 20, lng: 0, altitude: 2.4 },
  tool: { points: [], paths: [], arcs: [], html: [], labels: [], rings: [] },
  tour: null, quiz: null, measure: [],
};

// ------------------------------------------------------------------ base maps
const TILE = {
  imagery: { url: (x, y, l) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${l}/${y}/${x}`, max: 19, attr: 'Imagery © <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community' },
  gibs: { url: (x, y, l) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${gibsDate()}/GoogleMapsCompatible_Level9/${l}/${y}/${x}.jpg`, max: 9, attr: 'NASA GIBS — VIIRS true colour for <span id="gibs-date"></span>. We acknowledge the use of imagery provided by services from NASA’s Global Imagery Browse Services (GIBS), part of NASA’s ESDIS' },
  streets: { url: (x, y, l) => `https://tile.openstreetmap.org/${l}/${x}/${y}.png`, max: 19, attr: 'Map © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' },
};
function gibsDate() { return state.gibsDate ?? new Date(Date.now() - 36 * 3600_000).toISOString().slice(0, 10); }
const TEX = {
  daynight: { attr: 'Day/night: NASA Blue Marble + Black Marble, lit from the real Sun position' },
  bluemarble: { img: 'textures/earth-blue-marble.jpg', bump: 'textures/earth-topology.png', attr: 'NASA Blue Marble, relief from three-globe' },
  night: { img: 'textures/earth-night.jpg', attr: 'NASA Black Marble city lights' },
};
let markers = null;
let perf = { q: { pins: 140, pinsPerLayer: 40, cards: 24, labels: 120, columns: 30000 }, moving() {} };
readHash();

// ------------------------------------------------------------------ globe
const globe = new Globe($('#globe'), { rendererConfig: { antialias: true, preserveDrawingBuffer: true }, animateIn: false });
const defaultMaterial = globe.globeMaterial();
const loader = new THREE.TextureLoader();
const dayNightMaterial = new THREE.ShaderMaterial({
  uniforms: {
    dayTexture: { value: loader.load('textures/earth-blue-marble-2k.jpg') },
    nightTexture: { value: loader.load('textures/earth-night-2k.jpg') },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
  },
  vertexShader: `
    varying vec3 vNormal; varying vec2 vUv;
    void main() {
      vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D dayTexture; uniform sampler2D nightTexture; uniform vec3 sunDir;
    varying vec3 vNormal; varying vec2 vUv;
    void main() {
      float i = dot(normalize(vNormal), normalize(sunDir));
      vec4 day = texture2D(dayTexture, vUv);
      vec4 night = texture2D(nightTexture, vUv) * 1.25;
      float k = smoothstep(-0.08, 0.12, i);           // civil-twilight-ish blend
      vec4 col = mix(night, day, k);
      col.rgb += vec3(1.0, 0.55, 0.25) * 0.12 * (1.0 - abs(k * 2.0 - 1.0)); // warm dusk band
      gl_FragColor = col;
    }`,
});
// Night shade for every base map except Day/night: a transparent sphere just above the ground,
// darkened on the side facing away from the Sun, with a soft twilight edge.
const nightShade = new THREE.Mesh(
  new THREE.SphereGeometry(R * 1.0008, 128, 64),
  new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { sunDir: dayNightMaterial.uniforms.sunDir },
    vertexShader: 'varying vec3 vNormal; void main() { vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 sunDir; varying vec3 vNormal; void main() { float i = dot(normalize(vNormal), normalize(sunDir)); gl_FragColor = vec4(0.01, 0.03, 0.08, (1.0 - smoothstep(-0.12, 0.08, i)) * 0.58); }',
  }),
);
nightShade.visible = false; nightShade.raycast = () => {};
function updateShade() { nightShade.visible = state.on.has('sun') && state.base !== 'daynight'; }
function updateSun() {
  const s = astro.subsolarPoint(new Date());
  const c = globe.getCoords(s.lat, s.lng, 0);
  dayNightMaterial.uniforms.sunDir.value.set(c.x, c.y, c.z).normalize();
}

// Radii and line widths in globe.gl are angles on the sphere, so a 0.5° cable is 55 km wide.
// Scaling them with the camera height keeps markers and lines the same size on screen at every zoom.
let zkAlt = 2.4;
const zk = () => Math.max(0.0002, Math.min(1, zkAlt / 2.2));
function applyZoomScale(force = false) {
  const a = state.pov.altitude;
  if (!force && Math.abs(Math.log(a / zkAlt)) < 0.3) return;
  zkAlt = a;
  markers?.rescale(zk());
  globe.pathStroke((d) => (d.stroke == null ? null : d.stroke * zk()))
    .arcStroke((d) => (d.stroke == null ? null : d.stroke * zk()))
    .ringMaxRadius((d) => d.maxR * zk());
}
function dominant(points, a) {
  const n = {}; for (const p of points) n[p.color] = (n[p.color] ?? 0) + 1;
  const c = Object.entries(n).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '#f07a63'; const [r, g, b] = hex2rgb(c);
  return `rgba(${r},${g},${b},${a})`;
}
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const val = (v, d) => (typeof v === 'function' ? v(d) : v);

globe
  .showAtmosphere(true).atmosphereColor('#7fb6ff').atmosphereAltitude(0.16)
  // points
  .pointLat('lat').pointLng('lng').pointAltitude('alt').pointRadius('r').pointColor('color').pointLabel('tip')
  .pointResolution(10).pointsMerge(false).pointsTransitionDuration(0)
  .onPointClick((d) => d.ref && select(d.ref))
  // rings
  .ringLat('lat').ringLng('lng').ringMaxRadius('maxR').ringPropagationSpeed('speed').ringRepeatPeriod('period')
  .ringColor((d) => { const [r, g, b] = hex2rgb(d.color); return (t) => `rgba(${r},${g},${b},${1 - t})`; })
  // paths
  .pathPoints('pts').pathPointLat((p) => p[0]).pathPointLng((p) => p[1]).pathPointAlt((p) => p[2] ?? 0.002)
  .pathColor('color').pathStroke('stroke').pathLabel((d) => d.tip ?? '').pathTransitionDuration(0)
  .pathDashLength((d) => (d.dash ? d.dash[0] : d.animate ? 0.12 : 1))
  .pathDashGap((d) => (d.dash ? d.dash[1] : d.animate ? 0.015 : 0))
  .pathDashAnimateTime((d) => (d.animate && !reduceMotion ? 40000 : 0))
  .onPathClick((d) => d.ref && !d.passive && select(d.ref))
  // arcs
  .arcStartLat('sLat').arcStartLng('sLng').arcEndLat('eLat').arcEndLng('eLng').arcColor('color').arcStroke('stroke')
  .arcAltitude((d) => d.alt ?? null).arcDashLength((d) => d.dashLen ?? 1).arcDashGap((d) => d.dashGap ?? 0)
  .arcDashAnimateTime((d) => (reduceMotion ? 0 : d.animMs ?? 0)).arcLabel((d) => d.tip ?? '').arcsTransitionDuration(0)
  .onArcClick((d) => d.ref && select(d.ref))
  // polygons
  .polygonGeoJsonGeometry('geometry').polygonAltitude('alt').polygonLabel((d) => d.tip ?? '')
  .polygonSideColor('side').polygonsTransitionDuration(0)
  .onPolygonClick((d, _e, at) => {
    if (d.ref && !d.passive && !d.country) return select(d.ref);
    surfaceClick(at.lat, at.lng, d.country ?? null);
  })
  // labels
  .labelLat('lat').labelLng('lng').labelAltitude((d) => d.alt ?? 0.004).labelText('text').labelSize('size')
  .labelColor('color').labelDotRadius('dot').labelResolution(2).labelsTransitionDuration(0)
  .onLabelClick((d) => d.ref && select(d.ref))
  // particles (satellites, aurora)
  .particlesList('pts').particleLat('lat').particleLng('lng').particleAltitude('alt')
  .particlesColor('color').particlesSize('size').particlesSizeAttenuation(false).particleLabel(() => '').customLayerLabel(() => '')
  // html (pins)
  .htmlLat('lat').htmlLng('lng').htmlAltitude((d) => d.alt ?? 0).htmlElement('el').htmlTransitionDuration(0)
  // hexagon columns (crime density)
  .hexBinPointLat('lat').hexBinPointLng('lng').hexBinPointWeight('w').hexBinMerge(true).hexTransitionDuration(0).hexMargin(0.12)
  .hexAltitude(({ sumWeight }) => Math.min(0.25, state.pov.altitude * 0.03 * Math.sqrt(sumWeight)))
  .hexTopColor(({ points }) => dominant(points, 0.92)).hexSideColor(({ points }) => dominant(points, 0.55))
  // custom three.js objects (merged outlines)
  .customThreeObject((d) => d.obj).customThreeObjectUpdate(() => {})
  // surface clicks + camera
  .onGlobeClick(({ lat, lng }) => surfaceClick(lat, lng, state.on.has('borders') ? countryAt(lat, lng) : null))
  .onZoom((pov) => onCamera(pov))
  .onGlobeReady(() => { $('#loading').classList.add('gone'); intro(); });
setTimeout(() => $('#loading').classList.add('gone'), 8000);

restylePolygons();
zkAlt = state.pov.altitude; applyZoomScale(true);
globe.scene().add(nightShade);
markers = new MarkerRenderer(globe);
globe.scene().add(markers.object);
setTimeout(() => markers.warm(globe.renderer(), globe.scene(), globe.camera()), 1200);
iconsReady.then(() => { compose.last.points = null; scheduleCompose(); });
const controls = globe.controls();
controls.autoRotateSpeed = 0.35;
globe.renderer().setPixelRatio(Math.min(devicePixelRatio, 1.75)); // 4K phones don't need 3× pixels for a globe
const nav = installNavigation({ globe, R, $, reduceMotion, onLocate: (lat, lng) => { fly(lat, lng, 0.012); state.home = [lat, lng]; setTimeout(() => probeCard(lat, lng), 400); } });
// Procedural star field (replaces a 900 kB background image).
{
  const n = 4000; const pos = new Float32Array(n * 3); const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1; const t = Math.random() * Math.PI * 2; const r = 6000 + Math.random() * 3000; const k = Math.sqrt(1 - u * u);
    pos.set([r * k * Math.cos(t), r * u, r * k * Math.sin(t)], i * 3);
    const b = 0.55 + Math.random() * 0.45; const warm = Math.random() < 0.25;
    col.set([b, b * (warm ? 0.9 : 0.97), b * (warm ? 0.78 : 1)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  globe.scene().add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false })));
  globe.camera().far = Math.max(globe.camera().far, 12000); globe.camera().updateProjectionMatrix();
}
// Swap the quick 2K day/night textures for 4K ones once the page is idle.
(window.requestIdleCallback ?? ((f) => setTimeout(f, 2500)))(() => {
  loader.load('textures/earth-blue-marble.jpg', (t) => { dayNightMaterial.uniforms.dayTexture.value = t; });
  loader.load('textures/earth-night.jpg', (t) => { dayNightMaterial.uniforms.nightTexture.value = t; });
});
window.addEventListener('resize', () => globe.width(innerWidth).height(innerHeight));

function restylePolygons() {
  globe.polygonCapColor((d) => (d.country ? (d.country === state.hover ? 'rgba(227,181,91,0.20)' : 'rgba(0,0,0,0)') : val(d.cap, d)));
  globe.polygonStrokeColor((d) => (d.country ? (d.country === state.hover ? 'rgba(227,181,91,1)' : 'rgba(238,243,246,0.26)') : val(d.stroke, d)));
}

// ------------------------------------------------------------------ base-map switching
function setBase(base) {
  state.base = base; state.detailTiles = null;
  document.querySelectorAll('[data-base]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.base === base)));
  applyBase();
  refreshLayer('sun');
  writeHash();
}
function applyBase() {
  const tiles = TILE[state.base] ?? (state.detailTiles && TILE[state.detailTiles]);
  if (tiles) {
    globe.globeTileEngineMaxLevel(tiles.max).globeTileEngineUrl(tiles.url);
  } else {
    globe.globeTileEngineUrl(null);
    if (state.base === 'daynight') { updateSun(); globe.globeMaterial(dayNightMaterial); } else {
      globe.globeMaterial(defaultMaterial);
      globe.globeImageUrl(TEX[state.base].img).bumpImageUrl(TEX[state.base].bump ?? null);
    }
  }
  updateSun(); updateShade();
  if (state.base === 'gibs') globe.globeTileEngineClearCache();
  $('#gibs-pick').hidden = state.base !== 'gibs';
  const credit = tiles ? tiles.attr : TEX[state.base].attr;
  setTimeout(() => { const g = $('#gibs-date'); if (g) g.textContent = gibsDate(); });
  $('#attribution').innerHTML = `${credit} · Built on <a href="https://github.com/koala73/worldmonitor">World Monitor</a> by Elie Habib · <a href="#" data-open-about>Sources and licence</a>`;
}

// ------------------------------------------------------------------ layers: load + compose
async function refreshLayer(id, { soft = false } = {}) {
  const l = layerById[id];
  if (!l || !state.on.has(id)) return;
  if (soft && state.data[id]) { state.chan[id] = l.channels(state.data[id], ctx()); return scheduleCompose(); }
  const first = !state.data[id];
  if (first) setLStatus(id, 'loading');
  try {
    const data = await l.load(state.opts[id], ctx());
    state.data[id] = data;
    state.chan[id] = l.channels(data, ctx());
    state.loadedAt[id] = Date.now();
    const snap = data && (data.snapshot || Object.values(data).some?.((g) => g?.snapshot));
    setLStatus(id, 'ok', snap ? 'Live source unreachable — showing the bundled snapshot' : '');
  } catch (err) {
    console.warn(err);
    state.loadedAt[id] = Date.now(); // back off until the layer's next refresh
    setLStatus(id, 'error', `Could not load: ${err.message}. The source may be down or blocked by your network; try again later.`);
  }
  compose();
}
const viewOf = (pov) => {
  const a = pov.altitude; const horizon = Math.acos(1 / (1 + a)) * astro.R_EARTH_KM; // km to the horizon
  return { lat: pov.lat, lng: pov.lng, altitude: a, radiusKm: Math.min(horizon, a * astro.R_EARTH_KM * 0.95 + 5) };
};
const ctx = () => ({ now: new Date(), base: state.base, hover: state.hover, pov: state.pov, view: viewOf(state.pov), outlineMesh, globe, THREE });

const meshCache = {};
function outlineMesh(key, features, color = 0xeef3f6, opacity = 0.3, alt = 0.004) {
  if (meshCache[key]) return meshCache[key];
  const pos = [];
  const ring = (r) => { for (let i = 0; i + 1 < r.length; i++) { const a = globe.getCoords(r[i][1], r[i][0], alt); const b = globe.getCoords(r[i + 1][1], r[i + 1][0], alt); pos.push(a.x, a.y, a.z, b.x, b.y, b.z); } };
  for (const f of features) {
    const g = f.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polys) for (const r of p) ring(r);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  obj.raycast = () => {};
  meshCache[key] = { obj };
  return meshCache[key];
}

// Point-in-polygon country lookup (ray casting, bbox pre-filter).
let countryIndex = null;
function countryAt(lat, lng) {
  const fs = state.data.borders; if (!fs) return null;
  countryIndex ??= fs.map((f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let x0 = 180; let x1 = -180; let y0 = 90; let y1 = -90;
    for (const p of polys) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { f, polys, bb: [x0, x1, y0, y1] };
  });
  const inRing = (r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i]; const [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; } return c; };
  for (const c of countryIndex) {
    const [x0, x1, y0, y1] = c.bb; if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
    for (const p of c.polys) if (inRing(p[0]) && !p.slice(1).some(inRing)) return c.f;
  }
  return null;
}

let composeQueued = false;
function scheduleCompose() { if (composeQueued) return; composeQueued = true; requestAnimationFrame(() => { composeQueued = false; compose(); }); }
function compose() {
  const acc = { points: [], rings: [], paths: [], arcs: [], polygons: [], labels: [], particles: [], html: [], custom: [], pick: [], hexes: [] };
  for (const l of LAYERS) {
    if (!state.on.has(l.id)) continue;
    const ch = state.chan[l.id];
    if (!ch) continue;
    for (const k of Object.keys(acc)) if (ch[k]) acc[k].push(...ch[k]);
  }
  for (const k of Object.keys(state.tool)) acc[k].push(...state.tool[k]);
  document.body.classList.toggle('close', state.pov.altitude < 0.025);
  // Only hand globe.gl the channels whose contents actually changed — re-digesting
  // unchanged paths/polygons every tick is what makes globes stutter.
  const markerDirty = ['points', 'labels', 'pick'].some((k) => { const prev = compose.last[k]; const sig = acc[k]; return !(prev && prev.length === sig.length && prev.every((x, i) => x === sig[i])); }) || compose.forceMarkers;
  if (markerDirty) { compose.forceMarkers = false; for (const k of ['points', 'labels', 'pick']) compose.last[k] = acc[k]; markerPass(acc); }
  for (const k of Object.keys(acc)) {
    if (k === 'points' || k === 'labels' || k === 'pick') continue;
    const sig = acc[k];
    const prev = compose.last[k];
    if (prev && prev.length === sig.length && prev.every((x, i) => x === sig[i])) continue;
    compose.last[k] = sig;
    SETTERS[k](sig);
  }
}

compose.last = {};

// ---- Fast markers: columns in one instanced mesh, the nearest markers as sprite pins (with a label card
// for the closest ones), names as cached sprites, and a lat/lng grid index for hover and click.
state.index = new GeoIndex(0.5); state.elevated = [];
function markerPass(acc) {
  const v = viewOf(state.pov); const q = perf.q;
  const pts = acc.points; const labels = acc.labels;
  const pins = []; const cols = [];
  if (v.altitude <= 1.1) {
    const perLayer = {}; const lat0 = v.lat; const cosl = Math.cos(lat0 * Math.PI / 180);
    const cand = [];
    for (const p of pts) {
      const l = p.ref && layerById[p.ref.layer];
      if (!l?.pin) { cols.push(p); continue; }
      const dy = (p.lat - lat0) * 111; const dx = (p.lng - v.lng) * 111 * cosl; const km = Math.sqrt(dx * dx + dy * dy);
      if (km > v.radiusKm) { cols.push(p); continue; }
      cand.push({ p, km, l });
    }
    cand.sort((x, y) => x.km - y.km);
    // Declutter in screen space, like a web map: the nearest markers win, cards never overlap,
    // and markers too close to a kept one fold into it as a "+N" cluster badge.
    const placed = []; const cards = [];
    for (const c of cand) {
      if (pins.length >= q.pins || (perLayer[c.l.id] ?? 0) >= q.pinsPerLayer) { cols.push(c.p); continue; }
      const sc = globe.getScreenCoords(c.p.lat, c.p.lng, Math.min(c.p.alt ?? 0.005, 0.02));
      if (!sc || sc.x < -40 || sc.y < -40 || sc.x > innerWidth + 40 || sc.y > innerHeight + 40) { cols.push(c.p); continue; }
      const hitsCard = cards.some((r) => sc.x + 12 > r.x0 && sc.x - 12 < r.x1 && sc.y > r.y0 && sc.y - 34 < r.y1);
      const near = placed.find((o) => Math.abs(o.x - sc.x) < 22 && Math.abs(o.y - sc.y) < 26) ?? (hitsCard ? placed.reduce((b, o) => (!b || Math.hypot(o.x - sc.x, o.y - sc.y) < Math.hypot(b.x - sc.x, b.y - sc.y) ? o : b), null) : null);
      if (near) { near.pin.more = (near.pin.more ?? 0) + 1; cols.push(c.p); continue; }
      perLayer[c.l.id] = (perLayer[c.l.id] ?? 0) + 1;
      const icon = typeof c.l.pin === 'function' ? c.l.pin(c.p.ref.d) : c.l.pin;
      const [title, sub] = tipParts(c.p);
      const rect = { x0: sc.x, x1: sc.x + 36 + Math.min(240, 7.2 * Math.max(title.length, sub.length * 0.9)), y0: sc.y - 44, y1: sc.y - 12 };
      const cardFree = cards.length < q.cards && !cards.some((r) => r.x0 < rect.x1 && rect.x0 < r.x1 && r.y0 < rect.y1 && rect.y0 < r.y1)
        && !placed.some((o) => o.x + 12 > rect.x0 + 30 && o.x - 12 < rect.x1 && o.y > rect.y0 && o.y - 34 < rect.y1);
      if (cardFree) cards.push(rect);
      const pin = { lat: c.p.lat, lng: c.p.lng, alt: Math.min(c.p.alt ?? 0.005, 0.02), icon, color: solid(c.p.color, c.l.swatch), title, sub, detailed: cardFree, ref: c.p.ref, tip: c.p.tip };
      pins.push(pin); placed.push({ x: sc.x, y: sc.y, pin });
    }
  } else cols.push(...pts);
  const lbl = labels.slice(0, q.labels).map((l) => ({ lat: l.lat, lng: l.lng, alt: l.alt ?? 0.004, text: l.text, color: solid(l.color, '#eef3f6'), size: l.px ? l.size : Math.max(11, Math.min(16, (l.size ?? 1) * 12)), ref: l.ref, tip: l.tip }));
  markers.setPoints(cols.length > q.columns ? cols.slice(0, q.columns) : cols, zk());
  markers.setSprites(pins, lbl);
  // index for hover/click; things well above the ground are picked in screen space instead
  const idx = new GeoIndex(v.altitude < 0.05 ? 0.05 : v.altitude < 0.5 ? 0.25 : 1); const elevated = [];
  const addP = (p) => { if (!p.ref) return; if ((p.alt ?? 0) > 0.03) elevated.push(p); else idx.add(p); };
  pts.forEach(addP); lbl.forEach(addP); acc.pick.forEach(addP);
  state.index = idx; state.elevated = elevated;
  cullSprites();
}
function tipParts(p) {
  const m = /<b>([\s\S]*?)<\/b>(?:<span>([\s\S]*?)<\/span>)?/.exec(p.tip ?? '');
  const clean = (x) => (x ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
  return [clean(m?.[1]) || p.label || '', clean(m?.[2])];
}
const solid = (c, fb) => (typeof c === 'string' && (c.startsWith('#') || c.startsWith('rgb')) ? c.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)') : fb);
// Hide sprites on the far side of the planet (sprites ignore depth so they never clip into the ground).
function cullSprites() {
  const c = globe.camera().position; const cl = c.length();
  for (const sp of markers.pool) {
    if (!sp.userData.d) continue;
    const want = sp.userData.d && markers.pins.concat(markers.labels).includes(sp.userData.d);
    if (!want) { sp.visible = false; continue; }
    const p = sp.position; sp.visible = (p.x * c.x + p.y * c.y + p.z * c.z) / (p.length() * cl) > (R * 1.0) / cl - 0.002;
  }
}
const plainTip = (t) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
const SETTERS = {
  rings: (d) => globe.ringsData(d), paths: (d) => globe.pathsData(d), arcs: (d) => globe.arcsData(d),
  polygons: (d) => globe.polygonsData(d), particles: (d) => globe.particlesData(d),
  html: (d) => globe.htmlElementsData(d), custom: (d) => globe.customLayerData(d), pick: () => {},
  hexes: (d) => globe.hexBinResolution(state.pov.altitude < 0.006 ? 9 : state.pov.altitude < 0.02 ? 8 : state.pov.altitude < 0.07 ? 7 : 6).hexBinPointsData(d),
};

// Periodic refresh — each layer declares its own cadence.
setInterval(() => {
  const now = Date.now();
  for (const l of LAYERS) if (l.refresh && state.on.has(l.id) && now - (state.loadedAt[l.id] ?? 0) >= l.refresh) refreshLayer(l.id);
  updateSun();
}, 1000);

// ------------------------------------------------------------------ layer panel
function countOf(id) {
  const l = layerById[id]; const ch = state.chan[id]; const d = state.data[id];
  if (!ch || !d) return '';
  if (l.count) return l.count(d);
  const n = ch.pick?.length || (ch.points?.length ?? 0) + (ch.labels?.length ?? 0) + (ch.paths?.length ?? 0) + (ch.polygons?.length ?? 0) + (ch.arcs?.length ?? 0) + (ch.particles ?? []).reduce((s2, g) => s2 + g.pts.length, 0);
  return n ? n.toLocaleString() : '';
}
function updateCount(id) { const el = document.querySelector(`[data-count="${id}"]`); if (el) el.textContent = state.on.has(id) ? countOf(id) : ''; }
function setLStatus(id, s, note = '') {
  state.lstatus[id] = { s, note };
  if (s !== 'loading') setTimeout(() => updateCount(id), 0);
  const dot = document.querySelector(`[data-status="${id}"]`);
  if (dot) { dot.dataset.s = s; dot.title = note || (s === 'ok' ? 'Loaded' : s === 'loading' ? 'Loading…' : ''); }
}
const PRESETS = [
  ['Connected planet', ['sun', 'borders', 'cities', 'cables', 'internet', 'power', 'aircraft', 'ships', 'radio', 'stations', 'satellites']],
  ['Live world', ['sun', 'borders', 'cities', 'quakes', 'events', 'news', 'aircraft', 'stations']],
  ['Aviation', ['sun', 'borders', 'cities', 'airports', 'aircraft']],
  ['Cameras', ['borders', 'cities', 'cameras', 'alpr']],
  ['Crime & civic', ['borders', 'cities', 'crime', 'cameras']],
  ['Space', ['sun', 'stations', 'satellites', 'aurora']],
  ['Earth science', ['quakes', 'plates', 'events', 'grid', 'borders']],
  ['Infrastructure', ['cables', 'pipelines', 'routes', 'waterways', 'ports', 'datacenters', 'borders']],
];
state.pending = new Map();
function renderLayerPanel() {
  const presets = `<div class="presets" role="group" aria-label="Quick presets">${PRESETS.map(([n], i) => `<button class="chip" data-preset="${i}">${esc(n)}</button>`).join('')}<button class="chip" data-preset="clear">Clear all</button></div>`;
  const html = presets + GROUPS.map((g) => `
    <section class="group"><h3>${esc(g.label)}${g.note ? `<small>${esc(g.note)}</small>` : ''}</h3>
      ${LAYERS.filter((l) => l.group === g.id).map((l) => `
        <div class="layer" style="--sw:${l.swatch}">
          <input type="checkbox" id="ly-${l.id}" data-layer="${l.id}" ${(state.pending.has(l.id) ? state.pending.get(l.id) : state.on.has(l.id)) ? 'checked' : ''}/>
          <label class="sw" for="ly-${l.id}" aria-hidden="true"></label>
          <label for="ly-${l.id}">${esc(l.label)}${l.fresh ? ' <em class="new">new</em>' : ''}${state.pending.has(l.id) ? ' <em class="pend">' + (state.pending.get(l.id) ? 'will show' : 'will hide') + '</em>' : ''}<span class="cnt" data-count="${l.id}">${state.on.has(l.id) ? countOf(l.id) : ''}</span></label>
          <span class="st" data-status="${l.id}" data-s="${state.lstatus[l.id]?.s ?? ''}"></span>
          <button class="learn" data-learn="${l.id}" aria-label="Learn about ${esc(l.label)}">Learn</button>
          ${(l.options ?? []).map((o) => optionHtml(l, o)).join('')}
        </div>`).join('')}
    </section>`).join('');
  $('#layer-list').innerHTML = html;
  const n = state.pending.size;
  $('#apply-bar').hidden = n === 0;
  $('#apply-count').textContent = `${n} change${n === 1 ? '' : 's'} ready`;
}
function applyPending() {
  if (!state.pending.size) return;
  const shown = []; const hidden = [];
  for (const [id, on] of state.pending) { (on ? shown : hidden).push(layerById[id].label); }
  const changes = [...state.pending]; state.pending.clear();
  for (const [id, on] of changes) toggleLayer(id, on, { quiet: true });
  renderLayerPanel(); writeHash();
  toast([shown.length ? `Showing ${shown.join(', ')}` : '', hidden.length ? `Hidden ${hidden.join(', ')}` : ''].filter(Boolean).join(' · '));
}
function stage(id, on) {
  if (on === state.on.has(id)) state.pending.delete(id); else state.pending.set(id, on);
  renderLayerPanel();
}
function preset(i) {
  const want = i === 'clear' ? new Set() : new Set(PRESETS[i][1]);
  state.pending.clear();
  for (const l of LAYERS) if (want.has(l.id) !== state.on.has(l.id)) state.pending.set(l.id, want.has(l.id));
  renderLayerPanel(); applyPending();
}
function toast(msg, ms = 4200) {
  if (!msg) return;
  const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('out');
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.classList.add('out'); setTimeout(() => { t.hidden = true; }, 400); }, ms);
}
function optionHtml(l, o) {
  const v = state.opts[l.id][o.id];
  if (o.multi) return `<div class="opts" role="group" aria-label="${esc(o.label)}">${o.choices.map(([k, lab]) => `<button class="chip" data-opt="${l.id}:${o.id}:${k}" aria-pressed="${v.includes(k)}">${esc(lab)}</button>`).join('')}</div>`;
  return `<div class="opts"><select data-opt="${l.id}:${o.id}" aria-label="${esc(o.label)}">${o.choices.map(([k, lab]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select></div>`;
}
$('#layer-list').addEventListener('change', (e) => {
  const id = e.target.dataset.layer;
  if (id) return stage(id, e.target.checked);
  const [lid, oid] = (e.target.dataset.opt ?? '').split(':');
  if (lid) { state.opts[lid][oid] = e.target.value; delete state.data[lid]; refreshLayer(lid); }
});
$('#layer-list').addEventListener('click', (e) => {
  const pr = e.target.closest('[data-preset]'); if (pr) return preset(pr.dataset.preset === 'clear' ? 'clear' : Number(pr.dataset.preset));
  const learn = e.target.closest('[data-learn]');
  if (learn) return showLearn(learn.dataset.learn);
  const chip = e.target.closest('.chip[data-opt]');
  if (chip) {
    const [lid, oid, k] = chip.dataset.opt.split(':');
    const arr = state.opts[lid][oid]; const i = arr.indexOf(k);
    if (i >= 0) arr.splice(i, 1); else arr.push(k);
    chip.setAttribute('aria-pressed', String(i < 0));
    refreshLayer(lid);
  }
});
function toggleLayer(id, on, { quiet = false } = {}) {
  state.pending.delete(id);
  if (on) state.on.add(id); else { state.on.delete(id); updateCount(id); }
  updateShade();
  const cb = document.getElementById(`ly-${id}`); if (cb) cb.checked = on;
  if (on) refreshLayer(id); else compose();
  writeHash();
}

// ------------------------------------------------------------------ field notes
function openNotes(title, html, key = null) {
  stopCameraMedia();
  state.notesKey = key;
  if (!key?.startsWith('flight:')) { flightState.selected = null; flightState.follow = false; }
  $('#notes-title').textContent = title;
  $('#notes-body').innerHTML = html;
  $('#notes').classList.add('open');
  $('#notes-body').scrollTop = 0;
}
function closeNotes() { $('#notes').classList.remove('open'); stopCameraMedia(); state.notesKey = null; if (flightState.selected) { flightState.selected = null; flightState.follow = false; refreshLayer('aircraft', { soft: true }); } }
const isOpen = (key) => state.notesKey === key && $('#notes').classList.contains('open');
const linksHtml = (links) => (links?.length ? `<div class="links">${links.filter((l) => l.url).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</div>` : '');
const rowsHtml = (rows) => (rows?.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '');
const refsHtml = (ids) => `<ul class="sources">${ids.map((i) => SOURCES[i]).filter(Boolean).map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a><small>${esc(s.license)}</small></li>`).join('')}</ul>`;

function select(ref) {
  const l = layerById[ref.layer];
  if (l?.open) return l.open(ref.d);
  if (!l?.describe) return showLearn(ref.layer);
  const c = l.describe(ref.d);
  state.selected = ref;
  const key = `sel:${ref.layer}:${c.title}`;
  openNotes(l.label, `
    <div id="sel-wiki"></div>
    <h3>${esc(c.title)}</h3>${c.sub ? `<p class="sub">${esc(c.sub)}</p>` : ''}
    ${c.html ?? ''}${rowsHtml(c.rows)}${c.body ? `<p>${esc(c.body)}</p>` : ''}
    ${c.actions?.length ? `<div class="row">${c.actions.map(([a, t]) => `<button class="btn ghost" data-action="${a}">${esc(t)}</button>`).join('')}</div><div id="sel-action"></div>` : ''}
    ${linksHtml(c.links)}
    ${c.probe ? `<h4>Here, right now</h4>${probeHtml(c.probe[0], c.probe[1])}` : ''}
    <h4>About this layer</h4><p>${esc(l.learn.what)}</p>
    <button class="btn ghost" data-learn-more="${l.id}">How it is measured, and something to try</button>`, key);
  if (c.probe) fillProbe(c.probe[0], c.probe[1]);
  if (c.wiki) wikiCard(c.wiki, key);
}
// Wikipedia summary + photo for named things (only exact article matches, never disambiguation pages).
async function wikiCard(title, key) {
  try {
    const w = await getFeed('wikipedia', `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(title).replace(/ /g, '_'))}`, { ttl: 86_400_000 });
    if (w.type !== 'standard' || !isOpen(key)) return;
    $('#sel-wiki').innerHTML = `<figure class="wiki">${w.thumbnail ? `<img src="${esc(w.thumbnail.source)}" alt="" loading="lazy" />` : ''}<figcaption>${esc(w.extract)} <a href="${esc(w.content_urls?.desktop?.page)}" target="_blank" rel="noopener">Wikipedia</a></figcaption></figure>`;
  } catch { /* no article, no card */ }
}
async function runAction(kind) {
  const ref = state.selected; const out = $('#sel-action');
  if (kind === 'orbit' && ref?.d?.sat) { orbitOf.sat = ref.d.sat; orbitOf.snapshot = ref.d.snapshot; toggleLayer('satellites', true); refreshLayer('satellites', { soft: true }); if (out) out.innerHTML = '<p class="muted">Orbit drawn in violet — one full revolution from now.</p>'; }
  if (kind === 'passes' && ref?.d?.sat) {
    if (ref.d.snapshot) { out.innerHTML = '<p class="err">Pass predictions need live orbital elements, and CelesTrak is unreachable right now.</p>'; return; }
    out.innerHTML = '<p class="muted">Finding your location…</p>';
    const go = (lat, lng) => {
      const ps = passes(ref.d.sat, lat, lng, 48);
      out.innerHTML = ps.length ? `<p>Next passes above 10° for ${astro.fmtLat(lat)}, ${astro.fmtLng(lng)}:</p><dl>${ps.map((p) => {
        const dark = astro.solarElevation(lat, lng, p.maxAt) < -6;
        return `<dt>${p.start.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</dt><dd>up to ${Math.round(p.maxEl)}°, ${Math.max(1, Math.round((p.end - p.start) / 60000))} min${dark ? ' · sky dark — look for a moving star' : ' · daylight'}</dd>`;
      }).join('')}</dl><p class="muted">Satellites are only visible when your sky is dark but they are still sunlit, usually within two hours of sunset or sunrise.</p>` : '<p>No passes above 10° in the next 48 hours from here.</p>';
    };
    if (state.home) return go(...state.home);
    navigator.geolocation?.getCurrentPosition((p) => { state.home = [p.coords.latitude, p.coords.longitude]; go(...state.home); }, () => go(state.pov.lat, state.pov.lng));
  }
  if (kind === 'footprint' && ref?.d?.altKm) {
    const ang = (Math.acos(astro.R_EARTH_KM / (astro.R_EARTH_KM + ref.d.altKm)) * 180) / Math.PI;
    state.tool.paths = [{ pts: smallCircle(ref.d.lat, ref.d.lng, ang, 180).map(([a, b]) => [a, b, 0.004]), color: '#9fe3ff', stroke: 0.9, passive: true }];
    state.tool.rings = [{ lat: ref.d.lat, lng: ref.d.lng, color: '#9fe3ff', maxR: ang / Math.max(zk(), 0.001), speed: ang / Math.max(zk(), 0.001), period: 2200 }];
    compose();
    const areaFrac = (1 - Math.cos((ang * Math.PI) / 180)) / 2;
    if (out) out.innerHTML = `<p>From ${Math.round(ref.d.altKm).toLocaleString()} km up it can see a circle ${Math.round((ang * Math.PI / 180) * astro.R_EARTH_KM).toLocaleString()} km in radius — about ${(areaFrac * 100).toFixed(1)} % of Earth’s surface. Anyone inside the cyan circle could in principle see it above their horizon.</p>`;
    globe.pointOfView({ lat: ref.d.lat, lng: ref.d.lng, altitude: Math.max(state.pov.altitude, 1.8) }, reduceMotion ? 0 : 1200);
  }
  if (kind === 'crime-goto' && ref?.d?.goto) globe.pointOfView({ lat: ref.d.goto.lat, lng: ref.d.goto.lng, altitude: 0.03 }, reduceMotion ? 0 : 1800);
  if (kind === 'zoom-alpr' && ref?.d) globe.pointOfView({ lat: ref.d.lat, lng: ref.d.lng, altitude: 0.25 }, reduceMotion ? 0 : 1500);
  if (kind === 'near-flights' && ref?.d) { state.opts.aircraft.scope = 'near'; delete state.data.aircraft; toggleLayer('aircraft', true); renderLayerPanel(); globe.pointOfView({ lat: ref.d.lat, lng: ref.d.lng, altitude: 0.08 }, reduceMotion ? 0 : 1500); }
}
function showLearn(id) {
  const l = layerById[id]; const st = state.lstatus[id];
  const extra = l.describeLayer && state.data[id] ? rowsHtml(l.describeLayer(state.data[id]).rows) : '';
  openNotes('Learn', `
    <h3>${esc(l.label)}</h3>
    ${st?.note ? `<p class="${st.s === 'error' ? 'err' : 'muted'}">${esc(st.note)}</p>` : ''}
    ${extra}
    <h4>What you are seeing</h4><p>${esc(l.learn.what)}</p>
    <h4>How it is measured</h4><p>${esc(l.learn.how)}</p>
    <h4>Try this</h4><p>${esc(l.learn.try)}</p>
    ${state.on.has(id) ? '' : `<p><button class="btn" data-enable="${id}">Show this layer</button></p>`}
    ${id === 'alpr' ? '<p><button class="btn ghost" data-alpr-live="1">Load the latest for this area from OpenStreetMap</button></p>' : ''}
    ${id === 'cameras' ? '<p><button class="btn" data-wall="1">Open the camera wall for this view</button></p>' : ''}
    <h4>Sources and further reading</h4>${refsHtml(l.learn.refs)}`);
}
$('#notes-body').addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.learnMore) showLearn(t.dataset.learnMore);
  if (t.dataset.enable) { toggleLayer(t.dataset.enable, true); showLearn(t.dataset.enable); }
  if (t.dataset.tour) { if (state.mode !== 'tours') setMode('tours'); startTour(t.dataset.tour); }
  if (t.dataset.step) stepTour(Number(t.dataset.step));
  if (t.id === 'tour-exit') endTour();
  if (t.id === 'tour-play') toggleTourPlay(t);
  if (t.id === 'quiz-start' || t.id === 'quiz-again') startQuiz();
  if (t.id === 'quiz-next') nextQuestion();
  if (t.dataset.fly) { const [a, b, c] = t.dataset.fly.split(',').map(Number); fly(a, b, c); }
  if (t.dataset.action) runAction(t.dataset.action);
  if (t.dataset.deck) deckAction(t.dataset.deck, api);
  if (t.dataset.cam) { const c = state.data.cameras?.cams.find((x) => x.id === t.dataset.cam); if (c) { select({ layer: 'cameras', d: c }); fly(c.lat, c.lng, Math.min(state.pov.altitude, 0.02)); } }
  if (t.dataset.alprLive) layerById.alpr.fetchLive(viewOf(state.pov)).then((n) => { t.textContent = `Loaded ${n} from OpenStreetMap`; refreshLayer('alpr'); }).catch(() => { t.textContent = 'Overpass did not respond — try again shortly'; });
});
document.addEventListener('click', (e) => { if (e.target.closest('[data-open-about]')) { e.preventDefault(); setMode('about'); } });
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.close === 'notes') { closeNotes(); if (state.mode) setMode(null); } else $('#layers').classList.remove('open');
}));

// ------------------------------------------------------------------ surface clicks: probe + country card
function surfaceClick(lat, lng, country) {
  if (state.clickConsumed) return; // a marker already handled this click (globe.gl's own click can arrive a frame later)
  if (state.mode === 'measure') return measureClick(lat, lng);
  if (state.mode === 'quiz') return quizClick(lat, lng);
  if (state.mode === 'tours') return;
  setPins([{ lat, lng, cls: '' }]);
  if (country) return countryCard(country, lat, lng);
  probeCard(lat, lng);
}

function probeHtml(lat, lng) {
  const now = new Date(); const el = astro.solarElevation(lat, lng, now);
  return `
    <dl>
      <dt>Position</dt><dd>${astro.fmtLat(lat)}, ${astro.fmtLng(lng)}</dd>
      <dt>Local solar time</dt><dd>${astro.localSolarTime(lng, now)}</dd>
      <dt>Sun elevation</dt><dd>${el.toFixed(1)}° — ${el > 0 ? 'daytime' : el > -6 ? 'civil twilight' : el > -18 ? 'twilight' : 'night'}</dd>
    </dl>
    <div id="probe-live" class="muted">Fetching weather and elevation…</div>
    <div id="probe-plate" class="muted"></div>
    <h4>Look around</h4>
    <div class="row">
      <a class="btn ghost" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" rel="noopener">Street View</a>
      <a class="btn ghost" href="https://earth.google.com/web/@${lat},${lng},150a,900d,35y,0h,65t,0r" target="_blank" rel="noopener">Google Earth 3D</a>
      <a class="btn ghost" href="https://www.mapillary.com/app/?lat=${lat}&lng=${lng}&z=17" target="_blank" rel="noopener">Mapillary</a>
      <button class="btn ghost" data-fly="${lat},${lng},0.0015">Zoom to street level</button>
    </div>
    <div id="probe-photos"></div><div id="probe-cams"></div>`;
}
async function fillProbe(lat, lng) {
  const token = `${lat},${lng}`; fillProbe.token = token;
  lookAround(lat, lng, token);
  getLocal('data/plate-boundaries.json').then((g) => {
    const lines = g.features.map((f) => ({ name: f.properties.Name, pts: f.geometry.coordinates.map(([a, b]) => [b, a]) }));
    const n = astro.nearestOnLines(lat, lng, lines);
    const el = $('#probe-plate');
    if (el && fillProbe.token === token) el.innerHTML = `Nearest plate boundary: <b>${esc(plateLabel(n.line.name))}</b>, about ${astro.fmtKm(n.km)} away.`;
  }).catch(() => {});
  try {
    const [w, e] = await Promise.all([
      getFeed('openmeteo', `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code&timezone=auto`),
      getFeed('openmeteo', `https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}`),
    ]);
    if (fillProbe.token !== token) return;
    const c = w.current; const elev = e.elevation?.[0];
    $('#probe-live').outerHTML = `<dl>
      <dt>Weather now</dt><dd>${esc(WMO[c.weather_code] ?? '—')}, ${c.temperature_2m} °C</dd>
      <dt>Wind</dt><dd>${c.wind_speed_10m} km/h from ${Math.round(c.wind_direction_10m)}°</dd>
      <dt>Humidity · clouds</dt><dd>${c.relative_humidity_2m} % · ${c.cloud_cover} %</dd>
      <dt>Ground elevation</dt><dd>${elev != null ? `${Math.round(elev).toLocaleString()} m ${elev < 0 ? '(below sea level — seafloor or depression)' : ''}` : '—'}</dd>
      <dt>Time zone</dt><dd>${esc(w.timezone ?? '—')}</dd></dl>
      <p class="muted">Weather: Open-Meteo (CC BY 4.0).</p>`;
  } catch {
    const el = $('#probe-live'); if (el && fillProbe.token === token) el.innerHTML = '<span class="err">Open-Meteo did not respond. Weather and elevation are unavailable right now.</span>';
  }
}
// Street-level photos from Panoramax (open, keyless) and the nearest live cameras.
async function lookAround(lat, lng, token) {
  const cams = state.data.cameras?.cams;
  if (cams) {
    const near = cams.map((c) => ({ c, km: astro.haversineKm(lat, lng, c.lat, c.lng) })).filter((x) => x.km < 25).sort((a, b) => a.km - b.km).slice(0, 4);
    if (near.length && $('#probe-cams')) $('#probe-cams').innerHTML = `<h4>Live cameras nearby</h4><div class="camwall">${near.map(({ c, km }) => `<button class="camtile" data-cam="${esc(c.id)}"><img src="${esc(c.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"/><span>${esc(c.name)}</span><small>${km.toFixed(1)} km</small></button>`).join('')}</div>`;
  }
  try {
    const d = 0.004;
    const j = await getFeed('panoramax', `https://api.panoramax.xyz/api/search?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&limit=6`, { ttl: 3600_000 });
    const fs = (j.features ?? []).filter((f) => f.assets?.thumb?.href);
    if (fillProbe.token !== token || !fs.length || !$('#probe-photos')) return;
    $('#probe-photos').innerHTML = `<div class="photos">${fs.map((f) => `<a href="${esc(f.assets.hd?.href ?? f.assets.thumb.href)}" target="_blank" rel="noopener"><img src="${esc(f.assets.thumb.href)}" alt="Street-level photo" loading="lazy"/></a>`).join('')}</div><p class="muted">Street-level photos: Panoramax contributors (CC BY-SA).</p>`;
  } catch { /* optional */ }
}
const WMO = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail' };

function probeCard(lat, lng) {
  openNotes('Point probe', `<h3>This spot on Earth</h3>${probeHtml(lat, lng)}`);
  fillProbe(lat, lng);
}

const flagOf = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');
const WB = [['NY.GDP.MKTP.CD', 'GDP (current US$)', (v) => `$${(v / 1e9).toLocaleString(undefined, { maximumFractionDigits: 0 })} bn`],
  ['SP.DYN.LE00.IN', 'Life expectancy', (v) => `${v.toFixed(1)} years`],
  ['IT.NET.USER.ZS', 'Internet users', (v) => `${v.toFixed(0)} % of people`],
  ['EG.FEC.RNEW.ZS', 'Renewable energy', (v) => `${v.toFixed(0)} % of final energy use`]];

async function countryCard(f, lat, lng) {
  const p = f.properties; const cc = p['ISO3166-1-Alpha-2']; const name = p.name;
  openNotes('Country', `<h3><span class="flag">${flagOf(cc)}</span>${esc(name)}</h3>
    <div id="cc-facts" class="muted">Loading facts…</div><div id="cc-wb"></div><div id="cc-wiki"></div>
    <h4>The point you clicked</h4>${probeHtml(lat, lng)}`);
  fillProbe(lat, lng);
  const valid = cc && /^[A-Z]{2}$/.test(cc);
  if (valid) getFeed('restcountries', `https://restcountries.com/v3.1/alpha/${cc}?fields=name,capital,population,area,region,subregion,languages,currencies,timezones,latlng`).then((r) => {
    const el = $('#cc-facts'); if (!el) return;
    el.className = '';
    el.innerHTML = rowsHtml([['Official name', r.name?.official], ['Capital', r.capital?.join(', ')], ['Region', [r.region, r.subregion].filter(Boolean).join(' · ')],
      ['Population', r.population?.toLocaleString()], ['Area', r.area ? `${Math.round(r.area).toLocaleString()} km²` : '—'],
      ['Density', r.area ? `${(r.population / r.area).toFixed(0)} people/km²` : '—'],
      ['Languages', Object.values(r.languages ?? {}).join(', ')], ['Currencies', Object.values(r.currencies ?? {}).map((c) => `${c.name} (${c.symbol ?? ''})`).join(', ')],
      ['Time zones', r.timezones?.length > 3 ? `${r.timezones.length} zones` : r.timezones?.join(', ')]]);
  }).catch(() => { const el = $('#cc-facts'); if (el) el.innerHTML = '<span class="err">REST Countries did not respond.</span>'; });
  else $('#cc-facts').textContent = '';
  if (valid) Promise.allSettled(WB.map(([ind]) => getFeed('worldbank', `https://api.worldbank.org/v2/country/${cc}/indicator/${ind}?format=json&mrnev=1`))).then((rs) => {
    const rows = rs.map((r, i) => { const d = r.value?.[1]?.[0]; return d?.value != null ? [`${WB[i][1]} (${d.date})`, WB[i][2](d.value)] : null; }).filter(Boolean);
    const el = $('#cc-wb'); if (el && rows.length) el.innerHTML = `<h4>World Bank indicators</h4>${rowsHtml(rows)}`;
  });
  getFeed('wikipedia', `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`).then((w) => {
    const el = $('#cc-wiki'); if (!el || !w.extract) return;
    el.innerHTML = `<h4>From Wikipedia</h4><p>${esc(w.extract)}</p>${linksHtml([{ label: 'Read on Wikipedia', url: w.content_urls?.desktop?.page }])}`;
  }).catch(() => {});
}

// ------------------------------------------------------------------ pins / tool overlays
function pinEl(cls) { const d = document.createElement('div'); d.className = `pin ${cls}`; return d; }
function setPins(pins) { state.tool.html = pins.map((p) => ({ lat: p.lat, lng: p.lng, el: pinEl(p.cls) })); compose(); }
function clearTool() { state.tool = { points: [], paths: [], arcs: [], html: [], labels: [], rings: [] }; compose(); }
function pulse(lat, lng, rKm) { const ring = { lat, lng, color: '#7ed6c4', maxR: rKm / 111 / Math.max(zk(), 0.001), speed: rKm / 111 / 0.9 / Math.max(zk(), 0.001), period: 900 }; state.tool.rings.push(ring); compose(); setTimeout(() => { state.tool.rings = state.tool.rings.filter((r) => r !== ring); compose(); }, 3200); }
function setHover(c) {
  if (c === state.hover) return;
  state.hover = c; $('#globe').style.cursor = c && !state.mode ? 'pointer' : state.mode === 'measure' || state.mode === 'quiz' ? 'crosshair' : '';
  if (state.data.borders && state.on.has('borders')) { state.chan.borders = layerById.borders.channels(state.data.borders, ctx()); compose(); }
}

// ------------------------------------------------------------------ measure
function measureClick(lat, lng) {
  if (state.measure.length >= 2) state.measure = [];
  state.measure.push([lat, lng]);
  const [a, b] = state.measure;
  state.tool.html = state.measure.map(([la, lo]) => ({ lat: la, lng: lo, el: pinEl('') }));
  state.tool.paths = [];
  if (b) {
    const km = astro.haversineKm(a[0], a[1], b[0], b[1]);
    state.tool.paths = [{ pts: astro.greatCirclePoints(a[0], a[1], b[0], b[1], 128).map(([x, y]) => [x, y, 0.006]), color: '#e3b55b', stroke: 1.1, passive: true }];
    const fibreMs = (km / 204000) * 1000; const vacMs = (km / 299792) * 1000;
    openNotes('Measure', `<h3>${astro.fmtKm(km)}</h3><p class="sub">Great-circle distance — the shortest path over the surface.</p>
      ${rowsHtml([['From', `${astro.fmtLat(a[0])}, ${astro.fmtLng(a[1])}`], ['To', `${astro.fmtLat(b[0])}, ${astro.fmtLng(b[1])}`],
        ['Initial bearing', `${astro.bearingDeg(a[0], a[1], b[0], b[1]).toFixed(1)}°`], ['Nautical miles', `${Math.round(km / 1.852).toLocaleString()} nmi`],
        ['Light in fibre, one way', `${fibreMs.toFixed(1)} ms (round trip ≥ ${(2 * fibreMs).toFixed(0)} ms)`], ['Light in vacuum', `${vacMs.toFixed(1)} ms`],
        ['Airliner at 900 km/h', `${(km / 900).toFixed(1)} h`]])}
      <p>The line curves on a flat map but is “straight” on the sphere. Its compass bearing changes along the way, which is why long flights look bent on paper charts. Real cables take longer routes, so real latency is higher than the fibre figure.</p>
      <p class="muted">Click two new points to measure again. Formulas: haversine and initial bearing (Aviation Formulary).</p>`);
  } else openNotes('Measure', '<h3>Pick the second point</h3><p>Click anywhere else on the globe.</p>');
  compose();
}

// ------------------------------------------------------------------ tours
let tourTimer = null;
function toursHome() {
  openNotes('Guided tours', `<p>Short stories told on the globe. Each one switches on the layers it needs.</p>
    ${TOURS.map((t) => `<button class="tour-card" data-tour="${t.id}"><b>${esc(t.title)}</b><span>${esc(t.blurb)}</span></button>`).join('')}`);
}
function startTour(id) {
  const t = TOURS.find((x) => x.id === id);
  state.tour = { t, i: 0, prevOn: new Set(state.on), prevBase: state.base, prevSat: [...state.opts.satellites.groups] };
  if (t.satGroups) state.opts.satellites.groups = [...t.satGroups];
  for (const l of LAYERS) toggleLayer(l.id, t.layers.includes(l.id));
  renderLayerPanel();
  setBase(t.base);
  stepTour(0);
}
function stepTour(i) {
  const { t } = state.tour; state.tour.i = Math.max(0, Math.min(t.steps.length - 1, i));
  const s = t.steps[state.tour.i];
  globe.pointOfView(s.pov, reduceMotion ? 0 : 2600);
  openNotes(t.title, `<div class="steps">${t.steps.map((_, k) => `<i class="${k <= state.tour.i ? 'on' : ''}"></i>`).join('')}</div>
    <p class="kicker">Step ${state.tour.i + 1} of ${t.steps.length}</p><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
    <div class="row"><button class="btn ghost" data-step="${state.tour.i - 1}" ${state.tour.i === 0 ? 'disabled' : ''}>Back</button>
    ${state.tour.i < t.steps.length - 1 ? `<button class="btn" data-step="${state.tour.i + 1}">Next</button>` : '<button class="btn" id="tour-exit">Finish tour</button>'}
    <button class="btn ghost" id="tour-play" aria-pressed="${!!tourTimer}">${tourTimer ? 'Pause' : 'Autoplay'}</button></div>`);
}
function toggleTourPlay(btn) {
  if (tourTimer) { clearInterval(tourTimer); tourTimer = null; btn.textContent = 'Autoplay'; return; }
  btn.textContent = 'Pause';
  tourTimer = setInterval(() => { if (!state.tour) return; if (state.tour.i >= state.tour.t.steps.length - 1) { clearInterval(tourTimer); tourTimer = null; return; } stepTour(state.tour.i + 1); }, 10000);
}
function endTour() {
  clearInterval(tourTimer); tourTimer = null;
  if (state.tour) endTourSilently();
  setMode(null);
}

// ------------------------------------------------------------------ quiz
let pool = null;
async function quizHome() {
  openNotes('Where on Earth?', `<p>You get eight places. Click where you think each one is. Closer guesses score more — up to 1,000 points each, halving roughly every 1,000 km.</p>
    <p class="muted">Tip: switch Countries off for a harder game.</p><button class="btn" id="quiz-start">Start</button>`);
}
async function startQuiz() {
  pool ??= await buildQuestionPool();
  state.quiz = new Quiz(pool, 8); clearTool();
  globe.pointOfView({ lat: 15, lng: state.pov.lng, altitude: 2.6 }, reduceMotion ? 0 : 1200);
  askQuestion();
}
function askQuestion() {
  const q = state.quiz.current;
  openNotes('Where on Earth?', `<div class="steps">${state.quiz.rounds.map((_, k) => `<i class="${k < state.quiz.i ? 'on' : ''}"></i>`).join('')}</div>
    <p class="kicker">${esc(q.kind)} · question ${state.quiz.i + 1} of ${state.quiz.rounds.length}</p><h3>${esc(q.name)}</h3>
    <p>Click its location on the globe.</p><p class="muted">Score so far: ${state.quiz.score.toLocaleString()}</p>`);
  state.quiz.awaiting = true;
}
function quizClick(lat, lng) {
  if (!state.quiz?.awaiting) return;
  state.quiz.awaiting = false;
  const r = state.quiz.guess(lat, lng);
  state.tool.html = [{ lat, lng, el: pinEl('guess') }, { lat: r.q.lat, lng: r.q.lng, el: pinEl('truth') }];
  state.tool.arcs = [{ sLat: lat, sLng: lng, eLat: r.q.lat, eLng: r.q.lng, color: ['#f07a63', '#7ed6c4'], stroke: 0.7, dashLen: 1, dashGap: 0 }];
  compose();
  openNotes('Where on Earth?', `<p class="kicker">${esc(r.q.kind)}</p><h3>${esc(r.q.name)}</h3>
    <p class="score">+${r.pts}</p><p>You were ${r.kmText} away.</p>${r.q.fact ? `<p>${esc(r.q.fact)}</p>` : ''}
    <button class="btn" id="quiz-next">${state.quiz.done ? 'See your score' : 'Next place'}</button>`);
}
function nextQuestion() {
  clearTool();
  if (!state.quiz.done) return askQuestion();
  const best = Math.max(...state.quiz.results.map((r) => r.pts)); const avg = state.quiz.results.reduce((s, r) => s + r.km, 0) / state.quiz.results.length;
  openNotes('Where on Earth?', `<h3>Final score</h3><p class="score">${state.quiz.score.toLocaleString()}</p>
    ${rowsHtml([['Average miss', astro.fmtKm(avg)], ['Best round', `${best} points`]])}
    ${rowsHtml(state.quiz.results.map((r) => [r.q.name, `${r.kmText} · ${r.pts}`]))}
    <button class="btn" id="quiz-again">Play again</button>`);
}

// ------------------------------------------------------------------ about
function aboutPanel() {
  const repo = sourceRepoUrl();
  openNotes('About and sources', `
    <div class="credit"><p><b>Terra Atlas is built on <a href="https://github.com/koala73/worldmonitor" target="_blank" rel="noopener">World Monitor</a> by Elie Habib.</b>
    Its design, 3D-globe concept, layer catalogue and curated datasets come from that project. This fork adds a static, server-free build for GitHub Pages, live public feeds, deep-zoom tiles, tours, a quiz and teaching notes.</p></div>
    <p>Free software under the <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">GNU AGPL v3.0</a>. You can read, copy and change the source code of this exact site: <a href="${esc(repo)}" target="_blank" rel="noopener">${esc(repo.replace('https://', ''))}</a>.</p>
    <h4>Keyboard</h4>${rowsHtml([['/', 'Search'], ['R', 'Auto-rotate'], ['1 – 4', 'Normal, night vision, thermal, CRT'], ['L', 'Layers (on small screens)'], ['T · Q · M', 'Tours, quiz, measure'], ['Esc', 'Close panel / leave mode']])}
    <h4>Data, libraries and references</h4>
    <ul class="sources">${Object.values(SOURCES).map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a><small>${esc(s.role)} — ${esc(s.license)}</small></li>`).join('')}</ul>`);
}
function sourceRepoUrl() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (m) { const repo = location.pathname.split('/').filter(Boolean)[0]; return `https://github.com/${m[1]}/${repo ?? `${m[1]}.github.io`}`; }
  return 'https://github.com/koala73/worldmonitor';
}

// ------------------------------------------------------------------ modes
function setMode(mode) {
  const next = state.mode === mode ? null : mode;
  if (state.tour && next !== 'tours') { clearInterval(tourTimer); tourTimer = null; endTourSilently(); }
  state.mode = next;
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  state.measure = []; clearTool();
  $('#globe').style.cursor = state.mode === 'measure' || state.mode === 'quiz' ? 'crosshair' : '';
  if (state.mode === 'tours') toursHome();
  else if (state.mode === 'quiz') quizHome();
  else if (state.mode === 'measure') openNotes('Measure', '<h3>Pick two points</h3><p>Click the globe twice to get the great-circle distance, bearing, and how long light takes to cross it in an optical fibre.</p>');
  else if (state.mode === 'about') aboutPanel();
  else closeNotes();
}
function endTourSilently() {
  const { prevOn, prevBase, prevSat } = state.tour; state.tour = null;
  state.opts.satellites.groups = prevSat;
  for (const l of LAYERS) toggleLayer(l.id, prevOn.has(l.id));
  renderLayerPanel(); setBase(prevBase);
}
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
document.querySelectorAll('[data-base]').forEach((b) => b.addEventListener('click', () => setBase(b.dataset.base)));

// ------------------------------------------------------------------ search
let index = null; let sel = -1; let hits = [];
async function buildIndex() {
  const wm = await worldMonitorData();
  const I = [];
  const add = (name, kind, lat, lng, alt, ref) => I.push({ name, kind, lat, lng, alt, ref, key: name.toLowerCase() });
  wm.cables.forEach((c) => { const [lng, lat] = c.points[Math.floor(c.points.length / 2)]; add(c.name, 'Cable', lat, lng, 1.2, { layer: 'cables', d: c }); });
  wm.pipelines.forEach((p) => { const [lng, lat] = p.points[Math.floor(p.points.length / 2)]; add(p.name, 'Pipeline', lat, lng, 1, { layer: 'pipelines', d: p }); });
  wm.ports.forEach((p) => add(p.name, 'Port', p.lat, p.lon, 0.25, { layer: 'ports', d: p }));
  wm.waterways.forEach((w) => add(w.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()), 'Chokepoint', w.lat, w.lon, 0.4, { layer: 'waterways', d: w }));
  wm.datacenters.forEach((d) => add(d.name, 'AI data centre', d.lat, d.lon, 0.15, { layer: 'datacenters', d }));
  wm.spaceports.forEach((s) => add(s.name, 'Spaceport', s.lat, s.lon, 0.2, { layer: 'spaceports', d: s }));
  wm.nuclear.forEach((n) => add(n.name, 'Nuclear site', n.lat, n.lon, 0.15, { layer: 'nuclear', d: n }));
  wm.economic.forEach((e) => add(e.name, 'Financial centre', e.lat, e.lon, 0.2, { layer: 'economic', d: e }));
  wm.minerals.forEach((m) => add(m.name, 'Mine', m.lat, m.lon, 0.2, { layer: 'minerals', d: m }));
  (await getLocal('data/countries.geojson')).features.filter((f) => f.geometry).forEach((f) => {
    const c = centroid(f.geometry); if (c) add(f.properties.name, 'Country', c[0], c[1], 1.1, null);
  });
  (await getLocal('data/cities.json')).rows.forEach(([name, lat, lng, pop, capital, cc, region]) => add(name, capital ? 'Capital city' : 'City', lat, lng, 0.06, { layer: 'cities', d: { name, lat, lng, pop, capital: !!capital, cc, region } }));
  (await getLocal('data/airports.json')).rows.forEach(([iata, icao, name, lat, lng, elev, city, cc, large]) => {
    const d = { iata, icao, name, lat, lng, elev, city, cc, large: !!large };
    add(`${iata} · ${name}`, 'Airport', lat, lng, 0.03, { layer: 'airports', d });
  });
  TOURS.forEach((t) => I.push({ name: t.title, kind: 'Tour', tour: t.id, key: t.title.toLowerCase() }));
  LAYERS.forEach((l) => I.push({ name: l.label, kind: 'Layer', layer: l.id, key: l.label.toLowerCase() }));
  return I;
}
function centroid(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let best = null; let bestN = 0;
  for (const p of polys) if (p[0].length > bestN) { bestN = p[0].length; best = p[0]; }
  if (!best) return null;
  const [sx, sy] = best.reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
  return [sy / best.length, sx / best.length];
}
const q = $('#q'); const list = $('#results');
q.addEventListener('input', async () => {
  index ??= await buildIndex();
  const s = q.value.trim().toLowerCase();
  if (s.length < 2) { list.hidden = true; return; }
  hits = index.filter((x) => x.key.includes(s)).sort((a, b) => a.key.indexOf(s) - b.key.indexOf(s) || (b.kind.includes('City') - a.kind.includes('City')) || a.name.length - b.name.length).slice(0, 9);
  hits.push({ name: `Search “${q.value.trim()}” worldwide`, kind: 'OpenStreetMap', osm: true });
  sel = -1; renderHits();
});
function renderHits() {
  list.innerHTML = hits.map((h, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}">${esc(h.name)}<small>${esc(h.kind)}</small></li>`).join('');
  list.hidden = !hits.length;
}
q.addEventListener('keydown', (e) => {
  if (list.hidden) return;
  if (e.key === 'ArrowDown') { sel = Math.min(hits.length - 1, sel + 1); renderHits(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); renderHits(); e.preventDefault(); }
  if (e.key === 'Escape') { list.hidden = true; q.blur(); }
});
$('#search').addEventListener('submit', (e) => { e.preventDefault(); choose(hits[sel >= 0 ? sel : 0]); });
list.addEventListener('mousedown', (e) => { const li = e.target.closest('li'); if (li) choose(hits[Number(li.dataset.i)]); });
q.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
async function choose(h) {
  if (!h) return;
  list.hidden = true; q.blur();
  if (h.tour) { setMode('tours'); return startTour(h.tour); }
  if (h.layer) { toggleLayer(h.layer, true); return showLearn(h.layer); }
  if (h.osm) return geocode(q.value.trim());
  if (h.ref) { toggleLayer(h.ref.layer, true); select(h.ref); }
  fly(h.lat, h.lng, h.alt);
  if (h.kind === 'Country') { setPins([]); }
}
async function geocode(text) {
  try {
    const r = await getFeed('nominatim', `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(text)}`, { ttl: 3600_000 });
    if (!r.length) return openNotes('Search', `<p>No place called “${esc(text)}” was found in OpenStreetMap.</p>`);
    openNotes('Search', `<p class="muted">Results © OpenStreetMap contributors (Nominatim).</p>${r.map((p) => {
      const bb = p.boundingbox.map(Number); const span = Math.max(bb[1] - bb[0], (bb[3] - bb[2]) * Math.cos(Number(p.lat) * Math.PI / 180));
      const alt = Math.max(0.002, Math.min(2.5, span / 40));
      return `<button class="tour-card" data-fly="${p.lat},${p.lon},${alt}"><b>${esc(p.name || p.display_name.split(',')[0])}</b><span>${esc(p.display_name)}</span></button>`;
    }).join('')}`);
    const p = r[0]; const bb = p.boundingbox.map(Number);
    fly(Number(p.lat), Number(p.lon), Math.max(0.002, Math.min(2.5, Math.max(bb[1] - bb[0], bb[3] - bb[2]) / 40)));
  } catch { openNotes('Search', '<p class="err">OpenStreetMap search did not respond. Try again in a moment.</p>'); }
}
function fly(lat, lng, altitude, pin = true) {
  globe.pointOfView({ lat, lng, altitude }, reduceMotion ? 0 : 2200);
  if (pin) setPins([{ lat, lng, cls: '' }]);
}
let followAt = 0;
function followTo(lat, lng) { if (performance.now() - followAt < 900) return; followAt = performance.now(); globe.pointOfView({ lat, lng, altitude: state.pov.altitude }, reduceMotion ? 0 : 1100); }

// ------------------------------------------------------------------ camera, readout, auto-detail, hash
function onCamera(pov) {
  const prevAlt = state.pov.altitude;
  state.pov = pov;
  nav.tune(pov.altitude);
  if (state.on.has('aircraft') && Math.abs(Math.log(pov.altitude / prevAlt)) > 0.02) layoutPlanes(globe, pov.altitude);
  if (!onCamera.raf) onCamera.raf = requestAnimationFrame(() => { onCamera.raf = 0; cullSprites(); if (Math.abs(Math.log(state.pov.altitude / zkAlt)) > 0.12) { zkAlt = state.pov.altitude; markers.rescale(zk()); } });
  perf?.moving();
  clearTimeout(onCamera.v); onCamera.v = setTimeout(viewSettled, 280);
  if (!cursor) showReadout(pov.lat, pov.lng);
  $('#ro-alt').textContent = `eye ${Math.round(pov.altitude * astro.R_EARTH_KM).toLocaleString()} km`;
  // automatic street-level detail
  if (state.autoDetail && !TILE[state.base]) {
    if (!state.detailTiles && pov.altitude < 0.12) { state.detailTiles = 'imagery'; applyBase(); }
    else if (state.detailTiles && pov.altitude > 0.2) { state.detailTiles = null; applyBase(); }
  }
  clearTimeout(onCamera.t); onCamera.t = setTimeout(writeHash, 500);
}
// After the camera stops: refresh the layers that depend on what is in view (city names, pins, cameras…).
// Work is split into small slices with a yield between layers, so the page never locks up.
const yieldToBrowser = () => new Promise((r) => (window.scheduler?.yield ? window.scheduler.yield().then(r) : setTimeout(r, 0)));
let settleRun = 0;
async function viewSettled() {
  const run = ++settleRun;
  applyZoomScale();
  for (const l of LAYERS) {
    if (!l.viewDependent || !state.on.has(l.id) || !state.data[l.id]) continue;
    await yieldToBrowser(); if (run !== settleRun) return; // a newer camera move superseded this one
    if (l.reloadOnView) refreshLayer(l.id); else state.chan[l.id] = l.channels(state.data[l.id], ctx());
  }
  compose.forceMarkers = true; compose();
}
// Screen-space picking for things drawn as particles or instances (planes, satellites, cameras from afar).
let downAt = null;
$('#globe').addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; state.clickConsumed = false; }, true);
$('#globe').addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || state.mode === 'measure' || state.mode === 'quiz') return;
  if (e.target.closest?.('.pinx')) return;
  const rect = $('#globe').getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
  const hit = pickAt(x, y);
  if (hit) { state.hitAt = performance.now(); state.clickConsumed = true; select(hit.ref); }
}, true);
function kmPerPx() { const fov = (globe.camera().fov * Math.PI) / 180; return Math.max(0.0005, (2 * state.pov.altitude * astro.R_EARTH_KM * Math.tan(fov / 2)) / innerHeight); }
const occludedFn = () => { const c = globe.camera().position; const cl = c.length(); return (d) => { const w = globe.getCoords(d.lat, d.lng, d.alt ?? 0); return (w.x * c.x + w.y * c.y + w.z * c.z) / (Math.hypot(w.x, w.y, w.z) * cl) < R / cl - 0.002; }; };
function pickAt(x, y, { elevated = true } = {}) {
  const pin = markers.hitPin(x, y, occludedFn()); if (pin) return pin;
  const g = globe.toGlobeCoords(x, y);
  if (g) { const n = state.index.nearest(g.lat, g.lng, kmPerPx() * 9); if (n) return n.item; }
  if (!elevated) return null;
  const cam = globe.camera().position; const cr = cam.length();
  let best = null; let bestD = 11;
  for (const p of state.elevated) {
    const s2 = globe.getScreenCoords(p.lat, p.lng, p.alt); if (!s2) continue;
    const d = Math.hypot(s2.x - x, s2.y - y); if (d < bestD) { best = p; bestD = d; }
  }
  if (best) return best;
  for (const l of LAYERS) {
    const pk = state.on.has(l.id) && l.pickScreen !== false && ['aircraft', 'satellites'].includes(l.id) && state.chan[l.id]?.pick; if (!pk) continue;
    for (const p of pk) {
      const s = globe.getScreenCoords(p.lat, p.lng, p.alt); if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y); if (d >= bestD) continue;
      const w = globe.getCoords(p.lat, p.lng, p.alt); // hidden behind the Earth?
      const dx = w.x - cam.x; const dy = w.y - cam.y; const dz = w.z - cam.z; const len = Math.hypot(dx, dy, dz);
      const tca = -(cam.x * dx + cam.y * dy + cam.z * dz) / len; const d2 = cr * cr - tca * tca;
      if (tca > 0 && d2 < R * R && tca - Math.sqrt(R * R - d2) < len - 0.01) continue;
      best = p; bestD = d;
    }
  }
  return best;
}
// Hover tooltips from the same index (throttled).
let hoverAt = 0; const tipEl = document.createElement('div'); tipEl.className = 'hovertip'; tipEl.hidden = true; document.body.appendChild(tipEl);
$('#globe').addEventListener('pointermove', (e) => {
  const now = performance.now(); if (now - hoverAt < 70) return; hoverAt = now;
  const rect = $('#globe').getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
  const h = pickAt(x, y, { elevated: false });
  if (h?.tip) { tipEl.innerHTML = h.tip; tipEl.hidden = false; tipEl.style.transform = `translate(${Math.min(e.clientX + 14, innerWidth - 300)}px, ${e.clientY + 14}px)`; $('#globe').style.cursor = 'pointer'; }
  else { tipEl.hidden = true; if (!state.hover) $('#globe').style.cursor = state.mode === 'measure' || state.mode === 'quiz' ? 'crosshair' : ''; }
});
$('#globe').addEventListener('pointerleave', () => { tipEl.hidden = true; });
let cursor = null;
function showReadout(lat, lng) { $('#ro-lat').textContent = astro.fmtLat(lat); $('#ro-lng').textContent = astro.fmtLng(lng); }
$('#globe').addEventListener('pointermove', (e) => {
  const c = globe.toGlobeCoords(e.offsetX, e.offsetY);
  cursor = c; if (c) showReadout(c.lat, c.lng); else showReadout(state.pov.lat, state.pov.lng);
  if (!hoverQueued) { hoverQueued = true; requestAnimationFrame(() => { hoverQueued = false; setHover(cursor && state.on.has('borders') ? countryAt(cursor.lat, cursor.lng) : null); }); }
});
let hoverQueued = false;
$('#autodetail').addEventListener('change', (e) => { state.autoDetail = e.target.checked; if (!state.autoDetail && state.detailTiles) { state.detailTiles = null; applyBase(); } });

function readHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  const m = h.match(/@(-?[\d.]+),(-?[\d.]+),([\d.]+)/);
  if (m) state.pov = { lat: +m[1], lng: +m[2], altitude: +m[3] }; else state.pov = { lat: 18, lng: Math.round(-new Date().getTimezoneOffset() / 4), altitude: 2.4 };
  const b = h.match(/[&]b=([a-z]+)/); if (b && (TILE[b[1]] || TEX[b[1]])) state.base = b[1];
  const l = h.match(/[&]l=([\w,]*)/); if (l && !NEW_VERSION) state.on = new Set(l[1].split(',').filter((x) => layerById[x]));
}
function writeHash() {
  const p = state.pov;
  history.replaceState(null, '', `#@${p.lat.toFixed(3)},${p.lng.toFixed(3)},${p.altitude.toFixed(3)}&b=${state.base}&l=${[...state.on].join(',')}`);
}

// ------------------------------------------------------------------ clock, spin, screenshot, keys
function tickClock() {
  const d = new Date(); const s = astro.subsolarPoint(d);
  $('#clock').innerHTML = `<b>${d.toISOString().slice(11, 19)}</b> UTC · Sun over ${astro.fmtLat(s.lat).replace(/\.\d+/, '')}, ${astro.fmtLng(s.lng).replace(/\.\d+/, '')}`;
}
setInterval(tickClock, 1000); tickClock();
$('#spin').addEventListener('click', toggleSpin);
function toggleSpin() { controls.autoRotate = !controls.autoRotate; $('#spin').setAttribute('aria-pressed', String(controls.autoRotate)); }
$('#shot').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = globe.renderer().domElement.toDataURL('image/png');
  a.download = `terra-atlas-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.png`; a.click();
});
$('#brand').addEventListener('click', (e) => { e.preventDefault(); globe.pointOfView({ lat: 18, lng: state.pov.lng, altitude: 2.4 }, reduceMotion ? 0 : 1500); });
$('#open-layers').addEventListener('click', () => $('#layers').classList.toggle('open'));
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === '/') { e.preventDefault(); q.focus(); }
  else if (e.key === 'r' || e.key === 'R') toggleSpin();
  else if (e.key === 'l' || e.key === 'L') $('#layers').classList.toggle('open');
  else if (e.key === 't' || e.key === 'T') setMode('tours');
  else if (e.key === 'q' || e.key === 'Q') setMode('quiz');
  else if (e.key === 'm' || e.key === 'M') setMode('measure');
  else if (e.key === 'Escape') { if (state.tour) endTour(); else if (state.mode) setMode(null); else closeNotes(); }
});

// ------------------------------------------------------------------ sensor looks (idea from God's Eye View, MIT)
const LOOKS = ['normal', 'nvg', 'flir', 'crt', 'hud'];
function setLook(look) {
  state.look = LOOKS.includes(look) ? look : 'normal';
  document.body.dataset.look = state.look;
  hud?.show(state.look === 'hud');
  document.querySelectorAll('[data-look]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.look === state.look)));
}
document.querySelectorAll('[data-look]').forEach((b) => b.addEventListener('click', () => setLook(b.dataset.look)));
document.addEventListener('keydown', (e) => { if (!e.target.matches('input, select, textarea') && /^[1-5]$/.test(e.key)) setLook(LOOKS[Number(e.key) - 1]); });
let hud = null;
$('#gibs-date-input').max = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10);
$('#gibs-date-input').value = gibsDate();
$('#gibs-date-input').addEventListener('change', (e) => { state.gibsDate = e.target.value || null; applyBase(); });

// ------------------------------------------------------------------ plug-in layers (flights, cameras, places)
const api = { LAYERS, pulse: (a, b, c) => pulse(a, b, c), globe, state, esc, $, reduceMotion, openNotes, isOpen, refreshLayer, fly, followTo, setBase, wmo: (c) => WMO[c] ?? '—', select, toast: (m) => toast(m), toggleLayer: (id, on) => toggleLayer(id, on), openWall: () => openWall(api) };
{
  const add = (layer, afterId) => { const i = LAYERS.findIndex((l) => l.id === afterId); LAYERS.splice(i + 1, 0, layer); layerById[layer.id] = layer; };
  add(flightsLayer(api), 'events');
  add(camerasLayer(api), 'aurora'); add(alprLayer(api), 'cameras');
  add(citiesLayer, 'grid'); add(airportsLayer, 'cities');
  add(newsLayer, 'aircraft'); add(crimeLayer, 'alpr');
  add(shipsLayer, 'news'); add(radioLayer, 'alpr'); add(overlayLayer(api), 'satellites');
  add(internetLayer, 'cables'); add(powerLayer, 'nuclear');
  crimeLayer.group = 'civic';
  for (const id of ['aircraft', 'news', 'cameras', 'alpr', 'crime', 'cities', 'airports']) layerById[id].fresh = true;
  layerById.aircraft.on = true; layerById.cameras.on = true;
  GROUPS.splice(1, 0, { id: 'cams', label: 'Cameras' });
  GROUPS.splice(3, 0, { id: 'places', label: 'Places' });
  GROUPS.splice(2, 0, { id: 'civic', label: 'Civic data' });
  for (const l of [layerById.aircraft, layerById.cameras, layerById.alpr, layerById.cities, layerById.airports, layerById.news, layerById.crime, layerById.ships, layerById.radio, layerById.overlay, layerById.internet, layerById.power]) {
    state.opts[l.id] = Object.fromEntries((l.options ?? []).map((o) => [o.id, structuredClone(o.value)]));
    if (l.on && (NEW_VERSION || !location.hash.includes('&l='))) state.on.add(l.id);
  }
  // hash may list layers that only exist now
  const hl = decodeURIComponent(location.hash).match(/[&]l=([\w,]*)/);
  if (hl && !NEW_VERSION) for (const id of hl[1].split(',')) if (layerById[id]) state.on.add(id);
}

// ------------------------------------------------------------------ boot
function intro() {
  if (intro.done) return; intro.done = true;
  const target = { ...state.pov };
  if (reduceMotion || location.hash.includes('@')) return;
  globe.pointOfView({ ...target, altitude: 7 }, 0);
  requestAnimationFrame(() => globe.pointOfView(target, 2400));
}
globe.pointOfView(state.pov, 0);
setBase(state.base);
renderLayerPanel();
for (const id of state.on) refreshLayer(id);
$('#apply-now').addEventListener('click', applyPending);
$('#apply-undo').addEventListener('click', () => { state.pending.clear(); renderLayerPanel(); });
const live = installLive(api);
perf = installPerformance({ globe, $, toast: (m) => toast(m), onChange: () => { compose.forceMarkers = true; scheduleCompose(); } });
hud = installHud(api);
if (state.look === 'hud') hud.show(true);
if (NEW_VERSION) { setTimeout(whatsNew, 600); try { localStorage.setItem('terra-atlas-version', VERSION); } catch { /* private mode */ } }
else if (!location.hash.includes('@') && !isMobile) welcome();
function whatsNew() {
  openNotes(`What’s new in v${VERSION}`, `<h3>Faster, smoother, more detail</h3>
    <p class="sub">v1.5 rebuilds how markers are drawn: one draw call for every column, pins and names as cached sprites, map-style decluttering with “+N” cluster badges, label cards on the nearest pins, hover cards everywhere, work split into small slices so the page never freezes, and an automatic quality governor (bottom right, with a live frame-rate meter).</p>
    <h4>From v1.4 — the connected planet</h4>
    <p class="sub">v1.4 added the Overwatch HUD, NASA satellite overlays, power plants, internet buildings, live radio receivers and ships.</p>
    <div class="starts">
      <button class="tour-card" data-start="hud"><b>◎ Overwatch HUD + Area scan</b><span>A heads-up display over the globe; press S to scan everything around the crosshair — flights, satellites overhead, cameras, networks, power, weather.</span></button>
      <button class="tour-card" data-start="rain"><b>☂ Rain falling right now</b><span>NASA’s 30-minute global precipitation wrapped around the globe. Also clouds, fires, night lights, ocean temperature, smoke, snow.</span></button>
      <button class="tour-card" data-start="connected"><b>⌁ The connected planet</b><span>Cables, internet exchanges, 10,700 power plants, flights and ships in one view.</span></button>
      <button class="tour-card" data-start="radio"><b>📻 Listen live</b><span>Public shortwave receivers around the world — click one and tune the radio from that spot.</span></button>
      <button class="tour-card" data-start="ships"><b>⚓ Live ships</b><span>Every vessel broadcasting AIS in the Baltic, refreshed each minute.</span></button>
    </div>
    <h4>From v1.3</h4>
    <p class="sub">Look for the <em class="new">new</em> tags in Layers, the red Live ticker at the top, and these one-click starts:</p>
    <div class="starts">
      <button class="tour-card" data-start="flights"><b>✈ Every flight in the sky</b><span>Live plane pointers on their real headings. Click one for the seatback flight view.</span></button>
      <button class="tour-card" data-start="cams"><b>📹 Live cameras, Los Angeles</b><span>Thousands of traffic cameras worldwide, with a camera wall.</span></button>
      <button class="tour-card" data-start="news"><b>✦ News pins</b><span>Places in the news in the last 24 hours, with headlines.</span></button>
      <button class="tour-card" data-start="crime"><b>▣ Crime map, Chicago</b><span>Official incident reports as 3D hexagon columns and pins.</span></button>
      <button class="tour-card" data-start="live"><b>● Live tour</b><span>Sit back while the globe flies from event to event.</span></button>
    </div>
    <h4>Also new</h4><p>An <b>Apply</b> button for layer changes, quick presets, live counts next to every layer, flight emergency alerts, licence-plate readers, city names, airports, and navigation that slows down as you zoom in.</p>`, 'whatsnew');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-start]'); if (!b) return;
  const k = b.dataset.start;
  const setLayers = (ids) => { state.pending.clear(); for (const l of LAYERS) if (ids.includes(l.id) !== state.on.has(l.id)) state.pending.set(l.id, ids.includes(l.id)); applyPending(); };
  if (k === 'hud') { setLook('hud'); globe.pointOfView({ lat: 34.05, lng: -118.25, altitude: 0.12 }, 1800); setTimeout(() => hud.scan(), 2400); }
  if (k === 'rain') { state.opts.overlay.kind = 'rain'; delete state.data.overlay; setLayers(['sun', 'borders', 'cities', 'overlay']); globe.pointOfView({ lat: 10, lng: 110, altitude: 2.4 }, 1800); showLearn('overlay'); }
  if (k === 'connected') { preset(0); globe.pointOfView({ lat: 45, lng: 5, altitude: 1.4 }, 1800); }
  if (k === 'radio') { setLayers(['sun', 'borders', 'cities', 'radio']); globe.pointOfView({ lat: 45, lng: -20, altitude: 2 }, 1800); showLearn('radio'); }
  if (k === 'ships') { setLayers(['borders', 'cities', 'ships']); globe.pointOfView({ lat: 59.8, lng: 24.5, altitude: 0.25 }, 1800); showLearn('ships'); }
  if (k === 'flights') { setLayers(['sun', 'borders', 'cities', 'aircraft', 'airports']); globe.pointOfView({ lat: 38, lng: -95, altitude: 1.3 }, 1800); showLearn('aircraft'); }
  if (k === 'cams') { setLayers(['borders', 'cities', 'cameras', 'alpr']); globe.pointOfView({ lat: 34.05, lng: -118.25, altitude: 0.05 }, 2000); showLearn('cameras'); setTimeout(() => api.openWall(), 3500); }
  if (k === 'news') { setLayers(['sun', 'borders', 'cities', 'news']); globe.pointOfView({ lat: 25, lng: 20, altitude: 2.3 }, 1800); showLearn('news'); }
  if (k === 'crime') { setLayers(['borders', 'cities', 'crime']); globe.pointOfView({ lat: 41.88, lng: -87.66, altitude: 0.03 }, 2000); setTimeout(() => showLearn('crime'), 2600); }
  if (k === 'live') { setLayers(['sun', 'borders', 'cities', 'quakes', 'events', 'news', 'aircraft']); setTimeout(() => document.querySelector('[data-livetour]')?.click() ?? live.openFeed(), 300); live.openFeed(); }
});
function welcome() {
  openNotes('Welcome', `<h3>A living Earth to explore</h3>
    <p>Drag to spin the globe and scroll or pinch to zoom — all the way down to streets, using satellite tiles once you get close. Click anything to open its field notes; click empty ground for the weather and the nearest plate boundary; click a country for its fact card.</p>
    <p>New here? Start with a short guided tour.</p>
    ${TOURS.slice(0, 3).map((t) => `<button class="tour-card" data-tour="${t.id}"><b>${esc(t.title)}</b><span>${esc(t.blurb)}</span></button>`).join('')}
    <p class="muted">Built on <a href="https://github.com/koala73/worldmonitor" target="_blank" rel="noopener">World Monitor</a> by Elie Habib. Every source is listed under About.</p>`);
}
const params = new URLSearchParams(location.search);
if (params.get('tour')) { setMode('tours'); startTour(params.get('tour')); }
if (params.get('mode')) setMode(params.get('mode'));
setLook(params.get('look') ?? 'normal');
if (window.__TAURI_INTERNALS__) {
  document.body.classList.add('desktop');
  // Desktop app: send outside links to the system browser instead of a dead new-window request.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="http"]');
    if (a && new URL(a.href).origin !== location.origin) { e.preventDefault(); window.__TAURI_INTERNALS__.invoke('plugin:opener|open_url', { url: a.href }); }
  });
}
window.terraAtlas = { pickAt: (x, y) => pickAt(x, y), live, applyPending, preset, VERSION, globe, state, setBase, toggleLayer, startTour, setMode, select, showLearn, surfaceClick, countryAt, setLook, refreshLayer, flightState }; // for tinkering in the console
