'use strict';

/**
 * pm-outcomes.js
 *
 * Fetches and caches resolved Polymarket market outcomes for T1000 backtesting.
 *
 * Cache file : backend/cache/pm_outcomes.json
 * Cache key  : {CRYPTO}_{cycleStartUnixSecs}_{durationSecs}
 * Cache value: 'UP' | 'DOWN' | null
 *              null  = confirmed not found (no retry)
 *              undefined = not yet fetched
 *
 * Fetch strategy:
 *   1. Group all uncached requests by UTC calendar day of market endDate
 *   2. For each day: GET /markets?closed=true&end_date_min=...&end_date_max=... (batch)
 *      Filter results client-side by slug prefix (btc-updown-5m-*, etc.)
 *   3. Individual fallback for any still-missing: GET /events?slug=... (1 retry)
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CACHE_FILE = path.join(__dirname, '../cache/pm_outcomes.json');
const DELAY_MS   = 350;   // ms between API calls

// Slug prefixes must match config.js CRYPTOS[].polymarketSlugs
const SLUG_PREFIX = {
  BTC: { 5: 'btc-updown-5m', 15: 'btc-updown-15m' },
  ETH: { 5: 'eth-updown-5m', 15: 'eth-updown-15m' },
  SOL: { 5: 'sol-updown-5m', 15: 'sol-updown-15m' },
  XRP: { 5: 'xrp-updown-5m', 15: 'xrp-updown-15m' },
};

// All known slug prefixes (flat list) for client-side filtering
const ALL_PREFIXES = Object.values(SLUG_PREFIX).flatMap(d => Object.values(d));

let _cache = null;

function loadCache() {
  if (_cache !== null) return _cache;
  try {
    _cache = fs.existsSync(CACHE_FILE)
      ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
      : {};
  } catch { _cache = {}; }
  return _cache;
}

function saveCache() {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(_cache, null, 2));
}

function cacheKey(crypto, cycleStartSecs, durationSecs) {
  return `${crypto}_${cycleStartSecs}_${durationSecs}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Outcome parsing ────────────────────────────────────────────────────────────

/**
 * Parse the winning outcome ('UP' | 'DOWN' | null) from a gamma API market object.
 * Works for both /markets and /events[].markets[] responses.
 */
function parseMarketOutcome(m) {
  if (!m) return null;
  // Accept markets that are closed OR have UMA status 'resolved'
  const isResolved = m.closed === true || m.umaResolutionStatus === 'resolved';
  if (!isResolved) return null;

  let outcomes, prices;
  try {
    outcomes = JSON.parse(m.outcomes      || '[]');
    prices   = JSON.parse(m.outcomePrices || '[]');
  } catch { return null; }

  const winIdx = prices.findIndex(p => parseFloat(p) === 1.0);
  if (winIdx === -1 || !outcomes[winIdx]) return null;

  const w = outcomes[winIdx].toUpperCase();
  if (w === 'UP'   || w === 'YES') return 'UP';
  if (w === 'DOWN' || w === 'NO')  return 'DOWN';
  return null;
}

/**
 * Extract cycleStart Unix seconds from a slug like "btc-updown-5m-1771811100".
 * Returns null if not a valid timestamp.
 */
function slugTimestamp(slug) {
  if (!slug) return null;
  const parts = slug.split('-');
  const ts = parseInt(parts[parts.length - 1], 10);
  return (!isNaN(ts) && ts > 1_000_000_000) ? ts : null;
}

/**
 * Identify crypto + durationMins from a slug prefix match.
 * Returns { crypto, durationMins } or null.
 */
function slugIdentity(slug) {
  if (!slug) return null;
  for (const [cr, durations] of Object.entries(SLUG_PREFIX)) {
    for (const [dur, prefix] of Object.entries(durations)) {
      if (slug.startsWith(prefix + '-')) return { crypto: cr, durationMins: parseInt(dur, 10) };
    }
  }
  return null;
}

// ── Batch fetch by day ─────────────────────────────────────────────────────────

/**
 * Query GET /markets?closed=true&end_date_min=...&end_date_max=... for a single UTC day.
 * Paginates until all results are consumed. Populates _cache for matched markets.
 * Returns { fetched: n, pages: n }.
 */
