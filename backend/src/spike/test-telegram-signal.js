#!/usr/bin/env node

/**
 * Test Telegram Signal Notification
 * Sends a sample manual trading signal to Telegram using real live market
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const telegram = require('./telegram');
const gamma = require('./gamma-api');
const logger = require('../utils/logger');

async function sendTestSignal() {
  logger.info('[test-telegram] Fetching real live market...');

  // Fetch real BTC market
  const markets = await gamma.getActiveMarkets('BTC', 'btc-updown-5m', 5);

  if (!markets || markets.length === 0) {
    logger.error('[test-telegram] No active markets found');
    process.exit(1);
  }

  const market = markets[0]; // Get current market
  logger.info('[test-telegram] Using market:', {
    slug: market.slug,
    question: market.question
  });

  logger.info('[test-telegram] Sending test signal notification...');

  // Sample signal data with real market
  const testSignal = {
    crypto: 'BTC',
    signalType: 'BUY_YES',  // UP direction
    signalMinute: 1,        // T2
    candleMovement: 0.37,   // 0.37% movement
    entryPrice: 0.52,       // 52 cents
    positionSize: 5.25,     // $5.25 position
    marketSlug: market.slug,
    marketQuestion: market.question,
    details: {
      currentCapital: 2000.00
    }
  };

  try {
    await telegram.notifyManualTradingSignal(testSignal);
    logger.info('[test-telegram] ✅ Test signal sent successfully!');
    logger.info('[test-telegram] Check your Telegram to verify the message');
  } catch (err) {
    logger.error('[test-telegram] ❌ Failed to send test signal', {
      error: err.message,
      stack: err.stack
    });
  }

  process.exit(0);
}

sendTestSignal();
