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
<script>
const API_BASE = 'https://jeer.currenciary.com/api';
const STRAT_KEYS = ['LIVE', 'LIVE_KALSHI', 'LIVE_MINI', 'C95', 'C90', 'C85', 'C80', 'C75', 'C70', 'C65', 'C60', 'C55', 'C50',
                    'C255', 'C240', 'C225', 'C210', 'C195', 'C180', 'C165', 'C150'];
// Map from stratKey → tabKey (for badge tracking)
const KEY_TO_TAB = { 'LIVE': 'POLYMARKET', 'LIVE_KALSHI': 'KALSHI', 'LIVE_MINI': 'MINI' };
let currentTab    = 'POLYMARKET';
let currentLiveTab  = 'POLYMARKET';
let currentPaperTab = 'C85';
let currentSection  = 'LIVE';
let state = {};
let livePrices = {};  // { BTC: { up, down, up_bid, down_bid, updatedAt }, ... }
let liveFillPending = { '5m': false, '15m': false };
let setupDirty = false; // true once user edits any SETUP field; blocks poll overwrites
let miniDirty  = false; // true once user edits any MINI config field; blocks poll overwrites
let lastLiveEoa        = null; // tracks last seen EOA for LIVE
let lastLiveRedeemable = null; // tracks last seen redeemable for LIVE
let lastLiveLocked     = null; // tracks last seen locked for LIVE

// ── Frontend polymarket URL builder ───────────────────────────────────────────
const POLY_SLUG_FE = {
  BTC: { 5: 'btc-updown-5m',  15: 'btc-updown-15m' },
  ETH: { 5: 'eth-updown-5m',  15: 'eth-updown-15m' },
  SOL: { 5: 'sol-updown-5m',  15: 'sol-updown-15m' },
  XRP: { 5: 'xrp-updown-5m',  15: 'xrp-updown-15m' },
};
function polyUrlFE(crypto, cycleStartMs, candleSize) {
  const dur  = candleSize >= 150 ? 15 : 5;
  const slug = POLY_SLUG_FE[crypto]?.[dur];
  return slug ? `https://polymarket.com/event/${slug}-${Math.round(cycleStartMs / 1000)}` : null;
}

// ── New-item badge tracking ───────────────────────────────────────────────────
const unreadCount  = Object.fromEntries(STRAT_KEYS.map(k => [k, 0]));
const prevLogCount = Object.fromEntries(STRAT_KEYS.map(k => [k, 0]));

function countVisible(log) {
  return log.filter(e =>
    e.status !== 'SKIP' &&
    e.status !== 'OPEN'
  ).length;
}

function updateTabBadge(key) {
  const el = document.getElementById(`new-badge-${key}`);
  if (!el) return;
  if (unreadCount[key] > 0) {
    el.textContent = unreadCount[key];
    el.style.display = 'inline-block';
  } else {
    el.style.display = 'none';
  }
}

// ── Section switching (LIVE / PAPER) ─────────────────────────────────────────
function switchSection(section) {
  currentSection = section;
  document.querySelectorAll('.section-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.section === section)
  );
  document.getElementById('live-subtabs').style.display  = section === 'LIVE'  ? '' : 'none';
  document.getElementById('paper-subtabs').style.display = section === 'PAPER' ? '' : 'none';
  if (section === 'LIVE') {
    switchTab(currentLiveTab || 'POLYMARKET');
  } else {
    switchTab(currentPaperTab || 'C85');
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  // Track last active tab per section
  if (['POLYMARKET', 'KALSHI', 'MINI', 'STATS', 'SETUP'].includes(tab)) currentLiveTab  = tab;
  else                                                                      currentPaperTab = tab;

  currentTab = tab;
  document.querySelectorAll('.t1000-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.t1000-panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${tab}`);
  });
  // Clear badge for this tab — use KEY_TO_TAB reverse lookup
  const stratKey = Object.keys(KEY_TO_TAB).find(k => KEY_TO_TAB[k] === tab) || tab;
  unreadCount[stratKey] = 0;
  updateTabBadge(stratKey);
  // Lazy-load Signal Stats on first visit
  if (tab === 'STATS') {
    initStatsRange();
    const sbody = document.getElementById('signal-stats-body');
    if (sbody && sbody.querySelector('[onclick="loadSignalStats()"]')) loadSignalStats();
  }
}

// ── Log sub-tab switching ─────────────────────────────────────────────────────
function switchLogTab(tab) {
  const tabs = ['recent', 'rejected', 'allTrades', 'trioperf'];
  for (const t of tabs) {
    const btn     = document.getElementById(`ltab-btn-${t}`);
    const content = document.getElementById(`ltab-${t}`);
    if (btn)     btn.classList.toggle('active', t === tab);
    if (content) content.style.display = t === tab ? '' : 'none';
  }
  // Auto-load All Trades on first visit
  if (tab === 'allTrades') {
    const body = document.getElementById('all-trades-body');
    if (body && body.querySelector('[onclick="loadAllTrades(1)"]')) loadAllTrades(1);
  }
  // Refresh rejected stats when switching to that tab
  if (tab === 'rejected') renderRejectedStats();
  // Render trio performance when switching to that tab
  if (tab === 'trioperf') renderTrioPerf();
}

function renderTrioPerf() {
  const body = document.getElementById('trio-perf-body');
  if (!body) return;

  // Combine LIVE + MINI activity logs; optionally limit to last N resolved trades
  const limitEl  = document.getElementById('trio-perf-limit');
  const limitVal = limitEl ? parseInt(limitEl.value) : 200;
  const limit    = (!limitEl?.value?.trim() || isNaN(limitVal) || limitVal <= 0) ? Infinity : limitVal;
  const liveLog  = (state['LIVE']?.activityLog || []);
  const miniLog  = (state['LIVE_MINI']?.activityLog || []).map(e => ({...e, _isMini: true}));
  const resolved = [...liveLog, ...miniLog]
    .filter(e => e.status === 'WIN' || e.status === 'LOSS')
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, limit);

  if (!resolved.length) {
    body.innerHTML = '<div style="color:#718096;padding:20px;text-align:center;">No resolved trades yet</div>';
    return;
  }

  // Group by source (LIVE/MINI) + crypto + candle_size
  // Also track the most-recently-used threshold for each group
  const groups = {};
  for (const e of resolved) {
    const cs = parseInt(e.candle_size);
    if (!cs || !e.crypto) continue;
    const src  = e._isMini ? 'MINI' : 'LIVE';
    const gkey = `${src}_${e.crypto}_${cs}`;
    if (!groups[gkey]) groups[gkey] = { src, crypto: e.crypto, cs, wins: 0, losses: 0, upWins: 0, upLosses: 0, downWins: 0, downLosses: 0, threshold: null };
    const isWin = e.status === 'WIN';
    if (isWin) groups[gkey].wins++;
    else groups[gkey].losses++;
    if (e.direction === 'UP') { if (isWin) groups[gkey].upWins++; else groups[gkey].upLosses++; }
    else if (e.direction === 'DOWN') { if (isWin) groups[gkey].downWins++; else groups[gkey].downLosses++; }
    // Capture threshold from the most recent trade that has it
    if (groups[gkey].threshold == null && e.threshold != null)
      groups[gkey].threshold = parseFloat(e.threshold);
  }

  // Get currently configured trio periods from LIVE state
  const liveCfg = state['LIVE'] || {};
  const isActivePeriod = (crypto, cs) => {
    const is15m = cs >= 150;
    const key   = is15m ? `strategy15m_${crypto}` : `strategy5m_${crypto}`;
    const val   = liveCfg[key];
    return val === `C${cs}` || val === cs || String(val) === String(cs);
  };

  // Sort: best WR% first within each group (with min-sample weighting)
  // Groups with <3 trades go to bottom; ties broken by total desc then crypto order
  const cryptoOrder = ['BTC', 'ETH', 'SOL', 'XRP'];
  const sorted = Object.values(groups).sort((a, b) => {
    const aTot = a.wins + a.losses, bTot = b.wins + b.losses;
    const aLow = aTot < 3, bLow = bTot < 3;
    if (aLow !== bLow) return aLow ? 1 : -1;           // low-sample rows last
    const aWr = aTot > 0 ? a.wins / aTot : 0;
    const bWr = bTot > 0 ? b.wins / bTot : 0;
    if (Math.abs(bWr - aWr) > 0.001) return bWr - aWr; // higher WR first
    if (bTot !== aTot) return bTot - aTot;              // more trades first on tie
    const ci = cryptoOrder.indexOf(a.crypto) - cryptoOrder.indexOf(b.crypto);
    return ci !== 0 ? ci : a.cs - b.cs;
  });

  const cryptoColors = { BTC: '#f6ad55', ETH: '#63b3ed', SOL: '#b794f4', XRP: '#76e4f7' };
  const fs = '15.6px'; // 12px × 1.3 ≈ 15.6px
  const periodLabel = isFinite(limit) ? `last ${resolved.length}` : `all ${resolved.length}`;
  let html = `<div style="font-size:11px;color:#718096;margin-bottom:10px;">${periodLabel} resolved trades (LIVE + MINI) — ★ = active trio · best WR% first</div>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:${fs};">
    <thead><tr style="color:#718096;border-bottom:2px solid #2d3748;font-size:12px;">
      <th style="text-align:left;padding:6px 8px;font-weight:500;">Crypto</th>
      <th style="text-align:left;padding:6px 8px;font-weight:500;">Period</th>
      <th style="text-align:center;padding:6px 8px;font-weight:500;">TF</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;color:#68d391;">W</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;color:#fc8181;">L</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;">Total</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;">WR%</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;color:#68d391;border-left:1px solid #2d3748;">↑ UP</th>
      <th style="text-align:right;padding:6px 8px;font-weight:500;color:#fc8181;">↓ DOWN</th>
    </tr></thead><tbody>`;

  for (const g of sorted) {
    const is15m  = g.cs >= 150;
    const tf     = is15m ? '15m' : '5m';
    const total  = g.wins + g.losses;
    const wr     = total > 0 ? g.wins / total * 100 : 0;
    const active = isActivePeriod(g.crypto, g.cs);

    const wrColor  = wr >= 90 ? '#68d391' : wr >= 80 ? '#f6e05e' : wr >= 70 ? '#f6ad55' : '#fc8181';
    const rowStyle = active ? 'background:#1c2e1c;' : (total < 3 ? 'opacity:.55;' : '');
    const miniBadge = g.src === 'MINI' ? ' <span style="font-size:9px;color:#b794f4;background:#2d1f4e;padding:1px 4px;border-radius:2px;vertical-align:middle;">MINI</span>' : '';
    const starBadge = active ? ' <span style="color:#68d391;font-size:14px;line-height:1;" title="Active trio">★</span>' : '';
    const thStr = g.threshold != null ? `${g.threshold.toFixed(2)}%` : '—';

    const upTotal  = g.upWins + g.upLosses;
    const downTotal = g.downWins + g.downLosses;
    const upWr   = upTotal   > 0 ? g.upWins   / upTotal   * 100 : null;
    const downWr = downTotal > 0 ? g.downWins / downTotal * 100 : null;
    const dirCell = (w, l, wr) => {
      if (w + l === 0) return '<span style="color:#4a6080">—</span>';
      const wrColor2 = wr >= 90 ? '#68d391' : wr >= 80 ? '#f6e05e' : wr >= 70 ? '#f6ad55' : '#fc8181';
      return `<span style="color:#68d391">${w}W</span> <span style="color:#fc8181">${l}L</span> <span style="color:${wrColor2};font-weight:700">${wr.toFixed(0)}%</span>`;
    };
    html += `<tr style="${rowStyle}border-bottom:1px solid #1a202c;">
      <td style="padding:6px 8px;color:${cryptoColors[g.crypto]||'#e2e8f0'};font-weight:600;">${g.crypto}${miniBadge}${starBadge}</td>
      <td style="padding:6px 8px;color:#e2e8f0;font-family:monospace;font-weight:600;">C${g.cs}</td>
      <td style="padding:6px 8px;text-align:center;color:#a0aec0;">${tf}</td>
      <td style="padding:6px 8px;text-align:right;color:#68d391;font-weight:600;">${g.wins}</td>
      <td style="padding:6px 8px;text-align:right;color:#fc8181;font-weight:600;">${g.losses}</td>
      <td style="padding:6px 8px;text-align:right;color:#718096;">${total}</td>
      <td style="padding:6px 8px;text-align:right;color:${wrColor};font-weight:700;">${wr.toFixed(1)}%</td>
      <td style="padding:6px 8px;text-align:right;border-left:1px solid #1a202c;">${dirCell(g.upWins, g.upLosses, upWr)}</td>
      <td style="padding:6px 8px;text-align:right;">${dirCell(g.downWins, g.downLosses, downWr)}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  body.innerHTML = html;
}

function switchKalshiLogTab(tab) {
  const tabs = ['recent', 'allTrades'];
  for (const t of tabs) {
    const btn     = document.getElementById(`kltab-btn-${t}`);
    const content = document.getElementById(`kltab-${t}`);
    if (btn)     btn.classList.toggle('active', t === tab);
    if (content) content.style.display = t === tab ? '' : 'none';
  }
  // Auto-load All Trades on first visit
  if (tab === 'allTrades') {
    const body = document.getElementById('kalshi-all-trades-body');
    if (body && body.querySelector('[onclick="loadAllTradesKalshi(1)"]')) loadAllTradesKalshi(1);
  }
}

// ── Toggle enable/disable ─────────────────────────────────────────────────────
function toggleStrategy(key) {
  const chk     = document.getElementById(`toggle-${key}`);
  const enabled = chk.checked;

  // Password gate: only for LIVE keys (LIVE + LIVE_KALSHI + LIVE_MINI)
  if (key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI') {
    // Revert checkbox immediately — will re-apply after correct password
    chk.checked = !enabled;
    showLivePasswordModal(key, enabled);
    return;
  }

  apiFetch('/t1000/config', 'POST', { stratKey: key, enabled });
}

async function saveMiniConfig() {
  miniDirty = false;
  const maxPos  = parseInt(document.getElementById('mini-max-pos')?.value  || 2);
  const riskDiv = Math.max(1, parseInt(document.getElementById('mini-risk-divisor')?.value || 3));
  await apiFetch('/t1000/config', 'POST', {
    stratKey: 'LIVE_MINI', maxPositions: maxPos, riskDivisor: riskDiv,
  });
}

async function resetMiniBalance() {
  if (!confirm('Reset LIVE_MINI stats? Win/loss/PnL counters will be cleared.')) return;
  await apiFetch('/t1000/config', 'POST', {
    stratKey: 'LIVE_MINI',
    tradeListClearedAt: new Date().toISOString(),
  });
}

function showLivePasswordModal(key, wantEnabled) {
  const overlay = document.getElementById('liveAuthOverlay');
  const inp     = document.getElementById('liveAuthInput');
  const err     = document.getElementById('liveAuthError');
  const warn    = document.getElementById('liveAuthWarn');
  const label   = document.getElementById('liveAuthLabel');
  label.textContent = `${wantEnabled ? 'Enable' : 'Disable'} ${key === 'LIVE_KALSHI' ? 'Kalshi Live' : key === 'LIVE_MINI' ? 'Live Mini' : 'Live'} trading`;
  inp.value = '';
  err.style.display = 'none';

  // When disabling: warn if open positions exist — they will still be resolved
  if (!wantEnabled && key === 'LIVE') {
    const openTrades = (state.LIVE?.activityLog || []).filter(e => e.status === 'OPEN');
    if (openTrades.length > 0) {
      const names = openTrades.map(e => e.crypto).join(', ');
      warn.innerHTML = `&#x26A0;&#xFE0F; <b>${openTrades.length} open position${openTrades.length > 1 ? 's' : ''}</b> (${names}) will continue to be monitored and resolved automatically. Redemptions will also be processed. No new trades will be placed.`;
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }
  } else {
    warn.style.display = 'none';
  }

  overlay.style.display = 'flex';
  inp.focus();

  // Store pending action
  overlay._key         = key;
  overlay._wantEnabled = wantEnabled;
}

function liveAuthSubmit() {
  const overlay = document.getElementById('liveAuthOverlay');
  const inp     = document.getElementById('liveAuthInput');
  const err     = document.getElementById('liveAuthError');
  const pw      = inp.value;
  if (pw.trim().toLowerCase() !== 'janjy20142004197419722008') {
    err.style.display = 'block';
    inp.select();
    return;
  }
  overlay.style.display = 'none';
  // Generic callback path (save-settings password gate)
  if (overlay._callback) {
    const cb = overlay._callback;
    overlay._callback = null;
    cb();
    return;
  }
  // Default: toggle enable/disable for LIVE keys
  const key     = overlay._key;
  const enabled = overlay._wantEnabled;
  document.getElementById(`toggle-${key}`).checked = enabled;
  apiFetch('/t1000/config', 'POST', { stratKey: key, enabled });
}

function liveAuthCancel() {
  const overlay = document.getElementById('liveAuthOverlay');
  overlay._callback = null;
  overlay.style.display = 'none';
}

function requirePassword(cb, label) {
  const overlay = document.getElementById('liveAuthOverlay');
  const inp     = document.getElementById('liveAuthInput');
  const err     = document.getElementById('liveAuthError');
  document.getElementById('liveAuthLabel').textContent = label || 'Enter password to continue';
  document.getElementById('liveAuthWarn').style.display = 'none';
  inp.value = '';
  err.style.display = 'none';
  overlay._callback    = cb;
  overlay._key         = null;
  overlay._wantEnabled = null;
  overlay.style.display = 'flex';
  setTimeout(() => inp.focus(), 10);
}

// ── Save threshold + strategy ─────────────────────────────────────────────────
async function saveConfig(key, _authed = false) {
  if (key === 'LIVE' && !_authed) { requirePassword(() => saveConfig(key, true), 'Save LIVE configuration'); return; }
  let payload;

  if (key === 'LIVE') {
    // LIVE uses dual-duration params; no generic threshold/minPrice/maxPrice/maxTrade
    const thresh5m  = parseFloat(document.getElementById('live-thresh5m').value);
    const thresh15m = parseFloat(document.getElementById('live-thresh15m').value);
    if (isNaN(thresh5m) || thresh5m <= 0 || isNaN(thresh15m) || thresh15m <= 0) {
      alert('Invalid spike threshold'); return;
    }
    const mn5    = parseFloat(document.getElementById('live-minprice5m').value);
    const mx5    = parseFloat(document.getElementById('live-maxprice5m').value);
    const mxt1_5c = parseFloat(document.getElementById('live-mxt1-5m').value);
    const mt5    = parseFloat(document.getElementById('live-maxtrade5m').value);
    const mn15    = parseFloat(document.getElementById('live-minprice15m').value);
    const mx15    = parseFloat(document.getElementById('live-maxprice15m').value);
    const mxt1_15c = parseFloat(document.getElementById('live-mxt1-15m').value);
    const mxt1_st  = parseFloat(document.getElementById('live-mxt1-standalone').value);
    const mt15    = parseFloat(document.getElementById('live-maxtrade15m').value);
    if ([mn5, mx5, mxt1_5c, mt5, mn15, mx15, mxt1_15c, mt15].some(isNaN)) {
      alert('Invalid parameter value'); return;
    }
    const baseEoa  = parseFloat(document.getElementById('live-base-eoa')?.value);
    const riskPctV = parseFloat(document.getElementById('live-risk-pct')?.value);
    const maxPosV  = parseInt(document.getElementById('live-max-positions')?.value);
    const t1ModeV2  = document.getElementById('live-t1-mode')?.checked;
    payload = {
      stratKey       : 'LIVE',
      strategy5m     : document.getElementById('live-strategy5m').value,
      threshold5m    : thresh5m,
      minPrice5m     : mn5     / 100,
      maxPrice5m     : mx5     / 100,
      maxPriceT1_5m  : mxt1_5c / 100,
      maxTrade5m     : mt5,
      strategy15m    : document.getElementById('live-strategy15m').value,
      threshold15m   : thresh15m,
      minPrice15m    : mn15     / 100,
      maxPrice15m    : mx15     / 100,
      maxPriceT1_15m       : mxt1_15c / 100,
      maxPriceT1standalone : isNaN(mxt1_st) ? undefined : mxt1_st / 100,
      maxTrade15m          : mt15,
      ...(isNaN(baseEoa)  ? {} : { baseEoaBalance: baseEoa }),
      ...(isNaN(riskPctV) ? {} : { riskPct: riskPctV / 100 }),
      ...(isNaN(maxPosV) || maxPosV < 1 ? {} : { maxPositions: maxPosV }),
      ...(t1ModeV2  !== undefined ? { t1Mode: t1ModeV2 }         : {}),
      ...(document.getElementById('live-t1-standalone') !== null ? { t1standalone: document.getElementById('live-t1-standalone').checked } : {}),
      ...(document.getElementById('live-t0') !== null ? { t0off: !document.getElementById('live-t0').checked } : {}),
    };
    // Per-crypto thresholds + Cxx overrides for LIVE (5m and 15m)
    for (const el of document.querySelectorAll('#panel-SETUP .thresh-crypto-input[data-strat="LIVE"]')) {
      const cr = el.dataset.crypto, dur = el.dataset.dur;
      payload[`threshold${dur}_${cr}`] = el.value.trim() !== '' ? parseFloat(el.value) : null;
    }
    for (const el of document.querySelectorAll('#panel-SETUP .strat-crypto-select[data-strat="LIVE"]')) {
      const cr = el.dataset.crypto, dur = el.dataset.dur;
      payload[`strategy${dur}_${cr}`] = el.value || null;
    }
    // Threshold locks — build map of locked fields
    const lockedThresholds = {};
    document.querySelectorAll('#panel-SETUP .th-lock-btn[data-strat="LIVE"]').forEach(btn => {
      if (btn.dataset.locked === '1')
        lockedThresholds[`threshold${btn.dataset.dur}_${btn.dataset.crypto}`] = true;
    });
    payload.lockedThresholds = lockedThresholds;
  } else {
    const threshold = parseFloat(document.getElementById(`thresh-${key}`).value);
    if (isNaN(threshold) || threshold <= 0) {
      alert('Invalid threshold'); return;
    }
    const minPriceEl = document.querySelector(`#panel-${key} .minprice-input`);
    const minPriceCents = minPriceEl ? parseFloat(minPriceEl.value) : 5;
    if (isNaN(minPriceCents) || minPriceCents < 0 || minPriceCents > 99) {
      alert('Invalid min price (must be 0–99¢)'); return;
    }
    const maxPriceEl = document.querySelector(`#panel-${key} .maxprice-input`);
    const maxPriceCents = maxPriceEl ? parseFloat(maxPriceEl.value) : 90;
    if (isNaN(maxPriceCents) || maxPriceCents < 1 || maxPriceCents > 99) {
      alert('Invalid max price (must be 1–99¢)'); return;
    }
    const maxTradeEl = document.querySelector(`#panel-${key} .maxtrade-input`);
    const maxTrade = maxTradeEl ? parseFloat(maxTradeEl.value) : 150;
    if (isNaN(maxTrade) || maxTrade < 1) {
      alert('Invalid max trade size'); return;
    }
    payload = { stratKey: key, threshold, minPrice: minPriceCents / 100, maxPrice: maxPriceCents / 100, maxTrade };
    // Per-crypto thresholds for paper tabs
    for (const el of document.querySelectorAll(`#panel-${key} .thresh-crypto-input`)) {
      const cr = el.dataset.crypto;
      payload[`threshold_${cr}`] = el.value.trim() !== '' ? parseFloat(el.value) : null;
    }
  }

  const btn = document.querySelector(`#panel-${key} .btn-save`);
  const origLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const ok = await apiFetch('/t1000/config', 'POST', payload);
  if (key === 'LIVE') liveFillPending = { '5m': false, '15m': false };

  if (btn) {
    if (ok && !ok.error) {
      btn.textContent = '✅ Saved';
      btn.classList.add('saved');
      setTimeout(() => { btn.textContent = origLabel; btn.classList.remove('saved'); btn.disabled = false; }, 2000);
    } else {
      btn.textContent = '❌ Error';
      btn.classList.add('error');
      setTimeout(() => { btn.textContent = origLabel; btn.classList.remove('error'); btn.disabled = false; }, 2500);
    }
  }
}

// ── Save all SETUP config (LIVE + LIVE_KALSHI) ────────────────────────────────
async function saveSetup(_authed = false) {
  if (!_authed) { requirePassword(() => saveSetup(true), 'Save all settings'); return; }
  const btn = document.getElementById('btn-save-setup');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

  // Validate LIVE params
  const thresh5m  = parseFloat(document.getElementById('live-thresh5m').value);
  const thresh15m = parseFloat(document.getElementById('live-thresh15m').value);
  if (isNaN(thresh5m) || thresh5m <= 0 || isNaN(thresh15m) || thresh15m <= 0) {
    alert('Invalid spike threshold'); if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCBE Save All Settings'; } return;
  }
  const mn5    = parseFloat(document.getElementById('live-minprice5m').value);
  const mx5    = parseFloat(document.getElementById('live-maxprice5m').value);
  const mxt1_5 = parseFloat(document.getElementById('live-mxt1-5m').value);
  const mt5    = parseFloat(document.getElementById('live-maxtrade5m').value);
  const mn15    = parseFloat(document.getElementById('live-minprice15m').value);
  const mx15    = parseFloat(document.getElementById('live-maxprice15m').value);
  const mxt1_15 = parseFloat(document.getElementById('live-mxt1-15m').value);
  const mxt1_st2 = parseFloat(document.getElementById('live-mxt1-standalone').value);
  const mt15    = parseFloat(document.getElementById('live-maxtrade15m').value);
  if ([mn5, mx5, mxt1_5, mt5, mn15, mx15, mxt1_15, mt15].some(isNaN)) {
    alert('Invalid parameter value'); if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCBE Save All Settings'; } return;
  }

  const baseEoa  = parseFloat(document.getElementById('live-base-eoa')?.value);
  const riskPctV = parseFloat(document.getElementById('live-risk-pct')?.value);
  if (isNaN(riskPctV) || riskPctV <= 0) {
    alert('Risk per Trade % is required and must be > 0'); if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDCBE Save All Settings'; } return;
  }
  const maxPosV  = parseInt(document.getElementById('live-max-positions')?.value);
  const t1ModeV     = document.getElementById('live-t1-mode')?.checked;
  const fokRetryV   = document.getElementById('live-fok-retry-enabled')?.checked;
  const fokDivisorV = parseInt(document.getElementById('live-fok-divisor')?.value);
  const fokMaxV     = parseInt(document.getElementById('live-fok-max')?.value);
  const cbEnabledV  = document.getElementById('live-cb-enabled')?.checked;
  const cbMinsV     = parseInt(document.getElementById('live-cb-mins')?.value);
  const dlEnabledV  = document.getElementById('live-dl-enabled')?.checked;
  const dlMaxLoss   = parseFloat(document.getElementById('live-dl-max-losses')?.value);
  const dlWindowMins = parseFloat(document.getElementById('live-dl-window-mins')?.value);
  const dlPauseMins = parseFloat(document.getElementById('live-dl-pause-mins')?.value);
  const distMin5mV  = parseFloat(document.getElementById('live-distmin5m')?.value);
  const distMin15mV = parseFloat(document.getElementById('live-distmin15m')?.value);
  const livePayload = {
    stratKey     : 'LIVE',
    saveHistory  : true,
    strategy5m   : document.getElementById('live-strategy5m').value,
    threshold5m  : thresh5m,
    minPrice5m     : mn5    / 100,
    maxPrice5m     : mx5    / 100,
    maxPriceT1_5m  : mxt1_5 / 100,
    maxTrade5m     : mt5,
    strategy15m    : document.getElementById('live-strategy15m').value,
    threshold15m   : thresh15m,
    minPrice15m    : mn15    / 100,
    maxPrice15m    : mx15    / 100,
    maxPriceT1_15m       : mxt1_15 / 100,
    maxPriceT1standalone : isNaN(mxt1_st2) ? undefined : mxt1_st2 / 100,
    maxTrade15m          : mt15,
    ...(isNaN(baseEoa)  ? {} : { baseEoaBalance: baseEoa }),
    ...(isNaN(riskPctV) ? {} : { riskPct: riskPctV / 100 }),
    ...(isNaN(maxPosV) || maxPosV < 1 ? {} : { maxPositions: maxPosV }),
    ...(t1ModeV     !== undefined ? { t1Mode: t1ModeV }              : {}),
    ...(document.getElementById('live-t1-standalone') !== null ? { t1standalone: document.getElementById('live-t1-standalone').checked } : {}),
    ...(document.getElementById('live-t0') !== null ? { t0off: !document.getElementById('live-t0').checked } : {}),
    ...(fokRetryV   !== undefined ? { fokRetryEnabled: fokRetryV }   : {}),
    ...(!isNaN(fokDivisorV)       ? { fokRetryDivisor: fokDivisorV } : {}),
    ...(!isNaN(fokMaxV)           ? { fokRetryMax: fokMaxV }         : {}),
    ...(cbEnabledV  !== undefined ? { circuitBreakerEnabled: cbEnabledV } : {}),
    ...(!isNaN(cbMinsV)           ? { circuitBreakerMins: cbMinsV }      : {}),
    ...(dlEnabledV  !== undefined ? { drawdownLimitEnabled: dlEnabledV }           : {}),
    ...(!isNaN(dlMaxLoss)         ? { drawdownLimitMaxLosses: dlMaxLoss }           : {}),
    ...(!isNaN(dlWindowMins)      ? { drawdownLimitWindowMins: dlWindowMins }        : {}),
    ...(!isNaN(dlPauseMins)       ? { drawdownLimitPauseMins: dlPauseMins }         : {}),
    ...(!isNaN(distMin5mV)        ? { distMin5m: distMin5mV }                       : {}),
    ...(!isNaN(distMin15mV)       ? { distMin15m: distMin15mV }                     : {}),
    noSpikeFilter: document.getElementById('live-no-spike-filter')?.checked ?? false,
    allowLowVol:   document.getElementById('live-allow-low-vol')?.checked ?? true,
    allowPriceOor: document.getElementById('live-allow-price-oor')?.checked ?? false,
    ...(() => { const v = parseFloat(document.getElementById('live-body-pct')?.value); return isNaN(v) ? {} : { bodyPct: v }; })(),
    directionFilter  : document.getElementById('live-direction-filter')?.value || null,
    skipHours        : (() => { const v = (document.getElementById('live-skip-hours')?.value || '').trim(); return v ? v.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n)) : []; })(),
    skipDow          : (() => { const v = (document.getElementById('live-skip-dow')?.value   || '').trim(); return v ? v.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n)) : []; })(),
    ...(() => { const v = parseInt(document.getElementById('live-coord-min')?.value); return isNaN(v) ? {} : { coordMinCryptos: v }; })(),
  };
  for (const el of document.querySelectorAll('#panel-SETUP .thresh-crypto-input[data-strat="LIVE"]')) {
    const cr = el.dataset.crypto, dur = el.dataset.dur;
    livePayload[`threshold${dur}_${cr}`] = el.value.trim() !== '' ? parseFloat(el.value) : null;
  }
  for (const el of document.querySelectorAll('#panel-SETUP .strat-crypto-select[data-strat="LIVE"]')) {
    const cr = el.dataset.crypto, dur = el.dataset.dur;
    livePayload[`strategy${dur}_${cr}`] = el.value || null;
  }
  // Threshold locks
  const lockedThresholds2 = {};
  document.querySelectorAll('#panel-SETUP .th-lock-btn[data-strat="LIVE"]').forEach(btn => {
    if (btn.dataset.locked === '1')
      lockedThresholds2[`threshold${btn.dataset.dur}_${btn.dataset.crypto}`] = true;
  });
  livePayload.lockedThresholds = lockedThresholds2;

  // Kalshi 15m mirrors LIVE 15m settings
  const kalshiPayload = {
    stratKey     : 'LIVE_KALSHI',
    strategy15m  : document.getElementById('live-strategy15m').value,
    threshold15m : thresh15m,
    minPrice15m  : mn15 / 100,
    maxPrice15m  : mx15 / 100,
    maxTrade15m  : mt15,
  };
  for (const el of document.querySelectorAll('#panel-SETUP .thresh-crypto-input[data-strat="LIVE"][data-dur="15m"]')) {
    const cr = el.dataset.crypto;
    kalshiPayload[`threshold15m_${cr}`] = el.value.trim() !== '' ? parseFloat(el.value) : null;
  }
  for (const el of document.querySelectorAll('#panel-SETUP .strat-crypto-select[data-strat="LIVE"][data-dur="15m"]')) {
    const cr = el.dataset.crypto;
    kalshiPayload[`strategy15m_${cr}`] = el.value || null;
  }

  const [r1, r2] = await Promise.all([
    apiFetch('/t1000/config', 'POST', livePayload),
    apiFetch('/t1000/config', 'POST', kalshiPayload),
  ]);
  liveFillPending = { '5m': false, '15m': false };
  setupDirty = false;

  if (btn) {
    const ok = r1 && !r1.error && r2 && !r2.error;
    btn.textContent = ok ? '\u2705 Saved' : '\u274C Error';
    btn.classList.add(ok ? 'saved' : 'error');
    setTimeout(() => {
      btn.textContent = '\uD83D\uDCBE Save All Settings';
      btn.classList.remove('saved', 'error');
      btn.disabled = false;
    }, 2000);
  }
}

