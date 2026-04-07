#!/usr/bin/env node
'use strict';

/**
 * simulate_v2.js — OHLC Sequential-Exit Fade Simulation
 *
 * Strategy:
 *   1. T+1 candle closes with a spike (first candle of 5-min cycle)
 *   2. If YES ≤ MAX_MOM_ENTRY  → MOMENTUM: buy YES, hold to resolution
 *      If YES > MAX_MOM_ENTRY  → FADE: buy NO at entry price
 *   3. SEQUENTIAL exit for fade: check T+2, T+3, T+4 candle extremes in order
 *      - UP spike: extreme = candle LOW  (price reverting down = NO gaining value)
 *      - DN spike: extreme = candle HIGH (price reverting up   = NO gaining value)
 *      - At each extreme, estimate NO sell price
 *      - If sell price ≥ entry × TARGET_MULTIPLE → EXIT at this candle (limit order filled)
 *      - Stop checking further candles once exited
 *   4. If target never hit → hold to binary resolution at cycle end
 *
 * OHLC rationale: the candle extreme = furthest tick reached during that minute.
 *   A resting limit-sell at targetPrice is filled if LOW ≤ targetPrice during that candle.
 *   This is a realistic proxy for limit-order execution without tick-by-tick data.
 *
 * Usage:
 *   node scripts/simulate_v2.js
 *   node scripts/simulate_v2.js --target-multiple 2.0
 *   node scripts/simulate_v2.js --crypto BTC --verbose
 *   node scripts/simulate_v2.js --candles 50000
 *   node scripts/simulate_v2.js --v1   (momentum-only baseline)
 */

const fs   = require('fs');
const path = require('path');

// ── CLI args ───────────────────────────────────────────────────────────────────
const arg = (k, def) => {
  const i = process.argv.indexOf(`--${k}`);
  return i !== -1 ? process.argv[i + 1] : def;
};
const has = k => process.argv.includes(`--${k}`);

const THRESHOLD      = parseFloat(arg('threshold',      '0.21'));
const MAX_MOM_ENTRY  = parseFloat(arg('max-entry',      '0.90'));
const TARGET_MULT    = parseFloat(arg('target-multiple','2.0'));   // e.g. 2.0 = 2x entry
const POSITION_USD   = parseFloat(arg('position',       '50'));
const SLIPPAGE_PCT   = parseFloat(arg('slippage',       '3'));
const SELL_SPREAD    = parseFloat(arg('sell-spread',    '10'));    // % haircut when selling
const MAX_CANDLES    = parseInt(  arg('candles',        '10000'), 10);
const CRYPTO_FILTER  = arg('crypto', null)?.toUpperCase();
const VERBOSE        = has('verbose') || has('v');
const V1_MODE        = has('v1');

const ALL_CRYPTOS = ['BTC', 'ETH', 'SOL', 'XRP'];
const CRYPTOS     = CRYPTO_FILTER ? [CRYPTO_FILTER] : ALL_CRYPTOS;

// ── Data loading ───────────────────────────────────────────────────────────────
function loadCandles(crypto) {
  const p = path.join(__dirname, `../cache/candles-1m-${crypto}USDT-${MAX_CANDLES}.json`);
  if (!fs.existsSync(p)) {
    console.error(`  [warn] cache missing: ${p}`);
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Array.isArray(raw) ? raw : (raw.candles || []);
}

function groupIntoCycles(candles) {
  const map = new Map();
  for (const c of candles) {
    const ts  = c.openTime ?? new Date(c.timestamp).getTime();
    const t   = new Date(ts);
    const min = Math.floor(t.getUTCMinutes() / 5) * 5;
    const key = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(),
                         t.getUTCHours(), min);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ ...c, _ts: ts });
  }
  const out = [];
  for (const [key, cc] of map) {
    if (cc.length !== 5) continue;
    const sorted = cc.sort((a, b) => a._ts - b._ts);
    let ok = true;
    for (let i = 1; i < 5; i++) {
      if (sorted[i]._ts - sorted[i - 1]._ts !== 60000) { ok = false; break; }
    }
    if (ok) out.push({ key, cc: sorted, ref: sorted[0].open });
  }
  return out.sort((a, b) => a.key - b.key);
}

