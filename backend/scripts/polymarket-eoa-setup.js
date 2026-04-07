/**
 * Polymarket EOA Mode Setup
 * ─────────────────────────
 * Switches from Gnosis Safe proxy mode (SignatureType 2) to plain EOA mode (SignatureType 0).
 *
 * This script does:
 *   1. Derives (or creates) L2 API credentials tied to the EOA directly
 *   2. Sets on-chain native USDC allowances for CTF Exchange + NegRiskAdapter
 *   3. Calls updateBalanceAllowance so the CLOB refreshes its internal state
 *   4. Prints the new .env values to paste in
 *
 * Prerequisites before running:
 *   • EOA must hold some POL for gas (Polygon network)
 *   • EOA must hold USDC.e to trade (Polymarket CLOB still uses USDC.e — native USDC migration pending)
 *     Token: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 (USDC.e bridged) on Polygon
 *     Send to EOA: 0xaC410DFa874DC3e285663Dd615802973Cb23aA68
 *
 * Run: node backend/scripts/polymarket-eoa-setup.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ethers }     = require('@polymarket/order-utils/node_modules/ethers');
const { ClobClient, AssetType } = require('@polymarket/clob-client');

const HOST     = process.env.POLY_CLOB_HOST || 'https://clob.polymarket.com';
const CHAIN_ID = 137;

// ── Contracts (Polygon mainnet) ────────────────────────────────────────────────
// USDC.e (bridged) — still the Polymarket CLOB collateral as of Feb 2026 (native USDC migration announced but not yet deployed)
const USDC_ADDR          = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e (bridged USDC)
const CTF_EXCHANGE       = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_ADAPTER   = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';
const UINT256_MAX        = ethers.constants.MaxUint256;

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

function buildSigner() {
  const key = (process.env.POLY_SIGNER_KEY || '').trim();
  const keyHex = /^[0-9a-fA-F]{64}$/.test(key) ? '0x' + key : key;
  return new ethers.Wallet(
    keyHex,
    new ethers.providers.JsonRpcProvider('https://rpc-mainnet.matic.quiknode.pro')
  );
}

async function main() {
  const signer = buildSigner();
  const eoaAddress = await signer.getAddress();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Polymarket EOA Setup');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  EOA address   : ${eoaAddress}`);
  console.log(`  Proxy address : ${process.env.POLY_PROXY_ADDRESS}  (no longer used)`);
  console.log('');

  // ── 1. Check balances ───────────────────────────────────────────────────────
  const usdc = new ethers.Contract(USDC_ADDR, ERC20_ABI, signer);
  const polBalance   = await signer.provider.getBalance(eoaAddress);
  const usdcBalance  = await usdc.balanceOf(eoaAddress);
  const usdcDecimals = await usdc.decimals();

  console.log('── Balances on EOA ─────────────────────────────────────');
  console.log(`  POL (gas) : ${ethers.utils.formatEther(polBalance)} POL`);
  console.log(`  USDC    : ${ethers.utils.formatUnits(usdcBalance, usdcDecimals)} USDC`);

  if (polBalance.eq(0)) {
    console.error('\n❌ No POL for gas. Send some POL to', eoaAddress, 'on Polygon and re-run.');
    process.exit(1);
  }

  if (usdcBalance.eq(0)) {
    console.warn('\n⚠️  No USDC on EOA. Trades will fail until you fund:');
    console.warn(`   Send USDC to ${eoaAddress} on Polygon (token: ${USDC_ADDR})`);
    console.warn('   Continuing to set up credentials anyway…\n');
  }

  // ── 2. Derive L2 API credentials (EOA mode — no proxy address) ───────────────
  console.log('\n── Deriving L2 API credentials (EOA mode) ─────────────');
  const client = new ClobClient(HOST, CHAIN_ID, signer); // SignatureType defaults to EOA (0)
  let creds;
  try {
    creds = await client.createOrDeriveApiKey();
    console.log('  ✓ API credentials derived');
    console.log(`  key        : ${creds.key}`);
    console.log(`  secret     : ${creds.secret}`);
    console.log(`  passphrase : ${creds.passphrase}`);
  } catch (err) {
    console.error('  ✗ Failed to derive API key:', err.message);
    process.exit(1);
  }

  // ── 3. Set on-chain USDC allowances ─────────────────────────────────────────
  console.log('\n── Setting USDC allowances on Polygon ─────────────────');

  for (const [label, spender] of [
    ['CTF Exchange    ', CTF_EXCHANGE],
    ['NegRiskAdapter  ', NEG_RISK_ADAPTER],
  ]) {
    const existing = await usdc.allowance(eoaAddress, spender);
    if (existing.gt(UINT256_MAX.div(2))) {
      console.log(`  ✓ ${label} allowance already set (${ethers.utils.formatUnits(existing, usdcDecimals)})`);
      continue;
    }
    console.log(`  → Approving ${label} (${spender}) …`);
    try {
      const feeData   = await signer.provider.getFeeData();
      const minTip    = ethers.utils.parseUnits('30', 'gwei');
      const tip       = feeData.maxPriorityFeePerGas?.gt(minTip) ? feeData.maxPriorityFeePerGas : minTip;
      const base      = feeData.lastBaseFeePerGas ?? ethers.utils.parseUnits('120', 'gwei');
      const maxFee    = base.mul(2).add(tip);
      const tx = await usdc.approve(spender, UINT256_MAX, {
        maxPriorityFeePerGas: tip,
        maxFeePerGas:         maxFee,
      });
      console.log(`    tx: ${tx.hash}`);
      await tx.wait();
      console.log(`  ✓ ${label} approved`);
    } catch (err) {
      console.error(`  ✗ Approve failed for ${label}:`, err.message);
    }
  }

  // ── 4. Tell CLOB to refresh its allowance view ──────────────────────────────
  console.log('\n── Refreshing CLOB balance allowance view ──────────────');
  const authedClient = new ClobClient(HOST, CHAIN_ID, signer, {
    key: creds.key, secret: creds.secret, passphrase: creds.passphrase,
  });
  try {
    await authedClient.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    console.log('  ✓ CLOB balance refreshed');
  } catch (err) {
    console.warn('  ⚠ updateBalanceAllowance failed (non-fatal):', err.message);
  }

  // ── 5. Print .env values to update ──────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Update your backend/.env with these values:');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`POLY_API_KEY=${creds.key}`);
  console.log(`POLY_API_SECRET=${creds.secret}`);
  console.log(`POLY_API_PASSPHRASE=${creds.passphrase}`);
  console.log('');
  console.log('Also REMOVE or comment out POLY_PROXY_ADDRESS — it is not used in EOA mode.');
  console.log('\nThen restart the API: pm2 restart polychamp-api --update-env');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
