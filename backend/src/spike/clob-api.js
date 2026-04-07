/**
 * Polymarket CLOB API Client for SpikeTrading
 * Supports both paper trading (read-only) and live trading (order placement)
 *
 * SMART ROUTING: Uses BrightData residential proxy ONLY for CLOB API requests
 * to bypass Cloudflare 403 blocks. Other APIs (Binance, Gamma) go direct.
 */

'use strict';

// NOTE: Proxy configuration is handled in index.js before ANY modules load
// Module.prototype.require is patched to intercept axios and inject proxy agent

const { ClobClient, OrderType, AssetType } = require('@polymarket/clob-client');
// Use ethers v5 from @polymarket/order-utils (required for _signTypedData compatibility)
const { ethers } = require('@polymarket/order-utils/node_modules/ethers');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpProxyAgent, HttpsProxyAgent } = require('hpagent');
const logger = require('../utils/logger');
const config = require('./config');

// CRITICAL: Use our custom HTTP client instead of buggy SDK for all API calls
// SDK is ONLY used for order signing (EIP-712 cryptographic signatures)
// We cannot easily replace the SDK's signing logic because:
//   1. Requires exact EIP-712 typed data format
//   2. Complex hash construction with domain separators
//   3. Battle-tested code that Polymarket's backend expects
// Note: SDK's http-helpers patches axios globally, but we isolate other
//       axios instances (like gammaAxios) with explicit proxy: false
const clobHttp = require('./clob-http-client');

// Infura API key pool for round-robin (avoid rate limiting)
const INFURA_KEYS = [
  'b54e0655429441918bc806c2af831c5a',
  '792a2e35e6894e09a083c03978e57fdd',
  '948d6452ba3a46528aa44af20e074eae',
  'ae4e4aed8b0a419790f38c3412b02e8a',
  '7291a177faa34a36a7bd73bd7489cf01'
];
let currentInfuraKeyIndex = 0;

/**
 * Get next Infura API key in round-robin fashion
 */
function getNextInfuraKey() {
  const key = INFURA_KEYS[currentInfuraKeyIndex];
  currentInfuraKeyIndex = (currentInfuraKeyIndex + 1) % INFURA_KEYS.length;
  return key;
}

/**
 * Create Polygon RPC provider with round-robin Infura keys
 */
function createProvider() {
  const infuraKey = getNextInfuraKey();
  const rpcUrl = `https://polygon-mainnet.infura.io/v3/${infuraKey}`;

  logger.info('[spike-clob] Creating provider', {
    provider: 'Infura',
    keyIndex: currentInfuraKeyIndex === 0 ? INFURA_KEYS.length - 1 : currentInfuraKeyIndex - 1,
    totalKeys: INFURA_KEYS.length,
    rpcUrl: rpcUrl.replace(infuraKey, '***')
  });

  // Using ethers v5 (from @polymarket/order-utils)
  return new ethers.providers.JsonRpcProvider(rpcUrl);
}

/**
 * Configure residential proxy for CLOB API (Cloudflare bypass)
 * Supports both HTTP and SOCKS5 proxies
 * Only used when CLOB_USE_PROXY=true in .env
 */
function createProxyAgent() {
  const useProxy = process.env.CLOB_USE_PROXY === 'true';

  if (!useProxy) {
    logger.info('[spike-clob] Proxy disabled (CLOB_USE_PROXY=false)');
    return null;
  }

  const protocol = process.env.CLOB_PROXY_PROTOCOL || 'http'; // http or socks5
  const host = process.env.CLOB_PROXY_HOST;
  const port = process.env.CLOB_PROXY_PORT;
  const user = process.env.CLOB_PROXY_USER;
  const pass = process.env.CLOB_PROXY_PASS;

  if (!host || !port || !user || !pass) {
    logger.warn('[spike-clob] Proxy credentials missing, proceeding without proxy');
    logger.warn('[spike-clob] Set CLOB_PROXY_HOST, CLOB_PROXY_PORT, CLOB_PROXY_USER, CLOB_PROXY_PASS in .env');
    return null;
  }

  // Detect proxy provider from hostname
  let provider = 'unknown';
  if (host.includes('iproyal')) provider = 'IPRoyal';
  else if (host.includes('brightdata') || host.includes('superproxy')) provider = 'BrightData';
  else if (host.includes('oxylabs')) provider = 'Oxylabs';
  else if (host.includes('smartproxy') || host.includes('decodo')) provider = 'Decodo';

  // Build proxy URL based on protocol
  const proxyUrl = `${protocol}://${user}:${pass}@${host}:${port}`;

  // Create appropriate agent based on protocol
  let agent;
  if (protocol === 'socks5') {
    agent = new SocksProxyAgent(proxyUrl);
  } else {
    // HTTP/HTTPS proxy - use hpagent HttpsProxyAgent for HTTPS target
    agent = new HttpsProxyAgent({ proxy: proxyUrl });
  }

  logger.info('[spike-clob] ✓ Residential proxy enabled for CLOB API', {
    provider,
    protocol: protocol.toUpperCase(),
    host,
    port,
    bypassing: 'Cloudflare 403 blocks'
  });

  return agent;
}

