// ── CLOB Trader — Core: globals, tab management, config, renderState ──

const API_BASE = 'https://jeer.currenciary.com/clob-api';
const STRAT_KEYS = ['LIVE', 'LIVE_KALSHI', 'LIVE_MINI', 'C95', 'C90', 'C85', 'C80', 'C75', 'C70', 'C65', 'C60', 'C55', 'C50',
                    'C255', 'C240', 'C225', 'C210', 'C195', 'C180', 'C165', 'C150'];
// Map from stratKey → tabKey (for badge tracking)
const KEY_TO_TAB = { 'LIVE': 'POLYMARKET', 'LIVE_KALSHI': 'KALSHI', 'LIVE_MINI': 'MINI' };
let currentTab    = 'POLYMARKET';
let currentLiveTab  = 'POLYMARKET';
let currentPaperTab = 'C85';
let currentSection  = 'LIVE';
let state = {};
let livePrices = {};  // { BTC: { up, down, up_bid, down_bid, updatedAt }, ... }
let liveFillPending = { '5m': false, '15m': false };
let setupDirty = false; // true once user edits any SETUP field; blocks poll overwrites
let miniDirty  = false; // true once user edits any MINI config field; blocks poll overwrites
let lastLiveEoa        = null; // tracks last seen EOA for LIVE
let lastLiveRedeemable = null; // tracks last seen redeemable for LIVE
let lastLiveLocked     = null; // tracks last seen locked for LIVE

// ── Frontend polymarket URL builder ───────────────────────────────────────────
const POLY_SLUG_FE = {
  BTC: { 5: 'btc-updown-5m',  15: 'btc-updown-15m' },
  ETH: { 5: 'eth-updown-5m',  15: 'eth-updown-15m' },
  SOL: { 5: 'sol-updown-5m',  15: 'sol-updown-15m' },
  XRP: { 5: 'xrp-updown-5m',  15: 'xrp-updown-15m' },
};
function polyUrlFE(crypto, cycleStartMs, candleSize) {
  const dur  = candleSize >= 150 ? 15 : 5;
  const slug = POLY_SLUG_FE[crypto]?.[dur];
  return slug ? `https://polymarket.com/event/${slug}-${Math.round(cycleStartMs / 1000)}` : null;
}

// ── New-item badge tracking ───────────────────────────────────────────────────
const unreadCount  = Object.fromEntries(STRAT_KEYS.map(k => [k, 0]));
const prevLogCount = Object.fromEntries(STRAT_KEYS.map(k => [k, 0]));

function countVisible(log) {
  return log.filter(e =>
    e.status !== 'SKIP' &&
    e.status !== 'OPEN'
  ).length;
}

function updateTabBadge(key) {
  const el = document.getElementById(`new-badge-${key}`);
  if (!el) return;
  if (unreadCount[key] > 0) {
    el.textContent = unreadCount[key];
    el.style.display = 'inline-block';
  } else {
    el.style.display = 'none';
  }
}

// ── Section switching (LIVE / PAPER) ─────────────────────────────────────────
function switchSection(section) {
  currentSection = section;
  document.querySelectorAll('.section-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.section === section)
  );
  document.getElementById('live-subtabs').style.display  = section === 'LIVE'  ? '' : 'none';
  document.getElementById('paper-subtabs').style.display = section === 'PAPER' ? '' : 'none';
  if (section === 'LIVE') {
    switchTab(currentLiveTab || 'POLYMARKET');
  } else {
    switchTab(currentPaperTab || 'C85');
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  // Track last active tab per section
  if (['POLYMARKET', 'KALSHI', 'MINI', 'STATS', 'SETUP'].includes(tab)) currentLiveTab  = tab;
  else                                                                      currentPaperTab = tab;

  currentTab = tab;
  document.querySelectorAll('.t1000-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.t1000-panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${tab}`);
  });
  // Clear badge for this tab — use KEY_TO_TAB reverse lookup
  const stratKey = Object.keys(KEY_TO_TAB).find(k => KEY_TO_TAB[k] === tab) || tab;
  unreadCount[stratKey] = 0;
  updateTabBadge(stratKey);
  // Lazy-load Signal Stats on first visit
  if (tab === 'STATS') {
    initStatsRange();
    const sbody = document.getElementById('signal-stats-body');
    if (sbody && sbody.querySelector('[onclick="loadSignalStats()"]')) loadSignalStats();
  }
}

// ── Log sub-tab switching ─────────────────────────────────────────────────────
function switchLogTab(tab) {
  const tabs = ['recent', 'rejected', 'allTrades', 'trioperf'];
  for (const t of tabs) {
    const btn     = document.getElementById(`ltab-btn-${t}`);
    const content = document.getElementById(`ltab-${t}`);
    if (btn)     btn.classList.toggle('active', t === tab);
    if (content) content.style.display = t === tab ? '' : 'none';
  }
  // Auto-load All Trades on first visit
  if (tab === 'allTrades') {
    const body = document.getElementById('all-trades-body');
    if (body && body.querySelector('[onclick="loadAllTrades(1)"]')) loadAllTrades(1);
  }
  // Refresh rejected stats when switching to that tab
  if (tab === 'rejected') renderRejectedStats();
  // Render trio performance when switching to that tab
  if (tab === 'trioperf') renderTrioPerf();
}

function renderTrioPerf() {
  const body = document.getElementById('trio-perf-body');
  if (!body) return;

  // Combine LIVE + MINI activity logs; optionally limit to last N resolved trades
  const limitEl  = document.getElementById('trio-perf-limit');
  const limitVal = limitEl ? parseInt(limitEl.value) : 200;
  const limit    = (!limitEl?.value?.trim() || isNaN(limitVal) || limitVal <= 0) ? Infinity : limitVal;
  const liveLog  = (state['LIVE']?.activityLog || []);
  const miniLog  = (state['LIVE_MINI']?.activityLog || []).map(e => ({...e, _isMini: true}));
  const resolved = [...liveLog, ...miniLog]
    .filter(e => e.status === 'WIN' || e.status === 'LOSS')
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, limit);

  if (!resolved.length) {
    body.innerHTML = '<div style="color:#718096;padding:20px;text-align:center;">No resolved trades yet</div>';
    return;
  }

  // Group by source (LIVE/MINI) + crypto + candle_size
  // Also track the most-recently-used threshold for each group
  const groups = {};
  for (const e of resolved) {
    const cs = parseInt(e.candle_size);
    if (!cs || !e.crypto) continue;
    const src  = e._isMini ? 'MINI' : 'LIVE';
    const gkey = `${src}_${e.crypto}_${cs}`;
    if (!groups[gkey]) groups[gkey] = { src, crypto: e.crypto, cs, wins: 0, losses: 0, upWins: 0, upLosses: 0, downWins: 0, downLosses: 0, threshold: null };
    const isWin = e.status === 'WIN';
    if (isWin) groups[gkey].wins++;
    else groups[gkey].losses++;
    if (e.direction === 'UP') { if (isWin) groups[gkey].upWins++; else groups[gkey].upLosses++; }
    else if (e.direction === 'DOWN') { if (isWin) groups[gkey].downWins++; else groups[gkey].downLosses++; }
    // Capture threshold from the most recent trade that has it
    if (groups[gkey].threshold == null && e.threshold != null)
      groups[gkey].threshold = parseFloat(e.threshold);
  }

  // Get currently configured trio periods from LIVE state
  const liveCfg = state['LIVE'] || {};
  const isActivePeriod = (crypto, cs) => {
    const is15m = cs >= 150;
    const key   = is15m ? `strategy15m_${crypto}` : `strategy5m_${crypto}`;
    const val   = liveCfg[key];
    return val === `C${cs}` || val === cs || String(val) === String(cs);
  };

  // Sort: best WR% first within each group (with min-sample weighting)
  // Groups with <3 trades go to bottom; ties broken by total desc then crypto order
  const cryptoOrder = ['BTC', 'ETH', 'SOL', 'XRP'];
  const sorted = Object.values(groups).sort((a, b) => {
    const aTot = a.wins + a.losses, bTot = b.wins + b.losses;
    const aLow = aTot < 3, bLow = bTot < 3;
    if (aLow !== bLow) return aLow ? 1 : -1;           // low-sample rows last
    const aWr = aTot > 0 ? a.wins / aTot : 0;
    const bWr = bTot > 0 ? b.wins / bTot : 0;
    if (Math.abs(bWr - aWr) > 0.001) return bWr - aWr; // higher WR first
    if (bTot !== aTot) return bTot - aTot;              // more trades first on tie
    const ci = cryptoOrder.indexOf(a.crypto) - cryptoOrder.indexOf(b.crypto);
    return ci !== 0 ? ci : a.cs - b.cs;
  });

  const cryptoColors = { BTC: '#f6ad55', ETH: '#63b3ed', SOL: '#b794f4', XRP: '#76e4f7' };
  const fs = '15.6px'; // 12px × 1.3 ≈ 15.6px
  const periodLabel = isFinite(limit) ? `last ${resolved.length}` : `all ${resolved.length}`;
  let html = `<div style="font-size:11px;color:#718096;margin-bottom:10px;">${periodLabel} resolved trades (LIVE + MINI) — ★ = active trio · best WR% first</div>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:${fs};">
    <thead><tr style="color:#718096;border-bottom:2px solid #2d3748;font-size:12px;">
      <th style="text-align:left;padding:6px 8px;font-weight:500;">Crypto</th>
      <th style="text-align:left;padding:6px 8px;font-weight:500;">Period</th>
      <th style="text-align:center;padding:6px 8px;font-weight:500;">TF</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;color:#68d391;">W</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;color:#fc8181;">L</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;">Total</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;">WR%</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;color:#68d391;border-left:1px solid #2d3748;">↑ UP</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;color:#fc8181;">↓ DOWN</th>
    </tr></thead><tbody>`;

  for (const g of sorted) {
    const is15m  = g.cs >= 150;
    const tf     = is15m ? '15m' : '5m';
    const total  = g.wins + g.losses;
    const wr     = total > 0 ? g.wins / total * 100 : 0;
    const active = isActivePeriod(g.crypto, g.cs);

    const wrColor  = wr >= 90 ? '#68d391' : wr >= 80 ? '#f6e05e' : wr >= 70 ? '#f6ad55' : '#fc8181';
    const rowStyle = active ? 'background:#1c2e1c;' : (total < 3 ? 'opacity:.55;' : '');
    const miniBadge = g.src === 'MINI' ? ' <span style="font-size:9px;color:#b794f4;background:#2d1f4e;padding:1px 4px;border-radius:2px;vertical-align:middle;">MINI</span>' : '';
    const starBadge = active ? ' <span style="color:#68d391;font-size:14px;line-height:1;" title="Active trio">★</span>' : '';
    const thStr = g.threshold != null ? `${g.threshold.toFixed(2)}%` : '—';

    const upTotal  = g.upWins + g.upLosses;
    const downTotal = g.downWins + g.downLosses;
    const upWr   = upTotal   > 0 ? g.upWins   / upTotal   * 100 : null;
    const downWr = downTotal > 0 ? g.downWins / downTotal * 100 : null;
    const dirCell = (w, l, wr) => {
      if (w + l === 0) return '<span style="color:#4a6080">—</span>';
      const wrColor2 = wr >= 90 ? '#68d391' : wr >= 80 ? '#f6e05e' : wr >= 70 ? '#f6ad55' : '#fc8181';
      return `<span style="color:#68d391">${w}W</span> <span style="color:#fc8181">${l}L</span> <span style="color:${wrColor2};font-weight:700">${wr.toFixed(0)}%</span>`;
    };
    html += `<tr style="${rowStyle}border-bottom:1px solid #1a202c;">
      <td style="padding:6px 8px;color:${cryptoColors[g.crypto]||'#e2e8f0'};font-weight:600;">${g.crypto}${miniBadge}${starBadge}</td>
      <td style="padding:6px 8px;color:#e2e8f0;font-family:monospace;font-weight:600;">C${g.cs}</td>
      <td style="padding:6px 8px;text-align:center;color:#a0aec0;">${tf}</td>
      <td style="padding:6px 8px;text-align:right;color:#68d391;font-weight:600;">${g.wins}</td>
      <td style="padding:6px 8px;text-align:right;color:#fc8181;font-weight:600;">${g.losses}</td>
      <td style="padding:6px 8px;text-align:right;color:#718096;">${total}</td>
      <td style="padding:6px 8px;text-align:right;color:${wrColor};font-weight:700;">${wr.toFixed(1)}%</td>
      <td style="padding:6px 8px;text-align:right;border-left:1px solid #1a202c;">${dirCell(g.upWins, g.upLosses, upWr)}</td>
      <td style="padding:6px 8px;text-align:right;">${dirCell(g.downWins, g.downLosses, downWr)}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  body.innerHTML = html;
}

function switchKalshiLogTab(tab) {
  const tabs = ['recent', 'allTrades'];
  for (const t of tabs) {
    const btn     = document.getElementById(`kltab-btn-${t}`);
    const content = document.getElementById(`kltab-${t}`);
    if (btn)     btn.classList.toggle('active', t === tab);
    if (content) content.style.display = t === tab ? '' : 'none';
  }
  // Auto-load All Trades on first visit
  if (tab === 'allTrades') {
    const body = document.getElementById('kalshi-all-trades-body');
    if (body && body.querySelector('[onclick="loadAllTradesKalshi(1)"]')) loadAllTradesKalshi(1);
  }
}

// ── Toggle enable/disable ─────────────────────────────────────────────────────
function toggleStrategy(key) {
  const chk     = document.getElementById(`toggle-${key}`);
  const enabled = chk.checked;

  // Password gate: only for LIVE keys (LIVE + LIVE_KALSHI + LIVE_MINI)
  if (key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI') {
    // Revert checkbox immediately — will re-apply after correct password
    chk.checked = !enabled;
    showLivePasswordModal(key, enabled);
    return;
  }

  apiFetch('/t1000/config', 'POST', { stratKey: key, enabled });
}

async function saveMiniConfig() {
  miniDirty = false;
  const maxPos  = parseInt(document.getElementById('mini-max-pos')?.value  || 2);
  const riskDiv = Math.max(1, parseInt(document.getElementById('mini-risk-divisor')?.value || 3));
  await apiFetch('/t1000/config', 'POST', {
    stratKey: 'LIVE_MINI', maxPositions: maxPos, riskDivisor: riskDiv,
  });
}

async function resetMiniBalance() {
  if (!confirm('Reset LIVE_MINI stats? Win/loss/PnL counters will be cleared.')) return;
  await apiFetch('/t1000/config', 'POST', {
    stratKey: 'LIVE_MINI',
    tradeListClearedAt: new Date().toISOString(),
  });
}

function showLivePasswordModal(key, wantEnabled) {
  const overlay = document.getElementById('liveAuthOverlay');
  const inp     = document.getElementById('liveAuthInput');
  const err     = document.getElementById('liveAuthError');
  const warn    = document.getElementById('liveAuthWarn');
  const label   = document.getElementById('liveAuthLabel');
  label.textContent = `${wantEnabled ? 'Enable' : 'Disable'} ${key === 'LIVE_KALSHI' ? 'Kalshi Live' : key === 'LIVE_MINI' ? 'Live Mini' : 'Live'} trading`;
  inp.value = '';
  err.style.display = 'none';

  // When disabling: warn if open positions exist — they will still be resolved
  if (!wantEnabled && key === 'LIVE') {
    const openTrades = (state.LIVE?.activityLog || []).filter(e => e.status === 'OPEN');
    if (openTrades.length > 0) {
      const names = openTrades.map(e => e.crypto).join(', ');
      warn.innerHTML = `&#x26A0;&#xFE0F; <b>${openTrades.length} open position${openTrades.length > 1 ? 's' : ''}</b> (${names}) will continue to be monitored and resolved automatically. Redemptions will also be processed. No new trades will be placed.`;
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }
  } else {
    warn.style.display = 'none';
  }

  overlay.style.display = 'flex';
  inp.focus();

  // Store pending action
  overlay._key         = key;
  overlay._wantEnabled = wantEnabled;
}

