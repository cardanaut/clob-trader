#!/usr/bin/env node
/**
 * explore_hour.js — Time-of-day win rate research
 *
 * Groups PM-resolved spike signals by UTC hour and shows WR per hour.
 * Also shows by 3-hour block (session approximations) and by 5m vs 15m.
 *
 * Usage:
 *   node backend/scripts/explore_hour.js [--only5m] [--only15m] [-v]
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const args    = process.argv.slice(2);
const hasFlag = k => args.includes(k);
const only5m  = hasFlag('--only5m');
const only15m = hasFlag('--only15m');
const verbose = hasFlag('-v') || hasFlag('--verbose');

const TH_5M  = { BTC: 0.24, ETH: 0.44, SOL: 0.22, XRP: 0.24 };
const TH_15M = { BTC: 0.29, ETH: 0.20, SOL: 0.20, XRP: 0.22 };

const PERIODS_5M  = [50, 55, 60, 65, 70, 75, 80, 85];
const PERIODS_15M = [150, 165, 180, 195, 210, 225, 240, 255];

const LOG_DIR   = path.join(__dirname, '..', 'logs');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

const pmRaw = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'pm_outcomes.json'), 'utf8'));
function pmOutcome(crypto, cycleStartMs, dur) {
  return pmRaw[`${crypto}_${Math.round(cycleStartMs / 1000)}_${dur}`] ?? null;
}

function hasStrongBody(row) {
  const h = row.high - row.low;
  if (!(h > 0)) return true;
  return (Math.abs(row.open - row.close) * 100 / h) >= 77;
}

// ── Load all signals ──────────────────────────────────────────────────────────
const periods = [
  ...(only15m ? [] : PERIODS_5M),
  ...(only5m  ? [] : PERIODS_15M),
];

const signals = [];
let noPm = 0;

for (const period of periods) {
  const file = path.join(LOG_DIR, `t1000_candles_C${period}.csv`);
  if (!fs.existsSync(file)) continue;
  const is15m = period >= 150;
  const dur   = is15m ? 900 : 300;
  const thMap = is15m ? TH_15M : TH_5M;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);

  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 9) continue;
    const [ts, crypto, cs, csz, open, high, low, close, spike] = p;
    const absSpike = Math.abs(parseFloat(spike));
    const th = thMap[crypto] ?? 0.20;
    if (absSpike < th) continue;

    const row = {
      open: parseFloat(open), high: parseFloat(high),
      low:  parseFloat(low),  close: parseFloat(close),
    };
    if (!hasStrongBody(row)) continue;

    const outcome = pmOutcome(crypto, new Date(cs).getTime(), dur);
    if (!outcome) { noPm++; continue; }

    const direction = parseFloat(spike) >= 0 ? 'UP' : 'DOWN';
    const win = (direction === outcome);
    const hour = new Date(cs).getUTCHours();

    signals.push({ win, hour, is15m, crypto, absSpike });
  }
}

const total  = signals.length;
const totalW = signals.filter(s => s.win).length;
const baseWR = totalW / total * 100;

// ── Per-hour table ────────────────────────────────────────────────────────────
const SESSION = h => {
  if (h >= 0  && h < 3)  return 'Asia early   (00-03)';
  if (h >= 3  && h < 7)  return 'Asia late    (03-07)';
  if (h >= 7  && h < 10) return 'London open  (07-10)';
  if (h >= 10 && h < 13) return 'London mid   (10-13)';
  if (h >= 13 && h < 16) return 'US open      (13-16)';
  if (h >= 16 && h < 20) return 'US session   (16-20)';
  if (h >= 20 && h < 24) return 'US close     (20-24)';
};

console.log(`\nTime-of-Day Win Rate Research`);
console.log(`Base WR (all hours, body≥77%): ${baseWR.toFixed(2)}% over ${total} signals`);
console.log('─'.repeat(72));
console.log(
  'Hour (UTC)'.padEnd(13) +
  'Session'.padEnd(23) +
  'Trades'.padEnd(8) +
  'W'.padEnd(5) +
  'L'.padEnd(5) +
  'WR'.padEnd(9) +
  'Δ base'
);
console.log('─'.repeat(72));

const hourStats = Array.from({length: 24}, () => ({ w: 0, l: 0 }));
for (const s of signals) {
  if (s.win) hourStats[s.hour].w++; else hourStats[s.hour].l++;
}

for (let h = 0; h < 24; h++) {
  const { w, l } = hourStats[h];
  const t = w + l;
  if (t === 0) continue;
  const wr    = w / t * 100;
  const delta = wr - baseWR;
  const dStr  = (delta >= 0 ? '+' : '') + delta.toFixed(2) + '%';
  const flag  = Math.abs(delta) >= 3 ? (delta > 0 ? ' ✓' : ' ✗') : '';
  console.log(
    (`${String(h).padStart(2,'0')}:00`.padEnd(13)) +
    SESSION(h).padEnd(23) +
    String(t).padEnd(8) +
    String(w).padEnd(5) +
    String(l).padEnd(5) +
    (wr.toFixed(1) + '%').padEnd(9) +
    dStr + flag
  );
}

// ── Session block summary ─────────────────────────────────────────────────────
console.log('\n── By session block ────────────────────────────────────────────────────');
console.log('Session'.padEnd(25) + 'Trades'.padEnd(8) + 'W'.padEnd(5) + 'L'.padEnd(5) + 'WR'.padEnd(9) + 'Δ base');
console.log('─'.repeat(60));
const sessions = [
  ['Asia early   (00-03)', [0,1,2]],
  ['Asia late    (03-07)', [3,4,5,6]],
  ['London open  (07-10)', [7,8,9]],
  ['London mid   (10-13)', [10,11,12]],
  ['US open      (13-16)', [13,14,15]],
  ['US session   (16-20)', [16,17,18,19]],
  ['US close     (20-24)', [20,21,22,23]],
];
for (const [label, hours] of sessions) {
  const w = hours.reduce((s,h) => s + hourStats[h].w, 0);
  const l = hours.reduce((s,h) => s + hourStats[h].l, 0);
  const t = w + l;
  if (t === 0) continue;
  const wr    = w / t * 100;
  const delta = wr - baseWR;
  const dStr  = (delta >= 0 ? '+' : '') + delta.toFixed(2) + '%';
  const flag  = Math.abs(delta) >= 3 ? (delta > 0 ? ' ✓' : ' ✗') : '';
  console.log(label.padEnd(25) + String(t).padEnd(8) + String(w).padEnd(5) + String(l).padEnd(5) + (wr.toFixed(1)+'%').padEnd(9) + dStr + flag);
}

// ── 5m vs 15m by hour ────────────────────────────────────────────────────────
console.log('\n── By timeframe — hours with ≥10 trades ───────────────────────────────');
console.log('Hour'.padEnd(7) + '5m WR'.padEnd(12) + '5m trades'.padEnd(12) + '15m WR'.padEnd(12) + '15m trades');
console.log('─'.repeat(55));
for (let h = 0; h < 24; h++) {
  const s5  = signals.filter(s => !s.is15m && s.hour === h);
  const s15 = signals.filter(s =>  s.is15m && s.hour === h);
  if (s5.length + s15.length < 10) continue;
  const wr5  = s5.length  ? (s5.filter(s=>s.win).length  / s5.length  * 100).toFixed(1) + '%' : '—';
  const wr15 = s15.length ? (s15.filter(s=>s.win).length / s15.length * 100).toFixed(1) + '%' : '—';
  console.log(
    (`${String(h).padStart(2,'0')}:00`).padEnd(7) +
    wr5.padEnd(12) + String(s5.length).padEnd(12) +
    wr15.padEnd(12) + String(s15.length)
  );
}

// ── Best/worst hours summary ──────────────────────────────────────────────────
console.log('\n── Best hours (WR ≥ base+3%, ≥5 trades) ───────────────────────────────');
for (let h = 0; h < 24; h++) {
  const { w, l } = hourStats[h];
  const t = w + l;
  if (t < 5) continue;
  const wr = w / t * 100;
  if (wr - baseWR >= 3) console.log(`  ${String(h).padStart(2,'0')}:00  WR=${wr.toFixed(1)}%  (+${(wr-baseWR).toFixed(1)}%)  ${t} trades`);
}

console.log('\n── Worst hours (WR ≤ base-3%, ≥5 trades) ──────────────────────────────');
for (let h = 0; h < 24; h++) {
  const { w, l } = hourStats[h];
  const t = w + l;
  if (t < 5) continue;
  const wr = w / t * 100;
  if (wr - baseWR <= -3) console.log(`  ${String(h).padStart(2,'0')}:00  WR=${wr.toFixed(1)}%  (${(wr-baseWR).toFixed(1)}%)  ${t} trades`);
}

console.log(`\nSignals excluded (no PM outcome): ${noPm}`);
