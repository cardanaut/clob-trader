'use strict';
/**
 * sweep_params.js — two-phase parameter sweep for simulate_combined.js
 *
 * Phase 1: Run autoscan once (-as -nf) → discover best per-crypto trios.
 * Phase 2: Sweep (risk%, slippage, body, t1adj) with fixed triomap (~1s/combo).
 *
 * Usage:
 *   node backend/scripts/sweep_params.js [options]
 *
 * Options:
 *   --balance  N               Starting balance (default: 334.3)
 *   --concurrency N            Parallel workers (default: 6)
 *   --top N                    Top N in console (default: 4)
 *   --html-top N               Top N in HTML report (default: 50)
 *   --dry-run                  Preview combos + ETA, skip Phase 2
 *   --triomap <str>            Skip Phase 1, use this fixed triomap
 *
 *   --rk-min/max/step          Risk % range   (default: 4 / 35 / 3)
 *   --slip-min/max/step        Slippage ¢     (default: 3 / 7 / 2)
 *   --body-min/max/step        Body filter %  (default: 66 / 86 / 1)
 *   --t1adj-min/max/step       T+1 adj ¢      (default: 2 / 10 / 2)
 *
 *   --out <path>               JSON output   (default: backend/logs/sweep_results.json)
 *   --html <path>              HTML report   (default: backend/logs/sweep_results.html)
 */

const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── Args ──────────────────────────────────────────────────────────────────────
function argVal(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}
function argInt(n, d)   { return parseInt(argVal(n, d), 10); }
function argFloat(n, d) { return parseFloat(argVal(n, d)); }
function argFlag(n)     { return process.argv.includes(n); }

const START_BAL     = argFloat('--balance',     334.3);
const CONCURRENCY   = argInt('--concurrency',   6);
const TOP_N         = argInt('--top',           4);
const HTML_TOP      = argInt('--html-top',      50);
const DRY_RUN       = argFlag('--dry-run');
const TRIOMAP_FIXED = argVal('--triomap',       null);

const RK_MIN    = argInt('--rk-min',    4);   const RK_MAX    = argInt('--rk-max',    35);  const RK_STEP    = argInt('--rk-step',    3);
const SLIP_MIN  = argInt('--slip-min',  3);   const SLIP_MAX  = argInt('--slip-max',  7);   const SLIP_STEP  = argInt('--slip-step',  2);
const BODY_MIN  = argInt('--body-min',  66);  const BODY_MAX  = argInt('--body-max',  86);  const BODY_STEP  = argInt('--body-step',  1);
const T1_MIN    = argInt('--t1adj-min', 2);   const T1_MAX    = argInt('--t1adj-max', 10);  const T1_STEP    = argInt('--t1adj-step', 2);

const OUT_PATH  = argVal('--out',  path.join(__dirname, '../logs/sweep_results.json'));
const HTML_PATH = argVal('--html', path.join(__dirname, '../logs/sweep_results.html'));
const SCRIPT    = path.join(__dirname, 'simulate_combined.js');

// ── Ranges + combo list ───────────────────────────────────────────────────────
function range(from, to, step) {
  const out = [];
  for (let v = from; v <= to; v = Math.round((v + step) * 1e6) / 1e6) out.push(v);
  return out;
}
const RK_RANGE   = range(RK_MIN,   RK_MAX,   RK_STEP);
const SLIP_RANGE = range(SLIP_MIN, SLIP_MAX, SLIP_STEP);
const BODY_RANGE = range(BODY_MIN, BODY_MAX, BODY_STEP);
const T1_RANGE   = range(T1_MIN,   T1_MAX,   T1_STEP);

const combos = [];
for (const rk    of RK_RANGE)
for (const slip  of SLIP_RANGE)
for (const body  of BODY_RANGE)
for (const t1adj of T1_RANGE)
  combos.push({ rk, slip, body, t1adj });
const TOTAL = combos.length;

