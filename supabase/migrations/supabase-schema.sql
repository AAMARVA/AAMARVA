-- AAMARVA Supabase Schema Definition
-- Run this in your Supabase SQL Editor to ensure all tables are correctly configured.

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  "agentId" TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  name TEXT DEFAULT 'AAMARVA Operator',
  status TEXT NOT NULL DEFAULT 'active',
  avatar TEXT,
  "apiKeyHash" TEXT,
  "apiKeyFingerprint" TEXT,
  bio TEXT,
  master_id TEXT,
  is_master_primary BOOLEAN DEFAULT FALSE,
  owner_email TEXT,
  "plan" TEXT DEFAULT 'free',
  plan_status TEXT DEFAULT 'inactive',
  plan_allowance INTEGER DEFAULT 10,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "passwordChangedAt" TIMESTAMPTZ,
  "emailVerified" BOOLEAN DEFAULT FALSE,
  "emailVerifiedAt" TIMESTAMPTZ,
  "whitelisted_networks" TEXT[]
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS users_email_idx;

-- 1.5. User Key Vaults Table (Session-Based Decryption)
CREATE TABLE IF NOT EXISTS user_key_vaults (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure name, apiKeyFingerprint, emailVerified columns exist on existing deployments
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'AAMARVA Operator';
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN name SET DEFAULT 'AAMARVA Operator';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "apiKeyFingerprint" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "whitelisted_networks" TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS "plan" TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "plan_status" TEXT DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "plan_allowance" INTEGER DEFAULT 10;
ALTER TABLE users ADD COLUMN IF NOT EXISTS master_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_master_primary BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- 1.6. Master Plan Entitlements Table (Database-Backed Entitlements)
CREATE TABLE IF NOT EXISTS master_plan_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_account_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'master_slave_scale',
  plan_name TEXT NOT NULL DEFAULT 'Master & Slave Agent Plan',
  status TEXT NOT NULL DEFAULT 'active',
  allowance_accounts INTEGER NOT NULL DEFAULT 10,
  tier TEXT NOT NULL DEFAULT 'scale',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT unique_active_master_plan UNIQUE (master_account_id, plan_type)
);

CREATE INDEX IF NOT EXISTS idx_master_plan_entitlements_lookup 
  ON master_plan_entitlements(master_account_id, status);


-- 4. Connections Table (Canonical Direct Connection Schema)
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  user1_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user1_agent_id TEXT NOT NULL,
  user1_agent_name TEXT NOT NULL,
  user2_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_agent_id TEXT NOT NULL,
  user2_agent_name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reconcile schema: rename old columns if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'postOwnerUserId') THEN
    ALTER TABLE connections RENAME COLUMN "postOwnerUserId" TO user1_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'replyAuthorUserId') THEN
    ALTER TABLE connections RENAME COLUMN "replyAuthorUserId" TO user2_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'postOwnerAgentId') THEN
    ALTER TABLE connections RENAME COLUMN "postOwnerAgentId" TO user1_agent_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'replyAuthorAgentId') THEN
    ALTER TABLE connections RENAME COLUMN "replyAuthorAgentId" TO user2_agent_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'postOwnerAgentName') THEN
    ALTER TABLE connections RENAME COLUMN "postOwnerAgentName" TO user1_agent_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'replyAuthorAgentName') THEN
    ALTER TABLE connections RENAME COLUMN "replyAuthorAgentName" TO user2_agent_name;
  END IF;

  ALTER TABLE connections DROP COLUMN IF EXISTS "requestId";
  ALTER TABLE connections DROP COLUMN IF EXISTS "postId";
  ALTER TABLE connections DROP COLUMN IF EXISTS "replyId";
END $$;

-- Ensure all connection columns and backward-compatible fields exist
ALTER TABLE connections ADD COLUMN IF NOT EXISTS user1_id TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS user1_agent_id TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS user1_agent_name TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS user2_id TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS user2_agent_id TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS user2_agent_name TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE connections ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE connections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_connections_user1_id ON connections(user1_id);
CREATE INDEX IF NOT EXISTS idx_connections_user2_id ON connections(user2_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status);
CREATE INDEX IF NOT EXISTS idx_connections_created_at ON connections("createdAt" DESC);

-- Drop obsolete tables
DROP TABLE IF EXISTS connection_requests CASCADE;
DROP TABLE IF EXISTS cluster_invites CASCADE;



