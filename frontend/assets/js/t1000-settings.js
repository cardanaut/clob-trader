// ── CLOB Trader — Settings: withdrawal config, PIN modal ──

// ─── Salary / Auto-Withdrawal ────────────────────────────────────────────────

async function loadWithdrawalConfig() {
  const cfg = await apiFetch('/withdrawal/config');
  if (!cfg) return;
  // Keep checkbox in sync (do not fight user who just toggled it)
  const enabledCb = document.getElementById('wd-enabled');
  if (enabledCb) enabledCb.checked = !!cfg.enabled;
  // Populate config form fields
  const tgt = document.getElementById('wd-target');
  const lim = document.getElementById('wd-limit');
  const mn  = document.getElementById('wd-min');
  const cd  = document.getElementById('wd-cooldown');
  if (tgt) tgt.value = cfg.balanceTarget  ?? 3000;
  if (lim) lim.value = cfg.withdrawalLimit ?? 300;
  if (mn)  mn.value  = cfg.minWithdrawal   ?? 50;
  if (cd)  cd.value  = cfg.cooldownHours   ?? 4;
  // Build summary line
  const sumEl = document.getElementById('wd-summary');
  if (sumEl) {
    const walletPart = cfg.destinationWalletMasked
      ? `→ <span style="color:#63b3ed;font-family:monospace;">${cfg.destinationWalletMasked}</span>`
      : '<span style="color:#4a5568;">no wallet set</span>';
    const lastPart = cfg.lastWithdrawalAt
      ? `last: <strong style="color:#68d391;">${new Date(cfg.lastWithdrawalAt).toLocaleDateString()}</strong>`
      : '<span style="color:#4a5568;">never run</span>';
    const statusPart = cfg.enabled
      ? `<span style="color:#68d391;font-weight:600;">enabled</span>`
      : `<span style="color:#718096;">disabled</span>`;
    sumEl.innerHTML = `${walletPart} &nbsp;·&nbsp; target <strong>$${cfg.balanceTarget}</strong>, limit <strong>$${cfg.withdrawalLimit}/tx</strong>, cooldown <strong>${cfg.cooldownHours}h</strong> &nbsp;·&nbsp; ${lastPart} &nbsp;·&nbsp; ${statusPart}`;
  }
  // wallet hint hidden — full wallet pre-populated in input when config form opens

  // Update balance-row salary stat
  const count = cfg.withdrawalCount || 0;
  const total = cfg.totalWithdrawn  || 0;
  const wrap  = document.getElementById('wd-stat-wrap');
  if (wrap) {
    wrap.style.display = 'block';
    const tot = document.getElementById('wd-stat-total');
    const cnt = document.getElementById('wd-stat-count');
    if (tot) tot.textContent = count > 0 ? '$' + total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '—';
    if (cnt) cnt.textContent = count > 0 ? count + '\u00D7' : '';
  }
}

async function withdrawalShowConfig() {
  const form = document.getElementById('withdrawal-config-form');
  if (!form) return;
  const opening = form.style.display === 'none';
  form.style.display = opening ? 'block' : 'none';
  if (!opening) return;
  // Fetch full wallet and pre-populate the input when opening
  try {
    const res = await fetch(API_BASE + '/withdrawal/wallet', {
      headers: { 'Authorization': _API_AUTH || '' },
    });
    if (res.ok) {
      const data = await res.json();
      const walletEl = document.getElementById('wd-wallet');
      if (walletEl && data.destinationWallet) walletEl.value = data.destinationWallet;
    }
  } catch (_) {}
}

// ─── Withdrawal history popup ─────────────────────────────────────────────────

