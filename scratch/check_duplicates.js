const pool = require('../src/config/db');

async function checkDuplicates() {
  try {
    console.log("=== CHECKING USERS TABLE FOR DUPLICATES ===");
    const res = await pool.query(`
      SELECT username, emailid, fullname, contactno, createdate, member_since
      FROM public.users
      ORDER BY LOWER(emailid) ASC, createdate DESC
    `);
    
    console.log(`Total rows in public.users: ${res.rows.length}`);
    console.log("All User Rows:");
    console.table(res.rows);

    const emailCounts = await pool.query(`
      SELECT LOWER(emailid) as email, COUNT(*) as count 
      FROM public.users 
      GROUP BY LOWER(emailid) 
      HAVING COUNT(*) > 1
    `);
    console.log("Duplicate Emails:", emailCounts.rows);

    const usernameCounts = await pool.query(`
      SELECT LOWER(username) as username, COUNT(*) as count 
      FROM public.users 
      GROUP BY LOWER(username) 
      HAVING COUNT(*) > 1
    `);
    console.log("Duplicate Usernames:", usernameCounts.rows);

  } catch (err) {
    console.error("Error checking duplicates:", err);
  } finally {
    await pool.end();
  }
}

checkDuplicates();
