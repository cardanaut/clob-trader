/**
 * PolyChamp Backtesting Engine
 * Simulates copy-trading strategies against historical trade data.
 */

const { query } = require('../database/connection');
const { getMarketResolution } = require('../utils/polymarketClient');

// Resolution cache — only stores confirmed resolutions.
// Null / unresolved results are NOT cached so they get re-checked on the next run.
const resolutionCache = new Map();

async function fetchResolution(marketId) {
  if (resolutionCache.has(marketId)) return resolutionCache.get(marketId);
  const result = await getMarketResolution(marketId).catch(() => null);
  if (result?.resolved && result.winningOutcome) {
    resolutionCache.set(marketId, result);
  }
  return result;
}

// Round to nearest cent — prevents floating-point drift in the simulation.
const r2 = n => Math.round(n * 100) / 100;

// Calculate P&L for a single copied (or inverted) trade.
// price     = price of the outcome the whale bought (their share price, 0–1 exclusive).
// invertDir = if true, we take the OPPOSITE side of the whale's bet.
function calcPnl(trade, winningOutcome, positionSize, invertDir = false) {
  if (!winningOutcome) return { pnl: 0, pnlPct: 0, status: 'pending' };

  if (winningOutcome !== 'YES' && winningOutcome !== 'NO') {
    return { pnl: 0, pnlPct: 0, status: 'pending' };
  }

  const whalePrice   = parseFloat(trade.price);
  const whaleOutcome = trade.outcome_traded;

  // Prices of exactly 0 or 1 (or invalid) are degenerate:
  //   ourPrice = 0  →  (1-0)/0 = Infinity
  //   ourPrice = 1  →  (1-1)/1 = 0 (no payout on a certain win)
  // Treat these as un-simulatable and mark pending.
  if (isNaN(whalePrice) || whalePrice <= 0 || whalePrice >= 1) {
    return { pnl: 0, pnlPct: 0, status: 'pending' };
  }

  // Our position: same side or flipped
  const ourOutcome = invertDir
    ? (whaleOutcome === 'YES' ? 'NO' : 'YES')
    : whaleOutcome;
  // Our entry price is the complement when inverted.
  // Since whalePrice ∈ (0,1), ourPrice is also ∈ (0,1) — division by zero is impossible.
  const ourPrice = invertDir ? (1 - whalePrice) : whalePrice;

  const won = ourOutcome === winningOutcome;
  // Standard prediction-market return: paid ourPrice per share, receive $1 if win
  const returnPct = won ? (1 - ourPrice) / ourPrice : -1;
  const pnl = r2(positionSize * returnPct);
  return { pnl, pnlPct: returnPct * 100, status: won ? 'win' : 'loss' };
}

// Sharpe ratio (annualised)
function sharpe(returns) {
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  return (mean / std) * Math.sqrt(252);
}

// Max drawdown from equity curve
function maxDrawdown(equityCurve) {
  let peak = equityCurve[0]?.equity || 0;
  let maxDD = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const dd = peak > 0 ? (peak - point.equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// Strategy filter functions (strategy-specific only; global filters applied separately)
const STRATEGY_FILTERS = {
  NAIVE_COPY:    () => true,
  MANUAL:        () => true,  // all filtering via global params

  LIQUIDITY_FILTER: (t) =>
    parseFloat(t.market_liquidity) >= 50000 &&
    parseFloat(t.price) >= 0.10 &&
    parseFloat(t.price) <= 0.90,

  CONVICTION_WINDOW: (t, walletTradeCounts) => {
    const price = parseFloat(t.price);
    if (price < 0.35 || price > 0.65) return false;
    // Strategy requires knowing when market resolves — exclude if unknown
    if (!t.resolution_date) return false;
    const hoursToResolution = (new Date(t.resolution_date) - new Date(t.timestamp)) / 3600000;
    if (hoursToResolution > 168) return false;
    return (walletTradeCounts[t.wallet_address] || 0) >= 5;
  },

  CATEGORY_SPECIALIST: (t, _counts, walletCategoryStats) => {
    const stats = walletCategoryStats[t.wallet_address]?.[t.market_category];
    if (!stats || stats.resolved < 3) return false;
    return stats.wins / stats.resolved >= 0.55;
  },
};

const STRATEGY_DESCRIPTIONS = {
  NAIVE_COPY:          'Copy all whale trades (>$2K)',
  MANUAL:              'Manual — all filters set by you',
  LIQUIDITY_FILTER:    'Liquidity >$50K + price 10%–90%',
  CONVICTION_WINDOW:   'Price 35%–65% + resolves <7d + wallet ≥5 trades',
  CATEGORY_SPECIALIST: 'Wallet win rate ≥55% in category (min 3 resolved)',
  TOP_SCORE:           'Top Score — copies qualifying traders (pre-period success)',
};

// Compute elapsed % of market lifetime for a trade (0–100)
// Returns null if start_date or resolution_date is missing
function elapsedPct(trade) {
  if (!trade.start_date || !trade.resolution_date) return null;
  const start  = new Date(trade.start_date).getTime();
  const end    = new Date(trade.resolution_date).getTime();
  const ts     = new Date(trade.timestamp).getTime();
  const total  = end - start;
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, (ts - start) / total * 100));
}

