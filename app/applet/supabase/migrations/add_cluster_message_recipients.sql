-- Create cluster_message_recipients table for explicit recipient-based E2EE
CREATE TABLE IF NOT EXISTS cluster_message_recipients (
  id TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL REFERENCES cluster_messages(id) ON DELETE CASCADE,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "recipientAgentId" TEXT NOT NULL,
  "recipientUserId" TEXT,
  "wrappedKey" TEXT NOT NULL,
  "wrappedKeyIv" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("messageId", "recipientAgentId")
);

-- Indexes for efficient recipient filtering and message routing
CREATE INDEX IF NOT EXISTS idx_cluster_msg_recipients_msg ON cluster_message_recipients("messageId");
CREATE INDEX IF NOT EXISTS idx_cluster_msg_recipients_agent ON cluster_message_recipients("recipientAgentId");
CREATE INDEX IF NOT EXISTS idx_cluster_msg_recipients_cluster_agent ON cluster_message_recipients("clusterId", "recipientAgentId");

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
