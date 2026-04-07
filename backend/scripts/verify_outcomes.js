'use strict';
/**
 * verify_outcomes.js — Cross-check recent LIVE trade outcomes against Polymarket on-chain data.
 *
 * For every WIN/LOSS trade in the last N days, fetches the conditionId from the Gamma API
 * and reads payoutNumerators from the ConditionalTokens contract.  Any discrepancy is sent
 * to the running API (POST /t1000/verify-outcomes) for in-process correction.
 *
 * Usage:
 *   node verify_outcomes.js [--days N] [--dry-run] [--api http://localhost:55550]
 *
 * Cron (every hour):
 *   0 * * * * /path/to/verify_outcomes.sh >> /path/to/verify_outcomes_cron.log 2>&1
 */

process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config();

const fs       = require('fs');
const axios    = require('axios');
const http     = require('http');
const { ethers } = require('../node_modules/@polymarket/order-utils/node_modules/ethers');
const infuraRpc  = require('../src/utils/infura-rpc');

// ── Config ────────────────────────────────────────────────────────────────────
const STATE_FILE = require('path').join(__dirname, '../../logs/t1000-state.json');
const API_BASE   = (() => {
  const a = process.argv.indexOf('--api');
  return a >= 0 ? process.argv[a + 1] : 'http://localhost:55550';
})();
const DAYS = (() => {
  const d = process.argv.indexOf('--days');
  return d >= 0 ? parseInt(process.argv[d + 1], 10) : 7;
})();
const DRY_RUN = process.argv.includes('--dry-run');

const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const CTF_ABI      = [
  'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
];

const ts = () => new Date().toISOString().slice(0, 19) + 'Z';
const log = (...a) => console.log(`[${ts()}]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Helpers ───────────────────────────────────────────────────────────────────

// Gamma API — fetch conditionId + closed status for a market slug.
// Returns { conditionId, closed, outcome } or null if not found / not closed.
async function fetchMarket(slug) {
  try {
    const res = await axios.get('https://gamma-api.polymarket.com/markets',
      { params: { slug }, timeout: 8000 });
    const market = Array.isArray(res.data) ? res.data[0] : null;
    if (!market || !market.conditionId) return null;
    if (!market.closed) return null;    // not resolved yet — skip
    return {
      conditionId : market.conditionId,
      closed      : market.closed,
      outcome     : (market.outcome || '').toLowerCase(),
    };
  } catch { return null; }
}

// On-chain check: which direction won?
// Returns 'UP', 'DOWN', or null (not resolved / RPC error).
async function onChainOutcome(conditionId) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(infuraRpc.nextRpcUrl());
    const ctf      = new ethers.Contract(CTF_CONTRACT, CTF_ABI, provider);
    const [p0, p1] = await Promise.all([
      ctf.payoutNumerators(conditionId, 0),
      ctf.payoutNumerators(conditionId, 1),
    ]);
    if (!p0.gt(0) && !p1.gt(0)) return null;   // not resolved yet
    return p0.gt(0) ? 'UP' : 'DOWN';
  } catch { return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  log(`Starting outcome verification (last ${DAYS} day(s), dry-run=${DRY_RUN})`);

  // 1. Read state
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    log('ERROR: cannot read state file:', e.message);
    process.exit(1);
  }

  const strat = state.LIVE;
  if (!strat || !Array.isArray(strat.activityLog)) {
    log('No LIVE activityLog found in state — nothing to check.');
    process.exit(0);
  }

  const cutoff  = Date.now() - DAYS * 24 * 3600 * 1000;
  const entries = strat.activityLog.filter(e =>
    (e.status === 'WIN' || e.status === 'LOSS') &&
    e.cycleStart && e.cycleStart > cutoff &&
    e.candle_size && e.crypto && e.direction
  );

  log(`Found ${entries.length} resolved trades in last ${DAYS} day(s) to verify.`);
  if (!entries.length) { log('Nothing to check.'); process.exit(0); }

  // 2. Check each trade
  const corrections = [];
  let checked = 0, skipped = 0, errors = 0;

  // Cache conditionIds to avoid re-fetching the same slug twice
  const condCache = new Map();

  for (const entry of entries) {
    const dur  = entry.candle_size >= 150 ? '15m' : '5m';
    const slug = `${entry.crypto.toLowerCase()}-updown-${dur}-${Math.floor(entry.cycleStart / 1000)}`;

    // Fetch market (cached)
    let mkt = condCache.get(slug);
    if (mkt === undefined) {
      await sleep(120);   // gentle rate-limit: ~8 req/s
      mkt = await fetchMarket(slug);
      condCache.set(slug, mkt);
    }
    if (!mkt) { skipped++; continue; }   // not closed yet or not found

    // On-chain outcome
    const actual = await onChainOutcome(mkt.conditionId);
    if (!actual) { skipped++; continue; }

    checked++;

    const actualWin  = (entry.direction === actual);
    const recordedWin = entry.status === 'WIN';

    if (actualWin === recordedWin) continue;  // correct — no action needed

    // Mismatch!
    const correction = {
      tradeId      : entry.tradeId,
      crypto       : entry.crypto,
      direction    : entry.direction,
      candle_size  : entry.candle_size,
      cycleStart   : entry.cycleStart,
      recordedStatus : entry.status,
      correctStatus  : actualWin ? 'WIN' : 'LOSS',
      actualOutcome  : actual,
      redeemed       : !!entry.redeemed,
      entryPrice     : entry.entryPrice,
      position       : entry.position,
    };

    log(`MISMATCH  ${entry.tradeId}: recorded=${entry.status}  actual=${actual}  direction=${entry.direction}  => should be ${correction.correctStatus}`);
    corrections.push(correction);
  }

  log(`Checked ${checked} | Skipped ${skipped} | Errors ${errors} | Corrections needed: ${corrections.length}`);

  if (!corrections.length) {
    log('All outcomes correct — no fixes needed.');
    process.exit(0);
  }

  if (DRY_RUN) {
    log('DRY-RUN — not sending corrections to API.');
    process.exit(0);
  }

  // 3. POST corrections to running API
  const payload  = JSON.stringify({ corrections, source: 'verify_outcomes_cron' });
  const url      = new URL('/t1000/verify-outcomes', API_BASE);
  const options  = {
    hostname : url.hostname,
    port     : url.port || 80,
    path     : url.pathname,
    method   : 'POST',
    headers  : {
      'Content-Type'  : 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization' : 'Basic ' + Buffer.from(`admin:${process.env.API_PASSWORD}`).toString('base64'),
    },
  };

  const result = await new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  }).catch(e => ({ status: 0, error: e.message }));

  if (result.status === 200) {
    log(`API applied ${result.body?.fixed ?? '?'} correction(s). ${JSON.stringify(result.body?.corrections ?? [])}`);
  } else {
    log(`ERROR: API returned ${result.status}:`, result.error || result.body);
    process.exit(1);
  }

  log('Done.');
  process.exit(0);
})();
