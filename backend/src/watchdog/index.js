'use strict';

/**
 * Polychamp Watchdog
 *
 * Polls /health on polychamp-api every 60 s.
 * If the endpoint is unreachable OR returns a degraded status for 2 consecutive
 * checks, it restarts the affected PM2 process and sends an ntfy alert.
 *
 * Also checks polychamp-spike is online every 60 s via `pm2 jlist`.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const http         = require('http');
const { execSync } = require('child_process');

const API_PORT      = parseInt(process.env.PORT || '55550', 10);
const INTERVAL_MS   = 60_000;          // check every 60 s
const FAIL_TRIGGER  = 2;               // consecutive failures before restart
const NTFY_TOPIC    = process.env.NTFY_TOPIC || 'jfat1000';
const SERVICES      = ['polychamp-api', 'polychamp-spike'];

// Per-service failure counters
const failCount = Object.fromEntries(SERVICES.map(s => [s, 0]));

// ── ntfy alert ────────────────────────────────────────────────────────────────
function ntfyAlert(title, message, priority = 4) {
  try {
    const body = Buffer.from(message);
    const req  = http.request({
      hostname: 'ntfy.sh',
      method  : 'POST',
      path    : `/${NTFY_TOPIC}`,
      headers : {
        'Content-Type'   : 'text/plain',
        'Content-Length' : body.length,
        'Title'          : title,
        'Priority'       : String(priority),
        'Tags'           : 'rotating_light',
      },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

// ── PM2 restart ───────────────────────────────────────────────────────────────
function pm2Restart(service) {
  try {
    execSync(`pm2 restart ${service}`, { stdio: 'ignore' });
    console.log(`[watchdog] restarted ${service}`);
  } catch (err) {
    console.error(`[watchdog] failed to restart ${service}:`, err.message);
  }
}

// ── Check polychamp-api via /health ──────────────────────────────────────────
function checkApi() {
  return new Promise(resolve => {
    const req = http.request(
      { hostname: '127.0.0.1', port: API_PORT, path: '/health', method: 'GET', timeout: 10_000 },
      res => {
        let body = '';
        res.on('data', d => { body += d; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ ok: true });
          } else {
            let parsed = {};
            try { parsed = JSON.parse(body); } catch (_) {}
            resolve({ ok: false, reason: `HTTP ${res.statusCode}`, issues: parsed.issues || [] });
          }
        });
      }
    );
    req.on('error', err  => resolve({ ok: false, reason: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    req.end();
  });
}

// ── Check any PM2 service is online via `pm2 jlist` ─────────────────────────
function checkPm2Service(name) {
  try {
    const raw   = execSync('pm2 jlist', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const list  = JSON.parse(raw);
    const proc  = list.find(p => p.name === name);
    if (!proc)                          return { ok: false, reason: 'not_found' };
    if (proc.pm2_env?.status !== 'online') return { ok: false, reason: proc.pm2_env?.status || 'unknown' };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function tick() {
  // polychamp-api: deep health check
  const apiResult = await checkApi();
  if (apiResult.ok) {
    if (failCount['polychamp-api'] > 0)
      console.log('[watchdog] polychamp-api recovered');
    failCount['polychamp-api'] = 0;
  } else {
    failCount['polychamp-api']++;
    const n = failCount['polychamp-api'];
    console.warn(`[watchdog] polychamp-api unhealthy (${n}/${FAIL_TRIGGER}):`, apiResult.reason, apiResult.issues || '');
    if (n >= FAIL_TRIGGER) {
      const msg = `polychamp-api unhealthy for ${n} checks — restarting.\nReason: ${apiResult.reason}${apiResult.issues?.length ? '\nIssues: ' + apiResult.issues.join(', ') : ''}`;
      ntfyAlert('⚠️ Polychamp API restarted', msg);
      pm2Restart('polychamp-api');
      failCount['polychamp-api'] = 0;
    }
  }

  // polychamp-spike: PM2 status check
  const spikeResult = checkPm2Service('polychamp-spike');
  if (spikeResult.ok) {
    if (failCount['polychamp-spike'] > 0)
      console.log('[watchdog] polychamp-spike recovered');
    failCount['polychamp-spike'] = 0;
  } else {
    failCount['polychamp-spike']++;
    const n = failCount['polychamp-spike'];
    console.warn(`[watchdog] polychamp-spike unhealthy (${n}/${FAIL_TRIGGER}):`, spikeResult.reason);
    if (n >= FAIL_TRIGGER) {
      ntfyAlert('⚠️ Polychamp Spike restarted', `polychamp-spike ${spikeResult.reason} for ${n} checks — restarting.`);
      pm2Restart('polychamp-spike');
      failCount['polychamp-spike'] = 0;
    }
  }
}

console.log(`[watchdog] started — polling every ${INTERVAL_MS / 1000}s`);
tick(); // immediate first check
setInterval(tick, INTERVAL_MS);
