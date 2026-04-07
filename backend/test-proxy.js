/**
 * Test BrightData Residential Proxy Configuration
 * Run this to verify your proxy works before enabling live trading
 */

require('dotenv').config();
const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');

async function testProxy() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  BRIGHTDATA RESIDENTIAL PROXY TEST');
  console.log('═══════════════════════════════════════════════════════\n');

  // Check credentials
  const host = process.env.CLOB_PROXY_HOST;
  const port = process.env.CLOB_PROXY_PORT;
  const user = process.env.CLOB_PROXY_USER;
  const pass = process.env.CLOB_PROXY_PASS;
  const enabled = process.env.CLOB_USE_PROXY;

  console.log('1️⃣  Configuration Check:');
  console.log('   ─────────────────────────────────────────────────');
  console.log('   CLOB_USE_PROXY:', enabled || 'NOT SET');
  console.log('   CLOB_PROXY_HOST:', host || 'NOT SET');
  console.log('   CLOB_PROXY_PORT:', port || 'NOT SET');
  console.log('   CLOB_PROXY_USER:', user ? user.slice(0, 30) + '...' : 'NOT SET');
  console.log('   CLOB_PROXY_PASS:', pass ? '***' : 'NOT SET\n');

  if (!host || !port || !user || !pass) {
    console.error('❌ ERROR: Missing proxy credentials in .env file\n');
    console.log('Required .env variables:');
    console.log('  CLOB_USE_PROXY=true');
    console.log('  CLOB_PROXY_HOST=brd.superproxy.io');
    console.log('  CLOB_PROXY_PORT=22225');
    console.log('  CLOB_PROXY_USER=brd-customer-xxx-zone-residential_proxy1');
    console.log('  CLOB_PROXY_PASS=your_password\n');
    process.exit(1);
  }

  // Check zone type
  const zone = user.match(/zone-([^-]+)/)?.[1] || 'unknown';
  console.log('   Proxy Zone:', zone);

  if (!user.includes('residential')) {
    console.error('\n   ⚠️  WARNING: Not using residential zone!');
    console.error('   Current zone:', zone);
    console.error('   This will NOT bypass Cloudflare 403 blocks.');
    console.error('   Create a residential zone at: https://brightdata.com/cp/zones\n');
  } else {
    console.log('   ✓ Residential zone detected\n');
  }

  // Test 1: Check IP without proxy
  console.log('2️⃣  Direct Connection Test (No Proxy):');
  console.log('   ─────────────────────────────────────────────────');
  try {
    const directResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
    console.log('   Your Server IP:', directResponse.data.ip);
    console.log('   Type: Datacenter (will be blocked by Cloudflare)\n');
  } catch (err) {
    console.error('   ❌ Failed to get IP:', err.message + '\n');
  }

  // Test 2: Check IP with proxy
  console.log('3️⃣  Proxy Connection Test (Residential Proxy):');
  console.log('   ─────────────────────────────────────────────────');

  const protocol = process.env.CLOB_PROXY_PROTOCOL || 'http';
  const proxyUrl = `${protocol}://${user}:${pass}@${host}:${port}`;

  // Use appropriate agent based on protocol
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const agent = protocol === 'socks5'
    ? new SocksProxyAgent(proxyUrl)
    : new HttpsProxyAgent(proxyUrl);

  try {
    const proxyResponse = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      proxy: false,
      timeout: 15000
    });

    console.log('   Proxy IP:', proxyResponse.data.ip);
    console.log('   ✓ Proxy connection successful!');
    console.log('   Type: Residential (bypasses Cloudflare)\n');
  } catch (err) {
    console.error('   ❌ Proxy connection FAILED:', err.message);
    console.error('\n   Possible issues:');
    console.error('   - Wrong credentials (check username/password)');
    console.error('   - Wrong port (residential = 22225, datacenter = 33335)');
    console.error('   - Zone not created in BrightData dashboard');
    console.error('   - BrightData account issue\n');
    process.exit(1);
  }

  // Test 3: Test Polymarket CLOB API with proxy
  console.log('4️⃣  Polymarket CLOB API Test (With Proxy):');
  console.log('   ─────────────────────────────────────────────────');

  try {
    // Try to access a CLOB endpoint (public order book doesn't require auth)
    const clobResponse = await axios.get('https://clob.polymarket.com/sampling-simplified-markets', {
      httpsAgent: agent,
      proxy: false,
      timeout: 15000
    });

    console.log('   Status:', clobResponse.status, clobResponse.statusText);
    console.log('   ✓ CLOB API accessible via proxy!');
    console.log('   Response size:', JSON.stringify(clobResponse.data).length, 'bytes\n');
  } catch (err) {
    if (err.response) {
      console.error('   ⚠️  Response:', err.response.status, err.response.statusText);
      if (err.response.status === 403) {
        console.error('   ❌ Still getting 403 Forbidden!');
        console.error('   This means:');
        console.error('   - You may be using datacenter zone (not residential)');
        console.error('   - OR Cloudflare is still blocking this residential IP');
        console.error('   - Try a different country/residential pool\n');
      } else {
        console.log('   ✓ Different error - proxy is working!\n');
      }
    } else {
      console.error('   ❌ Request failed:', err.message + '\n');
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('Next steps:');
  console.log('1. Ensure CLOB_USE_PROXY=true in .env');
  console.log('2. Restart spike engine: pm2 restart polychamp-spike --update-env');
  console.log('3. Monitor logs for successful order placement\n');
}

testProxy().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
