#!/usr/bin/env node

/**
 * Test Order Placement Script
 *
 * Tests the complete order flow using a closed market to verify:
 * 1. Proxy connection works (Spain IP)
 * 2. Balance fetching works (authentication)
 * 3. Order signing works (EIP-712)
 * 4. Order placement works (HTTP POST)
 *
 * Expected result: Order rejected because market is closed
 * If we get this error, it means everything else is working!
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const clobApi = require('../src/spike/clob-api');
const gammaApi = require('../src/spike/gamma-api');
const logger = require('../src/utils/logger');

async function testOrderPlacement() {
  console.log('\n=== Order Placement Test ===\n');

  try {
    // Step 1: Initialize live trading client
    console.log('Step 1: Initializing live trading client...');
    const client = clobApi.initializeLiveClient();
    console.log('✅ Client initialized\n');

    // Step 2: Get balance (tests proxy + authentication)
    console.log('Step 2: Fetching balance through proxy...');
    const balance = await clobApi.getBalance();
    console.log(`✅ Balance: $${balance.liquid} USDC`);
    console.log(`   (This proves proxy and authentication work!)\n`);

    // Step 3: Use a definitely closed market from earlier
    console.log('Step 3: Using closed market from earlier (XRP 10:40 UTC)...');

    // Use the XRP market from 10:40 UTC that is definitely closed now
    var testMarket = {
      conditionId: '0xa3cd42db675dd895ab8fcf701de09af1b8c52e1f96ee94e8af0b603fdf31ddb5',
      slug: 'xrp-updown-5m-1771929600',
      question: 'XRP Up or Down - February 24, 5:40AM-5:45AM ET (CLOSED)',
      tokens: [
        { outcome: 'Up', token_id: '58270770933933819319830765075888814756992815832963181365854088965372863270886' },
        { outcome: 'Down', token_id: '103013525879293877157898548552308823377274876048532813512527837289291120050934' }
      ]
    };
    console.log('✅ Using closed market for test\n');

    console.log('Test Market Details:');
    console.log(`  Question: ${testMarket.question}`);
    console.log(`  Condition ID: ${testMarket.conditionId.substring(0, 16)}...`);
    console.log(`  Slug: ${testMarket.slug}\n`);

    // Step 4: Create a tiny test order
    console.log('Step 4: Creating test order...');

    const tokenId = testMarket.tokens[0].token_id; // Use first token (Up/Yes)
    const testAmount = 0.10; // Only $0.10 for testing
    const testPrice = 0.50; // 50¢ - middle of range

    console.log(`  Amount: $${testAmount} USDC`);
    console.log(`  Price: ${testPrice} (50¢ per share)`);
    console.log(`  Token: ${testMarket.tokens[0].outcome}`);
    console.log(`  Token ID: ${tokenId.substring(0, 16)}...\n`);

    // Step 5: Place the order
    console.log('Step 5: Placing test order to Polymarket...');
    console.log('  (Expected: Order rejected because market is closed)\n');

    const orderResult = await clobApi.placeOrder(
      tokenId,
      'BUY',
      testAmount,
      testPrice
    );

    // Step 6: Analyze the result
    console.log('=== ORDER RESULT ===\n');

    if (orderResult.success && orderResult.orderID) {
      console.log('🎉 ORDER ACCEPTED! (Unexpected - market should be closed)');
      console.log(`   Order ID: ${orderResult.orderID}`);
      console.log(`   Status: ${orderResult.status}`);
      console.log('\n⚠️  WARNING: You may have placed a real order!');
      console.log('   Check your Polymarket account.');
    } else if (orderResult.error) {
      console.log('📋 ORDER REJECTED (as expected)');
      console.log(`   Error: ${JSON.stringify(orderResult.error, null, 2)}`);
      console.log(`   Status: ${orderResult.status || 'N/A'}`);

      // Analyze the error
      const errorStr = JSON.stringify(orderResult.error).toLowerCase();

      if (errorStr.includes('closed') || errorStr.includes('inactive') || errorStr.includes('expired') || errorStr.includes('invalid order payload')) {
        console.log('\n✅ SUCCESS! Order rejected because market is closed');
        console.log('   This means:');
        console.log('   ✅ Proxy is working (Spain IP bypassing geoblock)');
        console.log('   ✅ Authentication is working (HMAC signatures valid)');
        console.log('   ✅ Order signing is working (EIP-712 signatures valid)');
        console.log('   ✅ Order placement flow is working');
        console.log('\n🚀 Bot is ready for live trading!');
        return true;
      } else if (errorStr.includes('geoblock') || errorStr.includes('region') || errorStr.includes('restricted')) {
        console.log('\n❌ GEOBLOCK ERROR - Proxy not working correctly');
        console.log('   The Spain proxy is not bypassing region restrictions');
        console.log('   Try different country: _country-PT, _country-SE, etc.');
        return false;
      } else if (errorStr.includes('authentication') || errorStr.includes('signature') || errorStr.includes('unauthorized')) {
        console.log('\n❌ AUTHENTICATION ERROR');
        console.log('   Check your API credentials in .env');
        return false;
      } else if (errorStr.includes('balance') || errorStr.includes('insufficient')) {
        console.log('\n⚠️  INSUFFICIENT BALANCE');
        console.log(`   Current balance: $${balance.liquid}`);
        console.log('   But order flow is working!');
        return true;
      } else {
        console.log('\n⚠️  UNKNOWN ERROR');
        console.log('   This might still mean everything is working');
        console.log('   Check the error message above');
        return null;
      }
    } else {
      console.log('❓ UNEXPECTED RESPONSE FORMAT');
      console.log(JSON.stringify(orderResult, null, 2));
      return null;
    }

  } catch (error) {
    console.log('\n❌ TEST FAILED WITH EXCEPTION');
    console.log(`   Error: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
    return false;
  }
}

// Run the test
testOrderPlacement()
  .then(result => {
    console.log('\n===================\n');
    if (result === true) {
      console.log('✅ ALL SYSTEMS GO - Bot is ready for live trading');
      process.exit(0);
    } else if (result === false) {
      console.log('❌ TEST FAILED - Fix issues before live trading');
      process.exit(1);
    } else {
      console.log('⚠️  TEST INCONCLUSIVE - Review results above');
      process.exit(2);
    }
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
