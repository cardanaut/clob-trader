#!/usr/bin/env node
'use strict';

/**
 * T1000 Combined Simulator
 *
 * Runs both Polymarket and Kalshi backtests in one pass.
 * Supports date-range filtering via -df / -dt (dates in EAT = UTC+3).
 *
 * Usage:
 *   node simulate_combined.js [options]
 *
 * Options:
 *   -df <date>   Date From, inclusive  (EAT, e.g. "2026-02-01" or "2026-02-01 14:00")
 *   -dt <date>   Date To,   inclusive  (EAT, e.g. "2026-02-28" or "2026-02-28 23:59")
 *   -th <pct>    Min |spike%|          (default: 0.24)
 *   -thc <map>   Per-crypto thresholds for ALL periods  e.g. BTC:0.24,ETH:0.44,SOL:0.22,XRP:0.24
 *   -thc5m <map> Per-crypto thresholds for 5-min periods only (overrides -thc for 5m)
 *   -thc15m <map> Per-crypto thresholds for 15-min periods only (overrides -thc for 15m)
 *                Priority: -thc5m/-thc15m > -thc > -th; unspecified cryptos fall back to -th
 *   -bl <usd>    Starting balance      (default: 1000)
 *   -mn <¢>      Min CLOB entry price  (default: 5)
 *   -mx <¢>      Max CLOB entry price  (default: 93)
 *   -rk <pct>    % of balance risked   (default: 5)
 *   -cp <5m> [15m]  Trade caps         (default: 150 500)
 *   -cr <list>   Cryptos, e.g. BTC,SOL (default: all)
 *   -cs <list>   Candle sizes to run — e.g. 85,210 or C85,C210 (default: all)
 *                Note: -cs is incompatible with -as (autoscan needs all sizes)
 *   -triomap <map> Exact per-(crypto,Cxx) trios — preferred for LIVE validation
 *                e.g. BTC:C85:0.20,ETH:C85:0.26,SOL:C80:0.20,XRP:C85:0.22,BTC:C180:0.18,...
 *                Each crypto fires only on its specific Cxx with its own threshold.
 *                Supersedes -cs/-thc* in validation mode. Triggers unified output.
 *   -vb          Verbose trade history
 *   -sell        Enable TONE early-sell strategy (counter-spike reversion → simulate early exit)
 *   -sell-exit N Estimated PM exit price in ¢ when TONE fires (default: 35)  [-rcv / -rcv-exit are aliases]
 *   -as          Autoscan — sweep param combos (note: does NOT write autoscan*.json when date-filtered)
 *   -nf          No-fetch: use pm_outcomes cache only
 *   -tp <n>      Top N results in autoscan (default: 5)
 *   -maxpos <n>  Max concurrent open positions (default: 4, max: 8)
 *   -day <n>     Extra projection column for N days (e.g. -day 26)
 *
 * Examples:
 *   node simulate_combined.js -nf
 *   node simulate_combined.js -df 2026-02-15 -dt 2026-02-28 -nf
 *   node simulate_combined.js -df "2026-02-15 08:00" -dt "2026-02-28 20:00" -nf -vb
 *   node simulate_combined.js -nf -as
 *   node simulate_combined.js -nf -vb -triomap BTC:C85:0.20,ETH:C85:0.26,SOL:C80:0.20,XRP:C85:0.22,BTC:C180:0.18,ETH:C240:0.22,SOL:C165:0.22,XRP:C225:0.29 -df 2026-03-01
 */

const fs   = require('fs');
const path = require('path');
const pm   = require('./pm-outcomes');

// ── CLI ────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf(n); return (i !== -1 && argv[i+1] !== undefined) ? argv[i+1] : d; };
const flag = n => argv.includes(n);

function printHelp() {
  const b = s => `\x1b[1m${s}\x1b[0m`;
  const c = s => `\x1b[36m${s}\x1b[0m`;
  const d = s => `\x1b[90m${s}\x1b[0m`;
  const y = s => `\x1b[33m${s}\x1b[0m`;
  console.log(`
${b('T1000 Combined Simulator')}
${d('Runs Polymarket + Kalshi backtests in one pass.')}

${b('USAGE')}
  ${c('node simulate_combined.js')} [options]

${b('DATE FILTER')}
  ${y('-df')} <date>     Date From, inclusive  ${d('(EAT = UTC+3, e.g. "2026-02-01" or "2026-02-01 14:00")')}
  ${y('-dt')} <date>     Date To,   inclusive  ${d('(EAT = UTC+3, e.g. "2026-02-28" or "2026-02-28 23:59")')}

${b('THRESHOLDS')}
  ${y('-th')}  <pct>     Global min |spike%|                   ${d('(default: 0.24)')}
  ${y('-thc')} <map>     Per-crypto thresholds for ALL periods  ${d('e.g. BTC:0.24,ETH:0.44,SOL:0.22,XRP:0.24')}
  ${y('-thc5m')}  <map>  Per-crypto thresholds for 5-min only  ${d('(overrides -thc for 5m)')}
  ${y('-thc15m')} <map>  Per-crypto thresholds for 15-min only ${d('(overrides -thc for 15m)')}
  ${d('Priority: -thc5m/-thc15m > -thc > -th; unspecified cryptos fall back to -th')}
  ${y('-triomap')} <map> Exact per-(crypto,Cxx) trios — mirrors LIVE engine config ${d('(preferred for validation)')}
  ${d('              e.g. BTC:C85:0.20,ETH:C85:0.26,SOL:C80:0.20,XRP:C85:0.22,BTC:C180:0.18,...')}
  ${d('              Each crypto fires only on its specific candle size with its specific threshold.')}

${b('SIMULATION')}
  ${y('-bl')} <usd>      Starting balance       ${d('(default: 1000)')}
  ${y('-mn')} <¢>        Min CLOB entry price   ${d('(default: 5)')}
  ${y('-mx')} <¢>        Max CLOB entry price   ${d('(default: 93)')}
  ${y('-rk')} <pct>      % of balance risked    ${d('(default: 5)')}
  ${y('-cp')} <5m> [15m] Trade caps             ${d('(default: 150 500)')}
  ${y('-cr')} <list>     Cryptos to include     ${d('e.g. BTC,SOL  (default: all)')}
  ${y('-cs')} <list>     Candle sizes to run    ${d('e.g. 85,210 or C85,C210  (default: all)')}
  ${d('                Note: -cs is incompatible with -as')}

${b('OUTPUT')}
  ${y('-vb')}             Verbose trade-by-trade history
  ${y('-as')}             Autoscan — sweep all param combos
  ${y('-nf')}             No-fetch: use pm_outcomes cache only ${d('(recommended)')}
  ${y('-tp')} <n>         Top N results in autoscan            ${d('(default: 5)')}
  ${y('-kal')}            Include Kalshi section               ${d('(off by default — Kalshi not yet activated)')}
  ${y('-polmax')} <list>  PM max per crypto BTC,ETH,SOL,XRP     ${d('(default: 500,100,50,50)')}
  ${y('-kalmax')} <list>  Kalshi max per crypto BTC,ETH,SOL,XRP ${d('(default: 1500,300,100,100)')}
  ${y('-maxpos')} <n>     Max concurrent open positions        ${d('(default: 4, max: 8)')}
  ${y('-body')} <n>       Min candle body % of total range     ${d('(default: 76, set 0 to disable)')}
  ${y('-minwr')} <pct>   Autoscan: min raw WR floor           ${d('(default: 0.85 — rejects low-WR combos)')}
  ${y('-minth')} <pct>   Autoscan: min spike threshold        ${d('(default: 0.24 — never picks thresholds below this)')}
  ${y('-t1')}            T+1 candle secondary entry           ${d('(TC cumulative only by default — Tier 2 disabled; use -t1both to re-enable Tier 2)')}
  ${y('-t1tc')}          TC cumulative only (Tier 3 only)     ${d('(alias for -t1 — kept for backwards compat)')}
  ${y('-t1both')}        Re-enable Tier 2 (T+1 standalone)   ${d('(research only: T1 WR=81.8% ≤ EV break-even; -t1 defaults to TC-only now)')}
  ${y('-t1body')} <n>   Separate body% floor for T1/TC       ${d('(default = same as -body=76; set lower e.g. 50 or 0 to allow weaker T1 candles)')}
  ${y('-mnt1')} <¢>     Min price for T+1/TC entries         ${d('(default 85¢ — 75-85¢ bucket = 50% WR; ≥85¢ = 91.9% WR)')}
  ${y('-t1adj')} <¢>    Add N¢ to T+1 entry price            ${d('(default 10¢ — market moved a full candle; override with e.g. -t1adj 15)')}
  ${y('-mxt1')} <¢>     Max price for T+1 entries only       ${d('(e.g. 82 = 82¢ cap on T+1; default = same as -mx; use to prevent high-price T+1 traps)')}
  ${y('-slip')} <¢>     Entry slippage on all T+0 orders     ${d('(default 2¢ — models CLOB FOK execution vs signal price)')}
  ${y('-t2')}            T+2 candle tertiary entry            ${d('(if T+0+T+1 missed: continuation — T+2 close > T+1 close for UP)')}
  ${y('-t2adj')} <¢>    Add N¢ to T+2 entry price            ${d('(simulate CLOB repricing at T+3; e.g. -t2adj 20 = +20¢)')}
  ${y('-day')} <n>        Extra projection column for N days   ${d('(e.g. -day 26)')}
  ${y('-cb')} <min>       Circuit breaker: skip N min after each LOSS ${d('(e.g. -cb 90; 0=off)')}
  ${y('-dl')} <N,W[,P]>  Drawdown limit: pause if N losses in W min window, then pause P min ${d('(e.g. -dl 2,90,90; P defaults to W)')}
  ${y('-vol')} <ratio>   Min spike vol vs 14-period avg       ${d('(e.g. 1.0 = must exceed 14-period avg volume; 0=off; loads Binance 1m cache)')}
  ${y('-oor')}           Allow T+1 OOR: bypass T+1 price cap  ${d('(include entries above maxPriceT1; sets mxt1=null → T+1 uses regular maxPrice; historical: 96% WR, avg 95¢, EV +$0.68/tr — marginal)')}
  ${y('-distmin5m')}  <pct> Min cumulative dist% (T+0 open→entry close) for 5m signals  ${d('(0=off; applied at T0/T1/TC/T2)')}
  ${y('-distmin15m')} <pct> Min cumulative dist% (T+0 open→entry close) for 15m signals ${d('(0=off; applied at T0/T1/TC/T2)')}
  ${y('-distdrop')} <pct>  Max revenue drop allowed in autoscan distmin sweep           ${d('(default: 10 = −10% vs no-distmin baseline; 0 = no constraint)')}

${b('EXAMPLES')}
  ${d('# Full run, no network')}
  ${c('node simulate_combined.js -nf')}

  ${d('# Filter to last 2 weeks, verbose')}
  ${c('node simulate_combined.js -df 2026-02-15 -dt 2026-02-28 -nf -vb')}

  ${d('# Autoscan sweep')}
  ${c('node simulate_combined.js -nf -as')}

  ${d('# Validate exact LIVE config — triomap mirrors per-crypto (candle_size, threshold) trios')}
  ${c('node simulate_combined.js -nf -vb -triomap BTC:C85:0.20,ETH:C85:0.26,SOL:C80:0.20,XRP:C85:0.22,BTC:C180:0.18,ETH:C240:0.22,SOL:C165:0.22,XRP:C225:0.29 -df 2026-03-01')}
`);
  process.exit(0);
}

if (argv.length === 0 || flag('-h') || flag('--help')) printHelp();

const globalTh     = parseFloat(arg('-th', '0.24'));
const startBal      = parseFloat(arg('-bl', '1000'));
const numBots       = parseInt(arg('--bots', '1'));
const botBalancesArg = arg('--bot-balances', null);  // "1000,2000,500" — custom per-bot starting balances
let botStartBals;
if (numBots <= 1) {
  botStartBals = [startBal];
} else if (botBalancesArg) {
  const parsed = botBalancesArg.split(',').map(Number);
  botStartBals = Array.from({ length: numBots }, (_, i) => parsed[i] ?? startBal);
} else {
  botStartBals = Array.from({ length: numBots }, () => startBal);
}
const minCents     = parseFloat(arg('-mn', '5'));
const maxCents     = parseFloat(arg('-mx', '89'));
const riskPct      = parseFloat(arg('-rk', '5')) / 100;
const minWR        = parseFloat(arg('-minwr', '0.85'));  // autoscan: reject any (period,th) combo with raw WR below this
const minTh        = parseFloat(arg('-minth', '0.24')); // autoscan: minimum spike threshold to sweep (0.18 to disable floor)
// -t1 now defaults to TC-only (Tier 3). Use -t1both to re-enable Tier 2 (T+1 standalone spike).
// Analysis: T1 WR=81.8% ≤ EV break-even; TC WR=91.9% (with ≥85¢ floor). T1 also arms CB more.
const t1tcBoth     = flag('-t1both') || flag('-t1tcf'); // re-enable Tier 2 (T+1 standalone) alongside TC (research only)
const t1tcOnly     = flag('-t1tc') || !t1tcBoth; // TC-only by default; -t1both/-t1tcf overrides
const t1tcFirst    = flag('-t1tcf'); // TC-first ordering: check TC before T1 (T1 fires only when TC can't)
const t1Mode5m     = flag('-t15m');  // TC for 5m signals only (V2+ per-timeframe)
const t1Mode15m    = flag('-t115m'); // TC for 15m signals only (V2+ per-timeframe)
let   t1Mode       = flag('-t1') || flag('-t1tc') || t1tcBoth || t1Mode5m || t1Mode15m;
const t0Off        = flag('-t0off'); // skip T+0 direct entries (T1/TC can still fire for all qualifying cycles)
const t1Off        = flag('-t1off'); // skip T+1 standalone entries (TC still fires if -t1 is active)
const tcOff        = flag('-tcoff'); // skip TC cumulative entries
const noThreshold  = flag('-nth');   // skip spike threshold check entirely (all spike sizes qualify)
const t1Adj        = parseFloat(arg('-t1adj', t1Mode ? '10' : '0')) / 100;  // default 10¢ when -t1 active: market moved a full candle
// TC min entry price floor: 75-85¢ bucket = 50% WR; ≥85¢ = 91.9% WR (applied after t1Adj)
const mnt1         = t1Mode ? parseFloat(arg('-mnt1', '85')) / 100 : 0;
const slip         = parseFloat(arg('-slip', '2')) / 100;   // default 2¢: CLOB FOK execution slippage on all T+0 entries
const t2Mode       = flag('-t2');  // enable T+2 candle tertiary entry (continuation: T+2 close > T+1 close for UP)
const t2Adj        = parseFloat(arg('-t2adj', '0')) / 100;  // ¢ added to T+2 entry to simulate CLOB repricing at T+3
const verbose      = flag('-vb');
const autoscan     = flag('-as');
const noFetch      = flag('-nf');
const kalMode      = flag('-kal');   // include Kalshi section (off by default — not yet activated)
// -sell / -rcv: enable TONE early-sell strategy (counter-spike reversion → simulate early exit)
// -sell-exit / -rcv-exit N: estimated PM exit price in ¢ when TONE fires (default 35)
const recoverMode  = flag('-sell') || flag('-rcv');
const recoverExit  = parseFloat(arg('-sell-exit', arg('-rcv-exit', '35'))) / 100;  // as fraction (0.35)
// TC-only mode: allow entries up to 97¢ (TC ≥95¢ = 100% WR; old 89¢ cap was for T1 which is now off).
// Still overrideable with -mxt1.
const mxt1Cents    = arg('-mxt1', null) != null ? parseFloat(arg('-mxt1', null)) : (t1Mode ? 97 : null);
let   mxt1         = mxt1Cents != null ? mxt1Cents / 100 : null; // null = same cap as T+0
if (flag('-oor')) mxt1 = null; // -oor: bypass T+1 price cap → T+1 entries allowed up to regular maxPrice (allowPriceOor equivalent)
// T1 standalone max price cap: T1 WR≈81.8% → EV=0 at 81.8¢ → cap at 79¢ for margin.
// Only meaningful in -t1both mode (TC-only mode has no T1 standalone entries).
const mxt1StCents = arg('-mxt1st', null) != null ? parseFloat(arg('-mxt1st', null)) : (!t1tcOnly ? 79 : null);
const mxt1St      = mxt1StCents != null ? mxt1StCents / 100 : null; // null = use T+0 maxPrice cap
const volMin       = parseFloat(arg('-vol', '0'));  // 0 = disabled; global fallback
// Per-crypto vol min overrides — all default to 0 (disabled) unless explicitly passed.
// UI suggested values (BTC=1.0, SOL=1.0, ETH=0, XRP=0) only sent when checkbox is checked.
const volMinPerCrypto = {
  BTC: arg('-vol-BTC', null) != null ? parseFloat(arg('-vol-BTC', null)) : volMin,
  ETH: arg('-vol-ETH', null) != null ? parseFloat(arg('-vol-ETH', null)) : volMin,
  SOL: arg('-vol-SOL', null) != null ? parseFloat(arg('-vol-SOL', null)) : volMin,
  XRP: arg('-vol-XRP', null) != null ? parseFloat(arg('-vol-XRP', null)) : volMin,
};
// vol filter active if any crypto has a non-zero min
const anyVolFilter = Object.values(volMinPerCrypto).some(v => v > 0);
function effectiveVolMin(crypto) { return volMinPerCrypto[crypto] ?? 0; }

// Per-crypto max trade caps (BTC, ETH, SOL, XRP order)
// All caps unified at $150 to match LIVE engine (updated 2026-03-20)
const DEFAULT_POLMAX    = { BTC: 150, ETH: 150, SOL: 150, XRP: 150 };
const DEFAULT_POLMAX15M = { BTC: 150, ETH: 150, SOL: 150, XRP: 150 };
const DEFAULT_KALMAX    = { BTC: 1000, ETH: 500, SOL: 200, XRP: 150  };
function parseCapsArg(argName, defaults) {
  const val = arg(argName, null);
  if (val === null) return defaults;
  const parts = val.split(',').map(s => parseFloat(s.trim()));
  return { BTC: isFinite(parts[0]) ? parts[0] : defaults.BTC,
           ETH: isFinite(parts[1]) ? parts[1] : defaults.ETH,
           SOL: isFinite(parts[2]) ? parts[2] : defaults.SOL,
           XRP: isFinite(parts[3]) ? parts[3] : defaults.XRP };
}
const polMaxByCrypto    = parseCapsArg('-polmax',    DEFAULT_POLMAX);    // PM 5m caps per crypto
const polMaxByCrypto15m = parseCapsArg('-polmax15m', DEFAULT_POLMAX15M); // PM 15m caps per crypto
const kalMaxByCrypto    = parseCapsArg('-kalmax',    DEFAULT_KALMAX);    // Kalshi caps per crypto
const topN         = parseInt(arg('-tp', '5'), 10);
// -wr <path>: write autoscan results to this path even when a date filter is active.
// Used by the "Score 7d" feature to save date-filtered results without overwriting all-time JSON.
const writeResultPath = arg('-wr', null);
// -maxpos N: max concurrent open positions (default 4, max 8) — mirrors LIVE engine cap
let   maxPos       = Math.min(8, Math.max(1, parseInt(arg('-maxpos', '4'), 10)));
// -body N: min candle body % of total range (default 76, set 0 to disable)
let   bodyMinPct   = Math.max(0, parseFloat(arg('-body', '76')));
// -t1body N: separate body% for T1/TC entries (default = same as -body; set lower to allow weaker T1 candles)
const t1BodyMinPct = arg('-t1body', null) != null ? Math.max(0, parseFloat(arg('-t1body', null))) : bodyMinPct;
// -day N: extra projection column for N days (e.g. -day 26)
const customDay    = arg('-day', null) != null ? parseFloat(arg('-day', null)) : null;
// -json-out <path>: write structured JSON result to path (used by simulator API route)
const jsonOutPath  = arg('-json-out', null);
// -cb <minutes>: circuit breaker — after any resolved LOSS, skip new entries for N min
// (measured from the loss resolution time, i.e. cycle end + cbMs)
const cbMins = arg('-cb', null) != null ? parseFloat(arg('-cb', null)) : 0;
let   cbMs   = cbMins > 0 ? cbMins * 60_000 : 0;
// -dl <N,W[,P]>: drawdown limit — pause if N losses in W minutes window, then pause P min
// e.g. -dl 2,90,90 = after 2 losses in 90min → pause 90min from most-recent loss; P defaults to W
const _dlArg = arg('-dl', null);
let dlMaxLosses = 0, dlWindowMs = 0, dlPauseMs = 0;
if (_dlArg) {
  const [_n, _w, _p] = _dlArg.split(',').map(parseFloat);
  dlMaxLosses = (_n >= 1 ? _n : 2);
  dlWindowMs  = (_w > 0 ? _w : 90) * 60_000;
  dlPauseMs   = (_p > 0 ? _p : (_w > 0 ? _w : 90)) * 60_000;
}

// -exhaust5m / -exhaust15m: skip signal if same-dir 5-min pre-move > threshold before cycle
// -coord N: require ≥N cryptos spiking same direction same cycle (0=off, replaces -corr)
const exhaust5m   = arg('-exhaust5m',  null) != null ? parseFloat(arg('-exhaust5m',  null)) : 0;
const exhaust15m  = arg('-exhaust15m', null) != null ? parseFloat(arg('-exhaust15m', null)) : 0;
const coordMin    = Math.max(0, parseInt(arg('-coord', '0'), 10));
// -dir <both|down|up>: only process signals in this direction (default: both)
const dirFilter   = (arg('-dir', 'both') || 'both').toUpperCase();  // 'BOTH' | 'DOWN' | 'UP'
// -skip-hours <0,12>: comma-separated UTC hours to exclude (e.g. -skip-hours 0,12)
// -skip-dow <0>: comma-separated days of week to exclude (0=Sun, 6=Sat)
const skipHoursSet = new Set((arg('-skip-hours', '') || '').split(',').map(Number).filter(n => !isNaN(n) && n >= 0));
const skipDowSet   = new Set((arg('-skip-dow', '')   || '').split(',').map(Number).filter(n => !isNaN(n) && n >= 0));
// -distmin5m / -distmin15m: min cumulative Binance dist% from T+0 open to entry candle close,
// measured in the trade direction. Applied at T+0, T+1, TC, and T+2 entry points.
// 0 = disabled (default).
let   distMin5m  = parseFloat(arg('-distmin5m',  '0'));
let   distMin15m = parseFloat(arg('-distmin15m', '0'));
// -prevvol <pct>: min prior-cycle Binance high-low range (%). Skip signal if the cycle
// immediately before this one was dead-flat — GARCH clustering: real momentum follows volatility.
// 0 = disabled (default). Typical test values: 0.10–0.30%.
let   prevVolMin = parseFloat(arg('-prevvol', '0'));
// Max revenue drop allowed when picking best distmin in autoscan sweep (default 10%).
// Distmin values that reduce compound PnL by more than this vs baseline are excluded.
const distDrop   = parseFloat(arg('-distdrop', '10')) / 100;

// -ds / -ds-fine / -ds-thorough / -ds-ext / -ds-ultra: DEEPSCAN mode
// -ds-thorough: coordinate ascent — re-runs greedy sweep when best period shifts (up to 3 iters)
// -ds-ext:   extended grids (CB up to 360min, DL wider windows) + coordinate ascent
// -ds-ultra: exhaustive grids (CB up to 480min, all dims maximally expanded) + coordinate ascent (~8min)
const dsUltra    = flag('-ds-ultra');
const dsExtended = flag('-ds-ext')   || dsUltra;
const dsThorough = flag('-ds-thorough') || dsExtended;
const dsFine     = flag('-ds-fine') || dsThorough;  // thorough/ext/ultra use fine grids
const dsMode     = flag('-ds') || flag('-ds-fine') || dsThorough;

// ── DEEPSCAN helper: temporarily override module-level sim options ─────────────
// All mutable globals are restored (via finally) even if fn() throws.
function withOpts(opts, fn) {
  const saved = { cbMs, t1Mode, bodyMinPct, distMin5m, distMin15m,
                  dlMaxLosses, dlWindowMs, dlPauseMs, maxPos, mxt1, prevVolMin };
  if (opts.cbMs        !== undefined) cbMs        = opts.cbMs;
  if (opts.t1Mode      !== undefined) t1Mode      = opts.t1Mode;
  if (opts.bodyMinPct  !== undefined) bodyMinPct  = opts.bodyMinPct;
  if (opts.distMin5m   !== undefined) distMin5m   = opts.distMin5m;
  if (opts.distMin15m  !== undefined) distMin15m  = opts.distMin15m;
  if (opts.dlMaxLosses !== undefined) {
    dlMaxLosses = opts.dlMaxLosses;
    dlWindowMs  = opts.dlWindowMs  ?? 0;
    dlPauseMs   = opts.dlPauseMs   ?? 0;
  }
  if (opts.maxPos      !== undefined) maxPos      = opts.maxPos;
  if (opts.mxt1        !== undefined) mxt1        = opts.mxt1;
  if (opts.prevVolMin  !== undefined) prevVolMin  = opts.prevVolMin;
  try { return fn(); } finally {
    cbMs = saved.cbMs; t1Mode = saved.t1Mode; bodyMinPct = saved.bodyMinPct;
    distMin5m = saved.distMin5m; distMin15m = saved.distMin15m;
    dlMaxLosses = saved.dlMaxLosses; dlWindowMs = saved.dlWindowMs; dlPauseMs = saved.dlPauseMs;
    maxPos = saved.maxPos; mxt1 = saved.mxt1; prevVolMin = saved.prevVolMin;
  }
}

// Parse a threshold map string like "BTC:0.24,ETH:0.44,SOL:0.22,XRP:0.24"
function parseThMap(s) {
  const m = {};
  if (!s) return m;
  for (const pair of s.split(',')) {
    const [cr, val] = pair.split(':');
    if (cr && val) m[cr.trim().toUpperCase()] = parseFloat(val);
  }
  return m;
}

