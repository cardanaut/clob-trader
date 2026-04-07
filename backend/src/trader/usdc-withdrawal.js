'use strict';

/**
 * Auto USDC.e salary withdrawal.
 *
 * Periodically transfers surplus above balanceTarget to a destination wallet,
 * capped at withdrawalLimit per transaction.
 *
 * Config: backend/config/withdrawal.json (not committed to git).
 */

const { ethers } = require('@polymarket/order-utils/node_modules/ethers');
const infuraRpc   = require('../utils/infura-rpc');
const crypto      = require('crypto');
const fs          = require('fs');
const path        = require('path');
const logger      = require('../utils/logger');

const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e on Polygon
const USDC_ABI     = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];
const CONFIG_PATH   = path.join(__dirname, '../../config/withdrawal.json');
const WALLETS_PATH  = path.join(__dirname, '../../config/wallets.json');
const SIGNER_KEY    = process.env.POLY_SIGNER_KEY;

// ─── PIN verification ─────────────────────────────────────────────────────────
// Hash of PIN "2791" with static salt — computed once: sha256('polychamp_wd_v1:2791')
// PIN is never stored in plaintext; only its hash is used for comparison.
const _PIN_SALT    = 'polychamp_wd_v1:';
const _PIN_HASH    = 'df7013d3932254ea08c60f88e896be58e5b21c32bffc46f8226759de94d7b222';

function verifyPin(pin) {
  if (typeof pin !== 'string' || pin.length === 0) return false;
  const h = crypto.createHash('sha256').update(_PIN_SALT + pin).digest('hex');
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(_PIN_HASH, 'hex'));
}

// ─── Destination wallet validation ───────────────────────────────────────────
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead';

function isValidDestination(wallet) {
  if (!wallet || typeof wallet !== 'string') return false;
  if (!ethers.utils.isAddress(wallet)) return false;
  const lower = wallet.toLowerCase();
  if (lower === ZERO_ADDRESS) return false;
  if (lower === DEAD_ADDRESS) return false;
  return true;
}

// ─── Config helpers ───────────────────────────────────────────────────────────
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {
      enabled: false,
      destinationWallet: '',
      balanceTarget: 3000,
      withdrawalLimit: 300,
      minWithdrawal: 50,
      cooldownHours: 4,
      lastWithdrawalAt: null,
      totalWithdrawn: 0,
      withdrawalCount: 0,
      withdrawalHistory: [],
    };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── Signer ───────────────────────────────────────────────────────────────────
function buildSignerWithProvider(keyOverride = null) {
  const rawKey = keyOverride || SIGNER_KEY;
  if (!rawKey) throw new Error('No signer key available');
  const key = rawKey.trim();
  let keyHex;
  if (/^0x[0-9a-fA-F]{64}$/.test(key)) {
    keyHex = key;
  } else if (/^[0-9a-fA-F]{64}$/.test(key)) {
    keyHex = '0x' + key;
  } else {
    const standardB64 = key.replace(/-/g, '+').replace(/_/g, '/');
    keyHex = '0x' + Buffer.from(standardB64, 'base64').toString('hex');
  }
  const provider = new ethers.providers.JsonRpcProvider(infuraRpc.nextRpcUrl());
  return new ethers.Wallet(keyHex, provider);
}

