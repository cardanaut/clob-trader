#!/usr/bin/env node
/**
 * explore_body.js — Candle body ratio research
 *
 * For each spike signal, compute body ratio = abs(open-close) / (high-low) * 100.
 * Bucket signals by ratio range and show WIN rate per bucket.
 * Then show cumulative "skip if body < threshold" to find the optimal cutoff.
 *
 * Body ratio = 100% → pure marubozu (no wicks at all)
 * Body ratio = 0%   → pure doji (open == close)
 *
 * Usage:
 *   node backend/scripts/explore_body.js [--only5m] [--only15m] [-v]
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

// Per-crypto spike thresholds (mirrors simulator)
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

// ── Body ratio ────────────────────────────────────────────────────────────────
function bodyRatio(row) {
  const height = row.high - row.low;
  if (!(height > 0)) return 100; // degenerate candle (no range) — treat as full body
  return Math.abs(row.open - row.close) / height * 100;
}

// ── Buckets: body ratio ranges ────────────────────────────────────────────────
const BUCKETS = [
  ['0–10%',   0,  10],
  ['10–20%', 10,  20],
  ['20–30%', 20,  30],
  ['30–40%', 30,  40],
  ['40–50%', 40,  50],
  ['50–60%', 50,  60],
  ['60–70%', 60,  70],
  ['70–75%', 70,  75],
  ['75–80%', 75,  80],
  ['80–90%', 80,  90],
  ['90–100%',90, 101],
];

// ── Thresholds to sweep for cumulative analysis ───────────────────────────────
const THRESHOLDS = [0, 10, 20, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95];

// ── Collect all signals with body ratio and outcome ───────────────────────────
const periods = [
  ...(only15m ? [] : PERIODS_5M),
  ...(only5m  ? [] : PERIODS_15M),
];

const allSignals = []; // { bodyPct, win }
let grandNoPm = 0, grandSkipThreshold = 0;

for (const period of periods) {
  const is15m        = period >= 150;
  const durationSecs = is15m ? 900 : 300;
  const thMap        = is15m ? TH_15M : TH_5M;
  const signals      = parseCSV(period);

  for (const sig of signals) {
    const th = thMap[sig.crypto] ?? 0.20;
    if (Math.abs(sig.spikePct) < th) continue;

    const outcome = pmOutcome(sig.crypto, sig.cycleStartMs, durationSecs);
    if (!outcome) { grandNoPm++; continue; }

    const direction = sig.spikePct >= 0 ? 'UP' : 'DOWN';
    const win = (direction === 'UP' && outcome === 'UP') || (direction === 'DOWN' && outcome === 'DOWN');
    const bp  = bodyRatio(sig);

    allSignals.push({ bodyPct: bp, win, sig, direction });
  }
}

const total    = allSignals.length;
const allWins  = allSignals.filter(s => s.win).length;
const allLoss  = total - allWins;
const baseWR   = total ? allWins / total * 100 : 0;

// ── Per-bucket stats ──────────────────────────────────────────────────────────
console.log('\nBody Ratio Research — body/height ratio of spike candles');
console.log('Body = abs(open-close), Height = high-low');
console.log(`Overall (no body filter): ${total} signals, ${allWins}W ${allLoss}L, WR=${baseWR.toFixed(1)}%`);
console.log('─'.repeat(72));
console.log(
  'Body ratio'.padEnd(12) +
  'Trades'.padEnd(8) +
  'W'.padEnd(6) +
  'L'.padEnd(6) +
  'WinRate'.padEnd(10) +
  'Δ vs base'
);
console.log('─'.repeat(72));

for (const [label, lo, hi] of BUCKETS) {
  const group = allSignals.filter(s => s.bodyPct >= lo && s.bodyPct < hi);
  if (!group.length) continue;
  const w   = group.filter(s => s.win).length;
  const l   = group.length - w;
  const wr  = group.length ? w / group.length * 100 : 0;
  const delta = wr - baseWR;
  const dStr  = (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%';
  console.log(
    label.padEnd(12) +
    String(group.length).padEnd(8) +
    String(w).padEnd(6) +
    String(l).padEnd(6) +
    (wr.toFixed(1) + '%').padEnd(10) +
    dStr
  );
}
console.log('─'.repeat(72));

// ── Cumulative: "skip if body < threshold" ────────────────────────────────────
console.log('\n── "Keep only trades where body >= threshold" ─────────────────────────');
console.log(
  'Min body'.padEnd(11) +
  'Kept'.padEnd(8) +
  'Skipped'.padEnd(10) +
  'Kept WR'.padEnd(10) +
  'Skip WR'.padEnd(10) +
  'WR gain'
);
console.log('─'.repeat(72));

for (const th of THRESHOLDS) {
  const kept    = allSignals.filter(s => s.bodyPct >= th);
  const skipped = allSignals.filter(s => s.bodyPct <  th);
  if (kept.length < 5) continue;
  const kW  = kept.filter(s => s.win).length;
  const sW  = skipped.filter(s => s.win).length;
  const kWR = kept.length    ? kW / kept.length    * 100 : 0;
  const sWR = skipped.length ? sW / skipped.length * 100 : 0;
  const gain = kWR - baseWR;
  const gainStr = (gain >= 0 ? '+' : '') + gain.toFixed(2) + '%';
  console.log(
    (th + '%').padEnd(11) +
    String(kept.length).padEnd(8) +
    String(skipped.length).padEnd(10) +
    (kWR.toFixed(1) + '%').padEnd(10) +
    (skipped.length ? sWR.toFixed(1) + '%' : '—').padEnd(10) +
    gainStr
  );
}

console.log('\nNotes:');
console.log('  No body filter applied in bucketing above (baseline = all signals passing spike threshold).');
console.log(`  Signals excluded for missing PM outcome: ${grandNoPm}.`);
console.log('  "WR gain" = improvement vs no body filter on kept trades.');
console.log('  Best threshold: highest body% where WR gain is maximised without dropping too many trades.');

if (verbose) {
  console.log('\n── Verbose: loss trades by body bucket ───────────────────────────────');
  for (const [label, lo, hi] of BUCKETS) {
    const group = allSignals.filter(s => s.bodyPct >= lo && s.bodyPct < hi && !s.win);
    if (!group.length) continue;
    console.log(`\nBucket ${label} — ${group.length} losses:`);
    for (const { sig, direction, bodyPct } of group) {
      console.log(
        `  ${new Date(sig.cycleStartMs).toISOString().slice(0,16)} ` +
        `${sig.crypto} C${sig.candleSize} ${direction} ` +
        `sp=${Math.abs(sig.spikePct).toFixed(3)}% ` +
        `body=${bodyPct.toFixed(1)}%`
      );
    }
  }
}
