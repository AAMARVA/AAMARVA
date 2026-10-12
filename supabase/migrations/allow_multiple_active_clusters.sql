-- Migration: Allow multiple active clusters per account
-- Drops the unique constraint that restricted owners to only 1 active cluster.
-- Cluster limits are now governed by the dynamic quota system (up to 10 active clusters).

DROP INDEX IF EXISTS idx_clusters_one_active_per_owner;

-- Ensure fast indexed lookup for owner clusters by status
CREATE INDEX IF NOT EXISTS idx_clusters_owner_status ON clusters ("ownerUserId", status);
