#!/usr/bin/env node
'use strict';

/**
 * ⚠️  SUPERSEDED — use simulate_combined.js instead.
 * This file (Polymarket-only) is kept for reference but is no longer maintained.
 * simulate_combined.js covers Polymarket + Kalshi in a single pass and is the canonical simulator.
 *
 * T1000 Simulator v2.5  — Polymarket-resolved outcomes
 *
 * Instead of using Binance next-candle open price as a proxy for resolution,
 * this version fetches the actual Polymarket market outcome for each cycle
 * via the Gamma API. Results are cached in backend/cache/pm_outcomes.json
 * so subsequent runs are instant.
 *
 * Usage:
 *   node simulate_t1000_v2.js [options]
 *
 * Options:
 *   -th <pct>   Min |spike%|                (default: 0.24)
 *   -bl <usd>   Starting balance            (default: 1000)
 *   -mn <¢>     Min CLOB entry price        (default: 0)
 *   -mx <¢>     Max CLOB entry price        (default: 90)
 *   -rk <pct>   % of balance risked/trade   (default: 5)
 *   -vb         Verbose trade history
 *   -as         Autoscan — sweep all param combos and pick best per period
 *   -tp <n>     Top N results shown in autoscan (default: 5)
 *   -nf         No-fetch: use cache only, skip Polymarket API calls
 *
 * Examples:
 *   node simulate_t1000_v2.js -th 0.30 -mx 85 -vb
 *   node simulate_t1000_v2.js -as
 *   node simulate_t1000_v2.js -nf -as        (offline, cache only)
 */

const fs   = require('fs');
const path = require('path');
const pm   = require('./pm-outcomes');

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
function flag(name) { return argv.includes(name); }

const threshold     = parseFloat(arg('-th', '0.24'));
const jsonMode      = flag('--json');
const startBal      = jsonMode ? 1000 : parseFloat(arg('-bl', '1000'));
const minPriceCents = parseFloat(arg('-mn', '0'));
const maxPriceCents = parseFloat(arg('-mx', '93'));
const riskPct       = parseFloat(arg('-rk', '5')) / 100;
const verbose       = flag('-vb');
const autoscan      = flag('-as');
const noFetch       = flag('-nf');
const csvMode       = flag('-csv');
const topN          = parseInt(arg('-tp', '5'), 10);

// Trade size cap: -cp <5m-cap> <15m-cap>  e.g. -cp 150 500
// Defaults match T1000 engine limits.
const cpIdx  = argv.indexOf('-cp');
const CAP_5M  = cpIdx !== -1 && argv[cpIdx + 1] !== undefined ? parseFloat(argv[cpIdx + 1]) : 150;
const CAP_15M = cpIdx !== -1 && argv[cpIdx + 2] !== undefined && !argv[cpIdx + 2].startsWith('-') ? parseFloat(argv[cpIdx + 2]) : 500;
function capFor(is15m) { return is15m ? CAP_15M : CAP_5M; }

const minPrice = minPriceCents / 100;
const maxPrice = maxPriceCents / 100;

// ── Live params (read each strategy's configured params from t1000-state.json) ─
// Enabled automatically for --json (cron) or explicitly via --live-params flag.
const liveParamsMode = flag('--live-params');
let liveState = null;
if (liveParamsMode) {
  const stateFile = path.join(__dirname, '../../logs/t1000-state.json');
  try { liveState = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch(e) {}
}

function paramsFor(period) {
  const s = liveState?.[`C${period}`];
  if (!s) return { th: threshold, mn: minPrice, mx: maxPrice, cap: capFor(period >= 150), thByCrypto: null };
  const thByCrypto = {};
  for (const cr of ALL_CRYPTOS) {
    const val = s[`threshold_${cr}`];
    if (val != null) thByCrypto[cr] = val;
  }
  return {
    th         : s.threshold ?? threshold,
    mn         : s.minPrice  ?? minPrice,
    mx         : s.maxPrice  ?? maxPrice,
    cap        : s.maxTrade  ?? capFor(period >= 150),
    thByCrypto : Object.keys(thByCrypto).length ? thByCrypto : null,
  };
}

const PERIODS_5M  = [50, 55, 60, 65, 70, 75, 80, 85];
const PERIODS_15M = [150, 165, 180, 195, 210, 225, 240, 255];
const PERIODS     = [...PERIODS_5M, ...PERIODS_15M];
const ALL_CRYPTOS = ['BTC', 'ETH', 'SOL', 'XRP'];

// -cr BTC,SOL  →  simulate only those cryptos
const filterCryptoArg = arg('-cr', null);
const CRYPTOS = filterCryptoArg
  ? filterCryptoArg.split(',').map(c => c.trim().toUpperCase()).filter(c => ALL_CRYPTOS.includes(c))
  : ALL_CRYPTOS;

const LOG_DIR     = path.join(__dirname, '../logs');

// ── ANSI ──────────────────────────────────────────────────────────────────────

// ── Timezone ───────────────────────────────────────────────────────────────────
const TZ_OFFSET_MS = (parseInt(process.env.DISPLAY_UTC_OFFSET ?? '3', 10)) * 3600000;
function localTime(ms) {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

const A = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
            green:'\x1b[32m', red:'\x1b[31m', cyan:'\x1b[36m',
            grey:'\x1b[90m',  yellow:'\x1b[33m' };

const g = s => A.green  + s + A.reset;
const r = s => A.red    + s + A.reset;
const b = s => A.bold   + s + A.reset;
const d = s => A.dim    + s + A.reset;
const c = s => A.cyan   + s + A.reset;
const $ = s => A.grey   + s + A.reset;

// ── CSV reader ────────────────────────────────────────────────────────────────

const CSV_COLUMNS = ['timestamp','crypto','cycle_start','candle_size',
                     'open','high','low','close','spike_pct',
                     'yes_ask','no_ask','yes_bid','no_bid'];

function readCsv(period) {
  const fp = path.join(LOG_DIR, `t1000_candles_C${period}.csv`);
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, 'utf8').trim().split('\n');
  if (!lines.length) return [];
  const hasHeader = lines[0].trim().startsWith('timestamp');
  const headers   = hasHeader ? lines[0].split(',') : CSV_COLUMNS;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const cents     = f => (f && f.trim() ? parseFloat(f) / 100 : null);
  return dataLines
    .filter(l => l.trim())
    .map(l => {
      const v   = l.split(',');
      const row = Object.fromEntries(headers.map((h, i) => [h.trim(), v[i]]));
      return {
        cycleStart : new Date(row.cycle_start),
        crypto     : row.crypto?.trim(),
        open       : parseFloat(row.open),
        spikePct   : parseFloat(row.spike_pct),
        yesAsk     : cents(row.yes_ask),
        noAsk      : cents(row.no_ask),
      };
    })
    .filter(row => row.crypto && CRYPTOS.includes(row.crypto) && !isNaN(row.spikePct) && !isNaN(row.cycleStart));
}

// ── Signal loading (v2: no next-candle needed) ────────────────────────────────

/**
 * Load all signals for a period. Unlike v1, we don't require consecutive cycles
 * because resolution comes from Polymarket, not next.open.
 */
function loadSignals(period) {
  const rows    = readCsv(period);
  const is15m   = period >= 150;
  const durSecs = is15m ? 900 : 300;
  return rows.map(row => ({
    ts           : row.cycleStart.getTime() + period * 1000,  // snapshot time
    period,
    is15m,
    cycleStartMs : row.cycleStart.getTime(),
    durationSecs : durSecs,
    crypto       : row.crypto,
    absSpike     : Math.abs(row.spikePct),
    direction    : row.spikePct >= 0 ? 'UP' : 'DOWN',
    yesAsk       : row.yesAsk,
    noAsk        : row.noAsk,
    open         : row.open,
  }));
}

// ── PM outcome lookup helper ──────────────────────────────────────────────────

/** Returns 'UP', 'DOWN', null (not found), or undefined (not fetched). */
function pmOutcome(sig) {
  return pm.getOutcome(sig.crypto, sig.cycleStartMs, sig.durationSecs);
}

// ── isWin helper ──────────────────────────────────────────────────────────────

/**
 * Determine if a trade wins based on PM outcome.
 * Returns true/false, or null if outcome is unknown (skip trade).
 */
function resolveWin(direction, outcome) {
  if (outcome === null || outcome === undefined) return null;
  return (direction === 'UP' && outcome === 'UP') ||
         (direction === 'DOWN' && outcome === 'DOWN');
}

// ── Fast sim (no trade log — for autoscan) ────────────────────────────────────

