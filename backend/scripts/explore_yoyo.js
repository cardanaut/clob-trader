#!/usr/bin/env node
/**
 * explore_yoyo.js — Yoyo reversal risk analysis
 *
 * Tests whether PRE-SPIKE context (Binance 1-min candles + previous PM cycle)
 * can predict "yoyo" reversals — i.e., spikes that fail to sustain until binary close.
 *
 * Features tested per signal (PM-resolved):
 *   1. n1_same     : direction of Binance 1-min candle ENDING at cycleStart = same as spike?
 *   2. n2_same     : same for candle ending at cycleStart-1min
 *   3. net3_same   : net % move in last 3×1-min before cycle = same direction?
 *   4. net5_same   : net % move in last 5×1-min before cycle = same direction?
 *   5. pre_exhaust : |net5m| > threshold (large pre-move before spike = exhaustion risk)
 *   6. prev_cycle  : PM outcome of PREVIOUS same-duration cycle = same direction?
 *   7. spike_ratio : spike_pct / per-crypto threshold (bigger = more conviction)
 *
 * Uses canonical periods: C85 for 5m, C165 for 15m (best strategy per autoscan).
 *
 * Usage:
 *   node backend/scripts/explore_yoyo.js           # both 5m and 15m
 *   node backend/scripts/explore_yoyo.js --5m      # 5-min only
 *   node backend/scripts/explore_yoyo.js --15m     # 15-min only
 *   node backend/scripts/explore_yoyo.js -v        # verbose: print each LOSS context
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const args    = process.argv.slice(2);
const hasFlag = k => args.includes(k);
const verbose = hasFlag('-v');
const only5m  = hasFlag('--5m');
const only15m = hasFlag('--15m');

const LOG_DIR   = path.join(__dirname, '..', 'logs');
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const CRYPTOS   = ['BTC', 'ETH', 'SOL', 'XRP'];

// Per-crypto thresholds (from MEMORY.md / live config)
const TH_5M  = { BTC: 0.24, ETH: 0.44, SOL: 0.22, XRP: 0.24 };
const TH_15M = { BTC: 0.29, ETH: 0.20, SOL: 0.20, XRP: 0.22 };

// Periods to analyse (one per timeframe — the canonical best)
const PERIODS = [
  ...(!only15m ? [85]  : []),
  ...(!only5m  ? [165] : []),
];

// ── PM outcomes ───────────────────────────────────────────────────────────────
const pmFile = path.join(CACHE_DIR, 'pm_outcomes.json');
if (!fs.existsSync(pmFile)) { console.error('Missing pm_outcomes.json'); process.exit(1); }
const pmRaw = JSON.parse(fs.readFileSync(pmFile, 'utf8'));
function pmOutcome(crypto, cycleStartMs, durationSecs) {
  const k = `${crypto}_${Math.round(cycleStartMs / 1000)}_${durationSecs}`;
  return pmRaw[k] ?? null;
}

// ── Binance 1-min candle cache ────────────────────────────────────────────────
// For each candle: ts = open time (ms), dir = +1 if close>open, -1 otherwise
const binance = {};
for (const cr of CRYPTOS) {
  const file = path.join(CACHE_DIR, `candles-1m-${cr}USDT-5000.json`);
  if (!fs.existsSync(file)) { console.warn(`[warn] Missing ${file}`); continue; }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const candles = (raw.candles || []).map(c => ({
    ts   : new Date(c.timestamp).getTime(),
    open : parseFloat(c.open),
    close: parseFloat(c.close),
    dir  : parseFloat(c.close) >= parseFloat(c.open) ? 1 : -1,
    body : (() => {
      const h = parseFloat(c.high) - parseFloat(c.low);
      return h > 0 ? Math.abs(parseFloat(c.close) - parseFloat(c.open)) * 100 / h : 0;
    })(),
    movePct: (parseFloat(c.close) - parseFloat(c.open)) / parseFloat(c.open) * 100,
  })).sort((a, b) => a.ts - b.ts);
  // O(1) lookup by open-timestamp
  binance[cr] = new Map(candles.map(c => [c.ts, c]));
}

function getCandle(crypto, tsMs) {
  return binance[crypto]?.get(tsMs) ?? null;
}

// Net % move over N×1-min candles BEFORE cycleStart (going backwards)
function preNetMove(crypto, cycleStartMs, n) {
  let net = 0, found = 0;
  for (let i = 1; i <= n; i++) {
    const c = getCandle(crypto, cycleStartMs - i * 60_000);
    if (!c) continue;
    net += c.movePct;
    found++;
  }
  return found >= Math.ceil(n * 0.8) ? net : null; // need ≥80% of candles
}

// ── CSV signal reader ─────────────────────────────────────────────────────────
const CSV_COLS = ['timestamp','cycle_start','crypto','open','high','low','close','spike_pct','yes_ask','no_ask'];
function readCsv(period) {
  const fp = path.join(LOG_DIR, `t1000_candles_C${period}.csv`);
  if (!fs.existsSync(fp)) { console.warn(`[warn] Missing C${period}.csv`); return []; }
  const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean);
  if (!lines.length) return [];
  const hasHdr = lines[0].trim().startsWith('timestamp');
  const hdrs = hasHdr ? lines[0].split(',') : CSV_COLS;
  const data = hasHdr ? lines.slice(1) : lines;
  const cents = f => (f && f.trim() ? parseFloat(f) / 100 : null);
  return data.map(l => {
    const v = l.split(',');
    const r = Object.fromEntries(hdrs.map((h, i) => [h.trim(), v[i]]));
    return {
      cycleStart : new Date(r.cycle_start).getTime(),
      crypto     : r.crypto?.trim(),
      spikePct   : parseFloat(r.spike_pct),
      open       : parseFloat(r.open),
      high       : parseFloat(r.high),
      low        : parseFloat(r.low),
      close      : parseFloat(r.close),
      yesAsk     : cents(r.yes_ask),
      noAsk      : cents(r.no_ask),
    };
  }).filter(r => r.crypto && CRYPTOS.includes(r.crypto) && !isNaN(r.spikePct) && !isNaN(r.cycleStart));
}

// ── Build signal dataset ──────────────────────────────────────────────────────
const signals = [];

for (const period of PERIODS) {
  const is15m      = period >= 150;
  const durSecs    = is15m ? 900 : 300;
  const thByCrypto = is15m ? TH_15M : TH_5M;
  const rows       = readCsv(period);

  for (const row of rows) {
    const th = thByCrypto[row.crypto];
    if (Math.abs(row.spikePct) < th) continue;       // below threshold

    const outcome = pmOutcome(row.crypto, row.cycleStart, durSecs);
    if (!outcome) continue;                           // no PM resolution

    const dir = row.spikePct >= 0 ? 'UP' : 'DOWN';
    const win = outcome === dir;
    const spikeDir = dir === 'UP' ? 1 : -1;

    // ── Feature 1 & 2: N-1 and N-2 1-min candle direction ──────────────────
    const cn1 = getCandle(row.crypto, row.cycleStart - 60_000);
    const cn2 = getCandle(row.crypto, row.cycleStart - 120_000);
    const n1_same = cn1 ? (cn1.dir === spikeDir) : null;
    const n2_same = cn2 ? (cn2.dir === spikeDir) : null;
    const n1_body = cn1 ? cn1.body : null;

    // ── Feature 3 & 4: Net pre-move over 3 and 5 minutes ───────────────────
    const net3 = preNetMove(row.crypto, row.cycleStart, 3);
    const net5 = preNetMove(row.crypto, row.cycleStart, 5);
    const net3_same = net3 !== null ? ((net3 >= 0) === (dir === 'UP')) : null;
    const net5_same = net5 !== null ? ((net5 >= 0) === (dir === 'UP')) : null;
    const net5_abs  = net5 !== null ? Math.abs(net5) : null;

    // ── Feature 5: Exhaustion = large pre-move in same direction ────────────
    // "Same-direction pre-move > Nth percentile" indicates possible exhaustion
    const exhaust_05 = (net5 !== null && net5_same) ? net5_abs : null;

    // ── Feature 6: Previous cycle PM outcome ───────────────────────────────
    const prevCycleStart = row.cycleStart - durSecs * 1000;
    const prevOutcome    = pmOutcome(row.crypto, prevCycleStart, durSecs);
    const prev_same      = prevOutcome ? (prevOutcome === dir) : null;

    // ── Feature 7: Spike ratio (×threshold) ────────────────────────────────
    const spikeRatio = Math.abs(row.spikePct) / th;

    // ── Entry price (for context) ───────────────────────────────────────────
    const entryPrice = dir === 'UP' ? (row.yesAsk ?? null) : (row.noAsk ?? null);

    signals.push({
      crypto: row.crypto, is15m, win, dir, period,
      spikePct: row.spikePct, spikeRatio,
      n1_same, n2_same, n1_body,
      net3_same, net5_same, net5_abs,
      prev_same,
      entryPrice,
      cycleStart: row.cycleStart,
    });
  }
}

// ── Reporting helpers ─────────────────────────────────────────────────────────
function wr(arr) {
  if (!arr.length) return '   —   ';
  const w = arr.filter(x => x.win).length;
  return `${(w/arr.length*100).toFixed(1)}% (${w}/${arr.length})`;
}
function liftPct(baseline, subset) {
  if (!baseline.length || !subset.length) return '  —  ';
  const b = baseline.filter(x => x.win).length / baseline.length;
  const s = subset.filter(x => x.win).length / subset.length;
  const d = ((s - b) * 100).toFixed(1);
  return (s > b ? '+' : '') + d + '%';
}
function row(label, all, keep, skip) {
  const allWr = all.filter(x=>x.win).length / all.length;
  const kLift = keep.length ? ((keep.filter(x=>x.win).length/keep.length - allWr)*100).toFixed(1) : null;
  const sLift = skip.length ? ((skip.filter(x=>x.win).length/skip.length - allWr)*100).toFixed(1) : null;
  const kStr  = keep.length ? `${wr(keep).padEnd(16)} ${kLift >= 0 ? '+' : ''}${kLift}%` : '—';
  const sStr  = skip.length ? `${wr(skip).padEnd(16)} ${sLift >= 0 ? '+' : ''}${sLift}%` : '—';
  console.log(`  ${label.padEnd(30)} KEEP: ${kStr.padEnd(24)}  SKIP: ${sStr}`);
}

// ── Analysis per timeframe ────────────────────────────────────────────────────
const groups = [
  ['5-MINUTE  (C85)', signals.filter(x => !x.is15m)],
  ['15-MINUTE (C165)', signals.filter(x => x.is15m)],
];

for (const [label, pool] of groups) {
  if (!pool.length) continue;
  console.log(`\n${'═'.repeat(76)}`);
  console.log(`  ${label} — ${pool.length} PM-resolved signals`);
  console.log(`  Baseline WR: ${wr(pool)}  (${pool.filter(x=>x.win).length}W ${pool.filter(x=>!x.win).length}L)`);
  console.log('═'.repeat(76));

  // ── Feature 1: N-1 candle direction ──────────────────────────────────────
  const f1 = pool.filter(x => x.n1_same !== null);
  row('N-1 candle: SAME dir as spike', f1,
    f1.filter(x =>  x.n1_same),
    f1.filter(x => !x.n1_same));

  // ── Feature 2: N-2 candle direction ──────────────────────────────────────
  const f2 = pool.filter(x => x.n2_same !== null);
  row('N-2 candle: SAME dir as spike', f2,
    f2.filter(x =>  x.n2_same),
    f2.filter(x => !x.n2_same));

  // ── Feature: Both N-1 AND N-2 same direction ─────────────────────────────
  const f12 = pool.filter(x => x.n1_same !== null && x.n2_same !== null);
  row('N-1 AND N-2: both SAME dir', f12,
    f12.filter(x =>  x.n1_same &&  x.n2_same),
    f12.filter(x => !x.n1_same || !x.n2_same));

  // ── Feature: N-1 OR N-2 same dir (at least one) ──────────────────────────
  row('N-1 OR N-2: at least one SAME', f12,
    f12.filter(x =>  x.n1_same ||  x.n2_same),
    f12.filter(x => !x.n1_same && !x.n2_same));

  // ── Feature 3: 3-min pre-move direction ──────────────────────────────────
  const f3 = pool.filter(x => x.net3_same !== null);
  row('3-min pre-move: SAME dir', f3,
    f3.filter(x =>  x.net3_same),
    f3.filter(x => !x.net3_same));

  // ── Feature 4: 5-min pre-move direction ──────────────────────────────────
  const f5 = pool.filter(x => x.net5_same !== null);
  row('5-min pre-move: SAME dir', f5,
    f5.filter(x =>  x.net5_same),
    f5.filter(x => !x.net5_same));

  // ── Feature 5: Exhaustion thresholds ─────────────────────────────────────
  console.log(`\n  Pre-spike same-dir 5m move (exhaustion) — skip if over threshold:`);
  for (const thresh of [0.10, 0.15, 0.20, 0.25, 0.30]) {
    const valid = pool.filter(x => x.net5_same !== null);
    const overExt  = valid.filter(x =>  x.net5_same && x.net5_abs > thresh);
    const notOverExt = valid.filter(x => !x.net5_same || x.net5_abs <= thresh);
    if (!overExt.length) continue;
    console.log(`    >0.${(thresh*100).toFixed(0).padStart(2,'0')}% pre: SKIP ${wr(overExt).padEnd(16)} KEEP ${wr(notOverExt)}`);
  }

  // ── Feature 6: Previous cycle PM outcome ─────────────────────────────────
  const f6 = pool.filter(x => x.prev_same !== null);
  console.log('');
  row('Prev PM cycle: SAME dir', f6,
    f6.filter(x =>  x.prev_same),
    f6.filter(x => !x.prev_same));

  // ── Feature 7: Spike ratio ────────────────────────────────────────────────
  console.log(`\n  Spike size (× per-crypto threshold):`);
  for (const [lo, hi, lbl] of [[1,1.2,'1.0-1.2x'],[1.2,1.5,'1.2-1.5x'],[1.5,2,'1.5-2.0x'],[2,99,'2.0x+']]) {
    const sub = pool.filter(x => x.spikeRatio >= lo && x.spikeRatio < hi);
    if (!sub.length) continue;
    console.log(`    ${lbl}: ${wr(sub)}`);
  }

  // ── N-1 strong body analysis ──────────────────────────────────────────────
  console.log(`\n  N-1 candle body strength (indecision before spike):`);
  const fBody = pool.filter(x => x.n1_body !== null);
  for (const thresh of [30, 50, 70]) {
    const strong = fBody.filter(x => x.n1_body >= thresh);
    const weak   = fBody.filter(x => x.n1_body <  thresh);
    console.log(`    N-1 body ≥ ${thresh}%: ${wr(strong).padEnd(18)} body < ${thresh}%: ${wr(weak)}`);
  }

  // ── Best combo: N-1 same + prev cycle same ────────────────────────────────
  console.log(`\n  Combined features:`);
  const combo = pool.filter(x => x.n1_same !== null && x.prev_same !== null);
  const both_same = combo.filter(x =>  x.n1_same &&  x.prev_same);
  const both_opp  = combo.filter(x => !x.n1_same && !x.prev_same);
  const mixed     = combo.filter(x =>  x.n1_same !==  x.prev_same);
  console.log(`    N-1 SAME + prev SAME:          ${wr(both_same)}`);
  console.log(`    N-1 OPP  + prev OPP:           ${wr(both_opp)}`);
  console.log(`    Mixed (N-1 ≠ prev):            ${wr(mixed)}`);

  const n1Net5 = pool.filter(x => x.n1_same !== null && x.net5_same !== null);
  const n1SameNet5Same = n1Net5.filter(x =>  x.n1_same &&  x.net5_same);
  const n1SameNet5Opp  = n1Net5.filter(x =>  x.n1_same && !x.net5_same);
  const n1OppNet5Same  = n1Net5.filter(x => !x.n1_same &&  x.net5_same);
  const n1OppNet5Opp   = n1Net5.filter(x => !x.n1_same && !x.net5_same);
  console.log(`    N-1 SAME + net5 SAME:          ${wr(n1SameNet5Same)}`);
  console.log(`    N-1 SAME + net5 OPP (reversal):${wr(n1SameNet5Opp)}`);
  console.log(`    N-1 OPP  + net5 SAME (exhaust): ${wr(n1OppNet5Same)}`);
  console.log(`    N-1 OPP  + net5 OPP:            ${wr(n1OppNet5Opp)}`);

  // ── Per-crypto breakdown for best feature (N-1 dir) ──────────────────────
  console.log(`\n  Per-crypto — N-1 direction:`);
  for (const cr of CRYPTOS) {
    const sub = pool.filter(x => x.crypto === cr && x.n1_same !== null);
    if (!sub.length) continue;
    const same = sub.filter(x =>  x.n1_same);
    const opp  = sub.filter(x => !x.n1_same);
    console.log(`    ${cr}: N-1 SAME=${wr(same).padEnd(18)} N-1 OPP=${wr(opp)}`);
  }

  console.log(`\n  Per-crypto — prev cycle direction:`);
  for (const cr of CRYPTOS) {
    const sub = pool.filter(x => x.crypto === cr && x.prev_same !== null);
    if (!sub.length) continue;
    const same = sub.filter(x =>  x.prev_same);
    const opp  = sub.filter(x => !x.prev_same);
    console.log(`    ${cr}: prev SAME=${wr(same).padEnd(18)} prev OPP=${wr(opp)}`);
  }

  // ── Verbose: print each LOSS with pre-spike context ───────────────────────
  if (verbose) {
    console.log(`\n  Losses (pre-spike context):`);
    const losses = pool.filter(x => !x.win).sort((a,b) => a.cycleStart - b.cycleStart);
    for (const s of losses) {
      const dt = new Date(s.cycleStart).toISOString().slice(5,16).replace('T',' ');
      const sp = `${s.spikePct >= 0 ? '+' : ''}${s.spikePct.toFixed(3)}%`;
      const n1 = s.n1_same === null ? '?' : s.n1_same ? 'SAME' : 'OPP ';
      const n2 = s.n2_same === null ? '?' : s.n2_same ? 'SAME' : 'OPP ';
      const p5 = s.net5_same === null ? '    ?' : (s.net5_same ? 'SAME' : 'OPP ') + ` ${(s.net5_abs||0).toFixed(2)}%`;
      const pc = s.prev_same === null ? '?' : s.prev_same ? 'SAME' : 'OPP';
      console.log(`    ${dt} ${s.crypto} ${s.dir.padEnd(4)} spike=${sp}  n1=${n1} n2=${n2} pre5=${p5}  prevCycle=${pc}`);
    }
  }
}

// ── Summary across both timeframes ───────────────────────────────────────────
if (signals.length) {
  console.log(`\n${'═'.repeat(76)}`);
  console.log(`  ALL (5m+15m) — ${signals.length} signals  baseline WR: ${wr(signals)}`);
  console.log('═'.repeat(76));

  // The single most actionable filter: what would N-1 OPP skip?
  const f1all = signals.filter(x => x.n1_same !== null);
  const kept  = f1all.filter(x =>  x.n1_same);
  const skipt = f1all.filter(x => !x.n1_same);
  console.log(`  N-1 SAME (keep):  ${wr(kept)}`);
  console.log(`  N-1 OPP  (skip):  ${wr(skipt)}`);
  const skippedLosses = skipt.filter(x => !x.win).length;
  const skippedWins   = skipt.filter(x =>  x.win).length;
  console.log(`  → Skipping N-1 OPP would eliminate ${skippedLosses} losses and ${skippedWins} wins`);

  const fPrevAll = signals.filter(x => x.prev_same !== null);
  const kPrev    = fPrevAll.filter(x =>  x.prev_same);
  const sPrev    = fPrevAll.filter(x => !x.prev_same);
  console.log(`\n  Prev cycle SAME (keep): ${wr(kPrev)}`);
  console.log(`  Prev cycle OPP  (skip): ${wr(sPrev)}`);
  const skL2 = sPrev.filter(x => !x.win).length;
  const skW2 = sPrev.filter(x =>  x.win).length;
  console.log(`  → Skipping prev OPP would eliminate ${skL2} losses and ${skW2} wins`);
}

console.log('');
