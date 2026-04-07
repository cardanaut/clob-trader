#!/usr/bin/env node
'use strict';

/**
 * Conditional Win Rate Backtest
 *
 * Answers the core V2 strategy question:
 *   "When a T123 spike fires and Polymarket has already priced the momentum
 *    token at X¢, what is the ACTUAL resolution win rate?"
 *
 * This tells us at which price level Momentum vs Fade each has positive EV:
 *   Momentum EV  =  WR − price        (positive when WR > price)
 *   Fade EV      =  price − WR        (positive when price > WR)
 *   Crossover    :  price  =  WR      (e.g. 90¢ if WR = 90%)
 *
 * Methodology:
 *   1. Standard T123 signal detection: 5-min cycles, 1-min candles, T+0/T+1/T+2
 *   2. No upper threshold cap — captures everything above --threshold
 *   3. For each signal: estimate Polymarket YES price via Black-Scholes binary
 *      option model using cumulative drift from cycle-open to signal candle close
 *   4. Record actual cycle resolution (did momentum direction win?)
 *   5. Group by estimated price and by candle magnitude → report win rate + EV
 *
 * Black-Scholes model:
 *   P(YES) = N(d2),  d2 = ln(S/K) / (σ × √T)
 *   S = spot at signal time (cycle_open × (1 + cumulativeDrift))
 *   K = cycle_open  (resolution is UP iff final_price > cycle_open)
 *   σ = 1.10 (110% annual implied vol, calibrated from 16 live CLOB observations)
 *   T = minutes remaining / 525600
 *
 * Usage:
 *   node backend/scripts/conditional_winrate.js
 *   node backend/scripts/conditional_winrate.js --crypto ETH
 *   node backend/scripts/conditional_winrate.js --all
 *   node backend/scripts/conditional_winrate.js --threshold 0.21 --vol 0.90
 *   node backend/scripts/conditional_winrate.js --help
 */

const fs   = require('fs');
const path = require('path');

// ── CLI args ───────────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], n = process.argv[i + 1];
  if (a === '--threshold' || a === '-t') { args.threshold = parseFloat(n); i++; }
  if (a === '--crypto'    || a === '-c') { args.crypto    = n?.toUpperCase(); i++; }
  if (a === '--candles')                 { args.candles   = parseInt(n);    i++; }
  if (a === '--vol')                     { args.vol       = parseFloat(n);  i++; }
  if (a === '--all')                     { args.all       = true; }
  if (a === '--help'      || a === '-h') { args.help      = true; }
}

if (args.help) {
  console.log(`
Conditional Win Rate Backtest

USAGE:
  node conditional_winrate.js [OPTIONS]

OPTIONS:
  -t, --threshold  N   min spike threshold % to detect       (default: 0.10)
  -c, --crypto     X   BTC | ETH | SOL | XRP                 (default: BTC)
      --all            run all 4 cryptos
      --candles    N   candles to load from cache             (default: 50000)
      --vol        N   annual vol for Black-Scholes estimate  (default: 1.10)
  -h, --help           show this help

EXAMPLES:
  node conditional_winrate.js                       # BTC, threshold 0.10%
  node conditional_winrate.js --all                 # all 4 cryptos
  node conditional_winrate.js --crypto ETH --vol 0.90
  node conditional_winrate.js --threshold 0.24      # T123 production threshold
`);
  process.exit(0);
}

// ── Config ────────────────────────────────────────────────────────────────────
const THRESHOLD   = args.threshold ?? 0.10;
const MAX_CANDLES = args.candles   ?? 50000;
const VOL_ANNUAL  = args.vol       ?? 1.10;
const CYCLE_MIN   = 5;
const CHECK_AT    = [0, 1, 2];   // T+0, T+1, T+2

const CRYPTOS = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  XRP: 'XRPUSDT',
};