-- ==============================================================================
-- 13. Account Audit Logs Table (Unified tracking for all outbound, inbound, system & identity account events)
-- ==============================================================================

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
ALTER TABLE external_events ADD COLUMN IF NOT EXISTS details TEXT;
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
ALTER TABLE security_enforcement_events ADD COLUMN IF NOT EXISTS ip TEXT;


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

  -- connections
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'connections') THEN
    ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_postOwnerUserId_fkey;
    ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_replyAuthorUserId_fkey;
    ALTER TABLE connections DROP CONSTRAINT IF EXISTS fk_connections_post_owner;
    ALTER TABLE connections DROP CONSTRAINT IF EXISTS fk_connections_reply_author;
    ALTER TABLE connections DROP CONSTRAINT IF EXISTS fk_connections_user1;
    ALTER TABLE connections DROP CONSTRAINT IF EXISTS fk_connections_user2;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'user1_id') THEN
      ALTER TABLE connections ADD CONSTRAINT fk_connections_user1 FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'user2_id') THEN
      ALTER TABLE connections ADD CONSTRAINT fk_connections_user2 FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
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

-- ==============================================================================
-- 21. CLUSTERS & SECURE GROUP CHAT TABLES
-- ==============================================================================

-- Create clusters table
CREATE TABLE IF NOT EXISTS clusters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  "ownerUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "ownerAgentId" TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure status column exists on clusters table
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Create cluster_members table
CREATE TABLE IF NOT EXISTS cluster_members (
  id TEXT PRIMARY KEY,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "agentId" TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status TEXT DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("clusterId", "userId")
);

-- Ensure status column exists on cluster_members table
ALTER TABLE cluster_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
UPDATE clusters SET status = 'active' WHERE status IS NULL;
UPDATE cluster_members SET status = 'active' WHERE status IS NULL;

-- Create cluster_messages table
CREATE TABLE IF NOT EXISTS cluster_messages (
  id TEXT PRIMARY KEY,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "senderUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "senderAgentId" TEXT NOT NULL,
  content TEXT,
  ciphertext TEXT NOT NULL,
  nonce TEXT,
  version INTEGER DEFAULT 1,
  "keyEpoch" INTEGER DEFAULT 1,
  sequence BIGINT,
  keys JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS "keyEpoch" INTEGER DEFAULT 1;
ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS sequence BIGINT;
ALTER TABLE cluster_messages ADD COLUMN IF NOT EXISTS keys JSONB;
ALTER TABLE cluster_messages ALTER COLUMN nonce DROP NOT NULL;

-- Create cluster_message_recipients table for per-recipient E2EE key distribution
CREATE TABLE IF NOT EXISTS cluster_message_recipients (
  id TEXT PRIMARY KEY,
  "messageId" TEXT NOT NULL REFERENCES cluster_messages(id) ON DELETE CASCADE,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "recipientAgentId" TEXT NOT NULL,
  "recipientUserId" TEXT,
  "wrappedKey" TEXT NOT NULL,
  "wrappedKeyIv" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create cluster_epochs table
CREATE TABLE IF NOT EXISTS cluster_epochs (
  id TEXT PRIMARY KEY,
  "clusterId" TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  "epoch" INTEGER NOT NULL,
  "keyFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("clusterId", "epoch")
);

-- Index optimization for fast routing and queries
CREATE INDEX IF NOT EXISTS idx_clusters_owner ON clusters("ownerUserId");
CREATE INDEX IF NOT EXISTS idx_cluster_members_cluster ON cluster_members("clusterId");
CREATE INDEX IF NOT EXISTS idx_cluster_members_user ON cluster_members("userId");
CREATE INDEX IF NOT EXISTS idx_cluster_messages_cluster ON cluster_messages("clusterId");
CREATE INDEX IF NOT EXISTS idx_cluster_message_recipients_message ON cluster_message_recipients("messageId");
CREATE INDEX IF NOT EXISTS idx_cluster_message_recipients_recipient ON cluster_message_recipients("recipientAgentId");
CREATE INDEX IF NOT EXISTS idx_cluster_message_recipients_cluster ON cluster_message_recipients("clusterId");
CREATE INDEX IF NOT EXISTS idx_cluster_epochs_cluster ON cluster_epochs("clusterId");

-- Strictly enforce Max 1 Active Cluster per account
CREATE UNIQUE INDEX IF NOT EXISTS idx_clusters_one_active_per_owner 
ON clusters ("ownerUserId") 
WHERE (status = 'active');




-- ==============================================================================
-- 22. WEBAUTHN / PASSKEY HARDWARE AUTHENTICATION TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "publicKey" TEXT NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "transports" TEXT[],
  "deviceType" TEXT,
  "backedUp" BOOLEAN DEFAULT FALSE,
  "friendlyName" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastUsedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "challenge" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user ON webauthn_credentials("userId");
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user ON webauthn_challenges("userId");

-- ==============================================================================
-- 23. SECURITY QUOTAS & ATOMIC RATE LIMITING
-- ==============================================================================

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

-- Atomic Quota & Rate Limit Check Function
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

-- Agent Inventory Buffer Table (Pre-generated Agent IDs and Avatars Queue)
CREATE TABLE IF NOT EXISTS agent_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agentId" TEXT UNIQUE NOT NULL,
  avatar TEXT NOT NULL,
  is_recycled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for ultra-fast First-In First-Out (FIFO) pop queries
CREATE INDEX IF NOT EXISTS idx_agent_inventory_created_at 
ON agent_inventory (created_at ASC);

-- Enable Row Level Security (RLS) on agent_inventory
ALTER TABLE agent_inventory ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access to agent_inventory
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_inventory' AND policyname = 'Allow service_role full access to agent_inventory'
  ) THEN
    CREATE POLICY "Allow service_role full access to agent_inventory"
    ON agent_inventory
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- ==============================================================================
-- 20. APPLICATIONS & INTAKE SYSTEM TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email_address TEXT NOT NULL,
  github_profile TEXT,
  linkedin_profile TEXT,
  x_profile TEXT,
  reddit_profile TEXT,
  best_describes TEXT NOT NULL,
  operating_agent TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_url TEXT NOT NULL,
  agent_details TEXT NOT NULL,
  agent_stage TEXT NOT NULL,
  agent_frameworks TEXT[] NOT NULL DEFAULT '{}',
  agent_operate_location TEXT NOT NULL,
  dev_environment TEXT NOT NULL,
  dev_environment_other TEXT,
  languages TEXT[] NOT NULL DEFAULT '{}',
  languages_other TEXT,
  model_providers TEXT[] NOT NULL DEFAULT '{}',
  model_providers_other TEXT,
  uses_external_tools TEXT NOT NULL,
  communicates_with_agents TEXT NOT NULL,
  communication_details TEXT,
  hope_to_accomplish TEXT NOT NULL,
  agent_use_purpose TEXT NOT NULL,
  discover_capability TEXT NOT NULL,
  discovery_problems TEXT NOT NULL,
  contributions TEXT[] NOT NULL DEFAULT '{}',
  contributions_other TEXT,
  first_30_days TEXT NOT NULL,
  additional_notes TEXT,
  status TEXT NOT NULL DEFAULT 'Under Review',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Ensure newly added columns exist on existing deployments
ALTER TABLE applications ADD COLUMN IF NOT EXISTS x_profile TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reddit_profile TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Under Review';

-- Enable RLS on applications
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'applications' AND policyname = 'Allow service_role full access to applications'
  ) THEN
    CREATE POLICY "Allow service_role full access to applications"
    ON applications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- ==============================================================================
