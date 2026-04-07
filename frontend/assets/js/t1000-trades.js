// ── CLOB Trader — Trades: render, log, projection, all-trades pagination ──

// ── Render resolved trades (LIVE / LIVE_KALSHI) ───────────────────────────────
function renderTrades(key, log) {
  const el = document.getElementById(`log-${key}`);
  if (!el) return;
  const isKalshi  = key === 'LIVE_KALSHI';
  const clearedAt = state[key]?.tradeListClearedAt || null;
  const resolved  = log.filter(e =>
    (e.status === 'WIN' || e.status === 'LOSS' || e.status === 'RECOV') &&
    (!clearedAt || e.time >= clearedAt)
  );
  const fp = resolved.map(e => `${e.tradeId}|${e.status}|${e.pnl ?? ''}`).join(',') || 'empty';
  if (el.dataset.lastFp === fp) return;
  el.dataset.lastFp = fp;
  if (!resolved.length) {
    el.innerHTML = '<div class="empty-log">No resolved trades yet</div>';
    if (key === 'LIVE') {
      const a = document.getElementById('live-avg-price');      if (a) a.textContent = '';
      const b = document.getElementById('live-24h-pnl');        if (b) b.textContent = '';
      const c = document.getElementById('live-avg-price-mini'); if (c) c.textContent = '';
    }
    return;
  }
  // Avg buy price + 24H PnL for LIVE tab (includes MINI)
  if (key === 'LIVE') {
    const avgEl     = document.getElementById('live-avg-price');
    const avgMiniEl = document.getElementById('live-avg-price-mini');
    const pnl24El   = document.getElementById('live-24h-pnl');
    const avgBuy = (trades, label, color) => {
      const last150 = trades.slice().sort((a, b) => new Date(a.time) - new Date(b.time)).slice(-150);
      const prices  = last150.map(e => e.entryPrice).filter(v => v != null);
      if (!prices.length) return '';
      const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
      return `${label} avg: ${(avg * 100).toFixed(1)}¢ (${prices.length})`;
    };
    if (avgEl) {
      const liveOnly = resolved.filter(e => !e._isMini);
      avgEl.textContent = avgBuy(liveOnly, 'LIVE', '#a0aec0');
    }
    if (avgMiniEl) {
      const miniOnly = resolved.filter(e => e._isMini);
      avgMiniEl.textContent = avgBuy(miniOnly, 'MINI', '#b794f4');
    }
    if (pnl24El) {
      const cutoff24h  = Date.now() - 24 * 60 * 60 * 1000;
      const liveHist   = (state['LIVE']?.pnlHistory      || []);
      const miniHist   = (state['LIVE_MINI']?.pnlHistory || []);
      const trades24h  = [...liveHist, ...miniHist].filter(e => e.pnl != null && new Date(e.time).getTime() >= cutoff24h);
      const count24    = trades24h.length;
      if (count24 > 0) {
        const pnl24  = trades24h.reduce((s, e) => s + e.pnl, 0);
        const wins24 = trades24h.filter(e => e.status === 'WIN').length;
        const wr24   = (wins24 / count24 * 100).toFixed(0);
        const sign   = pnl24 >= 0 ? '+' : '';
        const color  = pnl24 >= 0 ? '#68d391' : '#fc8181';
        pnl24El.style.color = color;
        pnl24El.textContent = `24H: ${sign}$${pnl24.toFixed(2)} · ${wr24}% WR (${count24}tr)`;
      } else {
        pnl24El.textContent = '';
      }
    }
    renderLiveProjection();
  }
  // Build global cumulative PnL map from full pnlHistory (not the 50-entry activityLog slice)
  let _cumAcc = 0;
  const _cumByTime = {};
  for (const e of (state[key]?.pnlHistory || [])) {
    if (e.pnl != null) _cumAcc += e.pnl;
    _cumByTime[e.time] = parseFloat(_cumAcc.toFixed(2));
  }
  // Separate cumulative map for LIVE_MINI rows shown in LIVE's panel
  let _cumAccMini = 0;
  const _cumByTimeMini = {};
  if (key === 'LIVE') {
    for (const e of (state['LIVE_MINI']?.pnlHistory || [])) {
      if (e.pnl != null) _cumAccMini += e.pnl;
      _cumByTimeMini[e.time] = parseFloat(_cumAccMini.toFixed(2));
    }
  }

  const rows = resolved.map(e => {
    const t   = new Date(e.time);
    const ts  = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const dateLabel = t.toLocaleDateString(undefined, { month: 'short', day: 'numeric',
      ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
    const dir = e.direction === 'UP'
      ? '<span class="dir-up">&#x25B2; UP</span>'
      : '<span class="dir-down">&#x25BC; DOWN</span>';
    const entry   = e.entryPrice != null ? `${(e.entryPrice * 100).toFixed(0)}&#x00A2;` : '&#x2014;';
    const bet     = e.position   != null ? `$${e.position.toFixed(2)}` : '&#x2014;';
    const spike   = e.spike_pct  != null ? `+${e.spike_pct.toFixed(2)}%` : '&#x2014;';
    // Beat% = % change of underlying crypto price over the cycle (finalPrice vs refPrice/t0Open)
    let beatPct = '&#x2014;';
    if (e.finalPrice != null && e.refPrice != null && e.refPrice !== 0) {
      const bp       = (e.finalPrice - e.refPrice) / e.refPrice * 100;
      const beatSign  = bp >= 0 ? '+' : '';
      const beatColor = e.direction === 'UP' ? '#63b3ed' : '#f6ad55';
      beatPct = `<span style="color:${beatColor}">${beatSign}${bp.toFixed(3)}%</span>`;
    }
    const is15m = e.candle_size >= 150;
    const typeBadge = is15m
      ? '<span class="badge-15m">15MIN</span>'
      : '<span class="badge-5m">5MIN</span>';
    const cfgKeyR = 'R_' + (e.tradeId || e.time);
    _tradeConfigs[cfgKeyR] = e;
    let statusBadge, pnlStr;
    if (e.status === 'WIN') {
      statusBadge = '<span class="badge badge-win">WIN</span>';
      const pct = (e.pnl != null && e.position > 0) ? ` (${(e.pnl / e.position * 100).toFixed(1)}%)` : '';
      pnlStr = e.pnl != null
        ? `<span style="color:#68d391">+$${e.pnl.toFixed(2)}${pct}</span>`
        : `<span style="color:#718096">…</span>`;
    } else if (e.status === 'FAILED') {
      statusBadge = '<span class="badge" style="background:#4a3300;color:#f6ad55">FAILED</span>';
      pnlStr = '<span style="color:#718096">—</span>';
    } else if (e.status === 'EXPIRED') {
      statusBadge = '<span class="badge" style="background:#2d2d4a;color:#9b8ed4">EXPIRED</span>';
      pnlStr = '<span style="color:#718096">—</span>';
    } else if (e.status === 'RECOV') {
      const tN = e.manualSell ? ' SELL' : (e.recoverN != null ? ` T+${e.recoverN}` : '');
      const exitC = e.exitPrice != null ? ` exit ${(e.exitPrice*100).toFixed(0)}¢` : '';
      statusBadge = `<span class="badge" style="background:#0d2233;color:#63b3ed;border:1px solid #2b6cb0">↩RECOV${tN}</span>`;
      const pct = (e.pnl != null && e.position > 0) ? ` (${(e.pnl / e.position * 100).toFixed(1)}%)` : '';
      pnlStr = e.pnl != null
        ? (e.pnl >= 0
          ? `<span style="color:#68d391">+$${e.pnl.toFixed(2)}${pct}${exitC}</span>`
          : `<span style="color:#fc8181">-$${Math.abs(e.pnl).toFixed(2)}${pct}${exitC}</span>`)
        : '<span style="color:#718096">—</span>';
    } else {
      statusBadge = '<span class="badge badge-loss">LOSS</span>';
      const pct = (e.pnl != null && e.position > 0) ? ` (${(e.pnl / e.position * 100).toFixed(1)}%)` : '';
      pnlStr = e.pnl != null ? `<span style="color:#fc8181">-$${Math.abs(e.pnl).toFixed(2)}${pct}</span>` : '';
    }
    let idCell;
    if (!isKalshi && e.cycleStart && e.candle_size) {
      const url = polyUrlFE(e.crypto, e.cycleStart, e.candle_size);
      idCell = url
        ? `<a href="${url}" target="_blank" style="color:#4fd1c5;text-decoration:none;">&#x1F4CA; ${e.tradeId || '&#x2014;'}</a>`
        : (e.tradeId || '&#x2014;');
    } else {
      idCell = `&#x1F535; ${e.tradeId || '&#x2014;'}`;
    }
    const cxx = e.candle_size
      ? `<button onclick="openChartForTrade('${e.crypto}',${e.candle_size},${e.cycleStart},'${e.status}')" title="Open chart for ${e.crypto} C${e.candle_size}" style="background:none;border:none;color:#a0aec0;cursor:pointer;font-size:11px;padding:0;text-decoration:underline dotted;">C${e.candle_size}</button>`
      : '&#x2014;';
    const entryBadge = !e.isT1
      ? '<span style="color:#a0aec0;font-size:12px;font-weight:700;">T0</span>'
      : e.label === 'TC'
        ? '<span style="color:#b794f4;font-size:12px;font-weight:700;">TC</span>'
        : '<span style="color:#f6ad55;font-size:12px;font-weight:700;">T1</span>';
    const fokBadge = e.isFokRetry
      ? '<span style="background:#2d3748;color:#718096;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #4a5568;">FOK</span>'
      : '';
    const miniBadge = e._isMini
      ? '<span style="background:#2d1f4a;color:#b794f4;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #553c9a;">MINI</span>'
      : '';
    const runBal = e._isMini ? (_cumByTimeMini[e.time] ?? null) : (_cumByTime[e.time] ?? null);
    const runBalStr   = runBal != null ? (runBal >= 0 ? `+$${runBal.toFixed(2)}` : `-$${Math.abs(runBal).toFixed(2)}`) : '—';
    const runBalColor = runBal == null ? '#718096' : runBal > 0 ? '#68d391' : runBal < 0 ? '#fc8181' : '#e2e8f0';
    const bodyPctR  = e.body_ratio != null ? `${e.body_ratio.toFixed(1)}%` : '—';
    const minSpikeR = e.threshold  != null ? e.threshold.toFixed(2) + '%' : '—';
    let distPctR = '—';
    if (e.position > 0 && e.pnl != null) {
      const dp = e.pnl / e.position * 100;
      const dpSign  = dp >= 0 ? '+' : '';
      const dpColor = dp >= 0 ? '#68d391' : '#fc8181';
      distPctR = `<span style="color:${dpColor}">${dpSign}${dp.toFixed(1)}%</span>`;
    }
    const rowStyle = e._isMini ? ' style="background:rgba(120,80,200,0.22)"' : '';
    return `<tr${rowStyle}>
      <td>${ts}</td><td><strong>${e.crypto}</strong></td><td>${typeBadge}</td>
      <td><button onclick="showTradeConfig('${cfgKeyR}')" style="background:none;border:none;cursor:pointer;color:#90cdf4;font-size:11px;text-decoration:underline dotted;padding:0;font-weight:600;">Config</button></td><td>${cxx}</td>
      <td style="color:#718096;font-size:11px">${bodyPctR}</td>
      <td style="text-align:center;">${entryBadge}</td><td>${dir}</td>
      <td style="font-size:11px">${beatPct}</td>
      <td>${entry}</td><td>${bet}</td>
      <td style="color:#f6ad55">${spike}</td>
      <td>${idCell}</td><td>${fokBadge}${miniBadge}</td><td>${statusBadge}</td><td>${pnlStr}</td>
      <td style="font-size:11px">${distPctR}</td>
      <td style="color:${runBalColor};font-size:11px">${runBalStr}</td><td>${dateLabel}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="table-scroll"><table>
    <thead><tr>
      <th>Time</th><th>Crypto</th><th>Type</th><th style="font-size:11px">Config</th><th>Cxx</th><th style="color:#718096;font-size:11px">Body%</th><th style="text-align:center;">Entry</th><th>Dir</th>
      <th style="font-size:11px">Beat%</th><th>Price</th><th>Bet</th><th>Spike</th><th>Market / ID</th><th></th><th>Status</th><th>P&amp;L</th><th style="font-size:11px">Dist%</th><th>Bal</th><th>Date</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderLiveProjection() {
  const projEl = document.getElementById('live-projection');
  if (!projEl) return;
  const clearedAt = state.LIVE?.tradeListClearedAt || null;
  if (!clearedAt) { projEl.style.display = 'none'; return; }
  const cutoff     = new Date(clearedAt).getTime();
  const now        = Date.now();
  const elapsedMs  = now - cutoff;
  const elapsedDay = elapsedMs / 86400000;
  if (elapsedDay < 0.05) { projEl.style.display = 'none'; return; }  // < ~1h of data
  // Trades since reset (LIVE + LIVE_MINI)
  const miniCutoff  = state.LIVE_MINI?.tradeListClearedAt ? new Date(state.LIVE_MINI.tradeListClearedAt).getTime() : 0;
  const liveTrades  = (state.LIVE?.pnlHistory      || []).filter(e => e.pnl != null && new Date(e.time).getTime() >= cutoff);
  const miniTrades  = (state.LIVE_MINI?.pnlHistory || []).filter(e => e.pnl != null && new Date(e.time).getTime() >= miniCutoff);
  const all         = [...liveTrades, ...miniTrades];
  if (!all.length) { projEl.style.display = 'none'; return; }
  const totalPnl  = all.reduce((s, e) => s + e.pnl, 0);
  const dailyRate = totalPnl / elapsedDay;
  const proj7     = dailyRate * 7;
  const proj30    = dailyRate * 30;
  const fmtP = v => (v >= 0 ? '+' : '') + '$' + Math.abs(v).toFixed(2);
  const col  = v => v >= 0 ? '#68d391' : '#fc8181';
  const el7  = document.getElementById('live-proj-7d');
  const el30 = document.getElementById('live-proj-30d');
  const elR  = document.getElementById('live-proj-rate');
  if (el7)  { el7.textContent  = `7d: ${fmtP(proj7)}`;  el7.style.color  = col(proj7);  }
  if (el30) { el30.textContent = `30d: ${fmtP(proj30)}`; el30.style.color = col(proj30); }
  if (elR) {
    const dStr = elapsedDay >= 1 ? elapsedDay.toFixed(1) + 'd' : Math.round(elapsedDay * 24) + 'h';
    elR.textContent = ` (${fmtP(dailyRate)}/d · ${dStr} · ${all.length}tr)`;
  }
  projEl.style.display = 'flex';
}

function renderLog(key, log) {
  const el = document.getElementById(`log-${key}`);
  if (!el) return;

  const visible = log.filter(e => e.status !== 'SKIP' && e.status !== 'OPEN');
  const fp = visible.map(e => `${e.tradeId ?? e.time}|${e.status}|${e.pnl ?? ''}`).join(',') || 'empty';
  if (el.dataset.lastFp === fp) return;
  el.dataset.lastFp = fp;

  if (!log.length) {
    el.innerHTML = '<div class="empty-log">No activity yet</div>';
    return;
  }

  if (!visible.length) {
    el.innerHTML = '<div class="empty-log">No resolved signals yet</div>';
    return;
  }

  const rows = [];

  for (const e of visible) {
    const t = new Date(e.time);

    // Local time HH:MM:SS
    const ts = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    // Local date for last column: "Feb 27" or "Feb 27, 2025" if different year
    const dateLabel = t.toLocaleDateString(undefined, { month: 'short', day: 'numeric',
      ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });

    const dir = e.direction === 'UP'
      ? '<span class="dir-up">▲ UP</span>'
      : '<span class="dir-down">▼ DOWN</span>';
    const entry    = e.entryPrice != null ? `${(e.entryPrice * 100).toFixed(0)}¢` : '—';
    const spikeStr = e.spike_pct  != null ? `${e.spike_pct.toFixed(2)}%` : '—';

    let statusBadge, pnlStr = '';
    switch (e.status) {
      case 'WIN':
        statusBadge = '<span class="badge badge-win">WIN</span>';
        pnlStr = e.pnl != null
          ? `<span style="color:#68d391">+$${e.pnl.toFixed(2)}</span>`
          : `<span style="color:#718096">…</span>`;
        break;
      case 'LOSS':
        statusBadge = '<span class="badge badge-loss">LOSS</span>';
        pnlStr = e.pnl != null ? `<span style="color:#fc8181">-$${Math.abs(e.pnl).toFixed(2)}</span>` : '';
        break;
      case 'OPEN':
        statusBadge = '<span class="badge badge-open">OPEN</span>';
        break;
      case 'SKIP':
        statusBadge = `<span class="badge badge-skip">${e.reason || 'SKIP'}</span>`;
        break;
      default:
        statusBadge = `<span class="badge badge-skip">${e.status}</span>`;
    }

    rows.push(`<tr>
      <td>${ts}</td>
      <td><strong>${e.crypto}</strong></td>
      <td>C${e.candle_size || '?'}</td>
      <td>${dir}</td>
      <td>${entry}</td>
      <td>${spikeStr}</td>
      <td>${statusBadge}</td>
      <td>${pnlStr}</td>
      <td>${dateLabel}</td>
    </tr>`);
  }

  const rowsHtml = rows.join('');

  el.innerHTML = `
    <div class="table-scroll"><table>
      <thead>
        <tr>
          <th>Time</th><th>Crypto</th><th>Candle</th><th>Dir</th>
          <th>Entry</th><th>Spike</th><th>Status</th><th>P&amp;L</th><th>Date</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>`;
}

// ── Live Active Config renderer ───────────────────────────────────────────────
function renderLiveActiveConfig(s) {
  const el = document.getElementById('live-active-config');
  if (!el) return;
  const CRYPTOS = ['BTC','ETH','SOL','XRP'];

  const line5m = CRYPTOS.map(cr => {
    const period = s[`strategy5m_${cr}`] || s.strategy5m || 'auto';
    const th = s[`threshold5m_${cr}`] != null ? (+s[`threshold5m_${cr}`]).toFixed(2)
             : s.threshold5m != null ? (+s.threshold5m).toFixed(2) : '—';
    return `<span class="lac-crypto"><span class="cr">${cr}</span> ${period} ${th}%</span>`;
  }).join('');

  const line15m = CRYPTOS.map(cr => {
    const period = s[`strategy15m_${cr}`] || s.strategy15m || 'auto';
    const th = s[`threshold15m_${cr}`] != null ? (+s[`threshold15m_${cr}`]).toFixed(2)
             : s.threshold15m != null ? (+s.threshold15m).toFixed(2) : '—';
    return `<span class="lac-crypto"><span class="cr">${cr}</span> ${period} ${th}%</span>`;
  }).join('');

  const mn5    = s.minPrice5m    != null ? Math.round(s.minPrice5m    * 100) : 5;
  const mx5    = s.maxPrice5m    != null ? Math.round(s.maxPrice5m    * 100) : 89;
  const mxt1_5  = s.maxPriceT1_5m  != null ? Math.round(s.maxPriceT1_5m  * 100) : null;
  const mxt1_st = s.maxPriceT1standalone != null ? Math.round(s.maxPriceT1standalone * 100) : null;
  const cap5   = s.maxTrade5m    || 150;
  const mn15    = s.minPrice15m    != null ? Math.round(s.minPrice15m    * 100) : 5;
  const mx15    = s.maxPrice15m    != null ? Math.round(s.maxPrice15m    * 100) : 89;
  const mxt1_15 = s.maxPriceT1_15m != null ? Math.round(s.maxPriceT1_15m * 100) : null;
  const cap15   = s.maxTrade15m    || 500;

  const t0On  = s.t0off !== true;
  const t1On  = s.t1Mode !== false;
  const t1StOn = s.t1standalone === true;
  const cbOn  = s.circuitBreakerEnabled !== false;
  const dlOn  = s.drawdownLimitEnabled  !== false;
  const fokOn = s.fokRetryEnabled       !== false;
  const dm5   = s.distMin5m  > 0 ? s.distMin5m  : null;
  const dm15  = s.distMin15m > 0 ? s.distMin15m : null;

  el.innerHTML = `
    <div class="lac-row"><span class="lac-tag">5m</span>${line5m}</div>
    <div class="lac-row"><span class="lac-tag">15m</span>${line15m}</div>
    <div class="lac-row">
      <span class="lac-tag">5m</span>
      <span class="lac-chip">min ${mn5}¢</span>
      <span class="lac-chip">max ${mx5}¢${mxt1_5 != null ? ' · TC ' + mxt1_5 + '¢' : ''}${mxt1_st != null ? ' · T1 ' + mxt1_st + '¢' : ''}</span>
      <span class="lac-chip">$${cap5} cap</span>
      &nbsp;
      <span class="lac-tag">15m</span>
      <span class="lac-chip">min ${mn15}¢</span>
      <span class="lac-chip">max ${mx15}¢${mxt1_15 != null ? ' · TC ' + mxt1_15 + '¢' : ''}${mxt1_st != null ? ' · T1 ' + mxt1_st + '¢' : ''}</span>
      <span class="lac-chip">$${cap15} cap</span>
    </div>
    <div class="lac-row">
      <span class="lac-chip ${t0On ? 'on' : 'off'}">${t0On ? 'T0' : 'T0 off'}</span>
      <span class="lac-chip ${(t1On || t1StOn) ? 'on' : 'off'}">${t1StOn && t1On ? 'T1+TC' : t1StOn ? 'T1' : t1On ? 'TC' : 'T1/TC off'}</span>
      <span class="lac-chip">MaxPos&nbsp;${s.maxPositions ?? 1}</span>
      <span class="lac-chip ${cbOn ? 'on' : 'off'}">CB ${cbOn ? s.circuitBreakerMins + 'min' : 'OFF'}</span>
      <span class="lac-chip ${dlOn ? 'on' : 'off'}">DRWL ${dlOn ? (s.drawdownLimitMaxLosses + 'L / ' + s.drawdownLimitWindowMins + 'min → ' + s.drawdownLimitPauseMins + 'min') : 'OFF'}</span>
      <span class="lac-chip ${fokOn ? 'on' : 'off'}">FOK ${fokOn ? ('÷' + s.fokRetryDivisor + ' ×' + s.fokRetryMax) : 'OFF'}</span>
      ${dm5  != null ? `<span class="lac-chip on">distMin 5m ${dm5}%</span>`  : ''}
      ${dm15 != null ? `<span class="lac-chip on">distMin 15m ${dm15}%</span>` : ''}
    </div>`;
}

// ── Settings History ──────────────────────────────────────────────────────────
let _settingsHistory = [];
let _shExpanded = false;

function toggleSettingsHistory() {
  _shExpanded = !_shExpanded;
  const listEl = document.getElementById('settings-history-list');
  const chevEl = document.getElementById('sh-chevron');
  if (listEl) listEl.style.display = _shExpanded ? 'block' : 'none';
  if (chevEl) chevEl.textContent = _shExpanded ? '▲' : '▼';
}

function renderSettingsHistory(history) {
  _settingsHistory = history || [];
  const countEl = document.getElementById('sh-count');
  if (countEl) countEl.textContent = `(${_settingsHistory.length})`;
  const listEl = document.getElementById('settings-history-list');
  if (!listEl) return;
  if (!_settingsHistory.length) {
    listEl.innerHTML = '<span style="color:#4a5568;font-size:11px;">No history yet — saved configs will appear here.</span>';
    return;
  }

  const chip = (txt, color='#718096', bg='#1a2035', border='#2d3748') =>
    `<span style="background:${bg};border:1px solid ${border};border-radius:3px;padding:1px 5px;font-size:10px;color:${color};white-space:nowrap;">${txt}</span>`;
  const on   = (txt) => chip(txt, '#68d391', '#1a3a2a', '#276749');
  const off  = (txt) => chip(txt, '#718096', '#1a2035', '#2d3748');
  const warn = (txt) => chip(txt, '#ed8936', '#2d1a00', '#7b3f00');
  const lbl  = (txt, w='28px') => `<span style="color:#4a5568;font-size:10px;font-weight:700;display:inline-block;min-width:${w};flex-shrink:0;">${txt}</span>`;
  const row  = (children) => `<div style="display:flex;gap:3px;align-items:center;flex-wrap:wrap;margin-top:3px;">${children}</div>`;

  // Per-crypto full row for one time interval
  // Each crypto shown as: [CRYPTO] [Cxx] [th%] [$cap]
  function cryptoRows(dur, snap) {
    const cryptos = ['BTC','ETH','SOL','XRP'];
    const globalCxx = snap[`strategy${dur}`] || '—';
    const globalTh  = snap[`threshold${dur}`];
    const globalCap = snap[`maxTrade${dur}`];
    const mn  = snap[`minPrice${dur}`]  != null ? Math.round(snap[`minPrice${dur}`]  * 100) : null;
    const mx  = snap[`maxPrice${dur}`]  != null ? Math.round(snap[`maxPrice${dur}`]  * 100) : null;
    const mxt   = snap[`maxPriceT1_${dur}`] != null ? Math.round(snap[`maxPriceT1_${dur}`] * 100) : null;
    const mxtSt = snap.maxPriceT1standalone != null ? Math.round(snap.maxPriceT1standalone * 100) : null;

    // Shared row: price range + TC max + T1 max + global cap
    const sharedRow = row(
      lbl(dur.toUpperCase(), '32px') +
      (mn != null && mx != null ? chip(mn + '¢ – ' + mx + '¢') : '') +
      (mxt   != null ? chip('TC ≤ ' + mxt   + '¢') : '') +
      (mxtSt != null ? chip('T1 ≤ ' + mxtSt + '¢') : '') +
      (globalCap != null ? chip('cap $' + globalCap) : '')
    );

    // Per-crypto rows (2 per line: BTC+ETH on row 1, SOL+XRP on row 2)
    const crCells = cryptos.map(cr => {
      const cxx = snap[`strategy${dur}_${cr}`] || globalCxx;
      const th  = snap[`threshold${dur}_${cr}`] ?? globalTh;
      const cap = snap[`maxTrade${dur}_${cr}`];
      const thStr  = th  != null ? th.toFixed(2)  + '%' : '—';
      const capStr = cap != null ? ' $' + cap : '';
      // Highlight if crypto-specific (differs from global)
      const cxxDiff = snap[`strategy${dur}_${cr}`] && snap[`strategy${dur}_${cr}`] !== globalCxx;
      const thDiff  = snap[`threshold${dur}_${cr}`] != null;
      const capDiff = cap != null;
      return `<span style="display:inline-flex;align-items:center;gap:2px;background:#111827;border:1px solid #2d3748;border-radius:4px;padding:2px 6px;">` +
        `<span style="color:#718096;font-size:9px;font-weight:700;">${cr}</span>` +
        `<span style="color:${cxxDiff?'#63b3ed':'#a0aec0'};font-size:10px;">${cxx}</span>` +
        `<span style="color:#4a5568;font-size:9px;">·</span>` +
        `<span style="color:${thDiff?'#f6e05e':'#a0aec0'};font-size:10px;">${thStr}</span>` +
        (capDiff ? `<span style="color:#4a5568;font-size:9px;">·</span><span style="color:#68d391;font-size:10px;">${capStr.trim()}</span>` : '') +
        `</span>`;
    });

    const crRow = row(lbl('', '0px') + crCells.join(''));
    return sharedRow + crRow;
  }

  listEl.innerHTML = _settingsHistory.map((snap, i) => {
    const dt    = new Date(snap.savedAt);
    const dtStr = dt.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' });

    // Options row
    const cbOn  = snap.circuitBreakerEnabled;
    const dlOn  = snap.drawdownLimitEnabled;
    const t1On  = snap.t1Mode;
    const t1StOn = snap.t1standalone === true;
    const nsfOn = snap.noSpikeFilter;
    const dm5v  = snap.distMin5m  > 0, dm15v = snap.distMin15m > 0;
    const rsk   = snap.riskPct != null ? (snap.riskPct * 100).toFixed(0) + '%' : null;
    const bpct  = snap.bodyPct  != null ? snap.bodyPct : null;

    const t0On  = snap.t0off !== true;
    const rowOpts = row(
      lbl('⚙') +
      (t0On ? on('T0') : off('T0 off')) +
      (t1StOn && t1On ? on('T1+TC') : t1StOn ? on('T1') : t1On ? on('TC') : off('T1/TC off')) +
      (cbOn  ? on('CB ' + snap.circuitBreakerMins + 'min') : off('CB off')) +
      (dlOn  ? on('DL ' + snap.drawdownLimitMaxLosses + 'L/' + snap.drawdownLimitWindowMins + 'm→' + snap.drawdownLimitPauseMins + 'm') : off('DL off')) +
      chip('MaxPos ' + (snap.maxPositions ?? 4)) +
      (dm5v  ? on('distMin5m '  + snap.distMin5m  + '%') : '') +
      (dm15v ? on('distMin15m ' + snap.distMin15m + '%') : '') +
      (bpct  != null ? chip('body ' + bpct + '%') : '') +
      (nsfOn ? warn('NO SPIKE FILTER') : '') +
      (rsk   ? chip('risk ' + rsk) : '')
    );

    // Locked thresholds
    const locks = Object.keys(snap.lockedThresholds || {}).filter(k => snap.lockedThresholds[k]);
    const rowLocks = locks.length
      ? row(lbl('🔒') + locks.map(k => warn(k.replace('threshold','th').replace(/_/g,' '))).join(''))
      : '';

    return `<div style="padding:7px 0;border-bottom:1px solid #1a2035;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:1px;">
        <div style="font-size:10px;color:#718096;">${dtStr}</div>
        <div style="display:flex;gap:4px;">
          <button onclick="restoreSettings(${i})" style="flex-shrink:0;background:#2d3748;color:#a0aec0;border:1px solid #4a5568;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;" title="Restore these settings">↺ Restore</button>
          <button onclick="deleteHistoryEntry(${i})" style="flex-shrink:0;background:#3d1515;color:#fc8181;border:1px solid #7c2020;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;" title="Delete this entry">✕</button>
        </div>
      </div>
      ${cryptoRows('5m', snap)}
      ${cryptoRows('15m', snap)}
      ${rowOpts}${rowLocks}
    </div>`;
  }).join('');
}

async function restoreSettings(i, _authed = false) {
  if (!_authed) { requirePassword(() => restoreSettings(i, true), 'Restore settings'); return; }
  const snap = _settingsHistory[i];
  if (!snap) return;
  // Build payload from snapshot (saveHistory:true will snapshot the current state before applying)
  const payload = { stratKey: 'LIVE', saveHistory: true };
  const fields = ['strategy5m','strategy15m','threshold5m','threshold15m',
    'minPrice5m','maxPrice5m','maxTrade5m','minPrice15m','maxPrice15m','maxTrade15m',
    'maxPriceT1_5m','maxPriceT1_15m','maxPriceT1standalone','t0off','t1Mode','t1standalone','circuitBreakerEnabled','circuitBreakerMins',
    'drawdownLimitEnabled','drawdownLimitMaxLosses','drawdownLimitWindowMins','drawdownLimitPauseMins',
    'maxPositions','distMin5m','distMin15m','riskPct','bodyPct','noSpikeFilter','lockedThresholds',
    'threshold5m_BTC','threshold5m_ETH','threshold5m_SOL','threshold5m_XRP',
    'threshold15m_BTC','threshold15m_ETH','threshold15m_SOL','threshold15m_XRP',
    'strategy5m_BTC','strategy5m_ETH','strategy5m_SOL','strategy5m_XRP',
    'strategy15m_BTC','strategy15m_ETH','strategy15m_SOL','strategy15m_XRP',
    'maxTrade5m_BTC','maxTrade5m_ETH','maxTrade5m_SOL','maxTrade5m_XRP',
    'maxTrade15m_BTC','maxTrade15m_ETH','maxTrade15m_SOL','maxTrade15m_XRP'];
  for (const f of fields) if (snap[f] !== undefined) payload[f] = snap[f];
  const r = await apiFetch('/t1000/config', 'POST', payload);
  if (r && !r.error) {
    await pollState();
  } else {
    alert('Restore error: ' + (r?.error || 'unknown'));
  }
}

async function deleteHistoryEntry(i, _authed = false) {
  if (!_authed) { requirePassword(() => deleteHistoryEntry(i, true), 'Delete history entry'); return; }
  const r = await apiFetch('/t1000/config', 'POST', { stratKey: 'LIVE', deleteHistoryIndex: i });
  if (r && !r.error) await pollState();
  else alert('Delete error: ' + (r?.error || 'unknown'));
}

// ─────────────────────────────────────────────────────────────────────────

// ── All Trades (DB-backed, paginated) ──────────────────────────────────────────

let allTradesCurrentPage = 1;
const ALL_TRADES_LIMIT   = 50;

function allTradesPage(delta) {
  loadAllTrades(allTradesCurrentPage + delta);
}

async function loadAllTrades(page) {
  page = page || allTradesCurrentPage;
  const body     = document.getElementById('all-trades-body');
  const prevBtn  = document.getElementById('all-trades-prev');
  const nextBtn  = document.getElementById('all-trades-next');
  const pageInfo = document.getElementById('all-trades-page-info');
  const totalEl  = document.getElementById('all-trades-total');
  if (!body) return;

  body.innerHTML = '<div class="empty-log" style="color:#718096;">Loading…</div>';
  try {
    const hideFailed = document.getElementById('all-trades-hide-failed')?.checked ? '&hideFailed=1' : '';
    const url  = `${API_BASE}/t1000/live-trades?strategy=LIVE,LIVE_MINI&page=${page}&limit=${ALL_TRADES_LIMIT}${hideFailed}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    allTradesCurrentPage = data.page;
    totalEl.textContent  = `(${data.total} total)`;
    pageInfo.textContent = `Page ${data.page} / ${data.pages || 1}`;
    prevBtn.disabled = data.page <= 1;
    nextBtn.disabled = data.page >= data.pages;

    if (!data.trades.length) {
      body.innerHTML = '<div class="empty-log">No trades in database yet. Trades are written on next save.</div>';
      return;
    }

    const rows = data.trades.map(e => {
      const t   = new Date(e.trade_time);
      const ts  = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const dateLabel = t.toLocaleDateString(undefined, { month: 'short', day: 'numeric',
        ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
      const dir = e.direction === 'UP'
        ? '<span class="dir-up">&#x25B2; UP</span>'
        : '<span class="dir-down">&#x25BC; DOWN</span>';
      const fillP   = e.entry_price   != null ? parseFloat(e.entry_price)   : null;
      const sigP    = e.signal_price  != null ? parseFloat(e.signal_price)  : null;
      const limP    = e.order_limit_price != null ? parseFloat(e.order_limit_price) : null;
      const slipC   = (fillP != null && sigP != null) ? Math.round((fillP - sigP) * 100) : null;
      let entry;
      if (fillP != null) {
        const fillStr = `${Math.round(fillP * 100)}&#x00A2;`;
        if (sigP != null && slipC !== 0) {
          const sigStr  = `${Math.round(sigP * 100)}&#x00A2;`;
          const slipCol = slipC > 0 ? '#fc8181' : '#68d391';
          const slipTip = limP != null ? ` title="Signal: ${Math.round(sigP*100)}¢ → Limit: ${Math.round(limP*100)}¢ → Fill: ${Math.round(fillP*100)}¢"` : '';
          const slipBadge = `<span style="color:${slipCol};font-size:9px;margin-left:2px">${slipC > 0 ? '+' : ''}${slipC}¢</span>`;
          entry = `<span${slipTip}>${sigStr}&#x2192;${fillStr}${slipBadge}</span>`;
        } else {
          entry = fillStr;
        }
      } else {
        entry = '&#x2014;';
      }
      const bet     = e.position_usd != null ? `$${parseFloat(e.position_usd).toFixed(2)}` : '&#x2014;';
      const spike   = e.spike_pct    != null ? `+${parseFloat(e.spike_pct).toFixed(2)}%` : '&#x2014;';
      const beatPct = e.spike_pct    != null ? `+${(parseFloat(e.spike_pct) * 100).toFixed(1)}%` : '&#x2014;';
      const is15m = parseInt(e.candle_size) >= 150;
      const typeBadge = is15m ? '<span class="badge-15m">15MIN</span>' : '<span class="badge-5m">5MIN</span>';
      const cfgKeyA = 'D_' + (e.trade_id || e.trade_time);
      _tradeConfigs[cfgKeyA] = e;

      let statusBadge, pnlStr;
      const pnl = e.pnl_usd != null ? parseFloat(e.pnl_usd) : null;
      const pos  = e.position_usd != null ? parseFloat(e.position_usd) : 0;
      if (e.status === 'WIN') {
        statusBadge = '<span class="badge badge-win">WIN</span>';
        const pct = (pnl != null && pos > 0) ? ` (${(pnl / pos * 100).toFixed(1)}%)` : '';
        pnlStr = pnl != null
          ? `<span style="color:#68d391">+$${pnl.toFixed(2)}${pct}</span>`
          : `<span style="color:#718096">…</span>`;
      } else if (e.status === 'LOSS') {
        statusBadge = '<span class="badge badge-loss">LOSS</span>';
        const pct = (pnl != null && pos > 0) ? ` (${(Math.abs(pnl) / pos * 100).toFixed(1)}%)` : '';
        pnlStr = pnl != null ? `<span style="color:#fc8181">-$${Math.abs(pnl).toFixed(2)}${pct}</span>` : '';
      } else if (e.status === 'FAILED') {
        statusBadge = '<span class="badge" style="background:#4a3300;color:#f6ad55">FAILED</span>';
        pnlStr = '<span style="color:#718096">—</span>';
      } else if (e.status === 'OPEN') {
        statusBadge = '<span class="badge" style="background:#1a3a38;color:#4fd1c5">OPEN</span>';
        pnlStr = '<span style="color:#718096">—</span>';
      } else {
        statusBadge = `<span class="badge" style="background:#2d2d4a;color:#9b8ed4">${e.status}</span>`;
        pnlStr = '<span style="color:#718096">—</span>';
      }

      let idCell;
      const cycleStartMs = e.cycle_start ? parseInt(e.cycle_start) : null;
      if (cycleStartMs && e.candle_size) {
        const url = polyUrlFE(e.crypto, cycleStartMs, parseInt(e.candle_size));
        idCell = url
          ? `<a href="${url}" target="_blank" style="color:#4fd1c5;text-decoration:none;">&#x1F4CA; ${e.trade_id || '&#x2014;'}</a>`
          : (e.trade_id || '&#x2014;');
      } else {
        idCell = e.trade_id || '&#x2014;';
      }

      const cxxAll = e.candle_size
        ? `<button onclick="openChartForTrade('${e.crypto}',${parseInt(e.candle_size)},${e.cycle_start ? parseInt(e.cycle_start) : 0},'${e.status}')" title="Open chart for ${e.crypto} C${e.candle_size}" style="background:none;border:none;color:#a0aec0;cursor:pointer;font-size:11px;padding:0;text-decoration:underline dotted;">C${e.candle_size}</button>`
        : '&#x2014;';
      const fokBadge = e.trade_id && e.trade_id.endsWith('_FOKR')
        ? '<span style="background:#2d3748;color:#718096;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #4a5568;">FOK</span>'
        : '';
      const methodAll = e.trade_id && e.trade_id.includes('_T1') ? 'T1' : 'T0';
      const methodBadgeAll = methodAll === 'T1'
        ? '<span style="background:#1a2d40;color:#63b3ed;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #2a4a6a;">T1</span>'
        : '<span style="background:#1a2820;color:#68d391;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #2a4a38;">T0</span>';
      const miniBadgeAll = e.strategy === 'LIVE_MINI'
        ? '<span style="background:#2d1f4a;color:#b794f4;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #553c9a;">MINI</span>'
        : '';
      const runBal = e.running_pnl != null ? parseFloat(e.running_pnl) : null;
      const runBalStr   = runBal != null ? (runBal >= 0 ? `+$${runBal.toFixed(2)}` : `-$${Math.abs(runBal).toFixed(2)}`) : '—';
      const runBalColor = runBal == null ? '#718096' : runBal > 0 ? '#68d391' : runBal < 0 ? '#fc8181' : '#e2e8f0';
      const bodyPctAll  = e.body_ratio != null ? `${parseFloat(e.body_ratio).toFixed(1)}%` : '—';
      const minSpikeAll = e.threshold  != null ? parseFloat(e.threshold).toFixed(2) + '%' : '—';
      let distPctAll = '—';
      if (pos > 0 && pnl != null) {
        const dpA = pnl / pos * 100;
        const dpASign  = dpA >= 0 ? '+' : '';
        const dpAColor = dpA >= 0 ? '#68d391' : '#fc8181';
        distPctAll = `<span style="color:${dpAColor}">${dpASign}${dpA.toFixed(1)}%</span>`;
      }
      const rowStyleAll = e.strategy === 'LIVE_MINI' ? ' style="background:rgba(120,80,200,0.22)"' : '';
      return `<tr${rowStyleAll}>
        <td>${ts}</td><td><strong>${e.crypto}</strong></td><td>${typeBadge}</td>
        <td><button onclick="showTradeConfig('${cfgKeyA}')" style="background:none;border:none;cursor:pointer;color:#90cdf4;font-size:11px;text-decoration:underline dotted;padding:0;font-weight:600;">Config</button></td><td>${cxxAll}</td>
        <td style="color:#718096;font-size:11px">${bodyPctAll}</td>
        <td>${dir}</td><td>${entry}</td><td>${bet}</td>
        <td style="color:#f6ad55">${spike}</td>
        <td style="color:#e8a84a;font-size:11px">${beatPct}</td>
        <td style="color:#ed8936;font-size:11px">${minSpikeAll}</td>
        <td>${idCell}</td><td>${methodBadgeAll}${fokBadge}${miniBadgeAll}</td><td>${statusBadge}</td><td>${pnlStr}</td>
        <td style="font-size:11px">${distPctAll}</td>
        <td style="color:${runBalColor};font-size:11px">${runBalStr}</td><td>${dateLabel}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `<div class="table-scroll"><table>
      <thead><tr>
        <th>Time</th><th>Crypto</th><th>Type</th><th style="font-size:11px">Config</th><th>Cxx</th><th style="color:#718096;font-size:11px">Body%</th><th>Dir</th>
        <th>Entry</th><th>Bet</th><th>Spike</th><th style="font-size:11px">Beat%</th><th style="font-size:11px;color:#ed8936">MinSpike</th><th>Market / ID</th><th style="font-size:11px">Method</th><th>Status</th><th>P&amp;L</th><th style="font-size:11px">Dist%</th><th>Bal</th><th>Date</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-log" style="color:#fc8181;">Error: ${err.message}</div>`;
    console.error('[all-trades] load error', err);
  }
}

// ── All Trades — Kalshi variant ───────────────────────────────────────────────
let kalshiAllTradesCurrentPage = 1;

function kalshiAllTradesPage(delta) {
  loadAllTradesKalshi(kalshiAllTradesCurrentPage + delta);
}

async function loadAllTradesKalshi(page) {
  page = page || kalshiAllTradesCurrentPage;
  const body     = document.getElementById('kalshi-all-trades-body');
  const prevBtn  = document.getElementById('kalshi-all-trades-prev');
  const nextBtn  = document.getElementById('kalshi-all-trades-next');
  const pageInfo = document.getElementById('kalshi-all-trades-page-info');
  const totalEl  = document.getElementById('kalshi-all-trades-total');
  if (!body) return;

  body.innerHTML = '<div class="empty-log" style="color:#718096;">Loading…</div>';
  try {
    const url  = `${API_BASE}/t1000/live-trades?strategy=LIVE_KALSHI&page=${page}&limit=${ALL_TRADES_LIMIT}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    kalshiAllTradesCurrentPage = data.page;
    if (totalEl)  totalEl.textContent  = `(${data.total} total)`;
    if (pageInfo) pageInfo.textContent = `Page ${data.page} / ${data.pages || 1}`;
    if (prevBtn)  prevBtn.disabled = data.page <= 1;
    if (nextBtn)  nextBtn.disabled = data.page >= data.pages;

    if (!data.trades.length) {
      body.innerHTML = '<div class="empty-log">No Kalshi trades in database yet.</div>';
      return;
    }

    const rows = data.trades.map(e => {
      const t   = new Date(e.trade_time);
      const ts  = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const dateLabel = t.toLocaleDateString(undefined, { month: 'short', day: 'numeric',
        ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
      const dir = e.direction === 'UP'
        ? '<span class="dir-up">&#x25B2; UP</span>'
        : '<span class="dir-down">&#x25BC; DOWN</span>';
      const entry = e.entry_price  != null ? `${(parseFloat(e.entry_price) * 100).toFixed(0)}&#x00A2;` : '&#x2014;';
      const bet   = e.position_usd != null ? `$${parseFloat(e.position_usd).toFixed(2)}` : '&#x2014;';
      const spike = e.spike_pct    != null ? `+${parseFloat(e.spike_pct).toFixed(2)}%`   : '&#x2014;';
      const is15m = parseInt(e.candle_size) >= 150;
      const typeBadge = is15m ? '<span class="badge-15m">15MIN</span>' : '<span class="badge-5m">5MIN</span>';
      const cfgKeyK = 'K_' + (e.trade_id || e.trade_time);
      _tradeConfigs[cfgKeyK] = e;

      let statusBadge, pnlStr;
      const pnl = e.pnl_usd      != null ? parseFloat(e.pnl_usd)      : null;
      const pos = e.position_usd != null ? parseFloat(e.position_usd) : 0;
      if (e.status === 'WIN') {
        statusBadge = '<span class="badge badge-win">WIN</span>';
        const pct = (pnl != null && pos > 0) ? ` (${(pnl / pos * 100).toFixed(1)}%)` : '';
        pnlStr = pnl != null ? `<span style="color:#68d391">+$${pnl.toFixed(2)}${pct}</span>` : '<span style="color:#718096">…</span>';
      } else if (e.status === 'LOSS') {
        statusBadge = '<span class="badge badge-loss">LOSS</span>';
        const pct = (pnl != null && pos > 0) ? ` (${(Math.abs(pnl) / pos * 100).toFixed(1)}%)` : '';
        pnlStr = pnl != null ? `<span style="color:#fc8181">-$${Math.abs(pnl).toFixed(2)}${pct}</span>` : '';
      } else if (e.status === 'FAILED') {
        statusBadge = '<span class="badge" style="background:#4a3300;color:#f6ad55">FAILED</span>';
        pnlStr = '<span style="color:#718096">—</span>';
      } else if (e.status === 'OPEN') {
        statusBadge = '<span class="badge" style="background:#1a3a38;color:#4fd1c5">OPEN</span>';
        pnlStr = '<span style="color:#718096">—</span>';
      } else {
        statusBadge = `<span class="badge" style="background:#2d2d4a;color:#9b8ed4">${e.status}</span>`;
        pnlStr = '<span style="color:#718096">—</span>';
      }

      const cxxAll = e.candle_size
        ? `<span style="color:#a0aec0;font-size:11px;">C${e.candle_size}</span>`
        : '&#x2014;';

      const bodyPctK = e.body_ratio != null ? `${parseFloat(e.body_ratio).toFixed(1)}%` : '—';
      return `<tr>
        <td>${ts}</td><td><strong>${e.crypto}</strong></td><td>${typeBadge}</td>
        <td><button onclick="showTradeConfig('${cfgKeyK}')" style="background:none;border:none;cursor:pointer;color:#90cdf4;font-size:11px;text-decoration:underline dotted;padding:0;font-weight:600;">Config</button></td><td>${cxxAll}</td>
        <td style="color:#718096;font-size:11px">${bodyPctK}</td>
        <td>${dir}</td><td>${entry}</td><td>${bet}</td>
        <td style="color:#f6ad55">${spike}</td>
        <td>${e.trade_id || '&#x2014;'}</td><td>${statusBadge}</td><td>${pnlStr}</td><td>${dateLabel}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `<div class="table-scroll"><table>
      <thead><tr>
        <th>Time</th><th>Crypto</th><th>Type</th><th style="font-size:11px">Config</th><th>Cxx</th><th style="color:#718096;font-size:11px">Body%</th><th>Dir</th>
        <th>Entry</th><th>Bet</th><th>Spike</th><th>Trade ID</th><th>Status</th><th>P&amp;L</th><th>Date</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-log" style="color:#fc8181;">Error: ${err.message}</div>`;
    console.error('[kalshi-all-trades] load error', err);
  }
}

