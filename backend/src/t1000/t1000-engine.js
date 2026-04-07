'use strict';

/**
 * T1000 Engine — Paper Trading for C40 / C50 / C60 / LIVE strategies
 *
 * Listens to sub-minute candle events from sub-candle-generator.
 * At each candle close:
 *   1. Checks if spike% >= threshold for enabled strategies
 *   2. If tradeable (CLOB price <= 0.95), records a pending paper trade
 * At cycle end (5:00):
 *   3. Resolves all pending trades — compare final price vs reference price
 *   4. Updates balance, win/loss counts, activity log
 *
 * State is persisted to JSON so it survives API restarts.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const logger = require('../utils/logger');
const axios  = require('axios');
const { query } = require('../database/connection');
const poly          = require('../trader/polymarket');
const kalshiTrader  = require('../trader/kalshi-trader');
const walletManager = require('../trader/wallet-manager');
const wd            = require('../trader/usdc-withdrawal');

let liveRealBalance = null;
// Per-wallet liquid USDC balances — walletId → number
const walletBalances = new Map();

async function refreshAllBalances() {
  // Default wallet
  try {
    const b = await poly.getBalance();
    // Use liquid (actual on-chain USDC.e spendable by CLOB) — NOT b.total.
    // b.total = liquid + unredeemed wins: the unredeemed portion is NOT in the wallet
    // yet and cannot be spent. Sizing on total causes the engine to attempt orders it
    // cannot afford → CLOB rejects them → markTradeFailed() → silent FAILED entries.
    const val = b?.liquid ?? null;
    if (val != null) {
      const prev = liveRealBalance;
      liveRealBalance = val;
      walletBalances.set('default', val);
      if (prev !== val) recordPnlEvent(val);
    }
  } catch (e) { /* keep stale value */ }

  // Extra wallets (from wallets.json)
  for (const w of walletManager.getExtraWallets()) {
    try {
      const b   = await w.client.getBalance();
      const val = b?.liquid ?? null;
      if (val != null) walletBalances.set(w.id, val);
    } catch (e) { /* keep stale */ }
  }
}

// Keep refreshLiveBalance as alias so existing internal call-sites continue to work.
const refreshLiveBalance = refreshAllBalances;

setInterval(refreshAllBalances, 60_000);
refreshAllBalances();

/**
 * Records an EOA-based PNL data point.
 * Condition: EOA balance changed AND locked == 0 AND redeemable == 0.
 * While any position is in-flight the call is deferred (lastTrackedEoa still updated).
 * PNL = EOA − baseEoaBalance (settled value only, no in-flight estimates).
 *
 * Triggered:
 *   • Periodically via refreshLiveBalance (when EOA changes after redemption clears)
 *   • After WIN→LOSS corrections in the redemption loop
 *   • After onCycleEnd resolves trades (falls through to refreshLiveBalance naturally)
 */
function recordPnlEvent(newEoa) {
  const s = strategies?.LIVE;
  if (!s || s.baseEoaBalance == null) return;

  // Initialise tracker on very first EOA reading — don't record an event yet
  if (s.lastTrackedEoa === null) {
    s.lastTrackedEoa = newEoa;
    saveState();
    return;
  }

  s.lastTrackedEoa = newEoa; // always track latest EOA

  // Defer while any position is still in-flight (OPEN or unredeemed WIN)
  const log        = s.activityLog || [];
  const locked     = log.filter(e => e.status === 'OPEN')
    .reduce((sum, e) => sum + (e.position || 0), 0);
  const redeemable = log.filter(e => e.status === 'WIN' && !e.redeemed)
    .reduce((sum, e) => sum + (e.position > 0 && e.entryPrice > 0 ? e.position / e.entryPrice : 0), 0);

  if (locked > 0 || redeemable > 0) {
    logger.info(`[t1000] PNL deferred — in-flight (locked=${locked.toFixed(2)}, redeem=${redeemable.toFixed(2)})`);
    return;
  }

  const base = s.baseEoaBalance;
  const pnl  = parseFloat((newEoa - base).toFixed(4));

  // Skip if PNL hasn't changed since the last stored data point
  const history = s.eoaPnlHistory;
  const lastPnl = history.length > 0 ? history[history.length - 1].pnl : null;
  if (lastPnl !== null && pnl === lastPnl) return;

  history.push({ time: new Date().toISOString(), eoa: newEoa, pnl });
  logger.info(`[t1000] PNL event: eoa=${newEoa.toFixed(4)} base=${base.toFixed(4)} pnl=${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)}`);
  saveState();
}

// Refresh CLOB's USDC.e allowance cache every 5 min — allowance is set to uint256.max
// at setup and never changes, so frequent polling is wasteful on residential proxy bandwidth.
setInterval(() => poly.refreshClobAllowanceCache(), 5 * 60_000);
poly.refreshClobAllowanceCache(); // immediate first call

// Single polling loop for all pending LIVE WIN redemptions.
// All wins are registered here (tradeId → {trade, is15m, dir, attempts, redeemAfter})
// and processed together once per minute — avoids N independent setTimeout chains.
const pendingRedemptions = new Map();
const REDEEM_MAX_ATTEMPTS = 120; // 2 hours — markets can be slow to close
// Prevents concurrent redemption txs for the same tradeId.
// The setInterval is async but doesn't await itself, so multiple iterations can
// all see redeemed=false and each send a tx — the last confirmed (0 USDC) then
// wrongly triggers a WIN→LOSS correction. This set acts as an in-flight lock.
const redeemInFlight = new Set();

// LIVE-before-MINI priority: LIVE's placeLiveOrder promise is stored here so
// LIVE_MINI can chain off it, ensuring LIVE's order hits the CLOB first.
// Key = `${cycleStart}_${crypto}_${durKey}` (e.g. "1774204500000_ETH_5m")
// or   `t1_${cycleStart}_${crypto}_${durKey}` for T+1 entries.
const _liveOrderPromises = new Map();

// Market-in-progress guard: once LIVE places any trade, block ALL new LIVE/LIVE_MINI
// entries until the market cycle where that trade lives has ended.
// This prevents a second trade from slipping in during the last seconds of a running
// market (e.g. ETH 5m WIN resolves early at 07:03 → clears maxPositions slot →
// BTC 15m T+1 fires at 07:04:59 and gets placed unchecked).
// Epoch ms of the latest LIVE market end time seen.
let _liveBlockedUntil = 0;

// Correlated spike filter: tracks last qualifying signal per crypto (LIVE only).
// Key = crypto, value = { ts: epochMs, direction: 'UP'|'DOWN' }
const recentSignals = {};

// D2 coordination buffer: holds qualifying signals until ≥coordMinCryptos cryptos
// fire the same direction in the same cycle, then executes all of them together.
// Key = `${cycleStart}:${direction}`, value = [{ signal params }, ...]
const liveCoordBuffers = new Map();

setInterval(async () => {
  try {
  if (pendingRedemptions.size === 0) return;
  const now = Date.now();
  for (const [tradeId, r] of pendingRedemptions) {
    if (now < r.redeemAfter) continue;
    // Guard: skip if already redeemed or corrected to LOSS since it was queued.
    // Match candle_size too — old log entries may have duplicate tradeIds (5m vs 15m collision pre-fix).
    const _redeemStrat = strategies[r.trade.stratKey] ?? strategies.LIVE;
    const liveEntry = (_redeemStrat?.activityLog || []).find(e => e.tradeId === tradeId && e.candle_size === r.trade.candleSize);
    if (liveEntry && (liveEntry.redeemed || liveEntry.status !== 'WIN')) {
      logger.info(`[t1000] redemption skipped — already resolved`, { tradeId, status: liveEntry.status, redeemed: liveEntry.redeemed });
      pendingRedemptions.delete(tradeId);
      continue;
    }
    // In-flight lock: if a redemption tx for this tradeId is already awaiting
    // confirmation, skip this interval tick — don't send a second tx.
    if (redeemInFlight.has(tradeId)) {
      logger.info(`[t1000] redemption in-flight, skipping interval tick`, { tradeId });
      continue;
    }
    // If a previous TX timed out waiting for receipt, check it before sending a new one.
    // This prevents duplicate TXs when the RPC error was transient (TX1 mined, TX2 = 0 USDC).
    // Wallet identity for this redemption — must be in scope for entire result-processing block
    const _rWid    = r.trade.walletId ?? 'default';
    const _rWallet = _rWid !== 'default' ? walletManager.getWallets().find(w => w.id === _rWid) : null;
    let result;
    if (r.pendingTxHash) {
      logger.info(`[t1000] checking pending tx receipt before new redemption attempt`, { tradeId, txHash: r.pendingTxHash });
      result = await poly.checkTxReceipt(r.pendingTxHash);
      if (!result) {
        logger.info(`[t1000] pending tx not yet confirmed, skipping tick`, { tradeId, txHash: r.pendingTxHash });
        continue; // don't send new TX
      }
      // TX confirmed — clear pending hash (in-memory and persisted) and process normally below
      r.pendingTxHash = null;
      const confirmedEntry = (strategies.LIVE?.activityLog || []).find(e => e.tradeId === tradeId && e.candle_size === r.trade.candleSize);
      if (confirmedEntry) delete confirmedEntry.pendingTxHash;
    } else {
      redeemInFlight.add(tradeId);
      r.attempts++;
      logger.info(`[t1000] auto-redeeming attempt ${r.attempts}/${REDEEM_MAX_ATTEMPTS}`, { tradeId, crypto: r.trade.crypto });
      // Use the wallet's own signer for redemption — default wallet uses poly singleton,
      // extra wallets use their own CLOB client (each has its own private key/EOA)
      const _redeemFn = _rWallet?.client?.redeemWinningPosition
        ? (c, cs, i, d) => _rWallet.client.redeemWinningPosition(c, cs, i, d)
        : (c, cs, i, d) => poly.redeemWinningPosition(c, cs, i, d);
      try {
        result = await _redeemFn(r.trade.crypto, r.trade.cycleStart, r.is15m, r.dir);
      } finally {
        redeemInFlight.delete(tradeId);
      }
      // TX sent but RPC failed to confirm receipt — store hash, retry next tick (no new TX)
      if (result && result.pendingTxHash) {
        logger.warn(`[t1000] redeemWinningPosition pending — will check receipt next tick`, { tradeId, txHash: result.pendingTxHash });
        r.pendingTxHash = result.pendingTxHash;
        r.attempts--; // don't count as a real attempt
        // Persist hash to activityLog entry so a restart doesn't lose track of the in-flight TX
        const pendingEntry = (strategies.LIVE?.activityLog || []).find(e => e.tradeId === tradeId && e.candle_size === r.trade.candleSize);
        if (pendingEntry) { pendingEntry.pendingTxHash = result.pendingTxHash; saveState(); }
        continue;
      }
    }
    if (result === 'LOSS') {
      // On-chain oracle disagrees with Binance — correct the activityLog entry to LOSS
      logger.warn(`[t1000] LIVE oracle mismatch — correcting WIN→LOSS`, { tradeId });
      const entry = (strategies.LIVE?.activityLog || []).find(e => e.tradeId === tradeId && e.candle_size === r.trade.candleSize);
      if (entry && entry.status === 'WIN') {
        entry.status = 'LOSS';
        entry.pnl    = -Math.max(0, entry.position ?? 0);  // safe: position always a number, but guard NaN
        const s = strategies.LIVE;
        s.wins   = Math.max(0, (s.wins   || 0) - 1);
        s.losses = (s.losses || 0) + 1;
        // Win pnl was deferred (never credited to balance) — just deduct the loss.
        s.balance = parseFloat(((s.balance || 0) - (entry.position ?? 0)).toFixed(6));
        saveState();
        recordPnlEvent(liveRealBalance ?? 0);
        telegramSend(`⚠️ <b>CORRECTION: ${r.trade.crypto} was a LOSS</b>\n${tradeId} • Chainlink oracle ≠ Binance — position worth $0`);
      } else {
        logger.warn('[t1000] oracle LOSS correction: entry not found or not WIN — no state change', { tradeId });
      }
      pendingRedemptions.delete(tradeId);
    } else if (result && result.txHash) {
      logger.info(`[t1000] redemption complete`, { tradeId, usdcReceived: result.usdcReceived, txHash: result.txHash });
      const entry = (_redeemStrat?.activityLog || []).find(e => e.tradeId === tradeId && e.candle_size === r.trade.candleSize);
      // Safety net: if the tx confirmed but we received nothing, the on-chain oracle actually
      // resolved against us (e.g. RPC lag caused wrong payoutNumerators read, or index mismatch).
      // Correct the entry to LOSS rather than leaving it as WIN pnl=-position.
      // Exception: if entry.redeemed is already true, a concurrent tx succeeded first — this
      // 0-USDC result is a no-op on-chain (tokens already claimed). Do NOT correct to LOSS.
      if (result.usdcReceived === 0) {
        if (entry && entry.redeemed) {
          logger.warn(`[t1000] redemption 0 USDC but entry already redeemed — concurrent tx race, ignoring`, { tradeId, txHash: result.txHash });
          pendingRedemptions.delete(tradeId);
        } else {
          logger.warn(`[t1000] redemption returned 0 USDC — correcting WIN→LOSS`, { tradeId, txHash: result.txHash });
          if (entry && entry.status === 'WIN') {
            entry.status   = 'LOSS';
            entry.pnl      = -Math.max(0, entry.position ?? 0);
            entry.redeemed = true;
            const s = _redeemStrat;
            if (s) {
              s.wins   = Math.max(0, (s.wins   || 0) - 1);
              s.losses = (s.losses || 0) + 1;
              s.balance = parseFloat(((s.balance || 0) - (entry.position ?? 0)).toFixed(6));
            }
            saveState();
            recordPnlEvent(liveRealBalance ?? 0);
            telegramSend(`⚠️ <b>CORRECTION: ${r.trade.crypto} was a LOSS</b>\n${tradeId} • tx confirmed but 0 USDC received\n<code>${result.txHash}</code>`);
          } else {
            logger.warn('[t1000] 0-USDC correction: entry not found or not WIN — no state change', { tradeId });
          }
          pendingRedemptions.delete(tradeId);
        }
      } else if (entry) {
        const realPnl = parseFloat((result.usdcReceived - r.trade.position).toFixed(6));
        entry.pnl      = realPnl;   // actual profit (received − spent)
        entry.redeemed = true;
        const s = _redeemStrat;
        if (s) s.balance = parseFloat(((s.balance || 0) + realPnl).toFixed(6));
        saveState();
        refreshLiveBalance(); // EOA just received USDC — update immediately, don't wait 60s
        // Also refresh extra wallet balance so UI shows updated amount immediately
        if (_rWid !== 'default' && _rWallet?.client?.getBalance) {
          _rWallet.client.getBalance().then(b => {
            if (b?.liquid != null) walletBalances.set(_rWid, b.liquid);
          }).catch(() => {});
        }
        const _walletTag = _rWid !== 'default' ? ` [${_rWid}]` : '';
        telegramSend(`💰 <b>REDEEMED: ${r.trade.crypto}</b>${_walletTag}\n${tradeId} • +$${result.usdcReceived.toFixed(4)} USDC.e → EOA\n<code>${result.txHash}</code>`);
        pendingRedemptions.delete(tradeId);
      }
      if (!entry) pendingRedemptions.delete(tradeId);
    } else if (result && result.alreadyRedeemed) {
      // Token balance was 0 before we sent a TX.
      // Two possible causes:
      //   A) A prior TX (e.g. during a crash window) already confirmed and claimed the USDC → use
      //      the exact on-chain payout from the PayoutRedemption event scan when available.
      //   B) The CLOB order was NEVER placed (engine crashed before placeOrderByToken completed)
      //      → no funds were spent, no tokens ever arrived → mark FAILED, not phantom WIN.
      logger.info(`[t1000] redemption: token balance=0 — checking orderPlaced flag`, { tradeId });
      const entry = (_redeemStrat?.activityLog || []).find(e => e.tradeId === tradeId && e.candle_size === r.trade.candleSize);
      if (entry && entry.status === 'WIN' && entry.entryPrice > 0) {
        if (result.usdcReceived != null) {
          // Case A confirmed: found PayoutRedemption event — real payout from prior TX
          const realPnl = parseFloat((result.usdcReceived - entry.position).toFixed(6));
          entry.pnl     = realPnl;
          entry.redeemed = true;
          delete entry.pendingTxHash;
          const s = _redeemStrat;
          if (s) s.balance = parseFloat(((s.balance || 0) + realPnl).toFixed(6));
          saveState();
          refreshLiveBalance();
          telegramSend(`💰 <b>RECOVERED: ${r.trade.crypto}</b>\n${tradeId} • prior TX already claimed +$${result.usdcReceived.toFixed(4)} USDC.e`);
        } else if (!entry.orderPlaced) {
          // Case B: no on-chain evidence AND order was never confirmed → phantom trade from crash
          logger.warn(`[t1000] PHANTOM TRADE detected — order never placed, marking FAILED`, { tradeId });
          entry.status   = 'FAILED';
          entry.pnl      = null;
          entry.position = 0;
          entry.redeemed = false;
          delete entry.pendingTxHash;
          const s = _redeemStrat;
          if (s) {
            s.wins    = Math.max(0, (s.wins || 0) - 1);
            // balance was never credited for this trade (pnl was null / deferred) — no balance correction needed
          }
          saveState();
          telegramSend(`⚠️ <b>PHANTOM TRADE: ${r.trade.crypto}</b>\n${tradeId} — order never reached CLOB (crash before fill confirmed)\nNo USDC spent or received. Trade marked FAILED.`);
        } else {
          // Case A-fallback: token balance=0, orderPlaced=true, but no PayoutRedemption event.
          // CTF token settlement can take 3+ hours for some Polymarket markets — keep retrying.
          // No formula fallback: formula estimates are inaccurate and hide unredeemed funds.
          // Instead, retry for 4 hours then alert via Telegram for manual action.
          r.alreadyRedeemedCount = (r.alreadyRedeemedCount || 0) + 1;
          const _maxAlreadyRedeemed = REDEEM_MAX_ATTEMPTS * 2; // 240 min = 4 hours
          if (r.alreadyRedeemedCount < _maxAlreadyRedeemed) {
            logger.warn(`[t1000] alreadyRedeemed but no PayoutRedemption found — retrying (${r.alreadyRedeemedCount}/${_maxAlreadyRedeemed})`, { tradeId });
            continue; // skip pendingRedemptions.delete — retry next minute
          }
          // After 4 hours with no tokens and no event → abandon, alert for manual redemption
          logger.error(`[t1000] alreadyRedeemed: CTF tokens not found after 4 hours — abandoning`, { tradeId });
          telegramSend(`🚨 <b>REDEMPTION STUCK: ${r.trade.crypto}</b>\n${tradeId} • CTF tokens not found after 4 hours\n<b>Manual redemption required via Polymarket.com or script!</b>`);
        }
      } else {
        logger.warn(`[t1000] alreadyRedeemed but entry not found or missing entryPrice`, { tradeId });
      }
      pendingRedemptions.delete(tradeId);
    } else if (r.attempts >= REDEEM_MAX_ATTEMPTS) {
      logger.warn(`[t1000] redemption gave up after ${REDEEM_MAX_ATTEMPTS} attempts`, { tradeId });
      telegramSend(`🚨 <b>REDEMPTION ABANDONED: ${r.trade.crypto}</b>\n${tradeId} • gave up after ${REDEEM_MAX_ATTEMPTS} attempts\n<b>Manual intervention required — USDC may be stuck in CTF!</b>`);
      pendingRedemptions.delete(tradeId);
    } else {
      logger.warn(`[t1000] redemption not ready, retrying next minute (${r.attempts}/${REDEEM_MAX_ATTEMPTS})`, { tradeId });
    }
  }
  maybeAutoWithdraw();
  } catch (err) {
    logger.error('[t1000] redemption interval uncaught error — engine safe, retrying next tick', { error: err.message, stack: err.stack });
  }
}, 60_000);

// Periodic orphan scan — every 30 minutes — catches positions that slip through mid-session.
// Reduced from 4h: if a phantom trade occurs (order placed but activityLog entry lost in a crash),
// capital calculations are wrong until the orphan is discovered and corrected.
setInterval(() => scanOrphanedPositions().catch(e =>
  logger.warn('[t1000] periodic orphan scan failed', { error: e.message })
), 30 * 60 * 1000);

// ── Opportunistic withdrawal: fire when engine goes idle ──────────────────────
// Called after each redemption tick and after onCycleEnd.
// Only triggers if no LIVE positions are open AND no redemptions are in flight.
// Debounced to 5 min to avoid RPC churn; checkAndWithdraw() has its own 4h cooldown.
let _lastWdCheck = 0;
function maybeAutoWithdraw() {
  if (Date.now() - _lastWdCheck < 5 * 60 * 1000) return;
  if (pendingRedemptions.size > 0) return;
  const hasOpenLive = [...pendingTrades.values()].some(t =>
    t.stratKey === 'LIVE' || t.stratKey === 'LIVE_MINI' || t.stratKey === 'LIVE_KALSHI'
  );
  if (hasOpenLive) return;
  _lastWdCheck = Date.now();
  wd.checkAndWithdrawAll().then(results => {
    for (const [wid, r] of Object.entries(results)) {
      if (r.executed) logger.info(`[withdrawal] idle-triggered withdrawal done (${wid})`, { amount: r.amount, txHash: r.txHash });
      else if (r.error) logger.error(`[withdrawal] idle-triggered withdrawal error (${wid})`, { error: r.error });
    }
  }).catch(e => logger.error('[withdrawal] idle-triggered withdrawal error', { error: e.message }));
}

// Kalshi WebSocket — injected from server.js
let kalshiWebsocket = null;
function setKalshiWebsocket(ws) { kalshiWebsocket = ws; }

let kalshiRealBalance = null;
async function refreshKalshiBalance() {
  try { kalshiRealBalance = (await kalshiTrader.getBalance())?.available ?? null; }
  catch (e) { /* keep stale */ }
}
setInterval(refreshKalshiBalance, 60_000);
refreshKalshiBalance();

// ── CLOB subscription getters (injected from server.js) ────────────────────────
// Gives real-time token IDs for placing live orders on Polymarket.
let _clobSubGetter5m  = null; // (crypto) => { upTokenId, downTokenId }
let _clobSubGetter15m = null;
// Injected from server.js — returns current Binance close price for RECOVER checks
let _currentCloseGetter = null; // (crypto) => number | null
// Injected from server.js — returns { '5m': {BTC,ETH,SOL,XRP}, '15m': {...} } T0 cycle opens
let _cycleRefGetter = null;

function setCurrentCloseGetter(fn) { _currentCloseGetter = fn; }
function setCycleRefGetter(fn)      { _cycleRefGetter      = fn; }

function setSubscriptionGetters(getter5m, getter15m) {
  _clobSubGetter5m  = getter5m;
  _clobSubGetter15m = getter15m;
}

// ── NTFY + Telegram notifications ──────────────────────────────────────────────
// Only LIVE and LIVE_KALSHI (when enabled) send notifications. Paper Cxx tabs never do.
const NTFY_KEYS = new Set();
let   NTFY_LABEL = {};

// Rebuilds NTFY_KEYS to match current enable state. Called after loadState() and
// after every config save.
function rebuildNtfyKeys() {
  NTFY_KEYS.clear();
  NTFY_LABEL = {};
  if (strategies.LIVE?.enabled)        NTFY_KEYS.add('LIVE');
  if (strategies.LIVE_KALSHI?.enabled) NTFY_KEYS.add('LIVE_KALSHI');
  if (strategies.LIVE_MINI?.enabled)   NTFY_KEYS.add('LIVE_MINI');
}

const POLY_SLUG = {
  BTC: { 5: 'btc-updown-5m',  15: 'btc-updown-15m' },
  ETH: { 5: 'eth-updown-5m',  15: 'eth-updown-15m' },
  SOL: { 5: 'sol-updown-5m',  15: 'sol-updown-15m' },
  XRP: { 5: 'xrp-updown-5m',  15: 'xrp-updown-15m' },
};

function polyUrl(crypto, cycleStartMs, candleSize) {
  const dur  = candleSize >= 150 ? 15 : 5;
  const slug = POLY_SLUG[crypto]?.[dur];
  return slug ? `https://polymarket.com/event/${slug}-${Math.round(cycleStartMs / 1000)}` : null;
}

