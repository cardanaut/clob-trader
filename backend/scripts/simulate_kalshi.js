#!/usr/bin/env node
'use strict';

/**
 * Kalshi T1000 Simulator
 *
 * Backtests the LIVE_KALSHI strategy using:
 *   - Binance 1-min candle data (via existing t1000_candles_C*.csv) for spike detection
 *   - Polymarket resolved outcomes for trade resolution (identical binary underlying)
 *   - Polymarket 15-min CLOB ask prices as entry-price proxy
 *     ⚠  Once Kalshi credentials are configured and kalshi_price_ohlc fills up,
 *        replace CSV yes_ask/no_ask with real Kalshi prices here.
 *
 * Usage:
 *   node simulate_kalshi.js [options]
 *
 * Options:
 *   -th <pct>   Global spike threshold %                (default: 0.22)
 *   -bl <usd>   Starting balance                        (default: 1000)
 *   -mn <¢>     Min entry price                         (default: 5)
 *   -mx <¢>     Max entry price                         (default: 88)
 *   -cp <usd>   Per-trade cap                           (default: 500)
 *   -rk <pct>   % of balance risked per trade           (default: 5)
 *   -cr <list>  Comma-separated cryptos e.g. BTC,ETH    (default: all)
 *   -vb         Verbose trade log per period
 *   -as         Autoscan — sweep thresholds, show best period per crypto
 *   -nf         No-fetch: pm_outcomes cache only (no Polymarket API calls)
 */

const fs   = require('fs');
const path = require('path');
const pm   = require('./pm-outcomes');

// ── CLI ────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i+1] ? argv[i+1] : d; };
const flag = n => argv.includes(n);

const globalTh  = parseFloat(arg('-th', '0.22'));
const startBal  = parseFloat(arg('-bl', '1000'));
const minCents  = parseFloat(arg('-mn', '5'));
const maxCents  = parseFloat(arg('-mx', '93'));
const cap       = parseFloat(arg('-cp', '500'));
const riskPct   = parseFloat(arg('-rk', '5')) / 100;
const MIN_TRADES = 10;   // minimum resolved trades required for a valid score
const verbose   = flag('-vb');
const autoscan  = flag('-as');
const noFetch   = flag('-nf');

const ALL_CRYPTOS = ['BTC', 'ETH', 'SOL', 'XRP'];
const crArg   = arg('-cr', null);
const CRYPTOS = crArg ? crArg.split(',').map(s => s.trim().toUpperCase()).filter(c => ALL_CRYPTOS.includes(c)) : ALL_CRYPTOS;

const PERIODS = [150, 165, 180, 195, 210, 225, 240, 255];
const LOG_DIR = path.join(__dirname, '../logs');

const minPrice = minCents / 100;
const maxPrice = maxCents / 100;

// ── Timezone ───────────────────────────────────────────────────────────────────
const TZ_OFFSET_MS = (parseInt(process.env.DISPLAY_UTC_OFFSET ?? '3', 10)) * 3600000;
function localTime(ms) {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

// ── ANSI ──────────────────────────────────────────────────────────────────────

const A = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
            green:'\x1b[32m', red:'\x1b[31m', cyan:'\x1b[36m',
            yellow:'\x1b[33m', grey:'\x1b[90m' };
const g = s => A.green  + s + A.reset;
const r = s => A.red    + s + A.reset;
const b = s => A.bold   + s + A.reset;
const d = s => A.dim    + s + A.reset;
const c = s => A.cyan   + s + A.reset;
const y = s => A.yellow + s + A.reset;
const $ = s => A.grey   + s + A.reset;

// ── CSV reader (same format as simulate_t1000_v2.js) ──────────────────────────

const CSV_COLS = ['timestamp','crypto','cycle_start','candle_size',
                  'open','high','low','close','spike_pct',
                  'yes_ask','no_ask','yes_bid','no_bid'];

function readCsv(period) {
  const fp = path.join(LOG_DIR, `t1000_candles_C${period}.csv`);
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean);
  if (!lines.length) return [];
  const hasHdr = lines[0].startsWith('timestamp');
  const hdrs   = hasHdr ? lines[0].split(',') : CSV_COLS;
  const data   = hasHdr ? lines.slice(1) : lines;
  const cents  = f => (f && f.trim() ? parseFloat(f) / 100 : null);
  return data.map(l => {
    const v = l.split(',');
    const row = Object.fromEntries(hdrs.map((h, i) => [h.trim(), v[i]]));
    return {
      cycleStart : new Date(row.cycle_start),
      crypto     : row.crypto?.trim(),
      open       : parseFloat(row.open),
      spikePct   : parseFloat(row.spike_pct),
      yesAsk     : cents(row.yes_ask),
      noAsk      : cents(row.no_ask),
    };
  }).filter(row => row.crypto && CRYPTOS.includes(row.crypto)
                && !isNaN(row.spikePct) && !isNaN(row.cycleStart));
}

