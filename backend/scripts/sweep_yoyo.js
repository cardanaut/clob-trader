#!/usr/bin/env node
'use strict';

/**
 * sweep_yoyo.js — Parameter sweep for yoyo filters + circuit breaker
 *
 * Phase 1: Run autoscan (simulate_combined.js -as -nf) to lock per-crypto trios.
 *          Skip with -sa.
 * Phase 2: Sweep exhaust5m × exhaust15m × corrFilter. Find best WR combo.
 *          Skip with -sy (uses saved simulator settings instead).
 * Phase 3: Sweep circuit breaker minutes using Phase 2 winner (or saved settings).
 *          49 values: 0, 5, 10 … 240 min. Runs in ~10s.
 *
 * Usage:
 *   node sweep_yoyo.js                            (full: autoscan + yoyo + CB)
 *   node sweep_yoyo.js -sa                        (skip autoscan)
 *   node sweep_yoyo.js -sa -sy                    (skip autoscan + yoyo, CB only)
 *   node sweep_yoyo.js -dry                       (preview grid sizes)
 *
 * Options:
 *   -sa / -skip-autoscan   Skip Phase 1, use existing autoscan_v2.json
 *   -sy / -skip-yoyo       Skip Phase 2, use saved simulator settings for Phase 3
 *   -e5min  <n>            Min exhaust5m  (default: 0.00)
 *   -e5max  <n>            Max exhaust5m  (default: 0.50)
 *   -e15min <n>            Min exhaust15m (default: 0.00)
 *   -e15max <n>            Max exhaust15m (default: 0.22)
 *   -step   <n>            Exhaust/corr step (default: 0.01)
 *   -cmin   <n>            Min corrFilter (default: 0)
 *   -cmax   <n>            Max corrFilter (default: 3)
 *   -cb-step <n>           CB sweep step in minutes (default: 5)
 *   -cb-max  <n>           CB sweep max in minutes  (default: 240)
 *   -j      <n>            Parallel workers (default: 6, max: 12)
 *   -top    <n>            Show top N results per phase (default: 3)
 *   -dry                   Preview grid sizes and time estimates, don't run
 */

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { execFile }  = require('child_process');
const { spawnSync } = require('child_process');

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg  = (n, d) => { const i = argv.indexOf(n); return (i !== -1 && argv[i+1] !== undefined) ? argv[i+1] : d; };
const flag = n => argv.includes(n);

const skipAutoscan = flag('-sa') || flag('-skip-autoscan');
const skipYoyo     = flag('-sy') || flag('-skip-yoyo');
const e5min        = parseFloat(arg('-e5min',   '0.00'));
const e5max        = parseFloat(arg('-e5max',   '0.50'));
const e15min       = parseFloat(arg('-e15min',  '0.00'));
const e15max       = parseFloat(arg('-e15max',  '0.22'));
const stepVal      = parseFloat(arg('-step',    '0.01'));
const cmin         = Math.min(4, Math.max(0, parseInt(arg('-cmin', '0'), 10)));
const cmax         = Math.min(4, Math.max(0, parseInt(arg('-cmax', '3'), 10)));
const cbStep       = Math.max(1, parseInt(arg('-cb-step', '5'),  10));
const cbMax        = Math.max(0, parseInt(arg('-cb-max',  '240'), 10));
const workers      = Math.min(12, Math.max(1, parseInt(arg('-j',   '6'), 10)));
const topN         = Math.max(1, Math.min(20, parseInt(arg('-top', '3'), 10)));
const dryRun       = flag('-dry');

// ── Paths ─────────────────────────────────────────────────────────────────────
const BACKEND_DIR   = path.resolve(__dirname, '..');
const SCRIPT        = path.join(__dirname, 'simulate_combined.js');
const AUTOSCAN_PATH = path.join(BACKEND_DIR, 'logs', 'autoscan_v2.json');
const SETTINGS_PATH = path.join(BACKEND_DIR, 'data', 'simulator_settings.json');

// ── Colors ────────────────────────────────────────────────────────────────────
const b  = s => `\x1b[1m${s}\x1b[0m`;
const g  = s => `\x1b[32m${s}\x1b[0m`;
const y  = s => `\x1b[33m${s}\x1b[0m`;
const rv = s => `\x1b[31m${s}\x1b[0m`;
const cy = s => `\x1b[36m${s}\x1b[0m`;
const d  = s => `\x1b[90m${s}\x1b[0m`;
const rp = (s, w) => String(s).padStart(w);
const lp = (s, w) => String(s).padEnd(w);