function fastSim(signals, th, mn, mx, capUsd) {
  let balance = startBal;
  let wins = 0, losses = 0, noPm = 0;

  for (const sig of signals) {
    if (balance <= 0) break;
    if (sig.absSpike < th) continue;
    const entry = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
    if (entry == null || entry < mn || entry > mx) continue;
    const cap = capUsd ?? capFor(sig.is15m);
    if (cap === 0) continue;
    const win = resolveWin(sig.direction, pmOutcome(sig));
    if (win === null) { noPm++; continue; }
    const pos  = Math.min(Math.max(1, balance * riskPct), cap);
    const pnl  = win ? pos * (1 - entry) / entry : -pos;
    balance    = Math.max(0, balance + pnl);
    if (win) wins++; else losses++;
  }

  // Pessimistic win-rate score × threshold quality bonus.
  // wins / (total + 3) penalises small samples; thresholdBonus gives a gentle
  // preference for stronger spike thresholds (coeff=0.15, ref=0.18%):
  //   th=0.18% → ×1.000   th=0.32% → ×1.038   th=0.44% → ×1.058   th=0.80% → ×1.097
  // Weight is small enough that large WR/sample differences always dominate.
  const MIN_TRADES = 20;
  const total = wins + losses;
  const thBonus = 1 + 0.15 * Math.log10(th / 0.18);
  const score = total >= MIN_TRADES ? (wins / (total + 3)) * thBonus : -Infinity;
  return { wins, losses, total, noPm, pnl: balance - startBal, score };
}

// ── Full sim per period (with trade log) ──────────────────────────────────────

function simulatePeriod(period) {
  const signals = loadSignals(period);
  if (!signals.length) return null;

  const durationDays = signals.length > 1
    ? (signals[signals.length - 1].ts - signals[0].ts) / 86400000
    : 0;

  const p = paramsFor(period);
  let balance = startBal;
  const trades = [];
  let bust = false;

  for (const sig of signals) {
    if (bust) break;
    if (p.cap === 0) break;  // market type disabled
    const absSpike   = sig.absSpike;
    if (absSpike < (p.thByCrypto?.[sig.crypto] ?? p.th)) continue;

    const entryPrice = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
    const timeStr    = localTime(sig.cycleStartMs);

    if (entryPrice == null) {
      trades.push({ ts: sig.cycleStartMs, time: timeStr, crypto: sig.crypto, spikePct: sig.spikePct ?? (sig.direction==='UP'?sig.absSpike:-sig.absSpike),
                    direction: sig.direction, entryPrice, refPrice: sig.open, pnl: 0, balance, outcome: 'NO_LIQ' });
      continue;
    }
    if (entryPrice < p.mn || entryPrice > p.mx) {
      trades.push({ ts: sig.cycleStartMs, time: timeStr, crypto: sig.crypto, spikePct: sig.direction==='UP'?sig.absSpike:-sig.absSpike,
                    direction: sig.direction, entryPrice, refPrice: sig.open, pnl: 0, balance, outcome: 'SKIP' });
      continue;
    }

    const win = resolveWin(sig.direction, pmOutcome(sig));
    if (win === null) {
      trades.push({ ts: sig.cycleStartMs, time: timeStr, crypto: sig.crypto, spikePct: sig.direction==='UP'?sig.absSpike:-sig.absSpike,
                    direction: sig.direction, entryPrice, refPrice: sig.open, pnl: 0, balance, outcome: 'NO_PM' });
      continue;
    }

    if (balance <= 0) {
      bust = true;
      console.log(r(`\n  ⚠  C${period} BUST at ${timeStr}, stopping.\n`));
      break;
    }

    const pos = Math.min(Math.max(1, balance * riskPct), p.cap);
    const pnl = win ? pos * (1 - entryPrice) / entryPrice : -pos;
    balance   = Math.max(0, balance + pnl);
    trades.push({ ts: sig.cycleStartMs, time: timeStr, crypto: sig.crypto, spikePct: sig.direction==='UP'?sig.absSpike:-sig.absSpike,
                  direction: sig.direction, entryPrice, refPrice: sig.open, pnl,
                  balance, outcome: win ? 'WIN' : 'LOSS' });
  }

  const wins   = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  const noPm   = trades.filter(t => t.outcome === 'NO_PM').length;
  const total  = wins + losses;
  const scored = scoreStrategy(trades.filter(t => t.outcome === 'WIN' || t.outcome === 'LOSS'));
  return { period, trades, wins, losses, total, noPm, pnl: balance - startBal,
           finalBalance: balance, bust, durationDays,
           th: p.th, mn: Math.round(p.mn * 100), mx: Math.round(p.mx * 100),
           score: scored.score, ev: scored.ev, evStd: scored.evStd,
           sharpe: scored.sharpe, maxStreak: scored.maxStreak, avgEntry: scored.avgEntry };
}

// ── Unified simulation (one shared balance — one entry per market) ────────────

function simulateUnified(pmCache) {
  let allSignals = [];
  for (const period of PERIODS) allSignals = allSignals.concat(loadSignals(period));
  allSignals.sort((a, b) => a.ts - b.ts);

  let balance = startBal;
  const trades = [];
  const entered = new Set();
  let bust = false, noPm = 0;

  for (const sig of allSignals) {
    if (bust) break;
    const pSig = paramsFor(sig.period);
    if (pSig.cap === 0) continue;  // market type disabled
    const mktKey = `${sig.cycleStartMs}-${sig.crypto}-${sig.is15m ? '15m' : '5m'}`;
    if (entered.has(mktKey)) continue;
    if (sig.absSpike < (pSig.thByCrypto?.[sig.crypto] ?? pSig.th)) continue;
    const entry = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
    if (entry == null || entry < pSig.mn || entry > pSig.mx) continue;
    if (balance <= 0) { bust = true; break; }

    entered.add(mktKey);
    const win = resolveWin(sig.direction, pmOutcome(sig));
    if (win === null) { noPm++; continue; }

    const pos = Math.min(Math.max(1, balance * riskPct), pSig.cap);
    const pnl = win ? pos * (1 - entry) / entry : -pos;
    balance   = Math.max(0, balance + pnl);
    trades.push({ ts: sig.ts, period: sig.period, is15m: sig.is15m,
                  crypto: sig.crypto, direction: sig.direction,
                  spikePct: sig.direction === 'UP' ? sig.absSpike : -sig.absSpike,
                  entryPrice: entry, outcome: win ? 'WIN' : 'LOSS', pnl, balance });
  }

  const wins   = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  const durationDays = trades.length > 1
    ? (trades[trades.length - 1].ts - trades[0].ts) / 86400000 : 0;
  return { trades, wins, losses, total: wins + losses, noPm, pnl: balance - startBal,
           finalBalance: balance, bust, durationDays };
}

// ── Unified pair sim (each period uses its own optimized params) ──────────────

function simulateUnifiedPair(sigs5m, params5m, sigs15m, params15m) {
  const all = [...sigs5m, ...sigs15m].sort((a, b) => a.ts - b.ts);
  let balance = startBal;
  let wins = 0, losses = 0, trades5m = 0, trades15m = 0, noPm = 0;
  let firstTs = null, lastTs = null;
  const entered = new Set();

  for (const sig of all) {
    if (capFor(sig.is15m) === 0) continue;  // market type disabled
    const params = sig.is15m ? params15m : params5m;
    const mktKey = `${sig.cycleStartMs}-${sig.crypto}-${sig.is15m ? '15m' : '5m'}`;
    if (entered.has(mktKey)) continue;
    if (sig.absSpike < params.th) continue;
    const entry = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
    if (entry == null || entry < params.mn || entry > params.mx) continue;
    if (balance <= 0) break;

    entered.add(mktKey);
    const win = resolveWin(sig.direction, pmOutcome(sig));
    if (win === null) { noPm++; continue; }

    const pos = Math.min(Math.max(1, balance * riskPct), capFor(sig.is15m));
    const pnl = win ? pos * (1 - entry) / entry : -pos;
    balance   = Math.max(0, balance + pnl);
    if (win) wins++; else losses++;
    if (sig.is15m) trades15m++; else trades5m++;
    if (firstTs === null) firstTs = sig.ts;
    lastTs = sig.ts;
  }

  const durationDays = firstTs !== null && lastTs !== firstTs
    ? (lastTs - firstTs) / 86400000 : 0;
  return { wins, losses, total: wins + losses, trades5m, trades15m, noPm,
           pnl: balance - startBal, finalBalance: balance, durationDays };
}

// ── Scoring (90% CI lower bound of normalised EV per trade) ──────────────────

/**
 * Score a strategy from its resolved trade list.
 *
 * Normalised EV per trade (per $1 risked, independent of position size):
 *   ev_i = WIN  →  (1 - entry) / entry
 *          LOSS →  -1
 *
 * Score = EV_mean - 1.645 × std / sqrt(n)   (one-tailed 90% CI lower bound)
 *
 * Interpretation:
 *   Score > 0  →  with 90% confidence the strategy has positive edge
 *   Score < 0  →  not yet proven (too few trades or too inconsistent)
 *   All strategies get a number — no skipping. Sort descending to rank.
 */
