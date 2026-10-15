-- Migration: 011_add_invoice_number_to_orders.sql
-- Description: Adds invoice_number to orders formatted as HOU-YYYYMM<count> and backfills existing orders

ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);

-- Backfill all existing orders with HOU-YYYYMM<count>
WITH numbered_orders AS (
  SELECT id,
    'HOU-' || 
    TO_CHAR(COALESCE(created_at, NOW()), 'YYYYMM') || 
    LPAD(ROW_NUMBER() OVER (
      PARTITION BY TO_CHAR(COALESCE(created_at, NOW()), 'YYYYMM') 
      ORDER BY created_at ASC, id ASC
    )::text, 2, '0') AS gen_invoice_number
  FROM orders
)
UPDATE orders o
SET invoice_number = no.gen_invoice_number
FROM numbered_orders no
WHERE o.id = no.id AND (o.invoice_number IS NULL OR o.invoice_number = '');

-- Index for fast lookup by invoice_number
CREATE INDEX IF NOT EXISTS idx_orders_invoice_number ON orders(invoice_number);
