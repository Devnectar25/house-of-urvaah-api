const pool = require('../src/config/db');

async function migrate() {
  console.log('Updating stock_notification_jobs schema...');
  
  await pool.query(`
    DO $$
    BEGIN
      -- Drop old foreign key constraint if it exists
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'stock_notification_jobs_subscription_id_fkey'
      ) THEN
        ALTER TABLE stock_notification_jobs DROP CONSTRAINT stock_notification_jobs_subscription_id_fkey;
      END IF;
    END $$;

    ALTER TABLE stock_notification_jobs ALTER COLUMN subscription_id DROP NOT NULL;

    ALTER TABLE stock_notification_jobs 
    ADD CONSTRAINT stock_notification_jobs_subscription_id_fkey 
    FOREIGN KEY (subscription_id) REFERENCES stock_notification_subscriptions(id) ON DELETE SET NULL;

    ALTER TABLE stock_notification_jobs ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
    ALTER TABLE stock_notification_jobs ADD COLUMN IF NOT EXISTS product_id INTEGER;
    ALTER TABLE stock_notification_jobs ADD COLUMN IF NOT EXISTS product_title TEXT;
  `);

  console.log('✅ Schema migration completed successfully');
  process.exit(0);
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
