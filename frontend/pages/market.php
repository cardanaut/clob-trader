<?php
$page  = 'market';
$title = 'Market';
require_once __DIR__ . '/../includes/header.php';
$marketId = htmlspecialchars($_GET['id'] ?? '');
?>

<div class="page-header">
    <a href="/pages/dashboard.php" class="back-link">&larr; Dashboard</a>
    <h1 id="marketTitle">Loading market...</h1>
    <div class="market-meta" id="marketMeta"></div>
</div>

<!-- Market stats -->
<div class="stats-bar" id="marketStats">
    <div class="stat-card">
        <div class="stat-value" id="statVolume">—</div>
        <div class="stat-label">Total Volume</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" id="statTrades">—</div>
        <div class="stat-label">Whale Trades</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" id="statYesPct">—</div>
        <div class="stat-label">YES Volume %</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" id="statExpiry">—</div>
        <div class="stat-label">Expires</div>
    </div>
</div>

<!-- YES vs NO bar -->
<div class="card" id="yesNoCard" style="display:none">
    <div class="card-header"><h2>YES vs NO Volume</h2></div>
    <div style="padding: 20px 24px;">
        <div class="yes-no-bar">
            <div class="yes-fill" id="yesFill" style="width:50%">
                <span id="yesLabel">YES 50%</span>
            </div>
            <div class="no-fill" id="noFill" style="width:50%">
                <span id="noLabel">NO 50%</span>
            </div>
        </div>
    </div>
</div>

<!-- Trade history -->
<div class="card">
    <div class="card-header"><h2>Trade History</h2></div>
    <div class="table-wrap">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Trader</th>
                    <th>Outcome</th>
                    <th>Price</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody id="tradesBody">
                <tr><td colspan="5" class="loading">Loading...</td></tr>
            </tbody>
        </table>
    </div>
</div>

<script>
const MARKET_ID = <?= json_encode($marketId) ?>;
</script>
<?php require_once __DIR__ . '/../includes/footer.php'; ?>
