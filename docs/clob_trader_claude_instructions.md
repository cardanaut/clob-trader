# CLOB Trader — Claude Code Handoff Instructions

> Read this entire document before starting any development work.
> Updated: 2026-04-07

---

## 1. Project Overview

**CLOB Trader** is a standalone fork of the **PolyChamp** project. It trades the same T1000 candle-momentum strategy but is deployed under a separate sub-path with its own backend port and GitHub repo.

Key differences from PolyChamp:
- No paper-trading toggle — always LIVE
- No top-traders leaderboard
- Port **55551** (polychamp uses 55550)
- URL prefix `/clob_trader/` and API prefix `/clob-api/`
- GitHub repo: `cardanaut/clob-trader` (SSH alias `github-cardanaut`)
- Adds **Rejection Trading** feature (see Section 6)

The T1000 strategy and engine are identical to polychamp. All strategy notes in the polychamp `MEMORY.md` apply here too.

---

## 2. Directory Structure

```
/var/www/jeer.currenciary.com/clob_trader/
├── backend/
│   ├── .env                        # API keys, passwords (gitignored)
│   ├── package.json
│   ├── src/
│   │   ├── api/
│   │   │   ├── server.js           # Express app entrypoint (port 55551)
│   │   │   └── routes/
│   │   │       ├── spike.js        # /spike/* routes
│   │   │       ├── t1000.js        # /t1000/* routes (main trading API)
│   │   │       ├── simulator.js    # /sim/* routes
│   │   │       └── withdrawal.js   # /withdrawal/* routes
│   │   ├── t1000/
│   │   │   ├── t1000-engine.js     # Core trading engine (state machine)
│   │   │   └── sub-candle-generator.js
│   │   ├── spike/
│   │   │   ├── engine.js           # Spike detection engine
│   │   │   ├── config.js
│   │   │   ├── clob-websocket.js   # Polymarket WebSocket feed
│   │   │   └── kalshi-websocket.js # Kalshi WebSocket feed
│   │   ├── trader/
│   │   │   ├── polymarket.js       # Polymarket CLOB order placement
│   │   │   ├── kalshi-trader.js    # Kalshi order placement
│   │   │   └── usdc-withdrawal.js  # Auto-withdrawal module
│   │   ├── database/
│   │   │   ├── connection.js       # SQLite connection
│   │   │   ├── queries.js          # Query helpers
│   │   │   └── migrations/         # SQL migration files (008–021)
│   │   ├── utils/
│   │   │   ├── config.js
│   │   │   └── logger.js
│   │   └── strategies/
│   │       └── backtest.js
│   ├── scripts/
│   │   ├── simulate_combined.js    # CURRENT simulator (Polymarket + Kalshi)
│   │   ├── simulate_kalshi.js      # Kalshi standalone simulator
│   │   ├── backfill_t1000.js       # Applies autoscan results to live state
│   │   └── ...                     # Research/utility scripts
│   ├── data/
│   │   └── simulator_settings.json # SIM2 settings
│   ├── logs/
│   │   └── autoscan_v2.json        # Written by simulate_combined -as
│   ├── config/
│   │   ├── wallets.json            # (gitignored)
│   │   └── withdrawal.json         # (gitignored)
│   └── database/
│       └── polychamp.db            # SQLite database (gitignored)
├── frontend/
│   ├── includes/
│   │   ├── config.php              # Defines BASE_PATH = '/clob_trader/frontend'
│   │   ├── loader.php              # Loads config.php, sets asset base
│   │   ├── header.php              # Nav, favicon — uses BASE_PATH
│   │   └── footer.php
│   ├── pages/
│   │   └── t1000-trading.php       # Main trading UI (2800+ lines)
│   └── assets/
│       ├── js/
│       │   ├── t1000-core.js       # API_BASE, apiFetch, pollState, state mgmt
│       │   ├── t1000-positions.js  # Open positions panel, pollLivePrices
│       │   ├── t1000-trades.js     # Activity log, ALL TRADES paginated
│       │   ├── t1000-charts.js     # Balance/PnL charts
│       │   ├── t1000-rejection.js  # Rejection stats + rejection-trade panel
│       │   ├── t1000-settings.js   # Settings form (LIVE, MINI, CB, etc.)
│       │   └── t1000-export.js     # CSV export
│       └── css/
└── docs/
    └── clob_trader_claude_instructions.md  # THIS FILE
```

