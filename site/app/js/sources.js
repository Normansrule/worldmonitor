// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — every data source, library and reference the app relies on.
// The About panel renders this list, and docs/REFERENCES.md mirrors it.

export const SOURCES = {
  worldmonitor: {
    name: 'World Monitor by Elie Habib',
    url: 'https://github.com/koala73/worldmonitor',
    license: 'AGPL-3.0-only',
    role: 'Original design, 3D globe concept, layer catalogue and the curated static datasets (cables, pipelines, ports, trade routes, chokepoints, AI data centres, spaceports, nuclear sites, economic centres, critical minerals, conflict zones, hotspots, country borders, textures).',
  },
  globegl: { name: 'globe.gl / three-globe (Vasco Asturiano)', url: 'https://github.com/vasturiano/globe.gl', license: 'MIT', role: '3D globe rendering, slippy-map tile engine for deep zoom.' },
  three: { name: 'three.js', url: 'https://threejs.org', license: 'MIT', role: 'WebGL engine underneath globe.gl; day/night shader.' },
  satellitejs: { name: 'satellite.js (SGP4/SDP4)', url: 'https://github.com/shashwatak/satellite-js', license: 'MIT', role: 'Propagating satellite orbits from TLEs in the browser.' },
  usgs: { name: 'USGS Earthquake Hazards Program — GeoJSON summary feeds', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php', license: 'Public domain (U.S. Government)', role: 'Live earthquakes.' },
  eonet: { name: 'NASA EONET v3 (Earth Observatory Natural Event Tracker)', url: 'https://eonet.gsfc.nasa.gov/docs/v3', license: 'Public domain (NASA)', role: 'Wildfires, storms, volcanoes, sea and lake ice, floods.' },
  swpc: { name: 'NOAA Space Weather Prediction Center — OVATION aurora & planetary K-index', url: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast', license: 'Public domain (NOAA)', role: 'Aurora forecast and geomagnetic activity.' },
  celestrak: { name: 'CelesTrak GP element sets (T.S. Kelso)', url: 'https://celestrak.org/NORAD/elements/', license: 'Free for use with attribution', role: 'Current two-line element sets for satellite groups.' },
  tlesnapshot: { name: 'globe.gl example dataset (space-track LEO snapshot, Feb 2022)', url: 'https://github.com/vasturiano/globe.gl/tree/master/example/datasets', license: 'MIT (repo); data from Space-Track.org', role: 'Offline fallback for LEO satellites.' },
  adsblol: { name: 'adsb.lol — community ADS-B network', url: 'https://adsb.lol', license: 'ODbL 1.0', role: 'Live aircraft near the view.' },
  opensky: { name: 'OpenSky Network (Schäfer et al., IPSN 2014)', url: 'https://opensky-network.org', license: 'Non-commercial research/education', role: 'Aircraft fallback feed.' },
  gibs: { name: 'NASA GIBS — VIIRS SNPP Corrected Reflectance (true colour)', url: 'https://nasa-gibs.github.io/gibs-api-docs/', license: 'Public domain; acknowledgement requested', role: 'Yesterday’s Earth base map. We acknowledge the use of imagery provided by services from NASA’s Global Imagery Browse Services (GIBS), part of NASA’s Earth Science Data and Information System (ESDIS).' },
  godseye: { name: 'God’s Eye View (Bilawal Sidhu)', url: 'https://github.com/bilawalsidhu/gods-eye-view', license: 'MIT', role: 'Inspiration for sensor looks and keyless browser data sources.' },
  openmeteo: { name: 'Open-Meteo forecast & elevation APIs', url: 'https://open-meteo.com', license: 'CC BY 4.0', role: 'Weather and ground elevation for any clicked point.' },
  restcountries: { name: 'REST Countries', url: 'https://restcountries.com', license: 'MPL-2.0', role: 'Capital, population, languages, currencies for the country card.' },
  worldbank: { name: 'World Bank Open Data API', url: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392', license: 'CC BY 4.0', role: 'GDP, life expectancy, internet use and renewable share indicators.' },
  wikipedia: { name: 'Wikipedia REST API (page summaries)', url: 'https://en.wikipedia.org/api/rest_v1/', license: 'CC BY-SA 4.0', role: 'Short encyclopaedia summaries in the country and place cards.' },
  nominatim: { name: 'Nominatim (OpenStreetMap geocoding)', url: 'https://nominatim.org', license: 'ODbL 1.0 — © OpenStreetMap contributors', role: 'Worldwide place search.' },
  esri: { name: 'Esri World Imagery', url: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9', license: 'Esri terms of use — Esri, Maxar, Earthstar Geographics, and the GIS User Community', role: 'Satellite imagery tiles for street-level zoom.' },
  osm: { name: 'OpenStreetMap standard tiles', url: 'https://operations.osmfoundation.org/policies/tiles/', license: 'ODbL 1.0 — © OpenStreetMap contributors', role: 'Street map tiles for deep zoom.' },
  pb2002: { name: 'Bird (2003) PB2002 plate boundaries, GeoJSON by Hugo Ahlenius (fraxen/tectonicplates)', url: 'https://github.com/fraxen/tectonicplates', license: 'ODC-BY 1.0', role: 'Tectonic plate boundaries.' },
  bird2003: { name: 'Bird, P. (2003) An updated digital model of plate boundaries. G³ 4(3), 1027', url: 'https://doi.org/10.1029/2001GC000252', license: 'Journal article', role: 'Scientific basis for the plate boundary model.' },
  bluemarble: { name: 'NASA Visible Earth — Blue Marble & Black Marble (city lights)', url: 'https://visibleearth.nasa.gov/collection/1484/blue-marble', license: 'Public domain (NASA)', role: 'Day and night Earth textures.' },
  threeglobeimg: { name: 'three-globe example textures (topology bump map, dark Earth)', url: 'https://github.com/vasturiano/three-globe/tree/master/example/img', license: 'MIT (repo); NASA-derived imagery', role: 'Relief bump map and dark base.' },
  solar: { name: 'NOAA / USNO low-precision solar coordinates', url: 'https://aa.usno.navy.mil/faq/sun_approx', license: 'Public domain', role: 'Subsolar point, terminator and sun elevation maths.' },
  aviationformulary: { name: 'Ed Williams — Aviation Formulary (great-circle navigation)', url: 'https://edwilliams.org/avform147.htm', license: 'Reference', role: 'Distance, bearing and destination formulas for Measure and Quiz.' },
  telegeography: { name: 'TeleGeography Submarine Cable Map', url: 'https://www.submarinecablemap.com', license: 'Reference (CC BY-SA 4.0 data)', role: 'Further reading on the submarine cable network.' },
  eia: { name: 'U.S. EIA — World Oil Transit Chokepoints', url: 'https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints', license: 'Public domain', role: 'Further reading on maritime chokepoints.' },
  unctad: { name: 'UNCTAD Review of Maritime Transport', url: 'https://unctad.org/topic/transport-and-trade-logistics/review-of-maritime-transport', license: 'Reference', role: 'Further reading on global shipping.' },
  iaea: { name: 'IAEA Power Reactor Information System (PRIS)', url: 'https://pris.iaea.org', license: 'Reference', role: 'Further reading on nuclear power plants.' },
  usgsplates: { name: 'USGS — This Dynamic Earth', url: 'https://pubs.usgs.gov/gip/dynamic/dynamic.html', license: 'Public domain', role: 'Plate tectonics primer.' },
  nasaorbits: { name: 'NASA Earth Observatory — Catalog of Earth Satellite Orbits', url: 'https://earthobservatory.nasa.gov/features/OrbitsCatalog', license: 'Public domain', role: 'Orbits primer (LEO, MEO, GEO).' },
  kp: { name: 'NOAA SWPC — Planetary K-index', url: 'https://www.swpc.noaa.gov/products/planetary-k-index', license: 'Public domain', role: 'Kp scale explanation.' },
  natearth: { name: 'Natural Earth / world-atlas (country outlines used by World Monitor)', url: 'https://www.naturalearthdata.com', license: 'Public domain', role: 'Country polygons.' },
};

export const src = (id) => SOURCES[id];
