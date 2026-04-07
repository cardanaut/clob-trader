-- 021_t1000_live_trades_threshold.sql
-- Add threshold (MinSpike%) to t1000_live_trades for display in trade history.
-- NULL for older rows written before this migration.

ALTER TABLE t1000_live_trades
  ADD COLUMN IF NOT EXISTS threshold NUMERIC(10,4);
