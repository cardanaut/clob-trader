/**
 * Momentum Detector
 * Analyzes BTC 1min candles to detect spike opportunities
 */

'use strict';

const logger = require('../utils/logger');
const config = require('./config');

/**
 * Parse market question to extract market type
 * @param {String} question - Market question text
 * @returns {Object} { marketType, targetPrice, isAbove } or null if can't parse
 */
function parseMarketTarget(question) {
  if (!question) return null;

  const lowerQ = question.toLowerCase();

  // Check if this is an "Up or Down" market (BTC 5min format)
  // Example: "Bitcoin Up or Down - February 20, 5:40PM-5:45PM ET"
  if (lowerQ.includes('up or down')) {
    return {
      marketType: 'UP_DOWN',
      targetPrice: null, // No specific target, just compare start vs end
      isAbove: null      // Not applicable
    };
  }

  // Otherwise, parse as ABOVE/BELOW market with target price
  const isAbove = lowerQ.includes('above') || lowerQ.includes('over') || lowerQ.includes('higher than');
  const isBelow = lowerQ.includes('below') || lowerQ.includes('under') || lowerQ.includes('lower than');

  if (!isAbove && !isBelow) {
    logger.warn('[spike-detector] Cannot determine market type', { question });
    return null;
  }

  // Extract target price - look for patterns like "$95,000" or "$95000" or "95000" or "95k"
  const pricePatterns = [
    /\$?([\d,]+\.?\d*)\s*k/i,           // "95k" or "$95k"
    /\$?([\d,]+\.?\d*)/                 // "$95,000" or "95000"
  ];

  for (const pattern of pricePatterns) {
    const match = question.match(pattern);
    if (match) {
      let priceStr = match[1].replace(/,/g, ''); // Remove commas

      // Handle "k" suffix (thousands)
      if (match[0].toLowerCase().includes('k')) {
        priceStr = parseFloat(priceStr) * 1000;
      }

      const targetPrice = parseFloat(priceStr);

      if (!isNaN(targetPrice) && targetPrice > 0) {
        return {
          marketType: 'ABOVE_BELOW',
          targetPrice,
          isAbove: isAbove && !isBelow  // If both above and below mentioned, assume above
        };
      }
    }
  }

  logger.warn('[spike-detector] Cannot extract target price from question', { question });
  return null;
}

/**
 * Check if a candle triggers a momentum signal
 * @param {Object} candle - Binance 1min candle (CLOSED candle being evaluated)
 * @param {Number} referencePrice - Crypto price at cycle start (T+0)
 * @param {Number} minuteInCycle - Which candle minute (0=T+0, 1=T+1, 2=T+2)
 * @param {Object} market - Market data with question
 * @param {Number} minThreshold - Minimum movement % to trigger (e.g., 0.15)
 * @param {Number} maxThreshold - Maximum movement % to trigger (e.g., 0.30)
 * @param {String} strategyId - Strategy ID (e.g., 'T123-1MIN', 'T123-1MIN-HL')
 * @returns {Object|null} Signal { type, candle, minute, strategyId } or null
 */
