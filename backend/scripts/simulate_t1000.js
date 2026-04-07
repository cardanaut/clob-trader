#!/usr/bin/env node
'use strict';

/**
 * T1000 CSV Simulator
 *
 * Usage:
 *   node simulate_t1000.js [options]
 *
 * Options:
 *   -th <pct>   Min |spike%|                (default: 0.24)
 *   -bl <usd>   Starting balance            (default: 1000)
 *   -mn <¢>     Min CLOB entry price        (default: 0)
 *   -mx <¢>     Max CLOB entry price        (default: 90)
 *   -rk <pct>   % of balance risked/trade   (default: 5)
 *   -vb         Verbose trade history
 *   -as         Autoscan — sweep all param combos and pick best per period
 *   -tp <n>     Top N results to show in autoscan (default: 5)
 *
 * Examples:
 *   node simulate_t1000.js -th 0.30 -mx 85 -vb
 *   node simulate_t1000.js -as
 *   node simulate_t1000.js -as -tp 3 -bl 500
 */

const fs   = require('fs');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
function flag(name) { return argv.includes(name); }

const threshold = parseFloat(arg('-th', '0.24'));
const startBal  = parseFloat(arg('-bl', '1000'));
const minPriceCents = parseFloat(arg('-mn', '0'));
const maxPriceCents = parseFloat(arg('-mx', '90'));
const riskPct   = parseFloat(arg('-rk', '5')) / 100;
const verbose   = flag('-vb');
const autoscan  = flag('-as');
const topN      = parseInt(arg('-tp', '5'), 10);

const minPrice = minPriceCents / 100;
const maxPrice = maxPriceCents / 100;

const PERIODS_5M  = [50, 55, 60, 65, 70, 75, 80, 85];
const PERIODS_15M = [150, 165, 180, 195, 210, 225, 240, 255];
const PERIODS     = [...PERIODS_5M, ...PERIODS_15M];
const CRYPTOS = ['BTC', 'ETH', 'SOL', 'XRP'];
const LOG_DIR  = path.join(__dirname, '../logs');

// ── ANSI ──────────────────────────────────────────────────────────────────────

const A = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
            green:'\x1b[32m', red:'\x1b[31m', cyan:'\x1b[36m', grey:'\x1b[90m', yellow:'\x1b[33m' };

const g = s => A.green  + s + A.reset;
const r = s => A.red    + s + A.reset;
const b = s => A.bold   + s + A.reset;
const d = s => A.dim    + s + A.reset;
const c = s => A.cyan   + s + A.reset;
const $ = s => A.grey   + s + A.reset;

// ── CSV reader ────────────────────────────────────────────────────────────────

// Column order as written by sub-candle-generator.js
const CSV_COLUMNS = ['timestamp','crypto','cycle_start','candle_size','open','high','low','close','spike_pct','yes_ask','no_ask','yes_bid','no_bid'];

function readCsv(period) {
  const fp = path.join(LOG_DIR, `t1000_candles_C${period}.csv`);
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, 'utf8').trim().split('\n');
  if (!lines.length) return [];
  // Files may be headerless if they were deleted while the server was running
  // (ensureCsvHeaders() fires only at startup; appendFileSync recreates without header)
  const hasHeader = lines[0].trim().startsWith('timestamp');
  const headers   = hasHeader ? lines[0].split(',') : CSV_COLUMNS;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines
    .filter(l => l.trim())
    .map(l => {
      const v = l.split(',');
      const row = Object.fromEntries(headers.map((h, i) => [h, v[i]]));
      const cents = f => (f && f.trim() ? parseFloat(f) / 100 : null);
      return {
        cycleStart : new Date(row.cycle_start),
        crypto     : row.crypto,
        open       : parseFloat(row.open),
        spikePct   : parseFloat(row.spike_pct),
        yesAsk     : cents(row.yes_ask),
        noAsk      : cents(row.no_ask),
      };
    });
}

// ── Load signals for unified sim (richer objects with timestamp + market key) ─

