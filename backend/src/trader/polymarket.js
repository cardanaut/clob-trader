/**
 * Polymarket CLOB API wrapper
 * Handles balance, token lookup, order placement and cancellation.
 *
 * All orders use FOK (Fill or Kill) limit orders:
 *   BUY  — amount = USDC to spend
 *   SELL — amount = shares (tokens) to sell
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

// Use ethers v5 from @polymarket/order-utils (required for _signTypedData compatibility)
const { ethers }     = require('@polymarket/order-utils/node_modules/ethers');
const { ClobClient, Side, AssetType, OrderType } = require('@polymarket/clob-client');
const axios          = require('axios');
const { query }      = require('../database/connection');
const logger         = require('../utils/logger');
const infuraRpc      = require('../utils/infura-rpc');

// ── CLOB order-size helper ─────────────────────────────────────────────────────
// Polymarket CLOB requires makerAmount (= shares × price for a BUY) to have
// ≤ 2 decimal places.  Simple floor-to-2-decimals doesn't guarantee this because
// a 2-decimal number × 2-decimal price can produce up to 4 decimal places
// (e.g. 1.49 × 0.99 = 1.4751).
//
// Correct approach: for a given price p = pCents/100, find the finest share
// increment that makes shares × price land on a whole cent.
//
//   shares must be a multiple of  100 / gcd(pCents, 100)  hundredths.
//
// Examples:
//   price=0.99  → gcd(99,100)=1  → step=100 → shares must be integer (1.00, 2.00…)
//   price=0.90  → gcd(90,100)=10 → step=10  → multiples of 0.10 (1.60, 1.70…)
//   price=0.50  → gcd(50,100)=50 → step=2   → multiples of 0.02 (2.94, 2.96…)
function _gcd(a, b) { return b === 0 ? a : _gcd(b, a % b); }

function validShares(sizeUsd, price, minMakerUsd = 0) {
  const priceCents  = Math.round(price * 100);
  const step        = 100 / _gcd(priceCents, 100);  // minimum increment, in hundredths
  // Use integer arithmetic to avoid IEEE-754 float errors (e.g. 150/0.60 = 249.9999…).
  // sizeUsd is always ≤2 decimal places, so Math.round(sizeUsd * 100) is exact.
  const sizeUsdCents = Math.round(sizeUsd * 100);
  const rawCents     = Math.floor(sizeUsdCents * 100 / priceCents);
  let   sharesCents = Math.floor(rawCents / step) * step;
  // If shares × price would fall below the CLOB minimum (e.g. $1), round UP to the
  // next valid step — this slightly overspends the budget but satisfies the constraint.
  if (minMakerUsd > 0) {
    const minCents = Math.ceil(minMakerUsd / price * 100);
    const minValid = Math.ceil(minCents / step) * step;
    if (sharesCents < minValid) sharesCents = minValid;
  }
  return sharesCents / 100;
}

// Note: geoblock proxy (CLOB_USE_PROXY / CLOB_PROXY_*) is injected directly into
// the SDK's ESM request() function via apply-patches.sh (POST /order only).
// CJS axios.defaults.httpsAgent does not cross the ESM boundary, so no wrapper needed here.

const HOST        = process.env.POLY_CLOB_HOST    || 'https://clob.polymarket.com';
const CHAIN_ID    = parseInt(process.env.POLY_CHAIN_ID || '137', 10);
const API_KEY     = process.env.POLY_API_KEY;
const API_SECRET  = process.env.POLY_API_SECRET;   // HMAC key for L2 REST auth headers
const SIGNER_KEY  = process.env.POLY_SIGNER_KEY;   // EIP-712 private key — must be set explicitly
const API_PASS    = process.env.POLY_API_PASSPHRASE;

// USDC.e (bridged USDC) — the actual Polymarket CLOB collateral on Polygon.
// clob-client v5.x hardcodes 0x2791... as collateral; native USDC migration not yet reflected in SDK.
// The EOA wallet must hold USDC.e for orders to succeed. Native USDC is NOT used by the CLOB.
const USDC_ADDRESS  = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e (bridged)
// Native USDC on Polygon — used as CTF collateral for newer Polymarket markets (post-2024).
// The CLOB still settles in USDC.e, but the ConditionalTokens contract for many markets
// now uses native USDC as collateral.  positionId hashes differ per collateral token.
const NATIVE_USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // native USDC on Polygon
const CTF_EXCHANGE  = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'; // CLOB trading contract
const CTF_CONTRACT  = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'; // ConditionalTokens (redeemPositions lives here)
// No single RPC constant — use infuraRpc.nextRpcUrl() per call (round-robin across 5 keys).
const USDC_ABI      = ['function balanceOf(address) view returns (uint256)'];
const CTF_ABI       = [
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata indexSets) external',
  'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',  // ERC-1155
  // Use on-chain helpers to compute collectionId/positionId — the CTF contract uses
  // an internal formula that differs from naive keccak256(conditionId, indexSet).
  'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
  'function getPositionId(address collateralToken, bytes32 collectionId) view returns (uint256)',
];

async function getOnChainUsdcBalance(address) {
  try {
    const rpc = infuraRpc.nextRpcUrl();
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
    const raw = await usdc.balanceOf(address);
    return parseFloat(ethers.utils.formatUnits(raw, 6)); // USDC.e has 6 decimals
  } catch (e) {
    return null;
  }
}

// Build the Ethereum signing wallet from POLY_SIGNER_KEY.
// Accepts three formats:
//   0x<64 hex>  — standard prefixed hex private key
//   <64 hex>    — unprefixed hex private key
//   <base64>    — base64 or base64url encoded 32-byte key
// POLY_API_SECRET (separate value) is the HMAC key for L2 REST auth.
function buildSigner() {
  if (!SIGNER_KEY) throw new Error('POLY_SIGNER_KEY is not set in .env');
  const key = SIGNER_KEY.trim();
  let keyHex;
  if (/^0x[0-9a-fA-F]{64}$/.test(key)) {
    keyHex = key;
  } else if (/^[0-9a-fA-F]{64}$/.test(key)) {
    keyHex = '0x' + key;
  } else {
    const standardB64 = key.replace(/-/g, '+').replace(/_/g, '/');
    keyHex = '0x' + Buffer.from(standardB64, 'base64').toString('hex');
  }
  // Using ethers v5 natively - no patch needed
  return new ethers.Wallet(keyHex);
}

// Build a signer from an explicit key string (for per-wallet clients).
function _buildSignerFrom(keyStr) {
  if (!keyStr) throw new Error('signerKey is required');
  const key = keyStr.trim();
  let keyHex;
  if (/^0x[0-9a-fA-F]{64}$/.test(key)) {
    keyHex = key;
  } else if (/^[0-9a-fA-F]{64}$/.test(key)) {
    keyHex = '0x' + key;
  } else {
    const standardB64 = key.replace(/-/g, '+').replace(/_/g, '/');
    keyHex = '0x' + Buffer.from(standardB64, 'base64').toString('hex');
  }
  return new ethers.Wallet(keyHex);
}

// Returns the EOA wallet address derived from POLY_SIGNER_KEY.
// Synchronous — address derivation is pure crypto, no network call needed.
function getEoaAddress() {
  try { return buildSigner().address; }
  catch (_) { return null; }
}

// EOA mode (SignatureType 0): signer EOA is the funder — no proxy address needed.
// USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174) must be in the EOA wallet — NOT native USDC.
// Run backend/scripts/polymarket-eoa-setup.js once to set allowances + derive API keys.
function buildClient() {
  const signer = buildSigner();
  const creds  = { key: API_KEY, secret: API_SECRET, passphrase: API_PASS };
  return new ClobClient(HOST, CHAIN_ID, signer, creds);
}

// Fetch the USDC.e balance of the EOA wallet (in $)
// Returns { liquid, total, unredeemed } where:
//   - liquid: on-chain USDC.e in EOA wallet (the actual CLOB collateral)
//   - total: liquid + estimated value of unredeemed positions
//   - unredeemed: estimated USDC.e value of winning positions not yet claimed
async function getBalance() {
  try {
    const signer = buildSigner();
    const eoaAddress = await signer.getAddress();

    // In EOA mode, FOK orders pull native USDC directly from wallet — read on-chain balance
    const liquidBalance = await getOnChainUsdcBalance(eoaAddress);
    if (liquidBalance === null) {
      logger.error('getBalance: failed to read on-chain USDC balance');
      return null;
    }

    // Get unredeemed conditional tokens (winning positions not yet claimed)
    const unredeemed = await getUnredeemedValue();

    return {
      liquid: liquidBalance,
      unredeemed: unredeemed,
      total: liquidBalance + unredeemed
    };
  } catch (err) {
    logger.error('getBalance error', { error: err.message });
    return null;
  }
}

// Legacy: queried spike_trades_simulated (old table, no longer used).
// Engine tracks redemptions via pendingRedemptions map — this function is dead code.
async function getUnredeemedValue() {
  return 0;
}

// Fetch YES/NO token IDs for a market from Gamma API, cached in DB
async function getTokenIds(marketId) {
  const cached = await query(
    'SELECT token_yes, token_no FROM market_tokens WHERE market_id = $1',
    [marketId]
  );
  if (cached.rows.length && cached.rows[0].token_yes) {
    return { yes: cached.rows[0].token_yes, no: cached.rows[0].token_no };
  }

  try {
    const res = await axios.get('https://gamma-api.polymarket.com/markets', {
      params: { condition_ids: marketId }
    });
    const data = Array.isArray(res.data) ? res.data : [];
    if (!data.length) {
      logger.warn('getTokenIds: no market data returned', { marketId });
      return { yes: null, no: null };
    }
    const market = data[0];

    // Parse clobTokenIds - Gamma API sometimes returns it as JSON string
    let tokensRaw = market.clobTokenIds || [];
    if (typeof tokensRaw === 'string') {
      try {
        tokensRaw = JSON.parse(tokensRaw);
      } catch (_) {
        tokensRaw = [];
      }
    }
    const tokens = Array.isArray(tokensRaw) ? tokensRaw : [];

    // Parse outcomes - Gamma API sometimes returns it as JSON string
    let outcomesRaw = market.outcomes || ['Yes', 'No'];
    if (typeof outcomesRaw === 'string') {
      try {
        outcomesRaw = JSON.parse(outcomesRaw);
      } catch (_) {
        outcomesRaw = ['Yes', 'No'];
      }
    }
    const outcomes = (Array.isArray(outcomesRaw) ? outcomesRaw : ['Yes', 'No']).map(o => o.toLowerCase());
    const yesIdx   = outcomes.findIndex(o => o === 'yes');
    const noIdx    = outcomes.findIndex(o => o === 'no');
    const tokenYes = tokens[yesIdx >= 0 ? yesIdx : 0] || null;
    const tokenNo  = tokens[noIdx  >= 0 ? noIdx  : 1] || null;

    if (tokenYes || tokenNo) {
      await query(
        `INSERT INTO market_tokens (market_id, token_yes, token_no)
         VALUES ($1, $2, $3)
         ON CONFLICT (market_id) DO UPDATE SET token_yes=$2, token_no=$3, fetched_at=NOW()`,
        [marketId, tokenYes, tokenNo]
      );
    }
    return { yes: tokenYes, no: tokenNo };
  } catch (err) {
    logger.error('getTokenIds error', { marketId, error: err.message });
    return { yes: null, no: null };
  }
}

// Place a FAK limit-buy order with slippage tolerance.
// Returns { orderId, price } or null on failure.
async function placeOrder(marketId, outcome, sizeUsd) {
  const tokens  = await getTokenIds(marketId);
  const tokenId = outcome === 'YES' ? tokens.yes : tokens.no;
  if (!tokenId) {
    logger.warn('placeOrder: no token ID found', { marketId, outcome });
    return null;
  }

  try {
    const client = buildClient();

    // Get current best ask price to calculate slippage-adjusted max price
    let currentPrice = null;
    try {
      const book = await client.getOrderBook(tokenId);
      const asks = book?.asks || [];
      if (!asks.length) {
        logger.warn('placeOrder: no liquidity in order book', { marketId, outcome });
        return null;
      }
      currentPrice = parseFloat(asks[0].price);
    } catch (err) {
      logger.error('placeOrder: failed to get order book', { marketId, outcome, error: err.message });
      return null;
    }

    // Calculate max price with slippage tolerance
    const slippagePct = parseFloat(process.env.SLIPPAGE_TOLERANCE || '3');
    const maxPrice = Math.min(0.99, currentPrice * (1 + slippagePct / 100)); // Cap at 0.99

    // Calculate shares to buy based on max price (to ensure we don't overspend)
    const sharesToBuy = Math.round((sizeUsd / maxPrice) * 100) / 100;

    logger.info('Placing order with slippage tolerance', {
      marketId,
      outcome,
      currentPrice,
      maxPrice,
      slippagePct,
      sizeUsd,
      sharesToBuy
    });

    // FOK limit order — fills immediately at maxPrice or better, or cancels
    const order = await client.createOrder({
      tokenID:   tokenId,
      price:     maxPrice,
      side:      Side.BUY,
      size:      sharesToBuy,
      // feeRateBps omitted — CLOB client auto-resolves the market's required fee rate
    });

    const resp    = await client.postOrder(order, OrderType.FOK); // FOK = Fill or Kill
    const orderId = resp?.orderID || resp?.order_id || null;

    if (!orderId) {
      logger.warn('placeOrder: no orderId in response, order may have been rejected', {
        marketId,
        outcome,
        response: JSON.stringify(resp).slice(0, 500)
      });
      return null;
    }

    // Derive actual entry price from fill amounts when the response includes them
    let entryPrice = currentPrice;
    const making = parseFloat(resp?.makingAmount || '0');
    const taking  = parseFloat(resp?.takingAmount || '0');
    if (making > 0 && taking > 0) {
      entryPrice = making / taking;
    }

    logger.info('Order placed successfully', {
      marketId,
      outcome,
      sizeUsd,
      orderId,
      entryPrice,
      currentPrice,
      maxPrice,
      slippage: entryPrice > currentPrice ? ((entryPrice - currentPrice) / currentPrice * 100).toFixed(2) + '%' : '0%'
    });
    return { orderId, price: entryPrice };
  } catch (err) {
    logger.error('placeOrder error', {
      marketId,
      outcome,
      sizeUsd,
      error: err.message,
      errorDetails: err.response ? JSON.stringify(err.response.data).slice(0, 500) : 'No response data',
      stack: err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : undefined
    });
    return null;
  }
}

/**
 * Place a real order directly by token ID.
 *   limitPrice != null → GTC LIMIT at exact price (for balance >= $100)
 *   limitPrice == null → FOK market-like at best ask + slippage (for balance < $100)
 *
 * FOK: size = validShares(sizeUsd, price) — GCD formula ensures shares × price has ≤2 decimal places,
 *   satisfying the CLOB constraint without patching the SDK.
 * Returns { orderId, entryPrice, shares } where shares = actual USDC cost (makingAmount or shares×price).
 */
