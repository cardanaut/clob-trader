# PolyChamp Backend

> **🚨 BEFORE MAKING ANY CHANGES - READ THIS:**
>
> **[📖 SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)** - Complete system reference
>
> This document contains critical rules that MUST NOT be violated.
> **Reading this document is MANDATORY before modifying the codebase.**

---

## 📦 Installation

### Prerequisites

- Node.js 18+
- PM2 (for production deployment)

### Setup

```bash
cd backend
npm install          # dependencies + applies minor SDK logging fix (postinstall)
cp .env.example .env # configure credentials
```

### Start

```bash
# Production (PM2)
pm2 start ecosystem.config.js

# Development
npm run dev
```

---

## 🚀 Services

| PM2 name | Entry point | Role |
|---|---|---|
| `polychamp-api` | `src/api/server.js` | REST API (port 55550) |
| `polychamp-spike` | `src/spike/index.js` | Spike + T1000 engine |

---

## ⚙️ Key Environment Variables

```bash
# Trading
SPIKE_TRADING_MODE=PAPER        # PAPER or LIVE
ENABLE_LIVE_TRADING=true

# Polymarket EOA credentials
POLY_SIGNER_KEY=0x...
POLY_API_KEY=...
POLY_API_SECRET=...
POLY_API_PASSPHRASE=...

# Optional: residential proxy for CLOB geoblock bypass
# (proxy handled by withOrderProxy() in src/trader/polymarket.js — no SDK patching needed)
CLOB_USE_PROXY=false
CLOB_PROXY_HOST=...
CLOB_PROXY_PORT=...
CLOB_PROXY_USER=...
CLOB_PROXY_PASS=...
```

---

## 📁 Project Structure

```
backend/
├── scripts/
│   └── apply-patches.sh    # Minor SDK logging fix (run by postinstall)
├── src/
│   ├── api/                # REST API server
│   ├── spike/              # Spike engine (polychamp-spike)
│   ├── t1000/              # T1000 trading engine
│   ├── trader/
│   │   └── polymarket.js   # Polymarket CLOB client (EOA mode)
│   └── utils/
│       └── infura-rpc.js   # Round-robin Polygon RPC pool
├── .env
└── package.json
```

---

## 🛠️ Troubleshooting

### HTTP 403 on CLOB API
Cloudflare geoblock on datacenter IPs. Set `CLOB_USE_PROXY=true` with valid residential proxy credentials and restart `polychamp-api`.

### "invalid amounts" order rejection
Handled in code via `validShares()` GCD formula in `src/trader/polymarket.js` — no SDK patching needed.

### PM2 logs
```bash
pm2 logs polychamp-api --lines 50
pm2 logs polychamp-spike --lines 50
```

---

## 🔒 Security Notes

- Never commit `.env` to git
- Private keys are in `.env` only
