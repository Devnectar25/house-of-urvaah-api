const pool = require('../src/config/db');
const supabase = require('../src/config/supabaseClient');

async function updateImage() {
  console.log('=== UPDATING CHESTNUT BLOOM SET IMAGE TO Brown02.png ===');

  try {
    const res = await pool.query(`
      UPDATE products 
      SET image_url = 'products/Brown02.png', updated_at = NOW()
      WHERE product_id IN (101, 105) OR title ILIKE '%CHESTNUT BLOOM%';
    `);
    console.log('✅ PostgreSQL Update Result:', res.rowCount, 'rows updated.');
  } catch (err) {
    console.error('❌ PostgreSQL Update Error:', err.message);
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .update({ image_url: 'products/Brown02.png' })
        .or('product_id.in.(101,105),title.ilike.%CHESTNUT BLOOM%');
      if (error) {
        console.error('❌ Supabase Update Error:', error.message);
      } else {
        console.log('✅ Supabase Update Success:', data);
      }
    } catch (err) {
      console.error('❌ Supabase Catch Error:', err.message);
    }
  }

  setTimeout(() => process.exit(0), 1000);
}

updateImage();
