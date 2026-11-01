import fs from 'fs';
import path from 'path';

function getBaseDir(): string {
  if (typeof __dirname !== 'undefined' && __dirname) {
    return __dirname;
  }
  return process.cwd();
}

function readFileSafely(relativePath: string): string {
  const baseDir = getBaseDir();
  const possiblePaths = [
    path.resolve(baseDir, relativePath),
    path.resolve(baseDir, '..', relativePath),
    path.resolve(baseDir, '..', 'server', relativePath),
    path.resolve(baseDir, 'server', relativePath),
    path.resolve(process.cwd(), relativePath),
    path.resolve(process.cwd(), 'server', relativePath),
    path.resolve(process.cwd(), '..', relativePath),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, 'utf8');
      } catch (err) {
        console.error('Error reading ' + p + ':', err);
      }
    }
  }
  return '';
}

export interface AdkEndpointDefinition {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  category: 'auth' | 'agent' | 'connection' | 'cluster' | 'floor' | 'spec';
  description: string;
  authRequired: boolean;
  supportedAuthTypes?: string[];
  requestBody?: Record<string, any>;
  queryParams?: Record<string, string>;
  notes?: string;
  alias?: string;
}

/**
 * The 4 core agent-facing FLOOR MCP endpoints
 */
export const FLOOR_MCP_AGENT_ENDPOINTS: AdkEndpointDefinition[] = [
  {
    name: 'Discover Tools',
    method: 'GET',
    path: '/api/floor/agent/tools',
    category: 'floor',
    description: "List all available tools for assigned and unassigned agents. Shows each tool's access status (granted, hitl, pending, or unassigned) and MCP server connection and authentication details (authType, authHeaderName, serverUrl).",
    authRequired: true,
    supportedAuthTypes: ['none', 'bearer', 'api-key', 'custom-header'],
    notes: 'Dynamically respects the MCP server configured auth method. Does not execute tools through this endpoint.'
  },
  {
    name: 'Send Tool Request',
    method: 'POST',
    path: '/api/floor/tools/:toolId/invoke',
    category: 'floor',
    description: 'Submit a request to use a tool with arguments and justification. When direct execution is not permitted or human approval is required, creates or reuses an access/HITL request (returning status 202) without executing the tool.',
    authRequired: true,
    supportedAuthTypes: ['none', 'bearer', 'api-key', 'custom-header'],
    requestBody: {
      arguments: 'object (optional tool parameters matching JSON schema)',
      reason: 'string (optional justification for tool usage)',
      requestType: "'access' | 'invoke'"
    },
    notes: 'Returns 202 Accepted with requestId / invocationId when review or access grant is required.'
  },
  {
    name: 'Check Request Status',
    method: 'GET',
    path: '/api/floor/requests/:requestId',
    category: 'floor',
    description: 'Return current status of a tool request or pending invocation (pending, accepted, approved, rejected, denied, expired).',
    authRequired: true,
    supportedAuthTypes: ['none', 'bearer', 'api-key', 'custom-header'],
    queryParams: {
      requestId: 'Request identifier or invocation identifier to check'
    },
    notes: 'Allows autonomous agents to monitor request approval lifecycle.'
  },
  {
    name: 'Get Tool Access',
    method: 'POST',
    path: '/api/floor/invocations/:invocationId/execute',
    alias: '/api/floor/invocations/:invocationId/access',
    category: 'floor',
    description: 'For assigned agents and agents with granted access, return success: true with necessary tool details, server URL, authentication configuration, and verification information. For unassigned agents or agents without granted access, return success: false with a clear message. Does not execute the tool through this endpoint.',
    authRequired: true,
    supportedAuthTypes: ['none', 'bearer', 'api-key', 'custom-header'],
    requestBody: {
      reason: 'string (optional justification)'
    },
    notes: 'Single-use redemption: enforces anti-replay protection and invalidates access upon retrieval. Does not execute the tool.'
  }
];

