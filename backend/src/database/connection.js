const { Pool } = require('pg');
const config = require('../utils/config');
const logger = require('../utils/logger');

const pool = new Pool({ connectionString: config.db.url });

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL client connected');
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { text: text.substring(0, 80), duration, rows: res.rowCount });
    return res;
  } catch (err) {
    logger.error('Query error', { text: text.substring(0, 80), error: err.message });
    throw err;
  }
}

module.exports = { pool, query };