function loadSignalsForUnified(period) {
  const rows = readCsv(period);
  if (!rows.length) return [];

  const byCrypto = {};
  for (const cr of CRYPTOS) {
    byCrypto[cr] = rows.filter(row => row.crypto === cr)
      .sort((a, b) => a.cycleStart - b.cycleStart);
  }
  const cycles = [...new Set(rows.map(row => row.cycleStart.getTime()))].sort((a, b) => a - b);

  const expectedGap = period >= 150 ? 900_000 : 300_000;
  const is15m = period >= 150;
  const signals = [];

  for (let ci = 0; ci < cycles.length - 1; ci++) {
    const thisMs = cycles[ci];
    const nextMs = cycles[ci + 1];
    if (nextMs - thisMs !== expectedGap) continue;
    for (const cr of CRYPTOS) {
      const candle = byCrypto[cr].find(row => row.cycleStart.getTime() === thisMs);
      const next   = byCrypto[cr].find(row => row.cycleStart.getTime() === nextMs);
      if (!candle || !next) continue;
      signals.push({
        ts        : thisMs + period * 1000,   // exact snapshot time = entry time
        period,
        is15m,
        cycleStart: thisMs,
        crypto    : cr,
        absSpike  : Math.abs(candle.spikePct),
        direction : candle.spikePct >= 0 ? 'UP' : 'DOWN',
        yesAsk    : candle.yesAsk,
        noAsk     : candle.noAsk,
        winIfUp   : next.open > candle.open,
      });
    }
  }
  return signals;
}

// ── Unified simulation (shared balance — one entry per market) ────────────────

function simulateUnified() {
  // Collect signals from ALL periods across both cycle lengths
  let allSignals = [];
  for (const period of PERIODS) {
    allSignals = allSignals.concat(loadSignalsForUnified(period));
  }
  // Sort chronologically by snapshot timestamp
  allSignals.sort((a, b) => a.ts - b.ts);

  const durationDays = allSignals.length > 1
    ? (allSignals[allSignals.length - 1].ts - allSignals[0].ts) / (1000 * 60 * 60 * 24)
    : 0;

  let balance = startBal;
  const trades = [];
  // One entry per (cycleStart × crypto × market-type).
  // Key prevents entering the same market twice when multiple candle sizes qualify.
  // BUT: if an earlier candle size doesn't qualify (spike/price filter), a later one can still fire.
  const entered = new Set();
  let bust = false;

  for (const sig of allSignals) {
    if (bust) break;
    // Market identity: same 5-min or 15-min contract for this crypto/cycle
    const key = `${sig.cycleStart}-${sig.crypto}-${sig.is15m ? '15m' : '5m'}`;
    if (entered.has(key)) continue;          // already entered this market
    if (sig.absSpike < threshold) continue;  // spike too small — don't mark entered yet
    const entry = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
    if (entry == null || entry < minPrice || entry > maxPrice) continue; // price filter
    if (balance <= 0) { bust = true; break; }

    entered.add(key);                        // lock this market — no further entries
    const isWin = (sig.direction === 'UP' && sig.winIfUp) || (sig.direction === 'DOWN' && !sig.winIfUp);
    const pos   = Math.max(1, balance * riskPct);
    const pnl   = isWin ? pos * (1 - entry) / entry : -pos;
    balance     = Math.max(0, balance + pnl);

    trades.push({
      ts        : sig.ts,
      period    : sig.period,
      is15m     : sig.is15m,
      crypto    : sig.crypto,
      direction : sig.direction,
      spikePct  : (sig.direction === 'UP' ? 1 : -1) * sig.absSpike,
      entryPrice: entry,
      outcome   : isWin ? 'WIN' : 'LOSS',
      pnl,
      balance,
    });
  }

  const wins   = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  return { trades, wins, losses, total: wins + losses, pnl: balance - startBal, finalBalance: balance, bust, durationDays };
}

// ── Unified pair sim (each period uses its own optimized params) ──────────────
// params = { th: float%, mn: float[0-1], mx: float[0-1] }

