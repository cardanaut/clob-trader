#!/usr/bin/env node
/**
 * trader_lookup.js — Polymarket trader info by wallet address or username
 *
 * Usage:
 *   node backend/scripts/trader_lookup.js 0xABC...          # proxy or EOA wallet
 *   node backend/scripts/trader_lookup.js polywhale         # Polymarket username
 *   node backend/scripts/trader_lookup.js polywhale --raw   # also dump raw JSON
 */

'use strict';

const axios  = require('axios');
const https  = require('https');

const DATA  = axios.create({ baseURL: 'https://data-api.polymarket.com', timeout: 15000, headers: { Accept: 'application/json' } });
const GAMMA = axios.create({ baseURL: 'https://gamma-api.polymarket.com', timeout: 15000, headers: { Accept: 'application/json' } });
const PM_WEB = axios.create({ baseURL: 'https://polymarket.com', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; trader-lookup/1.0)' } });

const RAW  = process.argv.includes('--raw');
const arg  = process.argv.slice(2).filter(a => !a.startsWith('-'))[0];

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i !== -1 ? parseInt(process.argv[i + 1], 10) || 2000 : 2000;
})();

if (!arg) {
  console.error('Usage: node trader_lookup.js <wallet_address_or_username> [--raw] [--limit N]');
  console.error('       wallet_address_or_username: 0x... proxy/EOA wallet, or Polymarket display name');
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isAddress(s) { return /^0x[0-9a-fA-F]{40}$/.test(s); }

function fmt$(n)   { return n == null ? '—' : `$${n.toFixed(2)}`; }
function fmtPct(n) { return n == null ? '—' : `${(n * 100).toFixed(1)}%`; }
function fmtN(n)   { return n == null ? '—' : n.toLocaleString(); }
function ago(ts) {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function safeGet(client, path, params) {
  try {
    const res = await client.get(path, params ? { params } : undefined);
    return res.data;
  } catch { return null; }
}

// ── username → proxy wallet via profile page scrape ──────────────────────────

async function resolveUsername(username) {
  process.stdout.write(`  Resolving username "${username}"...\n`);
  try {
    const res = await PM_WEB.get(`/profile/${username}`);
    const html = res.data;
    // Extract __NEXT_DATA__ JSON embedded in the page
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return null;
    const data = JSON.parse(m[1]);
    // Walk pageProps for proxyWallet / address
    const props = data?.props?.pageProps ?? {};
    const addr = props.proxyWallet
      || props.address
      || props.user?.proxyWallet
      || props.user?.address
      || props.profile?.address
      || props.profile?.proxyWallet;
    if (addr) return addr.toLowerCase();
    // Sometimes it's nested deeper — search all string values that look like 0x addresses
    const json = JSON.stringify(data);
    const matches = [...json.matchAll(/"(0x[0-9a-fA-F]{40})"/g)].map(x => x[1].toLowerCase());
    // Return the first non-zero address
    return matches.find(a => a !== '0x0000000000000000000000000000000000000000') ?? null;
  } catch (e) {
    console.error(`  Profile scrape failed: ${e.message}`);
    return null;
  }
}

// ── fetch activity (paginated up to 2000) ────────────────────────────────────

async function fetchAllActivity(address) {
  const results = [];
  let offset = 0;
  const pageSize = 500;
  while (true) {
    const batch = await safeGet(DATA, '/activity', { user: address, limit: pageSize, offset });
    if (!Array.isArray(batch) || batch.length === 0) break;
    results.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset >= LIMIT) break;
  }
  return results;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  let address = arg;
  let displayName = arg;

  if (!isAddress(arg)) {
    address = await resolveUsername(arg);
    if (!address) {
      console.error(`\n❌  Could not resolve "${arg}" to a wallet address.`);
      console.error('    Polymarket profile URLs use wallet addresses, not display names.');
      console.error('    To find a wallet address: go to polymarket.com/profile/<name>');
      console.error('    and copy the 0x... address from the URL or page, then re-run with that.\n');
      process.exit(1);
    }
    console.log(`  Resolved to: ${address}\n`);
  }

  // Fetch in parallel
  process.stdout.write('  Fetching data...\n');
  const [activity, valueRes, positionsRes] = await Promise.all([
    fetchAllActivity(address),
    safeGet(DATA, '/value',     { user: address }),
    safeGet(DATA, '/positions', { user: address, sizeThreshold: 0 }),
  ]);

  // ── Extract profile name from activity if available ──
  const profileName = (activity.find(e => e.name) || {}).name
    || (activity.find(e => e.pseudonym) || {}).pseudonym
    || null;
  if (profileName && profileName !== displayName) displayName = `${profileName} (${displayName})`;

  // ── Parse activity ──
  const trades  = activity.filter(e => e.type === 'TRADE');
  const buys    = trades.filter(e => e.side === 'BUY');
  const sells   = trades.filter(e => e.side === 'SELL');
  const redeems = activity.filter(e => e.type === 'REDEEM');

  const totalInvested  = buys.reduce((s, e) => s + (e.usdcSize || 0), 0);
  const totalSold      = sells.reduce((s, e) => s + (e.usdcSize || 0), 0);
  const totalRedeemed  = redeems.reduce((s, e) => s + (e.usdcSize || 0), 0);
  const avgBuySize     = buys.length ? totalInvested / buys.length : 0;
  const avgBuyPrice    = buys.length ? buys.reduce((s, e) => s + (e.price || 0), 0) / buys.length : 0;

  // Rough P&L: what came back (redeems + sells) vs what went in (buys)
  const roughPnl = totalRedeemed + totalSold - totalInvested;

  // Positions
  const positions = Array.isArray(positionsRes) ? positionsRes : [];
  const openPositions = positions.filter(p => !p.redeemable || p.currentValue > 0.01);
  const redeemable    = positions.filter(p => p.redeemable && p.currentValue <= 0.01);
  const realizedPnl   = positions.reduce((s, p) => s + (p.cashPnl || 0), 0);
  const unrealizedPnl = positions.reduce((s, p) => s + (p.currentValue - p.initialValue || 0), 0);
  const totalPortfolio = Array.isArray(valueRes) && valueRes[0]?.value ? parseFloat(valueRes[0].value) : null;

  // Win rate from positions (closed): positive cashPnl = win
  const closedWithPnl = positions.filter(p => p.cashPnl != null && p.totalBought > 0);
  const wins          = closedWithPnl.filter(p => p.cashPnl > 0).length;
  const losses        = closedWithPnl.filter(p => p.cashPnl <= 0).length;
  const winRate       = closedWithPnl.length ? wins / closedWithPnl.length : null;

  // Market breakdown by title (top 5 by trade count)
  const mktCounts = {};
  for (const t of buys) {
    const k = (t.title || 'Unknown').replace(/- \w+ \d+,.*/, '').trim(); // strip date suffix
    mktCounts[k] = (mktCounts[k] || 0) + 1;
  }
  const topMarkets = Object.entries(mktCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Most recent trade
  const lastTrade = trades.length
    ? trades.reduce((a, b) => (a.timestamp > b.timestamp ? a : b))
    : null;
  const firstTrade = trades.length
    ? trades.reduce((a, b) => (a.timestamp < b.timestamp ? a : b))
    : null;

  // ── Output ────────────────────────────────────────────────────────────────
  const line = (label, value, color) => {
    const RESET = '\x1b[0m'; const BOLD = '\x1b[1m'; const DIM = '\x1b[2m';
    const GREEN = '\x1b[32m'; const RED = '\x1b[31m'; const CYAN = '\x1b[36m'; const YELLOW = '\x1b[33m';
    const c = color === 'green' ? GREEN : color === 'red' ? RED : color === 'cyan' ? CYAN : color === 'yellow' ? YELLOW : '';
    console.log(`  ${DIM}${label.padEnd(22)}${RESET}${BOLD}${c}${value}${RESET}`);
  };
  const sep = (title) => console.log(`\n\x1b[2m${'─'.repeat(50)}\x1b[0m${title ? `  \x1b[33m${title}\x1b[0m` : ''}`);

  console.log();
  console.log(`\x1b[1m\x1b[36m  ⬡ Polymarket Trader Profile\x1b[0m`);
  sep();
  line('Address',        address);
  if (profileName) line('Name',           profileName, 'cyan');
  line('Profile URL',    `https://polymarket.com/profile/${profileName || address}`);

  sep('Activity');
  line('Total buys',     fmtN(buys.length));
  line('Total sells',    fmtN(sells.length));
  line('Total redeems',  fmtN(redeems.length));
  line('First trade',    firstTrade ? `${new Date(firstTrade.timestamp * 1000).toISOString().slice(0,10)} (${ago(firstTrade.timestamp)})` : '—');
  line('Last trade',     lastTrade  ? `${new Date(lastTrade.timestamp * 1000).toISOString().slice(0,10)} (${ago(lastTrade.timestamp)})` : '—');

  sep('Volume & P&L');
  line('Total invested',    fmt$(totalInvested));
  line('Total sold',        fmt$(totalSold));
  line('Total redeemed',    fmt$(totalRedeemed));
  line('Rough P&L',         fmt$(roughPnl), roughPnl >= 0 ? 'green' : 'red');
  line('Avg buy size',      fmt$(avgBuySize));
  line('Avg entry price',   fmtPct(avgBuyPrice));

  sep('Positions');
  line('Portfolio value',   totalPortfolio != null ? fmt$(totalPortfolio) : '—', 'cyan');
  line('Realized P&L',      fmt$(realizedPnl), realizedPnl >= 0 ? 'green' : 'red');
  line('Unrealized P&L',    fmt$(unrealizedPnl), unrealizedPnl >= 0 ? 'green' : 'red');
  line('Open positions',    fmtN(openPositions.length));
  line('Redeemable',        fmtN(redeemable.length));

  sep('Win Rate (closed positions)');
  if (closedWithPnl.length) {
    line('Positions analyzed', fmtN(closedWithPnl.length));
    line('Wins',               fmtN(wins), 'green');
    line('Losses',             fmtN(losses), 'red');
    line('Win rate',           fmtPct(winRate), winRate >= 0.55 ? 'green' : winRate >= 0.45 ? 'yellow' : 'red');
  } else {
    line('Win rate',           'not enough resolved data');
  }

  if (topMarkets.length) {
    sep('Top Markets (by trade count)');
    for (const [name, count] of topMarkets) {
      line(`${count}x`, name.slice(0, 45));
    }
  }

  if (openPositions.length) {
    sep('Open Positions');
    for (const p of openPositions.slice(0, 8)) {
      const pnlColor = p.cashPnl >= 0 ? 'green' : 'red';
      const pnlStr   = fmt$(p.currentValue);
      const pctStr   = p.percentPnl != null ? ` (${p.percentPnl.toFixed(1)}%)` : '';
      line(p.outcome || '?', `${p.title?.slice(0, 35) || '?'} — ${pnlStr}${pctStr}`);
    }
    if (openPositions.length > 8) console.log(`  \x1b[2m  ...and ${openPositions.length - 8} more\x1b[0m`);
  }

  sep();
  console.log();

  if (RAW) {
    console.log('\n── RAW DATA ──────────────────────────────');
    console.log(JSON.stringify({ address, activity: activity.slice(0, 20), positions: positions.slice(0, 10), value: valueRes }, null, 2));
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