// Create proxy agent for CLOB API (if enabled)
const proxyAgent = createProxyAgent();

// Proxy configuration is handled by Module.prototype.require patching above
// This ensures ALL axios instances (including ClobClient's internal one) use the proxy
if (proxyAgent) {
  const protocol = process.env.CLOB_PROXY_PROTOCOL || 'http';
  logger.info(`[spike-clob] Proxy agent created for ${protocol.toUpperCase()} ${process.env.CLOB_PROXY_HOST}:${process.env.CLOB_PROXY_PORT}`);
}

// Live trading client (only initialized if credentials provided)
// Note: We no longer use read-only client - all API calls go through clobHttp
let liveClient = null;
let liveWallet = null;

/**
 * Initialize live trading client with user credentials
 * Only call this when TRADING_MODE='LIVE' and credentials are provided
 */
function initializeLiveClient() {
  if (liveClient) {
    return liveClient; // Already initialized
  }

  if (!config.LIVE_TRADING.PRIVATE_KEY) {
    throw new Error('POLY_SIGNER_KEY environment variable required for live trading');
  }

  if (!config.LIVE_TRADING.API_KEY || !config.LIVE_TRADING.API_SECRET || !config.LIVE_TRADING.API_PASSPHRASE) {
    throw new Error('POLY_API_KEY, POLY_API_SECRET, and POLY_API_PASSPHRASE required for live trading');
  }

  try {
    // Create RPC provider for Polygon (round-robin through Infura keys)
    const provider = createProvider();

    // Create wallet from private key and connect to provider
    // This enables _signTypedData functionality required by Polymarket
    liveWallet = new ethers.Wallet(config.LIVE_TRADING.PRIVATE_KEY, provider);

    // API credentials for balance and order management
    const creds = {
      key: config.LIVE_TRADING.API_KEY,
      secret: config.LIVE_TRADING.API_SECRET,
      passphrase: config.LIVE_TRADING.API_PASSPHRASE
    };

    // Initialize CLOB client with full credentials (same as copy-trading)
    liveClient = new ClobClient(
      config.LIVE_TRADING.CLOB_URL,
      config.LIVE_TRADING.CHAIN_ID,
      liveWallet,
      creds,
      2, // Signature type (2 = POLY_GNOSIS_SAFE - required for proxy address setup)
      config.LIVE_TRADING.PROXY_ADDRESS // Use the proxy address registered with API keys
    );

    logger.info('[spike-clob] Live trading client initialized', {
      walletAddress: liveWallet.address,
      proxyAddress: config.LIVE_TRADING.PROXY_ADDRESS,
      chainId: config.LIVE_TRADING.CHAIN_ID,
      clobUrl: config.LIVE_TRADING.CLOB_URL
    });

    return liveClient;
  } catch (err) {
    logger.error('[spike-clob] Failed to initialize live client', { error: err.message });
    throw err;
  }
}

/**
 * Get real order book for a token (read-only, works in both PAPER and LIVE mode)
 * @param {String} tokenId - CLOB token ID
 * @returns {Object|null} { asks, bids, bestAsk, bestBid, depth }
 */
async function getOrderBook(tokenId) {
  try {
    // Use our custom HTTP client
    const book = await clobHttp.getOrderBook(tokenId);

    if (!book || (!book.asks?.length && !book.bids?.length)) {
      logger.warn('[spike-clob] Order book empty or missing', {
        tokenId: tokenId.slice(0, 16) + '...',
        hasAsks: !!book?.asks?.length,
        hasBids: !!book?.bids?.length
      });
      return null; // No liquidity
    }

    const asks = book.asks || [];
    const bids = book.bids || [];

    logger.info('[spike-clob] Order book fetched via custom HTTP client', {
      tokenId: tokenId.slice(0, 16) + '...',
      topAsk: asks[0],
      topBid: bids[0],
      askCount: asks.length,
      bidCount: bids.length
    });

    return {
      asks,
      bids,
      bestAsk: asks.length > 0 ? parseFloat(asks[0].price) : null,
      bestBid: bids.length > 0 ? parseFloat(bids[0].price) : null,
      askDepth: asks.length,
      bidDepth: bids.length,
      spread: asks.length > 0 && bids.length > 0
        ? parseFloat(asks[0].price) - parseFloat(bids[0].price)
        : null
    };
  } catch (err) {
    if (err.response?.status === 404) {
      return null; // No order book exists
    }

    logger.error('[spike-clob] Error fetching order book', {
      tokenId: tokenId.slice(0, 16) + '...',
      error: err.message
    });
    return null;
  }
}