// Locked per-crypto thresholds for autoscan trio sweep (fix instead of sweep)
const lockTh5m  = parseThMap(arg('-lockth5m',  null));
const lockTh15m = parseThMap(arg('-lockth15m', null));

// -thc  — per-crypto threshold (applies to all periods; falls back to -th)
// -thc5m — per-crypto threshold for 5-min periods only
// -thc15m — per-crypto threshold for 15-min periods only
const perCryptoTh    = parseThMap(arg('-thc',   null));
const perCryptoTh5m  = parseThMap(arg('-thc5m', null));
const perCryptoTh15m = parseThMap(arg('-thc15m', null));

// -triomap CRYPTO:CXX:THRESHOLD,...
// Exact per-(crypto, candle_size) threshold trios — mirrors the LIVE engine's per-crypto config.
// Each entry: for this crypto, only fire on this specific candle size with this threshold.
// Supersedes -cs / -thc* for LIVE validation mode.
// Example: BTC:C85:0.20,ETH:C85:0.26,SOL:C80:0.20,XRP:C85:0.22,BTC:C180:0.18,...
const trioMapArg     = arg('-triomap', null);
const trioMap        = new Map();   // `${CRYPTO}:${period}` → threshold
const trioMapPeriods = new Set();   // periods that appear in the triomap
if (trioMapArg) {
  for (const entry of trioMapArg.split(',')) {
    const parts = entry.trim().split(':');
    if (parts.length !== 3) continue;
    const crypto = parts[0].trim().toUpperCase();
    const period = parseInt(parts[1].trim().replace(/^[Cc]/, ''), 10);
    const thresh = parseFloat(parts[2].trim());
    if (!isNaN(period) && !isNaN(thresh)) {
      trioMap.set(`${crypto}:${period}`, thresh);
      trioMapPeriods.add(period);
    }
  }
}
const hasTrioMap = trioMap.size > 0;

// -t1triomap — separate trios for T1/TC detection (T0 entry not affected).
// TC uses these trios too. Key = CR:T0period to disambiguate 5m vs 15m.
// Formats:
//   CR:T0period:threshold            → same period as T0, different threshold
//   CR:T0period:T1period:threshold   → different T1 candle period AND threshold
// Example: -t1triomap BTC:65:0.18,ETH:65:0.22,BTC:150:0.18,ETH:150:0.20
const t1TrioMapArg = arg('-t1triomap', null);
const t1TrioMap    = new Map(); // `${CRYPTO}:${T0period}` → { t1period: number|null, th: number }
if (t1TrioMapArg) {
  for (const entry of t1TrioMapArg.split(',')) {
    const parts = entry.trim().split(':');
    const cr = (parts[0] || '').trim().toUpperCase();
    if (!cr || parts.length < 3) continue;
    const t0p = parseInt(String(parts[1]).replace(/^[Cc]/, ''), 10);
    if (isNaN(t0p)) continue;
    if (parts.length >= 4) {
      // CR:T0period:T1period:threshold
      const t1p = parseInt(String(parts[2]).replace(/^[Cc]/, ''), 10);
      const th  = parseFloat(parts[3]);
      if (!isNaN(t1p) && !isNaN(th)) t1TrioMap.set(`${cr}:${t0p}`, { t1period: t1p, th });
    } else {
      // CR:T0period:threshold
      const th = parseFloat(parts[2]);
      if (!isNaN(th)) t1TrioMap.set(`${cr}:${t0p}`, { t1period: null, th });
    }
  }
}

// True if any per-crypto threshold flag was provided — triggers unified simulation mode
const hasPerCryptoTh = hasTrioMap ||
                       Object.keys(perCryptoTh).length > 0 ||
                       Object.keys(perCryptoTh5m).length > 0 ||
                       Object.keys(perCryptoTh15m).length > 0;

// Resolve effective threshold for a given crypto + period
// Priority: -thc5m/-thc15m (period-specific) > -thc (all periods) > -th (global)
function cryptoTh(crypto, is15m) {
  const periodMap = is15m ? perCryptoTh15m : perCryptoTh5m;
  return periodMap[crypto] ?? perCryptoTh[crypto] ?? globalTh;
}

const cpIdx  = argv.indexOf('-cp');
const CAP_5M  = cpIdx !== -1 && argv[cpIdx+1] ? parseFloat(argv[cpIdx+1]) : 150;
const CAP_15M = cpIdx !== -1 && argv[cpIdx+2] && !argv[cpIdx+2].startsWith('-') ? parseFloat(argv[cpIdx+2]) : 500;

const ALL_CRYPTOS = ['BTC', 'ETH', 'SOL', 'XRP'];
const crArg   = arg('-cr', null);
const CRYPTOS = crArg
  ? crArg.split(',').map(s => s.trim().toUpperCase()).filter(c => ALL_CRYPTOS.includes(c))
  : ALL_CRYPTOS;

// -cs 85,210 or -cs C85,C210 — restrict which candle sizes to run (incompatible with -as)
// Accepts both bare numbers (85) and C-prefixed (C85)
const csArg = arg('-cs', null);
const csFilter = csArg
  ? new Set(csArg.split(',').map(s => parseInt(s.replace(/^[Cc]/,''), 10)).filter(n => !isNaN(n)))
  : null;
if (csFilter && autoscan) {
  console.error('Warning: -cs (candle-size filter) is incompatible with -as (autoscan needs all sizes). Remove -as to use -cs.');
  process.exit(1);
}

const ALL_PERIODS_5M  = [65, 70, 75, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 95];
const ALL_PERIODS_15M = [150, 157, 159, 161, 163, 165, 167, 169, 171, 173, 175, 180, 195, 210, 225];
const PERIODS_5M  = csFilter ? ALL_PERIODS_5M .filter(p => csFilter.has(p)) : ALL_PERIODS_5M;
const PERIODS_15M = csFilter ? ALL_PERIODS_15M.filter(p => csFilter.has(p)) : ALL_PERIODS_15M;

const LOG_DIR = path.join(__dirname, '../logs');

// ── EAT timezone ──────────────────────────────────────────────────────────────

const EAT_OFFSET_MS = 3 * 3600000;  // EAT = UTC+3
const TZ_OFFSET_MS  = (parseInt(process.env.DISPLAY_UTC_OFFSET ?? '3', 10)) * 3600000;

/**
 * Parse an EAT date string → UTC epoch ms.
 * Accepts "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS".
 * If only a date is given: time = 00:00:00 (for -df) or 23:59:59 (for -dt when endOfDay=true).
 */
function parseEAT(str, endOfDay = false) {
  if (!str) return null;
  str = str.trim();
  // Normalise: accept "YYYY-MM-DD" → append time
  const datePart = str.slice(0, 10);   // "YYYY-MM-DD"
  const timePart = str.length > 10 ? str.slice(11) : (endOfDay ? '23:59:59' : '00:00:00');
  const isoLocal = `${datePart}T${timePart}`;
  // Parse as UTC then subtract EAT offset to get the UTC moment that corresponds
  // to the given EAT wall-clock time.
  const utcMs = Date.parse(isoLocal + 'Z') - EAT_OFFSET_MS;
  if (isNaN(utcMs)) throw new Error(`Cannot parse date: "${str}" — use YYYY-MM-DD or "YYYY-MM-DD HH:MM"`);
  return utcMs;
}

const dateFromEAT = arg('-df', null);
const dateToEAT   = arg('-dt', null);
const dateFromMs  = parseEAT(dateFromEAT, false);   // inclusive start
const dateToMs    = parseEAT(dateToEAT,   true);    // inclusive end (23:59:59 if date-only)
const hasDateFilter = dateFromMs !== null || dateToMs !== null;

// ── ANSI ──────────────────────────────────────────────────────────────────────

const A = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
            green:'\x1b[32m', red:'\x1b[31m', cyan:'\x1b[36m',
            yellow:'\x1b[33m', grey:'\x1b[90m', blue:'\x1b[34m',
            brightBlue:'\x1b[94m', orange:'\x1b[38;5;208m' };
const g   = s => A.green      + s + A.reset;
const r   = s => A.red        + s + A.reset;
const b   = s => A.bold       + s + A.reset;
const d   = s => A.dim        + s + A.reset;
const c   = s => A.cyan       + s + A.reset;
const y   = s => A.yellow     + s + A.reset;
const bl  = s => A.blue       + s + A.reset;
const $   = s => A.grey       + s + A.reset;
// Direction colors matching the LIVE tab UI: UP=blue (#63b3ed), DOWN=orange (#f6ad55)
const dup = s => A.brightBlue + s + A.reset;
const ddn = s => A.orange     + s + A.reset;

// ── Helpers ───────────────────────────────────────────────────────────────────

function localTime(ms) {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}
function localHMS(ms) {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(11, 19); // HH:MM:SS
}
function durFmt(days) {
  if (!days || days <= 0) return '—';
  const m = Math.round(days * 1440);
  return `${Math.floor(m / 1440)}d ${String(Math.floor((m % 1440) / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
}
function pnlStr(pnl, w = 12) {
  const raw = (pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`);
  return pnl >= 0 ? g(raw.padStart(w)) : r(raw.padStart(w));
}
function pnlPct(pnl, w = 7) {
  const pct = pnl / startBal * 100;
  const raw = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  return pct >= 0 ? g(raw.padStart(w)) : r(raw.padStart(w));
}
function proj(pnl, dur, targetDays, w = 9) {
  if (!dur || dur <= 0) return d('—'.padStart(w));
  // Compound scaling: totalReturnFactor^(targetDays/dur) − 1
  // totalReturnFactor = (startBal + pnl) / startBal — the actual compounded multiplier
  // over `dur` days.  Raising it to (targetDays/dur) correctly projects it forward
  // without re-assuming a flat daily rate.
  const growthFactor = (startBal + pnl) / startBal;
  const p = startBal * (Math.pow(growthFactor, targetDays / dur) - 1);
  const raw = (p >= 0 ? `+$${p.toFixed(0)}` : `-$${Math.abs(p).toFixed(0)}`);
  return p >= 0 ? g(raw.padStart(w)) : r(raw.padStart(w));
}

// ── CSV reader (with date filter) ─────────────────────────────────────────────

const CSV_COLS = ['timestamp','crypto','cycle_start','candle_size',
                  'open','high','low','close','spike_pct',
                  'yes_ask','no_ask','yes_bid','no_bid'];

function readCsv(period) {
  const fp = path.join(LOG_DIR, `t1000_candles_C${period}.csv`);
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean);
  if (!lines.length) return [];
  const hasHdr = lines[0].trim().startsWith('timestamp');
  const hdrs   = hasHdr ? lines[0].split(',') : CSV_COLS;
  const data   = hasHdr ? lines.slice(1) : lines;
  const cents  = f => (f && f.trim() ? parseFloat(f) / 100 : null);

  return data
    .map(l => {
      const v   = l.split(',');
      const row = Object.fromEntries(hdrs.map((h, i) => [h.trim(), v[i]]));
      return {
        cycleStart : new Date(row.cycle_start),
        crypto     : row.crypto?.trim(),
        open       : parseFloat(row.open),
        high       : parseFloat(row.high),
        low        : parseFloat(row.low),
        close      : parseFloat(row.close),
        spikePct   : parseFloat(row.spike_pct),
        yesAsk     : cents(row.yes_ask),
        noAsk      : cents(row.no_ask),
      };
    })
    .filter(row => {
      if (!row.crypto || !CRYPTOS.includes(row.crypto)) return false;
      if (isNaN(row.spikePct) || isNaN(row.cycleStart)) return false;
      const t = row.cycleStart.getTime();
      if (dateFromMs !== null && t < dateFromMs) return false;
      if (dateToMs   !== null && t > dateToMs)   return false;
      return true;
    });
}

// ── RECOVER: 1-min candle data for TONE detection ─────────────────────────────

const _candleMap = {};  // crypto → Map<minuteTs(ms), candle>

function loadCandleMap(crypto) {
  if (_candleMap[crypto]) return _candleMap[crypto];
  const file = path.join(__dirname, '..', 'cache', `candles-1m-${crypto}USDT-5000.json`);
  const map = new Map();
  if (fs.existsSync(file)) {
    const { candles } = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const c of candles) map.set(new Date(c.timestamp).getTime(), c);
  }
  _candleMap[crypto] = map;
  return map;
}

// ── Volume ratio computation ──────────────────────────────────────────────────
// 5m signals  → 1-min candle basis  (spike ≈ 65–95s  ≈ 1 min)
// 15m signals → 3-min candle basis  (spike ≈ 150–225s ≈ 3 min, better alignment)
// Per-crypto thresholds from explore_vol3m.js: BTC=1.0, SOL=1.0, ETH/XRP=0 (disabled)

const _sortedCandlesVol   = {};  // crypto → sorted 1-min {ts, volume}
const _sortedCandlesVol3m = {};  // crypto → sorted 3-min {ts, volume} (aggregated)
const VOL_3M_MS = 3 * 60_000;

function loadSortedCandlesVol(crypto) {
  if (_sortedCandlesVol[crypto]) return _sortedCandlesVol[crypto];
  const file = path.join(__dirname, '..', 'cache', `candles-1m-${crypto}USDT-5000.json`);
  if (!fs.existsSync(file)) { _sortedCandlesVol[crypto] = []; return []; }
  const { candles } = JSON.parse(fs.readFileSync(file, 'utf8'));
  _sortedCandlesVol[crypto] = (candles || [])
    .map(c => ({ ts: new Date(c.timestamp).getTime(), volume: c.volume ?? 0 }))
    .sort((a, b) => a.ts - b.ts);
  return _sortedCandlesVol[crypto];
}

function loadSortedCandlesVol3m(crypto) {
  if (_sortedCandlesVol3m[crypto]) return _sortedCandlesVol3m[crypto];
  const base = loadSortedCandlesVol(crypto);
  const buckets = new Map();
  for (const c of base) {
    const b = Math.floor(c.ts / VOL_3M_MS) * VOL_3M_MS;
    buckets.set(b, (buckets.get(b) ?? 0) + c.volume);
  }
  _sortedCandlesVol3m[crypto] = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts, volume]) => ({ ts, volume }));
  return _sortedCandlesVol3m[crypto];
}

function getVolRatio(crypto, tsMs, is15m = false, n = 14) {
  const arr = is15m ? loadSortedCandlesVol3m(crypto) : loadSortedCandlesVol(crypto);
  if (!arr.length) return 1;  // no cache — pass through
  let hi = arr.length - 1, lo = 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid].ts <= tsMs) lo = mid; else hi = mid - 1;
  }
  if (lo < n + 1) return 1;
  const spikeVol = arr[lo].volume;
  if (!spikeVol) return 1;
  let sum = 0;
  for (let i = lo - n; i < lo; i++) sum += arr[i].volume;
  const avgVol = sum / n;
  return avgVol > 0 ? spikeVol / avgVol : 1;
}

// ── Pre-move computation (for exhaustion filter) ──────────────────────────────
// Returns net % price change in the 5 min before cycleStartMs (1-min candle opens).
// Returns null if candle data is not available.
function getPreMove(crypto, cycleStartMs) {
  const map    = loadCandleMap(crypto);
  if (!map.size) return null;
  const minNow  = Math.floor(cycleStartMs / 60000) * 60000;
  const min5ago = minNow - 5 * 60000;
  const cNow    = map.get(minNow);
  const c5ago   = map.get(min5ago);
  if (!cNow || !c5ago || !c5ago.open) return null;
  return (cNow.open - c5ago.open) / c5ago.open * 100;
}

// Prior-cycle high-low range as % of open. Returns null if no candle data.
// Used by prevVolMin filter: if previous cycle was dead-flat, skip the signal.
function getPriorCycleRange(crypto, cycleStartMs, is15m) {
  const map = loadCandleMap(crypto);
  if (!map.size) return null;
  const cycleDurMs = is15m ? 15 * 60_000 : 5 * 60_000;
  const prevStart  = cycleStartMs - cycleDurMs;
  let high = -Infinity, low = Infinity, open = null;
  for (let t = prevStart; t < cycleStartMs; t += 60_000) {
    const c = map.get(t);
    if (!c) continue;
    if (open === null) open = parseFloat(c.open);
    const h = parseFloat(c.high), l = parseFloat(c.low);
    if (h > high) high = h;
    if (l < low)  low  = l;
  }
  if (open === null || open === 0 || high === -Infinity) return null;
  return (high - low) / open * 100;
}

// Aggregate 1-min Binance candles into a Cxx-second synthetic candle
function buildSyntheticCandle(crypto, startMs, durationMs) {
  const map    = loadCandleMap(crypto);
  const endMs  = startMs + durationMs;
  const startMin = Math.floor(startMs / 60000) * 60000;
  let open = null, high = -Infinity, low = Infinity, close = null;
  for (let t = startMin; t < endMs; t += 60000) {
    const c = map.get(t);
    if (!c) continue;
    if (open === null) open = c.open;
    if (c.high > high) high = c.high;
    if (c.low  < low)  low  = c.low;
    close = c.close;
  }
  return open !== null ? { open, high, low, close } : null;
}

/**
 * Detect a TONE (counter-spike) candle after T+0.
 * 5m:  checks T+1 and T+2 (minN=1, maxN=2)
 * 15m: checks last-2 candles of window (minN=maxN-1)
 * Returns { n, exitCandle } for the first TONE found, or null.
 */
function detectTone(crypto, cycleStartMs, candleSizeMs, t0open, t0absPct, direction, maxN, minN) {
  for (let n = minN; n <= maxN; n++) {
    const c = buildSyntheticCandle(crypto, cycleStartMs + n * candleSizeMs, candleSizeMs);
    if (!c) continue;
    const upMove   = (c.high - c.open) / c.open * 100;
    const downMove = (c.open - c.low)  / c.open * 100;
    if (Math.max(upMove, downMove) < t0absPct) continue;  // too small — not a TONE
    const reverts  = direction === 'UP' ? c.close <= t0open : c.close >= t0open;
    if (reverts) return { n, exitCandle: c };
  }
  return null;
}

// ── Signal loading ─────────────────────────────────────────────────────────────

// dist% filter: cumulative Binance move from T+0 open to entry close must be >= distMin in trade direction.
// Returns true if filter passes (trade allowed) or filter is disabled.
// distMinOverride: explicit value (used by distmin sweep); if undefined, falls back to CLI -distmin5m/-distmin15m.
function checkDist(t0Open, entryClose, direction, is15m, distMinOverride) {
  const distMin = distMinOverride !== undefined ? distMinOverride : (is15m ? distMin15m : distMin5m);
  if (distMin <= 0 || !(t0Open > 0)) return true;
  const dist = (entryClose - t0Open) / t0Open * 100;
  return (direction === 'UP' ? dist : -dist) >= distMin;
}

// Candle body filter: body must be ≥minPct% of total range (mirrors live engine filter)
function hasStrongBody(row, minPct = bodyMinPct) {
  if (minPct <= 0) return true;  // disabled
  const height = row.high - row.low;
  if (!(height > 0)) return true;  // degenerate candle — allow
  return (Math.abs(row.open - row.close) * 100 / height) >= minPct;
}

// Composite body check for T1 entries: uses T0.open→T1.close window (same as TC).
// Rejects V-shape patterns where T+0 moved counter-direction before T+1 bounce.
function hasStrongBodyComposite(sig, t1, minPct = bodyMinPct) {
  if (minPct <= 0) return true;
  const t1Down = t1.close < t1.open;
  const hi     = t1Down ? sig.high : t1.high;
  const lo     = t1Down ? t1.low   : sig.low;
  const range  = hi - lo;
  if (!(range > 0)) return true;
  return (Math.abs(t1.close - sig.open) * 100 / range) >= minPct;
}

function loadSignals(period, durationSecs) {
  const candleMs = period * 1000;
  const sigs = readCsv(period).map(row => ({
    ts           : row.cycleStart.getTime() + period * 1000,
    period,
    is15m        : period >= 150,
    cycleStartMs : row.cycleStart.getTime(),
    durationSecs,
    crypto       : row.crypto,
    absSpike     : Math.abs(row.spikePct),
    direction    : row.spikePct >= 0 ? 'UP' : 'DOWN',
    yesAsk       : row.yesAsk,
    noAsk        : row.noAsk,
    open         : row.open,
    high         : row.high,
    low          : row.low,
    close        : row.close,
    t1           : null,
  }));
  // Pre-compute T+1 candle for each signal when -t1 or -t2 mode is active.
  // T+1 starts at sig.ts (= cycleStart + period) and has the same duration as T+0.
  // T+2 also needs T+1 data for its continuation check (T+2.close > T+1.close).
  if (t1Mode || t2Mode) {
    for (const s of sigs) s.t1 = buildSyntheticCandle(s.crypto, s.ts, candleMs);
  }
  if (t2Mode) {
    for (const s of sigs) s.t2 = buildSyntheticCandle(s.crypto, s.ts + candleMs, candleMs);
  }
  return sigs;
}

// ── PM outcome lookup ─────────────────────────────────────────────────────────

function pmOutcome(sig) {
  return pm.getOutcome(sig.crypto, sig.cycleStartMs, sig.durationSecs);
}
function resolveWin(dir, outcome) {
  if (outcome == null) return null;
  return (dir === 'UP' && outcome === 'UP') || (dir === 'DOWN' && outcome === 'DOWN');
}

// ── Scoring (pessimistic WR — consistent across both sections) ────────────────

const MIN_TRADES = 10;

/**
 * Threshold quality bonus: gentle preference for stronger spike signals.
 * Formula: 1 + 0.15 * log10(th / 0.18)
 * At th=0.18% → ×1.000 (baseline)   At th=0.32% → ×1.038   At th=0.44% → ×1.058
 * Max at th=0.80% → ×1.097 (+9.7%).  Weight is small enough that large WR or
 * sample-size differences always dominate; only tips close calls toward higher thresholds.
 */
// Pure pessimistic WR: wins / (total + 3). No threshold bonus — that was biasing
// autoscan toward 0.50%+ thresholds even when 0.24% per-crypto gave 93-100% WR.
function scoreWR(wins, losses) {
  const total = wins + losses;
  return total >= MIN_TRADES ? (wins / (total + 3)) : -Infinity;
}

// Pre-build per-(cycleStart, direction) crypto sets for D2 coordination check.
// Signals that pass spike + body + direction + time filters are counted per cycle.
// thResolver(sig) → effective spike threshold for this signal.
function buildCoordSets(signals, thResolver) {
  const map = {};
  for (const sig of signals) {
    if (!hasStrongBody(sig)) continue;
    if (sig.absSpike < (thResolver ? thResolver(sig) : cryptoTh(sig.crypto, sig.is15m))) continue;
    if (dirFilter !== 'BOTH' && sig.direction !== dirFilter) continue;
    if (skipHoursSet.size && skipHoursSet.has(new Date(sig.cycleStartMs).getUTCHours())) continue;
    if (skipDowSet.size   && skipDowSet.has(new Date(sig.cycleStartMs).getUTCDay()))   continue;
    const ck = `${sig.cycleStartMs}:${sig.direction}`;
    (map[ck] = map[ck] ?? new Set()).add(sig.crypto);
  }
  return map;
}

// ── Fast simulation (no trade log — for autoscan) ─────────────────────────────

