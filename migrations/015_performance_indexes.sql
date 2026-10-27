-- 015: Performance indexes for hot read paths (additive, non-destructive, safe to re-run).
-- order_items.order_id had no index although every order list / detail looks items up by it
-- (correlated subqueries per order), and orders were looked up by user_id / order_number /
-- created_at ordering without supporting indexes.

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON public.user_addresses (user_id);
