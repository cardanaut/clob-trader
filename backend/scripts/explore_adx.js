#!/usr/bin/env node
/**
 * explore_adx.js — ADX (Average Directional Index) filter analysis for T1000 signals
 *
 * Computes ADX-14 on 1-min Binance candles at signal time and checks whether
 * low-ADX (choppy/ranging) regimes correlate with losing trades.
 *
 * ADX < 18 = ranging market where momentum strategies fail
 * ADX > 25 = strong trend (best for momentum)
 *
 * Usage:
 *   node backend/scripts/explore_adx.js              # all periods
 *   node backend/scripts/explore_adx.js --only15m    # 15m only
 *   node backend/scripts/explore_adx.js --only5m     # 5m only
 *   node backend/scripts/explore_adx.js --period 10  # ADX-10 instead of ADX-14
 *   node backend/scripts/explore_adx.js -v           # verbose: print each loss
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
const ADX_N   = parseInt(argVal('--period') || '14');

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

// ── Load 1-min Binance candle caches ─────────────────────────────────────────
const candleMap = {};
for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
  const file = path.join(CACHE_DIR, `candles-1m-${crypto}USDT-5000.json`);
  if (!fs.existsSync(file)) { console.warn(`[warn] Missing ${file}`); continue; }
  const data  = JSON.parse(fs.readFileSync(file, 'utf8'));
  candleMap[crypto] = (data.candles || [])
    .map(c => ({ ts: new Date(c.timestamp).getTime(), open: c.open, high: c.high, low: c.low, close: c.close }))
    .sort((a, b) => a.ts - b.ts);
}

/**
 * Compute ADX-N using Wilder smoothing on N*2+1 1-min candles ending at tsMs.
 * Returns null if not enough data.
 */
