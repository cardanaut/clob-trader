#!/usr/bin/env node
'use strict';

/**
 * backfill_t1000.js
 *
 * 1. Reads all 16 period CSVs (C65–C95, C150–C225)
 * 2. Runs autoscan to find best (minSpike, minPrice, maxPrice) per period
 * 3. Replays simulator trades for each period using those params
 * 4. Builds activityLog entries with real CSV timestamps
 * 5. Writes the resulting state to logs/t1000-state.json
 * 6. All tabs enabled=true except LIVE
 *
 * Run:  node backend/scripts/backfill_t1000.js
 * Then: pm2 restart polychamp-api
 */

const fs   = require('fs');
const path = require('path');

const LOG_DIR    = path.join(__dirname, '../logs');
const STATE_FILE = path.join(__dirname, '../../logs/t1000-state.json');

const CRYPTOS      = ['BTC', 'ETH', 'SOL', 'XRP'];
const PERIODS_5M   = [65, 70, 75, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 95];
const PERIODS_15M  = [150, 157, 159, 161, 163, 165, 167, 169, 171, 173, 175, 180, 195, 210, 225];
const PERIODS      = [...PERIODS_5M, ...PERIODS_15M];
const RISK_PCT      = 0.05;
const MAX_TRADE_5M  = 150;
const MAX_TRADE_15M = 500;
const START_BAL_5M  = 4000;   // 5-min starting capital ($4 000)
const MAX_LOG       = 100;    // engine caps activityLog at 100 entries for persistence

// Per-crypto overrides for paper CXX: null = use global threshold (set per autoscan with ≥85% WR floor)
const PER_CRYPTO_5M  = { BTC: null, ETH: null, SOL: null, XRP: null };
const PER_CRYPTO_15M = { BTC: null, ETH: null, SOL: null, XRP: null };

// ── Hard cap on max entry price — applied everywhere (autoscan, V2_PARAMS, simulator JSON) ──
// Can be overridden at runtime via BACKFILL_MAX_PRICE_CAP env var (set by the UI input field).
const MAX_PRICE_CAP = process.env.BACKFILL_MAX_PRICE_CAP
  ? Math.min(0.99, Math.max(0.50, parseInt(process.env.BACKFILL_MAX_PRICE_CAP, 10) / 100))
  : 0.89;  // default 89¢ — matches engine MAX_ENTRY_PRICE

// ── Autoscan ranges (fallback only — used when V2_PARAMS not available) ───────
const MN_FROM = 5,  MN_TO = 25;                        // min price cents
const MX_FROM = 65, MX_TO = Math.round(MAX_PRICE_CAP * 100); // max price cents (capped)
const TH_FROM = 24, TH_TO = 60;   // threshold * 100 (0.24–0.60%) — minimum matches -minwr 0.85 intent
const MIN_TRADES = 3;

// V2_PARAMS removed — per-period params now read dynamically from autoscan_v2.json (params5m/params15m)
// Written by: node simulate_combined.js -nf -as

// ── CSV reader ─────────────────────────────────────────────────────────────────
const CSV_COLUMNS = ['timestamp','crypto','cycle_start','candle_size','open','high','low','close','spike_pct','yes_ask','no_ask','yes_bid','no_bid'];

function readCsv(period) {
  const fp = path.join(LOG_DIR, `t1000_candles_C${period}.csv`);
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, 'utf8').trim().split('\n');
  if (!lines.length) return [];
  const hasHeader = lines[0].trim().startsWith('timestamp');
  const headers   = hasHeader ? lines[0].split(',') : CSV_COLUMNS;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const cents = f => (f && f.trim() ? parseFloat(f) / 100 : null);
  return dataLines.filter(l => l.trim()).map(l => {
    const v   = l.split(',');
    const row = Object.fromEntries(headers.map((h, i) => [h, v[i]]));
    return {
      timestamp  : new Date(row.timestamp),
      cycleStart : new Date(row.cycle_start),
      crypto     : row.crypto,
      open       : parseFloat(row.open),
      spikePct   : parseFloat(row.spike_pct),
      yesAsk     : cents(row.yes_ask),
      noAsk      : cents(row.no_ask),
    };
  });
}

// ── Pair builder (gap-validated consecutive cycles) ───────────────────────────
function buildPairs(period) {
  const rows = readCsv(period);
  if (!rows.length) return [];

  const byCrypto = {};
  for (const cr of CRYPTOS) {
    byCrypto[cr] = rows.filter(r => r.crypto === cr).sort((a, b) => a.cycleStart - b.cycleStart);
  }
  const cycles = [...new Set(rows.map(r => r.cycleStart.getTime()))].sort((a, b) => a - b);
  const expectedGap = period >= 150 ? 900_000 : 300_000;
  const pairs = [];

  for (let ci = 0; ci < cycles.length - 1; ci++) {
    const thisMs = cycles[ci];
    const nextMs = cycles[ci + 1];
    if (nextMs - thisMs !== expectedGap) continue;
    for (const cr of CRYPTOS) {
      const candle = byCrypto[cr].find(r => r.cycleStart.getTime() === thisMs);
      const next   = byCrypto[cr].find(r => r.cycleStart.getTime() === nextMs);
      if (!candle || !next || isNaN(candle.open) || isNaN(next.open)) continue;
      pairs.push({ candle, next, cr, thisMs });
    }
  }
  return pairs;
}

