/**
 * PolyChamp — Trade page
 */

let autoRefreshInterval = null;

// ─── Config ──────────────────────────────────────────────────────────────────

async function loadConfig() {
    try {
        const cfg = await PolyChampAPI.request('GET', '/trader/config');
        document.getElementById('cfgTopN').value           = cfg.topN;
        document.getElementById('cfgMinTrades').value      = cfg.minTrades;
        document.getElementById('cfgMinSuccess').value     = cfg.minSuccessPct;
        document.getElementById('cfgMinScore').value       = cfg.minScore;
        document.getElementById('cfgMarketMaxDays').value  = cfg.marketMaxDays;
        document.getElementById('cfgPositionSizePct').value= cfg.positionSizePct;
        document.getElementById('cfgMaxLockedPct').value   = cfg.maxLockedPct;
        document.getElementById('cfgMaxEntryPrice').value  = Math.round(cfg.maxEntryPrice * 100);

        const toggle = document.getElementById('engineToggle');
        toggle.checked = cfg.enabled;
        updateEngineStatus(cfg.enabled);
    } catch (err) {
        console.error('loadConfig', err);
    }
}

async function saveConfig() {
    const fields = [
        { key: 'top_n',            id: 'cfgTopN' },
        { key: 'min_trades',       id: 'cfgMinTrades' },
        { key: 'min_success_pct',  id: 'cfgMinSuccess' },
        { key: 'min_score',        id: 'cfgMinScore' },
        { key: 'market_max_days',  id: 'cfgMarketMaxDays' },
        { key: 'position_size_pct',id: 'cfgPositionSizePct' },
        { key: 'max_locked_pct',   id: 'cfgMaxLockedPct' },
        { key: 'max_entry_price',  id: 'cfgMaxEntryPrice', scale: 0.01 },
    ];
    try {
        for (const f of fields) {
            const raw = document.getElementById(f.id).value;
            const val = f.scale ? (parseFloat(raw) * f.scale).toFixed(2) : raw;
            await PolyChampAPI.request('POST', '/trader/config', { key: f.key, value: val });
        }
        // Refresh candidates immediately after config change
        loadCandidates();
    } catch (err) {
        alert('Failed to save config: ' + err.message);
    }
}

async function toggleEngine(enabled) {
    try {
        await PolyChampAPI.request('POST', '/trader/config', { key: 'enabled', value: String(enabled) });
        updateEngineStatus(enabled);
    } catch (err) {
        // Revert toggle on failure
        document.getElementById('engineToggle').checked = !enabled;
        alert('Failed to toggle engine: ' + err.message);
    }
}

function updateEngineStatus(enabled) {
    const statusEl = document.getElementById('engineStatus');
    statusEl.textContent = enabled ? '● Running' : '○ Stopped';
    statusEl.style.color  = enabled ? 'var(--green)' : 'var(--text-muted)';
}

// ─── Balance ─────────────────────────────────────────────────────────────────

async function refreshBalance() {
    const elAmount    = document.getElementById('balanceAmount');
    const elLocked    = document.getElementById('balanceLocked');
    const elPositions = document.getElementById('balancePositions');
    elAmount.textContent = elLocked.textContent = elPositions.textContent = '…';
    try {
        const data = await PolyChampAPI.request('GET', '/trader/balance');
        elAmount.textContent    = '$' + parseFloat(data.balance).toFixed(2);
        elLocked.textContent    = '$' + parseFloat(data.locked  ).toFixed(2);
        elPositions.textContent = data.positions;
        elAmount.style.color = '';
    } catch (err) {
        elAmount.textContent = 'Auth error';
        elAmount.style.color = 'var(--red)';
        elAmount.title = err.message;
        elLocked.textContent = elPositions.textContent = '—';
    }
}

// ─── Candidates ──────────────────────────────────────────────────────────────

