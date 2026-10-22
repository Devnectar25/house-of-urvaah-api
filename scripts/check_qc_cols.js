const pool = require('../src/config/db');

async function main() {
  try {
    const res = await pool.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'orders' 
         AND column_name IN ('return_qc_status', 'return_qc_notes', 'qc_status', 'qc_notes', 'return_rejection_reason', 'is_product_received')`
    );
    console.log('QC COLUMNS:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
