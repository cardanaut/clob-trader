'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { ethers } = require('@polymarket/order-utils/node_modules/ethers');

const EOA     = '0xaC410DFa874DC3e285663Dd615802973Cb23aA68';
const USDC_E  = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e (bridged) — CLOB pre-flight
const NATIVE  = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // native USDC — actual trading
const ABI     = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];

(async () => {
  const provider = new ethers.providers.JsonRpcProvider('https://rpc-mainnet.matic.quiknode.pro');
  const ue = new ethers.Contract(USDC_E, ABI, provider);
  const un = new ethers.Contract(NATIVE, ABI, provider);
  const pol = await provider.getBalance(EOA);
  const [be, de, bn, dn] = await Promise.all([ue.balanceOf(EOA), ue.decimals(), un.balanceOf(EOA), un.decimals()]);
  console.log(`EOA: ${EOA}`);
  console.log(`POL (gas):        ${ethers.utils.formatEther(pol)} POL`);
  console.log(`USDC.e (bridged): ${ethers.utils.formatUnits(be, de)} — CLOB pre-flight checks this`);
  console.log(`Native USDC:      ${ethers.utils.formatUnits(bn, dn)} — actual trading capital`);
})().catch(e => { console.error(e.message); process.exit(1); });