-- 21. REGISTRATION WHITELIST TABLE
-- Strictly governs gated sign-up / account registration on the floor.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS registration_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for case-insensitive lookup
CREATE INDEX IF NOT EXISTS idx_registration_whitelist_email_lower
ON registration_whitelist (LOWER(email));

-- Enable RLS on registration_whitelist
ALTER TABLE registration_whitelist ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'registration_whitelist' AND policyname = 'Allow service_role full access to registration_whitelist'
  ) THEN
    CREATE POLICY "Allow service_role full access to registration_whitelist"
    ON registration_whitelist
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- Seed default whitelisted addresses
INSERT INTO registration_whitelist (email)
VALUES 
  ('aamarvaandplatforms@gmail.com'),
  ('founder@aamarva.com')
ON CONFLICT (email) DO NOTHING;

-- ==============================================================================
-- 22. CAPABILITY ENTITLEMENTS TABLE
-- Tied strictly to individual agent_id of the Slave Account, NOT master_account_id.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS capability_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  user_id TEXT,
  master_id TEXT,
  capability_level INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
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

-- Enable RLS on capability_entitlements
ALTER TABLE capability_entitlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'capability_entitlements' AND policyname = 'Allow service_role full access to capability_entitlements'
  ) THEN
    CREATE POLICY "Allow service_role full access to capability_entitlements"
    ON capability_entitlements
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- ==============================================================================
-- 23. ATOMIC SLAVE SLOT ALLOCATION
-- Uses FOR UPDATE (NOT FOR SHARE) on master_plan_entitlements to eliminate race conditions
-- ==============================================================================
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

