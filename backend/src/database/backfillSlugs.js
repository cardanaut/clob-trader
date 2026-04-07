require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const axios = require('axios');
const { query } = require('./connection');

const gammaClient = axios.create({
  baseURL: 'https://gamma-api.polymarket.com',
  timeout: 10000,
  headers: { Accept: 'application/json' },
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function backfill() {
  const res = await query('SELECT id, question FROM markets');
  console.log('Backfilling event slugs for', res.rows.length, 'markets...');

  for (const m of res.rows) {
    try {
      const r = await gammaClient.get('/markets', { params: { condition_ids: m.id } });
      const data = Array.isArray(r.data) ? r.data : [];
      if (!data.length) { console.log('No data for', m.question.slice(0, 40)); continue; }

      const market = data[0];
      // Use event slug (for the event page URL) — falls back to market slug
      const events = market.events || [];
      const eventSlug = (events[0] && events[0].slug) || market.slug || null;

      if (!eventSlug) { console.log('No slug for', m.question.slice(0, 40)); continue; }

      await query('UPDATE markets SET slug = $1 WHERE id = $2', [eventSlug, m.id]);
      console.log('OK', eventSlug.slice(0, 45), '|', m.question.slice(0, 40));
    } catch (err) {
      console.log('SKIP', m.id.slice(0, 12), err.message);
    }
    await sleep(200);
  }

  console.log('Done.');
  process.exit(0);
}

backfill().catch(e => { console.error(e.message); process.exit(1); });
