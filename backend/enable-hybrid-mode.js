#!/usr/bin/env node
/**
 * Enable HYBRID Strategy Mode
 * Activates dual-strategy trading with T123-1MIN + T123-1MIN-HL
 */

'use strict';

const { query } = require('./src/database/connection');
const config = require('./src/spike/config');
const clobApi = require('./src/spike/clob-api');

async function enableHybridMode() {
  console.log('\n' + '═'.repeat(80));
  console.log('🔧 ENABLING HYBRID STRATEGY MODE');
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
    const baselinePositionSize = balance * config.HYBRID_STRATEGIES['T123-1MIN'].positionSizePct / 100;
    const optimizedPositionSize = balance * config.HYBRID_STRATEGIES['T123-1MIN-HL'].positionSizePct / 100;

    console.log('\n💰 Position Size Allocation:');
    console.log(`   Balance: $${balance.toFixed(2)} USDC`);
    console.log(`   T123-1MIN (Volume):    ${config.HYBRID_STRATEGIES['T123-1MIN'].positionSizePct}% → $${baselinePositionSize.toFixed(2)}/trade`);
    console.log(`   T123-1MIN-HL (Quality): ${config.HYBRID_STRATEGIES['T123-1MIN-HL'].positionSizePct}% → $${optimizedPositionSize.toFixed(2)}/trade`);

    // Check minimum position size
    if (baselinePositionSize < config.MIN_POSITION_SIZE_USD) {
      console.log(`\n   ⚠️  WARNING: T123-1MIN position size ($${baselinePositionSize.toFixed(2)}) below minimum ($${config.MIN_POSITION_SIZE_USD})`);
      console.log('   This strategy will be skipped until balance increases.');
    }

    if (optimizedPositionSize < config.MIN_POSITION_SIZE_USD) {
      console.log(`\n   ⚠️  WARNING: T123-1MIN-HL position size ($${optimizedPositionSize.toFixed(2)}) below minimum ($${config.MIN_POSITION_SIZE_USD})`);
      console.log('   This strategy will be skipped until balance increases.');
    }

    console.log('\n📋 Hybrid Strategy Configuration:');
    console.log('   ├─ T123-1MIN (Baseline Strategy)');
    console.log('   │  ├─ Threshold: ≥0.20% close movement');
    console.log('   │  ├─ Expected WR: ~91.7%');
    console.log('   │  ├─ Expected Signals: ~35/day across all cryptos');
    console.log('   │  └─ Trade Size: $' + baselinePositionSize.toFixed(2));
    console.log('   │');
    console.log('   └─ T123-1MIN-HL (Optimized Strategy)');
    console.log('      ├─ Per-Crypto Thresholds:');
    console.log('      │  ├─ BTC: HL≥21%, OC≥21%');
    console.log('      │  ├─ SOL: HL≥29%, OC≥29%');
    console.log('      │  ├─ XRP: HL≥26%, OC≥26%');
    console.log('      │  └─ ETH: HL≥20%, OC≥20%');
    console.log('      ├─ Expected WR: 100% (backtested)');
    console.log('      ├─ Expected Signals: ~19/day across all cryptos');
    console.log('      └─ Trade Size: $' + optimizedPositionSize.toFixed(2));

    // Prompt user for confirmation
    console.log('\n' + '─'.repeat(80));
    console.log('⚠️  IMPORTANT: This will modify your live trading configuration!');
    console.log('─'.repeat(80));
    console.log('\nChanges that will be made:');
    console.log('  1. Set SPIKE_HYBRID_MODE=true in environment');
    console.log('  2. Bot will run BOTH strategies simultaneously');
    console.log('  3. Different position sizes per strategy (as shown above)');
    console.log('  4. Minimum trade size: $' + config.MIN_POSITION_SIZE_USD);
    console.log('\nExpected Results:');
    console.log('  • More diversified trading (2 strategies)');
    console.log('  • Higher capital deployment on high-confidence signals');
    console.log('  • Better risk-adjusted returns');
    console.log('  • ~54 total signals/day (35 baseline + 19 optimized)');
    console.log('\n✅ To enable HYBRID mode, run:');
    console.log('   export SPIKE_HYBRID_MODE=true');
    console.log('   pm2 restart spike-trading');
    console.log('\n❌ To disable later, run:');
    console.log('   export SPIKE_HYBRID_MODE=false');
    console.log('   pm2 restart spike-trading');

    console.log('\n' + '═'.repeat(80));
    console.log('💡 RECOMMENDATION');
    console.log('═'.repeat(80));

    if (balance < 100) {
      console.log('\n⚠️  LOW BALANCE WARNING');
      console.log(`Your current balance ($${balance.toFixed(2)}) is low for hybrid mode.`);
      console.log('\nRecommendations:');
      console.log('  1. Add more funds (recommended: $200+ for optimal operation)');
      console.log('  2. OR: Stick with single strategy mode (T123-1MIN or T123-1MIN-HL)');
      console.log('  3. OR: Lower position sizes in config.js');
    } else {
      console.log('\n✅ READY TO ENABLE');
      console.log('Your balance is sufficient for hybrid mode operation.');
      console.log('\nNext steps:');
      console.log('  1. Review the position sizes above');
      console.log('  2. Run: export SPIKE_HYBRID_MODE=true');
      console.log('  3. Run: pm2 restart spike-trading');
      console.log('  4. Monitor logs: pm2 logs spike-trading');
    }

    console.log('\n' + '═'.repeat(80) + '\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  process.exit(0);
}

enableHybridMode();
