const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

async function verifyAdmin() {
  try {
    const hash = await bcrypt.hash('Admin@123', 10);
    const pages = ['dashboard', 'products', 'categories', 'orders', 'coupons', 'customers', 'refunds', 'reviews', 'analytics', 'settings'];
    
    const res = await pool.query(
      `UPDATE public.admins 
       SET password = $1, active = true, accesstopage = $2 
       WHERE LOWER(userid) = 'admin' 
       RETURNING adminid, userid, active`,
      [hash, pages]
    );

    console.log('✅ Admin credentials updated:', res.rows[0]);
  } catch (err) {
    console.error('❌ Error updating admin:', err.message);
  } finally {
    await pool.end();
  }
}

verifyAdmin();
