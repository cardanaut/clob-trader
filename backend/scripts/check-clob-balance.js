'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ethers }   = require('@polymarket/order-utils/node_modules/ethers');
const { ClobClient, AssetType } = require('@polymarket/clob-client');

const HOST     = process.env.POLY_CLOB_HOST || 'https://clob.polymarket.com';
const CHAIN_ID = 137;

async function main() {
  const key    = (process.env.POLY_SIGNER_KEY || '').trim();
  const keyHex = /^[0-9a-fA-F]{64}$/.test(key) ? '0x' + key : key;
  const signer = new ethers.Wallet(keyHex);
  const eoa    = await signer.getAddress();
  const creds  = { key: process.env.POLY_API_KEY, secret: process.env.POLY_API_SECRET, passphrase: process.env.POLY_API_PASSPHRASE };
  const client = new ClobClient(HOST, CHAIN_ID, signer, creds);

  console.log('EOA:', eoa);
  console.log('API key:', process.env.POLY_API_KEY);

  try {
    const bal = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    console.log('\nCOLLATERAL (asset_type=0):', JSON.stringify(bal, null, 2));
  } catch(e) { console.error('COLLATERAL error:', e.message); }

  try {
    const bal = await client.getBalanceAllowance({ asset_type: AssetType.CONDITIONAL });
    console.log('\nCONDITIONAL (asset_type=1):', JSON.stringify(bal, null, 2));
  } catch(e) { console.error('CONDITIONAL error:', e.message); }
}

main().catch(e => { console.error(e.message); process.exit(1); });
