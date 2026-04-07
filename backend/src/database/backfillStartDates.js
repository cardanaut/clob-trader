/**
 * Backfill start_date for all markets in the DB using the Gamma API.
 * Run once: node src/database/backfillStartDates.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { query } = require('./connection');
const { getMarket } = require('../utils/polymarketClient');
const logger = require('../utils/logger');

const BATCH = 5;
const DELAY = 600; // ms between requests

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const res = await query(`SELECT id, question FROM markets WHERE start_date IS NULL ORDER BY id`);
  const markets = res.rows;
  logger.info(`Backfilling start_date for ${markets.length} markets`);

  let updated = 0;
  for (let i = 0; i < markets.length; i += BATCH) {
    const batch = markets.slice(i, i + BATCH);
    await Promise.all(batch.map(async m => {
      try {
        const data = await getMarket(m.id);
        if (!data) return;
        const startDate = data.startDate || data.startDateIso || data.createdAt || null;
        if (!startDate) return;
        await query(`UPDATE markets SET start_date = $1 WHERE id = $2`, [startDate, m.id]);
        updated++;
        logger.info(`Updated ${m.id.slice(0, 12)}… → ${startDate}`);
      } catch (err) {
        logger.warn(`Failed ${m.id}`, { error: err.message });
      }
    }));
    await sleep(DELAY);
  }

  logger.info(`Done. Updated ${updated} / ${markets.length} markets.`);
  process.exit(0);
}

run().catch(err => { logger.error('Fatal', { error: err.message }); process.exit(1); });
