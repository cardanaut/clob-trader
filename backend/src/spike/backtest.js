/**
 * SpikeTrading Backtest Simulator
 * Pure Binance-only simulation without Polymarket involvement
 */

'use strict';

const axios = require('axios');
const logger = require('../utils/logger');
const config = require('./config');

/**
 * Fetch historical 1-minute candles from Binance
 * @param {String} symbol - Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')
 * @param {Number} limit - Number of candles to fetch (max 1000 per request)
 * @param {Number} endTime - End timestamp (ms), fetches backwards from this point
 * @returns {Array} Candles array
 */
async function fetchBinanceCandles(symbol = 'BTCUSDT', limit = 1000, endTime = null) {
  try {
    const params = {
      symbol,
      interval: '1m',
      limit: Math.min(limit, 1000) // Binance max is 1000
    };

    if (endTime) {
      params.endTime = endTime;
    }

    const res = await axios.get('https://api.binance.com/api/v3/klines', {
      params,
      timeout: 30000
    });

    if (!Array.isArray(res.data)) {
      throw new Error('Invalid response from Binance API');
    }

    // Convert Binance kline format to our candle format
    // Use TradingView-style movement calculation
    return res.data.map(k => {
      const open = parseFloat(k[1]);
      const close = parseFloat(k[4]);
      const movementPct = open > 0 ? Math.abs((close - open) / open * 100) : 0;

      return {
        timestamp: new Date(k[0]),
        open,
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close,
        volume: parseFloat(k[5]),
        movementPct // TradingView-style: abs((close - open) / open * 100)
      };
    });
  } catch (err) {
    logger.error('[spike-backtest] Error fetching Binance candles', { symbol, error: err.message });
    throw err;
  }
}

/**
 * Get cache file path for 1-minute candles
 */
function getCachePath1m(symbol, maxCandles) {
  const path = require('path');
  const cacheDir = path.join(__dirname, '../../cache');
  return path.join(cacheDir, `candles-1m-${symbol}-${maxCandles}.json`);
}

/**
 * Load 1-minute candles from cache
 */
function loadFromCache1m(symbol, maxCandles) {
  const fs = require('fs');
  const cachePath = getCachePath1m(symbol, maxCandles);

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

    logger.info('[spike-backtest] Loaded 1-minute candles from cache', {
      symbol,
      totalCandles: candles.length,
      cachedAt: cacheData.cachedAt,
      ageHours: ((Date.now() - new Date(cacheData.cachedAt).getTime()) / (1000 * 60 * 60)).toFixed(1)
    });

    return candles;
  } catch (err) {
    logger.warn('[spike-backtest] Failed to load cache', { error: err.message });
    return null;
  }
}

/**
 * Save 1-minute candles to cache
 */
function saveToCache1m(symbol, maxCandles, candles) {
  const fs = require('fs');
  const cachePath = getCachePath1m(symbol, maxCandles);

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

    logger.info('[spike-backtest] Saved 1-minute candles to cache', {
      symbol,
      totalCandles: candles.length,
      cachePath
    });
  } catch (err) {
    logger.warn('[spike-backtest] Failed to save cache', { error: err.message });
  }
}

/**
 * Fetch maximum historical candles (paginate backwards)
 * @param {String} symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param {Number} maxCandles - Maximum total candles to fetch
 * @param {Boolean} useCache - Whether to use cached data (default: true)
 * @returns {Array} All candles
 */
async function fetchMaximumCandles(symbol = 'BTCUSDT', maxCandles = 10000, useCache = true) {
  // Try to load from cache first
  if (useCache) {
    const cached = loadFromCache1m(symbol, maxCandles);
    if (cached) {
      return cached;
    }
  }

  logger.info('[spike-backtest] Cache miss, fetching fresh data from Binance...');

  const allCandles = [];
  let endTime = null;
  const batchSize = 1000;

  logger.info('[spike-backtest] Starting to fetch historical candles', { symbol, maxCandles });

  while (allCandles.length < maxCandles) {
    const remaining = maxCandles - allCandles.length;
    const limit = Math.min(remaining, batchSize);

    const candles = await fetchBinanceCandles(symbol, limit, endTime);

    if (!candles || candles.length === 0) {
      logger.warn('[spike-backtest] No more candles available', { symbol });
      break;
    }

    // Add to beginning (we're going backwards in time)
    allCandles.unshift(...candles);

    // Set endTime for next batch (earliest candle timestamp - 1ms)
    endTime = candles[0].timestamp.getTime() - 1;

    logger.info('[spike-backtest] Fetched batch', {
      symbol,
      count: candles.length,
      total: allCandles.length,
      earliest: candles[0].timestamp.toISOString()
    });

    // Rate limit: wait 200ms between requests
    await new Promise(resolve => setTimeout(resolve, 200));

    // Stop if we got less than requested (no more data)
    if (candles.length < limit) {
      break;
    }
  }

  logger.info('[spike-backtest] Finished fetching candles', {
    symbol,
    total: allCandles.length,
    from: allCandles[0]?.timestamp.toISOString(),
    to: allCandles[allCandles.length - 1]?.timestamp.toISOString()
  });

  // Save to cache for next time
  saveToCache1m(symbol, maxCandles, allCandles);

  return allCandles;
}