async function placeOrderByToken(tokenId, sizeUsd, limitPrice = null) {
  if (!tokenId) {
    logger.warn('placeOrderByToken: no tokenId provided');
    return null;
  }
  try {
    const client = buildClient();

    let price;
    let orderType;
    let obi = null;

    if (limitPrice != null) {
      // LIMIT: GTC at exact CLOB price supplied by the websocket
      price     = limitPrice;
      orderType = OrderType.GTC;
    } else {
      // MARKET: FOK at best ask + slippage tolerance
      const book = await client.getOrderBook(tokenId);
      const asks = book?.asks || [];
      if (!asks.length) {
        logger.warn('placeOrderByToken: no liquidity for market order', { tokenId: tokenId.slice(0, 16) });
        return null;
      }
      // Compute OBI = (bidVol − askVol) / (bidVol + askVol) from full book depth
      const _bids    = book?.bids || [];
      const _bidVol  = _bids.reduce((s, b) => s + (parseFloat(b.size) || 0), 0);
      const _askVol  = asks.reduce((s, a) => s + (parseFloat(a.size) || 0), 0);
      const _obiDen  = _bidVol + _askVol;
      obi = _obiDen > 0 ? parseFloat(((_bidVol - _askVol) / _obiDen).toFixed(4)) : 0;
      const bestAsk    = parseFloat(asks[0].price);
      const slippagePct = parseFloat(process.env.SLIPPAGE_TOLERANCE || '3');
      // Cap at 0.96 (not 0.99): prices 0.97 and 0.99 have gcd(priceCents,100)=1, meaning shares
      // must be whole integers. At those prices the $1 CLOB minimum forces the order to at least
      // 2 shares even for small budgets, causing a large unintended overspend.
      // At 0.96: gcd(96,100)=4 → step=0.25, giving fine-grained sizing.
      price     = Math.min(0.96, Math.round(bestAsk * (1 + slippagePct / 100) * 100) / 100);
      orderType = OrderType.FOK;
    }

    // shares chosen so that shares × price lands on a whole cent (≤2 decimal places).
    // minMakerUsd=1.0 ensures makerAmount meets the CLOB $1 minimum for BUY orders.
    const shares = validShares(sizeUsd, price, 1.0);
    if (shares <= 0) {
      logger.warn('placeOrderByToken: budget too small for one valid share lot', { sizeUsd, price });
      return null;
    }

    // Overspend guard: the $1 CLOB minimum or GCD rounding can force shares above the budget.
    // If the projected cost exceeds the intended budget by more than 30%, skip the order rather
    // than silently place a much larger bet than the user configured.
    const projectedCost = parseFloat((shares * price).toFixed(2));
    if (projectedCost > sizeUsd * 1.3) {
      logger.warn('placeOrderByToken: projected order cost exceeds budget by >30%, skipping', {
        sizeUsd, price: price.toFixed(2), shares, projectedCost,
        overspendPct: ((projectedCost / sizeUsd - 1) * 100).toFixed(1) + '%',
      });
      return null;
    }

    logger.info('placeOrderByToken', {
      tokenId: tokenId.slice(0, 16) + '...',
      sizeUsd,
      price: price.toFixed(4),
      shares,
      projectedCost,
      orderType: limitPrice != null ? 'GTC_LIMIT' : 'FOK_MARKET',
    });

    // createOrder() calls getNegRisk internally — must NOT go through proxy (407)
    // Only postOrder() (the actual CLOB submission) needs the proxy for geoblock bypass
    const order = await client.createOrder({
      tokenID    : tokenId,
      price,
      side       : Side.BUY,
      size       : shares,
      // feeRateBps omitted — CLOB client auto-resolves the market's required fee rate
    });

    logger.info('placeOrderByToken: posting order', {
      tokenId: tokenId.slice(0, 16) + '...',
      price: price.toFixed(4),
      shares,
      sizeUsd,
      orderType: orderType === OrderType.GTC ? 'GTC_LIMIT' : 'FOK_MARKET',
    });

    const resp    = await client.postOrder(order, orderType);

    logger.info('placeOrderByToken: raw API response', {
      response: JSON.stringify(resp).slice(0, 600),
    });

    const orderId = resp?.orderID || resp?.order_id || null;

    if (!orderId) {
      logger.warn('placeOrderByToken: no orderId — order rejected', {
        tokenId: tokenId.slice(0, 16),
        errorMsg: resp?.errorMsg || resp?.error || resp?.message || 'none',
        status: resp?.status,
        response: JSON.stringify(resp).slice(0, 600),
      });
      return null;
    }

    // Derive actual fill price from response amounts if available
    let entryPrice = price;
    const making = parseFloat(resp?.makingAmount || '0');
    const taking  = parseFloat(resp?.takingAmount || '0');
    if (making > 0 && taking > 0) entryPrice = making / taking;

    // usdcCost = actual USDC deducted (used by t1000-engine as entry.position).
    // Prefer makingAmount from fill response; fall back to shares × price.
    const usdcCost = making > 0
      ? making
      : parseFloat((shares * price).toFixed(2));

    logger.info('placeOrderByToken: order placed successfully', {
      orderId,
      entryPrice: entryPrice.toFixed(4),
      shares,
      usdcCost,
      sizeUsd,
      makingAmount: resp?.makingAmount,
      takingAmount: resp?.takingAmount,
      status: resp?.status,
    });
    return { orderId, entryPrice, orderLimitPrice: price, shares: usdcCost, obi };
  } catch (err) {
    logger.error('placeOrderByToken error', {
      tokenId: tokenId?.slice(0, 16),
      error: err.message,
      responseData: err.response ? JSON.stringify(err.response.data).slice(0, 600) : 'no response body',
      stack: err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : undefined,
    });
    return null;
  }
}

