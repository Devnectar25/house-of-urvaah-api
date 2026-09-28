const pool = require('../src/config/db');

async function checkCaConstraints() {
    try {
        const res = await pool.query(`
            SELECT tc.constraint_name, tc.constraint_type, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.table_name = 'coupon_assignments';
        `);
        console.log('Constraints on coupon_assignments:', res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkCaConstraints();
