-- Add max_entry_price setting to spike configuration

CREATE TABLE IF NOT EXISTS spike_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert max_entry_price setting with default 0.75 (75 cents)
INSERT INTO spike_settings (setting_key, setting_value, description)
VALUES ('max_entry_price', '0.75', 'Maximum entry price (0-1) for Polymarket positions. Don''t buy if price is above this.')
ON CONFLICT (setting_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_spike_settings_key ON spike_settings(setting_key);
