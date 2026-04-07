const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const clobClient = axios.create({
  baseURL: config.polymarket.apiUrl,
  timeout: 10000,
  headers: { 'Accept': 'application/json' },
});

const gammaClient = axios.create({
  baseURL: config.polymarket.gammaUrl,
  timeout: 10000,
  headers: { 'Accept': 'application/json' },
});

const dataClient = axios.create({
  baseURL: 'https://data-api.polymarket.com',
  timeout: 10000,
  headers: { 'Accept': 'application/json' },
});

async function safeGet(client, path, label, params) {
  try {
    const res = await client.get(path, params ? { params } : undefined);
    return res.data;
  } catch (err) {
    logger.warn(`Polymarket API error [${label}]`, { path, error: err.message });
    return null;
  }
}

// Get market metadata from Gamma API (returns endDate, outcomes, question, eventSlug, resolution)
async function getMarket(conditionId) {
  const data = await safeGet(gammaClient, '/markets', 'getMarket', { condition_ids: conditionId });
  if (!Array.isArray(data) || !data.length) return null;
  const m = data[0];
  // Attach event slug for Polymarket URL building
  const events = m.events || [];
  m.eventSlug = (events[0] && events[0].slug) || m.slug || null;
  // Attach actual event start time (not market creation time)
  // Priority: eventStartTime > events[0].startTime > startTime > startDate (creation) as fallback
  m.startDate = m.eventStartTime
    || (events[0] && events[0].startTime)
    || m.startTime
    || m.startDate
    || m.startDateIso
    || m.createdAt
    || null;
  return m;
}

// Get market resolution status — same endpoint, check closed + outcomePrices
async function getMarketResolution(conditionId) {
  const data = await safeGet(gammaClient, '/markets', 'getMarketResolution', { condition_ids: conditionId });
  if (!Array.isArray(data) || !data.length) return null;
  const m = data[0];
  if (!m.closed) return null; // not resolved yet

  // outcomePrices: ["1", "0"] means first outcome won, ["0", "1"] means second won.
  // Normalise to "YES"/"NO" regardless of the actual outcome name (e.g. "UP", "FURIA"),
  // because the collector maps index-0 → "YES" and index-1 → "NO" in the trades table.
  let winningOutcome = null;
  try {
    const prices = JSON.parse(m.outcomePrices);
    const winIdx = prices.findIndex(p => parseFloat(p) === 1);
    if (winIdx === 0) winningOutcome = 'YES';
    else if (winIdx === 1) winningOutcome = 'NO';
  } catch (_) {}

  return {
    resolved: true,
    winningOutcome,
    resolvedAt: m.updatedAt || m.endDate,
  };
}

// Parse whether a market is binary YES/NO from Gamma API outcomes field
function parseBinary(market) {
  if (!market) return false;
  let outcomes = market.outcomes;
  if (typeof outcomes === 'string') {
    try { outcomes = JSON.parse(outcomes); } catch (_) { return false; }
  }
  if (!Array.isArray(outcomes) || outcomes.length !== 2) return false;
  const upper = outcomes.map(o => String(o).toUpperCase());
  return upper.includes('YES') && upper.includes('NO');
}

// Get wallet portfolio value + open positions via data-api (public, no auth)
async function getPortfolio(walletAddress) {
  const [valueRes, positionsRes] = await Promise.all([
    safeGet(dataClient, '/value', 'getPortfolioValue', { user: walletAddress }),
    safeGet(dataClient, '/positions', 'getPortfolioPositions', { user: walletAddress }),
  ]);

  const totalEquity = Array.isArray(valueRes) && valueRes[0]?.value
    ? parseFloat(valueRes[0].value)
    : 0;

  const positions = Array.isArray(positionsRes) ? positionsRes : [];

  return {
    portfolioValue: totalEquity,
    cashBalance: 0, // not exposed by public API
    positions,
  };
}

// Resolve category from market tags/group slug
function resolveCategory(market) {
  if (!market) return 'other';
  const tags = (market.tags || []).map(t => (t.label || t).toLowerCase());
  const slug = (market.groupItemTitle || market.slug || '').toLowerCase();
  const combined = tags.join(' ') + ' ' + slug;

  if (combined.match(/politic|election|vote|president|congress|senate|government/)) return 'politics';
  if (combined.match(/sport|nfl|nba|soccer|football|basketball|baseball|hockey|tennis|golf/)) return 'sports';
  if (combined.match(/crypto|bitcoin|ethereum|btc|eth|solana|defi|token/)) return 'crypto';
  return 'other';
}

// Determine if market is binary YES/NO only
function isBinaryMarket(market) {
  if (!market) return true; // assume binary if unknown
  const tokens = market.tokens || market.outcomes || [];
  if (tokens.length === 0) return true;
  if (tokens.length === 2) {
    const outcomes = tokens.map(t => (t.outcome || t).toUpperCase());
    return outcomes.includes('YES') && outcomes.includes('NO');
  }
  return false;
}

module.exports = {
  getMarket,
  parseBinary,
  getPortfolio,
  getMarketResolution,
  resolveCategory,
};