async function loadCandidates() {
    const tbody = document.getElementById('candidatesBody');
    try {
        const data = await PolyChampAPI.request('GET', '/trader/candidates');
        const { candidates } = data;

        // Update count
        document.getElementById('candidateCount').textContent = candidates.length;

        if (!candidates.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">No traders match current criteria</td></tr>';
            window.candidatesLoaded = true;
            return;
        }
        tbody.innerHTML = candidates.map((c, i) => {
            const name = c.username && c.username.length < 30
                ? escHtml(c.username)
                : (c.wallet_address.slice(0,6) + '…' + c.wallet_address.slice(-4));
            const scoreCls = c.score >= 65 ? 'text-green' : c.score >= 40 ? 'text-yellow' : 'text-muted';
            const sucCls   = c.success_pct >= 80 ? 'text-green' : c.success_pct >= 60 ? 'text-yellow' : '';
            return `<tr>
                <td class="text-muted">${i + 1}</td>
                <td><a href="/pages/trader.php?wallet=${encodeURIComponent(c.wallet_address)}" class="wallet-link">${name}</a></td>
                <td><span class="${scoreCls}" style="font-weight:700">${c.score}</span></td>
                <td>${c.total_trades}</td>
                <td class="${sucCls}" style="font-weight:600">${c.success_pct}%</td>
                <td>${formatUSD(c.total_volume)}</td>
                <td class="text-muted">${timeAgo(new Date(c.last_active))}</td>
            </tr>`;
        }).join('');

        // Enable sorting (default: sort by Score descending)
        makeTableSortable('candidatesTable', 2, 'desc');
        window.candidatesLoaded = true;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

// ─── Tab Switching ───────────────────────────────────────────────────────────

function switchTab(tabName) {
    // Hide all panels
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // Show selected panel
    document.getElementById('tab-' + tabName).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Load data if not already loaded
    if (tabName === 'qualifying-traders' && !window.candidatesLoaded) {
        loadCandidates();
    } else if (tabName === 'open-positions' && !window.openPositionsLoaded) {
        loadOpenPositions();
    } else if (tabName === 'trades-history' && !window.tradesHistoryLoaded) {
        loadTradesHistory();
    } else if (tabName === 'activity-log' && !window.activityLogLoaded) {
        loadLog();
    } else if (tabName === 'missed-opportunities' && !window.missedOpportunitiesLoaded) {
        loadMissedOpportunities();
    }
}

// ─── Positions ────────────────────────────────────────────────────────────────

async function loadOpenPositions() {
    const tbody = document.getElementById('openPositionsBody');
    try {
        const data = await PolyChampAPI.request('GET', '/trader/positions?status=open');
        const { positions } = data;

        // Update count
        document.getElementById('openPositionsCount').textContent = positions.length;

        if (!positions.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading">No open positions yet</td></tr>';
            window.openPositionsLoaded = true;
            return;
        }

        tbody.innerHTML = positions.map(p => {
            const ts = new Date(p.opened_at).toLocaleDateString('en-US',
                { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const market = p.market_question
                ? `<span title="${escHtml(p.market_id)}" style="max-width:220px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.market_question)}</span>`
                : `<span class="text-muted">${p.market_id.slice(0,20)}…</span>`;
            const category = categoryBadge(p.market_category || 'other');
            const wallet = p.source_wallet
                ? p.source_wallet.slice(0,6) + '…' + p.source_wallet.slice(-4)
                : '—';
            const outcome = outcomeBadge(p.outcome);
            const size    = '$' + parseFloat(p.size_usd).toFixed(2);
            const entry   = p.entry_price ? (parseFloat(p.entry_price) * 100).toFixed(1) + '¢' : '—';
            const lifetime = p.market_lifetime_days != null
                ? `${parseFloat(p.market_lifetime_days).toFixed(1)}d`
                : '<span class="text-muted">—</span>';
            const statusCls = `pos-status-${p.status}`;
            const pnlStr  = p.pnl != null
                ? `<span class="${p.pnl >= 0 ? 'text-green' : 'text-red'}">${p.pnl >= 0 ? '+' : ''}$${Math.abs(parseFloat(p.pnl)).toFixed(2)}</span>`
                : '';
            return `<tr>
                <td class="text-muted" style="white-space:nowrap" data-timestamp="${p.opened_at}">${ts}</td>
                <td>${market}</td>
                <td>${category}</td>
                <td><a href="/pages/trader.php?wallet=${encodeURIComponent(p.source_wallet)}" class="wallet-link">${escHtml(wallet)}</a></td>
                <td>${outcome}</td>
                <td>${size}</td>
                <td>${entry}</td>
                <td class="text-muted">${lifetime}</td>
                <td><span class="${statusCls}">${p.status}</span>${pnlStr ? ' ' + pnlStr : ''}</td>
                <td class="text-muted" style="font-size:11px">${p.exit_reason || ''}</td>
            </tr>`;
        }).join('');

        // Enable sorting (default: sort by Opened date descending - most recent first)
        makeTableSortable('openPositionsTable', 0, 'desc');
        window.openPositionsLoaded = true;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" class="loading">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

async function loadTradesHistory() {
    const tbody = document.getElementById('tradesHistoryBody');
    try {
        const data = await PolyChampAPI.request('GET', '/trader/positions?status=closed');
        const { positions } = data;

        // Update count
        document.getElementById('tradesHistoryCount').textContent = positions.length;

        if (!positions.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading">No closed trades yet</td></tr>';
            window.tradesHistoryLoaded = true;
            return;
        }

        tbody.innerHTML = positions.map(p => {
            const ts = new Date(p.closed_at || p.opened_at).toLocaleDateString('en-US',
                { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const market = p.market_question
                ? `<span title="${escHtml(p.market_id)}" style="max-width:220px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.market_question)}</span>`
                : `<span class="text-muted">${p.market_id.slice(0,20)}…</span>`;
            const category = categoryBadge(p.market_category || 'other');
            const wallet = p.source_wallet
                ? p.source_wallet.slice(0,6) + '…' + p.source_wallet.slice(-4)
                : '—';
            const outcome = outcomeBadge(p.outcome);
            const size    = '$' + parseFloat(p.size_usd).toFixed(2);
            const entry   = p.entry_price ? (parseFloat(p.entry_price) * 100).toFixed(1) + '¢' : '—';
            const lifetime = p.market_lifetime_days != null
                ? `${parseFloat(p.market_lifetime_days).toFixed(1)}d`
                : '<span class="text-muted">—</span>';
            const pnlStr  = p.pnl != null
                ? `<span class="${p.pnl >= 0 ? 'text-green' : 'text-red'}">${p.pnl >= 0 ? '+' : ''}$${Math.abs(parseFloat(p.pnl)).toFixed(2)}</span>`
                : '<span class="text-muted">—</span>';
            return `<tr>
                <td class="text-muted" style="white-space:nowrap" data-timestamp="${p.closed_at || p.opened_at}">${ts}</td>
                <td>${market}</td>
                <td>${category}</td>
                <td><a href="/pages/trader.php?wallet=${encodeURIComponent(p.source_wallet)}" class="wallet-link">${escHtml(wallet)}</a></td>
                <td>${outcome}</td>
                <td>${size}</td>
                <td>${entry}</td>
                <td class="text-muted">${lifetime}</td>
                <td>${pnlStr}</td>
                <td class="text-muted" style="font-size:11px">${p.exit_reason || ''}</td>
            </tr>`;
        }).join('');

        // Enable sorting (default: sort by Closed date descending - most recent first)
        makeTableSortable('tradesHistoryTable', 0, 'desc');
        window.tradesHistoryLoaded = true;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" class="loading">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

// ─── Log ─────────────────────────────────────────────────────────────────────

async function loadLog() {
    const tbody = document.getElementById('logBody');
    try {
        const data = await PolyChampAPI.request('GET', '/trader/log');
        const { logs } = data;
        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="3" class="loading">No activity yet</td></tr>';
            return;
        }
        tbody.innerHTML = logs.map(l => {
            const ts  = new Date(l.created_at).toLocaleDateString('en-US',
                { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const cls = `log-${l.event_type}`;
            const evt = l.event_type.replace(/_/g, ' ');
            return `<tr>
                <td class="text-muted" style="white-space:nowrap;font-size:11px" data-timestamp="${l.created_at}">${ts}</td>
                <td><span class="${cls}" style="font-size:11px;font-weight:600">${escHtml(evt)}</span></td>
                <td style="font-size:12px">${escHtml(l.message)}</td>
            </tr>`;
        }).join('');

        // Enable sorting (default: sort by Time descending - most recent first)
        makeTableSortable('logTable', 0, 'desc');
        window.activityLogLoaded = true;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="3" class="loading">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

// ─── Clear log ────────────────────────────────────────────────────────────────

async function clearLog() {
    if (!confirm('Clear all activity log entries?\n\nNote: Missed opportunities will be preserved for review.')) return;
    try {
        await PolyChampAPI.request('DELETE', '/trader/log');
        loadLog();
    } catch (err) {
        alert('Failed to clear log: ' + err.message);
    }
}

// ─── Missed Opportunities ─────────────────────────────────────────────────────

async function loadMissedOpportunities() {
    const tbody = document.getElementById('missedOpportunitiesBody');
    try {
        const data = await PolyChampAPI.request('GET', '/trader/missed-opportunities');
        const { opportunities } = data;

        // Update count
        document.getElementById('missedCount').textContent = opportunities.length;

        if (!opportunities.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">No missed opportunities yet</td></tr>';
            window.missedOpportunitiesLoaded = true;
            return;
        }

        tbody.innerHTML = opportunities.map(o => {
            const ts = new Date(o.created_at).toLocaleDateString('en-US',
                { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            const trader = o.username && o.username.length < 30
                ? escHtml(o.username)
                : (o.wallet.slice(0,6) + '…' + o.wallet.slice(-4));

            const market = o.market_question
                ? `<span title="${escHtml(o.market_id || '')}" style="max-width:220px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(o.market_question)}</span>`
                : `<span class="text-muted">${(o.market_id || 'Unknown').slice(0,20)}…</span>`;

            const category = categoryBadge(o.market_category || 'other');
            const outcome = outcomeBadge(o.outcome);

            // Format reason
            const reasonText = (o.reason || 'unknown').replace(/_/g, ' ');
            const reasonLabel = reasonText.charAt(0).toUpperCase() + reasonText.slice(1);

            // Build details string
            let details = '';
            switch (o.reason) {
                case 'price_too_high':
                    if (o.current_price && o.max_entry_price) {
                        const current = (parseFloat(o.current_price) * 100).toFixed(1);
                        const max = (parseFloat(o.max_entry_price) * 100).toFixed(1);
                        details = `${current}¢ > max ${max}¢`;
                    }
                    break;
                case 'position_too_small':
                    if (o.position_size && o.min_order_usd) {
                        details = `$${parseFloat(o.position_size).toFixed(2)} < min $${parseFloat(o.min_order_usd).toFixed(2)}`;
                    }
                    break;
                case 'capital_exceeded':
                    if (o.locked_capital && o.max_locked) {
                        details = `$${parseFloat(o.locked_capital).toFixed(2)} / $${parseFloat(o.max_locked).toFixed(2)}`;
                    }
                    break;
                case 'price_moved_during_retry':
                    if (o.details) {
                        try {
                            const d = JSON.parse(o.details);
                            details = `Attempt ${d.attempt || '?'}`;
                        } catch (_) {}
                    }
                    if (o.current_price && o.max_entry_price) {
                        const current = (parseFloat(o.current_price) * 100).toFixed(1);
                        const max = (parseFloat(o.max_entry_price) * 100).toFixed(1);
                        details += (details ? ' — ' : '') + `${current}¢ > max ${max}¢`;
                    }
                    break;
            }

            return `<tr class="missed-opportunity-row">
                <td class="text-muted" style="white-space:nowrap;font-size:11px" data-timestamp="${o.created_at}">${ts}</td>
                <td><a href="/pages/trader.php?wallet=${encodeURIComponent(o.wallet)}" class="wallet-link">${escHtml(trader)}</a></td>
                <td>${market}</td>
                <td>${category}</td>
                <td>${outcome}</td>
                <td><span class="missed-reason">${escHtml(reasonLabel)}</span></td>
                <td class="text-muted" style="font-size:12px">${escHtml(details)}</td>
            </tr>`;
        }).join('');

        // Enable sorting (default: sort by Time descending - most recent first)
        makeTableSortable('missedOpportunitiesTable', 0, 'desc');
        window.missedOpportunitiesLoaded = true;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

async function clearMissedOpportunities() {
    if (!confirm('Clear all missed opportunities?')) return;
    try {
        await PolyChampAPI.request('DELETE', '/trader/missed-opportunities');
        loadMissedOpportunities();
    } catch (err) {
        alert('Failed to clear missed opportunities: ' + err.message);
    }
}

// ─── Auto-refresh ─────────────────────────────────────────────────────────────

function startAutoRefresh() {
    autoRefreshInterval = setInterval(() => {
        // Refresh all tabs that have been loaded
        if (window.candidatesLoaded) loadCandidates();
        if (window.openPositionsLoaded) loadOpenPositions();
        if (window.tradesHistoryLoaded) loadTradesHistory();
        if (window.activityLogLoaded) loadLog();
        if (window.missedOpportunitiesLoaded) loadMissedOpportunities();

        // Always refresh balance
        refreshBalance();
    }, 30000); // refresh every 30s
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await Promise.all([refreshBalance(), loadCandidates()]);

    // Load the default tab (open positions)
    loadOpenPositions();

    startAutoRefresh();
});
