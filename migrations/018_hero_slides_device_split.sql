-- Migration: 018_hero_slides_device_split
-- Description: Fully decouple Desktop and Mobile hero media.
--
-- Before: one ui_hero_slides row held BOTH desktop media (desktop_image) and the
--         mobile video (mobile_image), so deleting a slide removed both.
-- After:  every row belongs to exactly one device ('desktop' | 'mobile') and holds
--         its own media_url, media_type, is_active, display_order, created_at.
--
-- Safe to re-run (run-migrations.js executes every file on each run):
--   * a row is "not yet migrated" while device IS NULL; migrated rows are never touched again.
--   * everything runs in one transaction, so a failure leaves the table unchanged.
--
-- No media is lost: each legacy row with a mobile_image gets its own mobile row, and the
-- original row keeps its desktop media. Legacy desktop_image / mobile_image columns are
-- left in place (unused by the app) so the data can still be inspected or rolled back.

BEGIN;

ALTER TABLE public.ui_hero_slides ADD COLUMN IF NOT EXISTS device VARCHAR(10);
ALTER TABLE public.ui_hero_slides ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.ui_hero_slides ALTER COLUMN desktop_image DROP NOT NULL;

-- 1) Every unmigrated row that has a mobile video/image -> a NEW, independent mobile row.
INSERT INTO public.ui_hero_slides
  (heading, subheading, desktop_image, mobile_image, media_type, button_text, button_link,
   display_order, is_active, created_at, updated_at, device, media_url)
SELECT
  heading, subheading, NULL, NULL,
  CASE WHEN split_part(lower(trim(mobile_image)), '?', 1) ~ '\.(jpe?g|png|webp|gif|avif)$'
       THEN 'image' ELSE 'video' END,
  button_text, button_link, display_order, is_active, created_at, CURRENT_TIMESTAMP,
  'mobile', trim(mobile_image)
FROM public.ui_hero_slides
WHERE device IS NULL
  AND COALESCE(trim(mobile_image), '') <> '';

-- 2) The original row becomes the desktop row (when it has desktop media).
UPDATE public.ui_hero_slides
SET device = 'desktop',
    media_url = trim(desktop_image),
    media_type = CASE
      WHEN media_type IN ('video', 'image') THEN media_type
      WHEN split_part(lower(trim(desktop_image)), '?', 1) ~ '\.(jpe?g|png|webp|gif|avif)$' THEN 'image'
      ELSE 'video' END,
    updated_at = CURRENT_TIMESTAMP
WHERE device IS NULL
  AND COALESCE(trim(desktop_image), '') <> '';

-- 3) Rows with no desktop media at all (mobile-only or empty). Their mobile media was
--    already copied into its own row in step 1, so the empty shell can go.
DELETE FROM public.ui_hero_slides
WHERE device IS NULL
  AND COALESCE(trim(desktop_image), '') = '';

-- 4) Normalise media_type and lock the new columns down.
UPDATE public.ui_hero_slides
SET media_type = 'video'
WHERE media_type IS NULL OR media_type NOT IN ('video', 'image');

ALTER TABLE public.ui_hero_slides ALTER COLUMN device SET NOT NULL;
ALTER TABLE public.ui_hero_slides ALTER COLUMN media_url SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ui_hero_slides_device_check') THEN
    ALTER TABLE public.ui_hero_slides
      ADD CONSTRAINT ui_hero_slides_device_check CHECK (device IN ('desktop', 'mobile'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ui_hero_slides_media_type_check') THEN
    ALTER TABLE public.ui_hero_slides
      ADD CONSTRAINT ui_hero_slides_media_type_check CHECK (media_type IN ('video', 'image'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ui_hero_slides_device_order
  ON public.ui_hero_slides (device, is_active, display_order, id);

COMMIT;
