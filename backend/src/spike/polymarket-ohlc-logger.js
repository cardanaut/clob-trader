'use strict';

/**
 * polymarket-ohlc-logger.js — Unified Market OHLC Logger
 *
 * Collects three streams of price data into separate DB tables:
 *
 *  1. polymarket_price_ohlc  — Polymarket UP/DOWN ask+bid per minute (5-min cycles)
 *     Source: clob-websocket price callbacks
 *
 *  2. binance_minute_ohlc    — Binance crypto 1-min OHLC (aligned to 5-min cycles)
 *     Source: onBinanceCandle(candle) called from engine.js on each closed candle
 *
 *  3. kalshi_price_ohlc      — Kalshi YES/NO ask+bid per minute (15-min cycles)
 *     Source: kalshi-websocket price callbacks (active once credentials configured)
 *
 * All three tables share spike_detected flag so you can JOIN on (crypto, cycle_start)
 * to reconstruct the full picture of any spike event: crypto price + PM prices + Kalshi prices.
 */

const clobWebsocket   = require('./clob-websocket');
const kalshiWebsocket = require('./kalshi-websocket');
const { query }       = require('../database/connection');
const logger          = require('../utils/logger');

// In-memory OHLC buckets: key = `${crypto}:${outcome}:${cycleStartMs}:${minute}`
const buckets = new Map();

// Set of `${crypto}:${cycleStartMs}` where a spike signal was detected this cycle
const spikeMarkers = new Set();

// ── Time helpers ───────────────────────────────────────────────────────────────
function getCycleStart(now = new Date()) {
  const FIVE_MIN = 5 * 60 * 1000;
  return new Date(Math.floor(now.getTime() / FIVE_MIN) * FIVE_MIN);
}

function getMinuteInCycle(now = new Date()) {
  const FIVE_MIN = 5 * 60 * 1000;
  return Math.floor((now.getTime() % FIVE_MIN) / 60000);
}

// ── Bucket management ──────────────────────────────────────────────────────────
function bucketKey(crypto, outcome, cycleStartMs, minute) {
  return `${crypto}:${outcome}:${cycleStartMs}:${minute}`;
}

function updateBucket(crypto, outcome, ask, bid) {
  const now        = new Date();
  const cycleStart = getCycleStart(now);
  const minute     = getMinuteInCycle(now);
  const key        = bucketKey(crypto, outcome, cycleStart.getTime(), minute);

  if (!buckets.has(key)) {
    buckets.set(key, {
      crypto,
      outcome:      outcome.toUpperCase(),
      cycleStart,
      minute,
      ask_open:  ask,  ask_high: ask,  ask_low: ask,  ask_close: ask,
      bid_open:  bid,  bid_high: bid,  bid_low:  bid,  bid_close: bid,
      ticks: 1
    });
  } else {
    const b = buckets.get(key);

    // Ask OHLC
    if (ask !== null && !isNaN(ask)) {
      b.ask_high  = Math.max(b.ask_high, ask);
      b.ask_low   = Math.min(b.ask_low,  ask);
      b.ask_close = ask;
    }

    // Bid OHLC — bid can be null if not provided
    if (bid !== null && !isNaN(bid)) {
      if (b.bid_open === null)  b.bid_open  = bid;
      b.bid_high  = b.bid_high !== null ? Math.max(b.bid_high, bid) : bid;
      b.bid_low   = b.bid_low  !== null ? Math.min(b.bid_low,  bid) : bid;
      b.bid_close = bid;
    }

    b.ticks++;
  }
}

