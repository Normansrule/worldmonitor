// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — performance governor.
//  • Quality levels (High / Balanced / Fast) cap pixel ratio and how many pins, cards, names and columns are drawn.
//  • Auto watches the real frame rate and steps down when the device struggles.
//  • While you drag or zoom, heavy recomputation is postponed until the camera settles.
export const LEVELS = {
  high: { label: 'High', dpr: 1.75, pins: 160, pinsPerLayer: 45, cards: 30, labels: 140, columns: 40000, atmosphere: true },
  balanced: { label: 'Balanced', dpr: 1.25, pins: 100, pinsPerLayer: 30, cards: 18, labels: 90, columns: 15000, atmosphere: true },
  fast: { label: 'Fast', dpr: 0.85, pins: 50, pinsPerLayer: 15, cards: 8, labels: 50, columns: 6000, atmosphere: false },
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