function fastSim(signals, th, mn, mx, capsMap, distMinOverride) {
  let balance = startBal, wins = 0, losses = 0, noPm = 0;
  let cbUntil = 0, cbSkipped = 0;  // circuit breaker state
  let dlLossTimes = [], dlSkipped = 0, dlPausedUntil = 0;  // drawdown limit state
  let volSkipped = 0, exhaustSkipped = 0, coordSkipped = 0, prevVolSkipped = 0;
  const seen = new Set();
  // D2 coordination: pre-build coord sets before main loop so every signal sees all others
  // Use the same threshold `th` for coord qualification — keeps coordSetsMap consistent with spike check.
  const coordSetsMap = coordMin > 1 ? buildCoordSets(signals, () => th) : null;
  const openEnds = [];   // sorted end-timestamps of open positions

  function placeTrade(direction, entry, entryTs, win, posEndMs, cap) {
    const pos = Math.min(Math.max(1, balance * riskPct), cap);
    const pnl = win ? pos * (1 - entry) / entry : -pos;
    balance = Math.max(0, balance + pnl);
    openEnds.push(posEndMs);
    openEnds.sort((a, b) => a - b);
    if (win) wins++; else losses++;
    if (!win && cbMs > 0) cbUntil = Math.max(cbUntil, posEndMs + cbMs); // arm CB
    if (!win && dlWindowMs > 0) {
      dlLossTimes.push(posEndMs); // arm drawdown limit
      if (dlLossTimes.length >= dlMaxLosses) dlPausedUntil = Math.max(dlPausedUntil, posEndMs + dlPauseMs);
    }
  }

  for (const sig of signals) {
    if (balance <= 0) break;
    const sigTh   = th;   // use the swept threshold (not global cryptoTh — fastSim is autoscan-only)
    const cap     = capsMap[sig.crypto] ?? 500;
    if (cap === 0) continue;
    const key     = `${sig.cycleStartMs}-${sig.crypto}-${sig.durationSecs}`;
    if (seen.has(key)) continue;
    const posEndMs = sig.cycleStartMs + sig.durationSecs * 1000;

    // ── Circuit breaker check ───────────────────────────────────────────────
    if (cbMs > 0 && sig.ts < cbUntil) { cbSkipped++; continue; }

    // ── Drawdown limit check ─────────────────────────────────────────────────
    if (dlWindowMs > 0) {
      while (dlLossTimes.length && dlLossTimes[0] < sig.ts - dlWindowMs) dlLossTimes.shift();
      if (sig.ts < dlPausedUntil) { dlSkipped++; continue; }
    }

    // ── Volume filter ───────────────────────────────────────────────────────
    const _evm = effectiveVolMin(sig.crypto); if (_evm > 0 && getVolRatio(sig.crypto, sig.ts, sig.is15m) < _evm) { volSkipped++; continue; }

    // ── Prior-cycle range filter (GARCH clustering) ──────────────────────────
    if (prevVolMin > 0) { const pcr = getPriorCycleRange(sig.crypto, sig.cycleStartMs, sig.is15m); if (pcr !== null && pcr < prevVolMin) { prevVolSkipped++; continue; } }

    // ── Exhaustion filter ────────────────────────────────────────────────────
    { const _et = sig.is15m ? exhaust15m : exhaust5m;
      if (_et > 0) { const pm = getPreMove(sig.crypto, sig.cycleStartMs);
        if (pm != null && Math.abs(pm) > _et && (pm >= 0 ? 'UP' : 'DOWN') === sig.direction) { exhaustSkipped++; continue; } } }

    // ── Direction filter ─────────────────────────────────────────────────────
    if (dirFilter !== 'BOTH' && sig.direction !== dirFilter) continue;

    // ── Time-of-day filter ───────────────────────────────────────────────────
    if (skipHoursSet.size && skipHoursSet.has(new Date(sig.cycleStartMs).getUTCHours())) continue;
    if (skipDowSet.size   && skipDowSet.has(new Date(sig.cycleStartMs).getUTCDay()))   continue;

    // ── T+0 ────────────────────────────────────────────────────────────────
    // t0Placed: true when T0 spike+coord detected (set BEFORE price/maxPos checks).
    //   Prevents T1 from firing counter-trend after T0 spike is OOR (e.g., T0 UP+OOR → T1 DOWN).
    //   T1 only fires when T0 candle had NO qualifying spike at all.
    // t0Qualified: true when spike+body threshold passed (used elsewhere).
    let t0Placed = false;
    let t0Qualified = false;
    if (sig.absSpike >= sigTh && hasStrongBody(sig)) {
      t0Qualified = true;
      // ── D2 Coordination filter ────────────────────────────────────────────
      // Require ≥coordMin cryptos spiking same direction in same cycle.
      if (coordSetsMap) {
        const ck = `${sig.cycleStartMs}:${sig.direction}`;
        if ((coordSetsMap[ck]?.size ?? 0) < coordMin) { coordSkipped++; continue; }
      }
      if (!t0Off) t0Placed = true; // T0 spike+coord detected → suppress T1 even if entry OOR or maxPos full
      const entry0r = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
      const entry0  = entry0r != null ? Math.min(entry0r + slip, 1.0) : null;
      // mn uses raw ask (market quality filter); mx uses post-slippage (actual cost cap).
      if (entry0 != null && entry0r >= mn && entry0 <= mx && checkDist(sig.open, sig.close, sig.direction, sig.is15m, distMinOverride)) {
        const win = resolveWin(sig.direction, pmOutcome(sig));
        if (win === null) {
          noPm++;
        } else {
          let i = 0; while (i < openEnds.length && openEnds[i] <= sig.ts) i++;
          openEnds.splice(0, i);
          if (openEnds.length < maxPos) {
            if (!t0Off) {
              seen.add(key);
              placeTrade(sig.direction, entry0, sig.ts, win, posEndMs, cap);
              t0Placed = true; // consumed — suppresses T1/TC cascade
            }
          }
        }
      }
    }

    // ── T+1 (only when T+0 did NOT place a trade) ─────────────────────────
    // Three-tier cascade — no T+0 qualification required:
    //   Tier 2: T+1 standalone spike (same threshold + body filter as T+0)
    //   Tier 3: TC cumulative OHLC candle + body filter
    //     DOWN T+1: open=T0.open, high=T0.high, low=T1.low,  close=T1.close
    //     UP   T+1: open=T0.open, high=T1.high, low=T0.low,  close=T1.close
    let t1Placed = false;
    const _sigT1a = (t1Mode5m || t1Mode15m) ? (sig.is15m ? t1Mode15m : t1Mode5m) : t1Mode;
    if (!t0Placed && _sigT1a && sig.t1) {
      // T1 trio: separate period/threshold for T1/TC detection (from -t1triomap)
      const _t1Cfg   = t1TrioMap.get(`${sig.crypto}:${sig.period}`);
      const t1ThSim  = _t1Cfg?.th ?? sigTh;
      let   _t1c     = sig.t1;  // T1 candle (default: same period as T0)
      let   _t1Ts    = sig.ts + sig.period * 1000;
      if (_t1Cfg?.t1period && _t1Cfg.t1period !== sig.period) {
        const p1 = _t1Cfg.t1period;
        _t1c  = buildSyntheticCandle(sig.crypto, sig.cycleStartMs + p1 * 1000, p1 * 1000) ?? sig.t1;
        _t1Ts = sig.cycleStartMs + 2 * p1 * 1000;
      }
      const t1 = _t1c;
      let t1Dir = null, t1Label = null;
      const t1Raw = (t1.close - t1.open) / t1.open;

      // TC check (runs first when -t1tcf, otherwise after T1)
      const _tryTC = () => {
        if (!tcOff && t1Dir === null) {
          const t1Down = t1.close < t1.open;
          const tc = {
            open:  sig.open,
            high:  t1Down ? sig.high : t1.high,
            low:   t1Down ? t1.low   : sig.low,
            close: t1.close,
          };
          const tcRaw = (tc.close - tc.open) / tc.open;
          if (Math.abs(tcRaw) * 100 >= t1ThSim && hasStrongBody(tc, t1BodyMinPct)) {
            t1Dir = tcRaw > 0 ? 'UP' : 'DOWN'; t1Label = 'TC';
          }
        }
      };
      // T1 check (runs first when NOT -t1tcf)
      const _tryT1 = () => {
        if (!(t1tcOnly || t1Off) && t1Dir === null && Math.abs(t1Raw) * 100 >= t1ThSim && hasStrongBodyComposite(sig, t1, t1BodyMinPct)) {
          t1Dir = t1Raw > 0 ? 'UP' : 'DOWN'; t1Label = 'T1';
        }
      };
      if (t1tcFirst) { _tryTC(); _tryT1(); } else { _tryT1(); _tryTC(); }

      if (t1Dir !== null && checkDist(sig.open, t1.close, t1Dir, sig.is15m, distMinOverride)) {
        const raw    = t1Dir === 'UP' ? sig.yesAsk : sig.noAsk;
        const entry1 = raw != null ? Math.min(raw + t1Adj, 1.0) : null;
        const t1Mx   = mxt1 ?? mx;  // max cap for T+1 entries (TC: 97¢; can be overridden)
        // Per-label price bounds: TC uses high floor (mnt1=85¢); T1 uses no floor + standalone max cap
        const _t1Min = t1Label === 'TC' ? mnt1 : mn;
        const _t1Max = t1Label === 'TC' ? t1Mx : (mxt1St ?? mx);
        if (entry1 != null && entry1 >= _t1Min && entry1 <= _t1Max) {
          const win = resolveWin(t1Dir, pmOutcome(sig));
          if (win === null) {
            noPm++;
          } else {
            const t1Ts = _t1Ts;
            let i = 0; while (i < openEnds.length && openEnds[i] <= t1Ts) i++;
            openEnds.splice(0, i);
            if (openEnds.length < maxPos) {
              seen.add(key);
              placeTrade(t1Dir, entry1, t1Ts, win, posEndMs, cap);
              t1Placed = true;
            }
          }
        }
      }
    }

    // ── T+2 (only when T+0 AND T+1 did NOT place a trade) ────────────────
    // T+2 continuation: T+2 candle close continues past T+1 close in the spike direction.
    if (!t0Placed && !t1Placed && t0Qualified && t2Mode && sig.t1 && sig.t2) {
      const t1         = sig.t1;
      const t2         = sig.t2;
      const t0Dir          = sig.direction;
      const continuationOK = t0Dir === 'UP' ? t2.close > t1.close : t2.close < t1.close;
      if (continuationOK && checkDist(sig.open, sig.t2.close, t0Dir, sig.is15m, distMinOverride)) {
        const t2Dir  = t0Dir;
        const raw    = t2Dir === 'UP' ? sig.yesAsk : sig.noAsk;
        const entry2 = raw != null ? Math.min(raw + t2Adj, 1.0) : null;
        if (entry2 != null && entry2 >= mn && entry2 <= mx) {
          const win = resolveWin(t2Dir, pmOutcome(sig));
          if (win === null) {
            noPm++;
          } else {
            const t2Ts = sig.ts + sig.period * 2000;
            let i = 0; while (i < openEnds.length && openEnds[i] <= t2Ts) i++;
            openEnds.splice(0, i);
            if (openEnds.length < maxPos) {
              seen.add(key);
              placeTrade(t2Dir, entry2, t2Ts, win, posEndMs, cap);
            }
          }
        }
      }
    }
  }
  return { wins, losses, total: wins + losses, noPm, pnl: balance - startBal,
           score: scoreWR(wins, losses), cbSkipped, volSkipped, prevVolSkipped, exhaustSkipped, coordSkipped };
}

// ── Full period simulation (with trade log) ───────────────────────────────────

function simPeriod(period, durationSecs, capsMap, thOverride) {
  const mn      = minCents / 100;
  const mx      = maxCents / 100;
  const signals = loadSignals(period, durationSecs);
  if (!signals.length) return null;

  let balance = startBal;
  const trades = [];
  let noPm = 0;
  let cbUntil = 0, cbSkipped = 0;  // circuit breaker state
  let dlLossTimes = [], dlSkipped = 0, dlPausedUntil = 0;  // drawdown limit state
  let volSkipped = 0, exhaustSkipped = 0, coordSkipped = 0, prevVolSkipped = 0;
  // D2 coordination: pre-build coord sets before main loop
  const coordSetsMapFull = coordMin > 1
    ? buildCoordSets(signals, sig => hasPerCryptoTh ? cryptoTh(sig.crypto, sig.is15m) : (thOverride ?? globalTh))
    : null;
  const openEnds = [];   // sorted end-timestamps of open positions

  for (const sig of signals) {
    if (balance <= 0) break;
    // If any -thc* flag was given, use per-crypto maps (overrides thOverride).
    // Otherwise fall back to thOverride (autoscan sweep value) or globalTh.
    const th = hasPerCryptoTh ? cryptoTh(sig.crypto, sig.is15m) : (thOverride ?? globalTh);

    // ── Circuit breaker check ─────────────────────────────────────────────────
    if (cbMs > 0 && sig.ts < cbUntil) { cbSkipped++; continue; }

    // ── Drawdown limit check ──────────────────────────────────────────────────
    if (dlWindowMs > 0) {
      while (dlLossTimes.length && dlLossTimes[0] < sig.ts - dlWindowMs) dlLossTimes.shift();
      if (sig.ts < dlPausedUntil) { dlSkipped++; continue; }
    }

    // ── Volume filter ─────────────────────────────────────────────────────────
    const _evm = effectiveVolMin(sig.crypto); if (_evm > 0 && getVolRatio(sig.crypto, sig.ts, sig.is15m) < _evm) { volSkipped++; continue; }

    // ── Prior-cycle range filter (GARCH clustering) ──────────────────────────
    if (prevVolMin > 0) { const pcr = getPriorCycleRange(sig.crypto, sig.cycleStartMs, sig.is15m); if (pcr !== null && pcr < prevVolMin) { prevVolSkipped++; continue; } }

    // ── Exhaustion filter ────────────────────────────────────────────────────
    { const _et = sig.is15m ? exhaust15m : exhaust5m;
      if (_et > 0) { const pm = getPreMove(sig.crypto, sig.cycleStartMs);
        if (pm != null && Math.abs(pm) > _et && (pm >= 0 ? 'UP' : 'DOWN') === sig.direction) { exhaustSkipped++; continue; } } }

    // ── Direction filter ─────────────────────────────────────────────────────
    if (dirFilter !== 'BOTH' && sig.direction !== dirFilter) continue;

    // ── Time-of-day filter ───────────────────────────────────────────────────
    if (skipHoursSet.size && skipHoursSet.has(new Date(sig.cycleStartMs).getUTCHours())) continue;
    if (skipDowSet.size   && skipDowSet.has(new Date(sig.cycleStartMs).getUTCDay()))   continue;

    // ── T+0 check ─────────────────────────────────────────────────────────────
    let t0Fired = false;
    let t0Qualified = false;
    if ((noThreshold || sig.absSpike >= th) && hasStrongBody(sig)) {
      t0Qualified = true;
      // ── D2 Coordination filter ────────────────────────────────────────────
      if (coordSetsMapFull) {
        const ck = `${sig.cycleStartMs}:${sig.direction}`;
        if ((coordSetsMapFull[ck]?.size ?? 0) < coordMin) { coordSkipped++; continue; }
      }
      if (!t0Off) t0Fired = true; // T0 spike+coord detected → suppress T1 even if entry OOR or maxPos full
      {
      const entryRaw = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
      const entry    = entryRaw != null ? Math.min(entryRaw + slip, 1.0) : null;
      if (entry != null && entryRaw >= mn && entry <= mx && checkDist(sig.open, sig.close, sig.direction, sig.is15m)) {
        const win = resolveWin(sig.direction, pmOutcome(sig));
        if (win === null) {
          noPm++;
        } else {
          const posEndMs = sig.cycleStartMs + sig.durationSecs * 1000;
          let i = 0; while (i < openEnds.length && openEnds[i] <= sig.ts) i++;
          openEnds.splice(0, i);
          if (openEnds.length < maxPos) {
            if (!t0Off) {
            openEnds.push(posEndMs);
            openEnds.sort((a, b) => a - b);
            const cap = capsMap[sig.crypto] ?? 500;
            const pos = Math.min(Math.max(1, balance * riskPct), cap);
            // ── RECOVER check ────────────────────────────────────────────────
            let outcome = win ? 'WIN' : 'LOSS';
            let pnl, recoverN = null;
            if (recoverMode) {
              const candleSizeMs = sig.period * 1000;
              const maxN = sig.is15m ? Math.floor((sig.durationSecs - sig.period) / sig.period) : 2;
              const minN = sig.is15m ? Math.max(1, maxN - 1) : 1;
              const tone = detectTone(sig.crypto, sig.cycleStartMs, candleSizeMs, sig.open, sig.absSpike, sig.direction, maxN, minN);
              if (tone) { outcome = 'RECOV'; recoverN = tone.n; pnl = pos * (recoverExit / entry - 1); }
            }
            if (pnl === undefined) pnl = win ? pos * (1 - entry) / entry : -pos;
            // ─────────────────────────────────────────────────────────────────
            balance = Math.max(0, balance + pnl);
            // ── Circuit breaker: arm on any resolved LOSS ─────────────────────
            if (!win && outcome !== 'RECOV' && cbMs > 0)
              cbUntil = Math.max(cbUntil, posEndMs + cbMs);
            // ── Drawdown limit: arm on resolved LOSS ──────────────────────────
            if (!win && outcome !== 'RECOV' && dlWindowMs > 0) {
              dlLossTimes.push(posEndMs);
              if (dlLossTimes.length >= dlMaxLosses) dlPausedUntil = Math.max(dlPausedUntil, posEndMs + dlPauseMs);
            }
            trades.push({
              ts: sig.ts, time: localTime(sig.cycleStartMs), entryTime: localHMS(sig.ts),
              crypto: sig.crypto, direction: sig.direction,
              spikePct: sig.direction === 'UP' ? sig.absSpike : -sig.absSpike,
              entry, outcome, pnl, balance, pos, recoverN,
              wasWin: win, label: 'T0',
            });
            t0Fired = true; // consumed — suppresses T1/TC cascade
            } // end !t0Off
          }
        }
      }
      } // end trade entry block
    }

    // ── T+1 check: only if -t1 enabled, T+0 didn't fire ──────────────────────
    // Three-tier cascade:
    //   Tier 2: T+1 standalone spike (same threshold + body filter as T+0)
    //   Tier 3: TC cumulative OHLC candle + body filter
    //     DOWN T+1: open=T0.open, high=T0.high, low=T1.low,  close=T1.close
    //     UP   T+1: open=T0.open, high=T1.high, low=T0.low,  close=T1.close
    // Gate: T1 fires only when T0 candle had NO qualifying spike (!t0Fired).
    //   t0Fired=true is now set as soon as T0 spike+coord detects — regardless of price range or maxPos.
    //   This prevents T1 from firing counter-trend after T0 was OOR (e.g., T0 UP+OOR → T1 DOWN at cheap NO).
    // Entry price reuses T+0 yesAsk/noAsk + t1Adj (best available approximation for sim).
    let t1Fired = false;
    const _sigT1b = (t1Mode5m || t1Mode15m) ? (sig.is15m ? t1Mode15m : t1Mode5m) : t1Mode;
    if (_sigT1b && !t0Fired && sig.t1) {
      // T1 trio: separate period/threshold for T1/TC detection (from -t1triomap)
      const _t1CfgU  = t1TrioMap.get(`${sig.crypto}:${sig.period}`);
      const t1ThU    = _t1CfgU?.th ?? th;
      let   _t1cU    = sig.t1;  // T1 candle (default: same period as T0)
      let   _t1TsU   = sig.ts + sig.period * 1000;
      if (_t1CfgU?.t1period && _t1CfgU.t1period !== sig.period) {
        const p1 = _t1CfgU.t1period;
        _t1cU  = buildSyntheticCandle(sig.crypto, sig.cycleStartMs + p1 * 1000, p1 * 1000) ?? sig.t1;
        _t1TsU = sig.cycleStartMs + 2 * p1 * 1000;
      }
      const t1 = _t1cU;
      let t1Dir = null, t1SpikePct = null, t1Label = null;
      const t1Raw = (t1.close - t1.open) / t1.open;

      const _tryTC_sp = () => {
        if (!tcOff && t1Dir === null) {
          const t1Down = t1.close < t1.open;
          const tc = { open: sig.open, high: t1Down ? sig.high : t1.high, low: t1Down ? t1.low : sig.low, close: t1.close };
          const tcRaw = (tc.close - tc.open) / tc.open;
          if ((noThreshold || Math.abs(tcRaw) * 100 >= t1ThU) && hasStrongBody(tc, t1BodyMinPct)) {
            t1Dir = tcRaw > 0 ? 'UP' : 'DOWN'; t1SpikePct = tcRaw * 100; t1Label = 'TC';
          }
        }
      };
      const _tryT1_sp = () => {
        if (!(t1tcOnly || t1Off) && t1Dir === null && (noThreshold || Math.abs(t1Raw) * 100 >= t1ThU) && hasStrongBodyComposite(sig, t1, t1BodyMinPct)) {
          t1Dir = t1Raw > 0 ? 'UP' : 'DOWN'; t1SpikePct = t1Raw * 100; t1Label = 'T1';
        }
      };
      if (t1tcFirst) { _tryTC_sp(); _tryT1_sp(); } else { _tryT1_sp(); _tryTC_sp(); }

      if (t1Dir !== null && checkDist(sig.open, t1.close, t1Dir, sig.is15m)) {
        const t1EntryRaw = t1Dir === 'UP' ? sig.yesAsk : sig.noAsk;
        const t1Entry    = t1EntryRaw != null ? Math.min(t1EntryRaw + t1Adj, 1.0) : null;
        const t1Ts       = _t1TsU;
        const t1Mx       = mxt1 ?? mx;  // max cap for T+1 entries (TC: 97¢; can be overridden)
        // Per-label price bounds: TC uses high floor (mnt1=85¢); T1 uses no floor + standalone max cap
        const _t1Min = t1Label === 'TC' ? mnt1 : mn;
        const _t1Max = t1Label === 'TC' ? t1Mx : (mxt1St ?? mx);
        if (t1Entry != null && t1Entry >= _t1Min && t1Entry <= _t1Max) {
          const t1Win = resolveWin(t1Dir, pmOutcome(sig));
          if (t1Win !== null) {
            const posEndMs = sig.cycleStartMs + sig.durationSecs * 1000;
            let i = 0; while (i < openEnds.length && openEnds[i] <= t1Ts) i++;
            openEnds.splice(0, i);
            if (openEnds.length < maxPos) {
              openEnds.push(posEndMs);
              openEnds.sort((a, b) => a - b);
              const cap = capsMap[sig.crypto] ?? 500;
              const pos = Math.min(Math.max(1, balance * riskPct), cap);
              const pnl = t1Win ? pos * (1 - t1Entry) / t1Entry : -pos;
              balance = Math.max(0, balance + pnl);
              if (!t1Win && cbMs > 0) cbUntil = Math.max(cbUntil, posEndMs + cbMs); // arm CB
              if (!t1Win && dlWindowMs > 0) {
                dlLossTimes.push(posEndMs); // arm DL
                if (dlLossTimes.length >= dlMaxLosses) dlPausedUntil = Math.max(dlPausedUntil, posEndMs + dlPauseMs);
              }
              trades.push({
                ts: t1Ts, time: localTime(sig.cycleStartMs), entryTime: localHMS(t1Ts),
                crypto: sig.crypto, direction: t1Dir,
                spikePct: t1SpikePct,
                entry: t1Entry, outcome: t1Win ? 'WIN' : 'LOSS', pnl, balance, pos, recoverN: null,
                wasWin: t1Win, label: t1Label, capUsd: sig.capUsd,
              });
              t1Fired = true;
            }
          }
        }
      }
    }

    // ── T+2 check: only if -t2 enabled and neither T+0 nor T+1 fired ─────────
    // T+2 continuation: T+2 candle close continues past T+1 close in the spike direction.
    if (t2Mode && !t0Fired && !t1Fired && t0Qualified && sig.t1 && sig.t2) {
      const t1             = sig.t1;
      const t2             = sig.t2;
      const t0Dir          = sig.direction;
      const continuationOK = t0Dir === 'UP' ? t2.close > t1.close : t2.close < t1.close;
      if (continuationOK && checkDist(sig.open, sig.t2.close, t0Dir, sig.is15m)) {
        const t2Dir      = t0Dir;
        const t2EntryRaw = t2Dir === 'UP' ? sig.yesAsk : sig.noAsk;
        const t2Entry    = t2EntryRaw != null ? Math.min(t2EntryRaw + t2Adj, 1.0) : null;
        const t2Ts       = sig.ts + sig.period * 2000;  // entry at T+3 (T+2 candle close)
        if (t2Entry != null && t2Entry >= mn && t2Entry <= mx) {
          const t2Win = resolveWin(t2Dir, pmOutcome(sig));
          if (t2Win !== null) {
            const posEndMs = sig.cycleStartMs + sig.durationSecs * 1000;
            let i = 0; while (i < openEnds.length && openEnds[i] <= t2Ts) i++;
            openEnds.splice(0, i);
            if (openEnds.length < maxPos) {
              openEnds.push(posEndMs);
              openEnds.sort((a, b) => a - b);
              const cap = capsMap[sig.crypto] ?? 500;
              const pos = Math.min(Math.max(1, balance * riskPct), cap);
              const pnl = t2Win ? pos * (1 - t2Entry) / t2Entry : -pos;
              balance = Math.max(0, balance + pnl);
              trades.push({
                ts: t2Ts, time: localTime(sig.cycleStartMs), entryTime: localHMS(t2Ts),
                crypto: sig.crypto, direction: t2Dir,
                spikePct: (t2.close - sig.open) / sig.open * 100,  // combined T+0+T+1+T+2 spike
                entry: t2Entry, outcome: t2Win ? 'WIN' : 'LOSS', pnl, balance, pos, recoverN: null,
                wasWin: t2Win, label: 'T2',
              });
            }
          }
        }
      }
    }
  }

  const wins    = trades.filter(t => t.outcome === 'WIN').length;
  const losses  = trades.filter(t => t.outcome === 'LOSS').length;
  const recovs  = trades.filter(t => t.outcome === 'RECOV').length;
  const recovSaved = trades.filter(t => t.outcome === 'RECOV' && !t.wasWin).length;
  const recovCut   = trades.filter(t => t.outcome === 'RECOV' &&  t.wasWin).length;
  const t1Trades   = trades.filter(t => t.label === 'T1');
  const t1Wins     = t1Trades.filter(t => t.outcome === 'WIN').length;
  const t1Losses   = t1Trades.filter(t => t.outcome === 'LOSS').length;
  const t2Trades   = trades.filter(t => t.label === 'T2');
  const t2Wins     = t2Trades.filter(t => t.outcome === 'WIN').length;
  const t2Losses   = t2Trades.filter(t => t.outcome === 'LOSS').length;
  const times   = signals.map(s => s.ts);
  const durDays = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 86400000 : 0;
  const th = hasPerCryptoTh ? null : (thOverride ?? globalTh);
  return { period, trades, wins, losses, recovs, recovSaved, recovCut, total: wins + losses, noPm,
           t1Count: t1Trades.length, t1Wins, t1Losses,
           t2Count: t2Trades.length, t2Wins, t2Losses,
           pnl: balance - startBal, finalBalance: balance, durDays, cbSkipped, dlSkipped, volSkipped,
           prevVolSkipped, exhaustSkipped, coordSkipped,
           score: scoreWR(wins, losses) };
}

// ── Print verbose trade log ───────────────────────────────────────────────────

