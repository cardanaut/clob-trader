/**
 * PolyChamp — Dashboard page logic
 */

const PAGE_SIZE = 50;
const WALLET_PAGE_SIZE = 50;
let currentPage = 0;
let binaryOnly = false;
let walletPage = 0;
let walletSortBy  = 'score';
let walletSortDir = 'desc';

// --- State persistence ---

const LS_KEY = 'pc_dashboard_v2';

function saveState() {
    const state = {
        category:        document.getElementById('filterCategory')?.value  || '',
        minAmount:       document.getElementById('filterMinAmount')?.value  || '2000',
        binaryOnly,
        expiredMode:     document.getElementById('expiredFilter')?.value    || 'show',
        walletMinSuccess: document.getElementById('walletMinSuccess')?.value || '',
        walletMaxSuccess: document.getElementById('walletMaxSuccess')?.value || '',
        walletMinVolume:  document.getElementById('walletMinVolume')?.value  || '',
        walletMaxVolume:  document.getElementById('walletMaxVolume')?.value  || '',
        walletHideNegPnl: document.getElementById('walletHideNegPnl')?.checked || false,
        walletSortBy,
        walletSortDir,
        activeTab: document.querySelector('.dash-tab.active')?.dataset.tab || 'trades',
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

function restoreState() {
    let state;
    try { state = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch {}
    if (!state) return;

    // Trades filters
    const cat = document.getElementById('filterCategory');
    if (cat && state.category) cat.value = state.category;

    const minAmt = document.getElementById('filterMinAmount');
    if (minAmt && state.minAmount !== undefined) minAmt.value = state.minAmount;

    if (state.binaryOnly) {
        binaryOnly = true;
        const btn = document.getElementById('btnBinary');
        if (btn) { btn.textContent = 'YES/NO Only'; btn.classList.add('btn-primary'); }
    }

    const expired = document.getElementById('expiredFilter');
    if (expired && state.expiredMode) expired.value = state.expiredMode;

    // Wallet filters
    ['walletMinSuccess', 'walletMaxSuccess', 'walletMinVolume', 'walletMaxVolume'].forEach(id => {
        const el = document.getElementById(id);
        if (el && state[id]) el.value = state[id];
    });

    const hideNeg = document.getElementById('walletHideNegPnl');
    if (hideNeg) hideNeg.checked = !!state.walletHideNegPnl;

    if (state.walletSortBy)  walletSortBy  = state.walletSortBy;
    if (state.walletSortDir) walletSortDir = state.walletSortDir;

    // Active tab
    if (state.activeTab) switchDashTab(state.activeTab);
}

// --- Summary ---

async function loadSummary() {
    try {
        const data = await PolyChampAPI.getSummary();
        document.getElementById('statTrades').textContent = data.trade_count.toLocaleString();
        document.getElementById('statWallets').textContent = data.wallet_count.toLocaleString();
        document.getElementById('statMarkets').textContent = data.market_count.toLocaleString();
        document.getElementById('statLastTrade').textContent = data.last_trade
            ? timeAgo(new Date(data.last_trade))
            : 'None yet';

        const rc = data.resolved_count ?? 0;
        const rw = data.resolved_wins  ?? 0;
        const rp = data.resolved_pct;
        document.getElementById('statResolved').textContent = rc.toLocaleString();
        const detail = document.getElementById('statResolvedDetail');
        if (rc > 0) {
            const cls = rp >= 55 ? 'text-green' : rp >= 45 ? 'text-yellow' : 'text-red';
            detail.innerHTML = `${rw.toLocaleString()} won &middot; <span class="${cls}">${rp}%</span>`;
        } else {
            detail.innerHTML = '&nbsp;';
        }
    } catch (err) {
        console.warn('Summary load error:', err.message);
    }
}

// --- Trades ---

async function loadTrades(page = 0) {
    const tbody = document.getElementById('tradesBody');
    const category = document.getElementById('filterCategory')?.value || '';

    tbody.innerHTML = '<tr><td colspan="8" class="loading">Loading...</td></tr>';

    try {
        const minAmount = parseFloat(document.getElementById('filterMinAmount')?.value) || 0;
        const expiredMode = document.getElementById('expiredFilter')?.value || 'show';
        const filters = {
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
        };
        if (category) filters.category = category;
        if (binaryOnly) filters.binary = 'true';
        if (minAmount > 0) filters.min_amount = minAmount;
        if (expiredMode === 'only') filters.resolved = 'true';

        const data = await PolyChampAPI.getTrades(filters);
        const trades = data.trades || [];

        if (trades.length === 0) {
            const msg = binaryOnly
                ? 'No binary YES/NO trades yet. Toggle off to see all markets.'
                : 'No trades yet. Collector may still be starting.';
            tbody.innerHTML = `<tr><td colspan="8" class="loading">${msg}</td></tr>`;
            return;
        }

        // Apply expired filter
        const now = Date.now();
        const displayTrades = expiredMode === 'hide'
            ? trades.filter(t => !t.resolution_date || new Date(t.resolution_date) > now)
            : expiredMode === 'only'
                ? trades.filter(t => t.resolution_date && new Date(t.resolution_date) <= now)
                : trades;

        if (displayTrades.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="loading">No trades match current filters.</td></tr>`;
            return;
        }

        tbody.innerHTML = displayTrades.map(t => `
            <tr>
                <td class="time-cell">${timeAgo(new Date(t.timestamp))}</td>
                <td>
                    <a href="/pages/trader.php?wallet=${encodeURIComponent(t.wallet_address)}" class="wallet-link" title="${t.wallet_address}">
                        ${escHtml(t.username || shortWallet(t.wallet_address))}
                    </a>
                </td>
                <td>
                    <a href="/pages/market.php?id=${encodeURIComponent(t.market_id)}" class="market-link">
                        <span class="trade-question" title="${escHtml(t.market_question)}">${escHtml(t.market_question)}</span>
                    </a>
                </td>
                <td>${outcomeBadge(t.outcome_traded)}${(() => {
                    if (!t.resolved || !t.winning_outcome) return '';
                    const won = t.outcome_traded.toUpperCase() === t.winning_outcome.toUpperCase();
                    return won
                        ? ' <span title="Trade resolved — correct side">👍</span>'
                        : ' <span style="color:var(--red);font-weight:700;margin-left:3px" title="Trade resolved — wrong side">✕</span>';
                })()}</td>
                <td class="price-cell">${(parseFloat(t.price) * 100).toFixed(1)}¢</td>
                <td class="amount-cell">${formatUSD(t.amount_usdc)}</td>
                <td class="time-cell">${formatExpiry(t.resolution_date)}</td>
                <td>${categoryBadge(t.market_category)}</td>
            </tr>
        `).join('');

        // Pagination
        const totalPages = Math.ceil(data.total / PAGE_SIZE);
        document.getElementById('pageInfo').textContent = `Page ${page + 1} of ${Math.max(1, totalPages)}`;
        document.getElementById('btnPrev').disabled = page === 0;
        document.getElementById('btnNext').disabled = (page + 1) >= totalPages || trades.length < PAGE_SIZE;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

// --- Wallets ---

async function loadWallets(page = 0) {
    const tbody = document.getElementById('walletsBody');
    tbody.innerHTML = '<tr><td colspan="12" class="loading">Loading...</td></tr>';
    try {
        const minSuccess = parseFloat(document.getElementById('walletMinSuccess')?.value) || undefined;
        const maxSuccess = parseFloat(document.getElementById('walletMaxSuccess')?.value) || undefined;
        const minVolume  = parseFloat(document.getElementById('walletMinVolume')?.value)  || undefined;
        const maxVolume  = parseFloat(document.getElementById('walletMaxVolume')?.value)  || undefined;

        const params = {
            days: 30, limit: WALLET_PAGE_SIZE, offset: page * WALLET_PAGE_SIZE,
            sort_by: walletSortBy, sort_dir: walletSortDir,
        };
        if (minSuccess > 0)    params.min_success = minSuccess;
        if (maxSuccess < 100)  params.max_success = maxSuccess;
        if (minVolume  > 0)    params.min_volume  = minVolume;
        if (maxVolume  > 0)    params.max_volume  = maxVolume;
        if (document.getElementById('walletHideNegPnl')?.checked) params.hide_negative_pnl = 'true';

        // Update sort indicators on headers
        document.querySelectorAll('#walletsTable th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc', 'sort-none');
            th.classList.add(th.dataset.sort === walletSortBy
                ? (walletSortDir === 'asc' ? 'sort-asc' : 'sort-desc')
                : 'sort-none');
        });

        const data = await PolyChampAPI.getWallets(params);
        const wallets = data.wallets || [];

        if (wallets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="loading">No traders match the filters.</td></tr>';
        } else {
            tbody.innerHTML = wallets.map((w, i) => {
                const rc   = Number(w.resolved_count) || 0;
                const rw   = Number(w.resolved_wins)  || 0;
                const rp   = rc > 0 ? Math.round(rw / rc * 1000) / 10 : null;
                const won  = w.won_amount  != null ? parseFloat(w.won_amount)  : null;
                const lost = w.lost_amount != null ? parseFloat(w.lost_amount) : null;
                const pend = w.pending_amount != null ? parseFloat(w.pending_amount) : null;
                const score = Number(w.score) || 0;
                const scoreCls = score >= 65 ? 'text-green' : score >= 40 ? 'text-yellow' : 'text-muted';
                const scoreCell = `<span class="${scoreCls}" style="font-weight:700;font-size:15px">${score}</span>`;

                const successCell = rp !== null
                    ? (() => {
                        const cls = rp >= 55 ? 'text-green' : rp >= 45 ? 'text-yellow' : 'text-red';
                        const detail = rp < 100 ? ` <span class="text-muted" style="font-size:11px">(${rw}/${rc})</span>` : '';
                        return `<span class="${cls}" style="font-weight:600">${rp}%</span>${detail}`;
                      })()
                    : '<span class="text-muted">—</span>';

                const pendCell = pend != null && pend > 0
                    ? `<span class="text-yellow">${formatUSD(pend)}</span>`
                    : '<span class="text-muted">—</span>';

                const lostCell = lost != null && lost > 0
                    ? `<span class="text-red">${formatUSD(lost)}</span>`
                    : '<span class="text-muted">—</span>';

                const wonCell = won != null && won > 0
                    ? `<span class="text-green">${formatUSD(won)}</span>`
                    : '<span class="text-muted">—</span>';

                let pnlCell = '<span class="text-muted">—</span>';
                if (won > 0 && lost > 0) {
                    const pnl    = won - lost;
                    const base   = won + lost;
                    const pnlPct = Math.round(pnl / base * 1000) / 10;
                    const cls    = pnl > 0 ? 'text-green' : 'text-red';
                    const sign   = pnl >= 0 ? '+' : '';
                    pnlCell = `<span class="${cls}" style="font-weight:600">${sign}${formatUSD(pnl)}</span>`
                            + ` <span class="text-muted" style="font-size:11px">(${sign}${pnlPct}%)</span>`;
                }

                return `<tr>
                    <td class="text-muted">${page * WALLET_PAGE_SIZE + i + 1}</td>
                    <td><a href="/pages/trader.php?wallet=${encodeURIComponent(w.wallet_address)}" class="wallet-link" title="${w.wallet_address}">${escHtml(w.username || shortWallet(w.wallet_address))}</a></td>
                    <td style="text-align:center">${scoreCell}</td>
                    <td class="amount-cell">${formatUSD(w.total_volume)}</td>
                    <td>${Number(w.trade_count).toLocaleString()}</td>
                    <td>${successCell}</td>
                    <td>${pendCell}</td>
                    <td>${lostCell}</td>
                    <td>${wonCell}</td>
                    <td>${pnlCell}</td>
                    <td class="time-cell">${timeAgo(new Date(w.last_seen))}</td>
                    <td>${Number(w.markets_traded).toLocaleString()}</td>
                </tr>`;
            }).join('');
        }

        document.getElementById('walletPageInfo').textContent = `Page ${page + 1}`;
        document.getElementById('btnWalletPrev').disabled = page === 0;
        document.getElementById('btnWalletNext').disabled = !data.hasMore;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="12" class="loading">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

// --- Controls ---

function refreshWallets() {
    walletPage = 0;
    saveState();
    loadWallets(0);
}

function sortWallets(col) {
    if (walletSortBy === col) {
        walletSortDir = walletSortDir === 'desc' ? 'asc' : 'desc';
    } else {
        walletSortBy  = col;
        walletSortDir = 'desc';
    }
    walletPage = 0;
    saveState();
    loadWallets(0);
}

function prevWalletPage() {
    if (walletPage > 0) { walletPage--; loadWallets(walletPage); }
}

function nextWalletPage() {
    walletPage++;
    loadWallets(walletPage);
}

function switchDashTab(name) {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.dash-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'dash-tab-' + name));
    saveState();
}

function toggleBinary() {
    binaryOnly = !binaryOnly;
    const btn = document.getElementById('btnBinary');
    btn.textContent = binaryOnly ? 'YES/NO Only' : 'All Markets';
    btn.classList.toggle('btn-primary', binaryOnly);
    refreshTrades();
}

function refreshTrades() {
    currentPage = 0;
    saveState();
    loadTrades(0);
}

function prevPage() {
    if (currentPage > 0) {
        currentPage--;
        loadTrades(currentPage);
    }
}

function nextPage() {
    currentPage++;
    loadTrades(currentPage);
}

// Format expiry: "in 3h", "in 2d", "expired", or "—"
function formatExpiry(dateStr) {
    if (!dateStr) return '<span class="text-muted">—</span>';
    const ms = new Date(dateStr) - Date.now();
    if (ms <= 0) return '<span class="expired">Expired</span>';
    const mins  = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    const days  = Math.floor(ms / 86400000);
    let label;
    if (mins < 60)       label = `${mins}m`;
    else if (hours < 24) label = `${hours}h ${Math.floor((ms % 3600000) / 60000)}m`;
    else                 label = `${days}d`;
    const cls = hours < 2 ? 'expiry-urgent' : hours < 24 ? 'expiry-soon' : 'expiry-ok';
    return `<span class="${cls}" title="${new Date(dateStr).toUTCString()}">in ${label}</span>`;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
    restoreState();
    loadSummary();
    loadTrades(0);
    loadWallets();
    setInterval(() => {
        loadSummary();
        if (currentPage === 0) loadTrades(0);
    }, 60000);
});
