require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

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

// Rate limiters (disable validation to work with nginx proxy)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Skip validation checks (we're behind nginx)
});

const statsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute (once per second)
  message: 'Too many stats requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Skip validation checks (we're behind nginx)
});

// --- SpikeTrading Backtest ---
app.post('/spike-backtest', apiLimiter, async (req, res) => {
  try {
    const maxCandles = req.body.maxCandles ? parseInt(req.body.maxCandles, 10) : 10000;
    const cryptos = req.body.cryptos || ['BTC']; // Array of crypto symbols
    const strategy = req.body.strategy || 'T123-1MIN';
    const direction = req.body.direction || 'momentum'; // 'momentum' or 'reversion'
    const platform = req.body.platform || 'iqoption';  // 'iqoption' or 'polymarket'

    // Validate input
    if (maxCandles < 5 || maxCandles > 50000 || isNaN(maxCandles)) {
      return res.status(400).json({ error: 'maxCandles must be between 5 and 50,000' });
    }

    if (!Array.isArray(cryptos) || cryptos.length === 0) {
      return res.status(400).json({ error: 'cryptos must be a non-empty array' });
    }

    const validCryptos = ['BTC', 'ETH', 'SOL', 'XRP'];
    for (const crypto of cryptos) {
      if (!validCryptos.includes(crypto)) {
        return res.status(400).json({ error: `Invalid crypto: ${crypto}. Must be BTC, ETH, SOL, or XRP` });
      }
    }

    // Validate strategy
    const validStrategies = Object.keys(spikeConfig.STRATEGIES);
    if (!validStrategies.includes(strategy)) {
      return res.status(400).json({ error: `Invalid strategy: ${strategy}. Must be one of: ${validStrategies.join(', ')}` });
    }

    // Validate direction
    if (!['momentum', 'reversion'].includes(direction)) {
      return res.status(400).json({ error: 'direction must be "momentum" or "reversion"' });
    }

    // Validate platform
    if (!['iqoption', 'polymarket'].includes(platform)) {
      return res.status(400).json({ error: 'platform must be "iqoption" or "polymarket"' });
    }

    // Load backtest range settings from database for selected cryptos
    const cryptoRanges = {};
    const configRes = await query(`
      SELECT crypto_symbol, min_threshold_pct, max_threshold_pct
      FROM spike_backtest_config
      WHERE crypto_symbol = ANY($1)
    `, [cryptos]);

    for (const row of configRes.rows) {
      cryptoRanges[row.crypto_symbol] = {
        min: parseFloat(row.min_threshold_pct),
        max: parseFloat(row.max_threshold_pct)
      };
    }

    logger.info('[api] Starting spike backtest', { maxCandles, cryptos, ranges: cryptoRanges });

    // Run backtest (this may take a while)
    const backtest = require('../spike/backtest');

    // If multiple cryptos selected, run in parallel and aggregate
    if (cryptos.length === 1) {
      // Single crypto - simple case
      const crypto = cryptos[0];
      const symbol = spikeConfig.SUPPORTED_CRYPTOS.find(c => c.symbol === crypto)?.binancePair || 'BTCUSDT';
      const range = cryptoRanges[crypto] || { min: 0.15, max: 0.30 };
      const results = await backtest.runBacktest(maxCandles, symbol, range.min, range.max, strategy, true, direction, platform);
      results.crypto = crypto;
      res.json(results);
    } else {
      // Multiple cryptos - run in parallel with individual error handling
      const promises = cryptos.map(async (crypto) => {
        try {
          const cryptoConfig = spikeConfig.SUPPORTED_CRYPTOS.find(c => c.symbol === crypto);
          if (!cryptoConfig) {
            logger.warn(`[api] No config found for ${crypto}, skipping`);
            return null;
          }

          const range = cryptoRanges[crypto] || { min: 0.15, max: 0.30 };
          const results = await backtest.runBacktest(maxCandles, cryptoConfig.binancePair, range.min, range.max, strategy, true, direction, platform);
          results.crypto = crypto;
          return results;
        } catch (err) {
          // Log error but don't fail entire request
          logger.error(`[api] Backtest failed for ${crypto}`, { error: err.message, stack: err.stack });
          return { crypto, error: err.message, failed: true };
        }
      });

      const allResults = await Promise.all(promises);
      const validResults = allResults.filter(r => r !== null && !r.failed);
      const failedResults = allResults.filter(r => r && r.failed);

      // If all cryptos failed, return error
      if (validResults.length === 0) {
        const errors = failedResults.map(r => `${r.crypto}: ${r.error}`).join('; ');
        throw new Error(`All crypto backtests failed: ${errors}`);
      }

      // If some failed, log warning but continue with successful ones
      if (failedResults.length > 0) {
        logger.warn('[api] Some crypto backtests failed', {
          failed: failedResults.map(r => r.crypto),
          succeeded: validResults.map(r => r.crypto)
        });
      }

      // Aggregate results
      const aggregated = {
        totalCycles: validResults.reduce((sum, r) => sum + r.totalCycles, 0),
        totalCandles: validResults.reduce((sum, r) => sum + r.totalCandles, 0),
        signalsDetected: validResults.reduce((sum, r) => sum + r.signalsDetected, 0),
        wins: validResults.reduce((sum, r) => sum + r.wins, 0),
        losses: validResults.reduce((sum, r) => sum + r.losses, 0),
        winRate: 0,
        ev: 0,
        byMinute: {
          0: { signals: 0, wins: 0, losses: 0, winRate: 0, ev: 0 },
          1: { signals: 0, wins: 0, losses: 0, winRate: 0, ev: 0 },
          2: { signals: 0, wins: 0, losses: 0, winRate: 0, ev: 0 },
          3: { signals: 0, wins: 0, losses: 0, winRate: 0, ev: 0 },
          4: { signals: 0, wins: 0, losses: 0, winRate: 0, ev: 0 }
        },
        byCrypto: validResults,
        failedCryptos: failedResults.length > 0 ? failedResults.map(r => ({
          crypto: r.crypto,
          error: r.error
        })) : undefined,
        period: validResults[0]?.period || {},
        duration: validResults.reduce((sum, r) => sum + r.duration, 0)
      };

      // Calculate aggregated win rate and EV
      const completed = aggregated.wins + aggregated.losses;
      if (completed > 0) {
        aggregated.winRate = (aggregated.wins / completed) * 100;
        aggregated.ev = ((aggregated.wins / completed) * 100) - ((aggregated.losses / completed) * 100);
      }

      // Sum individual crypto revenues (each already calculated correctly in backtest.js)
      aggregated.estimatedRevenue = validResults.reduce((sum, r) => sum + r.estimatedRevenue, 0);
      aggregated.revenuePerDay = aggregated.period.days > 0 ? aggregated.estimatedRevenue / aggregated.period.days : 0;

      // Aggregate by minute
      for (const minute of [0, 1, 2, 3, 4]) {
        const signals = validResults.reduce((sum, r) => sum + (r.byMinute[minute]?.signals || 0), 0);
        const wins = validResults.reduce((sum, r) => sum + (r.byMinute[minute]?.wins || 0), 0);
        const losses = validResults.reduce((sum, r) => sum + (r.byMinute[minute]?.losses || 0), 0);

        aggregated.byMinute[minute] = {
          signals,
          wins,
          losses,
          winRate: signals > 0 ? (wins / signals) * 100 : 0,
          ev: signals > 0 ? ((wins / signals) * 100) - ((losses / signals) * 100) : 0
        };
      }

      res.json(aggregated);
    }
  } catch (err) {
    logger.error('[api] Spike backtest error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SpikeTrading Stats ---
// Note: authMiddleware not applied for paper trading stats (read-only, public data)
// To protect: app.get('/spike-stats', authMiddleware, statsLimiter, async (req, res) => {
app.get('/spike-stats', statsLimiter, async (req, res) => {
  try {
    // Validate and sanitize days parameter
    const daysRaw = req.query.days ? parseInt(req.query.days, 10) : null;
    const days = (daysRaw > 0 && daysRaw < 3650 && !isNaN(daysRaw)) ? daysRaw : null;
    // Use parameterized interval to avoid any template-literal injection risk.
    // PostgreSQL: ($1 * INTERVAL '1 day') safely casts the integer parameter.
    const daysCond = days
      ? 'WHERE timestamp > NOW() - ($1 * INTERVAL \'1 day\')'
      : '';
    const daysParam = days ? [days] : [];

    // Get all trades
    const statsRes = await query(`
      SELECT
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE outcome = 'WIN') as wins,
        COUNT(*) FILTER (WHERE outcome = 'LOSS') as losses,
        COUNT(*) FILTER (WHERE outcome = 'PENDING') as pending,
        AVG(simulated_entry_price) FILTER (WHERE outcome != 'PENDING') as avg_entry_price,
        AVG(pnl_pct) FILTER (WHERE outcome = 'WIN') as avg_win_pct,
        AVG(pnl_pct) FILTER (WHERE outcome = 'LOSS') as avg_loss_pct,
        AVG(pnl_pct) FILTER (WHERE outcome != 'PENDING') as avg_pnl_pct,
        MIN(timestamp) as first_trade,
        MAX(timestamp) as last_trade
      FROM spike_trades_simulated
      ${daysCond}
    `, daysParam);

    const stats = statsRes.rows[0];

    // Get signal distribution
    const signalRes = await query(`
      SELECT
        signal_type,
        COUNT(*) as count,
        AVG(pnl_pct) FILTER (WHERE outcome != 'PENDING') as avg_pnl
      FROM spike_trades_simulated
      ${daysCond}
      GROUP BY signal_type
    `, daysParam);

    // Get recent trades
    const tradesRes = await query(`
      SELECT
        id, timestamp, crypto_symbol, market_id, market_question,
        signal_type, signal_minute, candle_range_pct,
        simulated_entry_price, position_size_usd,
        outcome, pnl_pct, pnl_usd
      FROM spike_trades_simulated
      ${daysCond}
      ORDER BY timestamp DESC
      LIMIT 20
    `, daysParam);

    // Get capital info
    const capitalRes = await query('SELECT current_capital, total_pnl FROM spike_capital ORDER BY id DESC LIMIT 1');
    const capital = capitalRes.rows[0] || { current_capital: spikeConfig.STARTING_CAPITAL, total_pnl: 0 };
    const currentCapital = parseFloat(capital.current_capital) || spikeConfig.STARTING_CAPITAL;

    res.json({
      stats: {
        total: parseInt(stats.total_trades) || 0,
        wins: parseInt(stats.wins) || 0,
        losses: parseInt(stats.losses) || 0,
        pending: parseInt(stats.pending) || 0,
        avgEntryPrice: parseFloat(stats.avg_entry_price) || 0,
        avgWinPct: parseFloat(stats.avg_win_pct) || 0,
        avgLossPct: parseFloat(stats.avg_loss_pct) || 0,
        evPerTrade: parseFloat(stats.avg_pnl_pct) || 0,
        firstTrade: stats.first_trade,
        lastTrade: stats.last_trade
      },
      capital: {
        current: currentCapital,
        starting: spikeConfig.STARTING_CAPITAL,
        totalPnl: parseFloat(capital.total_pnl) || 0,
        roi: ((currentCapital - spikeConfig.STARTING_CAPITAL) / spikeConfig.STARTING_CAPITAL) * 100
      },
      signals: signalRes.rows.map(r => ({
        type: r.signal_type,
        count: parseInt(r.count),
        avgPnl: parseFloat(r.avg_pnl) || 0
      })),
      recentTrades: tradesRes.rows
    });
  } catch (err) {
    logger.error('GET /spike-stats error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SpikeTrading Trading Mode Configuration ---
app.get('/spike-trading-mode', async (req, res) => {
  try {
    const mode = spikeConfig.TRADING_MODE || 'PAPER';
    res.json({ mode });
  } catch (err) {
    logger.error('GET /spike-trading-mode error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Note: POST /spike-trading-mode is intentionally NOT implemented
// Trading mode should only be changed via environment variable + bot restart
// This prevents accidental live trading activation

// --- SpikeTrading Balance (for LIVE mode) ---
app.get('/spike-balance', async (req, res) => {
  try {
    const mode = spikeConfig.TRADING_MODE || 'PAPER';

    if (mode === 'PAPER') {
      // Paper mode: return simulated capital
      const capitalRes = await query('SELECT current_capital FROM spike_capital ORDER BY id DESC LIMIT 1');
      const capital = capitalRes.rows[0] ? parseFloat(capitalRes.rows[0].current_capital) : spikeConfig.STARTING_CAPITAL;

      // Get pending positions (not yet resolved)
      const pendingRes = await query(`
        SELECT COALESCE(SUM(position_size_usd), 0) AS locked
        FROM spike_trades_simulated
        WHERE outcome = 'PENDING'
      `);

      const locked = parseFloat(pendingRes.rows[0].locked) || 0;

      res.json({
        mode: 'PAPER',
        available: capital - locked,
        locked,
        positions: 0, // Paper mode doesn't track individual positions
        total: capital
      });
    } else {
      // Live mode: get real balance from Polymarket
      const poly = require('../trader/polymarket');
      const balanceInfo = await poly.getBalance();

      if (balanceInfo === null) {
        return res.status(502).json({ error: 'Cannot reach Polymarket - check credentials' });
      }

      // Get open positions
      const positionsRes = await query(`
        SELECT COALESCE(SUM(position_size_usd), 0) AS locked, COUNT(*) AS count
        FROM spike_trades_live
        WHERE outcome = 'PENDING'
      `);

      const locked = parseFloat(positionsRes.rows[0].locked) || 0;
      const count = parseInt(positionsRes.rows[0].count) || 0;

      res.json({
        mode: 'LIVE',
        available: balanceInfo.liquid,
        locked,
        unredeemed: balanceInfo.unredeemed,
        positions: count,
        total: balanceInfo.total + locked
      });
    }
  } catch (err) {
    logger.error('GET /spike-balance error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SpikeTrading Market Prices ---
app.get('/spike-market-prices', async (req, res) => {
  try {
    const crypto = req.query.crypto || 'XRP';
    const gamma = require('../spike/gamma-api');

    // Crypto slug patterns for 5-minute markets
    const slugPatterns = {
      'BTC': 'btc-updown-5m',
      'ETH': 'eth-updown-5m',
      'SOL': 'sol-updown-5m',
      'XRP': 'xrp-updown-5m'
    };

    const slugPattern = slugPatterns[crypto];
    if (!slugPattern) {
      return res.status(400).json({ error: 'Invalid crypto symbol' });
    }

    // Get current active market for this crypto
    const markets = await gamma.getActiveMarkets(crypto, slugPattern, 5);

    if (!markets || markets.length === 0) {
      return res.json({
        upPrice: null,
        downPrice: null,
        cyclePosition: '-'
      });
    }

    // Get the first (current) market
    const market = markets[0];
    const now = new Date();
    const marketStart = new Date(market.startDate);

    // Calculate cycle position (BEGIN, T1, T2, T3, END)
    let cyclePosition = '-';
    if (now >= marketStart) {
      const minuteInCycle = Math.floor((now - marketStart) / (60 * 1000));
      if (minuteInCycle === 0) {
        cyclePosition = 'BEGIN';
      } else if (minuteInCycle >= 1 && minuteInCycle <= 3) {
        cyclePosition = `T${minuteInCycle}`;
      } else if (minuteInCycle === 4) {
        cyclePosition = 'END';
      } else if (minuteInCycle > 4) {
        cyclePosition = 'END+';
      }
    } else {
      const minutesUntil = Math.ceil((marketStart - now) / (60 * 1000));
      cyclePosition = `T-${minutesUntil}m`;
    }

    // Get prices from price collector cache (updated every second)
    let upPrice = 0.5;
    let downPrice = 0.5;
    let currentPrice = null;
    let marketOpenPrice = null;

    try {
      // Get cached prices from WebSocket
      const allPrices = clobWebsocket.getLatestPrices();
      const cachedPrice = allPrices[crypto];

      if (cachedPrice && cachedPrice.up !== null && cachedPrice.down !== null) {
        upPrice = cachedPrice.up;
        downPrice = cachedPrice.down;

        logger.debug('[spike-market-prices] Using cached prices from WebSocket', {
          crypto,
          market: market.slug,
          upPrice,
          downPrice,
          cacheAge: cachedPrice.updatedAt ? Date.now() - new Date(cachedPrice.updatedAt).getTime() : 'N/A'
        });
      } else {
        logger.warn('[spike-market-prices] WebSocket price data not available, using fallback', {
          crypto,
          market: market.slug
        });
      }

      // Get current crypto price for display
      const symbolMap = { 'BTC': 'BTCUSDT', 'ETH': 'ETHUSDT', 'SOL': 'SOLUSDT', 'XRP': 'XRPUSDT' };
      const binanceSymbol = symbolMap[crypto];
      const axios = require('axios');
      const binanceAxios = axios.create({ timeout: 5000, proxy: false });

      const currentPriceRes = await binanceAxios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`);
      currentPrice = parseFloat(currentPriceRes.data.price);

      const marketStart = new Date(market.startDate);
      const cycleStartTime = Math.floor(marketStart.getTime() / 1000);

      const candlesRes = await binanceAxios.get(`https://api.binance.com/api/v3/klines`, {
        params: {
          symbol: binanceSymbol,
          interval: '1m',
          startTime: cycleStartTime * 1000,
          limit: 1
        }
      });

      if (candlesRes.data && candlesRes.data.length > 0) {
        marketOpenPrice = parseFloat(candlesRes.data[0][1]);
      }

      logger.info('[spike-market-prices] Fetched market prices from CLOB POST /prices', {
        crypto,
        market: market.slug,
        upPrice,
        downPrice,
        currentPrice,
        marketOpenPrice
      });
    } catch (err) {
      // Fall back to 50/50 if orderbooks fail
      upPrice = 0.5;
      downPrice = 0.5;

      logger.warn('[spike-market-prices] Could not fetch orderbooks, using fallback', {
        crypto,
        error: err.message,
        upPrice,
        downPrice
      });
    }


    res.json({
      upPrice,
      downPrice,
      cyclePosition,
      currentPrice,
      marketOpenPrice,
      marketSlug: market.slug,
      question: market.question,
      marketUrl: `https://polymarket.com/event/${market.slug}`,
      volume: market.volume || 0
    });

  } catch (err) {
    logger.error('GET /spike-market-prices error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SpikeTrading Latest Prices (from WebSocket cache) ---
app.get('/spike-latest-prices', (req, res) => {
  try {
    // Note: clobWebsocket is started at the bottom of this file
    const prices = clobWebsocket.getLatestPrices();

    // Format response
    const response = {};
    for (const [crypto, data] of Object.entries(prices)) {
      response[crypto] = {
        up: data.up,
        down: data.down,
        market: data.market,
        marketEnd: data.marketEnd,
        updatedAt: data.updatedAt,
        stale: data.updatedAt ? (Date.now() - new Date(data.updatedAt).getTime() > 5000) : true
      };
    }

    res.json(response);
  } catch (err) {
    logger.error('GET /spike-latest-prices error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SpikeTrading Crypto Configuration ---
app.get('/spike-crypto-config', async (req, res) => {
  try {
    const result = await query(`
      SELECT crypto_symbol, enabled, min_threshold_pct, max_threshold_pct, updated_at
      FROM spike_crypto_config
      ORDER BY crypto_symbol
    `);

    res.json({ configs: result.rows });
  } catch (err) {
    logger.error('GET /spike-crypto-config error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/spike-crypto-config', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const { crypto_symbol, enabled, min_threshold_pct, max_threshold_pct } = req.body;

    // Validate input
    const validCryptos = ['BTC', 'ETH', 'SOL', 'XRP'];
    if (!validCryptos.includes(crypto_symbol)) {
      return res.status(400).json({ error: 'Invalid crypto_symbol. Must be BTC, ETH, SOL, or XRP' });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const minThreshold = parseFloat(min_threshold_pct);
    const maxThreshold = parseFloat(max_threshold_pct);

    if (isNaN(minThreshold) || minThreshold < 0.01 || minThreshold > 10) {
      return res.status(400).json({ error: 'min_threshold_pct must be between 0.01 and 10' });
    }

    if (isNaN(maxThreshold) || maxThreshold < 0.01 || maxThreshold > 10) {
      return res.status(400).json({ error: 'max_threshold_pct must be between 0.01 and 10' });
    }

    if (minThreshold >= maxThreshold) {
      return res.status(400).json({ error: 'min_threshold_pct must be less than max_threshold_pct' });
    }

    // Update database
    await query(`
      UPDATE spike_crypto_config
      SET enabled = $1, min_threshold_pct = $2, max_threshold_pct = $3, updated_at = NOW()
      WHERE crypto_symbol = $4
    `, [enabled, minThreshold, maxThreshold, crypto_symbol]);

    logger.info('[api] Updated spike crypto config', { crypto_symbol, enabled, min_threshold_pct: minThreshold, max_threshold_pct: maxThreshold });

    res.json({ success: true, crypto_symbol, enabled, min_threshold_pct: minThreshold, max_threshold_pct: maxThreshold });
  } catch (err) {
    logger.error('POST /spike-crypto-config error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SpikeTrading Backtest Config ---
app.get('/spike-backtest-config', async (req, res) => {
  try {
    const result = await query(`
      SELECT crypto_symbol, min_threshold_pct, max_threshold_pct, updated_at
      FROM spike_backtest_config
      ORDER BY crypto_symbol
    `);

    res.json({ configs: result.rows });
  } catch (err) {
    logger.error('GET /spike-backtest-config error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/spike-backtest-config', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const { crypto_symbol, min_threshold_pct, max_threshold_pct } = req.body;

    // Validate input
    const validCryptos = ['BTC', 'ETH', 'SOL', 'XRP'];
    if (!validCryptos.includes(crypto_symbol)) {
      return res.status(400).json({ error: 'Invalid crypto_symbol. Must be BTC, ETH, SOL, or XRP' });
    }

    const minThreshold = parseFloat(min_threshold_pct);
    const maxThreshold = parseFloat(max_threshold_pct);

    if (isNaN(minThreshold) || minThreshold < 0.01 || minThreshold > 10) {
      return res.status(400).json({ error: 'min_threshold_pct must be between 0.01 and 10' });
    }

    if (isNaN(maxThreshold) || maxThreshold < 0.01 || maxThreshold > 10) {
      return res.status(400).json({ error: 'max_threshold_pct must be between 0.01 and 10' });
    }

    if (minThreshold >= maxThreshold) {
      return res.status(400).json({ error: 'min_threshold_pct must be less than max_threshold_pct' });
    }

    // Upsert backtest config
    await query(`
      INSERT INTO spike_backtest_config (crypto_symbol, min_threshold_pct, max_threshold_pct, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (crypto_symbol)
      DO UPDATE SET min_threshold_pct = $2, max_threshold_pct = $3, updated_at = NOW()
    `, [crypto_symbol, minThreshold, maxThreshold]);

    logger.info('[api] Updated spike backtest config', { crypto_symbol, min_threshold_pct: minThreshold, max_threshold_pct: maxThreshold });

    res.json({ success: true, crypto_symbol, min_threshold_pct: minThreshold, max_threshold_pct: maxThreshold });
  } catch (err) {
    logger.error('POST /spike-backtest-config error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SpikeTrading Global Config ---
app.get('/spike-config', async (req, res) => {
  try {
    // Read from spike config file
    const spikeConfig = require('../spike/config');

    // Read settings from database
    const settingsRes = await query("SELECT setting_key, setting_value FROM spike_settings WHERE setting_key IN ('max_entry_price', 'detection_strategy', 'max_capital_risk_pct')");

    const settings = {};
    settingsRes.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    const maxEntryPrice = settings.max_entry_price ? parseFloat(settings.max_entry_price) : 0.75;
    const detectionStrategy = settings.detection_strategy || 'T123-1MIN';
    const maxCapitalRiskPct = settings.max_capital_risk_pct ? parseFloat(settings.max_capital_risk_pct) : 50;

    res.json({
      position_size_pct: spikeConfig.POSITION_SIZE_PCT,
      min_trade_size_usd: 1, // Polymarket minimum
      max_exposure_pct: spikeConfig.MAX_EXPOSURE_PCT,
      trading_mode: spikeConfig.TRADING_MODE,
      max_entry_price: maxEntryPrice,
      max_capital_risk_pct: maxCapitalRiskPct,
      detection_strategy: detectionStrategy,
      available_strategies: Object.keys(spikeConfig.STRATEGIES).map(key => ({
        id: key,
        name: spikeConfig.STRATEGIES[key].name,
        description: spikeConfig.STRATEGIES[key].description,
        interval: spikeConfig.STRATEGIES[key].interval,
        threshold: spikeConfig.STRATEGIES[key].minThreshold
      }))
    });
  } catch (err) {
    logger.error('GET /spike-config error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/spike-config', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const { position_size_pct, max_entry_price, max_capital_risk_pct, detection_strategy } = req.body;

    const spikeConfig = require('../spike/config');

    // Validate position_size_pct
    const positionSize = parseFloat(position_size_pct);
    if (isNaN(positionSize) || positionSize < 1 || positionSize > 20) {
      return res.status(400).json({ error: 'position_size_pct must be between 1 and 20' });
    }

    // Validate max_entry_price (optional parameter)
    if (max_entry_price !== undefined) {
      const maxPrice = parseFloat(max_entry_price);
      if (isNaN(maxPrice) || maxPrice < 0.01 || maxPrice > 0.99) {
        return res.status(400).json({ error: 'max_entry_price must be between 0.01 and 0.99' });
      }

      // Update max_entry_price in database
      await query(`
        INSERT INTO spike_settings (setting_key, setting_value, updated_at)
        VALUES ('max_entry_price', $1, NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = $1, updated_at = NOW()
      `, [maxPrice.toString()]);

      logger.info('[api] Updated max entry price', { max_entry_price: maxPrice });
    }

    // Validate max_capital_risk_pct (optional parameter)
    if (max_capital_risk_pct !== undefined) {
      const maxRisk = parseFloat(max_capital_risk_pct);
      if (isNaN(maxRisk) || maxRisk < 1 || maxRisk > 100) {
        return res.status(400).json({ error: 'max_capital_risk_pct must be between 1 and 100' });
      }

      // Update max_capital_risk_pct in database
      await query(`
        INSERT INTO spike_settings (setting_key, setting_value, updated_at)
        VALUES ('max_capital_risk_pct', $1, NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = $1, updated_at = NOW()
      `, [maxRisk.toString()]);

      logger.info('[api] Updated max capital risk', { max_capital_risk_pct: maxRisk });
    }

    // Validate detection_strategy (optional parameter)
    if (detection_strategy !== undefined) {
      if (!spikeConfig.STRATEGIES[detection_strategy]) {
        return res.status(400).json({ error: 'Invalid detection_strategy. Must be one of: ' + Object.keys(spikeConfig.STRATEGIES).join(', ') });
      }

      // Update detection_strategy in database
      await query(`
        INSERT INTO spike_settings (setting_key, setting_value, updated_at)
        VALUES ('detection_strategy', $1, NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = $1, updated_at = NOW()
      `, [detection_strategy]);

      logger.info('[api] Updated detection strategy', { detection_strategy: detection_strategy, strategy_name: spikeConfig.STRATEGIES[detection_strategy].name });
    }

    // Update .env file for position size
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '../../.env'); // backend/.env

    let envContent = fs.readFileSync(envPath, 'utf8');

    // Update or add SPIKE_POSITION_SIZE_PCT
    const regex = /^SPIKE_POSITION_SIZE_PCT=.*$/m;
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `SPIKE_POSITION_SIZE_PCT=${positionSize}`);
    } else {
      envContent += `\nSPIKE_POSITION_SIZE_PCT=${positionSize}\n`;
    }

    fs.writeFileSync(envPath, envContent);

    logger.info('[api] Updated spike position size config', { position_size_pct: positionSize });

    // Determine response message based on what changed
    let message = 'Configuration saved successfully.';
    if (detection_strategy !== undefined) {
      message += ' Strategy will be switched automatically within 30 seconds (no restart needed).';
    } else {
      message += ' Changes will be applied automatically within 30 seconds.';
    }

    res.json({ ok: true, message: message });
  } catch (err) {
    logger.error('POST /spike-config error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SpikeTrading Activity Log ---
app.get('/spike/activity-log', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const result = await query(
      `SELECT * FROM spike_activity_log ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ logs: result.rows });
  } catch (err) {
    logger.error('GET /spike/activity-log error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/spike/activity-log', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM spike_activity_log');
    logger.info('[api] Cleared spike activity log');
    res.json({ ok: true });
  } catch (err) {
    logger.error('DELETE /spike/activity-log error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SpikeTrading Missed Opportunities ---
app.get('/spike/missed-opportunities', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const result = await query(
      `SELECT * FROM spike_missed_opportunities ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ opportunities: result.rows });
  } catch (err) {
    logger.error('GET /spike/missed-opportunities error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/spike/missed-opportunities', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM spike_missed_opportunities');
    logger.info('[api] Cleared spike missed opportunities');
    res.json({ ok: true });
  } catch (err) {
    logger.error('DELETE /spike/missed-opportunities error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── T1000 Routes ─────────────────────────────────────────────────────────────

/** GET /t1000/state — returns all strategy states */
app.get('/t1000/state', (req, res) => {
  try {
    res.json(t1000Engine.getState());
  } catch (err) {
    logger.error('[api] GET /t1000/state error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/autoscan — returns autoscan_v2.json (3D sweep results for SETUP Fill button) */
app.get('/t1000/autoscan', (req, res) => {
  try {
    const fs   = require('fs');
    const path = require('path');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../logs/autoscan_v2.json'), 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'autoscan_v2.json not found — run: node simulate_combined.js -nf -as' });
  }
});

/** POST /t1000/config — update a strategy's enabled/threshold/strategy */
app.post('/t1000/config', authMiddleware, (req, res) => {
  try {
    const { stratKey, ...changes } = req.body;
    if (!stratKey) return res.status(400).json({ error: 'stratKey required' });
    const ok = t1000Engine.updateConfig(stratKey, changes);
    if (!ok) return res.status(400).json({ error: 'Unknown strategy key' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('[api] POST /t1000/config error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** POST /t1000/reset — reset balance + stats for a strategy */
app.post('/t1000/reset', authMiddleware, (req, res) => {
  try {
    const { stratKey } = req.body;
    if (!stratKey) return res.status(400).json({ error: 'stratKey required' });
    const ok = t1000Engine.resetBalance(stratKey);
    if (!ok) return res.status(400).json({ error: 'Unknown strategy key' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('[api] POST /t1000/reset error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/rejected/stats — per-reason outcome breakdown for false-positive analysis */
app.get('/t1000/rejected/stats', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, created_at, crypto, candle_size, direction, reason, cycle_start_ms
       FROM t1000_rejected
       WHERE created_at > NOW() - INTERVAL '30 days'`
    );

    let pmOutcomes = {};
    try {
      const pmPath = require('path').join(__dirname, '../../cache/pm_outcomes.json');
      pmOutcomes = JSON.parse(require('fs').readFileSync(pmPath, 'utf8'));
    } catch { /* silent */ }

    // Aggregate: for each reason, count total / WIN (false positive) / LOSS (correct) / unknown
    const byReason = {};
    for (const r of result.rows) {
      if (!byReason[r.reason]) byReason[r.reason] = { total: 0, WIN: 0, LOSS: 0, unknown: 0 };
      byReason[r.reason].total++;
      const durationSec   = r.candle_size >= 150 ? 900 : 300;
      const cycleStartSec = r.cycle_start_ms
        ? Math.floor(r.cycle_start_ms / 1000)
        : Math.floor(new Date(r.created_at).getTime() / 1000 / durationSec) * durationSec;
      const outcome = pmOutcomes[`${r.crypto}_${cycleStartSec}_${durationSec}`] ?? null;
      if (!outcome) {
        byReason[r.reason].unknown++;
      } else if (outcome === r.direction) {
        // Market resolved same direction as our signal → would have been a WIN if we'd taken it
        byReason[r.reason].WIN++;
      } else {
        // Market resolved opposite → rejection saved us a LOSS
        byReason[r.reason].LOSS++;
      }
    }

    // Add false-positive rate (fpr) = WIN% among known outcomes
    for (const r of Object.values(byReason)) {
      const known = r.WIN + r.LOSS;
      r.fpr = known > 0 ? parseFloat((r.WIN / known * 100).toFixed(1)) : null;
    }

    res.json({ byReason, total: result.rows.length });
  } catch (err) {
    logger.error('[api] GET /t1000/rejected/stats error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/rejected — fetch rejected LIVE candidates (last 30 days, paginated) */
app.get('/t1000/rejected', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  ?? 1));
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit ?? 200)));
    const offset = (page - 1) * limit;

    const [result, countResult] = await Promise.all([
      query(
        `SELECT id, created_at, crypto, candle_size, direction, spike_pct, threshold,
                yes_ask, no_ask, entry_price, reason, details,
                cycle_start_ms, context_candles
         FROM t1000_rejected
         WHERE created_at > NOW() - INTERVAL '30 days'
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query(
        `SELECT COUNT(*) AS total FROM t1000_rejected WHERE created_at > NOW() - INTERVAL '30 days'`
      ),
    ]);

    // Load pm_outcomes once for outcome enrichment
    let pmOutcomes = {};
    try {
      const pmPath = require('path').join(__dirname, '../../cache/pm_outcomes.json');
      pmOutcomes = JSON.parse(require('fs').readFileSync(pmPath, 'utf8'));
    } catch { /* pm_outcomes not yet populated */ }

    const total = parseInt(countResult.rows[0].total);
    const rows  = result.rows.map(r => {
      const durationSec   = r.candle_size >= 150 ? 900 : 300;
      // Use precise cycle_start_ms when available; fall back to created_at-derived estimate
      const cycleStartSec = r.cycle_start_ms
        ? Math.floor(r.cycle_start_ms / 1000)
        : Math.floor(new Date(r.created_at).getTime() / 1000 / durationSec) * durationSec;
      const outcome = pmOutcomes[`${r.crypto}_${cycleStartSec}_${durationSec}`] ?? null;
      return { ...r, cycleStartSec, outcome };
    });

    res.json({ rows, total, page, pages: Math.ceil(total / limit), limit });
  } catch (err) {
    logger.error('[api] GET /t1000/rejected error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /t1000/rejected — clear all rejected candidates */
app.delete('/t1000/rejected', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM t1000_rejected');
    res.json({ ok: true });
  } catch (err) {
    logger.error('[api] DELETE /t1000/rejected error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** POST /t1000/verify-outcomes — apply outcome corrections from verify_outcomes cron */
app.post('/t1000/verify-outcomes', authMiddleware, (req, res) => {
  try {
    const { corrections, source } = req.body;
    if (!Array.isArray(corrections) || !corrections.length)
      return res.status(400).json({ error: 'corrections array required' });
    logger.info('[api] POST /t1000/verify-outcomes', { count: corrections.length, source });
    const result = t1000Engine.applyOutcomeCorrections(corrections);
    res.json(result);
  } catch (err) {
    logger.error('[api] POST /t1000/verify-outcomes error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** POST /t1000/live-sell — manually exit a LIVE open position */
app.post('/t1000/live-sell', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ error: 'tradeId required' });
    const result = await t1000Engine.sellLivePosition(tradeId);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    logger.error('[api] POST /t1000/live-sell error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/chart-data?candle=60&crypto=BTC&limit=500
 *  Returns CXX-second OHLC candles rebucketed from the 1-min Binance cache.
 *  Candles are epoch-aligned (time = floor(t / CXX) * CXX).
 *  Candles that contain a spike-detection cycle_start are annotated with
 *  spike_pct from the t1000_candles_Cxx.csv log; all others have spike_pct=0.
 */
app.get('/t1000/chart-data', async (req, res) => {
  try {
    const candleSize = parseInt(req.query.candle || '60', 10);
    const crypto     = (req.query.crypto || 'BTC').toUpperCase();
    const limit      = Math.min(parseInt(req.query.limit || '500', 10), 500);

    if (!VALID_CRYPTOS.has(crypto)) return res.status(400).json({ error: `Invalid crypto. Must be one of: ${[...VALID_CRYPTOS].join(', ')}` });
    if (!VALID_CANDLES.has(candleSize)) {
      return res.status(400).json({ error: `Invalid candle size. Must be one of: ${[...VALID_CANDLES].join(', ')}` });
    }

    const fs   = require('fs');
    const path = require('path');

    // ── Load 1-min Binance cache ──────────────────────────────────────────
    const cachePath = path.join(__dirname, '../../cache', `candles-1m-${crypto}USDT-5000.json`);
    let cacheData  = { candles: [] };
    if (fs.existsSync(cachePath)) {
      cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    }
    let rawCandles = cacheData.candles || [];

    // ── Refresh from Binance if cache is stale (last candle > 5 min old) ─
    const lastTs = rawCandles.length
      ? new Date(rawCandles[rawCandles.length - 1].timestamp).getTime()
      : 0;
    if (Date.now() - lastTs > 5 * 60 * 1000) {
      try {
        const axios       = require('axios');
        const binanceAxios = axios.create({ timeout: 8000, proxy: false });
        const symbolMap   = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', XRP: 'XRPUSDT' };
        const kRes = await binanceAxios.get('https://api.binance.com/api/v3/klines', {
          params: { symbol: symbolMap[crypto], interval: '1m', limit: 1000 },
        });
        const newCandles = kRes.data.map(k => ({
          timestamp   : new Date(k[0]).toISOString(),
          open        : parseFloat(k[1]),
          high        : parseFloat(k[2]),
          low         : parseFloat(k[3]),
          close       : parseFloat(k[4]),
          volume      : parseFloat(k[5]),
          movementPct : Math.abs((parseFloat(k[4]) - parseFloat(k[1])) / parseFloat(k[1]) * 100),
        }));
        // Merge: deduplicate by timestamp, keep most recent 5000
        const byTs = new Map(rawCandles.map(c => [c.timestamp, c]));
        for (const c of newCandles) byTs.set(c.timestamp, c);
        rawCandles = [...byTs.values()].sort((a, b) => a.timestamp < b.timestamp ? -1 : 1).slice(-5000);
        cacheData.candles = rawCandles;
        fs.writeFileSync(cachePath, JSON.stringify(cacheData), 'utf8');
        logger.info(`[api] chart-data cache refreshed for ${crypto}: ${rawCandles.length} candles`);
      } catch (fetchErr) {
        logger.warn(`[api] chart-data Binance fetch failed, using stale cache`, { error: fetchErr.message });
      }
    }

    // ── Rebucket 1-min candles into CXX-second windows (cycle-aligned) ───
    // Buckets are aligned to 5m (CXX<150) or 15m (CXX>=150) cycle boundaries,
    // so each chart candle matches exactly what the trading engine saw.
    // Partial last buckets (< CXX seconds before cycle end) are discarded.
    const cycleSecs = candleSize >= 150 ? 900 : 300;
    const buckets = new Map(); // bucketTimeSec → { open, high, low, close }
    for (const c of rawCandles) {
      const tMs          = new Date(c.timestamp).getTime();
      const cycleStartMs = Math.floor(tMs / (cycleSecs * 1000)) * (cycleSecs * 1000);
      const offsetMs     = tMs - cycleStartMs;
      const bucketN      = Math.floor(offsetMs / (candleSize * 1000));
      // Skip partial bucket: would extend past cycle end
      if ((bucketN + 1) * candleSize > cycleSecs) continue;
      const bTime = Math.floor(cycleStartMs / 1000) + bucketN * candleSize;
      if (!buckets.has(bTime)) {
        buckets.set(bTime, { open: c.open, high: c.high, low: c.low, close: c.close });
      } else {
        const b = buckets.get(bTime);
        b.high  = Math.max(b.high, c.high);
        b.low   = Math.min(b.low, c.low);
        b.close = c.close; // last 1-min candle in bucket = bucket close
      }
    }

    // ── Sub-candle CSV override ───────────────────────────────────────────
    // The rebucketed 1-min klines can extend past the actual snapshot time.
    // Example: C80 bucket 0 contains the T+0 AND T+60 klines; the T+60 kline
    // closes at T+120s (40s after the C80 snapshot at T+80s), so the bucket
    // close/low/high can reflect price moves that happened after the snapshot.
    // Fix: override T+0 bucket OHLC with the accurate sub-candle CSV data.
    const spikePctByBucket = new Map();
    const csvPath = path.join(__dirname, '../../logs', `t1000_candles_C${candleSize}.csv`);
    if (fs.existsSync(csvPath)) {
      const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
      if (lines.length > 1) {
        const headers = lines[0].split(',');
        for (const line of lines.slice(1)) {
          const v = line.split(',');
          const r = Object.fromEntries(headers.map((h, i) => [h, v[i]]));
          if (r.crypto !== crypto || !r.cycle_start || !r.spike_pct) continue;
          const tMs          = new Date(r.cycle_start).getTime();
          const cycleStartMs = Math.floor(tMs / (cycleSecs * 1000)) * (cycleSecs * 1000);
          const bTime        = Math.floor(cycleStartMs / 1000); // bucketN=0 = cycle start
          spikePctByBucket.set(bTime, parseFloat(r.spike_pct));
          // Override T+0 bucket OHLC with actual sub-candle snapshot data
          if (buckets.has(bTime) && r.open && r.high && r.low && r.close) {
            const b = buckets.get(bTime);
            b.open  = parseFloat(r.open);
            b.high  = parseFloat(r.high);
            b.low   = parseFloat(r.low);
            b.close = parseFloat(r.close);
          }
        }
      }
    }

    // ── Build output: most recent `limit` candles ─────────────────────────
    const candles = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(-limit)
      .map(([bTime, ohlc]) => ({
        time      : bTime,
        open      : ohlc.open,
        high      : ohlc.high,
        low       : ohlc.low,
        close     : ohlc.close,
        spike_pct : spikePctByBucket.get(bTime) ?? 0,
      }));

    res.json({ candles, crypto, candle_size: candleSize });
  } catch (err) {
    logger.error('[api] GET /t1000/chart-data error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/validation — query spike_t1_validation table */
app.get('/t1000/validation', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit || '200', 10), 1000);
    const cryptoRaw = req.query.crypto ? req.query.crypto.toUpperCase() : null;
    const candleRaw = req.query.candle ? parseInt(req.query.candle, 10) : null;

    if (cryptoRaw && !VALID_CRYPTOS.has(cryptoRaw)) {
      return res.status(400).json({ error: `Invalid crypto. Must be one of: ${[...VALID_CRYPTOS].join(', ')}` });
    }
    if (candleRaw && !VALID_CANDLES.has(candleRaw)) {
      return res.status(400).json({ error: `Invalid candle size. Must be one of: ${[...VALID_CANDLES].join(', ')}` });
    }
    const crypto = cryptoRaw;
    const candle = candleRaw;

    const conditions = [];
    const params = [];
    if (crypto) { params.push(crypto); conditions.push(`crypto = $${params.length}`); }
    if (candle) { params.push(candle); conditions.push(`candle_size = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    params.push(limit);
    const rows = await query(
      `SELECT * FROM spike_t1_validation ${where} ORDER BY timestamp DESC LIMIT $${params.length}`,
      params
    );

    // Summary stats
    const statsRes = await query(`
      SELECT
        candle_size,
        COUNT(*) FILTER (WHERE outcome NOT IN ('SKIP_PRICE','SKIP_LIQUIDITY')) AS eligible,
        COUNT(*) FILTER (WHERE outcome = 'WIN')  AS wins,
        COUNT(*) FILTER (WHERE outcome = 'LOSS') AS losses,
        COUNT(*) FILTER (WHERE outcome = 'SKIP_PRICE')     AS skip_price,
        COUNT(*) FILTER (WHERE outcome = 'SKIP_LIQUIDITY') AS skip_liq,
        COUNT(*) FILTER (WHERE outcome = 'PENDING')        AS pending,
        ROUND(AVG(entry_price) FILTER (WHERE outcome IN ('WIN','LOSS')) * 100, 1) AS avg_entry_cents,
        ROUND(AVG(pnl_pct) FILTER (WHERE outcome = 'WIN'), 2)  AS avg_win_pct,
        ROUND(AVG(pnl_pct) FILTER (WHERE outcome = 'LOSS'), 2) AS avg_loss_pct
      FROM spike_t1_validation
      GROUP BY candle_size ORDER BY candle_size
    `);

    res.json({ rows: rows.rows, stats: statsRes.rows, total: rows.rowCount });
  } catch (err) {
    logger.error('[api] GET /t1000/validation error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/wallets — per-wallet summary (balance, W/L/PNL, CB state) */
app.get('/t1000/wallets', (req, res) => {
  try {
    const state = t1000Engine.getState();
    const liveWallets = state?.LIVE?.wallets ?? null;
    res.json({ wallets: liveWallets ?? [] });
  } catch (err) {
    logger.error('[api] GET /t1000/wallets error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/live-trades — paginated trade history from t1000_live_trades table */
app.get('/t1000/live-trades', async (req, res) => {
  try {
    const page       = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit      = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const strategyParam = req.query.strategy || 'LIVE';
    const strategies = strategyParam.split(',').map(s => s.trim()).filter(Boolean);
    const hideFailed = req.query.hideFailed === '1' || req.query.hideFailed === 'true';
    const walletFilter = req.query.wallet || null;
    const offset     = (page - 1) * limit;

    const whereParts  = [`strategy = ANY($1::text[])`];
    const whereParams = [strategies]; // $1 always = strategies
    let   nextParam   = 2;

    if (hideFailed)   whereParts.push(`status <> 'FAILED'`);
    if (walletFilter) {
      whereParts.push(`wallet_id = $${nextParam}`);
      whereParams.push(walletFilter);
      nextParam++;
    }
    const whereClause = 'WHERE ' + whereParts.join(' AND ');

    const countRes = await query(
      `SELECT COUNT(*) FROM t1000_live_trades ${whereClause}`,
      whereParams
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const tradesRes = await query(
      `SELECT trade_id, strategy, crypto, candle_size, direction, spike_pct,
              entry_price, signal_price, order_limit_price, position_usd, status, pnl_usd,
              cycle_start, redeemed, trade_time, context_candles, body_ratio, wallet_id, threshold,
              SUM(pnl_usd) OVER (PARTITION BY strategy ORDER BY trade_time ASC
                                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_pnl
       FROM t1000_live_trades
       ${whereClause}
       ORDER BY trade_time DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      [...whereParams, limit, offset]
    );

    res.json({ total, page, limit, pages: Math.ceil(total / limit), trades: tradesRes.rows });
  } catch (err) {
    logger.error('[api] GET /t1000/live-trades error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/signal-stats — scatter chart data for each crypto/candle pair */
app.get('/t1000/signal-stats', async (req, res) => {
  try {
    const pairsRaw = (req.query.pairs || '').split(',').filter(Boolean);
    let fromMs = req.query.from ? parseInt(req.query.from, 10) : null;
    let toMs   = req.query.to   ? parseInt(req.query.to,   10) : null;
    if (!fromMs || !toMs) { toMs = Date.now(); fromMs = toMs - 86400000; }
    fromMs = Math.max(fromMs, Date.now() - 90 * 86400000); // clamp to 90 days back
    toMs   = Math.min(toMs,   Date.now() + 3600000);       // clamp to 1h ahead
    const result = {};
    for (const pair of pairsRaw) {
      // pair format: "BTC:5m:0.29:0.05:0.89" (crypto:tf:threshold:minP:maxP)
      const parts = pair.split(':');
      const [crypto, tf] = parts;
      if (!crypto || !['5m','15m'].includes(tf)) continue;
      const is15m      = tf === '15m';
      const sizeClause = is15m ? 'candle_size >= 150' : 'candle_size < 150';
      const threshold  = parseFloat(parts[2]) || 0;
      const minP       = parseFloat(parts[3]) || 0;
      const maxP       = parseFloat(parts[4]) || 1;
      const key        = `${crypto}:${tf}`;

      const parseR = r => ({
        ts          : Number(r.ts),
        candle_size : r.candle_size ? parseInt(r.candle_size, 10) : null,
        spike_pct   : r.spike_pct   != null ? parseFloat(r.spike_pct)   : null,
        entry_price : r.entry_price != null ? parseFloat(r.entry_price) : null,
        body_ratio  : r.body_ratio  != null ? parseFloat(r.body_ratio)  : null,
        reason      : r.reason,
      });

      // Primary source: spike_t1_validation — logs every candle regardless of strategy
      // Reason is derived from spike size and market price vs threshold/minP/maxP
      const [raw, trades] = await Promise.all([
        query(`SELECT
                 EXTRACT(EPOCH FROM timestamp)*1000 AS ts,
                 candle_size,
                 spike_pct,
                 CASE WHEN spike_direction='UP' THEN t1_yes_ask ELSE t1_no_ask END AS entry_price,
                 NULL::numeric AS body_ratio,
                 CASE
                   WHEN outcome IN ('WIN','LOSS') THEN outcome
                   WHEN outcome = 'SKIP_PRICE'     THEN 'price_too_high'
                   WHEN outcome = 'SKIP_LIQUIDITY' THEN 'no_liquidity'
                   WHEN ABS(spike_pct) < $4        THEN 'below_threshold'
                   WHEN (CASE WHEN spike_direction='UP' THEN t1_yes_ask ELSE t1_no_ask END) < $5 THEN 'price_too_low'
                   WHEN (CASE WHEN spike_direction='UP' THEN t1_yes_ask ELSE t1_no_ask END) > $6 THEN 'price_too_high'
                   ELSE 'below_threshold'
                 END AS reason
               FROM spike_t1_validation
               WHERE crypto = $1 AND ${sizeClause}
                 AND timestamp BETWEEN to_timestamp($2::bigint/1000.0) AND to_timestamp($3::bigint/1000.0)
               ORDER BY timestamp`, [crypto, fromMs, toMs, threshold, minP, maxP]),
        // Actual live trades (green dots, may include body_ratio)
        query(`SELECT EXTRACT(EPOCH FROM trade_time)*1000 AS ts,
                      candle_size, spike_pct, entry_price, body_ratio, status AS reason
               FROM t1000_live_trades
               WHERE crypto = $1 AND ${sizeClause}
                 AND trade_time BETWEEN to_timestamp($2::bigint/1000.0) AND to_timestamp($3::bigint/1000.0)
               ORDER BY trade_time`, [crypto, fromMs, toMs]),
      ]);

      // Build trade lookup by (candle_size, 10s time bucket) — trades override raw dots
      const tradeMap = new Map();
      for (const t of trades.rows) {
        const bucket = Math.round(Number(t.ts) / 10000);
        tradeMap.set(`${t.candle_size}_${bucket}`, parseR(t));
      }
      const merged = [];
      for (const r of raw.rows) {
        const bucket = Math.round(Number(r.ts) / 10000);
        const trade  = tradeMap.get(`${r.candle_size}_${bucket}`);
        if (trade) { merged.push(trade); tradeMap.delete(`${r.candle_size}_${bucket}`); }
        else        { merged.push(parseR(r)); }
      }
      for (const t of tradeMap.values()) merged.push(t); // trades with no raw match
      result[key] = merged.sort((a, b) => a.ts - b.ts);
    }
    res.json(result);
  } catch (err) {
    logger.error('[api] GET /t1000/signal-stats error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * Build extra simulate_combined.js args that mirror the current LIVE engine config.
 * This ensures autoscan sweeps use the same t1Mode, minPrice, CB, and maxPositions
 * as the live engine — so the optimal Cxx/threshold found matches what the engine uses.
 */
function buildLiveAutoscanArgs() {
  const args = [];
  try {
    const live = t1000Engine.getState()['LIVE'] || {};
    if (live.t1Mode) args.push('-t1');
    const mn = Math.round((live.minPrice5m ?? 0.05) * 100);
    if (mn !== 5) args.push('-mn', String(mn));
    // CB intentionally excluded: period-sweep autoscan must not have CB active —
    // it reduces trades-per-period to noise levels and biases the candle-size ranking.
    const maxPos = live.maxPositions ?? 4;
    if (maxPos !== 4) args.push('-maxpos', String(maxPos));
    if (live.drawdownLimitEnabled && (live.drawdownLimitMaxLosses ?? 0) > 0
        && (live.drawdownLimitWindowMins ?? 0) > 0) {
      const dlP = (live.drawdownLimitPauseMins ?? 0) > 0 ? `,${live.drawdownLimitPauseMins}` : '';
      args.push('-dl', `${live.drawdownLimitMaxLosses},${live.drawdownLimitWindowMins}${dlP}`);
    }
  } catch { /* engine not yet ready — use simulator defaults */ }
  return args;
}

/** POST /t1000/run-autoscan — run simulate_combined.js -nf -as to refresh autoscan JSON */
app.post('/t1000/run-autoscan', authMiddleware, (req, res) => {
  const { execFile } = require('child_process');
  const scriptPath = require('path').join(__dirname, '../../scripts/simulate_combined.js');
  const args = ['--stack-size=65536', scriptPath, '-nf', '-as', ...buildLiveAutoscanArgs()];
  // Locked per-crypto thresholds — fix those in the trio sweep
  const { lockTh5m, lockTh15m } = req.body || {};
  if (lockTh5m && typeof lockTh5m === 'object' && Object.keys(lockTh5m).length)
    args.push('-lockth5m', Object.entries(lockTh5m).map(([c,v]) => `${c}:${v}`).join(','));
  if (lockTh15m && typeof lockTh15m === 'object' && Object.keys(lockTh15m).length)
    args.push('-lockth15m', Object.entries(lockTh15m).map(([c,v]) => `${c}:${v}`).join(','));
  execFile(process.execPath, args,
    { cwd: require('path').join(__dirname, '../../'), env: process.env, timeout: 120_000 },
    (err, stdout, stderr) => {
      if (err) {
        logger.error('[api] run-autoscan failed', { error: err.message });
        return res.status(500).json({ error: err.message });
      }
      logger.info('[api] run-autoscan complete');
      // Auto-apply best strategy from autoscan to LIVE state so backfill is never needed
      // just to fix a stale strategy after autoscan runs.
      try {
        const _fs          = require('fs');
        const _path        = require('path');
        const autoscanPath = _path.join(__dirname, '../../logs/autoscan_v2.json');
        const statePath    = _path.join(__dirname, '../../../logs/t1000-state.json');
        const scan = JSON.parse(_fs.readFileSync(autoscanPath, 'utf8'));
        const st   = JSON.parse(_fs.readFileSync(statePath, 'utf8'));
        const live = st['LIVE'] || {};
        let changed = false;
        if (scan.best5m  && scan.best5m.period  && live.strategy5m  !== scan.best5m.period)  { live.strategy5m  = scan.best5m.period;  changed = true; }
        if (scan.best15m && scan.best15m.period && live.strategy15m !== scan.best15m.period) { live.strategy15m = scan.best15m.period; changed = true; }
        if (changed) {
          st['LIVE'] = live;
          _fs.writeFileSync(statePath, JSON.stringify(st, null, 2));
          t1000Engine.loadState();
          logger.info('[api] run-autoscan: LIVE strategy auto-updated', { strategy5m: live.strategy5m, strategy15m: live.strategy15m });
        }
      } catch (syncErr) {
        logger.warn('[api] run-autoscan: strategy sync skipped (non-fatal)', { error: syncErr.message });
      }
      res.json({ ok: true });
    }
  );
});

const AUTOSCAN_7D_PATH = require('os').tmpdir() + '/autoscan_7d.json';

/** POST /t1000/run-autoscan-7d — run simulator with last 7d of data, write to temp file */
app.post('/t1000/run-autoscan-7d', authMiddleware, (req, res) => {
  const { execFile } = require('child_process');
  const scriptPath = require('path').join(__dirname, '../../scripts/simulate_combined.js');
  const dateFrom   = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10);
  execFile(process.execPath, ['--stack-size=65536', scriptPath, '-nf', '-as', '-df', dateFrom, '-wr', AUTOSCAN_7D_PATH, ...buildLiveAutoscanArgs()],
    { cwd: require('path').join(__dirname, '../../'), env: process.env, timeout: 120_000 },
    (err) => {
      if (err) {
        logger.error('[api] run-autoscan-7d failed', { error: err.message });
        return res.status(500).json({ error: err.message });
      }
      logger.info('[api] run-autoscan-7d complete');
      res.json({ ok: true });
    }
  );
});

/** GET /t1000/deepscan — returns deepscan_v2.json */
app.get('/t1000/deepscan', (req, res) => {
  try {
    const data = JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '../../logs/deepscan_v2.json'), 'utf8'));
    res.json(data);
  } catch {
    res.status(404).json({ error: 'deepscan_v2.json not found — run Deep Scan first' });
  }
});

/** POST /t1000/run-deepscan — greedy forward selection of optimal filter settings */
app.post('/t1000/run-deepscan', authMiddleware, (req, res) => {
  const { execFile } = require('child_process');
  const scriptPath = require('path').join(__dirname, '../../scripts/simulate_combined.js');
  const ultra    = req.body?.ultra    === true;
  const extended = req.body?.extended === true;
  const thorough = req.body?.thorough === true;
  const fine     = req.body?.fine === true || thorough;
  const dsFlag   = ultra ? '-ds-ultra' : extended ? '-ds-ext' : thorough ? '-ds-thorough' : fine ? '-ds-fine' : '-ds';
  const args = ['--stack-size=65536', scriptPath, '-nf', dsFlag, ...buildLiveAutoscanArgs()];
  execFile(process.execPath, args,
    { cwd: require('path').join(__dirname, '../../'), env: process.env, timeout: ultra ? 3_600_000 : extended ? 1_800_000 : thorough ? 900_000 : fine ? 600_000 : 360_000 },
    (err) => {
      if (err) {
        logger.error('[api] run-deepscan failed', { error: err.message });
        return res.status(500).json({ error: err.message });
      }
      logger.info('[api] run-deepscan complete');
      try {
        const result = JSON.parse(require('fs').readFileSync(
          require('path').join(__dirname, '../../logs/deepscan_v2.json'), 'utf8'));
        res.json({ ok: true, result });
      } catch {
        res.json({ ok: true });
      }
    }
  );
});

/** GET /t1000/autoscan-7d — return last 7d autoscan results */
app.get('/t1000/autoscan-7d', (req, res) => {
  try {
    const data = JSON.parse(require('fs').readFileSync(AUTOSCAN_7D_PATH, 'utf8'));
    res.json(data);
  } catch {
    res.status(404).json({ error: '7d autoscan not yet run — click "Score 7d" in SETUP' });
  }
});

// ─── Simulator UI routes ──────────────────────────────────────────────────────

const SIM_SETTINGS_PATH = require('path').join(__dirname, '../../data/simulator_settings.json');

/** GET /simulator/settings — return stored simulator UI settings */
app.get('/simulator/settings', (req, res) => {
  try {
    const data = JSON.parse(require('fs').readFileSync(SIM_SETTINGS_PATH, 'utf8'));
    res.json(data);
  } catch {
    res.json({});
  }
});

/** POST /simulator/settings — persist simulator UI settings to disk */
app.post('/simulator/settings', authMiddleware, (req, res) => {
  try {
    const dir = require('path').dirname(SIM_SETTINGS_PATH);
    const fss = require('fs');
    if (!fss.existsSync(dir)) fss.mkdirSync(dir, { recursive: true });
    fss.writeFileSync(SIM_SETTINGS_PATH, JSON.stringify(req.body || {}, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const SIM_V2_SETTINGS_PATH = require('path').join(__dirname, '../../data/simulator_v2_settings.json');

/** GET /simulator/v2/settings — return stored V2+ simulator UI settings */
app.get('/simulator/v2/settings', (req, res) => {
  try { res.json(JSON.parse(require('fs').readFileSync(SIM_V2_SETTINGS_PATH, 'utf8'))); }
  catch { res.json({}); }
});

/** POST /simulator/v2/settings — persist V2+ simulator UI settings to disk */
app.post('/simulator/v2/settings', authMiddleware, (req, res) => {
  try {
    require('fs').writeFileSync(SIM_V2_SETTINGS_PATH, JSON.stringify(req.body || {}, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const SIM_HISTORY_PATH = require('path').join(__dirname, '../../data/simulator_history.json');
const fssH = require('fs');

/** GET /simulator/history — return saved sim-history array */
app.get('/simulator/history', (req, res) => {
  try { res.json(JSON.parse(fssH.readFileSync(SIM_HISTORY_PATH, 'utf8'))); }
  catch { res.json([]); }
});

/** POST /simulator/save-history — prepend entry { settings, metrics } (max 30) */
app.post('/simulator/save-history', authMiddleware, (req, res) => {
  try {
    let hist = [];
    try { hist = JSON.parse(fssH.readFileSync(SIM_HISTORY_PATH, 'utf8')); } catch {}
    hist.unshift({ savedAt: new Date().toISOString(), ...req.body });
    if (hist.length > 30) hist.length = 30;
    fssH.writeFileSync(SIM_HISTORY_PATH, JSON.stringify(hist, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /simulator/history/delete — remove entry by index */
app.post('/simulator/history/delete', authMiddleware, (req, res) => {
  try {
    let hist = [];
    try { hist = JSON.parse(fssH.readFileSync(SIM_HISTORY_PATH, 'utf8')); } catch {}
    const i = parseInt(req.body?.index);
    if (!isNaN(i) && i >= 0 && i < hist.length) hist.splice(i, 1);
    fssH.writeFileSync(SIM_HISTORY_PATH, JSON.stringify(hist, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET /simulator/last-result — return last saved simulator result */
app.get('/simulator/last-result', (req, res) => {
  try {
    const data = JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '../../data/simulator_last_result.json'), 'utf8'));
    res.json(data);
  } catch {
    res.json({});
  }
});

/** POST /simulator/run — run simulate_combined.js with given options, return structured JSON */
app.post('/simulator/run', authMiddleware, (req, res) => {
  const { execFile } = require('child_process');
  const os  = require('os');
  const fss = require('fs');
  const scriptPath  = require('path').join(__dirname, '../../scripts/simulate_combined.js');
  const jsonOutPath = require('path').join(os.tmpdir(), `sim_result_${Date.now()}.json`);

  const body = req.body || {};
  const useAutoscan = body.autoscan !== false;  // default true; false = fast triomap mode

  // Build base args: full autoscan OR fast triomap from saved autoscan_v2.json
  let v2data = null;
  let t5 = {}, t15 = {};
  const args = ['--stack-size=65536', scriptPath];
  if (useAutoscan) {
    args.push('-as', '-nf');
  } else {
    const autoscanPath = require('path').join(__dirname, '../../logs/autoscan_v2.json');
    try { v2data = JSON.parse(fss.readFileSync(autoscanPath, 'utf8')); } catch {}
    // Use body-supplied trios if provided (user tweaked them in UI), else fall back to saved autoscan
    t5 = body.trio5m || v2data?.trio5m || {}; t15 = body.trio15m || v2data?.trio15m || {};
    const parts = [];
    for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
      if (t5[cr])  parts.push(`${cr}:${t5[cr].period}:${t5[cr].th}`);
      if (t15[cr]) parts.push(`${cr}:${t15[cr].period}:${t15[cr].th}`);
    }
    if (!parts.length) return res.status(400).json({ error: 'No saved autoscan trios. Run full autoscan first.' });
    args.push('-triomap', parts.join(','), '-nf');
  }

  if (body.bl     != null) args.push('-bl',     String(body.bl));
  if (body.rk     != null) args.push('-rk',     String(body.rk));
  if (body.mn     != null) args.push('-mn',     String(body.mn));
  if (body.mx     != null) args.push('-mx',     String(body.mx));
  if (body.th     != null) args.push('-th',     String(body.th));
  if (body.maxpos != null) args.push('-maxpos', String(body.maxpos));
  if (body.slip   != null) args.push('-slip',   String(body.slip));
  if (body.body   != null) args.push('-body',   String(body.body));
  if (body.minwr  != null) args.push('-minwr',  String(body.minwr));
  if (body.minth  != null) args.push('-minth',  String(body.minth));
  if (body.tp     != null) args.push('-tp',     String(body.tp));
  if ('t1standalone' in body || 't1Mode' in body) {
    // New two-field model (SIM2): t1standalone=T1, t1Mode=TC
    const hasT1 = !!body.t1standalone, hasTC = !!body.t1Mode;
    if      (hasT1 && hasTC) args.push('-t1both');
    else if (hasT1)          args.push('-t1both', '-tcoff');
    else if (hasTC)          args.push('-t1');
  } else {
    // Classic SIM model
    if (body.t1both)                     args.push('-t1both');
    else if (body.t1tc)                  args.push('-t1tc');
    else if (body.t1)                    args.push('-t1');
    else if (body.t1_5m && body.t1_15m) args.push('-t1');
    else if (body.t1_5m)                 args.push('-t15m');
    else if (body.t1_15m)                args.push('-t115m');
  }
  // Never disable T0 in autoscan (full or fast): T1/TC entries need 1-min Binance candle
  // data that covers only the last ~3.5 days. Historical signals have sig.t1=null → 0 trades.
  // Autoscan always runs T0 mode to score the full dataset for period/threshold selection.
  // t0off is a LIVE trading preference — never applied to sweep/backtest scoring.
  // (full autoscan: useAutoscan=true — fast scan: useAutoscan=false — both excluded here)
  if (body.t1off)          args.push('-t1off');
  if (body.tcoff)          args.push('-tcoff');
  if (body.nth)            args.push('-nth');
  if (body.t1adj  != null) args.push('-t1adj',  String(body.t1adj));
  if (body.t2)             args.push('-t2');
  if (body.t2adj  != null) args.push('-t2adj',  String(body.t2adj));
  if (body.df)             args.push('-df',     String(body.df));
  if (body.dt)             args.push('-dt',     String(body.dt));
  if (body.cr)             args.push('-cr',     String(body.cr));
  if (body.day    != null) args.push('-day',    String(body.day));
  if (body.kal)            args.push('-kal');
  if (body.cb     != null && body.cb > 0)   args.push('-cb',   String(body.cb));
  if (body.dl_n   != null && body.dl_n > 0 && body.dl_h != null && body.dl_h > 0) {
    const dlP = body.dl_p != null && body.dl_p > 0 ? `,${body.dl_p}` : '';
    args.push('-dl', `${body.dl_n},${body.dl_h}${dlP}`);
  }
  if (body.mxt1       != null && body.mxt1       > 0) args.push('-mxt1',       String(body.mxt1));
  if (body.distmin5m  != null && body.distmin5m  > 0) args.push('-distmin5m',  String(body.distmin5m));
  if (body.distmin15m != null && body.distmin15m > 0) args.push('-distmin15m', String(body.distmin15m));
  if (body.distdrop   != null)                        args.push('-distdrop',   String(body.distdrop));
  for (const cr of ['BTC','ETH','SOL','XRP']) {
    const v = body[`vol_${cr.toLowerCase()}`];
    if (v != null && v > 0) args.push(`-vol-${cr}`, String(v));
  }
  if (body.oor) args.push('-oor');
  if (body.exhaust5m  != null && body.exhaust5m  > 0) args.push('-exhaust5m',  String(body.exhaust5m));
  if (body.exhaust15m != null && body.exhaust15m > 0) args.push('-exhaust15m', String(body.exhaust15m));
  if (body.dir        != null && body.dir !== 'both') args.push('-dir',         String(body.dir));
  if (body.skipHours  != null && body.skipHours !== '') args.push('-skip-hours', String(body.skipHours));
  if (body.skipDow    != null && body.skipDow   !== '') args.push('-skip-dow',   String(body.skipDow));
  if (body.coord      != null && body.coord      > 0)   args.push('-coord',     String(body.coord));
  if (body.bots       != null && parseInt(body.bots) > 1) {
    args.push('--bots', String(body.bots));
    if (body.botBalances) args.push('--bot-balances', String(body.botBalances));
  }

  args.push('-json-out', jsonOutPath);

  execFile(process.execPath, args,
    { cwd: require('path').join(__dirname, '../../'), env: process.env, timeout: 180_000 },
    (err, stdout, stderr) => {
      let result = null;
      try { result = JSON.parse(fss.readFileSync(jsonOutPath, 'utf8')); } catch {}
      try { fss.unlinkSync(jsonOutPath); } catch {}
      if (err && !result) {
        logger.error('[api] simulator/run failed', { error: err.message });
        return res.status(500).json({ error: err.message, stderr: (stderr || '').slice(0, 500) });
      }
      if (result) {
        // In fast (triomap) mode, inject autoscan5m/15m from saved autoscan_v2.json so
        // applyToLive() can still read best periods and per-crypto trios.
        // Per-crypto stats (wins/losses/pnl/score) are computed from the actual trades.
        if (!useAutoscan && v2data) {
          const trades = result.unified?.trades || [];
          const mkTop = (best) => best ? { period: parseInt(String(best.period).replace('C', '')), th: best.th, mn: best.mn, mx: best.mx } : undefined;
          const mkTrios = (trio, is15m, quartet) => {
            const out = {};
            for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
              if (!trio?.[cr]) continue;
              const period = parseInt(String(trio[cr].period).replace('C', ''));
              const crTrades = trades.filter(t => t.crypto === cr && (is15m ? t.period >= 150 : t.period < 150));
              const wins   = crTrades.filter(t => t.outcome === 'WIN').length;
              const losses = crTrades.filter(t => t.outcome === 'LOSS').length;
              const total  = wins + losses;
              const pnl    = parseFloat(crTrades.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2));
              const score  = parseFloat((wins / (total + 3)).toFixed(4));
              const q = quartet?.[cr];
              out[cr] = { period, th: trio[cr].th, wins, losses, total, pnl, score,
                mnUP: q?.UP?.mn   ?? null, mnDN: q?.DOWN?.mn ?? null,
                mxUP: q?.UP?.mx   ?? null, mxDN: q?.DOWN?.mx ?? null,
                // per-direction Cxx/th — for UI display ("quartet" columns)
                periodUP: q?.UP?.period ?? null,   thUP: q?.UP?.th   ?? null,
                periodDN: q?.DOWN?.period ?? null, thDN: q?.DOWN?.th ?? null };
            }
            return out;
          };
          if (!result.autoscan5m  && v2data.best5m)  result.autoscan5m  = { top: mkTop(v2data.best5m),  trios: mkTrios(t5,  false, v2data.quartet5m)  };
          if (!result.autoscan15m && v2data.best15m) result.autoscan15m = { top: mkTop(v2data.best15m), trios: mkTrios(t15, true,  v2data.quartet15m) };
          // Inject Kalshi top (best15m) from autoscan_kalshi.json so the header shows the period + score.
          // wins/losses/pnl/trios come from the simulator (autoscanKalshi already in result).
          if (result.autoscanKalshi) {
            try {
              const kalPath = require('path').join(__dirname, '../../logs/autoscan_kalshi.json');
              const kd = JSON.parse(fss.readFileSync(kalPath, 'utf8'));
              if (kd.best15m && !result.autoscanKalshi.top) {
                result.autoscanKalshi.top = mkTop(kd.best15m);
              }
            } catch {}
          }
        }
        // After autoscan: sync trio5m/trio15m in autoscan_v2.json to match SIM2 display
        // trios (printTrioSweep result in result.autoscan5m.trios). The script writes
        // trioMxBest which diverges from printTrioSweep in D2 mode, causing "Apply SIM2
        // Autoscan" to show stale values. Override with display values so both agree.
        if (useAutoscan) {
          try {
            // Sync trio5m/trio15m in autoscan_v2.json with per-crypto optimal periods.
            // Coord check uses cycleStartMs (cycle boundary), not signal detection time —
            // BTC:C65 and SOL:C91 in the same cycle both count for coordination.
            // Per-crypto periods give better WR than forcing a uniform global period.
            const autoscanPath = require('path').join(__dirname, '../../logs/autoscan_v2.json');
            const v2 = JSON.parse(fss.readFileSync(autoscanPath, 'utf8'));
            for (const [cr, row] of Object.entries(result.autoscan5m?.trios || {})) {
              if (!row) continue;
              const mx = v2.trio5m?.[cr]?.mx ?? v2.best5m?.mx ?? 0.89;
              if (!v2.trio5m) v2.trio5m = {};
              v2.trio5m[cr] = { period: row.period, th: row.th, mx };
            }
            for (const [cr, row] of Object.entries(result.autoscan15m?.trios || {})) {
              if (!row) continue;
              const mx = v2.trio15m?.[cr]?.mx ?? v2.best15m?.mx ?? 0.85;
              if (!v2.trio15m) v2.trio15m = {};
              v2.trio15m[cr] = { period: row.period, th: row.th, mx };
            }
            fss.writeFileSync(autoscanPath, JSON.stringify(v2, null, 2));
          } catch {}
        }
        try {
          const lastPath = require('path').join(__dirname, '../../data/simulator_last_result.json');
          fss.writeFileSync(lastPath, JSON.stringify({ result, params: body, ts: new Date().toISOString() }));
        } catch {}
      }
      res.json({ ok: true, result });
    }
  );
});

/** POST /t1000/backfill — re-run backfill script and reload engine state */
app.post('/t1000/backfill', authMiddleware, (req, res) => {
  const { execFile } = require('child_process');
  const scriptPath = require('path').join(__dirname, '../../scripts/backfill_t1000.js');
  const maxPrice   = parseInt(req.body?.maxPrice, 10);
  const env        = {
    ...process.env,
    // Always skip internal rescan: the UI button applies the autoscan the user
    // already ran (via SIM2). Re-running with CB args produces different/worse
    // results and overwrites the user's autoscan_v2.json.
    BACKFILL_SKIP_RESCAN: '1',
    ...(maxPrice >= 50 && maxPrice <= 99 ? { BACKFILL_MAX_PRICE_CAP: String(maxPrice) } : {}),
  };
  execFile(process.execPath, [scriptPath], { cwd: require('path').join(__dirname, '../../'), env }, (err, stdout, stderr) => {
    if (err) {
      logger.error('[api] Backfill failed', { error: err.message });
      return res.status(500).json({ error: err.message, stderr });
    }
    t1000Engine.loadState();
    logger.info('[api] Backfill complete, state reloaded');
    res.json({ ok: true });
  });
});

/** GET /t1000/candles — latest partial OHLC for all cryptos */
app.get('/t1000/candles', (req, res) => {
  try {
    res.json(subCandleGen.getLatestCandles());
  } catch (err) {
    logger.error('[api] GET /t1000/candles error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Withdrawal routes ────────────────────────────────────────────────────────

// PIN rate limiter — max 1 attempt per second per IP (in-memory)
const _wdPinLastAttempt = new Map();
function wdPinRateLimit(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const last = _wdPinLastAttempt.get(ip) || 0;
  if (now - last < 1000) {
    return res.status(429).json({ error: 'Rate limited — wait 1 second between attempts' });
  }
  _wdPinLastAttempt.set(ip, now);
  next();
}

// Inline PIN check middleware — verifies req.body.pin before mutating withdrawal state
function wdPinCheck(req, res, next) {
  const { pin } = req.body || {};
  if (!withdrawal.verifyPin(String(pin ?? ''))) {
    return res.status(403).json({ error: 'Incorrect PIN' });
  }
  next();
}

// GET /withdrawal/wallet — returns the full unmasked destination wallet (auth required)
app.get('/withdrawal/wallet', authMiddleware, (req, res) => {
  const cfg = withdrawal.loadConfig();
  res.json({ destinationWallet: cfg.destinationWallet || '' });
});

// GET /withdrawal/history — full history with wallet + txHash (auth required)
app.get('/withdrawal/history', authMiddleware, (req, res) => {
  const cfg = withdrawal.loadConfig();
  res.json({
    totalWithdrawn:  cfg.totalWithdrawn  || 0,
    withdrawalCount: cfg.withdrawalCount || 0,
    history:         cfg.withdrawalHistory || [],
  });
});

// GET /withdrawal/config — returns config with masked wallet (full wallet never sent to client)
app.get('/withdrawal/config', (req, res) => {
  const cfg = withdrawal.loadConfig();
  const masked = cfg.destinationWallet
    ? cfg.destinationWallet.slice(0, 6) + '…' + cfg.destinationWallet.slice(-4)
    : '';
  // Omit destinationWallet (full) and withdrawalHistory (contains wallets+txHashes)
  const { destinationWallet: _omit, withdrawalHistory: _hist, ...rest } = cfg;
  res.json({ ...rest, destinationWalletMasked: masked });
});

// POST /withdrawal/config — update config fields (requires PIN + basic auth)
app.post('/withdrawal/config', authMiddleware, wdPinRateLimit, wdPinCheck, (req, res) => {
  const { destinationWallet, balanceTarget, withdrawalLimit, minWithdrawal, cooldownHours, enabled } = req.body;
  const cfg = withdrawal.loadConfig();
  if (destinationWallet !== undefined) {
    // Validate address format
    if (!ethersV5.utils.isAddress(destinationWallet)) {
      return res.status(400).json({ error: 'Invalid Ethereum address format' });
    }
    // Reject zero / dead addresses
    if (!withdrawal.isValidDestination(destinationWallet)) {
      return res.status(400).json({ error: 'Cannot use zero or dead wallet address as destination' });
    }
    cfg.destinationWallet = destinationWallet;
  }
  if (balanceTarget   !== undefined) cfg.balanceTarget   = Math.max(0,   parseFloat(balanceTarget));
  if (withdrawalLimit !== undefined) cfg.withdrawalLimit = Math.max(1,   parseFloat(withdrawalLimit));
  if (minWithdrawal   !== undefined) cfg.minWithdrawal   = Math.max(1,   parseFloat(minWithdrawal));
  if (cooldownHours   !== undefined) cfg.cooldownHours   = Math.max(0.5, parseFloat(cooldownHours));
  if (enabled         !== undefined) cfg.enabled         = Boolean(enabled);
  withdrawal.saveConfig(cfg);
  res.json({ ok: true });
});

// POST /withdrawal/check — manual trigger (requires PIN + basic auth)
app.post('/withdrawal/check', authMiddleware, wdPinRateLimit, wdPinCheck, async (req, res) => {
  try {
    res.json(await withdrawal.checkAndWithdraw());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
