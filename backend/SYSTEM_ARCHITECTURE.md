# Polychamp SpikeTrading System Architecture

**CRITICAL REFERENCE DOCUMENT - READ THIS BEFORE MAKING ANY CHANGES**

## 🚨 CRITICAL RULES - NEVER VIOLATE THESE

### 1. PROXY USAGE - IPRoyal Residential Proxy
**RULE:** IPRoyal proxy is ONLY for CLOB API calls. NEVER apply globally.

**WHY:**
- IPRoyal is residential proxy (limited bandwidth, costs money)
- Only needed to bypass Cloudflare geoblock on clob.polymarket.com
- Gamma API, Binance, other services DON'T need proxy
- Global proxy causes SSL certificate validation errors

**IMPLEMENTATION:**
- ✅ Proxy configured in: `backend/src/spike/clob-http-client.js` (lines 30-49)
- ❌ NEVER patch axios globally in `index.js`
- ❌ NEVER use proxy-preload.js for global patching
- ❌ NEVER set `https.globalAgent` or `http.globalAgent`
- ❌ NEVER add axios interceptors for ALL requests

**CURRENT CORRECT CONFIGURATION:**
```javascript
// backend/src/spike/clob-http-client.js
function createHttpClient() {
  const axiosConfig = {
    baseURL: config.LIVE_TRADING.CLOB_URL,  // ONLY for CLOB
    // ... proxy configured here ONLY for this axios instance
  };
  if (config.CLOB_PROXY.USE_PROXY) {
    const proxyUrl = `${protocol}://${user}:${pass}@${host}:${port}`;
    axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
    axiosConfig.proxy = false;
  }
  return axios.create(axiosConfig);  // Isolated instance
}
```

**SERVICES THAT MUST USE DIRECT CONNECTION (NO PROXY):**
- Gamma API (gamma-api.polymarket.com) - market data
- Binance WebSocket (stream.binance.com) - price candles
- Polymarket Gamma API (gamma-api.polymarket.com) - all market queries
- Database connections (local PostgreSQL)

### 2. EMERGENCY STOP
**RULE:** Emergency stop disables ALL trading. Only enable for critical issues.

**LOCATION:** Database table `spike_settings`, key `emergency_stop`

**CHECK STATUS:**
```javascript
node -e "
const { query } = require('./src/database/connection');
(async () => {
  const result = await query(\"SELECT * FROM spike_settings WHERE setting_key = 'emergency_stop'\");
  console.log(result.rows[0]);
  process.exit(0);
})();
"
```

**DISABLE IF STUCK:**
```javascript
node -e "
const { query } = require('./src/database/connection');
(async () => {
  await query(\"UPDATE spike_settings SET setting_value = 'false' WHERE setting_key = 'emergency_stop'\");
  console.log('Emergency stop disabled');
  process.exit(0);
})();
"
```

**WHEN IT GETS ENABLED:**
- 3+ consecutive trade execution failures
- Balance falls below minimum threshold
- Manual activation via UI

**IMPACT WHEN ENABLED:**
- Signal detection still works
- But ALL trade execution blocked at engine.js:966 and engine.js:1336
- Bot appears to run but does nothing

### 3. SIGNAL DETECTION
**THRESHOLD:** Configured in database `spike_settings`, key `detection_strategy`

**CURRENT:** T123-1MIN-021 = 0.21% threshold

**ENTRY WINDOWS:**
- T+0: Minute 0 of 5-minute cycle (00:00-00:59)
- T+1: Minute 1 of 5-minute cycle (01:00-01:59)
- T+2: Minute 2 of 5-minute cycle (02:00-02:59)

**SIGNAL TRIGGERS WHEN:**
1. Candle movement >= threshold (e.g., 0.21%)
2. Market available for that crypto
3. Within entry window (T+0 to T+2)
4. Crypto enabled in database
5. Emergency stop = false

## 📂 FILE STRUCTURE

### Core Bot Files
```
backend/src/spike/
├── index.js                    # Main entry point (NO proxy patching here)
├── engine.js                   # Signal detection & trade execution
├── detector.js                 # Movement analysis logic
├── clob-api.js                 # Uses clob-http-client for API calls
├── clob-http-client.js         # ⚠️ ONLY file with proxy config
├── gamma-api.js                # Market data (NO proxy)
├── binance-stream.js           # Price candles (NO proxy)
├── config.js                   # Configuration & strategies
├── proxy-preload.js            # DISABLED (just logs message)
└── telegram.js                 # Notifications
```

### Database Tables
```
spike_trades_live              # Live mode trades (real money)
spike_trades_simulated         # Paper mode trades
spike_settings                 # Bot configuration
spike_missed_opportunities     # Logged skipped trades
spike_activity_log            # Event log (signals, trades, etc.)
```

## 🔄 REQUEST FLOW

### CLOB API Requests (via proxy)
```
engine.js
  → clob-api.js
    → clob-http-client.js (with IPRoyal proxy)
      → clob.polymarket.com
```

### Market Data Requests (direct, NO proxy)
```
engine.js
  → gamma-api.js (axios default instance)
    → gamma-api.polymarket.com (direct connection)
```

### Price Candles (direct, NO proxy)
```
engine.js
  → binance-stream.js (WebSocket)
    → stream.binance.com (direct connection)
```

## 🐛 PAST MISTAKES - NEVER REPEAT

### Mistake #1: Global Proxy Application (Feb 2024)
**WHAT HAPPENED:**
- Applied IPRoyal proxy globally via axios.defaults and axios.interceptors
- Caused SSL certificate validation errors on Gamma API
- HTTP 502 errors prevented market price fetching
- Bot detected signals but couldn't execute trades
- Wasted 0.2GB of residential proxy bandwidth
- 3 days of missed trading opportunities

**LESSON:**
- Proxy ONLY in clob-http-client.js
- Never touch axios.defaults globally
- Never use axios.interceptors for all requests
- Each service needs its own axios instance

### Mistake #2: Emergency Stop Left Enabled
**WHAT HAPPENED:**
- Emergency stop was true in database
- Bot appeared to run but did nothing
- No error messages visible to user
- Took debugging to discover

**LESSON:**
- Always check emergency_stop status first when debugging
- Add prominent UI indicator when emergency stop is active

## 🚀 DEPLOYMENT CHECKLIST

When deploying changes:

1. **Check Emergency Stop:**
   ```bash
   # In backend directory:
   node -e "const {query}=require('./src/database/connection');(async()=>{const r=await query(\"SELECT * FROM spike_settings WHERE setting_key='emergency_stop'\");console.log(r.rows[0]);process.exit(0)})();"
   ```

2. **Verify Proxy Configuration:**
   ```bash
   # Should see proxy ONLY for CLOB:
   pm2 restart polychamp-spike
   sleep 5
   tail -50 ~/.pm2/logs/polychamp-spike-out.log | grep -i proxy
   # Should see: "Proxy configured in clob-http-client.js for CLOB API only"
   # Should NOT see: Global agents configured, axios patched, etc.
   ```

3. **Check SSL Errors:**
   ```bash
   # Should be NO certificate errors:
   tail -50 ~/.pm2/logs/polychamp-spike-error.log | grep -i "certificate\|altnames\|ssl"
   ```

4. **Verify Markets Loading:**
   ```bash
   tail -50 ~/.pm2/logs/polychamp-spike-out.log | grep "Found.*markets"
   # Should show market counts, NOT all zeros
   ```

5. **Verify Candles Arriving:**
   ```bash
   # Wait 1 minute, then:
   tail -100 ~/.pm2/logs/polychamp-spike-out.log | grep "📊 Candle"
   # Should see candles with percentages
   ```

## 📊 MONITORING

**Bot is WORKING when:**
- ✅ Mode: LIVE
- ✅ Emergency stop: false
- ✅ Markets: count > 0
- ✅ Candles arriving every minute
- ✅ No SSL/certificate errors
- ✅ Proxy only for CLOB (seen in logs)

**Bot is BROKEN when:**
- ❌ Emergency stop: true
- ❌ Markets: count = 0 for > 5 minutes
- ❌ No candles arriving
- ❌ SSL certificate errors in logs
- ❌ Proxy applied globally
- ❌ HTTP 502 errors on Gamma API

## 🎯 TRADING LOGIC

**Signal Detection:**
1. Binance candle closes with movement >= threshold
2. Check if market exists for that crypto
3. Check if within entry window (T+0 to T+2)
4. Check emergency stop = false
5. Check crypto enabled in database
6. Detect signal direction (UP/DOWN)

**Trade Execution:**
1. Fetch current CLOB balance (via proxy)
2. Get market price from Gamma API (direct, no proxy)
3. Calculate position size (5% of balance, max $150)
4. Check safety limits (max price $0.81, exposure limits)
5. Sign order using SDK (crypto operations)
6. Submit order via clob-http-client.js (with proxy)
7. Log to database and send Telegram notification

## 🔐 AUTHENTICATION

**CLOB API L2 Authentication (HMAC-SHA256):**
```javascript
// Message format:
timestamp + method + path + body

// Signature:
HMAC-SHA256(secret, message) → base64 → URL-safe base64

// URL-safe conversion:
'+' → '-'
'/' → '_'

// Headers:
POLY_ADDRESS: wallet address
POLY_SIGNATURE: URL-safe base64 signature
POLY_TIMESTAMP: unix timestamp
POLY_API_KEY: API key
POLY_PASSPHRASE: API passphrase
```

**CRITICAL:**
- Headers use underscores (POLY_ADDRESS), NOT hyphens
- Query params NOT included in signature message
- Body must be JSON stringified before signing

## 🎨 UI INDICATORS

**Trade Status Chips:**
- `UP ↗ 👍` = UP trade that WON
- `UP ↗ ❌` = UP trade that LOST
- `UP ↗` = UP trade PENDING
- `DOWN ↘ 👍` = DOWN trade that WON
- `DOWN ↘ ❌` = DOWN trade that LOST
- `DOWN ↘` = DOWN trade PENDING

**Missed Opportunities:**
- `UP ↗ 👍` = Missed opportunity that would have WON
- `UP ↗ ❌` = Missed opportunity that would have LOST
- `UP ↗` = Missed opportunity, outcome still pending

---

**LAST UPDATED:** 2024-02-24
**MAINTAINED BY:** Claude Code AI Assistant
**PURPOSE:** Prevent repeating critical mistakes that cost real money and opportunities
