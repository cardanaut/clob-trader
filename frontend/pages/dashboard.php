<?php
$page = 'dashboard';
$title = 'Dashboard';
require_once __DIR__ . '/../includes/header.php';
?>

<div class="page-header">
    <h1>Dashboard</h1>
    <p class="subtitle">Live whale trades &mdash; <span id="minAmount">$2,000+</span> USDC only</p>
</div>

<!-- Stats Bar -->
<div class="stats-bar" id="statsBar">
    <div class="stat-card">
        <div class="stat-value" id="statTrades">—</div>
        <div class="stat-label">Total Trades</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" id="statWallets">—</div>
        <div class="stat-label">Unique Wallets</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" id="statMarkets">—</div>
        <div class="stat-label">Markets Tracked</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" id="statLastTrade">—</div>
        <div class="stat-label">Last Trade</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" id="statResolved">—</div>
        <div class="stat-detail" id="statResolvedDetail">&nbsp;</div>
        <div class="stat-label">Resolved Trades</div>
    </div>
</div>

<!-- Tabbed card: Recent Trades + Top Traders -->
<div class="card">
    <div class="dash-tabs">
        <button class="dash-tab active" data-tab="trades" onclick="switchDashTab('trades')">Recent Trades</button>
        <button class="dash-tab" data-tab="wallets" onclick="switchDashTab('wallets')">Top Traders</button>
    </div>

    <!-- Recent Trades panel -->
    <div class="dash-tab-panel active" id="dash-tab-trades">
        <div class="card-header" style="border-top:1px solid var(--border);padding-top:12px">
            <div class="filters">
                <select id="filterCategory" onchange="refreshTrades()">
                    <option value="">All Categories</option>
                    <option value="politics">Politics</option>
                    <option value="sports">Sports</option>
                    <option value="crypto">Crypto</option>
                    <option value="other">Other</option>
                </select>
                <div class="filter-amount">
                    <span class="filter-label">Min $</span>
                    <input type="number" id="filterMinAmount" class="filter-input-num" value="2000" min="0" step="500" onchange="refreshTrades()">
                </div>
                <button class="btn btn-sm" id="btnBinary" onclick="toggleBinary()">All Markets</button>
                <select id="expiredFilter" class="btn btn-sm" onchange="refreshTrades()" style="cursor:pointer">
                    <option value="show">Show Expired</option>
                    <option value="hide">Hide Expired</option>
                    <option value="only">Only Expired</option>
                </select>
                <button class="btn btn-sm" onclick="refreshTrades()">Refresh</button>
            </div>
        </div>
        <div class="table-wrap">
            <table class="data-table" id="tradesTable">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Wallet</th>
                        <th>Market</th>
                        <th>Outcome</th>
                        <th>Price</th>
                        <th>Amount</th>
                        <th>Expires</th>
                        <th>Category</th>
                    </tr>
                </thead>
                <tbody id="tradesBody">
                    <tr><td colspan="8" class="loading">Loading trades...</td></tr>
                </tbody>
            </table>
        </div>
        <div class="pagination">
            <button class="btn btn-sm" id="btnPrev" onclick="prevPage()" disabled>Prev</button>
            <span id="pageInfo">Page 1</span>
            <button class="btn btn-sm" id="btnNext" onclick="nextPage()">Next</button>
        </div>
    </div>

    <!-- Top Traders panel -->
    <div class="dash-tab-panel" id="dash-tab-wallets">
        <div class="card-header" style="border-top:1px solid var(--border);padding-top:12px;flex-wrap:wrap;gap:8px">
            <h2>Top Traders <span class="text-muted" style="font-size:13px;font-weight:400">(30 days)</span></h2>
            <div class="filters">
                <span class="filter-label">Success %</span>
                <input type="number" id="walletMinSuccess" class="filter-input-num" placeholder="Min" min="0" max="100" step="5" style="width:58px" onchange="refreshWallets()">
                <span class="filter-label">–</span>
                <input type="number" id="walletMaxSuccess" class="filter-input-num" placeholder="Max" min="0" max="100" step="5" style="width:58px" onchange="refreshWallets()">
                <span class="filter-label" style="margin-left:8px">Volume $</span>
                <input type="number" id="walletMinVolume" class="filter-input-num" placeholder="Min" min="0" step="1000" style="width:80px" onchange="refreshWallets()">
                <span class="filter-label">–</span>
                <input type="number" id="walletMaxVolume" class="filter-input-num" placeholder="Max" min="0" step="1000" style="width:80px" onchange="refreshWallets()">
                <label class="filter-label" style="display:flex;align-items:center;gap:5px;cursor:pointer">
                    <input type="checkbox" id="walletHideNegPnl" onchange="refreshWallets()">
                    Hide negative PNL
                </label>
                <button class="btn btn-sm" onclick="refreshWallets()">Apply</button>
            </div>
        </div>
        <div class="table-wrap">
            <table class="data-table" id="walletsTable">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Wallet</th>
                        <th class="sortable" data-sort="score" onclick="sortWallets('score')">Score</th>
                        <th class="sortable" data-sort="volume" onclick="sortWallets('volume')">Volume</th>
                        <th class="sortable" data-sort="trades" onclick="sortWallets('trades')">Trades</th>
                        <th class="sortable" data-sort="success" onclick="sortWallets('success')">Success %</th>
                        <th class="sortable" data-sort="pending" onclick="sortWallets('pending')">Pending $</th>
                        <th class="sortable" data-sort="lost" onclick="sortWallets('lost')">Lost $</th>
                        <th class="sortable" data-sort="won" onclick="sortWallets('won')">Won $</th>
                        <th class="sortable" data-sort="pnl" onclick="sortWallets('pnl')">PNL</th>
                        <th class="sortable" data-sort="last_active" onclick="sortWallets('last_active')">Last Active</th>
                        <th class="sortable" data-sort="markets" onclick="sortWallets('markets')">Markets</th>
                    </tr>
                </thead>
                <tbody id="walletsBody">
                    <tr><td colspan="12" class="loading">Loading traders...</td></tr>
                </tbody>
            </table>
        </div>
        <div class="pagination">
            <button class="btn btn-sm" id="btnWalletPrev" onclick="prevWalletPage()" disabled>Prev</button>
            <span id="walletPageInfo">Page 1</span>
            <button class="btn btn-sm" id="btnWalletNext" onclick="nextWalletPage()">Next</button>
        </div>
    </div>
</div>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
