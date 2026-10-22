const pool = require('../src/config/db');

async function fix() {
  try {
    const res = await pool.query(`
      UPDATE orders 
      SET payment_status = 'Paid',
          updated_at = NOW() 
      WHERE razorpay_payment_id IS NOT NULL 
        AND (payment_status IS NULL OR payment_status = 'Pending')
      RETURNING id, order_number, payment_method, payment_status, status, razorpay_payment_id;
    `);
    console.log(`Updated ${res.rowCount} orders:`, res.rows);
  } catch (e) {
    console.error('Fix error:', e);
  } finally {
    await pool.end();
  }
}
fix();
