#!/usr/bin/env node
'use strict';

/**
 * Super Candle Reversion Backtest
 *
 * Strategy:
 *   1. Build N-min "super candles" from 1-min data  (--super-size, default 20)
 *      open  = 1st 1-min candle OPEN
 *      close = Nth 1-min candle CLOSE
 *      high  = max of all N highs
 *      low   = min of all N lows
 *
 *   2. Group into "super markets" of M super candles  (--market-size, default 5)
 *
 *   3. Detect a spike on super candles T+0, T+1, T+2
 *
 *   4. After spike super candle closes → zoom into the next N 1-min candles
 *      and track mean reversion tick by tick
 *
 *   5. Report reversion curve + revenue estimate
 *
 * Usage:
 *   node backend/scripts/backtest_super_candle.js
 *   node backend/scripts/backtest_super_candle.js --super-size 15 --threshold 0.4
 *   node backend/scripts/backtest_super_candle.js --sweep --crypto BTC
 *   node backend/scripts/backtest_super_candle.js --help
 */

const fs   = require('fs');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], n = process.argv[i + 1];
  if (a === '--threshold'  || a === '-t')  { args.threshold   = parseFloat(n); i++; }
  if (a === '--crypto'     || a === '-c')  { args.crypto       = n.toUpperCase(); i++; }
  if (a === '--sweep')                     { args.sweep        = true; }
  if (a === '--candles')                   { args.candles      = parseInt(n);    i++; }
  if (a === '--super-size' || a === '-s')  { args.superSize    = parseInt(n);    i++; }
  if (a === '--market-size'|| a === '-m')  { args.marketSize   = parseInt(n);    i++; }
  if (a === '--revert-target'||a==='-r')   { args.revertTarget = parseFloat(n);  i++; }
  if (a === '--capital')                   { args.capital      = parseFloat(n);  i++; }
  if (a === '--risk')                      { args.risk         = parseFloat(n);  i++; }
  if (a === '--entry-price')               { args.entryPrice   = parseFloat(n);  i++; }
  if (a === '--exit-price')                { args.exitPrice    = parseFloat(n);  i++; }
  if (a === '--max-position')              { args.maxPosition  = parseFloat(n);  i++; }
  if (a === '--help' || a === '-h')        { args.help         = true; }
}

if (args.help) {
  console.log(`
Super Candle Reversion Backtest

USAGE:
  node backtest_super_candle.js [OPTIONS]

CANDLE PARAMETERS:
  -s, --super-size    N   1-min candles per super candle   (default: 20)
  -m, --market-size   N   super candles per market         (default:  5)
  -t, --threshold     N   spike threshold % on super candle(default:  0.5)
  -c, --crypto        X   BTC | ETH | SOL | XRP | ALL     (default: ALL)
      --candles       N   candles to load from cache       (default: 50000)
      --sweep             sweep thresholds 0.3%..1.5%

REVENUE PARAMETERS:
  -r, --revert-target N   % of spike to count as win       (default: 25)
      --capital       N   starting capital $               (default: 215)
      --risk          N   risk % per trade                 (default: 5)
      --entry-price   N   NO token price at entry  0-1     (default: 0.25)
      --exit-price    N   NO token price at exit   0-1     (default: 0.30)
      --max-position  N   max position size $             (default: 150)

EXAMPLES:
  node backtest_super_candle.js --super-size 15 --threshold 0.4
  node backtest_super_candle.js --super-size 20 --revert-target 30 --capital 500
  node backtest_super_candle.js --sweep --crypto BTC --super-size 15
`);
  process.exit(0);
}

// ── Constants (overridable via CLI) ───────────────────────────────────────────
const SUPER_SIZE      = args.superSize    || 20;
const MARKET_SIZE     = args.marketSize   || 5;
const REVERT_TARGET   = (args.revertTarget || 25) / 100;  // e.g. 25 → 0.25
const MAX_CANDLES     = args.candles      || 50000;

