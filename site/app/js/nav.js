// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — navigation that behaves like a web map.
// OrbitControls turn and zoom around the Earth's centre, so by default a drag near the ground swings you
// hundreds of kilometres and one wheel notch dives straight into the surface. Here both are re-tuned on every
// camera move: dragging covers about one screen-width of ground whatever the zoom, and each wheel notch
// changes your height by a fixed fraction (≈15 %), from orbit down to street level.
export function installNavigation({ globe, R, $, reduceMotion, onLocate }) {
  const controls = globe.controls();
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.minDistance = R * 1.00012; controls.maxDistance = R * 14;
  const lnGain = Math.log(0.95);

  function tune(alt) {
    controls.rotateSpeed = Math.max(0.00002, Math.min(0.9, alt * 0.16));
    const s = (1 + 0.85 * alt) / (1 + alt); // wanted distance ratio for one wheel notch
    controls.zoomSpeed = Math.max(0.00005, Math.min(3, Math.log(s) / lnGain));
    const cam = globe.camera(); const near = Math.max(0.0015, Math.min(1, alt * R * 0.04));
    if (Math.abs(cam.near - near) / near > 0.25) { cam.near = near; cam.updateProjectionMatrix(); }
    scaleBar(alt);
  }

  // Google-Maps-style scale bar
  function scaleBar(alt) {
    const el = $('#scalebar'); if (!el) return;
    const fov = (globe.camera().fov * Math.PI) / 180; const hKm = alt * 6371;
    const viewKm = Math.min(2 * hKm * Math.tan(fov / 2), Math.PI * 6371);
    const kmPerPx = viewKm / innerHeight;
    const target = kmPerPx * 110; const pow = 10 ** Math.floor(Math.log10(target));
    const nice = [1, 2, 5, 10].map((m) => m * pow).filter((v) => v <= target).pop() ?? pow;
    el.querySelector('i').style.width = `${Math.round(nice / kmPerPx)}px`;
    el.querySelector('span').textContent = nice >= 1 ? `${nice.toLocaleString()} km` : `${Math.round(nice * 1000)} m`;
  }

  const zoomBy = (f) => { const p = globe.pointOfView(); globe.pointOfView({ lat: p.lat, lng: p.lng, altitude: Math.min(13, Math.max(0.00015, p.altitude * f)) }, reduceMotion ? 0 : 350); };
  $('#zin').addEventListener('click', () => zoomBy(0.5));
  $('#zout').addEventListener('click', () => zoomBy(2));
  $('#locate').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    $('#locate').setAttribute('aria-busy', 'true');
    navigator.geolocation.getCurrentPosition((p) => { $('#locate').removeAttribute('aria-busy'); onLocate(p.coords.latitude, p.coords.longitude); },
      () => $('#locate').removeAttribute('aria-busy'), { enableHighAccuracy: false, timeout: 10000 });
  });

  // Double-click zooms in on that spot (Shift + double-click zooms out), like a web map.
  $('#globe').addEventListener('dblclick', (e) => {
    const c = globe.toGlobeCoords(e.offsetX, e.offsetY); const p = globe.pointOfView();
    if (!c) return;
    const f = e.shiftKey ? 2.5 : 0.4;
    globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: Math.min(13, Math.max(0.00015, p.altitude * f)) }, reduceMotion ? 0 : 650);
  });

  // Keyboard: arrows pan by a quarter screen, + and − zoom.
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    const p = globe.pointOfView(); const step = Math.max(0.0005, Math.min(40, p.altitude * 14));
    const mv = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] }[e.key];
    if (mv) { e.preventDefault(); globe.pointOfView({ lat: Math.max(-89, Math.min(89, p.lat + mv[0])), lng: p.lng + mv[1] / Math.max(0.2, Math.cos(p.lat * Math.PI / 180)), altitude: p.altitude }, 250); }
    if (e.key === '+' || e.key === '=') zoomBy(0.6);
    if (e.key === '-' || e.key === '_') zoomBy(1.6);
  });
  return { tune, zoomBy };
}
