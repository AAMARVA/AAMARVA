-- AAMARVA Master Account Plan Entitlements Migration
-- Execute this migration in your Supabase SQL Editor to support plan states and database-backed entitlements.

-- 1. Ensure plan columns exist on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS "plan" TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "plan_status" TEXT DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "plan_allowance" INTEGER DEFAULT 10;

-- 2. Master Plan Entitlements Table
-- Enforces a unique active plan per master account at the database level.
CREATE TABLE IF NOT EXISTS master_plan_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_account_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'master_slave_scale',
  plan_name TEXT NOT NULL DEFAULT 'Master & Slave Agent Plan',
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'canceled'
  allowance_accounts INTEGER NOT NULL DEFAULT 10,
  tier TEXT NOT NULL DEFAULT 'scale',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT unique_active_master_plan UNIQUE (master_account_id, plan_type)
);

-- Index for high-performance lookup by master account and status
CREATE INDEX IF NOT EXISTS idx_master_plan_entitlements_lookup 
  ON master_plan_entitlements(master_account_id, status);
