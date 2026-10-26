const pool = require('../src/config/db');

async function updateProduct() {
  try {
    const res = await pool.query(
      "UPDATE products SET fabric = $1, fabric_slug = $2 WHERE product_id = $3 RETURNING product_id, title, fabric, fabric_slug",
      ['Aqua Gold Threadwork', 'aqua-gold-threadwork', 81]
    );
    console.log('✅ Updated product 81:', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to update product 81:', err);
    process.exit(1);
  }
}

updateProduct();
