/**
 * SpikeTrading Engine
 * Paper trading bot for momentum detection on Polymarket BTC 5min markets
 */

'use strict';

const binanceStream = require('./binance-stream');
const gamma = require('./gamma-api');
const clobApi = require('./clob-api');
const detector = require('./detector');
const clobWebsocket = require('./clob-websocket');
const logger = require('../utils/logger');
const { query } = require('../database/connection');
const config = require('./config');
const telegram = require('./telegram');
const claimWinnings = require('./claim-winnings');
const notifier = require('./notifier');
const reversionTracker = require('./reversion-tracker');
const spikePriceLogger = require('./spike-price-logger');
const kalshiWebsocket  = require('./kalshi-websocket');
const ohlcLogger       = require('./polymarket-ohlc-logger');

/**
 * Log activity to spike_activity_log table
 * Auto-cycles logs to maintain max 600 entries
 */
async function log(eventType, message, { cryptoSymbol = null, marketId = null, details = null } = {}) {
  try {
    await query(
      `INSERT INTO spike_activity_log (event_type, crypto_symbol, market_id, message, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventType, cryptoSymbol, marketId, message, details ? JSON.stringify(details) : null]
    );

    // Auto-cycle: Keep only the latest 600 logs
    await query(
      `DELETE FROM spike_activity_log
       WHERE id NOT IN (
         SELECT id FROM spike_activity_log
         ORDER BY created_at DESC
         LIMIT 600
       )`
    );

    // Send Telegram notification for important events
    await telegram.notifyActivityLog(eventType, message, {
      cryptoSymbol,
      marketId,
      details
    });

    // Send account stats after trade executions
    if (eventType === 'trade_executed') {
      await telegram.sendAccountStats();
    }
  } catch (err) {
    logger.error('[spike-engine] Failed to log activity', { error: err.message });
  }
}

/**
 * Log a missed opportunity
 */
async function logMissedOpportunity({
  cryptoSymbol, marketId, marketQuestion, signalType, signalMinute, candleMovementPct,
  reason, entryPrice = null, maxEntryPrice = null, orderBookDepth = null,
  currentExposurePct = null, maxExposurePct = null, availableCapital = null,
  wouldBePositionSize = null, details = null
}) {
  try {
    await query(
      `INSERT INTO spike_missed_opportunities
       (crypto_symbol, market_id, market_question, signal_type, signal_minute, candle_movement_pct,
        reason, entry_price, max_entry_price, order_book_depth,
        current_exposure_pct, max_exposure_pct, available_capital, would_be_position_size, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [cryptoSymbol, marketId, marketQuestion, signalType, signalMinute, candleMovementPct,
       reason, entryPrice, maxEntryPrice, orderBookDepth,
       currentExposurePct, maxExposurePct, availableCapital, wouldBePositionSize,
       details ? JSON.stringify(details) : null]
    );

    // Format reason for activity log
    let reasonText = reason;
    let eventType = 'trade_skipped';

    if (reason === 'price_too_high') {
      // Special event type for price too high with market link
      eventType = 'PRICE_TOO_HIGH';
      const marketSlug = details?.marketSlug;
      const marketLink = marketSlug ? `https://polymarket.com/event/${marketSlug}` : '';
      const marketShort = marketQuestion?.slice(0, 50) + '...' || 'Unknown market';
      reasonText = `${marketShort} - Entry ${(entryPrice * 100)?.toFixed(1)}¢ > max ${(maxEntryPrice * 100)?.toFixed(0)}¢${marketLink ? ' - ' + marketLink : ''}`;
    } else if (reason === 'no_liquidity') {
      reasonText = 'No liquidity in order book';
    } else if (reason === 'exposure_limit_exceeded') {
      reasonText = `Max exposure ${currentExposurePct?.toFixed(1)}% reached`;
    } else if (reason === 'position_too_small') {
      reasonText = `Position size $${wouldBePositionSize?.toFixed(2)} < $1 minimum`;
    } else if (reason === 'emergency_stop') {
      const stopReason = details?.stopReason || 'Consecutive failures';
      const hoursActive = details?.activeForHours || '?';
      const marketSlug = details?.marketSlug;
      const marketLink = marketSlug ? `https://polymarket.com/event/${marketSlug}` : '';
      reasonText = `EMERGENCY STOP (${stopReason}, active ${hoursActive}h)${marketLink ? ' - ' + marketLink : ''}`;
    }

    // Log to activity log
    await log(eventType, `⚠️ ${cryptoSymbol} ${signalType} SKIPPED - ${reasonText}`, {
      cryptoSymbol,
      marketId,
      details: {
        reason,
        entryPrice,
        maxEntryPrice,
        currentExposurePct,
        maxExposurePct,
        wouldBePositionSize
      }
    });

    logger.info(`[spike-engine] Missed opportunity: ${reason} - ${cryptoSymbol} ${signalType} ${candleMovementPct?.toFixed(2)}%`);
  } catch (err) {
    logger.error('[spike-engine] Failed to log missed opportunity', { error: err.message });
  }
}

/**
 * FADE GTC exit target lookup.
 * For a given NO best-ask (decimal), returns the take-profit bid target (decimal).
 * Returns null if the entry price is outside the supported range (skip FADE).
 *
 * Entry→Exit table (in cents):
 *   4→6  5→7  6→7  7→8  8→9  9→10
 *
 * Entries below 4¢ (YES > 96¢): spike too extreme, skip.
 * Entries above 9¢ (YES < 91¢): momentum price ≤ 90¢ → T123 handles it, not FADE.
 */
function getFadeExitTarget(bestAskDecimal) {
  const cents = Math.round(bestAskDecimal * 100);
  const table = { 4: 6, 5: 7, 6: 7, 7: 8, 8: 9, 9: 10 };
  const exitCents = table[cents];
  return exitCents != null ? exitCents / 100 : null;
}

/**
 * Monitor the FADE (counter) token's bid price until it reaches the GTC exit target.
 * Resolves with { filled: true, exitPrice } when target is hit,
 * or { filled: false, exitPrice: null } if market closes before target is reached.
 * Returns object with { promise, cancel } for cleanup.
 */
function monitorFadeExit(market, fadeTokenId, exitTarget, engineInstance) {
  const crypto    = market.crypto_symbol;
  const marketEnd = new Date(market.endDate);
  const now       = new Date();
  const timeRemaining = Math.max(0, marketEnd - now);

  if (timeRemaining <= 5000) {
    return { promise: Promise.resolve({ filled: false, exitPrice: null }), cancel: () => {} };
  }

  logger.info('[spike-engine] 👁 FADE GTC EXIT MONITORING', {
    crypto,
    market:      market.slug,
    exitTarget:  (exitTarget * 100).toFixed(0) + '¢',
    timeLeftMs:  timeRemaining,
  });

  let timeoutId       = null;
  let nextCheckTimeout = null;
  let cancelled       = false;

  const cleanup = () => {
    cancelled = true;
    if (timeoutId)        clearTimeout(timeoutId);
    if (nextCheckTimeout) clearTimeout(nextCheckTimeout);
  };

  const promise = new Promise((resolve) => {
    // Absolute timeout: market close + 5s buffer
    timeoutId = setTimeout(() => {
      cleanup();
      logger.info('[spike-engine] ⏰ FADE GTC monitoring timeout — holding to resolution', {
        crypto, market: market.slug,
      });
      resolve({ filled: false, exitPrice: null });
    }, timeRemaining + 5000);

    const scheduleNextCheck = () => {
      if (cancelled) return;
      nextCheckTimeout = setTimeout(async () => {
        if (cancelled) return;

        if (new Date() >= marketEnd) {
          cleanup();
          resolve({ filled: false, exitPrice: null });
          return;
        }
        if (engineInstance.emergencyStop) {
          cleanup();
          resolve({ filled: false, exitPrice: null });
          return;
        }

        try {
          const ob = await clobApi.getOrderBook(fadeTokenId);
          if (ob?.bestBid != null && ob.bestBid >= exitTarget) {
            cleanup();
            logger.info('[spike-engine] ✅ FADE GTC EXIT TRIGGERED', {
              crypto, market: market.slug,
              exitTarget: (exitTarget * 100).toFixed(0) + '¢',
              bestBid:    (ob.bestBid * 100).toFixed(1) + '¢',
            });
            resolve({ filled: true, exitPrice: ob.bestBid });
            return;
          }
          scheduleNextCheck();
        } catch (err) {
          scheduleNextCheck(); // ignore transient errors, keep monitoring
        }
      }, 1000);
    };

    scheduleNextCheck();
  });

  return { promise, cancel: cleanup };
}

/**
 * Monitor price until market closes or price becomes acceptable
 * Returns Promise that resolves to true if trade should proceed, false if monitoring failed/timeout
 * Returns object with { promise, cancel } for cleanup
 */
function monitorPriceUntilAcceptable(market, signal, initialPrice, maxEntryPrice, engineInstance, tokenId = null) {
  const crypto = market.crypto_symbol;

  // Input validation
  if (!initialPrice || initialPrice < 0 || initialPrice > 1) {
    throw new Error(`Invalid initialPrice: ${initialPrice}`);
  }
  if (!maxEntryPrice || maxEntryPrice < 0 || maxEntryPrice > 1) {
    throw new Error(`Invalid maxEntryPrice: ${maxEntryPrice}`);
  }

  // Validate market end date
  const marketEnd = new Date(market.endDate);
  if (isNaN(marketEnd.getTime())) {
    throw new Error(`Invalid market end date: ${market.endDate}`);
  }

  const now = new Date();
  const maxMonitoringTime = 10 * 60 * 1000; // 10 minutes absolute max
  const timeRemaining = Math.min(marketEnd - now, maxMonitoringTime);

  if (timeRemaining <= 0) {
    logger.warn('[spike-engine] Market already closed, cannot monitor', { crypto, market: market.slug });
    return {
      promise: Promise.resolve(false),
      cancel: () => {}
    };
  }

  logger.info('[spike-engine] 🔄 PRICE MONITORING ACTIVATED', {
    crypto,
    market: market.slug,
    initialPrice: (initialPrice * 100).toFixed(1) + '¢',
    maxEntryPrice: (maxEntryPrice * 100).toFixed(0) + '¢',
    timeRemainingMs: timeRemaining,
    reason: 'Price too high - waiting for reversion'
  });

  // Log to activity feed (async but don't block)
  log('price_monitoring', `🔄 ${crypto} ${signal.type} - Price ${(initialPrice * 100).toFixed(1)}¢ > ${(maxEntryPrice * 100).toFixed(0)}¢ - Monitoring until market closes`, {
    cryptoSymbol: crypto,
    marketId: market.id,
    details: { initialPrice, maxEntryPrice, marketEnd: marketEnd.toISOString() }
  }).catch(err => logger.error('[spike-engine] Failed to log monitoring start', { error: err.message }));

  let timeoutId = null;
  let nextCheckTimeout = null;
  let checkCount = 0;
  let cancelled = false;

  const cleanup = () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
    if (nextCheckTimeout) clearTimeout(nextCheckTimeout);
  };

  const promise = new Promise((resolve, reject) => {
    // Absolute timeout (market end + 5s buffer)
    timeoutId = setTimeout(() => {
      cleanup();
      logger.warn('[spike-engine] ⏰ Price monitoring timeout - market closed', {
        crypto,
        market: market.slug,
        checksPerformed: checkCount,
        finalStatus: 'Market closed without acceptable price'
      });
      resolve(false);
    }, timeRemaining + 5000);

    // Recursive check function (uses setTimeout instead of setInterval)
    const scheduleNextCheck = () => {
      if (cancelled) return;

      nextCheckTimeout = setTimeout(async () => {
        if (cancelled) return;

        checkCount++;
        const nowCheck = new Date();

        // Check if market has closed
        if (nowCheck >= marketEnd) {
          cleanup();
          logger.warn('[spike-engine] ⏰ Market closed during monitoring', {
            crypto,
            market: market.slug,
            checksPerformed: checkCount
          });
          resolve(false);
          return;
        }

        // CRITICAL: Check emergency stop
        if (engineInstance.emergencyStop) {
          cleanup();
          logger.warn('[spike-engine] 🚨 Emergency stop active - aborting price monitoring', {
            crypto,
            market: market.slug,
            checksPerformed: checkCount,
            reason: engineInstance.emergencyStopReason
          });
          resolve(false);
          return;
        }

        try {
          // Poll CLOB orderbook directly — WebSocket cache is unreliable for monitoring
          // (it holds pre-spike prices and fires false PRICE_OK events)
          let currentEntryPrice = null;

          if (tokenId) {
            const ob = await clobApi.getOrderBook(tokenId);
            if (!ob || !ob.bestAsk) {
              logger.debug('[spike-engine] CLOB poll returned no asks, continuing monitoring...', { crypto, checkCount });
              scheduleNextCheck();
              return;
            }
            currentEntryPrice = ob.bestAsk;
          } else {
            // Fallback: WebSocket cache (only used if tokenId not available)
            const latestPrice = clobWebsocket.getPrice(crypto);
            if (!latestPrice || latestPrice.up == null || latestPrice.down == null) {
              logger.debug('[spike-engine] Price data not available, continuing monitoring...', { crypto, checkCount });
              scheduleNextCheck();
              return;
            }
            currentEntryPrice = signal.type === 'BUY_YES' ? latestPrice.up : latestPrice.down;
          }

          logger.debug('[spike-engine] 💰 Price check (CLOB)', {
            crypto,
            checkCount,
            source: tokenId ? 'CLOB' : 'WebSocket',
            currentPrice: (currentEntryPrice * 100).toFixed(1) + '¢',
            threshold: (maxEntryPrice * 100).toFixed(0) + '¢',
            acceptable: currentEntryPrice <= maxEntryPrice
          });

          // Check if price has dropped below threshold
          if (currentEntryPrice <= maxEntryPrice) {
            cleanup();
            logger.info('[spike-engine] ✅ PRICE ACCEPTABLE - Proceeding with trade', {
              crypto,
              market: market.slug,
              initialPrice: (initialPrice * 100).toFixed(1) + '¢',
              currentPrice: (currentEntryPrice * 100).toFixed(1) + '¢',
              checksPerformed: checkCount,
              priceImprovement: ((initialPrice - currentEntryPrice) * 100).toFixed(1) + '¢'
            });

            // Log async (don't block)
            log('price_acceptable', `✅ ${crypto} ${signal.type} - Price dropped to ${(currentEntryPrice * 100).toFixed(1)}¢ - Proceeding with trade`, {
              cryptoSymbol: crypto,
              marketId: market.id,
              details: { initialPrice, currentPrice: currentEntryPrice, checksPerformed: checkCount }
            }).catch(err => logger.error('[spike-engine] Failed to log price acceptable', { error: err.message }));

            resolve(true);
            return;
          }

          // Price still too high, schedule next check
          scheduleNextCheck();

        } catch (err) {
          // Ignore errors and keep monitoring
          logger.debug('[spike-engine] Price check error (ignoring, continuing monitoring)', {
            crypto,
            checkCount,
            error: err.message
          });
          scheduleNextCheck(); // Continue despite error
        }

      }, 1000); // Check every 1 second
    };

    // Start first check
    scheduleNextCheck();
  });

  // Return promise with cancel function
  return {
    promise,
    cancel: cleanup
  };
}

class SpikeEngine {
  constructor() {
    this.isRunning = false;
    this.activeMarkets = new Map(); // marketId -> market data
    this.activeCycles = new Map();  // marketId -> cycle state
    this.marketPollInterval = null;
    this.currentCapital = config.STARTING_CAPITAL; // Shared capital pool across all cryptos
    this.isPollingMarkets = false; // Prevent polling overlap
    this.tradingMode = config.TRADING_MODE; // 'PAPER' or 'LIVE'
    this.emergencyStop = false; // Set to true to halt all trading (loaded from DB)
    this.emergencyStopReason = null; // Reason for emergency stop (e.g., "Invalid order payload")
    this.emergencyStopActivatedAt = null; // Timestamp when emergency stop was activated
    this.openPositions = 0; // Count of open live positions
    this.consecutiveErrors = 0; // Track consecutive trade errors for emergency stop
    this.cryptoConfigs = new Map(); // crypto_symbol -> { enabled, min_threshold_pct, max_threshold_pct }
    this.exposurePerCrypto = new Map(); // crypto_symbol -> current USD at risk
    this.maxEntryPrice = config.MAX_ENTRY_PRICE; // Maximum entry price (loaded from DB)
    this.maxPositionSizeUsd = 150; // Maximum position size per trade in USD (loaded from DB)
    this.maxCapitalRiskPct = 50; // Maximum capital risk % across all positions (loaded from DB)
    this.detectionStrategy = 'T123-1MIN'; // Detection strategy (loaded from DB)
    this.aggregators30s = new Map(); // crypto_symbol -> Binance30sAggregator (for T123-30SEC)

    // Price monitoring tracking (prevents concurrent monitoring + enables cleanup)
    this.activeMonitoring = new Map(); // marketId -> { cancel: Function, crypto: String }

    // Movement tracking for periodic summary logs
    this.maxMovements = new Map(); // crypto_symbol -> max movement % seen
    this.candleCount = new Map(); // crypto_symbol -> candle count
    this.missedOpportunityCount = 0; // Count of missed opportunities in last 20 min
    this.positionsCreatedCount = 0; // Count of positions created in last 20 min
    this.skippedTradesCount = 0; // Count of skipped trades (T+3/T+4, etc) in last 20 min
    this.lastSummaryTime = Date.now();
    this.summaryInterval = null;
  }

