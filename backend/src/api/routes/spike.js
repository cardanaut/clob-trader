// ── CLOB Trader — Spike trading routes ──
'use strict';
const rateLimit      = require('express-rate-limit');
const spikeConfig    = require('../spike/config');
const logger         = require('../utils/logger');
const clobWebsocket  = require('../spike/clob-websocket');

module.exports = function registerSpikeRoutes(app, { authMiddleware }) {

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

};
