ALTER TABLE clusters ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE cluster_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