// Cancel an open order by order ID
async function cancelOrder(orderId) {
  try {
    const client = buildClient();
    await client.cancelOrder({ orderID: orderId });
    logger.info('Order cancelled', { orderId });
    return true;
  } catch (err) {
    logger.error('cancelOrder error', { orderId, error: err.message });
    return false;
  }
}

// Sell / exit a position via FOK limit-sell with slippage tolerance.
// sizeUsd and entryPrice come from our DB record and are used to derive shares held.
// Returns the actual exit price or null on failure.
async function exitPosition(marketId, outcome, tokenId, sizeUsd, entryPrice) {
  if (!tokenId) {
    const tokens = await getTokenIds(marketId);
    tokenId = outcome === 'YES' ? tokens.yes : tokens.no;
  }
  if (!tokenId) return null;

  // Shares held = USDC originally spent / price paid per share
  const sharesHeld = (entryPrice > 0)
    ? Math.round((sizeUsd / entryPrice) * 100) / 100
    : Math.round(sizeUsd * 100) / 100; // fallback if no entry price recorded

  if (sharesHeld <= 0) {
    logger.info('exitPosition: nothing to sell', { marketId, outcome });
    return { price: 0 };
  }

  try {
    const client = buildClient();

    // Get current best bid price for selling
    let currentPrice = null;
    try {
      const book = await client.getOrderBook(tokenId);
      const bids = book?.bids || [];
      if (bids.length) {
        currentPrice = parseFloat(bids[0].price);
      }
    } catch (_) {}

    // Calculate min price with slippage tolerance (for selling, we accept lower prices)
    const slippagePct = parseFloat(process.env.SLIPPAGE_TOLERANCE || '3');
    const minPrice = currentPrice
      ? Math.max(0.01, currentPrice * (1 - slippagePct / 100)) // Accept up to X% worse price
      : 0.01; // Fallback: sell at any price above 1 cent

    logger.info('Exiting position with slippage tolerance', {
      marketId,
      outcome,
      sharesHeld,
      currentPrice,
      minPrice,
      slippagePct
    });

    // FOK limit order — fills immediately at minPrice or better, or cancels
    const order = await client.createOrder({
      tokenID:   tokenId,
      price:     minPrice,
      side:      Side.SELL,
      size:      sharesHeld,
      // feeRateBps omitted — CLOB client auto-resolves the market's required fee rate
    });

    const resp = await client.postOrder(order, OrderType.FOK);

    // Derive actual exit price from response
    let exitPrice = minPrice;
    const making = parseFloat(resp?.makingAmount || '0');
    const taking  = parseFloat(resp?.takingAmount || '0');
    if (making > 0 && taking > 0) {
      exitPrice = making / taking;
    }

    logger.info('Position exited', {
      marketId,
      outcome,
      sharesHeld,
      exitPrice,
      currentPrice,
      minPrice
    });
    return { price: exitPrice };
  } catch (err) {
    logger.error('exitPosition error', {
      marketId,
      outcome,
      error: err.message,
      errorDetails: err.response ? JSON.stringify(err.response.data).slice(0, 500) : 'No response data',
      stack: err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : undefined
    });
    return null;
  }
}

