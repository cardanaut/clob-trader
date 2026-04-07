#!/usr/bin/env node
/**
 * Backfill Market Outcomes for Existing Missed Opportunities
 * Updates missed_opportunities table with outcomes from resolved trades
 */

'use strict';

const { query } = require('../database/connection');
const gamma = require('./gamma-api');

async function backfillOutcomes() {
  console.log('========================================');
  console.log('BACKFILLING MISSED OPPORTUNITY OUTCOMES');
  console.log('========================================\n');

  try {
    // Find all missed opportunities without outcomes
    // (Markets that ended more than 2 minutes ago)
    const result = await query(`
      SELECT DISTINCT market_id, MAX(created_at) as latest_created
      FROM spike_missed_opportunities
      WHERE market_outcome IS NULL
      AND created_at < NOW() - INTERVAL '7 minutes'
      GROUP BY market_id
      ORDER BY latest_created DESC
      LIMIT 50
    `);

    const marketIds = result.rows.map(r => r.market_id);
    console.log(`Found ${marketIds.length} markets to backfill\n`);

    if (marketIds.length === 0) {
      console.log('✅ No missed opportunities need backfilling');
      return;
    }

    let updated = 0;
    for (const marketId of marketIds) {
      try {
        // Get outcome from Gamma API
        const outcome = await gamma.getMarketOutcome(marketId);

        if (outcome) {
          await query(`
            UPDATE spike_missed_opportunities
            SET market_outcome = $1
            WHERE market_id = $2 AND market_outcome IS NULL
          `, [outcome, marketId]);

          updated++;
          console.log(`✅ Updated market ${marketId.slice(0, 16)}... → ${outcome}`);
        } else {
          console.log(`⚠️  Skipped market ${marketId.slice(0, 16)}... (not resolved)`);
        }
      } catch (err) {
        console.error(`❌ Error processing ${marketId.slice(0, 16)}...`, err.message);
      }
    }

    console.log('\n========================================');
    console.log(`✅ Backfill complete: ${updated}/${marketIds.length} updated`);
    console.log('========================================\n');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Backfill failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

backfillOutcomes();
