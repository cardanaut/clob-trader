'use strict';
/**
 * TC (Tier 3 cumulative) body ratio analyzer.
 *
 * For every TC T+1 trade (label === 'TC'), examines:
 *   t0BodyRatio  = |t0Close − t0Open| / (t0High − t0Low) × 100
 *                  → how directional/clean was the T+0 candle itself?
 *   tcBodyRatio  = |t1Close − t0Open| / (t0High − t0Low) × 100
 *                  → how far did the 2-candle window move vs T+0 volatility?
 *
 * For trades that predate ratio storage, falls back to cross-referencing the
 * matching T+0 activityLog entry's contextCandles.
 *
 * Usage:
 *   node backend/scripts/analyze_tc_body.js
 *   node backend/scripts/analyze_tc_body.js --detail   → print each TC trade row
 */

const fs   = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../../logs/t1000-state.json');
const STRATEGIES = ['LIVE', 'LIVE_MINI'];
const DETAIL     = process.argv.includes('--detail');

// ── Load state ────────────────────────────────────────────────────────────────
const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

// Build a lookup of T+0 entries keyed by "strat|cycleStart|crypto|candle_size"
// so we can cross-reference historical TC entries that lack stored ratios.
const t0Index = new Map();
for (const key of STRATEGIES) {
  const s = state[key];
  if (!s) continue;
  for (const e of s.activityLog || []) {
    if (e.isT1) continue;   // skip T+1 entries
    if (!e.contextCandles) continue;
    const k = `${key}|${e.cycleStart}|${e.crypto}|${e.candle_size}`;
    t0Index.set(k, e);
  }
}

// ── Collect TC trades ─────────────────────────────────────────────────────────
const trades = [];

for (const key of STRATEGIES) {
  const s = state[key];
  if (!s) continue;
  for (const e of s.activityLog || []) {
    if (!e.isT1) continue;
    if (e.label !== 'TC') continue;
    if (e.status !== 'WIN' && e.status !== 'LOSS') continue;

    let t0BodyRatio = e.t0BodyRatio ?? null;
    let tcBodyRatio = e.tcBodyRatio ?? null;

    // Fallback: reconstruct from T+0 contextCandles
    if ((t0BodyRatio == null || tcBodyRatio == null) && e.cycleStart && e.crypto && e.candle_size) {
      const t0e = t0Index.get(`${key}|${e.cycleStart}|${e.crypto}|${e.candle_size}`);
      if (t0e?.contextCandles) {
        const cc = t0e.contextCandles[`C${e.candle_size}`];
        if (cc && cc.high != null && cc.low != null && cc.open != null && cc.close != null) {
          const range = cc.high - cc.low;
          if (range > 0) {
            if (t0BodyRatio == null) {
              t0BodyRatio = parseFloat((Math.abs(cc.close - cc.open) / range * 100).toFixed(1));
            }
            // tcBodyRatio needs t1Close — only available if stored on the T+1 entry
            if (tcBodyRatio == null && e.t1Close != null) {
              tcBodyRatio = parseFloat((Math.abs(e.t1Close - cc.open) / range * 100).toFixed(1));
            }
          }
        }
      }
    }

    trades.push({
      tradeId    : e.tradeId ?? '?',
      crypto     : e.crypto,
      candle_size: e.candle_size,
      direction  : e.direction,
      entryPrice : e.entryPrice,
      spike_pct  : e.spike_pct,
      status     : e.status,
      pnl        : e.pnl ?? null,
      t0BodyRatio,
      tcBodyRatio,
      _strat     : key,
    });
  }
}

if (trades.length === 0) {
  console.log('No resolved TC trades found in activityLog.');
  process.exit(0);
}

const wins   = trades.filter(t => t.status === 'WIN');
const losses = trades.filter(t => t.status === 'LOSS');

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(n, d) { return d === 0 ? '—' : (n / d * 100).toFixed(1) + '%'; }
function avg(arr, field) {
  const vals = arr.map(t => t[field]).filter(v => v != null);
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
}
function med(arr, field) {
  const vals = arr.map(t => t[field]).filter(v => v != null).sort((a, b) => a - b);
  if (!vals.length) return '—';
  const m = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[m].toFixed(1) : ((vals[m - 1] + vals[m]) / 2).toFixed(1);
}

// ── Threshold sweep ───────────────────────────────────────────────────────────
function sweep(field, label) {
  const tradesWithField = trades.filter(t => t[field] != null);
  if (tradesWithField.length === 0) {
    console.log(`\n${label}: no data available`);
    return;
  }
  const allVals = tradesWithField.map(t => t[field]);
  const minV = Math.floor(Math.min(...allVals) / 5) * 5;
  const maxV = Math.ceil (Math.max(...allVals) / 5) * 5;

  console.log(`\n── ${label} threshold sweep (skip trade if ratio < threshold) ──`);
  console.log('Thresh  LossAvoid  WinFilter  NetEdge  LossesBlocked  WinsBlocked');
  console.log('------  ---------  ---------  -------  -------------  -----------');

  for (let th = minV; th <= maxV; th += 5) {
    const blockedLosses = losses.filter(t => t[field] != null && t[field] < th);
    const blockedWins   = wins  .filter(t => t[field] != null && t[field] < th);
    const lossAvoid     = parseFloat(pct(blockedLosses.length, losses.length));
    const winFilter     = parseFloat(pct(blockedWins.length,   wins.length));
    const netEdge       = (isNaN(lossAvoid) ? 0 : lossAvoid) - (isNaN(winFilter) ? 0 : winFilter);
    const marker = netEdge > 10 ? ' ◀' : '';
    console.log(
      `  ${String(th).padStart(3)}%   ${String(pct(blockedLosses.length, losses.length)).padStart(9)}  ${String(pct(blockedWins.length, wins.length)).padStart(9)}  ${String(netEdge.toFixed(1) + '%').padStart(7)}  ${String(blockedLosses.length).padStart(13)}  ${String(blockedWins.length).padStart(11)}${marker}`
    );
  }
}

