-- Add status column to connections table
ALTER TABLE connections ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
