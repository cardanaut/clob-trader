#!/usr/bin/env node
/**
 * redeem-sweep.js — Blind on-chain redemption sweep
 *
 * Scans Polymarket UP/DOWN markets for BTC/ETH/SOL/XRP since the last
 * successful full scan (stored in logs/redeem-sweep-state.json), defaulting
 * to 2026-03-01 on first run. After a complete scan the end timestamp is
 * persisted so the next run only covers new markets.
 *
 * A scan interrupted mid-way does NOT advance the pointer — only a run that
 * reaches the final summary line updates the state file.
 *
 * Usage:
 *   node backend/scripts/redeem-sweep.js              # auto: since last full scan
 *   node backend/scripts/redeem-sweep.js --hours 72   # override: last 72h (no state save)
 *   node backend/scripts/redeem-sweep.js --dry-run    # check only, don't send tx
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs         = require('fs');
const path       = require('path');
const { ethers } = require('@polymarket/order-utils/node_modules/ethers');
const axios      = require('axios');

// ── Config ────────────────────────────────────────────────────────────────────
const USDC_ADDRESS  = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e
const CTF_CONTRACT  = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'; // ConditionalTokens ERC-1155
const CRYPTOS       = ['btc', 'eth', 'sol', 'xrp'];
const DURATIONS     = [
  { label: '5m',  seconds: 300  },
  { label: '15m', seconds: 900  },
];

const CTF_ABI = [
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata indexSets) external',
  'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
];
const USDC_ABI = ['function balanceOf(address) view returns (uint256)'];

// ── Persistent state ──────────────────────────────────────────────────────────
const STATE_FILE    = path.join(__dirname, '../logs/redeem-sweep-state.json');
const DEFAULT_SINCE = '2026-03-01T00:00:00.000Z';

// ── Args ──────────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const hoursIdx = args.indexOf('--hours');

let sinceMs, sinceLabel, saveStateAfter;

if (hoursIdx !== -1) {
  const h    = parseInt(args[hoursIdx + 1], 10);
  sinceMs       = Date.now() - h * 3_600_000;
  sinceLabel    = `last ${h}h`;
  saveStateAfter = false; // --hours override: never advance the pointer
} else {
  let sweepState = {};
  try { sweepState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
  const since = sweepState.lastFullScanEnd || DEFAULT_SINCE;
  sinceMs       = new Date(since).getTime();
  sinceLabel    = `since ${since.slice(0, 10)}`;
  saveStateAfter = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSigner() {
  const key = (process.env.POLY_SIGNER_KEY || '').trim();
  if (!key) throw new Error('POLY_SIGNER_KEY not set in .env');
  const keyHex = key.startsWith('0x') ? key : '0x' + key;
  return new ethers.Wallet(keyHex);
}

function getRpcUrl() {
  return require('../src/utils/infura-rpc').nextRpcUrl();
}

/**
 * Compute Polymarket ERC-1155 position token ID from conditionId + indexSet.
 * Formula from ConditionalTokens.sol:
 *   collectionId = bytes32(0) XOR keccak256(conditionId || indexSet)
 *   positionId   = uint256(keccak256(collateralToken || collectionId))
 */
function computePositionId(conditionId, indexSet) {
  // collectionId = keccak256(abi.encodePacked(conditionId, uint256(indexSet)))
  // (parentCollectionId = bytes32(0) so XOR doesn't change anything)
  const collectionId = ethers.utils.solidityKeccak256(
    ['bytes32', 'uint256'],
    [conditionId, indexSet],
  );
  // positionId = uint256(keccak256(abi.encodePacked(collateralToken, collectionId)))
  return ethers.BigNumber.from(
    ethers.utils.solidityKeccak256(['address', 'bytes32'], [USDC_ADDRESS, collectionId])
  );
}

/** Generate all cycle start timestamps (seconds) for a given duration since sinceMs (epoch ms) */
function cycleStarts(durationSeconds, sinceEpochMs) {
  const nowSec   = Math.floor(Date.now() / 1000);
  const startSec = Math.floor(sinceEpochMs / 1000);
  const first    = Math.ceil(startSec / durationSeconds) * durationSeconds;
  const result   = [];
  for (let t = first; t < nowSec; t += durationSeconds) result.push(t);
  return result;
}

/** Resolve a promise within ms milliseconds, or throw a timeout error */
function withTimeout(promise, ms) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timer]);
}