  /**
   * Start the engine
   */
  async start() {
    if (this.isRunning) {
      logger.warn('[spike-engine] Already running');
      return;
    }

    // Determine trading mode
    const mode = this.tradingMode === 'LIVE' ? 'LIVE TRADING' : 'PAPER TRADING';
    logger.info(`[spike-engine] Starting SpikeTrading engine (${mode})`, {
      mode: this.tradingMode,
      startingCapital: config.STARTING_CAPITAL,
      positionSize: config.POSITION_SIZE_PCT + '%'
    });

    // CRITICAL WARNING for live mode
    if (this.tradingMode === 'LIVE') {
      logger.warn('[spike-engine] ⚠️  LIVE TRADING MODE ENABLED ⚠️');
      logger.warn('[spike-engine] This bot will place REAL orders with REAL money!');
      logger.warn('[spike-engine] Ensure you understand the risks before proceeding.');

      // Initialize live trading client
      try {
        clobApi.initializeLiveClient();
        logger.info('[spike-engine] Live trading client initialized successfully');

        // Initialize automated claim system
        const walletAddress = claimWinnings.initialize();
        logger.info('[spike-engine] Automated claim system initialized', { wallet: walletAddress });

        // Check initial balance
        const balanceInfo = await clobApi.getBalance();
        if (!balanceInfo) {
          throw new Error('Failed to fetch balance from Polymarket');
        }

        logger.info('[spike-engine] Current USDC balance', {
          liquid: balanceInfo.liquid.toFixed(2),
          unredeemed: balanceInfo.unredeemed.toFixed(2),
          total: balanceInfo.total.toFixed(2)
        });

        if (balanceInfo.unredeemed > 0) {
          logger.warn('[spike-engine] ⚠️  YOU HAVE UNREDEEMED WINNINGS!', {
            amount: '$' + balanceInfo.unredeemed.toFixed(2),
            message: 'Go to https://polymarket.com and claim your winnings from resolved markets'
          });

          // Send Telegram notification on startup (rate-limited, timezone-aware)
          await telegram.notifyUnredeemedBalance(balanceInfo.unredeemed, balanceInfo.liquid, 'LIVE');
        }

        if (balanceInfo.liquid < config.LIVE_TRADING.MIN_BALANCE_USDC) {
          throw new Error(`Insufficient liquid balance: ${balanceInfo.liquid.toFixed(2)} USDC (minimum: ${config.LIVE_TRADING.MIN_BALANCE_USDC})`);
        }
      } catch (err) {
        logger.error('[spike-engine] Failed to initialize live trading', { error: err.message });
        logger.error('[spike-engine] Falling back to PAPER mode for safety');
        this.tradingMode = 'PAPER';
      }
    }

    this.isRunning = true;

    // Load settings from database
    await this.loadSettings();

    // Load crypto configurations from database
    await this.loadCryptoConfigs();

    // Load current capital from database (for tracking purposes in both modes)
    await this.loadCapital();

    // Recover pending trades from previous session (in case of restart)
    await this.recoverPendingTrades();

    // Connect to Binance data stream based on strategy
    const strategyConfig = config.STRATEGIES[this.detectionStrategy];

    if (strategyConfig.candleSource === 'binance-kline') {
      // T123-1MIN: Use existing 1-minute kline stream
      logger.info('[spike-engine] Initializing 1-minute candle stream (T123-1MIN)');
      binanceStream.connect();
      binanceStream.onCandle((candle) => this.handleCandle(candle));
      binanceStream.onCandle((candle) => reversionTracker.onCandle(candle));
      binanceStream.onCandle((candle) => ohlcLogger.onBinanceCandle(candle));

    } else if (strategyConfig.candleSource === 'binance-trade') {
      // T123-30SEC: Build 30-second candles from trade stream
      logger.info('[spike-engine] Initializing 30-second candle aggregators (T123-30SEC)');
      const Binance30sAggregator = require('./binance-30s');

      config.SUPPORTED_CRYPTOS.forEach(crypto => {
        const aggregator = new Binance30sAggregator(crypto.symbol);
        this.aggregators30s.set(crypto.symbol, aggregator);

        // Listen for 30-second candles
        aggregator.on('candle', (candle) => {
          // Add crypto_symbol for consistency with 1-minute candles
          candle.crypto_symbol = crypto.symbol;
          this.handleCandle(candle);
        });

        // Connect to trade stream
        aggregator.connect();
      });
    }

    // Poll Gamma API for active BTC 5min markets
    await this.updateActiveMarketsWithTimeout();
    this.marketPollInterval = setInterval(async () => {
      if (this.isPollingMarkets) {
        logger.warn('[spike-engine] Skipping market poll - previous call still running');
        return;
      }
      this.isPollingMarkets = true;
      try {
        await this.updateActiveMarketsWithTimeout();
      } catch (err) {
        logger.error('[spike-engine] Error in market poll interval', { error: err.message });
      } finally {
        this.isPollingMarkets = false;
      }
    }, config.GAMMA_POLL_INTERVAL_MS);

    // Periodic summary: Log max movements every 20 minutes, aligned to :00, :20, :40
    this.startAlignedSummary();

    // Periodic settings reload: Check for updated settings every 30 seconds
    this.settingsReloadInterval = setInterval(async () => {
      await this.loadSettings();
    }, 30 * 1000); // Every 30 seconds

    // Periodic claim processing: Check for resolved markets and claim winnings every 5 minutes (LIVE mode only)
    if (this.tradingMode === 'LIVE') {
      this.claimInterval = setInterval(async () => {
        try {
          const status = claimWinnings.getStatus();
          if (status.readyToClaim > 0) {
            logger.info('[spike-engine] 💰 Processing automated claims', status);
            const result = await claimWinnings.processAllClaims();
            if (result.claimed > 0) {
              logger.info('[spike-engine] ✅ Claimed winnings from resolved markets', result);
              // Refresh balance after claiming
              const balanceInfo = await clobApi.getBalance();
              logger.info('[spike-engine] Updated balance after claim', {
                liquid: balanceInfo.liquid.toFixed(2)
              });
            }
          }
        } catch (err) {
          logger.error('[spike-engine] Error in automated claim interval', { error: err.message });
        }
      }, 5 * 60 * 1000); // Every 5 minutes
    }

    // Start Kalshi WebSocket (no-op if not configured)
    kalshiWebsocket.start().catch(err =>
      logger.warn('[spike-engine] Kalshi WS failed to start', { error: err.message })
    );

    // Start Polymarket OHLC logger (records real bid/ask per minute for strategy research)
    ohlcLogger.start();

    logger.info('[spike-engine] Engine started successfully');

    // Log startup to activity log
    await log('bot_started', `SpikeTrading bot started in ${mode} mode`, {
      details: {
        mode: this.tradingMode,
        startingCapital: config.STARTING_CAPITAL,
        positionSize: config.POSITION_SIZE_PCT + '%'
      }
    });
  }

  /**
   * Stop the engine
   */
  async stop() {
    if (!this.isRunning) return;

    logger.info('[spike-engine] Stopping SpikeTrading engine...');
    this.isRunning = false;

    // Disconnect Binance streams based on strategy
    if (this.aggregators30s.size > 0) {
      // Disconnect 30-second aggregators
      logger.info('[spike-engine] Disconnecting 30-second aggregators');
      this.aggregators30s.forEach((aggregator, symbol) => {
        aggregator.disconnect();
      });
      this.aggregators30s.clear();
    } else {
      // Disconnect 1-minute kline stream
      binanceStream.disconnect();
    }

    if (this.marketPollInterval) {
      clearInterval(this.marketPollInterval);
    }

    if (this.summaryInterval) {
      clearInterval(this.summaryInterval);
    }

    if (this.summaryTimeout) {
      clearTimeout(this.summaryTimeout);
    }

    if (this.settingsReloadInterval) {
      clearInterval(this.settingsReloadInterval);
    }

    if (this.claimInterval) {
      clearInterval(this.claimInterval);
    }

    // Cancel all active price monitoring
    if (this.activeMonitoring.size > 0) {
      logger.info('[spike-engine] Cancelling active price monitoring', {
        count: this.activeMonitoring.size,
        markets: Array.from(this.activeMonitoring.keys()).map(id => id.slice(0, 16) + '...')
      });
      for (const [marketId, handle] of this.activeMonitoring.entries()) {
        try {
          handle.cancel();
        } catch (err) {
          logger.error('[spike-engine] Error cancelling monitoring', {
            marketId: marketId.slice(0, 16) + '...',
            error: err.message
          });
        }
      }
      this.activeMonitoring.clear();
    }

    logger.info('[spike-engine] Engine stopped');

    // Log shutdown to activity log
    await log('bot_stopped', 'SpikeTrading bot stopped');
  }

  /**
   * Load general settings from database
   */
  async loadSettings() {
    try {
      const res = await query("SELECT setting_key, setting_value, description FROM spike_settings WHERE setting_key IN ('max_entry_price', 'detection_strategy', 'emergency_stop', 'max_position_size_usd', 'max_capital_risk_pct')");

      const settings = {};
      res.rows.forEach(row => {
        settings[row.setting_key] = { value: row.setting_value, description: row.description };
      });

      // Load max entry price
      if (settings.max_entry_price) {
        const maxEntryPrice = parseFloat(settings.max_entry_price.value);
        if (!isNaN(maxEntryPrice) && maxEntryPrice > 0 && maxEntryPrice <= 1) {
          this.maxEntryPrice = maxEntryPrice;
          logger.info('[spike-engine] Max entry price loaded from database', { maxEntryPrice });
        } else {
          logger.warn('[spike-engine] Invalid max_entry_price in database, using default', { value: settings.max_entry_price.value });
        }
      } else {
        logger.warn('[spike-engine] max_entry_price not found in database, using config default', { default: this.maxEntryPrice });
      }

      // Load max position size USD
      if (settings.max_position_size_usd) {
        const maxPositionSizeUsd = parseFloat(settings.max_position_size_usd.value);
        if (!isNaN(maxPositionSizeUsd) && maxPositionSizeUsd > 0) {
          this.maxPositionSizeUsd = maxPositionSizeUsd;
          logger.info('[spike-engine] Max position size loaded from database', { maxPositionSizeUsd });
        } else {
          logger.warn('[spike-engine] Invalid max_position_size_usd in database, using default', { value: settings.max_position_size_usd.value });
        }
      } else {
        logger.info('[spike-engine] max_position_size_usd not found in database, using default', { default: this.maxPositionSizeUsd });
      }

      // Load max capital risk percentage
      if (settings.max_capital_risk_pct) {
        const maxCapitalRiskPct = parseFloat(settings.max_capital_risk_pct.value);
        if (!isNaN(maxCapitalRiskPct) && maxCapitalRiskPct >= 1 && maxCapitalRiskPct <= 100) {
          this.maxCapitalRiskPct = maxCapitalRiskPct;
          logger.info('[spike-engine] Max capital risk loaded from database', { maxCapitalRiskPct: maxCapitalRiskPct + '%' });
        } else {
          logger.warn('[spike-engine] Invalid max_capital_risk_pct in database, using default', { value: settings.max_capital_risk_pct.value });
        }
      } else {
        logger.info('[spike-engine] max_capital_risk_pct not found in database, using default', { default: this.maxCapitalRiskPct + '%' });
      }

      // Load emergency stop flag
      if (settings.emergency_stop !== undefined) {
        const stopValue = settings.emergency_stop.value;
        this.emergencyStop = (stopValue === 'true' || stopValue === '1' || stopValue === true);

        // Extract reason from description if emergency stop is active
        if (this.emergencyStop && settings.emergency_stop.description) {
          const desc = settings.emergency_stop.description;
          // Try to extract reason from description (format: "⚠️ Emergency stop: 3 consecutive failures. Last error: ...")
          const reasonMatch = desc.match(/Last error: (.+)$/);
          if (reasonMatch) {
            this.emergencyStopReason = reasonMatch[1];
          } else {
            this.emergencyStopReason = desc;
          }
        }

        logger.info('[spike-engine] Emergency stop loaded from database', {
          emergencyStop: this.emergencyStop,
          reason: this.emergencyStopReason || 'N/A'
        });
      }

      // Load detection strategy
      if (settings.detection_strategy) {
        const newStrategy = settings.detection_strategy.value;
        if (config.STRATEGIES[newStrategy]) {
          // Detect strategy change and hot-swap streams
          if (this.detectionStrategy && this.detectionStrategy !== newStrategy) {
            logger.warn('[spike-engine] 🔄 STRATEGY CHANGE DETECTED - Hot-swapping streams', {
              oldStrategy: this.detectionStrategy,
              newStrategy: newStrategy
            });
            await this.hotSwapStrategy(newStrategy);
          } else {
            this.detectionStrategy = newStrategy;
            logger.info('[spike-engine] Detection strategy loaded from database', {
              strategy: this.detectionStrategy,
              name: config.STRATEGIES[newStrategy].name,
              interval: config.STRATEGIES[newStrategy].interval,
              threshold: config.STRATEGIES[newStrategy].minThreshold + '%'
            });
          }
        } else {
          logger.warn('[spike-engine] Invalid detection_strategy in database, using default', { value: newStrategy });
        }
      } else {
        logger.info('[spike-engine] detection_strategy not found in database, using default', { default: this.detectionStrategy });
      }
    } catch (err) {
      logger.error('[spike-engine] Error loading settings from database', { error: err.message });
    }
  }

  /**
   * Hot-swap detection strategy without restarting
   * Gracefully disconnects old streams and connects new ones
   */
  async hotSwapStrategy(newStrategy) {
    try {
      const oldStrategy = this.detectionStrategy;
      const oldStrategyConfig = config.STRATEGIES[oldStrategy];
      const newStrategyConfig = config.STRATEGIES[newStrategy];

      logger.info('[spike-engine] 🔄 Starting strategy hot-swap', {
        from: oldStrategyConfig.name,
        to: newStrategyConfig.name
      });

      // Step 1: Disconnect old streams
      if (oldStrategyConfig.candleSource === 'binance-kline') {
        logger.info('[spike-engine] Disconnecting 1-minute kline stream...');
        binanceStream.disconnect();
      } else if (oldStrategyConfig.candleSource === 'binance-trade') {
        logger.info('[spike-engine] Disconnecting 30-second aggregators...');
        this.aggregators30s.forEach((aggregator, symbol) => {
          aggregator.disconnect();
        });
        this.aggregators30s.clear();
      }

      // Step 2: Update strategy
      this.detectionStrategy = newStrategy;

      // Step 3: Connect new streams
      if (newStrategyConfig.candleSource === 'binance-kline') {
        logger.info('[spike-engine] Connecting 1-minute kline stream...');
        binanceStream.connect();
        binanceStream.onCandle((candle) => this.handleCandle(candle));
      } else if (newStrategyConfig.candleSource === 'binance-trade') {
        logger.info('[spike-engine] Connecting 30-second aggregators...');
        const Binance30sAggregator = require('./binance-30s');

        config.SUPPORTED_CRYPTOS.forEach(crypto => {
          const aggregator = new Binance30sAggregator(crypto.symbol);
          this.aggregators30s.set(crypto.symbol, aggregator);

          aggregator.on('candle', (candle) => {
            candle.crypto_symbol = crypto.symbol;
            this.handleCandle(candle);
          });

          aggregator.connect();
        });
      }

      logger.warn('[spike-engine] ✅ STRATEGY HOT-SWAP COMPLETE', {
        strategy: newStrategy,
        name: newStrategyConfig.name,
        interval: newStrategyConfig.interval,
        threshold: newStrategyConfig.minThreshold + '%'
      });

      // Log to activity log
      await log('strategy_changed', `Detection strategy changed to ${newStrategyConfig.name}`, {
        details: {
          oldStrategy: oldStrategyConfig.name,
          newStrategy: newStrategyConfig.name,
          interval: newStrategyConfig.interval,
          threshold: newStrategyConfig.minThreshold + '%'
        }
      });

    } catch (err) {
      logger.error('[spike-engine] Error during strategy hot-swap', { error: err.message });
      throw err;
    }
  }

