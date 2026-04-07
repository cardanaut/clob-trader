/**
 * SpikeTrading Configuration
 * Paper trading bot for BTC momentum detection on Polymarket
 */

'use strict';

module.exports = {
  // CRITICAL: Trading mode
  TRADING_MODE: 'LIVE', // Paper mode removed — always LIVE

  // Supported cryptocurrencies
  SUPPORTED_CRYPTOS: [
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      binancePair: 'BTCUSDT',
      polymarketSlugs: {
        5: 'btc-updown-5m',   // 5-minute markets
        15: 'btc-updown-15m'  // 15-minute markets
      }
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      binancePair: 'ETHUSDT',
      polymarketSlugs: {
        5: 'eth-updown-5m',
        15: 'eth-updown-15m'
      }
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      binancePair: 'SOLUSDT',
      polymarketSlugs: {
        5: 'sol-updown-5m',
        15: 'sol-updown-15m'
      }
    },
    {
      symbol: 'XRP',
      name: 'XRP',
      binancePair: 'XRPUSDT',
      polymarketSlugs: {
        5: 'xrp-updown-5m',
        15: 'xrp-updown-15m'
      }
    }
  ],

  // Detection Strategies
  STRATEGIES: {
    // Default strategy (alias for best revenue threshold)
    'T123-1MIN': {
      name: 'T123-0.24%',
      description: '5-min markets: 1-min candles, 0.24% threshold (default)',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.24,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2]
    },

    // 5-Minute Market Strategies - Optimize for Revenue (0.09%-0.26%)
    'T123-1MIN-009': {
      name: 'T123-0.09%',
      description: '5-min markets: 1-min candles, 0.09% threshold (TEST ONLY)',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.09,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2]
    },
    'T123-1MIN-020': {
      name: 'T123-0.20%',
      description: '5-min markets: 1-min candles, 0.20% threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.20,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2]
    },
    'T123-1MIN-021': {
      name: 'T123-0.21%',
      description: '5-min markets: 1-min candles, 0.21% threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.21,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2]
    },
    'T123-1MIN-022': {
      name: 'T123-0.22%',
      description: '5-min markets: 1-min candles, 0.22% threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.22,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2]
    },
    'T123-1MIN-023': {
      name: 'T123-0.23%',
      description: '5-min markets: 1-min candles, 0.23% threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.23,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2]
    },
    'T123-1MIN-024': {
      name: 'T123-0.24%',
      description: '5-min markets: 1-min candles, 0.24% threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.24,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2]
    },
    'T123-1MIN-025': {
      name: 'T123-0.25%',
      description: '5-min markets: 1-min candles, 0.25% threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.25,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2]
    },
    'T123-1MIN-026': {
      name: 'T123-0.26%',
      description: '5-min markets: 1-min candles, 0.26% threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.26,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2]
    },
    // T123-FUSION Variants - Test Different Base Thresholds
    'T123-FUSION-020': {
      name: 'T123-FUSION-0.20%',
      description: 'Fusion strategy with 0.20% base threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.20,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      fusionMode: true,
      subStrategies: ['T123-1MIN-020', 'T123-1MIN-HL-020']
    },
    'T123-FUSION-021': {
      name: 'T123-FUSION-0.21%',
      description: 'Fusion strategy with 0.21% base threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.21,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      fusionMode: true,
      subStrategies: ['T123-1MIN-021', 'T123-1MIN-HL-021']
    },
    'T123-FUSION-022': {
      name: 'T123-FUSION-0.22%',
      description: 'Fusion strategy with 0.22% base threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.22,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      fusionMode: true,
      subStrategies: ['T123-1MIN-022', 'T123-1MIN-HL-022']
    },
    'T123-FUSION-023': {
      name: 'T123-FUSION-0.23%',
      description: 'Fusion strategy with 0.23% base threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.23,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      fusionMode: true,
      subStrategies: ['T123-1MIN-023', 'T123-1MIN-HL-023']
    },
    'T123-FUSION-024': {
      name: 'T123-FUSION-0.24%',
      description: 'Fusion strategy with 0.24% base threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.24,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      fusionMode: true,
      subStrategies: ['T123-1MIN-024', 'T123-1MIN-HL-024']
    },
    'T123-FUSION-025': {
      name: 'T123-FUSION-0.25%',
      description: 'Fusion strategy with 0.25% base threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.25,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      fusionMode: true,
      subStrategies: ['T123-1MIN-025', 'T123-1MIN-HL-025']
    },
    'T123-FUSION-026': {
      name: 'T123-FUSION-0.26%',
      description: 'Fusion strategy with 0.26% base threshold',
      interval: '1m',
      marketDuration: 5,
      minThreshold: 0.26,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      fusionMode: true,
      subStrategies: ['T123-1MIN-026', 'T123-1MIN-HL-026']
    },

    // 15-Minute Market Strategies - Fine-Tuned Around 0.60% Sweet Spot
    'T369-3MIN-056': {
      name: 'T369-0.56%',
      description: '15-min markets: 3-min candles, 0.56% threshold',
      interval: '3m',
      marketDuration: 15,
      minThreshold: 0.56,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      // T+4 excluded: that candle closes at the same instant the market resolves
      // (minute 15), so it's too late to enter. T+3 closes at minute 12 (3 min left).
      checkWindows: [0, 1, 2, 3]
    },
    'T369-3MIN-057': {
      name: 'T369-0.57%',
      description: '15-min markets: 3-min candles, 0.57% threshold',
      interval: '3m',
      marketDuration: 15,
      minThreshold: 0.57,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2, 3]
    },
    'T369-3MIN-058': {
      name: 'T369-0.58%',
      description: '15-min markets: 3-min candles, 0.58% threshold',
      interval: '3m',
      marketDuration: 15,
      minThreshold: 0.58,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2, 3]
    },
    'T369-3MIN-059': {
      name: 'T369-0.59%',
      description: '15-min markets: 3-min candles, 0.59% threshold',
      interval: '3m',
      marketDuration: 15,
      minThreshold: 0.59,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2, 3]
    },
    'T369-3MIN-060': {
      name: 'T369-0.60%',
      description: '15-min markets: 3-min candles, 0.60% threshold (88.4% win rate)',
      interval: '3m',
      marketDuration: 15,
      minThreshold: 0.60,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2, 3]
    },
    'T369-3MIN-061': {
      name: 'T369-0.61%',
      description: '15-min markets: 3-min candles, 0.61% threshold',
      interval: '3m',
      marketDuration: 15,
      minThreshold: 0.61,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2, 3]
    },
    'T369-3MIN-062': {
      name: 'T369-0.62%',
      description: '15-min markets: 3-min candles, 0.62% threshold',
      interval: '3m',
      marketDuration: 15,
      minThreshold: 0.62,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2, 3]
    },
    'T369-3MIN-063': {
      name: 'T369-0.63%',
      description: '15-min markets: 3-min candles, 0.63% threshold',
      interval: '3m',
      marketDuration: 15,
      minThreshold: 0.63,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2, 3]
    },

    // Internal sub-strategies (not selectable in UI, used by FUSION modes)
    'T123-1MIN-HL-020': {
      name: 'T123-HL-0.20%',
      description: 'High-Low Filter with 0.20% threshold',
      interval: '1m',
      marketDuration: 5,
      hlThreshold: 0.20,
      ocThreshold: 0.20,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      dualThreshold: true,
      perCryptoThresholds: {
        'BTC': { hlThreshold: 0.20, ocThreshold: 0.20 },
        'SOL': { hlThreshold: 0.20, ocThreshold: 0.20 },
        'XRP': { hlThreshold: 0.20, ocThreshold: 0.20 },
        'ETH': { hlThreshold: 0.20, ocThreshold: 0.20 }
      }
    },
    'T123-1MIN-HL-021': {
      name: 'T123-HL-0.21%',
      description: 'High-Low Filter with 0.21% threshold',
      interval: '1m',
      marketDuration: 5,
      hlThreshold: 0.21,
      ocThreshold: 0.21,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      dualThreshold: true,
      perCryptoThresholds: {
        'BTC': { hlThreshold: 0.21, ocThreshold: 0.21 },
        'SOL': { hlThreshold: 0.21, ocThreshold: 0.21 },
        'XRP': { hlThreshold: 0.21, ocThreshold: 0.21 },
        'ETH': { hlThreshold: 0.21, ocThreshold: 0.21 }
      }
    },
    'T123-1MIN-HL-022': {
      name: 'T123-HL-0.22%',
      description: 'High-Low Filter with 0.22% threshold',
      interval: '1m',
      marketDuration: 5,
      hlThreshold: 0.22,
      ocThreshold: 0.22,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      dualThreshold: true,
      perCryptoThresholds: {
        'BTC': { hlThreshold: 0.22, ocThreshold: 0.22 },
        'SOL': { hlThreshold: 0.22, ocThreshold: 0.22 },
        'XRP': { hlThreshold: 0.22, ocThreshold: 0.22 },
        'ETH': { hlThreshold: 0.22, ocThreshold: 0.22 }
      }
    },
    'T123-1MIN-HL-023': {
      name: 'T123-HL-0.23%',
      description: 'High-Low Filter with 0.23% threshold',
      interval: '1m',
      marketDuration: 5,
      hlThreshold: 0.23,
      ocThreshold: 0.23,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      dualThreshold: true,
      perCryptoThresholds: {
        'BTC': { hlThreshold: 0.23, ocThreshold: 0.23 },
        'SOL': { hlThreshold: 0.23, ocThreshold: 0.23 },
        'XRP': { hlThreshold: 0.23, ocThreshold: 0.23 },
        'ETH': { hlThreshold: 0.23, ocThreshold: 0.23 }
      }
    },
    'T123-1MIN-HL-024': {
      name: 'T123-HL-0.24%',
      description: 'High-Low Filter with 0.24% threshold',
      interval: '1m',
      marketDuration: 5,
      hlThreshold: 0.24,
      ocThreshold: 0.24,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      dualThreshold: true,
      perCryptoThresholds: {
        'BTC': { hlThreshold: 0.24, ocThreshold: 0.24 },
        'SOL': { hlThreshold: 0.24, ocThreshold: 0.24 },
        'XRP': { hlThreshold: 0.24, ocThreshold: 0.24 },
        'ETH': { hlThreshold: 0.24, ocThreshold: 0.24 }
      }
    },
    'T123-1MIN-HL-025': {
      name: 'T123-HL-0.25%',
      description: 'High-Low Filter with 0.25% threshold',
      interval: '1m',
      marketDuration: 5,
      hlThreshold: 0.25,
      ocThreshold: 0.25,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      dualThreshold: true,
      perCryptoThresholds: {
        'BTC': { hlThreshold: 0.25, ocThreshold: 0.25 },
        'SOL': { hlThreshold: 0.25, ocThreshold: 0.25 },
        'XRP': { hlThreshold: 0.25, ocThreshold: 0.25 },
        'ETH': { hlThreshold: 0.25, ocThreshold: 0.25 }
      }
    },
    'T123-1MIN-HL-026': {
      name: 'T123-HL-0.26%',
      description: 'High-Low Filter with 0.26% threshold',
      interval: '1m',
      marketDuration: 5,
      hlThreshold: 0.26,
      ocThreshold: 0.26,
      maxThreshold: 2.0,
      candleSource: 'binance-kline',
      checkWindows: [0, 1, 2],
      dualThreshold: true,
      perCryptoThresholds: {
        'BTC': { hlThreshold: 0.26, ocThreshold: 0.26 },
        'SOL': { hlThreshold: 0.26, ocThreshold: 0.26 },
        'XRP': { hlThreshold: 0.26, ocThreshold: 0.26 },
        'ETH': { hlThreshold: 0.26, ocThreshold: 0.26 }
      }
    }
  },

  // Momentum detection parameters (loaded from DB per crypto)
  DEFAULT_THRESHOLD_PCT: 0.23,    // Default threshold if not in DB (legacy, unused with strategies)
  MAX_ENTRY_MINUTE: 2,            // Latest candle to check (T+2, checked at time T+3)
  MIN_ENTRY_MINUTE: 0,            // Earliest candle to check (T+0, checked at time T+1)

  // Market targeting
  MARKET_DURATION_MINUTES: 5,     // Only trade 5-minute markets

  // Binance WebSocket
  BINANCE_WS_BASE: 'wss://stream.binance.com:9443/ws',

  // Gamma API (Polymarket)
  GAMMA_API_BASE: 'https://gamma-api.polymarket.com',
  GAMMA_POLL_INTERVAL_MS: 10000, // Poll for new markets every 10s

  // Logging
  LOG_LEVEL: 'verbose',
  LOG_ALL_CANDLES: false, // Set to true to log every 1min candle (noisy)

  // T123-FUSION STRATEGY MODE - Dual-strategy system with tiered position sizing
  FUSION_MODE: process.env.SPIKE_FUSION_MODE === 'true' || process.env.SPIKE_HYBRID_MODE === 'true' || false,
  FUSION_STRATEGIES: {
    'T123-1MIN': {
      enabled: true,
      positionSizePct: 5.0,  // Volume layer: catches high-frequency signals
      tier: 'VOLUME',
      description: 'Volume strategy - more signals, moderate win rate (~91.7%)'
    },
    'T123-1MIN-HL': {
      enabled: true,
      positionSizePct: 10.0,  // Quality layer: ultra-selective, zero-loss signals
      tier: 'QUALITY',
      description: 'Quality strategy - fewer signals, 100% win rate (backtested)'
    }
  },

  // Simulation - Realistic Capital Tracking
  STARTING_CAPITAL: parseFloat(process.env.SPIKE_STARTING_CAPITAL || '2000'),
  POSITION_SIZE_PCT: parseFloat(process.env.SPIKE_POSITION_SIZE_PCT || '5'),
  MIN_POSITION_SIZE_USD: parseFloat(process.env.SPIKE_MIN_POSITION_SIZE || '1.0'), // Minimum trade size
  MAX_EXPOSURE_PCT: parseFloat(process.env.SPIKE_MAX_EXPOSURE_PCT || '20'), // Max % of capital at risk across all cryptos
  SIMULATION_DURATION_DAYS: 7,

  // Slippage - Same as copy-trading for realism (validate range 0-100)
  SLIPPAGE_TOLERANCE_PCT: Math.max(0, Math.min(100, parseFloat(process.env.SLIPPAGE_TOLERANCE || '3'))),

  // Price Filter - Don't buy if entry price is too expensive
  MAX_ENTRY_PRICE: parseFloat(process.env.SPIKE_MAX_ENTRY_PRICE || '0.90'),

  // Fade Price Filter — entry range is NO 4¢–9¢ (YES 91¢–96¢).
  // Above 9¢ the GTC exit table has no entry; below 4¢ the spike is too extreme.
  MAX_FADE_ENTRY_PRICE: parseFloat(process.env.SPIKE_MAX_FADE_ENTRY_PRICE || '0.09'),

  // Fade minimum entry price — skip if counter is below 4¢ (YES > 96¢).
  // At NO < 4¢ the spike is too extreme; retrace probability too low for GTC exit to fill.
  MIN_FADE_ENTRY_PRICE: parseFloat(process.env.SPIKE_MIN_FADE_ENTRY_PRICE || '0.04'),

  // Live Trading Configuration (ONLY used when TRADING_MODE='LIVE')
  LIVE_TRADING: {
    // Polymarket CLOB credentials (required for live trading)
    PRIVATE_KEY: process.env.POLY_SIGNER_KEY,
    API_KEY: process.env.POLY_API_KEY,
    API_SECRET: process.env.POLY_API_SECRET,
    API_PASSPHRASE: process.env.POLY_API_PASSPHRASE,
    PROXY_ADDRESS: process.env.POLY_PROXY_ADDRESS,
    CHAIN_ID: parseInt(process.env.SPIKE_CHAIN_ID || '137'), // Polygon mainnet
    CLOB_URL: process.env.SPIKE_CLOB_URL || 'https://clob.polymarket.com',
    POLYGON_RPC_URL: process.env.POLYGON_RPC_URL || 'https://polygon.drpc.org', // For CTF contract interactions (free public RPC)

    // Safety limits
    MIN_BALANCE_USDC: parseFloat(process.env.SPIKE_MIN_BALANCE || '0'), // No minimum (user handles balance)
    MAX_OPEN_POSITIONS: parseInt(process.env.SPIKE_MAX_OPEN_POSITIONS || '10'),
    ENABLE_EMERGENCY_STOP: process.env.SPIKE_EMERGENCY_STOP !== 'false', // Stop on errors

    // Order settings
    ORDER_EXPIRY_SECONDS: 300, // Orders expire after 5 minutes
    ORDER_TYPE: 'FOK', // Fill or Kill (no partial fills)
  },

  // Residential proxy (CLOB API only - bypasses Cloudflare 403)
  // Supports: IPRoyal, Oxylabs, Decodo (providers that allow crypto trading)
  CLOB_PROXY: {
    ENABLED: process.env.CLOB_USE_PROXY === 'true',
    PROTOCOL: process.env.CLOB_PROXY_PROTOCOL || 'http', // http or socks5
    HOST: process.env.CLOB_PROXY_HOST || 'geo.iproyal.com',
    PORT: process.env.CLOB_PROXY_PORT || '12321',
    USER: process.env.CLOB_PROXY_USER,
    PASS: process.env.CLOB_PROXY_PASS
  }
};
