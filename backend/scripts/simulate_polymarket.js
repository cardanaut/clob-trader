#!/usr/bin/env node
'use strict';

/**
 * Polymarket CLOB Signal Simulator
 *
 * Reads spike_prices_polymarket.csv, filters signals where CLOB ≤ threshold,
 * fetches actual Binance cycle-end prices to determine real outcomes, and
 * simulates P&L with configurable balance and risk %.
 *
 * Usage:
 *   node simulate_polymarket.js [options]
 *
 * Options:
 *   -t, --threshold <0-1>    Max CLOB entry price (default: 0.90)
 *   -b, --balance <usd>      Starting balance in USD (default: 1000)
 *   -r, --risk <pct>         % of balance risked per trade (default: 5)
 *   -m, --minute <1|2|3>     Filter by minute_in_cycle only (default: all)
 *   -c, --crypto <sym>       Filter by crypto: BTC ETH SOL XRP (default: all)
 *   -v, --verbose            Show each individual trade
 *       --csv <path>         Path to CSV file
 *       --ev                 Use Black-Scholes fair value for EV (no Binance fetch)
 *       --no-cache           Force re-fetch Binance data (ignore cache)
 *
 * Examples:
 *   node simulate_polymarket.js --threshold 0.88
 *   node simulate_polymarket.js -t 0.85 -r 3 --minute 1 --verbose
 *   node simulate_polymarket.js -t 0.90 --ev
 *   node simulate_polymarket.js -t 0.88 --crypto BTC ETH
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── CLI Argument Parsing ───────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getArg(flags, defaultVal) {
  for (const flag of flags) {
    const i = argv.indexOf(flag);
    if (i !== -1 && i + 1 < argv.length) return argv[i + 1];
  }
  return defaultVal;
}

function hasFlag(flags) {
  return flags.some(f => argv.includes(f));
}

// Multi-value: --crypto BTC ETH → ['BTC', 'ETH']
function getMultiArg(flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const values = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('-'); j++) {
    values.push(argv[j].toUpperCase());
  }
  return values.length > 0 ? values : null;
}

const CFG = {
  threshold : parseFloat(getArg(['-t', '--threshold'], '0.90')),
  balance   : parseFloat(getArg(['-b', '--balance'],   '1000')),
  risk      : parseFloat(getArg(['-r', '--risk'],      '5')) / 100,
  minute    : getArg(['-m', '--minute'], null) ? parseInt(getArg(['-m', '--minute'], null)) : null,
  cryptos   : getMultiArg('--crypto') || getMultiArg('-c') || null,
  verbose   : hasFlag(['-v', '--verbose']),
  useEV     : hasFlag(['--ev']),
  noCache   : hasFlag(['--no-cache']),
  csvFile   : getArg(['--csv'], path.join(__dirname, '../logs/spike_prices_polymarket.csv')),
};

const CACHE_FILE = path.join(__dirname, '../logs/.sim_binance_cache.json');

// ── Helpers ────────────────────────────────────────────────────────────────────

const BINANCE_SYMBOL = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', XRP: 'XRPUSDT' };

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 8000 }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse failed: ' + data.slice(0, 100))); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

// Fetch the Binance 1-minute candle that CLOSES at cycleEndMs.
// Returns the close price, or null on failure.
async function fetchBinanceClose(symbol, cycleEndMs) {
  // The kline that closes at cycleEndMs starts 60s earlier
  const startTime = cycleEndMs - 60_000;
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startTime}&limit=1`;
  try {
    const data = await httpsGet(url);
    if (!Array.isArray(data) || data.length === 0) return null;
    return parseFloat(data[0][4]); // index 4 = close
  } catch {
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const c = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  green  : '\x1b[32m',
  red    : '\x1b[31m',
  yellow : '\x1b[33m',
  cyan   : '\x1b[36m',
  grey   : '\x1b[90m',
  white  : '\x1b[97m',
};

// ── Load & Parse CSV ───────────────────────────────────────────────────────────

if (!fs.existsSync(CFG.csvFile)) {
  console.error(`CSV not found: ${CFG.csvFile}`);
  process.exit(1);
}

const lines   = fs.readFileSync(CFG.csvFile, 'utf8').trim().split('\n');
const headers = lines[0].split(',');
const allRows = lines.slice(1).map(l => {
  const v = l.split(',');
  return Object.fromEntries(headers.map((h, i) => [h, v[i]]));
});

const rows = allRows.map(r => ({
  timestamp    : new Date(r.timestamp),
  crypto       : r.crypto,
  signal_type  : r.signal_type,     // BUY_YES | BUY_NO
  spike_pct    : parseFloat(r.spike_pct),
  minute       : parseInt(r.minute_in_cycle),
  mins_rem     : parseFloat(r.mins_remaining),
  ref_price    : parseFloat(r.reference_price),
  yes_ask      : parseFloat(r.yes_ask_clob),
  no_ask       : parseFloat(r.no_ask_clob),
  yes_fair_bs  : parseFloat(r.yes_fair_bs),
  no_fair_bs   : parseFloat(r.no_fair_bs),
  market_slug  : r.market_slug,
})).filter(r => !isNaN(r.yes_ask) && !isNaN(r.ref_price));

// ── Filter ─────────────────────────────────────────────────────────────────────

const filtered = rows.filter(r => {
  if (CFG.minute  && r.minute !== CFG.minute)              return false;
  if (CFG.cryptos && !CFG.cryptos.includes(r.crypto))      return false;
  return true;
});

// For each row: entry price = yes_ask (BUY_YES) or no_ask (BUY_NO)
const withEntry = filtered.map(r => ({
  ...r,
  entry_price : r.signal_type === 'BUY_YES' ? r.yes_ask : r.no_ask,
  fair_value  : r.signal_type === 'BUY_YES' ? r.yes_fair_bs : r.no_fair_bs,
  win_direction: r.signal_type === 'BUY_YES' ? 'UP' : 'DOWN',
}));

// Apply threshold filter
const tradeable = withEntry.filter(r => r.entry_price > 0 && r.entry_price <= CFG.threshold);

// ── Print Config ───────────────────────────────────────────────────────────────

console.log(`\n${c.bold}${c.cyan}═══ Polymarket CLOB Simulator ═══${c.reset}`);
console.log(`${c.grey}CSV:${c.reset}       ${CFG.csvFile}`);
console.log(`${c.grey}Threshold:${c.reset} ${c.bold}≤${(CFG.threshold * 100).toFixed(0)}¢${c.reset}  (max entry price)`);
console.log(`${c.grey}Balance:${c.reset}   $${CFG.balance.toFixed(0)} starting`);
console.log(`${c.grey}Risk/trade:${c.reset} ${(CFG.risk * 100).toFixed(1)}% of current balance`);
console.log(`${c.grey}Mode:${c.reset}      ${CFG.useEV ? 'Expected Value (Black-Scholes fair)' : 'Real outcomes (Binance close price)'}`);
if (CFG.minute)  console.log(`${c.grey}Filter:${c.reset}    Minute ${CFG.minute} only`);
if (CFG.cryptos) console.log(`${c.grey}Filter:${c.reset}    Cryptos: ${CFG.cryptos.join(', ')}`);
console.log(`\n${c.grey}Total signals in CSV:${c.reset}    ${filtered.length}`);
console.log(`${c.grey}Tradeable (≤${(CFG.threshold*100).toFixed(0)}¢):${c.reset}    ${tradeable.length} (${(tradeable.length/filtered.length*100).toFixed(1)}%)`);

if (tradeable.length === 0) {
  console.log(`\n${c.yellow}No tradeable signals at threshold ≤${(CFG.threshold*100).toFixed(0)}¢${c.reset}`);
  process.exit(0);
}

// ── EV Mode (no Binance fetch) ─────────────────────────────────────────────────

async function runEVMode() {
  console.log(`\n${c.bold}─── Expected Value Mode (Black-Scholes fair prices) ───${c.reset}\n`);

  let balance = CFG.balance;
  let wins = 0, losses = 0, totalPnl = 0;
  const byMinute = {}, byCrypto = {};
  const evRows = [];

  for (const r of tradeable) {
    const pos  = balance * CFG.risk;
    const fair = r.fair_value;
    const edge = fair - r.entry_price;                     // positive = edge for us
    const pnl  = pos * edge / r.entry_price;               // EV-based P&L
    const isEdge = edge >= 0;

    balance  += pnl;
    totalPnl += pnl;
    if (isEdge) wins++; else losses++;

    // By minute
    const mk = `T+${r.minute}`;
    if (!byMinute[mk]) byMinute[mk] = { trades: 0, pnl: 0, edge_sum: 0 };
    byMinute[mk].trades++;
    byMinute[mk].pnl += pnl;
    byMinute[mk].edge_sum += edge * 100;

    // By crypto
    if (!byCrypto[r.crypto]) byCrypto[r.crypto] = { trades: 0, pnl: 0 };
    byCrypto[r.crypto].trades++;
    byCrypto[r.crypto].pnl += pnl;

    evRows.push({ r, fair, edge, pnl, isEdge, balance });
  }

  if (CFG.verbose) {
    const hdr = [
      'Time'.padEnd(5),
      'Sym'.padEnd(3),
      'Min'.padEnd(3),
      'Dir'.padEnd(3),
      'Entry'.padStart(5),
      'Fair'.padStart(5),
      'Edge'.padStart(7),
      'EV P&L'.padStart(8),
      'Balance'.padStart(9),
    ].join('  ');
    const sep = '─'.repeat(hdr.length);
    console.log(`${c.bold}${c.grey}${hdr}${c.reset}`);
    console.log(`${c.grey}${sep}${c.reset}`);

    for (const { r, fair, edge, pnl, balance: bal } of evRows) {
      const edgeFmt = edge >= 0
        ? `${c.green}${((edge >= 0 ? '+' : '') + (edge*100).toFixed(1) + '¢').padStart(7)}${c.reset}`
        : `${c.red}${((edge*100).toFixed(1) + '¢').padStart(7)}${c.reset}`;
      const pnlFmt = pnl >= 0
        ? `${c.green}${('+$' + pnl.toFixed(2)).padStart(8)}${c.reset}`
        : `${c.red}${('-$' + Math.abs(pnl).toFixed(2)).padStart(8)}${c.reset}`;
      const dir = r.signal_type === 'BUY_YES' ? 'YES' : 'NO ';
      console.log(
        `${r.timestamp.toISOString().slice(11,16)}  ` +
        `${r.crypto.padEnd(3)}  ` +
        `T+${r.minute}  ` +
        `${dir}  ` +
        `${((r.entry_price*100).toFixed(0)+'¢').padStart(5)}  ` +
        `${((fair*100).toFixed(0)+'¢').padStart(5)}  ` +
        `${edgeFmt}  ` +
        `${pnlFmt}  ` +
        `${'$'+bal.toFixed(0)}`.padStart(9)
      );
    }
    console.log(`${c.grey}${'─'.repeat(hdr.length)}${c.reset}\n`);
  }

  printSummary({ balance, wins, losses, totalPnl, byMinute, byCrypto, mode: 'EV' });
}

// ── Real Outcome Mode (Binance close) ─────────────────────────────────────────

async function runRealMode() {
  // Load cache
  let cache = {};
  if (!CFG.noCache && fs.existsSync(CACHE_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch {}
  }

  console.log(`\n${c.bold}─── Fetching Binance resolution prices... ───${c.reset}`);

  // Collect unique (symbol, cycleEndMs) pairs to fetch
  const toFetch = [];
  for (const r of tradeable) {
    const symbol     = BINANCE_SYMBOL[r.crypto];
    const cycleEndMs = r.timestamp.getTime() + Math.round(r.mins_rem * 60_000);
    // Round to nearest minute boundary for cache key
    const roundedEnd = Math.round(cycleEndMs / 60_000) * 60_000;
    const key        = `${symbol}_${roundedEnd}`;
    if (!(key in cache)) toFetch.push({ symbol, cycleEndMs: roundedEnd, key });
  }

  // Deduplicate
  const unique = [...new Map(toFetch.map(x => [x.key, x])).values()];
  if (unique.length > 0) {
    process.stdout.write(`Fetching ${unique.length} prices from Binance`);
    for (const { symbol, cycleEndMs, key } of unique) {
      const close = await fetchBinanceClose(symbol, cycleEndMs);
      cache[key]  = close;
      process.stdout.write('.');
      await sleep(120); // avoid rate limit (~8 req/s)
    }
    console.log(' done');
    // Save cache
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } else {
    console.log('All prices loaded from cache.');
  }

  console.log(`\n${c.bold}─── Trade Results ───${c.reset}\n`);

  let balance = CFG.balance;
  let wins = 0, losses = 0, skipped = 0, totalPnl = 0;
  const byMinute = {}, byCrypto = {};
  const tradeRows = []; // collect for table display

  for (const r of tradeable) {
    const symbol     = BINANCE_SYMBOL[r.crypto];
    const cycleEndMs = Math.round((r.timestamp.getTime() + Math.round(r.mins_rem * 60_000)) / 60_000) * 60_000;
    const key        = `${symbol}_${cycleEndMs}`;
    const closePrice = cache[key];

    if (closePrice == null) {
      skipped++;
      tradeRows.push({ skip: true, r });
      continue;
    }

    // Win condition: compare final Binance close to reference (T+0 open)
    const isUp   = closePrice > r.ref_price;
    const isWin  = (r.signal_type === 'BUY_YES' && isUp) || (r.signal_type === 'BUY_NO' && !isUp);

    const pos  = balance * CFG.risk;
    let pnl;
    if (isWin) {
      pnl = pos * (1 - r.entry_price) / r.entry_price;
    } else {
      pnl = -pos;
    }

    balance  += pnl;
    totalPnl += pnl;
    if (isWin) wins++; else losses++;

    // By minute
    const mk = `T+${r.minute}`;
    if (!byMinute[mk]) byMinute[mk] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
    byMinute[mk].trades++;
    byMinute[mk].pnl += pnl;
    if (isWin) byMinute[mk].wins++; else byMinute[mk].losses++;

    // By crypto
    if (!byCrypto[r.crypto]) byCrypto[r.crypto] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
    byCrypto[r.crypto].trades++;
    byCrypto[r.crypto].pnl += pnl;
    if (isWin) byCrypto[r.crypto].wins++; else byCrypto[r.crypto].losses++;

    tradeRows.push({ skip: false, r, isWin, isUp, pnl, closePrice, balance });
  }

  if (CFG.verbose) {
    // Table header
    const hdr = [
      'Date/Time'.padEnd(16),
      'Sym'.padEnd(3),
      'Min'.padEnd(3),
      'Dir'.padEnd(3),
      'Entry'.padStart(5),
      'Spike'.padStart(6),
      'Close'.padStart(7),
      'Result'.padEnd(4),
      'P&L'.padStart(8),
      'Balance'.padStart(9),
    ].join('  ');
    const sep = '─'.repeat(hdr.length);
    console.log(`${c.bold}${c.grey}${hdr}${c.reset}`);
    console.log(`${c.grey}${sep}${c.reset}`);

    for (const row of tradeRows) {
      if (row.skip) {
        console.log(
          `${c.grey}${row.r.timestamp.toISOString().slice(0,16)}  ${row.r.crypto.padEnd(3)}  ` +
          `${'?'.padEnd(3)}  ${'?'.padEnd(3)}  ${'?'.padStart(5)}  ${'?'.padStart(6)}  ${'?'.padStart(7)}  ` +
          `SKIP  ${'—'.padStart(8)}  ${'—'.padStart(9)}${c.reset}`
        );
        continue;
      }
      const { r, isWin, isUp, pnl, closePrice, balance: bal } = row;
      const dir      = r.signal_type === 'BUY_YES' ? 'YES' : 'NO ';
      const closePct = ((closePrice / r.ref_price - 1) * 100).toFixed(2);
      const closeFmt = (isUp ? '▲' : '▼') + Math.abs(parseFloat(closePct)).toFixed(2) + '%';
      const outcome  = isWin ? `${c.green}WIN ${c.reset}` : `${c.red}LOSS${c.reset}`;
      const pnlFmt   = pnl >= 0
        ? `${c.green}${('+$' + pnl.toFixed(2)).padStart(8)}${c.reset}`
        : `${c.red}${('-$' + Math.abs(pnl).toFixed(2)).padStart(8)}${c.reset}`;
      const balFmt   = `$${bal.toFixed(0)}`.padStart(9);
      console.log(
        `${r.timestamp.toISOString().slice(0,16)}  ` +
        `${r.crypto.padEnd(3)}  ` +
        `T+${r.minute}  ` +
        `${dir}  ` +
        `${((r.entry_price*100).toFixed(0)+'¢').padStart(5)}  ` +
        `${(r.spike_pct.toFixed(2)+'%').padStart(6)}  ` +
        `${closeFmt.padStart(7)}  ` +
        `${outcome}  ` +
        `${pnlFmt}  ` +
        `${balFmt}`
      );
    }
    console.log(`${c.grey}${'─'.repeat(hdr.length)}${c.reset}\n`);
  }

  if (skipped > 0) console.log(`\n${c.yellow}${skipped} trades skipped (Binance data unavailable)${c.reset}`);
  printSummary({ balance, wins, losses, totalPnl, byMinute, byCrypto, mode: 'REAL', skipped });
}

// ── Summary Printer ────────────────────────────────────────────────────────────

function printSummary({ balance, wins, losses, totalPnl, byMinute, byCrypto, mode, skipped = 0 }) {
  const total     = wins + losses;
  const winRate   = total > 0 ? (wins / total * 100).toFixed(1) : '0.0';
  const roi       = (totalPnl / CFG.balance * 100).toFixed(1);
  const pnlColor  = totalPnl >= 0 ? c.green : c.red;
  const pnlSign   = totalPnl >= 0 ? '+' : '';

  console.log(`\n${c.bold}${c.cyan}═══ Summary (${mode} mode, threshold ≤${(CFG.threshold*100).toFixed(0)}¢) ═══${c.reset}`);
  console.log(`${c.grey}Trades executed:${c.reset}  ${total}  (${tradeable.length - skipped} eligible)`);
  console.log(`${c.grey}Win / Loss:${c.reset}       ${c.green}${wins}W${c.reset} / ${c.red}${losses}L${c.reset}  (Win rate: ${c.bold}${winRate}%${c.reset})`);
  console.log(`${c.grey}Starting balance:${c.reset} $${CFG.balance.toFixed(2)}`);
  console.log(`${c.grey}Final balance:${c.reset}    ${pnlColor}$${balance.toFixed(2)}${c.reset}`);
  console.log(`${c.grey}Total P&L:${c.reset}        ${pnlColor}${pnlSign}$${Math.abs(totalPnl).toFixed(2)} (${pnlSign}${roi}% ROI)${c.reset}`);

  // Break-even win rate at this threshold
  const be = (CFG.threshold * 100).toFixed(0);
  console.log(`${c.grey}Break-even WR:${c.reset}    ${be}% needed at ${be}¢ entry`);

  if (Object.keys(byMinute).length > 1) {
    console.log(`\n${c.bold}By Minute:${c.reset}`);
    for (const [mk, s] of Object.entries(byMinute).sort()) {
      const t = s.wins + s.losses;
      const wr = t > 0 ? (s.wins / t * 100).toFixed(1) : '?';
      const col = s.pnl >= 0 ? c.green : c.red;
      const sg  = s.pnl >= 0 ? '+' : '';
      console.log(`  ${mk}: ${String(t).padStart(3)} trades  WR=${wr.padStart(5)}%  P&L=${col}${sg}$${Math.abs(s.pnl).toFixed(2)}${c.reset}`);
    }
  }

  if (Object.keys(byCrypto).length > 1) {
    console.log(`\n${c.bold}By Crypto:${c.reset}`);
    for (const [sym, s] of Object.entries(byCrypto)) {
      const t = s.wins !== undefined ? s.wins + s.losses : s.trades;
      const wr = (s.wins !== undefined && t > 0) ? (s.wins / t * 100).toFixed(1) : '?';
      const col = s.pnl >= 0 ? c.green : c.red;
      const sg  = s.pnl >= 0 ? '+' : '';
      console.log(`  ${sym}: ${String(t).padStart(3)} trades  WR=${wr.padStart(5)}%  P&L=${col}${sg}$${Math.abs(s.pnl).toFixed(2)}${c.reset}`);
    }
  }

  console.log('');
}

// ── Entry Point ────────────────────────────────────────────────────────────────

(async () => {
  if (CFG.useEV) {
    await runEVMode();
  } else {
    await runRealMode();
  }
})();
