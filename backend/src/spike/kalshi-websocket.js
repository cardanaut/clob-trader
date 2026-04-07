'use strict';

/**
 * Kalshi WebSocket Client
 *
 * Connects to Kalshi's WebSocket to receive real-time YES/NO ask prices for
 * 15-minute BTC/ETH/SOL crypto markets (same CLOB mechanics as Polymarket).
 *
 * Differences vs Polymarket:
 *   - Auth: RSA-PSS with SHA-256 (private key in KALSHI_PRIVATE_KEY_FILE or PEM env var)
 *   - Market duration: 15 minutes (vs 5 min on Polymarket)
 *   - Price fields: yes_ask / no_ask (vs up / down)
 *   - Market tickers rotate every 15 min (similar to Polymarket rollover)
 *
 * Setup (one-time):
 *   1. Create Kalshi account at kalshi.com
 *   2. Go to Settings → API Keys → Create key → download private key PEM
 *   3. Set KALSHI_API_KEY=your-key-id and KALSHI_PRIVATE_KEY_FILE=./kalshi-key.pem in .env
 *
 * If not configured, module is silently inactive (no crash).
 */

const WebSocket  = require('ws');
const crypto     = require('crypto');
const fs         = require('fs');
const axios      = require('axios');
const logger     = require('../utils/logger');

const BASE_URL   = 'https://api.elections.kalshi.com/trade-api/v2';
const WS_URL     = 'wss://api.elections.kalshi.com/trade-api/ws/v2';
const PING_MS    = 10000;
const MARKET_DURATION_MIN = 15;

// Series tickers for each crypto on Kalshi (15-minute markets)
const SERIES = {
  BTC: 'KXBTC15M',
  ETH: 'KXETH15M',
  SOL: 'KXSOL15M',
  XRP: 'KXXRP15M',
};

// Price cache — same interface as clob-websocket.getLatestPrices()
// yes = YES ask price (decimal 0-1), no = NO ask price (decimal 0-1)
const priceCache = {
  BTC: { yes: null, no: null, yes_bid: null, no_bid: null, ticker: null, endTime: null, updatedAt: null },
  ETH: { yes: null, no: null, yes_bid: null, no_bid: null, ticker: null, endTime: null, updatedAt: null },
  SOL: { yes: null, no: null, yes_bid: null, no_bid: null, ticker: null, endTime: null, updatedAt: null },
  XRP: { yes: null, no: null, yes_bid: null, no_bid: null, ticker: null, endTime: null, updatedAt: null },
};

// Registered callbacks for OHLC logger (same pattern as clob-websocket)
const priceCallbacks = [];
function registerPriceCallback(fn) { priceCallbacks.push(fn); }
function emitPrice(crypto, outcome, ask, bid) {
  for (const fn of priceCallbacks) {
    try { fn(crypto, outcome, ask, bid); } catch (_) {}
  }
}

// WebSocket state
let ws = null;
let pingInterval = null;
let reconnectTimeout = null;
let tickerRefreshInterval = null;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let msgId = 1;

// ── Auth ───────────────────────────────────────────────────────────────────────

function loadPrivateKey() {
  // Support key via file path or inline PEM in env
  const keyFile = process.env.KALSHI_PRIVATE_KEY_FILE;
  const keyPem  = process.env.KALSHI_PRIVATE_KEY_PEM;

  if (keyFile) {
    try { return fs.readFileSync(keyFile, 'utf8'); } catch (e) {
      logger.warn('[kalshi-ws] Cannot read private key file', { file: keyFile, error: e.message });
    }
  }
  if (keyPem) {
    // Allow \n literals in env var to represent actual newlines
    return keyPem.replace(/\\n/g, '\n');
  }
  return null;
}

function makeSignature(privateKeyPem, method, path) {
  const timestamp = Date.now().toString();
  // Strip query string from path before signing (Kalshi requirement)
  const cleanPath = path.split('?')[0];
  const message   = timestamp + method.toUpperCase() + cleanPath;

  const sign = crypto.createSign('SHA256');
  sign.update(message);
  sign.end();

  const sig = sign.sign({
    key:        privateKeyPem,
    padding:    crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });

  return { timestamp, signature: sig.toString('base64') };
}

