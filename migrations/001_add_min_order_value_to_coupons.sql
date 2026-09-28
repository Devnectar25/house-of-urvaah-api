-- Migration: Add missing min_order_value and supporting tables/columns to coupons schema
-- Date: 2026-09-28
-- Description: Adds min_order_value column with NUMERIC(10,2) NOT NULL DEFAULT 0 and check constraint min_order_value >= 0, along with missing form/backend columns and scope/assignment join tables.

-- 1. Add min_order_value column
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_order_value NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Guard constraint so re-running migration doesn't fail
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'coupons_min_order_value_nonnegative'
    ) THEN
        ALTER TABLE coupons ADD CONSTRAINT coupons_min_order_value_nonnegative CHECK (min_order_value >= 0);
    END IF;
END $$;

-- 2. Add other missing columns used by coupon form and backend queries
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS usage_limit INT DEFAULT NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS apply_to VARCHAR(50) DEFAULT 'all';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS category_id INT DEFAULT NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS brand_id INT DEFAULT NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS product_id INT DEFAULT NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN DEFAULT false;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- 3. Backfill min_order_value from min_order_amount if min_order_amount column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'coupons' AND column_name = 'min_order_amount'
    ) THEN
        UPDATE coupons SET min_order_value = min_order_amount WHERE min_order_value = 0 AND min_order_amount > 0;
    END IF;
END $$;

-- 4. Create missing scope & assignment join tables referenced by backend queries
CREATE TABLE IF NOT EXISTS coupon_categories (
    id SERIAL PRIMARY KEY,
    coupon_id INT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    category_id INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_brands (
    id SERIAL PRIMARY KEY,
    coupon_id INT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    brand_id INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_products (
    id SERIAL PRIMARY KEY,
    coupon_id INT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    product_id INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_assignments (
    id SERIAL PRIMARY KEY,
    coupon_id INT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'assigned',
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Add coupon tracking columns to orders table if missing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(100) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id INT DEFAULT NULL;
