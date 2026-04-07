#!/usr/bin/env node
/**
 * Super Raw Test - Completely bypass everything
 */

const https = require('https');

const options = {
  hostname: 'clob.polymarket.com',
  port: 443,
  path: '/balance-allowance?asset_type=COLLATERAL&signature_type=2',
  method: 'GET',
  headers: {
    'User-Agent': 'test/1.0'
  }
};

console.log('Making super raw HTTPS request...');
console.log('URL:', `https://${options.hostname}${options.path}`);

const req = https.request(options, (res) => {
  console.log('\n✅ Response received!');
  console.log('Status Code:', res.statusCode);
  console.log('Status Message:', res.statusMessage);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\nResponse Body:');
    console.log(data);
  });
});

req.on('error', (error) => {
  console.error('\n❌ Request Error:', error.message);
});

req.end();
