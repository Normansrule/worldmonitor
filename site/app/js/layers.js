// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — the layer catalogue.
// Infrastructure + geopolitics layers use the curated datasets from World Monitor
// (github.com/koala73/worldmonitor, © Elie Habib, AGPL-3.0-only); live layers read
// public, CORS-enabled feeds directly from the browser, so the site needs no server.

import { getFeed, getLocal } from './feeds.js';
import { terminator, subsolarPoint, smallCircle, fmtLat, fmtLng } from './astro.js';
import { SAT_GROUPS, loadGroup, positions, groundTrack, periodMinutes, orbitalElements, orbitPath } from './satellites.js';

export const GROUPS = [
  { id: 'live', label: 'Live Earth' },
  { id: 'space', label: 'Sky and space' },
  { id: 'science', label: 'Earth science' },
  { id: 'infra', label: 'Infrastructure', note: 'from World Monitor' },
  { id: 'geo', label: 'Geopolitics', note: 'from World Monitor' },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tip = (title, sub = '') => `<div class="tip"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
const lonLatToLatLng = (pts) => pts.map(([lng, lat]) => [lat, lng]);
const wiki = (q) => ({ label: 'Wikipedia', url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}` });

let WM = null; // World Monitor static bundle
export async function worldMonitorData() {
  if (!WM) WM = await getLocal('data/worldmonitor-static.json');
  return WM;
}

// ---------------------------------------------------------------- colours
const depthColor = (km) => (km < 33 ? '#ffd166' : km < 70 ? '#f79d5c' : km < 300 ? '#e0607e' : '#9b7be0');
const EONET_COLORS = {
  wildfires: '#ff8a4c', severeStorms: '#b7a3ff', volcanoes: '#f0645a', seaLakeIce: '#9fe3ff', floods: '#4aa3ff',
  landslides: '#c9a66b', drought: '#e3c45b', dustHaze: '#d8c29d', snow: '#ffffff', tempExtremes: '#ff5f7e',
  waterColor: '#5fd3a9', manmade: '#bbbbbb', earthquakes: '#ffd166',
};
const PIPE_COLORS = { oil: '#c9803e', gas: '#6fb8ff', lng: '#6fb8ff', hydrogen: '#9ff0c9', products: '#e0a05a', co2: '#aaaaaa' };

export const PLATE_NAMES = {
  AF: 'Africa', AN: 'Antarctica', AR: 'Arabia', AU: 'Australia', CA: 'Caribbean', CO: 'Cocos', EU: 'Eurasia', IN: 'India',
  JF: 'Juan de Fuca', NA: 'North America', NZ: 'Nazca', PA: 'Pacific', PH: 'Philippine Sea', SA: 'South America', SC: 'Scotia',
  SO: 'Somalia', AM: 'Amur', AP: 'Altiplano', AS: 'Aegean Sea', AT: 'Anatolia', BH: "Bird's Head", BR: 'Balmoral Reef',
  BS: 'Banda Sea', BU: 'Burma', CL: 'Caroline', CR: 'Conway Reef', EA: 'Easter', FT: 'Futuna', GP: 'Galápagos',
  JZ: 'Juan Fernández', KE: 'Kermadec', MA: 'Mariana', MN: 'Manus', MO: 'Maoke', MS: 'Molucca Sea', NB: 'North Bismarck',
  ND: 'North Andes', NH: 'New Hebrides', NI: "Niuafo'ou", OK: 'Okhotsk', ON: 'Okinawa', PM: 'Panama', RI: 'Rivera',
  SB: 'South Bismarck', SL: 'Shetland', SS: 'Solomon Sea', SU: 'Sunda', SW: 'Sandwich', TI: 'Timor', TO: 'Tonga',
  WL: 'Woodlark', YA: 'Yangtze',
};

// ---------------------------------------------------------------- helpers
const point = (layer, d, lat, lng, color, r = 0.22, alt = 0.012, t = '') => ({ lat, lng, color, r, alt, tip: t, ref: { layer, d } });

