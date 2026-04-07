'use strict';

/**
 * Polygon RPC round-robin pool — multi-provider for resilience.
 *
 * Each call to nextRpcUrl() advances the counter so consecutive blockchain
 * operations use a different provider, spreading load and ensuring that a
 * single-provider outage (e.g. Infura) only affects 1-in-N calls.
 *
 * Usage:
 *   const { nextRpcUrl } = require('../utils/infura-rpc');
 *   const provider = new ethers.providers.JsonRpcProvider(nextRpcUrl());
 */

const RPC_URLS = [
  // Infura (keyed)
  'https://polygon-mainnet.infura.io/v3/948d6452ba3a46528aa44af20e074eae',
  'https://polygon-mainnet.infura.io/v3/ae4e4aed8b0a419790f38c3412b02e8a',
  'https://polygon-mainnet.infura.io/v3/7291a177faa34a36a7bd73bd7489cf01',
  // Public — no key required (Ankr and LlamaRPC removed: failing with NETWORK_ERROR as of 2026-03-24)
  'https://polygon-bor-rpc.publicnode.com',
  'https://1rpc.io/matic',
];

let _idx = 0;

/**
 * Returns the next RPC URL in round-robin order.
 * The counter is a module-level singleton so all callers share the rotation.
 */
function nextRpcUrl() {
  const url = RPC_URLS[_idx];
  _idx = (_idx + 1) % RPC_URLS.length;
  return url;
}

/** Current index (for logging/debugging only). */
function currentIdx() { return _idx; }

module.exports = { nextRpcUrl, currentIdx, RPC_URLS };
