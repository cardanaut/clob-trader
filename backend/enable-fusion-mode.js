#!/usr/bin/env node
/**
 * Enable T123-FUSION Strategy Mode
 * Activates dual-strategy trading with tiered position sizing
 */

'use strict';

const { query } = require('./src/database/connection');
const config = require('./src/spike/config');
const clobApi = require('./src/spike/clob-api');

async function enableFusionMode() {
  console.log('\n' + '═'.repeat(80));
  console.log('🚀 ENABLING T123-FUSION MODE');
  console.log('═'.repeat(80));

  try {
    // Check current balance
    console.log('\n📊 Checking current balance...');

    let balance = 0;
    try {
      clobApi.initializeLiveClient();
      const balanceInfo = await clobApi.getBalance();
      balance = balanceInfo ? balanceInfo.liquid : 0;
      console.log(`   Current liquid balance: $${balance.toFixed(2)} USDC`);
    } catch (err) {
      console.log(`   ⚠️  Could not fetch live balance: ${err.message}`);
      console.log('   Will calculate position sizes based on config starting capital');
      balance = config.STARTING_CAPITAL;
    }

    // Calculate position sizes
    const qualityPositionSize = balance * config.FUSION_STRATEGIES['T123-1MIN-HL'].positionSizePct / 100;
    const volumePositionSize = balance * config.FUSION_STRATEGIES['T123-1MIN'].positionSizePct / 100;

    console.log('\n🎯 T123-FUSION: Tiered Position Allocation');
    console.log(`   Balance: $${balance.toFixed(2)} USDC`);
    console.log('');
    console.log(`   🏆 QUALITY Tier (T123-1MIN-HL): ${config.FUSION_STRATEGIES['T123-1MIN-HL'].positionSizePct}% → $${qualityPositionSize.toFixed(2)}/trade`);
    console.log(`   📊 VOLUME Tier (T123-1MIN):     ${config.FUSION_STRATEGIES['T123-1MIN'].positionSizePct}% → $${volumePositionSize.toFixed(2)}/trade`);

    // Check minimum position size
    if (qualityPositionSize < config.MIN_POSITION_SIZE_USD) {
      console.log(`\n   ⚠️  WARNING: QUALITY tier position ($${qualityPositionSize.toFixed(2)}) below minimum ($${config.MIN_POSITION_SIZE_USD})`);
      console.log('   This tier will be skipped until balance increases.');
    }

    if (volumePositionSize < config.MIN_POSITION_SIZE_USD) {
      console.log(`\n   ⚠️  WARNING: VOLUME tier position ($${volumePositionSize.toFixed(2)}) below minimum ($${config.MIN_POSITION_SIZE_USD})`);
      console.log('   This tier will be skipped until balance increases.');
    }

    console.log('\n📋 T123-FUSION Strategy Configuration:');
    console.log('   ┌─ 🏆 QUALITY Tier (T123-1MIN-HL)');
    console.log('   │  ├─ Per-Crypto Thresholds:');
    console.log('   │  │  ├─ BTC: HL≥21%, OC≥21%');
    console.log('   │  │  ├─ SOL: HL≥29%, OC≥29%');
    console.log('   │  │  ├─ XRP: HL≥26%, OC≥26%');
    console.log('   │  │  └─ ETH: HL≥20%, OC≥20%');
    console.log('   │  ├─ Expected WR: 100% (backtested)');
    console.log('   │  ├─ Expected Signals: ~19/day');
    console.log('   │  └─ Trade Size: $' + qualityPositionSize.toFixed(2) + ' (10% of balance)');
    console.log('   │');
    console.log('   └─ 📊 VOLUME Tier (T123-1MIN)');
    console.log('      ├─ Threshold: ≥0.20% close movement');
    console.log('      ├─ Expected WR: ~91.7%');
    console.log('      ├─ Expected Signals: ~6-16/day (after QUALITY overlap)');
    console.log('      └─ Trade Size: $' + volumePositionSize.toFixed(2) + ' (5% of balance)');

    // Explain how it works
    console.log('\n🔄 How T123-FUSION Works:');
    console.log('   1. New candle arrives');
    console.log('   2. Check QUALITY tier first (stricter requirements, larger position)');
    console.log('   3. If QUALITY fires → execute at 10% position → DONE');
    console.log('   4. If QUALITY doesn\'t fire → check VOLUME tier');
    console.log('   5. If VOLUME fires → execute at 5% position → DONE');
    console.log('   6. Result: Smart capital allocation based on signal quality');

    // Expected results
    console.log('\n📈 Expected Results:');
    console.log('   Total Trades: ~25-30/day (across all cryptos)');
    console.log('   • QUALITY tier: ~19 trades @ larger positions');
    console.log('   • VOLUME tier: ~6-16 trades @ smaller positions');
    console.log('   • Blended Win Rate: ~95%');
    console.log('   • Better capital efficiency than single strategy');

    // Prompt user for confirmation
    console.log('\n' + '─'.repeat(80));
    console.log('⚠️  IMPORTANT: This will modify your live trading configuration!');
    console.log('─'.repeat(80));
    console.log('\nChanges that will be made:');
    console.log('  1. Set SPIKE_FUSION_MODE=true in environment');
    console.log('  2. Bot will run BOTH strategies simultaneously');
    console.log('  3. Tiered position sizes: 10% (QUALITY) + 5% (VOLUME)');
    console.log('  4. Minimum trade size: $' + config.MIN_POSITION_SIZE_USD);
    console.log('  5. QUALITY tier executes first (priority)');

    console.log('\n✅ To enable T123-FUSION mode, run:');
    console.log('   export SPIKE_FUSION_MODE=true');
    console.log('   pm2 restart polychamp-spike --update-env');
    console.log('   pm2 save');

    console.log('\n❌ To disable later, run:');
    console.log('   export SPIKE_FUSION_MODE=false');
    console.log('   pm2 restart polychamp-spike --update-env');
    console.log('   pm2 save');

    console.log('\n' + '═'.repeat(80));
    console.log('💡 RECOMMENDATION');
    console.log('═'.repeat(80));

    if (balance < 50) {
      console.log('\n⚠️  LOW BALANCE WARNING');
      console.log(`Your current balance ($${balance.toFixed(2)}) is low for T123-FUSION.`);
      console.log('\nRecommendations:');
      console.log('  1. Add more funds (recommended: $200+ for optimal operation)');
      console.log('  2. OR: Stick with single strategy mode (T123-1MIN or T123-1MIN-HL)');
      console.log('  3. OR: Accept smaller position sizes (will still work)');
    } else if (balance < 200) {
      console.log('\n✅ GOOD BALANCE');
      console.log('Your balance is sufficient for T123-FUSION operation.');
      console.log('\nRecommended next steps:');
      console.log('  1. Enable T123-FUSION mode (commands above)');
      console.log('  2. Monitor for 24-48 hours');
      console.log('  3. Optional: Add more funds to increase position sizes');
    } else {
      console.log('\n✅ EXCELLENT BALANCE');
      console.log('Your balance is optimal for T123-FUSION operation.');
      console.log('\nNext steps:');
      console.log('  1. Enable T123-FUSION mode (commands above)');
      console.log('  2. Monitor logs: pm2 logs polychamp-spike');
      console.log('  3. Check status: node check-fusion-status.js');
      console.log('  4. Position sizes will auto-scale as balance grows');
    }

    console.log('\n📚 Documentation:');
    console.log('   • T123-FUSION-GUIDE.md          - Complete guide');
    console.log('   • check-fusion-status.js        - Status checker');
    console.log('   • STRATEGY_COMPARISON_SUMMARY.md - Benefit analysis');

    console.log('\n' + '═'.repeat(80) + '\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  process.exit(0);
}

enableFusionMode();
