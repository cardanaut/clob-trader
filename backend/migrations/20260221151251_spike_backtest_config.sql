-- Create spike_backtest_config table for storing backtest-specific range settings

CREATE TABLE IF NOT EXISTS spike_backtest_config (
  id SERIAL PRIMARY KEY,
  crypto_symbol VARCHAR(10) NOT NULL UNIQUE,
  min_threshold_pct NUMERIC(8,4) NOT NULL DEFAULT 0.15,
  max_threshold_pct NUMERIC(8,4) NOT NULL DEFAULT 0.30,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default configs for all cryptos
INSERT INTO spike_backtest_config (crypto_symbol, min_threshold_pct, max_threshold_pct)
VALUES 
  ('BTC', 0.15, 0.30),
  ('ETH', 0.15, 0.30),
  ('SOL', 0.15, 0.30),
  ('XRP', 0.15, 0.30)
ON CONFLICT (crypto_symbol) DO NOTHING;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_spike_backtest_crypto ON spike_backtest_config(crypto_symbol);
