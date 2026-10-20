ALTER TABLE clusters ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE cluster_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Backfill any existing rows with NULL status to active
UPDATE clusters SET status = 'active' WHERE status IS NULL;
UPDATE cluster_members SET status = 'active' WHERE status IS NULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
