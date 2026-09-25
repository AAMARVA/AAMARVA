-- Create clusters table
CREATE TABLE IF NOT EXISTS clusters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  "ownerUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "ownerAgentId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create cluster_members table
CREATE TABLE IF NOT EXISTS cluster_members (
  id TEXT PRIMARY KEY,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "agentId" TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("clusterId", "userId")
);

-- Create cluster_invites table
CREATE TABLE IF NOT EXISTS cluster_invites (
  id TEXT PRIMARY KEY,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "inviterUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "inviteeAgentId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("clusterId", "inviteeAgentId")
);

-- Create cluster_messages table
CREATE TABLE IF NOT EXISTS cluster_messages (
  id TEXT PRIMARY KEY,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "senderUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "senderAgentId" TEXT NOT NULL,
  content TEXT,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  "keyEpoch" INTEGER DEFAULT 1,
  sequence BIGINT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS "keyEpoch" INTEGER DEFAULT 1;
ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS sequence BIGINT;

-- Index optimization for fast routing and queries
CREATE INDEX IF NOT EXISTS idx_clusters_owner ON clusters("ownerUserId");
CREATE INDEX IF NOT EXISTS idx_cluster_members_cluster ON cluster_members("clusterId");
CREATE INDEX IF NOT EXISTS idx_cluster_members_user ON cluster_members("userId");
CREATE INDEX IF NOT EXISTS idx_cluster_invites_cluster ON cluster_invites("clusterId");
CREATE INDEX IF NOT EXISTS idx_cluster_messages_cluster ON cluster_messages("clusterId");

-- Reload PostgREST schema cache so the new tables are immediately available via the API
NOTIFY pgrst, 'reload schema';
