// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas optional CORS proxy, a Cloudflare Worker (the free plan allows 100,000 requests a day).
// It lets the website read live feeds that don't send CORS headers, such as flight trackers, in real
// time instead of from the 10-minute snapshot. It forwards only GET requests to the allowlisted
// data hosts below, caches each answer for a few seconds so many visitors share one upstream
// request, and adds CORS headers for your site only.
//
// Deploy:  cd proxy && npx wrangler login && npx wrangler deploy
// Then put the printed https://terra-atlas-proxy.<you>.workers.dev URL in site/app/config.json → "proxy".
const HOSTS = [
  'opensky-network.org', 'api.airplanes.live', 'api.adsb.lol', 'opendata.adsb.fi', 'api.adsbdb.com',
  'll.thespacedevs.com', 'www.gdacs.org', 'celestrak.org', 'api.gdeltproject.org', 'meri.digitraffic.fi',
];
// Seconds to cache each host's answers at the edge.
const TTL = { 'opensky-network.org': 60, 'api.airplanes.live': 8, 'api.adsb.lol': 8, 'opendata.adsb.fi': 8, 'api.adsbdb.com': 86400, 'll.thespacedevs.com': 900, 'www.gdacs.org': 600, 'celestrak.org': 7200 };

export default {
  async fetch(request, env, ctx) {
    const origins = (env.ALLOWED_ORIGINS ?? 'https://normansrule.github.io,http://localhost:8765').split(',').map((s) => s.trim());
    const origin = request.headers.get('Origin') ?? '';
    const cors = {
      'Access-Control-Allow-Origin': origins.includes('*') ? '*' : origins.includes(origin) ? origin : origins[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: cors });
    let target;
    try { target = new URL(new URL(request.url).searchParams.get('url') ?? ''); } catch { return new Response('Pass ?url=https://…', { status: 400, headers: cors }); }
    if (target.protocol !== 'https:' || !HOSTS.some((h) => target.hostname === h || target.hostname.endsWith(`.${h}`))) {
      return new Response('Host not allowed', { status: 403, headers: cors });
    }
    const ttl = TTL[target.hostname] ?? 30;
    const cache = caches.default; const key = new Request(target.toString());
    let res = await cache.match(key);
    if (!res) {
      const headers = { 'User-Agent': 'TerraAtlas-Proxy/1.7 (+https://github.com/Normansrule/worldmonitor)', Accept: 'application/json, text/plain, */*' };
      if (target.hostname === 'opensky-network.org' && env.OPENSKY_CLIENT_ID && env.OPENSKY_CLIENT_SECRET) {
        const tok = await openskyToken(env); if (tok) headers.Authorization = `Bearer ${tok}`;
      }
      const up = await fetch(target.toString(), { headers, cf: { cacheTtl: ttl } });
      res = new Response(up.body, { status: up.status, headers: { 'Content-Type': up.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': `public, max-age=${ttl}` } });
      if (up.ok) ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};

let token = null; let tokenExp = 0;
async function openskyToken(env) {
  if (token && Date.now() < tokenExp) return token;
  const r = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.OPENSKY_CLIENT_ID, client_secret: env.OPENSKY_CLIENT_SECRET }),
  });
  if (!r.ok) return null;
  const j = await r.json(); token = j.access_token; tokenExp = Date.now() + (j.expires_in - 60) * 1000; return token;
}
