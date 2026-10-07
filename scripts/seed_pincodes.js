/**
 * Seed script for serviceable pincodes
 */
const pool = require('../src/config/db');

const PINCODES = [
  // Pune Pincodes
  '411001', '411002', '411004', '411005', '411006', '411007', '411013', '411014', '411017', '411021',
  '411027', '411028', '411032', '411033', '411035', '411037', '411038', '411039', '411040', '411042',
  '411043', '411044', '411045', '411046', '411048', '411051', '411052', '411057', '411058', '411061',
  // Mumbai Pincodes
  '400001', '400002', '400003', '400004', '400005', '400006', '400007', '400008', '400009', '400010',
  '400011', '400012', '400013', '400014', '400015', '400016', '400017', '400018', '400019', '400020',
  '400021', '400022', '400023', '400024', '400025', '400026', '400027', '400028', '400029', '400030',
  '400031', '400032', '400033', '400034', '400035', '400036', '400037', '400050', '400051', '400053',
  '400058', '400065', '400069', '400075', '400078', '400082', '400084', '400085', '400093', '400094',
  '400099', '400104'
];

async function seedPincodes() {
  try {
    console.log('Creating table serviceable_pincodes if not exists...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS serviceable_pincodes (
        pincode VARCHAR(10) PRIMARY KEY,
        city VARCHAR(50) DEFAULT 'India',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log(`Seeding ${PINCODES.length} pincodes into database...`);
    for (const pin of PINCODES) {
      const city = pin.startsWith('411') ? 'Pune' : 'Mumbai';
      await pool.query(
        `INSERT INTO serviceable_pincodes (pincode, city) VALUES ($1, $2) ON CONFLICT (pincode) DO UPDATE SET is_active = true`,
        [pin, city]
      );
    }
    console.log('Successfully seeded all serviceable pincodes!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding pincodes:', err);
    process.exit(1);
  }
}

seedPincodes();
