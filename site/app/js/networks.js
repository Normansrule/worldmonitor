// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — the connected planet: power plants, internet buildings, radio receivers you can listen to,
// live ships, and NASA satellite overlays wrapped around the globe.
import { THREE } from '../vendor/vendor.min.mjs';
import { getFeed, getLocal } from './feeds.js';
import { haversineKm, fmtLat, fmtLng } from './astro.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tip = (t, s = '') => `<div class="tip"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`;
const inView = (v, lat, lng) => haversineKm(v.lat, v.lng, lat, lng) < v.radiusKm;

// --------------------------------------------------------------- power plants (WRI)
export const FUEL = { Coal: '#8a8f98', Gas: '#ffb15e', Oil: '#b0703c', Nuclear: '#9ff0c9', Hydro: '#4aa3ff', Wind: '#d9f2ff', Solar: '#ffe066', Geothermal: '#ff6f61', Biomass: '#7fc97f', Waste: '#b39ddb', Cogeneration: '#e0a05a', Other: '#cccccc', Storage: '#80deea', Petcoke: '#6d6d6d', 'Wave and Tidal': '#26c6da' };
export const powerLayer = {
  id: 'power', group: 'infra', label: 'Power plants', swatch: '#ffe066', on: false, viewDependent: true, pin: 'bolt', fresh: true,
  sources: ['wri'],
  options: [{ id: 'fuel', label: 'Fuel', multi: true, choices: Object.keys(FUEL).slice(0, 10).map((f) => [f, f]), value: ['Coal', 'Gas', 'Oil', 'Nuclear', 'Hydro', 'Wind', 'Solar', 'Geothermal', 'Biomass', 'Waste'] }],
  async load(o) { const d = await getLocal('data/power-plants.json'); return d.rows.map(([name, lat, lng, mw, fuel, country, owner, year, gwh]) => ({ name, lat, lng, mw, fuel, country, owner, year, gwh })).filter((p) => o.fuel.includes(p.fuel) || !FUEL[p.fuel]); },
  channels(ps, ctx) {
    const v = ctx.view; const list = v.altitude > 1 ? ps.filter((p) => p.mw >= 600) : ps.filter((p) => inView(v, p.lat, p.lng));
    return { points: list.slice(0, 4000).map((p) => ({ lat: p.lat, lng: p.lng, alt: 0.004 + Math.min(0.09, p.mw / 60000), r: 0.08 + Math.min(0.4, Math.sqrt(p.mw) / 120), color: FUEL[p.fuel] ?? '#ccc', label: p.name, tip: tip(p.name, `${p.fuel} · ${p.mw.toLocaleString()} MW · ${p.country}`), ref: { layer: 'power', d: p } })) };
  },
  describe(p) {
    const homes = Math.round((p.mw * 1000 * 0.45) / 1.2); // rough: average capacity factor 45 %, 1.2 kW average household load
    return {
      title: p.name, sub: `${p.fuel} power station · ${p.country}`, wiki: p.name,
      rows: [['Capacity', `${p.mw.toLocaleString()} MW`], ['Generation (latest year)', p.gwh ? `${p.gwh.toLocaleString()} GWh` : '—'], ['Owner', p.owner || '—'], ['Commissioned', p.year || '—'], ['Roughly powers', p.gwh ? `${Math.round(p.gwh * 1e6 / 10500).toLocaleString()} U.S.-sized homes` : `~${homes.toLocaleString()} homes (rule of thumb)`]],
      body: 'Megawatts are the most a plant can deliver at once; gigawatt-hours are what it actually produced over a year. A nuclear plant runs near full power ~90 % of the time; solar and wind far less, because the sun sets and the wind drops.',
      probe: [p.lat, p.lng],
    };
  },
  learn: { what: 'Every power station of 50 MW or more in the Global Power Plant Database — about 10,700 plants, coloured by fuel and sized by capacity. Zoomed out, only plants of 600 MW or more are shown.', how: 'Compiled by the World Resources Institute from national registries, company reports and satellite checks (version 1.3, data up to about 2019–2021).', try: 'Filter to Coal only, then Solar and Wind only, and compare China, India, Germany and the U.S.', refs: ['wri'] },
};