// ── Empirical YES price table ──────────────────────────────────────────────────
// Bins cycles by T+1 spike magnitude, computes P(cycle resolves momentum).
// Used as proxy for Polymarket YES token price at any given BTC displacement.
function buildWinRateTable(cycles) {
  const BIN = 0.05;
  const bins = new Map();
  for (const { cc, ref } of cycles) {
    const pct = (cc[0].close - ref) / ref * 100;
    const abs = Math.abs(pct);
    if (abs < 0.01) continue;
    const k = parseFloat((Math.round(abs / BIN) * BIN).toFixed(2));
    if (!bins.has(k)) bins.set(k, { wins: 0, n: 0 });
    const b = bins.get(k);
    b.n++;
    const isUp = pct > 0;
    if (isUp ? cc[4].close > ref : cc[4].close < ref) b.wins++;
  }
  const table = new Map();
  for (const [k, { wins, n }] of bins) {
    if (n >= 20) table.set(k, { wr: wins / n, n });
  }
  return table;
}

function lookupYesPrice(absPct, table) {
  const BIN = 0.05;
  // Find the two surrounding bins for linear interpolation
  const lo = parseFloat((Math.floor(absPct / BIN) * BIN).toFixed(2));
  const hi = parseFloat((lo + BIN).toFixed(2));
  const t  = (absPct - lo) / BIN;  // interpolation factor 0..1

  const loVal = table.get(lo);
  const hiVal = table.get(hi);

  if (loVal && hiVal) {
    // Linear interpolation between the two surrounding bins
    return loVal.wr + t * (hiVal.wr - loVal.wr);
  }
  if (loVal) return loVal.wr;
  if (hiVal) return hiVal.wr;

  // Neither surrounding bin has data — walk outward to find nearest
  for (let d = BIN; d <= 2.0; d += BIN) {
    const hh = parseFloat((hi + d).toFixed(2));
    const ll = parseFloat((lo - d).toFixed(2));
    if (table.has(hh)) return table.get(hh).wr;
    if (ll >= 0 && table.has(ll)) return table.get(ll).wr;
  }
  return 0.5;
}

// Estimate YES token price at a mid-cycle moment given BTC displacement from reference.
// For UP spike: if BTC still above ref → YES high; if below ref → YES < 50% (fading).
function yesAtDisplacement(displacementPct, isUpSpike, table) {
  if (isUpSpike) {
    if (displacementPct >= 0) {
      return lookupYesPrice(displacementPct, table);
    } else {
      return 1 - lookupYesPrice(-displacementPct, table);
    }
  } else {
    if (displacementPct <= 0) {
      return lookupYesPrice(-displacementPct, table);
    } else {
      return 1 - lookupYesPrice(displacementPct, table);
    }
  }
}

// ── Trade pricing ──────────────────────────────────────────────────────────────
function buyPrice(noPrice) {
  // Pay ask (no price + slippage)
  return Math.min(Math.max(noPrice * (1 + SLIPPAGE_PCT / 100), 0.005), 0.995);
}

function sellPrice(noPrice) {
  // Receive bid (ask - spread haircut)
  return Math.max(noPrice * (1 - SELL_SPREAD / 100), 0.001);
}

