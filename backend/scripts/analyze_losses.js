'use strict';

/**
 * LIVE Trade Loss Analyzer
 *
 * Reads LIVE/LIVE_MINI activityLog from t1000-state.json,
 * extracts features from contextCandles + log fields, and
 * reports which patterns are most predictive of losses.
 *
 * Usage:
 *   node backend/scripts/analyze_losses.js           → console report
 *   node backend/scripts/analyze_losses.js --csv     → also saves backend/logs/loss_analysis.csv
 *   node backend/scripts/analyze_losses.js --detail  → also prints per-loss details
 */

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const STATE_FILE = path.join(__dirname, '../../logs/t1000-state.json');
const STRATEGIES = ['LIVE', 'LIVE_MINI'];
const SAVE_CSV   = process.argv.includes('--csv');
const DETAIL     = process.argv.includes('--detail');

// ── Load trades ───────────────────────────────────────────────────────────────
function loadTrades() {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const trades = [];
  for (const key of STRATEGIES) {
    const s = state[key];
    if (!s) continue;
    for (const e of s.activityLog || []) {
      if (e.status !== 'WIN' && e.status !== 'LOSS') continue;
      if (!e.orderPlaced) continue;
      trades.push({ ...e, _strat: key });
    }
  }
  return trades;
}

