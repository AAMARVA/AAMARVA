-- WebAuthn Credentials Table
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

-- WebAuthn Challenges Table
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "challenge" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
