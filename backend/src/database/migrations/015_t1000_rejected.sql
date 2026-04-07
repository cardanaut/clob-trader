-- T1000 Rejected Candidates
-- Signals that passed the spike threshold but were blocked by a downstream filter.
-- Only LIVE strategy rejections are recorded (not paper strategies).

CREATE TABLE IF NOT EXISTS t1000_rejected (
    id           SERIAL PRIMARY KEY,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    crypto       VARCHAR(10)  NOT NULL,   -- BTC, ETH, SOL, XRP
    candle_size  SMALLINT     NOT NULL,   -- e.g. 65, 85, 165
    direction    VARCHAR(5)   NOT NULL,   -- UP, DOWN
    spike_pct    NUMERIC(8,4) NOT NULL,   -- absolute spike magnitude
    threshold    NUMERIC(8,4),            -- threshold configured at rejection time
    yes_ask      NUMERIC(6,4),            -- Polymarket YES ask (0-1)
    no_ask       NUMERIC(6,4),            -- Polymarket NO ask (0-1)
    entry_price  NUMERIC(6,4),            -- would-be entry price (direction-relevant)
    reason       VARCHAR(30)  NOT NULL,   -- rejection reason code
    details      JSONB                    -- extra context (body ratio, min/max price, etc.)
);

CREATE INDEX IF NOT EXISTS idx_t1000_rejected_created ON t1000_rejected(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_t1000_rejected_crypto  ON t1000_rejected(crypto);
CREATE INDEX IF NOT EXISTS idx_t1000_rejected_reason  ON t1000_rejected(reason);
