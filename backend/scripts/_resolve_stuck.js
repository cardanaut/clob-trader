'use strict';
// One-off: fetch outcomes for stuck OPEN trades, update pm_outcomes cache, then force-resolve
const axios = require('axios');
const fs    = require('path');
const path  = require('path');

const CACHE  = path.join(__dirname, '../cache/pm_outcomes.json');
const STATE  = path.join(__dirname, '../../logs/t1000-state.json');

async function getOutcome(slug) {
  const r = await axios.get('https://gamma-api.polymarket.com/markets', { params: { slug }, timeout: 8000 });
  const m = r.data && r.data[0];
  if (!m || !m.closed) return null;
  const prices = JSON.parse(m.outcomePrices || '[]');
  const winIdx = prices.findIndex(v => parseFloat(v) === 1);
  return winIdx === 0 ? 'UP' : winIdx === 1 ? 'DOWN' : null;
}

async function main() {
  // 1. Load state
  const state = JSON.parse(require('fs').readFileSync(STATE, 'utf8'));
  const open  = (state.LIVE.activityLog || []).filter(e => e.status === 'OPEN');
  if (!open.length) { console.log('No OPEN trades.'); return; }

  // 2. Load pm_outcomes cache
  const pm = JSON.parse(require('fs').readFileSync(CACHE, 'utf8'));

  // 3. Fetch outcomes for each stuck trade
  let changed = false;
  for (const e of open) {
    const cycleMs  = (e.candle_size >= 150) ? 900000 : 300000;
    const durSecs  = cycleMs / 1000;
    const csSecs   = Math.round(e.cycleStart / 1000);
    const pmKey    = `${e.crypto}_${csSecs}_${durSecs}`;
    const mins     = cycleMs === 900000 ? 15 : 5;
    const prefix   = e.crypto.toLowerCase() + `-updown-${mins}m`;
    const slug     = `${prefix}-${csSecs}`;

    console.log(`Fetching: ${slug}`);
    const outcome = await getOutcome(slug);
    console.log(`  ${pmKey} => ${outcome}`);

    if (outcome === 'UP' || outcome === 'DOWN') {
      pm[pmKey] = outcome;
      const isWin = e.direction === outcome;
      e.status = isWin ? 'WIN' : 'LOSS';
      if (!isWin) {
        e.pnl = -Math.abs(e.position || 0);
        state.LIVE.losses = (state.LIVE.losses || 0) + 1;
        state.LIVE.balance = parseFloat(((state.LIVE.balance || 0) + e.pnl).toFixed(6));
      } else {
        e.pnl = null; // deferred until redemption
        state.LIVE.wins = (state.LIVE.wins || 0) + 1;
      }
      console.log(`  => ${e.tradeId}: ${e.status} (dir=${e.direction})`);
      changed = true;
    } else {
      console.log(`  => market not resolved yet — leaving OPEN`);
    }
  }

  if (!changed) { console.log('No resolutions found.'); return; }

  // 4. Write updated cache and state
  require('fs').writeFileSync(CACHE, JSON.stringify(pm, null, 2));
  require('fs').writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log('\nCache and state updated. Restarting API...');
}

main().catch(e => { console.error(e.message); process.exit(1); });
