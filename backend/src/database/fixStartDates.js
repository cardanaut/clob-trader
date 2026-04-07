/**
 * Fix start_date for all markets by re-fetching from Gamma API.
 * This corrects markets where start_date was set to creation time instead of event start time.
 * Run once: node src/database/fixStartDates.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { query } = require('./connection');
const { getMarket } = require('../utils/polymarketClient');
const logger = require('../utils/logger');

const BATCH = 5;
const DELAY = 600; // ms between requests

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const res = await query(`SELECT id, question, start_date FROM markets ORDER BY resolution_date DESC NULLS LAST`);
  const markets = res.rows;
  logger.info(`Fixing start_date for ${markets.length} markets`);

  let updated = 0;
  let skipped = 0;
  for (let i = 0; i < markets.length; i += BATCH) {
    const batch = markets.slice(i, i + BATCH);
    await Promise.all(batch.map(async m => {
      try {
        const data = await getMarket(m.id);
        if (!data) {
          skipped++;
          return;
        }
        // getMarket now returns eventStartTime prioritized over creation startDate
        const newStartDate = data.startDate || null;
        if (!newStartDate) {
          skipped++;
          return;
        }

        // Only update if different
        const oldStartDate = m.start_date ? new Date(m.start_date).toISOString() : null;
        const newStartDateISO = new Date(newStartDate).toISOString();

        if (oldStartDate !== newStartDateISO) {
          await query(`UPDATE markets SET start_date = $1 WHERE id = $2`, [newStartDate, m.id]);
          updated++;
          const oldStr = oldStartDate ? oldStartDate.slice(0, 19) : 'NULL';
          const newStr = newStartDateISO.slice(0, 19);
          logger.info(`${m.id.slice(0, 12)}… ${oldStr} → ${newStr} | ${m.question.slice(0, 50)}`);
        } else {
          skipped++;
        }
      } catch (err) {
        logger.warn(`Failed ${m.id}`, { error: err.message });
        skipped++;
      }
    }));
    await sleep(DELAY);

    if ((i + BATCH) % 50 === 0) {
      logger.info(`Progress: ${i + BATCH}/${markets.length} (${updated} updated, ${skipped} skipped)`);
    }
  }

  logger.info(`Done. Updated ${updated}, skipped ${skipped}, total ${markets.length}.`);
  process.exit(0);
}

run().catch(err => { logger.error('Fatal', { error: err.message }); process.exit(1); });
