-- Migration: Restructure Coupons Schema for Advanced Promotion & Scope Rules
-- File: house-of-urvaah-api/migrations/coupons_restructure.sql
-- Date: 2026-09-28

BEGIN;

-- 1. Add / Align columns on coupons table
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_discount NUMERIC(10,2) NULL DEFAULT NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_order_value NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS applies_to VARCHAR(50) DEFAULT 'all';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS per_user_limit INT NULL DEFAULT NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count INT NOT NULL DEFAULT 0;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL DEFAULT NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Backfill data mappings from legacy columns if present
UPDATE coupons SET expires_at = expiry_date WHERE expires_at IS NULL AND expiry_date IS NOT NULL;
UPDATE coupons SET is_private = COALESCE(is_restricted, false) WHERE is_private = false AND is_restricted IS NOT NULL;
UPDATE coupons SET is_active = COALESCE(active, true) WHERE is_active = true AND active IS NOT NULL;
UPDATE coupons SET applies_to = apply_to WHERE (applies_to IS NULL OR applies_to = 'all') AND apply_to IS NOT NULL;

-- 2. Add Guarded CHECK Constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_min_order_value_nonnegative') THEN
        ALTER TABLE coupons ADD CONSTRAINT coupons_min_order_value_nonnegative CHECK (min_order_value >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_max_discount_nonnegative') THEN
        ALTER TABLE coupons ADD CONSTRAINT coupons_max_discount_nonnegative CHECK (max_discount IS NULL OR max_discount >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_usage_limit_positive') THEN
        ALTER TABLE coupons ADD CONSTRAINT coupons_usage_limit_positive CHECK (usage_limit IS NULL OR usage_limit >= 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_per_user_limit_positive') THEN
        ALTER TABLE coupons ADD CONSTRAINT coupons_per_user_limit_positive CHECK (per_user_limit IS NULL OR per_user_limit >= 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_discount_value_positive') THEN
        ALTER TABLE coupons ADD CONSTRAINT coupons_discount_value_positive CHECK (discount_value > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_percentage_max_100') THEN
        ALTER TABLE coupons ADD CONSTRAINT coupons_percentage_max_100 CHECK (discount_type != 'percentage' OR discount_value <= 100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_expires_after_starts') THEN
        ALTER TABLE coupons ADD CONSTRAINT coupons_expires_after_starts CHECK (expires_at IS NULL OR expires_at > starts_at);
    END IF;
END $$;

-- 3. Case-Insensitive Unique Index on Coupon Code
CREATE UNIQUE INDEX IF NOT EXISTS coupons_upper_code_idx ON coupons (UPPER(code));

-- 4. Create coupon_categories relational table
CREATE TABLE IF NOT EXISTS coupon_categories (
    coupon_id INT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (coupon_id, category_id)
);

-- 5. Create coupon_products relational table
CREATE TABLE IF NOT EXISTS coupon_products (
    coupon_id INT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    PRIMARY KEY (coupon_id, product_id)
);

-- 6. Create user_coupons (Customer Private Assignments) table
CREATE TABLE IF NOT EXISTS user_coupons (
    coupon_id INT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (coupon_id, user_id)
);

-- 7. Create coupon_redemptions table for tracking per-user limits
CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id SERIAL PRIMARY KEY,
    coupon_id INT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    order_id INT NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