function scoreStrategy(resolvedTrades) {
  const n = resolvedTrades.length;
  if (n === 0) return { score: -Infinity, ev: null, evStd: null, sharpe: null, maxStreak: 0, avgEntry: null, n: 0 };

  // Welford online mean/variance
  let mean = 0, m2 = 0;
  let maxStreak = 0, streak = 0;
  let entrySum = 0;

  for (let i = 0; i < n; i++) {
    const t    = resolvedTrades[i];
    const isWin = t.outcome === 'WIN' || t.status === 'WIN';
    const entry = t.entryPrice;
    const ev_i  = isWin ? (1 - entry) / entry : -1;
    const delta = ev_i - mean;
    mean += delta / (i + 1);
    m2   += delta * (ev_i - mean);
    if (!isWin) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0;
    entrySum += entry;
  }

  const evStd  = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
  const score  = mean - 1.645 * evStd / Math.sqrt(n);
  const sharpe = evStd > 0 ? mean / evStd : (mean > 0 ? 99 : 0);

  return {
    score   : parseFloat(score.toFixed(4)),
    ev      : parseFloat(mean.toFixed(4)),
    evStd   : parseFloat(evStd.toFixed(4)),
    sharpe  : parseFloat(sharpe.toFixed(2)),
    maxStreak,
    avgEntry: parseFloat((entrySum / n).toFixed(4)),
    n,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function durFmt(d) {
  if (!d || d <= 0) return '—';
  const m = Math.round(d * 1440);
  return `${Math.floor(m / 1440)}d ${String(Math.floor((m % 1440) / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
}
function getDurationDays(period) {
  const rows = readCsv(period);
  if (rows.length < 2) return 0;
  const times = rows.map(r => r.cycleStart.getTime());
  return (Math.max(...times) - Math.min(...times)) / 86400000;
}
function pnlPctStr(pnl, width = 8) {
  const pct = pnl / startBal * 100;
  const raw = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  return pct >= 0 ? g(raw.padStart(width)) : r(raw.padStart(width));
}
function projStr(pnl, dur, targetDays, width = 10) {
  if (!dur || dur <= 0) return d('—'.padStart(width));
  const proj = pnl / dur * targetDays;
  const raw  = (proj >= 0 ? '+$' : '-$') + Math.abs(proj).toFixed(0);
  return proj >= 0 ? g(raw.padStart(width)) : r(raw.padStart(width));
}

// ── Print verbose ─────────────────────────────────────────────────────────────

function printVerbose(result) {
  const { period, trades } = result;
  const resolved = trades.filter(t => t.outcome === 'WIN' || t.outcome === 'LOSS').length;
  const noPm     = trades.filter(t => t.outcome === 'NO_PM').length;
  console.log('\n' + b(c(`══ C${period} `)) +
    d(`(${resolved} PM-resolved, ${noPm} no PM, ${trades.length} total signals)`));
  console.log(d('Time             Crypto Dir       Spike%   Entry     RefPrice  Result       PnL    Balance'));
  console.log(d('─'.repeat(100)));

  for (const t of trades) {
    const spikeStr = `${t.spikePct >= 0 ? '+' : ''}${t.spikePct.toFixed(3)}%`;
    const entryStr = t.entryPrice != null ? `${(t.entryPrice * 100).toFixed(0)}¢` : '—';
    const pnlRaw   = t.outcome === 'WIN'  ? `+$${t.pnl.toFixed(2)}`
                   : t.outcome === 'LOSS' ? `-$${Math.abs(t.pnl).toFixed(2)}` : '—';
    const balRaw   = `$${t.balance.toFixed(2)}`;
    const dirStr   = t.direction === 'UP' ? g('▲ UP') : r('▼ DN');

    let outcomeStr, pnlStr, balStr;
    if      (t.outcome === 'WIN')   { outcomeStr = g(' WIN');  pnlStr = g(pnlRaw.padStart(10)); balStr = t.balance >= startBal ? g(balRaw.padStart(10)) : r(balRaw.padStart(10)); }
    else if (t.outcome === 'LOSS')  { outcomeStr = r('LOSS');  pnlStr = r(pnlRaw.padStart(10)); balStr = t.balance >= startBal ? g(balRaw.padStart(10)) : r(balRaw.padStart(10)); }
    else if (t.outcome === 'NO_PM') { outcomeStr = $('NO_PM'); pnlStr = $(pnlRaw.padStart(10)); balStr = $(balRaw.padStart(10)); }
    else                            { outcomeStr = $(' SKIP'); pnlStr = $(pnlRaw.padStart(10)); balStr = $(balRaw.padStart(10)); }

    process.stdout.write(
      t.time.padEnd(17) + t.crypto.padEnd(7) + dirStr + '  ' +
      spikeStr.padStart(8) + '  ' + entryStr.padStart(5) + '  ' +
      (t.refPrice != null ? t.refPrice.toFixed(2).padStart(10) : '—'.padStart(10)) + '  ' +
      outcomeStr + '  ' + pnlStr + '  ' + balStr + '\n'
    );
  }
  const wr     = result.total > 0 ? (result.wins / result.total * 100).toFixed(1) + '%' : '—';
  const pnlStr = result.pnl >= 0 ? g(`+$${result.pnl.toFixed(2)}`) : r(`-$${Math.abs(result.pnl).toFixed(2)}`);
  const noPmStr = result.noPm > 0 ? $(` [${result.noPm} no PM outcome]`) : '';
  console.log(d(`  → W:${result.wins}  L:${result.losses}  WR:${wr}  PnL: ${pnlStr}  Final: $${result.finalBalance.toFixed(2)}`) + noPmStr);
}

// ── Print scored ranking (all Cxx sorted by Score) ────────────────────────────

function printScoredRanking(results5m, results15m) {
  const allResults = [...results5m, ...results15m].filter(Boolean);
  if (!allResults.length) return;

  // Sort by score descending (handles -Infinity for zero-trade periods)
  allResults.sort((a, b) => {
    const sa = isFinite(a.score) ? a.score : -Infinity;
    const sb = isFinite(b.score) ? b.score : -Infinity;
    return sb - sa;
  });

  console.log('\n' + b('═══ STRATEGY RANKING — scored by 90% CI lower bound of normalised EV ══════════════════════'));
  console.log(d('  How to read: Score = EV_mean − 1.645×std/√n  (independent of position size & luck)'));
  console.log(d('  Score > 0 → confirmed edge at 90% confidence  |  Negative → insufficient data or no edge\n'));
  console.log(d('Rank  Period   Score    EV/trade  WR      Trades  Streak  AvgEntry  Sharpe'));
  console.log(d('─'.repeat(78)));

  allResults.forEach((res, i) => {
    const wr       = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
    const scoreVal = isFinite(res.score) ? res.score : null;
    const scoreRaw = scoreVal != null ? (scoreVal >= 0 ? '+' : '') + scoreVal.toFixed(3) : '—';
    const evRaw    = res.ev    != null ? (res.ev    >= 0 ? '+' : '') + res.ev.toFixed(3)    : '—';
    const entryRaw = res.avgEntry != null ? `${(res.avgEntry * 100).toFixed(0)}¢` : '—';
    const sharpeRaw = res.sharpe != null ? res.sharpe.toFixed(1) : '—';
    const streak    = res.maxStreak ?? '—';

    const scoreStr = scoreVal != null && scoreVal >= 0 ? g(scoreRaw.padStart(8)) : r(scoreRaw.padStart(8));
    const evStr    = res.ev   != null && res.ev   >= 0 ? g(evRaw.padStart(9))    : r(evRaw.padStart(9));
    const rank     = i === 0 ? A.bold + A.yellow + ' #1' + A.reset
                   : i === 1 ? A.bold + ' #2' + A.reset
                   : i === 2 ? A.bold + ' #3' + A.reset
                   : `  #${i + 1}`;

    process.stdout.write(
      ` ${rank}`.padEnd(6) +
      `C${res.period}`.padEnd(9) +
      scoreStr + '  ' + evStr + '  ' +
      wr.padStart(7) + '  ' +
      String(res.total).padStart(6) + '  ' +
      String(streak).padStart(6) + '  ' +
      entryRaw.padStart(8) + '  ' +
      sharpeRaw.padStart(6) + '\n'
    );
  });
  console.log('');
}

// ── Print summary ─────────────────────────────────────────────────────────────

function printSummary(results, title = 'SUMMARY') {
  const hasData = results.some(r => r);
  if (!hasData) { console.log(d(`\n  (no data for ${title})`)); return; }
  const sep = '═'.repeat(Math.max(4, 88 - title.length));
  console.log('\n' + b(`═══ ${title} ${sep}`));
  console.log(d('Period'.padEnd(8) + 'Trades'.padStart(7) + 'NoPM'.padStart(6) + 'Wins'.padStart(6) + 'Losses'.padStart(7) +
    'WinRate'.padStart(9) + 'PnL'.padStart(12) + 'PnL%'.padStart(9) + 'Final Bal'.padStart(11) +
    '→7d'.padStart(10) + '→30d'.padStart(11) + '  Duration'.padEnd(14)));
  console.log(d('─'.repeat(114)));

  let tW = 0, tL = 0, tP = 0, tNoPm = 0;
  for (const res of results) {
    if (!res) continue;
    const wr      = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
    const pnlRaw  = res.pnl >= 0 ? `+$${res.pnl.toFixed(2)}` : `-$${Math.abs(res.pnl).toFixed(2)}`;
    const balRaw  = `$${res.finalBalance.toFixed(0)}`;
    const pnlStr  = res.pnl >= 0 ? g(pnlRaw.padStart(12)) : r(pnlRaw.padStart(12));
    const balStr  = res.bust ? r('BUST'.padStart(11)) : (res.finalBalance >= startBal ? g(balRaw.padStart(11)) : r(balRaw.padStart(11)));
    const durStr  = d('  ' + durFmt(res.durationDays));
    const noPmStr = res.noPm > 0 ? $(String(res.noPm).padStart(6)) : ' '.repeat(6);
    process.stdout.write(
      `C${res.period}`.padEnd(8) +
      String(res.total).padStart(7) + noPmStr + String(res.wins).padStart(6) + String(res.losses).padStart(7) +
      wr.padStart(9) + '  ' + pnlStr + '  ' + pnlPctStr(res.pnl) + '  ' + balStr +
      projStr(res.pnl, res.durationDays, 7, 10) + ' ' +
      projStr(res.pnl, res.durationDays, 30, 10) + durStr + '\n'
    );
    tW += res.wins; tL += res.losses; tP += res.pnl; tNoPm += res.noPm;
  }
  console.log(d('─'.repeat(114)));
  const tT  = tW + tL;
  const tWR = tT > 0 ? (tW / tT * 100).toFixed(1) + '%' : '—';
  const tPR = tP >= 0 ? `+$${tP.toFixed(2)}` : `-$${Math.abs(tP).toFixed(2)}`;
  process.stdout.write(
    b('ALL'.padEnd(8)) + b(String(tT).padStart(7)) +
    (tNoPm > 0 ? $(String(tNoPm).padStart(6)) : ' '.repeat(6)) +
    b(String(tW).padStart(6)) + b(String(tL).padStart(7)) + b(tWR.padStart(9)) + '  ' +
    (tP >= 0 ? g(tPR.padStart(12)) : r(tPR.padStart(12))) + '\n\n'
  );
}