function ntfySend(title, message, priority = 3, url = null) {
  const topic = process.env.NTFY_TOPIC || 'jfat1000';
  const payload = { topic, title, message, priority };
  if (url) payload.click = url;
  const body = JSON.stringify(payload);
  const req  = https.request({
    hostname: 'ntfy.sh', method: 'POST', path: '/',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

function telegramSend(text) {
  return; // notifications disabled
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
  const req  = https.request({
    hostname: 'api.telegram.org', method: 'POST',
    path: `/bot${token}/sendMessage`,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

const STATE_FILE      = path.join(__dirname, '../../../logs/t1000-state.json');
// Crash-safe CB backup: written synchronously when CB is armed, read on startup.
// Ensures CB is not lost if the process crashes between arming and async saveState completing.
const CB_FILE         = path.join(__dirname, '../../../logs/t1000-cb.json');
const RISK_PCT        = 0.05;   // 5% of current balance per trade
const MAX_ENTRY_PRICE = 0.90;   // Skip if CLOB >= 90¢
const MAX_LOG_ENTRIES = 500;

// Per-market-type trade caps and starting balances
// 5-min:  maxTrade $150, startBalance $4 000  (risk per trade: 3.75% at start, capped at $150)
// 15-min: maxTrade $500, startBalance $10 000 (risk per trade: 5% at start, capped at $500)
const MAX_TRADE_5M  = 150;
const MAX_TRADE_15M = 500;
const START_BAL_5M  = 4000;


// Default per-crypto max trade caps — mirrors simulator defaults
const PM_MAX_BY_CRYPTO  = { BTC: 1000, ETH: 500, SOL: 150, XRP: 150  };
const KAL_MAX_BY_CRYPTO = { BTC: 1000, ETH: 500, SOL: 200, XRP: 150  };

// Max pipeline latency before a LIVE signal is considered too stale to trade.
// If the candle-close → engine pipeline is slower than this, skip the LIVE order.
// Paper trades are unaffected (no real money, no time pressure).
const MAX_SIGNAL_AGE_5M  =  60_000;  // 60s in a 300s cycle — e.g. a queue backup
const MAX_SIGNAL_AGE_15M = 180_000;  // 180s in a 900s cycle

// ── Default state ──────────────────────────────────────────────────────────────

function makeStrategy(overrides = {}) {
  const maxTrade     = overrides.maxTrade     ?? MAX_TRADE_5M;
  const startBalance = overrides.startBalance ?? (maxTrade / RISK_PCT);
  return {
    enabled      : false,
    threshold    : 0.24,              // spike% to trigger
    minPrice     : 0,                 // min CLOB entry price (0 = no floor)
    maxPrice     : MAX_ENTRY_PRICE,   // max CLOB entry price ceiling
    maxTrade,                         // max $ per trade (hard cap on position size)
    startBalance,                     // starting balance (for ROI calculation)
    balance      : startBalance,
    wins         : 0,
    losses       : 0,
    activityLog  : [],
    threshold_BTC: overrides.threshold_BTC ?? null,
    threshold_ETH: overrides.threshold_ETH ?? null,
    threshold_SOL: overrides.threshold_SOL ?? null,
    threshold_XRP: overrides.threshold_XRP ?? null,
    // Per-crypto max trade caps (PM markets — applies to paper C50–C255)
    maxTrade_BTC: overrides.maxTrade_BTC ?? PM_MAX_BY_CRYPTO.BTC,
    maxTrade_ETH: overrides.maxTrade_ETH ?? PM_MAX_BY_CRYPTO.ETH,
    maxTrade_SOL: overrides.maxTrade_SOL ?? PM_MAX_BY_CRYPTO.SOL,
    maxTrade_XRP: overrides.maxTrade_XRP ?? PM_MAX_BY_CRYPTO.XRP,
    t1Mode       : false,  // T+1 secondary entry: if T+0 misses, check the next same-size candle
    t1standalone : false,  // T+1 Tier 2 (standalone spike): allowed before TC fallback when enabled
    t0off        : false,  // skip T+0 trade placement but still allow T1/TC cascade
    ...overrides,
  };
}

function defaultState() {
  const s5  = { startBalance: START_BAL_5M };  // 5-min: $4 000
  const s15 = { maxTrade: MAX_TRADE_15M };      // 15-min: $10 000 (maxTrade/RISK_PCT)
  return {
    // ── 5-min markets ──
    C65  : makeStrategy(s5),
    C70  : makeStrategy(s5),
    C75  : makeStrategy(s5),
    C80  : makeStrategy(s5),
    C81  : makeStrategy(s5),
    C82  : makeStrategy(s5),
    C83  : makeStrategy(s5),
    C84  : makeStrategy(s5),
    C85  : makeStrategy(s5),
    C86  : makeStrategy(s5),
    C87  : makeStrategy(s5),
    C88  : makeStrategy(s5),
    C89  : makeStrategy(s5),
    C90  : makeStrategy(s5),
    C91  : makeStrategy(s5),
    C92  : makeStrategy(s5),
    C95  : makeStrategy(s5),
    LIVE : makeStrategy({
      ...s5,
      strategy5m   : 'C85',  threshold5m  : 0.12, minPrice5m  : 0.05, maxPrice5m  : 0.97, maxTrade5m  : 150,
      strategy15m  : 'C165', threshold15m : 0.20, minPrice15m : 0.05, maxPrice15m : 0.88, maxTrade15m : 500,
      // T+1 entries use same max price as T+0 — TC at 92¢ is EV-negative even at 91.9% WR
      // (EV = WR×(1-p)/p − (1-WR) → breaks even at ~91¢; match maxPrice cap to stay EV-positive)
      maxPriceT1_5m       : 0.89,   // TC max entry (match maxPrice5m)
      maxPriceT1_15m      : 0.89,   // TC max entry (match maxPrice15m)
      minPriceT1          : 0.85,   // TC min entry (75-85¢ bucket = 50% WR; ≥85¢ = 91.9% WR)
      maxPriceT1standalone: 0.89,   // T1 standalone max entry (unified with T0/TC cap)
      strategy     : 'C50',  // backward compat
      threshold5m_BTC : 0.15, threshold5m_ETH : 0.12, threshold5m_SOL : 0.12, threshold5m_XRP : 0.18,
      threshold15m_BTC: null, threshold15m_ETH: null, threshold15m_SOL: null, threshold15m_XRP: null,
      // Per-crypto Cxx overrides (null = use global strategy5m / strategy15m)
      strategy5m_BTC : null, strategy5m_ETH : null, strategy5m_SOL : null, strategy5m_XRP : null,
      strategy15m_BTC: null, strategy15m_ETH: null, strategy15m_SOL: null, strategy15m_XRP: null,
      // Per-crypto max trade caps for LIVE
      maxTrade5m_BTC : PM_MAX_BY_CRYPTO.BTC,  maxTrade5m_ETH : PM_MAX_BY_CRYPTO.ETH,
      maxTrade5m_SOL : PM_MAX_BY_CRYPTO.SOL,  maxTrade5m_XRP : PM_MAX_BY_CRYPTO.XRP,
      maxTrade15m_BTC: PM_MAX_BY_CRYPTO.BTC,  maxTrade15m_ETH: PM_MAX_BY_CRYPTO.ETH,
      maxTrade15m_SOL: PM_MAX_BY_CRYPTO.SOL,  maxTrade15m_XRP: PM_MAX_BY_CRYPTO.XRP,
      // EOA-based PNL tracking
      baseEoaBalance : 31.39,  // baseline EOA wallet balance set in SETUP; PNL = EOA − base
      baseEoaSetAt   : null,   // ISO timestamp when baseEoaBalance was last set/reset
      eoaPnlHistory  : [],     // [{time:ISO, eoa:number, pnl:number}] — recorded each time balance settles
      lastTrackedEoa : null,   // EOA value at last recorded event (null = uninitialised)
      // Risk cap: max simultaneous OPEN positions (null = unlimited)
      maxPositions   : 1,
      // RECOVER: disabled — false positives in live (real-time price noise at candle boundaries)
      recoverEnabled : false,
      // D2 signal filters
      directionFilter : 'DOWN',  // 'DOWN' | 'UP' | null (both)
      skipHours       : [0, 12], // UTC hours to skip (h00 and h12 are negative-EV for DOWN)
      skipDow         : [0],     // days of week to skip (0=Sunday)
      coordMinCryptos : 2,       // require ≥N cryptos spiking same direction same cycle
      // FOK retry: on kill, retry with reduced position (uses separate slot, not counted in maxPositions)
      fokRetryEnabled : true,
      fokRetryDivisor : 4,   // position ÷ N for retry
      fokRetryMax     : 2,   // max simultaneous FOK retry positions; 0 = disabled
      // Circuit breaker: pause new entries for N minutes after any resolved LOSS
      circuitBreakerEnabled : true,
      circuitBreakerMins    : 90,   // cool-off window in minutes
      circuitBreakerUntil   : null, // epoch ms; null or past = not active
      // Drawdown limit: stop ALL new entries if N losses occur within X minutes
      // Prevents loss clustering. Resumes after pauseMins from most-recent loss.
      drawdownLimitEnabled    : true,
      drawdownLimitMaxLosses  : 2,   // trigger pause after this many losses in the window
      drawdownLimitWindowMins : 90,  // rolling look-back window in minutes (for counting losses)
      drawdownLimitPauseMins  : 90,  // how long to pause after trigger (minutes)
      // Signal quality filters (hardcoded optimal values — not user-configurable in UI)
      bodyPct    : 76,   // min candle body/range %; validated at 76%
      volMin     : 0,    // global fallback
      volMin_BTC : 1.0,  // from explore_vol3m.js: BTC/SOL benefit from ≥1.0
      volMin_ETH : 0,
      volMin_SOL : 1.0,
      volMin_XRP : 0,
      // Signal inclusion toggles (rejected-signal research — see s02.png):
      allowLowVol  : true,  // true = include low-vol signals (bypass vol filter); false = apply vol filter (BTC/SOL ≥1.0)
      allowPriceOor: false, // true = allow T+1 entries above maxPriceT1 cap (96% WR but +$0.68/tr — marginal)
      exhaustThresh5m : 0,   // disabled: exhausted 5m signals have 96%+ WR (would skip best signals)
      exhaustThresh15m: 0,   // disabled: marginal gain, too many trades skipped
      distMin5m  : 0,  // min cumulative Binance dist% from cycle start (T+0 & T+1 entries, 5m)
      distMin15m : 0,  // same for 15m entries
      noSpikeFilter: false,  // skip spike threshold check entirely (research mode)
      // Rejection-trade overrides: list of reason codes to trade instead of skip.
      // Overrideable: time_filter, coord_wait, weak_body, weak_t1_body, weak_tc_body,
      //               price_too_high, price_too_low, price_out_of_range
      rejTradeReasons: [],
    }),
    LIVE_KALSHI: makeStrategy({
      ...s15,
      startBalance : 0,
      strategy15m  : 'C180', threshold15m : 0.22, minPrice15m : 0.05, maxPrice15m : 0.88, maxTrade15m : MAX_TRADE_15M,
      threshold15m_BTC: null, threshold15m_ETH: null, threshold15m_SOL: null, threshold15m_XRP: null,
      // Per-crypto Cxx overrides (null = use global strategy15m)
      strategy15m_BTC: null, strategy15m_ETH: null, strategy15m_SOL: null, strategy15m_XRP: null,
      // Per-crypto max trade caps for LIVE_KALSHI
      maxTrade15m_BTC: KAL_MAX_BY_CRYPTO.BTC, maxTrade15m_ETH: KAL_MAX_BY_CRYPTO.ETH,
      maxTrade15m_SOL: KAL_MAX_BY_CRYPTO.SOL, maxTrade15m_XRP: KAL_MAX_BY_CRYPTO.XRP,
      circuitBreakerEnabled : true,
      circuitBreakerMins    : 90,
      circuitBreakerUntil   : null,
      bodyPct    : 76,
      volMin     : 0, volMin_BTC : 1.0, volMin_ETH : 0, volMin_SOL : 1.0, volMin_XRP : 0,
      allowLowVol  : true,  allowPriceOor: false,
      drawdownLimitWindowMins : 90,
      drawdownLimitPauseMins  : 90,
      exhaustThresh5m : 0, exhaustThresh15m: 0,
      directionFilter : null, skipHours: [], skipDow: [], coordMinCryptos: 0,
    }),
    // ── LIVE_MINI: parallel Polymarket sub-strategy at 1/riskDivisor LIVE risk ──
    // Independent period: C85 @ 0.28% threshold (96.2% WR, 5m only — no viable 15m trios).
    // Relaxed maxPrice (0.97) to capture entries LIVE rejects for price_too_high.
    // Position = min(LIVE_riskPct × balance, maxTrade) / riskDivisor  (min $1).
    LIVE_MINI: makeStrategy({
      ...s5,
      startBalance   : 0,
      strategy5m     : 'C85',  threshold5m  : 0.28, minPrice5m  : 0.05, maxPrice5m  : 0.97, maxTrade5m  : 150,
      strategy15m    : null,   threshold15m : 0.22, minPrice15m : 0.05, maxPrice15m : 0.97, maxTrade15m : 150,
      maxPriceT1_5m  : 0.89,  maxPriceT1_15m : 0.89,
      strategy     : 'C50',
      circuitBreakerEnabled : true,
      circuitBreakerMins    : 90,
      circuitBreakerUntil   : null,
      drawdownLimitEnabled  : false,
      bodyPct    : 76,
      volMin     : 0, volMin_BTC : 1.0, volMin_ETH : 0, volMin_SOL : 1.0, volMin_XRP : 0,
      allowLowVol  : true,  allowPriceOor: false,
      exhaustThresh5m : 0, exhaustThresh15m: 0,
      distMin5m  : 0, distMin15m : 0,
      t1Mode     : true,
      maxPositions: 2,
      riskDivisor: 3,
      directionFilter : null, skipHours: [], skipDow: [], coordMinCryptos: 0,
      enabled    : false,
    }),
    // ── 15-min markets ──
    C150 : makeStrategy(s15),
    C157 : makeStrategy(s15),
    C159 : makeStrategy(s15),
    C161 : makeStrategy(s15),
    C163 : makeStrategy(s15),
    C165 : makeStrategy(s15),
    C167 : makeStrategy(s15),
    C169 : makeStrategy(s15),
    C171 : makeStrategy(s15),
    C173 : makeStrategy(s15),
    C175 : makeStrategy(s15),
    C180 : makeStrategy(s15),
    C195 : makeStrategy(s15),
    C210 : makeStrategy(s15),
    C225 : makeStrategy(s15),
  };
}

// ── Runtime state ──────────────────────────────────────────────────────────────

let strategies = defaultState();

// Pending trades awaiting cycle resolution
// key = `${cycleStart}_${crypto}_${stratKey}`
// value = { stratKey, crypto, direction, entryPrice, position, refPrice, candleSize, timestamp, cycleStart }
const pendingTrades = new Map();
const CYCLE_MS = 5 * 60 * 1000;  // default cycle length; individual trades carry their own cycleMs

// T+1 secondary entry: when T+0 misses, store context for a delayed check one period later
// key: `t1_${cycleStart}_${crypto}_${candle_size}_${stratKey}`
const pendingT1 = new Map();

// ── pm_outcomes cache (refreshed every 5 min) ──────────────────────────────────
// Used to resolve LIVE trades by Polymarket oracle instead of Binance prices.
const PM_OUTCOMES_FILE = path.join(__dirname, '../../cache/pm_outcomes.json');
let pmOutcomesCache = {};
function refreshPmOutcomesCache() {
  try { pmOutcomesCache = JSON.parse(fs.readFileSync(PM_OUTCOMES_FILE, 'utf8')); } catch {}
}
refreshPmOutcomesCache();
setInterval(refreshPmOutcomesCache, 5 * 60 * 1000);
// Periodic recovery of stuck OPEN trades:
// 1. Fetch any outcomes missing from cache (Gamma API), then 2. resolve from cache
setInterval(async () => {
  try {
    await fetchMissingOutcomes();
    recoverStuckOpenTrades();
  } catch (err) {
    logger.error('[t1000] stuck-open recovery interval error', { error: err.message });
  }
}, 5 * 60 * 1000);

/**
 * Resolve a LIVE/LIVE_KALSHI trade direction using pm_outcomes oracle.
 * Returns 'UP'|'DOWN' if known, null if not yet resolved in cache.
 */
function pmOutcomeForTrade(trade, cycleMs) {
  const cycleStartSec = Math.round(trade.cycleStart / 1000);
  const durationSec   = cycleMs / 1000;
  const key           = `${trade.crypto}_${cycleStartSec}_${durationSec}`;
  const outcome       = pmOutcomesCache[key];
  return (outcome === 'UP' || outcome === 'DOWN') ? outcome : null;
}

/**
 * For any OPEN trade whose cycle has ended and whose outcome is NOT yet in the
 * pm_outcomes cache (undefined — never fetched, not just unresolved), actively
 * query the Gamma API and persist the result.  Called before recoverStuckOpenTrades().
 */
async function fetchMissingOutcomes() {
  const now = Date.now();
  const toFetch = [];

  for (const stratKey of ['LIVE', 'LIVE_KALSHI', 'LIVE_MINI']) {
    const strat = strategies[stratKey];
    if (!strat) continue;
    for (const entry of strat.activityLog) {
      if (entry.status !== 'OPEN' || !entry.cycleStart) continue;
      const cycleMs     = (entry.candle_size ?? 0) >= 150 ? 900_000 : 300_000;
      if (now < entry.cycleStart + cycleMs + 60_000) continue; // cycle not over yet
      const csSec       = Math.round(entry.cycleStart / 1000);
      const durSec      = cycleMs / 1000;
      const pmKey       = `${entry.crypto}_${csSec}_${durSec}`;
      // Skip only if outcome is definitively known (UP/DOWN).
      // Re-fetch null entries — they mean "unresolved when last checked"; retry until 2h grace.
      const cached = pmOutcomesCache[pmKey];
      if (cached === 'UP' || cached === 'DOWN') continue;
      // Also skip null entries that are beyond the 2-hour grace period (will expire anyway)
      if (cached === null && now > entry.cycleStart + cycleMs + 2 * 60 * 60 * 1000) continue;
      toFetch.push({ pmKey, entry, csSec, cycleMs });
    }
  }

  if (!toFetch.length) return;

  let cacheChanged = false;
  for (const { pmKey, entry, csSec, cycleMs } of toFetch) {
    const mins = cycleMs === 900_000 ? 15 : 5;
    const slug = `${entry.crypto.toLowerCase()}-updown-${mins}m-${csSec}`;
    try {
      const r = await axios.get('https://gamma-api.polymarket.com/markets',
        { params: { slug }, timeout: 8000 });
      const m = r.data?.[0];
      if (!m) { pmOutcomesCache[pmKey] = null; cacheChanged = true; continue; }
      const prices  = JSON.parse(m.outcomePrices || '[]');
      const winIdx  = prices.findIndex(v => parseFloat(v) === 1);
      const outcome = winIdx === 0 ? 'UP' : winIdx === 1 ? 'DOWN' : null;
      pmOutcomesCache[pmKey] = outcome;
      cacheChanged = true;
      logger.info(`[t1000] fetchMissingOutcomes: ${pmKey} => ${outcome} (closed=${m.closed})`);
    } catch (e) {
      logger.warn(`[t1000] fetchMissingOutcomes: Gamma API error for ${slug}`, { error: e.message });
    }
  }

  // Persist updated cache so next restart / sim run benefits from it
  if (cacheChanged) {
    fs.promises.writeFile(PM_OUTCOMES_FILE, JSON.stringify(pmOutcomesCache, null, 2)).catch(() => {});
  }
}

// ── Persistence ────────────────────────────────────────────────────────────────

/**
 * Scan LIVE/LIVE_KALSHI activityLog for OPEN trades whose cycle has ended.
 * Resolve using pm_outcomes cache. Only EXPIRE if outcome is still unknown
 * after a generous grace period (2 hours), to avoid wrongly expiring trades
 * when the cache is stale (e.g. Binance disconnect at cycle boundary).
 */
function recoverStuckOpenTrades() {
  const now = Date.now();
  for (const stratKey of ['LIVE', 'LIVE_KALSHI', 'LIVE_MINI']) {
    const strat = strategies[stratKey];
    if (!strat) continue;
    let anyRecovered = false;
    for (const entry of strat.activityLog) {
      if (entry.status !== 'OPEN') continue;
      if (!entry.cycleStart) continue;
      const cycleMs = (entry.candle_size ?? 0) >= 150 ? 900_000 : 300_000;
      if (now < entry.cycleStart + cycleMs + 60_000) continue; // cycle not yet ended (+1m buffer)

      const cycleStartSec = Math.round(entry.cycleStart / 1000);
      const durationSec   = cycleMs / 1000;
      const outKey        = `${entry.crypto}_${cycleStartSec}_${durationSec}`;
      const outcome       = pmOutcomesCache[outKey]; // 'UP', 'DOWN', null, or undefined

      if (outcome === 'UP' || outcome === 'DOWN') {
        const isWin = entry.direction === outcome;
        entry.status = isWin ? 'WIN' : 'LOSS';
        if (isWin) {
          strat.wins++;
          entry.pnl = null; // deferred until redemption
          if ((stratKey === 'LIVE' || stratKey === 'LIVE_MINI') && !pendingRedemptions.has(entry.tradeId)) {
            pendingRedemptions.set(entry.tradeId, {
              trade      : { crypto: entry.crypto, cycleStart: entry.cycleStart,
                             position: entry.position, candleSize: entry.candle_size,
                             direction: entry.direction, tradeId: entry.tradeId, stratKey },
              is15m      : cycleMs === 900_000,
              dir        : entry.direction,
              attempts   : 0,
              redeemAfter: Date.now() + 5_000,
            });
          }
        } else {
          strat.losses++;
          const lossPnl = -(entry.position ?? 0);
          entry.pnl = parseFloat(lossPnl.toFixed(6));
          strat.balance = parseFloat((strat.balance + lossPnl).toFixed(6));
        }
        anyRecovered = true;
        logger.info(`[t1000] Recovered stuck OPEN → ${entry.status}`, { tradeId: entry.tradeId, outcome });
      } else if (now > entry.cycleStart + cycleMs + 2 * 60 * 60 * 1000) {
        // Outcome still unknown after 2 hours — market likely never resolved; mark EXPIRED
        entry.status = 'EXPIRED';
        anyRecovered = true;
        logger.warn(`[t1000] Stuck OPEN → EXPIRED after 2h with no outcome`, { tradeId: entry.tradeId, outKey });
      }
      // else: outcome not yet in cache, cycle ended recently — leave OPEN, retry next interval
    }
    if (anyRecovered) saveState();
  }
}

// ── Orphaned WIN scanner ───────────────────────────────────────────────────────
// Cross-checks Polymarket on-chain positions against activityLog.
// Catches two failure modes that lose USDC silently:
//   1. recoverStuckOpenTrades() used stale pmOutcomesCache → marked a real WIN as RECOV/LOSS
//   2. placeOrderByToken succeeded but activityLog entry was lost before saveState() (crash window)
// Called on startup (via setImmediate in loadState) and every 4h thereafter.
async function scanOrphanedPositions() {
  const eoa = poly.getEoaAddress();
  if (!eoa) return;

  let positions;
  try {
    const resp = await axios.get(
      `https://data-api.polymarket.com/positions?user=${eoa}&sizeThreshold=.01`,
      { timeout: 15_000 }
    );
    positions = Array.isArray(resp.data) ? resp.data : [];
  } catch (err) {
    logger.warn('[t1000] scanOrphanedPositions: API error', { error: err.message });
    return;
  }

  // Only process positions where we hold the winning side (curPrice ≈ 1)
  const winners = positions.filter(p => p.redeemable && p.curPrice >= 0.99);
  if (!winners.length) {
    logger.info('[t1000] scanOrphanedPositions: no unhandled WIN positions found');
    return;
  }

  // Build combined log from LIVE + LIVE_MINI (both share the same EOA wallet)
  const combinedLog = [
    ...(strategies.LIVE?.activityLog      || []).map(e => ({ e, sk: 'LIVE',      s: strategies.LIVE      })),
    ...(strategies.LIVE_MINI?.activityLog || []).map(e => ({ e, sk: 'LIVE_MINI', s: strategies.LIVE_MINI })),
  ];
  let orphansQueued = 0;

  for (const pos of winners) {
    // Parse slug: e.g. btc-updown-5m-1772640000
    const m = pos.slug.match(/^(btc|eth|sol|xrp)-updown-(5m|15m)-(\d+)$/);
    if (!m) continue;
    const crypto        = m[1].toUpperCase();
    const is15m         = m[2] === '15m';
    const cycleStartSec = parseInt(m[3], 10);
    const cycleStart    = cycleStartSec * 1000; // ms
    // Authoritative direction from Polymarket (what we hold that won)
    const direction     = pos.outcome === 'Up' ? 'UP' : 'DOWN';

    // Already correctly tracked and redeemed? Skip.
    const alreadyDoneRef = combinedLog.find(({ e }) =>
      e.cycleStart === cycleStart && e.crypto === crypto &&
      e.direction === direction && e.status === 'WIN' && e.redeemed === true
    );
    if (alreadyDoneRef) continue;

    // Find any existing activityLog entry for this cycle+crypto+timeframe (LIVE or LIVE_MINI)
    const existingRef = combinedLog.find(({ e }) =>
      e.cycleStart === cycleStart && e.crypto === crypto &&
      (is15m ? (e.candle_size ?? 0) >= 150 : (e.candle_size ?? 0) < 150)
    );
    const existing    = existingRef?.e    ?? null;
    const effectiveSK = existingRef?.sk   ?? 'LIVE';   // which strategy owns this entry
    const effectiveS  = existingRef?.s    ?? strategies.LIVE;

    let tradeId, candleSize;

    if (existing && existing.status !== 'WIN') {
      // Rescue a misfiled entry (RECOV / LOSS / FAILED / OPEN)
      tradeId    = existing.tradeId;
      candleSize = existing.candle_size ?? (is15m ? 195 : 75);
      // Undo the incorrect pnl that was previously applied to the balance
      const oldPnl = existing.pnl ?? 0;
      if (effectiveS && oldPnl !== 0) {
        effectiveS.balance = parseFloat(((effectiveS.balance || 0) - oldPnl).toFixed(6));
      }
      logger.warn('[t1000] scanOrphanedPositions: rescuing misfiled entry as WIN', {
        tradeId, slug: pos.slug, stratKey: effectiveSK, wasStatus: existing.status, wasDir: existing.direction, nowDir: direction,
      });
      existing.status   = 'WIN';
      existing.redeemed = false;
      existing.pnl      = null; // will be set on redemption
      existing.direction = direction; // authoritative from Polymarket
      delete existing.pendingTxHash;

    } else if (existing && existing.status === 'WIN' && !existing.redeemed) {
      // Already WIN but not redeemed — just ensure it's queued
      tradeId    = existing.tradeId;
      candleSize = existing.candle_size ?? (is15m ? 195 : 75);
      if (pendingRedemptions.has(tradeId)) continue;
      logger.warn('[t1000] scanOrphanedPositions: re-queuing unredeemed WIN', { tradeId, slug: pos.slug, stratKey: effectiveSK });

    } else if (!existing) {
      // No activityLog entry at all — create a synthetic one under LIVE (wallet-level orphan)
      const orphanS = strategies.LIVE;
      tradeId    = `${crypto}_ORPHAN_${cycleStartSec}_${direction}`;
      candleSize = is15m ? 195 : 75;
      if (pendingRedemptions.has(tradeId)) continue;
      const synthEntry = {
        time       : new Date(cycleStart).toISOString(),
        crypto,
        candle_size: candleSize,
        direction,
        spike_pct  : 0,
        status     : 'WIN',
        entryPrice : pos.avgPrice   ?? 0,
        position   : pos.initialValue ?? 0,
        tradeId,
        cycleStart,
        pnl        : null,
        redeemed   : false,
        label      : 'ORPHAN',
      };
      if (orphanS) orphanS.activityLog.push(synthEntry);
      logger.warn('[t1000] scanOrphanedPositions: created synthetic WIN entry', {
        tradeId, slug: pos.slug, estVal: pos.currentValue,
      });

    } else {
      continue; // status=WIN redeemed=true — already handled above
    }

    if (pendingRedemptions.has(tradeId)) continue;

    pendingRedemptions.set(tradeId, {
      trade: {
        stratKey  : existing ? effectiveSK : 'LIVE',  // credit right strategy on redemption
        crypto, cycleStart,
        position  : existing ? (existing.position ?? pos.initialValue ?? 0) : (pos.initialValue ?? 0),
        candleSize,
        direction,
        tradeId,
      },
      is15m,
      dir         : direction,
      attempts    : 0,
      redeemAfter : Date.now() + 15_000,
      pendingTxHash: null,
    });
    orphansQueued++;
  }

  if (orphansQueued > 0) {
    saveState(); // persist rescued/synthetic entries to disk immediately
    logger.warn(`[t1000] scanOrphanedPositions: queued ${orphansQueued} orphaned WIN(s) for redemption`);
  }
}

function loadState() {
  try {
    // Try main state file; fall back to .bak if main is missing or corrupt
    let raw;
    if (fs.existsSync(STATE_FILE)) {
      raw = fs.readFileSync(STATE_FILE, 'utf8');
      try { JSON.parse(raw); } catch {
        logger.warn('[t1000] state.json corrupt — restoring from .bak');
        raw = null;
      }
    }
    if (!raw) {
      const bak = STATE_FILE + '.bak';
      if (!fs.existsSync(bak)) return;
      logger.warn('[t1000] state.json missing — loading from .bak');
      raw = fs.readFileSync(bak, 'utf8');
    }
    const saved = JSON.parse(raw);
    const defaults = defaultState();
    for (const key of Object.keys(defaults)) {
      if (saved[key]) {
        strategies[key] = { ...defaults[key], ...saved[key] };
        // Cap activity log
        if (strategies[key].activityLog.length > MAX_LOG_ENTRIES) {
          strategies[key].activityLog = strategies[key].activityLog.slice(0, MAX_LOG_ENTRIES);
        }
      }
    }
    logger.info('[t1000] State loaded');
    rebuildNtfyKeys();

    // Merge CB backup — protects against crash between CB arm and async saveState.
    if (fs.existsSync(CB_FILE)) {
      try {
        const cbData = JSON.parse(fs.readFileSync(CB_FILE, 'utf8'));
        for (const [sk, walletCbs] of Object.entries(cbData)) {
          const s = strategies[sk];
          if (!s) continue;
          if (!s.walletCbUntil) s.walletCbUntil = {};
          for (const [wid, ts] of Object.entries(walletCbs)) {
            if ((ts ?? 0) > (s.walletCbUntil[wid] ?? 0)) {
              s.walletCbUntil[wid] = ts;
              if (wid === 'default') s.circuitBreakerUntil = ts;
              logger.warn(`[t1000] CB restored from crash-backup: ${sk} wallet=${wid} until ${new Date(ts).toISOString()}`);
            }
          }
        }
      } catch (_cbErr) {
        logger.warn('[t1000] Failed to read CB backup', { error: _cbErr.message });
      }
    }

    // Re-queue any LIVE/LIVE_MINI WINs that were never redeemed (e.g. engine restarted mid-redemption)
    let requeued = 0;
    for (const _reqStratKey of ['LIVE', 'LIVE_MINI']) {
    const liveLog = strategies[_reqStratKey]?.activityLog || [];
    for (const entry of liveLog) {
      if (entry.status === 'WIN' && !entry.redeemed && entry.tradeId && entry.cycleStart) {
        const is15m = (entry.candle_size ?? 0) >= 150;
        pendingRedemptions.set(entry.tradeId, {
          trade     : { stratKey: _reqStratKey, crypto: entry.crypto, cycleStart: entry.cycleStart, position: entry.position,
                        candleSize: entry.candle_size, direction: entry.direction, tradeId: entry.tradeId },
          is15m,
          dir           : entry.direction,
          attempts      : 0,
          redeemAfter   : Date.now() + 5_000, // retry almost immediately
          // Restore persisted TX hash so we check it first before sending a new TX
          pendingTxHash : entry.pendingTxHash ?? null,
        });
        requeued++;
      }
    }
    } // end _reqStratKey loop
    if (requeued > 0) logger.warn(`[t1000] Re-queued ${requeued} unredeemed WIN(s) for auto-redemption`);

    // Async orphan scan: cross-check Polymarket on-chain state with activityLog
    setImmediate(() => scanOrphanedPositions().catch(e =>
      logger.warn('[t1000] startup orphan scan failed', { error: e.message })
    ));

    // ── Recover stuck OPEN trades whose cycles ended before this restart ──────
    refreshPmOutcomesCache();  // ensure fresh data at startup
    recoverStuckOpenTrades();  // shared logic also called periodically

    let _startupResynced = false;
    for (const stratKey of ['LIVE', 'LIVE_KALSHI', 'LIVE_MINI']) {
      const strat = strategies[stratKey];
      if (!strat) continue;

      // Correct any WIN entries that have negative pnl (redemption returned 0 USDC).
      // This can happen when the RPC balance check has a sync lag — the entry was saved as WIN
      // pnl=-position before the safety-net correction was added. Flip them to LOSS here.
      for (const e of strat.activityLog) {
        if (e.status === 'WIN' && e.pnl != null && e.pnl < 0) {
          logger.warn(`[t1000] Correcting stale WIN→LOSS (negative pnl)`, { tradeId: e.tradeId, pnl: e.pnl });
          e.status = 'LOSS';
          _startupResynced = true;
        }
      }

      // Always resync balance, wins, losses from activityLog for LIVE strategies.
      // Heals drift from ghost counter updates (balance/wins/losses changed without a log entry).
      // pnlBaseline / winsAtReset / lossesAtReset support stats reset without deleting trade history.
      const pnlBase   = strat.pnlBaseline   || 0;
      const wBase     = strat.winsAtReset   || 0;
      const lBase     = strat.lossesAtReset || 0;
      // isFinite guard: a corrupted NaN pnl entry would poison the whole sum — skip it and log
      const logSum  = strat.activityLog.reduce((acc, e) => {
        const p = e.pnl ?? 0;
        if (!isFinite(p)) { logger.warn('[t1000] loadState: non-finite pnl in activityLog — skipping', { tradeId: e.tradeId, pnl: e.pnl }); return acc; }
        return acc + p;
      }, 0);
      const synced  = parseFloat((logSum - pnlBase).toFixed(6));
      const logWins = Math.max(0, strat.activityLog.filter(e => e.status === 'WIN').length  - wBase);
      const logLoss = Math.max(0, strat.activityLog.filter(e => e.status === 'LOSS').length - lBase);
      if (Math.abs(strat.balance - synced) > 0.0001 || strat.wins !== logWins || strat.losses !== logLoss) {
        logger.info(`[t1000] Resyncing ${stratKey}: bal ${strat.balance.toFixed(4)}→${synced.toFixed(4)} wins ${strat.wins}→${logWins} losses ${strat.losses}→${logLoss}`);
        strat.balance = synced;
        strat.wins    = logWins;
        strat.losses  = logLoss;
        _startupResynced = true;
      }
    }
    // If any strategy was resynced, write synchronously so correct values are on disk immediately.
    // async saveState() inside the loop risks leaving balance=0/wins=0 on disk if the engine
    // crashes before the setImmediate write completes.
    if (_startupResynced) {
      try {
        const _snap = {};
        for (const [k, s] of Object.entries(strategies)) {
          _snap[k] = { ...s, activityLog: s.activityLog.filter(e => e.status !== 'SKIP').slice(0, 500) };
        }
        fs.writeFileSync(STATE_FILE, JSON.stringify(_snap, null, 2));
        logger.info('[t1000] Startup resync persisted synchronously');
      } catch (_syncErr) {
        logger.warn('[t1000] Failed to sync-write startup resync', { error: _syncErr.message });
      }
    }

  } catch (e) {
    logger.warn('[t1000] Failed to load state, using defaults', { error: e.message });
  }

  // Sync all existing LIVE trades to DB on startup (backfill any gaps)
  setImmediate(() => dbSyncLiveTrades().catch(() => {}));
  // Restore today's rejection counters so a restart doesn't reset the stats to 0
  setImmediate(() => seedRejStats().catch(() => {}));
}

// ── Async state persistence with write-coalescing ─────────────────────────────
// saveState() is called 30+ times per candle cycle. Using writeFileSync on a
// 1.7 MB file blocks the event loop for ~20–50 ms, delaying candle processing.
// Fix: schedule an async write via setImmediate. Multiple saveState() calls
// within the same synchronous run are coalesced into one disk write.
// If a write is already in-flight, the next one queues instead of overlapping.
let _saveInFlight = false;
let _savePending  = false;

function saveState() {
  if (_saveInFlight) {
    // A write is already running — mark that a follow-up write is needed.
    _savePending = true;
    return;
  }
  // Defer to next I/O tick so multiple synchronous saveState() calls in the
  // same stack frame are coalesced into a single disk write.
  _saveInFlight = true;
  setImmediate(_doSaveState);
}

async function _doSaveState() {
  try {
    const toSave = {};
    for (const [key, s] of Object.entries(strategies)) {
      toSave[key] = { ...s, activityLog: s.activityLog.filter(e => e.status !== 'SKIP').slice(0, 500) };
    }
    const json = JSON.stringify(toSave, null, 2);
    await fs.promises.writeFile(STATE_FILE, json);
    // Keep a rolling backup — protects against corruption / accidental delete
    await fs.promises.writeFile(STATE_FILE + '.bak', json);
    // Persist LIVE trades to DB (fire-and-forget, non-blocking)
    dbSyncLiveTrades().catch(() => {});
  } catch (e) {
    logger.warn('[t1000] Failed to save state', { error: e.message });
  } finally {
    _saveInFlight = false;
    if (_savePending) {
      // A write was requested while we were in-flight — do it now.
      _savePending  = false;
      _saveInFlight = true;
      setImmediate(_doSaveState);
    }
  }
}

// ── DB: t1000_live_trades persistence ─────────────────────────────────────────

async function dbSyncLiveTrades() {
  for (const stratKey of ['LIVE', 'LIVE_KALSHI', 'LIVE_MINI']) {
    const s = strategies[stratKey];
    if (!s) continue;
    for (const e of s.activityLog) {
      if (!e.tradeId || e.status === 'SKIP') continue;
      try {
        await query(`
          INSERT INTO t1000_live_trades
            (trade_id, strategy, crypto, candle_size, direction, spike_pct, entry_price,
             position_usd, status, pnl_usd, cycle_start, redeemed, trade_time, context_candles,
             body_ratio, signal_price, order_limit_price, wallet_id, threshold)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          ON CONFLICT (trade_id) DO UPDATE SET
            status            = EXCLUDED.status,
            pnl_usd           = EXCLUDED.pnl_usd,
            entry_price       = EXCLUDED.entry_price,
            position_usd      = EXCLUDED.position_usd,
            redeemed          = EXCLUDED.redeemed,
            context_candles   = COALESCE(t1000_live_trades.context_candles, EXCLUDED.context_candles),
            body_ratio        = COALESCE(t1000_live_trades.body_ratio, EXCLUDED.body_ratio),
            signal_price      = COALESCE(t1000_live_trades.signal_price, EXCLUDED.signal_price),
            order_limit_price = COALESCE(t1000_live_trades.order_limit_price, EXCLUDED.order_limit_price),
            threshold         = COALESCE(t1000_live_trades.threshold, EXCLUDED.threshold),
            updated_at        = NOW()
        `, [
          e.tradeId,
          stratKey,
          e.crypto,
          e.candle_size,
          e.direction,
          e.spike_pct        ?? null,
          e.entryPrice       ?? null,
          e.position         ?? null,
          e.status,
          e.pnl              ?? null,
          e.cycleStart       ?? null,
          e.redeemed         ?? false,
          e.time             ?? null,
          e.contextCandles ? JSON.stringify(e.contextCandles) : null,
          e.body_ratio       ?? null,
          e.signalPrice      ?? null,
          e.orderLimitPrice  ?? null,
          e.walletId         ?? 'default',
          e.threshold        ?? null,
        ]);
      } catch (err) {
        logger.warn('[t1000] dbSyncLiveTrades upsert failed', { tradeId: e.tradeId, error: err.message });
      }
    }
  }
}

// ── Activity log ───────────────────────────────────────────────────────────────

function addActivity(stratKey, entry) {
  const s = strategies[stratKey];
  if (!s) return;
  // Guard: prevent duplicate OPEN entries for the same tradeId.
  // Happens if runT1Check / onCandle fires twice for the same cycle (edge case on reconnect).
  if (entry.tradeId && entry.status === 'OPEN') {
    const dup = s.activityLog.find(e => e.tradeId === entry.tradeId);
    if (dup) {
      logger.warn('[t1000] addActivity: duplicate tradeId — skipping', { tradeId: entry.tradeId, stratKey, existingStatus: dup.status });
      return;
    }
  }
  s.activityLog.unshift({ ...entry, time: new Date(entry.time).toISOString() });
  if (s.activityLog.length > MAX_LOG_ENTRIES) {
    // When rolling off the oldest entries, subtract their contributions from the stat baselines
    // so that the displayed wins/losses/balance remain stable for LIVE/LIVE_KALSHI strategies.
    const dropped = s.activityLog.slice(MAX_LOG_ENTRIES);
    if ((stratKey === 'LIVE' || stratKey === 'LIVE_KALSHI' || stratKey === 'LIVE_MINI') &&
        (s.winsAtReset || s.lossesAtReset || s.pnlBaseline)) {
      const dWins = dropped.filter(e => e.status === 'WIN').length;
      const dLoss = dropped.filter(e => e.status === 'LOSS').length;
      const dPnl  = dropped.reduce((a, e) => a + (e.pnl ?? 0), 0);
      s.winsAtReset   = Math.max(0, (s.winsAtReset   || 0) - dWins);
      s.lossesAtReset = Math.max(0, (s.lossesAtReset || 0) - dLoss);
      s.pnlBaseline   = parseFloat(((s.pnlBaseline   || 0) - dPnl).toFixed(6));
    }
    s.activityLog.length = MAX_LOG_ENTRIES;
  }
  // Save for tradeable events only — SKIPs are display-only and don't need disk persistence
  if (entry.status !== 'SKIP') saveState();
}

function updateActivityEntry(stratKey, crypto, candleSize, openTime, update, tradeId = null) {
  const s = strategies[stratKey];
  if (!s) return false;
  const entry = s.activityLog.find(e =>
    e.crypto === crypto &&
    e.candle_size === candleSize &&
    e.status === 'OPEN' &&
    Math.abs(new Date(e.time) - new Date(openTime)) < 10000 &&
    (tradeId == null || e.tradeId === tradeId)
  );
  if (entry) { Object.assign(entry, update); return true; }
  return false;
}

// ── DB: spike_t1_validation logging ───────────────────────────────────────────

// Map from tradeKey → DB row id (for updating outcome at cycle end)
const dbRowIds = new Map();

async function dbInsertCandle(candle, entryPrice, entryDirection, positionSize, outcome, notes) {
  try {
    const res = await query(`
      INSERT INTO spike_t1_validation (
        timestamp, crypto, candle_size, spike_pct, spike_direction,
        t1_yes_ask, t1_no_ask, t1_yes_bid, t1_no_bid,
        entry_price, entry_direction, position_size,
        reference_price, outcome, notes, created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15, NOW()
      ) RETURNING id
    `, [
      candle.cycle_start,
      candle.crypto,
      candle.candle_size,
      candle.spike_pct,
      candle.direction,
      candle.yes_ask,
      candle.no_ask,
      candle.yes_bid,
      candle.no_bid,
      entryPrice,
      entryDirection,
      positionSize,
      candle.ref_price,
      outcome,
      notes,
    ]);
    return res.rows[0]?.id ?? null;
  } catch (e) {
    logger.warn('[t1000] DB insert failed', { error: e.message });
    return null;
  }
}

async function dbResolveRow(rowId, resolutionPrice, outcome, pnlPct, pnlUsd) {
  if (!rowId) return;
  try {
    await query(`
      UPDATE spike_t1_validation
      SET resolution_price = $1, outcome = $2, pnl_pct = $3, pnl_usd = $4
      WHERE id = $5
    `, [resolutionPrice, outcome, pnlPct, pnlUsd, rowId]);
  } catch (e) {
    logger.warn('[t1000] DB resolve failed', { error: e.message });
  }
}

// ── Rolling candle history for rejection context ───────────────────────────────
// Keyed by `${crypto}_${candle_size}` — stores last 8 candles (current + 7 prior cycles).
// Ephemeral: Polymarket bid/ask (ya/na) cannot be reconstructed after the fact.
const _candleHistory = {};
const CANDLE_HISTORY_LEN = 8;

// ── Rejected-candidate recorder ────────────────────────────────────────────────
// Buffered batch insert — accumulates up to 50 items, flushes every 60s.
// Never blocks the trading path.

const _rejBuf = [];
const _REJ_FLUSH_INTERVAL = 60_000; // ms
const _REJ_FLUSH_SIZE     = 50;

/**
 * Returns true if the circuit breaker is active for a specific wallet.
 * Default wallet uses strat.circuitBreakerUntil (backwards compat).
 * Extra wallets use strat.walletCbUntil[walletId].
 */
function cbActiveForWallet(strat, walletId) {
  if (strat.circuitBreakerEnabled === false) return false;
  if (walletId === 'default') return (strat.circuitBreakerUntil ?? 0) > Date.now();
  const until = (strat.walletCbUntil ?? {})[walletId] ?? 0;
  return until > Date.now();
}

/**
 * Drawdown limit check.
 * Returns { active, count, pausedUntil } for a LIVE/LIVE_KALSHI strategy.
 * active=true  → block new entries; pausedUntil = epoch ms when oldest counted loss ages out.
 * active=false → trading allowed.
 * walletId filters losses to a specific wallet (default: 'default').
 */
function checkDrawdownLimit(strat, walletId = 'default') {
  if (strat.drawdownLimitEnabled === false) return { active: false, count: 0, pausedUntil: null };
  const maxLosses = strat.drawdownLimitMaxLosses   ?? 2;
  const windowMs  = (strat.drawdownLimitWindowMins ?? 90) * 60_000;
  const pauseMs   = (strat.drawdownLimitPauseMins   ?? strat.drawdownLimitWindowMins ?? 90) * 60_000;
  const cutoff    = new Date(Date.now() - windowMs).toISOString();
  const recent    = (strat.activityLog ?? [])
    .filter(e => e.status === 'LOSS' && !e.isFokRetry && e.time && e.time >= cutoff
              && (e.walletId ?? 'default') === walletId)
    .sort((a, b) => a.time.localeCompare(b.time));
  const count = recent.length;
  if (count < maxLosses) return { active: false, count, pausedUntil: null };
  // Pause starts from the most recent loss and lasts pauseMs
  const mostRecent  = recent[recent.length - 1];
  const pausedUntil = new Date(mostRecent.time).getTime() + pauseMs;
  return { active: pausedUntil > Date.now(), count, pausedUntil };
}

// In-memory rejection counters (reset on restart or when trade list is cleared).
// t0 = main-loop rejections (quality/operational) for LIVE key, excl. near-miss below_threshold.
// t1 = T+1 timer: Tier-2 (T1 standalone) matched but trade blocked.
// tc = T+1 timer: Tier-3 (TC cumulative) matched but trade blocked.
const _rejStats    = { t0: 0, t1: 0, tc: 0 };
const _rejByReason = {};  // e.g. { below_threshold: 12, circuit_breaker: 1, ... }

// Seed rejection counters from today's DB rows so a restart doesn't reset them to 0.
async function seedRejStats() {
  try {
    const result = await query(
      `SELECT reason, COUNT(*) AS cnt FROM t1000_rejected
       WHERE created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
       GROUP BY reason`
    );
    for (const row of result.rows) {
      const cnt = parseInt(row.cnt, 10);
      _rejByReason[row.reason] = (_rejByReason[row.reason] || 0) + cnt;
      _rejStats.t0 += cnt;
    }
    logger.info('[t1000] seedRejStats: loaded from DB', { t0: _rejStats.t0, byReason: { ..._rejByReason } });
  } catch (err) {
    logger.warn('[t1000] seedRejStats failed', { error: err.message });
  }
}

function _flushRejected() {
  if (!_rejBuf.length) return;
  const batch = _rejBuf.splice(0);
  // Build multi-row INSERT: VALUES ($1,$2,...,$12),($13,...,$24),...
  const cols = 12;
  const placeholders = batch.map((_, i) =>
    `($${i*cols+1},$${i*cols+2},$${i*cols+3},$${i*cols+4},$${i*cols+5},$${i*cols+6},$${i*cols+7},$${i*cols+8},$${i*cols+9},$${i*cols+10},$${i*cols+11},$${i*cols+12})`
  ).join(',');
  const values = batch.flatMap(r => r);
  query(
    `INSERT INTO t1000_rejected
       (crypto, candle_size, direction, spike_pct, yes_ask, no_ask, entry_price, threshold, reason, details,
        cycle_start_ms, context_candles)
     VALUES ${placeholders}`,
    values
  ).catch(err => logger.warn('[t1000] _flushRejected error', { error: err.message }));
}
setInterval(_flushRejected, _REJ_FLUSH_INTERVAL);

function recordRejected(crypto, candle_size, direction, spike_pct, yes_ask, no_ask, entry_price, threshold, reason, details, cycleStartMs, contextCandles, slot = 'T0') {
  const detailsWithSlot = { slot, ...(details ?? {}) };
  _rejBuf.push([
    crypto, candle_size, direction, spike_pct,
    yes_ask    ?? null, no_ask     ?? null,
    entry_price ?? null, threshold ?? null,
    reason, JSON.stringify(detailsWithSlot),
    cycleStartMs ?? null, contextCandles ? JSON.stringify(contextCandles) : null,
  ]);
  if (_rejBuf.length >= _REJ_FLUSH_SIZE) _flushRejected();
  _rejByReason[reason] = (_rejByReason[reason] || 0) + 1;
  if (slot === 'T0') _rejStats.t0++;
}

// ── Candle event handler ───────────────────────────────────────────────────────

const VALID_CANDLE_SIZES = new Set([65, 70, 75, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 95, 150, 157, 159, 161, 163, 165, 167, 169, 171, 173, 175, 180, 195, 210, 225]);
const VALID_CRYPTOS_T1K  = new Set(['BTC', 'ETH', 'SOL', 'XRP']);

function onCandle(candle) {
  // ── Input validation ──────────────────────────────────────────────────────
  if (!candle || typeof candle !== 'object') {
    logger.warn('[t1000] onCandle: received null/non-object candle, skipping');
    return;
  }
  const { crypto, candle_size, spike_pct, direction, yes_ask, no_ask, ref_price, cycle_start,
          open: cOpen, high: cHigh, low: cLow, close: cClose } = candle;

  if (!VALID_CRYPTOS_T1K.has(crypto)) {
    logger.warn('[t1000] onCandle: invalid crypto', { crypto }); return;
  }
  if (!VALID_CANDLE_SIZES.has(candle_size)) {
    logger.warn('[t1000] onCandle: invalid candle_size', { candle_size }); return;
  }
  if (typeof spike_pct !== 'number' || !isFinite(spike_pct)) {
    logger.warn('[t1000] onCandle: invalid spike_pct', { crypto, candle_size, spike_pct }); return;
  }
  if (direction !== 'UP' && direction !== 'DOWN') {
    logger.warn('[t1000] onCandle: invalid direction', { crypto, candle_size, direction }); return;
  }
  if (typeof ref_price !== 'number' || ref_price <= 0) {
    logger.warn('[t1000] onCandle: invalid ref_price', { crypto, candle_size, ref_price }); return;
  }
  if (!(cycle_start instanceof Date) || isNaN(cycle_start.getTime())) {
    logger.warn('[t1000] onCandle: invalid cycle_start', { crypto, candle_size }); return;
  }

  // 5-min periods: C50–C85   15-min periods: C150–C255
  if (!VALID_CANDLE_SIZES.has(candle_size)) return; // already checked above, kept for clarity

  const stratKey      = `C${candle_size}`;
  const cycleStart    = cycle_start.getTime();
  const absSpike      = Math.abs(spike_pct);
  const candleClosedAt = cycleStart + candle_size * 1000; // ms when this candle closed
  const detectionDelayMs = Date.now() - candleClosedAt;   // pipeline latency

  // ── Maintain rolling candle history for rejection context ─────────────────
  {
    const hKey = `${crypto}_${candle_size}`;
    if (!_candleHistory[hKey]) _candleHistory[hKey] = [];
    _candleHistory[hKey].push({
      t:  cycleStart,
      o:  cOpen  ?? null,
      h:  cHigh  ?? null,
      l:  cLow   ?? null,
      c:  cClose ?? null,
      sp: spike_pct,
      ya: yes_ask ?? null,
      na: no_ask  ?? null,
    });
    if (_candleHistory[hKey].length > CANDLE_HISTORY_LEN) _candleHistory[hKey].shift();
  }

  // ── Always log to spike_t1_validation (even if no strategy is enabled) ──
  // This gives KIMI-protocol data regardless of paper trading state.
  const entryPriceForLog = direction === 'UP' ? yes_ask : no_ask;
  const entryDirLog      = direction === 'UP' ? 'BUY_YES' : 'BUY_NO';
  let dbOutcome = 'PENDING';
  let dbNotes   = null;

  if (!entryPriceForLog || entryPriceForLog <= 0) {
    dbOutcome = 'SKIP_LIQUIDITY';
    dbNotes   = 'No CLOB ask price available';
  } else if (entryPriceForLog > MAX_ENTRY_PRICE) {
    dbOutcome = 'SKIP_PRICE';
    dbNotes   = `CLOB ask ${(entryPriceForLog*100).toFixed(0)}¢ > max ${(MAX_ENTRY_PRICE*100).toFixed(0)}¢`;
  }

  // Log to DB (async, non-blocking)
  const dbLogKey = `${cycleStart}_${crypto}_${candle_size}`;
  dbInsertCandle(
    candle,
    dbOutcome === 'PENDING' ? entryPriceForLog : entryPriceForLog,
    entryDirLog,
    null, // position_size filled in below if trade taken
    dbOutcome,
    dbNotes
  ).then(rowId => {
    if (rowId) dbRowIds.set(dbLogKey, rowId);
  });

  // Snapshot candle context for rejection recording (last 8 candles incl. this one)
  const _ctxCandles = [...(_candleHistory[`${crypto}_${candle_size}`] ?? [])];

  // Determine which strategies to check
  const keysToCheck = [];

  const live        = strategies.LIVE;
  const liveK       = strategies.LIVE_KALSHI;
  const liveMini    = strategies.LIVE_MINI;
  const anyLiveActive = live?.enabled || liveK?.enabled || liveMini?.enabled;
  const is15mCandle = candle_size >= 150;
  const durKey      = is15mCandle ? '15m' : '5m';

  // Paper strategy (CXX): activate when LIVE would use this candle size for THIS crypto
  // AND no live service is active (LIVE/KALSHI trades are the source of truth when active)
  const cryptoStratLive = live?.[`strategy${durKey}_${crypto}`] ?? live?.[`strategy${durKey}`];
  const matchesLive = live && cryptoStratLive === stratKey;
  if (!anyLiveActive && strategies[stratKey]?.enabled && matchesLive) keysToCheck.push(stratKey);

  // LIVE: fire if this crypto's per-crypto (or global) Cxx matches this candle size
  if (live?.enabled) {
    const cryptoStrat = live[`strategy${durKey}_${crypto}`] ?? live[`strategy${durKey}`];
    if (cryptoStrat === stratKey) keysToCheck.push('LIVE');
  }

  // LIVE_KALSHI: 15-min only; check per-crypto Cxx override
  if (liveK?.enabled && is15mCandle) {
    const cryptoStrat = liveK[`strategy15m_${crypto}`] ?? liveK.strategy15m;
    if (cryptoStrat === stratKey) keysToCheck.push('LIVE_KALSHI');
  }

  // LIVE_MINI: uses its own candle-size selection (independent from LIVE)
  if (liveMini?.enabled) {
    const cryptoStrat = liveMini[`strategy${durKey}_${crypto}`] ?? liveMini[`strategy${durKey}`];
    if (cryptoStrat === stratKey) keysToCheck.push('LIVE_MINI');
  }

  // Log candle detection delay whenever LIVE is listening to this candle size
  // (regardless of spike size — measures pipeline latency from candle close to engine)
  const hasLive = keysToCheck.some(k => k === 'LIVE' || k === 'LIVE_KALSHI' || k === 'LIVE_MINI');
  if (hasLive) {
    logger.info(`[t1000] CANDLE ${crypto} C${candle_size} spike=${spike_pct.toFixed(3)}% dir=${direction} detected +${detectionDelayMs}ms after candle close`);
  }

  // Guard: if the signal is too stale (pipeline backup), skip LIVE orders.
  // Paper trades are kept — they have no real-money risk and help track missed opportunities.
  if (hasLive) {
    const maxAge = is15mCandle ? MAX_SIGNAL_AGE_15M : MAX_SIGNAL_AGE_5M;
    if (detectionDelayMs > maxAge) {
      logger.warn(`[t1000] Signal too stale (${detectionDelayMs}ms > ${maxAge}ms) — skipping LIVE for ${crypto} C${candle_size}`);
      const liveKeys = keysToCheck.filter(k => k === 'LIVE' || k === 'LIVE_KALSHI' || k === 'LIVE_MINI');
      for (const k of liveKeys) {
        addActivity(k, {
          time: new Date(), crypto, candle_size, direction, spike_pct: absSpike,
          status: 'SKIP', reason: 'signal_too_stale',
          entryPrice: direction === 'UP' ? yes_ask : no_ask,
        });
      }
      recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
        direction === 'UP' ? yes_ask : no_ask, null, 'signal_too_stale',
        { delay_ms: detectionDelayMs, max_age_ms: maxAge },
        cycleStart, _ctxCandles);
      keysToCheck.splice(0, keysToCheck.length, ...keysToCheck.filter(k => k !== 'LIVE' && k !== 'LIVE_KALSHI' && k !== 'LIVE_MINI'));
    }
  }

  // Track which strategy keys placed a T+0 trade (blocks T+1 scheduling for that key)
  const t0PlacedKeys       = new Set();
  const t0SkippedMaxPosKeys = new Set();  // keys skipped at T+0 because all position slots were full
  const t0SignalMetKeys     = new Set();  // keys where T+0 spike+body qualified; T+1 only for these

  for (const key of keysToCheck) {
    const strat = strategies[key];
    // signalCfg: signal-quality settings (thresholds, filters, price bounds, t0off) are
    // inherited from LIVE when key is LIVE_MINI so both strategies fire on identical signals.
    const signalCfg = (key === 'LIVE_MINI' && strategies.LIVE) ? strategies.LIVE : strat;
    const is15m = candle_size >= 150;
    const isLive = key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI';

    // Paper mirror: paper strategy whose Cxx matches LIVE's effective strategy for THIS crypto
    const liveStrat      = strategies.LIVE;
    const effectiveLiveCxx = liveStrat?.[`strategy${durKey}_${crypto}`] ?? liveStrat?.[`strategy${durKey}`];
    const isPaperMirror  = !isLive && liveStrat && effectiveLiveCxx === key;
    const mirrorIs15m    = isPaperMirror && is15mCandle;

    // Duration-specific params for LIVE/LIVE_KALSHI/LIVE_MINI; paper mirrors use LIVE params
    let threshold;
    if (key === 'LIVE') {
      const cryptoKey = is15m ? `threshold15m_${crypto}` : `threshold5m_${crypto}`;
      threshold = strat[cryptoKey] ?? (is15m ? strat.threshold15m : strat.threshold5m) ?? strat.threshold ?? 0.24;
    } else if (key === 'LIVE_KALSHI') {
      threshold = strat[`threshold15m_${crypto}`] ?? strat.threshold15m ?? strat.threshold ?? 0.24;
    } else if (key === 'LIVE_MINI') {
      // LIVE_MINI inherits thresholds from LIVE
      const cryptoKey = is15m ? `threshold15m_${crypto}` : `threshold5m_${crypto}`;
      threshold = signalCfg[cryptoKey] ?? (is15m ? signalCfg.threshold15m : signalCfg.threshold5m) ?? signalCfg.threshold ?? 0.24;
    } else if (isPaperMirror) {
      const cryptoKey = mirrorIs15m ? `threshold15m_${crypto}` : `threshold5m_${crypto}`;
      threshold = liveStrat[cryptoKey] ?? (mirrorIs15m ? liveStrat.threshold15m : liveStrat.threshold5m) ?? 0.24;
    } else {
      threshold = strat[`threshold_${crypto}`] ?? strat.threshold ?? 0.24;
    }

    // Log every candle evaluation for LIVE strategies
    if (isLive) {
      logger.info(`[t1000] ${key} ${crypto} C${candle_size} eval spike=${spike_pct.toFixed(3)}% dir=${direction} yes=${(yes_ask*100).toFixed(0)}¢ no=${(no_ask*100).toFixed(0)}¢ threshold=${threshold}%`);
    }

    if (!(strat.noSpikeFilter ?? false) && absSpike < threshold) {
      if (isLive) logger.info(`[t1000] ${key} ${crypto} SKIP below_threshold (${absSpike.toFixed(3)}% < ${threshold}%)`);
      else logger.debug(`[t1000] ${key} ${crypto} C${candle_size} no spike (${absSpike.toFixed(3)}% < ${threshold}%)`);
      // Record near-miss spikes (≥50% of threshold) so the rejected list shows how close
      // the candle came to triggering.  Flat candles (spike < 50% threshold) are not recorded.
      if (key === 'LIVE' && absSpike >= threshold * 0.5) {
        recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
          direction === 'UP' ? yes_ask : no_ask, threshold, 'below_threshold', null,
          cycleStart, _ctxCandles);
      }
      continue;
    }

    // Direction filter: skip signals not matching the configured direction (e.g. D2 = DOWN only)
    if (signalCfg.directionFilter && direction !== signalCfg.directionFilter) {
      if (isLive) logger.info(`[t1000] ${key} ${crypto} SKIP dir_filter (${direction} ≠ ${signalCfg.directionFilter})`);
      continue;
    }

    // Candle body filter: body must be ≥bodyPct% of total range (rejects doji / spinning top candles)
    const candleHeight = (cHigh ?? 0) - (cLow ?? 0);
    const candleBody   = Math.abs((cOpen ?? 0) - (cClose ?? 0));
    const bodyThreshold = signalCfg.bodyPct ?? 76;
    if (bodyThreshold > 0 && candleHeight > 0 && (candleBody * 100 / candleHeight) < bodyThreshold) {
      const _rejOrWB = key === 'LIVE' && (strat.rejTradeReasons ?? []).includes('weak_body');
      if (isLive) logger.info(`[t1000] ${key} ${crypto} ${_rejOrWB ? 'OVERRIDE' : 'SKIP'} weak_body body=${candleBody.toFixed(4)} height=${candleHeight.toFixed(4)} ratio=${(candleBody*100/candleHeight).toFixed(1)}%`);
      if (!_rejOrWB) {
        if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
          direction === 'UP' ? yes_ask : no_ask, threshold, 'weak_body',
          { body_ratio: parseFloat((candleBody * 100 / candleHeight).toFixed(1)), body: candleBody, height: candleHeight },
          cycleStart, _ctxCandles);
        continue;
      }
    }
    const bodyRatio = candleHeight > 0 ? parseFloat((candleBody * 100 / candleHeight).toFixed(1)) : null;

    // Dist filter: cumulative Binance move from cycle start must reach distMin%
    {
      const distMin = is15m ? (signalCfg.distMin15m ?? 0) : (signalCfg.distMin5m ?? 0);
      if (distMin > 0 && cOpen > 0) {
        const dist = (cClose - cOpen) / cOpen * 100;
        if ((direction === 'UP' ? dist : -dist) < distMin) {
          if (isLive) logger.info(`[t1000] ${key} ${crypto} SKIP low_dist dist=${dist.toFixed(3)}% min=${distMin}%`);
          if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
            direction === 'UP' ? yes_ask : no_ask, threshold, 'low_dist',
            { dist: parseFloat(dist.toFixed(3)), distMin }, cycleStart, _ctxCandles);
          continue;
        }
      }
    }

    // Vol ratio filter: skip spikes on below-threshold Binance volume (fake-outs on thin books)
    // vol_ratio in candle uses 1-min basis (5m) or 3-min basis (15m) from sub-candle-generator.
    // Per-crypto thresholds (explore_vol3m): BTC=1.0, SOL=1.0, ETH=0, XRP=0 (disabled)
    // null vol_ratio = warm-up period (~15/45 min after restart) → allow trade.
    {
      const effectiveVolMin = signalCfg[`volMin_${crypto}`] ?? signalCfg.volMin;
      if (effectiveVolMin > 0 && !signalCfg.allowLowVol) {
        const vr = candle.vol_ratio;
        if (vr != null && vr < effectiveVolMin) {
          if (isLive) logger.info(`[t1000] ${key} ${crypto} SKIP low_vol vol_ratio=${vr.toFixed(2)} min=${effectiveVolMin}`);
          if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
            direction === 'UP' ? yes_ask : no_ask, threshold, 'low_vol',
            { vol_ratio: vr }, cycleStart, _ctxCandles);
          continue;
        }
      }
    }

    // Exhaustion filter: skip if the market already moved significantly in spike direction
    // BEFORE the cycle started (explore_yoyo.js). pre5m_move = net % over 5 min pre-cycle.
    // null = warm-up period → allow trade.
    {
      const exhaustThresh = is15m ? (signalCfg.exhaustThresh15m ?? 0) : (signalCfg.exhaustThresh5m ?? 0);
      if (exhaustThresh > 0 && candle.pre5m_move != null) {
        const preDir = candle.pre5m_move >= 0 ? 'UP' : 'DOWN';
        if (preDir === direction && Math.abs(candle.pre5m_move) > exhaustThresh) {
          if (isLive) logger.info(`[t1000] ${key} ${crypto} SKIP exhausted pre5m=${candle.pre5m_move.toFixed(3)}% thresh=${exhaustThresh}%`);
          if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
            direction === 'UP' ? yes_ask : no_ask, threshold, 'exhausted',
            { pre5m_move: candle.pre5m_move, thresh: exhaustThresh }, cycleStart, _ctxCandles);
          continue;
        }
      }
    }

    // Time-of-day filter: skip configured UTC hours and days of week
    {
      const skipHours = signalCfg.skipHours ?? [];
      const skipDow   = signalCfg.skipDow   ?? [];
      if (skipHours.length > 0 || skipDow.length > 0) {
        const _td  = new Date(cycleStart);
        const hour = _td.getUTCHours();
        const dow  = _td.getUTCDay();
        if (skipHours.includes(hour) || skipDow.includes(dow)) {
          const _rejOrTF = key === 'LIVE' && (strat.rejTradeReasons ?? []).includes('time_filter');
          if (isLive) logger.info(`[t1000] ${key} ${crypto} ${_rejOrTF ? 'OVERRIDE' : 'SKIP'} time_filter h${hour} dow${dow}`);
          if (!_rejOrTF) {
            if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
              direction === 'UP' ? yes_ask : no_ask, threshold, 'time_filter',
              { hour, dow }, cycleStart, _ctxCandles);
            continue;
          }
        }
      }
    }

    // All quality filters passed — mark this key as having seen a T+0 signal this cycle.
    t0SignalMetKeys.add(key);

    // D2 coordination buffer (LIVE only): require ≥coordMinCryptos cryptos firing same
    // direction in the same cycle before executing. Signals are held in liveCoordBuffers
    // for 15 seconds then flushed — all C85 candles for a given cycle arrive within ~2s.
    // coord_wait override: bypass buffer entirely and execute immediately.
    if (key === 'LIVE' && (strat.coordMinCryptos ?? 0) > 1 && !(strat.rejTradeReasons ?? []).includes('coord_wait')) {
      const coordKey = `${cycleStart}:${direction}`;
      if (!liveCoordBuffers.has(coordKey)) {
        liveCoordBuffers.set(coordKey, []);
        setTimeout(() => {
          const buf = liveCoordBuffers.get(coordKey);
          liveCoordBuffers.delete(coordKey);
          if (!buf || buf.length < (strategies.LIVE?.coordMinCryptos ?? 2)) {
            const count = buf?.length ?? 0;
            const min   = strategies.LIVE?.coordMinCryptos ?? 2;
            (buf ?? []).forEach(p => {
              logger.info(`[t1000] LIVE ${p.crypto} SKIP coord_wait (${count}/${min} cryptos DOWN same cycle)`);
              recordRejected(p.crypto, p.candle_size, p.direction, p.absSpike, p.yes_ask, p.no_ask,
                p.no_ask, p.threshold, 'coord_wait', { count, min }, p.cycleStart, p._ctxCandles);
            });
            return;
          }
          buf.forEach(p => _executeQueuedLiveTrade(p));
        }, 15_000);
      }
      liveCoordBuffers.get(coordKey).push({
        crypto, candle_size, direction, is15m, durKey,
        absSpike, spike_pct, yes_ask, no_ask,
        threshold, cycleStart, _ctxCandles, ref_price, candle, bodyRatio, detectionDelayMs,
      });
      continue;  // deferred — will execute from setTimeout flush
    }

    // CLOB entry price — Kalshi tab uses Kalshi WS prices; all others use Polymarket candle
    let entryPrice;
    if (key === 'LIVE_KALSHI') {
      const kPrices = kalshiWebsocket?.getLatestPrices();
      entryPrice = direction === 'UP' ? kPrices?.[crypto]?.yes : kPrices?.[crypto]?.no;
      logger.info(`[t1000] LIVE_KALSHI ${crypto} kalshi prices: yes=${kPrices?.[crypto]?.yes} no=${kPrices?.[crypto]?.no} → entryPrice=${entryPrice}`);
    } else {
      entryPrice = direction === 'UP' ? yes_ask : no_ask;
    }

    if (!entryPrice || entryPrice <= 0) {
      if (isLive) logger.info(`[t1000] ${key} ${crypto} SKIP no_liquidity (yes_ask=${yes_ask} no_ask=${no_ask})`);
      else logger.debug(`[t1000] ${key} ${crypto} skip: no liquidity`);
      addActivity(key, {
        time: new Date(), crypto, candle_size, direction, spike_pct: absSpike,
        status: 'SKIP', reason: 'no_liquidity', entryPrice: null,
      });
      if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
        null, threshold, 'no_liquidity', null,
        cycleStart, _ctxCandles);
      continue;
    }

    const minPrice = isLive
      ? (signalCfg[`minPrice${durKey}_${crypto}_${direction}`] ?? (is15m ? signalCfg.minPrice15m : signalCfg.minPrice5m) ?? signalCfg.minPrice ?? 0)
      : isPaperMirror
        ? (liveStrat[`minPrice${durKey}_${crypto}_${direction}`] ?? (mirrorIs15m ? liveStrat.minPrice15m : liveStrat.minPrice5m) ?? liveStrat.minPrice ?? 0)
        : (strat.minPrice ?? 0);
    const maxPrice = isLive
      ? (signalCfg[`maxPrice${durKey}_${crypto}_${direction}`] ?? signalCfg[`maxPrice${durKey}_${crypto}`] ?? (is15m ? signalCfg.maxPrice15m : signalCfg.maxPrice5m) ?? signalCfg.maxPrice ?? MAX_ENTRY_PRICE)
      : isPaperMirror
        ? (liveStrat[`maxPrice${durKey}_${crypto}_${direction}`] ?? liveStrat[`maxPrice${durKey}_${crypto}`] ?? (mirrorIs15m ? liveStrat.maxPrice15m : liveStrat.maxPrice5m) ?? liveStrat.maxPrice ?? MAX_ENTRY_PRICE)
        : (strat.maxPrice ?? MAX_ENTRY_PRICE);
    if (entryPrice < minPrice) {
      const _rejOrPL = key === 'LIVE' && (strat.rejTradeReasons ?? []).includes('price_too_low');
      if (isLive) logger.info(`[t1000] ${key} ${crypto} ${_rejOrPL ? 'OVERRIDE' : 'SKIP'} price_too_low entry=${(entryPrice*100).toFixed(0)}¢ < min=${(minPrice*100).toFixed(0)}¢`);
      else logger.debug(`[t1000] ${key} ${crypto} skip: CLOB ${(entryPrice*100).toFixed(0)}¢ < floor ${(minPrice*100).toFixed(0)}¢`);
      if (!_rejOrPL) {
        addActivity(key, { time: new Date(), crypto, candle_size, direction, spike_pct: absSpike, status: 'SKIP', reason: 'price_too_low', entryPrice });
        if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
          entryPrice, threshold, 'price_too_low', { entry_c: Math.round(entryPrice*100), min_c: Math.round(minPrice*100) },
          cycleStart, _ctxCandles);
        continue;
      }
    }
    if (entryPrice > maxPrice) {
      const _rejOrPH = key === 'LIVE' && (strat.rejTradeReasons ?? []).includes('price_too_high');
      if (isLive) logger.info(`[t1000] ${key} ${crypto} ${_rejOrPH ? 'OVERRIDE' : 'SKIP'} price_too_high entry=${(entryPrice*100).toFixed(0)}¢ > max=${(maxPrice*100).toFixed(0)}¢`);
      else logger.debug(`[t1000] ${key} ${crypto} skip: CLOB ${(entryPrice*100).toFixed(0)}¢ > limit ${(maxPrice*100).toFixed(0)}¢`);
      if (!_rejOrPH) {
        addActivity(key, { time: new Date(), crypto, candle_size, direction, spike_pct: absSpike, status: 'SKIP', reason: 'price_too_high', entryPrice });
        if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
          entryPrice, threshold, 'price_too_high', { entry_c: Math.round(entryPrice*100), max_c: Math.round(maxPrice*100) },
          cycleStart, _ctxCandles);
        continue;
      }
    }

    // Record paper trade (LIVE uses duration suffix to allow 5m+15m concurrently)
    const tradeKey = key === 'LIVE'
      ? `${cycleStart}_${crypto}_LIVE_${is15m ? '15m' : '5m'}`
      : key === 'LIVE_KALSHI'
        ? `${cycleStart}_${crypto}_LIVE_KALSHI`
        : key === 'LIVE_MINI'
          ? `${cycleStart}_${crypto}_LIVE_MINI_${is15m ? '15m' : '5m'}`
          : `${cycleStart}_${crypto}_${key}`;
    if (pendingTrades.has(tradeKey)) {
      logger.info(`[t1000] ${key} ${crypto} SKIP already_pending this cycle`);
      if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
        entryPrice, threshold, 'already_pending', null,
        cycleStart, _ctxCandles);
      continue;
    }

    // One position per asset: if LIVE/LIVE_MINI already has an open trade for this crypto
    // (in any period — 5m or 15m), skip the new signal to avoid doubling up.
    if (key === 'LIVE' || key === 'LIVE_MINI') {
      const alreadyOpen = [...pendingTrades.values()].some(
        t => t.stratKey === key && t.crypto === crypto
      );
      if (alreadyOpen) {
        logger.info(`[t1000] ${key} ${crypto} SKIP asset_already_open (cross-period duplicate)`);
        if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
          entryPrice, threshold, 'asset_already_open', null,
          cycleStart, _ctxCandles);
        continue;
      }
    }

    // Market-in-progress guard: block LIVE/LIVE_MINI until the running market cycle ends
    if ((key === 'LIVE' || key === 'LIVE_MINI') && Date.now() < _liveBlockedUntil) {
      const remSec = Math.ceil((_liveBlockedUntil - Date.now()) / 1000);
      logger.info(`[t1000] ${key} ${crypto} SKIP live_market_in_progress (${remSec}s remaining)`);
      if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
        entryPrice, threshold, 'live_market_in_progress', { blocked_until: new Date(_liveBlockedUntil).toISOString(), rem_sec: remSec },
        cycleStart, _ctxCandles);
      continue;
    }

    // Circuit breaker: skip if a LOSS was resolved recently.
    // LIVE_MINI inherits LIVE's CB so a manual LIVE CB (or LIVE loss) also blocks MINI.
    if ((key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI') && strat.circuitBreakerEnabled !== false) {
      const _cbUntil = key === 'LIVE_MINI'
        ? Math.max(strat.circuitBreakerUntil ?? 0, strategies.LIVE?.circuitBreakerUntil ?? 0)
        : (strat.circuitBreakerUntil ?? 0);
      if (_cbUntil > Date.now()) {
        const remMins = Math.ceil((_cbUntil - Date.now()) / 60_000);
        logger.info(`[t1000] ${key} ${crypto} SKIP circuit_breaker (${remMins}min remaining)`);
        if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
          entryPrice, threshold, 'circuit_breaker', { remainingMins: remMins }, cycleStart, _ctxCandles);
        t0SkippedMaxPosKeys.add(key);
        continue;
      }
    }

    // Drawdown limit: stop entries if too many losses in the rolling window.
    // LIVE_MINI also inherits LIVE's DRWL so a LIVE drawdown cascades to MINI.
    if (key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI') {
      const dl = key === 'LIVE_MINI'
        ? (checkDrawdownLimit(strat).active ? checkDrawdownLimit(strat) : checkDrawdownLimit(strategies.LIVE))
        : checkDrawdownLimit(strat);
      if (dl.active) {
        const remMins = Math.ceil((dl.pausedUntil - Date.now()) / 60_000);
        logger.info(`[t1000] ${key} ${crypto} SKIP drawdown_limit (${dl.count} losses in window, resumes in ${remMins}min)`);
        if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
          entryPrice, threshold, 'drawdown_limit', { recentLosses: dl.count, remMins }, cycleStart, _ctxCandles);
        t0SkippedMaxPosKeys.add(key);
        continue;
      }
    }

    // Max concurrent positions cap (LIVE + LIVE_KALSHI + LIVE_MINI)
    if ((key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI') && strat.maxPositions != null) {
      const openCount = strat.activityLog.filter(e => e.status === 'OPEN' && !e.isFokRetry).length;
      if (openCount >= strat.maxPositions) {
        logger.info(`[t1000] ${key} ${crypto} SKIP max_positions (${openCount}/${strat.maxPositions})`);
        if (key === 'LIVE') recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
          entryPrice, threshold, 'max_positions', { open: openCount, max: strat.maxPositions },
          cycleStart, _ctxCandles);
        t0SkippedMaxPosKeys.add(key);  // don't waste a T+1 slot when all positions are full
        continue;
      }
    }

    const liveMaxTrade = isLive
      ? (() => {
          const durKey = is15m ? '15m' : '5m';
          const base   = is15m ? strat.maxTrade15m : strat.maxTrade5m;
          return strat[`maxTrade${durKey}_${crypto}`] ?? base ?? strat.maxTrade ?? MAX_TRADE_5M;
        })()
      : isPaperMirror
        ? (() => {
            const durKey = mirrorIs15m ? '15m' : '5m';
            const base   = mirrorIs15m ? liveStrat.maxTrade15m : liveStrat.maxTrade5m;
            return liveStrat[`maxTrade${durKey}_${crypto}`] ?? base ?? liveStrat.maxTrade ?? MAX_TRADE_5M;
          })()
        : (strat[`maxTrade_${crypto}`] ?? strat.maxTrade ?? MAX_TRADE_5M);
    // For LIVE sizing: use liquid + locked-in-open-positions so each trade is sized against
    // the full portfolio value, not just the shrinking on-chain USDC.e balance.
    // USDC locked in OPEN positions is still "yours" — it's held by the CLOB pending resolution.
    // Without this, each successive trade in a cycle sizes against a depleted liquid balance
    // (e.g. $34→$28→$23) even though total capital hasn't changed.
    let balanceForSizing;
    if ((key === 'LIVE' || key === 'LIVE_MINI') && liveRealBalance != null) {
      const openLocked = (strat.activityLog || [])
        .filter(e => e.status === 'OPEN' && (e.walletId ?? 'default') === 'default')
        .reduce((sum, e) => sum + (e.position || 0), 0);
      balanceForSizing = liveRealBalance + openLocked;
    } else if (key === 'LIVE_KALSHI' && kalshiRealBalance != null) {
      balanceForSizing = kalshiRealBalance;
    } else {
      balanceForSizing = strat.balance;
    }
    // LIVE_MINI: compute LIVE's full bet (with cap) first, then divide by riskDivisor
    const riskPct = key === 'LIVE_MINI' ? (strategies.LIVE?.riskPct ?? RISK_PCT) : (strat.riskPct ?? RISK_PCT);
    let position;
    if (key === 'LIVE_MINI') {
      const livePos = Math.min(balanceForSizing * riskPct, liveMaxTrade);
      position = Math.max(livePos / (strat.riskDivisor ?? 3), 1);
    } else {
      position = Math.min(balanceForSizing * riskPct, liveMaxTrade);
    }

    if (isLive) {
      const openLocked = (key === 'LIVE' || key === 'LIVE_MINI')
        ? (strat.activityLog || []).filter(e => e.status === 'OPEN' && (e.walletId ?? 'default') === 'default').reduce((sum, e) => sum + (e.position || 0), 0)
        : 0;
      logger.info(`[t1000] ${key} ${crypto} sizing: liquid=$${(liveRealBalance ?? kalshiRealBalance ?? strat.balance)?.toFixed(2)} + locked=$${openLocked.toFixed(2)} = $${balanceForSizing?.toFixed(2)} × ${(riskPct*100).toFixed(1)}% → position=$${position.toFixed(2)}`);
    }

    // Polymarket CLOB minimum order size is $1
    const MIN_ORDER_USD = 1;
    if (position < MIN_ORDER_USD) {
      logger.info(`[t1000] ${key} ${crypto} SKIP below_minimum position=$${position.toFixed(2)} < $${MIN_ORDER_USD}`);
      addActivity(key, {
        time: new Date(), crypto, candle_size, direction, spike_pct: absSpike,
        status: 'SKIP', reason: 'below_minimum', entryPrice,
      });
      continue;
    }
    const tradeTs  = new Date();
    const cycleMs  = candle_size >= 150 ? 15 * 60 * 1000 : 5 * 60 * 1000;

    const _d      = new Date(cycleStart);
    const hhmm    = _d.toISOString().slice(11, 16).replace(':', '');
    const dateStr = String(_d.getUTCFullYear()).slice(2)
                  + String(_d.getUTCMonth() + 1).padStart(2, '0')
                  + String(_d.getUTCDate()).padStart(2, '0');
    // Format: CRYPTO_YYMMDD_HHMM_KEY  e.g. SOL_260301_1930_LIVE_5m
    // Date included so IDs remain unique across days; 5m/15m suffix avoids
    // collision in pendingRedemptions when both fire in the same cycle-minute.
    const tradeId = key === 'LIVE'
      ? `${crypto}_${dateStr}_${hhmm}_LIVE_${is15m ? '15m' : '5m'}`
      : key === 'LIVE_MINI'
        ? `${crypto}_${dateStr}_${hhmm}_MINI_${is15m ? '15m' : '5m'}`
        : `${crypto}_${dateStr}_${hhmm}_${key}`;  // e.g. BTC_260301_1430_C85

    // T0 off: skip T0 trade placement but allow T1/TC cascade (don't add to t0PlacedKeys)
    if (signalCfg.t0off) {
      if (isLive) logger.info(`[t1000] ${key} ${crypto} SKIP t0_off (T1/TC cascade allowed)`);
      continue;
    }

    pendingTrades.set(tradeKey, {
      stratKey    : key,
      crypto,
      direction,
      entryPrice,
      position,
      refPrice    : ref_price,
      candleSize  : candle_size,
      threshold,  // captured at trade time so WIN/LOSS notif can show the exact trio
      t0Open      : candle.open,   // Binance open at T+0; used by RECOVER reversion check
      absSpike,                    // T+0 spike magnitude
      timestamp   : tradeTs,
      cycleStart,
      cycleMs,    // 300000 for 5-min, 900000 for 15-min
      dbLogKey,   // Link to DB row for resolution
      tradeId,    // Short human-readable ID for notifications
      walletId    : 'default',
    });
    t0PlacedKeys.add(key);  // mark: T+0 placed for this key — suppress T+1 scheduling

    logger.info(`[t1000] ${key} ${crypto} OPEN direction=${direction} entry=${(entryPrice*100).toFixed(0)}¢ spike=${spike_pct.toFixed(3)}%`);

    if (NTFY_KEYS.has(key)) {
      const dir         = direction === 'UP' ? '🟢 UP ↗ ↗ ↗ ↗' : '🔴 DOWN ↘ ↘ ↘ ↘';
      const period      = is15m ? '15MIN' : '5MIN';
      const timeStr     = tradeTs.toISOString().slice(11, 19) + ' UTC';
      const label       = key === 'LIVE'
        ? `LIVE@${is15m ? '15M' : '5M'}`
        : key === 'LIVE_KALSHI'
          ? 'KALSHI@15M'
          : key === 'LIVE_MINI'
            ? `MINI@${is15m ? '15M' : '5M'}`
            : NTFY_LABEL[key];
      const mktUrl      = key === 'LIVE_KALSHI' ? null : polyUrl(crypto, cycleStart, candle_size);
      const priceLine   = `Price: ${(entryPrice*100).toFixed(0)}¢  Max: ${(maxPrice*100).toFixed(0)}¢`;
      const trioStr     = `C${candle_size} / ${threshold.toFixed(2)}%`;
      const msg         = `${tradeId} • ${label} • [${trioStr}] • Spike +${absSpike.toFixed(2)}% • Bet $${position.toFixed(2)}`;
      telegramSend(`⚡ <b>SIGNAL: ${crypto} ${dir}  [${period}]</b>  ${timeStr}\n${priceLine}\n${msg}${mktUrl ? `\n<a href="${mktUrl}">📊 Trade now</a>` : ''}`);
    }

    addActivity(key, {
      time: tradeTs, crypto, candle_size, direction,
      spike_pct: absSpike, threshold, status: 'OPEN', entryPrice,
      position, tradeId, cycleStart,
      t0Open: candle.open,
      contextCandles: _ctxCandles,
      body_ratio: bodyRatio,
      walletId: 'default',
    });

    // ── Fire real order (non-blocking) ───────────────────────────────────────
    if (key === 'LIVE' || key === 'LIVE_MINI') {
      if (key === 'LIVE') {
        // Lock out new trades until this market cycle ends
        const _mktEnd = cycleStart + (is15m ? 900_000 : 300_000);
        if (_mktEnd > _liveBlockedUntil) _liveBlockedUntil = _mktEnd;
        // Place LIVE first; store promise so LIVE_MINI can chain off it
        const _p = placeLiveOrder(crypto, is15m, direction, position, entryPrice, tradeId, detectionDelayMs, key);
        _p.catch(() => {});
        _liveOrderPromises.set(`${cycleStart}_${crypto}_${durKey}`, _p);
        if (_liveOrderPromises.size > 200) {
          const oldest = _liveOrderPromises.keys().next().value;
          _liveOrderPromises.delete(oldest);
        }
        // Fan-out to extra wallets (independent CB/DL/sizing per wallet)
        _fanOutExtraWallets(key, strat, crypto, is15m, direction, entryPrice, liveMaxTrade,
          tradeId, tradeKey, tradeTs, candle_size, cycleStart, cycleMs, ref_price, absSpike,
          candle, threshold, riskPct, detectionDelayMs);
      } else {
        // LIVE_MINI: wait for LIVE's order to complete first (priority), then fire
        const _liveP = _liveOrderPromises.get(`${cycleStart}_${crypto}_${durKey}`);
        const _fireMini = () => placeLiveOrder(crypto, is15m, direction, position, entryPrice, tradeId, detectionDelayMs, key).catch(() => {});
        (_liveP ?? Promise.resolve()).then(_fireMini, _fireMini);
      }
    } else if (key === 'LIVE_KALSHI') {
      placeKalshiOrder(crypto, direction, position, entryPrice, tradeId).catch(() => {});
    }

    // ── Schedule RECOVER checks for LIVE trades ───────────────────────────────
    // 5m: check T+1 and T+2 only
    // 15m: check last 2 candles of the trackable window (T+(maxN-1) and T+maxN)
    if (key === 'LIVE' && strat.recoverEnabled !== false) {
      const maxN = is15m ? Math.floor((900 - candle_size) / candle_size) : 2;
      const minN = is15m ? Math.max(1, maxN - 1) : 1;
      for (let n = minN; n <= maxN; n++) {
        const checkAtMs = cycleStart + (n + 1) * candle_size * 1000;
        const delay = checkAtMs - Date.now();
        if (delay > 0) {
          const _tk = tradeKey; const _n = n;
          setTimeout(() => {
            checkRecover(_tk, _n).catch(e => logger.warn('[t1000] checkRecover error', { error: e.message }));
          }, delay);
        }
      }
    }

  }

  // ── T+1 secondary entry: schedule delayed check for strategy keys that missed T+0 ──
  // T+0 missed means: the candle fired but no trade was placed for that key.
  // At T+1 time (one candle-size later), check if the Binance price has continued in the
  // same direction with sufficient spike + beat-distance, then enter at current CLOB prices.
  if (cOpen != null && cClose != null) {
    const durationMs = is15mCandle ? 15 * 60 * 1000 : 5 * 60 * 1000;
    const t1CheckAt  = cycleStart + 2 * candle_size * 1000;
    if (t1CheckAt < cycleStart + durationMs) {  // T+1 window must fit within cycle
      for (const key of keysToCheck) {
        if (t0PlacedKeys.has(key))        continue;  // T+0 fired — no T+1
        if (t0SkippedMaxPosKeys.has(key)) continue; // all slots full at T+0 — no point queuing T+1
        const strat = strategies[key];
        const signalCfg = (key === 'LIVE_MINI' && strategies.LIVE) ? strategies.LIVE : strat;
        if (!signalCfg?.t1Mode && !signalCfg?.t1standalone) continue;  // neither TC nor T1 enabled

        const isLiveKey    = key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI';
        const liveStrat    = strategies.LIVE;
        const effectiveCxx = liveStrat?.[`strategy${durKey}_${crypto}`] ?? liveStrat?.[`strategy${durKey}`];
        const isPaperMirr  = !isLiveKey && liveStrat && effectiveCxx === stratKey;
        const mirrorIs15m  = isPaperMirr && is15mCandle;

        // Compute threshold (mirrors the main loop logic)
        let t1Threshold;
        if (key === 'LIVE') {
          const ck = is15mCandle ? `threshold15m_${crypto}` : `threshold5m_${crypto}`;
          t1Threshold = strat[ck] ?? (is15mCandle ? strat.threshold15m : strat.threshold5m) ?? strat.threshold ?? 0.24;
        } else if (key === 'LIVE_KALSHI') {
          t1Threshold = strat[`threshold15m_${crypto}`] ?? strat.threshold15m ?? strat.threshold ?? 0.24;
        } else if (key === 'LIVE_MINI') {
          // LIVE_MINI inherits thresholds from LIVE
          const ck = is15mCandle ? `threshold15m_${crypto}` : `threshold5m_${crypto}`;
          t1Threshold = signalCfg[ck] ?? (is15mCandle ? signalCfg.threshold15m : signalCfg.threshold5m) ?? signalCfg.threshold ?? 0.24;
        } else if (isPaperMirr) {
          const ck = mirrorIs15m ? `threshold15m_${crypto}` : `threshold5m_${crypto}`;
          t1Threshold = liveStrat[ck] ?? (mirrorIs15m ? liveStrat.threshold15m : liveStrat.threshold5m) ?? 0.24;
        } else {
          t1Threshold = strat[`threshold_${crypto}`] ?? strat.threshold ?? 0.24;
        }

        // Price bounds
        const t1MinPrice = isLiveKey
          ? ((is15mCandle ? signalCfg.minPrice15m : signalCfg.minPrice5m) ?? signalCfg.minPrice ?? 0)
          : isPaperMirr
            ? ((mirrorIs15m ? liveStrat.minPrice15m : liveStrat.minPrice5m) ?? liveStrat.minPrice ?? 0)
            : (strat.minPrice ?? 0);
        const t1MaxPrice = isLiveKey
          ? (signalCfg[`maxPrice${durKey}_${crypto}`] ?? (is15mCandle ? signalCfg.maxPriceT1_15m : signalCfg.maxPriceT1_5m) ?? (is15mCandle ? signalCfg.maxPrice15m : signalCfg.maxPrice5m) ?? signalCfg.maxPrice ?? MAX_ENTRY_PRICE)
          : isPaperMirr
            ? (liveStrat[`maxPrice${durKey}_${crypto}`] ?? (mirrorIs15m ? liveStrat.maxPriceT1_15m : liveStrat.maxPriceT1_5m) ?? (mirrorIs15m ? liveStrat.maxPrice15m : liveStrat.maxPrice5m) ?? liveStrat.maxPrice ?? MAX_ENTRY_PRICE)
            : (strat.maxPrice ?? MAX_ENTRY_PRICE);

        // Max trade cap
        const t1MaxTrade = isLiveKey
          ? (() => {
              const dk   = is15mCandle ? '15m' : '5m';
              const base = is15mCandle ? strat.maxTrade15m : strat.maxTrade5m;
              return strat[`maxTrade${dk}_${crypto}`] ?? base ?? strat.maxTrade ?? MAX_TRADE_5M;
            })()
          : isPaperMirr
            ? (() => {
                const dk   = mirrorIs15m ? '15m' : '5m';
                const base = mirrorIs15m ? liveStrat.maxTrade15m : liveStrat.maxTrade5m;
                return liveStrat[`maxTrade${dk}_${crypto}`] ?? base ?? liveStrat.maxTrade ?? MAX_TRADE_5M;
              })()
            : (strat[`maxTrade_${crypto}`] ?? strat.maxTrade ?? MAX_TRADE_5M);

        const t1Key = `t1_${cycleStart}_${crypto}_${candle_size}_${key}`;
        const t1Entry = {
          t0Open     : cOpen,
          t0High     : cHigh,
          t0Low      : cLow,
          t0Close    : cClose,
          t0Direction: direction,   // stored explicitly — needed for continuation check
          yesAsk     : yes_ask,
          noAsk      : no_ask,
          refPrice   : ref_price,
          threshold  : t1Threshold,
          minPrice   : t1MinPrice,
          maxPrice   : t1MaxPrice,
          maxTrade   : t1MaxTrade,
          is15m      : is15mCandle,
          key, crypto, candleSize: candle_size, cycleStart, durationMs,
          // T+1 candle OHLC tracking for body filter (T+1 opens at t0Close)
          t1TrackHigh: cClose,
          t1TrackLow : cClose,
          _trackTid  : null,
        };
        pendingT1.set(t1Key, t1Entry);

        const t1Delay = t1CheckAt - Date.now();
        if (t1Delay > 0) {
          const _k = t1Key;
          // Poll Binance price every 5s to track T+1 candle high/low for body filter
          t1Entry._trackTid = setInterval(() => {
            const info = pendingT1.get(_k);
            if (!info) { clearInterval(t1Entry._trackTid); return; }
            const p = _currentCloseGetter?.(crypto);
            if (p && p > 0) {
              if (p > info.t1TrackHigh) info.t1TrackHigh = p;
              if (p < info.t1TrackLow)  info.t1TrackLow  = p;
            }
          }, 5000);
          setTimeout(() => runT1Check(_k), t1Delay);
          logger.debug(`[t1000] T+1 ${key} ${crypto} C${candle_size} scheduled in ${Math.round(t1Delay/1000)}s`);
        }
        // If t1Delay <= 0: pipeline was too slow, T+1 window already passed — skip silently
      }
    }
  }
}

