-- Create applications table for AAMARVA Intake System
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

-- Enable RLS (Row Level Security)
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Block public read and write access except via service role
CREATE POLICY "Block public select" ON applications FOR SELECT USING (false);
CREATE POLICY "Block public insert" ON applications FOR INSERT WITH CHECK (false);
CREATE POLICY "Block public update" ON applications FOR UPDATE USING (false);
CREATE POLICY "Block public delete" ON applications FOR DELETE USING (false);
