'use strict';

/**
 * Wallet Manager — multi-wallet fan-out support.
 *
 * Loads extra wallets from backend/config/wallets.json (gitignored).
 * The "default" wallet (from .env POLY_* vars) is always wallet[0].
 * If wallets.json doesn't exist, getWallets() returns only the default wallet
 * and the engine behaves identically to single-wallet mode.
 */

const fs   = require('fs');
const path = require('path');
const poly = require('./polymarket');

const WALLETS_FILE = path.join(__dirname, '../../config/wallets.json');

// Cached wallet list: [{ id, label, client }]
let _wallets = null;

/**
 * (Re)load wallets from wallets.json.
 * Always auto-prepends the default wallet using the global poly singleton.
 * Called on startup; can be called again to hot-reload.
 */
function loadWallets() {
  const wallets = [
    {
      id    : 'default',
      label : 'Default',
      client: {
        placeOrderByToken : poly.placeOrderByToken.bind(poly),
        getBalance        : poly.getBalance.bind(poly),
        getEoaAddress     : poly.getEoaAddress.bind(poly),
      },
    },
  ];

  if (fs.existsSync(WALLETS_FILE)) {
    try {
      const raw  = fs.readFileSync(WALLETS_FILE, 'utf8');
      const defs = JSON.parse(raw);
      for (const def of defs) {
        if (!def.enabled) continue;
        if (!def.id || !def.signerKey || !def.apiKey) {
          console.warn(`[wallet-manager] skipping wallet "${def.id}" — missing signerKey or apiKey`);
          continue;
        }
        wallets.push({
          id    : def.id,
          label : def.label || def.id,
          client: poly.createWalletClient({
            signerKey     : def.signerKey,
            apiKey        : def.apiKey,
            apiSecret     : def.apiSecret,
            apiPassphrase : def.apiPassphrase,
          }),
        });
      }
      console.info(`[wallet-manager] loaded ${wallets.length - 1} extra wallet(s) from wallets.json`);
    } catch (err) {
      console.error(`[wallet-manager] failed to load wallets.json: ${err.message}`);
    }
  }

  _wallets = wallets;
}

/** Returns the full wallet list (default first, then extras). Loads on first call. */
function getWallets() {
  if (!_wallets) loadWallets();
  return _wallets;
}

/** Returns only the extra wallets (excludes default). */
function getExtraWallets() {
  return getWallets().slice(1);
}

module.exports = { loadWallets, getWallets, getExtraWallets };
