-- SpikeTrading Crypto Configuration Table
-- Stores threshold settings for each cryptocurrency

CREATE TABLE IF NOT EXISTS spike_crypto_config (
    id SERIAL PRIMARY KEY,
    crypto_symbol VARCHAR(10) NOT NULL UNIQUE, -- 'BTC', 'ETH', 'SOL', 'XRP'
    enabled BOOLEAN DEFAULT true,
    threshold_pct NUMERIC DEFAULT 0.23, -- Minimum candle movement % to trigger
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default configurations
INSERT INTO spike_crypto_config (crypto_symbol, enabled, threshold_pct) VALUES
    ('BTC', true, 0.23),
    ('ETH', true, 0.23),
    ('SOL', true, 0.23),
    ('XRP', true, 0.23)
ON CONFLICT (crypto_symbol) DO NOTHING;

-- Add crypto_symbol column to existing trades tables
ALTER TABLE spike_trades_simulated ADD COLUMN IF NOT EXISTS crypto_symbol VARCHAR(10) DEFAULT 'BTC';
ALTER TABLE spike_trades_live ADD COLUMN IF NOT EXISTS crypto_symbol VARCHAR(10) DEFAULT 'BTC';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_spike_trades_simulated_crypto ON spike_trades_simulated(crypto_symbol);
CREATE INDEX IF NOT EXISTS idx_spike_trades_live_crypto ON spike_trades_live(crypto_symbol);

-- Comment
COMMENT ON TABLE spike_crypto_config IS 'Configuration for each cryptocurrency in SpikeTrading (thresholds, enable/disable)';