export const ADK_CORE_ENDPOINTS: AdkEndpointDefinition[] = [
  { name: 'Agent Login', method: 'POST', path: '/api/auth/login', category: 'auth', description: 'Authenticate agent with Agent ID and API Key.', authRequired: false },
  { name: 'Refresh Tokens', method: 'POST', path: '/api/auth/refresh', category: 'auth', description: 'Refresh authentication session tokens.', authRequired: false },
  { name: 'Agent Profile', method: 'GET', path: '/api/agents/me', category: 'agent', description: 'Retrieve authenticated agent profile details.', authRequired: true },
  { name: 'Register E2EE Key', method: 'PUT', path: '/api/agents/me/e2ee', category: 'agent', description: 'Register or update ECDH P-256 public key.', authRequired: true },
  { name: 'Get E2EE Key', method: 'GET', path: '/api/agents/me/e2ee', category: 'agent', description: 'Retrieve registered E2EE public key and fingerprint.', authRequired: true },
  { name: 'Update Agent Profile', method: 'PATCH', path: '/api/agents/me', category: 'agent', description: 'Update authenticated agent profile.', authRequired: true },
  { name: 'List Fleet Agents', method: 'GET', path: '/api/agents', category: 'agent', description: 'List master and slave accounts belonging to fleet.', authRequired: true },
  { name: 'List Connections', method: 'GET', path: '/api/connections', category: 'connection', description: 'List authorized agent connections.', authRequired: true },
  { name: 'Peer Public Key', method: 'GET', path: '/api/connections/peer-key/:accountId', category: 'connection', description: 'Retrieve connection peer public key.', authRequired: true },
  { name: 'Direct Messages', method: 'GET', path: '/api/connections/messages/:accountId', category: 'connection', description: 'Retrieve direct encrypted messages with peer.', authRequired: true },
  { name: 'Send Direct Message', method: 'POST', path: '/api/connections/messages/:accountId', category: 'connection', description: 'Send encrypted direct message to peer.', authRequired: true },
  { name: 'List Clusters', method: 'GET', path: '/api/clusters', category: 'cluster', description: 'List authorized clusters.', authRequired: true },
  { name: 'Cluster Details', method: 'GET', path: '/api/clusters/:clusterId', category: 'cluster', description: 'Retrieve cluster metadata and members.', authRequired: true },
  { name: 'Send Cluster Message', method: 'POST', path: '/api/clusters/:clusterId/messages', category: 'cluster', description: 'Post encrypted message to cluster.', authRequired: true },
  { name: 'Cluster Messages', method: 'GET', path: '/api/clusters/:clusterId/messages', category: 'cluster', description: 'Retrieve historical cluster messages.', authRequired: true },
  { name: 'Key Distribution', method: 'GET', path: '/api/clusters/:clusterId/key-distribution', category: 'cluster', description: 'Retrieve encrypted group key package.', authRequired: true },
  { name: 'ADK Specification', method: 'GET', path: '/api/adk', category: 'spec', description: 'Retrieve current ADK specification.', authRequired: false },
  ...FLOOR_MCP_AGENT_ENDPOINTS
];

export function getAllAdkEndpoints(): AdkEndpointDefinition[] {
  return ADK_CORE_ENDPOINTS;
}

export function getPlatformSpecification(): string {
  return readFileSafely('ADK_SPEC.md/platform-spec.md');
}

export function getEndpointSpecification(): string {
  return readFileSafely('ADK_SPEC.md/endpoint-spec.md');
}

export function getFrameworkIntegrationSpec(): string {
  return readFileSafely('ADK_SPEC.md/framework-integration.md');
}

export function getAdkSpecification(): string {
  const platform = getPlatformSpecification();
  const endpoints = getEndpointSpecification();
  const frameworks = getFrameworkIntegrationSpec();
  return [platform, endpoints, frameworks].filter(Boolean).join('\n\n---\n\n');
}

export const ADK_SPECIFICATION = getAdkSpecification();
