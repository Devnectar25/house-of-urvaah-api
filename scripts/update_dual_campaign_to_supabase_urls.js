const pool = require('../src/config/db');

const CDN_BASE = 'https://fhbdceauisvlcpmuzpmf.supabase.co/storage/v1/object/public/houseofurvaah-media';

function toSupabaseUrl(path) {
  if (!path || typeof path !== 'string') return '';
  const clean = path.trim();
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
  let normalized = clean.replace(/^\/?(assets\/)?/, '');
  if (!normalized.startsWith('Images/') && !normalized.startsWith('products/') && !normalized.startsWith('campaign/')) {
    normalized = `Images/${normalized}`;
  }
  return `${CDN_BASE}/${normalized}`;
}

async function updateUrls() {
  console.log('Converting all dual campaign images to Supabase URLs...');

  const SUPABASE_DEFAULTS = {
    top_left: [
      `${CDN_BASE}/Images/Blue_Halter.jpg`,
      `${CDN_BASE}/Images/Blue02.png`,
      `${CDN_BASE}/Images/Blue03.png`
    ],
    bottom_left: [
      `${CDN_BASE}/Images/Peach02.png`,
      `${CDN_BASE}/Images/Peach01.png`,
      `${CDN_BASE}/Images/Peach03.png`
    ],
    top_right: [
      `${CDN_BASE}/Images/Brown_Floral.jpg`,
      `${CDN_BASE}/Images/Brown02.png`,
      `${CDN_BASE}/Images/Brown03.png`
    ],
    bottom_right: [
      `${CDN_BASE}/Images/Corset01.png`,
      `${CDN_BASE}/Images/Corset02.png`,
      `${CDN_BASE}/Images/Corset04.png`
    ]
  };

  const rows = await pool.query('SELECT * FROM public.ui_dual_campaign');
  for (const r of rows.rows) {
    let images = r.images;
    if (typeof images === 'string') {
      try { images = JSON.parse(images); } catch (_) { images = []; }
    }
    if (!Array.isArray(images) || images.length === 0) {
      images = SUPABASE_DEFAULTS[r.position] || [];
    } else {
      images = images.map((img) => toSupabaseUrl(img));
    }

    const primaryImage = images[0] || toSupabaseUrl(r.image);

    await pool.query(
      `UPDATE public.ui_dual_campaign 
       SET images = $1::jsonb, 
           image = $2,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [JSON.stringify(images), primaryImage, r.id]
    );
  }

  const updatedRows = await pool.query('SELECT position, images, image FROM public.ui_dual_campaign ORDER BY id');
  console.log('Updated rows:');
  console.log(JSON.stringify(updatedRows.rows, null, 2));
  process.exit(0);
}

updateUrls().catch((err) => {
  console.error('Failed to update URLs:', err);
  process.exit(1);
});
