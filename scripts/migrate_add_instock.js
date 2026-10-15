const pool = require('../src/config/db');

async function runMigration() {
  try {
    console.log("Adding instock column to products table...");
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS instock BOOLEAN DEFAULT TRUE;
    `);
    
    // Update existing records based on stock_quantity / quantity
    await pool.query(`
      UPDATE products 
      SET instock = (COALESCE(stock_quantity, quantity, 1) > 0);
    `);

    console.log("✅ Successfully added instock column to products table and initialized values.");
  } catch (err) {
    console.error("❌ Migration error:", err);
  } finally {
    process.exit();
  }
}

runMigration();
