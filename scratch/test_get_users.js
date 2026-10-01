const pool = require('../src/config/db');

async function testGetUsers() {
  try {
    console.log("=== TESTING BACKEND getUsers QUERY ===");
    const result = await pool.query(`
      SELECT 
          u.username, 
          u.emailid, 
          u.fullname, 
          u.contactno, 
          u.active, 
          u.createdate,
          COALESCE(u.member_since, u.createdate) as member_since,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.total ELSE 0 END), 0) as total_spent
      FROM public.users u
      LEFT JOIN public.orders o ON u.username = o.user_id OR LOWER(u.emailid) = LOWER(o.user_id)
      GROUP BY u.username, u.emailid, u.fullname, u.contactno, u.active, u.createdate, u.member_since
      ORDER BY u.createdate DESC
    `);
    
    console.log(`Query returned ${result.rows.length} rows.`);
    const mapped = result.rows.map(row => ({
      id: row.username,
      name: row.fullname || row.username,
      email: row.emailid,
      phone: row.contactno,
      active: row.active !== false,
      totalOrders: parseInt(row.total_orders) || 0,
      totalSpent: parseFloat(row.total_spent) || 0
    }));

    console.table(mapped);

    // Check if mapped array has any duplicate emails or names
    const seenEmails = {};
    mapped.forEach(u => {
      const em = (u.email || '').toLowerCase().trim();
      if (seenEmails[em]) {
        console.log("DUPLICATE EMAIL IN RETURNED LIST:", em, "IDs:", u.id, seenEmails[em].id);
      } else {
        seenEmails[em] = u;
      }
    });

  } catch (err) {
    console.error("Error in testGetUsers:", err);
  } finally {
    await pool.end();
  }
}

testGetUsers();
