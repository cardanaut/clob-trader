// ── CLOB Trader — Rejection tracking: stats, list, modal ──

// ── Rejected candidates list ───────────────────────────────────────────────────
let _rejectedRows = [];
let _rejectedStats = null;
let _rejectedTotal = 0;
let _rejectedPage  = 1;
const REJECTED_PAGE_SIZE = 200;

async function fetchRejected(page) {
  page = page || _rejectedPage;
  try {
    const [data, stats] = await Promise.all([
      apiFetch(`/t1000/rejected?page=${page}&limit=${REJECTED_PAGE_SIZE}`, 'GET'),
      apiFetch('/t1000/rejected/stats', 'GET').catch(() => null),
    ]);
    _rejectedRows  = data?.rows  || [];
    _rejectedTotal = data?.total || 0;
    _rejectedPage  = data?.page  || page;
    _rejectedStats = stats;
    renderRejectedStats();
    renderRejected();
  } catch (e) { /* silent */ }
}

// ── Signal Stats charts ────────────────────────────────────────────────────────

// ── Signal Stats range helpers (EAT = UTC+3) ──────────────────────────────
const EAT_OFFSET    = 3 * 60 * 60 * 1000;
const STATS_LS_KEY  = 'polychamp_stats_range';

function toEATInput(utcMs) {
  return new Date(utcMs + EAT_OFFSET).toISOString().slice(0, 16);
}
function fromEATInput(str) {
  if (!str) return null;
  return new Date(str + ':00Z').getTime() - EAT_OFFSET;
}
function initStatsRange() {
  let range = null;
  try { range = JSON.parse(localStorage.getItem(STATS_LS_KEY)); } catch {}
  if (!range?.from || !range?.to) range = { from: Date.now() - 86400000, to: Date.now() };
  const elFrom = document.getElementById('stats-from');
  const elTo   = document.getElementById('stats-to');
  if (elFrom) elFrom.value = toEATInput(range.from);
  if (elTo)   elTo.value   = toEATInput(range.to);
}
function applyStatsRange() {
  const fromMs = fromEATInput(document.getElementById('stats-from')?.value);
  const toMs   = fromEATInput(document.getElementById('stats-to')?.value);
  if (!fromMs || !toMs || fromMs >= toMs) return;
  localStorage.setItem(STATS_LS_KEY, JSON.stringify({ from: fromMs, to: toMs }));
  loadSignalStats();
}
function setStatsPreset(days) {
  const toMs   = Date.now();
  const fromMs = toMs - days * 86400000;
  const elFrom = document.getElementById('stats-from');
  const elTo   = document.getElementById('stats-to');
  if (elFrom) elFrom.value = toEATInput(fromMs);
  if (elTo)   elTo.value   = toEATInput(toMs);
  localStorage.setItem(STATS_LS_KEY, JSON.stringify({ from: fromMs, to: toMs }));
  loadSignalStats();
}

async function loadSignalStats() {
  const body = document.getElementById('signal-stats-body');
  if (!body) return;
  body.innerHTML = '<div style="color:#718096;font-size:12px;padding:16px;">Loading…</div>';

  const live = state?.LIVE;
  if (!live) { body.innerHTML = '<div style="color:#fc8181;font-size:12px;padding:16px;">LIVE state not available</div>'; return; }

  const CRYPTOS = ['BTC','ETH','SOL','XRP'];
  const dur5m  = { label:'5m',  is15m: false };
  const dur15m = { label:'15m', is15m: true  };

  // Build pairs — one entry per crypto per timeframe (all CXX mixed)
  const pairsByDur = [dur5m, dur15m].map(dur => ({
    ...dur,
    pairs: CRYPTOS.map(cr => {
      const tKey  = dur.is15m ? `threshold15m_${cr}` : `threshold5m_${cr}`;
      const th    = live[tKey] ?? (dur.is15m ? live.threshold15m : live.threshold5m) ?? 0;
      const minP  = dur.is15m ? (live.minPrice15m ?? 0.05) : (live.minPrice5m ?? 0.05);
      const maxP  = dur.is15m ? (live.maxPrice15m ?? 0.89) : (live.maxPrice5m ?? 0.89);
      const bodyPct = live.bodyPct ?? 76;
      return { cr, tf: dur.label, th, minP, maxP, bodyPct };
    }),
  }));

  // Build pairs query: "BTC:5m:0.29:0.05:0.89,..." (crypto:tf:threshold:minP:maxP)
  const allPairs = pairsByDur.flatMap(d => d.pairs.map(p => `${p.cr}:${p.tf}:${p.th}:${p.minP}:${p.maxP}`));
  const unique   = [...new Set(allPairs)];

  let data;
  try {
    let range = null;
    try { range = JSON.parse(localStorage.getItem(STATS_LS_KEY)); } catch {}
    const toMs   = range?.to   ?? Date.now();
    const fromMs = range?.from ?? (toMs - 86400000);
    data = await PolyChampAPI.request('GET', `/t1000/signal-stats?pairs=${unique.join(',')}&from=${fromMs}&to=${toMs}`);
  } catch(e) {
    body.innerHTML = `<div style="color:#fc8181;padding:16px;">Error: ${e.message}</div>`;
    return;
  }

  const fmtDateHdr = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  let html = '';
  for (const dur of pairsByDur) {
    if (!dur.pairs.length) continue;
    const allSec   = dur.pairs.flatMap(p => data[`${p.cr}:${p.tf}`] || []);
    const secTMin  = allSec.length ? Math.min(...allSec.map(s => s.ts)) : null;
    const secTMax  = allSec.length ? Math.max(...allSec.map(s => s.ts)) : null;
    const periodStr = secTMin ? `${fmtDateHdr(secTMin)} – ${fmtDateHdr(secTMax)}` : '';
    html += `<div class="sstats-section">
      <div class="sstats-section-label">${dur.label === '5m' ? '5-Minute Markets' : '15-Minute Markets'} <span style="font-size:10px;color:#718096;font-weight:normal;margin-left:8px;">${periodStr}</span></div>
      <div class="sstats-grid">`;
    for (const p of dur.pairs) {
      const key      = `${p.cr}:${p.tf}`;
      const signals  = data[key] || [];
      const pTMin    = signals.length ? Math.min(...signals.map(s => s.ts)) : secTMin;
      const pTMax    = signals.length ? Math.max(...signals.map(s => s.ts)) : secTMax;
      const withPrice = signals.filter(s => s.entry_price != null);
      const nBelow    = withPrice.filter(s => parseFloat(s.entry_price) < p.minP).length;
      const nAbove    = withPrice.filter(s => parseFloat(s.entry_price) > p.maxP).length;
      const nPass     = withPrice.length - nBelow - nAbove;
      html += `<div class="sstats-pair">
        <div class="sstats-pair-label">${p.cr} · ${p.tf.toUpperCase()}</div>
        <div class="sstats-charts">
          ${drawScatterSvg(signals, 'spike',  p.th,   0,    null, p.th,    p.bodyPct, p.minP, p.maxP, pTMin, pTMax)}
          ${drawScatterSvg(signals, 'price',  p.minP, 0,    1,   p.th,    p.bodyPct, p.minP, p.maxP, pTMin, pTMax)}
        </div>
        <div style="font-size:10px;display:flex;gap:8px;justify-content:center;margin-top:3px;padding-top:3px;border-top:1px solid #1a2535;">
          <span style="color:#63b3ed;">↓ ${nBelow} &lt;${Math.round(p.minP*100)}¢</span>
          <span style="color:#68d391;">✓ ${nPass} pass</span>
          <span style="color:#fc8181;">↑ ${nAbove} &gt;${Math.round(p.maxP*100)}¢</span>
        </div>
      </div>`;
    }
    html += `</div></div>`;
  }
  body.innerHTML = html || '<div style="color:#718096;padding:16px;">No data</div>';
}