// ── Get Best Setup — reads SIM2 autoscan results and fills SETUP fields ───────
async function getBestSetup() {
  const btn = document.getElementById('btn-get-best');
  btn.disabled = true;
  btn.textContent = '\u23F3 Loading\u2026';
  try {
    // Read the latest SIM2 autoscan results (do NOT re-run: that would use
    // different parameters than SIM2 and overwrite the D2-filtered results)
    const data = await apiFetch('/t1000/autoscan');
    if (!data || data.error) throw new Error('Could not read autoscan results');
    for (const dur of ['5m', '15m']) {
      const trio = dur === '5m' ? data.trio5m : data.trio15m;
      if (!trio) continue;
      for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
        const lockBtn = document.querySelector(`#panel-SETUP .th-lock-btn[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
        if (lockBtn?.dataset.locked === '1') continue; // respect lock
        const thEl  = document.querySelector(`#panel-SETUP .thresh-crypto-input[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
        const selEl = document.querySelector(`#panel-SETUP .strat-crypto-select[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
        if (trio[cr]) {
          if (thEl)  thEl.value  = trio[cr].th;
          // trio5m periods are integers (81); trio15m are strings ("C225") — normalise
          if (selEl) selEl.value = String(trio[cr].period).startsWith('C')
            ? trio[cr].period : 'C' + trio[cr].period;
        }
      }
      // minPrice/maxPrice are user preferences — do NOT overwrite from autoscan sweep params
    }
    // Apply T0/T1/TC flags used in the autoscan run to the LIVE checkboxes.
    // Ensures LIVE mode matches the exact conditions the autoscan was optimised for.
    if (data.simFlags != null) {
      const _tcEl = document.getElementById('live-t1-mode');
      const _t1El = document.getElementById('live-t1-standalone');
      if (_tcEl !== null) _tcEl.checked = data.simFlags.t1Mode       === true;
      if (_t1El !== null) _t1El.checked = data.simFlags.t1standalone === true;
      // t0off is intentionally NOT applied — autoscan always uses T+0 data for scoring.
    }
    setupDirty = true;
    btn.textContent = '\u2705 Done \u2014 review & save';
    setTimeout(() => { btn.textContent = '\u26A1 Apply SIM2 Autoscan'; btn.disabled = false; }, 4000);
  } catch (e) {
    console.error('getBestSetup error:', e);
    btn.textContent = '\u274C Error: ' + (e.message || 'unknown');
    setTimeout(() => { btn.textContent = '\u26A1 Apply SIM2 Autoscan'; btn.disabled = false; }, 3000);
  }
}

// ── Score last 7 days vs all-time ─────────────────────────────────────────────
async function score7d() {
  const btn = document.getElementById('btn-score-7d');
  btn.disabled = true;
  btn.textContent = '\u23F3 Scanning 7d\u2026';
  try {
    const r = await apiFetch('/t1000/run-autoscan-7d', 'POST');
    if (!r || r.error) throw new Error(r?.error || 'Simulator failed');
    btn.textContent = '\u2B07 Loading\u2026';
    const [d7, dAll] = await Promise.all([
      apiFetch('/t1000/autoscan-7d'),
      apiFetch('/t1000/autoscan'),
    ]);
    if (!d7 || d7.error) throw new Error('7d results not available');

    const panel = document.getElementById('setup-7d-panel');
    const table = document.getElementById('setup-7d-table');
    const note  = document.getElementById('setup-7d-note');

    // Build comparison rows for each duration
    const rows = [];
    for (const dur of ['5m', '15m']) {
      const trioAll = dur === '5m' ? dAll?.trio5m  : dAll?.trio15m;
      const trio7d  = dur === '5m' ? d7?.trio5m    : d7?.trio15m;
      if (!trio7d) continue;
      for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
        const a = trioAll?.[cr];
        const b = trio7d?.[cr];
        if (!b) continue;
        const thDiff  = a ? Math.abs(b.th - a.th) : 0;
        const cxxDiff = a && b.period !== a.period;
        const diverge = thDiff > 0.04 || cxxDiff;
        rows.push({ dur, crypto: cr, a, b, diverge });
      }
    }

    const th = (v) => v != null ? `${(v*100).toFixed(0)}%` : '—';
    const hdr = '<tr style="color:#718096;border-bottom:1px solid #2d3748;">' +
      '<th style="text-align:left;padding:2px 6px;font-weight:normal;">Dur</th>' +
      '<th style="text-align:left;padding:2px 6px;font-weight:normal;">Crypto</th>' +
      '<th style="text-align:center;padding:2px 6px;font-weight:normal;">All-time Cxx</th>' +
      '<th style="text-align:center;padding:2px 6px;font-weight:normal;">All-time Th</th>' +
      '<th style="text-align:center;padding:2px 6px;font-weight:normal;">7d Cxx</th>' +
      '<th style="text-align:center;padding:2px 6px;font-weight:normal;">7d Th</th>' +
      '<th style="text-align:center;padding:2px 6px;font-weight:normal;">\u0394</th>' +
      '</tr>';

    const bodyRows = rows.map(row => {
      const color = row.diverge ? '#f6ad55' : '#e2e8f0';
      const delta = row.a
        ? (row.b.th - row.a.th > 0 ? `+${((row.b.th - row.a.th)*100).toFixed(0)}%` :
           row.b.th - row.a.th < 0 ? `${((row.b.th - row.a.th)*100).toFixed(0)}%` : '\u2014')
        : '\u2014';
      const deltaColor = row.diverge ? '#f6ad55' : '#718096';
      return `<tr style="color:${color};border-bottom:1px solid #1a2035;">` +
        `<td style="padding:2px 6px;color:#718096;">${row.dur.toUpperCase()}</td>` +
        `<td style="padding:2px 6px;">${row.crypto}</td>` +
        `<td style="padding:2px 6px;text-align:center;">${row.a?.period ?? '\u2014'}</td>` +
        `<td style="padding:2px 6px;text-align:center;">${th(row.a?.th)}</td>` +
        `<td style="padding:2px 6px;text-align:center;font-weight:${row.b.period !== row.a?.period ? '700' : 'normal'};">${row.b.period}</td>` +
        `<td style="padding:2px 6px;text-align:center;font-weight:${row.diverge ? '700' : 'normal'};">${th(row.b.th)}</td>` +
        `<td style="padding:2px 6px;text-align:center;color:${deltaColor};">${delta}</td>` +
        '</tr>';
    }).join('');

    table.innerHTML = hdr + bodyRows;
    const dateFrom = d7.dateFrom ?? '\u2014';
    note.textContent = `7d window: ${dateFrom} \u2192 today \u2014 highlighted rows diverge \u22650.04% from all-time`;
    panel.style.display = '';

    const label = '\uD83D\uDCC5 7d Drift Check';
    btn.textContent = '\u2705 Done';
    setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 3000);
  } catch (e) {
    console.error('score7d error:', e);
    btn.textContent = '\u274C ERROR: ' + (e.message || 'unknown');
    setTimeout(() => { btn.textContent = '\uD83D\uDCC5 7d Drift Check'; btn.disabled = false; }, 5000);
  }
}

// ── Fill LIVE params from 3D simulator autoscan JSON ─────────────────────────
function toggleThLock(btn) {
  const nowLocked = btn.dataset.locked !== '1';
  btn.dataset.locked = nowLocked ? '1' : '0';
  btn.innerHTML = nowLocked
    ? '<svg class="ico ico-sm"><use href="#ico-lock"/></svg>'
    : '<svg class="ico ico-sm"><use href="#ico-unlock"/></svg>';
  btn.style.color = nowLocked ? '#ed8936' : '#4a5568';
  const thEl = btn.closest('div')?.querySelector('.thresh-crypto-input');
  if (thEl) thEl.style.outline = nowLocked ? '1px solid #ed8936' : '';
  setupDirty = true;
}

// ── Export / Import LIVE settings ─────────────────────────────────────────────

function exportSettings() {
  const g  = id => document.getElementById(id);
  const gf = id => parseFloat(g(id)?.value);
  const gi = id => parseInt(g(id)?.value);
  const gc = id => g(id)?.checked;

  const s = {
    source         : 'LIVE',
    _exported      : new Date().toISOString(),
    minPrice5m     : gf('live-minprice5m') / 100,
    maxPrice5m     : gf('live-maxprice5m') / 100,
    maxPriceT1_5m        : gf('live-mxt1-5m')   / 100,
    maxTrade5m           : gf('live-maxtrade5m'),
    minPrice15m          : gf('live-minprice15m') / 100,
    maxPrice15m          : gf('live-maxprice15m') / 100,
    maxPriceT1_15m       : gf('live-mxt1-15m')   / 100,
    maxPriceT1standalone : gf('live-mxt1-standalone') / 100,
    maxTrade15m    : gf('live-maxtrade15m'),
    riskPct        : gf('live-risk-pct') / 100,
    maxPositions   : gi('live-max-positions'),
    baseEoaBalance : gf('live-base-eoa'),
    t1Mode              : gc('live-t1-mode'),
    t1standalone        : gc('live-t1-standalone'),
    t0off               : !gc('live-t0'),
    fokRetryEnabled     : gc('live-fok-retry-enabled'),
    fokRetryDivisor     : gi('live-fok-divisor'),
    fokRetryMax         : gi('live-fok-max'),
    circuitBreakerEnabled  : gc('live-cb-enabled'),
    circuitBreakerMins     : gi('live-cb-mins'),
    drawdownLimitEnabled   : gc('live-dl-enabled'),
    drawdownLimitMaxLosses : gf('live-dl-max-losses'),
    drawdownLimitWindowMins: gf('live-dl-window-mins'),
    drawdownLimitPauseMins : gf('live-dl-pause-mins'),
    distMin5m      : gf('live-distmin5m'),
    distMin15m     : gf('live-distmin15m'),
    noSpikeFilter  : gc('live-no-spike-filter'),
    allowLowVol    : gc('live-allow-low-vol'),
    allowPriceOor  : gc('live-allow-price-oor'),
    bodyPct        : gf('live-body-pct'),
    directionFilter  : document.getElementById('live-direction-filter')?.value || null,
    skipHours        : (() => { const v = (document.getElementById('live-skip-hours')?.value || '').trim(); return v ? v.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n)) : []; })(),
    skipDow          : (() => { const v = (document.getElementById('live-skip-dow')?.value   || '').trim(); return v ? v.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n)) : []; })(),
    coordMinCryptos  : parseInt(document.getElementById('live-coord-min')?.value) || 0,
    lockedThresholds: {},
  };

  for (const el of document.querySelectorAll('#panel-SETUP .thresh-crypto-input[data-strat="LIVE"]'))
    s[`threshold${el.dataset.dur}_${el.dataset.crypto}`] = el.value.trim() !== '' ? parseFloat(el.value) : null;
  for (const el of document.querySelectorAll('#panel-SETUP .strat-crypto-select[data-strat="LIVE"]'))
    s[`strategy${el.dataset.dur}_${el.dataset.crypto}`] = el.value || null;
  document.querySelectorAll('#panel-SETUP .th-lock-btn[data-strat="LIVE"]').forEach(btn => {
    if (btn.dataset.locked === '1')
      s.lockedThresholds[`threshold${btn.dataset.dur}_${btn.dataset.crypto}`] = true;
  });

  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `polychamp-live-settings-${date}.json`; a.click();
  URL.revokeObjectURL(url);
}

function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const s  = JSON.parse(e.target.result);
      const g  = id => document.getElementById(id);
      const sv = (id, v) => { const el = g(id); if (el && v != null && !isNaN(v)) el.value = v; };
      const ss = (id, v) => { const el = g(id); if (el && v != null) el.value = v; };
      const sc = (id, v) => { const el = g(id); if (el && v != null) el.checked = v; };

      ss('live-strategy5m',  s.strategy5m);
      sv('live-thresh5m',    s.threshold5m);
      sv('live-minprice5m',  s.minPrice5m  != null ? Math.round(s.minPrice5m  * 100) : null);
      sv('live-maxprice5m',  s.maxPrice5m  != null ? Math.round(s.maxPrice5m  * 100) : null);
      sv('live-mxt1-5m',     s.maxPriceT1_5m != null ? Math.round(s.maxPriceT1_5m * 100) : null);
      sv('live-maxtrade5m',  s.maxTrade5m);
      ss('live-strategy15m', s.strategy15m);
      sv('live-thresh15m',   s.threshold15m);
      sv('live-minprice15m', s.minPrice15m != null ? Math.round(s.minPrice15m * 100) : null);
      sv('live-maxprice15m', s.maxPrice15m != null ? Math.round(s.maxPrice15m * 100) : null);
      sv('live-mxt1-15m',         s.maxPriceT1_15m != null ? Math.round(s.maxPriceT1_15m * 100) : null);
      sv('live-mxt1-standalone',  s.maxPriceT1standalone != null ? Math.round(s.maxPriceT1standalone * 100) : null);
      sv('live-maxtrade15m', s.maxTrade15m);
      sv('live-risk-pct',    s.riskPct != null ? Math.round(s.riskPct * 100) : null);
      sv('live-max-positions', s.maxPositions);
      sv('live-base-eoa',    s.baseEoaBalance);
      sc('live-t1-mode',          s.t1Mode);
      sc('live-t1-standalone',    s.t1standalone);
      sc('live-t0',               s.t0off !== true);
      sc('live-fok-retry-enabled', s.fokRetryEnabled);
      sv('live-fok-divisor',  s.fokRetryDivisor);
      sv('live-fok-max',      s.fokRetryMax);
      sc('live-cb-enabled',   s.circuitBreakerEnabled);
      sv('live-cb-mins',      s.circuitBreakerMins);
      sc('live-dl-enabled',   s.drawdownLimitEnabled);
      sv('live-dl-max-losses',   s.drawdownLimitMaxLosses);
      sv('live-dl-window-mins',  s.drawdownLimitWindowMins);
      sv('live-dl-pause-mins',   s.drawdownLimitPauseMins);
      sv('live-distmin5m',    s.distMin5m);
      sv('live-distmin15m',   s.distMin15m);
      sc('live-no-spike-filter', s.noSpikeFilter);
      sc('live-allow-low-vol',   s.allowLowVol);
      sc('live-allow-price-oor', s.allowPriceOor);
      sv('live-body-pct',     s.bodyPct);
      if (s.directionFilter != null) { const el = g('live-direction-filter'); if (el) el.value = s.directionFilter || ''; }
      if (s.skipHours != null) { const el = g('live-skip-hours'); if (el) el.value = Array.isArray(s.skipHours) ? s.skipHours.join(',') : (s.skipHours || ''); }
      if (s.skipDow   != null) { const el = g('live-skip-dow');   if (el) el.value = Array.isArray(s.skipDow)   ? s.skipDow.join(',')   : (s.skipDow   || ''); }
      const _coordV = s.coordMinCryptos ?? s.coordMin; if (_coordV != null) sv('live-coord-min', _coordV);

      for (const el of document.querySelectorAll('#panel-SETUP .thresh-crypto-input[data-strat="LIVE"]')) {
        const key = `threshold${el.dataset.dur}_${el.dataset.crypto}`;
        if (key in s) el.value = s[key] ?? '';
      }
      for (const el of document.querySelectorAll('#panel-SETUP .strat-crypto-select[data-strat="LIVE"]')) {
        const key = `strategy${el.dataset.dur}_${el.dataset.crypto}`;
        if (key in s && s[key]) el.value = s[key];
      }
      if (s.lockedThresholds) {
        document.querySelectorAll('#panel-SETUP .th-lock-btn[data-strat="LIVE"]').forEach(btn => {
          const key    = `threshold${btn.dataset.dur}_${btn.dataset.crypto}`;
          const locked = !!s.lockedThresholds[key];
          btn.dataset.locked = locked ? '1' : '0';
          btn.innerHTML      = locked
            ? '<svg class="ico ico-sm"><use href="#ico-lock"/></svg>'
            : '<svg class="ico ico-sm"><use href="#ico-unlock"/></svg>';
          btn.style.color = locked ? '#ed8936' : '#4a5568';
          const thEl = btn.closest('div')?.querySelector('.thresh-crypto-input');
          if (thEl) thEl.style.outline = locked ? '1px solid #ed8936' : '';
        });
      }

      setupDirty = true;
      event.target.value = '';
      // Auto-save: triggers password prompt then saves LIVE + LIVE_KALSHI atomically
      saveSetup();
    } catch (err) {
      alert('Failed to load settings: ' + err.message);
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

async function fillFromAutoscan(dur) {
  const btn = document.querySelector(`#panel-SETUP .btn-fill[data-dur="${dur}"]`);
  const label = dur === '5m' ? 'Fill 5MIN \u2193' : 'Fill 15MIN \u2193';
  if (btn) { btn.disabled = true; btn.textContent = 'Loading\u2026'; }

  const data = await apiFetch('/t1000/autoscan');
  if (!data || data.error) {
    alert('Autoscan data not available.\nRun: node simulate_combined.js -nf -as');
    if (btn) { btn.disabled = false; btn.textContent = label; }
    return;
  }
  const trio = dur === '5m' ? data.trio5m : data.trio15m;
  const best = dur === '5m' ? data.best5m  : data.best15m;
  if (!trio) {
    alert('No 3D sweep data in autoscan JSON.\nRun: node simulate_combined.js -nf -as');
    if (btn) { btn.disabled = false; btn.textContent = label; }
    return;
  }

  for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
    const lockBtn = document.querySelector(`#panel-SETUP .th-lock-btn[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
    if (lockBtn?.dataset.locked === '1') continue; // respect lock
    const thEl  = document.querySelector(`#panel-SETUP .thresh-crypto-input[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
    const selEl = document.querySelector(`#panel-SETUP .strat-crypto-select[data-strat="LIVE"][data-dur="${dur}"][data-crypto="${cr}"]`);
    if (trio[cr]) {
      if (thEl)  thEl.value  = trio[cr].th;
      if (selEl) selEl.value = trio[cr].period;
    }
  }
  if (best) {
    const mnEl = document.getElementById(`live-minprice${dur}`);
    const mxEl = document.getElementById(`live-maxprice${dur}`);
    if (mnEl && best.mn != null) mnEl.value = Math.round(best.mn * 100);
    if (mxEl && best.mx != null) mxEl.value = Math.round(best.mx * 100);
  }
  setupDirty = true;
  if (btn) { btn.disabled = false; btn.textContent = label; }
}


// ── Format timestamp in EAT (UTC+3) ──────────────────────────────────────────
function fmtEAT(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '') + ' EAT';
}

// ── Full reset: clear trade list + reset P&L chart baseline + record reset date ──
async function clearTradeList() {
  const s = state.LIVE;
  if (!s) return;
  const log = s.activityLog || [];
  const miniLog = (state['LIVE_MINI']?.activityLog || []);
  const locked     = [...log, ...miniLog].filter(e => e.status === 'OPEN')
    .reduce((sum, e) => sum + (e.position || 0), 0);
  const redeemable = [...log, ...miniLog].filter(e => e.status === 'WIN' && !e.redeemed)
    .reduce((sum, e) => sum + (e.position > 0 && e.entryPrice > 0 ? e.position / e.entryPrice : 0), 0);
  const virtualTotal = parseFloat(((s.realBalance ?? 0) + locked + redeemable).toFixed(2));
  const now    = new Date().toISOString();
  const eatStr = fmtEAT(now);
  if (!confirm(
    `Full reset of LIVE trading view?\n\n` +
    `• Clears recent trades & P\u2044L chart (history preserved in ALL TRADES)\n` +
    `• Sets Base EOA Balance → current Virtual Total ($${virtualTotal.toFixed(2)} USDC.e)\n` +
    `• Records reset date: ${eatStr}\n\n` +
    `W/L/PnL counters restart from now.`
  )) return;
  await Promise.all([
    apiFetch('/t1000/config', 'POST', {
      stratKey: 'LIVE',
      tradeListClearedAt: now,
      baseEoaBalance: virtualTotal,
      resetAt: now,
    }),
    apiFetch('/t1000/config', 'POST', {
      stratKey: 'LIVE_MINI',
      tradeListClearedAt: now,
    }),
  ]);
  pollState();
}

// ── Rejected candidates list ───────────────────────────────────────────────────
let _rejectedRows = [];
let _rejectedStats = null;
let _rejectedTotal = 0;
let _rejectedPage  = 1;
const REJECTED_PAGE_SIZE = 200;

async function fetchRejected(page) {
  page = page || _rejectedPage;
  try {
    const [data, stats] = await Promise.all([
      apiFetch(`/t1000/rejected?page=${page}&limit=${REJECTED_PAGE_SIZE}`, 'GET'),
      apiFetch('/t1000/rejected/stats', 'GET').catch(() => null),
    ]);
    _rejectedRows  = data?.rows  || [];
    _rejectedTotal = data?.total || 0;
    _rejectedPage  = data?.page  || page;
    _rejectedStats = stats;
    renderRejectedStats();
    renderRejected();
  } catch (e) { /* silent */ }
}

// ── Signal Stats charts ────────────────────────────────────────────────────────

// ── Signal Stats range helpers (EAT = UTC+3) ──────────────────────────────
const EAT_OFFSET    = 3 * 60 * 60 * 1000;
const STATS_LS_KEY  = 'polychamp_stats_range';

function toEATInput(utcMs) {
  return new Date(utcMs + EAT_OFFSET).toISOString().slice(0, 16);
}
function fromEATInput(str) {
  if (!str) return null;
  return new Date(str + ':00Z').getTime() - EAT_OFFSET;
}
function initStatsRange() {
  let range = null;
  try { range = JSON.parse(localStorage.getItem(STATS_LS_KEY)); } catch {}
  if (!range?.from || !range?.to) range = { from: Date.now() - 86400000, to: Date.now() };
  const elFrom = document.getElementById('stats-from');
  const elTo   = document.getElementById('stats-to');
  if (elFrom) elFrom.value = toEATInput(range.from);
  if (elTo)   elTo.value   = toEATInput(range.to);
}
function applyStatsRange() {
  const fromMs = fromEATInput(document.getElementById('stats-from')?.value);
  const toMs   = fromEATInput(document.getElementById('stats-to')?.value);
  if (!fromMs || !toMs || fromMs >= toMs) return;
  localStorage.setItem(STATS_LS_KEY, JSON.stringify({ from: fromMs, to: toMs }));
  loadSignalStats();
}
function setStatsPreset(days) {
  const toMs   = Date.now();
  const fromMs = toMs - days * 86400000;
  const elFrom = document.getElementById('stats-from');
  const elTo   = document.getElementById('stats-to');
  if (elFrom) elFrom.value = toEATInput(fromMs);
  if (elTo)   elTo.value   = toEATInput(toMs);
  localStorage.setItem(STATS_LS_KEY, JSON.stringify({ from: fromMs, to: toMs }));
  loadSignalStats();
}

async function loadSignalStats() {
  const body = document.getElementById('signal-stats-body');
  if (!body) return;
  body.innerHTML = '<div style="color:#718096;font-size:12px;padding:16px;">Loading…</div>';

  const live = state?.LIVE;
  if (!live) { body.innerHTML = '<div style="color:#fc8181;font-size:12px;padding:16px;">LIVE state not available</div>'; return; }

  const CRYPTOS = ['BTC','ETH','SOL','XRP'];
  const dur5m  = { label:'5m',  is15m: false };
  const dur15m = { label:'15m', is15m: true  };

  // Build pairs — one entry per crypto per timeframe (all CXX mixed)
  const pairsByDur = [dur5m, dur15m].map(dur => ({
    ...dur,
    pairs: CRYPTOS.map(cr => {
      const tKey  = dur.is15m ? `threshold15m_${cr}` : `threshold5m_${cr}`;
      const th    = live[tKey] ?? (dur.is15m ? live.threshold15m : live.threshold5m) ?? 0;
      const minP  = dur.is15m ? (live.minPrice15m ?? 0.05) : (live.minPrice5m ?? 0.05);
      const maxP  = dur.is15m ? (live.maxPrice15m ?? 0.89) : (live.maxPrice5m ?? 0.89);
      const bodyPct = live.bodyPct ?? 76;
      return { cr, tf: dur.label, th, minP, maxP, bodyPct };
    }),
  }));

  // Build pairs query: "BTC:5m:0.29:0.05:0.89,..." (crypto:tf:threshold:minP:maxP)
  const allPairs = pairsByDur.flatMap(d => d.pairs.map(p => `${p.cr}:${p.tf}:${p.th}:${p.minP}:${p.maxP}`));
  const unique   = [...new Set(allPairs)];

  let data;
  try {
    let range = null;
    try { range = JSON.parse(localStorage.getItem(STATS_LS_KEY)); } catch {}
    const toMs   = range?.to   ?? Date.now();
    const fromMs = range?.from ?? (toMs - 86400000);
    data = await PolyChampAPI.request('GET', `/t1000/signal-stats?pairs=${unique.join(',')}&from=${fromMs}&to=${toMs}`);
  } catch(e) {
    body.innerHTML = `<div style="color:#fc8181;padding:16px;">Error: ${e.message}</div>`;
    return;
  }

  const fmtDateHdr = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  let html = '';
  for (const dur of pairsByDur) {
    if (!dur.pairs.length) continue;
    const allSec   = dur.pairs.flatMap(p => data[`${p.cr}:${p.tf}`] || []);
    const secTMin  = allSec.length ? Math.min(...allSec.map(s => s.ts)) : null;
    const secTMax  = allSec.length ? Math.max(...allSec.map(s => s.ts)) : null;
    const periodStr = secTMin ? `${fmtDateHdr(secTMin)} – ${fmtDateHdr(secTMax)}` : '';
    html += `<div class="sstats-section">
      <div class="sstats-section-label">${dur.label === '5m' ? '5-Minute Markets' : '15-Minute Markets'} <span style="font-size:10px;color:#718096;font-weight:normal;margin-left:8px;">${periodStr}</span></div>
      <div class="sstats-grid">`;
    for (const p of dur.pairs) {
      const key      = `${p.cr}:${p.tf}`;
      const signals  = data[key] || [];
      const pTMin    = signals.length ? Math.min(...signals.map(s => s.ts)) : secTMin;
      const pTMax    = signals.length ? Math.max(...signals.map(s => s.ts)) : secTMax;
      const withPrice = signals.filter(s => s.entry_price != null);
      const nBelow    = withPrice.filter(s => parseFloat(s.entry_price) < p.minP).length;
      const nAbove    = withPrice.filter(s => parseFloat(s.entry_price) > p.maxP).length;
      const nPass     = withPrice.length - nBelow - nAbove;
      html += `<div class="sstats-pair">
        <div class="sstats-pair-label">${p.cr} · ${p.tf.toUpperCase()}</div>
        <div class="sstats-charts">
          ${drawScatterSvg(signals, 'spike',  p.th,   0,    null, p.th,    p.bodyPct, p.minP, p.maxP, pTMin, pTMax)}
          ${drawScatterSvg(signals, 'price',  p.minP, 0,    1,   p.th,    p.bodyPct, p.minP, p.maxP, pTMin, pTMax)}
        </div>
        <div style="font-size:10px;display:flex;gap:8px;justify-content:center;margin-top:3px;padding-top:3px;border-top:1px solid #1a2535;">
          <span style="color:#63b3ed;">↓ ${nBelow} &lt;${Math.round(p.minP*100)}¢</span>
          <span style="color:#68d391;">✓ ${nPass} pass</span>
          <span style="color:#fc8181;">↑ ${nAbove} &gt;${Math.round(p.maxP*100)}¢</span>
        </div>
      </div>`;
    }
    html += `</div></div>`;
  }
  body.innerHTML = html || '<div style="color:#718096;padding:16px;">No data</div>';
}

function drawScatterSvg(signals, metric, threshold, yMin, yMax, th, bodyPct, minP, maxP, forceTMin, forceTMax) {
  const W = 200, H = 114;
  const PL = 22, PR = 6, PT = 14, PB = 20; // padding
  const cW = W - PL - PR, cH = H - PT - PB;
  const fmtDate = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Extract Y values for this metric
  const getY = s => {
    if (metric === 'spike') return s.spike_pct != null ? Math.abs(parseFloat(s.spike_pct)) : null;
    if (metric === 'body')  return s.body_ratio != null ? parseFloat(s.body_ratio) : null;
    if (metric === 'price') return s.entry_price != null ? parseFloat(s.entry_price) : null;
    return null;
  };

  // Determine dot color per signal per metric
  const getColor = s => {
    if (s.reason === 'WIN' || s.reason === 'LOSS' || s.reason === 'traded') return '#68d391';
    if (metric === 'spike' && s.reason === 'below_threshold') return '#fc8181';
    if (metric === 'body'  && s.reason === 'weak_body')       return '#fc8181';
    if (metric === 'price' && (s.reason === 'price_too_low' || s.reason === 'price_too_high')) return '#fc8181';
    return '#4a5568';
  };

  const pts = signals.map(s => ({ y: getY(s), color: getColor(s), ts: s.ts, cs: s.candle_size, reason: s.reason }))
                     .filter(p => p.y != null);

  // Auto-scale Y if yMax is null
  const allY = pts.map(p => p.y);
  const dataMax = allY.length ? Math.max(...allY) : (threshold * 2 || 1);
  const dataMin = allY.length ? Math.min(...allY) : 0;
  const yLo = yMin ?? Math.min(dataMin * 0.9, threshold * 0.5);
  const yHi = yMax ?? Math.max(dataMax * 1.1, threshold * 1.5);
  const yRange = yHi - yLo || 1;

  // Time scale — use forced bounds (shared per pair) when provided
  const tMin = forceTMin ?? (pts.length ? Math.min(...pts.map(p => p.ts)) : (Date.now() - 86400000));
  const tMax = forceTMax ?? (pts.length ? Math.max(...pts.map(p => p.ts)) : Date.now());
  const tRange = tMax - tMin || 1;

  const toX = ts  => PL + ((ts - tMin) / tRange) * cW;
  const toY = val => PT + (1 - (val - yLo) / yRange) * cH;
  const thY  = toY(threshold);

  // Y-axis labels
  const fmtY = v => metric === 'spike' ? `${(v*100).toFixed(0)}b` :
                    metric === 'body'  ? `${v.toFixed(0)}%` :
                                        `${(v*100).toFixed(0)}¢`;

  const titleMap = { spike: 'Spike %', body: 'Body %', price: 'Entry Price' };
  const thColor  = metric === 'price' ? '#63b3ed' : '#f6ad55';

  let dots = pts.map(p => {
    const x = toX(p.ts), y = toY(p.y);
    const tip = `C${p.cs ?? '?'} · ${(p.reason ?? '').replace(/_/g,' ')}`;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${p.color}" opacity="0.85"><title>${tip}</title></circle>`;
  }).join('');

  // Extra threshold lines + count annotations for price chart
  let extraLines = '';
  if (metric === 'price') {
    const nBelow   = pts.filter(p => p.y < threshold).length;
    const nAbove   = pts.filter(p => p.y > maxP).length;
    const nPass    = pts.length - nBelow - nAbove;
    const maxY2    = toY(maxP);
    const midPassY = (thY + maxY2) / 2;
    extraLines = `<line x1="${PL}" y1="${maxY2.toFixed(1)}" x2="${W-PR}" y2="${maxY2.toFixed(1)}" stroke="#fc8181" stroke-width="0.8" stroke-dasharray="3,2"/>
    <text x="${W-PR+1}" y="${(maxY2+3).toFixed(1)}" fill="#fc8181" font-size="5.5">${fmtY(maxP)}</text>
    <text x="${PL+2}" y="${(maxY2-1.5).toFixed(1)}" fill="#fc8181" font-size="5" opacity="0.9">↑${nAbove}</text>
    <text x="${PL+2}" y="${(midPassY+2).toFixed(1)}" fill="#68d391" font-size="5" opacity="0.9">✓${nPass}</text>
    <text x="${PL+2}" y="${(thY+8).toFixed(1)}" fill="#63b3ed" font-size="5" opacity="0.9">↓${nBelow}</text>`;
  }

  return `<div class="sstats-chart-wrap">
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#0d1420" rx="3"/>
      <!-- chart area border -->
      <rect x="${PL}" y="${PT}" width="${cW}" height="${cH}" fill="#111827" rx="2"/>
      <!-- title -->
      <text x="${PL+2}" y="${PT-3}" fill="#4a5568" font-size="7" font-family="monospace">${titleMap[metric]}</text>
      <!-- threshold line -->
      <line x1="${PL}" y1="${thY.toFixed(1)}" x2="${W-PR}" y2="${thY.toFixed(1)}" stroke="${thColor}" stroke-width="0.9" stroke-dasharray="3,2"/>
      <text x="${W-PR+1}" y="${(thY+3).toFixed(1)}" fill="${thColor}" font-size="5.5">${fmtY(threshold)}</text>
      ${extraLines}
      <!-- dots -->
      ${dots}
      <!-- y-axis labels -->
      <text x="${PL-2}" y="${(PT+5).toFixed(1)}" fill="#4a5568" font-size="5.5" text-anchor="end">${fmtY(yHi)}</text>
      <text x="${PL-2}" y="${(PT+cH).toFixed(1)}" fill="#4a5568" font-size="5.5" text-anchor="end">${fmtY(yLo)}</text>
      <!-- x-axis date labels -->
      <text x="${PL}" y="${H-8}" fill="#2d3748" font-size="5" text-anchor="start">${fmtDate(tMin)}</text>
      <text x="${W-PR}" y="${H-8}" fill="#2d3748" font-size="5" text-anchor="end">${fmtDate(tMax)}</text>
      <!-- point count -->
      <text x="${W-PR}" y="${H-2}" fill="#2d3748" font-size="5" text-anchor="end">${pts.length}pt</text>
    </svg>
  </div>`;
}

function renderRejectedStats() {
  const el = document.getElementById('rejected-stats');
  if (!el || !_rejectedStats?.byReason) { if (el) el.style.display = 'none'; return; }
  const { byReason } = _rejectedStats;
  const reasonLabel = {
    below_threshold:    'LOW SPIKE', weak_body: 'WEAK BODY',   bad_slot: 'BAD SLOT',
    dir_filter:         'DIR FILT',  time_filter: 'TIME FILT',  coord_wait: 'COORD WAIT',
    no_liquidity:       'NO LIQUID', price_too_high: 'PRICE↑',  price_too_low: 'PRICE↓',
    already_pending:    'PENDING',   asset_already_open: 'OPEN', max_positions: 'MAX POS',
    signal_too_stale:   'STALE',
  };
  const reasonBg = {
    below_threshold:    '#1e2235', weak_body: '#3d2a00', bad_slot: '#3d2a00',
    dir_filter:         '#1a2535', time_filter: '#1a2535', coord_wait: '#1a2535',
    no_liquidity:       '#3d1515', price_too_high: '#3d1515', price_too_low: '#3d1515',
    already_pending:    '#1a2535', asset_already_open: '#1a2535', max_positions: '#1a2535',
    signal_too_stale:   '#2d2d2d',
  };
  const pills = Object.entries(byReason)
    .sort((a,b) => b[1].total - a[1].total)
    .map(([reason, s]) => {
      const label = reasonLabel[reason] || reason.replace(/_/g,' ').toUpperCase();
      const bg    = reasonBg[reason]    || '#1e2235';
      const fprStr = s.fpr != null
        ? `<span style="color:${s.fpr>=60?'#fc8181':s.fpr>=30?'#f6ad55':'#68d391'};font-weight:700;margin-left:5px;">${s.fpr}% FP</span>`
        : '';
      const known = s.WIN + s.LOSS;
      const title = `${s.total} total | ${s.WIN} would-WIN | ${s.LOSS} correct-SKIP | ${s.unknown} unknown`;
      return `<span title="${title}" style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:4px;${bg ? `background:${bg};` : ''}font-size:11px;cursor:default;">
        <span style="color:#a0aec0">${label}</span>
        <span style="color:#718096">${s.total}</span>
        ${fprStr}
      </span>`;
    }).join('');
  el.innerHTML = pills;
  el.style.display = pills ? 'flex' : 'none';
}

function renderRejected() {
  const el = document.getElementById('log-rejected');
  const cnt = document.getElementById('rejected-count');
  if (!el) return;
  const rows = _rejectedRows;
  if (cnt) cnt.textContent = _rejectedTotal ? `(${_rejectedTotal})` : '';
  // Update pagination controls
  const prevBtn  = document.getElementById('rej-prev');
  const nextBtn  = document.getElementById('rej-next');
  const pageInfo = document.getElementById('rej-page-info');
  const pages    = Math.ceil(_rejectedTotal / REJECTED_PAGE_SIZE) || 1;
  if (prevBtn)  prevBtn.disabled  = _rejectedPage <= 1;
  if (nextBtn)  nextBtn.disabled  = _rejectedPage >= pages;
  if (pageInfo) pageInfo.textContent = _rejectedTotal > REJECTED_PAGE_SIZE ? `p${_rejectedPage}/${pages}` : '';
  if (!rows.length) { el.innerHTML = '<div class="empty-log">No rejected candidates (last 30 days)</div>'; return; }

  const reasonStyle = {
    below_threshold:    'background:#1e2235;color:#718096',
    weak_body:          'background:#3d2a00;color:#f6ad55',
    bad_slot:           'background:#3d2a00;color:#f6ad55',
    dir_filter:         'background:#1a2535;color:#718096',
    time_filter:        'background:#1a2535;color:#718096',
    coord_wait:         'background:#1a2535;color:#718096',
    no_liquidity:       'background:#3d1515;color:#fc8181',
    price_too_high:     'background:#3d1515;color:#fc8181',
    price_too_low:      'background:#3d1515;color:#fc8181',
    price_out_of_range: 'background:#2d2000;color:#d4a14a',
    low_vol:            'background:#0d2010;color:#4fd17a',
    already_pending:    'background:#1a2535;color:#718096',
    asset_already_open: 'background:#1a2535;color:#718096',
    max_positions:      'background:#1a2535;color:#718096',
    signal_too_stale:   'background:#2d2d2d;color:#718096',
  };
  const reasonLabel = {
    below_threshold:    'LOW SPIKE',
    weak_body:          'WEAK BODY',
    bad_slot:           'BAD SLOT',
    dir_filter:         'DIR FILT',
    time_filter:        'TIME FILT',
    coord_wait:         'COORD WAIT',
    no_liquidity:       'NO LIQUID',
    price_too_high:     'PRICE HIGH',
    price_too_low:      'PRICE LOW',
    price_out_of_range: 'PRICE OOR',
    low_vol:            'LOW VOL',
    already_pending:    'PENDING',
    asset_already_open: 'OPEN',
    max_positions:      'MAX POS',
    signal_too_stale:   'STALE',
  };

  const tableRows = rows.map(r => {
    const t = new Date(r.created_at);
    const ts = t.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    const dateLabel = t.toLocaleDateString(undefined, { month:'short', day:'numeric',
      ...(t.getFullYear() !== new Date().getFullYear() ? { year:'numeric' } : {}) });
    const typeBadge = r.candle_size >= 150
      ? '<span class="badge-15m">15MIN</span>'
      : '<span class="badge-5m">5MIN</span>';
    const dir = r.direction === 'UP'
      ? '<span class="dir-up">&#x25B2; UP</span>'
      : '<span class="dir-down">&#x25BC; DOWN</span>';
    const spike = `+${parseFloat(r.spike_pct).toFixed(2)}%`;
    const entry = r.entry_price != null ? `${(parseFloat(r.entry_price)*100).toFixed(0)}&#x00A2;` : '&#x2014;';

    // Market link — show cycle time as label
    const cycleStartMs = r.cycleStartSec
      ? r.cycleStartSec * 1000
      : (() => { const dur = r.candle_size >= 150 ? 900000 : 300000; return Math.floor(t.getTime() / dur) * dur; })();
    const mktUrl = polyUrlFE(r.crypto, cycleStartMs, r.candle_size);
    const cycleTime = new Date(cycleStartMs).toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit', hour12:false });
    const mktCell = mktUrl
      ? `<a href="${mktUrl}" target="_blank" style="color:#4fd1c5;text-decoration:none;">&#x1F4CA; ${cycleTime}</a>`
      : `<span style="color:#718096">${cycleTime}</span>`;

    // Reason chip (col 1) + detail text (col 2)
    const rStyle = reasonStyle[r.reason] || 'background:#1e2235;color:#718096';
    const rLabel = reasonLabel[r.reason] || r.reason.replace(/_/g,' ').toUpperCase();
    const d = r.details ? (typeof r.details === 'string' ? JSON.parse(r.details) : r.details) : null;
    let detail = '';
    if (r.reason === 'below_threshold' && r.threshold != null)
      detail = `${parseFloat(r.spike_pct).toFixed(2)}% / ${parseFloat(r.threshold).toFixed(2)}%`;
    else if (d) {
      if      (r.reason === 'weak_body'      && d.body_ratio != null) detail = `${d.body_ratio}% / 76%`;
      else if (r.reason === 'price_too_high' && d.max_c      != null) detail = `${d.max_c}&#x00A2; max`;
      else if (r.reason === 'price_too_low'  && d.min_c      != null) detail = `${d.min_c}&#x00A2; min`;
    }

    // Method badge (T0/T1/TC)
    const methodRej = (d?.slot) || 'T0';
    const methodBadgeRej = methodRej === 'T1'
      ? '<span style="background:#1a2d40;color:#63b3ed;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #2a4a6a;">T1</span>'
      : methodRej === 'TC'
        ? '<span style="background:#2d1f4a;color:#b794f4;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #553c9a;">TC</span>'
        : '<span style="background:#1a2820;color:#68d391;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #2a4a38;">T0</span>';

    // Outcome badge
    let outcomeBadge = '<span style="color:#4a5568">&#x2014;</span>';
    if (r.outcome) {
      const wouldWin = r.outcome === r.direction;
      outcomeBadge = wouldWin
        ? '<span class="badge" style="background:#4a3300;color:#f6ad55" title="Would have been a WIN — rejection missed a profit">WIN</span>'
        : '<span class="badge badge-win" title="Would have been a LOSS — rejection was correct">OK</span>';
    }

    const trBg = r.reason === 'low_vol'           ? 'background:#081a0f;'
               : r.reason === 'price_out_of_range' ? 'background:#1a1200;'
               : '';
    return `<tr style="${trBg}">
      <td>${ts}</td>
      <td><strong>${r.crypto}</strong></td>
      <td>${typeBadge}</td>
      <td style="color:#a0aec0">C${r.candle_size}</td>
      <td>${methodBadgeRej}</td>
      <td>${dir}</td>
      <td style="color:#f6ad55">${spike}</td>
      <td>${entry}</td>
      <td>${mktCell}</td>
      <td><span class="badge" style="${rStyle}">${rLabel}</span></td>
      <td style="color:#718096;font-size:11px">${detail}</td>
      <td>${outcomeBadge}</td>
      <td style="color:#718096;font-size:10px">${dateLabel}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<div class="table-scroll"><table>
    <thead><tr>
      <th>Time</th><th>Crypto</th><th>Type</th><th>Cxx</th><th style="font-size:11px">Method</th><th>Dir</th>
      <th>Spike</th><th>Entry</th><th>Market</th><th>Reason</th><th>Detail</th><th>Outcome</th><th>Date</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table></div>`;
}

async function clearRejected() {
  if (!confirm('Clear all rejected candidates from DB?')) return;
  await apiFetch('/t1000/rejected', 'DELETE');
  _rejectedRows = []; _rejectedTotal = 0; _rejectedPage = 1; _rejectedStats = null;
  renderRejectedStats();
  renderRejected();
}

function exportRejectedJSON() {
  if (!_rejectedRows.length) { alert('No rejected rows loaded.'); return; }
  const blob = new Blob([JSON.stringify(_rejectedRows, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `rejected-${new Date().toISOString().slice(0,16).replace(/:/g,'-')}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Rejected tab hidden — polling disabled
// setInterval(() => fetchRejected(_rejectedPage), 30000);
// fetchRejected(1);

// ── Circuit breaker manual clear ──────────────────────────────────────────────
async function clearCircuitBreaker(key) {
  await apiFetch('/t1000/config', 'POST', { stratKey: key, circuitBreakerUntil: null });
  pollState();
}

// ── Reset balance ─────────────────────────────────────────────────────────────
function syncEoaBaseline() {
  // Read current on-chain balance from the UI (updated every ~5s from /t1000/state)
  const liveS = state && state['LIVE'];
  const currentBal = liveS?.realBalance ?? null;
  if (currentBal == null) { alert('No balance data yet — wait a moment and retry.'); return; }
  const el = document.getElementById('live-base-eoa');
  if (el) el.value = currentBal.toFixed(2);
  // Auto-save so engine immediately re-anchors the PNL baseline
  saveSetup();
}

async function resetBalance(key) {
  const msg = key === 'LIVE'
    ? 'Reset LIVE paper P&L to $0 and clear stats?'
    : (() => {
        const s = state && state[key] ? state[key] : null;
        const startBal = s ? (s.startBalance ?? (s.maxTrade ?? 150) / 0.05) : null;
        const balStr = startBal ? `$${startBal.toLocaleString()}` : 'starting balance';
        return `Reset ${key} balance to ${balStr} and clear stats?`;
      })();
  if (!confirm(msg)) return;
  await apiFetch('/t1000/reset', 'POST', { stratKey: key });
  pollState();
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function apiFetch(path, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    // Include Basic Auth for mutating requests (dual headers — fallback if SES strips Authorization)
    if (method !== 'GET' && typeof _API_AUTH !== 'undefined' && _API_AUTH) {
      opts.headers['Authorization']     = _API_AUTH;
      opts.headers['X-Polychamp-Auth']  = _API_AUTH;
    }
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    return await res.json();
  } catch (e) {
    console.error('API error', path, e);
    return null;
  }
}

// ── Render state ──────────────────────────────────────────────────────────────
function renderState(data) {
  state = data;

  for (const key of STRAT_KEYS) {
    const s = data[key];
    if (!s) continue;

    // Toggle
    const tog = document.getElementById(`toggle-${key}`);
    if (tog) tog.checked = s.enabled;

    // Threshold + price inputs (paper tabs only; LIVE/LIVE_KALSHI use their own inputs)
    if (key !== 'LIVE' && key !== 'LIVE_KALSHI') {
      const thr = document.getElementById(`thresh-${key}`);
      if (thr && document.activeElement !== thr) thr.value = s.threshold;

      const mnEl = document.querySelector(`#panel-${key} .minprice-input`);
      if (mnEl && document.activeElement !== mnEl) mnEl.value = Math.round((s.minPrice ?? 0.05) * 100);

      const mxEl = document.querySelector(`#panel-${key} .maxprice-input`);
      if (mxEl && document.activeElement !== mxEl) mxEl.value = Math.round((s.maxPrice ?? 0.90) * 100);

      const mtEl = document.querySelector(`#panel-${key} .maxtrade-input`);
      if (mtEl && document.activeElement !== mtEl) mtEl.value = Math.round(s.maxTrade ?? 150);

      // Per-crypto threshold inputs
      for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
        const el = document.querySelector(`#panel-${key} .thresh-crypto-input[data-crypto="${cr}"]`);
        if (el && document.activeElement !== el)
          el.value = s[`threshold_${cr}`] != null ? s[`threshold_${cr}`] : '';
      }
    }

    // LIVE-specific rendering
    if (key === 'LIVE') {
      // Enable banner status text
      const statusText = document.getElementById('live-status-text');
      if (statusText) {
        const openCount = (s.activityLog || []).filter(e => e.status === 'OPEN').length;
        if (s.enabled) {
          statusText.textContent = '\uD83D\uDFE2 LIVE TRADING ACTIVE';
          statusText.className   = 'live-status-text live-on';
          statusText.style.color = '';
        } else if (openCount > 0) {
          statusText.textContent = `\uD83D\uDC41 MONITORING ${openCount} OPEN POSITION${openCount > 1 ? 'S' : ''}`;
          statusText.className   = 'live-status-text';
          statusText.style.color = '#f6ad55';
        } else {
          statusText.textContent = '\uD83D\uDD12 LIVE TRADING DISABLED';
          statusText.className   = 'live-status-text';
          statusText.style.color = '';
        }
      }

      // Real Polymarket balance + derived balance stats
      const _wallets = s.wallets ?? [];
      const _isMultiWallet = _wallets.length > 1;
      const fmt = v => '$' + v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

      // EOA Wallet row: show aggregate of all wallets when multi-wallet, else default only
      const realBalEl = document.getElementById('live-real-balance');
      const realBalLabel = realBalEl?.closest('.bal-item')?.querySelector('.bal-label');
      if (_isMultiWallet) {
        const allBals = _wallets.filter(w => w.balance != null);
        if (realBalEl && allBals.length) {
          const totalBal = allBals.reduce((sum, w) => sum + w.balance, 0);
          realBalEl.textContent = fmt(totalBal);
          if (realBalLabel) realBalLabel.textContent = 'All Wallets';
        }
      } else if (realBalEl && s.realBalance != null) {
        const balStr = fmt(s.realBalance);
        const eoaAddr = s.eoaAddress;
        if (eoaAddr) {
          realBalEl.innerHTML = `<a href="https://polygonscan.com/address/${eoaAddr}" target="_blank" style="color:inherit;text-decoration:none;" title="${eoaAddr}">${balStr}</a>`;
        } else {
          realBalEl.textContent = balStr;
        }
        if (realBalLabel) realBalLabel.textContent = 'EOA Wallet';
      }

      const log = s.activityLog || [];
      const miniLog = (state['LIVE_MINI']?.activityLog || []);
      const locked = [...log, ...miniLog].filter(e => e.status === 'OPEN')
        .reduce((sum, e) => sum + (e.position || 0), 0);
      const redeemable = [...log, ...miniLog].filter(e => e.status === 'WIN' && !e.redeemed)
        .reduce((sum, e) => sum + (e.position > 0 && e.entryPrice > 0 ? e.position / e.entryPrice : 0), 0);
      const lockedEl  = document.getElementById('bal-locked-LIVE');
      const redeemEl  = document.getElementById('bal-redeem-LIVE');
      const totalElL  = document.getElementById('bal-total-LIVE');
      const eoaChanged    = s.realBalance !== lastLiveEoa;
      const redeemChanged = redeemable    !== lastLiveRedeemable;
      const lockedChanged = locked        !== lastLiveLocked;
      if (lockedEl && lockedChanged) lockedEl.textContent = locked === 0 ? '—' : fmt(locked);
      if (redeemEl) redeemEl.textContent = redeemable === 0 ? '—' : fmt(redeemable);
      // Virtual Total: for multi-wallet use sum of all wallet balances; else single EOA
      if (totalElL) {
        const baseBal = _isMultiWallet
          ? _wallets.filter(w => w.balance != null).reduce((sum, w) => sum + w.balance, 0)
          : (s.realBalance ?? 0);
        if (baseBal > 0 || locked > 0 || redeemable > 0)
          totalElL.textContent = fmt(baseBal + locked + redeemable);
      }
      lastLiveEoa        = s.realBalance ?? lastLiveEoa;
      lastLiveRedeemable = redeemable;
      lastLiveLocked     = locked;
      const redeemQEl = document.getElementById('redeem-q-LIVE');
      if (redeemQEl) redeemQEl.textContent = (s.pendingRedemptions ?? 0) === 0 ? '—' : s.pendingRedemptions;

      // ── Multi-wallet summary rows (only rendered when >1 wallet) ────────────
      const walletsSection = document.getElementById('live-wallets-section');
      if (walletsSection) {
        if (_isMultiWallet) {
          walletsSection.style.display = '';
          // Aggregate header: total balance + combined locked/redeemable/redeemQ
          const aggBal       = _wallets.filter(w => w.balance != null).reduce((sum, w) => sum + w.balance, 0);
          const aggLocked    = _wallets.reduce((sum, w) => sum + (w.locked    ?? 0), 0);
          const aggRedeemable= _wallets.reduce((sum, w) => sum + (w.redeemable?? 0), 0);
          const aggRedeemQ   = _wallets.reduce((sum, w) => sum + (w.redeemQ   ?? 0), 0);
          const totEl = document.getElementById('live-wallets-total-bal');
          if (totEl) {
            const parts = [fmt(aggBal)];
            if (aggLocked     > 0) parts.push(`Locked: ${fmt(aggLocked)}`);
            if (aggRedeemable > 0) parts.push(`Redeem: ${fmt(aggRedeemable)}`);
            if (aggRedeemQ    > 0) parts.push(`Q:${aggRedeemQ}`);
            totEl.textContent = parts.join(' · ');
          }
          // Per-wallet rows
          const rowsEl = document.getElementById('live-wallets-rows');
          if (rowsEl) {
            rowsEl.innerHTML = _wallets.map(w => {
              const bal      = w.balance != null ? fmt(w.balance) : '—';
              const pnlNum   = w.pnl ?? 0;
              const pnlStr   = (pnlNum >= 0 ? '+$' : '-$') + Math.abs(pnlNum).toFixed(2);
              const pnlCol   = pnlNum >= 0 ? '#68d391' : '#fc8181';
              const lkStr    = (w.locked    ?? 0) > 0 ? fmt(w.locked)     : '—';
              const rdStr    = (w.redeemable?? 0) > 0 ? fmt(w.redeemable) : '—';
              const rdQ      = (w.redeemQ   ?? 0) > 0 ? w.redeemQ         : '—';
              const cbBadge  = w.cbActive
                ? `<span style="background:#7c2020;color:#fbd38d;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700;">CB</span>`
                : `<span style="background:#1a3a24;color:#68d391;border-radius:3px;padding:1px 5px;font-size:10px;">OK</span>`;
              const lastT    = w.lastTrade ? new Date(w.lastTrade).toISOString().slice(11,16) + ' UTC' : '—';
              return `<div style="display:flex;align-items:center;gap:10px;padding:5px 12px;border-bottom:1px solid #1a202c;font-size:16px;flex-wrap:wrap;">
                <span style="color:#a0aec0;min-width:80px;font-weight:600;">${w.label}</span>
                <span style="color:#e2e8f0;min-width:70px;" title="Liquid USDC.e">${bal}</span>
                <span style="color:#68d391;min-width:28px;" title="Wins">W:${w.wins}</span>
                <span style="color:#fc8181;min-width:28px;" title="Losses">L:${w.losses}</span>
                <span style="color:${pnlCol};min-width:58px;" title="PNL">${pnlStr}</span>
                <span style="color:#f6ad55;min-width:52px;" title="Locked in open positions">${lkStr}</span>
                <span style="color:#63b3ed;min-width:52px;" title="Redeemable wins">${rdStr}</span>
                <span style="color:#63b3ed;min-width:24px;" title="Redeem queue">${rdQ}</span>
                ${cbBadge}
                <span style="color:#718096;margin-left:auto;font-size:14px;">last: ${lastT}</span>
              </div>`;
            }).join('');
          }
        } else {
          walletsSection.style.display = 'none';
        }
      }

      // Strategy selectors + per-duration params (skip entirely if user has unsaved edits)
      if (!setupDirty) {
        const sel5 = document.getElementById('live-strategy5m');
        if (sel5 && s.strategy5m) sel5.value = s.strategy5m;
        const sel15 = document.getElementById('live-strategy15m');
        if (sel15 && s.strategy15m) sel15.value = s.strategy15m;

        const th5El = document.getElementById('live-thresh5m');
        if (th5El && s.threshold5m != null) th5El.value = s.threshold5m;
        const mn5El = document.getElementById('live-minprice5m');
        if (mn5El && s.minPrice5m != null) mn5El.value = Math.round(s.minPrice5m * 100);
        const mx5El = document.getElementById('live-maxprice5m');
        if (mx5El && s.maxPrice5m != null) mx5El.value = Math.round(s.maxPrice5m * 100);
        const mt5El = document.getElementById('live-maxtrade5m');
        if (mt5El && s.maxTrade5m != null) mt5El.value = s.maxTrade5m;
        const mxt1_5El = document.getElementById('live-mxt1-5m');
        if (mxt1_5El && s.maxPriceT1_5m != null) mxt1_5El.value = Math.round(s.maxPriceT1_5m * 100);

        const th15El = document.getElementById('live-thresh15m');
        if (th15El && s.threshold15m != null) th15El.value = s.threshold15m;
        const mn15El = document.getElementById('live-minprice15m');
        if (mn15El && s.minPrice15m != null) mn15El.value = Math.round(s.minPrice15m * 100);
        const mx15El = document.getElementById('live-maxprice15m');
        if (mx15El && s.maxPrice15m != null) mx15El.value = Math.round(s.maxPrice15m * 100);
        const mt15El = document.getElementById('live-maxtrade15m');
        if (mt15El && s.maxTrade15m != null) mt15El.value = s.maxTrade15m;
        const mxt1_15El = document.getElementById('live-mxt1-15m');
        if (mxt1_15El && s.maxPriceT1_15m != null) mxt1_15El.value = Math.round(s.maxPriceT1_15m * 100);
        const mxt1_stEl = document.getElementById('live-mxt1-standalone');
        if (mxt1_stEl && s.maxPriceT1standalone != null) mxt1_stEl.value = Math.round(s.maxPriceT1standalone * 100);
      }

      // Best Cxx candidates — ranked by Score (90% CI lower bound of EV/trade)
      const periods5m  = ['C50','C55','C60','C65','C70','C75','C80','C85','C90','C95'];
      const periods15m = ['C150','C165','C180','C195','C210','C225','C240','C255'];
      for (const [elId, periods, dur] of [['live-best-5m', periods5m, '5m'], ['live-best-15m', periods15m, '15m']]) {
        const el = document.getElementById(elId);
        if (!el) continue;
        const cxx   = periods.reduce((b, p) => {
          const sa = state[b]?.score ?? -Infinity;
          const sb = state[p]?.score ?? -Infinity;
          return sb > sa ? p : b;
        }, periods[0]);
        const cs    = state[cxx];
        const total = (cs?.wins ?? 0) + (cs?.losses ?? 0);
        const wr    = total > 0 ? ((cs.wins / total) * 100).toFixed(1) + '% WR' : '—';
        const score = cs?.score != null ? (cs.score >= 0 ? '+' : '') + cs.score.toFixed(3) : null;
        const roi   = cs?.startBalance > 0 ? (((cs.balance - cs.startBalance) / cs.startBalance) * 100).toFixed(1) + '% ROI' : '—';
        const scoreLabel = score != null ? `Score <b>${score}</b> &middot; ` : '';
        el.innerHTML = `&#x2605; Best: <button class="best-cxx-btn" onclick="document.getElementById('live-strategy${dur}').value='${cxx}'">${cxx}</button> <span class="best-wr">${scoreLabel}${wr} &middot; ${roi}</span>`;
      }

      // Per-crypto threshold + Cxx selects for LIVE (5m and 15m) — in #panel-SETUP
      if (!setupDirty) {
        for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
          for (const dur of ['5m', '15m']) {
            const el = document.querySelector(`#panel-SETUP .thresh-crypto-input[data-strat="LIVE"][data-crypto="${cr}"][data-dur="${dur}"]`);
            if (el) { const val = s[`threshold${dur}_${cr}`]; el.value = val != null ? val : ''; }
            const sel = document.querySelector(`#panel-SETUP .strat-crypto-select[data-strat="LIVE"][data-crypto="${cr}"][data-dur="${dur}"]`);
            if (sel) sel.value = s[`strategy${dur}_${cr}`] ?? '';
          }
        }
      }
      // Lock button states — gated by setupDirty (same as threshold inputs) so polls
      // don't overwrite user's lock toggle before they click Save
      if (!setupDirty) {
        const locks = s.lockedThresholds || {};
        for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
          for (const dur of ['5m', '15m']) {
            const btn = document.querySelector(`#panel-SETUP .th-lock-btn[data-strat="LIVE"][data-crypto="${cr}"][data-dur="${dur}"]`);
            if (!btn) continue;
            const field = `threshold${dur}_${cr}`;
            const isLocked = !!locks[field];
            btn.dataset.locked = isLocked ? '1' : '0';
            btn.innerHTML = isLocked
              ? '<svg class="ico ico-sm"><use href="#ico-lock"/></svg>'
              : '<svg class="ico ico-sm"><use href="#ico-unlock"/></svg>';
            btn.style.color = isLocked ? '#ed8936' : '#4a5568';
            const thEl = btn.closest('div')?.querySelector('.thresh-crypto-input');
            if (thEl) thEl.style.outline = isLocked ? '1px solid #ed8936' : '';
          }
        }
      }
      renderLiveActiveConfig(s);
      renderSettingsHistory(s.settingsHistory);
    }

    // LIVE_KALSHI-specific rendering
    if (key === 'LIVE_KALSHI') {
      // Enable banner
      const kStatusText = document.getElementById('kalshi-status-text');
      if (kStatusText) {
        kStatusText.textContent = s.enabled ? '\uD83D\uDFE2 KALSHI LIVE ACTIVE' : '\uD83D\uDD12 KALSHI LIVE DISABLED';
        kStatusText.className   = s.enabled ? 'live-status-text live-on' : 'live-status-text';
      }

      // Kalshi balance + derived balance stats
      const kBalEl = document.getElementById('kalshi-real-balance');
      if (kBalEl && s.kalshiBalance != null) {
        kBalEl.textContent = '$' + s.kalshiBalance.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      }
      const kLog    = s.activityLog || [];
      const kLocked = kLog.filter(e => e.status === 'OPEN').reduce((sum, e) => sum + (e.position || 0), 0);
      const kFmt    = v => '$' + v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      const kLockedEl = document.getElementById('bal-locked-LIVE_KALSHI');
      const kTotalEl  = document.getElementById('bal-total-LIVE_KALSHI');
      if (kLockedEl) kLockedEl.textContent = kFmt(kLocked);
      if (kTotalEl && s.kalshiBalance != null)
        kTotalEl.textContent = kFmt(s.kalshiBalance + kLocked);

      // Tab badge
      const kBadge = document.getElementById('tab-badge-LIVE_KALSHI');
      if (kBadge) {
        kBadge.textContent = s.enabled ? '●' : '15M';
        kBadge.style.color  = s.enabled ? '#68d391' : '#63b3ed';
      }
    }

    // LIVE_MINI-specific rendering
    if (key === 'LIVE_MINI') {
      const mStatusText = document.getElementById('mini-status-text');
      if (mStatusText) {
        mStatusText.textContent = s.enabled ? '\uD83D\uDFE2 MINI ACTIVE' : '\uD83D\uDD12 MINI DISABLED';
        mStatusText.className   = s.enabled ? 'live-status-text live-on' : 'live-status-text';
      }
      // Real balance (shares LIVE wallet)
      const mBalEl = document.getElementById('mini-real-balance');
      if (mBalEl && s.realBalance != null)
        mBalEl.textContent = '$' + s.realBalance.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      // Locked + virtual total
      const mLog    = s.activityLog || [];
      const mLocked = mLog.filter(e => e.status === 'OPEN').reduce((sum, e) => sum + (e.position || 0), 0);
      const mFmt    = v => '$' + v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      const mLockedEl = document.getElementById('bal-locked-LIVE_MINI');
      const mTotalEl  = document.getElementById('bal-total-LIVE_MINI');
      if (mLockedEl) mLockedEl.textContent = mFmt(mLocked);
      if (mTotalEl) mTotalEl.textContent = mFmt((s.balance ?? 0) + mLocked);
      // Tab badge
      const mBadge = document.getElementById('tab-badge-LIVE_MINI');
      const riskDiv = s.riskDivisor ?? 3;
      if (mBadge) {
        mBadge.textContent = s.enabled ? '●' : `1/${riskDiv}`;
        mBadge.style.color  = s.enabled ? '#68d391' : '#9f7aea';
      }
      // Config inputs (only when not dirty)
      if (!setupDirty && !miniDirty) {
        const mpEl = document.getElementById('mini-max-pos');
        if (mpEl && s.maxPositions != null) mpEl.value = s.maxPositions;
        const rdEl = document.getElementById('mini-risk-divisor');
        if (rdEl && s.riskDivisor != null) rdEl.value = s.riskDivisor;
      }
    }

    // Stats
    const balEl = document.getElementById(`bal-${key}`);
    if (balEl) {
      if (key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI') {
        let pnl;
        if (key === 'LIVE' && s.baseEoaBalance != null) {
          // PNL stat = s.balance (engine-side sum of all activityLog.pnl since last reset — not the 50-entry slice)
          pnl = parseFloat((s.balance ?? 0).toFixed(2));
          if (s.riskPct != null) _rejLiveContext = { balance: s.baseEoaBalance, riskPct: s.riskPct };
          // Sync base EOA input (only when SETUP not dirty)
          if (!setupDirty) {
            const baseEl = document.getElementById('live-base-eoa');
            if (baseEl) baseEl.value = s.baseEoaBalance.toFixed(2);
            const riskEl = document.getElementById('live-risk-pct');
            if (riskEl && s.riskPct != null) riskEl.value = parseFloat((s.riskPct * 100).toFixed(1));
            const mpEl = document.getElementById('live-max-positions');
            if (mpEl && s.maxPositions != null) mpEl.value = s.maxPositions;
            const t0El = document.getElementById('live-t0');
            if (t0El && s.t0off !== undefined) t0El.checked = s.t0off !== true;
            const t1El = document.getElementById('live-t1-mode');
            if (t1El && s.t1Mode !== undefined) t1El.checked = s.t1Mode !== false;
            const t1StEl = document.getElementById('live-t1-standalone');
            if (t1StEl && s.t1standalone !== undefined) t1StEl.checked = s.t1standalone === true;
            const fokRetryEl = document.getElementById('live-fok-retry-enabled');
            if (fokRetryEl && s.fokRetryEnabled !== undefined) fokRetryEl.checked = s.fokRetryEnabled !== false;
            const fokDivEl = document.getElementById('live-fok-divisor');
            if (fokDivEl && s.fokRetryDivisor != null) fokDivEl.value = s.fokRetryDivisor;
            const fokMaxEl = document.getElementById('live-fok-max');
            if (fokMaxEl && s.fokRetryMax != null) fokMaxEl.value = s.fokRetryMax;
            const cbEnEl = document.getElementById('live-cb-enabled');
            if (cbEnEl && s.circuitBreakerEnabled !== undefined) cbEnEl.checked = s.circuitBreakerEnabled !== false;
            const cbMinsEl = document.getElementById('live-cb-mins');
            if (cbMinsEl && s.circuitBreakerMins != null) cbMinsEl.value = s.circuitBreakerMins;
            // Drawdown limit
            const dlEnEl = document.getElementById('live-dl-enabled');
            if (dlEnEl && s.drawdownLimitEnabled !== undefined) dlEnEl.checked = s.drawdownLimitEnabled !== false;
            const dlMaxEl = document.getElementById('live-dl-max-losses');
            if (dlMaxEl && s.drawdownLimitMaxLosses != null) dlMaxEl.value = s.drawdownLimitMaxLosses;
            const dlWinEl = document.getElementById('live-dl-window-mins');
            if (dlWinEl && s.drawdownLimitWindowMins != null) dlWinEl.value = s.drawdownLimitWindowMins;
            const dlPauseEl = document.getElementById('live-dl-pause-mins');
            if (dlPauseEl && s.drawdownLimitPauseMins != null) dlPauseEl.value = s.drawdownLimitPauseMins;
            // Dist min
            const dm5El = document.getElementById('live-distmin5m');
            if (dm5El && s.distMin5m != null) dm5El.value = s.distMin5m;
            const dm15El = document.getElementById('live-distmin15m');
            if (dm15El && s.distMin15m != null) dm15El.value = s.distMin15m;
            // No spike filter
            const nsfEl = document.getElementById('live-no-spike-filter');
            if (nsfEl && s.noSpikeFilter !== undefined) nsfEl.checked = s.noSpikeFilter === true;
            // Include signals toggles
            const alvEl = document.getElementById('live-allow-low-vol');
            if (alvEl && s.allowLowVol !== undefined) alvEl.checked = s.allowLowVol !== false;
            const apoEl = document.getElementById('live-allow-price-oor');
            if (apoEl && s.allowPriceOor !== undefined) apoEl.checked = s.allowPriceOor === true;
            // Body%
            const bpEl = document.getElementById('live-body-pct');
            if (bpEl && s.bodyPct != null) bpEl.value = s.bodyPct;
            // D2 filters
            const dirEl = document.getElementById('live-direction-filter');
            if (dirEl) dirEl.value = s.directionFilter || '';
            const shEl  = document.getElementById('live-skip-hours');
            if (shEl)  shEl.value  = Array.isArray(s.skipHours) ? s.skipHours.join(',') : '';
            const sdEl  = document.getElementById('live-skip-dow');
            if (sdEl)  sdEl.value  = Array.isArray(s.skipDow)   ? s.skipDow.join(',')   : '';
            const cmEl  = document.getElementById('live-coord-min');
            if (cmEl && s.coordMinCryptos != null) cmEl.value = s.coordMinCryptos;
            // Drawdown status badge
            const dlSt = document.getElementById('live-dl-status');
            if (dlSt) {
              if (s.drawdownPausedUntil && s.drawdownPausedUntil > Date.now()) {
                const remMin = Math.ceil((s.drawdownPausedUntil - Date.now()) / 60000);
                const resumeAt = new Date(s.drawdownPausedUntil).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: false }) + ' EAT';
                dlSt.textContent = `⛔ PAUSED — resumes at ${resumeAt} (in ${remMin} min · ${s.drawdownRecentLosses} losses in window)`;
                dlSt.style.cssText = 'color:#f6ad55;font-size:11px;font-weight:600;display:inline!important;';
              } else if (s.drawdownRecentLosses > 0) {
                dlSt.textContent = `${s.drawdownRecentLosses} loss${s.drawdownRecentLosses > 1 ? 'es' : ''} in window`;
                dlSt.style.cssText = 'color:#fbd38d;font-size:11px;display:inline!important;';
              } else {
                dlSt.textContent = '';
                dlSt.style.display = 'none';
              }
            }
            const resetAtVal = document.getElementById('live-reset-at-val');
            if (resetAtVal) resetAtVal.textContent = s.resetAt ? fmtEAT(s.resetAt) : '—';
            const resetBalEl = document.getElementById('live-reset-bal');
            if (resetBalEl) resetBalEl.textContent = s.resetAt && s.baseEoaBalance != null ? `@ $${s.baseEoaBalance.toFixed(2)}` : '';
          }
        } else {
          // LIVE_KALSHI or when base not yet loaded: fall back to activityLog sum
          pnl = (s.activityLog || []).reduce((sum, e) => sum + (e.pnl != null ? e.pnl : 0), 0);
        }
        if (pnl == null) {
          balEl.textContent = '—';
          balEl.className   = 'stat-value';
        } else {
          balEl.textContent = (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);
          balEl.className   = `stat-value ${pnl > 0 ? 'green' : pnl < 0 ? 'red' : ''}`;
        }
        // ROI% = PnL / starting EOA balance × 100
        const roiEl = document.getElementById(`roi-${key}`);
        if (roiEl) {
          const roiBase = s.baseEoaBalance > 0 ? s.baseEoaBalance
                        : s.realBalance    > 0 ? s.realBalance - (pnl ?? 0)
                        : 0;
          if (pnl != null && roiBase > 0) {
            const roi = pnl / roiBase * 100;
            roiEl.textContent = (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';
            roiEl.className   = `stat-value ${roi > 0 ? 'green' : roi < 0 ? 'red' : 'grey'}`;
          } else {
            roiEl.textContent = '—';
            roiEl.className   = 'stat-value grey';
          }
        }
      } else {
      const startBal = s.startBalance ?? ((s.maxTrade ?? 150) / 0.05);
      const diff = s.balance - startBal;
      balEl.textContent = `$${s.balance.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
      balEl.className = `stat-value ${diff > 0 ? 'green' : diff < 0 ? 'red' : ''}`;

      // ROI% — insert stat-item after Balance on first render, update on subsequent calls
      let roiEl = document.getElementById(`roi-${key}`);
      if (!roiEl) {
        const statItem = balEl.closest('.stat-item');
        if (statItem) {
          const newItem = document.createElement('div');
          newItem.className = 'stat-item';
          newItem.innerHTML = `<div class="stat-label">ROI</div><div class="stat-value grey" id="roi-${key}">—%</div>`;
          statItem.insertAdjacentElement('afterend', newItem);
          roiEl = document.getElementById(`roi-${key}`);
        }
      }
      if (roiEl && startBal > 0) {
        const roi = (s.balance - startBal) / startBal * 100;
        roiEl.textContent = (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';
        roiEl.className = `stat-value ${roi > 0 ? 'green' : roi < 0 ? 'red' : 'grey'}`;
      }
      } // end else (non-LIVE balance)
    }

    const wrEl = document.getElementById(`wr-${key}`);
    if (wrEl) {
      wrEl.textContent = s.winRate != null ? `${s.winRate}%` : '—%';
      wrEl.className   = `stat-value ${s.winRate != null ? (s.winRate >= 80 ? 'green' : s.winRate >= 60 ? '' : 'red') : 'grey'}`;
    }

    const wEl = document.getElementById(`wins-${key}`);
    if (wEl) wEl.textContent = s.wins;

    const lEl = document.getElementById(`losses-${key}`);
    if (lEl) lEl.textContent = s.losses;

    const fEl = document.getElementById(`failed-${key}`);
    if (fEl) {
      const fc = s.failed || 0;
      fEl.textContent  = fc;
      fEl.style.color  = fc > 0 ? '#f6ad55' : '#718096';
    }

    const pEl = document.getElementById(`pend-${key}`);
    if (pEl) pEl.textContent = s.pending || 0;

    // Skipped >90¢ count from activityLog
    const skipEl = document.getElementById(`skip-${key}`);
    if (skipEl) {
      const skipCount = (s.activityLog || []).filter(e => e.status === 'SKIP').length;
      skipEl.textContent = skipCount;
    }

    // FOK retry stats row (LIVE only)
    if (key === 'LIVE' && s.fokStats) {
      const fok = s.fokStats;
      const fRow = document.getElementById('fok-stats-LIVE');
      if (fRow) {
        const _t = document.getElementById('fok-total-LIVE');  if (_t) _t.textContent = fok.total;
        const _f = document.getElementById('fok-filled-LIVE'); if (_f) _f.textContent = fok.filled;
        const _w = document.getElementById('fok-wins-LIVE');   if (_w) _w.textContent = fok.wins;
        const _l = document.getElementById('fok-losses-LIVE'); if (_l) _l.textContent = fok.losses;
        const _x = document.getElementById('fok-failed-LIVE'); if (_x) _x.textContent = fok.failed;
        const _r = document.getElementById('fok-wr-LIVE');
        if (_r) {
          _r.textContent = fok.wr != null ? `${fok.wr}%` : '—';
          _r.style.color = fok.wr == null ? '#718096' : fok.wr >= 80 ? '#68d391' : fok.wr >= 60 ? '#e2e8f0' : '#fc8181';
        }
        const _p = document.getElementById('fok-pnl-LIVE');
        if (_p) {
          _p.textContent = fok.total > 0 ? (fok.pnl >= 0 ? `+$${fok.pnl.toFixed(2)}` : `-$${Math.abs(fok.pnl).toFixed(2)}`) : '—';
          _p.style.color  = fok.total > 0 ? (fok.pnl > 0 ? '#68d391' : fok.pnl < 0 ? '#fc8181' : '#e2e8f0') : '#718096';
        }
        const _a = document.getElementById('fok-active-LIVE');
        if (_a) _a.style.display = fok.open > 0 ? '' : 'none';
      }
      if (s.rejStats) {
        const rs = s.rejStats;
        const _rt0 = document.getElementById('rej-t0-LIVE');    if (_rt0) _rt0.textContent = rs.t0;
        const _rt1 = document.getElementById('rej-t1-LIVE');    if (_rt1) _rt1.textContent = rs.t1;
        const _rtc = document.getElementById('rej-tc-LIVE');    if (_rtc) _rtc.textContent = rs.tc;
        const _rtt = document.getElementById('rej-total-LIVE'); if (_rtt) _rtt.textContent = rs.total;
        const _rdb = document.getElementById('rej-details-btn'); if (_rdb) _rdb.style.display = rs.total > 0 ? '' : 'none';
        const _rrEl = document.getElementById('rej-reasons-LIVE');
        if (_rrEl && rs.byReason) {
          const LABELS = {
            below_threshold:  'low-spike',
            weak_body:        'weak-body',
            low_vol:          'low-vol',
            exhausted:        'exhaust',
            dir_filter:       'dir-filt',
            time_filter:      'time-filt',
            coord_wait:       'coord-wait',
            no_liquidity:     'no-liq',
            price_too_low:    'price-lo',
            price_too_high:   'price-hi',
            already_pending:  'pending',
            asset_already_open: 'open',
            circuit_breaker:  'circ-brk',
            max_positions:    'max-pos',
            signal_too_stale: 'stale',
          };
          const entries = Object.entries(rs.byReason).filter(([,v]) => v > 0);
          if (entries.length) {
            _rrEl.style.display = 'flex';
            _rrEl.innerHTML = entries.map(([k, v]) => {
              const lbl = LABELS[k] || k.replace(/_/g, '-');
              return `<span style="background:#252e40;padding:1px 7px;border-radius:10px;white-space:nowrap;">`
                + `<span style="color:#718096">${lbl}</span>&nbsp;<strong style="color:#f6ad55">${v}</strong></span>`;
            }).join('');
          } else {
            _rrEl.style.display = 'none';
          }
        }
      }
    }

    // Circuit breaker status bar (LIVE only)
    if (key === 'LIVE') {
      const cbBar = document.getElementById('cb-status-LIVE');
      if (cbBar) {
        const cbUntil = s.circuitBreakerUntil;
        const cbActive = cbUntil && cbUntil > Date.now();
        cbBar.style.display = cbActive ? 'flex' : 'none';
        if (cbActive) {
          const eatOffset = 3 * 3600000;
          const untilEat = new Date(cbUntil + eatOffset).toISOString().slice(11,16);
          const remMs  = cbUntil - Date.now();
          const remMin = Math.ceil(remMs / 60000);
          const untilEl  = document.getElementById('cb-until-LIVE');
          const remEl    = document.getElementById('cb-remain-LIVE');
          if (untilEl) untilEl.textContent = untilEat;
          if (remEl)   remEl.textContent   = `${remMin} min`;
        }
      }
    }

    // Tab badge for LIVE
    if (key === 'LIVE') {
      const badge = document.getElementById('tab-badge-LIVE');
      if (badge) {
        badge.textContent = s.enabled ? '\u25CF' : '\u25CB';
        badge.style.color  = s.enabled ? '#68d391' : '#718096';
      }
      // Also update the section-bar dot
      const dot = document.getElementById('section-live-dot');
      if (dot) {
        dot.textContent = s.enabled ? '\u25CF' : '\u25CB';
        dot.style.color  = s.enabled ? '#68d391' : '#718096';
      }
    }

    // New-item badge: count increase on inactive tabs
    const visCount = countVisible(s.activityLog || []);
    const tabKey   = KEY_TO_TAB[key] || key;
    if (tabKey !== currentTab && visCount > prevLogCount[key]) {
      unreadCount[key] += visCount - prevLogCount[key];
      updateTabBadge(key);
    }
    prevLogCount[key] = visCount;

    // Activity log: split LIVE/LIVE_KALSHI/LIVE_MINI into positions + trades; paper uses full log
    if (key === 'LIVE' || key === 'LIVE_KALSHI' || key === 'LIVE_MINI') {
      renderPositions(key, s.activityLog || []);
      updatePositionColors(key);
      updatePositionPrices();
      // LIVE recent-trades panel also shows LIVE_MINI trades (tagged _isMini) for unified view
      if (key === 'LIVE') {
        const miniLog = (state['LIVE_MINI']?.activityLog || []).map(e => ({ ...e, _isMini: true }));
        const combined = [...(s.activityLog || []), ...miniLog]
          .sort((a, b) => new Date(b.time) - new Date(a.time));
        renderTrades(key, combined);
        updateMarketDistPanel();
      } else {
        renderTrades(key, s.activityLog || []);
      }
    } else {
      renderLog(key, s.activityLog || []);
    }
  }
}

// ── Render open positions (LIVE / LIVE_KALSHI) ────────────────────────────────
function renderPositions(key, log) {
  const el = document.getElementById(`positions-${key}`);
  if (!el) return;
  const isKalshi = key === 'LIVE_KALSHI';
  const openEntries = log.filter(e => e.status === 'OPEN');
  const fp = openEntries.map(e => `${e.tradeId}|${e.status}`).join(',') || 'empty';
  if (el.dataset.lastFp === fp) return;
  el.dataset.lastFp = fp;
  if (!openEntries.length) {
    el.innerHTML = '<div class="empty-log">No open positions</div>';
    return;
  }
  const rows = openEntries.map(e => {
    const t   = new Date(e.time);
    const ts  = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const dir = e.direction === 'UP'
      ? '<span class="dir-up">&#x25B2; UP</span>'
      : '<span class="dir-down">&#x25BC; DOWN</span>';
    const entry = e.entryPrice != null ? `${(e.entryPrice * 100).toFixed(0)}&#x00A2;` : '&#x2014;';
    const bet   = e.position   != null ? `$${e.position.toFixed(2)}` : '&#x2014;';
    const spike = e.spike_pct  != null ? `+${e.spike_pct.toFixed(2)}%` : '&#x2014;';
    const is15m = e.candle_size >= 150;
    const cycleMs = is15m ? 900000 : 300000;
    const typeBadge = is15m
      ? '<span class="badge-15m">15MIN</span>'
      : '<span class="badge-5m">5MIN</span>';
    const cfgKey = 'A_' + (e.tradeId || e.time);
    _tradeConfigs[cfgKey] = e;
    const statusBadge = e.status === 'FAILED'
      ? '<span class="badge" style="background:#4a2200;color:#f6ad55;font-size:10px">FAILED</span>'
      : '<span class="badge" style="background:#1a3a1a;color:#68d391;font-size:10px">OPEN</span>';
    const rowStyle = e.status === 'FAILED' ? ' style="opacity:0.55"' : '';
    const cycleStart = e.cycleStart ? new Date(e.cycleStart).getTime() : 0;
    const dataAttrs = e.status !== 'FAILED'
      ? ` data-crypto="${e.crypto}" data-dir="${e.direction}" data-t0open="${e.t0Open ?? ''}" data-trade-id="${e.tradeId ?? ''}" data-cycle-start="${cycleStart}" data-cycle-ms="${cycleMs}"`
      : '';
    let idCell;
    if (!isKalshi && e.cycleStart && e.candle_size) {
      const url = polyUrlFE(e.crypto, e.cycleStart, e.candle_size);
      idCell = url
        ? `<a href="${url}" target="_blank" style="color:#4fd1c5;text-decoration:none;">&#x1F4CA; ${e.tradeId || '&#x2014;'}</a>`
        : (e.tradeId || '&#x2014;');
    } else {
      idCell = `&#x1F535; ${e.tradeId || '&#x2014;'}`;
    }
    const cxx = e.candle_size ? `C${e.candle_size}` : '—';
    const entryBadge = !e.isT1
      ? '<span style="color:#a0aec0;font-size:12px;font-weight:700;">T0</span>'
      : e.label === 'TC'
        ? '<span style="color:#b794f4;font-size:12px;font-weight:700;">TC</span>'
        : '<span style="color:#f6ad55;font-size:12px;font-weight:700;">T1</span>';
    let fokCell = '';
    if (e.isFokRetry) {
      const origId = (e.tradeId || '').replace(/_FOKR$/, '');
      fokCell = `<span title="FOK retry of ${origId}" style="background:#3d2b00;color:#e8a84a;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;border:1px solid #7c5b00;letter-spacing:.03em;cursor:default;">FOK retry</span>`;
    }
    const tid = e.tradeId ?? '';
    const sellBtn = (!isKalshi && e.status !== 'FAILED')
      ? `<button onclick="manualSell('${tid}')" style="font-size:10px;padding:2px 8px;background:#742a2a;color:#fc8181;border:1px solid #9b2c2c;border-radius:4px;cursor:pointer;font-weight:600">SELL</button>`
      : '';
    const bodyPct = e.body_ratio != null ? `${e.body_ratio.toFixed(1)}%` : '—';
    return `<tr${rowStyle}${dataAttrs}>
      <td>${ts}</td><td><strong>${e.crypto}</strong></td><td>${typeBadge}</td>
      <td><button onclick="showTradeConfig('${cfgKey}')" style="background:none;border:none;cursor:pointer;color:#90cdf4;font-size:11px;text-decoration:underline dotted;padding:0;font-weight:600;">Config</button></td>
      <td style="color:#a0aec0;font-size:11px">${cxx}</td>
      <td style="color:#718096;font-size:11px">${bodyPct}</td>
      <td style="text-align:center;">${entryBadge}</td><td>${dir}</td>
      <td>${entry}</td><td>${bet}</td>
      <td id="pos-ab-${tid}" style="font-size:11px;color:#a0aec0;white-space:nowrap">—</td>
      <td id="pos-dist-${tid}" style="font-size:11px;white-space:nowrap">—</td>
      <td style="color:#f6ad55">${spike}</td>
      <td>${idCell}</td>
      <td>${fokCell}</td><td>${statusBadge}</td><td>${sellBtn}</td>
    </tr>
    <tr class="pos-gauge-row" style="height:3px">
      <td colspan="17" style="padding:0;background:#2d3748">
        <div id="pos-pg-${tid}" style="height:3px;width:0%;background:#4299e1;transition:width 0.9s linear;border-radius:0 2px 2px 0"></div>
      </td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="table-scroll"><table style="border-spacing:0">
    <thead><tr>
      <th>Time</th><th>Crypto</th><th>Type</th><th style="font-size:11px">Config</th><th>Cxx</th><th style="color:#718096;font-size:11px">Body%</th><th style="text-align:center;">Entry</th><th>Dir</th>
      <th>Price</th><th>Bet</th><th>Ask/Bid</th><th>Dist%</th><th>Spike</th><th>Market / ID</th><th></th><th>Status</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ── Update position row background colors based on current Binance price ──────
function updatePositionColors(key) {
  const el = document.getElementById(`positions-${key}`);
  if (!el) return;
  const closes = (state[key] ?? {}).liveCurrentClose ?? {};
  // Build set of currently-OPEN trade IDs — used to immediately dim resolved rows
  // before renderPositions gets a chance to remove them on the next state poll
  const openIds = new Set((state[key]?.activityLog || []).filter(e => e.status === 'OPEN').map(e => e.tradeId));
  el.querySelectorAll('tr[data-crypto]').forEach(tr => {
    const tid = tr.dataset.tradeId;
    // Position resolved but row not yet removed — black out immediately
    if (tid && !openIds.has(tid)) {
      tr.style.background = '#000';
      const distEl = document.getElementById(`pos-dist-${tid}`);
      if (distEl) distEl.innerHTML = '';
      const abEl = document.getElementById(`pos-ab-${tid}`);
      if (abEl) abEl.innerHTML = '';
      return;
    }
    const crypto = tr.dataset.crypto;
    const dir    = tr.dataset.dir;
    const t0Open = parseFloat(tr.dataset.t0open);
    const curr   = closes[crypto];
    if (!curr || isNaN(t0Open) || t0Open <= 0) { tr.style.background = ''; return; }
    const winning = dir === 'UP' ? curr > t0Open : curr < t0Open;
    tr.style.background = winning ? 'rgba(0,80,0,0.3)' : 'rgba(100,0,0,0.3)';
    const distEl = document.getElementById(`pos-dist-${tid}`);
    if (distEl) {
      const rawPct = dir === 'DOWN' ? (t0Open - curr) / t0Open * 100 : (curr - t0Open) / t0Open * 100;
      const sign   = rawPct >= 0 ? '+' : '';
      const color  = rawPct >= 0 ? '#68d391' : '#fc8181';
      distEl.innerHTML = `<span style="color:${color};font-weight:600">${sign}${(rawPct * 100).toFixed(1)}%</span>`;
    }
  });
}

// ── Update progress gauges for all open positions ─────────────────────────────
function updatePositionGauges() {
  const now = Date.now();
  document.querySelectorAll('tr[data-cycle-start]').forEach(tr => {
    const cycleStart = parseInt(tr.dataset.cycleStart);
    const cycleMs    = parseInt(tr.dataset.cycleMs);
    const tid        = tr.dataset.tradeId;
    if (!cycleStart || !cycleMs || !tid) return;
    const pct = Math.min(100, Math.max(0, (now - cycleStart) / cycleMs * 100));
    const bar = document.getElementById(`pos-pg-${tid}`);
    if (!bar) return;
    bar.style.width = pct.toFixed(1) + '%';
    bar.style.background = '#000';
  });
}

// ── Live market dist% panel (Binance current close vs T0 cycle open) ──────────
function updateMarketDistPanel() {
  const s = state['LIVE'];
  if (!s) return;
  const refs   = s.liveCycleRef    ?? {};
  const closes = s.liveCurrentClose ?? {};
  const CRYPTOS = ['BTC','ETH','SOL','XRP'];
  const TFS     = ['5m','15m'];
  for (const tf of TFS) {
    const refMap = refs[tf] ?? {};
    for (const cr of CRYPTOS) {
      const ref  = refMap[cr];
      const curr = closes[cr];
      const el   = document.getElementById(`mkt-dist-${tf}-${cr}`);
      if (!el) continue;
      if (ref == null || curr == null || ref <= 0) {
        el.textContent = '—';
        el.style.color = '#4a6080';
        el.style.background = '';
        continue;
      }
      const pct    = (curr - ref) / ref * 100;
      const sign   = pct >= 0 ? '+' : '';
      const thKey  = tf === '5m' ? `threshold5m_${cr}` : `threshold15m_${cr}`;
      const thFall = tf === '5m' ? s.threshold5m : s.threshold15m;
      const thresh = s[thKey] != null ? parseFloat(s[thKey]) : (thFall != null ? parseFloat(thFall) : null);
      const absPct = Math.abs(pct);
      const triggered = thresh != null && absPct >= thresh;
      el.innerHTML = `${sign}${pct.toFixed(2)}%`;
      el.style.color      = pct >= 0 ? '#68d391' : '#fc8181';
      el.style.background = triggered ? (pct >= 0 ? 'rgba(0,80,0,0.35)' : 'rgba(120,0,0,0.35)') : '';
      el.style.borderRadius = '3px';
      // Update threshold sub-row
      const thEl = document.getElementById(`mkt-thresh-${tf}-${cr}`);
      if (thEl) thEl.textContent = thresh != null ? `≥${thresh.toFixed(2)}%` : '—';
    }
  }
}

// ── Update ask/bid cells from livePrices ──────────────────────────────────────
function updatePositionPrices() {
  document.querySelectorAll('tr[data-trade-id][data-crypto]').forEach(tr => {
    const tid    = tr.dataset.tradeId;
    const crypto = tr.dataset.crypto;
    const dir    = tr.dataset.dir;
    if (!tid || !crypto) return;
    // Skip rows already blacked out by updatePositionColors
    if (tr.style.background === 'rgb(0, 0, 0)') return;
    const p = livePrices[crypto];
    if (!p) return;
    const ask = dir === 'UP' ? p.up    : p.down;
    const bid = dir === 'UP' ? p.up_bid : p.down_bid;
    const cell = document.getElementById(`pos-ab-${tid}`);
    if (!cell) return;
    const fmtC = v => v != null ? `${(v * 100).toFixed(0)}&#x00A2;` : '—';
    cell.innerHTML = `<span style="color:#e2e8f0">${fmtC(ask)}</span> <span style="color:#718096;font-size:10px">/ ${fmtC(bid)}</span>`;
  });
}

// ── Live price poll (every 2s) ────────────────────────────────────────────────
async function pollLivePrices() {
  const data = await apiFetch('/spike-latest-prices');
  if (!data) return;
  livePrices = data;
  updatePositionPrices();
  updatePositionColors('LIVE');
  updatePositionColors('LIVE_KALSHI');
}

// ── Manual sell ───────────────────────────────────────────────────────────────
async function manualSell(tradeId) {
  if (!confirm(`Manually sell position ${tradeId}?\nThis will place a market sell order immediately.`)) return;
  const btn = document.querySelector(`button[onclick="manualSell('${tradeId}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const res = await apiFetch('/t1000/live-sell', 'POST', { tradeId });
  if (!res || res.error) {
    alert(`Sell failed: ${res?.error || 'unknown error'}`);
    if (btn) { btn.disabled = false; btn.textContent = 'SELL'; }
    return;
  }
  const pnlStr = res.pnl >= 0 ? `+$${res.pnl.toFixed(2)}` : `-$${Math.abs(res.pnl).toFixed(2)}`;
  const exitC  = res.exitPrice != null ? ` @ ${(res.exitPrice * 100).toFixed(0)}¢` : '';
  alert(`Sold ${tradeId}${exitC}  PnL: ${pnlStr}`);
  pollState();  // refresh state immediately
}

// ── Render resolved trades (LIVE / LIVE_KALSHI) ───────────────────────────────
function renderTrades(key, log) {
  const el = document.getElementById(`log-${key}`);
  if (!el) return;
  const isKalshi  = key === 'LIVE_KALSHI';
  const clearedAt = state[key]?.tradeListClearedAt || null;
  const resolved  = log.filter(e =>
    (e.status === 'WIN' || e.status === 'LOSS' || e.status === 'RECOV') &&
    (!clearedAt || e.time >= clearedAt)
  );
  const fp = resolved.map(e => `${e.tradeId}|${e.status}|${e.pnl ?? ''}`).join(',') || 'empty';
  if (el.dataset.lastFp === fp) return;
  el.dataset.lastFp = fp;
  if (!resolved.length) {
    el.innerHTML = '<div class="empty-log">No resolved trades yet</div>';
    if (key === 'LIVE') {
      const a = document.getElementById('live-avg-price');      if (a) a.textContent = '';
      const b = document.getElementById('live-24h-pnl');        if (b) b.textContent = '';
      const c = document.getElementById('live-avg-price-mini'); if (c) c.textContent = '';
    }
    return;
  }
  // Avg buy price + 24H PnL for LIVE tab (includes MINI)
  if (key === 'LIVE') {
    const avgEl     = document.getElementById('live-avg-price');
    const avgMiniEl = document.getElementById('live-avg-price-mini');
    const pnl24El   = document.getElementById('live-24h-pnl');
    const avgBuy = (trades, label, color) => {
      const last150 = trades.slice().sort((a, b) => new Date(a.time) - new Date(b.time)).slice(-150);
      const prices  = last150.map(e => e.entryPrice).filter(v => v != null);
      if (!prices.length) return '';
      const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
      return `${label} avg: ${(avg * 100).toFixed(1)}¢ (${prices.length})`;
    };
    if (avgEl) {
      const liveOnly = resolved.filter(e => !e._isMini);
      avgEl.textContent = avgBuy(liveOnly, 'LIVE', '#a0aec0');
    }
    if (avgMiniEl) {
      const miniOnly = resolved.filter(e => e._isMini);
      avgMiniEl.textContent = avgBuy(miniOnly, 'MINI', '#b794f4');
    }
    if (pnl24El) {
      const cutoff24h  = Date.now() - 24 * 60 * 60 * 1000;
      const liveHist   = (state['LIVE']?.pnlHistory      || []);
      const miniHist   = (state['LIVE_MINI']?.pnlHistory || []);
      const trades24h  = [...liveHist, ...miniHist].filter(e => e.pnl != null && new Date(e.time).getTime() >= cutoff24h);
      const count24    = trades24h.length;
      if (count24 > 0) {
        const pnl24  = trades24h.reduce((s, e) => s + e.pnl, 0);
        const wins24 = trades24h.filter(e => e.status === 'WIN').length;
        const wr24   = (wins24 / count24 * 100).toFixed(0);
        const sign   = pnl24 >= 0 ? '+' : '';
        const color  = pnl24 >= 0 ? '#68d391' : '#fc8181';
        pnl24El.style.color = color;
        pnl24El.textContent = `24H: ${sign}$${pnl24.toFixed(2)} · ${wr24}% WR (${count24}tr)`;
      } else {
        pnl24El.textContent = '';
      }
    }
    renderLiveProjection();
  }
  // Build global cumulative PnL map from full pnlHistory (not the 50-entry activityLog slice)
  let _cumAcc = 0;
  const _cumByTime = {};
  for (const e of (state[key]?.pnlHistory || [])) {
    if (e.pnl != null) _cumAcc += e.pnl;
    _cumByTime[e.time] = parseFloat(_cumAcc.toFixed(2));
  }
  // Separate cumulative map for LIVE_MINI rows shown in LIVE's panel
  let _cumAccMini = 0;
  const _cumByTimeMini = {};
  if (key === 'LIVE') {
    for (const e of (state['LIVE_MINI']?.pnlHistory || [])) {
      if (e.pnl != null) _cumAccMini += e.pnl;
      _cumByTimeMini[e.time] = parseFloat(_cumAccMini.toFixed(2));
    }
  }

  const rows = resolved.map(e => {
    const t   = new Date(e.time);
    const ts  = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const dateLabel = t.toLocaleDateString(undefined, { month: 'short', day: 'numeric',
      ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
    const dir = e.direction === 'UP'
      ? '<span class="dir-up">&#x25B2; UP</span>'
      : '<span class="dir-down">&#x25BC; DOWN</span>';
    const entry   = e.entryPrice != null ? `${(e.entryPrice * 100).toFixed(0)}&#x00A2;` : '&#x2014;';
    const bet     = e.position   != null ? `$${e.position.toFixed(2)}` : '&#x2014;';
    const spike   = e.spike_pct  != null ? `+${e.spike_pct.toFixed(2)}%` : '&#x2014;';
    // Beat% = % change of underlying crypto price over the cycle (finalPrice vs refPrice/t0Open)
    let beatPct = '&#x2014;';
    if (e.finalPrice != null && e.refPrice != null && e.refPrice !== 0) {
      const bp       = (e.finalPrice - e.refPrice) / e.refPrice * 100;
      const beatSign  = bp >= 0 ? '+' : '';
      const beatColor = e.direction === 'UP' ? '#63b3ed' : '#f6ad55';
      beatPct = `<span style="color:${beatColor}">${beatSign}${bp.toFixed(3)}%</span>`;
    }
    const is15m = e.candle_size >= 150;
    const typeBadge = is15m
      ? '<span class="badge-15m">15MIN</span>'
      : '<span class="badge-5m">5MIN</span>';
    const cfgKeyR = 'R_' + (e.tradeId || e.time);
    _tradeConfigs[cfgKeyR] = e;
    let statusBadge, pnlStr;
    if (e.status === 'WIN') {
      statusBadge = '<span class="badge badge-win">WIN</span>';
      const pct = (e.pnl != null && e.position > 0) ? ` (${(e.pnl / e.position * 100).toFixed(1)}%)` : '';
      pnlStr = e.pnl != null
        ? `<span style="color:#68d391">+$${e.pnl.toFixed(2)}${pct}</span>`
        : `<span style="color:#718096">…</span>`;
    } else if (e.status === 'FAILED') {
      statusBadge = '<span class="badge" style="background:#4a3300;color:#f6ad55">FAILED</span>';
      pnlStr = '<span style="color:#718096">—</span>';
    } else if (e.status === 'EXPIRED') {
      statusBadge = '<span class="badge" style="background:#2d2d4a;color:#9b8ed4">EXPIRED</span>';
      pnlStr = '<span style="color:#718096">—</span>';
    } else if (e.status === 'RECOV') {
      const tN = e.manualSell ? ' SELL' : (e.recoverN != null ? ` T+${e.recoverN}` : '');
      const exitC = e.exitPrice != null ? ` exit ${(e.exitPrice*100).toFixed(0)}¢` : '';
      statusBadge = `<span class="badge" style="background:#0d2233;color:#63b3ed;border:1px solid #2b6cb0">↩RECOV${tN}</span>`;
      const pct = (e.pnl != null && e.position > 0) ? ` (${(e.pnl / e.position * 100).toFixed(1)}%)` : '';
      pnlStr = e.pnl != null
        ? (e.pnl >= 0
          ? `<span style="color:#68d391">+$${e.pnl.toFixed(2)}${pct}${exitC}</span>`
          : `<span style="color:#fc8181">-$${Math.abs(e.pnl).toFixed(2)}${pct}${exitC}</span>`)
        : '<span style="color:#718096">—</span>';
    } else {
      statusBadge = '<span class="badge badge-loss">LOSS</span>';
      const pct = (e.pnl != null && e.position > 0) ? ` (${(e.pnl / e.position * 100).toFixed(1)}%)` : '';
      pnlStr = e.pnl != null ? `<span style="color:#fc8181">-$${Math.abs(e.pnl).toFixed(2)}${pct}</span>` : '';
    }
    let idCell;
    if (!isKalshi && e.cycleStart && e.candle_size) {
      const url = polyUrlFE(e.crypto, e.cycleStart, e.candle_size);
      idCell = url
        ? `<a href="${url}" target="_blank" style="color:#4fd1c5;text-decoration:none;">&#x1F4CA; ${e.tradeId || '&#x2014;'}</a>`
        : (e.tradeId || '&#x2014;');
    } else {
      idCell = `&#x1F535; ${e.tradeId || '&#x2014;'}`;
    }
    const cxx = e.candle_size
      ? `<button onclick="openChartForTrade('${e.crypto}',${e.candle_size},${e.cycleStart},'${e.status}')" title="Open chart for ${e.crypto} C${e.candle_size}" style="background:none;border:none;color:#a0aec0;cursor:pointer;font-size:11px;padding:0;text-decoration:underline dotted;">C${e.candle_size}</button>`
      : '&#x2014;';
    const entryBadge = !e.isT1
      ? '<span style="color:#a0aec0;font-size:12px;font-weight:700;">T0</span>'
      : e.label === 'TC'
        ? '<span style="color:#b794f4;font-size:12px;font-weight:700;">TC</span>'
        : '<span style="color:#f6ad55;font-size:12px;font-weight:700;">T1</span>';
    const fokBadge = e.isFokRetry
      ? '<span style="background:#2d3748;color:#718096;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #4a5568;">FOK</span>'
      : '';
    const miniBadge = e._isMini
      ? '<span style="background:#2d1f4a;color:#b794f4;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #553c9a;">MINI</span>'
      : '';
    const runBal = e._isMini ? (_cumByTimeMini[e.time] ?? null) : (_cumByTime[e.time] ?? null);
    const runBalStr   = runBal != null ? (runBal >= 0 ? `+$${runBal.toFixed(2)}` : `-$${Math.abs(runBal).toFixed(2)}`) : '—';
    const runBalColor = runBal == null ? '#718096' : runBal > 0 ? '#68d391' : runBal < 0 ? '#fc8181' : '#e2e8f0';
    const bodyPctR  = e.body_ratio != null ? `${e.body_ratio.toFixed(1)}%` : '—';
    const minSpikeR = e.threshold  != null ? e.threshold.toFixed(2) + '%' : '—';
    let distPctR = '—';
    if (e.position > 0 && e.pnl != null) {
      const dp = e.pnl / e.position * 100;
      const dpSign  = dp >= 0 ? '+' : '';
      const dpColor = dp >= 0 ? '#68d391' : '#fc8181';
      distPctR = `<span style="color:${dpColor}">${dpSign}${dp.toFixed(1)}%</span>`;
    }
    const rowStyle = e._isMini ? ' style="background:rgba(120,80,200,0.22)"' : '';
    return `<tr${rowStyle}>
      <td>${ts}</td><td><strong>${e.crypto}</strong></td><td>${typeBadge}</td>
      <td><button onclick="showTradeConfig('${cfgKeyR}')" style="background:none;border:none;cursor:pointer;color:#90cdf4;font-size:11px;text-decoration:underline dotted;padding:0;font-weight:600;">Config</button></td><td>${cxx}</td>
      <td style="color:#718096;font-size:11px">${bodyPctR}</td>
      <td style="text-align:center;">${entryBadge}</td><td>${dir}</td>
      <td style="font-size:11px">${beatPct}</td>
      <td>${entry}</td><td>${bet}</td>
      <td style="color:#f6ad55">${spike}</td>
      <td>${idCell}</td><td>${fokBadge}${miniBadge}</td><td>${statusBadge}</td><td>${pnlStr}</td>
      <td style="font-size:11px">${distPctR}</td>
      <td style="color:${runBalColor};font-size:11px">${runBalStr}</td><td>${dateLabel}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<div class="table-scroll"><table>
    <thead><tr>
      <th>Time</th><th>Crypto</th><th>Type</th><th style="font-size:11px">Config</th><th>Cxx</th><th style="color:#718096;font-size:11px">Body%</th><th style="text-align:center;">Entry</th><th>Dir</th>
      <th style="font-size:11px">Beat%</th><th>Price</th><th>Bet</th><th>Spike</th><th>Market / ID</th><th></th><th>Status</th><th>P&amp;L</th><th style="font-size:11px">Dist%</th><th>Bal</th><th>Date</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderLiveProjection() {
  const projEl = document.getElementById('live-projection');
  if (!projEl) return;
  const clearedAt = state.LIVE?.tradeListClearedAt || null;
  if (!clearedAt) { projEl.style.display = 'none'; return; }
  const cutoff     = new Date(clearedAt).getTime();
  const now        = Date.now();
  const elapsedMs  = now - cutoff;
  const elapsedDay = elapsedMs / 86400000;
  if (elapsedDay < 0.05) { projEl.style.display = 'none'; return; }  // < ~1h of data
  // Trades since reset (LIVE + LIVE_MINI)
  const miniCutoff  = state.LIVE_MINI?.tradeListClearedAt ? new Date(state.LIVE_MINI.tradeListClearedAt).getTime() : 0;
  const liveTrades  = (state.LIVE?.pnlHistory      || []).filter(e => e.pnl != null && new Date(e.time).getTime() >= cutoff);
  const miniTrades  = (state.LIVE_MINI?.pnlHistory || []).filter(e => e.pnl != null && new Date(e.time).getTime() >= miniCutoff);
  const all         = [...liveTrades, ...miniTrades];
  if (!all.length) { projEl.style.display = 'none'; return; }
  const totalPnl  = all.reduce((s, e) => s + e.pnl, 0);
  const dailyRate = totalPnl / elapsedDay;
  const proj7     = dailyRate * 7;
  const proj30    = dailyRate * 30;
  const fmtP = v => (v >= 0 ? '+' : '') + '$' + Math.abs(v).toFixed(2);
  const col  = v => v >= 0 ? '#68d391' : '#fc8181';
  const el7  = document.getElementById('live-proj-7d');
  const el30 = document.getElementById('live-proj-30d');
  const elR  = document.getElementById('live-proj-rate');
  if (el7)  { el7.textContent  = `7d: ${fmtP(proj7)}`;  el7.style.color  = col(proj7);  }
  if (el30) { el30.textContent = `30d: ${fmtP(proj30)}`; el30.style.color = col(proj30); }
  if (elR) {
    const dStr = elapsedDay >= 1 ? elapsedDay.toFixed(1) + 'd' : Math.round(elapsedDay * 24) + 'h';
    elR.textContent = ` (${fmtP(dailyRate)}/d · ${dStr} · ${all.length}tr)`;
  }
  projEl.style.display = 'flex';
}

function renderLog(key, log) {
  const el = document.getElementById(`log-${key}`);
  if (!el) return;

  const visible = log.filter(e => e.status !== 'SKIP' && e.status !== 'OPEN');
  const fp = visible.map(e => `${e.tradeId ?? e.time}|${e.status}|${e.pnl ?? ''}`).join(',') || 'empty';
  if (el.dataset.lastFp === fp) return;
  el.dataset.lastFp = fp;

  if (!log.length) {
    el.innerHTML = '<div class="empty-log">No activity yet</div>';
    return;
  }

  if (!visible.length) {
    el.innerHTML = '<div class="empty-log">No resolved signals yet</div>';
    return;
  }

  const rows = [];

  for (const e of visible) {
    const t = new Date(e.time);

    // Local time HH:MM:SS
    const ts = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    // Local date for last column: "Feb 27" or "Feb 27, 2025" if different year
    const dateLabel = t.toLocaleDateString(undefined, { month: 'short', day: 'numeric',
      ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });

    const dir = e.direction === 'UP'
      ? '<span class="dir-up">▲ UP</span>'
      : '<span class="dir-down">▼ DOWN</span>';
    const entry    = e.entryPrice != null ? `${(e.entryPrice * 100).toFixed(0)}¢` : '—';
    const spikeStr = e.spike_pct  != null ? `${e.spike_pct.toFixed(2)}%` : '—';

    let statusBadge, pnlStr = '';
    switch (e.status) {
      case 'WIN':
        statusBadge = '<span class="badge badge-win">WIN</span>';
        pnlStr = e.pnl != null
          ? `<span style="color:#68d391">+$${e.pnl.toFixed(2)}</span>`
          : `<span style="color:#718096">…</span>`;
        break;
      case 'LOSS':
        statusBadge = '<span class="badge badge-loss">LOSS</span>';
        pnlStr = e.pnl != null ? `<span style="color:#fc8181">-$${Math.abs(e.pnl).toFixed(2)}</span>` : '';
        break;
      case 'OPEN':
        statusBadge = '<span class="badge badge-open">OPEN</span>';
        break;
      case 'SKIP':
        statusBadge = `<span class="badge badge-skip">${e.reason || 'SKIP'}</span>`;
        break;
      default:
        statusBadge = `<span class="badge badge-skip">${e.status}</span>`;
    }

    rows.push(`<tr>
      <td>${ts}</td>
      <td><strong>${e.crypto}</strong></td>
      <td>C${e.candle_size || '?'}</td>
      <td>${dir}</td>
      <td>${entry}</td>
      <td>${spikeStr}</td>
      <td>${statusBadge}</td>
      <td>${pnlStr}</td>
      <td>${dateLabel}</td>
    </tr>`);
  }

  const rowsHtml = rows.join('');

  el.innerHTML = `
    <div class="table-scroll"><table>
      <thead>
        <tr>
          <th>Time</th><th>Crypto</th><th>Candle</th><th>Dir</th>
          <th>Entry</th><th>Spike</th><th>Status</th><th>P&amp;L</th><th>Date</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>`;
}

// ── Live Active Config renderer ───────────────────────────────────────────────
function renderLiveActiveConfig(s) {
  const el = document.getElementById('live-active-config');
  if (!el) return;
  const CRYPTOS = ['BTC','ETH','SOL','XRP'];

  const line5m = CRYPTOS.map(cr => {
    const period = s[`strategy5m_${cr}`] || s.strategy5m || 'auto';
    const th = s[`threshold5m_${cr}`] != null ? (+s[`threshold5m_${cr}`]).toFixed(2)
             : s.threshold5m != null ? (+s.threshold5m).toFixed(2) : '—';
    return `<span class="lac-crypto"><span class="cr">${cr}</span> ${period} ${th}%</span>`;
  }).join('');

  const line15m = CRYPTOS.map(cr => {
    const period = s[`strategy15m_${cr}`] || s.strategy15m || 'auto';
    const th = s[`threshold15m_${cr}`] != null ? (+s[`threshold15m_${cr}`]).toFixed(2)
             : s.threshold15m != null ? (+s.threshold15m).toFixed(2) : '—';
    return `<span class="lac-crypto"><span class="cr">${cr}</span> ${period} ${th}%</span>`;
  }).join('');

  const mn5    = s.minPrice5m    != null ? Math.round(s.minPrice5m    * 100) : 5;
  const mx5    = s.maxPrice5m    != null ? Math.round(s.maxPrice5m    * 100) : 89;
  const mxt1_5  = s.maxPriceT1_5m  != null ? Math.round(s.maxPriceT1_5m  * 100) : null;
  const mxt1_st = s.maxPriceT1standalone != null ? Math.round(s.maxPriceT1standalone * 100) : null;
  const cap5   = s.maxTrade5m    || 150;
  const mn15    = s.minPrice15m    != null ? Math.round(s.minPrice15m    * 100) : 5;
  const mx15    = s.maxPrice15m    != null ? Math.round(s.maxPrice15m    * 100) : 89;
  const mxt1_15 = s.maxPriceT1_15m != null ? Math.round(s.maxPriceT1_15m * 100) : null;
  const cap15   = s.maxTrade15m    || 500;

  const t0On  = s.t0off !== true;
  const t1On  = s.t1Mode !== false;
  const t1StOn = s.t1standalone === true;
  const cbOn  = s.circuitBreakerEnabled !== false;
  const dlOn  = s.drawdownLimitEnabled  !== false;
  const fokOn = s.fokRetryEnabled       !== false;
  const dm5   = s.distMin5m  > 0 ? s.distMin5m  : null;
  const dm15  = s.distMin15m > 0 ? s.distMin15m : null;

  el.innerHTML = `
    <div class="lac-row"><span class="lac-tag">5m</span>${line5m}</div>
    <div class="lac-row"><span class="lac-tag">15m</span>${line15m}</div>
    <div class="lac-row">
      <span class="lac-tag">5m</span>
      <span class="lac-chip">min ${mn5}¢</span>
      <span class="lac-chip">max ${mx5}¢${mxt1_5 != null ? ' · TC ' + mxt1_5 + '¢' : ''}${mxt1_st != null ? ' · T1 ' + mxt1_st + '¢' : ''}</span>
      <span class="lac-chip">$${cap5} cap</span>
      &nbsp;
      <span class="lac-tag">15m</span>
      <span class="lac-chip">min ${mn15}¢</span>
      <span class="lac-chip">max ${mx15}¢${mxt1_15 != null ? ' · TC ' + mxt1_15 + '¢' : ''}${mxt1_st != null ? ' · T1 ' + mxt1_st + '¢' : ''}</span>
      <span class="lac-chip">$${cap15} cap</span>
    </div>
    <div class="lac-row">
      <span class="lac-chip ${t0On ? 'on' : 'off'}">${t0On ? 'T0' : 'T0 off'}</span>
      <span class="lac-chip ${(t1On || t1StOn) ? 'on' : 'off'}">${t1StOn && t1On ? 'T1+TC' : t1StOn ? 'T1' : t1On ? 'TC' : 'T1/TC off'}</span>
      <span class="lac-chip">MaxPos&nbsp;${s.maxPositions ?? 1}</span>
      <span class="lac-chip ${cbOn ? 'on' : 'off'}">CB ${cbOn ? s.circuitBreakerMins + 'min' : 'OFF'}</span>
      <span class="lac-chip ${dlOn ? 'on' : 'off'}">DRWL ${dlOn ? (s.drawdownLimitMaxLosses + 'L / ' + s.drawdownLimitWindowMins + 'min → ' + s.drawdownLimitPauseMins + 'min') : 'OFF'}</span>
      <span class="lac-chip ${fokOn ? 'on' : 'off'}">FOK ${fokOn ? ('÷' + s.fokRetryDivisor + ' ×' + s.fokRetryMax) : 'OFF'}</span>
      ${dm5  != null ? `<span class="lac-chip on">distMin 5m ${dm5}%</span>`  : ''}
      ${dm15 != null ? `<span class="lac-chip on">distMin 15m ${dm15}%</span>` : ''}
    </div>`;
}

// ── Settings History ──────────────────────────────────────────────────────────
let _settingsHistory = [];
let _shExpanded = false;

function toggleSettingsHistory() {
  _shExpanded = !_shExpanded;
  const listEl = document.getElementById('settings-history-list');
  const chevEl = document.getElementById('sh-chevron');
  if (listEl) listEl.style.display = _shExpanded ? 'block' : 'none';
  if (chevEl) chevEl.textContent = _shExpanded ? '▲' : '▼';
}

function renderSettingsHistory(history) {
  _settingsHistory = history || [];
  const countEl = document.getElementById('sh-count');
  if (countEl) countEl.textContent = `(${_settingsHistory.length})`;
  const listEl = document.getElementById('settings-history-list');
  if (!listEl) return;
  if (!_settingsHistory.length) {
    listEl.innerHTML = '<span style="color:#4a5568;font-size:11px;">No history yet — saved configs will appear here.</span>';
    return;
  }

  const chip = (txt, color='#718096', bg='#1a2035', border='#2d3748') =>
    `<span style="background:${bg};border:1px solid ${border};border-radius:3px;padding:1px 5px;font-size:10px;color:${color};white-space:nowrap;">${txt}</span>`;
  const on   = (txt) => chip(txt, '#68d391', '#1a3a2a', '#276749');
  const off  = (txt) => chip(txt, '#718096', '#1a2035', '#2d3748');
  const warn = (txt) => chip(txt, '#ed8936', '#2d1a00', '#7b3f00');
  const lbl  = (txt, w='28px') => `<span style="color:#4a5568;font-size:10px;font-weight:700;display:inline-block;min-width:${w};flex-shrink:0;">${txt}</span>`;
  const row  = (children) => `<div style="display:flex;gap:3px;align-items:center;flex-wrap:wrap;margin-top:3px;">${children}</div>`;

  // Per-crypto full row for one time interval
  // Each crypto shown as: [CRYPTO] [Cxx] [th%] [$cap]
  function cryptoRows(dur, snap) {
    const cryptos = ['BTC','ETH','SOL','XRP'];
    const globalCxx = snap[`strategy${dur}`] || '—';
    const globalTh  = snap[`threshold${dur}`];
    const globalCap = snap[`maxTrade${dur}`];
    const mn  = snap[`minPrice${dur}`]  != null ? Math.round(snap[`minPrice${dur}`]  * 100) : null;
    const mx  = snap[`maxPrice${dur}`]  != null ? Math.round(snap[`maxPrice${dur}`]  * 100) : null;
    const mxt   = snap[`maxPriceT1_${dur}`] != null ? Math.round(snap[`maxPriceT1_${dur}`] * 100) : null;
    const mxtSt = snap.maxPriceT1standalone != null ? Math.round(snap.maxPriceT1standalone * 100) : null;

    // Shared row: price range + TC max + T1 max + global cap
    const sharedRow = row(
      lbl(dur.toUpperCase(), '32px') +
      (mn != null && mx != null ? chip(mn + '¢ – ' + mx + '¢') : '') +
      (mxt   != null ? chip('TC ≤ ' + mxt   + '¢') : '') +
      (mxtSt != null ? chip('T1 ≤ ' + mxtSt + '¢') : '') +
      (globalCap != null ? chip('cap $' + globalCap) : '')
    );

    // Per-crypto rows (2 per line: BTC+ETH on row 1, SOL+XRP on row 2)
    const crCells = cryptos.map(cr => {
      const cxx = snap[`strategy${dur}_${cr}`] || globalCxx;
      const th  = snap[`threshold${dur}_${cr}`] ?? globalTh;
      const cap = snap[`maxTrade${dur}_${cr}`];
      const thStr  = th  != null ? th.toFixed(2)  + '%' : '—';
      const capStr = cap != null ? ' $' + cap : '';
      // Highlight if crypto-specific (differs from global)
      const cxxDiff = snap[`strategy${dur}_${cr}`] && snap[`strategy${dur}_${cr}`] !== globalCxx;
      const thDiff  = snap[`threshold${dur}_${cr}`] != null;
      const capDiff = cap != null;
      return `<span style="display:inline-flex;align-items:center;gap:2px;background:#111827;border:1px solid #2d3748;border-radius:4px;padding:2px 6px;">` +
        `<span style="color:#718096;font-size:9px;font-weight:700;">${cr}</span>` +
        `<span style="color:${cxxDiff?'#63b3ed':'#a0aec0'};font-size:10px;">${cxx}</span>` +
        `<span style="color:#4a5568;font-size:9px;">·</span>` +
        `<span style="color:${thDiff?'#f6e05e':'#a0aec0'};font-size:10px;">${thStr}</span>` +
        (capDiff ? `<span style="color:#4a5568;font-size:9px;">·</span><span style="color:#68d391;font-size:10px;">${capStr.trim()}</span>` : '') +
        `</span>`;
    });

    const crRow = row(lbl('', '0px') + crCells.join(''));
    return sharedRow + crRow;
  }

  listEl.innerHTML = _settingsHistory.map((snap, i) => {
    const dt    = new Date(snap.savedAt);
    const dtStr = dt.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' });

    // Options row
    const cbOn  = snap.circuitBreakerEnabled;
    const dlOn  = snap.drawdownLimitEnabled;
    const t1On  = snap.t1Mode;
    const t1StOn = snap.t1standalone === true;
    const nsfOn = snap.noSpikeFilter;
    const dm5v  = snap.distMin5m  > 0, dm15v = snap.distMin15m > 0;
    const rsk   = snap.riskPct != null ? (snap.riskPct * 100).toFixed(0) + '%' : null;
    const bpct  = snap.bodyPct  != null ? snap.bodyPct : null;

    const t0On  = snap.t0off !== true;
    const rowOpts = row(
      lbl('⚙') +
      (t0On ? on('T0') : off('T0 off')) +
      (t1StOn && t1On ? on('T1+TC') : t1StOn ? on('T1') : t1On ? on('TC') : off('T1/TC off')) +
      (cbOn  ? on('CB ' + snap.circuitBreakerMins + 'min') : off('CB off')) +
      (dlOn  ? on('DL ' + snap.drawdownLimitMaxLosses + 'L/' + snap.drawdownLimitWindowMins + 'm→' + snap.drawdownLimitPauseMins + 'm') : off('DL off')) +
      chip('MaxPos ' + (snap.maxPositions ?? 4)) +
      (dm5v  ? on('distMin5m '  + snap.distMin5m  + '%') : '') +
      (dm15v ? on('distMin15m ' + snap.distMin15m + '%') : '') +
      (bpct  != null ? chip('body ' + bpct + '%') : '') +
      (nsfOn ? warn('NO SPIKE FILTER') : '') +
      (rsk   ? chip('risk ' + rsk) : '')
    );

    // Locked thresholds
    const locks = Object.keys(snap.lockedThresholds || {}).filter(k => snap.lockedThresholds[k]);
    const rowLocks = locks.length
      ? row(lbl('🔒') + locks.map(k => warn(k.replace('threshold','th').replace(/_/g,' '))).join(''))
      : '';

    return `<div style="padding:7px 0;border-bottom:1px solid #1a2035;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:1px;">
        <div style="font-size:10px;color:#718096;">${dtStr}</div>
        <div style="display:flex;gap:4px;">
          <button onclick="restoreSettings(${i})" style="flex-shrink:0;background:#2d3748;color:#a0aec0;border:1px solid #4a5568;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;" title="Restore these settings">↺ Restore</button>
          <button onclick="deleteHistoryEntry(${i})" style="flex-shrink:0;background:#3d1515;color:#fc8181;border:1px solid #7c2020;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;" title="Delete this entry">✕</button>
        </div>
      </div>
      ${cryptoRows('5m', snap)}
      ${cryptoRows('15m', snap)}
      ${rowOpts}${rowLocks}
    </div>`;
  }).join('');
}

async function restoreSettings(i, _authed = false) {
  if (!_authed) { requirePassword(() => restoreSettings(i, true), 'Restore settings'); return; }
  const snap = _settingsHistory[i];
  if (!snap) return;
  // Build payload from snapshot (saveHistory:true will snapshot the current state before applying)
  const payload = { stratKey: 'LIVE', saveHistory: true };
  const fields = ['strategy5m','strategy15m','threshold5m','threshold15m',
    'minPrice5m','maxPrice5m','maxTrade5m','minPrice15m','maxPrice15m','maxTrade15m',
    'maxPriceT1_5m','maxPriceT1_15m','maxPriceT1standalone','t0off','t1Mode','t1standalone','circuitBreakerEnabled','circuitBreakerMins',
    'drawdownLimitEnabled','drawdownLimitMaxLosses','drawdownLimitWindowMins','drawdownLimitPauseMins',
    'maxPositions','distMin5m','distMin15m','riskPct','bodyPct','noSpikeFilter','lockedThresholds',
    'threshold5m_BTC','threshold5m_ETH','threshold5m_SOL','threshold5m_XRP',
    'threshold15m_BTC','threshold15m_ETH','threshold15m_SOL','threshold15m_XRP',
    'strategy5m_BTC','strategy5m_ETH','strategy5m_SOL','strategy5m_XRP',
    'strategy15m_BTC','strategy15m_ETH','strategy15m_SOL','strategy15m_XRP',
    'maxTrade5m_BTC','maxTrade5m_ETH','maxTrade5m_SOL','maxTrade5m_XRP',
    'maxTrade15m_BTC','maxTrade15m_ETH','maxTrade15m_SOL','maxTrade15m_XRP'];
  for (const f of fields) if (snap[f] !== undefined) payload[f] = snap[f];
  const r = await apiFetch('/t1000/config', 'POST', payload);
  if (r && !r.error) {
    await pollState();
  } else {
    alert('Restore error: ' + (r?.error || 'unknown'));
  }
}

async function deleteHistoryEntry(i, _authed = false) {
  if (!_authed) { requirePassword(() => deleteHistoryEntry(i, true), 'Delete history entry'); return; }
  const r = await apiFetch('/t1000/config', 'POST', { stratKey: 'LIVE', deleteHistoryIndex: i });
  if (r && !r.error) await pollState();
  else alert('Delete error: ' + (r?.error || 'unknown'));
}

// ── Poll loop ─────────────────────────────────────────────────────────────────
async function pollState() {
  const data = await apiFetch('/t1000/state');
  if (data) renderState(data);
}

// ── Init ──────────────────────────────────────────────────────────────────────
// Mark SETUP dirty on any user edit so polls don't overwrite unsaved values
document.getElementById('panel-SETUP').addEventListener('input',  () => { setupDirty = true; });
document.getElementById('panel-SETUP').addEventListener('change', () => { setupDirty = true; });
// Mark MINI dirty on any user edit so polls don't overwrite unsaved values
document.getElementById('mini-config-row').addEventListener('focusin', () => { miniDirty = true; });
document.getElementById('mini-config-row').addEventListener('input',   () => { miniDirty = true; });
document.getElementById('mini-config-row').addEventListener('change',  () => { miniDirty = true; });

// When simulator "Use in LIVE" fires, reset dirty flag and immediately re-poll
window.addEventListener('storage', e => {
  if (e.key === 'polychamp_live_applied') { setupDirty = false; pollState(); }
});

switchSection('LIVE');
pollState();
setInterval(pollState, 4000);
pollLivePrices();
setInterval(pollLivePrices, 2000);
setInterval(updatePositionGauges, 1000);

// ── Chart ─────────────────────────────────────────────────────────────────────
let chartInstance    = null;
let chartSeries      = null;
let chartCandleSize  = 60;
let chartThreshold   = 0.24;
let chartActiveCrypto = 'BTC';
let chartResizeObs   = null;
let chartHighlightTrade = null; // { spikeTime (unix sec), status ('WIN'|'LOSS') } — set when opened from a trade row
let chartViewMode = 'all';      // 'all' = show all spike markers; 'trade' = show only this trade's marker

function openChartLive(duration) {
  const cxx = duration === '5m'
    ? document.getElementById('live-strategy5m').value
    : document.getElementById('live-strategy15m').value;
  chartCandleSize = parseInt(cxx.replace('C', ''), 10);
  const thrEl = duration === '5m'
    ? document.getElementById('live-thresh5m')
    : document.getElementById('live-thresh15m');
  chartThreshold = thrEl ? (parseFloat(thrEl.value) || 0.20) : 0.20;

  chartActiveCrypto = 'BTC';
  document.querySelectorAll('.chart-crypto-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.crypto === 'BTC');
  });
  chartHighlightTrade = null;
  chartViewMode = 'all';
  updateChartViewToggle();
  document.getElementById('chartOverlay').classList.add('open');
  loadChart(chartCandleSize, chartActiveCrypto);
}

function openChart(candleSize) {
  // Determine candle size and threshold
  chartCandleSize = candleSize;
  const thr = document.getElementById(`thresh-C${candleSize}`);
  chartThreshold = thr ? (parseFloat(thr.value) || 0.24) : 0.24;

  // Reset crypto selector to BTC
  chartActiveCrypto = 'BTC';
  document.querySelectorAll('.chart-crypto-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.crypto === 'BTC');
  });

  chartHighlightTrade = null;
  chartViewMode = 'all';
  updateChartViewToggle();
  document.getElementById('chartOverlay').classList.add('open');
  loadChart(chartCandleSize, chartActiveCrypto);
}

// Open chart pre-selected to the crypto and candle size from a specific trade.
// cycleStartMs: trade's cycleStart in milliseconds (maps directly to chart candle time).
// status: 'WIN' | 'LOSS'
function openChartForTrade(crypto, candleSize, cycleStartMs, status) {
  chartCandleSize   = candleSize;
  chartActiveCrypto = crypto;
  const thr = document.getElementById(`thresh-C${candleSize}`);
  chartThreshold = thr ? (parseFloat(thr.value) || 0.24) : 0.24;
  // Snap to 5m (CXX<150) or 15m (CXX>=150) cycle boundary — matches server-side cycle-aligned bucketing
  const cycleStartSec = Math.round(cycleStartMs / 1000);
  const _cycleSecs = candleSize >= 150 ? 900 : 300;
  chartHighlightTrade = { spikeTime: Math.floor(cycleStartSec / _cycleSecs) * _cycleSecs, status };
  chartViewMode = 'trade';
  document.querySelectorAll('.chart-crypto-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.crypto === crypto);
  });
  updateChartViewToggle();
  document.getElementById('chartOverlay').classList.add('open');
  loadChart(candleSize, crypto);
}

function updateChartViewToggle() {
  const allBtn   = document.getElementById('chart-mode-all-btn');
  const tradeBtn = document.getElementById('chart-mode-trade-btn');
  if (!allBtn || !tradeBtn) return;
  allBtn.classList.toggle('active', chartViewMode === 'all');
  tradeBtn.classList.toggle('active', chartViewMode === 'trade');
  if (chartHighlightTrade) {
    tradeBtn.disabled = false;
    tradeBtn.style.opacity = '1';
    tradeBtn.style.cursor  = 'pointer';
  } else {
    tradeBtn.disabled = true;
    tradeBtn.style.opacity = '0.4';
    tradeBtn.style.cursor  = 'not-allowed';
  }
}

function setChartViewMode(mode) {
  if (mode === 'trade' && !chartHighlightTrade) return;
  chartViewMode = mode;
  updateChartViewToggle();
  loadChart(chartCandleSize, chartActiveCrypto);
}

function closeChart() {
  document.getElementById('chartOverlay').classList.remove('open');
  destroyChart();
}

// ── Trade Config popup ─────────────────────────────────────────────────────────
const _tradeConfigs = {};

function showTradeConfig(key) {
  const c = _tradeConfigs[key];
  if (!c) return;
  const is15m   = (parseInt(c.candle_size) || 0) >= 150;
  const isT1    = c.isT1 || (c.trade_id || '').includes('_T1_') || (c.trade_id || '').endsWith('_T1');
  const isTC    = c.label === 'TC';
  const isFok   = c.isFokRetry || (c.trade_id || c.tradeId || '').endsWith('_FOKR');
  const isMini  = c._isMini || c.strategy === 'LIVE_MINI' || (c.trade_id || c.tradeId || '').includes('_MINI_');
  const entry   = !isT1 ? 'T+0' : isTC ? 'TC (cumulative)' : 'T+1';
  const dir     = c.direction === 'UP' ? '↗ UP' : '↘ DOWN';
  const tid     = c.tradeId || c.trade_id || '—';
  const ep      = c.entryPrice ?? c.entry_price;
  const pos     = c.position   ?? c.position_usd;
  const rows = [
    ['Period · Strategy', `C${c.candle_size || '?'} · ${is15m ? '15m · T369' : '5m · T123'}`],
    ['Direction',         dir],
    ['Entry type',        entry],
    ['Spike detected',    c.spike_pct  != null ? `+${parseFloat(c.spike_pct).toFixed(2)}%`           : '—'],
    ['Min spike (threshold)', c.threshold != null ? `${parseFloat(c.threshold).toFixed(2)}%`          : '—'],
    ['Body',              c.body_ratio != null ? `${parseFloat(c.body_ratio).toFixed(1)}%`             : '—'],
    ['Entry price',       ep           != null ? `${(parseFloat(ep) * 100).toFixed(0)}¢`               : '—'],
    ['Bet',               pos          != null ? `$${parseFloat(pos).toFixed(2)}`                       : '—'],
    ...(isFok  ? [['FOK Retry', 'Yes']]           : []),
    ...(isMini ? [['MINI',      'Yes (1/10 risk)']] : []),
    ['Trade ID', `<span style="font-family:monospace;font-size:11px;word-break:break-all;">${tid}</span>`],
  ];
  document.getElementById('tradeConfigTitle').textContent =
    `Config — ${c.crypto || ''} ${c.candle_size ? 'C'+c.candle_size : ''} (${c.direction || ''})`;
  document.getElementById('tradeConfigBody').innerHTML = rows.map(([k, v]) =>
    `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:6px 0;border-bottom:1px solid #2d3748;">
      <span style="color:#718096;font-size:12px;flex-shrink:0;">${k}</span>
      <span style="color:#e2e8f0;font-size:12px;font-weight:600;text-align:right;">${v}</span>
    </div>`
  ).join('');
  document.getElementById('tradeConfigOverlay').style.display = 'flex';
}

function closeTradeConfig() {
  document.getElementById('tradeConfigOverlay').style.display = 'none';
}

function chartOverlayClick(e) {
  if (e.target === document.getElementById('chartOverlay')) closeChart();
}

function switchChartCrypto(crypto) {
  chartActiveCrypto = crypto;
  document.querySelectorAll('.chart-crypto-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.crypto === crypto);
  });
  loadChart(chartCandleSize, crypto);
}

function destroyChart() {
  if (chartResizeObs) { chartResizeObs.disconnect(); chartResizeObs = null; }
  if (chartInstance)  { chartInstance.remove(); chartInstance = null; chartSeries = null; }
}

async function loadChart(candleSize, crypto) {
  const container = document.getElementById('chartContainer');
  container.innerHTML = '<div class="chart-loading">Loading&hellip;</div>';

  destroyChart();

  document.getElementById('chartModalTitle').textContent = (chartViewMode === 'trade' && chartHighlightTrade)
    ? `C${candleSize} — ${crypto}  [${chartHighlightTrade.status}]`
    : `C${candleSize} — ${crypto}  (spike threshold: ${chartThreshold}%)`;

  const data = await apiFetch(`/t1000/chart-data?candle=${candleSize}&crypto=${crypto}&limit=500`);

  if (!data || !data.candles || data.candles.length === 0) {
    container.innerHTML = '<div class="chart-loading">No data yet — candles appear after the first complete 5-min cycle</div>';
    return;
  }

  if (typeof LightweightCharts === 'undefined') {
    container.innerHTML = '<div class="chart-loading">Chart library not loaded</div>';
    return;
  }

  container.innerHTML = '';

  chartInstance = LightweightCharts.createChart(container, {
    width  : container.clientWidth,
    height : 420,
    layout : { background: { color: '#1a202c' }, textColor: '#a0aec0' },
    grid   : { vertLines: { color: '#2d3748' }, horzLines: { color: '#2d3748' } },
    timeScale: {
      borderColor: '#4a5568',
      timeVisible: true,
      secondsVisible: true,
      tickMarkFormatter: (t) => {
        const d = new Date(t * 1000);
        return d.toISOString().slice(11, 16); // HH:MM
      },
    },
    rightPriceScale: { borderColor: '#4a5568' },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });

  chartSeries = chartInstance.addCandlestickSeries({
    upColor         : '#68d391',
    downColor       : '#fc8181',
    borderUpColor   : '#68d391',
    borderDownColor : '#fc8181',
    wickUpColor     : '#68d391',
    wickDownColor   : '#fc8181',
  });

  chartSeries.setData(data.candles);

  // Spike markers + zoom — depends on view mode
  if (chartViewMode === 'trade' && chartHighlightTrade) {
    const ht = chartHighlightTrade;
    const spCandle = data.candles.find(c => c.time === ht.spikeTime);
    if (spCandle) {
      chartSeries.setMarkers([{
        time     : ht.spikeTime,
        position : spCandle.spike_pct >= 0 ? 'belowBar' : 'aboveBar',
        color    : ht.status === 'WIN' ? '#68d391' : '#fc8181',
        shape    : 'circle',
        text     : `${ht.status}  ${spCandle.spike_pct >= 0 ? '+' : ''}${spCandle.spike_pct.toFixed(2)}%`,
      }]);
    }
    // Zoom to ~50 candles centered on the spike candle (25 on each side)
    const halfWindow = 25 * candleSize;
    chartInstance.timeScale().setVisibleRange({
      from : ht.spikeTime - halfWindow,
      to   : ht.spikeTime + halfWindow,
    });
  } else {
    const markers = data.candles
      .filter(c => Math.abs(c.spike_pct) >= chartThreshold)
      .map(c => ({
        time     : c.time,
        position : c.spike_pct >= 0 ? 'belowBar' : 'aboveBar',
        color    : c.spike_pct >= 0 ? '#f6e05e' : '#f6ad55',
        shape    : c.spike_pct >= 0 ? 'arrowUp' : 'arrowDown',
        text     : `${c.spike_pct >= 0 ? '+' : ''}${c.spike_pct.toFixed(2)}%`,
      }));
    if (markers.length) chartSeries.setMarkers(markers);
    chartInstance.timeScale().fitContent();
  }

  // Responsive resize
  chartResizeObs = new ResizeObserver(() => {
    if (chartInstance) chartInstance.applyOptions({ width: container.clientWidth });
  });
  chartResizeObs.observe(container);

  // OHLC hover tooltip
  const ohlcTip = document.createElement('div');
  ohlcTip.id = 'ohlcTooltip';
  ohlcTip.style.cssText = 'position:absolute;top:8px;left:8px;padding:5px 10px;background:rgba(26,32,44,0.88);border:1px solid #4a5568;border-radius:4px;font-size:11px;color:#e2e8f0;pointer-events:none;z-index:10;white-space:nowrap;display:none;';
  container.appendChild(ohlcTip);

  chartInstance.subscribeCrosshairMove(function(param) {
    if (!param.point || !param.time) { ohlcTip.style.display = 'none'; return; }
    const bar = param.seriesData && param.seriesData.get(chartSeries);
    if (!bar) { ohlcTip.style.display = 'none'; return; }
    const d     = new Date(param.time * 1000);
    const hh    = String(d.getUTCHours()).padStart(2,'0');
    const mm    = String(d.getUTCMinutes()).padStart(2,'0');
    const timeStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${hh}:${mm} UTC`;
    const c     = bar.close, o = bar.open, h = bar.high, l = bar.low;
    const clr   = c >= o ? '#68d391' : '#fc8181';
    const spikePct  = o > 0 ? (c - o) / o * 100 : null;
    const candlePct = o > 0 ? (h - l) / o * 100 : null;
    const bodyPct   = (h - l) > 0 ? Math.abs(c - o) / (h - l) * 100 : null;
    const bodyClr   = bodyPct != null ? (bodyPct >= 75 ? '#68d391' : bodyPct >= 50 ? '#f6ad55' : '#fc8181') : '#a0aec0';
    const spStr = spikePct != null
      ? ` &nbsp;<span style="color:#a0aec0">Spike: </span><span style="color:#f6ad55">${(spikePct >= 0 ? '+' : '') + spikePct.toFixed(2) + '%'}</span>` +
        ` &nbsp;<span style="color:#a0aec0">Candle: </span><span style="color:#f6ad55">${candlePct.toFixed(2) + '%'}</span>` +
        ` &nbsp;<span style="color:#a0aec0">Body: </span><span style="color:${bodyClr};font-weight:600">${bodyPct != null ? bodyPct.toFixed(0) + '%' : '—'}</span>`
      : '';
    ohlcTip.innerHTML =
      `<span style="color:#a0aec0">${timeStr}</span> &nbsp;` +
      `O <b>${o.toFixed(2)}</b> &nbsp;` +
      `H <b style="color:#68d391">${h.toFixed(2)}</b> &nbsp;` +
      `L <b style="color:#fc8181">${l.toFixed(2)}</b> &nbsp;` +
      `C <b style="color:${clr}">${c.toFixed(2)}</b>` +
      spStr;
    ohlcTip.style.display = 'block';
  });
}

// ── PnL Chart ─────────────────────────────────────────────────────────────────
let pnlChartInstance = null;
let pnlChartResizeObs = null;

// ── All Trades (DB-backed, paginated) ──────────────────────────────────────────

let allTradesCurrentPage = 1;
const ALL_TRADES_LIMIT   = 50;

function allTradesPage(delta) {
  loadAllTrades(allTradesCurrentPage + delta);
}

async function loadAllTrades(page) {
  page = page || allTradesCurrentPage;
  const body     = document.getElementById('all-trades-body');
  const prevBtn  = document.getElementById('all-trades-prev');
  const nextBtn  = document.getElementById('all-trades-next');
  const pageInfo = document.getElementById('all-trades-page-info');
  const totalEl  = document.getElementById('all-trades-total');
  if (!body) return;

  body.innerHTML = '<div class="empty-log" style="color:#718096;">Loading…</div>';
  try {
    const hideFailed = document.getElementById('all-trades-hide-failed')?.checked ? '&hideFailed=1' : '';
    const url  = `/api/t1000/live-trades?strategy=LIVE,LIVE_MINI&page=${page}&limit=${ALL_TRADES_LIMIT}${hideFailed}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    allTradesCurrentPage = data.page;
    totalEl.textContent  = `(${data.total} total)`;
    pageInfo.textContent = `Page ${data.page} / ${data.pages || 1}`;
    prevBtn.disabled = data.page <= 1;
    nextBtn.disabled = data.page >= data.pages;

    if (!data.trades.length) {
      body.innerHTML = '<div class="empty-log">No trades in database yet. Trades are written on next save.</div>';
      return;
    }

    const rows = data.trades.map(e => {
      const t   = new Date(e.trade_time);
      const ts  = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const dateLabel = t.toLocaleDateString(undefined, { month: 'short', day: 'numeric',
        ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
      const dir = e.direction === 'UP'
        ? '<span class="dir-up">&#x25B2; UP</span>'
        : '<span class="dir-down">&#x25BC; DOWN</span>';
      const fillP   = e.entry_price   != null ? parseFloat(e.entry_price)   : null;
      const sigP    = e.signal_price  != null ? parseFloat(e.signal_price)  : null;
      const limP    = e.order_limit_price != null ? parseFloat(e.order_limit_price) : null;
      const slipC   = (fillP != null && sigP != null) ? Math.round((fillP - sigP) * 100) : null;
      let entry;
      if (fillP != null) {
        const fillStr = `${Math.round(fillP * 100)}&#x00A2;`;
        if (sigP != null && slipC !== 0) {
          const sigStr  = `${Math.round(sigP * 100)}&#x00A2;`;
          const slipCol = slipC > 0 ? '#fc8181' : '#68d391';
          const slipTip = limP != null ? ` title="Signal: ${Math.round(sigP*100)}¢ → Limit: ${Math.round(limP*100)}¢ → Fill: ${Math.round(fillP*100)}¢"` : '';
          const slipBadge = `<span style="color:${slipCol};font-size:9px;margin-left:2px">${slipC > 0 ? '+' : ''}${slipC}¢</span>`;
          entry = `<span${slipTip}>${sigStr}&#x2192;${fillStr}${slipBadge}</span>`;
        } else {
          entry = fillStr;
        }
      } else {
        entry = '&#x2014;';
      }
      const bet     = e.position_usd != null ? `$${parseFloat(e.position_usd).toFixed(2)}` : '&#x2014;';
      const spike   = e.spike_pct    != null ? `+${parseFloat(e.spike_pct).toFixed(2)}%` : '&#x2014;';
      const beatPct = e.spike_pct    != null ? `+${(parseFloat(e.spike_pct) * 100).toFixed(1)}%` : '&#x2014;';
      const is15m = parseInt(e.candle_size) >= 150;
      const typeBadge = is15m ? '<span class="badge-15m">15MIN</span>' : '<span class="badge-5m">5MIN</span>';
      const cfgKeyA = 'D_' + (e.trade_id || e.trade_time);
      _tradeConfigs[cfgKeyA] = e;

      let statusBadge, pnlStr;
      const pnl = e.pnl_usd != null ? parseFloat(e.pnl_usd) : null;
      const pos  = e.position_usd != null ? parseFloat(e.position_usd) : 0;
      if (e.status === 'WIN') {
        statusBadge = '<span class="badge badge-win">WIN</span>';
        const pct = (pnl != null && pos > 0) ? ` (${(pnl / pos * 100).toFixed(1)}%)` : '';
        pnlStr = pnl != null
          ? `<span style="color:#68d391">+$${pnl.toFixed(2)}${pct}</span>`
          : `<span style="color:#718096">…</span>`;
      } else if (e.status === 'LOSS') {
        statusBadge = '<span class="badge badge-loss">LOSS</span>';
        const pct = (pnl != null && pos > 0) ? ` (${(Math.abs(pnl) / pos * 100).toFixed(1)}%)` : '';
        pnlStr = pnl != null ? `<span style="color:#fc8181">-$${Math.abs(pnl).toFixed(2)}${pct}</span>` : '';
      } else if (e.status === 'FAILED') {
        statusBadge = '<span class="badge" style="background:#4a3300;color:#f6ad55">FAILED</span>';
        pnlStr = '<span style="color:#718096">—</span>';
      } else if (e.status === 'OPEN') {
        statusBadge = '<span class="badge" style="background:#1a3a38;color:#4fd1c5">OPEN</span>';
        pnlStr = '<span style="color:#718096">—</span>';
      } else {
        statusBadge = `<span class="badge" style="background:#2d2d4a;color:#9b8ed4">${e.status}</span>`;
        pnlStr = '<span style="color:#718096">—</span>';
      }

      let idCell;
      const cycleStartMs = e.cycle_start ? parseInt(e.cycle_start) : null;
      if (cycleStartMs && e.candle_size) {
        const url = polyUrlFE(e.crypto, cycleStartMs, parseInt(e.candle_size));
        idCell = url
          ? `<a href="${url}" target="_blank" style="color:#4fd1c5;text-decoration:none;">&#x1F4CA; ${e.trade_id || '&#x2014;'}</a>`
          : (e.trade_id || '&#x2014;');
      } else {
        idCell = e.trade_id || '&#x2014;';
      }

      const cxxAll = e.candle_size
        ? `<button onclick="openChartForTrade('${e.crypto}',${parseInt(e.candle_size)},${e.cycle_start ? parseInt(e.cycle_start) : 0},'${e.status}')" title="Open chart for ${e.crypto} C${e.candle_size}" style="background:none;border:none;color:#a0aec0;cursor:pointer;font-size:11px;padding:0;text-decoration:underline dotted;">C${e.candle_size}</button>`
        : '&#x2014;';
      const fokBadge = e.trade_id && e.trade_id.endsWith('_FOKR')
        ? '<span style="background:#2d3748;color:#718096;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #4a5568;">FOK</span>'
        : '';
      const methodAll = e.trade_id && e.trade_id.includes('_T1') ? 'T1' : 'T0';
      const methodBadgeAll = methodAll === 'T1'
        ? '<span style="background:#1a2d40;color:#63b3ed;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #2a4a6a;">T1</span>'
        : '<span style="background:#1a2820;color:#68d391;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #2a4a38;">T0</span>';
      const miniBadgeAll = e.strategy === 'LIVE_MINI'
        ? '<span style="background:#2d1f4a;color:#b794f4;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #553c9a;">MINI</span>'
        : '';
      const runBal = e.running_pnl != null ? parseFloat(e.running_pnl) : null;
      const runBalStr   = runBal != null ? (runBal >= 0 ? `+$${runBal.toFixed(2)}` : `-$${Math.abs(runBal).toFixed(2)}`) : '—';
      const runBalColor = runBal == null ? '#718096' : runBal > 0 ? '#68d391' : runBal < 0 ? '#fc8181' : '#e2e8f0';
      const bodyPctAll  = e.body_ratio != null ? `${parseFloat(e.body_ratio).toFixed(1)}%` : '—';
      const minSpikeAll = e.threshold  != null ? parseFloat(e.threshold).toFixed(2) + '%' : '—';
      let distPctAll = '—';
      if (pos > 0 && pnl != null) {
        const dpA = pnl / pos * 100;
        const dpASign  = dpA >= 0 ? '+' : '';
        const dpAColor = dpA >= 0 ? '#68d391' : '#fc8181';
        distPctAll = `<span style="color:${dpAColor}">${dpASign}${dpA.toFixed(1)}%</span>`;
      }
      const rowStyleAll = e.strategy === 'LIVE_MINI' ? ' style="background:rgba(120,80,200,0.22)"' : '';
      return `<tr${rowStyleAll}>
        <td>${ts}</td><td><strong>${e.crypto}</strong></td><td>${typeBadge}</td>
        <td><button onclick="showTradeConfig('${cfgKeyA}')" style="background:none;border:none;cursor:pointer;color:#90cdf4;font-size:11px;text-decoration:underline dotted;padding:0;font-weight:600;">Config</button></td><td>${cxxAll}</td>
        <td style="color:#718096;font-size:11px">${bodyPctAll}</td>
        <td>${dir}</td><td>${entry}</td><td>${bet}</td>
        <td style="color:#f6ad55">${spike}</td>
        <td style="color:#e8a84a;font-size:11px">${beatPct}</td>
        <td style="color:#ed8936;font-size:11px">${minSpikeAll}</td>
        <td>${idCell}</td><td>${methodBadgeAll}${fokBadge}${miniBadgeAll}</td><td>${statusBadge}</td><td>${pnlStr}</td>
        <td style="font-size:11px">${distPctAll}</td>
        <td style="color:${runBalColor};font-size:11px">${runBalStr}</td><td>${dateLabel}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `<div class="table-scroll"><table>
      <thead><tr>
        <th>Time</th><th>Crypto</th><th>Type</th><th style="font-size:11px">Config</th><th>Cxx</th><th style="color:#718096;font-size:11px">Body%</th><th>Dir</th>
        <th>Entry</th><th>Bet</th><th>Spike</th><th style="font-size:11px">Beat%</th><th style="font-size:11px;color:#ed8936">MinSpike</th><th>Market / ID</th><th style="font-size:11px">Method</th><th>Status</th><th>P&amp;L</th><th style="font-size:11px">Dist%</th><th>Bal</th><th>Date</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-log" style="color:#fc8181;">Error: ${err.message}</div>`;
    console.error('[all-trades] load error', err);
  }
}

// ── All Trades — Kalshi variant ───────────────────────────────────────────────
let kalshiAllTradesCurrentPage = 1;

function kalshiAllTradesPage(delta) {
  loadAllTradesKalshi(kalshiAllTradesCurrentPage + delta);
}

async function loadAllTradesKalshi(page) {
  page = page || kalshiAllTradesCurrentPage;
  const body     = document.getElementById('kalshi-all-trades-body');
  const prevBtn  = document.getElementById('kalshi-all-trades-prev');
  const nextBtn  = document.getElementById('kalshi-all-trades-next');
  const pageInfo = document.getElementById('kalshi-all-trades-page-info');
  const totalEl  = document.getElementById('kalshi-all-trades-total');
  if (!body) return;

  body.innerHTML = '<div class="empty-log" style="color:#718096;">Loading…</div>';
  try {
    const url  = `/api/t1000/live-trades?strategy=LIVE_KALSHI&page=${page}&limit=${ALL_TRADES_LIMIT}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    kalshiAllTradesCurrentPage = data.page;
    if (totalEl)  totalEl.textContent  = `(${data.total} total)`;
    if (pageInfo) pageInfo.textContent = `Page ${data.page} / ${data.pages || 1}`;
    if (prevBtn)  prevBtn.disabled = data.page <= 1;
    if (nextBtn)  nextBtn.disabled = data.page >= data.pages;

    if (!data.trades.length) {
      body.innerHTML = '<div class="empty-log">No Kalshi trades in database yet.</div>';
      return;
    }

    const rows = data.trades.map(e => {
      const t   = new Date(e.trade_time);
      const ts  = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const dateLabel = t.toLocaleDateString(undefined, { month: 'short', day: 'numeric',
        ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
      const dir = e.direction === 'UP'
        ? '<span class="dir-up">&#x25B2; UP</span>'
        : '<span class="dir-down">&#x25BC; DOWN</span>';
      const entry = e.entry_price  != null ? `${(parseFloat(e.entry_price) * 100).toFixed(0)}&#x00A2;` : '&#x2014;';
      const bet   = e.position_usd != null ? `$${parseFloat(e.position_usd).toFixed(2)}` : '&#x2014;';
      const spike = e.spike_pct    != null ? `+${parseFloat(e.spike_pct).toFixed(2)}%`   : '&#x2014;';
      const is15m = parseInt(e.candle_size) >= 150;
      const typeBadge = is15m ? '<span class="badge-15m">15MIN</span>' : '<span class="badge-5m">5MIN</span>';
      const cfgKeyK = 'K_' + (e.trade_id || e.trade_time);
      _tradeConfigs[cfgKeyK] = e;

      let statusBadge, pnlStr;
      const pnl = e.pnl_usd      != null ? parseFloat(e.pnl_usd)      : null;
      const pos = e.position_usd != null ? parseFloat(e.position_usd) : 0;
      if (e.status === 'WIN') {
        statusBadge = '<span class="badge badge-win">WIN</span>';
        const pct = (pnl != null && pos > 0) ? ` (${(pnl / pos * 100).toFixed(1)}%)` : '';
        pnlStr = pnl != null ? `<span style="color:#68d391">+$${pnl.toFixed(2)}${pct}</span>` : '<span style="color:#718096">…</span>';
      } else if (e.status === 'LOSS') {
        statusBadge = '<span class="badge badge-loss">LOSS</span>';
        const pct = (pnl != null && pos > 0) ? ` (${(Math.abs(pnl) / pos * 100).toFixed(1)}%)` : '';
        pnlStr = pnl != null ? `<span style="color:#fc8181">-$${Math.abs(pnl).toFixed(2)}${pct}</span>` : '';
      } else if (e.status === 'FAILED') {
        statusBadge = '<span class="badge" style="background:#4a3300;color:#f6ad55">FAILED</span>';
        pnlStr = '<span style="color:#718096">—</span>';
      } else if (e.status === 'OPEN') {
        statusBadge = '<span class="badge" style="background:#1a3a38;color:#4fd1c5">OPEN</span>';
        pnlStr = '<span style="color:#718096">—</span>';
      } else {
        statusBadge = `<span class="badge" style="background:#2d2d4a;color:#9b8ed4">${e.status}</span>`;
        pnlStr = '<span style="color:#718096">—</span>';
      }

      const cxxAll = e.candle_size
        ? `<span style="color:#a0aec0;font-size:11px;">C${e.candle_size}</span>`
        : '&#x2014;';

      const bodyPctK = e.body_ratio != null ? `${parseFloat(e.body_ratio).toFixed(1)}%` : '—';
      return `<tr>
        <td>${ts}</td><td><strong>${e.crypto}</strong></td><td>${typeBadge}</td>
        <td><button onclick="showTradeConfig('${cfgKeyK}')" style="background:none;border:none;cursor:pointer;color:#90cdf4;font-size:11px;text-decoration:underline dotted;padding:0;font-weight:600;">Config</button></td><td>${cxxAll}</td>
        <td style="color:#718096;font-size:11px">${bodyPctK}</td>
        <td>${dir}</td><td>${entry}</td><td>${bet}</td>
        <td style="color:#f6ad55">${spike}</td>
        <td>${e.trade_id || '&#x2014;'}</td><td>${statusBadge}</td><td>${pnlStr}</td><td>${dateLabel}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `<div class="table-scroll"><table>
      <thead><tr>
        <th>Time</th><th>Crypto</th><th>Type</th><th style="font-size:11px">Config</th><th>Cxx</th><th style="color:#718096;font-size:11px">Body%</th><th>Dir</th>
        <th>Entry</th><th>Bet</th><th>Spike</th><th>Trade ID</th><th>Status</th><th>P&amp;L</th><th>Date</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-log" style="color:#fc8181;">Error: ${err.message}</div>`;
    console.error('[kalshi-all-trades] load error', err);
  }
}


function openPnlChart() {
  document.getElementById('pnlOverlay').classList.add('open');
  renderPnlChart();
}

function closePnlChart() {
  document.getElementById('pnlOverlay').classList.remove('open');
  if (pnlChartResizeObs) { pnlChartResizeObs.disconnect(); pnlChartResizeObs = null; }
  if (pnlChartInstance)  { pnlChartInstance.remove(); pnlChartInstance = null; }
}

function pnlOverlayClick(e) {
  if (e.target === document.getElementById('pnlOverlay')) closePnlChart();
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('pnlOverlay').classList.contains('open')) closePnlChart();
});

