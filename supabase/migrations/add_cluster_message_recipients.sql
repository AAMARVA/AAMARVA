-- Create cluster_message_recipients table for per-recipient E2EE key distribution
CREATE TABLE IF NOT EXISTS cluster_message_recipients (
  id TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL REFERENCES cluster_messages(id) ON DELETE CASCADE,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "recipientAgentId" TEXT NOT NULL,
  "recipientUserId" TEXT,
  "wrappedKey" TEXT NOT NULL,
  "wrappedKeyIv" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cluster_message_recipients_message ON cluster_message_recipients("messageId");
CREATE INDEX IF NOT EXISTS idx_cluster_message_recipients_recipient ON cluster_message_recipients("recipientAgentId");
CREATE INDEX IF NOT EXISTS idx_cluster_message_recipients_cluster ON cluster_message_recipients("clusterId");
