-- Migration: add_hitl_tool_authorization.sql
-- Human-Approved, Temporary Authorization for FLOOR Tool Execution (HITL)

-- Ensure mcp_servers table has session_id_encrypted column for session-dependent transports
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS session_id_encrypted TEXT;

-- 1. MCP Tool Policies (HITL Configuration)
CREATE TABLE IF NOT EXISTS mcp_tool_policies (
  id TEXT PRIMARY KEY DEFAULT ('pol_' || gen_random_uuid()::TEXT),
  tool_id TEXT NOT NULL UNIQUE REFERENCES mcp_tools(id) ON DELETE CASCADE,
  hitl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_policies_tool ON mcp_tool_policies(tool_id);

-- 2. Pending Tool Invocations
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

-- 3. Tool Execution Grants (Temporary, Single-Use Server Grants)
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

-- 4. Enable Row Level Security (RLS)
ALTER TABLE mcp_tool_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_tool_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_execution_grants ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Policies for mcp_tool_policies: Owner can manage policies for their tools
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mcp_tool_policies' AND policyname = 'mcp_tool_policies_owner_rw') THEN
    CREATE POLICY mcp_tool_policies_owner_rw ON mcp_tool_policies
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM mcp_tools
          WHERE mcp_tools.id = mcp_tool_policies.tool_id
          AND mcp_tools.owner_id = auth.uid()::text
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM mcp_tools
          WHERE mcp_tools.id = mcp_tool_policies.tool_id
          AND mcp_tools.owner_id = auth.uid()::text
        )
      );
  END IF;
END $$;

-- Policies for pending_tool_invocations: Owner or caller can read, owner can update (approve/deny)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pending_tool_invocations' AND policyname = 'pending_invocations_owner_or_caller') THEN
    CREATE POLICY pending_invocations_owner_or_caller ON pending_tool_invocations
      FOR SELECT
      USING (owner_id = auth.uid()::text OR caller_id = auth.uid()::text);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pending_tool_invocations' AND policyname = 'pending_invocations_owner_manage') THEN
    CREATE POLICY pending_invocations_owner_manage ON pending_tool_invocations
      FOR UPDATE
      USING (owner_id = auth.uid()::text)
      WITH CHECK (owner_id = auth.uid()::text);
  END IF;
END $$;

-- Policies for tool_execution_grants: Service role and tool owner access only
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tool_execution_grants' AND policyname = 'tool_grants_owner_policy') THEN
    CREATE POLICY tool_grants_owner_policy ON tool_execution_grants
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM pending_tool_invocations
          WHERE pending_tool_invocations.id = tool_execution_grants.invocation_id
          AND pending_tool_invocations.owner_id = auth.uid()::text
        )
      );
  END IF;
END $$;
