/**
 * Polymarket CLOB WebSocket Client
 *
 * Connects to Polymarket WebSocket to receive real-time orderbook updates
 * for all 4 cryptos (BTC, ETH, SOL, XRP) - both UP and DOWN tokens.
 *
 * Features:
 * - Real-time best bid/ask updates (no polling!)
 * - Automatic reconnection with exponential backoff
 * - PING/PONG heartbeat every 10 seconds
 * - Updates price cache for instant access by trading engine
 *
 * Export: createClobWebsocket(durationMin) factory for any market duration.
 * Default 5-min singleton is also exported for backward compatibility.
 */

'use strict';

const WebSocket = require('ws');
const logger = require('../utils/logger');
const gamma = require('./gamma-api');

/**
 * Factory — creates an independent CLOB WebSocket tracker for a given market
 * duration (5 for 5-min markets, 15 for 15-min markets, etc.).
 * All state is encapsulated in the closure; multiple instances can run in
 * parallel without interfering with each other.
 */
function createClobWebsocket(durationMin, labelSuffix = '') {
  const label = `clob-ws-${durationMin}m${labelSuffix}`;

  // ── WebSocket state ────────────────────────────────────────────────────────
  let ws = null;
  let pingInterval = null;
  let reconnectTimeout = null;
  let rolloverInterval = null;
  let refreshInterval = null;
  let isConnecting = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const PING_INTERVAL_MS = 10000; // 10 s (required by Polymarket)

  // ── Price cache ────────────────────────────────────────────────────────────
  const priceCache = {
    BTC: { up: null, down: null, up_bid: null, down_bid: null, updatedAt: null, market: null, marketEnd: null },
    ETH: { up: null, down: null, up_bid: null, down_bid: null, updatedAt: null, market: null, marketEnd: null },
    SOL: { up: null, down: null, up_bid: null, down_bid: null, updatedAt: null, market: null, marketEnd: null },
    XRP: { up: null, down: null, up_bid: null, down_bid: null, updatedAt: null, market: null, marketEnd: null },
  };

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const priceCallbacks = [];
  function registerPriceCallback(fn) { priceCallbacks.push(fn); }
  function emitPrice(crypto, outcome, ask, bid) {
    for (const fn of priceCallbacks) {
      try { fn(crypto, outcome, ask, bid); } catch (_) {}
    }
  }

  // ── Token mapping ──────────────────────────────────────────────────────────
  const tokenMap = new Map();

  let currentSubscription = {
    BTC: { upTokenId: null, downTokenId: null, marketSlug: null },
    ETH: { upTokenId: null, downTokenId: null, marketSlug: null },
    SOL: { upTokenId: null, downTokenId: null, marketSlug: null },
    XRP: { upTokenId: null, downTokenId: null, marketSlug: null },
  };

  // ── Token refresh ──────────────────────────────────────────────────────────

  async function refreshTokenMapping() {
    try {
      logger.info(`[${label}] Refreshing token mappings for all cryptos...`);
      const cryptos = ['BTC', 'ETH', 'SOL', 'XRP'];

      for (const crypto of cryptos) {
        const slugPattern = `${crypto.toLowerCase()}-updown-${durationMin}m`;
        const markets = await gamma.getActiveMarkets(crypto, slugPattern, durationMin);

        if (!markets || markets.length === 0) {
          logger.warn(`[${label}] No active market found`, { crypto });
          continue;
        }

        const market = markets[0];
        const upToken   = market.tokens.find(t => t.outcome === 'Up'   || t.outcome === 'UP');
        const downToken = market.tokens.find(t => t.outcome === 'Down' || t.outcome === 'DOWN');

        if (!upToken || !downToken) {
          logger.warn(`[${label}] Missing tokens`, { crypto, market: market.slug });
          continue;
        }

        currentSubscription[crypto] = {
          upTokenId   : upToken.token_id,
          downTokenId : downToken.token_id,
          marketSlug  : market.slug,
        };

        tokenMap.set(upToken.token_id,   { crypto, outcome: 'up' });
        tokenMap.set(downToken.token_id, { crypto, outcome: 'down' });

        if (priceCache[crypto].market !== market.slug) {
          logger.info(`[${label}] Market rolled over - clearing stale prices`, {
            crypto,
            from : priceCache[crypto].market,
            to   : market.slug,
          });
          priceCache[crypto].up        = null;
          priceCache[crypto].down      = null;
          priceCache[crypto].updatedAt = null;
        }

        priceCache[crypto].market    = market.slug;
        priceCache[crypto].marketEnd = new Date(market.endDate);

        logger.info(`[${label}] Token mapping updated`, {
          crypto,
          market    : market.slug,
          upToken   : upToken.token_id.slice(0, 16) + '...',
          downToken : downToken.token_id.slice(0, 16) + '...',
        });
      }

      return true;
    } catch (err) {
      logger.error(`[${label}] Failed to refresh token mapping`, { error: err.message, stack: err.stack });
      return false;
    }
  }

  // ── WebSocket ──────────────────────────────────────────────────────────────

  function connect() {
    if (isConnecting || (ws && ws.readyState === WebSocket.OPEN)) {
      logger.debug(`[${label}] Already connected or connecting`);
      return;
    }

    isConnecting = true;
    const wsUrl = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
    logger.info(`[${label}] Connecting to Polymarket WebSocket...`, { url: wsUrl });

    ws = new WebSocket(wsUrl);

    ws.on('open', async () => {
      isConnecting = false;
      reconnectAttempts = 0;
      logger.info(`[${label}] ✅ WebSocket connected`);

      const success = await refreshTokenMapping();
      if (!success) {
        logger.error(`[${label}] Failed to get token mappings, will retry...`);
        scheduleReconnect(5000);
        return;
      }

      const tokenIds = [];
      for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
        if (currentSubscription[crypto].upTokenId)   tokenIds.push(currentSubscription[crypto].upTokenId);
        if (currentSubscription[crypto].downTokenId) tokenIds.push(currentSubscription[crypto].downTokenId);
      }

      if (tokenIds.length === 0) {
        logger.error(`[${label}] No tokens to subscribe to`);
        scheduleReconnect(5000);
        return;
      }

      const subscribeMsg = {
        assets_ids            : tokenIds,
        type                  : 'market',
        custom_feature_enabled: true,
      };

      logger.info(`[${label}] Subscribing to tokens...`, { count: tokenIds.length });
      ws.send(JSON.stringify(subscribeMsg));
      startPingInterval();
    });

    ws.on('message', (data) => {
      const rawMessage = data.toString();
      try {
        handleMessage(JSON.parse(rawMessage));
      } catch (err) {
        if (rawMessage === 'PONG' || rawMessage.includes('PONG')) {
          logger.debug(`[${label}] Received PONG`);
        } else {
          logger.debug(`[${label}] Non-JSON message`, { message: rawMessage.substring(0, 100), error: err.message });
        }
      }
    });

    ws.on('error', (err) => {
      logger.error(`[${label}] WebSocket error`, { error: err.message, code: err.code });
    });

    ws.on('close', (code, reason) => {
      isConnecting = false;
      stopPingInterval();
      logger.warn(`[${label}] WebSocket closed`, {
        code,
        reason           : reason.toString(),
        reconnectAttempt : reconnectAttempts + 1,
      });

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 60000);
        scheduleReconnect(delay);
      } else {
        logger.error(`[${label}] Max reconnection attempts reached, giving up`);
      }
    });
  }

  function scheduleReconnect(delayMs) {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectAttempts++;
    logger.info(`[${label}] Reconnecting in ${delayMs / 1000}s...`, {
      attempt    : reconnectAttempts,
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
    });
    reconnectTimeout = setTimeout(() => { reconnectTimeout = null; connect(); }, delayMs);
  }

  function startPingInterval() {
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('PING');
        logger.debug(`[${label}] Sent PING`);
      } else {
        logger.warn(`[${label}] Cannot send PING - WebSocket not open`, { readyState: ws?.readyState });
      }
    }, PING_INTERVAL_MS);
  }

  function stopPingInterval() {
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  }

  // ── Message handlers ───────────────────────────────────────────────────────

  function handleMessage(message) {
    if (message === 'PONG' || (typeof message === 'string' && message.includes('PONG'))) {
      logger.info(`[${label}] ⬇️  Received PONG`);
      return;
    }

    const { event_type } = message;
    if (!event_type) {
      logger.debug(`[${label}] Message without event_type`, { keys: Object.keys(message) });
      return;
    }

    // Batch price_change array format
    if (event_type === 'price_change' && message.price_changes) {
      for (const priceChange of message.price_changes) {
        const { asset_id } = priceChange;
        if (!asset_id) continue;
        const mapping = tokenMap.get(asset_id);
        if (!mapping) continue;
        const { crypto, outcome } = mapping;
        const bestAsk = parseFloat(priceChange.best_ask);
        if (!isNaN(bestAsk)) {
          const bestBid = parseFloat(priceChange.best_bid) || null;
          priceCache[crypto][outcome]              = bestAsk;
          priceCache[crypto][`${outcome}_bid`]    = bestBid;
          priceCache[crypto].updatedAt            = new Date();
          emitPrice(crypto, outcome, bestAsk, bestBid);
          logger.debug(`[${label}] Price updated`, {
            crypto,
            outcome : outcome.toUpperCase(),
            side    : priceChange.side,
            bestAsk : (bestAsk * 100).toFixed(1) + '¢',
          });
        }
      }
      return;
    }

    // Individual events
    const { asset_id } = message;
    if (!asset_id) {
      logger.debug(`[${label}] Message without asset_id`, { event_type, keys: Object.keys(message) });
      return;
    }

    const mapping = tokenMap.get(asset_id);
    if (!mapping) return;

    const { crypto, outcome } = mapping;

    switch (event_type) {
      case 'best_bid_ask':    handleBestBidAsk(crypto, outcome, message);    break;
      case 'book':            handleBookSnapshot(crypto, outcome, message);  break;
      case 'price_change':   handlePriceChange(crypto, outcome, message);   break;
      case 'last_trade_price':
        logger.debug(`[${label}] Last trade (ignored for cache)`, {
          crypto, outcome: outcome.toUpperCase(), price: message.price,
        });
        break;
      default: break;
    }
  }

  function handleBestBidAsk(crypto, outcome, message) {
    const bestAsk = parseFloat(message.best_ask);
    if (isNaN(bestAsk)) return;
    const bestBid = parseFloat(message.best_bid) || null;
    priceCache[crypto][outcome]           = bestAsk;
    priceCache[crypto][`${outcome}_bid`] = bestBid;
    priceCache[crypto].updatedAt         = new Date();
    emitPrice(crypto, outcome, bestAsk, bestBid);
    logger.debug(`[${label}] Best ask updated`, {
      crypto,
      outcome   : outcome.toUpperCase(),
      bestAsk   : (bestAsk * 100).toFixed(1) + '¢',
      bestBid   : message.best_bid,
      timestamp : priceCache[crypto].updatedAt.toISOString(),
    });
  }

  function handleBookSnapshot(crypto, outcome, message) {
    const { bids, asks } = message;
    if (!asks || asks.length === 0) return;
    const bestAsk = parseFloat(asks[0].price);
    if (isNaN(bestAsk)) return;
    const bestBid = (bids && bids.length > 0) ? parseFloat(bids[0].price) || null : null;
    priceCache[crypto][outcome]           = bestAsk;
    priceCache[crypto][`${outcome}_bid`] = bestBid;
    priceCache[crypto].updatedAt         = new Date();
    emitPrice(crypto, outcome, bestAsk, bestBid);
    logger.debug(`[${label}] Orderbook snapshot received`, {
      crypto,
      outcome  : outcome.toUpperCase(),
      bestAsk  : (bestAsk * 100).toFixed(1) + '¢',
      askDepth : asks.length,
      bidDepth : bids?.length || 0,
    });
  }

  function handlePriceChange(crypto, outcome, message) {
    const bestAsk = parseFloat(message.best_ask);
    if (isNaN(bestAsk)) return;
    const bestBid = parseFloat(message.best_bid) || null;
    priceCache[crypto][outcome]           = bestAsk;
    priceCache[crypto][`${outcome}_bid`] = bestBid;
    priceCache[crypto].updatedAt         = new Date();
    emitPrice(crypto, outcome, bestAsk, bestBid);
    logger.debug(`[${label}] Price change`, {
      crypto,
      outcome    : outcome.toUpperCase(),
      side       : message.side,
      newBestAsk : (bestAsk * 100).toFixed(1) + '¢',
    });
  }

  // ── Market rollover detection ──────────────────────────────────────────────

  let isCheckingMarket = false;

  async function checkMarketRollover() {
    if (isCheckingMarket) return;
    isCheckingMarket = true;
    try {
      const now = Date.now();
      let needsCheck = false;
      for (const crypto of ['BTC', 'ETH', 'SOL', 'XRP']) {
        const marketEnd = priceCache[crypto].marketEnd;
        if (!marketEnd) { needsCheck = true; break; }
        if (marketEnd.getTime() - now <= 60000) { needsCheck = true; break; }
      }
      if (!needsCheck) return;

      const slugPattern = `btc-updown-${durationMin}m`;
      const markets = await gamma.getActiveMarkets('BTC', slugPattern, durationMin);
      if (!markets || markets.length === 0) return;

      const latestMarket = markets[0];
      const currentSlug  = priceCache['BTC'].market;

      if (latestMarket.slug !== currentSlug) {
        logger.info(`[${label}] Market rollover detected - refreshing all tokens`, {
          from: currentSlug,
          to  : latestMarket.slug,
        });
        await refreshTokenMapping();
        if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, 'Market rollover');
      }
    } catch (err) {
      logger.debug(`[${label}] Market rollover check error`, { error: err.message });
    } finally {
      isCheckingMarket = false;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function start() {
    logger.info(`[${label}] Starting WebSocket price stream...`);
    connect();

    rolloverInterval = setInterval(checkMarketRollover, 15000);
    refreshInterval  = setInterval(async () => {
      logger.debug(`[${label}] Periodic token refresh...`);
      await refreshTokenMapping();
      if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, 'Periodic refresh');
    }, 4 * 60 * 1000);
  }

  function stop() {
    logger.info(`[${label}] Stopping WebSocket client...`);
    stopPingInterval();
    if (rolloverInterval) { clearInterval(rolloverInterval); rolloverInterval = null; }
    if (refreshInterval)  { clearInterval(refreshInterval);  refreshInterval  = null; }
    if (reconnectTimeout) { clearTimeout(reconnectTimeout);  reconnectTimeout = null; }
    if (ws) { ws.close(1000, 'Shutting down'); ws = null; }
  }

  const PRICE_STALE_MS = 15_000; // Warn if prices are older than 15 seconds

  function getPrice(crypto) {
    const c = priceCache[crypto];
    if (!c) return null;
    if (c.updatedAt && Date.now() - new Date(c.updatedAt).getTime() > PRICE_STALE_MS) {
      logger.warn(`[${label}] Stale price for ${crypto} — last update ${Math.round((Date.now() - new Date(c.updatedAt).getTime()) / 1000)}s ago`);
    }
    return c;
  }

  function getLatestPrices() {
    const now = Date.now();
    for (const [crypto, c] of Object.entries(priceCache)) {
      if (c.updatedAt && now - new Date(c.updatedAt).getTime() > PRICE_STALE_MS) {
        logger.warn(`[${label}] Stale price for ${crypto} — last update ${Math.round((now - new Date(c.updatedAt).getTime()) / 1000)}s ago`);
      }
    }
    return priceCache;
  }

  function getSubscription(crypto) {
    const sub    = currentSubscription[crypto] || { upTokenId: null, downTokenId: null, marketSlug: null };
    const prices = priceCache[crypto];
    // Include current live ask prices so callers (e.g. T+1 price-cap check) can use real-time data.
    return { ...sub, upAsk: prices?.up ?? null, downAsk: prices?.down ?? null };
  }

  function isConnected() {
    return ws !== null && ws.readyState === WebSocket.OPEN;
  }

  return { start, stop, getPrice, getLatestPrices, registerPriceCallback, getSubscription, isConnected };
}

// ── Default 5-min singleton (backward-compatible) ──────────────────────────

const _default5m = createClobWebsocket(5);

module.exports = {
  start                 : () => _default5m.start(),
  stop                  : () => _default5m.stop(),
  getPrice              : (c)  => _default5m.getPrice(c),
  getLatestPrices       : ()   => _default5m.getLatestPrices(),
  registerPriceCallback : (fn) => _default5m.registerPriceCallback(fn),
  getSubscription       : (c)  => _default5m.getSubscription(c),
  isConnected           : ()   => _default5m.isConnected(),
  createClobWebsocket,
};
