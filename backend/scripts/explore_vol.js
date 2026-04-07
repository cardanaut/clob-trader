#!/usr/bin/env node
/**
 * explore_vol.js — Volume confirmation filter analysis for T1000 signals
 *
 * For each PM-resolved spike signal, computes the volume ratio of the spike
 * candle vs the 14-period average of preceding 1-min Binance candles.
 *
 * Low volume spikes → fake-outs (market makers testing levels without conviction)
 * High volume spikes → real momentum (institutional flow, genuine breakout)
 *
 * Usage:
 *   node backend/scripts/explore_vol.js              # all periods
 *   node backend/scripts/explore_vol.js --only15m    # 15m only
 *   node backend/scripts/explore_vol.js --only5m     # 5m only
 *   node backend/scripts/explore_vol.js --period 20  # avg-20 instead of avg-14
 *   node backend/scripts/explore_vol.js -v           # verbose: print losses at low ratio
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// ── CLI ───────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const hasFlag = k => args.includes(k);
const argVal  = k => { const i = args.indexOf(k); return i !== -1 ? args[i + 1] : null; };
const only5m  = hasFlag('--only5m');
const only15m = hasFlag('--only15m');
const verbose = hasFlag('-v') || hasFlag('--verbose');
const AVG_N   = parseInt(argVal('--period') || '14');

// ── Config ────────────────────────────────────────────────────────────────────
const TH_5M  = { BTC: 0.24, ETH: 0.44, SOL: 0.22, XRP: 0.24 };
const TH_15M = { BTC: 0.29, ETH: 0.20, SOL: 0.20, XRP: 0.22 };

const PERIODS_5M  = [65, 70, 75, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 95];
const PERIODS_15M = [150, 157, 159, 161, 163, 165, 167, 169, 171, 173, 175, 180, 195, 210, 225];

const LOG_DIR   = path.join(__dirname, '..', 'logs');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

// ── PM outcomes ───────────────────────────────────────────────────────────────
const pmOutcomesRaw = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'pm_outcomes.json'), 'utf8'));
function pmOutcome(crypto, cycleStartMs, durationSecs) {
  const k = `${crypto}_${Math.round(cycleStartMs / 1000)}_${durationSecs}`;
  return pmOutcomesRaw[k] ?? null;
}

// ── Load 1-min Binance candle caches (with volume) ────────────────────────────
const candleMap = {};
for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
  const file = path.join(CACHE_DIR, `candles-1m-${crypto}USDT-5000.json`);
  if (!fs.existsSync(file)) { console.warn(`[warn] Missing ${file}`); continue; }
  const data  = JSON.parse(fs.readFileSync(file, 'utf8'));
  candleMap[crypto] = (data.candles || [])
    .map(c => ({
      ts:     new Date(c.timestamp).getTime(),
      open:   c.open, high: c.high, low: c.low, close: c.close,
      volume: c.volume ?? 0,
    }))
    .sort((a, b) => a.ts - b.ts);
}

/**
 * Compute volume ratio = spike-candle-volume / avg(last AVG_N 1-min candle volumes).
 * The "spike candle" is the Binance 1-min candle at tsMs (candle close time).
 * Returns null if not enough data.
 */
function computeVolRatio(crypto, tsMs) {
  const candles = candleMap[crypto];
  if (!candles) return null;

  // Binary search: rightmost candle whose open time ≤ signal time
  let hi = candles.length - 1, lo = 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].ts <= tsMs) lo = mid; else hi = mid - 1;
  }

  if (lo < AVG_N + 1) return null;

  const spikeVol = candles[lo].volume;
  if (spikeVol === 0) return null;

  let sum = 0;
  for (let i = lo - AVG_N; i < lo; i++) sum += candles[i].volume;
  const avgVol = sum / AVG_N;
  if (avgVol === 0) return null;

  return spikeVol / avgVol;
}