function drawScatterSvg(signals, metric, threshold, yMin, yMax, th, bodyPct, minP, maxP, forceTMin, forceTMax) {
  const W = 200, H = 114;
  const PL = 22, PR = 6, PT = 14, PB = 20; // padding
  const cW = W - PL - PR, cH = H - PT - PB;
  const fmtDate = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Extract Y values for this metric
  const getY = s => {
    if (metric === 'spike') return s.spike_pct != null ? Math.abs(parseFloat(s.spike_pct)) : null;
    if (metric === 'body')  return s.body_ratio != null ? parseFloat(s.body_ratio) : null;
    if (metric === 'price') return s.entry_price != null ? parseFloat(s.entry_price) : null;
    return null;
  };

  // Determine dot color per signal per metric
  const getColor = s => {
    if (s.reason === 'WIN' || s.reason === 'LOSS' || s.reason === 'traded') return '#68d391';
    if (metric === 'spike' && s.reason === 'below_threshold') return '#fc8181';
    if (metric === 'body'  && s.reason === 'weak_body')       return '#fc8181';
    if (metric === 'price' && (s.reason === 'price_too_low' || s.reason === 'price_too_high')) return '#fc8181';
    return '#4a5568';
  };

  const pts = signals.map(s => ({ y: getY(s), color: getColor(s), ts: s.ts, cs: s.candle_size, reason: s.reason }))
                     .filter(p => p.y != null);

  // Auto-scale Y if yMax is null
  const allY = pts.map(p => p.y);
  const dataMax = allY.length ? Math.max(...allY) : (threshold * 2 || 1);
  const dataMin = allY.length ? Math.min(...allY) : 0;
  const yLo = yMin ?? Math.min(dataMin * 0.9, threshold * 0.5);
  const yHi = yMax ?? Math.max(dataMax * 1.1, threshold * 1.5);
  const yRange = yHi - yLo || 1;

  // Time scale — use forced bounds (shared per pair) when provided
  const tMin = forceTMin ?? (pts.length ? Math.min(...pts.map(p => p.ts)) : (Date.now() - 86400000));
  const tMax = forceTMax ?? (pts.length ? Math.max(...pts.map(p => p.ts)) : Date.now());
  const tRange = tMax - tMin || 1;

  const toX = ts  => PL + ((ts - tMin) / tRange) * cW;
  const toY = val => PT + (1 - (val - yLo) / yRange) * cH;
  const thY  = toY(threshold);

  // Y-axis labels
  const fmtY = v => metric === 'spike' ? `${(v*100).toFixed(0)}b` :
                    metric === 'body'  ? `${v.toFixed(0)}%` :
                                        `${(v*100).toFixed(0)}¢`;

  const titleMap = { spike: 'Spike %', body: 'Body %', price: 'Entry Price' };
  const thColor  = metric === 'price' ? '#63b3ed' : '#f6ad55';

  let dots = pts.map(p => {
    const x = toX(p.ts), y = toY(p.y);
    const tip = `C${p.cs ?? '?'} · ${(p.reason ?? '').replace(/_/g,' ')}`;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${p.color}" opacity="0.85"><title>${tip}</title></circle>`;
  }).join('');

  // Extra threshold lines + count annotations for price chart
  let extraLines = '';
  if (metric === 'price') {
    const nBelow   = pts.filter(p => p.y < threshold).length;
    const nAbove   = pts.filter(p => p.y > maxP).length;
    const nPass    = pts.length - nBelow - nAbove;
    const maxY2    = toY(maxP);
    const midPassY = (thY + maxY2) / 2;
    extraLines = `<line x1="${PL}" y1="${maxY2.toFixed(1)}" x2="${W-PR}" y2="${maxY2.toFixed(1)}" stroke="#fc8181" stroke-width="0.8" stroke-dasharray="3,2"/>
    <text x="${W-PR+1}" y="${(maxY2+3).toFixed(1)}" fill="#fc8181" font-size="5.5">${fmtY(maxP)}</text>
    <text x="${PL+2}" y="${(maxY2-1.5).toFixed(1)}" fill="#fc8181" font-size="5" opacity="0.9">↑${nAbove}</text>
    <text x="${PL+2}" y="${(midPassY+2).toFixed(1)}" fill="#68d391" font-size="5" opacity="0.9">✓${nPass}</text>
    <text x="${PL+2}" y="${(thY+8).toFixed(1)}" fill="#63b3ed" font-size="5" opacity="0.9">↓${nBelow}</text>`;
  }

  return `<div class="sstats-chart-wrap">
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#0d1420" rx="3"/>
      <!-- chart area border -->
      <rect x="${PL}" y="${PT}" width="${cW}" height="${cH}" fill="#111827" rx="2"/>
      <!-- title -->
      <text x="${PL+2}" y="${PT-3}" fill="#4a5568" font-size="7" font-family="monospace">${titleMap[metric]}</text>
      <!-- threshold line -->
      <line x1="${PL}" y1="${thY.toFixed(1)}" x2="${W-PR}" y2="${thY.toFixed(1)}" stroke="${thColor}" stroke-width="0.9" stroke-dasharray="3,2"/>
      <text x="${W-PR+1}" y="${(thY+3).toFixed(1)}" fill="${thColor}" font-size="5.5">${fmtY(threshold)}</text>
      ${extraLines}
      <!-- dots -->
      ${dots}
      <!-- y-axis labels -->
      <text x="${PL-2}" y="${(PT+5).toFixed(1)}" fill="#4a5568" font-size="5.5" text-anchor="end">${fmtY(yHi)}</text>
      <text x="${PL-2}" y="${(PT+cH).toFixed(1)}" fill="#4a5568" font-size="5.5" text-anchor="end">${fmtY(yLo)}</text>
      <!-- x-axis date labels -->
      <text x="${PL}" y="${H-8}" fill="#2d3748" font-size="5" text-anchor="start">${fmtDate(tMin)}</text>
      <text x="${W-PR}" y="${H-8}" fill="#2d3748" font-size="5" text-anchor="end">${fmtDate(tMax)}</text>
      <!-- point count -->
      <text x="${W-PR}" y="${H-2}" fill="#2d3748" font-size="5" text-anchor="end">${pts.length}pt</text>
    </svg>
  </div>`;
}