function simulateUnifiedPair(sigs5m, params5m, sigs15m, params15m) {
  const all = [...sigs5m, ...sigs15m].sort((a, b) => a.ts - b.ts);

  let balance = startBal;
  let wins = 0, losses = 0, trades5m = 0, trades15m = 0;
  let firstTradeTs = null, lastTradeTs = null;
  const entered = new Set();

  for (const sig of all) {
    const params = sig.is15m ? params15m : params5m;
    const key    = `${sig.cycleStart}-${sig.crypto}-${sig.is15m ? '15m' : '5m'}`;
    if (entered.has(key)) continue;
    if (sig.absSpike < params.th) continue;
    const entry = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
    if (entry == null || entry < params.mn || entry > params.mx) continue;
    if (balance <= 0) break;

    entered.add(key);
    const isWin = (sig.direction === 'UP' && sig.winIfUp) || (sig.direction === 'DOWN' && !sig.winIfUp);
    const pos   = Math.max(1, balance * riskPct);
    const pnl   = isWin ? pos * (1 - entry) / entry : -pos;
    balance     = Math.max(0, balance + pnl);
    if (isWin) wins++; else losses++;
    if (sig.is15m) trades15m++; else trades5m++;
    if (firstTradeTs === null) firstTradeTs = sig.ts;
    lastTradeTs = sig.ts;
  }

  // Duration from first to last ACTUAL trade (not all signals) — avoids
  // asymmetry when 5-min and 15-min datasets cover different time spans
  const durationDays = firstTradeTs !== null && lastTradeTs !== firstTradeTs
    ? (lastTradeTs - firstTradeTs) / (1000 * 60 * 60 * 24)
    : 0;

  return { wins, losses, total: wins + losses, trades5m, trades15m,
           pnl: balance - startBal, finalBalance: balance, durationDays };
}

// ── Preload signals (used by autoscan for speed) ──────────────────────────────

function preloadSignals(period) {
  const rows = readCsv(period);
  if (!rows.length) return null;

  const byCrypto = {};
  for (const cr of CRYPTOS) {
    byCrypto[cr] = rows.filter(row => row.crypto === cr)
      .sort((a, b) => a.cycleStart - b.cycleStart);
  }
  const cycles = [...new Set(rows.map(row => row.cycleStart.getTime()))].sort((a, b) => a - b);

  const expectedGap = period >= 150 ? 900_000 : 300_000;
  const signals = [];
  for (let ci = 0; ci < cycles.length - 1; ci++) {
    const thisMs = cycles[ci];
    const nextMs = cycles[ci + 1];
    if (nextMs - thisMs !== expectedGap) continue;
    for (const cr of CRYPTOS) {
      const candle = byCrypto[cr].find(row => row.cycleStart.getTime() === thisMs);
      const next   = byCrypto[cr].find(row => row.cycleStart.getTime() === nextMs);
      if (!candle || !next) continue;
      signals.push({
        absSpike  : Math.abs(candle.spikePct),
        direction : candle.spikePct >= 0 ? 'UP' : 'DOWN',
        yesAsk    : candle.yesAsk,
        noAsk     : candle.noAsk,
        winIfUp   : next.open > candle.open,
      });
    }
  }
  return signals;
}

// ── Fast sim (no trade log — for autoscan) ────────────────────────────────────

function fastSim(signals, th, mn, mx) {
  let balance = startBal;
  let wins = 0, losses = 0;
  for (const sig of signals) {
    if (balance <= 0) break;
    if (sig.absSpike < th) continue;
    const entry = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
    if (entry == null || entry < mn || entry > mx) continue;
    const isWin = (sig.direction === 'UP' && sig.winIfUp) || (sig.direction === 'DOWN' && !sig.winIfUp);
    const pos   = Math.max(1, balance * riskPct);
    const pnl   = isWin ? pos * (1 - entry) / entry : -pos;
    balance     = Math.max(0, balance + pnl);
    if (isWin) wins++; else losses++;
  }
  return { wins, losses, total: wins + losses, pnl: balance - startBal };
}

// ── Full sim (with trade log — for normal mode) ───────────────────────────────