async function openWithdrawalHistory() {
  const modal = document.getElementById('wd-history-modal');
  if (!modal) return;
  modal.classList.add('open');

  const tbody   = document.getElementById('wd-hist-tbody');
  const summary = document.getElementById('wd-hist-summary');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#718096;">Loading…</td></tr>';

  try {
    const res = await fetch(API_BASE + '/withdrawal/history', {
      headers: { 'Authorization': _API_AUTH || '' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if (summary) {
      const tot = (data.totalWithdrawn || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      summary.textContent = `${data.withdrawalCount || 0} withdrawal${data.withdrawalCount !== 1 ? 's' : ''} · total $${tot} USDC.e`;
    }

    if (!data.history || data.history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#4a5568;">No withdrawals yet</td></tr>';
      return;
    }

    tbody.innerHTML = data.history.map(h => {
      // Format datetime in EAT (UTC+3)
      const dt  = new Date(h.at);
      const eat = dt.toLocaleString('en-GB', {
        timeZone: 'Africa/Nairobi',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      });
      const amt  = '$' + (h.amount || 0).toFixed(2);
      // Short wallet with tooltip showing full
      const shortWallet = h.destination
        ? `<span title="${h.destination}" style="font-family:monospace;cursor:default;">${h.destination.slice(0,8)}…${h.destination.slice(-6)}</span>`
        : '—';
      // TX hash link to Polygonscan
      const txLink = h.txHash
        ? `<a class="wd-tx-link" href="https://polygonscan.com/tx/${h.txHash}" target="_blank" rel="noopener"
             title="${h.txHash}">${h.txHash.slice(0,10)}…${h.txHash.slice(-6)}&nbsp;↗</a>`
        : '—';
      return `<tr>
        <td style="white-space:nowrap;color:#a0aec0;">${eat}</td>
        <td style="text-align:right;color:#68d391;font-weight:700;">${amt}</td>
        <td>${shortWallet}</td>
        <td>${txLink}</td>
      </tr>`;
    }).join('');

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:#fc8181;">Error: ${e.message}</td></tr>`;
  }
}

function closeWithdrawalHistory() {
  document.getElementById('wd-history-modal')?.classList.remove('open');
}

// Close history modal on backdrop click
document.addEventListener('click', function(e) {
  const modal = document.getElementById('wd-history-modal');
  if (modal && e.target === modal) closeWithdrawalHistory();
});

// Toggle Auto: snapshot previous state so we can revert checkbox on cancel/wrong PIN
function withdrawalToggleEnabled() {
  const cb      = document.getElementById('wd-enabled');
  const enabled = cb.checked;
  // Revert checkbox immediately — PIN success will flip it properly via loadWithdrawalConfig
  cb.checked = !enabled;
  openPinModal(async (pin) => {
    const r = await apiFetch('/withdrawal/config', 'POST', { enabled, pin });
    if (!r || r.error) { pinShowError(r?.error || 'Save failed'); return; }
    closePinModal();
    await loadWithdrawalConfig();
  });
}

function withdrawalSaveConfig() {
  const wallet   = (document.getElementById('wd-wallet')?.value   || '').trim();
  const target   = document.getElementById('wd-target')?.value;
  const limit    = document.getElementById('wd-limit')?.value;
  const minAmt   = document.getElementById('wd-min')?.value;
  const cooldown = document.getElementById('wd-cooldown')?.value;

  // Client-side wallet validation before even opening the PIN modal
  if (wallet) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      alert('Invalid Ethereum address format (must be 0x + 40 hex chars)'); return;
    }
    if (wallet.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
        wallet.toLowerCase() === '0x000000000000000000000000000000000000dead') {
      alert('Cannot use zero or dead wallet as destination'); return;
    }
  }

  openPinModal(async (pin) => {
    const body = { pin };
    if (wallet)   body.destinationWallet = wallet;
    if (target)   body.balanceTarget     = parseFloat(target);
    if (limit)    body.withdrawalLimit   = parseFloat(limit);
    if (minAmt)   body.minWithdrawal     = parseFloat(minAmt);
    if (cooldown) body.cooldownHours     = parseFloat(cooldown);

    const r = await apiFetch('/withdrawal/config', 'POST', body);
    if (!r || r.error) { pinShowError(r?.error || 'Save failed'); return; }
    closePinModal();
    document.getElementById('withdrawal-config-form').style.display = 'none';
    if (wallet) document.getElementById('wd-wallet').value = '';
    await loadWithdrawalConfig();
  });
}

function withdrawalCheckNow() {
  openPinModal(async (pin) => {
    const r = await apiFetch('/withdrawal/check', 'POST', { pin });
    if (!r) { pinShowError('Request failed'); return; }
    if (r.error && r.error !== 'skipped') { pinShowError(r.error); return; }
    closePinModal();
    if (r.executed) {
      alert('Sent $' + r.amount.toFixed(2) + ' USDC.e\nTx: ' + r.txHash);
    } else if (r.skipped) {
      alert('Skipped: ' + r.skipped);
    }
    await loadWithdrawalConfig();
  });
}

// ─── PIN modal logic ──────────────────────────────────────────────────────────

let _pinBuffer       = [];   // entered digits (max 4)
let _pinCallback     = null; // function(pin) called on success
let _pinLocked       = false; // true while submitting or waiting 1s rate-limit
let _pinRateLimitUntil = 0;

// Noise chars for scramble — no digits to avoid hint about entered digit
const _PIN_NOISE = '@#!$%&*?~^+=-ABCDEFXZabcdefxz';

function openPinModal(callback) {
  _pinBuffer   = [];
  _pinCallback = callback;
  _pinLocked   = false;
  document.getElementById('wd-pin-display').textContent = '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF';
  document.getElementById('wd-pin-display').style.color = '#e2e8f0';
  document.getElementById('wd-pin-msg').textContent = '';
  document.getElementById('wd-pin-dialog').style.animation = 'none';
  const modal = document.getElementById('wd-pin-modal');
  modal.classList.add('open');
  setPinBtnsDisabled(false);
}

function closePinModal() {
  document.getElementById('wd-pin-modal').classList.remove('open');
  _pinBuffer   = [];
  _pinCallback = null;
  _pinLocked   = false;
}

function pinShowError(msg) {
  document.getElementById('wd-pin-msg').textContent = msg;
  const dialog = document.getElementById('wd-pin-dialog');
  // Trigger shake: force reflow to restart animation
  dialog.style.animation = 'none';
  // eslint-disable-next-line no-unused-expressions
  dialog.offsetHeight;
  dialog.style.animation = 'pinShake 0.42s ease';
  // Rate-limit: lock buttons for 1s
  _pinLocked = true;
  setPinBtnsDisabled(true);
  _pinRateLimitUntil = Date.now() + 1000;
  setTimeout(() => {
    _pinBuffer   = [];
    _pinLocked   = false;
    document.getElementById('wd-pin-display').textContent = '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF';
    document.getElementById('wd-pin-display').style.color = '#e2e8f0';
    setPinBtnsDisabled(false);
  }, 1000);
}

function pinDigit(d) {
  if (_pinLocked) return;
  if (Date.now() < _pinRateLimitUntil) return;
  if (_pinBuffer.length >= 4) return; // PIN is exactly 4 digits
  _pinBuffer.push(d);
  _pinScramble();
  // Auto-submit at 4 digits after scramble animation completes
  if (_pinBuffer.length === 4) {
    _pinLocked = true;
    setPinBtnsDisabled(true);
    setTimeout(_pinSubmit, 200);
  }
}

function pinBackspace() {
  if (_pinLocked) return;
  if (_pinBuffer.length > 0) { _pinBuffer.pop(); _pinScramble(); }
}

function pinClear() {
  if (_pinLocked) return;
  _pinBuffer = [];
  document.getElementById('wd-pin-display').textContent = '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF';
  document.getElementById('wd-pin-display').style.color = '#e2e8f0';
  document.getElementById('wd-pin-msg').textContent = '';
}

function _pinScramble() {
  // Three-phase animation — always shows 8 characters, never reveals digit or count
  const disp = document.getElementById('wd-pin-display');
  const rndChar = () => _PIN_NOISE[Math.floor(Math.random() * _PIN_NOISE.length)];
  // Phase 1 (0ms): full random noise, blue tint
  disp.style.color = '#63b3ed';
  disp.textContent = Array.from({length: 8}, rndChar).join('');
  // Phase 2 (90ms): half settled back to bullets, half still noise
  setTimeout(() => {
    disp.style.color = '#a0aec0';
    disp.textContent = Array.from({length: 8}, (_, i) => (i % 2 === 0 ? '\u25CF' : rndChar())).join('');
  }, 90);
  // Phase 3 (175ms): all bullets, normal colour
  setTimeout(() => {
    disp.style.color = '#e2e8f0';
    disp.textContent = '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF';
  }, 175);
}

async function _pinSubmit() {
  if (!_pinCallback) { closePinModal(); return; }
  const pin = _pinBuffer.join('');
  await _pinCallback(pin);
  // If callback did NOT close the modal (e.g. wrong PIN handled via pinShowError),
  // ensure lock state is handled — pinShowError sets _pinLocked and resets after 1s
}

function setPinBtnsDisabled(disabled) {
  document.querySelectorAll('.pin-btn').forEach(b => { b.disabled = disabled; });
}

// Keyboard support for PIN modal
document.addEventListener('keydown', function(e) {
  if (!document.getElementById('wd-pin-modal').classList.contains('open')) return;
  if (e.key >= '0' && e.key <= '9') { e.preventDefault(); pinDigit(e.key); }
  else if (e.key === 'Backspace')   { e.preventDefault(); pinBackspace(); }
  else if (e.key === 'Escape')      { e.preventDefault(); closePinModal(); }
  else if (e.key === 'Delete')      { e.preventDefault(); pinClear(); }
});

// Load withdrawal config on page load
(function() {
  function tryLoadWithdrawal() {
    if (document.getElementById('wd-summary')) loadWithdrawalConfig();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryLoadWithdrawal);
  } else {
    tryLoadWithdrawal();
  }
})();
