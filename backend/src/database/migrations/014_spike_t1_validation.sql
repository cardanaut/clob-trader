-- Migration 014: T+1 validation table for structured 2-week data collection
-- Captures T+0 spike events with T+1 CLOB entry prices and resolved outcomes.
-- Only minute_in_cycle = 1 (first 1-min candle, = C60 / T+1 entry at 01:00).

CREATE TABLE IF NOT EXISTS spike_t1_validation (
  id                SERIAL PRIMARY KEY,
  timestamp         TIMESTAMPTZ NOT NULL,          -- Cycle start (T+0 = 00:00 of 5-min cycle)
  crypto            VARCHAR(10) NOT NULL,           -- BTC, ETH, SOL, XRP
  market_slug       TEXT,                           -- Polymarket market identifier
  candle_size       SMALLINT NOT NULL DEFAULT 60,   -- 40, 50, or 60 seconds
  spike_pct         NUMERIC(8,4) NOT NULL,          -- % movement of T+0 candle (signed)
  spike_direction   VARCHAR(4) NOT NULL,            -- UP or DOWN
  t1_yes_ask        NUMERIC(6,4),                  -- YES ask at entry moment (¢ decimal, e.g. 0.82)
  t1_no_ask         NUMERIC(6,4),                  -- NO ask at entry moment
  t1_yes_bid        NUMERIC(6,4),                  -- YES bid at entry moment
  t1_no_bid         NUMERIC(6,4),                  -- NO bid at entry moment
  entry_price       NUMERIC(6,4),                  -- Actual entry price used (ask side of trade)
  entry_direction   VARCHAR(8),                    -- BUY_YES or BUY_NO
  position_size     NUMERIC(12,4),                 -- Position size in USD
  reference_price   NUMERIC(16,8),                 -- Binance spot at cycle open (T+0)
  resolution_price  NUMERIC(16,8),                 -- Binance spot at cycle close (T+5)
  outcome           VARCHAR(16),                   -- WIN, LOSS, SKIP_PRICE, SKIP_LIQUIDITY, PENDING
  pnl_pct           NUMERIC(8,4),                  -- P&L as % of position
  pnl_usd           NUMERIC(12,4),                 -- P&L in USD
  notes             TEXT,                          -- Anomalies, slippage, etc.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_t1_validation_timestamp  ON spike_t1_validation (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_t1_validation_crypto     ON spike_t1_validation (crypto);
CREATE INDEX IF NOT EXISTS idx_t1_validation_outcome    ON spike_t1_validation (outcome);
CREATE INDEX IF NOT EXISTS idx_t1_validation_candle     ON spike_t1_validation (candle_size);
