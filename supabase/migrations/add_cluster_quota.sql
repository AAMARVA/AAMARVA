-- AAMARVA CLUSTER QUOTA & RATE LIMITING
-- This migration adds support for monthly quotas and daily pacing for the Free plan.

-- 1. Extend Users with Plan information
ALTER TABLE users ADD COLUMN IF NOT EXISTS "plan" TEXT DEFAULT 'free';

-- 2. Security Quotas Table
-- Tracks monthly and daily usage per identifier/endpoint.
CREATE TABLE IF NOT EXISTS security_quotas (
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  "monthlyCount" INTEGER NOT NULL DEFAULT 0,
  "dailyCount" INTEGER NOT NULL DEFAULT 0,
  "monthStart" TIMESTAMPTZ NOT NULL,
  "dayStart" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identifier, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_security_quotas_identifier ON security_quotas(identifier);

-- 3. Atomic Quota & Rate Limit Check RPC
-- This function checks:
-- 1. Burst limit (window-based)
-- 2. Daily pacing quota
-- 3. Monthly hard quota
-- 4. (Optional) Active resource count (e.g. max active clusters)
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
  v_burst_count INTEGER;
  v_monthly_count INTEGER;
  v_daily_count INTEGER;
  v_active_resources INTEGER := 0;
  v_now TIMESTAMPTZ := NOW();
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

  -- 2. Check Burst Limit (Reuse existing rate limit bucket logic)
  INSERT INTO security_rate_limit_buckets (
    identifier,
    endpoint,
    "windowStart",
    "requestCount",
    "updatedAt"
  ) VALUES (
    p_identifier,
    p_endpoint,
    p_window_start,
    1,
    v_now
  )
  ON CONFLICT (identifier, endpoint, "windowStart")
  DO UPDATE SET
    "requestCount" = security_rate_limit_buckets."requestCount" + 1,
    "updatedAt" = v_now
  RETURNING "requestCount" INTO v_burst_count;

  IF v_burst_count > p_max_burst THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'RATE_LIMIT_EXCEEDED',
      'message', 'Burst limit exceeded',
      'burstCount', v_burst_count
    );
  END IF;

  -- 3. Check Daily Pacing & Monthly Quota
  INSERT INTO security_quotas (
    identifier,
    endpoint,
    "monthlyCount",
    "dailyCount",
    "monthStart",
    "dayStart",
    "updatedAt"
  ) VALUES (
    p_identifier,
    p_endpoint,
    1,
    1,
    p_month_start,
    p_day_start,
    v_now
  )
  ON CONFLICT (identifier, endpoint)
  DO UPDATE SET
    "monthlyCount" = CASE 
      WHEN security_quotas."monthStart" < p_month_start THEN 1 
      ELSE security_quotas."monthlyCount" + 1 
    END,
    "dailyCount" = CASE 
      WHEN security_quotas."dayStart" < p_day_start THEN 1 
      ELSE security_quotas."dailyCount" + 1 
    END,
    "monthStart" = GREATEST(security_quotas."monthStart", p_month_start),
    "dayStart" = GREATEST(security_quotas."dayStart", p_day_start),
    "updatedAt" = v_now
  RETURNING "monthlyCount", "dailyCount" INTO v_monthly_count, v_daily_count;

  IF v_monthly_count > p_max_monthly THEN
    -- Rollback increment if we want to be strict, but usually we just deny the next one.
    -- To keep it atomic and avoid complex rollback, we just return exceeded.
    -- Note: Since we already inserted/updated, the count is now at p_max_monthly + 1.
    RETURN jsonb_build_object(
      'success', false,
      'error', 'MONTHLY_QUOTA_EXCEEDED',
      'message', 'Monthly quota exceeded',
      'monthlyCount', v_monthly_count
    );
  END IF;

  IF v_daily_count > p_max_daily THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DAILY_PACING_EXCEEDED',
      'message', 'Daily pacing target exceeded',
      'dailyCount', v_daily_count
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'burstCount', v_burst_count,
    'monthlyCount', v_monthly_count,
    'dailyCount', v_daily_count
  );
END;
$$;

-- 4. Permissions
REVOKE EXECUTE ON FUNCTION check_cluster_quota_atomic(TEXT, TEXT, TIMESTAMPTZ, INTEGER, TIMESTAMPTZ, INTEGER, TIMESTAMPTZ, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_cluster_quota_atomic(TEXT, TEXT, TIMESTAMPTZ, INTEGER, TIMESTAMPTZ, INTEGER, TIMESTAMPTZ, INTEGER, TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;
