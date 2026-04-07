-- Spike Trading Activity Log
-- Tracks all significant events during spike trading operations

CREATE TABLE IF NOT EXISTS spike_activity_log (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    event_type VARCHAR(50) NOT NULL, -- 'signal_detected', 'trade_executed', 'trade_skipped', 'market_tracked', 'cycle_ended', 'error'
    crypto_symbol VARCHAR(10), -- BTC, ETH, SOL, XRP
    market_id VARCHAR(100),
    message TEXT NOT NULL,
    details JSONB
);

CREATE INDEX IF NOT EXISTS idx_spike_activity_log_created ON spike_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spike_activity_log_event ON spike_activity_log(event_type);
CREATE INDEX IF NOT EXISTS idx_spike_activity_log_crypto ON spike_activity_log(crypto_symbol);
