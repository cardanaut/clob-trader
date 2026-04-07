/**
 * Normalize winning_outcome in the markets table.
 * The Gamma API returns raw outcome names ("UP", "DOWN", "FURIA", etc.).
 * Our trades table always uses "YES" (index 0) / "NO" (index 1).
 * This script re-fetches each resolved market from the Gamma API to determine
 * which index won and stores the normalised "YES"/"NO" value.
 *
 * Run once: node src/database/normalizeWinningOutcomes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { query } = require('./connection');
const { getMarketResolution } = require('../utils/polymarketClient');
const logger = require('../utils/logger');

const DELAY = 400;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  // Find all resolved markets in the DB
  const res = await query(`
    SELECT id, question, winning_outcome FROM markets
    WHERE resolved = TRUE AND winning_outcome IS NOT NULL
    ORDER BY id
  `);
  const markets = res.rows;
  logger.info(`Normalising winning_outcome for ${markets.length} resolved markets`);

  let updated = 0, skipped = 0, failed = 0;

  for (const m of markets) {
    // Already normalised
    if (m.winning_outcome === 'YES' || m.winning_outcome === 'NO') {
      skipped++;
      continue;
    }

    try {
      // getMarketResolution now returns YES/NO (after the fix to polymarketClient)
      const data = await getMarketResolution(m.id);
      if (!data || !data.winningOutcome) {
        logger.warn(`No resolution data for ${m.id}`);
        failed++;
      } else {
        await query(
          `UPDATE markets SET winning_outcome = $1 WHERE id = $2`,
          [data.winningOutcome, m.id]
        );
        logger.info(`${m.id.slice(0, 12)}… [${m.winning_outcome}] → [${data.winningOutcome}]`);
        updated++;
      }
    } catch (err) {
      logger.warn(`Failed ${m.id}`, { error: err.message });
      failed++;
    }

    await sleep(DELAY);
  }

  logger.info(`Done. Updated: ${updated}, Already normalised: ${skipped}, Failed: ${failed}`);
  process.exit(0);
}

run().catch(err => { logger.error('Fatal', { error: err.message }); process.exit(1); });