// ── T+1 secondary entry check ─────────────────────────────────────────────────
// Called via setTimeout one candle_size after T+0 fired (and missed).
// Uses current Binance close as the T+1 close price.
function runT1Check(t1Key) {
  const t1Info = pendingT1.get(t1Key);
  if (!t1Info) return;
  pendingT1.delete(t1Key);
  if (t1Info._trackTid) clearInterval(t1Info._trackTid);

  const { t0Open, t0High, t0Low, t0Close, t0Direction,
          yesAsk, noAsk, refPrice: t0RefPrice, threshold,
          minPrice, maxPrice, maxTrade, is15m, key, crypto, candleSize, cycleStart, durationMs } = t1Info;

  const strat = strategies[key];
  // signalCfg: inherit signal settings from LIVE when key is LIVE_MINI
  const signalCfg = (key === 'LIVE_MINI' && strategies.LIVE) ? strategies.LIVE : strat;
  if (!strat?.enabled || (!signalCfg?.t1Mode && !signalCfg?.t1standalone)) return;  // strategy disabled or neither TC/T1 enabled

  // Cycle must still be active
  const now = Date.now();
  if (now >= cycleStart + durationMs) return;

  // T+0 must NOT have placed a trade for this cycle (race: another signal may have fired)
  const tradeKey = key === 'LIVE'
    ? `${cycleStart}_${crypto}_LIVE_${is15m ? '15m' : '5m'}`
    : key === 'LIVE_KALSHI'
      ? `${cycleStart}_${crypto}_LIVE_KALSHI`
      : key === 'LIVE_MINI'
        ? `${cycleStart}_${crypto}_LIVE_MINI_${is15m ? '15m' : '5m'}`
        : `${cycleStart}_${crypto}_${key}`;
  if (pendingTrades.has(tradeKey)) {
    logger.debug(`[t1000] T+1 ${key} ${crypto} C${candleSize} skipped: trade already placed this cycle`);
    return;
  }

  // Market-in-progress guard (T+1)
  if ((key === 'LIVE' || key === 'LIVE_MINI') && Date.now() < _liveBlockedUntil) {
    const remSec = Math.ceil((_liveBlockedUntil - Date.now()) / 1000);
    logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP live_market_in_progress (${remSec}s remaining)`);
    return;
  }

  // Get current Binance price as T+1 close
  const t1Close = _currentCloseGetter?.(crypto);
  if (!t1Close || t1Close <= 0) {
    logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP no_binance_close`);
    return;
  }

  // Finalise T+1 OHLC tracking (close is now known — ensure it's within tracked range)
  const t1High = Math.max(t1Info.t1TrackHigh, t1Close);
  const t1Low  = Math.min(t1Info.t1TrackLow,  t1Close);

  // Three-tier cascade:
  //   Tier 2: T+1 standalone spike — T+1.open = T+0.close (exact), T+1.close = current price
  //   Tier 3: TC cumulative spike  — T+0.open → T+1.close
  const t1Open = t0Close;  // T+1 opens exactly where T+0 ended
  let t1Dir = null, combinedSpikePct = null, t1Label = null;

  // Tier 2: T+1 own standalone spike — only evaluated when t1standalone checkbox is ON
  if (signalCfg.t1standalone) {
    const t1SpikeRaw = (t1Close - t1Open) / t1Open;
    if (Math.abs(t1SpikeRaw) * 100 >= threshold) {
      t1Dir            = t1SpikeRaw > 0 ? 'UP' : 'DOWN';
      combinedSpikePct = (t1SpikeRaw * 100).toFixed(3);
      t1Label          = 'T1';
      logger.debug(`[t1000] T+1 ${key} ${crypto} C${candleSize} Tier2 spike=${combinedSpikePct}%`);
    }
  }

  // Tier 3: TC cumulative (T+0.open → T+1.close) — only if tcEnabled (t1Mode checkbox is ON)
  if (t1Dir === null && !signalCfg.t1Mode) {
    logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP tc_disabled`);
    return;
  }
  if (t1Dir === null) {
    const tcRaw = (t1Close - t0Open) / t0Open;
    if (Math.abs(tcRaw) * 100 >= threshold) {
      t1Dir            = tcRaw > 0 ? 'UP' : 'DOWN';
      combinedSpikePct = (tcRaw * 100).toFixed(3);
      t1Label          = 'TC';
      logger.debug(`[t1000] T+1 ${key} ${crypto} C${candleSize} Tier3 tcSpike=${combinedSpikePct}%`);
    }
  }

  if (t1Dir === null) {
    logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP no_tier_match t1=${t1Close.toFixed(4)} t0Close=${t0Close.toFixed(4)} t0Open=${t0Open.toFixed(4)}`);
    return;
  }

  // Direction filter: mirrors T+0 check — must apply here too since T+0 direction-filtered
  // signals are still queued for T+1 (they never reach t0PlacedKeys so T+1 always fires).
  if (signalCfg.directionFilter && t1Dir !== signalCfg.directionFilter) {
    if (key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI') {
      logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP dir_filter (${t1Dir} ≠ ${signalCfg.directionFilter})`);
    }
    return;
  }

  // Count T1/TC rejections for LIVE (tier matched but trade blocked).
  // Also persists to DB so the rejected modal can show T1/TC entries.
  // IMPORTANT: must be declared before the body filter block below (which may call it).
  const _cntRej = (reason, extraDetails = {}) => {
    if (key === 'LIVE') {
      _rejStats[t1Label.toLowerCase()]++;
      recordRejected(crypto, candleSize, t1Dir, parseFloat(combinedSpikePct),
        yesAsk, noAsk, t1Dir === 'UP' ? yesAsk : noAsk, threshold,
        reason, extraDetails, cycleStart, null, t1Label);
    }
  };

  // Body filter — composite window T0.open→T1.close for both T1 and TC.
  // Rejects V-shape patterns: T+0 moves counter-direction before T+1 bounce.
  // (Old T1 path checked T+1 candle only — missed the V-shape context entirely.)
  {
    const bodyPct = signalCfg.bodyPct ?? 76;
    if (bodyPct > 0) {
      const t1Down  = t1Close < t1Open;  // t1Open = t0Close
      const tcHigh  = t1Down ? t0High : t1High;
      const tcLow   = t1Down ? t1Low  : t0Low;
      const tcRange = tcHigh - tcLow;
      const tcBody  = Math.abs(t1Close - t0Open);
      const bodyRatio = tcRange > 0 ? tcBody / tcRange * 100 : 100;
      if (bodyRatio < bodyPct) {
        const _t1BodyReason = `weak_${t1Label.toLowerCase()}_body`;
        const _rejOrT1B = key === 'LIVE' && (strat.rejTradeReasons ?? []).includes(_t1BodyReason);
        logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} ${_rejOrT1B ? 'OVERRIDE' : 'SKIP'} ${_t1BodyReason} body=${bodyRatio.toFixed(1)}% min=${bodyPct}%`);
        if (!_rejOrT1B) {
          _cntRej(_t1BodyReason, { bodyRatio: parseFloat(bodyRatio.toFixed(1)) });
          return;
        }
      }
    }
  }

  // Dist filter: cumulative Binance move (T+0.open → T+1.close) must reach distMin%
  {
    const distMin = is15m ? (signalCfg.distMin15m ?? 0) : (signalCfg.distMin5m ?? 0);
    if (distMin > 0 && t0Open > 0) {
      const dist = (t1Close - t0Open) / t0Open * 100;
      if ((t1Dir === 'UP' ? dist : -dist) < distMin) {
        logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP low_dist dist=${dist.toFixed(3)}% min=${distMin}%`);
        _cntRej('low_dist', { dist: parseFloat(dist.toFixed(3)), min: distMin }); return;
      }
    }
  }

  // Entry price: refresh from live CLOB WebSocket so the price-cap check uses the current
  // market ask, not the stale T+0 snapshot stored in t1Info.  Falls back to T+0 snapshot
  // if the getter is unavailable (paper mode / getter not yet injected).
  const _t1LiveGetter = is15m ? _clobSubGetter15m : _clobSubGetter5m;
  const _t1LiveSub    = _t1LiveGetter?.(crypto);
  const liveYesAsk    = _t1LiveSub?.upAsk   ?? yesAsk;
  const liveNoAsk     = _t1LiveSub?.downAsk ?? noAsk;
  const entryPrice    = t1Dir === 'UP' ? liveYesAsk : liveNoAsk;
  if (!entryPrice || entryPrice <= 0) {
    logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP no_liquidity`);
    _cntRej('no_liquidity'); return;
  }
  // Apply per-direction min/max price (resolved now that t1Dir is known)
  const _dirBounds = (() => {
    const durKey2 = is15m ? '15m' : '5m';
    const liveStrat2 = strategies.LIVE;
    const isLiveKey2 = key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI';
    const effectiveCxx2 = liveStrat2?.[`strategy${durKey2}_${crypto}`] ?? liveStrat2?.[`strategy${durKey2}`];
    const isPaperMirr2 = !isLiveKey2 && liveStrat2 && effectiveCxx2 === `C${candleSize}`;
    const src = isLiveKey2 ? signalCfg : isPaperMirr2 ? liveStrat2 : null;
    const dirMin = src?.[`minPrice${durKey2}_${crypto}_${t1Dir}`] ?? null;
    const dirMax = src?.[`maxPrice${durKey2}_${crypto}_${t1Dir}`] ?? null;
    // Per-label price bounds:
    //   TC: high floor (minPriceT1=85¢; 75-85¢ bucket = 50% WR; ≥85¢ = 91.9% WR), max = maxPrice (97¢)
    //   T1: no floor (T1 fires at 50-80¢ where EV>0), max = maxPriceT1standalone (79¢ default)
    if (t1Label === 'T1') {
      const t1StMax = signalCfg.maxPriceT1standalone ?? 0.89;
      return {
        effMin: Math.max(minPrice, (dirMin != null && dirMin > 0) ? dirMin : 0),
        effMax: Math.min(t1StMax, (dirMax != null && dirMax < maxPrice) ? dirMax : maxPrice),
      };
    }
    // TC
    const _minT1 = signalCfg.minPriceT1 ?? 0.85;
    return {
      effMin: Math.max(minPrice, _minT1, (dirMin != null && dirMin > 0) ? dirMin : 0),
      effMax: (dirMax != null && dirMax < maxPrice) ? dirMax : maxPrice,
    };
  })();
  const t1MaxPriceEff = _dirBounds.effMax;
  const t1MinPriceEff = _dirBounds.effMin;
  if (!signalCfg.allowPriceOor && (entryPrice < t1MinPriceEff || entryPrice > t1MaxPriceEff)) {
    const _rejOrPOOR = key === 'LIVE' && (strat.rejTradeReasons ?? []).includes('price_out_of_range');
    logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} ${_rejOrPOOR ? 'OVERRIDE' : 'SKIP'} price_out_of_range (${(entryPrice*100).toFixed(0)}¢)`);
    if (!_rejOrPOOR) {
      _cntRej('price_out_of_range', { entry_c: Math.round(entryPrice * 100) }); return;
    }
  }

  const isLive = key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI';

  // One-asset rule (LIVE and LIVE_MINI — each checks own positions only).
  // Fallback to activityLog guards against restart mid-cycle: if engine restarted after T+0
  // fired, pendingTrades is empty but the OPEN entry is still in activityLog → T+1 must not fire.
  if (key === 'LIVE' || key === 'LIVE_MINI') {
    const alreadyOpen = [...pendingTrades.values()].some(t => t.stratKey === key && t.crypto === crypto)
      || (strat.activityLog || []).some(e =>
          e.status === 'OPEN' && e.crypto === crypto && e.cycleStart === cycleStart && !e.isFokRetry);
    if (alreadyOpen) {
      logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP asset_already_open`);
      if (key === 'LIVE') _cntRej('asset_already_open');
      return;
    }
  }

  // Circuit breaker (T+1) — LIVE_MINI inherits LIVE's CB.
  const _t1CbUntil = key === 'LIVE_MINI'
    ? Math.max(strat.circuitBreakerUntil ?? 0, strategies.LIVE?.circuitBreakerUntil ?? 0)
    : (strat.circuitBreakerUntil ?? 0);
  if (isLive && strat.circuitBreakerEnabled !== false && _t1CbUntil > Date.now()) {
    const remMins = Math.ceil((_t1CbUntil - Date.now()) / 60_000);
    logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP circuit_breaker (${remMins}min remaining)`);
    _cntRej('circuit_breaker', { mins_remaining: remMins }); return;
  }

  // Drawdown limit (T+1)
  if (isLive) {
    // LIVE_MINI also inherits LIVE's DRWL (T+1 path).
    const dl = key === 'LIVE_MINI'
      ? (checkDrawdownLimit(strat).active ? checkDrawdownLimit(strat) : checkDrawdownLimit(strategies.LIVE))
      : checkDrawdownLimit(strat);
    if (dl.active) {
      const remMins = Math.ceil((dl.pausedUntil - Date.now()) / 60_000);
      logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP drawdown_limit (${dl.count} losses in window, resumes in ${remMins}min)`);
      _cntRej('drawdown_limit', { count: dl.count, mins_remaining: remMins }); return;
    }
  }

  // Max concurrent positions cap
  if (isLive && strat.maxPositions != null) {
    const openCount = strat.activityLog.filter(e => e.status === 'OPEN' && !e.isFokRetry).length;
    if (openCount >= strat.maxPositions) {
      logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP max_positions (${openCount}/${strat.maxPositions})`);
      _cntRej('max_positions', { open: openCount, max: strat.maxPositions }); return;
    }
  }

  // Position sizing (same logic as T+0)
  let balanceForSizing;
  if ((key === 'LIVE' || key === 'LIVE_MINI') && liveRealBalance != null) {
    const openLocked = (strat.activityLog || [])
      .filter(e => e.status === 'OPEN' && (e.walletId ?? 'default') === 'default').reduce((sum, e) => sum + (e.position || 0), 0);
    balanceForSizing = liveRealBalance + openLocked;
  } else if (key === 'LIVE_KALSHI' && kalshiRealBalance != null) {
    balanceForSizing = kalshiRealBalance;
  } else {
    balanceForSizing = strat.balance;
  }
  const riskPct = key === 'LIVE_MINI' ? (strategies.LIVE?.riskPct ?? RISK_PCT) : (strat.riskPct ?? RISK_PCT);
  let position;
  if (key === 'LIVE_MINI') {
    const livePos = Math.min(balanceForSizing * riskPct, maxTrade);
    position = Math.max(livePos / (strat.riskDivisor ?? 3), 1);
  } else {
    position = Math.min(balanceForSizing * riskPct, maxTrade);
  }
  if (position < 1) {
    logger.info(`[t1000] T+1 ${key} ${crypto} C${candleSize} SKIP below_minimum position=$${position.toFixed(2)}`);
    _cntRej('below_minimum', { position: parseFloat(position.toFixed(2)) }); return;
  }

  // Build trade IDs
  const tradeTs = new Date();
  const cycleMs = candleSize >= 150 ? 15 * 60 * 1000 : 5 * 60 * 1000;
  const _d      = new Date(cycleStart);
  const hhmm    = _d.toISOString().slice(11, 16).replace(':', '');
  const dateStr = String(_d.getUTCFullYear()).slice(2)
                + String(_d.getUTCMonth() + 1).padStart(2, '0')
                + String(_d.getUTCDate()).padStart(2, '0');
  const tradeId = key === 'LIVE'
    ? `${crypto}_${dateStr}_${hhmm}_LIVE_${is15m ? '15m' : '5m'}_T1`
    : key === 'LIVE_MINI'
      ? `${crypto}_${dateStr}_${hhmm}_MINI_${is15m ? '15m' : '5m'}_T1`
      : `${crypto}_${dateStr}_${hhmm}_${key}_T1`;

  pendingTrades.set(tradeKey, {
    stratKey   : key,
    crypto,
    direction  : t1Dir,
    entryPrice,
    position,
    refPrice   : t0RefPrice,
    candleSize,
    threshold,
    t0Open,         // original T+0 Binance open (beat-price reference for RECOVER)
    absSpike   : parseFloat(Math.abs(parseFloat(combinedSpikePct))),
    timestamp  : tradeTs,
    cycleStart,
    cycleMs,
    tradeId,
    isT1       : true,
    walletId   : 'default',
  });

  logger.info(`[t1000] T+1 ${key} ${crypto} OPEN direction=${t1Dir} entry=${(entryPrice*100).toFixed(0)}¢ combinedSpike=${combinedSpikePct}% continuation=ok`);

  // Precompute body ratios for later analysis (stored in activityLog)
  // T+0 body: uses T+0 range (exact)
  // T+1/TC body: uses tracked T+1 high/low (polled every 5s during window)
  const _t0Range     = t0High - t0Low;
  const _t1Range     = t1High - t1Low;
  const _t0BodyRatio = _t0Range > 0 ? parseFloat((Math.abs(t0Close - t0Open) / _t0Range * 100).toFixed(1)) : null;
  const _t1Down      = t1Close < t1Open;
  const _tcHigh      = _t1Down ? t0High : t1High;
  const _tcLow       = _t1Down ? t1Low  : t0Low;
  const _tcRange     = _tcHigh - _tcLow;
  const _tcBodyRatio = _tcRange > 0 ? parseFloat((Math.abs(t1Close - t0Open) / _tcRange * 100).toFixed(1)) : null;

  addActivity(key, {
    time       : tradeTs,
    crypto,
    candle_size: candleSize,
    direction  : t1Dir,
    spike_pct  : parseFloat(combinedSpikePct),
    threshold,
    status     : 'OPEN',
    entryPrice,
    position,
    tradeId,
    cycleStart,
    t0Open,
    t0High,
    t0Low,
    t0Close,
    t1Close,
    t0BodyRatio: _t0BodyRatio,  // T+0 candle purity: |t0Close−t0Open| / (t0High−t0Low)
    tcBodyRatio: _tcBodyRatio,  // window proxy:      |t1Close−t0Open| / (t0High−t0Low)
    isT1       : true,
    label      : t1Label,   // 'T1' (Tier 2) or 'TC' (Tier 3 cumulative)
    walletId   : 'default',
  });

  if (key === 'LIVE' || key === 'LIVE_MINI') {
    const _t1DurKey = is15m ? '15m' : '5m';
    if (key === 'LIVE') {
      // Lock out new trades until this market cycle ends
      const _mktEnd = cycleStart + (is15m ? 900_000 : 300_000);
      if (_mktEnd > _liveBlockedUntil) _liveBlockedUntil = _mktEnd;
      // Place LIVE first; store promise so LIVE_MINI can chain off it
      const _p = placeLiveOrder(crypto, is15m, t1Dir, position, entryPrice, tradeId, 0, key);
      _p.catch(() => {});
      _liveOrderPromises.set(`t1_${cycleStart}_${crypto}_${_t1DurKey}`, _p);
      if (_liveOrderPromises.size > 200) {
        const oldest = _liveOrderPromises.keys().next().value;
        _liveOrderPromises.delete(oldest);
      }
      // Fan-out T+1 to extra wallets
      const _t1AbsSpike = parseFloat(Math.abs(parseFloat(combinedSpikePct)));
      _fanOutExtraWallets(key, strat, crypto, is15m, t1Dir, entryPrice, maxTrade,
        tradeId, tradeKey, tradeTs, candleSize, cycleStart, cycleMs, t0RefPrice, _t1AbsSpike,
        { open: t0Open }, threshold, riskPct, 0, true /* isT1 */, t1Label);
    } else {
      // LIVE_MINI: wait for LIVE's T+1 order to complete first (priority), then fire
      const _liveP = _liveOrderPromises.get(`t1_${cycleStart}_${crypto}_${_t1DurKey}`);
      const _fireMini = () => placeLiveOrder(crypto, is15m, t1Dir, position, entryPrice, tradeId, 0, key).catch(() => {});
      (_liveP ?? Promise.resolve()).then(_fireMini, _fireMini);
    }
  } else if (key === 'LIVE_KALSHI') {
    placeKalshiOrder(crypto, t1Dir, position, entryPrice, tradeId).catch(() => {});
  }

  if (NTFY_KEYS.has(key)) {
    const dir     = t1Dir === 'UP' ? '🟢 UP ↗ ↗ ↗ ↗' : '🔴 DOWN ↘ ↘ ↘ ↘';
    const period  = is15m ? '15MIN' : '5MIN';
    const timeStr = tradeTs.toISOString().slice(11, 19) + ' UTC';
    const label   = key === 'LIVE'
      ? `LIVE@${is15m ? '15M' : '5M'}`
      : key === 'LIVE_MINI'
        ? `MINI@${is15m ? '15M' : '5M'}`
        : 'KALSHI@15M';
    const mktUrl  = key === 'LIVE_KALSHI' ? null : polyUrl(crypto, cycleStart, candleSize);
    const trioStr  = `C${candleSize}+T1 / ${threshold.toFixed(2)}%`;
    const spikeAbs = Math.abs(parseFloat(combinedSpikePct));
    const msg     = `${tradeId} • ${label} • [${trioStr}] • T1-Spike +${spikeAbs.toFixed(2)}% • Bet $${position.toFixed(2)}`;
    telegramSend(`⚡ <b>T+1 SIGNAL: ${crypto} ${dir}  [${period}]</b>  ${timeStr}\nPrice: ${(entryPrice*100).toFixed(0)}¢  Max: ${(t1MaxPriceEff*100).toFixed(0)}¢\n${msg}${mktUrl ? `\n<a href="${mktUrl}">📊 Trade now</a>` : ''}`);
  }
}

// ── Live order placement ───────────────────────────────────────────────────────

function markTradeFailed(stratKey, tradeId) {
  const s = strategies[stratKey];
  if (!s) return;
  const entry = s.activityLog.find(e => e.tradeId === tradeId && e.status === 'OPEN');
  if (entry) {
    entry.status = 'FAILED';
    // Remove from pendingTrades so cycle end doesn't ghost-resolve it
    if (entry.cycleStart && entry.crypto) {
      const is15m = (entry.candle_size ?? 0) >= 150;
      let pendingKey;
      if (entry.isFokRetry) {
        pendingKey = `${entry.cycleStart}_${entry.crypto}_LIVE_FOKR`;
      } else if (stratKey === 'LIVE') {
        pendingKey = `${entry.cycleStart}_${entry.crypto}_LIVE_${is15m ? '15m' : '5m'}`;
      } else if (stratKey === 'LIVE_KALSHI') {
        pendingKey = `${entry.cycleStart}_${entry.crypto}_LIVE_KALSHI`;
      } else if (stratKey === 'LIVE_MINI') {
        // LIVE_MINI pending key includes duration suffix — must match T+0/T+1 insert key
        pendingKey = `${entry.cycleStart}_${entry.crypto}_LIVE_MINI_${is15m ? '15m' : '5m'}`;
      } else {
        pendingKey = `${entry.cycleStart}_${entry.crypto}_${stratKey}`;
      }
      pendingTrades.delete(pendingKey);
    }
    saveState();
    if (stratKey === 'LIVE' || stratKey === 'LIVE_KALSHI') {
      telegramSend(`❌ <b>ORDER FAILED: ${entry.crypto}</b>\n${entry.tradeId} — CLOB rejected order\n<i>Check EOA USDC.e liquid balance</i>`);
    }
    return;
  }
  // No activityLog entry (e.g. resetBalance fired while order was in-flight).
  // Still purge from pendingTrades so cycle end doesn't ghost-resolve the trade.
  for (const [k, t] of pendingTrades.entries()) {
    if (t.tradeId === tradeId) { pendingTrades.delete(k); break; }
  }
}

// Execute a LIVE trade that was held in the D2 coordination buffer.
// Called by the coordBuffer setTimeout flush when ≥coordMinCryptos cryptos confirmed.
function _executeQueuedLiveTrade({ crypto, candle_size, direction, is15m, durKey,
  absSpike, spike_pct, yes_ask, no_ask,
  threshold, cycleStart, _ctxCandles, ref_price, candle, bodyRatio, detectionDelayMs }) {

  const strat = strategies.LIVE;
  if (!strat || !strat.enabled) return;

  // Respect t0off even through coord-buffer path
  if (strat.t0off) {
    logger.info(`[t1000] LIVE ${crypto} SKIP t0_off (coord flush)`);
    return;
  }

  const entryPrice = direction === 'UP' ? yes_ask : no_ask;
  if (!entryPrice || entryPrice <= 0) {
    logger.info(`[t1000] LIVE ${crypto} SKIP no_liquidity (coord flush)`);
    recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
      null, threshold, 'no_liquidity', null, cycleStart, _ctxCandles);
    return;
  }

  const minPrice = strat[`minPrice${durKey}_${crypto}_${direction}`] ?? strat[`minPrice${durKey}`] ?? strat.minPrice ?? 0;
  const maxPrice = strat[`maxPrice${durKey}_${crypto}_${direction}`] ?? strat[`maxPrice${durKey}_${crypto}`]
    ?? (is15m ? strat.maxPrice15m : strat.maxPrice5m) ?? strat.maxPrice ?? MAX_ENTRY_PRICE;

  if (entryPrice < minPrice) {
    recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
      entryPrice, threshold, 'price_too_low', { entry_c: Math.round(entryPrice*100), min_c: Math.round(minPrice*100) },
      cycleStart, _ctxCandles);
    return;
  }
  if (entryPrice > maxPrice) {
    recordRejected(crypto, candle_size, direction, absSpike, yes_ask, no_ask,
      entryPrice, threshold, 'price_too_high', { entry_c: Math.round(entryPrice*100), max_c: Math.round(maxPrice*100) },
      cycleStart, _ctxCandles);
    return;
  }

  const tradeKey = `${cycleStart}_${crypto}_LIVE_${is15m ? '15m' : '5m'}`;
  if (pendingTrades.has(tradeKey)) {
    logger.info(`[t1000] LIVE ${crypto} SKIP already_pending (coord flush)`);
    return;
  }
  const alreadyOpen = [...pendingTrades.values()].some(t => t.stratKey === 'LIVE' && t.crypto === crypto);
  if (alreadyOpen) {
    logger.info(`[t1000] LIVE ${crypto} SKIP asset_already_open (coord flush)`);
    return;
  }
  if (Date.now() < _liveBlockedUntil) {
    const remSec = Math.ceil((_liveBlockedUntil - Date.now()) / 1000);
    logger.info(`[t1000] LIVE ${crypto} SKIP live_market_in_progress (${remSec}s, coord flush)`);
    return;
  }
  if (strat.circuitBreakerEnabled !== false && (strat.circuitBreakerUntil ?? 0) > Date.now()) {
    const remMins = Math.ceil((strat.circuitBreakerUntil - Date.now()) / 60_000);
    logger.info(`[t1000] LIVE ${crypto} SKIP circuit_breaker (${remMins}min, coord flush)`);
    return;
  }
  const dl = checkDrawdownLimit(strat);
  if (dl.active) {
    const remMins = Math.ceil((dl.pausedUntil - Date.now()) / 60_000);
    logger.info(`[t1000] LIVE ${crypto} SKIP drawdown_limit (${dl.count} losses, ${remMins}min, coord flush)`);
    return;
  }
  if (strat.maxPositions != null) {
    const openCount = strat.activityLog.filter(e => e.status === 'OPEN' && !e.isFokRetry).length;
    if (openCount >= strat.maxPositions) {
      logger.info(`[t1000] LIVE ${crypto} SKIP max_positions (${openCount}/${strat.maxPositions}, coord flush)`);
      return;
    }
  }

  // Position sizing
  const liveMaxTrade = strat[`maxTrade${durKey}_${crypto}`] ?? (is15m ? strat.maxTrade15m : strat.maxTrade5m) ?? strat.maxTrade ?? MAX_TRADE_5M;
  const openLocked = (strat.activityLog || [])
    .filter(e => e.status === 'OPEN' && (e.walletId ?? 'default') === 'default')
    .reduce((sum, e) => sum + (e.position || 0), 0);
  const balanceForSizing = liveRealBalance != null ? liveRealBalance + openLocked : strat.balance;
  const riskPct = strat.riskPct ?? RISK_PCT;
  const position = Math.min(balanceForSizing * riskPct, liveMaxTrade);

  if (position < 1) {
    logger.info(`[t1000] LIVE ${crypto} SKIP below_minimum (pos=$${position.toFixed(2)}, coord flush)`);
    return;
  }

  logger.info(`[t1000] LIVE ${crypto} sizing (coord): liquid=$${(liveRealBalance ?? strat.balance)?.toFixed(2)} + locked=$${openLocked.toFixed(2)} = $${balanceForSizing?.toFixed(2)} × ${(riskPct*100).toFixed(1)}% → position=$${position.toFixed(2)}`);

  const tradeTs  = new Date();
  const cycleMs  = candle_size >= 150 ? 15 * 60 * 1000 : 5 * 60 * 1000;
  const _d       = new Date(cycleStart);
  const hhmm     = _d.toISOString().slice(11, 16).replace(':', '');
  const dateStr  = String(_d.getUTCFullYear()).slice(2)
                 + String(_d.getUTCMonth() + 1).padStart(2, '0')
                 + String(_d.getUTCDate()).padStart(2, '0');
  const tradeId  = `${crypto}_${dateStr}_${hhmm}_LIVE_${is15m ? '15m' : '5m'}`;
  const dbLogKey = `${cycleStart}_${crypto}_${candle_size}`;

  pendingTrades.set(tradeKey, {
    stratKey: 'LIVE', crypto, direction, entryPrice, position,
    refPrice: ref_price, candleSize: candle_size, threshold,
    t0Open: candle.open, absSpike, timestamp: tradeTs,
    cycleStart, cycleMs, dbLogKey, tradeId, walletId: 'default',
  });

  logger.info(`[t1000] LIVE ${crypto} OPEN (coord) direction=${direction} entry=${(entryPrice*100).toFixed(0)}¢ spike=${spike_pct.toFixed(3)}%`);

  if (NTFY_KEYS.has('LIVE')) {
    const dir     = direction === 'UP' ? '🟢 UP ↗ ↗ ↗ ↗' : '🔴 DOWN ↘ ↘ ↘ ↘';
    const period  = is15m ? '15MIN' : '5MIN';
    const timeStr = tradeTs.toISOString().slice(11, 19) + ' UTC';
    const mktUrl  = polyUrl(crypto, cycleStart, candle_size);
    const trioStr = `C${candle_size} / ${threshold.toFixed(2)}%`;
    const msg     = `${tradeId} • LIVE@${is15m ? '15M' : '5M'} • [${trioStr}] • Spike +${absSpike.toFixed(2)}% • Bet $${position.toFixed(2)}`;
    telegramSend(`⚡ <b>SIGNAL: ${crypto} ${dir}  [${period}]</b>  ${timeStr}\nPrice: ${(entryPrice*100).toFixed(0)}¢  Max: ${(maxPrice*100).toFixed(0)}¢\n${msg}\n<a href="${mktUrl}">📊 Trade now</a>`);
  }

  addActivity('LIVE', {
    time: tradeTs, crypto, candle_size, direction,
    spike_pct: absSpike, status: 'OPEN', entryPrice,
    position, tradeId, cycleStart,
    t0Open: candle.open,
    contextCandles: _ctxCandles,
    body_ratio: bodyRatio,
    walletId: 'default',
  });

  // Lock out new trades until this market cycle ends
  const _mktEnd = cycleStart + (is15m ? 900_000 : 300_000);
  if (_mktEnd > _liveBlockedUntil) _liveBlockedUntil = _mktEnd;

  const _orderP = placeLiveOrder(crypto, is15m, direction, position, entryPrice, tradeId, detectionDelayMs, 'LIVE');
  _orderP.catch(() => {});
  _liveOrderPromises.set(`${cycleStart}_${crypto}_${durKey}`, _orderP);
  if (_liveOrderPromises.size > 200) {
    _liveOrderPromises.delete(_liveOrderPromises.keys().next().value);
  }

  _fanOutExtraWallets('LIVE', strat, crypto, is15m, direction, entryPrice, liveMaxTrade,
    tradeId, tradeKey, tradeTs, candle_size, cycleStart, cycleMs, ref_price, absSpike,
    candle, threshold, riskPct, detectionDelayMs);
}

async function placeLiveOrder(crypto, is15m, direction, position, entryPrice, tradeId, detectionDelayMs = 0, stratKey = 'LIVE') {
  const getter = is15m ? _clobSubGetter15m : _clobSubGetter5m;
  if (!getter) {
    logger.warn('[t1000] LIVE order skipped: subscription getter not injected');
    markTradeFailed(stratKey, tradeId);
    return;
  }

  const sub = getter(crypto);
  if (!sub) {
    logger.warn('[t1000] LIVE order skipped: no subscription for', { crypto, is15m });
    markTradeFailed(stratKey, tradeId);
    return;
  }
  const tokenId = direction === 'UP' ? sub.upTokenId : sub.downTokenId;

  if (!tokenId) {
    logger.warn('[t1000] LIVE order skipped: no token ID for', { crypto, direction, is15m });
    markTradeFailed(stratKey, tradeId);
    return;
  }

  // Always use MARKET (FOK) — no conditional limit orders
  const limitPrice = null;
  const orderMode  = 'MARKET(FOK)';

  logger.info(`[t1000] LIVE placing ${orderMode} order`, {
    tradeId, crypto, direction, position: position.toFixed(2),
    entryPrice: (entryPrice * 100).toFixed(0) + '¢',
    balance: liveRealBalance?.toFixed(2),
  });

  const orderSentAt = Date.now();
  const result = await poly.placeOrderByToken(tokenId, position, limitPrice);
  const orderRoundTripMs = Date.now() - orderSentAt;

  const totalLatencyMs = detectionDelayMs + orderRoundTripMs;
  if (result) {
    logger.info(`[t1000] LIVE order placed ⏱ detection+${detectionDelayMs}ms api+${orderRoundTripMs}ms total+${totalLatencyMs}ms`, {
      tradeId, orderId: result.orderId, entryPrice: result.entryPrice, shares: result.shares, orderMode,
    });
    // Update the OPEN activityLog entry with actual fill price and actual USDC cost.
    // result.shares = USDC amount passed as 'size' to the CLOB — this is what left the EOA wallet.
    // It may exceed the initial position budget when the min-order constraint (ceil(1/price)) kicks in.
    const s = strategies[stratKey];
    if (s) {
      const entry = s.activityLog.find(e => e.tradeId === tradeId && e.status === 'OPEN');
      if (entry) {
        // Preserve the WebSocket price at detection time as signalPrice before overwriting entryPrice
        if (entry.signalPrice == null) entry.signalPrice = entryPrice;
        if (result.entryPrice) entry.entryPrice = result.entryPrice;
        if (result.orderLimitPrice) entry.orderLimitPrice = result.orderLimitPrice;
        entry.position    = result.shares; // actual USDC cost — fixes Virtual Total and P&L accuracy
        entry.orderPlaced = true;          // ← confirmed fill: CLOB accepted the order
        if (result.obi != null) entry.obi = result.obi; // order book imbalance at entry time
      }
      // Sync pendingTrades so onCycleEnd uses real fill price and actual position for pnl
      for (const [, t] of pendingTrades) {
        if (t.tradeId === tradeId) {
          if (result.entryPrice) t.entryPrice = result.entryPrice;
          t.position = result.shares; // actual USDC cost
          break;
        }
      }
      saveState();
    }
    refreshLiveBalance(); // EOA just spent USDC on the order — update immediately, don't wait 60s
  } else {
    logger.warn(`[t1000] LIVE order failed ⏱ detection+${detectionDelayMs}ms api+${orderRoundTripMs}ms total+${totalLatencyMs}ms`, {
      tradeId, crypto, direction, orderMode,
    });

    // FOK retry: attempt once more with a fraction of the original position.
    // Only for LIVE (not LIVE_MINI — trades are small $2–$20, retry not worth it).
    const strat2      = strategies[stratKey];
    const isFokRetry  = tradeId.endsWith('_FOKR');
    const origEntry   = strat2?.activityLog.find(e => e.tradeId === tradeId && e.status === 'OPEN');
    const origPending = [...pendingTrades.values()].find(t => t.tradeId === tradeId);
    const fokActive   = isFokRetry ? 0 :
      (strat2?.activityLog.filter(e => e.status === 'OPEN' && e.isFokRetry).length ?? 0);
    // CB / drawdown must not be active — a loss on another crypto between the original
    // FOK and the retry window could have armed a protection after the original was placed.
    const _fokCbActive = strat2?.circuitBreakerEnabled !== false
      && (strat2?.circuitBreakerUntil ?? 0) > Date.now();
    const _fokDlActive = checkDrawdownLimit(strat2 ?? {}).active;
    const canFokRetry = stratKey === 'LIVE'
      && !isFokRetry
      && strat2?.fokRetryEnabled !== false
      && (strat2?.fokRetryDivisor ?? 4) > 0
      && fokActive < (strat2?.fokRetryMax ?? 1)
      && position > 1
      && origEntry?.cycleStart != null
      && !_fokCbActive
      && !_fokDlActive;

    if (canFokRetry) {
      const divisor    = Math.max(1, strat2.fokRetryDivisor ?? 4);
      const retryPos   = Math.max(1, Math.round(position / divisor * 100) / 100);
      const retryId    = `${tradeId}_FOKR`;
      const cycleStart = origEntry.cycleStart;
      const candleSize = origEntry.candle_size;
      const cycleMs    = is15m ? 900_000 : 300_000;
      const retryKey   = `${cycleStart}_${crypto}_LIVE_FOKR`;

      logger.info(`[t1000] LIVE FOK retry: ${tradeId} → ${retryId} pos=$${retryPos.toFixed(2)} (${position.toFixed(2)}÷${divisor})`, { crypto, direction });

      // Mark original as FAILED (removes from pendingTrades)
      markTradeFailed(stratKey, tradeId);

      // Add OPEN entry for retry
      addActivity(stratKey, {
        tradeId    : retryId,
        crypto,
        direction,
        is15m,
        cycleStart,
        status     : 'OPEN',
        time       : new Date().toISOString(),
        entryPrice,
        position   : retryPos,
        candle_size: candleSize,
        spike_pct  : origEntry.spike_pct,
        isFokRetry : true,
      });

      // Add to pendingTrades — isFokRetry=true keeps it out of the maxPositions count
      pendingTrades.set(retryKey, {
        stratKey,
        crypto,
        direction,
        entryPrice,
        position   : retryPos,
        refPrice   : origPending?.refPrice ?? entryPrice,
        candleSize,
        threshold  : origPending?.threshold,
        t0Open     : origPending?.t0Open,
        absSpike   : origPending?.absSpike,
        timestamp  : Date.now(),
        cycleStart,
        cycleMs,
        tradeId    : retryId,
        walletId   : 'default',
        isFokRetry : true,
      });

      saveState();
      // Place retry order — tradeId ends with _FOKR so no further recursion.
      // On unexpected throw (not a FOK kill — those call onOrderFailed), clean up the OPEN entry
      // to prevent a phantom trade blocking maxPositions until the next orphan scan.
      placeLiveOrder(crypto, is15m, direction, retryPos, entryPrice, retryId, detectionDelayMs, stratKey)
        .catch((err) => {
          logger.warn(`[t1000] FOK retry threw unexpectedly — marking FAILED`, { error: err?.message, tradeId: retryId });
          markTradeFailed(stratKey, retryId);
        });
    } else {
      markTradeFailed(stratKey, tradeId);
    }
  }
}

// ── Extra-wallet order placement ───────────────────────────────────────────────

/**
 * Place a LIVE order for a non-default wallet.
 * Identical logic to placeLiveOrder() but uses wallet.client.placeOrderByToken()
 * instead of the global poly singleton. No FOK retry (extra wallets are secondary).
 */
async function placeLiveOrderForWallet(wallet, crypto, is15m, direction, position, entryPrice, tradeId, detectionDelayMs = 0, stratKey = 'LIVE') {
  const getter = is15m ? _clobSubGetter15m : _clobSubGetter5m;
  if (!getter) {
    logger.warn(`[t1000] LIVE wallet=${wallet.id} order skipped: subscription getter not injected`);
    markTradeFailed(stratKey, tradeId);
    return;
  }
  const sub = getter(crypto);
  if (!sub) {
    logger.warn(`[t1000] LIVE wallet=${wallet.id} order skipped: no subscription`, { crypto, is15m });
    markTradeFailed(stratKey, tradeId);
    return;
  }
  const tokenId = direction === 'UP' ? sub.upTokenId : sub.downTokenId;
  if (!tokenId) {
    logger.warn(`[t1000] LIVE wallet=${wallet.id} order skipped: no tokenId`, { crypto, direction });
    markTradeFailed(stratKey, tradeId);
    return;
  }

  logger.info(`[t1000] LIVE wallet=${wallet.id} placing FOK order`, {
    tradeId, crypto, direction, position: position.toFixed(2),
    entryPrice: (entryPrice * 100).toFixed(0) + '¢',
    balance: walletBalances.get(wallet.id)?.toFixed(2),
  });

  const orderSentAt      = Date.now();
  const result           = await wallet.client.placeOrderByToken(tokenId, position, null);
  const orderRoundTripMs = Date.now() - orderSentAt;
  const totalLatencyMs   = detectionDelayMs + orderRoundTripMs;

  if (result) {
    logger.info(`[t1000] LIVE wallet=${wallet.id} order placed ⏱ ${totalLatencyMs}ms`, {
      tradeId, orderId: result.orderId, entryPrice: result.entryPrice,
    });
    const s = strategies[stratKey];
    if (s) {
      const entry = s.activityLog.find(e => e.tradeId === tradeId && e.status === 'OPEN');
      if (entry) {
        if (entry.signalPrice == null) entry.signalPrice = entryPrice;
        if (result.entryPrice)     entry.entryPrice     = result.entryPrice;
        if (result.orderLimitPrice) entry.orderLimitPrice = result.orderLimitPrice;
        entry.position    = result.shares;
        entry.orderPlaced = true;
      }
      for (const [, t] of pendingTrades) {
        if (t.tradeId === tradeId) {
          if (result.entryPrice) t.entryPrice = result.entryPrice;
          t.position = result.shares;
          break;
        }
      }
      saveState();
    }
    // Refresh this wallet's balance immediately
    try {
      const b = await wallet.client.getBalance();
      if (b?.liquid != null) walletBalances.set(wallet.id, b.liquid);
    } catch (_) {}
  } else {
    logger.warn(`[t1000] LIVE wallet=${wallet.id} order failed ⏱ ${totalLatencyMs}ms`, { tradeId });
    markTradeFailed(stratKey, tradeId);
  }
}

/**
 * Fan-out a trade signal to extra wallets (non-default).
 * Called after the default wallet's order has been dispatched.
 * Each extra wallet has independent CB, DL, and position sizing.
 *
 * @param {boolean} isT1 - true when called from the T+1 handler
 * @param {string}  t1Label - 'T1' or 'TC' (only relevant for T+1)
 */
function _fanOutExtraWallets(stratKey, strat, crypto, is15m, direction, entryPrice, maxTradeVal,
    baseTradeId, baseTradeKey, tradeTs, candleSize, cycleStart, cycleMs,
    refPrice, absSpike, candleRef, threshold, riskPct, detectionDelayMs,
    isT1 = false, t1Label = null) {
  const extraWallets = walletManager.getExtraWallets();
  if (!extraWallets.length) return;

  const liveRiskPctForMini = strategies.LIVE?.riskPct ?? RISK_PCT;

  for (const w of extraWallets) {
    // Per-wallet circuit breaker
    if (cbActiveForWallet(strat, w.id)) {
      logger.info(`[t1000] ${stratKey} ${crypto} wallet=${w.id} SKIP CB`);
      continue;
    }
    // Per-wallet drawdown limit
    if (strat.drawdownLimitEnabled !== false) {
      const wDl = checkDrawdownLimit(strat, w.id);
      if (wDl.active) {
        logger.info(`[t1000] ${stratKey} ${crypto} wallet=${w.id} SKIP DL`);
        continue;
      }
    }
    // One position per asset: skip if this wallet already has a pending/open trade for this crypto
    const alreadyOpenForWallet = [...pendingTrades.values()].some(
      t => t.stratKey === stratKey && t.crypto === crypto && (t.walletId ?? 'default') === w.id
    );
    if (alreadyOpenForWallet) {
      logger.info(`[t1000] ${stratKey} ${crypto} wallet=${w.id} SKIP asset_already_open`);
      continue;
    }

    // Per-wallet position sizing
    const wBal    = walletBalances.get(w.id) ?? 0;
    const wLocked = (strat.activityLog || [])
      .filter(e => e.status === 'OPEN' && e.walletId === w.id)
      .reduce((sum, e) => sum + (e.position || 0), 0);
    const wBalForSizing = wBal + wLocked;
    let wPos;
    if (stratKey === 'LIVE_MINI') {
      const wLivePos = Math.min(wBalForSizing * liveRiskPctForMini, maxTradeVal);
      wPos = Math.max(wLivePos / (strat.riskDivisor ?? 3), 1);
    } else {
      wPos = Math.min(wBalForSizing * riskPct, maxTradeVal);
    }
    if (wPos < 1) {
      logger.info(`[t1000] ${stratKey} ${crypto} wallet=${w.id} SKIP below_minimum wPos=$${wPos.toFixed(2)}`);
      continue;
    }

    const wTradeId  = `${baseTradeId}_${w.id}`;
    const wTradeKey = `${baseTradeKey}_${w.id}`;

    pendingTrades.set(wTradeKey, {
      stratKey,
      crypto,
      direction,
      entryPrice,
      position   : wPos,
      refPrice,
      candleSize,
      threshold,
      t0Open     : candleRef.open,
      absSpike,
      timestamp  : tradeTs,
      cycleStart,
      cycleMs,
      tradeId    : wTradeId,
      walletId   : w.id,
      isT1,
    });

    addActivity(stratKey, {
      time       : tradeTs,
      crypto,
      candle_size: candleSize,
      direction,
      spike_pct  : absSpike,
      status     : 'OPEN',
      entryPrice,
      position   : wPos,
      tradeId    : wTradeId,
      cycleStart,
      t0Open     : candleRef.open,
      walletId   : w.id,
      ...(isT1 ? { isT1: true, label: t1Label } : {}),
    });

    logger.info(`[t1000] ${stratKey} ${crypto} wallet=${w.id} OPEN${isT1 ? ' T+1' : ''} direction=${direction} entry=${(entryPrice*100).toFixed(0)}¢ pos=$${wPos.toFixed(2)}`);
    placeLiveOrderForWallet(w, crypto, is15m, direction, wPos, entryPrice, wTradeId, detectionDelayMs, stratKey).catch(() => {});
  }
}

// ── Kalshi order placement ─────────────────────────────────────────────────────

async function placeKalshiOrder(crypto, direction, position, entryPrice, tradeId) {
  if (!kalshiWebsocket) { markTradeFailed('LIVE_KALSHI', tradeId); return; }
  const ticker = kalshiWebsocket.getActiveTicker(crypto);
  if (!ticker) {
    logger.warn('[t1000] LIVE_KALSHI: no ticker for', { crypto });
    markTradeFailed('LIVE_KALSHI', tradeId);
    return;
  }
  const side       = direction === 'UP' ? 'yes' : 'no';
  const priceCents = Math.round(entryPrice * 100);
  const result = await kalshiTrader.placeOrder(ticker, side, position, priceCents);
  if (result) {
    logger.info('[t1000] LIVE_KALSHI order placed', { tradeId, ...result });
    // Persist OPEN entry and actual fill price so it survives a restart
    const s = strategies['LIVE_KALSHI'];
    if (s && result.entryPrice) {
      const entry = s.activityLog.find(e => e.tradeId === tradeId && e.status === 'OPEN');
      if (entry) { entry.entryPrice = result.entryPrice; entry.orderPlaced = true; saveState(); }
    }
  } else {
    logger.warn('[t1000] LIVE_KALSHI order failed', { tradeId, crypto });
    markTradeFailed('LIVE_KALSHI', tradeId);
  }
}

// ── RECOVER: early exit on counter-spike reversion ────────────────────────────

async function checkRecover(tradeKey, toneN) {
  const trade = pendingTrades.get(tradeKey);
  if (!trade || trade.stratKey !== 'LIVE') return;

  const strat = strategies['LIVE'];
  if (!strat || strat.recoverEnabled === false) return;

  if (!_currentCloseGetter) {
    logger.warn('[t1000] RECOVER: currentCloseGetter not injected — skipping');
    return;
  }
  const currentClose = _currentCloseGetter(trade.crypto);
  if (currentClose == null) {
    logger.info(`[t1000] RECOVER T+${toneN} ${trade.crypto}: no close data — skipping`);
    return;
  }

  const t0Open = trade.t0Open;
  if (t0Open == null) {
    logger.warn(`[t1000] RECOVER T+${toneN} ${trade.crypto}: no t0Open in trade record`);
    return;
  }

  // Reversion condition: price closed back past the T+0 open
  const reverts = trade.direction === 'UP'
    ? currentClose <= t0Open   // reverted below where the UP spike began
    : currentClose >= t0Open;  // reverted above where the DOWN spike began

  logger.info(`[t1000] RECOVER T+${toneN} ${trade.crypto}: close=${currentClose.toFixed(4)} t0Open=${t0Open.toFixed(4)} dir=${trade.direction} reverts=${reverts}`);
  if (!reverts) return;

  // Re-check the trade is still OPEN (race condition: cycle end may have fired)
  if (!pendingTrades.has(tradeKey)) return;

  // Resolve the token ID for the exit sell order
  const is15m  = trade.candleSize >= 150;
  const getter  = is15m ? _clobSubGetter15m : _clobSubGetter5m;
  const sub     = getter?.(trade.crypto);
  const tokenId = trade.direction === 'UP' ? sub?.upTokenId : sub?.downTokenId;

  if (!tokenId) {
    logger.warn(`[t1000] RECOVER ${trade.tradeId}: no tokenId — leaving trade to cycle-end resolution`);
    return;
  }

  logger.info(`[t1000] RECOVER ${trade.tradeId}: TONE at T+${toneN} — placing exit order`);

  // Use current trade values (may have been updated by placeLiveOrder's fill callback)
  const tradeSnap = pendingTrades.get(tradeKey);
  const pos   = tradeSnap?.position   ?? trade.position;
  const entry = tradeSnap?.entryPrice ?? trade.entryPrice;

  const exitResult = await poly.exitPosition(
    null, trade.direction === 'UP' ? 'YES' : 'NO', tokenId, pos, entry
  );

  // Re-check after async exit order (race condition)
  if (!pendingTrades.has(tradeKey)) {
    logger.warn(`[t1000] RECOVER ${trade.tradeId}: trade resolved while exit order was in flight`);
    return;
  }

  if (!exitResult) {
    logger.warn(`[t1000] RECOVER ${trade.tradeId}: exitPosition failed — leaving to cycle-end resolution`);
    return;
  }

  // Remove from pendingTrades — cycle end must not double-resolve
  pendingTrades.delete(tradeKey);

  // PNL: tokens_held = pos / entry; proceeds = tokens_held × exitPrice
  const exitPrice = exitResult.price;
  const pnl = pos * (exitPrice / entry - 1);

  strat.balance = parseFloat((strat.balance + pnl).toFixed(6));
  if (pnl >= 0) strat.wins++; else strat.losses++;

  updateActivityEntry('LIVE', trade.crypto, trade.candleSize, trade.timestamp, {
    status   : 'RECOV',
    pnl,
    recoverN : toneN,
    exitPrice,
  });

  const dir    = trade.direction === 'UP' ? '↗' : '↘';
  const pnlStr = (pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`);
  telegramSend(`↩ <b>RECOVER T+${toneN}: ${trade.crypto} ${dir}</b>\n${trade.tradeId} • Entry ${(entry*100).toFixed(0)}¢ → Exit ${(exitPrice*100).toFixed(0)}¢ • PnL ${pnlStr}`);
  logger.info(`[t1000] RECOVER ${trade.tradeId}: resolved pnl=${pnlStr} exitPrice=${(exitPrice*100).toFixed(0)}¢`);

  refreshLiveBalance();
  saveState();
}

