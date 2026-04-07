#!/usr/bin/env node
/**
 * Set Allowance - Approve Polymarket contract to spend USDC
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const logger = require('../utils/logger');
const clobApi = require('./clob-api');

async function main() {
  try {
    logger.info('[set-allowance] Initializing live trading client...');
    await clobApi.initializeLiveClient();

    const liveClient = clobApi.liveClient;

    if (!liveClient) {
      throw new Error('Live client not initialized');
    }

    logger.info('[set-allowance] ========================================');
    logger.info('[set-allowance] SETTING TOKEN ALLOWANCE');
    logger.info('[set-allowance] ========================================');
    logger.info('[set-allowance] This will approve the Polymarket trading contract to spend your USDC');
    logger.info('[set-allowance] This requires an on-chain transaction (gas fee)');
    logger.info('[set-allowance] ');

    // Set allowance for USDC (COLLATERAL)
    logger.info('[set-allowance] Calling setAllowance()...');
    const result = await liveClient.setAllowance();

    logger.info('[set-allowance] ========================================');
    logger.info('[set-allowance] ✅ ALLOWANCE SET SUCCESSFULLY');
    logger.info('[set-allowance] ========================================');
    logger.info('[set-allowance] Result:', JSON.stringify(result, null, 2));

    // Now check the new allowance
    logger.info('[set-allowance] ');
    logger.info('[set-allowance] Checking new allowance...');
    const balance = await liveClient.getBalanceAllowance('COLLATERAL');

    if (balance) {
      const balanceUSDC = parseFloat(balance.balance || 0) / 1e6;
      const allowanceUSDC = parseFloat(balance.allowance || 0) / 1e6;

      logger.info('[set-allowance] Balance: $' + balanceUSDC.toFixed(2));
      logger.info('[set-allowance] Allowance: $' + allowanceUSDC.toFixed(2));
    }

  } catch (err) {
    logger.error('[set-allowance] ========================================');
    logger.error('[set-allowance] ❌ FAILED');
    logger.error('[set-allowance] ========================================');
    logger.error('[set-allowance] Error:', {
      message: err.message,
      stack: err.stack
    });
    process.exit(1);
  }
}

main();