function detectSignal(candle, referencePrice, minuteInCycle, market, minThreshold = 0.15, maxThreshold = 0.30, strategyId = 'T123-1MIN') {
  // Only check candles T+0, T+1, T+2 (checked at times T+1, T+2, T+3 when they close)
  if (minuteInCycle < config.MIN_ENTRY_MINUTE || minuteInCycle > config.MAX_ENTRY_MINUTE) {
    return null;
  }

  const strategyConfig = config.STRATEGIES[strategyId];

  // Dual-threshold strategy (T123-HL): Check both HL volatility AND OC movement
  if (strategyConfig && strategyConfig.dualThreshold) {
    // Get per-crypto thresholds if available
    let hlThreshold = strategyConfig.hlThreshold;
    let ocThreshold = strategyConfig.ocThreshold;

    if (strategyConfig.perCryptoThresholds && strategyConfig.perCryptoThresholds[market.crypto_symbol]) {
      const cryptoThresholds = strategyConfig.perCryptoThresholds[market.crypto_symbol];
      hlThreshold = cryptoThresholds.hlThreshold;
      ocThreshold = cryptoThresholds.ocThreshold;
    }

    // Calculate High-Low range percentage
    const hlPct = Math.abs((candle.high - candle.low) / referencePrice * 100);

    // Calculate Open-Close movement percentage
    const ocPct = Math.abs((candle.close - candle.open) / candle.open * 100);

    // Both conditions must be met
    if (hlPct < hlThreshold || ocPct < ocThreshold) {
      logger.debug('[spike-detector] Dual-threshold not met', {
        crypto: market.crypto_symbol,
        hlPct: hlPct.toFixed(3) + '%',
        hlThreshold: hlThreshold.toFixed(2) + '%',
        hlMet: hlPct >= hlThreshold,
        ocPct: ocPct.toFixed(3) + '%',
        ocThreshold: ocThreshold.toFixed(2) + '%',
        ocMet: ocPct >= ocThreshold,
        candleMinute: `T+${minuteInCycle}`,
        strategy: strategyId
      });
      return null;
    }

    // Check max threshold on the actual close movement
    if (ocPct > maxThreshold) {
      logger.warn('[spike-detector] Movement above maximum threshold (too volatile)', {
        crypto: market.crypto_symbol,
        ocPct: ocPct.toFixed(3) + '%',
        maxThreshold: maxThreshold.toFixed(2) + '%',
        candleMinute: `T+${minuteInCycle}`,
        strategy: strategyId
      });
      return null;
    }

    // Store the calculated movements for logging
    candle.movementPct = ocPct;
    candle.hlPct = hlPct;
    candle.ocPct = ocPct;

  } else {
    // Standard T123: Single threshold strategy
    // NEW FORMULA: TradingView-style candle movement
    // Movement % = Math.abs((close - open) / open * 100)
    const candleMovementPct = Math.abs((candle.close - candle.open) / candle.open * 100);

    // Check if candle movement is within the range (min to max)
    // Only trade if movement is >= minThreshold AND <= maxThreshold
    if (candleMovementPct < minThreshold) {
      logger.debug('[spike-detector] Movement below minimum threshold', {
        crypto: market.crypto_symbol,
        movement: candleMovementPct.toFixed(3) + '%',
        minThreshold: minThreshold.toFixed(2) + '%',
        candleMinute: `T+${minuteInCycle}`,
        strategy: strategyId
      });
      return null;
    }

    if (candleMovementPct > maxThreshold) {
      logger.warn('[spike-detector] Movement above maximum threshold (too volatile)', {
        crypto: market.crypto_symbol,
        movement: candleMovementPct.toFixed(3) + '%',
        maxThreshold: maxThreshold.toFixed(2) + '%',
        candleMinute: `T+${minuteInCycle}`,
        strategy: strategyId
      });
      return null;
    }

    // Store the calculated movement for logging
    candle.movementPct = candleMovementPct;
  }

  // Parse market target to understand what we're trading
  const marketTarget = parseMarketTarget(market.question);

  if (!marketTarget) {
    logger.warn('[spike-detector] Cannot parse market target, skipping signal', {
      question: market.question
    });
    return null;
  }

  const { marketType, targetPrice, isAbove } = marketTarget;
  const currentPrice = candle.close;
  const priceMovement = currentPrice - referencePrice;
  const movingUp = priceMovement > 0;

  // Determine correct trading direction based on market type and price movement
  let signalType;

  if (marketType === 'UP_DOWN') {
    // Market asks: "Bitcoin Up or Down"
    // UP = price at end >= price at start
    // DOWN = price at end < price at start
    // If momentum is UP → BUY UP (expect continuation)
    // If momentum is DOWN → BUY DOWN (expect continuation)
    signalType = movingUp ? 'BUY_YES' : 'BUY_NO';  // YES=UP, NO=DOWN

    logger.info('[spike-detector] SIGNAL DETECTED (UP/DOWN)', {
      minute: minuteInCycle,
      type: signalType,
      direction: movingUp ? 'UP' : 'DOWN',
      currentPrice,
      referencePrice,
      priceMovement: priceMovement.toFixed(2),
      rangePct: candle.movementPct.toFixed(3),
      question: market.question.slice(0, 80) + '...'
    });

  } else if (marketType === 'ABOVE_BELOW') {
    // Market asks: "Will BTC be ABOVE/BELOW $X?"
    if (isAbove) {
      // Market asks: "Will BTC be ABOVE $X?"
      // If price is spiking UP toward/above target → BUY YES (more likely to be above)
      // If price is dropping DOWN away from target → BUY NO (more likely to be below)
      if (movingUp && currentPrice >= targetPrice * 0.999) {
        // Price moving up and near/above target
        signalType = 'BUY_YES';
      } else if (!movingUp && currentPrice <= targetPrice * 1.001) {
        // Price moving down and near/below target
        signalType = 'BUY_NO';
      } else {
        // Price movement not significant relative to target
        return null;
      }
    } else {
      // Market asks: "Will BTC be BELOW $X?"
      // If price is dropping DOWN toward/below target → BUY YES (more likely to be below)
      // If price is spiking UP away from target → BUY NO (more likely to be above)
      if (!movingUp && currentPrice <= targetPrice * 1.001) {
        // Price moving down and near/below target
        signalType = 'BUY_YES';
      } else if (movingUp && currentPrice >= targetPrice * 0.999) {
        // Price moving up and near/above target
        signalType = 'BUY_NO';
      } else {
        // Price movement not significant relative to target
        return null;
      }
    }

    logger.info('[spike-detector] SIGNAL DETECTED (ABOVE/BELOW)', {
      minute: minuteInCycle,
      type: signalType,
      marketType: isAbove ? 'ABOVE' : 'BELOW',
      targetPrice,
      currentPrice,
      referencePrice,
      priceMovement: priceMovement.toFixed(2),
      rangePct: candle.movementPct.toFixed(3),
      question: market.question.slice(0, 80) + '...'
    });
  } else {
    logger.warn('[spike-detector] Unknown market type', { marketType });
    return null;
  }

  return {
    type: signalType,
    candle,
    minute: minuteInCycle,
    referencePrice,
    marketTarget,
    strategyId: strategyId || 'T123-1MIN'
  };
}

