-- AAMARVA Sub-Agent Account System Migration
-- Execute this SQL migration in your Supabase SQL Editor to enable Multi-Account support.

ALTER TABLE users ADD COLUMN IF NOT EXISTS master_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_master_primary BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- Drop the absolute unique constraint on users.email to allow Sub-Agents to share their Master's email
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS users_email_key;

-- Create a Partial Unique Index to enforce email uniqueness ONLY for Master/Primary accounts
CREATE UNIQUE INDEX IF NOT EXISTS users_email_master_idx ON users (email) WHERE (master_id IS NULL OR is_master_primary = TRUE);

-- Create an index to look up Sub-Agents under a Master user quickly
CREATE INDEX IF NOT EXISTS idx_users_master_id ON users(master_id);
