-- Allow reviews from both registered users and patrons/guests
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_user_id_fkey;