function printVerbose(res, label) {
  const rcvSuffix = recoverMode ? d(` -sell exit@${(recoverExit*100).toFixed(0)}¢`) : '';
  console.log('\n' + b(c(`══ C${res.period} — ${label} `)) +
    d(`(${res.total} resolved, ${res.noPm} no-PM)`) + rcvSuffix);
  const xminLabel = res.period >= 150 ? '15MIN' : ' 5MIN';
  console.log(d('Time             @Entry    LBL  Crypto  xMIN   Dir      Bet     Spike%   Entry  Result        PnL      Balance'));
  console.log(d('─'.repeat(117)));
  for (const t of res.trades) {
    const dir    = t.direction === 'UP' ? dup('▲ UP') : ddn('▼ DN');
    const sp     = `${t.spikePct >= 0 ? '+' : ''}${t.spikePct.toFixed(3)}%`;
    const ent    = `${(t.entry * 100).toFixed(0)}¢`;
    const isRecov = t.outcome === 'RECOV';
    const pStr   = t.outcome === 'WIN'
      ? g(`+$${t.pnl.toFixed(2)}`.padStart(9))
      : isRecov
        ? y(`-$${Math.abs(t.pnl).toFixed(2)}`.padStart(9))
        : r(`-$${Math.abs(t.pnl).toFixed(2)}`.padStart(9));
    const out    = t.outcome === 'WIN' ? g(' WIN') : isRecov ? y(`↩T+${t.recoverN} `) : r('LOSS');
    const bal    = t.outcome === 'WIN' ? `$${t.balance.toFixed(2)}` : isRecov ? y(`$${t.balance.toFixed(2)}`) : r(`$${t.balance.toFixed(2)}`);
    const et     = (t.entryTime || '').padEnd(8);
    const bet    = (`$${(t.pos ?? 0).toFixed(0)}`).padStart(5);
    const lbl    = t.label === 'T1' ? c('T1') : d('T0');
    process.stdout.write(
      `${t.time.padEnd(17)} ${et}  ${lbl}  ${t.crypto.padEnd(7)} ${xminLabel}  ${dir}  ${bet}   ${sp.padStart(8)}  ${ent.padStart(4)}  ${out.padEnd(5)} ${pStr}  ${bal}\n`
    );
  }
  const wr  = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
  const rcvPart = recoverMode && res.recovs
    ? d(`  ↩RECOV:${res.recovs}`) + g(`(saved:${res.recovSaved})`) + (res.recovCut ? r(`(cut:${res.recovCut})`) : '')
    : '';
  const cbPart      = cbMs > 0  && res.cbSkipped  > 0 ? y(`  ⏸CB-skipped:${res.cbSkipped}`)       : '';
  const dlPart      = dlWindowMs > 0 && (res.dlSkipped ?? 0) > 0 ? y(`  🛑DL-skipped:${res.dlSkipped}`) : '';
  const volPart     = anyVolFilter && res.volSkipped > 0 ? y(`  📊Vol-skipped:${res.volSkipped}`)   : '';
  const prevVolPart = prevVolMin > 0 && (res.prevVolSkipped ?? 0) > 0 ? y(`  📉PrevVol-skipped:${res.prevVolSkipped}`) : '';
  const exhaustPart = (exhaust5m > 0 || exhaust15m > 0) && (res.exhaustSkipped ?? 0) > 0 ? y(`  💤Exhaust-skipped:${res.exhaustSkipped}`) : '';
  const coordPart   = coordMin > 1 && (res.coordSkipped ?? 0) > 0 ? y(`  🔗Coord-skipped:${res.coordSkipped}`) : '';
  console.log(d(`  → W:${res.wins}  L:${res.losses}  WR:${wr}`) + rcvPart + cbPart + dlPart + volPart + prevVolPart + exhaustPart + coordPart + d(`  PnL: `) +
    pnlStr(res.pnl) + d(`  Final: $${res.finalBalance.toFixed(2)}`));
  if (t1Mode && res.t1Count > 0) {
    const t1wr = res.t1Count > 0 ? (res.t1Wins / res.t1Count * 100).toFixed(1) + '%' : '—';
    console.log(c(`     T1: W:${res.t1Wins}  L:${res.t1Losses}  WR:${t1wr}  (${res.t1Count} extra trades from T+1 candle)`));
  }
  if (t2Mode && res.t2Count > 0) {
    const t2wr = res.t2Count > 0 ? (res.t2Wins / res.t2Count * 100).toFixed(1) + '%' : '—';
    console.log(c(`     T2: W:${res.t2Wins}  L:${res.t2Losses}  WR:${t2wr}  (${res.t2Count} extra trades from T+2 candle)`));
  }
}

// ── Unified simulation (all selected periods merged, one balance) ──────────────
// Used when -thc/-thc5m/-thc15m or -triomap is specified (validation mode).
// -triomap mode: only loads signals for the exact (crypto, candle_size) pairs in the map,
//   using each trio's own threshold — exactly mirrors the LIVE engine behaviour.

function simUnified(triomapOverride = null, trioPeriodsOverride = null, caps15mOverride = null) {
  const effectiveTrioMap     = triomapOverride     ?? trioMap;
  const effectiveTrioPeriods = trioPeriodsOverride ?? trioMapPeriods;
  const effectiveHasTrioMap  = effectiveTrioMap.size > 0;

  const mn = minCents / 100;
  const mx = maxCents / 100;

  // Collect signals
  const allSignals = [];
  if (effectiveHasTrioMap) {
    // Only load the specific (period, crypto) pairs from the triomap
    for (const period of effectiveTrioPeriods) {
      const dur = period >= 150 ? 900 : 300;
      for (const sig of loadSignals(period, dur)) {
        if (!effectiveTrioMap.has(`${sig.crypto}:${period}`)) continue; // skip cryptos not in triomap for this period
        const caps = sig.is15m ? (caps15mOverride ?? polMaxByCrypto15m) : polMaxByCrypto;
        allSignals.push({ ...sig, capUsd: caps[sig.crypto] ?? 500 });
      }
    }
  } else {
    for (const p of PERIODS_5M)  for (const sig of loadSignals(p, 300)) allSignals.push({ ...sig, capUsd: polMaxByCrypto[sig.crypto]    ?? 500 });
    for (const p of PERIODS_15M) for (const sig of loadSignals(p, 900)) allSignals.push({ ...sig, capUsd: polMaxByCrypto15m[sig.crypto] ?? 500 });
  }

  // Chronological order; for ties put 5m before 15m (smaller period = earlier candle close)
  allSignals.sort((a, b) => a.ts - b.ts || a.period - b.period);

  // Deduplicate: at most one trade per (cycleStart, crypto, duration)
  const seen = new Set();
  let balance = startBal;
  let minBalance = startBal;
  let maxBalance = startBal;
  const trades = [];
  let noPm = 0;
  let cbUntil = 0, cbSkipped = 0;  // circuit breaker state
  let dlLossTimes = [], dlSkipped = 0, dlPausedUntil = 0;  // drawdown limit state
  let volSkipped = 0, exhaustSkipped = 0, coordSkipped2 = 0, prevVolSkipped = 0;
  // D2 coordination: pre-build coord sets before main loop
  const coordSetsMapAll = coordMin > 1
    ? buildCoordSets(allSignals, sig => effectiveHasTrioMap
        ? (effectiveTrioMap.get(`${sig.crypto}:${sig.period}`) ?? globalTh)
        : cryptoTh(sig.crypto, sig.is15m))
    : null;
  const openEnds = [];   // sorted end-timestamps of open positions
  const openByCrypto = new Map(); // crypto → posEndMs (one position per asset rule)

  for (const sig of allSignals) {
    if (balance <= 0) break;
    const th = effectiveHasTrioMap
      ? (effectiveTrioMap.get(`${sig.crypto}:${sig.period}`) ?? globalTh)
      : cryptoTh(sig.crypto, sig.is15m);

    const key = `${sig.cycleStartMs}-${sig.crypto}-${sig.durationSecs}`;
    if (seen.has(key)) continue;

    // ── Circuit breaker check ─────────────────────────────────────────────────
    if (cbMs > 0 && sig.ts < cbUntil) { cbSkipped++; continue; }

    // ── Drawdown limit check ──────────────────────────────────────────────────
    if (dlWindowMs > 0) {
      while (dlLossTimes.length && dlLossTimes[0] < sig.ts - dlWindowMs) dlLossTimes.shift();
      if (sig.ts < dlPausedUntil) { dlSkipped++; continue; }
    }

    // ── Volume filter ─────────────────────────────────────────────────────────
    const _evm = effectiveVolMin(sig.crypto); if (_evm > 0 && getVolRatio(sig.crypto, sig.ts, sig.is15m) < _evm) { volSkipped++; continue; }

    // ── Prior-cycle range filter (GARCH clustering) ──────────────────────────
    if (prevVolMin > 0) { const pcr = getPriorCycleRange(sig.crypto, sig.cycleStartMs, sig.is15m); if (pcr !== null && pcr < prevVolMin) { prevVolSkipped++; continue; } }

    // ── Exhaustion filter ────────────────────────────────────────────────────
    { const _et = sig.is15m ? exhaust15m : exhaust5m;
      if (_et > 0) { const pm = getPreMove(sig.crypto, sig.cycleStartMs);
        if (pm != null && Math.abs(pm) > _et && (pm >= 0 ? 'UP' : 'DOWN') === sig.direction) { exhaustSkipped++; continue; } } }

    // ── Direction filter ─────────────────────────────────────────────────────
    if (dirFilter !== 'BOTH' && sig.direction !== dirFilter) continue;

    // ── Time-of-day filter ───────────────────────────────────────────────────
    if (skipHoursSet.size && skipHoursSet.has(new Date(sig.cycleStartMs).getUTCHours())) continue;
    if (skipDowSet.size   && skipDowSet.has(new Date(sig.cycleStartMs).getUTCDay()))   continue;

    // ── T+0 ──────────────────────────────────────────────────────────────────
    let t0Fired = false;
    if ((noThreshold || sig.absSpike >= th) && hasStrongBody(sig)) {
      // ── D2 Coordination filter ────────────────────────────────────────────
      if (coordSetsMapAll) {
        const ck = `${sig.cycleStartMs}:${sig.direction}`;
        if ((coordSetsMapAll[ck]?.size ?? 0) < coordMin) { coordSkipped2++; continue; }
      }
      if (!t0Off) t0Fired = true; // T0 spike+coord detected → suppress T1 even if entry OOR or maxPos full
      {
      const entryRaw = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
      const entry    = entryRaw != null ? Math.min(entryRaw + slip, 1.0) : null;
      if (entry != null && entryRaw >= mn && entry <= mx && checkDist(sig.open, sig.close, sig.direction, sig.is15m)) {
        const win = resolveWin(sig.direction, pmOutcome(sig));
        if (win === null) {
          noPm++;
        } else {
          const posEndMs = sig.cycleStartMs + sig.durationSecs * 1000;
          let ei = 0; while (ei < openEnds.length && openEnds[ei] <= sig.ts) ei++;
          openEnds.splice(0, ei);
          if (openEnds.length < maxPos && (openByCrypto.get(sig.crypto) ?? 0) <= sig.ts) {
            if (!t0Off) {
            seen.add(key);
            openEnds.push(posEndMs);
            openEnds.sort((a, b) => a - b);
            openByCrypto.set(sig.crypto, posEndMs);
            const pos = Math.min(Math.max(1, balance * riskPct), sig.capUsd);
            // ── RECOVER check ───────────────────────────────────────────────
            let outcome = win ? 'WIN' : 'LOSS';
            let pnl, recoverN = null;
            if (recoverMode) {
              const candleSizeMs = sig.period * 1000;
              const maxN = sig.is15m ? Math.floor((sig.durationSecs - sig.period) / sig.period) : 2;
              const minN = sig.is15m ? Math.max(1, maxN - 1) : 1;
              const tone = detectTone(sig.crypto, sig.cycleStartMs, candleSizeMs, sig.open, sig.absSpike, sig.direction, maxN, minN);
              if (tone) { outcome = 'RECOV'; recoverN = tone.n; pnl = pos * (recoverExit / entry - 1); }
            }
            if (pnl === undefined) pnl = win ? pos * (1 - entry) / entry : -pos;
            // ────────────────────────────────────────────────────────────────
            balance = Math.max(0, balance + pnl);
            if (balance > maxBalance) maxBalance = balance;
            if (balance < minBalance) minBalance = balance;
            // ── Circuit breaker: arm on any resolved LOSS ─────────────────
            if (!win && outcome !== 'RECOV' && cbMs > 0)
              cbUntil = Math.max(cbUntil, posEndMs + cbMs);
            // ── Drawdown limit: arm on resolved LOSS ──────────────────────
            if (!win && outcome !== 'RECOV' && dlWindowMs > 0) {
              dlLossTimes.push(posEndMs);
              if (dlLossTimes.length >= dlMaxLosses) dlPausedUntil = Math.max(dlPausedUntil, posEndMs + dlPauseMs);
            }
            trades.push({
              ts: sig.ts, time: localTime(sig.cycleStartMs), entryTime: localHMS(sig.ts),
              crypto: sig.crypto, direction: sig.direction, period: sig.period,
              spikePct: sig.direction === 'UP' ? sig.absSpike : -sig.absSpike,
              threshold: th, entry, outcome, pnl, balance, pos, recoverN,
              wasWin: win, label: 'T0', capUsd: sig.capUsd,
            });
            t0Fired = true; // consumed — suppresses T1/TC cascade
            } // end !t0Off
          }
        }
      }
      } // end trade entry block
    }

    // ── T+1 cascade: Tier 2 (T+1 standalone) + Tier 3 (TC cumulative) ────────
    const _sigT1c = (t1Mode5m || t1Mode15m) ? (sig.is15m ? t1Mode15m : t1Mode5m) : t1Mode;
    if (_sigT1c && !t0Fired && sig.t1) {
      // T1 trio: separate period/threshold for T1/TC detection (from -t1triomap)
      const _t1CfgS  = t1TrioMap.get(`${sig.crypto}:${sig.period}`);
      const t1ThS    = _t1CfgS?.th ?? th;
      let   _t1cS    = sig.t1;
      let   _t1TsS   = sig.ts + sig.period * 1000;
      if (_t1CfgS?.t1period && _t1CfgS.t1period !== sig.period) {
        const p1 = _t1CfgS.t1period;
        _t1cS  = buildSyntheticCandle(sig.crypto, sig.cycleStartMs + p1 * 1000, p1 * 1000) ?? sig.t1;
        _t1TsS = sig.cycleStartMs + 2 * p1 * 1000;
      }
      const t1 = _t1cS;
      let t1Dir = null, t1SpikePct = null, t1Label = null;
      const t1Raw = (t1.close - t1.open) / t1.open;

      const _tryTC_sp = () => {
        if (!tcOff && t1Dir === null) {
          const t1Down = t1.close < t1.open;
          const tc = { open: sig.open, high: t1Down ? sig.high : t1.high, low: t1Down ? t1.low : sig.low, close: t1.close };
          const tcRaw = (tc.close - tc.open) / tc.open;
          if ((noThreshold || Math.abs(tcRaw) * 100 >= t1ThS) && hasStrongBody(tc, t1BodyMinPct)) {
            t1Dir = tcRaw > 0 ? 'UP' : 'DOWN'; t1SpikePct = tcRaw * 100; t1Label = 'TC';
          }
        }
      };
      const _tryT1_sp = () => {
        if (!(t1tcOnly || t1Off) && t1Dir === null && (noThreshold || Math.abs(t1Raw) * 100 >= t1ThS) && hasStrongBodyComposite(sig, t1, t1BodyMinPct)) {
          t1Dir = t1Raw > 0 ? 'UP' : 'DOWN'; t1SpikePct = t1Raw * 100; t1Label = 'T1';
        }
      };
      if (t1tcFirst) { _tryTC_sp(); _tryT1_sp(); } else { _tryT1_sp(); _tryTC_sp(); }

      if (t1Dir !== null && checkDist(sig.open, t1.close, t1Dir, sig.is15m)) {
        const t1EntryRaw = t1Dir === 'UP' ? sig.yesAsk : sig.noAsk;
        const t1Entry    = t1EntryRaw != null ? Math.min(t1EntryRaw + t1Adj, 1.0) : null;
        const t1Ts       = _t1TsS;
        const t1Mx       = mxt1 ?? mx;  // max cap for T+1 entries (TC: 97¢; can be overridden)
        // Per-label price bounds: TC uses high floor (mnt1=85¢); T1 uses no floor + standalone max cap
        const _t1Min = t1Label === 'TC' ? mnt1 : mn;
        const _t1Max = t1Label === 'TC' ? t1Mx : (mxt1St ?? mx);
        if (t1Entry != null && t1Entry >= _t1Min && t1Entry <= _t1Max) {
          const t1Win = resolveWin(t1Dir, pmOutcome(sig));
          if (t1Win !== null) {
            const posEndMs = sig.cycleStartMs + sig.durationSecs * 1000;
            let ei = 0; while (ei < openEnds.length && openEnds[ei] <= t1Ts) ei++;
            openEnds.splice(0, ei);
            if (openEnds.length < maxPos && (openByCrypto.get(sig.crypto) ?? 0) <= t1Ts) {
              seen.add(key);
              openEnds.push(posEndMs);
              openEnds.sort((a, b) => a - b);
              openByCrypto.set(sig.crypto, posEndMs);
              const pos = Math.min(Math.max(1, balance * riskPct), sig.capUsd);
              const pnl = t1Win ? pos * (1 - t1Entry) / t1Entry : -pos;
              balance = Math.max(0, balance + pnl);
              if (balance > maxBalance) maxBalance = balance;
              if (balance < minBalance) minBalance = balance;
              if (!t1Win && cbMs > 0) cbUntil = Math.max(cbUntil, posEndMs + cbMs); // arm CB
              if (!t1Win && dlWindowMs > 0) {
                dlLossTimes.push(posEndMs); // arm DL
                if (dlLossTimes.length >= dlMaxLosses) dlPausedUntil = Math.max(dlPausedUntil, posEndMs + dlPauseMs);
              }
              trades.push({
                ts: t1Ts, time: localTime(sig.cycleStartMs), entryTime: localHMS(t1Ts),
                crypto: sig.crypto, direction: t1Dir, period: sig.period,
                spikePct: t1SpikePct, threshold: th,
                entry: t1Entry, outcome: t1Win ? 'WIN' : 'LOSS', pnl, balance, pos, recoverN: null,
                wasWin: t1Win, label: t1Label, capUsd: sig.capUsd,
              });
            }
          }
        }
      }
    }
  }

  const wins      = trades.filter(t => t.outcome === 'WIN').length;
  const losses    = trades.filter(t => t.outcome === 'LOSS').length;
  const recovs    = trades.filter(t => t.outcome === 'RECOV').length;
  const recovSaved = trades.filter(t => t.outcome === 'RECOV' && !t.wasWin).length;
  const recovCut   = trades.filter(t => t.outcome === 'RECOV' &&  t.wasWin).length;
  const times   = allSignals.map(s => s.ts);
  const durDays = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 86400000 : 0;
  return { trades, wins, losses, recovs, recovSaved, recovCut, total: wins + losses, noPm,
           winRate: wins + losses > 0 ? wins / (wins + losses) : null,
           pnl: balance - startBal, finalBalance: balance, minBalance, maxBalance, durDays, cbSkipped, dlSkipped, volSkipped,
           prevVolSkipped, exhaustSkipped, coordSkipped: coordSkipped2 };
}

function printUnified(res) {
  const rcvSuffix = recoverMode ? d(` -sell exit@${(recoverExit*100).toFixed(0)}¢`) : '';
  console.log('\n' + b(c('══ UNIFIED SIMULATION ')) + d(`(${res.total} resolved, ${res.noPm} no-PM)`) + rcvSuffix);
  console.log(d('Time             @Entry    Crypto  Cxx      Th      xMIN   Dir      Bet     Spike%   Entry  Result        PnL      Balance'));
  console.log(d('─'.repeat(127)));
  for (const t of res.trades) {
    const dir      = t.direction === 'UP' ? dup('▲ UP') : ddn('▼ DN');
    const sp       = `${t.spikePct >= 0 ? '+' : ''}${t.spikePct.toFixed(3)}%`;
    const ent      = `${(t.entry * 100).toFixed(0)}¢`;
    const isRecov  = t.outcome === 'RECOV';
    const pStr     = t.outcome === 'WIN'
      ? g(`+$${t.pnl.toFixed(2)}`.padStart(9))
      : isRecov
        ? y(`-$${Math.abs(t.pnl).toFixed(2)}`.padStart(9))
        : r(`-$${Math.abs(t.pnl).toFixed(2)}`.padStart(9));
    const out      = t.outcome === 'WIN' ? g(' WIN') : isRecov ? y(`↩T+${t.recoverN} `) : r('LOSS');
    const bal      = t.outcome === 'WIN' ? `$${t.balance.toFixed(2)}` : isRecov ? y(`$${t.balance.toFixed(2)}`) : r(`$${t.balance.toFixed(2)}`);
    const cxx      = `C${t.period}`.padEnd(5);
    const th       = t.threshold != null ? `${t.threshold.toFixed(2)}%`.padEnd(7) : '       ';
    const xmin     = t.period >= 150 ? '15MIN' : ' 5MIN';
    const et       = (t.entryTime || '').padEnd(8);
    const bet      = (`$${(t.pos ?? 0).toFixed(0)}`).padStart(5);
    process.stdout.write(
      `${t.time.padEnd(17)} ${et}  ${t.crypto.padEnd(7)} ${cxx}  ${th}  ${xmin}  ${dir}  ${bet}   ${sp.padStart(8)}  ${ent.padStart(4)}  ${out.padEnd(5)} ${pStr}  ${bal}\n`
    );
  }
  const wr = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
  const minPnl = res.minBalance - startBal;
  const maxPnl = res.maxBalance - startBal;
  console.log(d('─'.repeat(127)));
  const rcvPart2    = recoverMode && res.recovs
    ? d(`  ↩RECOV:${res.recovs}`) + g(`(saved:${res.recovSaved})`) + (res.recovCut ? r(`(cut:${res.recovCut})`) : '')
    : '';
  const cbPart2     = cbMs > 0  && res.cbSkipped  > 0 ? y(`  ⏸CB:${res.cbSkipped}`)       : '';
  const dlPart2     = dlWindowMs > 0 && (res.dlSkipped ?? 0) > 0 ? y(`  🛑DL:${res.dlSkipped}`) : '';
  const volPart2    = anyVolFilter && res.volSkipped > 0 ? y(`  📊Vol:${res.volSkipped}`)   : '';
  const prevVolPart2 = prevVolMin > 0 && (res.prevVolSkipped ?? 0) > 0 ? y(`  📉PrevVol:${res.prevVolSkipped}`) : '';
  const exhaustPart2 = (exhaust5m > 0 || exhaust15m > 0) && (res.exhaustSkipped ?? 0) > 0 ? y(`  💤Exhaust:${res.exhaustSkipped}`) : '';
  const coordPart2  = coordMin > 1 && (res.coordSkipped ?? 0) > 0 ? y(`  🔗Coord:${res.coordSkipped}`) : '';
  console.log(d(`  W:${res.wins}  L:${res.losses}  WR:${wr}`) + rcvPart2 + cbPart2 + dlPart2 + volPart2 + prevVolPart2 + exhaustPart2 + coordPart2 + d(`  PnL: `) + pnlStr(res.pnl) +
    d(`  Final: $${res.finalBalance.toFixed(2)}`));
  console.log(d(`  Peak: `) + g(`$${res.maxBalance.toFixed(2)}`) + d(` (+$${maxPnl.toFixed(2)})`) +
    d(`   Trough: `) + (minPnl < 0 ? r(`$${res.minBalance.toFixed(2)}`) : d(`$${res.minBalance.toFixed(2)}`)) +
    d(` (${minPnl >= 0 ? '+' : '-'}$${Math.abs(minPnl).toFixed(2)})`));
  // ── T1/TC breakdown (when -t1 is active) ─────────────────────────────────
  if (t1Mode) {
    const t1Trades = res.trades.filter(t => t.label === 'T1');
    const tcTrades = res.trades.filter(t => t.label === 'TC');
    const fmtLbl = (arr, label) => {
      if (!arr.length) return '';
      const w = arr.filter(t => t.wasWin).length;
      const l = arr.length - w;
      const wr2 = (w / arr.length * 100).toFixed(1) + '%';
      return d(`     ${label}: W:${w}  L:${l}  WR:${wr2}  (${arr.length} trades)`);
    };
    if (!t1tcOnly && t1Trades.length > 0) console.log(fmtLbl(t1Trades, 'T1 standalone'));
    if (tcTrades.length > 0)              console.log(fmtLbl(tcTrades, 'TC cumulative'));
  }

  // ── Avg delay between trades ─────────────────────────────────────────────
  if (res.trades.length >= 2) {
    const sortedTs = [...res.trades].sort((a, b) => a.ts - b.ts);
    let totalGap = 0;
    for (let i = 1; i < sortedTs.length; i++) totalGap += sortedTs[i].ts - sortedTs[i-1].ts;
    const avgGapMin = totalGap / (sortedTs.length - 1) / 60000;
    const gapH   = Math.floor(avgGapMin / 60);
    const gapM   = Math.round(avgGapMin % 60);
    const gapStr = gapH > 0 ? `${gapH}h ${gapM}min` : `${Math.round(avgGapMin)}min`;
    console.log(d(`  Avg delay between trades: `) + b(gapStr));
  }

  // ── Per-trio breakdown ──────────────────────────────────────────────────────
  if (res.trades.length > 0) {
    const trioStats = new Map();
    for (const t of res.trades) {
      const key = `${t.crypto}:C${t.period}:${t.threshold != null ? t.threshold.toFixed(2) : '?'}`;
      if (!trioStats.has(key)) {
        trioStats.set(key, { crypto: t.crypto, period: t.period, threshold: t.threshold,
                             wins: 0, losses: 0, pnl: 0 });
      }
      const s = trioStats.get(key);
      if (t.outcome === 'WIN') s.wins++; else s.losses++;
      s.pnl += t.pnl;
    }
    // Sort: 5m first (period < 150), then 15m; within group by crypto
    const sorted = [...trioStats.values()].sort((a, b) =>
      (a.period < 150 ? 0 : 1) - (b.period < 150 ? 0 : 1) ||
      a.crypto.localeCompare(b.crypto) || a.period - b.period
    );
    console.log('\n' + b(d('  ── Per-trio performance ─────────────────────────────────────────────────────')));
    console.log(d('  Trio                Trades   Wins  Losses   WinRate      PnL    Avg/Trade'));
    console.log(d('  ' + '─'.repeat(72)));
    for (const s of sorted) {
      const total  = s.wins + s.losses;
      const wr2    = total > 0 ? (s.wins / total * 100).toFixed(1) + '%' : '—';
      const avg    = total > 0 ? s.pnl / total : 0;
      const label  = `${s.crypto}:C${s.period}:${s.threshold != null ? s.threshold.toFixed(2) + '%' : '?'}`.padEnd(18);
      const pStr   = (s.pnl >= 0 ? g : r)(`${s.pnl >= 0 ? '+' : ''}$${s.pnl.toFixed(2)}`.padStart(10));
      const avgStr = (avg >= 0 ? g : r)(`${avg >= 0 ? '+' : ''}$${avg.toFixed(2)}`.padStart(10));
      process.stdout.write(
        `  ${label}  ${String(total).padStart(6)}  ${String(s.wins).padStart(5)}  ${String(s.losses).padStart(6)}  ` +
        `${wr2.padStart(7)}  ${pStr}  ${avgStr}\n`
      );
    }

    // ── Suggested -triomap (positive-gain trios only) ────────────────────────
    const profitable = sorted.filter(s => s.pnl > 0);
    if (profitable.length) {
      const trioArg = profitable
        .map(s => `${s.crypto}:C${s.period}:${s.threshold.toFixed(2)}`)
        .join(',');
      console.log('\n' + b(c('  ── Suggested -triomap (profitable trios only) ──────────────────────────────')));
      console.log(g(`  -triomap ${trioArg}`));
    }
  }
}