// ── Load simulator settings ───────────────────────────────────────────────────
let settings = {};
try { settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
catch { /* use defaults */ }

function buildBaseArgs() {
  const s = settings;
  const args = ['-nf'];
  if (s.bl     != null) args.push('-bl',     String(s.bl));
  if (s.rk     != null) args.push('-rk',     String(s.rk));
  if (s.mn     != null) args.push('-mn',     String(s.mn));
  if (s.mx     != null) args.push('-mx',     String(s.mx));
  if (s.slip   != null) args.push('-slip',   String(s.slip));
  if (s.body   != null) args.push('-body',   String(s.body));
  if (s.minwr  != null) args.push('-minwr',  String(s.minwr));
  if (s.minth  != null) args.push('-minth',  String(s.minth));
  if (s.maxpos != null) args.push('-maxpos', String(s.maxpos));
  if (s.t1tc)           args.push('-t1tc');
  else if (s.t1)        args.push('-t1');
  if (s.t1adj  != null) args.push('-t1adj',  String(s.t1adj));
  if (s.t2)             args.push('-t2');
  if (s.t2adj  != null && s.t2adj > 0) args.push('-t2adj', String(s.t2adj));
  if (s.df)             args.push('-df', String(s.df));
  if (s.dt)             args.push('-dt', String(s.dt));
  if (s.cr)             args.push('-cr', String(s.cr));
  return args;
}

// ── Phase 1: autoscan ─────────────────────────────────────────────────────────
function runAutoscan() {
  console.log(b(cy('\n━━━━  Phase 1: Autoscan (finding best per-crypto trios)  ━━━━')));
  const args = ['--stack-size=65536', SCRIPT, '-as', ...buildBaseArgs()];
  console.log(d('  cmd: node simulate_combined.js -as ' + buildBaseArgs().join(' ')));
  console.log(d('  (30–90 seconds…)\n'));
  const r = spawnSync(process.execPath, args, {
    cwd: BACKEND_DIR, env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'], timeout: 180_000,
  });
  if (r.status !== 0) {
    console.error(rv('\n✗ Autoscan failed (exit code ' + (r.status ?? 'timeout') + ')'));
    process.exit(1);
  }
  console.log(g('\n  ✓ Autoscan complete'));
}

// ── Extract trios from autoscan_v2.json ───────────────────────────────────────
function loadTrios() {
  let data;
  try { data = JSON.parse(fs.readFileSync(AUTOSCAN_PATH, 'utf8')); }
  catch { console.error(rv('✗ Cannot read ' + AUTOSCAN_PATH)); process.exit(1); }
  const t5 = data.trio5m || {}, t15 = data.trio15m || {};
  const parts = [];
  for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
    if (t5[cr])  parts.push(`${cr}:${t5[cr].period}:${t5[cr].th}`);
    if (t15[cr]) parts.push(`${cr}:${t15[cr].period}:${t15[cr].th}`);
  }
  if (!parts.length) {
    console.error(rv('✗ No trios found in autoscan_v2.json (run without -sa first)'));
    process.exit(1);
  }
  return { triomap: parts.join(','), t5, t15 };
}

// ── Generic parallel worker pool ─────────────────────────────────────────────
// items:      array of combo objects
// buildArgs:  (item, jsonOutPath) => string[]  — returns full node argv for that item
// Returns:    array of { item, unified } | null  (same length as items)
function runPool(items, buildArgs) {
  return new Promise(resolve => {
    const results = new Array(items.length).fill(null);
    let nextIdx = 0, active = 0, done = 0;

    function startNext() {
      while (active < workers && nextIdx < items.length) {
        const i    = nextIdx++;
        const item = items[i];
        active++;
        const jsonOut = path.join(os.tmpdir(), `sweepyoyo_${process.pid}_${i}.json`);
        const args = buildArgs(item, jsonOut);

        execFile(process.execPath, args,
          { cwd: BACKEND_DIR, env: process.env, timeout: 60_000 },
          () => {
            try {
              if (fs.existsSync(jsonOut)) {
                const data = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
                const u = data.unified;
                if (u && u.total > 0) {
                  results[i] = {
                    item,
                    wins: u.wins, losses: u.losses, total: u.total,
                    winRate: u.winRate, pnl: u.pnl,
                    score: u.wins / (u.total + 3),
                  };
                }
                try { fs.unlinkSync(jsonOut); } catch {}
              }
            } catch {}
            active--;
            done++;
            const pct = (done / items.length * 100).toFixed(1);
            process.stdout.write(
              `\r  ${cy(String(done).padStart(5))} / ${items.length}  (${pct.padStart(5)}%)   active:${active}   `
            );
            if (done === items.length) { process.stdout.write('\n'); resolve(results); }
            else startNext();
          }
        );
      }
    }
    startNext();
  });
}