function simulatePeriod(period) {
  const rows = readCsv(period);
  if (!rows.length) return null;

  const byCrypto = {};
  for (const cr of CRYPTOS) {
    byCrypto[cr] = rows.filter(row => row.crypto === cr)
      .sort((a, b) => a.cycleStart - b.cycleStart);
  }
  const cycles = [...new Set(rows.map(row => row.cycleStart.getTime()))].sort((a, b) => a - b);
  const durationDays = cycles.length > 1
    ? (cycles[cycles.length - 1] - cycles[0]) / (1000 * 60 * 60 * 24)
    : 0;

  let balance = startBal;
  const trades = [];
  let bust = false;

  const expectedGap = period >= 150 ? 900_000 : 300_000;
  for (let ci = 0; ci < cycles.length - 1 && !bust; ci++) {
    const thisMs = cycles[ci];
    const nextMs = cycles[ci + 1];
    if (nextMs - thisMs !== expectedGap) continue;
    for (const crypto of CRYPTOS) {
      const candle = byCrypto[crypto].find(row => row.cycleStart.getTime() === thisMs);
      const next   = byCrypto[crypto].find(row => row.cycleStart.getTime() === nextMs);
      if (!candle || !next) continue;

      const absSpike   = Math.abs(candle.spikePct);
      if (absSpike < threshold) continue;

      const direction  = candle.spikePct >= 0 ? 'UP' : 'DOWN';
      const entryPrice = direction === 'UP' ? candle.yesAsk : candle.noAsk;

      if (entryPrice == null) {
        trades.push({ ...base(candle, next, direction, entryPrice, balance), outcome: 'NO_LIQ' });
        continue;
      }
      if (entryPrice < minPrice || entryPrice > maxPrice) {
        trades.push({ ...base(candle, next, direction, entryPrice, balance), outcome: 'SKIP' });
        continue;
      }
      if (balance <= 0) {
        bust = true;
        console.log(r(`\n  ⚠  C${period} BUST — balance depleted at ${candle.cycleStart.toISOString().slice(0,16).replace('T',' ')}, stopping.\n`));
        break;
      }

      const isUp  = next.open > candle.open;
      const isWin = (direction === 'UP' && isUp) || (direction === 'DOWN' && !isUp);
      const pos   = Math.max(1, balance * riskPct);
      const pnl   = isWin ? pos * (1 - entryPrice) / entryPrice : -pos;
      balance     = Math.max(0, balance + pnl);

      trades.push({ ...base(candle, next, direction, entryPrice, balance), outcome: isWin ? 'WIN' : 'LOSS', pnl });
    }
  }

  const wins   = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  const total  = wins + losses;
  return { period, trades, wins, losses, total, pnl: balance - startBal, finalBalance: balance, bust, durationDays };
}

function base(candle, next, direction, entryPrice, balance) {
  return {
    time       : candle.cycleStart.toISOString().slice(0, 16).replace('T', ' '),
    crypto     : candle.crypto,
    spikePct   : candle.spikePct,
    direction,
    entryPrice,
    refPrice   : candle.open,
    finalPrice : next.open,
    pnl        : 0,
    balance,
  };
}

// ── Print verbose ─────────────────────────────────────────────────────────────

function printVerbose(result) {
  const { period, trades } = result;
  const tradeCount = trades.filter(t => t.outcome === 'WIN' || t.outcome === 'LOSS').length;
  console.log('\n' + b(c(`══ C${period} `)) + d(`(${tradeCount} resolved trades, ${trades.length} total signals)`));
  console.log(d('Time             Crypto Dir       Spike%   Entry        Ref      Final  Result        PnL    Balance'));
  console.log(d('─'.repeat(100)));

  for (const t of trades) {
    const spikeStr = `${t.spikePct >= 0 ? '+' : ''}${t.spikePct.toFixed(3)}%`;
    const entryStr = t.entryPrice != null ? `${(t.entryPrice * 100).toFixed(0)}¢` : '—';
    const pnlRaw   = t.outcome === 'WIN'  ? `+$${t.pnl.toFixed(2)}`
                   : t.outcome === 'LOSS' ? `-$${Math.abs(t.pnl).toFixed(2)}` : '—';
    const balRaw   = `$${t.balance.toFixed(2)}`;
    const dirStr   = t.direction === 'UP' ? g('▲ UP') : r('▼ DN');

    let outcomeStr, pnlStr, balStr;
    if (t.outcome === 'WIN')       { outcomeStr = g(' WIN'); pnlStr = g(pnlRaw.padStart(10)); balStr = t.balance >= startBal ? g(balRaw.padStart(10)) : r(balRaw.padStart(10)); }
    else if (t.outcome === 'LOSS') { outcomeStr = r('LOSS'); pnlStr = r(pnlRaw.padStart(10)); balStr = t.balance >= startBal ? g(balRaw.padStart(10)) : r(balRaw.padStart(10)); }
    else                           { outcomeStr = $('SKIP'); pnlStr = $(pnlRaw.padStart(10)); balStr = $(balRaw.padStart(10)); }

    process.stdout.write(
      t.time.padEnd(17) + t.crypto.padEnd(7) + dirStr + '  ' +
      spikeStr.padStart(8) + '  ' + entryStr.padStart(6) + '  ' +
      t.refPrice.toFixed(2).padStart(10) + '  ' + t.finalPrice.toFixed(2).padStart(10) + '  ' +
      outcomeStr + '  ' + pnlStr + '  ' + balStr + '\n'
    );
  }
  const wr     = result.total > 0 ? (result.wins / result.total * 100).toFixed(1) + '%' : '—';
  const pnlStr = result.pnl >= 0 ? g(`+$${result.pnl.toFixed(2)}`) : r(`-$${Math.abs(result.pnl).toFixed(2)}`);
  console.log(d(`  → W:${result.wins}  L:${result.losses}  WR:${wr}  PnL: ${pnlStr}  Final: $${result.finalBalance.toFixed(2)}`));
}

