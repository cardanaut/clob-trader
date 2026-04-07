/**
 * Telegram Notification Service
 * Sends alerts for position openings and closures
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
    console.log('[Telegram] Not configured, skipping notification');
    return;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      ...options,
    });
  } catch (err) {
    console.error('[Telegram] Failed to send message:', err.response?.data || err.message);
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
  return (num >= 0 ? '+' : '') + num.toFixed(1) + '%';
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
 * Format duration in human-readable form
 */
function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);

  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h ${Math.floor((ms % 3600000) / 60000)}m`;
  return `${days}d ${Math.floor((ms % 86400000) / 3600000)}h`;
}

/**
 * Notify when a position is opened
 */
async function notifyPositionOpened(position, traderInfo, balanceInfo) {
  const traderName = traderInfo.username || position.source_wallet.slice(0, 8);
  const traderUrl = `${BASE_URL}/pages/trader.php?wallet=${position.source_wallet}`;
  const marketUrl = `https://polymarket.com/event/${position.market_id}`;
  const entryPrice = (parseFloat(position.entry_price || 0) * 100).toFixed(1);
  const score = traderInfo.score || 'N/A';
  const amount = fmt(position.size_usd);
  const outcome = esc(position.outcome);
  const category = esc(position.market_category);

  // Balance info
  const available = balanceInfo?.available || 0;
  const locked = balanceInfo?.locked || 0;
  const total = available + locked;
  const openCount = balanceInfo?.openCount || 0;

  const message = `
━━━ <b>PolyChamp Auto Trader</b> ━━━
🚀 <b>POSITION OPENED</b>

<a href="${marketUrl}">${esc(position.market_question)}</a>

👤 <a href="${traderUrl}">${esc(traderName)}</a> (Score: ${score}/100)
💰 ${amount} @ ${entryPrice}¢ on <b>${outcome}</b> · ${category}
💼 Available: ${fmt(available)} · In Positions: ${fmt(locked)} · Total: ${fmt(total)}
📊 Open Positions: <b>${openCount}</b>
🕐 ${new Date(position.opened_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  })}
`.trim();

  await sendMessage(message);
}

/**
 * Notify when a position is closed
 */
async function notifyPositionClosed(position, traderInfo, balanceInfo) {
  const traderName = traderInfo.username || position.source_wallet.slice(0, 8);
  const traderUrl = `${BASE_URL}/pages/trader.php?wallet=${position.source_wallet}`;
  const marketUrl = `https://polymarket.com/event/${position.market_id}`;
  const entryPrice = (parseFloat(position.entry_price || 0) * 100).toFixed(1);
  const exitPrice = position.exit_price
    ? (parseFloat(position.exit_price) * 100).toFixed(1)
    : 'N/A';

  // Calculate PNL
  const pnl = position.pnl ? parseFloat(position.pnl) : 0;
  const pnlPct = position.pnl_pct ? parseFloat(position.pnl_pct) : 0;
  const pnlEmoji = pnl >= 0 ? '📈' : '📉';
  const pnlSign = pnl >= 0 ? '+' : '';

  // Duration
  const duration = position.closed_at && position.opened_at
    ? formatDuration(new Date(position.closed_at) - new Date(position.opened_at))
    : 'N/A';

  // Exit reason (compact)
  const exitReasonMap = {
    counter_trade: 'Counter-trade',
    market_resolved: 'Market resolved',
    market_cancelled: 'Market cancelled',
    max_duration: 'Max duration',
    stop_loss: 'Stop loss',
    take_profit: 'Take profit',
  };
  const exitReason = exitReasonMap[position.exit_reason] || position.exit_reason || 'Unknown';

  // Balance info
  const available = balanceInfo?.available || 0;
  const locked = balanceInfo?.locked || 0;
  const total = available + locked;
  const openCount = balanceInfo?.openCount || 0;

  const message = `
━━━ <b>PolyChamp Auto Trader</b> ━━━
${pnlEmoji} <b>POSITION CLOSED</b>

<a href="${marketUrl}">${esc(position.market_question)}</a>

👤 <a href="${traderUrl}">${esc(traderName)}</a> · <b>${esc(position.outcome)}</b>
📊 ${entryPrice}¢ → ${exitPrice}¢ · ${fmt(position.size_usd)} · ${duration}
💰 PNL: <b>${pnlSign}${fmt(Math.abs(pnl))}</b> (${pct(pnlPct)})
💼 Available: ${fmt(available)} · In Positions: ${fmt(locked)} · Total: ${fmt(total)}
📊 Remaining Positions: <b>${openCount}</b>
🔖 ${exitReason} · ${new Date(position.closed_at || position.opened_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  })}
`.trim();

  await sendMessage(message);
}

/**
 * Send a test notification
 */
async function sendTestNotification() {
  const message = `
━━━ <b>PolyChamp Auto Trader</b> ━━━
✅ <b>NOTIFICATIONS ACTIVE</b>

Trading alerts configured and ready.
You'll receive: 🚀 Opens · 📊 Closes

<i>Test: ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })}</i>
`.trim();

  await sendMessage(message);
  console.log('[Telegram] Test notification sent successfully');
}

module.exports = {
  notifyPositionOpened,
  notifyPositionClosed,
  sendTestNotification,
  isEnabled: () => ENABLED,
};
