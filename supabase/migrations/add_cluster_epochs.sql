-- Create cluster_epochs table
CREATE TABLE IF NOT EXISTS cluster_epochs (
  id TEXT PRIMARY KEY,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "epoch" INTEGER NOT NULL,
  "keyFingerprint" TEXT NOT NULL, -- Fingerprint of the group key
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("clusterId", "epoch")
);

-- Create cluster_key_distributions table
CREATE TABLE IF NOT EXISTS cluster_key_distributions (
  id TEXT PRIMARY KEY,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "epoch" INTEGER NOT NULL,
  "recipientAgentId" TEXT NOT NULL,
  "encryptedKeyPackage" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup of current epoch
CREATE INDEX IF NOT EXISTS idx_cluster_epochs_cluster ON cluster_epochs("clusterId");
CREATE INDEX IF NOT EXISTS idx_cluster_key_distributions_cluster_epoch ON cluster_key_distributions("clusterId", "epoch");
