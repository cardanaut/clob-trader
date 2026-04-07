-- Add market outcome tracking to missed opportunities
-- So we can show if the missed trade would have won or lost

ALTER TABLE spike_missed_opportunities
ADD COLUMN IF NOT EXISTS market_outcome VARCHAR(10); -- 'YES', 'NO', 'PENDING', NULL

CREATE INDEX IF NOT EXISTS idx_spike_missed_opp_outcome ON spike_missed_opportunities(market_outcome);
