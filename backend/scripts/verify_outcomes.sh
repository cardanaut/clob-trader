#!/usr/bin/env bash
# verify_outcomes.sh — Every-15-min cron wrapper for verify_outcomes.js
#
# Cron entry:
#   8,23,38,53 * * * * /var/www/jeer.currenciary.com/polychamp/backend/scripts/verify_outcomes.sh >> /var/www/jeer.currenciary.com/polychamp/backend/logs/verify_outcomes_cron.log 2>&1

set -euo pipefail
NODE=/home/adminweb/.nvm/versions/node/v24.10.0/bin/node
cd /var/www/jeer.currenciary.com/polychamp/backend
exec "$NODE" scripts/verify_outcomes.js "$@"
