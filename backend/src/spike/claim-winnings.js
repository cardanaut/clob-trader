/**
 * Automated Winnings Claim System
 *
 * Automatically redeems winning positions from resolved markets by interacting
 * with the Conditional Tokens Framework (CTF) smart contract on Polygon.
 *
 * How it works:
 * 1. Tracks all active positions from our trades
 * 2. Checks if markets have resolved
 * 3. Calls redeemPositions() on CTF contract to claim winnings
 * 4. Winning tokens pay out $1.00 USDC.e each
 * 5. Burns both winning and losing tokens automatically
 */

'use strict';

const { ethers } = require('ethers');
const logger = require('../utils/logger');
const config = require('./config');

// CTF Contract on Polygon
const CTF_CONTRACT_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_COLLATERAL = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Minimal ABI for redeemPositions function
const CTF_ABI = [
  {
    type: 'function',
    name: 'redeemPositions',
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'indexSets', type: 'uint256[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  }
];

// Track positions awaiting claim
const pendingClaims = new Map(); // conditionId -> { marketData, resolvedAt }
const claimedConditions = new Set(); // Prevent duplicate claims

let provider = null;
let wallet = null;
let ctfContract = null;

/**
 * Initialize claim system with wallet
 */
function initialize() {
  if (!config.LIVE_TRADING.PRIVATE_KEY) {
    throw new Error('LIVE_TRADING.PRIVATE_KEY not configured');
  }

  // Use Polygon RPC (same network as our trades)
  provider = new ethers.JsonRpcProvider(config.LIVE_TRADING.POLYGON_RPC_URL);
  wallet = new ethers.Wallet(config.LIVE_TRADING.PRIVATE_KEY, provider);
  ctfContract = new ethers.Contract(CTF_CONTRACT_ADDRESS, CTF_ABI, wallet);

  logger.info('[claim-winnings] Initialized', {
    wallet: wallet.address,
    ctfContract: CTF_CONTRACT_ADDRESS
  });

  return wallet.address;
}

/**
 * Register a position for tracking (called after placing order)
 */
function registerPosition(conditionId, marketData) {
  if (!conditionId || !marketData) {
    logger.warn('[claim-winnings] Cannot register position - missing data');
    return;
  }

  pendingClaims.set(conditionId, {
    conditionId,
    marketSlug: marketData.slug,
    question: marketData.question,
    endDate: marketData.endDate,
    registeredAt: Date.now()
  });

  logger.info('[claim-winnings] Position registered', {
    conditionId: conditionId.substring(0, 16) + '...',
    slug: marketData.slug
  });
}

/**
 * Mark market as resolved (called when we detect resolution)
 */
function markResolved(conditionId) {
  const claim = pendingClaims.get(conditionId);
  if (!claim) {
    return; // Market not tracked
  }

  if (!claim.resolvedAt) {
    claim.resolvedAt = Date.now();
    pendingClaims.set(conditionId, claim);

    logger.info('[claim-winnings] Market resolved - ready to claim', {
      conditionId: conditionId.substring(0, 16) + '...',
      slug: claim.marketSlug
    });
  }
}

/**
 * Claim winnings from a single resolved market
 */
async function claimMarket(conditionId) {
  // Check if already claimed
  if (claimedConditions.has(conditionId)) {
    logger.debug('[claim-winnings] Already claimed', {
      conditionId: conditionId.substring(0, 16) + '...'
    });
    return { success: false, reason: 'already_claimed' };
  }

  const claim = pendingClaims.get(conditionId);
  if (!claim) {
    return { success: false, reason: 'not_tracked' };
  }

  if (!claim.resolvedAt) {
    return { success: false, reason: 'not_resolved' };
  }

  try {
    logger.info('[claim-winnings] 🎯 Claiming winnings', {
      conditionId: conditionId.substring(0, 16) + '...',
      slug: claim.marketSlug,
      question: claim.question
    });

    // Call redeemPositions on CTF contract
    const tx = await ctfContract.redeemPositions(
      USDC_COLLATERAL,                    // collateralToken (USDC.e)
      ethers.ZeroHash,                    // parentCollectionId (0x000...000 for binary markets)
      conditionId,                        // conditionId
      [1, 2]                              // indexSets (both YES and NO outcomes)
    );

    logger.info('[claim-winnings] Transaction submitted', {
      txHash: tx.hash,
      conditionId: conditionId.substring(0, 16) + '...'
    });

    // Wait for confirmation
    const receipt = await tx.wait();

    logger.info('[claim-winnings] ✅ WINNINGS CLAIMED!', {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      slug: claim.marketSlug
    });

    // Mark as claimed
    claimedConditions.add(conditionId);
    pendingClaims.delete(conditionId);

    return {
      success: true,
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    };

  } catch (error) {
    // Check for common errors
    if (error.message.includes('no balance')) {
      logger.warn('[claim-winnings] No tokens to claim', {
        conditionId: conditionId.substring(0, 16) + '...',
        slug: claim.marketSlug
      });
      // Mark as claimed to avoid retrying
      claimedConditions.add(conditionId);
      pendingClaims.delete(conditionId);
      return { success: false, reason: 'no_balance' };
    }

    logger.error('[claim-winnings] Claim failed', {
      conditionId: conditionId.substring(0, 16) + '...',
      error: error.message,
      code: error.code
    });

    return {
      success: false,
      reason: 'error',
      error: error.message
    };
  }
}

/**
 * Process all pending claims (called periodically)
 */
async function processAllClaims() {
  if (!ctfContract) {
    logger.warn('[claim-winnings] Not initialized');
    return { processed: 0, claimed: 0, errors: 0 };
  }

  const resolved = Array.from(pendingClaims.values()).filter(c => c.resolvedAt);

  if (resolved.length === 0) {
    return { processed: 0, claimed: 0, errors: 0 };
  }

  logger.info('[claim-winnings] 💰 Processing claims', {
    total: resolved.length,
    markets: resolved.map(c => c.marketSlug)
  });

  let claimed = 0;
  let errors = 0;

  for (const claim of resolved) {
    const result = await claimMarket(claim.conditionId);

    if (result.success) {
      claimed++;
    } else if (result.reason === 'error') {
      errors++;
    }

    // Wait 2 seconds between claims to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  logger.info('[claim-winnings] Claim batch complete', {
    processed: resolved.length,
    claimed,
    errors,
    remaining: pendingClaims.size
  });

  return { processed: resolved.length, claimed, errors };
}

/**
 * Get claim status summary
 */
function getStatus() {
  const pending = Array.from(pendingClaims.values());
  const awaitingResolution = pending.filter(c => !c.resolvedAt).length;
  const readyToClaim = pending.filter(c => c.resolvedAt).length;

  return {
    totalTracked: pending.length,
    awaitingResolution,
    readyToClaim,
    totalClaimed: claimedConditions.size
  };
}

module.exports = {
  initialize,
  registerPosition,
  markResolved,
  claimMarket,
  processAllClaims,
  getStatus
};
