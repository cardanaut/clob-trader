/**
 * Gamma API Client for Polymarket
 * Fetches BTC 5-minute markets and their real-time prices
 */

'use strict';

const axios = require('axios');
const logger = require('../utils/logger');
const config = require('./config');

// Create dedicated axios instance for Gamma API (avoid global axios pollution)
const gammaAxios = axios.create({
  baseURL: config.GAMMA_API_BASE,
  timeout: 5000,
  headers: {
    'User-Agent': 'polychamp-spike/1.0'
  },
  // CRITICAL: Explicitly disable proxy to avoid SDK pollution
  proxy: false,
  httpAgent: undefined,
  httpsAgent: undefined
});

// Failure tracking for market collection
const failureTracker = {
  BTC: { consecutiveFails: 0, lastSuccess: Date.now() },
  ETH: { consecutiveFails: 0, lastSuccess: Date.now() },
  SOL: { consecutiveFails: 0, lastSuccess: Date.now() },
  XRP: { consecutiveFails: 0, lastSuccess: Date.now() }
};

const FAILURE_THRESHOLD = 3; // Alert after 3 consecutive failures
const FAILURE_WINDOW_MS = 5 * 60 * 1000; // Alert if no success for 5 minutes

/**
 * Notify when market collection is failing
 */
function notifyCollectionFailure(cryptoSymbol, reason) {
  const tracker = failureTracker[cryptoSymbol];
  const timeSinceLastSuccess = Date.now() - tracker.lastSuccess;

  logger.error('🚨 [spike-gamma] MARKET COLLECTION FAILURE ALERT', {
    crypto: cryptoSymbol,
    reason: reason,
    consecutiveFails: tracker.consecutiveFails,
    timeSinceLastSuccess: Math.floor(timeSinceLastSuccess / 1000) + 's',
    message: `${cryptoSymbol} markets have failed ${tracker.consecutiveFails} times in a row. No successful collection for ${Math.floor(timeSinceLastSuccess / 1000)}s.`
  });
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Number} maxRetries - Maximum number of retries (default: 2)
 * @param {Number} baseDelay - Base delay in ms (default: 500)
 * @returns {Promise} Result of the function
 */
