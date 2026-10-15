const pool = require('../src/config/db');

async function runMigration() {
  try {
    console.log("Running migration to add full_description to products table...");
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS full_description TEXT DEFAULT '';
    `);
    console.log("✅ Successfully added full_description column to products table.");
  } catch (err) {
    console.error("❌ Migration error:", err);
  } finally {
    process.exit();
  }
}

runMigration();
