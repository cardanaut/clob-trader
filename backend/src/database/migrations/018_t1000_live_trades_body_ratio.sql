-- Add body_ratio column to t1000_live_trades
-- body_ratio: candle body / candle height × 100 (e.g. 82.5 = 82.5%)
-- Computed from spike candle OHLC at T+0; NULL for T+1/TC entries (OHLC not available)

ALTER TABLE t1000_live_trades
  ADD COLUMN IF NOT EXISTS body_ratio REAL;

COMMENT ON COLUMN t1000_live_trades.body_ratio IS 'Spike candle body% = abs(close-open)/(high-low)*100. NULL for T+1 / TC entries where OHLC is unavailable.';