async function retryWithBackoff(fn, maxRetries = 2, baseDelay = 500) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry on 404 (market doesn't exist yet) or 400 (bad request)
      if (err.response?.status === 404 || err.response?.status === 400) {
        throw err;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff: 500ms, 1000ms, 2000ms
      const delay = baseDelay * Math.pow(2, attempt);
      logger.debug(`[spike-gamma] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
        error: err.message,
        status: err.response?.status
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Fetch active markets for a specific crypto and duration
 * Markets are created on fixed intervals with slug pattern: {crypto}-updown-{duration}m-{timestamp}
 * They are hidden from general listings, so we calculate the current slug and fetch directly
 * @param {String} cryptoSymbol - Crypto symbol (BTC, ETH, SOL, XRP)
 * @param {String} slugPattern - Polymarket slug pattern (e.g., 'btc-updown-5m' or 'btc-updown-15m')
 * @param {Number} marketDuration - Market duration in minutes (5 or 15)
 * @returns {Array} List of active markets
 */
async function getActiveMarkets(cryptoSymbol, slugPattern, marketDuration = 5) {
  try {
    // Calculate the current and next market timestamps
    // Markets are aligned to duration boundaries
    // 5-min: 00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55
    // 15-min: 00, 15, 30, 45
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);
    const durationSec = marketDuration * 60;

    // Round down to nearest duration boundary
    const currentCycleStart = Math.floor(nowSec / durationSec) * durationSec;

    // Try to fetch the current and next 2 cycles (some markets may be created early)
    const timestamps = [
      currentCycleStart,
      currentCycleStart + durationSec,  // Next cycle
      currentCycleStart + (durationSec * 2)   // Cycle after that
    ];

    const marketPromises = timestamps.map(async (ts) => {
      const slug = `${slugPattern}-${ts}`;
      try {
        logger.debug(`[spike-gamma] Fetching market`, {
          url: `${config.GAMMA_API_BASE}/events`,
          slug
        });

        // Retry with exponential backoff on network errors
        const res = await retryWithBackoff(async () => {
          return await gammaAxios.get('/events', {
            params: { slug }
          });
        });

        const events = Array.isArray(res.data) ? res.data : [];
        if (events.length === 0) return null;

        const event = events[0];

        // Only return if active and not closed
        if (!event.active || event.closed) return null;

        // Must have a market
        if (!event.markets || event.markets.length === 0) return null;

        const market = event.markets[0];

        // Map tokens to outcomes using the actual outcomes array from API
        // Both clobTokenIds and outcomes are JSON strings that need parsing
        let tokens = [];
        let outcomes = [];
        if (market.clobTokenIds && market.outcomes) {
          const tokenIds = JSON.parse(market.clobTokenIds);
          outcomes = JSON.parse(market.outcomes); // Parse outcomes string too!
          tokens = outcomes.map((outcome, index) => ({
            outcome: outcome,
            token_id: tokenIds[index]
          }));
        }

        // CRITICAL FIX: Parse actual trading start time from slug, not API's creation time
        // Slug format: "eth-updown-5m-1771811100" where 1771811100 is Unix timestamp
        // API's startTime/startDate is often the creation time (24h before trading starts)
        let actualStartDate = event.startTime || event.startDate;
        const slugParts = event.slug.split('-');
        const slugTimestamp = parseInt(slugParts[slugParts.length - 1]);
        if (!isNaN(slugTimestamp) && slugTimestamp > 1000000000) {
          // Valid Unix timestamp (after year 2001)
          actualStartDate = new Date(slugTimestamp * 1000).toISOString();
        }

        return {
          conditionId: market.conditionId,
          slug: event.slug,
          question: market.question,
          startDate: actualStartDate,
          endDate: event.endDate,
          active: event.active,
          closed: event.closed,
          outcomes: outcomes, // Parsed array: ["Up", "Down"] or ["Yes", "No"]
          tokens: tokens,
          volume: parseFloat(market.volume) || 0
        };
      } catch (err) {
        // Market doesn't exist yet or other error
        logger.warn(`[spike-gamma] Failed to parse market ${slug}`, {
          error: err.message,
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          url: `${config.GAMMA_API_BASE}/events?slug=${slug}`
        });
        return null;
      }
    });

    const results = await Promise.all(marketPromises);
    const transformedMarkets = results.filter(m => m !== null);

    // Track collection success/failure
    const tracker = failureTracker[cryptoSymbol];
    if (transformedMarkets.length > 0) {
      // Successful collection - reset failure counter
      tracker.consecutiveFails = 0;
      tracker.lastSuccess = Date.now();

      logger.info(`[spike-gamma] Found ${cryptoSymbol} ${marketDuration}min markets`, {
        count: transformedMarkets.length,
        slugs: transformedMarkets.map(m => m.slug)
      });
    } else {
      // No markets found - increment failure counter
      tracker.consecutiveFails++;
      const timeSinceLastSuccess = Date.now() - tracker.lastSuccess;

      logger.warn(`[spike-gamma] No ${cryptoSymbol} markets found`, {
        consecutiveFails: tracker.consecutiveFails,
        timeSinceLastSuccess: Math.floor(timeSinceLastSuccess / 1000) + 's'
      });

      // Notify if threshold exceeded
      if (tracker.consecutiveFails >= FAILURE_THRESHOLD || timeSinceLastSuccess >= FAILURE_WINDOW_MS) {
        notifyCollectionFailure(cryptoSymbol, 'No markets returned from API');
      }
    }

    return transformedMarkets;
  } catch (err) {
    // Critical error - update tracker and notify
    const tracker = failureTracker[cryptoSymbol];
    tracker.consecutiveFails++;

    logger.error(`[spike-gamma] Error fetching ${cryptoSymbol} markets`, {
      error: err.message,
      consecutiveFails: tracker.consecutiveFails
    });

    // Notify if threshold exceeded
    if (tracker.consecutiveFails >= FAILURE_THRESHOLD) {
      notifyCollectionFailure(cryptoSymbol, err.message);
    }

    return [];
  }
}

/**
 * Fetch active BTC 5-minute markets (legacy wrapper for backward compatibility)
 * @returns {Array} List of active markets
 */
async function getActiveBTCMarkets() {
  return getActiveMarkets('BTC', 'btc-updown-5m');
}

/**
 * Get market orderbook to determine best ask price
 * @param {String} marketId - Condition ID
 * @returns {Object|null} { bestAsk, bestBid, spread }
 */
async function getMarketPrices(marketId) {
  try {
    // Gamma API doesn't have orderbook endpoint, use the market data directly
    const res = await retryWithBackoff(async () => {
      return await gammaAxios.get('/markets', {
        params: { condition_ids: marketId }
      });
    });

    const markets = Array.isArray(res.data) ? res.data : [];
    if (!markets.length) return null;

    const market = markets[0];

    // Log price fetch details for verification
    logger.info('[spike-gamma] Fetched market prices', {
      conditionId: marketId.slice(0, 16) + '...',
      marketSlug: market.slug,
      question: market.question?.substring(0, 50) + '...',
      bestAsk: parseFloat(market.bestAsk) || null,
      bestBid: parseFloat(market.bestBid) || null,
      lastPrice: parseFloat(market.lastTradePrice) || null,
      volume: market.volume || 0
    });

    return {
      bestAsk: parseFloat(market.bestAsk) || null,
      bestBid: parseFloat(market.bestBid) || null,
      spread: parseFloat(market.spread) || null,
      lastPrice: parseFloat(market.lastTradePrice) || null
    };
  } catch (err) {
    logger.error('[spike-gamma] Error fetching market prices', {
      marketId: marketId.slice(0, 16) + '...',
      error: err.message
    });
    return null;
  }
}

/**
 * Get token IDs for a market
 * Handles both Yes/No and Up/Down outcome formats
 * @param {String} conditionId - Market condition ID
 * @returns {Object|null} { yes: tokenId, no: tokenId } (or { up: tokenId, down: tokenId })
 */
async function getTokenIds(conditionId) {
  try {
    const res = await retryWithBackoff(async () => {
      return await gammaAxios.get('/markets', {
        params: { condition_ids: conditionId }
      });
    });

    const markets = Array.isArray(res.data) ? res.data : [];
    if (!markets.length) {
      logger.warn('[spike-gamma] No market found for condition ID', {
        conditionId: conditionId.slice(0, 16) + '...'
      });
      return null;
    }

    const market = markets[0];

    // Extract token IDs from market data
    const tokens = market.tokens || [];

    // Try Up/Down first (BTC 5min markets)
    let upToken = tokens.find(t => t.outcome === 'Up' || t.outcome === 'UP');
    let downToken = tokens.find(t => t.outcome === 'Down' || t.outcome === 'DOWN');

    if (upToken && downToken) {
      return {
        yes: upToken.token_id,   // Map UP to YES for consistency
        no: downToken.token_id   // Map DOWN to NO for consistency
      };
    }

    // Fall back to Yes/No (standard markets)
    const yesToken = tokens.find(t => t.outcome === 'Yes' || t.outcome === 'YES');
    const noToken = tokens.find(t => t.outcome === 'No' || t.outcome === 'NO');

    if (!yesToken || !noToken) {
      logger.warn('[spike-gamma] Missing outcome tokens', {
        conditionId: conditionId.slice(0, 16) + '...',
        tokensFound: tokens.length,
        outcomes: tokens.map(t => t.outcome)
      });
      return null;
    }

    return {
      yes: yesToken.token_id,
      no: noToken.token_id
    };
  } catch (err) {
    logger.error('[spike-gamma] Error fetching token IDs', {
      conditionId: conditionId.slice(0, 16) + '...',
      error: err.message
    });
    return null;
  }
}

/**
 * Get market resolution outcome (after market closes)
 * @param {String} marketId
 * @returns {String|null} 'YES', 'NO', 'Up', 'Down', or null if pending
 */
async function getMarketOutcome(marketId) {
  try {
    const res = await retryWithBackoff(async () => {
      return await gammaAxios.get('/markets', {
        params: { condition_ids: marketId }
      });
    });

    const markets = Array.isArray(res.data) ? res.data : [];
    if (!markets.length) return null;

    const market = markets[0];

    // Check if market is resolved
    // Gamma API uses umaResolutionStatus instead of resolved field
    const isResolved = market.umaResolutionStatus === 'resolved' ||
                       market.closed === true;

    if (!isResolved) return null;

    // Determine winning outcome from outcomePrices
    // Winning outcome has price "1" or "1.0", losing has "0" or "0.0"
    let outcomes, outcomePrices;

    try {
      outcomes = JSON.parse(market.outcomes || '[]');
      outcomePrices = JSON.parse(market.outcomePrices || '[]');
    } catch (e) {
      logger.warn('[spike-gamma] Failed to parse outcomes', {
        marketId: marketId.slice(0, 16) + '...',
        outcomes: market.outcomes,
        outcomePrices: market.outcomePrices
      });
      return null;
    }

    // Find the winning outcome (price = 1)
    const winningIndex = outcomePrices.findIndex(price =>
      parseFloat(price) === 1.0
    );

    if (winningIndex === -1 || !outcomes[winningIndex]) {
      // Market may not be fully resolved yet
      return null;
    }

    const winningOutcome = outcomes[winningIndex];

    // Normalize to YES/NO format (Up → YES, Down → NO)
    if (winningOutcome === 'Up' || winningOutcome === 'UP') return 'YES';
    if (winningOutcome === 'Down' || winningOutcome === 'DOWN') return 'NO';
    if (winningOutcome === 'Yes' || winningOutcome === 'YES') return 'YES';
    if (winningOutcome === 'No' || winningOutcome === 'NO') return 'NO';

    return winningOutcome.toUpperCase();
  } catch (err) {
    logger.error('[spike-gamma] Error fetching market outcome', {
      marketId: marketId.slice(0, 16) + '...',
      error: err.message
    });
    return null;
  }
}

module.exports = {
  getActiveMarkets,
  getActiveBTCMarkets,
  getMarketPrices,
  getMarketOutcome,
  getTokenIds
};
