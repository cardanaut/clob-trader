/**
 * Telegram Notification Service for SpikeTrading
 * Sends alerts for spike trade executions and completions
 */

const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE_URL = process.env.BASE_URL || 'https://jeer.currenciary.com';

const ENABLED = TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID;

/**
 * Send a Telegram message
 */
async function sendMessage(text, options = {}) {
  if (!ENABLED) {
    console.log('[Spike-Telegram] Not configured, skipping notification');
    return;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options,
    });
  } catch (err) {
    console.error('[Spike-Telegram] Failed to send message:', err.response?.data || err.message);
  }
}

/**
 * Format currency
 */
function fmt(amount) {
  return parseFloat(amount).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format percentage
 */
function pct(value) {
  const num = parseFloat(value);
  return (num >= 0 ? '+' : '') + num.toFixed(2) + '%';
}

/**
 * Escape HTML entities for Telegram
 */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Notify when a spike trade is opened — disabled (outcome-only notifications)
 */
async function notifyTradeOpened(trade, mode = 'PAPER') {
  return;
  const crypto = trade.crypto_symbol || 'BTC';
  const cryptoIcons = { 'BTC': '₿', 'ETH': 'Ξ', 'SOL': '◎', 'XRP': '✕' };
  const cryptoIcon = cryptoIcons[crypto] || '🪙';

  const marketUrl = `https://polymarket.com/event/${trade.market_id}`;
  const entryPrice = (parseFloat(trade.simulated_entry_price || trade.entry_price || 0) * 100).toFixed(0);
  const candleMovement = parseFloat(trade.candle_range_pct || 0).toFixed(2);
  const signalMinute = trade.signal_minute || 0;
  const amount = fmt(trade.position_size_usd);
  const signal = trade.signal_type === 'BUY_YES' ? 'UP ↗' : 'DOWN ↘';
  const modeEmoji = mode === 'LIVE' ? '🔴' : '📄';
  const capital = fmt(trade.capital_before || trade.balance_before || 0);

  // Ultra-compact: 2 lines only
  const message = `
🚀 ${mode} ${modeEmoji} · ${cryptoIcon} <b>${crypto}</b> · <b>${signal}</b> T+${signalMinute} · Entry <b>${entryPrice}¢</b> · ${amount}
Candle <b>${candleMovement}%</b> · Capital ${capital} · <a href="${marketUrl}">Market</a>
`.trim();

  await sendMessage(message);
}

/**
 * Check if current time is within EAT sleep hours (10PM - 6AM)
 * EAT = UTC+3, so sleep hours are 19:00 - 03:00 UTC
 */
function isEATSleepTime() {
  const now = new Date();
  const hourUTC = now.getUTCHours();
  // Sleep time: 19:00 UTC (22:00 EAT) to 03:00 UTC (06:00 EAT)
  return hourUTC >= 19 || hourUTC < 3;
}

/**
 * Track last notification times to avoid spam
 */
const lastNotificationTimes = {
  unredeemed: 0
};

/**
 * Notify about unredeemed balance (rate-limited and timezone-aware)
 * Only sends once per day, when unredeemed > threshold, and outside EAT sleep hours
 */
async function notifyUnredeemedBalance(unredeemedAmount, liquidBalance, mode = 'LIVE') {
  const THRESHOLD = 100; // Only notify if unredeemed > $100
  const RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // Once per day

  // Skip if below threshold
  if (unredeemedAmount < THRESHOLD) {
    return;
  }

  // Skip if notified recently (within 24 hours)
  const now = Date.now();
  const timeSinceLastNotification = now - lastNotificationTimes.unredeemed;
  if (timeSinceLastNotification < RATE_LIMIT_MS) {
    return;
  }

  // Skip if during EAT sleep hours
  if (isEATSleepTime()) {
    console.log('[Spike-Telegram] Skipping unredeemed notification (EAT sleep time)');
    return;
  }

  // Calculate percentage of total
  const total = liquidBalance + unredeemedAmount;
  const unredeemedPct = (unredeemedAmount / total * 100).toFixed(1);

  // Ultra-compact format with direct claim link
  const message = `
⚠️ <b>UNREDEEMED: ${fmt(unredeemedAmount)}</b> (${unredeemedPct}% locked)
Liquid ${fmt(liquidBalance)} · Total ${fmt(total)}
<b>Action:</b> <a href="https://polymarket.com/portfolio">Claim Winnings Here</a>
`.trim();

  await sendMessage(message);

  // Update last notification time
  lastNotificationTimes.unredeemed = now;

  console.log(`[Spike-Telegram] Sent unredeemed balance notification: ${fmt(unredeemedAmount)}`);
}

/**
 * Notify when a spike trade is completed — disabled (signal-only notifications)
 */
async function notifyTradeCompleted(trade, mode = 'PAPER') {
  return;
  const crypto = trade.crypto_symbol || 'BTC';
  const cryptoIcons = { 'BTC': '₿', 'ETH': 'Ξ', 'SOL': '◎', 'XRP': '✕' };
  const cryptoIcon = cryptoIcons[crypto] || '🪙';

  const marketUrl = `https://polymarket.com/event/${trade.market_id}`;
  const outcome = trade.outcome || 'PENDING';
  const pnlUsd = parseFloat(trade.pnl_usd || 0);
  const pnlPct = parseFloat(trade.pnl_pct || 0);
  const entryPrice = (parseFloat(trade.simulated_entry_price || trade.entry_price || 0) * 100).toFixed(0);
  const resolutionPrice = trade.resolution_price ? (parseFloat(trade.resolution_price) * 100).toFixed(0) : '0';
  const amount = fmt(trade.position_size_usd);
  const signal = trade.signal_type === 'BUY_YES' ? 'UP' : 'DOWN';

  const resultEmoji = outcome === 'WIN' ? '✅' : '❌';
  const modeEmoji = mode === 'LIVE' ? '🔴' : '📄';
  const pnlSign = pnlUsd >= 0 ? '+' : '';

  const capitalAfter = trade.capital_after || trade.balance_after || 0;
  const capital = fmt(capitalAfter);

  // Format signal with arrows
  const signalFormatted = trade.signal_type === 'BUY_YES' ? '<b>UP ↗</b>' : '<b>DOWN ↘</b>';

  // Format PNL with color emphasis
  const pnlFormatted = `<b>${pnlSign}${fmt(Math.abs(pnlUsd))}</b>`;

  // Ultra-compact: 2 lines only, show actual gain/loss
  const message = `
${resultEmoji} <b>${outcome}</b> ${modeEmoji} · ${cryptoIcon} <b>${crypto}</b> · ${signalFormatted} <b>${entryPrice}¢</b>→<b>${resolutionPrice}¢</b> · Gain: ${pnlFormatted}
Bet: ${amount} · Return: <b>${pct(pnlPct)}</b> · Capital ${capital} · <a href="${marketUrl}">Market</a>
`.trim();

  await sendMessage(message);
}

/**
 * Send activity log event to Telegram — disabled (outcome-only notifications)
 */
async function notifyActivityLog(eventType, message, data = {}) {
  return;
  if (!ENABLED) {
    return;
  }

  try {
    // Skip certain verbose events
    if (eventType === 'movement_summary') {
      return; // These are already logged every 20min, too noisy
    }

    const crypto = data.cryptoSymbol || data.crypto_symbol || '';
    const cryptoIcons = { 'BTC': '₿', 'ETH': 'Ξ', 'SOL': '◎', 'XRP': '✕' };
    const cryptoIcon = crypto ? cryptoIcons[crypto] || '🪙' : '';

    let formattedMessage = '';

    if (eventType === 'trade_executed') {
      // Trade executed - concise format matching other events
      const mode = data.details?.mode || 'PAPER';
      const modeEmoji = mode === 'LIVE' ? '🔴' : '📄';
      const details = data.details || {};
      const marketSlug = details.marketSlug || data.marketId || '';
      const marketUrl = marketSlug ? `<a href="https://polymarket.com/event/${marketSlug}">View Market</a>` : '';

      // Colorize and format message with emphasis on key numbers
      let colorizedMessage = esc(message);
      colorizedMessage = colorizedMessage.replace(/\bBUY_YES\b/g, '<b>UP ↗</b>');
      colorizedMessage = colorizedMessage.replace(/\bBUY_NO\b/g, '<b>DOWN ↘</b>');

      // Bold important numbers: shares, prices, and dollar amounts
      colorizedMessage = colorizedMessage.replace(/(\d+) shares/g, '<b>$1 shares</b>');
      colorizedMessage = colorizedMessage.replace(/@ (0\.\d+)/g, '@ <b>$1</b>');
      colorizedMessage = colorizedMessage.replace(/\(\$[\d.]+\)/g, (match) => `<b>${match}</b>`);
      colorizedMessage = colorizedMessage.replace(/Expected: (\+\$[\d.]+)/g, 'Expected: <b>$1</b>');

      formattedMessage = `${modeEmoji} <b>${mode} TRADE</b> · ${cryptoIcon} <b>${crypto}</b> · ${colorizedMessage}${marketUrl ? ' · ' + marketUrl : ''}`;

    } else if (eventType === 'trade_skipped') {
      // Trade skipped (emergency stop, price too high, etc.)
      const details = data.details || {};
      const reason = details.reason || '';
      const marketId = data.marketId || '';
      const marketSlug = details.marketSlug || '';
      const marketUrl = marketSlug ? `<a href="https://polymarket.com/event/${marketSlug}">View Market</a>` : '';

      if (reason === 'emergency_stop') {
        // Concise format: single line with key info
        formattedMessage = `⚠️ <b>EMERGENCY STOP</b> · ${cryptoIcon} <b>${crypto}</b> · ${esc(message)}${marketUrl ? ' · ' + marketUrl : ''}`;

      } else {
        // All other missed opportunities - concise single-line format
        let reasonEmoji = '⚠️';
        let reasonTitle = 'MISSED';

        if (reason === 'price_too_high') {
          reasonEmoji = '💰';
          reasonTitle = 'PRICE TOO HIGH';
        } else if (reason === 'no_liquidity') {
          reasonEmoji = '💧';
          reasonTitle = 'NO LIQUIDITY';
        } else if (reason === 'exposure_limit_exceeded') {
          reasonEmoji = '📊';
          reasonTitle = 'EXPOSURE LIMIT';
        } else if (reason === 'position_too_small') {
          reasonEmoji = '💵';
          reasonTitle = 'TOO SMALL';
        }

        formattedMessage = `${reasonEmoji} <b>${reasonTitle}</b> · ${cryptoIcon} <b>${crypto}</b> · ${esc(message)}${marketUrl ? ' · ' + marketUrl : ''}`;
      }

    } else if (eventType === 'PRICE_TOO_HIGH') {
      // Special handling for PRICE_TOO_HIGH events (concise format)
      const details = data.details || {};
      const marketSlug = details.marketSlug || data.marketId;
      const marketUrl = marketSlug ? `<a href="https://polymarket.com/event/${marketSlug}">View Market</a>` : '';
      formattedMessage = `💰 <b>PRICE TOO HIGH</b> · ${cryptoIcon} <b>${crypto}</b> · ${esc(message)}${marketUrl ? ' · ' + marketUrl : ''}`;

    } else if (eventType === 'signal_detected') {
      // Signal detected - colorized format matching activity log
      const details = data.details || {};
      const marketSlug = details.marketSlug || data.marketId;
      const marketUrl = marketSlug ? `<a href="https://polymarket.com/event/${marketSlug}">View Market</a>` : '';

      // Format signal type and emphasize key numbers
      let colorizedMessage = esc(message);
      colorizedMessage = colorizedMessage.replace(/\bBUY_YES\b/g, '<b>UP ↗</b>');
      colorizedMessage = colorizedMessage.replace(/\bBUY_NO\b/g, '<b>DOWN ↘</b>');

      // Bold percentages and prices
      colorizedMessage = colorizedMessage.replace(/(\d+\.\d+%)/g, '<b>$1</b>');
      colorizedMessage = colorizedMessage.replace(/@ (\d+¢)/g, '@ <b>$1</b>');

      formattedMessage = `⚡ <b>SIGNAL</b> · ${cryptoIcon} <b>${crypto}</b> · ${colorizedMessage}${marketUrl ? ' · ' + marketUrl : ''}`;

    } else if (eventType === 'engine_started') {
      formattedMessage = `✅ <b>Engine Started</b> · ${esc(message)}`;

    } else if (eventType === 'engine_stopped') {
      formattedMessage = `🛑 <b>Engine Stopped</b> · ${esc(message)}`;

    } else {
      // Generic event
      return; // Don't spam with other events
    }

    if (formattedMessage) {
      await sendMessage(formattedMessage);
    }

  } catch (err) {
    console.error('[Spike-Telegram] Failed to send activity log notification:', err.message);
  }
}

/**
 * Get current account stats from database
 */
async function getAccountStats() {
  try {
    const { query } = require('../database/connection');

    // Get current capital and exposure from latest summary
    const capitalResult = await query(`
      SELECT
        current_capital,
        total_exposure
      FROM spike_capital_history
      ORDER BY created_at DESC
      LIMIT 1
    `);

    // Get open positions count
    const positionsResult = await query(`
      SELECT COUNT(*) as count
      FROM spike_trades
      WHERE status = 'PENDING'
    `);

    // Get P&L stats
    const pnlResult = await query(`
      SELECT
        COUNT(*) as total_trades,
        SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN outcome = 'LOSS' THEN 1 ELSE 0 END) as losses,
        SUM(pnl_usd) as total_pnl
      FROM spike_trades
      WHERE outcome IN ('WIN', 'LOSS')
    `);

    const capital = capitalResult.rows[0]?.current_capital || 0;
    const exposure = capitalResult.rows[0]?.total_exposure || 0;
    const openPositions = parseInt(positionsResult.rows[0]?.count || 0);
    const totalTrades = parseInt(pnlResult.rows[0]?.total_trades || 0);
    const wins = parseInt(pnlResult.rows[0]?.wins || 0);
    const losses = parseInt(pnlResult.rows[0]?.losses || 0);
    const totalPnl = parseFloat(pnlResult.rows[0]?.total_pnl || 0);
    const winRate = totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) : '0.0';

    return {
      capital,
      exposure,
      exposurePct: capital > 0 ? (exposure / capital * 100).toFixed(1) : '0.0',
      openPositions,
      totalTrades,
      wins,
      losses,
      winRate,
      totalPnl
    };
  } catch (err) {
    console.error('[Spike-Telegram] Failed to get account stats:', err.message);
    return null;
  }
}

