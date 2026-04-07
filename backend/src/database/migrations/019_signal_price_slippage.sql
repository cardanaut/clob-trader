-- 019_signal_price_slippage.sql
-- Track signal (WebSocket) price at decision time vs actual CLOB fill price.
-- signal_price      = yesAsk/noAsk read from WS when the engine decides to trade
-- order_limit_price = FOK limit sent to CLOB (bestAsk × 1.03 at order submission time)
-- entry_price       = actual fill price derived from makingAmount/takingAmount in CLOB response
-- slippage          = entry_price - signal_price  (computed on read, not stored)

ALTER TABLE t1000_live_trades
  ADD COLUMN IF NOT EXISTS signal_price      NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS order_limit_price NUMERIC(6,4);
