<?php
$page  = 'trade';
$title = 'Trade';
require_once __DIR__ . '/../includes/header.php';
?>
<style>main.container { max-width: none; padding: 0; }</style>

<div class="trade-layout">

    <!-- ── Sidebar (config + balance) ── -->
    <div class="trade-sidebar">

        <!-- Engine toggle -->
        <div class="engine-toggle">
            <div>
                <div class="engine-toggle-label">Auto-Trader</div>
                <div class="engine-status" id="engineStatus">Loading…</div>
            </div>
            <label class="switch">
                <input type="checkbox" id="engineToggle" onchange="toggleEngine(this.checked)">
                <span class="switch-slider"></span>
            </label>
        </div>

        <!-- Dry-run notice -->
        <div class="dry-run-notice" id="dryRunNotice" style="display:none">
            ⚠ <strong>Dry-run mode</strong> — ENABLE_LIVE_TRADING is off.<br>
            Trades are simulated only. Edit <code>.env</code> to go live.
        </div>

        <!-- Balance -->
        <div class="balance-bar">
            <div class="balance-stats">
                <div class="balance-stat">
                    <div class="balance-stat-label">Available</div>
                    <div class="balance-amount" id="balanceAmount">—</div>
                </div>
                <div class="balance-stat">
                    <div class="balance-stat-label">In Positions</div>
                    <div class="balance-amount text-yellow" id="balanceLocked">—</div>
                </div>
                <div class="balance-stat">
                    <div class="balance-stat-label">Open</div>
                    <div class="balance-amount" id="balancePositions">—</div>
                </div>
            </div>
            <button class="balance-refresh" onclick="refreshBalance()" title="Refresh">↻</button>
        </div>

        <!-- Config -->
        <div class="trade-config-section">
            <h3>Trader Criteria</h3>

            <div class="config-row">
                <label>Top N wallets</label>
                <input type="number" class="config-input" id="cfgTopN" value="150" min="1" max="500">
            </div>
            <div class="config-row">
                <label>Min trades</label>
                <input type="number" class="config-input" id="cfgMinTrades" value="3" min="1">
            </div>
            <div class="config-row">
                <label>Min success %</label>
                <input type="number" class="config-input" id="cfgMinSuccess" value="85" min="50" max="100">
            </div>
            <div class="config-row">
                <label>Min score</label>
                <input type="number" class="config-input" id="cfgMinScore" value="55" min="0" max="100">
            </div>

            <h3 style="margin-top:6px">Risk &amp; Sizing</h3>

            <div class="config-row">
                <label>Market max lifetime (days)</label>
                <input type="number" class="config-input" id="cfgMarketMaxDays" value="14" min="1">
            </div>
            <div class="config-row">
                <label>Position size %</label>
                <input type="number" class="config-input" id="cfgPositionSizePct" value="5" min="0.1" max="100" step="0.5">
            </div>
            <div class="config-row">
                <label>Max capital at risk %</label>
                <input type="number" class="config-input" id="cfgMaxLockedPct" value="25" min="1" max="100">
            </div>
            <div class="config-row">
                <label>Max entry price (¢)</label>
                <input type="number" class="config-input" id="cfgMaxEntryPrice" value="95" min="1" max="99" step="1">
            </div>

            <button class="btn btn-primary save-config-btn" onclick="saveConfig()">Save Config</button>
        </div>

    </div>

    <!-- ── Main panel ── -->
    <div class="trade-main">

        <!-- Trading Activity Tabs -->
        <div class="card">
            <div class="tabs-container">
                <div class="tabs-header">
                    <button class="tab-btn active" data-tab="qualifying-traders" onclick="switchTab('qualifying-traders')">
                        Qualifying Traders <span class="tab-count" id="candidateCount">0</span>
                    </button>
                    <button class="tab-btn" data-tab="open-positions" onclick="switchTab('open-positions')">
                        Open Positions <span class="tab-count" id="openPositionsCount">0</span>
                    </button>
                    <button class="tab-btn" data-tab="trades-history" onclick="switchTab('trades-history')">
                        Trades History <span class="tab-count" id="tradesHistoryCount">0</span>
                    </button>
                    <button class="tab-btn" data-tab="missed-opportunities" onclick="switchTab('missed-opportunities')">
                        Missed Opportunities <span class="tab-count" id="missedCount">0</span>
                    </button>
                    <button class="tab-btn" data-tab="activity-log" onclick="switchTab('activity-log')">
                        Activity Logs
                    </button>
                </div>

                <!-- Tab Panel: Qualifying Traders -->
                <div class="tab-panel active" id="tab-qualifying-traders">
                    <div class="tab-panel-header">
                        <button class="btn btn-sm" onclick="loadCandidates()">↻ Refresh</button>
                    </div>
                    <div class="table-wrap">
                        <table class="data-table" id="candidatesTable">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Wallet</th>
                                    <th>Score</th>
                                    <th>Trades</th>
                                    <th>Success %</th>
                                    <th>Volume</th>
                                    <th>Last Active</th>
                                </tr>
                            </thead>
                            <tbody id="candidatesBody">
                                <tr><td colspan="7" class="loading">Loading…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Tab Panel: Open Positions -->
                <div class="tab-panel" id="tab-open-positions">
                    <div class="tab-panel-header">
                        <button class="btn btn-sm" onclick="loadOpenPositions()">↻ Refresh</button>
                    </div>
                    <div class="table-wrap">
                        <table class="data-table" id="openPositionsTable">
                            <thead>
                                <tr>
                                    <th>Opened</th>
                                    <th>Market</th>
                                    <th>Category</th>
                                    <th>Source Trader</th>
                                    <th>Outcome</th>
                                    <th>Size</th>
                                    <th>Entry</th>
                                    <th>Duration</th>
                                    <th>Status</th>
                                    <th>Exit Reason</th>
                                </tr>
                            </thead>
                            <tbody id="openPositionsBody">
                                <tr><td colspan="10" class="loading">Loading…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Tab Panel: Trades History -->
                <div class="tab-panel" id="tab-trades-history">
                    <div class="tab-panel-header">
                        <button class="btn btn-sm" onclick="loadTradesHistory()">↻ Refresh</button>
                    </div>
                    <div class="table-wrap">
                        <table class="data-table" id="tradesHistoryTable">
                            <thead>
                                <tr>
                                    <th>Closed</th>
                                    <th>Market</th>
                                    <th>Category</th>
                                    <th>Source Trader</th>
                                    <th>Outcome</th>
                                    <th>Size</th>
                                    <th>Entry</th>
                                    <th>Duration</th>
                                    <th>PNL</th>
                                    <th>Exit Reason</th>
                                </tr>
                            </thead>
                            <tbody id="tradesHistoryBody">
                                <tr><td colspan="10" class="loading">Loading…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Tab Panel: Activity Log -->
                <div class="tab-panel" id="tab-activity-log">
                    <div class="tab-panel-header">
                        <div style="display:flex;gap:6px">
                            <button class="btn btn-sm" onclick="loadLog()">↻ Refresh</button>
                            <button class="btn btn-sm btn-danger" onclick="clearLog()">✕ Clear</button>
                        </div>
                    </div>
                    <div class="table-wrap">
                        <table class="data-table" id="logTable">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Event</th>
                                    <th>Message</th>
                                </tr>
                            </thead>
                            <tbody id="logBody">
                                <tr><td colspan="3" class="loading">Loading…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Tab Panel: Missed Opportunities -->
                <div class="tab-panel" id="tab-missed-opportunities">
                    <div class="tab-panel-header">
                        <div style="display:flex;gap:6px">
                            <button class="btn btn-sm" onclick="loadMissedOpportunities()">↻ Refresh</button>
                            <button class="btn btn-sm btn-danger" onclick="clearMissedOpportunities()">✕ Clear</button>
                        </div>
                    </div>
                    <div class="table-wrap">
                        <table class="data-table" id="missedOpportunitiesTable">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Trader</th>
                                    <th>Market</th>
                                    <th>Category</th>
                                    <th>Outcome</th>
                                    <th>Reason</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody id="missedOpportunitiesBody">
                                <tr><td colspan="7" class="loading">Loading…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

    </div>
</div>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
