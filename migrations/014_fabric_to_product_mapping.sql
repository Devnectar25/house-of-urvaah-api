-- Migration: 014_fabric_to_product_mapping.sql
-- House of Urvaah: Connect products to True to Fabric video cards and textile artistry

ALTER TABLE products ADD COLUMN IF NOT EXISTS fabric_slug varchar(100);

-- Assign verified fabric slugs to products
UPDATE products SET fabric_slug = 'petal-threadwork' 
WHERE id = 104 OR product_id = 104 OR LOWER(title) LIKE '%blush%pink%';

UPDATE products SET fabric_slug = 'heritage-weave' 
WHERE id = 105 OR product_id = 105 OR product_id = 101 OR LOWER(title) LIKE '%mocha%brown%';

UPDATE products SET fabric_slug = 'ocean-bloom' 
WHERE id = 102 OR product_id = 102 OR LOWER(title) LIKE '%teal%';

UPDATE products SET fabric_slug = 'cora-cotton' 
WHERE id = 109 OR product_id = 109 OR LOWER(fabric) LIKE '%cora%cotton%' OR LOWER(title) LIKE '%ivory%heart%';

UPDATE products SET fabric_slug = 'raw-tissue-silk' 
WHERE id = 106 OR product_id = 106 OR product_id = 103 OR LOWER(fabric) LIKE '%tissue%silk%' OR LOWER(title) LIKE '%sage%bloom%';

UPDATE products SET fabric_slug = 'festive-heritage' 
WHERE id = 108 OR product_id = 108 OR LOWER(title) LIKE '%gharara%';

-- Update ui_fabric_video videos JSONB to include explicit slugs and descriptions
UPDATE ui_fabric_video 
SET videos = '[
  {
    "id": "blush-pink",
    "slug": "petal-threadwork",
    "fabric_slug": "petal-threadwork",
    "tag": "PETAL THREADWORK",
    "title": "Blush Pink Embroidered Floral Co-Ord Set",
    "description": "A refined tactile textile crafted with tonal petal embroidery, micro-sequin detailing, and handcrafted potli trims that catch the light effortlessly.",
    "video_url": "https://fhbdceauisvlcpmuzpmf.supabase.co/storage/v1/object/public/houseofurvaah-media/videos/Blush%20Pink%20Embroidered%20Floral%20Co-Ord%20Set_h264.mp4",
    "poster_url": ""
  },
  {
    "id": "mocha-brown",
    "slug": "heritage-weave",
    "fabric_slug": "heritage-weave",
    "tag": "HERITAGE WEAVE",
    "title": "Mocha Brown Embroidered Co-Ord Set",
    "description": "Rich mocha tones interwoven with intricate heirloom floral embroidery and radiant sequin highlights, evoking traditional artistry in contemporary silhouettes.",
    "video_url": "https://fhbdceauisvlcpmuzpmf.supabase.co/storage/v1/object/public/houseofurvaah-media/videos/Mocha%20Brown%20Embroidered%20Co-Ord%20Set_h264.mp4",
    "poster_url": ""
  },
  {
    "id": "teal",
    "slug": "ocean-bloom",
    "fabric_slug": "ocean-bloom",
    "tag": "OCEAN BLOOM",
    "title": "Teal Embroidered Floral Co-Ord Set",
    "description": "Luminous oceanic teal floral embroidery adorned with all-over light-reflecting sequins and playful handcrafted potli trims designed for celebration.",
    "video_url": "https://fhbdceauisvlcpmuzpmf.supabase.co/storage/v1/object/public/houseofurvaah-media/videos/Teal%20Embroidered%20Floral%20Co-Ord%20Set_h264.mp4",
    "poster_url": ""
  }
]'::jsonb,
button_link = '/true-to-fabric'
WHERE id = 1 OR id IS NOT NULL;
