-- Migration: add_mcp_servers_and_tools.sql
-- Creates schema for AAMARVA FLOOR: MCP Server and Tool Governance (Canonical TEXT IDs)

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY DEFAULT ('srv_' || gen_random_uuid()::TEXT),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  transport TEXT NOT NULL DEFAULT 'http-streamable', -- 'http-streamable', 'http-sse'
  endpoint TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none', -- 'none', 'bearer', 'api-key', 'custom-header'
  auth_header_name TEXT,
  auth_credential_encrypted TEXT, -- Protected credential, never exposed via GET
  session_id_encrypted TEXT, -- Protected session ID for session-dependent transports
  status TEXT NOT NULL DEFAULT 'disconnected', -- 'connected', 'connecting', 'disconnected', 'error', 'disabled'
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
  agent_id TEXT NOT NULL, -- User ID or Agent Identifier (e.g. Master ID or Slave Agent ID)
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tool_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_mcp_assignments_tool ON mcp_tool_assignments(tool_id);
CREATE INDEX IF NOT EXISTS idx_mcp_assignments_agent ON mcp_tool_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_mcp_assignments_owner ON mcp_tool_assignments(owner_id);
