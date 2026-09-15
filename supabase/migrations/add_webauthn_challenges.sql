CREATE TABLE IF NOT EXISTS webauthn_challenges (
  "challengeId" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "agentId" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expiresAt ON webauthn_challenges("expiresAt");
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_userId ON webauthn_challenges("userId");

CREATE TABLE IF NOT EXISTS csrf_tokens (
  "token" TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_csrf_tokens_expiresAt ON csrf_tokens("expiresAt");
