-- Enrich t1000_live_trades with candle context for backtesting / AI analysis
-- context_candles: last 8 candles of same (crypto, candle_size) pair captured at trade entry
--   = spike candle + 7 prior cycles, each: {t, o, h, l, c, sp, ya, na}
--   Matches the same schema as t1000_rejected.context_candles for cross-table analysis

ALTER TABLE t1000_live_trades
  ADD COLUMN IF NOT EXISTS context_candles JSONB;

COMMENT ON COLUMN t1000_live_trades.context_candles IS 'Last 8 candles [{t,o,h,l,c,sp,ya,na}] captured at trade entry time, last = spike candle';
