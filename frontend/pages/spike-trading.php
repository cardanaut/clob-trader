<?php
$page  = 'spike-trading';
$title = 'SpikeTrading';
require_once __DIR__ . '/../includes/header.php';
?>

<div class="page-header">
    <h1>SpikeTrading <span class="badge badge-paper" id="modeBadge">LOADING...</span></h1>
    <p class="subtitle">Multi-Crypto Momentum Detection — Automated Trading</p>
</div>

<!-- Tab Navigation -->
<div class="tab-container">
    <div class="tab-nav">
        <button class="tab-btn active" data-tab="trading">📊 Live Trading</button>
        <button class="tab-btn" data-tab="backtest">🧪 Backtest</button>
        <button class="tab-btn" data-tab="settings">⚙️ Settings</button>
    </div>

    <!-- Tab Content: Trading -->
    <div class="tab-content active" id="tab-trading">

        <!-- All Stats in One Row -->
        <div class="status-row-all">
            <div class="status-card status-card-primary">
                <div class="status-icon">💰</div>
                <div class="status-info">
                    <div class="status-label">Available</div>
                    <div class="status-value text-green" id="balanceAvailable">-</div>
                </div>
            </div>

            <div class="status-card status-card-primary">
                <div class="status-icon">🔒</div>
                <div class="status-info">
                    <div class="status-label">In Positions</div>
                    <div class="status-value text-orange" id="balanceLocked">-</div>
                </div>
            </div>

            <div class="status-card" id="unredeemedCard" style="display: none;">
                <div class="status-icon" id="unredeemedIcon">💎</div>
                <div class="status-info">
                    <div class="status-label">Unredeemed</div>
                    <div class="status-value" id="balanceUnredeemed">-</div>
                </div>
            </div>

            <div class="status-card">
                <div class="status-info">
                    <div class="status-label">Open Trades</div>
                    <div class="status-value text-blue" id="balancePositions">-</div>
                </div>
            </div>

            <div class="status-card" id="capitalMetric">
                <div class="status-icon">💼</div>
                <div class="status-info">
                    <div class="status-label">Capital</div>
                    <div class="status-value" id="currentCapital">-</div>
                </div>
            </div>

            <div class="status-card">
                <div class="status-info">
                    <div class="status-label">Total Trades</div>
                    <div class="status-value" id="totalTrades">-</div>
                </div>
            </div>

            <div class="status-card">
                <div class="status-info">
                    <div class="status-label">Win Rate</div>
                    <div class="status-value" id="winRate">-</div>
                </div>
            </div>

            <div class="status-card">
                <div class="status-info">
                    <div class="status-label">EV per Trade</div>
                    <div class="status-value" id="evPerTrade">-</div>
                </div>
            </div>
        </div>

        <!-- Live Market Watch - Full Width -->
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px;">
                <!-- XRP Price -->
                <div style="flex: 1;">
                    <div style="font-size: 0.75rem; opacity: 0.6; margin-bottom: 4px;">
                        <a id="marketLink" href="#" target="_blank" style="color: inherit; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                            XRP PRICE <span style="opacity: 0.5;">↗</span>
                        </a>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <div style="color: #999; font-size: 1.1rem;" id="marketOpenPrice">-</div>
                        <div style="color: #666; font-size: 1.2rem;">→</div>
                        <div style="font-size: 1.1rem; font-weight: 600;" id="currentPrice">-</div>
                    </div>
                </div>

                <!-- Market Odds -->
                <div style="flex: 1; display: flex; gap: 16px;">
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 0.75rem; opacity: 0.6; margin-bottom: 4px;">UP</div>
                        <div class="text-green" id="marketUpPrice" style="font-size: 1.5rem; font-weight: 600;">-</div>
                    </div>
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 0.75rem; opacity: 0.6; margin-bottom: 4px;">DOWN</div>
                        <div class="text-red" id="marketDownPrice" style="font-size: 1.5rem; font-weight: 600;">-</div>
                    </div>
                </div>

                <!-- Volume -->
                <div style="flex: 1; text-align: center;">
                    <div style="font-size: 0.75rem; opacity: 0.6; margin-bottom: 4px;">VOLUME</div>
                    <div class="text-orange" id="marketVolume" style="font-size: 1.5rem; font-weight: 600;">-</div>
                </div>

                <!-- Cycle Info -->
                <div style="flex: 1; text-align: center;">
                    <div style="font-size: 0.75rem; opacity: 0.6; margin-bottom: 4px;">CYCLE</div>
                    <div class="text-blue" id="cyclePosition" style="font-size: 1.5rem; font-weight: 600;">-</div>
                </div>

                <!-- Countdown Timer -->
                <div style="flex: 1; text-align: center;">
                    <div style="font-size: 0.75rem; opacity: 0.6; margin-bottom: 4px;">TIME LEFT</div>
                    <div id="countdownTimer" style="font-size: 1.5rem; font-weight: 600; color: #10b981;">-</div>
                </div>
            </div>
        </div>

        <!-- Price Analytics - Collapsible Panel -->
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; margin-bottom: 20px; overflow: hidden;">
            <div onclick="togglePriceAnalytics()" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="font-size: 0.875rem; font-weight: 600; opacity: 0.8;">📊 PRICE ANALYTICS (T1/T2/T3)</div>
                    <label onclick="event.stopPropagation();" style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; opacity: 0.7; cursor: pointer; user-select: none;">
                        <input type="checkbox" id="currentMarketMode" onchange="toggleCurrentMarketMode()" style="cursor: pointer;">
                        <span>Current Market</span>
                    </label>
                </div>
                <div id="priceAnalyticsToggle" style="font-size: 1rem; opacity: 0.6; transition: transform 0.2s;">▼</div>
            </div>
            <div id="priceAnalyticsPanel" style="display: none; padding: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                    <!-- T1 Stats -->
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 600; opacity: 0.6; margin-bottom: 12px; text-align: center;">T1 MINUTE</div>
                        <div style="background: rgba(255,255,255,0.02); border-radius: 6px; padding: 12px;">
                            <div style="margin-bottom: 8px;">
                                <div style="font-size: 0.7rem; opacity: 0.5; margin-bottom: 4px;">UP Price</div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                                    <span>Avg: <span id="t1-up-avg" class="text-green">-</span></span>
                                    <span>Min: <span id="t1-up-min">-</span></span>
                                    <span>Max: <span id="t1-up-max">-</span></span>
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; opacity: 0.5; margin-bottom: 4px;">DOWN Price</div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                                    <span>Avg: <span id="t1-down-avg" class="text-red">-</span></span>
                                    <span>Min: <span id="t1-down-min">-</span></span>
                                    <span>Max: <span id="t1-down-max">-</span></span>
                                </div>
                            </div>
                            <div style="font-size: 0.65rem; opacity: 0.4; margin-top: 8px; text-align: center;">
                                Samples: <span id="t1-samples">0</span>/1000
                            </div>
                        </div>
                    </div>

                    <!-- T2 Stats -->
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 600; opacity: 0.6; margin-bottom: 12px; text-align: center;">T2 MINUTE</div>
                        <div style="background: rgba(255,255,255,0.02); border-radius: 6px; padding: 12px;">
                            <div style="margin-bottom: 8px;">
                                <div style="font-size: 0.7rem; opacity: 0.5; margin-bottom: 4px;">UP Price</div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                                    <span>Avg: <span id="t2-up-avg" class="text-green">-</span></span>
                                    <span>Min: <span id="t2-up-min">-</span></span>
                                    <span>Max: <span id="t2-up-max">-</span></span>
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; opacity: 0.5; margin-bottom: 4px;">DOWN Price</div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                                    <span>Avg: <span id="t2-down-avg" class="text-red">-</span></span>
                                    <span>Min: <span id="t2-down-min">-</span></span>
                                    <span>Max: <span id="t2-down-max">-</span></span>
                                </div>
                            </div>
                            <div style="font-size: 0.65rem; opacity: 0.4; margin-top: 8px; text-align: center;">
                                Samples: <span id="t2-samples">0</span>/1000
                            </div>
                        </div>
                    </div>

                    <!-- T3 Stats -->
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 600; opacity: 0.6; margin-bottom: 12px; text-align: center;">T3 MINUTE</div>
                        <div style="background: rgba(255,255,255,0.02); border-radius: 6px; padding: 12px;">
                            <div style="margin-bottom: 8px;">
                                <div style="font-size: 0.7rem; opacity: 0.5; margin-bottom: 4px;">UP Price</div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                                    <span>Avg: <span id="t3-up-avg" class="text-green">-</span></span>
                                    <span>Min: <span id="t3-up-min">-</span></span>
                                    <span>Max: <span id="t3-up-max">-</span></span>
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; opacity: 0.5; margin-bottom: 4px;">DOWN Price</div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                                    <span>Avg: <span id="t3-down-avg" class="text-red">-</span></span>
                                    <span>Min: <span id="t3-down-min">-</span></span>
                                    <span>Max: <span id="t3-down-max">-</span></span>
                                </div>
                            </div>
                            <div style="font-size: 0.65rem; opacity: 0.4; margin-top: 8px; text-align: center;">
                                Samples: <span id="t3-samples">0</span>/1000
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Tabs Container -->
        <div class="spike-tabs-container">
            <div class="spike-tabs-header">
                <button class="spike-tab-btn active" data-tab="recent-trades" onclick="switchSpikeTab('recent-trades')">
                    📋 Recent Trades <span class="tab-count" id="recentTradesCount">0</span>
                </button>
                <button class="spike-tab-btn" data-tab="positions" onclick="switchSpikeTab('positions')">
                    📍 Positions <span class="tab-count" id="positionsCount">0</span>
                </button>
                <button class="spike-tab-btn" data-tab="missed-opportunities" onclick="switchSpikeTab('missed-opportunities')">
                    ⚠️ Missed Opportunities <span class="tab-count" id="missedCount">0</span>
                </button>
                <button class="spike-tab-btn" data-tab="activity-log" onclick="switchSpikeTab('activity-log')">
                    📝 Activity Log
                </button>
            </div>

            <!-- Tab: Recent Trades -->
            <div class="spike-tab-panel active" id="spike-tab-recent-trades">
                <div class="spike-tab-header">
                    <button class="btn btn-sm" onclick="loadRecentTrades()">↻ Refresh</button>
                </div>

                <!-- Recent Trades Stats -->
                <div id="recentTradesStats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; padding: 16px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px;">
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Total Trades</div>
                        <div id="tradesStatsTotal" style="font-size: 24px; font-weight: 700; color: var(--text-primary);">-</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Wins</div>
                        <div id="tradesStatsWins" style="font-size: 24px; font-weight: 700; color: var(--accent-green);">-</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Losses</div>
                        <div id="tradesStatsLosses" style="font-size: 24px; font-weight: 700; color: var(--accent-red);">-</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Win Rate</div>
                        <div id="tradesStatsWinRate" style="font-size: 24px; font-weight: 700; color: var(--accent-blue);">-</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Pending</div>
                        <div id="tradesStatsPending" style="font-size: 24px; font-weight: 700; color: var(--text-secondary);">-</div>
                    </div>
                </div>

                <div class="table-wrap">
                    <table class="data-table" id="recentTradesTable">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Crypto</th>
                                <th>Market</th>
                                <th>Link</th>
                                <th>Signal</th>
                                <th title="Signal minute within 5-min cycle">Min</th>
                                <th title="Candle movement % that triggered signal">Move %</th>
                                <th>Entry</th>
                                <th>Size</th>
                                <th>Result</th>
                                <th>P&L</th>
                            </tr>
                        </thead>
                        <tbody id="recentTradesBody">
                            <tr><td colspan="11" class="loading">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Tab: Positions -->
            <div class="spike-tab-panel" id="spike-tab-positions">
                <div class="spike-tab-header">
                    <button class="btn btn-sm" onclick="loadPositions()">↻ Refresh</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table" id="positionsTable">
                        <thead>
                            <tr>
                                <th>Opened</th>
                                <th>Crypto</th>
                                <th>Market</th>
                                <th>Signal</th>
                                <th>Entry</th>
                                <th>Size</th>
                                <th>Duration</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="positionsBody">
                            <tr><td colspan="8" class="loading">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Tab: Missed Opportunities -->
            <div class="spike-tab-panel" id="spike-tab-missed-opportunities">
                <div class="spike-tab-header">
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-sm" onclick="loadMissedOpportunities()">↻ Refresh</button>
                        <button class="btn btn-sm btn-danger" onclick="clearMissedOpportunities()">✕ Clear</button>
                    </div>
                </div>

                <!-- Missed Opportunities Stats -->
                <div id="missedOpportunitiesStats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; padding: 16px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px;">
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Total Missed</div>
                        <div id="missedStatsTotal" style="font-size: 24px; font-weight: 700; color: var(--text-primary);">-</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Correct Signals</div>
                        <div id="missedStatsWins" style="font-size: 24px; font-weight: 700; color: var(--accent-green);">-</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Wrong Signals</div>
                        <div id="missedStatsLosses" style="font-size: 24px; font-weight: 700; color: var(--accent-red);">-</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Accuracy</div>
                        <div id="missedStatsWinRate" style="font-size: 24px; font-weight: 700; color: var(--accent-blue);">-</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Unresolved</div>
                        <div id="missedStatsPending" style="font-size: 24px; font-weight: 700; color: var(--text-secondary);">-</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Void (Begin/End)</div>
                        <div id="missedStatsVoid" style="font-size: 24px; font-weight: 700; color: #6b7280;">-</div>
                    </div>
                </div>

                <div class="table-wrap">
                    <table class="data-table" id="missedOpportunitiesTable">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Crypto</th>
                                <th>Market</th>
                                <th>Signal</th>
                                <th>Cycle</th>
                                <th>Movement</th>
                                <th>Est. PNL</th>
                                <th>Reason</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody id="missedOpportunitiesBody">
                            <tr><td colspan="9" class="loading">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Tab: Activity Log -->
            <div class="spike-tab-panel" id="spike-tab-activity-log">
                <div class="spike-tab-header">
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-sm" onclick="loadActivityLog()">↻ Refresh</button>
                        <button class="btn btn-sm btn-danger" onclick="clearActivityLog()">✕ Clear</button>
                    </div>
                </div>
                <div class="table-wrap">
                    <table class="data-table" id="activityLogTable">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Event</th>
                                <th>Crypto</th>
                                <th>Message</th>
                            </tr>
                        </thead>
                        <tbody id="activityLogBody">
                            <tr><td colspan="4" class="loading">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <!-- Tab Content: Backtest -->
    <div class="tab-content" id="tab-backtest">

        <div class="section-header">
            <h3>🧪 Strategy Backtest</h3>
            <p>Test against historical Binance data (10,000 candles ≈ 7 days)</p>
        </div>

        <!-- Backtest Configuration -->
        <div class="backtest-config">
            <div class="config-group">
                <label class="config-label">Strategy:</label>
                <select id="backtestStrategy" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--card-bg); color: #000000; font-size: 14px; cursor: pointer;">
                    <optgroup label="5-Minute Markets - Revenue Optimization" style="color: #000000;">
                        <option value="T123-1MIN-020" style="color: #000000;">T123 - 0.20%</option>
                        <option value="T123-1MIN-021" style="color: #000000;">T123 - 0.21%</option>
                        <option value="T123-1MIN-022" style="color: #000000;">T123 - 0.22%</option>
                        <option value="T123-1MIN-023" style="color: #000000;">T123 - 0.23%</option>
                        <option value="T123-1MIN-024" selected style="color: #000000;">T123 - 0.24%</option>
                        <option value="T123-1MIN-025" style="color: #000000;">T123 - 0.25%</option>
                        <option value="T123-1MIN-026" style="color: #000000;">T123 - 0.26%</option>
                    </optgroup>
                    <optgroup label="5-Minute Markets - FUSION (Test Revenue Optimization)" style="color: #000000;">
                        <option value="T123-FUSION-020" style="color: #000000;">T123-FUSION - 0.20%</option>
                        <option value="T123-FUSION-021" style="color: #000000;">T123-FUSION - 0.21%</option>
                        <option value="T123-FUSION-022" style="color: #000000;">T123-FUSION - 0.22%</option>
                        <option value="T123-FUSION-023" style="color: #000000;">T123-FUSION - 0.23%</option>
                        <option value="T123-FUSION-024" style="color: #000000;">T123-FUSION - 0.24%</option>
                        <option value="T123-FUSION-025" style="color: #000000;">T123-FUSION - 0.25%</option>
                        <option value="T123-FUSION-026" style="color: #000000;">T123-FUSION - 0.26%</option>
                    </optgroup>
                    <optgroup label="15-Minute Markets - Recommended" style="color: #000000;">
                        <option value="T369-3MIN-059" style="color: #000000;">T369 - 0.59% ⭐ (88.6% win rate)</option>
                    </optgroup>
                    <optgroup label="15-Minute Markets - Fine-Tune" style="color: #000000;">
                        <option value="T369-3MIN-056" style="color: #000000;">T369 - 0.56%</option>
                        <option value="T369-3MIN-057" style="color: #000000;">T369 - 0.57%</option>
                        <option value="T369-3MIN-058" style="color: #000000;">T369 - 0.58%</option>
                        <option value="T369-3MIN-060" style="color: #000000;">T369 - 0.60%</option>
                        <option value="T369-3MIN-061" style="color: #000000;">T369 - 0.61%</option>
                        <option value="T369-3MIN-062" style="color: #000000;">T369 - 0.62%</option>
                        <option value="T369-3MIN-063" style="color: #000000;">T369 - 0.63%</option>
                    </optgroup>
                </select>
            </div>

            <div class="config-group">
                <label class="config-label">Select Cryptos to Test:</label>
                <div class="checkbox-grid">
                    <label class="checkbox-item">
                        <input type="checkbox" id="backtest_BTC" value="BTC" checked>
                        <span>₿ Bitcoin</span>
                    </label>
                    <label class="checkbox-item">
                        <input type="checkbox" id="backtest_ETH" value="ETH" checked>
                        <span>Ξ Ethereum</span>
                    </label>
                    <label class="checkbox-item">
                        <input type="checkbox" id="backtest_SOL" value="SOL" checked>
                        <span>◎ Solana</span>
                    </label>
                    <label class="checkbox-item">
                        <input type="checkbox" id="backtest_XRP" value="XRP" checked>
                        <span>✕ XRP</span>
                    </label>
                </div>
            </div>

            <button id="backtestBtn" class="btn-gradient">
                <span id="backtestBtnText">Run Backtest</span>
                <span id="backtestLoader" class="spinner" style="display:none;"></span>
            </button>
        </div>

        <!-- Backtest Results -->
        <div id="backtestResults" class="backtest-results" style="display:none;"></div>

        <!-- Backtest Info -->
        <div class="info-box info" style="margin-top: 24px;">
            <div class="info-icon">ℹ️</div>
            <div class="info-content">
                <strong>About Backtesting:</strong>
                <ul style="margin: 8px 0 0 20px; font-size: 13px; line-height: 1.6;">
                    <li>Fetches real historical 1-minute candles from Binance</li>
                    <li>Simulates 5-minute cycles with momentum detection (uses your configured thresholds per crypto)</li>
                    <li>Tests signal quality without capital management constraints</li>
                    <li>Shows win rate, EV, and per-minute breakdown</li>
                </ul>
            </div>
        </div>
    </div>

    <!-- Tab Content: Settings -->
    <div class="tab-content" id="tab-settings">

        <div class="section-header">
            <h3>⚙️ Configuration</h3>
            <p>Manage trading settings and mode</p>
        </div>

        <!-- Live Mode Instructions -->
        <div class="info-box warning">
            <div class="info-icon">⚠️</div>
            <div class="info-content">
                <strong>Enable LIVE Trading:</strong>
                <ol style="margin: 8px 0 0 20px; font-size: 13px; line-height: 1.6;">
                    <li>Set <code>SPIKE_TRADING_MODE=LIVE</code> in backend/.env</li>
                    <li>Configure Polymarket credentials (<code>SPIKE_PRIVATE_KEY</code>)</li>
                    <li>Restart both services:
                        <ul style="margin-top: 4px;">
                            <li><code>pm2 restart polychamp-spike</code> (trading bot)</li>
                            <li><code>pm2 restart polychamp-api</code> (API server)</li>
                        </ul>
                    </li>
                </ol>
                <p style="margin-top: 12px; font-size: 13px; padding: 8px; background: rgba(239, 68, 68, 0.1); border-radius: 4px;">
                    <strong>⚠️ WARNING:</strong> LIVE mode uses REAL money on Polymarket. You can lose 100% of your capital.
                    Test thoroughly in PAPER mode first! See <code>LIVE_TRADING_SETUP.md</code> for full documentation.
                </p>
            </div>
        </div>

        <!-- Position Size Configuration -->
        <div class="section-header" style="margin-top: 24px;">
            <h3>💰 Position Size</h3>
            <p>Configure trade size as percentage of capital</p>
        </div>

        <div style="max-width: 600px;">
            <div class="setting-row">
                <label for="positionSizePct">Position Size (% of Capital):</label>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="number" id="positionSizePct" min="1" max="20" step="0.5" value="5" style="width: 80px; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary);">
                    <span class="setting-help">Default: 5% (Range: 1-20%)</span>
                </div>
            </div>

            <div class="setting-row">
                <label>Minimum Trade Size:</label>
                <div>
                    <span class="setting-value">$1.00</span>
                    <span class="setting-help">(Polymarket minimum, not configurable)</span>
                </div>
            </div>

            <div class="setting-row">
                <label for="maxEntryPrice">Max Entry Price (Polymarket):</label>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="number" id="maxEntryPrice" min="0.01" max="0.99" step="0.01" value="0.75" style="width: 80px; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary);">
                    <span class="setting-help">Default: 0.75 (75¢) - Don't buy if price above this</span>
                </div>
            </div>

            <div class="setting-row">
                <label for="maxCapitalRisk">Max Capital Risk (%):</label>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="number" id="maxCapitalRisk" min="1" max="100" step="1" value="50" style="width: 80px; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary);">
                    <span class="setting-help">Default: 50% - Maximum % of capital to risk across all open positions</span>
                </div>
            </div>

            <div class="setting-row">
                <label for="detectionStrategy">Detection Strategy:</label>
                <div style="display: flex; gap: 10px; align-items: flex-start; flex-direction: column;">
                    <select id="detectionStrategy" style="width: 300px; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary);">
                        <option value="T123-1MIN">Loading...</option>
                    </select>
                    <div id="strategyDescription" style="font-size: 13px; color: var(--text-secondary); max-width: 500px;">
                        Select a strategy to see details
                    </div>
                </div>
            </div>

            <button class="btn btn-primary" onclick="savePositionSizeConfig()" id="savePositionSizeBtn" style="margin-top: 12px;">
                💾 Save Configuration
            </button>
        </div>

        <!-- Crypto Configuration -->
        <div class="section-header" style="margin-top: 24px;">
            <h3>🪙 Crypto Configuration (Live Trading)</h3>
            <p>Enable cryptos and set momentum threshold ranges for live trading</p>
        </div>

        <div class="info-box info" style="margin-bottom: 20px;">
            <div class="info-icon">💡</div>
            <div class="info-content">
                <strong>Range-Based Trading:</strong> Only trade when candle movement is <strong>between</strong> min and max thresholds.
                <br>Example: Min 0.15% + Max 0.30% = only trade when movement is ≥ 0.15% AND ≤ 0.30%
            </div>
        </div>

        <div id="cryptoConfigGrid" class="crypto-grid">
            <p class="loading">Loading...</p>
        </div>

        <button id="saveCryptoConfigBtn" class="btn-primary" style="margin-top: 12px; display: none;">
            <span id="saveBtnText">Save Configuration</span>
            <span id="saveLoader" class="spinner" style="display:none;"></span>
        </button>
        <div id="saveMessage" class="message" style="margin-top: 8px; display: none;"></div>

        <!-- Backtest Configuration -->
        <div class="section-header" style="margin-top: 32px;">
            <h3>🧪 Backtest Range Settings</h3>
            <p>Test specific movement ranges (separate from live trading thresholds)</p>
        </div>

        <div class="info-box info" style="margin-bottom: 20px;">
            <div class="info-icon">💡</div>
            <div class="info-content">
                <strong>Range-Based Testing:</strong> Only trade when candle movement is <strong>between</strong> min and max thresholds.
                <br>Example: Min 0.15% + Max 0.20% = only trade when movement is ≥ 0.15% AND ≤ 0.20%
            </div>
        </div>

        <div id="backtestConfigGrid" class="crypto-grid">
            <p class="loading">Loading...</p>
        </div>

        <button id="saveBacktestConfigBtn" class="btn-primary" style="margin-top: 12px; display: none;">
            <span id="saveBacktestBtnText">Save Backtest Settings</span>
            <span id="saveBacktestLoader" class="spinner" style="display:none;"></span>
        </button>
        <div id="saveBacktestMessage" class="message" style="margin-top: 8px; display: none;"></div>

    </div>
