const pool = require('../src/config/db');

async function migrate() {
    try {
        console.log('Migrating reviews table: adding images and image_url columns...');
        await pool.query(`
            ALTER TABLE reviews 
            ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS image_url TEXT;
        `);
        console.log('✅ Migration successful: images and image_url columns added to reviews table.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
