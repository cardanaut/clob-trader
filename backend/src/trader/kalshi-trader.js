'use strict';

/**
 * Kalshi Trader — balance query and order placement.
 *
 * Uses the same RSA-PSS signing as kalshi-websocket.js.
 * Silently returns null when not configured (no crash).
 */

const crypto = require('crypto');
const fs     = require('fs');
const axios  = require('axios');
const logger = require('../utils/logger');

const BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

// ── Auth (identical to kalshi-websocket.js) ────────────────────────────────────

function loadPrivateKey() {
  const keyFile = process.env.KALSHI_PRIVATE_KEY_FILE;
  const keyPem  = process.env.KALSHI_PRIVATE_KEY_PEM;
  if (keyFile) {
    try { return fs.readFileSync(keyFile, 'utf8'); } catch (e) {
      logger.warn('[kalshi-trader] Cannot read private key file', { file: keyFile, error: e.message });
    }
  }
  if (keyPem) return keyPem.replace(/\\n/g, '\n');
  return null;
}

function makeSignature(privateKeyPem, method, path) {
  const timestamp = Date.now().toString();
  const cleanPath = path.split('?')[0];
  const message   = timestamp + method.toUpperCase() + cleanPath;
  const sign = crypto.createSign('SHA256');
  sign.update(message);
  sign.end();
  const sig = sign.sign({
    key:        privateKeyPem,
    padding:    crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return { timestamp, signature: sig.toString('base64') };
}

function makeAuthHeaders(method, apiPath) {
  const apiKey = process.env.KALSHI_API_KEY;
  const pem    = loadPrivateKey();
  if (!apiKey || !pem) return null;
  try {
    const { timestamp, signature } = makeSignature(pem, method, apiPath);
    return {
      'KALSHI-ACCESS-KEY':       apiKey,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'Content-Type':            'application/json',
    };
  } catch (err) {
    logger.warn('[kalshi-trader] Failed to sign request', { error: err.message });
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Returns true if Kalshi credentials are configured. */
function isConfigured() {
  return !!(process.env.KALSHI_API_KEY &&
    (process.env.KALSHI_PRIVATE_KEY_FILE || process.env.KALSHI_PRIVATE_KEY_PEM));
}

/**
 * Fetch portfolio balance.
 * @returns {{ available: number, total: number } | null}
 */
async function getBalance() {
  const apiPath = '/trade-api/v2/portfolio/balance';
  const headers = makeAuthHeaders('GET', apiPath);
  if (!headers) return null;
  try {
    const res = await axios.get(BASE_URL + '/portfolio/balance', {
      headers, timeout: 5000, proxy: false,
    });
    const bal = res.data?.balance;
    if (!bal) return null;
    return {
      available: parseFloat(bal.available_balance ?? bal.cash_balance ?? '0'),
      total:     parseFloat(bal.portfolio_value   ?? bal.total_value  ?? bal.available_balance ?? '0'),
    };
  } catch (err) {
    logger.warn('[kalshi-trader] getBalance failed', { error: err.message });
    return null;
  }
}

/**
 * Place a limit buy order on Kalshi.
 *
 * @param {string} ticker          Active market ticker (e.g. 'KXBTC15M-25FEB2715:15')
 * @param {'yes'|'no'} side        Which side to buy
 * @param {number} sizeUsd         Dollar amount to risk
 * @param {number} limitPriceCents Limit price in cents (1–99)
 * @returns {{ orderId: string|null, entryPrice: number, count: number } | null}
 */
async function placeOrder(ticker, side, sizeUsd, limitPriceCents) {
  const apiPath = '/trade-api/v2/portfolio/orders';
  const headers = makeAuthHeaders('POST', apiPath);
  if (!headers) return null;

  const count = Math.floor(sizeUsd / (limitPriceCents / 100));
  if (count < 1) {
    logger.warn('[kalshi-trader] placeOrder: count < 1', { sizeUsd, limitPriceCents });
    return null;
  }

  const priceKey = side === 'yes' ? 'yes_price' : 'no_price';
  const payload  = {
    ticker,
    action          : 'buy',
    side,
    type            : 'limit',
    count,
    [priceKey]      : limitPriceCents,
    client_order_id : `t1000-${Date.now()}`,
  };

  try {
    const res = await axios.post(BASE_URL + '/portfolio/orders', payload, {
      headers, timeout: 8000, proxy: false,
    });
    const order = res.data?.order ?? res.data;
    return {
      orderId    : order?.order_id ?? order?.id ?? null,
      entryPrice : limitPriceCents / 100,
      count,
    };
  } catch (err) {
    logger.warn('[kalshi-trader] placeOrder failed', {
      error: err.message,
      response: err.response?.data,
      ticker, side,
    });
    return null;
  }
}

module.exports = { isConfigured, getBalance, placeOrder };
