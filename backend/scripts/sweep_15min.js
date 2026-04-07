#!/usr/bin/env node
'use strict';

/**
 * 15-Minute Market Backtest Sweep
 * Tests all T369-3MIN threshold variants across all 4 cryptos.
 * Platform: polymarket (cycle-end resolution vs T+0 open)
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const backtest = require('../src/spike/backtest');
const config   = require('../src/spike/config');

const CRYPTOS = [
  { symbol: 'BTC', pair: 'BTCUSDT' },
  { symbol: 'ETH', pair: 'ETHUSDT' },
  { symbol: 'SOL', pair: 'SOLUSDT' },
  { symbol: 'XRP', pair: 'XRPUSDT' },
];

const STRATEGIES = [
  'T369-3MIN-056',
  'T369-3MIN-057',
  'T369-3MIN-058',
  'T369-3MIN-059',
  'T369-3MIN-060',
  'T369-3MIN-061',
  'T369-3MIN-062',
  'T369-3MIN-063',
];

const MAX_CANDLES = 10000; // ~30 days of 3-min candles

function tag(ev) {
  if (ev > 15) return '✅✅';
  if (ev > 8)  return '✅';
  if (ev > 0)  return '⚠️';
  return '❌';
}

async function main() {
  console.log('\n' + '═'.repeat(78));
  console.log('  T369 15-MINUTE MARKET SWEEP — 3-Min Candles × All Cryptos');
  console.log('  Platform: Polymarket (resolves vs T+0 open at cycle end)');
  console.log('  Direction: Momentum (follow spike)');
  console.log('═'.repeat(78) + '\n');

  console.log('  Fetching 3-min candles (first run downloads from Binance, then cached)...\n');

  const rows = [];

  for (const strategy of STRATEGIES) {
    const stratCfg = config.STRATEGIES[strategy];
    const threshold = stratCfg.minThreshold;

    for (const { symbol: crypto, pair } of CRYPTOS) {
      try {
        const r = await backtest.runBacktest(
          MAX_CANDLES, pair,
          stratCfg.minThreshold, stratCfg.maxThreshold,
          strategy, true, 'momentum', 'polymarket'
        );

        const sigPerDay = r.period.days > 0 ? (r.signalsDetected / r.period.days).toFixed(1) : '0';

        rows.push({
          strategy,
          threshold,
          crypto,
          signals:      r.signalsDetected,
          wins:         r.wins,
          losses:       r.losses,
          winRate:      r.winRate,
          ev:           r.ev,
          revenuePerDay: r.revenuePerDay,
          days:         r.period.days,
          byMinute:     r.byMinute,
          sigPerDay,
        });

        const t = tag(r.ev);
        console.log(
          `  ${strategy}  ${crypto.padEnd(4)}` +
          `  sig/day=${sigPerDay.padStart(5)}` +
          `  WR=${r.winRate.toFixed(1).padStart(5)}%` +
          `  EV=${r.ev.toFixed(1).padStart(6)}%` +
          `  $${r.revenuePerDay.toFixed(2).padStart(7)}/day  ${t}`
        );
      } catch (err) {
        console.error(`  ERROR ${strategy} ${crypto}: ${err.message}`);
      }
    }
    console.log('');
  }

  // ── Summary: aggregated per threshold ──────────────────────────────────────
  console.log('\n' + '═'.repeat(78));
  console.log('  SUMMARY — Aggregated Across All 4 Cryptos');
  console.log('  (Revenue = $1 bets, 0.81 max entry assumption)');
  console.log('─'.repeat(78));
  console.log('  Thresh  │ Sig/day │  Wins │ Loss │  WinRate │      EV  │  Rev/Day');
  console.log('  ────────┼─────────┼───────┼──────┼──────────┼──────────┼─────────');

  for (const strategy of STRATEGIES) {
    const stratRows = rows.filter(r => r.strategy === strategy);
    if (stratRows.length === 0) continue;

    const cfg = config.STRATEGIES[strategy];
    const totWins = stratRows.reduce((s, r) => s + r.wins, 0);
    const totLoss = stratRows.reduce((s, r) => s + r.losses, 0);
    const totRev  = stratRows.reduce((s, r) => s + r.revenuePerDay, 0);
    const totSig  = stratRows.reduce((s, r) => s + r.signals, 0);
    const totDays = Math.max(...stratRows.map(r => r.days));
    const sigPerDay = totDays > 0 ? (totSig / totDays).toFixed(1) : '0';
    const wr   = (totWins + totLoss) > 0 ? (totWins / (totWins + totLoss) * 100) : 0;
    const ev   = (totWins + totLoss) > 0 ? ((totWins / (totWins + totLoss)) - (totLoss / (totWins + totLoss))) * 100 : 0;
    const t    = tag(ev);

    console.log(
      `  ${cfg.minThreshold.toFixed(2)}%    │` +
      `  ${sigPerDay.padStart(6)} │` +
      ` ${String(totWins).padStart(5)} │` +
      ` ${String(totLoss).padStart(4)} │` +
      ` ${wr.toFixed(1).padStart(7)}% │` +
      ` ${ev.toFixed(1).padStart(7)}% │` +
      ` $${totRev.toFixed(2).padStart(7)}  ${t}`
    );
  }

  // ── Best threshold per crypto ───────────────────────────────────────────────
  console.log('\n' + '─'.repeat(78));
  console.log('  BEST THRESHOLD PER CRYPTO (by EV)');
  console.log('─'.repeat(78));
  for (const { symbol: crypto } of CRYPTOS) {
    const best = rows
      .filter(r => r.crypto === crypto)
      .sort((a, b) => b.ev - a.ev)[0];
    if (!best) continue;
    console.log(
      `  ${crypto.padEnd(4)}  →  ${best.strategy}` +
      `  WR=${best.winRate.toFixed(1)}%` +
      `  EV=${best.ev.toFixed(1)}%` +
      `  $${best.revenuePerDay.toFixed(2)}/day` +
      `  (${best.signals} signals / ${best.days.toFixed(0)} days)  ${tag(best.ev)}`
    );
  }

  // ── Per-minute breakdown for best overall strategy ─────────────────────────
  console.log('\n' + '─'.repeat(78));

  // Find best strategy overall by total EV across all cryptos
  const byStrategy = {};
  for (const r of rows) {
    if (!byStrategy[r.strategy]) byStrategy[r.strategy] = { wins: 0, losses: 0, revenuePerDay: 0 };
    byStrategy[r.strategy].wins        += r.wins;
    byStrategy[r.strategy].losses      += r.losses;
    byStrategy[r.strategy].revenuePerDay += r.revenuePerDay;
  }
  const bestStrategy = Object.entries(byStrategy)
    .map(([s, d]) => {
      const total = d.wins + d.losses;
      const ev = total > 0 ? ((d.wins / total) - (d.losses / total)) * 100 : -99;
      return { strategy: s, ev, ...d };
    })
    .sort((a, b) => b.ev - a.ev)[0];

  if (bestStrategy) {
    console.log(`  T+N BREAKDOWN — Best Overall: ${bestStrategy.strategy}  (EV ${bestStrategy.ev.toFixed(1)}%)`);
    console.log('─'.repeat(78));
    console.log('  Candle │ Signals │  Wins │ Loss │  WinRate │      EV');
    console.log('  ───────┼─────────┼───────┼──────┼──────────┼─────────');

    const bestRows = rows.filter(r => r.strategy === bestStrategy.strategy);

    for (let min = 0; min <= 4; min++) {
      let totSig = 0, totW = 0, totL = 0;
      for (const r of bestRows) {
        const bm = r.byMinute[min];
        if (bm) { totSig += bm.signals; totW += bm.wins; totL += bm.losses; }
      }
      const wr = totSig > 0 ? (totW / totSig * 100) : 0;
      const ev = totSig > 0 ? ((totW / totSig) - (totL / totSig)) * 100 : 0;
      const t  = tag(ev);
      console.log(
        `  T+${min}    │` +
        `  ${String(totSig).padStart(6)} │` +
        ` ${String(totW).padStart(5)} │` +
        ` ${String(totL).padStart(4)} │` +
        ` ${wr.toFixed(1).padStart(7)}% │` +
        ` ${ev.toFixed(1).padStart(7)}%  ${t}`
      );
    }
  }

  console.log('\n' + '═'.repeat(78) + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });
