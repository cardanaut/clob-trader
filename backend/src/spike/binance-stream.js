/**
 * Binance WebSocket Stream for multi-crypto 1-minute candles
 * Supports BTC, ETH, SOL, XRP
 */

'use strict';

const WebSocket = require('ws');
const logger = require('../utils/logger');
const config = require('./config');

class BinanceStream {
  constructor() {
    this.connections = {}; // { 'BTC': { ws, reconnectTimeout, retryCount }, ... }
    this.handlers = [];
    this.isConnected = false;
    this.MAX_RETRIES = 10; // Max reconnection attempts before giving up
  }

  /**
   * Connect to Binance WebSocket streams for all supported cryptos
   */
  connect() {
    logger.info('[spike-binance] Connecting to Binance WebSocket streams...');

    // Connect to each crypto's stream
    config.SUPPORTED_CRYPTOS.forEach(crypto => {
      this.connectCrypto(crypto);
    });

    this.isConnected = true;
  }

  /**
   * Connect to a single crypto's WebSocket stream
   * @param {Object} crypto - Crypto config { symbol, binancePair }
   */
  connectCrypto(crypto) {
    const existing = this.connections[crypto.symbol];
    if (existing && existing.ws) {
      logger.warn(`[spike-binance] ${crypto.symbol} already connected`);
      return;
    }

    const streamUrl = `${config.BINANCE_WS_BASE}/${crypto.binancePair.toLowerCase()}@kline_1m`;
    const retryCount = existing?.retryCount || 0;

    logger.info(`[spike-binance] Connecting to ${crypto.symbol}:`, streamUrl, retryCount > 0 ? `(retry ${retryCount})` : '');

    let ws;
    try {
      ws = new WebSocket(streamUrl);
    } catch (err) {
      logger.error(`[spike-binance] Failed to create WebSocket for ${crypto.symbol}`, { error: err.message });
      this.scheduleReconnect(crypto, retryCount);
      return;
    }

    ws.on('open', () => {
      logger.info(`[spike-binance] ${crypto.symbol} connected`);
      // Reset retry count on successful connection
      if (this.connections[crypto.symbol]) {
        this.connections[crypto.symbol].retryCount = 0;
      }
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.e === 'kline') {
          const kline = msg.k;

          // Parse and validate numeric values
          const open = parseFloat(kline.o);
          const high = parseFloat(kline.h);
          const low = parseFloat(kline.l);
          const close = parseFloat(kline.c);
          const volume = parseFloat(kline.v);

          // Validate all values are valid numbers
          if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
            logger.error(`[spike-binance] ${crypto.symbol} invalid candle data - NaN values`, { kline });
            return;
          }

          const candle = {
            crypto_symbol: crypto.symbol, // Tag with crypto symbol
            timestamp: new Date(kline.t),
            open,
            high,
            low,
            close,
            volume,
            isClosed: kline.x, // true when candle is finalized
          };

          // Emit to all registered handlers
          this.handlers.forEach(handler => handler(candle));

          if (config.LOG_ALL_CANDLES && candle.isClosed) {
            const movementPct = Math.abs((candle.close - candle.open) / candle.open * 100);
            logger.info(`[spike-binance] ${crypto.symbol} candle closed`, {
              timestamp: candle.timestamp.toISOString(),
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              movementPct: movementPct.toFixed(3)
            });
          }
        }
      } catch (err) {
        logger.error(`[spike-binance] ${crypto.symbol} error parsing message`, { error: err.message });
      }
    });

    ws.on('error', (err) => {
      logger.error(`[spike-binance] ${crypto.symbol} WebSocket error`, { error: err.message });
    });

    ws.on('close', () => {
      logger.warn(`[spike-binance] ${crypto.symbol} disconnected`);

      // CRITICAL: Clear any existing reconnection timeout to prevent memory leak
      const existingConn = this.connections[crypto.symbol];
      if (existingConn && existingConn.reconnectTimeout) {
        clearTimeout(existingConn.reconnectTimeout);
      }

      const retryCount = existingConn?.retryCount || 0;
      delete this.connections[crypto.symbol];

      // Schedule reconnection with backoff
      this.scheduleReconnect(crypto, retryCount);
    });

    this.connections[crypto.symbol] = { ws, reconnectTimeout: null, retryCount: 0 };
  }

  /**
   * Schedule reconnection with exponential backoff
   * @param {Object} crypto - Crypto config
   * @param {number} retryCount - Current retry count
   */
  scheduleReconnect(crypto, retryCount) {
    if (retryCount >= this.MAX_RETRIES) {
      logger.error(`[spike-binance] ${crypto.symbol} max retries reached (${this.MAX_RETRIES}), giving up`);
      return;
    }

    // Exponential backoff: 5s, 10s, 20s, 40s, ..., max 5 minutes
    const baseDelay = 5000;
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), 300000);

    logger.info(`[spike-binance] ${crypto.symbol} reconnecting in ${delay / 1000}s (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);

    const reconnectTimeout = setTimeout(() => {
      try {
        this.connectCrypto(crypto);
      } catch (err) {
        logger.error(`[spike-binance] ${crypto.symbol} reconnection failed`, { error: err.message });
        // Clear connection entry if reconnection fails
        if (this.connections[crypto.symbol]) {
          clearTimeout(this.connections[crypto.symbol].reconnectTimeout);
          delete this.connections[crypto.symbol];
        }
      }
    }, delay);

    this.connections[crypto.symbol] = { ws: null, reconnectTimeout, retryCount: retryCount + 1 };
  }

  /**
   * Register a handler for candle updates
   * @param {Function} handler - Callback(candle)
   */
  onCandle(handler) {
    this.handlers.push(handler);
  }

  /**
   * Disconnect all WebSocket connections
   */
  disconnect() {
    Object.keys(this.connections).forEach(symbol => {
      const conn = this.connections[symbol];
      if (conn.reconnectTimeout) {
        clearTimeout(conn.reconnectTimeout);
      }
      if (conn.ws) {
        conn.ws.close();
      }
    });
    this.connections = {};
    this.isConnected = false;
    logger.info('[spike-binance] All connections disconnected');
  }
}

module.exports = new BinanceStream();