  /**
   * Load crypto configurations from database
   */
  async loadCryptoConfigs() {
    try {
      const res = await query('SELECT crypto_symbol, enabled, min_threshold_pct, max_threshold_pct FROM spike_crypto_config');

      if (res.rows.length === 0) {
        logger.warn('[spike-engine] No crypto configs found in database, using defaults');
        // Initialize with defaults from config
        config.SUPPORTED_CRYPTOS.forEach(crypto => {
          this.cryptoConfigs.set(crypto.symbol, {
            enabled: true,
            min_threshold_pct: 0.15,
            max_threshold_pct: 0.30
          });
          this.exposurePerCrypto.set(crypto.symbol, 0);
        });
        return;
      }

      // Load configs from database
      res.rows.forEach(row => {
        this.cryptoConfigs.set(row.crypto_symbol, {
          enabled: row.enabled,
          min_threshold_pct: parseFloat(row.min_threshold_pct),
          max_threshold_pct: parseFloat(row.max_threshold_pct)
        });
        this.exposurePerCrypto.set(row.crypto_symbol, 0);

        logger.info(`[spike-engine] ${row.crypto_symbol} config loaded`, {
          enabled: row.enabled,
          thresholdRange: `${row.min_threshold_pct}%-${row.max_threshold_pct}%`
        });
      });
    } catch (err) {
      logger.error('[spike-engine] Error loading crypto configs', { error: err.message });
      // Fallback to defaults
      config.SUPPORTED_CRYPTOS.forEach(crypto => {
        this.cryptoConfigs.set(crypto.symbol, {
          enabled: true,
          min_threshold_pct: 0.15,
          max_threshold_pct: 0.30
        });
        this.exposurePerCrypto.set(crypto.symbol, 0);
      });
    }
  }

  /**
   * Load current capital from database
   */
  async loadCapital() {
    try {
      const res = await query('SELECT current_capital FROM spike_capital ORDER BY id DESC LIMIT 1');
      if (res.rows.length > 0) {
        this.currentCapital = parseFloat(res.rows[0].current_capital);
        logger.info('[spike-engine] Capital loaded', { capital: this.currentCapital });
      } else {
        // Initialize if not exists
        await query(
          'INSERT INTO spike_capital (current_capital, total_trades, total_pnl) VALUES ($1, 0, 0)',
          [config.STARTING_CAPITAL]
        );
        this.currentCapital = config.STARTING_CAPITAL;
        logger.info('[spike-engine] Capital initialized', { capital: this.currentCapital });
      }
    } catch (err) {
      logger.error('[spike-engine] Error loading capital, using default', { error: err.message });
      this.currentCapital = config.STARTING_CAPITAL;
    }
  }

  /**
   * Recover and resolve pending trades from previous session
   * Called on bot startup to handle trades that weren't resolved if bot crashed
   */
  async recoverPendingTrades() {
    try {
      const res = await query(`
        SELECT DISTINCT market_id, cycle_end_time
        FROM spike_trades_simulated
        WHERE outcome = 'PENDING'
        AND cycle_end_time < NOW() - INTERVAL '2 minutes'
        ORDER BY cycle_end_time ASC
      `);

      if (res.rows.length === 0) {
        logger.info('[spike-engine] No pending trades to recover');
        return;
      }

      logger.info('[spike-engine] Recovering pending trades', { count: res.rows.length });

      for (const trade of res.rows) {
        try {
          await this.checkTradeResolution(trade.market_id, new Date(trade.cycle_end_time));
        } catch (err) {
          logger.error('[spike-engine] Error recovering trade', {
            marketId: trade.market_id.slice(0, 16) + '...',
            error: err.message
          });
        }
      }

      logger.info('[spike-engine] Pending trade recovery complete');
    } catch (err) {
      logger.error('[spike-engine] Error in pending trade recovery', { error: err.message });
    }
  }

  /**
   * Update capital after trade resolution
   */
  async updateCapital(pnlUsd) {
    this.currentCapital += pnlUsd;

    try {
      await query(
        `UPDATE spike_capital
         SET current_capital = $1,
             total_trades = total_trades + 1,
             total_pnl = total_pnl + $2,
             updated_at = NOW()
         WHERE id = (SELECT id FROM spike_capital ORDER BY id DESC LIMIT 1)`,
        [this.currentCapital, pnlUsd]
      );

      logger.info('[spike-engine] Capital updated', {
        newCapital: this.currentCapital.toFixed(2),
        pnl: pnlUsd.toFixed(2)
      });
    } catch (err) {
      logger.error('[spike-engine] Error updating capital', { error: err.message });
    }
  }

