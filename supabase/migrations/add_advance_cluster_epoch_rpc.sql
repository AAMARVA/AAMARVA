-- Create advance_cluster_epoch RPC for atomic epoch advancement
CREATE OR REPLACE FUNCTION advance_cluster_epoch(p_cluster_id TEXT)
RETURNS JSON AS $$
DECLARE
  v_next_epoch INTEGER;
  v_new_id TEXT;
BEGIN
  -- Lock the row for update to prevent concurrent races
  SELECT COALESCE(MAX(epoch), 0) + 1 INTO v_next_epoch
  FROM cluster_epochs
  WHERE "clusterId" = p_cluster_id;

  v_new_id := 'epoch_' || gen_random_uuid();

  INSERT INTO cluster_epochs (id, "clusterId", epoch, "keyFingerprint", "createdAt")
  VALUES (v_new_id, p_cluster_id, v_next_epoch, 'PENDING_INIT', NOW());

  RETURN json_build_object('next_epoch', v_next_epoch);
END;
$$ LANGUAGE plpgsql;