function makeAuthHeaders(method, path) {
  const apiKey = process.env.KALSHI_API_KEY;
  const pem    = loadPrivateKey();
  if (!apiKey || !pem) return null;

  try {
    const { timestamp, signature } = makeSignature(pem, method, path);
    return {
      'KALSHI-ACCESS-KEY':       apiKey,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature,
    };
  } catch (err) {
    logger.warn('[kalshi-ws] Failed to sign request', { error: err.message });
    return null;
  }
}

// ── REST: market discovery ─────────────────────────────────────────────────────

/**
 * Fetch the currently active 15-min market ticker for a crypto.
 * Returns { ticker, endTime } or null.
 */
async function fetchActiveTicker(crypto) {
  const series = SERIES[crypto];
  if (!series) return null;

  const path    = `/trade-api/v2/markets?series_ticker=${series}&status=active&limit=1`;
  const headers = makeAuthHeaders('GET', path);
  if (!headers) return null;

  try {
    const res = await axios.get(BASE_URL + path.replace('/trade-api/v2', ''), {
      headers,
      timeout: 5000,
      proxy: false,
    });
    const list = Array.isArray(res.data?.markets) ? res.data.markets : [];
    if (list.length === 0) return null;
    const m = list[0];
    return {
      ticker:  m.ticker,
      endTime: new Date(m.close_time || m.end_date),
    };
  } catch (err) {
    logger.debug('[kalshi-ws] Failed to fetch active ticker', { crypto, error: err.message });
    return null;
  }
}

async function refreshAllTickers() {
  for (const crypto of Object.keys(SERIES)) {
    const result = await fetchActiveTicker(crypto);
    if (result && result.ticker !== priceCache[crypto].ticker) {
      logger.info('[kalshi-ws] Market rolled over', {
        crypto,
        from: priceCache[crypto].ticker,
        to:   result.ticker,
        ends: result.endTime?.toISOString().substring(11, 16)
      });
      priceCache[crypto].ticker  = result.ticker;
      priceCache[crypto].endTime = result.endTime;
      priceCache[crypto].yes     = null;
      priceCache[crypto].no      = null;
      priceCache[crypto].updatedAt = null;
    }
  }
}

// ── WebSocket ──────────────────────────────────────────────────────────────────

function getWsAuthHeaders() {
  const apiKey = process.env.KALSHI_API_KEY;
  const pem    = loadPrivateKey();
  if (!apiKey || !pem) return null;

  try {
    const { timestamp, signature } = makeSignature(pem, 'GET', '/trade-api/ws/v2');
    return {
      'KALSHI-ACCESS-KEY':       apiKey,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature,
    };
  } catch (err) {
    logger.warn('[kalshi-ws] Failed to sign WS connection', { error: err.message });
    return null;
  }
}

function subscribeToTickers() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const tickers = Object.values(priceCache)
    .map(c => c.ticker)
    .filter(Boolean);

  if (tickers.length === 0) {
    logger.warn('[kalshi-ws] No active market tickers to subscribe to');
    return;
  }

  const msg = {
    id:  msgId++,
    cmd: 'subscribe',
    params: {
      channels:       ['ticker'],
      market_tickers: tickers,
    },
  };

  ws.send(JSON.stringify(msg));
  logger.info('[kalshi-ws] Subscribed to ticker', { tickers });
}

function handleMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  // Ticker update
  if (msg.type === 'ticker' && msg.msg) {
    const { market_ticker, yes_ask, no_ask, yes_bid, no_bid } = msg.msg;
    if (!market_ticker) return;

    // Find which crypto this ticker belongs to
    const crypto = Object.keys(priceCache).find(
      c => priceCache[c].ticker === market_ticker
    );
    if (!crypto) return;

    // Normalise: Kalshi may send integers (cents) or decimals
    const norm = v => {
      if (v == null) return null;
      const n = parseFloat(v);
      if (isNaN(n)) return null;
      return n > 1 ? n / 100 : n; // convert cents to decimal if needed
    };

    const yesAsk = norm(yes_ask);
    const noAsk  = norm(no_ask);
    const yesBid = norm(yes_bid);
    const noBid  = norm(no_bid);

    // Prefer ask; fall back to bid for the cache (existing behaviour)
    const yesPrice = yesAsk ?? yesBid;
    const noPrice  = noAsk  ?? noBid;

    if (yesPrice !== null) priceCache[crypto].yes = yesPrice;
    if (noPrice  !== null) priceCache[crypto].no  = noPrice;
    if (yesBid   !== null) priceCache[crypto].yes_bid = yesBid;
    if (noBid    !== null) priceCache[crypto].no_bid  = noBid;

    if (yesPrice !== null || noPrice !== null) {
      priceCache[crypto].updatedAt = new Date();
      logger.debug('[kalshi-ws] Price update', {
        crypto,
        yes: yesPrice ? (yesPrice * 100).toFixed(1) + '¢' : '-',
        no:  noPrice  ? (noPrice  * 100).toFixed(1) + '¢' : '-',
      });
      // Emit to OHLC logger callbacks
      if (yesAsk !== null) emitPrice(crypto, 'YES', yesAsk, yesBid);
      if (noAsk  !== null) emitPrice(crypto, 'NO',  noAsk,  noBid);
    }
    return;
  }

  // Market rollover notification — refresh tickers and resubscribe
  if (msg.type === 'market_lifecycle' || msg.type === 'market_settled') {
    logger.info('[kalshi-ws] Market event received, refreshing tickers', { type: msg.type });
    refreshAllTickers().then(() => subscribeToTickers()).catch(() => {});
  }
}