  /**
   * Update active markets with timeout protection to prevent deadlock
   */
  async updateActiveMarketsWithTimeout() {
    const TIMEOUT_MS = 15000; // 15 second timeout

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Market update timeout after 15s')), TIMEOUT_MS);
    });

    try {
      await Promise.race([
        this.updateActiveMarkets(),
        timeoutPromise
      ]);
    } catch (err) {
      if (err.message.includes('timeout')) {
        logger.error('[spike-engine] Market poll timeout - forcing recovery', { error: err.message });
      } else {
        throw err;
      }
    }
  }

  /**
   * Update list of active markets from Gamma (all enabled cryptos)
   */
  async updateActiveMarkets() {
    try {
      const allMarkets = [];

      // Fetch markets for each enabled crypto
      for (const crypto of config.SUPPORTED_CRYPTOS) {
        const cryptoConfig = this.cryptoConfigs.get(crypto.symbol);

        // Skip disabled cryptos
        if (!cryptoConfig || !cryptoConfig.enabled) {
          continue;
        }

        try {
          // Get market duration and slug pattern from strategy
          const strategyConfig = config.STRATEGIES[this.detectionStrategy];
          const marketDuration = strategyConfig.marketDuration || 5;
          const slugPattern = crypto.polymarketSlugs[marketDuration];

          if (!slugPattern) {
            logger.warn(`[spike-engine] No ${marketDuration}min slug pattern for ${crypto.symbol}, skipping`);
            continue;
          }

          const markets = await gamma.getActiveMarkets(crypto.symbol, slugPattern, marketDuration);

          // Tag each market with crypto symbol
          markets.forEach(market => {
            market.crypto_symbol = crypto.symbol;
          });

          allMarkets.push(...markets);
        } catch (err) {
          logger.error(`[spike-engine] Error fetching ${crypto.symbol} markets`, { error: err.message });
        }
      }

      // Add new markets
      for (const market of allMarkets) {
        if (!this.activeMarkets.has(market.conditionId)) {
          this.activeMarkets.set(market.conditionId, market);
          logger.info('[spike-engine] Tracking new market', {
            crypto: market.crypto_symbol,
            marketId: market.conditionId.slice(0, 16) + '...',
            question: market.question,
            endDate: market.endDate
          });
        }
      }

      // Remove closed markets
      const activeIds = new Set(allMarkets.map(m => m.conditionId));
      for (const marketId of this.activeMarkets.keys()) {
        if (!activeIds.has(marketId)) {
          const market = this.activeMarkets.get(marketId);
          const cryptoSymbol = market?.crypto_symbol || 'UNKNOWN';

          this.activeMarkets.delete(marketId);
          this.activeCycles.delete(marketId);

          logger.info('[spike-engine] Market closed, removed from tracking', {
            crypto: cryptoSymbol,
            marketId: marketId.slice(0, 16) + '...'
          });
        }
      }

      const breakdown = allMarkets.reduce((acc, m) => {
        acc[m.crypto_symbol] = (acc[m.crypto_symbol] || 0) + 1;
        return acc;
      }, {});

      logger.info('[spike-engine] Active markets updated', {
        count: this.activeMarkets.size,
        breakdown
      });
    } catch (err) {
      logger.error('[spike-engine] Error updating active markets', { error: err.message });
    }
  }

  /**
   * Start summary logging aligned to clock boundaries (00, 20, 40 minutes)
   * First summary may be short to sync, then regular 20-minute intervals
   */
  startAlignedSummary() {
    const now = new Date();
    const currentMinutes = now.getMinutes();
    const currentSeconds = now.getSeconds();
    const currentMs = now.getMilliseconds();

    // Calculate next alignment point (00, 20, or 40)
    let nextAlignedMinute;
    if (currentMinutes < 20) {
      nextAlignedMinute = 20;
    } else if (currentMinutes < 40) {
      nextAlignedMinute = 40;
    } else {
      nextAlignedMinute = 60; // Next hour :00
    }

    // Calculate milliseconds until next aligned time
    const minutesUntilNext = nextAlignedMinute - currentMinutes;
    const msUntilNext = (minutesUntilNext * 60 * 1000) - (currentSeconds * 1000) - currentMs;

    logger.info('[spike-engine] Summary cycle aligning to clock', {
      currentTime: now.toISOString().substring(11, 19),
      nextSummary: new Date(now.getTime() + msUntilNext).toISOString().substring(11, 19),
      syncIn: Math.round(msUntilNext / 1000) + 's'
    });

    // First summary at next aligned time
    this.summaryTimeout = setTimeout(() => {
      this.logMovementSummary();

      // After first aligned summary, start regular 20-minute interval
      this.summaryInterval = setInterval(() => {
        this.logMovementSummary();
      }, 20 * 60 * 1000);

      logger.info('[spike-engine] Summary cycle synced to :00/:20/:40 boundaries');
    }, msUntilNext);
  }

  /**
   * Log periodic summary of max movements per crypto
   * Shows the system is working even when no signals fire
   */
  async logMovementSummary() {
    if (this.maxMovements.size === 0) {
      logger.info('[spike-engine] Last 20 min: No candles processed yet');
      await log('movement_summary', 'No candles processed in last 20 minutes');
      return;
    }

    // Build summary string: "XRP:0.11% BTC:0.09% ETH:0.15% SOL:0.08%"
    const movements = [];
    const counts = [];

    for (const crypto of config.SUPPORTED_CRYPTOS) {
      const symbol = crypto.symbol;
      const maxMove = this.maxMovements.get(symbol) || 0;
      const count = this.candleCount.get(symbol) || 0;
      const cryptoConfig = this.cryptoConfigs.get(symbol);
      const threshold = cryptoConfig ? cryptoConfig.min_threshold_pct : 0.15;

      if (count > 0) {
        movements.push(`${symbol}: ${maxMove.toFixed(2)}%`);
        counts.push(`${symbol}:${count}`);
      }
    }

    if (movements.length > 0) {
      const movementStr = movements.join(' ');
      const statsStr = `Trades: ${this.positionsCreatedCount}  •  Missed: ${this.missedOpportunityCount}  •  Skipped: ${this.skippedTradesCount}`;

      // Analyze why no trades if positions = 0
      // Show ALL applicable reasons, not just one
      let reasonNote = '';
      if (this.positionsCreatedCount === 0) {
        const reasons = [];

        // Check for missed opportunities (price too high)
        if (this.missedOpportunityCount > 0) {
          reasons.push('prices >90¢');
        }

        // Check for skipped trades (wrong timing)
        if (this.skippedTradesCount > 0) {
          reasons.push('wrong timing (T+3/T+4)');
        }

        // If no missed/skipped, check if movements were below threshold
        if (reasons.length === 0) {
          let anyAboveThreshold = false;
          for (const crypto of config.SUPPORTED_CRYPTOS) {
            const symbol = crypto.symbol;
            const maxMove = this.maxMovements.get(symbol) || 0;
            const cryptoConfig = this.cryptoConfigs.get(symbol);
            const threshold = cryptoConfig ? cryptoConfig.min_threshold_pct : 0.20;
            if (maxMove >= threshold) {
              anyAboveThreshold = true;
              break;
            }
          }

          if (!anyAboveThreshold) {
            reasons.push('all below threshold');
          } else {
            // Movement exceeded threshold but no missed/skipped logged
            // This could happen if signal was detected but failed for other reasons
            reasons.push('other filters');
          }
        }

        if (reasons.length > 0) {
          reasonNote = ' (' + reasons.join(' + ') + ')';
        }
      }

      logger.info('[spike-engine] 📊 Last 20 min max movements:', {
        movements: movementStr,
        candles: counts.join(' '),
        positionsCreated: this.positionsCreatedCount,
        missedOpportunities: this.missedOpportunityCount,
        skippedTrades: this.skippedTradesCount,
        note: 'Threshold varies by crypto (0.20-0.23%)'
      });

      // Log to activity log with stats and reason
      await log('movement_summary', `📊 ${movementStr}  •  ${statsStr}${reasonNote}`, {
        details: {
          movements: this.maxMovements.size > 0 ? Object.fromEntries(this.maxMovements) : {},
          candleCounts: this.candleCount.size > 0 ? Object.fromEntries(this.candleCount) : {},
          positionsCreated: this.positionsCreatedCount,
          missedOpportunities: this.missedOpportunityCount,
          skippedTrades: this.skippedTradesCount
        }
      });
    }

    // Reset tracking for next period
    this.maxMovements.clear();
    this.candleCount.clear();
    this.positionsCreatedCount = 0;
    this.missedOpportunityCount = 0;
    this.skippedTradesCount = 0;
    this.lastSummaryTime = Date.now();
  }

  /**
   * Handle incoming 1min candle from Binance
   * @param {Object} candle - Tagged with crypto_symbol
   */
  async handleCandle(candle) {
    if (!candle.isClosed) return; // Only process closed candles
    if (!candle.crypto_symbol) {
      logger.warn('[spike-engine] Candle missing crypto_symbol, skipping');
      return;
    }

    // Check if this crypto is enabled
    const cryptoConfig = this.cryptoConfigs.get(candle.crypto_symbol);
    if (!cryptoConfig || !cryptoConfig.enabled) {
      return;
    }

    // Track candle movement for periodic summary
    const movement = Math.abs((candle.close - candle.open) / candle.open * 100);

    // Get crypto threshold for comparison
    const threshold = cryptoConfig.min_threshold_pct || 0.21;
    const movementStatus = movement >= threshold ? '⚡' : '';

    // DEBUG: Log candle reception with threshold comparison
    logger.info(`[spike-engine] 📊 Candle: ${candle.crypto_symbol} ${movement.toFixed(3)}% ${movementStatus}`, {
      movement: movement.toFixed(3) + '%',
      threshold: threshold.toFixed(2) + '%',
      aboveThreshold: movement >= threshold
    });

    const currentMax = this.maxMovements.get(candle.crypto_symbol) || 0;
    if (movement > currentMax) {
      this.maxMovements.set(candle.crypto_symbol, movement);
    }
    const currentCount = this.candleCount.get(candle.crypto_symbol) || 0;
    this.candleCount.set(candle.crypto_symbol, currentCount + 1);

    // Use candle CLOSE time for timing calculations (candle.timestamp is open time)
    // If candle is from 22:11-22:12, timestamp is 22:11 but we need 22:12
    const now = new Date(candle.timestamp.getTime() + 60 * 1000);

    // Process only markets for this specific crypto
    for (const [marketId, market] of this.activeMarkets) {
      if (market.crypto_symbol !== candle.crypto_symbol) {
        continue;
      }

      await this.processCycleForMarket(marketId, market, candle, now, cryptoConfig);
    }
  }

  /**
   * Process a market cycle
   * @param {String} marketId - Market condition ID
   * @param {Object} market - Market data
   * @param {Object} candle - Closed candle
   * @param {Date} now - Current time
   * @param {Object} cryptoConfig - Crypto configuration { enabled, min_threshold_pct, max_threshold_pct }
   */
  async processCycleForMarket(marketId, market, candle, now, cryptoConfig) {
    const cycleKey = marketId;

    // Check if market has started yet
    const startValue = market.startDate || market.startTime;
    if (!startValue) {
      logger.warn('[spike-engine] Market has no start time, skipping', { marketId: marketId.slice(0, 16) + '...' });
      return;
    }
    const marketStart = new Date(startValue);
    if (isNaN(marketStart.getTime())) {
      logger.error('[spike-engine] Invalid market start date', { marketId: marketId.slice(0, 16) + '...', startValue });
      return;
    }
    if (now < marketStart) return;

    // Initialize cycle if needed
    if (!this.activeCycles.has(cycleKey)) {
      // Determine current cycle boundaries (align to 5min intervals)
      const cycleStart = this.getCycleStart(now, market);
      const cycleEnd = new Date(cycleStart.getTime() + 5 * 60 * 1000);

      this.activeCycles.set(cycleKey, {
        marketId,
        cycleStart,
        cycleEnd,
        referencePrice: candle.open, // First candle open is reference
        signalFired: false,
        candles: []
      });

      logger.info('[spike-engine] New cycle started', {
        marketId: marketId.slice(0, 16) + '...',
        cycleStart: cycleStart.toISOString(),
        cycleEnd: cycleEnd.toISOString(),
        referencePrice: candle.open
      });
    }

    const cycle = this.activeCycles.get(cycleKey);

    // Check if cycle has ended
    if (now >= cycle.cycleEnd) {
      await this.resolveCycle(cycleKey);
      // Don't return - process this candle for the new cycle that will be created on next call
      // The cycle was deleted in resolveCycle, so next candle will initialize a new one
      return;
    }

    // Add candle to cycle (limit array size to prevent memory leak)
    if (cycle.candles.length < 10) {  // Only keep last 10 candles
      cycle.candles.push(candle);
    }

    // Calculate which minute we're at (0-4) with protection against negative values
    const minuteInCycle = Math.max(0, Math.min(4, Math.floor((now - cycle.cycleStart) / (60 * 1000))));
    const movement = Math.abs((candle.close - candle.open) / candle.open * 100);
    const threshold = cryptoConfig.min_threshold_pct || 0.21;

    // Log why we're not checking for signals
    if (cycle.signalFired) {
      // Signal already fired in this cycle
      if (movement >= threshold) {
        logger.info(`[spike-engine] 🔕 Signal check skipped - already fired in cycle`, {
          crypto: market.crypto_symbol,
          movement: movement.toFixed(3) + '%',
          threshold: threshold.toFixed(2) + '%',
          minuteInCycle: `T+${minuteInCycle}`,
          cycleEnd: cycle.cycleEnd.toISOString().substring(11, 16)
        });
      }
    } else if (minuteInCycle === 0 || minuteInCycle > 4) {
      // Outside signal check window (T+0 or T+5+)
      if (movement >= threshold) {
        const reason = minuteInCycle === 0 ? 'T+0 not checked yet (will check at T+1)' : 'T+5+ too late (market closing)';
        logger.warn(`[spike-engine] ⏭️  Signal ignored - wrong timing window`, {
          crypto: market.crypto_symbol,
          movement: movement.toFixed(3) + '%',
          threshold: threshold.toFixed(2) + '%',
          minuteInCycle: `T+${minuteInCycle}`,
          reason: reason,
          cycleEnd: cycle.cycleEnd.toISOString().substring(11, 16)
        });

        // Log SKIPPED trades for T+5+ (market closing)
        // T+0 is expected and will be checked at T+1
        if (minuteInCycle > 4) {
          const signalType = candle.close > candle.open ? 'BUY_YES' : 'BUY_NO';
          await log('trade_skipped', `⏭️ ${market.crypto_symbol} ${signalType} SKIPPED - ${reason} (${movement.toFixed(2)}%)`, {
            cryptoSymbol: market.crypto_symbol,
            marketId,
            details: {
              reason: 'market_closing',
              minuteInCycle: `T+${minuteInCycle}`,
              movement: movement.toFixed(3) + '%',
              threshold: threshold.toFixed(2) + '%',
              marketSlug: market.slug,
              note: 'T+5 and later - market has closed or is closing'
            }
          });
          this.skippedTradesCount++; // Track for summary
        }
      }
    }

    // Check for signal (only if not already fired)
    // We check candles T+0, T+1, T+2 when they CLOSE (at times T+1, T+2, T+3)
    // At time 01:00 (minuteInCycle=1): the candle from 00:00-00:59 (T+0) just closed
    // At time 02:00 (minuteInCycle=2): the candle from 01:00-01:59 (T+1) just closed
    // At time 03:00 (minuteInCycle=3): the candle from 02:00-02:59 (T+2) just closed
    // T+3 candle (checked at T+4) is intentionally skipped — only 1 min left, too late to trade
    if (!cycle.signalFired && minuteInCycle >= 1 && minuteInCycle <= 3) {
      const candleMinute = minuteInCycle - 1; // The minute of the candle that just closed (0, 1, or 2)

      logger.info(`[spike-engine] 🔍 Checking for signal`, {
        crypto: market.crypto_symbol,
        movement: movement.toFixed(3) + '%',
        threshold: threshold.toFixed(2) + '%',
        checkingCandle: `T+${candleMinute}`,
        atTime: `T+${minuteInCycle}`,
        cycleEnd: cycle.cycleEnd.toISOString().substring(11, 16)
      });

      // CRITICAL: Set signal fired flag IMMEDIATELY to prevent race conditions
      // If multiple candles arrive rapidly, they could all pass the check above
      // before any of them complete the async trade execution and set this flag
      cycle.signalFired = true;

      // Tag this cycle in the OHLC logger so price data is marked spike_detected=true
      ohlcLogger.markSpike(market.crypto_symbol);

      // T123-FUSION MODE: Check multiple strategies in tiered order
      const strategiesToCheck = [];
      let spikeAlertSent = false; // Fire notification once per candle detection

      if (config.FUSION_MODE) {
        // T123-FUSION: Check strategies in priority order (QUALITY first, then VOLUME)
        // QUALITY tier (T123-1MIN-HL) - more selective, larger position size
        if (config.FUSION_STRATEGIES['T123-1MIN-HL']?.enabled && config.STRATEGIES['T123-1MIN-HL']) {
          strategiesToCheck.push({
            id: 'T123-1MIN-HL',
            config: config.STRATEGIES['T123-1MIN-HL'],
            positionSizePct: config.FUSION_STRATEGIES['T123-1MIN-HL'].positionSizePct,
            tier: config.FUSION_STRATEGIES['T123-1MIN-HL'].tier
          });
        }

        // VOLUME tier (T123-1MIN) - less selective, smaller position size
        if (config.FUSION_STRATEGIES['T123-1MIN']?.enabled && config.STRATEGIES['T123-1MIN']) {
          strategiesToCheck.push({
            id: 'T123-1MIN',
            config: config.STRATEGIES['T123-1MIN'],
            positionSizePct: config.FUSION_STRATEGIES['T123-1MIN'].positionSizePct,
            tier: config.FUSION_STRATEGIES['T123-1MIN'].tier
          });
        }
      } else {
        // Single strategy mode (current behavior)
        const strategyConfig = config.STRATEGIES[this.detectionStrategy];
        strategiesToCheck.push({
          id: this.detectionStrategy,
          config: strategyConfig,
          positionSizePct: config.POSITION_SIZE_PCT,
          tier: 'SINGLE'
        });
      }

      // Check each strategy for signals
      let signalDetected = false;
      for (const strategy of strategiesToCheck) {
        const minThreshold = strategy.config.minThreshold || 0.20;
        const maxThreshold = strategy.config.maxThreshold || 2.0;

        const signal = detector.detectSignal(
          candle,
          cycle.referencePrice,
          candleMinute,
          market,
          minThreshold,
          maxThreshold,
          strategy.id
        );

        if (signal) {
          signalDetected = true;

          // Send desktop notification once per candle (before any trading filters)
          if (!spikeAlertSent) {
            spikeAlertSent = true;
            notifier.sendSpikeAlert(signal, market, minuteInCycle).catch(() => {});
            // Start reversion tracker — monitors live price for counter-spike exit signal
            reversionTracker.watch(
              market.crypto_symbol,
              signal.type,           // 'UP' or 'DOWN'
              signal.candle.close,   // Binance spike candle close price
              cycle.referencePrice,  // Cycle T+0 open price
              cycle.cycleEnd
            );
          }

          // Calculate position size based on strategy and balance
          let positionSize = Math.max(
            Math.round(this.currentCapital * strategy.positionSizePct / 100 * 100) / 100,
            config.MIN_POSITION_SIZE_USD
          );

          // Skip if balance is too low to meet minimum
          if (this.currentCapital * strategy.positionSizePct / 100 < config.MIN_POSITION_SIZE_USD * 0.99) {
            logger.warn('[spike-engine] Insufficient balance for minimum position size, skipping strategy', {
              crypto: market.crypto_symbol,
              strategy: strategy.id,
              calculatedSize: (this.currentCapital * strategy.positionSizePct / 100).toFixed(2),
              minimum: config.MIN_POSITION_SIZE_USD,
              capital: this.currentCapital.toFixed(2),
              positionPct: strategy.positionSizePct
            });
            continue; // Skip this strategy, check next one
          }

          // Check emergency stop
          if (this.emergencyStop) {
            const hoursActive = this.emergencyStopActivatedAt ? ((Date.now() - this.emergencyStopActivatedAt) / 3600000).toFixed(1) : 'unknown';
            const reason = this.emergencyStopReason || 'Consecutive trade failures';

            logger.warn('[spike-engine] ⚠️  EMERGENCY STOP ACTIVE - Trade skipped', {
              crypto: market.crypto_symbol,
              marketId: marketId.slice(0, 16) + '...',
              strategy: strategy.id,
              signalType: signal.type,
              stopReason: reason,
              activeForHours: hoursActive
            });
            const _wsEs = clobWebsocket.getPrice(market.crypto_symbol);
            const _epEs = _wsEs ? (signal.type === 'BUY_YES' ? _wsEs.up : _wsEs.down) : null;
            await logMissedOpportunity({
              cryptoSymbol: market.crypto_symbol,
              marketId,
              marketQuestion: market.question,
              signalType: signal.type,
              signalMinute: signal.minute,
              candleMovementPct: signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100),
              reason: 'emergency_stop',
              entryPrice: _epEs,
              maxEntryPrice: this.maxEntryPrice,
              availableCapital: this.currentCapital,
              wouldBePositionSize: positionSize,
              details: {
                marketSlug: market.slug,
                strategy: strategy.id,
                stopReason: reason,
                activeForHours: hoursActive
              }
            });
            this.missedOpportunityCount++; // Track for summary
            continue; // Try next strategy
          }

          // Check total exposure limit (across all cryptos)
          const totalExposure = Array.from(this.exposurePerCrypto.values()).reduce((sum, val) => sum + val, 0);
          const totalExposurePct = (totalExposure / this.currentCapital) * 100;

          if (totalExposurePct + (positionSize / this.currentCapital * 100) > this.maxCapitalRiskPct) {
            logger.warn('[spike-engine] Max total exposure reached, skipping trade', {
              crypto: market.crypto_symbol,
              strategy: strategy.id,
              totalExposure: totalExposure.toFixed(2),
              totalExposurePct: totalExposurePct.toFixed(1) + '%',
              maxAllowed: this.maxCapitalRiskPct + '%',
              wouldBe: (totalExposurePct + (positionSize / this.currentCapital * 100)).toFixed(1) + '%'
            });
            const _wsEl = clobWebsocket.getPrice(market.crypto_symbol);
            const _epEl = _wsEl ? (signal.type === 'BUY_YES' ? _wsEl.up : _wsEl.down) : null;
            await logMissedOpportunity({
              cryptoSymbol: market.crypto_symbol,
              marketId,
              marketQuestion: market.question,
              signalType: signal.type,
              signalMinute: signal.minute,
              candleMovementPct: signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100),
              reason: 'exposure_limit_exceeded',
              entryPrice: _epEl,
              maxEntryPrice: this.maxEntryPrice,
              currentExposurePct: totalExposurePct,
              maxExposurePct: this.maxCapitalRiskPct,
              availableCapital: this.currentCapital,
              wouldBePositionSize: positionSize,
              details: { marketSlug: market.slug, strategy: strategy.id }
            });
            this.missedOpportunityCount++; // Track for summary
            continue; // Try next strategy
          }

          // Fetch token price for signal log
          let tokenPrice = null;
          try {
            // Determine which outcome we're trading
            const targetOutcome = signal.type === 'BUY_YES' ? 'Up' : 'Down';
            const token = market.tokens?.find(t => t.outcome === targetOutcome);

            if (token && token.token_id) {
              const orderbook = await clobApi.getOrderBook(token.token_id);
              tokenPrice = orderbook?.bestAsk || null;
            }
          } catch (err) {
            logger.warn('[spike-engine] Failed to fetch token price for signal', { error: err.message });
          }

          // Log signal detection
          const movementDesc = signal.candle.hlPct
            ? `HL=${signal.candle.hlPct.toFixed(2)}%, OC=${signal.candle.ocPct.toFixed(2)}%`
            : `${(signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100)).toFixed(2)}%`;

          const priceDesc = tokenPrice ? ` @ ${(tokenPrice * 100).toFixed(0)}¢` : '';

          await log('signal_detected', `${market.crypto_symbol} ${signal.type} @ T+${signal.minute} - ${movementDesc}${priceDesc}`, {
            cryptoSymbol: market.crypto_symbol,
            marketId,
            details: {
              strategy: strategy.id,
              tier: strategy.tier,
              signalType: signal.type,
              signalMinute: signal.minute,
              candleMovement: signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100),
              hlPct: signal.candle.hlPct,
              ocPct: signal.candle.ocPct,
              positionSize,
              positionPct: strategy.positionSizePct,
              fusionMode: config.FUSION_MODE,
              marketSlug: market.slug,
              marketPrice: tokenPrice
            }
          });

          // Log real-time CLOB prices vs theoretical binary-option fair value
          const _spikePct = signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100);

          // Polymarket (5-min market)
          spikePriceLogger.recordPolymarket({
            crypto:         market.crypto_symbol,
            signalType:     signal.type,
            spikePct:       _spikePct,
            minuteInCycle,
            cycleEnd:       cycle.cycleEnd,
            referencePrice: cycle.referencePrice,
            spikePrice:     signal.candle.close,
            clobPrices:     clobWebsocket.getLatestPrices()[market.crypto_symbol]
          });

          // Kalshi (15-min market) — only if configured
          spikePriceLogger.recordKalshi({
            crypto:         market.crypto_symbol,
            signalType:     signal.type,
            spikePct:       _spikePct,
            minuteInCycle,
            minsRemaining:  kalshiWebsocket.getMinsRemaining(market.crypto_symbol),
            referencePrice: cycle.referencePrice,
            spikePrice:     signal.candle.close,
            kalshiPrices:   kalshiWebsocket.getLatestPrices()[market.crypto_symbol]
          });

          // Send detailed manual trading signal to Telegram
          await telegram.notifyManualTradingSignal({
            crypto: market.crypto_symbol,
            signalType: signal.type,
            signalMinute: signal.minute,
            candleMovement: signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100),
            entryPrice: tokenPrice || 0.5,
            positionSize: positionSize,
            marketSlug: market.slug,
            marketQuestion: market.question,
            details: {
              strategy: strategy.id,
              tier: strategy.tier,
              currentCapital: this.currentCapital
            }
          });

          // Execute trade based on mode
          let tradeExecuted = false;
          if (this.tradingMode === 'LIVE') {
            tradeExecuted = await this.executeLiveTrade(marketId, market, cycle, signal, positionSize, strategy.id);
          } else {
            tradeExecuted = await this.executeSimulatedTrade(marketId, market, cycle, signal, positionSize, strategy.id);
          }

          // Update exposure tracking ONLY if trade was actually executed
          if (tradeExecuted) {
            this.exposurePerCrypto.set(
              market.crypto_symbol,
              (this.exposurePerCrypto.get(market.crypto_symbol) || 0) + positionSize
            );
            this.positionsCreatedCount++; // Track for summary

            // Mark cycle as signal fired (only after first successful trade)
            cycle.signalFired = true;

            logger.info('[spike-engine] Trade executed, marking cycle complete', {
              marketId: marketId.slice(0, 16) + '...',
              strategy: strategy.id,
              tier: strategy.tier,
              positionSize: positionSize.toFixed(2)
            });

            break; // Don't check other strategies for this cycle
          } else {
            // Trade failed - mark cycle as fired anyway to prevent retry with different strategy
            // This prevents multiple failed attempts on same market in same cycle
            cycle.signalFired = true;

            logger.warn('[spike-engine] Trade failed but marking cycle complete to prevent retry', {
              marketId: marketId.slice(0, 16) + '...',
              strategy: strategy.id,
              reason: 'Prevents duplicate trade attempts on same market'
            });

            break; // Stop trying other strategies after first attempt (success or fail)
          }
        }
      }

      // Log if no signal was detected from any strategy
      if (!signalDetected) {
        // CRITICAL FIX: Reset signalFired flag so later candles in this cycle can still fire
        // We set it to true preemptively (line 1044) to prevent race conditions,
        // but if no valid signal was found, we need to reset it
        cycle.signalFired = false;

        logger.info(`[spike-engine] ❌ No signal detected - cycle remains open`, {
          crypto: market.crypto_symbol,
          movement: movement.toFixed(3) + '%',
          threshold: threshold.toFixed(2) + '%',
          checkingCandle: `T+${candleMinute}`,
          reason: movement < threshold ? 'Below threshold' : 'Above max threshold or other filter',
          cycleEnd: cycle.cycleEnd.toISOString().substring(11, 16)
        });
      }
    } else if (!cycle.signalFired && minuteInCycle >= 4) {
      // T+3 candle and beyond — too late to trade (< 1 min left in cycle)
      logger.debug(`[spike-engine] ⏭️ T+${minuteInCycle} — too late to enter, skipping`, {
        crypto: market.crypto_symbol,
        movement: movement.toFixed(3) + '%'
      });
    }
  }

  /**
   * Get cycle start time aligned to market schedule
   */
  getCycleStart(now, market) {
    // Align to 5-minute intervals from market start
    const marketStart = new Date(market.startDate || market.startTime);
    const elapsed = now - marketStart;
    const cycleNumber = Math.floor(elapsed / (5 * 60 * 1000));
    return new Date(marketStart.getTime() + cycleNumber * 5 * 60 * 1000);
  }

  /**
   * Execute a simulated trade (paper trading) with realistic capital tracking
   * @param {String} marketId - Market condition ID
   * @param {Object} market - Market data
   * @param {Object} cycle - Cycle state
   * @param {Object} signal - Signal from detector
   * @param {Number} positionSize - Pre-calculated position size in USD
   * @param {String} strategyId - Strategy ID (e.g., 'T123-1MIN', 'T123-1MIN-HL')
   */
  async executeSimulatedTrade(marketId, market, cycle, signal, positionSize, strategyId = 'T123-1MIN') {
    try {
      // Validate position size
      if (positionSize < 1) {
        logger.warn('[spike-engine] Position size too small, skipping trade', {
          capital: this.currentCapital,
          positionSize
        });
        return false;
      }

      if (positionSize > this.currentCapital) {
        logger.error('[spike-engine] Position size exceeds capital (calculation error)', {
          capital: this.currentCapital,
          positionSize,
          positionPct: config.POSITION_SIZE_PCT
        });
        return false;
      }

      if (isNaN(positionSize) || positionSize <= 0) {
        logger.error('[spike-engine] Invalid position size', {
          capital: this.currentCapital,
          positionSize
        });
        return false;
      }

      // Get token IDs from cached market data (avoid extra API call that may fail)
      if (!market.tokens || market.tokens.length === 0) {
        logger.warn('[spike-engine] No token IDs in market data, skipping trade', {
          marketId: marketId.slice(0, 16) + '...'
        });
        return false;
      }

      // Find the token for the desired outcome (Up/Down or Yes/No)
      const targetOutcome = signal.type === 'BUY_YES' ? 'Up' : 'Down';
      const token = market.tokens.find(t => t.outcome === targetOutcome);

      if (!token || !token.token_id) {
        logger.warn('[spike-engine] Token ID not found for outcome, skipping trade', {
          marketId: marketId.slice(0, 16) + '...',
          targetOutcome,
          availableTokens: market.tokens.map(t => ({ outcome: t.outcome, id: t.token_id?.slice(0, 8) }))
        });
        return false;
      }

      const tokenId = token.token_id;

      // Fetch orderbook for the specific token from CLOB API
      // Retry up to 3 times (1.5s apart) — transient CLOB latency can cause momentary empty books
      let orderbook = null;
      const MAX_ORDERBOOK_RETRIES = 3;
      const ORDERBOOK_RETRY_DELAY_MS = 1500;
      for (let attempt = 1; attempt <= MAX_ORDERBOOK_RETRIES; attempt++) {
        orderbook = await clobApi.getOrderBook(tokenId);
        if (orderbook && orderbook.bestAsk) break;
        if (attempt < MAX_ORDERBOOK_RETRIES) {
          logger.warn('[spike-engine] No orderbook data, retrying...', {
            marketId: marketId.slice(0, 16) + '...',
            tokenId: tokenId.slice(0, 16) + '...',
            outcome: targetOutcome,
            attempt
          });
          await new Promise(r => setTimeout(r, ORDERBOOK_RETRY_DELAY_MS));
        }
      }

      if (!orderbook || !orderbook.bestAsk) {
        logger.warn('[spike-engine] No orderbook data available after retries, skipping trade', {
          marketId: marketId.slice(0, 16) + '...',
          tokenId: tokenId.slice(0, 16) + '...',
          outcome: targetOutcome,
          retriesAttempted: MAX_ORDERBOOK_RETRIES
        });
        const signalDirNoLiq = signal.type === 'BUY_YES' ? 'UP ↗' : 'DOWN ↘';
        await log('trade_aborted', `⚠️ ${market.crypto_symbol} ${signalDirNoLiq} - No liquidity (0 asks after ${MAX_ORDERBOOK_RETRIES} retries)`, {
          cryptoSymbol: market.crypto_symbol,
          marketId,
          details: { signal, targetOutcome }
        });
        await logMissedOpportunity({
          cryptoSymbol: market.crypto_symbol,
          marketId,
          marketQuestion: market.question,
          signalType: signal.type,
          signalMinute: signal.minute,
          candleMovementPct: signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100),
          reason: 'no_liquidity',
          wouldBePositionSize: positionSize,
          details: { marketSlug: market.slug }
        });
        this.missedOpportunityCount++;
        return false;
      }

      // Calculate entry price with realistic slippage (same as copy-trading)
      let entryPrice = clobApi.calculateEntryPrice(
        orderbook.bestAsk,
        config.SLIPPAGE_TOLERANCE_PCT
      );

      // Log token mapping and prices for debugging
      logger.info('[spike-engine] Token orderbook fetched', {
        crypto: market.crypto_symbol,
        signalType: signal.type,
        targetOutcome,
        tokenId: tokenId.slice(0, 16) + '...',
        bestAsk: orderbook.bestAsk?.toFixed(3),
        bestBid: orderbook.bestBid?.toFixed(3),
        spread: orderbook.spread?.toFixed(4),
        entryPrice: entryPrice.toFixed(3),
        allTokens: market.tokens.map(t => t.outcome).join(', ')
      });

      // entry_path tracks how this trade was entered:
      //   MOMENTUM     — direct entry (price ≤ 90¢ at signal time)
      //   REBOUND      — price was > 90¢, monitored until it dropped ≤ 90¢ (after FADE SKIPPED)
      //   FADE         — counter-token entry (set inside FADE block)
      //   FADE_REBOUND — REBOUND that followed a FADE GTC exit (set inside FADE block)
      let _paperEntryPath = 'MOMENTUM';

      // Price filter: Monitor price if too expensive, wait for reversion
      if (entryPrice > this.maxEntryPrice) {
        // Check if already monitoring this market (prevent concurrent monitoring)
        if (this.activeMonitoring.has(marketId)) {
          logger.warn('[spike-engine] Already monitoring this market, skipping duplicate', {
            marketId: marketId.slice(0, 16) + '...',
            crypto: market.crypto_symbol
          });
          return false;
        }

        // ── FADE V2 ──────────────────────────────────────────────────────────
        // Backtest (34.7 days, 18,437 signals): momentum token >90¢ → Fade EV up to +6.3%
        // Buy the OPPOSITE token (NO on UP spike) instead of monitoring for price drop
        {
          const _fadeOutcome    = signal.type === 'BUY_YES' ? 'Down' : 'Up';
          const _fadeSignalType = signal.type === 'BUY_YES' ? 'FADE_NO' : 'FADE_YES';
          const _fadeToken      = market.tokens.find(t => t.outcome === _fadeOutcome);
          if (_fadeToken?.token_id) {
            let _fadeOb = null;
            for (let _fa = 1; _fa <= 3; _fa++) {
              _fadeOb = await clobApi.getOrderBook(_fadeToken.token_id);
              if (_fadeOb?.bestAsk) break;
              if (_fa < 3) await new Promise(r => setTimeout(r, 1500));
            }
            if (_fadeOb?.bestAsk && _fadeOb.bestAsk >= config.MIN_FADE_ENTRY_PRICE && _fadeOb.bestAsk <= config.MAX_FADE_ENTRY_PRICE) {
              const _fadeCandlePct   = signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100);
              const _fadeEntryPx     = clobApi.calculateEntryPrice(_fadeOb.bestAsk, config.SLIPPAGE_TOLERANCE_PCT);
              const _fadeSlippagePct = ((_fadeEntryPx - _fadeOb.bestAsk) / _fadeOb.bestAsk) * 100;
              const _fadeShares      = positionSize / _fadeEntryPx;
              const _fadeExitTarget  = getFadeExitTarget(_fadeOb.bestAsk);
              logger.info('[spike-engine] 🔄 FADE V2 — counter-trade executing (PAPER)', {
                crypto: market.crypto_symbol,
                fadeSignalType: _fadeSignalType,
                momentumPrice: (entryPrice * 100).toFixed(0) + '¢',
                fadePrice: (_fadeEntryPx * 100).toFixed(0) + '¢',
                exitTarget: _fadeExitTarget ? (_fadeExitTarget * 100).toFixed(0) + '¢' : 'hold-to-resolution',
                shares: _fadeShares.toFixed(0),
                positionSize: positionSize.toFixed(2)
              });
              await query(`
                INSERT INTO spike_trades_simulated (
                  timestamp, market_id, market_question, market_slug,
                  cycle_start_time, cycle_end_time, signal_minute,
                  reference_price, candle_open, candle_high, candle_low, candle_close, candle_range_pct,
                  polymarket_best_ask, simulated_entry_price,
                  signal_type, outcome,
                  position_size_usd, capital_before, order_book_depth, actual_slippage_pct,
                  crypto_symbol, entry_path,
                  notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
              `, [
                new Date(),
                marketId,
                market.question,
                market.slug,
                cycle.cycleStart,
                cycle.cycleEnd,
                signal.minute,
                cycle.referencePrice,
                signal.candle.open,
                signal.candle.high,
                signal.candle.low,
                signal.candle.close,
                _fadeCandlePct,
                _fadeOb.bestAsk,
                _fadeEntryPx,
                _fadeSignalType,
                'PENDING',
                positionSize,
                this.currentCapital,
                _fadeOb.askDepth || 0,
                _fadeSlippagePct,
                market.crypto_symbol,
                'FADE',
                `[${strategyId}] FADE paper — ${positionSize.toFixed(2)} USD @ ${_fadeEntryPx.toFixed(3)} (momentum was ${(entryPrice * 100).toFixed(0)}¢)`
              ]);
              await log('fade_executed', `${market.crypto_symbol} ${_fadeSignalType} ↩ FADE — ${_fadeShares.toFixed(0)} shares @ ${(_fadeEntryPx * 100).toFixed(0)}¢ ($${positionSize.toFixed(2)}) vs ${(entryPrice * 100).toFixed(0)}¢ momentum`, {
                cryptoSymbol: market.crypto_symbol,
                marketId,
                details: {
                  fadeSignalType: _fadeSignalType,
                  fadeEntryPrice: _fadeEntryPx,
                  momentumEntryPrice: entryPrice,
                  positionSize,
                  strategy: strategyId
                }
              });
              telegram.notifyTradeOpened({
                market_id: marketId,
                market_question: market.question,
                crypto_symbol: market.crypto_symbol,
                signal_type: _fadeSignalType,
                signal_minute: signal.minute,
                simulated_entry_price: _fadeEntryPx,
                position_size_usd: positionSize,
                candle_range_pct: _fadeCandlePct,
                capital_before: this.currentCapital,
                timestamp: new Date()
              }, 'PAPER');

              // ── GTC Exit Monitoring + REBOUND (PAPER) ────────────────────────
              // If we have a GTC exit target AND both token IDs, watch for the
              // FADE position to hit its take-profit, then optionally enter REBOUND.
              if (_fadeExitTarget && _fadeToken?.token_id && tokenId) {
                const _fadeExitMonitor = monitorFadeExit(market, _fadeToken.token_id, _fadeExitTarget, this);
                const _fadeMonitorKey  = marketId + '_fade';
                this.activeMonitoring.set(_fadeMonitorKey, { cancel: _fadeExitMonitor.cancel, crypto: market.crypto_symbol });

                let _fadeExit;
                try {
                  _fadeExit = await _fadeExitMonitor.promise;
                } finally {
                  this.activeMonitoring.delete(_fadeMonitorKey);
                }

                if (_fadeExit.filled) {
                  const _fadeExitProfit = (_fadeExit.exitPrice - _fadeEntryPx) * _fadeShares;
                  // Persist the GTC exit details on the FADE trade row
                  await query(
                    `UPDATE spike_trades_simulated
                       SET fade_exit_price = $1,
                           fade_exit_time  = NOW(),
                           notes           = notes || $2
                     WHERE market_id   = $3
                       AND signal_type = $4
                       AND timestamp   > NOW() - INTERVAL '10 minutes'`,
                    [
                      _fadeExit.exitPrice,
                      ` | GTC @${(_fadeExit.exitPrice * 100).toFixed(0)}¢ +$${_fadeExitProfit.toFixed(2)}`,
                      marketId,
                      _fadeSignalType,
                    ]
                  );
                  logger.info('[spike-engine] 💰 FADE GTC PROFIT LOCKED — monitoring for REBOUND', {
                    crypto:    market.crypto_symbol,
                    fadeEntry: (_fadeEntryPx * 100).toFixed(0) + '¢',
                    fadeExit:  (_fadeExit.exitPrice * 100).toFixed(0) + '¢',
                    profit:    '$' + _fadeExitProfit.toFixed(2),
                  });

                  // REBOUND: watch momentum (YES) token for ask ≤ maxEntryPrice (90¢)
                  // approxYesPrice ≈ 1 - NO bid at exit (for logging only; CLOB polling is authoritative)
                  const _approxYesNow = Math.min(0.99, 1 - _fadeExit.exitPrice + 0.02);
                  const _reboundMonitor = monitorPriceUntilAcceptable(market, signal, _approxYesNow, this.maxEntryPrice, this, tokenId);
                  this.activeMonitoring.set(marketId, { cancel: _reboundMonitor.cancel, crypto: market.crypto_symbol });

                  let _reboundOk = false;
                  try {
                    _reboundOk = await _reboundMonitor.promise;
                  } finally {
                    this.activeMonitoring.delete(marketId);
                  }

                  if (_reboundOk) {
                    const _reboundOb = await clobApi.getOrderBook(tokenId);
                    if (_reboundOb?.bestAsk && _reboundOb.bestAsk <= this.maxEntryPrice) {
                      const _reboundEntryPx    = clobApi.calculateEntryPrice(_reboundOb.bestAsk, config.SLIPPAGE_TOLERANCE_PCT);
                      const _reboundShares     = positionSize / _reboundEntryPx;
                      const _reboundCandlePct  = signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100);
                      const _reboundSignalType = signal.type === 'BUY_YES' ? 'REBOUND_YES' : 'REBOUND_NO';
                      await query(`
                        INSERT INTO spike_trades_simulated (
                          timestamp, market_id, market_question, market_slug,
                          cycle_start_time, cycle_end_time, signal_minute,
                          reference_price, candle_open, candle_high, candle_low, candle_close, candle_range_pct,
                          polymarket_best_ask, simulated_entry_price,
                          signal_type, outcome,
                          position_size_usd, capital_before, order_book_depth, actual_slippage_pct,
                          crypto_symbol, entry_path,
                          notes
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
                      `, [
                        new Date(), marketId, market.question, market.slug,
                        cycle.cycleStart, cycle.cycleEnd, signal.minute,
                        cycle.referencePrice, signal.candle.open, signal.candle.high,
                        signal.candle.low, signal.candle.close, _reboundCandlePct,
                        _reboundOb.bestAsk, _reboundEntryPx,
                        _reboundSignalType, 'PENDING',
                        positionSize, this.currentCapital, _reboundOb.askDepth || 0,
                        ((_reboundEntryPx - _reboundOb.bestAsk) / _reboundOb.bestAsk) * 100,
                        market.crypto_symbol, 'FADE_REBOUND',
                        `[${strategyId}] REBOUND after FADE GTC — ${_reboundShares.toFixed(0)} shares @ ${(_reboundEntryPx * 100).toFixed(0)}¢ (FADE +$${_fadeExitProfit.toFixed(2)})`,
                      ]);
                      logger.info('[spike-engine] 🔃 REBOUND EXECUTED (after FADE GTC exit, PAPER)', {
                        crypto:      market.crypto_symbol,
                        reboundPrice: (_reboundEntryPx * 100).toFixed(0) + '¢',
                        fadeProfit:  '$' + _fadeExitProfit.toFixed(2),
                      });
                      telegram.notifyTradeOpened({
                        market_id: marketId, market_question: market.question,
                        crypto_symbol: market.crypto_symbol, signal_type: _reboundSignalType,
                        signal_minute: signal.minute, simulated_entry_price: _reboundEntryPx,
                        position_size_usd: positionSize, candle_range_pct: _reboundCandlePct,
                        capital_before: this.currentCapital, timestamp: new Date(),
                      }, 'PAPER');
                    }
                  }
                }
              }
              return true; // FADE (+ optional GTC exit + REBOUND) complete
            } else if (_fadeOb?.bestAsk) {
              // Counter too expensive to enter as fade.
              // Log + persist for distribution analysis — but suppress fully-resolved ghost markets
              // (spread > 50¢ means the market has already settled: e.g. counterAsk=99¢, counterBid=1¢).
              const counterBidVal  = _fadeOb.bestBid || 0;
              const counterAskVal  = _fadeOb.bestAsk;
              const spreadVal      = counterAskVal - counterBidVal;
              const counterDepth   = _fadeOb.askDepth || 0;
              if (spreadVal < 0.50) {
                logger.info('[spike-engine] 📊 FADE SKIPPED (PAPER) — counter too expensive', {
                  crypto:       market.crypto_symbol,
                  counterAsk:   (counterAskVal * 100).toFixed(1) + '¢',
                  counterBid:   (counterBidVal * 100).toFixed(1) + '¢',
                  counterDepth,
                  spread:       (spreadVal * 100).toFixed(1) + '¢',
                  momentumPrice: (entryPrice * 100).toFixed(1) + '¢',
                  maxFadeEntry: (config.MAX_FADE_ENTRY_PRICE * 100).toFixed(0) + '¢'
                });
                query(
                  `INSERT INTO spike_fade_observations
                     (crypto_symbol, signal_type, signal_minute, spike_pct,
                      momentum_ask, counter_ask, counter_bid, counter_ask_depth, spread, market_slug, mode)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PAPER')`,
                  [
                    market.crypto_symbol,
                    signal.type,
                    signal.minute,
                    signal.candle?.movementPct ?? null,
                    entryPrice,
                    counterAskVal,
                    counterBidVal,
                    counterDepth,
                    spreadVal,
                    market.slug ?? null
                  ]
                ).catch(err => logger.error('[spike-engine] fade obs insert failed', { error: err.message }));
              }
            }
          }
        }
        // Fade counter-token unavailable or too expensive — fall through to standard monitoring

        // Start monitoring
        const monitoring = monitorPriceUntilAcceptable(market, signal, entryPrice, this.maxEntryPrice, this, tokenId);
        this.activeMonitoring.set(marketId, { cancel: monitoring.cancel, crypto: market.crypto_symbol });

        let priceAcceptable = false;
        try {
          priceAcceptable = await monitoring.promise;
        } finally {
          // Always cleanup tracking
          this.activeMonitoring.delete(marketId);
        }

        if (!priceAcceptable) {
          logger.warn('[spike-engine] Price monitoring ended - price never became acceptable', {
            marketId: marketId.slice(0, 16) + '...',
            initialPrice: entryPrice.toFixed(3),
            maxAllowed: this.maxEntryPrice,
            signalType: signal.type
          });

          // Log as MISSED OPPORTUNITY - valid signal but price too expensive
          await logMissedOpportunity({
            cryptoSymbol: market.crypto_symbol,
            marketId,
            marketQuestion: market.question,
            signalType: signal.type,
            signalMinute: signal.minute,
            candleMovementPct: signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100),
            reason: 'price_too_high',
            entryPrice: entryPrice,
            maxEntryPrice: this.maxEntryPrice,
            orderBookDepth: orderbook.depth || null,
            availableCapital: this.currentCapital,
            wouldBePositionSize: positionSize,
            details: {
              marketSlug: market.slug,
              strategy: strategyId,
              initialPrice: entryPrice.toFixed(4),
              maxAllowed: this.maxEntryPrice.toFixed(4),
              priceInCents: (entryPrice * 100).toFixed(0) + '¢',
              note: 'Market price remained above max entry price until market close'
            }
          });
          this.missedOpportunityCount++; // Track for summary

          return false;
        }

        // Price acceptable now - this trade arrived via price monitoring (REBOUND path)
        _paperEntryPath = 'REBOUND';

        // Refresh orderbook before proceeding
        logger.info('[spike-engine] Refreshing orderbook after price monitoring', { crypto: market.crypto_symbol });

        let refreshedOrderbook = await clobApi.getOrderBook(tokenId);

        // If orderbook fetch fails, use cached WebSocket price with staleness check
        if (!refreshedOrderbook || !refreshedOrderbook.bestAsk) {
          logger.warn('[spike-engine] Orderbook fetch failed, checking cached WebSocket price', {
            crypto: market.crypto_symbol
          });

          const MAX_STALE_MS = 3000; // 3 seconds maximum staleness
          const cachedPrice = clobWebsocket.getPrice(market.crypto_symbol);

          if (cachedPrice && cachedPrice.updatedAt) {
            const priceAge = Date.now() - cachedPrice.updatedAt.getTime();

            if (priceAge > MAX_STALE_MS) {
              // Price too stale - wait and retry
              logger.info('[spike-engine] Cached price too stale, waiting 2s for fresh data...', {
                crypto: market.crypto_symbol,
                priceAge: Math.floor(priceAge / 1000) + 's'
              });

              // Check if we have time before market closes
              const now = new Date();
              const marketEnd = new Date(market.endDate);
              const timeUntilClose = marketEnd - now;

              if (timeUntilClose > 2000) {
                // Wait 2 seconds for fresh WebSocket update
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Retry orderbook fetch
                refreshedOrderbook = await clobApi.getOrderBook(tokenId);

                if (!refreshedOrderbook || !refreshedOrderbook.bestAsk) {
                  // Still failed, try cached price again
                  const retryCache = clobWebsocket.getPrice(market.crypto_symbol);
                  const retryAge = retryCache?.updatedAt ? Date.now() - retryCache.updatedAt.getTime() : 999999;

                  if (retryAge <= MAX_STALE_MS) {
                    // Use cached WebSocket price
                    const cachedAsk = signal.type === 'BUY_YES' ? retryCache.up : retryCache.down;
                    logger.info('[spike-engine] Using cached WebSocket price after retry', {
                      crypto: market.crypto_symbol,
                      price: (cachedAsk * 100).toFixed(1) + '¢',
                      age: Math.floor(retryAge / 1000) + 's'
                    });

                    orderbook = { bestAsk: cachedAsk, bestBid: 1 - cachedAsk };
                    entryPrice = cachedAsk;
                  } else {
                    logger.error('[spike-engine] Cached price still stale after retry, aborting trade', {
                      crypto: market.crypto_symbol,
                      age: Math.floor(retryAge / 1000) + 's'
                    });
                    return false;
                  }
                } else {
                  // Retry succeeded
                  orderbook = refreshedOrderbook;
                  entryPrice = refreshedOrderbook.bestAsk;
                  logger.info('[spike-engine] Orderbook refresh succeeded on retry');
                }
              } else {
                logger.warn('[spike-engine] Not enough time before market close, aborting', {
                  timeUntilClose: Math.floor(timeUntilClose / 1000) + 's'
                });
                return false;
              }
            } else {
              // Cached price is fresh - use it!
              const cachedAsk = signal.type === 'BUY_YES' ? cachedPrice.up : cachedPrice.down;
              logger.info('[spike-engine] Using fresh cached WebSocket price', {
                crypto: market.crypto_symbol,
                price: (cachedAsk * 100).toFixed(1) + '¢',
                age: Math.floor(priceAge / 1000) + 's'
              });

              orderbook = { bestAsk: cachedAsk, bestBid: 1 - cachedAsk };
              entryPrice = cachedAsk;
            }
          } else {
            logger.error('[spike-engine] No cached price available, aborting trade');
            return false;
          }
        } else {
          // Fresh orderbook fetch succeeded
          orderbook = refreshedOrderbook;
          entryPrice = refreshedOrderbook.bestAsk;
          logger.info('[spike-engine] Orderbook refreshed successfully', {
            newEntryPrice: entryPrice.toFixed(3),
            stillAcceptable: entryPrice <= this.maxEntryPrice
          });
          // Guard: price may have bounced back up since monitoring resolved — abort if so
          if (entryPrice > this.maxEntryPrice) {
            logger.warn('[spike-engine] Price bounced above max after monitoring resolved, aborting trade', {
              entryPrice: entryPrice.toFixed(3),
              maxAllowed: this.maxEntryPrice
            });
            const signalDir = signal.type === 'BUY_YES' ? 'UP ↗' : 'DOWN ↘';
            await log('trade_aborted', `❌ ${market.crypto_symbol} ${signalDir} - Price bounced back to ${(entryPrice * 100).toFixed(0)}¢ after dip (max ${(this.maxEntryPrice * 100).toFixed(0)}¢)`, {
              cryptoSymbol: market.crypto_symbol,
              marketId,
              details: { entryPrice, maxEntryPrice: this.maxEntryPrice, signal }
            });
            return false;
          }
        }
      }

      // 📊 TOKEN PRICE SNAPSHOT (BEFORE SIMULATED TRADE)
      logger.info('[spike-engine] 📊 TOKEN PRICE SNAPSHOT (BEFORE SIMULATED TRADE)', {
        crypto: market.crypto_symbol,
        outcome: targetOutcome,
        marketQuestion: market.question.substring(0, 60) + '...',
        tokenBestAsk: orderbook.bestAsk.toFixed(4) + ' (to BUY this outcome)',
        tokenBestBid: orderbook.bestBid?.toFixed(4) + ' (to SELL this outcome)',
        spread: orderbook.spread?.toFixed(4),
        willExecuteAt: entryPrice.toFixed(4)
      });

      // Calculate actual slippage %
      const actualSlippagePct = ((entryPrice - orderbook.bestAsk) / orderbook.bestAsk) * 100;

      // Calculate candle movement % (TradingView formula)
      const candleMovementPct = signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100);

      // Log simulated trade with full capital tracking
      await query(`
        INSERT INTO spike_trades_simulated (
          timestamp, market_id, market_question, market_slug,
          cycle_start_time, cycle_end_time, signal_minute,
          reference_price, candle_open, candle_high, candle_low, candle_close, candle_range_pct,
          polymarket_best_ask, simulated_entry_price,
          signal_type, outcome,
          position_size_usd, capital_before, order_book_depth, actual_slippage_pct,
          crypto_symbol, entry_path,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      `, [
        new Date(),
        marketId,
        market.question,
        market.slug,
        cycle.cycleStart,
        cycle.cycleEnd,
        signal.minute,
        cycle.referencePrice,
        signal.candle.open,
        signal.candle.high,
        signal.candle.low,
        signal.candle.close,
        candleMovementPct,
        orderbook.bestAsk,
        entryPrice,
        signal.type,
        'PENDING',
        positionSize,
        this.currentCapital,
        orderbook.askDepth || 0,
        actualSlippagePct,
        market.crypto_symbol,
        _paperEntryPath,
        `[${strategyId}] Paper trade - ${positionSize.toFixed(2)} USD`
      ]);

      logger.info('[spike-engine] SIMULATED TRADE EXECUTED', {
        crypto: market.crypto_symbol,
        marketId: marketId.slice(0, 16) + '...',
        signalType: signal.type,
        outcome: targetOutcome,
        positionSize: positionSize.toFixed(2),
        capital: this.currentCapital.toFixed(2),
        entryPrice: entryPrice.toFixed(3),
        tokenBestAsk: orderbook.bestAsk.toFixed(3),
        tokenBestBid: orderbook.bestBid?.toFixed(3),
        slippage: actualSlippagePct.toFixed(2) + '%',
        candleMovement: candleMovementPct.toFixed(3) + '%'
      });

      // Calculate shares and expected revenue if win
      // Formula: shares = positionSize / entryPrice
      // Expected revenue: shares * (1 - entryPrice)
      const sharesBought = positionSize / entryPrice;
      const expectedRevenue = sharesBought * (1 - entryPrice);

      // Log to activity log with detailed pricing
      await log('trade_executed', `${market.crypto_symbol} ${signal.type} - ${sharesBought.toFixed(0)} shares @ ${entryPrice.toFixed(3)} ($${positionSize.toFixed(2)}) - Expected: +$${expectedRevenue.toFixed(2)} if win`, {
        cryptoSymbol: market.crypto_symbol,
        marketId,
        details: {
          signalType: signal.type,
          outcome: targetOutcome,
          positionSize: positionSize.toFixed(2),
          tokenBestAsk: orderbook.bestAsk.toFixed(3),
          entryPrice: entryPrice.toFixed(3),
          expectedRevenue: expectedRevenue.toFixed(2),
          candleMovement: candleMovementPct.toFixed(2) + '%',
          mode: 'PAPER'
        }
      });

      // Send Telegram notification
      telegram.notifyTradeOpened({
        market_id: marketId,
        market_question: market.question,
        crypto_symbol: market.crypto_symbol,
        signal_type: signal.type,
        signal_minute: signal.minute,
        simulated_entry_price: entryPrice,
        position_size_usd: positionSize,
        candle_range_pct: candleMovementPct,
        capital_before: this.currentCapital,
        timestamp: new Date()
      }, 'PAPER');

      return true; // Trade executed successfully
    } catch (err) {
      logger.error('[spike-engine] Error executing simulated trade', {
        error: err.message,
        stack: err.stack
      });
      return false; // Trade failed
    }
  }

  /**
   * Execute a LIVE trade (real money on Polymarket)
   * Uses CLOB API to place actual market orders
   * @param {String} marketId - Market condition ID
   * @param {Object} market - Market data
   * @param {Object} cycle - Cycle state
   * @param {Object} signal - Signal from detector
   * @param {Number} positionSize - Pre-calculated position size in USD
   * @param {String} strategyId - Strategy ID (e.g., 'T123-1MIN', 'T123-1MIN-HL')
   */
  async executeLiveTrade(marketId, market, cycle, signal, positionSize, strategyId = 'T123-1MIN') {
    try {
      // Safety check: Emergency stop
      if (this.emergencyStop) {
        logger.warn('[spike-engine] Emergency stop active, aborting live trade');
        return false;
      }

      // Safety check: Max open positions
      if (this.openPositions >= config.LIVE_TRADING.MAX_OPEN_POSITIONS) {
        logger.warn('[spike-engine] Max open positions reached, skipping trade', {
          openPositions: this.openPositions,
          maxAllowed: config.LIVE_TRADING.MAX_OPEN_POSITIONS
        });
        return false;
      }

      // Check current USDC balance
      const balanceInfo = await clobApi.getBalance();
      if (!balanceInfo) {
        logger.error('[spike-engine] Failed to fetch balance, aborting trade');
        return false;
      }

      const balance = balanceInfo.liquid; // Use liquid balance for trading

      // Warn about unredeemed winnings and send Telegram notification (rate-limited)
      if (balanceInfo.unredeemed > 50) {
        logger.warn('[spike-engine] ⚠️  UNREDEEMED WINNINGS DETECTED', {
          amount: '$' + balanceInfo.unredeemed.toFixed(2),
          message: 'Claim your winnings at https://polymarket.com to increase trading capital'
        });

        // Send Telegram notification (automatically rate-limited to once per day, avoids EAT sleep hours)
        await telegram.notifyUnredeemedBalance(balanceInfo.unredeemed, balanceInfo.liquid, 'LIVE');
      }

      if (balance < config.LIVE_TRADING.MIN_BALANCE_USDC) {
        logger.error('[spike-engine] CRITICAL: Liquid balance below minimum, activating emergency stop', {
          liquidBalance: balance.toFixed(2),
          unredeemedBalance: balanceInfo.unredeemed.toFixed(2),
          minimum: config.LIVE_TRADING.MIN_BALANCE_USDC
        });
        this.emergencyStop = true;

        // Save emergency stop to database
        await query(
          "INSERT INTO spike_settings (setting_key, setting_value, description) VALUES ('emergency_stop', 'true', 'Emergency stop: balance below minimum') ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'true', updated_at = NOW()"
        ).catch(err => logger.error('[spike-engine] Failed to save emergency stop to DB', { error: err.message }));

        return false;
      }

      // LIVE MODE: Recalculate position size based on ACTUAL Polymarket balance (not paper capital)
      // This ensures position sizes are always proportional to real available funds
      if (config.FUSION_MODE) {
        // Use the strategy's position size percentage from FUSION config
        const strategyPct = strategyId === 'T123-1MIN-HL'
          ? config.FUSION_STRATEGIES['T123-1MIN-HL'].positionSizePct
          : config.FUSION_STRATEGIES['T123-1MIN'].positionSizePct;

        positionSize = Math.max(
          Math.round(balance * strategyPct / 100 * 100) / 100,
          config.MIN_POSITION_SIZE_USD
        );

        logger.info('[spike-engine] Position size recalculated from actual balance', {
          actualBalance: balance.toFixed(2),
          strategyId,
          strategyPct,
          newPositionSize: positionSize.toFixed(2)
        });
      } else {
        // Single strategy mode: use default position size %
        positionSize = Math.max(
          Math.round(balance * config.POSITION_SIZE_PCT / 100 * 100) / 100,
          config.MIN_POSITION_SIZE_USD
        );

        logger.info('[spike-engine] Position size calculated from actual balance', {
          actualBalance: balance.toFixed(2),
          positionPct: config.POSITION_SIZE_PCT,
          positionSize: positionSize.toFixed(2)
        });
      }

      // Validate position size against Polymarket minimum ($1)
      if (positionSize < 1) {
        logger.warn('[spike-engine] Position size below Polymarket minimum ($1), skipping', {
          liquidBalance: balance.toFixed(2),
          positionSize: positionSize.toFixed(2),
          minimum: 1
        });
        const _wsPts = clobWebsocket.getPrice(market.crypto_symbol);
        const _epPts = _wsPts ? (signal.type === 'BUY_YES' ? _wsPts.up : _wsPts.down) : null;
        await logMissedOpportunity({
          cryptoSymbol: market.crypto_symbol,
          marketId,
          marketQuestion: market.question,
          signalType: signal.type,
          signalMinute: signal.minute,
          candleMovementPct: signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100),
          reason: 'position_too_small',
          entryPrice: _epPts,
          maxEntryPrice: this.maxEntryPrice,
          wouldBePositionSize: positionSize,
          availableCapital: balance,
          details: { marketSlug: market.slug }
        });
        this.missedOpportunityCount++; // Track for summary
        return false;
      }

      // Safety cap: Never exceed 10% of balance in a single trade
      if (positionSize > balance * 0.1) {
        logger.warn('[spike-engine] Position size exceeds 10% of liquid balance, capping', {
          requested: positionSize.toFixed(2),
          capped: (balance * 0.1).toFixed(2)
        });
        positionSize = balance * 0.1;
      }

      // Absolute max cap: Liquidity protection (hot-reloadable from database)
      if (positionSize > this.maxPositionSizeUsd) {
        logger.warn('[spike-engine] Position size exceeds max cap (liquidity protection), capping', {
          requested: positionSize.toFixed(2),
          maxCap: this.maxPositionSizeUsd.toFixed(2),
          capped: this.maxPositionSizeUsd.toFixed(2)
        });
        positionSize = this.maxPositionSizeUsd;
      }

      // Get token IDs from cached market data (avoid extra API call that may fail)
      if (!market.tokens || market.tokens.length === 0) {
        logger.warn('[spike-engine] No token IDs in market data, skipping live trade', {
          marketId: marketId.slice(0, 16) + '...',
          hasTokens: !!market.tokens,
          tokenCount: market.tokens?.length || 0
        });
        return false;
      }

      // Find the token for the desired outcome (Up/Down or Yes/No)
      const targetOutcome = signal.type === 'BUY_YES' ? 'Up' : 'Down';
      const token = market.tokens.find(t => t.outcome === targetOutcome);

      if (!token || !token.token_id) {
        logger.warn('[spike-engine] Token ID not found for outcome, skipping live trade', {
          marketId: marketId.slice(0, 16) + '...',
          targetOutcome,
          availableTokens: market.tokens.map(t => ({ outcome: t.outcome, id: t.token_id?.slice(0, 8) }))
        });
        return false;
      }

      const tokenId = token.token_id;

      // Fetch orderbook for the specific token from CLOB API
      logger.info('[spike-engine] 🔍 Fetching orderbook for token', {
        marketId: marketId.slice(0, 16) + '...',
        tokenId: tokenId.slice(0, 16) + '...',
        outcome: targetOutcome,
        marketSlug: market.slug,
        marketQuestion: market.question?.substring(0, 60) + '...',
        cycleStart: cycle.cycleStart.toISOString(),
        cycleEnd: cycle.cycleEnd.toISOString()
      });

      // Retry up to 3 times (1.5s apart) — transient CLOB latency can cause momentary empty books
      let orderbook = null;
      const MAX_ORDERBOOK_RETRIES_LIVE = 3;
      const ORDERBOOK_RETRY_DELAY_LIVE_MS = 1500;
      for (let attempt = 1; attempt <= MAX_ORDERBOOK_RETRIES_LIVE; attempt++) {
        orderbook = await clobApi.getOrderBook(tokenId);
        if (orderbook && orderbook.bestAsk) break;
        if (attempt < MAX_ORDERBOOK_RETRIES_LIVE) {
          logger.warn('[spike-engine] No orderbook data (LIVE), retrying...', {
            marketId: marketId.slice(0, 16) + '...',
            tokenId: tokenId.slice(0, 16) + '...',
            outcome: targetOutcome,
            attempt
          });
          await new Promise(r => setTimeout(r, ORDERBOOK_RETRY_DELAY_LIVE_MS));
        }
      }

      if (!orderbook || !orderbook.bestAsk) {
        logger.warn('[spike-engine] No orderbook data available after retries, skipping live trade', {
          marketId: marketId.slice(0, 16) + '...',
          tokenId: tokenId.slice(0, 16) + '...',
          outcome: targetOutcome,
          retriesAttempted: MAX_ORDERBOOK_RETRIES_LIVE
        });
        await logMissedOpportunity({
          cryptoSymbol: market.crypto_symbol,
          marketId,
          marketQuestion: market.question,
          signalType: signal.type,
          signalMinute: signal.minute,
          candleMovementPct: signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100),
          reason: 'no_liquidity',
          wouldBePositionSize: positionSize,
          details: { marketSlug: market.slug }
        });
        this.missedOpportunityCount++; // Track for summary
        return false;
      }

      // Calculate entry price with slippage
      const entryPrice = clobApi.calculateEntryPrice(
        orderbook.bestAsk,
        config.SLIPPAGE_TOLERANCE_PCT
      );

      // Log token mapping and prices for debugging
      logger.info('[spike-engine] Token orderbook fetched for LIVE trade', {
        crypto: market.crypto_symbol,
        signalType: signal.type,
        targetOutcome,
        tokenId: tokenId.slice(0, 16) + '...',
        bestAsk: orderbook.bestAsk?.toFixed(3),
        bestBid: orderbook.bestBid?.toFixed(3),
        spread: orderbook.spread?.toFixed(4),
        entryPrice: entryPrice.toFixed(3),
        allTokens: market.tokens.map(t => t.outcome).join(', ')
      });

      // Price filter: Monitor price if too expensive, wait for reversion
      if (entryPrice > this.maxEntryPrice) {
        // Check if already monitoring this market (prevent concurrent monitoring)
        if (this.activeMonitoring.has(marketId)) {
          logger.warn('[spike-engine] Already monitoring this market, skipping duplicate (LIVE)', {
            marketId: marketId.slice(0, 16) + '...',
            crypto: market.crypto_symbol
          });
          return false;
        }

        // ── FADE V2 (LIVE) ───────────────────────────────────────────────────
        // Backtest (34.7 days, 18,437 signals): momentum token >90¢ → Fade EV up to +6.3%
        // Buy the OPPOSITE token (NO on UP spike) with real money
        {
          const _fadeOutcome    = signal.type === 'BUY_YES' ? 'Down' : 'Up';
          const _fadeSignalType = signal.type === 'BUY_YES' ? 'FADE_NO' : 'FADE_YES';
          const _fadeToken      = market.tokens.find(t => t.outcome === _fadeOutcome);
          if (_fadeToken?.token_id) {
            let _fadeOb = null;
            for (let _fa = 1; _fa <= 3; _fa++) {
              _fadeOb = await clobApi.getOrderBook(_fadeToken.token_id);
              if (_fadeOb?.bestAsk) break;
              if (_fa < 3) await new Promise(r => setTimeout(r, 1500));
            }
            if (_fadeOb?.bestAsk && _fadeOb.bestAsk >= config.MIN_FADE_ENTRY_PRICE && _fadeOb.bestAsk <= config.MAX_FADE_ENTRY_PRICE) {
              const _fadeCandlePct   = signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100);
              const _fadeEntryPx     = clobApi.calculateEntryPrice(_fadeOb.bestAsk, config.SLIPPAGE_TOLERANCE_PCT);
              const _fadeSlippagePct = ((_fadeEntryPx - _fadeOb.bestAsk) / _fadeOb.bestAsk) * 100;
              const _fadeShares      = positionSize / _fadeEntryPx;
              logger.warn('[spike-engine] 🔴 FADE V2 LIVE — placing counter-trade order', {
                crypto: market.crypto_symbol,
                fadeSignalType: _fadeSignalType,
                momentumPrice: (entryPrice * 100).toFixed(0) + '¢',
                fadePrice: (_fadeEntryPx * 100).toFixed(0) + '¢',
                shares: _fadeShares.toFixed(0),
                positionSize: positionSize.toFixed(2)
              });
              // Place real order on opposite token
              const _fadeOrderResp = await clobApi.placeOrder(
                _fadeToken.token_id,
                'BUY',
                positionSize,
                _fadeEntryPx
              );
              this.openPositions++;
              this.consecutiveErrors = 0;
              await query(`
                INSERT INTO spike_trades_live (
                  timestamp, market_id, market_question, market_slug,
                  cycle_start_time, cycle_end_time, signal_minute,
                  reference_price, candle_open, candle_high, candle_low, candle_close, candle_range_pct,
                  polymarket_best_ask, entry_price,
                  signal_type, outcome,
                  position_size_usd, balance_before, order_book_depth, actual_slippage_pct,
                  order_id, order_status, token_id,
                  crypto_symbol,
                  notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
              `, [
                new Date(),
                marketId,
                market.question,
                market.slug,
                cycle.cycleStart,
                cycle.cycleEnd,
                signal.minute,
                cycle.referencePrice,
                signal.candle.open,
                signal.candle.high,
                signal.candle.low,
                signal.candle.close,
                _fadeCandlePct,
                _fadeOb.bestAsk,
                _fadeEntryPx,
                _fadeSignalType,
                'PENDING',
                positionSize,
                balance,
                _fadeOb.askDepth || 0,
                _fadeSlippagePct,
                _fadeOrderResp.orderID,
                _fadeOrderResp.status,
                _fadeToken.token_id,
                market.crypto_symbol,
                `[${strategyId}] FADE LIVE — ${positionSize.toFixed(2)} USDC @ ${_fadeEntryPx.toFixed(3)} (momentum was ${(entryPrice * 100).toFixed(0)}¢)`
              ]);
              claimWinnings.registerPosition(market.conditionId, {
                slug: market.slug,
                question: market.question,
                endDate: cycle.cycleEnd
              });
              const _fadeExpRev = _fadeShares * (1 - _fadeEntryPx);
              await log('fade_executed', `🔴 LIVE: ${market.crypto_symbol} ${_fadeSignalType} ↩ FADE — ${_fadeShares.toFixed(0)} shares @ ${(_fadeEntryPx * 100).toFixed(0)}¢ ($${positionSize.toFixed(2)}) vs ${(entryPrice * 100).toFixed(0)}¢ momentum`, {
                cryptoSymbol: market.crypto_symbol,
                marketId,
                details: {
                  fadeSignalType: _fadeSignalType,
                  fadeEntryPrice: _fadeEntryPx,
                  momentumEntryPrice: entryPrice,
                  positionSize,
                  strategy: strategyId,
                  orderId: _fadeOrderResp.orderID
                }
              });
              telegram.notifyTradeOpened({
                market_id: marketId,
                market_question: market.question,
                crypto_symbol: market.crypto_symbol,
                signal_type: _fadeSignalType,
                signal_minute: signal.minute,
                simulated_entry_price: _fadeEntryPx,
                position_size_usd: positionSize,
                candle_range_pct: _fadeCandlePct,
                capital_before: balance,
                timestamp: new Date()
              }, 'LIVE');
              return true; // Fade trade executed — skip momentum monitoring
            } else if (_fadeOb?.bestAsk) {
              // Counter too expensive — persist for distribution analysis, suppress resolved markets (spread > 50¢)
              const counterBidVal  = _fadeOb.bestBid || 0;
              const counterAskVal  = _fadeOb.bestAsk;
              const spreadVal      = counterAskVal - counterBidVal;
              const counterDepth   = _fadeOb.askDepth || 0;
              if (spreadVal < 0.50) {
                logger.info('[spike-engine] 📊 FADE SKIPPED (LIVE) — counter too expensive', {
                  crypto:       market.crypto_symbol,
                  counterAsk:   (counterAskVal * 100).toFixed(1) + '¢',
                  counterBid:   (counterBidVal * 100).toFixed(1) + '¢',
                  counterDepth,
                  spread:       (spreadVal * 100).toFixed(1) + '¢',
                  momentumPrice: (entryPrice * 100).toFixed(1) + '¢',
                  maxFadeEntry: (config.MAX_FADE_ENTRY_PRICE * 100).toFixed(0) + '¢'
                });
                query(
                  `INSERT INTO spike_fade_observations
                     (crypto_symbol, signal_type, signal_minute, spike_pct,
                      momentum_ask, counter_ask, counter_bid, counter_ask_depth, spread, market_slug, mode)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'LIVE')`,
                  [
                    market.crypto_symbol,
                    signal.type,
                    signal.minute,
                    signal.candle?.movementPct ?? null,
                    entryPrice,
                    counterAskVal,
                    counterBidVal,
                    counterDepth,
                    spreadVal,
                    market.slug ?? null
                  ]
                ).catch(err => logger.error('[spike-engine] fade obs insert failed', { error: err.message }));
              }
            }
          }
        }
        // Fade counter-token unavailable or too expensive — fall through to standard monitoring

        // Start monitoring
        const monitoring = monitorPriceUntilAcceptable(market, signal, entryPrice, this.maxEntryPrice, this, tokenId);
        this.activeMonitoring.set(marketId, { cancel: monitoring.cancel, crypto: market.crypto_symbol });

        let priceAcceptable = false;
        try {
          priceAcceptable = await monitoring.promise;
        } finally {
          // Always cleanup tracking
          this.activeMonitoring.delete(marketId);
        }

        if (!priceAcceptable) {
          logger.warn('[spike-engine] Price monitoring ended - price never became acceptable (LIVE)', {
            marketId: marketId.slice(0, 16) + '...',
            initialPrice: entryPrice.toFixed(3),
            maxAllowed: this.maxEntryPrice,
            signalType: signal.type
          });
          await logMissedOpportunity({
            cryptoSymbol: market.crypto_symbol,
            marketId,
            marketQuestion: market.question,
            signalType: signal.type,
            signalMinute: signal.minute,
            candleMovementPct: signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100),
            reason: 'price_too_high',
            entryPrice,
            maxEntryPrice: this.maxEntryPrice,
            wouldBePositionSize: positionSize,
            orderBookDepth: 0,
            details: { marketSlug: market.slug, monitoredUntilClose: true }
          });
          this.missedOpportunityCount++; // Track for summary
          return false;
        }

        // Price acceptable now - refresh orderbook before proceeding
        logger.info('[spike-engine] Refreshing orderbook after price monitoring (LIVE)', { crypto: market.crypto_symbol });
        const refreshedOrderbook = await clobApi.getOrderBook(tokenId);
        if (!refreshedOrderbook || !refreshedOrderbook.bestAsk) {
          logger.warn('[spike-engine] Failed to refresh orderbook after monitoring (LIVE)', { crypto: market.crypto_symbol });
          return false;
        }
        orderbook = refreshedOrderbook;
        entryPrice = clobApi.calculateEntryPrice(refreshedOrderbook.bestAsk, config.SLIPPAGE_TOLERANCE_PCT);
        logger.info('[spike-engine] Orderbook refreshed (LIVE)', {
          newEntryPrice: entryPrice.toFixed(3),
          stillAcceptable: entryPrice <= this.maxEntryPrice
        });
        // Guard: price may have bounced back up since monitoring resolved — abort if so
        if (entryPrice > this.maxEntryPrice) {
          logger.warn('[spike-engine] Price bounced above max after monitoring resolved, aborting LIVE trade', {
            entryPrice: entryPrice.toFixed(3),
            maxAllowed: this.maxEntryPrice
          });
          const signalDirLive = signal.type === 'BUY_YES' ? 'UP ↗' : 'DOWN ↘';
          await log('trade_aborted', `❌ ${market.crypto_symbol} ${signalDirLive} LIVE - Price bounced back to ${(entryPrice * 100).toFixed(0)}¢ after dip (max ${(this.maxEntryPrice * 100).toFixed(0)}¢)`, {
            cryptoSymbol: market.crypto_symbol,
            marketId,
            details: { entryPrice, maxEntryPrice: this.maxEntryPrice, signal }
          });
          return false;
        }
      }

      // 📊 TOKEN PRICE SNAPSHOT (BEFORE TRADE)
      logger.warn('[spike-engine] 📊 TOKEN PRICE SNAPSHOT (BEFORE TRADE)', {
        crypto: market.crypto_symbol,
        outcome: targetOutcome,
        marketQuestion: market.question.substring(0, 60) + '...',
        tokenBestAsk: orderbook.bestAsk.toFixed(4) + ' (to BUY this outcome)',
        tokenBestBid: orderbook.bestBid?.toFixed(4) + ' (to SELL this outcome)',
        spread: orderbook.spread?.toFixed(4)
      });

      // CRITICAL: Place the live order
      logger.warn('[spike-engine] 🔴 PLACING LIVE ORDER - REAL MONEY 🔴', {
        marketId: marketId.slice(0, 16) + '...',
        question: market.question,
        signalType: signal.type,
        outcome: targetOutcome,
        tokenId: tokenId.slice(0, 16) + '...',
        positionSize: positionSize.toFixed(2),
        tokenBestAsk: orderbook.bestAsk.toFixed(3),
        tokenBestBid: orderbook.bestBid?.toFixed(3),
        entryPriceWithSlippage: entryPrice.toFixed(3),
        slippageTolerance: config.SLIPPAGE_TOLERANCE_PCT + '%',
        balance: balance.toFixed(2)
      });

      // Retry on transient API errors (502/503/504) with exponential backoff
      let orderResponse;
      const maxRetries = 3;
      let lastError;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          orderResponse = await clobApi.placeOrder(
            tokenId,
            'BUY',
            positionSize,
            entryPrice
          );
          break; // Success - exit retry loop
        } catch (err) {
          lastError = err;
          const is502 = err.message.includes('502') || err.response?.status === 502;
          const is503 = err.message.includes('503') || err.response?.status === 503;
          const is504 = err.message.includes('504') || err.response?.status === 504;
          const isTransient = is502 || is503 || is504;

          if (!isTransient || attempt === maxRetries) {
            // Not a transient error, or max retries reached - throw
            throw err;
          }

          // Transient error - retry with exponential backoff
          const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
          logger.warn('[spike-engine] 🔄 Transient API error - retrying order placement', {
            attempt: attempt + 1,
            maxRetries,
            error: err.message,
            status: err.response?.status,
            retryInMs: delayMs
          });

          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      if (!orderResponse) {
        throw lastError; // Should never happen, but safety check
      }

      // 💰 TRADE EXECUTION RESULT (AFTER TRADE)
      logger.info('[spike-engine] 💰 TRADE EXECUTION RESULT (AFTER TRADE)', {
        success: true,
        orderId: orderResponse.orderID,
        status: orderResponse.status,
        transactionHash: orderResponse.transactionHash,
        executedAtPrice: entryPrice.toFixed(4),
        tokenPriceWas: orderbook.bestAsk.toFixed(4),
        slippagePaid: ((entryPrice - orderbook.bestAsk) / orderbook.bestAsk * 100).toFixed(2) + '%'
      });

      // Increment open positions counter
      this.openPositions++;

      // Reset consecutive errors counter on successful trade
      this.consecutiveErrors = 0;

      // Calculate candle movement % (TradingView formula)
      const candleMovementPct = signal.candle.movementPct || Math.abs((signal.candle.close - signal.candle.open) / signal.candle.open * 100);

      // Log the trade to database
      await query(`
        INSERT INTO spike_trades_live (
          timestamp, market_id, market_question, market_slug,
          cycle_start_time, cycle_end_time, signal_minute,
          reference_price, candle_open, candle_high, candle_low, candle_close, candle_range_pct,
          polymarket_best_ask, entry_price,
          signal_type, outcome,
          position_size_usd, balance_before, order_book_depth, actual_slippage_pct,
          order_id, order_status, token_id,
          crypto_symbol,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      `, [
        new Date(),
        marketId,
        market.question,
        market.slug,
        cycle.cycleStart,
        cycle.cycleEnd,
        signal.minute,
        cycle.referencePrice,
        signal.candle.open,
        signal.candle.high,
        signal.candle.low,
        signal.candle.close,
        candleMovementPct, // Store movement % instead of range %
        orderbook.bestAsk,
        entryPrice,
        signal.type,
        'PENDING',
        positionSize,
        balance,
        orderbook.askDepth || 0, // Order book depth from CLOB
        ((entryPrice - orderbook.bestAsk) / orderbook.bestAsk) * 100,
        orderResponse.orderID,
        orderResponse.status,
        tokenId,
        market.crypto_symbol,
        `[${strategyId}] LIVE TRADE - ${positionSize.toFixed(2)} USDC @ ${entryPrice.toFixed(3)}`
      ]);

      logger.info('[spike-engine] ✅ LIVE TRADE EXECUTED SUCCESSFULLY', {
        orderId: orderResponse.orderID,
        status: orderResponse.status,
        marketId: marketId.slice(0, 16) + '...',
        signalType: signal.type,
        positionSize: positionSize.toFixed(2),
        entryPrice: entryPrice.toFixed(3),
        newBalance: (balance - positionSize).toFixed(2)
      });

      // Register position for automated claim tracking
      claimWinnings.registerPosition(market.conditionId, {
        slug: market.slug,
        question: market.question,
        endDate: cycle.cycleEnd
      });

      // Calculate shares and expected revenue if win
      // Formula: shares = positionSize / entryPrice
      // Expected revenue: shares * (1 - entryPrice)
      const sharesBought = positionSize / entryPrice;
      const expectedRevenue = sharesBought * (1 - entryPrice);

      // Log to activity log with detailed pricing
      await log('trade_executed', `🔴 LIVE: ${market.crypto_symbol} ${signal.type} - ${sharesBought.toFixed(0)} shares @ ${entryPrice.toFixed(3)} ($${positionSize.toFixed(2)}) - Expected: +$${expectedRevenue.toFixed(2)} if win`, {
        cryptoSymbol: market.crypto_symbol,
        marketId,
        details: {
          strategy: strategyId,
          fusionMode: config.FUSION_MODE,
          signalType: signal.type,
          outcome: targetOutcome,
          positionSize: positionSize.toFixed(2),
          tokenBestAsk: orderbook.bestAsk.toFixed(3),
          entryPrice: entryPrice.toFixed(3),
          expectedRevenue: expectedRevenue.toFixed(2),
          candleMovement: candleMovementPct.toFixed(2) + '%',
          orderId: orderResponse.orderID,
          mode: 'LIVE'
        }
      });

      // Send Telegram notification
      telegram.notifyTradeOpened({
        market_id: marketId,
        market_question: market.question,
        crypto_symbol: market.crypto_symbol,
        signal_type: signal.type,
        signal_minute: signal.minute,
        entry_price: entryPrice,
        position_size_usd: positionSize,
        candle_range_pct: candleMovementPct,
        balance_before: balance,
        timestamp: new Date()
      }, 'LIVE');

      return true; // Trade executed successfully

    } catch (err) {
      logger.error('[spike-engine] 🔴 CRITICAL ERROR IN LIVE TRADE 🔴', {
        error: err.message,
        stack: err.stack,
        crypto: market.crypto_symbol,
        marketQuestion: market.question,
        attemptedPrice: typeof entryPrice !== 'undefined' ? entryPrice.toFixed(4) : 'N/A',
        tokenPriceWas: typeof orderbook !== 'undefined' && orderbook?.bestAsk ? orderbook.bestAsk.toFixed(4) : 'N/A',
        positionSize: positionSize.toFixed(2)
      });

      // Check if error is a transient API failure (502, 503, 504)
      const is502Error = err.message.includes('502') || err.response?.status === 502;
      const is503Error = err.message.includes('503') || err.response?.status === 503;
      const is504Error = err.message.includes('504') || err.response?.status === 504;
      const isTransientError = is502Error || is503Error || is504Error;

      // Track consecutive errors ONLY for non-transient failures
      // Transient API errors (502/503/504) don't count toward emergency stop
      if (config.LIVE_TRADING.ENABLE_EMERGENCY_STOP) {
        if (isTransientError) {
          logger.warn('[spike-engine] ⚠️  Transient API error (502/503/504) - NOT counting toward emergency stop', {
            error: err.message,
            status: err.response?.status,
            consecutiveErrors: this.consecutiveErrors
          });
        } else {
          this.consecutiveErrors++;
          logger.warn('[spike-engine] Trade error tracked', {
            consecutiveErrors: this.consecutiveErrors,
            threshold: 3,
            error: err.message
          });

          if (this.consecutiveErrors >= 3) {
            const errorSummary = `Last error: ${err.message || 'Unknown error'}`;
            logger.error('[spike-engine] ⚠️  ACTIVATING EMERGENCY STOP - 3 consecutive trade failures detected', {
              reason: errorSummary,
              timestamp: new Date().toISOString()
            });
            this.emergencyStop = true;
            this.emergencyStopReason = errorSummary; // Store for later reference
            this.emergencyStopActivatedAt = Date.now();

            // Save emergency stop to database so it persists across restarts
            const escapedReason = errorSummary.replace(/'/g, "''");
            await query(
              `INSERT INTO spike_settings (setting_key, setting_value, description) VALUES ('emergency_stop', 'true', '⚠️ Emergency stop: 3 consecutive failures. ${escapedReason}') ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'true', description = '⚠️ Emergency stop: 3 consecutive failures. ${escapedReason}', updated_at = NOW()`
            ).catch(err => logger.error('[spike-engine] Failed to save emergency stop to DB', { error: err.message }));
          }
        }
      }

      return false; // Trade failed
    }
  }

  /**
   * Resolve a cycle and check outcomes
   */
  async resolveCycle(cycleKey) {
    const cycle = this.activeCycles.get(cycleKey);
    if (!cycle) return;

    logger.info('[spike-engine] Cycle ended', {
      marketId: cycle.marketId.slice(0, 16) + '...',
      candlesCollected: cycle.candles.length,
      signalFired: cycle.signalFired
    });

    // Remove cycle from active tracking
    this.activeCycles.delete(cycleKey);

    // If trade was executed, check for resolution after 5min + buffer
    if (cycle.signalFired) {
      setTimeout(async () => {
        try {
          await this.checkTradeResolution(cycle.marketId, cycle.cycleEnd);
        } catch (err) {
          logger.error('[spike-engine] Error in delayed trade resolution check', {
            error: err.message,
            marketId: cycle.marketId.slice(0, 16) + '...'
          });
        }
      }, 2 * 60 * 1000); // Wait 2 more minutes for resolution
    }
  }

  /**
   * Check if trade has resolved and update P&L + capital
   */
  async checkTradeResolution(marketId, cycleEnd, retryCount = 0) {
    const MAX_RETRIES = 60; // 60 retries × 1 minute = 1 hour max wait

    try {
      // Fetch outcome from Gamma
      const outcome = await gamma.getMarketOutcome(marketId);

      if (!outcome) {
        if (retryCount >= MAX_RETRIES) {
          logger.error('[spike-engine] Market never resolved after max retries, marking as UNRESOLVED', {
            marketId: marketId.slice(0, 16) + '...',
            retryCount
          });

          // Mark trade as unresolved and release exposure
          await query(`
            UPDATE spike_trades_simulated
            SET outcome = 'UNRESOLVED', pnl_pct = 0, pnl_usd = 0
            WHERE market_id = $1 AND cycle_end_time = $2 AND outcome = 'PENDING'
          `, [marketId, cycleEnd]);

          // Release exposure for unresolved trade
          const tradeRes = await query(`
            SELECT crypto_symbol, position_size_usd
            FROM spike_trades_simulated
            WHERE market_id = $1 AND cycle_end_time = $2
            LIMIT 1
          `, [marketId, cycleEnd]);

          if (tradeRes.rows.length && tradeRes.rows[0].crypto_symbol) {
            const crypto = tradeRes.rows[0].crypto_symbol;
            const positionSize = parseFloat(tradeRes.rows[0].position_size_usd) || 0;

            if (this.exposurePerCrypto.has(crypto)) {
              const currentExposure = this.exposurePerCrypto.get(crypto) || 0;
              const newExposure = Math.max(0, currentExposure - positionSize);
              this.exposurePerCrypto.set(crypto, newExposure);

              logger.info('[spike-engine] Released exposure for unresolved trade', {
                crypto,
                released: positionSize.toFixed(2)
              });
            }

            // Decrement open positions counter for LIVE trades
            if (this.tradingMode === 'LIVE' && this.openPositions > 0) {
              this.openPositions--;
              logger.info('[spike-engine] Decremented open positions (unresolved)', {
                openPositions: this.openPositions
              });
            }
          }

          return;
        }

        logger.warn('[spike-engine] Market not yet resolved, will retry', {
          marketId: marketId.slice(0, 16) + '...',
          retryCount: retryCount + 1,
          maxRetries: MAX_RETRIES
        });

        // Retry in 1 minute with error handling
        setTimeout(async () => {
          try {
            await this.checkTradeResolution(marketId, cycleEnd, retryCount + 1);
          } catch (err) {
            logger.error('[spike-engine] Error in delayed trade resolution retry', {
              error: err.message,
              marketId: marketId.slice(0, 16) + '...'
            });
          }
        }, 60 * 1000);
        return;
      }

      // Update trade record with outcome and P&L
      const tradeRes = await query(`
        SELECT id, signal_type, simulated_entry_price, position_size_usd, capital_before, crypto_symbol
        FROM spike_trades_simulated
        WHERE market_id = $1 AND cycle_end_time = $2 AND outcome = 'PENDING'
      `, [marketId, cycleEnd]);

      if (!tradeRes.rows.length) {
        // No simulated trade for this market (e.g. price was too high — missed opportunity).
        // Still update the missed opportunities table so the UI shows the outcome icon.
        await query(`
          UPDATE spike_missed_opportunities
          SET market_outcome = $1
          WHERE market_id = $2 AND market_outcome IS NULL
        `, [outcome, marketId]);
        return;
      }

      const trade = tradeRes.rows[0];
      const entryPrice = parseFloat(trade.simulated_entry_price);
      const positionSize = parseFloat(trade.position_size_usd);
      const cryptoSymbol = trade.crypto_symbol || 'BTC';

      // Validate entry price to prevent division by zero
      if (entryPrice <= 0 || entryPrice > 1 || isNaN(entryPrice)) {
        logger.error('[spike-engine] Invalid entry price, cannot calculate P&L', {
          tradeId: trade.id,
          entryPrice
        });
        return;
      }

      // Calculate P&L in %
      const pnlPct = detector.calculatePnL(trade.signal_type, entryPrice, outcome);
      const result = pnlPct > 0 ? 'WIN' : 'LOSS';

      // Calculate P&L in USD
      // If WIN: received $1 per share, paid entryPrice per share
      // P&L = (shares bought) × (1 - entryPrice)
      // shares bought = positionSize / entryPrice
      // P&L = positionSize / entryPrice × (1 - entryPrice) = positionSize × (1 - entryPrice) / entryPrice
      const pnlUsd = result === 'WIN'
        ? positionSize * (1 - entryPrice) / entryPrice
        : -positionSize; // Total loss if wrong

      // CRITICAL: Reduce exposure tracking FIRST (before async operations)
      // Release exposure synchronously to prevent accumulation if bot crashes
      if (cryptoSymbol && this.exposurePerCrypto.has(cryptoSymbol)) {
        const currentExposure = this.exposurePerCrypto.get(cryptoSymbol) || 0;
        const newExposure = Math.max(0, currentExposure - positionSize);
        this.exposurePerCrypto.set(cryptoSymbol, newExposure);

        logger.info('[spike-engine] Reduced exposure after trade resolution', {
          crypto: cryptoSymbol,
          released: positionSize.toFixed(2),
          exposureBefore: currentExposure.toFixed(2),
          exposureAfter: newExposure.toFixed(2)
        });
      }

      // Decrement open positions counter for LIVE trades
      if (this.tradingMode === 'LIVE' && this.openPositions > 0) {
        this.openPositions--;
        logger.info('[spike-engine] Decremented open positions counter', {
          openPositions: this.openPositions
        });
      }

      // Update capital
      await this.updateCapital(pnlUsd);

      const capitalAfter = this.currentCapital;

      // Update trade record
      await query(`
        UPDATE spike_trades_simulated
        SET outcome = $1,
            pnl_pct = $2,
            pnl_usd = $3,
            resolution_price = $4,
            capital_after = $5
        WHERE id = $6
      `, [result, pnlPct, pnlUsd, outcome === 'YES' ? 1 : 0, capitalAfter, trade.id]);

      // Update missed opportunities with the market outcome
      // This allows the UI to show win/loss indicators (👍 or ❌) for missed trades
      await query(`
        UPDATE spike_missed_opportunities
        SET market_outcome = $1
        WHERE market_id = $2 AND market_outcome IS NULL
      `, [outcome, marketId]);

      logger.info('[spike-engine] Trade resolved', {
        tradeId: trade.id,
        crypto: cryptoSymbol,
        outcome: result,
        signalType: trade.signal_type,
        entryPrice: entryPrice.toFixed(3),
        pnlPct: pnlPct.toFixed(2) + '%',
        pnlUsd: pnlUsd.toFixed(2),
        capitalBefore: parseFloat(trade.capital_before).toFixed(2),
        capitalAfter: capitalAfter.toFixed(2)
      });

      // Mark market as resolved for automated claiming (LIVE mode only)
      if (this.tradingMode === 'LIVE') {
        claimWinnings.markResolved(marketId);
      }

      // Log to activity log
      const pnlSign = pnlUsd >= 0 ? '+' : '';
      await log('trade_completed', `${cryptoSymbol} ${result} ${pnlSign}$${pnlUsd.toFixed(2)} (${pnlSign}${pnlPct.toFixed(1)}%) Entry: ${entryPrice.toFixed(2)}`, {
        cryptoSymbol,
        marketId,
        details: {
          outcome: result,
          pnlUsd: pnlUsd.toFixed(2),
          pnlPct: pnlPct.toFixed(1) + '%',
          capitalAfter: capitalAfter.toFixed(2),
          mode: 'PAPER'
        }
      });

      // Send Telegram notification
      telegram.notifyTradeCompleted({
        market_id: marketId,
        crypto_symbol: cryptoSymbol,
        signal_type: trade.signal_type,
        simulated_entry_price: entryPrice,
        position_size_usd: positionSize,
        outcome: result,
        pnl_usd: pnlUsd,
        pnl_pct: pnlPct,
        resolution_price: outcome === 'YES' ? 1 : 0,
        capital_after: capitalAfter
      }, 'PAPER');
    } catch (err) {
      logger.error('[spike-engine] Error checking trade resolution', {
        error: err.message
      });
    }
  }

}

module.exports = new SpikeEngine();
