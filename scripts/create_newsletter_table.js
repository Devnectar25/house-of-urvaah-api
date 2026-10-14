const pool = require('../src/config/db');

async function migrate() {
  const sql = `
    CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'subscribed',
        source VARCHAR(100) DEFAULT 'footer',
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON public.newsletter_subscribers(email);
    CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status ON public.newsletter_subscribers(status);
    CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created_at ON public.newsletter_subscribers(created_at DESC);
  `;

  try {
    await pool.query(sql);
    console.log('✅ TABLE newsletter_subscribers created or verified successfully!');
  } catch (err) {
    console.error('❌ Error creating newsletter_subscribers table:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