function startPing() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: msgId++, cmd: 'ping' }));
    }
  }, PING_MS);
}

async function connect() {
  if (isConnecting) return;

  const apiKey = process.env.KALSHI_API_KEY;
  const pem    = loadPrivateKey();
  if (!apiKey || !pem) {
    logger.info('[kalshi-ws] Not configured (KALSHI_API_KEY / KALSHI_PRIVATE_KEY_FILE missing) — skipping');
    return;
  }

  isConnecting = true;

  // Fetch active market tickers before connecting
  await refreshAllTickers();

  const headers = getWsAuthHeaders();
  if (!headers) { isConnecting = false; return; }

  logger.info('[kalshi-ws] Connecting...');

  ws = new WebSocket(WS_URL, { headers });

  ws.on('open', () => {
    logger.info('[kalshi-ws] Connected');
    isConnecting = false;
    reconnectAttempts = 0;
    startPing();
    subscribeToTickers();
  });

  ws.on('message', (data) => handleMessage(data.toString()));

  ws.on('close', (code, reason) => {
    logger.warn('[kalshi-ws] Disconnected', { code, reason: reason?.toString() });
    cleanup();
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    logger.warn('[kalshi-ws] WebSocket error', { error: err.message });
    isConnecting = false;
  });
}

function cleanup() {
  isConnecting = false;
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (ws) { try { ws.terminate(); } catch {} ws = null; }
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error('[kalshi-ws] Max reconnect attempts reached');
    return;
  }
  const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;
  logger.info('[kalshi-ws] Reconnecting in', { ms: delay, attempt: reconnectAttempts });
  reconnectTimeout = setTimeout(() => connect(), delay);
}

// Refresh market tickers every ~14 minutes (slightly before 15-min rollover)
function startTickerRefreshLoop() {
  tickerRefreshInterval = setInterval(async () => {
    const prevTickers = Object.values(priceCache).map(c => c.ticker).join(',');
    await refreshAllTickers();
    const newTickers = Object.values(priceCache).map(c => c.ticker).join(',');
    if (newTickers !== prevTickers) {
      // Markets rolled over — resubscribe with new tickers
      subscribeToTickers();
    }
  }, 14 * 60 * 1000);
}

// ── Public API ─────────────────────────────────────────────────────────────────

async function start() {
  await connect();
  startTickerRefreshLoop();
}

function stop() {
  if (tickerRefreshInterval) { clearInterval(tickerRefreshInterval); tickerRefreshInterval = null; }
  if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
  cleanup();
}

/** Returns the full price cache (same shape as clob-websocket.getLatestPrices()) */
function getLatestPrices() {
  return priceCache;
}

/** Returns minutes remaining in the current 15-min cycle for a crypto */
function getMinsRemaining(crypto) {
  const endTime = priceCache[crypto]?.endTime;
  if (!endTime) return null;
  return Math.max(0, (endTime - Date.now()) / 60000);
}

/** Returns the currently active Kalshi market ticker for a crypto, or null */
function getActiveTicker(crypto) {
  return priceCache[crypto]?.ticker ?? null;
}

module.exports = { start, stop, getLatestPrices, getMinsRemaining, registerPriceCallback, getActiveTicker };
