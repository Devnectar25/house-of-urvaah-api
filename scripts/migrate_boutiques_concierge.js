const pool = require('../src/config/db');

async function migrate() {
  console.log('Running Boutiques & Concierge migration...');
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ui_concierge_settings (
        id SERIAL PRIMARY KEY,
        section_badge VARCHAR(100) DEFAULT 'CLIENT SERVICES',
        section_title VARCHAR(150) DEFAULT 'ATELIER CONCIERGE',
        email VARCHAR(255) DEFAULT 'concierge@houseofurvaah.com',
        phone VARCHAR(100) DEFAULT '+91 22 4900 8800',
        hours VARCHAR(255) DEFAULT 'Monday – Saturday: 10:00 AM – 8:00 PM IST',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS public.ui_boutique_locations (
        id SERIAL PRIMARY KEY,
        section_badge VARCHAR(100) DEFAULT 'FLAGSHIP BOUTIQUES',
        section_title VARCHAR(150) DEFAULT 'ATELIER LOCATIONS',
        name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        phone VARCHAR(100),
        is_primary BOOLEAN DEFAULT false,
        display_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const cCount = await pool.query('SELECT COUNT(*) FROM public.ui_concierge_settings');
  if (parseInt(cCount.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO public.ui_concierge_settings (section_badge, section_title, email, phone, hours)
      VALUES ('CLIENT SERVICES', 'ATELIER CONCIERGE', 'concierge@houseofurvaah.com', '+91 22 4900 8800', 'Monday – Saturday: 10:00 AM – 8:00 PM IST')
    `);
    console.log('Seeded ui_concierge_settings');
  }

  const bCount = await pool.query('SELECT COUNT(*) FROM public.ui_boutique_locations');
  if (parseInt(bCount.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO public.ui_boutique_locations (section_badge, section_title, name, address, phone, is_primary, display_order, is_active)
      VALUES 
      ('FLAGSHIP BOUTIQUES', 'ATELIER LOCATIONS', 'House of Urvaah', E'Kala Ghoda Arts District,\\nColaba Causeway, Mumbai 400001', '+91 22 4900 8800', true, 1, true),
      ('FLAGSHIP BOUTIQUES', 'ATELIER LOCATIONS', 'NEW DELHI CONCIERGE & SHOWROOM', 'Mehrauli Heritage District, Style Mile, New Delhi 110030', '+91 11 4800 7700', false, 2, true)
    `);
    console.log('Seeded ui_boutique_locations');
  }

  console.log('✅ Boutiques & Concierge migration completed successfully!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