// ── Print unified ─────────────────────────────────────────────────────────────

function printUnified(result) {
  const title = 'UNIFIED (5-MIN + 15-MIN — one shared balance, PM-resolved)';
  const sep   = '═'.repeat(Math.max(4, 88 - title.length));
  console.log('\n' + b(`═══ ${title} ${sep}`));

  if (!result.total) {
    console.log(d('  No trades matched the current filters.\n'));
    return;
  }

  const wr     = (result.wins / result.total * 100).toFixed(1) + '%';
  const pnlRaw = result.pnl >= 0 ? `+$${result.pnl.toFixed(2)}` : `-$${Math.abs(result.pnl).toFixed(2)}`;
  const pnlStr = result.pnl >= 0 ? g(pnlRaw) : r(pnlRaw);
  const balStr = result.bust ? r('BUST') : (result.finalBalance >= startBal
    ? g(`$${result.finalBalance.toFixed(2)}`) : r(`$${result.finalBalance.toFixed(2)}`));
  const durStr = result.durationDays > 0 ? d(`  Duration: ${durFmt(result.durationDays)}`) : '';

  process.stdout.write(
    d('  Trades: ') + b(String(result.total)) +
    (result.noPm > 0 ? d('  NoPM: ') + $(String(result.noPm)) : '') +
    d('   Wins: ') + g(String(result.wins)) +
    d('   Losses: ') + r(String(result.losses)) +
    d('   WR: ') + b(wr) +
    d('   PnL: ') + pnlStr +
    d('   Final: ') + balStr + durStr + '\n'
  );
  if (result.durationDays > 0) {
    process.stdout.write(
      d('  Projected:') +
      projStr(result.pnl, result.durationDays, 7,  10) + d(' (7d)') +
      projStr(result.pnl, result.durationDays, 30, 11) + d(' (30d)\n')
    );
  }
  const t5m  = result.trades.filter(t => !t.is15m);
  const t15m = result.trades.filter(t =>  t.is15m);
  const w5m  = t5m.filter(t => t.outcome === 'WIN').length;
  const w15m = t15m.filter(t => t.outcome === 'WIN').length;
  if (t5m.length)  process.stdout.write(d(`  5-min  trades: ${t5m.length}  W:${w5m} L:${t5m.length - w5m}  WR:${t5m.length ? (w5m/t5m.length*100).toFixed(1) : 0}%\n`));
  if (t15m.length) process.stdout.write(d(`  15-min trades: ${t15m.length}  W:${w15m} L:${t15m.length - w15m}  WR:${t15m.length ? (w15m/t15m.length*100).toFixed(1) : 0}%\n`));

  if (verbose && result.trades.length) {
    console.log('');
    console.log(d('  Time             Mkt   Crypto Dir      Spike%   Entry   Outcome       PnL    Balance'));
    console.log(d('  ' + '─'.repeat(87)));
    for (const t of result.trades) {
      const timeStr  = localTime(t.ts);
      const mktStr   = t.is15m ? c('15m') : $(' 5m');
      const dirStr   = t.direction === 'UP' ? g('▲ UP') : r('▼ DN');
      const spikeStr = `${t.spikePct >= 0 ? '+' : ''}${t.spikePct.toFixed(3)}%`;
      const entryStr = `${(t.entryPrice * 100).toFixed(0)}¢`;
      const pnlRaw2  = t.outcome === 'WIN' ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`;
      const outStr   = t.outcome === 'WIN' ? g(' WIN') : r('LOSS');
      const pnlStr2  = t.outcome === 'WIN' ? g(pnlRaw2.padStart(9)) : r(pnlRaw2.padStart(9));
      const balStr2  = t.balance >= startBal ? g(`$${t.balance.toFixed(2)}`.padStart(10)) : r(`$${t.balance.toFixed(2)}`.padStart(10));
      process.stdout.write(
        '  ' + timeStr.padEnd(17) + mktStr + '  C' + String(t.period).padEnd(4) +
        t.crypto.padEnd(6) + dirStr + '  ' +
        spikeStr.padStart(8) + '  ' + entryStr.padStart(4) + '  ' +
        outStr + '  ' + pnlStr2 + '  ' + balStr2 + '\n'
      );
    }
  }
  console.log('');
}

// ── Print unified pairs table ─────────────────────────────────────────────────

function printUnifiedPairs(pairs) {
  if (!pairs.length) return;
  console.log('\n' + b('═══ BEST UNIFIED PAIRS (5-MIN × 15-MIN, PM-resolved) ══════════════════════════════════════'));
  console.log(d('5m    5m-params              15m    15m-params             Trades(5m+15m)  WinRate        PnL     PnL%       →7d      →30d    Duration'));
  console.log(d('─'.repeat(138)));
  for (const p of pairs) {
    const wr     = p.total > 0 ? (p.wins / p.total * 100).toFixed(1) + '%' : '—';
    const pnlRaw = p.pnl >= 0 ? `+$${p.pnl.toFixed(2)}` : `-$${Math.abs(p.pnl).toFixed(2)}`;
    const pnlStr = p.pnl >= 0 ? g(pnlRaw.padStart(12)) : r(pnlRaw.padStart(12));
    const tradesStr = `${p.total}(${p.trades5m}+${p.trades15m})`;
    process.stdout.write(
      `C${p.b5.period}`.padEnd(6) +
      `${p.b5.th.toFixed(2)}% ${p.b5.mn}¢–${p.b5.mx}¢`.padEnd(22) +
      `C${p.b15.period}`.padEnd(7) +
      `${p.b15.th.toFixed(2)}% ${p.b15.mn}¢–${p.b15.mx}¢`.padEnd(22) +
      tradesStr.padStart(14) + '  ' + wr.padStart(8) + '  ' + pnlStr + '  ' + pnlPctStr(p.pnl) +
      projStr(p.pnl, p.durationDays, 7, 9) + ' ' +
      projStr(p.pnl, p.durationDays, 30, 9) + d('  ' + durFmt(p.durationDays)) + '\n'
    );
  }
  console.log('');
}

// ── Autoscan section printer ──────────────────────────────────────────────────

function printAutoscanSection(bests, title) {
  if (!bests.length) return;
  const sep = '═'.repeat(Math.max(4, 85 - title.length));
  console.log('\n' + b(`═══ ${title} ${sep}`));
  console.log(d('Period  MinPrice  MaxPrice  MinSpike  Trades  NoPM  WinRate        PnL     PnL%       →7d      →30d    Duration'));
  console.log(d('─'.repeat(115)));
  for (const best of bests) {
    const dur    = getDurationDays(best.period);
    const wr     = (best.wins / best.total * 100).toFixed(1) + '%';
    const pnlRaw = best.pnl >= 0 ? `+$${best.pnl.toFixed(2)}` : `-$${Math.abs(best.pnl).toFixed(2)}`;
    const pnlStr = best.pnl >= 0 ? g(pnlRaw.padStart(12)) : r(pnlRaw.padStart(12));
    const durStr = d('  ' + durFmt(dur));
    process.stdout.write(
      `C${best.period}`.padEnd(8) +
      `${best.mn}¢`.padStart(8) + '  ' +
      `${best.mx}¢`.padStart(8) + '  ' +
      `${best.th.toFixed(2)}%`.padStart(8) + '  ' +
      String(best.total).padStart(6) + '  ' +
      (best.noPm > 0 ? $(String(best.noPm).padStart(4)) : ' '.repeat(4)) + '  ' +
      wr.padStart(8) + '  ' +
      pnlStr + '  ' + pnlPctStr(best.pnl) +
      projStr(best.pnl, dur, 7, 9) + ' ' +
      projStr(best.pnl, dur, 30, 9) + durStr + '\n'
    );
  }
}

// ── Per-crypto simulation (for ranking) ──────────────────────────────────────

/**
 * Run a simulation that tracks PnL and trade counts per crypto independently.
 * Uses a fixed position size (startBal × riskPct, capped) so EV/trade is
 * comparable across cryptos regardless of balance trajectory.
 */
function simPerCrypto(signals, th, mn, mx, capUsd, thByCrypto = null) {
  const byCrypto = {};
  for (const cr of CRYPTOS) byCrypto[cr] = { wins: 0, losses: 0, total: 0, pnl: 0 };
  const seen = new Set();

  for (const sig of signals) {
    if (sig.absSpike < (thByCrypto?.[sig.crypto] ?? th)) continue;
    const entry = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
    if (entry == null || entry < mn || entry > mx) continue;
    const cap = capUsd ?? capFor(sig.is15m);
    if (cap === 0) continue;

    // one trade per market (deduplicate by cycleStart + crypto + duration)
    const mktKey = `${sig.cycleStartMs}-${sig.crypto}-${sig.is15m ? '15m' : '5m'}`;
    if (seen.has(mktKey)) continue;
    seen.add(mktKey);

    const win = resolveWin(sig.direction, pmOutcome(sig));
    if (win === null) continue;

    const pos = Math.min(Math.max(1, startBal * riskPct), cap);
    const pnl = win ? pos * (1 - entry) / entry : -pos;
    const cr  = byCrypto[sig.crypto];
    if (!cr) continue;
    cr.total++;
    cr.pnl += pnl;
    if (win) cr.wins++; else cr.losses++;
  }
  return byCrypto;
}

function printCryptoRankingSection(label, rows) {
  if (!rows.length) return;
  const sep = '═'.repeat(Math.max(4, 76 - label.length));
  console.log('\n' + b(`═══ ${label} ${sep}`));
  console.log(d('  Rank  Crypto  Trades  WinRate      PnL   EV/Trade'));
  console.log(d('  ' + '─'.repeat(53)));
  rows.forEach((row, i) => {
    const wr     = row.total > 0 ? (row.wins / row.total * 100).toFixed(1) + '%' : '—';
    const pnlRaw = row.pnl >= 0 ? `+$${row.pnl.toFixed(2)}` : `-$${Math.abs(row.pnl).toFixed(2)}`;
    const evRaw  = row.evPerTrade >= 0
      ? `+$${row.evPerTrade.toFixed(3)}` : `-$${Math.abs(row.evPerTrade).toFixed(3)}`;
    const rank   = i === 0 ? A.bold + A.yellow + '#1' + A.reset : ` #${i + 1}`;
    const pnlStr = row.pnl >= 0 ? g(pnlRaw.padStart(9)) : r(pnlRaw.padStart(9));
    const evStr  = row.evPerTrade >= 0 ? g(evRaw.padStart(10)) : r(evRaw.padStart(10));
    process.stdout.write(
      `  ${rank}    ${row.crypto.padEnd(6)}  ${String(row.total).padStart(6)}  ${wr.padStart(7)}  ${pnlStr}  ${evStr}\n`
    );
  });
}

