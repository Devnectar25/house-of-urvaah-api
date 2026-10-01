const pool = require('../src/config/db');

async function checkColumns() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      ORDER BY ordinal_position;
    `);
    console.log("PRODUCTS COLUMNS:");
    console.log(res.rows);
  } catch (err) {
    console.error("Error querying columns:", err);
  } finally {
    process.exit();
  }
}

checkColumns();
