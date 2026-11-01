-- AAMARVA Schema Migration: Applications Table Updates & Registration Whitelist
-- Run this in your Supabase SQL Editor to update your database schema with:
-- 1. Intake application profiles (including X and Reddit social profile links and approval status)
-- 2. Registration Whitelist table for gated sign-up permissions

-- 1. Applications Table
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email_address TEXT NOT NULL,
  github_profile TEXT,
  linkedin_profile TEXT,
  x_profile TEXT,
  reddit_profile TEXT,
  best_describes TEXT NOT NULL,
  operating_agent TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_url TEXT NOT NULL,
  agent_details TEXT NOT NULL,
  agent_stage TEXT NOT NULL,
  agent_frameworks TEXT[] NOT NULL DEFAULT '{}',
  agent_operate_location TEXT NOT NULL,
  dev_environment TEXT NOT NULL,
  dev_environment_other TEXT,
  languages TEXT[] NOT NULL DEFAULT '{}',
  languages_other TEXT,
  model_providers TEXT[] NOT NULL DEFAULT '{}',
  model_providers_other TEXT,
  uses_external_tools TEXT NOT NULL,
  communicates_with_agents TEXT NOT NULL,
  communication_details TEXT,
  hope_to_accomplish TEXT NOT NULL,
  agent_use_purpose TEXT NOT NULL,
  discover_capability TEXT NOT NULL,
  discovery_problems TEXT NOT NULL,
  contributions TEXT[] NOT NULL DEFAULT '{}',
  contributions_other TEXT,
  first_30_days TEXT NOT NULL,
  additional_notes TEXT,
  status TEXT NOT NULL DEFAULT 'Under Review',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Ensure newly added columns exist on existing deployments
ALTER TABLE applications ADD COLUMN IF NOT EXISTS x_profile TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reddit_profile TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Under Review';

-- Enable RLS (Row Level Security) on applications
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access to applications table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'applications' AND policyname = 'Allow service_role full access to applications'
  ) THEN
    CREATE POLICY "Allow service_role full access to applications"
    ON applications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- 2. Registration Whitelist Table
-- Strictly governs gated sign-up / account creation on the floor.
CREATE TABLE IF NOT EXISTS registration_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for case-insensitive lookup
CREATE INDEX IF NOT EXISTS idx_registration_whitelist_email_lower
ON registration_whitelist (LOWER(email));

-- Enable RLS on registration_whitelist
ALTER TABLE registration_whitelist ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access to registration_whitelist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'registration_whitelist' AND policyname = 'Allow service_role full access to registration_whitelist'
  ) THEN
    CREATE POLICY "Allow service_role full access to registration_whitelist"
    ON registration_whitelist
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- Seed default whitelisted addresses
INSERT INTO registration_whitelist (email)
VALUES 
  ('aamarvaandplatforms@gmail.com'),
  ('founder@aamarva.com')
ON CONFLICT (email) DO NOTHING;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
