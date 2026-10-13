const pool = require('../src/config/db');

const reviewsToSeed = [
  // Product 108: RIBBED CASHMERE TURTLENECK SWEATER
  { product_id: 108, user_id: 'Ananya Sharma', rating: 5, comment: '[Fit: True to Size] Pure Grade-A Mongolian cashmere feels incredibly soft against the skin. The ribbed knit structure and turtleneck drape beautifully. Worth every rupee.' },
  { product_id: 108, user_id: 'Rhea Singhania', rating: 5, comment: '[Fit: True to Size] Such an understated luxury piece. Keeps you warm without feeling heavy. I wore it for an evening in Shimla and received endless compliments.' },
  { product_id: 108, user_id: 'Meera Kapoor', rating: 4, comment: '[Fit: Slightly Loose] The cashmere quality is exceptional. Sleeves are slightly relaxed which adds a chic effortless vibe.' },
  { product_id: 108, user_id: 'Pooja Varma', rating: 5, comment: '[Fit: True to Size] The hand-feel is heavenly. One of the best cashmere investments in my wardrobe.' },

  // Product 105: Mocha Brown Embroidered Co-Ord Set
  { product_id: 105, user_id: 'Kavya Menon', rating: 5, comment: '[Fit: True to Size] Exquisite hand-embroidered floral work. The potli trim on the skirt hem adds such an artisanal touch.' },
  { product_id: 105, user_id: 'Tanya Sen', rating: 5, comment: '[Fit: True to Size] The back tie detail is so flattering. Stood out at a sundowner dinner. Extremely happy with the quality.' },
  { product_id: 105, user_id: 'Simran Gill', rating: 4, comment: '[Fit: True to Size] Rich brown tone with delicate sequin shimmer. Fabric is comfortable and fully lined.' },

  // Product 106: Sage Bloom Embroidered Corset
  { product_id: 106, user_id: 'Natasha Roy', rating: 5, comment: '[Fit: True to Size] Masterpiece. The golden zari embroidery on raw tissue silk is regal. Structured boning gives an immaculate silhouette without feeling restrictive.' },
  { product_id: 106, user_id: 'Zoya Merchant', rating: 5, comment: '[Fit: True to Size] Styled it over a vintage organza saree for a destination wedding. Absolute showstopper.' },
  { product_id: 106, user_id: 'Aditi Rao', rating: 5, comment: '[Fit: True to Size] Beautiful craftsmanship, padded bust support is very comfortable. The lace-up back allows a tailor-made fit.' },

  // Product 107: OVERSIZED TRENCH COAT WITH BELT
  { product_id: 107, user_id: 'Dia Oberoi', rating: 5, comment: '[Fit: True to Size] The tailored finish on this gabardine trench coat is world-class. Water-resistant and structured.' },
  { product_id: 107, user_id: 'Sanjana Mehta', rating: 4, comment: '[Fit: True to Size] Modern oversized cut, storm flap and horn buttons look so sophisticated.' },
  { product_id: 107, user_id: 'Nandini Sen', rating: 5, comment: '[Fit: True to Size] Perfect architectural silhouette for travel and layering.' },

  // Product 109: Ivory Heart Corset Kurti/Dress
  { product_id: 109, user_id: 'Avani Patel', rating: 5, comment: '[Fit: True to Size] Breathable cora cotton with heart-shaped butti embroidery. The lace-up back gives a snatched waist look.' },
  { product_id: 109, user_id: 'Shreya Joshi', rating: 5, comment: '[Fit: True to Size] Love that I can wear it buttoned as a dress or unbuttoned as a chic kurti over denim.' },
  { product_id: 109, user_id: 'Bhavna Chawla', rating: 4, comment: '[Fit: True to Size] Delicate floral lace trim and premium cotton lining. Perfect summer luxury.' },

  // Product 24: short kurti
  { product_id: 24, user_id: 'Radhika K.', rating: 5, comment: '[Fit: True to Size] Subtle artisanal embroidery and lightweight breathable texture. Very graceful.' },
  { product_id: 24, user_id: 'Priya D.', rating: 4, comment: '[Fit: True to Size] Elegant everyday silhouette, great fit.' },

  // Product 102 additions
  { product_id: 102, user_id: 'Devika Nambiar', rating: 5, comment: '[Fit: True to Size] The teal hue and sequin detailing catch the evening light enchantingly.' },
  { product_id: 102, user_id: 'Isha Malhotra', rating: 5, comment: '[Fit: True to Size] Halter neck and potli trim skirt are sensational. Premium craftsmanship.' }
];

async function seed() {
  for (const r of reviewsToSeed) {
    const existing = await pool.query('SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2', [r.product_id, r.user_id]);
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO reviews (product_id, user_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [r.product_id, r.user_id, r.rating, r.comment]
      );
    }
  }

  const distinctProducts = await pool.query('SELECT DISTINCT product_id FROM reviews');
  for (const row of distinctProducts.rows) {
    await pool.query(
      `UPDATE products 
       SET rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE product_id = $1), 0),
           reviews_count = COALESCE((SELECT COUNT(*) FROM reviews WHERE product_id = $1), 0)
       WHERE product_id = $1`,
      [row.product_id]
    );
  }

  console.log('Seeded reviews successfully!');
  const check = await pool.query('SELECT product_id, title, rating, reviews_count FROM products WHERE product_id IN (102, 104, 105, 106, 107, 108, 109, 24) ORDER BY product_id');
  console.log(check.rows);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
