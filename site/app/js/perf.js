// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — performance governor.
//  • Quality levels (High / Balanced / Fast) cap pixel ratio and how many pins, cards, names and columns are drawn.
//  • Auto watches the real frame rate and steps down when the device struggles.
//  • While you drag or zoom, heavy recomputation is postponed until the camera settles.
export const LEVELS = {
  high: { label: 'High', dpr: 1.75, pins: 160, pinsPerLayer: 45, cards: 12, labels: 140, columns: 40000, atmosphere: true },
  balanced: { label: 'Balanced', dpr: 1.25, pins: 100, pinsPerLayer: 30, cards: 8, labels: 90, columns: 15000, atmosphere: true },
  fast: { label: 'Fast', dpr: 0.85, pins: 50, pinsPerLayer: 15, cards: 5, labels: 50, columns: 6000, atmosphere: false },
};
const ORDER = ['high', 'balanced', 'fast'];

export function installPerformance({ globe, $, toast, onChange }) {
  const renderer = globe.renderer();
  let mode = 'auto'; try { mode = localStorage.getItem('terra-atlas-quality') ?? 'auto'; } catch { /* private mode */ }
  let level = mode === 'auto' ? (matchMedia('(max-width: 860px)').matches ? 'balanced' : 'high') : mode;
  const api = { q: { ...LEVELS[level] }, moving };
  let lowered = false; let restoreT = null; let slow = 0;

  function apply(notify) {
    api.q = { ...LEVELS[level] };
    renderer.setPixelRatio(Math.min(devicePixelRatio, api.q.dpr));
    globe.showAtmosphere(api.q.atmosphere);
    const sel = $('#quality'); if (sel) sel.value = mode;
    if (notify) toast(`Quality: ${LEVELS[level].label}${mode === 'auto' ? ' (automatic)' : ''}`);
    onChange();
  }
  // Note: switching resolution while moving was tried and removed — resizing the WebGL drawing buffer
  // reallocates it and cost far more than it saved. Instead we mark "moving" so heavy work waits.
  function moving() { lowered = true; clearTimeout(restoreT); restoreT = setTimeout(() => { lowered = false; }, 400); }
  // frame-rate meter + auto governor
  let frames = 0; let t0 = performance.now();
  (function loop() {
    frames += 1; const now = performance.now();
    if (now - t0 >= 3000) {
      const fps = (frames * 1000) / (now - t0); frames = 0; t0 = now;
      const el = $('#fps'); if (el) el.textContent = `${Math.round(fps)} fps`;
      if (mode === 'auto' && !document.hidden && !lowered) {
        slow = fps < 22 ? slow + 1 : 0;
        if (slow >= 2 && level !== 'fast') { level = ORDER[ORDER.indexOf(level) + 1]; slow = 0; apply(false); toast(`Running slowly — switched to ${LEVELS[level].label} quality. You can change this at the bottom right.`); }
      }
    }
    requestAnimationFrame(loop);
  })();
  $('#quality')?.addEventListener('change', (e) => {
    mode = e.target.value; try { localStorage.setItem('terra-atlas-quality', mode); } catch { /* ignore */ }
    level = mode === 'auto' ? 'high' : mode; apply(true);
  });
  apply(false);
  return api;
}

/**
 * Program keeper. globe.gl rebuilds paths, arcs and rings (with brand-new materials) whenever their
 * data or widths change — and when the last material of a kind is disposed, WebGL frees its compiled
 * shader, so the next zoom recompiles it (seconds on slow GPUs). We keep one tiny invisible copy of
 * each shader variant alive, so every variant is compiled exactly once per visit.
 */
export function installProgramKeeper(globe) {
  const renderer = globe.renderer(); const scene = globe.scene();
  const kept = new Map(); let pending = false;
  function sweep() {
    pending = false;
    scene.traverse((o) => {
      if (o.userData?.keeper || !o.material || Array.isArray(o.material) || !o.geometry || o.isSprite) return;
      const prog = renderer.properties.get(o.material)?.currentProgram; if (!prog || kept.has(prog.cacheKey)) return;
      try {
        const k = new o.constructor(o.geometry.clone(), o.material.clone());
        k.userData.keeper = true; k.frustumCulled = false; k.renderOrder = -1000; k.raycast = () => {};
        k.scale.setScalar(1e-4); // a speck at the Earth's centre: always hidden behind the globe, never seen
        if (k.count !== undefined && o.count !== undefined) k.count = Math.min(1, o.count);
        scene.add(k); kept.set(prog.cacheKey, k);
      } catch { kept.set(prog.cacheKey, null); }
    });
  }
  return { schedule() { if (!pending) { pending = true; setTimeout(sweep, 1500); } }, size: () => kept.size };
}

/**
 * Idle render governor. globe.gl redraws the whole scene 60 times a second even when nothing on
 * screen changes, which keeps the GPU busy, drains laptop batteries and steals main-thread time
 * from data loading. While you interact (and for 2.5 s after), frames are drawn at full rate.
 * After that it drops to 30 fps if something is animating (pulsing rings, dashes, wind, a running
 * time machine) and to 5 fps if the picture is still. Skipped frames cost nothing: the browser
 * keeps showing the last one. Any input, camera flight or data update wakes it instantly.
 * @param {{ animating: () => boolean, busy: () => boolean }} hooks
 */
export function installIdleGovernor(globe, { animating, busy }) {
  const renderer = globe.renderer();
  // globe.gl draws through an EffectComposer whose render pass CLEARS the screen before drawing. Skipping only
  // renderer.render() therefore left cleared (black) frames on fast screens: the whole composer pass must be
  // skipped, so nothing touches the canvas and the browser keeps showing the last frame.
  const composer = globe.postProcessingComposer?.();
  const target = composer ?? renderer; const orig = target.render.bind(target);
  let awakeUntil = performance.now() + 5000; let last = 0; let skipped = 0; let drawn = 0;
  const off = new URLSearchParams(location.search).has('nogovernor');
  const wake = (ms = 2500) => { awakeUntil = Math.max(awakeUntil, performance.now() + ms); };
  target.render = (...args) => {
    const now = performance.now();
    if (!off && now > awakeUntil && !busy() && (composer || renderer.getRenderTarget() === null)) {
      const gap = animating() ? 1000 / 30 - 2 : 1000 / 5 - 2;
      if (now - last < gap) { skipped += 1; return; }
    }
    last = now; drawn += 1; orig(...args);
  };
  const el = renderer.domElement;
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'touchmove']) el.addEventListener(ev, () => wake(), { passive: true });
  for (const ev of ['keydown', 'resize']) addEventListener(ev, () => wake());
  document.addEventListener('visibilitychange', () => wake());
  // Camera flights run inside the render loop, so a programmatic fly-to wakes it for its whole length.
  const pov = globe.pointOfView.bind(globe);
  globe.pointOfView = (...a) => { if (a.length && a[0]) wake((a[1] ?? 0) + 800); return pov(...a); };
  return {
    wake,
    /** Draw right now, whatever the governor says (for screenshots). */
    renderNow() { if (composer) orig(); else orig(globe.scene(), globe.camera()); },
    stats: () => ({ drawn, skipped, idle: performance.now() > awakeUntil }),
  };
}
