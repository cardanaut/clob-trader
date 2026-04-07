-- 020_wallet_id.sql
-- Add wallet_id to t1000_live_trades for multi-wallet fan-out support.
-- Existing rows get wallet_id = 'default' via column DEFAULT.

ALTER TABLE t1000_live_trades
  ADD COLUMN IF NOT EXISTS wallet_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_live_trades_wallet_id
  ON t1000_live_trades(wallet_id);