// ── Duration helper ───────────────────────────────────────────────────────────

function getDurationDays(period) {
  const rows = readCsv(period);
  if (rows.length < 2) return 0;
  const times = rows.map(row => row.cycleStart.getTime());
  return (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60 * 24);
}

function durFmt(durationDays) {
  if (!durationDays || durationDays <= 0) return '—';
  const totalMins = Math.round(durationDays * 24 * 60);
  const days  = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins  = totalMins % 60;
  return `${days}d ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// ── Print summary ─────────────────────────────────────────────────────────────

function pnlPctStr(pnl, width = 8) {
  const pct = pnl / startBal * 100;
  const raw = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  return pct >= 0 ? g(raw.padStart(width)) : r(raw.padStart(width));
}

function projStr(pnl, durationDays, targetDays, width = 10) {
  if (!durationDays || durationDays <= 0) return d('—'.padStart(width));
  const proj = pnl / durationDays * targetDays;
  const raw  = (proj >= 0 ? '+$' : '-$') + Math.abs(proj).toFixed(0);
  return proj >= 0 ? g(raw.padStart(width)) : r(raw.padStart(width));
}

function printSummary(results, title = 'SUMMARY') {
  const hasData = results.some(r => r);
  if (!hasData) {
    console.log(d(`\n  (no data for ${title})`));
    return;
  }
  const sep = '═'.repeat(Math.max(4, 88 - title.length));
  console.log('\n' + b(`═══ ${title} ${sep}`));
  console.log(d('Period'.padEnd(8) + 'Trades'.padStart(7) + 'Wins'.padStart(6) + 'Losses'.padStart(7) + 'WinRate'.padStart(9) + 'PnL'.padStart(12) + 'PnL%'.padStart(9) + 'Final Bal'.padStart(11) + '→7d'.padStart(10) + '→30d'.padStart(11) + '  Duration'.padEnd(14)));
  console.log(d('─'.repeat(106)));

  let tW = 0, tL = 0, tP = 0;
  for (const res of results) {
    if (!res) continue;
    const wr     = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
    const pnlRaw = res.pnl >= 0 ? `+$${res.pnl.toFixed(2)}` : `-$${Math.abs(res.pnl).toFixed(2)}`;
    const balRaw = `$${res.finalBalance.toFixed(0)}`;
    const pnlStr = res.pnl >= 0 ? g(pnlRaw.padStart(12)) : r(pnlRaw.padStart(12));
    const balStr = res.bust ? r('BUST'.padStart(11)) : (res.finalBalance >= startBal ? g(balRaw.padStart(11)) : r(balRaw.padStart(11)));
    const durStr = d('  ' + durFmt(res.durationDays));
    process.stdout.write(
      `C${res.period}`.padEnd(8) +
      String(res.total).padStart(7) + String(res.wins).padStart(6) + String(res.losses).padStart(7) +
      wr.padStart(9) + '  ' + pnlStr + '  ' + pnlPctStr(res.pnl) + '  ' + balStr +
      projStr(res.pnl, res.durationDays, 7, 10) + ' ' +
      projStr(res.pnl, res.durationDays, 30, 10) + durStr + '\n'
    );
    tW += res.wins; tL += res.losses; tP += res.pnl;
  }
  console.log(d('─'.repeat(106)));
  const tTotal = tW + tL;
  const tWR    = tTotal > 0 ? (tW / tTotal * 100).toFixed(1) + '%' : '—';
  const tPnlR  = tP >= 0 ? `+$${tP.toFixed(2)}` : `-$${Math.abs(tP).toFixed(2)}`;
  process.stdout.write(b('ALL'.padEnd(8)) + b(String(tTotal).padStart(7)) + b(String(tW).padStart(6)) + b(String(tL).padStart(7)) + b(tWR.padStart(9)) + '  ' + (tP >= 0 ? g(tPnlR.padStart(12)) : r(tPnlR.padStart(12))) + '\n\n');
}

// ── Print unified result ──────────────────────────────────────────────────────

function printUnified(result) {
  const title = 'UNIFIED (5-MIN + 15-MIN — one shared balance)';
  const sep = '═'.repeat(Math.max(4, 88 - title.length));
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

  // Breakdown by market type
  const t5m  = result.trades.filter(t => !t.is15m);
  const t15m = result.trades.filter(t =>  t.is15m);
  const w5m  = t5m.filter(t => t.outcome === 'WIN').length;
  const w15m = t15m.filter(t => t.outcome === 'WIN').length;
  if (t5m.length)  process.stdout.write(d(`  5-min  trades: ${t5m.length}  W:${w5m} L:${t5m.length - w5m}  WR:${(w5m/t5m.length*100).toFixed(1)}%\n`));
  if (t15m.length) process.stdout.write(d(`  15-min trades: ${t15m.length}  W:${w15m} L:${t15m.length - w15m}  WR:${(w15m/t15m.length*100).toFixed(1)}%\n`));

  // Verbose trade log
  if (verbose && result.trades.length) {
    console.log('');
    console.log(d('  Time             Mkt   Crypto Dir      Spike%   Entry   Outcome       PnL    Balance'));
    console.log(d('  ' + '─'.repeat(87)));
    for (const t of result.trades) {
      const timeStr  = new Date(t.ts).toISOString().slice(0, 16).replace('T', ' ');
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
  console.log('\n' + b('═══ BEST UNIFIED PAIRS (5-MIN × 15-MIN, one shared balance) ══════════════════════════════'));
  console.log(d(
    '5m    5m-params              15m    15m-params             Trades(5m+15m)  WinRate        PnL     PnL%       →7d      →30d    Duration'
  ));
  console.log(d('─'.repeat(138)));

  for (const p of pairs) {
    const wr     = p.total > 0 ? (p.wins / p.total * 100).toFixed(1) + '%' : '—';
    const pnlRaw = p.pnl >= 0 ? `+$${p.pnl.toFixed(2)}` : `-$${Math.abs(p.pnl).toFixed(2)}`;
    const pnlStr = p.pnl >= 0 ? g(pnlRaw.padStart(12)) : r(pnlRaw.padStart(12));
    const tradesStr = `${p.total}(${p.trades5m}+${p.trades15m})`;
    const durStr = d('  ' + durFmt(p.durationDays));
    process.stdout.write(
      `C${p.b5.period}`.padEnd(6) +
      `${p.b5.th.toFixed(2)}% ${p.b5.mn}¢–${p.b5.mx}¢`.padEnd(22) +
      `C${p.b15.period}`.padEnd(7) +
      `${p.b15.th.toFixed(2)}% ${p.b15.mn}¢–${p.b15.mx}¢`.padEnd(22) +
      tradesStr.padStart(14) + '  ' +
      wr.padStart(8) + '  ' +
      pnlStr + '  ' + pnlPctStr(p.pnl) +
      projStr(p.pnl, p.durationDays, 7,  9) + ' ' +
      projStr(p.pnl, p.durationDays, 30, 9) + durStr + '\n'
    );
  }
  console.log('');
}

// ── Autoscan section printer ──────────────────────────────────────────────────

function printAutoscanSection(bests, title) {
  if (!bests.length) return;
  const sep = '═'.repeat(Math.max(4, 85 - title.length));
  console.log('\n' + b(`═══ ${title} ${sep}`));
  console.log(d('Period  MinPrice  MaxPrice  MinSpike  Trades  WinRate        PnL     PnL%       →7d      →30d    Duration'));
  console.log(d('─'.repeat(109)));
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
      wr.padStart(8) + '  ' +
      pnlStr + '  ' + pnlPctStr(best.pnl) +
      projStr(best.pnl, dur, 7, 9) + ' ' +
      projStr(best.pnl, dur, 30, 9) + durStr + '\n'
    );
  }
}

// ── Autoscan ──────────────────────────────────────────────────────────────────

function runAutoscan() {
  // Ranges (all in cents for integer stepping, divide later)
  const mnRange = { from: 5,  to: 25,  step: 1  };    // min price ¢
  const mxRange = { from: 65, to: 97,  step: 1  };    // max price ¢
  const thRange = { from: 20, to: 60,  step: 1  };    // spike * 100 (0.20%–0.60%)

  const combos =
    (mnRange.to - mnRange.from) / mnRange.step + 1 |0 |
    0; // just for display
  const totalCombos =
    ((mnRange.to - mnRange.from) / mnRange.step + 1) *
    ((mxRange.to - mxRange.from) / mxRange.step + 1) *
    ((thRange.to - thRange.from) / thRange.step + 1);

  console.log(b('\n⚡ T1000 Autoscan'));
  console.log(d(
    `  Balance    : $${startBal}   Risk: ${(riskPct*100).toFixed(0)}%\n` +
    `  Min price  : ${mnRange.from}¢ → ${mnRange.to}¢  (+${mnRange.step}¢)\n` +
    `  Max price  : ${mxRange.from}¢ → ${mxRange.to}¢  (+${mxRange.step}¢)\n` +
    `  Min spike  : ${(thRange.from/100).toFixed(2)}% → ${(thRange.to/100).toFixed(2)}%  (+0.01%)\n` +
    `  Combos/period: ${totalCombos.toLocaleString()}   Showing top ${topN}\n`
  ));

  const bestPerPeriod = [];

  for (const period of PERIODS) {
    const signals = preloadSignals(period);
    if (!signals || signals.length === 0) {
      console.log($(`C${period}: no data — skipping`));
      bestPerPeriod.push(null);
      continue;
    }

    process.stdout.write(`Scanning C${period}...`);

    const results = [];

    for (let mnC = mnRange.from; mnC <= mnRange.to; mnC += mnRange.step) {
      const mn = mnC / 100;
      for (let mxC = mxRange.from; mxC <= mxRange.to; mxC += mxRange.step) {
        if (mxC <= mnC) continue;
        const mx = mxC / 100;
        for (let thI = thRange.from; thI <= thRange.to; thI += thRange.step) {
          const th = thI / 100;
          const res = fastSim(signals, th, mn, mx);
          if (res.total < 3) continue; // not enough data
          results.push({ mn: mnC, mx: mxC, th, ...res });
        }
      }
    }

    results.sort((a, b) => b.pnl - a.pnl || b.wins / b.total - a.wins / a.total);

    // Deduplicate: keep only first entry per unique PnL value
    const seen = new Set();
    const deduped = results.filter(r => {
      const key = r.pnl.toFixed(2);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const top = deduped.slice(0, topN);
    process.stdout.write(` ${results.length.toLocaleString()} valid combos\n`);

    if (!top.length) {
      console.log($(`  No valid combinations found (need ≥3 trades)`));
      bestPerPeriod.push(null);
      continue;
    }

    console.log(b(c(`\n  C${period} — top ${top.length} by PnL`)));
    console.log(d('  Rank   MinP   MaxP   Spike   Trades  WinRate        PnL     PnL%'));
    console.log(d('  ' + '─'.repeat(66)));

    top.forEach((res, i) => {
      const wr     = (res.wins / res.total * 100).toFixed(1) + '%';
      const pnlRaw = res.pnl >= 0 ? `+$${res.pnl.toFixed(2)}` : `-$${Math.abs(res.pnl).toFixed(2)}`;
      const pnlStr = res.pnl >= 0 ? g(pnlRaw.padStart(12)) : r(pnlRaw.padStart(12));
      const rank   = i === 0 ? A.bold + A.yellow + ' #1 ' + A.reset : `  #${i+1}`;
      process.stdout.write(
        `  ${rank}  ` +
        `${res.mn}¢`.padStart(4) + '  ' +
        `${res.mx}¢`.padStart(4) + '  ' +
        `${res.th.toFixed(2)}%`.padStart(6) + '  ' +
        String(res.total).padStart(7) + '  ' +
        wr.padStart(8) + '  ' +
        pnlStr + '  ' + pnlPctStr(res.pnl) + '\n'
      );
    });

    bestPerPeriod.push({ period, ...top[0] });
  }

  // Final summary of best per period — split into 5-min and 15-min
  const best5m  = bestPerPeriod.filter(b => b && PERIODS_5M.includes(b.period));
  const best15m = bestPerPeriod.filter(b => b && PERIODS_15M.includes(b.period));
  printAutoscanSection(best5m,  'BEST PARAMS — 5-MIN MARKETS (C50–C85)');
  printAutoscanSection(best15m, 'BEST PARAMS — 15-MIN MARKETS (C150–C255)');

  // ── Nested pairs: each 5-min best × each 15-min best on one shared balance ──
  if (best5m.length && best15m.length) {
    console.log(b('\n  Building unified pairs (pre-loading signals)...'));

    // Pre-load signals once per period (reused across all pair combos)
    const sigCache = {};
    for (const b of [...best5m, ...best15m]) {
      if (!sigCache[b.period]) sigCache[b.period] = loadSignalsForUnified(b.period);
    }

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
    printUnifiedPairs(pairResults);
  }
  console.log('');
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(b('\n⚡ T1000 CSV Simulator — Usage\n'));
  console.log('  node simulate_t1000.js [options]\n');
  console.log(b('Options:'));
  console.log([
    ['  -th <pct>  ', 'Min |spike%| threshold              ', '(default: 0.24)'],
    ['  -bl <usd>  ', 'Starting balance                    ', '(default: 1000)'],
    ['  -mn <¢>    ', 'Min CLOB entry price (cents)         ', '(default: 0)'],
    ['  -mx <¢>    ', 'Max CLOB entry price (cents)         ', '(default: 90)'],
    ['  -rk <pct>  ', '% of balance risked per trade        ', '(default: 5)'],
    ['  -vb        ', 'Verbose: show full trade history     ', ''],
    ['  -as        ', 'Autoscan: sweep all param combos     ', ''],
    ['  -tp <n>    ', 'Top N results shown in autoscan      ', '(default: 5)'],
  ].map(([flag, desc, def]) => c(flag) + d(desc) + $(def)).join('\n'));

  console.log(b('\nExamples:'));
  console.log([
    ['node simulate_t1000.js',                        'Run with defaults (0.24% threshold, $1000, 0–90¢)'],
    ['node simulate_t1000.js -th 0.30 -mx 80',        'Custom threshold + max price'],
    ['node simulate_t1000.js -th 0.40 -mn 10 -mx 85', 'With min price filter'],
    ['node simulate_t1000.js -th 0.30 -vb',           'Verbose: show every trade'],
    ['node simulate_t1000.js -bl 500 -rk 3',          'Start with $500, risk 3% per trade'],
    ['node simulate_t1000.js -as',                    'Autoscan: find best params per period'],
    ['node simulate_t1000.js -as -tp 3',              'Autoscan, show top 3 per period'],
    ['node simulate_t1000.js -as -bl 500 -rk 3',      'Autoscan with custom balance/risk'],
  ].map(([cmd, desc]) => '  ' + A.cyan + cmd.padEnd(46) + A.reset + d(desc)).join('\n'));

  console.log(b('\nAutoscan sweep ranges:'));
  console.log(d('  Min price : 5¢ → 25¢   (+1¢)'));
  console.log(d('  Max price : 65¢ → 97¢  (+1¢)'));
  console.log(d('  Min spike : 0.20% → 0.60%  (+0.01%)\n'));
}

// ── Main ──────────────────────────────────────────────────────────────────────

const noArgs = argv.length === 0;
const helpFlag = flag('-h') || flag('--help');

if (noArgs || helpFlag) {
  printHelp();
  process.exit(0);
}

if (autoscan) {
  runAutoscan();
} else {
  console.log(b('\n⚡ T1000 CSV Simulator'));
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
        console.log(`C${res.period}`.padEnd(6) + `${res.total} trades`.padEnd(12) + `W:${res.wins} L:${res.losses}`.padEnd(14) + `WR:${wr}`.padEnd(12) + pnlStr + '  ' + pnlPctStr(res.pnl));
      }
    }
  }

  printSummary(results5m,  '5-MIN MARKETS (C50–C85)');
  printSummary(results15m, '15-MIN MARKETS (C150–C255)');

  const unified = simulateUnified();
  printUnified(unified);
}
