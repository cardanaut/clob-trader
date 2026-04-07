# Proxy Testing Guide

## Quick Test

Test your current proxy configuration from .env:

```bash
node scripts/test_proxy.js
```

## Test Different Credentials

Test new proxy credentials without modifying .env:

```bash
node scripts/test_proxy.js <host> <port> <user> <pass>
```

Example:
```bash
node scripts/test_proxy.js geo.iproyal.com 12321 myuser mypass
```

## Understanding Results

### ✅ Success Output
```
✅ Proxy connected successfully
   IP address: 123.456.789.0
✅ SUCCESS! Polymarket accessible through proxy
   Status: 200
```
**Action:** Your proxy is working! Copy the credentials to .env and restart the bot.

### ❌ Connection Failed
```
❌ PROXY CONNECTION FAILED
   Error: Client network socket disconnected before secure TLS connection was established
   Code: ECONNRESET
```
**Possible issues:**
- Proxy credentials expired or invalid
- Proxy service is down
- Firewall blocking proxy connection
- Wrong host/port configuration

**Action:** Check your proxy service dashboard and verify:
1. Subscription is active
2. Credentials are correct
3. Service status is online

### ❌ Geoblock Still Present
```
✅ Proxy connected successfully
   IP address: 123.456.789.0
❌ POLYMARKET REQUEST FAILED
   Status: 403 Forbidden
   💡 403 Geoblock Error - Proxy is NOT bypassing region restriction!
```
**Action:** The proxy connects but Polymarket still blocks it. This means:
- Proxy IP is in a blocked region
- Polymarket detected the proxy
- You need a residential proxy (not datacenter)

## IPRoyal Residential Proxy Setup

1. Log into https://dashboard.iproyal.com
2. Go to "Residential Proxies"
3. Copy your credentials:
   - Host: `geo.iproyal.com`
   - Port: `12321` (or your assigned port)
   - Username: Your username
   - Password: Your password
4. Test with the script above
5. If working, update `.env`:
   ```
   CLOB_USE_PROXY=true
   CLOB_PROXY_PROTOCOL=http
   CLOB_PROXY_HOST=geo.iproyal.com
   CLOB_PROXY_PORT=12321
   CLOB_PROXY_USER=your_username
   CLOB_PROXY_PASS=your_password
   ```
6. Restart the bot: `pm2 restart polychamp-spike`

## Alternative Proxy Providers

If IPRoyal doesn't work, try:

### BrightData (formerly Luminati)
- Website: https://brightdata.com
- Type: Residential proxies
- Format: `brd.superproxy.io:22225`

### Oxylabs
- Website: https://oxylabs.io
- Type: Residential proxies
- Format: `pr.oxylabs.io:7777`

### SmartProxy
- Website: https://smartproxy.com
- Type: Residential proxies
- Format: `gate.smartproxy.com:7000`

## Troubleshooting

### My proxy works for other sites but not Polymarket

Polymarket may be detecting datacenter IPs. Use **residential proxies** only.

### Proxy was working but suddenly stopped

Check:
1. Proxy subscription renewal date
2. Account balance/credits
3. Service status page
4. IP rotation settings

### Getting timeout errors

Increase timeout in test script (line with `timeout: 10000`) or check:
1. Network connectivity
2. Firewall rules
3. Proxy server load

### 403 errors even with proxy

This means the proxy IP is still blocked. Try:
1. Request IP rotation from proxy provider
2. Use different geographic region
3. Switch proxy providers
4. Contact proxy support

## Bot Error Logs

When the bot runs with a broken proxy, you'll see:

```
🚨 [clob-http] PROXY CONNECTION FAILED
🚨 [clob-http] GEOBLOCK DETECTED - PROXY NOT WORKING!
```

These alerts indicate you need to fix the proxy immediately.