/**
 * Get cache file path for 3-minute candles
 */
function getCachePath3m(symbol, maxCandles) {
  const path = require('path');
  const cacheDir = path.join(__dirname, '../../cache');
  return path.join(cacheDir, `candles-3m-${symbol}-${maxCandles}.json`);
}

/**
 * Load 3-minute candles from cache
 */
function loadFromCache3m(symbol, maxCandles) {
  const fs = require('fs');
  const cachePath = getCachePath3m(symbol, maxCandles);

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

    logger.info('[spike-backtest] Loaded 3-minute candles from cache', {
      symbol,
      totalCandles: candles.length,
      cachedAt: cacheData.cachedAt,
      ageHours: ((Date.now() - new Date(cacheData.cachedAt).getTime()) / (1000 * 60 * 60)).toFixed(1)
    });

    return candles;
  } catch (err) {
    logger.warn('[spike-backtest] Failed to load cache', { error: err.message });
    return null;
  }
}

/**
 * Save 3-minute candles to cache
 */
function saveToCache3m(symbol, maxCandles, candles) {
  const fs = require('fs');
  const cachePath = getCachePath3m(symbol, maxCandles);

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

    logger.info('[spike-backtest] Saved 3-minute candles to cache', {
      symbol,
      totalCandles: candles.length,
      cachePath
    });
  } catch (err) {
    logger.warn('[spike-backtest] Failed to save cache', { error: err.message });
  }
}

/**
 * Fetch 3-minute candles from Binance
 * @param {String} symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param {Number} maxCandles - Maximum total candles to fetch
 * @param {Boolean} useCache - Whether to use cached data (default: true)
 * @returns {Array} All 3-minute candles
 */
async function fetch3mCandles(symbol = 'BTCUSDT', maxCandles = 10000, useCache = true) {
  // Try to load from cache first
  if (useCache) {
    const cached = loadFromCache3m(symbol, maxCandles);
    if (cached) {
      return cached;
    }
  }

  logger.info('[spike-backtest] Cache miss, fetching fresh 3-minute data from Binance...');

  const allCandles = [];
  let endTime = null;
  const batchSize = 1000;

  logger.info('[spike-backtest] Starting to fetch 3-minute candles', { symbol, maxCandles });

  while (allCandles.length < maxCandles) {
    const remaining = maxCandles - allCandles.length;
    const limit = Math.min(remaining, batchSize);

    try {
      const params = {
        symbol,
        interval: '3m',
        limit: Math.min(limit, 1000)
      };

      if (endTime) {
        params.endTime = endTime;
      }

      const res = await axios.get('https://api.binance.com/api/v3/klines', {
        params,
        timeout: 30000
      });

      if (!Array.isArray(res.data)) {
        throw new Error('Invalid response from Binance API');
      }

      // Convert Binance kline format to our candle format
      const candles = res.data.map(k => {
        const open = parseFloat(k[1]);
        const close = parseFloat(k[4]);
        const movementPct = open > 0 ? Math.abs((close - open) / open * 100) : 0;

        return {
          timestamp: new Date(k[0]),
          open,
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close,
          volume: parseFloat(k[5]),
          movementPct
        };
      });

      if (!candles || candles.length === 0) {
        logger.warn('[spike-backtest] No more 3-minute candles available', { symbol });
        break;
      }

      // Add to beginning (we're going backwards in time)
      allCandles.unshift(...candles);

      // Set endTime for next batch (earliest candle timestamp - 1ms)
      endTime = candles[0].timestamp.getTime() - 1;

      logger.info('[spike-backtest] Fetched 3-minute batch', {
        symbol,
        count: candles.length,
        total: allCandles.length,
        earliest: candles[0].timestamp.toISOString()
      });

      // Rate limit: wait 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));

      // Stop if we got less than requested (no more data)
      if (candles.length < limit) {
        break;
      }
    } catch (err) {
      logger.error('[spike-backtest] Error fetching 3-minute candles', { symbol, error: err.message });
      throw err;
    }
  }

  logger.info('[spike-backtest] Finished fetching 3-minute candles', {
    symbol,
    total: allCandles.length,
    from: allCandles[0]?.timestamp.toISOString(),
    to: allCandles[allCandles.length - 1]?.timestamp.toISOString()
  });

  // Save to cache for next time
  saveToCache3m(symbol, maxCandles, allCandles);

  return allCandles;
}

