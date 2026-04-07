#!/usr/bin/env node
/**
 * Detection Time Price Estimator
 * Analyzes recent Binance data to estimate market prices at T+1, T+2, T+3
 * when signals would be detected
 */

'use strict';

const axios = require('axios');

// Fetch recent 1-minute candles
async function fetchRecentCandles(symbol, limit = 500) {
  const url = 'https://api.binance.com/api/v3/klines';
  const response = await axios.get(url, {
    params: {
      symbol,
      interval: '1m',
      limit
    }
  });

  return response.data.map(candle => ({
    timestamp: new Date(candle[0]),
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5])
  }));
}

// Simulate market price (using close price as proxy for market price)
// In reality, this would be the Polymarket best ask, but we'll estimate
function estimateMarketPrice(btcPrice, volatility) {
  // Base estimate: market starts at 0.50 (50/50 odds)
  // As price moves, market adjusts based on momentum
  // More volatile = higher initial pricing (less favorable entry)

  // Simplified model:
  // Low volatility (<0.3%): 0.50-0.60 range
  // Medium volatility (0.3-0.5%): 0.55-0.65 range
  // High volatility (>0.5%): 0.60-0.75 range

  const basePrice = 0.50;
  const volatilityFactor = Math.min(volatility / 2, 0.25); // Cap at 0.25
  const randomness = (Math.random() - 0.5) * 0.10; // ±5¢ randomness

  return Math.max(0.30, Math.min(0.85, basePrice + volatilityFactor + randomness));
}