/**
 * Print per-crypto ranking for 5-min and 15-min markets.
 * @param {Object} sigCache  - { [period]: Signal[] }
 * @param {Object} params5m  - { th, mn, mx }
 * @param {Object} params15m - { th, mn, mx }
 */
function printCryptoRanking(sigCache, params5m, params15m) {
  let sigs5m = [], sigs15m = [];
  for (const p of PERIODS_5M)  if (sigCache[p]) sigs5m  = sigs5m.concat(sigCache[p]);
  for (const p of PERIODS_15M) if (sigCache[p]) sigs15m = sigs15m.concat(sigCache[p]);

  for (const [label, sigs, params, is15m] of [
    ['CRYPTO RANKING — 5-MIN MARKETS  (sorted by EV/trade)',  sigs5m,  params5m,  false],
    ['CRYPTO RANKING — 15-MIN MARKETS (sorted by EV/trade)', sigs15m, params15m, true],
  ]) {
    const byCrypto = simPerCrypto(sigs, params.th, params.mn, params.mx, capFor(is15m), params.thByCrypto ?? null);
    const rows = CRYPTOS
      .map(cr => ({ crypto: cr, ...byCrypto[cr], evPerTrade: byCrypto[cr].total > 0 ? byCrypto[cr].pnl / byCrypto[cr].total : -Infinity }))
      .filter(row => row.total > 0)
      .sort((a, b) => b.evPerTrade - a.evPerTrade);
    printCryptoRankingSection(label, rows);
  }
  console.log('');
}

// ── Per-crypto threshold sweep ────────────────────────────────────────────────

/**
 * Sweep threshold 0.20–0.80% independently per crypto.
 * @param {Signal[]} sigs  - signals array (may span multiple periods)
 * @param {number}   mn    - min entry price (0–1)
 * @param {number}   mx    - max entry price (0–1)
 * @param {number}   cap   - max trade cap ($)
 * @returns {{ [crypto]: { th, wins, losses, total, evPerTrade } }}
 */
function perCryptoThresholdSweep(sigs, mn, mx, cap) {
  const out = {};
  for (const crypto of CRYPTOS) {
    // Deduplicate: one signal per market cycle (keep the one with the largest spike)
    const byMarket = new Map();
    for (const s of sigs) {
      if (s.crypto !== crypto) continue;
      const key = `${s.cycleStartMs}-${s.is15m ? '15m' : '5m'}`;
      if (!byMarket.has(key) || s.absSpike > byMarket.get(key).absSpike) {
        byMarket.set(key, s);
      }
    }
    const cryptoSigs = [...byMarket.values()].sort((a, b) => a.cycleStartMs - b.cycleStartMs);

    let best = null;
    for (let thI = 16; thI <= 80; thI++) {
      const th  = thI / 100;
      const res = fastSim(cryptoSigs, th, mn, mx, cap);
      // Use same pessimistic WR score as the global autoscan (not EV/trade)
      if (res.score === -Infinity) continue;   // below MIN_TRADES
      if (!best || res.score > best.score) best = { th, ...res };
    }
    if (best) out[crypto] = best;
  }
  return out;
}

/**
 * Print per-crypto optimal threshold table for 5-min and 15-min markets.
 * Uses the best period's mn/mx as fixed price range.
 * @param {Object} sigCache    - { [period]: Signal[] }
 * @param {Array}  best5mList  - autoscan best results for 5-min periods
 * @param {Array}  best15mList - autoscan best results for 15-min periods
 */
function printPerCryptoThresholds(sigCache, best5mList, best15mList) {
  const groups = [
    { label: 'PER-CRYPTO OPTIMAL THRESHOLDS — 5-MIN MARKETS', bestList: best5mList, is15m: false },
    { label: 'PER-CRYPTO OPTIMAL THRESHOLDS — 15-MIN MARKETS', bestList: best15mList, is15m: true },
  ];

  for (const { label, bestList, is15m } of groups) {
    if (!bestList.length) continue;

    // Aggregate signals across all periods; perCryptoThresholdSweep will deduplicate
    // to one signal per market cycle (keeping the largest spike per period set).
    let allSigs = [];
    const periods = is15m ? PERIODS_15M : PERIODS_5M;
    for (const p of periods) if (sigCache[p]) allSigs = allSigs.concat(sigCache[p]);
    if (!allSigs.length) continue;

    // Use the best-PnL period's mn/mx as the fixed price range for the sweep
    const topPeriod = bestList.filter(Boolean).sort((a, b) => b.pnl - a.pnl)[0];
    if (!topPeriod) continue;
    const mn  = topPeriod.mn / 100;
    const mx  = topPeriod.mx / 100;
    const cap = capFor(is15m);

    const results = perCryptoThresholdSweep(allSigs, mn, mx, cap);
    if (!Object.keys(results).length) continue;

    const sep = '═'.repeat(Math.max(4, 80 - label.length));
    console.log('\n' + b(`═══ ${label} ${sep}`));
    console.log(d(`  Price range: ${Math.round(mn*100)}¢–${Math.round(mx*100)}¢  Cap: $${cap}`));
    console.log(d('  Crypto  Best Threshold  Trades  WinRate   EV/Trade'));
    console.log(d('  ' + '─'.repeat(50)));

    for (const crypto of CRYPTOS) {
      const row = results[crypto];
      if (!row) { process.stdout.write(`  ${crypto.padEnd(6)}  (no data)\n`); continue; }
      const wr    = row.total > 0 ? (row.wins / row.total * 100).toFixed(1) + '%' : '—';
      const evRaw = row.ev >= 0 ? `+$${row.ev.toFixed(3)}` : `-$${Math.abs(row.ev).toFixed(3)}`;
      const evStr = row.ev >= 0 ? g(evRaw.padStart(10)) : r(evRaw.padStart(10));
      process.stdout.write(
        `  ${crypto.padEnd(6)}  ${(row.th.toFixed(2) + '%').padStart(13)}  ${String(row.total).padStart(6)}  ${wr.padStart(7)}  ${evStr}\n`
      );
    }
  }
  console.log('');
}

// ── Autoscan ──────────────────────────────────────────────────────────────────