// --------------------------------------------------------------- internet buildings (PeeringDB)
export const internetLayer = {
  id: 'internet', group: 'infra', label: 'Internet exchanges & data centres', swatch: '#7ed6c4', on: false, viewDependent: true, pin: 'server', fresh: true,
  sources: ['peeringdb'],
  async load() { const d = await getLocal('data/networks.json').catch(() => { throw new Error('network data not collected yet — run the “Refresh camera data” workflow once'); }); return d.facilities.map(([name, lat, lng, city, country, nets, ixs, web]) => ({ name, lat, lng, city, country, nets, ixs, web })); },
  channels(fs, ctx) {
    const v = ctx.view; const list = v.altitude > 1 ? fs.filter((f) => f.nets >= 60) : fs.filter((f) => inView(v, f.lat, f.lng));
    return { points: list.slice(0, 3000).map((f) => ({ lat: f.lat, lng: f.lng, alt: 0.004 + Math.min(0.12, f.nets / 3000), r: 0.12 + Math.min(0.35, Math.sqrt(f.nets) / 50), color: f.nets > 150 ? '#7ed6c4' : 'rgba(126,214,196,0.6)', label: f.name, tip: tip(f.name, `${f.nets} networks · ${f.city}`), ref: { layer: 'internet', d: f } })) };
  },
  describe(f) {
    return {
      title: f.name, sub: `${f.city}, ${f.country}`,
      rows: [['Networks present', f.nets.toLocaleString()], ['Internet exchanges inside', f.ixs || '—']],
      body: 'This is a colocation building where networks physically meet. Carriers, clouds and content networks rent space side by side and plug into each other with short fibre cross-connects — often through an internet exchange — so traffic between them never has to cross an ocean.',
      links: [...(f.web ? [{ label: 'Website', url: f.web }] : []), { label: 'Search PeeringDB', url: `https://www.peeringdb.com/search?q=${encodeURIComponent(f.name)}` }], probe: [f.lat, f.lng],
    };
  },
  learn: { what: 'The buildings where the internet’s networks meet: colocation data centres and internet exchanges listed in PeeringDB, sized by how many networks are present.', how: 'PeeringDB is the database network engineers use to find each other; each facility lists its address and the networks inside. A daily GitHub Action copies the public facility list.', try: 'Turn on Undersea cables too: the busiest buildings sit near where cables land — Marseille, Singapore, Ashburn, Frankfurt, Amsterdam.', refs: ['peeringdb'] },
};

// --------------------------------------------------------------- radio receivers you can listen to (KiwiSDR)
export const radioLayer = {
  id: 'radio', group: 'cams', label: 'Live radio receivers', swatch: '#b7a3ff', on: false, viewDependent: true, pin: 'radio', fresh: true,
  sources: ['kiwisdr'],
  async load() { const d = await getLocal('data/networks.json'); return (d.radios ?? []).map(([name, lat, lng, url, users, max, antenna, loc]) => ({ name, lat, lng, url, users, max, antenna, loc })); },
  channels(rs, ctx) {
    const v = ctx.view;
    return {
      particles: [{ color: '#b7a3ff', size: 2, pts: rs.map((r) => ({ lat: r.lat, lng: r.lng, alt: 0.002 })) }],
      points: (v.altitude < 1.3 ? rs.filter((r) => inView(v, r.lat, r.lng)) : []).slice(0, 600).map((r) => ({ lat: r.lat, lng: r.lng, alt: 0.006, r: 0.1, color: '#b7a3ff', label: r.loc || r.name, tip: tip(r.name, `${r.users}/${r.max} listeners · ${r.antenna}`), ref: { layer: 'radio', d: r } })),
      pick: rs.map((r) => ({ lat: r.lat, lng: r.lng, alt: 0.002, ref: { layer: 'radio', d: r } })),
    };
  },
  describe(r) {
    return {
      title: r.name, sub: r.loc || 'Public shortwave receiver',
      rows: [['Listeners now', `${r.users} of ${r.max}`], ['Antenna', r.antenna || '—'], ['Covers', '0–30 MHz: shortwave broadcasters, radio amateurs, aircraft over oceans, time signals']],
      html: `<p><a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">Listen live on this receiver</a></p>`,
      body: 'Shortwave signals bounce off the ionosphere, so a receiver here can hear stations thousands of kilometres away — and what it hears changes between day and night as the ionosphere changes. Try 9–12 MHz for international broadcasters, 5–6 MHz at night, or 10 MHz for the WWV time signal.',
      probe: [r.lat, r.lng],
    };
  },
  learn: { what: 'Hundreds of KiwiSDR shortwave receivers that their owners share with the public. Click one to open it and tune the radio spectrum from that spot on Earth, live in your browser.', how: 'A community directory of public KiwiSDR receivers is collected daily. The receiver pages themselves are run by their volunteer owners.', try: 'Open a receiver on the night side of the planet and one on the day side, tune both to 6 MHz, and compare — that is the ionosphere at work.', refs: ['kiwisdr'] },
};

