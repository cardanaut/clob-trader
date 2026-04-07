/**
 * PolyChamp — Market detail page
 */

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatExpiry(dateStr) {
    if (!dateStr) return '—';
    const ms = new Date(dateStr) - Date.now();
    if (ms <= 0) return 'Expired';
    const mins  = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    const days  = Math.floor(ms / 86400000);
    if (mins < 60)       return `${mins}m`;
    if (hours < 24)      return `${hours}h ${Math.floor((ms % 3600000) / 60000)}m`;
    return `${days}d`;
}

async function loadMarket() {
    if (!MARKET_ID) {
        document.getElementById('marketTitle').textContent = 'No market ID provided';
        return;
    }

    try {
        const data = await PolyChampAPI.getMarket(encodeURIComponent(MARKET_ID));
        const { market, trades } = data;

        // Header
        document.getElementById('marketTitle').textContent = market.question;
        document.title = market.question + ' — PolyChamp';

        const polyUrl = market.slug
            ? `https://polymarket.com/event/${market.slug}`
            : `https://polymarket.com/`;

        const badges = [
            `<span class="badge badge-${market.category}">${market.category}</span>`,
            market.is_binary ? '<span class="badge badge-yes">YES / NO</span>' : '',
            market.resolved  ? '<span class="badge badge-no">Resolved</span>' : '<span class="badge badge-ok">Active</span>',
            `<a href="${polyUrl}" target="_blank" rel="noopener" class="polymarket-link">View on Polymarket ↗</a>`,
        ].filter(Boolean).join(' ');
        document.getElementById('marketMeta').innerHTML = badges;

        // Aggregate stats
        const totalVol   = trades.reduce((s, t) => s + parseFloat(t.amount_usdc), 0);
        const yesVol     = trades.filter(t => t.outcome_traded === 'YES').reduce((s, t) => s + parseFloat(t.amount_usdc), 0);
        const noVol      = totalVol - yesVol;
        const yesPct     = totalVol > 0 ? Math.round(yesVol / totalVol * 100) : 50;
        const expiry     = market.resolution_date ? formatExpiry(market.resolution_date) : '—';

        document.getElementById('statVolume').textContent = '$' + Math.round(totalVol).toLocaleString();
        document.getElementById('statTrades').textContent = trades.length;
        document.getElementById('statYesPct').textContent = yesPct + '%';
        document.getElementById('statExpiry').textContent = expiry;

        // YES/NO bar (only for binary markets)
        if (market.is_binary && trades.length > 0) {
            document.getElementById('yesNoCard').style.display = '';
            document.getElementById('yesFill').style.width = yesPct + '%';
            document.getElementById('noFill').style.width  = (100 - yesPct) + '%';
            document.getElementById('yesLabel').textContent = `YES ${yesPct}% ($${Math.round(yesVol).toLocaleString()})`;
            document.getElementById('noLabel').textContent  = `NO ${100 - yesPct}% ($${Math.round(noVol).toLocaleString()})`;
        }

        // Trade table
        const tbody = document.getElementById('tradesBody');
        if (!trades.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">No whale trades recorded for this market.</td></tr>';
            return;
        }
        tbody.innerHTML = trades.map(t => `
            <tr>
                <td class="time-cell">${timeAgo(new Date(t.timestamp))}</td>
                <td>
                    <a href="/pages/trader.php?wallet=${encodeURIComponent(t.wallet_address)}" class="wallet-link">
                        ${escHtml(t.username || shortWallet(t.wallet_address))}
                    </a>
                </td>
                <td>${outcomeBadge(t.outcome_traded)}</td>
                <td class="price-cell">${(parseFloat(t.price) * 100).toFixed(1)}¢</td>
                <td class="amount-cell">${formatUSD(t.amount_usdc)}</td>
            </tr>
        `).join('');

    } catch (err) {
        document.getElementById('marketTitle').textContent = 'Error loading market';
        document.getElementById('tradesBody').innerHTML =
            `<tr><td colspan="5" class="loading">${escHtml(err.message)}</td></tr>`;
    }
}

document.addEventListener('DOMContentLoaded', loadMarket);
