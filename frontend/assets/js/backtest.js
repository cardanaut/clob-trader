/**
 * PolyChamp — Backtest Page
 */

let lastResult = null;
let entryGaugeMode = 'before';

// ── Persistent state (capital inputs + gauges) ────────────────────────
const BT_STATE_KEY = 'pc_backtest_v1';

function saveBtState() {
    try {
        localStorage.setItem(BT_STATE_KEY, JSON.stringify({
            startingCapital:  parseFloat(document.getElementById('startCapital')?.value) || 10000,
            positionSizePct:  parseFloat(document.getElementById('positionSizePct')?.value) || 5,
            maxPendingCount:  parseInt(document.getElementById('maxPendingCount')?.value, 10) || 0,
            maxLockedPct:     parseInt(document.getElementById('maxLockedGauge')?.value, 10) ?? 40,
            minTradeUsd:      parseFloat(document.getElementById('minTradeUsd')?.value) || 2000,
        }));
    } catch {}
}

function restoreBtState() {
    try {
        const s = JSON.parse(localStorage.getItem(BT_STATE_KEY) || '{}');
        if (s.startingCapital != null)  document.getElementById('startCapital').value    = s.startingCapital;
        if (s.positionSizePct != null)  document.getElementById('positionSizePct').value = s.positionSizePct;
        if (s.maxPendingCount != null)  document.getElementById('maxPendingCount').value = s.maxPendingCount;
        if (s.minTradeUsd != null)      document.getElementById('minTradeUsd').value     = s.minTradeUsd;
        const pct = s.maxLockedPct ?? 40;
        document.getElementById('maxLockedGauge').value = pct;
        updateMaxLockedGauge(pct);
    } catch {}
}

// --- Tab switching ---
function switchTab(name) {
    document.querySelectorAll('.bt-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.bt-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'profiles') renderProfiles();
}

// ── Saved profiles (localStorage) ──────────────────────────────────
const PROFILES_KEY = 'polychamp_bt_profiles';

function getProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); }
    catch { return []; }
}
function setProfiles(arr) { localStorage.setItem(PROFILES_KEY, JSON.stringify(arr)); }

function readCurrentParams() {
    const strategy = document.querySelector('.strategy-card.active')?.dataset.strategy || 'NAIVE_COPY';
    const params = {
        strategy,
        dateFrom:          document.getElementById('dateFrom').value,
        dateTo:            document.getElementById('dateTo').value,
        startingCapital:   parseFloat(document.getElementById('startCapital').value) || 10000,
        positionSizePct:   parseFloat(document.getElementById('positionSizePct').value) || 5,
        category:          document.getElementById('categoryFilter').value,
        minTradeUsd:       parseFloat(document.getElementById('minTradeUsd').value) || 2000,
        maxPrice:          parseFloat(document.getElementById('maxPrice').value) || 1,
        marketMaxLifetimeH:parseInt(document.getElementById('marketLifetime').value, 10) || 0,
        lateEntryPct:      parseFloat(document.getElementById('entryGauge').value) || 0,
        entryGaugeMode,
        invertDirection:   document.getElementById('invertDirection').checked,
        maxPendingCount:   parseInt(document.getElementById('maxPendingCount').value, 10) || 0,
        maxPendingPct:     parseInt(document.getElementById('maxLockedGauge').value, 10) ?? 40,
    };
    if (strategy === 'TOP_SCORE') {
        params.topScoreTopN          = parseInt(document.getElementById('topScoreTopN')?.value, 10) || 20;
        params.topScoreMinResolved   = parseInt(document.getElementById('topScoreMinResolved')?.value, 10) || 3;
        params.topScoreMinSuccessPct = parseFloat(document.getElementById('topScoreMinSuccessPct')?.value) || 100;
        params.topScoreMinScore      = parseInt(document.getElementById('topScoreMinScore')?.value, 10) ?? 55;
    }
    return params;
}

