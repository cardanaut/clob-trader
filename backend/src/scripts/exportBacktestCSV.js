/**
 * PolyChamp — Backtest Export Script
 * Runs multiple strategy configurations and exports results to CSV.
 * Usage: node src/scripts/exportBacktestCSV.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const fs   = require('fs');
const path = require('path');
const { runBacktest } = require('../strategies/backtest');

// Output directory
const OUT_DIR = path.join(__dirname, '../../../exports');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ────────────────────────────────────────────────
// Define all runs to execute
// ────────────────────────────────────────────────
const DATE_FROM = '2026-02-17T00:00:00Z';
const DATE_TO   = '2026-02-18T23:59:59Z';
const CAPITAL   = 10000;

const RUNS = [
  // ── Baseline: all 5 strategies, default params ──
  { label: 'Naive Copy – $2K+',          strategy: 'NAIVE_COPY',          minTradeUsd: 2000,  positionSizePct: 5  },
  { label: 'Liquidity Filter – $2K+',    strategy: 'LIQUIDITY_FILTER',    minTradeUsd: 2000,  positionSizePct: 5  },
  { label: 'Conviction Window – $2K+',   strategy: 'CONVICTION_WINDOW',   minTradeUsd: 2000,  positionSizePct: 5  },
  { label: 'Category Specialist – $2K+', strategy: 'CATEGORY_SPECIALIST', minTradeUsd: 2000,  positionSizePct: 5  },
  { label: 'Manual – $2K+',             strategy: 'MANUAL',              minTradeUsd: 2000,  positionSizePct: 5  },

  // ── Amount sensitivity: Naive Copy at different thresholds ──
  { label: 'Naive Copy – $500+',         strategy: 'NAIVE_COPY',          minTradeUsd: 500,   positionSizePct: 5  },
  { label: 'Naive Copy – $1K+',          strategy: 'NAIVE_COPY',          minTradeUsd: 1000,  positionSizePct: 5  },
  { label: 'Naive Copy – $5K+',          strategy: 'NAIVE_COPY',          minTradeUsd: 5000,  positionSizePct: 5  },
  { label: 'Naive Copy – $10K+',         strategy: 'NAIVE_COPY',          minTradeUsd: 10000, positionSizePct: 5  },
  { label: 'Naive Copy – $20K+',         strategy: 'NAIVE_COPY',          minTradeUsd: 20000, positionSizePct: 5  },

  // ── Position size sensitivity ──
  { label: 'Naive Copy – $2K+ / 2% pos', strategy: 'NAIVE_COPY',          minTradeUsd: 2000,  positionSizePct: 2  },
  { label: 'Naive Copy – $2K+ / 10% pos',strategy: 'NAIVE_COPY',          minTradeUsd: 2000,  positionSizePct: 10 },

  // ── Category-specific runs ──
  { label: 'Naive Copy – Sports only',    strategy: 'NAIVE_COPY',          minTradeUsd: 2000,  positionSizePct: 5, category: 'sports'   },
  { label: 'Naive Copy – Politics only',  strategy: 'NAIVE_COPY',          minTradeUsd: 2000,  positionSizePct: 5, category: 'politics' },
  { label: 'Naive Copy – Crypto only',    strategy: 'NAIVE_COPY',          minTradeUsd: 2000,  positionSizePct: 5, category: 'crypto'   },
  { label: 'Naive Copy – Other only',     strategy: 'NAIVE_COPY',          minTradeUsd: 2000,  positionSizePct: 5, category: 'other'    },

  // ── Late-entry gauge: only trades after X% of market lifetime ──
  { label: 'Naive Copy – last 50% of lifetime', strategy: 'NAIVE_COPY', minTradeUsd: 2000, positionSizePct: 5, lateEntryPct: 50, entryGaugeMode: 'after' },
  { label: 'Naive Copy – last 25% of lifetime', strategy: 'NAIVE_COPY', minTradeUsd: 2000, positionSizePct: 5, lateEntryPct: 75, entryGaugeMode: 'after' },
  { label: 'Naive Copy – last 10% of lifetime', strategy: 'NAIVE_COPY', minTradeUsd: 2000, positionSizePct: 5, lateEntryPct: 90, entryGaugeMode: 'after' },
  { label: 'Naive Copy – last 5% of lifetime',  strategy: 'NAIVE_COPY', minTradeUsd: 2000, positionSizePct: 5, lateEntryPct: 95, entryGaugeMode: 'after' },

  // ── High-conviction combo: $10K+ trades, last 25% of market lifetime ──
  { label: 'High conviction – $10K+ / last 25%', strategy: 'NAIVE_COPY', minTradeUsd: 10000, positionSizePct: 5, lateEntryPct: 75, entryGaugeMode: 'after' },

  // ── Early-entry gauge: only trades before X% of market lifetime ──
  { label: 'Naive Copy – first 50% of lifetime', strategy: 'NAIVE_COPY', minTradeUsd: 2000, positionSizePct: 5, lateEntryPct: 50, entryGaugeMode: 'before' },
  { label: 'Naive Copy – first 25% of lifetime', strategy: 'NAIVE_COPY', minTradeUsd: 2000, positionSizePct: 5, lateEntryPct: 25, entryGaugeMode: 'before' },
  { label: 'Naive Copy – first 10% of lifetime', strategy: 'NAIVE_COPY', minTradeUsd: 2000, positionSizePct: 5, lateEntryPct: 10, entryGaugeMode: 'before' },
  { label: 'Naive Copy – first 5% of lifetime',  strategy: 'NAIVE_COPY', minTradeUsd: 2000, positionSizePct: 5, lateEntryPct:  5, entryGaugeMode: 'before' },

  // ── Early-entry combo: $10K+ trades, first 25% of market lifetime ──
  { label: 'High conviction – $10K+ / first 25%', strategy: 'NAIVE_COPY', minTradeUsd: 10000, positionSizePct: 5, lateEntryPct: 25, entryGaugeMode: 'before' },

  // ── Price cap ≤70¢: skip near-certain favourites ──
  { label: 'Naive Copy – $500+ / price ≤70¢',   strategy: 'NAIVE_COPY', minTradeUsd: 500,   positionSizePct: 5, maxPrice: 0.70 },
  { label: 'Naive Copy – $2K+ / price ≤70¢',    strategy: 'NAIVE_COPY', minTradeUsd: 2000,  positionSizePct: 5, maxPrice: 0.70 },
  { label: 'Naive Copy – $5K+ / price ≤70¢',    strategy: 'NAIVE_COPY', minTradeUsd: 5000,  positionSizePct: 5, maxPrice: 0.70 },
  { label: 'Naive Copy – $10K+ / price ≤70¢',   strategy: 'NAIVE_COPY', minTradeUsd: 10000, positionSizePct: 5, maxPrice: 0.70 },
  { label: 'Naive Copy – $20K+ / price ≤70¢',   strategy: 'NAIVE_COPY', minTradeUsd: 20000, positionSizePct: 5, maxPrice: 0.70 },
  { label: 'INVERTED – $500+ / price ≤70¢',     strategy: 'NAIVE_COPY', minTradeUsd: 500,   positionSizePct: 5, maxPrice: 0.70, invertDirection: true },
  { label: 'INVERTED – $2K+ / price ≤70¢',      strategy: 'NAIVE_COPY', minTradeUsd: 2000,  positionSizePct: 5, maxPrice: 0.70, invertDirection: true },

  // ── Inverted direction: bet opposite of whale ──
  { label: 'INVERTED – Naive Copy $500+',   strategy: 'NAIVE_COPY', minTradeUsd: 500,   positionSizePct: 5, invertDirection: true },
  { label: 'INVERTED – Naive Copy $1K+',    strategy: 'NAIVE_COPY', minTradeUsd: 1000,  positionSizePct: 5, invertDirection: true },
  { label: 'INVERTED – Naive Copy $2K+',    strategy: 'NAIVE_COPY', minTradeUsd: 2000,  positionSizePct: 5, invertDirection: true },
  { label: 'INVERTED – Naive Copy $5K+',    strategy: 'NAIVE_COPY', minTradeUsd: 5000,  positionSizePct: 5, invertDirection: true },
  { label: 'INVERTED – Naive Copy $10K+',   strategy: 'NAIVE_COPY', minTradeUsd: 10000, positionSizePct: 5, invertDirection: true },
  { label: 'INVERTED – Naive Copy $20K+',   strategy: 'NAIVE_COPY', minTradeUsd: 20000, positionSizePct: 5, invertDirection: true },
  { label: 'INVERTED – Sports only',        strategy: 'NAIVE_COPY', minTradeUsd: 2000,  positionSizePct: 5, category: 'sports',  invertDirection: true },
  { label: 'INVERTED – Crypto only',        strategy: 'NAIVE_COPY', minTradeUsd: 2000,  positionSizePct: 5, category: 'crypto',  invertDirection: true },
  { label: 'INVERTED – Other only',         strategy: 'NAIVE_COPY', minTradeUsd: 2000,  positionSizePct: 5, category: 'other',   invertDirection: true },
];

// ────────────────────────────────────────────────
// CSV helpers
// ────────────────────────────────────────────────
function csvRow(values) {
  return values.map(v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  }).join(',');
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(','), ...rows.map(csvRow)];
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
  console.log(`  Wrote ${rows.length} rows → ${filePath}`);
}

// ────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────
async function main() {
  console.log(`\nPolyChamp Backtest Export`);
  console.log(`Date range : ${DATE_FROM} → ${DATE_TO}`);
  console.log(`Runs       : ${RUNS.length}`);
  console.log(`Output dir : ${OUT_DIR}\n`);

  const summaryRows  = [];
  const tradeRows    = [];
  const runMeta      = [];

  for (let i = 0; i < RUNS.length; i++) {
    const cfg = RUNS[i];
    const runId = `R${String(i + 1).padStart(2, '0')}`;
    process.stdout.write(`[${runId}] ${cfg.label} ... `);

    try {
      const result = await runBacktest({
        strategy:          cfg.strategy,
        dateFrom:          DATE_FROM,
        dateTo:            DATE_TO,
        startingCapital:   CAPITAL,
        positionSizePct:   cfg.positionSizePct,
        category:          cfg.category,
        minTradeUsd:       cfg.minTradeUsd        ?? 2000,
        maxPrice:          cfg.maxPrice           ?? 1,
        marketMaxLifetimeH:cfg.marketMaxLifetimeH  ?? 0,
        lateEntryPct:      cfg.lateEntryPct        ?? 0,
        entryGaugeMode:    cfg.entryGaugeMode      ?? 'after',
        invertDirection:   cfg.invertDirection      ?? false,
      });

      const m = result.metrics;
      console.log(`${m.totalTrades} trades / ${m.resolvedTrades} resolved / win rate ${m.winRate ?? 'n/a'}%`);

      // Summary row
      summaryRows.push([
        runId,
        cfg.label,
        cfg.strategy,
        cfg.category || 'all',
        cfg.minTradeUsd ?? 2000,
        cfg.maxPrice ?? 1,
        cfg.positionSizePct,
        cfg.lateEntryPct ?? 0,
        cfg.entryGaugeMode ?? 'after',
        cfg.marketMaxLifetimeH ?? 0,
        cfg.invertDirection ? 'YES' : 'NO',
        CAPITAL,
        m.totalTrades,
        m.resolvedTrades,
        m.openTrades,
        m.wins,
        m.losses,
        m.winRate ?? '',
        m.totalPnl,
        m.totalReturnPct,
        m.sharpe ?? '',
        m.maxDrawdownPct,
        m.finalEquity,
      ]);

      // Trade rows
      for (const t of result.tradeLog) {
        tradeRows.push([
          runId,
          cfg.label,
          cfg.strategy,
          cfg.category || 'all',
          cfg.invertDirection ? 'YES' : 'NO',
          t.timestamp,
          t.wallet,
          t.username || '',
          t.market,
          t.market_id,
          t.whale_outcome || t.outcome,
          t.outcome,
          t.price,
          t.whale_amount,
          t.our_size,
          t.elapsed_pct ?? '',
          t.lifetime_h  ?? '',
          t.pnl,
          t.pnl_pct,
          t.status,
          t.category,
        ]);
      }

      // Equity curve (separate per run)
      runMeta.push({ runId, label: cfg.label, equityCurve: result.equityCurve });

    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      summaryRows.push([runId, cfg.label, cfg.strategy, cfg.category || 'all',
        cfg.minTradeUsd, cfg.positionSizePct, cfg.lateEntryPct ?? 0, cfg.marketMaxLifetimeH ?? 0,
        CAPITAL, 'ERROR', err.message]);
    }
  }

  // ── Write summary CSV ──
  writeCsv(
    path.join(OUT_DIR, 'backtest_summary.csv'),
    ['RunID','Label','Strategy','Category','MinTradeUSD','MaxPrice','PositionSizePct','LateEntryPct','EntryGaugeMode',
     'MarketMaxLifetimeH','InvertDirection','StartingCapital','TotalTrades','ResolvedTrades','OpenTrades',
     'Wins','Losses','WinRate%','TotalPnL','TotalReturn%','Sharpe','MaxDrawdown%','FinalEquity'],
    summaryRows
  );

  // ── Write trade log CSV ──
  writeCsv(
    path.join(OUT_DIR, 'backtest_trades.csv'),
    ['RunID','Label','Strategy','Category','InvertDirection','Timestamp','Wallet','Username',
     'Market','MarketID','WhaleOutcome','OurOutcome','Price','WhaleUSD','OurSize',
     'ElapsedPct','LifetimeH','PnL','PnLPct','Status','MarketCategory'],
    tradeRows
  );

  // ── Write equity curves CSV ──
  const curveRows = [];
  for (const { runId, label, equityCurve } of runMeta) {
    for (const pt of equityCurve) {
      curveRows.push([runId, label, pt.date, pt.equity]);
    }
  }
  writeCsv(
    path.join(OUT_DIR, 'backtest_equity_curves.csv'),
    ['RunID','Label','Date','Equity'],
    curveRows
  );

  // ── Write resolved trades only (for win/loss analysis) ──
  // Status is at index 19 (RunID,Label,Strategy,Category,InvertDirection,Timestamp,...,Status)
  const resolvedRows = tradeRows.filter(r => r[19] === 'win' || r[19] === 'loss');
  writeCsv(
    path.join(OUT_DIR, 'backtest_resolved_trades.csv'),
    ['RunID','Label','Strategy','Category','InvertDirection','Timestamp','Wallet','Username',
     'Market','MarketID','WhaleOutcome','OurOutcome','Price','WhaleUSD','OurSize',
     'ElapsedPct','LifetimeH','PnL','PnLPct','Status','MarketCategory'],
    resolvedRows
  );

  console.log(`\nExport complete. ${summaryRows.length} runs, ${tradeRows.length} trade rows, ${resolvedRows.length} resolved.`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