// Total market lifetime in hours
function marketLifetimeH(trade) {
  if (!trade.start_date || !trade.resolution_date) return null;
  return (new Date(trade.resolution_date) - new Date(trade.start_date)) / 3600000;
}

async function runBacktest({
  strategy,
  dateFrom,
  dateTo,
  startingCapital,
  positionSizePct,
  category,
  minTradeUsd = 2000,
  maxPrice = 1,
  marketMaxLifetimeH = 0,
  lateEntryPct = 0,
  entryGaugeMode = 'after',
  invertDirection = false,
  maxPendingCount = 0,
  maxPendingPct = 0,
  // TOP_SCORE params
  topScoreTopN = 20,
  topScoreMinResolved = 3,
  topScoreMinSuccessPct = 100,
  topScoreMinScore = 55,
}) {
  // --- TOP_SCORE: pre-select qualifying wallets based on history BEFORE dateFrom ---
  // This avoids look-ahead bias — wallets are selected on out-of-sample pre-period data.
  let qualifyingWalletsList = [];
  let qualifyingWalletsSet  = null;

  if (strategy === 'TOP_SCORE') {
    minTradeUsd = 0; // no whale filter — copy all trades from qualifying wallets

    // Select qualifying wallets based on ALL available resolved data.
    // No date restriction: this mirrors the Top Traders leaderboard view —
    // "which traders currently look best?" then replay their trades in the window.
    const isBin = `UPPER(t.outcome_traded) IN ('YES','NO')`;
    const tsWin = `COUNT(*) FILTER (WHERE m.resolved = true AND ${isBin} AND UPPER(t.outcome_traded) = UPPER(m.winning_outcome))`;
    const tsRes = `COUNT(*) FILTER (WHERE m.resolved = true AND ${isBin})`;
    const tsScore = `LEAST(100, ROUND(
      GREATEST(0.0, ((${tsWin} + 2.0) / ((${tsRes}) + 4.0) - 0.5) * 90.0)
      + LEAST(20.0, LOG(GREATEST(1.0, SUM(t.amount_usdc))) / LOG(500001.0) * 20.0)
      + LEAST(15.0, LOG(GREATEST(1.0, COUNT(*)))           / LOG(101.0)    * 15.0)
      + GREATEST(0.0, 10.0 * (1.0 - GREATEST(0.0, EXTRACT(EPOCH FROM (NOW() - MAX(t.timestamp))) / 86400.0 - 7.0) / 23.0))
      + LEAST(10.0, LOG(GREATEST(1.0, COUNT(DISTINCT t.market_id))) / LOG(21.0) * 10.0)
    )::integer)`;

    const qualRes = await query(`
      SELECT
        t.wallet_address,
        MAX(t.username) AS username,
        ${tsRes}   AS resolved_count,
        ${tsWin}   AS resolved_wins,
        ${tsScore} AS score
      FROM trades t
      LEFT JOIN markets m ON m.id = t.market_id
      WHERE ${isBin}
      GROUP BY t.wallet_address
      HAVING
        COUNT(*) FILTER (WHERE ${isBin}) >= $1
        AND NULLIF(${tsRes}, 0) IS NOT NULL
        AND (${tsWin} * 100.0 / NULLIF(${tsRes}, 0)) >= $2
        AND ${tsScore} >= $3
      ORDER BY ${tsScore} DESC
      LIMIT $4
    `, [topScoreMinResolved, topScoreMinSuccessPct, topScoreMinScore, topScoreTopN]);

    qualifyingWalletsList = qualRes.rows.map(r => ({
      wallet_address: r.wallet_address,
      username:       r.username,
      resolved_count: parseInt(r.resolved_count, 10),
      resolved_wins:  parseInt(r.resolved_wins, 10),
      success_pct:    parseInt(r.resolved_count, 10) > 0
        ? Math.round(parseInt(r.resolved_wins, 10) / parseInt(r.resolved_count, 10) * 1000) / 10
        : 0,
    }));
    qualifyingWalletsSet = new Set(qualifyingWalletsList.map(w => w.wallet_address));
  }

  // --- Fetch trades in range ---
  const conditions = ['t.timestamp >= $1', 't.timestamp <= $2', 't.amount_usdc >= $3'];
  const params = [dateFrom, dateTo, minTradeUsd];
  let i = 4;
  if (category) { conditions.push(`t.market_category = $${i++}`); params.push(category); }

  // Try to include start_date; fall back gracefully if column doesn't exist yet
  let tradesRes;
  try {
    tradesRes = await query(`
      SELECT t.*, m.resolution_date, m.start_date, m.resolved, m.winning_outcome, m.is_binary, m.slug,
             (SELECT COUNT(*) FROM trades t2 WHERE t2.wallet_address = t.wallet_address AND t2.timestamp < t.timestamp) AS wallet_prior_trades
      FROM trades t
      LEFT JOIN markets m ON m.id = t.market_id
      WHERE ${conditions.join(' AND ')} AND m.is_binary = TRUE
      ORDER BY t.timestamp ASC
    `, params);
  } catch (err) {
    if (err.message.includes('start_date')) {
      tradesRes = await query(`
        SELECT t.*, m.resolution_date, NULL::timestamptz AS start_date, m.resolved, m.winning_outcome, m.is_binary, m.slug,
               (SELECT COUNT(*) FROM trades t2 WHERE t2.wallet_address = t.wallet_address AND t2.timestamp < t.timestamp) AS wallet_prior_trades
        FROM trades t
        LEFT JOIN markets m ON m.id = t.market_id
        WHERE ${conditions.join(' AND ')} AND m.is_binary = TRUE
        ORDER BY t.timestamp ASC
      `, params);
    } else {
      throw err;
    }
  }

  let rawTrades = tradesRes.rows;

  // --- Global: price cap filter ---
  if (maxPrice < 1) {
    rawTrades = rawTrades.filter(t => parseFloat(t.price) <= maxPrice);
  }

  // --- Global: market max lifetime filter ---
  // Strict: trades on markets with unknown dates are EXCLUDED (cannot verify constraint).
  if (marketMaxLifetimeH > 0) {
    rawTrades = rawTrades.filter(t => {
      const lh = marketLifetimeH(t);
      return lh !== null && lh <= marketMaxLifetimeH;
    });
  }

  // --- Global: entry timing gauge ---
  // Strict: trades with unknown timing are EXCLUDED (cannot compute elapsed %).
  // entryGaugeMode 'after'  → only trades occurring at or after lateEntryPct% of lifetime
  // entryGaugeMode 'before' → only trades occurring at or before lateEntryPct% of lifetime
  if (lateEntryPct > 0) {
    rawTrades = rawTrades.filter(t => {
      const pct = elapsedPct(t);
      if (pct === null) return false;
      return entryGaugeMode === 'before' ? pct <= lateEntryPct : pct >= lateEntryPct;
    });
  }

  // --- Build wallet history maps + apply strategy filter (single pass, no look-ahead) ---
  // rawTrades is sorted ASC by timestamp. We iterate once:
  //   1. Read wallet_prior_trades (pre-computed by SQL for all-time prior trades)
  //   2. Apply the strategy filter using only stats from trades BEFORE this one
  //   3. Update the running category stats so future trades can use this outcome
  //
  // This prevents look-ahead bias in CATEGORY_SPECIALIST: a wallet's win rate
  // at trade T only reflects outcomes of their trades that occurred before T.
  const walletTradeCounts  = {};
  const runningCatStats    = {}; // updated AFTER each trade is filtered
  const filterFn = strategy === 'TOP_SCORE' && qualifyingWalletsSet !== null
    ? (t) => qualifyingWalletsSet.has(t.wallet_address)
    : (STRATEGY_FILTERS[strategy] || STRATEGY_FILTERS.NAIVE_COPY);
  const filtered = [];

  for (const t of rawTrades) {
    walletTradeCounts[t.wallet_address] = parseInt(t.wallet_prior_trades || 0, 10);

    // Filter decision uses only historical stats (no look-ahead)
    if (filterFn(t, walletTradeCounts, runningCatStats)) {
      filtered.push(t);
    }

    // Update category stats AFTER the filter so this trade counts for future decisions
    if (t.resolved && t.winning_outcome && t.market_category) {
      const addr = t.wallet_address;
      if (!runningCatStats[addr]) runningCatStats[addr] = {};
      if (!runningCatStats[addr][t.market_category])
        runningCatStats[addr][t.market_category] = { wins: 0, resolved: 0 };
      const wn = t.winning_outcome.toUpperCase();
      runningCatStats[addr][t.market_category].resolved++;
      if (t.outcome_traded === wn) runningCatStats[addr][t.market_category].wins++;
    }
  }

  // --- Fetch live resolution for unresolved markets (parallel, rate-limited) ---
  const unresolvedMarketIds = [...new Set(
    filtered.filter(t => !t.resolved).map(t => t.market_id)
  )];
  // Batch in groups of 5 with 250 ms between batches to avoid 429s
  const BATCH = 5;
  const resolutions = [];
  for (let b = 0; b < unresolvedMarketIds.length; b += BATCH) {
    const chunk = unresolvedMarketIds.slice(b, b + BATCH);
    const results = await Promise.all(
      chunk.map(id => fetchResolution(id).then(res => ({ id, res })).catch(() => ({ id, res: null })))
    );
    resolutions.push(...results);
    if (b + BATCH < unresolvedMarketIds.length) {
      await new Promise(r => setTimeout(r, 250));
    }
  }
  for (const { id: marketId, res } of resolutions) {
    if (res?.resolved && res.winningOutcome) {
      filtered.forEach(t => {
        if (t.market_id === marketId) {
          t.resolved = true;
          t.winning_outcome = res.winningOutcome;
        }
      });
    }
  }

  // --- Simulate positions (event-driven) ---
  // Every trade locks capital at entry. Resolved trades free capital at resolution_date
  // so that returned capital can fund later entries. Pending trades stay locked.
  // At the same timestamp, CLOSE events are processed before OPEN events so freed
  // capital is immediately available for the next position.
  const positionSize = r2(startingCapital * (positionSizePct / 100));
  let equity = r2(startingCapital);
  let runningLocked = 0;
  const equityCurve = [{ date: dateFrom, equity: startingCapital }];
  const tradeLog = [];
  const resolvedReturns = [];
  let wins = 0, losses = 0, pending = 0, skipped = 0;

  // Build OPEN + CLOSE events from the filtered trade list.
  const events = [];
  filtered.forEach((t, idx) => {
    const openTs = new Date(t.timestamp).getTime();
    events.push({ type: 'open', ts: openTs, idx, trade: t });
    if (t.resolved && t.winning_outcome && t.resolution_date) {
      const closeTs = Math.max(new Date(t.resolution_date).getTime(), openTs);
      events.push({ type: 'close', ts: closeTs, idx, trade: t });
    }
  });
  // Sort chronologically; at equal timestamps process CLOSE before OPEN
  events.sort((a, b) => a.ts - b.ts || (a.type === 'close' ? -1 : 1));

  const accepted  = new Set();   // filtered indices that were NOT skipped
  const logByIdx  = {};          // idx → tradeLog entry ref, for P&L update on close

  for (const ev of events) {
    const { type, idx, trade: t } = ev;

    if (type === 'close') {
      if (!accepted.has(idx)) continue; // was skipped at open
      // Free the locked capital
      runningLocked = r2(Math.max(0, runningLocked - positionSize));
      // Apply P&L
      const winningOutcome = t.winning_outcome.toUpperCase();
      const { pnl, pnlPct, status } = calcPnl(t, winningOutcome, positionSize, invertDirection);
      if (status === 'win') {
        wins++;
        equity = r2(Math.max(0, equity + pnl));
        resolvedReturns.push(pnlPct / 100);
      } else if (status === 'loss') {
        losses++;
        equity = r2(Math.max(0, equity + pnl));
        resolvedReturns.push(pnlPct / 100);
      }
      // Update the trade log entry created at open
      const entry = logByIdx[idx];
      if (entry) {
        entry.pnl     = pnl; // already r2'd by calcPnl
        entry.pnl_pct = Math.round(pnlPct * 10) / 10;
        entry.status  = status;
      }
      equityCurve.push({ date: t.resolution_date, equity });

    } else { // 'open'
      // Never lock more than what is available
      const available = equity - runningLocked;
      if (available < positionSize) { skipped++; continue; }
      // Optional cap: max number of simultaneous pending positions
      if (maxPendingCount > 0 && pending >= maxPendingCount) { skipped++; continue; }
      // Optional cap: max % of current equity tied up in pending positions
      if (maxPendingPct > 0 && maxPendingPct < 100 && runningLocked + positionSize > r2(startingCapital * maxPendingPct / 100)) { skipped++; continue; }
      runningLocked = r2(Math.min(runningLocked + positionSize, equity));
      accepted.add(idx);

      const isPending = !t.resolved || !t.winning_outcome || !t.resolution_date;
      if (isPending) pending++;

      const elapsed   = elapsedPct(t);
      const lifetimeH = marketLifetimeH(t);
      const whaleOutcome = t.outcome_traded;
      const ourOutcome   = invertDirection
        ? (whaleOutcome === 'YES' ? 'NO' : 'YES')
        : whaleOutcome;

      const entry = {
        timestamp:    t.timestamp,
        wallet:       t.wallet_address,
        username:     t.username,
        market:       t.market_question,
        market_id:    t.market_id,
        slug:         t.slug,
        whale_outcome: whaleOutcome,
        outcome:      ourOutcome,
        price:        parseFloat(t.price),
        whale_amount: parseFloat(t.amount_usdc),
        our_size:     positionSize,
        pnl:          0,         // filled in on close event
        pnl_pct:      0,         // filled in on close event
        status:       'pending', // updated to win/loss on close event
        category:     t.market_category,
        elapsed_pct:  elapsed   != null ? Math.round(elapsed   * 10) / 10 : null,
        lifetime_h:   lifetimeH != null ? Math.round(lifetimeH * 10) / 10 : null,
      };
      logByIdx[idx] = entry;
      tradeLog.push(entry);
      equityCurve.push({ date: t.timestamp, equity });
    }
  }

  const resolvedCount = wins + losses;
  const totalReturn = (equity - startingCapital) / startingCapital * 100;
  const lockedCapital = runningLocked; // only pending positions remain locked
  const lockedCapitalPct = Math.round(lockedCapital / startingCapital * 1000) / 10;

  const description = strategy === 'TOP_SCORE'
    ? `Top Score — ${qualifyingWalletsList.length} wallet${qualifyingWalletsList.length !== 1 ? 's' : ''} qualifying (≥${topScoreMinResolved} trades, ≥${topScoreMinSuccessPct}% success, score ≥${topScoreMinScore})`
    : (STRATEGY_DESCRIPTIONS[strategy] || strategy);

  return {
    strategy,
    description,
    qualifyingWallets: strategy === 'TOP_SCORE' ? qualifyingWalletsList : undefined,
    params: { dateFrom, dateTo, startingCapital, positionSizePct, category: category || 'all', minTradeUsd, maxPrice, marketMaxLifetimeH, lateEntryPct, entryGaugeMode, invertDirection, maxPendingCount, maxPendingPct },
    metrics: {
      totalTrades:      tradeLog.length,
      skippedTrades:    skipped,
      resolvedTrades:   resolvedCount,
      openTrades:       pending,
      wins,
      losses,
      winRate:          resolvedCount > 0 ? Math.round(wins / resolvedCount * 1000) / 10 : null,
      totalPnl:         r2(equity - startingCapital),
      totalReturnPct:   Math.round(totalReturn * 10) / 10,
      sharpe:           sharpe(resolvedReturns),
      maxDrawdownPct:   Math.round(maxDrawdown(equityCurve) * 1000) / 10,
      finalEquity:      equity,
      lockedCapital:    lockedCapital,
      lockedCapitalPct: lockedCapitalPct,
    },
    equityCurve,
    tradeLog,
  };
}

module.exports = { runBacktest };