// ── Initial header ────────────────────────────────────────────────────────────
const initEtaSec = Math.round(TOTAL / CONCURRENCY * 1.5 + 60);
const initEtaMin = Math.floor(initEtaSec / 60);
console.log('\n' + '═'.repeat(72));
console.log('  sweep_params.js — two-phase parameter grid sweep');
console.log('═'.repeat(72));
console.log(`  Combos   : ${TOTAL.toLocaleString()}  (${RK_RANGE.length}rk × ${SLIP_RANGE.length}slip × ${BODY_RANGE.length}body × ${T1_RANGE.length}t1adj)`);
console.log(`  Workers  : ${CONCURRENCY}  Balance: $${START_BAL}`);
console.log(`  ETA      : ~${initEtaMin}m  (Phase1 ~1m + Phase2 ~${Math.ceil(TOTAL/CONCURRENCY*1.5)}s)`);
console.log(`  Ranges   : rk ${RK_MIN}–${RK_MAX} step${RK_STEP}  slip ${SLIP_MIN}–${SLIP_MAX} step${SLIP_STEP}  body ${BODY_MIN}–${BODY_MAX} step${BODY_STEP}  t1adj ${T1_MIN}–${T1_MAX} step${T1_STEP}`);
console.log('═'.repeat(72) + '\n');
if (TRIOMAP_FIXED) console.log(`  Fixed triomap:\n  ${TRIOMAP_FIXED}\n`);

// ── Projection (same caps as simulate_combined.js defaults) ──────────────────
const CAPS_5M  = { BTC: 1000, ETH: 500, SOL: 150, XRP: 150 };
const CAPS_15M = { BTC: 1000, ETH: 500, SOL: 500, XRP: 500 };
function projLoopSim(trades, startBal, riskFrac, days, durDays) {
  if (!trades?.length || durDays <= 0 || startBal <= 0) return null;
  const n = trades.length, steps = Math.round(n * days / durDays);
  if (steps <= 0) return startBal;
  let bal = startBal;
  for (let i = 0; i < steps; i++) {
    if (bal <= 0) break;
    const t = trades[i % n];
    if (!t.pos || t.pos <= 0) continue;
    const cap = ((t.period >= 150) ? CAPS_15M : CAPS_5M)[t.crypto] ?? 500;
    bal += Math.min(bal * riskFrac, cap) * (t.pnl / t.pos);
  }
  return parseFloat(bal.toFixed(2));
}

// ── Dashboard (ANSI in-place update) ─────────────────────────────────────────
const DASH_LINES = 4 + CONCURRENCY + TOP_N; // lines written each refresh
let dashDrawn = false;
let dashBuffer = [];

function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0
    ? `${h}h${String(m).padStart(2,'0')}m`
    : `${String(m).padStart(2,'0')}m${String(s).padStart(2,'0')}s`;
}
function fmtElapsed(ms) { return fmtTime(Math.floor(ms / 1000)); }
function pad(s, n) { return String(s).padEnd(n).slice(0, n); }

function renderDashboard(done, failed, results, activeWorkers, startTime, topLive) {
  const now     = Date.now();
  const elapsed = now - startTime;
  const rate    = done / Math.max(elapsed / 1000, 0.001);
  const etaSec  = rate > 0 ? Math.round((TOTAL - done) / rate) : 0;
  const pct     = TOTAL > 0 ? (done / TOTAL * 100) : 0;
  const fill    = Math.floor(pct / 100 * 36);
  const bar     = '█'.repeat(fill) + '░'.repeat(36 - fill);

  const lines = [];
  lines.push(`  ┌${'─'.repeat(70)}┐`);
  lines.push(`  │ Progress  [${bar}] ${done}/${TOTAL} (${pct.toFixed(1)}%)${' '.repeat(4)}│`);
  lines.push(`  │ Elapsed ${fmtElapsed(elapsed)}  Rate ${rate.toFixed(1)}/s  ETA ${fmtTime(etaSec)}  ok:${results.length} fail:${failed}${' '.repeat(5)}│`);
  lines.push(`  │ Workers:${' '.repeat(61)}│`);

  for (let w = 0; w < CONCURRENCY; w++) {
    const c = activeWorkers[w];
    const s = c
      ? `  rk=${String(c.rk).padStart(2)}%  slip=${c.slip}¢  body=${c.body}%  t1adj=${c.t1adj}¢`
      : '  idle';
    lines.push(`  │   W${w + 1} ${pad(s, 62)}│`);
  }

  lines.push(`  │ Live top-${TOP_N} (30d profit):${' '.repeat(42)}│`);
  for (let i = 0; i < TOP_N; i++) {
    const r = topLive[i];
    if (!r) {
      lines.push(`  │   #${i + 1} —${' '.repeat(64)}│`);
      continue;
    }
    const p30 = r.proj30dProfit >= 0 ? `+$${Math.round(r.proj30dProfit)}` : `-$${Math.round(-r.proj30dProfit)}`;
    const wr  = r.winRate != null ? (r.winRate * 100).toFixed(1) + '%' : '—';
    const s   = `  #${i+1}  rk=${r.rk}%  slip=${r.slip}¢  body=${r.body}%  t1adj=${r.t1adj}¢  → ${p30}  WR=${wr}  ${r.wins}W/${r.losses}L`;
    lines.push(`  │ ${pad(s, 69)}│`);
  }
  lines.push(`  └${'─'.repeat(70)}┘`);

  if (dashDrawn) {
    // Move cursor up to overwrite previous dashboard
    process.stdout.write(`\x1B[${dashBuffer.length}A`);
  }
  dashBuffer = lines;
  dashDrawn  = true;
  process.stdout.write(lines.map(l => `\x1B[2K${l}`).join('\n') + '\n');
}

