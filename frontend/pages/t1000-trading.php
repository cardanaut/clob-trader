<?php
$page  = 't1000-trading';
$title = 'T1000 Trading';
require_once __DIR__ . '/../includes/header.php';
?>

<style>
/* ── T1000 Page Styles ─────────────────────────────────────────────────────── */
.t1000-header {
  margin-bottom: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.t1000-header-text h1 {
  font-size: 26px;
  font-weight: 700;
  color: #e2e8f0;
  margin: 0 0 4px 0;
}
.t1000-header-text p {
  color: #718096;
  font-size: 13px;
  margin: 0;
}

/* ── Main tabs ──────────────────────────────────────────────────────────────── */
.t1000-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid #2d3748;
  padding-bottom: 0;
}
.t1000-tab {
  padding: 10px 22px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: #718096;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 6px 6px 0 0;
}
.t1000-tab:hover { color: #cbd5e0; }
.t1000-tab.active {
  color: #63b3ed;
  border-bottom-color: #63b3ed;
}
.t1000-tab .tab-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 10px;
  background: #2d3748;
  margin-left: 6px;
  vertical-align: middle;
}
.t1000-tab.tab-live .tab-badge { background: #2f855a; color: #68d391; }

/* ── Tab panel ──────────────────────────────────────────────────────────────── */
.t1000-panel { display: none; }
.t1000-panel.active { display: block; }

/* ── Log sub-tabs (inside LIVE / KALSHI panels) ─────────────────────────────── */
.log-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #2d3748;
  padding-bottom: 0;
  margin-top: 8px;
  flex-wrap: wrap;
}
.log-tab {
  padding: 7px 16px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: #718096;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 6px 6px 0 0;
  white-space: nowrap;
}
.log-tab:hover { color: #cbd5e0; }
.log-tab.active { color: #63b3ed; border-bottom-color: #63b3ed; }
.ltab-content { padding-top: 8px; }

/* ── Signal Stats charts ─────────────────────────────────────────────────────── */
.sstats-section { margin-bottom: 14px; }
.sstats-section-label { font-size: 10px; font-weight: 700; color: #4a5568; text-transform: uppercase;
  letter-spacing: .08em; margin-bottom: 6px; }
.sstats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
.sstats-pair { }
.sstats-pair-label { font-size: 10px; font-weight: 700; color: #a0aec0; margin-bottom: 3px;
  text-align: center; }
.sstats-charts { display: flex; flex-direction: column; gap: 3px; }
.sstats-chart-wrap { position: relative; }
.sstats-chart-title { font-size: 9px; color: #4a5568; font-weight: 600; position: absolute;
  top: 3px; left: 4px; pointer-events: none; }
.sstats-chart-wrap svg { display: block; width: 100%; height: auto; border-radius: 3px; }

/* ── Strategy card ──────────────────────────────────────────────────────────── */
.strat-card {
  background: #1a202c;
  border: 1px solid #2d3748;
  border-radius: 10px;
  padding: 20px 24px;
  margin-bottom: 16px;
}

/* ── Controls row ───────────────────────────────────────────────────────────── */
.controls-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
}

/* Enable toggle */
.toggle-wrap { display: flex; align-items: center; gap: 10px; }
.toggle-label { font-size: 13px; color: #a0aec0; }
.toggle-switch {
  position: relative; display: inline-block; width: 44px; height: 24px;
}
.toggle-switch input { display: none; }
.toggle-slider {
  position: absolute; inset: 0; background: #2d3748; border-radius: 12px;
  cursor: pointer; transition: 0.2s;
}
.toggle-slider:before {
  content: ''; position: absolute; width: 18px; height: 18px;
  left: 3px; top: 3px; background: #a0aec0; border-radius: 50%; transition: 0.2s;
}
input:checked + .toggle-slider { background: #2f855a; }
input:checked + .toggle-slider:before { transform: translateX(20px); background: #68d391; }

/* Threshold input */
.threshold-wrap { display: flex; align-items: center; gap: 8px; }
.threshold-wrap label { font-size: 13px; color: #a0aec0; }
.threshold-wrap input {
  width: 72px; padding: 6px 10px; border: 1px solid #4a5568;
  background: #2d3748; color: #e2e8f0; border-radius: 6px; font-size: 13px;
  text-align: center;
}
.threshold-wrap input:focus { outline: none; border-color: #63b3ed; }
/* Dark base for all number inputs in live-section (outside .threshold-wrap) */
.live-section input[type="number"] {
  background: #2d3748; color: #e2e8f0; border: 1px solid #4a5568; border-radius: 6px;
}
.live-section input[type="number"]:focus { outline: none; border-color: #63b3ed; }

/* Strategy selector (LIVE only) */
.strat-select-wrap { display: flex; align-items: center; gap: 8px; }
.strat-select-wrap label { font-size: 13px; color: #a0aec0; }
.strat-select-wrap select {
  padding: 6px 10px; border: 1px solid #4a5568; background: #2d3748;
  color: #e2e8f0; border-radius: 6px; font-size: 13px;
}

/* Save button */
.btn-save {
  padding: 7px 16px; border-radius: 6px; border: 1px solid #4a5568;
  background: #2d3748; color: #cbd5e0; font-size: 13px; cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.btn-save:hover { background: #4a5568; }
.btn-save.saved { background: #276749; border-color: #48bb78; color: #9ae6b4; cursor: default; }
.btn-save.error { background: #742a2a; border-color: #fc8181; color: #feb2b2; cursor: default; }

/* Reset button */
.btn-reset {
  padding: 7px 14px; border-radius: 6px; border: 1px solid #744210;
  background: transparent; color: #f6ad55; font-size: 12px; cursor: pointer;
  margin-left: auto; transition: all 0.15s;
}
.btn-reset:hover { background: #744210; }

/* ── Stats bar ───────────────────────────────────────────────────────────────── */
.stats-bar {
  display: flex;
  gap: 24px;
  padding: 14px 0;
  border-top: 1px solid #2d3748;
  border-bottom: 1px solid #2d3748;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.stat-item { display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 11px; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-value { font-size: 20px; font-weight: 700; color: #e2e8f0; }
.stat-value.green { color: #68d391; }
.stat-value.red   { color: #fc8181; }
.stat-value.grey  { color: #718096; }
.stat-sub { font-size: 11px; color: #4a5568; margin-top: 1px; }

/* ── Live candles mini-bar ───────────────────────────────────────────────────── */
.candle-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.candle-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; background: #2d3748; border-radius: 6px;
  font-size: 12px; color: #a0aec0; font-family: monospace;
}
.candle-chip .sym { color: #e2e8f0; font-weight: 700; }
.candle-chip .spike { font-weight: 700; }
.candle-chip .spike.up { color: #68d391; }
.candle-chip .spike.dn { color: #fc8181; }

/* ── Activity log ────────────────────────────────────────────────────────────── */
.activity-log {
  max-height: 400px;
  overflow-y: auto;
}
.activity-log table {
  width: 100%; border-collapse: collapse; font-size: 12px;
}
.activity-log th {
  text-align: left; padding: 8px 10px; color: #718096;
  text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;
  border-bottom: 1px solid #2d3748; position: sticky; top: 0; background: #1a202c;
}
.activity-log td {
  padding: 7px 10px; border-bottom: 1px solid #1a202c; color: #cbd5e0;
}
.activity-log tr:hover td { background: #2d3748; }
.badge {
  display: inline-block; padding: 2px 7px; border-radius: 10px;
  font-size: 10px; font-weight: 700;
}
.badge-win    { background: #276749; color: #68d391; }
.badge-loss   { background: #742a2a; color: #fc8181; }
.badge-open   { background: #1a3a38; color: #4fd1c5; }
.badge-skip   { background: #2d3748; color: #718096; }
.badge-failed { background: #3d3d3d; color: #a0aec0; }
/* Live balance row */
.live-balance-row { display:flex; gap:0; padding:10px 0 8px; border-bottom:1px solid #2d3748; margin-bottom:6px; align-items:center; }
.bal-item { flex:0 0 auto; text-align:center; padding:2px 14px; }
.bal-item.total { border-right:2px solid #4a5568; padding-right:20px; margin-right:6px; }
.bal-item.stat-sep { border-left:2px solid #4a5568; padding-left:20px; margin-left:6px; }
.bal-label { font-size:10px; color:#718096; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:3px; }
.bal-value { font-size:22px; font-weight:700; color:#e2e8f0; }
.bal-value.locked   { color:#ed8936; }
.bal-value.redeemable { color:#63b3ed; }
.bal-value.vtotal   { color:#68d391; }
.badge-5m  { background: #1a3a2a; color: #68d391; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; white-space: nowrap; }
.badge-15m { background: #261a3a; color: #b794f4; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; white-space: nowrap; }
.dir-up   { color: #63b3ed; font-weight: 700; }
.dir-down { color: #f6ad55; font-weight: 700; }
.date-separator td {
  text-align: center; color: #4a5568; font-size: 10px; letter-spacing: 0.06em;
  padding: 5px 0 2px; border-bottom: none; text-transform: uppercase;
}
.date-separator td::before { content: '── '; }
.date-separator td::after  { content: ' ──'; }
.empty-log {
  text-align: center; padding: 40px; color: #4a5568; font-size: 13px;
}
.skip-counter {
  font-size: 11px; color: #718096; padding: 6px 10px 4px;
  border-bottom: 1px solid #2d3748; margin-bottom: 0;
}
.new-badge {
  display: none; background: #c53030; color: #fff;
  font-size: 10px; font-weight: 700; padding: 1px 5px;
  border-radius: 10px; margin-left: 5px; vertical-align: middle;
  min-width: 16px; text-align: center;
}

/* ── SETUP compact per-crypto row ───────────────────────────────────────────── */
.setup-crypto-row {
  display:flex; flex-wrap:wrap; align-items:center; gap:4px 6px;
  margin:6px 0; padding:5px 8px; background:#1a2035; border-radius:4px;
}
.scr-lbl  { font-size:12px; font-weight:700; color:#e2e8f0; }
.scr-th   { width:52px; text-align:center; padding:2px 4px;
            background:#2d3748; border:1px solid #4a5568; color:#e2e8f0;
            border-radius:3px; font-size:12px; }
.scr-unit { font-size:11px; color:#718096; }
.scr-sep  { font-size:14px; color:#4a5568; margin:0 4px; }
.scr-sel  { padding:2px 4px; background:#2d3748; border:1px solid #4a5568;
            color:#e2e8f0; border-radius:3px; font-size:12px; }

/* ── Per-crypto threshold row ────────────────────────────────────────────────── */
.per-crypto-thresholds {
  display: flex; align-items: center; gap: 8px; margin-top: 6px;
  padding: 5px 8px; background: #1a2035; border-radius: 4px; flex-wrap: wrap;
}
.per-crypto-thresholds .pct-label { font-size: 11px; color: #718096; margin-right: 4px; }
.per-crypto-thresholds label { font-size: 11px; color: #a0aec0; }
.per-crypto-thresholds input {
  width: 52px; text-align: center; padding: 2px 4px;
  background: #2d3748; border: 1px solid #4a5568; color: #e2e8f0;
  border-radius: 3px; font-size: 12px;
}
.per-crypto-thresholds select.strat-crypto-select {
  padding: 2px 4px; background: #2d3748; border: 1px solid #4a5568;
  color: #e2e8f0; border-radius: 3px; font-size: 12px;
}

/* ── Chart button ────────────────────────────────────────────────────────────── */
.btn-chart {
  padding: 7px 14px; border-radius: 6px; border: 1px solid #2c5282;
  background: transparent; color: #63b3ed; font-size: 12px; cursor: pointer;
  transition: all 0.15s;
}
.btn-chart:hover { background: #2c5282; }
.export-menu-item { padding:7px 14px; cursor:pointer; font-size:12px; color:#e2e8f0; white-space:nowrap; }
.export-menu-item:hover { background:#4a5568; }

/* ── LIVE panel ──────────────────────────────────────────────────────────────── */
.live-enable-bar {
  display: flex; align-items: center; gap: 16px; padding: 12px 16px;
  background: #111827; border-radius: 8px; margin-bottom: 12px;
  border: 1px solid #2d3748;
}
.live-status-text { font-size: 16px; font-weight: 600; flex: 1; color: #fc8181; }
.live-status-text.live-on { color: #68d391; }
.live-section {
  background: #111827; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px;
  border: 1px solid #2d3748;
}
.live-section-title { font-size: 11px; font-weight: 700; color: #718096; margin-bottom: 8px;
  text-transform: uppercase; letter-spacing: 0.06em; }
.live-stats-bar { margin-top: 0; }
.btn-fill {
  background: #2d4a7a; color: #90cdf4; border: 1px solid #3d6a9a;
  padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;
}
.btn-fill:hover { background: #3d5a8a; }
.btn-backfill {
  background: #2d4a3a; color: #68d391; border: 1px solid #3d7a5a;
  padding: 5px 11px; border-radius: 4px; cursor: pointer; font-size: 12px;
}
.btn-backfill:hover { background: #3d5a4a; }
.btn-backfill:disabled { opacity: 0.6; cursor: default; }
.btn-score7d {
  background: #2a3a5a; color: #90cdf4; border: 1px solid #3d5a8a;
  padding: 5px 11px; border-radius: 4px; cursor: pointer; font-size: 12px;
}
.btn-score7d:hover { background: #3d5a8a; }
.btn-score7d:disabled { opacity: 0.6; cursor: default; }
.live-best-cxx { font-size: 11px; color: #718096; margin-top: 5px; padding: 3px 0; }
.live-best-cxx .best-cxx-btn {
  background: #2a4a6a; color: #90cdf4; border: 1px solid #3d6a9a;
  padding: 1px 7px; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 700;
}
.live-best-cxx .best-cxx-btn:hover { background: #3d5a8a; }
.live-best-cxx .best-wr { color: #a0aec0; }

/* ── Live Active Config summary ─────────────────────────────────────────── */
.lac-section { margin-top:14px; background:#0f1623; border:1px solid #2d3748; border-radius:8px; padding:10px 14px; }
.lac-title { font-size:10px; font-weight:700; color:#4a5568; text-transform:uppercase; letter-spacing:.08em; margin-bottom:8px; }
.lac-row { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:6px; align-items:center; }
.lac-row:last-child { margin-bottom:0; }
.lac-tag { font-size:9px; font-weight:700; text-transform:uppercase; background:#2d3748; color:#718096; border-radius:3px; padding:2px 6px; flex-shrink:0; line-height:1.6; }
.lac-chip { background:#1a2335; border:1px solid #2d3748; border-radius:4px; padding:2px 8px; color:#a0aec0; font-size:11px; font-family:monospace; white-space:nowrap; }
.lac-chip.on   { border-color:#276749; color:#68d391; }
.lac-chip.off  { border-color:#2d3748; color:#4a5568; text-decoration:line-through; }
.lac-crypto { display:inline-block; background:#1a2035; border:1px solid #2d3748; border-radius:4px; padding:2px 7px; font-family:monospace; font-size:11px; white-space:nowrap; }
.lac-crypto .cr { color:#63b3ed; font-weight:700; }

/* ── Section bar (LIVE / PAPER) ──────────────────────────────────────────────── */
.t1000-section-bar {
  display: flex; gap: 0; padding: 8px 12px 0; margin-bottom: 0;
}
.section-btn {
  background: #2d3748; border: none; color: #a0aec0;
  padding: 6px 22px; border-radius: 6px 6px 0 0;
  cursor: pointer; font-size: 13px; font-weight: 600;
  border-bottom: 2px solid transparent; margin-right: 4px;
}
.section-btn:hover { color: #cbd5e0; }
.section-btn.active { background: #4a5568; color: #fff; border-bottom-color: #63b3ed; }
.section-dot { margin-left: 4px; }

/* ── Live sub-section ─────────────────────────────────────────────────────────── */
.activity-log-section { margin-top: 10px; }

/* ── Chart modal ─────────────────────────────────────────────────────────────── */
.chart-overlay {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75);
  z-index: 1000; align-items: center; justify-content: center;
}
.chart-overlay.open { display: flex; }
.chart-modal {
  background: #1a202c; border: 1px solid #2d3748; border-radius: 12px;
  width: 92vw; max-width: 1100px; padding: 20px 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}
.chart-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px;
}
.chart-modal-title { font-size: 15px; font-weight: 700; color: #e2e8f0; }
.chart-modal-close {
  background: none; border: none; color: #718096; font-size: 22px;
  cursor: pointer; padding: 2px 8px; border-radius: 4px; line-height: 1;
}
.chart-modal-close:hover { color: #e2e8f0; background: #2d3748; }
.chart-crypto-btns { display: flex; gap: 8px; margin-bottom: 12px; }
.chart-crypto-btn {
  padding: 5px 16px; border-radius: 6px; border: 1px solid #4a5568;
  background: #2d3748; color: #a0aec0; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.chart-crypto-btn:hover { border-color: #63b3ed; color: #63b3ed; }
.chart-crypto-btn.active { background: #1e3a5f; border-color: #63b3ed; color: #63b3ed; }
.chart-container { height: 420px; border-radius: 6px; overflow: hidden; position: relative; }
.chart-loading {
  display: flex; align-items: center; justify-content: center;
  height: 420px; color: #718096; font-size: 13px;
}

/* ── Activity log table scroll wrapper ───────────────────────────────────────── */
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

/* ── Responsive ──────────────────────────────────────────────────────────────── */

/* Tablet: ≤1024px — tighten spacing */
@media (max-width: 1024px) {
  .strat-card { padding: 16px 16px; }
  .live-balance-row { gap: 0; }
  .bal-item { padding: 2px 10px; }
  .bal-item.total { padding-right: 14px; }
  .bal-item.stat-sep { padding-left: 14px; }
  .bal-value { font-size: 19px; }
  .stat-value { font-size: 18px; }
}

/* Small tablet: ≤768px — wrap balance row, scrollable tabs */
@media (max-width: 768px) {
  /* Header */
  .t1000-header { flex-direction: column; align-items: flex-start; }
  .t1000-header-text h1 { font-size: 22px; }

  /* Tabs: horizontal scroll instead of wrapping */
  .t1000-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap;
    padding-bottom: 0;
    /* hide scrollbar visually but keep it functional */
    scrollbar-width: none;
  }
  .t1000-tabs::-webkit-scrollbar { display: none; }
  .t1000-tab { padding: 8px 14px; font-size: 13px; white-space: nowrap; flex-shrink: 0; }

  /* Balance row: wrap into 3-column grid */
  .live-balance-row {
    flex-wrap: wrap;
    row-gap: 10px;
    padding: 10px 0 12px;
  }
  .bal-item { flex: 1 1 30%; min-width: 80px; text-align: center; }
  .bal-item.total { border-right: none; padding-right: 10px; margin-right: 0; }
  .bal-item.stat-sep { border-left: none; padding-left: 10px; margin-left: 0; }
  .bal-value { font-size: 17px; }
  .stat-value { font-size: 17px; }

  /* Enable bar: tighter */
  .live-enable-bar { padding: 10px 12px; gap: 10px; }
  .live-status-text { font-size: 14px; }

  /* Activity tables: horizontal scroll */
  .activity-log table { min-width: 560px; }

  /* Chart modal */
  .chart-modal { padding: 14px 14px; }
  .chart-container { height: 320px; }
  .chart-loading { height: 320px; }
  .chart-crypto-btns { flex-wrap: wrap; }
  .chart-crypto-btn { padding: 4px 12px; font-size: 12px; }

  /* Controls row: stack tighter */
  .controls-row { gap: 10px; }
  .strat-card { padding: 14px 12px; }

  /* Section bar */
  .section-btn { padding: 6px 16px; font-size: 12px; }
}

/* Mobile: ≤480px — compact everything */
@media (max-width: 480px) {
  .t1000-header-text h1 { font-size: 18px; }
  .t1000-header-text p { font-size: 11px; }

  .section-btn { padding: 5px 12px; font-size: 12px; }
  .t1000-tab { padding: 7px 10px; font-size: 12px; }

  /* Balance: 2-column on narrow screens */
  .bal-item { flex: 1 1 45%; }
  .bal-value { font-size: 15px; }
  .bal-label { font-size: 9px; }
  .stat-value { font-size: 15px; }
  .stat-label { font-size: 10px; }

  /* Live section */
  .live-section { padding: 8px 10px; }
  .live-enable-bar { flex-wrap: wrap; gap: 8px; }
  .live-status-text { font-size: 13px; }

  /* Controls: stack vertically */
  .controls-row { flex-direction: column; align-items: flex-start; gap: 8px; }
  .threshold-wrap { flex-wrap: wrap; }
  .threshold-wrap input { width: 64px; }
  .strat-select-wrap select, .controls-row select { width: 100%; box-sizing: border-box; }

  /* Per-crypto thresholds: tighter */
  .per-crypto-thresholds { gap: 5px; }
  .per-crypto-thresholds input { width: 44px; }

  /* Stats bar */
  .stats-bar { gap: 14px; }

  /* Chart */
  .chart-modal { padding: 12px 10px; border-radius: 8px; }
  .chart-container { height: 260px; }
  .chart-loading { height: 260px; }
  .chart-modal-title { font-size: 13px; }

  /* Candle chips */
  .candle-chip { font-size: 11px; padding: 4px 8px; }

  /* Get Best Setup button */
  #btn-get-best { font-size: 11px; padding: 5px 8px; }
}

/* ── SVG Icon system ─────────────────────────────────────────────────────── */
.ico {
  display: inline-block;
  width: 1em; height: 1em;
  vertical-align: -0.15em;
  flex-shrink: 0;
  pointer-events: none;
}
.ico-sm { width: 12px; height: 12px; }
.ico-md { width: 15px; height: 15px; }
.ico-lg { width: 20px; height: 20px; }
.btn-icon {
  padding: 0;
  aspect-ratio: 1;
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
}

/* ── Withdrawal history modal ────────────────────────────────────── */
#wd-history-modal.open { display: flex; }
#wd-hist-tbody tr { border-bottom: 1px solid #1d2329; }
#wd-hist-tbody tr:hover td { background: #1a2028; }
#wd-hist-tbody td { padding: 7px 10px; color: #e2e8f0; vertical-align: middle; }
.wd-tx-link {
  color: #63b3ed; text-decoration: none; font-family: monospace; font-size: 11px;
}
.wd-tx-link:hover { color: #90cdf4; text-decoration: underline; }

/* ── PIN modal ───────────────────────────────────────────────────── */
#wd-pin-modal {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.78);
  display: none; align-items: center; justify-content: center;
}
#wd-pin-modal.open { display: flex; }
#wd-pin-dialog {
  background: #1a2035; border: 1px solid #2d3748; border-radius: 14px;
  padding: 28px 28px 22px; min-width: 260px; text-align: center;
  box-shadow: 0 24px 64px rgba(0,0,0,0.7);
  animation: pinFadeIn .18s ease;
}
@keyframes pinFadeIn { from { opacity:0; transform:scale(.92); } to { opacity:1; transform:scale(1); } }
@keyframes pinShake {
  0%,100% { transform: translateX(0); }
  15% { transform: translateX(-9px); }
  30% { transform: translateX(9px); }
  48% { transform: translateX(-6px); }
  64% { transform: translateX(6px); }
  80% { transform: translateX(-3px); }
  92% { transform: translateX(3px); }
}
#wd-pin-dialog.shake { animation: pinShake 0.42s ease; }
#wd-pin-display {
  font-size: 22px; letter-spacing: 8px; color: #e2e8f0;
  background: #0d1117; border: 1px solid #2d3748; border-radius: 8px;
  padding: 8px 20px; margin: 12px auto 8px; display: inline-block;
  min-width: 220px; font-family: monospace; transition: color .1s;
  user-select: none;
}
#wd-pin-msg { font-size: 12px; color: #fc8181; min-height: 18px; margin-bottom: 10px; }
#wd-pin-grid {
  display: grid; grid-template-columns: repeat(3, 62px);
  gap: 8px; margin: 0 auto; width: fit-content;
}
.pin-btn {
  width: 62px; height: 54px;
  background: #2d3748; border: 1px solid #4a5568; border-radius: 10px;
  color: #e2e8f0; font-size: 20px; font-weight: 600;
  cursor: pointer; transition: background .08s, transform .06s;
  font-family: monospace;
}
.pin-btn:hover  { background: #4a5568; }
.pin-btn:active { background: #718096; transform: scale(0.93); }
.pin-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
.pin-btn.pin-fn { font-size: 16px; color: #a0aec0; }
</style>

<!-- ── SVG icon sprite (Feather-style: fill=none, stroke=currentColor, stroke-width=1.5, round caps) -->
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true"><defs>
  <symbol id="ico-trending-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></symbol>
  <symbol id="ico-bar-chart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></symbol>
  <symbol id="ico-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" ry="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></symbol>
  <symbol id="ico-unlock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" ry="2"/><path d="M8 11V7a4 4 0 0 1 7.43-1.94"/></symbol>
  <symbol id="ico-folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></symbol>
  <symbol id="ico-clipboard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></symbol>
  <symbol id="ico-archive" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></symbol>
  <symbol id="ico-ban" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></symbol>
  <symbol id="ico-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></symbol>
  <symbol id="ico-upload" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></symbol>
  <symbol id="ico-file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></symbol>
  <symbol id="ico-table" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></symbol>
  <symbol id="ico-chevron-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></symbol>
  <symbol id="ico-chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></symbol>
  <symbol id="ico-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></symbol>
  <symbol id="ico-trash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></symbol>
  <symbol id="ico-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></symbol>
  <symbol id="ico-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></symbol>
  <symbol id="ico-zap" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></symbol>
  <symbol id="ico-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></symbol>
  <symbol id="ico-save" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></symbol>
  <symbol id="ico-repeat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></symbol>
  <symbol id="ico-pause" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></symbol>
</defs></svg>

<div class="t1000-header">
  <div class="t1000-header-text">
    <h1><svg class="ico" style="width:28px;height:28px;vertical-align:-4px"><use href="#ico-zap"/></svg> T1000 Trading</h1>
    <p>Sub-minute spike detection &mdash; C40/C50/C60 candles from Binance real-time ticks</p>
  </div>
</div>

<!-- Section bar: LIVE | PAPER -->
<div class="t1000-section-bar">
  <button class="section-btn active" data-section="LIVE" onclick="switchSection('LIVE')">
    LIVE <span id="section-live-dot" class="section-dot">○</span>
  </button>
  <button class="section-btn" data-section="PAPER" onclick="switchSection('PAPER')">
    PAPER
  </button>
</div>

<!-- LIVE sub-tabs -->
<div id="live-subtabs" class="t1000-tabs">
  <button class="t1000-tab tab-live active" data-tab="POLYMARKET" onclick="switchTab('POLYMARKET')">
    POLYMARKET <span class="tab-badge" id="tab-badge-LIVE">●</span>
    <span class="new-badge" id="new-badge-LIVE"></span>
  </button>
  <button class="t1000-tab" data-tab="KALSHI" onclick="switchTab('KALSHI')" style="border-bottom-color:#63b3ed;">
    🔵 KALSHI <span class="tab-badge" id="tab-badge-LIVE_KALSHI" style="background:#1a3a5c;color:#63b3ed;">15M</span>
    <span class="new-badge" id="new-badge-LIVE_KALSHI"></span>
  </button>
  <button class="t1000-tab" data-tab="MINI" onclick="switchTab('MINI')" style="border-bottom-color:#9f7aea;">
    🟣 MINI <span class="tab-badge" id="tab-badge-LIVE_MINI" style="background:#2d1f4a;color:#9f7aea;">1/3</span>
    <span class="new-badge" id="new-badge-LIVE_MINI"></span>
  </button>
  <button class="t1000-tab" data-tab="STATS" onclick="switchTab('STATS')">
    📊 STATS
  </button>
  <button class="t1000-tab" data-tab="SETUP" onclick="switchTab('SETUP')">
    ⚙️ SETUP
  </button>
</div>

<!-- PAPER sub-tabs -->
<div id="paper-subtabs" class="t1000-tabs" style="display:none;">
  <span style="font-size:10px;color:#718096;padding:0 8px;line-height:32px;">5 MIN</span>
  <button class="t1000-tab" data-tab="C95" onclick="switchTab('C95')">C95 <span class="new-badge" id="new-badge-C95"></span></button>
  <button class="t1000-tab" data-tab="C90" onclick="switchTab('C90')">C90 <span class="new-badge" id="new-badge-C90"></span></button>
  <button class="t1000-tab" data-tab="C85" onclick="switchTab('C85')">C85 <span class="new-badge" id="new-badge-C85"></span></button>
  <button class="t1000-tab" data-tab="C80" onclick="switchTab('C80')">C80 <span class="new-badge" id="new-badge-C80"></span></button>
  <button class="t1000-tab" data-tab="C75" onclick="switchTab('C75')">C75 <span class="new-badge" id="new-badge-C75"></span></button>
  <button class="t1000-tab" data-tab="C70" onclick="switchTab('C70')">C70 <span class="new-badge" id="new-badge-C70"></span></button>
  <button class="t1000-tab" data-tab="C65" onclick="switchTab('C65')">C65 <span class="new-badge" id="new-badge-C65"></span></button>
  <button class="t1000-tab" data-tab="C60" onclick="switchTab('C60')">C60 <span class="new-badge" id="new-badge-C60"></span></button>
  <button class="t1000-tab" data-tab="C55" onclick="switchTab('C55')">C55 <span class="new-badge" id="new-badge-C55"></span></button>
  <button class="t1000-tab" data-tab="C50" onclick="switchTab('C50')">C50 <span class="new-badge" id="new-badge-C50"></span></button>
  <span style="font-size:10px;color:#718096;padding:0 8px;line-height:32px;">15 MIN</span>
  <button class="t1000-tab" data-tab="C255" onclick="switchTab('C255')">C255 <span class="new-badge" id="new-badge-C255"></span></button>
  <button class="t1000-tab" data-tab="C240" onclick="switchTab('C240')">C240 <span class="new-badge" id="new-badge-C240"></span></button>
  <button class="t1000-tab" data-tab="C225" onclick="switchTab('C225')">C225 <span class="new-badge" id="new-badge-C225"></span></button>
  <button class="t1000-tab" data-tab="C210" onclick="switchTab('C210')">C210 <span class="new-badge" id="new-badge-C210"></span></button>
  <button class="t1000-tab" data-tab="C195" onclick="switchTab('C195')">C195 <span class="new-badge" id="new-badge-C195"></span></button>
  <button class="t1000-tab" data-tab="C180" onclick="switchTab('C180')">C180 <span class="new-badge" id="new-badge-C180"></span></button>
  <button class="t1000-tab" data-tab="C165" onclick="switchTab('C165')">C165 <span class="new-badge" id="new-badge-C165"></span></button>
  <button class="t1000-tab" data-tab="C150" onclick="switchTab('C150')">C150 <span class="new-badge" id="new-badge-C150"></span></button>
</div>

<!-- POLYMARKET panel -->
<div class="t1000-panel active" id="panel-POLYMARKET">
  <div class="strat-card">

    <!-- Enable/Disable banner -->
    <div class="live-enable-bar">
      <div class="live-status-text" id="live-status-text"><svg class="ico ico-md"><use href="#ico-lock"/></svg> LIVE TRADING DISABLED</div>
      <label class="toggle-switch" style="transform:scale(1.4);margin-right:4px;">
        <input type="checkbox" id="toggle-LIVE" onchange="toggleStrategy('LIVE')" />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <!-- Balance + stats row -->
    <div class="live-balance-row">
      <div class="bal-item total">
        <div class="bal-label">Virtual Total</div>
        <div class="bal-value vtotal" id="bal-total-LIVE">&#x2014;</div>
      </div>
      <div class="bal-item">
        <div class="bal-label">EOA Wallet</div>
        <div class="bal-value" id="live-real-balance">&#x2014;</div>
      </div>
      <div class="bal-item">
        <div class="bal-label">Locked</div>
        <div class="bal-value locked" id="bal-locked-LIVE">—</div>
      </div>
      <div class="bal-item">
        <div class="bal-label">Redeemable</div>
        <div class="bal-value redeemable" id="bal-redeem-LIVE">—</div>
      </div>
      <div class="bal-item">
        <div class="bal-label">Redeem Q</div>
        <div class="stat-value" id="redeem-q-LIVE" style="color:#63b3ed;">—</div>
      </div>
      <div class="bal-item stat-sep">
        <div class="bal-label">PnL</div>
        <div class="stat-value" id="bal-LIVE">$0.00</div>
      </div>
      <div class="bal-item"><div class="bal-label">Wins</div><div class="stat-value green" id="wins-LIVE">0</div></div>
      <div class="bal-item"><div class="bal-label">Losses</div><div class="stat-value red" id="losses-LIVE">0</div></div>
      <div class="bal-item"><div class="bal-label">Win Rate</div><div class="stat-value grey" id="wr-LIVE">&#x2014;</div></div>
      <div class="bal-item"><div class="bal-label">Pending</div><div class="stat-value grey" id="pend-LIVE">0</div></div>
      <div class="bal-item"><div class="bal-label">ROI</div><div class="stat-value grey" id="roi-LIVE">—</div></div>
      <div style="margin-left:auto;align-self:stretch;display:flex;align-items:center;gap:8px;padding:4px 6px;">
        <!-- Salary withdrawn stat — hidden until first withdrawal recorded -->
        <div id="wd-stat-wrap" style="display:block;text-align:right;cursor:pointer;padding:2px 8px;border-radius:5px;background:#071a0e;border:1px solid #276749;"
             onclick="openWithdrawalHistory()" title="Click to view withdrawal history">
          <div style="font-size:10px;color:#68d391;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;">&#x1F4B8; Salary Out</div>
          <div style="display:flex;align-items:baseline;gap:5px;justify-content:flex-end;">
            <span id="wd-stat-total" style="font-size:14px;font-weight:700;color:#68d391;">$0</span>
            <span id="wd-stat-count" style="font-size:11px;color:#48bb78;"></span>
          </div>
        </div>
        <button class="btn-chart btn-icon" onclick="openPnlChart()" title="P&amp;L Chart"><svg class="ico ico-lg"><use href="#ico-trending-up"/></svg></button>
      </div>
    </div>

    <!-- Projection since last reset -->
    <div id="live-projection" style="display:none;margin-top:6px;padding:6px 14px;background:#0a1a0f;border:1px solid #1a3a24;border-radius:6px;font-size:13px;display:none;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
      <span style="color:#48bb78;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Projection</span>
      <span style="color:#718096;font-size:12px;">since reset</span>
      <span id="live-proj-7d" style="font-weight:700;"></span>
      <span style="color:#2d5a3d;">·</span>
      <span id="live-proj-30d" style="font-weight:700;"></span>
      <span id="live-proj-rate" style="color:#718096;font-size:11px;margin-left:4px;"></span>
    </div>

    <!-- Multi-wallet summary (only shown when >1 wallet configured) -->
    <div id="live-wallets-section" style="display:none;margin-top:6px;border:1px solid #2d3748;border-radius:6px;overflow:hidden;">
      <div style="background:#1a202c;padding:5px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #2d3748;">
        <span style="font-size:11px;color:#63b3ed;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Wallets</span>
        <span id="live-wallets-total-bal" style="font-size:12px;color:#a0aec0;margin-left:auto;"></span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:3px 12px;background:#111827;font-size:10px;color:#4a5568;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #1a202c;">
        <span style="min-width:80px;">Wallet</span>
        <span style="min-width:70px;">Balance</span>
        <span style="min-width:28px;">W</span>
        <span style="min-width:28px;">L</span>
        <span style="min-width:58px;">PNL</span>
        <span style="min-width:52px;">Locked</span>
        <span style="min-width:52px;">Redeemable</span>
        <span style="min-width:24px;">Q</span>
        <span>CB</span>
        <span style="margin-left:auto;">Last Trade</span>
      </div>
      <div id="live-wallets-rows" style="display:flex;flex-direction:column;gap:0;"></div>
    </div>

    <!-- Circuit Breaker status bar (hidden when not active) -->
    <div id="cb-status-LIVE" style="display:none;margin-top:6px;padding:8px 14px;background:#2d1515;border:1px solid #7c2020;border-radius:6px;font-size:13px;color:#fc8181;display:none;align-items:center;gap:14px;flex-wrap:wrap;">
      <span style="font-weight:700;letter-spacing:.05em;font-size:13px;"><svg class="ico ico-md"><use href="#ico-pause"/></svg> CIRCUIT BREAKER ACTIVE</span>
      <span>Paused until <strong id="cb-until-LIVE" style="color:#fbd38d;">—</strong> EAT</span>
      <span style="color:#fc8181;">Remaining: <strong id="cb-remain-LIVE">—</strong></span>
      <button onclick="clearCircuitBreaker('LIVE')" style="background:#7c2020;color:#fbd38d;border:1px solid #c53030;border-radius:4px;padding:2px 10px;font-size:11px;cursor:pointer;font-weight:700;">Clear</button>
    </div>

    <!-- FOK Retry Stats (hidden until retries exist) -->
    <div id="fok-stats-LIVE" style="display:flex;margin-top:6px;padding:6px 12px;background:#1e2535;border:1px solid #2d3748;border-radius:6px;font-size:15px;color:#a0aec0;flex-wrap:wrap;gap:14px;align-items:center;">
      <span style="color:#718096;font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:14px;">FOK Retry</span>
      <span>Filled: <strong id="fok-filled-LIVE" style="color:#e2e8f0;">0</strong></span>
      <span>W: <strong id="fok-wins-LIVE" style="color:#68d391;">0</strong></span>
      <span>L: <strong id="fok-losses-LIVE" style="color:#fc8181;">0</strong></span>
      <span>Re&#x2011;killed: <strong id="fok-failed-LIVE" style="color:#718096;">0</strong></span>
      <span>WR: <strong id="fok-wr-LIVE" style="color:#e2e8f0;">—</strong></span>
      <span>P&amp;L: <strong id="fok-pnl-LIVE">—</strong></span>
      <span>Retries: <strong id="fok-total-LIVE" style="color:#e2e8f0;">0</strong></span>
      <span>Failed: <strong id="failed-LIVE" style="color:#718096;">0</strong></span>
      <span id="fok-active-LIVE" style="display:none;background:#2d3748;padding:1px 7px;border-radius:10px;color:#63b3ed;font-weight:600;">&#x25CF; active</span>
      <span style="border-left:1px solid #2d3748;margin-left:2px;padding-left:14px;color:#718096;font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:14px;">Rej</span>
      <span>T0: <strong id="rej-t0-LIVE"    style="color:#f6ad55">0</strong></span>
      <span>T1: <strong id="rej-t1-LIVE"    style="color:#f6ad55">0</strong></span>
      <span>TC: <strong id="rej-tc-LIVE"    style="color:#f6ad55">0</strong></span>
      <span>Total: <strong id="rej-total-LIVE" style="color:#e2e8f0">0</strong></span>
      <button onclick="openRejModal()" id="rej-details-btn" style="display:none;background:#1e2d1e;border:1px solid #276227;color:#68d391;border-radius:4px;padding:2px 9px;font-size:11px;cursor:pointer;font-weight:600;letter-spacing:.03em;">details ↗</button>
    </div>
    <!-- Per-reason rejection breakdown (hidden when all zero) -->
    <div id="rej-reasons-LIVE" style="display:none;margin-top:4px;padding:5px 12px;background:#1a2030;border:1px solid #2d3748;border-radius:6px;font-size:12px;color:#718096;flex-wrap:wrap;gap:8px;align-items:center;"></div>

    <!-- Market Dist% Panel -->
    <div id="live-market-dist" style="margin-top:6px;padding:6px 12px;background:#0d1520;border:1px solid #1e2d40;border-radius:6px;">
      <div style="font-size:10px;color:#4a6080;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;">Market Dist% (Binance vs T0 open)</div>
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left;color:#4a6080;padding:1px 6px 3px 0;font-weight:600;font-size:10px;"></th>
            <th style="color:#63b3ed;padding:1px 8px 3px;font-weight:700;font-size:11px;text-align:center;">BTC</th>
            <th style="color:#63b3ed;padding:1px 8px 3px;font-weight:700;font-size:11px;text-align:center;">ETH</th>
            <th style="color:#63b3ed;padding:1px 8px 3px;font-weight:700;font-size:11px;text-align:center;">SOL</th>
            <th style="color:#63b3ed;padding:1px 8px 3px;font-weight:700;font-size:11px;text-align:center;">XRP</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="color:#4a6080;font-size:10px;font-weight:700;padding:1px 6px 1px 0;white-space:nowrap;">5m</td>
            <td id="mkt-dist-5m-BTC" style="text-align:center;padding:1px 8px;font-weight:600;">—</td>
            <td id="mkt-dist-5m-ETH" style="text-align:center;padding:1px 8px;font-weight:600;">—</td>
            <td id="mkt-dist-5m-SOL" style="text-align:center;padding:1px 8px;font-weight:600;">—</td>
            <td id="mkt-dist-5m-XRP" style="text-align:center;padding:1px 8px;font-weight:600;">—</td>
          </tr>
          <tr>
            <td style="color:#4a6080;font-size:10px;font-weight:700;padding:2px 6px 1px 0;white-space:nowrap;">15m</td>
            <td id="mkt-dist-15m-BTC" style="text-align:center;padding:2px 8px 1px;font-weight:600;">—</td>
            <td id="mkt-dist-15m-ETH" style="text-align:center;padding:2px 8px 1px;font-weight:600;">—</td>
            <td id="mkt-dist-15m-SOL" style="text-align:center;padding:2px 8px 1px;font-weight:600;">—</td>
            <td id="mkt-dist-15m-XRP" style="text-align:center;padding:2px 8px 1px;font-weight:600;">—</td>
          </tr>
          <tr id="mkt-dist-thresh-5m">
            <td style="color:#4a6080;font-size:9px;padding:0 6px 0 0;white-space:nowrap;">≥</td>
            <td id="mkt-thresh-5m-BTC" style="text-align:center;padding:0 8px;color:#4a6080;font-size:9px;">—</td>
            <td id="mkt-thresh-5m-ETH" style="text-align:center;padding:0 8px;color:#4a6080;font-size:9px;">—</td>
            <td id="mkt-thresh-5m-SOL" style="text-align:center;padding:0 8px;color:#4a6080;font-size:9px;">—</td>
            <td id="mkt-thresh-5m-XRP" style="text-align:center;padding:0 8px;color:#4a6080;font-size:9px;">—</td>
          </tr>
          <tr id="mkt-dist-thresh-15m">
            <td style="color:#4a6080;font-size:9px;padding:0 6px 0 0;white-space:nowrap;">≥</td>
            <td id="mkt-thresh-15m-BTC" style="text-align:center;padding:0 8px;color:#4a6080;font-size:9px;">—</td>
            <td id="mkt-thresh-15m-ETH" style="text-align:center;padding:0 8px;color:#4a6080;font-size:9px;">—</td>
            <td id="mkt-thresh-15m-SOL" style="text-align:center;padding:0 8px;color:#4a6080;font-size:9px;">—</td>
            <td id="mkt-thresh-15m-XRP" style="text-align:center;padding:0 8px;color:#4a6080;font-size:9px;">—</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Open Positions -->
    <div class="live-section">
      <div class="live-section-title"><svg class="ico ico-md"><use href="#ico-folder"/></svg> OPEN POSITIONS</div>
      <div id="positions-LIVE" class="activity-log">
        <div class="empty-log">No open positions</div>
      </div>
    </div>

    <!-- Trades Log Tabs (Recent / Rejected / All Trades) -->
    <div class="live-section">

      <!-- Sub-tab bar -->
      <div class="log-tabs">
        <button class="log-tab active" id="ltab-btn-recent"    onclick="switchLogTab('recent')"   ><svg class="ico ico-md"><use href="#ico-clipboard"/></svg> Recent Trades</button>
        <button class="log-tab"        id="ltab-btn-rejected"  onclick="switchLogTab('rejected')"  style="display:none"><svg class="ico ico-md"><use href="#ico-ban"/></svg> Rejected <span id="rejected-count" style="font-size:10px;color:#718096;font-weight:normal;"></span></button>
        <button class="log-tab"        id="ltab-btn-allTrades" onclick="switchLogTab('allTrades')"><svg class="ico ico-md"><use href="#ico-archive"/></svg> All Trades <span id="all-trades-total" style="font-size:10px;color:#718096;font-weight:normal;"></span></button>
        <button class="log-tab"        id="ltab-btn-trioperf"  onclick="switchLogTab('trioperf')"><svg class="ico ico-md"><use href="#ico-zap"/></svg> Trio Perf</button>
      </div>

      <!-- Recent Trades content -->
      <div id="ltab-recent" class="ltab-content">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
          <button class="btn-reset" onclick="clearTradeList()" style="font-size:11px;padding:2px 10px;margin-left:0;" title="Clear list view and reset W/L counters (trade history is preserved)"><svg class="ico ico-md"><use href="#ico-trash"/></svg> Clear</button>
          <div style="position:relative;display:inline-block;">
            <button class="btn-chart" onclick="toggleExportMenu(event)" style="font-size:11px;padding:2px 10px;"><svg class="ico ico-md"><use href="#ico-download"/></svg> Export &#x25BE;</button>
            <div id="exportDropdown" style="display:none;position:absolute;left:0;top:100%;z-index:200;background:#2d3748;border:1px solid #4a5568;border-radius:4px;min-width:160px;margin-top:3px;box-shadow:0 4px 12px rgba(0,0,0,.4);">
              <div onclick="exportHTML();closeExportMenu()" class="export-menu-item"><svg class="ico ico-md"><use href="#ico-file"/></svg> Export as Page</div>
              <div onclick="exportJSON();closeExportMenu()" class="export-menu-item"><svg class="ico ico-md"><use href="#ico-clipboard"/></svg> Export as JSON</div>
              <div onclick="exportCSV();closeExportMenu()"  class="export-menu-item"><svg class="ico ico-md"><use href="#ico-table"/></svg> Export as CSV</div>
            </div>
          </div>
          <span id="live-24h-pnl" style="margin-left:auto;font-size:13px;font-weight:600;white-space:nowrap;"></span>
          <span id="live-avg-price" style="font-size:13px;color:#a0aec0;white-space:nowrap;"></span>
          <span id="live-avg-price-mini" style="font-size:13px;color:#b794f4;white-space:nowrap;"></span>
        </div>
        <div id="log-LIVE" class="activity-log">
          <div class="empty-log">No resolved trades yet</div>
        </div>
      </div>

      <!-- Rejected content -->
      <div id="ltab-rejected" class="ltab-content" style="display:none;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
          <button class="btn-chart" id="rej-prev" onclick="fetchRejected(_rejectedPage-1)" style="font-size:11px;padding:2px 8px;" disabled><svg class="ico ico-md"><use href="#ico-chevron-left"/></svg></button>
          <span id="rej-page-info" style="font-size:11px;color:#718096;"></span>
          <button class="btn-chart" id="rej-next" onclick="fetchRejected(_rejectedPage+1)" style="font-size:11px;padding:2px 8px;" disabled><svg class="ico ico-md"><use href="#ico-chevron-right"/></svg></button>
          <button class="btn-chart" onclick="fetchRejected(1)" style="font-size:11px;padding:2px 10px;"><svg class="ico ico-md"><use href="#ico-refresh"/></svg></button>
          <button class="btn-chart" onclick="exportRejectedJSON()" style="font-size:11px;padding:2px 10px;" title="Export loaded rejections as JSON for AI analysis"><svg class="ico ico-md"><use href="#ico-download"/></svg> Export JSON</button>
          <button class="btn-reset" onclick="clearRejected()" style="font-size:11px;padding:2px 10px;margin-left:0;" title="Clear all rejected candidates from DB"><svg class="ico ico-md"><use href="#ico-trash"/></svg> Clear</button>
        </div>
        <!-- Per-reason FPR stats pills -->
        <div id="rejected-stats" style="display:none;flex-wrap:wrap;gap:6px;margin-bottom:8px;padding:6px 8px;background:#171e2b;border-radius:6px;"></div>
        <!-- Trade-on-rejection panel -->
        <div id="rej-trade-panel" style="display:none;margin-bottom:8px;padding:8px 10px;background:#151c2a;border:1px solid #2d3748;border-radius:6px;"></div>
        <div id="log-rejected" class="activity-log" style="max-height:320px;">
          <div class="empty-log">No rejected candidates</div>
        </div>
      </div>

      <!-- Trio Perf content -->
      <div id="ltab-trioperf" class="ltab-content" style="display:none;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <label style="font-size:11px;color:#718096;">Period:</label>
          <input type="number" id="trio-perf-limit" min="1" value="200" step="10"
            style="width:70px;background:#1a202c;color:#e2e8f0;border:1px solid #2d3748;border-radius:4px;padding:2px 6px;font-size:12px;"
            onchange="renderTrioPerf()" />
          <span style="font-size:11px;color:#718096;">trades</span>
          <button class="btn-chart" onclick="document.getElementById('trio-perf-limit').value='';renderTrioPerf();"
            style="font-size:11px;padding:2px 10px;">All history</button>
        </div>
        <div id="trio-perf-body" style="overflow-x:auto;">
          <div style="color:#718096;padding:20px;text-align:center;">Click the tab to load</div>
        </div>
      </div>

      <!-- All Trades content -->
      <div id="ltab-allTrades" class="ltab-content" style="display:none;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
          <button class="btn-chart" id="all-trades-prev" onclick="allTradesPage(-1)" style="font-size:11px;padding:2px 10px;" disabled><svg class="ico ico-md"><use href="#ico-chevron-left"/></svg> Prev</button>
          <span id="all-trades-page-info" style="font-size:11px;color:#a0aec0;">—</span>
          <button class="btn-chart" id="all-trades-next" onclick="allTradesPage(+1)" style="font-size:11px;padding:2px 10px;" disabled>Next <svg class="ico ico-md"><use href="#ico-chevron-right"/></svg></button>
          <button class="btn-chart" onclick="loadAllTrades(1)" style="font-size:11px;padding:2px 10px;background:#2d4a2d;"><svg class="ico ico-md"><use href="#ico-refresh"/></svg> Refresh</button>
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#a0aec0;cursor:pointer;margin-left:6px;">
            <input type="checkbox" id="all-trades-hide-failed" onchange="loadAllTrades(1)" style="cursor:pointer;">
            Hide FAILED
          </label>
        </div>
        <div id="all-trades-body" class="activity-log">
          <div class="empty-log" style="cursor:pointer;color:#63b3ed;" onclick="loadAllTrades(1)">Click to load full trade history</div>
        </div>
      </div>

    </div>


  </div>
</div>

<!-- KALSHI panel -->
<div class="t1000-panel" id="panel-KALSHI">
  <div class="strat-card">

    <!-- Enable/Disable banner -->
    <div class="live-enable-bar">
      <div class="live-status-text" id="kalshi-status-text"><svg class="ico ico-md"><use href="#ico-lock"/></svg> KALSHI LIVE DISABLED</div>
      <label class="toggle-switch" style="transform:scale(1.4);margin-right:4px;">
        <input type="checkbox" id="toggle-LIVE_KALSHI" onchange="toggleStrategy('LIVE_KALSHI')" />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <!-- Balance + stats row -->
    <div class="live-balance-row">
      <div class="bal-item total">
        <div class="bal-label">Virtual Total</div>
        <div class="bal-value vtotal" id="bal-total-LIVE_KALSHI">&#x2014;</div>
      </div>
      <div class="bal-item">
        <div class="bal-label">Kalshi Balance</div>
        <div class="bal-value" id="kalshi-real-balance">&#x2014;</div>
      </div>
      <div class="bal-item">
        <div class="bal-label">Locked</div>
        <div class="bal-value locked" id="bal-locked-LIVE_KALSHI">$0.00</div>
      </div>
      <div class="bal-item stat-sep">
        <div class="bal-label">PnL</div>
        <div class="stat-value" id="bal-LIVE_KALSHI">$0.00</div>
      </div>
      <div class="bal-item"><div class="bal-label">Wins</div><div class="stat-value green" id="wins-LIVE_KALSHI">0</div></div>
      <div class="bal-item"><div class="bal-label">Losses</div><div class="stat-value red" id="losses-LIVE_KALSHI">0</div></div>
      <div class="bal-item"><div class="bal-label">Win Rate</div><div class="stat-value grey" id="wr-LIVE_KALSHI">&#x2014;</div></div>
      <div class="bal-item"><div class="bal-label">Pending</div><div class="stat-value grey" id="pend-LIVE_KALSHI">0</div></div>
    </div>

    <!-- Open Positions -->
    <div class="live-section">
      <div class="live-section-title"><svg class="ico ico-md"><use href="#ico-folder"/></svg> OPEN POSITIONS</div>
      <div id="positions-LIVE_KALSHI" class="activity-log">
        <div class="empty-log">No open positions</div>
      </div>
    </div>

    <!-- Trades Log Tabs (Recent / All Trades) -->
    <div class="live-section">

      <!-- Sub-tab bar -->
      <div class="log-tabs">
        <button class="log-tab active" id="kltab-btn-recent"    onclick="switchKalshiLogTab('recent')"   ><svg class="ico ico-md"><use href="#ico-clipboard"/></svg> Recent Trades</button>
        <button class="log-tab"        id="kltab-btn-allTrades" onclick="switchKalshiLogTab('allTrades')"><svg class="ico ico-md"><use href="#ico-archive"/></svg> All Trades <span id="kalshi-all-trades-total" style="font-size:10px;color:#718096;font-weight:normal;"></span></button>
      </div>

      <!-- Recent Trades content -->
      <div id="kltab-recent" class="ltab-content">
        <div id="log-LIVE_KALSHI" class="activity-log">
          <div class="empty-log">No resolved trades yet</div>
        </div>
      </div>

      <!-- All Trades content -->
      <div id="kltab-allTrades" class="ltab-content" style="display:none;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
          <button class="btn-chart" id="kalshi-all-trades-prev" onclick="kalshiAllTradesPage(-1)" style="font-size:11px;padding:2px 10px;" disabled><svg class="ico ico-md"><use href="#ico-chevron-left"/></svg> Prev</button>
          <span id="kalshi-all-trades-page-info" style="font-size:11px;color:#a0aec0;">—</span>
          <button class="btn-chart" id="kalshi-all-trades-next" onclick="kalshiAllTradesPage(+1)" style="font-size:11px;padding:2px 10px;" disabled>Next <svg class="ico ico-md"><use href="#ico-chevron-right"/></svg></button>
          <button class="btn-chart" onclick="loadAllTradesKalshi(1)" style="font-size:11px;padding:2px 10px;background:#2d4a2d;"><svg class="ico ico-md"><use href="#ico-refresh"/></svg> Refresh</button>
        </div>
        <div id="kalshi-all-trades-body" class="activity-log">
          <div class="empty-log" style="cursor:pointer;color:#63b3ed;" onclick="loadAllTradesKalshi(1)">Click to load full trade history</div>
        </div>
      </div>

    </div>

  </div>
</div>

<!-- LIVE_MINI panel -->
<div class="t1000-panel" id="panel-MINI">
  <div class="strat-card">

    <!-- Enable/Disable banner -->
    <div class="live-enable-bar">
      <div class="live-status-text" id="mini-status-text"><svg class="ico ico-md"><use href="#ico-lock"/></svg> MINI DISABLED</div>
      <label class="toggle-switch" style="transform:scale(1.4);margin-right:4px;">
        <input type="checkbox" id="toggle-LIVE_MINI" onchange="toggleStrategy('LIVE_MINI')" />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <!-- Info strip -->
    <div style="font-size:11px;color:#9f7aea;padding:4px 8px 8px;border-bottom:1px solid #2d1f4a;margin-bottom:8px;">
      Mirrors LIVE's periods &amp; thresholds · position = LIVE_riskPct ÷ 10 (min $2) · max $20/trade · relaxed maxPrice 97¢
    </div>

    <!-- Balance + stats row -->
    <div class="live-balance-row">
      <div class="bal-item total">
        <div class="bal-label">Virtual Total</div>
        <div class="bal-value vtotal" id="bal-total-LIVE_MINI">&#x2014;</div>
      </div>
      <div class="bal-item">
        <div class="bal-label">Real Balance</div>
        <div class="bal-value" id="mini-real-balance">&#x2014;</div>
      </div>
      <div class="bal-item">
        <div class="bal-label">Locked</div>
        <div class="bal-value locked" id="bal-locked-LIVE_MINI">$0.00</div>
      </div>
      <div class="bal-item stat-sep">
        <div class="bal-label">PnL</div>
        <div class="stat-value" id="bal-LIVE_MINI">$0.00</div>
      </div>
      <div class="bal-item"><div class="bal-label">Wins</div><div class="stat-value green" id="wins-LIVE_MINI">0</div></div>
      <div class="bal-item"><div class="bal-label">Losses</div><div class="stat-value red" id="losses-LIVE_MINI">0</div></div>
      <div class="bal-item"><div class="bal-label">Win Rate</div><div class="stat-value grey" id="wr-LIVE_MINI">&#x2014;</div></div>
      <div class="bal-item"><div class="bal-label">Pending</div><div class="stat-value grey" id="pend-LIVE_MINI">0</div></div>
    </div>

    <!-- Config row -->
    <div id="mini-config-row" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 0 10px;border-bottom:1px solid #1e2740;margin-bottom:8px;font-size:12px;color:#a0aec0;">
      <label style="display:flex;align-items:center;gap:6px;">
        <span>Max Pos</span>
        <input type="number" id="mini-max-pos" min="1" max="10" step="1" style="width:40px;background:#111827;color:#e2e8f0;border:1px solid #2d3748;border-radius:4px;padding:2px 5px;font-size:12px;" onchange="saveMiniConfig()" />
      </label>
      <label style="display:flex;align-items:center;gap:6px;" title="MINI bet = min(LIVE bet, $150) ÷ divisor  (min $1)">
        <span>Bet ÷</span>
        <input type="number" id="mini-risk-divisor" min="1" max="100" step="1" style="width:45px;background:#111827;color:#e2e8f0;border:1px solid #2d3748;border-radius:4px;padding:2px 5px;font-size:12px;" onchange="saveMiniConfig()" />
      </label>
      <button class="btn-chart" onclick="saveMiniConfig()" style="font-size:11px;padding:2px 10px;background:#1a3a2a;color:#68d391;border-color:#2d6a4f;">Save</button>
      <button class="btn-chart" onclick="resetMiniBalance()" style="font-size:11px;padding:2px 10px;background:#2a1f3a;">Reset Stats</button>
      <div style="color:#718096;font-size:11px;margin-top:4px;line-height:1.4;flex-basis:100%;">
        Inherits all settings (T0/T1/TC, trios, filters, price range) from LIVE Setup.
      </div>
    </div>

    <!-- Open Positions -->
    <div class="live-section">
      <div class="live-section-title"><svg class="ico ico-md"><use href="#ico-folder"/></svg> OPEN POSITIONS</div>
      <div id="positions-LIVE_MINI" class="activity-log">
        <div class="empty-log">No open positions</div>
      </div>
    </div>

    <!-- Recent Trades -->
    <div class="live-section">
      <div class="live-section-title"><svg class="ico ico-md"><use href="#ico-clipboard"/></svg> RECENT TRADES</div>
      <div id="log-LIVE_MINI" class="activity-log">
        <div class="empty-log">No resolved trades yet</div>
      </div>
    </div>

  </div>
</div>

<!-- STATS panel -->
<div class="t1000-panel" id="panel-STATS">
  <!-- Date range bar -->
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding:8px 10px;background:#0d1420;border-radius:6px;border:1px solid #1e2740;">
    <span style="color:#a0aec0;font-size:11px;white-space:nowrap;">Period (EAT):</span>
    <input type="datetime-local" id="stats-from" style="background:#111827;color:#e2e8f0;border:1px solid #2d3748;border-radius:4px;padding:3px 6px;font-size:11px;color-scheme:dark;" onkeydown="if(event.key==='Enter')applyStatsRange()">
    <span style="color:#718096;font-size:12px;">–</span>
    <input type="datetime-local" id="stats-to"   style="background:#111827;color:#e2e8f0;border:1px solid #2d3748;border-radius:4px;padding:3px 6px;font-size:11px;color-scheme:dark;" onkeydown="if(event.key==='Enter')applyStatsRange()">
    <button class="btn-chart" onclick="applyStatsRange()" style="font-size:11px;padding:3px 10px;">Apply</button>
    <button class="btn-chart" onclick="setStatsPreset(4/24)"  style="font-size:11px;padding:3px 8px;background:#1a2535;">4h</button>
    <button class="btn-chart" onclick="setStatsPreset(8/24)"  style="font-size:11px;padding:3px 8px;background:#1a2535;">8h</button>
    <button class="btn-chart" onclick="setStatsPreset(1)"  style="font-size:11px;padding:3px 8px;background:#1a2535;">24h</button>
    <button class="btn-chart" onclick="setStatsPreset(7)"  style="font-size:11px;padding:3px 8px;background:#1a2535;">7d</button>
    <button class="btn-chart" onclick="setStatsPreset(30)" style="font-size:11px;padding:3px 8px;background:#1a2535;">30d</button>
  </div>
  <div id="signal-stats-body" style="min-height:80px;">
    <div class="empty-log" style="cursor:pointer;color:#63b3ed;" onclick="loadSignalStats()">Click to load signal stats charts</div>
  </div>
</div>

<!-- SETUP panel -->
<div class="t1000-panel" id="panel-SETUP">
  <div class="strat-card">

    <!-- 5-Minute Markets -->
    <div class="live-section">
      <div class="live-section-title"><svg class="ico ico-md"><use href="#ico-clock"/></svg> 5-Minute Markets</div>
      <div id="live-best-5m" class="live-best-cxx"></div>
      <!-- Per-crypto 4-column grid -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0 10px;">
        <?php foreach (['BTC','ETH','SOL','XRP'] as $cr): ?>
        <div style="background:#1a2035;border:1px solid #2d3748;border-radius:7px;padding:8px 10px;">
          <div style="color:#a0aec0;font-size:10px;font-weight:700;letter-spacing:.06em;margin-bottom:6px;"><?= $cr ?></div>
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:6px;">
            <input type="number" class="thresh-crypto-input scr-th" data-crypto="<?= $cr ?>" data-dur="5m" data-strat="LIVE" step="0.01" min="0.05" max="5" placeholder="&#x2014;" style="flex:1;min-width:0;width:auto;" />
            <span class="scr-unit">%</span>
            <button class="th-lock-btn" data-crypto="<?= $cr ?>" data-dur="5m" data-strat="LIVE" data-locked="0" title="Lock: backfill/fill won't overwrite this threshold" onclick="toggleThLock(this)" style="background:none;border:none;cursor:pointer;font-size:13px;padding:0 2px;color:#4a5568;line-height:1;flex-shrink:0;"><svg class="ico ico-sm"><use href="#ico-unlock"/></svg></button>
          </div>
          <select class="strat-crypto-select scr-sel" data-crypto="<?= $cr ?>" data-dur="5m" data-strat="LIVE" style="width:100%;">
            <option value="">auto</option>
            <option>C95</option><option>C92</option><option>C91</option><option>C90</option><option>C89</option><option>C88</option><option>C87</option><option>C86</option><option>C85</option><option>C84</option><option>C83</option><option>C82</option><option>C81</option><option>C80</option><option>C75</option><option>C70</option><option>C65</option>
          </select>
        </div>
        <?php endforeach; ?>
      </div>
      <!-- Controls -->
      <div class="controls-row" style="margin-top:0;flex-wrap:wrap;">
        <div class="threshold-wrap"><label>minPrice:</label><input type="number" id="live-minprice5m" step="1" min="0" max="99" value="5" /><span style="color:#718096;font-size:12px;">&#x00A2;</span></div>
        <div class="threshold-wrap"><label>maxPrice:</label><input type="number" id="live-maxprice5m" step="1" min="1" max="99" value="97" /><span style="color:#718096;font-size:12px;">&#x00A2;</span></div>
        <div class="threshold-wrap" style="display:none"><label style="color:#63b3ed;">TC max:</label><input type="number" id="live-mxt1-5m" step="1" min="50" max="99" value="97" /><span style="color:#718096;font-size:12px;">&#x00A2;</span></div>
        <div class="threshold-wrap"><label>maxTrade:</label><input type="number" id="live-maxtrade5m" step="1" min="1" max="10000" value="150" /><span style="color:#718096;font-size:12px;">$</span></div>
        <button class="btn-fill" data-dur="5m" onclick="fillFromAutoscan('5m')">Fill 5MIN &#x2193;</button>
        <button class="btn-chart" onclick="openChartLive('5m')"><svg class="ico ico-md"><use href="#ico-trending-up"/></svg> Chart</button>
      </div>
      <!-- Hidden: global fallback for engine when per-crypto Cxx/threshold is null -->
      <select id="live-strategy5m" style="display:none"><option value="C95">C95</option><option value="C92">C92</option><option value="C91">C91</option><option value="C90">C90</option><option value="C89">C89</option><option value="C88">C88</option><option value="C87">C87</option><option value="C86">C86</option><option value="C85">C85</option><option value="C84">C84</option><option value="C83">C83</option><option value="C82">C82</option><option value="C81">C81</option><option value="C80">C80</option><option value="C75">C75</option><option value="C70">C70</option><option value="C65">C65</option></select>
      <input type="number" id="live-thresh5m" style="display:none" value="0.21" />
    </div>

    <!-- 15-Minute Markets -->
    <div class="live-section">
      <div class="live-section-title"><svg class="ico ico-md"><use href="#ico-clock"/></svg> 15-Minute Markets <span style="font-size:11px;color:#718096;font-weight:normal;">(Polymarket + Kalshi)</span></div>
      <div id="live-best-15m" class="live-best-cxx"></div>
      <!-- Per-crypto 4-column grid -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0 10px;">
        <?php foreach (['BTC','ETH','SOL','XRP'] as $cr): ?>
        <div style="background:#1a2035;border:1px solid #2d3748;border-radius:7px;padding:8px 10px;">
          <div style="color:#a0aec0;font-size:10px;font-weight:700;letter-spacing:.06em;margin-bottom:6px;"><?= $cr ?></div>
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:6px;">
            <input type="number" class="thresh-crypto-input scr-th" data-crypto="<?= $cr ?>" data-dur="15m" data-strat="LIVE" step="0.01" min="0.05" max="5" placeholder="&#x2014;" style="flex:1;min-width:0;width:auto;" />
            <span class="scr-unit">%</span>
            <button class="th-lock-btn" data-crypto="<?= $cr ?>" data-dur="15m" data-strat="LIVE" data-locked="0" title="Lock: backfill/fill won't overwrite this threshold" onclick="toggleThLock(this)" style="background:none;border:none;cursor:pointer;font-size:13px;padding:0 2px;color:#4a5568;line-height:1;flex-shrink:0;"><svg class="ico ico-sm"><use href="#ico-unlock"/></svg></button>
          </div>
          <select class="strat-crypto-select scr-sel" data-crypto="<?= $cr ?>" data-dur="15m" data-strat="LIVE" style="width:100%;">
            <option value="">auto</option>
            <option>C225</option><option>C210</option><option>C195</option><option>C180</option><option>C175</option><option>C173</option><option>C171</option><option>C169</option><option>C167</option><option>C165</option><option>C163</option><option>C161</option><option>C159</option><option>C157</option><option>C150</option>
          </select>
        </div>
        <?php endforeach; ?>
      </div>
      <!-- Controls -->
      <div class="controls-row" style="margin-top:0;flex-wrap:wrap;">
        <div class="threshold-wrap"><label>minPrice:</label><input type="number" id="live-minprice15m" step="1" min="0" max="99" value="5" /><span style="color:#718096;font-size:12px;">&#x00A2;</span></div>
        <div class="threshold-wrap"><label>maxPrice:</label><input type="number" id="live-maxprice15m" step="1" min="1" max="99" value="95" /><span style="color:#718096;font-size:12px;">&#x00A2;</span></div>
        <div class="threshold-wrap" style="display:none"><label style="color:#63b3ed;">TC max:</label><input type="number" id="live-mxt1-15m" step="1" min="50" max="99" value="97" /><span style="color:#718096;font-size:12px;">&#x00A2;</span></div>
        <div class="threshold-wrap"><label>maxTrade:</label><input type="number" id="live-maxtrade15m" step="1" min="1" max="10000" value="500" /><span style="color:#718096;font-size:12px;">$</span></div>
        <button class="btn-fill" data-dur="15m" onclick="fillFromAutoscan('15m')">Fill 15MIN &#x2193;</button>
        <button class="btn-chart" onclick="openChartLive('15m')"><svg class="ico ico-md"><use href="#ico-trending-up"/></svg> Chart</button>
      </div>
      <select id="live-strategy15m" style="display:none"><option value="C225">C225</option><option value="C210">C210</option><option value="C195">C195</option><option value="C180">C180</option><option value="C175">C175</option><option value="C173">C173</option><option value="C171">C171</option><option value="C169">C169</option><option value="C167">C167</option><option value="C165">C165</option><option value="C163">C163</option><option value="C161">C161</option><option value="C159">C159</option><option value="C157">C157</option><option value="C150">C150</option></select>
      <input type="number" id="live-thresh15m" style="display:none" value="0.20" />
    </div>

    <!-- Trading Settings -->
    <div class="live-section" style="margin-top:8px;">
      <div class="live-section-title"><svg class="ico ico-md"><use href="#ico-settings"/></svg> Trading Settings</div>

      <!-- Row 1: 3 numeric params -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">
        <div style="background:#2d3748;border-radius:8px;padding:10px 12px;">
          <div style="color:#718096;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Base EOA Balance</div>
          <div style="display:flex;align-items:center;gap:5px;">
            <input type="number" id="live-base-eoa" step="0.01" min="0" value="31.39" style="flex:1;min-width:0;font-size:14px;" />
            <span style="color:#718096;font-size:11px;white-space:nowrap;">$ USDC.e</span>
            <button onclick="syncEoaBaseline()" title="Set baseline to current on-chain balance" style="background:#2b6cb0;border:none;border-radius:4px;color:#fff;font-size:10px;padding:3px 6px;cursor:pointer;white-space:nowrap;">↻ Sync</button>
          </div>
        </div>
        <div style="background:#2d3748;border-radius:8px;padding:10px 12px;">
          <div style="color:#718096;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Risk per Trade</div>
          <div style="display:flex;align-items:center;gap:5px;">
            <input type="number" id="live-risk-pct" step="0.1" min="0.1" max="100" value="5" style="flex:1;min-width:0;font-size:14px;" />
            <span style="color:#718096;font-size:11px;">%</span>
          </div>
        </div>
        <div style="background:#2d3748;border-radius:8px;padding:10px 12px;">
          <div style="color:#718096;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Max Positions</div>
          <div style="display:flex;align-items:center;gap:5px;">
            <input type="number" id="live-max-positions" step="1" min="1" max="20" value="4" style="flex:1;min-width:0;font-size:14px;" />
            <span style="color:#718096;font-size:11px;">slots</span>
          </div>
        </div>
      </div>


      <!-- Row 3: T1 + TC entries | FOK Retry -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div style="background:#2d3748;border-radius:8px;padding:12px 14px;">
          <input type="number" id="live-mxt1-standalone" style="display:none" value="89" />
          <div style="color:#718096;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Entry tiers</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
              <input type="checkbox" id="live-t0" style="width:14px;height:14px;cursor:pointer;margin-top:2px;accent-color:#68d391;flex-shrink:0;" checked />
              <div>
                <div style="color:#e2e8f0;font-size:12px;font-weight:600;">T0 direct</div>
                <div style="color:#718096;font-size:11px;margin-top:2px;line-height:1.4;">Direct entry on T+0 candle spike. Primary entry tier.</div>
              </div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
              <input type="checkbox" id="live-t1-standalone" style="width:14px;height:14px;cursor:pointer;margin-top:2px;accent-color:#f6ad55;flex-shrink:0;" />
              <div>
                <div style="color:#e2e8f0;font-size:12px;font-weight:600;">T1 standalone</div>
                <div style="color:#718096;font-size:11px;margin-top:2px;line-height:1.4;">T+1 candle own spike. WR 81.8% (body≥76% in LIVE). Arms CB on loss.</div>
              </div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
              <input type="checkbox" id="live-t1-mode" style="width:14px;height:14px;cursor:pointer;margin-top:2px;accent-color:#63b3ed;flex-shrink:0;" />
              <div>
                <div style="color:#e2e8f0;font-size:12px;font-weight:600;">TC cumulative</div>
                <div style="color:#718096;font-size:11px;margin-top:2px;line-height:1.4;">T0.open→T1.close spike. WR 91.9% at ≥85¢. Min 85¢, max = TC max above.</div>
              </div>
            </label>
          </div>
        </div>
        <label style="display:flex;align-items:flex-start;gap:10px;background:#2d3748;border-radius:8px;padding:12px 14px;cursor:pointer;">
          <input type="checkbox" id="live-fok-retry-enabled" style="width:15px;height:15px;cursor:pointer;margin-top:3px;accent-color:#63b3ed;flex-shrink:0;" checked />
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:#e2e8f0;font-size:13px;font-weight:600;">FOK Retry</span>
              <span style="background:#1a3050;color:#63b3ed;font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;letter-spacing:.04em;">OWN SLOTS</span>
            </div>
            <div style="color:#718096;font-size:11px;margin-top:4px;line-height:1.5;">When an order is killed (no liquidity), retry once at reduced size. Retries do <em>not</em> count against Max Positions.</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
              <div style="background:#1a202c;border:1px solid #2d3748;border-radius:5px;padding:8px 10px;">
                <div style="color:#718096;font-size:10px;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;">Retry size</div>
                <div style="display:flex;align-items:center;gap:5px;">
                  <span style="color:#a0aec0;font-size:12px;">size ÷</span>
                  <input type="number" id="live-fok-divisor" step="1" min="2" max="10" value="4" style="flex:1;min-width:0;font-size:13px;background:#0d1117;border:1px solid #4a5568;border-radius:4px;color:#e2e8f0;padding:3px 5px;text-align:center;" onclick="event.stopPropagation()" />
                </div>
              </div>
              <div style="background:#1a202c;border:1px solid #2d3748;border-radius:5px;padding:8px 10px;">
                <div style="color:#718096;font-size:10px;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;">Max open retries</div>
                <div style="display:flex;align-items:center;gap:5px;">
                  <input type="number" id="live-fok-max" step="1" min="0" max="5" value="2" style="flex:1;min-width:0;font-size:13px;background:#0d1117;border:1px solid #4a5568;border-radius:4px;color:#e2e8f0;padding:3px 5px;text-align:center;" onclick="event.stopPropagation()" />
                  <span style="color:#a0aec0;font-size:12px;">retries</span>
                </div>
              </div>
            </div>
          </div>
        </label>
      </div>

      <!-- Row 4: Circuit Breaker -->
      <div style="background:#2d1515;border:1px solid #7c2020;border-radius:8px;padding:10px 14px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="live-cb-enabled" style="width:15px;height:15px;cursor:pointer;accent-color:#fc8181;" checked onclick="event.stopPropagation()" />
            <span style="color:#fc8181;font-size:13px;font-weight:700;">Circuit Breaker</span>
          </label>
          <span style="color:#fc8181;font-size:11px;opacity:.8;">After any LOSS, pause all new entries for:</span>
          <div style="display:flex;align-items:center;gap:5px;">
            <input type="number" id="live-cb-mins" step="1" min="1" max="360" value="90" style="width:55px;font-size:13px;background:#1a0a0a;border:1px solid #7c2020;border-radius:4px;color:#fbd38d;padding:2px 6px;text-align:center;" onclick="event.stopPropagation()" />
            <span style="color:#a0aec0;font-size:12px;">min</span>
          </div>
          <span style="color:#718096;font-size:10px;font-style:italic;">Data: WR drops 96.9% → 23% after first loss in session</span>
        </div>
      </div>

      <!-- Row 5: Drawdown Limit -->
      <div style="background:#1a1a2e;border:1px solid #553c9a;border-radius:8px;padding:10px 14px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="live-dl-enabled" style="width:15px;height:15px;cursor:pointer;accent-color:#b794f4;" checked onclick="event.stopPropagation()" />
            <span style="color:#b794f4;font-size:13px;font-weight:700;">Drawdown Limit</span>
          </label>
          <span style="color:#b794f4;font-size:11px;opacity:.8;">Pause all entries if</span>
          <input type="number" id="live-dl-max-losses" step="1" min="1" max="10" value="2" style="width:45px;font-size:13px;background:#0d0d1a;border:1px solid #553c9a;border-radius:4px;color:#e9d8fd;padding:2px 6px;text-align:center;" onclick="event.stopPropagation()" />
          <span style="color:#b794f4;font-size:11px;opacity:.8;">losses within</span>
          <input type="number" id="live-dl-window-mins" step="15" min="15" max="480" value="90" style="width:55px;font-size:13px;background:#0d0d1a;border:1px solid #553c9a;border-radius:4px;color:#e9d8fd;padding:2px 6px;text-align:center;" onclick="event.stopPropagation()" />
          <span style="color:#a0aec0;font-size:12px;">min</span>
          <span style="color:#b794f4;font-size:11px;opacity:.8;">→ pause</span>
          <input type="number" id="live-dl-pause-mins" step="15" min="15" max="720" value="120" style="width:55px;font-size:13px;background:#0d0d1a;border:1px solid #553c9a;border-radius:4px;color:#e9d8fd;padding:2px 6px;text-align:center;" onclick="event.stopPropagation()" />
          <span style="color:#a0aec0;font-size:12px;">min</span>
          <span id="live-dl-status" style="font-size:11px;font-weight:600;display:none;"></span>
        </div>
      </div>

      <!-- Row 6: Distance Minimum + Body % -->
      <div style="background:#0d1a14;border:1px solid #276749;border-radius:8px;padding:10px 14px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <!-- Dist Min hidden: research confirmed redundant with spike threshold (0% optimal) -->
          <span style="display:none"><span style="color:#68d391;font-size:13px;font-weight:700;">Dist Min</span>
          <span style="color:#68d391;font-size:11px;opacity:.8;">Skip entry if cumulative Binance move &lt; distMin%:</span>
          <div style="display:flex;align-items:center;gap:5px;">
            <input type="number" id="live-distmin5m" step="0.05" min="0" max="2" value="0" style="width:60px;font-size:13px;background:#071a0e;border:1px solid #276749;border-radius:4px;color:#c6f6d5;padding:2px 6px;text-align:center;" onclick="event.stopPropagation()" />
            <span style="color:#a0aec0;font-size:12px;">% 5m</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <input type="number" id="live-distmin15m" step="0.05" min="0" max="2" value="0" style="width:60px;font-size:13px;background:#071a0e;border:1px solid #276749;border-radius:4px;color:#c6f6d5;padding:2px 6px;text-align:center;" onclick="event.stopPropagation()" />
            <span style="color:#a0aec0;font-size:12px;">% 15m</span>
          </div>
          <span style="color:#718096;font-size:10px;font-style:italic;">0 = disabled</span></span>
          <span style="color:#68d391;font-size:13px;font-weight:700;">Body%</span>
          <span style="color:#68d391;font-size:11px;opacity:.8;">Min candle body/range ratio:</span>
          <div style="display:flex;align-items:center;gap:5px;">
            <input type="number" id="live-body-pct" step="1" min="0" max="100" value="76" style="width:55px;font-size:13px;background:#071a0e;border:1px solid #276749;border-radius:4px;color:#c6f6d5;padding:2px 6px;text-align:center;" onclick="event.stopPropagation()" />
            <span style="color:#a0aec0;font-size:12px;">%</span>
          </div>
          <span style="color:#718096;font-size:10px;font-style:italic;">0 = disabled</span>
        </div>
      </div>

      <!-- Row 6.3: D2 Filters — direction, skip hours/DOW, coordination -->
      <div style="background:#0d1a2e;border:1px solid #2b4a8c;border-radius:8px;padding:10px 14px;margin-top:6px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="color:#63b3ed;font-size:13px;font-weight:700;">D2 Filters</span>
          <!-- Direction -->
          <label style="color:#a0aec0;font-size:12px;">Dir</label>
          <select id="live-direction-filter" onclick="event.stopPropagation()" style="font-size:12px;background:#0d1117;border:1px solid #2d3748;border-radius:4px;color:#e2e8f0;padding:2px 6px;">
            <option value="">Both ↑↓</option>
            <option value="DOWN">DOWN ↘ only</option>
            <option value="UP">UP ↗ only</option>
          </select>
          <span style="color:#4a5568;font-size:11px;margin:0 2px;">|</span>
          <!-- Skip Hours -->
          <label style="color:#a0aec0;font-size:12px;" title="UTC hours to skip, comma-separated. D2 research: h00 and h12 are negative-EV.">Skip h</label>
          <input type="text" id="live-skip-hours" value="" placeholder="e.g. 0,12"
            onclick="event.stopPropagation()"
            style="width:70px;font-size:12px;background:#0d1117;border:1px solid #2d3748;border-radius:4px;color:#e2e8f0;padding:2px 6px;" />
          <span style="color:#4a5568;font-size:11px;margin:0 2px;">|</span>
          <!-- Skip DOW -->
          <label style="color:#a0aec0;font-size:12px;" title="Days of week to skip, 0=Sun…6=Sat. D2: skip 0 (Sunday).">Skip day</label>
          <input type="text" id="live-skip-dow" value="" placeholder="e.g. 0"
            onclick="event.stopPropagation()"
            style="width:50px;font-size:12px;background:#0d1117;border:1px solid #2d3748;border-radius:4px;color:#e2e8f0;padding:2px 6px;" />
          <span style="color:#4a5568;font-size:11px;margin:0 2px;">|</span>
          <!-- Coord Min -->
          <label style="color:#a0aec0;font-size:12px;" title="Require ≥N cryptos spiking same direction in same cycle. D2=2. 0=off.">Coord ≥</label>
          <input type="number" id="live-coord-min" value="0" min="0" max="4" step="1"
            onclick="event.stopPropagation()"
            style="width:48px;font-size:12px;background:#0d1117;border:1px solid #2d3748;border-radius:4px;color:#e2e8f0;padding:2px 6px;text-align:center;" />
          <span style="color:#718096;font-size:10px;font-style:italic;">0 = off &nbsp;|&nbsp; D2 defaults: Dir=DOWN, Skip h=0,12, Day=0, Coord=2</span>
        </div>
      </div>

      <!-- Row 6.5: Include Signals — low-vol + price-oor bypass toggles (hidden: optimal values fixed by research) -->
      <div style="display:none;background:#0d1a14;border:1px solid #276749;border-radius:8px;padding:10px 14px;margin-top:6px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="color:#68d391;font-size:13px;font-weight:700;">Include Signals</span>
          <!-- Low-Vol toggle -->
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;" onclick="event.stopPropagation()">
            <input type="checkbox" id="live-allow-low-vol" checked
              style="width:15px;height:15px;cursor:pointer;accent-color:#68d391;"
              onclick="event.stopPropagation()" />
            <span style="color:#68d391;font-size:12px;font-weight:600;">Low-Vol</span>
          </label>
          <span onclick="alert('LOW-VOL signals\n\nThe vol filter normally rejects BTC and SOL signals where the Binance volume at spike time is below the 14-period average (vol_ratio < 1.0).\n\n✓ ON = include low-vol signals (bypass vol filter) — recommended\n✗ OFF = apply vol filter, skip low-vol spikes\n\nHistorical data (rejected-signals panel):\n• 13 signals • 100% WR (11/11 resolved) • avg entry 90¢ • EV +$4.95/tr • Est. PnL +$64\n\nConclusion: the vol filter is too conservative — low-volume spikes win just as cleanly. Leave ON.')"
            style="color:#4a9d7c;cursor:pointer;font-size:14px;line-height:1;user-select:none;"
            title="Click for explanation">ⓘ</span>
          <span style="color:#4a5568;font-size:11px;margin:0 2px;">|</span>
          <!-- Price-OOR toggle -->
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;" onclick="event.stopPropagation()">
            <input type="checkbox" id="live-allow-price-oor"
              style="width:15px;height:15px;cursor:pointer;accent-color:#f6ad55;"
              onclick="event.stopPropagation()" />
            <span style="color:#f6ad55;font-size:12px;font-weight:600;">Price OOR</span>
          </label>
          <span onclick="alert('PRICE OOR (Out Of Range) signals\n\nThese are T+1 retry entries (second attempt after a missed T+0) where the entry price is above the strict T+1 cap (maxPriceT1: 82¢ for 15m, 89¢ for 5m) but still below the general maxPrice ceiling.\n\nAt T+1 you enter later with less time left in the cycle, so the default is a tighter price cap to protect EV.\n\n✓ ON = allow T+1 entries above the cap (up to regular maxPrice)\n✗ OFF = reject T+1 entries above the cap (original behaviour) — recommended\n\nHistorical data (rejected-signals panel):\n• 30 signals • 96% WR (24/25) • avg entry 95¢ • EV +$0.68/tr • Est. PnL +$12\n\nVerdict: marginal — at 95¢ avg entry the break-even WR is 95%, leaving only a thin EV margin. Keep OFF unless you want to experiment.')"
            style="color:#c97a14;cursor:pointer;font-size:14px;line-height:1;user-select:none;"
            title="Click for explanation">ⓘ</span>
        </div>
      </div>

      <!-- Row 6.7: Rejection Trading — normal signals toggle + per-reason override checkboxes -->
      <div style="background:#1a1030;border:1px solid #553c9a;border-radius:8px;padding:10px 14px;margin-top:6px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="color:#b794f4;font-size:13px;font-weight:700;">&#x26A1; Rejection Trading</span>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"
            title="ON = also trade normal passing signals (default). OFF = ONLY trade rejection overrides."
            onclick="event.stopPropagation()">
            <input type="checkbox" id="live-normal-trade" checked
              style="width:14px;height:14px;cursor:pointer;accent-color:#68d391;"
              onclick="event.stopPropagation()" />
            <span style="color:#68d391;font-size:12px;font-weight:600;">Normal signals</span>
          </label>
          <span style="color:#4a5568;font-size:11px;margin:0 2px;">|</span>
          <span style="color:#a0aec0;font-size:11px;">Also trade on rejection:</span>
          <div id="setup-rej-checkboxes" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:22px;">
            <span style="color:#4a5568;font-size:11px;font-style:italic;">loading…</span>
          </div>
        </div>
      </div>

      <!-- Row 7: No Spike Filter (hidden: research mode only) -->
      <div style="display:none;background:#2d1a00;border:1px solid #c05621;border-radius:8px;padding:10px 14px;margin-top:10px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="live-no-spike-filter" style="width:15px;height:15px;cursor:pointer;accent-color:#ed8936;" onclick="event.stopPropagation()" />
            <span style="color:#ed8936;font-size:13px;font-weight:700;">No Spike Filter</span>
          </label>
          <span style="color:#ed8936;font-size:11px;opacity:.8;">Skip spike threshold check — all candle closes qualify regardless of spike size</span>
          <span style="color:#718096;font-size:10px;font-style:italic;">⚠ Research mode — disables the primary signal quality gate</span>
        </div>
      </div>

      <!-- Row 8: Salary / Auto-Withdrawal -->
      <div id="withdrawal-row" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;
        padding:8px 12px;background:#0d1f14;border:1px solid #276749;border-radius:8px;
        font-size:12px;color:#a0aec0;margin-top:10px;">
        <span style="color:#68d391;font-weight:700;font-size:13px;">&#x1F4B0; Salary</span>
        <span id="wd-summary" style="color:#a0aec0;">loading…</span>
        <button onclick="withdrawalCheckNow()" class="btn-chart"
          style="font-size:11px;padding:2px 10px;">Check Now</button>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;">
          <input type="checkbox" id="wd-enabled" onchange="withdrawalToggleEnabled()" style="cursor:pointer;accent-color:#68d391;"/>
          <span>Auto</span>
        </label>
        <button onclick="withdrawalShowConfig()" class="btn-chart"
          style="font-size:11px;padding:2px 10px;background:#1a2a3a;">&#x2699; Config</button>
      </div>
      <!-- Salary config form (hidden by default) -->
      <div id="withdrawal-config-form" style="display:none;padding:10px 12px;
        background:#0a1520;border:1px solid #1a3a50;border-radius:8px;margin-top:6px;
        font-size:12px;color:#a0aec0;">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
          <label style="display:flex;flex-direction:column;gap:3px;">
            <span>Destination Wallet</span>
            <input id="wd-wallet" type="text" placeholder="0x…"
              style="width:340px;background:#0d1117;border:1px solid #2d3748;border-radius:4px;
                color:#e2e8f0;padding:4px 8px;font-size:12px;font-family:monospace;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;">
            <span>Target $</span>
            <input id="wd-target" type="number" min="100" step="100"
              style="width:80px;background:#0d1117;border:1px solid #2d3748;border-radius:4px;
                color:#e2e8f0;padding:4px 6px;font-size:12px;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;">
            <span>Limit $/tx</span>
            <input id="wd-limit" type="number" min="10" step="10"
              style="width:70px;background:#0d1117;border:1px solid #2d3748;border-radius:4px;
                color:#e2e8f0;padding:4px 6px;font-size:12px;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;">
            <span>Min $/tx</span>
            <input id="wd-min" type="number" min="1" step="5"
              style="width:60px;background:#0d1117;border:1px solid #2d3748;border-radius:4px;
                color:#e2e8f0;padding:4px 6px;font-size:12px;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:3px;">
            <span>Cooldown h</span>
            <input id="wd-cooldown" type="number" min="0.5" step="0.5"
              style="width:55px;background:#0d1117;border:1px solid #2d3748;border-radius:4px;
                color:#e2e8f0;padding:4px 6px;font-size:12px;" />
          </label>
          <button onclick="withdrawalSaveConfig()" class="btn-chart"
            style="padding:4px 14px;background:#276749;color:#c6f6d5;">Save</button>
          <button onclick="document.getElementById('withdrawal-config-form').style.display='none'"
            class="btn-chart" style="padding:4px 10px;background:#2d3748;">&#x2715;</button>
        </div>
        <div id="wd-wallet-hint" style="margin-top:6px;font-size:11px;color:#718096;font-family:monospace;display:none;"></div>
      </div>

      <div style="margin-top:8px;font-size:11px;color:#4a5568;">PnL = EOA − base &nbsp;·&nbsp; chart records when EOA settles &amp; no positions in-flight</div>
      <div id="live-reset-at" style="margin-top:6px;font-size:12px;color:#718096;"><svg class="ico ico-sm"><use href="#ico-repeat"/></svg> Last reset: <strong id="live-reset-at-val" style="color:#a0aec0;">—</strong> &nbsp;<span id="live-reset-bal" style="color:#718096;"></span></div>
    </div>

    <!-- Actions -->
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <button class="btn-backfill" id="btn-get-best" onclick="getBestSetup()"><svg class="ico ico-md"><use href="#ico-zap"/></svg> Apply SIM2 Autoscan</button>
      <input type="checkbox" id="lockth-impose" style="display:none;" />
      <button class="btn-score7d" id="btn-score-7d" onclick="score7d()"><svg class="ico ico-md"><use href="#ico-calendar"/></svg> 7d Drift Check</button>
      <button class="btn-save" id="btn-save-setup" onclick="saveSetup()"><svg class="ico ico-md"><use href="#ico-save"/></svg> Save All Settings</button>
      <button class="btn-chart" onclick="exportSettings()" title="Export current LIVE settings to JSON file" style="font-size:11px;padding:2px 10px;"><svg class="ico ico-md"><use href="#ico-download"/></svg> Export Settings</button>
      <label class="btn-chart" title="Load settings from a previously exported JSON file" style="font-size:11px;padding:2px 10px;cursor:pointer;"><svg class="ico ico-md"><use href="#ico-upload"/></svg> Load Settings<input type="file" id="settings-import-input" accept=".json" style="display:none;" onchange="importSettings(event)"/></label>
      <button class="btn-reset" onclick="resetBalance('LIVE')">Reset Polymarket P&amp;L</button>
      <button class="btn-reset" onclick="resetBalance('LIVE_KALSHI')">Reset Kalshi P&amp;L</button>
    </div>

    <!-- 7-day comparison panel (hidden until Score 7d is clicked) -->
    <div id="setup-7d-panel" style="display:none;margin-top:12px;background:#1a2035;border:1px solid #2d3748;border-radius:6px;padding:10px;">
      <div style="font-size:11px;color:#63b3ed;font-weight:600;margin-bottom:8px;"><svg class="ico ico-md"><use href="#ico-calendar"/></svg> LAST 7-DAY PERFORMANCE vs ALL-TIME</div>
      <table id="setup-7d-table" style="width:100%;border-collapse:collapse;font-size:11px;"></table>
      <div id="setup-7d-note" style="font-size:10px;color:#718096;margin-top:6px;"></div>
    </div>

    <!-- Active LIVE Config Summary -->
    <div class="lac-section">
      <div class="lac-title">⚙ Active Config — LIVE</div>
      <div id="live-active-config"><span style="color:#4a5568;font-size:11px;">Loading…</span></div>
    </div>

    <!-- Settings History -->
    <div class="lac-section" id="settings-history-section" style="margin-top:8px;">
      <div class="lac-title" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="toggleSettingsHistory()">
        <span>📋 Settings History <span id="sh-count" style="color:#718096;font-weight:400;">(0)</span></span>
        <span id="sh-chevron" style="color:#718096;font-size:11px;">▼</span>
      </div>
      <div id="settings-history-list" style="display:none;margin-top:8px;max-height:320px;overflow-y:auto;"></div>
    </div>

  </div>
</div>

<!-- C60 panel -->
<div class="t1000-panel" id="panel-C60">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C60" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C60" onchange="toggleStrategy('C60')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C60')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C60')">Reset $</button>
      <button class="btn-chart" onclick="openChart(60)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label">Balance</div>
        <div class="stat-value" id="bal-C60">$1,000.00</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value grey" id="wr-C60">—%</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Wins</div>
        <div class="stat-value green" id="wins-C60">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Losses</div>
        <div class="stat-value red" id="losses-C60">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Pending</div>
        <div class="stat-value grey" id="pend-C60">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Skipped</div>
        <div class="stat-value grey" id="skip-C60">0</div>
      </div>
    </div>
    <div id="log-C60" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C55 panel -->
<div class="t1000-panel" id="panel-C55">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C55" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C55" onchange="toggleStrategy('C55')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C55')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C55')">Reset $</button>
      <button class="btn-chart" onclick="openChart(55)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label">Balance</div>
        <div class="stat-value" id="bal-C55">$1,000.00</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value grey" id="wr-C55">—%</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Wins</div>
        <div class="stat-value green" id="wins-C55">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Losses</div>
        <div class="stat-value red" id="losses-C55">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Pending</div>
        <div class="stat-value grey" id="pend-C55">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Skipped</div>
        <div class="stat-value grey" id="skip-C55">0</div>
      </div>
    </div>
    <div id="log-C55" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C50 panel -->
<div class="t1000-panel" id="panel-C50">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C50" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C50" onchange="toggleStrategy('C50')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C50')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C50')">Reset $</button>
      <button class="btn-chart" onclick="openChart(50)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label">Balance</div>
        <div class="stat-value" id="bal-C50">$1,000.00</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value grey" id="wr-C50">—%</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Wins</div>
        <div class="stat-value green" id="wins-C50">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Losses</div>
        <div class="stat-value red" id="losses-C50">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Pending</div>
        <div class="stat-value grey" id="pend-C50">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Skipped</div>
        <div class="stat-value grey" id="skip-C50">0</div>
      </div>
    </div>
    <div id="log-C50" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C65 panel -->
<div class="t1000-panel" id="panel-C65">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C65" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C65" onchange="toggleStrategy('C65')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C65')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C65')">Reset $</button>
      <button class="btn-chart" onclick="openChart(65)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label">Balance</div>
        <div class="stat-value" id="bal-C65">$1,000.00</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value grey" id="wr-C65">—%</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Wins</div>
        <div class="stat-value green" id="wins-C65">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Losses</div>
        <div class="stat-value red" id="losses-C65">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Pending</div>
        <div class="stat-value grey" id="pend-C65">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Skipped</div>
        <div class="stat-value grey" id="skip-C65">0</div>
      </div>
    </div>
    <div id="log-C65" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C70 panel -->
<div class="t1000-panel" id="panel-C70">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C70" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C70" onchange="toggleStrategy('C70')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C70')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C70')">Reset $</button>
      <button class="btn-chart" onclick="openChart(70)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label">Balance</div>
        <div class="stat-value" id="bal-C70">$1,000.00</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value grey" id="wr-C70">—%</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Wins</div>
        <div class="stat-value green" id="wins-C70">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Losses</div>
        <div class="stat-value red" id="losses-C70">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Pending</div>
        <div class="stat-value grey" id="pend-C70">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Skipped</div>
        <div class="stat-value grey" id="skip-C70">0</div>
      </div>
    </div>
    <div id="log-C70" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C80 panel -->
<div class="t1000-panel" id="panel-C80">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C80" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C80" onchange="toggleStrategy('C80')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C80')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C80')">Reset $</button>
      <button class="btn-chart" onclick="openChart(80)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C80">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C80">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C80">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C80">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C80">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C80">0</div></div>
    </div>
    <div id="log-C80" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C95 panel -->
<div class="t1000-panel" id="panel-C95">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C95" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C95" onchange="toggleStrategy('C95')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C95')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C95')">Reset $</button>
      <button class="btn-chart" onclick="openChart(95)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C95">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C95">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C95">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C95">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C95">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C95">0</div></div>
    </div>
    <div id="log-C95" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C90 panel -->
<div class="t1000-panel" id="panel-C90">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C90" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C90" onchange="toggleStrategy('C90')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C90')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C90')">Reset $</button>
      <button class="btn-chart" onclick="openChart(90)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C90">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C90">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C90">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C90">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C90">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C90">0</div></div>
    </div>
    <div id="log-C90" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C85 panel -->
<div class="t1000-panel" id="panel-C85">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C85" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C85" onchange="toggleStrategy('C85')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C85')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C85')">Reset $</button>
      <button class="btn-chart" onclick="openChart(85)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C85">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C85">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C85">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C85">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C85">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C85">0</div></div>
    </div>
    <div id="log-C85" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C75 panel -->
<div class="t1000-panel" id="panel-C75">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C75" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C75" onchange="toggleStrategy('C75')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C75')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C75')">Reset $</button>
      <button class="btn-chart" onclick="openChart(75)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-label">Balance</div>
        <div class="stat-value" id="bal-C75">$1,000.00</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value grey" id="wr-C75">—%</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Wins</div>
        <div class="stat-value green" id="wins-C75">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Losses</div>
        <div class="stat-value red" id="losses-C75">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Pending</div>
        <div class="stat-value grey" id="pend-C75">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Skipped</div>
        <div class="stat-value grey" id="skip-C75">0</div>
      </div>
    </div>
    <div id="log-C75" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C255 panel -->
<div class="t1000-panel" id="panel-C255">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C255" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C255" onchange="toggleStrategy('C255')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C255')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C255')">Reset $</button>
      <button class="btn-chart" onclick="openChart(255)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C255">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C255">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C255">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C255">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C255">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C255">0</div></div>
    </div>
    <div id="log-C255" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C240 panel -->
<div class="t1000-panel" id="panel-C240">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C240" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C240" onchange="toggleStrategy('C240')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C240')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C240')">Reset $</button>
      <button class="btn-chart" onclick="openChart(240)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C240">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C240">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C240">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C240">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C240">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C240">0</div></div>
    </div>
    <div id="log-C240" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C225 panel -->
<div class="t1000-panel" id="panel-C225">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C225" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C225" onchange="toggleStrategy('C225')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C225')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C225')">Reset $</button>
      <button class="btn-chart" onclick="openChart(225)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C225">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C225">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C225">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C225">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C225">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C225">0</div></div>
    </div>
    <div id="log-C225" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C210 panel -->
<div class="t1000-panel" id="panel-C210">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C210" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C210" onchange="toggleStrategy('C210')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C210')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C210')">Reset $</button>
      <button class="btn-chart" onclick="openChart(210)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C210">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C210">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C210">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C210">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C210">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C210">0</div></div>
    </div>
    <div id="log-C210" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C195 panel -->
<div class="t1000-panel" id="panel-C195">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C195" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C195" onchange="toggleStrategy('C195')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C195')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C195')">Reset $</button>
      <button class="btn-chart" onclick="openChart(195)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C195">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C195">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C195">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C195">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C195">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C195">0</div></div>
    </div>
    <div id="log-C195" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C180 panel -->
<div class="t1000-panel" id="panel-C180">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C180" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C180" onchange="toggleStrategy('C180')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C180')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C180')">Reset $</button>
      <button class="btn-chart" onclick="openChart(180)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C180">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C180">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C180">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C180">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C180">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C180">0</div></div>
    </div>
    <div id="log-C180" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C165 panel -->
<div class="t1000-panel" id="panel-C165">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C165" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C165" onchange="toggleStrategy('C165')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C165')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C165')">Reset $</button>
      <button class="btn-chart" onclick="openChart(165)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C165">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C165">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C165">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C165">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C165">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C165">0</div></div>
    </div>
    <div id="log-C165" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- C150 panel -->
<div class="t1000-panel" id="panel-C150">
  <div class="strat-card">
    <div class="controls-row">
      <div class="threshold-wrap">
        <label>minSpike:</label>
        <input type="number" id="thresh-C150" step="0.01" min="0.05" max="5" value="0.24" />
        <span style="color:#718096;font-size:12px;">%</span>
      </div>
      <div class="threshold-wrap">
        <label>minPrice:</label>
        <input type="number" class="minprice-input" step="1" min="0" max="99" value="5" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>maxPrice:</label>
        <input type="number" class="maxprice-input" step="1" min="1" max="99" value="90" />
        <span style="color:#718096;font-size:12px;">¢</span>
      </div>
      <div class="threshold-wrap">
        <label>Max$:</label>
        <input type="number" class="maxtrade-input" step="1" min="1" max="9999" value="150" />
        <span style="color:#718096;font-size:12px;">$</span>
      </div>
      <div class="toggle-wrap">
        <label class="toggle-label">Enable</label>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-C150" onchange="toggleStrategy('C150')" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="btn-save" onclick="saveConfig('C150')">Save</button>
      <button class="btn-reset" onclick="resetBalance('C150')">Reset $</button>
      <button class="btn-chart" onclick="openChart(150)"><svg class="ico ico-md"><use href="#ico-bar-chart"/></svg> Chart</button>
    </div>
    <div class="per-crypto-thresholds">
      <span class="pct-label">Per-crypto minSpike:</span>
      <label>BTC</label><input type="number" class="thresh-crypto-input" data-crypto="BTC" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>ETH</label><input type="number" class="thresh-crypto-input" data-crypto="ETH" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>SOL</label><input type="number" class="thresh-crypto-input" data-crypto="SOL" step="0.01" min="0.05" max="5" placeholder="—" />%
      <label>XRP</label><input type="number" class="thresh-crypto-input" data-crypto="XRP" step="0.01" min="0.05" max="5" placeholder="—" />%
    </div>
    <div class="stats-bar">
      <div class="stat-item"><div class="stat-label">Balance</div><div class="stat-value" id="bal-C150">$1,000.00</div></div>
      <div class="stat-item"><div class="stat-label">Win Rate</div><div class="stat-value grey" id="wr-C150">—%</div></div>
      <div class="stat-item"><div class="stat-label">Wins</div><div class="stat-value green" id="wins-C150">0</div></div>
      <div class="stat-item"><div class="stat-label">Losses</div><div class="stat-value red" id="losses-C150">0</div></div>
      <div class="stat-item"><div class="stat-label">Pending</div><div class="stat-value grey" id="pend-C150">0</div></div>
      <div class="stat-item"><div class="stat-label">Skipped &gt;90¢</div><div class="stat-value grey" id="skip-C150">0</div></div>
    </div>
    <div id="log-C150" class="activity-log"><div class="empty-log">No activity yet</div></div>
  </div>
</div>

<!-- Trade Config popup modal -->
<div id="tradeConfigOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9500;align-items:center;justify-content:center;" onclick="if(event.target===this)closeTradeConfig()">
  <div style="background:#1a202c;border:1px solid #4a5568;border-radius:10px;padding:20px 24px;min-width:300px;max-width:430px;box-shadow:0 20px 60px rgba(0,0,0,0.8);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <span id="tradeConfigTitle" style="font-size:14px;font-weight:700;color:#e2e8f0;letter-spacing:.04em;">Trade Config</span>
      <button onclick="closeTradeConfig()" style="background:none;border:none;color:#718096;font-size:22px;cursor:pointer;padding:0 4px;line-height:1;">&times;</button>
    </div>
    <div id="tradeConfigBody"></div>
    <div style="margin-top:12px;text-align:right;"><span style="font-size:10px;color:#4a5568;">Click outside or &times; to close</span></div>
  </div>
</div>

<!-- Chart modal -->
<div class="chart-overlay" id="chartOverlay" onclick="chartOverlayClick(event)">
  <div class="chart-modal" id="chartModalBox">
    <div class="chart-modal-header">
      <span class="chart-modal-title" id="chartModalTitle">Chart</span>
      <button class="chart-modal-close" onclick="closeChart()">&times;</button>
    </div>
    <div class="chart-crypto-btns">
      <button class="chart-crypto-btn active" data-crypto="BTC" onclick="switchChartCrypto('BTC')">BTC</button>
      <button class="chart-crypto-btn" data-crypto="ETH" onclick="switchChartCrypto('ETH')">ETH</button>
      <button class="chart-crypto-btn" data-crypto="SOL" onclick="switchChartCrypto('SOL')">SOL</button>
      <button class="chart-crypto-btn" data-crypto="XRP" onclick="switchChartCrypto('XRP')">XRP</button>
    </div>
    <div id="chartViewToggle" style="display:flex;gap:6px;margin-bottom:10px;align-items:center;">
      <span style="font-size:11px;color:#718096;flex-shrink:0;">View:</span>
      <button id="chart-mode-all-btn" class="btn-chart active" onclick="setChartViewMode('all')" style="font-size:11px;padding:2px 10px;">All Spikes</button>
      <button id="chart-mode-trade-btn" class="btn-chart" onclick="setChartViewMode('trade')" style="font-size:11px;padding:2px 10px;opacity:0.5;cursor:not-allowed;" disabled>This Trade</button>
    </div>
    <div id="chartContainer" class="chart-container">
      <div class="chart-loading">Loading...</div>
    </div>
  </div>
</div>

<!-- Live Trading Auth Modal -->
<div id="liveAuthOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;align-items:center;justify-content:center;">
  <div style="background:#1a202c;border:1px solid #4a5568;border-radius:12px;padding:28px 32px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.7);">
    <div style="font-size:15px;font-weight:700;color:#e2e8f0;margin-bottom:6px;"><svg class="ico ico-md"><use href="#ico-lock"/></svg> Confirmation required</div>
    <div id="liveAuthLabel" style="font-size:12px;color:#a0aec0;margin-bottom:10px;"></div>
    <div id="liveAuthWarn" style="display:none;background:#2d2008;border:1px solid #744210;border-radius:6px;padding:8px 12px;font-size:12px;color:#f6ad55;margin-bottom:12px;line-height:1.5;"></div>
    <input id="liveAuthInput" type="password" placeholder="Password"
      autocapitalize="none" autocorrect="off" autocomplete="current-password" spellcheck="false"
      style="width:100%;background:#2d3748;border:1px solid #4a5568;border-radius:6px;color:#e2e8f0;font-size:14px;padding:9px 12px;outline:none;box-sizing:border-box;"
      onkeydown="if(event.key==='Enter')liveAuthSubmit();if(event.key==='Escape')liveAuthCancel();" />
    <div id="liveAuthError" style="display:none;color:#fc8181;font-size:12px;margin-top:8px;">Incorrect password.</div>
    <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end;">
      <button onclick="liveAuthCancel()" style="background:#2d3748;border:1px solid #4a5568;color:#a0aec0;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:13px;">Cancel</button>
      <button onclick="liveAuthSubmit()" style="background:#e53e3e;border:none;color:#fff;border-radius:6px;padding:7px 18px;cursor:pointer;font-size:13px;font-weight:600;">Confirm</button>
    </div>
  </div>
</div>

<!-- PnL Chart Overlay -->
<div class="chart-overlay" id="pnlOverlay" onclick="pnlOverlayClick(event)">
  <div class="chart-modal" id="pnlModalBox">
    <div class="chart-modal-header">
      <span class="chart-modal-title">LIVE P&amp;L Evolution</span>
      <button class="chart-modal-close" onclick="closePnlChart()">&times;</button>
    </div>
    <div id="pnlChartContainer" class="chart-container">
      <div class="chart-loading">No data</div>
    </div>
  </div>
</div>

<!-- Rejected Signals Modal -->
<div class="chart-overlay" id="rejOverlay" onclick="rejOverlayClick(event)">
  <div class="chart-modal" id="rejModalBox" style="width:98vw;max-width:98vw;max-height:88vh;display:flex;flex-direction:column;">
    <div class="chart-modal-header">
      <span class="chart-modal-title">Rejected Signals — LIVE</span>
      <div style="display:flex;align-items:center;gap:14px;">
        <span id="rej-modal-count" style="font-size:12px;color:#718096;"></span>
        <span id="rej-modal-wr" style="font-size:12px;display:none;"></span>
        <label style="font-size:12px;color:#718096;display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" id="rej-show-all" onchange="renderRejModal()" style="cursor:pointer;"> incl. below-threshold
        </label>
        <button class="chart-modal-close" onclick="closeRejModal()">&times;</button>
      </div>
    </div>
    <!-- Warning banner -->
    <div style="background:#2d1515;border:1px solid #7f1d1d;border-radius:6px;padding:8px 14px;margin-bottom:10px;font-size:12px;color:#fca5a5;line-height:1.5;">
      <strong style="color:#f87171;">⚠ Do not use these rejected signals to loosen filters.</strong>
      Simulations confirmed (Mar 2026): <strong>coord_wait</strong> signals have only 78% WR (vs 97% coordinated) — removing coord costs −$301 PnL over 31d despite more trades.
      <strong>circuit_breaker</strong> blocks are post-loss noise; CB rarely fires with maxPos=1+coord=2 (blocked 1 trade / 31d, cost $5).
      High WR on rejected signals is expected and misleading — the filters are correct. Keep settings as-is.
    </div>
    <!-- Stats panel -->
    <div id="rej-stats-panel" style="display:none;background:#111820;border:1px solid #2d3748;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:12px;"></div>
    <!-- Reason filter pills -->
    <div id="rej-filter-row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;"></div>
    <!-- Table -->
    <div style="overflow-y:auto;flex:1;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;" id="rej-modal-table">
        <thead>
          <tr style="background:#161c22;color:#718096;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">
            <th style="padding:7px 10px;text-align:left;border-bottom:1px solid #2d3748;white-space:nowrap;">Time</th>
            <th style="padding:7px 10px;text-align:left;border-bottom:1px solid #2d3748;">Crypto</th>
            <th style="padding:7px 10px;text-align:left;border-bottom:1px solid #2d3748;">Candle</th>
            <th style="padding:7px 10px;text-align:left;border-bottom:1px solid #2d3748;">Slot</th>
            <th style="padding:7px 10px;text-align:left;border-bottom:1px solid #2d3748;">Dir</th>
            <th style="padding:7px 10px;text-align:right;border-bottom:1px solid #2d3748;">Body%</th>
            <th style="padding:7px 10px;text-align:right;border-bottom:1px solid #2d3748;">Spike</th>
            <th style="padding:7px 10px;text-align:right;border-bottom:1px solid #2d3748;">Entry</th>
            <th style="padding:7px 10px;text-align:left;border-bottom:1px solid #2d3748;">Reason</th>
            <th style="padding:7px 10px;text-align:left;border-bottom:1px solid #2d3748;color:#4a5568;">Detail</th>
            <th style="padding:7px 10px;text-align:left;border-bottom:1px solid #2d3748;">Outcome</th>
          </tr>
        </thead>
        <tbody id="rej-modal-body">
          <tr><td colspan="11" style="padding:20px;text-align:center;color:#718096;">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
<?php $b = BASE_PATH; ?>
<script src="<?= $b ?>/assets/js/t1000-core.js"></script>
<script src="<?= $b ?>/assets/js/t1000-positions.js"></script>
<script src="<?= $b ?>/assets/js/t1000-trades.js"></script>
<script src="<?= $b ?>/assets/js/t1000-charts.js"></script>
<script src="<?= $b ?>/assets/js/t1000-rejection.js"></script>
<script src="<?= $b ?>/assets/js/t1000-export.js"></script>
<script src="<?= $b ?>/assets/js/t1000-settings.js"></script>

<!-- ── PIN Authorization Modal ───────────────────────────────────────────── -->
<div id="wd-pin-modal">
  <div id="wd-pin-dialog">
    <div style="color:#68d391;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;">
      &#x1F512; Withdrawal Authorization
    </div>
    <div style="color:#4a5568;font-size:11px;margin-bottom:4px;">Enter PIN to continue</div>
    <div id="wd-pin-display">&#x25CF;&#x25CF;&#x25CF;&#x25CF;&#x25CF;&#x25CF;&#x25CF;&#x25CF;</div>
    <div id="wd-pin-msg"></div>
    <div id="wd-pin-grid">
      <button class="pin-btn" onclick="pinDigit('1')">1</button>
      <button class="pin-btn" onclick="pinDigit('2')">2</button>
      <button class="pin-btn" onclick="pinDigit('3')">3</button>
      <button class="pin-btn" onclick="pinDigit('4')">4</button>
      <button class="pin-btn" onclick="pinDigit('5')">5</button>
      <button class="pin-btn" onclick="pinDigit('6')">6</button>
      <button class="pin-btn" onclick="pinDigit('7')">7</button>
      <button class="pin-btn" onclick="pinDigit('8')">8</button>
      <button class="pin-btn" onclick="pinDigit('9')">9</button>
      <button class="pin-btn pin-fn" onclick="pinClear()">C</button>
      <button class="pin-btn" onclick="pinDigit('0')">0</button>
      <button class="pin-btn pin-fn" onclick="pinBackspace()">&#x232B;</button>
    </div>
    <button onclick="closePinModal()"
      style="margin-top:14px;background:none;border:none;color:#4a5568;
        font-size:11px;cursor:pointer;text-decoration:underline;font-family:monospace;">
      Cancel
    </button>
  </div>
</div>

<!-- ── Withdrawal History Modal ──────────────────────────────────────────── -->
<div id="wd-history-modal" style="display:none;position:fixed;inset:0;z-index:9998;
  background:rgba(0,0,0,0.75);align-items:center;justify-content:center;">
  <div style="background:#1a2035;border:1px solid #276749;border-radius:12px;
    padding:24px;width:min(820px,96vw);max-height:80vh;display:flex;flex-direction:column;
    box-shadow:0 24px 64px rgba(0,0,0,0.7);">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div>
        <span style="color:#68d391;font-size:14px;font-weight:700;">&#x1F4B8; Withdrawal History</span>
        <span id="wd-hist-summary" style="color:#718096;font-size:12px;margin-left:12px;"></span>
      </div>
      <button onclick="closeWithdrawalHistory()"
        style="background:none;border:none;color:#718096;font-size:18px;cursor:pointer;line-height:1;padding:0 4px;">&#x2715;</button>
    </div>
    <!-- Table -->
    <div style="overflow-y:auto;flex:1;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid #2d3748;">
            <th style="text-align:left;padding:6px 10px;color:#718096;font-weight:600;white-space:nowrap;">Date / Time (EAT)</th>
            <th style="text-align:right;padding:6px 10px;color:#718096;font-weight:600;">Amount</th>
            <th style="text-align:left;padding:6px 10px;color:#718096;font-weight:600;">Destination (EOA)</th>
            <th style="text-align:left;padding:6px 10px;color:#718096;font-weight:600;">TX Hash</th>
          </tr>
        </thead>
        <tbody id="wd-hist-tbody">
          <tr><td colspan="4" style="text-align:center;padding:20px;color:#4a5568;">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
