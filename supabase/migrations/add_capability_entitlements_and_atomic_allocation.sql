-- Migration: add_capability_entitlements_and_atomic_allocation.sql
-- 1. Capability Entitlements Table (Tied strictly to individual agent_id, NOT master_account_id)
CREATE TABLE IF NOT EXISTS capability_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL, -- Unique agent machine identifier or user UUID of the Slave Account
  user_id TEXT, -- User ID in users table
  master_id TEXT, -- Owning master user ID for tracking
  capability_level INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'revoked'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT unique_active_agent_capability UNIQUE (agent_id)
);

CREATE INDEX IF NOT EXISTS idx_capability_entitlements_lookup 
  ON capability_entitlements(agent_id, status);

CREATE INDEX IF NOT EXISTS idx_capability_entitlements_user 
  ON capability_entitlements(user_id, status);

CREATE INDEX IF NOT EXISTS idx_capability_entitlements_master 
  ON capability_entitlements(master_id);

-- 2. Atomic Slave Slot Allocation Procedure
-- Uses FOR UPDATE (NOT FOR SHARE) on master_plan_entitlements to eliminate race conditions
CREATE OR REPLACE FUNCTION allocate_slave_slot_atomic(
  p_master_id TEXT,
  p_requested_slots INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan master_plan_entitlements%ROWTYPE;
  v_current_slaves INT;
  v_now TIMESTAMPTZ := NOW();
  v_effective_allowance INT := 0;
  v_block JSONB;
  v_block_expires TIMESTAMPTZ;
  v_block_allowance INT;
  v_active_blocks JSONB := '[]'::jsonb;
BEGIN
  -- 1. Exclusively lock the master plan entitlement row FOR UPDATE
  -- (Prevents concurrent requests from inspecting the same free slot)
  SELECT *
  INTO v_plan
  FROM master_plan_entitlements
  WHERE master_account_id = p_master_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NO_ACTIVE_PLAN',
      'message', 'No active Master/Slave plan found. Available slave slots: 0.',
      'allowance', 0,
      'current', 0
    );
  END IF;

  -- 2. Calculate effective allowance from unexpired metadata->'blocks'
  IF v_plan.metadata IS NOT NULL AND v_plan.metadata->'blocks' IS NOT NULL AND jsonb_typeof(v_plan.metadata->'blocks') = 'array' THEN
    FOR v_block IN SELECT * FROM jsonb_array_elements(v_plan.metadata->'blocks')
    LOOP
      v_block_expires := (v_block->>'expires_at')::TIMESTAMPTZ;
      v_block_allowance := COALESCE((v_block->>'allowance')::INT, 0);
      IF v_block_expires IS NULL OR v_block_expires > v_now THEN
        v_effective_allowance := v_effective_allowance + v_block_allowance;
        v_active_blocks := v_active_blocks || v_block;
      END IF;
    END LOOP;
  ELSE
    v_effective_allowance := v_plan.allowance_accounts;
  END IF;

  -- If all blocks expired or effective allowance <= 0
  IF v_effective_allowance <= 0 THEN
    UPDATE master_plan_entitlements
    SET status = 'expired', updated_at = v_now
    WHERE id = v_plan.id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'PLAN_EXPIRED',
      'message', 'Master/Slave plan has expired or no active capacity blocks. Additional slave accounts cannot be created.',
      'allowance', 0,
      'current', 0
    );
  END IF;

  -- 3. Count currently deployed slave accounts under this master
  SELECT COUNT(*)
  INTO v_current_slaves
  FROM users
  WHERE master_id = p_master_id
    AND id != p_master_id;

  -- 4. Check allowance boundary against effective active capacity
  IF (v_current_slaves + p_requested_slots) > v_effective_allowance THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALLOWANCE_EXCEEDED',
      'message', format('Slave agent allowance limit exceeded. Your Master plan allows a maximum of %s active accounts (%s deployed, %s requested).', v_effective_allowance, v_current_slaves, p_requested_slots),
      'allowance', v_effective_allowance,
      'current', v_current_slaves,
      'requested', p_requested_slots
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'allowance', v_effective_allowance,
    'current', v_current_slaves,
    'requested', p_requested_slots,
    'remaining', v_effective_allowance - (v_current_slaves + p_requested_slots)
  );
END;
$$;