</div>

<style>
/* Modern Dark Theme */
:root {
    --bg-primary: #1a1d23;
    --bg-secondary: #22262e;
    --bg-tertiary: #2a2f38;
    --border-color: #3a3f4a;
    --text-primary: #e8eaed;
    --text-secondary: #9aa0a6;
    --accent-blue: #4a9eff;
    --accent-green: #10b981;
    --accent-orange: #f59e0b;
    --accent-red: #ef4444;
}

/* Tab Container */
.tab-container {
    background: var(--bg-secondary);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border-color);
}

.tab-nav {
    display: flex;
    gap: 0;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
}

.tab-btn {
    flex: 1;
    padding: 16px 24px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    border-bottom: 3px solid transparent;
}

.tab-btn:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
}

.tab-btn.active {
    color: var(--accent-blue);
    border-bottom-color: var(--accent-blue);
    background: var(--bg-secondary);
}

.tab-content {
    display: none;
    padding: 24px;
}

.tab-content.active {
    display: block;
}

/* All Stats in One Row */
.status-row-all {
    display: flex;
    gap: 10px;
    margin-bottom: 24px;
    width: 100%;
}

.status-card {
    flex: 1;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-width: 0;
}

.status-card-primary {
    border-width: 2px;
}

.status-card-warning {
    border: 2px solid #ef4444;
    background: rgba(239, 68, 68, 0.1);
    animation: pulse-warning 2s ease-in-out infinite;
}

