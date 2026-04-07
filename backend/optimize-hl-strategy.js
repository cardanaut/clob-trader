#!/usr/bin/env node
/**
 * T123-HL Strategy Optimizer
 * Searches for optimal HL and OC threshold combinations
 *
 * Usage:
 *   node optimize-hl-strategy.js [symbol] [maxCandles]
 *
 * Examples:
 *   node optimize-hl-strategy.js BTC
 *   node optimize-hl-strategy.js SOL 3000
 */

'use strict';

const { runBacktest } = require('./src/spike/backtest');
const config = require('./src/spike/config');

async function optimizeStrategy(symbol, maxCandles, useCache = true) {
  console.log('\n' + '='.repeat(100));
  console.log('🔍 T123-HL STRATEGY OPTIMIZER');
  console.log('='.repeat(100));
  console.log(`Symbol: ${symbol}`);
  console.log(`Max Candles: ${maxCandles.toLocaleString()}`);
  console.log(`Time Range: ~${(maxCandles / 1440).toFixed(1)} days\n`);

  // Test baseline first
  console.log('📊 Testing baseline (T123-1MIN)...');
  const baseline = config.STRATEGIES['T123-1MIN'];
  const baselineResult = await runBacktest(
    maxCandles,
    symbol,
    baseline.minThreshold,
    baseline.maxThreshold,
    'T123-1MIN',
    useCache
  );

  console.log(`   Baseline: WR=${baselineResult.winRate.toFixed(1)}%, EV=${baselineResult.ev.toFixed(1)}%, Signals=${baselineResult.signalsDetected}\n`);

  // Parameter ranges to test (0.5% = 0.005 increments)
  const hlThresholds = [];
  const ocThresholds = [];

  // HL: 0.10% to 0.50% in 0.5% steps (0.005)
  for (let hl = 0.10; hl <= 0.50; hl += 0.005) {
    hlThresholds.push(Math.round(hl * 1000) / 1000); // Round to avoid floating point issues
  }

  // OC: 0.05% to 0.45% in 0.5% steps (0.005)
  for (let oc = 0.05; oc <= 0.45; oc += 0.005) {
    ocThresholds.push(Math.round(oc * 1000) / 1000);
  }

  const results = [];
  let testCount = 0;
  let skippedCount = 0;

  // Calculate approximate total (skip OC > HL)
  let estimatedTests = 0;
  for (const hlThreshold of hlThresholds) {
    for (const ocThreshold of ocThresholds) {
      if (ocThreshold <= hlThreshold) estimatedTests++;
    }
  }

  console.log(`🔬 Testing ~${estimatedTests} parameter combinations (0.5% increments)...`);
  console.log(`   HL Range: ${(hlThresholds[0] * 100).toFixed(1)}% - ${(hlThresholds[hlThresholds.length - 1] * 100).toFixed(1)}%`);
  console.log(`   OC Range: ${(ocThresholds[0] * 100).toFixed(1)}% - ${(ocThresholds[ocThresholds.length - 1] * 100).toFixed(1)}%`);
  console.log('─'.repeat(100));

  const startTestTime = Date.now();

  for (const hlThreshold of hlThresholds) {
    for (const ocThreshold of ocThresholds) {
      // Skip if OC threshold is higher than HL threshold (doesn't make sense)
      if (ocThreshold > hlThreshold) {
        skippedCount++;
        continue;
      }

      testCount++;

      // Temporarily modify config
      const originalConfig = { ...config.STRATEGIES['T123-1MIN-HL'] };
      config.STRATEGIES['T123-1MIN-HL'] = {
        ...originalConfig,
        hlThreshold,
        ocThreshold
      };

      const result = await runBacktest(
        maxCandles,
        symbol,
        hlThreshold, // minThreshold parameter (used for HL in dual-threshold mode)
        2.0, // maxThreshold
        'T123-1MIN-HL',
        useCache
      );

      // Restore original config
      config.STRATEGIES['T123-1MIN-HL'] = originalConfig;

      results.push({
        hlThreshold,
        ocThreshold,
        winRate: result.winRate,
        ev: result.ev,
        signals: result.signalsDetected,
        wins: result.wins,
        losses: result.losses,
        tradesPerDay: result.signalsDetected / result.period.days
      });

      // Progress indicator (every 100 tests or 10%)
      if (testCount % 100 === 0 || testCount % Math.floor(estimatedTests / 10) === 0) {
        const pct = (testCount / estimatedTests * 100).toFixed(1);
        const elapsed = ((Date.now() - startTestTime) / 1000).toFixed(1);
        const testsPerSec = (testCount / (Date.now() - startTestTime) * 1000).toFixed(1);
        const eta = ((estimatedTests - testCount) / testsPerSec).toFixed(0);
        process.stdout.write(`   Progress: ${testCount}/${estimatedTests} (${pct}%) | ${elapsed}s elapsed | ETA: ${eta}s | ${testsPerSec} tests/s     \r`);
      }
    }
  }

  const testDuration = ((Date.now() - startTestTime) / 1000).toFixed(2);
  console.log(`   Progress: ${testCount}/${estimatedTests} (100%) ✓ | Completed in ${testDuration}s                          \n`);

  // Sort by EV (descending)
  results.sort((a, b) => b.ev - a.ev);

  // Display top 20 results
  console.log('═'.repeat(100));
  console.log('🏆 TOP 20 PARAMETER COMBINATIONS (sorted by EV)');
  console.log('═'.repeat(100));
  console.log('┌──────┬──────┬─────────┬───────────┬─────────┬───────┬────────┬──────────────┐');
  console.log('│ HL%  │ OC%  │ Win Rate│ EV        │ Signals │ Wins  │ Losses │ Trades/Day   │');
  console.log('├──────┼──────┼─────────┼───────────┼─────────┼───────┼────────┼──────────────┤');

  for (let i = 0; i < Math.min(20, results.length); i++) {
    const r = results[i];
    const hl = r.hlThreshold.toFixed(2).padStart(4);
    const oc = r.ocThreshold.toFixed(2).padStart(4);
    const wr = r.winRate.toFixed(1).padStart(5) + '%';
    const ev = (r.ev >= 0 ? '+' : '') + r.ev.toFixed(1).padStart(5) + '%';
    const signals = r.signals.toString().padStart(7);
    const wins = r.wins.toString().padStart(5);
    const losses = r.losses.toString().padStart(6);
    const tpd = r.tradesPerDay.toFixed(2).padStart(12);

    const isBest = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    console.log(`│ ${hl} │ ${oc} │ ${wr}  │ ${ev}   │ ${signals} │ ${wins} │ ${losses} │ ${tpd} │ ${isBest}`);
  }

  console.log('└──────┴──────┴─────────┴───────────┴─────────┴───────┴────────┴──────────────┘\n');

  // Find best result
  const best = results[0];

  // Compare to baseline
  console.log('═'.repeat(100));
  console.log('📊 BEST vs BASELINE COMPARISON');
  console.log('═'.repeat(100));

  const evDiff = best.ev - baselineResult.ev;
  const wrDiff = best.winRate - baselineResult.winRate;
  const signalDiff = best.signals - baselineResult.signalsDetected;

  console.log('\nBest T123-HL Configuration:');
  console.log(`  HL Threshold:  ≥${(best.hlThreshold * 100).toFixed(1)}%`);
  console.log(`  OC Threshold:  ≥${(best.ocThreshold * 100).toFixed(1)}%`);
  console.log(`  Win Rate:      ${best.winRate.toFixed(1)}% (${wrDiff >= 0 ? '+' : ''}${wrDiff.toFixed(1)}% vs baseline)`);
  console.log(`  Expected Value:${(best.ev >= 0 ? '+' : '')}${best.ev.toFixed(1)}% (${evDiff >= 0 ? '+' : ''}${evDiff.toFixed(1)}% vs baseline)`);
  console.log(`  Signals:       ${best.signals} (${signalDiff >= 0 ? '+' : ''}${signalDiff} vs baseline)`);
  console.log(`  Trades/Day:    ${best.tradesPerDay.toFixed(2)}`);

  console.log('\nBaseline (T123-1MIN):');
  console.log(`  Threshold:     ≥${(baseline.minThreshold * 100).toFixed(1)}%`);
  console.log(`  Win Rate:      ${baselineResult.winRate.toFixed(1)}%`);
  console.log(`  Expected Value:${(baselineResult.ev >= 0 ? '+' : '')}${baselineResult.ev.toFixed(1)}%`);
  console.log(`  Signals:       ${baselineResult.signalsDetected}`);
  console.log(`  Trades/Day:    ${(baselineResult.signalsDetected / baselineResult.period.days).toFixed(2)}`);

  console.log('\n' + '─'.repeat(100));

  if (evDiff > 0) {
    console.log(`✅ WINNER: T123-HL with HL≥${(best.hlThreshold * 100).toFixed(1)}%, OC≥${(best.ocThreshold * 100).toFixed(1)}%`);
    console.log(`   Improvement: +${evDiff.toFixed(1)}% EV`);

    if (best.signals < baselineResult.signalsDetected * 0.5) {
      console.log(`   ⚠️  WARNING: Only ${best.signals} signals (${(best.signals / baselineResult.signalsDetected * 100).toFixed(0)}% of baseline)`);
      console.log(`   This may be too restrictive for practical use`);
    }
  } else {
    console.log(`❌ RESULT: T123-1MIN baseline remains superior`);
    console.log(`   No HL/OC combination beats single threshold`);
    console.log(`   Best attempt: ${evDiff.toFixed(1)}% worse than baseline`);
  }

  console.log('─'.repeat(100));
  console.log('\n💡 RECOMMENDATIONS:');

  if (evDiff > 5) {
    console.log(`  1. Update config.js with HL≥${(best.hlThreshold * 100).toFixed(1)}%, OC≥${(best.ocThreshold * 100).toFixed(1)}%`);
    console.log(`  2. Test on other cryptos to validate consistency`);
    console.log(`  3. Consider enabling T123-1MIN-HL as default strategy`);
  } else if (evDiff > 0) {
    console.log(`  1. Marginal improvement (+${evDiff.toFixed(1)}% EV)`);
    console.log(`  2. Test on other cryptos before deciding`);
    console.log(`  3. May not be worth the added complexity`);
  } else {
    console.log(`  1. Keep T123-1MIN as default strategy`);
    console.log(`  2. Single threshold is simpler and performs better`);
    console.log(`  3. Dual-threshold approach doesn't improve signal quality`);
  }

  console.log('\n═'.repeat(100) + '\n');

  return {
    best,
    baseline: baselineResult,
    allResults: results
  };
}

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
      }
      console.log(`✅ Cleared ${files.length} cache file(s)\n`);
    }
  }

  // Parse arguments
  const cryptoSymbol = filteredArgs[0] || 'SOL'; // Default to SOL (most signals)
  const maxCandles = parseInt(filteredArgs[1]) || 3000;

  const symbolMap = {
    'BTC': 'BTCUSDT',
    'ETH': 'ETHUSDT',
    'SOL': 'SOLUSDT',
    'XRP': 'XRPUSDT'
  };

  const symbol = symbolMap[cryptoSymbol.toUpperCase()] || 'SOLUSDT';

  const startTime = Date.now();
  await optimizeStrategy(symbol, maxCandles, !clearCacheFlag);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`⏱️  Total optimization time: ${elapsed}s`);
  console.log('');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
