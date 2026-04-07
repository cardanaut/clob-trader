#!/usr/bin/env node
/**
 * Check HYBRID Mode Status
 * Quick verification that hybrid strategy is running correctly
 */

'use strict';

const config = require('./src/spike/config');
const clobApi = require('./src/spike/clob-api');
const { query } = require('./src/database/connection');

async function checkStatus() {
  console.log('\n' + '═'.repeat(80));
  console.log('🔍 HYBRID MODE STATUS CHECK');
  console.log('═'.repeat(80));

  // Check environment variable
  console.log('\n📋 Configuration:');
  console.log(`   HYBRID_MODE: ${config.HYBRID_MODE ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`   Min Trade Size: $${config.MIN_POSITION_SIZE_USD.toFixed(2)}`);

  if (!config.HYBRID_MODE) {
    console.log('\n⚠️  WARNING: HYBRID_MODE is not enabled!');
    console.log('   To enable: export SPIKE_HYBRID_MODE=true && pm2 restart polychamp-spike');
    console.log('\n═'.repeat(80) + '\n');
    process.exit(1);
  }

  // Check strategies
  console.log('\n🎯 Active Strategies:');
  for (const [strategyId, hybridConfig] of Object.entries(config.HYBRID_STRATEGIES)) {
    const stratConfig = config.STRATEGIES[strategyId];
    if (!stratConfig) {
      console.log(`   ❌ ${strategyId}: NOT FOUND IN CONFIG`);
      continue;
    }

    const status = hybridConfig.enabled ? '✅' : '❌';
    console.log(`   ${status} ${strategyId}`);
    console.log(`      └─ Position Size: ${hybridConfig.positionSizePct}%`);
    console.log(`      └─ ${hybridConfig.description}`);
  }

  // Check balance and calculate position sizes
  console.log('\n💰 Balance & Position Sizes:');
  try {
    clobApi.initializeLiveClient();
    const balanceInfo = await clobApi.getBalance();
    const balance = balanceInfo ? balanceInfo.liquid : 0;

    console.log(`   Current Balance: $${balance.toFixed(2)} USDC`);
    console.log('');

    for (const [strategyId, hybridConfig] of Object.entries(config.HYBRID_STRATEGIES)) {
      if (!hybridConfig.enabled) continue;

      const positionSize = Math.max(
        Math.round(balance * hybridConfig.positionSizePct / 100 * 100) / 100,
        config.MIN_POSITION_SIZE_USD
      );

      const meetsMin = (balance * hybridConfig.positionSizePct / 100) >= config.MIN_POSITION_SIZE_USD * 0.99;
      const status = meetsMin ? '✅' : '⚠️ ';

      console.log(`   ${status} ${strategyId}: $${positionSize.toFixed(2)}/trade`);
      if (!meetsMin) {
        console.log(`      └─ Warning: Below minimum (will be skipped)`);
      }
    }

  } catch (err) {
    console.log(`   ⚠️  Could not fetch balance: ${err.message}`);
  }

  // Check recent trades
  console.log('\n📊 Recent Trade Activity (Last 24 Hours):');
  try {
    const tradeResult = await query(`
      SELECT
        notes,
        position_size_usd,
        outcome,
        timestamp
      FROM spike_trades_live
      WHERE timestamp > NOW() - INTERVAL '24 hours'
        AND notes LIKE '%[T123-%'
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    if (tradeResult.rows.length === 0) {
      console.log('   No trades in last 24 hours');
    } else {
      console.log(`   Found ${tradeResult.rows.length} trade(s):\n`);

      const baselineTrades = tradeResult.rows.filter(r => r.notes.includes('[T123-1MIN]'));
      const hlTrades = tradeResult.rows.filter(r => r.notes.includes('[T123-1MIN-HL]'));

      console.log(`   T123-1MIN:    ${baselineTrades.length} trades`);
      console.log(`   T123-1MIN-HL: ${hlTrades.length} trades`);

      tradeResult.rows.slice(0, 5).forEach((trade, i) => {
        const strategyMatch = trade.notes.match(/\[(T123-[^\]]+)\]/);
        const strategy = strategyMatch ? strategyMatch[1] : 'Unknown';
        const time = new Date(trade.timestamp).toLocaleTimeString();
        console.log(`   ${i + 1}. [${time}] ${strategy} - $${parseFloat(trade.position_size_usd).toFixed(2)} - ${trade.outcome || 'PENDING'}`);
      });
    }
  } catch (err) {
    console.log(`   ⚠️  Could not fetch trades: ${err.message}`);
  }

  // Check activity log
  console.log('\n📝 Recent Signals (Last 1 Hour):');
  try {
    const activityResult = await query(`
      SELECT
        event_type,
        message,
        created_at
      FROM spike_activity_log
      WHERE created_at > NOW() - INTERVAL '1 hour'
        AND event_type IN ('signal_detected', 'trade_executed', 'trade_skipped')
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (activityResult.rows.length === 0) {
      console.log('   No signals in last hour (this is normal - signals are rare)');
    } else {
      console.log(`   Found ${activityResult.rows.length} event(s):\n`);

      activityResult.rows.forEach((log, i) => {
        const time = new Date(log.created_at).toLocaleTimeString();
        const eventIcon = log.event_type === 'trade_executed' ? '✅' :
                         log.event_type === 'signal_detected' ? '🔔' : '⚠️';
        console.log(`   ${eventIcon} [${time}] ${log.message.substring(0, 70)}`);
      });
    }
  } catch (err) {
    console.log(`   ⚠️  Could not fetch activity log: ${err.message}`);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('💡 RECOMMENDATIONS');
  console.log('═'.repeat(80));

  try {
    clobApi.initializeLiveClient();
    const balanceInfo = await clobApi.getBalance();
    const balance = balanceInfo ? balanceInfo.liquid : 0;

    if (balance < 50) {
      console.log('\n⚠️  LOW BALANCE');
      console.log('   Consider adding more funds for better capital deployment');
      console.log('   Recommended: $200+ for optimal hybrid operation');
    } else if (balance < 200) {
      console.log('\n✅ GOOD BALANCE');
      console.log('   Sufficient for hybrid mode operation');
      console.log('   Optional: Add more funds to increase position sizes');
    } else {
      console.log('\n✅ EXCELLENT BALANCE');
      console.log('   Optimal for hybrid mode operation');
      console.log('   Position sizes will scale with balance');
    }
  } catch (err) {
    // Ignore balance check errors
  }

  console.log('\n📈 Monitoring Commands:');
  console.log('   pm2 logs polychamp-spike              # Live logs');
  console.log('   node check-hybrid-status.js           # Run this check again');
  console.log('   node enable-hybrid-mode.js            # View configuration');

  console.log('\n' + '═'.repeat(80) + '\n');
  process.exit(0);
}

checkStatus().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
