'use strict';

/**
 * T1000 Sub-Minute Candle Generator
 *
 * Connects to Binance aggTrade WebSocket streams for BTC/ETH/SOL/XRP.
 *
 * 5-MIN cycle  (300s): snapshots at C65/C70/C75/C80/C82/C85/C90/C95
 * 15-MIN cycle (900s): snapshots at C150/C157/C165/C172/C180/C195/C210/C225
 *
 * At each candle close:
 *   - Snapshots OHLC + spike% + current Polymarket CLOB ask/bid prices
 *   - Appends a row to the corresponding CSV log file
 *   - Emits 'candle' events to the T1000 engine
 *   - Emits 'cycleEnd' event at cycle end with (cycleStart, finalPrices, cycleMs)
 */

const WebSocket = require('ws');
const fs        = require('fs');
const path      = require('path');
const logger    = require('../utils/logger');

const CRYPTOS          = ['BTC', 'ETH', 'SOL', 'XRP'];
const PAIRS            = { BTC: 'btcusdt', ETH: 'ethusdt', SOL: 'solusdt', XRP: 'xrpusdt' };
const CANDLE_SIZES_5M  = [65, 70, 75, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 95];
const CANDLE_SIZES_15M = [150, 157, 159, 161, 163, 165, 167, 169, 171, 173, 175, 180, 195, 210, 225];
const CYCLE_5M         = 5  * 60 * 1000;
const CYCLE_15M        = 15 * 60 * 1000;
const LOG_DIR          = path.join(__dirname, '../../logs');
const CSV_HEADER       = 'timestamp,crypto,cycle_start,candle_size,open,high,low,close,spike_pct,yes_ask,no_ask,yes_bid,no_bid\n';

// Aliases kept for any external code that imports these
const CANDLE_SIZES = CANDLE_SIZES_5M;
const CYCLE_MS     = CYCLE_5M;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCycleStart5m(ms = Date.now()) {
  return Math.floor(ms / CYCLE_5M) * CYCLE_5M;
}

function getCycleStart15m(ms = Date.now()) {
  return Math.floor(ms / CYCLE_15M) * CYCLE_15M;
}

const getCycleStart = getCycleStart5m; // backward-compat alias

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getCsvPath(size) {
  return path.join(LOG_DIR, `t1000_candles_C${size}.csv`);
}

function ensureCsvHeaders() {
  for (const size of [...CANDLE_SIZES_5M, ...CANDLE_SIZES_15M]) {
    const p = getCsvPath(size);
    if (!fs.existsSync(p)) fs.writeFileSync(p, CSV_HEADER);
  }
}

function appendCsvRow(size, candle) {
  const ya = candle.yes_ask != null ? (candle.yes_ask * 100).toFixed(0) : '';
  const na = candle.no_ask  != null ? (candle.no_ask  * 100).toFixed(0) : '';
  const yb = candle.yes_bid != null ? (candle.yes_bid * 100).toFixed(0) : '';
  const nb = candle.no_bid  != null ? (candle.no_bid  * 100).toFixed(0) : '';
  const row = [
    candle.timestamp.toISOString(),
    candle.crypto,
    candle.cycle_start.toISOString(),
    size,
    candle.open.toFixed(8),
    candle.high.toFixed(8),
    candle.low.toFixed(8),
    candle.close.toFixed(8),
    candle.spike_pct.toFixed(4),
    ya, na, yb, nb,
  ].join(',') + '\n';
  try { fs.appendFileSync(getCsvPath(size), row); } catch {}
}

// ── State ──────────────────────────────────────────────────────────────────────

// 5-min OHLC accumulators
const ohlc     = {};
const refPrice = {};

// 15-min OHLC accumulators
const ohlc15m     = {};
const refPrice15m = {};