// ── Per-crypto simulation ──────────────────────────────────────────────────────
function simulateCrypto(crypto) {
  const candles = loadCandles(crypto);
  if (!candles.length) return null;
  const cycles  = groupIntoCycles(candles);
  if (!cycles.length) return null;

  const wrTable = buildWinRateTable(cycles);
  const days    = (cycles[cycles.length - 1].key - cycles[0].key) / 86_400_000;

  const mom = { n: 0, wins: 0, pnl: 0 };

  // Fade stats
  const fade = {
    n: 0,
    // Sequential exit tracking
    exitAt:   [0, 0, 0, 0],  // [T+2, T+3, T+4, binary(no hit)]
    hitCount: 0,              // trades that hit the target multiple
    hitPnl:   0,              // P&L from successful exits
    missPnl:  0,              // P&L from binary resolution (no hit)
    hardWins: 0,              // binary resolution wins (cycle resolves NO)
    totalPnl: 0,

    // Distributions
    entryPrices:  [],   // NO buy price (with slippage)
    targetPrices: [],   // target sell price = entryNoAsk × TARGET_MULT
    exitPrices:   [],   // actual sell price when target was hit
  };

  let skipped = 0;
  const tradeLog = [];

  for (const { key, cc, ref } of cycles) {
    const c0       = cc[0];  // T+1 in user's notation (first candle of cycle)
    const closePct = (c0.close - ref) / ref * 100;
    const absPct   = Math.abs(closePct);

    if (absPct < THRESHOLD) { skipped++; continue; }

    const isUp = closePct > 0;

    // Empirical YES/NO at entry (T+1 close)
    const entryYes   = lookupYesPrice(absPct, wrTable);
    const entryNoAsk = buyPrice(1 - entryYes);
    const targetSell = entryNoAsk * TARGET_MULT;  // the limit sell we place

    const resolvedMomentum = isUp ? cc[4].close > ref : cc[4].close < ref;

    // ── Momentum branch ───────────────────────────────────────────────────────
    if (V1_MODE || entryYes <= MAX_MOM_ENTRY) {
      mom.n++;
      const entry = buyPrice(entryYes);
      const pnl   = resolvedMomentum
        ? (POSITION_USD / entry) * (1 - entry)
        : -POSITION_USD;
      mom.pnl += pnl;
      if (resolvedMomentum) mom.wins++;
      continue;
    }

    // ── Fade branch: YES > MAX_MOM_ENTRY → buy NO ─────────────────────────────
    fade.n++;
    fade.entryPrices.push(entryNoAsk);
    fade.targetPrices.push(targetSell);

    // Sequential exit: check T+2, T+3, T+4 candle extremes (cc[1], cc[2], cc[3])
    // cc[4] is the last candle before resolution — we don't exit mid-candle there,
    // we let the cycle resolve to binary outcome if target not hit by cc[3].
    let exitMinuteIdx = -1;   // -1 = no hit
    let actualSellPrice = 0;

    for (let k = 0; k < 3; k++) {
      const candle       = cc[k + 1];  // T+2, T+3, T+4
      const extreme      = isUp ? candle.low : candle.high;  // fade direction extreme
      const displacePct  = (extreme - ref) / ref * 100;

      // Estimate NO sell price at this extreme
      const yesNow   = yesAtDisplacement(displacePct, isUp, wrTable);
      const noNow    = 1 - yesNow;
      const noSell   = sellPrice(noNow);

      if (noSell >= targetSell) {
        exitMinuteIdx   = k;       // 0=T+2, 1=T+3, 2=T+4
        actualSellPrice = noSell;  // the bid price we receive
        break;
      }
    }

    const shares = POSITION_USD / entryNoAsk;

    if (exitMinuteIdx >= 0) {
      // Target hit → sell at targetSell (or actualSellPrice, whichever reached)
      // Use actualSellPrice since it already passed the ≥ targetSell check
      const pnl = shares * (actualSellPrice - entryNoAsk);
      fade.hitCount++;
      fade.hitPnl  += pnl;
      fade.totalPnl += pnl;
      fade.exitAt[exitMinuteIdx]++;
      fade.exitPrices.push(actualSellPrice);

      if (VERBOSE && tradeLog.length < 80) {
        tradeLog.push({
          date:     new Date(key).toISOString().slice(0, 16),
          dir:      isUp ? '▲' : '▼',
          close:    closePct.toFixed(3) + '%',
          yesEntry: (entryYes * 100).toFixed(1) + '¢',
          noEntry:  (entryNoAsk * 100).toFixed(1) + '¢',
          target:   (targetSell * 100).toFixed(1) + '¢',
          exitAt:   `T+${exitMinuteIdx + 2}`,
          exitPrice:(actualSellPrice * 100).toFixed(1) + '¢',
          mult:     (actualSellPrice / entryNoAsk).toFixed(2) + 'x',
          pnl:      '$' + pnl.toFixed(2),
          result:   'HIT',
        });
      }
    } else {
      // Target not hit → binary resolution
      const hardWin = !resolvedMomentum;
      const pnl = hardWin
        ? shares * (1 - entryNoAsk)   // win full value
        : -POSITION_USD;              // lose stake
      if (hardWin) fade.hardWins++;
      fade.missPnl  += pnl;
      fade.totalPnl += pnl;
      fade.exitAt[3]++;

      if (VERBOSE && tradeLog.length < 80) {
        tradeLog.push({
          date:     new Date(key).toISOString().slice(0, 16),
          dir:      isUp ? '▲' : '▼',
          close:    closePct.toFixed(3) + '%',
          yesEntry: (entryYes * 100).toFixed(1) + '¢',
          noEntry:  (entryNoAsk * 100).toFixed(1) + '¢',
          target:   (targetSell * 100).toFixed(1) + '¢',
          exitAt:   'BINARY',
          exitPrice: hardWin ? '100¢' : '0¢',
          mult:     hardWin ? (1 / entryNoAsk).toFixed(2) + 'x' : '0.00x',
          pnl:      '$' + pnl.toFixed(2),
          result:   hardWin ? 'B-WIN' : 'LOSS',
        });
      }
    }
  }

  return { crypto, cycles: cycles.length, days, skipped, mom, fade, tradeLog, wrTable };
}