// ── DB flush ───────────────────────────────────────────────────────────────────
async function flushCompletedBuckets() {
  const now        = new Date();
  const curStart   = getCycleStart(now).getTime();
  const curMinute  = getMinuteInCycle(now);

  const toFlush = [];
  for (const [key, b] of buckets) {
    const bMs = b.cycleStart.getTime();
    // Flush if it belongs to a previous cycle, or a previous minute in the current cycle
    if (bMs < curStart || (bMs === curStart && b.minute < curMinute)) {
      toFlush.push([key, b]);
    }
  }

  if (!toFlush.length) return;

  for (const [key, b] of toFlush) {
    const spikeKey    = `${b.crypto}:${b.cycleStart.getTime()}`;
    const spikeDetect = spikeMarkers.has(spikeKey);

    try {
      await query(`
        INSERT INTO polymarket_price_ohlc
          (crypto, outcome, cycle_start, minute_in_cycle,
           ask_open, ask_high, ask_low, ask_close,
           bid_open, bid_high, bid_low, bid_close,
           tick_count, spike_detected)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (crypto, outcome, cycle_start, minute_in_cycle) DO UPDATE SET
          ask_high      = GREATEST(polymarket_price_ohlc.ask_high, EXCLUDED.ask_high),
          ask_low       = LEAST(polymarket_price_ohlc.ask_low,  EXCLUDED.ask_low),
          ask_close     = EXCLUDED.ask_close,
          bid_high      = GREATEST(polymarket_price_ohlc.bid_high, EXCLUDED.bid_high),
          bid_low       = LEAST(polymarket_price_ohlc.bid_low,  EXCLUDED.bid_low),
          bid_close     = EXCLUDED.bid_close,
          tick_count    = polymarket_price_ohlc.tick_count + EXCLUDED.tick_count,
          spike_detected = polymarket_price_ohlc.spike_detected OR EXCLUDED.spike_detected
      `, [
        b.crypto, b.outcome, b.cycleStart.toISOString(), b.minute,
        b.ask_open, b.ask_high, b.ask_low, b.ask_close,
        b.bid_open, b.bid_high, b.bid_low, b.bid_close,
        b.ticks, spikeDetect
      ]);
    } catch (err) {
      logger.error('[ohlc-logger] DB write failed', { error: err.message, key });
    }

    buckets.delete(key);
  }

  // Clean up stale spike markers (older than 15 minutes)
  const cutoff = curStart - 15 * 60 * 1000;
  for (const k of spikeMarkers) {
    const ts = parseInt(k.split(':')[1], 10);
    if (ts < cutoff) spikeMarkers.delete(k);
  }
}

// ── Kalshi OHLC (15-min cycles, minute_in_cycle 0–14) ─────────────────────────
const FIFTEEN_MIN    = 15 * 60 * 1000;
const kalshiBuckets  = new Map();
const kalshiSpikes   = new Set();

function getKalshiCycleStart(now = new Date()) {
  return new Date(Math.floor(now.getTime() / FIFTEEN_MIN) * FIFTEEN_MIN);
}

function getKalshiMinute(now = new Date()) {
  return Math.floor((now.getTime() % FIFTEEN_MIN) / 60000);
}

function updateKalshiBucket(crypto, outcome, ask, bid) {
  const now        = new Date();
  const cycleStart = getKalshiCycleStart(now);
  const minute     = getKalshiMinute(now);
  const key        = `${crypto}:${outcome}:${cycleStart.getTime()}:${minute}`;

  if (!kalshiBuckets.has(key)) {
    kalshiBuckets.set(key, {
      crypto, outcome, cycleStart, minute,
      ask_open: ask, ask_high: ask, ask_low: ask, ask_close: ask,
      bid_open: bid, bid_high: bid, bid_low: bid, bid_close: bid,
      ticks: 1
    });
  } else {
    const b = kalshiBuckets.get(key);
    if (ask !== null && !isNaN(ask)) {
      b.ask_high  = Math.max(b.ask_high, ask);
      b.ask_low   = Math.min(b.ask_low,  ask);
      b.ask_close = ask;
    }
    if (bid !== null && !isNaN(bid)) {
      if (b.bid_open === null) b.bid_open = bid;
      b.bid_high  = b.bid_high !== null ? Math.max(b.bid_high, bid) : bid;
      b.bid_low   = b.bid_low  !== null ? Math.min(b.bid_low,  bid) : bid;
      b.bid_close = bid;
    }
    b.ticks++;
  }
}

