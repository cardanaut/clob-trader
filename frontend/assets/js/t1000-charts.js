// ── CLOB Trader — Charts: candle chart, trade config, PnL chart ──

// ── Chart ─────────────────────────────────────────────────────────────────────
let chartInstance    = null;
let chartSeries      = null;
let chartCandleSize  = 60;
let chartThreshold   = 0.24;
let chartActiveCrypto = 'BTC';
let chartResizeObs   = null;
let chartHighlightTrade = null; // { spikeTime (unix sec), status ('WIN'|'LOSS') } — set when opened from a trade row
let chartViewMode = 'all';      // 'all' = show all spike markers; 'trade' = show only this trade's marker

function openChartLive(duration) {
  const cxx = duration === '5m'
    ? document.getElementById('live-strategy5m').value
    : document.getElementById('live-strategy15m').value;
  chartCandleSize = parseInt(cxx.replace('C', ''), 10);
  const thrEl = duration === '5m'
    ? document.getElementById('live-thresh5m')
    : document.getElementById('live-thresh15m');
  chartThreshold = thrEl ? (parseFloat(thrEl.value) || 0.20) : 0.20;

  chartActiveCrypto = 'BTC';
  document.querySelectorAll('.chart-crypto-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.crypto === 'BTC');
  });
  chartHighlightTrade = null;
  chartViewMode = 'all';
  updateChartViewToggle();
  document.getElementById('chartOverlay').classList.add('open');
  loadChart(chartCandleSize, chartActiveCrypto);
}

function openChart(candleSize) {
  // Determine candle size and threshold
  chartCandleSize = candleSize;
  const thr = document.getElementById(`thresh-C${candleSize}`);
  chartThreshold = thr ? (parseFloat(thr.value) || 0.24) : 0.24;

  // Reset crypto selector to BTC
  chartActiveCrypto = 'BTC';
  document.querySelectorAll('.chart-crypto-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.crypto === 'BTC');
  });

  chartHighlightTrade = null;
  chartViewMode = 'all';
  updateChartViewToggle();
  document.getElementById('chartOverlay').classList.add('open');
  loadChart(chartCandleSize, chartActiveCrypto);
}

// Open chart pre-selected to the crypto and candle size from a specific trade.
// cycleStartMs: trade's cycleStart in milliseconds (maps directly to chart candle time).
// status: 'WIN' | 'LOSS'
function openChartForTrade(crypto, candleSize, cycleStartMs, status) {
  chartCandleSize   = candleSize;
  chartActiveCrypto = crypto;
  const thr = document.getElementById(`thresh-C${candleSize}`);
  chartThreshold = thr ? (parseFloat(thr.value) || 0.24) : 0.24;
  // Snap to 5m (CXX<150) or 15m (CXX>=150) cycle boundary — matches server-side cycle-aligned bucketing
  const cycleStartSec = Math.round(cycleStartMs / 1000);
  const _cycleSecs = candleSize >= 150 ? 900 : 300;
  chartHighlightTrade = { spikeTime: Math.floor(cycleStartSec / _cycleSecs) * _cycleSecs, status };
  chartViewMode = 'trade';
  document.querySelectorAll('.chart-crypto-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.crypto === crypto);
  });
  updateChartViewToggle();
  document.getElementById('chartOverlay').classList.add('open');
  loadChart(candleSize, crypto);
}

function updateChartViewToggle() {
  const allBtn   = document.getElementById('chart-mode-all-btn');
  const tradeBtn = document.getElementById('chart-mode-trade-btn');
  if (!allBtn || !tradeBtn) return;
  allBtn.classList.toggle('active', chartViewMode === 'all');
  tradeBtn.classList.toggle('active', chartViewMode === 'trade');
  if (chartHighlightTrade) {
    tradeBtn.disabled = false;
    tradeBtn.style.opacity = '1';
    tradeBtn.style.cursor  = 'pointer';
  } else {
    tradeBtn.disabled = true;
    tradeBtn.style.opacity = '0.4';
    tradeBtn.style.cursor  = 'not-allowed';
  }
}

function setChartViewMode(mode) {
  if (mode === 'trade' && !chartHighlightTrade) return;
  chartViewMode = mode;
  updateChartViewToggle();
  loadChart(chartCandleSize, chartActiveCrypto);
}

