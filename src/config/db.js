const { Pool, types } = require('pg');
require('dotenv').config({ override: true });

// Force TIMESTAMP (oid 1114) to be parsed as UTC to avoid local timezone offset shifts
types.setTypeParser(1114, (val) => {
    return val ? new Date(val + 'Z') : null;
});

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;

const poolConfig = connectionString 
    ? {
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        user: process.env.PGUSER,
        host: process.env.PGHOST,
        database: process.env.PGDATABASE,
        password: process.env.PGPASSWORD,
        port: parseInt(process.env.PGPORT || '6543', 10),
        ssl: {
            rejectUnauthorized: false
        },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err.message);
});

// Non-blocking auto migration check
if (process.env.NODE_ENV !== 'production' || process.env.RUN_AUTO_MIGRATIONS === 'true') {
    pool.query(`
        ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    `).catch((err) => {
        console.warn('[DB Auto Migration Warning] Could not check/add delivered_at column:', err.message);
    });
}

module.exports = pool;


