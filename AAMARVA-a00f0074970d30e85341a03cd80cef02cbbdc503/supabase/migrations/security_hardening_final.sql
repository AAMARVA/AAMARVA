-- AAMARVA SECURITY HARDENING: FINAL ATOMIC RPCs & IP ESCALATION
-- This migration adds support for atomic critical violations and temporary IP restrictions.

-- 1. Atomic Critical Violation Recording
-- Forces a permanent ban immediately if certain conditions are met, or handles high-severity escalation.
CREATE OR REPLACE FUNCTION record_critical_violation_atomic(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_reason TEXT,
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
    ip,
    "isPermanentlyBanned"
  ) VALUES (
    p_identifier,
    p_endpoint,
    'S3',
    100, -- Force threshold breach
    NOW(),
    NOW(),
    p_ip,
    TRUE
  )
  ON CONFLICT (identifier, endpoint)
  DO UPDATE SET
    "violationCount" = GREATEST(security_violations."violationCount", 100),
    "lastViolationAt" = NOW(),
    "updatedAt" = NOW(),
    ip = COALESCE(p_ip, security_violations.ip),
    "isPermanentlyBanned" = TRUE
  RETURNING * INTO v_violation;

  RETURN to_jsonb(v_violation);
END;
$$;

-- 2. IP Reputation & Escalating Restrictions
-- Handles temporary restrictions for IP addresses.
CREATE OR REPLACE FUNCTION record_ip_penalty_atomic(
  p_ip TEXT,
  p_penalty INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reputation RECORD;
  v_new_score INTEGER;
  v_violation_count INTEGER;
  v_restricted_until TIMESTAMPTZ;
  v_durations INTERVAL[] := ARRAY[
    '5 minutes'::INTERVAL,
    '15 minutes'::INTERVAL,
    '1 hour'::INTERVAL,
    '6 hours'::INTERVAL,
    '24 hours'::INTERVAL,
    '7 days'::INTERVAL
  ];
BEGIN
  INSERT INTO ip_reputations (
    ip,
    score,
    "violationCount",
    "lastViolationAt",
    "updatedAt",
    "isBlacklisted"
  ) VALUES (
    p_ip,
    GREATEST(0, 100 - p_penalty),
    1,
    NOW(),
    NOW(),
    FALSE
  )
  ON CONFLICT (ip)
  DO UPDATE SET
    score = GREATEST(0, ip_reputations.score - p_penalty),
    "violationCount" = ip_reputations."violationCount" + 1,
    "lastViolationAt" = NOW(),
    "updatedAt" = NOW()
  RETURNING * INTO v_reputation;

  -- Calculate restriction if score is low
  IF v_reputation.score <= 10 THEN
    v_restricted_until := NOW() + v_durations[LEAST(v_reputation."violationCount", array_length(v_durations, 1))];
    
    UPDATE ip_reputations 
    SET "isBlacklisted" = TRUE, 
        "updatedAt" = NOW() 
    WHERE ip = p_ip;
    
    v_reputation."isBlacklisted" := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'ip', v_reputation.ip,
    'score', v_reputation.score,
    'violationCount', v_reputation."violationCount",
    'isBlacklisted', v_reputation."isBlacklisted",
    'restrictedUntil', v_restricted_until
  );
END;
$$;

-- 3. Revoke/Grant permissions
REVOKE EXECUTE ON FUNCTION record_critical_violation_atomic(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION record_ip_penalty_atomic(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_critical_violation_atomic(TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_ip_penalty_atomic(TEXT, INTEGER) TO service_role;
