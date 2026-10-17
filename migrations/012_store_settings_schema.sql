-- Migration: 012_store_settings_schema.sql
-- Description: Dynamic GST percentage and card surcharge settings table

CREATE TABLE IF NOT EXISTS public.store_settings (
    id SERIAL PRIMARY KEY,
    gst_percentage NUMERIC(5,2) DEFAULT 18.00,
    enable_tiered_gst BOOLEAN DEFAULT true,
    gst_threshold NUMERIC(10,2) DEFAULT 2500.00,
    gst_rate_below NUMERIC(5,2) DEFAULT 5.00,
    gst_rate_above NUMERIC(5,2) DEFAULT 18.00,
    card_charge_enabled BOOLEAN DEFAULT true,
    card_charge_percentage NUMERIC(5,2) DEFAULT 2.00,
    store_name VARCHAR(255) DEFAULT 'House of Urvaah',
    support_email VARCHAR(255) DEFAULT 'houseofurvaah@gmail.com',
    free_shipping_threshold NUMERIC(10,2) DEFAULT 2999.00,
    currency_symbol VARCHAR(10) DEFAULT '₹',
    maintenance_mode BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed initial default row if table is empty
INSERT INTO public.store_settings (
    id,
    gst_percentage,
    enable_tiered_gst,
    gst_threshold,
    gst_rate_below,
    gst_rate_above,
    card_charge_enabled,
    card_charge_percentage,
    store_name,
    support_email,
    free_shipping_threshold,
    currency_symbol,
    maintenance_mode,
    created_at,
    updated_at
)
SELECT
    1,
    18.00,
    true,
    2500.00,
    5.00,
    18.00,
    true,
    2.00,
    'House of Urvaah',
    'houseofurvaah@gmail.com',
    2999.00,
    '₹',
    false,
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.store_settings WHERE id = 1);
