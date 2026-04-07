'use strict';
/**
 * add-bot.js — Add a new Polymarket EOA bot to the project
 * ──────────────────────────────────────────────────────────
 * Modes:
 *   node add-bot.js             → generate a fresh random wallet
 *   node add-bot.js --import    → prompt for an existing private key (hidden input)
 *
 * ⚠  NEVER pass the key as a CLI argument (node add-bot.js 0xABC…):
 *    it would appear in `ps aux` (visible to all server users) and in bash history.
 *    The --import prompt is hidden — never stored in history or process list.
 *
 * What this script does:
 *   1. Auto-detects the next available bot slot (POLY2_, POLY3_, …)
 *   2. Generates or imports a wallet (private key + address)
 *   3. Derives Polymarket L2 CLOB API credentials (no gas needed — just a signature)
 *   4. Backs up backend/.env  →  backend/.env.backup.YYYYMMDD_HHMMSS
 *   5. Appends the new bot's variables to backend/.env
 *   6. Prints a clear action checklist
 *
 * Bot credential naming convention:
 *   Bot 1 (original) : POLY_SIGNER_KEY,  POLY_API_KEY,  POLY_API_SECRET,  POLY_API_PASSPHRASE
 *   Bot 2            : POLY2_SIGNER_KEY, POLY2_API_KEY, POLY2_API_SECRET, POLY2_API_PASSPHRASE
 *   Bot 3            : POLY3_SIGNER_KEY, ...
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Resolve ethers (works from backend/ or scripts/ as cwd) ───────────────────
function loadEthers() {
  const tries = [
    path.resolve(__dirname, '../node_modules/@polymarket/order-utils/node_modules/ethers'),
    path.resolve(__dirname, '../node_modules/ethers'),
    '@polymarket/order-utils/node_modules/ethers',
    'ethers',
  ];
  for (const m of tries) {
    try { return require(m); } catch {}
  }
  throw new Error('ethers not found. Run from backend/ directory: node scripts/add-bot.js');
}

function loadClobClient() {
  const tries = [
    path.resolve(__dirname, '../node_modules/@polymarket/clob-client'),
    '@polymarket/clob-client',
  ];
  for (const m of tries) {
    try { return require(m); } catch {}
  }
  throw new Error('@polymarket/clob-client not found.');
}

// ── Paths ─────────────────────────────────────────────────────────────────────
const ENV_PATH     = path.resolve(__dirname, '../.env');
const WALLETS_PATH = path.resolve(__dirname, '../config/wallets.json');

// ── Read raw .env text ────────────────────────────────────────────────────────
function readEnv() {
  if (!fs.existsSync(ENV_PATH)) throw new Error('.env not found at ' + ENV_PATH);
  return fs.readFileSync(ENV_PATH, 'utf8');
}

// ── Detect next available bot number ─────────────────────────────────────────
// Bot 1 = plain POLY_  (no number suffix)
// Bot 2 = POLY2_, Bot 3 = POLY3_, …
function nextBotNumber(envText) {
  // Bot 1 always exists (POLY_SIGNER_KEY)
  let n = 2;
  while (envText.includes(`POLY${n}_SIGNER_KEY`)) n++;
  return n;
}

// ── Backup .env ───────────────────────────────────────────────────────────────
function backupEnv(envText) {
  const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dst = ENV_PATH + `.backup.${ts}`;
  fs.writeFileSync(dst, envText, 'utf8');
  return dst;
}

// ── Generate random private key ───────────────────────────────────────────────
function randomPrivateKey() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

// ── Prompt for private key with hidden input (no echo) ────────────────────────
// Uses raw mode so characters are never echoed — same security as `read -s` in bash.
// The key is NOT stored in bash history or visible in `ps aux`.
function promptPrivateKey() {
  return new Promise((resolve) => {
    process.stdout.write('  Enter private key (input hidden): ');

    let input = '';
    process.stdin.setRawMode(true);   // disable terminal echo
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') {              // Enter — done
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input.trim());
      } else if (ch === '\u0003') {                  // Ctrl+C
        process.stdout.write('\n');
        process.exit(0);
      } else if (ch === '\u007f' || ch === '\b') {   // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += ch;
        process.stdout.write('*');                   // echo * per character
      }
    };

    process.stdin.on('data', onData);
  });
}

// ── Validate and normalise a private key ─────────────────────────────────────
function normaliseKey(raw) {
  const hex = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]{64}$/.test(hex))
    throw new Error('Invalid private key — must be 64 hex characters (with or without 0x prefix).');
  return '0x' + hex.toLowerCase();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { ethers }     = loadEthers();
  const { ClobClient } = loadClobClient();

  const HOST     = process.env.POLY_CLOB_HOST || 'https://clob.polymarket.com';
  const CHAIN_ID = 137;

  // 1. Read existing .env
  const envText  = readEnv();
  const botNum   = nextBotNumber(envText);
  const prefix   = botNum === 1 ? 'POLY' : `POLY${botNum}`;

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  PolyChamp — Add Bot ${botNum}                                      ║`.slice(0,63) + '║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // 2. Generate or import wallet
  const importMode = process.argv.includes('--import');
  let privKey;

  if (importMode) {
    console.log('── Step 1: Importing existing private key ────────────────');
    console.log('  (Use this for a vanity address generated with walletgen)');
    console.log('  Input is hidden — not stored in history or visible in ps aux\n');
    const raw = await promptPrivateKey();
    try {
      privKey = normaliseKey(raw);
    } catch (err) {
      console.error(`\n  ✗  ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log('── Step 1: Generating random EOA wallet ──────────────────');
    console.log('  (Use --import to provide your own vanity key instead)\n');
    privKey = randomPrivateKey();
  }

  const wallet  = new ethers.Wallet(privKey);
  const address = await wallet.getAddress();
  console.log(`  Private key : ${privKey}`);
  console.log(`  Address     : ${address}`);
  console.log('  Network     : Polygon (chain 137) — same key works on all EVM chains\n');

  // 3. Derive L2 CLOB API credentials
  console.log('── Step 2: Deriving Polymarket L2 API credentials ────────');
  console.log('  (Signing a message — no gas required, needs internet)\n');

  let creds;
  try {
    const client = new ClobClient(HOST, CHAIN_ID, wallet);
    creds = await client.createOrDeriveApiKey();
    console.log(`  ✓  API Key        : ${creds.key}`);
    console.log(`  ✓  API Secret     : ${creds.secret}`);
    console.log(`  ✓  API Passphrase : ${creds.passphrase}\n`);
  } catch (err) {
    console.error(`  ✗  Failed to derive API credentials: ${err.message}`);
    console.error('     Check internet connection and POLY_CLOB_HOST value.');
    process.exit(1);
  }

  // 4. Backup .env
  console.log('── Step 3: Backing up .env ───────────────────────────────');
  const backupPath = backupEnv(envText);
  console.log(`  ✓  Backed up → ${backupPath}\n`);

  // 5. Append new bot block to .env
  console.log(`── Step 4: Writing ${prefix}_* to .env ──────────────────────`);
  const newBlock = [
    '',
    `#----- Bot ${botNum} — Polymarket EOA credentials (added by add-bot.js)`,
    `${prefix}_SIGNER_KEY=${privKey}`,
    `${prefix}_API_KEY=${creds.key}`,
    `${prefix}_API_SECRET=${creds.secret}`,
    `${prefix}_API_PASSPHRASE=${creds.passphrase}`,
    '',
  ].join('\n');

  fs.appendFileSync(ENV_PATH, newBlock, 'utf8');
  console.log(`  ✓  Appended ${prefix}_SIGNER_KEY, ${prefix}_API_KEY, ${prefix}_API_SECRET, ${prefix}_API_PASSPHRASE\n`);

  // 6. Register bot in wallets.json
  console.log('── Step 5: Registering bot in wallets.json ───────────────');
  const walletEntry = {
    id           : `bot${botNum}`,
    label        : `Bot ${botNum}`,
    enabled      : true,
    signerKey    : privKey,
    apiKey       : creds.key,
    apiSecret    : creds.secret,
    apiPassphrase: creds.passphrase,
  };
  let walletList = [];
  if (fs.existsSync(WALLETS_PATH)) {
    try { walletList = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8')); } catch {}
  }
  walletList.push(walletEntry);
  fs.writeFileSync(WALLETS_PATH, JSON.stringify(walletList, null, 2) + '\n', 'utf8');
  console.log(`  ✓  Added bot${botNum} to config/wallets.json\n`);

  // 7. Print action checklist
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  DONE — Action checklist                                 ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║                                                          ║');
  console.log(`║  Address : ${address.padEnd(46)}║`);
  console.log('║                                                          ║');
  console.log('║  □  1. Fund with POL on Polygon (gas, ~1 POL is enough) ║');
  console.log('║  □  2. Fund with USDC.e on Polygon (trading capital)    ║');
  console.log('║        Token: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174║');
  console.log('║                                                          ║');
  console.log('║  □  3. Run USDC allowance setup (one-time, needs gas):  ║');
  console.log(`║        POLY_SIGNER_KEY=${privKey.slice(0, 12)}… \\             ║`);
  console.log('║        node backend/scripts/polymarket-eoa-setup.js     ║');
  console.log('║                                                          ║');
  console.log('║  □  4. Restart API to activate the new bot:             ║');
  console.log('║        pm2 restart polychamp-api --update-env           ║');
  console.log('║                                                          ║');
  console.log(`║  ✓  .env updated (${prefix.padEnd(37)}║`);
  console.log(`║  ✓  config/wallets.json updated                         ║`);
  console.log('║                                                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('  ⚠  The private key is now in backend/.env — keep it secret.\n');
}

main().catch(err => {
  console.error('\n✗  Fatal error:', err.message);
  process.exit(1);
});
