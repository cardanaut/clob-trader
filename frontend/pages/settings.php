<?php
$page  = 'settings';
$title = 'Settings';
require_once __DIR__ . '/../includes/header.php';
?>

<div class="page-header">
    <h1>Settings</h1>
    <p class="subtitle">Collector and notification configuration — coming soon</p>
</div>

<div class="card" style="max-width:600px;margin:40px auto;text-align:center;padding:48px 24px;">
    <div style="font-size:48px;margin-bottom:16px;">⚙️</div>
    <h2 style="margin-bottom:12px;">Under Construction</h2>
    <p class="text-muted" style="line-height:1.7;">
        Settings will let you configure the minimum trade threshold, notification alerts,
        wallet watchlists, and collector parameters.<br><br>
        Current min trade: <strong>$2,000 USDC</strong> (set in <code>.env</code> → <code>MIN_TRADE_USD</code>).
    </p>
</div>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
