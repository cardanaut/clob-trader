#!/usr/bin/env node
/**
 * T123-HL Strategy Tester
 * Compares T123-1MIN-HL (dual-threshold) against T123-1MIN (single-threshold)
 *
 * Usage:
 *   node test-hl-strategy.js [symbol] [maxCandles]
 *
 * Examples:
 *   node test-hl-strategy.js BTC
 *   node test-hl-strategy.js ETH 5000
 *   node test-hl-strategy.js BTC --clear-cache
 */

'use strict';

const { runBacktest } = require('./src/spike/backtest');
const config = require('./src/spike/config');
const logger = require('./src/utils/logger');

async function main() {
  const args = process.argv.slice(2);

  // Check for --clear-cache flag
  const clearCacheFlag = args.includes('--clear-cache');
  const filteredArgs = args.filter(arg => arg !== '--clear-cache');

  // Handle cache clearing
  if (clearCacheFlag) {
    console.log('\n🗑️  Clearing cache...');
    const fs = require('fs');
    const path = require('path');
    const cacheDir = path.join(__dirname, 'cache');

    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      for (const file of files) {
        fs.unlinkSync(path.join(cacheDir, file));
        console.log(`  ✅ Deleted: ${file}`);
      }
      console.log(`\n✅ Cleared ${files.length} cache file(s)\n`);
    } else {
      console.log('  ℹ️  Cache is already empty\n');
    }
  }

  // Parse arguments
  const cryptoSymbol = filteredArgs[0] || 'BTC';
  const maxCandles = parseInt(filteredArgs[1]) || 3000;

  // Convert crypto symbol to Binance pair
  const symbolMap = {
    'BTC': 'BTCUSDT',
    'ETH': 'ETHUSDT',
    'SOL': 'SOLUSDT',
    'XRP': 'XRPUSDT'
  };

  const symbol = symbolMap[cryptoSymbol.toUpperCase()] || 'BTCUSDT';

  console.log('\n' + '='.repeat(100));
  console.log('🔬 T123-HL STRATEGY TEST (Dual-Threshold: High-Low + Open-Close)');
  console.log('='.repeat(100));
  console.log(`Symbol: ${symbol}`);
  console.log(`Max Candles: ${maxCandles.toLocaleString()}`);
  console.log(`Time Range: ~${(maxCandles / 1440).toFixed(1)} days`);
  console.log(`Cache: ${clearCacheFlag ? '🗑️  Cleared' : '💾 Enabled'}\\n`);

  const startTime = Date.now();
  const useCache = !clearCacheFlag;

  // Test T123-1MIN (baseline)
  console.log('📊 Testing T123-1MIN (baseline - single threshold)...');
  const baseline = config.STRATEGIES['T123-1MIN'];
  const resultsBaseline = await runBacktest(
    maxCandles,
    symbol,
    baseline.minThreshold,
    baseline.maxThreshold,
    'T123-1MIN',
    useCache
  );

  // Test T123-1MIN-HL (dual-threshold)
  console.log('\n📊 Testing T123-1MIN-HL (dual-threshold: HL + OC)...');
  const hlStrategy = config.STRATEGIES['T123-1MIN-HL'];
  const resultsHL = await runBacktest(
    maxCandles,
    symbol,
    hlStrategy.hlThreshold, // Use HL threshold as minThreshold
    hlStrategy.maxThreshold,
    'T123-1MIN-HL',
    useCache
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // Display results
  console.log('\n' + '='.repeat(100));
  console.log('📊 RESULTS COMPARISON');
  console.log('='.repeat(100));
  console.log(`Time Elapsed: ${elapsed}s\n`);

  // Print table
  console.log('┌─────────────────────┬────────────────────────┬───────┬────────┬─────────┬───────────┬──────────────┐');
  console.log('│ Strategy            │ Thresholds             │ Wins  │ Losses │ Win Rate│ EV        │ Trades/Day   │');
  console.log('├─────────────────────┼────────────────────────┼───────┼────────┼─────────┼───────────┼──────────────┤');

  const strategies = {
    'T123-1MIN': resultsBaseline,
    'T123-1MIN-HL': resultsHL
  };

  Object.entries(strategies).forEach(([strategyId, result]) => {
    const strategy = config.STRATEGIES[strategyId];

    let thresholds;
    if (strategy.dualThreshold) {
      thresholds = `HL≥${strategy.hlThreshold}%, OC≥${strategy.ocThreshold}%`;
    } else {
      thresholds = `Single: ${strategy.minThreshold}%`;
    }

    const wins = result.wins.toString().padStart(5);
    const losses = result.losses.toString().padStart(6);
    const winRate = result.winRate.toFixed(2) + '%';
    const ev = (result.ev >= 0 ? '+' : '') + result.ev.toFixed(2) + '%';
    const tradesPerDay = (result.signalsDetected / result.period.days).toFixed(2);

    const name = strategyId.padEnd(19);

    console.log(`│ ${name} │ ${thresholds.padEnd(22)} │ ${wins} │ ${losses} │ ${winRate.padEnd(7)} │ ${ev.padEnd(9)} │ ${tradesPerDay.padStart(12)} │`);
  });

  console.log('└─────────────────────┴────────────────────────┴───────┴────────┴─────────┴───────────┴──────────────┘\n');

  // Determine winner
  if (resultsHL.ev > resultsBaseline.ev) {
    const evDiff = resultsHL.ev - resultsBaseline.ev;
    const wrDiff = resultsHL.winRate - resultsBaseline.winRate;

    console.log('🏆 WINNER: T123-1MIN-HL (Dual-Threshold)');
    console.log('─'.repeat(100));
    console.log(`  Win Rate:        ${resultsHL.winRate.toFixed(2)}% (${wrDiff > 0 ? '+' : ''}${wrDiff.toFixed(2)}% vs baseline)`);
    console.log(`  Expected Value:  ${(resultsHL.ev >= 0 ? '+' : '')}${resultsHL.ev.toFixed(2)}% (${evDiff > 0 ? '+' : ''}${evDiff.toFixed(2)}% vs baseline)`);
    console.log(`  Trades/Day:      ${(resultsHL.signalsDetected / resultsHL.period.days).toFixed(2)}\n`);

    console.log('💡 INTERPRETATION');
    console.log('─'.repeat(100));
    console.log(`  ✅ Dual-threshold filtering improves quality by +${evDiff.toFixed(2)}% EV`);
    console.log(`  📊 High-Low volatility + Open-Close movement = better signal quality`);
    console.log(`  ⚠️  Trade frequency: ${(resultsHL.signalsDetected / resultsHL.period.days).toFixed(2)}/day vs ${(resultsBaseline.signalsDetected / resultsBaseline.period.days).toFixed(2)}/day (baseline)`);

    if (resultsHL.signalsDetected / resultsHL.period.days < 1) {
      console.log(`  ⚠️  WARNING: Low signal frequency (<1/day) - may miss opportunities`);
    }
  } else {
    const evDiff = resultsBaseline.ev - resultsHL.ev;
    const wrDiff = resultsBaseline.winRate - resultsHL.winRate;

    console.log('🏆 WINNER: T123-1MIN (Single-Threshold Baseline)');
    console.log('─'.repeat(100));
    console.log(`  Win Rate:        ${resultsBaseline.winRate.toFixed(2)}% (${wrDiff > 0 ? '+' : ''}${wrDiff.toFixed(2)}% vs HL)`);
    console.log(`  Expected Value:  ${(resultsBaseline.ev >= 0 ? '+' : '')}${resultsBaseline.ev.toFixed(2)}% (${evDiff > 0 ? '+' : ''}${evDiff.toFixed(2)}% vs HL)`);
    console.log(`  Trades/Day:      ${(resultsBaseline.signalsDetected / resultsBaseline.period.days).toFixed(2)}\n`);

    console.log('💡 INTERPRETATION');
    console.log('─'.repeat(100));
    console.log(`  ❌ Dual-threshold filtering is too strict (${evDiff.toFixed(2)}% worse EV)`);
    console.log(`  📊 Single threshold captures more profitable opportunities`);
    console.log(`  ✅ Stick with T123-1MIN baseline strategy`);
  }

  // Signal quality breakdown
  console.log('\n' + '═'.repeat(100));
  console.log('📈 SIGNAL QUALITY BREAKDOWN');
  console.log('═'.repeat(100));

  console.log('\nT123-1MIN (Baseline):');
  console.log(`  Total Signals: ${resultsBaseline.signalsDetected}`);
  console.log(`  T+0 signals:   ${resultsBaseline.byMinute[0].signals} (${resultsBaseline.byMinute[0].wins}W/${resultsBaseline.byMinute[0].losses}L)`);
  console.log(`  T+1 signals:   ${resultsBaseline.byMinute[1].signals} (${resultsBaseline.byMinute[1].wins}W/${resultsBaseline.byMinute[1].losses}L)`);
  console.log(`  T+2 signals:   ${resultsBaseline.byMinute[2].signals} (${resultsBaseline.byMinute[2].wins}W/${resultsBaseline.byMinute[2].losses}L)`);

  console.log('\nT123-1MIN-HL (Dual-Threshold):');
  console.log(`  Total Signals: ${resultsHL.signalsDetected}`);
  console.log(`  T+0 signals:   ${resultsHL.byMinute[0].signals} (${resultsHL.byMinute[0].wins}W/${resultsHL.byMinute[0].losses}L)`);
  console.log(`  T+1 signals:   ${resultsHL.byMinute[1].signals} (${resultsHL.byMinute[1].wins}W/${resultsHL.byMinute[1].losses}L)`);
  console.log(`  T+2 signals:   ${resultsHL.byMinute[2].signals} (${resultsHL.byMinute[2].wins}W/${resultsHL.byMinute[2].losses}L)`);

  const signalsFiltered = resultsBaseline.signalsDetected - resultsHL.signalsDetected;
  const filterRate = (signalsFiltered / resultsBaseline.signalsDetected * 100).toFixed(1);

  console.log(`\n📊 Filtering Impact:`);
  console.log(`  Signals Filtered: ${signalsFiltered} (${filterRate}% of baseline)`);
  console.log(`  Retained Signals: ${resultsHL.signalsDetected} (${(100 - parseFloat(filterRate)).toFixed(1)}%)`);

  console.log('\n' + '═'.repeat(100) + '\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