**Live state file**: `/var/www/jeer.currenciary.com/polychamp/logs/t1000-state.json`
— This is the **polychamp** logs directory, shared. Both projects read/write the same state file.
Actually: the clob_trader has its own state. Check `/var/www/jeer.currenciary.com/clob_trader/` for a `logs/` dir, or confirm in `t1000-engine.js` `STATE_FILE` constant.

---

## 3. Deployment

### PM2

```
clob-trader-api  (PM2 id 11)
  script: backend/src/api/server.js
  port:   55551
  cwd:    /var/www/jeer.currenciary.com/clob_trader/backend
```

Commands:
```bash
pm2 restart clob-trader-api
pm2 logs clob-trader-api --lines 50
pm2 stop clob-trader-api
pm2 start clob-trader-api
```

**CRITICAL**: Stop the PM2 process before directly editing `logs/t1000-state.json`.

### Nginx

The nginx config adds two location blocks (applied to the existing server block for `jeer.currenciary.com`):

```nginx
# clob_trader PHP frontend
location /clob_trader/ {
    alias /var/www/jeer.currenciary.com/clob_trader/;
    index index.php;
    try_files $uri $uri/ =404;

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.1-fpm.sock;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $request_filename;
    }
}

# clob_trader backend API
location /clob-api/ {
    proxy_pass http://127.0.0.1:55551/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 120s;
}
```

### Ports Summary

| Project | Backend Port | API nginx prefix |
|---|---|---|
| polychamp | 55550 | `/api/` |
| clob_trader | 55551 | `/clob-api/` |

---

## 4. Environment (.env)

Location: `backend/.env` (gitignored, permissions 600)

Required variables:
```
PORT=55551
API_PASSWORD=<password>
POLY_API_KEY=...
POLY_API_SECRET=...
POLY_API_PASSPHRASE=...
POLY_SIGNER_KEY=...
POLY_CLOB_HOST=https://clob.polymarket.com
POLY_CHAIN_ID=137
SPIKE_TRADING_MODE=PAPER   # or LIVE
ENABLE_LIVE_TRADING=true
NTFY_TOPIC=jspiketrader
```

dotenv is loaded in `server.js` line 1:
```javascript
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
// __dirname = backend/src/api/ → ../../.env = backend/.env
```

---

## 5. Frontend Architecture

### BASE_PATH and API_BASE

Two critical constants control all URLs:

**`frontend/includes/config.php`**:
```php
define('BASE_PATH', '/clob_trader/frontend');
```
Used in all PHP templates for asset/page hrefs.

**`frontend/assets/js/t1000-core.js`** (top of file):
```javascript
const API_BASE = 'https://jeer.currenciary.com/clob-api';
```
Used in all `apiFetch()` calls across all JS modules.

### JS Module Load Order

`t1000-trading.php` loads these scripts in this order:
1. `t1000-core.js` — defines `apiFetch`, `state`, `pollState`, etc.
2. `t1000-positions.js` — defines `pollLivePrices`, position rendering
3. `t1000-trades.js` — activity log, paginated trades
4. `t1000-charts.js` — chart rendering
5. `t1000-rejection.js` — rejection stats + rejection-trade checkboxes
6. `t1000-export.js` — CSV export
7. `t1000-settings.js` — settings form save/load

**IMPORTANT**: All inter-module calls (e.g., calling `pollLivePrices` from core.js, or `renderRejectedStats` from core.js) must be wrapped in a `DOMContentLoaded` listener to ensure all scripts are loaded before calling functions defined in later scripts.

`t1000-core.js` init block:
```javascript
document.addEventListener('DOMContentLoaded', () => {
  switchSection('LIVE');
  pollState();
  setInterval(pollState, 4000);
  pollLivePrices();
  setInterval(pollLivePrices, 2000);
  setInterval(updatePositionGauges, 1000);
});
```

---

## 6. Rejection Trading Feature (Phase 3)

This is the main clob_trader-specific feature added on top of polychamp.

### Concept

Normally when a signal is filtered out (rejected) by a filter check, the engine skips it. With rejection trading, certain filter rejections can be **overridden** to trade anyway.

### State field

In `t1000-engine.js`, `defaultState()` for LIVE includes:
```javascript
rejTradeReasons: [],
// Overrideable reasons: time_filter, coord_wait, weak_body, weak_t1_body,
//                       weak_tc_body, price_too_high, price_too_low, price_out_of_range
```

### Overrideable reasons (can be in `rejTradeReasons`)

