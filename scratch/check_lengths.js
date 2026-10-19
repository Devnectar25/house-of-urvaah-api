const pool = require('../src/config/db');
(async () => {
  const res = await pool.query(`SELECT table_name, column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name IN ('orders', 'order_items') AND character_maximum_length IS NOT NULL`);
  console.log(res.rows);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
