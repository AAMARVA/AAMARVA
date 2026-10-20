-- Migration: 20261020_harden_hitl_workflow.sql

-- 1. Add 'uncertain' status
ALTER TABLE pending_tool_invocations DROP CONSTRAINT pending_tool_invocations_status_check;
ALTER TABLE pending_tool_invocations ADD CONSTRAINT pending_tool_invocations_status_check 
  CHECK (status IN ('pending', 'approved', 'executing', 'executed', 'failed', 'denied', 'expired', 'uncertain'));

-- 2. Atomic grant consumption and status transition RPC
CREATE OR REPLACE FUNCTION consume_grant_and_execute(
  p_invocation_id TEXT,
  p_token_hash TEXT,
  p_now TIMESTAMPTZ
) RETURNS void AS $$
BEGIN
  -- 1. Consume grant
  UPDATE tool_execution_grants
  SET consumed_at = p_now
  WHERE invocation_id = p_invocation_id
    AND grant_token_hash = p_token_hash
    AND consumed_at IS NULL
    AND expires_at > p_now;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grant invalid, expired, or already consumed';
  END IF;

  -- 2. Transition status to executing
  UPDATE pending_tool_invocations
  SET status = 'executing', updated_at = p_now
  WHERE id = p_invocation_id
    AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invocation status conflict: not approved';
  END IF;
END;
$$ LANGUAGE plpgsql;