// ── Feature extraction ────────────────────────────────────────────────────────
function extractFeatures(entry) {
  const cc  = entry.contextCandles || [];
  const sig = cc.at(-1);   // signal candle (the one that triggered the trade)
  const pre = cc.at(-2);   // previous cycle candle

  const isUp   = entry.spike_pct > 0;  // direction of spike
  const dir    = entry.direction || (isUp ? 'UP' : 'DOWN');
  const isUpTrade = dir === 'UP';      // we bought YES (UP) or NO (DOWN)

  // ── Signal candle features ──────────────────────────────────────────────────
  let signalBodyRatio  = entry.body_ratio ?? null;  // already in log (%)
  let counterWickRatio = null;  // wick against our trade direction (0-100%)
  let signalPMprice    = null;  // Polymarket price for our direction at signal
  let cycleMoveVsOpen  = null;  // Binance % move within signal candle

  if (sig) {
    const range = sig.h - sig.l;
    if (range > 0) {
      // Counter-wick: how much the candle tested against our direction
      // UP trade: lower wick (o - l) = price dipped before going up = less conviction
      // DOWN trade: upper wick (h - o) = price rose before going down = less conviction
      const cw = isUpTrade ? (sig.o - sig.l) : (sig.h - sig.o);
      counterWickRatio = cw / range * 100;
    }

    // Signal PM price (the Polymarket odds when we bought)
    signalPMprice = isUpTrade ? sig.ya : sig.na;

    // Binance move within signal candle (in our trade direction)
    if (sig.o > 0) {
      const rawMove = (sig.c - sig.o) / sig.o * 100;
      cycleMoveVsOpen = isUpTrade ? rawMove : -rawMove;
    }
  }

  // ── Previous cycle features ─────────────────────────────────────────────────
  let prevPMprice  = null;   // PM price for our direction one cycle before signal
  let pmJump       = null;   // how much PM price moved from prev cycle to signal

  if (pre) {
    prevPMprice = isUpTrade ? pre.ya : pre.na;
    if (signalPMprice !== null) pmJump = signalPMprice - prevPMprice;
  }

  // ── Context candle run analysis ─────────────────────────────────────────────
  // How many of the last N context candles (excluding signal) had same-direction spike?
  let sameDirCount3 = 0;  // last 3 prior cycles
  let sameDirCount5 = 0;  // last 5 prior cycles
  let priorSpikeMag = null; // mean |sp| of last 3 prior cycles

  if (cc.length >= 2) {
    const priorCandles = cc.slice(0, -1); // all but signal candle
    const last5 = priorCandles.slice(-5);
    const last3 = priorCandles.slice(-3);

    for (const c of last3) {
      if ((isUpTrade && c.sp > 0) || (!isUpTrade && c.sp < 0)) sameDirCount3++;
    }
    for (const c of last5) {
      if ((isUpTrade && c.sp > 0) || (!isUpTrade && c.sp < 0)) sameDirCount5++;
    }
    priorSpikeMag = last3.reduce((s, c) => s + Math.abs(c.sp), 0) / last3.length;
  }

  // ── PM price momentum (last 3 cycles) ──────────────────────────────────────
  // Was the PM price trending in our direction before the signal?
  let pmTrend3 = null;  // avg change per cycle in our PM price over last 3 prior cycles
  if (cc.length >= 4) {
    const last4 = cc.slice(-4);  // 3 prior + signal
    const pmVals = last4.map(c => isUpTrade ? c.ya : c.na);
    // Slope: (last - first) / 3
    pmTrend3 = (pmVals[3] - pmVals[0]) / 3;
  }

  // ── Previous cycle spike consistency (Polymarket agreement) ────────────────
  // Was the Polymarket price ALREADY high before signal? (market pre-priced)
  // High prevPM means market was already pricing our direction → less room to move
  let alreadyPricedIn = null;
  if (prevPMprice !== null) {
    alreadyPricedIn = prevPMprice;  // higher = more already priced in
  }

  // ── T0 spike quality ratio ──────────────────────────────────────────────────
  // For T1 entries: was the T0 spike in the same direction?
  let t0SpikeSameDir = null;
  if (entry.isT1 && cc.length >= 2) {
    // The second-to-last context candle is the T0 candle (cycleStart candle)
    const t0Candle = cc.at(-2);
    if (t0Candle) {
      t0SpikeSameDir = isUpTrade ? t0Candle.sp > 0 : t0Candle.sp < 0;
    }
  }

  return {
    tradeId:         entry.tradeId,
    status:          entry.status,
    crypto:          entry.crypto,
    direction:       dir,
    isT1:            !!(entry.isT1),
    candle_size:     entry.candle_size,
    is15m:           entry.candle_size >= 150,
    strat:           entry._strat,
    // log fields
    entryPrice:      entry.entryPrice ?? null,
    signalPrice:     entry.signalPrice ?? null,
    spikePct:        Math.abs(entry.spike_pct || 0),
    bodyRatio:       signalBodyRatio,       // % body of signal candle (0-100)
    pnl:             entry.pnl ?? null,
    // signal candle
    counterWickRatio,   // % wick against trade direction (higher = less conviction)
    signalPMprice,      // PM price (ya/na) at signal time
    cycleMoveVsOpen,    // Binance % move within signal candle (in our direction)
    // previous cycle
    prevPMprice,        // PM price one cycle before signal
    pmJump,             // signalPM - prevPM (how much PM jumped this cycle)
    alreadyPricedIn,    // prevPMprice (alias)
    // context window
    sameDirCount3,      // prior cycles with same direction (last 3)
    sameDirCount5,      // prior cycles with same direction (last 5)
    priorSpikeMag,      // mean |sp| in last 3 prior cycles
    pmTrend3,           // PM price trend over last 3+signal cycles
    t0SpikeSameDir,     // for T1: was T0 spike in same direction?
    hasCtx:             cc.length >= 2,
  };
}