function renderRejectedStats() {
  const el = document.getElementById('rejected-stats');
  if (!el || !_rejectedStats?.byReason) { if (el) el.style.display = 'none'; return; }
  const { byReason } = _rejectedStats;
  const reasonLabel = {
    below_threshold:    'LOW SPIKE', weak_body: 'WEAK BODY',   bad_slot: 'BAD SLOT',
    dir_filter:         'DIR FILT',  time_filter: 'TIME FILT',  coord_wait: 'COORD WAIT',
    no_liquidity:       'NO LIQUID', price_too_high: 'PRICE↑',  price_too_low: 'PRICE↓',
    already_pending:    'PENDING',   asset_already_open: 'OPEN', max_positions: 'MAX POS',
    signal_too_stale:   'STALE',
  };
  const reasonBg = {
    below_threshold:    '#1e2235', weak_body: '#3d2a00', bad_slot: '#3d2a00',
    dir_filter:         '#1a2535', time_filter: '#1a2535', coord_wait: '#1a2535',
    no_liquidity:       '#3d1515', price_too_high: '#3d1515', price_too_low: '#3d1515',
    already_pending:    '#1a2535', asset_already_open: '#1a2535', max_positions: '#1a2535',
    signal_too_stale:   '#2d2d2d',
  };
  const pills = Object.entries(byReason)
    .sort((a,b) => b[1].total - a[1].total)
    .map(([reason, s]) => {
      const label = reasonLabel[reason] || reason.replace(/_/g,' ').toUpperCase();
      const bg    = reasonBg[reason]    || '#1e2235';
      const fprStr = s.fpr != null
        ? `<span style="color:${s.fpr>=60?'#fc8181':s.fpr>=30?'#f6ad55':'#68d391'};font-weight:700;margin-left:5px;">${s.fpr}% FP</span>`
        : '';
      const known = s.WIN + s.LOSS;
      const title = `${s.total} total | ${s.WIN} would-WIN | ${s.LOSS} correct-SKIP | ${s.unknown} unknown`;
      return `<span title="${title}" style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:4px;${bg ? `background:${bg};` : ''}font-size:11px;cursor:default;">
        <span style="color:#a0aec0">${label}</span>
        <span style="color:#718096">${s.total}</span>
        ${fprStr}
      </span>`;
    }).join('');
  el.innerHTML = pills;
  el.style.display = pills ? 'flex' : 'none';
}

