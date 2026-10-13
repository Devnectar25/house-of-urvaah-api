const pool = require('../src/config/db');

async function main() {
  try {
    const res = await pool.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name IN ('users', 'orders', 'order_items', 'transactions', 'user_addresses', 'invoices', 'email_logs', 'notifications') 
      ORDER BY table_name, ordinal_position
    `);
    
    const byTable = {};
    for (const r of res.rows) {
      if (!byTable[r.table_name]) byTable[r.table_name] = [];
      byTable[r.table_name].push(`${r.column_name} (${r.data_type})`);
    }

    console.log('TABLES FOUND:\n', JSON.stringify(byTable, null, 2));

    const checkExisting = await pool.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name
    `);
    console.log('ALL PUBLIC TABLES:', checkExisting.rows.map(r => r.table_name));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

main();
