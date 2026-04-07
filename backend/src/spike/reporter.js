/**
 * SpikeTrading Performance Reporter
 * Generates metrics and reports from paper trading data
 */

'use strict';

const { query } = require('../database/connection');
const logger = require('../utils/logger');
const config = require('./config');

/**
 * Generate a performance report
 * @param {Number} days - Number of days to analyze (default: all)
 * @returns {Object} Report metrics
 */
async function generateReport(days = null) {
  try {
    // Validate and sanitize days parameter to prevent SQL injection
    const validDays = days && Number.isInteger(days) && days > 0 && days < 3650 ? days : null;
    const whereClause = validDays ? `WHERE timestamp > NOW() - INTERVAL '${validDays} days'` : '';

    // Get all trades
    const tradesRes = await query(`
      SELECT
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE outcome = 'WIN') as wins,
        COUNT(*) FILTER (WHERE outcome = 'LOSS') as losses,
        COUNT(*) FILTER (WHERE outcome = 'PENDING') as pending,
        AVG(simulated_entry_price) FILTER (WHERE outcome != 'PENDING') as avg_entry_price,
        AVG(pnl_pct) FILTER (WHERE outcome = 'WIN') as avg_win_pct,
        AVG(pnl_pct) FILTER (WHERE outcome = 'LOSS') as avg_loss_pct,
        AVG(pnl_pct) FILTER (WHERE outcome != 'PENDING') as avg_pnl_pct,
        MIN(timestamp) as first_trade,
        MAX(timestamp) as last_trade
      FROM spike_trades_simulated
      ${whereClause}
    `);

    const stats = tradesRes.rows[0];

    // Calculate metrics
    const totalTrades = parseInt(stats.total_trades) || 0;
    const wins = parseInt(stats.wins) || 0;
    const losses = parseInt(stats.losses) || 0;
    const pending = parseInt(stats.pending) || 0;
    const completedTrades = wins + losses;

    const winRate = completedTrades > 0 ? (wins / completedTrades) * 100 : 0;
    const avgEntryPrice = parseFloat(stats.avg_entry_price) || 0;
    const avgWinPct = parseFloat(stats.avg_win_pct) || 0;
    const avgLossPct = parseFloat(stats.avg_loss_pct) || 0;
    const evPerTrade = parseFloat(stats.avg_pnl_pct) || 0;

    // Get signal distribution
    const signalRes = await query(`
      SELECT
        signal_type,
        COUNT(*) as count,
        AVG(pnl_pct) FILTER (WHERE outcome != 'PENDING') as avg_pnl
      FROM spike_trades_simulated
      ${whereClause}
      GROUP BY signal_type
    `);

    const signals = {};
    for (const row of signalRes.rows) {
      signals[row.signal_type] = {
        count: parseInt(row.count),
        avgPnl: parseFloat(row.avg_pnl) || 0
      };
    }

    // Calculate max drawdown (simplified: worst losing streak)
    const drawdownRes = await query(`
      SELECT pnl_pct
      FROM spike_trades_simulated
      ${whereClause}
      WHERE outcome != 'PENDING'
      ORDER BY timestamp ASC
    `);

    let currentDrawdown = 0;
    let maxDrawdown = 0;
    for (const row of drawdownRes.rows) {
      const pnl = parseFloat(row.pnl_pct);
      currentDrawdown = pnl < 0 ? currentDrawdown + pnl : 0;
      maxDrawdown = Math.min(maxDrawdown, currentDrawdown);
    }

    const report = {
      period: {
        days,
        firstTrade: stats.first_trade,
        lastTrade: stats.last_trade
      },
      trades: {
        total: totalTrades,
        completed: completedTrades,
        pending,
        wins,
        losses
      },
      performance: {
        winRate: winRate.toFixed(1) + '%',
        avgEntryPrice: avgEntryPrice.toFixed(4),
        avgWin: avgWinPct.toFixed(1) + '%',
        avgLoss: avgLossPct.toFixed(1) + '%',
        evPerTrade: evPerTrade.toFixed(2) + '%',
        maxDrawdown: maxDrawdown.toFixed(1) + '%'
      },
      signals
    };

    return report;
  } catch (err) {
    logger.error('[spike-reporter] Error generating report', { error: err.message });
    throw err;
  }
}

