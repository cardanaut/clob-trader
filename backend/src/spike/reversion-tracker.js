'use strict';

/**
 * Reversion Tracker
 *
 * After a spike fires and you enter a COUNTER-spike position on Polymarket
 * (e.g. spike UP → buy DOWN token at 25¢), this module monitors the live
 * Binance price stream and the CLOB DOWN token price to alert you when
 * the mean reversion target is reached and you should sell.
 *
 * HOW IT WORKS:
 *   1. Engine calls watch() when a spike fires
 *   2. You manually enter the counter position on Polymarket
 *   3. On every live Binance tick, we check if price has reverted from spike
 *   4. We also read the live CLOB DOWN token price
 *   5. When DOWN token gains +20%, +40%, or fully reverts → ntfy alert
 *
 * REVERSION LEVELS:
 *   - LEVEL_1 (+20%): DOWN goes 25¢ → 30¢  — quick scalp, low risk
 *   - LEVEL_2 (+40%): DOWN goes 25¢ → 35¢  — better profit
 *   - LEVEL_3 (+80%): DOWN goes 25¢ → 45¢  — price nearly back at reference
 *
 * ENABLED BY:
 *   Set REVERSION_TRACKING=true in backend/.env
 */

const axios = require('axios');
const logger = require('../utils/logger');
const clobWebsocket = require('./clob-websocket');

// Feature flag — disabled by default until user opts in
const ENABLED = process.env.REVERSION_TRACKING === 'true';

// Gain targets on the DOWN token (relative to entry price)
// e.g. 0.20 = sell when DOWN token is 20% higher than when you entered
const GAIN_TARGETS = [0.20, 0.40, 0.80];
const GAIN_LABELS  = ['🟡 +20% — quick scalp', '🟠 +40% — good profit', '🔴 +80% — near reference'];

// Active watches: Map<crypto_symbol, WatchState>
const watches = new Map();

/**
 * Start tracking reversion for a spike.
 * Called immediately after a spike signal fires in engine.js.
 *
 * @param {string} crypto          - e.g. 'BTC'
 * @param {string} spikeDirection  - 'UP' or 'DOWN'
 * @param {number} spikePrice      - Binance price at spike candle close
 * @param {number} referencePrice  - Cycle T+0 open (Binance price)
 * @param {Date}   cycleEnd        - When the Polymarket market expires
 */
function watch(crypto, spikeDirection, spikePrice, referencePrice, cycleEnd) {
  if (!ENABLED) return;

  // Read the live CLOB price for the counter token at the moment of spike
  const allPrices = clobWebsocket.getLatestPrices();
  const tokenPrices = allPrices[crypto];

  // Counter direction: spike UP → counter is DOWN token, spike DOWN → counter is UP token
  const counterOutcome = spikeDirection === 'UP' ? 'down' : 'up';
  const entryTokenPrice = tokenPrices ? tokenPrices[counterOutcome] : null;

  const spikePct = Math.abs((spikePrice - referencePrice) / referencePrice * 100);

  logger.info('[reversion] Starting watch', {
    crypto,
    spikeDirection,
    spikePrice,
    referencePrice,
    spikePct: spikePct.toFixed(3) + '%',
    entryTokenPrice: entryTokenPrice ? entryTokenPrice.toFixed(2) + '¢ equivalent' : 'unknown (CLOB not ready)',
    cycleEnd: cycleEnd.toISOString().substring(11, 16)
  });

  watches.set(crypto, {
    crypto,
    spikeDirection,
    counterOutcome,      // 'down' for UP spike, 'up' for DOWN spike
    spikePrice,
    referencePrice,
    spikePct,
    entryTokenPrice,     // CLOB token price at moment of spike (our "buy" price)
    cycleEnd,
    startedAt: Date.now(),
    alertedLevels: new Set(),
    peakReversion: 0     // Track max reversion seen (for logging)
  });
}

/**
 * Called on every Binance kline update (both open and closed candles).
 * This is the heartbeat of the reversion tracker — Binance fires this
 * many times per second as trades happen, so we get near-real-time prices.
 *
 * @param {object} candle - Binance kline candle { crypto_symbol, close, isClosed, ... }
 */
