-- Spike Trading Missed Opportunities
-- Tracks signals that were detected but not traded due to filters or constraints

CREATE TABLE IF NOT EXISTS spike_missed_opportunities (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    crypto_symbol VARCHAR(10) NOT NULL, -- BTC, ETH, SOL, XRP
    market_id VARCHAR(100),
    market_question TEXT,
    signal_type VARCHAR(20) NOT NULL, -- BUY_YES or BUY_NO
    signal_minute INTEGER, -- T+0, T+1, T+2
    candle_movement_pct NUMERIC(10,4), -- How strong was the momentum
    reason VARCHAR(50) NOT NULL, -- 'entry_price_too_high', 'insufficient_liquidity', 'exposure_limit_exceeded', 'crypto_disabled', 'capital_exhausted', 'timing_window_closed'
    entry_price NUMERIC(8,6), -- What the entry price would have been
    max_entry_price NUMERIC(8,6), -- Filter threshold
    order_book_depth NUMERIC(12,4), -- Available liquidity
    current_exposure_pct NUMERIC(6,2), -- % of capital at risk
    max_exposure_pct NUMERIC(6,2), -- Exposure limit
    available_capital NUMERIC(12,4),
    would_be_position_size NUMERIC(12,4), -- What the position size would have been
    details JSONB
);

CREATE INDEX IF NOT EXISTS idx_spike_missed_opp_created ON spike_missed_opportunities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spike_missed_opp_crypto ON spike_missed_opportunities(crypto_symbol);
CREATE INDEX IF NOT EXISTS idx_spike_missed_opp_reason ON spike_missed_opportunities(reason);
