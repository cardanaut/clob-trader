require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express = require('express');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');
const config = require('../utils/config');
const spikeConfig = require('../spike/config');
const logger = require('../utils/logger');
const { query } = require('../database/connection');
const clobWebsocket   = require('../spike/clob-websocket');
const kalshiWebsocket = require('../spike/kalshi-websocket');
const subCandleGen    = require('../t1000/sub-candle-generator');
const t1000Engine     = require('../t1000/t1000-engine');

const app = express();
app.set('trust proxy', 1); // Trust 1 proxy (nginx) - fixes express-rate-limit errors
app.use(express.json());

// CORS — restrict to own domain only
const ALLOWED_ORIGINS = ['https://jeer.currenciary.com', 'https://www.jeer.currenciary.com'];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Basic Authentication — required for all mutating/sensitive routes
// Set API_PASSWORD in .env. Without it the server will refuse to start.
if (!process.env.API_PASSWORD) {
  logger.error('[api] FATAL: API_PASSWORD env var is not set. Set it in .env and restart.');
  process.exit(1);
}
// Accept auth via Standard Basic Auth OR custom X-Polychamp-Auth header.
// The custom header is a fallback for browsers where SES/lockdown strips Authorization.
const _expectedAuth = 'Basic ' + Buffer.from('admin:' + process.env.API_PASSWORD).toString('base64');
const authMiddleware = (req, res, next) => {
  const auth = req.headers['authorization'] || req.headers['x-polychamp-auth'];
  if (auth === _expectedAuth) return next();
  res.status(401).json({ error: 'Unauthorized' });
};
logger.info('[api] Basic authentication ENABLED');

// --- Health ---
app.get('/health', async (req, res) => {
  const now     = Date.now();
  const issues  = [];
  const details = { uptime: Math.floor(process.uptime()) };

  // 1. DB ping
  try {
    await query('SELECT 1');
    details.db = 'ok';
  } catch (err) {
    details.db = 'error';
    issues.push('db_down');
  }

  // 2. Binance feed liveness — expect a tick within the last 3 minutes
  const { lastBinanceTickTs, lastCycleStartTs } = subCandleGen.getHealthTs();
  const tickAgeSec  = lastBinanceTickTs ? Math.floor((now - lastBinanceTickTs) / 1000) : null;
  const cycleAgeSec = lastCycleStartTs  ? Math.floor((now - lastCycleStartTs)  / 1000) : null;
  details.binance_tick_age_sec  = tickAgeSec;
  details.last_cycle_age_sec    = cycleAgeSec;

  if (tickAgeSec === null || tickAgeSec > 180) {
    issues.push('binance_feed_stale');
  }
  // 3. Cycle liveness — a new 5m cycle fires every 5 min; allow 8m for startup lag
  if (cycleAgeSec === null || cycleAgeSec > 480) {
    issues.push('cycle_stale');
  }

  const status = issues.length === 0 ? 'ok' : 'degraded';
  res.status(issues.length === 0 ? 200 : 503).json({ status, issues, ...details });
});

// ─── Polymarket account endpoints ────────────────────────────────────────────

const poly       = require('../trader/polymarket');
const withdrawal = require('../trader/usdc-withdrawal');
const { ethers: ethersV5 } = require('@polymarket/order-utils/node_modules/ethers');

const PROXY_ADDR_ENV = process.env.POLY_PROXY_ADDRESS;

