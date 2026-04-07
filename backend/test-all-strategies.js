#!/usr/bin/env node
/**
 * Multi-Strategy Comparison Tool
 * Tests all 30-second variations against T123-1MIN baseline
 *
 * Usage:
 *   node test-all-strategies.js [symbol] [maxCandles]
 *
 * Examples:
 *   node test-all-strategies.js BTC
 *   node test-all-strategies.js ETH 5000
 *   node test-all-strategies.js BTC --clear-cache
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
  console.log('🔬 COMPREHENSIVE STRATEGY TEST');
  console.log('='.repeat(100));
  console.log(`Symbol: ${symbol}`);
  console.log(`Max Candles: ${maxCandles.toLocaleString()}`);
  console.log(`Time Range: ~${(maxCandles / 1440).toFixed(1)} days`);
  console.log(`Cache: ${clearCacheFlag ? '🗑️  Cleared (fetching fresh data)' : '💾 Enabled (reusing cached data if available)'}\n`);

  const startTime = Date.now();
  const results = {};
  const useCache = !clearCacheFlag;

  // Test T123-1MIN (baseline)
  console.log('📊 Testing T123-1MIN (baseline)...');
  const baseline = config.STRATEGIES['T123-1MIN'];
  results['T123-1MIN'] = await runBacktest(
    maxCandles,
    symbol,
    baseline.minThreshold,
    baseline.maxThreshold,
    'T123-1MIN',
    useCache
  );

  // Test all 30-second variations
  const variations = ['T123-30SEC-V1', 'T123-30SEC-V2', 'T123-30SEC-V3'];

  for (const strategyId of variations) {
    console.log(`\n📊 Testing ${strategyId}...`);
    const strategy = config.STRATEGIES[strategyId];
    results[strategyId] = await runBacktest(
      maxCandles * 2, // 30-sec needs 2x candles
      symbol,
      strategy.minThreshold,
      strategy.maxThreshold,
      strategyId,
      useCache
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // Display results
  console.log('\n' + '='.repeat(100));
  console.log('📊 RESULTS COMPARISON');
  console.log('='.repeat(100));
  console.log(`Time Elapsed: ${elapsed}s\n`);

  // Print table header
  console.log('┌─────────────────────┬────────────┬───────┬────────┬─────────┬───────────┬──────────────┐');
  console.log('│ Strategy            │ Threshold  │ Wins  │ Losses │ Win Rate│ EV        │ Trades/Day   │');
  console.log('├─────────────────────┼────────────┼───────┼────────┼─────────┼───────────┼──────────────┤');

  // Print each strategy
  Object.entries(results).forEach(([strategyId, result]) => {
    const strategy = config.STRATEGIES[strategyId];
    const wins = result.wins.toString().padStart(5);
    const losses = result.losses.toString().padStart(6);
    const winRate = result.winRate.toFixed(2) + '%';
    const ev = (result.ev >= 0 ? '+' : '') + result.ev.toFixed(2) + '%';
    const tradesPerDay = (result.signalsDetected / result.period.days).toFixed(2);

    const name = strategyId.padEnd(19);
    const threshold = `${strategy.minThreshold}%`.padEnd(10);

    console.log(`│ ${name} │ ${threshold} │ ${wins} │ ${losses} │ ${winRate.padEnd(7)} │ ${ev.padEnd(9)} │ ${tradesPerDay.padStart(12)} │`);
  });

  console.log('└─────────────────────┴────────────┴───────┴────────┴─────────┴───────────┴──────────────┘\n');

  // Find best strategy
  const sorted = Object.entries(results).sort((a, b) => b[1].ev - a[1].ev);
  const best = sorted[0];
  const baseline_result = results['T123-1MIN'];

  console.log('🏆 WINNER');
  console.log('─'.repeat(100));
  console.log(`  Best Strategy:   ${best[0]}`);
  console.log(`  Win Rate:        ${best[1].winRate.toFixed(2)}%`);
  console.log(`  Expected Value:  ${(best[1].ev >= 0 ? '+' : '')}${best[1].ev.toFixed(2)}%`);
  console.log(`  Trades/Day:      ${(best[1].signalsDetected / best[1].period.days).toFixed(2)}\n`);

  // Compare to baseline
  if (best[0] !== 'T123-1MIN') {
    const evDiff = best[1].ev - baseline_result.ev;
    const wrDiff = best[1].winRate - baseline_result.winRate;

    console.log('📈 IMPROVEMENT vs T123-1MIN');
    console.log('─'.repeat(100));
    console.log(`  Win Rate:   ${wrDiff > 0 ? '+' : ''}${wrDiff.toFixed(2)}%`);
    console.log(`  EV:         ${evDiff > 0 ? '+' : ''}${evDiff.toFixed(2)}%`);
    console.log(`  Trade Freq: ${((best[1].signalsDetected / best[1].period.days) - (baseline_result.signalsDetected / baseline_result.period.days)).toFixed(2)} more trades/day`);
  } else {
    console.log('💡 RECOMMENDATION');
    console.log('─'.repeat(100));
    console.log('  T123-1MIN remains the best strategy.');
    console.log('  No 30-second variation outperforms the baseline.');
  }

  console.log('='.repeat(100) + '\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
