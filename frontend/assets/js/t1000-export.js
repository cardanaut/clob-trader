// ── CLOB Trader — Export: JSON, CSV, HTML ──

function toggleExportMenu(e) {
  e.stopPropagation();
  const d = document.getElementById('exportDropdown');
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
}
function closeExportMenu() {
  const d = document.getElementById('exportDropdown');
  if (d) d.style.display = 'none';
}
document.addEventListener('click', closeExportMenu);

function exportJSON() {
  const s = state.LIVE;
  if (!s) return;
  const resolved   = (s.activityLog || []).filter(e => e.status === 'WIN' || e.status === 'LOSS');
  const eoaHistory = (s.eoaPnlHistory || []).filter(e => e.pnl != null).sort((a,b)=>new Date(a.time)-new Date(b.time));
  const pnl        = resolved.reduce((sum, e) => sum + (e.pnl ?? 0), 0);
  const wins   = s.wins   ?? 0;
  const losses = s.losses ?? 0;
  const data = {
    exportedAt : new Date().toISOString(),
    stats: {
      pnl,
      wins,
      losses,
      winRate    : (wins + losses) ? +(wins / (wins + losses) * 100).toFixed(1) : null,
      baseEoaBalance: s.baseEoaBalance,
    },
    pnlHistory : eoaHistory,
    trades     : resolved,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `polychamp-live-${new Date().toISOString().slice(0,16).replace(/:/g,'-')}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const s = state.LIVE;
  if (!s) return;
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // ── Trades block ────────────────────────────────────────────────────
  const resolved  = (s.activityLog || []).filter(e => e.status === 'WIN' || e.status === 'LOSS');
  const tradeHdr  = ['time','crypto','type','direction','entry_pct','bet','spike_pct','trade_id','status','pnl','pnl_pct','date'];
  const tradeRows = resolved.map(e => {
    const type   = (e.candle_size >= 150) ? '15MIN' : '5MIN';
    const entry  = e.entryPrice != null ? (e.entryPrice * 100).toFixed(0) : '';
    const pnlPct = (e.pnl != null && e.position > 0) ? (e.pnl / e.position * 100).toFixed(1) : '';
    const date   = e.time ? new Date(e.time).toLocaleDateString() : '';
    return [e.time, e.crypto, type, e.direction, entry,
      e.position?.toFixed(2), e.spike_pct?.toFixed(2), e.tradeId,
      e.status, e.pnl?.toFixed(2), pnlPct, date].map(q).join(',');
  });

  // ── EOA PnL history block (same source as chart) ────────────────────
  const eoaHistory = (s.eoaPnlHistory || []).filter(e => e.pnl != null).sort((a,b)=>new Date(a.time)-new Date(b.time));
  const pnlHdr  = ['time','eoa_balance','pnl'];
  const pnlRows = eoaHistory.map(e => [e.time, e.eoa?.toFixed(2), e.pnl?.toFixed(4)].map(q).join(','));

  const csv = [
    '# TRADES',
    tradeHdr.join(','),
    ...tradeRows,
    '',
    '# EOA PnL HISTORY',
    pnlHdr.join(','),
    ...pnlRows,
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `polychamp-live-${new Date().toISOString().slice(0,16).replace(/:/g,'-')}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportHTML() {
  const s = state.LIVE;
  if (!s) return;

  // ── Stats ──────────────────────────────────────────────────────────
  // PnL = activityLog sum filtered by tradeListClearedAt (same as bal-LIVE display; eoaPnlHistory can lag)
  const cutoffExport = s.tradeListClearedAt || null;
  const pnl = parseFloat((s.activityLog || [])
    .filter(e => !cutoffExport || e.time >= cutoffExport)
    .reduce((sum, e) => sum + (e.pnl != null ? e.pnl : 0), 0)
    .toFixed(2));
  const wins    = s.wins   ?? 0;
  const losses  = s.losses ?? 0;
  const total   = wins + losses;
  const winRate = total ? (wins / total * 100).toFixed(1) + '%' : '—';
  const pending = s.pending ?? 0;

  const eoaBalance   = document.getElementById('live-real-balance')?.textContent.trim() || '—';
  const locked       = document.getElementById('bal-locked-LIVE')?.textContent.trim()   || '$0.00';
  const redeemable   = document.getElementById('bal-redeem-LIVE')?.textContent.trim()   || '$0.00';
  const redeemQ      = document.getElementById('redeem-q-LIVE')?.textContent.trim()     || '0';
  const virtualTotal = document.getElementById('bal-total-LIVE')?.textContent.trim()    || '—';

  // ── Chart data — same source as renderPnlChart() (activityLog cumulative) ──
  const logResolved = (s.activityLog || [])
    .filter(e => (e.status === 'WIN' || e.status === 'LOSS') && e.pnl != null && e.time)
    .slice()
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  let lastTs = 0, cumChart = 0;
  const chartData   = [];
  const tradeLabels = {};
  for (const e of logResolved) {
    let ts = Math.floor(new Date(e.time).getTime() / 1000);
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    cumChart += e.pnl;
    const val = parseFloat(cumChart.toFixed(4));
    chartData.push({ time: ts, value: val });
    tradeLabels[ts] = {
      timeLabel : e.time.slice(0, 16).replace('T', ' '),
      crypto    : e.crypto,
      direction : e.direction,
      status    : e.status,
      tradePnl  : e.pnl,
      cum       : val,
      type      : (e.candle_size >= 150) ? '15m' : '5m',
    };
  }

  // ── Trades table rows ──────────────────────────────────────────────
  const resolved = (s.activityLog || []).filter(e => e.status === 'WIN' || e.status === 'LOSS');
  const tradesRows = resolved.map(e => {
    const t         = new Date(e.time);
    const ts        = t.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false });
    const dateLabel = t.toLocaleDateString(undefined, { month:'short', day:'numeric',
      ...(t.getFullYear() !== new Date().getFullYear() ? { year:'numeric' } : {}) });
    const dir     = e.direction === 'UP' ? '▲ UP' : '▼ DOWN';
    const dirClr  = e.direction === 'UP' ? '#63b3ed' : '#f6ad55';
    const entry   = e.entryPrice != null ? `${(e.entryPrice * 100).toFixed(0)}¢` : '—';
    const bet     = e.position   != null ? `$${e.position.toFixed(2)}` : '—';
    const spike   = e.spike_pct  != null ? `+${e.spike_pct.toFixed(2)}%` : '—';
    const type    = (e.candle_size >= 150) ? '15MIN' : '5MIN';
    const typeClr = (e.candle_size >= 150) ? '#63b3ed' : '#68d391';
    const winClr  = e.status === 'WIN' ? '#68d391' : '#fc8181';
    const pnlStr  = e.pnl != null
      ? (e.status === 'WIN' ? `+$${e.pnl.toFixed(2)}` : `-$${Math.abs(e.pnl).toFixed(2)}`)
      : '—';
    const pct = (e.pnl != null && e.position > 0)
      ? ` (${(e.pnl / e.position * 100).toFixed(1)}%)`
      : '';
    let idCell = e.tradeId || '—';
    if (e.cycleStart && e.candle_size) {
      const url = polyUrlFE(e.crypto, e.cycleStart, e.candle_size);
      if (url) idCell = `<a href="${url}" target="_blank" style="color:#4fd1c5;text-decoration:none;">📊 ${e.tradeId || '—'}</a>`;
    }
    const fokBadge = e.isFokRetry
      ? '<span style="background:#2d3748;color:#718096;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #4a5568;">FOK</span>'
      : '';
    return `<tr>
      <td>${ts}</td>
      <td><strong>${e.crypto}</strong></td>
      <td style="color:${typeClr}">${type}</td>
      <td style="color:${dirClr}">${dir}</td>
      <td>${entry}</td><td>${bet}</td>
      <td style="color:#f6ad55">${spike}</td>
      <td>${idCell}</td>
      <td>${fokBadge}</td>
      <td style="color:${winClr};font-weight:bold">${e.status}</td>
      <td style="color:${winClr}">${pnlStr}${pct}</td>
      <td style="color:#718096">${dateLabel}</td>
    </tr>`;
  }).join('');

  const pnlSign  = pnl >= 0 ? '+' : '';
  const pnlColor = pnl >= 0 ? '#68d391' : '#fc8181';
  const exportTs = new Date().toLocaleString();
  const chartJson = JSON.stringify(chartData);
  const labelJson = JSON.stringify(tradeLabels);

  // ── Build HTML ─────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Polychamp LIVE Export — ${exportTs}</title>
<script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"><\/script>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:#1a202c; color:#e2e8f0; font-family:monospace; font-size:13px; padding:20px; }
  h1 { font-size:16px; color:#a0aec0; margin-bottom:4px; }
  .export-ts { font-size:11px; color:#4a5568; margin-bottom:16px; }
  .stats-bar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
  .stat-box { background:#2d3748; border-radius:6px; padding:8px 14px; min-width:100px; }
  .stat-label { font-size:10px; color:#718096; text-transform:uppercase; letter-spacing:.05em; }
  .stat-val { font-size:15px; font-weight:bold; margin-top:2px; }
  #chartContainer { width:100%; height:340px; background:#1a202c; border-radius:8px; margin-bottom:16px; }
  table { border-collapse:collapse; width:100%; font-size:12px; }
  th { background:#2d3748; color:#a0aec0; padding:6px 10px; text-align:left; font-weight:normal; position:sticky; top:0; }
  td { padding:5px 10px; border-bottom:1px solid #2d3748; vertical-align:middle; }
  tr:hover td { background:#2d374840; }
  .section-title { font-size:12px; color:#a0aec0; margin:16px 0 6px; }
</style>
</head>
<body>
<h1>Polychamp — LIVE Polymarket</h1>
<div class="export-ts">Exported: ${exportTs}</div>

<div class="stats-bar">
  <div class="stat-box">
    <div class="stat-label">Virtual Total</div>
    <div class="stat-val">${virtualTotal}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">EOA Wallet</div>
    <div class="stat-val">${eoaBalance}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Locked</div>
    <div class="stat-val">${locked}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Redeemable</div>
    <div class="stat-val">${redeemable}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Redeem Q</div>
    <div class="stat-val">${redeemQ}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">P&amp;L</div>
    <div class="stat-val" style="color:${pnlColor}">${pnlSign}$${pnl.toFixed(2)}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Wins</div>
    <div class="stat-val" style="color:#68d391">${wins}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Losses</div>
    <div class="stat-val" style="color:#fc8181">${losses}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Win Rate</div>
    <div class="stat-val">${winRate}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Pending</div>
    <div class="stat-val">${pending}</div>
  </div>
</div>

<div class="section-title"><svg class="ico ico-md"><use href="#ico-trending-up"/></svg> Cumulative P&amp;L</div>
<div id="chartContainer"></div>

<div class="section-title"><svg class="ico ico-md"><use href="#ico-clipboard"/></svg> Recent Trades (${resolved.length})</div>
<div style="overflow-x:auto">
<table>
  <thead><tr>
    <th>Time</th><th>Crypto</th><th>Type</th><th>Dir</th>
    <th>Entry</th><th>Bet</th><th>Spike</th><th>Market / ID</th>
    <th></th><th>Status</th><th>P&amp;L</th><th>Date</th>
  </tr></thead>
  <tbody>${tradesRows}</tbody>
</table>
</div>

<script>
(function() {
  const chartData   = ${chartJson};
  const tradeLabels = ${labelJson};
  if (!chartData.length || typeof LightweightCharts === 'undefined') return;
  const container = document.getElementById('chartContainer');
  const chart = LightweightCharts.createChart(container, {
    width: container.clientWidth, height: 340,
    layout: { background:{ color:'#1a202c' }, textColor:'#a0aec0' },
    grid: { vertLines:{ color:'#2d3748' }, horzLines:{ color:'#2d3748' } },
    timeScale: { borderColor:'#4a5568', timeVisible:true, secondsVisible:true },
    rightPriceScale: { borderColor:'#4a5568' },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });
  const series = chart.addBaselineSeries({
    baseValue: { type:'price', price:0 },
    topLineColor:'#68d391', topFillColor1:'rgba(104,211,145,0.28)', topFillColor2:'rgba(104,211,145,0.04)',
    bottomLineColor:'#fc8181', bottomFillColor1:'rgba(252,129,129,0.04)', bottomFillColor2:'rgba(252,129,129,0.28)',
    lineWidth:2, lastValueVisible:true, priceLineVisible:false,
  });
  series.setData(chartData);
  chart.timeScale().fitContent();

  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:absolute;display:none;padding:5px 10px;background:#2d3748;border:1px solid #4a5568;border-radius:4px;font-size:11px;color:#e2e8f0;pointer-events:none;z-index:10;white-space:nowrap;';
  container.style.position = 'relative';
  container.appendChild(tooltip);
  chart.subscribeCrosshairMove(function(param) {
    if (!param.point || !param.time) { tooltip.style.display='none'; return; }
    const t = tradeLabels[param.time];
    if (!t) { tooltip.style.display='none'; return; }
    const clr    = t.tradePnl >= 0 ? '#68d391' : '#fc8181';
    const cumClr = t.cum      >= 0 ? '#68d391' : '#fc8181';
    const trSign = t.tradePnl >= 0 ? '+' : '';
    const cuSign = t.cum      >= 0 ? '+' : '';
    const dirStr = t.direction === 'UP' ? '▲' : '▼';
    tooltip.innerHTML = '<span style=\"color:#a0aec0\">' + t.timeLabel + '</span>' +
      ' &nbsp;<b>' + t.crypto + '</b>' +
      ' <span style=\"color:#718096\">' + t.type + '</span>' +
      ' ' + dirStr +
      ' &nbsp;<b style=\"color:' + clr + '\">' + t.status + ' ' + trSign + '$' + t.tradePnl.toFixed(2) + '</b>' +
      ' &nbsp;<span style=\"color:#718096\">cum </span><span style=\"color:' + cumClr + '\">' + cuSign + '$' + t.cum.toFixed(2) + '</span>';
    let left = param.point.x + 14, top = param.point.y - 36;
    if (left + 260 > container.clientWidth) left = param.point.x - 270;
    if (top < 4) top = 4;
    tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; tooltip.style.display = 'block';
  });
  new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth })).observe(container);
})();
<\/script>
</body>
</html>`;

  // ── Download ───────────────────────────────────────────────────────
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `polychamp-live-${new Date().toISOString().slice(0,16).replace(/:/g,'-')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
