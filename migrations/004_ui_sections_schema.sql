-- Migration: UI Sections Schema and Seeding
-- Description: Ensures tables for Hero, Dual Campaign, Trending on Gram, and Fabric Video exist with full field support

-- 1. Hero Slides
CREATE TABLE IF NOT EXISTS public.ui_hero_slides (
    id SERIAL PRIMARY KEY,
    heading TEXT,
    subheading TEXT,
    desktop_image TEXT NOT NULL,
    mobile_image TEXT,
    media_type VARCHAR(20) DEFAULT 'video',
    button_text VARCHAR(100) DEFAULT 'EXPLORE NOW',
    button_link TEXT DEFAULT '/clothing',
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.ui_hero_slides ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) DEFAULT 'video';

-- 2. Dual Campaign Banner
CREATE TABLE IF NOT EXISTS public.ui_dual_campaign (
    id SERIAL PRIMARY KEY,
    position VARCHAR(50) NOT NULL UNIQUE,
    image TEXT NOT NULL,
    images JSONB DEFAULT '[]'::jsonb,
    title TEXT,
    subtitle TEXT,
    button_text VARCHAR(100) DEFAULT 'EXPLORE LOOK',
    link TEXT DEFAULT '/product/bs-102',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.ui_dual_campaign ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- 3. Trending on the Gram
CREATE TABLE IF NOT EXISTS public.ui_trending_gram (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    image TEXT NOT NULL,
    media_type VARCHAR(20) DEFAULT 'video',
    caption TEXT,
    post_link TEXT DEFAULT 'https://www.instagram.com/houseofurvaah/',
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.ui_trending_gram ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE public.ui_trending_gram ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) DEFAULT 'video';

-- 4. Fabric Video Banner
CREATE TABLE IF NOT EXISTS public.ui_fabric_video (
    id SERIAL PRIMARY KEY,
    video_url TEXT NOT NULL,
    poster_url TEXT,
    heading TEXT DEFAULT 'THE ART OF REFINED TAILORING',
    description TEXT DEFAULT 'Defined by oversized silhouettes, fluid draping, and uncompromised material integrity. Designed for timeless elegance across seasonal transitions.',
    button_text VARCHAR(100) DEFAULT 'DISCOVER THE COLLECTION',
    button_link TEXT DEFAULT '#lookbook',
    autoplay BOOLEAN DEFAULT true,
    muted BOOLEAN DEFAULT true,
    loop_video BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