function liveAuthSubmit() {
  const overlay = document.getElementById('liveAuthOverlay');
  const inp     = document.getElementById('liveAuthInput');
  const err     = document.getElementById('liveAuthError');
  const pw      = inp.value;
  if (pw.trim().toLowerCase() !== 'janjy20142004197419722008') {
    err.style.display = 'block';
    inp.select();
    return;
  }
  overlay.style.display = 'none';
  // Generic callback path (save-settings password gate)
  if (overlay._callback) {
    const cb = overlay._callback;
    overlay._callback = null;
    cb();
    return;
  }
  // Default: toggle enable/disable for LIVE keys
  const key     = overlay._key;
  const enabled = overlay._wantEnabled;
  document.getElementById(`toggle-${key}`).checked = enabled;
  apiFetch('/t1000/config', 'POST', { stratKey: key, enabled });
}

function liveAuthCancel() {
  const overlay = document.getElementById('liveAuthOverlay');
  overlay._callback = null;
  overlay.style.display = 'none';
}

function requirePassword(cb, label) {
  const overlay = document.getElementById('liveAuthOverlay');
  const inp     = document.getElementById('liveAuthInput');
  const err     = document.getElementById('liveAuthError');
  document.getElementById('liveAuthLabel').textContent = label || 'Enter password to continue';
  document.getElementById('liveAuthWarn').style.display = 'none';
  inp.value = '';
  err.style.display = 'none';
  overlay._callback    = cb;
  overlay._key         = null;
  overlay._wantEnabled = null;
  overlay.style.display = 'flex';
  setTimeout(() => inp.focus(), 10);
}

// ── Save threshold + strategy ─────────────────────────────────────────────────
async function saveConfig(key, _authed = false) {
  if (key === 'LIVE' && !_authed) { requirePassword(() => saveConfig(key, true), 'Save LIVE configuration'); return; }
  let payload;

  if (key === 'LIVE') {
    // LIVE uses dual-duration params; no generic threshold/minPrice/maxPrice/maxTrade
    const thresh5m  = parseFloat(document.getElementById('live-thresh5m').value);
    const thresh15m = parseFloat(document.getElementById('live-thresh15m').value);
    if (isNaN(thresh5m) || thresh5m <= 0 || isNaN(thresh15m) || thresh15m <= 0) {
      alert('Invalid spike threshold'); return;
    }
    const mn5    = parseFloat(document.getElementById('live-minprice5m').value);
    const mx5    = parseFloat(document.getElementById('live-maxprice5m').value);
    const mxt1_5c = parseFloat(document.getElementById('live-mxt1-5m').value);
    const mt5    = parseFloat(document.getElementById('live-maxtrade5m').value);
    const mn15    = parseFloat(document.getElementById('live-minprice15m').value);
    const mx15    = parseFloat(document.getElementById('live-maxprice15m').value);
    const mxt1_15c = parseFloat(document.getElementById('live-mxt1-15m').value);
    const mxt1_st  = parseFloat(document.getElementById('live-mxt1-standalone').value);
    const mt15    = parseFloat(document.getElementById('live-maxtrade15m').value);
    if ([mn5, mx5, mxt1_5c, mt5, mn15, mx15, mxt1_15c, mt15].some(isNaN)) {
      alert('Invalid parameter value'); return;
    }
    const baseEoa  = parseFloat(document.getElementById('live-base-eoa')?.value);
    const riskPctV = parseFloat(document.getElementById('live-risk-pct')?.value);
    const maxPosV  = parseInt(document.getElementById('live-max-positions')?.value);
    const t1ModeV2  = document.getElementById('live-t1-mode')?.checked;
    payload = {
      stratKey       : 'LIVE',
      strategy5m     : document.getElementById('live-strategy5m').value,
      threshold5m    : thresh5m,
      minPrice5m     : mn5     / 100,
      maxPrice5m     : mx5     / 100,
      maxPriceT1_5m  : mxt1_5c / 100,
      maxTrade5m     : mt5,
      strategy15m    : document.getElementById('live-strategy15m').value,
      threshold15m   : thresh15m,
      minPrice15m    : mn15     / 100,
      maxPrice15m    : mx15     / 100,
      maxPriceT1_15m       : mxt1_15c / 100,
      maxPriceT1standalone : isNaN(mxt1_st) ? undefined : mxt1_st / 100,
      maxTrade15m          : mt15,
      ...(isNaN(baseEoa)  ? {} : { baseEoaBalance: baseEoa }),
      ...(isNaN(riskPctV) ? {} : { riskPct: riskPctV / 100 }),
      ...(isNaN(maxPosV) || maxPosV < 1 ? {} : { maxPositions: maxPosV }),
      ...(t1ModeV2  !== undefined ? { t1Mode: t1ModeV2 }         : {}),
      ...(document.getElementById('live-t1-standalone') !== null ? { t1standalone: document.getElementById('live-t1-standalone').checked } : {}),
      ...(document.getElementById('live-t0') !== null ? { t0off: !document.getElementById('live-t0').checked } : {}),
    };
    // Per-crypto thresholds + Cxx overrides for LIVE (5m and 15m)
    for (const el of document.querySelectorAll('#panel-SETUP .thresh-crypto-input[data-strat="LIVE"]')) {
      const cr = el.dataset.crypto, dur = el.dataset.dur;
      payload[`threshold${dur}_${cr}`] = el.value.trim() !== '' ? parseFloat(el.value) : null;
    }
    for (const el of document.querySelectorAll('#panel-SETUP .strat-crypto-select[data-strat="LIVE"]')) {
      const cr = el.dataset.crypto, dur = el.dataset.dur;
      payload[`strategy${dur}_${cr}`] = el.value || null;
    }
    // Threshold locks — build map of locked fields
    const lockedThresholds = {};
    document.querySelectorAll('#panel-SETUP .th-lock-btn[data-strat="LIVE"]').forEach(btn => {
      if (btn.dataset.locked === '1')
        lockedThresholds[`threshold${btn.dataset.dur}_${btn.dataset.crypto}`] = true;
    });
    payload.lockedThresholds = lockedThresholds;
  } else {
    const threshold = parseFloat(document.getElementById(`thresh-${key}`).value);
    if (isNaN(threshold) || threshold <= 0) {
      alert('Invalid threshold'); return;
    }
    const minPriceEl = document.querySelector(`#panel-${key} .minprice-input`);
    const minPriceCents = minPriceEl ? parseFloat(minPriceEl.value) : 5;
    if (isNaN(minPriceCents) || minPriceCents < 0 || minPriceCents > 99) {
      alert('Invalid min price (must be 0–99¢)'); return;
    }
    const maxPriceEl = document.querySelector(`#panel-${key} .maxprice-input`);
    const maxPriceCents = maxPriceEl ? parseFloat(maxPriceEl.value) : 90;
    if (isNaN(maxPriceCents) || maxPriceCents < 1 || maxPriceCents > 99) {
      alert('Invalid max price (must be 1–99¢)'); return;
    }
    const maxTradeEl = document.querySelector(`#panel-${key} .maxtrade-input`);
    const maxTrade = maxTradeEl ? parseFloat(maxTradeEl.value) : 150;
    if (isNaN(maxTrade) || maxTrade < 1) {
      alert('Invalid max trade size'); return;
    }
    payload = { stratKey: key, threshold, minPrice: minPriceCents / 100, maxPrice: maxPriceCents / 100, maxTrade };
    // Per-crypto thresholds for paper tabs
    for (const el of document.querySelectorAll(`#panel-${key} .thresh-crypto-input`)) {
      const cr = el.dataset.crypto;
      payload[`threshold_${cr}`] = el.value.trim() !== '' ? parseFloat(el.value) : null;
    }
  }

  const btn = document.querySelector(`#panel-${key} .btn-save`);
  const origLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const ok = await apiFetch('/t1000/config', 'POST', payload);
  if (key === 'LIVE') liveFillPending = { '5m': false, '15m': false };

  if (btn) {
    if (ok && !ok.error) {
      btn.textContent = '✅ Saved';
      btn.classList.add('saved');
      setTimeout(() => { btn.textContent = origLabel; btn.classList.remove('saved'); btn.disabled = false; }, 2000);
    } else {
      btn.textContent = '❌ Error';
      btn.classList.add('error');
      setTimeout(() => { btn.textContent = origLabel; btn.classList.remove('error'); btn.disabled = false; }, 2500);
    }
  }
}