| Reason | Filter bypassed |
|---|---|
| `time_filter` | skipHours / skipDow hour filter |
| `coord_wait` | Coordination buffer (multi-crypto wait) |
| `weak_body` | T0 candle body < bodyPct threshold |
| `weak_t1_body` | T1 entry body check |
| `weak_tc_body` | TC entry body check |
| `price_too_high` | T0 price > maxPrice |
| `price_too_low` | T0 price < minPrice |
| `price_out_of_range` | T1/TC price out of acceptable range |

### Safety reasons (NEVER overrideable)

`circuit_breaker`, `drawdown_limit`, `max_positions`, `no_liquidity`, `below_threshold`

### Engine override pattern (T0 example — `weak_body`)

```javascript
const _rejOrWB = key === 'LIVE' && (strat.rejTradeReasons ?? []).includes('weak_body');
if (isLive) logger.info(`[t1000] ${key} ${crypto} ${_rejOrWB ? 'OVERRIDE' : 'SKIP'} weak_body ...`);
if (!_rejOrWB) {
  if (key === 'LIVE') recordRejected(...);
  continue;
}
```

### `coord_wait` override

The entire coordination buffer block is conditionally run:
```javascript
if (key === 'LIVE' && (strat.coordMinCryptos ?? 0) > 1 && !(strat.rejTradeReasons ?? []).includes('coord_wait')) {
  // buffer logic
}
```

### API to toggle

`POST /t1000/config` with body `{ strategy: 'LIVE', rejTradeReasons: ['weak_body', 'price_too_high'] }`

### Frontend UI

`t1000-rejection.js` renders a panel `#rej-trade-panel` (div in `t1000-trading.php`) with:
- One checkbox per overrideable reason (only shown if that reason has stats data)
- Shows WR%, FP%, signal count per reason
- Calls `apiFetch('/t1000/config', 'POST', { strategy: 'LIVE', rejTradeReasons: current })` on toggle
- `toggleRejTrade(checkbox)` function handles the toggle

---

## 7. Backend API Routes

### Direct routes in `server.js`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | System health check |
| GET | `/trades` | No | All DB trades |
| GET | `/wallets` | No | Top wallets |
| GET | `/markets` | No | Market data |
| POST | `/backtest/run` | Yes | Run backtest |
| GET | `/stats/summary` | No | Stats summary |
| GET | `/trader/config` | No | Trader config |
| POST | `/trader/config` | Yes | Update trader config |
| GET | `/trader/balance` | No | Current balance |
| GET | `/trader/positions` | No | Open positions |
| GET | `/trader/log` | No | Activity log |
| DELETE | `/trader/log` | Yes | Clear log |
| GET | `/account/trades` | No | Account trades |

### Delegated to route modules

**`routes/t1000.js`** — `/t1000/*`
- `GET /t1000/state` — full engine state for all strategies
- `POST /t1000/config` — update strategy config (rejTradeReasons, thresholds, etc.)
- `POST /t1000/start` / `POST /t1000/stop` — toggle LIVE trading
- `POST /t1000/reset-balance` — reset strategy balance
- `GET /t1000/live-trades` — paginated live trade history from DB
- `DELETE /t1000/live-trades/:id` — delete a trade record
- `POST /t1000/backfill` — trigger backfill (reads autoscan JSON, patches state)

**`routes/spike.js`** — `/spike/*`
- Spike detection config, manual test, pause/resume

**`routes/simulator.js`** — `/sim/*`
- SIM2 simulator run, progress, settings

**`routes/withdrawal.js`** — `/withdrawal/*`
- Salary/withdrawal config and manual trigger

### Route module registration pattern

Each route file exports a function:
```javascript
module.exports = function register<Name>Routes(app, { authMiddleware, ...deps }) { ... };
```
Called in `server.js`:
```javascript
require('./routes/t1000')(app, { authMiddleware, t1000Engine, ... });
```

---

## 8. T1000 Engine Key Concepts

Identical to polychamp engine. Summary of key points:

### Strategy keys
- `LIVE` — live Polymarket trading
- `LIVE_KALSHI` — live Kalshi trading (15m only)
- `LIVE_MINI` — parallel sub-strategy, inherits signal settings from LIVE, smaller position size
- `C65`–`C95`, `C150`–`C225` — backtesting/simulation strategy variants

### Active candle sizes (as of Mar 7 2026)
```
CANDLE_SIZES_5M  = [65,70,75,80,81,82,83,84,85,86,87,88,89,90,91,92,95]
CANDLE_SIZES_15M = [150,157,159,161,163,165,167,169,171,173,175,180,195,210,225]
```

