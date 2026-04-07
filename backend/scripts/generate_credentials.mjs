/**
 * generate_credentials.mjs
 *
 * Derives Polymarket CLOB API credentials from your wallet private key.
 * Run once — the result is deterministic (same key → same credentials always).
 *
 * Usage:
 *   PRIVATE_KEY=0xYOUR_PRIVATE_KEY node scripts/generate_credentials.mjs
 *
 * The private key is read only from the environment variable and never stored.
 * Copy the output lines into backend/.env then restart the services.
 */

import { ethers } from '../node_modules/ethers/lib.esm/index.js';
import { ClobClient } from '../node_modules/@polymarket/clob-client/dist/index.js';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const HOST        = process.env.POLY_CLOB_HOST || 'https://clob.polymarket.com';
const CHAIN_ID    = parseInt(process.env.POLY_CHAIN_ID || '137', 10);

if (!PRIVATE_KEY) {
  console.error('ERROR: PRIVATE_KEY env var is required.');
  console.error('Usage: PRIVATE_KEY=0x... node scripts/generate_credentials.mjs');
  process.exit(1);
}

const wallet = new ethers.Wallet(PRIVATE_KEY);
// Patch ethers v5→v6 for the clob-client
if (!wallet._signTypedData && wallet.signTypedData) {
  wallet._signTypedData = wallet.signTypedData.bind(wallet);
}

const address = await wallet.getAddress();
console.log('\nWallet address   :', address);
console.log('HOST             :', HOST);
console.log('');

const client = new ClobClient(HOST, CHAIN_ID, wallet);

try {
  const creds = await client.createOrDeriveApiKey();

  console.log('=== Add these to backend/.env ===\n');
  console.log('# Signer private key (for EIP-712 order signing)');
  console.log('POLY_SIGNER_KEY=' + PRIVATE_KEY);
  console.log('');
  console.log('# L2 API credentials (HMAC auth)');
  console.log('POLY_API_KEY='        + (creds.key || creds.apiKey));
  console.log('POLY_API_SECRET='     + creds.secret);
  console.log('POLY_API_PASSPHRASE=' + creds.passphrase);
  console.log('');
  console.log('# Keep these as-is:');
  console.log('# POLY_PROXY_ADDRESS=0x5C80661D2A4d688323Ff6d81d6f6bF10c4632fB3');
  console.log('# POLY_CLOB_HOST=https://clob.polymarket.com');
  console.log('# POLY_CHAIN_ID=137');
  console.log('');
  console.log('Then run: pm2 restart polychamp-api polychamp-trader --update-env');
} catch (err) {
  console.error('ERROR:', err?.message || JSON.stringify(err).slice(0, 400));
  if (err?.data) console.error('Data:', JSON.stringify(err.data).slice(0, 300));
  process.exit(1);
}
