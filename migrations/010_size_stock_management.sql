-- Migration: 010_size_stock_management.sql
-- Description: Adds size_stock JSONB column to products and initializes per-size stock for existing products

ALTER TABLE products ADD COLUMN IF NOT EXISTS size_stock JSONB DEFAULT '{}'::jsonb;

-- Populate size_stock for existing products that have sizes and stock
DO $$
DECLARE
    prod RECORD;
    sz TEXT;
    sz_count INT;
    total_qty INT;
    base_qty INT;
    rem_qty INT;
    new_size_stock JSONB;
    idx INT;
BEGIN
    FOR prod IN 
        SELECT product_id, sizes, COALESCE(stock_quantity, quantity, stock, 0) AS current_stock
        FROM products
        WHERE sizes IS NOT NULL AND ARRAY_LENGTH(sizes, 1) > 0
    LOOP
        sz_count := ARRAY_LENGTH(prod.sizes, 1);
        total_qty := prod.current_stock;
        new_size_stock := '{}'::jsonb;

        IF total_qty <= 0 THEN
            -- All sizes 0
            FOREACH sz IN ARRAY prod.sizes LOOP
                new_size_stock := jsonb_set(new_size_stock, ARRAY[sz], '0'::jsonb, true);
            END LOOP;
        ELSE
            -- Distribute stock among sizes
            base_qty := total_qty / sz_count;
            rem_qty := total_qty % sz_count;
            idx := 0;

            FOREACH sz IN ARRAY prod.sizes LOOP
                idx := idx + 1;
                IF idx <= rem_qty THEN
                    new_size_stock := jsonb_set(new_size_stock, ARRAY[sz], to_jsonb(base_qty + 1), true);
                ELSE
                    new_size_stock := jsonb_set(new_size_stock, ARRAY[sz], to_jsonb(base_qty), true);
                END IF;
            END LOOP;
        END IF;

        UPDATE products
        SET size_stock = new_size_stock
        WHERE product_id = prod.product_id AND (size_stock IS NULL OR size_stock = '{}'::jsonb);
    END LOOP;
END $$;