function renderPnlChart() {
  const container = document.getElementById('pnlChartContainer');
  if (!container) return;

  if (pnlChartResizeObs) { pnlChartResizeObs.disconnect(); pnlChartResizeObs = null; }
  if (pnlChartInstance)  { pnlChartInstance.remove(); pnlChartInstance = null; }

  // Merge LIVE + LIVE_MINI pnlHistory (both share the same wallet; combined = total PnL)
  // Filter each by its own tradeListClearedAt so CLEAR only removes entries before that timestamp
  const liveClearedAt = state.LIVE?.tradeListClearedAt || null;
  const miniClearedAt = state.LIVE_MINI?.tradeListClearedAt || null;
  const liveEntries = (state.LIVE?.pnlHistory || [])
    .filter(e => !liveClearedAt || e.time >= liveClearedAt)
    .map(e => ({ ...e, _isMini: false }));
  const miniEntries = (state.LIVE_MINI?.pnlHistory || [])
    .filter(e => !miniClearedAt || e.time >= miniClearedAt)
    .map(e => ({ ...e, _isMini: true }));
  const resolved = [...liveEntries, ...miniEntries].sort((a, b) => new Date(a.time) - new Date(b.time));

  if (!resolved.length) {
    container.innerHTML = '<div class="chart-loading">No resolved trades yet</div>';
    return;
  }
  if (typeof LightweightCharts === 'undefined') {
    container.innerHTML = '<div class="chart-loading">Chart library not loaded</div>';
    return;
  }

  container.innerHTML = '';
  container.style.position = 'relative';

  // Hover tooltip
  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:absolute;display:none;padding:5px 10px;background:#2d3748;border:1px solid #4a5568;border-radius:4px;font-size:11px;color:#e2e8f0;pointer-events:none;z-index:10;white-space:nowrap;';
  container.appendChild(tooltip);

  pnlChartInstance = LightweightCharts.createChart(container, {
    width  : container.clientWidth,
    height : 340,
    layout : { background: { color: '#1a202c' }, textColor: '#a0aec0' },
    grid   : { vertLines: { color: '#2d3748' }, horzLines: { color: '#2d3748' } },
    timeScale: { borderColor: '#4a5568', timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderColor: '#4a5568' },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });

  // Baseline series — green above 0 (profit), red below (loss)
  const series = pnlChartInstance.addBaselineSeries({
    baseValue      : { type: 'price', price: 0 },
    topLineColor   : '#68d391',
    topFillColor1  : 'rgba(104,211,145,0.28)',
    topFillColor2  : 'rgba(104,211,145,0.04)',
    bottomLineColor: '#fc8181',
    bottomFillColor1: 'rgba(252,129,129,0.04)',
    bottomFillColor2: 'rgba(252,129,129,0.28)',
    lineWidth      : 2,
    lastValueVisible: true,
    priceLineVisible: false,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius : 5,
  });

  // Build chart data: cumulative PnL per trade (starts at 0)
  // Timestamps shifted to EAT (UTC+3) so the time axis shows local time
  const EAT_OFFSET = 3 * 3600;
  let lastTs = 0, cum = 0;
  const chartData = [];
  const eventByTs = {};

  for (const e of resolved) {
    let ts = Math.floor(new Date(e.time).getTime() / 1000) + EAT_OFFSET;
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    cum += e.pnl;
    const val = parseFloat(cum.toFixed(4));
    chartData.push({ time: ts, value: val });
    eventByTs[ts] = {
      timeLabel : new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' '),
      crypto    : e.crypto,
      direction : e.direction,
      status    : e.status,
      tradePnl  : e.pnl,
      cumPnl    : val,
      type      : (e.candle_size >= 150) ? '15m' : '5m',
      isMini    : e._isMini,
    };
  }

  series.setData(chartData);
  pnlChartInstance.timeScale().fitContent();

  // Crosshair tooltip — show trade details on hover
  pnlChartInstance.subscribeCrosshairMove(function(param) {
    if (!param.point || !param.time) { tooltip.style.display = 'none'; return; }
    const d = param.seriesData && param.seriesData.get(series);
    if (!d) { tooltip.style.display = 'none'; return; }
    const t = eventByTs[param.time];
    if (!t) { tooltip.style.display = 'none'; return; }
    const clr    = t.tradePnl >= 0 ? '#68d391' : '#fc8181';
    const cumClr = t.cumPnl   >= 0 ? '#68d391' : '#fc8181';
    const trSign = t.tradePnl >= 0 ? '+' : '';
    const cuSign = t.cumPnl   >= 0 ? '+' : '';
    const dirStr = t.direction === 'UP' ? '▲' : '▼';
    const miniBadgeTip = t.isMini ? ' <span style="background:#2d1f4a;color:#b794f4;font-size:9px;padding:1px 4px;border-radius:3px;border:1px solid #553c9a;">MINI</span>' : '';
    tooltip.innerHTML =
      '<span style="color:#a0aec0">' + t.timeLabel + '</span>' +
      ' &nbsp;<b>' + t.crypto + '</b>' +
      ' <span style="color:#718096">' + t.type + '</span>' +
      miniBadgeTip +
      ' ' + dirStr +
      ' &nbsp;<b style="color:' + clr + '">' + t.status + ' ' + trSign + '$' + t.tradePnl.toFixed(2) + '</b>' +
      ' &nbsp;<span style="color:#718096">cum </span><span style="color:' + cumClr + '">' + cuSign + '$' + t.cumPnl.toFixed(2) + '</span>';
    let left = param.point.x + 14;
    let top  = param.point.y - 36;
    if (left + 340 > container.clientWidth) left = param.point.x - 350;
    if (top < 4) top = 4;
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
    tooltip.style.display = 'block';
  });

  pnlChartResizeObs = new ResizeObserver(() => {
    if (pnlChartInstance) pnlChartInstance.applyOptions({ width: container.clientWidth });
  });
  pnlChartResizeObs.observe(container);
}

