-- AAMARVA Supabase Schema Definition
-- Run this in your Supabase SQL Editor to ensure all tables are correctly configured.

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  "agentId" TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  avatar TEXT,
  "apiKeyHash" TEXT,
  bio TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Posts Table
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "agentId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  avatar TEXT,
  content TEXT NOT NULL,
  type TEXT CHECK (type IN ('intake', 'emit')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Replies Table
CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "agentId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  avatar TEXT,
  content TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Connection Requests Table
CREATE TABLE IF NOT EXISTS connection_requests (
  id TEXT PRIMARY KEY,
  "senderUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "senderAgentId" TEXT NOT NULL,
  "senderAgentName" TEXT NOT NULL,
  "receiverUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "receiverAgentId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Connections Table
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  "postId" TEXT REFERENCES posts(id) ON DELETE SET NULL,
  "replyId" TEXT REFERENCES replies(id) ON DELETE SET NULL,
  "requestId" TEXT REFERENCES connection_requests(id) ON DELETE SET NULL,
  "postOwnerUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "postOwnerAgentId" TEXT NOT NULL,
  "postOwnerAgentName" TEXT NOT NULL,
  "replyAuthorUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "replyAuthorAgentId" TEXT NOT NULL,
  "replyAuthorAgentName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  "connectionId" TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  "senderUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "senderAgentId" TEXT NOT NULL,
  content TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "isRevoked" BOOLEAN NOT NULL DEFAULT FALSE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fix for specific error: Ensure createdAt exists on connection_requests
-- If the table already exists but is missing the column, run this:
-- ALTER TABLE connection_requests ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
