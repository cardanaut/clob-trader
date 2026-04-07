#!/usr/bin/env node
'use strict';

/**
 * Fade Backtest — 15-Minute Markets, 3-Min Candles
 *
 * Strategy: when a 3-min candle spikes >= threshold%, bet the OPPOSITE
 * direction (NO on UP spike, YES on DOWN spike) — price expected to
 * revert back past the T+0 open before the 15-min market resolves.
 *
 * Sweeps thresholds 0.30% → 1.50% in 0.10% steps.
 * Direction: reversion | Platform: polymarket
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const backtest    = require('../src/spike/backtest');
const spikeConfig = require('../src/spike/config');

const CRYPTOS = [
  { symbol: 'BTC', pair: 'BTCUSDT' },
  { symbol: 'ETH', pair: 'ETHUSDT' },
  { symbol: 'SOL', pair: 'SOLUSDT' },
  { symbol: 'XRP', pair: 'XRPUSDT' },
];

// Use T369-3MIN-056 as the candle/cycle mechanics template,
// then override its threshold per sweep iteration.
const TEMPLATE_STRATEGY = 'T369-3MIN-056';

// Thresholds to sweep (%)
const THRESHOLDS = [0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.30, 1.40, 1.50];

const MAX_CANDLES = 10000; // ~21 days of 3-min candles (cached)

function tag(ev) {
  if (ev > 15) return '✅✅';
  if (ev > 8)  return '✅';
  if (ev > 0)  return '⚠️';
  return '❌';
}

async function main() {
  console.log('\n' + '═'.repeat(78));
  console.log('  FADE — 15-MIN MARKET SWEEP — 3-Min Candles × All Cryptos');
  console.log('  Direction: REVERSION (bet against the spike, expect snap-back)');
  console.log('  Platform: Polymarket (resolves vs T+0 open at cycle end)');
  console.log('═'.repeat(78) + '\n');

  const tmpl = spikeConfig.STRATEGIES[TEMPLATE_STRATEGY];
  const rows = [];

  for (const threshold of THRESHOLDS) {
    // Temporarily override threshold on the template strategy
    tmpl.minThreshold = threshold;
    tmpl.maxThreshold = 99; // no upper cap — catch all spikes >= threshold

    for (const { symbol: crypto, pair } of CRYPTOS) {
      try {
        const r = await backtest.runBacktest(
          MAX_CANDLES, pair,
          threshold, 99,
          TEMPLATE_STRATEGY, true,
          'reversion', 'polymarket'
        );

        const sigPerDay = r.period.days > 0 ? (r.signalsDetected / r.period.days).toFixed(1) : '0';

        rows.push({
          threshold,
          crypto,
          signals:       r.signalsDetected,
          wins:          r.wins,
          losses:        r.losses,
          winRate:       r.winRate,
          ev:            r.ev,
          revenuePerDay: r.revenuePerDay,
          days:          r.period.days,
          byMinute:      r.byMinute,
          sigPerDay,
        });

        const t = tag(r.ev);
        console.log(
          `  ${threshold.toFixed(2)}%  ${crypto.padEnd(4)}` +
          `  sig/day=${sigPerDay.padStart(5)}` +
          `  WR=${r.winRate.toFixed(1).padStart(5)}%` +
          `  EV=${r.ev.toFixed(1).padStart(6)}%` +
          `  $${r.revenuePerDay.toFixed(2).padStart(7)}/day  ${t}`
        );
      } catch (err) {
        console.error(`  ERROR ${threshold.toFixed(2)}% ${crypto}: ${err.message}`);
      }
    }
    console.log('');
  }

  // ── Summary: aggregated per threshold ──────────────────────────────────────
  console.log('\n' + '═'.repeat(78));
  console.log('  SUMMARY — Aggregated Across All 4 Cryptos');
  console.log('─'.repeat(78));
  console.log('  Thresh  │ Sig/day │  Wins │ Loss │  WinRate │      EV  │  Rev/Day');
  console.log('  ────────┼─────────┼───────┼──────┼──────────┼──────────┼─────────');

  for (const threshold of THRESHOLDS) {
    const stratRows = rows.filter(r => r.threshold === threshold);
    if (stratRows.length === 0) continue;

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
      `  ${threshold.toFixed(2)}%    │` +
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
      .filter(r => r.crypto === crypto && r.signals >= 20)
      .sort((a, b) => b.ev - a.ev)[0];
    if (!best) { console.log(`  ${crypto.padEnd(4)}  →  insufficient data`); continue; }
    console.log(
      `  ${crypto.padEnd(4)}  →  ${best.threshold.toFixed(2)}%` +
      `  WR=${best.winRate.toFixed(1)}%` +
      `  EV=${best.ev.toFixed(1)}%` +
      `  $${best.revenuePerDay.toFixed(2)}/day` +
      `  (${best.signals} signals / ${best.days.toFixed(0)} days)  ${tag(best.ev)}`
    );
  }

  // ── T+N breakdown for best overall threshold ────────────────────────────────
  const byThreshold = {};
  for (const r of rows) {
    if (!byThreshold[r.threshold]) byThreshold[r.threshold] = { wins: 0, losses: 0, revenuePerDay: 0 };
    byThreshold[r.threshold].wins        += r.wins;
    byThreshold[r.threshold].losses      += r.losses;
    byThreshold[r.threshold].revenuePerDay += r.revenuePerDay;
  }
  const bestThreshold = Object.entries(byThreshold)
    .map(([t, d]) => {
      const total = d.wins + d.losses;
      const ev = total > 0 ? ((d.wins / total) - (d.losses / total)) * 100 : -99;
      return { threshold: parseFloat(t), ev, ...d };
    })
    .filter(d => (d.wins + d.losses) >= 20)
    .sort((a, b) => b.ev - a.ev)[0];

  if (bestThreshold) {
    console.log('\n' + '─'.repeat(78));
    console.log(`  T+N BREAKDOWN — Best Overall: ${bestThreshold.threshold.toFixed(2)}%  (EV ${bestThreshold.ev.toFixed(1)}%)`);
    console.log('─'.repeat(78));
    console.log('  Candle │ Signals │  Wins │ Loss │  WinRate │      EV');
    console.log('  ───────┼─────────┼───────┼──────┼──────────┼─────────');

    const bestRows = rows.filter(r => r.threshold === bestThreshold.threshold);
    for (let min = 0; min <= 3; min++) {
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
