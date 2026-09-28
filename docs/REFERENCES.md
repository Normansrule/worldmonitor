# References and sources

Every data source, library and reference used by the Terra Atlas globe app. This list mirrors `site/app/js/sources.js`, which the app's About panel renders.

| Source | Licence | Used for |
|---|---|---|
| [globe.gl / three-globe (Vasco Asturiano)](https://github.com/vasturiano/globe.gl) | MIT | 3D globe rendering, slippy-map tile engine for deep zoom. |
| [three.js](https://threejs.org) | MIT | WebGL engine underneath globe.gl; day/night shader. |
| [satellite.js (SGP4/SDP4)](https://github.com/shashwatak/satellite-js) | MIT | Propagating satellite orbits from TLEs in the browser. |
| [USGS Earthquake Hazards Program — GeoJSON summary feeds](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) | Public domain (U.S. Government) | Live earthquakes. |
| [NASA EONET v3 (Earth Observatory Natural Event Tracker)](https://eonet.gsfc.nasa.gov/docs/v3) | Public domain (NASA) | Wildfires, storms, volcanoes, sea and lake ice, floods. |
| [NOAA Space Weather Prediction Center — OVATION aurora & planetary K-index](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast) | Public domain (NOAA) | Aurora forecast and geomagnetic activity. |
| [CelesTrak GP element sets (T.S. Kelso)](https://celestrak.org/NORAD/elements/) | Free for use with attribution | Current two-line element sets for satellite groups. |
| [globe.gl example dataset (space-track LEO snapshot, Feb 2022)](https://github.com/vasturiano/globe.gl/tree/master/example/datasets) | MIT (repo); data from Space-Track.org | Offline fallback for LEO satellites. |
| [adsb.lol — community ADS-B network](https://adsb.lol) | ODbL 1.0 | Live aircraft near the view. |
| [OpenSky Network (Schäfer et al., IPSN 2014)](https://opensky-network.org) | Non-commercial research/education | Aircraft fallback feed. |
| [NASA GIBS — VIIRS SNPP Corrected Reflectance (true colour)](https://nasa-gibs.github.io/gibs-api-docs/) | Public domain; acknowledgement requested | Yesterday’s Earth base map. We acknowledge the use of imagery provided by services from NASA’s Global Imagery Browse Services (GIBS), part of NASA’s Earth Science Data and Information System (ESDIS). |
| [God’s Eye View (Bilawal Sidhu)](https://github.com/bilawalsidhu/gods-eye-view) | MIT | Inspiration for sensor looks and keyless browser data sources. |
| [airplanes.live](https://airplanes.live) | Free non-commercial API | Regional aircraft fallback feed. |
| [adsbdb (api.adsbdb.com)](https://www.adsbdb.com) | Courtesy API; route data © David Taylor & Jim Mason, not stored | Aircraft type, registration, photo and route for a selected flight (looked up live, never stored). |
| [Caltrans CWWP2 — CCTV status (all 12 districts)](https://cwwp2.dot.ca.gov/documentation/cctv/cctv.htm) | Public data (State of California) | California highway cameras, stills and live streams. |
| [NYC DOT traffic cameras (webcams.nyctmc.org)](https://webcams.nyctmc.org) | Public data (City of New York) | New York City traffic cameras. |
| [Transport for London — JamCams (Unified API)](https://api.tfl.gov.uk) | Powered by TfL Open Data (OGL v2.0) | London traffic cameras with short video clips. |
| [Hong Kong Transport Department — traffic snapshots](https://data.gov.hk/en-data/dataset/hk-td-tis_2-traffic-snapshot-images) | DATA.GOV.HK terms of use | Hong Kong traffic cameras. |
| [511 Ontario open data](https://511on.ca/developers/doc) | Open Government Licence – Ontario | Ontario highway cameras. |
| [511 Alberta open data](https://511.alberta.ca/developers/doc) | Open Government Licence – Alberta | Alberta highway cameras. |
| [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) | ODbL 1.0 | Mapped licence-plate readers (surveillance:type=ALPR). |
| [DeFlock — crowdsourced ALPR mapping](https://deflock.me) | Data in OpenStreetMap (ODbL) | Project behind most mapped Flock and other ALPR cameras. |
| [Overpass API](https://overpass-api.de) | Service for OSM data (ODbL) | Live query of mapped cameras in view. |
| [EFF — Automated License Plate Readers](https://sls.eff.org/technologies/automated-license-plate-readers-alprs) | Reference | Civil-liberties perspective on ALPR. |
| [ACLU — You Are Being Tracked (ALPR report)](https://www.aclu.org/issues/privacy-technology/location-tracking/you-are-being-tracked) | Reference | Policy report on ALPR data retention. |
| [OurAirports](https://ourairports.com/data/) | Public domain | Airports layer and search. |
| [Panoramax](https://panoramax.fr) | CC BY-SA 4.0 (photos) | Open street-level photos in the point probe. |
| [hls.js](https://github.com/video-dev/hls.js) | Apache-2.0 | Plays live camera video streams. |
| [The GDELT Project — GEO 2.0 API](https://www.gdeltproject.org) | Free and open; cite GDELT | Places in the news in the last 24 hours, with article links. |
| [City of Chicago — Crimes 2001 to present (CPD)](https://data.cityofchicago.org/d/ijzp-q8t2) | City of Chicago Data Portal terms | Chicago incident reports. |
| [DataSF — Police Department Incident Reports 2018 to present](https://data.sfgov.org/d/wg3w-h783) | Open Data Commons PDDL | San Francisco incident reports. |
| [NYC Open Data — NYPD Complaint Data Current (Year to Date)](https://data.cityofnewyork.us/d/5uac-w243) | NYC Open Data terms | New York City complaint reports. |
| [City of Los Angeles — Crime Data from 2020 to Present (LAPD)](https://data.lacity.org/d/2nrs-mtv8) | City of LA open data terms | Los Angeles crime reports. |
| [data.police.uk — street-level crimes API](https://data.police.uk/docs/) | Open Government Licence v3.0 | England, Wales and Northern Ireland street-level crime. |
| [Open-Meteo forecast & elevation APIs](https://open-meteo.com) | CC BY 4.0 | Weather and ground elevation for any clicked point. |
| [REST Countries](https://restcountries.com) | MPL-2.0 | Capital, population, languages, currencies for the country card. |
| [World Bank Open Data API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392) | CC BY 4.0 | GDP, life expectancy, internet use and renewable share indicators. |
| [Wikipedia REST API (page summaries)](https://en.wikipedia.org/api/rest_v1/) | CC BY-SA 4.0 | Short encyclopaedia summaries in the country and place cards. |
| [Nominatim (OpenStreetMap geocoding)](https://nominatim.org) | ODbL 1.0 — © OpenStreetMap contributors | Worldwide place search. |
| [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) | Esri terms of use — Esri, Maxar, Earthstar Geographics, and the GIS User Community | Satellite imagery tiles for street-level zoom. |
| [OpenStreetMap standard tiles](https://operations.osmfoundation.org/policies/tiles/) | ODbL 1.0 — © OpenStreetMap contributors | Street map tiles for deep zoom. |
| [Bird (2003) PB2002 plate boundaries, GeoJSON by Hugo Ahlenius (fraxen/tectonicplates)](https://github.com/fraxen/tectonicplates) | ODC-BY 1.0 | Tectonic plate boundaries. |
| [Bird, P. (2003) An updated digital model of plate boundaries. G³ 4(3), 1027](https://doi.org/10.1029/2001GC000252) | Journal article | Scientific basis for the plate boundary model. |
| [NASA Visible Earth — Blue Marble & Black Marble (city lights)](https://visibleearth.nasa.gov/collection/1484/blue-marble) | Public domain (NASA) | Day and night Earth textures. |
| [three-globe example textures (topology bump map, dark Earth)](https://github.com/vasturiano/three-globe/tree/master/example/img) | MIT (repo); NASA-derived imagery | Relief bump map and dark base. |
| [NOAA / USNO low-precision solar coordinates](https://aa.usno.navy.mil/faq/sun_approx) | Public domain | Subsolar point, terminator and sun elevation maths. |
| [Ed Williams — Aviation Formulary (great-circle navigation)](https://edwilliams.org/avform147.htm) | Reference | Distance, bearing and destination formulas for Measure and Quiz. |
| [TeleGeography Submarine Cable Map](https://www.submarinecablemap.com) | Reference (CC BY-SA 4.0 data) | Further reading on the submarine cable network. |
| [U.S. EIA — World Oil Transit Chokepoints](https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints) | Public domain | Further reading on maritime chokepoints. |
| [UNCTAD Review of Maritime Transport](https://unctad.org/topic/transport-and-trade-logistics/review-of-maritime-transport) | Reference | Further reading on global shipping. |
| [IAEA Power Reactor Information System (PRIS)](https://pris.iaea.org) | Reference | Further reading on nuclear power plants. |
| [USGS — This Dynamic Earth](https://pubs.usgs.gov/gip/dynamic/dynamic.html) | Public domain | Plate tectonics primer. |
| [NASA Earth Observatory — Catalog of Earth Satellite Orbits](https://earthobservatory.nasa.gov/features/OrbitsCatalog) | Public domain | Orbits primer (LEO, MEO, GEO). |
| [NOAA SWPC — Planetary K-index](https://www.swpc.noaa.gov/products/planetary-k-index) | Public domain | Kp scale explanation. |
| [Natural Earth (country outlines via World Monitor; populated places)](https://www.naturalearthdata.com) | Public domain | Country polygons and city names. |

## Projects this site references or borrows from

| Project | Licence | Relationship |
|---|---|---|
| [World Monitor](https://github.com/koala73/worldmonitor) — Elie Habib | AGPL-3.0-only | Parent project (fork). Design, globe concept, layer catalogue, curated datasets, textures. |
| [God’s Eye View](https://github.com/bilawalsidhu/gods-eye-view) — Bilawal Sidhu | MIT | Inspiration: sensor looks (NVG/thermal/CRT); its DATA_SOURCES notes pointed to NASA GIBS and adsb.lol. No code copied. |
| [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) — Pavel Dobryakov | MIT | Bundled (lightly edited) in `site/fluid/`. |
| [GSAP](https://github.com/greensock/GSAP) | GSAP Standard no-charge licence | Bundled in `site/assets/vendor/` for page animation. |
| [Magic UI](https://github.com/magicuidesign/magicui) | MIT | Ideas re-implemented in CSS/JS: border beam, number ticker, marquee. |
| [React Bits](https://github.com/DavidHDev/react-bits) — David Haz | MIT + Commons Clause | Idea re-implemented: split-text reveal. |
| [Motion Primitives](https://github.com/ibelick/motion-primitives) — Julien Thibeaut | MIT | Idea re-implemented: spotlight cards. |
| [Animate UI](https://animate-ui.com/) | MIT | Idea re-implemented: tilt cards. |
| [Remotion](https://github.com/remotion-dev/remotion) | Remotion licence | `video/` promo renders with it (free for individuals and small teams). |
| [LLM Visualization](https://github.com/bbycroft/llm-viz) — Brendan Bycroft | see repo | Inspiration for narrated step-by-step tours. |
| [Transformer Explainer](https://github.com/poloclub/transformer-explainer) — Georgia Tech Polo Club | MIT | Inspiration for “what / how / try this” Learn cards. |
| [folio-2019](https://github.com/brunosimon/folio-2019) — Bruno Simon | MIT | Inspiration for toy-like 3D interaction. |
| [Tauri](https://github.com/tauri-apps/tauri) | MIT / Apache-2.0 | Desktop shell (`desktop/`). |

## Scientific and teaching references

- Bird, P. (2003). An updated digital model of plate boundaries. *Geochemistry, Geophysics, Geosystems*, 4(3), 1027. https://doi.org/10.1029/2001GC000252
- Stam, J. (1999). Stable Fluids. *SIGGRAPH ’99*. https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/ns.pdf
- Fedkiw, R., Stam, J., Jensen, H. W. (2001). Visual Simulation of Smoke. *SIGGRAPH ’01* (vorticity confinement).
- Harris, M. (2004). Fast Fluid Dynamics Simulation on the GPU. *GPU Gems*, ch. 38. NVIDIA.
- Vallado, D., Crawford, P., Hujsak, R., Kelso, T. S. (2006). Revisiting Spacetrack Report #3. AIAA 2006-6753 (SGP4).
- Schäfer, M. et al. (2014). Bringing Up OpenSky: A Large-scale ADS-B Sensor Network for Research. *IPSN 2014*.
- U.S. Naval Observatory — Approximate Solar Coordinates. https://aa.usno.navy.mil/faq/sun_approx
- U.S. EIA — World Oil Transit Chokepoints. https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints
- NASA Earth Observatory — Catalog of Earth Satellite Orbits. https://earthobservatory.nasa.gov/features/OrbitsCatalog
- USGS — This Dynamic Earth. https://pubs.usgs.gov/gip/dynamic/dynamic.html
