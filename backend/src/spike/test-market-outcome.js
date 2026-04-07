#!/usr/bin/env node
/**
 * Test if we can get market outcome from Gamma API
 */

'use strict';

const gamma = require('./gamma-api');

const marketId = process.argv[2];

if (!marketId) {
  console.error('Usage: node test-market-outcome.js <marketId>');
  process.exit(1);
}

async function test() {
  console.log('Testing market:', marketId.slice(0, 16) + '...');

  try {
    const outcome = await gamma.getMarketOutcome(marketId);
    console.log('Outcome:', outcome);

    if (!outcome) {
      console.log('Market not resolved yet or outcome unavailable');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
