/**
 * PolyChamp — Trader profile page
 */

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
    return `<span class="${cls}">in ${label}</span>`;
}

function resultBadge(trade) {
    if (!trade.resolved || !trade.winning_outcome) {
        return '<span class="text-muted">—</span>';
    }
    const won = trade.outcome_traded.toUpperCase() === trade.winning_outcome.toUpperCase();
    return won
        ? '<span class="badge-win" title="Correct side">👍 Won</span>'
        : '<span class="badge-loss" title="Wrong side">✕ Lost</span>';
}

function calculatePnL(trade) {
    // Return P&L for a single trade
    if (!trade.resolved || !trade.winning_outcome) {
        return { pnl: null, pnlPct: null, status: 'pending' };
    }

    const invested = parseFloat(trade.amount_usdc);
    const price = parseFloat(trade.price);
    const won = trade.outcome_traded.toUpperCase() === trade.winning_outcome.toUpperCase();

    if (won) {
        // Won: received $1 per share
        // shares = invested / price
        // payout = shares * 1.00
        // pnl = payout - invested = (invested / price) - invested
        const pnl = invested * ((1 - price) / price);
        const pnlPct = (pnl / invested) * 100;
        return { pnl, pnlPct, status: 'won' };
    } else {
        // Lost: received $0 per share
        const pnl = -invested;
        const pnlPct = -100;
        return { pnl, pnlPct, status: 'lost' };
    }
}

function formatPnL(trade) {
    const { pnl, pnlPct, status } = calculatePnL(trade);

    if (status === 'pending') {
        return '<span class="text-muted">—</span>';
    }

    const sign = pnl >= 0 ? '+' : '';
    const colorCls = pnl >= 0 ? 'text-green' : 'text-red';
    return `<span class="${colorCls}" style="font-weight:600">${sign}${formatUSD(pnl)}</span>`;
}