@keyframes pulse-warning {
    0%, 100% {
        border-color: #ef4444;
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
    }
    50% {
        border-color: #dc2626;
        box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
    }
}

.status-icon {
    font-size: 28px;
    line-height: 1;
    flex-shrink: 0;
}

.status-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.status-label {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    line-height: 1.2;
}

.status-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
}

/* Spike Tabs Container */
.spike-tabs-container {
    background: var(--bg-secondary);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border-color);
    margin-top: 24px;
}

.spike-tabs-header {
    display: flex;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
}

.spike-tab-btn {
    flex: 1;
    padding: 14px 20px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border-bottom: 3px solid transparent;
}

.spike-tab-btn:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
}

.spike-tab-btn.active {
    color: var(--accent-blue);
    border-bottom-color: var(--accent-blue);
    background: var(--bg-secondary);
}

.spike-tab-panel {
    display: none;
    padding: 20px;
}

.spike-tab-panel.active {
    display: block;
}

.spike-tab-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.tab-count {
    display: inline-block;
    background: var(--bg-tertiary);
    color: var(--accent-blue);
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 12px;
    margin-left: 6px;
}

/* Settings Tab */
.setting-row {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 20px;
    margin-bottom: 20px;
    padding: 16px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    align-items: center;
}

.setting-row label {
    font-weight: 600;
    color: var(--text-primary);
}

.setting-help {
    font-size: 12px;
    color: var(--text-secondary);
}

.setting-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--accent-blue);
}

.setting-info {
    margin-top: 30px;
    padding: 16px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid var(--accent-blue);
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.6;
}

.setting-info code {
    background: var(--bg-secondary);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    color: var(--accent-blue);
}

/* Metrics Compact */
.metrics-compact {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
}

.metric-box {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
}

.metric-label {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    margin-bottom: 6px;
}

.metric-value {
    font-size: 22px;
    font-weight: 700;
    color: var(--text-primary);
}

.metric-sub {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 2px;
}

/* Section Headers */
.section-header {
    margin-bottom: 16px;
}

.section-header h3 {
    font-size: 18px;
    color: var(--text-primary);
    margin: 0 0 4px 0;
}

.section-header p {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
}

/* Crypto Grid */
.crypto-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin-bottom: 12px;
}

.crypto-item {
    background: var(--bg-tertiary);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    padding: 16px;
    transition: all 0.3s ease;
}

.crypto-item.enabled {
    border-color: var(--accent-green);
    background: rgba(16, 185, 129, 0.05);
}

.crypto-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}

.crypto-icon {
    font-size: 24px;
}

.crypto-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
}

.crypto-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}

.crypto-toggle input {
    width: 18px;
    height: 18px;
    cursor: pointer;
}

.crypto-toggle label {
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
}

.crypto-threshold label {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: 6px;
}

.crypto-threshold input {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
}

.crypto-threshold input:focus {
    outline: none;
    border-color: var(--accent-blue);
}

/* Compact Table */
.table-container {
    overflow-x: auto;
    border-radius: 8px;
    border: 1px solid var(--border-color);
}

.compact-table {
    width: 100%;
    border-collapse: collapse;
}

.compact-table th {
    background: var(--bg-primary);
    padding: 10px 12px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-color);
}

.compact-table td {
    padding: 10px 12px;
    font-size: 13px;
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-color);
}

.compact-table tbody tr:hover {
    background: var(--bg-tertiary);
}

/* Backtest Config */
.backtest-config {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
}

.config-group {
    margin-bottom: 16px;
}

.config-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 10px;
}

.checkbox-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
}

.checkbox-item {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 8px;
    border-radius: 6px;
    transition: background 0.2s;
}

.checkbox-item:hover {
    background: var(--bg-secondary);
}

.checkbox-item input {
    width: 16px;
    height: 16px;
}

.checkbox-item span {
    font-size: 14px;
    color: var(--text-primary);
}

/* Buttons */
.btn-primary, .btn-gradient {
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s ease;
}

.btn-primary {
    background: var(--accent-green);
    color: white;
}

.btn-primary:hover {
    background: #0e9f6e;
    transform: translateY(-1px);
}

.btn-gradient {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-gradient:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
}

/* Info Boxes */
.info-box {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-radius: 8px;
    border-left: 4px solid;
}

.info-box.warning {
    background: rgba(245, 158, 11, 0.1);
    border-left-color: var(--accent-orange);
}

.info-box.info {
    background: rgba(74, 158, 255, 0.1);
    border-left-color: var(--accent-blue);
}

.info-icon {
    font-size: 24px;
}

.info-content {
    flex: 1;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
}

.info-content strong {
    color: var(--text-primary);
}

.info-content code {
    background: var(--bg-primary);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
}

/* Backtest Results */
.backtest-results {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 20px;
}

.backtest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 12px;
    margin: 16px 0;
}

.backtest-metric {
    background: var(--bg-secondary);
    padding: 12px;
    border-radius: 6px;
    text-align: center;
}

.backtest-metric-label {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    margin-bottom: 6px;
}

.backtest-metric-value {
    font-size: 20px;
    font-weight: 700;
}

.backtest-metric-value.positive { color: var(--accent-green); }
.backtest-metric-value.negative { color: var(--accent-red); }
.backtest-metric-value.neutral { color: var(--text-primary); }

.verdict-box {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%);
    border-left: 4px solid var(--accent-orange);
    padding: 16px;
    border-radius: 6px;
    margin-top: 16px;
}

.verdict-box.success {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%);
    border-left-color: var(--accent-green);
}

.verdict-box.danger {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%);
    border-left-color: var(--accent-red);
}

.minute-breakdown {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 16px 0;
}

.minute-card {
    background: var(--bg-secondary);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    padding: 14px;
    text-align: center;
}

.minute-card-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
}

.minute-card-winrate {
    font-size: 22px;
    font-weight: 700;
    margin: 8px 0;
}

.crypto-backtest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
}

.crypto-backtest-card {
    background: var(--bg-secondary);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    padding: 14px;
}

/* Utility Classes */
.text-green { color: var(--accent-green); }
.text-orange { color: var(--accent-orange); }
.text-blue { color: var(--accent-blue); }
.text-red { color: var(--accent-red); }

.spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.loading {
    text-align: center;
    padding: 20px;
    color: var(--text-secondary);
}

.message {
    font-size: 14px;
    font-weight: 600;
}

.message.success { color: var(--accent-green); }
.message.error { color: var(--accent-red); }

.badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    margin-left: 8px;
}

.badge-paper {
    background: var(--accent-green);
    color: white;
}

.badge-live {
    background: var(--accent-red);
    color: white;
}

.badge-success { background: rgba(16, 185, 129, 0.2); color: var(--accent-green); }
.badge-danger { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); }
.badge-warning { background: rgba(245, 158, 11, 0.2); color: var(--accent-orange); }
</style>

<script>
const API_BASE = '/api';
let CURRENT_TRADING_MODE = 'PAPER'; // Global trading mode

// Auth helper — adds Authorization header for non-GET requests
function authHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (typeof _API_AUTH !== 'undefined' && _API_AUTH) h['Authorization'] = _API_AUTH;
  return h;
}

// Crypto mappings
const CRYPTO_ICONS = { 'BTC': '₿', 'ETH': 'Ξ', 'SOL': '◎', 'XRP': '✕' };
const CRYPTO_NAMES = { 'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'SOL': 'Solana', 'XRP': 'XRP' };

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');

        // Save main tab state to localStorage
        localStorage.setItem('spikeMainTab', tab);
    });
});

// Load trading mode
async function loadTradingMode() {
    try {
        const res = await fetch(`${API_BASE}/spike-trading-mode`);
        if (!res.ok) throw new Error('Failed to load trading mode');

        const data = await res.json();
        const mode = data.mode || 'PAPER';
        CURRENT_TRADING_MODE = mode; // Store globally

        const badge = document.getElementById('modeBadge');
        const capitalMetric = document.getElementById('capitalMetric');

        if (mode === 'LIVE') {
            badge.textContent = 'LIVE MODE';
            badge.className = 'badge badge-live';
            // Hide Capital metric in LIVE mode (use balance panel instead)
            if (capitalMetric) capitalMetric.style.display = 'none';
        } else {
            badge.textContent = 'PAPER MODE';
            badge.className = 'badge badge-paper';
            // Show Capital metric in PAPER mode
            if (capitalMetric) capitalMetric.style.display = 'block';
        }
    } catch (err) {
        console.error('Error loading trading mode:', err);
    }
}

// Load balance
async function loadBalance() {
    try {
        const res = await fetch(`${API_BASE}/spike-balance`);
        if (!res.ok) throw new Error('Failed to load balance');

        const data = await res.json();
        document.getElementById('balanceAvailable').textContent = '$' + data.available.toFixed(2);
        document.getElementById('balanceLocked').textContent = '$' + data.locked.toFixed(2);
        document.getElementById('balancePositions').textContent = data.positions;

        // Show/hide unredeemed card (LIVE mode only)
        const unredeemedCard = document.getElementById('unredeemedCard');
        const unredeemedIcon = document.getElementById('unredeemedIcon');
        const unredeemedValue = data.unredeemed || 0;

        if (data.mode === 'LIVE') {
            // Always show in LIVE mode for monitoring
            unredeemedCard.style.display = 'flex';
            document.getElementById('balanceUnredeemed').textContent = '$' + unredeemedValue.toFixed(2);

            // Only show warning styling if amount is significant (>$100)
            if (unredeemedValue > 100) {
                unredeemedCard.classList.add('status-card-warning');
                unredeemedIcon.textContent = '⚠️';
                unredeemedCard.title = 'You have unredeemed winnings! Go to polymarket.com to claim them.';
                unredeemedCard.style.cursor = 'help';
            } else {
                unredeemedCard.classList.remove('status-card-warning');
                unredeemedIcon.textContent = '💎';
                unredeemedCard.title = 'Unredeemed winnings (will be claimed automatically)';
                unredeemedCard.style.cursor = 'default';
            }
        } else {
            unredeemedCard.style.display = 'none';
        }
    } catch (err) {
        console.error('Error loading balance:', err);
    }
}

