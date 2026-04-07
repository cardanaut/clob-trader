#!/usr/bin/env node

/**
 * Test Order Script
 * Places a test order to debug "Invalid order payload" errors
 * Trades whichever direction (UP/DOWN) has the highest price
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const logger = require('../utils/logger');
const gamma = require('./gamma-api');
const clobApi = require('./clob-api');
const clobHttp = require('./clob-http-client');

async function main() {
  try {
    logger.info('[test-order] ========================================');
    logger.info('[test-order] TESTING ORDER PLACEMENT');
    logger.info('[test-order] ========================================');

    // Initialize live trading client
    logger.info('[test-order] Initializing live trading client...');
    await clobApi.initializeLiveClient();
    logger.info('[test-order] ✓ Live client initialized');

    // 1. Get current active market (use XRP as example)
    const crypto = 'XRP';
    const slugPattern = 'xrp-updown-5m';

    logger.info('[test-order] Fetching active markets...', { crypto });
    const markets = await gamma.getActiveMarkets(crypto, slugPattern, 5);

    if (!markets || markets.length === 0) {
      logger.error('[test-order] No active markets found');
      process.exit(1);
    }

    const market = markets[0];
    logger.info('[test-order] Selected market', {
      slug: market.slug,
      question: market.question,
      endDate: market.endDate
    });

    // 2. Get UP and DOWN tokens
    const upToken = market.tokens.find(t => t.outcome === 'Up' || t.outcome === 'UP');
    const downToken = market.tokens.find(t => t.outcome === 'Down' || t.outcome === 'DOWN');

    if (!upToken || !downToken) {
      logger.error('[test-order] Missing tokens in market');
      process.exit(1);
    }

    logger.info('[test-order] Tokens found', {
      upTokenId: upToken.token_id.slice(0, 16) + '...',
      downTokenId: downToken.token_id.slice(0, 16) + '...'
    });

    // 3. Get current prices
    logger.info('[test-order] Fetching prices...');
    const pricesResponse = await clobHttp.getPrices([
      { token_id: upToken.token_id, side: 'BUY' },
      { token_id: downToken.token_id, side: 'BUY' }
    ]);

    const upPrice = parseFloat(pricesResponse?.[upToken.token_id]?.BUY || 0.5);
    const downPrice = parseFloat(pricesResponse?.[downToken.token_id]?.BUY || 0.5);

    logger.info('[test-order] Current prices', {
      upPrice: (upPrice * 100).toFixed(0) + '¢',
      downPrice: (downPrice * 100).toFixed(0) + '¢'
    });

    // 4. Choose direction with highest price
    let selectedToken, selectedPrice, direction;
    if (upPrice > downPrice) {
      selectedToken = upToken;
      selectedPrice = upPrice;
      direction = 'UP';
    } else {
      selectedToken = downToken;
      selectedPrice = downPrice;
      direction = 'DOWN';
    }

    logger.info('[test-order] Selected direction', {
      direction,
      price: (selectedPrice * 100).toFixed(0) + '¢',
      tokenId: selectedToken.token_id.slice(0, 16) + '...'
    });

    // 5. Place small test order ($1.00)
    const testAmount = 1.00; // $1 test order

    logger.info('[test-order] ========================================');
    logger.info('[test-order] ATTEMPTING ORDER PLACEMENT');
    logger.info('[test-order] ========================================');
    logger.info('[test-order] Order details', {
      tokenId: selectedToken.token_id,
      price: selectedPrice,
      amount: testAmount,
      side: 'BUY'
    });

    const orderResult = await clobApi.placeOrder(
      selectedToken.token_id,
      'BUY',          // side
      testAmount,     // amount in USDC
      selectedPrice   // price
    );

    logger.info('[test-order] ========================================');
    logger.info('[test-order] ✅ ORDER PLACED SUCCESSFULLY!');
    logger.info('[test-order] ========================================');
    logger.info('[test-order] Order result', {
      orderId: orderResult.orderID,
      success: orderResult.success
    });

  } catch (err) {
    logger.error('[test-order] ========================================');
    logger.error('[test-order] ❌ ORDER FAILED');
    logger.error('[test-order] ========================================');
    logger.error('[test-order] Error details', {
      message: err.message,
      stack: err.stack
    });

    // Try to extract detailed error info
    if (err.response) {
      logger.error('[test-order] HTTP Response', {
        status: err.response.status,
        statusText: err.response.statusText,
        data: JSON.stringify(err.response.data, null, 2)
      });
    }

    process.exit(1);
  }
}

main();
