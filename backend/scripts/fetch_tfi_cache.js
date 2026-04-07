#!/usr/bin/env node
/**
 * fetch_tfi_cache.js
 * Retroactively compute Trade Flow Imbalance (TFI) for every qualifying PM signal
 * by fetching historical fills from the Polymarket Data API.
 *
 * TFI = (Down_buy_size − Up_buy_size) / (Down_buy_size + Up_buy_size)
 *   > 0 → more DOWN buyers → confirms DOWN signal
 *   < 0 → more UP buyers  → contradicts DOWN signal (or confirms UP)
 *
 * Output: cache/tfi_cache.json  { "<CRYPTO>_<cycleStartMs>_<periodSecs>": tfi }
 *
 * Usage:
 *   node scripts/fetch_tfi_cache.js            # all qualifying signals (th >= 0.10%)
 *   node scripts/fetch_tfi_cache.js --down     # DOWN signals only
 *   node scripts/fetch_tfi_cache.js --th 0.12  # custom threshold
 *   node scripts/fetch_tfi_cache.js --resume   # skip already-cached keys
 */

'use strict';
const fs      = require('fs');
const path    = require('path');
const https   = require('https');

const LOG_DIR   = path.join(__dirname, '../logs');
const CACHE_DIR = path.join(__dirname, '../cache');
const OUT_FILE  = path.join(CACHE_DIR, 'tfi_cache.json');

const MIN_TH    = parseFloat(process.argv.find(a => a.startsWith('--th'))?.split('=')[1] ?? '0.10');
const DOWN_ONLY = process.argv.includes('--down');
const RESUME    = process.argv.includes('--resume');
const CONCUR    = 25;   // concurrent HTTP requests

// ── Helpers ──────────────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'polychamp-tfi/1.0', 'Accept': 'application/json' },
      timeout: 12000,
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(buf)); } catch { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function readCsvRaw(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath).toString('utf8').replace(/\x00/g, '');
  const lines   = content.trim().split('\n').filter(Boolean);
  if (!lines.length) return [];
  const hdrs = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(l => {
    const vals = l.split(',');
    return Object.fromEntries(hdrs.map((h, i) => [h, (vals[i] ?? '').trim()]));
  });
}

/** Build slug: "btc-updown-5m-1772036400" */
function makeSlug(crypto, cycleStartMs, is15m) {
  const ts = Math.floor(cycleStartMs / 1000);
  return `${crypto.toLowerCase()}-updown-${is15m ? '15m' : '5m'}-${ts}`;
}

/** Fetch fills for a market (all pages up to 2000) */
async function fetchFills(slug) {
  const fills = [];
  let offset  = 0;
  const limit = 500;
  while (true) {
    const url  = `https://data-api.polymarket.com/trades?slug=${slug}&limit=${limit}&offset=${offset}`;
    let batch;
    try { batch = await httpsGet(url); } catch { break; }
    if (!Array.isArray(batch) || !batch.length) break;
    fills.push(...batch);
    if (batch.length < limit) break;     // no more pages
    offset += limit;
    if (fills.length >= 2000) break;     // safety cap
  }
  return fills;
}

/** Compute TFI for fills within [cycleStart, signalTs] */
function computeTFI(fills, cycleStartTs, signalTs) {
  const pre = fills.filter(f => {
    const t = Number(f.timestamp);
    return t >= cycleStartTs && t <= signalTs && f.side === 'BUY';
  });
  let downVol = 0, upVol = 0;
  for (const f of pre) {
    const sz = parseFloat(f.size) || 0;
    if (f.outcome === 'Down')     downVol += sz;
    else if (f.outcome === 'Up')  upVol   += sz;
  }
  const total = downVol + upVol;
  return { tfi: total > 0 ? (downVol - upVol) / total : 0, downVol, upVol, preFills: pre.length };
}

// ── Load signals from CSVs ────────────────────────────────────────────────────

