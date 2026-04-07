'use strict';
/**
 * rotate-eoa.js — rotate to a fresh EOA to break on-chain trade history linkage.
 *
 * Usage:  node backend/scripts/rotate-eoa.js
 *
 * What it does:
 *  1. Generates a brand-new random EOA
 *  2. Sends 0.10 POL (gas money) from old → new EOA
 *  3. Transfers all USDC.e from old → new EOA
 *  4. Derives Polymarket API credentials for the new EOA
 *  5. Sets USDC allowances on CTF Exchange + NegRiskAdapter
 *  6. Refreshes CLOB allowance cache
 *  7. Backs up backend/.env → backend/.env.bak, then updates it in-place
 *
 * Prerequisites:
 *  • No unredeemed WIN positions on the current EOA (they stay on the old EOA — script checks)
 *  • Old EOA must have ≥ 0.15 POL (enough for transfers + keeping a small amount for old tx signing)
 *
 * After running:  pm2 restart polychamp-api --update-env
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs      = require('fs');
const path    = require('path');
const { ethers }            = require('@polymarket/order-utils/node_modules/ethers');
const { ClobClient, AssetType } = require('@polymarket/clob-client');

const HOST     = process.env.POLY_CLOB_HOST || 'https://clob.polymarket.com';
const CHAIN_ID = 137;
const RPC      = 'https://rpc-mainnet.matic.quiknode.pro';

const USDC_ADDR        = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e on Polygon
const CTF_EXCHANGE     = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';
const UINT256_MAX      = ethers.constants.MaxUint256;
const POL_FOR_NEW_EOA  = ethers.utils.parseEther('0.10'); // covers ~100 txs at typical Polygon gas

const ERC20_ABI = [
  'function allowance(address, address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address, uint256) returns (bool)',
];

// ── helpers ───────────────────────────────────────────────────────────────────

function buildOldSigner(provider) {
  const raw = (process.env.POLY_SIGNER_KEY || '').trim();
  if (!raw) throw new Error('POLY_SIGNER_KEY not set in .env');
  const hex = /^[0-9a-fA-F]{64}$/.test(raw) ? '0x' + raw : raw;
  return new ethers.Wallet(hex, provider);
}

async function gasFeeOptions(provider) {
  const fd  = await provider.getFeeData();
  const tip = fd.maxPriorityFeePerGas ?? ethers.utils.parseUnits('30', 'gwei');
  const base= fd.lastBaseFeePerGas    ?? ethers.utils.parseUnits('120', 'gwei');
  return { maxPriorityFeePerGas: tip, maxFeePerGas: base.mul(2).add(tip) };
}

function updateEnvFile(envPath, updates) {
  let content = fs.readFileSync(envPath, 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  fs.writeFileSync(envPath, content);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const provider  = new ethers.providers.JsonRpcProvider(RPC);
  const oldSigner = buildOldSigner(provider);
  const oldAddr   = await oldSigner.getAddress();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Polychamp — EOA Rotation');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Current EOA : ${oldAddr}`);

  // ── Guard: no unredeemed WINs ──────────────────────────────────────────────
  const statePath = path.join(__dirname, '../../logs/t1000-state.json');
  if (fs.existsSync(statePath)) {
    const liveLog = JSON.parse(fs.readFileSync(statePath, 'utf8')).LIVE?.activityLog || [];
    const stuck   = liveLog.filter(e => e.status === 'WIN' && !e.redeemed);
    if (stuck.length > 0) {
      console.error('\n⛔  Cannot rotate — unredeemed WIN(s) still tied to current EOA:');
      stuck.forEach(e => console.error(`     ${e.tradeId}`));
      console.error('   Wait for auto-redemption or run manual-redeem.js first.\n');
      process.exit(1);
    }
  }

  // ── Check old EOA balances ─────────────────────────────────────────────────
  const usdcOld     = new ethers.Contract(USDC_ADDR, ERC20_ABI, oldSigner);
  const decimals    = await usdcOld.decimals();
  const usdcBal     = await usdcOld.balanceOf(oldAddr);
  const polBal      = await provider.getBalance(oldAddr);
  const minPol      = POL_FOR_NEW_EOA.add(ethers.utils.parseEther('0.05')); // 0.15 POL minimum

  console.log(`  USDC.e      : ${ethers.utils.formatUnits(usdcBal, decimals)}`);
  console.log(`  POL (gas)   : ${ethers.utils.formatEther(polBal)}`);

  if (polBal.lt(minPol)) {
    console.error(`\n❌  Need ≥ ${ethers.utils.formatEther(minPol)} POL on current EOA. Have ${ethers.utils.formatEther(polBal)}.`);
    process.exit(1);
  }

  // ── Generate new EOA ───────────────────────────────────────────────────────
  const newWallet = ethers.Wallet.createRandom().connect(provider);
  const newAddr   = newWallet.address;
  const newKeyHex = newWallet.privateKey; // with 0x prefix
  const newKeyRaw = newKeyHex.slice(2);   // without 0x (matches .env convention)

  console.log(`\n  New EOA     : ${newAddr}`);

  // ── Step 1: Fund new EOA with POL for gas ──────────────────────────────────
  console.log('\n── [1/5] Send POL for gas to new EOA ──────────────────────');
  const feeOpts = await gasFeeOptions(provider);
  let tx = await oldSigner.sendTransaction({ to: newAddr, value: POL_FOR_NEW_EOA, ...feeOpts });
  console.log(`  tx: ${tx.hash}`);
  await tx.wait();
  console.log(`  ✓ ${ethers.utils.formatEther(POL_FOR_NEW_EOA)} POL sent`);

  // ── Step 2: Transfer USDC.e ────────────────────────────────────────────────
  if (usdcBal.gt(0)) {
    console.log('\n── [2/5] Transfer USDC.e to new EOA ───────────────────────');
    const feeOpts2 = await gasFeeOptions(provider);
    tx = await usdcOld.transfer(newAddr, usdcBal, feeOpts2);
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ ${ethers.utils.formatUnits(usdcBal, decimals)} USDC.e transferred`);
  } else {
    console.log('\n── [2/5] No USDC.e to transfer (skipped) ───────────────────');
  }

  // ── Step 3: Derive Polymarket API credentials for new EOA ─────────────────
  console.log('\n── [3/5] Derive Polymarket API credentials ─────────────────');
  const client = new ClobClient(HOST, CHAIN_ID, newWallet);
  let creds;
  try {
    creds = await client.createOrDeriveApiKey();
    console.log('  ✓ Credentials derived');
  } catch (err) {
    console.error('  ✗ Failed to derive API key:', err.message);
    process.exit(1);
  }

  // ── Step 4: Set USDC allowances on Polygon ────────────────────────────────
  console.log('\n── [4/5] Set on-chain USDC allowances ──────────────────────');
  const usdcNew = new ethers.Contract(USDC_ADDR, ERC20_ABI, newWallet);
  for (const [label, spender] of [
    ['CTF Exchange  ', CTF_EXCHANGE],
    ['NegRiskAdapter', NEG_RISK_ADAPTER],
  ]) {
    const existing = await usdcNew.allowance(newAddr, spender);
    if (existing.gt(UINT256_MAX.div(2))) {
      console.log(`  ✓ ${label} already approved`);
      continue;
    }
    const feeOpts3 = await gasFeeOptions(provider);
    tx = await usdcNew.approve(spender, UINT256_MAX, feeOpts3);
    console.log(`  → ${label}: tx ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ ${label} approved`);
  }

  // Refresh CLOB allowance view
  try {
    const authed = new ClobClient(HOST, CHAIN_ID, newWallet, creds);
    await authed.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    console.log('  ✓ CLOB allowance refreshed');
  } catch (err) {
    console.warn('  ⚠  updateBalanceAllowance (non-fatal):', err.message);
  }

  // ── Step 5: Update .env ────────────────────────────────────────────────────
  console.log('\n── [5/5] Updating backend/.env ─────────────────────────────');
  const envPath = path.join(__dirname, '../.env');
  const bakPath = envPath + '.bak';

  // Backup first
  fs.copyFileSync(envPath, bakPath);
  console.log(`  ✓ Backed up to ${bakPath}`);

  updateEnvFile(envPath, {
    POLY_SIGNER_KEY    : newKeyRaw,
    POLY_API_KEY       : creds.key,
    POLY_API_SECRET    : creds.secret,
    POLY_API_PASSPHRASE: creds.passphrase,
  });
  console.log('  ✓ .env updated');

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Rotation complete ✓');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Old EOA (retired) : ${oldAddr}`);
  console.log(`  New EOA (active)  : ${newAddr}`);
  console.log('');
  console.log('  Next step:');
  console.log('    pm2 restart polychamp-api --update-env');
  console.log('');
  console.log('  Old .env backed up at backend/.env.bak — delete when no');
  console.log('  old positions remain on-chain.');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
