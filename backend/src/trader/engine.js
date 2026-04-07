/**
 * PolyChamp Auto-Trading Engine
 *
 * Ticks:
 *   Every 30s  — detect new trades from qualifying wallets, place orders
 *   Every 60s  — detect counter-trades, close positions
 *   Every 5min — re-evaluate qualifying wallets list
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { query, pool } = require('../database/connection');
const logger          = require('../utils/logger');
const poly            = require('./polymarket');
const telegram        = require('../notifications/telegram');

// ─── Balance helper ──────────────────────────────────────────────────────────

async function getBalanceInfo() {
  try {
    const balanceInfo = await poly.getBalance();

    // Handle new balance format (returns object with liquid/unredeemed/total)
    const liquidBalance = balanceInfo?.liquid ?? balanceInfo ?? 0;
    const unredeemed = balanceInfo?.unredeemed ?? 0;

    const lockedRes = await query(
      `SELECT COALESCE(SUM(size_usd), 0) AS locked FROM auto_positions WHERE status IN ('pending','open')`
    );
    const countRes = await query(
      `SELECT COUNT(*) AS count FROM auto_positions WHERE status IN ('pending','open')`
    );
    const locked = parseFloat(lockedRes.rows[0].locked);
    const openCount = parseInt(countRes.rows[0].count, 10);

    // Log unredeemed balance warning
    if (unredeemed > 0) {
      logger.warn('[trader] Unredeemed winnings detected', {
        amount: '$' + unredeemed.toFixed(2),
        message: 'Claim at https://polymarket.com'
      });
    }

    return {
      available: liquidBalance,
      unredeemed: unredeemed,
      locked,
      openCount
    };
  } catch (err) {
    logger.error('[trader] Failed to get balance info for notification', { error: err.message });
    return { available: 0, unredeemed: 0, locked: 0, openCount: 0 };
  }
}

// ─── Config helpers ──────────────────────────────────────────────────────────

async function getConfig() {
  const res = await query('SELECT key, value FROM trader_config');
  const cfg = {};
  for (const row of res.rows) cfg[row.key] = row.value;
  return {
    enabled:          cfg.enabled === 'true',
    topN:             parseInt(cfg.top_n          || '150', 10),
    minTrades:        parseInt(cfg.min_trades     || '3',   10),
    minSuccessPct:    parseFloat(cfg.min_success_pct || '85'),
    minScore:         parseFloat(cfg.min_score    || '55'),
    marketMaxDays:    parseInt(cfg.market_max_days|| '14',  10),
    minHoursToResolve: parseFloat(cfg.min_hours_to_resolve || '2'),
    positionSizePct:  parseFloat(cfg.position_size_pct || '5'),
    maxLockedPct:     parseFloat(cfg.max_locked_pct    || '25'),
    minOrderUsd:      parseFloat(cfg.min_order_usd     || '1'),
    maxEntryPrice:    parseFloat(cfg.max_entry_price   || '0.95'),
  };
}

async function log(eventType, message, { marketId = null, wallet = null, details = null } = {}) {
  try {
    await query(
      `INSERT INTO trading_log (event_type, market_id, wallet, message, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventType, marketId, wallet, message, details ? JSON.stringify(details) : null]
    );
  } catch {}
  logger.info(`[trader] ${eventType}: ${message}`);
}

// Log a missed trading opportunity (separate table for persistent tracking)
async function logMissedOpportunity({
  marketId, wallet, username, outcome, question, category, reason,
  currentPrice = null, maxEntryPrice = null,
  positionSize = null, minOrderUsd = null,
  lockedCapital = null, maxLocked = null,
  details = null
}) {
  try {
    await query(
      `INSERT INTO missed_opportunities
       (market_id, wallet, username, outcome, market_question, market_category, reason,
        current_price, max_entry_price, position_size, min_order_usd, locked_capital, max_locked, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [marketId, wallet, username, outcome, question, category, reason,
       currentPrice, maxEntryPrice, positionSize, minOrderUsd, lockedCapital, maxLocked,
       details ? JSON.stringify(details) : null]
    );
    logger.info(`[trader] missed_opportunity: ${reason} - ${username || wallet.slice(0, 8)}… ${outcome} on ${question?.slice(0, 50) || marketId.slice(0, 20)}`);
  } catch (err) {
    logger.error('Failed to log missed opportunity', { error: err.message });
  }
}

// ─── Qualifying wallets (refreshed every 5 min) ───────────────────────────────

let qualifyingWallets = new Set();
let lastWalletRefresh = 0;

async function refreshQualifyingWallets(cfg) {
  // Use outcome_traded filter rather than is_binary flag — the collector maps all
  // 2-outcome markets to YES/NO regardless of Gamma's is_binary classification.
  const isBinary     = `UPPER(t.outcome_traded) IN ('YES','NO')`;
  const winExpr      = `COUNT(*) FILTER (WHERE m.resolved = true AND ${isBinary} AND UPPER(t.outcome_traded) = UPPER(m.winning_outcome))`;
  const resolvedExpr = `COUNT(*) FILTER (WHERE m.resolved = true AND ${isBinary})`;
  const scoreExpr    = `LEAST(100, ROUND(
    GREATEST(0.0, ((${winExpr} + 2.0) / ((${resolvedExpr}) + 4.0) - 0.5) * 90.0)
    + LEAST(20.0, LOG(GREATEST(1.0, SUM(t.amount_usdc)))      / LOG(500001.0) * 20.0)
    + LEAST(15.0, LOG(GREATEST(1.0, COUNT(*)))                / LOG(101.0)    * 15.0)
    + GREATEST(0.0, 10.0 * (1.0 - GREATEST(0.0, EXTRACT(EPOCH FROM (NOW() - MAX(t.timestamp))) / 86400.0 - 7.0) / 23.0))
    + LEAST(10.0, LOG(GREATEST(1.0, COUNT(DISTINCT t.market_id))) / LOG(21.0) * 10.0)
  )::integer)`;

  const res = await query(`
    SELECT t.wallet_address
    FROM trades t
    LEFT JOIN markets m ON m.id = t.market_id
    WHERE ${isBinary}
    GROUP BY t.wallet_address
    HAVING
      COUNT(*) FILTER (WHERE ${isBinary}) >= $1
      AND NULLIF(${resolvedExpr}, 0) IS NOT NULL
      AND (${winExpr} * 100.0 / NULLIF(${resolvedExpr}, 0)) >= $2
      AND ${scoreExpr} >= $3
    ORDER BY ${scoreExpr} DESC
    LIMIT $4
  `, [cfg.minTrades, cfg.minSuccessPct, cfg.minScore, cfg.topN]);

  const qualifying = new Set(res.rows.map(r => r.wallet_address));

  const added   = [...qualifying].filter(w => !qualifyingWallets.has(w));
  const removed = [...qualifyingWallets].filter(w => !qualifying.has(w));

  if (added.length || removed.length) {
    await log('new_qualifying_wallets',
      `Qualifying wallets: ${qualifying.size} (${added.length} added, ${removed.length} removed)`,
      { details: { count: qualifying.size, added, removed } }
    );
  }

  qualifyingWallets = qualifying;
  lastWalletRefresh = Date.now();
}

// ─── New trade detection ──────────────────────────────────────────────────────

// Track the last trade timestamp we've processed
let lastTradeTs = new Date(Date.now() - 65000).toISOString(); // start 65s ago

// Prevent concurrent runs (LISTEN notification + 30s tick can overlap)
let processingTrades = false;

async function processNewTrades(cfg) {
  if (processingTrades) return;
  if (!qualifyingWallets.size) return;
  processingTrades = true;
  try {
    await _processNewTrades(cfg);
  } finally {
    processingTrades = false;
  }
}

async function _processNewTrades(cfg) {
  if (!qualifyingWallets.size) return;

  // Fetch trades from qualifying wallets in the last window we haven't seen yet
  const walletList = [...qualifyingWallets];
  const placeholders = walletList.map((_, i) => `$${i + 2}`).join(',');
  const res = await query(`
    SELECT t.*, m.resolution_date, m.start_date, m.resolved, m.winning_outcome,
           m.slug, m.is_binary,
           (EXTRACT(EPOCH FROM (m.resolution_date - NOW())) / 86400.0) AS days_to_resolve
    FROM trades t
    LEFT JOIN markets m ON m.id = t.market_id
    WHERE t.timestamp > $1
      AND t.wallet_address IN (${placeholders})
      AND UPPER(t.outcome_traded) IN ('YES','NO')
      AND m.resolved = FALSE
      AND m.resolution_date IS NOT NULL
      AND (EXTRACT(EPOCH FROM (m.resolution_date - NOW())) / 86400.0) BETWEEN 0 AND $${walletList.length + 2}
    ORDER BY t.timestamp ASC
  `, [lastTradeTs, ...walletList, cfg.marketMaxDays]);

  if (res.rows.length) {
    lastTradeTs = res.rows[res.rows.length - 1].timestamp;
  }

  const balance = await poly.getBalance();
  if (balance === null) {
    await log('error', 'Could not fetch balance — skipping trade cycle');
    return;
  }

  // Calculate current locked capital from open positions
  const lockedRes = await query(
    `SELECT COALESCE(SUM(size_usd), 0) AS locked FROM auto_positions WHERE status IN ('pending','open')`
  );
  let locked = parseFloat(lockedRes.rows[0].locked);

  // Effective capital = balance + locked (locked is already deducted from balance on Polymarket)
  const capital     = balance + locked;
  const maxLocked   = capital * cfg.maxLockedPct / 100;
  const positionSize = Math.round(capital * cfg.positionSizePct / 100 * 100) / 100;

  for (const trade of res.rows) {
    const marketId = trade.market_id;

    // Skip if we already have a position in this market
    const existingPos = await query(
      `SELECT id FROM auto_positions WHERE market_id = $1 AND status IN ('pending','open')`,
      [marketId]
    );
    if (existingPos.rows.length) {
      await log('skip_trade', `Already have position in market`, { marketId, wallet: trade.wallet_address });
      continue;
    }

    // Skip markets resolving too soon (illiquid short-term markets)
    const hoursToResolve = trade.days_to_resolve * 24;
    if (hoursToResolve < cfg.minHoursToResolve) {
      await logMissedOpportunity({
        marketId,
        wallet: trade.wallet_address,
        username: trade.username,
        outcome: trade.outcome_traded,
        question: trade.market_question,
        category: trade.market_category,
        reason: 'market_ending_soon',
        hoursToResolve: hoursToResolve.toFixed(1),
        minHoursToResolve: cfg.minHoursToResolve
      });
      continue;
    }

    // Max entry price check — skip near-certainty shares (price close to $1)
    const currentPrice = await poly.getCurrentPrice(marketId, trade.outcome_traded);
    if (currentPrice !== null && currentPrice >= cfg.maxEntryPrice) {
      await logMissedOpportunity({
        marketId,
        wallet: trade.wallet_address,
        username: trade.username,
        outcome: trade.outcome_traded,
        question: trade.market_question,
        category: trade.market_category,
        reason: 'price_too_high',
        currentPrice,
        maxEntryPrice: cfg.maxEntryPrice
      });
      continue;
    }

    // Min order check
    if (positionSize < cfg.minOrderUsd) {
      await logMissedOpportunity({
        marketId,
        wallet: trade.wallet_address,
        username: trade.username,
        outcome: trade.outcome_traded,
        question: trade.market_question,
        category: trade.market_category,
        reason: 'position_too_small',
        positionSize,
        minOrderUsd: cfg.minOrderUsd
      });
      continue;
    }

    // Max capital at risk check
    if (locked + positionSize > maxLocked) {
      await logMissedOpportunity({
        marketId,
        wallet: trade.wallet_address,
        username: trade.username,
        outcome: trade.outcome_traded,
        question: trade.market_question,
        category: trade.market_category,
        reason: 'capital_exceeded',
        positionSize,
        lockedCapital: locked,
        maxLocked
      });
      continue;
    }

    // Log the intent
    await log('open_position',
      `Copying ${trade.wallet_address.slice(0,8)}… ${trade.outcome_traded} on market ${marketId.slice(0,16)}…`,
      { marketId, wallet: trade.wallet_address, details: {
        outcome: trade.outcome_traded, size: positionSize, balance, locked, maxLocked
      }}
    );

    // Insert pending position record first
    await query(
      `INSERT INTO auto_positions (market_id, source_wallet, outcome, size_usd, status, market_question, market_category)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)
       ON CONFLICT (market_id) DO NOTHING`,
      [marketId, trade.wallet_address, trade.outcome_traded, positionSize,
       trade.market_question, trade.market_category]
    );

    // Place order (skipped if ENABLE_LIVE_TRADING != true)
    if (process.env.ENABLE_LIVE_TRADING !== 'true') {
      await query(
        `UPDATE auto_positions SET status='open', order_id='DRY_RUN' WHERE market_id=$1 AND status='pending'`,
        [marketId]
      );
      await log('open_position', `[DRY RUN] Would place ${trade.outcome_traded} for $${positionSize}`,
        { marketId, wallet: trade.wallet_address });
      locked = Math.round((locked + positionSize) * 100) / 100;

      // Send Telegram notification
      try {
        const posRes = await query(`SELECT * FROM auto_positions WHERE market_id=$1 AND status='open'`, [marketId]);
        const traderRes = await query(`
          SELECT wallet_address, username,
                 LEAST(100, ROUND(
                   GREATEST(0.0, ((COUNT(*) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) IN ('YES','NO') AND UPPER(t.outcome_traded) = UPPER(m.winning_outcome)) + 1.0) /
                                  ((COUNT(*) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) IN ('YES','NO'))) + 2.0) - 0.5) * 120.0)
                   + LEAST(15.0, LOG(GREATEST(1.0, COUNT(*)))                / LOG(101.0)    * 15.0)
                   + GREATEST(0.0, 10.0 * (1.0 - GREATEST(0.0, EXTRACT(EPOCH FROM (NOW() - MAX(t.timestamp))) / 86400.0 - 7.0) / 23.0))
                   + LEAST(10.0, LOG(GREATEST(1.0, SUM(t.amount_usdc)))      / LOG(500001.0) * 10.0)
                   + LEAST(5.0, LOG(GREATEST(1.0, COUNT(DISTINCT t.market_id))) / LOG(21.0) * 5.0)
                 )::integer) AS score
          FROM trades t
          LEFT JOIN markets m ON m.id = t.market_id
          WHERE t.wallet_address = $1
          GROUP BY t.wallet_address
        `, [trade.wallet_address]);
        if (posRes.rows[0] && traderRes.rows[0]) {
          const balanceInfo = await getBalanceInfo();
          await telegram.notifyPositionOpened(posRes.rows[0], traderRes.rows[0], balanceInfo);
        }
      } catch (err) {
        logger.error('[trader] Telegram notification failed (position opened)', { error: err.message });
      }
    } else {
      // Retry logic: attempt order placement with price validation
      const MAX_RETRIES = parseInt(process.env.ORDER_MAX_RETRIES || '3', 10);
      const RETRY_DELAY_MS = parseInt(process.env.ORDER_RETRY_DELAY_MS || '2000', 10);
      let result = null;
      let attempt = 1;

      while (attempt <= MAX_RETRIES && !result) {
        // Re-check price before each attempt (trading rush can move price quickly)
        const priceCheck = await poly.getCurrentPrice(marketId, trade.outcome_traded);
        if (priceCheck !== null && priceCheck >= cfg.maxEntryPrice) {
          await logMissedOpportunity({
            marketId,
            wallet: trade.wallet_address,
            username: trade.username,
            outcome: trade.outcome_traded,
            question: trade.market_question,
            category: trade.market_category,
            reason: 'price_moved_during_retry',
            currentPrice: priceCheck,
            maxEntryPrice: cfg.maxEntryPrice,
            details: { attempt }
          });
          break;
        }

        result = await poly.placeOrder(marketId, trade.outcome_traded, positionSize);

        if (!result && attempt < MAX_RETRIES) {
          await log('error',
            `Order failed (attempt ${attempt}/${MAX_RETRIES}) — retrying in ${RETRY_DELAY_MS / 1000}s...`,
            { marketId, wallet: trade.wallet_address, details: { attempt } }
          );
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          attempt++;
        } else {
          break;
        }
      }

      if (result) {
        await query(
          `UPDATE auto_positions SET status='open', order_id=$1, entry_price=$2 WHERE market_id=$3 AND status='pending'`,
          [result.orderId, result.price, marketId]
        );
        await log('open_position',
          `Order placed successfully${attempt > 1 ? ` (succeeded on attempt ${attempt})` : ''}`,
          { marketId, wallet: trade.wallet_address, details: { orderId: result.orderId, entryPrice: result.price, attempt } }
        );
        locked = Math.round((locked + positionSize) * 100) / 100;

        // Send Telegram notification
        try {
          const posRes = await query(`SELECT * FROM auto_positions WHERE market_id=$1 AND status='open'`, [marketId]);
          const traderRes = await query(`
            SELECT wallet_address, username,
                   LEAST(100, ROUND(
                     GREATEST(0.0, ((COUNT(*) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) IN ('YES','NO') AND UPPER(t.outcome_traded) = UPPER(m.winning_outcome)) + 1.0) /
                                    ((COUNT(*) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) IN ('YES','NO'))) + 2.0) - 0.5) * 120.0)
                     + LEAST(15.0, LOG(GREATEST(1.0, COUNT(*)))                / LOG(101.0)    * 15.0)
                     + GREATEST(0.0, 10.0 * (1.0 - GREATEST(0.0, EXTRACT(EPOCH FROM (NOW() - MAX(t.timestamp))) / 86400.0 - 7.0) / 23.0))
                     + LEAST(10.0, LOG(GREATEST(1.0, SUM(t.amount_usdc)))      / LOG(500001.0) * 10.0)
                     + LEAST(5.0, LOG(GREATEST(1.0, COUNT(DISTINCT t.market_id))) / LOG(21.0) * 5.0)
                   )::integer) AS score
            FROM trades t
            LEFT JOIN markets m ON m.id = t.market_id
            WHERE t.wallet_address = $1
            GROUP BY t.wallet_address
          `, [trade.wallet_address]);
          if (posRes.rows[0] && traderRes.rows[0]) {
            const balanceInfo = await getBalanceInfo();
            await telegram.notifyPositionOpened(posRes.rows[0], traderRes.rows[0], balanceInfo);
          }
        } catch (err) {
          logger.error('[trader] Telegram notification failed (position opened)', { error: err.message });
        }
      } else {
        await query(
          `UPDATE auto_positions SET status='failed', exit_reason='order_failed' WHERE market_id=$1 AND status='pending'`,
          [marketId]
        );
        await log('error',
          `Order placement failed after ${attempt} attempt${attempt > 1 ? 's' : ''}`,
          { marketId, wallet: trade.wallet_address, details: { attempts: attempt } }
        );
      }
    }
  }
}

// ─── Counter-trade & resolution detection ────────────────────────────────────

async function checkExits(cfg) {
  // Get all open positions
  const openRes = await query(
    `SELECT * FROM auto_positions WHERE status IN ('pending','open')`
  );
  if (!openRes.rows.length) return;

  let anyPositionClosed = false;

  for (const pos of openRes.rows) {
    // 1. Check if market resolved
    const mktRes = await query(
      `SELECT resolved, winning_outcome FROM markets WHERE id = $1`, [pos.market_id]
    );
    const mkt = mktRes.rows[0];
    if (!mkt) continue;

    if (mkt.resolved && mkt.winning_outcome) {
      const won = mkt.winning_outcome.toUpperCase() === pos.outcome.toUpperCase();
      const pnl = won ? pos.size_usd * (pos.entry_price > 0 ? (1 - pos.entry_price) / pos.entry_price : 1) : -pos.size_usd;
      const pnlPct = pos.entry_price > 0 ? (pnl / pos.size_usd) * 100 : 0;

      await query(
        `UPDATE auto_positions SET status='closed', exit_reason='market_resolved',
         closed_at=NOW(), pnl=$1, pnl_pct=$2, exit_price=$3 WHERE id=$4`,
        [pnl, pnlPct, won ? 1.0 : 0.0, pos.id]
      );
      await log('close_position',
        `Market resolved — ${won ? 'WON' : 'LOST'} position on ${pos.market_id.slice(0,16)}…`,
        { marketId: pos.market_id, wallet: pos.source_wallet,
          details: { outcome: pos.outcome, winning: mkt.winning_outcome, won } }
      );

      // Send Telegram notification
      try {
        const updatedPos = await query(`SELECT * FROM auto_positions WHERE id=$1`, [pos.id]);
        const traderRes = await query(`SELECT wallet_address, username FROM trades WHERE wallet_address=$1 LIMIT 1`, [pos.source_wallet]);
        if (updatedPos.rows[0] && traderRes.rows[0]) {
          const balanceInfo = await getBalanceInfo();
          await telegram.notifyPositionClosed(updatedPos.rows[0], traderRes.rows[0], balanceInfo);
        }
      } catch (err) {
        logger.error('[trader] Telegram notification failed (position closed)', { error: err.message });
      }

      anyPositionClosed = true;
      continue;
    }

    // Market resolved but no winner (cancelled / invalid market) — close position, pnl=0
    if (mkt.resolved && !mkt.winning_outcome) {
      await query(
        `UPDATE auto_positions SET status='closed', exit_reason='market_cancelled',
         closed_at=NOW(), pnl=0, pnl_pct=0 WHERE id=$1`,
        [pos.id]
      );
      await log('close_position',
        `Market cancelled/invalid — closing position with no pnl on ${pos.market_id.slice(0,16)}…`,
        { marketId: pos.market_id, wallet: pos.source_wallet,
          details: { outcome: pos.outcome } }
      );

      // Send Telegram notification
      try {
        const updatedPos = await query(`SELECT * FROM auto_positions WHERE id=$1`, [pos.id]);
        const traderRes = await query(`SELECT wallet_address, username FROM trades WHERE wallet_address=$1 LIMIT 1`, [pos.source_wallet]);
        if (updatedPos.rows[0] && traderRes.rows[0]) {
          const balanceInfo = await getBalanceInfo();
          await telegram.notifyPositionClosed(updatedPos.rows[0], traderRes.rows[0], balanceInfo);
        }
      } catch (err) {
        logger.error('[trader] Telegram notification failed (position closed)', { error: err.message });
      }

      anyPositionClosed = true;
      continue;
    }

    // 2. Check for counter-trade from the source wallet on this market
    // A counter-trade = source wallet places the OPPOSITE outcome on the same market
    const counterOutcome = pos.outcome === 'YES' ? 'NO' : 'YES';
    const counterRes = await query(`
      SELECT id FROM trades
      WHERE wallet_address = $1
        AND market_id = $2
        AND outcome_traded = $3
        AND timestamp > $4
      LIMIT 1
    `, [pos.source_wallet, pos.market_id, counterOutcome,
        pos.opened_at]);

    if (counterRes.rows.length) {
      await log('counter_trade_detected',
        `Source wallet placed counter-trade — exiting position on ${pos.market_id.slice(0,16)}…`,
        { marketId: pos.market_id, wallet: pos.source_wallet,
          details: { ourOutcome: pos.outcome, counterOutcome } }
      );

      let exitPrice = null;
      if (process.env.ENABLE_LIVE_TRADING === 'true') {
        if (pos.order_id && pos.order_id !== 'DRY_RUN') {
          // Try to cancel if still pending, otherwise exit
          await poly.cancelOrder(pos.order_id);
        }
        const exitResult = await poly.exitPosition(
          pos.market_id, pos.outcome, pos.token_id,
          parseFloat(pos.size_usd), parseFloat(pos.entry_price || 0)
        );
        exitPrice = exitResult?.price || null;
      }

      // Calculate PNL based on exit price
      const entryPrice = parseFloat(pos.entry_price || 0);
      const pnl = exitPrice && entryPrice > 0
        ? pos.size_usd * ((exitPrice - entryPrice) / entryPrice)
        : 0;
      const pnlPct = entryPrice > 0 && pnl !== 0 ? (pnl / pos.size_usd) * 100 : 0;

      await query(
        `UPDATE auto_positions SET status='closed', exit_reason='counter_trade', closed_at=NOW(), pnl=$1, pnl_pct=$2, exit_price=$3 WHERE id=$4`,
        [pnl, pnlPct, exitPrice, pos.id]
      );

      // Send Telegram notification
      try {
        const updatedPos = await query(`SELECT * FROM auto_positions WHERE id=$1`, [pos.id]);
        const traderRes = await query(`SELECT wallet_address, username FROM trades WHERE wallet_address=$1 LIMIT 1`, [pos.source_wallet]);
        if (updatedPos.rows[0] && traderRes.rows[0]) {
          const balanceInfo = await getBalanceInfo();
          await telegram.notifyPositionClosed(updatedPos.rows[0], traderRes.rows[0], balanceInfo);
        }
      } catch (err) {
        logger.error('[trader] Telegram notification failed (position closed)', { error: err.message });
      }

      anyPositionClosed = true;
    }
  }

  // When a position closes, immediately recalculate capital and re-scan for new opportunities.
  // Without this, the engine would wait up to 30s before the freed/won capital is reflected.
  if (anyPositionClosed) {
    await processNewTrades(cfg);
  }
}

// ─── Real-time notification listener ─────────────────────────────────────────

let listenerClient = null;

async function setupListener() {
  try {
    const client = await pool.connect();
    listenerClient = client;

    client.on('notification', async (msg) => {
      if (msg.channel !== 'new_trade') return;
      try {
        const payload = JSON.parse(msg.payload);
        // Only act if this wallet is currently qualifying
        if (!qualifyingWallets.has(payload.wallet)) return;
        const cfg = await getConfig();
        if (!cfg.enabled) return;
        // Ensure wallet list is fresh before processing
        if (Date.now() - lastWalletRefresh > 2 * 60 * 1000) {
          await refreshQualifyingWallets(cfg);
        }
        await processNewTrades(cfg);
      } catch (err) {
        logger.error('[trader] notification handler error', { error: err.message });
      }
    });

    client.on('error', (err) => {
      logger.error('[trader] LISTEN client error — reconnecting', { error: err.message });
      try { client.release(true); } catch {}
      listenerClient = null;
      if (running) setTimeout(setupListener, 5000);
    });

    await client.query('LISTEN new_trade');
    logger.info('[trader] Listening for real-time new_trade notifications');
  } catch (err) {
    logger.error('[trader] Could not set up LISTEN — will retry', { error: err.message });
    if (running) setTimeout(setupListener, 5000);
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

let running = false;
let tradeInterval, exitInterval, walletInterval;

async function tick30s() {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled) return;

    if (Date.now() - lastWalletRefresh > 2 * 60 * 1000) {
      await refreshQualifyingWallets(cfg);
    }

    await processNewTrades(cfg);
  } catch (err) {
    logger.error('[trader] tick30s error', { error: err.message });
  }
}

async function tick60s() {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled) return;
    await checkExits(cfg);
  } catch (err) {
    logger.error('[trader] tick60s error', { error: err.message });
  }
}

async function tick5min() {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled) return;
    await refreshQualifyingWallets(cfg);
  } catch (err) {
    logger.error('[trader] tick5min error', { error: err.message });
  }
}

function start() {
  if (running) return;
  running = true;
  logger.info('[trader] Engine starting');
  log('engine_start', `Auto-trader started (LIVE=${process.env.ENABLE_LIVE_TRADING})`);

  // Initial wallet load
  getConfig().then(cfg => refreshQualifyingWallets(cfg)).catch(() => {});

  // Real-time detection via PostgreSQL LISTEN/NOTIFY
  setupListener();

  tradeInterval  = setInterval(tick30s,        30  * 1000);
  exitInterval   = setInterval(tick60s,        60  * 1000);
  walletInterval = setInterval(tick5min, 2 * 60  * 1000);

  // First ticks after a short delay
  setTimeout(tick30s, 5000);
  setTimeout(tick60s, 10000);
}

function stop() {
  if (!running) return;
  running = false;
  clearInterval(tradeInterval);
  clearInterval(exitInterval);
  clearInterval(walletInterval);
  if (listenerClient) {
    try { listenerClient.release(); } catch {}
    listenerClient = null;
  }
  logger.info('[trader] Engine stopped');
  log('engine_stop', 'Auto-trader stopped');
}

if (require.main === module) {
  start();
  process.on('SIGTERM', stop);
  process.on('SIGINT',  stop);
}

module.exports = { start, stop, getConfig };