function saveCurrentAsProfile() {
    const name = document.getElementById('profileName').value.trim();
    if (!name) {
        document.getElementById('profileName').focus();
        return;
    }
    const profiles = getProfiles();
    profiles.unshift({ id: Date.now().toString(), name, savedAt: new Date().toISOString(), ...readCurrentParams() });
    setProfiles(profiles);
    document.getElementById('profileName').value = '';
    renderProfiles();
    switchTab('profiles');
}

function loadProfile(id) {
    const p = getProfiles().find(x => x.id === id);
    if (!p) return;

    // Strategy card
    document.querySelectorAll('.strategy-card').forEach(c => {
        c.classList.toggle('active', c.dataset.strategy === p.strategy);
    });
    // Dates
    if (p.dateFrom) document.getElementById('dateFrom').value = p.dateFrom;
    if (p.dateTo)   document.getElementById('dateTo').value   = p.dateTo;
    // Capital
    document.getElementById('startCapital').value      = p.startingCapital;
    document.getElementById('positionSizePct').value   = p.positionSizePct;
    document.getElementById('maxPendingCount').value   = p.maxPendingCount ?? 0;
    const restoredLocked = p.maxPendingPct ?? 40;
    document.getElementById('maxLockedGauge').value = restoredLocked;
    updateMaxLockedGauge(restoredLocked);
    // Filters
    document.getElementById('categoryFilter').value  = p.category || '';
    document.getElementById('minTradeUsd').value     = p.minTradeUsd;
    document.getElementById('marketLifetime').value  = p.marketMaxLifetimeH;
    // Max price
    document.getElementById('maxPrice').value = p.maxPrice ?? 1;
    updateMaxPrice(p.maxPrice ?? 1);
    // Entry gauge
    document.getElementById('entryGauge').value = p.lateEntryPct;
    setEntryMode(p.entryGaugeMode || 'after');
    updateGauge(p.lateEntryPct);
    // Invert
    document.getElementById('invertDirection').checked = !!p.invertDirection;
    document.querySelector('.invert-toggle').classList.toggle('active', !!p.invertDirection);

    // Show active profile banner
    document.getElementById('activeProfileName').textContent = p.name;
    document.getElementById('activeProfileBanner').style.display = '';

    // TOP_SCORE params
    if (p.strategy === 'TOP_SCORE') {
        if (p.topScoreTopN != null)          document.getElementById('topScoreTopN').value          = p.topScoreTopN;
        if (p.topScoreMinResolved != null)   document.getElementById('topScoreMinResolved').value   = p.topScoreMinResolved;
        if (p.topScoreMinSuccessPct != null) document.getElementById('topScoreMinSuccessPct').value = p.topScoreMinSuccessPct;
        if (p.topScoreMinScore != null)      document.getElementById('topScoreMinScore').value      = p.topScoreMinScore;
    }
    updateTopScorePanel();

    switchTab('strategy');
}

function deleteProfile(id) {
    setProfiles(getProfiles().filter(x => x.id !== id));
    renderProfiles();
}