// Price buckets — granular around the 81¢ threshold and crossover zone
const PRICE_BUCKETS = [
  { label: '< 50¢',   lo: 0.00, hi: 0.50 },
  { label: '50–60¢',  lo: 0.50, hi: 0.60 },
  { label: '60–70¢',  lo: 0.60, hi: 0.70 },
  { label: '70–75¢',  lo: 0.70, hi: 0.75 },
  { label: '75–81¢',  lo: 0.75, hi: 0.81 },  // max engine accepts now
  { label: '81–85¢',  lo: 0.81, hi: 0.85 },  // currently BLOCKED (just above limit)
  { label: '85–90¢',  lo: 0.85, hi: 0.90 },  // currently BLOCKED
  { label: '90–93¢',  lo: 0.90, hi: 0.93 },  // currently BLOCKED
  { label: '93–96¢',  lo: 0.93, hi: 0.96 },  // currently BLOCKED
  { label: '96–99¢',  lo: 0.96, hi: 0.99 },  // currently BLOCKED
  { label: '> 99¢',   lo: 0.99, hi: 1.01 },  // currently BLOCKED
];

// Candle magnitude buckets
const MAG_BUCKETS = [
  { label: '0.10–0.20%', lo: 0.10, hi: 0.20 },
  { label: '0.20–0.25%', lo: 0.20, hi: 0.25 },
  { label: '0.25–0.30%', lo: 0.25, hi: 0.30 },
  { label: '0.30–0.40%', lo: 0.30, hi: 0.40 },
  { label: '0.40–0.50%', lo: 0.40, hi: 0.50 },
  { label: '0.50–0.70%', lo: 0.50, hi: 0.70 },
  { label: '0.70–1.00%', lo: 0.70, hi: 1.00 },
  { label: '1.00–1.50%', lo: 1.00, hi: 1.50 },
  { label: '> 1.50%',    lo: 1.50, hi: 99.0 },
];

// ── Black-Scholes binary option pricing ───────────────────────────────────────
function normalCDF(x) {
  // Abramowitz & Stegun (1964) – accurate to ~5 decimal places
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422820 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return x > 0 ? 1 - p : p;
}

/**
 * Estimate Polymarket YES-token price using a Black-Scholes binary model.
 *
 * Models: P(spot_end > cycle_open | current_spot, time_remaining)
 *
 * @param {number} cumulativeDriftPct  % move from cycle_open to now (+ = UP, − = DOWN)
 * @param {number} minutesRemaining    minutes left until market resolves
 * @param {number} vol                 annual implied vol (default 110%)
 * @returns {number} P(YES) in [0, 1]
 */
function estimateYesPrice(cumulativeDriftPct, minutesRemaining, vol = VOL_ANNUAL) {
  if (minutesRemaining <= 0) return cumulativeDriftPct >= 0 ? 1.0 : 0.0;

  const T      = minutesRemaining / 525600;       // convert minutes → years
  const sigmaT = vol * Math.sqrt(T);
  const d2     = Math.log(1 + cumulativeDriftPct / 100) / sigmaT;

  return normalCDF(d2);
}