// ── Print period summary table ────────────────────────────────────────────────

function printSummary(results, title) {
  const valid = results.filter(Boolean);
  if (!valid.length) { console.log(d(`\n  (no data for ${title})`)); return; }

  const dayCol   = customDay != null ? `→${customDay}d`.padStart(9) : '';
  const rowWidth = 114 + (customDay != null ? 10 : 0);
  const sep = '═'.repeat(Math.max(4, 88 - title.length));
  console.log('\n' + b(`═══ ${title} ${sep}`));
  console.log(d('Period'.padEnd(8) + 'Trades'.padStart(7) + 'NoPM'.padStart(6) +
    'Wins'.padStart(6) + 'Losses'.padStart(7) + 'WinRate'.padStart(9) +
    'PnL'.padStart(12) + 'PnL%'.padStart(8) + 'Final'.padStart(10) +
    '→7d'.padStart(9) + '→30d'.padStart(10) + dayCol + '  Duration'));
  console.log(d('─'.repeat(rowWidth)));

  let tW = 0, tL = 0, tRcv = 0, tPnl = 0, tNoPm = 0;
  for (const res of valid) {
    const wr     = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
    const balRaw = `$${res.finalBalance.toFixed(0)}`;
    const balStr = res.finalBalance >= startBal ? g(balRaw.padStart(10)) : r(balRaw.padStart(10));
    const lossStr = (recoverMode && res.recovs)
      ? y(`${res.losses}↩${res.recovs}`.padStart(7))
      : String(res.losses).padStart(7);
    process.stdout.write(
      `C${res.period}`.padEnd(8) +
      String(res.total + (res.recovs ?? 0)).padStart(7) +
      (res.noPm > 0 ? $(String(res.noPm).padStart(6)) : ' '.repeat(6)) +
      String(res.wins).padStart(6) + lossStr +
      wr.padStart(9) + '  ' +
      pnlStr(res.pnl, 10) + '  ' + pnlPct(res.pnl, 6) + '  ' + balStr +
      proj(res.pnl, res.durDays, 7, 8) + ' ' +
      proj(res.pnl, res.durDays, 30, 9) +
      (customDay != null ? ' ' + proj(res.pnl, res.durDays, customDay, 8) : '') +
      d('  ' + durFmt(res.durDays)) + '\n'
    );
    tW += res.wins; tL += res.losses; tRcv += res.recovs ?? 0; tPnl += res.pnl; tNoPm += res.noPm;
    if (t2Mode && (res.t2Count ?? 0) > 0) {
      const t2wr = (res.t2Wins / res.t2Count * 100).toFixed(1) + '%';
      process.stdout.write(d(`         ↳T2: ${res.t2Wins}W/${res.t2Losses}L WR:${t2wr} (${res.t2Count} extra trades from T+2 candle)\n`));
    }
  }

  console.log(d('─'.repeat(rowWidth)));
  const tT  = tW + tL;
  const tWR = tT > 0 ? (tW / tT * 100).toFixed(1) + '%' : '—';
  const tLossStr = (recoverMode && tRcv)
    ? y(`${tL}↩${tRcv}`.padStart(7))
    : b(String(tL).padStart(7));
  process.stdout.write(
    b('ALL'.padEnd(8)) + b(String(tT + tRcv).padStart(7)) +
    (tNoPm > 0 ? $(String(tNoPm).padStart(6)) : ' '.repeat(6)) +
    b(String(tW).padStart(6)) + tLossStr +
    b(tWR.padStart(9)) + '  ' + pnlStr(tPnl, 10) + '\n\n'
  );
}

// ── Autoscan ──────────────────────────────────────────────────────────────────

function runAutoscan(sigsByPeriod, periods, label, writeJsonPath, alsoWriteTo = null, capsOverride = null) {
  const MN_RANGE = [5, 10, 15, 20];
  const MX_RANGE = [70, 75, 80, 85, 89, 90, 93, 95].filter(v => v <= maxCents);
  const TH_RANGE = [0.10, 0.12, 0.14, 0.15, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26, 0.29, 0.32, 0.35, 0.40, 0.44, 0.50].filter(t => t >= minTh);

  // Minimum candle-row counts before a period is eligible for autoscan scoring.
  // New periods (added Mar 7 2026) have ~4 400 rows (5m) or ~1 500 rows (15m) after 4 days;
  // established periods have 14 000+ rows (5m) or 4 800+ rows (15m).
  // Threshold chosen so that ≥ ~10 days of data are required before a period can influence best/trio.
  const MIN_ROWS_5M  = 8_000;
  const MIN_ROWS_15M = 3_000;

  const bestPerPeriod = [];
  for (const period of periods) {
    const sigs = sigsByPeriod[period];
    if (!sigs || !sigs.length) { bestPerPeriod.push(null); continue; }
    const minRows = period >= 150 ? MIN_ROWS_15M : MIN_ROWS_5M;
    if (sigs.length < minRows) {
      process.stdout.write(`  C${period}: skipped (${sigs.length} rows < ${minRows} min — accumulating data)\n`);
      bestPerPeriod.push(null);
      continue;
    }
    const capsMap = capsOverride ?? polMaxByCrypto;
    if (capsMap === 0) { bestPerPeriod.push(null); continue; }
    process.stdout.write(`  Scanning C${period}...`);
    let best = null;
    for (const mnC of MN_RANGE) {
      for (const mxC of MX_RANGE) {
        if (mxC <= mnC) continue;
        for (const th of TH_RANGE) {
          const res = fastSim(sigs, th, mnC / 100, mxC / 100, capsMap);
          if (res.total >= MIN_TRADES && res.wins / res.total < minWR) continue;  // WR floor
          // Coordination mode (D2): rank by PnL — revenue is the correct objective when
          // coordination is active (lower thresholds give more coordinated trades at similar WR).
          // Non-coord mode: rank by pessimistic WR (canonical).
          const isBetter = coordMin > 1
            ? (!best || res.pnl > best.pnl || (res.pnl === best.pnl && res.score > best.score))
            : (!best || res.score > best.score || (res.score === best.score && res.pnl > best.pnl));
          if (isBetter) {
            best = { period, th, mn: mnC, mx: mxC, ...res };
          }
        }
      }
    }
    if (best && isFinite(best.score)) {
      process.stdout.write(` best: th=${best.th.toFixed(2)}% ${best.mn}¢–${best.mx}¢  ` +
        `W:${best.wins} L:${best.losses}  score:${best.score.toFixed(3)}\n`);
    } else {
      process.stdout.write(` insufficient data\n`);
      best = null;
    }
    bestPerPeriod.push(best);
  }

  // ── Iterative pruning: disable periods with negative PnL ────────────────────
  // Re-evaluates until no active period has pnl < 0 (one pass is normally sufficient
  // since per-period scores are independent, but the loop handles edge cases).
  const disabledPeriods = new Set();
  {
    let pruneChanged = true;
    while (pruneChanged) {
      pruneChanged = false;
      for (const p of bestPerPeriod) {
        if (p && !disabledPeriods.has(p.period) && p.pnl < 0) {
          disabledPeriods.add(p.period);
          pruneChanged = true;
          console.log(`  ${r('[prune]')} C${p.period}: pnl $${p.pnl.toFixed(2)} < 0 — excluded from selection`);
        }
      }
    }
    if (disabledPeriods.size) {
      console.log(`  ${r('[prune]')} ${disabledPeriods.size} period(s) disabled: ${[...disabledPeriods].map(p => 'C'+p).join(', ')}\n`);
    }
  }

  const valid = bestPerPeriod.filter(p => p && !disabledPeriods.has(p.period));
  valid.sort((a, b) => {
    const sa = isFinite(a.score) ? a.score : -Infinity;
    const sb = isFinite(b.score) ? b.score : -Infinity;
    return sb - sa || b.pnl - a.pnl;
  });

  // Print ranked table
  const sep2 = '═'.repeat(Math.max(4, 80 - label.length));
  console.log('\n' + b(`═══ AUTOSCAN: ${label} ${sep2}`));
  console.log(d('  Scoring: pessimistic WR = wins/(total+3)\n'));
  console.log(d('  Rank  Period  MinP  MaxP  Spike   Trades NoPM  WinRate       PnL    PnL%   Score'));
  console.log(d('  ' + '─'.repeat(86)));
  valid.slice(0, topN).forEach((p, i) => {
    const wr    = p.total > 0 ? (p.wins / p.total * 100).toFixed(1) + '%' : '—';
    const star  = i === 0 ? y(' ★') : `  #${i+1}`.padStart(4);
    const scStr = isFinite(p.score) ? (p.score >= 0.9 ? g : b)(p.score.toFixed(3)) : $('—');
    process.stdout.write(
      `${star}  C${String(p.period).padEnd(4)}  ${String(p.mn).padStart(3)}¢  ${String(p.mx).padStart(3)}¢  ` +
      `${p.th.toFixed(2)}%  ${String(p.total).padStart(6)}  ${String(p.noPm).padStart(4)}  ` +
      `${wr.padStart(7)}  ${pnlStr(p.pnl, 9)}  ${pnlPct(p.pnl, 6)}  ${scStr}\n`
    );
  });

  const top = valid[0];
  // Build per-(crypto × direction) quartet: each direction gets its own optimal
  // (Cxx, threshold) via direction-filtered sweep, then price bounds [mn, mx].
  let _quartet = null;
  if (top) {
    const _lockThM = top.period >= 150 ? lockTh15m : lockTh5m;
    const _capsT   = capsOverride ?? polMaxByCrypto;
    _quartet = buildQuartet(sigsByPeriod, periods, top.mn / 100, top.mx / 100, _capsT, _lockThM);
  }

  if (top) {
    const wr = top.total > 0 ? (top.wins / top.total * 100).toFixed(1) + '%' : '—';
    console.log('\n  ' + b(c(`★ BEST: C${top.period}`)) +
      `  spike ≥ ${top.th.toFixed(2)}%  entry ${top.mn}¢–${top.mx}¢\n` +
      d(`    Wins / Losses : `) + g(String(top.wins)) + d(' / ') + r(String(top.losses)) +
      d(`   WR: `) + b(wr) + '\n' +
      d(`    Score (pess WR): `) + g(isFinite(top.score) ? top.score.toFixed(3) : '—') + '\n'
    );

    // ── Distmin sweep: find optimal cumulative-dist% filter ───────────────────
    // Uses best period/th/mn/mx; sweeps distMin 0.05–0.50%.
    // Constrained: only considers values where compound PnL stays within -distDrop% of baseline.
    // This prevents the filter from improving WR while destroying revenue.
    const DISTMIN_SWEEP_RANGE = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50];
    let bestDistmin = 0;
    {
      const sigsTop   = sigsByPeriod[top.period];
      const capsD     = capsOverride ?? polMaxByCrypto;
      const baseRes   = fastSim(sigsTop, top.th, top.mn / 100, top.mx / 100, capsD, 0);
      const baseWR    = baseRes.total > 0 ? (baseRes.wins / baseRes.total * 100).toFixed(1) : '—';
      // Revenue floor: baseline PnL × (1 − distDrop). Only applied when baseline PnL > 0.
      const pnlFloor  = baseRes.pnl > 0 && distDrop > 0 ? baseRes.pnl * (1 - distDrop) : -Infinity;
      const dropLabel = distDrop > 0 ? `  max rev drop: ${(distDrop * 100).toFixed(0)}%` : '  unconstrained';
      console.log(`  ${b('DISTMIN SWEEP')}  (C${top.period}, th=${top.th.toFixed(2)}%${dropLabel})`);
      console.log(d('  DistMin   Trades  WinRate   Score    ΔScore    Revenue   ΔRev'));
      console.log(d(`  baseline  ${String(baseRes.total).padStart(6)}  ${(baseWR + '%').padStart(7)}  ${baseRes.score.toFixed(4)}    (ref)   ${pnlStr(baseRes.pnl, 9)}  (ref)`));
      let bestDm = { distmin: 0, score: baseRes.score, pnl: baseRes.pnl };
      for (const dm of DISTMIN_SWEEP_RANGE) {
        const res      = fastSim(sigsTop, top.th, top.mn / 100, top.mx / 100, capsD, dm);
        const dmWR     = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
        const dScore   = res.score - baseRes.score;
        const dScStr   = (dScore >= 0 ? '+' : '') + dScore.toFixed(4);
        const scCol    = dScore > 0.001 ? g : (dScore < -0.001 ? r : d);
        const revPct   = baseRes.pnl > 0 ? (res.pnl / baseRes.pnl - 1) * 100 : 0;
        const revStr   = (revPct >= 0 ? '+' : '') + revPct.toFixed(1) + '%';
        const eligible = res.pnl >= pnlFloor;
        const eligMark = eligible ? g('✓') : r('✗');
        console.log(`  ${dm.toFixed(2)}%  ${eligMark}  ${String(res.total).padStart(6)}  ${dmWR.padStart(7)}  ${res.score.toFixed(4)}  ${scCol(dScStr.padStart(7))}  ${pnlStr(res.pnl, 9)}  ${eligible ? d(revStr) : r(revStr)}`);
        if (eligible && res.score > bestDm.score) bestDm = { distmin: dm, score: res.score, pnl: res.pnl };
      }
      const improvement = bestDm.score - baseRes.score;
      if (bestDm.distmin > 0 && improvement > 0.001) {
        const revChg = baseRes.pnl > 0 ? ((bestDm.pnl / baseRes.pnl - 1) * 100).toFixed(1) : '—';
        console.log(`  ${g(`★ best distmin: ${bestDm.distmin.toFixed(2)}%`)}  score +${improvement.toFixed(4)}  rev ${revChg}%\n`);
        bestDistmin = bestDm.distmin;
      } else if (bestDm.distmin === 0 && distDrop > 0) {
        console.log(`  ${d('no distmin improvement within revenue constraint — baseline (0%) is optimal')}\n`);
      } else {
        console.log(`  ${d('no distmin improvement — baseline (0%) is optimal')}\n`);
      }
    }

    // Helper: write best+trio into a JSON file (reads existing, merges, writes back)
    const writeAutoscanTo = (outPath, extra = {}) => {
      const is15m   = top.period >= 150;
      const bestKey = is15m ? 'best15m' : 'best5m';
      let existing  = {};
      try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch(e) {}
      existing.updatedAt = new Date().toISOString();
      Object.assign(existing, extra);
      // Store which T0/T1/TC modes were active so Apply Autoscan can carry them to LIVE settings.
      // t0off is not stored — autoscan always scores T+0 data regardless of live t0off preference.
      existing.simFlags  = {
        t1Mode      : !!t1Mode && !tcOff,           // TC entries were enabled
        t1standalone: !!t1Mode && !t1tcOnly && !t1Off, // T+1 standalone entries were enabled
      };
      existing[bestKey]  = { period: `C${top.period}`, th: top.th, mn: top.mn / 100, mx: top.mx / 100, score: top.score };
      const distminKey   = is15m ? 'bestDistmin15m' : 'bestDistmin5m';
      existing[distminKey] = bestDistmin;

      // Per-period best (th, mn, mx) + scores — consumed by backfill for paper CXX thresholds
      const paramsKey = is15m ? 'params15m' : 'params5m';
      const scoresKey = is15m ? 'scores15m' : 'scores5m';
      if (!existing[paramsKey]) existing[paramsKey] = {};
      if (!existing[scoresKey]) existing[scoresKey] = {};
      for (const p of periods) { existing[paramsKey][`C${p}`] = null; existing[scoresKey][`C${p}`] = null; }
      for (const p of bestPerPeriod) {
        if (!p) continue;
        existing[paramsKey][`C${p.period}`] = { th: p.th, mn: p.mn / 100, mx: p.mx / 100 };
        existing[scoresKey][`C${p.period}`] = parseFloat(p.score.toFixed(4));
      }

      // Persist disabled periods so backfill can set threshold=99 for them
      const disabledKey = is15m ? 'disabled15m' : 'disabled5m';
      existing[disabledKey] = [...disabledPeriods].map(p => `C${p}`);

      const trioKey    = is15m ? 'trio15m' : 'trio5m';
      const capForTrio = capsOverride ?? polMaxByCrypto;
      const lockThMap  = is15m ? lockTh15m : lockTh5m;
      // Trio sweep uses only non-disabled periods (pnl ≥ 0)
      const activeTrioPeriods = periods.filter(p => !disabledPeriods.has(p));
      // Sweep mx per crypto: find optimal max entry price per trio.
      // When coordMin > 1 (D2), use coordination-aware sweep (sweep3DCoord) so each
      // crypto's threshold is optimised jointly with the others' coordination context.
      const trioMxBest = {};
      // When t0Off=true (T1/TC mode), T1 candle data is limited to the last ~5000 cached
      // minutes, making coord-filtered T1 sample counts too small for trio computation.
      // Fall back to sweep3D (independent per-crypto) to use all historical T1 data.
      if (coordMin > 1 && !t0Off) {
        // Pre-compute initThMap once so the inner mxC loop doesn't repeat sweep3D.
        const _initThMap = (() => {
          const r = sweep3D(sigsByPeriod, activeTrioPeriods, top.mn / 100, top.mx / 100, capForTrio, lockThMap);
          const m = {}; for (const cr of CRYPTOS) m[cr] = r[cr]?.th ?? globalTh; return m;
        })();
        for (const mxC of MX_RANGE) {
          const res = sweep3DCoord(sigsByPeriod, activeTrioPeriods, top.mn / 100, mxC / 100, capForTrio, _initThMap);
          for (const [crypto, row] of Object.entries(res)) {
            if (row && (!trioMxBest[crypto] || row.pnlSum > trioMxBest[crypto].pnlSum)) {
              trioMxBest[crypto] = { ...row, mx: mxC / 100 };
            }
          }
        }
      } else {
        for (const mxC of MX_RANGE) {
          const res = sweep3D(sigsByPeriod, activeTrioPeriods, top.mn / 100, mxC / 100, capForTrio, lockThMap);
          for (const [crypto, row] of Object.entries(res)) {
            if (row && (!trioMxBest[crypto] || row.score > trioMxBest[crypto].score)) {
              trioMxBest[crypto] = { ...row, mx: mxC / 100 };
            }
          }
        }
      }
      const trioOut = {};
      for (const [crypto, row] of Object.entries(trioMxBest)) {
        // Guard: only include trios with positive backtest PnL — protects against
        // sweep3DCoord (D2 mode) not having an explicit pnlSum ≤ 0 reject guard.
        if (row && row.pnlSum > 0) trioOut[crypto] = { period: `C${row.period}`, th: row.th, mx: row.mx };
        else if (row) console.log(`  ${r('[trio-prune]')} ${crypto} ${trioKey}: pnlSum=$${row.pnlSum?.toFixed(2)} ≤ 0 — excluded`);
      }
      existing[trioKey] = trioOut;

      // Save quartet: per-(crypto × direction) optimal (period, th, mn, mx)
      const quartetKey = is15m ? 'quartet15m' : 'quartet5m';
      if (_quartet) {
        const quartetOut = {};
        for (const [crypto, dirs] of Object.entries(_quartet)) {
          quartetOut[crypto] = {};
          for (const [dir, q] of Object.entries(dirs)) {
            quartetOut[crypto][dir] = q ? {
              period: q.period,
              th    : q.th,
              mn    : q.mn != null ? q.mn / 100 : null,
              mx    : q.mx != null ? q.mx / 100 : null,
            } : null;
          }
        }
        existing[quartetKey] = quartetOut;
      }
      fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
      console.log($(`  ✓ ${path.basename(outPath)} updated`));
    };

    // Primary write: full-dataset only (don't overwrite all-time config with filtered data)
    if (writeJsonPath && !hasDateFilter) {
      writeAutoscanTo(writeJsonPath);
    } else if (hasDateFilter && !alsoWriteTo) {
      console.log($('  ℹ  Date-filtered run — autoscan JSON not written (use -wr <path> to save results)'));
    }
    // Secondary write: explicit output path (-wr flag), used for 7d scoring
    if (alsoWriteTo) {
      writeAutoscanTo(alsoWriteTo, hasDateFilter
        ? { dateFrom: dateFromEAT, dateTo: dateToEAT }
        : {});
    }
  }

  // ── 3D sweep: best (Cxx, threshold) trio per crypto ─────────────────────────
  let trio = null;
  if (top) {
    const capsForTrio = capsOverride ?? polMaxByCrypto;
    trio = printTrioSweep(
      sigsByPeriod, periods,
      top.mn / 100, top.mx / 100, capsForTrio,
      `PER-CRYPTO BEST TRIOS — ${label}`
    );
    // Print quartet: per-(crypto × direction) optimal params + price analysis
    if (_quartet) printQuartetAnalysis(_quartet, label);
  }

  return { top, trio, quartet: _quartet };
}

// ── 3D sweep: crypto × Cxx × threshold ────────────────────────────────────────
//
// For each crypto independently, finds the best (Cxx, minSpike) trio by
// iterating every (period, threshold) combination and scoring with pessimistic WR.
//
// Each Cxx CSV is an independent signal set (different candle sizes detect the
// spike at a different point in the cycle). A BTC 15m market therefore appears
// in all 8 15m CSVs — each with its own detection time and entry price.
//
// MIN_TRADES_CRYPTO = 5 (lower than global 10; per-crypto samples are smaller).

const MIN_TRADES_CRYPTO = 5;

function sweep3D(sigsByPeriod, periods, mn, mx, capsMap, lockTh = null) {
  const TH_SWEEP = [0.10, 0.12, 0.14, 0.15, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26, 0.29, 0.32, 0.35, 0.40, 0.44, 0.50, 0.55, 0.60, 0.70, 0.80].filter(t => t >= minTh);
  const result = {};

  for (const crypto of CRYPTOS) {
    const pos = Math.min(Math.max(1, startBal * riskPct), capsMap[crypto] ?? 500);
    let best = null;
    // If this crypto has a locked threshold, only test that single value
    const thArr = (lockTh?.[crypto] != null) ? [lockTh[crypto]] : TH_SWEEP;

    for (const period of periods) {
      const allSigs = sigsByPeriod[period] || [];
      // Skip under-data periods (same gate as runAutoscan)
      const _minR = period >= 150 ? 3_000 : 8_000;
      if (allSigs.length < _minR) continue;
      const sigs = allSigs.filter(s => s.crypto === crypto);

      for (const th of thArr) {
        let wins = 0, losses = 0, noPm = 0, pnlSum = 0;

        for (const sig of sigs) {
          // ── T+0 ────────────────────────────────────────────────────────
          let direction, entry;
          let t0SpikeQual = false;
          if ((noThreshold || sig.absSpike >= th) && hasStrongBody(sig)) {
            t0SpikeQual = true;
            if (!t0Off) {
              const e0r = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
              const e0  = e0r != null ? Math.min(e0r + slip, 1.0) : null;
              if (e0 != null && e0r >= mn && e0 <= mx) {
                direction = sig.direction;
                entry     = e0;  // slipped price used for PnL
              }
              // spike/body fired but entry out of range → fall through to T+1
            }
          }
          // ── T+1 (only when T+0 did NOT fire) — mirrors fastSim Tier 2/3 cascade ──
          if (!direction && t1Mode && sig.t1) {
            const t1 = sig.t1;
            let t1Dir = null;
            // Tier 2: T+1 own spike + body filter (skipped in TC-only mode)
            const t1Raw = (t1.close - t1.open) / t1.open;
            if (!t1tcOnly && (noThreshold || Math.abs(t1Raw) * 100 >= th) && hasStrongBodyComposite(sig, t1, t1BodyMinPct)) {
              t1Dir = t1Raw > 0 ? 'UP' : 'DOWN';
            }
            // Tier 3: TC cumulative OHLC + body filter
            if (t1Dir === null) {
              const t1Down = t1.close < t1.open;
              const tc = {
                open:  sig.open,
                high:  t1Down ? sig.high : t1.high,
                low:   t1Down ? t1.low   : sig.low,
                close: t1.close,
              };
              const tcRaw = (tc.close - tc.open) / tc.open;
              if ((noThreshold || Math.abs(tcRaw) * 100 >= th) && hasStrongBody(tc, t1BodyMinPct)) {
                t1Dir = tcRaw > 0 ? 'UP' : 'DOWN';
              }
            }
            if (t1Dir !== null) {
              const raw = t1Dir === 'UP' ? sig.yesAsk : sig.noAsk;
              const e1  = raw != null ? Math.min(raw + t1Adj, 1.0) : null;
              if (e1 != null && e1 >= mn && e1 <= mx) { direction = t1Dir; entry = e1; }
            }
          }
          if (!direction && t0SpikeQual && t2Mode && sig.t1 && sig.t2) {
            const t1             = sig.t1;
            const t2             = sig.t2;
            const t0Dir          = sig.direction;
            const continuationOK = t0Dir === 'UP' ? t2.close > t1.close : t2.close < t1.close;
            if (continuationOK) {
              const t2Dir = t0Dir;
              const raw   = t2Dir === 'UP' ? sig.yesAsk : sig.noAsk;
              const e2    = raw != null ? Math.min(raw + t2Adj, 1.0) : null;
              if (e2 != null && e2 >= mn && e2 <= mx) { direction = t2Dir; entry = e2; }
            }
          }
          if (!direction) continue;
          const win = resolveWin(direction, pmOutcome(sig));
          if (win === null) { noPm++; continue; }
          const pnl = win ? pos * (1 - entry) / entry : -pos;
          pnlSum += pnl;
          if (win) wins++; else losses++;
        }

        const total = wins + losses;
        if (total < MIN_TRADES_CRYPTO) continue;
        if (pnlSum <= 0) continue;  // reject any trio with non-positive backtest PnL
        if (wins / total < minWR) continue;  // WR floor — skip low-quality thresholds
        const score = wins / (total + 3);  // pure pessimistic WR
        const evPer = pnlSum / total;

        if (!best || score > best.score || (score === best.score && evPer > best.evPer)) {
          const times = sigs.map(s => s.ts);
          const durDays = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 86400000 : 0;
          best = { period, th, wins, losses, total, noPm, pnlSum, score, evPer, durDays };
        }
      }
    }

    result[crypto] = best;   // null if no (period, th) combo reaches MIN_TRADES_CRYPTO
  }

  return result;
}

