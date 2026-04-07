-- Add min/max threshold range for live spike trading
-- Replaces single threshold_pct with a range (min_threshold_pct, max_threshold_pct)

-- Add new columns (nullable at first for migration)
ALTER TABLE spike_crypto_config 
ADD COLUMN IF NOT EXISTS min_threshold_pct NUMERIC(8,4),
ADD COLUMN IF NOT EXISTS max_threshold_pct NUMERIC(8,4);

-- Migrate existing threshold_pct to min/max range
-- Use threshold_pct as min, and threshold_pct + 0.10 as max (or 0.30 max if higher)
UPDATE spike_crypto_config
SET 
  min_threshold_pct = threshold_pct,
  max_threshold_pct = LEAST(threshold_pct + 0.10, 0.30)
WHERE min_threshold_pct IS NULL;

-- Set defaults for any rows that don't have values
UPDATE spike_crypto_config
SET 
  min_threshold_pct = 0.15,
  max_threshold_pct = 0.30
WHERE min_threshold_pct IS NULL;

-- Make columns non-nullable
ALTER TABLE spike_crypto_config 
ALTER COLUMN min_threshold_pct SET NOT NULL,
ALTER COLUMN min_threshold_pct SET DEFAULT 0.15,
ALTER COLUMN max_threshold_pct SET NOT NULL,
ALTER COLUMN max_threshold_pct SET DEFAULT 0.30;

-- Keep threshold_pct column for backward compatibility (can be removed later)
-- But update it to match min_threshold_pct for now
UPDATE spike_crypto_config SET threshold_pct = min_threshold_pct;