// ── Save all SETUP config (LIVE + LIVE_KALSHI) ────────────────────────────────
async function saveSetup(_authed = false) {
  if (!_authed) { requirePassword(() => saveSetup(true), 'Save all settings'); return; }
  const btn = document.getElementById('btn-save-setup');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

  // Validate LIVE params
  const thresh5m  = parseFloat(document.getElementById('live-thresh5m').value);
  const thresh15m = parseFloat(document.getElementById('live-thresh15m').value);
  if (isNaN(thresh5m) || thresh5m <= 0 || isNaN(thresh15m) || thresh15m <= 0) {
    alert('Invalid spike threshold'); if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCBE Save All Settings'; } return;
  }
  const mn5    = parseFloat(document.getElementById('live-minprice5m').value);
  const mx5    = parseFloat(document.getElementById('live-maxprice5m').value);
  const mxt1_5 = parseFloat(document.getElementById('live-mxt1-5m').value);
  const mt5    = parseFloat(document.getElementById('live-maxtrade5m').value);
  const mn15    = parseFloat(document.getElementById('live-minprice15m').value);
  const mx15    = parseFloat(document.getElementById('live-maxprice15m').value);
  const mxt1_15 = parseFloat(document.getElementById('live-mxt1-15m').value);
  const mxt1_st2 = parseFloat(document.getElementById('live-mxt1-standalone').value);
  const mt15    = parseFloat(document.getElementById('live-maxtrade15m').value);
  if ([mn5, mx5, mxt1_5, mt5, mn15, mx15, mxt1_15, mt15].some(isNaN)) {
    alert('Invalid parameter value'); if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCBE Save All Settings'; } return;
  }

  const baseEoa  = parseFloat(document.getElementById('live-base-eoa')?.value);
  const riskPctV = parseFloat(document.getElementById('live-risk-pct')?.value);
  if (isNaN(riskPctV) || riskPctV <= 0) {
    alert('Risk per Trade % is required and must be > 0'); if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCBE Save All Settings'; } return;
  }
  const maxPosV  = parseInt(document.getElementById('live-max-positions')?.value);
  const t1ModeV     = document.getElementById('live-t1-mode')?.checked;
  const fokRetryV   = document.getElementById('live-fok-retry-enabled')?.checked;
  const fokDivisorV = parseInt(document.getElementById('live-fok-divisor')?.value);
  const fokMaxV     = parseInt(document.getElementById('live-fok-max')?.value);
  const cbEnabledV  = document.getElementById('live-cb-enabled')?.checked;
  const cbMinsV     = parseInt(document.getElementById('live-cb-mins')?.value);
  const dlEnabledV  = document.getElementById('live-dl-enabled')?.checked;
  const dlMaxLoss   = parseFloat(document.getElementById('live-dl-max-losses')?.value);
  const dlWindowMins = parseFloat(document.getElementById('live-dl-window-mins')?.value);
  const dlPauseMins = parseFloat(document.getElementById('live-dl-pause-mins')?.value);
  const distMin5mV  = parseFloat(document.getElementById('live-distmin5m')?.value);
  const distMin15mV = parseFloat(document.getElementById('live-distmin15m')?.value);
  const livePayload = {
    stratKey     : 'LIVE',
    saveHistory  : true,
    strategy5m   : document.getElementById('live-strategy5m').value,
    threshold5m  : thresh5m,
    minPrice5m     : mn5    / 100,
    maxPrice5m     : mx5    / 100,
    maxPriceT1_5m  : mxt1_5 / 100,
    maxTrade5m     : mt5,
    strategy15m    : document.getElementById('live-strategy15m').value,
    threshold15m   : thresh15m,
    minPrice15m    : mn15    / 100,
    maxPrice15m    : mx15    / 100,
    maxPriceT1_15m       : mxt1_15 / 100,
    maxPriceT1standalone : isNaN(mxt1_st2) ? undefined : mxt1_st2 / 100,
    maxTrade15m          : mt15,
    ...(isNaN(baseEoa)  ? {} : { baseEoaBalance: baseEoa }),
    ...(isNaN(riskPctV) ? {} : { riskPct: riskPctV / 100 }),
    ...(isNaN(maxPosV) || maxPosV < 1 ? {} : { maxPositions: maxPosV }),
    ...(t1ModeV     !== undefined ? { t1Mode: t1ModeV }              : {}),
    ...(document.getElementById('live-t1-standalone') !== null ? { t1standalone: document.getElementById('live-t1-standalone').checked } : {}),
    ...(document.getElementById('live-t0') !== null ? { t0off: !document.getElementById('live-t0').checked } : {}),
    ...(fokRetryV   !== undefined ? { fokRetryEnabled: fokRetryV }   : {}),
    ...(!isNaN(fokDivisorV)       ? { fokRetryDivisor: fokDivisorV } : {}),
    ...(!isNaN(fokMaxV)           ? { fokRetryMax: fokMaxV }         : {}),
    ...(cbEnabledV  !== undefined ? { circuitBreakerEnabled: cbEnabledV } : {}),
    ...(!isNaN(cbMinsV)           ? { circuitBreakerMins: cbMinsV }      : {}),
    ...(dlEnabledV  !== undefined ? { drawdownLimitEnabled: dlEnabledV }           : {}),
    ...(!isNaN(dlMaxLoss)         ? { drawdownLimitMaxLosses: dlMaxLoss }           : {}),
    ...(!isNaN(dlWindowMins)      ? { drawdownLimitWindowMins: dlWindowMins }        : {}),
    ...(!isNaN(dlPauseMins)       ? { drawdownLimitPauseMins: dlPauseMins }         : {}),
    ...(!isNaN(distMin5mV)        ? { distMin5m: distMin5mV }                       : {}),
    ...(!isNaN(distMin15mV)       ? { distMin15m: distMin15mV }                     : {}),
    noSpikeFilter: document.getElementById('live-no-spike-filter')?.checked ?? false,
    allowLowVol:   document.getElementById('live-allow-low-vol')?.checked ?? true,
    allowPriceOor: document.getElementById('live-allow-price-oor')?.checked ?? false,
    ...(() => { const v = parseFloat(document.getElementById('live-body-pct')?.value); return isNaN(v) ? {} : { bodyPct: v }; })(),
    directionFilter  : document.getElementById('live-direction-filter')?.value || null,
    skipHours        : (() => { const v = (document.getElementById('live-skip-hours')?.value || '').trim(); return v ? v.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n)) : []; })(),
    skipDow          : (() => { const v = (document.getElementById('live-skip-dow')?.value   || '').trim(); return v ? v.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n)) : []; })(),
    ...(() => { const v = parseInt(document.getElementById('live-coord-min')?.value); return isNaN(v) ? {} : { coordMinCryptos: v }; })(),
    normalTradeOff: !(document.getElementById('live-normal-trade')?.checked ?? true),
    rejTradeReasons: Array.from(document.querySelectorAll('#setup-rej-checkboxes input[data-rej-setup-reason]:checked')).map(el => el.dataset.rejSetupReason),
  };
  for (const el of document.querySelectorAll('#panel-SETUP .thresh-crypto-input[data-strat="LIVE"]')) {
    const cr = el.dataset.crypto, dur = el.dataset.dur;
    livePayload[`threshold${dur}_${cr}`] = el.value.trim() !== '' ? parseFloat(el.value) : null;
  }
  for (const el of document.querySelectorAll('#panel-SETUP .strat-crypto-select[data-strat="LIVE"]')) {
    const cr = el.dataset.crypto, dur = el.dataset.dur;
    livePayload[`strategy${dur}_${cr}`] = el.value || null;
  }
  // Threshold locks
  const lockedThresholds2 = {};
  document.querySelectorAll('#panel-SETUP .th-lock-btn[data-strat="LIVE"]').forEach(btn => {
    if (btn.dataset.locked === '1')
      lockedThresholds2[`threshold${btn.dataset.dur}_${btn.dataset.crypto}`] = true;
  });
  livePayload.lockedThresholds = lockedThresholds2;

  // Kalshi 15m mirrors LIVE 15m settings
  const kalshiPayload = {
    stratKey     : 'LIVE_KALSHI',
    strategy15m  : document.getElementById('live-strategy15m').value,
    threshold15m : thresh15m,
    minPrice15m  : mn15 / 100,
    maxPrice15m  : mx15 / 100,
    maxTrade15m  : mt15,
  };
  for (const el of document.querySelectorAll('#panel-SETUP .thresh-crypto-input[data-strat="LIVE"][data-dur="15m"]')) {
    const cr = el.dataset.crypto;
    kalshiPayload[`threshold15m_${cr}`] = el.value.trim() !== '' ? parseFloat(el.value) : null;
  }
  for (const el of document.querySelectorAll('#panel-SETUP .strat-crypto-select[data-strat="LIVE"][data-dur="15m"]')) {
    const cr = el.dataset.crypto;
    kalshiPayload[`strategy15m_${cr}`] = el.value || null;
  }

  const [r1, r2] = await Promise.all([
    apiFetch('/t1000/config', 'POST', livePayload),
    apiFetch('/t1000/config', 'POST', kalshiPayload),
  ]);
  liveFillPending = { '5m': false, '15m': false };
  setupDirty = false;

  if (btn) {
    const ok = r1 && !r1.error && r2 && !r2.error;
    btn.textContent = ok ? '\u2705 Saved' : '\u274C Error';
    btn.classList.add(ok ? 'saved' : 'error');
    setTimeout(() => {
      btn.textContent = '\uD83D\uDCBE Save All Settings';
      btn.classList.remove('saved', 'error');
      btn.disabled = false;
    }, 2000);
  }
}

