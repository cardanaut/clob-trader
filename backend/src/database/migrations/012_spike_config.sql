-- SpikeTrading Global Configuration Table
-- Stores global settings like position size, minimum trade size, etc.

CREATE TABLE IF NOT EXISTS spike_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default configurations
INSERT INTO spike_config (key, value, description) VALUES
    ('position_size_pct', '5', 'Position size as percentage of capital (default 5%)'),
    ('min_trade_size_usd', '1', 'Minimum trade size in USD (Polymarket minimum is $1)')
ON CONFLICT (key) DO NOTHING;

-- Index
CREATE INDEX IF NOT EXISTS idx_spike_config_key ON spike_config(key);

-- Comment
COMMENT ON TABLE spike_config IS 'Global configuration settings for SpikeTrading engine';
