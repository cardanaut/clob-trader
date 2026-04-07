#!/usr/bin/env node

/**
 * Test Balance Check
 * Checks if the wallet has USDC balance
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const logger = require('../utils/logger');
const clobApi = require('./clob-api');

async function main() {
  try {
    logger.info('[test-balance] Initializing live trading client...');
    await clobApi.initializeLiveClient();

    logger.info('[test-balance] Fetching balance...');
    const balance = await clobApi.getBalance();

    logger.info('[test-balance] ========================================');
    logger.info('[test-balance] BALANCE RESULT');
    logger.info('[test-balance] ========================================');
    logger.info('[test-balance] Balance:', balance);

  } catch (err) {
    logger.error('[test-balance] ========================================');
    logger.error('[test-balance] ❌ FAILED');
    logger.error('[test-balance] ========================================');
    logger.error('[test-balance] Error:', {
      message: err.message,
      stack: err.stack
    });
    process.exit(1);
  }
}

main();
