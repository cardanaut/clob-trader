/**
 * PolyChamp — Account history page
 */

const PAGE_SIZE = 50;
let currentPage = 0;
let hasMore     = false;

// ─── Positions ───────────────────────────────────────────────────────────────

async function loadPositions() {
    const tbody = document.getElementById('positionsBody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading…</td></tr>';
    try {
        const data = await PolyChampAPI.request('GET', '/account/positions');
        let positions = data.positions || [];

        // BUGFIX: Filter to only show ACTIVE positions (size > 0)
        positions = positions.filter(p => {
            const size = parseFloat(p.size || p.shares || '0');
            return size > 0;
        });

        // Update unrealised P&L stat
        const totalPnl = positions.reduce((s, p) => s + (parseFloat(p.cashPnl || p.pnl || '0')), 0);
        const pnlEl = document.getElementById('statPnl');
        pnlEl.textContent = (totalPnl >= 0 ? '+$' : '-$') + Math.abs(totalPnl).toFixed(2);
        pnlEl.style.color = totalPnl >= 0 ? 'var(--green)' : 'var(--red)';

        if (!positions.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">No open positions</td></tr>';
            return;
        }

        tbody.innerHTML = positions.map(p => {
            const title   = p.title || p.market || p.conditionId || '—';
            const outcome = p.outcome || '—';
            const outCls  = outcome.toLowerCase() === 'yes' ? 'badge-yes' : 'badge-no';

            // Add outcome icon based on P&L
            const pnl = parseFloat(p.cashPnl || p.pnl || '0');
            const outcomeIcon = pnl > 0 ? ' 👍' : pnl < 0 ? ' ❌' : '';

            const shares  = parseFloat(p.size || p.shares || '0').toFixed(2);
            const avgPrice= p.avgPrice != null ? (parseFloat(p.avgPrice) * 100).toFixed(1) + '¢' : '—';
            const curPrice= p.curPrice != null ? (parseFloat(p.curPrice) * 100).toFixed(1) + '¢' : '—';
            const value   = p.currentValue != null ? '$' + parseFloat(p.currentValue).toFixed(2) : '—';
            const pnlStr  = p.cashPnl != null || p.pnl != null
                ? `<span class="${pnl >= 0 ? 'text-green' : 'text-red'}">${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}</span>`
                : '—';
            return `<tr>
                <td class="market-cell" title="${escHtml(title)}">${escHtml(title)}</td>
                <td><span class="badge ${outCls}">${escHtml(outcome)}${outcomeIcon}</span></td>
                <td>${shares}</td>
                <td>${avgPrice}</td>
                <td>${curPrice}</td>
                <td>${value}</td>
                <td>${pnlStr}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        document.getElementById('positionsBody').innerHTML =
            `<tr><td colspan="7" class="loading">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

// ─── Trades ──────────────────────────────────────────────────────────────────

async function loadTrades() {
    currentPage = 0;
    await fetchTrades();
}

async function changePage(dir) {
    currentPage = Math.max(0, currentPage + dir);
    await fetchTrades();
}

async function fetchTrades() {
    const tbody   = document.getElementById('tradesBody');
    const pager   = document.getElementById('tradesPagination');
    const side    = document.getElementById('sideFilter').value;
    const offset  = currentPage * PAGE_SIZE;

    tbody.innerHTML = `<tr><td colspan="7" class="loading">Loading…</td></tr>`;

    try {
        let url = `/account/trades?limit=${PAGE_SIZE}&offset=${offset}`;
        if (side) url += `&side=${side}`;

        const data   = await PolyChampAPI.request('GET', url);
        const trades = data.trades || [];
        hasMore = trades.length === PAGE_SIZE;

        // Update summary stats on first page
        if (currentPage === 0 && !side) {
            updateStats(trades);
        }

        if (!trades.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">No trades found</td></tr>';
            pager.style.display = 'none';
            return;
        }

        tbody.innerHTML = trades.map(t => {
            const ts = new Date(t.timestamp * 1000).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            const title   = t.title || t.conditionId || '—';
            const outcome = t.outcome || '—';
            const outCls  = outcome.toLowerCase() === 'yes' ? 'badge-yes' : 'badge-no';
            const side    = t.side || '—';
            const sideCls = side === 'BUY' ? 'text-green' : 'text-yellow';
            const size    = parseFloat(t.size || '0').toFixed(2);
            const price   = t.price != null ? (parseFloat(t.price) * 100).toFixed(1) + '¢' : '—';

            // Colorize VALUE based on transaction type
            // BUY = money out (negative, red), SELL = money in (positive, green)
            let value = '—';
            if (t.price != null && t.size != null) {
                const rawValue = parseFloat(t.size) * parseFloat(t.price);
                if (side === 'BUY') {
                    // Money going out - show as negative in red
                    value = `<span class="text-red" style="font-weight:600">-$${rawValue.toFixed(2)}</span>`;
                } else if (side === 'SELL') {
                    // Money coming in - show as positive in green
                    value = `<span class="text-green" style="font-weight:600">+$${rawValue.toFixed(2)}</span>`;
                } else {
                    value = '$' + rawValue.toFixed(2);
                }
            }

            const slug    = t.slug || '';
            const marketLink = slug
                ? `<a href="https://polymarket.com/event/${slug}" target="_blank" class="market-link" title="${escHtml(title)}">${escHtml(title.length > 60 ? title.slice(0, 57) + '…' : title)}</a>`
                : `<span title="${escHtml(title)}">${escHtml(title.length > 60 ? title.slice(0, 57) + '…' : title)}</span>`;
            return `<tr>
                <td class="text-muted" style="white-space:nowrap;font-size:12px">${ts}</td>
                <td class="market-cell">${marketLink}</td>
                <td><span class="badge ${outCls}">${escHtml(outcome)}</span></td>
                <td><span class="${sideCls}" style="font-weight:600">${side}</span></td>
                <td>${size}</td>
                <td>${price}</td>
                <td>${value}</td>
            </tr>`;
        }).join('');

        // Pagination controls
        pager.style.display = 'flex';
        document.getElementById('pageInfo').textContent =
            `Page ${currentPage + 1}${hasMore ? '' : ' (last)'}`;
        document.getElementById('prevPageBtn').disabled = currentPage === 0;
        document.getElementById('nextPageBtn').disabled = !hasMore;

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading">Error: ${escHtml(err.message)}</td></tr>`;
        pager.style.display = 'none';
    }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

function updateStats(trades) {
    const buys  = trades.filter(t => t.side === 'BUY');
    const sells = trades.filter(t => t.side === 'SELL');

    const totalVol = trades.reduce((s, t) => {
        const v = t.price != null && t.size != null
            ? parseFloat(t.size) * parseFloat(t.price)
            : 0;
        return s + v;
    }, 0);

    // Rough win rate: sell trades where price > 0.5 (resolved YES on a YES outcome)
    // We can't know from this data alone, so just show BUY/SELL counts for now
    document.getElementById('statTrades').textContent = trades.length;
    document.getElementById('statVolume').textContent = '$' + totalVol.toFixed(0);
    document.getElementById('statWinRate').textContent = buys.length + 'B / ' + sells.length + 'S';
    // P&L is set by loadPositions
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadPositions(), loadTrades()]);
});
