const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                value = value.replace(/^"|"$/g, '');
            }
            process.env[key] = value.trim();
        }
    });
}

const pool = require('../src/config/db');

async function runMigration() {
    console.log("Running migration to add name_options and product_details to products table...");
    try {
        await pool.query(`
            ALTER TABLE products 
              ADD COLUMN IF NOT EXISTS name_options JSONB DEFAULT '[]'::jsonb,
              ADD COLUMN IF NOT EXISTS product_details JSONB DEFAULT '[]'::jsonb;
        `);
        console.log("✅ Successfully added name_options and product_details columns to products table.");
    } catch (err) {
        console.error("❌ Migration error:", err);
    } finally {
        await pool.end();
    }
}

runMigration();