// ── Parse signal CSV ──────────────────────────────────────────────────────────
function parseCSV(period) {
  const file = path.join(LOG_DIR, `t1000_candles_C${period}.csv`);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const rows  = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 11) continue;
    rows.push({
      ts:           new Date(p[0]).getTime(),
      crypto:       p[1],
      cycleStartMs: new Date(p[2]).getTime(),
      candleSize:   parseInt(p[3]),
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

// ── Collect all signals ───────────────────────────────────────────────────────
const PERIODS = [
  ...(only15m ? [] : PERIODS_5M),
  ...(only5m  ? [] : PERIODS_15M),
];

const all = [];
let skippedNoData = 0;
for (const period of PERIODS) {
  const is15m    = period >= 150;
  const duration = is15m ? 900 : 300;
  const thMap    = is15m ? TH_15M : TH_5M;

  for (const row of parseCSV(period)) {
    const th = thMap[row.crypto];
    if (!th || Math.abs(row.spikePct) < th) continue;
    if (!hasStrongBody(row)) continue;

    const outcome = pmOutcome(row.crypto, row.cycleStartMs, duration);
    if (!outcome) continue;

    const dir      = row.spikePct > 0 ? 'UP' : 'DOWN';
    const entryPx  = dir === 'UP' ? row.yesAsk / 100 : row.noAsk / 100;
    const isWin    = outcome === dir;
    const volRatio = computeVolRatio(row.crypto, row.ts);
    if (volRatio === null) { skippedNoData++; continue; }

    all.push({ crypto: row.crypto, period, is15m, volRatio, spikePct: Math.abs(row.spikePct),
               dir, entryPx, isWin, outcome,
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

function printTable(trades, label, buckets) {
  console.log(`\n── ${label} ──`);
  console.log('Bucket'.padEnd(28) + 'Trades'.padStart(8) + 'Wins'.padStart(8) + 'WR'.padStart(8) + 'AvgRatio'.padStart(12));
  for (const { name, fn } of buckets) {
    const bt   = trades.filter(fn);
    const wins = bt.filter(t => t.isWin).length;
    const avg  = bt.length ? (bt.reduce((s, t) => s + t.volRatio, 0) / bt.length).toFixed(2) : '—';
    console.log(name.padEnd(28) + String(bt.length).padStart(8) + String(wins).padStart(8) + wr(bt).padStart(8) + String(avg).padStart(12));
  }
}

// ── Volume ratio buckets ──────────────────────────────────────────────────────
function volBuckets(trades, label) {
  if (!trades.length) return;
  printTable(trades, label, [
    { name: '< 0.5  (very thin)',    fn: t => t.volRatio < 0.5  },
    { name: '0.5–0.8 (below avg)',   fn: t => t.volRatio >= 0.5  && t.volRatio < 0.8  },
    { name: '0.8–1.0 (near avg)',    fn: t => t.volRatio >= 0.8  && t.volRatio < 1.0  },
    { name: '1.0–1.2 (above avg)',   fn: t => t.volRatio >= 1.0  && t.volRatio < 1.2  },
    { name: '1.2–1.5 (elevated)',    fn: t => t.volRatio >= 1.2  && t.volRatio < 1.5  },
    { name: '1.5–2.0 (strong)',      fn: t => t.volRatio >= 1.5  && t.volRatio < 2.0  },
    { name: '2.0–3.0 (very strong)', fn: t => t.volRatio >= 2.0  && t.volRatio < 3.0  },
    { name: '≥ 3.0  (surge)',        fn: t => t.volRatio >= 3.0  },
  ]);

  // Key threshold summary
  for (const thr of [0.8, 1.0, 1.2, 1.5, 2.0]) {
    const below = trades.filter(t => t.volRatio < thr);
    const above = trades.filter(t => t.volRatio >= thr);
    console.log(`  Vol < ${thr}: WR ${wr(below)} (${below.length} trades) | Vol ≥ ${thr}: WR ${wr(above)} (${above.length} trades)`);
  }

  if (verbose) {
    const losses = trades.filter(t => !t.isWin && t.volRatio < 1.0);
    if (losses.length) {
      console.log(`  Losses at vol ratio < 1.0:`);
      for (const t of losses.slice(0, 15)) {
        console.log(`    ${new Date(t.ts).toISOString().slice(0,16)} ${t.crypto} C${t.period} ${t.dir} vol=${t.volRatio.toFixed(2)} px=${(t.entryPx*100).toFixed(0)}¢`);
      }
    }
  }
}

// ── Main output ───────────────────────────────────────────────────────────────
const m5  = all.filter(t => !t.is15m);
const m15 = all.filter(t =>  t.is15m);

console.log(`\n${'='.repeat(65)}`);
console.log(` explore_vol.js  —  Volume ratio (avg-${AVG_N}) on 1-min candles`);
console.log(`${'='.repeat(65)}`);
console.log(`Total signals (PM-resolved): ${all.length}  (5m: ${m5.length}, 15m: ${m15.length})`);
console.log(`Skipped (not enough candle history): ${skippedNoData}`);
console.log(`Overall WR: ${wr(all)}  (5m: ${wr(m5)}, 15m: ${wr(m15)})`);

if (!only15m && m5.length)  volBuckets(m5,  '5m — Volume ratio buckets');
if (!only5m  && m15.length) volBuckets(m15, '15m — Volume ratio buckets');

// Per-crypto
console.log(`\n── Per-crypto volume impact (vol < 1.0 vs ≥ 1.0) ──`);
console.log('Crypto'.padEnd(10) + 'Period'.padStart(8) + 'Trades'.padStart(8) + 'WR(all)'.padStart(10) + 'WR(<1.0)'.padStart(10) + 'WR(≥1.0)'.padStart(10) + 'Skip(<1.0)'.padStart(12));
for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
  for (const is15m of [false, true]) {
    const trades = all.filter(t => t.crypto === crypto && t.is15m === is15m);
    if (!trades.length) continue;
    const lo  = trades.filter(t => t.volRatio < 1.0);
    const hi  = trades.filter(t => t.volRatio >= 1.0);
    console.log(
      crypto.padEnd(10) +
      (is15m ? '15m' : '5m').padStart(8) +
      String(trades.length).padStart(8) +
      wr(trades).padStart(10) +
      wr(lo).padStart(10) +
      wr(hi).padStart(10) +
      String(lo.length).padStart(12)
    );
  }
}

console.log(`\n${'='.repeat(65)}`);
console.log(' RECOMMENDATION: Is volume ratio < 1.0 a useful filter?');
console.log(`${'='.repeat(65)}`);
const loVol = all.filter(t => t.volRatio < 1.0);
const hiVol = all.filter(t => t.volRatio >= 1.0);
console.log(`Vol < 1.0 (skip): ${loVol.length} trades, WR ${wr(loVol)}`);
console.log(`Vol ≥ 1.0 (keep): ${hiVol.length} trades, WR ${wr(hiVol)}`);
console.log(`Filter would discard: ${(loVol.length / all.length * 100).toFixed(1)}% of signals`);
console.log('');
