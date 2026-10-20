-- Remove obsolete group-key distribution table and function.
-- cluster_epochs is retained only for identity-key versioning and historical message metadata compatibility.

DROP FUNCTION IF EXISTS advance_cluster_epoch(p_cluster_id TEXT);
DROP TABLE IF EXISTS cluster_key_distributions;
