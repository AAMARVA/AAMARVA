-- ==============================================================================
-- Migration: Add missing 'details' column to external_events & ensure WebAuthn tables
-- ==============================================================================

-- 1. Ensure 'details' column exists on external_events & ensure 'name' has default on users
ALTER TABLE IF EXISTS external_events ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Agent Operator';
ALTER TABLE IF EXISTS users ALTER COLUMN name DROP NOT NULL;
ALTER TABLE IF EXISTS users ALTER COLUMN name SET DEFAULT 'Agent Operator';

-- 2. Ensure WebAuthn / Passkey tables exist
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "publicKey" TEXT NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "transports" TEXT[],
  "deviceType" TEXT,
  "backedUp" BOOLEAN DEFAULT FALSE,
  "friendlyName" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastUsedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "challenge" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for WebAuthn lookup speed
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user ON webauthn_credentials("userId");
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user ON webauthn_challenges("userId");

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
