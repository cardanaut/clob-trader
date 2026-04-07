'use strict';
/**
 * Ethereum Vanity Address Generator — Node.js (multi-core)
 * ─────────────────────────────────────────────────────────
 * Usage:   node walletgen.js [prefix] [threads]
 * Example: node walletgen.js 0000
 *          node walletgen.js 000000 8
 *
 * Speed: ~1,000–5,000 keys/s per worker (pure-JS secp256k1 via ethers)
 * For 6+ zero prefixes, compile and use walletgen.c (~50x faster).
 *
 * Run from backend/ directory:
 *   node scripts/walletgen/walletgen.js 0000
 */

const { workerData, parentPort, isMainThread, Worker } = require('worker_threads');
const crypto = require('crypto');
const os     = require('os');
const path   = require('path');

/* ── Resolve ethers (works from backend/ as cwd) ──────────────────── */
function loadEthers() {
  const tries = [
    path.resolve(__dirname, '../../node_modules/@polymarket/order-utils/node_modules/ethers'),
    '@polymarket/order-utils/node_modules/ethers',
    'ethers',
  ];
  for (const m of tries) {
    try { return require(m); } catch {}
  }
  throw new Error('ethers not found. Run from backend/ directory.');
}

/* ══════════════════════════════════════ WORKER THREAD ══════════════ */
if (!isMainThread) {
  const ethers = loadEthers();
  const { prefix } = workerData;
  const needle = ('0x' + prefix).toLowerCase();
  let count = 0;

  while (true) {
    const privKey = crypto.randomBytes(32);
    const addr    = ethers.utils.computeAddress(privKey).toLowerCase();
    count++;

    if (addr.startsWith(needle)) {
      parentPort.postMessage({
        found:      true,
        address:    ethers.utils.computeAddress(privKey), // checksum form
        privateKey: '0x' + privKey.toString('hex'),
        count,
      });
      return;
    }

    /* Report progress every 200 keys to avoid message overhead */
    if (count % 200 === 0) {
      parentPort.postMessage({ found: false, tick: 200 });
      count = 0;
    }
  }
}

/* ══════════════════════════════════════ MAIN THREAD ════════════════ */
const rawPrefix  = (process.argv[2] || '0000').replace(/^0x/i, '').toLowerCase();
const numWorkers = parseInt(process.argv[3]) || os.cpus().length;
const expected   = Math.pow(16, rawPrefix.length);

/* Validate hex */
if (!/^[0-9a-f]+$/.test(rawPrefix)) {
  console.error('Error: prefix must be hex characters (0-9, a-f)');
  process.exit(1);
}

console.log('');
console.log('  Ethereum Vanity Address Generator  (Node.js)');
console.log('  ─────────────────────────────────────────────────');
console.log(`  Target   : 0x${rawPrefix}...`);
console.log(`  Workers  : ${numWorkers} (of ${os.cpus().length} cores)`);
console.log(`  Expected : ~${Math.round(expected).toLocaleString()} attempts`);
if (rawPrefix.length >= 6) {
  console.log(`  Tip      : prefix length ${rawPrefix.length} → use walletgen.c for 50x speed`);
}
console.log('');
console.log('  Searching... (Ctrl+C to cancel)');
console.log('');

let totalCount = 0;
let done       = false;
const t0       = Date.now();

for (let i = 0; i < numWorkers; i++) {
  const w = new Worker(__filename, { workerData: { prefix: rawPrefix } });

  w.on('message', (msg) => {
    if (msg.found && !done) {
      done = true;
      const elapsed = ((Date.now() - t0) / 1000);
      const total   = totalCount + msg.count;
      const speed   = elapsed > 0 ? Math.round(total / elapsed) : 0;
      process.stdout.write('\r' + ' '.repeat(70) + '\r');
      console.log('  ┌─────────────────────────────────────────────────────────┐');
      console.log('  │  ✓  FOUND                                               │');
      console.log('  ├─────────────────────────────────────────────────────────┤');
      console.log(`  │  Address    : ${msg.address}`);
      console.log(`  │  PrivateKey : ${msg.privateKey}`);
      console.log('  ├─────────────────────────────────────────────────────────┤');
      console.log(`  │  Attempts   : ${total.toLocaleString()}`);
      console.log(`  │  Time       : ${elapsed.toFixed(1)}s`);
      console.log(`  │  Speed      : ${speed.toLocaleString()} keys/s`);
      console.log('  └─────────────────────────────────────────────────────────┘');
      console.log('');
      console.log('  ⚠  Save the PrivateKey securely. Never share it.');
      console.log('');
      process.exit(0);
    } else if (!msg.found) {
      totalCount += msg.tick;
      const elapsed = (Date.now() - t0) / 1000;
      const speed   = elapsed > 0 ? Math.round(totalCount / elapsed) : 0;
      const pct     = Math.min(99.9, (totalCount / expected * 100));
      process.stdout.write(
        `\r  ${totalCount.toLocaleString()} keys | ${speed.toLocaleString()} keys/s` +
        ` | ${elapsed.toFixed(0)}s | ${pct.toFixed(1)}% expected   `
      );
    }
  });

  w.on('error', (err) => { if (!done) console.error('\n  Worker error:', err.message); });
}
