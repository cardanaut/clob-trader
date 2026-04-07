#!/usr/bin/env node

/**
 * SpikeTrading Main Entry Point
 * Supports both PAPER (simulated) and LIVE (real money) trading
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

// NOTE: Proxy is configured ONLY in clob-http-client.js for CLOB API calls
// We do NOT apply proxy globally - Gamma API, Binance, etc. use direct connections

const engine = require('./engine');
const reporter = require('./reporter');
const clobWebsocket = require('./clob-websocket');
const logger = require('../utils/logger');
const config = require('./config');

// Graceful shutdown
let isShuttingDown = false;

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('[spike] Shutting down gracefully...');
  clobWebsocket.stop();
  engine.stop();

  // Give time for final logs
  setTimeout(() => {
    logger.info('[spike] Shutdown complete');
    process.exit(0);
  }, 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Main
async function main() {
  const isLiveMode = config.TRADING_MODE === 'LIVE';

  logger.info('[spike] ===================================');
  if (isLiveMode) {
    logger.warn('[spike] 🔴 SpikeTrading - LIVE MODE 🔴');
    logger.warn('[spike] 🔴 REAL MONEY TRADING ENABLED 🔴');
  } else {
    logger.info('[spike] SpikeTrading Paper Trading Bot');
  }
  logger.info('[spike] ===================================');
  logger.info('[spike] Mode: ' + config.TRADING_MODE);
  logger.info('[spike] Min candle range: ' + config.MIN_CANDLE_RANGE_PCT + '%');
  logger.info('[spike] Entry window: T+' + config.MIN_ENTRY_MINUTE + ' to T+' + config.MAX_ENTRY_MINUTE);

  if (isLiveMode) {
    logger.warn('[spike] Max entry price: $' + config.MAX_ENTRY_PRICE.toFixed(2));
    logger.warn('[spike] Position size: ' + config.POSITION_SIZE_PCT + '% of balance');
    logger.warn('[spike] Min balance stop: $' + config.LIVE_TRADING.MIN_BALANCE_USDC);
    logger.warn('[spike] Max open positions: ' + config.LIVE_TRADING.MAX_OPEN_POSITIONS);
    logger.warn('[spike] ⚠️  YOU CAN LOSE 100% OF YOUR CAPITAL ⚠️');
  }
  logger.info('[spike] ===================================');

  // Handle CLI commands
  const command = process.argv[2];

  if (command === 'report') {
    const days = parseInt(process.argv[3]) || null;
    await reporter.printReport(days);
    process.exit(0);
  }

  if (command === 'test') {
    logger.info('[spike] Testing Binance connection...');
    const binanceStream = require('./binance-stream');
    binanceStream.connect();
    binanceStream.onCandle((candle) => {
      if (candle.isClosed) {
        const rangePct = Math.abs((candle.close - candle.open) / candle.open * 100);
        logger.info('[spike-test] Candle received', {
          timestamp: candle.timestamp.toISOString(),
          open: candle.open,
          close: candle.close,
          rangePct: rangePct.toFixed(3)
        });
      }
    });
    logger.info('[spike] Listening for candles... (Ctrl+C to stop)');
    return;
  }

  // Default: start services
  logger.info('[spike] Starting WebSocket price stream (real-time orderbook)...');
  clobWebsocket.start();

  logger.info('[spike] Starting trading engine...');
  await engine.start();

  logger.info('[spike] Engine is running. Press Ctrl+C to stop.');
  logger.info('[spike] To view report: node src/spike/index.js report [days]');
}

main().catch(err => {
  logger.error('[spike] Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
