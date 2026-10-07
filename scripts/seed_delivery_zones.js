/**
 * Seed script for delivery_zones table in PostgreSQL database
 */
const pool = require('../src/config/db');

const PUNE_PINCODES = [
  '411001', '411002', '411004', '411005', '411006', '411007', '411013', '411014', '411017', '411021',
  '411027', '411028', '411032', '411033', '411035', '411037', '411038', '411039', '411040', '411042',
  '411043', '411044', '411045', '411046', '411048', '411051', '411052', '411057', '411058', '411061'
];

const MUMBAI_PINCODES = [
  '400001', '400002', '400003', '400004', '400005', '400006', '400007', '400008', '400009', '400010',
  '400011', '400012', '400013', '400014', '400015', '400016', '400017', '400018', '400019', '400020',
  '400021', '400022', '400023', '400024', '400025', '400026', '400027', '400028', '400029', '400030',
  '400031', '400032', '400033', '400034', '400035', '400036', '400037', '400050', '400051', '400053',
  '400058', '400065', '400069', '400075', '400078', '400082', '400084', '400085', '400093', '400094',
  '400099', '400104'
];

const OTHER_METRO_ZONES = [
  { pincode: '110001', zone: 'DELHI_NCR', city: 'New Delhi', state: 'Delhi', min: 3, max: 4 },
  { pincode: '560001', zone: 'BENGALURU', city: 'Bengaluru', state: 'Karnataka', min: 3, max: 4 },
  { pincode: '600001', zone: 'CHENNAI', city: 'Chennai', state: 'Tamil Nadu', min: 3, max: 5 },
  { pincode: '700001', zone: 'KOLKATA', city: 'Kolkata', state: 'West Bengal', min: 3, max: 5 },
  { pincode: '500001', zone: 'HYDERABAD', city: 'Hyderabad', state: 'Telangana', min: 3, max: 4 }
];

async function seedDeliveryZones() {
  try {
    console.log('[Seed] Ensuring delivery_zones table exists...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_zones (
        id SERIAL PRIMARY KEY,
        pincode VARCHAR(10) UNIQUE NOT NULL,
        zone VARCHAR(50) NOT NULL,
        city VARCHAR(50) NOT NULL,
        state VARCHAR(50) NOT NULL DEFAULT 'Maharashtra',
        is_serviceable BOOLEAN DEFAULT true,
        delivery_min_days INT DEFAULT 2,
        delivery_max_days INT DEFAULT 3,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_delivery_zones_pincode ON delivery_zones(pincode);
    `);

    console.log('[Seed] Seeding Pune delivery zones...');
    for (const pin of PUNE_PINCODES) {
      await pool.query(
        `INSERT INTO delivery_zones (pincode, zone, city, state, is_serviceable, delivery_min_days, delivery_max_days)
         VALUES ($1, 'PUNE', 'Pune', 'Maharashtra', true, 2, 3)
         ON CONFLICT (pincode) DO UPDATE SET is_serviceable = true, updated_at = CURRENT_TIMESTAMP`,
        [pin]
      );
    }

    console.log('[Seed] Seeding Mumbai delivery zones...');
    for (const pin of MUMBAI_PINCODES) {
      await pool.query(
        `INSERT INTO delivery_zones (pincode, zone, city, state, is_serviceable, delivery_min_days, delivery_max_days)
         VALUES ($1, 'MUMBAI', 'Mumbai', 'Maharashtra', true, 2, 3)
         ON CONFLICT (pincode) DO UPDATE SET is_serviceable = true, updated_at = CURRENT_TIMESTAMP`,
        [pin]
      );
    }

    console.log('[Seed] Seeding Other Metro delivery zones...');
    for (const item of OTHER_METRO_ZONES) {
      await pool.query(
        `INSERT INTO delivery_zones (pincode, zone, city, state, is_serviceable, delivery_min_days, delivery_max_days)
         VALUES ($1, $2, $3, $4, true, $5, $6)
         ON CONFLICT (pincode) DO UPDATE SET is_serviceable = true, updated_at = CURRENT_TIMESTAMP`,
        [item.pincode, item.zone, item.city, item.state, item.min, item.max]
      );
    }

    console.log('✅ Successfully seeded delivery_zones table in database!');
    process.exit(0);
  } catch (err) {
    console.error('💥 Error seeding delivery_zones:', err);
    process.exit(1);
  }
}

seedDeliveryZones();
