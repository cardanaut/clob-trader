/**
 * Price Collector Service
 *
 * Centralized service that fetches live market prices for all 4 cryptos every second.
 * Stores prices in memory cache for instant retrieval by other components.
 *
 * Benefits:
 * - Single API call per second (instead of multiple)
 * - Consistent price data across all components
 * - Fast price retrieval from cache
 * - Enables "wait and retry" trading strategy
 */

'use strict';

const logger = require('../utils/logger');
const gamma = require('./gamma-api');
const clobHttp = require('./clob-http-client');

// In-memory cache for latest prices
const priceCache = {
  BTC: { up: null, down: null, updatedAt: null, market: null },
  ETH: { up: null, down: null, updatedAt: null, market: null },
  SOL: { up: null, down: null, updatedAt: null, market: null },
  XRP: { up: null, down: null, updatedAt: null, market: null }
};

// Interval handle
let collectionInterval = null;

/**
 * Fetch and cache prices for a single crypto
 */
async function fetchCryptoPrice(crypto) {
  try {
    const slugPattern = `${crypto.toLowerCase()}-updown-5m`;

    // Get current active market
    const markets = await gamma.getActiveMarkets(crypto, slugPattern, 5);

    if (!markets || markets.length === 0) {
      logger.warn('[price-collector] No active market found', { crypto });
      return;
    }

    const market = markets[0];

    // Find UP and DOWN tokens
    const upToken = market.tokens.find(t => t.outcome === 'Up' || t.outcome === 'UP');
    const downToken = market.tokens.find(t => t.outcome === 'Down' || t.outcome === 'DOWN');

    if (!upToken || !downToken) {
      logger.warn('[price-collector] Missing tokens', { crypto, market: market.slug });
      return;
    }

    // Fetch CLOB prices
    const pricesResponse = await clobHttp.getPrices([
      { token_id: upToken.token_id, side: 'BUY' },
      { token_id: downToken.token_id, side: 'BUY' }
    ]);

    // Extract prices with fallback logic
    let upPrice = 0.5;
    let downPrice = 0.5;

    const hasUpPrice = pricesResponse?.[upToken.token_id]?.BUY;
    const hasDownPrice = pricesResponse?.[downToken.token_id]?.BUY;

    if (hasUpPrice && hasDownPrice) {
      upPrice = parseFloat(pricesResponse[upToken.token_id].BUY);
      downPrice = parseFloat(pricesResponse[downToken.token_id].BUY);
    } else if (hasUpPrice && !hasDownPrice) {
      upPrice = parseFloat(pricesResponse[upToken.token_id].BUY);
      downPrice = 1 - upPrice;
    } else if (!hasUpPrice && hasDownPrice) {
      downPrice = parseFloat(pricesResponse[downToken.token_id].BUY);
      upPrice = 1 - downPrice;
    }

    // Update cache
    priceCache[crypto] = {
      up: upPrice,
      down: downPrice,
      updatedAt: new Date(),
      market: market.slug,
      marketEnd: new Date(market.endDate)
    };

  } catch (err) {
    logger.warn('[price-collector] Failed to fetch price', {
      crypto,
      error: err.message
    });
  }
}

/**
 * Collect prices for all cryptos
 */
async function collectAllPrices() {
  const cryptos = ['BTC', 'ETH', 'SOL', 'XRP'];

  // Fetch all prices in parallel
  await Promise.all(cryptos.map(crypto => fetchCryptoPrice(crypto)));

  // Log every 10th update to avoid spam (only show every 10 seconds)
  const now = Date.now();
  if (!collectAllPrices.lastLogTime || now - collectAllPrices.lastLogTime > 10000) {
    logger.info('[price-collector] Prices updated', {
      BTC: priceCache.BTC.up ? `${(priceCache.BTC.up * 100).toFixed(0)}¢` : 'N/A',
      ETH: priceCache.ETH.up ? `${(priceCache.ETH.up * 100).toFixed(0)}¢` : 'N/A',
      SOL: priceCache.SOL.up ? `${(priceCache.SOL.up * 100).toFixed(0)}¢` : 'N/A',
      XRP: priceCache.XRP.up ? `${(priceCache.XRP.up * 100).toFixed(0)}¢` : 'N/A'
    });
    collectAllPrices.lastLogTime = now;
  }
}

/**
 * Start price collection service
 */
function start() {
  if (collectionInterval) {
    logger.warn('[price-collector] Already running');
    return;
  }

  logger.info('[price-collector] Starting price collection service (1 second interval)');

  // Initial fetch
  collectAllPrices();

  // Start 1-second interval
  collectionInterval = setInterval(collectAllPrices, 1000);
}

/**
 * Stop price collection service
 */
function stop() {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
    logger.info('[price-collector] Stopped price collection service');
  }
}

/**
 * Get latest cached prices
 */
function getLatestPrices() {
  return priceCache;
}

/**
 * Get price for specific crypto
 */
function getPrice(crypto) {
  return priceCache[crypto] || null;
}

module.exports = {
  start,
  stop,
  getLatestPrices,
  getPrice
};
