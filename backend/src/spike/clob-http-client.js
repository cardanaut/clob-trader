/**
 * Direct CLOB HTTP Client - Bypasses buggy @polymarket/clob-client
 *
 * This module makes direct HTTP requests to Polymarket CLOB API using axios
 * with full SOCKS5/HTTP proxy support, avoiding all SDK issues.
 */

'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { HttpProxyAgent, HttpsProxyAgent } = require('hpagent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const logger = require('../utils/logger');
const config = require('./config');

// Smart Proxy Country Manager
// Polymarket-allowed countries (no geoblock): ES, PT, SE, NO, DK, CH, BR, JP, KR, NZ
// Strategy: Stick to primary country (Spain), failover to backups on persistent errors
const PROXY_COUNTRIES = {
  primary: 'ES',     // Spain (default)
  backups: ['PT', 'SE', 'NO', 'DK', 'CH']  // Portugal, Sweden, Norway, Denmark, Switzerland
};

let currentCountry = PROXY_COUNTRIES.primary;
let consecutiveErrors = 0;
const MAX_ERRORS_BEFORE_SWITCH = 2;  // Switch country after 2 consecutive errors

/**
 * Get proxy password with country targeting
 */
function getProxyPassword() {
  const basePassword = config.CLOB_PROXY.PASS;

  // Remove any existing country suffix (in case .env has it)
  const cleanPassword = basePassword.replace(/_country-[A-Z]{2}$/i, '');

  // Add current country suffix
  return `${cleanPassword}_country-${currentCountry}`;
}

/**
 * Switch to next backup country
 */
function switchProxyCountry() {
  const allCountries = [PROXY_COUNTRIES.primary, ...PROXY_COUNTRIES.backups];
  const currentIndex = allCountries.indexOf(currentCountry);
  const nextIndex = (currentIndex + 1) % allCountries.length;
  const newCountry = allCountries[nextIndex];

  logger.warn('[clob-http] 🔄 Switching proxy country due to errors', {
    from: currentCountry,
    to: newCountry,
    consecutiveErrors,
    reason: 'Persistent connection failures'
  });

  currentCountry = newCountry;
  consecutiveErrors = 0;  // Reset counter after switch

  // Recreate HTTP client with new country
  httpClient = createHttpClient();
  return httpClient;
}

/**
 * Mark successful request (reset error counter)
 */
function markSuccess() {
  if (consecutiveErrors > 0) {
    logger.info('[clob-http] ✅ Proxy recovered', {
      country: currentCountry,
      previousErrors: consecutiveErrors
    });
    consecutiveErrors = 0;
  }
}

/**
 * Mark failed request (increment error counter, switch if needed)
 */
function markFailure() {
  consecutiveErrors++;

  if (consecutiveErrors >= MAX_ERRORS_BEFORE_SWITCH) {
    switchProxyCountry();
  }
}

/**
 * Create axios instance with proxy support
 */
function createHttpClient() {
  const axiosConfig = {
    baseURL: config.LIVE_TRADING.CLOB_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'polychamp-spike/1.0'
    }
  };

  // Configure proxy if enabled
  if (config.CLOB_PROXY.ENABLED) {
    const { PROTOCOL: protocol, HOST: host, PORT: port, USER: user } = config.CLOB_PROXY;
    const pass = getProxyPassword(); // Use country-targeted password

    if (host && port && user && pass) {
      if (protocol === 'socks5') {
        const proxyUrl = `${protocol}://${user}:${pass}@${host}:${port}`;
        axiosConfig.httpsAgent = new SocksProxyAgent(proxyUrl);
        axiosConfig.proxy = false;
        logger.info('[clob-http] Using SOCKS5 proxy', { host, port, country: currentCountry });
      } else {
        // Use hpagent HttpsProxyAgent for HTTP proxy → HTTPS target tunneling
        axiosConfig.httpsAgent = new HttpsProxyAgent({
          proxy: `http://${user}:${pass}@${host}:${port}`
        });
        axiosConfig.proxy = false;
        logger.info('[clob-http] Using HTTPS proxy agent (hpagent)', { host, port, country: currentCountry });
      }
    }
  }

  return axios.create(axiosConfig);
}

