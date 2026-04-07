#!/usr/bin/env node
/**
 * explore_wick.js — Wick ratio research
 *
 * For each spike signal, compute the HAIR/FOOT ratio (UP) or FOOT/HAIR ratio (DOWN).
 * Bucket signals by ratio range and show WIN rate per bucket.
 * This tells us empirically at what ratio the WR drops enough to justify skipping.
 *
 * HAIR (UP candle) = high - close  (wick above body top)
 * FOOT (UP candle) = open  - low   (wick below body bottom)
 * Ratio for UP = HAIR / FOOT  → big ratio = large rejection wick = bearish signal
 *
 * HAIR (DOWN candle) = high - open   (wick above body top)
 * FOOT (DOWN candle) = close - low   (wick below body bottom)
 * Ratio for DOWN = FOOT / HAIR → big ratio = large bounce wick = bullish signal
 *
 * A ratio > threshold means the candle is showing reversal pressure against the trade.
 *
 * Usage:
 *   node backend/scripts/explore_wick.js [--only5m] [--only15m] [-v]
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const hasFlag = k => args.includes(k);
const only5m  = hasFlag('--only5m');
const only15m = hasFlag('--only15m');
const verbose = hasFlag('-v') || hasFlag('--verbose');

// Per-crypto thresholds (mirrors simulator)
const TH_5M  = { BTC: 0.24, ETH: 0.44, SOL: 0.22, XRP: 0.24 };
const TH_15M = { BTC: 0.29, ETH: 0.20, SOL: 0.20, XRP: 0.22 };

const PERIODS_5M  = [50, 55, 60, 65, 70, 75, 80, 85];
const PERIODS_15M = [150, 165, 180, 195, 210, 225, 240, 255];

const LOG_DIR   = path.join(__dirname, '..', 'logs');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

// ── PM outcomes ───────────────────────────────────────────────────────────────
const pmOutcomesRaw = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'pm_outcomes.json'), 'utf8'));
function pmOutcome(crypto, cycleStartMs, durationSecs) {
  const k = `${crypto}_${Math.round(cycleStartMs / 1000)}_${durationSecs}`;
  return pmOutcomesRaw[k] ?? null;
}

// ── Parse signal CSVs ─────────────────────────────────────────────────────────
function parseCSV(period) {
  const file = path.join(LOG_DIR, `t1000_candles_C${period}.csv`);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 9) continue;
    const [timestamp, crypto, cycle_start, candle_size, open, high, low, close, spike_pct] = parts;
    rows.push({
      ts:           new Date(timestamp).getTime(),
      crypto,
      cycleStartMs: new Date(cycle_start).getTime(),
      candleSize:   parseInt(candle_size),
      open:         parseFloat(open),
      high:         parseFloat(high),
      low:          parseFloat(low),
      close:        parseFloat(close),
      spikePct:     parseFloat(spike_pct),
    });
  }
  return rows;
}

// ── Candle body filter (same as engine/sim) ───────────────────────────────────
function hasStrongBody(row) {
  const height = row.high - row.low;
  if (!(height > 0)) return true;
  return (Math.abs(row.open - row.close) * 100 / height) >= 75;
}

// ── Compute wick ratio ────────────────────────────────────────────────────────
// Returns { hair, foot, ratio } where ratio is the "bad" wick over "good" wick.
// For UP: ratio = hair/foot (large = big rejection above)
// For DOWN: ratio = foot/hair (large = big bounce below)
// Returns null if foot (or hair for DOWN) is zero (flat wick → no denominator).
function wickRatio(row, direction) {
  const hair = direction === 'UP' ? row.high - row.close : row.high - row.open;
  const foot = direction === 'UP' ? row.open  - row.low  : row.close - row.low;
  if (direction === 'UP') {
    if (foot <= 0) return { hair, foot, ratio: hair > 0 ? Infinity : 0 };
    return { hair, foot, ratio: hair / foot };
  } else {
    if (hair <= 0) return { hair, foot, ratio: foot > 0 ? Infinity : 0 };
    return { hair, foot, ratio: foot / hair };
  }
}

// ── Ratio buckets ─────────────────────────────────────────────────────────────
// Each bucket = [label, minRatio, maxRatio]
const BUCKETS = [
  ['0.0–0.25', 0,    0.25],
  ['0.25–0.5', 0.25, 0.5 ],
  ['0.5–0.75', 0.5,  0.75],
  ['0.75–1.0', 0.75, 1.0 ],
  ['1.0–1.5',  1.0,  1.5 ],
  ['1.5–2.0',  1.5,  2.0 ],
  ['2.0–3.0',  2.0,  3.0 ],
  ['3.0–5.0',  3.0,  5.0 ],
  ['5.0+',     5.0,  Infinity],
];

// ── Main analysis ─────────────────────────────────────────────────────────────
const periods = [
  ...(only15m ? [] : PERIODS_5M),
  ...(only5m  ? [] : PERIODS_15M),
];

// Accumulate per-bucket stats across all periods
const bucketStats = {};
for (const [label] of BUCKETS) {
  bucketStats[label] = { wins: 0, losses: 0, noPm: 0, skippedByBodyFilter: 0, rows: [] };
}
// Also track "infinite ratio" (foot=0 for UP, or hair=0 for DOWN)
bucketStats['∞ (no denom)'] = { wins: 0, losses: 0, noPm: 0, rows: [] };

let grandTotal = 0, grandNoPm = 0, grandBodySkip = 0;

for (const period of periods) {
  const is15m        = period >= 150;
  const durationSecs = is15m ? 900 : 300;
  const thMap        = is15m ? TH_15M : TH_5M;

  const signals = parseCSV(period);
  if (!signals.length) continue;

  for (const sig of signals) {
    const th = thMap[sig.crypto] ?? 0.20;
    const absSpike = Math.abs(sig.spikePct);
    if (absSpike < th) continue;

    const direction = sig.spikePct >= 0 ? 'UP' : 'DOWN';
    const outcome   = pmOutcome(sig.crypto, sig.cycleStartMs, durationSecs);

    // Body filter first (same as engine)
    if (!hasStrongBody(sig)) { grandBodySkip++; continue; }

    grandTotal++;

    if (!outcome) { grandNoPm++; continue; }

    const win = (direction === 'UP' && outcome === 'UP') || (direction === 'DOWN' && outcome === 'DOWN');

    const { ratio } = wickRatio(sig, direction);

    // Find bucket
    let matched = false;
    if (!isFinite(ratio)) {
      bucketStats['∞ (no denom)'][win ? 'wins' : 'losses']++;
      if (verbose) bucketStats['∞ (no denom)'].rows.push({ sig, direction, ratio, win });
      matched = true;
    } else {
      for (const [label, lo, hi] of BUCKETS) {
        if (ratio >= lo && ratio < hi) {
          bucketStats[label][win ? 'wins' : 'losses']++;
          if (verbose) bucketStats[label].rows.push({ sig, direction, ratio, win });
          matched = true;
          break;
        }
      }
    }
    if (!matched) bucketStats['5.0+'][win ? 'wins' : 'losses']++;
  }
}

// ── Output ────────────────────────────────────────────────────────────────────
console.log('\nWick Ratio Research — bad_wick / good_wick per direction');
console.log('UP  spike: ratio = HAIR / FOOT  (HAIR = high-close, FOOT = open-low)');
console.log('DOWN spike: ratio = FOOT / HAIR  (FOOT = close-low, HAIR = high-open)');
console.log('Large ratio = candle showing reversal pressure against the trade direction.');
console.log('─'.repeat(70));
console.log(
  'Ratio'.padEnd(14) +
  'Trades'.padEnd(8) +
  'W'.padEnd(6) +
  'L'.padEnd(6) +
  'WinRate'.padEnd(10) +
  'Δ from all'
);
console.log('─'.repeat(70));

// Compute overall WR for reference
const allWins   = Object.values(bucketStats).reduce((s, b) => s + b.wins,   0);
const allLosses = Object.values(bucketStats).reduce((s, b) => s + b.losses, 0);
const allTotal  = allWins + allLosses;
const allWR     = allTotal ? allWins / allTotal * 100 : 0;

const allBuckets = [...BUCKETS.map(b => b[0]), '∞ (no denom)'];
let cumWins = 0, cumLosses = 0;

for (const label of allBuckets) {
  const b = bucketStats[label];
  const total = b.wins + b.losses;
  if (total === 0 && b.noPm === 0) continue;
  const wr    = total ? b.wins / total * 100 : 0;
  const delta = total ? (wr - allWR).toFixed(1) : '—';
  const deltaStr = total ? (wr >= allWR ? '+' + delta : delta) + '%' : '—';

  cumWins   += b.wins;
  cumLosses += b.losses;

  console.log(
    label.padEnd(14) +
    String(total).padEnd(8) +
    String(b.wins).padEnd(6) +
    String(b.losses).padEnd(6) +
    (total ? (wr.toFixed(1) + '%').padEnd(10) : '—'.padEnd(10)) +
    deltaStr
  );
}

console.log('─'.repeat(70));
console.log(
  'ALL'.padEnd(14) +
  String(allTotal).padEnd(8) +
  String(allWins).padEnd(6) +
  String(allLosses).padEnd(6) +
  (allWR.toFixed(1) + '%').padEnd(10)
);

// ── Cumulative "skip if ratio >" analysis ─────────────────────────────────────
console.log('\n── Cumulative: "skip trades where ratio > threshold" ──────────────────');
console.log(
  'Skip if >'.padEnd(12) +
  'Skipped'.padEnd(10) +
  'Remaining'.padEnd(12) +
  'Rem.WR'.padEnd(10) +
  'Skip WR'.padEnd(10) +
  'Net gain'
);
console.log('─'.repeat(70));

// Build cumulative from high ratio downward
let skipWins = 0, skipLosses = 0;
const thresholds = [...BUCKETS].reverse();
for (const [label, lo, hi] of thresholds) {
  const b = bucketStats[label];
  skipWins   += b.wins;
  skipLosses += b.losses;
  const skipTotal = skipWins + skipLosses;
  const remWins   = allWins   - skipWins;
  const remLosses = allLosses - skipLosses;
  const remTotal  = remWins + remLosses;
  if (remTotal < 5) continue;
  const remWR  = remTotal  ? (remWins  / remTotal  * 100).toFixed(1) : '—';
  const skipWR = skipTotal ? (skipWins / skipTotal * 100).toFixed(1) : '—';
  const gain   = remTotal  ? ((remWins / remTotal) - (allWins / allTotal)) * 100 : 0;
  const gainStr = gain >= 0 ? '+' + gain.toFixed(2) + '%' : gain.toFixed(2) + '%';
  console.log(
    (lo.toString()).padEnd(12) +
    String(skipTotal).padEnd(10) +
    String(remTotal).padEnd(12) +
    (remWR + '%').padEnd(10) +
    (skipWR + '%').padEnd(10) +
    gainStr
  );
}

console.log('\nNotes:');
console.log('  Body filter already applied (body/height >= 75%).');
console.log(`  Signals with no PM outcome excluded (${grandNoPm} total).`);
console.log(`  Body-filtered out: ${grandBodySkip} signals.`);
console.log('  "Net gain" = WR improvement vs no wick filter on remaining trades.');
console.log('  Ideal threshold: highest ratio where Rem.WR is maximised with minimal trade loss.');

if (verbose) {
  console.log('\n── Verbose: loss trades by ratio bucket ──────────────────────────────');
  for (const label of allBuckets) {
    const b = bucketStats[label];
    const lossRows = b.rows.filter(r => !r.win);
    if (!lossRows.length) continue;
    console.log(`\nBucket ${label} — ${lossRows.length} losses:`);
    for (const r of lossRows) {
      const { sig, direction, ratio } = r;
      const p = sig.candleSize;
      const is15m = p >= 150;
      console.log(
        `  ${new Date(sig.cycleStartMs).toISOString().slice(0,16)} ` +
        `${sig.crypto} C${p} ${direction} ` +
        `sp=${Math.abs(sig.spikePct).toFixed(3)}% ` +
        `ratio=${isFinite(ratio) ? ratio.toFixed(3) : '∞'}`
      );
    }
  }
}
