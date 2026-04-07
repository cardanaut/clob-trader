-- Enrich t1000_rejected with candle context for deep analysis / AI training
-- cycle_start_ms: exact cycle start (avoids jitter in created_at-derived value)
-- context_candles: last 8 candles of same (crypto, candle_size) pair
--   = spike candle + 7 prior cycles, each: {t, o, h, l, c, sp, ya, na}
--   Ephemeral data captured at rejection time (Polymarket bid/ask cannot be reconstructed later)

ALTER TABLE t1000_rejected
  ADD COLUMN IF NOT EXISTS cycle_start_ms  BIGINT,
  ADD COLUMN IF NOT EXISTS context_candles JSONB;

CREATE INDEX IF NOT EXISTS idx_t1000_rejected_cycle ON t1000_rejected(cycle_start_ms);

COMMENT ON COLUMN t1000_rejected.cycle_start_ms  IS 'Cycle start epoch-ms (precise; created_at has jitter)';
COMMENT ON COLUMN t1000_rejected.context_candles IS 'Last 8 candles [{t,o,h,l,c,sp,ya,na}], last = spike candle';
