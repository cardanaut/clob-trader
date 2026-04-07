#!/usr/bin/env node
/**
 * Approve USDC - Direct on-chain approval for Polymarket contract
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { ethers } = require('ethers');
const config = require('./config');

// Polymarket CTF Exchange contract (the one that needs approval)
const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// USDC contract on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)'
];

async function main() {
  try {
    console.log('========================================');
    console.log('APPROVING USDC FOR POLYMARKET TRADING');
    console.log('========================================\n');

    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(config.LIVE_TRADING.POLYGON_RPC_URL);
    const wallet = new ethers.Wallet(config.LIVE_TRADING.PRIVATE_KEY, provider);

    console.log('Wallet Address:', wallet.address);
    console.log('USDC Contract:', USDC_ADDRESS);
    console.log('CTF Exchange Contract:', CTF_EXCHANGE_ADDRESS);
    console.log('RPC URL:', config.LIVE_TRADING.POLYGON_RPC_URL);
    console.log('\n========================================\n');

    // Create USDC contract instance
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);

    // Check current balance
    const balance = await usdcContract.balanceOf(wallet.address);
    const balanceUSDC = Number(balance) / 1e6;
    console.log('Current USDC Balance:', '$' + balanceUSDC.toFixed(2));

    // Check current allowance
    const currentAllowance = await usdcContract.allowance(wallet.address, CTF_EXCHANGE_ADDRESS);
    const currentAllowanceUSDC = Number(currentAllowance) / 1e6;
    console.log('Current Allowance:', '$' + currentAllowanceUSDC.toFixed(2));
    console.log('\n========================================\n');

    if (currentAllowanceUSDC > 0) {
      console.log('✅ Allowance already set! You have approval for $' + currentAllowanceUSDC.toFixed(2));
      console.log('No need to approve again.');
      return;
    }

    // Approve unlimited amount (max uint256)
    console.log('Setting unlimited approval for Polymarket CTF Exchange...');
    console.log('This will allow the contract to spend your USDC for trades.');
    console.log('\n⚠️  This requires a transaction on Polygon blockchain (small gas fee)');
    console.log('Submitting transaction...\n');

    const maxAmount = ethers.MaxUint256;
    const tx = await usdcContract.approve(CTF_EXCHANGE_ADDRESS, maxAmount);

    console.log('Transaction Hash:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();

    console.log('\n========================================');
    console.log('✅ APPROVAL SUCCESSFUL!');
    console.log('========================================');
    console.log('Block Number:', receipt.blockNumber);
    console.log('Gas Used:', receipt.gasUsed.toString());
    console.log('Transaction Fee:', ethers.formatEther(receipt.gasUsed * receipt.gasPrice) + ' MATIC');
    console.log('\n========================================\n');

    // Verify new allowance
    const newAllowance = await usdcContract.allowance(wallet.address, CTF_EXCHANGE_ADDRESS);
    const newAllowanceUSDC = Number(newAllowance) / 1e6;
    console.log('New Allowance:', newAllowanceUSDC > 1e12 ? 'UNLIMITED' : '$' + newAllowanceUSDC.toFixed(2));
    console.log('\n✅ You can now place orders on Polymarket!');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
