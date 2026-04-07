-- SpikeTrading Live Trades Table
-- Stores real money trades executed on Polymarket

CREATE TABLE IF NOT EXISTS spike_trades_live (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),

    -- Market info
    market_id TEXT NOT NULL,
    market_question TEXT,
    market_slug TEXT,

    -- Cycle timing
    cycle_start_time TIMESTAMP,
    cycle_end_time TIMESTAMP,
    signal_minute INTEGER, -- 0, 1, or 2 (T+0, T+1, T+2)

    -- Candle data
    reference_price NUMERIC,
    candle_open NUMERIC,
    candle_high NUMERIC,
    candle_low NUMERIC,
    candle_close NUMERIC,
    candle_range_pct NUMERIC,

    -- Order book pricing
    polymarket_best_ask NUMERIC,
    entry_price NUMERIC,
    actual_slippage_pct NUMERIC,
    order_book_depth INTEGER,

    -- Trade details
    signal_type TEXT, -- 'BUY_YES' or 'BUY_NO'
    outcome TEXT DEFAULT 'PENDING', -- 'PENDING', 'WIN', 'LOSS'
    position_size_usd NUMERIC,
    balance_before NUMERIC,

    -- Order execution
    order_id TEXT,
    order_status TEXT,
    token_id TEXT,

    -- P&L (filled when resolved)
    pnl_pct NUMERIC,
    pnl_usd NUMERIC,
    resolution_price NUMERIC,
    balance_after NUMERIC,

    -- Notes
    notes TEXT,

    -- Indexes
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_spike_live_trades_timestamp ON spike_trades_live(timestamp);
CREATE INDEX IF NOT EXISTS idx_spike_live_trades_market_id ON spike_trades_live(market_id);
CREATE INDEX IF NOT EXISTS idx_spike_live_trades_outcome ON spike_trades_live(outcome);
CREATE INDEX IF NOT EXISTS idx_spike_live_trades_order_id ON spike_trades_live(order_id);

-- Comment
COMMENT ON TABLE spike_trades_live IS 'Real money trades executed by SpikeTrading bot on Polymarket (LIVE mode only)';
