#!/usr/bin/env node
/**
 * Test API WITHOUT proxy
 * See if we can reach Polymarket directly (might get geoblocked)
 */

'use strict';

const axios = require('axios');

async function testEndpoint(name, url) {
  try {
    const response = await axios.get(url, { timeout: 10000 });
    console.log(`✅ ${name}: ${response.status} (Success)`);
    console.log(`   Data sample:`, JSON.stringify(response.data).slice(0, 100));
    return { status: response.status, success: true };
  } catch (error) {
    const status = error.response?.status || 'Network Error';
    const data = error.response?.data || error.message;
    console.log(`❌ ${name}: ${status}`);
    console.log(`   Error:`, JSON.stringify(data).slice(0, 200));
    return { status, success: false };
  }
}

async function main() {
  console.log('========================================');
  console.log('TESTING API WITHOUT PROXY');
  console.log('========================================\n');
  console.log('This will test if Polymarket API is reachable directly.');
  console.log('May be geoblocked depending on your location.\n');
  console.log('========================================\n');

  await testEndpoint('Time', 'https://clob.polymarket.com/time');
  await testEndpoint('Sampling Markets', 'https://clob.polymarket.com/sampling-markets');
  await testEndpoint('Markets', 'https://clob.polymarket.com/markets');

  console.log('\n========================================\n');
}

main();