// ── Stats helpers ──────────────────────────────────────────────────────────────
const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const med = a => { if (!a.length) return 0; const s = [...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
const p10 = a => { if (!a.length) return 0; const s = [...a].sort((x,y)=>x-y); return s[Math.floor(s.length*0.10)]; };
const p90 = a => { if (!a.length) return 0; const s = [...a].sort((x,y)=>x-y); return s[Math.floor(s.length*0.90)]; };

// ── Output ─────────────────────────────────────────────────────────────────────
function printResults(results) {
  const all = results.filter(Boolean);
  if (!all.length) { console.log('No data.'); return; }

  const totMom  = { n: 0, wins: 0, pnl: 0 };
  const totFade = {
    n: 0, hitCount: 0, hardWins: 0,
    hitPnl: 0, missPnl: 0, totalPnl: 0,
    exitAt: [0, 0, 0, 0],
    entryPrices: [], targetPrices: [], exitPrices: [],
  };
  let totalDays = 0, totalCycles = 0;

  for (const r of all) {
    totMom.n    += r.mom.n;
    totMom.wins += r.mom.wins;
    totMom.pnl  += r.mom.pnl;
    totFade.n         += r.fade.n;
    totFade.hitCount  += r.fade.hitCount;
    totFade.hardWins  += r.fade.hardWins;
    totFade.hitPnl    += r.fade.hitPnl;
    totFade.missPnl   += r.fade.missPnl;
    totFade.totalPnl  += r.fade.totalPnl;
    for (let i = 0; i < 4; i++) totFade.exitAt[i] += r.fade.exitAt[i];
    totFade.entryPrices  = totFade.entryPrices.concat(r.fade.entryPrices);
    totFade.targetPrices = totFade.targetPrices.concat(r.fade.targetPrices);
    totFade.exitPrices   = totFade.exitPrices.concat(r.fade.exitPrices);
    totalDays   = Math.max(totalDays, r.days);
    totalCycles += r.cycles;
  }

  const momWR   = totMom.n   ? totMom.wins    / totMom.n   : 0;
  const momEV   = totMom.n   ? totMom.pnl  / (totMom.n   * POSITION_USD) : 0;
  const hitRate = totFade.n  ? totFade.hitCount / totFade.n : 0;
  const totalEV = totFade.n  ? totFade.totalPnl / (totFade.n * POSITION_USD) : 0;
  const hitEV   = totFade.hitCount ? totFade.hitPnl  / (totFade.hitCount  * POSITION_USD) : 0;
  const missEV  = totFade.exitAt[3] ? totFade.missPnl / (totFade.exitAt[3] * POSITION_USD) : 0;

  const avgEntry  = avg(totFade.entryPrices);
  const avgTarget = avgEntry * TARGET_MULT;

  const S = '═'.repeat(72);
  const s = '─'.repeat(72);

  console.log(`\n${S}`);
  console.log('  SPIKE TRADING — V2 OHLC SEQUENTIAL-EXIT SIMULATION');
  console.log('  Pricing:  empirical win rates (no Black-Scholes)');
  console.log('  Exit:     sequential limit-sell at T+2→T+3→T+4 extremes, else binary');
  console.log(S);
  console.log(`  Dataset : ${totalCycles.toLocaleString()} cycles  |  ${totalDays.toFixed(1)} days  |  ${CRYPTOS.join(', ')}`);
  console.log(`  Params  : spike ≥${THRESHOLD}%  |  fade if YES >${(MAX_MOM_ENTRY*100).toFixed(0)}¢  |  target ${TARGET_MULT}x  |  $${POSITION_USD}/trade  |  slip ${SLIPPAGE_PCT}%  |  sell spread ${SELL_SPREAD}%`);
  console.log(`  Mode    : ${V1_MODE ? 'V1 — momentum only' : 'V2 — momentum + sequential fade exit'}\n`);

  // ── Empirical win rate table (single crypto) ─────────────────────────────────
  if (all.length === 1) {
    const wrt = all[0].wrTable;
    console.log(`  EMPIRICAL YES PRICE TABLE — ${all[0].crypto}`);
    console.log(s);
    console.log('  Disp%  │ YES%   │   N  │ Histogram                    │ Zone');
    console.log('  ───────┼────────┼──────┼──────────────────────────────┼─────────');
    const keys = [...wrt.keys()].sort((a, b) => a - b).filter(k => k >= 0.05 && k <= 1.50);
    for (const k of keys) {
      const { wr, n } = wrt.get(k);
      const bar  = '█'.repeat(Math.round(wr * 25)).padEnd(28);
      const zone = wr > MAX_MOM_ENTRY ? '◄ FADE' : '';
      console.log(`  ${k.toFixed(2).padStart(5)}%  │ ${(wr*100).toFixed(1).padStart(5)}% │${String(n).padStart(5)} │ ${bar}│ ${zone}`);
    }
    console.log();
  }

  // ── Signal overview ──────────────────────────────────────────────────────────
  console.log(`  SIGNAL OVERVIEW`);
  console.log(s);
  console.log(`  Total spikes : ${(totMom.n + totFade.n).toLocaleString()}`);
  console.log(`  → Momentum   : ${totMom.n.toLocaleString()}  (YES ≤ ${(MAX_MOM_ENTRY*100).toFixed(0)}¢)`);
  console.log(`  → Fade       : ${totFade.n.toLocaleString()}  (YES > ${(MAX_MOM_ENTRY*100).toFixed(0)}¢)`);

  // ── Momentum ─────────────────────────────────────────────────────────────────
  console.log(`\n  MOMENTUM PERFORMANCE`);
  console.log(s);
  console.log(`  Signals : ${totMom.n.toLocaleString()}  |  WR: ${(momWR*100).toFixed(1)}%  |  EV: ${(momEV*100).toFixed(1)}%`);
  console.log(`  P&L     : $${totMom.pnl.toFixed(0)}  ($${(totMom.pnl/totalDays).toFixed(2)}/day)`);
  console.log(`  Note    : EV uses empirical YES price as entry (eliminates market-inefficiency edge)`);

  if (V1_MODE) { console.log(`\n${S}\n`); return; }

  if (totFade.n === 0) {
    console.log(`\n  FADE: No opportunities (YES never exceeded ${(MAX_MOM_ENTRY*100).toFixed(0)}¢ with N≥20 samples)`);
    console.log(`  Try --max-entry 0.80 or --candles 50000`);
    console.log(`\n${S}\n`);
    return;
  }

  // ── Fade entry ───────────────────────────────────────────────────────────────
  const ent = totFade.entryPrices;
  console.log(`\n  FADE — ENTRY + TARGET`);
  console.log(s);
  console.log(`  Signals      : ${totFade.n}`);
  console.log(`  Entry avg    : ${(avg(ent)*100).toFixed(1)}¢   median: ${(med(ent)*100).toFixed(1)}¢   p10: ${(p10(ent)*100).toFixed(1)}¢   p90: ${(p90(ent)*100).toFixed(1)}¢`);
  console.log(`  Target sell  : ${(avgTarget*100).toFixed(1)}¢ avg  (entry × ${TARGET_MULT}x)  — resting limit sell order`);
  console.log(`  Break-even   : ${((totFade.hardWins/totFade.n)*100).toFixed(1)}¢  (hard WR — binary EV = 0 if entry = WR%)`);

  // ── Sequential exit stats ────────────────────────────────────────────────────
  console.log(`\n  FADE — SEQUENTIAL EXIT (limit-sell at ${TARGET_MULT}x entry, checked T+2→T+3→T+4)`);
  console.log(s);
  const labels = ['T+2', 'T+3', 'T+4', 'binary'];
  let cumHit = 0;
  console.log('  Exit at │ Count │    %  │ Cumul% │ Description');
  console.log('  ────────┼───────┼───────┼────────┼──────────────────────────────');
  for (let i = 0; i < 4; i++) {
    const cnt = totFade.exitAt[i];
    const pct = (cnt / totFade.n * 100);
    if (i < 3) cumHit += cnt;
    const cum = i < 3 ? (cumHit / totFade.n * 100).toFixed(1) : '—';
    const desc = i === 0 ? `target hit at 2nd check candle`
               : i === 1 ? `target hit at 3rd check candle`
               : i === 2 ? `target hit at 4th check candle`
               : `target never hit → binary resolution`;
    const bar = '█'.repeat(Math.round(pct / 2));
    console.log(`   ${labels[i].padEnd(5)}  │ ${String(cnt).padStart(4)}  │ ${pct.toFixed(1).padStart(5)}% │ ${String(cum).padStart(5)}% │ ${desc}`);
  }
  console.log(`\n  Hit rate : ${(hitRate*100).toFixed(1)}%  (${totFade.hitCount}/${totFade.n} trades hit ${TARGET_MULT}x target before binary)`);

  // ── P&L breakdown ────────────────────────────────────────────────────────────
  console.log(`\n  FADE — P&L BREAKDOWN`);
  console.log(s);
  console.log(`  ┌────────────────────┬──────────┬───────────┬────────────┬────────────┐`);
  console.log(`  │ Group              │  Count   │  EV/trade │  Total P&L │  Per day   │`);
  console.log(`  ├────────────────────┼──────────┼───────────┼────────────┼────────────┤`);
  const hitN   = totFade.hitCount;
  const missN  = totFade.exitAt[3];
  const bwinN  = totFade.hardWins;
  const blossN = missN - bwinN;
  console.log(`  │ Target hit exits   │ ${String(hitN).padStart(7)}  │ ${(hitEV*100).toFixed(1).padStart(8)}% │ $${String(totFade.hitPnl.toFixed(0)).padStart(9)}  │ $${(totFade.hitPnl/totalDays).toFixed(2).padStart(9)} │`);
  console.log(`  │ Binary wins (NO)   │ ${String(bwinN).padStart(7)}  │ ${((1/avg(ent)-1)*100).toFixed(1).padStart(8)}% │ $${String((bwinN*(POSITION_USD/avg(ent))*(1-avg(ent))).toFixed(0)).padStart(9)}  │           │`);
  console.log(`  │ Binary losses      │ ${String(blossN).padStart(7)}  │ ${(-100).toFixed(1).padStart(8)}% │ $${String((-blossN*POSITION_USD).toFixed(0)).padStart(9)}  │           │`);
  console.log(`  ├────────────────────┼──────────┼───────────┼────────────┼────────────┤`);
  console.log(`  │ TOTAL FADE         │ ${String(totFade.n).padStart(7)}  │ ${(totalEV*100).toFixed(1).padStart(8)}% │ $${String(totFade.totalPnl.toFixed(0)).padStart(9)}  │ $${(totFade.totalPnl/totalDays).toFixed(2).padStart(9)} │`);
  console.log(`  └────────────────────┴──────────┴───────────┴────────────┴────────────┘`);

  // ── Combined ─────────────────────────────────────────────────────────────────
  const combined = totMom.pnl + totFade.totalPnl;
  console.log(`\n  COMBINED PERFORMANCE`);
  console.log(s);
  console.log(`  Momentum only (V1)  : $${totMom.pnl.toFixed(0)}  ($${(totMom.pnl/totalDays).toFixed(2)}/day)`);
  console.log(`  Fade P&L            : $${totFade.totalPnl.toFixed(0)}  ($${(totFade.totalPnl/totalDays).toFixed(2)}/day)`);
  console.log(`  Combined V2         : $${combined.toFixed(0)}  ($${(combined/totalDays).toFixed(2)}/day)`);

  // ── Per-crypto breakdown ─────────────────────────────────────────────────────
  if (!CRYPTO_FILTER && all.length > 1) {
    console.log(`\n  PER-CRYPTO BREAKDOWN`);
    console.log(s);
    console.log('  Crypto │ Mom WR  │ Fade N │ Hit Rate │ Hit EV  │ Total fade P&L │ /day');
    console.log('  ───────┼─────────┼────────┼──────────┼─────────┼────────────────┼──────');
    for (const r of all) {
      const mwr  = r.mom.n   ? (r.mom.wins / r.mom.n * 100).toFixed(1) + '%' : '—';
      const fhr  = r.fade.n  ? (r.fade.hitCount / r.fade.n * 100).toFixed(1) + '%' : '—';
      const hev  = r.fade.hitCount ? (r.fade.hitPnl / (r.fade.hitCount * POSITION_USD) * 100).toFixed(1) + '%' : '—';
      const fpnl = '$' + r.fade.totalPnl.toFixed(0);
      const fpd  = '$' + (r.fade.totalPnl / r.days).toFixed(2);
      console.log(
        `  ${r.crypto.padEnd(5)}  │ ${mwr.padStart(6)}  │ ${String(r.fade.n).padStart(5)}  │ ${fhr.padStart(7)}  │ ${hev.padStart(6)}  │ ${fpnl.padStart(14)}  │ ${fpd}`
      );
    }
  }

  // ── Verbose trade log ────────────────────────────────────────────────────────
  if (VERBOSE && totFade.n > 0) {
    const logs = all.flatMap(r => r.tradeLog).slice(0, 60);
    if (logs.length) {
      console.log(`\n  FADE TRADE LOG (first ${logs.length})`);
      console.log(s);
      console.log('  Date             Dir  Close    YES¢  NO(buy) Target   Exit@   Sell¢  Mult    P&L   Result');
      console.log('  ' + '─'.repeat(98));
      for (const t of logs) {
        console.log(
          `  ${t.date}  ${t.dir}  ${t.close.padStart(7)}  ${t.yesEntry.padStart(5)} ${t.noEntry.padStart(7)} ` +
          `${t.target.padStart(7)}  ${t.exitAt.padStart(7)} ${t.exitPrice.padStart(6)} ${t.mult.padStart(6)} ` +
          `${t.pnl.padStart(7)}  ${t.result}`
        );
      }
    }
  }

  console.log(`\n${S}\n`);
}

// ── Main ───────────────────────────────────────────────────────────────────────
console.log(`\n  Running V2 OHLC sequential-exit simulation  (target: ${TARGET_MULT}x)...`);
const results = CRYPTOS.map(simulateCrypto);
printResults(results);
