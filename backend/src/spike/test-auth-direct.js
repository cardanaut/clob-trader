#!/usr/bin/env node
/**
 * Test Authentication Directly (No SDK, No Proxy)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const axios = require('axios');
const crypto = require('crypto');
const config = require('./config');

async function testAuth() {
  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const requestPath = '/balance-allowance';
  const body = '';

  // Create signature
  const message = timestamp + method + requestPath + body;
  const signature = crypto
    .createHmac('sha256', Buffer.from(config.LIVE_TRADING.API_SECRET, 'base64'))
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const headers = {
    'POLY_ADDRESS': config.LIVE_TRADING.PROXY_ADDRESS,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp.toString(),
    'POLY_API_KEY': config.LIVE_TRADING.API_KEY,
    'POLY_PASSPHRASE': config.LIVE_TRADING.API_PASSPHRASE,
    'Content-Type': 'application/json'
  };

  console.log('========================================');
  console.log('TESTING AUTHENTICATED REQUEST');
  console.log('========================================\n');
  console.log('Endpoint:', config.LIVE_TRADING.CLOB_URL + requestPath);
  console.log('Address:', config.LIVE_TRADING.PROXY_ADDRESS);
  console.log('API Key:', config.LIVE_TRADING.API_KEY.slice(0, 10) + '...');
  console.log('Timestamp:', timestamp);
  console.log('Signature:', signature.slice(0, 20) + '...');
  console.log('\n========================================\n');

  try {
    const response = await axios.get(config.LIVE_TRADING.CLOB_URL + requestPath, {
      params: {
        asset_type: 'COLLATERAL',
        signature_type: 2
      },
      headers,
      timeout: 10000
    });

    console.log('✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.log('❌ FAILED!');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Response Data:', error.response?.data);
    console.log('Response Headers:', JSON.stringify(error.response?.headers, null, 2));
    console.log('\n========================================');
    console.log('DIAGNOSIS:');
    console.log('========================================\n');

    if (error.response?.status === 401) {
      console.log('401 = Invalid credentials or signature');
      console.log('  - Check if API key is correct');
      console.log('  - Check if API secret is correct');
      console.log('  - Check if signature algorithm is correct');
    } else if (error.response?.status === 402) {
      console.log('402 = Payment Required / Account Not Activated');
      console.log('  - Your API keys may need verification/activation');
      console.log('  - Check for "Verified: No" in Builder Settings');
      console.log('  - Look for pending activation steps in Polymarket UI');
      console.log('  - Contact Polymarket support for account activation');
    } else if (error.response?.status === 403) {
      console.log('403 = Forbidden / Access Denied');
      console.log('  - May be geoblocked (but public endpoints worked)');
      console.log('  - API key may not have permission for this endpoint');
    }
    console.log('\n========================================\n');
  }
}

testAuth();
