// ── CLOB Trader — T1000 routes ──
'use strict';
const fs            = require('fs');
const path          = require('path');
const { execFile }  = require('child_process');
const logger        = require('../../utils/logger');

module.exports = function registerT1000Routes(app, { authMiddleware, t1000Engine, query }) {

// ─── T1000 Routes ─────────────────────────────────────────────────────────────

/** GET /t1000/state — returns all strategy states */
app.get('/t1000/state', (req, res) => {
  try {
    res.json(t1000Engine.getState());
  } catch (err) {
    logger.error('[api] GET /t1000/state error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/autoscan — returns autoscan_v2.json (3D sweep results for SETUP Fill button) */
app.get('/t1000/autoscan', (req, res) => {
  try {
    const fs   = require('fs');
    const path = require('path');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../logs/autoscan_v2.json'), 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'autoscan_v2.json not found — run: node simulate_combined.js -nf -as' });
  }
});

/** POST /t1000/config — update a strategy's enabled/threshold/strategy */
app.post('/t1000/config', authMiddleware, (req, res) => {
  try {
    const { stratKey, ...changes } = req.body;
    if (!stratKey) return res.status(400).json({ error: 'stratKey required' });
    const ok = t1000Engine.updateConfig(stratKey, changes);
    if (!ok) return res.status(400).json({ error: 'Unknown strategy key' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('[api] POST /t1000/config error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** POST /t1000/reset — reset balance + stats for a strategy */
app.post('/t1000/reset', authMiddleware, (req, res) => {
  try {
    const { stratKey } = req.body;
    if (!stratKey) return res.status(400).json({ error: 'stratKey required' });
    const ok = t1000Engine.resetBalance(stratKey);
    if (!ok) return res.status(400).json({ error: 'Unknown strategy key' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('[api] POST /t1000/reset error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/rejected/stats — per-reason outcome breakdown for false-positive analysis */
app.get('/t1000/rejected/stats', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, created_at, crypto, candle_size, direction, reason, cycle_start_ms
       FROM t1000_rejected
       WHERE created_at > NOW() - INTERVAL '30 days'`
    );

    let pmOutcomes = {};
    try {
      const pmPath = require('path').join(__dirname, '../../cache/pm_outcomes.json');
      pmOutcomes = JSON.parse(require('fs').readFileSync(pmPath, 'utf8'));
    } catch { /* silent */ }

    // Aggregate: for each reason, count total / WIN (false positive) / LOSS (correct) / unknown
    const byReason = {};
    for (const r of result.rows) {
      if (!byReason[r.reason]) byReason[r.reason] = { total: 0, WIN: 0, LOSS: 0, unknown: 0 };
      byReason[r.reason].total++;
      const durationSec   = r.candle_size >= 150 ? 900 : 300;
      const cycleStartSec = r.cycle_start_ms
        ? Math.floor(r.cycle_start_ms / 1000)
        : Math.floor(new Date(r.created_at).getTime() / 1000 / durationSec) * durationSec;
      const outcome = pmOutcomes[`${r.crypto}_${cycleStartSec}_${durationSec}`] ?? null;
      if (!outcome) {
        byReason[r.reason].unknown++;
      } else if (outcome === r.direction) {
        // Market resolved same direction as our signal → would have been a WIN if we'd taken it
        byReason[r.reason].WIN++;
      } else {
        // Market resolved opposite → rejection saved us a LOSS
        byReason[r.reason].LOSS++;
      }
    }

    // Add false-positive rate (fpr) = WIN% among known outcomes
    for (const r of Object.values(byReason)) {
      const known = r.WIN + r.LOSS;
      r.fpr = known > 0 ? parseFloat((r.WIN / known * 100).toFixed(1)) : null;
    }

    res.json({ byReason, total: result.rows.length });
  } catch (err) {
    logger.error('[api] GET /t1000/rejected/stats error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/rejected — fetch rejected LIVE candidates (last 30 days, paginated) */
app.get('/t1000/rejected', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  ?? 1));
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit ?? 200)));
    const offset = (page - 1) * limit;

    const [result, countResult] = await Promise.all([
      query(
        `SELECT id, created_at, crypto, candle_size, direction, spike_pct, threshold,
                yes_ask, no_ask, entry_price, reason, details,
                cycle_start_ms, context_candles
         FROM t1000_rejected
         WHERE created_at > NOW() - INTERVAL '30 days'
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query(
        `SELECT COUNT(*) AS total FROM t1000_rejected WHERE created_at > NOW() - INTERVAL '30 days'`
      ),
    ]);

    // Load pm_outcomes once for outcome enrichment
    let pmOutcomes = {};
    try {
      const pmPath = require('path').join(__dirname, '../../cache/pm_outcomes.json');
      pmOutcomes = JSON.parse(require('fs').readFileSync(pmPath, 'utf8'));
    } catch { /* pm_outcomes not yet populated */ }

    const total = parseInt(countResult.rows[0].total);
    const rows  = result.rows.map(r => {
      const durationSec   = r.candle_size >= 150 ? 900 : 300;
      // Use precise cycle_start_ms when available; fall back to created_at-derived estimate
      const cycleStartSec = r.cycle_start_ms
        ? Math.floor(r.cycle_start_ms / 1000)
        : Math.floor(new Date(r.created_at).getTime() / 1000 / durationSec) * durationSec;
      const outcome = pmOutcomes[`${r.crypto}_${cycleStartSec}_${durationSec}`] ?? null;
      return { ...r, cycleStartSec, outcome };
    });

    res.json({ rows, total, page, pages: Math.ceil(total / limit), limit });
  } catch (err) {
    logger.error('[api] GET /t1000/rejected error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /t1000/rejected — clear all rejected candidates */
app.delete('/t1000/rejected', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM t1000_rejected');
    res.json({ ok: true });
  } catch (err) {
    logger.error('[api] DELETE /t1000/rejected error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** POST /t1000/verify-outcomes — apply outcome corrections from verify_outcomes cron */
app.post('/t1000/verify-outcomes', authMiddleware, (req, res) => {
  try {
    const { corrections, source } = req.body;
    if (!Array.isArray(corrections) || !corrections.length)
      return res.status(400).json({ error: 'corrections array required' });
    logger.info('[api] POST /t1000/verify-outcomes', { count: corrections.length, source });
    const result = t1000Engine.applyOutcomeCorrections(corrections);
    res.json(result);
  } catch (err) {
    logger.error('[api] POST /t1000/verify-outcomes error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** POST /t1000/live-sell — manually exit a LIVE open position */
app.post('/t1000/live-sell', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ error: 'tradeId required' });
    const result = await t1000Engine.sellLivePosition(tradeId);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    logger.error('[api] POST /t1000/live-sell error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/chart-data?candle=60&crypto=BTC&limit=500
 *  Returns CXX-second OHLC candles rebucketed from the 1-min Binance cache.
 *  Candles are epoch-aligned (time = floor(t / CXX) * CXX).
 *  Candles that contain a spike-detection cycle_start are annotated with
 *  spike_pct from the t1000_candles_Cxx.csv log; all others have spike_pct=0.
 */
app.get('/t1000/chart-data', async (req, res) => {
  try {
    const candleSize = parseInt(req.query.candle || '60', 10);
    const crypto     = (req.query.crypto || 'BTC').toUpperCase();
    const limit      = Math.min(parseInt(req.query.limit || '500', 10), 500);

    if (!VALID_CRYPTOS.has(crypto)) return res.status(400).json({ error: `Invalid crypto. Must be one of: ${[...VALID_CRYPTOS].join(', ')}` });
    if (!VALID_CANDLES.has(candleSize)) {
      return res.status(400).json({ error: `Invalid candle size. Must be one of: ${[...VALID_CANDLES].join(', ')}` });
    }

    const fs   = require('fs');
    const path = require('path');

    // ── Load 1-min Binance cache ──────────────────────────────────────────
    const cachePath = path.join(__dirname, '../../cache', `candles-1m-${crypto}USDT-5000.json`);
    let cacheData  = { candles: [] };
    if (fs.existsSync(cachePath)) {
      cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    }
    let rawCandles = cacheData.candles || [];

    // ── Refresh from Binance if cache is stale (last candle > 5 min old) ─
    const lastTs = rawCandles.length
      ? new Date(rawCandles[rawCandles.length - 1].timestamp).getTime()
      : 0;
    if (Date.now() - lastTs > 5 * 60 * 1000) {
      try {
        const axios       = require('axios');
        const binanceAxios = axios.create({ timeout: 8000, proxy: false });
        const symbolMap   = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', XRP: 'XRPUSDT' };
        const kRes = await binanceAxios.get('https://api.binance.com/api/v3/klines', {
          params: { symbol: symbolMap[crypto], interval: '1m', limit: 1000 },
        });
        const newCandles = kRes.data.map(k => ({
          timestamp   : new Date(k[0]).toISOString(),
          open        : parseFloat(k[1]),
          high        : parseFloat(k[2]),
          low         : parseFloat(k[3]),
          close       : parseFloat(k[4]),
          volume      : parseFloat(k[5]),
          movementPct : Math.abs((parseFloat(k[4]) - parseFloat(k[1])) / parseFloat(k[1]) * 100),
        }));
        // Merge: deduplicate by timestamp, keep most recent 5000
        const byTs = new Map(rawCandles.map(c => [c.timestamp, c]));
        for (const c of newCandles) byTs.set(c.timestamp, c);
        rawCandles = [...byTs.values()].sort((a, b) => a.timestamp < b.timestamp ? -1 : 1).slice(-5000);
        cacheData.candles = rawCandles;
        fs.writeFileSync(cachePath, JSON.stringify(cacheData), 'utf8');
        logger.info(`[api] chart-data cache refreshed for ${crypto}: ${rawCandles.length} candles`);
      } catch (fetchErr) {
        logger.warn(`[api] chart-data Binance fetch failed, using stale cache`, { error: fetchErr.message });
      }
    }

    // ── Rebucket 1-min candles into CXX-second windows (cycle-aligned) ───
    // Buckets are aligned to 5m (CXX<150) or 15m (CXX>=150) cycle boundaries,
    // so each chart candle matches exactly what the trading engine saw.
    // Partial last buckets (< CXX seconds before cycle end) are discarded.
    const cycleSecs = candleSize >= 150 ? 900 : 300;
    const buckets = new Map(); // bucketTimeSec → { open, high, low, close }
    for (const c of rawCandles) {
      const tMs          = new Date(c.timestamp).getTime();
      const cycleStartMs = Math.floor(tMs / (cycleSecs * 1000)) * (cycleSecs * 1000);
      const offsetMs     = tMs - cycleStartMs;
      const bucketN      = Math.floor(offsetMs / (candleSize * 1000));
      // Skip partial bucket: would extend past cycle end
      if ((bucketN + 1) * candleSize > cycleSecs) continue;
      const bTime = Math.floor(cycleStartMs / 1000) + bucketN * candleSize;
      if (!buckets.has(bTime)) {
        buckets.set(bTime, { open: c.open, high: c.high, low: c.low, close: c.close });
      } else {
        const b = buckets.get(bTime);
        b.high  = Math.max(b.high, c.high);
        b.low   = Math.min(b.low, c.low);
        b.close = c.close; // last 1-min candle in bucket = bucket close
      }
    }

    // ── Sub-candle CSV override ───────────────────────────────────────────
    // The rebucketed 1-min klines can extend past the actual snapshot time.
    // Example: C80 bucket 0 contains the T+0 AND T+60 klines; the T+60 kline
    // closes at T+120s (40s after the C80 snapshot at T+80s), so the bucket
    // close/low/high can reflect price moves that happened after the snapshot.
    // Fix: override T+0 bucket OHLC with the accurate sub-candle CSV data.
    const spikePctByBucket = new Map();
    const csvPath = path.join(__dirname, '../../logs', `t1000_candles_C${candleSize}.csv`);
    if (fs.existsSync(csvPath)) {
      const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
      if (lines.length > 1) {
        const headers = lines[0].split(',');
        for (const line of lines.slice(1)) {
          const v = line.split(',');
          const r = Object.fromEntries(headers.map((h, i) => [h, v[i]]));
          if (r.crypto !== crypto || !r.cycle_start || !r.spike_pct) continue;
          const tMs          = new Date(r.cycle_start).getTime();
          const cycleStartMs = Math.floor(tMs / (cycleSecs * 1000)) * (cycleSecs * 1000);
          const bTime        = Math.floor(cycleStartMs / 1000); // bucketN=0 = cycle start
          spikePctByBucket.set(bTime, parseFloat(r.spike_pct));
          // Override T+0 bucket OHLC with actual sub-candle snapshot data
          if (buckets.has(bTime) && r.open && r.high && r.low && r.close) {
            const b = buckets.get(bTime);
            b.open  = parseFloat(r.open);
            b.high  = parseFloat(r.high);
            b.low   = parseFloat(r.low);
            b.close = parseFloat(r.close);
          }
        }
      }
    }

    // ── Build output: most recent `limit` candles ─────────────────────────
    const candles = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(-limit)
      .map(([bTime, ohlc]) => ({
        time      : bTime,
        open      : ohlc.open,
        high      : ohlc.high,
        low       : ohlc.low,
        close     : ohlc.close,
        spike_pct : spikePctByBucket.get(bTime) ?? 0,
      }));

    res.json({ candles, crypto, candle_size: candleSize });
  } catch (err) {
    logger.error('[api] GET /t1000/chart-data error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/validation — query spike_t1_validation table */
app.get('/t1000/validation', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit || '200', 10), 1000);
    const cryptoRaw = req.query.crypto ? req.query.crypto.toUpperCase() : null;
    const candleRaw = req.query.candle ? parseInt(req.query.candle, 10) : null;

    if (cryptoRaw && !VALID_CRYPTOS.has(cryptoRaw)) {
      return res.status(400).json({ error: `Invalid crypto. Must be one of: ${[...VALID_CRYPTOS].join(', ')}` });
    }
    if (candleRaw && !VALID_CANDLES.has(candleRaw)) {
      return res.status(400).json({ error: `Invalid candle size. Must be one of: ${[...VALID_CANDLES].join(', ')}` });
    }
    const crypto = cryptoRaw;
    const candle = candleRaw;

    const conditions = [];
    const params = [];
    if (crypto) { params.push(crypto); conditions.push(`crypto = $${params.length}`); }
    if (candle) { params.push(candle); conditions.push(`candle_size = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    params.push(limit);
    const rows = await query(
      `SELECT * FROM spike_t1_validation ${where} ORDER BY timestamp DESC LIMIT $${params.length}`,
      params
    );

    // Summary stats
    const statsRes = await query(`
      SELECT
        candle_size,
        COUNT(*) FILTER (WHERE outcome NOT IN ('SKIP_PRICE','SKIP_LIQUIDITY')) AS eligible,
        COUNT(*) FILTER (WHERE outcome = 'WIN')  AS wins,
        COUNT(*) FILTER (WHERE outcome = 'LOSS') AS losses,
        COUNT(*) FILTER (WHERE outcome = 'SKIP_PRICE')     AS skip_price,
        COUNT(*) FILTER (WHERE outcome = 'SKIP_LIQUIDITY') AS skip_liq,
        COUNT(*) FILTER (WHERE outcome = 'PENDING')        AS pending,
        ROUND(AVG(entry_price) FILTER (WHERE outcome IN ('WIN','LOSS')) * 100, 1) AS avg_entry_cents,
        ROUND(AVG(pnl_pct) FILTER (WHERE outcome = 'WIN'), 2)  AS avg_win_pct,
        ROUND(AVG(pnl_pct) FILTER (WHERE outcome = 'LOSS'), 2) AS avg_loss_pct
      FROM spike_t1_validation
      GROUP BY candle_size ORDER BY candle_size
    `);

    res.json({ rows: rows.rows, stats: statsRes.rows, total: rows.rowCount });
  } catch (err) {
    logger.error('[api] GET /t1000/validation error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/wallets — per-wallet summary (balance, W/L/PNL, CB state) */
app.get('/t1000/wallets', (req, res) => {
  try {
    const state = t1000Engine.getState();
    const liveWallets = state?.LIVE?.wallets ?? null;
    res.json({ wallets: liveWallets ?? [] });
  } catch (err) {
    logger.error('[api] GET /t1000/wallets error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/live-trades — paginated trade history from t1000_live_trades table */
app.get('/t1000/live-trades', async (req, res) => {
  try {
    const page       = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit      = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const strategyParam = req.query.strategy || 'LIVE';
    const strategies = strategyParam.split(',').map(s => s.trim()).filter(Boolean);
    const hideFailed = req.query.hideFailed === '1' || req.query.hideFailed === 'true';
    const walletFilter = req.query.wallet || null;
    const offset     = (page - 1) * limit;

    const whereParts  = [`strategy = ANY($1::text[])`];
    const whereParams = [strategies]; // $1 always = strategies
    let   nextParam   = 2;

    if (hideFailed)   whereParts.push(`status <> 'FAILED'`);
    if (walletFilter) {
      whereParts.push(`wallet_id = $${nextParam}`);
      whereParams.push(walletFilter);
      nextParam++;
    }
    const whereClause = 'WHERE ' + whereParts.join(' AND ');

    const countRes = await query(
      `SELECT COUNT(*) FROM t1000_live_trades ${whereClause}`,
      whereParams
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const tradesRes = await query(
      `SELECT trade_id, strategy, crypto, candle_size, direction, spike_pct,
              entry_price, signal_price, order_limit_price, position_usd, status, pnl_usd,
              cycle_start, redeemed, trade_time, context_candles, body_ratio, wallet_id, threshold,
              SUM(pnl_usd) OVER (PARTITION BY strategy ORDER BY trade_time ASC
                                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_pnl
       FROM t1000_live_trades
       ${whereClause}
       ORDER BY trade_time DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      [...whereParams, limit, offset]
    );

    res.json({ total, page, limit, pages: Math.ceil(total / limit), trades: tradesRes.rows });
  } catch (err) {
    logger.error('[api] GET /t1000/live-trades error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/** GET /t1000/signal-stats — scatter chart data for each crypto/candle pair */
app.get('/t1000/signal-stats', async (req, res) => {
  try {
    const pairsRaw = (req.query.pairs || '').split(',').filter(Boolean);
    let fromMs = req.query.from ? parseInt(req.query.from, 10) : null;
    let toMs   = req.query.to   ? parseInt(req.query.to,   10) : null;
    if (!fromMs || !toMs) { toMs = Date.now(); fromMs = toMs - 86400000; }
    fromMs = Math.max(fromMs, Date.now() - 90 * 86400000); // clamp to 90 days back
    toMs   = Math.min(toMs,   Date.now() + 3600000);       // clamp to 1h ahead
    const result = {};
    for (const pair of pairsRaw) {
      // pair format: "BTC:5m:0.29:0.05:0.89" (crypto:tf:threshold:minP:maxP)
      const parts = pair.split(':');
      const [crypto, tf] = parts;
      if (!crypto || !['5m','15m'].includes(tf)) continue;
      const is15m      = tf === '15m';
      const sizeClause = is15m ? 'candle_size >= 150' : 'candle_size < 150';
      const threshold  = parseFloat(parts[2]) || 0;
      const minP       = parseFloat(parts[3]) || 0;
      const maxP       = parseFloat(parts[4]) || 1;
      const key        = `${crypto}:${tf}`;

      const parseR = r => ({
        ts          : Number(r.ts),
        candle_size : r.candle_size ? parseInt(r.candle_size, 10) : null,
        spike_pct   : r.spike_pct   != null ? parseFloat(r.spike_pct)   : null,
        entry_price : r.entry_price != null ? parseFloat(r.entry_price) : null,
        body_ratio  : r.body_ratio  != null ? parseFloat(r.body_ratio)  : null,
        reason      : r.reason,
      });

      // Primary source: spike_t1_validation — logs every candle regardless of strategy
      // Reason is derived from spike size and market price vs threshold/minP/maxP
      const [raw, trades] = await Promise.all([
        query(`SELECT
                 EXTRACT(EPOCH FROM timestamp)*1000 AS ts,
                 candle_size,
                 spike_pct,
                 CASE WHEN spike_direction='UP' THEN t1_yes_ask ELSE t1_no_ask END AS entry_price,
                 NULL::numeric AS body_ratio,
                 CASE
                   WHEN outcome IN ('WIN','LOSS') THEN outcome
                   WHEN outcome = 'SKIP_PRICE'     THEN 'price_too_high'
                   WHEN outcome = 'SKIP_LIQUIDITY' THEN 'no_liquidity'
                   WHEN ABS(spike_pct) < $4        THEN 'below_threshold'
                   WHEN (CASE WHEN spike_direction='UP' THEN t1_yes_ask ELSE t1_no_ask END) < $5 THEN 'price_too_low'
                   WHEN (CASE WHEN spike_direction='UP' THEN t1_yes_ask ELSE t1_no_ask END) > $6 THEN 'price_too_high'
                   ELSE 'below_threshold'
                 END AS reason
               FROM spike_t1_validation
               WHERE crypto = $1 AND ${sizeClause}
                 AND timestamp BETWEEN to_timestamp($2::bigint/1000.0) AND to_timestamp($3::bigint/1000.0)
               ORDER BY timestamp`, [crypto, fromMs, toMs, threshold, minP, maxP]),
        // Actual live trades (green dots, may include body_ratio)
        query(`SELECT EXTRACT(EPOCH FROM trade_time)*1000 AS ts,
                      candle_size, spike_pct, entry_price, body_ratio, status AS reason
               FROM t1000_live_trades
               WHERE crypto = $1 AND ${sizeClause}
                 AND trade_time BETWEEN to_timestamp($2::bigint/1000.0) AND to_timestamp($3::bigint/1000.0)
               ORDER BY trade_time`, [crypto, fromMs, toMs]),
      ]);

      // Build trade lookup by (candle_size, 10s time bucket) — trades override raw dots
      const tradeMap = new Map();
      for (const t of trades.rows) {
        const bucket = Math.round(Number(t.ts) / 10000);
        tradeMap.set(`${t.candle_size}_${bucket}`, parseR(t));
      }
      const merged = [];
      for (const r of raw.rows) {
        const bucket = Math.round(Number(r.ts) / 10000);
        const trade  = tradeMap.get(`${r.candle_size}_${bucket}`);
        if (trade) { merged.push(trade); tradeMap.delete(`${r.candle_size}_${bucket}`); }
        else        { merged.push(parseR(r)); }
      }
      for (const t of tradeMap.values()) merged.push(t); // trades with no raw match
      result[key] = merged.sort((a, b) => a.ts - b.ts);
    }
    res.json(result);
  } catch (err) {
    logger.error('[api] GET /t1000/signal-stats error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * Build extra simulate_combined.js args that mirror the current LIVE engine config.
 * This ensures autoscan sweeps use the same t1Mode, minPrice, CB, and maxPositions
 * as the live engine — so the optimal Cxx/threshold found matches what the engine uses.
 */
function buildLiveAutoscanArgs() {
  const args = [];
  try {
    const live = t1000Engine.getState()['LIVE'] || {};
    if (live.t1Mode) args.push('-t1');
    const mn = Math.round((live.minPrice5m ?? 0.05) * 100);
    if (mn !== 5) args.push('-mn', String(mn));
    // CB intentionally excluded: period-sweep autoscan must not have CB active —
    // it reduces trades-per-period to noise levels and biases the candle-size ranking.
    const maxPos = live.maxPositions ?? 4;
    if (maxPos !== 4) args.push('-maxpos', String(maxPos));
    if (live.drawdownLimitEnabled && (live.drawdownLimitMaxLosses ?? 0) > 0
        && (live.drawdownLimitWindowMins ?? 0) > 0) {
      const dlP = (live.drawdownLimitPauseMins ?? 0) > 0 ? `,${live.drawdownLimitPauseMins}` : '';
      args.push('-dl', `${live.drawdownLimitMaxLosses},${live.drawdownLimitWindowMins}${dlP}`);
    }
  } catch { /* engine not yet ready — use simulator defaults */ }
  return args;
}

/** POST /t1000/run-autoscan — run simulate_combined.js -nf -as to refresh autoscan JSON */
app.post('/t1000/run-autoscan', authMiddleware, (req, res) => {
  const { execFile } = require('child_process');
  const scriptPath = require('path').join(__dirname, '../../scripts/simulate_combined.js');
  const args = ['--stack-size=65536', scriptPath, '-nf', '-as', ...buildLiveAutoscanArgs()];
  // Locked per-crypto thresholds — fix those in the trio sweep
  const { lockTh5m, lockTh15m } = req.body || {};
  if (lockTh5m && typeof lockTh5m === 'object' && Object.keys(lockTh5m).length)
    args.push('-lockth5m', Object.entries(lockTh5m).map(([c,v]) => `${c}:${v}`).join(','));
  if (lockTh15m && typeof lockTh15m === 'object' && Object.keys(lockTh15m).length)
    args.push('-lockth15m', Object.entries(lockTh15m).map(([c,v]) => `${c}:${v}`).join(','));
  execFile(process.execPath, args,
    { cwd: require('path').join(__dirname, '../../'), env: process.env, timeout: 120_000 },
    (err, stdout, stderr) => {
      if (err) {
        logger.error('[api] run-autoscan failed', { error: err.message });
        return res.status(500).json({ error: err.message });
      }
      logger.info('[api] run-autoscan complete');
      // Auto-apply best strategy from autoscan to LIVE state so backfill is never needed
      // just to fix a stale strategy after autoscan runs.
      try {
        const _fs          = require('fs');
        const _path        = require('path');
        const autoscanPath = _path.join(__dirname, '../../logs/autoscan_v2.json');
        const statePath    = _path.join(__dirname, '../../../logs/t1000-state.json');
        const scan = JSON.parse(_fs.readFileSync(autoscanPath, 'utf8'));
        const st   = JSON.parse(_fs.readFileSync(statePath, 'utf8'));
        const live = st['LIVE'] || {};
        let changed = false;
        if (scan.best5m  && scan.best5m.period  && live.strategy5m  !== scan.best5m.period)  { live.strategy5m  = scan.best5m.period;  changed = true; }
        if (scan.best15m && scan.best15m.period && live.strategy15m !== scan.best15m.period) { live.strategy15m = scan.best15m.period; changed = true; }
        if (changed) {
          st['LIVE'] = live;
          _fs.writeFileSync(statePath, JSON.stringify(st, null, 2));
          t1000Engine.loadState();
          logger.info('[api] run-autoscan: LIVE strategy auto-updated', { strategy5m: live.strategy5m, strategy15m: live.strategy15m });
        }
      } catch (syncErr) {
        logger.warn('[api] run-autoscan: strategy sync skipped (non-fatal)', { error: syncErr.message });
      }
      res.json({ ok: true });
    }
  );
});

const AUTOSCAN_7D_PATH = require('os').tmpdir() + '/autoscan_7d.json';

/** POST /t1000/run-autoscan-7d — run simulator with last 7d of data, write to temp file */
app.post('/t1000/run-autoscan-7d', authMiddleware, (req, res) => {
  const { execFile } = require('child_process');
  const scriptPath = require('path').join(__dirname, '../../scripts/simulate_combined.js');
  const dateFrom   = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 10);
  execFile(process.execPath, ['--stack-size=65536', scriptPath, '-nf', '-as', '-df', dateFrom, '-wr', AUTOSCAN_7D_PATH, ...buildLiveAutoscanArgs()],
    { cwd: require('path').join(__dirname, '../../'), env: process.env, timeout: 120_000 },
    (err) => {
      if (err) {
        logger.error('[api] run-autoscan-7d failed', { error: err.message });
        return res.status(500).json({ error: err.message });
      }
      logger.info('[api] run-autoscan-7d complete');
      res.json({ ok: true });
    }
  );
});

/** GET /t1000/deepscan — returns deepscan_v2.json */
app.get('/t1000/deepscan', (req, res) => {
  try {
    const data = JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '../../logs/deepscan_v2.json'), 'utf8'));
    res.json(data);
  } catch {
    res.status(404).json({ error: 'deepscan_v2.json not found — run Deep Scan first' });
  }
});

/** POST /t1000/run-deepscan — greedy forward selection of optimal filter settings */
app.post('/t1000/run-deepscan', authMiddleware, (req, res) => {
  const { execFile } = require('child_process');
  const scriptPath = require('path').join(__dirname, '../../scripts/simulate_combined.js');
  const ultra    = req.body?.ultra    === true;
  const extended = req.body?.extended === true;
  const thorough = req.body?.thorough === true;
  const fine     = req.body?.fine === true || thorough;
  const dsFlag   = ultra ? '-ds-ultra' : extended ? '-ds-ext' : thorough ? '-ds-thorough' : fine ? '-ds-fine' : '-ds';
  const args = ['--stack-size=65536', scriptPath, '-nf', dsFlag, ...buildLiveAutoscanArgs()];
  execFile(process.execPath, args,
    { cwd: require('path').join(__dirname, '../../'), env: process.env, timeout: ultra ? 3_600_000 : extended ? 1_800_000 : thorough ? 900_000 : fine ? 600_000 : 360_000 },
    (err) => {
      if (err) {
        logger.error('[api] run-deepscan failed', { error: err.message });
        return res.status(500).json({ error: err.message });
      }
      logger.info('[api] run-deepscan complete');
      try {
        const result = JSON.parse(require('fs').readFileSync(
          require('path').join(__dirname, '../../logs/deepscan_v2.json'), 'utf8'));
        res.json({ ok: true, result });
      } catch {
        res.json({ ok: true });
      }
    }
  );
});

/** GET /t1000/autoscan-7d — return last 7d autoscan results */
app.get('/t1000/autoscan-7d', (req, res) => {
  try {
    const data = JSON.parse(require('fs').readFileSync(AUTOSCAN_7D_PATH, 'utf8'));
    res.json(data);
  } catch {
    res.status(404).json({ error: '7d autoscan not yet run — click "Score 7d" in SETUP' });
  }
});


};