/**
 * Send account stats summary to Telegram
 */
async function sendAccountStats() {
  if (!ENABLED) {
    return;
  }

  try {
    const stats = await getAccountStats();
    if (!stats) {
      return;
    }

    const pnlSign = stats.totalPnl >= 0 ? '+' : '';

    // Ultra-compact: 2 lines
    const message = `
📊 <b>STATS</b> · Capital <b>${fmt(stats.capital)}</b> · Exposure ${fmt(stats.exposure)} (${stats.exposurePct}%)
Open ${stats.openPositions} · Trades ${stats.totalTrades} · W/L ${stats.wins}/${stats.losses} (<b>${stats.winRate}%</b>) · PNL <b>${pnlSign}${fmt(Math.abs(stats.totalPnl))}</b>
`.trim();

    await sendMessage(message);
  } catch (err) {
    console.error('[Spike-Telegram] Failed to send account stats:', err.message);
  }
}

/**
 * Send manual trading signal notification with all details for manual execution
 * @param {Object} signal - Signal details
 * @param {String} signal.crypto - Crypto symbol (BTC, ETH, SOL, XRP)
 * @param {String} signal.signalType - BUY_YES or BUY_NO
 * @param {Number} signal.signalMinute - T+0, T+1, or T+2
 * @param {Number} signal.candleMovement - Candle movement %
 * @param {Number} signal.entryPrice - Entry price (0-1)
 * @param {Number} signal.positionSize - Position size in USD
 * @param {String} signal.marketSlug - Market slug for URL
 * @param {String} signal.marketQuestion - Market question
 * @param {Object} signal.details - Additional details (strategy, tier, etc.)
 */