function renderProfiles() {
    const list = document.getElementById('profilesList');
    if (!list) return;
    const profiles = getProfiles();
    if (!profiles.length) {
        list.innerHTML = '<div class="profile-empty">No saved profiles yet.<br>Configure a run and click ★ Save.</div>';
        return;
    }
    list.innerHTML = profiles.map(p => {
        const date = new Date(p.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const tags = [];
        tags.push(`<span class="profile-tag">${escHtml(p.strategy.replace('_', ' '))}</span>`);
        if (p.category) tags.push(`<span class="profile-tag">${escHtml(p.category)}</span>`);
        const minLabel = p.minTradeUsd >= 1000 ? `$${p.minTradeUsd/1000}K+` : `$${p.minTradeUsd}+`;
        tags.push(`<span class="profile-tag">${minLabel}</span>`);
        if (p.maxPrice < 1) tags.push(`<span class="profile-tag tag-accent">≤${Math.round(p.maxPrice*100)}¢</span>`);
        if (p.invertDirection) tags.push('<span class="profile-tag tag-inverted">Inverted</span>');
        if (p.lateEntryPct > 0) tags.push(`<span class="profile-tag">${p.entryGaugeMode === 'before' ? '<' : '>'}${p.lateEntryPct}%</span>`);
        if (p.positionSizePct !== 5) tags.push(`<span class="profile-tag">${p.positionSizePct}% pos</span>`);
        return `<div class="profile-card">
            <div class="profile-card-header">
                <span class="profile-card-name" title="${escHtml(p.name)}">${escHtml(p.name)}</span>
                <span class="profile-card-date">${date}</span>
            </div>
            <div class="profile-tags">${tags.join('')}</div>
            <div class="profile-card-actions">
                <button class="btn btn-sm btn-primary" onclick="loadProfile('${p.id}')">Load</button>
                <button class="btn btn-sm" onclick="deleteProfile('${p.id}')" style="color:var(--red);margin-left:auto">X</button>
            </div>
        </div>`;
    }).join('');
}

// --- Reset filters to defaults (called when a strategy card is clicked) ---
function resetFilters() {
    document.getElementById('categoryFilter').value  = '';
    document.getElementById('marketLifetime').value  = '0';
    document.getElementById('maxPendingCount').value = '0';
    document.getElementById('maxLockedGauge').value  = '40';
    updateMaxLockedGauge(40);
    document.getElementById('entryGauge').value      = '0';
    setEntryMode('after');
    updateGauge(0);
    document.getElementById('maxPrice').value = '1.00';
    updateMaxPrice(1);
    document.getElementById('invertDirection').checked = false;
    document.querySelector('.invert-toggle').classList.remove('active');
    // Clear active profile banner
    document.getElementById('activeProfileBanner').style.display = 'none';
    document.getElementById('activeProfileName').textContent = '';
}

// --- Strategy card selection ---
function updateTopScorePanel() {
    const strategy = document.querySelector('.strategy-card.active')?.dataset.strategy;
    const panel = document.getElementById('topScorePanel');
    if (panel) panel.style.display = strategy === 'TOP_SCORE' ? '' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.strategy-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.strategy-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            resetFilters();
            updateTopScorePanel();
        });
    });

    // Restore persistent state (capital, whale min, locked gauge)
    restoreBtState();

    // Default dates: last 30 days (always reset to today's range)
    const today = new Date();
    const prior = new Date(today);
    prior.setDate(prior.getDate() - 30);
    document.getElementById('dateFrom').value = prior.toISOString().slice(0, 10);
    document.getElementById('dateTo').value   = today.toISOString().slice(0, 10);

    // Auto-save capital inputs on change
    ['startCapital', 'positionSizePct', 'maxPendingCount', 'minTradeUsd'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', saveBtState);
    });
    // Re-render gauge hint when capital changes
    document.getElementById('startCapital')?.addEventListener('input', () => {
        updateMaxLockedGauge(document.getElementById('maxLockedGauge').value);
    });

    // Entry timing mode pills
    document.querySelectorAll('.entry-mode-pill').forEach(pill => {
        pill.addEventListener('click', () => setEntryMode(pill.dataset.mode));
    });

    // Highlight invert toggle on change
    document.getElementById('invertDirection').addEventListener('change', function () {
        document.querySelector('.invert-toggle').classList.toggle('active', this.checked);
    });
});

// --- Entry mode toggle ---
function setEntryMode(mode) {
    entryGaugeMode = mode;
    document.querySelectorAll('.entry-mode-pill').forEach(p => p.classList.toggle('active', p.dataset.mode === mode));
    updateGauge(document.getElementById('entryGauge').value);
}

