-- AAMARVA SECURITY HARDENING: ATOMIC RPC FUNCTIONS
-- This migration adds atomic operations for rate limiting and violation tracking to prevent race conditions.

-- 1. Atomic Rate Limiting
-- Handles upsert and increment in a single transaction.
CREATE OR REPLACE FUNCTION check_rate_limit_atomic(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_window_start TIMESTAMPTZ,
  p_max_requests INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_bucket_id TEXT;
BEGIN
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
    NOW()
  )
  ON CONFLICT (identifier, endpoint, "windowStart")
  DO UPDATE SET
    "requestCount" = security_rate_limit_buckets."requestCount" + 1,
    "updatedAt" = NOW()
  RETURNING id, "requestCount" INTO v_bucket_id, v_count;

  RETURN jsonb_build_object(
    'id', v_bucket_id,
    'requestCount', v_count,
    'exceeded', v_count > p_max_requests
  );
END;
$$;

-- 2. Atomic Violation Recording
-- Handles upsert and increment for violations in a single transaction.
CREATE OR REPLACE FUNCTION record_violation_atomic(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_severity TEXT,
  p_ip TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_violation RECORD;
BEGIN
  INSERT INTO security_violations (
    identifier,
    endpoint,
    severity,
    "violationCount",
    "lastViolationAt",
    "updatedAt",
    ip
  ) VALUES (
    p_identifier,
    p_endpoint,
    p_severity,
    1,
    NOW(),
    NOW(),
    p_ip
  )
  ON CONFLICT (identifier, endpoint)
  DO UPDATE SET
    "violationCount" = security_violations."violationCount" + 1,
    "lastViolationAt" = NOW(),
    "updatedAt" = NOW(),
    ip = COALESCE(p_ip, security_violations.ip)
  RETURNING * INTO v_violation;

  RETURN to_jsonb(v_violation);
END;
$$;

-- 3. Revoke default public execution privileges for safety
REVOKE EXECUTE ON FUNCTION check_rate_limit_atomic(TEXT, TEXT, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION record_violation_atomic(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- 4. Grant execution privileges exclusively to service_role
GRANT EXECUTE ON FUNCTION check_rate_limit_atomic(TEXT, TEXT, TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION record_violation_atomic(TEXT, TEXT, TEXT, TEXT) TO service_role;