// Fetch the best ask price for an outcome token (no auth needed — public order book).
// Returns the price as a 0–1 decimal, or null if the order book is empty or unreachable.
async function getCurrentPrice(marketId, outcome) {
  try {
    const tokens  = await getTokenIds(marketId);
    const tokenId = outcome === 'YES' ? tokens.yes : tokens.no;
    if (!tokenId) return null;
    const client = buildClient();
    const book   = await client.getOrderBook(tokenId);
    const asks   = book?.asks || [];
    if (!asks.length) return null;
    return parseFloat(asks[0].price);
  } catch (err) {
    logger.warn('getCurrentPrice error', { marketId, outcome, error: err.message });
    return null;
  }
}

/**
 * Redeem winning conditional tokens back to native USDC in the EOA wallet.
 *
 * Polymarket binary markets use the CTF Exchange redeemPositions():
 *   indexSets = [2] when YES wins (direction=UP)
 *   indexSets = [1] when NO  wins (direction=DOWN)
 *
 * Gas cost: ~80k–120k gas ≈ 0.015 POL ≈ $0.005 — negligible.
 *
 * @param {string} crypto       - 'BTC', 'ETH', 'SOL', 'XRP'
 * @param {number} cycleStart   - cycle start timestamp ms (used to reconstruct market slug)
 * @param {boolean} is15m       - true for 15-min market, false for 5-min
 * @param {string} direction    - 'UP' (won YES) or 'DOWN' (won NO)
 * @returns {{ txHash, usdcReceived } | null}
 */
