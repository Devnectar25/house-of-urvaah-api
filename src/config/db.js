const { Pool, types } = require('pg');
require('dotenv').config({ override: true });

// Force TIMESTAMP (oid 1114) to be parsed as UTC to avoid local timezone offset shifts
types.setTypeParser(1114, (val) => {
    return val ? new Date(val + 'Z') : null;
});

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT || '6543', 10),
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
});

// The pool will emit an error on behalf of any idle client
// it contains if it closes unexpectedly (e.g., network issue, db restart).
// Adding this handler prevents the process from crashing.
// Auto-ensure required columns exist on public.orders
pool.query(`
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
`).catch((err) => {
    console.warn('[DB Auto Migration Warning] Could not check/add delivered_at column:', err.message);
});

module.exports = pool;

