// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas service worker: the site itself works offline; live feeds and map tiles always go to the network.
const VERSION = 'terra-atlas-v1.6';
const SHELL = [
  './', 'app/', 'app/css/atlas.css', 'app/vendor/vendor.min.mjs',
  'app/js/main.js', 'app/js/layers.js', 'app/js/flights.js', 'app/js/cameras.js', 'app/js/places.js', 'app/js/nav.js', 'app/js/icons.js', 'app/js/news.js', 'app/js/crime.js', 'app/js/live.js', 'app/js/networks.js', 'app/js/hud.js', 'app/js/markers.js', 'app/js/perf.js', 'app/js/clock.js', 'app/js/launches.js', 'app/js/trace.js', 'app/js/wind.js', 'app/js/feeds.js', 'app/js/astro.js', 'app/js/satellites.js', 'app/js/sources.js', 'app/js/tours.js', 'app/js/quiz.js',
  'app/data/worldmonitor-static.json', 'app/data/countries.geojson', 'app/data/plate-boundaries.json', 'app/data/tle-snapshot-leo.txt', 'app/data/cities.json', 'app/data/airports.json',
  'app/textures/earth-blue-marble-2k.jpg', 'app/textures/earth-night-2k.jpg', 'app/textures/earth-topology.png',
  'learn/', 'fluid/', 'download/', 'credits/', 'assets/site.css', 'assets/site.js', 'assets/vendor/gsap.min.js', 'assets/vendor/ScrollTrigger.min.js',
  'icons/icon-192.png', 'manifest.webmanifest',
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // live data: network only
  // same-origin: network first so updates land quickly, cache as the offline fallback
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