// ── Phase 2: yoyo filter grid ─────────────────────────────────────────────────
function buildYoyoGrid() {
  const grid = [];
  const r2 = v => Math.round(v * 100) / 100;
  for (let e5 = e5min; r2(e5) <= e5max + 0.001; e5 = r2(e5 + stepVal))
    for (let e15 = e15min; r2(e15) <= e15max + 0.001; e15 = r2(e15 + stepVal))
      for (let c = cmin; c <= cmax; c++)
        grid.push({ e5: r2(e5), e15: r2(e15), c });
  return grid;
}

function yoyoArgs(item, jsonOut, triomap) {
  const args = ['--stack-size=65536', SCRIPT, '-triomap', triomap, ...buildBaseArgs(), '-json-out', jsonOut];
  if (item.e5  > 0) args.push('-exhaust5m',  String(item.e5));
  if (item.e15 > 0) args.push('-exhaust15m', String(item.e15));
  if (item.c   > 0) args.push('-corr',       String(item.c));
  return args;
}

function printYoyoResults(results, label) {
  const valid = results.filter(Boolean)
    .sort((a, b2) => b2.score !== a.score ? b2.score - a.score : b2.winRate - a.winRate);
  if (!valid.length) { console.log(rv('  ✗ No valid results.')); return null; }

  const baseline = results.find(r => r && r.item.e5 === 0 && r.item.e15 === 0 && r.item.c === 0);
  const SEP = '─'.repeat(90);

  console.log(b(cy(`\n━━━━  ${label} — Top ${Math.min(topN, valid.length)} (pessimistic WR score)  ━━━━`)));
  if (baseline) {
    const bWR = (baseline.winRate * 100).toFixed(1);
    console.log(d(`\n  BASELINE (no filters)  score=${baseline.score.toFixed(4)}  WR=${bWR}%`
      + `  W:${baseline.wins} L:${baseline.losses} (${baseline.total} trades)  PnL:${fmtPnl(baseline.pnl)}`));
  }

  console.log('\n  ' + d(SEP));
  console.log('  ' + [lp('Rank',6), rp('exhaust5m',10), rp('exhaust15m',11), rp('corr',5),
    rp('Score',8), rp('WinRate',9), rp('W',5), rp('L',5), rp('Trades',7), rp('PnL',10)
  ].map(s => b(s)).join('  '));
  console.log('  ' + d(SEP));

  for (let i = 0; i < Math.min(topN, valid.length); i++) {
    const res = valid[i];
    const wrFn = res.winRate >= 0.95 ? g : res.winRate >= 0.90 ? y : rv;
    const rank = i === 0 ? b(g(' #1 ★')) : i === 1 ? y('  #2') : i === 2 ? d('  #3') : d('  #'+(i+1));
    const delta = baseline
      ? '  Δ ' + ((res.winRate - baseline.winRate) * 100 >= 0
          ? g('+' + ((res.winRate - baseline.winRate)*100).toFixed(1)+'pp')
          : rv(((res.winRate - baseline.winRate)*100).toFixed(1)+'pp'))
      : '';
    console.log('  ' + [
      lp(rank, 6),
      rp(res.item.e5.toFixed(2)+'%', 10), rp(res.item.e15.toFixed(2)+'%', 11),
      rp(String(res.item.c), 5), rp(res.score.toFixed(4), 8),
      wrFn(rp((res.winRate*100).toFixed(1)+'%', 9)),
      rp(res.wins,5), rp(res.losses,5), rp(res.total,7), rp(fmtPnl(res.pnl),10),
      delta,
    ].join('  '));
  }
  console.log('  ' + d(SEP));

  const best = valid[0];
  console.log(b(g('\n  ★  Best yoyo combo:')));
  console.log(`       exhaust5m  = ${b(y(best.item.e5.toFixed(2)+'%'))}`);
  console.log(`       exhaust15m = ${b(y(best.item.e15.toFixed(2)+'%'))}`);
  console.log(`       corrFilter = ${b(y(String(best.item.c)))}`);
  console.log(`       score=${best.score.toFixed(4)}  WR=${(best.winRate*100).toFixed(1)}%  ${best.wins}W/${best.losses}L`);
  return best.item;   // { e5, e15, c }
}

