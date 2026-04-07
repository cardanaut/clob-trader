#!/usr/bin/env node
/**
 * explore_exhaustion.js — Empirical analysis of the exhaustion filter
 *
 * For each qualifying spike signal, computes the 5-min pre-move:
 *   preMove = (price at cycle start − price 5 min earlier) / price 5 min earlier × 100
 *
 * Then asks: when |preMove| > threshold AND direction == signal direction
 * (market already ran hard in our direction before cycle start), does WR drop?
 *
 * Outputs:
 *   1. WR by preMove magnitude bucket (same-dir vs opposite-dir)
 *   2. Threshold sweep: WR with filter vs without, trades skipped
 *
 * Usage:
 *   node backend/scripts/explore_exhaustion.js [--only5m] [--only15m]
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const hasFlag = k => args.includes(k);
const only5m  = hasFlag('--only5m');
const only15m = hasFlag('--only15m');

// Per-crypto thresholds (current best from autoscan)
const TH_5M  = { BTC: 0.24, ETH: 0.24, SOL: 0.24, XRP: 0.24 };
const TH_15M = { BTC: 0.35, ETH: 0.29, SOL: 0.26, XRP: 0.24 };

const PERIODS_5M  = [65,70,75,80,81,82,83,84,85,86,87,88,89,90,91,92,95];
const PERIODS_15M = [150,157,159,161,163,165,167,169,171,173,175,180,195,210,225];

const LOG_DIR   = path.join(__dirname, '..', 'logs');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

// ── Colors ────────────────────────────────────────────────────────────────────
const g = s => `\x1b[32m${s}\x1b[0m`;
const r = s => `\x1b[31m${s}\x1b[0m`;
const y = s => `\x1b[33m${s}\x1b[0m`;
const b = s => `\x1b[1m${s}\x1b[0m`;
const d = s => `\x1b[2m${s}\x1b[0m`;

// ── PM outcomes ───────────────────────────────────────────────────────────────
const pmOutcomesRaw = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'pm_outcomes.json'), 'utf8'));
function pmOutcome(crypto, cycleStartMs, durationSecs) {
  const k = `${crypto}_${Math.round(cycleStartMs / 1000)}_${durationSecs}`;
  return pmOutcomesRaw[k] ?? null;
}
function resolveWin(direction, outcome) {
  if (!outcome) return null;
  // pm_outcomes.json stores resolved direction string: 'UP' or 'DOWN'
  return outcome === direction;
}

// ── Candle body filter ────────────────────────────────────────────────────────
function hasStrongBody(row) {
  const h = row.high - row.low;
  if (!(h > 0)) return true;
  return (Math.abs(row.open - row.close) * 100 / h) >= 76;
}

// ── 1-min candle cache ────────────────────────────────────────────────────────
const candleMaps = {};
function loadCandleMap(crypto) {
  if (candleMaps[crypto]) return candleMaps[crypto];
  const file = path.join(CACHE_DIR, `candles-1m-${crypto}USDT-5000.json`);
  if (!fs.existsSync(file)) { candleMaps[crypto] = new Map(); return candleMaps[crypto]; }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const raw = parsed.candles ?? parsed;
  const m = new Map();
  for (const c of raw) {
    const ts = Array.isArray(c) ? c[0] : new Date(c.timestamp).getTime();
    const o  = Array.isArray(c) ? { open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] }
                                : { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    m.set(ts, o);
  }
  candleMaps[crypto] = m;
  return m;
}

// ── Pre-move: 5-min price change before cycle start ───────────────────────────
function getPreMove(crypto, cycleStartMs) {
  const map   = loadCandleMap(crypto);
  if (!map.size) return null;
  const minNow  = Math.floor(cycleStartMs / 60000) * 60000;
  const min5ago = minNow - 5 * 60000;
  const cNow    = map.get(minNow);
  const c5ago   = map.get(min5ago);
  if (!cNow || !c5ago || !c5ago.open) return null;
  return (cNow.open - c5ago.open) / c5ago.open * 100;
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

// ── Collect all qualifying signals with preMove ───────────────────────────────
const periods = [
  ...(only15m ? [] : PERIODS_5M),
  ...(only5m  ? [] : PERIODS_15M),
];

// Deduplicate: one signal per (crypto, cycleStartMs, is15m) — use best period
// (same approach as explore_vol.js: just use all signals, accept some duplicates across periods)
// For statistical analysis this is fine — we're looking at the preMove vs WR relationship.

const allSignals = [];

for (const period of periods) {
  const is15m        = period >= 150;
  const durationSecs = is15m ? 900 : 300;
  const thMap        = is15m ? TH_15M : TH_5M;
  const signals      = parseCSV(period);
  if (!signals.length) continue;

  for (const sig of signals) {
    const th        = thMap[sig.crypto] ?? 0.20;
    const absSpike  = Math.abs(sig.spikePct);
    const direction = sig.spikePct > 0 ? 'UP' : 'DOWN';
    if (absSpike < th)          continue;
    if (!hasStrongBody(sig))    continue;
    const outcome = pmOutcome(sig.crypto, sig.cycleStartMs, durationSecs);
    const win     = resolveWin(direction, outcome);
    if (win === null)            continue;
    const preMove = getPreMove(sig.crypto, sig.cycleStartMs);
    allSignals.push({ crypto: sig.crypto, is15m, direction, win, preMove, period, absSpike });
  }
}

const total = allSignals.length;
console.log(b(`\n═══ EXHAUSTION FILTER ANALYSIS — ${total} PM-resolved signals ═══\n`));
if (!total) { console.log(r('No signals found. Check CSV files and cache.')); process.exit(1); }

const withPreMove = allSignals.filter(s => s.preMove != null);
console.log(d(`  Signals with preMove data: ${withPreMove.length} / ${total} (${(withPreMove.length/total*100).toFixed(0)}%)\n`));

// ── 1. Bucket analysis: preMove magnitude × same/opposite direction ───────────
const BUCKETS = [
  ['0.00–0.05%',  0,     0.05 ],
  ['0.05–0.10%',  0.05,  0.10 ],
  ['0.10–0.15%',  0.10,  0.15 ],
  ['0.15–0.25%',  0.15,  0.25 ],
  ['0.25–0.40%',  0.25,  0.40 ],
  ['0.40–0.60%',  0.40,  0.60 ],
  ['0.60%+',      0.60,  Infinity],
];

function wrStr(wins, total) {
  if (!total) return d('  —  ');
  const wr = wins / total * 100;
  const s  = `${wr.toFixed(1)}% (${wins}W/${total-wins}L)`;
  return wr >= 90 ? g(s) : wr >= 80 ? y(s) : r(s);
}

console.log(b('  1. WR by pre-move magnitude (qualifying signals only)\n'));
console.log(d('  Pre-move bucket   SAME direction (exhaustion zone)        OPPOSITE direction'));
console.log(d('  ' + '─'.repeat(80)));

for (const [label, lo, hi] of BUCKETS) {
  const same = withPreMove.filter(s => {
    const pm = Math.abs(s.preMove);
    const sameDir = s.preMove >= 0 ? 'UP' : 'DOWN';
    return pm > lo && pm <= hi && sameDir === s.direction;
  });
  const opp = withPreMove.filter(s => {
    const pm = Math.abs(s.preMove);
    const sameDir = s.preMove >= 0 ? 'UP' : 'DOWN';
    return pm > lo && pm <= hi && sameDir !== s.direction;
  });
  const sameWins = same.filter(s => s.win).length;
  const oppWins  = opp.filter(s => s.win).length;
  process.stdout.write(
    `  ${label.padEnd(17)}  ${wrStr(sameWins, same.length).padEnd(40)}  ${wrStr(oppWins, opp.length)}\n`
  );
}

// ── 2. Threshold sweep ─────────────────────────────────────────────────────────
const THRESHOLDS = [0.05, 0.08, 0.09, 0.10, 0.12, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50];

console.log(b('\n  2. Threshold sweep: WR with filter vs without\n'));
console.log(d('  (Skips signal when |preMove| > threshold AND preMove direction == signal direction)\n'));

// Baseline: all signals (no filter)
const baseWins = withPreMove.filter(s => s.win).length;
const baseTotal = withPreMove.length;
const baseWR = baseWins / baseTotal * 100;
console.log(d(`  Baseline (no filter):  ${baseWR.toFixed(1)}% WR  (${baseWins}W/${baseTotal-baseWins}L  ${baseTotal} trades)\n`));
console.log(d('  Threshold  Skipped  Skipped%   Kept   WR (kept)     WR lift'));
console.log(d('  ' + '─'.repeat(65)));

for (const th of THRESHOLDS) {
  const skipped = withPreMove.filter(s => {
    const sameDir = s.preMove >= 0 ? 'UP' : 'DOWN';
    return Math.abs(s.preMove) > th && sameDir === s.direction;
  });
  const kept = withPreMove.filter(s => {
    const sameDir = s.preMove >= 0 ? 'UP' : 'DOWN';
    return !(Math.abs(s.preMove) > th && sameDir === s.direction);
  });
  const keptWins = kept.filter(s => s.win).length;
  const keptWR   = kept.length ? keptWins / kept.length * 100 : 0;
  const lift     = keptWR - baseWR;
  const liftStr  = lift >= 0.5 ? g(`+${lift.toFixed(2)}%`) : lift <= -0.5 ? r(`${lift.toFixed(2)}%`) : d(`${lift.toFixed(2)}%`);
  const skPct    = (skipped.length / withPreMove.length * 100).toFixed(1);
  const wrS      = keptWR >= 90 ? g : keptWR >= 85 ? y : r;
  process.stdout.write(
    `  ${String(th.toFixed(2)+'%').padEnd(10)} ${String(skipped.length).padStart(7)}  ${skPct.padStart(7)}%  ` +
    `${String(kept.length).padStart(6)}  ${wrS(keptWR.toFixed(1)+'%').padEnd(12)}  ${liftStr}\n`
  );
}

// ── 3. Per-crypto × per-timeframe breakdown ───────────────────────────────────
console.log(b('\n  3. Per-crypto WR — exhausted (same-dir preMove > 0.09%) vs clean\n'));
console.log(d('  Crypto  TF    Exhausted signals WR       Clean signals WR'));
console.log(d('  ' + '─'.repeat(65)));

const TH_SHOW = 0.09;  // use the current engine default
for (const crypto of ['BTC','ETH','SOL','XRP']) {
  for (const tf of ['5m','15m']) {
    const is15m = tf === '15m';
    const sigs  = withPreMove.filter(s => s.crypto === crypto && s.is15m === is15m);
    if (!sigs.length) continue;
    const exhaust = sigs.filter(s => {
      const sd = s.preMove >= 0 ? 'UP' : 'DOWN';
      return Math.abs(s.preMove) > TH_SHOW && sd === s.direction;
    });
    const clean = sigs.filter(s => {
      const sd = s.preMove >= 0 ? 'UP' : 'DOWN';
      return !(Math.abs(s.preMove) > TH_SHOW && sd === s.direction);
    });
    const eW = exhaust.filter(s => s.win).length;
    const cW = clean.filter(s => s.win).length;
    process.stdout.write(
      `  ${crypto.padEnd(6)}  ${tf.padEnd(4)}  ${wrStr(eW, exhaust.length).padEnd(35)}  ${wrStr(cW, clean.length)}\n`
    );
  }
}

// ── 4. Skipped signal WR (what are we actually discarding?) ───────────────────
console.log(b('\n  4. WR of skipped signals at each threshold (what we are discarding)\n'));
console.log(d('  If skipped WR is high, the filter is HURTING us. If low, it\'s helping.\n'));
console.log(d('  Threshold   Skipped WR'));
console.log(d('  ' + '─'.repeat(35)));

for (const th of [0.05, 0.09, 0.10, 0.15, 0.20, 0.25, 0.35]) {
  const skipped = withPreMove.filter(s => {
    const sameDir = s.preMove >= 0 ? 'UP' : 'DOWN';
    return Math.abs(s.preMove) > th && sameDir === s.direction;
  });
  const skW = skipped.filter(s => s.win).length;
  process.stdout.write(`  ${String(th.toFixed(2)+'%').padEnd(11)}  ${wrStr(skW, skipped.length)}\n`);
}

console.log('');