// ── Cache loader ──────────────────────────────────────────────────────────────
function loadCandles(symbol) {
  const cachePath = path.join(__dirname, `../cache/candles-1m-${symbol}-${MAX_CANDLES}.json`);

  if (!fs.existsSync(cachePath)) {
    console.error(`\n  ERROR: cache not found: ${cachePath}`);
    console.error(`  Run a backtest first to populate the cache (it fetches and saves automatically):`);
    console.error(`    node backend/scripts/sweep_15min.js\n`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  return raw.candles.map(c => ({
    timestamp: new Date(c.timestamp),
    open:  parseFloat(c.open),
    high:  parseFloat(c.high),
    low:   parseFloat(c.low),
    close: parseFloat(c.close),
  }));
}

// ── Cycle grouping ────────────────────────────────────────────────────────────
function groupIntoCycles(candles) {
  const map = new Map();
  for (const c of candles) {
    const ts  = new Date(c.timestamp);
    const key = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate(),
                         ts.getHours(), ts.getMinutes(), 0, 0).getTime();
    map.set(key, c);
  }

  if (candles.length === 0) return [];

  const first = new Date(candles[0].timestamp);
  const last  = new Date(candles[candles.length - 1].timestamp);

  const alignedMin = Math.floor(first.getMinutes() / CYCLE_MIN) * CYCLE_MIN;
  let cs = new Date(first.getFullYear(), first.getMonth(), first.getDate(),
                    first.getHours(), alignedMin, 0, 0);
  if (cs < first) cs = new Date(cs.getTime() + CYCLE_MIN * 60000);

  const cycles = [];
  while (cs <= last) {
    const cc = [];
    for (let m = 0; m < CYCLE_MIN; m++) {
      const c = map.get(cs.getTime() + m * 60000);
      if (c) cc.push(c);
    }
    if (cc.length === CYCLE_MIN) {
      cycles.push({
        candles:        cc,
        referencePrice: cc[0].open,                              // T+0 open
        resolvedUp:     cc[CYCLE_MIN - 1].close > cc[0].open,   // final close > cycle open
      });
    }
    cs = new Date(cs.getTime() + CYCLE_MIN * 60000);
  }
  return cycles;
}

// ── Core analysis ─────────────────────────────────────────────────────────────
function analyze(symbol, candles) {
  const cycles  = groupIntoCycles(candles);
  const days    = (candles[candles.length - 1].timestamp - candles[0].timestamp) / 86400000;

  // Accumulate per-signal records
  const signals = []; // { magnitude, estPrice, minute, isWin }

  for (const cycle of cycles) {
    let fired = false;

    for (const t of CHECK_AT) {
      if (fired) break;

      const candle = cycle.candles[t];
      if (!candle) continue;

      // Individual candle movement (TradingView formula)
      const magnitude = Math.abs((candle.close - candle.open) / candle.open * 100);
      if (magnitude < THRESHOLD) continue;

      // Cumulative drift from cycle open to signal candle close
      const cumulativeDrift = (candle.close - cycle.referencePrice) / cycle.referencePrice * 100;
      const signalUp        = cumulativeDrift >= 0;

      // Estimate Polymarket prices
      const minutesRemaining = CYCLE_MIN - 1 - t; // T+0→4, T+1→3, T+2→2
      const yesPrice         = estimateYesPrice(cumulativeDrift, minutesRemaining);
      const momentumPrice    = signalUp ? yesPrice : (1 - yesPrice); // price of the spike-direction token

      // Did momentum win? (cycle resolved in signal direction)
      const isWin = signalUp === cycle.resolvedUp;

      fired = true;
      signals.push({ magnitude, estPrice: momentumPrice, minute: t, isWin });
    }
  }

  return { symbol, days, cycles: cycles.length, signals };
}

// ── Bucket builders ───────────────────────────────────────────────────────────
function buildPriceBuckets(signals) {
  const buckets = PRICE_BUCKETS.map(b => ({ ...b, signals: 0, wins: 0, losses: 0 }));
  const overflow = { label: '??', lo: -1, hi: -1, signals: 0, wins: 0, losses: 0 };

  for (const s of signals) {
    const b = buckets.find(b => s.estPrice >= b.lo && s.estPrice < b.hi);
    if (b) { b.signals++; if (s.isWin) b.wins++; else b.losses++; }
    else   { overflow.signals++; if (s.isWin) overflow.wins++; else overflow.losses++; }
  }
  return buckets;
}

function buildMagBuckets(signals) {
  const buckets = MAG_BUCKETS.map(b => ({ ...b, signals: 0, wins: 0, losses: 0, sumPrice: 0 }));

  for (const s of signals) {
    const b = buckets.find(b => s.magnitude >= b.lo && s.magnitude < b.hi);
    if (b) {
      b.signals++;
      b.sumPrice += s.estPrice;
      if (s.isWin) b.wins++; else b.losses++;
    }
  }
  return buckets;
}

function buildMinuteBuckets(signals) {
  const buckets = { 0: {s:0, w:0, sumP:0}, 1: {s:0, w:0, sumP:0}, 2: {s:0, w:0, sumP:0} };
  for (const s of signals) {
    const b = buckets[s.minute];
    if (!b) continue;
    b.s++; b.sumP += s.estPrice;
    if (s.isWin) b.w++;
  }
  return buckets;
}

// ── Printing ──────────────────────────────────────────────────────────────────
const W = 90;

function evTag(ev) {
  if (ev > 10) return '✅✅';
  if (ev >  3) return '✅ ';
  if (ev > -3) return '⚠️ ';
  return '❌ ';
}

function printPriceBuckets(priceBuckets, totalSignals) {
  const blockedStart = PRICE_BUCKETS.findIndex(b => b.lo >= 0.81);
  const wideDash = '─'.repeat(W);

  console.log('\n  BY ESTIMATED POLYMARKET PRICE (momentum token)');
  console.log('  ' + wideDash);
  console.log('   Est. Token Price │ Signals │  Blocked │ Win Rate │ Mom EV   │       │ Fade EV  │');
  console.log('  ─────────────────┼─────────┼──────────┼──────────┼──────────┼───────┼──────────┼───────');

  let firstBlockedLine = true;
  for (let i = 0; i < priceBuckets.length; i++) {
    const b = priceBuckets[i];
    if (b.signals === 0) continue;

    if (i === blockedStart && firstBlockedLine) {
      console.log('  ─────────────────┼─────────┼──────────┼──────────┼──────────┼───────┼──────────┼───────');
      console.log('  ↑ ENGINE ACCEPTS │                                           ↑ ENGINE BLOCKS ABOVE 81¢');
      console.log('  ─────────────────┼─────────┼──────────┼──────────┼──────────┼───────┼──────────┼───────');
      firstBlockedLine = false;
    }

    const wr      = b.wins / b.signals;
    const midP    = (b.lo + b.hi) / 2;
    const momEV   = (wr - midP) * 100;
    const fadeEV  = (midP - wr) * 100;
    const blocPct = i >= blockedStart ? `${(b.signals / totalSignals * 100).toFixed(1)}%`.padStart(7) : '      —';

    console.log(
      `   ${b.label.padEnd(17)}│` +
      `  ${String(b.signals).padStart(6)} │` +
      `  ${blocPct}  │` +
      `  ${(wr * 100).toFixed(1).padStart(5)}%   │` +
      `  ${(momEV >= 0 ? '+' : '') + momEV.toFixed(1).padStart(5)}%  │` +
      `  ${evTag(momEV)} │` +
      `  ${(fadeEV >= 0 ? '+' : '') + fadeEV.toFixed(1).padStart(5)}%  │` +
      `  ${evTag(fadeEV)}`
    );
  }
}

function printMagBuckets(magBuckets) {
  console.log('\n  BY CANDLE MAGNITUDE AT SIGNAL');
  console.log('  ' + '─'.repeat(W));
  console.log('   Candle Magnitude │ Signals │ Avg Est. Price │ Win Rate │ Mom EV   │       │ Fade EV  │');
  console.log('  ─────────────────┼─────────┼────────────────┼──────────┼──────────┼───────┼──────────┼───────');

  for (const b of magBuckets) {
    if (b.signals === 0) continue;
    const wr      = b.wins / b.signals;
    const avgP    = b.sumPrice / b.signals;
    const momEV   = (wr - avgP) * 100;
    const fadeEV  = (avgP - wr) * 100;

    console.log(
      `   ${b.label.padEnd(17)}│` +
      `  ${String(b.signals).padStart(6)} │` +
      `  ${(avgP * 100).toFixed(1).padStart(6)}¢ (avg)  │` +
      `  ${(wr * 100).toFixed(1).padStart(5)}%   │` +
      `  ${(momEV >= 0 ? '+' : '') + momEV.toFixed(1).padStart(5)}%  │` +
      `  ${evTag(momEV)} │` +
      `  ${(fadeEV >= 0 ? '+' : '') + fadeEV.toFixed(1).padStart(5)}%  │` +
      `  ${evTag(fadeEV)}`
    );
  }
}

function printMinuteBuckets(minBuckets) {
  console.log('\n  BY DETECTION MINUTE');
  console.log('  ' + '─'.repeat(60));
  console.log('   Candle │ Signals │ Avg Est. Price │ Win Rate');
  console.log('  ────────┼─────────┼────────────────┼──────────');

  for (const [t, b] of Object.entries(minBuckets)) {
    if (b.s === 0) continue;
    const wr   = b.w / b.s;
    const avgP = b.sumP / b.s;
    console.log(
      `   T+${t}    │` +
      `  ${String(b.s).padStart(6)} │` +
      `  ${(avgP * 100).toFixed(1).padStart(6)}¢ (avg)  │` +
      `  ${(wr * 100).toFixed(1).padStart(5)}%`
    );
  }
}

function printRecommendation(priceBuckets, totalSignals) {
  console.log('\n  RECOMMENDATION');
  console.log('  ' + '─'.repeat(60));

  let firstMomPositive   = null;
  let firstFadePositive  = null;
  let blockedSignals     = 0;
  let fadePosSignals     = 0;

  const blockedStart = PRICE_BUCKETS.findIndex(b => b.lo >= 0.81);

  for (let i = 0; i < priceBuckets.length; i++) {
    const b = priceBuckets[i];
    if (b.signals === 0) continue;

    const wr     = b.wins / b.signals;
    const midP   = (b.lo + b.hi) / 2;
    const momEV  = (wr - midP) * 100;
    const fadeEV = (midP - wr) * 100;

    if (i >= blockedStart) blockedSignals += b.signals;
    if (i >= blockedStart && fadeEV > 0) fadePosSignals += b.signals;

    if (firstMomPositive  === null && momEV  > 0) firstMomPositive  = b.label;
    if (firstFadePositive === null && fadeEV > 0) firstFadePositive = b.label;
  }

  const blockedPct = totalSignals > 0 ? (blockedSignals / totalSignals * 100).toFixed(1) : '0';
  const fadeSavePct = blockedSignals > 0 ? (fadePosSignals / blockedSignals * 100).toFixed(1) : '0';

  console.log(`   Total signals detected (all magnitudes):  ${totalSignals}`);
  console.log(`   Signals blocked by 81¢ cap:               ${blockedSignals} (${blockedPct}% of total)`);
  console.log(`   Of those, Fade has positive EV:           ${fadePosSignals} (${fadeSavePct}% of blocked)`);
  console.log('');
  if (firstMomPositive)  console.log(`   Momentum positive EV from:  ${firstMomPositive} and below`);
  if (firstFadePositive) console.log(`   Fade positive EV from:       ${firstFadePositive} and above`);
  console.log('');
  console.log(`   NOTE: EV calculation uses bucket midpoint as proxy for entry price.`);
  console.log(`         "Actual" entry prices will vary within each bucket.`);
  console.log(`         Results are empirical win rates on Binance candle resolution,`);
  console.log(`         proxied via Black-Scholes for Polymarket price estimate.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  let cryptosToRun;
  if (args.all) {
    cryptosToRun = CRYPTOS;
  } else if (args.crypto) {
    if (!CRYPTOS[args.crypto]) {
      console.error(`Unknown crypto: ${args.crypto}. Use BTC, ETH, SOL, or XRP.`);
      process.exit(1);
    }
    cryptosToRun = { [args.crypto]: CRYPTOS[args.crypto] };
  } else {
    cryptosToRun = { BTC: 'BTCUSDT' };
  }

  console.log('\n' + '═'.repeat(W));
  console.log('  CONDITIONAL WIN RATE — T123 Signals × Estimated Polymarket Price');
  console.log(`  Min threshold: ${THRESHOLD}%  |  BS vol: ${(VOL_ANNUAL*100).toFixed(0)}%  |  ${MAX_CANDLES} candles`);
  console.log(`  Question: "At market price X¢, does Momentum or Fade have positive EV?"`);
  console.log('═'.repeat(W));

  const allSignals = []; // for combined table when --all

  for (const [crypto, symbol] of Object.entries(cryptosToRun)) {
    process.stdout.write(`\n  Loading ${symbol}... `);
    const candles = loadCandles(symbol);
    console.log(`${candles.length} candles (${(candles.length / 1440).toFixed(1)} days)`);

    const result = analyze(symbol, candles);

    console.log('\n' + '═'.repeat(W));
    console.log(`  ${crypto}  |  ${result.days.toFixed(1)} days  |  ${result.cycles} cycles  |  ${result.signals.length} signals detected`);
    console.log('═'.repeat(W));

    const priceBuckets = buildPriceBuckets(result.signals);
    const magBuckets   = buildMagBuckets(result.signals);
    const minBuckets   = buildMinuteBuckets(result.signals);

    printPriceBuckets(priceBuckets, result.signals.length);
    printMagBuckets(magBuckets);
    printMinuteBuckets(minBuckets);
    printRecommendation(priceBuckets, result.signals.length);

    for (const s of result.signals) allSignals.push({ ...s, crypto });
  }

  // Combined summary when running all 4 cryptos
  if (args.all && Object.keys(cryptosToRun).length > 1) {
    console.log('\n' + '═'.repeat(W));
    console.log(`  COMBINED — ALL CRYPTOS (${allSignals.length} signals total)`);
    console.log('═'.repeat(W));
    printPriceBuckets(buildPriceBuckets(allSignals), allSignals.length);
    printMagBuckets(buildMagBuckets(allSignals));
    printRecommendation(buildPriceBuckets(allSignals), allSignals.length);
  }

  console.log('\n' + '═'.repeat(W) + '\n');
}

main().catch(console.error);
