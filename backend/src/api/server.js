require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express = require('express');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');
const config = require('../utils/config');
const spikeConfig = require('../spike/config');
const logger = require('../utils/logger');
const { getTrades, getTradeCount, getTopWallets, getWalletStats, getUnresolvedMarkets } = require('../database/queries');
const { runBacktest } = require('../strategies/backtest');
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

// --- Trades ---
app.get('/trades', async (req, res) => {
  try {
    const { limit = 50, offset = 0, wallet, market_id, category, min_amount, binary, resolved } = req.query;
    const trades = await getTrades({
      limit: Math.min(parseInt(limit, 10), 200),
      offset: parseInt(offset, 10),
      wallet,
      market_id,
      category,
      min_amount: min_amount ? parseFloat(min_amount) : undefined,
      binary_only: binary === 'true' || binary === '1',
      resolved_only: resolved === 'true' || resolved === '1',
    });
    const total = await getTradeCount();
    res.json({ trades, total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) });
  } catch (err) {
    logger.error('GET /trades error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get('/trades/:wallet', async (req, res) => {
  try {
    const trades = await getTrades({ wallet: req.params.wallet, limit: 100 });
    res.json({ trades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Wallets ---
app.get('/wallets', async (req, res) => {
  try {
    const { days = 30, limit = 50, offset = 0, min_success, max_success, min_volume, max_volume, sort_by, sort_dir, hide_negative_pnl } = req.query;
    const result = await getTopWallets({
      days: parseInt(days, 10),
      limit: Math.min(parseInt(limit, 10), 200),
      offset: parseInt(offset, 10),
      minSuccessPct: min_success ? parseFloat(min_success) : undefined,
      maxSuccessPct: max_success ? parseFloat(max_success) : undefined,
      minVolume: min_volume ? parseFloat(min_volume) : undefined,
      maxVolume: max_volume ? parseFloat(max_volume) : undefined,
      sortBy: sort_by || 'score',
      sortDir: sort_dir || 'desc',
      hideNegativePnl: hide_negative_pnl === 'true' || hide_negative_pnl === '1',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/wallets/:address/stats', async (req, res) => {
  try {
    const stats = await getWalletStats(req.params.address);
    if (!stats) return res.status(404).json({ error: 'Wallet not found' });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Markets ---
app.get('/markets', async (req, res) => {
  try {
    const markets = await query(
      'SELECT * FROM markets ORDER BY resolution_date ASC NULLS LAST LIMIT 200'
    );
    res.json({ markets: markets.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/markets/:id', async (req, res) => {
  try {
    const market = await query('SELECT * FROM markets WHERE id = $1', [req.params.id]);
    if (!market.rows.length) return res.status(404).json({ error: 'Market not found' });
    const trades = await getTrades({ market_id: req.params.id, limit: 100 });
    res.json({ market: market.rows[0], trades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Backtest ---
app.post('/backtest/run', async (req, res) => {
  try {
    const {
      strategy          = 'NAIVE_COPY',
      dateFrom          = new Date(Date.now() - 30 * 86400000).toISOString(),
      dateTo            = new Date().toISOString(),
      startingCapital   = 10000,
      positionSizePct   = 5,
      category,
      minTradeUsd        = 2000,
      maxPrice           = 1,
      marketMaxLifetimeH = 0,
      lateEntryPct       = 0,
      entryGaugeMode     = 'after',
      invertDirection    = false,
      maxPendingCount    = 0,
      maxPendingPct      = 0,
      // TOP_SCORE params
      topScoreTopN          = 20,
      topScoreMinResolved   = 3,
      topScoreMinSuccessPct = 100,
      topScoreMinScore      = 55,
    } = req.body;

    const validStrategies = ['NAIVE_COPY', 'MANUAL', 'LIQUIDITY_FILTER', 'CONVICTION_WINDOW', 'CATEGORY_SPECIALIST', 'TOP_SCORE'];
    if (!validStrategies.includes(strategy)) {
      return res.status(400).json({ error: 'Invalid strategy' });
    }
    if (startingCapital < 10 || startingCapital > 10000000) {
      return res.status(400).json({ error: 'startingCapital must be between 10 and 10,000,000' });
    }
    if (positionSizePct < 0.1 || positionSizePct > 100) {
      return res.status(400).json({ error: 'positionSizePct must be between 0.1 and 100' });
    }
    if (minTradeUsd < 0) {
      return res.status(400).json({ error: 'minTradeUsd must be >= 0' });
    }
    if (maxPrice <= 0 || maxPrice > 1) {
      return res.status(400).json({ error: 'maxPrice must be between 0.01 and 1' });
    }
    if (lateEntryPct < 0 || lateEntryPct > 100) {
      return res.status(400).json({ error: 'lateEntryPct must be 0–100' });
    }
    if (!['before', 'after'].includes(entryGaugeMode)) {
      return res.status(400).json({ error: 'entryGaugeMode must be "before" or "after"' });
    }

    const result = await runBacktest({ strategy, dateFrom, dateTo, startingCapital, positionSizePct, category, minTradeUsd, maxPrice, marketMaxLifetimeH, lateEntryPct, entryGaugeMode, invertDirection, maxPendingCount, maxPendingPct, topScoreTopN, topScoreMinResolved, topScoreMinSuccessPct, topScoreMinScore });
    res.json(result);
  } catch (err) {
    logger.error('Backtest error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- Stats summary for dashboard ---
app.get('/stats/summary', async (req, res) => {
  try {
    const [tradeCount, marketCount, walletCount, recentTrade, resolvedStats] = await Promise.all([
      query('SELECT COUNT(*) FROM trades'),
      query('SELECT COUNT(*) FROM markets'),
      query('SELECT COUNT(DISTINCT wallet_address) FROM trades'),
      query('SELECT timestamp FROM trades ORDER BY timestamp DESC LIMIT 1'),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE m.resolved = true) AS resolved_count,
          COUNT(*) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) = UPPER(m.winning_outcome)) AS resolved_wins
        FROM trades t
        LEFT JOIN markets m ON m.id = t.market_id
      `),
    ]);
    const resolvedCount = parseInt(resolvedStats.rows[0].resolved_count, 10);
    const resolvedWins  = parseInt(resolvedStats.rows[0].resolved_wins,  10);
    res.json({
      trade_count:    parseInt(tradeCount.rows[0].count, 10),
      market_count:   parseInt(marketCount.rows[0].count, 10),
      wallet_count:   parseInt(walletCount.rows[0].count, 10),
      last_trade:     recentTrade.rows[0]?.timestamp || null,
      resolved_count: resolvedCount,
      resolved_wins:  resolvedWins,
      resolved_pct:   resolvedCount > 0 ? Math.round(resolvedWins / resolvedCount * 1000) / 10 : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Auto-trader endpoints ────────────────────────────────────────────────────

const poly       = require('../trader/polymarket');
const engine     = require('../trader/engine');
const withdrawal = require('../trader/usdc-withdrawal');
const { ethers: ethersV5 } = require('@polymarket/order-utils/node_modules/ethers');

// GET /trader/config
app.get('/trader/config', async (req, res) => {
  try {
    const cfg = await engine.getConfig();
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /trader/config  { key: 'enabled', value: 'true' }
app.post('/trader/config', authMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body;
    const allowed = ['enabled','top_n','min_trades','min_success_pct','min_score',
                     'market_max_days','position_size_pct','max_locked_pct','min_order_usd',
                     'max_entry_price'];
    if (!allowed.includes(key)) return res.status(400).json({ error: 'Unknown config key' });
    await query(
      `INSERT INTO trader_config (key, value, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [key, String(value)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /trader/balance  →  { balance, locked, positions }
app.get('/trader/balance', async (req, res) => {
  try {
    const balance = await poly.getBalance();
    if (balance === null) {
      return res.status(502).json({ error: 'Cannot reach Polymarket — check API credentials in .env' });
    }
    const lockedRes = await query(
      `SELECT COALESCE(SUM(size_usd), 0) AS locked, COUNT(*) AS cnt
       FROM auto_positions WHERE status IN ('pending','open')`
    );
    res.json({
      balance,
      locked:    parseFloat(lockedRes.rows[0].locked),
      positions: parseInt(lockedRes.rows[0].cnt, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /trader/positions
app.get('/trader/positions', async (req, res) => {
  try {
    const { status } = req.query;
    const cond = status ? `WHERE ap.status = $1` : `WHERE ap.status IN ('pending','open','closed')`;
    const params = status ? [status] : [];
    const r = await query(
      `SELECT ap.*,
              m.start_date,
              m.resolution_date,
              EXTRACT(EPOCH FROM (m.resolution_date - m.start_date)) / 86400.0 AS market_lifetime_days
       FROM auto_positions ap
       LEFT JOIN markets m ON m.id = ap.market_id
       ${cond}
       ORDER BY ap.opened_at DESC
       LIMIT 200`, params
    );
    res.json({ positions: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /trader/log
app.get('/trader/log', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const r = await query(
      `SELECT * FROM trading_log ORDER BY created_at DESC LIMIT $1`, [limit]
    );
    res.json({ logs: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /trader/log — clear all activity log entries
app.delete('/trader/log', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM trading_log');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /trader/missed-opportunities — persistent log of trades skipped due to filters
app.get('/trader/missed-opportunities', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const r = await query(
      `SELECT * FROM missed_opportunities ORDER BY created_at DESC LIMIT $1`, [limit]
    );
    res.json({ opportunities: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /trader/missed-opportunities — clear all missed opportunities
app.delete('/trader/missed-opportunities', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM missed_opportunities');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [REMOVED] GET /trader/candidates — top traders leaderboard removed in CLOB Trader

// --- Account (personal Polymarket history) ---

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