/**
 * Detect signal in a candle with range-based filtering
 * @param {Object} candle - 1-min CLOSED candle being evaluated
 * @param {Number} referencePrice - Cycle start price (T+0 open)
 * @param {Number} minuteInCycle - Candle minute (0=T+0, 1=T+1, 2=T+2)
 * @param {Number} minThreshold - Minimum movement % to trigger (default 0.15%)
 * @param {Number} maxThreshold - Maximum movement % to trigger (default 0.30%)
 * @param {Object} strategy - Strategy config (optional, for dual-threshold strategies)
 * @returns {Object|null} Signal { type: 'UP'|'DOWN', candle, minute }
 */
function detectSignal(candle, referencePrice, minuteInCycle, minThreshold = 0.15, maxThreshold = 0.30, strategy = null) {
  // Guard: candle index must be non-negative.
  // Upper bound is enforced by the caller's checkWindows array, not here —
  // this allows 15-min strategies to check T+3 and beyond without being blocked.
  if (minuteInCycle < 0) {
    return null;
  }

  // T123-HL: Dual-threshold strategy (High-Low + Open-Close)
  if (strategy && strategy.dualThreshold) {
    // Calculate High-Low range percentage
    const hlPct = Math.abs((candle.high - candle.low) / referencePrice * 100);

    // Calculate Open-Close movement percentage
    const ocPct = Math.abs((candle.close - candle.open) / referencePrice * 100);

    // Both conditions must be met
    if (hlPct < strategy.hlThreshold || ocPct < strategy.ocThreshold) {
      return null;
    }

    // Check max threshold on the actual close movement
    if (candle.movementPct > maxThreshold) {
      return null;
    }

    // Determine direction based on where price moved
    const signalType = candle.close > referencePrice ? 'UP' : 'DOWN';

    return {
      type: signalType,
      candle,
      minute: minuteInCycle,
      referencePrice,
      hlPct,
      ocPct
    };
  }

  // Standard T123: Single threshold strategy
  // Check if candle movement is within the range (TradingView formula)
  // Only trade if movement is >= minThreshold AND <= maxThreshold
  if (candle.movementPct < minThreshold || candle.movementPct > maxThreshold) {
    return null;
  }

  // Determine direction based on where price moved
  const signalType = candle.close > referencePrice ? 'UP' : 'DOWN';

  return {
    type: signalType,
    candle,
    minute: minuteInCycle,
    referencePrice
  };
}

/**
 * Group candles into cycles aligned to duration boundaries
 * @param {Array} candles - All 1-min candles (must be sorted by timestamp ASC)
 * @param {Number} duration - Cycle duration in minutes (5 or 15)
 * @returns {Array} Array of cycles, each with duration candles
 */
function groupIntoCycles(candles, duration = 5) {
  const cycles = [];
  const candleMap = new Map();

  // Build a map: timestamp_minute -> candle
  // Round each candle to its minute boundary (e.g., 10:01:30 -> 10:01:00)
  for (const candle of candles) {
    const ts = new Date(candle.timestamp);
    const minuteKey = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate(), ts.getHours(), ts.getMinutes(), 0, 0).getTime();
    candleMap.set(minuteKey, candle);
  }

  // Find the first candle's timestamp
  if (candles.length === 0) return [];

  const firstTs = new Date(candles[0].timestamp);
  const lastTs = new Date(candles[candles.length - 1].timestamp);

  // Start from the first duration boundary at or after the first candle
  const firstMinute = firstTs.getMinutes();
  const firstAlignedMinute = Math.floor(firstMinute / duration) * duration;
  let cycleStart = new Date(firstTs.getFullYear(), firstTs.getMonth(), firstTs.getDate(), firstTs.getHours(), firstAlignedMinute, 0, 0);

  // If first candle is after this boundary, move to next boundary
  if (cycleStart < firstTs) {
    cycleStart = new Date(cycleStart.getTime() + duration * 60 * 1000);
  }

  // Generate cycles aligned to duration boundaries
  while (cycleStart <= lastTs) {
    const cycleCandles = [];

    // Collect consecutive 1-minute candles for this cycle
    for (let min = 0; min < duration; min++) {
      const candleTs = new Date(cycleStart.getTime() + min * 60 * 1000);
      const candle = candleMap.get(candleTs.getTime());
      if (candle) {
        cycleCandles.push(candle);
      }
    }

    // Only add cycle if we have all candles (no gaps)
    if (cycleCandles.length === duration) {
      cycles.push({
        start: cycleCandles[0].timestamp,
        end: cycleCandles[duration - 1].timestamp,
        candles: cycleCandles,
        referencePrice: cycleCandles[0].open // T+0 open price
      });
    }

    // Move to next duration boundary
    cycleStart = new Date(cycleStart.getTime() + duration * 60 * 1000);
  }

  return cycles;
}

