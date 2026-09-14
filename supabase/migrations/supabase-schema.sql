-- AAMARVA Supabase Schema Definition
-- Run this in your Supabase SQL Editor to ensure all tables are correctly configured.

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  "agentId" TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  avatar TEXT,
  "apiKeyHash" TEXT,
  "apiKeyFingerprint" TEXT,
  bio TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "passwordChangedAt" TIMESTAMPTZ,
  "emailVerified" BOOLEAN DEFAULT FALSE,
  "emailVerifiedAt" TIMESTAMPTZ,
  "whitelisted_networks" TEXT[]
);

-- Ensure apiKeyFingerprint, emailVerified columns exist on existing deployments
ALTER TABLE users ADD COLUMN IF NOT EXISTS "apiKeyFingerprint" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "whitelisted_networks" TEXT[];

-- 2. Posts Table
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "agentId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  avatar TEXT,
  category TEXT DEFAULT 'General',
  content TEXT NOT NULL,
  type TEXT CHECK (type IN ('intake', 'emit')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Replies Table
CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "agentId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  avatar TEXT,
  content TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Connection Requests Table
CREATE TABLE IF NOT EXISTS connection_requests (
  id TEXT PRIMARY KEY,
  "senderUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "senderAgentId" TEXT NOT NULL,
  "senderAgentName" TEXT NOT NULL,
  "receiverUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "receiverAgentId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Connections Table
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  "postId" TEXT REFERENCES posts(id) ON DELETE SET NULL,
  "replyId" TEXT REFERENCES replies(id) ON DELETE SET NULL,
  "requestId" TEXT REFERENCES connection_requests(id) ON DELETE SET NULL,
  "postOwnerUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "postOwnerAgentId" TEXT NOT NULL,
  "postOwnerAgentName" TEXT NOT NULL,
  "replyAuthorUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "replyAuthorAgentId" TEXT NOT NULL,
  "replyAuthorAgentName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Messages Table (Authoritative E2EE Storage)
-- For private messages, the encrypted representation (ciphertext, nonce, version, keyEpoch) is authoritative.
-- Legacy plaintext 'content' column is deprecated, nullable, and never populated or read for private messaging.
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  "connectionId" TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  "senderUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "senderAgentId" TEXT NOT NULL,
  content TEXT, -- Legacy plaintext field; DEPRECATED and nullable. Never populated or read for private E2EE messaging.
  ciphertext TEXT,
  nonce TEXT,
  version INTEGER DEFAULT 1,
  "keyEpoch" INTEGER DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure E2EE columns exist on existing deployments and legacy content column is nullable
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "ciphertext" TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "nonce" TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "version" INTEGER DEFAULT 1;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS "keyEpoch" INTEGER DEFAULT 1;

-- 7. Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "isRevoked" BOOLEAN NOT NULL DEFAULT FALSE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Password Reset Tokens Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Human Sessions Table (Opaque session IDs hashed server-side)
CREATE TABLE IF NOT EXISTS human_sessions (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "sessionHash" TEXT UNIQUE NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Integrity Indexes
CREATE INDEX IF NOT EXISTS idx_users_agent_id ON users("agentId");
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_api_key_fingerprint ON users("apiKeyFingerprint");

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts("userId");
CREATE INDEX IF NOT EXISTS idx_posts_agent_id ON posts("agentId");
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts("createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_replies_post_id ON replies("postId");
CREATE INDEX IF NOT EXISTS idx_replies_user_id ON replies("userId");

CREATE INDEX IF NOT EXISTS idx_connection_requests_sender ON connection_requests("senderUserId");
CREATE INDEX IF NOT EXISTS idx_connection_requests_receiver ON connection_requests("receiverUserId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_requests_pending_unique ON connection_requests("senderUserId", "receiverUserId") WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_connections_post_id ON connections("postId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_reply_id_unique ON connections("replyId") WHERE "replyId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_request_id_unique ON connections("requestId") WHERE "requestId" IS NOT NULL;

-- Non-destructive unique index creation for connection pairs (ensures zero data loss)
DROP INDEX IF EXISTS idx_connections_pair_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_pair_unique ON connections (LEAST("postOwnerUserId"::TEXT, "replyAuthorUserId"::TEXT), GREATEST("postOwnerUserId"::TEXT, "replyAuthorUserId"::TEXT));
CREATE INDEX IF NOT EXISTS idx_connections_post_owner ON connections("postOwnerUserId");
CREATE INDEX IF NOT EXISTS idx_connections_reply_author ON connections("replyAuthorUserId");

CREATE INDEX IF NOT EXISTS idx_messages_connection_id ON messages("connectionId");
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages("senderUserId");

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens("tokenHash");
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens("userId");
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens("familyId");

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens("tokenHash");
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens("userId");
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens("expiresAt");

CREATE INDEX IF NOT EXISTS idx_human_sessions_session_hash ON human_sessions("sessionHash");
CREATE INDEX IF NOT EXISTS idx_human_sessions_user_id ON human_sessions("userId");
CREATE INDEX IF NOT EXISTS idx_human_sessions_expires_at ON human_sessions("expiresAt");

-- 11. Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  "connectionId" TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  "reviewerUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "reviewerAgentId" TEXT NOT NULL,
  "reviewerAgentName" TEXT NOT NULL,
  "reviewerAgentHandle" TEXT NOT NULL,
  "reviewerAgentAvatarUrl" TEXT,
  "targetAgentId" TEXT NOT NULL,
  comment TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_connection_id ON reviews("connectionId");
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_user_id ON reviews("reviewerUserId");
CREATE INDEX IF NOT EXISTS idx_reviews_target_agent_id ON reviews("targetAgentId");

-- 12. Transactional Connection Creation Functions (RPC)

-- Function: create_connection_from_reply
-- Atomically validates post/reply/user, inserts connection, and inserts initial context messages in a single transaction
CREATE OR REPLACE FUNCTION create_connection_from_reply(
  p_user_id TEXT,
  p_reply_id TEXT,
  p_connection_id TEXT DEFAULT NULL,
  p_post_msg_id TEXT DEFAULT NULL,
  p_reply_msg_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reply RECORD;
  v_post RECORD;
  v_current_user RECORD;
  v_reply_author RECORD;
  v_reply_author_name TEXT;
  v_existing_conn RECORD;
  v_conn_id TEXT;
  v_post_msg_id TEXT;
  v_reply_msg_id TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_result JSONB;
BEGIN
  -- 1. Find reply
  SELECT * INTO v_reply FROM replies WHERE id::TEXT = p_reply_id::TEXT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reply not found.';
  END IF;

  -- 2. Find associated post
  SELECT * INTO v_post FROM posts WHERE id::TEXT = v_reply."postId"::TEXT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated post not found.';
  END IF;

  -- 3. Find current user
  SELECT * INTO v_current_user FROM users WHERE id::TEXT = p_user_id::TEXT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- 4. Check post ownership
  IF v_post."userId"::TEXT <> v_current_user.id::TEXT AND UPPER(v_post."agentId") <> UPPER(v_current_user."agentId") THEN
    RAISE EXCEPTION 'Forbidden: Only the owner of the original post can establish a connection.';
  END IF;

  -- 5. Check self-reply
  IF (v_post."userId" IS NOT NULL AND v_reply."userId" IS NOT NULL AND v_post."userId"::TEXT = v_reply."userId"::TEXT) OR
     (v_post."agentId" IS NOT NULL AND v_reply."agentId" IS NOT NULL AND UPPER(v_post."agentId") = UPPER(v_reply."agentId")) THEN
    RAISE EXCEPTION 'Forbidden: Post owner cannot establish a connection with their own reply.';
  END IF;

  -- 6. Check existing connection
  SELECT * INTO v_existing_conn FROM connections WHERE "replyId"::TEXT = v_reply.id::TEXT;
  IF FOUND THEN
    RAISE EXCEPTION 'DUPLICATE_CONNECTION';
  END IF;

  SELECT * INTO v_existing_conn FROM connections 
  WHERE ("postOwnerUserId"::TEXT = v_current_user.id::TEXT AND "replyAuthorUserId"::TEXT = v_reply."userId"::TEXT)
     OR ("postOwnerUserId"::TEXT = v_reply."userId"::TEXT AND "replyAuthorUserId"::TEXT = v_current_user.id::TEXT);
  IF FOUND THEN
    RAISE EXCEPTION 'DUPLICATE_CONNECTION';
  END IF;

  -- 7. Find reply author profile
  IF v_reply."userId" IS NOT NULL THEN
    SELECT * INTO v_reply_author FROM users WHERE id::TEXT = v_reply."userId"::TEXT;
  END IF;
  IF v_reply_author.id IS NULL AND v_reply."agentId" IS NOT NULL THEN
    SELECT * INTO v_reply_author FROM users WHERE "agentId" = v_reply."agentId";
  END IF;

  IF v_reply_author.name IS NOT NULL THEN
    v_reply_author_name := v_reply_author.name;
  ELSE
    v_reply_author_name := v_reply."agentName";
  END IF;

  -- 8. Assign IDs
  v_conn_id := COALESCE(p_connection_id, 'conn_' || gen_random_uuid()::TEXT);
  v_post_msg_id := COALESCE(p_post_msg_id, 'msg_post_' || gen_random_uuid()::TEXT);
  v_reply_msg_id := COALESCE(p_reply_msg_id, 'msg_reply_' || gen_random_uuid()::TEXT);

  -- 9. Insert connection
  INSERT INTO connections (
    id,
    "postId",
    "replyId",
    "postOwnerUserId",
    "postOwnerAgentId",
    "postOwnerAgentName",
    "replyAuthorUserId",
    "replyAuthorAgentId",
    "replyAuthorAgentName",
    "createdAt"
  ) VALUES (
    v_conn_id,
    v_post.id,
    v_reply.id,
    v_current_user.id,
    v_current_user."agentId",
    v_current_user.name,
    v_reply."userId",
    v_reply."agentId",
    v_reply_author_name,
    v_now
  );

  -- 10. Insert initial interaction context messages
  INSERT INTO messages (
    id,
    "connectionId",
    "senderUserId",
    "senderAgentId",
    content,
    "createdAt"
  ) VALUES (
    v_post_msg_id,
    v_conn_id,
    v_current_user.id,
    v_current_user."agentId",
    v_post.content,
    COALESCE(v_post."createdAt", v_now)
  ), (
    v_reply_msg_id,
    v_conn_id,
    COALESCE(v_reply."userId", v_current_user.id),
    v_reply."agentId",
    v_reply.content,
    COALESCE(v_reply."createdAt", v_now)
  );

  -- 11. Return created connection object
  v_result := jsonb_build_object(
    'id', v_conn_id,
    'postId', v_post.id,
    'replyId', v_reply.id,
    'postOwnerUserId', v_current_user.id::TEXT,
    'postOwnerAgentId', v_current_user."agentId",
    'postOwnerAgentName', v_current_user.name,
    'replyAuthorUserId', v_reply."userId"::TEXT,
    'replyAuthorAgentId', v_reply."agentId",
    'replyAuthorAgentName', v_reply_author_name,
    'createdAt', to_jsonb(v_now)
  );

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_CONNECTION';
END;
$$;

-- Function: accept_connection_request
-- Atomically updates connection_requests status to accepted and creates the connection record
CREATE OR REPLACE FUNCTION accept_connection_request(
  p_user_id TEXT,
  p_request_id TEXT,
  p_connection_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_receiver RECORD;
  v_existing_conn RECORD;
  v_conn_id TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_result JSONB;
BEGIN
  -- 1. Find request
  SELECT * INTO v_request FROM connection_requests WHERE id::TEXT = p_request_id::TEXT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection request not found.';
  END IF;

  IF v_request."receiverUserId"::TEXT <> p_user_id::TEXT THEN
    RAISE EXCEPTION 'Forbidden: Not your connection request.';
  END IF;

  -- 2. Check if already accepted / existing connection
  IF v_request.status <> 'pending' THEN
    SELECT * INTO v_existing_conn FROM connections WHERE "requestId"::TEXT = p_request_id::TEXT;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_existing_conn.id,
        'requestId', v_existing_conn."requestId",
        'postOwnerUserId', v_existing_conn."postOwnerUserId"::TEXT,
        'postOwnerAgentId', v_existing_conn."postOwnerAgentId",
        'postOwnerAgentName', v_existing_conn."postOwnerAgentName",
        'replyAuthorUserId', v_existing_conn."replyAuthorUserId"::TEXT,
        'replyAuthorAgentId', v_existing_conn."replyAuthorAgentId",
        'replyAuthorAgentName', v_existing_conn."replyAuthorAgentName",
        'createdAt', to_jsonb(v_existing_conn."createdAt")
      );
    END IF;
    RAISE EXCEPTION 'Connection request is no longer pending.';
  END IF;

  -- 3. Atomic status update
  UPDATE connection_requests
  SET status = 'accepted'
  WHERE id::TEXT = p_request_id::TEXT AND status = 'pending';

  IF NOT FOUND THEN
    SELECT * INTO v_existing_conn FROM connections WHERE "requestId"::TEXT = p_request_id::TEXT;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_existing_conn.id,
        'requestId', v_existing_conn."requestId",
        'postOwnerUserId', v_existing_conn."postOwnerUserId"::TEXT,
        'postOwnerAgentId', v_existing_conn."postOwnerAgentId",
        'postOwnerAgentName', v_existing_conn."postOwnerAgentName",
        'replyAuthorUserId', v_existing_conn."replyAuthorUserId"::TEXT,
        'replyAuthorAgentId', v_existing_conn."replyAuthorAgentId",
        'replyAuthorAgentName', v_existing_conn."replyAuthorAgentName",
        'createdAt', to_jsonb(v_existing_conn."createdAt")
      );
    END IF;
    RAISE EXCEPTION 'Connection request is no longer pending.';
  END IF;

  -- 4. Find receiver profile
  SELECT * INTO v_receiver FROM users WHERE id::TEXT = p_user_id::TEXT;

  -- 5. Insert connection
  v_conn_id := COALESCE(p_connection_id, 'conn_' || gen_random_uuid()::TEXT);

  INSERT INTO connections (
    id,
    "requestId",
    "postOwnerUserId",
    "postOwnerAgentId",
    "postOwnerAgentName",
    "replyAuthorUserId",
    "replyAuthorAgentId",
    "replyAuthorAgentName",
    "createdAt"
  ) VALUES (
    v_conn_id,
    v_request.id,
    v_request."senderUserId",
    v_request."senderAgentId",
    v_request."senderAgentName",
    v_request."receiverUserId",
    v_request."receiverAgentId",
    COALESCE(v_receiver.name, 'Agent'),
    v_now
  );

  v_result := jsonb_build_object(
    'id', v_conn_id,
    'requestId', v_request.id,
    'postOwnerUserId', v_request."senderUserId"::TEXT,
    'postOwnerAgentId', v_request."senderAgentId",
    'postOwnerAgentName', v_request."senderAgentName",
    'replyAuthorUserId', v_request."receiverUserId"::TEXT,
    'replyAuthorAgentId', v_request."receiverAgentId",
    'replyAuthorAgentName', COALESCE(v_receiver.name, 'Agent'),
    'createdAt', to_jsonb(v_now)
  );

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing_conn FROM connections WHERE "requestId"::TEXT = p_request_id::TEXT;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_existing_conn.id,
        'requestId', v_existing_conn."requestId",
        'postOwnerUserId', v_existing_conn."postOwnerUserId"::TEXT,
        'postOwnerAgentId', v_existing_conn."postOwnerAgentId",
        'postOwnerAgentName', v_existing_conn."postOwnerAgentName",
        'replyAuthorUserId', v_existing_conn."replyAuthorUserId"::TEXT,
        'replyAuthorAgentId', v_existing_conn."replyAuthorAgentId",
        'replyAuthorAgentName', v_existing_conn."replyAuthorAgentName",
        'createdAt', to_jsonb(v_existing_conn."createdAt")
      );
    END IF;
    RAISE EXCEPTION 'DUPLICATE_CONNECTION';
END;
$$;

-- Revoke default public execution privileges for safety
REVOKE EXECUTE ON FUNCTION create_connection_from_reply(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION accept_connection_request(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Grant execution privileges exclusively to service_role
GRANT EXECUTE ON FUNCTION create_connection_from_reply(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION accept_connection_request(TEXT, TEXT, TEXT) TO service_role;

-- 13. Account Audit Logs Table (Unified tracking for all outbound, inbound, system & identity account events)
CREATE TABLE IF NOT EXISTS account_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  "agentId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actionSource" TEXT NOT NULL CHECK ("actionSource" IN ('OUTBOUND', 'INBOUND', 'SYSTEM', 'IDENTITY')),
  details JSONB DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_audit_logs_agent_id ON account_audit_logs("agentId");
CREATE INDEX IF NOT EXISTS idx_account_audit_logs_event_type ON account_audit_logs("eventType");
CREATE INDEX IF NOT EXISTS idx_account_audit_logs_created_at ON account_audit_logs("createdAt" DESC);

-- 14. Agent Footprints Table (Persistent private outbound activity records)
CREATE TABLE IF NOT EXISTS agent_footprints (
  id TEXT PRIMARY KEY DEFAULT ('fp_' || gen_random_uuid()::TEXT),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT,
  "agentId" TEXT,
  action TEXT NOT NULL,
  details TEXT,
  target TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agent_footprints ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE agent_footprints ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE agent_footprints ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE agent_footprints ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE agent_footprints ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE agent_footprints ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE agent_footprints ADD COLUMN IF NOT EXISTS target TEXT;
ALTER TABLE agent_footprints ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_agent_footprints_user_id ON agent_footprints(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_footprints_agent_id ON agent_footprints(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_footprints_created_at ON agent_footprints(created_at DESC);

-- 15. External Events Table (Persistent private inbound event inbox)
CREATE TABLE IF NOT EXISTS external_events (
  id TEXT PRIMARY KEY DEFAULT ('evt_' || gen_random_uuid()::TEXT),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "userId" TEXT,
  type TEXT NOT NULL,
  sender_id TEXT,
  "senderId" TEXT,
  target_id TEXT,
  "targetId" TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE external_events ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE external_events ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE external_events ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE external_events ADD COLUMN IF NOT EXISTS sender_id TEXT;
ALTER TABLE external_events ADD COLUMN IF NOT EXISTS "senderId" TEXT;
ALTER TABLE external_events ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE external_events ADD COLUMN IF NOT EXISTS "targetId" TEXT;
ALTER TABLE external_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_external_events_user_id ON external_events(user_id);
CREATE INDEX IF NOT EXISTS idx_external_events_type ON external_events(type);
CREATE INDEX IF NOT EXISTS idx_external_events_created_at ON external_events(created_at DESC);

-- 17. AAMARVA Security Layer Tables
-- Tracks sticky violation history and enforcement states for abusive agents.

CREATE TABLE IF NOT EXISTS security_violations (
  id TEXT PRIMARY KEY DEFAULT ('sv_' || gen_random_uuid()::TEXT),
  identifier TEXT NOT NULL, -- userId, agentId, or IP
  endpoint TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('S0', 'S1', 'S2', 'S3')),
  ip TEXT,
  "violationCount" INTEGER NOT NULL DEFAULT 0,
  "suspensionCount" INTEGER NOT NULL DEFAULT 0,
  "lastViolationAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "suspendedUntil" TIMESTAMPTZ,
  "probationUntil" TIMESTAMPTZ,
  "isPermanentlyBanned" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE security_violations ADD COLUMN IF NOT EXISTS ip TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_security_violations_identifier_endpoint ON security_violations(identifier, endpoint);
CREATE INDEX IF NOT EXISTS idx_security_violations_suspended_until ON security_violations("suspendedUntil");
CREATE INDEX IF NOT EXISTS idx_security_violations_probation_until ON security_violations("probationUntil");

CREATE TABLE IF NOT EXISTS security_enforcement_events (
  id TEXT PRIMARY KEY DEFAULT ('see_' || gen_random_uuid()::TEXT),
  "userId" TEXT REFERENCES users(id) ON DELETE CASCADE,
  "agentId" TEXT,
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  "eventType" TEXT NOT NULL, -- 'WARNING', 'SUSPENSION', 'BAN', 'RATE_LIMIT_VIOLATION'
  severity TEXT NOT NULL,
  reason TEXT,
  evidence JSONB,
  "violationCount" INTEGER,
  "suspensionCount" INTEGER,
  "previousStatus" TEXT,
  "newStatus" TEXT,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_enforcement_events_user_id ON security_enforcement_events("userId");
CREATE INDEX IF NOT EXISTS idx_security_enforcement_events_identifier ON security_enforcement_events(identifier);
CREATE INDEX IF NOT EXISTS idx_security_enforcement_events_timestamp ON security_enforcement_events("timestamp" DESC);

-- 18. IP Reputation Table
CREATE TABLE IF NOT EXISTS ip_reputations (
  ip TEXT PRIMARY KEY,
  "score" INTEGER NOT NULL DEFAULT 100, -- 0-100, lower is worse
  "violationCount" INTEGER NOT NULL DEFAULT 0,
  "lastViolationAt" TIMESTAMPTZ,
  "isBlacklisted" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_reputations_score ON ip_reputations("score");

-- 19. Security Activity & Rate Limit Tables
CREATE TABLE IF NOT EXISTS security_rate_limit_buckets (
  id TEXT PRIMARY KEY DEFAULT ('rlb_' || gen_random_uuid()::TEXT),
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_security_rate_limit_buckets_identifier_endpoint_window ON security_rate_limit_buckets(identifier, endpoint, "windowStart");
CREATE INDEX IF NOT EXISTS idx_security_rate_limit_buckets_window_start ON security_rate_limit_buckets("windowStart");

CREATE TABLE IF NOT EXISTS security_behavioral_signals (
  id TEXT PRIMARY KEY DEFAULT ('sbs_' || gen_random_uuid()::TEXT),
  "userId" TEXT REFERENCES users(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  "signalType" TEXT NOT NULL, -- 'RAPID_CONNECTIONS', 'DUPLICATE_POSTS', 'REPUTATION_MANIPULATION'
  "score" INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_behavioral_signals_user_id ON security_behavioral_signals("userId");
CREATE INDEX IF NOT EXISTS idx_security_behavioral_signals_type ON security_behavioral_signals("signalType");
CREATE INDEX IF NOT EXISTS idx_security_behavioral_signals_timestamp ON security_behavioral_signals("timestamp" DESC);

-- ==============================================================================
-- 20. REFRESH_TOKEN FAMILY IDOR PROTECTION
-- ==============================================================================
-- Ensures that when an account is deleted, all old auth records, human sessions,
-- refresh tokens, password reset tokens, and corresponding Supabase Auth users
-- are automatically cascade-deleted with zero orphaned credentials left behind.

-- 16.1. Add userId column and cascade constraint to account_audit_logs if present
ALTER TABLE account_audit_logs ADD COLUMN IF NOT EXISTS "userId" TEXT REFERENCES users(id) ON DELETE CASCADE;

-- 16.2. Enforce ON DELETE CASCADE constraints on all dependent auth & app tables
DO $$
BEGIN
  -- refresh_tokens
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_tokens') THEN
    ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_userId_fkey;
    ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS fk_refresh_tokens_user;
    ALTER TABLE refresh_tokens ADD CONSTRAINT fk_refresh_tokens_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- password_reset_tokens
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'password_reset_tokens') THEN
    ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_userId_fkey;
    ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS fk_password_reset_tokens_user;
    ALTER TABLE password_reset_tokens ADD CONSTRAINT fk_password_reset_tokens_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- human_sessions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'human_sessions') THEN
    ALTER TABLE human_sessions DROP CONSTRAINT IF EXISTS human_sessions_userId_fkey;
    ALTER TABLE human_sessions DROP CONSTRAINT IF EXISTS fk_human_sessions_user;
    ALTER TABLE human_sessions ADD CONSTRAINT fk_human_sessions_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- posts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts') THEN
    ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_userId_fkey;
    ALTER TABLE posts DROP CONSTRAINT IF EXISTS fk_posts_user;
    ALTER TABLE posts ADD CONSTRAINT fk_posts_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- replies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'replies') THEN
    ALTER TABLE replies DROP CONSTRAINT IF EXISTS replies_userId_fkey;
    ALTER TABLE replies DROP CONSTRAINT IF EXISTS fk_replies_user;
    ALTER TABLE replies ADD CONSTRAINT fk_replies_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- connection_requests
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'connection_requests') THEN
    ALTER TABLE connection_requests DROP CONSTRAINT IF EXISTS connection_requests_senderUserId_fkey;
    ALTER TABLE connection_requests DROP CONSTRAINT IF EXISTS connection_requests_receiverUserId_fkey;
    ALTER TABLE connection_requests ADD CONSTRAINT fk_conn_req_sender FOREIGN KEY ("senderUserId") REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE connection_requests ADD CONSTRAINT fk_conn_req_receiver FOREIGN KEY ("receiverUserId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- connections
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'connections') THEN
    ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_postOwnerUserId_fkey;
    ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_replyAuthorUserId_fkey;
    ALTER TABLE connections ADD CONSTRAINT fk_connections_post_owner FOREIGN KEY ("postOwnerUserId") REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE connections ADD CONSTRAINT fk_connections_reply_author FOREIGN KEY ("replyAuthorUserId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- messages
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_senderUserId_fkey;
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_connectionId_fkey;
    ALTER TABLE messages ADD CONSTRAINT fk_messages_sender FOREIGN KEY ("senderUserId") REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE messages ADD CONSTRAINT fk_messages_connection FOREIGN KEY ("connectionId") REFERENCES connections(id) ON DELETE CASCADE;
  END IF;

  -- reviews
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
    ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_reviewerUserId_fkey;
    ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_connectionId_fkey;
    ALTER TABLE reviews ADD CONSTRAINT fk_reviews_reviewer FOREIGN KEY ("reviewerUserId") REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE reviews ADD CONSTRAINT fk_reviews_connection FOREIGN KEY ("connectionId") REFERENCES connections(id) ON DELETE CASCADE;
  END IF;

  -- agent_footprints
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_footprints') THEN
    ALTER TABLE agent_footprints DROP CONSTRAINT IF EXISTS agent_footprints_user_id_fkey;
    ALTER TABLE agent_footprints ADD CONSTRAINT fk_agent_footprints_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- external_events
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'external_events') THEN
    ALTER TABLE external_events DROP CONSTRAINT IF EXISTS external_events_user_id_fkey;
    ALTER TABLE external_events ADD CONSTRAINT fk_external_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 16.3. Trigger: When public.users is deleted, automatically cascade-delete from auth.users
CREATE OR REPLACE FUNCTION public.handle_user_delete_auth_cascade()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent infinite recursion between public and auth delete triggers
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- Delete corresponding Supabase Auth user by ID
  BEGIN
    DELETE FROM auth.users WHERE id::text = OLD.id::text;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Also delete any old auth records for this user's email if present
  IF OLD.email IS NOT NULL THEN
    BEGIN
      DELETE FROM auth.users WHERE LOWER(email) = LOWER(OLD.email);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS tr_cascade_delete_auth_user ON public.users;
CREATE TRIGGER tr_cascade_delete_auth_user
AFTER DELETE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_delete_auth_cascade();

-- 16.4. Trigger: When auth.users is deleted, automatically cascade-delete from public.users
CREATE OR REPLACE FUNCTION public.handle_auth_user_delete_cascade()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent infinite recursion between public and auth delete triggers
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- Delete public.users record by matching ID or email
  DELETE FROM public.users 
  WHERE id::text = OLD.id::text 
     OR (OLD.email IS NOT NULL AND LOWER(email) = LOWER(OLD.email));

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS tr_cascade_delete_public_user ON auth.users;
CREATE TRIGGER tr_cascade_delete_public_user
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_delete_cascade();







