const pool = require('../src/config/db');

async function testDashboard() {
  try {
    const [
      products,
      categories,
      subcategories,
      orders,
      delivered,
      pending,
      processing,
      cancelled,
      users,
      coupons,
      reviews
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM products').catch(e => ({ error: e.message })),
      pool.query('SELECT COUNT(*) as count FROM category').catch(e => ({ error: e.message })),
      pool.query('SELECT COUNT(*) as count FROM subcategories').catch(e => ({ error: e.message })),
      pool.query('SELECT COUNT(*) as count FROM orders').catch(e => ({ error: e.message })),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE status = 'Delivered'").catch(e => ({ error: e.message })),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE status = 'Pending'").catch(e => ({ error: e.message })),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE status = 'Processing'").catch(e => ({ error: e.message })),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE status IN ('Cancelled', 'Cancellation Requested', 'Refunded')").catch(e => ({ error: e.message })),
      pool.query('SELECT COUNT(DISTINCT LOWER(emailid)) as count FROM public.users').catch(e => ({ error: e.message })),
      pool.query('SELECT COUNT(*) as count FROM coupons').catch(e => ({ error: e.message })),
      pool.query('SELECT COUNT(*) as count FROM reviews').catch(e => ({ error: e.message }))
    ]);

    console.log('Results:', {
      products: products.rows?.[0]?.count || products.error,
      categories: categories.rows?.[0]?.count || categories.error,
      subcategories: subcategories.rows?.[0]?.count || subcategories.error,
      orders: orders.rows?.[0]?.count || orders.error,
      delivered: delivered.rows?.[0]?.count || delivered.error,
      pending: pending.rows?.[0]?.count || pending.error,
      processing: processing.rows?.[0]?.count || processing.error,
      cancelled: cancelled.rows?.[0]?.count || cancelled.error,
      users: users.rows?.[0]?.count || users.error,
      coupons: coupons.rows?.[0]?.count || coupons.error,
      reviews: reviews.rows?.[0]?.count || reviews.error,
    });
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    pool.end();
  }
}

testDashboard();