/**
 * Group 30-second candles into 5-minute cycles
 * Each cycle has 10 candles (30s x 10 = 5 minutes)
 * @param {Array} candles - All 30-second candles (sorted by timestamp ASC)
 * @returns {Array} Array of cycles, each with 10 candles
 */
function groupIntoCycles30s(candles) {
  const cycles = [];
  const candleMap = new Map();

  // Build a map: timestamp_30s -> candle
  for (const candle of candles) {
    const ts = new Date(candle.timestamp);
    // Round to 30-second boundary
    const seconds = ts.getSeconds();
    const windowStart = seconds < 30 ? 0 : 30;
    const candleKey = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate(), ts.getHours(), ts.getMinutes(), windowStart, 0).getTime();
    candleMap.set(candleKey, candle);
  }

  if (candles.length === 0) return [];

  const firstTs = new Date(candles[0].timestamp);
  const lastTs = new Date(candles[candles.length - 1].timestamp);

  // Start from first 5-minute boundary
  const firstMinute = firstTs.getMinutes();
  const firstAlignedMinute = Math.floor(firstMinute / 5) * 5;
  let cycleStart = new Date(firstTs.getFullYear(), firstTs.getMonth(), firstTs.getDate(), firstTs.getHours(), firstAlignedMinute, 0, 0);

  if (cycleStart < firstTs) {
    cycleStart = new Date(cycleStart.getTime() + 5 * 60 * 1000);
  }

  // Generate cycles aligned to 5-minute boundaries
  while (cycleStart <= lastTs) {
    const cycleCandles = [];

    // Collect 10 consecutive 30-second candles for this cycle
    for (let i = 0; i < 10; i++) {
      const candleTs = new Date(cycleStart.getTime() + i * 30 * 1000);
      const candle = candleMap.get(candleTs.getTime());
      if (candle) {
        cycleCandles.push(candle);
      }
    }

    // Only add cycle if we have all 10 candles (no gaps)
    if (cycleCandles.length === 10) {
      cycles.push({
        start: cycleCandles[0].timestamp,
        end: cycleCandles[9].timestamp,
        candles: cycleCandles,
        referencePrice: cycleCandles[0].open // T+0 open price
      });
    }

    // Move to next 5-minute boundary
    cycleStart = new Date(cycleStart.getTime() + 5 * 60 * 1000);
  }

  return cycles;
}

/**
 * Group 3-minute candles into 15-minute cycles
 * Each cycle has 5 candles (3m x 5 = 15 minutes)
 * @param {Array} candles - All 3-minute candles (sorted by timestamp ASC)
 * @returns {Array} Array of cycles, each with 5 candles
 */
function groupIntoCycles3m(candles) {
  const cycles = [];
  const candleMap = new Map();

  // Build a map: timestamp_3m -> candle
  for (const candle of candles) {
    const ts = new Date(candle.timestamp);
    // Round to 3-minute boundary
    const minutes = ts.getMinutes();
    const windowStart = Math.floor(minutes / 3) * 3;
    const candleKey = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate(), ts.getHours(), windowStart, 0, 0).getTime();
    candleMap.set(candleKey, candle);
  }

  if (candles.length === 0) return [];

  const firstTs = new Date(candles[0].timestamp);
  const lastTs = new Date(candles[candles.length - 1].timestamp);

  // Start from first 15-minute boundary (aligned to 00, 15, 30, 45)
  const firstMinute = firstTs.getMinutes();
  const firstAlignedMinute = Math.floor(firstMinute / 15) * 15;
  let cycleStart = new Date(firstTs.getFullYear(), firstTs.getMonth(), firstTs.getDate(), firstTs.getHours(), firstAlignedMinute, 0, 0);

  if (cycleStart < firstTs) {
    cycleStart = new Date(cycleStart.getTime() + 15 * 60 * 1000);
  }

  // Generate cycles aligned to 15-minute boundaries
  while (cycleStart <= lastTs) {
    const cycleCandles = [];

    // Collect 5 consecutive 3-minute candles for this cycle
    for (let i = 0; i < 5; i++) {
      const candleTs = new Date(cycleStart.getTime() + i * 3 * 60 * 1000);
      const candle = candleMap.get(candleTs.getTime());
      if (candle) {
        cycleCandles.push(candle);
      }
    }

    // Only add cycle if we have all 5 candles (no gaps)
    if (cycleCandles.length === 5) {
      cycles.push({
        start: cycleCandles[0].timestamp,
        end: cycleCandles[4].timestamp,
        candles: cycleCandles,
        referencePrice: cycleCandles[0].open // T+0 open price
      });
    }

    // Move to next 15-minute boundary
    cycleStart = new Date(cycleStart.getTime() + 15 * 60 * 1000);
  }

  return cycles;
}