function renderRejected() {
  const el = document.getElementById('log-rejected');
  const cnt = document.getElementById('rejected-count');
  if (!el) return;
  const rows = _rejectedRows;
  if (cnt) cnt.textContent = _rejectedTotal ? `(${_rejectedTotal})` : '';
  // Update pagination controls
  const prevBtn  = document.getElementById('rej-prev');
  const nextBtn  = document.getElementById('rej-next');
  const pageInfo = document.getElementById('rej-page-info');
  const pages    = Math.ceil(_rejectedTotal / REJECTED_PAGE_SIZE) || 1;
  if (prevBtn)  prevBtn.disabled  = _rejectedPage <= 1;
  if (nextBtn)  nextBtn.disabled  = _rejectedPage >= pages;
  if (pageInfo) pageInfo.textContent = _rejectedTotal > REJECTED_PAGE_SIZE ? `p${_rejectedPage}/${pages}` : '';
  if (!rows.length) { el.innerHTML = '<div class="empty-log">No rejected candidates (last 30 days)</div>'; return; }

  const reasonStyle = {
    below_threshold:    'background:#1e2235;color:#718096',
    weak_body:          'background:#3d2a00;color:#f6ad55',
    bad_slot:           'background:#3d2a00;color:#f6ad55',
    dir_filter:         'background:#1a2535;color:#718096',
    time_filter:        'background:#1a2535;color:#718096',
    coord_wait:         'background:#1a2535;color:#718096',
    no_liquidity:       'background:#3d1515;color:#fc8181',
    price_too_high:     'background:#3d1515;color:#fc8181',
    price_too_low:      'background:#3d1515;color:#fc8181',
    price_out_of_range: 'background:#2d2000;color:#d4a14a',
    low_vol:            'background:#0d2010;color:#4fd17a',
    already_pending:    'background:#1a2535;color:#718096',
    asset_already_open: 'background:#1a2535;color:#718096',
    max_positions:      'background:#1a2535;color:#718096',
    signal_too_stale:   'background:#2d2d2d;color:#718096',
  };
  const reasonLabel = {
    below_threshold:    'LOW SPIKE',
    weak_body:          'WEAK BODY',
    bad_slot:           'BAD SLOT',
    dir_filter:         'DIR FILT',
    time_filter:        'TIME FILT',
    coord_wait:         'COORD WAIT',
    no_liquidity:       'NO LIQUID',
    price_too_high:     'PRICE HIGH',
    price_too_low:      'PRICE LOW',
    price_out_of_range: 'PRICE OOR',
    low_vol:            'LOW VOL',
    already_pending:    'PENDING',
    asset_already_open: 'OPEN',
    max_positions:      'MAX POS',
    signal_too_stale:   'STALE',
  };

  const tableRows = rows.map(r => {
    const t = new Date(r.created_at);
    const ts = t.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    const dateLabel = t.toLocaleDateString(undefined, { month:'short', day:'numeric',
      ...(t.getFullYear() !== new Date().getFullYear() ? { year:'numeric' } : {}) });
    const typeBadge = r.candle_size >= 150
      ? '<span class="badge-15m">15MIN</span>'
      : '<span class="badge-5m">5MIN</span>';
    const dir = r.direction === 'UP'
      ? '<span class="dir-up">&#x25B2; UP</span>'
      : '<span class="dir-down">&#x25BC; DOWN</span>';
    const spike = `+${parseFloat(r.spike_pct).toFixed(2)}%`;
    const entry = r.entry_price != null ? `${(parseFloat(r.entry_price)*100).toFixed(0)}&#x00A2;` : '&#x2014;';

    // Market link — show cycle time as label
    const cycleStartMs = r.cycleStartSec
      ? r.cycleStartSec * 1000
      : (() => { const dur = r.candle_size >= 150 ? 900000 : 300000; return Math.floor(t.getTime() / dur) * dur; })();
    const mktUrl = polyUrlFE(r.crypto, cycleStartMs, r.candle_size);
    const cycleTime = new Date(cycleStartMs).toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit', hour12:false });
    const mktCell = mktUrl
      ? `<a href="${mktUrl}" target="_blank" style="color:#4fd1c5;text-decoration:none;">&#x1F4CA; ${cycleTime}</a>`
      : `<span style="color:#718096">${cycleTime}</span>`;

    // Reason chip (col 1) + detail text (col 2)
    const rStyle = reasonStyle[r.reason] || 'background:#1e2235;color:#718096';
    const rLabel = reasonLabel[r.reason] || r.reason.replace(/_/g,' ').toUpperCase();
    const d = r.details ? (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) : null;
    let detail = '';
    if (r.reason === 'below_threshold' && r.threshold != null)
      detail = `${parseFloat(r.spike_pct).toFixed(2)}% / ${parseFloat(r.threshold).toFixed(2)}%`;
    else if (d) {
      if      (r.reason === 'weak_body'      && d.body_ratio != null) detail = `${d.body_ratio}% / 76%`;
      else if (r.reason === 'price_too_high' && d.max_c      != null) detail = `${d.max_c}&#x00A2; max`;
      else if (r.reason === 'price_too_low'  && d.min_c      != null) detail = `${d.min_c}&#x00A2; min`;
    }

    // Method badge (T0/T1/TC)
    const methodRej = (d?.slot) || 'T0';
    const methodBadgeRej = methodRej === 'T1'
      ? '<span style="background:#1a2d40;color:#63b3ed;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #2a4a6a;">T1</span>'
      : methodRej === 'TC'
        ? '<span style="background:#2d1f4a;color:#b794f4;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #553c9a;">TC</span>'
        : '<span style="background:#1a2820;color:#68d391;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #2a4a38;">T0</span>';

    // Outcome badge
    let outcomeBadge = '<span style="color:#4a5568">&#x2014;</span>';
    if (r.outcome) {
      const wouldWin = r.outcome === r.direction;
      outcomeBadge = wouldWin
        ? '<span class="badge" style="background:#4a3300;color:#f6ad55" title="Would have been a WIN — rejection missed a profit">WIN</span>'
        : '<span class="badge badge-win" title="Would have been a LOSS — rejection was correct">OK</span>';
    }

    const trBg = r.reason === 'low_vol'           ? 'background:#081a0f;'
               : r.reason === 'price_out_of_range' ? 'background:#1a1200;'
               : '';
    return `<tr style="${trBg}">
      <td>${ts}</td>
      <td><strong>${r.crypto}</strong></td>
      <td>${typeBadge}</td>
      <td style="color:#a0aec0">C${r.candle_size}</td>
      <td>${methodBadgeRej}</td>
      <td>${dir}</td>
      <td style="color:#f6ad55">${spike}</td>
      <td>${entry}</td>
      <td>${mktCell}</td>
      <td><span class="badge" style="${rStyle}">${rLabel}</span></td>
      <td style="color:#718096;font-size:11px">${detail}</td>
      <td>${outcomeBadge}</td>
      <td style="color:#718096;font-size:10px">${dateLabel}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<div class="table-scroll"><table>
    <thead><tr>
      <th>Time</th><th>Crypto</th><th>Type</th><th>Cxx</th><th style="font-size:11px">Method</th><th>Dir</th>
      <th>Spike</th><th>Entry</th><th>Market</th><th>Reason</th><th>Detail</th><th>Outcome</th><th>Date</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table></div>`;
}

async function clearRejected() {
  if (!confirm('Clear all rejected candidates from DB?')) return;
  await apiFetch('/t1000/rejected', 'DELETE');
  _rejectedRows = []; _rejectedTotal = 0; _rejectedPage = 1; _rejectedStats = null;
  renderRejectedStats();
  renderRejected();
}

function exportRejectedJSON() {
  if (!_rejectedRows.length) { alert('No rejected rows loaded.'); return; }
  const blob = new Blob([JSON.stringify(_rejectedRows, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `rejected-${new Date().toISOString().slice(0,16).replace(/:/g,'-')}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Rejected tab hidden — polling disabled
// setInterval(() => fetchRejected(_rejectedPage), 30000);
// fetchRejected(1);


// ─────────────────────────────────────────────────────────────────────────

// ── Rejected Signals Modal ────────────────────────────────────────────────────
let _rejRows = [];
let _rejFilter = 'all';
let _rejLiveContext = { balance: null, riskPct: null };

const REJ_REASON_LABELS = {
  price_too_high : 'price-hi',
  price_too_low  : 'price-lo',
  weak_body      : 'weak-body',
  low_vol        : 'low-vol',
  low_dist       : 'low-dist',
  circuit_breaker: 'circ-brk',
  drawdown_limit : 'drwl',
  max_positions  : 'max-pos',
  price_out_of_range: 'price-range',
  no_tier_match  : 'no-tier',
  below_threshold: 'low-spike',
};
const REJ_REASON_COLORS = {
  price_too_high : ['#7c3617','#f6ad55'],
  price_too_low  : ['#7c3617','#f6ad55'],
  price_out_of_range: ['#7c3617','#f6ad55'],
  weak_body      : ['#1a3050','#63b3ed'],
  low_vol        : ['#1a2a3a','#4299e1'],
  low_dist       : ['#1a2a3a','#4299e1'],
  circuit_breaker: ['#2d2008','#d69e2e'],
  drawdown_limit : ['#2d2008','#d69e2e'],
  max_positions  : ['#2d1515','#fc8181'],
  no_tier_match  : ['#1a1f2a','#718096'],
  below_threshold: ['#1a1f2a','#4a5568'],
};

async function openRejModal() {
  document.getElementById('rejOverlay').classList.add('open');
  document.getElementById('rej-modal-body').innerHTML =
    '<tr><td colspan="11" style="padding:20px;text-align:center;color:#718096;">Loading…</td></tr>';
  _rejFilter = 'all';
  try {
    const data = await apiFetch('/t1000/rejected?limit=500', 'GET');
    _rejRows = data?.rows || [];
    renderRejFilterPills();
    renderRejModal();
  } catch(e) {
    document.getElementById('rej-modal-body').innerHTML =
      '<tr><td colspan="11" style="padding:20px;text-align:center;color:#fc8181;">Failed to load</td></tr>';
  }
}

function closeRejModal() {
  document.getElementById('rejOverlay').classList.remove('open');
}

function rejOverlayClick(e) {
  if (e.target === document.getElementById('rejOverlay')) closeRejModal();
}

function renderRejFilterPills() {
  const showAll = document.getElementById('rej-show-all')?.checked;
  const src = showAll ? _rejRows : _rejRows.filter(r => r.reason !== 'below_threshold');
  // count by reason
  const counts = {};
  for (const r of src) counts[r.reason] = (counts[r.reason] || 0) + 1;
  const reasons = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);

  const row = document.getElementById('rej-filter-row');
  if (!row) return;
  const allBtn = `<button onclick="setRejFilter('all')" data-rf="all"
    style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;
    border:1px solid ${_rejFilter==='all'?'#63b3ed':'#2d3748'};
    background:${_rejFilter==='all'?'#1e3a5f':'#1a1f2a'};
    color:${_rejFilter==='all'?'#63b3ed':'#718096'};">All (${src.length})</button>`;
  const pills = reasons.map(r => {
    const lbl  = REJ_REASON_LABELS[r] || r;
    const cols = REJ_REASON_COLORS[r]  || ['#1a1f2a','#a0aec0'];
    const active = _rejFilter === r;
    return `<button onclick="setRejFilter('${r}')" data-rf="${r}"
      style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;
      border:1px solid ${active?cols[1]:'#2d3748'};
      background:${active?cols[0]:'#1a1f2a'};
      color:${active?cols[1]:'#718096'};">${lbl} (${counts[r]})</button>`;
  }).join('');
  row.innerHTML = allBtn + pills;
}

function setRejFilter(f) {
  _rejFilter = f;
  renderRejFilterPills();
  renderRejModal();
}

function renderRejModal() {
  const showAll = document.getElementById('rej-show-all')?.checked;
  let rows = showAll ? _rejRows : _rejRows.filter(r => r.reason !== 'below_threshold');
  if (_rejFilter !== 'all') rows = rows.filter(r => r.reason === _rejFilter);

  const countEl = document.getElementById('rej-modal-count');
  if (countEl) countEl.textContent = `${rows.length} signal${rows.length!==1?'s':''}`;

  // ── Stats panel ──────────────────────────────────────────────────────────────
  const statsPanel = document.getElementById('rej-stats-panel');
  const wrEl       = document.getElementById('rej-modal-wr');
  const resolved   = rows.filter(r => r.outcome);
  const totalRes   = resolved.length;

  if (statsPanel && totalRes > 0) {
    const { balance, riskPct } = _rejLiveContext;
    const miniPos = (balance != null && riskPct != null)
      ? Math.max(balance * riskPct / 10, 2)
      : null;

    // PNL for one resolved row using mini position
    const calcPnl = (r, pos) => {
      if (!r.outcome || !pos) return null;
      const ep = parseFloat(r.entry_price);
      if (!ep || ep <= 0 || ep >= 1) return null;
      return r.direction === r.outcome ? pos / ep - pos : -pos;
    };

    const fmtWr = (w, t) => {
      if (!t) return '<span style="color:#4a5568">—</span>';
      const pct = w / t * 100;
      const col = pct >= 75 ? '#68d391' : pct >= 55 ? '#f6ad55' : '#fc8181';
      return `<span style="color:${col};font-weight:700">${pct.toFixed(1)}%</span><span style="color:#4a5568;font-size:10px;"> (${w}/${t})</span>`;
    };
    const fmtPnl = v => {
      if (v == null) return '<span style="color:#4a5568">—</span>';
      const col = v > 0 ? '#68d391' : v < 0 ? '#fc8181' : '#a0aec0';
      return `<span style="color:${col};font-weight:700">${v >= 0 ? '+' : ''}$${v.toFixed(2)}</span>`;
    };
    // EV per trade as % of position (positive = exploitable)
    // Formula: WR × (1/avgEntry − 1) − (1−WR)
    // Break-even: WR = avgEntry (e.g. 80% WR is profitable only if avg entry < 80¢)
    const calcEv = (wr, avgEntry) => {
      if (!avgEntry || avgEntry <= 0 || avgEntry >= 1) return null;
      return wr * (1 / avgEntry - 1) - (1 - wr);
    };
    const fmtEv = (ev, miniP) => {
      if (ev == null) return '<span style="color:#4a5568">—</span>';
      const pct = (ev * 100).toFixed(1);
      const col = ev > 0.02 ? '#68d391' : ev > -0.02 ? '#f6ad55' : '#fc8181';
      const dollar = miniP != null ? ` <span style="color:#4a5568;font-size:10px;">(${ev >= 0 ? '+' : ''}$${(ev * miniP).toFixed(2)}/tr)</span>` : '';
      return `<span style="color:${col};font-weight:700">${ev >= 0 ? '+' : ''}${pct}%</span>${dollar}`;
    };
    const exploitBadge = ev => {
      if (ev == null) return '';
      if (ev > 0.03)  return ' <span style="background:#1a3a1a;color:#68d391;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">✓ explore</span>';
      if (ev > 0)     return ' <span style="background:#2a2a15;color:#d4c44a;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">~ marginal</span>';
      return ' <span style="background:#2a1515;color:#fc8181;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">✗ skip</span>';
    };

    // Overall
    const oWins = resolved.filter(r => r.direction === r.outcome).length;
    const oPnl  = miniPos != null
      ? resolved.reduce((s, r) => { const p = calcPnl(r, miniPos); return p != null ? s + p : s; }, 0)
      : null;
    const oEntrySum = resolved.reduce((s, r) => { const ep = parseFloat(r.entry_price); return ep > 0 && ep < 1 ? s + ep : s; }, 0);
    const oEntryCnt = resolved.filter(r => { const ep = parseFloat(r.entry_price); return ep > 0 && ep < 1; }).length;
    const oAvgEntry = oEntryCnt > 0 ? oEntrySum / oEntryCnt : null;
    const oEv = calcEv(oWins / totalRes, oAvgEntry);

    // Per-reason (excl. below_threshold)
    const reasonMap = {};
    for (const r of rows) {
      if (r.reason === 'below_threshold') continue;
      if (!reasonMap[r.reason]) reasonMap[r.reason] = { total: 0, resolved: 0, wins: 0, pnl: 0, entrySum: 0, entryCnt: 0 };
      const g = reasonMap[r.reason];
      g.total++;
      const ep = parseFloat(r.entry_price);
      if (ep > 0 && ep < 1) { g.entrySum += ep; g.entryCnt++; }
      if (r.outcome) {
        g.resolved++;
        if (r.direction === r.outcome) g.wins++;
        const p = calcPnl(r, miniPos);
        if (p != null) g.pnl += p;
      }
    }

    const LABELS = {
      below_threshold: 'below-thresh', weak_body: 'weak-body', low_vol: 'low-vol',
      low_dist: 'low-dist', circuit_breaker: 'circ-brk', price_too_high: 'price-hi',
      price_too_low: 'price-lo', asset_already_open: 'open', max_positions: 'max-pos',
      drawdown_limit: 'drwl', no_tier_match: 'no-tier', signal_too_stale: 'stale',
      price_out_of_range: 'price-oor', no_liquidity: 'no-liq', below_minimum: 'below-min',
    };

    const miniStr = miniPos != null
      ? `<span style="color:#a0aec0">mini: <b>$${miniPos.toFixed(2)}</b>/trade</span>`
      : '<span style="color:#4a5568">set LIVE risk% to see PNL</span>';

    const reasonRows = Object.entries(reasonMap)
      .map(([reason, g]) => {
        const avgEntry = g.entryCnt > 0 ? g.entrySum / g.entryCnt : null;
        const wr = g.resolved > 0 ? g.wins / g.resolved : null;
        const ev = wr != null ? calcEv(wr, avgEntry) : null;
        return { reason, g, avgEntry, wr, ev };
      })
      .sort((a, b) => {
        // Sort by EV desc (null last), then total desc
        if (a.ev != null && b.ev != null) return b.ev - a.ev;
        if (a.ev != null) return -1;
        if (b.ev != null) return 1;
        return b.g.total - a.g.total;
      })
      .map(({ reason, g, avgEntry, wr, ev }) => {
        const cols = REJ_REASON_COLORS[reason] || ['#1a1f2a','#a0aec0'];
        const lbl  = `<span style="background:${cols[0]};color:${cols[1]};padding:1px 6px;border-radius:3px;font-size:11px;font-weight:700;white-space:nowrap;">${LABELS[reason] || reason}</span>`;
        const wrFmt  = wr != null ? fmtWr(g.wins, g.resolved) : '<span style="color:#4a5568">—</span>';
        const evFmt  = fmtEv(ev, miniPos);
        const entryFmt = avgEntry != null ? `<span style="color:#718096">${Math.round(avgEntry*100)}¢</span>` : '<span style="color:#4a5568">—</span>';
        const pnlFmt = (miniPos != null && g.resolved > 0) ? fmtPnl(g.pnl) : '<span style="color:#4a5568">—</span>';
        const exploit = exploitBadge(ev);
        return `<tr>
          <td style="padding:3px 10px 3px 0;white-space:nowrap;">${lbl}${exploit}</td>
          <td style="padding:3px 10px;color:#718096;text-align:right;">${g.total}</td>
          <td style="padding:3px 10px;">${wrFmt}</td>
          <td style="padding:3px 8px;text-align:right;">${entryFmt}</td>
          <td style="padding:3px 10px;">${evFmt}</td>
          <td style="padding:3px 10px;">${pnlFmt}</td>
        </tr>`;
      }).join('');

    const oAvgStr = oAvgEntry != null ? ` · avg entry <b>${Math.round(oAvgEntry*100)}¢</b>` : '';
    statsPanel.style.display = '';
    statsPanel.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:20px;flex-wrap:wrap;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #2d3748;">
        <span style="color:#a0aec0;">WR: ${fmtWr(oWins, totalRes)}</span>
        <span style="color:#a0aec0;">EV/trade: ${fmtEv(oEv, miniPos)}</span>
        <span style="color:#a0aec0;">Est. PNL: ${fmtPnl(oPnl)}</span>
        <span style="color:#718096;font-size:11px;">${oAvgStr}</span>
        ${miniStr}
      </div>
      <table style="border-collapse:collapse;width:100%;">
        <thead><tr style="color:#4a5568;font-size:10px;text-transform:uppercase;letter-spacing:.06em;">
          <th style="padding:2px 10px 4px 0;text-align:left;">Reason</th>
          <th style="padding:2px 10px 4px;text-align:right;">Sig</th>
          <th style="padding:2px 10px 4px;text-align:left;">WR%</th>
          <th style="padding:2px 8px 4px;text-align:right;">Avg entry</th>
          <th style="padding:2px 10px 4px;text-align:left;">EV/trade</th>
          <th style="padding:2px 10px 4px;text-align:left;">Est. PNL</th>
        </tr></thead>
        <tbody>${reasonRows}</tbody>
      </table>`;

    if (wrEl) {
      wrEl.style.display = 'none'; // handled inside panel now
    }
  } else {
    if (statsPanel) statsPanel.style.display = 'none';
    if (wrEl) wrEl.style.display = 'none';
  }

  renderRejFilterPills();

  const tbody = document.getElementById('rej-modal-body');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="padding:20px;text-align:center;color:#718096;">No rejections</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const t = new Date(r.created_at);
    const ts = t.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const dateStr = t.toLocaleDateString('en-GB', {day:'2-digit',month:'short'});

    const dir = r.direction === 'UP'
      ? '<span style="color:#68d391">▲ UP</span>'
      : '<span style="color:#fc8181">▼ DN</span>';

    const spike = parseFloat(r.spike_pct).toFixed(3) + '%';
    const entry = r.entry_price != null ? Math.round(parseFloat(r.entry_price)*100) + '¢' : '—';

    const cols  = REJ_REASON_COLORS[r.reason] || ['#1a1f2a','#a0aec0'];
    const lbl   = REJ_REASON_LABELS[r.reason] || r.reason;
    const badge = `<span style="background:${cols[0]};color:${cols[1]};padding:2px 7px;border-radius:3px;font-size:11px;font-weight:700;white-space:nowrap;">${lbl}</span>`;

    // Body% — from details (weak_body) or computed from context_candles[0] OHLC
    let bodyPct = null;
    if (r.details?.body_ratio != null) {
      bodyPct = r.details.body_ratio;
    } else {
      const cc0 = Array.isArray(r.context_candles) ? r.context_candles[0] : null;
      if (cc0 && cc0.h != null && cc0.l != null && (cc0.h - cc0.l) > 0)
        bodyPct = Math.abs(cc0.c - cc0.o) / (cc0.h - cc0.l) * 100;
    }
    const bodyStr = bodyPct != null ? `<span style="color:${bodyPct >= 76 ? '#68d391' : '#fc8181'}">${bodyPct.toFixed(0)}%</span>` : '<span style="color:#4a5568">—</span>';

    // Build human-readable detail from details JSON
    let detail = '';
    const d = r.details;
    if (d) {
      if (r.reason === 'weak_body')       detail = `body ${d.body_ratio?.toFixed(0)}%`;
      else if (r.reason === 'price_too_high') detail = `${Math.round(parseFloat(r.entry_price)*100)}¢ > max ${d.max_c}¢`;
      else if (r.reason === 'price_too_low')  detail = `${Math.round(parseFloat(r.entry_price)*100)}¢ < min ${d.min_c}¢`;
      else if (r.reason === 'low_vol')    detail = `vol ${d.vol_ratio?.toFixed(2)}`;
      else if (r.reason === 'low_dist')   detail = `dist ${d.dist?.toFixed(3)}% < ${d.min?.toFixed(3)}%`;
      else if (r.reason === 'circuit_breaker') detail = `paused ${d.mins_remaining?.toFixed(0)}m left`;
      else if (r.reason === 'price_out_of_range') detail = `${d.entry_c}¢`;
      else if (r.reason === 'no_tier_match') detail = `no T1/TC spike`;
      else detail = JSON.stringify(d).slice(0,40);
    }

    const cryptoColors = {BTC:'#f7931a',ETH:'#627eea',SOL:'#9945ff',XRP:'#3ecf6e'};
    const cryptoClr = cryptoColors[r.crypto] || '#a0aec0';

    // Market link (Polymarket) — use cycleStartSec (always computed, has fallback to created_at)
    const mktCycleMs = r.cycleStartSec ? r.cycleStartSec * 1000 : r.cycle_start_ms;
    const mktUrl = mktCycleMs ? polyUrlFE(r.crypto, mktCycleMs, r.candle_size) : null;
    const cycleTimeStr = mktCycleMs ? new Date(mktCycleMs).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',hour12:false}) : '';
    const mktLink = mktUrl
      ? ` <a href="${mktUrl}" target="_blank" title="Open on Polymarket" style="color:#4fd1c5;text-decoration:none;font-size:11px;background:#0d1e2a;border:1px solid #2d5060;border-radius:3px;padding:1px 5px;margin-left:4px;">↗ ${cycleTimeStr}</a>`
      : '';

    // CXX chart button — close rej modal first so chart overlay is visible
    const cxxBtn = r.cycle_start_ms
      ? `<button onclick="closeRejModal();openChartForTrade('${r.crypto}',${r.candle_size},${r.cycle_start_ms},'SKIP')" title="Open chart for ${r.crypto} C${r.candle_size}" style="background:none;border:none;color:#a0aec0;cursor:pointer;font-size:11px;padding:0;text-decoration:underline dotted;">C${r.candle_size}</button>`
      : `<span style="color:#a0aec0;">C${r.candle_size}</span>`;

    // Slot (T0 / T1 / TC)
    const slot = r.details?.slot ?? 'T0';
    const slotColors = { T0: ['#1a2535','#90cdf4'], T1: ['#1a2535','#68d391'], TC: ['#2a2020','#f6ad55'] };
    const [slotBg, slotClr] = slotColors[slot] ?? slotColors.T0;
    const slotBadge = `<span style="background:${slotBg};color:${slotClr};padding:2px 6px;border-radius:3px;font-size:11px;font-weight:700;">${slot}</span>`;

    // Market outcome (WIN / LOSS / pending)
    let outcomeBadge = '<span style="color:#4a5568;font-size:11px;">—</span>';
    if (r.outcome) {
      const isWin = r.direction === r.outcome;
      outcomeBadge = isWin
        ? '<span style="color:#68d391;font-weight:700;font-size:11px;">WIN</span>'
        : '<span style="color:#fc8181;font-weight:700;font-size:11px;">LOSS</span>';
    }

    // Row highlight: green tint for low_vol (good signal we're now trading), amber for price_oor (marginal)
    const rowBaseBg = r.reason === 'low_vol'           ? '#081a0f'
                    : r.reason === 'price_out_of_range' ? '#1a1200'
                    : '';
    const rowHoverBg = r.reason === 'low_vol'           ? '#0e2a1a'
                     : r.reason === 'price_out_of_range' ? '#241800'
                     : '#1a2028';
    return `<tr style="border-bottom:1px solid #1d2329;${rowBaseBg ? 'background:'+rowBaseBg+';' : ''}" onmouseover="this.style.background='${rowHoverBg}'" onmouseout="this.style.background='${rowBaseBg}'">
      <td style="padding:6px 10px;color:#718096;white-space:nowrap;" title="${r.created_at}">${dateStr} ${ts}</td>
      <td style="padding:6px 10px;font-weight:700;color:${cryptoClr};">${r.crypto}${mktLink}</td>
      <td style="padding:6px 10px;">${cxxBtn}</td>
      <td style="padding:6px 10px;">${slotBadge}</td>
      <td style="padding:6px 10px;">${dir}</td>
      <td style="padding:6px 10px;text-align:right;">${bodyStr}</td>
      <td style="padding:6px 10px;text-align:right;color:#e2e8f0;">${spike}</td>
      <td style="padding:6px 10px;text-align:right;color:#a0aec0;">${entry}</td>
      <td style="padding:6px 10px;">${badge}</td>
      <td style="padding:6px 10px;color:#4a5568;font-size:12px;">${detail}</td>
      <td style="padding:6px 10px;">${outcomeBadge}</td>
    </tr>`;
  }).join('');
}
