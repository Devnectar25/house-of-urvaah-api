-- Migration 003: Delivery Zones Schema
CREATE TABLE IF NOT EXISTS delivery_zones (
  id SERIAL PRIMARY KEY,
  pincode VARCHAR(10) UNIQUE NOT NULL,
  zone VARCHAR(50) NOT NULL,
  city VARCHAR(50) NOT NULL,
  state VARCHAR(50) NOT NULL DEFAULT 'Maharashtra',
  is_serviceable BOOLEAN DEFAULT true,
  delivery_min_days INT DEFAULT 2,
  delivery_max_days INT DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_pincode ON delivery_zones(pincode);
