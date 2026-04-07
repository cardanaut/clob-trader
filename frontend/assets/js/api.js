/**
 * PolyChamp — Central API client
 * All API calls go through this module.
 */

// Read API auth token injected by PHP header.php.
// Primary: <html data-api-key="..."> — DOM attribute, not on window, immune to SES/lockdown sealing.
// Fallbacks: window._POLYCHAMP_AUTH (inline script) → meta tag → null.
const _API_AUTH = (() => {
    const fromHtml = document.documentElement.getAttribute('data-api-key');
    if (fromHtml) return 'Basic ' + fromHtml;
    if (typeof window._POLYCHAMP_AUTH !== 'undefined' && window._POLYCHAMP_AUTH) return window._POLYCHAMP_AUTH;
    const meta = document.querySelector('meta[name="x-api-auth"]');
    return meta ? 'Basic ' + meta.getAttribute('content') : null;
})();

const PolyChampAPI = (() => {
    const BASE = '/api';

    async function request(path, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        if (_API_AUTH && method !== 'GET') {
            options.headers = options.headers || {};
            options.headers['Authorization'] = _API_AUTH;
            // Also send via custom header — fallback if SES/lockdown strips Authorization
            options.headers['X-Polychamp-Auth'] = _API_AUTH;
        }
        const res = await fetch(BASE + path, options);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    return {
        // Trades
        getTrades(filters = {}) {
            const qs = new URLSearchParams(filters).toString();
            return request(`/trades${qs ? '?' + qs : ''}`);
        },
        getTradesByWallet(address) {
            return request(`/trades/${encodeURIComponent(address)}`);
        },

        // Wallets
        getWallets(params = {}) {
            const qs = new URLSearchParams(params).toString();
            return request(`/wallets${qs ? '?' + qs : ''}`);
        },
        getWalletStats(address) {
            return request(`/wallets/${encodeURIComponent(address)}/stats`);
        },

        // Markets
        getMarkets() {
            return request('/markets');
        },
        getMarket(id) {
            return request(`/markets/${encodeURIComponent(id)}`);
        },

        // Dashboard summary
        getSummary() {
            return request('/stats/summary');
        },

        // Health
        getHealth() {
            return request('/health');
        },

        // Backtest
        runBacktest(params) {
            return request('/backtest/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            });
        },

        // Generic request (method, path, body)
        request(method, path, body = undefined) {
            const opts = { method };
            if (body !== undefined) {
                opts.headers = { 'Content-Type': 'application/json' };
                opts.body    = JSON.stringify(body);
            }
            return request(path, opts);
        },
    };
})();

// Global status checker
async function checkSystemStatus() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (!dot || !text) return;

    try {
        const health = await PolyChampAPI.getHealth();
        dot.className = 'status-dot online';
        const lastTrade = health.last_trade
            ? timeAgo(new Date(health.last_trade))
            : 'No trades yet';
        text.textContent = `Online — last trade ${lastTrade}`;
    } catch (_) {
        dot.className = 'status-dot offline';
        text.textContent = 'API offline';
    }
}

// Helpers
function timeAgo(date) {
    const secs = Math.floor((Date.now() - date) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
}

function formatUSD(amount) {
    return '$' + Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function shortWallet(addr) {
    if (!addr) return '—';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function categoryBadge(cat) {
    return `<span class="badge badge-${cat}">${cat}</span>`;
}

function outcomeBadge(outcome) {
    return `<span class="badge badge-${outcome.toLowerCase()}">${outcome}</span>`;
}

function categoryBadge(category) {
    const cat = (category || 'other').toLowerCase();
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    return `<span class="badge badge-category badge-category-${cat}">${label}</span>`;
}

// ─── Table Sorting ───────────────────────────────────────────────────────────

const tableSortState = {};

function makeTableSortable(tableId, defaultColumn = 0, defaultDirection = 'desc') {
    const table = document.querySelector(`#${tableId}`);
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const headers = table.querySelectorAll('thead th');

    if (!tableSortState[tableId]) {
        tableSortState[tableId] = { column: defaultColumn, direction: defaultDirection };
    }

    headers.forEach((header, index) => {
        // Skip if header has no-sort class
        if (header.classList.contains('no-sort')) return;

        header.style.cursor = 'pointer';
        header.style.userSelect = 'none';
        header.addEventListener('click', () => {
            const state = tableSortState[tableId];

            // Toggle direction if same column, otherwise use default
            if (state.column === index) {
                state.direction = state.direction === 'asc' ? 'desc' : 'asc';
            } else {
                state.column = index;
                state.direction = defaultDirection;
            }

            sortTable(tbody, headers, index, state.direction);
            updateSortIndicators(headers, index, state.direction);
        });
    });

    // Apply initial sort
    sortTable(tbody, headers, tableSortState[tableId].column, tableSortState[tableId].direction);
    updateSortIndicators(headers, tableSortState[tableId].column, tableSortState[tableId].direction);
}

function sortTable(tbody, headers, columnIndex, direction) {
    const rows = Array.from(tbody.querySelectorAll('tr'));

    // Skip if only loading/empty row
    if (rows.length <= 1 && rows[0]?.cells[0]?.classList.contains('loading')) return;

    const dataType = detectDataType(rows, columnIndex);

    rows.sort((a, b) => {
        const aCell = a.cells[columnIndex];
        const bCell = b.cells[columnIndex];

        if (!aCell || !bCell) return 0;

        const aValue = getCellValue(aCell, dataType);
        const bValue = getCellValue(bCell, dataType);

        let comparison = 0;

        if (dataType === 'number') {
            comparison = aValue - bValue;
        } else if (dataType === 'date') {
            comparison = aValue - bValue;
        } else {
            comparison = aValue.localeCompare(bValue);
        }

        return direction === 'asc' ? comparison : -comparison;
    });

    // Re-append rows in sorted order
    rows.forEach(row => tbody.appendChild(row));
}

function detectDataType(rows, columnIndex) {
    // Check first few valid rows to determine data type
    for (let i = 0; i < Math.min(5, rows.length); i++) {
        const cell = rows[i].cells[columnIndex];
        if (!cell || cell.classList.contains('loading')) continue;

        const text = cell.textContent.trim();

        // Check for currency
        if (text.match(/^\$[\d,]+\.?\d*$/)) return 'number';

        // Check for percentage
        if (text.match(/^\d+\.?\d*%$/)) return 'number';

        // Check for number with optional cents symbol
        if (text.match(/^\d+\.?\d*¢?$/)) return 'number';

        // Check for plain number
        if (!isNaN(parseFloat(text)) && isFinite(text)) return 'number';

        // Check for date patterns
        if (text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)) return 'date';

        // Check for relative time (5m ago, 2h ago, etc) or "in X" format
        if (text.match(/(\d+[smhd]\s*ago|in\s+\d)/i)) return 'date';

        // Check for "Expired" text
        if (text.match(/expired/i)) return 'date';
    }

    return 'text';
}

function getCellValue(cell, dataType) {
    const text = cell.textContent.trim();

    if (dataType === 'number') {
        // Extract numeric value from currency, percentage, or plain number
        const match = text.match(/[\d,]+\.?\d*/);
        return match ? parseFloat(match[0].replace(/,/g, '')) : 0;
    }

    if (dataType === 'date') {
        // Handle "Expired" - treat as very old
        if (text.match(/expired/i)) return -999999999;

        // Handle "in X" time (future dates)
        if (text.match(/in\s+(\d+)([smhd])/i)) {
            const match = text.match(/in\s+(\d+)([smhd])/i);
            if (match) {
                const value = parseInt(match[1]);
                const unit = match[2].toLowerCase();
                const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
                return value * (multipliers[unit] || 1); // Positive for future dates
            }
        }

        // Handle relative time (ago)
        if (text.match(/(\d+)([smhd])\s*ago/i)) {
            const match = text.match(/(\d+)([smhd])/i);
            if (match) {
                const value = parseInt(match[1]);
                const unit = match[2].toLowerCase();
                const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
                return -value * (multipliers[unit] || 1); // Negative for "ago" (more recent = higher value)
            }
        }

        // Try to parse as actual date
        const dateValue = cell.getAttribute('data-timestamp') || text;
        const parsed = Date.parse(dateValue);
        return isNaN(parsed) ? 0 : parsed;
    }

    return text.toLowerCase();
}

function updateSortIndicators(headers, activeIndex, direction) {
    headers.forEach((header, index) => {
        // Remove existing indicators
        const existing = header.querySelector('.sort-indicator');
        if (existing) existing.remove();

        if (index === activeIndex) {
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.textContent = direction === 'asc' ? ' ▲' : ' ▼';
            indicator.style.fontSize = '10px';
            indicator.style.marginLeft = '4px';
            indicator.style.color = 'var(--accent)';
            header.appendChild(indicator);
        }
    });
}

// Start status polling
document.addEventListener('DOMContentLoaded', () => {
    checkSystemStatus();
    setInterval(checkSystemStatus, 30000);
});
