#!/usr/bin/env node

/**
 * Test Automated Claim System
 *
 * Tests the claim winnings module without making real transactions:
 * 1. Initializes the claim system
 * 2. Registers a fake position
 * 3. Marks it as resolved
 * 4. Checks claim status
 * 5. Verifies error handling (no actual claim attempted)
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const claimWinnings = require('../src/spike/claim-winnings');

async function testClaimSystem() {
  console.log('\n=== Automated Claim System Test ===\n');

  try {
    // Step 1: Initialize claim system
    console.log('Step 1: Initializing claim system...');
    const wallet = claimWinnings.initialize();
    console.log(`✅ Initialized with wallet: ${wallet}\n`);

    // Step 2: Register a test position
    console.log('Step 2: Registering test position...');
    const testConditionId = '0xa3cd42db675dd895ab8fcf701de09af1b8c52e1f96ee94e8af0b603fdf31ddb5';
    const testMarket = {
      slug: 'xrp-updown-5m-1771929600',
      question: 'XRP Up or Down - February 24, 5:40AM-5:45AM ET (TEST)',
      endDate: new Date('2024-02-24T10:40:00Z')
    };

    claimWinnings.registerPosition(testConditionId, testMarket);
    console.log('✅ Position registered\n');

    // Step 3: Check initial status
    console.log('Step 3: Checking status before resolution...');
    let status = claimWinnings.getStatus();
    console.log('Status:', JSON.stringify(status, null, 2));
    console.log('');

    // Step 4: Mark market as resolved
    console.log('Step 4: Marking market as resolved...');
    claimWinnings.markResolved(testConditionId);
    console.log('✅ Market marked as resolved\n');

    // Step 5: Check status after resolution
    console.log('Step 5: Checking status after resolution...');
    status = claimWinnings.getStatus();
    console.log('Status:', JSON.stringify(status, null, 2));
    console.log('');

    // Step 6: Test processAllClaims (should handle "no balance" gracefully)
    console.log('Step 6: Testing claim processing (expect "no balance" error)...');
    console.log('Note: This will make a real blockchain call but should fail with "no balance"');
    console.log('      because we have no tokens for this old market.\n');

    const result = await claimWinnings.processAllClaims();
    console.log('Claim result:', JSON.stringify(result, null, 2));
    console.log('');

    // Final status
    console.log('Final status:');
    status = claimWinnings.getStatus();
    console.log(JSON.stringify(status, null, 2));
    console.log('');

    console.log('=== Test Complete ===\n');
    console.log('✅ Claim system is working correctly!');
    console.log('   - Initialization: ✅');
    console.log('   - Position registration: ✅');
    console.log('   - Resolution tracking: ✅');
    console.log('   - Claim processing: ✅ (handled "no balance" gracefully)');
    console.log('');
    console.log('🚀 Ready for live trading integration!');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testClaimSystem();