// Load stats
async function loadStats() {
    try {
        const res = await fetch(`${API_BASE}/spike-stats`);
        if (!res.ok) throw new Error('Failed to load stats');

        const data = await res.json();
        const { stats, capital } = data;

        // Capital (only update in PAPER mode)
        if (CURRENT_TRADING_MODE === 'PAPER') {
            const capitalEl = document.getElementById('currentCapital');
            const roi = capital.roi || 0;
            // Display capital with ROI inline
            capitalEl.textContent = '$' + capital.current.toFixed(2);
            capitalEl.className = 'status-value ' + (roi > 0 ? 'text-green' : roi < 0 ? 'text-red' : '');
        }

        // Stats
        document.getElementById('totalTrades').textContent = stats.total;

        const completedTrades = stats.wins + stats.losses;
        const winRate = completedTrades > 0 ? ((stats.wins / completedTrades) * 100).toFixed(1) : '0.0';
        document.getElementById('winRate').textContent = winRate + '%';

        const evEl = document.getElementById('evPerTrade');
        evEl.textContent = stats.evPerTrade.toFixed(2) + '%';
        evEl.className = 'metric-value ' + (stats.evPerTrade > 0 ? 'text-green' : stats.evPerTrade < 0 ? 'text-red' : '');

        // Recent trades
        if (data.recentTrades && data.recentTrades.length > 0) {
            const tbody = document.getElementById('recentTradesBody');
            tbody.innerHTML = data.recentTrades.map(t => {
                const time = new Date(t.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const market = (t.market_question || '').slice(0, 35) + '...';
                const signal = t.signal_type === 'BUY_YES'
                    ? '<span class="badge badge-success">UP ↗</span>'
                    : '<span class="badge badge-danger">DOWN ↘</span>';
                const outcome = t.outcome === 'WIN'
                    ? '<span class="badge badge-success">WIN</span>'
                    : t.outcome === 'LOSS'
                    ? '<span class="badge badge-danger">LOSS</span>'
                    : '<span class="badge badge-warning">PENDING</span>';
                const pnl = t.pnl_pct !== null
                    ? `<span style="color: ${t.pnl_pct > 0 ? '#10b981' : '#ef4444'};">${t.pnl_pct > 0 ? '+' : ''}${parseFloat(t.pnl_pct).toFixed(1)}%</span>`
                    : '-';

                return `
                    <tr>
                        <td>${time}</td>
                        <td>${market}</td>
                        <td>${signal}</td>
                        <td>T+${t.signal_minute}</td>
                        <td>${parseFloat(t.candle_range_pct || 0).toFixed(2)}%</td>
                        <td>${parseFloat(t.simulated_entry_price || 0).toFixed(4)}</td>
                        <td>${outcome}</td>
                        <td>${pnl}</td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

// Load crypto config
async function loadCryptoConfig() {
    try {
        const res = await fetch(`${API_BASE}/spike-crypto-config`);
        if (!res.ok) throw new Error('Failed to load crypto config');

        const data = await res.json();
        const grid = document.getElementById('cryptoConfigGrid');
        const saveBtn = document.getElementById('saveCryptoConfigBtn');

        if (!data.configs || data.configs.length === 0) {
            grid.innerHTML = '<p class="loading">No configurations found</p>';
            return;
        }

        grid.innerHTML = data.configs.map(config => `
            <div class="crypto-item ${config.enabled ? 'enabled' : ''}" data-crypto="${config.crypto_symbol}">
                <div class="crypto-header">
                    <span class="crypto-icon">${CRYPTO_ICONS[config.crypto_symbol]}</span>
                    <span class="crypto-name">${CRYPTO_NAMES[config.crypto_symbol]}</span>
                </div>
                <div class="crypto-toggle">
                    <input type="checkbox" id="enable_${config.crypto_symbol}" ${config.enabled ? 'checked' : ''} onchange="updateCryptoStyle('${config.crypto_symbol}')">
                    <label for="enable_${config.crypto_symbol}">Enable Trading</label>
                </div>
                <div class="crypto-threshold">
                    <label for="min_threshold_${config.crypto_symbol}">Min Threshold (%)</label>
                    <input type="number" id="min_threshold_${config.crypto_symbol}" value="${config.min_threshold_pct || 0.15}" min="0.01" max="10" step="0.01">
                </div>
                <div class="crypto-threshold">
                    <label for="max_threshold_${config.crypto_symbol}">Max Threshold (%)</label>
                    <input type="number" id="max_threshold_${config.crypto_symbol}" value="${config.max_threshold_pct || 0.30}" min="0.01" max="10" step="0.01">
                </div>
            </div>
        `).join('');

        saveBtn.style.display = 'inline-flex';
    } catch (err) {
        console.error('Error loading crypto config:', err);
    }
}

function updateCryptoStyle(crypto) {
    const checkbox = document.getElementById(`enable_${crypto}`);
    const item = document.querySelector(`[data-crypto="${crypto}"]`);
    item.classList.toggle('enabled', checkbox.checked);
}

// Save crypto config
async function saveCryptoConfig() {
    const btn = document.getElementById('saveCryptoConfigBtn');
    const btnText = document.getElementById('saveBtnText');
    const loader = document.getElementById('saveLoader');
    const message = document.getElementById('saveMessage');

    btn.disabled = true;
    btnText.textContent = 'Saving...';
    loader.style.display = 'inline-block';
    message.style.display = 'none';

    const cryptos = ['BTC', 'ETH', 'SOL', 'XRP'];
    try {
        for (const crypto of cryptos) {
            const enabled = document.getElementById(`enable_${crypto}`).checked;
            const minThreshold = parseFloat(document.getElementById(`min_threshold_${crypto}`).value);
            const maxThreshold = parseFloat(document.getElementById(`max_threshold_${crypto}`).value);

            if (minThreshold >= maxThreshold) {
                throw new Error(`${crypto}: Min threshold must be less than max threshold`);
            }

            await fetch(`${API_BASE}/spike-crypto-config`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ crypto_symbol: crypto, enabled, min_threshold_pct: minThreshold, max_threshold_pct: maxThreshold })
            });
        }

        message.textContent = '✓ Configuration saved successfully!';
        message.className = 'message success';
        message.style.display = 'block';
        setTimeout(() => message.style.display = 'none', 5000);
    } catch (err) {
        message.textContent = '✗ Error: ' + err.message;
        message.className = 'message error';
        message.style.display = 'block';
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Save Configuration';
        loader.style.display = 'none';
    }
}

// Load backtest config
async function loadBacktestConfig() {
    try {
        const res = await fetch(`${API_BASE}/spike-backtest-config`);
        if (!res.ok) throw new Error('Failed to load backtest config');

        const data = await res.json();
        const grid = document.getElementById('backtestConfigGrid');
        const saveBtn = document.getElementById('saveBacktestConfigBtn');

        if (!data.configs || data.configs.length === 0) {
            // Create default configs
            const cryptos = ['BTC', 'ETH', 'SOL', 'XRP'];
            grid.innerHTML = cryptos.map(crypto => `
                <div class="crypto-item enabled" data-crypto="${crypto}">
                    <div class="crypto-header">
                        <span class="crypto-icon">${CRYPTO_ICONS[crypto]}</span>
                        <span class="crypto-name">${CRYPTO_NAMES[crypto]}</span>
                    </div>
                    <div class="crypto-threshold">
                        <label for="backtest_min_${crypto}">Min Threshold (%)</label>
                        <input type="number" id="backtest_min_${crypto}" value="0.15" min="0.01" max="10" step="0.01">
                    </div>
                    <div class="crypto-threshold">
                        <label for="backtest_max_${crypto}">Max Threshold (%)</label>
                        <input type="number" id="backtest_max_${crypto}" value="0.30" min="0.01" max="10" step="0.01">
                    </div>
                </div>
            `).join('');
        } else {
            grid.innerHTML = data.configs.map(config => `
                <div class="crypto-item enabled" data-crypto="${config.crypto_symbol}">
                    <div class="crypto-header">
                        <span class="crypto-icon">${CRYPTO_ICONS[config.crypto_symbol]}</span>
                        <span class="crypto-name">${CRYPTO_NAMES[config.crypto_symbol]}</span>
                    </div>
                    <div class="crypto-threshold">
                        <label for="backtest_min_${config.crypto_symbol}">Min Threshold (%)</label>
                        <input type="number" id="backtest_min_${config.crypto_symbol}" value="${config.min_threshold_pct || 0.15}" min="0.01" max="10" step="0.01">
                    </div>
                    <div class="crypto-threshold">
                        <label for="backtest_max_${config.crypto_symbol}">Max Threshold (%)</label>
                        <input type="number" id="backtest_max_${config.crypto_symbol}" value="${config.max_threshold_pct || 0.30}" min="0.01" max="10" step="0.01">
                    </div>
                </div>
            `).join('');
        }

        saveBtn.style.display = 'inline-flex';
    } catch (err) {
        console.error('Error loading backtest config:', err);
    }
}

// Save backtest config
async function saveBacktestConfig() {
    const btn = document.getElementById('saveBacktestConfigBtn');
    const btnText = document.getElementById('saveBacktestBtnText');
    const loader = document.getElementById('saveBacktestLoader');
    const message = document.getElementById('saveBacktestMessage');

    btn.disabled = true;
    btnText.textContent = 'Saving...';
    loader.style.display = 'inline-block';
    message.style.display = 'none';

    const cryptos = ['BTC', 'ETH', 'SOL', 'XRP'];
    try {
        for (const crypto of cryptos) {
            const minThreshold = parseFloat(document.getElementById(`backtest_min_${crypto}`).value);
            const maxThreshold = parseFloat(document.getElementById(`backtest_max_${crypto}`).value);

            if (minThreshold >= maxThreshold) {
                throw new Error(`${crypto}: Min threshold must be less than max threshold`);
            }

            await fetch(`${API_BASE}/spike-backtest-config`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ crypto_symbol: crypto, min_threshold_pct: minThreshold, max_threshold_pct: maxThreshold })
            });
        }

        message.textContent = '✓ Backtest settings saved successfully!';
        message.className = 'message success';
        message.style.display = 'block';
        setTimeout(() => message.style.display = 'none', 5000);
    } catch (err) {
        message.textContent = '✗ Error: ' + err.message;
        message.className = 'message error';
        message.style.display = 'block';
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Save Backtest Settings';
        loader.style.display = 'none';
    }
}

// Backtest
async function runBacktest() {
    const btn = document.getElementById('backtestBtn');
    const btnText = document.getElementById('backtestBtnText');
    const loader = document.getElementById('backtestLoader');
    const resultsDiv = document.getElementById('backtestResults');

    const selectedCryptos = [];
    ['BTC', 'ETH', 'SOL', 'XRP'].forEach(crypto => {
        const checkbox = document.getElementById(`backtest_${crypto}`);
        if (checkbox && checkbox.checked) selectedCryptos.push(crypto);
    });

    if (selectedCryptos.length === 0) {
        resultsDiv.innerHTML = '<div class="verdict-box danger"><strong>⚠️ Error:</strong> Select at least one crypto</div>';
        resultsDiv.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btnText.textContent = 'Running backtest...';
    loader.style.display = 'inline-block';
    resultsDiv.style.display = 'none';

    try {
        const strategy = document.getElementById('backtestStrategy').value;

        const res = await fetch(`${API_BASE}/spike-backtest`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ maxCandles: 10000, cryptos: selectedCryptos, strategy: strategy })
        });

        if (!res.ok) throw new Error((await res.json()).error || 'Backtest failed');

        const results = await res.json();
        displayBacktestResults(results, selectedCryptos);
    } catch (err) {
        resultsDiv.innerHTML = `<div class="verdict-box danger"><strong>❌ Error:</strong> ${err.message}</div>`;
        resultsDiv.style.display = 'block';
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Run Backtest';
        loader.style.display = 'none';
    }
}

function displayBacktestResults(results, selectedCryptos) {
    const resultsDiv = document.getElementById('backtestResults');
    const winRate = results.winRate || 0;
    const ev = results.ev || 0;
    const days = results.period?.days?.toFixed(1) || 0;
    const isMultiCrypto = selectedCryptos.length > 1;

    let verdictClass = 'verdict-box';
    let verdictIcon = '⚠️';
    let verdictText = '';

    if (results.signalsDetected < 20) {
        verdictClass += ' danger';
        verdictText = `INSUFFICIENT DATA: Only ${results.signalsDetected} signals. Need 50+ for statistical significance.`;
    } else if (ev < 0) {
        verdictClass += ' danger';
        verdictIcon = '❌';
        verdictText = `STRATEGY NON-VIABLE: Negative EV (${ev.toFixed(1)}%). Loses money over time.`;
    } else if (ev < 3) {
        verdictIcon = '⚠️';
        verdictText = `MARGINAL EDGE: EV ${ev.toFixed(1)}% is too low. Fees will eat the edge.`;
    } else if (ev < 5) {
        verdictIcon = '⚠️';
        verdictText = `WEAK EDGE: EV ${ev.toFixed(1)}% is modest. Micro-test with $100-300 only.`;
    } else {
        verdictClass += ' success';
        verdictIcon = '✅';
        verdictText = `PROMISING EDGE: EV ${ev.toFixed(1)}% is strong! Strategy shows potential.`;
    }

    const revenue = results.estimatedRevenue || 0;
    const revenuePerDay = results.revenuePerDay || 0;

    const html = `
        <div class="backtest-grid">
            <div class="backtest-metric">
                <div class="backtest-metric-label">Signals</div>
                <div class="backtest-metric-value neutral">${results.signalsDetected}</div>
            </div>
            <div class="backtest-metric">
                <div class="backtest-metric-label">Win Rate</div>
                <div class="backtest-metric-value ${winRate >= 50 ? 'positive' : 'negative'}">${winRate.toFixed(1)}%</div>
            </div>
            <div class="backtest-metric">
                <div class="backtest-metric-label">Wins</div>
                <div class="backtest-metric-value positive">${results.wins}</div>
            </div>
            <div class="backtest-metric">
                <div class="backtest-metric-label">Losses</div>
                <div class="backtest-metric-value negative">${results.losses}</div>
            </div>
            <div class="backtest-metric">
                <div class="backtest-metric-label">Total Revenue ($1 bets)</div>
                <div class="backtest-metric-value ${revenue > 0 ? 'positive' : 'negative'}">$${revenue.toFixed(2)}</div>
            </div>
            <div class="backtest-metric">
                <div class="backtest-metric-label">Revenue/Day</div>
                <div class="backtest-metric-value ${revenuePerDay > 0 ? 'positive' : 'negative'}">$${revenuePerDay.toFixed(2)}</div>
            </div>
            <div class="backtest-metric">
                <div class="backtest-metric-label">Expected Value</div>
                <div class="backtest-metric-value ${ev > 0 ? 'positive' : 'negative'}">${ev.toFixed(1)}%</div>
            </div>
            <div class="backtest-metric">
                <div class="backtest-metric-label">Period</div>
                <div class="backtest-metric-value neutral">${days} days</div>
            </div>
        </div>

        ${results.failedCryptos && results.failedCryptos.length > 0 ? `
            <div style="margin-top: 16px; padding: 12px; background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; border-radius: 6px;">
                <strong>⚠️ Warning:</strong> Some cryptos failed:
                <ul style="margin: 8px 0 0 20px; font-size: 13px;">
                    ${results.failedCryptos.map(f => `<li>${f.crypto}: ${f.error}</li>`).join('')}
                </ul>
            </div>
        ` : ''}

        ${isMultiCrypto && results.byCrypto ? `
            <div style="margin-top: 20px;">
                <h4 style="margin-bottom: 12px; font-size: 15px; color: var(--text-primary);">Per-Crypto Breakdown</h4>
                <div class="crypto-backtest-grid">
                    ${results.byCrypto.map(r => `
                        <div class="crypto-backtest-card">
                            <div style="font-size: 16px; font-weight: 700; margin-bottom: 10px;">
                                ${CRYPTO_ICONS[r.crypto]} ${CRYPTO_NAMES[r.crypto]}
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 12px;">
                                <div><strong>Signals:</strong> ${r.signalsDetected}</div>
                                <div><strong>Win Rate:</strong> <span style="color: ${r.winRate >= 50 ? '#10b981' : '#ef4444'};">${r.winRate.toFixed(1)}%</span></div>
                                <div><strong>Wins:</strong> ${r.wins}</div>
                                <div><strong>Losses:</strong> ${r.losses}</div>
                                <div><strong>EV:</strong> <span style="color: ${r.ev > 0 ? '#10b981' : '#ef4444'};">${r.ev.toFixed(1)}%</span></div>
                                <div><strong>Cycles:</strong> ${r.totalCycles.toLocaleString()}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <div style="margin-top: 20px;">
            <h4 style="margin-bottom: 12px; font-size: 15px; color: var(--text-primary);">Breakdown by Signal Minute</h4>
            <div class="minute-breakdown">
                ${Object.keys(results.byMinute || {})
                    .map(k => parseInt(k))
                    .sort((a, b) => a - b)
                    .map(min => `
                    <div class="minute-card">
                        <div class="minute-card-title">T+${min}</div>
                        <div class="minute-card-winrate ${results.byMinute[min].winRate >= 50 ? 'text-green' : 'text-red'}">
                            ${results.byMinute[min].winRate.toFixed(1)}%
                        </div>
                        <div style="font-size: 11px; color: var(--text-secondary);">
                            ${results.byMinute[min].signals} signals<br>
                            EV: ${results.byMinute[min].ev.toFixed(1)}%
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="${verdictClass}">
            <div style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">
                ${verdictIcon} VERDICT
            </div>
            <div>${verdictText}</div>
        </div>
    `;

    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
}

// ─── Spike Tabs ───────────────────────────────────────────────────────────────

function switchSpikeTab(tabName) {
    // Update buttons
    document.querySelectorAll('.spike-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update panels
    document.querySelectorAll('.spike-tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`spike-tab-${tabName}`).classList.add('active');

    // Save sub-tab state to localStorage
    localStorage.setItem('spikeSubTab', tabName);

    // Load data if not already loaded
    if (tabName === 'recent-trades' && !window.spikeRecentTradesLoaded) {
        loadRecentTrades();
    } else if (tabName === 'positions' && !window.spikePositionsLoaded) {
        loadPositions();
    } else if (tabName === 'missed-opportunities' && !window.spikeMissedLoaded) {
        loadMissedOpportunities();
    } else if (tabName === 'activity-log' && !window.spikeActivityLogLoaded) {
        loadActivityLog();
    }
}

// ─── Recent Trades ────────────────────────────────────────────────────────────

async function loadRecentTrades() {
    const tbody = document.getElementById('recentTradesBody');
    try {
        const data = await fetch(`${API_BASE}/spike-stats`).then(r => r.json());
        const trades = data.recentTrades || [];

        document.getElementById('recentTradesCount').textContent = trades.length;

        // Calculate stats
        let wins = 0;
        let losses = 0;
        let pending = 0;

        trades.forEach(t => {
            if (t.outcome === 'WIN') {
                wins++;
            } else if (t.outcome === 'LOSS') {
                losses++;
            } else {
                pending++;
            }
        });

        const totalResolved = wins + losses;
        const winRate = totalResolved > 0 ? (wins / totalResolved * 100).toFixed(1) : '0.0';

        // Update stats display
        document.getElementById('tradesStatsTotal').textContent = trades.length;
        document.getElementById('tradesStatsWins').textContent = wins;
        document.getElementById('tradesStatsLosses').textContent = losses;
        document.getElementById('tradesStatsWinRate').textContent = winRate + '%';
        document.getElementById('tradesStatsPending').textContent = pending;

        if (!trades.length) {
            // Show zeros when no data
            document.getElementById('tradesStatsTotal').textContent = '0';
            document.getElementById('tradesStatsWins').textContent = '0';
            document.getElementById('tradesStatsLosses').textContent = '0';
            document.getElementById('tradesStatsWinRate').textContent = '0.0%';
            document.getElementById('tradesStatsPending').textContent = '0';
            tbody.innerHTML = '<tr><td colspan="11" class="loading">No trades yet</td></tr>';
            return;
        }

        tbody.innerHTML = trades.map(t => {
            const time = new Date(t.timestamp).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const crypto = t.crypto_symbol || 'BTC';
            const market = (t.market_question || '').slice(0, 40) + '...';
            const marketLink = t.market_id
                ? `<a href="https://polymarket.com/event/${t.market_id}" target="_blank" style="color: var(--accent); text-decoration: none;" title="View on Polymarket">🔗</a>`
                : '-';
            // Add outcome indicator to signal badge
            const outcomeIcon = t.outcome === 'WIN' ? ' 👍' : t.outcome === 'LOSS' ? ' ❌' : '';
            const signal = t.signal_type === 'BUY_YES'
                ? `<span class="badge badge-success">UP ↗${outcomeIcon}</span>`
                : `<span class="badge badge-danger">DOWN ↘${outcomeIcon}</span>`;
            const outcome = t.outcome === 'WIN'
                ? '<span class="badge badge-success">WIN 👍</span>'
                : t.outcome === 'LOSS'
                ? '<span class="badge badge-danger">LOSS ❌</span>'
                : '<span class="badge badge-warning">PENDING</span>';

            // Calculate estimated PNL
            let pnl = '-';
            if (t.pnl_usd !== null && t.pnl_usd !== undefined) {
                // Use actual PNL if available
                const pnlValue = parseFloat(t.pnl_usd);
                const pnlPct = parseFloat(t.pnl_pct || 0);
                const color = pnlValue >= 0 ? '#10b981' : '#ef4444';
                pnl = `<span style="color: ${color};">${pnlValue >= 0 ? '+' : ''}$${Math.abs(pnlValue).toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</span>`;
            } else if (t.outcome === 'WIN') {
                // Estimate WIN: shares * (1 - entry_price)
                const entryPrice = parseFloat(t.simulated_entry_price || t.entry_price || 0);
                const positionSize = parseFloat(t.position_size_usd || 0);
                const shares = positionSize / entryPrice;
                const estimatedPnl = shares * (1 - entryPrice);
                pnl = `<span style="color: #10b981;">~+$${estimatedPnl.toFixed(2)}</span>`;
            } else if (t.outcome === 'LOSS') {
                // LOSS: lost the entire position
                const positionSize = parseFloat(t.position_size_usd || 0);
                pnl = `<span style="color: #ef4444;">-$${positionSize.toFixed(2)}</span>`;
            }

            return `
                <tr>
                    <td>${time}</td>
                    <td><strong>${crypto}</strong></td>
                    <td>${market}</td>
                    <td style="text-align: center;">${marketLink}</td>
                    <td>${signal}</td>
                    <td>T+${t.signal_minute || 0}</td>
                    <td>${parseFloat(t.candle_range_pct || 0).toFixed(2)}%</td>
                    <td>${parseFloat(t.simulated_entry_price || t.entry_price || 0).toFixed(4)}</td>
                    <td>$${parseFloat(t.position_size_usd || 0).toFixed(2)}</td>
                    <td>${outcome}</td>
                    <td>${pnl}</td>
                </tr>
            `;
        }).join('');

        window.spikeRecentTradesLoaded = true;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="11" class="loading">Error: ${err.message}</td></tr>`;
    }
}

// ─── Positions ────────────────────────────────────────────────────────────────

async function loadPositions() {
    const tbody = document.getElementById('positionsBody');
    try {
        const mode = CURRENT_TRADING_MODE || 'PAPER';
        const table = mode === 'LIVE' ? 'spike_trades_live' : 'spike_trades_simulated';

        const res = await fetch(`${API_BASE}/spike-stats`);
        const data = await res.json();

        // Filter for PENDING trades from recentTrades
        const allTrades = data.recentTrades || [];
        const positions = allTrades.filter(t => t.outcome === 'PENDING');

        document.getElementById('positionsCount').textContent = positions.length;

        if (!positions.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading">No open positions</td></tr>';
            return;
        }

        tbody.innerHTML = positions.map(p => {
            const opened = new Date(p.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const crypto = p.crypto_symbol || 'BTC';
            const market = (p.market_question || '').slice(0, 40) + '...';
            const signal = p.signal_type === 'BUY_YES'
                ? '<span class="badge badge-success">UP ↗</span>'
                : '<span class="badge badge-danger">DOWN ↘</span>';
            const entry = parseFloat(p.simulated_entry_price || p.entry_price || 0).toFixed(4);
            const size = '$' + parseFloat(p.position_size_usd || 0).toFixed(2);

            const openedTime = new Date(p.timestamp);
            const now = new Date();
            const durationMin = Math.floor((now - openedTime) / 60000);
            const duration = durationMin < 60 ? `${durationMin}m` : `${Math.floor(durationMin/60)}h ${durationMin%60}m`;

            return `
                <tr>
                    <td>${opened}</td>
                    <td><strong>${crypto}</strong></td>
                    <td>${market}</td>
                    <td>${signal}</td>
                    <td>${entry}</td>
                    <td>${size}</td>
                    <td>${duration}</td>
                    <td><span class="badge badge-warning">PENDING</span></td>
                </tr>
            `;
        }).join('');

        window.spikePositionsLoaded = true;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading">Error: ${err.message}</td></tr>`;
    }
}

// ─── Missed Opportunities ─────────────────────────────────────────────────────

async function loadMissedOpportunities() {
    const tbody = document.getElementById('missedOpportunitiesBody');
    try {
        const res = await fetch(`${API_BASE}/spike/missed-opportunities`);
        const data = await res.json();
        const opportunities = data.opportunities || [];

        document.getElementById('missedCount').textContent = opportunities.length;

        // Determine if a missed opportunity is a void trade (BEGIN or END of cycle)
        // Cycle has 5 positions: BEGIN(0), T+1, T+2, T+3, END(4)
        // Only candle 0 (BEGIN) and candle 4 (END) are void — T+1/T+2/T+3 are counted.
        function isVoidTrade(o) {
            if (o.signal_minute === 0) return true; // BEGIN
            if (o.signal_minute >= 4) return true;  // END
            return false;
        }

        // Calculate stats (void trades excluded)
        let totalResolved = 0;
        let wins = 0;
        let losses = 0;
        let pending = 0;
        let voidCount = 0;

        opportunities.forEach(o => {
            if (isVoidTrade(o)) {
                voidCount++;
                return;
            }
            if (!o.market_outcome || o.market_outcome === 'PENDING') {
                pending++;
            } else {
                totalResolved++;
                const wouldHaveWon = (o.market_outcome === 'YES' && o.signal_type === 'BUY_YES') ||
                                     (o.market_outcome === 'NO' && o.signal_type === 'BUY_NO');
                if (wouldHaveWon) {
                    wins++;
                } else {
                    losses++;
                }
            }
        });

        const winRate = totalResolved > 0 ? (wins / totalResolved * 100).toFixed(1) : '0.0';

        // Update stats display
        document.getElementById('missedStatsTotal').textContent = opportunities.length;
        document.getElementById('missedStatsWins').textContent = wins;
        document.getElementById('missedStatsLosses').textContent = losses;
        document.getElementById('missedStatsWinRate').textContent = winRate + '%';
        document.getElementById('missedStatsPending').textContent = pending;
        document.getElementById('missedStatsVoid').textContent = voidCount;

        if (!opportunities.length) {
            // Show zeros when no data
            document.getElementById('missedStatsTotal').textContent = '0';
            document.getElementById('missedStatsWins').textContent = '0';
            document.getElementById('missedStatsLosses').textContent = '0';
            document.getElementById('missedStatsWinRate').textContent = '0.0%';
            document.getElementById('missedStatsPending').textContent = '0';
            document.getElementById('missedStatsVoid').textContent = '0';
            tbody.innerHTML = '<tr><td colspan="9" class="loading">No missed opportunities yet</td></tr>';
            return;
        }

        tbody.innerHTML = opportunities.map(o => {
            const time = new Date(o.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const crypto = o.crypto_symbol || 'N/A';

            // Add market link if marketSlug is available in details
            let marketDisplay = (o.market_question || 'N/A').slice(0, 35) + '...';
            if (o.details && typeof o.details === 'object' && o.details.marketSlug) {
                const marketUrl = `https://polymarket.com/event/${o.details.marketSlug}`;
                marketDisplay += ` <a href="${marketUrl}" target="_blank" style="color: #3b82f6; font-weight: 600; text-decoration: underline;">Open market</a>`;
            } else if (typeof o.details === 'string') {
                try {
                    const parsed = JSON.parse(o.details);
                    if (parsed.marketSlug) {
                        const marketUrl = `https://polymarket.com/event/${parsed.marketSlug}`;
                        marketDisplay += ` <a href="${marketUrl}" target="_blank" style="color: #3b82f6; font-weight: 600; text-decoration: underline;">Open market</a>`;
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }

            // Add outcome indicator if market was resolved
            const void_ = isVoidTrade(o);
            let outcomeIcon;
            if (void_) {
                outcomeIcon = ''; // icon handled in badge below
            } else if ((o.market_outcome === 'YES' && o.signal_type === 'BUY_YES') ||
                       (o.market_outcome === 'NO'  && o.signal_type === 'BUY_NO')) {
                outcomeIcon = ' 👍';
            } else if (o.market_outcome && o.market_outcome !== 'PENDING') {
                outcomeIcon = ' ❌';
            } else {
                outcomeIcon = '';
            }
            const signal = void_
                ? `<span class="badge" style="background:#374151;color:#9ca3af;">⊘ VOID</span>`
                : o.signal_type === 'BUY_YES'
                ? `<span class="badge badge-success">UP ↗${outcomeIcon}</span>`
                : o.signal_type === 'BUY_NO'
                ? `<span class="badge badge-danger">DOWN ↘${outcomeIcon}</span>`
                : 'N/A';
            const movement = (parseFloat(o.candle_movement_pct) || 0).toFixed(2) + '%';

            const cycleLabels = { 0: 'BEGIN', 1: 'T+1', 2: 'T+2' };
            const cycleLabelText = o.signal_minute != null ? (cycleLabels[o.signal_minute] || `T+${o.signal_minute}`) : '-';
            const cycleColor = o.signal_minute === 0 ? '#10b981' : o.signal_minute === 2 ? '#f59e0b' : '#9aa0a6';
            const cycleCell = `<span style="font-size:11px;font-weight:600;color:${cycleColor};">${cycleLabelText}</span>`;

            const reasonMap = {
                'emergency_stop': 'Emergency Stop',
                'exposure_limit_exceeded': 'Exposure Limit',
                'price_too_high': 'Price Too High',
                'no_liquidity': 'No Liquidity',
                'position_too_small': 'Position Too Small',
                'crypto_disabled': 'Crypto Disabled',
                'capital_exhausted': 'No Capital'
            };
            const reason = reasonMap[o.reason] || o.reason;

            let details = '';
            if (o.reason === 'exposure_limit_exceeded') {
                details = `${parseFloat(o.current_exposure_pct || 0).toFixed(1)}% / ${parseFloat(o.max_exposure_pct || 0).toFixed(0)}% max`;
            } else if (o.reason === 'price_too_high') {
                details = `${parseFloat(o.entry_price || 0).toFixed(4)} > ${parseFloat(o.max_entry_price || 0).toFixed(2)} max`;
            } else if (o.reason === 'no_liquidity') {
                details = 'No order book';
            } else if (o.reason === 'position_too_small') {
                details = `$${parseFloat(o.would_be_position_size || 0).toFixed(2)} < $1 min`;
            }

            // Calculate estimated PNL if market was resolved (void trades show no PNL)
            // Use max_entry_price as the entry (i.e. the best price we would have accepted)
            // so PNL reflects the real opportunity cost, not the worthless 99¢ entry.
            let estimatedPnl = '-';
            if (!void_ && o.market_outcome && o.market_outcome !== 'PENDING' && o.entry_price && o.would_be_position_size) {
                const rawEntry   = parseFloat(o.entry_price);
                const maxEntry   = parseFloat(o.max_entry_price) || rawEntry;
                const entryPrice = Math.min(rawEntry, maxEntry); // best price we'd have accepted
                const positionSize = parseFloat(o.would_be_position_size);
                const wouldHaveWon = (o.market_outcome === 'YES' && o.signal_type === 'BUY_YES') ||
                                     (o.market_outcome === 'NO'  && o.signal_type === 'BUY_NO');

                if (wouldHaveWon) {
                    // Would have won: shares * (1 - entry_price)
                    const shares = positionSize / entryPrice;
                    const pnl = shares * (1 - entryPrice);
                    estimatedPnl = `<span style="color: #10b981; font-weight: 600;">+$${pnl.toFixed(2)}</span>`;
                } else {
                    // Would have lost
                    estimatedPnl = `<span style="color: #ef4444; font-weight: 600;">-$${positionSize.toFixed(2)}</span>`;
                }
            }

            return `
                <tr>
                    <td>${time}</td>
                    <td><strong>${crypto}</strong></td>
                    <td>${marketDisplay}</td>
                    <td>${signal}</td>
                    <td style="text-align:center;">${cycleCell}</td>
                    <td>${movement}</td>
                    <td>${estimatedPnl}</td>
                    <td><span class="badge badge-warning">${reason}</span></td>
                    <td style="font-size: 12px; color: #9aa0a6;">${details}</td>
                </tr>
            `;
        }).join('');

        window.spikeMissedLoaded = true;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" class="loading">Error: ${err.message}</td></tr>`;
    }
}

async function clearMissedOpportunities() {
    if (!confirm('Clear all missed opportunities?')) return;
    try {
        await fetch(`${API_BASE}/spike/missed-opportunities`, { method: 'DELETE', headers: authHeaders() });
        loadMissedOpportunities();
    } catch (err) {
        alert('Failed to clear: ' + err.message);
    }
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

async function loadActivityLog() {
    const tbody = document.getElementById('activityLogBody');
    try {
        const res = await fetch(`${API_BASE}/spike/activity-log`);
        const data = await res.json();
        const logs = data.logs || [];

        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading">No activity yet</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(l => {
            const time = new Date(l.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });

            // Event type badge with colors
            const eventBadge = {
                'bot_started': '<span class="badge" style="background: #10b981; color: white;">🚀 START</span>',
                'bot_stopped': '<span class="badge" style="background: #6b7280; color: white;">⏹ STOP</span>',
                'signal_detected': '<span class="badge" style="background: #8b5cf6; color: white;">⚡ SIGNAL</span>',
                'trade_executed': '<span class="badge" style="background: #3b82f6; color: white;">💰 TRADE</span>',
                'trade_completed': '<span class="badge" style="background: #059669; color: white;">✓ DONE</span>',
                'trade_skipped': '<span class="badge" style="background: #f59e0b; color: white;">⚠️ SKIPPED</span>',
                'trade_aborted': '<span class="badge" style="background: #b45309; color: white;">↩ BOUNCED</span>',
                'fade_executed': '<span class="badge" style="background: #7c3aed; color: white;">↩ FADE</span>',
                'PRICE_TOO_HIGH': '<span class="badge" style="background: #dc2626; color: white;">💰 TOO HIGH</span>',
                'price_monitoring': '<span class="badge" style="background: #475569; color: white;">🔄 WATCHING</span>',
                'price_acceptable': '<span class="badge" style="background: #0369a1; color: white;">✅ PRICE OK</span>',
                'movement_summary': '<span class="badge" style="background: #0891b2; color: white;">📊 SUMMARY</span>',
                'strategy_changed': '<span class="badge" style="background: #6b7280; color: white;">⚙ CONFIG</span>',
                'error': '<span class="badge badge-danger">❌ ERROR</span>'
            };
            const event = eventBadge[l.event_type] || `<span class="badge">${l.event_type}</span>`;

            const crypto = l.crypto_symbol ? `<strong style="color: #3b82f6;">${l.crypto_symbol}</strong>` : '-';

            // Colorize message content
            let message = l.message || '';

            // Special formatting for movement_summary
            if (l.event_type === 'movement_summary') {
                // Parse: "Last 20 min max movements: BTC:0.08% ETH:0.20% SOL:0.09% XRP:0.12%"
                message = message.replace(/Last 20 min max movements:\s*(.+)/, (match, movements) => {
                    const formatted = movements
                        .replace(/BTC:([0-9.]+%)/g, '<span style="color: #f97316; font-weight: 700;">₿ BTC</span> <span style="color: #fb923c; font-weight: 600;">$1</span>')
                        .replace(/ETH:([0-9.]+%)/g, ' &nbsp;•&nbsp; <span style="color: #8b5cf6; font-weight: 700;">Ξ ETH</span> <span style="color: #a78bfa; font-weight: 600;">$1</span>')
                        .replace(/SOL:([0-9.]+%)/g, ' &nbsp;•&nbsp; <span style="color: #10b981; font-weight: 700;">◎ SOL</span> <span style="color: #34d399; font-weight: 600;">$1</span>')
                        .replace(/XRP:([0-9.]+%)/g, ' &nbsp;•&nbsp; <span style="color: #06b6d4; font-weight: 700;">✕ XRP</span> <span style="color: #22d3ee; font-weight: 600;">$1</span>');
                    return '<span style="color: #9aa0a6;">Last 20min:</span> ' + formatted;
                });
            } else {
                // Highlight LIVE/PAPER mode
                message = message.replace(/(LIVE TRADING|LIVE)/g, '<span style="color: #ef4444; font-weight: 700;">$1</span>');
                message = message.replace(/(PAPER TRADING|PAPER)/g, '<span style="color: #10b981; font-weight: 600;">$1</span>');

                // Highlight crypto symbols
                message = message.replace(/\b(BTC|ETH|SOL|XRP)\b/g, '<strong style="color: #3b82f6;">$1</strong>');

                // Highlight prices and amounts
                message = message.replace(/\$([0-9,.]+)/g, '<span style="color: #f59e0b; font-weight: 600;">$$$1</span>');
                message = message.replace(/([0-9.]+%)/g, '<span style="color: #8b5cf6; font-weight: 600;">$1</span>');

                // Highlight UP/DOWN signals (replace BUY_YES/BUY_NO with UP/DOWN + diagonal arrows)
                message = message.replace(/\bFADE_YES\b/g, '<span style="color: #a78bfa; font-weight: 700;">FADE YES ↩</span>');
                message = message.replace(/\bFADE_NO\b/g, '<span style="color: #a78bfa; font-weight: 700;">FADE NO ↩</span>');
                message = message.replace(/\bBUY_YES\b/g, '<span style="color: #10b981; font-weight: 700;">UP ↗</span>');
                message = message.replace(/\bBUY_NO\b/g, '<span style="color: #ef4444; font-weight: 700;">DOWN ↘</span>');
                message = message.replace(/\bYES\b/g, '<span style="color: #10b981; font-weight: 700;">UP ↗</span>');
                message = message.replace(/\bNO\b/g, '<span style="color: #ef4444; font-weight: 700;">DOWN ↘</span>');

                // Highlight WIN/LOSS
                message = message.replace(/\bWIN\b/g, '<span style="color: #10b981; font-weight: 700;">✅ WIN</span>');
                message = message.replace(/\bLOSS\b/g, '<span style="color: #ef4444; font-weight: 700;">❌ LOSS</span>');

                // Highlight Entry prices
                message = message.replace(/Entry:\s*([0-9.]+)/g, 'Entry: <span style="color: #f59e0b; font-weight: 600;">$1</span>');

                // Make URLs clickable (for PRICE_TOO_HIGH and other events with URLs)
                message = message.replace(/(https:\/\/polymarket\.com\/event\/[a-zA-Z0-9_-]+)/g, '<a href="$1" target="_blank" style="color: #3b82f6; text-decoration: none;">🔗 View Market</a>');

                // Highlight "Expected" revenue
                message = message.replace(/Expected:\s*\+?\$([0-9.]+)\s*if\s*win/g, 'Expected: <span style="color: #10b981; font-weight: 700;">+$$$1</span> if win');
            }

            // Add market link for signal_detected events (if not already in message)
            if (l.event_type === 'signal_detected' && l.details && l.details.marketSlug && !message.includes('polymarket.com')) {
                const marketUrl = `https://polymarket.com/event/${l.details.marketSlug}`;
                message += ` <a href="${marketUrl}" target="_blank" style="color: #3b82f6; text-decoration: none;">🔗 View Market</a>`;
            }

            // Row background based on event type
            let rowStyle = '';
            if (l.event_type === 'trade_executed') {
                rowStyle = 'background: rgba(59, 130, 246, 0.05);';
            } else if (l.event_type === 'fade_executed') {
                rowStyle = 'background: rgba(124, 58, 237, 0.08);';
            } else if (l.event_type === 'trade_completed') {
                rowStyle = 'background: rgba(16, 185, 129, 0.05);';
            } else if (l.event_type === 'trade_skipped') {
                rowStyle = 'background: rgba(245, 158, 11, 0.08);';
            } else if (l.event_type === 'PRICE_TOO_HIGH') {
                rowStyle = 'background: rgba(220, 38, 38, 0.08);';
            } else if (l.event_type === 'trade_aborted') {
                rowStyle = 'background: rgba(180, 83, 9, 0.08);';
            } else if (l.event_type === 'signal_detected') {
                rowStyle = 'background: rgba(139, 92, 246, 0.05);';
            } else if (l.event_type === 'bot_started') {
                rowStyle = 'background: rgba(16, 185, 129, 0.08);';
            }

            return `
                <tr style="${rowStyle}">
                    <td style="color: #e8eaed; font-size: 14px; font-weight: 700;">${time}</td>
                    <td>${event}</td>
                    <td>${crypto}</td>
                    <td style="font-size: 13px;">${message}</td>
                </tr>
            `;
        }).join('');

        window.spikeActivityLogLoaded = true;
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="loading">Error: ${err.message}</td></tr>`;
    }
}

async function clearActivityLog() {
    if (!confirm('Clear all activity log entries?')) return;
    try {
        await fetch(`${API_BASE}/spike/activity-log`, { method: 'DELETE', headers: authHeaders() });
        loadActivityLog();
    } catch (err) {
        alert('Failed to clear: ' + err.message);
    }
}

// ─── Position Size Config ─────────────────────────────────────────────────────

async function loadPositionSizeConfig() {
    try {
        const res = await fetch(`${API_BASE}/spike-config`);
        if (!res.ok) throw new Error('Failed to load config');

        const data = await res.json();

        // Update position size
        const posInput = document.getElementById('positionSizePct');
        if (posInput) {
            posInput.value = data.position_size_pct || 5;
        }

        // Update max entry price
        const maxPriceInput = document.getElementById('maxEntryPrice');
        if (maxPriceInput) {
            maxPriceInput.value = data.max_entry_price || 0.75;
        }

        // Update max capital risk
        const maxCapitalRiskInput = document.getElementById('maxCapitalRisk');
        if (maxCapitalRiskInput) {
            maxCapitalRiskInput.value = data.max_capital_risk_pct || 50;
        }

        // Update strategy selector
        const strategySelect = document.getElementById('detectionStrategy');
        if (strategySelect && data.available_strategies) {
            strategySelect.innerHTML = '';
            data.available_strategies.forEach(strategy => {
                const option = document.createElement('option');
                option.value = strategy.id;
                option.textContent = strategy.name;
                option.setAttribute('data-description', strategy.description);
                option.setAttribute('data-interval', strategy.interval);
                option.setAttribute('data-threshold', strategy.threshold);
                strategySelect.appendChild(option);
            });

            // Set current strategy
            strategySelect.value = data.detection_strategy || 'T123-1MIN';
            updateStrategyDescription();
        }
    } catch (err) {
        console.error('Error loading position size config:', err);
    }
}

function updateStrategyDescription() {
    const select = document.getElementById('detectionStrategy');
    const desc = document.getElementById('strategyDescription');
    if (!select || !desc) return;

    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption) return;

    const description = selectedOption.getAttribute('data-description');
    const interval = selectedOption.getAttribute('data-interval');
    const threshold = selectedOption.getAttribute('data-threshold');

    desc.innerHTML = `
        <strong>${description}</strong><br>
        Interval: <code>${interval}</code> |
        Threshold: <code>${threshold}%</code>
    `;
}

// Update strategy description when selection changes
document.addEventListener('DOMContentLoaded', () => {
    const strategySelect = document.getElementById('detectionStrategy');
    if (strategySelect) {
        strategySelect.addEventListener('change', updateStrategyDescription);
    }
});

async function savePositionSizeConfig() {
    const btn = document.getElementById('savePositionSizeBtn');
    const positionSize = parseFloat(document.getElementById('positionSizePct').value);
    const maxEntryPrice = parseFloat(document.getElementById('maxEntryPrice').value);
    const maxCapitalRisk = parseFloat(document.getElementById('maxCapitalRisk').value);
    const detectionStrategy = document.getElementById('detectionStrategy').value;

    // Validate
    if (isNaN(positionSize) || positionSize < 1 || positionSize > 20) {
        alert('Position size must be between 1% and 20%');
        return;
    }

    if (isNaN(maxEntryPrice) || maxEntryPrice < 0.01 || maxEntryPrice > 0.99) {
        alert('Max entry price must be between 0.01 and 0.99');
        return;
    }

    if (isNaN(maxCapitalRisk) || maxCapitalRisk < 1 || maxCapitalRisk > 100) {
        alert('Max capital risk must be between 1% and 100%');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '⏳ Saving...';

        const res = await fetch(`${API_BASE}/spike-config`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                position_size_pct: positionSize,
                max_entry_price: maxEntryPrice,
                max_capital_risk_pct: maxCapitalRisk,
                detection_strategy: detectionStrategy
            })
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to save');
        }

        const result = await res.json();
        btn.textContent = '✅ Saved!';

        // Show success message
        if (result.message) {
            alert('✅ ' + result.message);
        }

        setTimeout(() => {
            btn.textContent = '💾 Save Configuration';
            btn.disabled = false;
        }, 2000);

        alert('Position size updated! Bot will auto-restart if no active trades.');
    } catch (err) {
        btn.textContent = '❌ Error';
        alert('Failed to save: ' + err.message);
        setTimeout(() => {
            btn.textContent = '💾 Save Configuration';
            btn.disabled = false;
        }, 2000);
    }
}

// Initialize
loadTradingMode();
loadBalance();
loadStats();
loadMarketPrices();
loadCryptoConfig();
loadBacktestConfig();
loadPositionSizeConfig();
loadRecentTrades(); // Load initial data for active tab

// Restore saved tab states from localStorage
const savedMainTab = localStorage.getItem('spikeMainTab');
const savedSubTab = localStorage.getItem('spikeSubTab');

if (savedMainTab) {
    // Restore main tab (Live Trading, Backtest, Settings)
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const mainTabBtn = document.querySelector(`[data-tab="${savedMainTab}"]`);
    const mainTabContent = document.getElementById(`tab-${savedMainTab}`);

    if (mainTabBtn && mainTabContent) {
        mainTabBtn.classList.add('active');
        mainTabContent.classList.add('active');
    }
}

if (savedSubTab && savedMainTab === 'trading') {
    // Only restore sub-tab if we're on the Live Trading main tab
    document.querySelectorAll('.spike-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.spike-tab-panel').forEach(panel => panel.classList.remove('active'));

    const subTabBtn = document.querySelector(`.spike-tab-btn[data-tab="${savedSubTab}"]`);
    const subTabPanel = document.getElementById(`spike-tab-${savedSubTab}`);

    if (subTabBtn && subTabPanel) {
        subTabBtn.classList.add('active');
        subTabPanel.classList.add('active');

        // Load the data for the restored sub-tab
        if (savedSubTab === 'positions') {
            loadPositions();
        } else if (savedSubTab === 'missed-opportunities') {
            loadMissedOpportunities();
        } else if (savedSubTab === 'activity-log') {
            loadActivityLog();
        }
    }
}

// Global variable to track market end time
let marketEndTime = null;

// Load XRP market prices
async function loadMarketPrices() {
    try {
        const res = await fetch(`${API_BASE}/spike-market-prices?crypto=XRP`);
        if (!res.ok) throw new Error('Failed to load market prices');

        const data = await res.json();

        // Update market link
        const marketLinkEl = document.getElementById('marketLink');
        if (data.marketUrl) {
            marketLinkEl.href = data.marketUrl;
        }

        // Update UP price (green)
        const upPrice = data.upPrice || '-';
        document.getElementById('marketUpPrice').textContent = upPrice !== '-' ? (upPrice * 100).toFixed(0) + '¢' : '-';

        // Update DOWN price (red)
        const downPrice = data.downPrice || '-';
        document.getElementById('marketDownPrice').textContent = downPrice !== '-' ? (downPrice * 100).toFixed(0) + '¢' : '-';

        // Update volume (format as K if > 10000)
        const volume = data.volume || 0;
        const volumeEl = document.getElementById('marketVolume');
        if (volume > 10000) {
            volumeEl.textContent = '$' + (volume / 1000).toFixed(2) + 'K';
        } else {
            volumeEl.textContent = '$' + volume.toFixed(0);
        }

        // Update cycle position (T0, T1, T2, T3, T4)
        const cyclePosition = data.cyclePosition || '-';
        document.getElementById('cyclePosition').textContent = cyclePosition;

        // Update market open price (white)
        const marketOpenPrice = data.marketOpenPrice;
        const marketOpenEl = document.getElementById('marketOpenPrice');
        if (marketOpenPrice) {
            marketOpenEl.textContent = '$' + marketOpenPrice.toFixed(4);
            marketOpenEl.style.color = '#999'; // white/gray
        } else {
            marketOpenEl.textContent = '-';
        }

        // Update current price (colored based on comparison with open)
        const currentPrice = data.currentPrice;
        const currentPriceEl = document.getElementById('currentPrice');
        if (currentPrice) {
            currentPriceEl.textContent = '$' + currentPrice.toFixed(4);

            // Color based on direction
            if (marketOpenPrice && currentPrice > marketOpenPrice) {
                currentPriceEl.style.color = '#10b981'; // green
            } else if (marketOpenPrice && currentPrice < marketOpenPrice) {
                currentPriceEl.style.color = '#ef4444'; // red
            } else {
                currentPriceEl.style.color = '#999'; // gray (equal or no comparison)
            }
        } else {
            currentPriceEl.textContent = '-';
            currentPriceEl.style.color = '#999';
        }

        // Calculate market end time from question (e.g., "XRP Up or Down - February 24, 10:05AM-10:10AM ET")
        // Market is 5 minutes, so end time = start time + 5 minutes
        // We can derive this from the marketSlug which has a timestamp
        if (data.marketSlug) {
            // Extract timestamp from slug (e.g., "xrp-updown-5m-1771945500")
            const parts = data.marketSlug.split('-');
            const timestamp = parseInt(parts[parts.length - 1]);
            if (!isNaN(timestamp)) {
                // Timestamp is the start time in seconds
                // Market ends 5 minutes later
                marketEndTime = new Date((timestamp + 300) * 1000); // +300 seconds = +5 minutes
            }
        }

        // Collect price analytics data for T1, T2, T3
        collectPriceAnalytics(cyclePosition, upPrice, downPrice, data.marketSlug);

    } catch (err) {
        console.error('Error loading market prices:', err);
        document.getElementById('marketUpPrice').textContent = '-';
        document.getElementById('marketDownPrice').textContent = '-';
        document.getElementById('marketVolume').textContent = '-';
        document.getElementById('cyclePosition').textContent = '-';
        document.getElementById('marketOpenPrice').textContent = '-';
        document.getElementById('currentPrice').textContent = '-';
        document.getElementById('countdownTimer').textContent = '-';
    }
}

// ─── Price Analytics ──────────────────────────────────────────────────────────

// Data structures for price analytics (rolling 1000-value buffers)
const priceAnalytics = {
    T1: { up: [], down: [] },
    T2: { up: [], down: [] },
    T3: { up: [], down: [] }
};

// Separate data structure for current market only
const priceAnalyticsCurrentMarket = {
    T1: { up: [], down: [] },
    T2: { up: [], down: [] },
    T3: { up: [], down: [] }
};

// Track current market slug to detect market changes
let currentMarketSlug = null;

// Track current market mode (persisted in localStorage)
let isCurrentMarketMode = false;

// Validate price (must be between 0.01 and 0.99)
function isValidPrice(price) {
    return typeof price === 'number' && !isNaN(price) && price >= 0.01 && price <= 0.99;
}

// Collect price data for analytics
function collectPriceAnalytics(cyclePosition, upPrice, downPrice, marketSlug) {
    // Only collect during T1, T2, T3
    if (!['T1', 'T2', 'T3'].includes(cyclePosition)) {
        return;
    }

    // Validate prices
    const upValid = isValidPrice(upPrice);
    const downValid = isValidPrice(downPrice);

    if (!upValid && !downValid) {
        return; // Skip if both prices are invalid
    }

    // Check if market changed (reset current market stats)
    if (marketSlug && marketSlug !== currentMarketSlug) {
        console.log('Market changed:', currentMarketSlug, '->', marketSlug);
        currentMarketSlug = marketSlug;

        // Reset current market analytics
        priceAnalyticsCurrentMarket.T1 = { up: [], down: [] };
        priceAnalyticsCurrentMarket.T2 = { up: [], down: [] };
        priceAnalyticsCurrentMarket.T3 = { up: [], down: [] };

        // If in current market mode, immediately update display to show reset values
        if (isCurrentMarketMode) {
            updatePriceAnalyticsDisplay();
        }
    }

    // Update OVERALL analytics (always accumulate)
    const bufferOverall = priceAnalytics[cyclePosition];
    if (upValid) {
        bufferOverall.up.push(upPrice);
        if (bufferOverall.up.length > 1000) {
            bufferOverall.up.shift();
        }
    }
    if (downValid) {
        bufferOverall.down.push(downPrice);
        if (bufferOverall.down.length > 1000) {
            bufferOverall.down.shift();
        }
    }

    // Update CURRENT MARKET analytics (resets on market change)
    const bufferCurrent = priceAnalyticsCurrentMarket[cyclePosition];
    if (upValid) {
        bufferCurrent.up.push(upPrice);
        if (bufferCurrent.up.length > 1000) {
            bufferCurrent.up.shift();
        }
    }
    if (downValid) {
        bufferCurrent.down.push(downPrice);
        if (bufferCurrent.down.length > 1000) {
            bufferCurrent.down.shift();
        }
    }

    // Update display
    updatePriceAnalyticsDisplay();
}

// Calculate statistics for an array of prices
function calculateStats(prices) {
    if (!prices || prices.length === 0) {
        return { avg: null, min: null, max: null };
    }

    const sum = prices.reduce((a, b) => a + b, 0);
    const avg = sum / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    return { avg, min, max };
}

// Update price analytics display
function updatePriceAnalyticsDisplay() {
    // Choose which data set to display
    const dataSource = isCurrentMarketMode ? priceAnalyticsCurrentMarket : priceAnalytics;

    ['T1', 'T2', 'T3'].forEach(cycle => {
        const data = dataSource[cycle];
        const cycleNum = cycle.substring(1); // T1 -> 1, T2 -> 2, T3 -> 3

        // Calculate UP stats
        const upStats = calculateStats(data.up);
        document.getElementById(`t${cycleNum}-up-avg`).textContent =
            upStats.avg !== null ? (upStats.avg * 100).toFixed(0) + '¢' : '-';
        document.getElementById(`t${cycleNum}-up-min`).textContent =
            upStats.min !== null ? (upStats.min * 100).toFixed(0) + '¢' : '-';
        document.getElementById(`t${cycleNum}-up-max`).textContent =
            upStats.max !== null ? (upStats.max * 100).toFixed(0) + '¢' : '-';

        // Calculate DOWN stats
        const downStats = calculateStats(data.down);
        document.getElementById(`t${cycleNum}-down-avg`).textContent =
            downStats.avg !== null ? (downStats.avg * 100).toFixed(0) + '¢' : '-';
        document.getElementById(`t${cycleNum}-down-min`).textContent =
            downStats.min !== null ? (downStats.min * 100).toFixed(0) + '¢' : '-';
        document.getElementById(`t${cycleNum}-down-max`).textContent =
            downStats.max !== null ? (downStats.max * 100).toFixed(0) + '¢' : '-';

        // Update sample count
        document.getElementById(`t${cycleNum}-samples`).textContent = Math.max(data.up.length, data.down.length);
    });
}

// Toggle price analytics panel
function togglePriceAnalytics() {
    const panel = document.getElementById('priceAnalyticsPanel');
    const toggle = document.getElementById('priceAnalyticsToggle');

    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        toggle.style.transform = 'rotate(180deg)';
    } else {
        panel.style.display = 'none';
        toggle.style.transform = 'rotate(0deg)';
    }
}

// Toggle current market mode
function toggleCurrentMarketMode() {
    const checkbox = document.getElementById('currentMarketMode');
    isCurrentMarketMode = checkbox.checked;

    // Save to localStorage
    localStorage.setItem('priceAnalyticsCurrentMarketMode', isCurrentMarketMode ? '1' : '0');

    // Update display immediately
    updatePriceAnalyticsDisplay();

    console.log('Current Market Mode:', isCurrentMarketMode ? 'ON (showing current market only)' : 'OFF (showing all-time stats)');
}

// Update countdown timer (called every second)
function updateCountdown() {
    const timerEl = document.getElementById('countdownTimer');

    if (!marketEndTime) {
        timerEl.textContent = '-';
        timerEl.style.color = '#10b981'; // green
        return;
    }

    const now = new Date();
    const timeLeft = marketEndTime - now;

    if (timeLeft <= 0) {
        timerEl.textContent = '0:00';
        timerEl.style.color = '#ef4444'; // red
        return;
    }

    // Calculate minutes and seconds
    const totalSeconds = Math.floor(timeLeft / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    // Format as M:SS
    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    timerEl.textContent = formatted;

    // Turn red when less than 30 seconds
    if (totalSeconds <= 30) {
        timerEl.style.color = '#ef4444'; // red
    } else {
        timerEl.style.color = '#10b981'; // green
    }
}

// Start countdown timer update loop
setInterval(updateCountdown, 1000);

// Market prices refresh - every 1 second (only when page is visible)
let marketPricesInterval = null;

function startMarketPricesRefresh() {
    // Clear any existing interval
    if (marketPricesInterval) {
        clearInterval(marketPricesInterval);
    }

    // Start 1-second refresh (matches price collector frequency)
    marketPricesInterval = setInterval(() => {
        if (!document.hidden) {
            loadMarketPrices();
        }
    }, 1000);
}

// Restore current market mode from localStorage
const savedMode = localStorage.getItem('priceAnalyticsCurrentMarketMode');
if (savedMode === '1') {
    isCurrentMarketMode = true;
    document.getElementById('currentMarketMode').checked = true;
}

// Start market prices refresh
startMarketPricesRefresh();

// Pause/resume market prices refresh based on page visibility
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden - stop refreshing to save resources
        if (marketPricesInterval) {
            clearInterval(marketPricesInterval);
            marketPricesInterval = null;
        }
    } else {
        // Page is visible - resume refreshing
        loadMarketPrices(); // Immediate refresh
        startMarketPricesRefresh();
    }
});

// Auto-refresh every 10 seconds (other stats)
setInterval(() => {
    loadTradingMode();
    loadBalance();
    loadStats();

    // Refresh active tab data
    if (window.spikeRecentTradesLoaded) loadRecentTrades();
    if (window.spikePositionsLoaded) loadPositions();
    if (window.spikeMissedLoaded) loadMissedOpportunities();
    if (window.spikeActivityLogLoaded) loadActivityLog();
}, 10000);

// Event listeners
document.getElementById('saveCryptoConfigBtn').addEventListener('click', saveCryptoConfig);
document.getElementById('saveBacktestConfigBtn').addEventListener('click', saveBacktestConfig);
document.getElementById('backtestBtn').addEventListener('click', runBacktest);
</script>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
