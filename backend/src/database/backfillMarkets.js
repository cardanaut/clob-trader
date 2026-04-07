require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { getMarket, parseBinary } = require('../utils/polymarketClient');
const { query } = require('./connection');

async function backfill() {
  const res = await query('SELECT id, question FROM markets');
  console.log('Backfilling', res.rows.length, 'markets...');
  for (const m of res.rows) {
    const data = await getMarket(m.id).catch(() => null);
    if (!data) {
      console.log('No data for', m.id.slice(0, 12));
      continue;
    }
    const isBinary = parseBinary(data);
    const endDate  = data.endDate || null;
    await query(
      'UPDATE markets SET is_binary = $1, resolution_date = $2 WHERE id = $3',
      [isBinary, endDate, m.id]
    );
    console.log(isBinary ? '[YES/NO]' : '[OTHER] ', m.question.slice(0, 55), endDate || 'no date');
  }
  console.log('Done.');
  process.exit(0);
}

backfill().catch(e => { console.error(e.message); process.exit(1); });