// ── Manual sell (user-initiated exit via UI) ───────────────────────────────────

async function sellLivePosition(tradeId) {
  let tradeKey = null;
  for (const [k, t] of pendingTrades) {
    if (t.tradeId === tradeId && t.stratKey === 'LIVE') { tradeKey = k; break; }
  }
  if (!tradeKey) return { error: 'Trade not found or not LIVE' };

  const trade  = pendingTrades.get(tradeKey);
  const is15m  = trade.candleSize >= 150;
  const getter = is15m ? _clobSubGetter15m : _clobSubGetter5m;
  const sub    = getter?.(trade.crypto);
  const tokenId = trade.direction === 'UP' ? sub?.upTokenId : sub?.downTokenId;
  if (!tokenId) return { error: `No tokenId for ${trade.crypto} ${is15m ? '15m' : '5m'}` };

  logger.info(`[t1000] MANUAL SELL ${trade.tradeId}: user-initiated`);
  const pos   = trade.position;
  const entry = trade.entryPrice;

  const exitResult = await poly.exitPosition(
    null, trade.direction === 'UP' ? 'YES' : 'NO', tokenId, pos, entry
  );

  if (!pendingTrades.has(tradeKey)) {
    logger.warn(`[t1000] MANUAL SELL ${trade.tradeId}: trade resolved while exit was in flight`);
    return { error: 'Trade resolved during exit' };
  }
  if (!exitResult) {
    logger.warn(`[t1000] MANUAL SELL ${trade.tradeId}: exitPosition failed`);
    return { error: 'exitPosition failed' };
  }

  pendingTrades.delete(tradeKey);

  const exitPrice = exitResult.price;
  const pnl = pos * (exitPrice / entry - 1);

  const strat = strategies['LIVE'];
  strat.balance = parseFloat((strat.balance + pnl).toFixed(6));
  if (pnl >= 0) strat.wins++; else strat.losses++;

  updateActivityEntry('LIVE', trade.crypto, trade.candleSize, trade.timestamp, {
    status    : 'RECOV',
    pnl,
    recoverN  : null,
    exitPrice,
    manualSell: true,
  });

  const dir    = trade.direction === 'UP' ? '↗' : '↘';
  const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
  telegramSend(`🤚 <b>MANUAL SELL: ${trade.crypto} ${dir}</b>\n${trade.tradeId} • Entry ${(entry*100).toFixed(0)}¢ → Exit ${(exitPrice*100).toFixed(0)}¢ • PnL ${pnlStr}`);
  logger.info(`[t1000] MANUAL SELL ${trade.tradeId}: done pnl=${pnlStr} exitPrice=${(exitPrice*100).toFixed(0)}¢`);

  refreshLiveBalance();
  saveState();
  return { ok: true, pnl, exitPrice };
}