function loadSignals(period) {
  return readCsv(period).map(row => ({
    ts           : row.cycleStart.getTime() + period * 1000,
    period,
    cycleStartMs : row.cycleStart.getTime(),
    durationSecs : 900,
    crypto       : row.crypto,
    absSpike     : Math.abs(row.spikePct),
    direction    : row.spikePct >= 0 ? 'UP' : 'DOWN',
    yesAsk       : row.yesAsk,
    noAsk        : row.noAsk,
    open         : row.open,
  }));
}

// ── Resolution ─────────────────────────────────────────────────────────────────

function outcome(sig) { return pm.getOutcome(sig.crypto, sig.cycleStartMs, sig.durationSecs); }
function isWin(dir, out) {
  if (out == null || out === undefined) return null;
  return (dir === 'UP' && out === 'UP') || (dir === 'DOWN' && out === 'DOWN');
}

// ── Scoring (pessimistic WR: wins / (total + 3)) ─────────────────────────────
// Adding 3 pseudo-losses penalises small samples more than large ones:
//   32W  0L → 32/35  = 0.914   vs   112W 4L → 112/119 = 0.941 → larger wins

function score(trades) {
  const resolved = trades.filter(t => t.outcome === 'WIN' || t.outcome === 'LOSS');
  const n    = resolved.length;
  const wins = resolved.filter(t => t.outcome === 'WIN').length;
  const sc   = n >= MIN_TRADES ? wins / (n + 3) : -Infinity;
  return { score: sc, n };
}

// ── Single period simulation ───────────────────────────────────────────────────

function simPeriod(period, th, mn, mx, capUsd) {
  const signals = loadSignals(period);
  if (!signals.length) return null;

  let balance = startBal;
  const trades = [];
  let noPm = 0;

  for (const sig of signals) {
    if (balance <= 0) break;
    if (sig.absSpike < th) continue;
    const entry = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
    if (entry == null || entry < mn || entry > mx) continue;

    const win = isWin(sig.direction, outcome(sig));
    if (win === null) { noPm++; continue; }

    const pos = Math.min(Math.max(1, balance * riskPct), capUsd);
    const pnl = win ? pos * (1 - entry) / entry : -pos;
    balance   = Math.max(0, balance + pnl);
    trades.push({ ts: sig.ts, time: localTime(sig.cycleStartMs),
                  crypto: sig.crypto, direction: sig.direction,
                  spikePct: sig.direction==='UP' ? sig.absSpike : -sig.absSpike,
                  entry, outcome: win ? 'WIN' : 'LOSS', pnl, balance });
  }

  const wins   = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  const sc     = score(trades);
  const times  = signals.map(s => s.ts);
  const durDays = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 86400000 : 0;
  return { period, trades, wins, losses, total: wins+losses, noPm,
           pnl: balance - startBal, finalBalance: balance, durDays, ...sc };
}

// ── Fast sweep (no trade log — for autoscan) ───────────────────────────────────

function fastSweep(signals, th, mn, mx) {
  let balance = startBal, wins = 0, losses = 0, noPm = 0;
  for (const sig of signals) {
    if (balance <= 0) break;
    if (sig.absSpike < th) continue;
    const entry = sig.direction === 'UP' ? sig.yesAsk : sig.noAsk;
    if (entry == null || entry < mn || entry > mx) continue;
    const win = isWin(sig.direction, outcome(sig));
    if (win === null) { noPm++; continue; }
    const pos  = Math.min(Math.max(1, balance * riskPct), cap);
    const pnl  = win ? pos * (1 - entry) / entry : -pos;
    balance    = Math.max(0, balance + pnl);
    if (win) wins++; else losses++;
  }
  // Pessimistic WR score: wins / (total + 3 pseudo-losses).
  // Penalises small samples more than large ones:
  //   32W 0L → 32/35 = 0.914   vs   112W 4L → 112/119 = 0.941 → larger wins
  const total = wins + losses;
  const sc    = total >= MIN_TRADES ? wins / (total + 3) : -Infinity;
  return { wins, losses, total, noPm, pnl: balance-startBal, score: sc };
}

// ── Verbose print ──────────────────────────────────────────────────────────────

