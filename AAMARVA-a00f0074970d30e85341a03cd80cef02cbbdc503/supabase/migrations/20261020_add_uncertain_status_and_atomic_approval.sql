-- Migration: 20261020_add_uncertain_status_and_atomic_approval.sql

-- 1. Add 'uncertain' to status constraint
ALTER TABLE pending_tool_invocations DROP CONSTRAINT pending_tool_invocations_status_check;
ALTER TABLE pending_tool_invocations ADD CONSTRAINT pending_tool_invocations_status_check 
  CHECK (status IN ('pending', 'approved', 'executing', 'executed', 'failed', 'denied', 'expired', 'uncertain'));

-- 2. Atomic Approval & Grant Creation RPC
CREATE OR REPLACE FUNCTION approve_and_grant_invocation(
  p_operator_id TEXT,
  p_invocation_id TEXT,
  p_grant_id TEXT,
  p_grant_token_hash TEXT,
  p_expires_at TIMESTAMPTZ,
  p_now TIMESTAMPTZ
) RETURNS void AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  -- 1. Update invocation status
  UPDATE pending_tool_invocations
  SET status = 'approved', updated_at = p_now
  WHERE id = p_invocation_id 
    AND owner_id = p_operator_id
    AND status = 'pending'
    AND expires_at > p_now;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invocation not found, already processed, or expired';
  END IF;

  -- 2. Insert grant
  INSERT INTO tool_execution_grants (id, invocation_id, grant_token_hash, expires_at, created_at)
  VALUES (p_grant_id, p_invocation_id, p_grant_token_hash, p_expires_at, p_now);
END;
$$ LANGUAGE plpgsql;
