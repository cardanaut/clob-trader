<?php
$page  = 'simulator-v2';
$title = 'Simulator V2+';
require_once __DIR__ . '/../includes/header.php';
?>
<style>
/* ── Simulator V2+ Page ─────────────────────────────────────────────────────── */
.sim-page { max-width: 1280px; margin: 0 auto; }
.sim-page h1 { font-size: 22px; font-weight: 700; color: #e2e8f0; margin: 0 0 4px; }
.sim-page .sub { color: #718096; font-size: 13px; margin: 0 0 20px; }

/* ── Two-column layout ──────────────────────────────────────────────────────── */
.sim-layout { display: grid; grid-template-columns: 448px 1fr; gap: 20px; align-items: start; }
@media (max-width: 900px) { .sim-layout { grid-template-columns: 1fr; } }

/* ── Config panel ───────────────────────────────────────────────────────────── */
.config-panel { background: #1e2532; border: 1px solid #2d3748; border-radius: 10px; padding: 16px; position: sticky; top: 70px; max-height: calc(100vh - 90px); overflow-y: auto; scrollbar-width: thin; scrollbar-color: #4a5568 transparent; }
.config-panel::-webkit-scrollbar { width: 4px; }
.config-panel::-webkit-scrollbar-track { background: transparent; }
.config-panel::-webkit-scrollbar-thumb { background: #4a5568; border-radius: 4px; }
.config-panel::-webkit-scrollbar-thumb:hover { background: #63b3ed; }
.config-panel h2 { font-size: 13px; color: #a0aec0; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 12px; font-weight: 600; display: flex; align-items: center; justify-content: space-between; }
.config-group { margin-bottom: 14px; }
.config-group-label { font-size: 10px; color: #4a5568; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; font-weight: 700; }
.config-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.config-row label { font-size: 12px; color: #718096; min-width: 80px; }
.config-row input[type=number],
.config-row input[type=text] {
  background: #2d3748; border: 1px solid #4a5568; border-radius: 5px;
  color: #e2e8f0; padding: 4px 8px; font-size: 12px;
  font-family: monospace;
}
.config-row input[type=number]:focus,
.config-row input[type=text]:focus {
  outline: none; border-color: #63b3ed;
}
.config-row.full input { width: 100%; box-sizing: border-box; }
.toggle-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.toggle-row label { font-size: 12px; color: #718096; cursor: pointer; }
.toggle-row input[type=checkbox] { width: 14px; height: 14px; cursor: pointer; accent-color: #63b3ed; }
.config-sep { border: none; border-top: 1px solid #2d3748; margin: 10px 0; }
.param-en { width: 13px; height: 13px; cursor: pointer; accent-color: #63b3ed; flex-shrink: 0; }
.config-row.disabled label { color: #4a5568; }
.config-row.disabled input[type=number],
.config-row.disabled input[type=text] { opacity: 0.35; pointer-events: none; }

/* 2-column params grid */
.params-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 4px; margin-bottom: 4px; }
.params-2col .config-row { margin-bottom: 0; flex-wrap: nowrap; gap: 3px; }
.params-2col .config-row label { min-width: 0; font-size: 10.5px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.params-2col .config-row input[type=number] { width: 62px; min-width: 0; }

/* ── Buttons ────────────────────────────────────────────────────────────────── */
.btn-run {
  width: 100%; padding: 16px 10px; background: #276749; color: #fff;
  border: none; border-radius: 8px; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: background .15s; margin-top: 8px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.btn-run:hover { background: #2f855a; }
.btn-run:disabled { background: #2d3748; color: #718096; cursor: not-allowed; border: 1px solid #4a5568; }
.btn-use-vt { padding: 3px 8px; background: #2d3748; border: 1px solid #4a5568; border-radius: 5px;
  color: #63b3ed; font-size: 11px; cursor: pointer; white-space: nowrap; transition: background .12s; }
.btn-use-vt:hover { background: #374151; }
.btn-row-2 { display: flex; gap: 6px; margin-top: 6px; }
.btn-row-3 { display: flex; gap: 6px; margin-top: 6px; }
.btn-save { flex: 1; padding: 7px 6px; background: #553c9a; color: #fff;
  border: none; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;
  transition: background .12s; }
.btn-save:hover { background: #6b46c1; }
.btn-io { flex: 1; padding: 7px 6px; background: #2d3748; color: #a0aec0;
  border: 1px solid #4a5568; border-radius: 6px; font-size: 11px; font-weight: 600;
  cursor: pointer; transition: background .12s; }
.btn-io:hover { background: #374151; color: #e2e8f0; }
.btn-apply-live {
  flex: 1; padding: 7px 6px; background: #2b6cb0; color: #fff;
  border: none; border-radius: 6px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background .12s;
}
.btn-apply-live:hover { background: #3182ce; }
.btn-apply-live:disabled { background: #2d3748; color: #718096; cursor: not-allowed; }
.opt-badge {
  display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: .04em;
  color: #68d391; background: #1a2e22; border: 1px solid #276749;
  border-radius: 3px; padding: 1px 5px; margin-left: 5px; vertical-align: middle;
  white-space: nowrap; cursor: default;
}
/* ── Spinner ────────────────────────────────────────────────────────────────── */
.spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3);
  border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; display: none; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Results panel ──────────────────────────────────────────────────────────── */
.results-panel { display: flex; flex-direction: column; gap: 14px; }
.result-placeholder {
  background: #1e2532; border: 1px dashed #2d3748; border-radius: 10px;
  padding: 60px 20px; text-align: center; color: #4a5568; font-size: 14px;
}
.result-placeholder .icon { font-size: 32px; margin-bottom: 10px; }

/* ── Result cards ────────────────────────────────────────────────────────────── */
.result-card { background: #1e2532; border: 1px solid #2d3748; border-radius: 10px; padding: 16px; }
.result-card h3 { font-size: 12px; color: #a0aec0; text-transform: uppercase; letter-spacing: .06em;
  margin: 0 0 12px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
.result-card .badge { font-size: 10px; padding: 2px 7px; border-radius: 10px; background: #2d3748;
  color: #a0aec0; font-weight: 600; text-transform: none; }
.badge-stats { font-size: 14px; padding: 4px 12px; border-radius: 10px; background: #2d3748;
  color: #e2e8f0; font-weight: 600; }
.result-card .badge.green { background: #1a4731; color: #68d391; }
.result-card .badge.blue  { background: #1a3252; color: #63b3ed; }

/* Stats grid */
.stats-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.stat-box { background: #2d3748; border-radius: 6px; padding: 8px 14px; min-width: 90px; }
.stat-box .lbl { font-size: 10px; color: #718096; text-transform: uppercase; letter-spacing: .05em; }
.stat-box .val { font-size: 16px; font-weight: 700; margin-top: 2px; color: #e2e8f0; }
.stat-box .val.green { color: #68d391; }
.stat-box .val.red   { color: #fc8181; }
.stat-box .val.blue  { color: #63b3ed; }
.stat-box .val.yellow { color: #f6ad55; }

/* Tables */
.result-table { width: 100%; border-collapse: collapse; font-size: 13px; font-family: monospace; }
.result-table th { color: #a0aec0; padding: 6px 10px; text-align: left; font-weight: 600;
  border-bottom: 1px solid #2d3748; font-size: 12px; }
.result-table td { padding: 6px 10px; border-bottom: 1px solid #1a202c; vertical-align: middle; }
.result-table tr.alt td { background: #232d3e; }
.result-table tr:hover td { background: #2d374840; }
.result-table .win  { color: #68d391; }
.result-table .loss { color: #fc8181; }
.result-table .blue { color: #63b3ed; }
.result-table .gold { color: #f6ad55; }
.result-table .dim  { color: #a0aec0; }
.dir-up   { color: #63b3ed; font-weight: 700; }
.dir-down { color: #f6ad55; font-weight: 700; }
.result-table .bold { font-weight: 700; }
.result-table td:last-child, .result-table th:last-child { text-align: right; }
.proj-table tr.alt td { background: #232d3e; }

/* Proj table */
.proj-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.proj-table th { color: #a0aec0; padding: 6px 12px; text-align: right; font-weight: 600;
  border-bottom: 1px solid #2d3748; font-size: 11px; text-transform: uppercase; }
.proj-table th:first-child { text-align: left; }
.proj-table td { padding: 7px 12px; border-bottom: 1px solid #1a202c; text-align: right;
  font-family: monospace; font-size: 14px; }
.proj-table td:first-child { text-align: left; color: #a0aec0; font-size: 12px; font-family: sans-serif; }
.proj-table .sep td { border-top: 1px solid #2d3748; padding-top: 8px; }
.proj-table .total td { font-weight: 700; color: #e2e8f0; }
.proj-table tr.proj-sub td { opacity: .55; font-size: 12px; }
.proj-table tr.proj-sub td:first-child { padding-left: 20px; font-size: 11px; }
.proj-total-box { margin-top: 14px; border: 2px solid #68d391; border-radius: 10px;
  padding: 14px 16px; background: rgba(104,211,145,.04); }
.proj-total-hdr { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.proj-total-title { font-size: 12px; font-weight: 700; color: #68d391;
  text-transform: uppercase; letter-spacing: .08em; }
.proj-total-sub { font-size: 11px; color: #718096; }
.proj-chips { display: flex; gap: 8px; }
.proj-chip { flex: 1; background: #1a202c; border-radius: 8px; padding: 12px 8px; text-align: center; min-width: 0; }
.proj-chip-val { font-size: 18px; font-weight: 700; color: #68d391; font-family: monospace; line-height: 1.1; }
.proj-chip-lbl { font-size: 10px; color: #718096; text-transform: uppercase; letter-spacing: .05em; margin-top: 4px; }
.proj-chip-main { border: 1px solid rgba(246,173,85,.35); }
.proj-chip-main .proj-chip-val { font-size: 26px; }

/* Triomap box */
.triomap-box { background: #2d3748; border-radius: 6px; padding: 10px 12px;
  font-family: monospace; font-size: 12px; color: #63b3ed; word-break: break-all;
  cursor: pointer; position: relative; transition: background .12s; }
.triomap-box:hover { background: #374151; }
.triomap-copy-hint { font-size: 10px; color: #4a5568; margin-top: 4px; }
.copy-toast { position: fixed; bottom: 20px; right: 20px; background: #2d3748;
  color: #68d391; padding: 8px 16px; border-radius: 6px; font-size: 13px;
  opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 999; }
.copy-toast.show { opacity: 1; }

/* Params bar */
.params-bar { display: flex; flex-wrap: wrap; gap: 8px; font-size: 14px; color: #a0aec0; }
.params-bar .p { background: #2d3748; border-radius: 4px; padding: 4px 12px; }
.params-bar .p span { color: #e2e8f0; }

/* Balance strip */
.balance-strip { display: flex; align-items: center; gap: 12px; margin-top: 12px;
  background: #2d3748; border-radius: 8px; padding: 12px 16px; }
.balance-strip .bs-block { display: flex; flex-direction: column; gap: 2px; }
.balance-strip .bs-label { font-size: 10px; color: #718096; text-transform: uppercase; letter-spacing: .06em; }
.balance-strip .bs-val { font-size: 20px; font-weight: 700; }
.balance-strip .bs-line { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.balance-strip .bs-arrow { width: 100%; height: 2px; background: linear-gradient(to right, #4a5568, #63b3ed); border-radius: 2px; position: relative; }
.balance-strip .bs-arrow::after { content: '▶'; position: absolute; right: -6px; top: -7px; color: #63b3ed; font-size: 10px; }
.balance-strip .bs-gain { font-size: 12px; font-weight: 600; }

/* Error */
.error-card { background: #2d1515; border: 1px solid #fc818140; border-radius: 10px;
  padding: 16px; color: #fc8181; font-size: 13px; }

/* Horizontal stats row table */
.stats-row-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; font-family: monospace; }
.stats-row-table th { color: #718096; font-size: 11px; font-weight: 600; padding: 4px 12px; text-align: center; border-bottom: 1px solid #2d3748; text-transform: uppercase; letter-spacing: .05em; }
.stats-row-table td { padding: 8px 12px; text-align: center; font-size: 15px; background: #2d3748; }
.stats-row-table td:first-child { border-radius: 6px 0 0 6px; }
.stats-row-table td:last-child  { border-radius: 0 6px 6px 0; }

/* Period chips */
.badge-5m  { background: #1a3a2a; color: #68d391; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; white-space: nowrap; }
.badge-15m { background: #261a3a; color: #b794f4; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; white-space: nowrap; }

/* Crypto badge in trios */
.crypto-btc { color: #f6ad55; font-weight: 700; }
.crypto-eth { color: #63b3ed; font-weight: 700; }
.crypto-sol { color: #68d391; font-weight: 700; }
.crypto-xrp { color: #b794f4; font-weight: 700; }

/* V2+ badge */
.v2-badge { display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: .05em;
  color: #63b3ed; background: #1a2535; border: 1px solid #2b4f80;
  border-radius: 3px; padding: 1px 5px; margin-left: 4px; vertical-align: middle; }

/* Responsive */
@media (max-width: 900px) { .config-panel { position: static; max-height: none; } }
@media (max-width: 640px) {
  .sim-page h1  { font-size: 18px; }
  .config-row label { min-width: 64px; font-size: 11px; }
  .config-row input[type=number], .config-row input[type=text] { width: 76px; font-size: 11px; }
  .balance-strip { flex-direction: column; gap: 4px; padding: 10px 12px; }
  .params-bar .p { padding: 3px 8px; font-size: 12px; }
  .stats-row-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .stats-row-table { min-width: 420px; }
  .result-table { font-size: 11px; }
  .result-table th, .result-table td { padding: 4px 6px; }
  .proj-table th, .proj-table td { padding: 6px 8px; font-size: 12px; }
  .proj-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .proj-table { min-width: 320px; }
  .stat-box .val { font-size: 14px; }
  .stat-box { padding: 6px 10px; min-width: 72px; }
}
</style>

<div class="sim-page">
  <h1>Simulator <span class="v2-badge">V2+</span>
    <a href="/pages/simulator.php" style="font-size:12px;font-weight:400;color:#718096;text-decoration:none;margin-left:12px;padding:3px 8px;background:#1a2028;border:1px solid #2d3748;border-radius:5px;">&#x2190; Classic SIM</a>
  </h1>
  <p class="sub">Focused autoscan — capital/risk · price range · body% · direction · coordination · prev-vol · volume ratio</p>

  <div class="sim-layout">

    <!-- ── CONFIG PANEL ──────────────────────────────────────────────────── -->
    <div class="config-panel">
      <h2>Parameters</h2>

      <div class="toggle-row" style="margin-bottom:4px">
        <input type="checkbox" id="opt-autoscan" checked onchange="updateRunLabel()">
        <label for="opt-autoscan">Full Autoscan <span id="autoscan-hint" style="font-size:10px;color:#4a5568;">(~60s)</span></label>
      </div>
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:8px">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer" title="T0: direct entry on T+0 candle spike.">
          <input type="checkbox" id="en-t0" checked>
          <span style="color:#a0aec0;font-size:13px;">T0</span>
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer" title="T1 standalone: after T0 misses, check if T+1 candle alone spiked. WR 86% (sim, body≥76%). Note: in LIVE no body filter → WR drops.">
          <input type="checkbox" id="en-t1">
          <span style="color:#a0aec0;font-size:13px;">T1 standalone</span>
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer" title="TC cumulative: after T0 (and T1 if enabled) miss, check cumulative T0.open→T1.close spike. WR 91.9% ≥85¢.">
          <input type="checkbox" id="en-tc">
          <span style="color:#a0aec0;font-size:13px;">TC cumulative</span>
        </label>
      </div>

      <button class="btn-run" id="btn-run" onclick="runSim()">
        <div class="spinner" id="spinner"></div>
        <span id="btn-label">Run Autoscan</span>
      </button>
      <div class="btn-row-2">
        <button class="btn-save" onclick="saveSettings()">Save</button>
        <button class="btn-apply-live" id="btn-apply-live" onclick="applyToLive()">Apply to LIVE</button>
      </div>
      <div class="btn-row-3">
        <button class="btn-io" onclick="exportSettings()">&#x2913; Export JSON</button>
        <button class="btn-io" onclick="document.getElementById('import-file').click()">&#x2912; Import JSON</button>
        <input type="file" id="import-file" accept=".json" style="display:none" onchange="importSettings(this)">
      </div>

      <hr class="config-sep">

      <div class="config-group">
        <div class="config-group-label">Capital &amp; Risk</div>
        <div class="config-row">
          <label>Balance ($)</label>
          <input type="number" id="p-bl" value="2700" min="10" step="10" oninput="onCentralBalChange()">
          <button class="btn-use-vt" onclick="useVirtualTotal()" title="Use current LIVE Virtual Total balance">&#x2191; Live</button>
        </div>
        <div class="config-row" style="margin-top:4px;gap:6px;flex-wrap:wrap;align-items:center;">
          <label style="white-space:nowrap;">Bots</label>
          <input type="number" id="p-bots" value="1" min="1" max="10" step="1" style="width:52px;" oninput="onBotsChange()">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;color:#a0aec0;white-space:nowrap;">
            <input type="checkbox" id="p-bots-central" checked onchange="onBotsCentralChange()"> Central balance
          </label>
        </div>
        <div id="per-bot-bals" style="display:none;margin-top:4px;padding:6px 8px;background:#0d1117;border:1px solid #1e2740;border-radius:5px;"></div>
        <div class="params-2col">
          <div class="config-row"><label>Risk (%)</label><input type="number" id="p-rk" value="17" min="1" max="100" step="1"></div>
          <div class="config-row" id="row-slip"><input type="checkbox" class="param-en" id="en-slip" checked onchange="toggleParam('slip')"><label>Slip (¢)</label><input type="number" id="p-slip" value="2" min="0" max="20" step="1"></div>
          <div class="config-row" id="row-maxpos"><input type="checkbox" class="param-en" id="en-maxpos" onchange="toggleParam('maxpos')"><label>Max pos</label><input type="number" id="p-maxpos" value="4" min="1" max="8" step="1"></div>
        </div>
      </div>

      <hr class="config-sep">

      <div class="config-group">
        <div class="config-group-label">Price Range</div>
        <div class="params-2col">
          <div class="config-row"><label>Min (¢)</label><input type="number" id="p-mn" value="5" min="1" max="99" step="1"></div>
          <div class="config-row"><label>Max (¢)</label><input type="number" id="p-mx" value="89" min="1" max="99" step="1"></div>
        </div>
      </div>

      <hr class="config-sep">

      <div class="config-group">
        <div class="config-group-label">Signal Quality</div>
        <div class="params-2col">
          <div class="config-row"><label>Body%</label><input type="number" id="p-body" value="76" min="0" max="100" step="1"></div>
          <div class="config-row" id="row-dir"><label title="Only process signals in this direction.">Direction</label><select id="p-dir"><option value="both">Both &#x2191;&#x2193;</option><option value="down" selected>DOWN only &#x2198;</option><option value="up">UP only &#x2197;</option></select></div>
        </div>
        <!-- Threshold hidden: only fixes global period ranking; trio sweep always re-optimises
             per-crypto thresholds independently so this has no effect on actual trio results -->
        <div class="config-row" id="row-th" style="display:none">
          <input type="checkbox" class="param-en" id="en-th" onchange="toggleParam('th')">
          <label>Threshold</label>
          <input type="number" id="p-th" value="0.24" min="0.05" max="2" step="0.01">
        </div>
      </div>

      <hr class="config-sep">

      <div class="config-group">
        <div class="config-group-label">Filters <span style="color:#4a5568;font-size:9px;font-weight:400;">(unticked = OFF in autoscan too)</span></div>
        <div class="config-row" id="row-skip-hours">
          <input type="checkbox" class="param-en" id="en-skip-hours" checked onchange="toggleParam('skip-hours')">
          <label title="UTC hours to skip (comma-separated). D2: h00 and h12 are negative-EV for DOWN signals.">Skip Hours <span class="opt-badge" title="D2 optimal: 0,12">&#x2605; 0,12</span></label>
          <input type="text" id="p-skip-hours" value="0,12" style="width:70px">
        </div>
        <div class="config-row" id="row-skip-dow">
          <input type="checkbox" class="param-en" id="en-skip-dow" checked onchange="toggleParam('skip-dow')">
          <label title="Days of week to skip (0=Sun, 6=Sat). D2: Sunday is unprofitable.">Skip Days <span class="opt-badge" title="D2 optimal: 0 — Sunday">&#x2605; 0</span></label>
          <input type="text" id="p-skip-dow" value="0" style="width:50px">
        </div>
        <div class="config-row" id="row-coord">
          <input type="checkbox" class="param-en" id="en-coord" checked onchange="toggleParam('coord')">
          <label title="Require ≥N cryptos spiking same direction in same cycle. D2: ≥2 → WR 85%→91%.">Coord Min <span class="opt-badge" title="D2 optimal: 2">&#x2605; 2</span></label>
          <input type="number" id="p-coord" value="2" min="0" max="4" step="1">
        </div>
        <div class="config-row" id="row-cb">
          <input type="checkbox" class="param-en" id="en-cb" onchange="toggleParam('cb')">
          <label title="After any LOSS, block new entries for N minutes. Research: CB=45min is the D2 sweet spot (+37% PnL vs CB=90).">Circuit Breaker <span class="opt-badge" title="Research optimal: 45min">&#x2605; 45</span></label>
          <input type="number" id="p-cb" value="45" min="5" max="360" step="5">
          <span style="font-size:11px;color:#718096;margin-left:2px">min</span>
        </div>
      </div>

      <!-- Vol ratio filters hidden: research confirmed redundant with D2 (WR barely moves, −18–31% revenue) -->
      <div style="display:none">
        <div class="config-row" id="row-vol-btc"><input type="checkbox" class="param-en" id="en-vol-btc" onchange="updateCmd()"><label>Vol BTC &#x2265;</label><input type="number" id="p-vol-btc" value="1.0" min="0" max="5" step="0.1"></div>
        <div class="config-row" id="row-vol-eth"><input type="checkbox" class="param-en" id="en-vol-eth" onchange="updateCmd()"><label>Vol ETH &#x2265;</label><input type="number" id="p-vol-eth" value="1.0" min="0" max="5" step="0.1"></div>
        <div class="config-row" id="row-vol-sol"><input type="checkbox" class="param-en" id="en-vol-sol" onchange="updateCmd()"><label>Vol SOL &#x2265;</label><input type="number" id="p-vol-sol" value="1.0" min="0" max="5" step="0.1"></div>
        <div class="config-row" id="row-vol-xrp"><input type="checkbox" class="param-en" id="en-vol-xrp" onchange="updateCmd()"><label>Vol XRP &#x2265;</label><input type="number" id="p-vol-xrp" value="1.0" min="0" max="5" step="0.1"></div>
      </div>

      <hr class="config-sep">

      <div class="config-group" id="trio-editor">
        <div class="config-group-label" style="display:flex;justify-content:space-between;align-items:center">
          Trios <span style="color:#4a5568;font-weight:400;font-size:9px">(Fast mode)</span>
          <div style="display:flex;gap:4px">
            <button onclick="loadTriosFromAutoscan()" title="Load trios from autoscan_v2.json" style="font-size:10px;padding:2px 7px;background:#2d3748;border:1px solid #4a5568;border-radius:4px;color:#a0aec0;cursor:pointer">&#x21D3; Autoscan</button>
            <button onclick="loadFromLive()" title="Load trios from LIVE engine config" style="font-size:10px;padding:2px 7px;background:#1a3252;border:1px solid #4a5568;border-radius:4px;color:#63b3ed;cursor:pointer">&#x21D3; LIVE</button>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:4px">
          <thead>
            <tr>
              <th style="font-size:0"></th>
              <th colspan="3" style="color:#63b3ed;font-size:10px;font-weight:600;text-align:center;padding-bottom:3px">5m</th>
              <th colspan="3" style="color:#f6ad55;font-size:10px;font-weight:600;text-align:center;padding-bottom:3px">15m</th>
            </tr>
            <tr>
              <th></th>
              <th style="color:#4a5568;font-size:9px;font-weight:600;text-align:center;padding-bottom:2px" title="Enable/disable this crypto for 5m">on</th>
              <th style="color:#4a5568;font-size:9px;font-weight:600;text-align:center;padding-bottom:2px">Cxx</th>
              <th style="color:#4a5568;font-size:9px;font-weight:600;text-align:center;padding-bottom:2px">Spike%</th>
              <th style="color:#4a5568;font-size:9px;font-weight:600;text-align:center;padding-bottom:2px" title="Enable/disable this crypto for 15m">on</th>
              <th style="color:#4a5568;font-size:9px;font-weight:600;text-align:center;padding-bottom:2px">Cxx</th>
              <th style="color:#4a5568;font-size:9px;font-weight:600;text-align:center;padding-bottom:2px">Spike%</th>
            </tr>
          </thead>
          <tbody id="trio-tbody"></tbody>
        </table>
      </div>

    </div>

    <!-- ── RESULTS PANEL ──────────────────────────────────────────────────── -->
    <div class="results-panel" id="results-panel">
      <div class="result-placeholder" id="placeholder">
        <div class="icon">&#x1F4CA;</div>
        Configure parameters and click <strong>Run Autoscan</strong>
      </div>
    </div>

  </div><!-- /sim-layout -->
</div><!-- /sim-page -->

<div class="copy-toast" id="copy-toast">Copied!</div>

<!-- ── Apply to LIVE — password modal ──────────────────────────────────────── -->
<div id="simAuthOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;align-items:center;justify-content:center;">
  <div style="background:#1e2532;border:1px solid #4a5568;border-radius:10px;padding:24px 28px;min-width:320px;max-width:460px;width:90%">
    <div id="simAuthLabel" style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:10px">Apply simulator trios to LIVE engine</div>
    <pre id="simAuthSummary" style="font-size:11px;color:#718096;margin:0 0 12px;line-height:1.6;white-space:pre-wrap;word-break:break-all;background:#2d3748;border-radius:6px;padding:8px 10px;max-height:180px;overflow-y:auto"></pre>
    <input id="simAuthInput" type="password" placeholder="Password"
      autocapitalize="none" autocorrect="off" autocomplete="current-password" spellcheck="false"
      style="width:100%;background:#2d3748;border:1px solid #4a5568;border-radius:5px;color:#e2e8f0;padding:8px 10px;font-size:13px;box-sizing:border-box;font-family:monospace"
      onkeydown="if(event.key==='Enter')simAuthSubmit();if(event.key==='Escape')simAuthCancel();" />
    <div id="simAuthError" style="display:none;color:#fc8181;font-size:12px;margin-top:8px;">Incorrect password.</div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button onclick="simAuthCancel()" style="background:#2d3748;border:1px solid #4a5568;color:#a0aec0;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:13px">Cancel</button>
      <button onclick="simAuthSubmit()" style="background:#276749;border:none;color:#fff;border-radius:6px;padding:7px 18px;cursor:pointer;font-size:13px;font-weight:600">Apply</button>
    </div>
  </div>
</div>

<script>
// Use PolyChampAPI from api.js (handles /api prefix + auth automatically)

// ── Last simulation result ────────────────────────────────────────────────────
let lastSimResult = null;

// ── Enable/disable param rows ─────────────────────────────────────────────────
function toggleParam(key) {
  const cb  = document.getElementById('en-' + key);
  const row = document.getElementById('row-' + key);
  if (cb && row) row.classList.toggle('disabled', !cb.checked);
}
const PARAM_KEYS_V2 = ['slip','skip-hours','skip-dow','coord','cb','maxpos','th'];
PARAM_KEYS_V2.forEach(k => toggleParam(k));

// Restore autoscan mode
{ const saved = localStorage.getItem('sim_v2_autoscan_mode');
  if (saved !== null) { document.getElementById('opt-autoscan').checked = saved === '1'; updateRunLabel(); } }

// ── Multi-bot helpers ─────────────────────────────────────────────────────────
function onBotsChange() {
  const n = parseInt(document.getElementById('p-bots').value) || 1;
  const isCentral = document.getElementById('p-bots-central').checked;
  if (n > 1 && !isCentral) renderPerBotInputs(n);
  else document.getElementById('per-bot-bals').style.display = 'none';
}
function onBotsCentralChange() {
  const isCentral = document.getElementById('p-bots-central').checked;
  const n = parseInt(document.getElementById('p-bots').value) || 1;
  if (!isCentral && n > 1) renderPerBotInputs(n);
  else document.getElementById('per-bot-bals').style.display = 'none';
}
function onCentralBalChange() {
  const n = parseInt(document.getElementById('p-bots').value) || 1;
  const isCentral = document.getElementById('p-bots-central').checked;
  if (n > 1 && !isCentral) renderPerBotInputs(n);
}
function renderPerBotInputs(n) {
  const centralBal = parseFloat(document.getElementById('p-bl').value) || 1000;
  const container = document.getElementById('per-bot-bals');
  const existing = Array.from(container.querySelectorAll('input[data-bot]')).map(el => parseFloat(el.value) || centralBal);
  container.innerHTML = Array.from({ length: n }, (_, i) => `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
      <label style="color:#a0aec0;font-size:11px;width:42px;">Bot ${i+1}</label>
      <input type="number" data-bot="${i}" value="${existing[i] ?? centralBal}" min="10" step="10"
        style="width:80px;background:#111827;color:#e2e8f0;border:1px solid #2d3748;border-radius:4px;padding:2px 6px;font-size:11px;">
      <span style="color:#718096;font-size:11px;">$</span>
    </div>`).join('');
  container.style.display = 'block';
}
function getBotBalances() {
  const n = parseInt(document.getElementById('p-bots')?.value) || 1;
  if (n <= 1) return null;
  const isCentral = document.getElementById('p-bots-central')?.checked;
  if (isCentral) return null;
  const inputs = document.getElementById('per-bot-bals')?.querySelectorAll('input[data-bot]');
  if (!inputs || !inputs.length) return null;
  return Array.from(inputs).map(el => parseFloat(el.value) || 1000).join(',');
}

// ── Autoscan toggle ───────────────────────────────────────────────────────────
function updateRunLabel() {
  const on = document.getElementById('opt-autoscan').checked;
  document.getElementById('btn-label').innerHTML = on ? 'Run Autoscan' : '&#x25B6; Run Fast';
  document.getElementById('autoscan-hint').textContent = on ? '(~60s)' : '(~2s)';
  localStorage.setItem('sim_v2_autoscan_mode', on ? '1' : '0');
}
// Fix label text after HTML decode
document.addEventListener('DOMContentLoaded', () => updateRunLabel());

// ── Settings ─────────────────────────────────────────────────────────────────
function en(key) { const cb = document.getElementById('en-'+key); return !cb || cb.checked; }

function getSettings() {
  return {
    bl:   parseFloat(document.getElementById('p-bl').value)    || 2700,
    rk:   parseFloat(document.getElementById('p-rk').value)    || 17,
    slip: en('slip') ? (parseFloat(document.getElementById('p-slip').value) ?? 2) : null,
    mn:   parseFloat(document.getElementById('p-mn').value)    || 5,
    mx:   parseFloat(document.getElementById('p-mx').value)    || 89,
    body: parseFloat(document.getElementById('p-body').value)  ?? 76,
    dir:  document.getElementById('p-dir')?.value || 'down',
    skipHours: en('skip-hours') ? (document.getElementById('p-skip-hours').value || '') : null,
    skipDow:   en('skip-dow')   ? (document.getElementById('p-skip-dow').value   || '') : null,
    coord:     en('coord')      ? (parseInt(document.getElementById('p-coord').value) || 0) : null,
    prevvol:   null,
    vol_btc: en('vol-btc') ? (parseFloat(document.getElementById('p-vol-btc').value) || 1.0) : null,
    vol_eth: en('vol-eth') ? (parseFloat(document.getElementById('p-vol-eth').value) || 1.0) : null,
    vol_sol: en('vol-sol') ? (parseFloat(document.getElementById('p-vol-sol').value) || 1.0) : null,
    vol_xrp: en('vol-xrp') ? (parseFloat(document.getElementById('p-vol-xrp').value) || 1.0) : null,
    trio5m:   getTrioObj('5m'),
    trio15m:  getTrioObj('15m'),
    trioEn5m:  Object.fromEntries(TRIO_CRYPTOS.map(cr => [cr, document.getElementById(`trio-5m-${cr}-en`)?.checked  ?? true])),
    trioEn15m: Object.fromEntries(TRIO_CRYPTOS.map(cr => [cr, document.getElementById(`trio-15m-${cr}-en`)?.checked ?? true])),
    // enable states
    en_slip: en('slip'),
    en_skip_hours: en('skip-hours'),
    en_skip_dow:   en('skip-dow'),
    en_coord:      en('coord'),
    maxpos: en('maxpos') ? (parseInt(document.getElementById('p-maxpos').value) || 4) : null,
    bots:        parseInt(document.getElementById('p-bots')?.value) || 1,
    botBalances: getBotBalances(),
    cb: en('cb') ? (parseInt(document.getElementById('p-cb').value) || 45) : null,
    // Null for fields not in V2+ UI (sent to backend as-is; null = use simulator defaults)
    dl_n: null, dl_h: null, dl_p: null,
    mxt1: null, distmin5m: null, distmin15m: null, distdrop: null,
    tp: null,
    t1standalone: document.getElementById('en-t1')?.checked  || false,
    t1Mode:       document.getElementById('en-tc')?.checked  || false,
    t0off:        !(document.getElementById('en-t0')?.checked ?? true),
    t1_5m: false, t1_15m: false, t1both: false, t1tc: false, t1off: false, tcoff: false,
    th: en('th') ? (parseFloat(document.getElementById('p-th').value) || null) : null,
    minwr: null, minth: null,
    oor: false, kal: false,
    day: null, cr: null, df: null, dt: null, nth: false,
  };
}

function applySettings(s) {
  if (!s || !Object.keys(s).length) return;
  if (s.bl   != null) document.getElementById('p-bl').value   = s.bl;
  if (s.rk   != null) document.getElementById('p-rk').value   = s.rk;
  if (s.slip != null) document.getElementById('p-slip').value = s.slip;
  if (s.mn   != null) document.getElementById('p-mn').value   = s.mn;
  if (s.mx   != null) document.getElementById('p-mx').value   = s.mx;
  if (s.body != null) document.getElementById('p-body').value = s.body;
  if (s.dir  != null) document.getElementById('p-dir').value  = s.dir;
  if (s.vol_btc != null) { document.getElementById('p-vol-btc').value = s.vol_btc; document.getElementById('en-vol-btc').checked = true; }
  if (s.vol_eth != null) { document.getElementById('p-vol-eth').value = s.vol_eth; document.getElementById('en-vol-eth').checked = true; }
  if (s.vol_sol != null) { document.getElementById('p-vol-sol').value = s.vol_sol; document.getElementById('en-vol-sol').checked = true; }
  if (s.vol_xrp != null) { document.getElementById('p-vol-xrp').value = s.vol_xrp; document.getElementById('en-vol-xrp').checked = true; }
  if (s.skipHours != null) { document.getElementById('p-skip-hours').value = s.skipHours; document.getElementById('en-skip-hours').checked = true; }
  if (s.skipDow   != null) { document.getElementById('p-skip-dow').value   = s.skipDow;   document.getElementById('en-skip-dow').checked   = true; }
  if (s.coord != null) { document.getElementById('p-coord').value = s.coord; document.getElementById('en-coord').checked = true; }
  if (s.cb    != null) { document.getElementById('p-cb').value    = s.cb;    document.getElementById('en-cb').checked    = true; }
  if (s.th    != null) { document.getElementById('p-th').value    = s.th;    document.getElementById('en-th').checked    = true; }
  // Trios
  if (s.trio5m)  TRIO_CRYPTOS.forEach(cr => { const d = s.trio5m[cr];  if(d){ const ep=document.getElementById(`trio-5m-${cr}-period`);  const et=document.getElementById(`trio-5m-${cr}-th`);  if(ep)ep.value=d.period; if(et)et.value=d.th; } });
  if (s.trio15m) TRIO_CRYPTOS.forEach(cr => { const d = s.trio15m[cr]; if(d){ const ep=document.getElementById(`trio-15m-${cr}-period`); const et=document.getElementById(`trio-15m-${cr}-th`); if(ep)ep.value=d.period; if(et)et.value=d.th; } });
  if (s.trioEn5m)  TRIO_CRYPTOS.forEach(cr => { const cb=document.getElementById(`trio-5m-${cr}-en`);  if(cb){ cb.checked = s.trioEn5m[cr]  ?? true; toggleTrioRow('5m',  cr); } });
  if (s.trioEn15m) TRIO_CRYPTOS.forEach(cr => { const cb=document.getElementById(`trio-15m-${cr}-en`); if(cb){ cb.checked = s.trioEn15m[cr] ?? true; toggleTrioRow('15m', cr); } });
  if (s.maxpos != null) { document.getElementById('p-maxpos').value = s.maxpos; document.getElementById('en-maxpos').checked = true; }
  if (s.bots   != null) { document.getElementById('p-bots').value = s.bots; onBotsChange(); }
  // New model
  if (s.t0off        != null) { const el = document.getElementById('en-t0'); if (el) el.checked = !s.t0off; }
  if (s.t1standalone != null) { const el = document.getElementById('en-t1'); if (el) el.checked = !!s.t1standalone; }
  if (s.t1Mode       != null) { const el = document.getElementById('en-tc'); if (el) el.checked = !!s.t1Mode; }
  // Backward compat (old exports with t1both / t1_5m / t1_15m)
  if (s.t1standalone == null && s.t1both != null) { const el = document.getElementById('en-t1'); if (el) el.checked = !!s.t1both; }
  if (s.t1Mode == null) {
    // t1both=true (old "T1+TC together") also means TC was on; t1_5m/t1_15m are the explicit TC flags
    const el = document.getElementById('en-tc');
    if (el) el.checked = !!(s.t1_5m || s.t1_15m || s.t1both);
  }
  // Restore enable states
  const restore = (key, enField) => {
    const val = s[enField ?? ('en_' + key.replace(/-/g, '_'))];
    const cb  = document.getElementById('en-' + key);
    if (cb && val != null) cb.checked = val;
    toggleParam(key);
  };
  restore('slip');
  restore('skip-hours', 'en_skip_hours');
  restore('skip-dow',   'en_skip_dow');
  restore('coord',      'en_coord');
  restore('cb');
  restore('maxpos');
}

function exportSettings() {
  const s = getSettings();

  // Per-crypto strategy/threshold with "C" prefix (LIVE-engine format)
  const perCrypto = {};
  ['BTC','ETH','SOL','XRP'].forEach(cr => {
    const t5  = s.trio5m?.[cr];
    const t15 = s.trio15m?.[cr];
    if (t5)  { perCrypto[`strategy5m_${cr}`]  = `C${t5.period}`;  perCrypto[`threshold5m_${cr}`]  = t5.th; }
    if (t15) { perCrypto[`strategy15m_${cr}`] = `C${t15.period}`; perCrypto[`threshold15m_${cr}`] = t15.th; }
  });

  // LIVE-compatible payload — same structure as SIM1 export
  const payload = {
    source                  : 'SIMULATOR_V2',
    _exported               : new Date().toISOString(),
    riskPct                 : s.rk   != null ? s.rk  / 100 : null,
    maxPositions            : s.maxpos ?? null,
    minPrice5m              : s.mn   != null ? s.mn  / 100 : null,
    minPrice15m             : s.mn   != null ? s.mn  / 100 : null,
    maxPrice5m              : s.mx   != null ? s.mx  / 100 : null,
    maxPrice15m             : s.mx   != null ? s.mx  / 100 : null,
    bodyPct                 : s.body ?? null,
    directionFilter         : s.dir  !== 'both' ? (s.dir || null) : null,
    skipHours               : s.skipHours ? String(s.skipHours).split(',').map(Number).filter(n => !isNaN(n)) : [],
    skipDow                 : s.skipDow   ? String(s.skipDow).split(',').map(Number).filter(n => !isNaN(n))   : [],
    coordMin                : s.coord ?? null,  // backward compat alias
    coordMinCryptos         : s.coord ?? null,  // LIVE canonical name
    t1Mode                  : !!s.t1Mode,
    t1standalone            : !!s.t1standalone,
    t0off                   : !!s.t0off,
    circuitBreakerEnabled   : s.cb != null,
    circuitBreakerMins      : s.cb ?? null,
    drawdownLimitEnabled    : s.dl_n != null,
    drawdownLimitMaxLosses  : s.dl_n ?? null,
    drawdownLimitWindowMins : s.dl_h ?? null,
    drawdownLimitPauseMins  : s.dl_p ?? null,
    distMin5m               : s.distmin5m  ?? null,
    distMin15m              : s.distmin15m ?? null,
    allowLowVol             : true,
    allowPriceOor           : !!s.oor,
    ...perCrypto,
    _sim                    : { config: s, result: lastSimResult },
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sim2-${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Settings exported');
}

function importSettings(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const L = JSON.parse(e.target.result);
      // LIVE-compatible export (from SIM1 or SIM2): apply normalized fields first
      if (L.source === 'SIMULATOR' || L.source === 'SIMULATOR_V2' || L.riskPct != null) {
        applyLiveConfig(L);
      }
      // Restore full form state if embedded (sim export)
      if (L._sim?.config) {
        applySettings(L._sim.config);
      } else if (!L.riskPct) {
        // Raw form state (old SIM2 export format)
        applySettings(L);
      }
      showToast('Imported — click Save to persist');
    } catch (err) {
      showToast('Import failed: ' + err.message);
    }
    input.value = '';
  };
  reader.readAsText(file);
}

async function saveSettings() {
  try {
    await PolyChampAPI.request('POST', '/simulator/v2/settings', getSettings());
    showToast('Settings saved');
  } catch (e) { showToast('Save failed: ' + e.message); }
}

// ── Trio editor ───────────────────────────────────────────────────────────────
const TRIO_CRYPTOS = ['BTC','ETH','SOL','XRP'];
const TRIO_DEFAULTS = {
  '5m':  { BTC:{period:85,th:0.15}, ETH:{period:85,th:0.12}, SOL:{period:85,th:0.12}, XRP:{period:85,th:0.18} },
  '15m': { BTC:{period:165,th:0.26}, ETH:{period:165,th:0.24}, SOL:{period:165,th:0.24}, XRP:{period:165,th:0.24} },
};

function toggleTrioRow(dim, cr) {
  const on = document.getElementById(`trio-${dim}-${cr}-en`)?.checked ?? true;
  const alpha = on ? '' : '0.3';
  ['period','th'].forEach(f => {
    const el = document.getElementById(`trio-${dim}-${cr}-${f}`);
    if (el) el.style.opacity = alpha;
  });
}

(function initTrioTable() {
  const tb = document.getElementById('trio-tbody');
  const inp = (id, val, min, max, step, w) =>
    `<input type="number" id="${id}" value="${val}" min="${min}" max="${max}" step="${step}"` +
    ` style="width:${w};background:#2d3748;border:1px solid #374151;border-radius:3px;color:#e2e8f0;padding:2px 3px;font-size:11px;text-align:center;font-family:monospace">`;
  const chk = (id, dim, cr) =>
    `<input type="checkbox" id="${id}" checked onchange="toggleTrioRow('${dim}','${cr}')" style="cursor:pointer;margin:0;accent-color:#63b3ed" title="Enable/disable ${cr} ${dim}">`;
  TRIO_CRYPTOS.forEach(cr => {
    const d5 = TRIO_DEFAULTS['5m'][cr], d15 = TRIO_DEFAULTS['15m'][cr];
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td style="color:#a0aec0;font-weight:600;font-size:11px;padding:3px 2px">${cr}</td>` +
      `<td style="padding:2px 3px;text-align:center">${chk(`trio-5m-${cr}-en`,  '5m',  cr)}</td>` +
      `<td style="padding:2px 3px;text-align:center">${inp(`trio-5m-${cr}-period`,  d5.period,  50,  95, 1,    '42px')}</td>` +
      `<td style="padding:2px 3px;text-align:center">${inp(`trio-5m-${cr}-th`,      d5.th,     0.10, 2.0, 0.01, '54px')}</td>` +
      `<td style="padding:2px 3px;text-align:center">${chk(`trio-15m-${cr}-en`, '15m', cr)}</td>` +
      `<td style="padding:2px 3px;text-align:center">${inp(`trio-15m-${cr}-period`, d15.period, 150, 255, 1,    '42px')}</td>` +
      `<td style="padding:2px 3px;text-align:center">${inp(`trio-15m-${cr}-th`,     d15.th,    0.10, 2.0, 0.01, '54px')}</td>`;
    tb.appendChild(tr);
  });
})();

function getTrioObj(dim) {
  const o = {};
  TRIO_CRYPTOS.forEach(cr => {
    if (!(document.getElementById(`trio-${dim}-${cr}-en`)?.checked ?? true)) return;
    const p = parseInt(document.getElementById(`trio-${dim}-${cr}-period`)?.value);
    const t = parseFloat(document.getElementById(`trio-${dim}-${cr}-th`)?.value);
    if (!isNaN(p) && !isNaN(t)) o[cr] = { period: p, th: t };
  });
  return Object.keys(o).length ? o : null;
}

async function loadTriosFromAutoscan() {
  try {
    const data = await PolyChampAPI.request('GET', '/t1000/autoscan');
    TRIO_CRYPTOS.forEach(cr => {
      if (data.trio5m?.[cr]) {
        const p = String(data.trio5m[cr].period).replace('C','');
        document.getElementById(`trio-5m-${cr}-period`).value = p;
        document.getElementById(`trio-5m-${cr}-th`).value     = parseFloat(data.trio5m[cr].th).toFixed(2);
        const cb5 = document.getElementById(`trio-5m-${cr}-en`);
        if (cb5) { cb5.checked = true; toggleTrioRow('5m', cr); }
      }
      if (data.trio15m?.[cr]) {
        const p = String(data.trio15m[cr].period).replace('C','');
        document.getElementById(`trio-15m-${cr}-period`).value = p;
        document.getElementById(`trio-15m-${cr}-th`).value     = parseFloat(data.trio15m[cr].th).toFixed(2);
        const cb15 = document.getElementById(`trio-15m-${cr}-en`);
        if (cb15) { cb15.checked = true; toggleTrioRow('15m', cr); }
      }
    });
    showToast('Trios loaded');
  } catch (e) { showToast('Failed: ' + e.message); }
}

function applyLiveConfig(L) {
  TRIO_CRYPTOS.forEach(cr => {
    const s5  = L[`strategy5m_${cr}`]  ?? L.strategy5m;
    const th5 = L[`threshold5m_${cr}`] ?? L.threshold5m ?? 0.24;
    if (s5) {
      const el = document.getElementById(`trio-5m-${cr}-period`);
      const et = document.getElementById(`trio-5m-${cr}-th`);
      if (el) el.value = String(s5).replace('C', '');
      if (et) et.value = parseFloat(th5).toFixed(2);
      const cb5 = document.getElementById(`trio-5m-${cr}-en`);
      if (cb5) { cb5.checked = true; toggleTrioRow('5m', cr); }
    }
    const s15  = L[`strategy15m_${cr}`]  ?? L.strategy15m;
    const th15 = L[`threshold15m_${cr}`] ?? L.threshold15m ?? 0.24;
    if (s15) {
      const el = document.getElementById(`trio-15m-${cr}-period`);
      const et = document.getElementById(`trio-15m-${cr}-th`);
      if (el) el.value = String(s15).replace('C', '');
      if (et) et.value = parseFloat(th15).toFixed(2);
      const cb15 = document.getElementById(`trio-15m-${cr}-en`);
      if (cb15) { cb15.checked = true; toggleTrioRow('15m', cr); }
    }
  });
  if (L.balance  != null) document.getElementById('p-bl').value = parseFloat(L.balance).toFixed(2);
  if (L.riskPct  != null) document.getElementById('p-rk').value = parseFloat(L.riskPct * 100).toFixed(0);
  if (L.minPrice5m != null) document.getElementById('p-mn').value = Math.round(L.minPrice5m * 100);
  if (L.maxPrice5m != null) document.getElementById('p-mx').value = Math.round(L.maxPrice5m * 100);
  if (L.bodyPct  != null) document.getElementById('p-body').value = L.bodyPct;
  // Direction
  if (L.directionFilter != null) {
    const dirEl = document.getElementById('p-dir');
    if (dirEl) dirEl.value = L.directionFilter.toLowerCase() || 'both';
  }
  // Skip hours
  if (Array.isArray(L.skipHours) && L.skipHours.length) {
    document.getElementById('en-skip-hours').checked = true;
    document.getElementById('p-skip-hours').value = L.skipHours.join(',');
    toggleParam('skip-hours');
  }
  // Skip DOW
  if (Array.isArray(L.skipDow) && L.skipDow.length) {
    document.getElementById('en-skip-dow').checked = true;
    document.getElementById('p-skip-dow').value = L.skipDow.join(',');
    toggleParam('skip-dow');
  }
  // Coord (accept both LIVE canonical name and SIM2 alias)
  const _coordV = L.coordMinCryptos ?? L.coordMin;
  if (_coordV != null && _coordV > 0) {
    document.getElementById('en-coord').checked = true;
    document.getElementById('p-coord').value = _coordV;
    toggleParam('coord');
  }
  // MaxPos
  if (L.maxPositions != null) {
    const mpEl = document.getElementById('p-maxpos');
    if (mpEl) { mpEl.value = L.maxPositions; document.getElementById('en-maxpos').checked = true; toggleParam('maxpos'); }
  }
  // TC / T1 / T0 mode
  if (L.t0off        != null) { const el = document.getElementById('en-t0'); if (el) el.checked = !L.t0off; }
  if (L.t1Mode != null)      { const el = document.getElementById('en-tc'); if (el) el.checked = !!L.t1Mode; }
  if (L.t1standalone != null) { const el = document.getElementById('en-t1'); if (el) el.checked = !!L.t1standalone; }
  // Circuit breaker
  if (L.circuitBreakerEnabled && L.circuitBreakerMins != null) {
    document.getElementById('en-cb').checked = true;
    document.getElementById('p-cb').value = L.circuitBreakerMins;
    toggleParam('cb');
  }
  const liveLowVol = L.allowLowVol ?? true;
  document.getElementById('en-vol-btc').checked = !liveLowVol;
  document.getElementById('en-vol-eth').checked = false;
  document.getElementById('en-vol-sol').checked = !liveLowVol;
  document.getElementById('en-vol-xrp').checked = false;
  showToast('Config loaded');
}

async function loadFromLive() {
  try {
    const state = await PolyChampAPI.request('GET', '/t1000/state');
    const L = state?.LIVE;
    if (!L) { showToast('No LIVE state'); return; }
    applyLiveConfig(L);
  } catch (e) { showToast('Failed: ' + e.message); }
}

// No-op to avoid errors from updateCmd() calls in vol checkboxes
function updateCmd() {}

// ── Run simulator ─────────────────────────────────────────────────────────────
async function runSim() {
  const btn     = document.getElementById('btn-run');
  const spinner = document.getElementById('spinner');
  const label   = document.getElementById('btn-label');
  btn.disabled  = true;
  spinner.style.display = 'block';
  label.textContent     = 'Running\u2026';

  const panel = document.getElementById('results-panel');
  const useAutoscan = document.getElementById('opt-autoscan').checked;
  panel.innerHTML = useAutoscan
    ? `<div class="result-placeholder"><div class="icon">&#x23F3;</div>Autoscan running \u2014 this takes 30\u201390 seconds\u2026</div>`
    : `<div class="result-placeholder"><div class="icon">&#x26A1;</div>Running fast simulation (using saved trios)\u2026</div>`;

  const params = getSettings();
  const body = Object.fromEntries(Object.entries(params).filter(([,v]) => v != null && v !== false));
  // Always include t1standalone/t1Mode (even when false) so server.js uses the new two-field model
  // rather than falling back to classic SIM field detection (which would add no T1 flags at all).
  body.t1standalone = !!params.t1standalone;
  body.t1Mode       = !!params.t1Mode;
  body.t0off        = !!params.t0off;
  if (!useAutoscan) body.autoscan = false;

  try {
    const data = await PolyChampAPI.request('POST', '/simulator/run', body);
    if (!data.result) {
      panel.innerHTML = `<div class="error-card"><strong>Error</strong><br>${data.error || 'No result returned'}</div>`;
    } else {
      lastSimResult = data.result;
      renderResults(data.result, params);
      // After autoscan: sync trio table with per-crypto optimal periods + thresholds.
      // Coord uses cycleStartMs (cycle boundary), not signal detection time — so BTC:C65
      // and SOL:C91 firing in the same 5-min cycle both count for coordination. Per-crypto
      // periods are safe with coord and give better WR than forcing a uniform global period.
      if (useAutoscan) {
        const r = data.result;
        // If any trios are null in the autoscan result (e.g. T0 disabled → too few 15m entries),
        // fall back to the saved autoscan_v2.json so the UI stays in sync with LIVE Setup.
        const miss5m  = TRIO_CRYPTOS.some(cr => !r.autoscan5m?.trios?.[cr]);
        const miss15m = TRIO_CRYPTOS.some(cr => !r.autoscan15m?.trios?.[cr]);
        let saved = null;
        if (miss5m || miss15m) {
          try { saved = await PolyChampAPI.request('GET', '/t1000/autoscan'); } catch {}
        }
        TRIO_CRYPTOS.forEach(cr => {
          const t5  = r.autoscan5m?.trios?.[cr]
            ?? (miss5m  && saved?.trio5m?.[cr]  ? { period: String(saved.trio5m[cr].period).replace('C',''),  th: saved.trio5m[cr].th  } : null);
          const t15 = r.autoscan15m?.trios?.[cr]
            ?? (miss15m && saved?.trio15m?.[cr] ? { period: String(saved.trio15m[cr].period).replace('C',''), th: saved.trio15m[cr].th } : null);
          // --- 5m: only enable when autoscan found a result; never disable on null ---
          const cb5 = document.getElementById(`trio-5m-${cr}-en`);
          if (t5) {
            if (cb5) { cb5.checked = true; toggleTrioRow('5m', cr); }
            const ep = document.getElementById(`trio-5m-${cr}-period`);
            const et = document.getElementById(`trio-5m-${cr}-th`);
            if (ep) ep.value = t5.period;
            if (et) et.value = parseFloat(t5.th).toFixed(2);
          }
          // --- 15m: only enable when autoscan found a result; never disable on null ---
          const cb15 = document.getElementById(`trio-15m-${cr}-en`);
          if (t15) {
            if (cb15) { cb15.checked = true; toggleTrioRow('15m', cr); }
            const ep = document.getElementById(`trio-15m-${cr}-period`);
            const et = document.getElementById(`trio-15m-${cr}-th`);
            if (ep) ep.value = t15.period;
            if (et) et.value = parseFloat(t15.th).toFixed(2);
          }
        });
      }
    }
  } catch (e) {
    panel.innerHTML = `<div class="error-card"><strong>Error</strong><br>${e.message}</div>`;
  }

  btn.disabled = false;
  spinner.style.display = 'none';
  updateRunLabel();
}

// ── Use current Virtual Total balance ─────────────────────────────────────────
async function useVirtualTotal() {
  try {
    const state = await PolyChampAPI.request('GET', '/t1000/state');
    const live = state.LIVE;
    if (!live) return showToast('No LIVE state found');
    const log = live.activityLog || [];
    const locked     = log.filter(e => e.status === 'OPEN').reduce((s, e) => s + (e.position || 0), 0);
    const redeemable = log.filter(e => e.status === 'WIN' && !e.redeemed)
      .reduce((s, e) => s + (e.position > 0 && e.entryPrice > 0 ? e.position / e.entryPrice : 0), 0);
    const total = (live.realBalance || 0) + locked + redeemable;
    document.getElementById('p-bl').value = Math.round(total * 100) / 100;
    showToast(`Set to $${total.toFixed(2)}`);
  } catch (e) { showToast('Failed: ' + e.message); }
}

// ── Apply to LIVE ─────────────────────────────────────────────────────────────
function applyToLive() {
  if (!lastSimResult) return showToast('Run autoscan first');
  const r    = lastSimResult;
  const as5  = r.autoscan5m;
  const as15 = r.autoscan15m;
  const asK  = r.autoscanKalshi;
  if (!as5 && !as15) return showToast('No autoscan data in result');

  const CRYPTOS = ['BTC', 'ETH', 'SOL', 'XRP'];
  const s = getSettings();
  const lines = [];

  const dispC = (v, def) => v != null ? Math.round(v > 1 ? v : v * 100) : def;
  const effMn = s.mn ?? null, effMx = s.mx ?? null;
  if (as5) {
    const mnDisp = effMn ?? dispC(as5.top?.mn, 5);
    const mxDisp = effMx ?? dispC(as5.top?.mx, 89);
    const g = as5.top ? `C${as5.top.period} mn=${mnDisp}\u00a2 mx=${mxDisp}\u00a2` : '\u2014';
    const perCr = CRYPTOS.map(c => { const t = as5.trios?.[c]; return t ? `${c}:C${t.period}:${t.th.toFixed(2)}%` : null; }).filter(Boolean);
    lines.push(`LIVE 5m  global: ${g}`);
    if (perCr.length) lines.push(`         trios: ${perCr.join('  ')}`);
  }
  if (as15) {
    const mn15Disp = effMn ?? dispC(as15.top?.mn, 5);
    const mx15Disp = effMx ?? dispC(as15.top?.mx, 89);
    const g = as15.top ? `C${as15.top.period} mn=${mn15Disp}\u00a2 mx=${mx15Disp}\u00a2` : '\u2014';
    const perCr = CRYPTOS.map(c => { const t = as15.trios?.[c]; return t ? `${c}:C${t.period}:${t.th.toFixed(2)}%` : null; }).filter(Boolean);
    lines.push(`LIVE 15m global: ${g}`);
    if (perCr.length) lines.push(`         trios: ${perCr.join('  ')}`);
  }
  if (asK) {
    const g = asK.top ? `C${asK.top.period}` : '\u2014';
    const perCr = CRYPTOS.map(c => { const t = asK.trios?.[c]; return t ? `${c}:C${t.period}:${t.th.toFixed(2)}%` : null; }).filter(Boolean);
    lines.push(`KALSHI 15m: ${g}`);
    if (perCr.length) lines.push(`           trios: ${perCr.join('  ')}`);
  }
  lines.push('');
  lines.push(`Dir: ${s.dir}  Coord: ${s.coord ?? 'OFF'}  CB: ${s.cb != null ? s.cb + 'min' : 'OFF'}  SkipH: ${s.skipHours || '\u2014'}  SkipDow: ${s.skipDow || '\u2014'}`);
  lines.push(`Risk: ${s.rk}%  MaxPos: ${s.maxpos ?? 1}  Body: ${s.body}%  Price: ${s.mn}\u00a2\u2013${s.mx}\u00a2`);
  const tcParts = [s.t1_5m && '5m', s.t1_15m && '15m'].filter(Boolean);
  if (tcParts.length) lines.push(`TC: ${tcParts.join('+')}`);

  document.getElementById('simAuthSummary').textContent = lines.join('\n');
  document.getElementById('simAuthError').style.display = 'none';
  document.getElementById('simAuthInput').value = '';
  document.getElementById('simAuthOverlay').style.display = 'flex';
  setTimeout(() => document.getElementById('simAuthInput').focus(), 10);
}

function simAuthCancel() {
  document.getElementById('simAuthOverlay').style.display = 'none';
}

async function simAuthSubmit() {
  const pw = document.getElementById('simAuthInput').value;
  if (pw.trim().toLowerCase() !== 'janjy20142004197419722008') {
    document.getElementById('simAuthError').style.display = 'block';
    document.getElementById('simAuthInput').select();
    return;
  }
  document.getElementById('simAuthOverlay').style.display = 'none';

  const r    = lastSimResult;
  const as5  = r.autoscan5m;
  const as15 = r.autoscan15m;
  const asK  = r.autoscanKalshi;
  const CRYPTOS = ['BTC', 'ETH', 'SOL', 'XRP'];
  const s = getSettings();

  try {
    const liveChanges = { stratKey: 'LIVE' };
    if (as5?.top?.period  != null) liveChanges.strategy5m  = 'C' + as5.top.period;
    if (as15?.top?.period != null) liveChanges.strategy15m = 'C' + as15.top.period;

    for (const c of CRYPTOS) {
      const en5  = document.getElementById(`trio-5m-${c}-en`)?.checked  ?? true;
      const en15 = document.getElementById(`trio-15m-${c}-en`)?.checked ?? true;
      if (as5?.trios?.[c]  && en5)  { liveChanges[`strategy5m_${c}`]  = 'C' + as5.trios[c].period;  liveChanges[`threshold5m_${c}`]  = as5.trios[c].th; }
      if (as15?.trios?.[c] && en15) { liveChanges[`strategy15m_${c}`] = 'C' + as15.trios[c].period; liveChanges[`threshold15m_${c}`] = as15.trios[c].th; }
      // Clear any stale per-crypto price overrides so the global maxPrice5m/15m (from SIM2 input) wins
      liveChanges[`maxPrice5m_${c}`]  = null;
      liveChanges[`maxPrice15m_${c}`] = null;
      liveChanges[`minPrice5m_${c}`]  = null;
      liveChanges[`minPrice15m_${c}`] = null;
    }

    const toFrac = (v) => v != null ? (v > 1 ? v / 100 : v) : null;
    liveChanges.minPrice5m  = s.mn != null ? s.mn / 100 : (toFrac(as5?.top?.mn)  ?? undefined);
    liveChanges.maxPrice5m  = s.mx != null ? s.mx / 100 : (toFrac(as5?.top?.mx)  ?? undefined);
    liveChanges.minPrice15m = s.mn != null ? s.mn / 100 : (toFrac(as15?.top?.mn) ?? undefined);
    liveChanges.maxPrice15m = s.mx != null ? s.mx / 100 : (toFrac(as15?.top?.mx) ?? undefined);
    for (const k of ['minPrice5m','maxPrice5m','minPrice15m','maxPrice15m'])
      if (liveChanges[k] === undefined) delete liveChanges[k];

    // Push body%, TC mode, CB, coord, skipHours, skipDow, direction, risk, maxPos
    if (s.body != null) liveChanges.bodyPct = s.body;
    liveChanges.t1Mode       = !!s.t1Mode;
    liveChanges.t1standalone = !!s.t1standalone;
    liveChanges.t0off        = !!s.t0off;
    if (s.cb != null) {
      liveChanges.circuitBreakerEnabled = true;
      liveChanges.circuitBreakerMins    = s.cb;
    } else {
      liveChanges.circuitBreakerEnabled = false;
    }
    if (s.coord != null) liveChanges.coordMinCryptos = s.coord;
    if (s.skipHours != null && s.skipHours !== '')
      liveChanges.skipHours = String(s.skipHours).split(',').map(Number).filter(n => !isNaN(n));
    else
      liveChanges.skipHours = [];
    if (s.skipDow != null && s.skipDow !== '')
      liveChanges.skipDow = String(s.skipDow).split(',').map(Number).filter(n => !isNaN(n));
    else
      liveChanges.skipDow = [];
    liveChanges.directionFilter = (s.dir === 'up') ? 'UP' : (s.dir === 'down') ? 'DOWN' : null;
    if (s.rk != null) liveChanges.riskPct = s.rk / 100;
    if (s.maxpos != null) liveChanges.maxPositions = s.maxpos;

    await PolyChampAPI.request('POST', '/t1000/config', liveChanges);

    if (asK) {
      const kalChanges = { stratKey: 'LIVE_KALSHI' };
      if (asK.top?.period != null) kalChanges.strategy15m = 'C' + asK.top.period;
      for (const c of CRYPTOS) {
        if (asK.trios?.[c]) { kalChanges[`strategy15m_${c}`] = 'C' + asK.trios[c].period; kalChanges[`threshold15m_${c}`] = asK.trios[c].th; }
      }
      await PolyChampAPI.request('POST', '/t1000/config', kalChanges);
    }

    try { localStorage.setItem('polychamp_live_applied', Date.now().toString()); } catch (_) {}
    showToast('Applied to LIVE' + (asK ? ' + LIVE_KALSHI' : ''));
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

// ── Result rendering helpers ──────────────────────────────────────────────────
function fmt$(v) {
  if (v == null) return '<span class="dim">\u2014</span>';
  const abs = Math.abs(v), sign = v >= 0 ? '+' : '-', cls = v >= 0 ? 'win' : 'loss';
  return `<span class="${cls}">${sign}$${abs.toFixed(2)}</span>`;
}
function fmtProj(v) {
  if (v == null) return '<span class="dim">\u2014</span>';
  const cls = v >= 0 ? 'win' : 'loss', sign = v >= 0 ? '+' : '-';
  return `<span class="${cls}">${sign}$${Math.round(Math.abs(v))}</span>`;
}
function projDate(days) {
  const d = new Date(); d.setDate(d.getDate() + Math.round(days));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtWR(wr) {
  if (wr == null) return '<span class="dim">\u2014</span>';
  const pct = (wr * 100).toFixed(1), cls = wr >= 0.9 ? 'win' : wr >= 0.8 ? 'blue' : 'loss';
  return `<span class="${cls}">${pct}%</span>`;
}
function fmtScore(s) {
  if (s == null || !isFinite(s)) return '<span class="dim">\u2014</span>';
  const cls = s >= 0.85 ? 'win' : s >= 0.7 ? 'blue' : 'loss';
  return `<span class="${cls} bold">${s.toFixed(3)}</span>`;
}
function cryptoCls(c) {
  return { BTC: 'crypto-btc', ETH: 'crypto-eth', SOL: 'crypto-sol', XRP: 'crypto-xrp' }[c] || '';
}
function periodBadge(p) {
  if (!p) return '<span class="dim">\u2014</span>';
  return `<span class="badge blue">C${p}</span>`;
}

function renderAutoscanSection(data, label, isKalshi, pnlOverrides) {
  pnlOverrides = pnlOverrides || {};
  if (!data) return `<div class="result-card"><h3>${label}</h3><p style="color:#4a5568;font-size:12px">No results</p></div>`;
  const trios = data.trios || {}, quartets = data.quartet || {}, top = data.top;
  const cryptos = ['BTC','ETH','SOL','XRP'];
  const trioRows = cryptos.map((c, i) => {
    const r = trios[c], alt = i % 2 === 1 ? ' alt' : '';
    if (!r) return `<tr class="tr${alt}"><td class="${cryptoCls(c)}">${c}</td><td colspan="8" class="dim">insufficient data</td></tr>`;
    const wr = r.total > 0 ? (r.wins / r.total * 100).toFixed(1) + '%' : '\u2014';
    const wrCls = r.total > 0 && r.wins / r.total >= 0.9 ? 'win' : r.total > 0 && r.wins / r.total >= 0.8 ? 'blue' : 'loss';
    const q = quartets[c];
    const periodUP = q?.UP?.period  ?? r.periodUP ?? null, thUP     = q?.UP?.th      ?? r.thUP     ?? null;
    const periodDN = q?.DOWN?.period ?? r.periodDN ?? null, thDN     = q?.DOWN?.th    ?? r.thDN     ?? null;
    const mnUP = q?.UP?.mn   ?? r.mnUP ?? null, mxUP = q?.UP?.mx   ?? r.mxUP ?? null;
    const mnDN = q?.DOWN?.mn ?? r.mnDN ?? null, mxDN = q?.DOWN?.mx ?? r.mxDN ?? null;
    const fmtDir = (period, th, arrow, arrowColor) => {
      if (period == null) return `<span class="dim">${arrow}\u2014</span>`;
      return `<span style="color:${arrowColor};font-size:10px">${arrow}C${period}</span> ` +
             `<span style="font-size:10px;color:#e2e8f0">${th != null ? th.toFixed(2)+'%' : '\u2014'}</span>`;
    };
    const quartetCell = `<div style="line-height:1.7">${fmtDir(periodUP, thUP, '\u25b2', '#63b3ed')}<br>${fmtDir(periodDN, thDN, '\u25bc', '#f6ad55')}</div>`;
    const fmtMin = (v) => {
      if (v == null) return '<span class="dim">\u2014</span>';
      const c2 = Math.round(v * 100);
      if (c2 <= 5)  return `<span class="dim" style="font-size:10px">${c2}\u00a2</span>`;
      if (c2 <= 20) return `<span style="font-size:10px;color:#f6ad55;font-weight:bold">${c2}\u00a2\u26a0</span>`;
      return `<span style="font-size:10px;color:#fc8181;font-weight:bold">${c2}\u00a2\u26a0</span>`;
    };
    const fmtMax = (v) => v != null ? `<span class="dim" style="font-size:10px">${Math.round(v*100)}\u00a2</span>` : '<span class="dim">\u2014</span>';
    const rangeCell = `<div style="line-height:1.7"><span style="color:#63b3ed;font-size:10px">\u25b2</span> ${fmtMin(mnUP)}\u2013${fmtMax(mxUP)}<br><span style="color:#f6ad55;font-size:10px">\u25bc</span> ${fmtMin(mnDN)}\u2013${fmtMax(mxDN)}</div>`;
    const pnl = pnlOverrides[c] != null ? pnlOverrides[c] : (r.pnl ?? null);
    return `<tr class="tr${alt}">
      <td class="${cryptoCls(c)}">${c}</td>
      <td class="blue bold">C${r.period}</td>
      <td class="yellow">${r.th.toFixed(2)}%</td>
      <td>${quartetCell}</td>
      <td>${r.wins}W / ${r.losses}L</td>
      <td class="${wrCls}">${wr}</td>
      <td>${fmt$(pnl)}</td>
      <td>${fmtScore(r.score)}</td>
      <td>${rangeCell}</td>
    </tr>`;
  }).join('');
  const accent = isKalshi ? 'style="border-left:3px solid #63b3ed"' : '';
  const note   = isKalshi ? ' <span style="font-size:10px;color:#4a5568;font-weight:400">\u26a0 PM prices as proxy</span>' : '';
  return `<div class="result-card" ${accent}>
    <h3>${label}${note} <span class="badge">${top ? `C${top.period} \u2605` : 'no result'}</span></h3>
    <p style="font-size:10px;color:#4a5568;margin:2px 0 8px 0">W/L \u00b7 WR \u00b7 Score are per-crypto independent estimates (no CB \u00b7 no position overlap). PnL reflects the combined simulation.</p>
    <div style="overflow-x:auto"><table class="result-table">
      <thead><tr><th>Crypto</th><th>Cxx (combined)</th><th>Threshold</th><th title="Direction-specific Cxx + threshold from quartet sweep">Quartet \u25b2/\u25bc</th><th title="Individual estimate">W/L *</th><th title="Individual estimate">WR *</th><th>PnL</th><th title="Individual estimate">Score *</th><th title="Min\u2013Max entry price per direction">Entry Range</th></tr></thead>
      <tbody>${trioRows}</tbody>
    </table></div>
  </div>`;
}

const PROJ_CAPS_5M  = { BTC: 150, ETH: 150, SOL: 150, XRP: 150 };
const PROJ_CAPS_15M = { BTC: 150, ETH: 150, SOL: 150, XRP: 150 };
const PROJ_CAPS_KAL = { BTC: 1000, ETH: 500, SOL: 200, XRP: 150 };

function projLoopSim(trades, startBal, riskFrac, targetDays, origDurDays, capsOverride) {
  if (!trades || !trades.length || origDurDays <= 0 || startBal <= 0) return null;
  const n = trades.length, steps = Math.round(n * targetDays / origDurDays);
  if (steps <= 0) return startBal;
  let bal = startBal;
  for (let i = 0; i < steps; i++) {
    if (bal <= 0) break;
    const t = trades[i % n];
    if (!t.pos || t.pos <= 0) continue;
    const caps = capsOverride ?? ((t.period != null && t.period >= 150) ? PROJ_CAPS_15M : PROJ_CAPS_5M);
    const cap  = caps[t.crypto] ?? 500;
    const bet  = Math.min(bal * riskFrac, cap);
    bal += bet * (t.pnl / t.pos);
  }
  return parseFloat(bal.toFixed(2));
}

function renderResults(r, params) {
  const panel = document.getElementById('results-panel');
  const html  = [];
  const p = r.params || {};

  const proj = r.projections || {};
  const c = proj.combined, m5 = proj.pm5m, m15 = proj.pm15m;
  const kalTop = r.autoscanKalshi;
  const hasKalProj = kalTop && kalTop.durDays > 0 && kalTop.pnl != null;
  const customDay = params.day;
  const pmTrades  = r.unified?.trades || [];
  const riskFrac  = (p.riskPct || 10) / 100;
  const dur = c ? c.durDays : (kalTop?.durDays || 0);

  const pm5mTrades  = pmTrades.filter(t => t.period < 150);
  const pm15mTrades = pmTrades.filter(t => t.period >= 150);
  const cProjBal = (trades, days) => projLoopSim(trades, p.startBal || 0, riskFrac, days, dur);
  const cProjPnl = (trades, days) => { const b = cProjBal(trades, days); return b != null ? parseFloat((b - (p.startBal || 0)).toFixed(2)) : null; };
  const compPnlPM = pmTrades.length && c ? cProjPnl(pmTrades, dur) : null;
  const rawPnl5m  = pm5mTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const rawPnl15m = pm15mTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const rawPnlTot = rawPnl5m + rawPnl15m;
  const share5mPM = rawPnlTot !== 0 ? rawPnl5m / rawPnlTot : 0.5;
  const splitProj = (v) => {
    if (v == null) return [null, null];
    const a5 = parseFloat((v * share5mPM).toFixed(2));
    return [a5, parseFloat((v - a5).toFixed(2))];
  };
  const [compPnl5m, compPnl15m] = splitProj(compPnlPM);

  const fixedBet  = Math.max(1, (p.startBal || 0) * riskFrac);
  const _fixedPnl = (trades) => parseFloat(trades.reduce((sum, t) => {
    if (!t.pos || t.pos <= 0) return sum;
    const caps = (t.period >= 150) ? PROJ_CAPS_15M : PROJ_CAPS_5M;
    const bet  = Math.min(fixedBet, caps[t.crypto] ?? 500);
    return sum + bet * (t.pnl / t.pos);
  }, 0).toFixed(2));

  const uniFixPnl5m = {}, uniFixPnl15m = {};
  if (pmTrades.length) {
    for (const crypto of ['BTC','ETH','SOL','XRP']) {
      const fbPnl = (ts, caps) => parseFloat(ts.reduce((s, t) => {
        if (!t.pos || t.pos <= 0) return s;
        return s + Math.min(fixedBet, caps[crypto] ?? 500) * (t.pnl / t.pos);
      }, 0).toFixed(2));
      const t5  = pmTrades.filter(t => t.crypto === crypto && t.period < 150);
      const t15 = pmTrades.filter(t => t.crypto === crypto && t.period >= 150);
      if (t5.length)  uniFixPnl5m[crypto]  = fbPnl(t5,  PROJ_CAPS_5M);
      if (t15.length) uniFixPnl15m[crypto] = fbPnl(t15, PROJ_CAPS_15M);
    }
  }

  const kalTrades = kalTop?.trades || [], kalDurTop = kalTop?.durDays || 0;
  const cKalProjBal = (days) => projLoopSim(kalTrades, p.startBal || 0, riskFrac, days, kalDurTop, PROJ_CAPS_KAL);
  const cKalProjPnl = (days) => { const b = cKalProjBal(days); return b != null ? parseFloat((b - (p.startBal || 0)).toFixed(2)) : null; };
  const fb  = r.unified?.finalBalance, pnl = r.unified?.pnl, dur0 = dur, u = r.unified;
  const compPnlClr = pnl != null ? (pnl >= 0 ? '#68d391' : '#fc8181') : '#e2e8f0';
  const compGainStr = pnl != null ? `${pnl >= 0 ? '+' : ''}$${pnl.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} \u00b7 ${dur0.toFixed(1)}d` : '';
  const _deferred = []; // Run Parameters + Multi-bot deferred — pushed just before trade history

  // 5. Run Parameters (rendered just before trade history)
  _deferred.push(`<div class="result-card">
    <h3>Run Parameters</h3>
    <div class="params-bar">
      <div class="p">Risk <span>${p.riskPct}%</span></div>
      <div class="p">Slip <span>${p.slip}\u00a2</span></div>
      <div class="p">Price <span>${p.minCents}\u00a2\u2013${p.maxCents}\u00a2</span></div>
      <div class="p">Body <span>${p.body}%</span></div>
      ${params.th != null ? `<div class="p">Threshold <span>${params.th}%</span></div>` : (p.th ? `<div class="p" title="Best threshold found by autoscan">Best th <span>${p.th}%</span></div>` : '')}
      ${p.maxPos ? `<div class="p">MaxPos <span>${p.maxPos}</span></div>` : ''}
      <div class="p">Dir <span>${params.dir === 'down' ? '\u2198 DOWN' : params.dir === 'up' ? '\u2197 UP' : '\u2195 Both'}</span></div>
      ${params.coord != null ? `<div class="p">Coord <span>\u2265${params.coord}</span></div>` : '<div class="p">Coord <span style="color:#4a5568">OFF</span></div>'}
      ${params.skipHours != null ? `<div class="p">Skip h <span>${params.skipHours}</span></div>` : ''}
      ${params.skipDow   != null ? `<div class="p">Skip day <span>${params.skipDow}</span></div>` : ''}
      ${(params.bots > 1) ? `<div class="p">Bots <span>${params.bots}</span></div>` : ''}
    </div>
    ${fb != null ? `<div class="balance-strip">
      <div class="bs-block"><div class="bs-label">Start</div><div class="bs-val" style="color:#e2e8f0">$${p.startBal}</div></div>
      <div class="bs-line"><div class="bs-arrow"></div><div class="bs-gain" style="color:${compPnlClr}">${compGainStr}</div></div>
      <div class="bs-block" style="text-align:right"><div class="bs-label">Backtest final (compound)</div><div class="bs-val" style="color:${compPnlClr}">${fb != null ? '$'+fb.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '\u2014'}</div></div>
    </div>` : ''}
  </div>`);

  // ── 1b. Multi-bot results ─────────────────────────────────────────────────────
  if (r.bots && r.bots.length > 1) {
    const totalStart = r.bots.reduce((s, b) => s + b.startBal, 0);
    const totalFinal = r.bots.reduce((s, b) => s + b.finalBal, 0);
    const totalPnl   = r.bots.reduce((s, b) => s + b.pnl, 0);
    const pnlClr = c => c >= 0 ? '#68d391' : '#fc8181';
    const fmt = v => `${v >= 0 ? '+' : ''}$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const fmtBal = v => `$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const rows = r.bots.map(b => `
      <tr>
        <td style="color:#a0aec0">Bot ${b.id}</td>
        <td>${fmtBal(b.startBal)}</td>
        <td style="color:${pnlClr(b.pnl)};font-weight:700">${fmtBal(b.finalBal)}</td>
        <td style="color:#68d391">${b.wins}</td>
        <td style="color:#fc8181">${b.losses}</td>
        <td style="color:${pnlClr(b.pnl)};font-weight:700">${fmt(b.pnl)}</td>
      </tr>`).join('');
    _deferred.push(`<div class="result-card">
      <h3>Multi-Bot Results <span style="color:#718096;font-size:11px;font-weight:400">(${r.bots.length} wallets)</span></h3>
      <table class="result-table" style="width:100%">
        <thead><tr><th>Wallet</th><th>Start</th><th>Final</th><th style="color:#68d391">W</th><th style="color:#fc8181">L</th><th>PnL</th></tr></thead>
        <tbody>
          ${rows}
          <tr style="border-top:1px solid #2d3748;font-weight:700">
            <td style="color:#e2e8f0">TOTAL</td>
            <td>${fmtBal(totalStart)}</td>
            <td style="color:${pnlClr(totalPnl)}">${fmtBal(totalFinal)}</td>
            <td style="color:#68d391">${r.bots[0].wins} <span style="color:#4a5568;font-size:10px;">×${r.bots.length}</span></td>
            <td style="color:#fc8181">${r.bots[0].losses} <span style="color:#4a5568;font-size:10px;">×${r.bots.length}</span></td>
            <td style="color:${pnlClr(totalPnl)};font-weight:700">${fmt(totalPnl)}</td>
          </tr>
        </tbody>
      </table>
    </div>`);
  }

  // 2. Projected Revenue
  if ((c && dur > 0) || hasKalProj) {
    const botMult = (r.bots?.length > 1) ? r.bots.length : 1;
    const cProjPnlT = (trades, days) => {
      if (botMult <= 1) return cProjPnl(trades, days);
      let total = 0;
      for (const bot of r.bots) {
        const b = projLoopSim(trades, bot.startBal, riskFrac, days, dur);
        if (b == null) return null;
        total += b - bot.startBal;
      }
      return parseFloat(total.toFixed(2));
    };
    const cKalProjPnlT = (days) => {
      if (botMult <= 1) return cKalProjPnl(days);
      let total = 0;
      for (const bot of r.bots) {
        const b = projLoopSim(kalTrades, bot.startBal, riskFrac, days, kalDurTop);
        if (b == null) return null;
        total += b - bot.startBal;
      }
      return parseFloat(total.toFixed(2));
    };
    const compPnlPMT = botMult > 1 ? cProjPnlT(pmTrades, dur) : compPnlPM;
    const [compPnl5mT, compPnl15mT] = splitProj(compPnlPMT);
    const totalStartBal = botMult > 1 ? r.bots.reduce((s, b) => s + b.startBal, 0) : (p.startBal || 0);
    const pmClr  = (compPnlPMT ?? 0) >= 0 ? '#68d391' : '#fc8181';
    const kalClr = (kalTop?.pnl ?? 0) >= 0 ? '#63b3ed' : '#fc8181';
    const fmtPnl = (v) => v != null ? `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}` : '\u2014';
    const fmtBal = (v) => v != null ? '$'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '\u2014';

    const row5 = (m5 && c && compPnl5mT != null) ? (() => {
      const [s1] = splitProj(cProjPnlT(pmTrades, 1));
      const [s7] = splitProj(cProjPnlT(pmTrades, 7));
      const [s30] = splitProj(cProjPnlT(pmTrades, 30));
      return `<tr class="proj-sub"><td>\u21b3 PM(5m)</td><td>${fmtPnl(compPnl5mT)}</td><td>${fmtProj(s1)}</td><td>${fmtProj(s7)}</td><td>${fmtProj(s30)}</td>${customDay ? `<td>${fmtProj(splitProj(cProjPnlT(pmTrades, customDay))[0])}</td>` : ''}</tr>`;
    })() : '';
    const row15 = (m15 && c && compPnl15mT != null) ? (() => {
      const [,r1] = splitProj(cProjPnlT(pmTrades, 1));
      const [,r7] = splitProj(cProjPnlT(pmTrades, 7));
      const [,r30] = splitProj(cProjPnlT(pmTrades, 30));
      return `<tr class="proj-sub"><td>\u21b3 PM(15m)</td><td>${fmtPnl(compPnl15mT)}</td><td>${fmtProj(r1)}</td><td>${fmtProj(r7)}</td><td>${fmtProj(r30)}</td>${customDay ? `<td>${fmtProj(splitProj(cProjPnlT(pmTrades, customDay))[1])}</td>` : ''}</tr>`;
    })() : '';
    const sepRow = (row5 || row15) ? '<tr class="sep"><td colspan="99"></td></tr>' : '';
    const pmTotalRow = (c && compPnlPMT != null) ? `<tr class="total">
      <td style="color:${pmClr}">PM(5m+15m)</td><td><span style="color:${pmClr}">${fmtPnl(compPnlPMT)}</span></td>
      <td>${fmtProj(cProjPnlT(pmTrades, 1))}</td><td>${fmtProj(cProjPnlT(pmTrades, 7))}</td><td>${fmtProj(cProjPnlT(pmTrades, 30))}</td>
      ${customDay ? `<td>${fmtProj(cProjPnlT(pmTrades, customDay))}</td>` : ''}
    </tr>` : '';
    const rowKal = hasKalProj ? `<tr class="total" style="background:#111a26">
      <td style="color:${kalClr}">Kalshi(15m)</td><td><span style="color:${kalClr}">${fmtPnl(cKalProjPnlT(kalDurTop))}</span></td>
      <td>${fmtProj(cKalProjPnlT(1))}</td><td>${fmtProj(cKalProjPnlT(7))}</td><td>${fmtProj(cKalProjPnlT(30))}</td>
      ${customDay ? `<td>${fmtProj(cKalProjPnlT(customDay))}</td>` : ''}
    </tr>` : '';

    const totalBox = (compPnlPMT != null) ? (() => {
      const title = hasKalProj ? 'Total (PM + Kalshi)' : 'Total (PM)';
      const btTotal = parseFloat(((compPnlPMT || 0) + (cKalProjPnlT(kalDurTop) || 0)).toFixed(2));
      const sign = btTotal >= 0 ? '+' : '';
      const mkChip = (days, isMain) => {
        const pmProj = cProjPnlT(pmTrades, days) ?? 0;
        const kalProj = cKalProjPnlT(days) ?? 0;
        const v = parseFloat((pmProj + kalProj).toFixed(2));
        const vClr = v >= 0 ? '#68d391' : '#fc8181';
        const vStr = (v >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(v)).toLocaleString();
        const dStr = Number.isInteger(days) ? `${days}` : `${days.toFixed(1)}`;
        const lbl = days === 1 ? '24 HOURS' : `${dStr} DAYS<br><span style="font-size:9px;font-weight:700;color:#cbd5e0;letter-spacing:.02em">${projDate(days)}</span>`;
        return `<div class="proj-chip${isMain ? ' proj-chip-main' : ''}"><div class="proj-chip-val" style="color:${vClr}">${vStr}</div><div class="proj-chip-lbl">${lbl}</div></div>`;
      };
      const bal30T = cProjBal(pmTrades, 30);
      const balStr = bal30T != null ? ` \u2192 ${fmtBal(bal30T)} (30d)` : '';
      const durD = parseFloat(dur.toFixed(1));
      const mkDurChip = () => {
        const pmProj = cProjPnlT(pmTrades, durD) ?? 0, kalProj = cKalProjPnlT(durD) ?? 0;
        const v = parseFloat((pmProj + kalProj).toFixed(2));
        const vClr = v >= 0 ? '#68d391' : '#fc8181';
        const vStr = (v >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(v)).toLocaleString();
        const lbl = `${durD}d <span style="color:#f6ad55;font-weight:700">(LOG)</span><br><span style="font-size:9px;font-weight:700;color:#cbd5e0;letter-spacing:.02em">${projDate(durD)}</span>`;
        return `<div class="proj-chip"><div class="proj-chip-val" style="color:${vClr}">${vStr}</div><div class="proj-chip-lbl">${lbl}</div></div>`;
      };
      const durChip = (durD > 8.5 && Math.abs(durD - 30) > 1.5) ? mkDurChip() : '';
      return `<div class="proj-total-box">
        <div class="proj-total-hdr"><span class="proj-total-title">${title}</span><span class="proj-total-sub">${sign}$${Math.abs(Math.round(btTotal)).toLocaleString()} in ${dur.toFixed(1)}d${balStr}</span></div>
        <div class="proj-chips">${mkChip(1, false)}${mkChip(7, false)}${durD < 28.5 ? durChip : ''}${mkChip(30, true)}${durD >= 28.5 ? durChip : ''}${customDay ? mkChip(customDay, false) : ''}</div>
      </div>`;
    })() : '';

    const _statsRow = u ? (() => {
      const _durStr = u.durDays != null ? `${u.durDays.toFixed(1)}d` : '\u2014';
      const _wrClr  = u.winRate >= 0.9 ? '#68d391' : u.winRate >= 0.8 ? '#63b3ed' : '#fc8181';
      const _cbCell    = (u.cbSkipped    > 0) ? `<th>CB Skip</th>`   : '';
      const _volCell   = (u.volSkipped   > 0) ? `<th>Vol Skip</th>`  : '';
      const _coordCell = (u.coordSkipped > 0) ? `<th>Coord</th>`     : '';
      const _cbData    = (u.cbSkipped    > 0) ? `<td style="color:#f6ad55;font-weight:700">\u23f8 ${u.cbSkipped}</td>` : '';
      const _volData   = (u.volSkipped   > 0) ? `<td style="color:#63b3ed;font-weight:700">\uD83D\uDCCA ${u.volSkipped}</td>` : '';
      const _coordData = (u.coordSkipped > 0) ? `<td style="color:#68d391;font-weight:700">\uD83D\uDD17 ${u.coordSkipped}</td>` : '';
      return `<div class="stats-row-wrap"><table class="stats-row-table">
        <thead><tr><th>Trades</th><th>Wins</th><th>Losses</th><th>Win Rate</th><th>Duration</th><th>Avg PnL/Trade</th>${_cbCell}${_volCell}${_coordCell}</tr></thead>
        <tbody><tr>
          <td>${u.total ?? (u.wins + u.losses)}</td>
          <td style="color:#68d391;font-weight:700">${u.wins}</td>
          <td style="color:#fc8181;font-weight:700">${u.losses}</td>
          <td style="color:${_wrClr};font-weight:700">${fmtWR(u.winRate)}</td>
          <td>${_durStr}</td>
          <td>${u.pnl != null && u.total > 0 ? (u.pnl/(u.wins+u.losses) >= 0 ? '+' : '') + '$'+(u.pnl/(u.wins+u.losses)).toFixed(2) : '\u2014'}</td>
          ${_cbData}${_volData}${_coordData}
        </tr></tbody>
      </table></div>`;
    })() : '';
    html.push(`<div class="result-card">
      <h3>Projected Revenue <span class="badge">compound ${p.riskPct}% \u00b7 ${dur.toFixed(1)}d</span></h3>
      ${_statsRow}
      <div class="proj-table-wrap"><table class="proj-table">
        <thead><tr><th>Strategy</th><th>Backtest PnL</th><th>\u2192 24h</th><th>\u2192 7d<br><span style="font-weight:700;font-size:10px;color:#cbd5e0">${projDate(7)}</span></th><th>\u2192 30d<br><span style="font-weight:700;font-size:10px;color:#cbd5e0">${projDate(30)}</span></th>${customDay ? `<th>\u2192 ${customDay}d<br><span style="font-weight:700;font-size:10px;color:#cbd5e0">${projDate(customDay)}</span></th>` : ''}</tr></thead>
        <tbody>${row5}${row15}${sepRow}${pmTotalRow}${rowKal}</tbody>
      </table></div>
      ${totalBox}
      <p style="font-size:10px;color:#4a5568;margin-top:10px">Compound ${p.riskPct}% of current balance. Trades looped cyclically, capped per crypto (BTC $1K \u00b7 ETH $500 \u00b7 SOL/XRP 5m $150 \u00b7 15m $500).</p>
    </div>`);
  }

  // 3. Autoscan trios
  html.push(renderAutoscanSection(r.autoscan5m,  '5-Min Autoscan (Polymarket)', false, uniFixPnl5m));
  html.push(renderAutoscanSection(r.autoscan15m, '15-Min Autoscan (Polymarket)', false, uniFixPnl15m));
  if (r.autoscanKalshi) html.push(renderAutoscanSection(r.autoscanKalshi, '15-Min Autoscan (Kalshi)', true));

  // 4. Triomap
  if (r.triomap) {
    html.push(`<div class="result-card">
      <h3>Suggested Triomap</h3>
      <div class="triomap-box" onclick="copyTriomap(this)">${r.triomap}</div>
      <div class="triomap-copy-hint">Click to copy \u00b7 paste into LIVE engine or -triomap flag</div>
    </div>`);
  }

  // 5. T0 / T1 / TC tier breakdown
  if (u && pmTrades.length > 0) {
    const TIERS = [
      { key: 'T0', label: 'T0',    color: '#e2e8f0' },
      { key: 'T1', label: 'T1',    color: '#63b3ed' },
      { key: 'TC', label: 'TC',    color: '#b794f4' },
    ];
    const tierRows = TIERS.map(({ key, label, color }) => {
      const ts  = pmTrades.filter(t => (t.label || 'T0') === key);
      if (!ts.length) return null;
      const w   = ts.filter(t => t.outcome === 'WIN').length;
      const l   = ts.filter(t => t.outcome === 'LOSS').length;
      const wr  = ts.length ? w / ts.length : null;
      const pnl = ts.reduce((s, t) => s + (t.pnl || 0), 0);
      const avgEntry = ts.length ? ts.reduce((s, t) => s + (t.entry || 0), 0) / ts.length : null;
      const wrStr  = wr != null ? `<span style="color:${wr >= 0.9 ? '#68d391' : wr >= 0.8 ? '#f6ad55' : '#fc8181'}">${(wr*100).toFixed(1)}%</span>` : '—';
      const pnlStr = `<span style="color:${pnl >= 0 ? '#68d391' : '#fc8181'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span>`;
      return `<tr style="border-bottom:1px solid #2d3748">
        <td style="padding:7px 10px;font-weight:700;color:${color}">${label}</td>
        <td style="padding:7px 10px;text-align:center">${ts.length}</td>
        <td style="padding:7px 10px;text-align:center"><span style="color:#68d391">${w}W</span> / <span style="color:#fc8181">${l}L</span></td>
        <td style="padding:7px 10px;text-align:center">${wrStr}</td>
        <td style="padding:7px 10px;text-align:center;color:#a0aec0">${avgEntry != null ? avgEntry.toFixed(0)+'¢' : '—'}</td>
        <td style="padding:7px 10px;text-align:right">${pnlStr}</td>
      </tr>`;
    }).filter(Boolean);

    if (tierRows.length > 0) {
      // Total row
      const tw = pmTrades.filter(t => t.outcome === 'WIN').length;
      const tl = pmTrades.filter(t => t.outcome === 'LOSS').length;
      const tpnl = pmTrades.reduce((s, t) => s + (t.pnl || 0), 0);
      const twr  = pmTrades.length ? tw / pmTrades.length : null;
      const twrStr  = twr != null ? `<span style="color:${twr >= 0.9 ? '#68d391' : twr >= 0.8 ? '#f6ad55' : '#fc8181'}">${(twr*100).toFixed(1)}%</span>` : '—';
      const tpnlStr = `<span style="color:${tpnl >= 0 ? '#68d391' : '#fc8181'}">${tpnl >= 0 ? '+' : ''}$${tpnl.toFixed(2)}</span>`;
      const totalRow = `<tr style="border-top:2px solid #4a5568;background:#1a202c">
        <td style="padding:7px 10px;font-weight:700;color:#718096">Total</td>
        <td style="padding:7px 10px;text-align:center;font-weight:600">${pmTrades.length}</td>
        <td style="padding:7px 10px;text-align:center"><span style="color:#68d391">${tw}W</span> / <span style="color:#fc8181">${tl}L</span></td>
        <td style="padding:7px 10px;text-align:center">${twrStr}</td>
        <td style="padding:7px 10px;text-align:center;color:#4a5568">—</td>
        <td style="padding:7px 10px;text-align:right">${tpnlStr}</td>
      </tr>`;
      html.push(`<div class="result-card">
        <h3>Tier Breakdown</h3>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="border-bottom:2px solid #4a5568;color:#718096;font-size:11px;text-transform:uppercase;letter-spacing:.05em">
            <th style="padding:6px 10px;text-align:left">Tier</th>
            <th style="padding:6px 10px;text-align:center">Trades</th>
            <th style="padding:6px 10px;text-align:center">W / L</th>
            <th style="padding:6px 10px;text-align:center">WR</th>
            <th style="padding:6px 10px;text-align:center">Avg Entry</th>
            <th style="padding:6px 10px;text-align:right">PnL</th>
          </tr></thead>
          <tbody>${tierRows.join('')}${totalRow}</tbody>
        </table></div>
      </div>`);
    }
  }

  // 6. Run Parameters + Multi-bot (deferred from top sections)
  for (const _d of _deferred) html.push(_d);

  // 7. Trade history
  if (u && u.trades && u.trades.length > 0) {
    const trades = u.trades.slice().reverse();
    const tradeRows = trades.map((t, i) => {
      const alt    = i % 2 === 1 ? ' alt' : '';
      const isWin  = t.outcome === 'WIN', isLoss = t.outcome === 'LOSS';
      const outCls = isWin ? 'win' : isLoss ? 'loss' : 'gold';
      const pnlStr = isWin ? `<span class="win">+$${t.pnl.toFixed(2)}</span>` : `<span class="loss">-$${Math.abs(t.pnl).toFixed(2)}</span>`;
      const dirStr = t.direction === 'UP' ? '<span class="dir-up">\u25b2 UP</span>' : '<span class="dir-down">\u25bc DN</span>';
      const perChip = t.period ? (t.period >= 150 ? '<span class="badge-15m">15m</span>' : '<span class="badge-5m">5m</span>') : '<span class="dim">\u2014</span>';
      const lbl = t.label === 'T1' ? '<span class="blue">T1</span>' : t.label === 'TC' ? '<span style="color:#b794f4">TC</span>' : 'T0';
      return `<tr class="tr${alt}">
        <td>${t.time || '\u2014'}</td><td class="${cryptoCls(t.crypto)}">${t.crypto}</td><td>${perChip}</td><td>${lbl}</td>
        <td>${dirStr}</td><td>${t.entry != null ? t.entry.toFixed(0)+'\u00a2' : '\u2014'}</td>
        <td>$${(t.pos||0).toFixed(2)}</td><td class="gold">${t.spikePct != null ? Math.abs(t.spikePct).toFixed(2)+'%' : '\u2014'}</td>
        <td class="${outCls} bold">${t.outcome}</td><td>${pnlStr}</td><td>$${t.balance.toFixed(2)}</td>
      </tr>`;
    }).join('');
    const durStr = u.durDays != null ? `${u.durDays.toFixed(1)}d` : '\u2014';
    html.push(`<div class="result-card">
      <h3>Trade History <span class="badge">${u.wins}W / ${u.losses}L \u00b7 ${fmtWR(u.winRate)} \u00b7 ${durStr}</span></h3>
      <div style="overflow-x:auto"><table class="result-table">
        <thead><tr><th>Time</th><th>Crypto</th><th>Mkt</th><th>Lbl</th><th>Dir</th><th>Entry</th><th>Bet</th><th>Spike</th><th>Result</th><th>PnL</th><th>Balance</th></tr></thead>
        <tbody>${tradeRows}</tbody>
      </table></div>
    </div>`);
  }

  panel.innerHTML = html.join('');
}

function copyTriomap(el) {
  navigator.clipboard.writeText(el.textContent.trim()).then(() => showToast('Copied!'));
}
function showToast(msg) {
  const t = document.getElementById('copy-toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ── Load saved settings on page load ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  updateRunLabel();
  try {
    const s = await PolyChampAPI.request('GET', '/simulator/v2/settings');
    applySettings(s);
  } catch {}
  try {
    const d = await PolyChampAPI.request('GET', '/simulator/last-result');
    if (d && d.result) {
      lastSimResult = d.result;
      renderResults(d.result, d.params || {});
      const ts = d.ts ? new Date(d.ts).toLocaleString() : null;
      if (ts) {
        const panel = document.getElementById('results-panel');
        const banner = document.createElement('div');
        banner.style.cssText = 'font-size:11px;color:#4a5568;text-align:right;margin-bottom:-8px';
        banner.textContent = `Last run: ${ts}`;
        panel.prepend(banner);
      }
    }
  } catch {}
});
</script>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
