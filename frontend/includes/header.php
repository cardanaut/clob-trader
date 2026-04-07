<?php
$page = $page ?? 'dashboard';
$title = $title ?? 'PolyChamp';
require_once __DIR__ . '/loader.php';

// Inject API auth token for use by frontend JS (Basic Auth)
// PHP-FPM doesn't inherit Node's .env, so parse the file directly.
$_apiPass = getenv('API_PASSWORD') ?: '';
if (!$_apiPass) {
    $_envFile = __DIR__ . '/../../backend/.env';
    if (is_readable($_envFile)) {
        foreach (file($_envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $_line) {
            if (str_starts_with(trim($_line), '#')) continue;
            if (str_contains($_line, '=')) {
                [$_k, $_v] = explode('=', $_line, 2);
                if (trim($_k) === 'API_PASSWORD') { $_apiPass = trim($_v); break; }
            }
        }
    }
}
$_apiAuth = $_apiPass ? base64_encode('admin:' . $_apiPass) : '';
?>
<!DOCTYPE html>
<html lang="en"<?php if ($_apiAuth): ?> data-api-key="<?= htmlspecialchars($_apiAuth, ENT_QUOTES) ?>"<?php endif; ?>>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($title) ?> — PolyChamp</title>
    <link rel="icon" href="<?= BASE_PATH ?>/assets/img/favicon.svg" type="image/svg+xml">
    <?php if ($_apiAuth): ?>
    <meta name="x-api-auth" content="<?= htmlspecialchars($_apiAuth, ENT_QUOTES) ?>">
    <script>window._POLYCHAMP_AUTH='Basic <?= $_apiAuth ?>';</script>
    <?php endif; ?>
    <?php loadAssets($page); ?>
</head>
<body>
<nav class="navbar">
    <a href="<?= BASE_PATH ?>/pages/t1000-trading.php" class="nav-brand">CLOB Trader</a>
    <ul class="nav-links">
        <li><a href="<?= BASE_PATH ?>/pages/t1000-trading.php" <?= $page === 't1000-trading' ? 'class="active"' : '' ?>>T1000</a></li>
        <li style="margin-left:auto"><a href="<?= BASE_PATH ?>/pages/simulator-v2.php" <?= $page === 'simulator-v2' ? 'class="active"' : '' ?>>Simulator</a></li>
    </ul>
    <div class="nav-status" id="systemStatus">
        <span class="status-dot" id="statusDot"></span>
        <span id="statusText">Checking...</span>
    </div>
</nav>
<main class="container">
