const pool = require('../src/config/db');

async function runMigration() {
  try {
    console.log("Running migration to add is_recommended column to products table...");
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT FALSE;
    `);
    console.log("✅ Successfully added is_recommended column to products table.");
  } catch (err) {
    console.error("❌ Migration error:", err);
  } finally {
    process.exit();
  }
}

runMigration();
