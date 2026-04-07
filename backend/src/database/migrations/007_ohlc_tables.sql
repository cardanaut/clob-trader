-- OHLC market data tables for clob_trader
-- These were not in migrations 001-007 (polychamp copy-trading era) so we create them here.

CREATE TABLE IF NOT EXISTS binance_minute_ohlc (
  id               SERIAL PRIMARY KEY,
  crypto           VARCHAR(10) NOT NULL,
  candle_open_time TIMESTAMPTZ NOT NULL,
  open             NUMERIC(14,4) NOT NULL,
  high             NUMERIC(14,4) NOT NULL,
  low              NUMERIC(14,4) NOT NULL,
  close            NUMERIC(14,4) NOT NULL,
  volume           NUMERIC(20,4),
  cycle_start      TIMESTAMPTZ NOT NULL,
  minute_in_cycle  SMALLINT NOT NULL,
  spike_detected   BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(crypto, candle_open_time)
);
CREATE INDEX IF NOT EXISTS idx_binance_ohlc_cycle ON binance_minute_ohlc (cycle_start, crypto);
CREATE INDEX IF NOT EXISTS idx_binance_ohlc_spike ON binance_minute_ohlc (spike_detected, crypto);

CREATE TABLE IF NOT EXISTS polymarket_price_ohlc (
  id               SERIAL PRIMARY KEY,
  crypto           VARCHAR(10) NOT NULL,
  outcome          VARCHAR(5) NOT NULL,
  cycle_start      TIMESTAMPTZ NOT NULL,
  minute_in_cycle  SMALLINT NOT NULL,
  ask_open         NUMERIC(6,4),
  ask_high         NUMERIC(6,4),
  ask_low          NUMERIC(6,4),
  ask_close        NUMERIC(6,4),
  bid_open         NUMERIC(6,4),
  bid_high         NUMERIC(6,4),
  bid_low          NUMERIC(6,4),
  bid_close        NUMERIC(6,4),
  tick_count       INTEGER NOT NULL DEFAULT 0,
  spike_detected   BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(crypto, outcome, cycle_start, minute_in_cycle)
);
CREATE INDEX IF NOT EXISTS idx_polymarket_ohlc_cycle ON polymarket_price_ohlc (cycle_start, crypto);
CREATE INDEX IF NOT EXISTS idx_polymarket_ohlc_spike ON polymarket_price_ohlc (spike_detected, crypto);

CREATE TABLE IF NOT EXISTS kalshi_price_ohlc (
  id               SERIAL PRIMARY KEY,
  crypto           VARCHAR(10) NOT NULL,
  outcome          VARCHAR(5) NOT NULL,
  cycle_start      TIMESTAMPTZ NOT NULL,
  minute_in_cycle  SMALLINT NOT NULL,
  ask_open         NUMERIC(6,4),
  ask_high         NUMERIC(6,4),
  ask_low          NUMERIC(6,4),
  ask_close        NUMERIC(6,4),
  bid_open         NUMERIC(6,4),
  bid_high         NUMERIC(6,4),
  bid_low          NUMERIC(6,4),
  bid_close        NUMERIC(6,4),
  tick_count       INTEGER NOT NULL DEFAULT 0,
  spike_detected   BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(crypto, outcome, cycle_start, minute_in_cycle)
);
CREATE INDEX IF NOT EXISTS idx_kalshi_ohlc_cycle ON kalshi_price_ohlc (cycle_start, crypto);
CREATE INDEX IF NOT EXISTS idx_kalshi_ohlc_spike ON kalshi_price_ohlc (spike_detected, crypto);
