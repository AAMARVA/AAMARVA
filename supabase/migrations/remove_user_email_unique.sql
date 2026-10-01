-- Migration: Remove unique constraint from users.email to allow Managed Accounts to share Master's email
-- This enforces the Core Account Model where Managed Accounts are operational children of a Master identity.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- Ensure owner_email is populated for all existing managed accounts
UPDATE users
SET owner_email = master_accounts.email
FROM master_accounts
WHERE users.master_id = master_accounts.id
AND (users.owner_email IS NULL OR users.owner_email = '');

-- Optional: Normalize existing managed account emails to their owner's email
-- This removes old generated alias emails (e.g. master+agent@example.com)
UPDATE users
SET email = master_accounts.email
FROM master_accounts
WHERE users.master_id = master_accounts.id
AND users.is_master_primary = FALSE;
