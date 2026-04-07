// ── CLOB Trader — Positions: render, colors, gauges, market dist ──

// ── Render open positions (LIVE / LIVE_KALSHI) ────────────────────────────────
function renderPositions(key, log) {
  const el = document.getElementById(`positions-${key}`);
  if (!el) return;
  const isKalshi = key === 'LIVE_KALSHI';
  const openEntries = log.filter(e => e.status === 'OPEN');
  const fp = openEntries.map(e => `${e.tradeId}|${e.status}`).join(',') || 'empty';
  if (el.dataset.lastFp === fp) return;
  el.dataset.lastFp = fp;
  if (!openEntries.length) {
    el.innerHTML = '<div class="empty-log">No open positions</div>';
    return;
  }
  const rows = openEntries.map(e => {
    const t   = new Date(e.time);
    const ts  = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const dir = e.direction === 'UP'
      ? '<span class="dir-up">&#x25B2; UP</span>'
      : '<span class="dir-down">&#x25BC; DOWN</span>';
    const entry = e.entryPrice != null ? `${(e.entryPrice * 100).toFixed(0)}&#x00A2;` : '&#x2014;';
    const bet   = e.position   != null ? `$${e.position.toFixed(2)}` : '&#x2014;';
    const spike = e.spike_pct  != null ? `+${e.spike_pct.toFixed(2)}%` : '&#x2014;';
    const is15m = e.candle_size >= 150;
    const cycleMs = is15m ? 900000 : 300000;
    const typeBadge = is15m
      ? '<span class="badge-15m">15MIN</span>'
      : '<span class="badge-5m">5MIN</span>';
    const cfgKey = 'A_' + (e.tradeId || e.time);
    _tradeConfigs[cfgKey] = e;
    const statusBadge = e.status === 'FAILED'
      ? '<span class="badge" style="background:#4a2200;color:#f6ad55;font-size:10px">FAILED</span>'
      : '<span class="badge" style="background:#1a3a1a;color:#68d391;font-size:10px">OPEN</span>';
    const rowStyle = e.status === 'FAILED' ? ' style="opacity:0.55"' : '';
    const cycleStart = e.cycleStart ? new Date(e.cycleStart).getTime() : 0;
    const dataAttrs = e.status !== 'FAILED'
      ? ` data-crypto="${e.crypto}" data-dir="${e.direction}" data-t0open="${e.t0Open ?? ''}" data-trade-id="${e.tradeId ?? ''}" data-cycle-start="${cycleStart}" data-cycle-ms="${cycleMs}"`
      : '';
    let idCell;
    if (!isKalshi && e.cycleStart && e.candle_size) {
      const url = polyUrlFE(e.crypto, e.cycleStart, e.candle_size);
      idCell = url
        ? `<a href="${url}" target="_blank" style="color:#4fd1c5;text-decoration:none;">&#x1F4CA; ${e.tradeId || '&#x2014;'}</a>`
        : (e.tradeId || '&#x2014;');
    } else {
      idCell = `&#x1F535; ${e.tradeId || '&#x2014;'}`;
    }
    const cxx = e.candle_size ? `C${e.candle_size}` : '—';
    const entryBadge = !e.isT1
      ? '<span style="color:#a0aec0;font-size:12px;font-weight:700;">T0</span>'
      : e.label === 'TC'
        ? '<span style="color:#b794f4;font-size:12px;font-weight:700;">TC</span>'
        : '<span style="color:#f6ad55;font-size:12px;font-weight:700;">T1</span>';
    let fokCell = '';
    if (e.isFokRetry) {
      const origId = (e.tradeId || '').replace(/_FOKR$/, '');
      fokCell = `<span title="FOK retry of ${origId}" style="background:#3d2b00;color:#e8a84a;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;border:1px solid #7c5b00;letter-spacing:.03em;cursor:default;">FOK retry</span>`;
    }
    const tid = e.tradeId ?? '';
    const sellBtn = (!isKalshi && e.status !== 'FAILED')
      ? `<button onclick="manualSell('${tid}')" style="font-size:10px;padding:2px 8px;background:#742a2a;color:#fc8181;border:1px solid #9b2c2c;border-radius:4px;cursor:pointer;font-weight:600">SELL</button>`
      : '';
    const bodyPct = e.body_ratio != null ? `${e.body_ratio.toFixed(1)}%` : '—';
    return `<tr${rowStyle}${dataAttrs}>
      <td>${ts}</td><td><strong>${e.crypto}</strong></td><td>${typeBadge}</td>
      <td><button onclick="showTradeConfig('${cfgKey}')" style="background:none;border:none;cursor:pointer;color:#90cdf4;font-size:11px;text-decoration:underline dotted;padding:0;font-weight:600;">Config</button></td>
      <td style="color:#a0aec0;font-size:11px">${cxx}</td>
      <td style="color:#718096;font-size:11px">${bodyPct}</td>
      <td style="text-align:center;">${entryBadge}</td><td>${dir}</td>
      <td>${entry}</td><td>${bet}</td>
      <td id="pos-ab-${tid}" style="font-size:11px;color:#a0aec0;white-space:nowrap">—</td>
      <td id="pos-dist-${tid}" style="font-size:11px;white-space:nowrap">—</td>
      <td style="color:#f6ad55">${spike}</td>
      <td>${idCell}</td>
      <td>${fokCell}</td><td>${statusBadge}</td><td>${sellBtn}</td>
    </tr>
    <tr class="pos-gauge-row" style="height:3px">
      <td colspan="17" style="padding:0;background:#2d3748">
        <div id="pos-pg-${tid}" style="height:3px;width:0%;background:#4299e1;transition:width 0.9s linear;border-radius:0 2px 2px 0"></div>
      </td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="table-scroll"><table style="border-spacing:0">
    <thead><tr>
      <th>Time</th><th>Crypto</th><th>Type</th><th style="font-size:11px">Config</th><th>Cxx</th><th style="color:#718096;font-size:11px">Body%</th><th style="text-align:center;">Entry</th><th>Dir</th>
      <th>Price</th><th>Bet</th><th>Ask/Bid</th><th>Dist%</th><th>Spike</th><th>Market / ID</th><th></th><th>Status</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ── Update position row background colors based on current Binance price ──────
function updatePositionColors(key) {
  const el = document.getElementById(`positions-${key}`);
  if (!el) return;
  const closes = (state[key] ?? {}).liveCurrentClose ?? {};
  // Build set of currently-OPEN trade IDs — used to immediately dim resolved rows
  // before renderPositions gets a chance to remove them on the next state poll
  const openIds = new Set((state[key]?.activityLog || []).filter(e => e.status === 'OPEN').map(e => e.tradeId));
  el.querySelectorAll('tr[data-crypto]').forEach(tr => {
    const tid = tr.dataset.tradeId;
    // Position resolved but row not yet removed — black out immediately
    if (tid && !openIds.has(tid)) {
      tr.style.background = '#000';
      const distEl = document.getElementById(`pos-dist-${tid}`);
      if (distEl) distEl.innerHTML = '';
      const abEl = document.getElementById(`pos-ab-${tid}`);
      if (abEl) abEl.innerHTML = '';
      return;
    }
    const crypto = tr.dataset.crypto;
    const dir    = tr.dataset.dir;
    const t0Open = parseFloat(tr.dataset.t0open);
    const curr   = closes[crypto];
    if (!curr || isNaN(t0Open) || t0Open <= 0) { tr.style.background = ''; return; }
    const winning = dir === 'UP' ? curr > t0Open : curr < t0Open;
    tr.style.background = winning ? 'rgba(0,80,0,0.3)' : 'rgba(100,0,0,0.3)';
    const distEl = document.getElementById(`pos-dist-${tid}`);
    if (distEl) {
      const rawPct = dir === 'DOWN' ? (t0Open - curr) / t0Open * 100 : (curr - t0Open) / t0Open * 100;
      const sign   = rawPct >= 0 ? '+' : '';
      const color  = rawPct >= 0 ? '#68d391' : '#fc8181';
      distEl.innerHTML = `<span style="color:${color};font-weight:600">${sign}${(rawPct * 100).toFixed(1)}%</span>`;
    }
  });
}

// ── Update progress gauges for all open positions ─────────────────────────────
function updatePositionGauges() {
  const now = Date.now();
  document.querySelectorAll('tr[data-cycle-start]').forEach(tr => {
    const cycleStart = parseInt(tr.dataset.cycleStart);
    const cycleMs    = parseInt(tr.dataset.cycleMs);
    const tid        = tr.dataset.tradeId;
    if (!cycleStart || !cycleMs || !tid) return;
    const pct = Math.min(100, Math.max(0, (now - cycleStart) / cycleMs * 100));
    const bar = document.getElementById(`pos-pg-${tid}`);
    if (!bar) return;
    bar.style.width = pct.toFixed(1) + '%';
    bar.style.background = '#000';
  });
}

// ── Live market dist% panel (Binance current close vs T0 cycle open) ──────────
function updateMarketDistPanel() {
  const s = state['LIVE'];
  if (!s) return;
  const refs   = s.liveCycleRef    ?? {};
  const closes = s.liveCurrentClose ?? {};
  const CRYPTOS = ['BTC','ETH','SOL','XRP'];
  const TFS     = ['5m','15m'];
  for (const tf of TFS) {
    const refMap = refs[tf] ?? {};
    for (const cr of CRYPTOS) {
      const ref  = refMap[cr];
      const curr = closes[cr];
      const el   = document.getElementById(`mkt-dist-${tf}-${cr}`);
      if (!el) continue;
      if (ref == null || curr == null || ref <= 0) {
        el.textContent = '—';
        el.style.color = '#4a6080';
        el.style.background = '';
        continue;
      }
      const pct    = (curr - ref) / ref * 100;
      const sign   = pct >= 0 ? '+' : '';
      const thKey  = tf === '5m' ? `threshold5m_${cr}` : `threshold15m_${cr}`;
      const thFall = tf === '5m' ? s.threshold5m : s.threshold15m;
      const thresh = s[thKey] != null ? parseFloat(s[thKey]) : (thFall != null ? parseFloat(thFall) : null);
      const absPct = Math.abs(pct);
      const triggered = thresh != null && absPct >= thresh;
      el.innerHTML = `${sign}${pct.toFixed(2)}%`;
      el.style.color      = pct >= 0 ? '#68d391' : '#fc8181';
      el.style.background = triggered ? (pct >= 0 ? 'rgba(0,80,0,0.35)' : 'rgba(120,0,0,0.35)') : '';
      el.style.borderRadius = '3px';
      // Update threshold sub-row
      const thEl = document.getElementById(`mkt-thresh-${tf}-${cr}`);
      if (thEl) thEl.textContent = thresh != null ? `≥${thresh.toFixed(2)}%` : '—';
    }
  }
}

// ── Update ask/bid cells from livePrices ──────────────────────────────────────
function updatePositionPrices() {
  document.querySelectorAll('tr[data-trade-id][data-crypto]').forEach(tr => {
    const tid    = tr.dataset.tradeId;
    const crypto = tr.dataset.crypto;
    const dir    = tr.dataset.dir;
    if (!tid || !crypto) return;
    // Skip rows already blacked out by updatePositionColors
    if (tr.style.background === 'rgb(0, 0, 0)') return;
    const p = livePrices[crypto];
    if (!p) return;
    const ask = dir === 'UP' ? p.up    : p.down;
    const bid = dir === 'UP' ? p.up_bid : p.down_bid;
    const cell = document.getElementById(`pos-ab-${tid}`);
    if (!cell) return;
    const fmtC = v => v != null ? `${(v * 100).toFixed(0)}&#x00A2;` : '—';
    cell.innerHTML = `<span style="color:#e2e8f0">${fmtC(ask)}</span> <span style="color:#718096;font-size:10px">/ ${fmtC(bid)}</span>`;
  });
}