function closeChart() {
  document.getElementById('chartOverlay').classList.remove('open');
  destroyChart();
}

// ── Trade Config popup ─────────────────────────────────────────────────────────
const _tradeConfigs = {};

function showTradeConfig(key) {
  const c = _tradeConfigs[key];
  if (!c) return;
  const is15m   = (parseInt(c.candle_size) || 0) >= 150;
  const isT1    = c.isT1 || (c.trade_id || '').includes('_T1_') || (c.trade_id || '').endsWith('_T1');
  const isTC    = c.label === 'TC';
  const isFok   = c.isFokRetry || (c.trade_id || c.tradeId || '').endsWith('_FOKR');
  const isMini  = c._isMini || c.strategy === 'LIVE_MINI' || (c.trade_id || c.tradeId || '').includes('_MINI_');
  const entry   = !isT1 ? 'T+0' : isTC ? 'TC (cumulative)' : 'T+1';
  const dir     = c.direction === 'UP' ? '↗ UP' : '↘ DOWN';
  const tid     = c.tradeId || c.trade_id || '—';
  const ep      = c.entryPrice ?? c.entry_price;
  const pos     = c.position   ?? c.position_usd;
  const rows = [
    ['Period · Strategy', `C${c.candle_size || '?'} · ${is15m ? '15m · T369' : '5m · T123'}`],
    ['Direction',         dir],
    ['Entry type',        entry],
    ['Spike detected',    c.spike_pct  != null ? `+${parseFloat(c.spike_pct).toFixed(2)}%`           : '—'],
    ['Min spike (threshold)', c.threshold != null ? `${parseFloat(c.threshold).toFixed(2)}%`          : '—'],
    ['Body',              c.body_ratio != null ? `${parseFloat(c.body_ratio).toFixed(1)}%`             : '—'],
    ['Entry price',       ep           != null ? `${(parseFloat(ep) * 100).toFixed(0)}¢`               : '—'],
    ['Bet',               pos          != null ? `$${parseFloat(pos).toFixed(2)}`                       : '—'],
    ...(isFok  ? [['FOK Retry', 'Yes']]           : []),
    ...(isMini ? [['MINI',      'Yes (1/10 risk)']] : []),
    ['Trade ID', `<span style="font-family:monospace;font-size:11px;word-break:break-all;">${tid}</span>`],
  ];
  document.getElementById('tradeConfigTitle').textContent =
    `Config — ${c.crypto || ''} ${c.candle_size ? 'C'+c.candle_size : ''} (${c.direction || ''})`;
  document.getElementById('tradeConfigBody').innerHTML = rows.map(([k, v]) =>
    `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:6px 0;border-bottom:1px solid #2d3748;">
      <span style="color:#718096;font-size:12px;flex-shrink:0;">${k}</span>
      <span style="color:#e2e8f0;font-size:12px;font-weight:600;text-align:right;">${v}</span>
    </div>`
  ).join('');
  document.getElementById('tradeConfigOverlay').style.display = 'flex';
}

function closeTradeConfig() {
  document.getElementById('tradeConfigOverlay').style.display = 'none';
}

function chartOverlayClick(e) {
  if (e.target === document.getElementById('chartOverlay')) closeChart();
}

function switchChartCrypto(crypto) {
  chartActiveCrypto = crypto;
  document.querySelectorAll('.chart-crypto-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.crypto === crypto);
  });
  loadChart(chartCandleSize, crypto);
}

function destroyChart() {
  if (chartResizeObs) { chartResizeObs.disconnect(); chartResizeObs = null; }
  if (chartInstance)  { chartInstance.remove(); chartInstance = null; chartSeries = null; }
}

