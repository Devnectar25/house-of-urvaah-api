const pool = require('../src/config/db');

async function migrate() {
  try {
    console.log('Running OTP & Users table schema migration...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.otps (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        otp_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        failed_attempts INT DEFAULT 0,
        locked_until TIMESTAMP WITH TIME ZONE NULL,
        send_count INT DEFAULT 1,
        first_send_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await pool.query(`
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT TRUE;
    `);

    // In case password was NOT NULL in existing schema, drop NOT NULL constraint for OTP-created users
    await pool.query(`
      ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL;
    `).catch(() => {});

    console.log('OTP & Users table migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