/**
 * Print report to console
 */
async function printReport(days = null) {
  const report = await generateReport(days);

  // Get capital info
  const capitalRes = await query('SELECT current_capital, total_pnl FROM spike_capital ORDER BY id DESC LIMIT 1');
  const capital = capitalRes.rows[0] || { current_capital: 2000, total_pnl: 0 };
  const currentCapital = parseFloat(capital.current_capital);
  const totalPnl = parseFloat(capital.total_pnl);
  const roi = ((currentCapital - config.STARTING_CAPITAL) / config.STARTING_CAPITAL) * 100;

  const period = days ? `Last ${days} days` : 'All time';
  const firstTrade = report.period.firstTrade ? new Date(report.period.firstTrade).toISOString() : 'N/A';
  const lastTrade = report.period.lastTrade ? new Date(report.period.lastTrade).toISOString() : 'N/A';

  console.log('\n' + '='.repeat(60));
  console.log('SPIKE TRADING - PAPER TRADING REPORT');
  console.log('='.repeat(60));
  console.log(`Period: ${period}`);
  console.log(`First trade: ${firstTrade}`);
  console.log(`Last trade:  ${lastTrade}`);
  console.log('');
  console.log('CAPITAL:');
  console.log(`  Starting:   $${config.STARTING_CAPITAL.toFixed(2)}`);
  console.log(`  Current:    $${currentCapital.toFixed(2)}`);
  console.log(`  Total P&L:  ${totalPnl > 0 ? '+' : ''}$${totalPnl.toFixed(2)}`);
  console.log(`  ROI:        ${roi > 0 ? '+' : ''}${roi.toFixed(2)}%`);
  console.log('');
  console.log('TRADES:');
  console.log(`  Total:     ${report.trades.total}`);
  console.log(`  Completed: ${report.trades.completed}`);
  console.log(`  Pending:   ${report.trades.pending}`);
  console.log(`  Wins:      ${report.trades.wins}`);
  console.log(`  Losses:    ${report.trades.losses}`);
  console.log('');
  console.log('PERFORMANCE:');
  console.log(`  Win Rate:        ${report.performance.winRate}`);
  console.log(`  Avg Entry Price: ${report.performance.avgEntryPrice}`);
  console.log(`  Avg Win:         ${report.performance.avgWin}`);
  console.log(`  Avg Loss:        ${report.performance.avgLoss}`);
  console.log(`  EV per Trade:    ${report.performance.evPerTrade}`);
  console.log(`  Max Drawdown:    ${report.performance.maxDrawdown}`);
  console.log('');
  console.log('SIGNALS:');
  for (const [type, data] of Object.entries(report.signals)) {
    console.log(`  ${type}: ${data.count} trades, avg P&L: ${data.avgPnl.toFixed(2)}%`);
  }
  console.log('='.repeat(60));
  console.log('');

  // Verdict
  const ev = parseFloat(report.performance.evPerTrade);
  if (report.trades.completed < 20) {
    console.log('⚠️  INSUFFICIENT DATA: Need at least 20 completed trades for statistical significance');
  } else if (ev < 0) {
    console.log('❌ STRATEGY NON-VIABLE: Negative EV detected');
    console.log(`   Final capital would be: $${currentCapital.toFixed(2)} (${roi.toFixed(2)}% loss)`);
  } else if (ev < 3) {
    console.log('⚠️  MARGINAL EDGE: EV < 3%, likely eaten by fees and slippage');
  } else if (ev >= 3 && ev < 5) {
    console.log('⚠️  WEAK EDGE: Consider micro-test with $100-300');
  } else {
    console.log('✅ PROMISING EDGE: EV > 5%, recommend controlled testing');
    console.log(`   Final capital would be: $${currentCapital.toFixed(2)} (${roi > 0 ? '+' : ''}${roi.toFixed(2)}% ROI)`);
  }
  console.log('');
}

module.exports = {
  generateReport,
  printReport
};