/**
 * Detect signal in 30-second candle (checking windows T+0:00-T+2:30)
 * For 30-sec strategy, we check the first 5 candles (0-4) which cover T+0:00 to T+2:30
 * This is equivalent to checking T+0, T+1, T+2 in 1-minute strategy
 * @param {Object} candle - 30-sec candle being evaluated
 * @param {Number} referencePrice - Cycle start price
 * @param {Number} candleIndex - Candle index in cycle (0-9)
 * @param {Number} minThreshold - Minimum movement %
 * @param {Number} maxThreshold - Maximum movement %
 * @returns {Object|null} Signal
 */
function detectSignal30s(candle, referencePrice, candleIndex, minThreshold, maxThreshold) {
  // Only check first 5 candles (T+0:00 to T+2:30)
  // Candle 0: T+0:00-T+0:30, Candle 1: T+0:30-T+1:00, ..., Candle 4: T+2:00-T+2:30
  if (candleIndex < 0 || candleIndex > 4) {
    return null;
  }

  // Check if candle movement is within range
  if (candle.movementPct < minThreshold || candle.movementPct > maxThreshold) {
    return null;
  }

  // Determine direction
  const signalType = candle.close > referencePrice ? 'UP' : 'DOWN';

  return {
    type: signalType,
    candle,
    minute: candleIndex / 2, // Convert to equivalent minute (0.5, 1.0, 1.5, 2.0, 2.5)
    referencePrice
  };
}

/**
 * Run backtest simulation on historical data
 * @param {Number} maxCandles - Maximum candles to fetch
 * @param {String} symbol - Trading pair symbol (default 'BTCUSDT')
 * @param {Number} minThreshold - Minimum movement threshold %
 * @param {Number} maxThreshold - Maximum movement threshold %
 * @param {String} strategy - Strategy ID ('T123-1MIN' or 'T123-30SEC')
 * @param {Boolean} useCache - Whether to use cached candles (default: true)
 * @param {String} direction - Trade direction: 'momentum' (follow spike) or 'reversion' (fade spike)
 * @param {String} platform - Resolution platform: 'iqoption' (entry=spike close, expiry=period) or 'polymarket' (compare vs T+0 open at cycle end)
 * @returns {Object} Backtest results
 */