async function notifyManualTradingSignal(signal) {
  return;

  const crypto = signal.crypto || 'BTC';
  const cryptoIcons = { 'BTC': '₿', 'ETH': 'Ξ', 'SOL': '◎', 'XRP': '✕' };
  const cryptoIcon = cryptoIcons[crypto] || '🪙';

  const direction = signal.signalType === 'BUY_YES' ? 'UP ↗' : 'DOWN ↘';
  const directionEmoji = signal.signalType === 'BUY_YES' ? '🟢' : '🔴';

  // Signal timing (T+0, T+1, T+2)
  const timingLabel = signal.signalMinute === 0 ? 'T1'
    : signal.signalMinute === 1 ? 'T2'
    : 'T3';

  // Entry price in cents
  const entryPriceCents = (signal.entryPrice * 100).toFixed(0);

  // Movement percentage
  const movement = signal.candleMovement.toFixed(2);

  // Position size (ensure minimum $1)
  const positionSize = Math.max(1.00, signal.positionSize);
  const positionFmt = fmt(positionSize);

  // Market URL with pre-filled direction
  const outcome = signal.signalType === 'BUY_YES' ? 'yes' : 'no';
  const marketUrl = `https://polymarket.com/event/${signal.marketSlug}?outcome=${outcome}`;

  // Format values for alignment
  const cryptoValue = `${cryptoIcon} ${crypto}`.padEnd(12);
  const timingValue = timingLabel.padEnd(13);
  const movementValue = `${movement}%`.padEnd(13);

  // Compact 4-column table format with clear link
  // Note: Telegram doesn't support HTML inside <pre> tags, so no color in table
  const message = `
🎯 <b>TRADE SIGNAL</b> ${directionEmoji} · <a href="${marketUrl}"><b>Click to trade ${outcome.toUpperCase()}</b></a>
<pre>Crypto    │ ${cryptoValue} Direction │ ${direction}
Timing    │ ${timingValue} Entry     │ ${entryPriceCents}¢
Movement  │ ${movementValue} Position  │ ${positionFmt}</pre>
`.trim();

  await sendMessage(message);
}

module.exports = {
  notifyTradeOpened,
  notifyTradeCompleted,
  notifyUnredeemedBalance,
  notifyActivityLog,
  sendAccountStats,
  notifyManualTradingSignal,
  isEnabled: () => ENABLED,
};
