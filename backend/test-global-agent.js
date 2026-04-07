/**
 * Test if global HTTPS agent is actually being used by ClobClient
 */
require('dotenv').config();

// Simulate the global proxy setup from clob-api.js
const https = require('https');

if (process.env.CLOB_USE_PROXY === 'true') {
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const protocol = process.env.CLOB_PROXY_PROTOCOL || 'http';
  const host = process.env.CLOB_PROXY_HOST;
  const port = process.env.CLOB_PROXY_PORT;
  const user = process.env.CLOB_PROXY_USER;
  const pass = process.env.CLOB_PROXY_PASS;

  if (host && port && user && pass) {
    const proxyUrl = `${protocol}://${user}:${pass}@${host}:${port}`;
    const proxyAgent = new HttpsProxyAgent(proxyUrl);

    // Set as global default agent
    https.globalAgent = proxyAgent;

    console.log('✅ Global HTTPS agent configured');
    console.log('   Protocol:', protocol.toUpperCase());
    console.log('   Host:', host);
    console.log('   Port:', port);
    console.log('   Agent type:', proxyAgent.constructor.name);
  }
}

// Now test with a simple HTTPS request
const axios = require('axios');

async function testProxyUsage() {
  console.log('\n🧪 Testing HTTPS requests through global agent...\n');

  try {
    // Test 1: Check current IP through proxy
    console.log('1️⃣  Checking IP (should show proxy IP)...');
    const ipResponse = await axios.get('https://api.ipify.org?format=json', {
      timeout: 10000
    });
    console.log('   ✓ IP:', ipResponse.data.ip);

    // Test 2: Try CLOB API
    console.log('\n2️⃣  Testing CLOB API access...');
    const clobResponse = await axios.get('https://clob.polymarket.com/sampling-simplified-markets', {
      timeout: 10000
    });
    console.log('   ✓ Status:', clobResponse.status);
    console.log('   ✓ Response size:', JSON.stringify(clobResponse.data).length, 'bytes');

    console.log('\n✅ SUCCESS: Global HTTPS agent is working!');
    console.log('   All requests routed through proxy correctly.');
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    if (err.response) {
      console.error('   Status:', err.response.status);
      console.error('   Error:', err.response.data);
    }
  }
}

testProxyUsage();