// ── Fast sim for autoscan ─────────────────────────────────────────────────────
function fastSim(pairs, th, mn, mx, startBal, maxTrade) {
  let balance = startBal;
  let wins = 0, losses = 0;
  for (const { candle, next } of pairs) {
    if (balance <= 0) break;
    const absSpike = Math.abs(candle.spikePct);
    if (absSpike < th) continue;
    const dir   = candle.spikePct >= 0 ? 'UP' : 'DOWN';
    const entry = dir === 'UP' ? candle.yesAsk : candle.noAsk;
    if (entry == null || entry < mn || entry > mx) continue;
    const isWin = (dir === 'UP' && next.open > candle.open) || (dir === 'DOWN' && next.open <= candle.open);
    const pos   = Math.min(balance * RISK_PCT, maxTrade, balance);  // cap at maxTrade
    const pnl   = isWin ? pos * (1 - entry) / entry : -pos;
    balance     = Math.max(0, balance + pnl);
    if (isWin) wins++; else losses++;
  }
  return { wins, losses, total: wins + losses, pnl: balance - startBal };
}

// ── Autoscan: find best (th, mn, mx) per period ───────────────────────────────
function autoscan(period, startBal, maxTrade) {
  const pairs = buildPairs(period);
  if (!pairs.length) return null;

  let best = null;
  for (let mnC = MN_FROM; mnC <= MN_TO; mnC++) {
    const mn = mnC / 100;
    for (let mxC = MX_FROM; mxC <= MX_TO; mxC++) {
      if (mxC <= mnC) continue;
      const mx = mxC / 100;
      for (let thI = TH_FROM; thI <= TH_TO; thI++) {
        const th  = thI / 100;
        const res = fastSim(pairs, th, mn, mx, startBal, maxTrade);
        if (res.total < MIN_TRADES) continue;
        if (res.total > 0 && res.wins / res.total < 0.85) continue;  // WR floor — matches simulator -minwr 0.85
        if (!best || res.pnl > best.pnl || (res.pnl === best.pnl && res.wins / res.total > best.wins / best.total)) {
          best = { th, mn, mx, mnC, mxC, ...res };
        }
      }
    }
  }
  return best;
}

// ── Scoring (pessimistic WR = wins / (total + 3 pseudo-losses)) ───────────────
// Matches simulate_t1000_v2.js and simulate_kalshi.js so the ★ Best badges
// in the UI reflect the same ranking as the simulator autoscan output.
//   32W  0L → 32/35  = 0.914
//   51W  1L → 51/55  = 0.927  ← larger reliable sample correctly wins
function computeScore(log) {
  const n    = log.length;
  if (n === 0) return null;
  const wins = log.filter(e => e.status === 'WIN').length;
  return parseFloat((wins / (n + 3)).toFixed(4));
}