// ── Live price poll (every 2s) ────────────────────────────────────────────────
async function pollLivePrices() {
  const data = await apiFetch('/spike-latest-prices');
  if (!data) return;
  livePrices = data;
  updatePositionPrices();
  updatePositionColors('LIVE');
  updatePositionColors('LIVE_KALSHI');
}

// ── Manual sell ───────────────────────────────────────────────────────────────
async function manualSell(tradeId) {
  if (!confirm(`Manually sell position ${tradeId}?\nThis will place a market sell order immediately.`)) return;
  const btn = document.querySelector(`button[onclick="manualSell('${tradeId}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const res = await apiFetch('/t1000/live-sell', 'POST', { tradeId });
  if (!res || res.error) {
    alert(`Sell failed: ${res?.error || 'unknown error'}`);
    if (btn) { btn.disabled = false; btn.textContent = 'SELL'; }
    return;
  }
  const pnlStr = res.pnl >= 0 ? `+$${res.pnl.toFixed(2)}` : `-$${Math.abs(res.pnl).toFixed(2)}`;
  const exitC  = res.exitPrice != null ? ` @ ${(res.exitPrice * 100).toFixed(0)}¢` : '';
  alert(`Sold ${tradeId}${exitC}  PnL: ${pnlStr}`);
  pollState();  // refresh state immediately
}