// ── Distribution ──────────────────────────────────────────────────────────────
function distribution(field, label, bucketSize = 10) {
  const tradesWithField = trades.filter(t => t[field] != null);
  if (tradesWithField.length === 0) return;

  console.log(`\n── ${label} distribution (bucket=${bucketSize}%) ──`);
  console.log('Range       Wins  Losses  WR');
  console.log('----------  ----  ------  --');

  const allVals = tradesWithField.map(t => t[field]);
  const minV = Math.floor(Math.min(...allVals) / bucketSize) * bucketSize;
  const maxV = Math.ceil (Math.max(...allVals) / bucketSize) * bucketSize;

  for (let lo = minV; lo < maxV; lo += bucketSize) {
    const hi = lo + bucketSize;
    const bWins   = wins  .filter(t => t[field] != null && t[field] >= lo && t[field] < hi).length;
    const bLosses = losses.filter(t => t[field] != null && t[field] >= lo && t[field] < hi).length;
    const total   = bWins + bLosses;
    if (total === 0) continue;
    const wr = (bWins / total * 100).toFixed(0) + '%';
    console.log(`${String(lo + '%–' + hi + '%').padEnd(10)}  ${String(bWins).padStart(4)}  ${String(bLosses).padStart(6)}  ${wr}`);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('  TC (Tier 3 Cumulative) Body Ratio Analysis');
console.log('══════════════════════════════════════════════════════════════');
console.log(`\nTotal TC trades : ${trades.length}  (${wins.length}W / ${losses.length}L  WR=${pct(wins.length, trades.length)})`);

const withT0   = trades.filter(t => t.t0BodyRatio != null).length;
const withTC   = trades.filter(t => t.tcBodyRatio != null).length;
console.log(`Data coverage   : t0BodyRatio=${withT0}/${trades.length}  tcBodyRatio=${withTC}/${trades.length}`);

// Summary stats
console.log('\n── Summary stats ──────────────────────────────────────────────');
console.log('              WINs        LOSSes');
console.log(`t0BodyRatio   avg=${avg(wins,'t0BodyRatio').padStart(5)}%  avg=${avg(losses,'t0BodyRatio').padStart(5)}%`);
console.log(`              med=${med(wins,'t0BodyRatio').padStart(5)}%  med=${med(losses,'t0BodyRatio').padStart(5)}%`);
console.log(`tcBodyRatio   avg=${avg(wins,'tcBodyRatio').padStart(5)}%  avg=${avg(losses,'tcBodyRatio').padStart(5)}%`);
console.log(`              med=${med(wins,'tcBodyRatio').padStart(5)}%  med=${med(losses,'tcBodyRatio').padStart(5)}%`);

// Distributions
distribution('t0BodyRatio', 'T+0 body ratio  |t0Close−t0Open| / (t0High−t0Low)');
distribution('tcBodyRatio', 'Window proxy     |t1Close−t0Open| / (t0High−t0Low)');

// Sweeps
sweep('t0BodyRatio', 'T+0 body ratio');
sweep('tcBodyRatio', 'Window proxy (tcBodyRatio)');

// Per-crypto
console.log('\n── Per-crypto breakdown ───────────────────────────────────────');
for (const crypto of ['BTC','ETH','SOL','XRP']) {
  const c = trades.filter(t => t.crypto === crypto);
  if (c.length === 0) continue;
  const cw = c.filter(t => t.status === 'WIN').length;
  const cl = c.filter(t => t.status === 'LOSS').length;
  console.log(`${crypto.padEnd(4)}  ${c.length} trades  ${cw}W/${cl}L  WR=${pct(cw, c.length)}  t0BodyAvg(W)=${avg(c.filter(t=>t.status==='WIN'),'t0BodyRatio')}%  t0BodyAvg(L)=${avg(c.filter(t=>t.status==='LOSS'),'t0BodyRatio')}%`);
}

// Detail rows
if (DETAIL) {
  console.log('\n── Per-trade detail ───────────────────────────────────────────');
  console.log('Status  Crypto  Candle  Dir  Entry  Spike%  t0Body%  tcBody%  TradeId');
  console.log('------  ------  ------  ---  -----  ------  -------  -------  -------');
  for (const t of trades.sort((a, b) => (a.status === 'LOSS' ? -1 : 1))) {
    console.log(
      `${t.status.padEnd(6)}  ${t.crypto.padEnd(6)}  C${String(t.candle_size).padEnd(5)}  ${t.direction.padEnd(3)}  ` +
      `${t.entryPrice != null ? (t.entryPrice * 100).toFixed(0).padStart(3) + '¢' : '  ?¢'}  ` +
      `${t.spike_pct != null ? t.spike_pct.toFixed(3).padStart(6) : '     ?'}  ` +
      `${t.t0BodyRatio != null ? String(t.t0BodyRatio).padStart(5) + '%' : '     '}   ` +
      `${t.tcBodyRatio != null ? String(t.tcBodyRatio).padStart(5) + '%' : '     '}   ` +
      `${t.tradeId}`
    );
  }
}

console.log('\n');