let httpClient = createHttpClient();

/**
 * Generate L2 authentication headers
 * Polymarket uses HMAC-SHA256 signatures like Coinbase Pro
 */
function createL2Headers(method, requestPath, body, timestamp, creds, params) {
  const { key, secret, passphrase, address } = creds;

  // IMPORTANT: For GNOSIS_SAFE setup, address should be the PROXY address, not the signer
  // The API keys are associated with the proxy address

  // IMPORTANT: Polymarket signs only the base path, NOT including query params
  // Query params are sent in the request but NOT included in signature
  const message = timestamp + method.toUpperCase() + requestPath + (body || '');

  // Sign with HMAC-SHA256
  const signature = crypto
    .createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(message)
    .digest('base64')
    // IMPORTANT: Convert to URL-safe base64 (like SDK does)
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return {
    'POLY_ADDRESS': address,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp.toString(),
    'POLY_API_KEY': key,
    'POLY_PASSPHRASE': passphrase
  };
}

/**
 * Get current server time (for signature timestamps)
 */
async function getServerTime() {
  // Use local time directly - avoids extra API call that might fail with proxy
  return Math.floor(Date.now() / 1000);
}

/**
 * Detect if error is proxy-related
 */
function isProxyError(error) {
  const proxyErrorCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNABORTED'];
  const proxyErrorMessages = [
    'socket disconnected',
    'TLS connection',
    'proxy',
    'tunnel'
  ];

  if (proxyErrorCodes.includes(error.code)) {
    return true;
  }

  const msg = (error.message || '').toLowerCase();
  return proxyErrorMessages.some(pattern => msg.includes(pattern));
}

/**
 * Get balance
 */
async function getBalance(creds) {
  try {
    const timestamp = await getServerTime();
    const endpoint = '/balance-allowance';
    const params = { asset_type: 'COLLATERAL', signature_type: 2 }; // Use 2 for GNOSIS_SAFE (proxy setup)

    const headers = createL2Headers('GET', endpoint, '', timestamp, creds);

    logger.info('[clob-http] Making balance request', {
      endpoint,
      timestamp,
      hasProxy: !!httpClient.defaults.httpsAgent,
      country: currentCountry
    });

    logger.info('[clob-http] Sending balance request', {
      endpoint,
      params,
      headers: Object.keys(headers)
    });

    const response = await httpClient.get(endpoint, {
      headers,
      params
    });

    logger.info('[clob-http] Balance response received', {
      status: response.status,
      hasData: !!response.data,
      data: JSON.stringify(response.data).slice(0, 200)
    });

    markSuccess(); // Track successful request
    return response.data;
  } catch (error) {
    // Detect proxy failures
    if (config.CLOB_PROXY.ENABLED && isProxyError(error)) {
      markFailure(); // Track failure and switch country if needed
      logger.error('🚨 [clob-http] PROXY CONNECTION FAILED', {
        proxyHost: config.CLOB_PROXY.HOST,
        proxyPort: config.CLOB_PROXY.PORT,
        country: currentCountry,
        errorCode: error.code,
        errorMessage: error.message,
        suggestion: 'Check IPRoyal credentials and service status'
      });
    }

    logger.error('[clob-http] getBalance failed - RAW ERROR:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      code: error.code,
      responseData: error.response?.data,
      responseDataType: typeof error.response?.data,
      responseHeaders: error.response?.headers,
      requestUrl: error.config?.url,
      requestMethod: error.config?.method,
      requestParams: error.config?.params,
      fullError: error.toString()
    });
    throw error;
  }
}

/**
 * Place order
 */
