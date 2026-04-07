#!/usr/bin/env node
/**
 * explore_recover.js — RECOVER strategy exploration
 *
 * Strategy:
 *   T+0 spike detected (>= minSpike%), direction UP or DOWN
 *   Monitor T+1..T+N candles for a TONE candle where:
 *     - candle spike >= T+0 absSpike (using max of up/down move from open)
 *     - AND: if T+0 is UP  → TONE close <= T+0 open  (price reverted back below T+0 open)
 *            if T+0 is DOWN → TONE close >= T+0 open  (price reverted back above T+0 open)
 *   5-MIN: check T+1 and T+2 only
 *   15-MIN: check T+1 .. floor((900 - Cxx) / Cxx) candles
 *
 * Output: for each Cxx, show how many RECOVER triggers saved losses vs cut winners
 *
 * Usage: node backend/scripts/explore_recover.js [--th 0.20] [--only5m] [--only15m]
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argV = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i+1] : def; };
const hasFlag = k => args.includes(k);

const globalTh  = parseFloat(argV('--th', '0.20'));
const only5m    = hasFlag('--only5m');
const only15m   = hasFlag('--only15m');
const verbose   = hasFlag('-v') || hasFlag('--verbose');

// Per-crypto thresholds (mirrors simulator defaults from MEMORY.md)
const TH_5M  = { BTC: 0.24, ETH: 0.44, SOL: 0.22, XRP: 0.24 };
const TH_15M = { BTC: 0.29, ETH: 0.20, SOL: 0.20, XRP: 0.22 };

const CRYPTOS    = ['BTC', 'ETH', 'SOL', 'XRP'];
const PERIODS_5M = [50, 55, 60, 65, 70, 75, 80, 85];
const PERIODS_15M = [150, 165, 180, 195, 210, 225, 240, 255];

const ROOT     = path.join(__dirname, '../..');
const LOG_DIR  = path.join(__dirname, '..', 'logs');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

// ── Load PM outcomes ──────────────────────────────────────────────────────────
const pmOutcomesRaw = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'pm_outcomes.json'), 'utf8'));

function pmOutcome(crypto, cycleStartMs, durationSecs) {
  const k = `${crypto}_${Math.round(cycleStartMs / 1000)}_${durationSecs}`;
  return pmOutcomesRaw[k] ?? null;
}

// ── Load 1-min Binance candles (indexed by minute timestamp ms) ───────────────
const candleMap = {};  // crypto -> Map<minuteTs, candle>

function loadCandles(crypto) {
  if (candleMap[crypto]) return candleMap[crypto];
  const file = path.join(CACHE_DIR, `candles-1m-${crypto}USDT-5000.json`);
  if (!fs.existsSync(file)) { candleMap[crypto] = new Map(); return candleMap[crypto]; }
  const { candles } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const map = new Map();
  for (const c of candles) {
    const ts = new Date(c.timestamp).getTime();
    map.set(ts, c);
  }
  candleMap[crypto] = map;
  return map;
}

/**
 * Build an aggregated Cxx-second candle from 1-min candle data.
 * startMs: candle open time (ms)
 * durationMs: candle duration in ms (Cxx * 1000)
 * Returns { open, high, low, close } or null if no candles found.
 */
