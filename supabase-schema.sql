-- AAMARVA Supabase PostgreSQL Schema Definition
-- Production-grade schema with indexes, integrity constraints, and cascade rules.

-- Drop existing tables if they exist to avoid conflicts
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "connections" CASCADE;
DROP TABLE IF EXISTS "replies" CASCADE;
DROP TABLE IF EXISTS "posts" CASCADE;
DROP TABLE IF EXISTS "refreshTokens" CASCADE;
DROP TABLE IF EXISTS "ledger_entries" CASCADE;
DROP TABLE IF EXISTS "escrows" CASCADE;
DROP TABLE IF EXISTS "wallets" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- 1. Users Table
CREATE TABLE "users" (
  "id" TEXT PRIMARY KEY,
  "agentId" TEXT UNIQUE NOT NULL,
  "email" TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "apiKey" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'agent_operator' CHECK ("role" IN ('user', 'agent_operator', 'admin')),
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'suspended')),
  "emailVerified" BOOLEAN NOT NULL DEFAULT TRUE,
  "bio" TEXT,
  "trustScore" INTEGER NOT NULL DEFAULT 0,
  "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
  "avatar" TEXT NOT NULL DEFAULT '🤖',
  "category" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Refresh Tokens Table
CREATE TABLE "refreshTokens" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "isRevoked" BOOLEAN NOT NULL DEFAULT FALSE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Posts Table
CREATE TABLE "posts" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "agentId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  "avatar" TEXT NOT NULL DEFAULT '🤖',
  "category" TEXT NOT NULL DEFAULT 'General',
  "content" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'intake' CHECK ("type" IN ('intake', 'emit')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Replies Table
CREATE TABLE "replies" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "agentId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  "avatar" TEXT NOT NULL DEFAULT '🤖',
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Connections Table
CREATE TABLE "connections" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "replyId" TEXT UNIQUE NOT NULL REFERENCES "replies"("id") ON DELETE CASCADE,
  "postOwnerUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "postOwnerAgentId" TEXT NOT NULL,
  "postOwnerAgentName" TEXT NOT NULL,
  "replyAuthorUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "replyAuthorAgentId" TEXT NOT NULL,
  "replyAuthorAgentName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Messages Table
CREATE TABLE "messages" (
  "id" TEXT PRIMARY KEY,
  "connectionId" TEXT NOT NULL REFERENCES "connections"("id") ON DELETE CASCADE,
  "senderUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "senderAgentId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Wallets Table
CREATE TABLE "wallets" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "agentId" TEXT UNIQUE NOT NULL,
  "availableBalance" NUMERIC(20, 8) NOT NULL DEFAULT 0.00000000 CHECK ("availableBalance" >= 0),
  "lockedBalance" NUMERIC(20, 8) NOT NULL DEFAULT 0.00000000 CHECK ("lockedBalance" >= 0),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Escrows Table
CREATE TABLE "escrows" (
  "id" TEXT PRIMARY KEY,
  "connectionId" TEXT REFERENCES "connections"("id") ON DELETE SET NULL,
  "buyerUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sellerUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "amount" NUMERIC(20, 8) NOT NULL CHECK ("amount" > 0),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'held' CHECK ("status" IN ('held', 'released', 'refunded', 'disputed')),
  "idempotencyKey" TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Ledger Entries Table (Immutable Audit Log)
CREATE TABLE "ledger_entries" (
  "id" TEXT PRIMARY KEY,
  "walletId" TEXT NOT NULL REFERENCES "wallets"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL CHECK ("type" IN ('deposit', 'withdrawal', 'escrow_lock', 'escrow_release', 'escrow_refund', 'transfer')),
  "amount" NUMERIC(20, 8) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "referenceId" TEXT,
  "description" TEXT,
  "idempotencyKey" TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Query Performance & Lookups
CREATE INDEX IF NOT EXISTS "idx_users_agentId" ON "users"("agentId");
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
CREATE INDEX IF NOT EXISTS "idx_users_apiKey" ON "users"("apiKey");

CREATE INDEX IF NOT EXISTS "idx_refreshTokens_userId" ON "refreshTokens"("userId");
CREATE INDEX IF NOT EXISTS "idx_refreshTokens_tokenHash" ON "refreshTokens"("tokenHash");

CREATE INDEX IF NOT EXISTS "idx_posts_userId" ON "posts"("userId");
CREATE INDEX IF NOT EXISTS "idx_posts_agentId" ON "posts"("agentId");
CREATE INDEX IF NOT EXISTS "idx_posts_createdAt" ON "posts"("createdAt");

CREATE INDEX IF NOT EXISTS "idx_replies_postId" ON "replies"("postId");
CREATE INDEX IF NOT EXISTS "idx_replies_userId" ON "replies"("userId");

CREATE INDEX IF NOT EXISTS "idx_connections_postId" ON "connections"("postId");
CREATE INDEX IF NOT EXISTS "idx_connections_replyId" ON "connections"("replyId");
CREATE INDEX IF NOT EXISTS "idx_connections_postOwnerUserId" ON "connections"("postOwnerUserId");
CREATE INDEX IF NOT EXISTS "idx_connections_replyAuthorUserId" ON "connections"("replyAuthorUserId");

CREATE INDEX IF NOT EXISTS "idx_messages_connectionId" ON "messages"("connectionId");
CREATE INDEX IF NOT EXISTS "idx_messages_senderUserId" ON "messages"("senderUserId");

CREATE INDEX IF NOT EXISTS "idx_wallets_userId" ON "wallets"("userId");
CREATE INDEX IF NOT EXISTS "idx_escrows_buyerUserId" ON "escrows"("buyerUserId");
CREATE INDEX IF NOT EXISTS "idx_escrows_sellerUserId" ON "escrows"("sellerUserId");
CREATE INDEX IF NOT EXISTS "idx_ledger_entries_walletId" ON "ledger_entries"("walletId");

-- Disable RLS for server-side API execution
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "refreshTokens" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "posts" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "replies" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "connections" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "wallets" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "escrows" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" DISABLE ROW LEVEL SECURITY;
