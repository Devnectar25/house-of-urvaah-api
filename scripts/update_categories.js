const pool = require('../src/config/db');

async function updateDbCategories() {
  try {
    console.log('--- Updating Database Categories ---');
    await pool.query('UPDATE products SET category_id = NULL');
    await pool.query('DELETE FROM category');

    const categories = [
      { id: 1, name: 'CORSET TOPS', description: 'Embroidered, Contoured & Strapless Corset Tops' },
      { id: 2, name: 'CO-ORD SETS', description: 'Matching Two-Piece Sets & Printed Ensembles' },
      { id: 3, name: 'SUMMER DRESSES', description: 'Breezy Linen, Silk & Floral Summer Dresses' },
      { id: 4, name: 'PARTY WEAR', description: 'Glamorous Cocktail Dresses & Evening Wear' }
    ];

    for (const cat of categories) {
      await pool.query(
        'INSERT INTO category (category_id, name, description, is_active, created_at) VALUES ($1, $2, $3, true, NOW())',
        [cat.id, cat.name, cat.description]
      );
    }
    console.log('✅ Categories table updated with 4 target categories.');

    const productCategoryMap = {
      101: 4, // BLAZER -> PARTY WEAR
      102: 2, // CO-ORD SET -> CO-ORD SETS
      103: 1, // CORSET SET -> CORSET TOPS
      104: 1, // SILK TOP -> CORSET TOPS
      105: 4, // BLAZER -> PARTY WEAR
      106: 3, // SILK DRESS -> SUMMER DRESSES
      107: 4, // TRENCH COAT -> PARTY WEAR
      108: 3, // SWEATER -> SUMMER DRESSES
      109: 2  // KURTI SET -> CO-ORD SETS
    };

    for (const [prodId, catId] of Object.entries(productCategoryMap)) {
      await pool.query('UPDATE products SET category_id = $1 WHERE product_id = $2', [catId, prodId]);
    }
    await pool.query('UPDATE products SET category_id = 4 WHERE category_id IS NULL');

    console.log('✅ Products updated with new category IDs.');
  } catch (err) {
    console.error('❌ Error updating DB:', err);
  } finally {
    await pool.end();
  }
}

updateDbCategories();
