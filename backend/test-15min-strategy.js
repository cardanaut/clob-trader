#!/usr/bin/env node
/**
 * T369 Strategy Tester (15-Minute Markets)
 * Compares T369-1MIN against T123-1MIN baseline
 *
 * Usage:
 *   node test-15min-strategy.js [symbol] [maxCandles]
 *
 * Examples:
 *   node test-15min-strategy.js BTC
 *   node test-15min-strategy.js ETH 5000
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
  console.log('🔬 T369 STRATEGY TEST (15-Minute Markets)');
  console.log('='.repeat(100));
  console.log(`Symbol: ${symbol}`);
  console.log(`Max Candles: ${maxCandles.toLocaleString()}`);
  console.log(`Time Range: ~${(maxCandles / 1440).toFixed(1)} days`);
  console.log(`Cache: ${clearCacheFlag ? '🗑️  Cleared' : '💾 Enabled'}\n`);

  const startTime = Date.now();
  const useCache = !clearCacheFlag;

  // Test T123-1MIN (baseline - 5 minute markets)
  console.log('📊 Testing T123-1MIN (5-minute markets, baseline)...');
  const baseline = config.STRATEGIES['T123-1MIN'];
  const results5min = await runBacktest(
    maxCandles,
    symbol,
    baseline.minThreshold,
    baseline.maxThreshold,
    'T123-1MIN',
    useCache
  );

  // Test T369-1MIN (15 minute markets)
  console.log('\n📊 Testing T369-1MIN (15-minute markets)...');
  const t369 = config.STRATEGIES['T369-1MIN'];
  const results15min = await runBacktest(
    maxCandles,
    symbol,
    t369.minThreshold,
    t369.maxThreshold,
    'T369-1MIN',
    useCache
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // Display results
  console.log('\n' + '='.repeat(100));
  console.log('📊 RESULTS COMPARISON');
  console.log('='.repeat(100));
  console.log(`Time Elapsed: ${elapsed}s\n`);

  // Print table
  console.log('┌─────────────────────┬────────────┬────────┬───────┬────────┬─────────┬───────────┬──────────────┐');
  console.log('│ Strategy            │ Market     │ Thresh │ Wins  │ Losses │ Win Rate│ EV        │ Trades/Day   │');
  console.log('├─────────────────────┼────────────┼────────┼───────┼────────┼─────────┼───────────┼──────────────┤');

  const strategies = {
    'T123-1MIN': results5min,
    'T369-1MIN': results15min
  };

  Object.entries(strategies).forEach(([strategyId, result]) => {
    const strategy = config.STRATEGIES[strategyId];
    const marketDuration = strategy.marketDuration + 'min';
    const threshold = strategy.minThreshold + '%';
    const wins = result.wins.toString().padStart(5);
    const losses = result.losses.toString().padStart(6);
    const winRate = result.winRate.toFixed(2) + '%';
    const ev = (result.ev >= 0 ? '+' : '') + result.ev.toFixed(2) + '%';
    const tradesPerDay = (result.signalsDetected / result.period.days).toFixed(2);

    const name = strategyId.padEnd(19);

    console.log(`│ ${name} │ ${marketDuration.padEnd(10)} │ ${threshold.padEnd(6)} │ ${wins} │ ${losses} │ ${winRate.padEnd(7)} │ ${ev.padEnd(9)} │ ${tradesPerDay.padStart(12)} │`);
  });

  console.log('└─────────────────────┴────────────┴────────┴───────┴────────┴─────────┴───────────┴──────────────┘\n');

  // Determine winner
  if (results15min.ev > results5min.ev) {
    const evDiff = results15min.ev - results5min.ev;
    const wrDiff = results15min.winRate - results5min.winRate;

    console.log('🏆 WINNER: T369-1MIN (15-Minute Markets)');
    console.log('─'.repeat(100));
    console.log(`  Win Rate:        ${results15min.winRate.toFixed(2)}% (${wrDiff > 0 ? '+' : ''}${wrDiff.toFixed(2)}% vs 5-min)`);
    console.log(`  Expected Value:  ${(results15min.ev >= 0 ? '+' : '')}${results15min.ev.toFixed(2)}% (${evDiff > 0 ? '+' : ''}${evDiff.toFixed(2)}% vs 5-min)`);
    console.log(`  Trades/Day:      ${(results15min.signalsDetected / results15min.period.days).toFixed(2)}\n`);

    console.log('💡 RECOMMENDATION');
    console.log('─'.repeat(100));
    console.log(`  ✅ T369-1MIN shows +${evDiff.toFixed(2)}% better EV than T123-1MIN`);
    console.log(`  Consider using T369-1MIN if Polymarket has active 15-minute markets`);
  } else {
    const evDiff = results5min.ev - results15min.ev;
    const wrDiff = results5min.winRate - results15min.winRate;

    console.log('🏆 WINNER: T123-1MIN (5-Minute Markets)');
    console.log('─'.repeat(100));
    console.log(`  Win Rate:        ${results5min.winRate.toFixed(2)}% (${wrDiff > 0 ? '+' : ''}${wrDiff.toFixed(2)}% vs 15-min)`);
    console.log(`  Expected Value:  ${(results5min.ev >= 0 ? '+' : '')}${results5min.ev.toFixed(2)}% (${evDiff > 0 ? '+' : ''}${evDiff.toFixed(2)}% vs 15-min)`);
    console.log(`  Trades/Day:      ${(results5min.signalsDetected / results5min.period.days).toFixed(2)}\n`);

    console.log('💡 RECOMMENDATION');
    console.log('─'.repeat(100));
    console.log(`  ✅ T123-1MIN remains superior with +${evDiff.toFixed(2)}% better EV`);
    console.log(`  Stick with 5-minute markets for ${symbol} trading`);
  }

  console.log('='.repeat(100) + '\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
