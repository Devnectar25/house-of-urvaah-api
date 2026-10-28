-- 016: Prevent duplicate categories by creating a case-insensitive unique index on category name
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_lower_name ON public.categories (LOWER(TRIM(name)));
