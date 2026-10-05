const pool = require('../src/config/db');

async function fixOrderTotals() {
  try {
    const res = await pool.query(`
      UPDATE orders o
      SET total = sub_totals.calculated_total
      FROM (
        SELECT order_id, SUM(price * quantity) as calculated_total
        FROM order_items
        GROUP BY order_id
      ) sub_totals
      WHERE o.id = sub_totals.order_id
        AND (o.total = 0 OR o.total IS NULL)
      RETURNING o.id, o.order_number, o.total;
    `);
    console.log(`[DB Fix] Updated ${res.rowCount} orders with 0 total:`, res.rows);
  } catch (err) {
    console.error('[DB Fix Error]:', err.message);
  } finally {
    await pool.end();
  }
}

fixOrderTotals();
