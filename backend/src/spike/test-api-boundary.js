#!/usr/bin/env node
/**
 * Test API Access Boundary
 * Find which endpoints work and which return 402
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const axios = require('axios');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('hpagent');
const config = require('./config');

// Create proxy agent
const proxyAgent = new HttpsProxyAgent({
  proxy: `http://${config.CLOB_PROXY.USER}:${config.CLOB_PROXY.PASS}_country-ES@${config.CLOB_PROXY.HOST}:${config.CLOB_PROXY.PORT}`
});

async function testEndpoint(name, url, needsAuth = false) {
  try {
    const axiosConfig = {
      httpsAgent: proxyAgent,
      proxy: false,
      timeout: 10000
    };

    if (needsAuth) {
      const timestamp = Math.floor(Date.now() / 1000);
      const method = 'GET';
      const path = new URL(url).pathname;
      const message = timestamp + method + path;

      const signature = crypto
        .createHmac('sha256', Buffer.from(config.LIVE_TRADING.API_SECRET, 'base64'))
        .update(message)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      axiosConfig.headers = {
        'POLY_ADDRESS': config.LIVE_TRADING.PROXY_ADDRESS,
        'POLY_SIGNATURE': signature,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_API_KEY': config.LIVE_TRADING.API_KEY,
        'POLY_PASSPHRASE': config.LIVE_TRADING.API_PASSPHRASE
      };
    }

    const response = await axios.get(url, axiosConfig);
    console.log(`✅ ${name}: ${response.status} (Success)`);
    return { status: response.status, success: true };
  } catch (error) {
    const status = error.response?.status || 'No response';
    const data = error.response?.data || error.message;
    console.log(`❌ ${name}: ${status} (${JSON.stringify(data).slice(0, 100)})`);
    return { status, success: false, error: data };
  }
}

async function main() {
  console.log('========================================');
  console.log('TESTING API ACCESS BOUNDARY');
  console.log('========================================\n');
  console.log('Using Proxy Address:', config.LIVE_TRADING.PROXY_ADDRESS);
  console.log('API Key (first 10 chars):', config.LIVE_TRADING.API_KEY?.slice(0, 10) + '...');
  console.log('\n========================================\n');

  console.log('Test 1: Public Endpoints (No Auth)\n');
  await testEndpoint('Markets', 'https://clob.polymarket.com/markets', false);
  await testEndpoint('Sampling Markets', 'https://clob.polymarket.com/sampling-markets', false);
  await testEndpoint('Time', 'https://clob.polymarket.com/time', false);

  console.log('\n========================================\n');
  console.log('Test 2: Account Endpoints (With Auth)\n');
  await testEndpoint('Balance', 'https://clob.polymarket.com/balance-allowance?asset_type=COLLATERAL&signature_type=2', true);
  await testEndpoint('Orders', 'https://clob.polymarket.com/orders', true);
  await testEndpoint('Trades', 'https://clob.polymarket.com/trades', true);

  console.log('\n========================================\n');
  console.log('Test 3: Market Data (No Auth)\n');
  await testEndpoint('Prices', 'https://clob.polymarket.com/prices', false);
  await testEndpoint('Price for Token', 'https://clob.polymarket.com/price?token_id=21742633143463906290569050155826241533067272736897614950488156847949938836455', false);

  console.log('\n========================================');
  console.log('ANALYSIS');
  console.log('========================================\n');
  console.log('If public endpoints work but authenticated endpoints return 402:');
  console.log('  → API key verification/activation issue');
  console.log('\nIf ALL endpoints return 402:');
  console.log('  → Proxy/network issue');
  console.log('\nIf authenticated endpoints return 401:');
  console.log('  → Signature/credentials issue');
  console.log('\n========================================\n');
}

main();