async function analyzeDetectionPrices() {
  console.log('\n' + '='.repeat(100));
  console.log('📊 DETECTION TIME PRICE ESTIMATOR');
  console.log('='.repeat(100));
  console.log('Analyzing recent Binance data to estimate market prices at different detection times...\n');

  const cryptos = [
    { symbol: 'BTC', pair: 'BTCUSDT' },
    { symbol: 'ETH', pair: 'ETHUSDT' },
    { symbol: 'SOL', pair: 'SOLUSDT' },
    { symbol: 'XRP', pair: 'XRPUSDT' }
  ];

  const threshold = 0.20; // T123-1MIN threshold
  const allEstimates = {
    t1: [], // T+0 detected at T+1
    t2: [], // T+1 detected at T+2
    t3: []  // T+2 detected at T+3
  };

  for (const crypto of cryptos) {
    console.log(`\n${'─'.repeat(100)}`);
    console.log(`Analyzing ${crypto.symbol}...`);
    console.log('─'.repeat(100));

    const candles = await fetchRecentCandles(crypto.pair, 500);
    console.log(`Fetched ${candles.length} recent 1-minute candles`);

    // Group into 5-minute cycles
    const cycles = [];
    for (let i = 0; i < candles.length - 5; i += 5) {
      const cycleCandles = candles.slice(i, i + 5);
      if (cycleCandles.length === 5) {
        cycles.push({
          start: cycleCandles[0].timestamp,
          candles: cycleCandles,
          referencePrice: cycleCandles[0].open
        });
      }
    }

    console.log(`Grouped into ${cycles.length} 5-minute cycles`);

    // Analyze each cycle for signals
    let signalsFound = 0;
    const estimates = { t1: [], t2: [], t3: [] };

    for (const cycle of cycles) {
      // Check T+0, T+1, T+2 for signals
      for (let minute = 0; minute <= 2; minute++) {
        const candle = cycle.candles[minute];
        const movementPct = Math.abs((candle.close - cycle.referencePrice) / cycle.referencePrice * 100);

        if (movementPct >= threshold && movementPct <= 2.0) {
          signalsFound++;

          // Estimate market price at detection time (minute + 1)
          const detectionTime = minute + 1; // T+0 detected at T+1, etc.
          const detectionCandle = cycle.candles[detectionTime];

          // Estimate market price based on volatility
          const estimatedPrice = estimateMarketPrice(detectionCandle.close, movementPct);

          // Store by detection minute
          if (minute === 0) {
            estimates.t1.push(estimatedPrice);
            allEstimates.t1.push(estimatedPrice);
          } else if (minute === 1) {
            estimates.t2.push(estimatedPrice);
            allEstimates.t2.push(estimatedPrice);
          } else {
            estimates.t3.push(estimatedPrice);
            allEstimates.t3.push(estimatedPrice);
          }
        }
      }
    }

    console.log(`Found ${signalsFound} signals that would have triggered`);

    // Print estimates for this crypto
    if (signalsFound > 0) {
      console.log(`\nEstimated Market Prices for ${crypto.symbol}:`);

      if (estimates.t1.length > 0) {
        const avg = estimates.t1.reduce((a, b) => a + b, 0) / estimates.t1.length;
        const under60 = estimates.t1.filter(p => p <= 0.60).length;
        const pct = (under60 / estimates.t1.length * 100).toFixed(1);
        console.log(`  T+0 (detected at T+1): ${(avg * 100).toFixed(1)}¢ avg (${under60}/${estimates.t1.length} = ${pct}% ≤60¢)`);
      }

      if (estimates.t2.length > 0) {
        const avg = estimates.t2.reduce((a, b) => a + b, 0) / estimates.t2.length;
        const under60 = estimates.t2.filter(p => p <= 0.60).length;
        const pct = (under60 / estimates.t2.length * 100).toFixed(1);
        console.log(`  T+1 (detected at T+2): ${(avg * 100).toFixed(1)}¢ avg (${under60}/${estimates.t2.length} = ${pct}% ≤60¢)`);
      }

      if (estimates.t3.length > 0) {
        const avg = estimates.t3.reduce((a, b) => a + b, 0) / estimates.t3.length;
        const under60 = estimates.t3.filter(p => p <= 0.60).length;
        const pct = (under60 / estimates.t3.length * 100).toFixed(1);
        console.log(`  T+2 (detected at T+3): ${(avg * 100).toFixed(1)}¢ avg (${under60}/${estimates.t3.length} = ${pct}% ≤60¢)`);
      }
    }
  }

  // Overall summary
  console.log('\n\n' + '═'.repeat(100));
  console.log('📊 OVERALL ESTIMATED PRICES (All Cryptos Combined)');
  console.log('═'.repeat(100));

  const detectionTimes = [
    { key: 't1', label: 'T+0 (detected at T+1)', data: allEstimates.t1 },
    { key: 't2', label: 'T+1 (detected at T+2)', data: allEstimates.t2 },
    { key: 't3', label: 'T+2 (detected at T+3)', data: allEstimates.t3 }
  ];

  for (const dt of detectionTimes) {
    if (dt.data.length === 0) continue;

    const avg = dt.data.reduce((a, b) => a + b, 0) / dt.data.length;
    const min = Math.min(...dt.data);
    const max = Math.max(...dt.data);
    const under60 = dt.data.filter(p => p <= 0.60).length;
    const pct60 = (under60 / dt.data.length * 100).toFixed(1);

    console.log(`\n${dt.label}:`);
    console.log(`  Signals:       ${dt.data.length}`);
    console.log(`  Avg Price:     ${avg.toFixed(4)} (${(avg * 100).toFixed(1)}¢)`);
    console.log(`  Range:         ${min.toFixed(4)} - ${max.toFixed(4)} (${(min * 100).toFixed(1)}¢ - ${(max * 100).toFixed(1)}¢)`);
    console.log(`  ≤ 60¢:         ${under60}/${dt.data.length} (${pct60}%)`);
  }

  // Price distribution
  const allPrices = [...allEstimates.t1, ...allEstimates.t2, ...allEstimates.t3];

  if (allPrices.length > 0) {
    console.log('\n' + '═'.repeat(100));
    console.log('ESTIMATED PRICE DISTRIBUTION');
    console.log('═'.repeat(100));

    const buckets = {
      'Under 50¢': allPrices.filter(p => p < 0.50).length,
      '50-60¢': allPrices.filter(p => p >= 0.50 && p < 0.60).length,
      '60-70¢': allPrices.filter(p => p >= 0.60 && p < 0.70).length,
      '70-80¢': allPrices.filter(p => p >= 0.70 && p < 0.80).length,
      'Over 80¢': allPrices.filter(p => p >= 0.80).length
    };

    console.log();
    Object.entries(buckets).forEach(([range, count]) => {
      const pct = ((count / allPrices.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(pct / 2));
      console.log(`  ${range.padEnd(12)} ${count.toString().padStart(4)} signals (${pct.padStart(5)}%) ${bar}`);
    });

    const under60Total = allPrices.filter(p => p <= 0.60).length;
    const pct60Total = ((under60Total / allPrices.length) * 100).toFixed(1);

    console.log('\n' + '─'.repeat(100));
    console.log(`⭐ KEY FINDING: ${pct60Total}% of estimated prices are ≤ 60¢`);
    console.log('─'.repeat(100));

    // Recommendations
    console.log('\n═'.repeat(100));
    console.log('💡 INTERPRETATION');
    console.log('═'.repeat(100));
    console.log('\nNOTE: These are ESTIMATES based on recent volatility patterns.');
    console.log('Actual Polymarket prices will vary based on:');
    console.log('  - Order book depth and liquidity');
    console.log('  - Market maker activity');
    console.log('  - Recent win/loss streaks affecting odds');
    console.log('  - Time of day and market participation');
    console.log('\nFor ACTUAL prices, run the bot and analyze real trade data with:');
    console.log('  node analyze-entry-prices.js');

    const avgAll = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
    console.log(`\nEstimated Average Entry Price: ${(avgAll * 100).toFixed(1)}¢`);

    if (avgAll <= 0.60) {
      console.log('✅ OPTIMISTIC: Most signals should enter around 60¢ or below');
    } else if (avgAll <= 0.70) {
      console.log('⚠️  MODERATE: Average price is above 60¢, expect mixed entry prices');
      console.log('   Consider lowering max_entry_price to 0.65 to filter expensive trades');
    } else {
      console.log('❌ CAUTIOUS: Estimated prices are quite high (>70¢)');
      console.log('   Strongly recommend lowering max_entry_price to 0.65 or 0.60');
    }
  }

  console.log('\n' + '═'.repeat(100) + '\n');
  process.exit(0);
}

analyzeDetectionPrices().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