// Volume tracking for vol_ratio field in candle events
// 5m candles → 1-min Binance vol basis  (spike ≈ 65–95s ≈ 1 min)
// 15m candles → 3-min Binance vol basis (spike ≈ 150–225s ≈ 3 min)
const VOL_BUF_MAX  = 16;
const VOL_3M_MS    = 3 * 60_000;

const vol1m    = {}; // 1-min accumulator: { minuteStart: null|ms, volume: 0 }
const volBuf   = {}; // ring buffer of last 16 closed 1-min volumes
const vol3m    = {}; // 3-min accumulator: { threeMinStart: null|ms, volume: 0 }
const volBuf3m = {}; // ring buffer of last 16 closed 3-min volumes

// Pre-spike exhaustion: ring buffer of last 16 1-min candle OPEN prices.
// Used to compute the 5-min net move before the cycle start (yoyo/exhaustion filter).
const price1m  = {}; // 1-min accumulator: { minuteStart: null|ms, openPrice: null }
const priceBuf = {}; // ring buffer of last 16 1-min open prices

for (const c of CRYPTOS) {
  ohlc[c]        = { cycleStart: null, open: null, high: null, low: null, close: null, trades: 0 };
  refPrice[c]    = null;
  ohlc15m[c]     = { cycleStart: null, open: null, high: null, low: null, close: null, trades: 0 };
  refPrice15m[c] = null;
  vol1m[c]       = { minuteStart:    null, volume: 0 };
  volBuf[c]      = [];
  vol3m[c]       = { threeMinStart:  null, volume: 0 };
  volBuf3m[c]    = [];
  price1m[c]     = { minuteStart: null, openPrice: null };
  priceBuf[c]    = [];
}

// Health timestamps (read by /health endpoint)
let lastBinanceTickTs = null;  // ms — last trade received from Binance
let lastCycleStartTs  = null;  // ms — last time a 5m cycle was started

// Callbacks
const candleCallbacks   = [];
const cycleEndCallbacks = [];

function onCandle(fn)   { candleCallbacks.push(fn); }
function onCycleEnd(fn) { cycleEndCallbacks.push(fn); }

// Injected getters for Polymarket CLOB prices: () => { BTC: {up, down, up_bid, down_bid}, ... }
// clobGetter    → 5-min markets (used by C50–C85 snapshots)
// clobGetter15m → 15-min markets (used by C150–C255 snapshots)
let clobGetter    = null;
let clobGetter15m = null;

// Injected connection state checkers: () => boolean
let clobIsConnected    = null;
let clobIsConnected15m = null;

// Wait up to maxWaitMs for the CLOB WebSocket to reconnect, polling every 200ms.
// Used when a candle fires during a reconnect window to avoid trading on stale prices.
async function waitForClobConnection(isConnectedFn, label, maxWaitMs = 5000) {
  if (!isConnectedFn || isConnectedFn()) return; // already connected or no checker
  logger.warn(`[t1000-gen] ${label} CLOB WebSocket not connected — waiting up to ${maxWaitMs / 1000}s...`);
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
    if (isConnectedFn()) {
      // Give 1s for the book snapshot to arrive after reconnect
      await new Promise(r => setTimeout(r, 1000));
      logger.info(`[t1000-gen] ${label} CLOB WebSocket reconnected — proceeding with fresh prices`);
      return;
    }
  }
  logger.warn(`[t1000-gen] ${label} CLOB WebSocket still not connected after ${maxWaitMs / 1000}s — using last known prices`);
}

// Separate timeout maps for each cycle length
let candleTimeouts5m  = {};
let candleTimeouts15m = {};
let cycleTimeout5m    = null;
let cycleTimeout15m   = null;

// WebSocket
let ws             = null;
let reconnectTimer = null;
let stopped        = false;
let hasConnected   = false; // tracks whether initial connect has happened

const reconnectCallbacks = [];
function onReconnect(fn) { reconnectCallbacks.push(fn); }

// ── Candle snapshot (shared builder) ──────────────────────────────────────────

