// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — astronomy + geodesy helpers (no dependencies).
// Formulas: NOAA / USNO low-precision solar position (≈0.01° over 1950–2050),
// haversine + spherical destination/bearing (Ed Williams, "Aviation Formulary").

export const R_EARTH_KM = 6371.0088;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

/** Subsolar point (where the Sun is directly overhead) for a Date. */
export function subsolarPoint(date = new Date()) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * D2R; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * D2R; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) * R2D;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)) * R2D;
  const gmstHours = (18.697374558 + 24.06570982441908 * d) % 24;
  const lng = wrapLng(ra - gmstHours * 15);
  return { lat: dec, lng, declination: dec };
}

/** Great-circle distance in km. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * D2R;
  const dLng = (lng2 - lng1) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial great-circle bearing in degrees (0 = north). */
export function bearingDeg(lat1, lng1, lat2, lng2) {
  const p1 = lat1 * D2R; const p2 = lat2 * D2R; const dl = (lng2 - lng1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/** Point reached travelling `distDeg` degrees of arc from (lat,lng) on `bearing`. */
export function destination(lat, lng, bearing, distDeg) {
  const p1 = lat * D2R; const l1 = lng * D2R; const b = bearing * D2R; const d = distDeg * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 * R2D, wrapLng(l2 * R2D)];
}

/** Circle of points (lat,lng) of angular radius `radiusDeg` around a centre. */
export function smallCircle(lat, lng, radiusDeg, steps = 180) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(destination(lat, lng, (i / steps) * 360, radiusDeg));
  return pts;
}

/** Day/night terminator line (90° from the subsolar point). */
export function terminator(date = new Date()) {
  const s = subsolarPoint(date);
  return smallCircle(s.lat, s.lng, 90, 240);
}

/** Solar elevation angle (degrees) seen from a point — ignores refraction. */
export function solarElevation(lat, lng, date = new Date()) {
  const s = subsolarPoint(date);
  const cosZ = Math.sin(lat * D2R) * Math.sin(s.lat * D2R)
    + Math.cos(lat * D2R) * Math.cos(s.lat * D2R) * Math.cos((lng - s.lng) * D2R);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) * R2D;
}

/** Local mean solar time "HH:MM" from longitude (15° = 1 hour). */
export function localSolarTime(lng, date = new Date()) {
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes();
  const m = (((utcMin + lng * 4) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
}

/** Distance (km) from a point to the nearest vertex-densified polyline in a set. */
export function nearestOnLines(lat, lng, lines) {
  let best = { km: Infinity, line: null };
  for (const line of lines) {
    for (const [la, lo] of line.pts) {
      const km = haversineKm(lat, lng, la, lo);
      if (km < best.km) best = { km, line };
    }
  }
  return best;
}

/** Interpolate points along a great circle (for arcs/paths drawn on the surface). */
export function greatCirclePoints(lat1, lng1, lat2, lng2, n = 64) {
  const p1 = lat1 * D2R; const l1 = lng1 * D2R; const p2 = lat2 * D2R; const l2 = lng2 * D2R;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d === 0) return [[lat1, lng1]];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d); const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([Math.atan2(z, Math.hypot(x, y)) * R2D, Math.atan2(y, x) * R2D]);
  }
  return out;
}

export const fmtKm = (km) => (km >= 100 ? `${Math.round(km).toLocaleString()} km` : `${km.toFixed(1)} km`);
export const fmtLat = (v) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? 'N' : 'S'}`;
export const fmtLng = (v) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? 'E' : 'W'}`;
