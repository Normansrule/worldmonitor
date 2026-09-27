// SPDX-License-Identifier: AGPL-3.0-only
// Terra Atlas — tiny fetch layer. Every live feed goes through here so the UI can
// show which sources are healthy, and so failures degrade to a clear message.

const cache = new Map();
const listeners = new Set();
export const status = {}; // sourceId -> { state: 'loading'|'ok'|'error', at, note }

export function onStatus(fn) { listeners.add(fn); }
function setStatus(id, state, note = '') {
  status[id] = { state, at: new Date(), note };
  for (const fn of listeners) fn(id, status[id]);
}

/**
 * fetch with timeout + short-lived memory cache.
 * @param {string} id      source id (for status chips)
 * @param {string} url
 * @param {{type?: 'json'|'text', ttl?: number, timeout?: number}} opts
 */
export async function getFeed(id, url, { type = 'json', ttl = 5 * 60_000, timeout = 15_000 } = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  setStatus(id, 'loading');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const v = type === 'text' ? await res.text() : await res.json();
    cache.set(url, { t: Date.now(), v });
    setStatus(id, 'ok');
    return v;
  } catch (err) {
    const note = err.name === 'AbortError' ? 'timed out' : err.message;
    setStatus(id, 'error', note);
    throw new Error(`${id}: ${note}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Load a file that ships with the site (relative to atlas/). */
export async function getLocal(path, type = 'json') {
  if (cache.has(path)) return cache.get(path).v;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const v = type === 'text' ? await res.text() : await res.json();
  cache.set(path, { t: Date.now(), v });
  return v;
}
