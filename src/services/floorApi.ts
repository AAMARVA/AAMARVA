import { apiFetch, getCurrentSessionAuthType } from './authApi';

export interface McpServer {
  id: string;
  name: string;
  description: string;
  transport: 'http-streamable';
  endpoint: string;
  auth_type: 'none' | 'bearer' | 'api-key' | 'custom-header';
  auth_header_name?: string;
  has_credential?: boolean;
  status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'disabled';
  last_checked: string;
  last_error?: string;
  server_info?: Record<string, any>;
  tools_count?: number;
  assigned_agents_count?: number;
  created_at: string;
  updated_at: string;
}

export interface McpTool {
  id: string;
  server_id: string;
  owner_id: string;
  name: string;
  description: string;
  input_schema: Record<string, any>;
  is_enabled: boolean;
  assigned_agents?: string[];
  created_at: string;
  updated_at: string;
}

export interface FleetAgent {
  id: string;
  agentId: string;
  name: string;
  avatar: string;
  isMaster: boolean;
}

export async function fetchMcpServers(): Promise<McpServer[]> {
  const res = await apiFetch('/api/floor/servers', { authType: getCurrentSessionAuthType() });
  if (res?.success && Array.isArray(res.data)) {
    return res.data;
  }
  return [];
}

export async function addMcpServerApi(payload: {
  name: string;
  endpoint: string;
  description?: string;
  transport?: 'http-streamable';
  auth_type?: 'none' | 'bearer' | 'api-key' | 'custom-header';
  auth_header_name?: string;
  auth_credential?: string;
}): Promise<{ server: McpServer; tools: McpTool[]; discoveryNotice?: string | null }> {
  const res = await apiFetch('/api/floor/servers', {
    method: 'POST',
    body: JSON.stringify(payload),
    authType: 'human'
  });

  if (!res?.success) {
    throw new Error(res?.error?.message || 'Failed to connect to MCP server');
  }

  return {
    server: res.data,
    tools: res.tools || [],
    discoveryNotice: res.discoveryNotice
  };
}

export async function fetchServerDetails(serverId: string): Promise<McpServer & { tools: McpTool[] }> {
  const res = await apiFetch(`/api/floor/servers/${serverId}`, { authType: getCurrentSessionAuthType() });
  if (!res?.success) {
    throw new Error(res?.error?.message || 'Failed to fetch server details');
  }
  return res.data;
}

export async function reconnectMcpServerApi(serverId: string): Promise<{ server: McpServer; tools: McpTool[]; discoveryNotice?: string | null }> {
  const res = await apiFetch(`/api/floor/servers/${serverId}/reconnect`, {
    method: 'POST',
    authType: 'human'
  });

  if (!res?.success) {
    throw new Error(res?.error?.message || 'Re-connection failed');
  }

  return {
    server: res.data,
    tools: res.tools || [],
    discoveryNotice: res.discoveryNotice
  };
}

export async function deleteMcpServerApi(serverId: string): Promise<void> {
  const res = await apiFetch(`/api/floor/servers/${serverId}`, {
    method: 'DELETE',
    authType: 'human'
  });

  if (!res?.success) {
    throw new Error(res?.error?.message || 'Failed to delete MCP server');
  }
}

export async function fetchServerTools(serverId: string): Promise<McpTool[]> {
  const res = await apiFetch(`/api/floor/servers/${serverId}/tools`, { authType: getCurrentSessionAuthType() });
  if (res?.success && Array.isArray(res.data)) {
    return res.data;
  }
  return [];
}

export async function setToolAssignmentApi(toolId: string, agentId: string, granted: boolean): Promise<boolean> {
  const res = await apiFetch(`/api/floor/tools/${toolId}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ agentId, granted }),
    authType: 'human'
  });

  if (!res?.success) {
    throw new Error(res?.error?.message || 'Failed to update assignment');
  }
  return Boolean(res.assigned);
}

export async function fetchFleetAgents(): Promise<FleetAgent[]> {
  const res = await apiFetch('/api/floor/fleet-agents', { authType: getCurrentSessionAuthType() });
  if (res?.success && Array.isArray(res.data)) {
    return res.data;
  }
  return [];
}

export async function invokeMcpToolApi(toolId: string, args: Record<string, any>): Promise<any> {
  const res = await apiFetch(`/api/floor/tools/${toolId}/invoke`, {
    method: 'POST',
    body: JSON.stringify({ arguments: args }),
    authType: getCurrentSessionAuthType()
  });

  if (!res?.success) {
    throw new Error(res?.error?.message || 'Tool execution failed');
  }
  return res.data;
}

export interface PendingInvocation {
  id: string;
  tool_id: string;
  caller_id: string;
  agent_id: string;
  owner_id: string;
  args: Record<string, any>;
  args_hash: string;
  status: string;
  expires_at: string;
  created_at: string;
  tool_name: string;
  server_name: string;
}

export async function fetchPendingInvocations(): Promise<PendingInvocation[]> {
  const res = await apiFetch('/api/floor/pending-invocations', { authType: 'human' });
  if (!res?.success) {
    throw new Error(res?.error?.message || 'Failed to fetch pending tool invocations');
  }
  if (Array.isArray(res.data)) {
    return res.data;
  }
  return [];
}

export async function resolvePendingInvocationApi(invocationId: string, approved: boolean): Promise<boolean> {
  const res = await apiFetch(`/api/floor/approvals/${invocationId}`, {
    method: 'POST',
    body: JSON.stringify({ approved }),
    authType: 'human'
  });
  if (!res?.success) {
    throw new Error(res?.error?.message || 'Failed to process approval');
  }
  return true;
}

