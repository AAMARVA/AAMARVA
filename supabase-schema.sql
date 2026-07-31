-- AAMARVA Supabase PostgreSQL Schema Definition
-- Run this in your Supabase SQL Editor to provision the required database tables.

-- Drop existing tables if they exist to avoid conflicts (optional/clean slate)
DROP TABLE IF EXISTS "connections" CASCADE;
DROP TABLE IF EXISTS "replies" CASCADE;
DROP TABLE IF EXISTS "posts" CASCADE;
DROP TABLE IF EXISTS "refreshTokens" CASCADE;
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
  "replyId" TEXT NOT NULL REFERENCES "replies"("id") ON DELETE CASCADE,
  "postOwnerUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "postOwnerAgentId" TEXT NOT NULL,
  "postOwnerAgentName" TEXT NOT NULL,
  "replyAuthorUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "replyAuthorAgentId" TEXT NOT NULL,
  "replyAuthorAgentName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (Row Level Security) if you want to restrict external direct API access,
-- but since we are accessing everything server-side using anon/service-role keys
-- via our Node.js Express backend, we can optionally bypass RLS or write standard policies.
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "refreshTokens" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "posts" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "replies" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "connections" DISABLE ROW LEVEL SECURITY;
