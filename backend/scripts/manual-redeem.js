'use strict';
/**
 * Manually redeem winning positions that the engine missed.
 * Retries every 60s until all succeed or MAX_ATTEMPTS is reached.
 * Usage: node backend/scripts/manual-redeem.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const poly = require('../src/trader/polymarket');

const WINS = [
  { crypto: 'ETH', cycleStart: 1772310600 * 1000, is15m: true, direction: 'DOWN', tradeId: '#ETH-2030-LIVE' },
  { crypto: 'XRP', cycleStart: 1772310600 * 1000, is15m: true, direction: 'DOWN', tradeId: '#XRP-2030-LIVE' },
];

const MAX_ATTEMPTS = 60; // up to 60 minutes
const INTERVAL_MS  = 60_000;

(async () => {
  const pending = new Map(WINS.map(w => [w.tradeId, { ...w, attempts: 0 }]));

  const tryAll = async () => {
    console.log(`\n=== ${new Date().toISOString()} — ${pending.size} pending ===`);
    for (const [tradeId, w] of pending) {
      w.attempts++;
      process.stdout.write(`  Redeeming ${tradeId} (attempt ${w.attempts}) ... `);
      const result = await poly.redeemWinningPosition(w.crypto, w.cycleStart, w.is15m, w.direction);
      if (result === 'LOSS') {
        console.log(`✗ LOSS — oracle says we lost (Chainlink ≠ Binance), no tokens to redeem`);
        pending.delete(tradeId);
      } else if (result && result.txHash) {
        console.log(`✓ tx=${result.txHash}  received=${result.usdcReceived.toFixed(4)} USDC.e`);
        pending.delete(tradeId);
      } else if (w.attempts >= MAX_ATTEMPTS) {
        console.log(`✗ gave up after ${MAX_ATTEMPTS} attempts`);
        pending.delete(tradeId);
      } else {
        console.log(`✗ not resolved yet, will retry`);
      }
    }

    if (pending.size === 0) {
      console.log('\nAll done.');
      process.exit(0);
    }
  };

  await tryAll();
  if (pending.size > 0) {
    console.log(`\nRetrying every 60s...`);
    const timer = setInterval(async () => {
      await tryAll();
      if (pending.size === 0) clearInterval(timer);
    }, INTERVAL_MS);
  }
})();