function printVerbose(res) {
  const { period, trades } = res;
  console.log('\n' + b(c(`══ C${period} ─ Kalshi 15m `)) +
    d(`(${res.total} resolved, ${res.noPm} no-PM, ${trades.length} total)`));
  console.log(d('Time             Crypto  Dir      Spike%   Entry   Result      PnL      Balance'));
  console.log(d('─'.repeat(82)));
  for (const t of trades) {
    const dir    = t.direction === 'UP' ? g('▲ UP') : r('▼ DN');
    const sp     = `${t.spikePct>=0?'+':''}${t.spikePct.toFixed(3)}%`;
    const ent    = `${(t.entry*100).toFixed(0)}¢`;
    const pnlStr = t.outcome === 'WIN'  ? g(`+$${t.pnl.toFixed(2)}`.padStart(9))
                 : t.outcome === 'LOSS' ? r(`-$${Math.abs(t.pnl).toFixed(2)}`.padStart(9)) : $('—'.padStart(9));
    const out    = t.outcome === 'WIN' ? g(' WIN') : r('LOSS');
    const bal    = `$${t.balance.toFixed(2)}`;
    console.log(`${t.time.padEnd(17)} ${t.crypto.padEnd(7)} ${dir}  ${sp.padStart(8)}  ${ent.padStart(4)}  ${out} ${pnlStr}  ${bal}`);
  }
  const wr     = res.total > 0 ? (res.wins/res.total*100).toFixed(1)+'%' : '—';
  const pnlStr = res.pnl >= 0 ? g(`+$${res.pnl.toFixed(2)}`) : r(`-$${Math.abs(res.pnl).toFixed(2)}`);
  console.log(d(`  → W:${res.wins}  L:${res.losses}  WR:${wr}  PnL: ${pnlStr}  Final: $${res.finalBalance.toFixed(2)}`));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!noFetch) {
    // Collect all uncached requests across all 15m periods and fetch in one batch
    const requests = [];
    for (const period of PERIODS) {
      for (const sig of loadSignals(period)) {
        requests.push({ crypto: sig.crypto, cycleStartMs: sig.cycleStartMs, durationSecs: 900 });
      }
    }
    if (requests.length) await pm.fetchOutcomes(requests);
  }

  const dataStart = [];
  const dataEnd   = [];
  for (const p of PERIODS) {
    const rows = readCsv(p);
    if (rows.length) {
      dataStart.push(rows[0].cycleStart);
      dataEnd.push(rows[rows.length - 1].cycleStart);
    }
  }
  const first   = dataStart.length ? new Date(Math.min(...dataStart.map(d => d.getTime()))) : null;
  const last    = dataEnd.length   ? new Date(Math.max(...dataEnd.map(d => d.getTime())))   : null;
  const durDays = first && last ? (last - first) / 86400000 : 0;

  console.log('\n' + b(y('╔══ Kalshi T1000 Simulator ════════════════════════════════════════════════════╗')));
  console.log(b(y('║')) + '  15-min binary markets — BTC / ETH / SOL / XRP                             ' + b(y('║')));
  console.log(b(y('╚══════════════════════════════════════════════════════════════════════════════╝')));
  console.log($('  ⚠  Entry prices: Polymarket 15m CLOB proxy (real Kalshi prices once DB fills)'));
  if (first && last) {
    console.log($(`  Dataset: ${first.toISOString().slice(0,10)} → ${last.toISOString().slice(0,10)} (${durDays.toFixed(1)} days)`));
  }
  console.log($(`  Params: threshold ${globalTh}% | price ${minCents}–${maxCents}¢ | cap $${cap} | risk ${(riskPct*100).toFixed(0)}%\n`));

  if (autoscan) {
    const THRESHOLDS = [0.18, 0.20, 0.22, 0.24, 0.26, 0.29, 0.32, 0.35, 0.40, 0.44, 0.50];
    const MN_RANGE   = [5, 10, 15, 20].filter(v => v >= minCents);   // min price sweep (cents)
    const MX_RANGE   = [70, 75, 80, 85, 90, 95].filter(v => v <= maxCents); // max price sweep (cents)

    // ── Per-period scoring table (all cryptos combined) ───────────────────────
    const bestPerPeriod = [];
    for (const period of PERIODS) {
      const sigs = loadSignals(period); // all cryptos
      if (!sigs.length) { bestPerPeriod.push(null); continue; }
      let best = null;
      for (const mnC of MN_RANGE) {
        for (const mxC of MX_RANGE) {
          if (mxC <= mnC) continue;
          for (const th of THRESHOLDS) {
            const res = fastSweep(sigs, th, mnC / 100, mxC / 100);
            if (!best || res.score > best.score) {
              best = { period, th, mn: mnC, mx: mxC, ...res };
            }
          }
        }
      }
      bestPerPeriod.push(best ?? null);
    }

    const validPeriods = bestPerPeriod.filter(Boolean);
    validPeriods.sort((a, b) => {
      const sa = isFinite(a.score) ? a.score : -Infinity;
      const sb = isFinite(b.score) ? b.score : -Infinity;
      return sb - sa || b.pnl - a.pnl;
    });

    console.log(b('══ BEST PARAMS — 15-MIN MARKETS (C150–C255) ════════════════════════════════════'));
    console.log(d('  Scoring: pessimistic WR = wins/(total+3) — rewards large reliable samples\n'));
    console.log(d('  Period  MinP  MaxP  Spike   Trades NoPM  WinRate       PnL    PnL%    →30d   Duration'));
    console.log(d('  ' + '─'.repeat(92)));

    for (let i = 0; i < validPeriods.length; i++) {
      const p      = validPeriods[i];
      const wr     = p.total > 0 ? (p.wins / p.total * 100).toFixed(1) + '%' : '—';
      const pnlRaw = p.pnl >= 0 ? `+$${p.pnl.toFixed(2)}` : `-$${Math.abs(p.pnl).toFixed(2)}`;
      const pnlStr = p.pnl >= 0 ? g(pnlRaw.padStart(10)) : r(pnlRaw.padStart(10));
      const pnlPct = p.pnl / startBal * 100;
      const pctStr = (pnlPct >= 0 ? g : r)((pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(1) + '%');
      const dur    = durDays > 0 ? durDays : 1;
      const proj30 = p.pnl / dur * 30;
      const projStr = proj30 >= 0 ? g(`+$${proj30.toFixed(0)}`.padStart(7)) : r(`-$${Math.abs(proj30).toFixed(0)}`.padStart(7));
      const scStr  = isFinite(p.score) ? (p.score >= 0 ? g : r)(p.score.toFixed(3)) : $('—');
      const star   = i === 0 ? y(' ★') : '  ';
      process.stdout.write(
        `${star} C${String(p.period).padEnd(4)}  ${String(p.mn).padStart(3)}¢  ${String(p.mx).padStart(3)}¢  ` +
        `${p.th.toFixed(2)}%  ${String(p.total).padStart(6)}  ${String(p.noPm).padStart(4)}  ` +
        `${wr.padStart(7)}  ${pnlStr}  ${pctStr.padStart(6)}  ${projStr}  ${scStr}\n`
      );
    }

    // ── Best candidate summary ────────────────────────────────────────────────
    const top = validPeriods[0];
    // Write JSON summary so backfill_t1000.js can pick the right strategy for LIVE_KALSHI
    const jsonPath = path.join(LOG_DIR, 'autoscan_kalshi.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      updatedAt : new Date().toISOString(),
      best15m   : top ? { period: `C${top.period}`, th: top.th, mn: top.mn / 100, mx: top.mx / 100, score: top.score } : null,
    }, null, 2));
    console.log($(`  ✓ autoscan_kalshi.json written  (best 15m: C${top?.period ?? '?'})`));
    if (top) {
      const wr = top.total > 0 ? (top.wins / top.total * 100).toFixed(1) + '%' : '—';
      console.log('\n' + b(c(`  ★ BEST: C${top.period}`)) +
        `  spike ≥ ${top.th.toFixed(2)}%  entry ${top.mn}¢–${top.mx}¢  cap $${cap}\n` +
        d(`    Wins / Losses : `) + g(String(top.wins)) + d(' / ') + r(String(top.losses)) + d(`   WR: `) + b(wr) + '\n' +
        d(`    PnL           : `) + g(`+$${top.pnl.toFixed(2)}`) + '\n' +
        d(`    Score         : `) + g(isFinite(top.score) ? top.score.toFixed(3) : '—') + '\n'
      );
    }

    // ── Per-crypto breakdown at the best combined params ─────────────────────
    // (independent per-crypto sweep is misleading with thin data: each crypto
    //  only has ~7-8 trades at 0.24%, below MIN_TRADES=10, so it always falls
    //  back to the lowest threshold that clears the bar — not a meaningful signal)
    console.log(b('══ Per-crypto breakdown at best params ═════════════════════════════════════════'));
    if (top) {
      console.log(d(`  Period C${top.period}  threshold ${top.th.toFixed(2)}%  entry ${top.mn}¢–${top.mx}¢\n`));
      console.log(d('  Crypto   Trades  WinRate        PnL'));
      console.log(d('  ' + '─'.repeat(42)));
      for (const crypto of CRYPTOS) {
        const sigs = loadSignals(top.period).filter(s => s.crypto === crypto);
        if (!sigs.length) { console.log(`   ${crypto.padEnd(7)} ${$('no data')}`); continue; }
        const res = fastSweep(sigs, top.th, top.mn / 100, top.mx / 100);
        const wr     = res.total > 0 ? (res.wins / res.total * 100).toFixed(1) + '%' : '—';
        const pnlStr = res.pnl >= 0 ? g(`+$${res.pnl.toFixed(0)}`.padStart(8)) : r(`-$${Math.abs(res.pnl).toFixed(0)}`.padStart(8));
        const wStr   = res.wins > 0 ? g(String(res.wins)) : String(res.wins);
        const lStr   = res.losses > 0 ? r(String(res.losses)) : String(res.losses);
        process.stdout.write(
          `   ${crypto.padEnd(7)} ${String(res.total).padStart(4)}    ${wr.padStart(6)}  (${wStr}W ${lStr}L)  ${pnlStr}\n`
        );
      }
    } else {
      console.log(d('  No best period found — run with more data.'));
    }

    // ── Recommendation block for LIVE_KALSHI config ────────────────────────────
    console.log('\n' + b('══ LIVE_KALSHI recommended config ══════════════════════════════════════════════'));
    if (top) {
      console.log(`  strategy15m : "C${top.period}"`);
      console.log(`  threshold15m: ${top.th.toFixed(2)}  (global — applies to all cryptos)`);
      console.log(`  minPrice15m : ${top.mn / 100}  (${top.mn}¢)`);
      console.log(`  maxPrice15m : ${top.mx / 100}  (${top.mx}¢)`);
    } else {
      console.log(`  strategy15m : "C180"  (fallback — no data)`);
      console.log(`  threshold15m: ${globalTh}`);
    }

  } else {
    // ── Single-run: simulate all periods, print summary table ─────────────────
    const results = [];
    for (const period of PERIODS) {
      const res = simPeriod(period, globalTh, minPrice, maxPrice, cap);
      if (!res) { console.log(d(`  C${period}: no data`)); continue; }
      results.push(res);
      if (verbose) printVerbose(res);
    }

    if (!results.length) { console.log(r('  No data found. Run backfill_t1000.js first.')); return; }

    console.log(b('══ Results per period ══════════════════════════════════════════════════════════'));
    console.log(d('  Period   Score     WR        Trades   PnL       30d proj'));
    console.log(d('  ' + '─'.repeat(60)));

    // Sort by score descending (pessimistic WR — large reliable samples rank higher)
    results.sort((a, b) => {
      const sa = isFinite(a.score) ? a.score : -Infinity;
      const sb = isFinite(b.score) ? b.score : -Infinity;
      return sb - sa;
    });

    for (let i = 0; i < results.length; i++) {
      const res    = results[i];
      const wr     = res.total > 0 ? (res.wins/res.total*100).toFixed(1)+'%' : '—';
      const sc     = isFinite(res.score) ? (res.score >= 0 ? g : r)(res.score.toFixed(3)) : $('—');
      const pnl    = res.pnl >= 0 ? g(`+$${res.pnl.toFixed(2)}`.padStart(9)) : r(`-$${Math.abs(res.pnl).toFixed(2)}`.padStart(9));
      const proj   = res.durDays > 0
        ? (res.pnl / res.durDays * 30 >= 0
          ? g(`+$${(res.pnl / res.durDays * 30).toFixed(0)}`.padStart(9))
          : r(`-$${Math.abs(res.pnl / res.durDays * 30).toFixed(0)}`.padStart(9)))
        : $('—'.padStart(9));
      const star   = i === 0 ? y(' ★') : '  ';
      process.stdout.write(
        `${star} C${String(res.period).padEnd(5)} ${sc}  ${wr.padStart(6)}  ${String(res.total).padStart(5)}    ${pnl}  ${proj}\n`
      );
    }

    const top = results[0];
    if (top) {
      const wr = top.total > 0 ? (top.wins/top.total*100).toFixed(1)+'%' : '—';
      console.log('\n' + b(`  ★ Best: C${top.period}`) +
        `  WR ${wr}  ${top.total} trades  score ${top.score >= 0 ? g('+'+top.score.toFixed(3)) : r(top.score.toFixed(3))}`);
    }
  }

  console.log();
}

main().catch(err => { console.error(r('Error: ' + err.message)); process.exit(1); });
