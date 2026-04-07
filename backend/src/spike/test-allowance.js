#!/usr/bin/env node
/**
 * Test Allowance Check
 * Checks if trading contract has allowance to spend USDC
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const logger = require('../utils/logger');
const clobApi = require('./clob-api');

async function main() {
  try {
    logger.info('[test-allowance] Initializing live trading client...');
    await clobApi.initializeLiveClient();

    logger.info('[test-allowance] Checking balance AND allowance...');

    // The SDK has a method to check both balance and allowance
    const liveClient = clobApi.liveClient;

    if (!liveClient) {
      throw new Error('Live client not initialized');
    }

    // Try to get balance and allowance
    logger.info('[test-allowance] Calling getBalanceAllowance...');
    const result = await liveClient.getBalanceAllowance('COLLATERAL');

    logger.info('[test-allowance] ========================================');
    logger.info('[test-allowance] BALANCE & ALLOWANCE RESULT');
    logger.info('[test-allowance] ========================================');
    logger.info('[test-allowance] Full response:', JSON.stringify(result, null, 2));

    if (result) {
      const balance = parseFloat(result.balance || 0) / 1e6;
      const allowance = parseFloat(result.allowance || 0) / 1e6;

      logger.info('[test-allowance] ========================================');
      logger.info('[test-allowance] Balance: $' + balance.toFixed(2));
      logger.info('[test-allowance] Allowance: $' + allowance.toFixed(2));
      logger.info('[test-allowance] ========================================');

      if (allowance === 0) {
        logger.warn('[test-allowance] ⚠️  ALLOWANCE IS ZERO!');
        logger.warn('[test-allowance] You need to approve the trading contract to spend your USDC');
        logger.warn('[test-allowance] Try calling: liveClient.setAllowance()');
      } else if (allowance < balance) {
        logger.warn('[test-allowance] ⚠️  ALLOWANCE IS LOW!');
        logger.warn('[test-allowance] Allowance ($' + allowance.toFixed(2) + ') is less than balance ($' + balance.toFixed(2) + ')');
      } else {
        logger.info('[test-allowance] ✅ Allowance is sufficient!');
      }
    }

  } catch (err) {
    logger.error('[test-allowance] ========================================');
    logger.error('[test-allowance] ❌ FAILED');
    logger.error('[test-allowance] ========================================');
    logger.error('[test-allowance] Error:', {
      message: err.message,
      stack: err.stack
    });
    process.exit(1);
  }
}

main();
