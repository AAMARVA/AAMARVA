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
BEGIN
  -- 1. Exclusively lock the master plan entitlement row FOR UPDATE
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
  -- Re-validate plan expiration against global expires_at (if it exists)
  IF v_plan.expires_at IS NOT NULL AND v_plan.expires_at <= v_now THEN
    UPDATE master_plan_entitlements
    SET status = 'expired', updated_at = v_now
    WHERE id = v_plan.id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'PLAN_EXPIRED',
      'message', 'Master/Slave plan has expired. Additional slave accounts cannot be created.',
      'allowance', 0,
      'current', 0
    );
  END IF;

  IF v_plan.metadata IS NOT NULL AND v_plan.metadata->'blocks' IS NOT NULL AND jsonb_typeof(v_plan.metadata->'blocks') = 'array' THEN
    FOR v_block IN SELECT * FROM jsonb_array_elements(v_plan.metadata->'blocks')
    LOOP
      v_block_expires := (v_block->>'expires_at')::TIMESTAMPTZ;
      v_block_allowance := COALESCE((v_block->>'allowance')::INT, 0);
      IF v_block_expires IS NULL OR v_block_expires > v_now THEN
        v_effective_allowance := v_effective_allowance + v_block_allowance;
      END IF;
    END LOOP;
  ELSE
    -- Fallback to total allowance_accounts if blocks are missing or corrupt
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