function computeADX(crypto, tsMs) {
  const candles = candleMap[crypto];
  if (!candles) return null;

  // Binary search: rightmost candle whose open time ≤ signal time
  let hi = candles.length - 1, lo = 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].ts <= tsMs) lo = mid; else hi = mid - 1;
  }

  // Need ADX_N*2 + 1 candles (N for prime smoothing, N for ADX average, 1 for TR prev)
  const needed = ADX_N * 2 + 1;
  if (lo < needed) return null;

  // Compute raw +DM, -DM, TR for each candle
  const raw = [];
  for (let i = lo - needed + 1; i <= lo; i++) {
    const c = candles[i], p = candles[i - 1];
    const upMove   = c.high - p.high;
    const downMove = p.low  - c.low;
    const plusDM   = (upMove > downMove && upMove > 0) ? upMove : 0;
    const minusDM  = (downMove > upMove && downMove > 0) ? downMove : 0;
    const tr       = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    raw.push({ plusDM, minusDM, tr });
  }

  // Initial Wilder smooth (sum of first ADX_N values)
  let smTR = 0, smPlus = 0, smMinus = 0;
  for (let i = 0; i < ADX_N; i++) {
    smTR    += raw[i].tr;
    smPlus  += raw[i].plusDM;
    smMinus += raw[i].minusDM;
  }

  // Generate DX series using Wilder smoothing
  const dxArr = [];
  for (let i = ADX_N; i < raw.length; i++) {
    smTR    = smTR    - smTR    / ADX_N + raw[i].tr;
    smPlus  = smPlus  - smPlus  / ADX_N + raw[i].plusDM;
    smMinus = smMinus - smMinus / ADX_N + raw[i].minusDM;

    const plusDI  = smTR > 0 ? smPlus  / smTR * 100 : 0;
    const minusDI = smTR > 0 ? smMinus / smTR * 100 : 0;
    const diSum   = plusDI + minusDI;
    const dx      = diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0;
    dxArr.push(dx);
  }

  if (dxArr.length < ADX_N) return null;

  // ADX = Wilder average of DX series
  let adx = dxArr.slice(0, ADX_N).reduce((s, v) => s + v, 0) / ADX_N;
  for (let i = ADX_N; i < dxArr.length; i++) {
    adx = (adx * (ADX_N - 1) + dxArr[i]) / ADX_N;
  }
  return adx;
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

    const dir     = row.spikePct > 0 ? 'UP' : 'DOWN';
    const entryPx = dir === 'UP' ? row.yesAsk / 100 : row.noAsk / 100;
    const isWin   = outcome === dir;
    const adx     = computeADX(row.crypto, row.ts);
    if (adx === null) { skippedNoData++; continue; }

    all.push({ crypto: row.crypto, period, is15m, adx, spikePct: Math.abs(row.spikePct),
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
  console.log('Bucket'.padEnd(28) + 'Trades'.padStart(8) + 'Wins'.padStart(8) + 'WR'.padStart(8) + 'AvgADX'.padStart(10));
  for (const { name, fn } of buckets) {
    const bt   = trades.filter(fn);
    const wins = bt.filter(t => t.isWin).length;
    const avg  = bt.length ? (bt.reduce((s, t) => s + t.adx, 0) / bt.length).toFixed(1) : '—';
    console.log(name.padEnd(28) + String(bt.length).padStart(8) + String(wins).padStart(8) + wr(bt).padStart(8) + String(avg).padStart(10));
  }
}

// ── ADX threshold buckets ─────────────────────────────────────────────────────
function adxBuckets(trades, label) {
  if (!trades.length) return;
  printTable(trades, label, [
    { name: '< 10  (no trend)',        fn: t => t.adx < 10  },
    { name: '10–15 (weak ranging)',    fn: t => t.adx >= 10  && t.adx < 15  },
    { name: '15–18 (below threshold)', fn: t => t.adx >= 15  && t.adx < 18  },
    { name: '18–22 (threshold zone)',  fn: t => t.adx >= 18  && t.adx < 22  },
    { name: '22–25 (emerging trend)',  fn: t => t.adx >= 22  && t.adx < 25  },
    { name: '25–35 (strong trend)',    fn: t => t.adx >= 25  && t.adx < 35  },
    { name: '≥ 35  (very strong)',     fn: t => t.adx >= 35  },
  ]);

  // Key thresholds summary
  for (const thr of [15, 18, 20, 22, 25]) {
    const below = trades.filter(t => t.adx < thr);
    const above = trades.filter(t => t.adx >= thr);
    console.log(`  ADX < ${thr}: WR ${wr(below)} (${below.length} trades) | ADX ≥ ${thr}: WR ${wr(above)} (${above.length} trades)`);
  }

  if (verbose) {
    const losses = trades.filter(t => !t.isWin && t.adx < 18);
    if (losses.length) {
      console.log(`  Losses at ADX < 18:`);
      for (const t of losses.slice(0, 15)) {
        console.log(`    ${new Date(t.ts).toISOString().slice(0,16)} ${t.crypto} C${t.period} ${t.dir} ADX=${t.adx.toFixed(1)} px=${(t.entryPx*100).toFixed(0)}¢`);
      }
    }
  }
}

// ── Main output ───────────────────────────────────────────────────────────────
const m5  = all.filter(t => !t.is15m);
const m15 = all.filter(t =>  t.is15m);

console.log(`\n${'='.repeat(65)}`);
console.log(` explore_adx.js  —  ADX-${ADX_N} on 1-min candles`);
console.log(`${'='.repeat(65)}`);
console.log(`Total signals (PM-resolved): ${all.length}  (5m: ${m5.length}, 15m: ${m15.length})`);
console.log(`Skipped (not enough candle history): ${skippedNoData}`);
console.log(`Overall WR: ${wr(all)}  (5m: ${wr(m5)}, 15m: ${wr(m15)})`);

if (!only15m && m5.length)  adxBuckets(m5,  '5m — ADX buckets');
if (!only5m  && m15.length) adxBuckets(m15, '15m — ADX buckets');

// Per-crypto
console.log(`\n── Per-crypto ADX impact (ADX < 18 vs ≥ 18) ──`);
console.log('Crypto'.padEnd(10) + 'Period'.padStart(8) + 'Trades'.padStart(8) + 'WR(all)'.padStart(10) + 'WR(<18)'.padStart(10) + 'WR(≥18)'.padStart(10) + 'Skipped(<18)'.padStart(14));
for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
  for (const is15m of [false, true]) {
    const trades = all.filter(t => t.crypto === crypto && t.is15m === is15m);
    if (!trades.length) continue;
    const lo  = trades.filter(t => t.adx < 18);
    const hi  = trades.filter(t => t.adx >= 18);
    console.log(
      crypto.padEnd(10) +
      (is15m ? '15m' : '5m').padStart(8) +
      String(trades.length).padStart(8) +
      wr(trades).padStart(10) +
      wr(lo).padStart(10) +
      wr(hi).padStart(10) +
      String(lo.length).padStart(14)
    );
  }
}

console.log(`\n${'='.repeat(65)}`);
console.log(' RECOMMENDATION: Is ADX < 18 a useful filter?');
console.log(`${'='.repeat(65)}`);
const loAdx = all.filter(t => t.adx < 18);
const hiAdx = all.filter(t => t.adx >= 18);
console.log(`ADX < 18 (skip): ${loAdx.length} trades, WR ${wr(loAdx)}`);
console.log(`ADX ≥ 18 (keep): ${hiAdx.length} trades, WR ${wr(hiAdx)}`);
console.log(`Filter would discard: ${(loAdx.length / all.length * 100).toFixed(1)}% of signals`);
console.log('');
