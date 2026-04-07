<?php
$page  = 'live-trading';
$title = 'Live Trading';
require_once __DIR__ . '/../includes/header.php';
?>

<div class="page-header">
    <h1>Live Trading</h1>
    <p class="subtitle">Real-time copy-trading execution — coming soon</p>
</div>

<div class="card" style="max-width:600px;margin:40px auto;text-align:center;padding:48px 24px;">
    <div style="font-size:48px;margin-bottom:16px;">🚧</div>
    <h2 style="margin-bottom:12px;">Under Construction</h2>
    <p class="text-muted" style="line-height:1.7;">
        Live trading will allow you to automatically mirror whale trades in real time,
        based on your backtest-validated strategies.<br><br>
        Use the <a href="/pages/backtest.php" class="back-link">Backtest Lab</a> to fine-tune
        your strategy first.
    </p>
</div>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
