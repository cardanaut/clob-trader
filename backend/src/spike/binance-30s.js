/**
 * Binance 30-Second Candle Aggregator
 * Builds 30-second OHLC candles from real-time trade stream
 * For T123-30SEC strategy
 */

'use strict';

const WebSocket = require('ws');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class Binance30sAggregator extends EventEmitter {
  constructor(symbol) {
    super();
    this.symbol = symbol;
    this.pair = symbol + 'USDT';
    this.ws = null;
    this.currentCandle = null;
    this.candleStartTime = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  /**
   * Connect to Binance trade stream
   */
  connect() {
    const wsUrl = `wss://stream.binance.com:9443/ws/${this.pair.toLowerCase()}@trade`;

    logger.info(`[spike-binance-30s] Connecting to ${this.symbol} trade stream...`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      logger.info(`[spike-binance-30s] ${this.symbol} connected`);
      this.reconnectAttempts = 0;
      this.resetCandle();
    });

    this.ws.on('message', (data) => {
      try {
        const trade = JSON.parse(data);
        this.processTrade(trade);
      } catch (err) {
        logger.error(`[spike-binance-30s] ${this.symbol} parse error`, { error: err.message });
      }
    });

    this.ws.on('error', (err) => {
      logger.error(`[spike-binance-30s] ${this.symbol} WebSocket error`, { error: err.message });
    });

    this.ws.on('close', () => {
      logger.warn(`[spike-binance-30s] ${this.symbol} disconnected`);
      this.reconnect();
    });
  }

  /**
   * Process individual trade
   */
  processTrade(trade) {
    const price = parseFloat(trade.p);
    const timestamp = trade.T;
    const time = new Date(timestamp);

    // Determine which 30-second window this trade belongs to
    const seconds = time.getSeconds();
    const windowStart = seconds < 30 ? 0 : 30;

    // Calculate candle start time (aligned to 00 or 30 seconds)
    const candleStart = new Date(time);
    candleStart.setSeconds(windowStart, 0);
    const candleStartMs = candleStart.getTime();

    // Check if we need to start a new candle
    if (!this.candleStartTime || candleStartMs !== this.candleStartTime) {
      // Emit completed candle if exists
      if (this.currentCandle && this.currentCandle.close !== null) {
        this.emitCandle();
      }

      // Start new candle
      this.candleStartTime = candleStartMs;
      this.currentCandle = {
        timestamp: candleStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        trades: 0
      };
    }

    // Update current candle
    if (this.currentCandle) {
      this.currentCandle.high = Math.max(this.currentCandle.high, price);
      this.currentCandle.low = Math.min(this.currentCandle.low, price);
      this.currentCandle.close = price;
      this.currentCandle.volume += parseFloat(trade.q);
      this.currentCandle.trades++;
    }
  }

  /**
   * Emit completed candle
   */
  emitCandle() {
    if (!this.currentCandle) return;

    const candle = {
      symbol: this.symbol,
      timestamp: this.currentCandle.timestamp,
      open: this.currentCandle.open,
      high: this.currentCandle.high,
      low: this.currentCandle.low,
      close: this.currentCandle.close,
      volume: this.currentCandle.volume,
      trades: this.currentCandle.trades,
      interval: '30s'
    };

    logger.debug(`[spike-binance-30s] ${this.symbol} candle`, {
      time: candle.timestamp.toISOString(),
      close: candle.close.toFixed(2),
      range: ((Math.abs(candle.close - candle.open) / candle.open) * 100).toFixed(3) + '%',
      trades: candle.trades
    });

    this.emit('candle', candle);
  }

  /**
   * Reset candle
   */
  resetCandle() {
    this.currentCandle = null;
    this.candleStartTime = null;
  }

  /**
   * Reconnect with exponential backoff
   */
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`[spike-binance-30s] ${this.symbol} max reconnect attempts reached`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    logger.info(`[spike-binance-30s] ${this.symbol} reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.ws) {
      logger.info(`[spike-binance-30s] ${this.symbol} disconnecting`);
      this.ws.close();
      this.ws = null;
    }
    this.resetCandle();
  }

  /**
   * Get current partial candle (for debugging)
   */
  getCurrentCandle() {
    return this.currentCandle;
  }
}

module.exports = Binance30sAggregator;
