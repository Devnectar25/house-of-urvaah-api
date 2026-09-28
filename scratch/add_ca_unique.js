const pool = require('../src/config/db');

async function addUniqueIndex() {
    try {
        console.log('Adding UNIQUE index on coupon_assignments(coupon_id, user_id)...');
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS coupon_assignments_coupon_user_idx
            ON coupon_assignments (coupon_id, user_id);
        `);
        console.log('✅ Unique index created successfully!');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        await pool.end();
    }
}

addUniqueIndex();
