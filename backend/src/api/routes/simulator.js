// ── CLOB Trader — Simulator + backfill + candles routes ──
'use strict';
const fs            = require('fs');
const path          = require('path');
const { execFile }  = require('child_process');
const logger        = require('../utils/logger');

module.exports = function registerSimulatorRoutes(app, { authMiddleware, t1000Engine }) {

// ─── Simulator UI routes ──────────────────────────────────────────────────────

const SIM_SETTINGS_PATH = require('path').join(__dirname, '../../data/simulator_settings.json');

/** GET /simulator/settings — return stored simulator UI settings */
app.get('/simulator/settings', (req, res) => {
  try {
    const data = JSON.parse(require('fs').readFileSync(SIM_SETTINGS_PATH, 'utf8'));
    res.json(data);
  } catch {
    res.json({});
  }
});

/** POST /simulator/settings — persist simulator UI settings to disk */
app.post('/simulator/settings', authMiddleware, (req, res) => {
  try {
    const dir = require('path').dirname(SIM_SETTINGS_PATH);
    const fss = require('fs');
    if (!fss.existsSync(dir)) fss.mkdirSync(dir, { recursive: true });
    fss.writeFileSync(SIM_SETTINGS_PATH, JSON.stringify(req.body || {}, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const SIM_V2_SETTINGS_PATH = require('path').join(__dirname, '../../data/simulator_v2_settings.json');

/** GET /simulator/v2/settings — return stored V2+ simulator UI settings */
app.get('/simulator/v2/settings', (req, res) => {
  try { res.json(JSON.parse(require('fs').readFileSync(SIM_V2_SETTINGS_PATH, 'utf8'))); }
  catch { res.json({}); }
});

/** POST /simulator/v2/settings — persist V2+ simulator UI settings to disk */
app.post('/simulator/v2/settings', authMiddleware, (req, res) => {
  try {
    require('fs').writeFileSync(SIM_V2_SETTINGS_PATH, JSON.stringify(req.body || {}, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const SIM_HISTORY_PATH = require('path').join(__dirname, '../../data/simulator_history.json');
const fssH = require('fs');

/** GET /simulator/history — return saved sim-history array */
app.get('/simulator/history', (req, res) => {
  try { res.json(JSON.parse(fssH.readFileSync(SIM_HISTORY_PATH, 'utf8'))); }
  catch { res.json([]); }
});

/** POST /simulator/save-history — prepend entry { settings, metrics } (max 30) */
app.post('/simulator/save-history', authMiddleware, (req, res) => {
  try {
    let hist = [];
    try { hist = JSON.parse(fssH.readFileSync(SIM_HISTORY_PATH, 'utf8')); } catch {}
    hist.unshift({ savedAt: new Date().toISOString(), ...req.body });
    if (hist.length > 30) hist.length = 30;
    fssH.writeFileSync(SIM_HISTORY_PATH, JSON.stringify(hist, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /simulator/history/delete — remove entry by index */
app.post('/simulator/history/delete', authMiddleware, (req, res) => {
  try {
    let hist = [];
    try { hist = JSON.parse(fssH.readFileSync(SIM_HISTORY_PATH, 'utf8')); } catch {}
    const i = parseInt(req.body?.index);
    if (!isNaN(i) && i >= 0 && i < hist.length) hist.splice(i, 1);
    fssH.writeFileSync(SIM_HISTORY_PATH, JSON.stringify(hist, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET /simulator/last-result — return last saved simulator result */
app.get('/simulator/last-result', (req, res) => {
  try {
    const data = JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '../../data/simulator_last_result.json'), 'utf8'));
    res.json(data);
  } catch {
    res.json({});
  }
});

/** POST /simulator/run — run simulate_combined.js with given options, return structured JSON */
app.post('/simulator/run', authMiddleware, (req, res) => {
  const { execFile } = require('child_process');
  const os  = require('os');
  const fss = require('fs');
  const scriptPath  = require('path').join(__dirname, '../../scripts/simulate_combined.js');
  const jsonOutPath = require('path').join(os.tmpdir(), `sim_result_${Date.now()}.json`);

  const body = req.body || {};
  const useAutoscan = body.autoscan !== false;  // default true; false = fast triomap mode

  // Build base args: full autoscan OR fast triomap from saved autoscan_v2.json
  let v2data = null;
  let t5 = {}, t15 = {};
  const args = ['--stack-size=65536', scriptPath];
  if (useAutoscan) {
    args.push('-as', '-nf');
  } else {
    const autoscanPath = require('path').join(__dirname, '../../logs/autoscan_v2.json');
    try { v2data = JSON.parse(fss.readFileSync(autoscanPath, 'utf8')); } catch {}
    // Use body-supplied trios if provided (user tweaked them in UI), else fall back to saved autoscan
    t5 = body.trio5m || v2data?.trio5m || {}; t15 = body.trio15m || v2data?.trio15m || {};
    const parts = [];
    for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
      if (t5[cr])  parts.push(`${cr}:${t5[cr].period}:${t5[cr].th}`);
      if (t15[cr]) parts.push(`${cr}:${t15[cr].period}:${t15[cr].th}`);
    }
    if (!parts.length) return res.status(400).json({ error: 'No saved autoscan trios. Run full autoscan first.' });
    args.push('-triomap', parts.join(','), '-nf');
  }

  if (body.bl     != null) args.push('-bl',     String(body.bl));
  if (body.rk     != null) args.push('-rk',     String(body.rk));
  if (body.mn     != null) args.push('-mn',     String(body.mn));
  if (body.mx     != null) args.push('-mx',     String(body.mx));
  if (body.th     != null) args.push('-th',     String(body.th));
  if (body.maxpos != null) args.push('-maxpos', String(body.maxpos));
  if (body.slip   != null) args.push('-slip',   String(body.slip));
  if (body.body   != null) args.push('-body',   String(body.body));
  if (body.minwr  != null) args.push('-minwr',  String(body.minwr));
  if (body.minth  != null) args.push('-minth',  String(body.minth));
  if (body.tp     != null) args.push('-tp',     String(body.tp));
  if ('t1standalone' in body || 't1Mode' in body) {
    // New two-field model (SIM2): t1standalone=T1, t1Mode=TC
    const hasT1 = !!body.t1standalone, hasTC = !!body.t1Mode;
    if      (hasT1 && hasTC) args.push('-t1both');
    else if (hasT1)          args.push('-t1both', '-tcoff');
    else if (hasTC)          args.push('-t1');
  } else {
    // Classic SIM model
    if (body.t1both)                     args.push('-t1both');
    else if (body.t1tc)                  args.push('-t1tc');
    else if (body.t1)                    args.push('-t1');
    else if (body.t1_5m && body.t1_15m) args.push('-t1');
    else if (body.t1_5m)                 args.push('-t15m');
    else if (body.t1_15m)                args.push('-t115m');
  }
  // Never disable T0 in autoscan (full or fast): T1/TC entries need 1-min Binance candle
  // data that covers only the last ~3.5 days. Historical signals have sig.t1=null → 0 trades.
  // Autoscan always runs T0 mode to score the full dataset for period/threshold selection.
  // t0off is a LIVE trading preference — never applied to sweep/backtest scoring.
  // (full autoscan: useAutoscan=true — fast scan: useAutoscan=false — both excluded here)
  if (body.t1off)          args.push('-t1off');
  if (body.tcoff)          args.push('-tcoff');
  if (body.nth)            args.push('-nth');
  if (body.t1adj  != null) args.push('-t1adj',  String(body.t1adj));
  if (body.t2)             args.push('-t2');
  if (body.t2adj  != null) args.push('-t2adj',  String(body.t2adj));
  if (body.df)             args.push('-df',     String(body.df));
  if (body.dt)             args.push('-dt',     String(body.dt));
  if (body.cr)             args.push('-cr',     String(body.cr));
  if (body.day    != null) args.push('-day',    String(body.day));
  if (body.kal)            args.push('-kal');
  if (body.cb     != null && body.cb > 0)   args.push('-cb',   String(body.cb));
  if (body.dl_n   != null && body.dl_n > 0 && body.dl_h != null && body.dl_h > 0) {
    const dlP = body.dl_p != null && body.dl_p > 0 ? `,${body.dl_p}` : '';
    args.push('-dl', `${body.dl_n},${body.dl_h}${dlP}`);
  }
  if (body.mxt1       != null && body.mxt1       > 0) args.push('-mxt1',       String(body.mxt1));
  if (body.distmin5m  != null && body.distmin5m  > 0) args.push('-distmin5m',  String(body.distmin5m));
  if (body.distmin15m != null && body.distmin15m > 0) args.push('-distmin15m', String(body.distmin15m));
  if (body.distdrop   != null)                        args.push('-distdrop',   String(body.distdrop));
  for (const cr of ['BTC','ETH','SOL','XRP']) {
    const v = body[`vol_${cr.toLowerCase()}`];
    if (v != null && v > 0) args.push(`-vol-${cr}`, String(v));
  }
  if (body.oor) args.push('-oor');
  if (body.exhaust5m  != null && body.exhaust5m  > 0) args.push('-exhaust5m',  String(body.exhaust5m));
  if (body.exhaust15m != null && body.exhaust15m > 0) args.push('-exhaust15m', String(body.exhaust15m));
  if (body.dir        != null && body.dir !== 'both') args.push('-dir',         String(body.dir));
  if (body.skipHours  != null && body.skipHours !== '') args.push('-skip-hours', String(body.skipHours));
  if (body.skipDow    != null && body.skipDow   !== '') args.push('-skip-dow',   String(body.skipDow));
  if (body.coord      != null && body.coord      > 0)   args.push('-coord',     String(body.coord));
  if (body.bots       != null && parseInt(body.bots) > 1) {
    args.push('--bots', String(body.bots));
    if (body.botBalances) args.push('--bot-balances', String(body.botBalances));
  }

  args.push('-json-out', jsonOutPath);

  execFile(process.execPath, args,
    { cwd: require('path').join(__dirname, '../../'), env: process.env, timeout: 180_000 },
    (err, stdout, stderr) => {
      let result = null;
      try { result = JSON.parse(fss.readFileSync(jsonOutPath, 'utf8')); } catch {}
      try { fss.unlinkSync(jsonOutPath); } catch {}
      if (err && !result) {
        logger.error('[api] simulator/run failed', { error: err.message });
        return res.status(500).json({ error: err.message, stderr: (stderr || '').slice(0, 500) });
      }
      if (result) {
        // In fast (triomap) mode, inject autoscan5m/15m from saved autoscan_v2.json so
        // applyToLive() can still read best periods and per-crypto trios.
        // Per-crypto stats (wins/losses/pnl/score) are computed from the actual trades.
        if (!useAutoscan && v2data) {
          const trades = result.unified?.trades || [];
          const mkTop = (best) => best ? { period: parseInt(String(best.period).replace('C', '')), th: best.th, mn: best.mn, mx: best.mx } : undefined;
          const mkTrios = (trio, is15m, quartet) => {
            const out = {};
            for (const cr of ['BTC', 'ETH', 'SOL', 'XRP']) {
              if (!trio?.[cr]) continue;
              const period = parseInt(String(trio[cr].period).replace('C', ''));
              const crTrades = trades.filter(t => t.crypto === cr && (is15m ? t.period >= 150 : t.period < 150));
              const wins   = crTrades.filter(t => t.outcome === 'WIN').length;
              const losses = crTrades.filter(t => t.outcome === 'LOSS').length;
              const total  = wins + losses;
              const pnl    = parseFloat(crTrades.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2));
              const score  = parseFloat((wins / (total + 3)).toFixed(4));
              const q = quartet?.[cr];
              out[cr] = { period, th: trio[cr].th, wins, losses, total, pnl, score,
                mnUP: q?.UP?.mn   ?? null, mnDN: q?.DOWN?.mn ?? null,
                mxUP: q?.UP?.mx   ?? null, mxDN: q?.DOWN?.mx ?? null,
                // per-direction Cxx/th — for UI display ("quartet" columns)
                periodUP: q?.UP?.period ?? null,   thUP: q?.UP?.th   ?? null,
                periodDN: q?.DOWN?.period ?? null, thDN: q?.DOWN?.th ?? null };
            }
            return out;
          };
          if (!result.autoscan5m  && v2data.best5m)  result.autoscan5m  = { top: mkTop(v2data.best5m),  trios: mkTrios(t5,  false, v2data.quartet5m)  };
          if (!result.autoscan15m && v2data.best15m) result.autoscan15m = { top: mkTop(v2data.best15m), trios: mkTrios(t15, true,  v2data.quartet15m) };
          // Inject Kalshi top (best15m) from autoscan_kalshi.json so the header shows the period + score.
          // wins/losses/pnl/trios come from the simulator (autoscanKalshi already in result).
          if (result.autoscanKalshi) {
            try {
              const kalPath = require('path').join(__dirname, '../../logs/autoscan_kalshi.json');
              const kd = JSON.parse(fss.readFileSync(kalPath, 'utf8'));
              if (kd.best15m && !result.autoscanKalshi.top) {
                result.autoscanKalshi.top = mkTop(kd.best15m);
              }
            } catch {}
          }
        }
        // After autoscan: sync trio5m/trio15m in autoscan_v2.json to match SIM2 display
        // trios (printTrioSweep result in result.autoscan5m.trios). The script writes
        // trioMxBest which diverges from printTrioSweep in D2 mode, causing "Apply SIM2
        // Autoscan" to show stale values. Override with display values so both agree.
        if (useAutoscan) {
          try {
            // Sync trio5m/trio15m in autoscan_v2.json with per-crypto optimal periods.
            // Coord check uses cycleStartMs (cycle boundary), not signal detection time —
            // BTC:C65 and SOL:C91 in the same cycle both count for coordination.
            // Per-crypto periods give better WR than forcing a uniform global period.
            const autoscanPath = require('path').join(__dirname, '../../logs/autoscan_v2.json');
            const v2 = JSON.parse(fss.readFileSync(autoscanPath, 'utf8'));
            for (const [cr, row] of Object.entries(result.autoscan5m?.trios || {})) {
              if (!row) continue;
              const mx = v2.trio5m?.[cr]?.mx ?? v2.best5m?.mx ?? 0.89;
              if (!v2.trio5m) v2.trio5m = {};
              v2.trio5m[cr] = { period: row.period, th: row.th, mx };
            }
            for (const [cr, row] of Object.entries(result.autoscan15m?.trios || {})) {
              if (!row) continue;
              const mx = v2.trio15m?.[cr]?.mx ?? v2.best15m?.mx ?? 0.85;
              if (!v2.trio15m) v2.trio15m = {};
              v2.trio15m[cr] = { period: row.period, th: row.th, mx };
            }
            fss.writeFileSync(autoscanPath, JSON.stringify(v2, null, 2));
          } catch {}
        }
        try {
          const lastPath = require('path').join(__dirname, '../../data/simulator_last_result.json');
          fss.writeFileSync(lastPath, JSON.stringify({ result, params: body, ts: new Date().toISOString() }));
        } catch {}
      }
      res.json({ ok: true, result });
    }
  );
});

/** POST /t1000/backfill — re-run backfill script and reload engine state */
app.post('/t1000/backfill', authMiddleware, (req, res) => {
  const { execFile } = require('child_process');
  const scriptPath = require('path').join(__dirname, '../../scripts/backfill_t1000.js');
  const maxPrice   = parseInt(req.body?.maxPrice, 10);
  const env        = {
    ...process.env,
    // Always skip internal rescan: the UI button applies the autoscan the user
    // already ran (via SIM2). Re-running with CB args produces different/worse
    // results and overwrites the user's autoscan_v2.json.
    BACKFILL_SKIP_RESCAN: '1',
    ...(maxPrice >= 50 && maxPrice <= 99 ? { BACKFILL_MAX_PRICE_CAP: String(maxPrice) } : {}),
  };
  execFile(process.execPath, [scriptPath], { cwd: require('path').join(__dirname, '../../'), env }, (err, stdout, stderr) => {
    if (err) {
      logger.error('[api] Backfill failed', { error: err.message });
      return res.status(500).json({ error: err.message, stderr });
    }
    t1000Engine.loadState();
    logger.info('[api] Backfill complete, state reloaded');
    res.json({ ok: true });
  });
});

/** GET /t1000/candles — latest partial OHLC for all cryptos */
app.get('/t1000/candles', (req, res) => {
  try {
    res.json(subCandleGen.getLatestCandles());
  } catch (err) {
    logger.error('[api] GET /t1000/candles error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});


};