### Key state fields per strategy
```javascript
{
  enabled: bool,
  balance: number,           // USDC balance (resynced from activityLog on startup)
  riskPct: 0.05,             // fraction (5%) — NEVER 5, always 0.05
  maxPositions: 1,
  maxPrice: 0.89,
  minThreshold: number,      // candle body % threshold for spike detection
  t0off: bool,               // disable T0 entries
  t1Mode: bool,              // allow T1 entries (miss at T0, enter at T1)
  bodyPct: 0.76,             // minimum body/range ratio
  skipHours: [],             // UTC hours to skip
  skipDow: [],               // day-of-week to skip (0=Sun)
  circuitBreaker: { enabled, cooldownMinutes },
  drawdownLimit: { enabled, maxLosses, windowHours },
  rejTradeReasons: [],       // CLOB-TRADER SPECIFIC — see Section 6
}
```

### Scoring formula (simulator/backfill)
```
score = wins / (total + 3)   // pessimistic WR — penalises small samples
```

---

## 9. Simulator Workflow

```bash
# Run full autoscan (no-filter, best strategy per crypto per timeframe)
node backend/scripts/simulate_combined.js -nf -as -t1 -maxpos 1

# Then in the UI, click "Apply SIM2 Autoscan" — this triggers:
#   1. POST /t1000/backfill with BACKFILL_SKIP_RESCAN=1
#   2. Reads backend/logs/autoscan_v2.json
#   3. Patches logs/t1000-state.json with best strategies + scores
```

---

## 10. GitHub / SSH

- Repo: `cardanaut/clob-trader`
- SSH alias: `github-cardanaut` → uses `~/.ssh/id_cardanaut` private key
- Push: `git remote set-url origin git@github-cardanaut:cardanaut/clob-trader.git`

---

## 11. Known Quirks & History

1. **`database/` directory** was missing from the initial rsync copy from polychamp. It was manually copied. If you see `Cannot find module '../database/queries'` errors, ensure `backend/src/database/` exists with `connection.js` and `queries.js`.

2. **Route file require paths**: All files in `backend/src/api/routes/` must use `../../` to reach modules in `backend/src/` (not `../`). E.g., `require('../../t1000/t1000-engine')`.

3. **dotenv path**: `server.js` at `src/api/server.js` uses `'../../.env'` which correctly resolves to `backend/.env`. Using `'../../../.env'` would go too far up.

4. **API_BASE in JS**: All `apiFetch()` calls go to `https://jeer.currenciary.com/clob-api` (NOT `/api` — that's polychamp). Do not change this.

5. **BASE_PATH in PHP**: All asset URLs in PHP templates must use `BASE_PATH` constant from `includes/config.php`. Do not hardcode `/assets/`.

6. **`DOMContentLoaded` requirement**: `t1000-core.js` calls functions defined in other modules (e.g., `pollLivePrices` from `t1000-positions.js`). These calls must be inside a `DOMContentLoaded` listener to avoid `ReferenceError`.

7. **SQLite not PostgreSQL**: Despite `pg` being in `package.json` (inherited from polychamp), the actual DB is SQLite (`backend/database/polychamp.db`). The `pg` package is unused.

8. **`t1000-trades.js` brace balance**: Was fixed (missing `}` at line ~535 in `deleteHistoryEntry`). If you see "Unexpected end of input" errors from this file, recheck brace balance.

---

## 12. Development Workflow

1. Edit files
2. `pm2 restart clob-trader-api` if you changed any backend JS
3. Hard-refresh browser (Ctrl+Shift+R) for frontend changes
4. Check logs: `pm2 logs clob-trader-api --lines 50`
5. If editing `logs/t1000-state.json` directly: `pm2 stop` → edit → `pm2 start`
6. Commit + push: `git push github-cardanaut main` (SSH alias required)

---

## 13. Related Project

**PolyChamp** at `/var/www/jeer.currenciary.com/polychamp/` is the parent project. It has:
- Full polychamp MEMORY.md (`/home/adminweb/.claude/projects/-var-www-jeer-currenciary-com-polychamp/memory/MEMORY.md`)
- Full strategy notes, bugs-fixed list, simulator notes
- All the same engine logic — clob_trader is a fork, so engine bugs fixed in one may need porting to the other

When working on clob_trader, open a new Claude Code session **in** `/var/www/jeer.currenciary.com/clob_trader/` or tell Claude the working directory is there. The memory context will load polychamp's MEMORY.md which is still valid for strategy/engine knowledge.