function printTrioSweep(sigsByPeriod, periods, mn, mx, capsMap, title, lockTh = null) {
  // When coordination is active, use coordination-aware sweep so per-crypto thresholds
  // reflect the synergy (e.g. ETH=0.12% qualifies more often when XRP also fires ≥0.12%).
  // Exception: when t0Off=true (T1/TC mode), T1 candle data is only available for the last
  // ~5000 minutes (cache), making coord-filtered T1 samples too small for reliable trios.
  // Fall back to sweep3D (independent per-crypto) so all historical T1 data is used.
  const res = (coordMin > 1 && !t0Off)
    ? sweep3DCoord(sigsByPeriod, periods, mn, mx, capsMap)
    : sweep3D(sigsByPeriod, periods, mn, mx, capsMap, lockTh);
  const validCryptos = CRYPTOS.filter(cr => res[cr]);
  if (!validCryptos.length) return;

  const sep = '═'.repeat(Math.max(4, 76 - title.length));
  console.log('\n' + b(`═══ ${title} ${sep}`));
  const capDisplay = CRYPTOS.map(c => `${c}=$${capsMap[c] ?? '?'}`).join(' ');
  console.log(d(`  Price: ${Math.round(mn*100)}¢–${Math.round(mx*100)}¢  Cap: ${capDisplay}  Min trades/crypto: ${MIN_TRADES_CRYPTO}`));
  console.log(d('  Crypto  Best Cxx   Threshold  Trades  WinRate   EV/Trade  Score    ← paste into LIVE UI'));
  console.log(d('  ' + '─'.repeat(78)));

  for (const crypto of CRYPTOS) {
    const row = res[crypto];
    if (!row) {
      process.stdout.write(`  ${crypto.padEnd(6)}  ${$('(insufficient data — keep global threshold)')}\n`);
      continue;
    }
    const wr    = (row.wins / row.total * 100).toFixed(1) + '%';
    const evRaw = row.evPer >= 0 ? `+$${row.evPer.toFixed(3)}` : `-$${Math.abs(row.evPer).toFixed(3)}`;
    const evStr = row.evPer >= 0 ? g(evRaw.padStart(10)) : r(evRaw.padStart(10));
    const scStr = isFinite(row.score)
      ? (row.score >= 0.85 ? g : row.score >= 0.7 ? b : r)(row.score.toFixed(3))
      : $('—');
    process.stdout.write(
      `  ${crypto.padEnd(6)}  C${String(row.period).padEnd(4)}   ${(row.th.toFixed(2)+'%').padStart(9)}  ` +
      `${String(row.total).padStart(6)}  ${wr.padStart(7)}  ${evStr}  ${scStr}\n`
    );
  }

  // ── Consensus analysis ───────────────────────────────────────────────────────
  if (validCryptos.length >= 2) {
    // Count votes per Cxx; ties broken by higher Cxx value (later close = more lag = selectivity)
    const periodCounts = {};
    for (const cr of validCryptos) {
      const p = res[cr].period;
      periodCounts[p] = (periodCounts[p] || 0) + 1;
    }
    const sorted = Object.entries(periodCounts)
      .sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]));
    const consensusPeriod = Number(sorted[0][0]);
    const consensusCount  = sorted[0][1];
    const divergent = validCryptos.filter(cr => res[cr].period !== consensusPeriod);

    if (divergent.length === 0) {
      console.log(g(`\n  ✓ Consensus: ALL ${validCryptos.length} cryptos → C${consensusPeriod}`) +
        d('  No engine change needed — use per-crypto thresholds above.'));
    } else {
      console.log(y(`\n  ⚠ Cxx divergence: ${consensusCount}/${validCryptos.length} agree on C${consensusPeriod}`));
      for (const cr of validCryptos) {
        const row = res[cr];
        const marker = row.period === consensusPeriod ? g(' ✓') : y(' ← differs');
        process.stdout.write(
          `    ${cr}: C${String(row.period).padEnd(4)} th=${row.th.toFixed(2)}%  ` +
          `${row.wins}W/${row.losses}L  score=${row.score.toFixed(3)}${marker}\n`
        );
      }

      // Check if any divergent crypto has a meaningful score gain (>0.02) vs the consensus Cxx
      let bigDivergence = false;
      for (const cr of divergent) {
        const myScore = res[cr].score;
        const th = res[cr].th;
        const sigsAtConsensus = (sigsByPeriod[consensusPeriod] || []).filter(s => s.crypto === cr);
        let w = 0, l = 0;
        for (const sig of sigsAtConsensus) {
          if (sig.absSpike < th) continue;
          const entryRaw = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
          if (entryRaw == null || entryRaw < mn || entryRaw > mx) continue;
          const win = resolveWin(sig.direction, pmOutcome(sig));
          if (win === null) continue;
          if (win) w++; else l++;
        }
        const total2 = w + l;
        const consensusScore = total2 >= MIN_TRADES_CRYPTO ? w / (total2 + 3) : 0;
        if ((myScore - consensusScore) > 0.02) { bigDivergence = true; break; }
      }

      if (bigDivergence) {
        console.log(r(`\n  → Meaningful divergence — consider per-crypto Cxx engine support.`));
        console.log($(`    Compromise: use C${consensusPeriod} with per-crypto thresholds above.`));
      } else {
        console.log($(`\n  → Small divergence — C${consensusPeriod} works for all cryptos.`));
        console.log($(`    Use per-crypto thresholds above at C${consensusPeriod} (engine change not needed).`));
      }
    }
  }

  // ── Revenue projections ─────────────────────────────────────────────────────
  const trioPnl = validCryptos.reduce((s, cr) => s + res[cr].pnlSum, 0);
  const trioDur = validCryptos.reduce((acc, cr) => Math.max(acc, res[cr].durDays || 0), 0);
  const trioW   = validCryptos.reduce((s, cr) => s + res[cr].wins, 0);
  const trioL   = validCryptos.reduce((s, cr) => s + res[cr].losses, 0);
  const trioT   = trioW + trioL;
  const trioWR  = trioT > 0 ? (trioW / trioT * 100).toFixed(1) + '%' : '—';

  if (trioDur > 0) {
    console.log(b(`\n  ── Revenue estimate ──────────────────────────────────────────────────────────`));
    console.log(d(`     Span: ${durFmt(trioDur)}   Trades: ${trioT}  W/L: ${trioW}/${trioL}  WR: ${trioWR}`));
    console.log(`     Backtest P&L : ${pnlStr(trioPnl, 10)}`);
    console.log(`     → 24 h       : ${proj(trioPnl, trioDur,  1, 10)}`);
    console.log(`     → 7 d        : ${proj(trioPnl, trioDur,  7, 10)}`);
    console.log(`     → 30 d       : ${proj(trioPnl, trioDur, 30, 10)}`);
    if (customDay != null) {
      const label = `→ ${customDay} d`.padEnd(13);
      console.log(`     ${label}: ${proj(trioPnl, trioDur, customDay, 10)}`);
    }
  }

  console.log('');
  return { pnl: trioPnl, durDays: trioDur, wins: trioW, losses: trioL, cryptoTrios: res };
}

// ── Quartet: per-(crypto × direction) optimal (Cxx, threshold, min¢, max¢) ───
//
// A "quartet" = (crypto, Cxx, threshold, direction).
// For each crypto × direction we run an independent sweep to find the optimal
// (period, th) — unlike the combined trio which merges both directions.
// Then we compute safe entry price bounds [mn, mx] from those direction-specific
// trades.  This correctly surfaces the DANGER ZONE: low entry price on an UP
// trade means the market is strongly skeptical — the most important filter.
//

// sweep3DDir: like sweep3D but T+0-only for a single direction.
// Returns { [crypto]: { period, th, wins, losses, total, noPm, score, evPer } | null }
function sweep3DDir(sigsByPeriod, periods, mn, mx, capsMap, lockTh, dir) {
  const TH_SWEEP = [0.10, 0.12, 0.14, 0.15, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26, 0.29, 0.32, 0.35, 0.40, 0.44, 0.50, 0.55, 0.60, 0.70, 0.80].filter(t => t >= minTh);
  const result = {};

  for (const crypto of CRYPTOS) {
    const pos   = Math.min(Math.max(1, startBal * riskPct), capsMap[crypto] ?? 500);
    let best    = null;
    const thArr = (lockTh?.[crypto] != null) ? [lockTh[crypto]] : TH_SWEEP;

    for (const period of periods) {
      const allSigsDir = sigsByPeriod[period] || [];
      const _minRD = period >= 150 ? 3_000 : 8_000;
      if (allSigsDir.length < _minRD) continue;
      const sigs = allSigsDir.filter(s => s.crypto === crypto && s.direction === dir);

      for (const th of thArr) {
        let wins = 0, losses = 0, noPm = 0, pnlSum = 0;

        for (const sig of sigs) {
          if (sig.absSpike < th || !hasStrongBody(sig)) continue;
          const rawFull = dir === 'UP' ? sig.yesAsk : sig.noAsk;
          if (rawFull == null || rawFull < mn) continue;
          const entry = Math.min(rawFull + slip, 1.0);
          if (entry > mx) continue;
          const outcome = pmOutcome(sig);
          const win = resolveWin(dir, outcome);
          if (win === null) { noPm++; continue; }
          const pnl   = win ? pos * (1 - entry) / entry : -pos;
          pnlSum += pnl;
          if (win) wins++; else losses++;
        }

        const total = wins + losses;
        if (total < MIN_TRADES_CRYPTO) continue;
        if (pnlSum <= 0) continue;
        if (wins / total < minWR) continue;
        const score = wins / (total + 3);
        const evPer = pnlSum / total;

        if (!best || score > best.score || (score === best.score && evPer > best.evPer)) {
          best = { period, th, wins, losses, total, noPm, score, evPer };
        }
      }
    }

    result[crypto] = best || null;
  }
  return result;
}

// ── Coordination-aware per-crypto sweep ──────────────────────────────────────
//
// When coordMin > 1, sweep3D evaluates each crypto independently (no coordination).
// This finds high thresholds (0.24%+) that look good solo but miss D2's synergy.
//
// sweep3DCoord instead evaluates each crypto WITH the coordination context from
// the other three:
//   1. Run sweep3D once → initThMap (independent per-crypto thresholds)
//   2. For each target crypto C:
//      - Build "other-cryptos coordination sets" using initThMap
//        (a cycle qualifies if ≥ coordMin-1 OTHER cryptos fired at their initThMap threshold)
//      - Sweep thresholds for C: score only C-signals that occur in those qualified cycles
//      - Rank by total PnL contribution (revenue criterion, not WR) → finds lower thresholds
//        like ETH=0.12%, SOL=0.12% that benefit from coordination synergy
//
// Returns same shape as sweep3D: { [crypto]: { period, th, wins, losses, total, score, ... } }
// Optional `preInitThMap` skips the internal sweep3D call if already computed.
//
function sweep3DCoord(sigsByPeriod, periods, mn, mx, capsMap, preInitThMap = null) {
  const TH_SWEEP = [0.10, 0.12, 0.14, 0.15, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26, 0.29, 0.32, 0.35, 0.40, 0.44, 0.50].filter(t => t >= minTh);

  // Step 1: get initial per-crypto thresholds from independent sweep (if not pre-supplied)
  const initThMap = preInitThMap ?? (() => {
    const r = sweep3D(sigsByPeriod, periods, mn, mx, capsMap);
    const m = {};
    for (const crypto of CRYPTOS) m[crypto] = r[crypto]?.th ?? globalTh;
    return m;
  })();

  const result = {};

  for (const targetCrypto of CRYPTOS) {
    const pos = Math.min(Math.max(1, startBal * riskPct), capsMap[targetCrypto] ?? 500);
    let best = null;

    for (const period of periods) {
      const allSigs = sigsByPeriod[period] || [];
      const _minR = period >= 150 ? 3_000 : 8_000;
      if (allSigs.length < _minR) continue;
      // Build coordination sets from OTHER cryptos using initThMap.
      // A cycle key qualifies if ≥ coordMin-1 OTHER cryptos fired.
      const otherCoordSets = {};
      for (const sig of allSigs) {
        if (sig.crypto === targetCrypto) continue;
        if (!hasStrongBody(sig)) continue;
        if (sig.absSpike < (initThMap[sig.crypto] ?? globalTh)) continue;
        if (dirFilter !== 'BOTH' && sig.direction !== dirFilter) continue;
        if (skipHoursSet.size && skipHoursSet.has(new Date(sig.cycleStartMs).getUTCHours())) continue;
        if (skipDowSet.size   && skipDowSet.has(new Date(sig.cycleStartMs).getUTCDay()))   continue;
        const ck = `${sig.cycleStartMs}:${sig.direction}`;
        (otherCoordSets[ck] = otherCoordSets[ck] ?? new Set()).add(sig.crypto);
      }

      const targetSigs = allSigs.filter(s => s.crypto === targetCrypto);

      for (const th of TH_SWEEP) {
        let wins = 0, losses = 0, noPm = 0, pnlSum = 0;

        for (const sig of targetSigs) {
          if (skipHoursSet.size && skipHoursSet.has(new Date(sig.cycleStartMs).getUTCHours())) continue;
          if (skipDowSet.size   && skipDowSet.has(new Date(sig.cycleStartMs).getUTCDay()))   continue;

          // T0 spike quality check (always required — mirrors fastSim which also checks T0 spike
          // before deciding whether to place T0 or cascade to T1/TC when t0Off=true)
          if (sig.absSpike < th || !hasStrongBody(sig)) continue;
          if (dirFilter !== 'BOTH' && sig.direction !== dirFilter) continue;

          // Require coordMin-1 OTHER cryptos to have already qualified in this cycle (T0-based)
          const ck = `${sig.cycleStartMs}:${sig.direction}`;
          if ((otherCoordSets[ck]?.size ?? 0) < coordMin - 1) continue;

          let entryDir, entryPrice;

          if (!t0Off) {
            // T+0 entry (default)
            const rawEntry = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
            if (rawEntry == null || rawEntry < mn) continue;
            entryPrice = Math.min(rawEntry + slip, 1.0);
            if (entryPrice > mx) continue;
            entryDir = sig.direction;
          } else if (t1Mode && sig.t1) {
            // T+1 / TC entry (t0Off mode) — T0 spike+coord already passed above, now cascade
            const t1 = sig.t1;
            let t1Dir = null;
            const t1Raw = (t1.close - t1.open) / t1.open;
            if (!t1tcOnly && Math.abs(t1Raw) * 100 >= th && hasStrongBodyComposite(sig, t1, t1BodyMinPct)) {
              t1Dir = t1Raw > 0 ? 'UP' : 'DOWN';
            }
            if (t1Dir === null) {
              const t1Down = t1.close < t1.open;
              const tc = { open: sig.open, high: t1Down ? sig.high : t1.high, low: t1Down ? t1.low : sig.low, close: t1.close };
              const tcRaw = (tc.close - tc.open) / tc.open;
              if (Math.abs(tcRaw) * 100 >= th && hasStrongBody(tc, t1BodyMinPct)) {
                t1Dir = tcRaw > 0 ? 'UP' : 'DOWN';
              }
            }
            if (t1Dir === null) continue;
            const rawEntry = t1Dir === 'UP' ? sig.yesAsk : sig.noAsk;
            if (rawEntry == null) continue;
            entryPrice = Math.min(rawEntry + t1Adj, 1.0);
            if (entryPrice < mn || entryPrice > mx) continue;
            entryDir = t1Dir;
          } else {
            continue; // t0Off but no T1 data or T1 mode not active
          }

          const outcome = pmOutcome(sig);
          const win = resolveWin(entryDir, outcome);
          if (win === null) { noPm++; continue; }
          const pnl = win ? pos * (1 - entryPrice) / entryPrice : -pos;
          pnlSum += pnl;
          if (win) wins++; else losses++;
        }

        const total = wins + losses;
        if (total < MIN_TRADES_CRYPTO) continue;
        if (wins / total < minWR) continue;
        const score = wins / (total + 3);
        const evPer = total > 0 ? pnlSum / total : 0;
        // Rank by total PnL contribution — lower thresholds with coordination synergy win here
        if (!best || pnlSum > best.pnlSum || (pnlSum === best.pnlSum && score > best.score)) {
          const times = targetSigs.map(s => s.ts);
          const durDays = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 86400000 : 0;
          best = { period, th, wins, losses, total, noPm, pnlSum, score, evPer, durDays };
        }
      }
    }

    result[targetCrypto] = best ?? null;
  }

  return result;
}

// calcPriceRange: for direction-specific optimal (period, th), collect qualifying
// T+0 trades and find safe [mn, mx] entry price bounds (integer cents).
// Returns { [crypto]: { trades:[{raw,win}], mn:int|null, mx:int|null } | null }
function calcPriceRange(sigsByPeriod, trioDirResult, globalMn, dir, wrFloor = 0.85, minT = 5) {
  const MIN_FLOORS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
  const MAX_CAPS   = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 89, 90, 93, 95];
  const out = {};

  const findMin = arr => {
    if (arr.length < minT) return null;
    for (const floorCap of MIN_FLOORS) {
      const sub = arr.filter(t => t.raw * 100 >= floorCap);
      if (sub.length < minT) return null;
      const wins = sub.filter(t => t.win).length;
      if (wins / sub.length >= wrFloor) return floorCap;
    }
    return null;
  };
  const findMax = arr => {
    if (arr.length < minT) return null;
    let best = null;
    for (const cap of MAX_CAPS) {
      const sub = arr.filter(t => t.raw * 100 <= cap);
      if (sub.length < minT) continue;
      const wins = sub.filter(t => t.win).length;
      if (wins / sub.length >= wrFloor) best = cap;
    }
    return best;
  };

  for (const crypto of CRYPTOS) {
    const t = trioDirResult?.[crypto];
    if (!t) { out[crypto] = null; continue; }

    const sigs = (sigsByPeriod[t.period] || []).filter(s => s.crypto === crypto && s.direction === dir);
    const trades = [];

    for (const sig of sigs) {
      if (sig.absSpike < t.th || !hasStrongBody(sig)) continue;
      const rawFull = dir === 'UP' ? sig.yesAsk : sig.noAsk;
      if (rawFull == null || rawFull < globalMn) continue;
      const raw = Math.round(rawFull * 100) / 100;
      const win = resolveWin(dir, pmOutcome(sig));
      if (win === null) continue;
      trades.push({ raw, win });
    }

    out[crypto] = { trades, mn: findMin(trades), mx: findMax(trades) };
  }
  return out;
}

// buildQuartet: run direction-filtered sweeps per direction, then price range analysis.
// Returns { [crypto]: { UP: {period,th,mn,mx,trades} | null, DOWN: ... } }
function buildQuartet(sigsByPeriod, periods, globalMn, globalMx, caps, lockThMap) {
  const quartet = {};
  for (const dir of ['UP', 'DOWN']) {
    const trioDir  = sweep3DDir(sigsByPeriod, periods, globalMn, globalMx, caps, lockThMap, dir);
    const priceRng = calcPriceRange(sigsByPeriod, trioDir, globalMn, dir);
    for (const crypto of CRYPTOS) {
      if (!quartet[crypto]) quartet[crypto] = {};
      const t  = trioDir[crypto];
      const pr = priceRng[crypto];
      quartet[crypto][dir] = t ? {
        period: t.period,
        th    : t.th,
        mn    : pr?.mn ?? null,   // integer cents or null
        mx    : pr?.mx ?? null,
        trades: pr?.trades ?? [],
      } : null;
    }
  }
  return quartet;
}

