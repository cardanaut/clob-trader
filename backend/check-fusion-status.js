#!/usr/bin/env node
/**
 * Check T123-FUSION Mode Status
 * Quick verification that fusion strategy is running correctly
 */

'use strict';

const config = require('./src/spike/config');
const clobApi = require('./src/spike/clob-api');
const { query } = require('./src/database/connection');

async function checkStatus() {
  console.log('\n' + '═'.repeat(80));
  console.log('🔍 T123-FUSION STATUS CHECK');
  console.log('═'.repeat(80));

  // Check environment variable
  console.log('\n📋 Configuration:');
  console.log(`   T123-FUSION MODE: ${config.FUSION_MODE ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`   Min Trade Size: $${config.MIN_POSITION_SIZE_USD.toFixed(2)}`);

  if (!config.FUSION_MODE) {
    console.log('\n⚠️  WARNING: T123-FUSION is not enabled!');
    console.log('   To enable: export SPIKE_FUSION_MODE=true && pm2 restart polychamp-spike');
    console.log('   (Legacy: export SPIKE_HYBRID_MODE=true also works)');
    console.log('\n═'.repeat(80) + '\n');
    process.exit(1);
  }

  // Check strategies
  console.log('\n🎯 Active Strategy Tiers:');
  for (const [strategyId, fusionConfig] of Object.entries(config.FUSION_STRATEGIES)) {
    const stratConfig = config.STRATEGIES[strategyId];
    if (!stratConfig) {
      console.log(`   ❌ ${strategyId}: NOT FOUND IN CONFIG`);
      continue;
    }

    const status = fusionConfig.enabled ? '✅' : '❌';
    const tierBadge = fusionConfig.tier === 'QUALITY' ? '🏆' : '📊';
    console.log(`   ${status} ${tierBadge} ${fusionConfig.tier} - ${strategyId}`);
    console.log(`      └─ Position Size: ${fusionConfig.positionSizePct}%`);
    console.log(`      └─ ${fusionConfig.description}`);
  }

  // Check balance and calculate position sizes
  console.log('\n💰 Balance & Tiered Position Sizes:');
  try {
    clobApi.initializeLiveClient();
    const balanceInfo = await clobApi.getBalance();
    const balance = balanceInfo ? balanceInfo.liquid : 0;

    console.log(`   Current Balance: $${balance.toFixed(2)} USDC`);
    console.log('');

    for (const [strategyId, fusionConfig] of Object.entries(config.FUSION_STRATEGIES)) {
      if (!fusionConfig.enabled) continue;

      const positionSize = Math.max(
        Math.round(balance * fusionConfig.positionSizePct / 100 * 100) / 100,
        config.MIN_POSITION_SIZE_USD
      );

      const meetsMin = (balance * fusionConfig.positionSizePct / 100) >= config.MIN_POSITION_SIZE_USD * 0.99;
      const status = meetsMin ? '✅' : '⚠️ ';
      const tierIcon = fusionConfig.tier === 'QUALITY' ? '🏆' : '📊';

      console.log(`   ${status} ${tierIcon} ${fusionConfig.tier}: $${positionSize.toFixed(2)}/trade (${strategyId})`);
      if (!meetsMin) {
        console.log(`      └─ Warning: Below minimum (will be skipped)`);
      }
    }

  } catch (err) {
    console.log(`   ⚠️  Could not fetch balance: ${err.message}`);
  }

  // Check expected trade frequency
  console.log('\n📈 Expected Daily Performance:');
  console.log('   🏆 QUALITY Tier:  ~19 trades/day @ larger positions');
  console.log('   📊 VOLUME Tier:   ~6-16 trades/day @ smaller positions');
  console.log('   ──────────────────────────────────────────────────');
  console.log('   🎯 TOTAL:         ~25-30 trades/day (blended)');
  console.log('   📊 Win Rate:      ~95% (blended across both tiers)');

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
      LIMIT 20
    `);

    if (tradeResult.rows.length === 0) {
      console.log('   No trades in last 24 hours (waiting for signals)');
    } else {
      const qualityTrades = tradeResult.rows.filter(r => r.notes.includes('[T123-1MIN-HL]'));
      const volumeTrades = tradeResult.rows.filter(r => r.notes.includes('[T123-1MIN]') && !r.notes.includes('HL'));

      console.log(`   Found ${tradeResult.rows.length} trade(s):\n`);
      console.log(`   🏆 QUALITY (T123-1MIN-HL): ${qualityTrades.length} trades`);
      console.log(`   📊 VOLUME (T123-1MIN):     ${volumeTrades.length} trades`);
      console.log('');

      tradeResult.rows.slice(0, 8).forEach((trade, i) => {
        const strategyMatch = trade.notes.match(/\[(T123-[^\]]+)\]/);
        const strategy = strategyMatch ? strategyMatch[1] : 'Unknown';
        const tier = strategy.includes('HL') ? '🏆 QUALITY' : '📊 VOLUME';
        const time = new Date(trade.timestamp).toLocaleTimeString();
        console.log(`   ${tier} [${time}] ${strategy} - $${parseFloat(trade.position_size_usd).toFixed(2)} - ${trade.outcome || 'PENDING'}`);
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
        const tier = log.message.includes('[QUALITY]') ? '🏆' :
                    log.message.includes('[VOLUME]') ? '📊' : '  ';
        console.log(`   ${tier} ${eventIcon} [${time}] ${log.message.substring(0, 65)}`);
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
      console.log('   Current: $' + balance.toFixed(2));
      console.log('   Position sizes limited to minimum ($1)');
      console.log('   Recommended: $200+ for optimal T123-FUSION operation');
    } else if (balance < 200) {
      console.log('\n✅ GOOD BALANCE');
      console.log('   Current: $' + balance.toFixed(2));
      console.log('   Sufficient for T123-FUSION operation');
      console.log('   Optional: Add more funds to increase position sizes');
    } else {
      console.log('\n✅ EXCELLENT BALANCE');
      console.log('   Current: $' + balance.toFixed(2));
      console.log('   Optimal for T123-FUSION operation');
      console.log('   Position sizes auto-scale with balance');
    }
  } catch (err) {
    // Ignore balance check errors
  }

  console.log('\n📈 Monitoring Commands:');
  console.log('   pm2 logs polychamp-spike              # Live logs');
  console.log('   node check-fusion-status.js           # Run this check again');
  console.log('   cat T123-FUSION-GUIDE.md              # View full guide');

  console.log('\n🎯 T123-FUSION is a dual-strategy system:');
  console.log('   • QUALITY tier (10%) catches ultra-selective signals');
  console.log('   • VOLUME tier (5%) catches additional opportunities');
  console.log('   • Expected: ~25-30 total trades/day with smart allocation');

  console.log('\n' + '═'.repeat(80) + '\n');
  process.exit(0);
}

checkStatus().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