async function runBacktest(maxCandles = 10000, symbol = 'BTCUSDT', minThreshold = 0.15, maxThreshold = 0.30, strategy = 'T123-1MIN', useCache = true, direction = 'momentum', platform = 'iqoption') {
  const startTime = Date.now();

  // Fetch candles based on strategy
  const strategyConfig = config.STRATEGIES[strategy];

  // Use strategy's threshold if defined, otherwise use passed parameters
  if (strategyConfig && strategyConfig.minThreshold !== undefined) {
    minThreshold = strategyConfig.minThreshold;
  }
  if (strategyConfig && strategyConfig.maxThreshold !== undefined) {
    maxThreshold = strategyConfig.maxThreshold;
  }

  logger.info('[spike-backtest] Running backtest', { symbol, strategy, minThreshold, maxThreshold, maxCandles, useCache });

  try {
    let candles, cycles;
    const is30SecStrategy = strategyConfig && strategyConfig.interval === '30s';
    const is3MinStrategy = strategyConfig && strategyConfig.interval === '3m';

    if (is30SecStrategy) {
      // Use 30-second candles for all 30-second variations
      const backtest30s = require('./backtest-30s');
      candles = await backtest30s.fetch30sCandles(symbol, maxCandles, useCache);
      cycles = groupIntoCycles30s(candles);

      logger.info('[spike-backtest] Using 30-second candles', {
        strategy,
        totalCandles: candles.length,
        totalCycles: cycles.length
      });
    } else if (is3MinStrategy) {
      // Use 3-minute candles
      candles = await fetch3mCandles(symbol, maxCandles, useCache);
      cycles = groupIntoCycles3m(candles);

      logger.info('[spike-backtest] Using 3-minute candles', {
        strategy,
        totalCandles: candles.length,
        totalCycles: cycles.length
      });
    } else {
      // Use 1-minute candles (default)
      candles = await fetchMaximumCandles(symbol, maxCandles, useCache);

      // Determine cycle duration from strategy config
      const cycleDuration = strategyConfig && strategyConfig.marketDuration ? strategyConfig.marketDuration : 5;
      cycles = groupIntoCycles(candles, cycleDuration);

      logger.info('[spike-backtest] Using 1-minute candles', {
        strategy,
        cycleDuration: cycleDuration + ' minutes',
        totalCandles: candles.length,
        totalCycles: cycles.length
      });
    }

    // Validate minimum candles
    const minCandlesRequired = strategy === 'T123-30SEC' ? 10 : 5;
    if (candles.length < minCandlesRequired) {
      throw new Error(`Insufficient candles for backtest (need at least ${minCandlesRequired})`);
    }

    logger.info('[spike-backtest] Grouped into cycles', {
      strategy,
      totalCandles: candles.length,
      totalCycles: cycles.length,
      firstCycle: cycles[0]?.start.toISOString(),
      lastCycle: cycles[cycles.length - 1]?.end.toISOString()
    });

    // Simulate each cycle
    const results = {
      strategy: strategy,
      direction: direction,
      platform: platform,
      symbol: symbol,
      thresholds: { min: minThreshold, max: maxThreshold },
      totalCycles: cycles.length,
      totalCandles: candles.length,
      signalsDetected: 0,
      trades: [],
      wins: 0,
      losses: 0,
      byMinute: {
        0: { signals: 0, wins: 0, losses: 0 }, // T+0 candle
        1: { signals: 0, wins: 0, losses: 0 }, // T+1 candle
        2: { signals: 0, wins: 0, losses: 0 }, // T+2 candle
        3: { signals: 0, wins: 0, losses: 0 }, // T+3 candle
        4: { signals: 0, wins: 0, losses: 0 }  // T+4 candle
      },
      period: {
        from: candles[0].timestamp,
        to: candles[candles.length - 1].timestamp,
        fromISO: candles[0].timestamp.toISOString(),
        toISO: candles[candles.length - 1].timestamp.toISOString(),
        days: (candles[candles.length - 1].timestamp - candles[0].timestamp) / (1000 * 60 * 60 * 24)
      }
    };

    for (const cycle of cycles) {
      let signalFired = false;
      let trade = null;

      // Check for signals based on strategy
      const strategyConfig = config.STRATEGIES[strategy];
      const is30SecStrategy = strategyConfig && strategyConfig.interval === '30s';

      // Get check windows from strategy config, or use defaults
      let checkIndices;
      if (is30SecStrategy) {
        // For 30-second strategies: check first 5 candles (indices 0-4)
        checkIndices = strategyConfig.checkWindows || [0, 1, 2, 3, 4];
      } else {
        // For 1-minute strategies: use checkWindows from config
        checkIndices = strategyConfig.checkWindows || [0, 1, 2];
      }

      for (const candleIndex of checkIndices) {
        if (signalFired) break; // Only one signal per cycle!

        let signal;
        if (is30SecStrategy) {
          signal = detectSignal30s(cycle.candles[candleIndex], cycle.referencePrice, candleIndex, minThreshold, maxThreshold);
        } else if (strategyConfig && strategyConfig.fusionMode && strategyConfig.subStrategies) {
          // FUSION MODE: Check multiple sub-strategies in priority order (like live engine)
          // Live engine checks QUALITY (HL) first, then VOLUME (standard)
          // Reorder sub-strategies: HL variants before standard variants
          const reorderedStrategies = [...strategyConfig.subStrategies].sort((a, b) => {
            const aIsHL = a.includes('-HL-');
            const bIsHL = b.includes('-HL-');
            if (aIsHL && !bIsHL) return -1; // HL first
            if (!aIsHL && bIsHL) return 1;  // Standard second
            return 0;
          });

          for (const subStrategyId of reorderedStrategies) {
            const subStrategyConfig = config.STRATEGIES[subStrategyId];
            if (!subStrategyConfig) continue;

            // Try to detect signal with this sub-strategy's config
            signal = detectSignal(
              cycle.candles[candleIndex],
              cycle.referencePrice,
              candleIndex,
              subStrategyConfig.minThreshold || minThreshold,
              subStrategyConfig.maxThreshold || maxThreshold,
              subStrategyConfig
            );

            // If signal found, use it and stop checking other sub-strategies (first match wins)
            if (signal) {
              signal.subStrategy = subStrategyId; // Track which sub-strategy fired
              break;
            }
          }
        } else {
          signal = detectSignal(cycle.candles[candleIndex], cycle.referencePrice, candleIndex, minThreshold, maxThreshold, strategyConfig);
        }

        if (signal) {
          signalFired = true;
          results.signalsDetected++;

          // Get final price and entry reference — depends on platform
          let finalCandleIndex;
          let entryPrice;

          if (platform === 'polymarket') {
            // Polymarket: market resolves at cycle end vs T+0 open reference price
            // Final candle = last in cycle, entry reference = cycle T+0 open
            if (is30SecStrategy) {
              finalCandleIndex = 9; // 10 candles per 5-min cycle
            } else if (is3MinStrategy) {
              finalCandleIndex = 4; // 5 candles per 15-min cycle
            } else {
              finalCandleIndex = (strategyConfig.marketDuration || 5) - 1; // last candle
            }
            entryPrice = cycle.referencePrice; // T+0 open — Polymarket resolution reference
          } else {
            // IQOption: entry = spike candle close, expiry = IQOption period-based candle
            // IQOption period depends on which candle fired the signal:
            //   BEGIN (candleIndex=0): 3-min trade, entered at 1:00, expires at 4:00 → candle index 3
            //   T+1   (candleIndex=1): 3-min trade, entered at 2:00, expires at 5:00 → candle index 4
            //   T+2   (candleIndex=2): 2-min trade, entered at 3:00, expires at 5:00 → candle index 4
            if (is30SecStrategy) {
              finalCandleIndex = 9;
            } else if (is3MinStrategy) {
              finalCandleIndex = 4;
            } else {
              const cycleDuration = strategyConfig.marketDuration || 5;
              const entryMinute = candleIndex + 1;          // candle closes at this minute
              const iqPeriod = candleIndex <= 1 ? 3 : 2;   // BEGIN/T+1 → 3min, T+2 → 2min
              const expiryMinute = entryMinute + iqPeriod;  // 4, 5, 5
              finalCandleIndex = Math.min(expiryMinute - 1, cycleDuration - 1); // 3, 4, 4
            }
            entryPrice = signal.candle.close; // IQOption entry = spike candle close
          }

          const finalPrice = cycle.candles[finalCandleIndex].close;

          // Determine outcome based on direction
          let outcome;
          if (direction === 'reversion') {
            // Reversion: fade the spike — bet price reverts BACK after the spike
            if (signal.type === 'UP') {
              outcome = finalPrice < entryPrice ? 'WIN' : 'LOSS';
            } else {
              outcome = finalPrice > entryPrice ? 'WIN' : 'LOSS';
            }
          } else {
            // Momentum: follow the spike direction
            if (signal.type === 'UP') {
              outcome = finalPrice > entryPrice ? 'WIN' : 'LOSS';
            } else {
              outcome = finalPrice < entryPrice ? 'WIN' : 'LOSS';
            }
          }

          // Calculate P&L % from entry price
          const priceDiff = finalPrice - entryPrice;
          const priceDiffPct = (priceDiff / entryPrice) * 100;

          trade = {
            cycleStart: cycle.start,
            cycleEnd: cycle.end,
            signalMinute: candleIndex, // The actual candle minute (1, 2, or 3)
            signalType: signal.type,
            referencePrice: cycle.referencePrice,
            signalPrice: signal.candle.close,
            finalPrice,
            priceDiff,
            priceDiffPct,
            outcome,
            candleMovementPct: signal.candle.movementPct, // TradingView formula
            symbol // Include symbol in trade data
          };

          results.trades.push(trade);

          // Update stats
          if (outcome === 'WIN') {
            results.wins++;
          } else {
            results.losses++;
          }

          // Map candle index to minute bucket for byMinute stats
          // For 30-sec: 0-1 → minute 0, 2 → minute 1, 3-4 → minute 2
          // For 3-min: 0 → minute 0, 1 → minute 1, 2 → minute 2, 3 → minute 3, 4 → minute 4
          // For 1-min: 0 → minute 0, 1 → minute 1, 2 → minute 2
          let minuteBucket;
          if (is30SecStrategy) {
            minuteBucket = Math.floor(candleIndex / 2); // 0-1→0, 2→1, 3-4→2
          } else if (is3MinStrategy) {
            minuteBucket = candleIndex; // 0→0, 1→1, 2→2, 3→3, 4→4
          } else {
            minuteBucket = candleIndex;
          }

          if (results.byMinute[minuteBucket]) {
            results.byMinute[minuteBucket].signals++;
            if (outcome === 'WIN') {
              results.byMinute[minuteBucket].wins++;
            } else {
              results.byMinute[minuteBucket].losses++;
            }
          }
        }
      }
    }

    // Calculate metrics
    const completedTrades = results.wins + results.losses;
    results.winRate = completedTrades > 0 ? (results.wins / completedTrades) * 100 : 0;
    results.ev = completedTrades > 0
      ? ((results.wins / completedTrades) * 100) - ((results.losses / completedTrades) * 100)
      : 0;

    // Calculate revenue for a $1-face-value bet at 0.81 entry price.
    // Polymarket binary: buy 1 share at marketPrice cents.
    //   Win:  receive $1.00, profit = +(1 - marketPrice)  = +$0.19
    //   Loss: receive $0.00, loss   = -marketPrice         = -$0.81
    const marketPrice = 0.81;
    const betPrice = 1.00;
    results.estimatedRevenue = ((1 - marketPrice) * results.wins * betPrice) - (marketPrice * results.losses * betPrice);
    results.revenuePerDay = results.period.days > 0 ? results.estimatedRevenue / results.period.days : 0;

    // Calculate EV per minute
    for (const minute of [0, 1, 2, 3, 4]) {
      if (results.byMinute[minute]) {
        const total = results.byMinute[minute].signals;
        if (total > 0) {
          results.byMinute[minute].winRate = (results.byMinute[minute].wins / total) * 100;
          results.byMinute[minute].ev = ((results.byMinute[minute].wins / total) * 100) - ((results.byMinute[minute].losses / total) * 100);
        } else {
          results.byMinute[minute].winRate = 0;
          results.byMinute[minute].ev = 0;
        }
      }
    }

    results.duration = Date.now() - startTime;

    logger.info('[spike-backtest] Backtest complete', {
      cycles: results.totalCycles,
      signals: results.signalsDetected,
      winRate: results.winRate.toFixed(1) + '%',
      ev: results.ev.toFixed(1) + '%',
      duration: results.duration + 'ms'
    });

    return results;
  } catch (err) {
    logger.error('[spike-backtest] Error running backtest', { error: err.message, stack: err.stack });
    throw err;
  }
}

