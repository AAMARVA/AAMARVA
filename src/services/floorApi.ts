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
  hasCapabilityIncrement?: boolean;
  plan?: string;
  isCapped?: boolean;
  expires_at?: string;
  plan_created_at?: string;
  created_at?: string;
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

export async function updateMcpServerApi(
  serverId: string,
  payload: {
    name?: string;
    endpoint?: string;
    description?: string;
    transport?: 'http-streamable';
    auth_type?: 'none' | 'bearer' | 'api-key' | 'custom-header';
    auth_header_name?: string;
    auth_credential?: string;
  }
): Promise<{ server: McpServer; tools: McpTool[]; discoveryNotice?: string | null }> {
  const res = await apiFetch(`/api/floor/servers/${serverId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    authType: 'human'
  });

  if (!res?.success) {
    throw new Error(res?.error?.message || 'Failed to update MCP server');
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

export async function invokeMcpToolApi(
  toolId: string,
  args: Record<string, any>,
  reason: string = 'Operator manual invocation',
  requestType: 'access' | 'hitl' = 'access'
): Promise<any> {
  const res = await apiFetch(`/api/floor/tools/${toolId}/invoke`, {
    method: 'POST',
    body: JSON.stringify({ arguments: args, reason, requestType }),
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
  try {
    const res = await apiFetch('/api/floor/pending-invocations', { authType: 'human' });
    if (res?.success && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  } catch {
    return [];
  }
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

export interface McpToolGrant {
  id: string;
  server_id: string;
  tool_id: string;
  account_id: string;
  granted_by: string;
  status: 'active' | 'revoked';
  created_at: string;
  updated_at: string;
}

export interface McpToolRequest {
  id: string;
  server_id: string;
  tool_id: string;
  tool_name: string;
  server_name: string;
  account_id: string;
  caller_id: string;
  agent_name?: string;
  requested_operation: string;
  arguments: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchServerGrantsApi(serverId: string): Promise<McpToolGrant[]> {
  const res = await apiFetch(`/api/floor/servers/${serverId}/grants`, { authType: getCurrentSessionAuthType() });
  if (res?.success && Array.isArray(res.data)) {
    return res.data;
  }
  return [];
}

export async function setToolGrantApi(
  toolId: string,
  accountId: string,
  granted: boolean
): Promise<{ success: boolean; granted: boolean; grant?: McpToolGrant }> {
  const res = await apiFetch(`/api/floor/tools/${toolId}/grants`, {
    method: 'POST',
    body: JSON.stringify({ accountId, granted }),
    authType: 'human'
  });

  if (!res?.success) {
    throw new Error(res?.error?.message || 'Failed to update tool grant');
  }
  return res;
}

export async function fetchToolRequestsApi(
  serverId?: string,
  status?: string
): Promise<McpToolRequest[]> {
  const params = new URLSearchParams();
  if (serverId) params.set('serverId', serverId);
  if (status && status !== 'all') params.set('status', status);
  const queryStr = params.toString() ? `?${params.toString()}` : '';

  const res = await apiFetch(`/api/floor/requests${queryStr}`, { authType: 'human' });
  if (res?.success && Array.isArray(res.data)) {
    return res.data;
  }
  return [];
}

export async function approveToolRequestApi(
  requestId: string
): Promise<{ success: boolean; request: McpToolRequest; grant: McpToolGrant }> {
  const res = await apiFetch(`/api/floor/requests/${requestId}/approve`, {
    method: 'POST',
    authType: 'human'
  });

  if (!res?.success) {
    throw new Error(res?.error?.message || 'Failed to approve tool access request');
  }
  return res;
}

export async function rejectToolRequestApi(
  requestId: string,
  reason?: string
): Promise<{ success: boolean; request: McpToolRequest }> {
  const res = await apiFetch(`/api/floor/requests/${requestId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
    authType: 'human'
  });

  if (!res?.success) {
    throw new Error(res?.error?.message || 'Failed to reject tool access request');
  }
  return res;
}


