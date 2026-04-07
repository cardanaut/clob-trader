-- T1000 Live Trades — base table creation
-- This table was created directly in polychamp (not via migration).
-- In clob_trader we create it here so migrations 017-021 can ALTER it.

CREATE TABLE IF NOT EXISTS t1000_live_trades (
  id           SERIAL PRIMARY KEY,
  trade_id     TEXT NOT NULL,
  strategy     VARCHAR(20) NOT NULL,
  crypto       VARCHAR(10) NOT NULL,
  candle_size  SMALLINT NOT NULL,
  direction    VARCHAR(5) NOT NULL,
  spike_pct    NUMERIC(8,4),
  entry_price  NUMERIC(6,4),
  position_usd NUMERIC(12,4),
  status       VARCHAR(10) NOT NULL,
  pnl_usd      NUMERIC(12,4),
  cycle_start  BIGINT,
  redeemed     BOOLEAN DEFAULT false,
  trade_time   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(trade_id)
);

CREATE INDEX IF NOT EXISTS idx_t1000_live_trades_strategy   ON t1000_live_trades(strategy);
CREATE INDEX IF NOT EXISTS idx_t1000_live_trades_crypto      ON t1000_live_trades(crypto);
CREATE INDEX IF NOT EXISTS idx_t1000_live_trades_status      ON t1000_live_trades(status);
CREATE INDEX IF NOT EXISTS idx_t1000_live_trades_trade_time  ON t1000_live_trades(trade_time DESC);