// Revenue params
const CAPITAL         = args.capital      || 215;
const RISK_PCT        = args.risk         || 5;
const ENTRY_PRICE     = args.entryPrice   || 0.25;
const EXIT_PRICE      = args.exitPrice    || 0.30;
const MAX_POSITION    = args.maxPosition  || 150;

const CHECK_AT        = [0, 1, 2]; // check T+0, T+1, T+2 super candles for spike

const CRYPTOS = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  XRP: 'XRPUSDT',
};

// ── Load candle cache ─────────────────────────────────────────────────────────
function loadCandles(symbol) {
  const cacheDir  = path.join(__dirname, '../cache');
  const cachePath = path.join(cacheDir, `candles-1m-${symbol}-${MAX_CANDLES}.json`);

  if (!fs.existsSync(cachePath)) {
    console.error(`Cache not found: ${cachePath}`);
    console.error(`Run a backtest first to populate the cache, or use --candles 10000`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  // Normalise: timestamps may be stored as strings
  return raw.candles.map(c => ({
    timestamp: new Date(c.timestamp),
    open:   parseFloat(c.open),
    high:   parseFloat(c.high),
    low:    parseFloat(c.low),
    close:  parseFloat(c.close),
    volume: parseFloat(c.volume),
  }));
}

// ── Build super candles ───────────────────────────────────────────────────────
function buildSuperCandles(candles, superSize) {
  const supers = [];
  // Only build complete groups of superSize
  for (let i = 0; i + superSize <= candles.length; i += superSize) {
    const group = candles.slice(i, i + superSize);
    const open  = group[0].open;
    const close = group[superSize - 1].close;
    const high  = Math.max(...group.map(c => c.high));
    const low   = Math.min(...group.map(c => c.low));
    const movementPct = Math.abs((close - open) / open * 100);
    supers.push({
      idx:         i / SUPER_SIZE,          // super-candle index in the full series
      startMinute: i,                        // index into candles[] for first 1-min candle
      timestamp:   group[0].timestamp,
      open, close, high, low,
      movementPct,
      direction:   close >= open ? 'UP' : 'DOWN',
      candles:     group,                    // keep the 20 constituent 1-min candles
    });
  }
  return supers;
}

// ── Group super candles into super markets ────────────────────────────────────
function buildSuperMarkets(supers, marketSize) {
  const markets = [];
  for (let i = 0; i + marketSize <= supers.length; i += marketSize) {
    markets.push(supers.slice(i, i + marketSize));
  }
  return markets;
}

// ── Run backtest for one crypto + threshold ───────────────────────────────────
function runBacktest(symbol, threshold, allCandles) {
  const supers  = buildSuperCandles(allCandles);
  const markets = buildSuperMarkets(supers);

  let totalSpikes = 0;

  // Per-minute reversion tracking (minute 1..20 after spike)
  const revMinute = Array.from({ length: SUPER_SIZE }, () => ({ reached20: 0, reached50: 0, reached100: 0 }));

  // Aggregate reversion stats
  let reached20 = 0, reached50 = 0, reached100 = 0;
  let sumMinuteTo20 = 0, sumMinuteTo50 = 0, sumMinuteTo100 = 0;
  let countMinuteTo20 = 0, countMinuteTo50 = 0, countMinuteTo100 = 0;

  // How far did price get at BEST within the 20 follow-up minutes?
  const maxRevBuckets = [0, 0, 0, 0, 0]; // <20%, 20-50%, 50-100%, 100-150%, >150%

  for (const market of markets) {
    for (const sIdx of CHECK_AT) {
      const superCandle = market[sIdx];
      if (!superCandle) continue;

      // Spike detection
      if (superCandle.movementPct < threshold) continue;

      // Must have a following super candle in this market to observe
      const nextSC = market[sIdx + 1];
      if (!nextSC) continue;

      totalSpikes++;

      // Reference and entry prices
      const refPrice   = superCandle.open;    // super candle open = reference
      const entryPrice = superCandle.close;   // we enter counter trade at spike close
      const spikeDist  = entryPrice - refPrice;  // positive for UP, negative for DOWN
      const isUp       = superCandle.direction === 'UP';

      // The 20 individual 1-min candles of the next super candle
      const followMinutes = nextSC.candles;

      let best20min = 0; // best reversion ratio achieved within 20 minutes

      for (let m = 0; m < followMinutes.length; m++) {
        const price = followMinutes[m].close;

        // Reversion ratio: 0 = at entry, 1.0 = back at reference, >1 = overshot
        let revRatio;
        if (isUp) {
          revRatio = (entryPrice - price) / Math.abs(spikeDist);
        } else {
          revRatio = (price - entryPrice) / Math.abs(spikeDist);
        }

        if (revRatio > best20min) best20min = revRatio;

        const min1 = m + 1; // 1-indexed minute

        if (revRatio >= 0.20 && revMinute[m].reached20 !== undefined) {
          revMinute[m].reached20++;
        }
        if (revRatio >= 0.50) revMinute[m].reached50++;
        if (revRatio >= 1.00) revMinute[m].reached100++;

        // First-hit tracking (only count FIRST minute it reaches each level)
        if (revRatio >= 0.20 && !this_reached20) {
          this_reached20 = true;
          reached20++;
          sumMinuteTo20 += min1;
          countMinuteTo20++;
        }
        if (revRatio >= 0.50 && !this_reached50) {
          this_reached50 = true;
          reached50++;
          sumMinuteTo50 += min1;
          countMinuteTo50++;
        }
        if (revRatio >= 1.00 && !this_reached100) {
          this_reached100 = true;
          reached100++;
          sumMinuteTo100 += min1;
          countMinuteTo100++;
        }
      }

      // Bucket the best reversion
      if      (best20min < 0.20) maxRevBuckets[0]++;
      else if (best20min < 0.50) maxRevBuckets[1]++;
      else if (best20min < 1.00) maxRevBuckets[2]++;
      else if (best20min < 1.50) maxRevBuckets[3]++;
      else                       maxRevBuckets[4]++;

      // Reset per-spike flags (declared with var so they scope to the loop body)
      var this_reached20 = false, this_reached50 = false, this_reached100 = false;
    }

    // Fix: reset flags need to be declared before the inner loop
    // (already handled by var hoisting above — intentional)
  }

  if (totalSpikes === 0) {
    return { symbol, threshold, totalSpikes: 0 };
  }

  const pct = n => totalSpikes > 0 ? (n / totalSpikes * 100).toFixed(1) + '%' : '—';
  const avg = (sum, n) => n > 0 ? (sum / n).toFixed(1) : '—';

  return {
    symbol,
    threshold,
    totalSuperCandles: supers.length,
    totalMarkets:      markets.length,
    totalSpikes,
    daysCovered:       (allCandles[allCandles.length - 1].timestamp - allCandles[0].timestamp) / 86400000,

    // What % of spikes saw reversion at each level within 20 min?
    pct20:  pct(reached20),
    pct50:  pct(reached50),
    pct100: pct(reached100),

    // Average minute at which reversion first reached each level
    avgMinTo20:  avg(sumMinuteTo20,  countMinuteTo20),
    avgMinTo50:  avg(sumMinuteTo50,  countMinuteTo50),
    avgMinTo100: avg(sumMinuteTo100, countMinuteTo100),

    // Max reversion buckets: where does most spike follow-up land?
    maxRevDist: {
      '<20%':    maxRevBuckets[0],
      '20-50%':  maxRevBuckets[1],
      '50-100%': maxRevBuckets[2],
      '100-150%':maxRevBuckets[3],
      '>150%':   maxRevBuckets[4],
    },

    // Cumulative % of spikes that reached each level BY minute N
    revByMinute: revMinute.map((m, i) => ({
      minute: i + 1,
      pct20:  (m.reached20  / totalSpikes * 100).toFixed(1),
      pct50:  (m.reached50  / totalSpikes * 100).toFixed(1),
      pct100: (m.reached100 / totalSpikes * 100).toFixed(1),
    })),
  };
}

// ── Core backtest engine ──────────────────────────────────────────────────────
function runBacktestFixed(symbol, threshold, allCandles) {
  const superSize  = SUPER_SIZE;
  const marketSize = MARKET_SIZE;
  const supers  = buildSuperCandles(allCandles, superSize);
  const markets = buildSuperMarkets(supers, marketSize);

  let totalSpikes = 0;

  // Per-minute cumulative arrays (length = superSize follow-up minutes)
  const revByMinTarget = new Array(superSize).fill(0); // hits REVERT_TARGET
  const revByMin50     = new Array(superSize).fill(0);
  const revByMin100    = new Array(superSize).fill(0);

  let reachedTarget = 0, reached50 = 0, reached100 = 0;
  let sumMinToTarget = 0, sumMinTo50 = 0, sumMinTo100 = 0;
  const maxRevBuckets = [0, 0, 0, 0, 0]; // <target, target-50%, 50-100%, 100-150%, >150%

  for (const market of markets) {
    for (const sIdx of CHECK_AT) {
      const sc = market[sIdx];
      if (!sc || sc.movementPct < threshold) continue;

      const nextSC = market[sIdx + 1];
      if (!nextSC) continue;

      totalSpikes++;

      const refPrice   = sc.open;
      const entryPrice = sc.close;
      const spikeDist  = Math.abs(entryPrice - refPrice);
      const isUp       = sc.direction === 'UP';

      let hitTarget = false, hit50 = false, hit100 = false;
      let firstMinTarget = -1, firstMin50 = -1, firstMin100 = -1;
      let best = 0;

      const follow = nextSC.candles;
      for (let m = 0; m < follow.length; m++) {
        const price = follow[m].close;
        const rev   = isUp
          ? (entryPrice - price) / spikeDist
          : (price - entryPrice) / spikeDist;

        if (rev > best) best = rev;

        const min1 = m + 1;
        if (!hitTarget && rev >= REVERT_TARGET) { hitTarget = true; firstMinTarget = min1; reachedTarget++; sumMinToTarget += min1; }
        if (!hit50     && rev >= 0.50)          { hit50     = true; firstMin50     = min1; reached50++;     sumMinTo50     += min1; }
        if (!hit100    && rev >= 1.00)          { hit100    = true; firstMin100    = min1; reached100++;    sumMinTo100    += min1; }
      }

      // Build cumulative curve: "had hit by minute N"
      if (firstMinTarget > 0) for (let m = firstMinTarget - 1; m < superSize; m++) revByMinTarget[m]++;
      if (firstMin50     > 0) for (let m = firstMin50     - 1; m < superSize; m++) revByMin50[m]++;
      if (firstMin100    > 0) for (let m = firstMin100    - 1; m < superSize; m++) revByMin100[m]++;

      // Max reversion bucket
      if      (best < REVERT_TARGET) maxRevBuckets[0]++;
      else if (best < 0.50)          maxRevBuckets[1]++;
      else if (best < 1.00)          maxRevBuckets[2]++;
      else if (best < 1.50)          maxRevBuckets[3]++;
      else                           maxRevBuckets[4]++;
    }
  }

  if (totalSpikes === 0) return { symbol, threshold, totalSpikes: 0 };

  const days    = (allCandles[allCandles.length-1].timestamp - allCandles[0].timestamp) / 86400000;
  const p       = n => (n / totalSpikes * 100).toFixed(1) + '%';
  const av      = (s, n) => n > 0 ? (s / n).toFixed(1) + ' min' : '—';

  // ── Revenue estimate ─────────────────────────────────────────────────────
  // Win  = hit the revert target → sold NO at EXIT_PRICE
  // Loss = no reversion → held to expiry, NO token = $0 (lost everything)
  const winRate     = reachedTarget / totalSpikes;
  const posSize     = Math.min(CAPITAL * RISK_PCT / 100, MAX_POSITION);
  const shares      = posSize / ENTRY_PRICE;
  const winProfit   = (EXIT_PRICE - ENTRY_PRICE) * shares;   // profit on early exit
  const lossCost    = posSize;                                // total loss if no revert
  const evPerTrade  = winRate * winProfit - (1 - winRate) * lossCost;
  const revenueDay  = evPerTrade * (totalSpikes / days);

  return {
    symbol, threshold, superSize, marketSize,
    totalSuperCandles: supers.length,
    totalMarkets:      markets.length,
    totalSpikes,
    spikesPerDay:  (totalSpikes / days).toFixed(1),
    daysCovered:   days.toFixed(1),

    // Reversion stats
    pctRevertTarget: p(reachedTarget),
    pctRevert50:     p(reached50),
    pctRevert100:    p(reached100),
    avgMinToTarget:  av(sumMinToTarget, reachedTarget),
    avgMinTo50:      av(sumMinTo50,     reached50),
    avgMinTo100:     av(sumMinTo100,    reached100),

    maxRevDist: {
      [`no revert  (<${(REVERT_TARGET*100).toFixed(0)}%)`]: maxRevBuckets[0],
      [`partial    (${(REVERT_TARGET*100).toFixed(0)}-50%)`]: maxRevBuckets[1],
      'good   (50-100%)': maxRevBuckets[2],
      'full   (100-150%)': maxRevBuckets[3],
      'over   (>150%)':    maxRevBuckets[4],
    },

    revCurve: revByMinTarget.map((_, i) => ({
      minute:      i + 1,
      pctTarget:   (revByMinTarget[i] / totalSpikes * 100).toFixed(1),
      pct50:       (revByMin50[i]     / totalSpikes * 100).toFixed(1),
      pct100:      (revByMin100[i]    / totalSpikes * 100).toFixed(1),
    })),

    // Revenue
    winRate:       (winRate * 100).toFixed(1) + '%',
    positionSize:  posSize.toFixed(2),
    winProfit:     winProfit.toFixed(2),
    evPerTrade:    evPerTrade.toFixed(3),
    revenuePerDay: revenueDay.toFixed(2),
  };
}

// ── Format and print ──────────────────────────────────────────────────────────
function printResult(r) {
  if (r.totalSpikes === 0) {
    console.log(`  ${r.symbol} @ ${r.threshold}%: NO SPIKES FOUND`);
    return;
  }

  const W = 64;
  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  ${r.symbol}  |  Threshold: ${r.threshold}%  |  Super: ${r.superSize}min × ${r.marketSize} = ${r.superSize * r.marketSize}min market`);
  console.log(`  ${r.daysCovered} days  |  ${r.totalSpikes} spikes  (${r.spikesPerDay}/day)`);
  console.log(`${'═'.repeat(W)}`);

  const tPct = (REVERT_TARGET * 100).toFixed(0);
  console.log(`\n  REVERSION within next ${r.superSize} minutes:`);
  console.log(`    Hit ${tPct}% revert (your target):  ${r.pctRevertTarget.padStart(6)}  (avg at minute ${r.avgMinToTarget})`);
  console.log(`    Hit 50% revert:              ${r.pctRevert50.padStart(6)}  (avg at minute ${r.avgMinTo50})`);
  console.log(`    Hit 100% revert (full):      ${r.pctRevert100.padStart(6)}  (avg at minute ${r.avgMinTo100})`);

  console.log(`\n  MAX REVERSION DISTRIBUTION (where did price end up?):`);
  for (const [label, count] of Object.entries(r.maxRevDist)) {
    const bar = '█'.repeat(Math.round(count / r.totalSpikes * 30));
    console.log(`    ${label.padEnd(24)} ${String(count).padStart(5)}  ${bar}`);
  }

  console.log(`\n  REVERSION CURVE (% of spikes that had hit target BY minute N):`);
  console.log(`  Min | ≥${tPct}% reverted | ≥50% reverted | ≥100% reverted`);
  console.log(`  ────┼────────────────┼───────────────┼───────────────`);
  for (const row of r.revCurve) {
    if (row.minute === 1 || row.minute % 2 === 0 || row.minute === r.superSize) {
      const m    = String(row.minute).padStart(3);
      const pT   = (row.pctTarget + '%').padStart(7);
      const p50  = (row.pct50    + '%').padStart(7);
      const p100 = (row.pct100   + '%').padStart(7);
      console.log(`   ${m} |       ${pT}       |      ${p50}      |       ${p100}`);
    }
  }

  console.log(`\n  REVENUE ESTIMATE:`);
  console.log(`    Capital: $${CAPITAL}  |  Risk: ${RISK_PCT}%  |  Position: $${r.positionSize}`);
  console.log(`    Entry price (NO token): ${ENTRY_PRICE}  |  Exit price: ${EXIT_PRICE}`);
  console.log(`    Win rate (hit ${tPct}% revert): ${r.winRate}`);
  console.log(`    Profit per win:  $${r.winProfit}  |  Loss per miss: $${r.positionSize}`);
  console.log(`    EV per trade:    $${r.evPerTrade}`);
  const evColor = parseFloat(r.evPerTrade) >= 0 ? '✅' : '❌';
  console.log(`    Revenue/day:     $${r.revenuePerDay}  ${evColor}  (${r.spikesPerDay} trades/day)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const cryptosToRun = args.crypto
    ? { [args.crypto]: CRYPTOS[args.crypto] }
    : CRYPTOS;

  const thresholds = args.sweep
    ? [0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 1.00, 1.20, 1.50]
    : [args.threshold || 0.50];

  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  SUPER CANDLE REVERSION BACKTEST`);
  console.log(`  Super candle = ${SUPER_SIZE} min  |  Market = ${MARKET_SIZE} super candles (${SUPER_SIZE * MARKET_SIZE} min)`);
  console.log(`  Revert target = ${(REVERT_TARGET*100).toFixed(0)}%  |  Entry ${ENTRY_PRICE} → Exit ${EXIT_PRICE}  |  Risk ${RISK_PCT}%  |  Capital $${CAPITAL}`);
  console.log(`  Using ${MAX_CANDLES} 1-min candles from cache`);
  console.log(`${'═'.repeat(64)}\n`);

  const sweepRows = [];

  for (const [crypto, symbol] of Object.entries(cryptosToRun)) {
    if (!symbol) { console.error(`Unknown crypto: ${crypto}`); continue; }

    process.stdout.write(`Loading ${symbol}... `);
    const candles = loadCandles(symbol);
    console.log(`${candles.length} candles loaded.`);

    for (const thr of thresholds) {
      const result = runBacktestFixed(crypto, thr, candles);
      printResult(result);
      sweepRows.push(result);
    }
  }

  if (args.sweep && sweepRows.length > 1) {
    console.log(`\n${'═'.repeat(72)}`);
    console.log(`  SWEEP SUMMARY  |  Entry ${ENTRY_PRICE} → Exit ${EXIT_PRICE}  |  Risk ${RISK_PCT}%  |  Capital $${CAPITAL}`);
    console.log(`${'═'.repeat(72)}`);
    console.log(`  Crypto  Thresh  Spikes/day  WinRate   EV/trade  Rev/day`);
    console.log(`  ──────  ──────  ──────────  ───────   ────────  ───────`);
    for (const r of sweepRows) {
      if (r.totalSpikes === 0) continue;
      const revDay = parseFloat(r.revenuePerDay);
      const tag = revDay > 0 ? ' ✅' : ' ❌';
      const cryptoName = r.symbol.replace('USDT','');
      console.log(
        `  ${cryptoName.padEnd(6)}  ${(r.threshold+'%').padEnd(6)}  ${r.spikesPerDay.padStart(10)}  ${r.winRate.padStart(7)}   $${r.evPerTrade.padStart(7)}  $${r.revenuePerDay}${tag}`
      );
    }
    console.log(`${'═'.repeat(72)}\n`);
  } else {
    console.log(`\n${'═'.repeat(62)}\n`);
  }
}

main().catch(console.error);
