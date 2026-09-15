-- Add status column to connections table to track active vs dissolved/closed connections
ALTER TABLE connections ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
