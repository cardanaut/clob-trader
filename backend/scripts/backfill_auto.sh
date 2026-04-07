#!/usr/bin/env bash
#
# backfill_auto.sh — Nightly safe auto-backfill
#
# Runs after autoscan_cron.sh (which updates autoscan JSON files).
# Guards against restarting the API mid-cycle by checking for open LIVE positions.
# Uses BACKFILL_SKIP_RESCAN=1 because autoscan_cron.sh already ran at 23:00 UTC.
#
# Crontab (daily at 00:10 UTC = 03:10 EAT, 70 min after autoscan):
#   10 0 * * * /var/www/jeer.currenciary.com/polychamp/backend/scripts/backfill_auto.sh >> /var/www/jeer.currenciary.com/polychamp/backend/logs/backfill_cron.log 2>&1

NODE=/home/adminweb/.nvm/versions/node/v24.10.0/bin/node
PM2=/home/adminweb/.nvm/versions/node/v24.10.0/bin/pm2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="/var/www/jeer.currenciary.com/polychamp/logs/t1000-state.json"
LOG_PREFIX="[$(date -u +%Y-%m-%dT%H:%M:%SZ)]"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$LOG_PREFIX Starting auto-backfill..."

# ── 1. Guard: check for open LIVE / LIVE_KALSHI positions ──────────────────────
if [ ! -f "$STATE_FILE" ]; then
  echo "$LOG_PREFIX WARNING: state file not found at $STATE_FILE — proceeding anyway"
else
  OPEN_COUNT=$($NODE -e "
    try {
      const s = JSON.parse(require('fs').readFileSync('$STATE_FILE', 'utf8'));
      let n = 0;
      for (const key of ['LIVE', 'LIVE_KALSHI']) {
        if (s[key]) n += (s[key].activityLog || []).filter(e => e.status === 'OPEN').length;
      }
      process.stdout.write(String(n));
    } catch(e) {
      process.stdout.write('0');
    }
  " 2>/dev/null)

  if [ "$OPEN_COUNT" -gt 0 ] 2>/dev/null; then
    echo "$LOG_PREFIX SKIPPED — $OPEN_COUNT open LIVE position(s) detected; will retry tomorrow"
    exit 0
  fi
  echo "$LOG_PREFIX Guard OK — no open LIVE positions ($OPEN_COUNT)"
fi

# ── 2. Run backfill (simulator already ran at 23:00 UTC) ──────────────────────
echo "$LOG_PREFIX Running backfill (BACKFILL_SKIP_RESCAN=1)..."
cd "$SCRIPT_DIR" || exit 1

BACKFILL_SKIP_RESCAN=1 $NODE backfill_t1000.js
EXIT_CODE=$?

LOG_PREFIX="[$(date -u +%Y-%m-%dT%H:%M:%SZ)]"

if [ $EXIT_CODE -ne 0 ]; then
  echo "$LOG_PREFIX ERROR: backfill_t1000.js exited with code $EXIT_CODE — skipping API restart"
  exit 1
fi

# ── 3. Restart API to load new state ──────────────────────────────────────────
echo "$LOG_PREFIX Backfill OK — restarting polychamp-api..."
$PM2 restart polychamp-api
RESTART_CODE=$?

LOG_PREFIX="[$(date -u +%Y-%m-%dT%H:%M:%SZ)]"

if [ $RESTART_CODE -eq 0 ]; then
  echo "$LOG_PREFIX polychamp-api restarted successfully"
else
  echo "$LOG_PREFIX WARNING: pm2 restart exited with code $RESTART_CODE"
fi

echo "$LOG_PREFIX Auto-backfill complete"