async function loadTrader() {
    if (!WALLET) {
        document.getElementById('traderTitle').textContent = 'No wallet provided';
        return;
    }

    try {
        // Load stats and trades in parallel
        const [statsData, tradesData] = await Promise.all([
            PolyChampAPI.getWalletStats(WALLET).catch(() => null),
            PolyChampAPI.getTradesByWallet(WALLET),
        ]);

        const trades = tradesData.trades || [];
        const displayName = (statsData?.username) || trades[0]?.username || shortWallet(WALLET);

        // Header
        document.getElementById('traderTitle').textContent = displayName;
        document.title = displayName + ' — PolyChamp';
        const polyProfileUrl = `https://polymarket.com/profile/${WALLET}`;
        document.getElementById('traderMeta').innerHTML = `
            <span class="wallet-addr">${WALLET}</span>
            <a href="${polyProfileUrl}" target="_blank" rel="noopener" class="polymarket-link">View on Polymarket ↗</a>
        `;

        // General stats
        if (statsData) {
            // Display score with color coding
            const score = statsData.score || 0;
            const scoreCls = score >= 65 ? 'text-green' : score >= 40 ? 'text-yellow' : 'text-muted';
            document.getElementById('statScore').innerHTML = `<span class="${scoreCls}" style="font-weight:700">${score}</span>`;

            document.getElementById('statVolume').textContent  = formatUSD(statsData.total_volume);
            document.getElementById('statTrades').textContent  = Number(statsData.trade_count).toLocaleString();
            document.getElementById('statMarkets').textContent = Number(statsData.markets_traded).toLocaleString();
            document.getElementById('statSince').textContent   = timeAgo(new Date(statsData.first_seen));
        } else if (trades.length) {
            document.getElementById('statScore').textContent   = '—';
            const vol = trades.reduce((s, t) => s + parseFloat(t.amount_usdc), 0);
            document.getElementById('statVolume').textContent  = formatUSD(vol);
            document.getElementById('statTrades').textContent  = trades.length;
            document.getElementById('statMarkets').textContent = new Set(trades.map(t => t.market_id)).size;
            document.getElementById('statSince').textContent   = timeAgo(new Date(trades[trades.length - 1].timestamp));
        }

        // Resolved performance stats (computed from trades)
        const resolved = trades.filter(t => t.resolved && t.winning_outcome);
        if (resolved.length > 0) {
            const wins   = resolved.filter(t => t.outcome_traded.toUpperCase() === t.winning_outcome.toUpperCase());
            const losses = resolved.filter(t => t.outcome_traded.toUpperCase() !== t.winning_outcome.toUpperCase());
            const wonAmt  = wins.reduce((s, t) => s + parseFloat(t.amount_usdc), 0);
            const lostAmt = losses.reduce((s, t) => s + parseFloat(t.amount_usdc), 0);
            const pct     = Math.round(wins.length / resolved.length * 1000) / 10;

            // Calculate actual P&L (profit/loss), not just invested difference
            const totalPnl = resolved.reduce((sum, t) => {
                const { pnl } = calculatePnL(t);
                return sum + (pnl || 0);
            }, 0);
            const totalInvested = wonAmt + lostAmt;
            const pnlPct = totalInvested > 0
                ? Math.round(totalPnl / totalInvested * 1000) / 10
                : 0;

            const pctCls = pct >= 55 ? 'text-green' : pct >= 45 ? 'text-yellow' : 'text-red';
            document.getElementById('statSuccess').innerHTML =
                `<span class="${pctCls}">${pct}%</span>`;
            document.getElementById('statSuccessDetail').textContent =
                `${wins.length} won · ${losses.length} lost of ${resolved.length}`;

            document.getElementById('statWon').textContent  = wonAmt  > 0 ? formatUSD(wonAmt)  : '—';
            document.getElementById('statLost').textContent = lostAmt > 0 ? formatUSD(lostAmt) : '—';

            // Display actual P&L
            const sign   = totalPnl >= 0 ? '+' : '';
            const pnlCls = totalPnl >= 0 ? 'text-green' : 'text-red';
            document.getElementById('statPnl').innerHTML =
                `<span class="${pnlCls}">${sign}${formatUSD(totalPnl)}</span>`;
            document.getElementById('statPnlDetail').innerHTML =
                `<span class="${pnlCls}" style="font-size:12px">${sign}${pnlPct}%</span>`;

            document.getElementById('resolvedStats').style.display = '';
        }

        // Trade table
        const tbody = document.getElementById('tradesBody');
        if (!trades.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading">No trades recorded for this wallet.</td></tr>';
            return;
        }

        tbody.innerHTML = trades.map(t => `
            <tr>
                <td class="time-cell" data-timestamp="${t.timestamp}">${timeAgo(new Date(t.timestamp))}</td>
                <td>
                    <a href="/pages/market.php?id=${encodeURIComponent(t.market_id)}" class="market-link">
                        <span class="trade-question" title="${escHtml(t.market_question)}">${escHtml(t.market_question)}</span>
                    </a>
                </td>
                <td>${outcomeBadge(t.outcome_traded)}</td>
                <td>${resultBadge(t)}</td>
                <td class="price-cell">${(parseFloat(t.price) * 100).toFixed(1)}¢</td>
                <td class="amount-cell">${formatUSD(t.amount_usdc)}</td>
                <td class="pnl-cell">${formatPnL(t)}</td>
                <td data-timestamp="${t.resolution_date || ''}">${formatExpiry(t.resolution_date)}</td>
                <td>${categoryBadge(t.market_category)}</td>
            </tr>
        `).join('');

        // Enable table sorting (default: sort by Time descending - most recent first)
        makeTableSortable('traderTradesTable', 0, 'desc');

    } catch (err) {
        document.getElementById('traderTitle').textContent = 'Error loading trader';
        document.getElementById('tradesBody').innerHTML =
            `<tr><td colspan="9" class="loading">${escHtml(err.message)}</td></tr>`;
    }
}

document.addEventListener('DOMContentLoaded', loadTrader);