// printQuartetAnalysis: shows per-(crypto × direction) Cxx/th/mn/mx + bucket breakdown.
function printQuartetAnalysis(quartet, label) {
  const BUCKETS = [[5,20],[20,35],[35,50],[50,65],[65,75],[75,85],[85,95]];
  console.log('\n' + b(`═══ QUARTET ANALYSIS — ${label} ═══`));
  console.log(d('  Each (crypto × direction) has its own optimal (Cxx, threshold, min¢, max¢)'));
  console.log(d('  Min = lowest floor where WR ≥ 85% (below = DANGER ZONE)\n'));
  console.log(d('  Crypto  Dir   Cxx    Threshold  Trades   WinRate  Min↑  Max↑   Price buckets (W/L)'));
  console.log(d('  ' + '─'.repeat(100)));

  for (const crypto of CRYPTOS) {
    for (const dir of ['UP', 'DOWN']) {
      const q = quartet?.[crypto]?.[dir];
      if (!q) {
        process.stdout.write(`  ${crypto.padEnd(6)}  ${dir.padEnd(4)}  ${$('(no data)')}\n`);
        continue;
      }
      const arr = q.trades;
      if (!arr.length) {
        process.stdout.write(
          `  ${crypto.padEnd(6)}  ${dir.padEnd(4)}  C${String(q.period).padEnd(4)}  ${(q.th?.toFixed(2)+'%').padStart(9)}  ${$('(no trades)')}\n`
        );
        continue;
      }
      const wins  = arr.filter(t => t.win).length;
      const wr    = (wins / arr.length * 100).toFixed(1) + '%';
      const mn = q.mn, mx = q.mx;
      const mnStr = mn == null ? r('  ?')
        : mn <= 5  ? g(' 5¢')
        : mn <= 20 ? y(`${mn}¢`)
        : r(`${mn}¢`);
      const mxStr = mx == null ? r('  ?')
        : mx >= 85 ? d(`${mx}¢`)
        : mx >= 70 ? y(`${mx}¢`)
        : r(`${mx}¢`);
      const bktStr = BUCKETS.map(([lo, hi]) => {
        const sub = arr.filter(t => t.raw * 100 > lo && t.raw * 100 <= hi);
        if (!sub.length) return null;
        const w = sub.filter(t => t.win).length;
        const s = `${lo}-${hi}¢:${w}W/${sub.length - w}L`;
        return (sub.length - w) > 0 ? r(s) : g(s);
      }).filter(Boolean).join('  ');
      process.stdout.write(
        `  ${crypto.padEnd(6)}  ${dir.padEnd(4)}  C${String(q.period).padEnd(4)}  ${(q.th?.toFixed(2)+'%').padStart(9)}  ` +
        `${String(arr.length).padStart(6)}   ${wr.padStart(6)}   ${mnStr}  ${mxStr}   ${bktStr}\n`
      );
    }
  }
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {

  // ── Banner ────────────────────────────────────────────────────────────────

  console.log('\n' + b(y('╔══ T1000 Combined Simulator ══════════════════════════════════════════════════╗')));
  console.log(b(y('║')) + (kalMode
    ? '  Polymarket + Kalshi — BTC / ETH / SOL / XRP                               '
    : '  Polymarket — BTC / ETH / SOL / XRP  (add -kal to include Kalshi)          ') + b(y('║')));
  console.log(b(y('╚══════════════════════════════════════════════════════════════════════════════╝')));
  const fmtThMap = m => Object.entries(m).map(([c,v]) => `${c}:${v.toFixed(2)}%`).join(' ');
  let thDisplay;
  if (hasTrioMap) {
    thDisplay = `triomap(${trioMap.size} pairs)`;
  } else if (Object.keys(perCryptoTh5m).length || Object.keys(perCryptoTh15m).length) {
    thDisplay = (Object.keys(perCryptoTh5m).length  ? `5m[${fmtThMap(perCryptoTh5m)}]`  : '') +
                (Object.keys(perCryptoTh15m).length ? ` 15m[${fmtThMap(perCryptoTh15m)}]` : '');
  } else if (Object.keys(perCryptoTh).length) {
    thDisplay = fmtThMap(perCryptoTh);
  } else {
    thDisplay = `${globalTh.toFixed(2)}%`;
  }
  const csDisplay = (!hasTrioMap && csFilter) ? `  Candle sizes: ${[...csFilter].sort((a,b)=>a-b).join(', ')}` : '';
  const capsDisplayPM  = CRYPTOS.map(c => `${polMaxByCrypto[c]}/${polMaxByCrypto15m[c]}`).join('/');
  const capsDisplayKal = kalMode ? `  Kal: ${CRYPTOS.map(c => kalMaxByCrypto[c]).join('/')}` : '';
  console.log($(`  Balance: $${startBal}  Risk: ${(riskPct*100).toFixed(0)}%  ` +
    `PM caps: ${capsDisplayPM}${capsDisplayKal}  ` +
    `Threshold: ${thDisplay}  Price: ${minCents}–${maxCents}¢${csDisplay}`));
  console.log($(`  Cryptos: ${CRYPTOS.join(', ')}`));
  console.log($(`  Slippage: ${(slip*100).toFixed(0)}¢ per T+0 entry${slip === 0 ? ' (DISABLED — optimistic)' : ''}`));
  if (t1Mode) {
    console.log($(`  T+1 mode: ON  T+1 entry adj: +${(t1Adj*100).toFixed(0)}¢ (market repricing over one candle)`));
  }
  if (t2Mode) {
    const adjStr = t2Adj > 0 ? `  T+2 entry adj: +${(t2Adj*100).toFixed(0)}¢ (realistic CLOB repricing)` : `  T+2 entry adj: none (optimistic — T+0 prices)`;
    console.log($(`  T+2 mode: ON${adjStr}`));
  }

  if (hasDateFilter) {
    const fromStr = dateFromMs ? localTime(dateFromMs) + ' EAT' : '—';
    const toStr   = dateToMs   ? localTime(dateToMs)   + ' EAT' : '—';
    console.log(y(`\n  Date filter: ${fromStr}  →  ${toStr}`));
  } else {
    console.log($('  Date filter: none (full dataset)'));
  }

  // ── Fetch PM outcomes ─────────────────────────────────────────────────────

  if (!noFetch) {
    const requests = [];
    const allPeriods = [...PERIODS_5M, ...PERIODS_15M];
    for (const period of allPeriods) {
      const dur = period >= 150 ? 900 : 300;
      for (const sig of loadSignals(period, dur)) {
        requests.push({ crypto: sig.crypto, cycleStartMs: sig.cycleStartMs, durationSecs: dur });
      }
    }
    if (requests.length) {
      let anyNew = false;
      await pm.fetchOutcomes(requests, (done, total, msg) => {
        if (!anyNew) { process.stdout.write('\n'); anyNew = true; }
        process.stdout.write(`  ${msg}\n`);
      });
      if (!anyNew) process.stdout.write(`\n  PM outcomes: all ${requests.length} signals already cached.\n`);
    }
  }

  // ── Pre-load signal caches ────────────────────────────────────────────────

  const sigs5m  = {};
  const sigs15m = {};
  for (const p of PERIODS_5M)  sigs5m[p]  = loadSignals(p,  300);
  for (const p of PERIODS_15M) sigs15m[p] = loadSignals(p,  900);

  // ── Normalize: clip all Cxx to the same start date so scores are comparable ─
  // Finds the newest Cxx period (the one whose earliest signal is most recent),
  // then trims every other period to that same start date.
  // Without this, older modulo-5 Cxx (C65, C70…) have more history than the
  // non-mod-5 Cxx added later (C81–C92, C157–C175) and score artificially
  // higher due to sample size, not strategy quality.
  for (const [sigsMap, label] of [[sigs5m, '5m'], [sigs15m, '15m']]) {
    let commonStart = 0;
    for (const sigs of Object.values(sigsMap)) {
      if (!sigs.length) continue;
      const first = sigs.reduce((m, s) => s.cycleStartMs < m ? s.cycleStartMs : m, Infinity);
      if (first > commonStart) commonStart = first;
    }
    if (commonStart > 0) {
      for (const p of Object.keys(sigsMap)) {
        sigsMap[p] = sigsMap[p].filter(s => s.cycleStartMs >= commonStart);
      }
      const counts = Object.values(sigsMap).map(s => s.length);
      const totalRows = counts.reduce((a, b) => a + b, 0);
      console.log($(`  [norm-${label}] common start: ${localTime(commonStart)} EAT — ${totalRows.toLocaleString()} rows across ${counts.length} periods\n`));
    }
  }

  // ── DEEPSCAN mode ─────────────────────────────────────────────────────────
  if (dsMode) {
    await runDeepscan(sigs5m, sigs15m, dsFine, dsThorough);
    return;
  }

  // Compute actual date range of loaded data for display
  const allTs = [...Object.values(sigs5m), ...Object.values(sigs15m)]
    .flat().map(s => s.cycleStartMs).filter(Boolean);
  const dataFirst = allTs.length ? new Date(Math.min(...allTs)) : null;
  const dataLast  = allTs.length ? new Date(Math.max(...allTs)) : null;
  if (dataFirst && dataLast) {
    console.log($(`  Data range (after filter): ${localTime(dataFirst.getTime())} → ${localTime(dataLast.getTime())} EAT\n`));
  }

  // ── UNIFIED MODE (when per-crypto thresholds are provided) ──────────────────
  // Merges all selected periods into one chronological trade list.
  // Skips separate Polymarket / Kalshi sections — not relevant for validation.

  if (hasPerCryptoTh) {
    const res = simUnified();
    // With -triomap, always show the full trade list (trio per trade is the point).
    // With -thc/-thc5m/-thc15m only (no triomap), require -vb to print rows.
    if (hasTrioMap || verbose) {
      printUnified(res);
    } else {
      const wr = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
      console.log(`\n  Unified: W:${res.wins}  L:${res.losses}  WR:${wr}  ` +
        `PnL: ${res.pnl >= 0 ? '+' : ''}$${res.pnl.toFixed(2)}  ` +
        `Final: $${res.finalBalance.toFixed(2)}  (${res.total} trades, ${res.noPm} no-PM)`);
    }
    // ── Kalshi simUnified in triomap mode (when -kal is set) ─────────────────
    // The kalMode block (line ~1946) is never reached because of the return below.
    // So we run the Kalshi unified simulation here before writing JSON.
    let unifiedKalshi = null;
    if (kalMode) {
      try {
        const kalshiJsonPath = path.join(LOG_DIR, 'autoscan_kalshi.json');
        const kalshiSaved = JSON.parse(fs.readFileSync(kalshiJsonPath, 'utf8'));
        const kalTrios = kalshiSaved?.trio15m ?? {};
        const kalTrioMap     = new Map();
        const kalTrioPeriods = new Set();
        for (const [crypto, row] of Object.entries(kalTrios)) {
          if (row?.period && row?.th != null) {
            const period = parseInt(String(row.period).replace(/^[Cc]/, ''), 10);
            if (isNaN(period)) continue;
            kalTrioMap.set(`${crypto}:${period}`, row.th);
            kalTrioPeriods.add(period);
          }
        }
        if (kalTrioMap.size > 0) {
          console.log('\n' + b(bl('═══ KALSHI UNIFIED RESULT (fast mode — saved trios) ════════════════════')));
          unifiedKalshi = simUnified(kalTrioMap, kalTrioPeriods, kalMaxByCrypto);
          printUnified(unifiedKalshi);
        }
      } catch (e) {
        console.warn('  [kal-fast] Could not load autoscan_kalshi.json:', e.message);
      }
    }

    // Write JSON output for sweep_params.js Phase 2 consumption
    if (jsonOutPath && res.total > 0) {
      const proj = (pnl, dur, days) => parseFloat((startBal * (Math.pow((startBal + pnl) / startBal, days / dur) - 1)).toFixed(2));
      const dur = res.durDays;
      let projCombined = null, proj5mOut = null, proj15mOut = null;
      if (dur > 0 && res.trades.length > 0) {
        projCombined = { pnl: parseFloat(res.pnl.toFixed(2)), durDays: parseFloat(dur.toFixed(2)),
          proj1d: proj(res.pnl, dur, 1), proj7d: proj(res.pnl, dur, 7), proj30d: proj(res.pnl, dur, 30) };
        const has5m  = res.trades.some(t => t.period < 150);
        const has15m = res.trades.some(t => t.period >= 150);
        if (has5m && has15m) {
          for (const { key, f15 } of [{ key: '5m', f15: false }, { key: '15m', f15: true }]) {
            const ts   = res.trades.filter(t => (t.period >= 150) === f15);
            const tpnl = ts.reduce((s, t) => s + t.pnl, 0);
            const ratio = tpnl / res.pnl;
            const gfC   = (startBal + res.pnl) / startBal;
            const pC    = (days) => startBal * (Math.pow(gfC, days / dur) - 1);
            const obj = { pnl: parseFloat(tpnl.toFixed(2)), ratio: parseFloat(ratio.toFixed(4)),
              proj1d: parseFloat((pC(1) * ratio).toFixed(2)), proj7d: parseFloat((pC(7) * ratio).toFixed(2)),
              proj30d: parseFloat((pC(30) * ratio).toFixed(2)) };
            if (key === '5m') proj5mOut = obj; else proj15mOut = obj;
          }
        }
      }
      let kalshiOut = null;
      if (unifiedKalshi) {
        // Build per-crypto trios from trade list (wins/losses/pnl per crypto)
        const kalTrades = unifiedKalshi.trades || [];
        const kalTriosOut = {};
        try {
          const kalshiSaved2 = JSON.parse(fs.readFileSync(path.join(LOG_DIR, 'autoscan_kalshi.json'), 'utf8'));
          for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
            const row = kalshiSaved2?.trio15m?.[cr];
            if (!row) continue;
            const crTrades = kalTrades.filter(t => t.crypto === cr);
            const w = crTrades.filter(t => t.outcome === 'WIN').length;
            const l = crTrades.filter(t => t.outcome === 'LOSS').length;
            const p = parseFloat(crTrades.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2));
            kalTriosOut[cr] = {
              period: parseInt(String(row.period).replace('C', '')),
              th: row.th, wins: w, losses: l, total: w + l, pnl: p,
              score: parseFloat((w / (w + l + 3)).toFixed(4)),
            };
          }
        } catch (e) { /* no trios if file unreadable */ }
        kalshiOut = {
          top: null,
          trios: kalTriosOut,
          durDays: parseFloat((unifiedKalshi.durDays || 0).toFixed(2)),
          wins:    unifiedKalshi.wins    || 0,
          losses:  unifiedKalshi.losses  || 0,
          pnl:     parseFloat((unifiedKalshi.pnl    || 0).toFixed(2)),
          trades: (unifiedKalshi.trades || []).map(t => ({
            time: t.time, crypto: t.crypto, direction: t.direction, label: t.label || 'T0',
            entry: parseFloat((t.entry * 100).toFixed(1)),
            spikePct: parseFloat((t.spikePct || 0).toFixed(3)),
            outcome: t.outcome, pnl: parseFloat(t.pnl.toFixed(2)),
            balance: parseFloat(t.balance.toFixed(2)), pos: parseFloat((t.pos || 0).toFixed(2)),
            period: t.period,
          })),
        };
      }
      fs.writeFileSync(jsonOutPath, JSON.stringify({
        params: { startBal, riskPct: parseFloat((riskPct * 100).toFixed(2)), minCents, maxCents,
          th: globalTh, maxPos,
          slip: parseFloat((slip * 100).toFixed(1)), body: bodyMinPct,
          t1Mode, t1tc: t1tcOnly, t1Adj: parseFloat((t1Adj * 100).toFixed(1)) },
        unified: {
          wins: res.wins, losses: res.losses, total: res.total,
          winRate: parseFloat((res.wins / res.total).toFixed(4)),
          pnl: parseFloat(res.pnl.toFixed(2)), finalBalance: parseFloat(res.finalBalance.toFixed(2)),
          durDays: parseFloat(dur.toFixed(2)), noPm: res.noPm,
          cbSkipped: res.cbSkipped ?? 0, volSkipped: res.volSkipped ?? 0,
          exhaustSkipped: res.exhaustSkipped ?? 0, coordSkipped: res.coordSkipped ?? 0,
          trades: res.trades.map(t => ({
            time: t.time, crypto: t.crypto, direction: t.direction, label: t.label || 'T0', period: t.period,
            entry: parseFloat((t.entry * 100).toFixed(1)),
            spikePct: parseFloat((t.spikePct || 0).toFixed(3)),
            outcome: t.outcome, pnl: parseFloat(t.pnl.toFixed(2)),
            balance: parseFloat(t.balance.toFixed(2)), pos: parseFloat((t.pos || 0).toFixed(2)),
          })),
        },
        projections: { combined: projCombined, pm5m: proj5mOut, pm15m: proj15mOut },
        autoscanKalshi: kalshiOut,
        bots: (numBots > 1) ? (() => {
          const bot0 = { id: 1, startBal: parseFloat(botStartBals[0].toFixed(2)), finalBal: parseFloat(res.finalBalance.toFixed(2)), wins: res.wins, losses: res.losses, pnl: parseFloat(res.pnl.toFixed(2)), history: [parseFloat(botStartBals[0].toFixed(2)), ...res.trades.map(t => t.balance)] };
          const botsArr = [bot0];
          for (let i = 1; i < botStartBals.length; i++) {
            const b0 = botStartBals[i];
            let bal = b0, wins = 0, losses = 0, totalPnl = 0;
            const history = [parseFloat(b0.toFixed(2))];
            for (const tr of res.trades) {
              const pos = Math.min(Math.max(1, bal * riskPct), tr.capUsd ?? 500);
              const pnl = tr.wasWin ? pos * (1 - tr.entry) / tr.entry : -pos;
              bal = Math.max(0, bal + pnl); totalPnl += pnl;
              if (tr.wasWin) wins++; else losses++;
              history.push(parseFloat(bal.toFixed(2)));
            }
            botsArr.push({ id: i + 1, startBal: parseFloat(b0.toFixed(2)), finalBal: parseFloat(bal.toFixed(2)), wins, losses, pnl: parseFloat(totalPnl.toFixed(2)), history });
          }
          return botsArr;
        })() : null,
      }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── POLYMARKET SECTION ────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + b(c('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
  console.log(b(c('   POLYMARKET  (5-min + 15-min markets — PM-resolved outcomes)')));
  console.log(b(c('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));

  let trio5m = null, trio15m = null, trioKalshi = null;
  let top5m  = null, top15m  = null, topKalshi  = null;  // promoted for JSON output
  let quartet5m = null, quartet15m = null;               // promoted for JSON output
  let unifiedKalshi = null;  // unified simulation for Kalshi (comparable to PM 15m unified)

  if (autoscan) {
    // Run autoscan separately for 5m and 15m
    const pmJsonPath = path.join(LOG_DIR, 'autoscan_v2.json');
    console.log('\n' + b('  5-Minute Markets'));
    { const r = runAutoscan(sigs5m,  PERIODS_5M,  'POLYMARKET 5-MIN',  pmJsonPath, writeResultPath, polMaxByCrypto);    top5m  = r.top; trio5m = r.trio; quartet5m  = r.quartet; }
    console.log('\n' + b('  15-Minute Markets'));
    { const r = runAutoscan(sigs15m, PERIODS_15M, 'POLYMARKET 15-MIN', pmJsonPath, writeResultPath, polMaxByCrypto15m); top15m = r.top; trio15m = r.trio; quartet15m = r.quartet; }
    // Full results at best autoscan params
    if (top5m)  simPeriod(top5m.period,  300, polMaxByCrypto,    top5m.th);
    if (top15m) simPeriod(top15m.period, 900, polMaxByCrypto15m, top15m.th);
  } else {
    const results5m  = PERIODS_5M .map(p => simPeriod(p, 300, polMaxByCrypto));
    const results15m = PERIODS_15M.map(p => simPeriod(p, 900, polMaxByCrypto15m));
    printSummary(results5m,  'POLYMARKET — 5-MIN MARKETS (C65/C70/C75/C80–C92/C95)');
    printSummary(results15m, 'POLYMARKET — 15-MIN MARKETS (C150/C157–C175/C180/C195/C210/C225)');
    if (verbose) { const ur = simUnified(); printUnified(ur); }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── KALSHI SECTION (only when -kal flag is set) ───────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (kalMode) {
    console.log('\n' + b(bl('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
    console.log(b(bl('   KALSHI  (15-min markets — PM outcomes as proxy)')));
    console.log(b(bl('   ⚠  Prices: Polymarket 15m CLOB ask proxy (real Kalshi prices once DB fills)')));
    console.log(b(bl('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));

    if (autoscan) {
      const kalshiJsonPath = path.join(LOG_DIR, 'autoscan_kalshi.json');
      ({ top: topKalshi, trio: trioKalshi } = runAutoscan(sigs15m, PERIODS_15M, 'KALSHI 15-MIN', kalshiJsonPath, null, kalMaxByCrypto));
      if (topKalshi) simPeriod(topKalshi.period, 900, kalMaxByCrypto, topKalshi.th);
      // Run Kalshi unified simulation (compounding, per-crypto trios, Kalshi caps)
      // This makes Kalshi PnL comparable to PM 15m (same methodology, same signals).
      if (trioKalshi?.cryptoTrios) {
        const kalTrioMap     = new Map();
        const kalTrioPeriods = new Set();
        for (const [crypto, row] of Object.entries(trioKalshi.cryptoTrios)) {
          if (row) { kalTrioMap.set(`${crypto}:${row.period}`, row.th); kalTrioPeriods.add(row.period); }
        }
        if (kalTrioMap.size > 0) {
          console.log('\n' + b(bl('═══ KALSHI UNIFIED RESULT (per-crypto trios, Kalshi caps) ══════════════════')));
          unifiedKalshi = simUnified(kalTrioMap, kalTrioPeriods, kalMaxByCrypto);
          printUnified(unifiedKalshi);
        }
      }
    } else {
      const resultsK = PERIODS_15M.map(p => simPeriod(p, 900, kalMaxByCrypto));
      printSummary(resultsK, 'KALSHI — 15-MIN MARKETS (C150–C225)');
    }
  }

  // ── Autoscan unified simulation + projected revenue ──────────────────────────
  if (autoscan) {
    // Build combined triomap from per-crypto sweep results (PM 5m + PM 15m)
    const asTrioMap     = new Map();
    const asTrioPeriods = new Set();
    for (const [crypto, row] of Object.entries(trio5m?.cryptoTrios  ?? {})) {
      if (row) { asTrioMap.set(`${crypto}:${row.period}`, row.th); asTrioPeriods.add(row.period); }
    }
    for (const [crypto, row] of Object.entries(trio15m?.cryptoTrios ?? {})) {
      if (row) { asTrioMap.set(`${crypto}:${row.period}`, row.th); asTrioPeriods.add(row.period); }
    }

    // Run constrained unified simulation (respects -maxpos, shared capital pool)
    let unifiedRes = null;
    if (asTrioMap.size > 0) {
      console.log('\n' + b(y('═══ AUTOSCAN UNIFIED RESULT (best trios combined) ══════════════════════════')));
      unifiedRes = simUnified(asTrioMap, asTrioPeriods);
      printUnified(unifiedRes);
    }

    // ── Projected revenue — based on constrained simulation only ──────────────
    // Uses unifiedRes (maxpos-enforced, shared capital) as the single source of truth.
    // Compound projection: bet size grows with balance (riskPct × current balance),
    // so gains naturally compound — same mechanic as the actual simulation.
    // Kalshi shown separately (no shared-slot contention with PM in current engine).
    const dayHdr = customDay != null ? ` ${'→'+customDay+'d'.padStart(7)}` : '';
    const sepW   = 51 + (customDay != null ? 9 : 0);
    console.log('\n' + b(y('═══ PROJECTED REVENUE (constrained simulation) ══════════════════════════════')));
    if (recoverMode) console.log(d('  (P&L adjusted for TONE early exits at ' + (recoverExit * 100).toFixed(0) + '¢)'));
    console.log(d(`  Backtest window: ${unifiedRes ? unifiedRes.durDays.toFixed(1) : '?'} days  |  maxpos: ${maxPos ?? '∞'}  |  compound growth (bet scales with balance)`));
    console.log(d(
      `  ${'Strategy'.padEnd(10)} ${'Actual PnL'.padStart(11)} ${'→24h'.padStart(8)} ${'→7d'.padStart(8)} ${'→30d'.padStart(8)}${dayHdr}`
    ));
    console.log(d('  ' + '─'.repeat(sepW)));

    const projRows = [];

    // PM split rows (5m vs 15m) + combined total
    if (unifiedRes && unifiedRes.durDays > 0 && unifiedRes.trades.length > 0) {
      const has5m  = unifiedRes.trades.some(t => t.period < 150);
      const has15m = unifiedRes.trades.some(t => t.period >= 150);

      // Show split breakdown when both timeframes have trades.
      // Projections are proportional shares of the combined projection so they add up correctly
      // (independent compound growth from startBal would double-count capital and diverge).
      if (has5m && has15m) {
        const gfC  = (startBal + unifiedRes.pnl) / startBal;
        const projC = (days) => startBal * (Math.pow(gfC, days / unifiedRes.durDays) - 1);
        for (const { label, f15 } of [{ label: 'PM(5m)', f15: false }, { label: 'PM(15m)', f15: true }]) {
          const ts  = unifiedRes.trades.filter(t => (t.period >= 150) === f15);
          const pnl = ts.reduce((s, t) => s + t.pnl, 0);
          if (Math.abs(pnl) > 0.01 && Math.abs(unifiedRes.pnl) > 0.01) {
            const ratio = pnl / unifiedRes.pnl;
            const fmtS = (days) => {
              const p   = projC(days) * ratio;
              const raw = p >= 0 ? `+$${p.toFixed(0)}` : `-$${Math.abs(p).toFixed(0)}`;
              return p >= 0 ? g(raw.padStart(8)) : r(raw.padStart(8));
            };
            process.stdout.write(
              `  ${label.padEnd(10)} ${pnlStr(pnl, 11)} ${fmtS(1)} ${fmtS(7)} ${fmtS(30)}` +
              (customDay != null ? ` ${fmtS(customDay)}` : '') + '\n'
            );
          }
        }
        console.log(d('  ' + '─'.repeat(sepW)));
      }

      // Combined PM row
      const gf   = (startBal + unifiedRes.pnl) / startBal;
      const fmtP = (days) => {
        const p   = startBal * (Math.pow(gf, days / unifiedRes.durDays) - 1);
        const raw = p >= 0 ? `+$${p.toFixed(0)}` : `-$${Math.abs(p).toFixed(0)}`;
        return p >= 0 ? g(raw.padStart(8)) : r(raw.padStart(8));
      };
      process.stdout.write(
        `  ${'PM(5m+15m)'.padEnd(10)} ${pnlStr(unifiedRes.pnl, 11)} ${fmtP(1)} ${fmtP(7)} ${fmtP(30)}` +
        (customDay != null ? ` ${fmtP(customDay)}` : '') + '\n'
      );
      projRows.push({ pnl: unifiedRes.pnl, durDays: unifiedRes.durDays });
    }

    // Kalshi row (separate capital / no PM slot contention)
    // Prefer unified Kalshi (compounding, per-crypto trios) over fixed-pos trio sum.
    const kalSrc = unifiedKalshi ?? trioKalshi;
    if (kalMode && kalSrc && kalSrc.durDays > 0) {
      const kalPnl = kalSrc.pnl;
      const gfK    = (startBal + kalPnl) / startBal;
      const fmtK   = (days) => {
        const p   = startBal * (Math.pow(gfK, days / kalSrc.durDays) - 1);
        const raw = p >= 0 ? `+$${p.toFixed(0)}` : `-$${Math.abs(p).toFixed(0)}`;
        return p >= 0 ? g(raw.padStart(8)) : r(raw.padStart(8));
      };
      process.stdout.write(
        `  ${'Kalshi'.padEnd(10)} ${pnlStr(kalPnl, 11)} ${fmtK(1)} ${fmtK(7)} ${fmtK(30)}` +
        (customDay != null ? ` ${fmtK(customDay)}` : '') + '\n'
      );
      projRows.push({ pnl: kalPnl, durDays: kalSrc.durDays });
    }

    if (projRows.length > 1) {
      // Total: sum individual projections (each uses same startBal independently)
      console.log(d('  ' + '─'.repeat(sepW)));
      const totalPnl = projRows.reduce((s, r) => s + r.pnl, 0);
      const fmtG = (days) => {
        const p = projRows.reduce((sum, r) => {
          const gf = (startBal + r.pnl) / startBal;
          return sum + startBal * (Math.pow(gf, days / r.durDays) - 1);
        }, 0);
        const raw = p >= 0 ? `+$${p.toFixed(0)}` : `-$${Math.abs(p).toFixed(0)}`;
        return p >= 0 ? g(raw.padStart(8)) : r(raw.padStart(8));
      };
      process.stdout.write(
        `  ${'TOTAL'.padEnd(10)} ${pnlStr(totalPnl, 11)} ${fmtG(1)} ${fmtG(7)} ${fmtG(30)}` +
        (customDay != null ? ` ${fmtG(customDay)}` : '') + '\n'
      );
    }
    console.log('');

    // ── Write structured JSON for API consumption (-json-out flag) ─────────────
    if (jsonOutPath) {
      const proj = (pnl, dur, days) => parseFloat((startBal * (Math.pow((startBal + pnl) / startBal, days / dur) - 1)).toFixed(2));
      let projCombined = null, proj5mOut = null, proj15mOut = null;
      if (unifiedRes && unifiedRes.durDays > 0 && unifiedRes.trades.length > 0) {
        projCombined = { pnl: parseFloat(unifiedRes.pnl.toFixed(2)), durDays: unifiedRes.durDays,
          proj1d: proj(unifiedRes.pnl, unifiedRes.durDays, 1),
          proj7d: proj(unifiedRes.pnl, unifiedRes.durDays, 7),
          proj30d: proj(unifiedRes.pnl, unifiedRes.durDays, 30) };
        const has5m  = unifiedRes.trades.some(t => t.period < 150);
        const has15m = unifiedRes.trades.some(t => t.period >= 150);
        if (has5m && has15m && Math.abs(unifiedRes.pnl) > 0.01) {
          for (const { key, f15 } of [{ key: '5m', f15: false }, { key: '15m', f15: true }]) {
            const ts   = unifiedRes.trades.filter(t => (t.period >= 150) === f15);
            const tpnl = ts.reduce((s, t) => s + t.pnl, 0);
            const ratio = tpnl / unifiedRes.pnl;
            const gfC   = (startBal + unifiedRes.pnl) / startBal;
            const pC    = (days) => startBal * (Math.pow(gfC, days / unifiedRes.durDays) - 1);
            const obj = { pnl: parseFloat(tpnl.toFixed(2)), ratio: parseFloat(ratio.toFixed(4)),
              proj1d: parseFloat((pC(1) * ratio).toFixed(2)),
              proj7d: parseFloat((pC(7) * ratio).toFixed(2)),
              proj30d: parseFloat((pC(30) * ratio).toFixed(2)) };
            if (key === '5m') proj5mOut = obj; else proj15mOut = obj;
          }
        }
      }
      const trioEntries = [];
      for (const [c, row] of Object.entries(trio5m?.cryptoTrios  ?? {})) if (row) trioEntries.push(`${c}:C${row.period}:${row.th.toFixed(2)}`);
      for (const [c, row] of Object.entries(trio15m?.cryptoTrios ?? {})) if (row) trioEntries.push(`${c}:C${row.period}:${row.th.toFixed(2)}`);
      const toTrioRow = r => r ? { period: r.period, th: r.th, wins: r.wins, losses: r.losses,
        total: r.total, score: parseFloat((r.score || 0).toFixed(4)),
        pnl: parseFloat((r.pnlSum || 0).toFixed(2)), evPer: parseFloat((r.evPer || 0).toFixed(4)) } : null;
      const result = {
        params: { startBal, riskPct: parseFloat((riskPct * 100).toFixed(2)), minCents, maxCents,
          th: globalTh, maxPos, slip: parseFloat((slip * 100).toFixed(1)),
          body: bodyMinPct, t1Mode, t1tc: t1tcOnly, t1Adj: parseFloat((t1Adj * 100).toFixed(1)),
          t2Mode, t2Adj: parseFloat((t2Adj * 100).toFixed(1)),
          cb: cbMins > 0 ? cbMins : null,
          mxt1: mxt1Cents != null ? mxt1Cents : null,
          vol: anyVolFilter ? volMinPerCrypto : null },
        autoscan5m: (top5m || trio5m) ? {
          top: top5m ? { period: top5m.period, th: top5m.th, mn: top5m.mn, mx: top5m.mx,
            wins: top5m.wins, losses: top5m.losses, total: top5m.total, noPm: top5m.noPm,
            pnl: parseFloat((top5m.pnl || 0).toFixed(2)), score: parseFloat((top5m.score || 0).toFixed(4)) } : null,
          trios: Object.fromEntries(Object.entries(trio5m?.cryptoTrios ?? {}).map(([c, r]) => [c, toTrioRow(r)])),
          quartet: quartet5m ? Object.fromEntries(Object.entries(quartet5m).map(([c, dirs]) => [c, {
            UP  : dirs.UP   ? { period: dirs.UP.period,   th: dirs.UP.th,   mn: dirs.UP.mn   != null ? dirs.UP.mn   / 100 : null, mx: dirs.UP.mx   != null ? dirs.UP.mx   / 100 : null } : null,
            DOWN: dirs.DOWN ? { period: dirs.DOWN.period, th: dirs.DOWN.th, mn: dirs.DOWN.mn != null ? dirs.DOWN.mn / 100 : null, mx: dirs.DOWN.mx != null ? dirs.DOWN.mx / 100 : null } : null,
          }])) : null,
        } : null,
        autoscan15m: (top15m || trio15m) ? {
          top: top15m ? { period: top15m.period, th: top15m.th, mn: top15m.mn, mx: top15m.mx,
            wins: top15m.wins, losses: top15m.losses, total: top15m.total, noPm: top15m.noPm,
            pnl: parseFloat((top15m.pnl || 0).toFixed(2)), score: parseFloat((top15m.score || 0).toFixed(4)) } : null,
          trios: Object.fromEntries(Object.entries(trio15m?.cryptoTrios ?? {}).map(([c, r]) => [c, toTrioRow(r)])),
          quartet: quartet15m ? Object.fromEntries(Object.entries(quartet15m).map(([c, dirs]) => [c, {
            UP  : dirs.UP   ? { period: dirs.UP.period,   th: dirs.UP.th,   mn: dirs.UP.mn   != null ? dirs.UP.mn   / 100 : null, mx: dirs.UP.mx   != null ? dirs.UP.mx   / 100 : null } : null,
            DOWN: dirs.DOWN ? { period: dirs.DOWN.period, th: dirs.DOWN.th, mn: dirs.DOWN.mn != null ? dirs.DOWN.mn / 100 : null, mx: dirs.DOWN.mx != null ? dirs.DOWN.mx / 100 : null } : null,
          }])) : null,
        } : null,
        unified: unifiedRes ? { wins: unifiedRes.wins, losses: unifiedRes.losses,
          total: unifiedRes.total, winRate: unifiedRes.total > 0 ? parseFloat((unifiedRes.wins / unifiedRes.total).toFixed(4)) : null,
          pnl: parseFloat(unifiedRes.pnl.toFixed(2)), finalBalance: parseFloat(unifiedRes.finalBalance.toFixed(2)),
          durDays: parseFloat(unifiedRes.durDays.toFixed(2)), noPm: unifiedRes.noPm,
          cbSkipped: unifiedRes.cbSkipped ?? 0,
          volSkipped: unifiedRes.volSkipped ?? 0,
          trades: (unifiedRes.trades || []).map(t => ({
            time: t.time, crypto: t.crypto, direction: t.direction, label: t.label || 'T0',
            entry: parseFloat((t.entry * 100).toFixed(1)),
            spikePct: parseFloat((t.spikePct || 0).toFixed(3)),
            outcome: t.outcome, pnl: parseFloat(t.pnl.toFixed(2)),
            balance: parseFloat(t.balance.toFixed(2)), pos: parseFloat((t.pos || 0).toFixed(2)),
            period: t.period,
          })) } : null,
        projections: { combined: projCombined, pm5m: proj5mOut, pm15m: proj15mOut },
        autoscanKalshi: kalMode && (topKalshi || trioKalshi) ? {
          top: topKalshi ? { period: topKalshi.period, th: topKalshi.th, mn: topKalshi.mn, mx: topKalshi.mx,
            wins: topKalshi.wins, losses: topKalshi.losses, total: topKalshi.total, noPm: topKalshi.noPm,
            pnl: parseFloat((topKalshi.pnl || 0).toFixed(2)), score: parseFloat((topKalshi.score || 0).toFixed(4)) } : null,
          trios: Object.fromEntries(Object.entries(trioKalshi?.cryptoTrios ?? {}).map(([c, r]) => [c, toTrioRow(r)])),
          // Use unified simulation (compounding) if available — same methodology as PM 15m.
          // Falls back to fixed-pos trio sum if unified wasn't run (no autoscan or no trio data).
          durDays: parseFloat(((unifiedKalshi?.durDays ?? trioKalshi?.durDays) || 0).toFixed(2)),
          wins:    unifiedKalshi?.wins    ?? (trioKalshi?.wins    || 0),
          losses:  unifiedKalshi?.losses  ?? (trioKalshi?.losses  || 0),
          pnl:     parseFloat(((unifiedKalshi?.pnl ?? trioKalshi?.pnl) || 0).toFixed(2)),
          trades: (unifiedKalshi?.trades || []).map(t => ({
            time: t.time, crypto: t.crypto, direction: t.direction, label: t.label || 'T0',
            entry: parseFloat((t.entry * 100).toFixed(1)),
            spikePct: parseFloat((t.spikePct || 0).toFixed(3)),
            outcome: t.outcome, pnl: parseFloat(t.pnl.toFixed(2)),
            balance: parseFloat(t.balance.toFixed(2)), pos: parseFloat((t.pos || 0).toFixed(2)),
            period: t.period,
          })),
        } : null,
        triomap: trioEntries.join(','),
        bots: (numBots > 1 && unifiedRes) ? (() => {
          const bot0 = {
            id: 1,
            startBal: parseFloat(botStartBals[0].toFixed(2)),
            finalBal: parseFloat(unifiedRes.finalBalance.toFixed(2)),
            wins: unifiedRes.wins, losses: unifiedRes.losses,
            pnl: parseFloat(unifiedRes.pnl.toFixed(2)),
            history: [parseFloat(botStartBals[0].toFixed(2)), ...unifiedRes.trades.map(t => t.balance)],
          };
          const botsArr = [bot0];
          for (let i = 1; i < botStartBals.length; i++) {
            const b0 = botStartBals[i];
            let bal = b0, wins = 0, losses = 0, totalPnl = 0;
            const history = [parseFloat(b0.toFixed(2))];
            for (const tr of unifiedRes.trades) {
              const pos = Math.min(Math.max(1, bal * riskPct), tr.capUsd ?? 500);
              const pnl = tr.wasWin ? pos * (1 - tr.entry) / tr.entry : -pos;
              bal = Math.max(0, bal + pnl);
              totalPnl += pnl;
              if (tr.wasWin) wins++; else losses++;
              history.push(parseFloat(bal.toFixed(2)));
            }
            botsArr.push({ id: i + 1, startBal: parseFloat(b0.toFixed(2)), finalBal: parseFloat(bal.toFixed(2)), wins, losses, pnl: parseFloat(totalPnl.toFixed(2)), history });
          }
          return botsArr;
        })() : null,
      };
      fs.writeFileSync(jsonOutPath, JSON.stringify(result, null, 2));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── COMBINED TOTALS ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  if (!autoscan) {
    // Quick aggregate: sum wins/losses/pnl across all periods for each exchange
    // (note: same underlying cycles appear in both sections — this is independent P&L accounting)
    const pm5m  = PERIODS_5M .map(p => simPeriod(p, 300, polMaxByCrypto)).filter(Boolean);
    const pm15m = PERIODS_15M.map(p => simPeriod(p, 900, polMaxByCrypto15m)).filter(Boolean);
    const kal   = PERIODS_15M.map(p => simPeriod(p, 900, kalMaxByCrypto)).filter(Boolean);

    const sumSection = (arr) => arr.reduce((a, r) => ({
      wins: a.wins + r.wins, losses: a.losses + r.losses,
      pnl: a.pnl + r.pnl,
    }), { wins: 0, losses: 0, pnl: 0 });

    const pmAll = sumSection([...pm5m, ...pm15m]);
    const kAll  = sumSection(kal);

    console.log('\n' + b('═══ TOTALS ACROSS ALL PERIODS ══════════════════════════════════════════════════'));
    console.log(d('  Section          Wins  Losses   WinRate         PnL'));
    console.log(d('  ' + '─'.repeat(54)));
    const printTotal = (label, s) => {
      const total = s.wins + s.losses;
      const wr    = total > 0 ? (s.wins / total * 100).toFixed(1) + '%' : '—';
      process.stdout.write(`  ${label.padEnd(16)}  ${String(s.wins).padStart(5)}  ${String(s.losses).padStart(6)}  ${wr.padStart(7)}  ${pnlStr(s.pnl, 12)}\n`);
    };
    printTotal('Polymarket (5m)',  sumSection(pm5m));
    printTotal('Polymarket (15m)', sumSection(pm15m));
    printTotal('Polymarket ALL',   pmAll);
    console.log(d('  ' + '─'.repeat(54)));
    printTotal('Kalshi (15m)',     kAll);
    console.log('');
  }
}

// ── DEEPSCAN: Greedy Forward Option Selection ─────────────────────────────────
// Tests each option independently against the baseline period, then runs a final
// full autoscan with the combined winning config.
// Usage: node simulate_combined.js -nf -ds           (coarse/SIM mode, ~2-5 min)
//        node simulate_combined.js -nf -ds -ds-fine  (fine/CRON mode, ~10-20 min)
//
async function runDeepscan(sigsMap5m, sigsMap15m, isFine, isThorough) {
  const DS_FILE  = path.join(LOG_DIR, 'deepscan_v2.json');
  const PM_FILE  = path.join(LOG_DIR, 'autoscan_v2.json');
  const coarse   = !isFine;
  const modeLabel = isThorough ? 'thorough' : isFine ? 'fine' : 'coarse';

  console.log('\n' + b(y(`╔══ DEEPSCAN — Greedy Forward Selection (${modeLabel}) ══════════════════╗`)));
  console.log(b(y(`╚${'═'.repeat(72)}╝`)));
  const desc = isThorough
    ? 'Coordinate ascent: re-sweeps when best period shifts (up to 3 iterations).'
    : 'Tests each option independently; applies winners; re-runs full autoscan.';
  console.log($(`  ${desc}\n`));

  // ── Step 0: Baseline autoscan (current CLI settings) ──────────────────────
  console.log(b('── Step 0: Baseline autoscan ──'));
  const { top: B5  } = runAutoscan(sigsMap5m,  PERIODS_5M,  'BASELINE 5-MIN',  PM_FILE, writeResultPath, polMaxByCrypto);
  const { top: B15 } = runAutoscan(sigsMap15m, PERIODS_15M, 'BASELINE 15-MIN', PM_FILE, writeResultPath, polMaxByCrypto15m);
  if (!B5 && !B15) { console.log(r('  No valid baseline — aborting')); return; }

  const basePnl = (B5?.pnl ?? 0) + (B15?.pnl ?? 0);
  console.log(`\n  Baseline PnL: 5m=${pnlStr(B5?.pnl ?? 0, 9)}  15m=${pnlStr(B15?.pnl ?? 0, 9)}  total=${pnlStr(basePnl, 10)}`);
  if (B5)  console.log(`  Best 5m:  C${B5.period}  th=${B5.th.toFixed(2)}%  mn=${B5.mn}¢  mx=${B5.mx}¢`);
  if (B15) console.log(`  Best 15m: C${B15.period}  th=${B15.th.toFixed(2)}%  mn=${B15.mn}¢  mx=${B15.mx}¢`);

  // ── Options grid (coarse/fine distinction only — constant across iterations) ──
  // opts._bestMn: winning min price in ¢ (not a module global; passed as fastSim arg).
  const OPTIONS = [
    {
      name: 'cb',        label: 'Circuit Breaker',
      values:  coarse ? [0, 60, 90, 120, 180, 240]
             : dsUltra    ? [0, 15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 420, 480]
             : dsExtended ? [0, 30, 60, 90, 120, 150, 180, 240, 300, 360]
             :               [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300],
      build:   v => ({ cbMs: v * 60_000 }),
      display: v => v === 0 ? 'OFF' : v + 'min',
    },
    {
      name: 't1',        label: 'T+1 mode',
      values:  [false, true],
      build:   v => ({ t1Mode: v }),
      display: v => v ? 'ON' : 'OFF',
    },
    {
      name: 'minPrice',  label: 'Min price',
      values:  coarse   ? [5, 10, 15, 20]
             : dsUltra  ? [0, 5, 8, 10, 12, 15, 18, 20, 25, 30, 35]
             :             [5, 8, 10, 15, 20, 25, 30],
      build:   v => ({ _bestMn: v }),
      display: v => v + '¢',
    },
    {
      name: 'dl',        label: 'Drawdown Limit',
      values:  coarse
        ? [null, { n: 2, w: 90, p: 90 }]
        : dsUltra
          ? [null, { n: 2, w: 60, p: 60 }, { n: 2, w: 90, p: 90 }, { n: 3, w: 90, p: 90 }, { n: 2, w: 120, p: 120 }, { n: 2, w: 120, p: 180 }, { n: 2, w: 180, p: 180 }, { n: 2, w: 240, p: 240 }, { n: 3, w: 180, p: 180 }, { n: 2, w: 300, p: 300 }, { n: 3, w: 240, p: 240 }, { n: 4, w: 180, p: 180 }]
          : dsExtended
            ? [null, { n: 2, w: 60, p: 60 }, { n: 2, w: 90, p: 90 }, { n: 3, w: 90, p: 90 }, { n: 2, w: 120, p: 120 }, { n: 2, w: 120, p: 180 }, { n: 2, w: 180, p: 180 }, { n: 2, w: 240, p: 240 }, { n: 3, w: 180, p: 180 }]
            : [null, { n: 2, w: 60, p: 60 }, { n: 2, w: 90, p: 90 }, { n: 3, w: 90, p: 90 }, { n: 2, w: 120, p: 120 }, { n: 2, w: 120, p: 180 }, { n: 2, w: 180, p: 180 }],
      build:   v => v == null
        ? { dlMaxLosses: 0, dlWindowMs: 0, dlPauseMs: 0 }
        : { dlMaxLosses: v.n, dlWindowMs: v.w * 60_000, dlPauseMs: v.p * 60_000 },
      display: v => v == null ? 'OFF' : `${v.n}L/${v.w}m→${v.p}m`,
    },
    {
      name: 'body',      label: 'Body filter %',
      values:  coarse  ? [74, 76, 78, 80, 82, 85]
             : dsUltra ? [60, 65, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92]
             :            [70, 72, 74, 76, 78, 80, 82, 85, 88],
      build:   v => ({ bodyMinPct: v }),
      display: v => v + '%',
    },
    {
      name: 'distMin5m', label: 'distMin 5m',
      values:  coarse  ? [0, 0.10, 0.15, 0.20, 0.25, 0.30]
             : dsUltra ? [0, 0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20, 0.22, 0.25, 0.28, 0.30, 0.35, 0.40]
             :            [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35],
      build:   v => ({ distMin5m: v }),
      display: v => v === 0 ? 'OFF' : v.toFixed(2) + '%',
    },
    {
      name: 'distMin15m',label: 'distMin 15m',
      values:  coarse  ? [0, 0.10, 0.15, 0.20, 0.25, 0.30]
             : dsUltra ? [0, 0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20, 0.22, 0.25, 0.28, 0.30, 0.35, 0.40]
             :            [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35],
      build:   v => ({ distMin15m: v }),
      display: v => v === 0 ? 'OFF' : v.toFixed(2) + '%',
    },
    {
      name: 'prevvol',   label: 'Prior-cycle vol',
      values:  coarse  ? [0, 0.10, 0.15, 0.20, 0.25, 0.30]
             : dsUltra ? [0, 0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20, 0.22, 0.25, 0.28, 0.30, 0.35]
             :            [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30],
      build:   v => ({ prevVolMin: v }),
      display: v => v === 0 ? 'OFF' : v.toFixed(2) + '%',
    },
    {
      name: 'mxt1',      label: 'T+1 max price',
      values:  coarse  ? [null, 75, 79, 82, 85, 89]
             : dsUltra ? [null, 65, 68, 70, 72, 74, 75, 76, 77, 78, 79, 80, 82, 84, 85, 87, 89]
             :            [null, 70, 73, 75, 77, 79, 82, 85, 89],
      build:   v => ({ mxt1: v != null ? v / 100 : null }),
      display: v => v == null ? 'none' : v + '¢',
    },
    {
      name: 'maxPos',    label: 'Max positions',
      values:  [1, 2, 3, 4],
      build:   v => ({ maxPos: v }),
      display: v => String(v),
    },
  ];

  // ── Coordinate-ascent outer loop ───────────────────────────────────────────
  // Thorough mode: re-runs greedy sweep + autoscan if best period shifts (max 3 iters).
  // Coarse/fine: single pass.
  const MAX_ITER = isThorough ? 3 : 1;
  let curB5 = B5, curB15 = B15;
  // Winner opts carry forward across iterations; _bestMn reset each sweep.
  let winnerOpts = { cbMs, t1Mode, bodyMinPct, distMin5m, distMin15m,
                     dlMaxLosses, dlWindowMs, dlPauseMs, maxPos, mxt1, prevVolMin, _bestMn: null };
  let steps = [];
  let F5 = null, F15 = null;
  let bestMnCents = curB5?.mn ?? 5;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    if (iter > 0) {
      console.log('\n' + b(`── Iteration ${iter + 1} (period updated — re-sweeping) ──`));
    }

    // ── Greedy forward selection ───────────────────────────────────────────────
    console.log('\n' + b(`── Step ${iter * 2 + 1}: Greedy option sweep  [5m: C${curB5?.period ?? '—'}  15m: C${curB15?.period ?? '—'}] ──`));

    const S5  = curB5  ? (sigsMap5m[curB5.period]   ?? []) : [];
    const S15 = curB15 ? (sigsMap15m[curB15.period] ?? []) : [];

    // Reset _bestMn so min-price is re-evaluated against the current period.
    winnerOpts._bestMn = null;
    steps = [];

    const evalPnl = (opts) => {
      const mn5  = opts._bestMn != null ? opts._bestMn / 100 : (curB5?.mn  ?? 5) / 100;
      const mn15 = opts._bestMn != null ? opts._bestMn / 100 : (curB15?.mn ?? 5) / 100;
      const r5  = S5.length  ? withOpts(opts, () => fastSim(S5,  curB5?.th  ?? 0.24, mn5,  (curB5?.mx  ?? 89) / 100, polMaxByCrypto))    : null;
      const r15 = S15.length ? withOpts(opts, () => fastSim(S15, curB15?.th ?? 0.22, mn15, (curB15?.mx ?? 89) / 100, polMaxByCrypto15m)) : null;
      return (r5?.pnl ?? 0) + (r15?.pnl ?? 0);
    };

    for (const opt of OPTIONS) {
      let bestVal = null, bestPnl = -Infinity, bestDisplay = null;
      const results = [];

      for (const val of opt.values) {
        const testOpts = { ...winnerOpts, ...opt.build(val) };
        const pnl = evalPnl(testOpts);
        results.push({ val, pnl });
        if (pnl > bestPnl) { bestPnl = pnl; bestVal = val; bestDisplay = opt.display(val); }
      }

      const prevPnl  = evalPnl(winnerOpts);
      const delta    = bestPnl - prevPnl;
      const improved = delta > 0.01;

      const tick = improved ? g('✓') : d('·');
      const dStr = (delta >= 0 ? '+$' : '-$') + Math.abs(delta).toFixed(2);
      const resultStr = results.map(r2 => `${opt.display(r2.val)}:$${r2.pnl.toFixed(0)}`).join('  ');
      console.log(`  ${tick} ${opt.label.padEnd(18)} → ${String(bestDisplay).padEnd(12)} ${(improved ? g : r)(dStr.padStart(8))}  [${resultStr}]`);

      if (improved) Object.assign(winnerOpts, opt.build(bestVal));
      steps.push({ option: opt.name, label: opt.label, winner: improved ? bestVal : null,
                   display: bestDisplay, delta: parseFloat(delta.toFixed(2)) });
    }

    bestMnCents = winnerOpts._bestMn ?? curB5?.mn ?? curB15?.mn ?? 5;
    const optsForScan = { ...winnerOpts };
    delete optsForScan._bestMn;

    // ── Final autoscan with combined winners ───────────────────────────────────
    console.log('\n' + b(`── Step ${iter * 2 + 2}: Final autoscan with combined winners ──`));

    let newF5 = null, newF15 = null;
    withOpts(optsForScan, () => {
      const { top: f5  } = runAutoscan(sigsMap5m,  PERIODS_5M,  'DEEPSCAN FINAL 5-MIN',  PM_FILE, writeResultPath, polMaxByCrypto);
      const { top: f15 } = runAutoscan(sigsMap15m, PERIODS_15M, 'DEEPSCAN FINAL 15-MIN', PM_FILE, writeResultPath, polMaxByCrypto15m);
      newF5 = f5; newF15 = f15;
    });
    F5 = newF5; F15 = newF15;

    // ── Convergence check (thorough mode) ──────────────────────────────────────
    if (isThorough && iter < MAX_ITER - 1) {
      const p5changed  = F5  && curB5  && F5.period  !== curB5.period;
      const p15changed = F15 && curB15 && F15.period !== curB15.period;
      if (p5changed || p15changed) {
        if (p5changed)  console.log(`\n  5m period shifted: C${curB5.period} → C${F5.period} — re-sweeping`);
        if (p15changed) console.log(`  15m period shifted: C${curB15.period} → C${F15.period} — re-sweeping`);
        curB5  = F5  ?? curB5;
        curB15 = F15 ?? curB15;
        continue;   // next iteration
      }
      console.log('\n  Period stable — converged.');
    }
    break;  // coarse/fine: always exit; thorough: exit on convergence or max iter
  }

  // ── Final result display ───────────────────────────────────────────────────
  const finalPnl    = (F5?.pnl ?? 0) + (F15?.pnl ?? 0);
  const improvement = basePnl > 0 ? ((finalPnl - basePnl) / basePnl * 100) : 0;
  const winSteps    = steps.filter(s => s.winner != null);

  console.log('\n' + b(y('── DEEPSCAN RESULT ──')));
  console.log(`  Baseline PnL : ${pnlStr(basePnl, 10)}`);
  console.log(`  Final PnL    : ${pnlStr(finalPnl, 10)}  (${improvement >= 0 ? g('+' + improvement.toFixed(1) + '%') : r(improvement.toFixed(1) + '%')} vs baseline)`);
  if (winSteps.length) {
    console.log(`  Winners: ${winSteps.map(s => g(s.label + '=' + s.display)).join('  ')}`);
  } else {
    console.log(`  ${d('No options improved PnL — baseline was already optimal')}`);
  }

  const optsForConfig = { ...winnerOpts };
  delete optsForConfig._bestMn;

  const winConfig = {
    t1Mode:                  optsForConfig.t1Mode,
    circuitBreakerEnabled:   optsForConfig.cbMs > 0,
    circuitBreakerMins:      optsForConfig.cbMs > 0 ? optsForConfig.cbMs / 60_000 : 0,
    drawdownLimitEnabled:    optsForConfig.dlMaxLosses > 0,
    drawdownLimitMaxLosses:  optsForConfig.dlMaxLosses,
    drawdownLimitWindowMins: optsForConfig.dlWindowMs > 0 ? optsForConfig.dlWindowMs / 60_000 : 0,
    drawdownLimitPauseMins:  optsForConfig.dlPauseMs  > 0 ? optsForConfig.dlPauseMs  / 60_000 : 0,
    bodyPct:                 optsForConfig.bodyMinPct,
    distMin5m:               optsForConfig.distMin5m,
    distMin15m:              optsForConfig.distMin15m,
    maxPositions:            optsForConfig.maxPos,
    maxPriceT1_15m:          optsForConfig.mxt1,
    minPrice5m:              bestMnCents / 100,
    minPrice15m:             bestMnCents / 100,
    maxPrice5m:              F5  ? F5.mx  / 100 : null,
    maxPrice15m:             F15 ? F15.mx / 100 : null,
  };

  const dsOut = {
    updatedAt:   new Date().toISOString(),
    mode:        modeLabel,
    config:      winConfig,
    baseline:    { pnl: parseFloat(basePnl.toFixed(2)),    best5m: B5  ? `C${B5.period}`  : null, best15m: B15 ? `C${B15.period}` : null },
    final:       { pnl: parseFloat(finalPnl.toFixed(2)), pnlImprovement: parseFloat(improvement.toFixed(1)),
                   best5m: F5 ? `C${F5.period}` : null, best15m: F15 ? `C${F15.period}` : null },
    steps,
  };
  fs.writeFileSync(DS_FILE, JSON.stringify(dsOut, null, 2));
  console.log(`\n  Wrote ${DS_FILE}\n`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
