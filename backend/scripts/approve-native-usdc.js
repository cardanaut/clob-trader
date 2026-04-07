/**
 * Approve native USDC for Polymarket contracts
 * ─────────────────────────────────────────────
 * The EOA setup script only approved USDC.e (0x2791...).
 * Polymarket CLOB now uses native USDC (0x3c499c...) as collateral.
 * This script sets MaxUint256 allowance for both contracts and refreshes the CLOB cache.
 *
 * Run: node backend/scripts/approve-native-usdc.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ethers }   = require('@polymarket/order-utils/node_modules/ethers');
const { ClobClient, AssetType } = require('@polymarket/clob-client');

const HOST     = process.env.POLY_CLOB_HOST || 'https://clob.polymarket.com';
const CHAIN_ID = 137;

const NATIVE_USDC      = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // native USDC on Polygon
const CTF_EXCHANGE     = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';
const UINT256_MAX      = ethers.constants.MaxUint256;

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

async function main() {
  const key    = (process.env.POLY_SIGNER_KEY || '').trim();
  const keyHex = /^[0-9a-fA-F]{64}$/.test(key) ? '0x' + key : key;
  const signer = new ethers.Wallet(
    keyHex,
    new ethers.providers.JsonRpcProvider('https://rpc-mainnet.matic.quiknode.pro')
  );
  const eoa = await signer.getAddress();

  console.log('\n═══════════════════════════════════════════════════');
  console.log(' Approve native USDC for Polymarket contracts');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  EOA: ${eoa}`);

  const usdc = new ethers.Contract(NATIVE_USDC, ERC20_ABI, signer);
  const bal  = await usdc.balanceOf(eoa);
  const dec  = await usdc.decimals();
  console.log(`  Native USDC balance: ${ethers.utils.formatUnits(bal, dec)} USDC\n`);

  for (const [label, spender] of [
    ['CTF Exchange    ', CTF_EXCHANGE],
    ['NegRiskAdapter  ', NEG_RISK_ADAPTER],
  ]) {
    const existing = await usdc.allowance(eoa, spender);
    if (existing.gt(UINT256_MAX.div(2))) {
      console.log(`  ✓ ${label} already approved (${ethers.utils.formatUnits(existing, dec)})`);
      continue;
    }
    console.log(`  → Approving ${label} ...`);
    const feeData = await signer.provider.getFeeData();
    const minTip  = ethers.utils.parseUnits('30', 'gwei');
    const tip     = feeData.maxPriorityFeePerGas?.gt(minTip) ? feeData.maxPriorityFeePerGas : minTip;
    const base    = feeData.lastBaseFeePerGas ?? ethers.utils.parseUnits('120', 'gwei');
    const tx      = await usdc.approve(spender, UINT256_MAX, {
      maxPriorityFeePerGas: tip,
      maxFeePerGas: base.mul(2).add(tip),
    });
    console.log(`    tx: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ ${label} approved`);
  }

  console.log('\n── Refreshing CLOB balance/allowance cache ─────────');
  const creds  = { key: process.env.POLY_API_KEY, secret: process.env.POLY_API_SECRET, passphrase: process.env.POLY_API_PASSPHRASE };
  const client = new ClobClient(HOST, CHAIN_ID, signer, creds);
  try {
    await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    console.log('  ✓ CLOB cache refreshed');
  } catch (err) {
    console.warn('  ⚠ updateBalanceAllowance failed (non-fatal):', err.message);
  }

  console.log('\n✅ Done. Restart pm2: pm2 restart polychamp-api --update-env\n');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
