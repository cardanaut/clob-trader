#!/usr/bin/env node
/**
 * explore_atr.js — Volatility (ATR) and entry-price analysis for T1000 signals
 *
 * For each PM-resolved spike signal, computes the ATR at entry time and
 * shows whether high ATR correlates with losses. Also analyses entry-price
 * risk (extreme prices like 90¢ NO) which can amplify losses dramatically.
 *
 * Background: on 2026-03-09, 4 losses in 1.5 h totalled ~$240 at 10% risk.
 * All were 15-min markets, 3 of 4 were T+1 entries, 2 entered NO at 90¢+.
 *
 * Questions this script answers:
 *   1. Does high ATR predict losses? (ATR percentile → WR table)
 *   2. Does extreme entry price predict losses? (price bucket → WR table)
 *   3. Which combination (high ATR + extreme price) is most dangerous?
 *
 * Usage:
 *   node backend/scripts/explore_atr.js              # all periods
 *   node backend/scripts/explore_atr.js --only15m    # 15m only
 *   node backend/scripts/explore_atr.js --only5m     # 5m only
 *   node backend/scripts/explore_atr.js --period 7   # ATR-7 instead of ATR-14
 *   node backend/scripts/explore_atr.js -v           # verbose: print each loss
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
const ATR_N   = parseInt(argVal('--period') || '14');

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
const candleMap = {}; // crypto → sorted array of {ts, open, high, low, close}
for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
  const file = path.join(CACHE_DIR, `candles-1m-${crypto}USDT-5000.json`);
  if (!fs.existsSync(file)) { console.warn(`[warn] Missing ${file}`); continue; }
  const data  = JSON.parse(fs.readFileSync(file, 'utf8'));
  candleMap[crypto] = (data.candles || [])
    .map(c => ({ ts: new Date(c.timestamp).getTime(), open: c.open, high: c.high, low: c.low, close: c.close }))
    .sort((a, b) => a.ts - b.ts);
}

/**
 * ATR-N using the N 1-min candles ending at or before tsMs.
 * Returns null if not enough data.
 */
