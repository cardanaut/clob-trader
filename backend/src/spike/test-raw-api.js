#!/usr/bin/env node
/**
 * Raw API Test - Direct call to see actual 402 response
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const axios = require('axios');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('hpagent');

const config = require('./config');

async function testRawAPI() {
  const API_KEY = config.LIVE_TRADING.API_KEY;
  const API_SECRET = config.LIVE_TRADING.API_SECRET;
  const API_PASSPHRASE = config.LIVE_TRADING.API_PASSPHRASE;
  const WALLET_ADDRESS = config.LIVE_TRADING.PROXY_ADDRESS; // Use proxy address for authentication

  const timestamp = Math.floor(Date.now() / 1000);
  const method = 'GET';
  const requestPath = '/balance-allowance';
  const body = '';

  // Create signature
  const message = timestamp + method + requestPath + body;
  const signature = crypto
    .createHmac('sha256', Buffer.from(API_SECRET, 'base64'))
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const headers = {
    'POLY_ADDRESS': WALLET_ADDRESS,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp.toString(),
    'POLY_API_KEY': API_KEY,
    'POLY_PASSPHRASE': API_PASSPHRASE,
    'Content-Type': 'application/json'
  };

  // Create proxy agent
  const proxyAgent = new HttpsProxyAgent({
    proxy: `http://${config.CLOB_PROXY.USER}:${config.CLOB_PROXY.PASS}_country-ES@${config.CLOB_PROXY.HOST}:${config.CLOB_PROXY.PORT}`
  });

  console.log('Making request to:', config.LIVE_TRADING.CLOB_URL + requestPath);
  console.log('With params:', { asset_type: 'COLLATERAL', signature_type: 2 });
  console.log('Headers:', Object.keys(headers));

  try {
    const response = await axios.get(config.LIVE_TRADING.CLOB_URL + requestPath, {
      params: { asset_type: 'COLLATERAL', signature_type: 2 },
      headers,
      httpsAgent: proxyAgent,
      proxy: false
    });

    console.log('\n✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('\n❌ ERROR!');
    console.log('Status:', error.response?.status);
    console.log('StatusText:', error.response?.statusText);
    console.log('Response Data:', error.response?.data);
    console.log('Response Headers:', error.response?.headers);
    console.log('Error Message:', error.message);
  }
}

testRawAPI();