app.get('/account/trades', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '50',  10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const side   = req.query.side && ['BUY','SELL'].includes(req.query.side.toUpperCase())
                   ? `&side=${req.query.side.toUpperCase()}` : '';
    const url    = `https://data-api.polymarket.com/trades?user=${PROXY_ADDR_ENV}&limit=${limit}&offset=${offset}&sortBy=TIMESTAMP&sortDirection=DESC${side}`;
    const https  = require('https');
    const data   = await new Promise((resolve, reject) => {
      https.get(url, { headers: { 'Accept': 'application/json' } }, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Invalid JSON from data-api')); }
        });
      }).on('error', reject);
    });
    res.json({ trades: Array.isArray(data) ? data : [], limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/account/positions', async (req, res) => {
  try {
    // Use EOA address (trading wallet) — proxy address is unused/undeployed
    const addr  = poly.getEoaAddress() || PROXY_ADDR_ENV;
    const url   = `https://data-api.polymarket.com/positions?user=${addr}&sizeThreshold=.01`;
    const https = require('https');
    const data  = await new Promise((resolve, reject) => {
      https.get(url, { headers: { 'Accept': 'application/json' } }, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Invalid JSON from data-api')); }
        });
      }).on('error', reject);
    });
    res.json({ positions: Array.isArray(data) ? data : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Whitelists used for input validation
const VALID_CRYPTOS    = new Set(['BTC', 'ETH', 'SOL', 'XRP']);
const VALID_CANDLES_5M  = new Set([50, 55, 60, 65, 70, 75, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 95]);
const VALID_CANDLES_15M = new Set([150, 157, 159, 161, 163, 165, 167, 169, 171, 173, 175, 180, 195, 210, 225, 240, 255]);
const VALID_CANDLES     = new Set([...VALID_CANDLES_5M, ...VALID_CANDLES_15M]);

// ─── Route modules ────────────────────────────────────────────────────────────
const routeDeps = { authMiddleware, t1000Engine, query, withdrawal };
require('./routes/spike')(app, routeDeps);
require('./routes/t1000')(app, routeDeps);
require('./routes/simulator')(app, routeDeps);
require('./routes/withdrawal')(app, routeDeps);

// --- Start price collectors ---
// 5-min CLOB WebSocket (for C50–C85 T1000 candle snapshots)
logger.info('[api] Starting 5-min CLOB WebSocket price stream...');
clobWebsocket.start();

// 15-min CLOB WebSocket (for C150–C255 T1000 candle snapshots)
const clobWebsocket15m = clobWebsocket.createClobWebsocket(15);
logger.info('[api] Starting 15-min CLOB WebSocket price stream...');
clobWebsocket15m.start();

// Kalshi WebSocket (silent if not configured)
kalshiWebsocket.start().catch(err =>
  logger.warn('[api] Kalshi WS failed to start', { error: err.message })
);

// --- Start auto-withdrawal scheduler ---
withdrawal.startAutoWithdrawal();

// --- Start T1000 sub-candle generator + engine ---
t1000Engine.start();
// Inject CLOB subscription getters so the engine can look up live token IDs for real order placement
t1000Engine.setSubscriptionGetters(
  (crypto) => clobWebsocket.getSubscription(crypto),
  (crypto) => clobWebsocket15m.getSubscription(crypto)
);
// Inject Binance current-close getter for RECOVER strategy checks
t1000Engine.setCurrentCloseGetter(crypto => subCandleGen.getCurrentClose(crypto));
// Inject cycle ref price getter for the frontend market dist% panel
t1000Engine.setCycleRefGetter(() => subCandleGen.getCycleRefPrices());
subCandleGen.start(
  () => clobWebsocket.getLatestPrices(),
  () => clobWebsocket15m.getLatestPrices(),
  () => clobWebsocket.isConnected(),
  () => clobWebsocket15m.isConnected()
);
subCandleGen.onCandle(candle => t1000Engine.onCandle(candle));
subCandleGen.onCycleEnd((cycleStart, finalPrices, cycleMs) => t1000Engine.onCycleEnd(cycleStart, finalPrices, cycleMs));
// On Binance reconnect: fetch any missing PM outcomes then resolve stuck OPEN trades
subCandleGen.onReconnect(async () => {
  await t1000Engine.fetchMissingOutcomes();
  t1000Engine.recoverStuckOpenTrades();
});
t1000Engine.setKalshiWebsocket(kalshiWebsocket);
logger.info('[api] T1000 engine started');

// --- Run DB migrations (idempotent — safe to run on every startup) ---
(async () => {
  const fs   = require('fs');
  const path = require('path');
  const migDir = path.join(__dirname, '../database/migrations');
  const files  = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
  let errors = 0;
  for (const file of files) {
    try {
      const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
      await query(sql);
      logger.debug(`[api] migration applied: ${file}`);
    } catch (err) {
      errors++;
      logger.warn(`[api] migration failed (non-fatal): ${file}`, { error: err.message });
    }
  }
  if (errors) logger.warn(`[api] DB migrations complete with ${errors} error(s)`);
  else logger.info('[api] DB migrations complete');
})();

// --- Start server ---
const server = app.listen(config.server.port, '127.0.0.1', () => {
  logger.info(`PolyChamp API listening on 127.0.0.1:${config.server.port}`);
});

// --- Graceful shutdown (SIGTERM from PM2, SIGINT from Ctrl-C) ---
async function gracefulShutdown(signal) {
  logger.info(`[api] ${signal} received — starting graceful shutdown`);
  // Stop accepting new connections
  server.close(() => {
    logger.info('[api] HTTP server closed');
  });
  // Stop WebSocket streams and sub-candle generator
  try { clobWebsocket.stop(); } catch (e) {}
  try { clobWebsocket15m.stop(); } catch (e) {}
  try { kalshiWebsocket.stop(); } catch (e) {}
  try { subCandleGen.stop(); } catch (e) {}
  // Give engine a moment to finish any in-progress state save
  await new Promise(r => setTimeout(r, 500));
  logger.info('[api] Shutdown complete');
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
