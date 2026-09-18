/**
 * HOUSE OF URVAAH - PRODUCT & CATEGORY SEED SCRIPT
 */

const { Pool } = require('pg');
require('dotenv').config({ path: 'c:/Urvaah Workspace/Urvaah-BA/.env' });

const SEED_CATEGORIES = [
  { id: 10, name: 'CLOTHING', description: 'Dresses, Blazers, Co-ord Sets, Tops, Knitwear & Outerwear' },
  { id: 11, name: 'DRESSES', description: 'Silk & Satin Midis, Draped Maxis, Blazer Dresses & Minis' },
  { id: 12, name: 'TOPS', description: 'Oversized Linen Shirts, Corset Tops, Blouses & Knit Tops' },
  { id: 13, name: 'KNITWEAR', description: 'Cashmere Sweaters, Ribbed Knits, Cardigans & Vests' },
  { id: 14, name: 'OUTERWEAR', description: 'Oversized Trench Coats, Blazers, Wool Overcoats & Jackets' },
  { id: 15, name: 'TROUSERS', description: 'High-Waisted Wide Leg, Tailored Pants, Jeans & Satin Trousers' },
  { id: 16, name: 'SHOES', description: 'Leather Ankle Boots, Mule Heels, Sandals & Loafers' },
  { id: 17, name: 'BAGS & ACCESSORIES', description: 'Calfskin Shoulder Bags, Structured Totes, Belts & Jewelry' },
  { id: 18, name: 'CO-ORD SETS', description: 'Monochrome Sets, Printed Ensembles & Corset Sets' },
  { id: 19, name: 'NEW IN', description: 'Weekly Drop Capsule Collections & Runway Edits' }
];

const SEED_PRODUCTS = [
  {
    product_id: 101,
    title: 'OVERSIZED TAILORED BLAZER',
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
    description: 'Structured single-breasted blazer in warm taupe brown with padded shoulders, peak lapels, and hand-finished seams.',
    is_featured: true,
    is_active: true
  },
  {
    product_id: 102,
    title: 'DARK BLUE WIDE LEG TAILORED SET',
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
    description: 'Printed two-piece ensemble featuring a halter neck top and matching floral mini skirt with smocked waist.',
    is_featured: true,
    is_active: true
  },
  {
    product_id: 103,
    title: 'PEACH BLOOM CORSET SET',
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
    description: 'Floral embroidered corset bodice with sweetheart neckline, contour boning, and matching blossom skirt.',
    is_featured: true,
    is_active: true
  },
  {
    product_id: 104,
    title: 'MINIMALIST RIBBED SILK TOP',
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
    description: 'Fine silk rib knit fitted top in dusty rose blush with delicate crew neckline and subtle rib texture.',
    is_featured: true,
    is_active: true
  },
  {
    product_id: 105,
    title: 'DOUBLE-BREASTED OVERSIZED BLAZER',
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
    title: 'DRAPED ASYMMETRICAL SILK DRESS',
    price: 12990,
    sale_price: 15990,
    category_id: 11,
    brand: 'House of Urvaah',
    image_url: 'products/Corset04.png',
    images: ['products/Corset04.png', 'products/Peach01.png', 'products/Peach02.png'],
    sizes: ['S', 'M', 'L'],
    colors: ['#FFFFFF', '#111111'],
    fabric: '100% Mulberry Silk',
    fit_type: 'Fluid Bias-Cut Fit',
    description: 'Flowing mulberry silk mid-length dress with asymmetric draped cowl neckline, fluid side slit, and French seam finish.',
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
