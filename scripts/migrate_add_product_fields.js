const pool = require('../src/config/db');

async function runMigration() {
  try {
    console.log("Running migration to add specifications and short_description to products table...");
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS short_description TEXT DEFAULT '';
    `);
    console.log("✅ Successfully added specifications and short_description columns to products table.");
  } catch (err) {
    console.error("❌ Migration error:", err);
  } finally {
    process.exit();
  }
}

runMigration();
