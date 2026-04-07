'use strict';

/**
 * Spike Alert Notifier
 * Sends desktop push notifications via ntfy.sh when a spike is detected.
 * The notification includes IQOption trading info (direction + period) so you
 * can manually mirror the trade on IQOption binary options.
 *
 * SETUP (one-time):
 *   1. Add NTFY_TOPIC=your-unique-topic to backend/.env
 *   2. On Windows: open https://ntfy.sh/your-unique-topic in Chrome and
 *      click "Allow notifications", OR install the ntfy desktop app from
 *      https://docs.ntfy.sh/subscribe/phone/
 *   3. That's it — no account needed for basic usage.
 *
 * HOW THE IQOption PERIOD IS CALCULATED:
 *   Signals fire when a 1-min candle closes (at the Nx:00 clock mark).
 *   The period you pick on IQOption should make the trade expire ~when the
 *   5-min Polymarket cycle ends, so:
 *
 *   Signal at T+0 candle (BEGIN) → detected at 1:00 → 4 min left → use 3 min
 *   Signal at T+1 candle        → detected at 2:00 → 3 min left → use 3 min
 *   Signal at T+2 candle        → detected at 3:00 → 2 min left → use 2 min
 *   Signal at T+3 candle        → detected at 4:00 → 1 min left → use 1 min
 */

const axios = require('axios');
const logger = require('../utils/logger');

// IQOption asset codes for binary options (Crypto pairs)
const IQOPTION_ASSETS = {
  BTC: 'BTCUSD',
  ETH: 'ETHUSD',
  SOL: 'SOLUSDT',
  XRP: 'XRPUSD'
};

/**
 * Map signal_minute (0-3) → IQOption period info.
 *
 * signal_minute is the candle index (0=T+0, 1=T+1, 2=T+2, 3=T+3).
 * The candle closes at (signal_minute + 1) minutes into the 5-min cycle,
 * leaving (4 - signal_minute) minutes until the market ends.
 */
function getIQOptionPeriod(signalMinute) {
  // Only 3 candles are checked per cycle (T+0, T+1, T+2 — T+3 is too late):
  //   signal_minute=0 (BEGIN): detected at 1:00, 4 min left → 3 min
  //   signal_minute=1 (T+1):   detected at 2:00, 3 min left → 3 min
  //   signal_minute=2 (T+2):   detected at 3:00, 2 min left → 2 min
  const minutesLeft = 4 - signalMinute; // 4, 3, 2

  if (minutesLeft >= 3) return { minutes: 3, seconds: 180, label: '3 min' };
  return               { minutes: 2, seconds: 120, label: '2 min' };
}

/**
 * Build the IQOption deep-link URL for a specific asset and period.
 * Format: https://iqoption.com/traderoom#activeTab=binary&asset=XRPUSD&period=120
 *
 * NOTE: IQOption's hash-based routing may not always honour the period param
 * if the tab is already open — always check the period displayed on screen.
 */
function buildIQOptionUrl(crypto, periodSeconds) {
  const asset = IQOPTION_ASSETS[crypto] || `${crypto}USD`;
  return `https://iqoption.com/traderoom#activeTab=binary&asset=${asset}&period=${periodSeconds}`;
}

/**
 * Build the Polymarket event URL from a market slug.
 * Format: https://polymarket.com/event/{slug}
 */
function buildPolymarketUrl(slug) {
  return `https://polymarket.com/event/${slug}`;
}

/**
 * Send a spike alert notification via ntfy.sh.
 *
 * @param {object} signal   - Signal object from detector.js
 * @param {object} market   - Market object { crypto_symbol, question, slug }
 * @param {number} minuteInCycle - Current minute in the 5-min cycle (1-4)
 */
async function sendSpikeAlert(signal, market, minuteInCycle) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return; // Silently skip if not configured

  const crypto = market.crypto_symbol;
  const isUp = signal.type === 'BUY_YES';
  const direction = isUp ? 'UP ↗' : 'DOWN ↘';
  const directionShort = isUp ? 'UP' : 'DOWN';
  const candleLabel = signal.minute === 0 ? 'BEGIN' : `T+${signal.minute}`;

  const movement = (
    signal.candle.movementPct ||
    Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100)
  ).toFixed(2);

  const period = getIQOptionPeriod(signal.minute);
  const iqUrl  = buildIQOptionUrl(crypto, period.seconds);
  const pmUrl  = buildPolymarketUrl(market.slug);
  const minutesLeft = 4 - signal.minute;

  const title = `🚨 SPIKE: ${crypto} ${direction}`;
  const message = [
    `+${movement}% • Detected at ${candleLabel} (~${minutesLeft} min left)`,
    `Polymarket: ${market.question}`,
    `IQOption: ${period.label} ${directionShort}`
  ].join('\n');

  const payload = {
    topic,
    title,
    message,
    priority: signal.minute >= 2 ? 5 : 4, // Urgent for T+2/T+3 (less time to act)
    tags: ['chart_with_upwards_trend', 'bell'],
    actions: [
      {
        action: 'view',
        label: `Polymarket ${directionShort}`,
        url: pmUrl
      },
      {
        action: 'view',
        label: `IQOption ${period.label} ${directionShort}`,
        url: iqUrl
      }
    ]
  };

  try {
    await axios.post('https://ntfy.sh', payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
      proxy: false
    });
    logger.info('[notifier] Spike alert sent', { crypto, direction: directionShort, candleLabel, period: period.label });
  } catch (err) {
    logger.warn('[notifier] Failed to send spike alert', { error: err.message });
  }
}

module.exports = { sendSpikeAlert };