function loadSignalsMeta(csvFile, is15m) {
  const rows = readCsvRaw(csvFile);
  const out  = [];
  for (const r of rows) {
    const spike = parseFloat(r.spike_pct);
    if (isNaN(spike) || Math.abs(spike) < MIN_TH) continue;
    if (DOWN_ONLY && spike > 0) continue;
    const cycleStartMs = new Date(r.cycle_start).getTime();
    if (isNaN(cycleStartMs)) continue;
    const periodSecs   = parseInt(r.candle_size);
    out.push({ crypto: r.crypto, cycleStartMs, periodSecs, is15m,
               direction: spike >= 0 ? 'UP' : 'DOWN' });
  }
  return out;
}

// Use C85 for 5m representative and C165 for 15m representative.
// All same-cycle signals share fills; one fetch per market is enough.
const signals5m  = loadSignalsMeta(path.join(LOG_DIR, 't1000_candles_C85.csv'),  false);
const signals15m = loadSignalsMeta(path.join(LOG_DIR, 't1000_candles_C165.csv'), true);
const all        = [...signals5m, ...signals15m];

// Deduplicate by slug (same market for different candle sizes within same CSV)
const uniqueMarkets = new Map();  // slug → signal meta
for (const s of all) {
  const slug = makeSlug(s.crypto, s.cycleStartMs, s.is15m);
  if (!uniqueMarkets.has(slug)) uniqueMarkets.set(slug, s);
}

// ── Load existing cache (for --resume) ───────────────────────────────────────

let cache = {};
if (RESUME && fs.existsSync(OUT_FILE)) {
  try { cache = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch {}
  console.log(`Resuming: ${Object.keys(cache).length} entries already cached`);
}

// Filter out already-cached if resuming
const markets = [...uniqueMarkets.entries()].filter(([slug, s]) => {
  if (!RESUME) return true;
  const key = `${s.crypto}_${s.cycleStartMs}_${s.periodSecs}`;
  return cache[key] === undefined;
});

console.log(`Total unique markets to fetch: ${markets.length} (threshold≥${MIN_TH}%${DOWN_ONLY?' DOWN only':''})`);
console.log(`Concurrency: ${CONCUR}`);
console.log('');

// ── Batch fetch ───────────────────────────────────────────────────────────────

let done = 0, errors = 0, empty = 0;
const total = markets.length;

async function processMarket([slug, meta]) {
  const { crypto, cycleStartMs, periodSecs, is15m } = meta;
  const key     = `${crypto}_${cycleStartMs}_${periodSecs}`;
  const cycleTs = Math.floor(cycleStartMs / 1000);
  const signalTs = cycleTs + periodSecs;

  try {
    const fills = await fetchFills(slug);
    if (!fills.length) {
      empty++;
      cache[key] = 0;   // no fills = neutral
      return;
    }
    const { tfi, downVol, upVol, preFills } = computeTFI(fills, cycleTs, signalTs);
    cache[key] = parseFloat(tfi.toFixed(4));
  } catch (err) {
    errors++;
    // Leave out of cache — will be treated as missing (neutral) in simulator
  }

  done++;
  if (done % 100 === 0 || done === total) {
    const pct = ((done / total) * 100).toFixed(1);
    process.stdout.write(`\r  ${done}/${total} (${pct}%)  errors=${errors}  empty=${empty}   `);
  }
}

async function runBatches() {
  for (let i = 0; i < markets.length; i += CONCUR) {
    const batch = markets.slice(i, i + CONCUR);
    await Promise.allSettled(batch.map(processMarket));
    // Small pause between batches to be a good API citizen
    await new Promise(r => setTimeout(r, 100));
  }
}

(async () => {
  console.log('Fetching fills...');
  const t0 = Date.now();
  await runBatches();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n\nDone in ${elapsed}s. Cached ${Object.keys(cache).length} entries.`);

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(cache, null, 0));
  console.log(`Saved to ${OUT_FILE}`);
})();
