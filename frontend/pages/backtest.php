<?php
$page  = 'backtest';
$title = 'Backtest';
require_once __DIR__ . '/../includes/header.php';
?>
<style>main.container { max-width: none; padding: 0; } .page-header { padding: 24px 24px 0; }</style>

<div class="page-header">
    <h1>Backtest Lab</h1>
    <p class="subtitle">Simulate copy-trading strategies against collected whale trade data</p>
</div>

<div class="bt-layout">

    <!-- Config panel -->
    <div class="card bt-config">

        <!-- Tab bar -->
        <div class="bt-tabs">
            <button class="bt-tab active" data-tab="strategy" onclick="switchTab('strategy')">Strategy</button>
            <button class="bt-tab" data-tab="capital" onclick="switchTab('capital')">Capital</button>
            <button class="bt-tab" data-tab="filters" onclick="switchTab('filters')">Filters</button>
            <button class="bt-tab" data-tab="profiles" onclick="switchTab('profiles')">&#9733; Saved</button>
        </div>

        <!-- Active profile banner -->
        <div id="activeProfileBanner" style="display:none;padding:6px 16px 0;font-size:11px;color:var(--accent);">
            &#9733; <span id="activeProfileName"></span>
        </div>

        <!-- Tab: Strategy -->
        <div class="bt-tab-panel active" id="tab-strategy">
            <div class="strategy-cards" id="strategyCards">
                <div class="strategy-card active" data-strategy="NAIVE_COPY">
                    <div class="sc-name">Naive Copy</div>
                    <div class="sc-desc">Copy all trades above threshold</div>
                </div>
                <div class="strategy-card" data-strategy="LIQUIDITY_FILTER">
                    <div class="sc-name">Liquidity Filter</div>
                    <div class="sc-desc">Liquidity &gt;$50K + price 10–90%</div>
                </div>
                <div class="strategy-card" data-strategy="CONVICTION_WINDOW">
                    <div class="sc-name">Conviction Window</div>
                    <div class="sc-desc">Price 35–65% + resolves &lt;7d + ≥5 prior trades</div>
                </div>
                <div class="strategy-card" data-strategy="CATEGORY_SPECIALIST">
                    <div class="sc-name">Category Specialist</div>
                    <div class="sc-desc">Wallet win rate ≥55% in category</div>
                </div>
                <div class="strategy-card strategy-card-manual" data-strategy="MANUAL">
                    <div class="sc-name">Manual</div>
                    <div class="sc-desc">No preset — use only your filters below</div>
                </div>
                <div class="strategy-card strategy-card-topscore" data-strategy="TOP_SCORE">
                    <div class="sc-name">&#9733; Top Score</div>
                    <div class="sc-desc">Copy pre-period top performers — no whale filter</div>
                </div>
            </div>

            <!-- TOP_SCORE specific params (shown only when TOP_SCORE is active) -->
            <div id="topScorePanel" style="display:none;padding:10px 0 4px;border-top:1px solid var(--border);margin-top:10px">
                <div class="form-row">
                    <div class="form-group">
                        <label for="topScoreTopN">Top N wallets to copy</label>
                        <input type="number" id="topScoreTopN" class="form-input" value="20" min="1" max="200" step="5">
                    </div>
                    <div class="form-group">
                        <label for="topScoreMinResolved">Min trades (total)</label>
                        <input type="number" id="topScoreMinResolved" class="form-input" value="3" min="1" max="100">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="topScoreMinSuccessPct">Min success %</label>
                        <input type="number" id="topScoreMinSuccessPct" class="form-input" value="100" min="50" max="100" step="5">
                    </div>
                    <div class="form-group">
                        <label for="topScoreMinScore">Min score</label>
                        <input type="number" id="topScoreMinScore" class="form-input" value="55" min="0" max="100" step="5">
                    </div>
                </div>
                <small class="form-hint">Whale size filter is ignored — all binary trades from qualifying wallets are copied. "Min trades" counts all trades (same as the Trades column in Top Traders). Success % is based on resolved trades only.</small>
            </div>
        </div>

        <!-- Tab: Capital -->
        <div class="bt-tab-panel" id="tab-capital">
            <div class="form-row">
                <div class="form-group">
                    <label for="dateFrom">From</label>
                    <input type="date" id="dateFrom" class="form-input">
                </div>
                <div class="form-group">
                    <label for="dateTo">To</label>
                    <input type="date" id="dateTo" class="form-input">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="startCapital">Starting Capital ($)</label>
                    <input type="number" id="startCapital" class="form-input" value="10000" min="10" max="10000000">
                </div>
                <div class="form-group">
                    <label for="positionSizePct">Position Size (%)</label>
                    <input type="number" id="positionSizePct" class="form-input" value="5" min="0.1" max="100" step="0.5">
                </div>
            </div>
            <div class="form-group">
                <label for="maxPendingCount">Max Concurrent Positions (count)</label>
                <input type="number" id="maxPendingCount" class="form-input" value="0" min="0" step="1" placeholder="0 = unlimited">
            </div>

            <div class="form-group">
                <label>Max Capital at Risk <span id="maxLockedGaugeValue" class="gauge-value gauge-active">40%</span></label>
                <input type="range" id="maxLockedGauge" class="form-range" min="0" max="100" step="5" value="40" oninput="updateMaxLockedGauge(this.value)">
                <div class="gauge-track">
                    <span>0% (off)</span>
                    <span>100% (off)</span>
                </div>
                <small id="maxLockedGaugeHint" class="form-hint"></small>
            </div>
        </div>

        <!-- Tab: Filters -->
        <div class="bt-tab-panel" id="tab-filters">
            <div class="form-row">
                <div class="form-group">
                    <label for="minTradeUsd">Min Whale Trade ($)</label>
                    <input type="number" id="minTradeUsd" class="form-input" value="2000" min="0" step="500">
                </div>
                <div class="form-group">
                    <label for="categoryFilter">Category</label>
                    <select id="categoryFilter" class="form-input">
                        <option value="">All</option>
                        <option value="politics">Politics</option>
                        <option value="sports">Sports</option>
                        <option value="crypto">Crypto</option>
                        <option value="other">Other</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="marketLifetime">Market Max Lifetime</label>
                <select id="marketLifetime" class="form-input">
                    <option value="0">All durations</option>
                    <option value="24">&le; 24 hours</option>
                    <option value="48">&le; 2 days</option>
                    <option value="72">&le; 3 days</option>
                    <option value="168">&le; 7 days</option>
                    <option value="240">&le; 10 days</option>
                    <option value="336">&le; 14 days</option>
                </select>
            </div>

            <div class="form-group">
                <div class="entry-timing-header">
                    <label>Entry Timing</label>
                    <div class="entry-mode-pills">
                        <button class="entry-mode-pill active" data-mode="before">← Before</button>
                        <button class="entry-mode-pill" data-mode="after">After →</button>
                    </div>
                </div>
                <input type="range" id="entryGauge" class="form-range" min="0" max="100" step="0.5" value="0" oninput="updateGauge(this.value)">
                <div class="gauge-track">
                    <span>0% (open)</span>
                    <span id="entryGaugeValue" class="gauge-value">Off</span>
                    <span>100% (resolved)</span>
                </div>
                <small id="entryGaugeHint" class="form-hint"></small>
            </div>

            <div class="form-group">
                <label>Max Entry Price <span id="maxPriceValue" class="gauge-value">Off</span></label>
                <input type="range" id="maxPrice" class="form-range" min="0.50" max="1.00" step="0.01" value="1.00" oninput="updateMaxPrice(this.value)">
                <div class="gauge-track">
                    <span>50¢</span>
                    <span>100¢ (off)</span>
                </div>
                <small id="maxPriceHint" class="form-hint"></small>
            </div>

            <div class="form-group invert-toggle">
                <label class="invert-label">
                    <input type="checkbox" id="invertDirection">
                    <span class="invert-text">Invert Direction</span>
                </label>
                <small class="form-hint">Bet the opposite of each whale — YES→NO, NO→YES.</small>
            </div>
        </div>

        <!-- Profiles tab -->
        <div class="bt-tab-panel" id="tab-profiles">
            <div id="profilesList" class="profiles-list"></div>
        </div>

        <!-- Always-visible run button + save row -->
        <div class="bt-run-wrap">
            <button class="btn btn-primary btn-run" id="btnRun" onclick="runBacktest()">
                Run Backtest
            </button>
            <div class="bt-save-row">
                <input type="text" class="bt-save-input" id="profileName" placeholder="Profile name…" maxlength="40" onkeydown="if(event.key==='Enter')saveCurrentAsProfile()">
                <button class="btn btn-sm" onclick="saveCurrentAsProfile()">&#9733; Save</button>
            </div>
        </div>

    </div>

    <!-- Results panel -->
    <div class="bt-results" id="btResults" style="display:none">

        <!-- Scenario comparison -->
        <div class="bt-scenarios">
            <div class="scenario-card scenario-current">
                <div class="scenario-label">Current (resolved only)</div>
                <div class="scenario-return" id="scReturn">—</div>
                <div class="scenario-pnl" id="scPnl">—</div>
                <div class="scenario-wr" id="scWr">—</div>
            </div>
            <div class="scenario-card scenario-bear">
                <div class="scenario-label">Bear — all open fail</div>
                <div class="scenario-return" id="scBearReturn">—</div>
                <div class="scenario-pnl" id="scBearPnl">—</div>
                <div class="scenario-wr" id="scBearWr">—</div>
            </div>
            <div class="scenario-card scenario-bull">
                <div class="scenario-label">Bull — all open win</div>
                <div class="scenario-return" id="scBullReturn">—</div>
                <div class="scenario-pnl" id="scBullPnl">—</div>
                <div class="scenario-wr" id="scBullWr">—</div>
            </div>
        </div>

        <!-- Metrics -->
        <div class="stats-bar" id="btMetrics">
            <div class="stat-card">
                <div class="stat-value" id="mBalance">—</div>
                <div class="stat-label">Balance</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="mPnl">—</div>
                <div class="stat-label">Net P&amp;L</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="mReturn">—</div>
                <div class="stat-label">Total Return</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="mLocked">—</div>
                <div class="stat-label">Pending</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="mWinRate">—</div>
                <div class="stat-label">Win Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="mSharpe">—</div>
                <div class="stat-label">Sharpe Ratio</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="mDrawdown">—</div>
                <div class="stat-label">Max Drawdown</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="mTrades">—</div>
                <div class="stat-label">Trades</div>
            </div>
        </div>

        <!-- Equity curve -->
        <div class="card">
            <div class="card-header">
                <h2>Equity Curve</h2>
                <span id="btStrategyLabel" class="text-muted"></span>
            </div>
            <div class="chart-wrap">
                <canvas id="equityChart"></canvas>
                <div id="chartEmpty" class="chart-empty" style="display:none">Not enough resolved trades to draw curve</div>
            </div>
        </div>

        <!-- Trade log -->
        <div class="card">
            <div class="card-header">
                <h2>Trade Log</h2>
                <button class="btn btn-sm" onclick="exportCSV()">Export CSV</button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Trader</th>
                            <th>Market</th>
                            <th>Category</th>
                            <th>Whale Bet</th>
                            <th>Price</th>
                            <th>Whale $</th>
                            <th>Our Size</th>
                            <th>Duration</th>
                            <th>Elapsed %</th>
                            <th>P&amp;L</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="tradeLogBody"></tbody>
                </table>
            </div>
        </div>

        <!-- TOP_SCORE: Qualifying traders (shown only for TOP_SCORE runs) -->
        <div id="qualifyingWalletsSection" class="card" style="display:none">
            <div class="card-header">
                <h2>&#9733; Copied Traders</h2>
                <span class="text-muted" style="font-size:12px">Qualified before start date</span>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Wallet</th>
                            <th>Pre-period (W/R)</th>
                            <th>Success %</th>
                        </tr>
                    </thead>
                    <tbody id="qualifyingWalletsBody"></tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- Loading overlay -->
<div id="btLoading" class="bt-loading" style="display:none">
    <div class="bt-spinner"></div>
    <div>Running backtest &amp; fetching resolutions...</div>
</div>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
