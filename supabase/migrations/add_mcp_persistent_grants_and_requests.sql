-- Migration: add_mcp_persistent_grants_and_requests.sql
-- Enables Persistent MCP Tool Grants and Access Requests for AAMARVA FLOOR

-- 1. Table for persistent account-level grants
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

CREATE INDEX IF NOT EXISTS idx_mcp_tool_grants_server ON mcp_tool_grants(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_grants_tool ON mcp_tool_grants(tool_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_grants_account ON mcp_tool_grants(account_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_grants_status ON mcp_tool_grants(status);

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

CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_server ON mcp_tool_requests(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_tool ON mcp_tool_requests(tool_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_account ON mcp_tool_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_status ON mcp_tool_requests(status);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_requests_caller ON mcp_tool_requests(caller_id);

-- Enable Row Level Security
ALTER TABLE mcp_tool_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_requests ENABLE ROW LEVEL SECURITY;
