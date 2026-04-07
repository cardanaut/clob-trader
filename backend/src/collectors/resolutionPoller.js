/**
 * PolyChamp Resolution Poller
 * Checks unresolved markets and updates them when Polymarket resolves them.
 * Runs every 30 minutes via PM2 cron.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const logger = require('../utils/logger');
const { getUnresolvedMarkets, resolveMarket } = require('../database/queries');
const { getMarketResolution } = require('../utils/polymarketClient');

const BATCH_SIZE = 10;
const DELAY_BETWEEN_REQUESTS_MS = 1500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollResolutions() {
  logger.info('Resolution poller started');

  const markets = await getUnresolvedMarkets();
  logger.info(`Checking ${markets.length} unresolved markets`);

  let resolved = 0;

  for (let i = 0; i < markets.length; i += BATCH_SIZE) {
    const batch = markets.slice(i, i + BATCH_SIZE);

    for (const market of batch) {
      try {
        const data = await getMarketResolution(market.id);
        if (!data || !data.resolved) continue;

        await resolveMarket(market.id, data.winningOutcome, data.resolvedAt, null);
        logger.info('Market resolved', {
          id: market.id,
          question: market.question.substring(0, 60),
          winner: data.winningOutcome,
        });
        resolved++;
      } catch (err) {
        logger.warn('Failed to check market resolution', { id: market.id, error: err.message });
      }

      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  logger.info(`Resolution polling complete`, { checked: markets.length, resolved });
  process.exit(0);
}

pollResolutions().catch(err => {
  logger.error('Resolution poller fatal error', { error: err.message });
  process.exit(1);
});
