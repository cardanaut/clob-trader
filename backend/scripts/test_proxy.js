#!/usr/bin/env node

/**
 * Test proxy connection to Polymarket CLOB API
 *
 * Usage:
 *   node scripts/test_proxy.js
 *   node scripts/test_proxy.js <host> <port> <user> <pass>
 *
 * Example:
 *   node scripts/test_proxy.js geo.iproyal.com 12321 myuser mypass
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');
const { HttpsProxyAgent } = require('hpagent');

// Allow override via command line or use .env
const PROXY_CONFIG = {
  host: process.argv[2] || process.env.CLOB_PROXY_HOST || 'geo.iproyal.com',
  port: process.argv[3] || process.env.CLOB_PROXY_PORT || '12321',
  user: process.argv[4] || process.env.CLOB_PROXY_USER || 'luF2mGMKWROK1rxD',
  pass: process.argv[5] || process.env.CLOB_PROXY_PASS || 'lFVeG05x4CoGfhlR'
};

async function testProxy() {
  console.log('\n=== Proxy Connection Test ===\n');
  console.log('Configuration:');
  console.log(`  Host: ${PROXY_CONFIG.host}`);
  console.log(`  Port: ${PROXY_CONFIG.port}`);
  console.log(`  User: ${PROXY_CONFIG.user}`);
  console.log(`  Pass: ${PROXY_CONFIG.pass.substring(0, 4)}****\n`);

  // Test 1: Get public IP through proxy
  console.log('Test 1: Checking proxy connection and IP...');
  let proxyIP = null;
  try {
    const proxyUrl = `http://${PROXY_CONFIG.user}:${PROXY_CONFIG.pass}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
    const agent = new HttpsProxyAgent({ proxy: proxyUrl });

    const res = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      proxy: false,
      timeout: 10000
    });

    proxyIP = res.data.ip;
    console.log(`✅ Proxy connected successfully`);
    console.log(`   IP address: ${proxyIP}`);
  } catch (err) {
    console.log(`❌ PROXY CONNECTION FAILED`);
    console.log(`   Error: ${err.message}`);
    console.log(`   Code: ${err.code || 'N/A'}`);
    console.log(`\n💡 Possible issues:`);
    console.log(`   - Proxy credentials expired or invalid`);
    console.log(`   - Proxy service is down`);
    console.log(`   - Firewall blocking proxy connection`);
    console.log(`   - Wrong host/port configuration`);
    return;
  }

  // Test 2: Access Polymarket CLOB API through proxy
  console.log('\nTest 2: Accessing Polymarket CLOB API through proxy...');
  let proxyWorksForPolymarket = false;
  try {
    const proxyUrl = `http://${PROXY_CONFIG.user}:${PROXY_CONFIG.pass}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
    const agent = new HttpsProxyAgent({ proxy: proxyUrl });

    const res = await axios.get('https://clob.polymarket.com/sampling-simplified-markets', {
      httpsAgent: agent,
      proxy: false,
      timeout: 15000
    });

    proxyWorksForPolymarket = true;
    console.log(`✅ SUCCESS! Polymarket accessible through proxy`);
    console.log(`   Status: ${res.status}`);
    console.log(`   Markets returned: ${res.data?.length || 0}`);
  } catch (err) {
    console.log(`❌ POLYMARKET REQUEST FAILED`);
    console.log(`   Error: ${err.message}`);
    if (err.response) {
      console.log(`   Status: ${err.response.status} ${err.response.statusText}`);
      const errorData = JSON.stringify(err.response.data);
      console.log(`   Response: ${errorData.substring(0, 200)}`);

      if (err.response.status === 403 && errorData.includes('geoblock')) {
        console.log(`\n💡 403 Geoblock Error - Proxy is NOT bypassing region restriction!`);
      }
    }
    console.log(`   Code: ${err.code || 'N/A'}`);
  }

  // Test 3: Direct connection (no proxy) - should fail with geoblock
  console.log('\nTest 3: Testing direct connection (no proxy)...');
  try {
    const res = await axios.get('https://clob.polymarket.com/sampling-simplified-markets', {
      timeout: 10000
    });

    console.log(`⚠️  Direct connection succeeded (you may not be in a blocked region)`);
    console.log(`   Status: ${res.status}`);
    console.log(`   Your server location may already be allowed by Polymarket`);
  } catch (err) {
    if (err.response?.status === 403) {
      console.log(`✅ Direct connection blocked as expected (403 Forbidden)`);
      console.log(`   This confirms your region requires a proxy`);
    } else {
      console.log(`❌ Unexpected error: ${err.message}`);
    }
  }

  console.log('\n=== Test Results ===');
  if (proxyWorksForPolymarket) {
    console.log('✅ PROXY IS WORKING CORRECTLY');
    console.log('   You can now use this proxy for live trading');
    console.log(`   Proxy IP: ${proxyIP}`);
  } else {
    console.log('❌ PROXY IS NOT WORKING');
    console.log('   Action required:');
    console.log('   1. Check your proxy service subscription status');
    console.log('   2. Verify credentials are correct');
    console.log('   3. Try a different proxy provider');
    console.log('   4. Contact proxy support');
  }
  console.log('===================\n');
}

testProxy().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
