#!/usr/bin/env node
/**
 * Approve USDC from PROXY wallet
 * The proxy wallet has the funds, so it needs to approve the CTF Exchange
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
    console.log('APPROVING USDC FROM PROXY WALLET');
    console.log('========================================\n');

    const signerAddress = '0xaC410DFa874DC3e285663Dd615802973Cb23aA68';
    const proxyAddress = config.LIVE_TRADING.PROXY_ADDRESS;

    console.log('Signer Address:', signerAddress);
    console.log('Proxy Address:', proxyAddress);
    console.log('USDC Contract:', USDC_ADDRESS);
    console.log('CTF Exchange Contract:', CTF_EXCHANGE_ADDRESS);
    console.log('\n========================================\n');

    // Create provider and signer wallet
    const provider = new ethers.JsonRpcProvider(config.LIVE_TRADING.POLYGON_RPC_URL);
    const signerWallet = new ethers.Wallet(config.LIVE_TRADING.PRIVATE_KEY, provider);

    // Create USDC contract instance
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);

    // Check balances
    console.log('Checking balances...\n');
    const [signerBalance, proxyBalance] = await Promise.all([
      usdcContract.balanceOf(signerAddress),
      usdcContract.balanceOf(proxyAddress)
    ]);

    const signerUSDC = Number(signerBalance) / 1e6;
    const proxyUSDC = Number(proxyBalance) / 1e6;

    console.log('Signer Balance:', '$' + signerUSDC.toFixed(2));
    console.log('Proxy Balance:', '$' + proxyUSDC.toFixed(2));

    if (proxyUSDC === 0) {
      console.log('\n❌ Proxy wallet has $0 USDC!');
      console.log('You need to transfer USDC to the proxy address:', proxyAddress);
      process.exit(1);
    }

    // Check current allowance from proxy wallet
    const currentAllowance = await usdcContract.allowance(proxyAddress, CTF_EXCHANGE_ADDRESS);
    const currentAllowanceUSDC = Number(currentAllowance) / 1e6;
    console.log('\nCurrent Proxy Allowance:', currentAllowanceUSDC > 1e12 ? 'UNLIMITED' : '$' + currentAllowanceUSDC.toFixed(2));
    console.log('\n========================================\n');

    if (currentAllowanceUSDC > proxyUSDC) {
      console.log('✅ Allowance already sufficient! ($' + currentAllowanceUSDC.toFixed(2) + ')');
      console.log('No need to approve again.');
      return;
    }

    // For proxy wallets, we need to send the approve transaction
    // The transaction will be sent FROM the signer, but it will call approve() on the proxy's behalf
    console.log('Attempting to approve USDC spending from PROXY wallet...');
    console.log('NOTE: This requires the signer to have authority over the proxy.\n');

    // Connect USDC contract with signer wallet
    const usdcWithSigner = usdcContract.connect(signerWallet);

    // Check if signer has MATIC for gas
    const signerMatic = await provider.getBalance(signerAddress);
    console.log('Signer MATIC balance:', ethers.formatEther(signerMatic), 'MATIC');

    if (signerMatic === 0n) {
      console.log('\n❌ Signer wallet has no MATIC for gas fees!');
      console.log('Send some MATIC to:', signerAddress);
      process.exit(1);
    }

    console.log('\n⚠️  ISSUE: Cannot directly approve from proxy using signer key.');
    console.log('Proxy wallets (Gnosis Safe) require special transaction execution.\n');
    console.log('========================================');
    console.log('SOLUTIONS:');
    console.log('========================================\n');
    console.log('Option 1: Use Polymarket Relayer Client (gasless Safe transactions)');
    console.log('  - Documentation: https://docs.polymarket.com/#gasless-transactions\n');
    console.log('Option 2: Transfer USDC from proxy to signer wallet');
    console.log('  - From:', proxyAddress);
    console.log('  - To:', signerAddress);
    console.log('  - Amount: $' + proxyUSDC.toFixed(2));
    console.log('  - Then trade from signer wallet (EOA) instead of proxy\n');
    console.log('Option 3: Set approval through Safe interface');
    console.log('  - Use Gnosis Safe UI or Polymarket UI to approve CTF Exchange\n');
    console.log('========================================\n');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
