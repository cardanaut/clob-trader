#!/usr/bin/env node
/**
 * Strategy Comparison Runner
 * Compares T123-1MIN vs T123-30SEC strategies
 *
 * Usage:
 *   node compare-strategies.js [symbol] [maxCandles] [--clear-cache]
 *
 * Examples:
 *   node compare-strategies.js BTC           # 2 days (3000 candles)
 *   node compare-strategies.js BTC 5000      # ~3.5 days
 *   node compare-strategies.js ETH 1500      # ~1 day
 *   node compare-strategies.js BTC 3000 --clear-cache
 *   node compare-strategies.js --clear-cache  (clear all cache)
 */

'use strict';

const { compareStrategies } = require('./src/spike/backtest');
const logger = require('./src/utils/logger');

async function main() {
  const args = process.argv.slice(2);

  // Check for --clear-cache flag
  const clearCacheFlag = args.includes('--clear-cache');
  const filteredArgs = args.filter(arg => arg !== '--clear-cache');

  // Handle cache clearing
  if (clearCacheFlag) {
    console.log('\n🗑️  Clearing cache...');
    const backtest30s = require('./src/spike/backtest-30s');

    // Clear all cache files
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
  const maxCandles = parseInt(filteredArgs[1]) || 3000; // Default 3000 = ~2 days

  // Convert crypto symbol to Binance pair
  const symbolMap = {
    'BTC': 'BTCUSDT',
    'ETH': 'ETHUSDT',
    'SOL': 'SOLUSDT',
    'XRP': 'XRPUSDT'
  };

  const symbol = symbolMap[cryptoSymbol.toUpperCase()] || 'BTCUSDT';

  console.log('\n' + '='.repeat(80));
  console.log('🔬 SPIKE TRADING STRATEGY COMPARISON');
  console.log('='.repeat(80));
  console.log(`Symbol: ${symbol}`);
  console.log(`Max Candles: ${maxCandles.toLocaleString()}`);
  console.log(`Time Range: ~${(maxCandles / 1440).toFixed(1)} days`);
  console.log(`Cache: ${clearCacheFlag ? '🗑️  Cleared (fetching fresh data)' : '💾 Enabled (reusing cached data if available)'}\n`);

  try {
    // Run comparison (don't use cache if clear flag was set)
    const comparison = await compareStrategies(maxCandles, symbol, !clearCacheFlag);

    console.log('\n' + '='.repeat(80));
    console.log('📊 RESULTS');
    console.log('='.repeat(80));
    console.log(`Period: ${comparison.period.fromISO} to ${comparison.period.toISO}`);
    console.log(`Duration: ${comparison.period.days.toFixed(2)} days`);
    console.log(`Time Elapsed: ${comparison.elapsed}\n`);

    // T123-1MIN Results
    const s1 = comparison.strategies['T123-1MIN'];
    console.log('📈 T123-1MIN (1-Minute Candles)');
    console.log('─'.repeat(80));
    console.log(`  Threshold:       ${s1.threshold}`);
    console.log(`  Total Cycles:    ${s1.totalCycles.toLocaleString()}`);
    console.log(`  Signals:         ${s1.signalsDetected.toLocaleString()}`);
    console.log(`  Wins:            ${s1.wins} ✅`);
    console.log(`  Losses:          ${s1.losses} ❌`);
    console.log(`  Win Rate:        ${s1.winRate}`);
    console.log(`  Expected Value:  ${s1.ev}`);
    console.log(`  Trades/Day:      ${s1.tradesPerDay}\n`);

    // T123-30SEC Results
    const s2 = comparison.strategies['T123-30SEC'];
    console.log('⚡ T123-30SEC (30-Second Candles)');
    console.log('─'.repeat(80));
    console.log(`  Threshold:       ${s2.threshold}`);
    console.log(`  Total Cycles:    ${s2.totalCycles.toLocaleString()}`);
    console.log(`  Signals:         ${s2.signalsDetected.toLocaleString()}`);
    console.log(`  Wins:            ${s2.wins} ✅`);
    console.log(`  Losses:          ${s2.losses} ❌`);
    console.log(`  Win Rate:        ${s2.winRate}`);
    console.log(`  Expected Value:  ${s2.ev}`);
    console.log(`  Trades/Day:      ${s2.tradesPerDay}\n`);

    // Comparison
    console.log('🏆 WINNER');
    console.log('─'.repeat(80));
    console.log(`  By Win Rate:     ${comparison.winner.byWinRate}`);
    console.log(`  By EV:           ${comparison.winner.byEV}`);
    console.log(`  By Trade Volume: ${comparison.winner.byTradeVolume}\n`);

    // Differences
    const winRateDiff = parseFloat(s2.winRate) - parseFloat(s1.winRate);
    const evDiff = parseFloat(s2.ev) - parseFloat(s1.ev);
    const tradesDiff = s2.signalsDetected - s1.signalsDetected;

    console.log('📊 DIFFERENCES (30SEC vs 1MIN)');
    console.log('─'.repeat(80));
    console.log(`  Win Rate:   ${winRateDiff > 0 ? '+' : ''}${winRateDiff.toFixed(2)}%`);
    console.log(`  EV:         ${evDiff > 0 ? '+' : ''}${evDiff.toFixed(2)}%`);
    console.log(`  Signals:    ${tradesDiff > 0 ? '+' : ''}${tradesDiff}`);
    console.log('='.repeat(80) + '\n');

    // Recommendation
    console.log('💡 RECOMMENDATION');
    console.log('─'.repeat(80));
    if (parseFloat(s2.ev) > parseFloat(s1.ev)) {
      console.log(`  ✅ T123-30SEC shows better Expected Value (+${evDiff.toFixed(2)}%)`);
      console.log(`  Recommendation: Use T123-30SEC for ${symbol} trading`);
    } else if (parseFloat(s1.ev) > parseFloat(s2.ev)) {
      console.log(`  ✅ T123-1MIN shows better Expected Value (+${Math.abs(evDiff).toFixed(2)}%)`);
      console.log(`  Recommendation: Use T123-1MIN for ${symbol} trading`);
    } else {
      console.log(`  ⚖️  Both strategies have similar Expected Value`);
      console.log(`  Recommendation: Choose based on trade frequency preference`);
    }
    console.log('='.repeat(80) + '\n');

    process.exit(0);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