// ── Phase 3: circuit breaker grid ────────────────────────────────────────────
function buildCBGrid() {
  const grid = [];
  for (let cb = 0; cb <= cbMax; cb += cbStep) grid.push({ cb });
  return grid;
}

function cbArgs(item, jsonOut, triomap, bestYoyo) {
  const args = ['--stack-size=65536', SCRIPT, '-triomap', triomap, ...buildBaseArgs(), '-json-out', jsonOut];
  if (bestYoyo.e5  > 0) args.push('-exhaust5m',  String(bestYoyo.e5));
  if (bestYoyo.e15 > 0) args.push('-exhaust15m', String(bestYoyo.e15));
  if (bestYoyo.c   > 0) args.push('-corr',       String(bestYoyo.c));
  if (item.cb      > 0) args.push('-cb',          String(item.cb));
  return args;
}

function printCBResults(results, bestYoyo) {
  const valid = results.filter(Boolean)
    .sort((a, b2) => b2.score !== a.score ? b2.score - a.score : b2.winRate - a.winRate);
  if (!valid.length) { console.log(rv('  ✗ No valid results.')); return; }

  const baseline = results.find(r => r && r.item.cb === 0);
  const SEP = '─'.repeat(75);

  console.log(b(cy(`\n━━━━  Phase 3: Circuit Breaker Sweep — Top ${Math.min(topN, valid.length)} (pessimistic WR score)  ━━━━`)));
  console.log(d(`  (fixed: exhaust5m=${bestYoyo.e5}%  exhaust15m=${bestYoyo.e15}%  corrFilter=${bestYoyo.c})`));
  if (baseline) {
    const bWR = (baseline.winRate * 100).toFixed(1);
    console.log(d(`\n  BASELINE (CB=off)  score=${baseline.score.toFixed(4)}  WR=${bWR}%`
      + `  W:${baseline.wins} L:${baseline.losses} (${baseline.total} trades)  PnL:${fmtPnl(baseline.pnl)}`));
  }

  console.log('\n  ' + d(SEP));
  console.log('  ' + [lp('Rank',6), rp('CB (min)',9), rp('Score',8),
    rp('WinRate',9), rp('W',5), rp('L',5), rp('Trades',7), rp('PnL',10)
  ].map(s => b(s)).join('  '));
  console.log('  ' + d(SEP));

  for (let i = 0; i < Math.min(topN, valid.length); i++) {
    const res  = valid[i];
    const cbLbl = res.item.cb === 0 ? 'off' : res.item.cb + 'min';
    const wrFn  = res.winRate >= 0.95 ? g : res.winRate >= 0.90 ? y : rv;
    const rank  = i === 0 ? b(g(' #1 ★')) : i === 1 ? y('  #2') : i === 2 ? d('  #3') : d('  #'+(i+1));
    const delta = baseline
      ? '  Δ ' + ((res.winRate - baseline.winRate) * 100 >= 0
          ? g('+' + ((res.winRate - baseline.winRate)*100).toFixed(1)+'pp')
          : rv(((res.winRate - baseline.winRate)*100).toFixed(1)+'pp'))
      : '';
    console.log('  ' + [
      lp(rank, 6), rp(cbLbl, 9), rp(res.score.toFixed(4), 8),
      wrFn(rp((res.winRate*100).toFixed(1)+'%', 9)),
      rp(res.wins,5), rp(res.losses,5), rp(res.total,7), rp(fmtPnl(res.pnl),10),
      delta,
    ].join('  '));
  }
  console.log('  ' + d(SEP));

  const best = valid[0];
  console.log(b(g('\n  ★  Best circuit breaker:')));
  console.log(`       circuitBreakerMins = ${b(y(best.item.cb === 0 ? 'off (0)' : String(best.item.cb)))}`);
  console.log(`       score=${best.score.toFixed(4)}  WR=${(best.winRate*100).toFixed(1)}%  ${best.wins}W/${best.losses}L`);
  console.log('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPnl(v) {
  return (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toFixed(2);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(b(cy('\n╔════════════════════════════════════════════════════════════════╗')));
  console.log(b(cy('║   sweep_yoyo.js — Yoyo Filters + Circuit Breaker Sweep         ║')));
  console.log(b(cy('╚════════════════════════════════════════════════════════════════╝')));

  const yoyoGrid = buildYoyoGrid();
  const cbGrid   = buildCBGrid();
  const e5n  = Math.round((e5max  - e5min)  / stepVal) + 1;
  const e15n = Math.round((e15max - e15min) / stepVal) + 1;
  const cn   = cmax - cmin + 1;

  console.log(`\n  ${b('Phase 2 — Yoyo grid')}:`);
  console.log(`    exhaust5m  : ${e5min} → ${e5max}%   step=${stepVal}   (${e5n} values)`);
  console.log(`    exhaust15m : ${e15min} → ${e15max}%   step=${stepVal}   (${e15n} values)`);
  console.log(`    corrFilter : ${cmin} → ${cmax}            (${cn} values)`);
  console.log(`    ${b(cy(String(yoyoGrid.length)))} combinations  |  ${workers} workers`);
  console.log(`\n  ${b('Phase 3 — CB grid')}:`);
  console.log(`    circuitBreaker : 0 → ${cbMax} min   step=${cbStep} min   (${cbGrid.length} values)`);
  console.log(`    ${b(cy(String(cbGrid.length)))} combinations  |  ${workers} workers`);

  if (dryRun) {
    const estYoyo = skipYoyo ? 0 : Math.round(yoyoGrid.length / workers * 1.5);
    const estCB   = Math.round(cbGrid.length / workers * 1.5);
    console.log(y(`\n  Dry run.  Estimated: Phase 2 ~${estYoyo}s  +  Phase 3 ~${estCB}s`));
    console.log(d('  Remove -dry to run.\n'));
    return;
  }

  // ── Phase 1: autoscan ─────────────────────────────────────────────────────
  if (!skipAutoscan) {
    runAutoscan();
  } else {
    console.log(d('\n  Phase 1 skipped (-sa) — using existing autoscan_v2.json'));
  }

  // ── Extract trios ─────────────────────────────────────────────────────────
  const { triomap, t5, t15 } = loadTrios();
  console.log(b('\n━━━━  Trios locked  ━━━━'));
  for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
    const r5  = t5[cr];
    const r15 = t15[cr];
    const s5  = r5  ? y(lp(r5.period,  5) + ' th=' + r5.th  + '%') : d('  —  ');
    const s15 = r15 ? y(lp(r15.period, 5) + ' th=' + r15.th + '%') : d('  —  ');
    console.log(`  ${cy(lp(cr, 4))}   5m: ${s5}   15m: ${s15}`);
  }
  console.log(d('\n  triomap: ' + triomap));

  // ── Phase 2: yoyo sweep ───────────────────────────────────────────────────
  let bestYoyo;

  if (!skipYoyo) {
    const t0 = Date.now();
    console.log(b(cy('\n━━━━  Phase 2: Yoyo Filter Sweep  ━━━━\n')));
    const raw2 = await runPool(yoyoGrid, (item, jout) => yoyoArgs(item, jout, triomap));
    console.log(`  ${g('✓ Done')} in ${((Date.now()-t0)/1000).toFixed(1)}s`);
    bestYoyo = printYoyoResults(raw2, 'Phase 2 Yoyo Filters');
    if (!bestYoyo) { console.error(rv('Phase 2 produced no valid results.')); process.exit(1); }
  } else {
    // Use saved simulator settings as fixed yoyo values
    bestYoyo = {
      e5:  settings.exhaust5m  ?? 0,
      e15: settings.exhaust15m ?? 0,
      c:   settings.corr       ?? 0,
    };
    console.log(d(`\n  Phase 2 skipped (-sy) — using saved settings:`));
    console.log(`    exhaust5m=${y(String(bestYoyo.e5)+'%')}  exhaust15m=${y(String(bestYoyo.e15)+'%')}  corrFilter=${y(String(bestYoyo.c))}`);
  }

  // ── Phase 3: circuit breaker sweep ───────────────────────────────────────
  const t3 = Date.now();
  console.log(b(cy('\n━━━━  Phase 3: Circuit Breaker Sweep  ━━━━\n')));
  const raw3 = await runPool(cbGrid, (item, jout) => cbArgs(item, jout, triomap, bestYoyo));
  console.log(`  ${g('✓ Done')} in ${((Date.now()-t3)/1000).toFixed(1)}s`);
  printCBResults(raw3, bestYoyo);
}

main().catch(e => {
  console.error(rv('\n✗ Fatal: ' + e.message));
  console.error(e.stack);
  process.exit(1);
});
