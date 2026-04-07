#!/usr/bin/env node
/**
 * Check On-Chain Balance
 * Checks USDC balance directly on Polygon blockchain
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { ethers } = require('ethers');
const config = require('./config');

// USDC contract on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function main() {
  try {
    console.log('========================================');
    console.log('CHECKING ON-CHAIN USDC BALANCES');
    console.log('========================================\n');

    // Create provider
    const provider = new ethers.JsonRpcProvider(config.LIVE_TRADING.POLYGON_RPC_URL);
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);

    // Check both addresses
    const signerAddress = '0xaC410DFa874DC3e285663Dd615802973Cb23aA68';
    const proxyAddress = config.LIVE_TRADING.PROXY_ADDRESS;

    console.log('Signer Address:', signerAddress);
    console.log('Proxy Address:', proxyAddress);
    console.log('USDC Contract:', USDC_ADDRESS);
    console.log('\n========================================\n');

    // Get balances
    const [signerBalance, proxyBalance, decimals] = await Promise.all([
      usdcContract.balanceOf(signerAddress),
      usdcContract.balanceOf(proxyAddress),
      usdcContract.decimals()
    ]);

    // Convert BigInt to number properly (USDC has 6 decimals)
    const signerUSDC = Number(signerBalance) / 1e6;
    const proxyUSDC = Number(proxyBalance) / 1e6;

    console.log('SIGNER BALANCE (0xaC410...):', '$' + signerUSDC.toFixed(2), 'USDC');
    console.log('PROXY BALANCE (0x5C806...):', '$' + proxyUSDC.toFixed(2), 'USDC');
    console.log('\n========================================\n');

    if (proxyUSDC === 0) {
      console.log('⚠️  PROBLEM FOUND!');
      console.log('⚠️  Proxy address has $0 USDC!');
      console.log('');
      console.log('SOLUTION:');
      console.log('You need to transfer USDC from your main account to the proxy address.');
      console.log('');
      console.log('In Polymarket UI:');
      console.log('1. Go to your wallet/portfolio');
      console.log('2. Look for "Transfer to Builder" or "Fund Builder Address"');
      console.log('3. Transfer some USDC (at least $20) to:', proxyAddress);
    } else {
      console.log('✅ Proxy has funds! The issue must be something else.');
    }

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
