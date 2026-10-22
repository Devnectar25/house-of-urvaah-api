const pool = require('../src/config/db');
const orderService = require('../src/services/orderService');

async function main() {
  try {
    const pRes = await pool.query(`SELECT product_id, title, stock_quantity, quantity, size_stock, updated_at FROM products WHERE product_id IN (106, 109)`);
    console.log('PRODUCTS NOW:\n', JSON.stringify(pRes.rows, null, 2));

    const oRes = await pool.query(`
      SELECT o.order_number, o.status, o.logistics_status, o.is_product_received, o.refund_status, o.updated_at,
             oi.product_id, oi.quantity, oi.size, oi.status as item_status
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.order_number IN ('HOU-371769', 'HOU-161354')
    `);
    console.log('ORDERS DETAILS:\n', JSON.stringify(oRes.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
