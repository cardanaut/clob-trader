#!/usr/bin/env bash
#
# sim_snapshot.sh — Append one simulator JSON snapshot to sim_snapshots.jsonl
#
# Crontab (run every 30 minutes):
#   */30 * * * * /var/www/jeer.currenciary.com/polychamp/backend/scripts/sim_snapshot.sh >> /var/www/jeer.currenciary.com/polychamp/backend/logs/sim_snapshot_cron.log 2>&1
#
# Params: edit PARAMS below to match your preferred simulator settings.
# The file backend/logs/sim_snapshots.jsonl grows ~200 bytes/30min (~3.5 MB/year).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
JSONL_FILE="$BACKEND_DIR/logs/sim_snapshots.jsonl"

# Full path to node (required for cron's restricted PATH)
NODE=/home/adminweb/.nvm/versions/node/v24.10.0/bin/node

# Simulator params — adjust to match what you want to track consistently
PARAMS="-th 0.24 -mn 5 -mx 90 -bl 1000"

cd "$SCRIPT_DIR" || exit 1

JSON=$($NODE simulate_t1000_v2.js $PARAMS --json 2>/dev/null)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: simulator exited with code $EXIT_CODE"
  exit 1
fi

if [ -z "$JSON" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: empty output from simulator"
  exit 1
fi

# Validate JSON before appending
echo "$JSON" | $NODE -e "
  let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
    try { JSON.parse(s); process.exit(0); } catch(e) { process.exit(1); }
  });
" 2>/dev/null || {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: invalid JSON — not appended"
  exit 1
}

echo "$JSON" >> "$JSONL_FILE"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] OK — snapshot appended to sim_snapshots.jsonl"
