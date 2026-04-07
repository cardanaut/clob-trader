<?php
$page  = 'account';
$title = 'Account';
require_once __DIR__ . '/../includes/header.php';
?>

<div class="page-header">
    <h1>My Account</h1>
    <div class="subtitle">Polymarket trade history for proxy wallet</div>
</div>

<!-- Stats bar -->
<div class="stats-bar" id="accountStats">
    <div class="stat-card">
        <div class="stat-value" id="statTrades">—</div>
        <div class="stat-label">Total Trades</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" id="statVolume">—</div>
        <div class="stat-label">Total Volume</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" id="statWinRate">—</div>
        <div class="stat-label">Win Rate</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" id="statPnl">—</div>
        <div class="stat-label">Unrealised P&amp;L</div>
    </div>
</div>

<!-- Open Positions -->
<div class="card">
    <div class="card-header">
        <h2>Open Positions</h2>
        <button class="btn btn-sm" onclick="loadPositions()">↻ Refresh</button>
    </div>
    <div class="table-wrap">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Market</th>
                    <th>Outcome</th>
                    <th>Shares</th>
                    <th>Avg Price</th>
                    <th>Current</th>
                    <th>Value</th>
                    <th>P&amp;L</th>
                </tr>
            </thead>
            <tbody id="positionsBody">
                <tr><td colspan="7" class="loading">Loading…</td></tr>
            </tbody>
        </table>
    </div>
</div>

<!-- Trade History -->
<div class="card">
    <div class="card-header">
        <h2>Trade History</h2>
        <div class="filters">
            <select id="sideFilter" onchange="loadTrades()">
                <option value="">All sides</option>
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
            </select>
            <button class="btn btn-sm" onclick="loadTrades()">↻ Refresh</button>
        </div>
    </div>
    <div class="table-wrap">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Market</th>
                    <th>Outcome</th>
                    <th>Side</th>
                    <th>Size</th>
                    <th>Price</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody id="tradesBody">
                <tr><td colspan="7" class="loading">Loading…</td></tr>
            </tbody>
        </table>
    </div>
    <div class="pagination" id="tradesPagination" style="display:none">
        <button class="btn btn-sm" id="prevPageBtn" onclick="changePage(-1)" disabled>← Prev</button>
        <span id="pageInfo" class="text-muted"></span>
        <button class="btn btn-sm" id="nextPageBtn" onclick="changePage(1)">Next →</button>
    </div>
</div>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