/**
 * Get USDC balance for the live trading wallet
 * @returns {Number} Balance in USDC
 */
async function getBalance() {
  if (!liveWallet) {
    throw new Error('Live wallet not initialized. Call initializeLiveClient() first.');
  }

  try {
    // Try using SDK's built-in method to see if it gives better errors
    logger.info('[spike-clob] Calling SDK getBalanceAllowance...');
    const bal = await liveClient.getBalanceAllowance('COLLATERAL');

    if (bal.balance == null) {
      logger.error('[spike-clob] getBalance: unexpected response (no balance field)', { response: JSON.stringify(bal).slice(0, 200) });
      return null;
    }

    // CLOB returns balance in USDC base units (6 decimals) — convert to dollars
    const liquidBalance = parseFloat(bal.balance) / 1e6;

    logger.info('[spike-clob] USDC balance fetched via custom HTTP client', {
      liquid: liquidBalance.toFixed(2),
      wallet: liveWallet.address
    });

    return {
      liquid: liquidBalance,
      unredeemed: 0,
      total: liquidBalance
    };
  } catch (err) {
    logger.error('[spike-clob] getBalance failed', {
      error: err.message,
      status: err.response?.status
    });

    if (err.response?.status === 403) {
      console.log('[spike-clob] ❌ HTTP 403 FORBIDDEN - Check proxy configuration');
    }

    return null;
  }
}

/**
 * Place a market order (FOK - Fill or Kill)
 * @param {String} tokenId - Token ID to trade
 * @param {String} side - 'BUY' or 'SELL'
 * @param {Number} amount - Amount in USDC
 * @param {Number} price - Maximum price to pay (for BUY) or minimum to receive (for SELL)
 * @returns {Object} Order response
 */
