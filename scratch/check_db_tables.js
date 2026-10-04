const pool = require('../src/config/db');

async function checkTables() {
  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log("PUBLIC TABLES IN DATABASE:");
    console.log(res.rows.map(r => r.table_name));

    // Check order_items or orders columns if exists
    for (const tableName of ['orders', 'order_items', 'wishlist', 'products']) {
      if (res.rows.some(r => r.table_name === tableName)) {
        const colRes = await pool.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = '${tableName}' 
          ORDER BY ordinal_position;
        `);
        console.log(`\nCOLUMNS FOR ${tableName}:`);
        console.log(colRes.rows);
      }
    }
  } catch (err) {
    console.error("Error checking tables:", err);
  } finally {
    process.exit();
  }
}

checkTables();
