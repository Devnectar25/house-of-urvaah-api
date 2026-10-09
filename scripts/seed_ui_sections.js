const pool = require('../src/config/db');

async function seedUiSections() {
  console.log('Seeding UI Sections...');

  // 1. Ensure schema updates
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ui_hero_slides (
        id SERIAL PRIMARY KEY,
        heading TEXT,
        subheading TEXT,
        desktop_image TEXT NOT NULL,
        mobile_image TEXT,
        media_type VARCHAR(20) DEFAULT 'video',
        button_text VARCHAR(100) DEFAULT 'EXPLORE NOW',
        button_link TEXT DEFAULT '/clothing',
        display_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE public.ui_hero_slides ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) DEFAULT 'video';

    CREATE TABLE IF NOT EXISTS public.ui_dual_campaign (
        id SERIAL PRIMARY KEY,
        position VARCHAR(20) NOT NULL UNIQUE,
        image TEXT NOT NULL,
        title TEXT,
        subtitle TEXT,
        button_text VARCHAR(100) DEFAULT 'EXPLORE LOOK',
        link TEXT DEFAULT '/product/bs-102',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS public.ui_trending_gram (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        image TEXT NOT NULL,
        media_type VARCHAR(20) DEFAULT 'video',
        caption TEXT,
        post_link TEXT DEFAULT 'https://www.instagram.com/houseofurvaah/',
        display_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE public.ui_trending_gram ADD COLUMN IF NOT EXISTS title VARCHAR(255);
    ALTER TABLE public.ui_trending_gram ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) DEFAULT 'video';

    CREATE TABLE IF NOT EXISTS public.ui_fabric_video (
        id SERIAL PRIMARY KEY,
        video_url TEXT NOT NULL,
        poster_url TEXT,
        heading TEXT DEFAULT 'THE ART OF REFINED TAILORING',
        description TEXT DEFAULT 'Defined by oversized silhouettes, fluid draping, and uncompromised material integrity. Designed for timeless elegance across seasonal transitions.',
        button_text VARCHAR(100) DEFAULT 'DISCOVER THE COLLECTION',
        button_link TEXT DEFAULT '#lookbook',
        autoplay BOOLEAN DEFAULT true,
        muted BOOLEAN DEFAULT true,
        loop_video BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Seed Hero Slides
  const heroCheck = await pool.query('SELECT COUNT(*) FROM ui_hero_slides');
  if (parseInt(heroCheck.rows[0].count, 10) === 0) {
    await pool.query(`
      INSERT INTO ui_hero_slides 
        (heading, subheading, desktop_image, mobile_image, media_type, button_text, button_link, display_order, is_active)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      'HOUSE OF URVAAH',
      'AUTUMN / WINTER 2026 ATELIER',
      'https://fhbdceauisvlcpmuzpmf.supabase.co/storage/v1/object/public/houseofurvaah-media/videos/HOU_desktop%20video.mp4.mp4',
      '/assets/video/Hero-section-video-two.mp4',
      'video',
      'EXPLORE COLLECTION',
      '/clothing',
      1,
      true
    ]);
    console.log('✓ Seeded Hero Slides');
  } else {
    console.log('• Hero Slides already has data');
  }

  // 3. Seed Dual Campaign Banner (4 sections with Supabase CDN images)
  const SUPABASE_CDN = 'https://fhbdceauisvlcpmuzpmf.supabase.co/storage/v1/object/public/houseofurvaah-media';
  await pool.query(`
    INSERT INTO ui_dual_campaign (position, image, images, title, subtitle, button_text, link, is_active)
    VALUES 
      ('top_left', '${SUPABASE_CDN}/Images/Blue_Halter.jpg', '["${SUPABASE_CDN}/Images/Blue_Halter.jpg", "${SUPABASE_CDN}/Images/Blue02.png", "${SUPABASE_CDN}/Images/Blue03.png"]'::jsonb, 'BLUE EMBROIDERED CO-ORD', 'ARCHITECTURAL SILHOUETTE', 'EXPLORE LOOK', '/product/bs-102', true)
    ON CONFLICT (position) DO NOTHING;

    INSERT INTO ui_dual_campaign (position, image, images, title, subtitle, button_text, link, is_active)
    VALUES 
      ('bottom_left', '${SUPABASE_CDN}/Images/Peach02.png', '["${SUPABASE_CDN}/Images/Peach02.png", "${SUPABASE_CDN}/Images/Peach01.png", "${SUPABASE_CDN}/Images/Peach03.png"]'::jsonb, 'PEACH SILK ENSEMBLE', 'TIMELESS DRAPERY', 'EXPLORE LOOK', '/product/bs-104', true)
    ON CONFLICT (position) DO NOTHING;

    INSERT INTO ui_dual_campaign (position, image, images, title, subtitle, button_text, link, is_active)
    VALUES 
      ('top_right', '${SUPABASE_CDN}/Images/Brown_Floral.jpg', '["${SUPABASE_CDN}/Images/Brown_Floral.jpg", "${SUPABASE_CDN}/Images/Brown02.png", "${SUPABASE_CDN}/Images/Brown03.png"]'::jsonb, 'BROWN TAILORED SUITING', 'HERITAGE COUTURE', 'EXPLORE LOOK', '/product/bs-101', true)
    ON CONFLICT (position) DO NOTHING;

    INSERT INTO ui_dual_campaign (position, image, images, title, subtitle, button_text, link, is_active)
    VALUES 
      ('bottom_right', '${SUPABASE_CDN}/Images/Corset01.png', '["${SUPABASE_CDN}/Images/Corset01.png", "${SUPABASE_CDN}/Images/Corset02.png", "${SUPABASE_CDN}/Images/Corset04.png"]'::jsonb, 'EMBROIDERED CORSET SET', 'ARTISAN STRUCTURE', 'EXPLORE LOOK', '/product/bs-103', true)
    ON CONFLICT (position) DO NOTHING;
  `);
  console.log('✓ Ensured Dual Campaign Banner rows (4 sections with Supabase CDN URLs)');

  // 4. Seed Trending on the Gram
  const gramCheck = await pool.query('SELECT COUNT(*) FROM ui_trending_gram');
  if (parseInt(gramCheck.rows[0].count, 10) === 0) {
    const gramPosts = [
      {
        title: 'CORSET TOPS',
        image: '/assets/video/video6.mp4',
        media_type: 'video',
        caption: 'STUDIO EDIT • Artisan embroidered structured corset top featuring contour boning.',
        post_link: 'https://www.instagram.com/houseofurvaah/',
        order: 1
      },
      {
        title: 'CO-ORD SETS',
        image: '/assets/video/Video2.mp4',
        media_type: 'video',
        caption: 'RESORT WEAR • Handcrafted floral co-ord set with matching tiered skirt.',
        post_link: 'https://www.instagram.com/houseofurvaah/',
        order: 2
      },
      {
        title: 'PARTY WEAR',
        image: '/assets/video/Video4.mp4',
        media_type: 'video',
        caption: 'EVENING SILHOUETTES • Festive brocade bustier top paired with matching skirt.',
        post_link: 'https://www.instagram.com/houseofurvaah/',
        order: 3
      },
      {
        title: 'SILK & SATIN',
        image: '/assets/video/Video5.mp4',
        media_type: 'video',
        caption: 'TIMELESS LUXURY • Pure mulberry silk mid-length silhouette with cowl neckline.',
        post_link: 'https://www.instagram.com/houseofurvaah/',
        order: 4
      },
      {
        title: 'SUMMER DRESSES',
        image: '/assets/video/Video3.mp4',
        media_type: 'video',
        caption: 'EDITORIAL CAPSULE • Airy cyan blue botanical printed halter ensemble.',
        post_link: 'https://www.instagram.com/houseofurvaah/',
        order: 5
      }
    ];

    for (const post of gramPosts) {
      await pool.query(`
        INSERT INTO ui_trending_gram 
          (title, image, media_type, caption, post_link, display_order, is_active)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7)
      `, [post.title, post.image, post.media_type, post.caption, post.post_link, post.order, true]);
    }
    console.log('✓ Seeded 5 Trending on the Gram posts');
  } else {
    console.log('• Trending on the Gram already has data');
  }

  // 5. Seed Fabric Video Banner
  const fabricCheck = await pool.query('SELECT COUNT(*) FROM ui_fabric_video');
  if (parseInt(fabricCheck.rows[0].count, 10) === 0) {
    await pool.query(`
      INSERT INTO ui_fabric_video 
        (video_url, poster_url, heading, description, button_text, button_link, autoplay, muted, loop_video, is_active)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      'https://fhbdceauisvlcpmuzpmf.supabase.co/storage/v1/object/public/houseofurvaah-media/videos/Blush%20Pink%20Embroidered%20Floral%20Co-Ord%20Set_h264.mp4',
      '/assets/Images/Brown01.png',
      'THE ART OF REFINED TAILORING',
      'Defined by oversized silhouettes, fluid draping, and uncompromised material integrity. Designed for timeless elegance across seasonal transitions.',
      'DISCOVER THE COLLECTION',
      '#lookbook',
      true,
      true,
      true,
      true
    ]);
    console.log('✓ Seeded Fabric Video');
  } else {
    console.log('• Fabric Video already has data');
  }

  console.log('All UI sections verified & ready!');
  process.exit(0);
}

seedUiSections().catch((err) => {
  console.error('Error seeding UI sections:', err);
  process.exit(1);
});