function buildCandle(crypto, size, cycleStart, ohlcMap, refPriceMap, getter) {
  const s = ohlcMap[crypto];
  if (!s || s.open === null) return null;

  const spikePct = (s.close - s.open) / s.open * 100;

  let prices = {};
  try { if (getter) prices = getter()[crypto] || {}; } catch {}

  // Vol ratio: spikeCandleVol / avg(prev 14 candle vols).
  // 5m candles use 1-min vol basis (~15 min warm-up needed).
  // 15m candles use 3-min vol basis (~45 min warm-up needed).
  // null = not enough history yet → engine allows trade.
  const is15mCandle = size >= 150;
  const buf = is15mCandle ? volBuf3m[crypto] : volBuf[crypto];
  let vol_ratio = null;
  if (buf && buf.length >= 15) {
    const spikeVol = buf[buf.length - 1];
    let sum = 0;
    for (let i = buf.length - 15; i < buf.length - 1; i++) sum += buf[i];
    const avg14 = sum / 14;
    if (avg14 > 0) vol_ratio = parseFloat((spikeVol / avg14).toFixed(3));
  }

  // Pre-spike exhaustion: net % move in the 5 minutes BEFORE cycle start.
  // priceBuf[crypto][last]   = open of 1-min candle opening at cycleStart
  // priceBuf[crypto][last-5] = open of 1-min candle 5 min before cycleStart
  // Positive = price rose before cycle; negative = fell.
  // null = not enough history yet (~6 min warm-up after restart).
  let pre5m_move = null;
  const pb = priceBuf[crypto];
  if (pb && pb.length >= 6) {
    const pNow   = pb[pb.length - 1]; // open at cycleStart
    const p5mAgo = pb[pb.length - 6]; // open 5 min before cycleStart
    if (pNow && p5mAgo) pre5m_move = parseFloat(((pNow - p5mAgo) / p5mAgo * 100).toFixed(4));
  }

  return {
    timestamp   : new Date(cycleStart + size * 1000),
    crypto,
    cycle_start : new Date(cycleStart),
    candle_size : size,
    open        : s.open,
    high        : s.high,
    low         : s.low,
    close       : s.close,
    spike_pct   : spikePct,
    direction   : spikePct >= 0 ? 'UP' : 'DOWN',
    yes_ask     : prices.up       ?? null,
    no_ask      : prices.down     ?? null,
    yes_bid     : prices.up_bid   ?? null,
    no_bid      : prices.down_bid ?? null,
    ref_price   : refPriceMap[crypto],
    vol_ratio,
    pre5m_move,
  };
}

function emitCandle(candle, label) {
  appendCsvRow(candle.candle_size, candle);
  logger.debug(`[t1000-gen] C${candle.candle_size} ${candle.crypto} spike=${candle.spike_pct.toFixed(3)}% close=${candle.close.toFixed(4)}`);
  for (const fn of candleCallbacks) {
    try { fn(candle); } catch (e) {
      logger.warn(`[t1000-gen] ${label} callback error`, { error: e.message });
    }
  }
}

async function snapshotCandle(crypto, size, cycleStart) {
  await waitForClobConnection(clobIsConnected, `C${size} ${crypto} 5m`);
  const candle = buildCandle(crypto, size, cycleStart, ohlc, refPrice, clobGetter);
  if (candle) emitCandle(candle, '5m candle');
}

async function snapshotCandle15m(crypto, size, cycleStart) {
  await waitForClobConnection(clobIsConnected15m, `C${size} ${crypto} 15m`);
  const candle = buildCandle(crypto, size, cycleStart, ohlc15m, refPrice15m, clobGetter15m || clobGetter);
  if (candle) emitCandle(candle, '15m candle');
}

// ── Cycle management — 5-min ───────────────────────────────────────────────────

