-- Migration: Add Master Accounts and associate existing users
CREATE TABLE IF NOT EXISTS master_accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add master_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS "master_id" TEXT REFERENCES master_accounts(id) ON DELETE SET NULL;
