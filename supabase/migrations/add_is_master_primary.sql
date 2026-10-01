-- Migration: Add deterministic Master/Managed discriminator and parent ownership tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS "is_master_primary" BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "owner_email" TEXT;

-- Migrate existing master primary users safely based on master_accounts email mapping
UPDATE users 
SET "is_master_primary" = TRUE 
FROM master_accounts 
WHERE LOWER(users.email) = LOWER(master_accounts.email);

-- Populate owner_email for all accounts linked to a master
UPDATE users
SET "owner_email" = master_accounts.email
FROM master_accounts
WHERE users.master_id = master_accounts.id;
