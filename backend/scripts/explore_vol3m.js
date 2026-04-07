#!/usr/bin/env node
/**
 * explore_vol3m.js — Volume filter comparison: 1-min vs 3-min candle basis on 15m markets
 *
 * Hypothesis: 3-min Binance candles better align with the 15m spike window (C150–C225 = 150–225s
 * ≈ 2.5–3.75 min) and should give a cleaner low-volume filter than 1-min candles.
 *
 * For each 15m PM-resolved spike signal:
 *   1-min basis:  vol_ratio = spikeVol_1m / avg(prev 14 × 1-min vols)   [same as explore_vol.js]
 *   3-min basis:  vol_ratio = spikeVol_3m / avg(prev 14 × 3-min vols)   [new, proposed for live]
 *
 * Shows side-by-side WR at every threshold and per-crypto breakdown.
 *
 * Usage:
 *   node backend/scripts/explore_vol3m.js              # all 15m periods
 *   node backend/scripts/explore_vol3m.js -v           # verbose: print low-vol losses
 *   node backend/scripts/explore_vol3m.js --period 20  # use avg-20 instead of avg-14
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const args    = process.argv.slice(2);
const hasFlag = k => args.includes(k);
const argVal  = k => { const i = args.indexOf(k); return i !== -1 ? args[i + 1] : null; };
const verbose = hasFlag('-v') || hasFlag('--verbose');
const AVG_N   = parseInt(argVal('--period') || '14');

const TH_15M = { BTC: 0.29, ETH: 0.20, SOL: 0.20, XRP: 0.22 };
const PERIODS_15M = [150, 157, 159, 161, 163, 165, 167, 169, 171, 173, 175, 180, 195, 210, 225];
const VOL_3M_MS   = 3 * 60_000;

const LOG_DIR   = path.join(__dirname, '..', 'logs');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

// ── PM outcomes ───────────────────────────────────────────────────────────────
const pmOutcomesRaw = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'pm_outcomes.json'), 'utf8'));
function pmOutcome(crypto, cycleStartMs, durationSecs) {
  const k = `${crypto}_${Math.round(cycleStartMs / 1000)}_${durationSecs}`;
  return pmOutcomesRaw[k] ?? null;
}

// ── Load 1-min Binance candles ─────────────────────────────────────────────────
const raw1m = {};
for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
  const file = path.join(CACHE_DIR, `candles-1m-${crypto}USDT-5000.json`);
  if (!fs.existsSync(file)) { console.warn(`[warn] Missing ${file}`); continue; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw1m[crypto] = (data.candles || [])
    .map(c => ({ ts: new Date(c.timestamp).getTime(), volume: c.volume ?? 0 }))
    .sort((a, b) => a.ts - b.ts);
}

// ── Build 3-min aggregated candles from 1-min ─────────────────────────────────
// Group consecutive 1-min candles into 3-min buckets, summing volumes.
const raw3m = {};
for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
  if (!raw1m[crypto]) continue;
  const buckets = new Map();
  for (const c of raw1m[crypto]) {
    const bucket = Math.floor(c.ts / VOL_3M_MS) * VOL_3M_MS;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + c.volume);
  }
  raw3m[crypto] = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts, volume]) => ({ ts, volume }));
}

// ── Binary search helpers ──────────────────────────────────────────────────────
function findFloor(arr, tsMs) {
  let lo = 0, hi = arr.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].ts <= tsMs) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}

function computeVolRatio(arr, tsMs) {
  const idx = findFloor(arr, tsMs);
  if (idx < AVG_N + 1) return null;
  const spikeVol = arr[idx].volume;
  if (spikeVol === 0) return null;
  let sum = 0;
  for (let i = idx - AVG_N; i < idx; i++) sum += arr[i].volume;
  const avg = sum / AVG_N;
  if (avg === 0) return null;
  return spikeVol / avg;
}

// ── Parse 15m signal CSVs ──────────────────────────────────────────────────────
function parseCSV(period) {
  const file = path.join(LOG_DIR, `t1000_candles_C${period}.csv`);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 11) continue;
    rows.push({
      ts:           new Date(p[0]).getTime(),
      crypto:       p[1],
      cycleStartMs: new Date(p[2]).getTime(),
      open: parseFloat(p[4]), high: parseFloat(p[5]),
      low:  parseFloat(p[6]), close: parseFloat(p[7]),
      spikePct: parseFloat(p[8]),
      yesAsk:   parseFloat(p[9]),
      noAsk:    parseFloat(p[10]),
    });
  }
  return rows;
}

function hasStrongBody(r) {
  const h = r.high - r.low;
  return !(h > 0) || (Math.abs(r.open - r.close) * 100 / h) >= 76;
}

// ── Collect all 15m signals ────────────────────────────────────────────────────
const all = [];
let skipped1m = 0, skipped3m = 0;

for (const period of PERIODS_15M) {
  for (const row of parseCSV(period)) {
    const th = TH_15M[row.crypto];
    if (!th || Math.abs(row.spikePct) < th) continue;
    if (!hasStrongBody(row)) continue;

    const outcome = pmOutcome(row.crypto, row.cycleStartMs, 900);
    if (!outcome) continue;

    const dir      = row.spikePct > 0 ? 'UP' : 'DOWN';
    const isWin    = outcome === dir;

    const vr1m = computeVolRatio(raw1m[row.crypto], row.ts);
    const vr3m = computeVolRatio(raw3m[row.crypto], row.ts);

    if (vr1m === null) skipped1m++;
    if (vr3m === null) skipped3m++;
    if (vr1m === null && vr3m === null) continue; // skip if both missing

    all.push({ crypto: row.crypto, period, vr1m, vr3m, isWin, dir,
               entryPx: dir === 'UP' ? row.yesAsk / 100 : row.noAsk / 100,
               ts: row.ts, cycleStartMs: row.cycleStartMs });
  }
}

if (!all.length) {
  console.error('No data. Run simulate_combined.js first to generate CSV files.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function wr(arr) {
  if (!arr.length) return '—';
  return (arr.filter(t => t.isWin).length / arr.length * 100).toFixed(1) + '%';
}

function wrN(arr) {
  if (!arr.length) return { pct: '—', n: 0 };
  return { pct: (arr.filter(t => t.isWin).length / arr.length * 100).toFixed(1) + '%', n: arr.length };
}

// ── Side-by-side threshold comparison ─────────────────────────────────────────
function sideBySide(trades, label) {
  const withBoth = trades.filter(t => t.vr1m !== null && t.vr3m !== null);
  console.log(`\n── ${label} (${withBoth.length} signals with both 1m+3m data) ──`);
  console.log(
    'Threshold'.padEnd(8) +
    '1m-skip'.padStart(9) + '1m-keep'.padStart(9) + '1m-WR(skip)'.padStart(13) + '1m-WR(keep)'.padStart(13) +
    '  │  ' +
    '3m-skip'.padStart(9) + '3m-keep'.padStart(9) + '3m-WR(skip)'.padStart(13) + '3m-WR(keep)'.padStart(13)
  );

  for (const thr of [0.5, 0.7, 0.8, 1.0, 1.2, 1.5, 2.0]) {
    const skip1 = withBoth.filter(t => t.vr1m < thr);
    const keep1 = withBoth.filter(t => t.vr1m >= thr);
    const skip3 = withBoth.filter(t => t.vr3m < thr);
    const keep3 = withBoth.filter(t => t.vr3m >= thr);

    console.log(
      `≥${thr}`.padEnd(8) +
      String(skip1.length).padStart(9) + String(keep1.length).padStart(9) +
      wr(skip1).padStart(13) + wr(keep1).padStart(13) +
      '  │  ' +
      String(skip3.length).padStart(9) + String(keep3.length).padStart(9) +
      wr(skip3).padStart(13) + wr(keep3).padStart(13)
    );
  }
}

// ── Per-crypto comparison ──────────────────────────────────────────────────────
function perCrypto(trades) {
  console.log(`\n── Per-crypto: WR at vol < 1.0 vs ≥ 1.0 (1-min vs 3-min basis) ──`);
  const hdr = 'Crypto'.padEnd(8) + 'N'.padStart(6) +
    '  1m<1.0'.padStart(10) + '1m≥1.0'.padStart(10) + '  lift'.padStart(8) +
    '  │  ' +
    '3m<1.0'.padStart(10) + '3m≥1.0'.padStart(10) + '  lift'.padStart(8);
  console.log(hdr);

  for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
    const ct = trades.filter(t => t.crypto === crypto && t.vr1m !== null && t.vr3m !== null);
    if (!ct.length) continue;

    const lo1 = ct.filter(t => t.vr1m < 1.0), hi1 = ct.filter(t => t.vr1m >= 1.0);
    const lo3 = ct.filter(t => t.vr3m < 1.0), hi3 = ct.filter(t => t.vr3m >= 1.0);

    const wr1lo = lo1.length ? lo1.filter(t => t.isWin).length / lo1.length * 100 : null;
    const wr1hi = hi1.length ? hi1.filter(t => t.isWin).length / hi1.length * 100 : null;
    const wr3lo = lo3.length ? lo3.filter(t => t.isWin).length / lo3.length * 100 : null;
    const wr3hi = hi3.length ? hi3.filter(t => t.isWin).length / hi3.length * 100 : null;

    const lift1 = (wr1lo !== null && wr1hi !== null) ? (wr1hi - wr1lo).toFixed(1) + '%' : '—';
    const lift3 = (wr3lo !== null && wr3hi !== null) ? (wr3hi - wr3lo).toFixed(1) + '%' : '—';

    const fmt = (v, n) => v !== null ? `${v.toFixed(1)}%(${n})` : '—';

    console.log(
      crypto.padEnd(8) + String(ct.length).padStart(6) +
      ('  ' + fmt(wr1lo, lo1.length)).padStart(10) + fmt(wr1hi, hi1.length).padStart(10) + lift1.padStart(8) +
      '  │  ' +
      fmt(wr3lo, lo3.length).padStart(10) + fmt(wr3hi, hi3.length).padStart(10) + lift3.padStart(8)
    );
  }
}

// ── Correlation: do 1m and 3m agree? ─────────────────────────────────────────
function correlation(trades) {
  const both = trades.filter(t => t.vr1m !== null && t.vr3m !== null);
  const agree_lo = both.filter(t => t.vr1m < 1.0 && t.vr3m < 1.0);
  const agree_hi = both.filter(t => t.vr1m >= 1.0 && t.vr3m >= 1.0);
  const disagree_1lo_3hi = both.filter(t => t.vr1m < 1.0 && t.vr3m >= 1.0);
  const disagree_1hi_3lo = both.filter(t => t.vr1m >= 1.0 && t.vr3m < 1.0);

  console.log(`\n── 1m vs 3m agreement at threshold 1.0 (${both.length} signals) ──`);
  console.log('Category'.padEnd(36) + 'Trades'.padStart(8) + 'WR'.padStart(8));
  for (const [label, arr] of [
    ['Both low (1m<1 & 3m<1) → both skip', agree_lo],
    ['Both high (1m≥1 & 3m≥1) → both keep', agree_hi],
    ['1m low, 3m high → 1m skips, 3m keeps', disagree_1lo_3hi],
    ['1m high, 3m low → 3m skips, 1m keeps', disagree_1hi_3lo],
  ]) {
    console.log(label.padEnd(36) + String(arr.length).padStart(8) + wr(arr).padStart(8));
  }

  if (verbose) {
    const contested = disagree_1hi_3lo.filter(t => !t.isWin);
    if (contested.length) {
      console.log(`\n  Losses that 3m would catch but 1m misses (vr1m≥1.0, vr3m<1.0):`);
      for (const t of contested.slice(0, 10)) {
        console.log(`    ${new Date(t.ts).toISOString().slice(0,16)} ${t.crypto} C${t.period} ${t.dir} 1m=${t.vr1m.toFixed(2)} 3m=${t.vr3m.toFixed(2)} px=${(t.entryPx*100).toFixed(0)}¢`);
      }
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(72)}`);
console.log(` explore_vol3m.js  —  1-min vs 3-min vol basis on 15m signals (avg-${AVG_N})`);
console.log(`${'='.repeat(72)}`);
console.log(`Total 15m signals (PM-resolved): ${all.length}`);
console.log(`Skipped (no 1m history):  ${skipped1m}  |  Skipped (no 3m history): ${skipped3m}`);
console.log(`Overall WR (all): ${wr(all)}`);

sideBySide(all, '15m all cryptos — 1m vs 3m vol filter comparison');
perCrypto(all);
correlation(all);

console.log(`\n${'='.repeat(72)}`);
console.log(' VERDICT: Which basis gives better WR separation at vol < 1.0 vs ≥ 1.0?');
console.log(`${'='.repeat(72)}`);
const thr = 1.0;
const both = all.filter(t => t.vr1m !== null && t.vr3m !== null);
for (const [label, key] of [['1-min basis', 'vr1m'], ['3-min basis', 'vr3m']]) {
  const lo = both.filter(t => t[key] < thr);
  const hi = both.filter(t => t[key] >= thr);
  const wrLo = lo.length ? (lo.filter(t => t.isWin).length / lo.length * 100).toFixed(1) : '—';
  const wrHi = hi.length ? (hi.filter(t => t.isWin).length / hi.length * 100).toFixed(1) : '—';
  const lift  = (lo.length && hi.length)
    ? ((hi.filter(t => t.isWin).length / hi.length - lo.filter(t => t.isWin).length / lo.length) * 100).toFixed(1)
    : '—';
  console.log(`${label}: skip ${lo.length} (WR ${wrLo}%) → keep ${hi.length} (WR ${wrHi}%)  lift=${lift}%`);
}
console.log('');
