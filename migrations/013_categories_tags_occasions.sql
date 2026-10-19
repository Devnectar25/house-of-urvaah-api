-- Migration: 013_categories_tags_occasions.sql
-- House of Urvaah: Multi-category support, Occasion tags, and Additional tags

ALTER TABLE products ADD COLUMN IF NOT EXISTS categories text[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS occasion varchar(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags text[];

-- Ensure categories table has proper slug
ALTER TABLE categories ADD COLUMN IF NOT EXISTS slug varchar(255);
UPDATE categories SET slug = 'co-ord-sets' WHERE id = 2;
UPDATE categories SET slug = 'festive-wear' WHERE id = 3;
UPDATE categories SET slug = 'kurtis-and-dresses' WHERE id = 4;
UPDATE categories SET slug = 'corset-tops' WHERE id = 7 OR LOWER(name) LIKE '%corset%';
UPDATE categories SET slug = 'new-arrivals' WHERE id = 15;
