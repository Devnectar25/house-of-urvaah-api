const pool = require('../src/config/db');

async function migrateDualCampaign() {
  console.log('Running dual campaign 4-sections migration...');

  // 1. Update columns
  await pool.query(`
    ALTER TABLE public.ui_dual_campaign ALTER COLUMN position TYPE VARCHAR(50);
    ALTER TABLE public.ui_dual_campaign ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
    
    -- Rename left -> top_left, right -> top_right if needed
    UPDATE public.ui_dual_campaign SET position = 'top_left' WHERE position = 'left';
    UPDATE public.ui_dual_campaign SET position = 'top_right' WHERE position = 'right';

    -- Insert bottom_left if not exists
    INSERT INTO public.ui_dual_campaign (position, image, images, title, subtitle, button_text, link, is_active)
    VALUES (
      'bottom_left', 
      '/assets/Images/Peach02.png', 
      '["/assets/Images/Peach02.png", "/assets/Images/Peach01.png", "/assets/Images/Peach03.png"]'::jsonb, 
      'PEACH SILK ENSEMBLE', 
      'TIMELESS DRAPERY', 
      'EXPLORE LOOK', 
      '/product/bs-104', 
      true
    )
    ON CONFLICT (position) DO NOTHING;

    -- Insert bottom_right if not exists
    INSERT INTO public.ui_dual_campaign (position, image, images, title, subtitle, button_text, link, is_active)
    VALUES (
      'bottom_right', 
      '/assets/Images/Corset01.png', 
      '["/assets/Images/Corset01.png", "/assets/Images/Corset02.png", "/assets/Images/Corset04.png"]'::jsonb, 
      'EMBROIDERED CORSET SET', 
      'ARTISAN STRUCTURE', 
      'EXPLORE LOOK', 
      '/product/bs-103', 
      true
    )
    ON CONFLICT (position) DO NOTHING;
  `);

  // 2. Ensure each row has valid images array populated
  const rowsRes = await pool.query('SELECT * FROM public.ui_dual_campaign');
  for (const r of rowsRes.rows) {
    let imgs = r.images;
    if (typeof imgs === 'string') {
      try { imgs = JSON.parse(imgs); } catch (_) { imgs = []; }
    }
    if (!imgs || !Array.isArray(imgs) || imgs.length === 0) {
      if (r.position === 'top_left') {
        imgs = [r.image || '/assets/Images/Blue_Halter.jpg', '/assets/Images/Blue02.png', '/assets/Images/Blue03.png'];
      } else if (r.position === 'top_right') {
        imgs = ['/assets/Images/Brown_Floral.jpg', r.image || '/assets/Images/Brown02.png', '/assets/Images/Brown03.png'];
      } else if (r.position === 'bottom_left') {
        imgs = ['/assets/Images/Peach02.png', '/assets/Images/Peach01.png', '/assets/Images/Peach03.png'];
      } else if (r.position === 'bottom_right') {
        imgs = ['/assets/Images/Corset01.png', '/assets/Images/Corset02.png', '/assets/Images/Corset04.png'];
      } else {
        imgs = [r.image];
      }
      await pool.query('UPDATE public.ui_dual_campaign SET images = $1 WHERE id = $2', [JSON.stringify(imgs), r.id]);
    }
  }

  const result = await pool.query('SELECT id, position, title, images, image, is_active FROM public.ui_dual_campaign ORDER BY id');
  console.log('Migration complete. Current rows:');
  console.log(JSON.stringify(result.rows, null, 2));
  process.exit(0);
}

migrateDualCampaign().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