// ── Cycle end resolution ───────────────────────────────────────────────────────

function onCycleEnd(cycleStart, finalPrices, cycleMs = 5 * 60 * 1000) {
  let anyResolved = false;
  const dur = cycleMs === 900000 ? '15m' : '5m';

  const matching = [...pendingTrades.entries()].filter(
    ([, t]) => t.cycleStart === cycleStart && (t.cycleMs || 300000) === cycleMs
  );
  if (matching.length > 0) {
    logger.info(`[t1000] onCycleEnd ${dur} cycle=${new Date(cycleStart).toISOString().slice(11,16)} resolving ${matching.length} trade(s) finalPrices=${JSON.stringify(finalPrices)}`);
  }

  for (const [tradeKey, trade] of pendingTrades.entries()) {
    if (trade.cycleStart !== cycleStart) continue;
    if ((trade.cycleMs || 5 * 60 * 1000) !== cycleMs) continue; // don't mix 5-min and 15-min

    const finalPrice = finalPrices[trade.crypto];
    if (finalPrice == null || trade.refPrice == null) {
      // Binance was disconnected at cycle boundary — can't resolve via price comparison.
      // Remove from pendingTrades; activityLog entry stays OPEN.
      // recoverStuckOpenTrades() will resolve via PM oracle (runs every 5 min and on reconnect).
      logger.warn(`[t1000] onCycleEnd: Binance price unavailable for ${tradeKey} — leaving OPEN for PM oracle recovery (finalPrice=${finalPrice} refPrice=${trade.refPrice})`);
      pendingTrades.delete(tradeKey);
      if (trade.stratKey === 'LIVE' || trade.stratKey === 'LIVE_KALSHI') {
        // Fetch missing outcomes from Gamma API then resolve — don't wait for 5-min timer
        setTimeout(async () => { await fetchMissingOutcomes(); recoverStuckOpenTrades(); }, 2000);
      }
      continue;
    }

    // For LIVE trades use Polymarket oracle (pm_outcomes) when available.
    // Binance prices can disagree with Polymarket's Chainlink oracle, causing wrong WIN/LOSS.
    // Fall back to Binance price comparison only when pm_outcomes not yet populated.
    let isWin;
    if (trade.stratKey === 'LIVE' || trade.stratKey === 'LIVE_KALSHI' || trade.stratKey === 'LIVE_MINI') {
      const pmOutcome = pmOutcomeForTrade(trade, cycleMs);
      if (pmOutcome !== null) {
        isWin = trade.direction === pmOutcome;
        logger.info(`[t1000] ${trade.stratKey} ${trade.crypto} resolved via pm_outcomes: ${pmOutcome} → ${isWin ? 'WIN' : 'LOSS'}`);
      } else {
        const isUp = finalPrice > trade.refPrice;
        isWin = (trade.direction === 'UP' && isUp) || (trade.direction === 'DOWN' && !isUp);
        logger.warn(`[t1000] ${trade.stratKey} ${trade.crypto} pm_outcomes not ready — falling back to Binance price (finalPrice=${finalPrice} refPrice=${trade.refPrice})`);
      }
    } else {
      const isUp = finalPrice > trade.refPrice;
      isWin = (trade.direction === 'UP' && isUp) || (trade.direction === 'DOWN' && !isUp);
    }

    const strat = strategies[trade.stratKey];
    if (!strat) { pendingTrades.delete(tradeKey); continue; }

    let pnl;
    if (isWin) {
      // LIVE/LIVE_MINI Polymarket: defer pnl — set to null now, real usdcReceived filled in on redemption.
      // Paper / LIVE_KALSHI: use estimate immediately (no on-chain redemption step).
      pnl = (trade.stratKey === 'LIVE' || trade.stratKey === 'LIVE_MINI')
        ? null
        : trade.position * (1 - trade.entryPrice) / trade.entryPrice;
      strat.wins++;
    } else {
      pnl = -trade.position;
      strat.losses++;
      // Circuit breaker: arm cooling-off after any non-FOK LIVE/LIVE_KALSHI loss.
      // Start the cooling-off from the market CLOSE time (cycle boundary), not Date.now(),
      // so the first eligible cycle is exactly cbMins after the resolved market's end.
      // e.g. loss in 16:15–16:30 cycle + 45 min CB → resume at 17:15 cycle start.
      if (!trade.isFokRetry && (trade.stratKey === 'LIVE' || trade.stratKey === 'LIVE_KALSHI' || trade.stratKey === 'LIVE_MINI')
          && strat.circuitBreakerEnabled !== false) {
        const mins        = strat.circuitBreakerMins ?? 90;
        const durMs       = (trade.candleSize >= 150) ? 900_000 : 300_000;
        const marketClose = trade.cycleStart + durMs; // exact 15m or 5m boundary
        const _cbWalletId = trade.walletId ?? 'default';
        if (!strat.walletCbUntil) strat.walletCbUntil = {};
        strat.walletCbUntil[_cbWalletId] = Math.max(strat.walletCbUntil[_cbWalletId] ?? 0, marketClose + mins * 60_000);
        // Backwards compat: circuitBreakerUntil mirrors the default wallet's CB
        if (_cbWalletId === 'default') strat.circuitBreakerUntil = strat.walletCbUntil['default'];
        logger.warn(`[t1000] Circuit breaker armed: ${trade.stratKey} wallet=${_cbWalletId} paused ${mins}min from ${new Date(marketClose).toISOString()} → until ${new Date(strat.walletCbUntil[_cbWalletId]).toISOString()} (loss: ${trade.tradeId})`);
        // Synchronous CB backup: protects against crash between CB arm and async saveState.
        // On startup the CB file is merged (taking max) into the loaded state.
        try {
          const cbSnapshot = {};
          for (const [sk, s] of Object.entries(strategies)) {
            if (s.walletCbUntil && Object.keys(s.walletCbUntil).length > 0) {
              cbSnapshot[sk] = { ...s.walletCbUntil };
            }
          }
          fs.writeFileSync(CB_FILE, JSON.stringify(cbSnapshot));
        } catch (_cbErr) {
          logger.warn('[t1000] Failed to write CB backup', { error: _cbErr.message });
        }
      }
    }

    // Balance: skip for LIVE/LIVE_MINI WIN — updated with real pnl on redemption.
    // LIVE/LIVE_KALSHI/LIVE_MINI are pure PnL trackers — allow negative; paper caps at 0 (can't bet with nothing)
    if ((trade.stratKey === 'LIVE' || trade.stratKey === 'LIVE_MINI') && isWin) {
      // deferred — do nothing until redemption
    } else if (trade.stratKey === 'LIVE' || trade.stratKey === 'LIVE_KALSHI' || trade.stratKey === 'LIVE_MINI') {
      strat.balance = parseFloat((strat.balance + pnl).toFixed(6));
    } else {
      strat.balance = Math.max(0, strat.balance + pnl);
    }
    anyResolved   = true;

    logger.info(`[t1000] ${trade.stratKey} ${trade.crypto} RESOLVED ${isWin ? 'WIN' : 'LOSS'} pnl=${pnl != null ? pnl.toFixed(2) : 'pending'} bal=${strat.balance.toFixed(2)}`);

    if (trade.stratKey === 'LIVE' || trade.stratKey === 'LIVE_MINI') {
      const sign    = isWin ? '✅' : '❌';
      // pnl is null for LIVE/LIVE_MINI WIN (deferred until redemption) — show pending; always a number for LOSS
      const pnlStr  = pnl != null ? (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toFixed(2) : 'pending redemption';
      const dir     = trade.direction === 'UP' ? '↗' : '↘';
      const trioStr = trade.threshold != null ? ` [C${trade.candleSize} / ${trade.threshold.toFixed(2)}%]` : ` [C${trade.candleSize}]`;
      const pos     = typeof trade.position === 'number' ? trade.position.toFixed(2) : '?';
      const tag     = trade.stratKey === 'LIVE_MINI' ? '[MINI] ' : '';
      telegramSend(`${sign} <b>${isWin ? 'WIN' : 'LOSS'}: ${trade.crypto} ${dir}${trioStr}</b>\n${tag}${trade.tradeId} • Bet $${pos} • PnL ${pnlStr}`);

      // Queue redemption — handled by the shared polling loop (pendingRedemptions).
      // Each wallet uses its own redeemWinningPosition (via its own signer/EOA).
      // Default wallet → poly singleton. Extra wallets → createWalletClient().redeemWinningPosition.
      if (isWin) {
        const { candleSize, direction: dir2 } = trade;
        const is15m = candleSize >= 150;
        const _wid = trade.walletId ?? 'default';
        const _winWallet = _wid !== 'default' ? walletManager.getWallets().find(w => w.id === _wid) : null;
        if (_wid === 'default' || _winWallet?.client?.redeemWinningPosition) {
          logger.info(`[t1000] ${trade.stratKey} WIN wallet=${_wid} — queued for auto-redemption in 60s`, { tradeId: trade.tradeId });
          pendingRedemptions.set(trade.tradeId, {
            trade, is15m, dir: dir2, attempts: 0,
            redeemAfter: Date.now() + 60_000, // first attempt after 60s
          });
        } else {
          logger.warn(`[t1000] ${trade.stratKey} WIN wallet=${_wid} — no redeemWinningPosition on wallet client, skipping`, { tradeId: trade.tradeId });
        }
      }
    }
    if (trade.stratKey === 'LIVE_KALSHI') {
      const sign    = isWin ? '✅' : '❌';
      const pnlStr  = pnl != null ? (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toFixed(2) : 'pending';
      const dir     = trade.direction === 'UP' ? '↗' : '↘';
      const trioStr = trade.threshold != null ? ` [C${trade.candleSize} / ${trade.threshold.toFixed(2)}%]` : ` [C${trade.candleSize}]`;
      const pos     = typeof trade.position === 'number' ? trade.position.toFixed(2) : '?';
      telegramSend(`${sign} <b>${isWin ? 'WIN' : 'LOSS'}: ${trade.crypto} ${dir}${trioStr}</b>\n[KALSHI] ${trade.tradeId} • Bet $${pos} • PnL ${pnlStr}`);
    }

    const logUpdated = updateActivityEntry(
      trade.stratKey, trade.crypto, trade.candleSize, trade.timestamp,
      {
        status     : isWin ? 'WIN' : 'LOSS',
        pnl,
        finalPrice,
        refPrice   : trade.refPrice,
      },
      trade.tradeId
    );
    // Fallback: activityLog was cleared (e.g. resetBalance) while trade was in-flight.
    // No OPEN entry to update — create a new resolved entry so counters and log stay in sync.
    if (!logUpdated) {
      addActivity(trade.stratKey, {
        time       : trade.timestamp,
        crypto     : trade.crypto,
        candle_size: trade.candleSize,
        direction  : trade.direction,
        spike_pct  : 0,
        status     : isWin ? 'WIN' : 'LOSS',
        entryPrice : trade.entryPrice,
        position   : trade.position,
        tradeId    : trade.tradeId,
        cycleStart : trade.cycleStart,
        pnl,
        finalPrice,
        refPrice   : trade.refPrice,
      });
    }

    // Resolve DB row (async)
    if (trade.dbLogKey) {
      const rowId = dbRowIds.get(trade.dbLogKey);
      if (rowId) {
        const pnlPct = trade.refPrice
          ? (isWin
              ? (1 - trade.entryPrice) / trade.entryPrice * 100
              : -100)
          : null;
        dbResolveRow(rowId, finalPrice, isWin ? 'WIN' : 'LOSS', pnlPct, pnl);
        dbRowIds.delete(trade.dbLogKey);
      }
    }

    pendingTrades.delete(tradeKey);
  }

  // Also update resolution_price for SKIP rows from this cycle
  // so KIMI's dataset always has resolution_price filled in
  for (const [logKey, rowId] of dbRowIds.entries()) {
    const [cs, crypto] = logKey.split('_');
    if (parseInt(cs) === cycleStart) {
      const fp = finalPrices[crypto];
      if (fp) {
        query(
          'UPDATE spike_t1_validation SET resolution_price = $1 WHERE id = $2 AND resolution_price IS NULL',
          [fp, rowId]
        ).catch(() => {});
      }
      dbRowIds.delete(logKey);
    }
  }

  // ── Orphan recovery: LIVE/LIVE_KALSHI activityLog OPEN entries for this cycle
  // whose pendingTrades entry was wiped by an API restart mid-cycle.
  // These were skipped by loadState() recovery (cycle hadn't ended yet at restart).
  for (const orphanKey of ['LIVE', 'LIVE_KALSHI', 'LIVE_MINI']) {
    const strat = strategies[orphanKey];
    if (!strat) continue;
    for (const entry of strat.activityLog) {
      if (entry.status !== 'OPEN') continue;
      if (entry.cycleStart !== cycleStart) continue;
      const entryCycleMs = (entry.candle_size ?? 0) >= 150 ? 900_000 : 300_000;
      if (entryCycleMs !== cycleMs) continue;
      // This OPEN entry belongs to the now-ending cycle but is not in pendingTrades
      // For LIVE/LIVE_MINI/LIVE_KALSHI orphans: use pm_outcomes oracle first (avoids Binance vs Chainlink mismatch)
      let outcome = (orphanKey === 'LIVE' || orphanKey === 'LIVE_KALSHI' || orphanKey === 'LIVE_MINI')
        ? pmOutcomeForTrade({ crypto: entry.crypto, cycleStart: entry.cycleStart }, cycleMs)
        : null;
      // fp declared outside if-block so it's in scope for entry.finalPrice below
      const fp = finalPrices[entry.crypto] ?? null;
      if (outcome === null) {
        // Fall back to Binance finalPrice comparison
        if (fp == null || entry.refPrice == null) {
          // No PM outcome yet, or missing reference price — leave OPEN; recoverStuckOpenTrades() will retry
          logger.warn(`[t1000] onCycleEnd: restart-orphan ${entry.tradeId} — no pm_outcomes and Binance unavailable (fp=${fp} refPrice=${entry.refPrice}), fetching from Gamma`);
          setTimeout(async () => { await fetchMissingOutcomes(); recoverStuckOpenTrades(); }, 2000);
          continue;
        }
        outcome = fp > entry.refPrice ? 'UP' : 'DOWN';
      }
      const isWin    = entry.direction === outcome;
      const lossPnl  = -(entry.position ?? 0);
      const winPnl   = (orphanKey === 'LIVE' || orphanKey === 'LIVE_MINI') ? null : entry.position * (1 - entry.entryPrice) / entry.entryPrice;
      entry.status   = isWin ? 'WIN' : 'LOSS';
      entry.pnl      = isWin ? winPnl : parseFloat(lossPnl.toFixed(6));
      entry.finalPrice = fp;
      logger.warn(`[t1000] onCycleEnd: recovered restart-orphan ${entry.tradeId} → ${entry.status} (outcome=${outcome} fp=${fp != null ? fp.toFixed(3) : 'n/a'})`);
      if (isWin) {
        strat.wins++;
        if ((orphanKey === 'LIVE' || orphanKey === 'LIVE_MINI') && !pendingRedemptions.has(entry.tradeId)) {
          pendingRedemptions.set(entry.tradeId, {
            trade: { crypto: entry.crypto, cycleStart: entry.cycleStart,
                     position: entry.position, candleSize: entry.candle_size,
                     direction: entry.direction, tradeId: entry.tradeId, stratKey: orphanKey },
            is15m: cycleMs === 900_000, dir: entry.direction, attempts: 0,
            redeemAfter: Date.now() + 60_000,
          });
        }
      } else {
        strat.losses++;
        strat.balance = parseFloat((strat.balance + lossPnl).toFixed(6));
      }
      anyResolved = true;
    }
  }

  // Clean up stale pending trades (use each trade's own cycle length)
  for (const [k, t] of pendingTrades.entries()) {
    const cm = t.cycleMs || CYCLE_MS;
    if (t.cycleStart < cycleStart - cm * 2) pendingTrades.delete(k);
  }

  if (anyResolved) {
    saveState();
    recordPnlEvent(liveRealBalance ?? 0); // chart point after every resolved LIVE/paper trade
  }
  maybeAutoWithdraw();
}

// ── Public API ─────────────────────────────────────────────────────────────────

function start() {
  loadState();
  logger.info('[t1000] Engine started');
}

function getState() {
  const result = {};
  for (const [key, s] of Object.entries(strategies)) {
    const total = s.wins + s.losses;
    result[key] = {
      enabled      : s.enabled,
      threshold    : s.threshold,
      minPrice     : s.minPrice     ?? 0,
      maxPrice     : s.maxPrice     ?? MAX_ENTRY_PRICE,
      maxTrade     : s.maxTrade     ?? MAX_TRADE_5M,
      startBalance : parseFloat((s.startBalance ?? ((s.maxTrade ?? MAX_TRADE_5M) / RISK_PCT)).toFixed(2)),
      strategy     : s.strategy     ?? null, // LIVE only
      score        : s.score         ?? null,
      threshold_BTC: s.threshold_BTC ?? null,
      threshold_ETH: s.threshold_ETH ?? null,
      threshold_SOL: s.threshold_SOL ?? null,
      threshold_XRP: s.threshold_XRP ?? null,
      ...(key === 'LIVE' ? {
        strategy5m   : s.strategy5m,   threshold5m  : s.threshold5m,
        minPrice5m   : s.minPrice5m,   maxPrice5m   : s.maxPrice5m,   maxTrade5m   : s.maxTrade5m,
        maxPriceT1_5m  : s.maxPriceT1_5m  ?? 0.97,
        strategy15m  : s.strategy15m,  threshold15m : s.threshold15m,
        minPrice15m  : s.minPrice15m,  maxPrice15m  : s.maxPrice15m,  maxTrade15m  : s.maxTrade15m,
        maxPriceT1_15m      : s.maxPriceT1_15m      ?? 0.97,
        minPriceT1          : s.minPriceT1          ?? 0.85,
        maxPriceT1standalone: s.maxPriceT1standalone ?? 0.89,
        riskPct             : s.riskPct ?? RISK_PCT,
        realBalance         : liveRealBalance,
        eoaAddress          : poly.getEoaAddress(),
        pendingRedemptions  : pendingRedemptions.size,
        wallets             : walletManager.getWallets().map(w => {
          const log = s.activityLog ?? [];
          const wid = w.id;
          // Apply tradeListClearedAt cutoff so W/L/PnL reset in sync with the main strategy counters
          const cutoff = s.tradeListClearedAt || null;
          const statLog = cutoff ? log.filter(e => !e.time || e.time >= cutoff) : log;
          const wWins   = statLog.filter(e => (e.walletId ?? 'default') === wid && e.status === 'WIN').length;
          const wLosses = statLog.filter(e => (e.walletId ?? 'default') === wid && e.status === 'LOSS').length;
          const wPnl    = statLog.filter(e => (e.walletId ?? 'default') === wid && e.pnl != null)
                             .reduce((sum, e) => sum + e.pnl, 0);
          const lastEntry = log.find(e => (e.walletId ?? 'default') === wid);
          const cbUntil = wid === 'default'
            ? (s.circuitBreakerUntil ?? null)
            : ((s.walletCbUntil ?? {})[wid] ?? null);
          const wLocked = log
            .filter(e => e.status === 'OPEN' && (e.walletId ?? 'default') === wid)
            .reduce((sum, e) => sum + (e.position || 0), 0);
          const wRedeemable = log
            .filter(e => e.status === 'WIN' && !e.redeemed && (e.walletId ?? 'default') === wid)
            .reduce((sum, e) => sum + (e.position > 0 && e.entryPrice > 0 ? e.position / e.entryPrice : 0), 0);
          const wRedeemQ = [...pendingRedemptions.values()]
            .filter(r => (r.trade?.walletId ?? 'default') === wid).length;
          return {
            id        : wid,
            label     : w.label,
            balance   : walletBalances.get(wid) ?? null,
            cbActive  : cbActiveForWallet(s, wid),
            cbUntil,
            wins      : wWins,
            losses    : wLosses,
            pnl       : parseFloat(wPnl.toFixed(4)),
            locked    : parseFloat(wLocked.toFixed(2)),
            redeemable: parseFloat(wRedeemable.toFixed(2)),
            redeemQ   : wRedeemQ,
            lastTrade : lastEntry?.time ?? null,
          };
        }),
        baseEoaBalance      : s.baseEoaBalance ?? 31.39,
        baseEoaSetAt        : s.baseEoaSetAt   ?? null,
        resetAt             : s.resetAt        ?? null,
        eoaPnlHistory       : s.eoaPnlHistory  ?? [],
        lastTrackedEoa      : s.lastTrackedEoa  ?? null,
        threshold5m_BTC : s.threshold5m_BTC  ?? null,
        threshold5m_ETH : s.threshold5m_ETH  ?? null,
        threshold5m_SOL : s.threshold5m_SOL  ?? null,
        threshold5m_XRP : s.threshold5m_XRP  ?? null,
        threshold15m_BTC: s.threshold15m_BTC ?? null,
        threshold15m_ETH: s.threshold15m_ETH ?? null,
        threshold15m_SOL: s.threshold15m_SOL ?? null,
        threshold15m_XRP: s.threshold15m_XRP ?? null,
        strategy5m_BTC : s.strategy5m_BTC  ?? null,
        strategy5m_ETH : s.strategy5m_ETH  ?? null,
        strategy5m_SOL : s.strategy5m_SOL  ?? null,
        strategy5m_XRP : s.strategy5m_XRP  ?? null,
        strategy15m_BTC: s.strategy15m_BTC ?? null,
        strategy15m_ETH: s.strategy15m_ETH ?? null,
        strategy15m_SOL: s.strategy15m_SOL ?? null,
        strategy15m_XRP: s.strategy15m_XRP ?? null,
        maxTrade5m_BTC : s.maxTrade5m_BTC  ?? null,
        maxTrade5m_ETH : s.maxTrade5m_ETH  ?? null,
        maxTrade5m_SOL : s.maxTrade5m_SOL  ?? null,
        maxTrade5m_XRP : s.maxTrade5m_XRP  ?? null,
        maxTrade15m_BTC: s.maxTrade15m_BTC ?? null,
        maxTrade15m_ETH: s.maxTrade15m_ETH ?? null,
        maxTrade15m_SOL: s.maxTrade15m_SOL ?? null,
        maxTrade15m_XRP: s.maxTrade15m_XRP ?? null,
        distMin5m           : s.distMin5m    ?? 0,
        distMin15m          : s.distMin15m   ?? 0,
        maxPositions        : s.maxPositions  ?? 1,
        recoverEnabled      : s.recoverEnabled === true,  // default false
        t1Mode              : s.t1Mode       ?? false,
        t1standalone        : s.t1standalone ?? false,
        t0off               : s.t0off        ?? false,
        fokRetryEnabled     : s.fokRetryEnabled !== false,
        fokRetryDivisor     : s.fokRetryDivisor ?? 4,
        fokRetryMax         : s.fokRetryMax     ?? 0,
        circuitBreakerEnabled : s.circuitBreakerEnabled !== false,
        circuitBreakerMins    : s.circuitBreakerMins ?? 90,
        circuitBreakerUntil   : s.circuitBreakerUntil ?? null,
        drawdownLimitEnabled     : s.drawdownLimitEnabled !== false,
        drawdownLimitMaxLosses   : s.drawdownLimitMaxLosses   ?? 2,
        drawdownLimitWindowMins  : s.drawdownLimitWindowMins  ?? 90,
        drawdownLimitPauseMins   : s.drawdownLimitPauseMins   ?? 90,
        drawdownPausedUntil      : (() => { const dl = checkDrawdownLimit(s); return dl.active ? dl.pausedUntil : null; })(),
        drawdownRecentLosses     : checkDrawdownLimit(s).count,
        coordMinCryptos : s.coordMinCryptos  ?? 0,
        directionFilter : s.directionFilter ?? null,
        skipHours       : s.skipHours       ?? [],
        skipDow         : s.skipDow         ?? [],
        bodyPct         : s.bodyPct         ?? 76,
        noSpikeFilter   : s.noSpikeFilter   ?? false,
        allowLowVol     : s.allowLowVol     ?? true,
        allowPriceOor   : s.allowPriceOor   ?? false,
        rejTradeReasons : s.rejTradeReasons ?? [],
        lockedThresholds: s.lockedThresholds ?? {},
        settingsHistory : s.settingsHistory  ?? [],
        // Full resolved-trade history for the P&L chart (all entries in activityLog, not the 50-entry slice)
        pnlHistory          : (() => {
          const cutoff = s.tradeListClearedAt || null;
          return s.activityLog
            .filter(e => (e.status === 'WIN' || e.status === 'LOSS') && e.pnl != null && e.time
                         && (!cutoff || e.time >= cutoff))
            .sort((a, b) => new Date(a.time) - new Date(b.time))
            .map(e => ({ time: e.time, pnl: e.pnl, crypto: e.crypto,
                         direction: e.direction, status: e.status, candle_size: e.candle_size }));
        })(),
        fokStats            : (() => {
          const cutoffFok = s.tradeListClearedAt ? new Date(s.tradeListClearedAt) : null;
          const fl      = s.activityLog.filter(e => e.isFokRetry && (!cutoffFok || !e.time || new Date(e.time) >= cutoffFok));
          const wins    = fl.filter(e => e.status === 'WIN').length;
          const losses  = fl.filter(e => e.status === 'LOSS').length;
          const failed  = fl.filter(e => e.status === 'FAILED').length;
          const open    = fl.filter(e => e.status === 'OPEN').length;
          const filled  = wins + losses;
          const pnl     = parseFloat(fl.reduce((sum, e) => sum + (e.pnl ?? 0), 0).toFixed(2));
          const wr      = filled > 0 ? parseFloat((wins / filled * 100).toFixed(1)) : null;
          return { total: wins + losses + failed + open, filled, wins, losses, failed, open, pnl, wr };
        })(),
        tradeListClearedAt  : s.tradeListClearedAt ?? null,
        rejStats: {
          t0: _rejStats.t0, t1: _rejStats.t1, tc: _rejStats.tc,
          total: _rejStats.t0 + _rejStats.t1 + _rejStats.tc,
          byReason: { ..._rejByReason },
        },
        liveCurrentClose: {
          BTC: _currentCloseGetter?.('BTC') ?? null,
          ETH: _currentCloseGetter?.('ETH') ?? null,
          SOL: _currentCloseGetter?.('SOL') ?? null,
          XRP: _currentCloseGetter?.('XRP') ?? null,
        },
        liveCycleRef: _cycleRefGetter?.() ?? null,
      } : {}),
      ...(key === 'LIVE_KALSHI' ? {
        strategy15m     : s.strategy15m,
        threshold15m    : s.threshold15m,
        minPrice15m     : s.minPrice15m,
        maxPrice15m     : s.maxPrice15m,
        maxTrade15m     : s.maxTrade15m,
        kalshiBalance   : kalshiRealBalance,
        threshold15m_BTC: s.threshold15m_BTC ?? null,
        threshold15m_ETH: s.threshold15m_ETH ?? null,
        threshold15m_SOL: s.threshold15m_SOL ?? null,
        threshold15m_XRP: s.threshold15m_XRP ?? null,
        strategy15m_BTC: s.strategy15m_BTC ?? null,
        strategy15m_ETH: s.strategy15m_ETH ?? null,
        strategy15m_SOL: s.strategy15m_SOL ?? null,
        strategy15m_XRP: s.strategy15m_XRP ?? null,
      } : {}),
      ...(key === 'LIVE_MINI' ? {
        strategy5m      : s.strategy5m      ?? 'C85',
        threshold5m     : s.threshold5m     ?? 0.28,
        strategy15m     : s.strategy15m     ?? null,
        threshold15m    : s.threshold15m    ?? 0.22,
        maxPrice5m      : s.maxPrice5m      ?? 0.97,
        maxPrice15m     : s.maxPrice15m     ?? 0.97,
        maxPriceT1_5m   : s.maxPriceT1_5m   ?? 0.97,
        maxPriceT1_15m  : s.maxPriceT1_15m  ?? 0.97,
        minPrice5m      : s.minPrice5m      ?? 0.05,
        minPrice15m     : s.minPrice15m     ?? 0.05,
        maxTrade5m      : s.maxTrade5m      ?? 20,
        maxTrade15m     : s.maxTrade15m     ?? 20,
        t1Mode          : s.t1Mode          ?? true,
        maxPositions    : s.maxPositions    ?? 2,
        bodyPct         : s.bodyPct         ?? 76,
        distMin5m       : s.distMin5m       ?? 0,
        distMin15m      : s.distMin15m      ?? 0,
        allowLowVol     : s.allowLowVol     ?? true,
        allowPriceOor   : s.allowPriceOor   ?? false,
        circuitBreakerEnabled : s.circuitBreakerEnabled !== false,
        circuitBreakerMins    : s.circuitBreakerMins ?? 90,
        circuitBreakerUntil   : s.circuitBreakerUntil ?? null,
        drawdownLimitEnabled     : s.drawdownLimitEnabled === true,
        drawdownLimitMaxLosses   : s.drawdownLimitMaxLosses  ?? 2,
        drawdownLimitWindowMins  : s.drawdownLimitWindowMins ?? 120,
        drawdownLimitPauseMins   : s.drawdownLimitPauseMins  ?? 120,
        threshold5m_BTC : s.threshold5m_BTC  ?? null,
        threshold5m_ETH : s.threshold5m_ETH  ?? null,
        threshold5m_SOL : s.threshold5m_SOL  ?? null,
        threshold5m_XRP : s.threshold5m_XRP  ?? null,
        threshold15m_BTC: s.threshold15m_BTC ?? null,
        threshold15m_ETH: s.threshold15m_ETH ?? null,
        threshold15m_SOL: s.threshold15m_SOL ?? null,
        threshold15m_XRP: s.threshold15m_XRP ?? null,
        strategy5m_BTC  : s.strategy5m_BTC   ?? null,
        strategy5m_ETH  : s.strategy5m_ETH   ?? null,
        strategy5m_SOL  : s.strategy5m_SOL   ?? null,
        strategy5m_XRP  : s.strategy5m_XRP   ?? null,
        strategy15m_BTC : s.strategy15m_BTC  ?? null,
        strategy15m_ETH : s.strategy15m_ETH  ?? null,
        strategy15m_SOL : s.strategy15m_SOL  ?? null,
        strategy15m_XRP : s.strategy15m_XRP  ?? null,
        riskDivisor     : s.riskDivisor ?? 3,
        realBalance     : liveRealBalance,   // shares LIVE's wallet
        pnlHistory      : (() => {
          const cutoff = s.tradeListClearedAt || null;
          return s.activityLog
            .filter(e => (e.status === 'WIN' || e.status === 'LOSS') && e.pnl != null && e.time
                         && (!cutoff || e.time >= cutoff))
            .sort((a, b) => new Date(a.time) - new Date(b.time))
            .map(e => ({ time: e.time, pnl: e.pnl, crypto: e.crypto,
                         direction: e.direction, status: e.status, candle_size: e.candle_size }));
        })(),
        tradeListClearedAt : s.tradeListClearedAt ?? null,
      } : {}),
      balance      : parseFloat(s.balance.toFixed(2)),
      wins        : s.wins,
      losses      : s.losses,
      failed      : s.activityLog.filter(e =>
        e.status === 'FAILED' && !e.isFokRetry &&
        (!s.tradeListClearedAt || e.time >= s.tradeListClearedAt)
      ).length,
      winRate     : total > 0 ? parseFloat((s.wins / total * 100).toFixed(1)) : null,
      activityLog : s.activityLog.slice(0, 150),
      pending     : [...pendingTrades.values()].filter(t => t.stratKey === key).length,
    };
  }
  return result;
}

/**
 * Update strategy config.
 * @param {string} stratKey  'C40' | 'C50' | 'C60' | 'LIVE'
 * @param {Object} changes   { enabled?, threshold?, strategy? }
 */
function updateConfig(stratKey, changes) {
  const strat = strategies[stratKey];
  if (!strat) return false;

  if (changes.enabled   !== undefined) strat.enabled   = Boolean(changes.enabled);
  if (changes.threshold !== undefined) strat.threshold = parseFloat(changes.threshold);
  if (changes.minPrice  !== undefined) strat.minPrice  = Math.min(0.99, Math.max(0, parseFloat(changes.minPrice)));
  if (changes.maxPrice  !== undefined) strat.maxPrice  = Math.min(0.99, Math.max(0.01, parseFloat(changes.maxPrice)));
  if (changes.maxTrade  !== undefined) strat.maxTrade  = Math.max(1, parseFloat(changes.maxTrade));
  if (changes.strategy  !== undefined && stratKey === 'LIVE') strat.strategy = changes.strategy;
  if (changes.t1Mode    !== undefined) strat.t1Mode    = Boolean(changes.t1Mode);
  if (changes.t0off     !== undefined) strat.t0off     = Boolean(changes.t0off);

  if (stratKey === 'LIVE') {
    // Snapshot current settings before applying (only on explicit full saves)
    if (changes.saveHistory === true) {
      const snap = {
        savedAt          : new Date().toISOString(),
        strategy5m       : strat.strategy5m       ?? null,
        strategy15m      : strat.strategy15m      ?? null,
        threshold5m      : strat.threshold5m      ?? null,
        threshold15m     : strat.threshold15m     ?? null,
        minPrice5m       : strat.minPrice5m       ?? 0.05,
        maxPrice5m       : strat.maxPrice5m       ?? 0.89,
        maxTrade5m       : strat.maxTrade5m       ?? 150,
        minPrice15m      : strat.minPrice15m      ?? 0.05,
        maxPrice15m      : strat.maxPrice15m      ?? 0.89,
        maxTrade15m      : strat.maxTrade15m      ?? 500,
        maxPriceT1_5m       : strat.maxPriceT1_5m       ?? 0.97,
        maxPriceT1_15m      : strat.maxPriceT1_15m      ?? 0.97,
        maxPriceT1standalone: strat.maxPriceT1standalone ?? 0.89,
        t1Mode               : strat.t1Mode       ?? false,
        t1standalone         : strat.t1standalone ?? false,
        t0off                : strat.t0off        ?? false,
        circuitBreakerEnabled: strat.circuitBreakerEnabled !== false,
        circuitBreakerMins   : strat.circuitBreakerMins ?? 90,
        drawdownLimitEnabled    : strat.drawdownLimitEnabled !== false,
        drawdownLimitMaxLosses  : strat.drawdownLimitMaxLosses  ?? 2,
        drawdownLimitWindowMins : strat.drawdownLimitWindowMins ?? 90,
        drawdownLimitPauseMins  : strat.drawdownLimitPauseMins  ?? 90,
        maxPositions     : strat.maxPositions  ?? 1,
        distMin5m        : strat.distMin5m     ?? 0,
        distMin15m       : strat.distMin15m    ?? 0,
        riskPct          : strat.riskPct       ?? RISK_PCT,
        lockedThresholds : strat.lockedThresholds ?? {},
        threshold5m_BTC  : strat.threshold5m_BTC  ?? null,
        threshold5m_ETH  : strat.threshold5m_ETH  ?? null,
        threshold5m_SOL  : strat.threshold5m_SOL  ?? null,
        threshold5m_XRP  : strat.threshold5m_XRP  ?? null,
        threshold15m_BTC : strat.threshold15m_BTC ?? null,
        threshold15m_ETH : strat.threshold15m_ETH ?? null,
        threshold15m_SOL : strat.threshold15m_SOL ?? null,
        threshold15m_XRP : strat.threshold15m_XRP ?? null,
        strategy5m_BTC   : strat.strategy5m_BTC   ?? null,
        strategy5m_ETH   : strat.strategy5m_ETH   ?? null,
        strategy5m_SOL   : strat.strategy5m_SOL   ?? null,
        strategy5m_XRP   : strat.strategy5m_XRP   ?? null,
        strategy15m_BTC  : strat.strategy15m_BTC  ?? null,
        strategy15m_ETH  : strat.strategy15m_ETH  ?? null,
        strategy15m_SOL  : strat.strategy15m_SOL  ?? null,
        strategy15m_XRP  : strat.strategy15m_XRP  ?? null,
        maxTrade5m_BTC   : strat.maxTrade5m_BTC   ?? null,
        maxTrade5m_ETH   : strat.maxTrade5m_ETH   ?? null,
        maxTrade5m_SOL   : strat.maxTrade5m_SOL   ?? null,
        maxTrade5m_XRP   : strat.maxTrade5m_XRP   ?? null,
        maxTrade15m_BTC  : strat.maxTrade15m_BTC  ?? null,
        maxTrade15m_ETH  : strat.maxTrade15m_ETH  ?? null,
        maxTrade15m_SOL  : strat.maxTrade15m_SOL  ?? null,
        maxTrade15m_XRP  : strat.maxTrade15m_XRP  ?? null,
        bodyPct          : strat.bodyPct          ?? 76,
        noSpikeFilter    : strat.noSpikeFilter     ?? false,
      };
      if (!strat.settingsHistory) strat.settingsHistory = [];
      strat.settingsHistory.unshift(snap);
      if (strat.settingsHistory.length > 20) strat.settingsHistory.length = 20;
    }

    // Hardcode non-configurable signal-quality values on every save
    strat.volMin = 0; strat.volMin_BTC = 1.0; strat.volMin_ETH = 0;
    strat.volMin_SOL = 1.0; strat.volMin_XRP = 0;
    strat.exhaustThresh5m = 0; strat.exhaustThresh15m = 0;
    const liveFields = ['strategy5m','strategy15m','threshold5m','minPrice5m','maxPrice5m','maxTrade5m',
                        'threshold15m','minPrice15m','maxPrice15m','maxTrade15m','riskPct',
                        'maxPriceT1_5m','maxPriceT1_15m','minPriceT1','maxPriceT1standalone',
                        'maxTrade5m_BTC','maxTrade5m_ETH','maxTrade5m_SOL','maxTrade5m_XRP',
                        'maxTrade15m_BTC','maxTrade15m_ETH','maxTrade15m_SOL','maxTrade15m_XRP',
                        'coordMinCryptos','maxPositions','drawdownLimitMaxLosses','drawdownLimitWindowMins','drawdownLimitPauseMins',
                        'distMin5m','distMin15m','bodyPct'];
    for (const f of liveFields) {
      if (changes[f] !== undefined) {
        strat[f] = f.startsWith('strategy') ? changes[f] : parseFloat(changes[f]);
      }
    }
    if (changes.baseEoaBalance !== undefined) {
      const newBase = parseFloat(changes.baseEoaBalance);
      if (Math.abs(newBase - (strat.baseEoaBalance ?? 0)) >= 0.01) {  // ignore sub-cent rounding from UI toFixed(2)
        strat.baseEoaBalance   = newBase;
        strat.baseEoaSetAt     = new Date().toISOString();
        strat.eoaPnlHistory    = [];       // history was relative to old base — reset PnL chart only
        strat.lastTrackedEoa   = liveRealBalance;  // restart tracking from current EOA
        // NOTE: do NOT reset winsAtReset/lossesAtReset/pnlBaseline here.
        // W/L display counters are anchored to tradeListClearedAt (via clearTradeList / resetBalance),
        // which is independent of the EOA reference point.
        logger.info('[t1000] baseEoaBalance changed — eoaPnlHistory reset', { newBase, lastTrackedEoa: liveRealBalance });
      }
    }
    if (changes.directionFilter !== undefined) strat.directionFilter = changes.directionFilter || null;
    if (changes.skipHours       !== undefined) strat.skipHours       = Array.isArray(changes.skipHours) ? changes.skipHours.map(Number).filter(n => !isNaN(n)) : [];
    if (changes.skipDow         !== undefined) strat.skipDow         = Array.isArray(changes.skipDow)   ? changes.skipDow.map(Number).filter(n => !isNaN(n))   : [];
    if (changes.lockedThresholds !== undefined) strat.lockedThresholds = changes.lockedThresholds;
    if (changes.recoverEnabled  !== undefined) strat.recoverEnabled  = Boolean(changes.recoverEnabled);
    if (changes.t1Mode          !== undefined) strat.t1Mode          = Boolean(changes.t1Mode);
    if (changes.t1standalone    !== undefined) strat.t1standalone    = Boolean(changes.t1standalone);
    if (changes.fokRetryEnabled !== undefined) strat.fokRetryEnabled = Boolean(changes.fokRetryEnabled);
    if (changes.fokRetryDivisor !== undefined) strat.fokRetryDivisor = Math.max(1, parseInt(changes.fokRetryDivisor) || 4);
    if (changes.fokRetryMax     !== undefined) strat.fokRetryMax     = Math.min(5, Math.max(0, parseInt(changes.fokRetryMax) || 2));
    if (changes.circuitBreakerEnabled !== undefined) strat.circuitBreakerEnabled = Boolean(changes.circuitBreakerEnabled);
    if (changes.circuitBreakerMins    !== undefined) strat.circuitBreakerMins    = Math.max(1, parseInt(changes.circuitBreakerMins) || 90);
    if (changes.circuitBreakerUntil   !== undefined) strat.circuitBreakerUntil   = changes.circuitBreakerUntil === null ? null : Number(changes.circuitBreakerUntil);
    if (changes.drawdownLimitEnabled  !== undefined) strat.drawdownLimitEnabled  = Boolean(changes.drawdownLimitEnabled);
    if (changes.noSpikeFilter         !== undefined) strat.noSpikeFilter         = Boolean(changes.noSpikeFilter);
    if (changes.allowLowVol           !== undefined) strat.allowLowVol           = Boolean(changes.allowLowVol);
    if (changes.allowPriceOor         !== undefined) strat.allowPriceOor         = Boolean(changes.allowPriceOor);
    if (changes.rejTradeReasons       !== undefined) strat.rejTradeReasons       = Array.isArray(changes.rejTradeReasons) ? changes.rejTradeReasons : [];
    if (changes.deleteHistoryIndex    !== undefined) {
      const idx = parseInt(changes.deleteHistoryIndex);
      if (!isNaN(idx) && strat.settingsHistory && idx >= 0 && idx < strat.settingsHistory.length)
        strat.settingsHistory.splice(idx, 1);
    }
    if (changes.resetAt               !== undefined) strat.resetAt               = changes.resetAt;
    // Clearing the trade list: re-anchor win/loss/balance baselines to the new cutoff timestamp.
    // This keeps the counters in sync with what renderTrades() shows.
    if (changes.tradeListClearedAt !== undefined) {
      const ts = changes.tradeListClearedAt;
      strat.tradeListClearedAt = ts;
      const cutoff = ts ? new Date(ts) : null;
      const pre = cutoff
        ? strat.activityLog.filter(e => e.time && new Date(e.time) < cutoff)
        : strat.activityLog;
      strat.winsAtReset   = pre.filter(e => e.status === 'WIN').length;
      strat.lossesAtReset = pre.filter(e => e.status === 'LOSS').length;
      strat.pnlBaseline   = parseFloat(pre.reduce((a, e) => a + (e.pnl ?? 0), 0).toFixed(6));
      const totalWins  = strat.activityLog.filter(e => e.status === 'WIN').length;
      const totalLoss  = strat.activityLog.filter(e => e.status === 'LOSS').length;
      const totalPnl   = parseFloat(strat.activityLog.reduce((a, e) => { const p = e.pnl ?? 0; return a + (isFinite(p) ? p : 0); }, 0).toFixed(6));
      strat.wins    = Math.max(0, totalWins - strat.winsAtReset);
      strat.losses  = Math.max(0, totalLoss - strat.lossesAtReset);
      strat.balance = parseFloat((totalPnl - strat.pnlBaseline).toFixed(6));
      if (stratKey === 'LIVE') {
        _rejStats.t0 = 0; _rejStats.t1 = 0; _rejStats.tc = 0;
        Object.keys(_rejByReason).forEach(k => delete _rejByReason[k]);
      }
      logger.info('[t1000] tradeListClearedAt set — stat baselines re-anchored', { ts, wins: strat.wins, losses: strat.losses });
    }
  }

  if (stratKey === 'LIVE_KALSHI') {
    const kalshiFields = ['strategy15m','threshold15m','minPrice15m','maxPrice15m','maxTrade15m',
                          'maxTrade15m_BTC','maxTrade15m_ETH','maxTrade15m_SOL','maxTrade15m_XRP'];
    for (const f of kalshiFields) {
      if (changes[f] !== undefined)
        strat[f] = f === 'strategy15m' ? changes[f] : parseFloat(changes[f]);
    }
  }

  if (stratKey === 'LIVE_MINI') {
    const miniFields = ['maxPrice5m','maxPrice15m','maxPriceT1_5m','maxPriceT1_15m',
                        'minPrice5m','minPrice15m','maxTrade5m','maxTrade15m',
                        'bodyPct','distMin5m','distMin15m'];
    for (const f of miniFields) {
      if (changes[f] !== undefined) strat[f] = parseFloat(changes[f]);
    }
    if (changes.strategy5m   !== undefined) strat.strategy5m   = changes.strategy5m   || null;
    if (changes.threshold5m  !== undefined) strat.threshold5m  = changes.threshold5m  === null ? null : parseFloat(changes.threshold5m);
    if (changes.strategy15m  !== undefined) strat.strategy15m  = changes.strategy15m  || null;
    if (changes.threshold15m !== undefined) strat.threshold15m = changes.threshold15m === null ? null : parseFloat(changes.threshold15m);
    if (changes.riskDivisor  !== undefined) strat.riskDivisor  = Math.max(1, parseInt(changes.riskDivisor) || 3);
    if (changes.t1Mode              !== undefined) strat.t1Mode              = Boolean(changes.t1Mode);
    if (changes.allowLowVol         !== undefined) strat.allowLowVol         = Boolean(changes.allowLowVol);
    if (changes.allowPriceOor       !== undefined) strat.allowPriceOor       = Boolean(changes.allowPriceOor);
    if (changes.circuitBreakerEnabled !== undefined) strat.circuitBreakerEnabled = Boolean(changes.circuitBreakerEnabled);
    if (changes.circuitBreakerMins    !== undefined) strat.circuitBreakerMins    = Math.max(1, parseInt(changes.circuitBreakerMins) || 90);
    if (changes.circuitBreakerUntil   !== undefined) strat.circuitBreakerUntil   = changes.circuitBreakerUntil === null ? null : Number(changes.circuitBreakerUntil);
    if (changes.drawdownLimitEnabled      !== undefined) strat.drawdownLimitEnabled      = Boolean(changes.drawdownLimitEnabled);
    if (changes.drawdownLimitMaxLosses    !== undefined) strat.drawdownLimitMaxLosses    = Math.max(1, parseInt(changes.drawdownLimitMaxLosses) || 2);
    if (changes.drawdownLimitWindowMins   !== undefined) strat.drawdownLimitWindowMins   = Math.max(1, parseInt(changes.drawdownLimitWindowMins) || 120);
    if (changes.drawdownLimitPauseMins    !== undefined) strat.drawdownLimitPauseMins    = Math.max(1, parseInt(changes.drawdownLimitPauseMins) || 120);
    // Per-crypto strategy + threshold (same as LIVE)
    const CRYPTO_LIST_MINI = ['BTC', 'ETH', 'SOL', 'XRP'];
    for (const cr of CRYPTO_LIST_MINI) {
      for (const dur of ['5m', '15m']) {
        const sf = `strategy${dur}_${cr}`;
        if (changes[sf] !== undefined) strat[sf] = changes[sf] === null ? null : String(changes[sf]);
        const tf = `threshold${dur}_${cr}`;
        if (changes[tf] !== undefined) strat[tf] = changes[tf] === null ? null : parseFloat(changes[tf]);
      }
    }
    if (changes.tradeListClearedAt !== undefined) {
      const ts = changes.tradeListClearedAt;
      strat.tradeListClearedAt = ts;
      const cutoff = ts ? new Date(ts) : null;
      const pre = cutoff
        ? strat.activityLog.filter(e => e.time && new Date(e.time) < cutoff)
        : strat.activityLog;
      strat.winsAtReset   = pre.filter(e => e.status === 'WIN').length;
      strat.lossesAtReset = pre.filter(e => e.status === 'LOSS').length;
      strat.pnlBaseline   = parseFloat(pre.reduce((a, e) => a + (e.pnl ?? 0), 0).toFixed(6));
      const totalWins  = strat.activityLog.filter(e => e.status === 'WIN').length;
      const totalLoss  = strat.activityLog.filter(e => e.status === 'LOSS').length;
      const totalPnl   = parseFloat(strat.activityLog.reduce((a, e) => { const p = e.pnl ?? 0; return a + (isFinite(p) ? p : 0); }, 0).toFixed(6));
      strat.wins    = Math.max(0, totalWins - strat.winsAtReset);
      strat.losses  = Math.max(0, totalLoss - strat.lossesAtReset);
      strat.balance = parseFloat((totalPnl - strat.pnlBaseline).toFixed(6));
    }
  }

  const CRYPTO_LIST = ['BTC', 'ETH', 'SOL', 'XRP'];
  for (const cr of CRYPTO_LIST) {
    const f = `threshold_${cr}`;
    if (changes[f] !== undefined) strat[f] = changes[f] === null ? null : parseFloat(changes[f]);
    const mf = `maxTrade_${cr}`;
    if (changes[mf] !== undefined) strat[mf] = changes[mf] === null ? null : parseFloat(changes[mf]);
    if (stratKey === 'LIVE') {
      for (const dur of ['5m', '15m']) {
        const df = `threshold${dur}_${cr}`;
        if (changes[df] !== undefined) strat[df] = changes[df] === null ? null : parseFloat(changes[df]);
        const sf = `strategy${dur}_${cr}`;
        if (changes[sf] !== undefined) strat[sf] = changes[sf] === null ? null : String(changes[sf]);
        // Per-crypto price caps (autoscan trio sweep may find different mx per crypto)
        const mxf = `maxPrice${dur}_${cr}`;
        if (changes[mxf] !== undefined) strat[mxf] = changes[mxf] === null ? null : Math.min(0.99, Math.max(0.01, parseFloat(changes[mxf])));
        const mnf = `minPrice${dur}_${cr}`;
        if (changes[mnf] !== undefined) strat[mnf] = changes[mnf] === null ? null : Math.min(0.99, Math.max(0, parseFloat(changes[mnf])));
      }
    }
    if (stratKey === 'LIVE_KALSHI') {
      const df = `threshold15m_${cr}`;
      if (changes[df] !== undefined) strat[df] = changes[df] === null ? null : parseFloat(changes[df]);
      const sf = `strategy15m_${cr}`;
      if (changes[sf] !== undefined) strat[sf] = changes[sf] === null ? null : String(changes[sf]);
    }
  }

  if (stratKey === 'LIVE' || stratKey === 'LIVE_KALSHI' || stratKey === 'LIVE_MINI') rebuildNtfyKeys();
  logger.info('[t1000] Config updated', { stratKey, changes });
  saveState();
  return true;
}

/**
 * Reset balance and stats for a strategy.
 */
function resetBalance(stratKey) {
  const strat = strategies[stratKey];
  if (!strat) return false;
  strat.balance       = strat.startBalance ?? ((strat.maxTrade ?? MAX_TRADE_5M) / RISK_PCT);
  strat.wins          = 0;
  strat.losses        = 0;
  strat.activityLog   = [];
  // Zero baselines so the resync formula (logCount - baseline) gives 0 on fresh start
  strat.winsAtReset   = 0;
  strat.lossesAtReset = 0;
  strat.pnlBaseline   = 0;
  if (stratKey === 'LIVE') {
    // Clear EOA PnL history; reset tracker to current wallet value so next change creates a fresh event
    strat.eoaPnlHistory  = [];
    strat.lastTrackedEoa = liveRealBalance; // start tracking from now
    strat.baseEoaSetAt   = new Date().toISOString();
    logger.info('[t1000] EOA PnL history cleared', { currentEoa: liveRealBalance });
  }
  logger.info('[t1000] Balance reset', { stratKey, balance: strat.balance });
  saveState();
  return true;
}

/**
 * Apply outcome corrections from the hourly verify_outcomes cron.
 * Called via POST /t1000/verify-outcomes.
 *
 * Each correction: { tradeId, correctStatus, redeemed, position, ... }
 * Returns { fixed, corrections }
 */
function applyOutcomeCorrections(corrections) {
  const strat = strategies['LIVE'];
  if (!strat || !Array.isArray(strat.activityLog)) return { fixed: 0, corrections: [] };

  const applied = [];
  for (const c of corrections) {
    const entry = strat.activityLog.find(e => e.tradeId === c.tradeId);
    if (!entry) {
      logger.warn('[t1000] verify-outcomes: tradeId not found', { tradeId: c.tradeId });
      continue;
    }
    if (entry.status === c.correctStatus) continue;  // already correct

    const prev = entry.status;
    entry.status = c.correctStatus;

    if (c.correctStatus === 'WIN') {
      // LOSS → WIN
      if (!c.redeemed) {
        // Not yet redeemed — queue for redemption; pnl will be set when redemption completes
        entry.pnl = null;
        if (!pendingRedemptions.has(entry.tradeId)) {
          const cycleMs = (entry.candle_size ?? 0) >= 150 ? 900_000 : 300_000;
          pendingRedemptions.set(entry.tradeId, {
            trade      : { crypto: entry.crypto, cycleStart: entry.cycleStart,
                           position: entry.position, candleSize: entry.candle_size,
                           direction: entry.direction, tradeId: entry.tradeId, stratKey: 'LIVE' },
            is15m      : cycleMs === 900_000,
            dir        : entry.direction,
            attempts   : 0,
            redeemAfter: Date.now() + 5_000,
          });
          logger.info('[t1000] verify-outcomes: queued redemption for corrected WIN', { tradeId: c.tradeId });
        }
      } else {
        // Already redeemed but wrongly recorded (e.g. balance-delta race bug).
        // USDC already in wallet — set pnl null so balance resync ignores it
        // (better than keeping the wrong negative pnl from the old LOSS record).
        entry.pnl = null;
      }
    } else {
      // WIN → LOSS
      pendingRedemptions.delete(entry.tradeId);  // cancel any pending redemption
      entry.pnl = parseFloat((-(entry.position ?? 0)).toFixed(6));
    }

    logger.info('[t1000] verify-outcomes: corrected', { tradeId: c.tradeId, prev, now: c.correctStatus });
    applied.push(c.tradeId);
  }

  if (!applied.length) return { fixed: 0, corrections: [] };

  // Resync balance / wins / losses from activityLog (same logic as loadState resync)
  const _pnlBase2 = strat.pnlBaseline   || 0;
  const _wBase2   = strat.winsAtReset   || 0;
  const _lBase2   = strat.lossesAtReset || 0;
  const logSum  = strat.activityLog.reduce((acc, e) => {
    const p = e.pnl ?? 0;
    return acc + (isFinite(p) ? p : 0);
  }, 0);
  strat.balance = parseFloat((logSum - _pnlBase2).toFixed(6));
  strat.wins    = Math.max(0, strat.activityLog.filter(e => e.status === 'WIN').length  - _wBase2);
  strat.losses  = Math.max(0, strat.activityLog.filter(e => e.status === 'LOSS').length - _lBase2);

  saveState();
  logger.info('[t1000] verify-outcomes: applied corrections', { count: applied.length, tradeIds: applied });

  return { fixed: applied.length, corrections: applied };
}

module.exports = { start, onCandle, onCycleEnd, getState, updateConfig, resetBalance, setSubscriptionGetters, setCurrentCloseGetter, setCycleRefGetter, setKalshiWebsocket, loadState, recoverStuckOpenTrades, fetchMissingOutcomes, applyOutcomeCorrections, sellLivePosition };