async function redeemWinningPosition(crypto, cycleStart, is15m, direction, signerOverride = null) {
  try {
    const dur  = is15m ? '15m' : '5m';
    const slug = `${crypto.toLowerCase()}-updown-${dur}-${Math.floor(cycleStart / 1000)}`;

    // 1. Fetch conditionId from Gamma API using market slug
    logger.info('[polymarket] redeemWinningPosition: fetching conditionId', { slug });
    const gammaRes = await axios.get('https://gamma-api.polymarket.com/markets', {
      params: { slug }, timeout: 10000,
    });
    const markets = Array.isArray(gammaRes.data) ? gammaRes.data : [];
    if (!markets.length) {
      logger.warn('[polymarket] redeemWinningPosition: market not found in Gamma', { slug });
      return null;
    }
    const market = markets[0];

    if (!market.closed) {
      logger.warn('[polymarket] redeemWinningPosition: market not yet closed', { slug, closed: market.closed });
      return null;
    }
    const conditionId = market.conditionId;
    if (!conditionId) {
      logger.warn('[polymarket] redeemWinningPosition: no conditionId in market data', { slug });
      return null;
    }

    // 2. Check on-chain payoutNumerators — bypass Gamma API outcome delay.
    //    Polymarket UP/DOWN market slots: index 0 = UP token, index 1 = DOWN token
    //    Returns null if not resolved yet, 'LOSS' if oracle says we lost.
    // One RPC URL per redemption operation — round-robin across 5 Infura keys.
    const provider   = new ethers.providers.JsonRpcProvider(infuraRpc.nextRpcUrl());
    const ctfRead    = new ethers.Contract(CTF_CONTRACT, CTF_ABI, provider);
    let payoutUp, payoutDown;
    try {
      [payoutUp, payoutDown] = await Promise.all([
        ctfRead.payoutNumerators(conditionId, 0),  // index 0 = UP token
        ctfRead.payoutNumerators(conditionId, 1),  // index 1 = DOWN token
      ]);
    } catch (e) {
      logger.warn('[polymarket] redeemWinningPosition: payoutNumerators call failed, falling back to Gamma outcome', { error: e.message });
      payoutUp = payoutDown = null;
    }

    if (payoutUp !== null && payoutDown !== null) {
      const resolved = payoutUp.gt(0) || payoutDown.gt(0);
      if (!resolved) {
        logger.warn('[polymarket] redeemWinningPosition: on-chain not resolved yet', { slug });
        return null;
      }
      const oracleWonUp = payoutUp.gt(0); // true = UP won, false = DOWN won
      const weWonUp     = direction === 'UP';
      if (oracleWonUp !== weWonUp) {
        logger.warn('[polymarket] redeemWinningPosition: oracle says we LOST — Chainlink disagrees with Binance', {
          slug, ourDirection: direction, oracleResult: oracleWonUp ? 'UP' : 'DOWN',
        });
        return 'LOSS'; // signal to engine to correct the activityLog entry
      }
      logger.info('[polymarket] redeemWinningPosition: on-chain confirmed WIN', { slug, direction });
    } else {
      // Fallback: use Gamma API outcome field
      const outcome = (market.outcome || '').toLowerCase();
      if (!outcome) {
        logger.warn('[polymarket] redeemWinningPosition: no on-chain data and no Gamma outcome yet', { slug });
        return null;
      }
      const expectedOutcome = direction === 'UP' ? 'up' : 'down';
      if (outcome !== expectedOutcome) {
        logger.warn('[polymarket] redeemWinningPosition: Gamma outcome mismatch', { slug, direction, outcome });
        return 'LOSS';
      }
    }

    // 3. Build signer (no pre-tx balance read needed — we parse Transfer events from receipt)
    const signer     = signerOverride ?? buildSigner();
    const eoaAddress = await signer.getAddress();
    const signerWithProvider = signer.connect(provider);

    // 4. Call ConditionalTokens.redeemPositions
    //    indexSets bitmask: UP token is slot 0 → bitmask 0b01 = [1]
    //                       DOWN token is slot 1 → bitmask 0b10 = [2]
    const indexSets = direction === 'UP' ? [1] : [2];
    const ctf = new ethers.Contract(CTF_CONTRACT, CTF_ABI, signerWithProvider);

    // 4a. Guard: check CTF token balance BEFORE sending a TX.
    //     If balance is 0, tokens were already claimed by a prior TX.  Returning { alreadyRedeemed }
    //     lets the engine credit the correct USDC without sending a duplicate TX.
    //
    //     IMPORTANT: DO NOT compute collectionId / positionId locally using keccak256.
    //     The Polymarket CTF contract uses an internal formula that differs from the naive
    //     keccak256(conditionId, indexSet) — local computation produces the wrong tokenId,
    //     causing balanceOf to return 0 even when tokens exist in the EOA.
    //     Always use the on-chain CTF.getCollectionId / CTF.getPositionId view functions.
    //
    //     Polymarket markets may use EITHER USDC.e (0x2791) or native USDC (0x3c499c) as
    //     CTF collateral — try USDC.e first (more common), then native USDC as fallback.
    let collateralToken = USDC_ADDRESS; // default USDC.e; overridden if native USDC market
    try {
      // Ask the CTF contract to compute the correct collectionId for this condition + indexSet
      const collectionId = await ctfRead.getCollectionId(
        ethers.constants.HashZero,  // parentCollectionId = bytes32(0)
        conditionId,
        indexSets[0],
      );
      // Check USDC.e (most common collateral)
      const positionIdUsdce = await ctfRead.getPositionId(USDC_ADDRESS, collectionId);
      const balUsdce = await ctfRead.balanceOf(eoaAddress, positionIdUsdce);
      if (!balUsdce.isZero()) {
        collateralToken = USDC_ADDRESS;
        logger.info('[polymarket] redeemWinningPosition: token balance > 0 (USDC.e)', { slug, balance: balUsdce.toString() });
      } else {
        // Fallback: native USDC (newer markets)
        const positionIdNative = await ctfRead.getPositionId(NATIVE_USDC_ADDRESS, collectionId);
        const balNative = await ctfRead.balanceOf(eoaAddress, positionIdNative);
        if (!balNative.isZero()) {
          collateralToken = NATIVE_USDC_ADDRESS;
          logger.info('[polymarket] redeemWinningPosition: token balance > 0 (native USDC)', { slug, balance: balNative.toString() });
        } else {
          // Token balance 0 for both collateral types — a prior TX already claimed the USDC.
          // Scan CTF PayoutRedemption events so the engine can record the exact on-chain payout
          // instead of reconstructing it from the formula (position / entryPrice), which can be
          // off by ~$0.10 due to rounding and FOK fill price vs limit price differences.
          logger.warn('[polymarket] redeemWinningPosition: token balance 0 for both USDC.e and native USDC — scanning PayoutRedemption events for prior TX payout', { slug });
          let priorUsdcReceived = null;
          try {
            const PAYOUT_TOPIC   = ethers.utils.id('PayoutRedemption(address,address,bytes32,bytes32,uint256[],uint256)');
            const paddedRedeemer = ethers.utils.hexZeroPad(eoaAddress, 32).toLowerCase();
            const currentBlock   = await provider.getBlockNumber();
            const fromBlock      = Math.max(0, currentBlock - 7200); // ~4 hours on Polygon (2s blocks)
            const logs = await provider.getLogs({
              address: CTF_CONTRACT,
              topics:  [PAYOUT_TOPIC, paddedRedeemer],
              fromBlock,
              toBlock: 'latest',
            });
            const abiCoder = new ethers.utils.AbiCoder();
            for (const log of logs) {
              // data layout: bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 payout
              const [, logConditionId, , payout] = abiCoder.decode(
                ['bytes32', 'bytes32', 'uint256[]', 'uint256'], log.data,
              );
              if (logConditionId.toLowerCase() !== conditionId.toLowerCase()) continue;
              priorUsdcReceived = parseFloat(ethers.utils.formatUnits(payout, 6));
              logger.info('[polymarket] redeemWinningPosition: found prior PayoutRedemption event', {
                slug, priorUsdcReceived, txHash: log.transactionHash,
              });
              break;
            }
            if (priorUsdcReceived === null) {
              logger.warn('[polymarket] redeemWinningPosition: PayoutRedemption scan found no matching event (may be >4h old or different redeemer)', { slug });
            }
          } catch (scanErr) {
            logger.warn('[polymarket] redeemWinningPosition: PayoutRedemption scan failed (non-fatal)', { error: scanErr.message });
          }
          return { alreadyRedeemed: true, usdcReceived: priorUsdcReceived };
        }
      }
    } catch (balErr) {
      // Balance check failed (RPC issue).  Skip this attempt — do NOT proceed with TX.
      // If we proceeded with the wrong collateralToken (e.g. a native-USDC market but we
      // default to USDC.e), the CTF TX would revert → usdcReceived=0 → false WIN→LOSS.
      // Engine will retry next minute; 120 attempts gives >2h to recover from RPC flakiness.
      logger.warn('[polymarket] redeemWinningPosition: balanceOf check failed — skipping attempt, will retry', { error: balErr.message });
      return null;
    }

    logger.info('[polymarket] redeemWinningPosition: sending tx', {
      slug, conditionId, direction, indexSets, eoaAddress, collateralToken,
    });

    const feeData = await provider.getFeeData();
    const minTip  = ethers.utils.parseUnits('30', 'gwei');
    const tip     = feeData.maxPriorityFeePerGas?.gt(minTip) ? feeData.maxPriorityFeePerGas : minTip;
    const base    = feeData.lastBaseFeePerGas ?? ethers.utils.parseUnits('120', 'gwei');
    const maxFee  = base.mul(2).add(tip);
    // Fetch nonce with 'latest' — Infura returns -32603 on 'pending', causing ctf.redeemPositions()
    // to throw before a TX hash is obtained.  Providing the nonce explicitly bypasses the internal
    // eth_getTransactionCount('pending') call that ethers.js would otherwise make.
    const nonce   = await signerWithProvider.getTransactionCount('latest');

    const tx = await ctf.redeemPositions(
      collateralToken,
      ethers.constants.HashZero,  // parentCollectionId = bytes32(0)
      conditionId,
      indexSets,
      { maxPriorityFeePerGas: tip, maxFeePerGas: maxFee, nonce },
    );

    logger.info('[polymarket] redeemWinningPosition: tx sent, waiting for confirmation', { txHash: tx.hash });
    // Retry tx.wait() up to 6× (×5 s) to handle transient Infura RPC errors (-32603 precondition failure).
    // If still unavailable after all retries, return { pendingTxHash } so the engine can re-check
    // next interval without sending a second TX.
    let receipt = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        receipt = await tx.wait();
        break; // confirmed
      } catch (waitErr) {
        if (attempt < 6) {
          logger.warn(`[polymarket] tx.wait() attempt ${attempt}/6 failed — retrying in 5s`, { txHash: tx.hash, error: waitErr.message });
          await new Promise(r => setTimeout(r, 5000));
        } else {
          logger.warn('[polymarket] tx.wait() failed after 6 attempts — returning pendingTxHash', { txHash: tx.hash, error: waitErr.message });
          return { pendingTxHash: tx.hash };
        }
      }
    }

    // 5. Parse USDC Transfer events from the receipt — reliable even with concurrent redemptions.
    //    Balance-delta approach was unreliable: other simultaneous redemptions completing at the
    //    same ms caused the RPC to return a stale "latest" balance, producing 0 delta and
    //    a false WIN→LOSS correction. Parsing the Transfer log is definitive and atomic.
    //    Filter on collateralToken (resolved above) — the CTF emits Transfer on the collateral
    //    token contract (native USDC or USDC.e depending on when the market was created).
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const eoaLower = eoaAddress.toLowerCase();
    let usdcReceived = 0;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== collateralToken.toLowerCase()) continue;
      if (log.topics[0] !== TRANSFER_TOPIC) continue;
      if (log.topics.length < 3) continue;
      // topics[2] = to address (padded to 32 bytes); last 20 bytes = recipient
      const to = '0x' + log.topics[2].slice(-40);
      if (to.toLowerCase() !== eoaLower) continue;
      usdcReceived += parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(log.data), 6));
    }

    logger.info('[polymarket] redeemWinningPosition: SUCCESS', {
      slug, txHash: receipt.transactionHash,
      gasUsed: receipt.gasUsed?.toString(),
      usdcReceived: usdcReceived.toFixed(4),
    });

    return { txHash: receipt.transactionHash, usdcReceived };

  } catch (err) {
    logger.error('[polymarket] redeemWinningPosition error', {
      error: err.message,
      responseData: err.response ? JSON.stringify(err.response.data).slice(0, 300) : undefined,
    });
    return null;
  }
}

