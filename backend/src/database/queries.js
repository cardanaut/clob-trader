const { query } = require('./connection');

// --- Trades ---

async function insertTrade(trade) {
  const sql = `
    INSERT INTO trades (
      wallet_address, username, market_id, market_question, market_category,
      outcome_traded, price, amount_usdc, timestamp, tx_hash,
      market_liquidity, block_number
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (tx_hash) DO NOTHING
    RETURNING id
  `;
  const params = [
    trade.wallet_address,
    trade.username || null,
    trade.market_id,
    trade.market_question,
    trade.market_category,
    trade.outcome_traded,
    trade.price,
    trade.amount_usdc,
    trade.timestamp,
    trade.tx_hash,
    trade.market_liquidity,
    trade.block_number || null,
  ];
  const res = await query(sql, params);

  // Notify trader engine of new trade (for real-time copy trading)
  if (res.rows[0]) {
    await query(`NOTIFY new_trade, '${JSON.stringify({ wallet: trade.wallet_address, marketId: trade.market_id })}'`);
  }

  return res.rows[0] || null;
}

async function getTrades({ limit = 50, offset = 0, wallet, market_id, category, min_amount, binary_only, resolved_only } = {}) {
  let conditions = [];
  let params = [];
  let i = 1;

  if (wallet) { conditions.push(`t.wallet_address = $${i++}`); params.push(wallet); }
  if (market_id) { conditions.push(`t.market_id = $${i++}`); params.push(market_id); }
  if (category) { conditions.push(`t.market_category = $${i++}`); params.push(category); }
  if (min_amount) { conditions.push(`t.amount_usdc >= $${i++}`); params.push(min_amount); }
  if (binary_only) { conditions.push(`m.is_binary = TRUE`); }
  if (resolved_only) { conditions.push(`m.resolved = TRUE AND m.winning_outcome IS NOT NULL`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  params.push(limit, offset);

  const sql = `
    SELECT t.*,
           m.resolution_date,
           m.is_binary,
           m.resolved,
           m.winning_outcome
    FROM trades t
    LEFT JOIN markets m ON m.id = t.market_id
    ${where}
    ORDER BY t.timestamp DESC
    LIMIT $${i++} OFFSET $${i}
  `;
  const res = await query(sql, params);
  return res.rows;
}

async function getTradeCount() {
  const res = await query('SELECT COUNT(*) FROM trades');
  return parseInt(res.rows[0].count, 10);
}

// --- Wallet snapshots ---

async function upsertWalletSnapshot(snapshot) {
  const sql = `
    INSERT INTO wallet_snapshots (wallet_address, timestamp, total_equity, cash_balance, open_positions, trade_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (wallet_address, timestamp) DO UPDATE
      SET total_equity = EXCLUDED.total_equity,
          cash_balance = EXCLUDED.cash_balance,
          open_positions = EXCLUDED.open_positions
    RETURNING id
  `;
  const res = await query(sql, [
    snapshot.wallet_address,
    snapshot.timestamp,
    snapshot.total_equity,
    snapshot.cash_balance,
    JSON.stringify(snapshot.open_positions || []),
    snapshot.trade_id || null,
  ]);
  return res.rows[0];
}

// --- Markets ---

async function upsertMarket(market) {
  const sql = `
    INSERT INTO markets (id, question, category, resolution_date, is_binary, slug, start_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE
      SET question = EXCLUDED.question,
          category = EXCLUDED.category,
          resolution_date = COALESCE(EXCLUDED.resolution_date, markets.resolution_date),
          is_binary = EXCLUDED.is_binary OR markets.is_binary,
          slug = COALESCE(EXCLUDED.slug, markets.slug),
          start_date = COALESCE(markets.start_date, EXCLUDED.start_date)
    RETURNING id
  `;
  const res = await query(sql, [
    market.id,
    market.question,
    market.category,
    market.resolution_date || null,
    market.is_binary || false,
    market.slug || null,
    market.start_date || null,
  ]);
  return res.rows[0];
}

async function getUnresolvedMarkets() {
  const res = await query(
    `SELECT * FROM markets
     WHERE resolved = FALSE
       AND resolution_date IS NOT NULL
       AND resolution_date < NOW()
     ORDER BY resolution_date ASC`
  );
  return res.rows;
}

async function resolveMarket(id, winningOutcome, resolvedAt, txHash) {
  const sql = `
    UPDATE markets
    SET resolved = TRUE, winning_outcome = $2, resolved_at = $3, resolution_tx_hash = $4
    WHERE id = $1
  `;
  await query(sql, [id, winningOutcome, resolvedAt, txHash || null]);
}

// --- Wallet stats ---

async function getTopWallets({ days = 30, limit = 20, offset = 0, minSuccessPct, maxSuccessPct, minVolume, maxVolume, sortBy = 'volume', sortDir = 'desc', hideNegativePnl = false } = {}) {
  const params = [];
  let pIdx = 1;
  const havingClauses = [];

  const winExpr     = `COUNT(*) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) = UPPER(m.winning_outcome))`;
  const resolvedExpr = `COUNT(*) FILTER (WHERE m.resolved = true)`;
  const wonAmtExpr  = `SUM(t.amount_usdc) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) = UPPER(m.winning_outcome))`;
  const lostAmtExpr = `SUM(t.amount_usdc) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) != UPPER(m.winning_outcome))`;
  const pendAmtExpr = `SUM(t.amount_usdc) FILTER (WHERE m.resolved = false OR m.resolved IS NULL)`;

  if (minSuccessPct != null && minSuccessPct > 0) {
    havingClauses.push(`${resolvedExpr} > 0 AND ${winExpr} * 100.0 / NULLIF(${resolvedExpr}, 0) >= $${pIdx++}`);
    params.push(minSuccessPct);
  }
  if (maxSuccessPct != null && maxSuccessPct < 100) {
    havingClauses.push(`${resolvedExpr} > 0 AND ${winExpr} * 100.0 / NULLIF(${resolvedExpr}, 0) <= $${pIdx++}`);
    params.push(maxSuccessPct);
  }
  if (minVolume != null && minVolume > 0) {
    havingClauses.push(`SUM(t.amount_usdc) >= $${pIdx++}`);
    params.push(minVolume);
  }
  if (maxVolume != null && maxVolume > 0) {
    havingClauses.push(`SUM(t.amount_usdc) <= $${pIdx++}`);
    params.push(maxVolume);
  }
  if (hideNegativePnl) {
    havingClauses.push(`COALESCE(${wonAmtExpr}, 0) >= COALESCE(${lostAmtExpr}, 0)`);
  }

  // Minimum sample filter: Require at least 3 resolved trades to appear in rankings
  // (Good Judgment Project uses 50 for "superforecaster", but 3-5 is pragmatic for new platform)
  havingClauses.push(`${resolvedExpr} >= 3`);

  const having = havingClauses.length ? 'HAVING ' + havingClauses.join(' AND ') : '';
  // days is parameterized to prevent SQL injection
  params.push(days, limit + 1, offset);
  const daysIdx = pIdx++;
  const limitIdx = pIdx++;
  const offsetIdx = pIdx;

  const pnlExpr = `COALESCE(${wonAmtExpr}, 0) - COALESCE(${lostAmtExpr}, 0)`;
  const roiExpr = `(COALESCE(${wonAmtExpr}, 0) - COALESCE(${lostAmtExpr}, 0)) / NULLIF(COALESCE(${wonAmtExpr}, 0) + COALESCE(${lostAmtExpr}, 0), 0)`;

  // Composite score (0-100):
  //  Skill         (0-45): Bayesian win rate (Beta(1,1) prior) above 50% — rewards proven success
  //  Profitability (0-15): ROI guard to catch traders with high win rate but massive losses on losing bets
  //                        ROI = (won - lost) / (won + lost), scaled from -1 to +1
  //                        ROI of -1 (total loss) = 0pts, ROI of 0 (break even) = 7.5pts, ROI of +1 (doubled) = 15pts
  //  Consistency   (0-15): log-scaled trade count, 100 trades = max — regularity matters more than budget
  //  Recency       (0-10): full points within 7 days, linear decay to 0 at 30 days
  //  Volume        (0-10): log-scaled total volume, $500k = max — shows commitment/conviction
  //  Diversity     (0-5):  log-scaled distinct markets, 20 markets = max — specialization is fine
  const scoreExpr = `
    LEAST(100, ROUND(
      GREATEST(0.0, ((${winExpr} + 1.0) / ((${resolvedExpr}) + 2.0) - 0.5) * 90.0)
      + GREATEST(0.0, LEAST(15.0, ((${roiExpr}) + 1.0) / 2.0 * 15.0))
      + LEAST(15.0, LOG(GREATEST(1.0, COUNT(*)))                / LOG(101.0)    * 15.0)
      + GREATEST(0.0, 10.0 * (1.0 - GREATEST(0.0, EXTRACT(EPOCH FROM (NOW() - MAX(t.timestamp))) / 86400.0 - 7.0) / 23.0))
      + LEAST(10.0, LOG(GREATEST(1.0, SUM(t.amount_usdc)))      / LOG(500001.0) * 10.0)
      + LEAST(5.0, LOG(GREATEST(1.0, COUNT(DISTINCT t.market_id))) / LOG(21.0) * 5.0)
    )::integer)`;

  const sortMap = {
    score:       scoreExpr,
    volume:      `SUM(t.amount_usdc)`,
    trades:      `COUNT(*)`,
    markets:     `COUNT(DISTINCT t.market_id)`,
    last_active: `MAX(t.timestamp)`,
    success:     `${winExpr} * 100.0 / NULLIF(${resolvedExpr}, 0)`,
    pending:     pendAmtExpr,
    lost:        lostAmtExpr,
    won:         wonAmtExpr,
    pnl:         pnlExpr,
  };
  const nullableSort = ['score', 'success', 'pending', 'lost', 'won', 'pnl'];
  const sortCol  = sortMap[sortBy] || sortMap.volume;
  const dir      = sortDir === 'asc' ? 'ASC' : 'DESC';
  const nulls    = nullableSort.includes(sortBy) ? ' NULLS LAST' : '';
  const orderBy  = `${sortCol} ${dir}${nulls}`;

  const sql = `
    SELECT
      t.wallet_address,
      MAX(t.username) AS username,
      COUNT(*) AS trade_count,
      SUM(t.amount_usdc) AS total_volume,
      COUNT(DISTINCT t.market_id) AS markets_traded,
      MIN(t.timestamp) AS first_seen,
      MAX(t.timestamp) AS last_seen,
      ${resolvedExpr} AS resolved_count,
      ${winExpr} AS resolved_wins,
      ${wonAmtExpr}  AS won_amount,
      ${lostAmtExpr} AS lost_amount,
      ${pendAmtExpr} AS pending_amount,
      ${scoreExpr}   AS score
    FROM trades t
    LEFT JOIN markets m ON m.id = t.market_id
    WHERE t.timestamp >= NOW() - (INTERVAL '1 day' * $${daysIdx})
    GROUP BY t.wallet_address
    ${having}
    ORDER BY ${orderBy}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;
  const res = await query(sql, params);
  const hasMore = res.rows.length > limit;
  return { wallets: res.rows.slice(0, limit), hasMore };
}

async function getWalletStats(walletAddress) {
  const winExpr     = `COUNT(*) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) = UPPER(m.winning_outcome))`;
  const resolvedExpr = `COUNT(*) FILTER (WHERE m.resolved = true)`;
  const wonAmtExpr  = `SUM(t.amount_usdc) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) = UPPER(m.winning_outcome))`;
  const lostAmtExpr = `SUM(t.amount_usdc) FILTER (WHERE m.resolved = true AND UPPER(t.outcome_traded) != UPPER(m.winning_outcome))`;
  const roiExpr = `(COALESCE(${wonAmtExpr}, 0) - COALESCE(${lostAmtExpr}, 0)) / NULLIF(COALESCE(${wonAmtExpr}, 0) + COALESCE(${lostAmtExpr}, 0), 0)`;

  // Composite score (0-100) - same formula as getTopWallets
  const scoreExpr = `
    LEAST(100, ROUND(
      GREATEST(0.0, ((${winExpr} + 1.0) / ((${resolvedExpr}) + 2.0) - 0.5) * 90.0)
      + GREATEST(0.0, LEAST(15.0, ((${roiExpr}) + 1.0) / 2.0 * 15.0))
      + LEAST(15.0, LOG(GREATEST(1.0, COUNT(*)))                / LOG(101.0)    * 15.0)
      + GREATEST(0.0, 10.0 * (1.0 - GREATEST(0.0, EXTRACT(EPOCH FROM (NOW() - MAX(t.timestamp))) / 86400.0 - 7.0) / 23.0))
      + LEAST(10.0, LOG(GREATEST(1.0, SUM(t.amount_usdc)))      / LOG(500001.0) * 10.0)
      + LEAST(5.0, LOG(GREATEST(1.0, COUNT(DISTINCT t.market_id))) / LOG(21.0) * 5.0)
    )::integer)`;

  const sql = `
    SELECT
      t.wallet_address,
      MAX(t.username) AS username,
      COUNT(*) AS trade_count,
      SUM(t.amount_usdc) AS total_volume,
      COUNT(DISTINCT t.market_id) AS markets_traded,
      MIN(t.timestamp) AS first_seen,
      MAX(t.timestamp) AS last_seen,
      ${scoreExpr} AS score,
      ${resolvedExpr} AS resolved_count,
      json_object_agg(t.market_category, cat_counts.cnt) AS category_breakdown
    FROM trades t
    LEFT JOIN markets m ON m.id = t.market_id
    JOIN (
      SELECT wallet_address, market_category, COUNT(*) AS cnt
      FROM trades WHERE wallet_address = $1
      GROUP BY wallet_address, market_category
    ) cat_counts ON cat_counts.wallet_address = t.wallet_address AND cat_counts.market_category = t.market_category
    WHERE t.wallet_address = $1
    GROUP BY t.wallet_address
  `;
  const res = await query(sql, [walletAddress]);
  return res.rows[0] || null;
}

module.exports = {
  insertTrade,
  getTrades,
  getTradeCount,
  upsertWalletSnapshot,
  upsertMarket,
  getUnresolvedMarkets,
  resolveMarket,
  getTopWallets,
  getWalletStats,
};
