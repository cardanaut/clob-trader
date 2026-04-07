<?php
$page  = 'sim-progress';
$title = 'Sim Progress';
require_once __DIR__ . '/../includes/header.php';

// ── Read JSONL snapshots (last 1440 entries = 30 days at 30-min frequency) ────
$allowed_dir = realpath(__DIR__ . '/../../backend/logs');
$jsonl_file  = $allowed_dir . '/sim_snapshots.jsonl';

$snapshots = [];
if ($allowed_dir !== false
    && file_exists($jsonl_file)
    && is_readable($jsonl_file)
    && strpos(realpath($jsonl_file), $allowed_dir) === 0
) {
    $lines = file($jsonl_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach (array_slice($lines, -1440) as $line) {
        $decoded = json_decode($line, true);
        if (is_array($decoded) && isset($decoded['ts'], $decoded['unified'])) {
            $snapshots[] = $decoded;
        }
    }
}

// JSON_HEX_TAG/AMP/APOS/QUOT prevents XSS even if file is tampered
$json_data = json_encode($snapshots, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

// Latest snapshot stats for header cards
$latest = !empty($snapshots) ? end($snapshots) : null;
$uni    = $latest['unified'] ?? [];
$b5     = $latest['best5m']  ?? [];
$b15    = $latest['best15m'] ?? [];
?>

<style>
/* ── Page layout ──────────────────────────────────────────────────────────── */
.sim-page { padding: 20px 0; }
.sim-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 20px;
}
.sim-card-title { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
.sim-card-sub   { font-size: 12px; color: var(--text-muted); margin-bottom: 16px; }

/* ── Stat chips ───────────────────────────────────────────────────────────── */
.stats-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.stat-chip {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 14px;
    min-width: 110px;
}
.stat-chip .s-label { font-size: 11px; color: var(--text-muted); }
.stat-chip .s-value { font-size: 15px; font-weight: 600; margin-top: 2px; }
.s-pos { color: var(--green); }
.s-neg { color: var(--red);   }

/* ── Chart wrapper ────────────────────────────────────────────────────────── */
.chart-wrap { position: relative; height: 380px; }

/* ── Detail panel ─────────────────────────────────────────────────────────── */
#detail-panel {
    margin-top: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
}
.dp-ts {
    padding: 7px 14px;
    background: var(--bg);
    font-size: 11px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
}
.dp-cols {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
}
.dp-col {
    padding: 12px 14px;
    border-right: 1px solid var(--border);
    font-size: 12px;
    line-height: 1.8;
}
.dp-col:last-child { border-right: none; }
.dp-col-head {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
}
.dp-head-unified  { color: #58a6ff; }
.dp-head-5m       { color: #3fb950; }
.dp-head-15m      { color: #d29922; }
.dp-row { display: flex; justify-content: space-between; gap: 8px; }
.dp-label { color: var(--text-muted); }
.dp-value { color: var(--text); font-weight: 500; text-align: right; }
.dp-pos { color: var(--green); }
.dp-neg { color: var(--red);   }
.dp-dim { color: var(--text-muted); }

/* ── Empty state ──────────────────────────────────────────────────────────── */
.empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-muted);
}
.empty-state h3 { color: var(--text); margin-bottom: 10px; }
.empty-state code {
    display: inline-block;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    color: var(--accent);
    margin: 4px 0;
}
</style>

<div class="sim-page">

<?php if (empty($snapshots)): ?>
<div class="sim-card">
    <div class="empty-state">
        <h3>No snapshots yet</h3>
        <p style="margin-bottom:14px">Run the snapshot script manually or via cron to start collecting data.</p>
        <p><code>bash backend/scripts/sim_snapshot.sh</code></p>
        <p style="margin-top:10px;font-size:11px;color:var(--text-muted)">
            Cron (every hour):<br>
            <code>0 * * * * /var/www/.../backend/scripts/sim_snapshot.sh >> .../logs/sim_snapshot_cron.log 2&gt;&amp;1</code>
        </p>
    </div>
</div>

<?php else: ?>

<!-- ── Stat chips ─────────────────────────────────────────────────────────── -->
<div class="stats-row">
    <?php
    $pnl     = $uni['pnl']    ?? 0;
    $pnlPct  = $uni['pnlPct'] ?? 0;
    $pnlSign = $pnl >= 0 ? '+' : '';
    $pnlCls  = $pnl >= 0 ? 's-pos' : 's-neg';
    ?>
    <div class="stat-chip">
        <div class="s-label">Unified PnL</div>
        <div class="s-value <?= $pnlCls ?>">
            <?= $pnlSign ?>$<?= number_format(abs($pnl), 2) ?>
        </div>
    </div>
    <div class="stat-chip">
        <div class="s-label">PnL %</div>
        <div class="s-value <?= $pnlCls ?>"><?= $pnlSign ?><?= number_format(abs($pnlPct), 1) ?>%</div>
    </div>
    <div class="stat-chip">
        <div class="s-label">Win Rate</div>
        <div class="s-value"><?= number_format($uni['wr'] ?? 0, 1) ?>%</div>
    </div>
    <div class="stat-chip">
        <div class="s-label">Trades</div>
        <div class="s-value"><?= (int)($uni['trades5m'] ?? 0) + (int)($uni['trades15m'] ?? 0) ?></div>
    </div>
    <div class="stat-chip">
        <div class="s-label">Best 5-MIN</div>
        <div class="s-value">C<?= htmlspecialchars((string)($b5['period'] ?? '—')) ?></div>
    </div>
    <div class="stat-chip">
        <div class="s-label">Best 15-MIN</div>
        <div class="s-value">C<?= htmlspecialchars((string)($b15['period'] ?? '—')) ?></div>
    </div>
    <div class="stat-chip">
        <div class="s-label">Snapshots</div>
        <div class="s-value"><?= count($snapshots) ?></div>
    </div>
</div>

<!-- ── Chart card ─────────────────────────────────────────────────────────── -->
<div class="sim-card">
    <div class="sim-card-title">Revenue Progression</div>
    <div class="sim-card-sub">Hover a point to inspect its details below</div>
    <div class="chart-wrap">
        <canvas id="simChart"></canvas>
    </div>

    <!-- Detail panel — pre-filled with latest, updates on hover -->
    <div id="detail-panel">
        <div class="dp-ts" id="dp-ts">Latest snapshot</div>
        <div class="dp-cols">
            <div class="dp-col" id="dp-unified"></div>
            <div class="dp-col" id="dp-5m"></div>
            <div class="dp-col" id="dp-15m"></div>
        </div>
    </div>
</div>

<?php endif; ?>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"
        crossorigin="anonymous"
        referrerpolicy="no-referrer"></script>
<script>
(function () {
    'use strict';
    const DATA = <?= $json_data ?>;
    if (!DATA.length) return;

    // ── Series data ──────────────────────────────────────────────────────────
    const labels     = DATA.map(d => {
        const dt = new Date(d.ts);
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
             + ' ' + String(dt.getUTCHours()).padStart(2, '0') + ':'
             + String(dt.getUTCMinutes()).padStart(2, '0');
    });
    const unifiedPnl = DATA.map(d => d.unified?.pnl  ?? null);
    const best5mPnl  = DATA.map(d => d.best5m?.pnl   ?? null);
    const best15mPnl = DATA.map(d => d.best15m?.pnl  ?? null);

    // ── Detail panel helpers ─────────────────────────────────────────────────
    const elTs       = document.getElementById('dp-ts');
    const elUnified  = document.getElementById('dp-unified');
    const el5m       = document.getElementById('dp-5m');
    const el15m      = document.getElementById('dp-15m');

    function fmtPnl(pnl, startBal) {
        if (pnl == null) return '<span class="dp-dim">—</span>';
        const sign = pnl >= 0 ? '+' : '';
        const cls  = pnl >= 0 ? 'dp-pos' : 'dp-neg';
        const pct  = startBal ? (pnl / startBal * 100).toFixed(1) : '?';
        return `<span class="${cls}">${sign}$${Math.abs(pnl).toFixed(2)} (${sign}${pct}%)</span>`;
    }

    function row(label, value) {
        return `<div class="dp-row"><span class="dp-label">${label}</span><span class="dp-value">${value}</span></div>`;
    }

    function renderPanel(d) {
        if (!d) return;
        const u   = d.unified  || {};
        const b5  = d.best5m   || {};
        const b15 = d.best15m  || {};
        const ts  = new Date(d.ts);
        const tsStr = ts.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                    + ' — ' + String(ts.getUTCHours()).padStart(2, '0') + ':'
                    + String(ts.getUTCMinutes()).padStart(2, '0') + ' UTC';

        elTs.textContent = tsStr;

        // Unified column
        elUnified.innerHTML =
            `<div class="dp-col-head dp-head-unified">UNIFIED</div>` +
            row('PnL',    fmtPnl(u.pnl, d.startBal)) +
            row('Final',  `$${(u.finalBal ?? 0).toLocaleString('en-US', {maximumFractionDigits:0})}`) +
            row('W / L',  `<span class="dp-pos">${u.wins ?? 0}</span> / <span class="dp-neg">${u.losses ?? 0}</span>`) +
            row('Win Rate', `${(u.wr ?? 0).toFixed(1)}%`) +
            row('Trades', `${u.trades5m ?? 0} × 5m + ${u.trades15m ?? 0} × 15m`) +
            row('5-MIN',  b5.period  ? `<span style="color:#3fb950">C${b5.period}</span>`  : '<span class="dp-dim">—</span>') +
            row('15-MIN', b15.period ? `<span style="color:#d29922">C${b15.period}</span>` : '<span class="dp-dim">—</span>') +
            (u.noPm ? row('NoPM', `<span style="color:var(--yellow)">${u.noPm}</span>`) : '');

        // Best 5-MIN column
        el5m.innerHTML = b5.period
            ? `<div class="dp-col-head dp-head-5m">BEST 5-MIN &rarr; C${b5.period}</div>` +
              row('PnL',      fmtPnl(b5.pnl, d.startBal)) +
              row('Final',    `$${(b5.finalBal ?? 0).toLocaleString('en-US', {maximumFractionDigits:0})}`) +
              row('W / L',    `<span class="dp-pos">${b5.wins ?? 0}</span> / <span class="dp-neg">${b5.losses ?? 0}</span>`) +
              row('Win Rate', `${(b5.wr ?? 0).toFixed(1)}%`) +
              row('Spike &ge;', `${(b5.th ?? 0).toFixed(2)}%`) +
              row('Entry',    `${b5.mn ?? 0}&cent;&ndash;${b5.mx ?? 0}&cent;`) +
              row('Cap',      `$${b5.cap ?? 150}`) +
              (b5.noPm ? row('NoPM', `<span style="color:var(--yellow)">${b5.noPm}</span>`) : '')
            : `<div class="dp-col-head dp-head-5m">BEST 5-MIN</div><span class="dp-dim">No data</span>`;

        // Best 15-MIN column
        el15m.innerHTML = b15.period
            ? `<div class="dp-col-head dp-head-15m">BEST 15-MIN &rarr; C${b15.period}</div>` +
              row('PnL',      fmtPnl(b15.pnl, d.startBal)) +
              row('Final',    `$${(b15.finalBal ?? 0).toLocaleString('en-US', {maximumFractionDigits:0})}`) +
              row('W / L',    `<span class="dp-pos">${b15.wins ?? 0}</span> / <span class="dp-neg">${b15.losses ?? 0}</span>`) +
              row('Win Rate', `${(b15.wr ?? 0).toFixed(1)}%`) +
              row('Spike &ge;', `${(b15.th ?? 0).toFixed(2)}%`) +
              row('Entry',    `${b15.mn ?? 0}&cent;&ndash;${b15.mx ?? 0}&cent;`) +
              row('Cap',      `$${b15.cap ?? 500}`) +
              (b15.noPm ? row('NoPM', `<span style="color:var(--yellow)">${b15.noPm}</span>`) : '')
            : `<div class="dp-col-head dp-head-15m">BEST 15-MIN</div><span class="dp-dim">No data</span>`;
    }

    // Pre-fill with latest snapshot
    renderPanel(DATA[DATA.length - 1]);

    // ── Chart ────────────────────────────────────────────────────────────────
    let lastIdx = -1;
    const canvas = document.getElementById('simChart');
    canvas.addEventListener('mouseleave', () => { lastIdx = -1; renderPanel(DATA[DATA.length - 1]); });

    new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label          : 'Unified',
                    data           : unifiedPnl,
                    borderColor    : '#58a6ff',
                    backgroundColor: 'rgba(88,166,255,0.07)',
                    borderWidth    : 2.5,
                    pointRadius    : DATA.length > 48 ? 0 : 3,
                    pointHoverRadius: 5,
                    fill           : true,
                    tension        : 0.35,
                },
                {
                    label          : 'Best 5-MIN',
                    data           : best5mPnl,
                    borderColor    : '#3fb950',
                    backgroundColor: 'transparent',
                    borderWidth    : 1.5,
                    borderDash     : [5, 4],
                    pointRadius    : 0,
                    pointHoverRadius: 4,
                    tension        : 0.35,
                },
                {
                    label          : 'Best 15-MIN',
                    data           : best15mPnl,
                    borderColor    : '#d29922',
                    backgroundColor: 'transparent',
                    borderWidth    : 1.5,
                    borderDash     : [5, 4],
                    pointRadius    : 0,
                    pointHoverRadius: 4,
                    tension        : 0.35,
                },
            ],
        },
        options: {
            responsive       : true,
            maintainAspectRatio: false,
            interaction      : { mode: 'index', intersect: false },
            onHover(evt, activeEls) {
                if (!activeEls.length) return;
                const idx = activeEls[0].index;
                if (idx === lastIdx) return;
                lastIdx = idx;
                renderPanel(DATA[idx]);
            },
            plugins: {
                legend : { labels: { color: '#7d8590', font: { size: 12 }, boxWidth: 24 } },
                tooltip: { enabled: false },
            },
            scales: {
                x: {
                    ticks: {
                        color        : '#7d8590',
                        font         : { size: 11 },
                        maxTicksLimit: 10,
                        maxRotation  : 0,
                    },
                    grid: { color: 'rgba(48,54,61,0.4)' },
                },
                y: {
                    ticks: {
                        color   : '#7d8590',
                        font    : { size: 11 },
                        callback: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0),
                    },
                    grid : { color: 'rgba(48,54,61,0.4)' },
                    title: { display: true, text: 'PnL ($)', color: '#7d8590', font: { size: 11 } },
                },
            },
        },
    });
})();
</script>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
