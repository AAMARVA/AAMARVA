-- CRITICAL SCHEMA UPDATE: Ensure all required columns exist for the Core Account Model
-- This script forces the creation of missing columns and removes the unique email constraint.

DO $$ 
BEGIN
    -- 1. Remove unique constraint on email
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_email_key' AND table_name = 'users') THEN
        ALTER TABLE users DROP CONSTRAINT users_email_key;
    END IF;

    -- 2. Add master_id if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'master_id') THEN
        ALTER TABLE users ADD COLUMN master_id TEXT;
    END IF;

    -- 3. Add is_master_primary if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_master_primary') THEN
        ALTER TABLE users ADD COLUMN is_master_primary BOOLEAN DEFAULT FALSE;
    END IF;

    -- 4. Add owner_email if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'owner_email') THEN
        ALTER TABLE users ADD COLUMN owner_email TEXT;
    END IF;
END $$;

-- 5. Normalize existing data
UPDATE users SET is_master_primary = TRUE WHERE is_master_primary IS NULL;
UPDATE users SET owner_email = email WHERE owner_email IS NULL;