// Check whether a previously-sent redemption TX has now confirmed.
// Returns { txHash, usdcReceived } on success, or null if still pending / not found.
// Used by the engine when redeemWinningPosition() returned { pendingTxHash } due to a
// transient RPC error — avoids sending a duplicate TX on the next redemption interval.
async function checkTxReceipt(txHash) {
  try {
    const provider = new ethers.providers.JsonRpcProvider(infuraRpc.nextRpcUrl());
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      logger.info('[polymarket] checkTxReceipt: still pending', { txHash });
      return null;
    }
    const signer    = buildSigner();
    const eoaAddress = await signer.getAddress();
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const eoaLower = eoaAddress.toLowerCase();
    // Accept Transfer events from either USDC.e or native USDC — we don't know which
    // collateral the original market used, so match both.
    const USDC_ADDRESSES_LC = new Set([USDC_ADDRESS.toLowerCase(), NATIVE_USDC_ADDRESS.toLowerCase()]);
    let usdcReceived = 0;
    for (const log of receipt.logs) {
      if (!USDC_ADDRESSES_LC.has(log.address.toLowerCase())) continue;
      if (log.topics[0] !== TRANSFER_TOPIC) continue;
      if (log.topics.length < 3) continue;
      const to = '0x' + log.topics[2].slice(-40);
      if (to.toLowerCase() !== eoaLower) continue;
      usdcReceived += parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(log.data), 6));
    }
    logger.info('[polymarket] checkTxReceipt: confirmed', { txHash, usdcReceived: usdcReceived.toFixed(4) });
    return { txHash: receipt.transactionHash, usdcReceived };
  } catch (err) {
    logger.warn('[polymarket] checkTxReceipt error', { txHash, error: err.message });
    return null;
  }
}