// --------------------------------------------------------------- live ships (Digitraffic, Baltic & Nordic waters)
const NAV = ['Under way (engine)', 'At anchor', 'Not under command', 'Restricted manoeuvrability', 'Constrained by draught', 'Moored', 'Aground', 'Fishing', 'Under way (sail)'];
let vesselMeta = null;
export const shipsLayer = {
  id: 'ships', group: 'live', label: 'Live ships (Baltic)', swatch: '#4aa3ff', on: false, refresh: 60_000, viewDependent: true, fresh: true,
  sources: ['digitraffic'],
  async load() {
    const j = await getFeed('digitraffic', 'https://meri.digitraffic.fi/api/ais/v1/locations', { ttl: 50_000, timeout: 30_000 });
    if (!vesselMeta) { try { const m = await getFeed('digitraffic', 'https://meri.digitraffic.fi/api/ais/v1/vessels', { ttl: 3600_000, timeout: 30_000 }); vesselMeta = new Map(m.map((v) => [v.mmsi, v])); } catch { vesselMeta = new Map(); } }
    return (j.features ?? []).map((f) => ({ mmsi: f.mmsi ?? f.properties.mmsi, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], sog: f.properties.sog, cog: f.properties.cog, heading: f.properties.heading, nav: f.properties.navStat, t: f.properties.timestampExternal, meta: vesselMeta.get(f.mmsi ?? f.properties.mmsi) }));
  },
  channels(ss, ctx) {
    const v = ctx.view;
    return {
      particles: [{ color: '#4aa3ff', size: 1.8, pts: ss.map((s) => ({ lat: s.lat, lng: s.lng, alt: 0.0015 })) }],
      points: (v.altitude < 0.6 ? ss.filter((s) => inView(v, s.lat, s.lng)) : []).slice(0, 1200).map((s) => ({ lat: s.lat, lng: s.lng, alt: 0.003, r: 0.05, color: s.sog > 0.5 ? '#4aa3ff' : '#9fc3e6', label: s.meta?.name ?? String(s.mmsi), tip: tip(s.meta?.name ?? `MMSI ${s.mmsi}`, `${s.sog ?? 0} kn · ${NAV[s.nav] ?? '—'}`), ref: { layer: 'ships', d: s } })),
      pick: ss.map((s) => ({ lat: s.lat, lng: s.lng, alt: 0.0015, ref: { layer: 'ships', d: s } })),
    };
  },
  describe(s) {
    const m = s.meta ?? {};
    return {
      title: m.name || `Vessel ${s.mmsi}`, sub: [m.destination ? `bound for ${m.destination}` : '', NAV[s.nav]].filter(Boolean).join(' · '),
      rows: [['Speed', `${s.sog ?? 0} knots (${Math.round((s.sog ?? 0) * 1.852)} km/h)`], ['Course', s.cog != null ? `${Math.round(s.cog)}°` : '—'], ['MMSI', s.mmsi], ['Call sign', m.callSign || '—'], ['IMO', m.imo || '—'], ['Draught', m.draught ? `${m.draught / 10} m` : '—'], ['Position', `${fmtLat(s.lat)}, ${fmtLng(s.lng)}`]],
      body: 'Ships broadcast AIS every few seconds on marine VHF so they can see each other in fog and darkness. Coastal stations pick the signals up; Finland’s Fintraffic publishes the Baltic picture openly.',
      links: [{ label: 'VesselFinder', url: `https://www.vesselfinder.com/?mmsi=${s.mmsi}` }, { label: 'MarineTraffic', url: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${s.mmsi}` }],
    };
  },
  learn: { what: 'Every ship broadcasting AIS in the Baltic Sea and nearby Nordic waters, refreshed every minute. Blue ships are moving; grey ones are moored or anchored.', how: 'Fintraffic’s Digitraffic service receives AIS from coastal stations and publishes it openly (CC BY 4.0). Worldwide AIS needs paid or keyed feeds, so this layer covers the region with a truly open one.', try: 'Watch the ferries shuttle between Helsinki and Tallinn, then zoom into the Gulf of Finland at night.', refs: ['digitraffic'] },
};

// --------------------------------------------------------------- NASA satellite overlays (GIBS, equirectangular WMS on a shell)
export const OVERLAYS = {
  clouds: ['Clouds and true colour (today)', 'VIIRS_SNPP_CorrectedReflectance_TrueColor', 'jpeg', 0.95, 1],
  rain: ['Rain and snow now (IMERG, 30-minute)', 'IMERG_Precipitation_Rate', 'png', 0.9, 0],
  fires: ['Fires and hot spots (VIIRS)', 'VIIRS_SNPP_Thermal_Anomalies_375m_All', 'png', 1, 1],
  night: ['Lights at night (last night)', 'VIIRS_SNPP_DayNightBand_ENCC', 'png', 0.9, 1],
  sst: ['Sea surface temperature', 'GHRSST_L4_MUR_Sea_Surface_Temperature', 'png', 0.85, 1],
  aerosol: ['Smoke, dust and haze (aerosols)', 'MODIS_Combined_Value_Added_AOD', 'png', 0.8, 1],
  snow: ['Snow cover', 'MODIS_Terra_NDSI_Snow_Cover', 'png', 0.85, 1],
};
let shell = null;
export function overlayLayer(api) {
  return {
    id: 'overlay', group: 'space', label: 'NASA satellite overlays', swatch: '#9fe3ff', on: false, fresh: true, refresh: 30 * 60_000,
    sources: ['gibs'],
    options: [{ id: 'kind', label: 'Overlay', choices: Object.entries(OVERLAYS).map(([k, v]) => [k, v[0]]), value: 'clouds' }, { id: 'opacity', label: 'Opacity', choices: [['1', 'Solid'], ['0.75', '75 %'], ['0.5', '50 %']], value: '0.75' }],
    async load(o) {
      const [label, layer, fmt, , daysBack] = OVERLAYS[o.kind];
      const day = new Date(Date.now() - (daysBack * 24 + 6) * 3600_000).toISOString().slice(0, 10);
      const time = o.kind === 'rain' ? new Date(Math.floor((Date.now() - 5 * 3600_000) / 1800_000) * 1800_000).toISOString().slice(0, 19) + 'Z' : day;
      const url = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${layer}&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=4096&HEIGHT=2048&FORMAT=image/${fmt}&TRANSPARENT=TRUE&TIME=${time}`;
      const tex = await new Promise((res, rej) => new THREE.TextureLoader().load(url, res, undefined, () => rej(new Error(`NASA GIBS has no “${label}” image for ${time} yet`))));
      tex.colorSpace = THREE.SRGBColorSpace ?? tex.colorSpace;
      return { tex, label, time, opacity: Number(o.opacity) };
    },
    channels(d) {
      if (!shell) {
        shell = new THREE.Mesh(new THREE.SphereGeometry(100 * 1.0012, 160, 80), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
        shell.rotation.y = -Math.PI / 2; // three-globe's texture alignment
        shell.renderOrder = 1;
      }
      shell.material.map = d.tex; shell.material.opacity = d.opacity; shell.material.needsUpdate = true;
      return { custom: [SHELL] };
    },
    describeLayer: (d) => ({ rows: [['Showing', d.label], ['Image time', d.time], ['Source', 'NASA GIBS (EOSDIS)']] }),
    learn: {
      what: 'Wrap the globe in what NASA’s satellites saw: today’s clouds, rain and snow falling in the last half hour, active fires, city lights last night, ocean temperature, smoke and dust, or snow cover.',
      how: 'NASA’s Global Imagery Browse Services turns data from Suomi NPP, Terra, Aqua and the GPM constellation into global images within hours. Terra Atlas requests one world image and wraps it on a transparent shell just above the ground.',
      try: 'Show Fires with Natural events on; then switch to Smoke and dust and follow the smoke downwind.',
      refs: ['gibs'],
    },
  };
}
const SHELL = { get obj() { return shell; } };
