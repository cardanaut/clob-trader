/**
 * 30-Second Candle Builder for Backtesting
 * Fetches historical trades from Binance and builds 30-second OHLC candles
 */

'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Fetch historical trades from Binance
 * @param {String} symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param {Number} startTime - Start timestamp (ms)
 * @param {Number} endTime - End timestamp (ms)
 * @returns {Array} Array of trades
 */
async function fetchHistoricalTrades(symbol, startTime, endTime) {
  try {
    const params = {
      symbol,
      startTime,
      endTime,
      limit: 1000 // Max per request
    };

    const res = await axios.get('https://api.binance.com/api/v3/aggTrades', {
      params,
      timeout: 30000
    });

    if (!Array.isArray(res.data)) {
      throw new Error('Invalid response from Binance trades API');
    }

    return res.data.map(t => ({
      price: parseFloat(t.p),
      quantity: parseFloat(t.q),
      timestamp: t.T,
      time: new Date(t.T)
    }));
  } catch (err) {
    logger.error('[backtest-30s] Error fetching historical trades', {
      symbol,
      error: err.message
    });
    throw err;
  }
}

/**
 * Fetch all trades for a time range (paginate if needed)
 * @param {String} symbol - Trading pair symbol
 * @param {Number} startTime - Start timestamp (ms)
 * @param {Number} endTime - End timestamp (ms)
 * @returns {Array} All trades in range
 */
async function fetchAllTrades(symbol, startTime, endTime) {
  const allTrades = [];
  let currentStart = startTime;
  const maxIterations = 500; // Increased from 100 to get more data (up to ~500k trades)
  let iteration = 0;

  logger.info('[backtest-30s] Fetching historical trades', {
    symbol,
    from: new Date(startTime).toISOString(),
    to: new Date(endTime).toISOString()
  });

  while (currentStart < endTime && iteration < maxIterations) {
    const trades = await fetchHistoricalTrades(symbol, currentStart, endTime);

    if (!trades || trades.length === 0) {
      break;
    }

    allTrades.push(...trades);

    // Set next start time to last trade timestamp + 1
    currentStart = trades[trades.length - 1].timestamp + 1;

    logger.debug('[backtest-30s] Fetched trade batch', {
      count: trades.length,
      total: allTrades.length
    });

    // Rate limit: wait 200ms between requests
    await new Promise(resolve => setTimeout(resolve, 200));

    // If we got less than 1000, we've reached the end
    if (trades.length < 1000) {
      break;
    }

    iteration++;
  }

  logger.info('[backtest-30s] Finished fetching trades', {
    symbol,
    total: allTrades.length,
    from: allTrades[0]?.time.toISOString(),
    to: allTrades[allTrades.length - 1]?.time.toISOString()
  });

  return allTrades;
}

/**
 * Build 30-second candles from trades
 * @param {Array} trades - Array of trades (sorted by timestamp ASC)
 * @returns {Array} Array of 30-second candles
 */
function buildCandlesFromTrades(trades) {
  if (trades.length === 0) return [];

  const candles = [];
  let currentCandle = null;
  let candleStartTime = null;

  for (const trade of trades) {
    const time = trade.time;
    const seconds = time.getSeconds();
    const windowStart = seconds < 30 ? 0 : 30;

    // Calculate candle start time (aligned to 00 or 30 seconds)
    const candleStart = new Date(time);
    candleStart.setSeconds(windowStart, 0);
    const candleStartMs = candleStart.getTime();

    // Check if we need to start a new candle
    if (!candleStartTime || candleStartMs !== candleStartTime) {
      // Save completed candle
      if (currentCandle && currentCandle.close !== null) {
        // Calculate movement %
        currentCandle.movementPct = Math.abs((currentCandle.close - currentCandle.open) / currentCandle.open * 100);
        candles.push(currentCandle);
      }

      // Start new candle
      candleStartTime = candleStartMs;
      currentCandle = {
        timestamp: candleStart,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.quantity,
        trades: 1,
        interval: '30s'
      };
    } else {
      // Update current candle
      if (currentCandle) {
        currentCandle.high = Math.max(currentCandle.high, trade.price);
        currentCandle.low = Math.min(currentCandle.low, trade.price);
        currentCandle.close = trade.price;
        currentCandle.volume += trade.quantity;
        currentCandle.trades++;
      }
    }
  }

  // Add final candle
  if (currentCandle && currentCandle.close !== null) {
    currentCandle.movementPct = Math.abs((currentCandle.close - currentCandle.open) / currentCandle.open * 100);
    candles.push(currentCandle);
  }

  return candles;
}