// Refresh the CLOB server's cached USDC.e balance (pre-flight allowance check).
// Called on a 30s timer from t1000-engine — never on the trading hot path.
async function refreshClobAllowanceCache() {
  try {
    const client = buildClient();
    await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  } catch (_) { /* non-fatal */ }
}

/**
 * Factory for per-wallet Polymarket CLOB clients.
 * Used by wallet-manager.js to create clients for wallets defined in wallets.json.
 *
 * @param {{ signerKey: string, apiKey: string, apiSecret: string, apiPassphrase: string }} creds
 * @returns {{ placeOrderByToken, getBalance, getEoaAddress }}
 */
function createWalletClient(creds) {
  const signer     = _buildSignerFrom(creds.signerKey);
  const eoaAddress = signer.address;

  function _buildWalletClobClient() {
    return new ClobClient(HOST, CHAIN_ID, signer, {
      key: creds.apiKey, secret: creds.apiSecret, passphrase: creds.apiPassphrase,
    });
  }

  return {
    getEoaAddress: () => eoaAddress,

    async getBalance() {
      const liquidBalance = await getOnChainUsdcBalance(eoaAddress);
      if (liquidBalance === null) return null;
      return { liquid: liquidBalance, unredeemed: 0, total: liquidBalance };
    },

    async placeOrderByToken(tokenId, sizeUsd, limitPrice = null) {
      if (!tokenId) {
        logger.warn('[polymarket] createWalletClient.placeOrderByToken: no tokenId');
        return null;
      }
      try {
        const client = _buildWalletClobClient();
        let price;
        let orderType;
        let obi = null;
        if (limitPrice != null) {
          price     = limitPrice;
          orderType = OrderType.GTC;
        } else {
          const book = await client.getOrderBook(tokenId);
          const asks = book?.asks || [];
          if (!asks.length) {
            logger.warn('[polymarket] createWalletClient.placeOrderByToken: no liquidity', { tokenId: tokenId.slice(0, 16) });
            return null;
          }
          const _bids2   = book?.bids || [];
          const _bidVol2 = _bids2.reduce((s, b) => s + (parseFloat(b.size) || 0), 0);
          const _askVol2 = asks.reduce((s, a) => s + (parseFloat(a.size) || 0), 0);
          const _den2    = _bidVol2 + _askVol2;
          obi = _den2 > 0 ? parseFloat(((_bidVol2 - _askVol2) / _den2).toFixed(4)) : 0;
          const bestAsk     = parseFloat(asks[0].price);
          const slippagePct = parseFloat(process.env.SLIPPAGE_TOLERANCE || '3');
          price     = Math.min(0.96, Math.round(bestAsk * (1 + slippagePct / 100) * 100) / 100);
          orderType = OrderType.FOK;
        }
        const shares = validShares(sizeUsd, price, 1.0);
        if (shares <= 0) {
          logger.warn('[polymarket] createWalletClient.placeOrderByToken: budget too small', { sizeUsd, price });
          return null;
        }
        const projectedCost = parseFloat((shares * price).toFixed(2));
        if (projectedCost > sizeUsd * 1.3) {
          logger.warn('[polymarket] createWalletClient.placeOrderByToken: overspend >30%, skipping', { sizeUsd, price, shares, projectedCost });
          return null;
        }
        const order = await client.createOrder({ tokenID: tokenId, price, side: Side.BUY, size: shares });
        const resp  = await client.postOrder(order, orderType);
        const orderId = resp?.orderID || resp?.order_id || null;
        if (!orderId) {
          logger.warn('[polymarket] createWalletClient.placeOrderByToken: no orderId', {
            tokenId: tokenId.slice(0, 16), errorMsg: resp?.errorMsg || resp?.error || 'none',
          });
          return null;
        }
        let entryPrice = price;
        const making = parseFloat(resp?.makingAmount || '0');
        const taking  = parseFloat(resp?.takingAmount || '0');
        if (making > 0 && taking > 0) entryPrice = making / taking;
        const usdcCost = making > 0 ? making : parseFloat((shares * price).toFixed(2));
        logger.info('[polymarket] createWalletClient.placeOrderByToken: placed', {
          eoaAddress, orderId, entryPrice: entryPrice.toFixed(4), usdcCost,
        });
        return { orderId, entryPrice, orderLimitPrice: price, shares: usdcCost, obi };
      } catch (err) {
        logger.error('[polymarket] createWalletClient.placeOrderByToken error', {
          eoaAddress, tokenId: tokenId?.slice(0, 16), error: err.message,
        });
        return null;
      }
    },
    redeemWinningPosition: (crypto, cycleStart, is15m, direction) =>
      redeemWinningPosition(crypto, cycleStart, is15m, direction, signer),
  };
}

module.exports = { getBalance, getTokenIds, getCurrentPrice, placeOrder, placeOrderByToken, cancelOrder, exitPosition, redeemWinningPosition, checkTxReceipt, refreshClobAllowanceCache, getEoaAddress, createWalletClient };