/**
 * Compare T123-1MIN vs T123-30SEC strategies side-by-side
 * @param {Number} maxCandles - Maximum candles to fetch
 * @param {String} symbol - Trading pair symbol
 * @param {Boolean} useCache - Whether to use cached candles (default: true)
 * @returns {Object} Comparison results
 */
async function compareStrategies(maxCandles = 10000, symbol = 'BTCUSDT', useCache = true) {
  logger.info('[spike-backtest] 🔬 Running strategy comparison', { symbol, maxCandles, useCache });

  const startTime = Date.now();

  try {
    // Run both strategies
    const strategy1MIN = config.STRATEGIES['T123-1MIN'];
    const strategy30SEC = config.STRATEGIES['T123-30SEC'];

    logger.info('[spike-backtest] Running T123-1MIN backtest...');
    const results1MIN = await runBacktest(
      maxCandles,
      symbol,
      strategy1MIN.minThreshold,
      strategy1MIN.maxThreshold,
      'T123-1MIN',
      useCache
    );

    logger.info('[spike-backtest] Running T123-30SEC backtest...');
    const results30SEC = await runBacktest(
      maxCandles * 2, // 30-sec needs 2x more candles for same time period
      symbol,
      strategy30SEC.minThreshold,
      strategy30SEC.maxThreshold,
      'T123-30SEC',
      useCache
    );

    const elapsed = (Date.now() - startTime) / 1000;

    // Build comparison
    const comparison = {
      symbol,
      period: results1MIN.period,
      elapsed: elapsed.toFixed(2) + 's',
      strategies: {
        'T123-1MIN': {
          name: strategy1MIN.name,
          interval: strategy1MIN.interval,
          threshold: `${strategy1MIN.minThreshold}%-${strategy1MIN.maxThreshold}%`,
          totalCycles: results1MIN.totalCycles,
          signalsDetected: results1MIN.signalsDetected,
          wins: results1MIN.wins,
          losses: results1MIN.losses,
          winRate: results1MIN.winRate.toFixed(2) + '%',
          ev: results1MIN.ev.toFixed(2) + '%',
          tradesPerDay: (results1MIN.signalsDetected / results1MIN.period.days).toFixed(2)
        },
        'T123-30SEC': {
          name: strategy30SEC.name,
          interval: strategy30SEC.interval,
          threshold: `${strategy30SEC.minThreshold}%-${strategy30SEC.maxThreshold}%`,
          totalCycles: results30SEC.totalCycles,
          signalsDetected: results30SEC.signalsDetected,
          wins: results30SEC.wins,
          losses: results30SEC.losses,
          winRate: results30SEC.winRate.toFixed(2) + '%',
          ev: results30SEC.ev.toFixed(2) + '%',
          tradesPerDay: (results30SEC.signalsDetected / results30SEC.period.days).toFixed(2)
        }
      },
      winner: {
        byWinRate: results1MIN.winRate > results30SEC.winRate ? 'T123-1MIN' : 'T123-30SEC',
        byEV: results1MIN.ev > results30SEC.ev ? 'T123-1MIN' : 'T123-30SEC',
        byTradeVolume: results1MIN.signalsDetected > results30SEC.signalsDetected ? 'T123-1MIN' : 'T123-30SEC'
      }
    };

    logger.info('[spike-backtest] ✅ Strategy comparison complete', {
      winRateDiff: (results30SEC.winRate - results1MIN.winRate).toFixed(2) + '%',
      evDiff: (results30SEC.ev - results1MIN.ev).toFixed(2) + '%',
      tradesDiff: results30SEC.signalsDetected - results1MIN.signalsDetected
    });

    return comparison;
  } catch (err) {
    logger.error('[spike-backtest] Error in strategy comparison', { error: err.message });
    throw err;
  }
}

module.exports = {
  runBacktest,
  compareStrategies,
  fetchBinanceCandles,
  fetchMaximumCandles
};