// ─── Core withdrawal logic ───────────────────────────────────────────────────
async function checkAndWithdraw() {
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.destinationWallet) {
    return { skipped: 'disabled or no wallet' };
  }

  // Destination wallet safety check (always, including auto-runs)
  if (!isValidDestination(cfg.destinationWallet)) {
    logger.error('[withdrawal] Invalid or dangerous destination wallet — aborting', { wallet: cfg.destinationWallet });
    return { skipped: 'invalid destination wallet' };
  }

  // Cooldown check
  if (cfg.lastWithdrawalAt) {
    const elapsed = (Date.now() - new Date(cfg.lastWithdrawalAt).getTime()) / 3600000;
    if (elapsed < cfg.cooldownHours) {
      const remaining = (cfg.cooldownHours - elapsed).toFixed(1);
      return { skipped: `cooldown (${remaining}h remaining)` };
    }
  }

  const signer  = buildSignerWithProvider();
  const address = await signer.getAddress();
  const usdc    = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer.provider);
  const raw     = await usdc.balanceOf(address);
  const balance = parseFloat(ethers.utils.formatUnits(raw, 6));

  if (balance <= cfg.balanceTarget) {
    return { skipped: `balance $${balance.toFixed(2)} ≤ target $${cfg.balanceTarget}` };
  }

  const surplus = balance - cfg.balanceTarget;
  const amount  = Math.min(surplus, cfg.withdrawalLimit);
  if (amount < cfg.minWithdrawal) {
    return { skipped: `amount $${amount.toFixed(2)} < min $${cfg.minWithdrawal}` };
  }

  // Final destination re-check immediately before sending
  if (!isValidDestination(cfg.destinationWallet)) {
    throw new Error('Destination wallet failed final safety check');
  }

  // Execute transfer
  const usdcWithSigner = usdc.connect(signer);
  const amountWei      = ethers.utils.parseUnits(amount.toFixed(6), 6);
  logger.info(`[withdrawal] Sending $${amount.toFixed(2)} USDC.e → ${cfg.destinationWallet}`);
  // Infura returns -32603 on eth_getTransactionCount('pending') for this EOA.
  // Fetch nonce with 'latest' explicitly so ethers.js skips the internal pending call.
  const nonce    = await signer.getTransactionCount('latest');
  // Fetch current network fee data; floor tip at 30 gwei (Polygon minimum is 25 gwei).
  const feeData  = await signer.provider.getFeeData();
  const MIN_TIP  = ethers.utils.parseUnits('30', 'gwei');
  const tip      = feeData.maxPriorityFeePerGas?.gt(MIN_TIP) ? feeData.maxPriorityFeePerGas : MIN_TIP;
  const maxFee   = feeData.maxFeePerGas
    ? feeData.maxFeePerGas.mul(2)
    : ethers.utils.parseUnits('300', 'gwei');
  const tx      = await usdcWithSigner.transfer(cfg.destinationWallet, amountWei, { nonce, maxPriorityFeePerGas: tip, maxFeePerGas: maxFee });
  logger.info(`[withdrawal] TX sent ${tx.hash} — waiting for confirmation`);
  const receipt = await tx.wait();

  const now = new Date().toISOString();
  cfg.lastWithdrawalAt   = now;
  cfg.totalWithdrawn     = parseFloat(((cfg.totalWithdrawn || 0) + amount).toFixed(6));
  cfg.withdrawalCount    = (cfg.withdrawalCount || 0) + 1;
  cfg.withdrawalHistory  = cfg.withdrawalHistory || [];
  cfg.withdrawalHistory.unshift({
    at:          now,
    amount:      parseFloat(amount.toFixed(6)),
    destination: cfg.destinationWallet,
    txHash:      receipt.transactionHash,
  });
  // Keep at most 100 entries
  if (cfg.withdrawalHistory.length > 100) cfg.withdrawalHistory.length = 100;
  saveConfig(cfg);

  logger.info(`[withdrawal] Done. TxHash: ${receipt.transactionHash}`);
  return { executed: true, amount, txHash: receipt.transactionHash, balanceBefore: balance };
}