// ── Statistical helpers ───────────────────────────────────────────────────────
function stats(arr) {
  const v = arr.filter(x => x !== null && !isNaN(x));
  if (!v.length) return { mean: null, median: null, std: null, n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sorted = [...v].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const std = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  return { mean: +mean.toFixed(4), median: +median.toFixed(4), std: +std.toFixed(4), n: v.length };
}

function pct(n, d) {
  return d === 0 ? '—' : (n / d * 100).toFixed(0) + '%';
}

// ── Threshold sweep for a feature ────────────────────────────────────────────
// Returns rows: { threshold, lossAvoided, lossAvoidPct, winFiltered, winFilterPct, newWR }
function sweep(features, featureName, thresholds, condition) {
  const eligible = features.filter(f => f[featureName] !== null && !isNaN(f[featureName]));
  const totalW = eligible.filter(f => f.status === 'WIN').length;
  const totalL = eligible.filter(f => f.status === 'LOSS').length;

  return thresholds.map(t => {
    const matched = eligible.filter(f => condition(f[featureName], t));
    const lA = matched.filter(f => f.status === 'LOSS').length;
    const wF = matched.filter(f => f.status === 'WIN').length;
    const newW = totalW - wF;
    const newL = totalL - lA;
    const newWR = newW + newL > 0 ? newW / (newW + newL) * 100 : null;
    return {
      threshold:    t,
      lossAvoided:  lA, lossAvoidPct: totalL ? lA / totalL * 100 : 0,
      winFiltered:  wF, winFilterPct: totalW ? wF / totalW * 100 : 0,
      newWR:        newWR, totalW, totalL,
    };
  });
}

function printSweep(rows, fmt = x => x) {
  for (const r of rows) {
    const wr = r.newWR !== null ? r.newWR.toFixed(1) + '%' : '—';
    const avoid = `${r.lossAvoided}/${r.totalL} (${r.lossAvoidPct.toFixed(0)}%)`;
    const filter = `${r.winFiltered}/${r.totalW} (${r.winFilterPct.toFixed(0)}%)`;
    console.log(`    ${fmt(r.threshold).padEnd(8)}  avoid ${avoid.padEnd(16)}  filter ${filter.padEnd(16)}  → WR ${wr}`);
  }
}

// ── Combined filter helper ────────────────────────────────────────────────────
function testFilter(features, filterFn) {
  const eligible = features.filter(f => filterFn(f) !== null); // null = can't evaluate
  const matched  = eligible.filter(f => filterFn(f) === true); // matched = would skip trade
  const totalW  = eligible.filter(f => f.status === 'WIN').length;
  const totalL  = eligible.filter(f => f.status === 'LOSS').length;
  const lA = matched.filter(f => f.status === 'LOSS').length;
  const wF = matched.filter(f => f.status === 'WIN').length;
  const newW = totalW - wF;
  const newL = totalL - lA;
  const newWR = newW + newL > 0 ? newW / (newW + newL) * 100 : null;
  return { lA, wF, totalL, totalW, newWR, lossAvoidPct: totalL ? lA/totalL*100 : 0, winFilterPct: totalW ? wF/totalW*100 : 0 };
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const trades   = loadTrades();
  const features = trades.map(extractFeatures);
  const wins     = features.filter(f => f.status === 'WIN');
  const losses   = features.filter(f => f.status === 'LOSS');
  const totalWR  = wins.length / (wins.length + losses.length) * 100;

  // ── Header ──────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('  LIVE TRADE LOSS ANALYZER');
  console.log(`  Total: ${wins.length} WINs, ${losses.length} LOSSes  WR: ${totalWR.toFixed(1)}%  (${features.length} trades)`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // ── By crypto ───────────────────────────────────────────────────────────────
  console.log('\n── By crypto ───────────────────────────────────────────────────');
  for (const c of ['BTC','ETH','SOL','XRP']) {
    const w = wins.filter(f=>f.crypto===c).length;
    const l = losses.filter(f=>f.crypto===c).length;
    console.log(`  ${c}: ${w}W ${l}L  WR ${w+l>0?(w/(w+l)*100).toFixed(1)+'%':'—'}`);
  }

  // ── By T0/T1 ────────────────────────────────────────────────────────────────
  console.log('\n── By T0 / T1 ──────────────────────────────────────────────────');
  for (const t1 of [false, true]) {
    const w = wins.filter(f=>f.isT1===t1).length;
    const l = losses.filter(f=>f.isT1===t1).length;
    console.log(`  ${t1?'T+1':'T+0'}: ${w}W ${l}L  WR ${w+l>0?(w/(w+l)*100).toFixed(1)+'%':'—'}`);
  }

  // ── By 5m / 15m ─────────────────────────────────────────────────────────────
  console.log('\n── By market period ────────────────────────────────────────────');
  for (const is15m of [false, true]) {
    const w = wins.filter(f=>f.is15m===is15m).length;
    const l = losses.filter(f=>f.is15m===is15m).length;
    console.log(`  ${is15m?'15m':'5m '}: ${w}W ${l}L  WR ${w+l>0?(w/(w+l)*100).toFixed(1)+'%':'—'}`);
  }

  // ── By direction ─────────────────────────────────────────────────────────────
  console.log('\n── By direction ────────────────────────────────────────────────');
  for (const dir of ['UP','DOWN']) {
    const w = wins.filter(f=>f.direction===dir).length;
    const l = losses.filter(f=>f.direction===dir).length;
    console.log(`  ${dir}: ${w}W ${l}L  WR ${w+l>0?(w/(w+l)*100).toFixed(1)+'%':'—'}`);
  }

  // ── Feature distributions (WIN vs LOSS) ──────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  FEATURE DISTRIBUTIONS  (WIN vs LOSS)');
  console.log('══════════════════════════════════════════════════════════════════');

  const featureDefs = [
    ['Entry price',          'entryPrice',      x => x.toFixed(3)],
    ['Signal PM price',      'signalPMprice',   x => x.toFixed(3)],
    ['Prev cycle PM price',  'prevPMprice',     x => x.toFixed(3)],
    ['PM jump (prev→signal)','pmJump',          x => x.toFixed(3)],
    ['Spike %',              'spikePct',        x => x.toFixed(3)+'%'],
    ['Body ratio %',         'bodyRatio',       x => x.toFixed(1)+'%'],
    ['Counter-wick %',       'counterWickRatio',x => x.toFixed(1)+'%'],
    ['Cycle move in dir %',  'cycleMoveVsOpen', x => x.toFixed(3)+'%'],
    ['Same-dir count (3)',   'sameDirCount3',   x => x.toFixed(1)],
    ['Same-dir count (5)',   'sameDirCount5',   x => x.toFixed(1)],
    ['Prior spike mag (3)',  'priorSpikeMag',   x => x.toFixed(3)+'%'],
    ['PM trend (3 cycles)',  'pmTrend3',        x => x.toFixed(3)],
  ];

  for (const [label, field, fmt] of featureDefs) {
    const wStats = stats(wins.map(f => f[field]));
    const lStats = stats(losses.map(f => f[field]));
    if (wStats.n === 0 && lStats.n === 0) continue;
    const wMed = wStats.median !== null ? fmt(wStats.median) : '—';
    const lMed = lStats.median !== null ? fmt(lStats.median) : '—';
    const wMean = wStats.mean !== null ? fmt(wStats.mean) : '—';
    const lMean = lStats.mean !== null ? fmt(lStats.mean) : '—';
    console.log(`  ${label.padEnd(26)} WIN median=${wMed.padEnd(9)} LOSS median=${lMed.padEnd(9)}  (WIN mean=${wMean}, LOSS mean=${lMean})`);
  }

  // ── Per-loss detail table ────────────────────────────────────────────────────
  if (DETAIL) {
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  LOSS DETAIL TABLE');
    console.log('══════════════════════════════════════════════════════════════════');
    const cols = ['tradeId','dir','T1','entry','sigPM','prevPM','pmJump','body','cWick','cycMov','samDir3','pnl'];
    console.log('  ' + cols.map(c => c.padEnd(12)).join(''));
    for (const f of losses) {
      const n = x => x !== null && x !== undefined ? x : '—';
      const fp = (x, d=2) => x !== null && x !== undefined ? (+x).toFixed(d) : '—';
      console.log('  ' + [
        (f.tradeId||'').slice(0,30).padEnd(30),
        f.direction.padEnd(5),
        (f.isT1?'T1':'T0').padEnd(4),
        fp(f.entryPrice,2).padEnd(6),
        fp(f.signalPMprice,2).padEnd(6),
        fp(f.prevPMprice,2).padEnd(6),
        fp(f.pmJump,3).padEnd(7),
        fp(f.bodyRatio,0).padEnd(5),
        fp(f.counterWickRatio,0).padEnd(6),
        fp(f.cycleMoveVsOpen,3).padEnd(8),
        String(f.sameDirCount3).padEnd(7),
        fp(f.pnl,2),
      ].join(' '));
    }
  }

  // ── Pattern Analysis ─────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  PATTERN ANALYSIS  (skip trade if condition met)');
  console.log('  cols: threshold → avoided L/total (%) | filtered W/total (%) | new WR');
  console.log('══════════════════════════════════════════════════════════════════');

  // 1. Entry price
  console.log('\n  1. Entry price > X (expensive entry = thin margin)');
  printSweep(sweep(features, 'entryPrice', [0.78,0.80,0.82,0.84,0.85,0.86,0.87,0.88,0.90], (v,t)=>v>t), x=>'>'+x.toFixed(2));

  // 2. Signal PM price
  console.log('\n  2. Signal PM price > X (market already priced in)');
  printSweep(sweep(features, 'signalPMprice', [0.75,0.78,0.80,0.82,0.84,0.85,0.87,0.90], (v,t)=>v>t), x=>'>'+x.toFixed(2));

  // 3. Previous cycle PM price
  console.log('\n  3. Previous cycle PM price > X (already high before spike)');
  printSweep(sweep(features, 'prevPMprice', [0.55,0.60,0.65,0.70,0.75], (v,t)=>v>t), x=>'>'+x.toFixed(2));

  // 4. PM jump size (how aggressively price jumped this cycle)
  console.log('\n  4. PM price jump prev→signal > X (over-aggressive spike)');
  printSweep(sweep(features, 'pmJump', [0.10,0.15,0.20,0.25,0.30,0.35], (v,t)=>v>t), x=>'>'+x.toFixed(2));

  // 5. Counter-wick (candle tested against our direction)
  console.log('\n  5. Counter-wick % > X (signal candle went hard against our direction)');
  printSweep(sweep(features, 'counterWickRatio', [10,20,30,40,50], (v,t)=>v>t), x=>'>'+x.toFixed(0)+'%');

  // 6. Body ratio too low (weak conviction candle)
  console.log('\n  6. Body ratio < X% (doji / low-conviction candle)');
  printSweep(sweep(features, 'bodyRatio', [60,65,70,75,80], (v,t)=>v<t), x=>'<'+x.toFixed(0)+'%');

  // 7. Spike magnitude too small
  console.log('\n  7. Spike % < X (weak spike = potential noise)');
  printSweep(sweep(features, 'spikePct', [0.15,0.20,0.25,0.30], (v,t)=>v<t), x=>'<'+x.toFixed(2)+'%');

  // 8. Same-direction prior cycles
  console.log('\n  8. Same-direction count (last 3 prior cycles) >= X (exhaustion?)');
  printSweep(sweep(features, 'sameDirCount3', [2,3], (v,t)=>v>=t), x=>'>='+x);

  // 9. Cycle Binance move (already moved a lot within signal candle)
  console.log('\n  9. Binance move within signal candle > X% in our direction');
  printSweep(sweep(features, 'cycleMoveVsOpen', [0.10,0.15,0.20,0.25,0.30], (v,t)=>v>t), x=>'>'+x.toFixed(2)+'%');

  // ── Combined filter candidates ────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  COMBINED FILTER CANDIDATES');
  console.log('  (only show combos that avoid >25% losses AND filter <15% wins)');
  console.log('══════════════════════════════════════════════════════════════════');

  const combos = [];

  // Try: signalPM + entryPrice
  for (const spThresh of [0.78,0.80,0.82,0.84,0.85,0.86,0.87]) {
    for (const epThresh of [0.78,0.80,0.82,0.84,0.85,0.87]) {
      if (epThresh < spThresh) continue;
      const r = testFilter(features, f => {
        if (f.entryPrice === null || f.signalPMprice === null) return null;
        return f.entryPrice > epThresh || f.signalPMprice > spThresh;
      });
      combos.push({ desc: `sigPM>${spThresh.toFixed(2)} OR entry>${epThresh.toFixed(2)}`, ...r });
    }
  }

  // Try: prevPM + entryPrice
  for (const ppThresh of [0.55,0.60,0.65,0.70]) {
    for (const epThresh of [0.80,0.82,0.84,0.85,0.86]) {
      const r = testFilter(features, f => {
        if (f.prevPMprice === null || f.entryPrice === null) return null;
        return f.prevPMprice > ppThresh && f.entryPrice > epThresh;
      });
      combos.push({ desc: `prevPM>${ppThresh.toFixed(2)} AND entry>${epThresh.toFixed(2)}`, ...r });
    }
  }

  // Try: pmJump + signalPM
  for (const jThresh of [0.15,0.20,0.25]) {
    for (const spThresh of [0.75,0.78,0.80,0.82]) {
      const r = testFilter(features, f => {
        if (f.pmJump === null || f.signalPMprice === null) return null;
        return f.pmJump > jThresh && f.signalPMprice > spThresh;
      });
      combos.push({ desc: `pmJump>${jThresh.toFixed(2)} AND sigPM>${spThresh.toFixed(2)}`, ...r });
    }
  }

  // Try: counterWick + signalPM
  for (const cwThresh of [15,25,35]) {
    for (const spThresh of [0.78,0.80,0.82,0.84]) {
      const r = testFilter(features, f => {
        if (f.counterWickRatio === null || f.signalPMprice === null) return null;
        return f.counterWickRatio > cwThresh && f.signalPMprice > spThresh;
      });
      combos.push({ desc: `cWick>${cwThresh}% AND sigPM>${spThresh.toFixed(2)}`, ...r });
    }
  }

  // Filter interesting combos
  const good = combos
    .filter(r => r.lossAvoidPct > 25 && r.winFilterPct < 15)
    .sort((a, b) => (b.lossAvoidPct - b.winFilterPct * 2) - (a.lossAvoidPct - a.winFilterPct * 2));

  if (good.length === 0) {
    console.log('  No combo met the threshold (>25% losses avoided, <15% wins filtered)');
    // Show top 10 by avoid/filter tradeoff anyway
    const top = combos
      .filter(r => r.totalL > 0)
      .sort((a, b) => (b.lossAvoidPct - b.winFilterPct * 1.5) - (a.lossAvoidPct - a.winFilterPct * 1.5))
      .slice(0, 10);
    console.log('  Top 10 by avoid/filter score:');
    for (const r of top) {
      const wr = r.newWR !== null ? r.newWR.toFixed(1) + '%' : '—';
      console.log(`    ${r.desc.padEnd(42)}  avoid ${r.lA}/${r.totalL} (${r.lossAvoidPct.toFixed(0)}%)  filter ${r.wF}/${r.totalW} (${r.winFilterPct.toFixed(0)}%)  → WR ${wr}`);
    }
  } else {
    for (const r of good.slice(0, 15)) {
      const wr = r.newWR !== null ? r.newWR.toFixed(1) + '%' : '—';
      console.log(`    ${r.desc.padEnd(42)}  avoid ${r.lA}/${r.totalL} (${r.lossAvoidPct.toFixed(0)}%)  filter ${r.wF}/${r.totalW} (${r.winFilterPct.toFixed(0)}%)  → WR ${wr}`);
    }
  }

  // ── T1-specific analysis ──────────────────────────────────────────────────────
  const t1Features = features.filter(f => f.isT1);
  const t1Wins   = t1Features.filter(f => f.status === 'WIN');
  const t1Losses = t1Features.filter(f => f.status === 'LOSS');

  if (t1Losses.length > 0) {
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log(`  T+1 ENTRY ANALYSIS  (${t1Wins.length}W ${t1Losses.length}L WR ${(t1Wins.length/(t1Wins.length+t1Losses.length)*100).toFixed(1)}%)`);
    console.log('══════════════════════════════════════════════════════════════════');

    console.log('\n  T1 entry price > X:');
    printSweep(sweep(t1Features, 'entryPrice', [0.70,0.75,0.78,0.80,0.82,0.84,0.85,0.86,0.88,0.90], (v,t)=>v>t), x=>'>'+x.toFixed(2));

    console.log('\n  T1 spike % > X:');
    printSweep(sweep(t1Features, 'spikePct', [0.20,0.25,0.30,0.35,0.40,0.45,0.50], (v,t)=>v>t), x=>'>'+x.toFixed(2)+'%');

    // T1 where T0 was same direction
    const t1WithT0Dir = t1Features.filter(f => f.t0SpikeSameDir !== null);
    if (t1WithT0Dir.length > 0) {
      const t1SameDir = t1WithT0Dir.filter(f => f.t0SpikeSameDir);
      const t1OppDir  = t1WithT0Dir.filter(f => !f.t0SpikeSameDir);
      console.log('\n  T1 with T0 same direction:');
      const sdW = t1SameDir.filter(f=>f.status==='WIN').length;
      const sdL = t1SameDir.filter(f=>f.status==='LOSS').length;
      const odW = t1OppDir.filter(f=>f.status==='WIN').length;
      const odL = t1OppDir.filter(f=>f.status==='LOSS').length;
      console.log(`    T0 same dir: ${sdW}W ${sdL}L  WR ${sdW+sdL>0?(sdW/(sdW+sdL)*100).toFixed(1)+'%':'—'}`);
      console.log(`    T0 opp dir:  ${odW}W ${odL}L  WR ${odW+odL>0?(odW/(odW+odL)*100).toFixed(1)+'%':'—'}`);
    }
  }

  // ── Suspicious PM price patterns ─────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  POLYMARKET PRICE CONTEXT  (losses with signalPM > 0.80)');
  console.log('══════════════════════════════════════════════════════════════════');
  const highPMLoss = losses.filter(f => f.signalPMprice !== null && f.signalPMprice > 0.80);
  const highPMWin  = wins.filter(f => f.signalPMprice !== null && f.signalPMprice > 0.80);
  console.log(`  Losses with sigPM > 0.80: ${highPMLoss.length}/${losses.filter(f=>f.signalPMprice!==null).length}`);
  console.log(`  Wins  with sigPM > 0.80: ${highPMWin.length}/${wins.filter(f=>f.signalPMprice!==null).length}`);
  console.log(`  WR when sigPM > 0.80: ${highPMWin.length+highPMLoss.length>0?(highPMWin.length/(highPMWin.length+highPMLoss.length)*100).toFixed(1)+'%':'—'}`);

  const lowPMLoss = losses.filter(f => f.signalPMprice !== null && f.signalPMprice <= 0.80);
  const lowPMWin  = wins.filter(f => f.signalPMprice !== null && f.signalPMprice <= 0.80);
  console.log(`  WR when sigPM <= 0.80: ${lowPMWin.length+lowPMLoss.length>0?(lowPMWin.length/(lowPMWin.length+lowPMLoss.length)*100).toFixed(1)+'%':'—'}`);

  // ── CSV export ────────────────────────────────────────────────────────────────
  if (SAVE_CSV) {
    const csvPath = path.join(__dirname, '../../logs/loss_analysis.csv');
    const header  = 'tradeId,status,strat,crypto,direction,isT1,is15m,candle_size,' +
      'entryPrice,signalPrice,spikePct,bodyRatio,counterWickRatio,cycleMoveVsOpen,' +
      'signalPMprice,prevPMprice,pmJump,sameDirCount3,sameDirCount5,priorSpikeMag,pmTrend3,pnl\n';
    const rows = features.map(f => [
      f.tradeId, f.status, f.strat, f.crypto, f.direction, f.isT1?1:0, f.is15m?1:0, f.candle_size,
      f.entryPrice?.toFixed(4)??'', f.signalPrice?.toFixed(4)??'', f.spikePct?.toFixed(4)??'',
      f.bodyRatio?.toFixed(2)??'', f.counterWickRatio?.toFixed(2)??'', f.cycleMoveVsOpen?.toFixed(4)??'',
      f.signalPMprice?.toFixed(4)??'', f.prevPMprice?.toFixed(4)??'', f.pmJump?.toFixed(4)??'',
      f.sameDirCount3??'', f.sameDirCount5??'', f.priorSpikeMag?.toFixed(4)??'',
      f.pmTrend3?.toFixed(4)??'', f.pnl?.toFixed(4)??'',
    ].join(',')).join('\n');
    fs.writeFileSync(csvPath, header + rows);
    console.log(`\nCSV saved → ${csvPath}`);
  }

  console.log('');
}

main();
