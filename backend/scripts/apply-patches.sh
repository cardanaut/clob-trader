#!/bin/bash
###############################################################################
# apply-patches.sh
#
# Applies two fixes to @polymarket/clob-client after npm install.
# Run automatically by postinstall; safe to re-run (idempotent).
#
# Patch 1 — safeConfig (logging fix):
#   Replaces `config: err.response?.config` in the SDK's error handler with a
#   stripped-down safe copy, preventing JSON.stringify from crashing on circular
#   references inside the axios config object when a CLOB 4xx error occurs.
#   Logging-only — no effect on order placement.
#
# Patch 2 — proxy (geoblock bypass for POST /order):
#   The SDK is an ES module (type: module).  Setting axios.defaults.httpsAgent
#   in our CJS polymarket.js does NOT cross the ESM boundary — the SDK's own
#   `import axios` instance is unaffected.  This patch injects the proxy agent
#   directly into the SDK's request() function, scoped to POST only, using the
#   same CLOB_PROXY_* env vars as polymarket.js.
###############################################################################

set -e

CLOB_FILE="$(dirname "$0")/../node_modules/@polymarket/clob-client/dist/http-helpers/index.js"

if [ ! -f "$CLOB_FILE" ]; then
  echo "⚠  clob-client not found (run npm install first) — skipping patches"
  exit 0
fi

python3 - "$CLOB_FILE" << 'EOF'
import sys

path = sys.argv[1]
with open(path) as f:
    src = f.read()

changed = False

# ── Patch 1: safeConfig ────────────────────────────────────────────────────
if 'safeConfig' not in src:
    old1 = (
        'console.error("[CLOB Client] request error", JSON.stringify({\n'
        '                status: err.response?.status,\n'
        '                statusText: err.response?.statusText,\n'
        '                data: err.response?.data,\n'
        '                config: err.response?.config,\n'
        '            }));'
    )
    new1 = (
        '// Patch: extract safe config to avoid JSON.stringify circular-ref crash\n'
        '            const safeConfig = err.response?.config\n'
        '                ? { method: err.response.config.method, url: err.response.config.url, baseURL: err.response.config.baseURL }\n'
        '                : undefined;\n'
        '            console.error("[CLOB Client] request error", JSON.stringify({\n'
        '                status: err.response?.status,\n'
        '                statusText: err.response?.statusText,\n'
        '                data: err.response?.data,\n'
        '                config: safeConfig,\n'
        '            }));'
    )
    if old1 in src:
        src = src.replace(old1, new1, 1)
        changed = True
        print("✅ Patch 1 (safeConfig) applied")
    else:
        print("⚠  Patch 1 (safeConfig): target not found — SDK version may have changed, skipping")
else:
    print("✅ Patch 1 (safeConfig) already applied")

# ── Patch 2: proxy agent for POST /order (geoblock bypass) ────────────────
# The SDK is ESM; axios.defaults.httpsAgent set in CJS code doesn't reach it.
# We inject hpagent directly into the SDK's request() for POST requests only.
if 'getProxyAgent' not in src:
    old2 = 'import axios from "axios";\nimport { isBrowser } from "browser-or-node";'
    new2 = (
        'import axios from "axios";\n'
        'import { isBrowser } from "browser-or-node";\n'
        'import { HttpsProxyAgent } from \'hpagent\';\n'
        '// Patch: residential proxy for CLOB geoblock bypass (POST /order only)\n'
        'let _proxyAgent;\n'
        'const getProxyAgent = () => {\n'
        '    if (process.env.CLOB_USE_PROXY !== \'true\') return undefined;\n'
        '    if (_proxyAgent) return _proxyAgent;\n'
        '    const { CLOB_PROXY_PROTOCOL: proto = \'http\', CLOB_PROXY_HOST: host,\n'
        '            CLOB_PROXY_PORT: port, CLOB_PROXY_USER: user, CLOB_PROXY_PASS: pass } = process.env;\n'
        '    if (!host || !port || !user || !pass) return undefined;\n'
        '    _proxyAgent = new HttpsProxyAgent({ proxy: `${proto}://${user}:${pass}@${host}:${port}` });\n'
        '    return _proxyAgent;\n'
        '};\n'
    )
    old2b = (
        'export const request = async (endpoint, method, headers, data, params) => {\n'
        '    overloadHeaders(method, headers);\n'
        '    const config = { method, url: endpoint, headers, data, params };\n'
        '    return await axios(config);\n'
        '};'
    )
    new2b = (
        'export const request = async (endpoint, method, headers, data, params) => {\n'
        '    overloadHeaders(method, headers);\n'
        '    const config = { method, url: endpoint, headers, data, params };\n'
        '    // Patch: inject proxy agent for POST requests (geoblock bypass)\n'
        '    if (method === POST) { const agent = getProxyAgent(); if (agent) config.httpsAgent = agent; }\n'
        '    return await axios(config);\n'
        '};'
    )
    if old2 in src and old2b in src:
        src = src.replace(old2, new2, 1)
        src = src.replace(old2b, new2b, 1)
        changed = True
        print("✅ Patch 2 (proxy) applied")
    else:
        print("⚠  Patch 2 (proxy): target not found — SDK version may have changed, skipping")
else:
    print("✅ Patch 2 (proxy) already applied")

if changed:
    with open(path, 'w') as f:
        f.write(src)
EOF
