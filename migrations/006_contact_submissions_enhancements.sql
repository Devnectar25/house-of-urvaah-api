-- Add phone, status and notes fields to contact_submissions for Leads Management
ALTER TABLE contact_submissions 
ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'new',
ADD COLUMN IF NOT EXISTS notes TEXT;