/** Fetch Gamma market data for a slug (returns null on 404 / not found) */
async function fetchMarket(slug) {
  try {
    const res = await axios.get('https://gamma-api.polymarket.com/markets', {
      params: { slug }, timeout: 8000,
    });
    const markets = Array.isArray(res.data) ? res.data : [];
    return markets.length ? markets[0] : null;
  } catch { return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Polychamp redemption sweep — ${sinceLabel}${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  const signer     = buildSigner();
  const eoaAddress = await signer.getAddress();
  const provider   = new ethers.providers.JsonRpcProvider(getRpcUrl());
  const ctfRead    = new ethers.Contract(CTF_CONTRACT, CTF_ABI, provider);
  const usdcRead   = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);

  console.log(`EOA: ${eoaAddress}`);

  // Starting USDC.e balance
  const rawBefore  = await usdcRead.balanceOf(eoaAddress);
  const usdcBefore = parseFloat(ethers.utils.formatUnits(rawBefore, 6));
  console.log(`USDC.e balance before: $${usdcBefore.toFixed(4)}\n`);

  let totalRedeemed = 0;
  let marketsChecked = 0;
  let positionsFound = 0;

  // Build full slug list
  const slugs = [];
  for (const crypto of CRYPTOS) {
    for (const dur of DURATIONS) {
      for (const ts of cycleStarts(dur.seconds, sinceMs)) {
        slugs.push({ crypto, dur: dur.label, ts, slug: `${crypto}-updown-${dur.label}-${ts}` });
      }
    }
  }
  console.log(`Checking ${slugs.length} market slots across ${CRYPTOS.join('/')} 5m+15m…\n`);

  // Process in parallel batches of 8 (Gamma API is rate-limited)
  const BATCH = 8;
  for (let i = 0; i < slugs.length; i += BATCH) {
    const batch = slugs.slice(i, i + BATCH);
    await Promise.all(batch.map(async ({ slug, crypto, dur, ts }) => {
      marketsChecked++;
      const market = await fetchMarket(slug);
      if (!market) return;                       // market doesn't exist yet
      if (!market.closed) return;                // not resolved yet
      const conditionId = market.conditionId;
      if (!conditionId) return;

      // Determine which slots resolved
      let payoutUp, payoutDown;
      try {
        [payoutUp, payoutDown] = await withTimeout(Promise.all([
          ctfRead.payoutNumerators(conditionId, 0),
          ctfRead.payoutNumerators(conditionId, 1),
        ]), 10_000);
      } catch { return; }

      if (!payoutUp.gt(0) && !payoutDown.gt(0)) return; // not resolved on-chain yet

      // Check our ERC-1155 balance for both UP (indexSet=1) and DOWN (indexSet=2)
      for (const { indexSet, label, payout } of [
        { indexSet: 1, label: 'UP',   payout: payoutUp   },
        { indexSet: 2, label: 'DOWN', payout: payoutDown },
      ]) {
        if (!payout.gt(0)) continue; // this outcome didn't win

        const positionId = computePositionId(conditionId, indexSet);
        let balance;
        try {
          balance = await withTimeout(ctfRead.balanceOf(eoaAddress, positionId), 10_000);
        } catch { continue; }

        if (balance.isZero()) continue;

        const tokenCount = parseFloat(ethers.utils.formatUnits(balance, 6));
        const usdcValue  = tokenCount; // resolved tokens pay 1 USDC each
        positionsFound++;

        console.log(`✓ Found redeemable position: ${crypto.toUpperCase()} ${dur} ${label} @ cycle ${ts}`);
        console.log(`  conditionId: ${conditionId}`);
        console.log(`  balance: ${tokenCount.toFixed(4)} tokens ≈ $${usdcValue.toFixed(4)} USDC.e`);

        if (DRY_RUN) {
          console.log(`  [DRY RUN] would call redeemPositions(indexSets=[${indexSet}])\n`);
          totalRedeemed += usdcValue;
          continue;
        }

        // Send redemption tx
        try {
          const ctfWrite  = new ethers.Contract(CTF_CONTRACT, CTF_ABI, signer.connect(provider));
          const feeData   = await provider.getFeeData();
          const minTip    = ethers.utils.parseUnits('30', 'gwei');
          const tip       = feeData.maxPriorityFeePerGas?.gt(minTip) ? feeData.maxPriorityFeePerGas : minTip;
          const base      = feeData.lastBaseFeePerGas ?? ethers.utils.parseUnits('120', 'gwei');
          const maxFee    = base.mul(2).add(tip);

          console.log(`  → Sending redeemPositions(indexSets=[${indexSet}])…`);
          const tx = await ctfWrite.redeemPositions(
            USDC_ADDRESS,
            ethers.constants.HashZero,
            conditionId,
            [indexSet],
            { maxPriorityFeePerGas: tip, maxFeePerGas: maxFee },
          );
          console.log(`  tx sent: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`  confirmed in block ${receipt.blockNumber}`);

          // Measure USDC received
          const rawAfter  = await usdcRead.balanceOf(eoaAddress);
          const usdcAfter = parseFloat(ethers.utils.formatUnits(rawAfter, 6));
          const received  = Math.max(0, usdcAfter - usdcBefore - totalRedeemed);
          console.log(`  USDC.e received: $${received.toFixed(4)}\n`);
          totalRedeemed += received;
        } catch (err) {
          console.error(`  ERROR redeeming: ${err.message}\n`);
        }
      }
    }));
  }

  // Final summary
  const rawAfter  = await usdcRead.balanceOf(eoaAddress);
  const usdcAfter = parseFloat(ethers.utils.formatUnits(rawAfter, 6));

  console.log('\n─────────────────────────────────────────');
  console.log(`Markets checked : ${marketsChecked}`);
  console.log(`Positions found : ${positionsFound}`);
  if (DRY_RUN) {
    console.log(`Estimated value : $${totalRedeemed.toFixed(4)} USDC.e`);
  } else {
    console.log(`USDC.e before   : $${usdcBefore.toFixed(4)}`);
    console.log(`USDC.e after    : $${usdcAfter.toFixed(4)}`);
    console.log(`Net received    : $${(usdcAfter - usdcBefore).toFixed(4)}`);
  }
  console.log('─────────────────────────────────────────\n');

  // Advance state pointer — only after a complete run, never for --hours overrides
  if (saveStateAfter && !DRY_RUN) {
    const newState = {};
    try { Object.assign(newState, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch {}
    newState.lastFullScanEnd = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));
    console.log(`State saved. Next scan will start from: ${newState.lastFullScanEnd.slice(0, 10)}\n`);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
