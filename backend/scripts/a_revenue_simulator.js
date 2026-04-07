#!/usr/bin/env node
/**
 * Revenue Simulation for Spike Trading Strategy
 *
 * Simulates compound growth with configurable parameters:
 * - Win rate (default: 87%)
 * - Entry price (default: 63¢)
 * - Risk per trade (default: 5%)
 * - Max position size (default: $150 - Polymarket liquidity cap)
 * - Max exposure (default: 80% of total balance)
 * - Reinvestment/withdrawal split
 *
 * Usage:
 *   node a_revenue_simulator.js
 *   node a_revenue_simulator.js --capital 50 --winrate 90 --days 30
 *   node a_revenue_simulator.js --help
 */

'use strict';

const args = parseArgs();

if (args.help) {
  printHelp();
  process.exit(0);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const params = {
    capital: 20,
    winrate: 87,
    entryPrice: 0.63,
    risk: 5,
    maxPosition: 150,
    maxExposure: 80,
    trades: 50,
    reinvest: 70,
    withdraw: 30,
    days: null,
    help: false
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const next = process.argv[i + 1];

    switch (arg) {
      case '--help':
      case '-h':
        params.help = true;
        break;
      case '--capital':
      case '-c':
        params.capital = parseFloat(next);
        i++;
        break;
      case '--winrate':
      case '-w':
        params.winrate = parseFloat(next);
        i++;
        break;
      case '--entry-price':
      case '-e':
        params.entryPrice = parseFloat(next);
        i++;
        break;
      case '--risk':
      case '-r':
        params.risk = parseFloat(next);
        i++;
        break;
      case '--max-position':
      case '-m':
        params.maxPosition = parseFloat(next);
        i++;
        break;
      case '--max-exposure':
      case '-x':
        params.maxExposure = parseFloat(next);
        i++;
        break;
      case '--trades-per-day':
      case '-t':
        params.trades = parseInt(next);
        i++;
        break;
      case '--reinvest':
        params.reinvest = parseFloat(next);
        i++;
        break;
      case '--withdraw':
        const withdrawVal = parseFloat(next);
        if (withdrawVal < 0 || withdrawVal > 90) {
          console.error('Error: --withdraw must be between 0 and 90');
          process.exit(1);
        }
        params.withdraw = withdrawVal;
        i++;
        break;
      case '--days':
      case '-d':
        params.days = parseInt(next);
        i++;
        break;
    }
  }

  return params;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              SPIKE TRADING REVENUE SIMULATOR                         ║
╚══════════════════════════════════════════════════════════════════════╝

USAGE:
  node a_revenue_simulator.js [OPTIONS]

OPTIONS:
  -c, --capital <amount>         Starting capital (default: 20)
  -w, --winrate <percent>        Win rate percentage (default: 87)
  -e, --entry-price <price>      Entry price in decimal (default: 0.63)
  -r, --risk <percent>           Risk per trade % (default: 5)
  -m, --max-position <amount>    Max position size USD (default: 150)
  -x, --max-exposure <percent>   Max exposure % of balance (default: 80)
  -t, --trades-per-day <count>   Trades per day (default: 50)
  --reinvest <percent>           Reinvestment % of profit (default: 70)
  --withdraw <percent>           Withdrawal % of profit, 0-90 (default: 30)
                                 Note: Only applies below optimal reserve
  -d, --days <count>             Specific days to simulate (optional)
  -h, --help                     Show this help

OPTIMAL RESERVE:
  The simulator calculates optimal reserve balance using:
    Reserve = ceil((maxPosition / risk%) / winRate% × 1.05 / 1000) × 1000

  When balance exceeds reserve, excess is auto-withdrawn immediately.
  Below reserve, normal reinvest/withdraw split applies.

EXAMPLES:
  # Default simulation (1 day, 1 week, 1 month, 1 year)
  node a_revenue_simulator.js

  # Custom starting capital and win rate
  node a_revenue_simulator.js --capital 100 --winrate 90

  # Simulate 60 days with 40 trades/day
  node a_revenue_simulator.js --days 60 --trades-per-day 40

  # Higher risk strategy
  node a_revenue_simulator.js --risk 10 --max-position 200
`);
}

/**
 * Simulate trading revenue over time
 */
function simulateRevenue(config) {
  const {
    startingBalance = 20.00,
    winRate = 0.87,
    entryPrice = 0.63,
    riskPct = 5, // Risk % per trade
    maxPositionSize = 150, // Max position in USD
    maxExposurePct = 80, // Max % of balance at risk
    tradesPerDay = 50,
    days = 1,
    reinvestPct = 70,
    withdrawalPct = 30,
  } = config;

  let balance = startingBalance;
  let totalWithdrawn = 0;
  let pendingWithdrawal = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalTrades = 0;
  let totalVolume = 0;
  let autoWithdrawn = 0; // Track auto-withdrawals when above reserve
  let minimumBalanceFloor = startingBalance; // Never withdraw below this (capital preservation)

  const winProfit = 1.00 - entryPrice; // Profit per share on win
  const lossAmount = entryPrice; // Loss per share on loss

  // Calculate optimal reserve balance
  // Formula: ((maxPosition / risk%) / winRate%) × 1.05, rounded up to nearest $1000
  const baseReserve = (maxPositionSize / (riskPct / 100)) / winRate;
  const reserveWithMargin = baseReserve * 1.05;
  const optimalReserve = Math.ceil(reserveWithMargin / 1000) * 1000;

  const dailySnapshots = [];
  let lastSnapshotWithdrawn = 0; // Track withdrawals at last snapshot for period calculations

  for (let day = 1; day <= days; day++) {
    const tradesThisDay = Math.floor(tradesPerDay);

    for (let i = 0; i < tradesThisDay; i++) {
      totalTrades++;

      // Calculate position size (risk % of current balance)
      let positionSize = balance * (riskPct / 100);

      // Apply max position size cap (liquidity limit)
      if (positionSize > maxPositionSize) {
        positionSize = maxPositionSize;
      }

      // Apply max exposure constraint (can't risk more than maxExposurePct of balance)
      const maxAllowedPosition = balance * (maxExposurePct / 100);
      if (positionSize > maxAllowedPosition) {
        positionSize = maxAllowedPosition;
      }

      // Can't trade if position too small
      if (positionSize < 0.10) {
        break; // Stop trading if balance too small
      }

      // Calculate shares we can buy
      const shares = positionSize / entryPrice;
      totalVolume += positionSize;

      // Determine win/loss (use random but match target win rate over time)
      const isWin = (Math.random() < winRate);

      if (isWin) {
        // WIN: shares pay out $1.00 each
        const payout = shares * 1.00;
        const profit = payout - positionSize;

        // Check if we've hit the reserve cap
        const currentBalance = balance - positionSize + payout;

        if (currentBalance >= optimalReserve) {
          // Above reserve: keep only optimal reserve, withdraw excess immediately
          const excess = currentBalance - optimalReserve;
          balance = optimalReserve;
          totalWithdrawn += excess;
          autoWithdrawn += excess;

          // Update minimum floor to optimal reserve (capital has grown)
          if (optimalReserve > minimumBalanceFloor) {
            minimumBalanceFloor = optimalReserve;
          }
        } else {
          // Below reserve: use normal split (reinvest % / withdraw % monthly)
          const withdrawAmount = profit * (withdrawalPct / 100);
          balance = currentBalance - withdrawAmount;
          pendingWithdrawal += withdrawAmount;
        }

        totalWins++;
      } else {
        // LOSS: shares become worthless
        balance -= positionSize;
        totalLosses++;
      }
    }

    // Periodic withdrawal
    // For short periods (<30 days): withdraw at end of period
    // For long periods (≥30 days): withdraw every 30 days
    const isWithdrawalDay = (days < 30 && day === days) || (days >= 30 && day % 30 === 0);

    if (isWithdrawalDay && pendingWithdrawal > 0) {
      // Capital preservation: never withdraw below minimum balance floor
      const totalAvailable = balance + pendingWithdrawal;

      if (totalAvailable > minimumBalanceFloor) {
        const actualWithdrawal = totalAvailable - minimumBalanceFloor;
        totalWithdrawn += actualWithdrawal;
        balance = minimumBalanceFloor;
        pendingWithdrawal = 0;

        // Update floor for next month to current balance if it grew
        if (balance > minimumBalanceFloor) {
          minimumBalanceFloor = balance;
        }
      } else {
        // Not enough to withdraw while maintaining floor, keep everything
        balance = totalAvailable;
        pendingWithdrawal = 0;
      }
    }

    // Snapshot at specific intervals
    if (day === 1 || day === 7 || day === 30 || day === 60 || day === 90 || day === 180 || day === 365 || day === days) {
      const periodWithdrawn = totalWithdrawn - lastSnapshotWithdrawn;

      dailySnapshots.push({
        day,
        balance: balance.toFixed(2),
        pendingWithdrawal: pendingWithdrawal.toFixed(2),
        periodWithdrawn: periodWithdrawn.toFixed(2),
        totalWithdrawn: totalWithdrawn.toFixed(2),
        totalTrades,
        totalVolume: totalVolume.toFixed(2),
        wins: totalWins,
        losses: totalLosses,
        actualWinRate: ((totalWins / totalTrades) * 100).toFixed(1) + '%'
      });

      lastSnapshotWithdrawn = totalWithdrawn;
    }
  }

  // Final withdrawal of any pending amount (respecting minimum balance floor)
  if (pendingWithdrawal > 0) {
    const totalAvailable = balance + pendingWithdrawal;

    if (totalAvailable > minimumBalanceFloor) {
      const actualWithdrawal = totalAvailable - minimumBalanceFloor;
      totalWithdrawn += actualWithdrawal;
      balance = minimumBalanceFloor;
      pendingWithdrawal = 0;
    } else {
      // Keep everything in balance
      balance = totalAvailable;
      pendingWithdrawal = 0;
    }
  }

  const finalBalance = balance;
  const totalProfit = (finalBalance + totalWithdrawn) - startingBalance;
  const roi = ((totalProfit / startingBalance) * 100).toFixed(2);

  return {
    startingBalance: startingBalance.toFixed(2),
    finalBalance: finalBalance.toFixed(2),
    totalWithdrawn: totalWithdrawn.toFixed(2),
    autoWithdrawn: autoWithdrawn.toFixed(2),
    monthlyWithdrawn: (totalWithdrawn - autoWithdrawn).toFixed(2),
    totalValue: (finalBalance + totalWithdrawn).toFixed(2),
    totalProfit: totalProfit.toFixed(2),
    totalVolume: totalVolume.toFixed(2),
    roi: roi + '%',
    totalTrades,
    wins: totalWins,
    losses: totalLosses,
    actualWinRate: ((totalWins / totalTrades) * 100).toFixed(1) + '%',
    optimalReserve: optimalReserve.toFixed(2),
    snapshots: dailySnapshots,
    config: {
      days,
      winRate: (winRate * 100) + '%',
      entryPrice: '$' + entryPrice.toFixed(2),
      riskPct: riskPct + '%',
      maxPositionSize: '$' + maxPositionSize.toFixed(2),
      maxExposurePct: maxExposurePct + '%',
      tradesPerDay,
      reinvestPct: reinvestPct + '%',
      withdrawalPct: withdrawalPct + '%'
    }
  };
}

/**
 * Format results as a readable report
 */
function formatReport(results) {
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('              SPIKE TRADING REVENUE SIMULATION');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('CONFIGURATION:');
  lines.push(`  Starting Balance:     $${results.startingBalance}`);
  lines.push(`  Win Rate:             ${results.config.winRate}`);
  lines.push(`  Entry Price:          ${results.config.entryPrice}`);
  lines.push(`  Risk Per Trade:       ${results.config.riskPct} of balance`);
  lines.push(`  Max Position Size:    ${results.config.maxPositionSize} (liquidity cap)`);
  lines.push(`  Max Exposure:         ${results.config.maxExposurePct} of balance`);
  lines.push(`  Optimal Reserve:      $${results.optimalReserve} (auto-withdraw above this)`);
  lines.push(`  Trades Per Day:       ${results.config.tradesPerDay}`);
  lines.push(`  Simulation Period:    ${results.config.days} days`);
  lines.push(`  Reinvestment:         ${results.config.reinvestPct} of profits (below reserve)`);

  // Dynamic label: "Period Withdrawn" for <30 days, "Monthly Withdrawn" for ≥30 days
  const withdrawalLabel = results.config.days < 30 ? 'Period Withdrawal' : 'Monthly Withdrawal';
  lines.push(`  ${withdrawalLabel}:   ${results.config.withdrawalPct} of profits (below reserve)`);
  lines.push('');
  lines.push('RESULTS:');
  lines.push(`  Total Trades:         ${results.totalTrades}`);
  lines.push(`  Total Volume:         $${results.totalVolume}`);
  lines.push(`  Wins:                 ${results.wins}`);
  lines.push(`  Losses:               ${results.losses}`);
  lines.push(`  Actual Win Rate:      ${results.actualWinRate}`);
  lines.push('');
  lines.push(`  Final Balance:        $${results.finalBalance}`);
  lines.push(`  Auto-Withdrawn:       $${results.autoWithdrawn} (above reserve)`);

  // Dynamic label for withdrawn amount
  const withdrawnLabel = results.config.days < 30 ? 'Period Withdrawn' : 'Monthly Withdrawn';
  lines.push(`  ${withdrawnLabel}:    $${results.monthlyWithdrawn} (${results.config.withdrawalPct} of profits)`);
  lines.push(`  ─────────────────────────────────────────────────────────────`);
  lines.push(`  Total Withdrawn:      $${results.totalWithdrawn}`);
  lines.push(`  Total Value:          $${results.totalValue}`);
  lines.push(`  Total Profit:         $${results.totalProfit}`);
  lines.push(`  ROI:                  ${results.roi}`);
  lines.push('');

  if (results.snapshots.length > 0) {
    lines.push('SNAPSHOTS:');
    lines.push('  Day | Balance    | Pending W/D | Period W/D  | Total W/D   | Trades | W/L      | Win%');
    lines.push('  ────┼────────────┼─────────────┼─────────────┼─────────────┼────────┼──────────┼──────');
    results.snapshots.forEach(s => {
      const dayStr = s.day.toString().padEnd(3);
      const balStr = ('$' + s.balance).padEnd(10);
      const pendStr = ('$' + s.pendingWithdrawal).padEnd(11);
      const periodWdStr = ('$' + s.periodWithdrawn).padEnd(11);
      const totalWdStr = ('$' + s.totalWithdrawn).padEnd(11);
      const tradeStr = s.totalTrades.toString().padEnd(6);
      const wlStr = (`${s.wins}/${s.losses}`).padEnd(8);
      lines.push(`  ${dayStr} | ${balStr} | ${pendStr} | ${periodWdStr} | ${totalWdStr} | ${tradeStr} | ${wlStr} | ${s.actualWinRate}`);
    });
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

// Run simulations
console.log('\n');

if (args.days) {
  // Single custom simulation
  const result = simulateRevenue({
    startingBalance: args.capital,
    winRate: args.winrate / 100,
    entryPrice: args.entryPrice,
    riskPct: args.risk,
    maxPositionSize: args.maxPosition,
    maxExposurePct: args.maxExposure,
    tradesPerDay: args.trades,
    days: args.days,
    reinvestPct: args.reinvest,
    withdrawalPct: args.withdraw
  });
  console.log(formatReport(result));
} else {
  // Standard suite: 1 day, 1 week, 1 month, 1 year
  const baseConfig = {
    startingBalance: args.capital,
    winRate: args.winrate / 100,
    entryPrice: args.entryPrice,
    riskPct: args.risk,
    maxPositionSize: args.maxPosition,
    maxExposurePct: args.maxExposure,
    tradesPerDay: args.trades,
    reinvestPct: args.reinvest,
    withdrawalPct: args.withdraw
  };

  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║              REALISTIC REVENUE PROJECTIONS                           ║');
  console.log(`║         Max Position: $${args.maxPosition} | Max Exposure: ${args.maxExposure}%                      ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // 1 Day
  const day1 = simulateRevenue({ ...baseConfig, days: 1 });
  console.log(formatReport(day1));
  console.log('\n\n');

  // 1 Week
  const week1 = simulateRevenue({ ...baseConfig, days: 7 });
  console.log(formatReport(week1));
  console.log('\n\n');

  // 1 Month
  const month1 = simulateRevenue({ ...baseConfig, days: 30 });
  console.log(formatReport(month1));
  console.log('\n\n');

  // 1 Year
  const year1 = simulateRevenue({ ...baseConfig, days: 365 });
  console.log(formatReport(year1));
  console.log('\n\n');
}

module.exports = { simulateRevenue, formatReport };