async function placeOrder(signedOrder, creds) {
  try {
    const timestamp = await getServerTime();
    const endpoint = '/order';
    const body = JSON.stringify(signedOrder);

    const headers = createL2Headers('POST', endpoint, body, timestamp, creds);

    logger.info('[clob-http] Placing order', {
      endpoint,
      hasProxy: !!httpClient.defaults.httpsAgent,
      country: currentCountry,
      orderFields: Object.keys(signedOrder),
      hasSignature: !!signedOrder.signature,
      hasOwner: !!signedOrder.owner,
      hasOrderType: !!signedOrder.orderType
    });

    // DEBUG: Log the order being sent
    logger.info('[clob-http] Order structure being sent:', {
      order: JSON.stringify(signedOrder, null, 2).slice(0, 1500)
    });

    const response = await httpClient.post(endpoint, signedOrder, {
      headers,
      params: { signature_type: 2 } // Use 2 for GNOSIS_SAFE (proxy setup)
    });

    markSuccess(); // Track successful request
    return response.data;
  } catch (error) {
    // Detect proxy failures
    if (config.CLOB_PROXY.ENABLED && isProxyError(error)) {
      markFailure(); // Track failure and switch country if needed
      logger.error('🚨 [clob-http] PROXY CONNECTION FAILED DURING ORDER PLACEMENT', {
        proxyHost: config.CLOB_PROXY.HOST,
        proxyPort: config.CLOB_PROXY.PORT,
        country: currentCountry,
        errorCode: error.code,
        errorMessage: error.message,
        suggestion: 'All orders will fail until proxy is fixed! Check IPRoyal service status.'
      });
    }

    // Detect geoblock (403) - indicates proxy not working
    if (error.response?.status === 403 && config.CLOB_PROXY.ENABLED) {
      const errorMsg = JSON.stringify(error.response?.data || '');
      if (errorMsg.includes('geoblock') || errorMsg.includes('region')) {
        markFailure(); // Geoblock means proxy country is blocked
        logger.error('🚨 [clob-http] GEOBLOCK DETECTED - PROXY NOT WORKING!', {
          proxyEnabled: config.CLOB_PROXY.ENABLED,
          proxyHost: config.CLOB_PROXY.HOST,
          country: currentCountry,
          status: 403,
          error: error.response?.data,
          suggestion: 'Order was blocked by region restriction. Proxy is configured but NOT bypassing geoblock!'
        });
      }
    }

    const errorData = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      error: error.response?.data || error.message
    };

    logger.error('[clob-http] placeOrder failed', errorData);

    // Return error in same format as SDK for compatibility
    return {
      error: errorData.error,
      status: errorData.status
    };
  }
}

/**
 * Get order book
 */
async function getOrderBook(tokenId) {
  try {
    const response = await httpClient.get(`/book?token_id=${tokenId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // No order book exists
    }
    throw error;
  }
}

/**
 * Get market price (deprecated - use getPrices for accurate data)
 */
async function getMarketPrice(tokenId) {
  try {
    const response = await httpClient.get(`/price?token_id=${tokenId}`);
    return response.data;
  } catch (error) {
    logger.warn('[clob-http] getMarketPrice failed', {
      tokenId: tokenId.slice(0, 16),
      error: error.message
    });
    return null;
  }
}

/**
 * Get market prices for multiple tokens (POST /prices)
 * Returns accurate live prices (not stale like /book endpoint)
 * @param {Array<{token_id: String, side: String}>} requests - Array of {token_id, side}
 * @returns {Object} Prices by token_id
 */
async function getPrices(requests) {
  try {
    const response = await httpClient.post('/prices', requests);
    return response.data;
  } catch (error) {
    logger.error('[clob-http] getPrices failed', {
      error: error.message,
      requestCount: requests.length
    });
    return null;
  }
}

module.exports = {
  getBalance,
  placeOrder,
  getOrderBook,
  getMarketPrice,
  getPrices,
  createHttpClient
};