function toggleExportMenu(e) {
  e.stopPropagation();
  const d = document.getElementById('exportDropdown');
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
}
function closeExportMenu() {
  const d = document.getElementById('exportDropdown');
  if (d) d.style.display = 'none';
}
document.addEventListener('click', closeExportMenu);

function exportJSON() {
  const s = state.LIVE;
  if (!s) return;
  const resolved   = (s.activityLog || []).filter(e => e.status === 'WIN' || e.status === 'LOSS');
  const eoaHistory = (s.eoaPnlHistory || []).filter(e => e.pnl != null).sort((a,b)=>new Date(a.time)-new Date(b.time));
  const pnl        = resolved.reduce((sum, e) => sum + (e.pnl ?? 0), 0);
  const wins   = s.wins   ?? 0;
  const losses = s.losses ?? 0;
  const data = {
    exportedAt : new Date().toISOString(),
    stats: {
      pnl,
      wins,
      losses,
      winRate    : (wins + losses) ? +(wins / (wins + losses) * 100).toFixed(1) : null,
      baseEoaBalance: s.baseEoaBalance,
    },
    pnlHistory : eoaHistory,
    trades     : resolved,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `polychamp-live-${new Date().toISOString().slice(0,16).replace(/:/g,'-')}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const s = state.LIVE;
  if (!s) return;
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // ── Trades block ────────────────────────────────────────────────────
  const resolved  = (s.activityLog || []).filter(e => e.status === 'WIN' || e.status === 'LOSS');
  const tradeHdr  = ['time','crypto','type','direction','entry_pct','bet','spike_pct','trade_id','status','pnl','pnl_pct','date'];
  const tradeRows = resolved.map(e => {
    const type   = (e.candle_size >= 150) ? '15MIN' : '5MIN';
    const entry  = e.entryPrice != null ? (e.entryPrice * 100).toFixed(0) : '';
    const pnlPct = (e.pnl != null && e.position > 0) ? (e.pnl / e.position * 100).toFixed(1) : '';
    const date   = e.time ? new Date(e.time).toLocaleDateString() : '';
    return [e.time, e.crypto, type, e.direction, entry,
      e.position?.toFixed(2), e.spike_pct?.toFixed(2), e.tradeId,
      e.status, e.pnl?.toFixed(2), pnlPct, date].map(q).join(',');
  });

  // ── EOA PnL history block (same source as chart) ────────────────────
  const eoaHistory = (s.eoaPnlHistory || []).filter(e => e.pnl != null).sort((a,b)=>new Date(a.time)-new Date(b.time));
  const pnlHdr  = ['time','eoa_balance','pnl'];
  const pnlRows = eoaHistory.map(e => [e.time, e.eoa?.toFixed(2), e.pnl?.toFixed(4)].map(q).join(','));

  const csv = [
    '# TRADES',
    tradeHdr.join(','),
    ...tradeRows,
    '',
    '# EOA PnL HISTORY',
    pnlHdr.join(','),
    ...pnlRows,
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `polychamp-live-${new Date().toISOString().slice(0,16).replace(/:/g,'-')}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportHTML() {
  const s = state.LIVE;
  if (!s) return;

  // ── Stats ──────────────────────────────────────────────────────────
  // PnL = activityLog sum filtered by tradeListClearedAt (same as bal-LIVE display; eoaPnlHistory can lag)
  const cutoffExport = s.tradeListClearedAt || null;
  const pnl = parseFloat((s.activityLog || [])
    .filter(e => !cutoffExport || e.time >= cutoffExport)
    .reduce((sum, e) => sum + (e.pnl != null ? e.pnl : 0), 0)
    .toFixed(2));
  const wins    = s.wins   ?? 0;
  const losses  = s.losses ?? 0;
  const total   = wins + losses;
  const winRate = total ? (wins / total * 100).toFixed(1) + '%' : '—';
  const pending = s.pending ?? 0;

  const eoaBalance   = document.getElementById('live-real-balance')?.textContent.trim() || '—';
  const locked       = document.getElementById('bal-locked-LIVE')?.textContent.trim()   || '$0.00';
  const redeemable   = document.getElementById('bal-redeem-LIVE')?.textContent.trim()   || '$0.00';
  const redeemQ      = document.getElementById('redeem-q-LIVE')?.textContent.trim()     || '0';
  const virtualTotal = document.getElementById('bal-total-LIVE')?.textContent.trim()    || '—';

  // ── Chart data — same source as renderPnlChart() (activityLog cumulative) ──
  const logResolved = (s.activityLog || [])
    .filter(e => (e.status === 'WIN' || e.status === 'LOSS') && e.pnl != null && e.time)
    .slice()
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  let lastTs = 0, cumChart = 0;
  const chartData   = [];
  const tradeLabels = {};
  for (const e of logResolved) {
    let ts = Math.floor(new Date(e.time).getTime() / 1000);
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    cumChart += e.pnl;
    const val = parseFloat(cumChart.toFixed(4));
    chartData.push({ time: ts, value: val });
    tradeLabels[ts] = {
      timeLabel : e.time.slice(0, 16).replace('T', ' '),
      crypto    : e.crypto,
      direction : e.direction,
      status    : e.status,
      tradePnl  : e.pnl,
      cum       : val,
      type      : (e.candle_size >= 150) ? '15m' : '5m',
    };
  }

  // ── Trades table rows ──────────────────────────────────────────────
  const resolved = (s.activityLog || []).filter(e => e.status === 'WIN' || e.status === 'LOSS');
  const tradesRows = resolved.map(e => {
    const t         = new Date(e.time);
    const ts        = t.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false });
    const dateLabel = t.toLocaleDateString(undefined, { month:'short', day:'numeric',
      ...(t.getFullYear() !== new Date().getFullYear() ? { year:'numeric' } : {}) });
    const dir     = e.direction === 'UP' ? '▲ UP' : '▼ DOWN';
    const dirClr  = e.direction === 'UP' ? '#63b3ed' : '#f6ad55';
    const entry   = e.entryPrice != null ? `${(e.entryPrice * 100).toFixed(0)}¢` : '—';
    const bet     = e.position   != null ? `$${e.position.toFixed(2)}` : '—';
    const spike   = e.spike_pct  != null ? `+${e.spike_pct.toFixed(2)}%` : '—';
    const type    = (e.candle_size >= 150) ? '15MIN' : '5MIN';
    const typeClr = (e.candle_size >= 150) ? '#63b3ed' : '#68d391';
    const winClr  = e.status === 'WIN' ? '#68d391' : '#fc8181';
    const pnlStr  = e.pnl != null
      ? (e.status === 'WIN' ? `+$${e.pnl.toFixed(2)}` : `-$${Math.abs(e.pnl).toFixed(2)}`)
      : '—';
    const pct = (e.pnl != null && e.position > 0)
      ? ` (${(e.pnl / e.position * 100).toFixed(1)}%)`
      : '';
    let idCell = e.tradeId || '—';
    if (e.cycleStart && e.candle_size) {
      const url = polyUrlFE(e.crypto, e.cycleStart, e.candle_size);
      if (url) idCell = `<a href="${url}" target="_blank" style="color:#4fd1c5;text-decoration:none;">📊 ${e.tradeId || '—'}</a>`;
    }
    const fokBadge = e.isFokRetry
      ? '<span style="background:#2d3748;color:#718096;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;letter-spacing:.04em;border:1px solid #4a5568;">FOK</span>'
      : '';
    return `<tr>
      <td>${ts}</td>
      <td><strong>${e.crypto}</strong></td>
      <td style="color:${typeClr}">${type}</td>
      <td style="color:${dirClr}">${dir}</td>
      <td>${entry}</td><td>${bet}</td>
      <td style="color:#f6ad55">${spike}</td>
      <td>${idCell}</td>
      <td>${fokBadge}</td>
      <td style="color:${winClr};font-weight:bold">${e.status}</td>
      <td style="color:${winClr}">${pnlStr}${pct}</td>
      <td style="color:#718096">${dateLabel}</td>
    </tr>`;
  }).join('');

  const pnlSign  = pnl >= 0 ? '+' : '';
  const pnlColor = pnl >= 0 ? '#68d391' : '#fc8181';
  const exportTs = new Date().toLocaleString();
  const chartJson = JSON.stringify(chartData);
  const labelJson = JSON.stringify(tradeLabels);

  // ── Build HTML ─────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Polychamp LIVE Export — ${exportTs}</title>
<script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"><\/script>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:#1a202c; color:#e2e8f0; font-family:monospace; font-size:13px; padding:20px; }
  h1 { font-size:16px; color:#a0aec0; margin-bottom:4px; }
  .export-ts { font-size:11px; color:#4a5568; margin-bottom:16px; }
  .stats-bar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
  .stat-box { background:#2d3748; border-radius:6px; padding:8px 14px; min-width:100px; }
  .stat-label { font-size:10px; color:#718096; text-transform:uppercase; letter-spacing:.05em; }
  .stat-val { font-size:15px; font-weight:bold; margin-top:2px; }
  #chartContainer { width:100%; height:340px; background:#1a202c; border-radius:8px; margin-bottom:16px; }
  table { border-collapse:collapse; width:100%; font-size:12px; }
  th { background:#2d3748; color:#a0aec0; padding:6px 10px; text-align:left; font-weight:normal; position:sticky; top:0; }
  td { padding:5px 10px; border-bottom:1px solid #2d3748; vertical-align:middle; }
  tr:hover td { background:#2d374840; }
  .section-title { font-size:12px; color:#a0aec0; margin:16px 0 6px; }
</style>
</head>
<body>
<h1>Polychamp — LIVE Polymarket</h1>
<div class="export-ts">Exported: ${exportTs}</div>

<div class="stats-bar">
  <div class="stat-box">
    <div class="stat-label">Virtual Total</div>
    <div class="stat-val">${virtualTotal}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">EOA Wallet</div>
    <div class="stat-val">${eoaBalance}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Locked</div>
    <div class="stat-val">${locked}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Redeemable</div>
    <div class="stat-val">${redeemable}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Redeem Q</div>
    <div class="stat-val">${redeemQ}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">P&amp;L</div>
    <div class="stat-val" style="color:${pnlColor}">${pnlSign}$${pnl.toFixed(2)}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Wins</div>
    <div class="stat-val" style="color:#68d391">${wins}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Losses</div>
    <div class="stat-val" style="color:#fc8181">${losses}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Win Rate</div>
    <div class="stat-val">${winRate}</div>
  </div>
  <div class="stat-box">
    <div class="stat-label">Pending</div>
    <div class="stat-val">${pending}</div>
  </div>
</div>

<div class="section-title"><svg class="ico ico-md"><use href="#ico-trending-up"/></svg> Cumulative P&amp;L</div>
<div id="chartContainer"></div>

<div class="section-title"><svg class="ico ico-md"><use href="#ico-clipboard"/></svg> Recent Trades (${resolved.length})</div>
<div style="overflow-x:auto">
<table>
  <thead><tr>
    <th>Time</th><th>Crypto</th><th>Type</th><th>Dir</th>
    <th>Entry</th><th>Bet</th><th>Spike</th><th>Market / ID</th>
    <th></th><th>Status</th><th>P&amp;L</th><th>Date</th>
  </tr></thead>
  <tbody>${tradesRows}</tbody>
</table>
</div>

<script>
(function() {
  const chartData   = ${chartJson};
  const tradeLabels = ${labelJson};
  if (!chartData.length || typeof LightweightCharts === 'undefined') return;
  const container = document.getElementById('chartContainer');
  const chart = LightweightCharts.createChart(container, {
    width: container.clientWidth, height: 340,
    layout: { background:{ color:'#1a202c' }, textColor:'#a0aec0' },
    grid: { vertLines:{ color:'#2d3748' }, horzLines:{ color:'#2d3748' } },
    timeScale: { borderColor:'#4a5568', timeVisible:true, secondsVisible:true },
    rightPriceScale: { borderColor:'#4a5568' },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });
  const series = chart.addBaselineSeries({
    baseValue: { type:'price', price:0 },
    topLineColor:'#68d391', topFillColor1:'rgba(104,211,145,0.28)', topFillColor2:'rgba(104,211,145,0.04)',
    bottomLineColor:'#fc8181', bottomFillColor1:'rgba(252,129,129,0.04)', bottomFillColor2:'rgba(252,129,129,0.28)',
    lineWidth:2, lastValueVisible:true, priceLineVisible:false,
  });
  series.setData(chartData);
  chart.timeScale().fitContent();

  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:absolute;display:none;padding:5px 10px;background:#2d3748;border:1px solid #4a5568;border-radius:4px;font-size:11px;color:#e2e8f0;pointer-events:none;z-index:10;white-space:nowrap;';
  container.style.position = 'relative';
  container.appendChild(tooltip);
  chart.subscribeCrosshairMove(function(param) {
    if (!param.point || !param.time) { tooltip.style.display='none'; return; }
    const t = tradeLabels[param.time];
    if (!t) { tooltip.style.display='none'; return; }
    const clr    = t.tradePnl >= 0 ? '#68d391' : '#fc8181';
    const cumClr = t.cum      >= 0 ? '#68d391' : '#fc8181';
    const trSign = t.tradePnl >= 0 ? '+' : '';
    const cuSign = t.cum      >= 0 ? '+' : '';
    const dirStr = t.direction === 'UP' ? '▲' : '▼';
    tooltip.innerHTML = '<span style=\"color:#a0aec0\">' + t.timeLabel + '</span>' +
      ' &nbsp;<b>' + t.crypto + '</b>' +
      ' <span style=\"color:#718096\">' + t.type + '</span>' +
      ' ' + dirStr +
      ' &nbsp;<b style=\"color:' + clr + '\">' + t.status + ' ' + trSign + '$' + t.tradePnl.toFixed(2) + '</b>' +
      ' &nbsp;<span style=\"color:#718096\">cum </span><span style=\"color:' + cumClr + '\">' + cuSign + '$' + t.cum.toFixed(2) + '</span>';
    let left = param.point.x + 14, top = param.point.y - 36;
    if (left + 260 > container.clientWidth) left = param.point.x - 270;
    if (top < 4) top = 4;
    tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; tooltip.style.display = 'block';
  });
  new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth })).observe(container);
})();
<\/script>
</body>
</html>`;

  // ── Download ───────────────────────────────────────────────────────
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `polychamp-live-${new Date().toISOString().slice(0,16).replace(/:/g,'-')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Rejected Signals Modal ────────────────────────────────────────────────────
let _rejRows = [];
let _rejFilter = 'all';
let _rejLiveContext = { balance: null, riskPct: null };

const REJ_REASON_LABELS = {
  price_too_high : 'price-hi',
  price_too_low  : 'price-lo',
  weak_body      : 'weak-body',
  low_vol        : 'low-vol',
  low_dist       : 'low-dist',
  circuit_breaker: 'circ-brk',
  drawdown_limit : 'drwl',
  max_positions  : 'max-pos',
  price_out_of_range: 'price-range',
  no_tier_match  : 'no-tier',
  below_threshold: 'low-spike',
};
const REJ_REASON_COLORS = {
  price_too_high : ['#7c3617','#f6ad55'],
  price_too_low  : ['#7c3617','#f6ad55'],
  price_out_of_range: ['#7c3617','#f6ad55'],
  weak_body      : ['#1a3050','#63b3ed'],
  low_vol        : ['#1a2a3a','#4299e1'],
  low_dist       : ['#1a2a3a','#4299e1'],
  circuit_breaker: ['#2d2008','#d69e2e'],
  drawdown_limit : ['#2d2008','#d69e2e'],
  max_positions  : ['#2d1515','#fc8181'],
  no_tier_match  : ['#1a1f2a','#718096'],
  below_threshold: ['#1a1f2a','#4a5568'],
};

async function openRejModal() {
  document.getElementById('rejOverlay').classList.add('open');
  document.getElementById('rej-modal-body').innerHTML =
    '<tr><td colspan="11" style="padding:20px;text-align:center;color:#718096;">Loading…</td></tr>';
  _rejFilter = 'all';
  try {
    const data = await apiFetch('/t1000/rejected?limit=500', 'GET');
    _rejRows = data?.rows || [];
    renderRejFilterPills();
    renderRejModal();
  } catch(e) {
    document.getElementById('rej-modal-body').innerHTML =
      '<tr><td colspan="11" style="padding:20px;text-align:center;color:#fc8181;">Failed to load</td></tr>';
  }
}

function closeRejModal() {
  document.getElementById('rejOverlay').classList.remove('open');
}

function rejOverlayClick(e) {
  if (e.target === document.getElementById('rejOverlay')) closeRejModal();
}

function renderRejFilterPills() {
  const showAll = document.getElementById('rej-show-all')?.checked;
  const src = showAll ? _rejRows : _rejRows.filter(r => r.reason !== 'below_threshold');
  // count by reason
  const counts = {};
  for (const r of src) counts[r.reason] = (counts[r.reason] || 0) + 1;
  const reasons = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);

  const row = document.getElementById('rej-filter-row');
  if (!row) return;
  const allBtn = `<button onclick="setRejFilter('all')" data-rf="all"
    style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;
    border:1px solid ${_rejFilter==='all'?'#63b3ed':'#2d3748'};
    background:${_rejFilter==='all'?'#1e3a5f':'#1a1f2a'};
    color:${_rejFilter==='all'?'#63b3ed':'#718096'};">All (${src.length})</button>`;
  const pills = reasons.map(r => {
    const lbl  = REJ_REASON_LABELS[r] || r;
    const cols = REJ_REASON_COLORS[r]  || ['#1a1f2a','#a0aec0'];
    const active = _rejFilter === r;
    return `<button onclick="setRejFilter('${r}')" data-rf="${r}"
      style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;
      border:1px solid ${active?cols[1]:'#2d3748'};
      background:${active?cols[0]:'#1a1f2a'};
      color:${active?cols[1]:'#718096'};">${lbl} (${counts[r]})</button>`;
  }).join('');
  row.innerHTML = allBtn + pills;
}

function setRejFilter(f) {
  _rejFilter = f;
  renderRejFilterPills();
  renderRejModal();
}

function renderRejModal() {
  const showAll = document.getElementById('rej-show-all')?.checked;
  let rows = showAll ? _rejRows : _rejRows.filter(r => r.reason !== 'below_threshold');
  if (_rejFilter !== 'all') rows = rows.filter(r => r.reason === _rejFilter);

  const countEl = document.getElementById('rej-modal-count');
  if (countEl) countEl.textContent = `${rows.length} signal${rows.length!==1?'s':''}`;

  // ── Stats panel ──────────────────────────────────────────────────────────────
  const statsPanel = document.getElementById('rej-stats-panel');
  const wrEl       = document.getElementById('rej-modal-wr');
  const resolved   = rows.filter(r => r.outcome);
  const totalRes   = resolved.length;

  if (statsPanel && totalRes > 0) {
    const { balance, riskPct } = _rejLiveContext;
    const miniPos = (balance != null && riskPct != null)
      ? Math.max(balance * riskPct / 10, 2)
      : null;

    // PNL for one resolved row using mini position
    const calcPnl = (r, pos) => {
      if (!r.outcome || !pos) return null;
      const ep = parseFloat(r.entry_price);
      if (!ep || ep <= 0 || ep >= 1) return null;
      return r.direction === r.outcome ? pos / ep - pos : -pos;
    };

    const fmtWr = (w, t) => {
      if (!t) return '<span style="color:#4a5568">—</span>';
      const pct = w / t * 100;
      const col = pct >= 75 ? '#68d391' : pct >= 55 ? '#f6ad55' : '#fc8181';
      return `<span style="color:${col};font-weight:700">${pct.toFixed(1)}%</span><span style="color:#4a5568;font-size:10px;"> (${w}/${t})</span>`;
    };
    const fmtPnl = v => {
      if (v == null) return '<span style="color:#4a5568">—</span>';
      const col = v > 0 ? '#68d391' : v < 0 ? '#fc8181' : '#a0aec0';
      return `<span style="color:${col};font-weight:700">${v >= 0 ? '+' : ''}$${v.toFixed(2)}</span>`;
    };
    // EV per trade as % of position (positive = exploitable)
    // Formula: WR × (1/avgEntry − 1) − (1−WR)
    // Break-even: WR = avgEntry (e.g. 80% WR is profitable only if avg entry < 80¢)
    const calcEv = (wr, avgEntry) => {
      if (!avgEntry || avgEntry <= 0 || avgEntry >= 1) return null;
      return wr * (1 / avgEntry - 1) - (1 - wr);
    };
    const fmtEv = (ev, miniP) => {
      if (ev == null) return '<span style="color:#4a5568">—</span>';
      const pct = (ev * 100).toFixed(1);
      const col = ev > 0.02 ? '#68d391' : ev > -0.02 ? '#f6ad55' : '#fc8181';
      const dollar = miniP != null ? ` <span style="color:#4a5568;font-size:10px;">(${ev >= 0 ? '+' : ''}$${(ev * miniP).toFixed(2)}/tr)</span>` : '';
      return `<span style="color:${col};font-weight:700">${ev >= 0 ? '+' : ''}${pct}%</span>${dollar}`;
    };
    const exploitBadge = ev => {
      if (ev == null) return '';
      if (ev > 0.03)  return ' <span style="background:#1a3a1a;color:#68d391;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">✓ explore</span>';
      if (ev > 0)     return ' <span style="background:#2a2a15;color:#d4c44a;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">~ marginal</span>';
      return ' <span style="background:#2a1515;color:#fc8181;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">✗ skip</span>';
    };

    // Overall
    const oWins = resolved.filter(r => r.direction === r.outcome).length;
    const oPnl  = miniPos != null
      ? resolved.reduce((s, r) => { const p = calcPnl(r, miniPos); return p != null ? s + p : s; }, 0)
      : null;
    const oEntrySum = resolved.reduce((s, r) => { const ep = parseFloat(r.entry_price); return ep > 0 && ep < 1 ? s + ep : s; }, 0);
    const oEntryCnt = resolved.filter(r => { const ep = parseFloat(r.entry_price); return ep > 0 && ep < 1; }).length;
    const oAvgEntry = oEntryCnt > 0 ? oEntrySum / oEntryCnt : null;
    const oEv = calcEv(oWins / totalRes, oAvgEntry);

    // Per-reason (excl. below_threshold)
    const reasonMap = {};
    for (const r of rows) {
      if (r.reason === 'below_threshold') continue;
      if (!reasonMap[r.reason]) reasonMap[r.reason] = { total: 0, resolved: 0, wins: 0, pnl: 0, entrySum: 0, entryCnt: 0 };
      const g = reasonMap[r.reason];
      g.total++;
      const ep = parseFloat(r.entry_price);
      if (ep > 0 && ep < 1) { g.entrySum += ep; g.entryCnt++; }
      if (r.outcome) {
        g.resolved++;
        if (r.direction === r.outcome) g.wins++;
        const p = calcPnl(r, miniPos);
        if (p != null) g.pnl += p;
      }
    }

    const LABELS = {
      below_threshold: 'below-thresh', weak_body: 'weak-body', low_vol: 'low-vol',
      low_dist: 'low-dist', circuit_breaker: 'circ-brk', price_too_high: 'price-hi',
      price_too_low: 'price-lo', asset_already_open: 'open', max_positions: 'max-pos',
      drawdown_limit: 'drwl', no_tier_match: 'no-tier', signal_too_stale: 'stale',
      price_out_of_range: 'price-oor', no_liquidity: 'no-liq', below_minimum: 'below-min',
    };

    const miniStr = miniPos != null
      ? `<span style="color:#a0aec0">mini: <b>$${miniPos.toFixed(2)}</b>/trade</span>`
      : '<span style="color:#4a5568">set LIVE risk% to see PNL</span>';

    const reasonRows = Object.entries(reasonMap)
      .map(([reason, g]) => {
        const avgEntry = g.entryCnt > 0 ? g.entrySum / g.entryCnt : null;
        const wr = g.resolved > 0 ? g.wins / g.resolved : null;
        const ev = wr != null ? calcEv(wr, avgEntry) : null;
        return { reason, g, avgEntry, wr, ev };
      })
      .sort((a, b) => {
        // Sort by EV desc (null last), then total desc
        if (a.ev != null && b.ev != null) return b.ev - a.ev;
        if (a.ev != null) return -1;
        if (b.ev != null) return 1;
        return b.g.total - a.g.total;
      })
      .map(({ reason, g, avgEntry, wr, ev }) => {
        const cols = REJ_REASON_COLORS[reason] || ['#1a1f2a','#a0aec0'];
        const lbl  = `<span style="background:${cols[0]};color:${cols[1]};padding:1px 6px;border-radius:3px;font-size:11px;font-weight:700;white-space:nowrap;">${LABELS[reason] || reason}</span>`;
        const wrFmt  = wr != null ? fmtWr(g.wins, g.resolved) : '<span style="color:#4a5568">—</span>';
        const evFmt  = fmtEv(ev, miniPos);
        const entryFmt = avgEntry != null ? `<span style="color:#718096">${Math.round(avgEntry*100)}¢</span>` : '<span style="color:#4a5568">—</span>';
        const pnlFmt = (miniPos != null && g.resolved > 0) ? fmtPnl(g.pnl) : '<span style="color:#4a5568">—</span>';
        const exploit = exploitBadge(ev);
        return `<tr>
          <td style="padding:3px 10px 3px 0;white-space:nowrap;">${lbl}${exploit}</td>
          <td style="padding:3px 10px;color:#718096;text-align:right;">${g.total}</td>
          <td style="padding:3px 10px;">${wrFmt}</td>
          <td style="padding:3px 8px;text-align:right;">${entryFmt}</td>
          <td style="padding:3px 10px;">${evFmt}</td>
          <td style="padding:3px 10px;">${pnlFmt}</td>
        </tr>`;
      }).join('');

    const oAvgStr = oAvgEntry != null ? ` · avg entry <b>${Math.round(oAvgEntry*100)}¢</b>` : '';
    statsPanel.style.display = '';
    statsPanel.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:20px;flex-wrap:wrap;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #2d3748;">
        <span style="color:#a0aec0;">WR: ${fmtWr(oWins, totalRes)}</span>
        <span style="color:#a0aec0;">EV/trade: ${fmtEv(oEv, miniPos)}</span>
        <span style="color:#a0aec0;">Est. PNL: ${fmtPnl(oPnl)}</span>
        <span style="color:#718096;font-size:11px;">${oAvgStr}</span>
        ${miniStr}
      </div>
      <table style="border-collapse:collapse;width:100%;">
        <thead><tr style="color:#4a5568;font-size:10px;text-transform:uppercase;letter-spacing:.06em;">
          <th style="padding:2px 10px 4px 0;text-align:left;">Reason</th>
          <th style="padding:2px 10px 4px;text-align:right;">Sig</th>
          <th style="padding:2px 10px 4px;text-align:left;">WR%</th>
          <th style="padding:2px 8px 4px;text-align:right;">Avg entry</th>
          <th style="padding:2px 10px 4px;text-align:left;">EV/trade</th>
          <th style="padding:2px 10px 4px;text-align:left;">Est. PNL</th>
        </tr></thead>
        <tbody>${reasonRows}</tbody>
      </table>`;

    if (wrEl) {
      wrEl.style.display = 'none'; // handled inside panel now
    }
  } else {
    if (statsPanel) statsPanel.style.display = 'none';
    if (wrEl) wrEl.style.display = 'none';
  }

  renderRejFilterPills();

  const tbody = document.getElementById('rej-modal-body');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="padding:20px;text-align:center;color:#718096;">No rejections</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const t = new Date(r.created_at);
    const ts = t.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const dateStr = t.toLocaleDateString('en-GB', {day:'2-digit',month:'short'});

    const dir = r.direction === 'UP'
      ? '<span style="color:#68d391">▲ UP</span>'
      : '<span style="color:#fc8181">▼ DN</span>';

    const spike = parseFloat(r.spike_pct).toFixed(3) + '%';
    const entry = r.entry_price != null ? Math.round(parseFloat(r.entry_price)*100) + '¢' : '—';

    const cols  = REJ_REASON_COLORS[r.reason] || ['#1a1f2a','#a0aec0'];
    const lbl   = REJ_REASON_LABELS[r.reason] || r.reason;
    const badge = `<span style="background:${cols[0]};color:${cols[1]};padding:2px 7px;border-radius:3px;font-size:11px;font-weight:700;white-space:nowrap;">${lbl}</span>`;

    // Body% — from details (weak_body) or computed from context_candles[0] OHLC
    let bodyPct = null;
    if (r.details?.body_ratio != null) {
      bodyPct = r.details.body_ratio;
    } else {
      const cc0 = Array.isArray(r.context_candles) ? r.context_candles[0] : null;
      if (cc0 && cc0.h != null && cc0.l != null && (cc0.h - cc0.l) > 0)
        bodyPct = Math.abs(cc0.c - cc0.o) / (cc0.h - cc0.l) * 100;
    }
    const bodyStr = bodyPct != null ? `<span style="color:${bodyPct >= 76 ? '#68d391' : '#fc8181'}">${bodyPct.toFixed(0)}%</span>` : '<span style="color:#4a5568">—</span>';

    // Build human-readable detail from details JSON
    let detail = '';
    const d = r.details;
    if (d) {
      if (r.reason === 'weak_body')       detail = `body ${d.body_ratio?.toFixed(0)}%`;
      else if (r.reason === 'price_too_high') detail = `${Math.round(parseFloat(r.entry_price)*100)}¢ > max ${d.max_c}¢`;
      else if (r.reason === 'price_too_low')  detail = `${Math.round(parseFloat(r.entry_price)*100)}¢ < min ${d.min_c}¢`;
      else if (r.reason === 'low_vol')    detail = `vol ${d.vol_ratio?.toFixed(2)}`;
      else if (r.reason === 'low_dist')   detail = `dist ${d.dist?.toFixed(3)}% < ${d.min?.toFixed(3)}%`;
      else if (r.reason === 'circuit_breaker') detail = `paused ${d.mins_remaining?.toFixed(0)}m left`;
      else if (r.reason === 'price_out_of_range') detail = `${d.entry_c}¢`;
      else if (r.reason === 'no_tier_match') detail = `no T1/TC spike`;
      else detail = JSON.stringify(d).slice(0,40);
    }

    const cryptoColors = {BTC:'#f7931a',ETH:'#627eea',SOL:'#9945ff',XRP:'#3ecf6e'};
    const cryptoClr = cryptoColors[r.crypto] || '#a0aec0';

    // Market link (Polymarket) — use cycleStartSec (always computed, has fallback to created_at)
    const mktCycleMs = r.cycleStartSec ? r.cycleStartSec * 1000 : r.cycle_start_ms;
    const mktUrl = mktCycleMs ? polyUrlFE(r.crypto, mktCycleMs, r.candle_size) : null;
    const cycleTimeStr = mktCycleMs ? new Date(mktCycleMs).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',hour12:false}) : '';
    const mktLink = mktUrl
      ? ` <a href="${mktUrl}" target="_blank" title="Open on Polymarket" style="color:#4fd1c5;text-decoration:none;font-size:11px;background:#0d1e2a;border:1px solid #2d5060;border-radius:3px;padding:1px 5px;margin-left:4px;">↗ ${cycleTimeStr}</a>`
      : '';

    // CXX chart button — close rej modal first so chart overlay is visible
    const cxxBtn = r.cycle_start_ms
      ? `<button onclick="closeRejModal();openChartForTrade('${r.crypto}',${r.candle_size},${r.cycle_start_ms},'SKIP')" title="Open chart for ${r.crypto} C${r.candle_size}" style="background:none;border:none;color:#a0aec0;cursor:pointer;font-size:11px;padding:0;text-decoration:underline dotted;">C${r.candle_size}</button>`
      : `<span style="color:#a0aec0;">C${r.candle_size}</span>`;

    // Slot (T0 / T1 / TC)
    const slot = r.details?.slot ?? 'T0';
    const slotColors = { T0: ['#1a2535','#90cdf4'], T1: ['#1a2535','#68d391'], TC: ['#2a2020','#f6ad55'] };
    const [slotBg, slotClr] = slotColors[slot] ?? slotColors.T0;
    const slotBadge = `<span style="background:${slotBg};color:${slotClr};padding:2px 6px;border-radius:3px;font-size:11px;font-weight:700;">${slot}</span>`;

    // Market outcome (WIN / LOSS / pending)
    let outcomeBadge = '<span style="color:#4a5568;font-size:11px;">—</span>';
    if (r.outcome) {
      const isWin = r.direction === r.outcome;
      outcomeBadge = isWin
        ? '<span style="color:#68d391;font-weight:700;font-size:11px;">WIN</span>'
        : '<span style="color:#fc8181;font-weight:700;font-size:11px;">LOSS</span>';
    }

    // Row highlight: green tint for low_vol (good signal we're now trading), amber for price_oor (marginal)
    const rowBaseBg = r.reason === 'low_vol'           ? '#081a0f'
                    : r.reason === 'price_out_of_range' ? '#1a1200'
                    : '';
    const rowHoverBg = r.reason === 'low_vol'           ? '#0e2a1a'
                     : r.reason === 'price_out_of_range' ? '#241800'
                     : '#1a2028';
    return `<tr style="border-bottom:1px solid #1d2329;${rowBaseBg ? 'background:'+rowBaseBg+';' : ''}" onmouseover="this.style.background='${rowHoverBg}'" onmouseout="this.style.background='${rowBaseBg}'">
      <td style="padding:6px 10px;color:#718096;white-space:nowrap;" title="${r.created_at}">${dateStr} ${ts}</td>
      <td style="padding:6px 10px;font-weight:700;color:${cryptoClr};">${r.crypto}${mktLink}</td>
      <td style="padding:6px 10px;">${cxxBtn}</td>
      <td style="padding:6px 10px;">${slotBadge}</td>
      <td style="padding:6px 10px;">${dir}</td>
      <td style="padding:6px 10px;text-align:right;">${bodyStr}</td>
      <td style="padding:6px 10px;text-align:right;color:#e2e8f0;">${spike}</td>
      <td style="padding:6px 10px;text-align:right;color:#a0aec0;">${entry}</td>
      <td style="padding:6px 10px;">${badge}</td>
      <td style="padding:6px 10px;color:#4a5568;font-size:12px;">${detail}</td>
      <td style="padding:6px 10px;">${outcomeBadge}</td>
    </tr>`;
  }).join('');
}

// ─── Salary / Auto-Withdrawal ────────────────────────────────────────────────

async function loadWithdrawalConfig() {
  const cfg = await apiFetch('/withdrawal/config');
  if (!cfg) return;
  // Keep checkbox in sync (do not fight user who just toggled it)
  const enabledCb = document.getElementById('wd-enabled');
  if (enabledCb) enabledCb.checked = !!cfg.enabled;
  // Populate config form fields
  const tgt = document.getElementById('wd-target');
  const lim = document.getElementById('wd-limit');
  const mn  = document.getElementById('wd-min');
  const cd  = document.getElementById('wd-cooldown');
  if (tgt) tgt.value = cfg.balanceTarget  ?? 3000;
  if (lim) lim.value = cfg.withdrawalLimit ?? 300;
  if (mn)  mn.value  = cfg.minWithdrawal   ?? 50;
  if (cd)  cd.value  = cfg.cooldownHours   ?? 4;
  // Build summary line
  const sumEl = document.getElementById('wd-summary');
  if (sumEl) {
    const walletPart = cfg.destinationWalletMasked
      ? `→ <span style="color:#63b3ed;font-family:monospace;">${cfg.destinationWalletMasked}</span>`
      : '<span style="color:#4a5568;">no wallet set</span>';
    const lastPart = cfg.lastWithdrawalAt
      ? `last: <strong style="color:#68d391;">${new Date(cfg.lastWithdrawalAt).toLocaleDateString()}</strong>`
      : '<span style="color:#4a5568;">never run</span>';
    const statusPart = cfg.enabled
      ? `<span style="color:#68d391;font-weight:600;">enabled</span>`
      : `<span style="color:#718096;">disabled</span>`;
    sumEl.innerHTML = `${walletPart} &nbsp;·&nbsp; target <strong>$${cfg.balanceTarget}</strong>, limit <strong>$${cfg.withdrawalLimit}/tx</strong>, cooldown <strong>${cfg.cooldownHours}h</strong> &nbsp;·&nbsp; ${lastPart} &nbsp;·&nbsp; ${statusPart}`;
  }
  // wallet hint hidden — full wallet pre-populated in input when config form opens

  // Update balance-row salary stat
  const count = cfg.withdrawalCount || 0;
  const total = cfg.totalWithdrawn  || 0;
  const wrap  = document.getElementById('wd-stat-wrap');
  if (wrap) {
    wrap.style.display = 'block';
    const tot = document.getElementById('wd-stat-total');
    const cnt = document.getElementById('wd-stat-count');
    if (tot) tot.textContent = count > 0 ? '$' + total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '—';
    if (cnt) cnt.textContent = count > 0 ? count + '\u00D7' : '';
  }
}

async function withdrawalShowConfig() {
  const form = document.getElementById('withdrawal-config-form');
  if (!form) return;
  const opening = form.style.display === 'none';
  form.style.display = opening ? 'block' : 'none';
  if (!opening) return;
  // Fetch full wallet and pre-populate the input when opening
  try {
    const res = await fetch(API_BASE + '/withdrawal/wallet', {
      headers: { 'Authorization': _API_AUTH || '' },
    });
    if (res.ok) {
      const data = await res.json();
      const walletEl = document.getElementById('wd-wallet');
      if (walletEl && data.destinationWallet) walletEl.value = data.destinationWallet;
    }
  } catch (_) {}
}

// ─── Withdrawal history popup ─────────────────────────────────────────────────

async function openWithdrawalHistory() {
  const modal = document.getElementById('wd-history-modal');
  if (!modal) return;
  modal.classList.add('open');

  const tbody   = document.getElementById('wd-hist-tbody');
  const summary = document.getElementById('wd-hist-summary');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#718096;">Loading…</td></tr>';

  try {
    const res = await fetch(API_BASE + '/withdrawal/history', {
      headers: { 'Authorization': _API_AUTH || '' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if (summary) {
      const tot = (data.totalWithdrawn || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      summary.textContent = `${data.withdrawalCount || 0} withdrawal${data.withdrawalCount !== 1 ? 's' : ''} · total $${tot} USDC.e`;
    }

    if (!data.history || data.history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#4a5568;">No withdrawals yet</td></tr>';
      return;
    }

    tbody.innerHTML = data.history.map(h => {
      // Format datetime in EAT (UTC+3)
      const dt  = new Date(h.at);
      const eat = dt.toLocaleString('en-GB', {
        timeZone: 'Africa/Nairobi',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      });
      const amt  = '$' + (h.amount || 0).toFixed(2);
      // Short wallet with tooltip showing full
      const shortWallet = h.destination
        ? `<span title="${h.destination}" style="font-family:monospace;cursor:default;">${h.destination.slice(0,8)}…${h.destination.slice(-6)}</span>`
        : '—';
      // TX hash link to Polygonscan
      const txLink = h.txHash
        ? `<a class="wd-tx-link" href="https://polygonscan.com/tx/${h.txHash}" target="_blank" rel="noopener"
             title="${h.txHash}">${h.txHash.slice(0,10)}…${h.txHash.slice(-6)}&nbsp;↗</a>`
        : '—';
      return `<tr>
        <td style="white-space:nowrap;color:#a0aec0;">${eat}</td>
        <td style="text-align:right;color:#68d391;font-weight:700;">${amt}</td>
        <td>${shortWallet}</td>
        <td>${txLink}</td>
      </tr>`;
    }).join('');

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:#fc8181;">Error: ${e.message}</td></tr>`;
  }
}

function closeWithdrawalHistory() {
  document.getElementById('wd-history-modal')?.classList.remove('open');
}

// Close history modal on backdrop click
document.addEventListener('click', function(e) {
  const modal = document.getElementById('wd-history-modal');
  if (modal && e.target === modal) closeWithdrawalHistory();
});

// Toggle Auto: snapshot previous state so we can revert checkbox on cancel/wrong PIN
function withdrawalToggleEnabled() {
  const cb      = document.getElementById('wd-enabled');
  const enabled = cb.checked;
  // Revert checkbox immediately — PIN success will flip it properly via loadWithdrawalConfig
  cb.checked = !enabled;
  openPinModal(async (pin) => {
    const r = await apiFetch('/withdrawal/config', 'POST', { enabled, pin });
    if (!r || r.error) { pinShowError(r?.error || 'Save failed'); return; }
    closePinModal();
    await loadWithdrawalConfig();
  });
}

function withdrawalSaveConfig() {
  const wallet   = (document.getElementById('wd-wallet')?.value   || '').trim();
  const target   = document.getElementById('wd-target')?.value;
  const limit    = document.getElementById('wd-limit')?.value;
  const minAmt   = document.getElementById('wd-min')?.value;
  const cooldown = document.getElementById('wd-cooldown')?.value;

  // Client-side wallet validation before even opening the PIN modal
  if (wallet) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      alert('Invalid Ethereum address format (must be 0x + 40 hex chars)'); return;
    }
    if (wallet.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
        wallet.toLowerCase() === '0x000000000000000000000000000000000000dead') {
      alert('Cannot use zero or dead wallet as destination'); return;
    }
  }

  openPinModal(async (pin) => {
    const body = { pin };
    if (wallet)   body.destinationWallet = wallet;
    if (target)   body.balanceTarget     = parseFloat(target);
    if (limit)    body.withdrawalLimit   = parseFloat(limit);
    if (minAmt)   body.minWithdrawal     = parseFloat(minAmt);
    if (cooldown) body.cooldownHours     = parseFloat(cooldown);

    const r = await apiFetch('/withdrawal/config', 'POST', body);
    if (!r || r.error) { pinShowError(r?.error || 'Save failed'); return; }
    closePinModal();
    document.getElementById('withdrawal-config-form').style.display = 'none';
    if (wallet) document.getElementById('wd-wallet').value = '';
    await loadWithdrawalConfig();
  });
}

function withdrawalCheckNow() {
  openPinModal(async (pin) => {
    const r = await apiFetch('/withdrawal/check', 'POST', { pin });
    if (!r) { pinShowError('Request failed'); return; }
    if (r.error && r.error !== 'skipped') { pinShowError(r.error); return; }
    closePinModal();
    if (r.executed) {
      alert('Sent $' + r.amount.toFixed(2) + ' USDC.e\nTx: ' + r.txHash);
    } else if (r.skipped) {
      alert('Skipped: ' + r.skipped);
    }
    await loadWithdrawalConfig();
  });
}

// ─── PIN modal logic ──────────────────────────────────────────────────────────

let _pinBuffer       = [];   // entered digits (max 4)
let _pinCallback     = null; // function(pin) called on success
let _pinLocked       = false; // true while submitting or waiting 1s rate-limit
let _pinRateLimitUntil = 0;

// Noise chars for scramble — no digits to avoid hint about entered digit
const _PIN_NOISE = '@#!$%&*?~^+=-ABCDEFXZabcdefxz';

function openPinModal(callback) {
  _pinBuffer   = [];
  _pinCallback = callback;
  _pinLocked   = false;
  document.getElementById('wd-pin-display').textContent = '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF';
  document.getElementById('wd-pin-display').style.color = '#e2e8f0';
  document.getElementById('wd-pin-msg').textContent = '';
  document.getElementById('wd-pin-dialog').style.animation = 'none';
  const modal = document.getElementById('wd-pin-modal');
  modal.classList.add('open');
  setPinBtnsDisabled(false);
}

function closePinModal() {
  document.getElementById('wd-pin-modal').classList.remove('open');
  _pinBuffer   = [];
  _pinCallback = null;
  _pinLocked   = false;
}

function pinShowError(msg) {
  document.getElementById('wd-pin-msg').textContent = msg;
  const dialog = document.getElementById('wd-pin-dialog');
  // Trigger shake: force reflow to restart animation
  dialog.style.animation = 'none';
  // eslint-disable-next-line no-unused-expressions
  dialog.offsetHeight;
  dialog.style.animation = 'pinShake 0.42s ease';
  // Rate-limit: lock buttons for 1s
  _pinLocked = true;
  setPinBtnsDisabled(true);
  _pinRateLimitUntil = Date.now() + 1000;
  setTimeout(() => {
    _pinBuffer   = [];
    _pinLocked   = false;
    document.getElementById('wd-pin-display').textContent = '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF';
    document.getElementById('wd-pin-display').style.color = '#e2e8f0';
    setPinBtnsDisabled(false);
  }, 1000);
}

function pinDigit(d) {
  if (_pinLocked) return;
  if (Date.now() < _pinRateLimitUntil) return;
  if (_pinBuffer.length >= 4) return; // PIN is exactly 4 digits
  _pinBuffer.push(d);
  _pinScramble();
  // Auto-submit at 4 digits after scramble animation completes
  if (_pinBuffer.length === 4) {
    _pinLocked = true;
    setPinBtnsDisabled(true);
    setTimeout(_pinSubmit, 200);
  }
}

function pinBackspace() {
  if (_pinLocked) return;
  if (_pinBuffer.length > 0) { _pinBuffer.pop(); _pinScramble(); }
}

function pinClear() {
  if (_pinLocked) return;
  _pinBuffer = [];
  document.getElementById('wd-pin-display').textContent = '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF';
  document.getElementById('wd-pin-display').style.color = '#e2e8f0';
  document.getElementById('wd-pin-msg').textContent = '';
}

function _pinScramble() {
  // Three-phase animation — always shows 8 characters, never reveals digit or count
  const disp = document.getElementById('wd-pin-display');
  const rndChar = () => _PIN_NOISE[Math.floor(Math.random() * _PIN_NOISE.length)];
  // Phase 1 (0ms): full random noise, blue tint
  disp.style.color = '#63b3ed';
  disp.textContent = Array.from({length: 8}, rndChar).join('');
  // Phase 2 (90ms): half settled back to bullets, half still noise
  setTimeout(() => {
    disp.style.color = '#a0aec0';
    disp.textContent = Array.from({length: 8}, (_, i) => (i % 2 === 0 ? '\u25CF' : rndChar())).join('');
  }, 90);
  // Phase 3 (175ms): all bullets, normal colour
  setTimeout(() => {
    disp.style.color = '#e2e8f0';
    disp.textContent = '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF';
  }, 175);
}

async function _pinSubmit() {
  if (!_pinCallback) { closePinModal(); return; }
  const pin = _pinBuffer.join('');
  await _pinCallback(pin);
  // If callback did NOT close the modal (e.g. wrong PIN handled via pinShowError),
  // ensure lock state is handled — pinShowError sets _pinLocked and resets after 1s
}

function setPinBtnsDisabled(disabled) {
  document.querySelectorAll('.pin-btn').forEach(b => { b.disabled = disabled; });
}

// Keyboard support for PIN modal
document.addEventListener('keydown', function(e) {
  if (!document.getElementById('wd-pin-modal').classList.contains('open')) return;
  if (e.key >= '0' && e.key <= '9') { e.preventDefault(); pinDigit(e.key); }
  else if (e.key === 'Backspace')   { e.preventDefault(); pinBackspace(); }
  else if (e.key === 'Escape')      { e.preventDefault(); closePinModal(); }
  else if (e.key === 'Delete')      { e.preventDefault(); pinClear(); }
});

// Load withdrawal config on page load
(function() {
  function tryLoadWithdrawal() {
    if (document.getElementById('wd-summary')) loadWithdrawalConfig();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryLoadWithdrawal);
  } else {
    tryLoadWithdrawal();
  }
})();
</script>

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
