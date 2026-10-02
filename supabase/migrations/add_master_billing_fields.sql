-- Migration: Add Master Plan & Subscription columns to master_accounts and status details to users
ALTER TABLE master_accounts ADD COLUMN IF NOT EXISTS "plan_id" TEXT DEFAULT 'free';
ALTER TABLE master_accounts ADD COLUMN IF NOT EXISTS "plan_status" TEXT DEFAULT 'ACTIVE'; -- ACTIVE or EXPIRED
ALTER TABLE master_accounts ADD COLUMN IF NOT EXISTS "account_limit" INTEGER DEFAULT 10;
ALTER TABLE master_accounts ADD COLUMN IF NOT EXISTS "plan_started_at" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE master_accounts ADD COLUMN IF NOT EXISTS "plan_expires_at" TIMESTAMPTZ;

-- Add status_reason to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS "status_reason" TEXT;