// ================================================================ LAYERS
export const LAYERS = [
  // ------------------------------------------------------------ LIVE EARTH
  {
    id: 'quakes', group: 'live', label: 'Earthquakes', swatch: '#f79d5c', on: true, refresh: 5 * 60_000,
    sources: ['usgs'],
    options: [{ id: 'feed', label: 'Window', choices: [['2.5_day', 'M2.5+ · 24 h'], ['2.5_week', 'M2.5+ · 7 days'], ['4.5_month', 'M4.5+ · 30 days'], ['significant_month', 'Significant · 30 days']], value: '2.5_week' }],
    async load(o) {
      const j = await getFeed('usgs', `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${o.feed}.geojson`);
      return j.features;
    },
    channels(fs) {
      const now = Date.now();
      const points = []; const rings = [];
      for (const f of fs) {
        const [lng, lat, depth] = f.geometry.coordinates; const m = f.properties.mag ?? 0;
        points.push(point('quakes', f, lat, lng, depthColor(depth), 0.07 + m * 0.055, Math.max(0.004, m * m * 0.0016),
          tip(`M${m.toFixed(1)} · ${f.properties.place ?? ''}`, `${Math.round(depth)} km deep · ${new Date(f.properties.time).toUTCString().slice(5, 22)} UTC`)));
        if (m >= 4.5 && now - f.properties.time < 36 * 3600_000) rings.push({ lat, lng, color: depthColor(depth), maxR: m * 0.9, speed: m * 0.6, period: 1400 });
      }
      return { points, rings };
    },
    describe(f) {
      const p = f.properties; const [lng, lat, depth] = f.geometry.coordinates;
      return {
        title: `M${p.mag?.toFixed(1)} earthquake`, sub: p.place,
        rows: [['When', new Date(p.time).toUTCString()], ['Depth', `${depth.toFixed(1)} km (${depth < 70 ? 'shallow' : depth < 300 ? 'intermediate' : 'deep'})`],
          ['Where', `${fmtLat(lat)}, ${fmtLng(lng)}`], ['Magnitude type', p.magType ?? '—'], ['Felt reports', p.felt ?? 0], ['Tsunami flag', p.tsunami ? 'yes' : 'no']],
        body: 'Each whole step in magnitude releases about 32 times more energy. Deep events (purple) trace slabs of ocean floor sinking back into the mantle at subduction zones.',
        links: [{ label: 'USGS event page', url: p.url }],
      };
    },
    learn: {
      what: 'Every earthquake the USGS catalogued in the chosen window. Bar height grows with magnitude; colour shows depth — yellow shallow, orange crustal, pink intermediate, purple deep. Rings pulse for M4.5+ events in the last 36 hours.',
      how: 'Seismometers worldwide time the arrival of P and S waves; the gap between them gives distance, and several stations triangulate the hypocentre. Moment magnitude (Mw) comes from fault area × slip × rock rigidity.',
      try: 'Turn on Plate boundaries and look at South America or Japan from the side: shallow quakes sit at the trench and get deeper inland — the Wadati–Benioff zone of a subducting plate.',
      refs: ['usgs', 'usgsplates'],
    },
  },
  {
    id: 'events', pin: (d) => ({ wildfires: 'flame', severeStorms: 'storm', volcanoes: 'volcano', seaLakeIce: 'ice', floods: 'water' }[d.categories?.[0]?.id] ?? 'alert'), group: 'live', label: 'Natural events', swatch: '#ff8a4c', on: true, refresh: 30 * 60_000,
    sources: ['eonet'],
    async load() {
      const j = await getFeed('eonet', 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=45&limit=500');
      return j.events;
    },
    channels(evs) {
      const points = []; const paths = [];
      for (const e of evs) {
        const cat = e.categories?.[0]?.id ?? 'manmade'; const color = EONET_COLORS[cat] ?? '#ddd';
        const pts = e.geometry.filter((g) => g.type === 'Point').map((g) => [g.coordinates[1], g.coordinates[0]]);
        const polys = e.geometry.filter((g) => g.type === 'Polygon');
        const last = pts.at(-1) ?? (polys[0] ? [polys[0].coordinates[0][0][1], polys[0].coordinates[0][0][0]] : null);
        if (!last) continue;
        points.push(point('events', e, last[0], last[1], color, 0.3, 0.02, tip(e.title, e.categories?.[0]?.title)));
        if (pts.length > 2) paths.push({ pts: pts.map(([a, b]) => [a, b, 0.01]), color: [`${color}22`, color], stroke: 0.6, tip: tip(`${e.title} — track`), ref: { layer: 'events', d: e } });
      }
      return { points, paths };
    },
    describe(e) {
      const g = e.geometry.at(-1);
      return {
        title: e.title, sub: e.categories?.map((c) => c.title).join(', '),
        rows: [['Last update', g?.date ? new Date(g.date).toUTCString() : '—'], ['Observations', e.geometry.length],
          ...(g?.magnitudeValue ? [['Magnitude', `${g.magnitudeValue} ${g.magnitudeUnit ?? ''}`]] : [])],
        body: e.description || 'Curated by NASA from satellite detections and agency reports.',
        links: (e.sources ?? []).map((s) => ({ label: `Source: ${s.id}`, url: s.url })),
      };
    },
    learn: {
      what: 'Open natural events from NASA’s Earth Observatory Natural Event Tracker: wildfires, tropical storms (with their tracks), volcanoes, icebergs, floods and more.',
      how: 'EONET links each event to the agencies that report it (InciWeb, GDACS, JTWC, Smithsonian GVP, the U.S. National Ice Center…) and to satellite imagery of the same place and day.',
      try: 'Find a storm track and follow it: most tropical cyclones drift west in the trade winds, then curve poleward and east — the “recurve”.',
      refs: ['eonet'],
    },
  },
  {
    id: 'aurora', group: 'live', label: 'Aurora forecast', swatch: '#7ef0a0', on: false, refresh: 15 * 60_000,
    sources: ['swpc'],
    async load() {
      const [ov, kp] = await Promise.all([
        getFeed('swpc', 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'),
        getFeed('swpc', 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').catch(() => null),
      ]);
      return { ov, kp };
    },
    channels({ ov }) {
      const bins = [[8, '#3fbf7f', 0.55], [25, '#7ef0a0', 0.8], [50, '#e6ff8a', 1.0], [75, '#ff7a9c', 1.2]];
      const particles = bins.map(([, color, size]) => ({ color, size, pts: [] }));
      for (const [lon, lat, v] of ov.coordinates) {
        if (v < 8) continue;
        const i = v >= 75 ? 3 : v >= 50 ? 2 : v >= 25 ? 1 : 0;
        particles[i].pts.push({ lat, lng: lon > 180 ? lon - 360 : lon, alt: 0.02 + v * 0.0003 });
      }
      return { particles };
    },
    describeLayer({ ov, kp }) {
      const last = Array.isArray(kp) ? kp.at(-1) : null;
      const kpVal = last ? (Array.isArray(last) ? last[1] : last.Kp ?? last.kp_index) : null;
      return { rows: [['Forecast for', ov['Forecast Time'] ?? '—'], ['Planetary Kp (latest)', kpVal ?? '—']] };
    },
    learn: {
      what: 'NOAA’s 30-minute OVATION forecast of where the aurora is likely to be visible, as a probability from 8 % (dim green) to 75 %+ (bright pink).',
      how: 'The model is driven by solar-wind measurements from spacecraft at the L1 point, 1.5 million km sunward — which is why the forecast only looks about half an hour ahead.',
      try: 'Compare the oval with the day/night line: aurora is always there, but you can only see it on the night side. Kp 5 or more is a geomagnetic storm.',
      refs: ['swpc', 'kp'],
    },
  },


  // ------------------------------------------------------------ SPACE
  {
    id: 'sun', group: 'space', label: 'Day and night', swatch: '#ffd37a', on: true, refresh: 60_000,
    sources: ['solar'],
    async load() { return {}; },
    channels(_d, ctx) {
      const s = subsolarPoint(ctx.now);
      const line = terminator(ctx.now).map(([a, b]) => [a, b, 0.004]);
      const out = {
        paths: [{ pts: line, color: 'rgba(255,211,122,0.75)', stroke: 0.5, dash: [0.02, 0.01], tip: tip('Terminator', 'the line between day and night') , ref: { layer: 'sun', d: s } }],
        labels: [{ lat: s.lat, lng: s.lng, text: 'Sun overhead', size: 0.9, color: '#ffd37a', dot: 0.5, ref: { layer: 'sun', d: s } }],
      };
      // Texture and tile base maps get a smooth night shade from main.js (a shader sphere lit by the same Sun).
      return out;
    },
    describe(s) {
      return {
        title: 'The subsolar point', sub: `${fmtLat(s.lat)}, ${fmtLng(s.lng)}`,
        rows: [['Solar declination', `${s.lat.toFixed(2)}°`]],
        body: 'The Sun is directly overhead here right now. Its latitude — the solar declination — swings between the Tropic of Cancer (+23.44°) in June and the Tropic of Capricorn (−23.44°) in December because Earth’s axis is tilted.',
        links: [wiki('Subsolar point')],
      };
    },
    learn: {
      what: 'The dashed line is the terminator, where the Sun is on the horizon. The label marks the subsolar point, where it is straight overhead. In the Day/night base map the whole globe is lit from the real Sun position.',
      how: 'Computed in your browser from the date with the NOAA/USNO low-precision solar formulas — accurate to about a hundredth of a degree.',
      try: 'Near a solstice, spin to a pole: one polar cap stays entirely in daylight and the other entirely in darkness. Near an equinox the terminator runs almost exactly north–south.',
      refs: ['solar'],
    },
  },
  {
    id: 'stations', group: 'space', label: 'Space stations', swatch: '#ffd37a', on: true, refresh: 2_000,
    sources: ['celestrak', 'satellitejs', 'tlesnapshot'],
    async load() { return loadGroup('stations'); },
    channels(g, ctx) {
      const pos = positions(g, ctx.now);
      const labels = []; const paths = [];
      for (const p of pos) {
        const iss = /ISS \(ZARYA\)|^ISS$/.test(p.name); const css = /TIANHE/.test(p.name);
        if (!iss && pos.length > 12 && !/TIANGONG|CSS/.test(p.name)) continue;
        const d = { ...p, snapshot: g.snapshot, snapshotEpoch: g.snapshotEpoch };
        labels.push({ lat: p.lat, lng: p.lng, alt: p.alt, text: iss ? 'ISS' : css ? 'Tiangong' : '', size: 1.1, color: '#ffd37a', dot: iss ? 0.55 : 0.35, ref: { layer: 'stations', d } });
        if (iss) paths.push({ pts: groundTrack(p.sat, g.snapshot, 92, 40, ctx.now).map(([a, b]) => [a, b, 0.003]), color: ['rgba(255,211,122,0.05)', 'rgba(255,211,122,0.8)'], stroke: 0.45, tip: tip('ISS ground track', '±92 minutes ≈ one orbit each way'), ref: { layer: 'stations', d } });
      }
      return { labels, paths };
    },
    describe(p) {
      const per = periodMinutes(p.sat);
      return {
        title: p.name, sub: p.snapshot ? `Offline snapshot — positions as if it were ${p.snapshotEpoch?.toISOString().slice(0, 10)}` : 'Live from CelesTrak elements',
        rows: [['Altitude', `${Math.round(p.altKm)} km`], ['Speed', `${p.speedKms?.toFixed(2)} km/s (${Math.round(p.speedKms * 3600).toLocaleString()} km/h)`],
          ['Orbital period', `${per.toFixed(1)} min — ${(1440 / per).toFixed(1)} orbits a day`], ['NORAD id', p.norad], ['Position', `${fmtLat(p.lat)}, ${fmtLng(p.lng)}`]],
        body: 'At this height the station is still inside a thin trace of atmosphere, so drag slowly lowers its orbit and it needs periodic re-boosts. The yellow line is its ground track: the orbit stays fixed in space while Earth turns underneath, so each pass shifts about 23° west.',
        links: [{ label: 'NASA — Spot the Station', url: 'https://spotthestation.nasa.gov' }, wiki(p.name)],
        actions: [['passes', 'When can I see it from here?'], ['orbit', 'Show its full orbit'], ['footprint', 'What can it see right now?']],
      };
    },
    learn: {
      what: 'Crewed stations, propagated live every two seconds, with the ISS ground track for one orbit before and after now.',
      how: 'CelesTrak publishes two-line element sets (TLEs) from U.S. Space Force tracking. The SGP4 model turns them into a position at any moment, entirely in your browser.',
      try: 'Watch the ISS for a minute: it covers roughly 460 km — about the length of California’s Central Valley.',
      refs: ['celestrak', 'satellitejs', 'nasaorbits'],
    },
  },
  {
    id: 'satellites', group: 'space', label: 'Satellite shells', swatch: '#b7a3ff', on: false, refresh: 3_000,
    sources: ['celestrak', 'satellitejs', 'tlesnapshot'],
    options: [{ id: 'groups', label: 'Groups', multi: true, choices: Object.entries(SAT_GROUPS).filter(([k]) => k !== 'stations').map(([k, g]) => [k, g.label]), value: ['visual', 'gps-ops', 'weather'] }],
    async load(o) {
      const res = {};
      await Promise.all(o.groups.map(async (k) => { try { res[k] = await loadGroup(k); } catch { /* shown via status */ } }));
      return res;
    },
    channels(groups, ctx) {
      const particles = []; const pick = []; const paths = [];
      for (const [k, g] of Object.entries(groups)) {
        const def = SAT_GROUPS[k];
        const pos = positions(g, ctx.now);
        particles.push({ color: def.color, size: def.size, pts: pos.map((p) => ({ lat: p.lat, lng: p.lng, alt: p.alt })) });
        for (const p of pos) pick.push({ lat: p.lat, lng: p.lng, alt: p.alt, ref: { layer: 'satellites', d: { ...p, group: def.label, snapshot: g.snapshot, snapshotEpoch: g.snapshotEpoch } } });
      }
      if (orbitOf.sat) paths.push({ pts: orbitPath(orbitOf.sat, orbitOf.snapshot, ctx.now), color: 'rgba(183,163,255,0.9)', stroke: 0.5, passive: true });
      return { particles, pick, paths };
    },
    describe: (p) => describeSat(p),
    learn: {
      what: 'Each dot is one satellite, grouped by job. Click a dot for its orbit. Low Earth orbit hugs the planet; GPS sits in a medium-orbit shell about 20,200 km up; geostationary satellites form a ring 35,786 km above the equator.',
      how: 'Same pipeline as the stations: CelesTrak TLEs + SGP4, recomputed every three seconds. Zoom out a long way to see the GPS and geostationary shells.',
      try: 'Enable Geostationary and look straight down at the North Pole: the ring is perfectly circular and does not move relative to the ground — the orbital period equals one sidereal day.',
      refs: ['celestrak', 'satellitejs', 'nasaorbits'],
    },
  },

  // ------------------------------------------------------------ EARTH SCIENCE
  {
    id: 'plates', group: 'science', label: 'Plate boundaries', swatch: '#f0645a', on: false,
    sources: ['pb2002', 'bird2003'],
    async load() {
      const g = await getLocal('data/plate-boundaries.json');
      return g.features.map((f) => ({ name: f.properties.Name, pts: lonLatToLatLng(f.geometry.coordinates) }));
    },
    channels(lines) {
      return { paths: lines.map((l) => ({ pts: l.pts.map(([a, b]) => [a, b, 0.003]), color: 'rgba(240,100,90,0.9)', stroke: 0.7, tip: tip(plateLabel(l.name), 'plate boundary (PB2002)'), ref: { layer: 'plates', d: l } })) };
    },
    describe(l) {
      return {
        title: plateLabel(l.name), sub: 'Plate boundary from Bird (2003)',
        body: 'Plates move a few centimetres a year — about as fast as fingernails grow. Where they pull apart, new ocean floor forms (mid-ocean ridges); where they collide, one dives under the other (subduction) or mountains rise; where they slide past, you get transform faults like the San Andreas.',
        links: [{ label: 'Bird (2003), G³', url: 'https://doi.org/10.1029/2001GC000252' }, { label: 'USGS: This Dynamic Earth', url: 'https://pubs.usgs.gov/gip/dynamic/dynamic.html' }],
      };
    },
    learn: {
      what: 'The 52 plates of Peter Bird’s PB2002 model, including the small “microplates” around Indonesia, the Andes and the western Pacific.',
      how: 'Boundaries were compiled from seafloor topography, magnetic stripes, earthquake locations and volcano chains, then checked against GPS-measured plate motions.',
      try: 'Turn Earthquakes on at the same time. Almost every dot lands on a red line — the Ring of Fire is literally the outline of the Pacific Plate.',
      refs: ['pb2002', 'bird2003', 'usgsplates'],
    },
  },
  {
    id: 'grid', group: 'science', label: 'Graticule and circles', swatch: '#9fc3e6', on: false,
    sources: ['solar'],
    async load() { return {}; },
    channels() {
      const paths = []; const labels = [];
      for (let lng = -180; lng < 180; lng += 15) paths.push({ pts: Array.from({ length: 37 }, (_, i) => [-90 + i * 5, lng, 0.0015]), color: 'rgba(159,195,230,0.18)', stroke: 0.15, passive: true });
      for (let lat = -75; lat <= 75; lat += 15) paths.push({ pts: Array.from({ length: 73 }, (_, i) => [lat, -180 + i * 5, 0.0015]), color: 'rgba(159,195,230,0.18)', stroke: 0.15, passive: true });
      const tilt = 23.44;
      const special = [[0, 'Equator', '#9fc3e6'], [tilt, 'Tropic of Cancer', '#ffd37a'], [-tilt, 'Tropic of Capricorn', '#ffd37a'], [90 - tilt, 'Arctic Circle', '#9fe3ff'], [-(90 - tilt), 'Antarctic Circle', '#9fe3ff']];
      for (const [lat, name, color] of special) {
        paths.push({ pts: Array.from({ length: 181 }, (_, i) => [lat, -180 + i * 2, 0.002]), color, stroke: 0.35, tip: tip(name, `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`), ref: { layer: 'grid', d: { name, lat } } });
        labels.push({ lat: lat + 1.2, lng: -30, text: name, size: 0.8, color, dot: 0, ref: { layer: 'grid', d: { name, lat } } });
      }
      return { paths, labels };
    },
    describe(d) {
      return {
        title: d.name, sub: `${Math.abs(d.lat).toFixed(2)}° ${d.lat >= 0 ? 'N' : 'S'}`,
        body: 'The tropics and polar circles are set by Earth’s 23.44° axial tilt. Between the tropics the Sun passes directly overhead at least once a year; beyond the polar circles there is at least one day a year of midnight sun and one of polar night.',
        links: [wiki(d.name)],
      };
    },
    learn: {
      what: 'Lines every 15° of latitude and longitude — 15° of longitude is exactly one hour of Earth’s rotation — plus the equator, tropics and polar circles.',
      how: 'Pure geometry. The tropics sit at the axial tilt; the polar circles at 90° minus it.',
      try: 'Switch on Day and night and compare the terminator with the polar circles near a solstice — they touch.',
      refs: ['solar'],
    },
  },
  {
    id: 'borders', group: 'science', label: 'Countries', swatch: '#eef3f6', on: true,
    sources: ['natearth', 'restcountries', 'worldbank', 'wikipedia'],
    async load() { return (await getLocal('data/countries.geojson')).features.filter((f) => f.geometry); },
    // One merged line mesh for all outlines (hundreds of polygons would cost hundreds of draw calls);
    // hover and click use a point-in-polygon lookup instead of ray-casting every country.
    channels(fs, ctx) {
      const h = ctx.hover;
      return {
        custom: [ctx.outlineMesh('borders', fs)],
        polygons: h ? [{ geometry: h.geometry, country: h, side: 'rgba(0,0,0,0)', alt: 0.006, tip: tip(h.properties.name, 'click for the country card'), ref: { layer: 'borders', d: h } }] : [],
      };
    },
    learn: {
      what: 'Country outlines (the same Natural Earth-derived set World Monitor uses). Hover to highlight; click for a country card with live facts.',
      how: 'The card pulls REST Countries (capital, languages, currencies), World Bank indicators (the latest year each one reports) and a Wikipedia summary — all live from your browser.',
      try: 'Click a country and compare its internet-use share with a neighbour’s.',
      refs: ['natearth', 'restcountries', 'worldbank', 'wikipedia'],
    },
  },

  // ------------------------------------------------------------ INFRASTRUCTURE (World Monitor data)
  {
    id: 'cables', group: 'infra', label: 'Undersea cables', swatch: '#7ed6c4', on: true, sources: ['worldmonitor', 'telegeography'],
    async load() { return (await worldMonitorData()).cables; },
    channels(cs) {
      return { paths: cs.map((c) => ({ pts: lonLatToLatLng(c.points).map(([a, b]) => [a, b, 0.0025]), color: c.major ? 'rgba(126,214,196,0.95)' : 'rgba(126,214,196,0.55)', stroke: c.major ? 0.55 : 0.35, animate: true, tip: tip(c.name, c.rfsYear ? `in service ${c.rfsYear}` : 'submarine cable'), ref: { layer: 'cables', d: c } })) };
    },
    describe(c) {
      return {
        title: c.name, sub: 'Submarine fibre-optic cable',
        rows: [['Ready for service', c.rfsYear ?? '—'], ['Owners', c.owners?.join(', ') ?? '—'], ['Landings', (c.landingPoints ?? []).map((l) => `${l.city}, ${l.countryName}`).join(' · ') || '—']],
        body: 'Light in glass fibre travels at about two-thirds of its vacuum speed, roughly 204,000 km/s. Amplifiers every 50–100 km along the seabed keep the signal alive; the cable itself is often no thicker than a garden hose.',
        links: [{ label: 'TeleGeography cable map', url: 'https://www.submarinecablemap.com' }, wiki(`${c.name} cable`)],
      };
    },
    learn: {
      what: 'Major submarine communication cables and their landing points, as curated in World Monitor. The moving dashes show the direction the line was drawn, not traffic.',
      how: 'Routes are simplified to key waypoints from public cable-system announcements. Over 95 % of intercontinental internet traffic crosses cables like these — not satellites.',
      try: 'Use Measure between New York and London, then read the “light in fibre” line: that is the physical floor on transatlantic latency.',
      refs: ['worldmonitor', 'telegeography'],
    },
  },
  {
    id: 'pipelines', group: 'infra', label: 'Pipelines', swatch: '#c9803e', on: false, sources: ['worldmonitor'],
    async load() { return (await worldMonitorData()).pipelines; },
    channels(ps) {
      return { paths: ps.map((p) => ({ pts: lonLatToLatLng(p.points).map(([a, b]) => [a, b, 0.003]), color: PIPE_COLORS[p.type] ?? '#c9803e', stroke: 0.45, dash: p.status === 'operating' ? null : [0.01, 0.006], tip: tip(p.name, `${p.type} · ${p.status}`), ref: { layer: 'pipelines', d: p } })) };
    },
    describe(p) {
      return { title: p.name, sub: `${p.type} pipeline · ${p.status}`, rows: [['Capacity', p.capacity ?? '—'], ['Length', p.length ?? '—'], ['Operator', p.operator ?? '—'], ['Countries', p.countries?.join(', ') ?? '—']], links: [wiki(p.name)] };
    },
    learn: {
      what: 'Major oil (amber) and gas (blue) pipelines from World Monitor’s energy catalogue. Dashed lines are planned, paused or under construction.',
      how: 'Compiled from operator disclosures and energy-agency reports; routes are simplified.',
      try: 'Look at how many lines converge on Europe from the east and south, then open Chokepoints to see where the sea routes compete with them.',
      refs: ['worldmonitor'],
    },
  },
  {
    id: 'routes', group: 'infra', label: 'Trade routes', swatch: '#e3b55b', on: false, sources: ['worldmonitor', 'unctad'],
    async load() { return (await worldMonitorData()).tradeRoutes; },
    channels(rs) {
      const arcs = [];
      for (const r of rs) for (let i = 0; i + 1 < r.stops.length; i++) {
        const [a, b] = [r.stops[i], r.stops[i + 1]];
        arcs.push({ sLat: a[0], sLng: a[1], eLat: b[0], eLng: b[1], color: ['rgba(227,181,91,0.15)', 'rgba(227,181,91,0.95)'], stroke: 0.4, alt: 0.05, dashLen: 0.35, dashGap: 0.15, animMs: 4000, tip: tip(r.name, r.volumeDesc), ref: { layer: 'routes', d: r } });
      }
      return { arcs };
    },
    describe(r) {
      return { title: r.name, sub: `${r.category} route · ${r.status}`, rows: [['Volume', r.volumeDesc ?? '—'], ['Passes', r.stops.slice(1, -1).map((s) => s[2]).join(' → ') || 'open ocean']], links: [{ label: 'UNCTAD Review of Maritime Transport', url: 'https://unctad.org/topic/transport-and-trade-logistics/review-of-maritime-transport' }] };
    },
    learn: {
      what: 'Principal container, tanker and bulk routes from World Monitor, drawn port → chokepoints → port.',
      how: 'Arcs are schematic hops between waypoints, not ship tracks. Around 80 % of world trade by volume moves by sea.',
      try: 'Pick the China → Europe routes and count how many pass through a single strait.',
      refs: ['worldmonitor', 'unctad'],
    },
  },
  {
    id: 'waterways', pin: 'strait', group: 'infra', label: 'Chokepoints', swatch: '#e3b55b', on: false, sources: ['worldmonitor', 'eia'],
    async load() { return (await worldMonitorData()).waterways; },
    channels(ws) {
      return {
        points: ws.map((w) => point('waterways', w, w.lat, w.lon, '#e3b55b', 0.4, 0.02, tip(title(w.name), w.description))),
        labels: ws.map((w) => ({ lat: w.lat, lng: w.lon, text: title(w.name), size: 0.75, color: '#e3b55b', dot: 0, ref: { layer: 'waterways', d: w } })),
      };
    },
    describe(w) { return { wiki: title(w.name), probe: [w.lat, w.lon], title: title(w.name), sub: 'Strategic waterway', body: w.description, links: [{ label: 'EIA: World Oil Transit Chokepoints', url: 'https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints' }, wiki(title(w.name))] }; },
    learn: {
      what: 'Narrow straits and canals that a large share of shipping must pass through.',
      how: 'Positions and notes from World Monitor’s chokepoint registry.',
      try: 'Click Hormuz, then Measure its width at the narrowest point.',
      refs: ['worldmonitor', 'eia'],
    },
  },
  {
    id: 'ports', pin: 'anchor', group: 'infra', label: 'Major ports', swatch: '#9fc3e6', on: false, sources: ['worldmonitor'],
    async load() { return (await worldMonitorData()).ports; },
    channels(ps) { return { points: ps.map((p) => point('ports', p, p.lat, p.lon, '#9fc3e6', 0.28, 0.015, tip(p.name, `${p.type} port${p.rank ? ` · #${p.rank}` : ''}`))) }; },
    describe(p) { return { wiki: p.name, probe: [p.lat, p.lon], title: p.name, sub: `${p.country} · ${p.type} port`, rows: [['Rank', p.rank ?? '—']], body: p.note, links: [wiki(p.name)] }; },
    learn: { what: 'The world’s biggest container, oil, LNG and bulk ports.', how: 'Curated in World Monitor from port-authority statistics.', try: 'Notice how many top container ports sit on one stretch of coast between Shanghai and Singapore.', refs: ['worldmonitor'] },
  },
  {
    id: 'datacenters', pin: 'chip', group: 'infra', label: 'AI data centres', swatch: '#b7a3ff', on: false, sources: ['worldmonitor'],
    async load() { return (await worldMonitorData()).datacenters; },
    channels(ds) { return { points: ds.map((d) => point('datacenters', d, d.lat, d.lon, d.status === 'operational' ? '#b7a3ff' : 'rgba(183,163,255,0.55)', 0.16 + Math.min(0.35, Math.log10((d.chipCount ?? 1000) + 1) * 0.05), 0.01 + Math.min(0.12, (d.chipCount ?? 0) / 4e6), tip(d.name, `${d.owner ?? ''} · ${d.status}`))) }; },
    describe(d) { return { title: d.name, sub: `${d.owner ?? ''} · ${d.country}`, rows: [['Status', d.status], ['Accelerators', d.chipType ?? '—'], ['Chip count', d.chipCount ? d.chipCount.toLocaleString() : '—']], body: 'Large AI clusters are measured in accelerators and in grid power — a 100,000-GPU site draws on the order of 100+ MW, comparable to a small city.' }; },
    learn: { what: 'Announced and operating AI compute clusters from World Monitor. Bar height scales with chip count.', how: 'Compiled from company announcements and press reports; planned sites are faded.', try: 'Turn on Pipelines and Nuclear sites too — compute follows cheap, reliable power.', refs: ['worldmonitor'] },
  },
  {
    id: 'nuclear', pin: 'atom', group: 'infra', label: 'Nuclear sites', swatch: '#9ff0c9', on: false, sources: ['worldmonitor', 'iaea'],
    async load() { return (await worldMonitorData()).nuclear; },
    channels(ns) { return { points: ns.map((n) => point('nuclear', n, n.lat, n.lon, n.status === 'active' ? '#9ff0c9' : 'rgba(159,240,201,0.4)', 0.16, 0.008, tip(n.name, `${n.type} · ${n.status}`))) }; },
    describe(n) { return { wiki: n.name, title: n.name, sub: `${n.type} · ${n.status}`, rows: [['Operator / country', n.operator ?? '—']], links: [{ label: 'IAEA PRIS', url: 'https://pris.iaea.org' }, wiki(n.name)] }; },
    learn: { what: 'Nuclear power plants and other nuclear facilities from World Monitor’s catalogue.', how: 'Curated from public registries such as the IAEA’s Power Reactor Information System.', try: 'Compare France, Japan and South Korea — dense fleets on coasts, because reactors need lots of cooling water.', refs: ['worldmonitor', 'iaea'] },
  },
  {
    id: 'spaceports', pin: 'rocket', group: 'infra', label: 'Spaceports', swatch: '#ffd37a', on: false, sources: ['worldmonitor'],
    async load() { return (await worldMonitorData()).spaceports; },
    channels(ss) { return { points: ss.map((s) => point('spaceports', s, s.lat, s.lon, '#ffd37a', 0.35, 0.03, tip(s.name, s.operator))) }; },
    describe(s) { return { wiki: s.name, probe: [s.lat, s.lon], title: s.name, sub: `${s.country} · ${s.operator}`, rows: [['Status', s.status], ['Launch cadence', s.launches]], body: 'Launching east near the equator borrows up to 465 m/s from Earth’s spin — one reason Kourou (5° N) is prized for geostationary missions.', links: [wiki(s.name)] }; },
    learn: { what: 'Active orbital launch sites.', how: 'From World Monitor’s spaceport list.', try: 'Note which ones sit on an east-facing coast: rockets launch over water, eastward.', refs: ['worldmonitor'] },
  },
  {
    id: 'economic', pin: 'bank', group: 'infra', label: 'Financial centres', swatch: '#e9f2f7', on: false, sources: ['worldmonitor'],
    async load() { return (await worldMonitorData()).economic; },
    channels(es) { return { points: es.map((e) => point('economic', e, e.lat, e.lon, '#e9f2f7', 0.26, 0.02, tip(e.name, e.type))) }; },
    describe(e) { return { wiki: e.name, title: e.name, sub: `${e.country} · ${e.type}`, body: e.description, links: [wiki(e.name)] }; },
    learn: { what: 'Stock exchanges, central banks and financial hubs.', how: 'From World Monitor’s economic-centres list.', try: 'Switch on Day and night — trading moves west with the Sun from Tokyo to London to New York.', refs: ['worldmonitor'] },
  },
  {
    id: 'minerals', pin: 'mine', group: 'infra', label: 'Critical minerals', swatch: '#c9a66b', on: false, sources: ['worldmonitor'],
    async load() { return (await worldMonitorData()).minerals; },
    channels(ms) { return { points: ms.map((m) => point('minerals', m, m.lat, m.lon, '#c9a66b', 0.34, 0.03, tip(m.name, m.mineral))) }; },
    describe(m) { return { wiki: m.name, title: m.name, sub: `${m.mineral} · ${m.country}`, rows: [['Operator', m.operator], ['Status', m.status]], body: m.significance }; },
    learn: { what: 'Landmark mines for lithium, cobalt, rare earths and other battery and chip minerals.', how: 'From World Monitor’s critical-minerals list.', try: 'Compare where these are mined with where the AI data centres are.', refs: ['worldmonitor'] },
  },

  // ------------------------------------------------------------ GEOPOLITICS (World Monitor data)
  {
    id: 'conflicts', group: 'geo', label: 'Conflict zones', swatch: '#f07a63', on: false, sources: ['worldmonitor'],
    async load() { return (await worldMonitorData()).conflicts; },
    channels(zs) {
      return { polygons: zs.map((z) => ({ geometry: { type: 'Polygon', coordinates: [z.coords] }, cap: 'rgba(240,122,99,0.22)', side: 'rgba(240,122,99,0.12)', stroke: 'rgba(240,122,99,0.9)', alt: 0.012, tip: tip(z.name, z.intensity), ref: { layer: 'conflicts', d: z } })) };
    },
    describe(z) { return { title: z.name, sub: `Intensity: ${z.intensity}`, rows: [['Parties', z.parties?.join(', ') ?? '—']], body: z.description, links: [wiki(z.name)] }; },
    learn: { what: 'Active conflict theatres as outlined in World Monitor’s static configuration.', how: 'A hand-drawn baseline; the full World Monitor app enriches it with live event data (not available on this static site).', try: 'Turn on Chokepoints: several theatres sit beside a strategic strait.', refs: ['worldmonitor'] },
  },
  {
    id: 'hotspots', pin: 'alert', group: 'geo', label: 'Watch regions', swatch: '#f07a63', on: false, sources: ['worldmonitor'],
    async load() { return (await worldMonitorData()).hotspots; },
    channels(hs) { return { points: hs.map((h) => point('hotspots', h, h.lat, h.lon, '#f07a63', 0.32, 0.02, tip(h.name, h.subtext))) }; },
    describe(h) { return { title: h.name, sub: h.location, body: h.description, links: [wiki(h.name)] }; },
    learn: { what: 'Regions World Monitor tracks for geopolitical developments.', how: 'Static baseline positions; in the full app their level rises with matching news volume.', try: 'Open one, then use the country card to read background on the countries involved.', refs: ['worldmonitor'] },
  },
];

export const orbitOf = { sat: null, snapshot: false };
function describeSat(p) {
  const el = orbitalElements(p.sat);
  return {
    title: p.name, sub: `${p.group} · NORAD ${p.norad}${p.snapshot ? ' · offline snapshot' : ''}`,
    rows: [['Orbit', el.cls], ['Altitude now', `${Math.round(p.altKm).toLocaleString()} km`], ['Speed', `${p.speedKms?.toFixed(2)} km/s`],
      ['Period', `${el.periodMin.toFixed(1)} min`], ['Perigee · apogee', `${Math.round(el.perigeeKm).toLocaleString()} km · ${Math.round(el.apogeeKm).toLocaleString()} km`],
      ['Inclination', `${el.incDeg.toFixed(1)}° — ${el.incDeg > 90 ? 'retrograde (sun-synchronous orbits sit near 98°)' : el.incDeg < 5 ? 'equatorial' : 'covers latitudes up to ' + Math.round(Math.min(el.incDeg, 180 - el.incDeg)) + '°'}`],
      ['Eccentricity', el.ecc.toFixed(4)], ['Now over', `${fmtLat(p.lat)}, ${fmtLng(p.lng)}`]],
    body: el.cls.startsWith('Geostationary') ? 'It circles once per sidereal day above the equator, so from the ground it seems to hang still — which is why satellite dishes never move.' : el.cls.startsWith('Medium') ? 'Navigation constellations like GPS, Galileo and GLONASS live in medium Earth orbit, high enough that each satellite sees a third of the planet.' : 'In low Earth orbit a satellite laps the planet every hour and a half and sees only a small patch of ground at a time — good for imaging, bad for coverage.',
    links: [{ label: 'CelesTrak record', url: `https://celestrak.org/satcat/table-satcat.php?CATNR=${p.norad}` }, { label: 'N2YO live tracker', url: `https://www.n2yo.com/satellite/?s=${p.norad}` }],
    actions: [['orbit', 'Show its full orbit'], ['footprint', 'What can it see right now?'], ['passes', 'When can I see it from here?']],
  };
}
function title(s) { return String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }
export function plateLabel(code) {
  const [a, b] = String(code).split(/[-\\/]/);
  return `${PLATE_NAMES[a] ?? a} – ${PLATE_NAMES[b] ?? b} boundary`;
}
export const layerById = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
