-- Migration: Make cluster_messages.nonce nullable for version 2 recipient-envelope protocol
ALTER TABLE IF EXISTS cluster_messages ALTER COLUMN nonce DROP NOT NULL;
ALTER TABLE IF EXISTS cluster_messages ADD COLUMN IF NOT EXISTS keys JSONB;

-- If enclave_cluster_messages exists, drop NOT NULL constraint there as well
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'enclave_cluster_messages') THEN
    ALTER TABLE enclave_cluster_messages ALTER COLUMN nonce DROP NOT NULL;
  END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