function buildCandle(crypto, startMs, durationMs) {
  const map = loadCandles(crypto);
  // Round startMs to nearest minute
  const startMin = Math.floor(startMs / 60000) * 60000;
  const endMs    = startMs + durationMs;

  let open = null, high = -Infinity, low = Infinity, close = null;
  let cursor = startMin;
  while (cursor < endMs) {
    const c = map.get(cursor);
    if (c) {
      if (open === null) open = c.open;
      high  = Math.max(high, c.high);
      low   = Math.min(low, c.low);
      close = c.close;
    }
    cursor += 60000;
  }
  if (open === null) return null;
  return { open, high, low, close };
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

// ── RECOVER detection ─────────────────────────────────────────────────────────
/**
 * Check T+1 .. T+maxN candles for a TONE candle.
 * Returns the first TONE candle index (1-based) or null.
 */
function detectTone(crypto, cycleStartMs, candleSizeMs, t0open, t0absPct, direction, maxN, minN = 1) {
  for (let n = minN; n <= maxN; n++) {
    const candleStartMs = cycleStartMs + n * candleSizeMs;
    const c = buildCandle(crypto, candleStartMs, candleSizeMs);
    if (!c) continue;

    // Measure spike in counter-direction from THIS candle's open
    const upMove   = (c.high  - c.open) / c.open * 100;
    const downMove = (c.open  - c.low)  / c.open * 100;
    const spike    = Math.max(upMove, downMove);

    if (spike < t0absPct) continue;  // Not a TONE candle (spike too small)

    // Check close reverts past T+0 open
    const reverts = direction === 'UP'
      ? c.close <= t0open   // price back below where T+0 opened
      : c.close >= t0open;  // price back above where T+0 opened

    if (reverts) return n;
  }
  return null;
}

// ── Analyse one period ────────────────────────────────────────────────────────
function analysePeriod(period) {
  const is15m       = period >= 150;
  const durationSecs = is15m ? 900 : 300;
  const candleSizeMs = period * 1000;

  // Max candles to check post-T+0
  // 5-MIN: T+1 and T+2 only
  // 15-MIN: last 2 candles of window (T+(maxN-1) and T+maxN)
  const maxN = is15m ? Math.floor((900 - period) / period) : 2;
  const minN = is15m ? Math.max(1, maxN - 1) : 1;  // last-2 window for 15m

  const signals = parseCSV(period);
  if (!signals.length) return null;

  // Filter by per-crypto threshold (use optimal per-timeframe)
  const thMap = is15m ? TH_15M : TH_5M;

  let total = 0, wins = 0, losses = 0, noPm = 0;
  let toneTotal = 0, toneLossSaved = 0, toneWinCut = 0, toneNoPm = 0;

  const rows = [];

  for (const sig of signals) {
    const th = thMap[sig.crypto] ?? globalTh;
    if (sig.absSpike === undefined) sig.absSpike = Math.abs(sig.spikePct);
    const absSpike = Math.abs(sig.spikePct);
    if (absSpike < th) continue;

    const direction = sig.spikePct >= 0 ? 'UP' : 'DOWN';
    const outcome   = pmOutcome(sig.crypto, sig.cycleStartMs, durationSecs);
    if (!outcome) { noPm++; continue; }

    const win = (direction === 'UP' && outcome === 'UP') || (direction === 'DOWN' && outcome === 'DOWN');
    total++;
    if (win) wins++; else losses++;

    // Check TONE (5m: T+1..T+2; 15m: last 2 candles only)
    const toneN = detectTone(sig.crypto, sig.cycleStartMs, candleSizeMs, sig.open, absSpike, direction, maxN, minN);
    if (toneN !== null) {
      toneTotal++;
      if (!win) toneLossSaved++;
      else      toneWinCut++;

      if (verbose) {
        rows.push({
          crypto: sig.crypto,
          time: new Date(sig.cycleStartMs).toISOString().slice(0,16),
          dir: direction,
          spike: absSpike.toFixed(3) + '%',
          toneN,
          outcome: win ? 'WIN' : 'LOSS',
          result: win ? 'WIN_CUT' : 'LOSS_SAVED',
        });
      }
    }
  }

  return { period, is15m, total, wins, losses, noPm, maxN,
           toneTotal, toneLossSaved, toneWinCut, toneNoPm, rows };
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\nRECOVER Strategy Exploration`);
console.log(`Thresholds: 5m BTC=${TH_5M.BTC}% ETH=${TH_5M.ETH}% SOL=${TH_5M.SOL}% XRP=${TH_5M.XRP}%`);
console.log(`            15m BTC=${TH_15M.BTC}% ETH=${TH_15M.ETH}% SOL=${TH_15M.SOL}% XRP=${TH_15M.XRP}%`);
console.log('─'.repeat(90));

const header = 'Cxx   Trades  W/L        maxN  TONE  LossSaved  WinCut  TrigRate  SaveRate';
console.log(header);
console.log('─'.repeat(90));

const periods = [
  ...(only15m ? [] : PERIODS_5M),
  ...(only5m  ? [] : PERIODS_15M),
];

let grandTotal = 0, grandWins = 0, grandLosses = 0;
let grandTone = 0, grandSaved = 0, grandCut = 0;

for (const period of periods) {
  const r = analysePeriod(period);
  if (!r || r.total < 5) continue;

  const wr    = r.total ? (r.wins / r.total * 100).toFixed(1) + '%' : '—';
  const tRate = r.total ? (r.toneTotal / r.total * 100).toFixed(1) + '%' : '—';
  const sRate = r.toneTotal ? (r.toneLossSaved / r.toneTotal * 100).toFixed(1) + '%' : '—';
  const wl    = `${r.wins}W ${r.losses}L (${wr})`;

  console.log(
    `C${String(period).padEnd(4)} ${String(r.total).padEnd(7)} ${wl.padEnd(18)} ${String(r.maxN).padEnd(5)} ` +
    `${String(r.toneTotal).padEnd(5)} ${String(r.toneLossSaved).padEnd(10)} ${String(r.toneWinCut).padEnd(7)} ` +
    `${tRate.padEnd(9)} ${sRate}`
  );

  if (verbose && r.rows.length) {
    r.rows.forEach(row => {
      console.log(`  ${row.time} ${row.crypto} ${row.dir.padEnd(4)} spike=${row.spike} T+${row.toneN} → ${row.result}`);
    });
  }

  grandTotal  += r.total;
  grandWins   += r.wins;
  grandLosses += r.losses;
  grandTone   += r.toneTotal;
  grandSaved  += r.toneLossSaved;
  grandCut    += r.toneWinCut;
}

console.log('─'.repeat(90));
const gWR    = grandTotal ? (grandWins / grandTotal * 100).toFixed(1) + '%' : '—';
const gTRate = grandTotal ? (grandTone / grandTotal * 100).toFixed(1) + '%' : '—';
const gSRate = grandTone  ? (grandSaved / grandTone * 100).toFixed(1) + '%' : '—';
console.log(`TOTAL ${String(grandTotal).padEnd(7)} ${grandWins}W ${grandLosses}L (${gWR})`.padEnd(36) +
            `      ${String(grandTone).padEnd(5)} ${String(grandSaved).padEnd(10)} ${String(grandCut).padEnd(7)} ${gTRate.padEnd(9)} ${gSRate}`);
console.log('\nColumns:');
console.log('  maxN      = candles monitored after T+0 (2 for 5m; floor((900-Cxx)/Cxx) for 15m)');
console.log('  TONE      = trades where a TONE candle was detected (early exit would trigger)');
console.log('  LossSaved = TONE triggered AND trade ended as LOSS (early exit HELPS)');
console.log('  WinCut    = TONE triggered AND trade ended as WIN  (early exit HURTS — false positive)');
console.log('  TrigRate  = TONE/Trades (how often strategy would fire)');
console.log('  SaveRate  = LossSaved/TONE (accuracy of the TONE signal)');
console.log('');
