const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');

async function seedAdmin() {
  try {
    const existing = await pool.query("SELECT * FROM public.admins WHERE userid = 'Admin'");
    if (existing.rowCount > 0) {
      console.log('Super Admin account already exists (userid: Admin).');
      return;
    }

    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    const pages = [
      'dashboard',
      'products',
      'categories',
      'orders',
      'coupons',
      'customers',
      'refunds',
      'reviews',
      'analytics',
      'settings'
    ];

    const result = await pool.query(
      `INSERT INTO public.admins (userid, password, accesstopage, active, createdate) 
       VALUES ($1, $2, $3, true, NOW()) 
       RETURNING adminid, userid, active`,
      ['Admin', hashedPassword, pages]
    );

    console.log('Super Admin successfully seeded:', result.rows[0]);
    console.log('Username: Admin');
    console.log('Password: Admin@123');
  } catch (err) {
    console.error('Error seeding admin:', err);
  } finally {
    await pool.end();
  }
}

seedAdmin();