function startCycle() {
  if (stopped) return;
  lastCycleStartTs = Date.now();

  const now        = Date.now();
  const cycleStart = getCycleStart5m(now);

  // On reconnect mid-cycle: preserve existing OHLC and refPrice so finalPrice is not null at cycle end.
  // Only reset OHLC when a genuinely new cycle starts.
  let isResume = false;
  for (const c of CRYPTOS) {
    if (ohlc[c].cycleStart === cycleStart) {
      isResume = true; // same cycle — keep accumulated data
    } else {
      ohlc[c]     = { cycleStart, open: null, high: null, low: null, close: null, trades: 0 };
      refPrice[c] = null;
    }
  }

  for (const t of Object.values(candleTimeouts5m)) clearTimeout(t);
  candleTimeouts5m = {};

  if (isResume) {
    logger.info('[t1000-gen] Binance reconnected — resuming 5m cycle', {
      cycle: new Date(cycleStart).toISOString().substring(11, 16)
    });
  } else {
    logger.info('[t1000-gen] 5m cycle started', {
      cycle: new Date(cycleStart).toISOString().substring(11, 16)
    });
  }

  for (const size of CANDLE_SIZES_5M) {
    const delay = cycleStart + size * 1000 - now;
    if (delay <= 0) continue;
    candleTimeouts5m[`C${size}`] = setTimeout(() => {
      for (const c of CRYPTOS) snapshotCandle(c, size, cycleStart);
    }, delay);
  }

  const endDelay = cycleStart + CYCLE_5M - now;
  if (endDelay > 0) {
    candleTimeouts5m['cycleEnd'] = setTimeout(() => {
      const finalPrices = {};
      for (const c of CRYPTOS) finalPrices[c] = ohlc[c].close;
      for (const fn of cycleEndCallbacks) {
        try { fn(cycleStart, finalPrices, CYCLE_5M); } catch (e) {
          logger.warn('[t1000-gen] CycleEnd5m callback error', { error: e.message });
        }
      }
    }, endDelay - 100);
  }

  if (cycleTimeout5m) clearTimeout(cycleTimeout5m);
  cycleTimeout5m = setTimeout(() => startCycle(), cycleStart + CYCLE_5M - now);
}

// ── Cycle management — 15-min ──────────────────────────────────────────────────

function startCycle15m() {
  if (stopped) return;

  const now        = Date.now();
  const cycleStart = getCycleStart15m(now);

  // Preserve OHLC on mid-cycle reconnect (same as 5m logic)
  let isResume15m = false;
  for (const c of CRYPTOS) {
    if (ohlc15m[c].cycleStart === cycleStart) {
      isResume15m = true;
    } else {
      ohlc15m[c]     = { cycleStart, open: null, high: null, low: null, close: null, trades: 0 };
      refPrice15m[c] = null;
    }
  }

  for (const t of Object.values(candleTimeouts15m)) clearTimeout(t);
  candleTimeouts15m = {};

  if (isResume15m) {
    logger.info('[t1000-gen] Binance reconnected — resuming 15m cycle', {
      cycle: new Date(cycleStart).toISOString().substring(11, 16)
    });
  } else {
    logger.info('[t1000-gen] 15m cycle started', {
      cycle: new Date(cycleStart).toISOString().substring(11, 16)
    });
  }

  for (const size of CANDLE_SIZES_15M) {
    const delay = cycleStart + size * 1000 - now;
    if (delay <= 0) continue;
    candleTimeouts15m[`C${size}`] = setTimeout(() => {
      for (const c of CRYPTOS) snapshotCandle15m(c, size, cycleStart);
    }, delay);
  }

  const endDelay = cycleStart + CYCLE_15M - now;
  if (endDelay > 0) {
    candleTimeouts15m['cycleEnd'] = setTimeout(() => {
      const finalPrices = {};
      for (const c of CRYPTOS) finalPrices[c] = ohlc15m[c].close;
      for (const fn of cycleEndCallbacks) {
        try { fn(cycleStart, finalPrices, CYCLE_15M); } catch (e) {
          logger.warn('[t1000-gen] CycleEnd15m callback error', { error: e.message });
        }
      }
    }, endDelay - 100);
  }

  if (cycleTimeout15m) clearTimeout(cycleTimeout15m);
  cycleTimeout15m = setTimeout(() => startCycle15m(), cycleStart + CYCLE_15M - now);
}

