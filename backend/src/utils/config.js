require('dotenv').config();

module.exports = {
  db: {
    url: process.env.DATABASE_URL || 'postgresql://polychamp_user:password@localhost:5432/polychamp',
  },
  polymarket: {
    wsUrl: process.env.POLYMARKET_WS_URL || 'wss://clob.polymarket.com/ws/market',
    apiUrl: process.env.POLYMARKET_API_URL || 'https://clob.polymarket.com',
    gammaUrl: process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com',
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  collection: {
    minTradeUsd: parseFloat(process.env.MIN_TRADE_USD || '2000'),
    wsReconnectMaxMs: parseInt(process.env.WS_RECONNECT_MAX_MS || '30000', 10),
    balanceSnapshotTimeoutMs: parseInt(process.env.BALANCE_SNAPSHOT_TIMEOUT_MS || '5000', 10),
  },
  features: {
    liveTrading: process.env.ENABLE_LIVE_TRADING === 'true',
    notifications: process.env.ENABLE_NOTIFICATIONS === 'true',
  },
};
