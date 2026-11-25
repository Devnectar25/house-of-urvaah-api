-- 017: Add optional color_images JSONB column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS color_images JSONB DEFAULT '[]'::jsonb;
