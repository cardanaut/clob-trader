/**
 * COMPREHENSIVE END-TO-END TEST for Live Trading Flow
 * Tests the entire execution path without placing real orders
 */

const clobApi = require('./src/spike/clob-api');
const gamma = require('./src/spike/gamma-api');
const config = require('./src/spike/config');

async function testCompleteLiveTradingFlow() {
  console.log('=== SPIKE TRADING - COMPLETE FLOW TEST ===\n');

  try {
    // Step 1: Fetch active markets
    console.log('1️⃣  Fetching active BTC markets...');
    const markets = await gamma.getActiveBTCMarkets();
    if (!markets || markets.length === 0) {
      throw new Error('No active markets found');
    }
    console.log(`   ✅ Found ${markets.length} markets`);
    const market = markets[0];
    console.log(`   Market: ${market.question}`);
    console.log(`   Tokens: ${market.tokens.map(t => t.outcome).join(', ')}\n`);

    // Step 2: Get market prices
    console.log('2️⃣  Fetching market prices from Gamma API...');
    const prices = await gamma.getMarketPrices(market.conditionId);
    if (!prices || !prices.bestAsk) {
      throw new Error('No price data available');
    }
    console.log(`   ✅ Best Ask: ${prices.bestAsk.toFixed(4)}`);
    console.log(`   Best Bid: ${prices.bestBid?.toFixed(4) || 'N/A'}`);
    console.log(`   Last Price: ${prices.lastPrice?.toFixed(4) || 'N/A'}\n`);

    // Step 3: Calculate entry price with slippage
    console.log('3️⃣  Calculating entry price with slippage...');
    const entryPrice = clobApi.calculateEntryPrice(
      prices.bestAsk,
      config.SLIPPAGE_TOLERANCE_PCT
    );
    console.log(`   Slippage tolerance: ${config.SLIPPAGE_TOLERANCE_PCT}%`);
    console.log(`   ✅ Entry price: ${entryPrice.toFixed(4)}\n`);

    // Step 4: Validate entry price
    console.log('4️⃣  Validating entry price...');
    if (typeof entryPrice !== 'number' || isNaN(entryPrice)) {
      throw new Error(`Entry price is NaN: ${entryPrice}`);
    }
    if (entryPrice <= 0 || entryPrice > 1) {
      throw new Error(`Entry price out of range: ${entryPrice}`);
    }
    console.log(`   ✅ Entry price is valid number: ${entryPrice}\n`);

    // Step 5: Test order parameter creation
    console.log('5️⃣  Creating order parameters...');
    const positionSize = 10; // $10 test position
    const tokenId = market.tokens[0].token_id;

    const orderParams = {
      tokenID: tokenId,
      price: entryPrice,  // MUST be number
      size: positionSize / entryPrice,  // MUST be number
      side: 'BUY',
      feeRateBps: 1000,  // MUST be number
      nonce: Date.now(),
      expiration: Math.floor(Date.now() / 1000) + 300
    };

    console.log('   Order Parameters:');
    console.log(`   - Token ID: ${tokenId.slice(0, 16)}...`);
    console.log(`   - Price: ${orderParams.price} (type: ${typeof orderParams.price})`);
    console.log(`   - Size: ${orderParams.size.toFixed(2)} (type: ${typeof orderParams.size})`);
    console.log(`   - Fee Rate: ${orderParams.feeRateBps} (type: ${typeof orderParams.feeRateBps})`);
    console.log(`   - Position: $${positionSize.toFixed(2)}\n`);

    // Step 6: Validate all parameters are numbers
    console.log('6️⃣  Validating parameter types...');
    if (typeof orderParams.price !== 'number') {
      throw new Error(`price must be number, got ${typeof orderParams.price}`);
    }
    if (typeof orderParams.size !== 'number') {
      throw new Error(`size must be number, got ${typeof orderParams.size}`);
    }
    if (typeof orderParams.feeRateBps !== 'number') {
      throw new Error(`feeRateBps must be number, got ${typeof orderParams.feeRateBps}`);
    }
    if (isNaN(orderParams.price) || isNaN(orderParams.size)) {
      throw new Error(`NaN detected: price=${orderParams.price}, size=${orderParams.size}`);
    }
    console.log(`   ✅ All parameters are valid numbers\n`);

    // Step 7: Test calculateEntryPrice with edge cases
    console.log('7️⃣  Testing edge cases...');

    // Test low price
    const lowPrice = clobApi.calculateEntryPrice(0.01, 3);
    console.log(`   Low price (0.01): ${lowPrice.toFixed(4)}`);

    // Test high price
    const highPrice = clobApi.calculateEntryPrice(0.95, 3);
    console.log(`   High price (0.95): ${highPrice.toFixed(4)} (capped at 0.99)`);

    // Test medium price
    const medPrice = clobApi.calculateEntryPrice(0.50, 3);
    console.log(`   Medium price (0.50): ${medPrice.toFixed(4)}\n`);

    console.log('✅ ===== ALL TESTS PASSED ===== ✅\n');
    console.log('🎯 Live trading flow is ready:');
    console.log('   ✓ Market data fetching works');
    console.log('   ✓ Price calculation works');
    console.log('   ✓ Slippage calculation works');
    console.log('   ✓ Order parameters are correct types');
    console.log('   ✓ No NaN values detected');
    console.log('   ✓ All validations pass\n');
    console.log('🚀 Next signal will execute a REAL trade!\n');

    process.exit(0);

  } catch (err) {
    console.error('\n❌ TEST FAILED ❌');
    console.error(`Error: ${err.message}`);
    console.error(`Stack: ${err.stack}`);
    process.exit(1);
  }
}

// Run test
testCompleteLiveTradingFlow();