// ── Phase 1 ───────────────────────────────────────────────────────────────────
function runPhase1() {
  return new Promise((resolve, reject) => {
    const tmpOut = path.join(os.tmpdir(), `sweep_p1_${process.pid}.json`);
    console.log('  Phase 1: running autoscan…');
    const t0 = Date.now();
    execFile(process.execPath, [SCRIPT, '-as', '-nf', '-bl', String(START_BAL), '-json-out', tmpOut], {
      cwd: path.join(__dirname, '../..'), env: process.env, timeout: 300_000,
    }, () => {
      let result = null;
      try { result = JSON.parse(fs.readFileSync(tmpOut, 'utf8')); } catch {}
      try { fs.unlinkSync(tmpOut); } catch {}
      if (!result?.triomap) return reject(new Error('Phase 1 failed or produced no triomap'));
      const s = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  Phase 1 done in ${s}s  →  ${result.triomap}`);
      for (const [lbl, sec] of [['5m', result.autoscan5m], ['15m', result.autoscan15m]]) {
        if (!sec?.trios) continue;
        const e = Object.entries(sec.trios).filter(([,r]) => r)
          .map(([c,r]) => `${c}=C${r.period}@${r.th?.toFixed(2)}%`).join('  ');
        if (e) console.log(`  Trios ${lbl}: ${e}`);
      }
      console.log('');
      resolve(result.triomap);
    });
  });
}

// ── Phase 2: one combo ────────────────────────────────────────────────────────
function runCombo(combo, triomap) {
  return new Promise((resolve) => {
    const tmpOut = path.join(os.tmpdir(), `sweep_p2_${process.pid}_${Math.random().toString(36).slice(2)}.json`);
    execFile(process.execPath, [
      SCRIPT, '-nf',
      '-bl', String(START_BAL), '-rk', String(combo.rk),
      '-slip', String(combo.slip), '-body', String(combo.body),
      '-t1', '-t1adj', String(combo.t1adj),
      '-triomap', triomap, '-json-out', tmpOut,
    ], { cwd: path.join(__dirname, '../..'), env: process.env, timeout: 60_000 }, () => {
      let result = null;
      try { result = JSON.parse(fs.readFileSync(tmpOut, 'utf8')); } catch {}
      try { fs.unlinkSync(tmpOut); } catch {}
      const u = result?.unified;
      if (!u?.trades || u.total < 3) return resolve(null);
      const rf    = combo.rk / 100;
      const p7    = projLoopSim(u.trades, START_BAL, rf,  7, u.durDays);
      const p30   = projLoopSim(u.trades, START_BAL, rf, 30, u.durDays);
      resolve({
        rk: combo.rk, slip: combo.slip, body: combo.body, t1adj: combo.t1adj,
        wins: u.wins, losses: u.losses, total: u.total, winRate: u.winRate,
        pnl: u.pnl, durDays: u.durDays,
        proj7d: p7,   proj7dProfit:  p7  != null ? parseFloat((p7  - START_BAL).toFixed(2)) : null,
        proj30d: p30, proj30dProfit: p30 != null ? parseFloat((p30 - START_BAL).toFixed(2)) : null,
      });
    });
  });
}

// ── Phase 2: worker pool ──────────────────────────────────────────────────────
async function runPhase2(triomap) {
  if (DRY_RUN) { console.log('  Dry run — Phase 2 skipped.\n'); return []; }

  const results      = [];
  const topLive      = [];
  const activeWorkers = new Array(CONCURRENCY).fill(null);
  let   idx = 0, done = 0, failed = 0;
  const startTime = Date.now();

  function updateTop(r) {
    topLive.push(r);
    topLive.sort((a, b) => (b.proj30dProfit ?? -Infinity) - (a.proj30dProfit ?? -Infinity));
    if (topLive.length > TOP_N) topLive.length = TOP_N;
  }

  console.log(`  Phase 2: ${TOTAL} combos × ${CONCURRENCY} workers\n`);

  // Initial draw
  renderDashboard(0, 0, results, activeWorkers, startTime, topLive);

  async function worker(wid) {
    while (idx < combos.length) {
      const combo = combos[idx++];
      activeWorkers[wid] = combo;
      const r = await runCombo(combo, triomap);
      done++;
      activeWorkers[wid] = null;
      if (r) { results.push(r); updateTop(r); }
      else   { failed++; }
      renderDashboard(done, failed, results, activeWorkers, startTime, topLive);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  // Final redraw with all idle
  renderDashboard(done, failed, results, activeWorkers, startTime, topLive);
  process.stdout.write('\n');
  return results;
}

// ── HTML report ───────────────────────────────────────────────────────────────
function generateHTML(results, triomap, startBal) {
  const top50 = results.slice(0, HTML_TOP);
  const ts    = new Date().toLocaleString();

  const rows = top50.map((r, i) => {
    const wr      = r.winRate != null ? (r.winRate * 100).toFixed(1) + '%' : '—';
    const p30clr  = r.proj30dProfit >= 0 ? '#68d391' : '#fc8181';
    const p30str  = r.proj30dProfit != null
      ? (r.proj30dProfit >= 0 ? '+' : '') + '$' + Math.round(r.proj30dProfit).toLocaleString()
      : '—';
    const p7str   = r.proj7dProfit != null
      ? (r.proj7dProfit >= 0 ? '+' : '') + '$' + Math.round(r.proj7dProfit).toLocaleString()
      : '—';
    const pnlClr  = r.pnl >= 0 ? '#68d391' : '#fc8181';
    const pnlStr  = (r.pnl >= 0 ? '+' : '') + '$' + r.pnl.toFixed(2);
    const rowBg   = i % 2 === 1 ? 'background:#232d3e' : '';
    return `<tr style="${rowBg}">
      <td style="color:#a0aec0;font-weight:700">#${i + 1}</td>
      <td><b>${r.rk}%</b></td>
      <td>${r.slip}¢</td>
      <td>${r.body}%</td>
      <td>${r.t1adj}¢</td>
      <td>${r.wins}W / ${r.losses}L</td>
      <td style="color:${r.winRate >= 0.9 ? '#68d391' : r.winRate >= 0.8 ? '#63b3ed' : '#fc8181'}">${wr}</td>
      <td style="color:${pnlClr}">${pnlStr}</td>
      <td>${r.durDays?.toFixed(1)}d</td>
      <td style="color:#63b3ed">${p7str}</td>
      <td style="color:${p30clr};font-weight:700;font-size:15px">${p30str}</td>
      <td style="color:${p30clr}">${r.proj30d != null ? '$' + Math.round(r.proj30d).toLocaleString() : '—'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sweep Results — Top ${HTML_TOP} — ${ts}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #1a202c; color: #e2e8f0; font-family: monospace; font-size: 13px; padding: 24px; }
h1 { font-size: 18px; color: #e2e8f0; margin-bottom: 6px; }
.meta { font-size: 12px; color: #4a5568; margin-bottom: 20px; line-height: 1.7; }
.meta b { color: #a0aec0; }
.triomap { background: #2d3748; border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #63b3ed; margin-bottom: 20px; word-break: break-all; }
.triomap .label { color: #718096; font-size: 11px; margin-bottom: 4px; }
table { border-collapse: collapse; width: 100%; }
th { background: #2d3748; color: #a0aec0; padding: 8px 12px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; position: sticky; top: 0; border-bottom: 1px solid #4a5568; }
td { padding: 6px 12px; border-bottom: 1px solid #1a202c; vertical-align: middle; }
tr:hover td { background: #2d374860 !important; }
.section { color: #718096; font-size: 11px; margin-bottom: 6px; }
</style>
</head>
<body>
<h1>&#x1F50E; Sweep Results — Top ${HTML_TOP}</h1>
<div class="meta">
  <b>Exported:</b> ${ts}<br>
  <b>Balance:</b> $${startBal}  &nbsp; <b>Total combos:</b> ${results.length.toLocaleString()} valid / ${TOTAL.toLocaleString()} run<br>
  <b>Ranges:</b> risk ${RK_MIN}–${RK_MAX} step${RK_STEP} &nbsp; slip ${SLIP_MIN}–${SLIP_MAX} step${SLIP_STEP} &nbsp; body ${BODY_MIN}–${BODY_MAX} step${BODY_STEP} &nbsp; t1adj ${T1_MIN}–${T1_MAX} step${T1_STEP}
</div>
<div class="triomap"><div class="label">Triomap (fixed for all combos)</div>${triomap}</div>
<div class="section">Ranked by 30-day loop-replay projected profit</div>
<div style="overflow-x:auto">
<table>
  <thead><tr>
    <th>Rank</th><th>Risk%</th><th>Slip</th><th>Body</th><th>T+1adj</th>
    <th>W/L</th><th>WR</th><th>Backtest PnL</th><th>Duration</th>
    <th>→ 7d profit</th><th>→ 30d profit</th><th>30d final</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
</body>
</html>`;
}

// ── Formatting ────────────────────────────────────────────────────────────────
function fmtMoney(v, d = 2) {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  // Phase 1
  let triomap = TRIOMAP_FIXED;
  if (!triomap) {
    try { triomap = await runPhase1(); }
    catch (e) { console.error('Phase 1 failed:', e.message); process.exit(1); }
  }

  // Phase 2
  const allResults = await runPhase2(triomap);

  if (!allResults.length) {
    console.log('No valid results.\n');
    process.exit(DRY_RUN ? 0 : 1);
  }

  allResults.sort((a, b) => (b.proj30dProfit ?? -Infinity) - (a.proj30dProfit ?? -Infinity));
  const top = allResults.slice(0, TOP_N);

  // ── Console summary ───────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72));
  console.log(`  TOP ${TOP_N} — 30-Day Projected Profit  (${allResults.length}/${TOTAL} valid)`);
  console.log(`  Triomap: ${triomap}`);
  console.log('═'.repeat(72));
  top.forEach((r, i) => {
    const wr = r.winRate != null ? (r.winRate * 100).toFixed(1) + '%' : '—';
    console.log(`\n  ┌─ #${i + 1} ${'─'.repeat(66)}`);
    console.log(`  │  Params  : risk=${r.rk}%  slip=${r.slip}¢  body=${r.body}%  t1adj=${r.t1adj}¢`);
    console.log(`  │  Trades  : ${r.wins}W / ${r.losses}L  WR=${wr}  dur=${r.durDays?.toFixed(1)}d`);
    console.log(`  │  Backtest: ${fmtMoney(r.pnl)}  avg/trade=$${r.total > 0 ? (r.pnl/r.total).toFixed(2) : '—'}`);
    console.log(`  │  → 7d    : ${fmtMoney(r.proj7dProfit, 0)}`);
    console.log(`  │  → 30d   : ${fmtMoney(r.proj30dProfit, 0)}  (final $${r.proj30d?.toFixed(0)})`);
    console.log('  └' + '─'.repeat(68));
  });

  // ── Save JSON ─────────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    sweepAt: new Date().toISOString(), startBal: START_BAL, triomap,
    totalCombos: TOTAL, validRuns: allResults.length,
    ranges: {
      rk:    { min: RK_MIN,   max: RK_MAX,   step: RK_STEP   },
      slip:  { min: SLIP_MIN, max: SLIP_MAX, step: SLIP_STEP },
      body:  { min: BODY_MIN, max: BODY_MAX, step: BODY_STEP },
      t1adj: { min: T1_MIN,   max: T1_MAX,   step: T1_STEP   },
    },
    top, all: allResults,
  }, null, 2));
  console.log(`\n  JSON → ${OUT_PATH}`);

  // ── Save HTML ─────────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(HTML_PATH), { recursive: true });
  fs.writeFileSync(HTML_PATH, generateHTML(allResults, triomap, START_BAL));
  console.log(`  HTML → ${HTML_PATH}`);
  console.log(`         (top ${Math.min(HTML_TOP, allResults.length)} of ${allResults.length} results)\n`);
})();
