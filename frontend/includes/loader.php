<?php
declare(strict_types=1);

function loadAssets(string $page): void {
    $base = '/assets/';
    $root = dirname(__DIR__);

    $assets = [
        'global' => [
            'css' => ['base.css'],
            'js'  => ['api.js'],
        ],
        'dashboard' => [
            'css' => ['dashboard.css'],
            'js'  => ['dashboard.js'],
        ],
        'backtest' => [
            'css' => ['backtest.css'],
            'js'  => ['backtest.js'],
        ],
        'live-trading' => [
            'css' => ['live.css'],
            'js'  => ['live.js'],
        ],
        'settings' => [
            'css' => ['settings.css'],
            'js'  => [],
        ],
        'market' => [
            'css' => ['market.css'],
            'js'  => ['market.js'],
        ],
        'trader' => [
            'css' => ['trader.css'],
            'js'  => ['trader.js'],
        ],
        'trade' => [
            'css' => ['trade.css'],
            'js'  => ['trade.js'],
        ],
        'account' => [
            'css' => ['account.css'],
            'js'  => ['account.js'],
        ],
        'sim-progress' => [
            'css' => [],
            'js'  => [],
        ],
    ];

    $allAssets = $assets['global'];
    if (isset($assets[$page])) {
        $allAssets['css'] = array_merge($allAssets['css'], $assets[$page]['css'] ?? []);
        $allAssets['js']  = array_merge($allAssets['js'],  $assets[$page]['js']  ?? []);
    }

    foreach ($allAssets['css'] as $css) {
        $path = $root . '/assets/css/' . $css;
        $v = file_exists($path) ? filemtime($path) : time();
        echo "<link rel='stylesheet' href='{$base}css/{$css}?v={$v}'>\n";
    }
    foreach ($allAssets['js'] as $js) {
        $path = $root . '/assets/js/' . $js;
        $v = file_exists($path) ? filemtime($path) : time();
        echo "<script src='{$base}js/{$js}?v={$v}' defer></script>\n";
    }
}
?>
