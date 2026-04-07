/**
 * Proxy Pre-loader for ClobClient
 *
 * DISABLED: Proxy is now configured ONLY in clob-http-client.js for CLOB API calls.
 * We do NOT apply proxy globally - Gamma API, Binance, etc. use direct connections.
 */

'use strict';

// This file is now a no-op. Proxy configuration happens in clob-http-client.js only.
console.log('[proxy-preload] ℹ️  Proxy configured in clob-http-client.js for CLOB API only');
