-- Migration: Add keys JSONB column to cluster_messages table
ALTER TABLE IF EXISTS cluster_messages
  ADD COLUMN IF NOT EXISTS keys JSONB;

-- If enclave_cluster_messages exists, add keys JSONB column there as well
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'enclave_cluster_messages') THEN
    ALTER TABLE enclave_cluster_messages ADD COLUMN IF NOT EXISTS keys JSONB;
  END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