async function flushKalshiBuckets() {
  const now      = new Date();
  const curStart = getKalshiCycleStart(now).getTime();
  const curMin   = getKalshiMinute(now);

  for (const [key, b] of kalshiBuckets) {
    const bMs = b.cycleStart.getTime();
    if (bMs < curStart || (bMs === curStart && b.minute < curMin)) {
      const spike = kalshiSpikes.has(`${b.crypto}:${bMs}`);
      try {
        await query(`
          INSERT INTO kalshi_price_ohlc
            (crypto, outcome, cycle_start, minute_in_cycle,
             ask_open, ask_high, ask_low, ask_close,
             bid_open, bid_high, bid_low, bid_close,
             tick_count, spike_detected)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (crypto, outcome, cycle_start, minute_in_cycle) DO UPDATE SET
            ask_high     = GREATEST(kalshi_price_ohlc.ask_high, EXCLUDED.ask_high),
            ask_low      = LEAST(kalshi_price_ohlc.ask_low,  EXCLUDED.ask_low),
            ask_close    = EXCLUDED.ask_close,
            bid_high     = GREATEST(kalshi_price_ohlc.bid_high, EXCLUDED.bid_high),
            bid_low      = LEAST(kalshi_price_ohlc.bid_low,  EXCLUDED.bid_low),
            bid_close    = EXCLUDED.bid_close,
            tick_count   = kalshi_price_ohlc.tick_count + EXCLUDED.tick_count,
            spike_detected = kalshi_price_ohlc.spike_detected OR EXCLUDED.spike_detected
        `, [
          b.crypto, b.outcome, b.cycleStart.toISOString(), b.minute,
          b.ask_open, b.ask_high, b.ask_low, b.ask_close,
          b.bid_open, b.bid_high, b.bid_low, b.bid_close,
          b.ticks, spike
        ]);
      } catch (err) {
        logger.error('[ohlc-logger] Kalshi DB write failed', { error: err.message, key });
      }
      kalshiBuckets.delete(key);
    }
  }

  // Clean up old spike markers
  const cutoff = curStart - 30 * 60 * 1000;
  for (const k of kalshiSpikes) {
    if (parseInt(k.split(':')[1], 10) < cutoff) kalshiSpikes.delete(k);
  }
}

// ── Binance OHLC ──────────────────────────────────────────────────────────────
async function onBinanceCandle(candle) {
  if (!candle.isClosed) return;

  const ts         = candle.timestamp instanceof Date ? candle.timestamp : new Date(candle.timestamp);
  const cycleStart = getCycleStart(ts);
  const minute     = getMinuteInCycle(ts);
  const spike      = spikeMarkers.has(`${candle.crypto_symbol}:${cycleStart.getTime()}`);

  try {
    await query(`
      INSERT INTO binance_minute_ohlc
        (crypto, candle_open_time, open, high, low, close, volume,
         cycle_start, minute_in_cycle, spike_detected)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (crypto, candle_open_time) DO UPDATE SET
        spike_detected = binance_minute_ohlc.spike_detected OR EXCLUDED.spike_detected
    `, [
      candle.crypto_symbol, ts.toISOString(),
      candle.open, candle.high, candle.low, candle.close, candle.volume ?? null,
      cycleStart.toISOString(), minute, spike
    ]);
  } catch (err) {
    logger.error('[ohlc-logger] Binance candle write failed', { error: err.message, crypto: candle.crypto_symbol });
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Tag the current Polymarket cycle (5-min) as spike_detected for a crypto. */
function markSpike(crypto) {
  const key        = `${crypto}:${getCycleStart().getTime()}`;
  spikeMarkers.add(key);

  const cycleStart = getCycleStart().toISOString();
  query(
    `UPDATE polymarket_price_ohlc SET spike_detected = true WHERE crypto = $1 AND cycle_start = $2`,
    [crypto, cycleStart]
  ).catch(err => logger.error('[ohlc-logger] markSpike PM update failed', { error: err.message }));

  // Also mark binance_minute_ohlc for this cycle
  query(
    `UPDATE binance_minute_ohlc SET spike_detected = true WHERE crypto = $1 AND cycle_start = $2`,
    [crypto, cycleStart]
  ).catch(() => {});
}

let flushTimer = null;

function start() {
  // Polymarket: real-time price callbacks
  clobWebsocket.registerPriceCallback((crypto, outcome, ask, bid) => {
    try { updateBucket(crypto, outcome, ask, bid); } catch (_) {}
  });

  // Kalshi: real-time price callbacks (no-op if not connected)
  kalshiWebsocket.registerPriceCallback((crypto, outcome, ask, bid) => {
    try { updateKalshiBucket(crypto, outcome, ask, bid); } catch (_) {}
  });

  // Flush all completed minute-buckets every 30 seconds
  flushTimer = setInterval(() => {
    flushCompletedBuckets().catch(() => {});
    flushKalshiBuckets().catch(() => {});
  }, 30 * 1000);

  logger.info('[ohlc-logger] Unified OHLC logger started — Polymarket (5-min) + Binance (1-min) + Kalshi (15-min)');
}

function stop() {
  if (flushTimer) clearInterval(flushTimer);
}

module.exports = { start, stop, markSpike, onBinanceCandle };
