#!/usr/bin/env bash
#
# autoscan_cron.sh — Nightly full-dataset autoscan + DEEPSCAN sweep
#
# Phase 1: simulate_combined.js -nf -as  → autoscan_v2.json / autoscan_kalshi.json
# Phase 2: simulate_combined.js -ds-fine → deepscan_v2.json (greedy filter optimisation)
# Phase 3: NTFY notification with DEEPSCAN result summary
#
# Crontab (daily at 02:00 EAT = 23:00 UTC):
#   0 23 * * * /var/www/jeer.currenciary.com/polychamp/backend/scripts/autoscan_cron.sh >> /var/www/jeer.currenciary.com/polychamp/backend/logs/autoscan_cron.log 2>&1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Full path to node (required for cron's restricted PATH)
NODE=/home/adminweb/.nvm/versions/node/v24.10.0/bin/node

cd "$SCRIPT_DIR" || exit 1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting nightly autoscan..."

# Read LIVE settings from engine state so the sweep uses the same config
# (t1Mode, minPrice, CB, maxPositions) that the engine actually trades with.
STATE_FILE="/var/www/jeer.currenciary.com/polychamp/logs/t1000-state.json"
LIVE_ARGS=$($NODE -e "
  try {
    const s = JSON.parse(require('fs').readFileSync('$STATE_FILE', 'utf8'));
    const live = s.LIVE || {};
    const a = [];
    if (live.t1Mode) a.push('-t1');
    const mn = Math.round((live.minPrice5m || 0.05) * 100);
    if (mn !== 5) a.push('-mn', mn);
    if (live.circuitBreakerEnabled && live.circuitBreakerMins > 0) a.push('-cb', live.circuitBreakerMins);
    const maxPos = live.maxPositions || 4;
    if (maxPos !== 4) a.push('-maxpos', maxPos);
    if (live.drawdownLimitEnabled && live.drawdownLimitMaxLosses > 0 && live.drawdownLimitWindowMins > 0) {
      const dlP = live.drawdownLimitPauseMins > 0 ? ',' + live.drawdownLimitPauseMins : '';
      a.push('-dl', live.drawdownLimitMaxLosses + ',' + live.drawdownLimitWindowMins + dlP);
    }
    process.stdout.write(a.join(' '));
  } catch(e) {}" 2>/dev/null)

if [ -n "$LIVE_ARGS" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] LIVE args: $LIVE_ARGS"
fi

# shellcheck disable=SC2086
$NODE --stack-size=65536 simulate_combined.js -nf -as $LIVE_ARGS
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Autoscan complete — autoscan_v2.json and autoscan_kalshi.json updated"
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: autoscan exited with code $EXIT_CODE"
  exit 1
fi

# ── Phase 2: DEEPSCAN (fine mode) ─────────────────────────────────────────────
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting DEEPSCAN fine sweep..."

# shellcheck disable=SC2086
$NODE --stack-size=65536 simulate_combined.js -ds-fine $LIVE_ARGS
DS_EXIT=$?

DEEPSCAN_FILE="$(dirname "$SCRIPT_DIR")/logs/deepscan_v2.json"

if [ $DS_EXIT -eq 0 ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] DEEPSCAN complete — deepscan_v2.json updated"
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: DEEPSCAN exited with code $DS_EXIT"
fi

# ── Phase 3: NTFY notification ────────────────────────────────────────────────
if [ $DS_EXIT -eq 0 ] && [ -f "$DEEPSCAN_FILE" ]; then
  $NODE -e "
    try {
      const https = require('https');
      const d = JSON.parse(require('fs').readFileSync('$DEEPSCAN_FILE', 'utf8'));
      const pct  = d.final?.pnlImprovement != null ? '+' + d.final.pnlImprovement.toFixed(1) + '%' : '?';
      const best = d.final ? '5m: ' + d.final.best5m + ' · 15m: ' + d.final.best15m : '';
      const steps = (d.steps || []).filter(s => s.winner != null).map(s => s.label + ': ' + s.display).join(' · ') || 'none';
      const topic = process.env.NTFY_TOPIC || 'jfat1000';
      const body = JSON.stringify({
        topic, priority: 3,
        title: 'PolyChamp — Nightly DEEPSCAN',
        message: 'PnL ' + pct + ' | ' + best + '\n' + steps,
      });
      const req = https.request({ hostname: 'ntfy.sh', method: 'POST', path: '/',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
      req.on('error', () => {});
      req.write(body); req.end();
      console.log('[ntfy] sent:', body);
    } catch(e) { console.error('[ntfy] error:', e.message); }
  " 2>/dev/null
fi
