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
pool.on('error', (err, client) => {
    console.error('[DB Pool Error] Unexpected error on idle client:', err.message);
    // Don't exit process, just log. The pool will discard the bad client.
});

module.exports = pool;

