-- AAMARVA Capability Increment Entitlements & Atomic Allocation Migration

-- 1. Capability Entitlements Table
CREATE TABLE IF NOT EXISTS capability_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_account_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'canceled'
  plan_name TEXT NOT NULL DEFAULT 'Capability Increment Plan',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT unique_active_capability_plan UNIQUE (master_account_id)
);

CREATE INDEX IF NOT EXISTS idx_capability_entitlements_lookup 
  ON capability_entitlements(master_account_id, status);

-- 2. Atomic Slave Agent Allocation Function
-- This function checks if a master account has remaining slave allowance and inserts the new slave agent in one atomic transaction.
CREATE OR REPLACE FUNCTION allocate_slave_agent_atomic(
  p_master_id TEXT,
  p_slave_record JSONB,
  p_auth_user JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowance INTEGER := 0;
  v_current_count INTEGER := 0;
  v_plan_status TEXT;
  v_plan_expiry TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_result JSONB;
BEGIN
  -- 1. Authoritative Allowance Check
  SELECT allowance_accounts, status, expires_at 
  INTO v_allowance, v_plan_status, v_plan_expiry
  FROM master_plan_entitlements
  WHERE master_account_id = p_master_id AND status = 'active'
  FOR UPDATE; -- Lock the entitlement record exclusively

  -- Expiry Check
  IF v_plan_status IS NULL OR v_plan_status <> 'active' OR (v_plan_expiry IS NOT NULL AND v_plan_expiry <= v_now) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ENTITLEMENT_EXPIRED',
      'message', 'Your Master & Slave Agent Plan has expired or is inactive. Allowance: 0.'
    );
  END IF;

  -- 2. Current Count Check
  SELECT count(*) INTO v_current_count
  FROM users
  WHERE master_id = p_master_id AND id <> p_master_id;

  IF v_current_count >= v_allowance THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALLOWANCE_EXCEEDED',
      'message', format('Slave agent allowance limit reached (%s/%s). Please upgrade your plan.', v_current_count, v_allowance)
    );
  END IF;

  -- 3. Atomic Insertion
  -- We rely on the uniqueness of agentId and email which are checked at the table level.
  INSERT INTO users (
    id, "agentId", email, "passwordHash", name, status, avatar, "apiKeyHash", "apiKeyFingerprint", 
    bio, "createdAt", "updatedAt", master_id, is_master_primary, owner_email, whitelisted_networks
  ) VALUES (
    (p_slave_record->>'id'),
    (p_slave_record->>'agentId'),
    (p_slave_record->>'email'),
    (p_slave_record->>'passwordHash'),
    (p_slave_record->>'name'),
    (p_slave_record->>'status'),
    (p_slave_record->>'avatar'),
    (p_slave_record->>'apiKeyHash'),
    (p_slave_record->>'apiKeyFingerprint'),
    (p_slave_record->>'bio'),
    COALESCE((p_slave_record->>'createdAt')::TIMESTAMPTZ, v_now),
    COALESCE((p_slave_record->>'updatedAt')::TIMESTAMPTZ, v_now),
    p_master_id,
    false,
    (p_slave_record->>'owner_email'),
    COALESCE((p_slave_record->'whitelisted_networks')::TEXT[], ARRAY[]::TEXT[])
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', p_slave_record->>'id',
    'agentId', p_slave_record->>'agentId',
    'currentCount', v_current_count + 1,
    'maxAllowance', v_allowance
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DUPLICATE_IDENTITY',
      'message', 'Agent ID or Email already exists in the floor registry.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INTERNAL_ERROR',
      'message', SQLERRM
    );
END;
$$;
