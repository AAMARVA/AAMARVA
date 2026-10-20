-- HITL Migration (Canonical Schema with Execution States)
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS session_id_encrypted TEXT;

CREATE TABLE IF NOT EXISTS mcp_tool_policies (
  id TEXT PRIMARY KEY DEFAULT ('pol_' || gen_random_uuid()::TEXT),
  tool_id TEXT NOT NULL UNIQUE REFERENCES mcp_tools(id) ON DELETE CASCADE,
  hitl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS tool_execution_grants (
  id TEXT PRIMARY KEY DEFAULT ('grant_' || gen_random_uuid()::TEXT),
  invocation_id TEXT NOT NULL UNIQUE REFERENCES pending_tool_invocations(id) ON DELETE CASCADE,
  grant_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mcp_tool_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_tool_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_execution_grants ENABLE ROW LEVEL SECURITY;