async function fetchDayBatch(dayDate) {
  const start = new Date(dayDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(dayDate);
  end.setUTCHours(23, 59, 59, 999);

  let offset = 0;
  const limit  = 500;
  let fetched  = 0;
  let pages    = 0;

  while (true) {
    let markets;
    try {
      const res = await axios.get(`${GAMMA_BASE}/markets`, {
        params: {
          closed:       true,
          end_date_min: start.toISOString(),
          end_date_max: end.toISOString(),
          limit,
          offset,
        },
        timeout: 15000,
        headers: { 'User-Agent': 'polychamp-simulator/2.0' },
      });
      markets = Array.isArray(res.data) ? res.data : [];
    } catch {
      break;  // Batch query failed — fall through to individual fallback
    }

    pages++;
    for (const m of markets) {
      if (!m.slug) continue;
      const id = slugIdentity(m.slug);
      if (!id) continue;  // Not one of our tracked markets

      const ts = slugTimestamp(m.slug);
      if (!ts) continue;

      const key = cacheKey(id.crypto, ts, id.durationMins * 60);
      if (_cache[key] !== undefined) continue;  // Already cached (including null)

      const outcome = parseMarketOutcome(m);
      _cache[key] = outcome;
      if (outcome !== null) fetched++;
    }

    if (markets.length < limit) break;
    offset += limit;
    await sleep(DELAY_MS);
  }

  return { fetched, pages };
}

// ── Individual slug fetch ──────────────────────────────────────────────────────

/**
 * Fetch a single market via exact slug: GET /events?slug=btc-updown-5m-1771811100
 * Retries once on any error (with 500ms delay).
 * Returns 'UP' | 'DOWN' | null.
 */
async function fetchBySlug(slug) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(500);
      const res = await axios.get(`${GAMMA_BASE}/events`, {
        params:  { slug },
        timeout: 8000,
        headers: { 'User-Agent': 'polychamp-simulator/2.0' },
      });
      const events = Array.isArray(res.data) ? res.data : [];
      if (!events.length) return null;
      const event = events[0];
      if (!event.markets?.length) return null;
      return parseMarketOutcome(event.markets[0]);
    } catch {
      if (attempt === 0) continue;
      return null;
    }
  }
  return null;
}

// ── Main public API ────────────────────────────────────────────────────────────

/**
 * Fetch all needed outcomes, caching results to disk.
 *
 * @param {Array}    requests   Array of { crypto, cycleStartMs, durationSecs }
 * @param {Function} onProgress Optional (done, total, message) callback
 * @returns {Object} The full cache object
 */
async function fetchOutcomes(requests, onProgress) {
  loadCache();

  // 1. Deduplicate against cache
  const needed = new Map();   // cacheKey → { crypto, cycleStartSecs, durationMins, durationSecs }
  for (const r of requests) {
    const secs = Math.round(r.cycleStartMs / 1000);
    const key  = cacheKey(r.crypto, secs, r.durationSecs);
    if (_cache[key] !== undefined) continue;   // already cached (including null = not found)
    if (needed.has(key)) continue;
    needed.set(key, {
      crypto        : r.crypto,
      cycleStartSecs: secs,
      durationMins  : r.durationSecs / 60,
      durationSecs  : r.durationSecs,
    });
  }

  if (needed.size === 0) {
    if (onProgress) onProgress(0, 0, 'All outcomes already cached');
    return _cache;
  }

  // 2. Group uncached requests by UTC calendar day of market endDate
  const byDay = new Map();   // 'YYYY-MM-DD' → true (we fetch per day, not per key)
  for (const [, r] of needed) {
    const endMs  = (r.cycleStartSecs + r.durationSecs) * 1000;
    const dayStr = new Date(endMs).toISOString().slice(0, 10);
    byDay.set(dayStr, true);
  }

  const totalDays = byDay.size;
  if (onProgress) onProgress(0, totalDays,
    `Batch-fetching ${needed.size} outcomes across ${totalDays} day(s)...`);

  // 3. Batch fetch one day at a time
  let daysDone = 0;
  for (const dayStr of byDay.keys()) {
    const { fetched, pages } = await fetchDayBatch(new Date(dayStr));
    daysDone++;
    if (onProgress) onProgress(daysDone, totalDays,
      `  Day ${daysDone}/${totalDays}: ${dayStr}  (${fetched} found, ${pages} page(s))`);
    if (daysDone < totalDays) await sleep(DELAY_MS);
  }

  // 4. Individual fallback for anything still not in cache after batch phase
  const stillNeeded = [...needed.entries()].filter(([key]) => _cache[key] === undefined);
  if (stillNeeded.length > 0) {
    if (onProgress) onProgress(0, stillNeeded.length,
      `  Individual fallback for ${stillNeeded.length} market(s) not found in batch...`);
    let done = 0;
    for (const [key, r] of stillNeeded) {
      const prefix  = SLUG_PREFIX[r.crypto]?.[r.durationMins];
      const slug    = prefix ? `${prefix}-${r.cycleStartSecs}` : null;
      const outcome = slug ? await fetchBySlug(slug) : null;
      _cache[key]   = outcome;   // null = confirmed not found
      done++;
      if (onProgress) onProgress(done, stillNeeded.length,
        `    ${slug ?? key}  →  ${outcome ?? 'not found'}`);
      if (done < stillNeeded.length) await sleep(DELAY_MS);
    }
  }

  saveCache();
  return _cache;
}

/**
 * Synchronous lookup — must call fetchOutcomes() first.
 * Returns 'UP' | 'DOWN' | null | undefined
 *   null      = confirmed not found on Polymarket
 *   undefined = was not included in fetchOutcomes() requests (bug)
 */
function getOutcome(crypto, cycleStartMs, durationSecs) {
  if (!_cache) loadCache();
  const secs = Math.round(cycleStartMs / 1000);
  return _cache[cacheKey(crypto, secs, durationSecs)];
}

/** Return cache stats without fetching anything. */
function cacheStats() {
  loadCache();
  const all    = Object.values(_cache);
  const found  = all.filter(v => v === 'UP' || v === 'DOWN').length;
  const notFnd = all.filter(v => v === null).length;
  return { total: all.length, found, notFound: notFnd };
}

module.exports = { loadCache, saveCache, fetchOutcomes, getOutcome, cacheKey, cacheStats, SLUG_PREFIX };
