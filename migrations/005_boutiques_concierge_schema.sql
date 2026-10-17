-- Migration: Boutiques & Concierge Schema and Seeding
-- Description: Supports dynamic management of Atelier Concierge details and Flagship Boutique Locations

CREATE TABLE IF NOT EXISTS public.ui_concierge_settings (
    id SERIAL PRIMARY KEY,
    section_badge VARCHAR(100) DEFAULT 'CLIENT SERVICES',
    section_title VARCHAR(150) DEFAULT 'ATELIER CONCIERGE',
    email VARCHAR(255) DEFAULT 'houseofurvaah@gmail.com',
    phone VARCHAR(100) DEFAULT '+91 22 4900 8800',
    hours VARCHAR(255) DEFAULT 'Monday – Saturday: 10:00 AM – 8:00 PM IST',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.ui_boutique_locations (
    id SERIAL PRIMARY KEY,
    section_badge VARCHAR(100) DEFAULT 'FLAGSHIP BOUTIQUES',
    section_title VARCHAR(150) DEFAULT 'ATELIER LOCATIONS',
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(100),
    is_primary BOOLEAN DEFAULT false,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