// ── Full replay: generate activityLog with real timestamps ────────────────────
function replayTrades(period, th, mn, mx, startBal, maxTrade) {
  const pairs = buildPairs(period);
  const activityLog = [];   // will be newest-first after reverse
  let balance = startBal;
  let wins = 0, losses = 0;

  for (const { candle, next, cr } of pairs) {
    if (balance <= 0) break;
    const absSpike = Math.abs(candle.spikePct);
    if (absSpike < th) continue;
    const dir   = candle.spikePct >= 0 ? 'UP' : 'DOWN';
    const entry = dir === 'UP' ? candle.yesAsk : candle.noAsk;
    if (entry == null || entry < mn || entry > mx) continue;

    const isWin = (dir === 'UP' && next.open > candle.open) || (dir === 'DOWN' && next.open <= candle.open);
    const pos   = Math.min(balance * RISK_PCT, maxTrade);
    const pnl   = isWin ? pos * (1 - entry) / entry : -pos;
    balance     = Math.max(0, balance + pnl);
    if (isWin) wins++; else losses++;

    activityLog.push({
      time       : candle.timestamp.toISOString(),
      crypto     : cr,
      candle_size: period,
      direction  : dir,
      spike_pct  : parseFloat(absSpike.toFixed(4)),
      status     : isWin ? 'WIN' : 'LOSS',
      entryPrice : parseFloat(entry.toFixed(4)),
      pnl        : parseFloat(pnl.toFixed(4)),
      finalPrice : parseFloat(next.open.toFixed(8)),
      refPrice   : parseFloat(candle.open.toFixed(8)),
    });
  }

  // Engine stores newest-first (unshift), so reverse for display order
  activityLog.reverse();

  const score = computeScore(activityLog);
  return { wins, losses, balance, score, activityLog: activityLog.slice(0, MAX_LOG) };
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n⚡ T1000 Backfill — using v2 (PM-resolved) params   [max entry price cap: ${Math.round(MAX_PRICE_CAP * 100)}¢]\n`);

const state = {};

// Read existing state so we can preserve LIVE runtime data across backfills.
// Backfill must NEVER wipe: activityLog, wins, losses, balance, baseEoaBalance,
// eoaPnlHistory, lastTrackedEoa, or baseEoaSetAt.
let existingLive = null;
try {
  const existing = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  existingLive = existing['LIVE'] ?? null;
} catch { /* first run — no existing state */ }

// On a fresh deploy (no state file) fall back to the committed live_setup.json
// so user preferences are restored automatically without manual re-entry.
let savedSetup = {};
try { savedSetup = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/live_setup.json'), 'utf8')); } catch {}
// livePrefs: existing runtime state takes priority; savedSetup is the fresh-deploy fallback.
// Runtime fields (activityLog, balance …) are absent from savedSetup → fall through to ?? defaults.
const livePrefs = existingLive ?? savedSetup?.LIVE ?? {};

// ── Run simulator to refresh autoscan JSONs before reading them ───────────────
// This ensures backfill always uses fresh per-crypto trio scores, never stale JSON.
// Skip with BACKFILL_SKIP_RESCAN=1 if you want to backfill with the last saved scan.
if (!process.env.BACKFILL_SKIP_RESCAN) {
  console.log('\n🔄 Running simulator to refresh autoscan data (-nf -as)...');
  // Build args matching the current LIVE engine config so autoscan finds the
  // optimal Cxx/threshold under the same conditions the engine actually uses.
  const liveAutoscanArgs = [];
  if (existingLive || savedSetup?.LIVE) {
    if (livePrefs?.t1Mode) liveAutoscanArgs.push('-t1');
    const mn = Math.round((livePrefs?.minPrice5m ?? 0.05) * 100);
    if (mn !== 5) liveAutoscanArgs.push('-mn', String(mn));
    if (livePrefs?.circuitBreakerEnabled && (livePrefs?.circuitBreakerMins ?? 0) > 0)
      liveAutoscanArgs.push('-cb', String(livePrefs?.circuitBreakerMins));
    const maxPos = livePrefs?.maxPositions ?? 4;
    if (maxPos !== 4) liveAutoscanArgs.push('-maxpos', String(maxPos));
    if (livePrefs?.drawdownLimitEnabled && (livePrefs?.drawdownLimitMaxLosses ?? 0) > 0
        && (livePrefs?.drawdownLimitWindowMins ?? 0) > 0) {
      const dlP = (livePrefs?.drawdownLimitPauseMins ?? 0) > 0 ? `,${livePrefs?.drawdownLimitPauseMins}` : '';
      liveAutoscanArgs.push('-dl', `${livePrefs?.drawdownLimitMaxLosses},${livePrefs?.drawdownLimitWindowMins}${dlP}`);
    }
  }
  if (liveAutoscanArgs.length) console.log('  LIVE args:', liveAutoscanArgs.join(' '));
  try {
    const { execFileSync } = require('child_process');
    execFileSync(process.execPath, ['--stack-size=65536', path.join(__dirname, 'simulate_combined.js'), '-nf', '-as', ...liveAutoscanArgs], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..'),
    });
  } catch (e) {
    console.warn('  ⚠  Simulator run failed — using last saved autoscan JSON:', e.message);
  }
} else {
  console.log('\n  (BACKFILL_SKIP_RESCAN set — using existing autoscan JSON)\n');
}

// ── Read autoscan JSON recommendations from simulators ────────────────────────
function readAutoscanJson(filename) {
  try {
    const fp = path.join(LOG_DIR, filename);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) { return null; }
}
const v2Scan     = readAutoscanJson('autoscan_v2.json');
const kalshiScan = readAutoscanJson('autoscan_kalshi.json');
const deepScan   = readAutoscanJson('deepscan_v2.json');
if (deepScan?.config) {
  console.log('  DEEPSCAN config:', JSON.stringify({
    cb: deepScan.config.circuitBreakerEnabled ? deepScan.config.circuitBreakerMins + 'min' : 'off',
    distMin5m:  deepScan.config.distMin5m,
    distMin15m: deepScan.config.distMin15m,
    pnlImprovement: deepScan.final?.pnlImprovement + '%',
  }));
}

// ── Paper CXX strategy states (uses v2Scan params5m/params15m from simulate_combined.js) ─────
for (const period of PERIODS) {
  const is15m    = period >= 150;
  const maxTrade = is15m ? MAX_TRADE_15M : MAX_TRADE_5M;
  const startBal = is15m ? maxTrade / RISK_PCT : START_BAL_5M;
  const label    = `C${period}`;

  // Use simulate_combined.js autoscan params (params5m/params15m); fall back to internal autoscan
  let best;
  const simParams = v2Scan?.[is15m ? 'params15m' : 'params5m']?.[label];
  if (simParams) {
    const p  = simParams;
    const mx = MAX_PRICE_CAP;  // autoscan mx ignored — user controls max entry price
    process.stdout.write(`  ${label.padEnd(5)} sim params: th=${p.th.toFixed(2)}% mn=${(p.mn*100).toFixed(0)}¢ mx=${(mx*100).toFixed(0)}¢ → replaying...`);
    best = { th: p.th, mn: p.mn, mx, mnC: Math.round(p.mn*100), mxC: Math.round(mx*100) };
  } else {
    process.stdout.write(`  ${label.padEnd(5)} autoscan...`);
    const scanned = autoscan(period, startBal, maxTrade);
    if (!scanned) {
      process.stdout.write(' no data — skipped\n');
      state[label] = {
        enabled: false, threshold: 0.24, minPrice: 0, maxPrice: 0.90,
        maxTrade, startBalance: startBal, balance: startBal,
        wins: 0, losses: 0, activityLog: [],
      };
      continue;
    }
    process.stdout.write(` best: th=${scanned.th.toFixed(2)}% mn=${scanned.mnC}¢ mx=${scanned.mxC}¢ → replaying...`);
    best = scanned;
  }

  const result = replayTrades(period, best.th, best.mn, best.mx, startBal, maxTrade);

  const wr = result.wins + result.losses > 0
    ? ((result.wins / (result.wins + result.losses)) * 100).toFixed(1) + '%'
    : '—';
  const scoreStr = result.score != null ? `  Score:${result.score >= 0 ? '+' : ''}${result.score.toFixed(3)}` : '';
  const negPnl   = result.balance < startBal;
  process.stdout.write(` ${result.wins + result.losses} trades  WR:${wr}  bal:$${result.balance.toFixed(0)}${scoreStr}${negPnl ? '  ⚠ negPNL→th=99' : ''}\n`);

  state[label] = {
    enabled      : true,
    threshold    : negPnl ? 99 : best.th,
    minPrice     : best.mn,
    maxPrice     : best.mx,
    maxTrade,
    startBalance : startBal,
    balance      : parseFloat(result.balance.toFixed(2)),
    wins         : result.wins,
    losses       : result.losses,
    score        : result.score,
    activityLog  : result.activityLog,
    threshold_BTC: is15m ? PER_CRYPTO_15M.BTC : PER_CRYPTO_5M.BTC,
    threshold_ETH: is15m ? PER_CRYPTO_15M.ETH : PER_CRYPTO_5M.ETH,
    threshold_SOL: is15m ? PER_CRYPTO_15M.SOL : PER_CRYPTO_5M.SOL,
    threshold_XRP: is15m ? PER_CRYPTO_15M.XRP : PER_CRYPTO_5M.XRP,
  };
}

// Override per-period scores with PM-resolved values from the simulator so the
// ★ Best badge in the UI ranks periods the same way the simulator does.
// (Binance-resolved scores and PM-resolved scores disagree because Binance resolution
//  includes all historical periods while PM resolution only covers recent ones.)
function applySimulatorScores() {
  const overrides = { ...( v2Scan?.scores5m ?? {}), ...(v2Scan?.scores15m ?? {}) };
  let n = 0;
  for (const [label, sc] of Object.entries(overrides)) {
    if (state[label] != null && sc != null) { state[label].score = sc; n++; }
  }
  if (n) console.log(`  Scores     overridden from autoscan_v2.json for ${n} periods (PM-resolved)`);
}

// Helper: pick params for LIVE strategy from simulator autoscan JSON best5m/best15m
function bestParams(scanResult, fallbackKey) {
  const cap = mx => Math.min(mx, MAX_PRICE_CAP);
  if (scanResult) return { period: scanResult.period, th: scanResult.th, mn: scanResult.mn, mx: cap(scanResult.mx) };
  return { period: fallbackKey, th: 0.22, mn: 0.05, mx: cap(0.88) };
}

// Override Binance-resolved scores with PM-resolved simulator scores
applySimulatorScores();

// Disable Cxx periods flagged as negative-PnL by autoscan pruning (set threshold=99)
{
  const disabled = [...(v2Scan?.disabled5m ?? []), ...(v2Scan?.disabled15m ?? [])];
  const found = disabled.filter(cxx => state[cxx] != null);
  for (const cxx of found) state[cxx].threshold = 99;
  if (found.length) console.log(`  Disabled   threshold=99 for negative-PnL periods: ${found.join(', ')}`);
}

// LIVE: use simulator-recommended periods; fall back to V2_PARAMS best-by-score
const live5m  = bestParams(v2Scan?.best5m,  'C85');
const live15m = bestParams(v2Scan?.best15m, 'C180');
const trio5mStr  = ['BTC','ETH','SOL','XRP'].map(c => {
  const t = v2Scan?.trio5m?.[c];
  return t ? `${c}:${t.period}:${t.th.toFixed(2)}%` : `${c}:—`;
}).join('  ');
const trio15mStr = ['BTC','ETH','SOL','XRP'].map(c => {
  const t = v2Scan?.trio15m?.[c];
  return t ? `${c}:${t.period}:${t.th.toFixed(2)}%` : `${c}:—`;
}).join('  ');
console.log(`  LIVE         5m  trios: ${trio5mStr}`);
console.log(`               15m trios: ${trio15mStr}`);

// LIVE tab — update strategy params from simulator; preserve all runtime data.
// Fields preserved from existing state (never wiped by backfill):
//   activityLog, wins, losses, balance, baseEoaBalance, baseEoaSetAt,
//   eoaPnlHistory, lastTrackedEoa, enabled, maxPrice5m, maxPrice15m, minPrice5m, minPrice15m (user preference)
state['LIVE'] = {
  // ── Strategy config (always updated by backfill) ──
  strategy5m   : live5m.period,   threshold5m  : live5m.th,   maxTrade5m  : MAX_TRADE_5M,
  strategy15m  : live15m.period,  threshold15m : live15m.th,  maxTrade15m : MAX_TRADE_15M,
  // minPrice and maxPrice are user preferences — preserve existing value if set; fall back to autoscan default
  minPrice5m   : livePrefs?.minPrice5m  ?? live5m.mn,
  maxPrice5m   : livePrefs?.maxPrice5m  ?? live5m.mx,
  minPrice15m  : livePrefs?.minPrice15m ?? live15m.mn,
  maxPrice15m  : livePrefs?.maxPrice15m ?? live15m.mx,
  strategy     : live5m.period,   // backward compat
  startBalance : 0,
  // Per-crypto 5m trios from autoscan (null = use global threshold5m / strategy5m)
  threshold5m_BTC : v2Scan?.trio5m?.BTC?.th     ?? null,
  threshold5m_ETH : v2Scan?.trio5m?.ETH?.th     ?? null,
  threshold5m_SOL : v2Scan?.trio5m?.SOL?.th     ?? null,
  threshold5m_XRP : v2Scan?.trio5m?.XRP?.th     ?? null,
  strategy5m_BTC  : v2Scan?.trio5m?.BTC?.period ?? null,
  strategy5m_ETH  : v2Scan?.trio5m?.ETH?.period ?? null,
  strategy5m_SOL  : v2Scan?.trio5m?.SOL?.period ?? null,
  strategy5m_XRP  : v2Scan?.trio5m?.XRP?.period ?? null,
  // Per-crypto 15m trios from autoscan
  threshold15m_BTC: v2Scan?.trio15m?.BTC?.th     ?? null,
  threshold15m_ETH: v2Scan?.trio15m?.ETH?.th     ?? null,
  threshold15m_SOL: v2Scan?.trio15m?.SOL?.th     ?? null,
  threshold15m_XRP: v2Scan?.trio15m?.XRP?.th     ?? null,
  strategy15m_BTC : v2Scan?.trio15m?.BTC?.period ?? null,
  strategy15m_ETH : v2Scan?.trio15m?.ETH?.period ?? null,
  strategy15m_SOL : v2Scan?.trio15m?.SOL?.period ?? null,
  strategy15m_XRP : v2Scan?.trio15m?.XRP?.period ?? null,
  // Per-crypto max entry price — null = use global maxPrice5m/15m (user preference).
  // NOTE: trio mx values are the autoscan sweep boundary, not live price caps. User controls maxPrice via UI.
  maxPrice5m_BTC  : null, maxPrice5m_ETH  : null, maxPrice5m_SOL  : null, maxPrice5m_XRP  : null,
  maxPrice15m_BTC : null, maxPrice15m_ETH : null, maxPrice15m_SOL : null, maxPrice15m_XRP : null,
  // Per-crypto per-direction min entry prices — null = fall back to global minPrice5m/15m (user preference)
  // NOTE: quartet sweep mn values are just the sweep boundary (0.05), not meaningful per-direction filters.
  // We preserve user-set overrides but do NOT auto-populate from quartet mn.
  minPrice5m_BTC_UP  : null, minPrice5m_BTC_DOWN: null,
  minPrice5m_ETH_UP  : null, minPrice5m_ETH_DOWN: null,
  minPrice5m_SOL_UP  : null, minPrice5m_SOL_DOWN: null,
  minPrice5m_XRP_UP  : null, minPrice5m_XRP_DOWN: null,
  minPrice15m_BTC_UP  : null, minPrice15m_BTC_DOWN: null,
  minPrice15m_ETH_UP  : null, minPrice15m_ETH_DOWN: null,
  minPrice15m_SOL_UP  : null, minPrice15m_SOL_DOWN: null,
  minPrice15m_XRP_UP  : null, minPrice15m_XRP_DOWN: null,
  // Per-crypto per-direction max entry prices — null = fall back to per-crypto then global
  // NOTE: quartet sweep mx values are just the sweep boundary (0.95), not meaningful per-direction caps.
  maxPrice5m_BTC_UP  : null, maxPrice5m_BTC_DOWN: null,
  maxPrice5m_ETH_UP  : null, maxPrice5m_ETH_DOWN: null,
  maxPrice5m_SOL_UP  : null, maxPrice5m_SOL_DOWN: null,
  maxPrice5m_XRP_UP  : null, maxPrice5m_XRP_DOWN: null,
  maxPrice15m_BTC_UP  : null, maxPrice15m_BTC_DOWN: null,
  maxPrice15m_ETH_UP  : null, maxPrice15m_ETH_DOWN: null,
  maxPrice15m_SOL_UP  : null, maxPrice15m_SOL_DOWN: null,
  maxPrice15m_XRP_UP  : null, maxPrice15m_XRP_DOWN: null,
  // Per-direction optimal strategy (Cxx) and threshold from quartet
  // Engine uses these when available for direction-specific signal filtering
  strategy5m_BTC_UP  : v2Scan?.quartet5m?.BTC?.UP?.period   ?? null,
  strategy5m_BTC_DOWN: v2Scan?.quartet5m?.BTC?.DOWN?.period ?? null,
  strategy5m_ETH_UP  : v2Scan?.quartet5m?.ETH?.UP?.period   ?? null,
  strategy5m_ETH_DOWN: v2Scan?.quartet5m?.ETH?.DOWN?.period ?? null,
  strategy5m_SOL_UP  : v2Scan?.quartet5m?.SOL?.UP?.period   ?? null,
  strategy5m_SOL_DOWN: v2Scan?.quartet5m?.SOL?.DOWN?.period ?? null,
  strategy5m_XRP_UP  : v2Scan?.quartet5m?.XRP?.UP?.period   ?? null,
  strategy5m_XRP_DOWN: v2Scan?.quartet5m?.XRP?.DOWN?.period ?? null,
  strategy15m_BTC_UP  : v2Scan?.quartet15m?.BTC?.UP?.period   ?? null,
  strategy15m_BTC_DOWN: v2Scan?.quartet15m?.BTC?.DOWN?.period ?? null,
  strategy15m_ETH_UP  : v2Scan?.quartet15m?.ETH?.UP?.period   ?? null,
  strategy15m_ETH_DOWN: v2Scan?.quartet15m?.ETH?.DOWN?.period ?? null,
  strategy15m_SOL_UP  : v2Scan?.quartet15m?.SOL?.UP?.period   ?? null,
  strategy15m_SOL_DOWN: v2Scan?.quartet15m?.SOL?.DOWN?.period ?? null,
  strategy15m_XRP_UP  : v2Scan?.quartet15m?.XRP?.UP?.period   ?? null,
  strategy15m_XRP_DOWN: v2Scan?.quartet15m?.XRP?.DOWN?.period ?? null,
  threshold5m_BTC_UP  : v2Scan?.quartet5m?.BTC?.UP?.th   ?? null,
  threshold5m_BTC_DOWN: v2Scan?.quartet5m?.BTC?.DOWN?.th ?? null,
  threshold5m_ETH_UP  : v2Scan?.quartet5m?.ETH?.UP?.th   ?? null,
  threshold5m_ETH_DOWN: v2Scan?.quartet5m?.ETH?.DOWN?.th ?? null,
  threshold5m_SOL_UP  : v2Scan?.quartet5m?.SOL?.UP?.th   ?? null,
  threshold5m_SOL_DOWN: v2Scan?.quartet5m?.SOL?.DOWN?.th ?? null,
  threshold5m_XRP_UP  : v2Scan?.quartet5m?.XRP?.UP?.th   ?? null,
  threshold5m_XRP_DOWN: v2Scan?.quartet5m?.XRP?.DOWN?.th ?? null,
  threshold15m_BTC_UP  : v2Scan?.quartet15m?.BTC?.UP?.th   ?? null,
  threshold15m_BTC_DOWN: v2Scan?.quartet15m?.BTC?.DOWN?.th ?? null,
  threshold15m_ETH_UP  : v2Scan?.quartet15m?.ETH?.UP?.th   ?? null,
  threshold15m_ETH_DOWN: v2Scan?.quartet15m?.ETH?.DOWN?.th ?? null,
  threshold15m_SOL_UP  : v2Scan?.quartet15m?.SOL?.UP?.th   ?? null,
  threshold15m_SOL_DOWN: v2Scan?.quartet15m?.SOL?.DOWN?.th ?? null,
  threshold15m_XRP_UP  : v2Scan?.quartet15m?.XRP?.UP?.th   ?? null,
  threshold15m_XRP_DOWN: v2Scan?.quartet15m?.XRP?.DOWN?.th ?? null,
  // Legacy single-threshold (paper panels only; null for LIVE)
  threshold_BTC : null, threshold_ETH : null, threshold_SOL : null, threshold_XRP : null,
  // ── Runtime data — preserved from existing state if available ──
  enabled        : livePrefs?.enabled        ?? false,
  balance        : livePrefs?.balance        ?? 0,
  wins           : livePrefs?.wins           ?? 0,
  losses         : livePrefs?.losses         ?? 0,
  activityLog    : livePrefs?.activityLog    ?? [],
  baseEoaBalance : livePrefs?.baseEoaBalance ?? 31.39,
  baseEoaSetAt   : livePrefs?.baseEoaSetAt   ?? null,
  eoaPnlHistory  : livePrefs?.eoaPnlHistory  ?? [],
  lastTrackedEoa : livePrefs?.lastTrackedEoa ?? null,
  // ── User preferences — preserved so backfill never overwrites manual settings ──
  maxPositions   : livePrefs?.maxPositions   ?? 2,
  recoverEnabled : livePrefs?.recoverEnabled ?? false,
  t0off          : livePrefs?.t0off          ?? false,
  // T1/TC mode: use simFlags from autoscan_v2.json if present (autoscan was run with those flags);
  // otherwise fall back to preserving the current live preference.
  t1Mode         : v2Scan?.simFlags != null ? (v2Scan.simFlags.t1Mode      === true) : (livePrefs?.t1Mode      ?? true),
  t1standalone   : v2Scan?.simFlags != null ? (v2Scan.simFlags.t1standalone === true) : (livePrefs?.t1standalone ?? false),
  skipBadSlots   : livePrefs?.skipBadSlots   ?? false,
  riskPct        : livePrefs?.riskPct        ?? null,
  fokRetryEnabled    : livePrefs?.fokRetryEnabled    ?? true,
  fokRetryDivisor    : livePrefs?.fokRetryDivisor    ?? 4,
  fokRetryMax        : livePrefs?.fokRetryMax        ?? 0,
  // CB and distMin: user preference only — never inherit from deepscan (deepscan runs with CB off for research)
  circuitBreakerEnabled  : livePrefs?.circuitBreakerEnabled  ?? true,
  circuitBreakerMins     : livePrefs?.circuitBreakerMins     ?? 90,
  distMin5m              : livePrefs?.distMin5m              ?? 0,
  distMin15m             : livePrefs?.distMin15m             ?? 0,
  drawdownLimitEnabled   : livePrefs?.drawdownLimitEnabled   ?? true,
  drawdownLimitMaxLosses : livePrefs?.drawdownLimitMaxLosses ?? 2,
  drawdownLimitWindowMins: livePrefs?.drawdownLimitWindowMins ?? 90,
  drawdownLimitPauseMins : livePrefs?.drawdownLimitPauseMins ?? 90,
  // ── Signal / filter preferences — preserved so backfill never overwrites manual settings ──
  directionFilter  : livePrefs?.directionFilter  ?? null,
  skipHours        : livePrefs?.skipHours        ?? [],
  skipDow          : livePrefs?.skipDow          ?? [],
  coordMinCryptos  : livePrefs?.coordMinCryptos  ?? 2,
  bodyPct          : livePrefs?.bodyPct          ?? 76,
  allowLowVol      : livePrefs?.allowLowVol      ?? true,
  allowPriceOor    : livePrefs?.allowPriceOor    ?? false,
  noSpikeFilter    : livePrefs?.noSpikeFilter    ?? false,
  // circuitBreakerUntil: preserve active CB timer so backfill never lets a loss slip through
  circuitBreakerUntil : livePrefs?.circuitBreakerUntil ?? null,
  // ── Stat baselines (from last stats reset) — must survive backfill ──
  pnlBaseline         : livePrefs?.pnlBaseline         ?? 0,
  winsAtReset         : livePrefs?.winsAtReset         ?? 0,
  lossesAtReset       : livePrefs?.lossesAtReset       ?? 0,
  tradeListClearedAt  : livePrefs?.tradeListClearedAt  ?? null,
  // ── Threshold locks — preserved and applied below ──
  lockedThresholds    : livePrefs?.lockedThresholds    ?? {},
  // ── Settings history — never overwritten by backfill ──
  settingsHistory     : livePrefs?.settingsHistory     ?? [],
};

// Restore locked threshold fields — backfill must NOT overwrite them
{
  const locks = state['LIVE'].lockedThresholds;
  const LOCKABLE = ['threshold5m_BTC','threshold5m_ETH','threshold5m_SOL','threshold5m_XRP',
                    'threshold15m_BTC','threshold15m_ETH','threshold15m_SOL','threshold15m_XRP'];
  for (const field of LOCKABLE) {
    if (locks[field] && livePrefs?.[field] != null) {
      state['LIVE'][field] = existingLive[field];
      console.log(`  [lock] preserved LIVE.${field} = ${existingLive[field]}`);
    }
  }
}

// LIVE_KALSHI tab — always disabled, 15-min only
// Priority: 1) Kalshi simulator JSON  2) Polymarket simulator JSON  3) backfill score ranking
const kalshi15m = bestParams(
  kalshiScan?.best15m ?? v2Scan?.best15m,   // prefer Kalshi sim, fall back to PM sim
  null
);
// If neither simulator JSON was found, fall back to best-by-score from current backfill results
if (!kalshiScan?.best15m && !v2Scan?.best15m) {
  const fallbackKey = PERIODS_15M
    .map(p => `C${p}`)
    .filter(k => state[k]?.score != null)
    .reduce((best, k) =>
      !best || (state[k].score ?? -Infinity) > (state[best].score ?? -Infinity) ? k : best,
    null) ?? 'C180';
  const fp = { th: 0.22, mn: 0.05, mx: 0.88 };  // V2_PARAMS removed — hardcoded fallback
  kalshi15m.period = fallbackKey; kalshi15m.th = fp.th; kalshi15m.mn = fp.mn; kalshi15m.mx = Math.min(fp.mx, MAX_PRICE_CAP);
}
// 99 = "disabled" marker in PER_CRYPTO_15M → translate to null (use global threshold)
const nullIf99 = v => (v == null || v === 99) ? null : v;

console.log(`  LIVE_KALSHI  best 15m: ${kalshi15m.period}  th=${kalshi15m.th.toFixed(2)}%  mn=${Math.round(kalshi15m.mn*100)}¢  mx=${Math.round(kalshi15m.mx*100)}¢  [${kalshiScan?.best15m ? 'kalshi-sim' : v2Scan?.best15m ? 'pm-sim' : 'backfill-score'}]`);

let existingKalshi = null;
try { existingKalshi = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))['LIVE_KALSHI'] ?? null; } catch {}
const kalshiPrefs = existingKalshi ?? savedSetup?.LIVE_KALSHI ?? {};

state['LIVE_KALSHI'] = {
  // ── Strategy config (always updated by backfill) ──
  strategy15m  : kalshi15m.period,
  threshold15m : kalshi15m.th,
  minPrice15m  : kalshiPrefs?.minPrice15m ?? kalshi15m.mn,
  maxPrice15m  : kalshiPrefs?.maxPrice15m ?? kalshi15m.mx,
  maxTrade15m  : MAX_TRADE_15M,
  startBalance : 0,
  threshold15m_BTC: nullIf99(PER_CRYPTO_15M.BTC),
  threshold15m_ETH: nullIf99(PER_CRYPTO_15M.ETH),
  threshold15m_SOL: nullIf99(PER_CRYPTO_15M.SOL),
  threshold15m_XRP: nullIf99(PER_CRYPTO_15M.XRP),
  // ── Runtime data — preserved from existing state if available ──
  enabled     : kalshiPrefs?.enabled     ?? false,
  balance     : kalshiPrefs?.balance     ?? 0,
  wins        : kalshiPrefs?.wins        ?? 0,
  losses      : kalshiPrefs?.losses      ?? 0,
  activityLog : kalshiPrefs?.activityLog ?? [],
};

// LIVE_MINI tab — independent sub-strategy; settings from savedSetup, runtime data preserved.
// Backfill never updates MINI's period/threshold (user-controlled); only restores them on fresh deploy.
let existingMini = null;
try { existingMini = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))['LIVE_MINI'] ?? null; } catch {}
const miniPrefs = existingMini ?? savedSetup?.LIVE_MINI ?? {};

state['LIVE_MINI'] = {
  // ── Strategy config — preserved from existing state; savedSetup restores on fresh deploy ──
  strategy5m           : miniPrefs?.strategy5m           ?? 'C85',
  threshold5m          : miniPrefs?.threshold5m          ?? 0.28,
  strategy15m          : miniPrefs?.strategy15m          ?? null,
  threshold15m         : miniPrefs?.threshold15m         ?? 0.22,
  maxPrice5m           : miniPrefs?.maxPrice5m           ?? 0.97,
  maxPrice15m          : miniPrefs?.maxPrice15m          ?? 0.97,
  maxPriceT1_5m        : miniPrefs?.maxPriceT1_5m        ?? 0.97,
  maxPriceT1_15m       : miniPrefs?.maxPriceT1_15m       ?? 0.97,
  minPrice5m           : miniPrefs?.minPrice5m           ?? 0.05,
  minPrice15m          : miniPrefs?.minPrice15m          ?? 0.05,
  riskDivisor          : miniPrefs?.riskDivisor          ?? 6,
  maxPositions         : miniPrefs?.maxPositions         ?? 2,
  t1Mode               : miniPrefs?.t1Mode               ?? true,
  circuitBreakerEnabled: miniPrefs?.circuitBreakerEnabled ?? true,
  circuitBreakerMins   : miniPrefs?.circuitBreakerMins   ?? 90,
  circuitBreakerUntil  : miniPrefs?.circuitBreakerUntil  ?? null,
  drawdownLimitEnabled : miniPrefs?.drawdownLimitEnabled ?? false,
  // ── Runtime data — always preserved from existing state ──
  enabled        : existingMini?.enabled        ?? false,
  balance        : existingMini?.balance        ?? 0,
  wins           : existingMini?.wins           ?? 0,
  losses         : existingMini?.losses         ?? 0,
  activityLog    : existingMini?.activityLog    ?? [],
  startBalance   : 0,
};

// Write state file (+ backup)
fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
const stateJson = JSON.stringify(state, null, 2);
fs.writeFileSync(STATE_FILE, stateJson);
fs.writeFileSync(STATE_FILE + '.bak', stateJson);

console.log(`\n✅ State written to ${STATE_FILE}`);
console.log('   Run: pm2 restart polychamp-api\n');
