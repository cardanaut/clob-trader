// ── CLOB Trader — Withdrawal routes ──
'use strict';

const { ethers } = require('@polymarket/order-utils/node_modules/ethers');

module.exports = function registerWithdrawalRoutes(app, { authMiddleware, withdrawal }) {

// ─── Withdrawal routes ────────────────────────────────────────────────────────

// PIN rate limiter — max 1 attempt per second per IP (in-memory)
const _wdPinLastAttempt = new Map();
function wdPinRateLimit(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const last = _wdPinLastAttempt.get(ip) || 0;
  if (now - last < 1000) {
    return res.status(429).json({ error: 'Rate limited — wait 1 second between attempts' });
  }
  _wdPinLastAttempt.set(ip, now);
  next();
}

// Inline PIN check middleware — verifies req.body.pin before mutating withdrawal state
function wdPinCheck(req, res, next) {
  const { pin } = req.body || {};
  if (!withdrawal.verifyPin(String(pin ?? ''))) {
    return res.status(403).json({ error: 'Incorrect PIN' });
  }
  next();
}

// GET /withdrawal/wallet — returns the full unmasked destination wallet (auth required)
app.get('/withdrawal/wallet', authMiddleware, (req, res) => {
  const cfg = withdrawal.loadConfig();
  res.json({ destinationWallet: cfg.destinationWallet || '' });
});

// GET /withdrawal/history — full history with wallet + txHash (auth required)
app.get('/withdrawal/history', authMiddleware, (req, res) => {
  const cfg = withdrawal.loadConfig();
  res.json({
    totalWithdrawn:  cfg.totalWithdrawn  || 0,
    withdrawalCount: cfg.withdrawalCount || 0,
    history:         cfg.withdrawalHistory || [],
  });
});

// GET /withdrawal/config — returns config with masked wallet (full wallet never sent to client)
app.get('/withdrawal/config', (req, res) => {
  const cfg = withdrawal.loadConfig();
  const masked = cfg.destinationWallet
    ? cfg.destinationWallet.slice(0, 6) + '…' + cfg.destinationWallet.slice(-4)
    : '';
  // Omit destinationWallet (full) and withdrawalHistory (contains wallets+txHashes)
  const { destinationWallet: _omit, withdrawalHistory: _hist, ...rest } = cfg;
  res.json({ ...rest, destinationWalletMasked: masked });
});

// POST /withdrawal/config — update config fields (requires PIN + basic auth)
app.post('/withdrawal/config', authMiddleware, wdPinRateLimit, wdPinCheck, (req, res) => {
  const { destinationWallet, balanceTarget, withdrawalLimit, minWithdrawal, cooldownHours, enabled } = req.body;
  const cfg = withdrawal.loadConfig();
  if (destinationWallet !== undefined) {
    // Validate address format
    if (!ethers.utils.isAddress(destinationWallet)) {
      return res.status(400).json({ error: 'Invalid Ethereum address format' });
    }
    // Reject zero / dead addresses
    if (!withdrawal.isValidDestination(destinationWallet)) {
      return res.status(400).json({ error: 'Cannot use zero or dead wallet address as destination' });
    }
    cfg.destinationWallet = destinationWallet;
  }
  if (balanceTarget   !== undefined) cfg.balanceTarget   = Math.max(0,   parseFloat(balanceTarget));
  if (withdrawalLimit !== undefined) cfg.withdrawalLimit = Math.max(1,   parseFloat(withdrawalLimit));
  if (minWithdrawal   !== undefined) cfg.minWithdrawal   = Math.max(1,   parseFloat(minWithdrawal));
  if (cooldownHours   !== undefined) cfg.cooldownHours   = Math.max(0.5, parseFloat(cooldownHours));
  if (enabled         !== undefined) cfg.enabled         = Boolean(enabled);
  withdrawal.saveConfig(cfg);
  res.json({ ok: true });
});

// POST /withdrawal/check — manual trigger (requires PIN + basic auth)
app.post('/withdrawal/check', authMiddleware, wdPinRateLimit, wdPinCheck, async (req, res) => {
  try {
    res.json(await withdrawal.checkAndWithdraw());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

};
