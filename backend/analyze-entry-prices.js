#!/usr/bin/env node
/**
 * Entry Price Analyzer
 * Analyzes actual market prices at signal detection times (T+1, T+2, T+3)
 * Shows distribution of entry prices to understand if 60¢ trades are realistic
 */

'use strict';

const { query } = require('./src/database/connection');

async function analyzeEntryPrices() {
  console.log('\n' + '='.repeat(100));
  console.log('📊 ENTRY PRICE ANALYSIS (T+1, T+2, T+3 Market Prices)');
  console.log('='.repeat(100));
  console.log('Analyzing actual market prices from trading history at different detection times...\n');

  try {
    // Try simulated trades first
    let result = await query(`
      SELECT
        crypto_symbol,
        signal_minute,
        polymarket_best_ask,
        simulated_entry_price as entry_price,
        actual_slippage_pct,
        signal_type,
        timestamp
      FROM spike_trades_simulated
      ORDER BY timestamp DESC
      LIMIT 500
    `);

    // If no simulated trades, try live trades
    if (result.rows.length === 0) {
      console.log('No simulated trades found. Checking live trades...\n');
      result = await query(`
        SELECT
          crypto_symbol,
          signal_minute,
          polymarket_best_ask,
          entry_price,
          actual_slippage_pct,
          signal_type,
          timestamp
        FROM spike_trades_live
        ORDER BY timestamp DESC
        LIMIT 500
      `);
    }

    if (result.rows.length === 0) {
      console.log('❌ No trades found in database. The bot needs to run and detect signals first.\n');
      console.log('Options:');
      console.log('  1. Wait for the bot to detect signals and execute trades');
      console.log('  2. Lower the detection threshold temporarily to get more signals');
      console.log('  3. Check logs to see if signals are being detected\n');
      process.exit(1);
    }

    const trades = result.rows;

    console.log(`Found ${trades.length} historical trades\n`);

    // Analyze by crypto
    const byCrypto = {};
    const byMinute = {
      0: [], // T+0 (detected at T+1)
      1: [], // T+1 (detected at T+2)
      2: []  // T+2 (detected at T+3)
    };

    for (const trade of trades) {
      const crypto = trade.crypto_symbol;
      const minute = parseInt(trade.signal_minute);
      const marketPrice = parseFloat(trade.polymarket_best_ask);
      const entryPrice = parseFloat(trade.entry_price);

      if (!byCrypto[crypto]) {
        byCrypto[crypto] = [];
      }

      byCrypto[crypto].push({
        minute,
        marketPrice,
        entryPrice,
        slippage: parseFloat(trade.actual_slippage_pct),
        signalType: trade.signal_type
      });

      if (byMinute[minute]) {
        byMinute[minute].push(marketPrice);
      }
    }

    // Print overall statistics
    console.log('═'.repeat(100));
    console.log('OVERALL MARKET PRICE DISTRIBUTION (at signal detection time)');
    console.log('═'.repeat(100));

    const allPrices = trades.map(t => parseFloat(t.polymarket_best_ask));
    const avgPrice = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);

    console.log(`Average Market Price:  ${avgPrice.toFixed(4)} (${(avgPrice * 100).toFixed(1)}¢)`);
    console.log(`Minimum Price:         ${minPrice.toFixed(4)} (${(minPrice * 100).toFixed(1)}¢)`);
    console.log(`Maximum Price:         ${maxPrice.toFixed(4)} (${(maxPrice * 100).toFixed(1)}¢)`);

    // Price distribution buckets
    const buckets = {
      'Under 50¢': allPrices.filter(p => p < 0.50).length,
      '50-60¢': allPrices.filter(p => p >= 0.50 && p < 0.60).length,
      '60-70¢': allPrices.filter(p => p >= 0.60 && p < 0.70).length,
      '70-80¢': allPrices.filter(p => p >= 0.70 && p < 0.80).length,
      'Over 80¢': allPrices.filter(p => p >= 0.80).length
    };

    console.log('\nPrice Distribution:');
    Object.entries(buckets).forEach(([range, count]) => {
      const pct = ((count / allPrices.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(pct / 2));
      console.log(`  ${range.padEnd(12)} ${count.toString().padStart(4)} trades (${pct.padStart(5)}%) ${bar}`);
    });

    // Answer the key question
    const under60 = allPrices.filter(p => p <= 0.60).length;
    const pctUnder60 = ((under60 / allPrices.length) * 100).toFixed(1);

    console.log('\n' + '─'.repeat(100));
    console.log(`⭐ KEY FINDING: ${pctUnder60}% of trades had market prices ≤ 60¢`);
    console.log('─'.repeat(100));

    // By detection minute
    console.log('\n═'.repeat(100));
    console.log('PRICE BY DETECTION MINUTE');
    console.log('═'.repeat(100));

    for (const [minute, prices] of Object.entries(byMinute)) {
      if (prices.length === 0) continue;

      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const under60Count = prices.filter(p => p <= 0.60).length;
      const pct60 = ((under60Count / prices.length) * 100).toFixed(1);

      const minuteLabel = minute === '0' ? 'T+0 (detected at T+1)' :
                         minute === '1' ? 'T+1 (detected at T+2)' :
                         'T+2 (detected at T+3)';

      console.log(`\n${minuteLabel}:`);
      console.log(`  Trades:        ${prices.length}`);
      console.log(`  Avg Price:     ${avg.toFixed(4)} (${(avg * 100).toFixed(1)}¢)`);
      console.log(`  Range:         ${min.toFixed(4)} - ${max.toFixed(4)} (${(min * 100).toFixed(1)}¢ - ${(max * 100).toFixed(1)}¢)`);
      console.log(`  ≤ 60¢:         ${under60Count}/${prices.length} (${pct60}%)`);
    }

    // By crypto
    console.log('\n═'.repeat(100));
    console.log('PRICE BY CRYPTO');
    console.log('═'.repeat(100));

    for (const [crypto, cryptoTrades] of Object.entries(byCrypto)) {
      const prices = cryptoTrades.map(t => t.marketPrice);
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const under60 = prices.filter(p => p <= 0.60).length;
      const pct60 = ((under60 / prices.length) * 100).toFixed(1);

      console.log(`\n${crypto}:`);
      console.log(`  Trades:        ${prices.length}`);
      console.log(`  Avg Price:     ${avg.toFixed(4)} (${(avg * 100).toFixed(1)}¢)`);
      console.log(`  ≤ 60¢:         ${under60}/${prices.length} (${pct60}%)`);
    }

    // Impact of slippage
    console.log('\n═'.repeat(100));
    console.log('SLIPPAGE IMPACT (Market Price → Entry Price)');
    console.log('═'.repeat(100));

    const slippages = trades.map(t => parseFloat(t.actual_slippage_pct));
    const avgSlippage = slippages.reduce((a, b) => a + b, 0) / slippages.length;

    const entryPrices = trades.map(t => parseFloat(t.entry_price));
    const avgEntry = entryPrices.reduce((a, b) => a + b, 0) / entryPrices.length;

    const under60Entry = entryPrices.filter(p => p <= 0.60).length;
    const pct60Entry = ((under60Entry / entryPrices.length) * 100).toFixed(1);

    console.log(`Average Slippage:      ${avgSlippage.toFixed(2)}%`);
    console.log(`Avg Market Price:      ${avgPrice.toFixed(4)} (${(avgPrice * 100).toFixed(1)}¢)`);
    console.log(`Avg Entry Price:       ${avgEntry.toFixed(4)} (${(avgEntry * 100).toFixed(1)}¢)`);
    console.log(`Price Increase:        +${((avgEntry - avgPrice) * 100).toFixed(1)}¢ due to slippage`);
    console.log(`\n≤ 60¢ after slippage:  ${under60Entry}/${entryPrices.length} (${pct60Entry}%)`);

    // Recommendations
    console.log('\n═'.repeat(100));
    console.log('💡 RECOMMENDATIONS');
    console.log('═'.repeat(100));

    if (avgEntry <= 0.60) {
      console.log(`✅ YES! Average entry price is ${(avgEntry * 100).toFixed(1)}¢ - well under 60¢`);
      console.log(`   You can expect ${pct60Entry}% of trades to enter at ≤ 60¢`);
    } else if (avgEntry <= 0.70) {
      console.log(`⚠️  MIXED. Average entry price is ${(avgEntry * 100).toFixed(1)}¢ - above 60¢ but reasonable`);
      console.log(`   Only ${pct60Entry}% of trades enter at ≤ 60¢`);
      console.log(`   Consider: Lower max_entry_price to 0.65 for better risk/reward`);
    } else {
      console.log(`❌ NO. Average entry price is ${(avgEntry * 100).toFixed(1)}¢ - too expensive`);
      console.log(`   Only ${pct60Entry}% of trades enter at ≤ 60¢`);
      console.log(`   STRONGLY RECOMMEND: Lower max_entry_price to 0.65 or 0.60`);
    }

    console.log('\nCurrent Setting: max_entry_price = 0.75 (75¢)');
    if (avgEntry < 0.75) {
      const diff = ((0.75 - avgEntry) * 100).toFixed(1);
      console.log(`  → You have ${diff}¢ headroom. Consider lowering to ${(avgEntry + 0.05).toFixed(2)} for safety`);
    }

    console.log('='.repeat(100) + '\n');

    process.exit(0);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

analyzeEntryPrices();