async function placeOrder(tokenId, side, amount, price) {
  if (!liveClient) {
    throw new Error('Live client not initialized. Call initializeLiveClient() first.');
  }

  try {
    // Validate inputs
    if (!tokenId || typeof tokenId !== 'string') {
      throw new Error(`Invalid tokenId: ${tokenId}`);
    }
    if (side !== 'BUY' && side !== 'SELL') {
      throw new Error(`Invalid side: ${side} (must be BUY or SELL)`);
    }
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error(`Invalid amount: ${amount} (must be positive number)`);
    }
    if (typeof price !== 'number' || price <= 0 || price >= 1) {
      throw new Error(`Invalid price: ${price} (must be between 0 and 1)`);
    }

    // Calculate shares (amount in USDC / price per share)
    const shares = amount / price;

    // Validate calculated shares
    if (!isFinite(shares) || shares <= 0) {
      throw new Error(`Invalid shares calculation: amount=${amount}, price=${price}, shares=${shares}`);
    }

    // Validate that shares calculation is valid
    if (isNaN(shares) || !isFinite(shares)) {
      logger.error('[spike-clob] Invalid shares calculation resulted in NaN/Infinity', {
        amount,
        price,
        shares,
        calculation: `${amount} / ${price} = ${shares}`
      });
      throw new Error(`Shares calculation failed: ${amount} / ${price} = ${shares}`);
    }

    // Create order params - CLOB client expects NUMBERS for price/size, NOT strings
    const orderParams = {
      tokenID: tokenId,
      price: parseFloat(price.toFixed(2)), // Price as NUMBER rounded to 0.01 tick size
      size: parseFloat(shares.toFixed(6)), // Size as NUMBER with 6 decimal precision
      side: side,
      feeRateBps: 1000, // Fee rate as NUMBER - 1000 basis points = 1%
      nonce: Date.now(), // Unique nonce
      expiration: Math.floor(Date.now() / 1000) + config.LIVE_TRADING.ORDER_EXPIRY_SECONDS
    };

    logger.info('[spike-clob] Placing order with params', {
      tokenId: tokenId.slice(0, 16) + '...',
      side,
      amountUSDC: amount.toFixed(2),
      pricePerShare: orderParams.price,
      shares: orderParams.size,
      feeRateBps: orderParams.feeRateBps,
      nonce: orderParams.nonce,
      expiration: new Date(orderParams.expiration * 1000).toISOString(),
      allParams: JSON.stringify(orderParams)
    });

    // Sign order using SDK (crypto part - this works)
    // Pass options with explicit tickSize to ensure proper validation
    const options = {
      tickSize: '0.01', // Polymarket uses 0.01 tick size (1 cent increments)
      negRisk: false    // Not a negative risk market
    };

    const signedOrder = await liveClient.createOrder(orderParams, options);

    // Log the signed order payload for debugging (with ALL fields)
    logger.info('[spike-clob] Signed order payload', {
      tokenID: signedOrder.tokenID?.slice(0, 16) + '...',
      maker: signedOrder.maker?.slice(0, 10) + '...',
      signer: signedOrder.signer?.slice(0, 10) + '...',
      taker: signedOrder.taker?.slice(0, 10) + '...',
      makerAmount: signedOrder.makerAmount,
      takerAmount: signedOrder.takerAmount,
      side: signedOrder.side,
      feeRateBps: signedOrder.feeRateBps,
      nonce: signedOrder.nonce,
      expiration: signedOrder.expiration,
      salt: signedOrder.salt,
      signatureType: signedOrder.signatureType,
      hasSignature: !!signedOrder.signature
    });

    // Log for comparison: what we asked for vs what SDK generated
    logger.info('[spike-clob] Order comparison', {
      requested: {
        price: orderParams.price,
        size: orderParams.size,
        side: orderParams.side,
        amountUSDC: amount
      },
      generated: {
        makerAmount: signedOrder.makerAmount,
        takerAmount: signedOrder.takerAmount,
        side: signedOrder.side
      }
    });

    // Use the signed order exactly as returned by SDK - DO NOT MODIFY!
    // Modifying fields will invalidate the signature since it was computed over original values
    // Also: Do NOT add extra fields like owner, orderType, deferExec - API rejects them!
    const orderPayload = { ...signedOrder };

    logger.info('[spike-clob] Final order payload prepared', {
      side: orderPayload.side,
      saltType: typeof orderPayload.salt,
      hasSignature: !!orderPayload.signature,
      fieldCount: Object.keys(orderPayload).length
    });

    // DEBUG: Log complete order payload for diagnostics
    logger.info('[spike-clob] COMPLETE ORDER PAYLOAD:', {
      payload: JSON.stringify(orderPayload, null, 2).slice(0, 2000)
    });

    // POST the order using SDK's built-in postOrder method
    // This handles all the authentication and formatting correctly
    logger.info('[spike-clob] Posting order via SDK...');

    try {
      const orderResponse = await liveClient.postOrder(
        signedOrder,
        'GTC',   // OrderType: Good Till Cancelled
        false    // deferExec: execute immediately
      );

      logger.info('[spike-clob] ✅ Order placed successfully via SDK', {
        orderId: orderResponse.orderID,
        success: orderResponse.success
      });

      return orderResponse;
    } catch (sdkError) {
      // Log the error details before SDK tries to serialize it
      logger.error('[spike-clob] SDK postOrder failed', {
        errorMessage: sdkError.message,
        errorName: sdkError.name,
        response: sdkError.response ? {
          status: sdkError.response.status,
          statusText: sdkError.response.statusText,
          data: sdkError.response.data
        } : 'No response',
        config: sdkError.config ? {
          method: sdkError.config.method,
          url: sdkError.config.url
        } : 'No config'
      });
      throw sdkError;
    }
  } catch (err) {
    logger.error('[spike-clob] Error placing order', {
      error: err.message,
      response: err.response?.data,
      stack: err.stack
    });
    throw err;
  }
}

// getOrderStatus removed - not used anywhere
// If needed in future, implement with clobHttp.getOrder() instead of SDK

/**
 * Calculate realistic entry price with slippage
 * Same logic as copy-trading for consistency
 * @param {Number} bestAsk - Best ask price from order book
 * @param {Number} slippageTolerancePct - Slippage tolerance %
 * @returns {Number} Entry price (best ask + slippage)
 */
function calculateEntryPrice(bestAsk, slippageTolerancePct) {
  // Validate inputs
  if (typeof bestAsk !== 'number' || isNaN(bestAsk)) {
    throw new Error(`Invalid bestAsk: ${bestAsk} (not a number)`);
  }
  if (bestAsk <= 0 || bestAsk > 1) {
    throw new Error(`Invalid bestAsk: ${bestAsk} (must be between 0 and 1)`);
  }
  if (typeof slippageTolerancePct !== 'number' || isNaN(slippageTolerancePct)) {
    throw new Error(`Invalid slippageTolerancePct: ${slippageTolerancePct} (not a number)`);
  }

  const maxPrice = Math.min(0.99, bestAsk * (1 + slippageTolerancePct / 100));

  // Round to Polymarket's tick size (0.01 increments)
  // Example: 0.5253 -> 0.53, 0.5149 -> 0.51
  return Math.round(maxPrice * 100) / 100;
}

module.exports = {
  getOrderBook,
  calculateEntryPrice,
  initializeLiveClient,
  getBalance,
  placeOrder,
  get liveClient() { return liveClient; } // Expose for advanced operations
};