-- ==============================================================================
-- 24. AAMARVA FLOOR // TOOLS & MCP GOVERNANCE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY DEFAULT ('srv_' || gen_random_uuid()::TEXT),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  transport TEXT NOT NULL DEFAULT 'http-streamable',
  endpoint TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none',
  auth_header_name TEXT,
  auth_credential_encrypted TEXT,
  session_id_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_checked TIMESTAMPTZ,
  last_error TEXT,
  server_info JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_owner_id ON mcp_servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_status ON mcp_servers(status);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id TEXT PRIMARY KEY DEFAULT ('tool_' || gen_random_uuid()::TEXT),
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  input_schema JSONB DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_tools_server_id ON mcp_tools(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tools_owner_id ON mcp_tools(owner_id);

CREATE TABLE IF NOT EXISTS mcp_tool_assignments (
  id TEXT PRIMARY KEY DEFAULT ('asgn_' || gen_random_uuid()::TEXT),
  tool_id TEXT NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tool_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_mcp_assignments_tool ON mcp_tool_assignments(tool_id);
CREATE INDEX IF NOT EXISTS idx_mcp_assignments_agent ON mcp_tool_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_mcp_assignments_owner ON mcp_tool_assignments(owner_id);

-- 25. AAMARVA FLOOR // HITL TEMPORARY AUTHORIZATION & GRANTS
CREATE TABLE IF NOT EXISTS mcp_tool_policies (
  id TEXT PRIMARY KEY DEFAULT ('pol_' || gen_random_uuid()::TEXT),
  tool_id TEXT NOT NULL UNIQUE REFERENCES mcp_tools(id) ON DELETE CASCADE,
  hitl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_policies_tool ON mcp_tool_policies(tool_id);

CREATE TABLE IF NOT EXISTS pending_tool_invocations (
  id TEXT PRIMARY KEY DEFAULT ('inv_' || gen_random_uuid()::TEXT),
  tool_id TEXT NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
  caller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  args_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'executing', 'executed', 'failed', 'denied', 'expired')),
  execution_result JSONB,
  execution_error TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_invocations_tool ON pending_tool_invocations(tool_id);
CREATE INDEX IF NOT EXISTS idx_pending_invocations_caller ON pending_tool_invocations(caller_id);
CREATE INDEX IF NOT EXISTS idx_pending_invocations_agent ON pending_tool_invocations(agent_id);
CREATE INDEX IF NOT EXISTS idx_pending_invocations_owner ON pending_tool_invocations(owner_id);
CREATE INDEX IF NOT EXISTS idx_pending_invocations_status ON pending_tool_invocations(status);

CREATE TABLE IF NOT EXISTS tool_execution_grants (
  id TEXT PRIMARY KEY DEFAULT ('grant_' || gen_random_uuid()::TEXT),
  invocation_id TEXT NOT NULL UNIQUE REFERENCES pending_tool_invocations(id) ON DELETE CASCADE,
  grant_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_grants_invocation ON tool_execution_grants(invocation_id);
CREATE INDEX IF NOT EXISTS idx_tool_grants_token_hash ON tool_execution_grants(grant_token_hash);

-- Enable Row Level Security (RLS)
ALTER TABLE mcp_tool_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_tool_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_execution_grants ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 26. AAMARVA FLOOR // PERSISTENT MCP TOOL GRANTS & ACCESS REQUESTS
-- ==============================================================================

-- 1. Table for persistent account-level tool grants
CREATE TABLE IF NOT EXISTS mcp_tool_grants (
  id TEXT PRIMARY KEY DEFAULT ('grant_' || gen_random_uuid()::TEXT),
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL, -- Account / Agent ID (e.g. Master ID or Slave Agent ID)
  granted_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, tool_id, account_id)
);

ALTER TABLE mcp_tool_grants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE mcp_tool_grants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE mcp_tool_grants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_mcp_tool_grants_server ON mcp_tool_grants(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_grants_tool ON mcp_tool_grants(tool_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_grants_account ON mcp_tool_grants(account_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_grants_status ON mcp_tool_grants(status);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_grants_lookup ON mcp_tool_grants(server_id, tool_id, account_id, status);

-- 2. Table for MCP Tool Access Requests
CREATE TABLE IF NOT EXISTS mcp_tool_requests (
  id TEXT PRIMARY KEY DEFAULT ('req_' || gen_random_uuid()::TEXT),
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  server_name TEXT NOT NULL,
  account_id TEXT NOT NULL, -- Target account / agent ID
  caller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_name TEXT,
  requested_operation TEXT NOT NULL DEFAULT 'tool_invocation',
  arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS tool_name TEXT;
ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS server_name TEXT;
ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS requested_operation TEXT DEFAULT 'tool_invocation';
ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS arguments JSONB DEFAULT '{}'::jsonb;
ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE mcp_tool_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_server ON mcp_tool_requests(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_tool ON mcp_tool_requests(tool_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_account ON mcp_tool_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_status ON mcp_tool_requests(status);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_caller ON mcp_tool_requests(caller_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_pending ON mcp_tool_requests(server_id, tool_id, account_id, status);

-- Enable Row Level Security (RLS) for all FLOOR tables
ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_requests ENABLE ROW LEVEL SECURITY;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';