function computeATR(crypto, tsMs) {
  const candles = candleMap[crypto];
  if (!candles) return null;
  // Find rightmost candle whose open time ≤ signal time
  let hi = candles.length - 1, lo = 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].ts <= tsMs) lo = mid; else hi = mid - 1;
  }
  if (lo < ATR_N) return null;
  let sum = 0;
  for (let i = lo - ATR_N + 1; i <= lo; i++) {
    const c = candles[i], p = candles[i - 1];
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  return sum / ATR_N;
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

    const dir       = row.spikePct > 0 ? 'UP' : 'DOWN';
    const entryPx   = dir === 'UP' ? row.yesAsk / 100 : row.noAsk / 100;  // 0–1
    const isWin     = outcome === dir; // 'UP'/'DOWN' matches direction
    const atr       = computeATR(row.crypto, row.ts);
    if (atr === null) continue;

    all.push({ crypto: row.crypto, period, is15m, atr, spikePct: Math.abs(row.spikePct),
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

function pct(n, d) { return d ? (n / d * 100).toFixed(1) + '%' : '—'; }

function printBucketTable(trades, label, bucketFn, bucketLabels) {
  console.log(`\n── ${label} ──`);
  const headerCols = ['Bucket', 'Trades', 'Wins', 'WR', 'AvgATR', 'AvgSpike'];
  console.log(
    headerCols[0].padEnd(30) +
    headerCols.slice(1).map(c => c.padStart(8)).join('')
  );
  for (let b = 0; b < bucketLabels.length; b++) {
    const bt    = trades.filter(t => bucketFn(t, b));
    const wins  = bt.filter(t => t.isWin).length;
    const avgA  = bt.length ? (bt.reduce((s, t) => s + t.atr, 0) / bt.length).toFixed(3) : '—';
    const avgSp = bt.length ? (bt.reduce((s, t) => s + t.spikePct, 0) / bt.length).toFixed(3) + '%' : '—';
    console.log(
      bucketLabels[b].padEnd(30) +
      String(bt.length).padStart(8) +
      String(wins).padStart(8) +
      wr(bt).padStart(8) +
      String(avgA).padStart(8) +
      String(avgSp).padStart(8)
    );
  }
}

// ── ATR percentile buckets ────────────────────────────────────────────────────
function atrBuckets(trades, label) {
  if (!trades.length) return;
  const sorted = [...trades].sort((a, b) => a.atr - b.atr);
  const N      = sorted.length;
  const pcts   = [0.20, 0.40, 0.60, 0.80].map(p => sorted[Math.floor(N * p)].atr);
  const [p20, p40, p60, p80] = pcts;

  const labels = [
    `p00–20 (≤${p20.toFixed(3)})`,
    `p20–40 (${p20.toFixed(3)}–${p40.toFixed(3)})`,
    `p40–60 (${p40.toFixed(3)}–${p60.toFixed(3)})`,
    `p60–80 (${p60.toFixed(3)}–${p80.toFixed(3)})`,
    `p80–100 (>${p80.toFixed(3)})`,
  ];
  const fn = (t, b) => {
    const breaks = [p20, p40, p60, p80];
    if (b === 0) return t.atr <= p20;
    if (b === 4) return t.atr > p80;
    return t.atr > breaks[b - 1] && t.atr <= breaks[b];
  };
  printBucketTable(trades, label, fn, labels);

  // Also show: ATR of top-20% vs rest
  const top20 = trades.filter(t => t.atr > p80);
  const rest  = trades.filter(t => t.atr <= p80);
  console.log(`  → Top-20% ATR: WR ${wr(top20)} vs rest ${wr(rest)}`);
  if (top20.length && verbose) {
    const losses = top20.filter(t => !t.isWin);
    for (const t of losses.slice(0, 10)) {
      console.log(`     LOSS ${new Date(t.ts).toISOString().slice(0,16)} ${t.crypto} C${t.period} ${t.dir} ATR=${t.atr.toFixed(3)} px=${(t.entryPx*100).toFixed(1)}¢`);
    }
  }
}

// ── Entry price buckets ───────────────────────────────────────────────────────
function priceBuckets(trades, label) {
  if (!trades.length) return;
  const edges  = [0.50, 0.60, 0.70, 0.80, 0.90, 1.00];
  const bLabels = [
    '< 50¢  (cheap/balanced)',
    '50–60¢',
    '60–70¢',
    '70–80¢',
    '80–90¢',
    '≥ 90¢  (extreme — high risk)',
  ];
  const fn = (t, b) => {
    if (b === 0) return t.entryPx < edges[0];
    if (b === bLabels.length - 1) return t.entryPx >= edges[b - 1];
    return t.entryPx >= edges[b - 1] && t.entryPx < edges[b];
  };
  printBucketTable(trades, label, fn, bLabels);

  const extreme = trades.filter(t => t.entryPx >= 0.90);
  const normal  = trades.filter(t => t.entryPx <  0.90);
  if (extreme.length) {
    console.log(`  → ≥90¢ entries: WR ${wr(extreme)} (${extreme.length} trades) vs <90¢ WR ${wr(normal)}`);
    if (verbose) {
      const losses = extreme.filter(t => !t.isWin);
      for (const t of losses.slice(0, 10)) {
        console.log(`     LOSS ${new Date(t.ts).toISOString().slice(0,16)} ${t.crypto} C${t.period} ${t.dir} px=${(t.entryPx*100).toFixed(1)}¢ ATR=${t.atr.toFixed(3)}`);
      }
    }
  }
}

// ── Cross-asset regime: losses within a rolling window ───────────────────────
function recentLossWindow(trades, label, windowMs = 30 * 60 * 1000) {
  // For each trade, count how many losses occurred in the previous windowMs
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  const buckets = [0, 1, 2, 3]; // N prior losses in window
  console.log(`\n── ${label} — Prior losses in last 30 min ──`);
  console.log('Prior losses'.padEnd(18) + 'Trades'.padStart(8) + 'Wins'.padStart(8) + 'WR'.padStart(8));
  for (const n of buckets) {
    const bt = sorted.filter((t, i) => {
      const priorLosses = sorted.slice(0, i).filter(p => !p.isWin && t.ts - p.ts <= windowMs).length;
      return priorLosses === n;
    });
    const wins = bt.filter(t => t.isWin).length;
    const label2 = n < 3 ? `= ${n}` : `≥ 3`;
    console.log(label2.padEnd(18) + String(bt.length).padStart(8) + String(wins).padStart(8) + wr(bt).padStart(8));
  }
  // ≥3 case
  const bt3 = sorted.filter((t, i) => {
    const priorLosses = sorted.slice(0, i).filter(p => !p.isWin && t.ts - p.ts <= windowMs).length;
    return priorLosses >= 3;
  });
  console.log(`≥ 3 prior losses → WR ${wr(bt3)} (${bt3.length} trades). Circuit-breaker would save EV.`);
}

// ── Combined filter: high ATR + extreme price ─────────────────────────────────
function combinedFilter(trades, label) {
  if (!trades.length) return;
  const atrSorted = [...trades].sort((a, b) => a.atr - b.atr);
  const p80atr    = atrSorted[Math.floor(trades.length * 0.80)].atr;

  const combos = [
    { label: 'Normal ATR + normal price (<80¢)', fn: t => t.atr <= p80atr && t.entryPx < 0.80 },
    { label: 'Normal ATR + extreme price (≥80¢)', fn: t => t.atr <= p80atr && t.entryPx >= 0.80 },
    { label: 'High ATR   + normal price (<80¢)', fn: t => t.atr > p80atr && t.entryPx < 0.80 },
    { label: 'High ATR   + extreme price (≥80¢)', fn: t => t.atr > p80atr && t.entryPx >= 0.80 },
  ];

  console.log(`\n── ${label} — ATR × Entry Price matrix ──`);
  console.log('Combo'.padEnd(40) + 'Trades'.padStart(8) + 'Wins'.padStart(8) + 'WR'.padStart(8));
  for (const combo of combos) {
    const bt = trades.filter(combo.fn);
    const wins = bt.filter(t => t.isWin).length;
    console.log(combo.label.padEnd(40) + String(bt.length).padStart(8) + String(wins).padStart(8) + wr(bt).padStart(8));
  }
  const worst = trades.filter(t => t.atr > p80atr && t.entryPx >= 0.80);
  const best  = trades.filter(t => t.atr <= p80atr && t.entryPx < 0.80);
  console.log(`  → Worst combo EV delta: ${wr(worst)} vs ${wr(best)} for best combo`);
}

// ── Main output ───────────────────────────────────────────────────────────────
const m5  = all.filter(t => !t.is15m);
const m15 = all.filter(t =>  t.is15m);

console.log(`\n${'='.repeat(65)}`);
console.log(` explore_atr.js  —  ATR-${ATR_N} on 1-min candles`);
console.log(`${'='.repeat(65)}`);
console.log(`Total signals (PM-resolved): ${all.length}  (5m: ${m5.length}, 15m: ${m15.length})`);
console.log(`Overall WR: ${wr(all)}  (5m: ${wr(m5)}, 15m: ${wr(m15)})`);

if (!only15m && m5.length) {
  atrBuckets(m5, '5m — ATR percentile');
  priceBuckets(m5, '5m — Entry price');
  combinedFilter(m5, '5m');
}

if (!only5m && m15.length) {
  atrBuckets(m15, '15m — ATR percentile');
  priceBuckets(m15, '15m — Entry price');
  combinedFilter(m15, '15m');
  recentLossWindow(m15, '15m');  // 15m losses cluster = regime risk
}

// Per-crypto summary
console.log(`\n── Per-crypto ATR impact (top-20% ATR vs rest) ──`);
console.log('Crypto'.padEnd(10) + 'Period'.padStart(8) + 'Trades'.padStart(8) + 'WR(all)'.padStart(10) + 'WR(hiATR)'.padStart(12) + 'WR(loATR)'.padStart(12));
for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
  for (const is15m of [false, true]) {
    const trades = all.filter(t => t.crypto === crypto && t.is15m === is15m);
    if (!trades.length) continue;
    const sorted = [...trades].sort((a, b) => a.atr - b.atr);
    const p80    = sorted[Math.floor(trades.length * 0.80)].atr;
    const hi     = trades.filter(t => t.atr > p80);
    const lo     = trades.filter(t => t.atr <= p80);
    console.log(
      crypto.padEnd(10) +
      (is15m ? '15m' : '5m').padStart(8) +
      String(trades.length).padStart(8) +
      wr(trades).padStart(10) +
      wr(hi).padStart(12) +
      wr(lo).padStart(12)
    );
  }
}

console.log(`\n${'='.repeat(65)}`);
console.log(' SUMMARY for the 2026-03-09 losses');
console.log(`${'='.repeat(65)}`);
console.log(`
The 4 losses shared two compounding risk factors:

1. ENTRY PRICE RISK (most dangerous):
   ETH 13:15 TC entered NO at 90.7¢ → only 9.3¢ to win, 90.7¢ to lose
   SOL 13:15 TC entered NO at 90.0¢ → same asymmetry
   Recommended guard: maxPrice for T+1 15m = 82-85¢ (tighter than T+0)

2. VOLATILITY REGIME (ATR):
   Check the tables above — if top-20% ATR consistently shows <90% WR,
   an ATR threshold filter (e.g. skip when ATR > p80) is justified.

3. T+1 specific caution:
   3 of 4 losses were T+1 entries (isT1=true). The extra entry adds trades
   at a later, more expensive price point with less time to recover.
   Memory: T+1 sim lift is real but PnL is ~half due to worse fill price.
`);
