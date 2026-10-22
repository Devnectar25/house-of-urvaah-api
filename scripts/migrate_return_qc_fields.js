const pool = require('../src/config/db');

async function main() {
  try {
    await pool.query(`
      ALTER TABLE public.orders 
      ADD COLUMN IF NOT EXISTS return_qc_status VARCHAR(50) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS return_qc_notes TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS return_rejection_reason TEXT DEFAULT NULL;
    `);
    console.log('Migration completed successfully: return_qc_status, return_qc_notes, return_rejection_reason columns added.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

main();