/**
 * Calculate expected P&L for a simulated trade
 * @param {String} signalType - 'BUY_YES' or 'BUY_NO'
 * @param {Number} entryPrice - Price paid on Polymarket (0-1)
 * @param {String} outcome - 'YES', 'NO', 'Up', or 'Down' (winning outcome)
 * @returns {Number} P&L % (e.g., +11.2 or -100)
 */
function calculatePnL(signalType, entryPrice, outcome) {
  const boughtYes = signalType === 'BUY_YES';

  // Normalize outcome to uppercase for comparison
  const normalizedOutcome = (outcome || '').toUpperCase();

  // Map "Up" to "YES" and "Down" to "NO" for consistency
  const isYesOutcome = normalizedOutcome === 'YES' || normalizedOutcome === 'UP';
  const isNoOutcome = normalizedOutcome === 'NO' || normalizedOutcome === 'DOWN';

  const won = (boughtYes && isYesOutcome) || (!boughtYes && isNoOutcome);

  if (won) {
    // Payout is $1, profit = (1 - entryPrice) / entryPrice
    return ((1 - entryPrice) / entryPrice) * 100;
  } else {
    // Total loss
    return -100;
  }
}

module.exports = {
  detectSignal,
  calculatePnL,
  parseMarketTarget
};
