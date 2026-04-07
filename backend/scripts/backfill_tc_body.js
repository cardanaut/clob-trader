'use strict';
/**
 * Backfill t0BodyRatio / tcBodyRatio for historical TC T+1 trades.
 *
 * How it works:
 *  - Fetches Binance 1m klines for the time range covering all TC trades
 *  - Aggregates 1m candles into the synthetic T+0 window (cycleStart → +candle_size)
 *  - t0Open is already stored on the entry (verified against Binance open)
 *  - t1Close is reconstructed: t0Open × (1 + spike_pct / 100)
 *  - Computes t0BodyRatio = |t0Close−t0Open| / (t0High−t0Low) × 100
 *            tcBodyRatio  = |t1Close−t0Open| / (t0High−t0Low) × 100
 *  - Writes result back into state.json
 *
 * Usage:
 *   node backend/scripts/backfill_tc_body.js           → patch + save
 *   node backend/scripts/backfill_tc_body.js --dry-run → print only
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const STATE_FILE = path.join(__dirname, '../../logs/t1000-state.json');
const STRATEGIES = ['LIVE', 'LIVE_MINI'];
const DRY_RUN    = process.argv.includes('--dry-run');

const SYMBOL_MAP = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', XRP: 'XRPUSDT' };

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error for ${url}: ${data.slice(0, 300)}`)); }
      });
    }).on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchKlines(symbol, startMs, endMs) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m` +
              `&startTime=${startMs}&endTime=${endMs}&limit=1000`;
  const data = await fetchJSON(url);
  if (!Array.isArray(data)) throw new Error(`Binance error for ${symbol}: ${JSON.stringify(data)}`);
  return data.map(k => ({
    openTime : Number(k[0]),
    open     : parseFloat(k[1]),
    high     : parseFloat(k[2]),
    low      : parseFloat(k[3]),
    close    : parseFloat(k[4]),
    closeTime: Number(k[6]),
  }));
}

// ── Aggregate 1m candles → synthetic T+0 candle ───────────────────────────────
// Includes every 1m candle whose openTime is in [windowStart, windowEnd).
function aggregateT0(klineMap, windowStartMs, windowEndMs, storedT0Open) {
  let high = -Infinity, low = Infinity, close = null, firstOpen = null;

  let cur = Math.floor(windowStartMs / 60_000) * 60_000;
  while (cur < windowEndMs) {
    const k = klineMap.get(cur);
    if (k) {
      if (firstOpen === null) firstOpen = k.open;
      if (k.high > high) high = k.high;
      if (k.low  < low)  low  = k.low;
      close = k.close;
    }
    cur += 60_000;
  }

  if (close === null) return null;

  // Use stored t0Open (engine used it; API open may differ by tiny rounding)
  const open = storedT0Open ?? firstOpen;
  return { open, high, low, close, firstOpen };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

  // Collect TC trades that need patching
  const tcTrades = [];
  for (const key of STRATEGIES) {
    const s = state[key];
    if (!s) continue;
    for (let i = 0; i < (s.activityLog || []).length; i++) {
      const e = s.activityLog[i];
      if (!e.isT1 || e.label !== 'TC') continue;
      if (e.status !== 'WIN' && e.status !== 'LOSS') continue;
      if (e.t0BodyRatio != null && e.tcBodyRatio != null) {
        continue; // already patched
      }
      tcTrades.push({ stratKey: key, idx: i, entry: e });
    }
  }

  const total = tcTrades.length;
  console.log(`TC trades to backfill: ${total}`);
  if (total === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Group by crypto, find time range per crypto
  const groups = {};
  for (const t of tcTrades) {
    const c = t.entry.crypto;
    if (!groups[c]) groups[c] = { trades: [], minMs: Infinity, maxMs: -Infinity };
    groups[c].trades.push(t);
    const cs = t.entry.cycleStart;
    const ce = cs + t.entry.candle_size * 2000 + 120_000; // T+0 + T+1 + buffer
    if (cs < groups[c].minMs) groups[c].minMs = cs;
    if (ce > groups[c].maxMs) groups[c].maxMs = ce;
  }

  // Fetch klines per crypto
  const klinesByCrypto = {};
  for (const [crypto, g] of Object.entries(groups)) {
    const symbol = SYMBOL_MAP[crypto];
    if (!symbol) { console.warn(`Unknown crypto ${crypto}, skipping`); continue; }

    const fromStr = new Date(g.minMs).toISOString().slice(0, 16);
    const toStr   = new Date(g.maxMs).toISOString().slice(0, 16);
    console.log(`\n${crypto} (${symbol}): ${fromStr} → ${toStr}`);

    const klineMap = new Map();
    klinesByCrypto[crypto] = klineMap;

    let cursor = Math.floor(g.minMs / 60_000) * 60_000;
    let pageCount = 0;

    while (cursor < g.maxMs) {
      const batchEnd = Math.min(cursor + 1000 * 60_000, g.maxMs);
      let batch;
      try {
        batch = await fetchKlines(symbol, cursor, batchEnd);
      } catch (e) {
        console.error(`  Fetch error: ${e.message}`);
        break;
      }
      for (const k of batch) klineMap.set(k.openTime, k);
      pageCount++;
      process.stdout.write(`  page ${pageCount}: ${batch.length} candles (up to ${new Date(cursor).toISOString().slice(11, 16)})\r`);
      if (batch.length < 1000) break;
      cursor = batch[batch.length - 1].closeTime + 1;
      await sleep(150); // Binance rate limit courtesy
    }
    console.log(`  Loaded ${klineMap.size} 1m candles for ${crypto}                    `);
  }

  // Compute and patch
  let patched = 0, skipped = 0;

  console.log('\n── Results ──────────────────────────────────────────────────────────────────');
  console.log('Status  Crypto  t0Body%  tcBody%  t0OpenOK?  TradeId');

  for (const { stratKey, idx, entry } of tcTrades) {
    const klineMap = klinesByCrypto[entry.crypto];
    if (!klineMap) { skipped++; continue; }

    const { cycleStart, candle_size, t0Open, spike_pct } = entry;
    const t0End = cycleStart + candle_size * 1000;

    const t0Candle = aggregateT0(klineMap, cycleStart, t0End, t0Open);
    if (!t0Candle) {
      console.log(`SKIP    ${entry.crypto.padEnd(6)}  (no candle data for ${new Date(cycleStart).toISOString().slice(0, 16)})  ${entry.tradeId}`);
      skipped++; continue;
    }

    const range = t0Candle.high - t0Candle.low;
    if (range <= 0) {
      console.log(`SKIP    ${entry.crypto.padEnd(6)}  (zero range)  ${entry.tradeId}`);
      skipped++; continue;
    }

    // Reconstruct t1Close from stored spike_pct
    // spike_pct = (t1Close − t0Open) / t0Open × 100  →  t1Close = t0Open × (1 + spike_pct/100)
    const t1Close     = t0Open * (1 + spike_pct / 100);
    const t0BodyRatio = parseFloat((Math.abs(t0Candle.close - t0Open) / range * 100).toFixed(1));
    const tcBodyRatio = parseFloat((Math.abs(t1Close         - t0Open) / range * 100).toFixed(1));

    // Sanity check: stored t0Open vs Binance open at cycleStart
    const openDiff    = t0Candle.firstOpen != null ? Math.abs(t0Candle.firstOpen - t0Open) / t0Open * 100 : null;
    const openOk      = openDiff == null ? '?' : openDiff < 0.05 ? 'OK' : `DIFF=${openDiff.toFixed(3)}%`;

    const marker = entry.status === 'LOSS' ? ' ← LOSS' : '';
    console.log(
      `${entry.status.padEnd(6)}  ${entry.crypto.padEnd(6)}  ${String(t0BodyRatio).padStart(5)}%  ${String(tcBodyRatio).padStart(5)}%  ${openOk.padEnd(9)}  ${entry.tradeId}${marker}`
    );

    if (!DRY_RUN) {
      const e = state[stratKey].activityLog[idx];
      e.t0High      = t0Candle.high;
      e.t0Low       = t0Candle.low;
      e.t0Close     = t0Candle.close;
      e.t1Close     = parseFloat(t1Close.toFixed(6));
      e.t0BodyRatio = t0BodyRatio;
      e.tcBodyRatio = tcBodyRatio;
    }
    patched++;
  }

  console.log('\n─────────────────────────────────────────────────────────────────────────────');
  if (!DRY_RUN && patched > 0) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`Patched ${patched} / ${total} TC trades in state.json${skipped ? `  (${skipped} skipped — no Binance data)` : ''}.`);
    console.log('Run: node backend/scripts/analyze_tc_body.js --detail');
  } else if (DRY_RUN) {
    console.log(`Dry run: would patch ${patched}${skipped ? `, skip ${skipped}` : ''}.`);
  } else {
    console.log(`Nothing patched (${skipped} skipped).`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