async function loadChart(candleSize, crypto) {
  const container = document.getElementById('chartContainer');
  container.innerHTML = '<div class="chart-loading">Loading&hellip;</div>';

  destroyChart();

  document.getElementById('chartModalTitle').textContent = (chartViewMode === 'trade' && chartHighlightTrade)
    ? `C${candleSize} — ${crypto}  [${chartHighlightTrade.status}]`
    : `C${candleSize} — ${crypto}  (spike threshold: ${chartThreshold}%)`;

  const data = await apiFetch(`/t1000/chart-data?candle=${candleSize}&crypto=${crypto}&limit=500`);

  if (!data || !data.candles || data.candles.length === 0) {
    container.innerHTML = '<div class="chart-loading">No data yet — candles appear after the first complete 5-min cycle</div>';
    return;
  }

  if (typeof LightweightCharts === 'undefined') {
    container.innerHTML = '<div class="chart-loading">Chart library not loaded</div>';
    return;
  }

  container.innerHTML = '';

  chartInstance = LightweightCharts.createChart(container, {
    width  : container.clientWidth,
    height : 420,
    layout : { background: { color: '#1a202c' }, textColor: '#a0aec0' },
    grid   : { vertLines: { color: '#2d3748' }, horzLines: { color: '#2d3748' } },
    timeScale: {
      borderColor: '#4a5568',
      timeVisible: true,
      secondsVisible: true,
      tickMarkFormatter: (t) => {
        const d = new Date(t * 1000);
        return d.toISOString().slice(11, 16); // HH:MM
      },
    },
    rightPriceScale: { borderColor: '#4a5568' },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });

  chartSeries = chartInstance.addCandlestickSeries({
    upColor         : '#68d391',
    downColor       : '#fc8181',
    borderUpColor   : '#68d391',
    borderDownColor : '#fc8181',
    wickUpColor     : '#68d391',
    wickDownColor   : '#fc8181',
  });

  chartSeries.setData(data.candles);

  // Spike markers + zoom — depends on view mode
  if (chartViewMode === 'trade' && chartHighlightTrade) {
    const ht = chartHighlightTrade;
    const spCandle = data.candles.find(c => c.time === ht.spikeTime);
    if (spCandle) {
      chartSeries.setMarkers([{
        time     : ht.spikeTime,
        position : spCandle.spike_pct >= 0 ? 'belowBar' : 'aboveBar',
        color    : ht.status === 'WIN' ? '#68d391' : '#fc8181',
        shape    : 'circle',
        text     : `${ht.status}  ${spCandle.spike_pct >= 0 ? '+' : ''}${spCandle.spike_pct.toFixed(2)}%`,
      }]);
    }
    // Zoom to ~50 candles centered on the spike candle (25 on each side)
    const halfWindow = 25 * candleSize;
    chartInstance.timeScale().setVisibleRange({
      from : ht.spikeTime - halfWindow,
      to   : ht.spikeTime + halfWindow,
    });
  } else {
    const markers = data.candles
      .filter(c => Math.abs(c.spike_pct) >= chartThreshold)
      .map(c => ({
        time     : c.time,
        position : c.spike_pct >= 0 ? 'belowBar' : 'aboveBar',
        color    : c.spike_pct >= 0 ? '#f6e05e' : '#f6ad55',
        shape    : c.spike_pct >= 0 ? 'arrowUp' : 'arrowDown',
        text     : `${c.spike_pct >= 0 ? '+' : ''}${c.spike_pct.toFixed(2)}%`,
      }));
    if (markers.length) chartSeries.setMarkers(markers);
    chartInstance.timeScale().fitContent();
  }

  // Responsive resize
  chartResizeObs = new ResizeObserver(() => {
    if (chartInstance) chartInstance.applyOptions({ width: container.clientWidth });
  });
  chartResizeObs.observe(container);

  // OHLC hover tooltip
  const ohlcTip = document.createElement('div');
  ohlcTip.id = 'ohlcTooltip';
  ohlcTip.style.cssText = 'position:absolute;top:8px;left:8px;padding:5px 10px;background:rgba(26,32,44,0.88);border:1px solid #4a5568;border-radius:4px;font-size:11px;color:#e2e8f0;pointer-events:none;z-index:10;white-space:nowrap;display:none;';
  container.appendChild(ohlcTip);

  chartInstance.subscribeCrosshairMove(function(param) {
    if (!param.point || !param.time) { ohlcTip.style.display = 'none'; return; }
    const bar = param.seriesData && param.seriesData.get(chartSeries);
    if (!bar) { ohlcTip.style.display = 'none'; return; }
    const d     = new Date(param.time * 1000);
    const hh    = String(d.getUTCHours()).padStart(2,'0');
    const mm    = String(d.getUTCMinutes()).padStart(2,'0');
    const timeStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${hh}:${mm} UTC`;
    const c     = bar.close, o = bar.open, h = bar.high, l = bar.low;
    const clr   = c >= o ? '#68d391' : '#fc8181';
    const spikePct  = o > 0 ? (c - o) / o * 100 : null;
    const candlePct = o > 0 ? (h - l) / o * 100 : null;
    const bodyPct   = (h - l) > 0 ? Math.abs(c - o) / (h - l) * 100 : null;
    const bodyClr   = bodyPct != null ? (bodyPct >= 75 ? '#68d391' : bodyPct >= 50 ? '#f6ad55' : '#fc8181') : '#a0aec0';
    const spStr = spikePct != null
      ? ` &nbsp;<span style="color:#a0aec0">Spike: </span><span style="color:#f6ad55">${(spikePct >= 0 ? '+' : '') + spikePct.toFixed(2) + '%'}</span>` +
        ` &nbsp;<span style="color:#a0aec0">Candle: </span><span style="color:#f6ad55">${candlePct.toFixed(2) + '%'}</span>` +
        ` &nbsp;<span style="color:#a0aec0">Body: </span><span style="color:${bodyClr};font-weight:600">${bodyPct != null ? bodyPct.toFixed(0) + '%' : '—'}</span>`
      : '';
    ohlcTip.innerHTML =
      `<span style="color:#a0aec0">${timeStr}</span> &nbsp;` +
      `O <b>${o.toFixed(2)}</b> &nbsp;` +
      `H <b style="color:#68d391">${h.toFixed(2)}</b> &nbsp;` +
      `L <b style="color:#fc8181">${l.toFixed(2)}</b> &nbsp;` +
      `C <b style="color:${clr}">${c.toFixed(2)}</b>` +
      spStr;
    ohlcTip.style.display = 'block';
  });
}

// ── PnL Chart ─────────────────────────────────────────────────────────────────
let pnlChartInstance = null;
let pnlChartResizeObs = null;


// ─────────────────────────────────────────────────────────────────────────

function openPnlChart() {
  document.getElementById('pnlOverlay').classList.add('open');
  renderPnlChart();
}

function closePnlChart() {
  document.getElementById('pnlOverlay').classList.remove('open');
  if (pnlChartResizeObs) { pnlChartResizeObs.disconnect(); pnlChartResizeObs = null; }
  if (pnlChartInstance)  { pnlChartInstance.remove(); pnlChartInstance = null; }
}

function pnlOverlayClick(e) {
  if (e.target === document.getElementById('pnlOverlay')) closePnlChart();
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('pnlOverlay').classList.contains('open')) closePnlChart();
});

function renderPnlChart() {
  const container = document.getElementById('pnlChartContainer');
  if (!container) return;

  if (pnlChartResizeObs) { pnlChartResizeObs.disconnect(); pnlChartResizeObs = null; }
  if (pnlChartInstance)  { pnlChartInstance.remove(); pnlChartInstance = null; }

  // Merge LIVE + LIVE_MINI pnlHistory (both share the same wallet; combined = total PnL)
  // Filter each by its own tradeListClearedAt so CLEAR only removes entries before that timestamp
  const liveClearedAt = state.LIVE?.tradeListClearedAt || null;
  const miniClearedAt = state.LIVE_MINI?.tradeListClearedAt || null;
  const liveEntries = (state.LIVE?.pnlHistory || [])
    .filter(e => !liveClearedAt || e.time >= liveClearedAt)
    .map(e => ({ ...e, _isMini: false }));
  const miniEntries = (state.LIVE_MINI?.pnlHistory || [])
    .filter(e => !miniClearedAt || e.time >= miniClearedAt)
    .map(e => ({ ...e, _isMini: true }));
  const resolved = [...liveEntries, ...miniEntries].sort((a, b) => new Date(a.time) - new Date(b.time));

  if (!resolved.length) {
    container.innerHTML = '<div class="chart-loading">No resolved trades yet</div>';
    return;
  }
  if (typeof LightweightCharts === 'undefined') {
    container.innerHTML = '<div class="chart-loading">Chart library not loaded</div>';
    return;
  }

  container.innerHTML = '';
  container.style.position = 'relative';

  // Hover tooltip
  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:absolute;display:none;padding:5px 10px;background:#2d3748;border:1px solid #4a5568;border-radius:4px;font-size:11px;color:#e2e8f0;pointer-events:none;z-index:10;white-space:nowrap;';
  container.appendChild(tooltip);

  pnlChartInstance = LightweightCharts.createChart(container, {
    width  : container.clientWidth,
    height : 340,
    layout : { background: { color: '#1a202c' }, textColor: '#a0aec0' },
    grid   : { vertLines: { color: '#2d3748' }, horzLines: { color: '#2d3748' } },
    timeScale: { borderColor: '#4a5568', timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderColor: '#4a5568' },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });

  // Baseline series — green above 0 (profit), red below (loss)
  const series = pnlChartInstance.addBaselineSeries({
    baseValue      : { type: 'price', price: 0 },
    topLineColor   : '#68d391',
    topFillColor1  : 'rgba(104,211,145,0.28)',
    topFillColor2  : 'rgba(104,211,145,0.04)',
    bottomLineColor: '#fc8181',
    bottomFillColor1: 'rgba(252,129,129,0.04)',
    bottomFillColor2: 'rgba(252,129,129,0.28)',
    lineWidth      : 2,
    lastValueVisible: true,
    priceLineVisible: false,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius : 5,
  });

  // Build chart data: cumulative PnL per trade (starts at 0)
  // Timestamps shifted to EAT (UTC+3) so the time axis shows local time
  const EAT_OFFSET = 3 * 3600;
  let lastTs = 0, cum = 0;
  const chartData = [];
  const eventByTs = {};

  for (const e of resolved) {
    let ts = Math.floor(new Date(e.time).getTime() / 1000) + EAT_OFFSET;
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    cum += e.pnl;
    const val = parseFloat(cum.toFixed(4));
    chartData.push({ time: ts, value: val });
    eventByTs[ts] = {
      timeLabel : new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' '),
      crypto    : e.crypto,
      direction : e.direction,
      status    : e.status,
      tradePnl  : e.pnl,
      cumPnl    : val,
      type      : (e.candle_size >= 150) ? '15m' : '5m',
      isMini    : e._isMini,
    };
  }

  series.setData(chartData);
  pnlChartInstance.timeScale().fitContent();

  // Crosshair tooltip — show trade details on hover
  pnlChartInstance.subscribeCrosshairMove(function(param) {
    if (!param.point || !param.time) { tooltip.style.display = 'none'; return; }
    const d = param.seriesData && param.seriesData.get(series);
    if (!d) { tooltip.style.display = 'none'; return; }
    const t = eventByTs[param.time];
    if (!t) { tooltip.style.display = 'none'; return; }
    const clr    = t.tradePnl >= 0 ? '#68d391' : '#fc8181';
    const cumClr = t.cumPnl   >= 0 ? '#68d391' : '#fc8181';
    const trSign = t.tradePnl >= 0 ? '+' : '';
    const cuSign = t.cumPnl   >= 0 ? '+' : '';
    const dirStr = t.direction === 'UP' ? '▲' : '▼';
    const miniBadgeTip = t.isMini ? ' <span style="background:#2d1f4a;color:#b794f4;font-size:9px;padding:1px 4px;border-radius:3px;border:1px solid #553c9a;">MINI</span>' : '';
    tooltip.innerHTML =
      '<span style="color:#a0aec0">' + t.timeLabel + '</span>' +
      ' &nbsp;<b>' + t.crypto + '</b>' +
      ' <span style="color:#718096">' + t.type + '</span>' +
      miniBadgeTip +
      ' ' + dirStr +
      ' &nbsp;<b style="color:' + clr + '">' + t.status + ' ' + trSign + '$' + t.tradePnl.toFixed(2) + '</b>' +
      ' &nbsp;<span style="color:#718096">cum </span><span style="color:' + cumClr + '">' + cuSign + '$' + t.cumPnl.toFixed(2) + '</span>';
    let left = param.point.x + 14;
    let top  = param.point.y - 36;
    if (left + 340 > container.clientWidth) left = param.point.x - 350;
    if (top < 4) top = 4;
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
    tooltip.style.display = 'block';
  });

  pnlChartResizeObs = new ResizeObserver(() => {
    if (pnlChartInstance) pnlChartInstance.applyOptions({ width: container.clientWidth });
  });
  pnlChartResizeObs.observe(container);
}
