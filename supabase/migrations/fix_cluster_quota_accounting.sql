-- AAMARVA CLUSTER QUOTA ACCOUNTING FIX
-- This migration ensures the quota check is truly atomic even for the FIRST request.
-- It also enforces the "Max 1 Active Cluster" rule with a unique index.

-- 1. Strictly enforce Max 1 Active Cluster per account
-- This ensures concurrency safety even if the RPC check passes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clusters_one_active_per_owner 
ON clusters ("ownerUserId") 
WHERE (status = 'active');

-- 2. Redefine Atomic Quota & Rate Limit Check RPC
-- Logic: Ensure row exists -> SELECT FOR UPDATE (Lock) -> CHECK -> (Optional) INCREMENT -> RETURN
CREATE OR REPLACE FUNCTION check_cluster_quota_atomic(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_window_start TIMESTAMPTZ,
  p_max_burst INTEGER,
  p_month_start TIMESTAMPTZ,
  p_max_monthly INTEGER,
  p_day_start TIMESTAMPTZ,
  p_max_daily INTEGER,
  p_resource_table TEXT DEFAULT NULL,
  p_resource_owner_col TEXT DEFAULT NULL,
  p_resource_max INTEGER DEFAULT NULL,
  p_resource_status_col TEXT DEFAULT NULL,
  p_resource_active_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_burst_count INTEGER := 0;
  v_monthly_count INTEGER := 0;
  v_daily_count INTEGER := 0;
  v_active_resources INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
  v_quota_month_start TIMESTAMPTZ;
  v_quota_day_start TIMESTAMPTZ;
BEGIN
  -- 1. Check Active Resource Limit (e.g. Max Active Clusters)
  IF p_resource_table IS NOT NULL AND p_resource_owner_col IS NOT NULL AND p_resource_max IS NOT NULL THEN
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE %I = $1 AND (%I IS NULL OR %I = $2)',
      p_resource_table, p_resource_owner_col, p_resource_status_col, p_resource_status_col
    ) 
    INTO v_active_resources 
    USING p_identifier, p_resource_active_status;

    IF v_active_resources >= p_resource_max THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'RESOURCE_LIMIT_EXCEEDED',
        'message', format('Maximum active %s reached (%s)', p_resource_table, p_resource_max)
      );
    END IF;
  END IF;

  -- 2. Ensure row exists in Burst Buckets and lock it
  INSERT INTO security_rate_limit_buckets (identifier, endpoint, "windowStart", "requestCount", "updatedAt")
  VALUES (p_identifier, p_endpoint, p_window_start, 0, v_now)
  ON CONFLICT (identifier, endpoint, "windowStart") DO NOTHING;

  -- Lock row
  SELECT "requestCount" INTO v_burst_count
  FROM security_rate_limit_buckets
  WHERE identifier = p_identifier AND endpoint = p_endpoint AND "windowStart" = p_window_start
  FOR UPDATE;

  -- Boundary Check BEFORE Increment
  IF v_burst_count >= p_max_burst THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMIT_EXCEEDED',
      'message', 'Burst limit exceeded',
      'burstCount', v_burst_count
    );
  END IF;

  -- 3. Ensure row exists in Quotas and lock it
  INSERT INTO security_quotas (identifier, endpoint, "monthlyCount", "dailyCount", "monthStart", "dayStart", "updatedAt")
  VALUES (p_identifier, p_endpoint, 0, 0, p_month_start, p_day_start, v_now)
  ON CONFLICT (identifier, endpoint) DO NOTHING;

  -- Lock row
  SELECT "monthlyCount", "dailyCount", "monthStart", "dayStart"
  INTO v_monthly_count, v_daily_count, v_quota_month_start, v_quota_day_start
  FROM security_quotas
  WHERE identifier = p_identifier AND endpoint = p_endpoint
  FOR UPDATE;

  -- Handle Resets (Reset state in memory first)
  IF v_quota_month_start < p_month_start THEN
    v_monthly_count := 0;
  END IF;
  IF v_quota_day_start < p_day_start THEN
    v_daily_count := 0;
  END IF;

  -- Boundary Check BEFORE Increment
  IF v_monthly_count >= p_max_monthly THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'MONTHLY_QUOTA_EXCEEDED',
      'message', 'Monthly quota exceeded',
      'monthlyCount', v_monthly_count
    );
  END IF;

  IF v_daily_count >= p_max_daily THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DAILY_PACING_EXCEEDED',
      'message', 'Daily pacing target exceeded',
      'dailyCount', v_daily_count
    );
  END IF;

  -- 4. ALL CHECKS PASSED -> INCREMENT ATOMICALLY
  
  -- Update Burst
  UPDATE security_rate_limit_buckets
  SET "requestCount" = "requestCount" + 1, "updatedAt" = v_now
  WHERE identifier = p_identifier AND endpoint = p_endpoint AND "windowStart" = p_window_start
  RETURNING "requestCount" INTO v_burst_count;

  -- Update Quota
  UPDATE security_quotas
  SET
    "monthlyCount" = CASE WHEN "monthStart" < p_month_start THEN 1 ELSE "monthlyCount" + 1 END,
    "dailyCount" = CASE WHEN "dayStart" < p_day_start THEN 1 ELSE "dailyCount" + 1 END,
    "monthStart" = GREATEST("monthStart", p_month_start),
    "dayStart" = GREATEST("dayStart", p_day_start),
    "updatedAt" = v_now
  WHERE identifier = p_identifier AND endpoint = p_endpoint
  RETURNING "monthlyCount", "dailyCount" INTO v_monthly_count, v_daily_count;

  RETURN jsonb_build_object(
    'success', true,
    'burstCount', v_burst_count,
    'monthlyCount', v_monthly_count,
    'dailyCount', v_daily_count
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