/**
 * Get cache file path
 */
function getCachePath(symbol, maxCandles) {
  const path = require('path');
  const cacheDir = path.join(__dirname, '../../cache');
  return path.join(cacheDir, `candles-30s-${symbol}-${maxCandles}.json`);
}

/**
 * Load candles from cache
 */
function loadFromCache(symbol, maxCandles) {
  const fs = require('fs');
  const cachePath = getCachePath(symbol, maxCandles);

  try {
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

    // Convert timestamp strings back to Date objects
    const candles = cacheData.candles.map(c => ({
      ...c,
      timestamp: new Date(c.timestamp)
    }));

    logger.info('[backtest-30s] Loaded 30-second candles from cache', {
      symbol,
      totalCandles: candles.length,
      cachedAt: cacheData.cachedAt,
      ageHours: ((Date.now() - new Date(cacheData.cachedAt).getTime()) / (1000 * 60 * 60)).toFixed(1)
    });

    return candles;
  } catch (err) {
    logger.warn('[backtest-30s] Failed to load cache', { error: err.message });
    return null;
  }
}

/**
 * Save candles to cache
 */
function saveToCache(symbol, maxCandles, candles) {
  const fs = require('fs');
  const cachePath = getCachePath(symbol, maxCandles);

  try {
    const cacheData = {
      symbol,
      maxCandles,
      candles,
      cachedAt: new Date().toISOString(),
      totalCandles: candles.length,
      from: candles[0]?.timestamp.toISOString(),
      to: candles[candles.length - 1]?.timestamp.toISOString()
    };

    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));

    logger.info('[backtest-30s] Saved 30-second candles to cache', {
      symbol,
      totalCandles: candles.length,
      cachePath
    });
  } catch (err) {
    logger.warn('[backtest-30s] Failed to save cache', { error: err.message });
  }
}

/**
 * Clear cache for a symbol
 */
function clearCache(symbol = null, maxCandles = null) {
  const fs = require('fs');
  const path = require('path');
  const cacheDir = path.join(__dirname, '../../cache');

  try {
    if (!fs.existsSync(cacheDir)) {
      return { cleared: 0 };
    }

    const files = fs.readdirSync(cacheDir);
    let cleared = 0;

    for (const file of files) {
      // Filter by symbol and maxCandles if provided
      if (symbol && !file.includes(symbol)) continue;
      if (maxCandles && !file.includes(`-${maxCandles}.json`)) continue;

      fs.unlinkSync(path.join(cacheDir, file));
      cleared++;
      logger.info('[backtest-30s] Cleared cache file', { file });
    }

    logger.info('[backtest-30s] Cache cleared', { filesCleared: cleared });
    return { cleared };
  } catch (err) {
    logger.error('[backtest-30s] Failed to clear cache', { error: err.message });
    throw err;
  }
}

/**
 * Fetch 30-second candles for a time range
 * @param {String} symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param {Number} maxCandles - Maximum number of 30-second candles to return
 * @param {Boolean} useCache - Whether to use cached data (default: true)
 * @returns {Array} Array of 30-second candles
 */
async function fetch30sCandles(symbol = 'BTCUSDT', maxCandles = 20000, useCache = true) {
  // Try to load from cache first
  if (useCache) {
    const cached = loadFromCache(symbol, maxCandles);
    if (cached) {
      return cached;
    }
  }

  logger.info('[backtest-30s] Cache miss, fetching fresh data from Binance...');

  // Calculate time range (30-sec candles, so 2 per minute)
  // 20,000 candles = ~10,000 minutes = ~7 days
  const endTime = Date.now();
  const startTime = endTime - (maxCandles * 30 * 1000); // 30 seconds per candle

  // Fetch all trades in this range
  const trades = await fetchAllTrades(symbol, startTime, endTime);

  if (trades.length === 0) {
    throw new Error('No trades found in time range');
  }

  // Build 30-second candles from trades
  const candles = buildCandlesFromTrades(trades);

  logger.info('[backtest-30s] Built 30-second candles', {
    symbol,
    totalCandles: candles.length,
    from: candles[0]?.timestamp.toISOString(),
    to: candles[candles.length - 1]?.timestamp.toISOString()
  });

  // Return only the requested number of candles (most recent)
  const result = candles.slice(-maxCandles);

  // Save to cache for next time
  saveToCache(symbol, maxCandles, result);

  return result;
}

module.exports = {
  fetch30sCandles,
  fetchAllTrades,
  buildCandlesFromTrades,
  clearCache
};