// --- Gauge display ---
function updateGauge(val) {
    const v = parseFloat(val);
    const label = document.getElementById('entryGaugeValue');
    const hint  = document.getElementById('entryGaugeHint');
    const pills = document.querySelector('.entry-mode-pills');

    if (v === 0) {
        label.textContent = 'Off';
        label.className = 'gauge-value';
        if (hint) hint.textContent = '';
        if (pills) pills.classList.add('gauge-off');
    } else if (entryGaugeMode === 'before') {
        label.textContent = 'Before ' + v.toFixed(1) + '%';
        label.className = 'gauge-value gauge-active';
        if (hint) hint.textContent = 'Only copy trades occurring in the first ' + v.toFixed(1) + '% of market lifetime.';
        if (pills) pills.classList.remove('gauge-off');
    } else {
        label.textContent = 'After ' + v.toFixed(1) + '%';
        label.className = 'gauge-value gauge-active';
        if (hint) hint.textContent = 'Only copy trades occurring in the last ' + (100 - v).toFixed(1) + '% of market lifetime.';
        if (pills) pills.classList.remove('gauge-off');
    }
}

// --- Max capital at risk gauge ---
function updateMaxLockedGauge(val) {
    const v = parseInt(val, 10);
    const label = document.getElementById('maxLockedGaugeValue');
    const hint  = document.getElementById('maxLockedGaugeHint');
    if (v === 0 || v >= 100) {
        label.textContent = 'Off';
        label.className   = 'gauge-value';
        if (hint) hint.textContent = 'No cap — positions are only limited by available capital.';
    } else {
        label.textContent = v + '%';
        label.className   = 'gauge-value gauge-active';
        const capital = parseFloat(document.getElementById('startCapital')?.value) || 10000;
        const dollars = (capital * v / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
        if (hint) hint.textContent = `Max $${dollars} locked in open positions at any time (${v}% of $${capital.toLocaleString('en-US', { maximumFractionDigits: 0 })}).`;
    }
    saveBtState();
}

// --- Max price display ---
function updateMaxPrice(val) {
    const v     = parseFloat(val);
    const label = document.getElementById('maxPriceValue');
    const hint  = document.getElementById('maxPriceHint');
    if (v >= 1) {
        label.textContent = 'Off';
        label.className   = 'gauge-value';
        if (hint) hint.textContent = '';
    } else {
        label.textContent = (v * 100).toFixed(0) + '¢';
        label.className   = 'gauge-value gauge-active';
        if (hint) hint.textContent = 'Only copy trades where the whale entered at ≤' + (v * 100).toFixed(0) + '¢ — skips near-certain favourites.';
    }
}

// --- Run backtest ---
async function runBacktest() {
    const strategy        = document.querySelector('.strategy-card.active')?.dataset.strategy || 'NAIVE_COPY';
    const dateFrom        = document.getElementById('dateFrom').value + 'T00:00:00Z';
    const dateTo          = document.getElementById('dateTo').value   + 'T23:59:59Z';
    const startingCapital = parseFloat(document.getElementById('startCapital').value);
    const positionSizePct = parseFloat(document.getElementById('positionSizePct').value);
    const category        = document.getElementById('categoryFilter').value || undefined;
    const _minRaw         = parseFloat(document.getElementById('minTradeUsd').value);
    const minTradeUsd     = isNaN(_minRaw) ? 2000 : _minRaw;
    const marketMaxLifetimeH = parseInt(document.getElementById('marketLifetime').value, 10) || 0;
    const lateEntryPct    = parseFloat(document.getElementById('entryGauge').value) || 0;
    const _maxPriceRaw    = parseFloat(document.getElementById('maxPrice').value);
    const maxPrice        = _maxPriceRaw >= 1 ? 1 : _maxPriceRaw;
    const invertDirection = document.getElementById('invertDirection').checked;

    if (!document.getElementById('dateFrom').value || !document.getElementById('dateTo').value) {
        alert('Please select a date range.');
        return;
    }

    const btn = document.getElementById('btnRun');
    btn.disabled = true;
    document.getElementById('btLoading').style.display = 'flex';

    try {
        const maxPendingCount = parseInt(document.getElementById('maxPendingCount').value, 10) || 0;
        const maxPendingPct   = parseInt(document.getElementById('maxLockedGauge').value, 10) ?? 40;

        const backtestParams = {
            strategy, dateFrom, dateTo, startingCapital, positionSizePct,
            category, minTradeUsd, maxPrice, marketMaxLifetimeH, lateEntryPct, entryGaugeMode, invertDirection,
            maxPendingCount, maxPendingPct,
        };
        if (strategy === 'TOP_SCORE') {
            backtestParams.topScoreTopN          = parseInt(document.getElementById('topScoreTopN')?.value, 10) || 20;
            backtestParams.topScoreMinResolved   = parseInt(document.getElementById('topScoreMinResolved')?.value, 10) || 3;
            backtestParams.topScoreMinSuccessPct = parseFloat(document.getElementById('topScoreMinSuccessPct')?.value) || 100;
        }
        lastResult = await PolyChampAPI.runBacktest(backtestParams);
        renderResults(lastResult);
    } catch (err) {
        alert('Backtest failed: ' + err.message);
    } finally {
        btn.disabled = false;
        document.getElementById('btLoading').style.display = 'none';
    }
}

// --- Render full results ---
function renderResults(r) {
    document.getElementById('btResults').style.display = 'flex';
    document.getElementById('btStrategyLabel').textContent = r.description || r.strategy;

    const m = r.metrics;

    const retPct = m.totalReturnPct;
    document.getElementById('mReturn').textContent = fmtPct(retPct);
    document.getElementById('mReturn').className   = 'stat-value ' + colorClass(retPct);

    document.getElementById('mWinRate').textContent = m.winRate != null ? m.winRate + '%' : '—';
    document.getElementById('mSharpe').textContent  = m.sharpe != null ? m.sharpe.toFixed(2) : '—';

    const dd = m.maxDrawdownPct;
    document.getElementById('mDrawdown').textContent = dd != null ? '-' + dd.toFixed(1) + '%' : '—';
    document.getElementById('mDrawdown').className   = 'stat-value ' + (dd > 0 ? 'text-red' : '');

    const skippedNote = m.skippedTrades > 0 ? `, ${m.skippedTrades} skipped` : '';
    document.getElementById('mTrades').textContent = m.totalTrades + ' (' + m.resolvedTrades + ' resolved' + skippedNote + ')';

    const pnl = m.totalPnl;
    document.getElementById('mPnl').textContent = (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toLocaleString('en-US', { maximumFractionDigits: 0 });
    document.getElementById('mPnl').className   = 'stat-value ' + colorClass(pnl);

    const locked    = m.lockedCapital ?? 0;
    const lockedPct = m.lockedCapitalPct ?? 0;
    const openCount = m.openTrades ?? 0;
    const lockedEl  = document.getElementById('mLocked');
    lockedEl.textContent = '$' + locked.toLocaleString('en-US') + ' (' + lockedPct + '% [' + openCount + '])';
    lockedEl.className   = 'stat-value ' + (lockedPct > 100 ? 'text-red' : lockedPct > 50 ? 'text-yellow' : 'text-muted');
    lockedEl.title = openCount + ' open positions × $' + (r.params.startingCapital * r.params.positionSizePct / 100).toLocaleString() + ' each';

    const balance    = m.finalEquity ?? r.params.startingCapital;
    const balancePct = Math.round((balance - r.params.startingCapital) / r.params.startingCapital * 1000) / 10;
    const balanceEl  = document.getElementById('mBalance');
    balanceEl.textContent = '$' + Math.round(balance).toLocaleString('en-US') + ' (' + (balancePct >= 0 ? '+' : '') + balancePct + '%)';
    balanceEl.className   = 'stat-value ' + colorClass(balancePct);
    balanceEl.title       = 'Base $' + r.params.startingCapital.toLocaleString('en-US') + ' + P&L $' + Math.round(m.totalPnl ?? 0).toLocaleString('en-US');

    renderScenarios(r);
    renderQualifyingWallets(r);
    renderChart(r.equityCurve, r.params.startingCapital);
    renderTradeLog(r.tradeLog);
}

function renderQualifyingWallets(r) {
    const section = document.getElementById('qualifyingWalletsSection');
    if (!section) return;

    if (r.strategy !== 'TOP_SCORE') {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    const tbody = document.getElementById('qualifyingWalletsBody');

    if (!r.qualifyingWallets || r.qualifyingWallets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">
            No traders qualified before the start date.<br>
            Try lowering "Min resolved trades" or "Min success %".
        </td></tr>`;
        return;
    }

    tbody.innerHTML = r.qualifyingWallets.map((w, i) => {
        const name = w.username && w.username.length < 35
            ? w.username
            : (w.wallet_address.slice(0, 6) + '…' + w.wallet_address.slice(-4));
        const pctCls = w.success_pct >= 100 ? 'text-green' : w.success_pct >= 75 ? 'text-yellow' : '';
        return `<tr>
            <td class="text-muted">${i + 1}</td>
            <td><a href="/pages/trader.php?wallet=${encodeURIComponent(w.wallet_address)}" class="wallet-link" title="${escHtml(w.wallet_address)}">${escHtml(name)}</a></td>
            <td>${w.resolved_wins}/${w.resolved_count}</td>
            <td class="${pctCls}" style="font-weight:600">${w.success_pct}%</td>
        </tr>`;
    }).join('');
}

// --- Scenario comparison ---
function renderScenarios(r) {
    const capital         = r.params.startingCapital;
    const positionSize    = capital * r.params.positionSizePct / 100;
    const invertDirection = r.params.invertDirection;
    const m               = r.metrics;
    const basePnl         = m.totalPnl;

    // Current
    fillScenario('sc', basePnl, capital, m.winRate, m.wins, m.wins + m.losses);

    // Bear: every open trade is a full loss (-positionSize each, direction-independent)
    const bearPnl   = basePnl - m.openTrades * positionSize;
    const bearTotal = m.wins + m.losses + m.openTrades;
    const bearWr    = bearTotal > 0 ? Math.round(m.wins / bearTotal * 1000) / 10 : null;
    fillScenario('scBear', bearPnl, capital, bearWr, m.wins, bearTotal);

    // Bull: every open trade wins at its actual entry price.
    // ourPrice depends on invertDirection (run-level param, not per-trade detection).
    let bullBonus = 0;
    let bullExtraWins = 0;
    for (const t of r.tradeLog) {
        if (t.status !== 'pending') continue;
        const ourPrice = invertDirection ? (1 - t.price) : t.price;
        if (ourPrice > 0 && ourPrice < 1) {
            bullBonus += positionSize * (1 - ourPrice) / ourPrice;
            bullExtraWins++;
        }
    }
    const bullPnl   = basePnl + bullBonus;
    const bullWins  = m.wins + bullExtraWins;
    const bullTotal = bullWins + m.losses;
    const bullWr    = bullTotal > 0 ? Math.round(bullWins / bullTotal * 1000) / 10 : null;
    fillScenario('scBull', bullPnl, capital, bullWr, bullWins, bullTotal);
}

function fillScenario(prefix, pnl, capital, winRate, wins, total) {
    const retPct = Math.round(pnl / capital * 1000) / 10;
    const retEl  = document.getElementById(prefix + 'Return');
    const pnlEl  = document.getElementById(prefix + 'Pnl');
    const wrEl   = document.getElementById(prefix + 'Wr');

    retEl.textContent = fmtPct(retPct);
    retEl.className   = 'scenario-return ' + colorClass(retPct);

    pnlEl.textContent = (pnl >= 0 ? '+' : '') + '$' + Math.round(Math.abs(pnl)).toLocaleString('en-US');
    pnlEl.className   = 'scenario-pnl ' + colorClass(pnl);

    wrEl.textContent  = winRate != null ? 'Win rate ' + winRate + '% (' + wins + '/' + total + ')' : 'No resolved trades';
}

// --- Equity chart (native Canvas) ---
function renderChart(curve, startCapital) {
    const canvas = document.getElementById('equityChart');
    const empty  = document.getElementById('chartEmpty');

    if (curve.length < 3) {
        canvas.style.display = 'none';
        empty.style.display  = 'flex';
        return;
    }
    canvas.style.display = 'block';
    empty.style.display  = 'none';

    const wrap  = canvas.parentElement;
    canvas.width  = wrap.clientWidth  || 600;
    canvas.height = wrap.clientHeight || 260;

    const pad = { top: 16, right: 16, bottom: 32, left: 64 };
    const w   = canvas.width  - pad.left - pad.right;
    const h   = canvas.height - pad.top  - pad.bottom;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const values = curve.map(p => p.equity);
    const minV   = Math.min(...values);
    const maxV   = Math.max(...values);
    const range  = maxV - minV || 1;

    const xScale = i => pad.left + (i / (curve.length - 1)) * w;
    const yScale = v => pad.top  + h - ((v - minV) / range) * h;

    // Grid lines + Y labels
    ctx.strokeStyle = 'rgba(48,54,61,0.6)';
    ctx.lineWidth   = 1;
    for (let t = 0; t <= 4; t++) {
        const y   = pad.top + (t / 4) * h;
        const val = maxV - (t / 4) * range;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + w, y); ctx.stroke();
        ctx.fillStyle = 'rgba(125,133,144,0.8)';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('$' + Math.round(val).toLocaleString(), pad.left - 6, y + 4);
    }

    // Baseline (starting capital)
    const baseY = yScale(startCapital);
    ctx.strokeStyle = 'rgba(125,133,144,0.4)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, baseY); ctx.lineTo(pad.left + w, baseY); ctx.stroke();
    ctx.setLineDash([]);

    // Fill + line
    const finalV  = curve[curve.length - 1].equity;
    const profit  = finalV >= startCapital;
    const lineCol = profit ? '#3fb950' : '#f85149';
    const grad    = ctx.createLinearGradient(0, pad.top, 0, pad.top + h);
    grad.addColorStop(0, profit ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    curve.forEach((p, i) => {
        i === 0 ? ctx.moveTo(xScale(i), yScale(p.equity)) : ctx.lineTo(xScale(i), yScale(p.equity));
    });
    ctx.lineTo(xScale(curve.length - 1), pad.top + h);
    ctx.lineTo(pad.left, pad.top + h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 2;
    curve.forEach((p, i) => {
        i === 0 ? ctx.moveTo(xScale(i), yScale(p.equity)) : ctx.lineTo(xScale(i), yScale(p.equity));
    });
    ctx.stroke();

    // X-axis labels
    const labelIdxs = [0, Math.floor(curve.length / 2), curve.length - 1];
    ctx.fillStyle = 'rgba(125,133,144,0.8)';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    labelIdxs.forEach(i => {
        const d = new Date(curve[i].date);
        ctx.fillText(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), xScale(i), canvas.height - 8);
    });
}

// --- Trade log ---
function renderTradeLog(trades) {
    const tbody = document.getElementById('tradeLogBody');
    if (!trades.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--text-muted);padding:24px">No trades matched the strategy + filters</td></tr>';
        return;
    }

    tbody.innerHTML = trades.map(t => {
        const ts     = new Date(t.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const displayName = t.username
            ? (t.username.length > 30 ? t.username.slice(0, 30) + '…' : t.username)
            : t.wallet.slice(0, 6) + '…' + t.wallet.slice(-4);
        const trader = `<a href="/pages/trader.php?wallet=${encodeURIComponent(t.wallet)}" class="wallet-link" title="${escHtml(t.username || t.wallet)}">${escHtml(displayName)}</a>`;
        const market = t.slug
            ? `<a href="https://polymarket.com/event/${t.slug}" target="_blank" rel="noopener" class="market-link">${escHtml(t.market || t.market_id)}</a>`
            : escHtml(t.market || t.market_id);
        const category = categoryBadge(t.category || 'other');
        const whaleBet = outcomeBadge(t.whale_outcome || t.outcome);
        const pricePct = t.price * 100;
        const priceCls = pricePct >= 70 ? 'price-high' : pricePct >= 40 ? 'price-mid' : '';
        const price    = `<div class="price-gauge">
                    <div class="price-gauge-track"><div class="price-gauge-fill ${priceCls}" style="width:${pricePct.toFixed(1)}%"></div></div>
                    <span class="price-gauge-label">${pricePct.toFixed(1)}¢</span>
                </div>`;
        const whale    = '$' + Math.round(t.whale_amount).toLocaleString();
        const ourSize  = '$' + Math.round(t.our_size).toLocaleString();
        const duration = t.lifetime_h != null
            ? (t.lifetime_h < 48 ? Math.round(t.lifetime_h) + 'h' : Math.round(t.lifetime_h / 24) + 'd')
            : '—';
        const elapsedCell = t.elapsed_pct != null
            ? (() => {
                const pct   = t.elapsed_pct;
                const cls   = pct >= 80 ? 'elapsed-high' : pct >= 50 ? 'elapsed-mid' : '';
                return `<div class="elapsed-gauge">
                    <div class="elapsed-gauge-track"><div class="elapsed-gauge-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
                    <span class="elapsed-gauge-label">${pct.toFixed(1)}%</span>
                </div>`;
              })()
            : '—';
        const pnlStr   = t.status === 'pending' ? '—'
                       : (t.pnl >= 0 ? '+' : '') + '$' + Math.abs(t.pnl).toLocaleString('en-US', { maximumFractionDigits: 0 });
        const pnlClass = t.pnl > 0 ? 'pnl-pos' : t.pnl < 0 ? 'pnl-neg' : '';
        const status   = `<span class="status-${t.status}">${t.status}</span>`;

        return `<tr>
            <td>${ts}</td>
            <td>${trader}</td>
            <td class="market-cell">${market}</td>
            <td>${category}</td>
            <td>${whaleBet}</td>
            <td>${price}</td>
            <td>${whale}</td>
            <td>${ourSize}</td>
            <td class="text-muted">${duration}</td>
            <td>${elapsedCell}</td>
            <td class="${pnlClass}">${pnlStr}</td>
            <td>${status}</td>
        </tr>`;
    }).join('');
}

// --- CSV export ---
function exportCSV() {
    if (!lastResult) return;
    const headers = ['Time','Wallet','Username','Market','WhaleOutcome','OurOutcome','Price','WhaleUSD','OurSize','ElapsedPct','LifetimeH','PnL','PnLPct','Status','Category'];
    const rows = lastResult.tradeLog.map(t => [
        t.timestamp, t.wallet, t.username || '',
        '"' + (t.market || '').replace(/"/g, '""') + '"',
        t.whale_outcome || t.outcome, t.outcome, t.price, t.whale_amount, t.our_size,
        t.elapsed_pct ?? '', t.lifetime_h ?? '',
        t.pnl, t.pnl_pct, t.status, t.category || '',
    ]);
    const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `backtest_${lastResult.strategy}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// --- Helpers ---
function fmtPct(v) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}
function colorClass(v) {
    if (v > 0) return 'text-green';
    if (v < 0) return 'text-red';
    return '';
}
function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