// ── Get Best Setup — reads SIM2 autoscan results and fills SETUP fields ───────
async function getBestSetup() {
  const btn = document.getElementById('btn-get-best');
  btn.disabled = true;
  btn.textContent = '\u23F3 Loading\u2026';
  try {
    // Read the latest SIM2 autoscan results (do NOT re-run: that would use
    // different parameters than SIM2 and overwrite the D2-filtered results)
    const data = await apiFetch('/t1000/autoscan');
    if (!data || data.error) throw new Error('Could not read autoscan results');
    for (const dur of ['5m', '15m']) {
      const trio = dur === '5m' ? data.trio5m : data.trio15m;
      if (!trio) continue;
      for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
        const lockBtn = document.querySelector(`#panel-SETUP .th-lock-btn[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
        if (lockBtn?.dataset.locked === '1') continue; // respect lock
        const thEl  = document.querySelector(`#panel-SETUP .thresh-crypto-input[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
        const selEl = document.querySelector(`#panel-SETUP .strat-crypto-select[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
        if (trio[cr]) {
          if (thEl)  thEl.value  = trio[cr].th;
          // trio5m periods are integers (81); trio15m are strings ("C225") — normalise
          if (selEl) selEl.value = String(trio[cr].period).startsWith('C')
            ? trio[cr].period : 'C' + trio[cr].period;
        }
      }
      // minPrice/maxPrice are user preferences — do NOT overwrite from autoscan sweep params
    }
    // Apply T0/T1/TC flags used in the autoscan run to the LIVE checkboxes.
    // Ensures LIVE mode matches the exact conditions the autoscan was optimised for.
    if (data.simFlags != null) {
      const _tcEl = document.getElementById('live-t1-mode');
      const _t1El = document.getElementById('live-t1-standalone');
      if (_tcEl !== null) _tcEl.checked = data.simFlags.t1Mode       === true;
      if (_t1El !== null) _t1El.checked = data.simFlags.t1standalone === true;
      // t0off is intentionally NOT applied — autoscan always uses T+0 data for scoring.
    }
    setupDirty = true;
    btn.textContent = '\u2705 Done \u2014 review & save';
    setTimeout(() => { btn.textContent = '\u26A1 Apply SIM2 Autoscan'; btn.disabled = false; }, 4000);
  } catch (e) {
    console.error('getBestSetup error:', e);
    btn.textContent = '\u274C Error: ' + (e.message || 'unknown');
    setTimeout(() => { btn.textContent = '\u26A1 Apply SIM2 Autoscan'; btn.disabled = false; }, 3000);
  }
}

// ── Score last 7 days vs all-time ─────────────────────────────────────────────
async function score7d() {
  const btn = document.getElementById('btn-score-7d');
  btn.disabled = true;
  btn.textContent = '\u23F3 Scanning 7d\u2026';
  try {
    const r = await apiFetch('/t1000/run-autoscan-7d', 'POST');
    if (!r || r.error) throw new Error(r?.error || 'Simulator failed');
    btn.textContent = '\u2B07 Loading\u2026';
    const [d7, dAll] = await Promise.all([
      apiFetch('/t1000/autoscan-7d'),
      apiFetch('/t1000/autoscan'),
    ]);
    if (!d7 || d7.error) throw new Error('7d results not available');

    const panel = document.getElementById('setup-7d-panel');
    const table = document.getElementById('setup-7d-table');
    const note  = document.getElementById('setup-7d-note');

    // Build comparison rows for each duration
    const rows = [];
    for (const dur of ['5m', '15m']) {
      const trioAll = dur === '5m' ? dAll?.trio5m  : dAll?.trio15m;
      const trio7d  = dur === '5m' ? d7?.trio5m    : d7?.trio15m;
      if (!trio7d) continue;
      for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
        const a = trioAll?.[cr];
        const b = trio7d?.[cr];
        if (!b) continue;
        const thDiff  = a ? Math.abs(b.th - a.th) : 0;
        const cxxDiff = a && b.period !== a.period;
        const diverge = thDiff > 0.04 || cxxDiff;
        rows.push({ dur, crypto: cr, a, b, diverge });
      }
    }

    const th = (v) => v != null ? `${(v*100).toFixed(0)}%` : '—';
    const hdr = '<tr style="color:#718096;border-bottom:1px solid #2d3748;">' +
      '<th style="text-align:left;padding:2px 6px;font-weight:normal;">Dur</th>' +
      '<th style="text-align:left;padding:2px 6px;font-weight:normal;">Crypto</th>' +
      '<th style="text-align:center;padding:2px 6px;font-weight:normal;">All-time Cxx</th>' +
      '<th style="text-align:center;padding:2px 6px;font-weight:normal;">All-time Th</th>' +
      '<th style="text-align:center;padding:2px 6px;font-weight:normal;">7d Cxx</th>' +
      '<th style="text-align:center;padding:2px 6px;font-weight:normal;">7d Th</th>' +
      '<th style="text-align:center;padding:2px 6px;font-weight:normal;">\u0394</th>' +
      '</tr>';

    const bodyRows = rows.map(row => {
      const color = row.diverge ? '#f6ad55' : '#e2e8f0';
      const delta = row.a
        ? (row.b.th - row.a.th > 0 ? `+${((row.b.th - row.a.th)*100).toFixed(0)}%` :
           row.b.th - row.a.th < 0 ? `${((row.b.th - row.a.th)*100).toFixed(0)}%` : '\u2014')
        : '\u2014';
      const deltaColor = row.diverge ? '#f6ad55' : '#718096';
      return `<tr style="color:${color};border-bottom:1px solid #1a2035;">` +
        `<td style="padding:2px 6px;color:#718096;">${row.dur.toUpperCase()}</td>` +
        `<td style="padding:2px 6px;">${row.crypto}</td>` +
        `<td style="padding:2px 6px;text-align:center;">${row.a?.period ?? '\u2014'}</td>` +
        `<td style="padding:2px 6px;text-align:center;">${th(row.a?.th)}</td>` +
        `<td style="padding:2px 6px;text-align:center;font-weight:${row.b.period !== row.a?.period ? '700' : 'normal'};">${row.b.period}</td>` +
        `<td style="padding:2px 6px;text-align:center;font-weight:${row.diverge ? '700' : 'normal'};">${th(row.b.th)}</td>` +
        `<td style="padding:2px 6px;text-align:center;color:${deltaColor};">${delta}</td>` +
        '</tr>';
    }).join('');

    table.innerHTML = hdr + bodyRows;
    const dateFrom = d7.dateFrom ?? '\u2014';
    note.textContent = `7d window: ${dateFrom} \u2192 today \u2014 highlighted rows diverge \u22650.04% from all-time`;
    panel.style.display = '';

    const label = '\uD83D\uDCC5 7d Drift Check';
    btn.textContent = '\u2705 Done';
    setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 3000);
  } catch (e) {
    console.error('score7d error:', e);
    btn.textContent = '\u274C ERROR: ' + (e.message || 'unknown');
    setTimeout(() => { btn.textContent = '\uD83D\uDCC5 7d Drift Check'; btn.disabled = false; }, 5000);
  }
}

// ── Fill LIVE params from 3D simulator autoscan JSON ─────────────────────────
function toggleThLock(btn) {
  const nowLocked = btn.dataset.locked !== '1';
  btn.dataset.locked = nowLocked ? '1' : '0';
  btn.innerHTML = nowLocked
    ? '<svg class="ico ico-sm"><use href="#ico-lock"/></svg>'
    : '<svg class="ico ico-sm"><use href="#ico-unlock"/></svg>';
  btn.style.color = nowLocked ? '#ed8936' : '#4a5568';
  const thEl = btn.closest('div')?.querySelector('.thresh-crypto-input');
  if (thEl) thEl.style.outline = nowLocked ? '1px solid #ed8936' : '';
  setupDirty = true;
}

// ── Export / Import LIVE settings ─────────────────────────────────────────────

function exportSettings() {
  const g  = id => document.getElementById(id);
  const gf = id => parseFloat(g(id)?.value);
  const gi = id => parseInt(g(id)?.value);
  const gc = id => g(id)?.checked;

  const s = {
    source         : 'LIVE',
    _exported      : new Date().toISOString(),
    minPrice5m     : gf('live-minprice5m') / 100,
    maxPrice5m     : gf('live-maxprice5m') / 100,
    maxPriceT1_5m        : gf('live-mxt1-5m')   / 100,
    maxTrade5m           : gf('live-maxtrade5m'),
    minPrice15m          : gf('live-minprice15m') / 100,
    maxPrice15m          : gf('live-maxprice15m') / 100,
    maxPriceT1_15m       : gf('live-mxt1-15m')   / 100,
    maxPriceT1standalone : gf('live-mxt1-standalone') / 100,
    maxTrade15m    : gf('live-maxtrade15m'),
    riskPct        : gf('live-risk-pct') / 100,
    maxPositions   : gi('live-max-positions'),
    baseEoaBalance : gf('live-base-eoa'),
    t1Mode              : gc('live-t1-mode'),
    t1standalone        : gc('live-t1-standalone'),
    t0off               : !gc('live-t0'),
    fokRetryEnabled     : gc('live-fok-retry-enabled'),
    fokRetryDivisor     : gi('live-fok-divisor'),
    fokRetryMax         : gi('live-fok-max'),
    circuitBreakerEnabled  : gc('live-cb-enabled'),
    circuitBreakerMins     : gi('live-cb-mins'),
    drawdownLimitEnabled   : gc('live-dl-enabled'),
    drawdownLimitMaxLosses : gf('live-dl-max-losses'),
    drawdownLimitWindowMins: gf('live-dl-window-mins'),
    drawdownLimitPauseMins : gf('live-dl-pause-mins'),
    distMin5m      : gf('live-distmin5m'),
    distMin15m     : gf('live-distmin15m'),
    noSpikeFilter  : gc('live-no-spike-filter'),
    allowLowVol    : gc('live-allow-low-vol'),
    allowPriceOor  : gc('live-allow-price-oor'),
    bodyPct        : gf('live-body-pct'),
    directionFilter  : document.getElementById('live-direction-filter')?.value || null,
    skipHours        : (() => { const v = (document.getElementById('live-skip-hours')?.value || '').trim(); return v ? v.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n)) : []; })(),
    skipDow          : (() => { const v = (document.getElementById('live-skip-dow')?.value   || '').trim(); return v ? v.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n)) : []; })(),
    coordMinCryptos  : parseInt(document.getElementById('live-coord-min')?.value) || 0,
    normalTradeOff   : !gc('live-normal-trade'),
    rejTradeReasons  : Array.from(document.querySelectorAll('#setup-rej-checkboxes input[data-rej-setup-reason]:checked')).map(el => el.dataset.rejSetupReason),
    lockedThresholds: {},
  };

  for (const el of document.querySelectorAll('#panel-SETUP .thresh-crypto-input[data-strat="LIVE"]'))
    s[`threshold${el.dataset.dur}_${el.dataset.crypto}`] = el.value.trim() !== '' ? parseFloat(el.value) : null;
  for (const el of document.querySelectorAll('#panel-SETUP .strat-crypto-select[data-strat="LIVE"]'))
    s[`strategy${el.dataset.dur}_${el.dataset.crypto}`] = el.value || null;
  document.querySelectorAll('#panel-SETUP .th-lock-btn[data-strat="LIVE"]').forEach(btn => {
    if (btn.dataset.locked === '1')
      s.lockedThresholds[`threshold${btn.dataset.dur}_${btn.dataset.crypto}`] = true;
  });

  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `polychamp-live-settings-${date}.json`; a.click();
  URL.revokeObjectURL(url);
}

function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const s  = JSON.parse(e.target.result);
      const g  = id => document.getElementById(id);
      const sv = (id, v) => { const el = g(id); if (el && v != null && !isNaN(v)) el.value = v; };
      const ss = (id, v) => { const el = g(id); if (el && v != null) el.value = v; };
      const sc = (id, v) => { const el = g(id); if (el && v != null) el.checked = v; };

      ss('live-strategy5m',  s.strategy5m);
      sv('live-thresh5m',    s.threshold5m);
      sv('live-minprice5m',  s.minPrice5m  != null ? Math.round(s.minPrice5m  * 100) : null);
      sv('live-maxprice5m',  s.maxPrice5m  != null ? Math.round(s.maxPrice5m  * 100) : null);
      sv('live-mxt1-5m',     s.maxPriceT1_5m != null ? Math.round(s.maxPriceT1_5m * 100) : null);
      sv('live-maxtrade5m',  s.maxTrade5m);
      ss('live-strategy15m', s.strategy15m);
      sv('live-thresh15m',   s.threshold15m);
      sv('live-minprice15m', s.minPrice15m != null ? Math.round(s.minPrice15m * 100) : null);
      sv('live-maxprice15m', s.maxPrice15m != null ? Math.round(s.maxPrice15m * 100) : null);
      sv('live-mxt1-15m',         s.maxPriceT1_15m != null ? Math.round(s.maxPriceT1_15m * 100) : null);
      sv('live-mxt1-standalone',  s.maxPriceT1standalone != null ? Math.round(s.maxPriceT1standalone * 100) : null);
      sv('live-maxtrade15m', s.maxTrade15m);
      sv('live-risk-pct',    s.riskPct != null ? Math.round(s.riskPct * 100) : null);
      sv('live-max-positions', s.maxPositions);
      sv('live-base-eoa',    s.baseEoaBalance);
      sc('live-t1-mode',          s.t1Mode);
      sc('live-t1-standalone',    s.t1standalone);
      sc('live-t0',               s.t0off !== true);
      sc('live-fok-retry-enabled', s.fokRetryEnabled);
      sv('live-fok-divisor',  s.fokRetryDivisor);
      sv('live-fok-max',      s.fokRetryMax);
      sc('live-cb-enabled',   s.circuitBreakerEnabled);
      sv('live-cb-mins',      s.circuitBreakerMins);
      sc('live-dl-enabled',   s.drawdownLimitEnabled);
      sv('live-dl-max-losses',   s.drawdownLimitMaxLosses);
      sv('live-dl-window-mins',  s.drawdownLimitWindowMins);
      sv('live-dl-pause-mins',   s.drawdownLimitPauseMins);
      sv('live-distmin5m',    s.distMin5m);
      sv('live-distmin15m',   s.distMin15m);
      sc('live-no-spike-filter', s.noSpikeFilter);
      sc('live-allow-low-vol',   s.allowLowVol);
      sc('live-allow-price-oor', s.allowPriceOor);
      sv('live-body-pct',     s.bodyPct);
      if (s.directionFilter != null) { const el = g('live-direction-filter'); if (el) el.value = s.directionFilter || ''; }
      if (s.skipHours != null) { const el = g('live-skip-hours'); if (el) el.value = Array.isArray(s.skipHours) ? s.skipHours.join(',') : (s.skipHours || ''); }
      if (s.skipDow   != null) { const el = g('live-skip-dow');   if (el) el.value = Array.isArray(s.skipDow)   ? s.skipDow.join(',')   : (s.skipDow   || ''); }
      const _coordV = s.coordMinCryptos ?? s.coordMin; if (_coordV != null) sv('live-coord-min', _coordV);
      if (s.normalTradeOff !== undefined) sc('live-normal-trade', s.normalTradeOff !== true);
      if (Array.isArray(s.rejTradeReasons) && typeof renderSetupRejCheckboxes === 'function') renderSetupRejCheckboxes(s);

      for (const el of document.querySelectorAll('#panel-SETUP .thresh-crypto-input[data-strat="LIVE"]')) {
        const key = `threshold${el.dataset.dur}_${el.dataset.crypto}`;
        if (key in s) el.value = s[key] ?? '';
      }
      for (const el of document.querySelectorAll('#panel-SETUP .strat-crypto-select[data-strat="LIVE"]')) {
        const key = `strategy${el.dataset.dur}_${el.dataset.crypto}`;
        if (key in s && s[key]) el.value = s[key];
      }
      if (s.lockedThresholds) {
        document.querySelectorAll('#panel-SETUP .th-lock-btn[data-strat="LIVE"]').forEach(btn => {
          const key    = `threshold${btn.dataset.dur}_${btn.dataset.crypto}`;
          const locked = !!s.lockedThresholds[key];
          btn.dataset.locked = locked ? '1' : '0';
          btn.innerHTML      = locked
            ? '<svg class="ico ico-sm"><use href="#ico-lock"/></svg>'
            : '<svg class="ico ico-sm"><use href="#ico-unlock"/></svg>';
          btn.style.color = locked ? '#ed8936' : '#4a5568';
          const thEl = btn.closest('div')?.querySelector('.thresh-crypto-input');
          if (thEl) thEl.style.outline = locked ? '1px solid #ed8936' : '';
        });
      }

      setupDirty = true;
      event.target.value = '';
      // Auto-save: triggers password prompt then saves LIVE + LIVE_KALSHI atomically
      saveSetup();
    } catch (err) {
      alert('Failed to load settings: ' + err.message);
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

async function fillFromAutoscan(dur) {
  const btn = document.querySelector(`#panel-SETUP .btn-fill[data-dur="${dur}"]`);
  const label = dur === '5m' ? 'Fill 5MIN \u2193' : 'Fill 15MIN \u2193';
  if (btn) { btn.disabled = true; btn.textContent = 'Loading\u2026'; }

  const data = await apiFetch('/t1000/autoscan');
  if (!data || data.error) {
    alert('Autoscan data not available.\nRun: node simulate_combined.js -nf -as');
    if (btn) { btn.disabled = false; btn.textContent = label; }
    return;
  }
  const trio = dur === '5m' ? data.trio5m : data.trio15m;
  const best = dur === '5m' ? data.best5m  : data.best15m;
  if (!trio) {
    alert('No 3D sweep data in autoscan JSON.\nRun: node simulate_combined.js -nf -as');
    if (btn) { btn.disabled = false; btn.textContent = label; }
    return;
  }

  for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
    const lockBtn = document.querySelector(`#panel-SETUP .th-lock-btn[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
    if (lockBtn?.dataset.locked === '1') continue; // respect lock
    const thEl  = document.querySelector(`#panel-SETUP .thresh-crypto-input[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
    const selEl = document.querySelector(`#panel-SETUP .strat-crypto-select[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
    if (trio[cr]) {
      if (thEl)  thEl.value  = trio[cr].th;
      if (selEl) selEl.value = trio[cr].period;
    }
  }
  if (best) {
    const mnEl = document.getElementById(`live-minprice${dur}`);
    const mxEl = document.getElementById(`live-maxprice${dur}`);
    if (mnEl && best.mn != null) mnEl.value = Math.round(best.mn * 100);
    if (mxEl && best.mx != null) mxEl.value = Math.round(best.mx * 100);
  }
  setupDirty = true;
  if (btn) { btn.disabled = false; btn.textContent = label; }
}


// ── Format timestamp in EAT (UTC+3) ──────────────────────────────────────────
function fmtEAT(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '') + ' EAT';
}

// ── Full reset: clear trade list + reset P&L chart baseline + record reset date ──
async function clearTradeList() {
  const s = state.LIVE;
  if (!s) return;
  const log = s.activityLog || [];
  const miniLog = (state['LIVE_MINI']?.activityLog || []);
  const locked     = [...log, ...miniLog].filter(e => e.status === 'OPEN')
    .reduce((sum, e) => sum + (e.position || 0), 0);
  const redeemable = [...log, ...miniLog].filter(e => e.status === 'WIN' && !e.redeemed)
    .reduce((sum, e) => sum + (e.position > 0 && e.entryPrice > 0 ? e.position / e.entryPrice : 0), 0);
  const virtualTotal = parseFloat(((s.realBalance ?? 0) + locked + redeemable).toFixed(2));
  const now    = new Date().toISOString();
  const eatStr = fmtEAT(now);
  if (!confirm(
    `Full reset of LIVE trading view?\n\n` +
    `• Clears recent trades & P\u2044L chart (history preserved in ALL TRADES)\n` +
    `• Sets Base EOA Balance → current Virtual Total ($${virtualTotal.toFixed(2)} USDC.e)\n` +
    `• Records reset date: ${eatStr}\n\n` +
    `W/L/PnL counters restart from now.`
  )) return;
  await Promise.all([
    apiFetch('/t1000/config', 'POST', {
      stratKey: 'LIVE',
      tradeListClearedAt: now,
      baseEoaBalance: virtualTotal,
      resetAt: now,
    }),
    apiFetch('/t1000/config', 'POST', {
      stratKey: 'LIVE_MINI',
      tradeListClearedAt: now,
    }),
  ]);
  pollState();
}


// ─────────────────────────────────────────────────────────────────────────

// ── Circuit breaker manual clear ──────────────────────────────────────────────
async function clearCircuitBreaker(key) {
  await apiFetch('/t1000/config', 'POST', { stratKey: key, circuitBreakerUntil: null });
  pollState();
}

// ── Reset balance ─────────────────────────────────────────────────────────────
function syncEoaBaseline() {
  // Read current on-chain balance from the UI (updated every ~5s from /t1000/state)
  const liveS = state && state['LIVE'];
  const currentBal = liveS?.realBalance ?? null;
  if (currentBal == null) { alert('No balance data yet — wait a moment and retry.'); return; }
  const el = document.getElementById('live-base-eoa');
  if (el) el.value = currentBal.toFixed(2);
  // Auto-save so engine immediately re-anchors the PNL baseline
  saveSetup();
}

async function resetBalance(key) {
  const msg = key === 'LIVE'
    ? 'Reset LIVE paper P&L to $0 and clear stats?'
    : (() => {
        const s = state && state[key] ? state[key] : null;
        const startBal = s ? (s.startBalance ?? (s.maxTrade ?? 150) / 0.05) : null;
        const balStr = startBal ? `$${startBal.toLocaleString()}` : 'starting balance';
        return `Reset ${key} balance to ${balStr} and clear stats?`;
      })();
  if (!confirm(msg)) return;
  await apiFetch('/t1000/reset', 'POST', { stratKey: key });
  pollState();
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function apiFetch(path, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    // Include Basic Auth for mutating requests (dual headers — fallback if SES strips Authorization)
    if (method !== 'GET' && typeof _API_AUTH !== 'undefined' && _API_AUTH) {
      opts.headers['Authorization']     = _API_AUTH;
      opts.headers['X-Polychamp-Auth']  = _API_AUTH;
    }
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    return await res.json();
  } catch (e) {
    console.error('API error', path, e);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────

// ── Render state ──────────────────────────────────────────────────────────────
function renderState(data) {
  state = data;

  for (const key of STRAT_KEYS) {
    const s = data[key];
    if (!s) continue;

    // Toggle
    const tog = document.getElementById(`toggle-${key}`);
    if (tog) tog.checked = s.enabled;

    // Threshold + price inputs (paper tabs only; LIVE/LIVE_KALSHI use their own inputs)
    if (key !== 'LIVE' && key !== 'LIVE_KALSHI') {
      const thr = document.getElementById(`thresh-${key}`);
      if (thr && document.activeElement !== thr) thr.value = s.threshold;

      const mnEl = document.querySelector(`#panel-${key} .minprice-input`);
      if (mnEl && document.activeElement !== mnEl) mnEl.value = Math.round((s.minPrice ?? 0.05) * 100);

      const mxEl = document.querySelector(`#panel-${key} .maxprice-input`);
      if (mxEl && document.activeElement !== mxEl) mxEl.value = Math.round((s.maxPrice ?? 0.90) * 100);

      const mtEl = document.querySelector(`#panel-${key} .maxtrade-input`);
      if (mtEl && document.activeElement !== mtEl) mtEl.value = Math.round(s.maxTrade ?? 150);

      // Per-crypto threshold inputs
      for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
        const el = document.querySelector(`#panel-${key} .thresh-crypto-input[data-crypto="${cr}"]`);
        if (el && document.activeElement !== el)
          el.value = s[`threshold_${cr}`] != null ? s[`threshold_${cr}`] : '';
      }
    }

    // LIVE-specific rendering
    if (key === 'LIVE') {
      // Enable banner status text
      const statusText = document.getElementById('live-status-text');
      if (statusText) {
        const openCount = (s.activityLog || []).filter(e => e.status === 'OPEN').length;
        if (s.enabled) {
          statusText.textContent = '\uD83D\uDFE2 LIVE TRADING ACTIVE';
          statusText.className   = 'live-status-text live-on';
          statusText.style.color = '';
        } else if (openCount > 0) {
          statusText.textContent = `\uD83D\uDC41 MONITORING ${openCount} OPEN POSITION${openCount > 1 ? 'S' : ''}`;
          statusText.className   = 'live-status-text';
          statusText.style.color = '#f6ad55';
        } else {
          statusText.textContent = '\uD83D\uDD12 LIVE TRADING DISABLED';
          statusText.className   = 'live-status-text';
          statusText.style.color = '';
        }
      }

      // Real Polymarket balance + derived balance stats
      const _wallets = s.wallets ?? [];
      const _isMultiWallet = _wallets.length > 1;
      const fmt = v => '$' + v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

      // EOA Wallet row: show aggregate of all wallets when multi-wallet, else default only
      const realBalEl = document.getElementById('live-real-balance');
      const realBalLabel = realBalEl?.closest('.bal-item')?.querySelector('.bal-label');
      if (_isMultiWallet) {
        const allBals = _wallets.filter(w => w.balance != null);
        if (realBalEl && allBals.length) {
          const totalBal = allBals.reduce((sum, w) => sum + w.balance, 0);
          realBalEl.textContent = fmt(totalBal);
          if (realBalLabel) realBalLabel.textContent = 'All Wallets';
        }
      } else if (realBalEl && s.realBalance != null) {
        const balStr = fmt(s.realBalance);
        const eoaAddr = s.eoaAddress;
        if (eoaAddr) {
          realBalEl.innerHTML = `<a href="https://polygonscan.com/address/${eoaAddr}" target="_blank" style="color:inherit;text-decoration:none;" title="${eoaAddr}">${balStr}</a>`;
        } else {
          realBalEl.textContent = balStr;
        }
        if (realBalLabel) realBalLabel.textContent = 'EOA Wallet';
      }

      const log = s.activityLog || [];
      const miniLog = (state['LIVE_MINI']?.activityLog || []);
      const locked = [...log, ...miniLog].filter(e => e.status === 'OPEN')
        .reduce((sum, e) => sum + (e.position || 0), 0);
      const redeemable = [...log, ...miniLog].filter(e => e.status === 'WIN' && !e.redeemed)
        .reduce((sum, e) => sum + (e.position > 0 && e.entryPrice > 0 ? e.position / e.entryPrice : 0), 0);
      const lockedEl  = document.getElementById('bal-locked-LIVE');
      const redeemEl  = document.getElementById('bal-redeem-LIVE');
      const totalElL  = document.getElementById('bal-total-LIVE');
      const eoaChanged    = s.realBalance !== lastLiveEoa;
      const redeemChanged = redeemable    !== lastLiveRedeemable;
      const lockedChanged = locked        !== lastLiveLocked;
      if (lockedEl && lockedChanged) lockedEl.textContent = locked === 0 ? '—' : fmt(locked);
      if (redeemEl) redeemEl.textContent = redeemable === 0 ? '—' : fmt(redeemable);
      // Virtual Total: for multi-wallet use sum of all wallet balances; else single EOA
      if (totalElL) {
        const baseBal = _isMultiWallet
          ? _wallets.filter(w => w.balance != null).reduce((sum, w) => sum + w.balance, 0)
          : (s.realBalance ?? 0);
        if (baseBal > 0 || locked > 0 || redeemable > 0)
          totalElL.textContent = fmt(baseBal + locked + redeemable);
      }
      lastLiveEoa        = s.realBalance ?? lastLiveEoa;
      lastLiveRedeemable = redeemable;
      lastLiveLocked     = locked;
      const redeemQEl = document.getElementById('redeem-q-LIVE');
      if (redeemQEl) redeemQEl.textContent = (s.pendingRedemptions ?? 0) === 0 ? '—' : s.pendingRedemptions;

      // ── Multi-wallet summary rows (only rendered when >1 wallet) ────────────
      const walletsSection = document.getElementById('live-wallets-section');
      if (walletsSection) {
        if (_isMultiWallet) {
          walletsSection.style.display = '';
          // Aggregate header: total balance + combined locked/redeemable/redeemQ
          const aggBal       = _wallets.filter(w => w.balance != null).reduce((sum, w) => sum + w.balance, 0);
          const aggLocked    = _wallets.reduce((sum, w) => sum + (w.locked    ?? 0), 0);
          const aggRedeemable= _wallets.reduce((sum, w) => sum + (w.redeemable?? 0), 0);
          const aggRedeemQ   = _wallets.reduce((sum, w) => sum + (w.redeemQ   ?? 0), 0);
          const totEl = document.getElementById('live-wallets-total-bal');
          if (totEl) {
            const parts = [fmt(aggBal)];
            if (aggLocked     > 0) parts.push(`Locked: ${fmt(aggLocked)}`);
            if (aggRedeemable > 0) parts.push(`Redeem: ${fmt(aggRedeemable)}`);
            if (aggRedeemQ    > 0) parts.push(`Q:${aggRedeemQ}`);
            totEl.textContent = parts.join(' · ');
          }
          // Per-wallet rows
          const rowsEl = document.getElementById('live-wallets-rows');
          if (rowsEl) {
            rowsEl.innerHTML = _wallets.map(w => {
              const bal      = w.balance != null ? fmt(w.balance) : '—';
              const pnlNum   = w.pnl ?? 0;
              const pnlStr   = (pnlNum >= 0 ? '+$' : '-$') + Math.abs(pnlNum).toFixed(2);
              const pnlCol   = pnlNum >= 0 ? '#68d391' : '#fc8181';
              const lkStr    = (w.locked    ?? 0) > 0 ? fmt(w.locked)     : '—';
              const rdStr    = (w.redeemable?? 0) > 0 ? fmt(w.redeemable) : '—';
              const rdQ      = (w.redeemQ   ?? 0) > 0 ? w.redeemQ         : '—';
              const cbBadge  = w.cbActive
                ? `<span style="background:#7c2020;color:#fbd38d;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700;">CB</span>`
                : `<span style="background:#1a3a24;color:#68d391;border-radius:3px;padding:1px 5px;font-size:10px;">OK</span>`;
              const lastT    = w.lastTrade ? new Date(w.lastTrade).toISOString().slice(11,16) + ' UTC' : '—';
              return `<div style="display:flex;align-items:center;gap:10px;padding:5px 12px;border-bottom:1px solid #1a202c;font-size:16px;flex-wrap:wrap;">
                <span style="color:#a0aec0;min-width:80px;font-weight:600;">${w.label}</span>
                <span style="color:#e2e8f0;min-width:70px;" title="Liquid USDC.e">${bal}</span>
                <span style="color:#68d391;min-width:28px;" title="Wins">W:${w.wins}</span>
                <span style="color:#fc8181;min-width:28px;" title="Losses">L:${w.losses}</span>
                <span style="color:${pnlCol};min-width:58px;" title="PNL">${pnlStr}</span>
                <span style="color:#f6ad55;min-width:52px;" title="Locked in open positions">${lkStr}</span>
                <span style="color:#63b3ed;min-width:52px;" title="Redeemable wins">${rdStr}</span>
                <span style="color:#63b3ed;min-width:24px;" title="Redeem queue">${rdQ}</span>
                ${cbBadge}
                <span style="color:#718096;margin-left:auto;font-size:14px;">last: ${lastT}</span>
              </div>`;
            }).join('');
          }
        } else {
          walletsSection.style.display = 'none';
        }
      }

      // Strategy selectors + per-duration params (skip entirely if user has unsaved edits)
      if (!setupDirty) {
        const sel5 = document.getElementById('live-strategy5m');
        if (sel5 && s.strategy5m) sel5.value = s.strategy5m;
        const sel15 = document.getElementById('live-strategy15m');
        if (sel15 && s.strategy15m) sel15.value = s.strategy15m;

        const th5El = document.getElementById('live-thresh5m');
        if (th5El && s.threshold5m != null) th5El.value = s.threshold5m;
        const mn5El = document.getElementById('live-minprice5m');
        if (mn5El && s.minPrice5m != null) mn5El.value = Math.round(s.minPrice5m * 100);
        const mx5El = document.getElementById('live-maxprice5m');
        if (mx5El && s.maxPrice5m != null) mx5El.value = Math.round(s.maxPrice5m * 100);
        const mt5El = document.getElementById('live-maxtrade5m');
        if (mt5El && s.maxTrade5m != null) mt5El.value = s.maxTrade5m;
        const mxt1_5El = document.getElementById('live-mxt1-5m');
        if (mxt1_5El && s.maxPriceT1_5m != null) mxt1_5El.value = Math.round(s.maxPriceT1_5m * 100);

        const th15El = document.getElementById('live-thresh15m');
        if (th15El && s.threshold15m != null) th15El.value = s.threshold15m;
        const mn15El = document.getElementById('live-minprice15m');
        if (mn15El && s.minPrice15m != null) mn15El.value = Math.round(s.minPrice15m * 100);
        const mx15El = document.getElementById('live-maxprice15m');
        if (mx15El && s.maxPrice15m != null) mx15El.value = Math.round(s.maxPrice15m * 100);
        const mt15El = document.getElementById('live-maxtrade15m');
        if (mt15El && s.maxTrade15m != null) mt15El.value = s.maxTrade15m;
        const mxt1_15El = document.getElementById('live-mxt1-15m');
        if (mxt1_15El && s.maxPriceT1_15m != null) mxt1_15El.value = Math.round(s.maxPriceT1_15m * 100);
        const mxt1_stEl = document.getElementById('live-mxt1-standalone');
        if (mxt1_stEl && s.maxPriceT1standalone != null) mxt1_stEl.value = Math.round(s.maxPriceT1standalone * 100);
      }

      // Best Cxx candidates — ranked by Score (90% CI lower bound of EV/trade)
      const periods5m  = ['C50','C55','C60','C65','C70','C75','C80','C85','C90','C95'];
      const periods15m = ['C150','C165','C180','C195','C210','C225','C240','C255'];
      for (const [elId, periods, dur] of [['live-best-5m', periods5m, '5m'], ['live-best-15m', periods15m, '15m']]) {
        const el = document.getElementById(elId);
        if (!el) continue;
        const cxx   = periods.reduce((b, p) => {
          const sa = state[b]?.score ?? -Infinity;
          const sb = state[p]?.score ?? -Infinity;
          return sb > sa ? p : b;
        }, periods[0]);
        const cs    = state[cxx];
        const total = (cs?.wins ?? 0) + (cs?.losses ?? 0);
        const wr    = total > 0 ? ((cs.wins / total) * 100).toFixed(1) + '% WR' : '—';
        const score = cs?.score != null ? (cs.score >= 0 ? '+' : '') + cs.score.toFixed(3) : null;
        const roi   = cs?.startBalance > 0 ? (((cs.balance - cs.startBalance) / cs.startBalance) * 100).toFixed(1) + '% ROI' : '—';
        const scoreLabel = score != null ? `Score <b>${score}</b> &middot; ` : '';
        el.innerHTML = `&#x2605; Best: <button class="best-cxx-btn" onclick="document.getElementById('live-strategy${dur}').value='${cxx}'">${cxx}</button> <span class="best-wr">${scoreLabel}${wr} &middot; ${roi}</span>`;
      }

      // Per-crypto threshold + Cxx selects for LIVE (5m and 15m) — in #panel-SETUP
      if (!setupDirty) {
        for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
          for (const dur of ['5m', '15m']) {
            const el = document.querySelector(`#panel-SETUP .thresh-crypto-input[data-strat="LIVE"][data-crypto="${cr}"][data-dur="${dur}"]`);
            if (el) { const val = s[`threshold${dur}_${cr}`]; el.value = val != null ? val : ''; }
            const sel = document.querySelector(`#panel-SETUP .strat-crypto-select[data-strat="LIVE"][data-crypto="${cr}"][data-dur="${dur}"]`);
            if (sel) sel.value = s[`strategy${dur}_${cr}`] ?? '';
          }
        }
      }
      // Lock button states — gated by setupDirty (same as threshold inputs) so polls
      // don't overwrite user's lock toggle before they click Save
      if (!setupDirty) {
        const locks = s.lockedThresholds || {};
        for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
          for (const dur of ['5m', '15m']) {
            const btn = document.querySelector(`#panel-SETUP .th-lock-btn[data-strat="LIVE"][data-crypto="${cr}"][data-dur="${dur}"]`);
            if (!btn) continue;
            const field = `threshold${dur}_${cr}`;
            const isLocked = !!locks[field];
            btn.dataset.locked = isLocked ? '1' : '0';
            btn.innerHTML = isLocked
              ? '<svg class="ico ico-sm"><use href="#ico-lock"/></svg>'
              : '<svg class="ico ico-sm"><use href="#ico-unlock"/></svg>';
            btn.style.color = isLocked ? '#ed8936' : '#4a5568';
            const thEl = btn.closest('div')?.querySelector('.thresh-crypto-input');
            if (thEl) thEl.style.outline = isLocked ? '1px solid #ed8936' : '';
          }
        }
      }
      renderLiveActiveConfig(s);
      renderSettingsHistory(s.settingsHistory);
    }

    // LIVE_KALSHI-specific rendering
    if (key === 'LIVE_KALSHI') {
      // Enable banner
      const kStatusText = document.getElementById('kalshi-status-text');
      if (kStatusText) {
        kStatusText.textContent = s.enabled ? '\uD83D\uDFE2 KALSHI LIVE ACTIVE' : '\uD83D\uDD12 KALSHI LIVE DISABLED';
        kStatusText.className   = s.enabled ? 'live-status-text live-on' : 'live-status-text';
      }

      // Kalshi balance + derived balance stats
      const kBalEl = document.getElementById('kalshi-real-balance');
      if (kBalEl && s.kalshiBalance != null) {
        kBalEl.textContent = '$' + s.kalshiBalance.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      }
      const kLog    = s.activityLog || [];
      const kLocked = kLog.filter(e => e.status === 'OPEN').reduce((sum, e) => sum + (e.position || 0), 0);
      const kFmt    = v => '$' + v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      const kLockedEl = document.getElementById('bal-locked-LIVE_KALSHI');
      const kTotalEl  = document.getElementById('bal-total-LIVE_KALSHI');
      if (kLockedEl) kLockedEl.textContent = kFmt(kLocked);
      if (kTotalEl && s.kalshiBalance != null)
        kTotalEl.textContent = kFmt(s.kalshiBalance + kLocked);

      // Tab badge
      const kBadge = document.getElementById('tab-badge-LIVE_KALSHI');
      if (kBadge) {
        kBadge.textContent = s.enabled ? '●' : '15M';
        kBadge.style.color  = s.enabled ? '#68d391' : '#63b3ed';
      }
    }

    // LIVE_MINI-specific rendering
    if (key === 'LIVE_MINI') {
      const mStatusText = document.getElementById('mini-status-text');
      if (mStatusText) {
        mStatusText.textContent = s.enabled ? '\uD83D\uDFE2 MINI ACTIVE' : '\uD83D\uDD12 MINI DISABLED';
        mStatusText.className   = s.enabled ? 'live-status-text live-on' : 'live-status-text';
      }
      // Real balance (shares LIVE wallet)
      const mBalEl = document.getElementById('mini-real-balance');
      if (mBalEl && s.realBalance != null)
        mBalEl.textContent = '$' + s.realBalance.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      // Locked + virtual total
      const mLog    = s.activityLog || [];
      const mLocked = mLog.filter(e => e.status === 'OPEN').reduce((sum, e) => sum + (e.position || 0), 0);
      const mFmt    = v => '$' + v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      const mLockedEl = document.getElementById('bal-locked-LIVE_MINI');
      const mTotalEl  = document.getElementById('bal-total-LIVE_MINI');
      if (mLockedEl) mLockedEl.textContent = mFmt(mLocked);
      if (mTotalEl) mTotalEl.textContent = mFmt((s.balance ?? 0) + mLocked);
      // Tab badge
      const mBadge = document.getElementById('tab-badge-LIVE_MINI');
      const riskDiv = s.riskDivisor ?? 3;
      if (mBadge) {
        mBadge.textContent = s.enabled ? '●' : `1/${riskDiv}`;
        mBadge.style.color  = s.enabled ? '#68d391' : '#9f7aea';
      }
      // Config inputs (only when not dirty)
      if (!setupDirty && !miniDirty) {
        const mpEl = document.getElementById('mini-max-pos');
        if (mpEl && s.maxPositions != null) mpEl.value = s.maxPositions;
        const rdEl = document.getElementById('mini-risk-divisor');
        if (rdEl && s.riskDivisor != null) rdEl.value = s.riskDivisor;
      }
    }

    // Stats
    const balEl = document.getElementById(`bal-${key}`);
    if (balEl) {
      if (key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI') {
        let pnl;
        if (key === 'LIVE' && s.baseEoaBalance != null) {
          // PNL stat = s.balance (engine-side sum of all activityLog.pnl since last reset — not the 50-entry slice)
          pnl = parseFloat((s.balance ?? 0).toFixed(2));
          if (s.riskPct != null) _rejLiveContext = { balance: s.baseEoaBalance, riskPct: s.riskPct };
          // Sync base EOA input (only when SETUP not dirty)
          if (!setupDirty) {
            const baseEl = document.getElementById('live-base-eoa');
            if (baseEl) baseEl.value = s.baseEoaBalance.toFixed(2);
            const riskEl = document.getElementById('live-risk-pct');
            if (riskEl && s.riskPct != null) riskEl.value = parseFloat((s.riskPct * 100).toFixed(1));
            const mpEl = document.getElementById('live-max-positions');
            if (mpEl && s.maxPositions != null) mpEl.value = s.maxPositions;
            const t0El = document.getElementById('live-t0');
            if (t0El && s.t0off !== undefined) t0El.checked = s.t0off !== true;
            const t1El = document.getElementById('live-t1-mode');
            if (t1El && s.t1Mode !== undefined) t1El.checked = s.t1Mode !== false;
            const t1StEl = document.getElementById('live-t1-standalone');
            if (t1StEl && s.t1standalone !== undefined) t1StEl.checked = s.t1standalone === true;
            const fokRetryEl = document.getElementById('live-fok-retry-enabled');
            if (fokRetryEl && s.fokRetryEnabled !== undefined) fokRetryEl.checked = s.fokRetryEnabled !== false;
            const fokDivEl = document.getElementById('live-fok-divisor');
            if (fokDivEl && s.fokRetryDivisor != null) fokDivEl.value = s.fokRetryDivisor;
            const fokMaxEl = document.getElementById('live-fok-max');
            if (fokMaxEl && s.fokRetryMax != null) fokMaxEl.value = s.fokRetryMax;
            const cbEnEl = document.getElementById('live-cb-enabled');
            if (cbEnEl && s.circuitBreakerEnabled !== undefined) cbEnEl.checked = s.circuitBreakerEnabled !== false;
            const cbMinsEl = document.getElementById('live-cb-mins');
            if (cbMinsEl && s.circuitBreakerMins != null) cbMinsEl.value = s.circuitBreakerMins;
            // Drawdown limit
            const dlEnEl = document.getElementById('live-dl-enabled');
            if (dlEnEl && s.drawdownLimitEnabled !== undefined) dlEnEl.checked = s.drawdownLimitEnabled !== false;
            const dlMaxEl = document.getElementById('live-dl-max-losses');
            if (dlMaxEl && s.drawdownLimitMaxLosses != null) dlMaxEl.value = s.drawdownLimitMaxLosses;
            const dlWinEl = document.getElementById('live-dl-window-mins');
            if (dlWinEl && s.drawdownLimitWindowMins != null) dlWinEl.value = s.drawdownLimitWindowMins;
            const dlPauseEl = document.getElementById('live-dl-pause-mins');
            if (dlPauseEl && s.drawdownLimitPauseMins != null) dlPauseEl.value = s.drawdownLimitPauseMins;
            // Dist min
            const dm5El = document.getElementById('live-distmin5m');
            if (dm5El && s.distMin5m != null) dm5El.value = s.distMin5m;
            const dm15El = document.getElementById('live-distmin15m');
            if (dm15El && s.distMin15m != null) dm15El.value = s.distMin15m;
            // No spike filter
            const nsfEl = document.getElementById('live-no-spike-filter');
            if (nsfEl && s.noSpikeFilter !== undefined) nsfEl.checked = s.noSpikeFilter === true;
            // Include signals toggles
            const alvEl = document.getElementById('live-allow-low-vol');
            if (alvEl && s.allowLowVol !== undefined) alvEl.checked = s.allowLowVol !== false;
            const apoEl = document.getElementById('live-allow-price-oor');
            if (apoEl && s.allowPriceOor !== undefined) apoEl.checked = s.allowPriceOor === true;
            // Body%
            const bpEl = document.getElementById('live-body-pct');
            if (bpEl && s.bodyPct != null) bpEl.value = s.bodyPct;
            // D2 filters
            const dirEl = document.getElementById('live-direction-filter');
            if (dirEl) dirEl.value = s.directionFilter || '';
            const shEl  = document.getElementById('live-skip-hours');
            if (shEl)  shEl.value  = Array.isArray(s.skipHours) ? s.skipHours.join(',') : '';
            const sdEl  = document.getElementById('live-skip-dow');
            if (sdEl)  sdEl.value  = Array.isArray(s.skipDow)   ? s.skipDow.join(',')   : '';
            const cmEl  = document.getElementById('live-coord-min');
            if (cmEl && s.coordMinCryptos != null) cmEl.value = s.coordMinCryptos;
            // Drawdown status badge
            const dlSt = document.getElementById('live-dl-status');
            if (dlSt) {
              if (s.drawdownPausedUntil && s.drawdownPausedUntil > Date.now()) {
                const remMin = Math.ceil((s.drawdownPausedUntil - Date.now()) / 60000);
                const resumeAt = new Date(s.drawdownPausedUntil).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: false }) + ' EAT';
                dlSt.textContent = `⛔ PAUSED — resumes at ${resumeAt} (in ${remMin} min · ${s.drawdownRecentLosses} losses in window)`;
                dlSt.style.cssText = 'color:#f6ad55;font-size:11px;font-weight:600;display:inline!important;';
              } else if (s.drawdownRecentLosses > 0) {
                dlSt.textContent = `${s.drawdownRecentLosses} loss${s.drawdownRecentLosses > 1 ? 'es' : ''} in window`;
                dlSt.style.cssText = 'color:#fbd38d;font-size:11px;display:inline!important;';
              } else {
                dlSt.textContent = '';
                dlSt.style.display = 'none';
              }
            }
            const resetAtVal = document.getElementById('live-reset-at-val');
            if (resetAtVal) resetAtVal.textContent = s.resetAt ? fmtEAT(s.resetAt) : '—';
            const resetBalEl = document.getElementById('live-reset-bal');
            if (resetBalEl) resetBalEl.textContent = s.resetAt && s.baseEoaBalance != null ? `@ $${s.baseEoaBalance.toFixed(2)}` : '';
            // Rejection trading controls
            const ntEl = document.getElementById('live-normal-trade');
            if (ntEl && s.normalTradeOff !== undefined) ntEl.checked = s.normalTradeOff !== true;
            if (typeof renderSetupRejCheckboxes === 'function') renderSetupRejCheckboxes(s);
          }
        } else {
          // LIVE_KALSHI or when base not yet loaded: fall back to activityLog sum
          pnl = (s.activityLog || []).reduce((sum, e) => sum + (e.pnl != null ? e.pnl : 0), 0);
        }
        if (pnl == null) {
          balEl.textContent = '—';
          balEl.className   = 'stat-value';
        } else {
          balEl.textContent = (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);
          balEl.className   = `stat-value ${pnl > 0 ? 'green' : pnl < 0 ? 'red' : ''}`;
        }
        // ROI% = PnL / starting EOA balance × 100
        const roiEl = document.getElementById(`roi-${key}`);
        if (roiEl) {
          const roiBase = s.baseEoaBalance > 0 ? s.baseEoaBalance
                        : s.realBalance    > 0 ? s.realBalance - (pnl ?? 0)
                        : 0;
          if (pnl != null && roiBase > 0) {
            const roi = pnl / roiBase * 100;
            roiEl.textContent = (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';
            roiEl.className   = `stat-value ${roi > 0 ? 'green' : roi < 0 ? 'red' : 'grey'}`;
          } else {
            roiEl.textContent = '—';
            roiEl.className   = 'stat-value grey';
          }
        }
      } else {
      const startBal = s.startBalance ?? ((s.maxTrade ?? 150) / 0.05);
      const diff = s.balance - startBal;
      balEl.textContent = `$${s.balance.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
      balEl.className = `stat-value ${diff > 0 ? 'green' : diff < 0 ? 'red' : ''}`;

      // ROI% — insert stat-item after Balance on first render, update on subsequent calls
      let roiEl = document.getElementById(`roi-${key}`);
      if (!roiEl) {
        const statItem = balEl.closest('.stat-item');
        if (statItem) {
          const newItem = document.createElement('div');
          newItem.className = 'stat-item';
          newItem.innerHTML = `<div class="stat-label">ROI</div><div class="stat-value grey" id="roi-${key}">—%</div>`;
          statItem.insertAdjacentElement('afterend', newItem);
          roiEl = document.getElementById(`roi-${key}`);
        }
      }
      if (roiEl && startBal > 0) {
        const roi = (s.balance - startBal) / startBal * 100;
        roiEl.textContent = (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';
        roiEl.className = `stat-value ${roi > 0 ? 'green' : roi < 0 ? 'red' : 'grey'}`;
      }
      } // end else (non-LIVE balance)
    }

    const wrEl = document.getElementById(`wr-${key}`);
    if (wrEl) {
      wrEl.textContent = s.winRate != null ? `${s.winRate}%` : '—%';
      wrEl.className   = `stat-value ${s.winRate != null ? (s.winRate >= 80 ? 'green' : s.winRate >= 60 ? '' : 'red') : 'grey'}`;
    }

    const wEl = document.getElementById(`wins-${key}`);
    if (wEl) wEl.textContent = s.wins;

    const lEl = document.getElementById(`losses-${key}`);
    if (lEl) lEl.textContent = s.losses;

    const fEl = document.getElementById(`failed-${key}`);
    if (fEl) {
      const fc = s.failed || 0;
      fEl.textContent  = fc;
      fEl.style.color  = fc > 0 ? '#f6ad55' : '#718096';
    }

    const pEl = document.getElementById(`pend-${key}`);
    if (pEl) pEl.textContent = s.pending || 0;

    // Skipped >90¢ count from activityLog
    const skipEl = document.getElementById(`skip-${key}`);
    if (skipEl) {
      const skipCount = (s.activityLog || []).filter(e => e.status === 'SKIP').length;
      skipEl.textContent = skipCount;
    }

    // FOK retry stats row (LIVE only)
    if (key === 'LIVE' && s.fokStats) {
      const fok = s.fokStats;
      const fRow = document.getElementById('fok-stats-LIVE');
      if (fRow) {
        const _t = document.getElementById('fok-total-LIVE');  if (_t) _t.textContent = fok.total;
        const _f = document.getElementById('fok-filled-LIVE'); if (_f) _f.textContent = fok.filled;
        const _w = document.getElementById('fok-wins-LIVE');   if (_w) _w.textContent = fok.wins;
        const _l = document.getElementById('fok-losses-LIVE'); if (_l) _l.textContent = fok.losses;
        const _x = document.getElementById('fok-failed-LIVE'); if (_x) _x.textContent = fok.failed;
        const _r = document.getElementById('fok-wr-LIVE');
        if (_r) {
          _r.textContent = fok.wr != null ? `${fok.wr}%` : '—';
          _r.style.color = fok.wr == null ? '#718096' : fok.wr >= 80 ? '#68d391' : fok.wr >= 60 ? '#e2e8f0' : '#fc8181';
        }
        const _p = document.getElementById('fok-pnl-LIVE');
        if (_p) {
          _p.textContent = fok.total > 0 ? (fok.pnl >= 0 ? `+$${fok.pnl.toFixed(2)}` : `-$${Math.abs(fok.pnl).toFixed(2)}`) : '—';
          _p.style.color  = fok.total > 0 ? (fok.pnl > 0 ? '#68d391' : fok.pnl < 0 ? '#fc8181' : '#e2e8f0') : '#718096';
        }
        const _a = document.getElementById('fok-active-LIVE');
        if (_a) _a.style.display = fok.open > 0 ? '' : 'none';
      }
      if (s.rejStats) {
        const rs = s.rejStats;
        const _rt0 = document.getElementById('rej-t0-LIVE');    if (_rt0) _rt0.textContent = rs.t0;
        const _rt1 = document.getElementById('rej-t1-LIVE');    if (_rt1) _rt1.textContent = rs.t1;
        const _rtc = document.getElementById('rej-tc-LIVE');    if (_rtc) _rtc.textContent = rs.tc;
        const _rtt = document.getElementById('rej-total-LIVE'); if (_rtt) _rtt.textContent = rs.total;
        const _rdb = document.getElementById('rej-details-btn'); if (_rdb) _rdb.style.display = rs.total > 0 ? '' : 'none';
        const _rrEl = document.getElementById('rej-reasons-LIVE');
        if (_rrEl && rs.byReason) {
          const LABELS = {
            below_threshold:  'low-spike',
            weak_body:        'weak-body',
            low_vol:          'low-vol',
            exhausted:        'exhaust',
            dir_filter:       'dir-filt',
            time_filter:      'time-filt',
            coord_wait:       'coord-wait',
            no_liquidity:     'no-liq',
            price_too_low:    'price-lo',
            price_too_high:   'price-hi',
            already_pending:  'pending',
            asset_already_open: 'open',
            circuit_breaker:  'circ-brk',
            max_positions:    'max-pos',
            signal_too_stale: 'stale',
          };
          const entries = Object.entries(rs.byReason).filter(([,v]) => v > 0);
          if (entries.length) {
            _rrEl.style.display = 'flex';
            _rrEl.innerHTML = entries.map(([k, v]) => {
              const lbl = LABELS[k] || k.replace(/_/g, '-');
              return `<span style="background:#252e40;padding:1px 7px;border-radius:10px;white-space:nowrap;">`
                + `<span style="color:#718096">${lbl}</span>&nbsp;<strong style="color:#f6ad55">${v}</strong></span>`;
            }).join('');
          } else {
            _rrEl.style.display = 'none';
          }
        }
      }
    }

    // Circuit breaker status bar (LIVE only)
    if (key === 'LIVE') {
      const cbBar = document.getElementById('cb-status-LIVE');
      if (cbBar) {
        const cbUntil = s.circuitBreakerUntil;
        const cbActive = cbUntil && cbUntil > Date.now();
        cbBar.style.display = cbActive ? 'flex' : 'none';
        if (cbActive) {
          const eatOffset = 3 * 3600000;
          const untilEat = new Date(cbUntil + eatOffset).toISOString().slice(11,16);
          const remMs  = cbUntil - Date.now();
          const remMin = Math.ceil(remMs / 60000);
          const untilEl  = document.getElementById('cb-until-LIVE');
          const remEl    = document.getElementById('cb-remain-LIVE');
          if (untilEl) untilEl.textContent = untilEat;
          if (remEl)   remEl.textContent   = `${remMin} min`;
        }
      }
    }

    // Tab badge for LIVE
    if (key === 'LIVE') {
      const badge = document.getElementById('tab-badge-LIVE');
      if (badge) {
        badge.textContent = s.enabled ? '\u25CF' : '\u25CB';
        badge.style.color  = s.enabled ? '#68d391' : '#718096';
      }
      // Also update the section-bar dot
      const dot = document.getElementById('section-live-dot');
      if (dot) {
        dot.textContent = s.enabled ? '\u25CF' : '\u25CB';
        dot.style.color  = s.enabled ? '#68d391' : '#718096';
      }
    }

    // New-item badge: count increase on inactive tabs
    const visCount = countVisible(s.activityLog || []);
    const tabKey   = KEY_TO_TAB[key] || key;
    if (tabKey !== currentTab && visCount > prevLogCount[key]) {
      unreadCount[key] += visCount - prevLogCount[key];
      updateTabBadge(key);
    }
    prevLogCount[key] = visCount;

    // Activity log: split LIVE/LIVE_KALSHI/LIVE_MINI into positions + trades; paper uses full log
    if (key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI') {
      renderPositions(key, s.activityLog || []);
      updatePositionColors(key);
      updatePositionPrices();
      // LIVE recent-trades panel also shows LIVE_MINI trades (tagged _isMini) for unified view
      if (key === 'LIVE') {
        const miniLog = (state['LIVE_MINI']?.activityLog || []).map(e => ({ ...e, _isMini: true }));
        const combined = [...(s.activityLog || []), ...miniLog]
          .sort((a, b) => new Date(b.time) - new Date(a.time));
        renderTrades(key, combined);
        updateMarketDistPanel();
      } else {
        renderTrades(key, s.activityLog || []);
      }
    } else {
      renderLog(key, s.activityLog || []);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────

// ── Poll loop ─────────────────────────────────────────────────────────────────
async function pollState() {
  const data = await apiFetch('/t1000/state');
  if (data) renderState(data);
}

// ── Init ──────────────────────────────────────────────────────────────────────
// Mark SETUP dirty on any user edit so polls don't overwrite unsaved values
document.getElementById('panel-SETUP').addEventListener('input',  () => { setupDirty = true; });
document.getElementById('panel-SETUP').addEventListener('change', () => { setupDirty = true; });
// Mark MINI dirty on any user edit so polls don't overwrite unsaved values
document.getElementById('mini-config-row').addEventListener('focusin', () => { miniDirty = true; });
document.getElementById('mini-config-row').addEventListener('input',   () => { miniDirty = true; });
document.getElementById('mini-config-row').addEventListener('change',  () => { miniDirty = true; });

// When simulator "Use in LIVE" fires, reset dirty flag and immediately re-poll
window.addEventListener('storage', e => {
  if (e.key === 'polychamp_live_applied') { setupDirty = false; pollState(); }
});

// Defer cross-module calls until all scripts have loaded
document.addEventListener('DOMContentLoaded', () => {
  switchSection('LIVE');
  pollState();
  setInterval(pollState, 4000);
  pollLivePrices();
  setInterval(pollLivePrices, 2000);
  setInterval(updatePositionGauges, 1000);
});
