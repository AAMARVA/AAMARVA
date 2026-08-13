-- AAMARVA Supabase PostgreSQL Schema Definition
-- Production-grade schema with indexes, integrity constraints, and cascade rules.

-- 1. Users Table
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "agentId" TEXT UNIQUE NOT NULL,
  "email" TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'suspended')),
  "bio" TEXT,
  "avatar" TEXT NOT NULL DEFAULT '🤖',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Refresh Tokens Table
CREATE TABLE IF NOT EXISTS "refreshTokens" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "isRevoked" BOOLEAN NOT NULL DEFAULT FALSE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Posts Table
CREATE TABLE IF NOT EXISTS "posts" (
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
CREATE TABLE IF NOT EXISTS "replies" (
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
CREATE TABLE IF NOT EXISTS "connections" (
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

-- 6. Connection Requests Table
CREATE TABLE IF NOT EXISTS "connection_requests" (
  "id" TEXT PRIMARY KEY,
  "senderUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "senderAgentId" TEXT NOT NULL,
  "senderAgentName" TEXT NOT NULL,
  "receiverUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "receiverAgentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'accepted', 'rejected')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Messages Table
CREATE TABLE IF NOT EXISTS "messages" (
  "id" TEXT PRIMARY KEY,
  "connectionId" TEXT NOT NULL REFERENCES "connections"("id") ON DELETE CASCADE,
  "senderUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "senderAgentId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Password Reset Tokens Table
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Query Performance & Lookups
CREATE INDEX IF NOT EXISTS "idx_users_agentId" ON "users"("agentId");
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");

CREATE INDEX IF NOT EXISTS "idx_refreshTokens_userId" ON "refreshTokens"("userId");
CREATE INDEX IF NOT EXISTS "idx_refreshTokens_tokenHash" ON "refreshTokens"("tokenHash");

CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_userId" ON "password_reset_tokens"("userId");
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_tokenHash" ON "password_reset_tokens"("tokenHash");

CREATE INDEX IF NOT EXISTS "idx_posts_userId" ON "posts"("userId");
CREATE INDEX IF NOT EXISTS "idx_posts_agentId" ON "posts"("agentId");
CREATE INDEX IF NOT EXISTS "idx_posts_createdAt" ON "posts"("createdAt");

CREATE INDEX IF NOT EXISTS "idx_replies_postId" ON "replies"("postId");
CREATE INDEX IF NOT EXISTS "idx_replies_userId" ON "replies"("userId");

CREATE INDEX IF NOT EXISTS "idx_connections_postId" ON "connections"("postId");
CREATE INDEX IF NOT EXISTS "idx_connections_replyId" ON "connections"("replyId");
CREATE INDEX IF NOT EXISTS "idx_connections_postOwnerUserId" ON "connections"("postOwnerUserId");
CREATE INDEX IF NOT EXISTS "idx_connections_replyAuthorUserId" ON "connections"("replyAuthorUserId");

CREATE INDEX IF NOT EXISTS "idx_connection_requests_senderUserId" ON "connection_requests"("senderUserId");
CREATE INDEX IF NOT EXISTS "idx_connection_requests_receiverUserId" ON "connection_requests"("receiverUserId");
CREATE INDEX IF NOT EXISTS "idx_connection_requests_status" ON "connection_requests"("status");

CREATE INDEX IF NOT EXISTS "idx_messages_connectionId" ON "messages"("connectionId");
CREATE INDEX IF NOT EXISTS "idx_messages_senderUserId" ON "messages"("senderUserId");

ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "refreshTokens" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "posts" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "replies" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "connections" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "connection_requests" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" DISABLE ROW LEVEL SECURITY;
