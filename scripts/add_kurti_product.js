const { Pool } = require('pg');
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false }
});

async function addKurtiProduct() {
  try {
    console.log('--- INSERTING/UPDATING KURTI PRODUCT IN POSTGRESQL DATABASE ---');

    const result = await pool.query(`
      INSERT INTO products (
        product_id, id, title, description, price, sale_price, category_id, brand,
        image_url, images, is_featured, is_active, stock_quantity, sizes, colors, fabric, fit_type, created_at, updated_at
      ) VALUES (
        109,
        109,
        'EMBROIDERED SILK KURTI SET',
        'Architectural embroidered silk kurti ensemble featuring intricate hand-finished detailing and flowing silhouette.',
        8990,
        11990,
        18,
        'House of Urvaah',
        'Images/Kurti_2.png',
        ARRAY['Images/Kurti_2.png', 'Images/Kurti_4.png', 'Images/Kurti_3.png', 'Images/Kurti_1.png'],
        true,
        true,
        50,
        ARRAY['XS', 'S', 'M', 'L', 'XL'],
        ARRAY['#8B0000', '#111111', '#F5F5F0'],
        'Artisan Silk Blend',
        'Fluid Tailored Fit',
        NOW(),
        NOW()
      )
      ON CONFLICT (product_id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        sale_price = EXCLUDED.sale_price,
        image_url = EXCLUDED.image_url,
        images = EXCLUDED.images,
        is_featured = true,
        is_active = true,
        updated_at = NOW()
      RETURNING *;
    `);

    console.log('✅ KURTI PRODUCT INSTALLED IN DATABASE SUCCESSFULLY!');
    console.log('Inserted product row:', result.rows[0].product_id, result.rows[0].title);
  } catch (err) {
    console.error('❌ Error inserting Kurti product:', err);
  } finally {
    await pool.end();
  }
}

addKurtiProduct();
