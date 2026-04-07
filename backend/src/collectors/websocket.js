/**
 * PolyChamp Trade Collector
 * Polls data-api.polymarket.com/trades every 15s, filters whale trades (>=$2K USDC),
 * stores to DB. Market title and username come inline — no secondary lookups needed.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const axios = require('axios');
const config = require('../utils/config');
const logger = require('../utils/logger');
const { insertTrade, upsertMarket, upsertWalletSnapshot } = require('../database/queries');
const { query } = require('../database/connection');
const { getPortfolio, getMarket, parseBinary } = require('../utils/polymarketClient');

const MIN_TRADE = config.collection.minTradeUsd;
const POLL_INTERVAL_MS = 15000;

const dataClient = axios.create({
  baseURL: 'https://data-api.polymarket.com',
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

// Cursor: Unix timestamp in seconds. Start 2 minutes ago to catch any recent whales.
let lastSeenTs = Math.floor(Date.now() / 1000) - 120;

// Category detection from market title/slug
function detectCategory(title, slug) {
  const text = ((title || '') + ' ' + (slug || '')).toLowerCase();

  // Crypto — check first, specific enough to avoid false positives
  if (text.match(/bitcoin|btc|eth|ethereum|crypto|solana|defi|token|\bcoin\b|polygon|matic|arbitrum|chainlink|cardano|ada|dogecoin|doge|shib|xrp|ripple|litecoin|ltc|bnb|binance|avalanche|avax|tron|trx|polkadot|dot|usdc|usdt|stablecoin|dai|blockchain|nft|web3|metaverse/))
    return 'crypto';

  // Politics — expanded patterns
  if (text.match(/election|vote|president|congress|senate|politic|government|democrat|republican|parliament|minister|referendum|ballot|campaign|white house|capitol|impeach|veto|legislation|bill\s|policy|administration|gubernatorial|mayoral|secretary of|ambassador|supreme court|justice\s/))
    return 'politics';

  // Sports — comprehensive patterns
  // Major leagues & events
  if (text.match(/nfl|nba|mlb|nhl|ncaa|pga|ufc|mma|f1|formula[ -]1|formula one|nascar|epl|premier league|champions league|europa league|fifa|uefa|ioc|olympic|world cup|world championship|grand slam|super bowl|playoffs?|stanley cup|world series|finals?|championship/))
    return 'sports';

  // Sports types
  if (text.match(/soccer|football|basketball|baseball|hockey|tennis|golf|cricket|rugby|volleyball|handball|curling|swimming|athletics|track and field|cycling|boxing|wrestling|gymnastics|rowing|skiing|snowboard|skating|surfing|esports|league of legends|\blol\b|dota|cs:?go|valorant/))
    return 'sports';

  // Match indicators
  if (text.match(/\bvs\.?\s|\bvs\b| v\s|\smatch\b|game \d|round of \d+|quarterfinal|semifinal|semi-final|group stage|men's|women's|series|tournament|playoff|championship game|division|conference/))
    return 'sports';

  // Team names (expanded)
  if (text.match(/\blakers\b|\bceltics\b|\bknicks\b|\bwarriors\b|\bheat\b|\bbulls\b|\bsixers\b|\bmavs\b|\bclippers\b|\briots\b|\bcowboys\b|\bpatriots\b|\bchiefs\b|\bsteelers\b|\bpackers\b|\beagles\b|\brams\b|\byanks\b|\bdodgers\b|\bred sox\b|\bcubs\b|\bmets\b|\breal madrid\b|\bbarcelona\b|\bmanchester\b|\bliverpool\b|\bchelsea\b|\barsenal\b|\bjuventus\b|\bbayern\b|\bpsg\b/))
    return 'sports';

  return 'other';
}

// Map Polymarket outcome to YES/NO
// outcomeIndex: 0 = first outcome (YES/Up/Over/etc), 1 = second outcome (NO/Down/Under/etc)
function mapOutcome(trade) {
  const idx = trade.outcomeIndex;
  if (idx === 0) return 'YES';
  if (idx === 1) return 'NO';
  // Fallback: interpret by outcome label
  const label = (trade.outcome || '').toLowerCase();
  if (['yes', 'up', 'over', 'higher', 'true'].includes(label)) return 'YES';
  return 'NO';
}

// Balance snapshot — async, non-blocking
async function fetchWalletBalance(walletAddress, tradeId) {
  try {
    const portfolio = await getPortfolio(walletAddress);
    if (!portfolio) return;
    await upsertWalletSnapshot({
      wallet_address: walletAddress,
      timestamp: new Date().toISOString(),
      total_equity: portfolio.portfolioValue || portfolio.total_equity || 0,
      cash_balance: portfolio.cashBalance || portfolio.cash_balance || 0,
      open_positions: portfolio.positions || portfolio.open_positions || [],
      trade_id: tradeId,
    });
  } catch (_) {
    // Snapshot failures are non-critical
  }
}

async function fetchTrades() {
  const res = await dataClient.get('/trades', {
    params: {
      limit: 500,
      startTs: lastSeenTs,
    },
  });

  const raw = Array.isArray(res.data) ? res.data : (res.data?.data || []);
  return raw;
}

async function poll() {
  try {
    const trades = await fetchTrades();
    if (!trades.length) {
      logger.debug('No trades in this poll window');
      return;
    }

    // Advance cursor — data-api returns newest first
    const newestTs = trades[0].timestamp;
    if (newestTs && newestTs > lastSeenTs) {
      lastSeenTs = newestTs;
    }

    let whaleCount = 0;

    for (const t of trades) {
      const price = parseFloat(t.price || 0);
      const size  = parseFloat(t.size  || 0);
      const amountUsdc = price * size;

      if (amountUsdc < MIN_TRADE) continue;

      const conditionId = t.conditionId || '';
      if (!conditionId) continue;

      const txHash = t.transactionHash || '';
      if (!txHash) continue;

      const walletAddress = (t.proxyWallet || '').toLowerCase();
      if (!walletAddress) continue;

      const title    = t.title    || 'Unknown Market';
      const slug     = t.eventSlug || t.slug || '';
      const category = detectCategory(title, slug);
      const outcome  = mapOutcome(t);
      const rawUsername = t.name || t.pseudonym || null;
      const username = rawUsername ? rawUsername.slice(0, 50) : null;

      // Upsert market — fetch endDate + binary flag from Gamma API for new markets
      let resolution_date = null;
      let start_date = null;
      let is_binary = false;
      const marketData = await getMarket(conditionId).catch(() => null);
      if (marketData) {
        resolution_date = marketData.endDate || null;
        start_date = marketData.startDate || null;
        is_binary = parseBinary(marketData);
      }

      await upsertMarket({
        id: conditionId,
        question: title,
        category,
        resolution_date,
        start_date,
        is_binary,
        slug,
      }).catch(() => {});

      const trade = {
        wallet_address: walletAddress,
        username,
        market_id: conditionId,
        market_question: title,
        market_category: category,
        outcome_traded: outcome,
        price,
        amount_usdc: amountUsdc,
        timestamp: new Date(t.timestamp * 1000).toISOString(),
        tx_hash: txHash,
        market_liquidity: amountUsdc * 10, // approximation
        block_number: null,
      };

      const result = await insertTrade(trade);
      if (result) {
        whaleCount++;
        // Notify the trader engine immediately so it doesn't wait for its 30s poll
        if (is_binary) {
          query('SELECT pg_notify($1, $2)', [
            'new_trade',
            JSON.stringify({ wallet: walletAddress, marketId: conditionId, outcome }),
          ]).catch(() => {});
        }
        logger.info('Whale trade captured', {
          wallet: walletAddress.slice(0, 10) + '...',
          user: username || '—',
          amount: `$${amountUsdc.toFixed(0)}`,
          outcome,
          price: `${(price * 100).toFixed(1)}¢`,
          market: title.slice(0, 55),
        });
        setImmediate(() => fetchWalletBalance(walletAddress, result.id));
      }
    }

    if (whaleCount > 0) {
      logger.info(`Poll complete: ${whaleCount} whale trade(s) saved`);
    } else {
      logger.debug(`Poll complete: ${trades.length} trades checked, none above $${MIN_TRADE}`);
    }

  } catch (err) {
    logger.warn('Poll error', { error: err.message });
  }
}

// Polling loop
let isShuttingDown = false;

async function run() {
  if (isShuttingDown) return;
  await poll();
  if (!isShuttingDown) {
    setTimeout(run, POLL_INTERVAL_MS);
  }
}

process.on('SIGINT',  () => { isShuttingDown = true; logger.info('Collector shutting down'); process.exit(0); });
process.on('SIGTERM', () => { isShuttingDown = true; logger.info('Collector shutting down'); process.exit(0); });

logger.info('PolyChamp collector starting', { minTradeUsdc: MIN_TRADE, pollIntervalMs: POLL_INTERVAL_MS });
run();
