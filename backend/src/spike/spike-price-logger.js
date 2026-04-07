'use strict';

/**
 * Spike Price Logger
 *
 * At every spike detection, records:
 *   - Binance spike size and direction
 *   - Minute in cycle + minutes remaining
 *   - Actual CLOB YES/NO ask prices from Polymarket
 *   - Theoretical binary-option fair price (Black-Scholes cash-or-nothing)
 *   - Implied sigma (back-calculated from market price)
 *
 * Output: backend/logs/spike_prices.csv
 *
 * Purpose: calibrate the gap between theoretical and real NO ask prices
 * so we can build an accurate backtest for the counter-spike strategy.
 *
 * Usage: always-on (no feature flag needed — zero trading impact, log only)
 */

const fs   = require('fs');
const path = require('path');

const LOG_FILES = {
  polymarket: path.join(__dirname, '../../logs/spike_prices_polymarket.csv'),
  kalshi:     path.join(__dirname, '../../logs/spike_prices_kalshi.csv'),
};

// Per-crypto 1-minute volatility (annualised vol / sqrt(525600 minutes/year))
// Based on ~1-year historical data; tune as needed
const SIGMA_1MIN = {
  BTC: 0.000745,  // ~54% annual
  ETH: 0.000897,  // ~65% annual
  SOL: 0.001241,  // ~90% annual
  XRP: 0.001103,  // ~80% annual
};

// Standard normal CDF (Abramowitz & Stegun approximation, error < 1.5e-7)
function normCdf(x) {
  if (x < -8) return 0;
  if (x >  8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.319381530
    + t * (-0.356563782
    + t * (1.781477937
    + t * (-1.821255978
    + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

// Inverse normal CDF (Beasley-Springer-Moro, sufficient for our range)
function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return  Infinity;
  const a = [0, -3.969683028665376e+01,  2.209460984245205e+02,
    -2.759285104469687e+02,  1.383577518672690e+02,
    -3.066479806614716e+01,  2.506628277459239e+00];
  const b = [0, -5.447609879822406e+01,  1.615858368580409e+02,
    -1.556989798598866e+02,  6.680131188771972e+01,
    -1.328068155288572e+01];
  const c = [0, -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
     4.374664141464968e+00,  2.938163982698783e+00];
  const d = [0,  7.784695709041462e-03,  3.224671290700398e-01,
               2.445134137142996e+00,  3.754408661907416e+00];
  const pLow  = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
           ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[1]*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+a[6])*q /
           (((((b[1]*r+b[2])*r+b[3])*r+b[4])*r+b[5])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) /
             ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
  }
}

/**
 * Calculate binary-option fair prices.
 *
 * @param {number} spikePct       - price move from reference (positive = UP), as decimal (e.g. 0.004)
 * @param {number} minsRemaining  - minutes left in the 5-min cycle
 * @param {string} crypto         - BTC/ETH/SOL/XRP
 * @returns {{ yesFair, noFair, d2 }}
 */
function binaryOptionPrice(spikePct, minsRemaining, crypto) {
  const sigma1m = SIGMA_1MIN[crypto] || SIGMA_1MIN.BTC;
  if (minsRemaining <= 0) return { yesFair: spikePct > 0 ? 1 : 0, noFair: spikePct > 0 ? 0 : 1, d2: null };

  // d2 = ln(S/K) / (sigma * sqrt(T)) — drift term negligible for 5 min
  const d2 = spikePct / (sigma1m * Math.sqrt(minsRemaining));
  const yesFair = normCdf(d2);
  const noFair  = 1 - yesFair;
  return { yesFair, noFair, d2 };
}

/**
 * Back-calculate implied sigma from the actual market NO ask price.
 *
 * If NO_ask = N(-d2) and d2 = spikePct / (sigma * sqrt(T)):
 *   sigma_implied = spikePct / (normInv(1 - NO_ask) * sqrt(T))
 *
 * @returns {number|null} annualised implied sigma
 */
function impliedSigma(spikePct, minsRemaining, noAsk) {
  if (!noAsk || noAsk <= 0 || noAsk >= 1 || minsRemaining <= 0 || spikePct === 0) return null;
  // noAsk = N(-d2)  →  -d2 = normInv(noAsk)  →  d2 = normInv(1 - noAsk)
  const d2 = normInv(1 - noAsk);
  if (!isFinite(d2) || d2 <= 0) return null;
  const sigma1m = spikePct / (d2 * Math.sqrt(minsRemaining));
  // Annualise: sigma_annual = sigma_1min * sqrt(525600)
  return sigma1m * Math.sqrt(525600);
}

// ── CSV helpers ────────────────────────────────────────────────────────────────

const CSV_HEADER = [
  'timestamp', 'crypto', 'signal_type', 'spike_pct',
  'minute_in_cycle', 'mins_remaining',
  'reference_price', 'spike_price',
  'yes_ask_clob', 'no_ask_clob',
  'yes_fair_bs', 'no_fair_bs', 'd2',
  'implied_sigma_annual',
  'market_slug'
].join(',') + '\n';

function ensureHeader(file) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, CSV_HEADER, 'utf8');
  }
}

