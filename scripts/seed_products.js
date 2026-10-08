/**
 * HOUSE OF URVAAH - PRODUCT & CATEGORY SEED SCRIPT
 */

const { Pool } = require('pg');
require('dotenv').config({ path: 'c:/Urvaah Workspace/Urvaah-BA/.env' });

const SEED_CATEGORIES = [
  { id: 1, name: 'CORSET TOPS', description: 'Embroidered, Contoured & Strapless Corset Tops' },
  { id: 2, name: 'CO-ORD SETS', description: 'Matching Two-Piece Sets & Printed Ensembles' },
  { id: 3, name: 'SUMMER DRESSES', description: 'Breezy Linen, Silk & Floral Summer Dresses' },
  { id: 4, name: 'PARTY WEAR', description: 'Glamorous Cocktail Dresses & Evening Wear' }
];

const SEED_PRODUCTS = [
  {
    product_id: 101,
    title: 'CHESTNUT BLOOM SET',
    price: 8990,
    sale_price: 11990,
    category_id: 14,
    brand: 'House of Urvaah',
    image_url: 'products/Brown02.png',
    images: ['products/Brown02.png', 'products/Brown03.png', 'products/Brown04.png', 'products/Brown01.png'],
    sizes: ['XS', 'S', 'M', 'L'],
    colors: ['#4A3B32', '#111111', '#F5F5F0'],
    fabric: 'Virgin Wool Suiting Crepe',
    fit_type: 'Oversized Boyfriend Fit',
    description: 'A spaghetti-strap top and mini skirt set in a rich brown floral embroidered fabric with intricate sequin detailing. A low, backless silhouette with an adjustable tie-back on the top, finished with a potli-trimmed skirt hem for texture.\nFully lined for comfort, with a smooth side-zip closure on the skirt.',
    is_featured: true,
    is_active: true
  },
  {
    product_id: 102,
    title: 'CERULEAN GARDEN SET',
    price: 10990,
    sale_price: 13990,
    category_id: 18,
    brand: 'House of Urvaah',
    image_url: 'products/Blue02.png',
    images: ['products/Blue02.png', 'products/Blue03.png', 'products/Blue04.png', 'products/Blue01.png'],
    sizes: ['XS', 'S', 'M', 'L'],
    colors: ['#5B9BD5', '#111111'],
    fabric: 'Fluid Silk Blend',
    fit_type: 'Tailored Wide-Leg Fit',
    description: 'A halter-neck top and mini skirt set in a teal floral embroidered fabric, finished with all-over sequin detailing that catches the light with every move. The skirt hem is edged with a hand-finished potli trim for a playful, textured finish.\nFully lined for comfort, with an adjustable tie-back on the top for a customizable fit and a smooth side-zip closure on the skirt.\nStyle it for a beach day, a vacation dinner, or a night out — this one does double duty.',
    additional_info: 'Fabric: Embroidered fabric with sequin detailing\nSkirt hem: Hand-finished potli trim\nClosure: Adjustable tie-back (top), side zip on left of skirt\nLining: Fully lined (top and skirt)\nAvailable sizes: S, M, L\nTop: Lightly Padded',
    is_featured: true,
    is_active: true
  },
  {
    product_id: 103,
    title: 'GILDED MIST CORSET',
    price: 12990,
    sale_price: 15990,
    category_id: 18,
    brand: 'House of Urvaah',
    image_url: 'products/Corset01.png',
    images: ['products/Corset01.png', 'products/Corset02.png', 'products/Corset03.png', 'products/Corset04.png'],
    sizes: ['S', 'M', 'L'],
    colors: ['#FFFFFF', '#111111'],
    fabric: 'Artisan Cotton Jacquard',
    fit_type: 'Contoured Slim Fit',
    description: 'A statement corset top in raw tissue silk, hand-embroidered with rich golden zari work and delicate sequin detailing throughout. Boned below the bust for structure, with soft padding for comfort and shape no additional support needed underneath.\nDesigned to be worn endlessly: pair it over a saree for a modern draped look, with a skirt for evening, or dress it down with jeans or palazzos for a statement daytime moment. One corset, however many ways you want to style it.\nClosure: adjustable lace-up back.',
    is_featured: true,
    is_active: true
  },
  {
    product_id: 104,
    title: 'ROSEWOOD BLOOM SET',
    price: 4990,
    sale_price: 6490,
    category_id: 12,
    brand: 'House of Urvaah',
    image_url: 'products/Peach02.png',
    images: ['products/Peach02.png', 'products/Peach04.png', 'products/Peach03.png', 'products/Peach01.png'],
    sizes: ['S', 'M', 'L'],
    colors: ['#F5F5F0', '#111111'],
    fabric: 'Pure Silk Rib Knit',
    fit_type: 'Fitted',
    description: 'A cap-sleeve top and mini skirt set in a soft peach-pink floral embroidered fabric with delicate sequin work throughout. The skirt hem finishes in a hand-detailed potli trim, and a corset-style lace-up back on the top gives it a fitted, flattering silhouette.\nFully lined, with a side-zip closure on the skirt for easy wear.\nSoft enough for daytime, sharp enough for evening.',
    is_featured: true,
    is_active: true
  },
  {
    product_id: 105,
    title: 'CHESTNUT BLOOM SET',
    price: 8990,
    sale_price: 11990,
    category_id: 14,
    brand: 'House of Urvaah',
    image_url: 'products/Brown01.png',
    images: ['products/Brown01.png', 'products/Brown04.png', 'products/Brown02.png'],
    sizes: ['XS', 'S', 'M', 'L'],
    colors: ['#111111', '#F5F5F0', '#4A3B32'],
    fabric: 'Virgin Wool Blend',
    fit_type: 'Oversized',
    description: 'Structured double-breasted blazer made of premium virgin wool blend with peak lapels, flap pockets, and dual back vents.',
    is_featured: false,
    is_active: true
  },
  {
    product_id: 106,
    title: 'GILDED MIST CORSET',
    price: 12990,
    sale_price: 15990,
    category_id: 11,
    brand: 'House of Urvaah',
    image_url: 'products/Corset04.png',
    images: ['products/Corset01.png', 'products/Corset02.png', 'products/Corset03.png', 'products/Corset04.png'],
    sizes: ['S', 'M', 'L'],
    colors: ['#FFFFFF', '#111111'],
    fabric: 'Artisan Cotton Jacquard',
    fit_type: 'Contoured Slim Fit',
    description: 'A statement corset top in raw tissue silk, hand-embroidered with rich golden zari work and delicate sequin detailing throughout. Boned below the bust for structure, with soft padding for comfort and shape no additional support needed underneath.\nDesigned to be worn endlessly: pair it over a saree for a modern draped look, with a skirt for evening, or dress it down with jeans or palazzos for a statement daytime moment. One corset, however many ways you want to style it.\nClosure: adjustable lace-up back.',
    is_featured: false,
    is_active: true
  },
  {
    product_id: 107,
    title: 'OVERSIZED TRENCH COAT WITH BELT',
    price: 14990,
    sale_price: 18990,
    category_id: 14,
    brand: 'House of Urvaah',
    image_url: 'products/Brown04.png',
    images: ['products/Brown04.png', 'products/Brown01.png', 'products/Brown03.png'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['#C9A66B', '#111111'],
    fabric: 'Water-Resistant Cotton Gabardine',
    fit_type: 'Relaxed Trench Fit',
    description: 'Water-resistant double-breasted trench coat with storm flap, adjustable waist belt, shoulder epaulettes, and horn buttons.',
    is_featured: false,
    is_active: true
  },
  {
    product_id: 108,
    title: 'RIBBED CASHMERE TURTLENECK SWEATER',
    price: 7990,
    sale_price: 9990,
    category_id: 13,
    brand: 'House of Urvaah',
    image_url: 'products/Peach04.png',
    images: ['products/Peach04.png', 'products/Peach02.png', 'products/Peach01.png'],
    sizes: ['XS', 'S', 'M', 'L'],
    colors: ['#F5F5F0', '#111111', '#8B0000'],
    fabric: '100% Grade-A Mongolian Cashmere',
    fit_type: 'Relaxed Ribbed Fit',
    description: 'Pure Grade-A Mongolian cashmere sweater with ultra-soft ribbed knit texture, wide relaxed cuffs, and double-fold turtleneck.',
    is_featured: false,
    is_active: true
  }
];

async function seedDatabase() {
  const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('--- EXECUTING SEEDING PROCESS ---');

    // 1. Seed Categories
    for (const cat of SEED_CATEGORIES) {
      await pool.query(`
        INSERT INTO categories (id, name, description, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (id) DO UPDATE 
        SET name = EXCLUDED.name, description = EXCLUDED.description;
      `, [cat.id, cat.name, cat.description]);
      console.log(`✅ Category inserted/updated: ${cat.name}`);
    }

    // 2. Seed Products
    for (const p of SEED_PRODUCTS) {
      await pool.query(`
        INSERT INTO products (
          product_id, id, title, price, sale_price, category_id, brand,
          image_url, images, sizes, colors, fabric, fit_type,
          description, is_featured, is_active, stock_quantity, created_at, updated_at
        ) VALUES (
          $1, $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, 50, NOW(), NOW()
        )
        ON CONFLICT (product_id) DO UPDATE SET
          title = EXCLUDED.title,
          price = EXCLUDED.price,
          sale_price = EXCLUDED.sale_price,
          category_id = EXCLUDED.category_id,
          image_url = EXCLUDED.image_url,
          images = EXCLUDED.images,
          updated_at = NOW();
      `, [
        p.product_id, p.title, p.price, p.sale_price, p.category_id, p.brand,
        p.image_url, p.images, p.sizes, p.colors, p.fabric, p.fit_type,
        p.description, p.is_featured, p.is_active
      ]);
      console.log(`✅ Product inserted/updated: [${p.product_id}] ${p.title}`);
    }

    console.log('🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Seeding Error:', err.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