// ── Tick processing ────────────────────────────────────────────────────────────

function processTick(crypto, price, tradeTimestampMs, quantity = 0) {
  lastBinanceTickTs = Date.now();

  // ── 1-min volume + open-price tracking (for vol_ratio and pre5m_move) ──
  const minStart = Math.floor(tradeTimestampMs / 60_000) * 60_000;
  const v = vol1m[crypto];
  if (v.minuteStart !== null && minStart !== v.minuteStart) {
    // 1-min candle closed: push volume and open price to their ring buffers
    const buf = volBuf[crypto];
    buf.push(v.volume);
    if (buf.length > VOL_BUF_MAX) buf.shift();
    v.volume = 0;

    const pb = priceBuf[crypto];
    const p  = price1m[crypto];
    if (p.openPrice !== null) {
      pb.push(p.openPrice);
      if (pb.length > VOL_BUF_MAX) pb.shift();
    }
    p.openPrice = null;
  }
  if (v.minuteStart === null || minStart !== v.minuteStart) v.minuteStart = minStart;
  v.volume += quantity;

  // Track open price of current 1-min candle (first trade = open)
  const p1 = price1m[crypto];
  if (p1.minuteStart === null || minStart !== p1.minuteStart) {
    p1.minuteStart = minStart;
    p1.openPrice   = price; // first trade of this minute
  }

  // ── 3-min volume tracking (for 15m vol_ratio — spike ≈ 150–225s ≈ 3 min) ──
  const threeMinStart = Math.floor(tradeTimestampMs / VOL_3M_MS) * VOL_3M_MS;
  const v3 = vol3m[crypto];
  if (v3.threeMinStart !== null && threeMinStart !== v3.threeMinStart) {
    const buf3 = volBuf3m[crypto];
    buf3.push(v3.volume);
    if (buf3.length > VOL_BUF_MAX) buf3.shift();
    v3.volume = 0;
  }
  if (v3.threeMinStart === null || threeMinStart !== v3.threeMinStart) v3.threeMinStart = threeMinStart;
  v3.volume += quantity;

  // ── 5-min OHLC ──
  const s = ohlc[crypto];
  if (s) {
    const tickCycle = getCycleStart5m(tradeTimestampMs);
    if (s.cycleStart === null || tickCycle === s.cycleStart) {
      if (s.cycleStart === null) s.cycleStart = tickCycle;
      if (s.open === null) {
        s.open = price; s.high = price; s.low = price;
        refPrice[crypto] = price;
      } else {
        if (price > s.high) s.high = price;
        if (price < s.low)  s.low  = price;
      }
      s.close = price;
      s.trades++;
    }
  }

  // ── 15-min OHLC ──
  const s15 = ohlc15m[crypto];
  if (s15) {
    const tickCycle15m = getCycleStart15m(tradeTimestampMs);
    if (s15.cycleStart === null || tickCycle15m === s15.cycleStart) {
      if (s15.cycleStart === null) s15.cycleStart = tickCycle15m;
      if (s15.open === null) {
        s15.open = price; s15.high = price; s15.low = price;
        refPrice15m[crypto] = price;
      } else {
        if (price > s15.high) s15.high = price;
        if (price < s15.low)  s15.low  = price;
      }
      s15.close = price;
      s15.trades++;
    }
  }
}

// ── Binance Combined WebSocket ─────────────────────────────────────────────────