function csvRow(obj) {
  return [
    obj.timestamp,
    obj.crypto,
    obj.signalType,
    obj.spikePct.toFixed(4),
    obj.minuteInCycle,
    obj.minsRemaining.toFixed(2),
    obj.referencePrice.toFixed(2),
    obj.spikePrice.toFixed(2),
    obj.yesAsk    != null ? obj.yesAsk.toFixed(4)    : '',
    obj.noAsk     != null ? obj.noAsk.toFixed(4)     : '',
    obj.yesFair.toFixed(4),
    obj.noFair.toFixed(4),
    obj.d2 != null ? obj.d2.toFixed(3) : '',
    obj.impliedSigmaAnnual != null ? (obj.impliedSigmaAnnual * 100).toFixed(1) : '',
    obj.marketSlug || ''
  ].join(',') + '\n';
}

// ── Internal write ─────────────────────────────────────────────────────────────

// Normalise signal type: engine uses BUY_YES/BUY_NO, logger may receive UP/DOWN
function isUpSignal(signalType) {
  return signalType === 'UP' || signalType === 'BUY_YES';
}

function _write(file, { crypto, signalType, spikePct, minuteInCycle, minsRemaining,
                        referencePrice, spikePrice, yesAsk, noAsk, marketSlug }) {
  try {
    ensureHeader(file);

    const spikeDec   = (isUpSignal(signalType) ? 1 : -1) * spikePct / 100;
    const { yesFair, noFair, d2 } = binaryOptionPrice(spikeDec, minsRemaining, crypto);

    // Implied sigma from the counter-trade token price
    // UP spike → we'd trade NO → noAsk is the relevant counter price
    const counterAsk = isUpSignal(signalType) ? noAsk : yesAsk;
    const iSigma     = impliedSigma(Math.abs(spikeDec), minsRemaining, counterAsk);

    const row = csvRow({
      timestamp:          new Date().toISOString(),
      crypto,
      signalType,
      spikePct:           Math.abs(spikePct),
      minuteInCycle,
      minsRemaining,
      referencePrice,
      spikePrice,
      yesAsk,
      noAsk,
      yesFair,
      noFair,
      d2,
      impliedSigmaAnnual: iSigma,
      marketSlug:         marketSlug || '',
    });

    fs.appendFileSync(file, row, 'utf8');
  } catch (err) {
    process.stderr.write(`[spike-price-logger] ${err.message}\n`);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Log a spike event for Polymarket (5-min markets).
 *
 * @param {string}  params.crypto          - 'BTC' | 'ETH' | 'SOL' | 'XRP'
 * @param {string}  params.signalType      - 'UP' | 'DOWN'
 * @param {number}  params.spikePct        - Binance candle move from reference (%)
 * @param {number}  params.minuteInCycle   - 0..4
 * @param {Date}    params.cycleEnd        - when the Polymarket 5-min market closes
 * @param {number}  params.referencePrice  - Binance price at cycle T+0 open
 * @param {number}  params.spikePrice      - Binance price at spike candle close
 * @param {object}  params.clobPrices      - priceCache entry: { up, down, market }
 */
function recordPolymarket({ crypto, signalType, spikePct, minuteInCycle,
                            cycleEnd, referencePrice, spikePrice, clobPrices }) {
  _write(LOG_FILES.polymarket, {
    crypto, signalType, spikePct, minuteInCycle,
    minsRemaining: Math.max(0, (cycleEnd - Date.now()) / 60000),
    referencePrice, spikePrice,
    yesAsk:     clobPrices?.up   ?? null,
    noAsk:      clobPrices?.down ?? null,
    marketSlug: clobPrices?.market || '',
  });
}

/**
 * Log a spike event for Kalshi (15-min markets).
 *
 * @param {string}  params.crypto          - 'BTC' | 'ETH' | 'SOL'
 * @param {string}  params.signalType      - 'UP' | 'DOWN'
 * @param {number}  params.spikePct        - same Binance candle move (%)
 * @param {number}  params.minuteInCycle   - Polymarket minute (for cross-reference)
 * @param {number}  params.minsRemaining   - minutes left in the Kalshi 15-min market
 * @param {number}  params.referencePrice  - Binance price at Polymarket cycle T+0 open
 * @param {number}  params.spikePrice      - Binance price at spike candle close
 * @param {object}  params.kalshiPrices    - priceCache entry: { yes, no, ticker }
 */
function recordKalshi({ crypto, signalType, spikePct, minuteInCycle,
                        minsRemaining, referencePrice, spikePrice, kalshiPrices }) {
  if (!kalshiPrices?.ticker) return; // Kalshi not configured or no active market
  _write(LOG_FILES.kalshi, {
    crypto, signalType, spikePct, minuteInCycle,
    minsRemaining:  minsRemaining ?? 0,
    referencePrice, spikePrice,
    yesAsk:     kalshiPrices?.yes    ?? null,
    noAsk:      kalshiPrices?.no     ?? null,
    marketSlug: kalshiPrices?.ticker || '',
  });
}

// Keep backward-compatible alias
const record = recordPolymarket;

module.exports = { record, recordPolymarket, recordKalshi };
