-- Migration: 007_stock_notifications_schema.sql
-- Description: Create tables for Stock Notification / Back-in-Stock Alert System

-- 1. Subscriptions Table
CREATE TABLE IF NOT EXISTS stock_notification_subscriptions (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(100),
    product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    size VARCHAR(50),
    color VARCHAR(50),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    channel VARCHAR(20) DEFAULT 'email', -- 'email', 'whatsapp', 'both'
    contact_verified BOOLEAN DEFAULT TRUE,
    verification_token VARCHAR(128),
    unsubscribe_token VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'pending', 'active', 'notified', 'cancelled'
    notified_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Partial index to enforce unique active/pending subscriptions per contact and variant
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_stock_sub_email 
ON stock_notification_subscriptions (
    product_id, 
    COALESCE(size, ''), 
    COALESCE(color, ''), 
    LOWER(contact_email)
) 
WHERE status IN ('active', 'pending') AND contact_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_stock_sub_phone 
ON stock_notification_subscriptions (
    product_id, 
    COALESCE(size, ''), 
    COALESCE(color, ''), 
    contact_phone
) 
WHERE status IN ('active', 'pending') AND contact_phone IS NOT NULL AND contact_email IS NULL;

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_stock_sub_product_status 
ON stock_notification_subscriptions (product_id, status);

CREATE INDEX IF NOT EXISTS idx_stock_sub_customer 
ON stock_notification_subscriptions (customer_id);

CREATE INDEX IF NOT EXISTS idx_stock_sub_email 
ON stock_notification_subscriptions (LOWER(contact_email));


-- 2. Restock Events Table
CREATE TABLE IF NOT EXISTS stock_notification_events (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    size VARCHAR(50),
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    event_key VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_events_product 
ON stock_notification_events (product_id, created_at DESC);


-- 3. Notification Jobs Table
CREATE TABLE IF NOT EXISTS stock_notification_jobs (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES stock_notification_subscriptions(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES stock_notification_events(id) ON DELETE SET NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'email',
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed'
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    provider_message_id TEXT,
    last_error TEXT,
    queued_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Idempotency constraint: Prevent duplicate jobs for the same subscription and event
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_job_sub_event 
ON stock_notification_jobs (subscription_id, event_id, channel);

CREATE INDEX IF NOT EXISTS idx_stock_jobs_status_queued 
ON stock_notification_jobs (status, queued_at);

CREATE INDEX IF NOT EXISTS idx_stock_jobs_subscription 
ON stock_notification_jobs (subscription_id);