// ─── Per-wallet withdrawal (for extra bots) ──────────────────────────────────
// Uses per-wallet cooldown tracked in cfg.wallets[walletId].lastWithdrawalAt.
// All extra wallets send to the same destinationWallet as the default bot.
async function checkAndWithdrawForKey(walletId, signerKey) {
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.destinationWallet) return { skipped: 'disabled or no wallet' };
  if (!isValidDestination(cfg.destinationWallet)) return { skipped: 'invalid destination wallet' };

  // Per-wallet cooldown
  const walletState = (cfg.wallets ?? {})[walletId] ?? {};
  if (walletState.lastWithdrawalAt) {
    const elapsed = (Date.now() - new Date(walletState.lastWithdrawalAt).getTime()) / 3600000;
    if (elapsed < cfg.cooldownHours) {
      const remaining = (cfg.cooldownHours - elapsed).toFixed(1);
      return { skipped: `${walletId} cooldown (${remaining}h remaining)` };
    }
  }

  const signer  = buildSignerWithProvider(signerKey);
  const address = await signer.getAddress();
  const usdc    = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer.provider);
  const raw     = await usdc.balanceOf(address);
  const balance = parseFloat(ethers.utils.formatUnits(raw, 6));

  if (balance <= cfg.balanceTarget) {
    return { skipped: `${walletId} balance $${balance.toFixed(2)} ≤ target $${cfg.balanceTarget}` };
  }

  const surplus = balance - cfg.balanceTarget;
  const amount  = Math.min(surplus, cfg.withdrawalLimit);
  if (amount < cfg.minWithdrawal) {
    return { skipped: `${walletId} amount $${amount.toFixed(2)} < min $${cfg.minWithdrawal}` };
  }

  if (!isValidDestination(cfg.destinationWallet)) throw new Error('Destination wallet failed final safety check');

  const usdcWithSigner = usdc.connect(signer);
  const amountWei      = ethers.utils.parseUnits(amount.toFixed(6), 6);
  logger.info(`[withdrawal] ${walletId}: Sending $${amount.toFixed(2)} USDC.e → ${cfg.destinationWallet}`);
  const nonce   = await signer.getTransactionCount('latest');
  const feeData = await signer.provider.getFeeData();
  const MIN_TIP = ethers.utils.parseUnits('30', 'gwei');
  const tip     = feeData.maxPriorityFeePerGas?.gt(MIN_TIP) ? feeData.maxPriorityFeePerGas : MIN_TIP;
  const maxFee  = feeData.maxFeePerGas ? feeData.maxFeePerGas.mul(2) : ethers.utils.parseUnits('300', 'gwei');
  const tx      = await usdcWithSigner.transfer(cfg.destinationWallet, amountWei, { nonce, maxPriorityFeePerGas: tip, maxFeePerGas: maxFee });
  logger.info(`[withdrawal] ${walletId}: TX sent ${tx.hash}`);
  const receipt = await tx.wait();

  const now = new Date().toISOString();
  if (!cfg.wallets) cfg.wallets = {};
  if (!cfg.wallets[walletId]) cfg.wallets[walletId] = { lastWithdrawalAt: null, totalWithdrawn: 0, withdrawalCount: 0 };
  cfg.wallets[walletId].lastWithdrawalAt = now;
  cfg.wallets[walletId].totalWithdrawn   = parseFloat(((cfg.wallets[walletId].totalWithdrawn || 0) + amount).toFixed(6));
  cfg.wallets[walletId].withdrawalCount  = (cfg.wallets[walletId].withdrawalCount || 0) + 1;
  cfg.withdrawalHistory = cfg.withdrawalHistory || [];
  cfg.withdrawalHistory.unshift({ at: now, amount: parseFloat(amount.toFixed(6)), walletId, destination: cfg.destinationWallet, txHash: receipt.transactionHash });
  if (cfg.withdrawalHistory.length > 100) cfg.withdrawalHistory.length = 100;
  saveConfig(cfg);

  logger.info(`[withdrawal] ${walletId}: Done. TxHash: ${receipt.transactionHash}`);
  return { executed: true, amount, txHash: receipt.transactionHash, walletId, balanceBefore: balance };
}

// ─── Check all wallets (default + all enabled extra wallets) ─────────────────
async function checkAndWithdrawAll() {
  const results = {};
  results.default = await checkAndWithdraw().catch(e => ({ error: e.message }));

  if (!fs.existsSync(WALLETS_PATH)) return results;
  let wallets;
  try { wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8')); } catch { return results; }
  for (const w of wallets) {
    if (!w.enabled || !w.id || !w.signerKey) continue;
    results[w.id] = await checkAndWithdrawForKey(w.id, w.signerKey).catch(e => ({ error: e.message }));
  }
  return results;
}

let _intervalId = null;

function startAutoWithdrawal() {
  const cfg = loadConfig();
  const intervalMs = Math.max((cfg.cooldownHours || 4), 1) * 3600000;

  // Run an immediate check 15s after startup so a surplus isn't stuck waiting
  // for the first interval tick (which could be hours away after a restart).
  if (cfg.enabled) {
    setTimeout(async () => {
      try {
        const results = await checkAndWithdrawAll();
        for (const [wid, r] of Object.entries(results)) {
          if (r.executed) logger.info(`[withdrawal] Startup check (${wid}): completed`, { amount: r.amount, txHash: r.txHash });
          else if (r.error) logger.error(`[withdrawal] Startup check (${wid}): error`, { error: r.error });
          else logger.info(`[withdrawal] Startup check (${wid}): skipped`, { reason: r.skipped });
        }
      } catch (e) {
        logger.error('[withdrawal] Startup check error', { error: e.message });
      }
    }, 15_000);
  }

  _intervalId = setInterval(async () => {
    const c = loadConfig();
    if (!c.enabled) return;
    try {
      const results = await checkAndWithdrawAll();
      for (const [wid, r] of Object.entries(results)) {
        if (r.executed) logger.info(`[withdrawal] Auto-withdrawal (${wid}) completed`, { amount: r.amount, txHash: r.txHash });
        else if (r.error) logger.error(`[withdrawal] Auto check (${wid}) error`, { error: r.error });
      }
    } catch (e) {
      logger.error('[withdrawal] Auto check error', { error: e.message });
    }
  }, intervalMs);
  logger.info(`[withdrawal] Auto-check interval: every ${cfg.cooldownHours}h (all wallets)`);
}

module.exports = { loadConfig, saveConfig, checkAndWithdraw, checkAndWithdrawForKey, checkAndWithdrawAll, startAutoWithdrawal, verifyPin, isValidDestination };