function runAutoscan(sigCache) {
  const mnRange = { from: Math.max(5,  minPriceCents),      to: 25, step: 1 };
  const mxRange = { from: 65, to: Math.min(97, maxPriceCents), step: 1 };
  const thRange = { from: 20, to: 60, step: 1 };
  const totalCombos =
    ((mnRange.to - mnRange.from) + 1) *
    ((mxRange.to - mxRange.from) + 1) *
    ((thRange.to - thRange.from) + 1);

  if (!jsonMode) {
    console.log(b('\n⚡ T1000 Autoscan  [v2.5 — Polymarket resolved]'));
    console.log(d(
      `  Balance    : $${startBal}   Risk: ${(riskPct*100).toFixed(0)}%   Cap: $${CAP_5M} (5-min) / $${CAP_15M} (15-min)\n` +
      `  Min price  : ${mnRange.from}¢ → ${mnRange.to}¢\n` +
      `  Max price  : ${mxRange.from}¢ → ${mxRange.to}¢\n` +
      `  Min spike  : ${(thRange.from/100).toFixed(2)}% → ${(thRange.to/100).toFixed(2)}%\n` +
      `  Combos/period: ${totalCombos.toLocaleString()}   Showing top ${topN}\n`
    ));
  }

  const bestPerPeriod = [];
  for (const period of PERIODS) {
    const signals = sigCache[period];
    if (!signals || signals.length === 0) {
      if (!jsonMode) console.log($(`C${period}: no data — skipping`));
      bestPerPeriod.push(null);
      continue;
    }

    const is15m = period >= 150;
    if (capFor(is15m) === 0) {
      if (!jsonMode) console.log($(`C${period}: skipped (cap=0 for ${is15m ? '15-min' : '5-min'} markets)`));
      bestPerPeriod.push(null);
      continue;
    }
    if (!jsonMode) process.stdout.write(`Scanning C${period}...`);
    const results = [];

    for (let mnC = mnRange.from; mnC <= mnRange.to; mnC++) {
      const mn = mnC / 100;
      for (let mxC = mxRange.from; mxC <= mxRange.to; mxC++) {
        if (mxC <= mnC) continue;
        const mx = mxC / 100;
        for (let thI = thRange.from; thI <= thRange.to; thI++) {
          const th  = thI / 100;
          const res = fastSim(signals, th, mn, mx, capFor(signals[0]?.is15m));
          if (res.total < 3) continue;
          results.push({ mn: mnC, mx: mxC, th, ...res });
        }
      }
    }

    // Sort by PnL (most profitable combo first). Score is only used for
    // cross-period ranking in printBestCandidates — not for per-period top-5.
    results.sort((a, b) => b.pnl - a.pnl || b.total - a.total);
    const top = results.slice(0, topN);

    if (!jsonMode) {
      process.stdout.write(` ${results.length.toLocaleString()} valid combos\n`);
      if (!top.length) { console.log($('  No valid combinations (need ≥3 trades)')); bestPerPeriod.push(null); continue; }
      console.log(b(c(`\n  C${period} — top ${top.length} by PnL`)));
      console.log(d('  Rank   MinP   MaxP   Spike   Trades  NoPM  WinRate        PnL     PnL%'));
      console.log(d('  ' + '─'.repeat(70)));
      top.forEach((res, i) => {
        const wr     = (res.wins / res.total * 100).toFixed(1) + '%';
        const pnlRaw = res.pnl >= 0 ? `+$${res.pnl.toFixed(2)}` : `-$${Math.abs(res.pnl).toFixed(2)}`;
        const pnlStr = res.pnl >= 0 ? g(pnlRaw.padStart(12)) : r(pnlRaw.padStart(12));
        const rank   = i === 0 ? A.bold + A.yellow + ' #1 ' + A.reset : `  #${i+1}`;
        process.stdout.write(
          `  ${rank}  ` +
          `${res.mn}¢`.padStart(4) + '  ' + `${res.mx}¢`.padStart(4) + '  ' +
          `${res.th.toFixed(2)}%`.padStart(6) + '  ' +
          String(res.total).padStart(7) + '  ' +
          (res.noPm > 0 ? $(String(res.noPm).padStart(4)) : ' '.repeat(4)) + '  ' +
          wr.padStart(8) + '  ' + pnlStr + '  ' + pnlPctStr(res.pnl) + '\n'
        );
      });
    } else if (!top.length) {
      bestPerPeriod.push(null);
      continue;
    }

    bestPerPeriod.push({ period, ...top[0] });
  }

  const best5m  = bestPerPeriod.filter(b => b && PERIODS_5M.includes(b.period));
  const best15m = bestPerPeriod.filter(b => b && PERIODS_15M.includes(b.period));

  if (!jsonMode) {
    printAutoscanSection(best5m,  'BEST PARAMS — 5-MIN MARKETS (C50–C85)');
    printAutoscanSection(best15m, 'BEST PARAMS — 15-MIN MARKETS (C150–C255)');
  }

  let bestPair = null;
  if (best5m.length && best15m.length) {
    if (!jsonMode) console.log(b('\n  Building unified pairs...'));
    const pairResults = [];
    for (const b5 of best5m) {
      for (const b15 of best15m) {
        const res = simulateUnifiedPair(
          sigCache[b5.period],  { th: b5.th,  mn: b5.mn  / 100, mx: b5.mx  / 100 },
          sigCache[b15.period], { th: b15.th, mn: b15.mn / 100, mx: b15.mx / 100 }
        );
        if (res.total < 3) continue;
        pairResults.push({ b5, b15, ...res });
      }
    }
    pairResults.sort((a, b) => b.pnl - a.pnl);
    if (!jsonMode) printUnifiedPairs(pairResults);
    bestPair = pairResults[0] ?? null;
  }

  if (!jsonMode) printBestCandidates(best5m, best15m, bestPair);

  return { best5m, best15m, bestPair };
}

// ── Period-PnL helpers ────────────────────────────────────────────────────────

function pnlForWindow(trades, windowMs, nowMs) {
  const cutoff = nowMs - windowMs;
  return trades
    .filter(t => t.ts != null && t.ts >= cutoff && (t.outcome === 'WIN' || t.outcome === 'LOSS'))
    .reduce((s, t) => s + t.pnl, 0);
}

function fmtDays(days) {
  const d = Math.floor(days);
  const h = Math.floor((days - d) * 24);
  const m = Math.floor(((days - d) * 24 - h) * 60);
  if (d === 0) return `${h}h${m.toString().padStart(2, '0')}m`;
  return `${d}d ${h}h${m.toString().padStart(2, '0')}m`;
}

function buildWindowLine(trades, durationDays, totalPnl = null) {
  const resolved  = trades.filter(t => t.ts != null && (t.outcome === 'WIN' || t.outcome === 'LOSS'));
  const dstr      = durationDays > 0 ? d(`  [${fmtDays(durationDays)}]`) : '';
  if (!resolved.length && totalPnl == null) return dstr;
  const nowMs     = resolved.length ? resolved[resolved.length - 1].ts : 0;
  const datasetMs = durationDays * 86400000;
  const WINDOWS   = [
    [86400000,      '24h'],
    [7  * 86400000, '7d'],
    [30 * 86400000, '30d'],
    [90 * 86400000, '3m'],
  ];
  const parts = WINDOWS.map(([ms, lbl]) => {
    let pnl;
    if (resolved.length && ms <= datasetMs * 1.05) {
      pnl = pnlForWindow(resolved, ms, nowMs);   // actual window within dataset
    } else if (totalPnl != null && datasetMs > 0) {
      pnl   = totalPnl * (ms / datasetMs);       // linear extrapolation
    } else {
      return null;
    }
    const sign = pnl >= 0 ? '+' : '';
    const str  = `${sign}$${Math.abs(pnl).toFixed(0)}`;
    return (pnl >= 0 ? g(str) : r(str)) + d(` (${lbl})`);
  }).filter(Boolean);
  return dstr + (parts.length ? d('    ') + parts.join(d('  ')) : '');
}

// ── Print best candidates ─────────────────────────────────────────────────────