function connect() {
  if (stopped) return;

  const streams = CRYPTOS.map(c => `${PAIRS[c]}@aggTrade`).join('/');
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

  logger.info('[t1000-gen] Connecting to Binance trade stream...');

  ws = new WebSocket(url);

  ws.on('open', () => {
    logger.info('[t1000-gen] Binance connected');
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    const isReconnect = hasConnected;
    hasConnected = true;
    startCycle();
    startCycle15m();
    if (isReconnect) {
      // Fire reconnect callbacks so engine can immediately check for stuck OPEN trades
      for (const fn of reconnectCallbacks) {
        try { fn(); } catch (e) { logger.warn('[t1000-gen] onReconnect callback error', { error: e.message }); }
      }
    }
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (!msg.data || msg.data.e !== 'aggTrade') return;
      const trade  = msg.data;
      const symbol = trade.s;
      const crypto = symbol.replace('USDT', '');
      if (!CRYPTOS.includes(crypto)) return;
      processTick(crypto, parseFloat(trade.p), trade.T, parseFloat(trade.q) || 0);
    } catch {}
  });

  ws.on('close', () => {
    logger.warn('[t1000-gen] Binance disconnected');
    if (!stopped) scheduleReconnect();
  });

  ws.on('error', (err) => {
    logger.warn('[t1000-gen] Binance error', { error: err.message });
  });
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}

// ── Public API ─────────────────────────────────────────────────────────────────

function start(clobGetterFn, clobGetter15mFn, clobIsConnectedFn, clobIsConnected15mFn) {
  stopped           = false;
  clobGetter        = clobGetterFn         || null;
  clobGetter15m     = clobGetter15mFn      || null;
  clobIsConnected   = clobIsConnectedFn    || null;
  clobIsConnected15m = clobIsConnected15mFn || null;
  ensureLogDir();
  ensureCsvHeaders();
  connect();
}

function stop() {
  stopped = true;
  for (const t of Object.values(candleTimeouts5m))  clearTimeout(t);
  for (const t of Object.values(candleTimeouts15m)) clearTimeout(t);
  if (cycleTimeout5m)  clearTimeout(cycleTimeout5m);
  if (cycleTimeout15m) clearTimeout(cycleTimeout15m);
  if (reconnectTimer)  clearTimeout(reconnectTimer);
  if (ws) { try { ws.terminate(); } catch {} ws = null; }
  logger.info('[t1000-gen] Stopped');
}

function getLatestCandles() {
  const result = {};
  for (const c of CRYPTOS) {
    const s = ohlc[c];
    result[c] = {
      cycleStart : s.cycleStart ? new Date(s.cycleStart).toISOString() : null,
      open       : s.open,
      high       : s.high,
      low        : s.low,
      close      : s.close,
      refPrice   : refPrice[c],
      trades     : s.trades,
      spikePct   : s.open && s.close ? ((s.close - s.open) / s.open * 100) : null,
    };
  }
  return result;
}

function getHealthTs() {
  return { lastBinanceTickTs, lastCycleStartTs };
}

// Returns the current accumulated Binance close price for a given crypto.
// Used by RECOVER strategy in t1000-engine to check price reversion at T+1/T+2.
function getCurrentClose(crypto) {
  return ohlc[crypto]?.close ?? null;
}

// Returns the current cycle reference prices (T0 candle opens) for all cryptos.
// Used by the frontend market dist% panel to show live distance from price-to-beat.
function getCycleRefPrices() {
  return {
    '5m':  { BTC: refPrice['BTC']    ?? null, ETH: refPrice['ETH']    ?? null, SOL: refPrice['SOL']    ?? null, XRP: refPrice['XRP']    ?? null },
    '15m': { BTC: refPrice15m['BTC'] ?? null, ETH: refPrice15m['ETH'] ?? null, SOL: refPrice15m['SOL'] ?? null, XRP: refPrice15m['XRP'] ?? null },
  };
}

module.exports = { start, stop, onCandle, onCycleEnd, onReconnect, getLatestCandles, getHealthTs, getCurrentClose, getCycleRefPrices };
