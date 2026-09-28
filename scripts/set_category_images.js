const pool = require('../src/config/db');

async function setProjectCategoryImages() {
  try {
    console.log('--- Setting Real Project File Images for Categories ---');

    // Use exact local file paths from public/assets/Images/ in house-of-urvaah-FE
    const categoryImageMap = [
      { name: 'CORSET TOPS', image: '/assets/Images/Corset01.png' },
      { name: 'CO-ORD SETS', image: '/assets/Images/Blue02.png' },
      { name: 'SUMMER DRESSES', image: '/assets/Images/Peach01.png' },
      { name: 'PARTY WEAR', image: '/assets/Images/Brown01.png' },
      { name: 'CO-ORD SET  TOPS', image: '/assets/Images/Peach02.png' }
    ];

    for (const item of categoryImageMap) {
      const res = await pool.query(
        'UPDATE categories SET category_image = $1, image_url = $1 WHERE UPPER(name) = $2 RETURNING id, name, category_image',
        [item.image, item.name.toUpperCase()]
      );
      if (res.rows.length > 0) {
        console.log(`Updated category "${item.name}" with project image: ${item.image}`);
      } else {
        console.log(`No match found for "${item.name}"`);
      }
    }

    // Fallback for any other categories
    await pool.query(
      "UPDATE categories SET category_image = '/assets/Images/Corset01.png', image_url = '/assets/Images/Corset01.png' WHERE category_image IS NULL OR category_image LIKE '%unsplash%'"
    );

    console.log('✅ Updated database with project file images!');
  } catch (err) {
    console.error('❌ Error updating category images:', err);
  } finally {
    process.exit(0);
  }
}

setProjectCategoryImages();