function printBestCandidates(results5m, results15m, unified = null) {
  const byScore = (a, b) => (isFinite(b.score) ? b.score : -Infinity) - (isFinite(a.score) ? a.score : -Infinity) || b.pnl - a.pnl;
  const best5  = results5m .filter(Boolean).sort(byScore)[0] ?? null;
  const best15 = results15m.filter(Boolean).sort(byScore)[0] ?? null;
  if (!best5 && !best15 && !unified) return;

  console.log('\n' + b('═══ BEST CANDIDATE SUMMARY ════════════════════════════════════════════════════════════════'));

  for (const [label, res, cap] of [['5-MIN', best5, CAP_5M], ['15-MIN', best15, CAP_15M]]) {
    if (!res) { console.log(d(`  ${label}  → (no data)\n`)); continue; }
    const wr       = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
    const pnlPct   = res.pnl / startBal * 100;
    const sign     = res.pnl >= 0 ? '+' : '';
    const pnlRaw   = `${sign}$${Math.abs(res.pnl).toFixed(2)}`;
    const pctRaw   = `${sign}${pnlPct.toFixed(1)}%`;
    const finalBal = res.finalBalance ?? (startBal + res.pnl);
    const finRaw   = `$${finalBal.toFixed(2)}`;
    // autoscan results carry th/mn/mx; non-autoscan uses global params
    const thStr    = res.th !== undefined ? res.th.toFixed(2) : threshold.toFixed(2);
    const mnStr    = res.mn !== undefined ? String(res.mn)    : String(minPriceCents);
    const mxStr    = res.mx !== undefined ? String(res.mx)    : String(maxPriceCents);

    console.log(b(c(`  ${label}  →  C${res.period}`)) + (res.bust ? '  ' + r('BUST') : ''));
    console.log(d('    Init Balance  : ') + b(`$${startBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
    console.log(d('    Final Balance : ') + (finalBal >= startBal ? g(finRaw) : r(finRaw)) +
      d('  (') + (res.pnl >= 0 ? g(pctRaw) : r(pctRaw)) + d(')'));
    console.log(d('    PnL           : ') + (res.pnl >= 0 ? g(pnlRaw) : r(pnlRaw)) + buildWindowLine(res.trades ?? [], res.durationDays ?? 0, res.pnl));
    console.log(d('    Wins / Losses : ') + g(String(res.wins)) + d(' / ') + r(String(res.losses)) + d('   WR: ') + b(wr));
    if (res.noPm > 0) console.log(d('    NoPM skipped  : ') + $(String(res.noPm)));
    console.log(d('    Params        : ') +
      `spike ≥ ${thStr}%` + d('   entry ') + `${mnStr}¢–${mxStr}¢` + d('   cap ') + `$${cap}`);
    console.log('');
  }

  if (unified) {
    const wr       = unified.total > 0 ? (unified.wins / unified.total * 100).toFixed(1) + '%' : '—';
    const pnlPct   = unified.pnl / startBal * 100;
    const sign     = unified.pnl >= 0 ? '+' : '';
    const pnlRaw   = `${sign}$${Math.abs(unified.pnl).toFixed(2)}`;
    const pctRaw   = `${sign}${pnlPct.toFixed(1)}%`;
    const finalBal = unified.finalBalance ?? (startBal + unified.pnl);
    const finRaw   = `$${finalBal.toFixed(2)}`;

    const unifiedLabel = (best5 && best15)
      ? `C${best5.period} (5-min) + C${best15.period} (15-min)`
      : '5-MIN + 15-MIN combined';
    console.log(b(c(`  UNIFIED  →  ${unifiedLabel}`)) + (unified.bust ? '  ' + r('BUST') : ''));
    console.log(d('    Init Balance  : ') + b(`$${startBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
    console.log(d('    Final Balance : ') + (finalBal >= startBal ? g(finRaw) : r(finRaw)) +
      d('  (') + (unified.pnl >= 0 ? g(pctRaw) : r(pctRaw)) + d(')'));
    console.log(d('    PnL           : ') + (unified.pnl >= 0 ? g(pnlRaw) : r(pnlRaw)) + buildWindowLine(unified.trades ?? [], unified.durationDays ?? 0, unified.pnl));
    console.log(d('    Wins / Losses : ') + g(String(unified.wins)) + d(' / ') + r(String(unified.losses)) + d('   WR: ') + b(wr));
    if (unified.trades5m !== undefined || unified.trades15m !== undefined) {
      const t5 = unified.trades5m  ?? unified.trades?.filter(t => !t.is15m).length ?? '?';
      const t15 = unified.trades15m ?? unified.trades?.filter(t =>  t.is15m).length ?? '?';
      console.log(d('    Trades        : ') + `${unified.total}` + d(`  (${t5} × 5-min  +  ${t15} × 15-min)`));
    }
    if (unified.noPm > 0) console.log(d('    NoPM skipped  : ') + $(String(unified.noPm)));
    // If it's a pair result (autoscan), show per-strategy params
    if (unified.b5 && unified.b15) {
      const { b5, b15 } = unified;
      console.log(d('    5-MIN params  : ') + `C${b5.period}` + d('  spike ≥ ') + `${b5.th.toFixed(2)}%` +
        d('  entry ') + `${b5.mn}¢–${b5.mx}¢` + d('  cap ') + `$${CAP_5M}`);
      console.log(d('    15-MIN params : ') + `C${b15.period}` + d('  spike ≥ ') + `${b15.th.toFixed(2)}%` +
        d('  entry ') + `${b15.mn}¢–${b15.mx}¢` + d('  cap ') + `$${CAP_15M}`);
    } else if (liveParamsMode && best5 && best15) {
      const p5  = paramsFor(best5.period);
      const p15 = paramsFor(best15.period);
      console.log(d('    5-MIN params  : ') + `C${best5.period}` + d('  spike ≥ ') + `${p5.th.toFixed(2)}%` +
        d('  entry ') + `${Math.round(p5.mn * 100)}¢–${Math.round(p5.mx * 100)}¢` + d('  cap ') + `$${CAP_5M}`);
      console.log(d('    15-MIN params : ') + `C${best15.period}` + d('  spike ≥ ') + `${p15.th.toFixed(2)}%` +
        d('  entry ') + `${Math.round(p15.mn * 100)}¢–${Math.round(p15.mx * 100)}¢` + d('  cap ') + `$${CAP_15M}`);
    } else {
      console.log(d('    Params        : ') +
        `spike ≥ ${threshold.toFixed(2)}%` + d('  entry ') + `${minPriceCents}¢–${maxPriceCents}¢` +
        d('  5-min cap ') + `$${CAP_5M}` + d('  15-min cap ') + `$${CAP_15M}`);
    }
    console.log('');
  }
}

// ── JSON output builder (for --json mode) ─────────────────────────────────────

function buildJsonOutput(results5m, results15m, unified) {
  const byScore = (a, b) => (isFinite(b.score) ? b.score : -Infinity) - (isFinite(a.score) ? a.score : -Infinity) || b.pnl - a.pnl;
  const best5  = results5m .filter(Boolean).sort(byScore)[0] ?? null;
  const best15 = results15m.filter(Boolean).sort(byScore)[0] ?? null;

  const fmtResult = (res, cap) => {
    if (!res) return null;
    const finalBal = res.finalBalance ?? (startBal + res.pnl);
    return {
      period  : res.period,
      finalBal: parseFloat(finalBal.toFixed(2)),
      pnl     : parseFloat(res.pnl.toFixed(2)),
      pnlPct  : parseFloat((res.pnl / startBal * 100).toFixed(2)),
      wins    : res.wins,
      losses  : res.losses,
      wr      : res.total > 0 ? parseFloat((res.wins / res.total * 100).toFixed(1)) : null,
      noPm    : res.noPm ?? 0,
      score   : isFinite(res.score) ? parseFloat(res.score.toFixed(4)) : null,
      ev      : res.ev   != null ? parseFloat(res.ev.toFixed(4))   : null,
      sharpe  : res.sharpe != null ? parseFloat(res.sharpe.toFixed(2)) : null,
      th      : res.th !== undefined ? res.th : threshold,
      mn      : res.mn !== undefined ? res.mn : minPriceCents,
      mx      : res.mx !== undefined ? res.mx : maxPriceCents,
      cap,
    };
  };

  const finalBalU = unified.finalBalance ?? (startBal + unified.pnl);
  const t5m  = unified.trades5m  ?? (unified.trades?.filter(t => !t.is15m).length ?? 0);
  const t15m = unified.trades15m ?? (unified.trades?.filter(t =>  t.is15m).length ?? 0);

  return {
    ts      : new Date().toISOString(),
    v       : '2.5',
    startBal,
    best5m  : fmtResult(best5,  CAP_5M),
    best15m : fmtResult(best15, CAP_15M),
    unified : {
      finalBal : parseFloat(finalBalU.toFixed(2)),
      pnl      : parseFloat(unified.pnl.toFixed(2)),
      pnlPct   : parseFloat((unified.pnl / startBal * 100).toFixed(2)),
      wins     : unified.wins,
      losses   : unified.losses,
      wr       : unified.total > 0 ? parseFloat((unified.wins / unified.total * 100).toFixed(1)) : null,
      noPm     : unified.noPm ?? 0,
      trades5m : t5m,
      trades15m: t15m,
    },
  };
}

// ── CSV export of unified trades ─────────────────────────────────────────────

function exportUnifiedCsv(result) {
  const headers = ['time','period','type','crypto','direction','spike_pct','entry_pct','outcome','pnl','balance'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = result.trades.map(t => {
    const timeStr  = localTime(t.ts);
    const type     = t.is15m ? '15MIN' : '5MIN';
    const entryPct = t.entryPrice != null ? (t.entryPrice * 100).toFixed(0) : '';
    const spikePct = t.spikePct != null ? t.spikePct.toFixed(3) : '';
    const pnl      = t.pnl     != null ? t.pnl.toFixed(4) : '';
    const balance  = t.balance != null ? t.balance.toFixed(4) : '';
    return [timeStr, `C${t.period}`, type, t.crypto, t.direction,
            spikePct, entryPct, t.outcome, pnl, balance].map(q).join(',');
  });
  process.stdout.write(headers.join(',') + '\n' + rows.join('\n') + '\n');
}

// ── Collect all signals + PM fetch requests ───────────────────────────────────

function collectAllSignals() {
  const sigCache = {};
  const requests = [];
  for (const period of PERIODS) {
    const sigs = loadSignals(period);
    sigCache[period] = sigs;
    for (const s of sigs) {
      requests.push({ crypto: s.crypto, cycleStartMs: s.cycleStartMs, durationSecs: s.durationSecs });
    }
  }
  return { sigCache, requests };
}

// ── Main (async) ──────────────────────────────────────────────────────────────

async function main() {
  const noArgs   = argv.length === 0;
  const helpFlag = flag('-h') || flag('--help');

  if ((noArgs && !jsonMode) || helpFlag) {
    console.log(b('\n⚡ T1000 Simulator v2.5 — Polymarket-resolved outcomes\n'));
    console.log('  node simulate_t1000_v2.js [options]\n');
    console.log(b('Options:'));
    console.log([
      ['  -th <pct>    ', 'Min |spike%| threshold              ', '(default: 0.24)'],
      ['  -bl <usd>    ', 'Starting balance                    ', '(default: 1000)'],
      ['  -mn <¢>      ', 'Min CLOB entry price                ', '(default: 0)'],
      ['  -mx <¢>      ', 'Max CLOB entry price                ', '(default: 90)'],
      ['  -rk <pct>    ', '% of balance risked per trade       ', '(default: 5)'],
      ['  -cp <5m> <15m>', 'Max bet cap per market type; 0=skip', '(default: 150 500)'],
      ['  -vb          ', 'Verbose: show full trade history    ', ''],
      ['  -as          ', 'Autoscan: sweep all param combos    ', ''],
      ['  -tp <n>      ', 'Top N results shown in autoscan     ', '(default: 5)'],
      ['  -nf          ', 'No-fetch: use cached outcomes only  ', ''],
      ['  --json       ', 'Output single JSON line (for cron)  ', ''],
      ['  -csv         ', 'Output unified trades as CSV (stdout)', ''],
      ['  --live-params', 'Use each strategy\'s params from t1000-state.json', ''],
      ['  -cr <list>   ', 'Only simulate given cryptos (comma-separated)    ', '(e.g. BTC,SOL)'],
    ].map(([fl, desc, def]) => c(fl) + d(desc) + $(def)).join('\n'));
    console.log('\n' + d('  Cache: backend/cache/pm_outcomes.json'));
    const stats = pm.cacheStats();
    console.log(d(`  Cache stats: ${stats.total} entries  (${stats.found} outcomes, ${stats.notFound} not found)\n`));
    return;
  }

  // Step 1 — load all signals from CSVs
  const { sigCache, requests } = collectAllSignals();
  const silent = jsonMode || csvMode;
  if (!silent) {
    console.log(b('\n⚡ T1000 Simulator v2.5  [Polymarket-resolved outcomes]') + (liveParamsMode ? c('  [live-params]') : ''));
    const uniqueCycles = new Set(requests.map(r => `${r.crypto}_${r.cycleStartMs}_${r.durationSecs}`)).size;
    console.log(d(`  Loaded signals from ${PERIODS.length} periods  (${uniqueCycles} unique cycle/crypto combos)\n`));
  }

  // Step 2 — fetch/cache PM outcomes
  if (noFetch) {
    pm.loadCache();
    if (!silent) {
      console.log(d('  -nf flag: skipping Polymarket fetch, using cache only'));
      const stats = pm.cacheStats();
      console.log(d(`  Cache: ${stats.found} outcomes, ${stats.notFound} not found\n`));
    }
  } else {
    await pm.fetchOutcomes(requests, silent ? null : (done, total, msg) => {
      if (total === 0) { console.log(d('  ' + msg)); return; }
      process.stdout.write(`\r  ${msg.padEnd(80)}`);
    });
    if (!silent) {
      process.stdout.write('\n');
      const stats = pm.cacheStats();
      console.log(d(`  Cache after fetch: ${stats.found} outcomes, ${stats.notFound} not found\n`));
    }
  }

  // Step 3 — run simulation
  if (csvMode) {
    // Output unified trades as CSV to stdout — no other output.
    // Redirect or pipe as needed:  node simulate_t1000_v2.js -nf -csv > trades.csv
    const unified = simulateUnified();
    exportUnifiedCsv(unified);
    return;
  } else if (jsonMode) {
    // Silent autoscan — same logic as -as but no output, emits one JSON line
    const { best5m, best15m, bestPair } = runAutoscan(sigCache);
    process.stdout.write(JSON.stringify(buildJsonOutput(best5m, best15m, bestPair)) + '\n');
  } else if (autoscan) {
    const { best5m, best15m } = runAutoscan(sigCache);
    const p5  = best5m[0]  ?? null;
    const p15 = best15m[0] ?? null;
    if (p5 || p15) {
      printCryptoRanking(
        sigCache,
        p5  ? { th: p5.th,  mn: p5.mn  / 100, mx: p5.mx  / 100 }  : { th: threshold, mn: minPrice, mx: maxPrice },
        p15 ? { th: p15.th, mn: p15.mn / 100, mx: p15.mx / 100 }   : { th: threshold, mn: minPrice, mx: maxPrice }
      );
      printPerCryptoThresholds(sigCache, best5m, best15m);
    }
    // Write JSON summary so backfill_t1000.js can pick the right strategy for LIVE
    const byScore = (a, b) => (isFinite(b.score) ? b.score : -Infinity) - (isFinite(a.score) ? a.score : -Infinity) || b.pnl - a.pnl;
    const top5  = [...best5m].filter(Boolean).sort(byScore)[0] ?? null;
    const top15 = [...best15m].filter(Boolean).sort(byScore)[0] ?? null;
    // Per-period PM-resolved scores (used by backfill to override its Binance-based scores
    // so the ★ Best badge in the UI matches the simulator's recommendation)
    const scores5m  = {};
    const scores15m = {};
    for (const p of best5m.filter(Boolean))
      scores5m[`C${p.period}`]  = isFinite(p.score) ? parseFloat(p.score.toFixed(4)) : null;
    for (const p of best15m.filter(Boolean))
      scores15m[`C${p.period}`] = isFinite(p.score) ? parseFloat(p.score.toFixed(4)) : null;

    const jsonPath = path.join(LOG_DIR, 'autoscan_v2.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      updatedAt : new Date().toISOString(),
      best5m    : top5  ? { period: `C${top5.period}`,  th: top5.th,  mn: top5.mn  / 100, mx: top5.mx  / 100, score: top5.score  } : null,
      best15m   : top15 ? { period: `C${top15.period}`, th: top15.th, mn: top15.mn / 100, mx: top15.mx / 100, score: top15.score } : null,
      scores5m,
      scores15m,
    }, null, 2));
    console.log($(`\n  ✓ autoscan_v2.json written  (best 5m: C${top5?.period ?? '?'}  best 15m: C${top15?.period ?? '?'})`));
  } else {
    console.log(d(`  Threshold : ${threshold}%  |  Balance: $${startBal}  |  Entry: ${minPriceCents}¢–${maxPriceCents}¢  |  Risk: ${(riskPct*100).toFixed(0)}%\n`));

    const results5m  = [];
    const results15m = [];

    for (const [groupPeriods, groupResults, label] of [
      [PERIODS_5M,  results5m,  '5-MIN MARKETS (C50–C85)'],
      [PERIODS_15M, results15m, '15-MIN MARKETS (C150–C255)'],
    ]) {
      console.log(d(`\n── ${label} ──`));
      for (const period of groupPeriods) {
        const res = simulatePeriod(period);
        groupResults.push(res);
        if (!res) { console.log($(`C${period}: no data`)); continue; }
        if (verbose) {
          printVerbose(res);
        } else {
          const wr     = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
          const pnlStr = res.pnl >= 0 ? g(`+$${res.pnl.toFixed(2)}`) : r(`-$${Math.abs(res.pnl).toFixed(2)}`);
          const noPmStr = res.noPm > 0 ? $(`  (${res.noPm} no PM)`) : '';
          console.log(
            `  C${period}`.padEnd(8) +
            d(`  W:${res.wins}  L:${res.losses}  WR:${wr}  PnL:${pnlStr}`) + noPmStr
          );
        }
      }
    }

    printSummary(results5m,  '5-MIN MARKETS (C50–C85)  — PM resolved');
    printSummary(results15m, '15-MIN MARKETS (C150–C255)  — PM resolved');

    // Unified
    const unified = simulateUnified();
    printUnified(unified);

    printScoredRanking(results5m, results15m);
    printBestCandidates(results5m, results15m, unified);

    // Per-crypto EV ranking using current CLI params (or live params if --live-params)
    if (liveParamsMode) {
      const buildRankParams = (periods) => {
        const thByCrypto = {};
        for (const cr of ALL_CRYPTOS) {
          const vals = periods.map(pd => paramsFor(pd).thByCrypto?.[cr]).filter(v => v != null);
          if (vals.length) thByCrypto[cr] = Math.min(...vals);
        }
        const rep = paramsFor(periods[Math.floor(periods.length / 2)]);
        return { th: rep.th, mn: rep.mn, mx: rep.mx, thByCrypto: Object.keys(thByCrypto).length ? thByCrypto : null };
      };
      printCryptoRanking(sigCache, buildRankParams(PERIODS_5M), buildRankParams(PERIODS_15M));
    } else {
      printCryptoRanking(
        sigCache,
        { th: threshold, mn: minPrice, mx: maxPrice },
        { th: threshold, mn: minPrice, mx: maxPrice }
      );
    }
  }
}

main().catch(err => { console.error(r('\n  Fatal error: ' + err.message)); process.exit(1); });