function onCandle(candle) {
  if (!ENABLED) return;

  const w = watches.get(candle.crypto_symbol);
  if (!w) return;

  // Expire watch if cycle has ended
  if (new Date() >= w.cycleEnd) {
    logger.info('[reversion] Cycle ended, removing watch', {
      crypto: w.crypto,
      peakReversion: (w.peakReversion * 100).toFixed(1) + '%'
    });
    watches.delete(w.crypto);
    return;
  }

  const livePrice = candle.close;

  // Calculate how far price has reverted from spike back towards reference
  // 0.0 = still at spike price, 1.0 = back to reference, >1.0 = past reference
  const spikeDist = Math.abs(w.spikePrice - w.referencePrice);
  if (spikeDist === 0) return;

  let reversionRatio;
  if (w.spikeDirection === 'UP') {
    // Spike was UP: price spiked above reference, reversion = price coming back down
    reversionRatio = (w.spikePrice - livePrice) / spikeDist;
  } else {
    // Spike was DOWN: price spiked below reference, reversion = price coming back up
    reversionRatio = (livePrice - w.spikePrice) / spikeDist;
  }

  // Track peak reversion for logging
  if (reversionRatio > w.peakReversion) {
    w.peakReversion = reversionRatio;
  }

  // Read live CLOB counter token price
  const allPrices = clobWebsocket.getLatestPrices();
  const tokenPrices = allPrices[w.crypto];
  const currentTokenPrice = tokenPrices ? tokenPrices[w.counterOutcome] : null;

  // Calculate gain on counter token relative to entry
  let tokenGain = null;
  if (currentTokenPrice && w.entryTokenPrice && w.entryTokenPrice > 0) {
    tokenGain = (currentTokenPrice - w.entryTokenPrice) / w.entryTokenPrice;
  }

  // Check each gain target
  for (let i = 0; i < GAIN_TARGETS.length; i++) {
    const target = GAIN_TARGETS[i];
    const label  = GAIN_LABELS[i];

    if (w.alertedLevels.has(target)) continue;

    // Trigger on CLOB price gain if available, otherwise fall back to Binance reversion ratio
    const triggered = tokenGain !== null
      ? tokenGain >= target                    // Primary: actual token price gain
      : reversionRatio >= target * 0.5;        // Fallback: approx via Binance reversion

    if (triggered) {
      w.alertedLevels.add(target);

      const entryStr  = w.entryTokenPrice ? (w.entryTokenPrice * 100).toFixed(0) + '¢' : '?¢';
      const currentStr = currentTokenPrice  ? (currentTokenPrice  * 100).toFixed(0) + '¢' : '?¢';
      const gainStr   = tokenGain !== null  ? '+' + (tokenGain * 100).toFixed(0) + '%'  : '~' + (reversionRatio * 100).toFixed(0) + '% revert';

      logger.info('[reversion] 🔄 Target hit', {
        crypto: w.crypto, label, entryToken: entryStr, currentToken: currentStr,
        gain: gainStr, reversionPct: (reversionRatio * 100).toFixed(1) + '%'
      });

      sendReversionAlert(w, label, entryStr, currentStr, gainStr, livePrice, reversionRatio).catch(() => {});

      // If highest target hit, no more alerts needed
      if (i === GAIN_TARGETS.length - 1) {
        watches.delete(w.crypto);
      }
    }
  }
}

/**
 * Send ntfy.sh push notification for a reversion target hit.
 */
async function sendReversionAlert(w, label, entryStr, currentStr, gainStr, livePrice, reversionRatio) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;

  const counterDir   = w.spikeDirection === 'UP' ? 'DOWN ↘' : 'UP ↗';
  const spikeDir     = w.spikeDirection === 'UP' ? 'UP ↗'   : 'DOWN ↘';
  const minutesLeft  = Math.max(0, Math.round((w.cycleEnd - Date.now()) / 60000));

  const title = `🔄 SELL ${w.crypto} ${counterDir} — ${gainStr}`;
  const message = [
    `Token: ${entryStr} → ${currentStr} (${gainStr}) | ${label}`,
    `Spike was ${spikeDir} ${w.spikePct.toFixed(2)}% — price reverted ${(reversionRatio * 100).toFixed(0)}%`,
    `~${minutesLeft} min left in cycle`
  ].join('\n');

  const payload = {
    topic,
    title,
    message,
    priority: 5, // Always urgent — you need to act fast
    tags: ['rotating_arrows', 'moneybag']
  };

  try {
    await axios.post('https://ntfy.sh', payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
      proxy: false
    });
    logger.info('[reversion] Alert sent', { crypto: w.crypto, gainStr });
  } catch (err) {
    logger.warn('[reversion] Failed to send alert', { error: err.message });
  }
}

/**
 * Cancel an active watch (e.g. if you decided not to enter the position).
 */
function cancel(crypto) {
  if (watches.has(crypto)) {
    watches.delete(crypto);
    logger.debug('[reversion] Watch cancelled', { crypto });
  }
}

/** Return active watches (for debugging/status endpoint). */
function getActiveWatches() {
  return Array.from(watches.values()).map(w => ({
    crypto: w.crypto,
    spikeDirection: w.spikeDirection,
    counterOutcome: w.counterOutcome,
    spikePrice: w.spikePrice,
    entryTokenPrice: w.entryTokenPrice,
    spikePct: w.spikePct.toFixed(3) + '%',
    peakReversion: (w.peakReversion * 100).toFixed(1) + '%',
    alertedLevels: Array.from(w.alertedLevels),
    cycleEnd: w.cycleEnd,
    msRemaining: Math.max(0, w.cycleEnd - Date.now())
  }));
}

module.exports = { watch, onCandle, cancel, getActiveWatches };
