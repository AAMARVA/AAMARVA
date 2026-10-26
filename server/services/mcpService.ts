import crypto from 'crypto';
import dns from 'dns';
import http from 'http';
import https from 'https';
import { Agent as UndiciAgent } from 'undici';
import axios from 'axios';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase.js';
import { logAgentFootprint } from './auditService.js';

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateFormats: true,
});
addFormats(ajv);

export interface McpServerRecord {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  transport: 'http-streamable' | 'http-sse';
  endpoint: string;
  auth_type: 'none' | 'bearer' | 'api-key' | 'custom-header';
  auth_header_name?: string;
  auth_credential_encrypted?: string;
  session_id_encrypted?: string;
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

export interface McpToolRecord {
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

export interface McpToolAssignmentRecord {
  id: string;
  tool_id: string;
  server_id: string;
  owner_id: string;
  agent_id: string;
  granted_by: string;
  created_at: string;
}

export interface McpToolPolicyRecord {
  id: string;
  tool_id: string;
  hitl_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PendingToolInvocationRecord {
  id: string;
  tool_id: string;
  caller_id: string;
  agent_id: string;
  owner_id: string;
  args: Record<string, any>;
  args_hash: string;
  status: 'pending' | 'approved' | 'executing' | 'executed' | 'failed' | 'denied' | 'expired';
  execution_result?: any;
  execution_error?: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface ToolExecutionGrantRecord {
  id: string;
  invocation_id: string;
  grant_token_hash: string;
  expires_at: string;
  consumed_at?: string | null;
  created_at: string;
}

export interface McpToolGrantRecord {
  id: string;
  server_id: string;
  tool_id: string;
  account_id: string;
  granted_by: string;
  status: 'active' | 'revoked';
  created_at: string;
  updated_at: string;
}

export interface McpToolRequestRecord {
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

// In-memory fallback stores when running isolated offline tests or without cloud DB configured
const inMemoryServers = new Map<string, McpServerRecord>();
const inMemoryTools = new Map<string, McpToolRecord>();
const inMemoryAssignments = new Map<string, McpToolAssignmentRecord>();
const inMemoryPolicies = new Map<string, McpToolPolicyRecord>();
const inMemoryInvocations = new Map<string, PendingToolInvocationRecord>();
const inMemoryGrants = new Map<string, ToolExecutionGrantRecord>();
const inMemoryPersistentGrants = new Map<string, McpToolGrantRecord>();
const inMemoryToolRequests = new Map<string, McpToolRequestRecord>();

export function clearHitlStoreForTesting(): void {
  inMemoryPolicies.clear();
  inMemoryInvocations.clear();
  inMemoryGrants.clear();
}

export function clearAccessGovernanceForTesting(): void {
  inMemoryPersistentGrants.clear();
  inMemoryToolRequests.clear();
}

let dbHasSessionIdColumn: boolean | null = null;

export function resetDbHasSessionIdColumnForTesting(val: boolean | null = null): void {
  dbHasSessionIdColumn = val;
}

export async function checkSessionIdColumnSupport(): Promise<boolean> {
  if (dbHasSessionIdColumn !== null) return dbHasSessionIdColumn;
  if (!isSupabaseConfigured()) {
    dbHasSessionIdColumn = true;
    return true;
  }
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('mcp_servers').select('session_id_encrypted').limit(1);
    if (error && (error.message?.includes('session_id_encrypted') || (error as any).code === 'PGRST204')) {
      try {
        const { error: rpcErr } = await supabase.rpc('exec_sql', {
          sql_query: "ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS session_id_encrypted TEXT; NOTIFY pgrst, 'reload schema';"
        });
        if (!rpcErr) {
          const { error: recheckErr } = await supabase.from('mcp_servers').select('session_id_encrypted').limit(1);
          if (!recheckErr) {
            dbHasSessionIdColumn = true;
            return true;
          }
        }
      } catch {}

      dbHasSessionIdColumn = false;
      return false;
    }
    dbHasSessionIdColumn = true;
    return true;
  } catch {
    dbHasSessionIdColumn = false;
    return false;
  }
}

/**
 * Deterministic JSON stringify ensuring canonical key ordering for hash consistency
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJsonStringify(obj[k])).join(',') + '}';
}

/**
 * SHA-256 hash of canonicalized arguments
 */
export function hashToolArguments(args: any): string {
  const canonical = canonicalJsonStringify(args ?? {});
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// Private in-memory backend session store for MCP stateful sessions (NEVER exposed in API responses)
const serverSessionStore = new Map<string, string>();

export function clearServerSessionStoreForTesting(): void {
  serverSessionStore.clear();
}

export function getServerSessionStoreSizeForTesting(): number {
  return serverSessionStore.size;
}

export function hasServerSessionForTesting(serverId: string): boolean {
  return serverSessionStore.has(serverId);
}

/**
 * Helper to determine if we are strictly in an automated test environment.
 * In production, mock endpoints are CATEGORICALLY prohibited.
 */
export function isStrictTestEnvironment(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return process.env.NODE_ENV === 'test';
}

// Legacy alias for backwards compatibility
export function isTestEnvironment(): boolean {
  return isStrictTestEnvironment();
}

// Fail-closed helper: fail loudly on database write failures in production / configured DB
function shouldFailOnDbError(): boolean {
  return isSupabaseConfigured() && process.env.NODE_ENV !== 'test';
}

// ============================================================================
// 1. AUTHENTICATED CREDENTIAL ENCRYPTION AT REST (AES-256-GCM) & KEY ROTATION
// ============================================================================

const CIPHER_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for AES-GCM

/**
 * Derives a 256-bit AES key from a passphrase with domain separation salt
 */
function deriveMcpKeyFromSecret(secret: string): Buffer {
  return crypto.createHash('sha256').update(`aamarva-mcp-v1-salt:${secret}`).digest();
}

/**
 * Retrieves primary encryption key.
 * Fails closed if missing in non-test environment to prevent predictable hardcoded fallbacks.
 */
function getPrimaryMcpEncryptionKey(): Buffer {
  const envKey = process.env.SECRETS_ENCRYPTION_KEY?.trim();

  if (envKey && envKey.length >= 16) {
    return deriveMcpKeyFromSecret(envKey);
  }

  if (isStrictTestEnvironment()) {
    // In automated testing harnesses, allow a dedicated test-only key if not provided via env
    return deriveMcpKeyFromSecret('aamarva_test_isolated_encryption_key_32_bytes_len');
  }

  throw new Error(
    '[CRITICAL SECURITY CONFIGURATION] Dedicated SECRETS_ENCRYPTION_KEY environment variable is required ' +
    'and must be configured with at least 16 characters for MCP credential encryption at rest. ' +
    'Application refuses to start or encrypt/decrypt with an insecure fallback key.'
  );
}

/**
 * Returns all candidate decryption keys to support zero-downtime key rotation.
 * The primary key is tried first, followed by rotation keys specified in SECRETS_ENCRYPTION_PREVIOUS_KEYS.
 */
function getAllMcpDecryptionKeys(): Buffer[] {
  const keys: Buffer[] = [getPrimaryMcpEncryptionKey()];

  const rotationKeysEnv =
    process.env.SECRETS_ENCRYPTION_PREVIOUS_KEYS ||
    process.env.SECRETS_ENCRYPTION_KEY_ROTATION;

  if (rotationKeysEnv) {
    const previousKeys = rotationKeysEnv
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length >= 8);

    for (const prev of previousKeys) {
      try {
        keys.push(deriveMcpKeyFromSecret(prev));
      } catch {}
    }
  }

  return keys;
}

/**
 * Encrypts sensitive MCP credentials using AES-256-GCM authenticated encryption
 */
export function encryptMcpCredential(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') return '';
  const key = getPrimaryMcpEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(CIPHER_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts sensitive MCP credentials only in memory at connection time.
 * Supports key rotation by attempting configured primary and fallback rotation keys.
 */
export function decryptMcpCredential(encrypted: string): string {
  if (!encrypted || typeof encrypted !== 'string') return '';
  if (!encrypted.startsWith('enc:v1:')) {
    // If plaintext legacy or non-encrypted string is encountered, reject decryption to prevent leaks
    return '';
  }
  const parts = encrypted.split(':');
  if (parts.length !== 5) {
    throw new Error('Malformed encrypted credential format.');
  }
  const iv = Buffer.from(parts[2], 'hex');
  const authTag = Buffer.from(parts[3], 'hex');
  const ciphertext = Buffer.from(parts[4], 'hex');

  const candidateKeys = getAllMcpDecryptionKeys();
  let lastError: Error | null = null;

  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv(CIPHER_ALGO, key, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString('utf8');
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new Error(`Failed to decrypt MCP credential: ${lastError?.message || 'Authentication tag verification failed.'}`);
}

// ============================================================================
// 2. HARDENED SSRF & CONNECTION-LAYER DNS REBINDING DEFENSE
// ============================================================================

/**
 * Validates whether an IP address belongs to restricted/private/loopback/cloud-metadata spaces
 */
export function isIpRestricted(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return true;

  let cleanIp = ip.trim().toLowerCase();
  // Strip IPv4-mapped IPv6 prefix (e.g. ::ffff:127.0.0.1)
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.slice(7);
  }

  // IPv4 Evaluation
  const ipv4Match = cleanIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const o1 = parseInt(ipv4Match[1], 10);
    const o2 = parseInt(ipv4Match[2], 10);
    const o3 = parseInt(ipv4Match[3], 10);
    const o4 = parseInt(ipv4Match[4], 10);

    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return true;

    // 0.0.0.0/8 (Current network)
    if (o1 === 0) return true;
    // 10.0.0.0/8 (RFC 1918 Private)
    if (o1 === 10) return true;
    // 100.64.0.0/10 (Shared address space / CGNAT)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (o1 === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata, including 169.254.169.254)
    if (o1 === 169 && o2 === 254) return true;
    // 172.16.0.0/12 (RFC 1918 Private)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    // 192.0.0.0/24 (IETF protocol assignments)
    if (o1 === 192 && o2 === 0 && o3 === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (o1 === 192 && o2 === 0 && o3 === 2) return true;
    // 192.88.99.0/24 (6to4 anycast relay)
    if (o1 === 192 && o2 === 88 && o3 === 99) return true;
    // 192.168.0.0/16 (RFC 1918 Private)
    if (o1 === 192 && o2 === 168) return true;
    // 198.18.0.0/15 (Network benchmark testing)
    if (o1 === 198 && (o2 === 18 || o2 === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (o1 === 198 && o2 === 51 && o3 === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (o1 === 203 && o2 === 0 && o3 === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (o1 >= 224 && o1 <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (o1 >= 240) return true;
    // 255.255.255.255 (Broadcast)
    if (o1 === 255 && o2 === 255 && o3 === 255 && o4 === 255) return true;

    return false;
  }

  // IPv6 Evaluation
  if (cleanIp === '::' || cleanIp === '::1') return true;
  if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true; // Unique local address (fc00::/7)
  if (cleanIp.startsWith('fe8') || cleanIp.startsWith('fe9') || cleanIp.startsWith('fea') || cleanIp.startsWith('feb')) return true; // Link-local (fe80::/10)
  if (cleanIp.startsWith('ff')) return true; // Multicast (ff00::/8)
  if (cleanIp.startsWith('2001:db8:')) return true; // Documentation
  if (cleanIp.startsWith('100::')) return true; // Discard-only

  return false;
}

/**
 * Checks whether a hostname belongs to internal or cloud-metadata domain names
 */
export function isHostnameRestricted(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') return true;
  const h = hostname.trim().toLowerCase();
  if (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.localdomain') ||
    h === 'metadata.google.internal' ||
    h === 'instance-data'
  ) {
    return true;
  }
  return false;
}

let allowedTestServerOrigin: string | null = null;

export function setAllowedTestServerOriginForTesting(origin: string | null): void {
  if (process.env.NODE_ENV !== 'production') {
    allowedTestServerOrigin = origin;
  }
}

export const safeLookup = (
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void
) => {
  if (
    isStrictTestEnvironment() &&
    process.env.NODE_ENV !== 'production' &&
    allowedTestServerOrigin
  ) {
    try {
      const allowed = new URL(allowedTestServerOrigin);
      if (hostname.toLowerCase() === allowed.hostname.toLowerCase()) {
        return dns.lookup(hostname, options, callback);
      }
    } catch {}
  }

  if (isHostnameRestricted(hostname)) {
    const err: any = new Error(`SSRF blocked: Domain '${hostname}' is restricted.`);
    err.code = 'ENOTFOUND';
    return callback(err, '', 4);
  }

  if (isIpRestricted(hostname)) {
    const err: any = new Error(`SSRF blocked: Address '${hostname}' is in a restricted subnet.`);
    err.code = 'ENOTFOUND';
    return callback(err, '', 4);
  }

  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4);
    if (!addresses || addresses.length === 0) {
      const notFoundErr: any = new Error(`DNS resolution failed for '${hostname}'`);
      notFoundErr.code = 'ENOTFOUND';
      return callback(notFoundErr, '', 4);
    }

    for (const rec of addresses) {
      if (isIpRestricted(rec.address)) {
        const ssrfErr: any = new Error(
          `SSRF blocked at connection layer: Hostname '${hostname}' resolved to restricted IP '${rec.address}'.`
        );
        ssrfErr.code = 'ECONNREFUSED';
        return callback(ssrfErr, '', 4);
      }
    }

    const first = addresses[0];
    if (options && options.all) {
      return callback(null, addresses, first.family);
    }
    return callback(null, first.address, first.family);
  });
};

/**
 * Creates an SSRF-safe HTTP/HTTPS Agent that enforces destination IP restrictions
 * at the actual connection socket layer. This eliminates DNS rebinding attacks.
 */
export function createSsrfSafeAgent(isHttps: boolean) {
  const agentOptions = {
    lookup: safeLookup,
    keepAlive: false,
    timeout: 15000
  };

  return isHttps ? new https.Agent(agentOptions) : new http.Agent(agentOptions);
}

/**
 * SSRF-safe fetch implementation for official MCP SDK transports.
 * Enforces destination IP restrictions and connection-layer SSRF defense via createSsrfSafeAgent().
 */
export async function ssrfSafeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  const ssrf = await validateEndpointUrl(urlStr);
  if (!ssrf.valid) {
    throw new Error(`SSRF blocked at transport fetch: ${ssrf.error}`);
  }

  // Create an Undici dispatcher that enforces our IP restrictions via a custom lookup
  const dispatcher = new UndiciAgent({
    connect: {
      lookup: safeLookup
    }
  });

  return fetch(urlStr, {
    ...init,
    // @ts-ignore - undici dispatcher fits the fetch signature
    dispatcher
  });
}

/**
 * Validates endpoint URL against SSRF, resolving DNS hostnames and enforcing IP restrictions.
 * Enforces HTTPS in production and rejects plaintext HTTP when credentials are transmitted.
 * Mock endpoints are strictly rejected in production.
 */
export async function validateEndpointUrl(
  endpointUrl: string,
  authType: string = 'none',
  hasCredential: boolean = false
): Promise<{ valid: boolean; error?: string }> {
  if (!endpointUrl || typeof endpointUrl !== 'string') {
    return { valid: false, error: 'Endpoint URL is required' };
  }

  const trimmed = endpointUrl.trim();

  // Mock endpoints are strictly restricted to isolated automated test suites
  if (trimmed.startsWith('mock://') || trimmed.includes('mock-mcp.internal')) {
    if (!isStrictTestEnvironment() || process.env.NODE_ENV === 'production') {
      return {
        valid: false,
        error: 'Restricted target: Mock endpoints are strictly prohibited outside automated test environments.'
      };
    }
    return { valid: true };
  }

  // Allow explicitly registered local test server only during automated testing
  if (
    isStrictTestEnvironment() &&
    process.env.NODE_ENV !== 'production' &&
    allowedTestServerOrigin &&
    trimmed.startsWith(allowedTestServerOrigin)
  ) {
    return { valid: true };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Malformed endpoint URL. Must include protocol (e.g. https://...)' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Unsupported protocol. Only http: and https: are allowed.' };
  }

  // 1. Require HTTPS for remote MCP endpoints in production unless an explicitly approved secure transport design exists
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Insecure protocol: HTTPS is strictly required for remote MCP endpoints in production.'
    };
  }

  // 2. Prohibit sending credentials or bearer/API keys over plaintext HTTP in any environment
  if (parsed.protocol === 'http:' && (authType !== 'none' || hasCredential)) {
    return {
      valid: false,
      error: 'Insecure transport: Plaintext HTTP is prohibited when sending credentials, bearer tokens, or API keys. HTTPS is required.'
    };
  }

  // Prohibit embedded credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Embedded credentials in endpoint URL are prohibited.' };
  }

  // Check port restrictions (block internal service ports)
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    const blockedPorts = [21, 22, 23, 25, 53, 110, 143, 445, 1433, 3306, 5432, 6379, 11211, 27017, 28017];
    if (blockedPorts.includes(portNum)) {
      return { valid: false, error: `Restricted target: Port ${portNum} is blocked for security.` };
    }
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block loopback and known cloud internal hostnames
  if (isHostnameRestricted(hostname)) {
    return { valid: false, error: 'Restricted target: Local and internal domain names are blocked.' };
  }

  // If hostname is directly an IP literal
  if (isIpRestricted(hostname)) {
    return { valid: false, error: 'Restricted target: Private, loopback, or cloud metadata IP addresses are blocked.' };
  }

  // Pre-validate DNS resolution to give helpful user-facing errors
  try {
    const lookup = await dns.promises.lookup(hostname, { all: true });
    if (!lookup || lookup.length === 0) {
      return { valid: false, error: `Unable to resolve server domain '${hostname}'.` };
    }
    for (const record of lookup) {
      if (isIpRestricted(record.address)) {
        return {
          valid: false,
          error: `Restricted target: Resolved IP address '${record.address}' belongs to a private, loopback, or metadata subnet.`
        };
      }
    }
  } catch (err: any) {
    return { valid: false, error: `DNS resolution failed for '${hostname}': ${err.message}` };
  }

  return { valid: true };
}

// ============================================================================
// 3. FLEET OWNERSHIP VERIFICATION
// ============================================================================

/**
 * Enforces Master/Slave boundary: verifies target agent is an authentic member of operator's fleet
 */
export async function verifyAgentInOperatorFleet(operatorUserId: string, targetAgentId: string): Promise<boolean> {
  if (!operatorUserId || !targetAgentId) return false;
  // An operator can always assign tools to their primary account
  if (targetAgentId === operatorUserId) return true;

  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, agentId, master_id')
      .or(`id.eq.${targetAgentId},agentId.eq.${targetAgentId}`)
      .maybeSingle();

    if (!error && data) {
      return data.id === operatorUserId || data.master_id === operatorUserId;
    }
  } catch {}

  // In test / offline mode, check naming convention or local fleet registry
  if (isStrictTestEnvironment()) {
    if (targetAgentId.includes('slave') || targetAgentId === operatorUserId) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// 4. JSON SCHEMA TOOL ARGUMENT VALIDATION (AJV & JSON SCHEMA DIALECT)
// ============================================================================

/**
 * Validates tool invocation arguments against the discovered JSON schema using Ajv.
 * Strictly verifies types, constraints, required parameters, and rejects malformed schemas and invalid arguments.
 */
export function validateToolArguments(
  schema: Record<string, any>,
  args: Record<string, any>
): { valid: boolean; error?: string } {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { valid: false, error: 'Malformed tool schema: schema must be an object' };
  }

  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return { valid: false, error: 'Tool arguments must be a JSON object' };
  }

  try {
    const validate = ajv.compile(schema);
    const valid = validate(args);
    if (!valid) {
      const errorText = ajv.errorsText(validate.errors, { separator: '; ' });
      return { valid: false, error: errorText || 'Arguments failed schema validation' };
    }
    return { valid: true };
  } catch (schemaErr: any) {
    return { valid: false, error: `Malformed tool schema: ${schemaErr?.message || 'Invalid JSON Schema'}` };
  }
}

// ============================================================================
// 5. MCP CLIENT & PROTOCOL COMMUNICATION (Streamable HTTP & SSE)
// ============================================================================

/**
 * Sanitizes server info object to ensure sensitive session tokens, credentials, or internal IDs
 * are never leaked to client responses.
 */
export function sanitizeServerInfo(serverInfo: Record<string, any> | undefined): Record<string, any> {
  if (!serverInfo || typeof serverInfo !== 'object') return {};
  const copy: Record<string, any> = { ...serverInfo };
  delete copy.sessionId;
  delete copy.session_id;
  delete copy.token;
  delete copy.secret;
  delete copy.credential;
  delete copy.credentials;
  delete copy.mcpSessionId;
  delete copy.mcp_session_id;
  delete copy.session_id_encrypted;
  delete copy._session_id_encrypted;
  delete copy.auth_credential_encrypted;
  delete copy._auth_credential_encrypted;
  return copy;
}

/**
 * RFC 7230 / RFC 9110 HTTP Header validation.
 * Rejects header injection, CRLF characters, whitespace, and protected protocol headers.
 */
export function validateAuthHeader(
  authType: 'none' | 'bearer' | 'api-key' | 'custom-header',
  headerName?: string,
  credential?: string
): { valid: boolean; error?: string; normalizedHeaderName?: string } {
  if (authType === 'none') {
    return { valid: true };
  }

  // Credential must be non-empty and free of CRLF characters (header injection defense)
  if (!credential || typeof credential !== 'string' || !credential.trim()) {
    return { valid: false, error: 'Authentication credential / secret is required.' };
  }

  if (/[\r\n]/.test(credential)) {
    return { valid: false, error: 'Authentication credential contains illegal newline or carriage return characters.' };
  }

  if (authType === 'bearer') {
    return { valid: true };
  }

  // Header name validation for api-key and custom-header
  const rawHeader = (headerName || (authType === 'api-key' ? 'X-API-Key' : '')).trim();
  if (!rawHeader) {
    return { valid: false, error: 'Header name is required for API Key and Custom Header authentication.' };
  }

  if (/[\r\n\s]/.test(rawHeader)) {
    return { valid: false, error: 'Header name contains illegal whitespace or newline characters.' };
  }

  // RFC 7230 token characters: 1*tchar
  if (!/^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/.test(rawHeader)) {
    return { valid: false, error: `Invalid header name '${rawHeader}'. Header names must contain only valid HTTP token characters.` };
  }

  // Protected / forbidden transport and protocol headers
  const forbiddenHeaders = new Set([
    'host',
    'content-length',
    'transfer-encoding',
    'connection',
    'upgrade',
    'te',
    'trailer',
    'mcp-session-id',
    'mcp-protocol-version',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization'
  ]);

  if (forbiddenHeaders.has(rawHeader.toLowerCase())) {
    return { valid: false, error: `Header '${rawHeader}' is a protected protocol header and cannot be overridden.` };
  }

  return { valid: true, normalizedHeaderName: rawHeader };
}

export function buildAuthHeaders(
  authType: 'none' | 'bearer' | 'api-key' | 'custom-header',
  credential?: string,
  headerName?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };

  if (!credential || authType === 'none') {
    return headers;
  }

  if (authType === 'bearer') {
    headers['Authorization'] = `Bearer ${credential}`;
  } else if (authType === 'api-key') {
    const keyHeader = headerName?.trim() || 'X-API-Key';
    headers[keyHeader] = credential;
  } else if (authType === 'custom-header') {
    const targetHeader = headerName?.trim() || 'X-API-Key';
    headers[targetHeader] = credential;
  }

  return headers;
}

/**
 * Parses raw stream response that may be JSON or Server-Sent Events (SSE).
 */
export function parseMcpResponseBody(rawBody: any, contentType?: string): any {
  if (!rawBody) return null;
  if (typeof rawBody === 'object') return rawBody;

  const text = String(rawBody).trim();

  // If text/event-stream or SSE-formatted lines
  if ((contentType && contentType.includes('text/event-stream')) || text.startsWith('event:') || text.startsWith('data:')) {
    const lines = text.split('\n');
    let dataBuffer = '';
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('data:')) {
        dataBuffer += trimmedLine.slice(5).trim();
      }
    }
    if (dataBuffer) {
      try {
        return JSON.parse(dataBuffer);
      } catch {}
    }
  }

  // Attempt standard JSON parse
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Dispatches an outbound JSON-RPC request to an MCP server using connection-layer SSRF defense
 * and robust streamable HTTP / SSE handling.
 */
async function sendMcpRpcRequest(
  endpoint: string,
  payload: Record<string, any>,
  headers: Record<string, string>,
  timeoutMs = 12000
): Promise<{ status: number; data: any; sessionId?: string; error?: string }> {
  const isHttps = endpoint.startsWith('https:');
  const agent = createSsrfSafeAgent(isHttps);

  const res = await axios.post(endpoint, payload, {
    headers,
    timeout: timeoutMs,
    maxContentLength: 4 * 1024 * 1024,
    maxBodyLength: 4 * 1024 * 1024,
    maxRedirects: 0, // Strict: no redirects allowed to prevent redirect-based SSRF bypass
    httpAgent: isHttps ? undefined : agent,
    httpsAgent: isHttps ? agent : undefined,
    responseType: 'text',
    transformResponse: [(data) => data],
    validateStatus: (status) => status < 500
  });

  const contentType = String(res.headers['content-type'] || '').toLowerCase();
  const parsedData = parseMcpResponseBody(res.data, contentType);

  const rawSessionId = res.headers['mcp-session-id'] || res.headers['x-mcp-session-id'];
  const sessionId = rawSessionId ? String(rawSessionId) : undefined;

  return {
    status: res.status,
    data: parsedData,
    sessionId
  };
}

/**
 * Performs live MCP Protocol handshake and tool discovery using @modelcontextprotocol/sdk where compatible
 */
export async function testMcpConnectionAndDiscover(
  endpoint: string,
  authType: 'none' | 'bearer' | 'api-key' | 'custom-header' = 'none',
  credential?: string,
  headerName?: string,
  transport: 'http-streamable' | 'http-sse' = 'http-streamable'
): Promise<{
  success: boolean;
  status: 'connected' | 'error';
  serverInfo: Record<string, any>;
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, any> }>;
  sessionId?: string;
  error?: string;
}> {
  // Validate supported transports strictly
  if (transport !== 'http-streamable' && transport !== 'http-sse') {
    return {
      success: false,
      status: 'error',
      serverInfo: {},
      tools: [],
      error: `Unsupported transport '${transport}'. Only 'http-streamable' and 'http-sse' are supported.`
    };
  }

  // Validate SSRF boundary and plaintext credential protections
  const ssrfCheck = await validateEndpointUrl(endpoint, authType, Boolean(credential));
  if (!ssrfCheck.valid) {
    return {
      success: false,
      status: 'error',
      serverInfo: {},
      tools: [],
      error: ssrfCheck.error
    };
  }

  // Handle mock endpoints strictly for automated test suites
  if (endpoint.startsWith('mock://') || endpoint.includes('mock-mcp.internal')) {
    if (!isStrictTestEnvironment() || process.env.NODE_ENV === 'production') {
      return {
        success: false,
        status: 'error',
        serverInfo: {},
        tools: [],
        error: 'Restricted target: Mock endpoints are restricted to automated testing environments.'
      };
    }
    if (endpoint.includes('fail') || endpoint.includes('unreachable')) {
      return {
        success: false,
        status: 'error',
        serverInfo: {},
        tools: [],
        error: 'Connection refused: Remote MCP server is unreachable.'
      };
    }
    return {
      success: true,
      status: 'connected',
      serverInfo: { name: 'mock-mcp-server', version: '1.2.0', protocolVersion: '2024-11-05' },
      tools: [
        {
          name: 'query_vector_index',
          description: 'Search embedded vector index for matching semantic concepts',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Semantic search query' },
              limit: { type: 'number', description: 'Maximum items to retrieve' }
            },
            required: ['query'],
            additionalProperties: false
          }
        },
        {
          name: 'execute_sql_query',
          description: 'Executes read-only SQL query against sanitized analytics store',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Read-only SQL query' }
            },
            required: ['query'],
            additionalProperties: false
          }
        }
      ],
      sessionId: 'sess_mock_test_123'
    };
  }

  // Decrypt credential if passed as encrypted string
  let rawCredential = credential;
  if (credential && credential.startsWith('enc:v1:')) {
    try {
      rawCredential = decryptMcpCredential(credential);
    } catch {
      return {
        success: false,
        status: 'error',
        serverInfo: {},
        tools: [],
        error: 'Failed to decrypt stored credential.'
      };
    }
  }

  const headers = buildAuthHeaders(authType, rawCredential, headerName);

  try {
    // Attempt live protocol handshake and discovery using official @modelcontextprotocol/sdk
    let client: Client | null = null;
    try {
      const url = new URL(endpoint);
      const sdkTransport = transport === 'http-sse'
        ? new SSEClientTransport(url, {
            requestInit: { headers },
            fetch: ssrfSafeFetch,
          })
        : new StreamableHTTPClientTransport(url, {
            requestInit: { headers },
            fetch: ssrfSafeFetch,
          });

      client = new Client(
        { name: 'aamarva-floor', version: '1.0.0' },
        { capabilities: { roots: { listChanged: true } } }
      );

      await client.connect(sdkTransport);
      const sdkToolsRes = await client.listTools();
      const serverVersion = client.getServerVersion() || { name: 'mcp-server', version: '1.0.0' };
      const cleanServerInfo = sanitizeServerInfo(serverVersion);
      const activeSessionId = (sdkTransport as any).sessionId || undefined;

      const sanitizedTools = Array.isArray(sdkToolsRes?.tools)
        ? sdkToolsRes.tools.map((t: any) => ({
            name: String(t.name || 'unnamed_tool'),
            description: String(t.description || ''),
            inputSchema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object' }
          }))
        : [];

      return {
        success: true,
        status: 'connected',
        serverInfo: cleanServerInfo,
        tools: sanitizedTools,
        sessionId: activeSessionId
      };
    } finally {
      if (client) {
        await client.close().catch(() => {});
      }
    }
  } catch (sdkErr: any) {
    try {
      // Fall back to robust Streamable HTTP / SSE JSON-RPC protocol dispatches
      const initPayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true }
          },
          clientInfo: {
            name: 'aamarva-floor',
            version: '1.0.0'
          }
        }
      };

      const initRes = await sendMcpRpcRequest(endpoint, initPayload, headers, 8000);

      if (initRes.status >= 400) {
        const errorMsg = initRes.status === 401
          ? `Authentication failed (HTTP 401): ${typeof initRes.data === 'object' && initRes.data?.error ? (initRes.data.error.message || JSON.stringify(initRes.data.error)) : 'Invalid or rejected credentials.'}`
          : initRes.status === 403
          ? `Authentication forbidden (HTTP 403): ${typeof initRes.data === 'object' && initRes.data?.error ? (initRes.data.error.message || JSON.stringify(initRes.data.error)) : 'Access denied by remote MCP server.'}`
          : `MCP handshake failed with HTTP ${initRes.status}: ${JSON.stringify(initRes.data?.error || initRes.data)}`;

        return {
          success: false,
          status: 'error',
          serverInfo: {},
          tools: [],
          error: errorMsg
        };
      }

      const rawServerInfo = initRes.data?.result?.serverInfo || { protocolVersion: '2024-11-05' };
      const cleanServerInfo = sanitizeServerInfo(rawServerInfo);

      let activeSessionId = initRes.sessionId;
      if (activeSessionId) {
        headers['Mcp-Session-Id'] = activeSessionId;
      }

      // 2. Initialized Notification
      try {
        await sendMcpRpcRequest(
          endpoint,
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          headers,
          4000
        );
      } catch {}

      // 3. Discover Tools (JSON-RPC 2.0 tools/list)
      const listPayload = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      const listRes = await sendMcpRpcRequest(endpoint, listPayload, headers, 8000);

      if (listRes.status >= 400 || listRes.data?.error) {
        const errorMsg = listRes.status === 401
          ? 'Authentication failed (HTTP 401) during tool discovery.'
          : listRes.status === 403
          ? 'Authentication forbidden (HTTP 403) during tool discovery.'
          : `Tool discovery failed: ${listRes.data?.error?.message || `HTTP ${listRes.status}`}`;

        return {
          success: false,
          status: 'error',
          serverInfo: cleanServerInfo,
          tools: [],
          error: errorMsg
        };
      }

      const rawTools = listRes.data?.result?.tools || [];
      const sanitizedTools = Array.isArray(rawTools)
        ? rawTools.map((t: any) => ({
            name: String(t.name || 'unnamed_tool'),
            description: String(t.description || ''),
            inputSchema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object' }
          }))
        : [];

      return {
        success: true,
        status: 'connected',
        serverInfo: cleanServerInfo,
        tools: sanitizedTools,
        sessionId: activeSessionId
      };
    } catch (fallbackErr: any) {
      const status = fallbackErr.response?.status;
      const data = fallbackErr.response?.data;
      let message = '';
      if (status === 401) {
        message = `Authentication failed (HTTP 401): ${typeof data === 'object' && data?.error ? (data.error.message || JSON.stringify(data.error)) : 'Remote MCP server rejected credentials.'}`;
      } else if (status === 403) {
        message = `Authentication forbidden (HTTP 403): ${typeof data === 'object' && data?.error ? (data.error.message || JSON.stringify(data.error)) : 'Access denied by remote MCP server.'}`;
      } else {
        message = fallbackErr.response?.data?.error?.message || fallbackErr.message || sdkErr.message || 'Unknown network error';
      }
      return {
        success: false,
        status: 'error',
        serverInfo: {},
        tools: [],
        error: message.startsWith('Authentication') ? message : `Connection error: ${message}`
      };
    }
  }
}

/**
 * Dispatches an authorized tool call to the connected remote MCP server.
 * Restores and persists session IDs across serverless cold starts.
 */
export async function executeRemoteMcpTool(
  server: McpServerRecord,
  tool: McpToolRecord,
  toolArgs: Record<string, any>
): Promise<{ success: boolean; result?: any; error?: string }> {
  // 1. JSON Schema validation
  const validation = validateToolArguments(tool.input_schema, toolArgs);
  if (!validation.valid) {
    return {
      success: false,
      error: `Schema validation error: ${validation.error}`
    };
  }

  // 2. Resolve session ID across serverless cold starts (memory -> encrypted server record -> database)
  let storedSessionId = serverSessionStore.get(server.id);
  if (!storedSessionId && server.session_id_encrypted) {
    try {
      storedSessionId = decryptMcpCredential(server.session_id_encrypted);
      if (storedSessionId) {
        serverSessionStore.set(server.id, storedSessionId);
      }
    } catch {}
  }
  if (!storedSessionId && (server.server_info as any)?._session_id_encrypted) {
    try {
      storedSessionId = decryptMcpCredential((server.server_info as any)._session_id_encrypted);
      if (storedSessionId) {
        serverSessionStore.set(server.id, storedSessionId);
      }
    } catch {}
  }
  if (!storedSessionId && isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('mcp_servers').select('*').eq('id', server.id).maybeSingle();
      if (!error && data) {
        const enc = (data as any).session_id_encrypted || (data as any).server_info?._session_id_encrypted;
        if (enc) {
          storedSessionId = decryptMcpCredential(enc);
          if (storedSessionId) {
            serverSessionStore.set(server.id, storedSessionId);
          }
        }
      }
    } catch {}
  }

  // 3. Handle mock endpoints strictly in test environment
  if (server.endpoint.startsWith('mock://') || server.endpoint.includes('mock-mcp.internal')) {
    if (!isStrictTestEnvironment() || process.env.NODE_ENV === 'production') {
      return { success: false, error: 'Mock endpoints are strictly prohibited in production.' };
    }
    if (server.endpoint.includes('session-required') && !storedSessionId) {
      return { success: false, error: 'Session required: No valid session established for session-dependent MCP server.' };
    }
    return {
      success: true,
      result: {
        content: [
          {
            type: 'text',
            text: `[Mock Execution Output] Executed tool '${tool.name}' successfully with arguments: ${JSON.stringify(toolArgs)}${storedSessionId ? ' [Session: Active]' : ''}`
          }
        ]
      }
    };
  }

  // 4. Re-verify SSRF destination and HTTPS protocol
  const ssrf = await validateEndpointUrl(server.endpoint, server.auth_type, Boolean(server.auth_credential_encrypted));
  if (!ssrf.valid) {
    return { success: false, error: `Outbound security check rejected destination: ${ssrf.error}` };
  }

  // 5. Decrypt credential on demand
  let rawCredential: string | undefined = undefined;
  if (server.auth_credential_encrypted) {
    try {
      rawCredential = decryptMcpCredential(server.auth_credential_encrypted);
    } catch {
      return { success: false, error: 'Failed to decrypt stored credentials for tool invocation.' };
    }
  }

  const headers = buildAuthHeaders(server.auth_type, rawCredential, server.auth_header_name);
  if (storedSessionId) {
    headers['Mcp-Session-Id'] = storedSessionId;
  }

  // 6. Attempt execution using official @modelcontextprotocol/sdk where compatible
  let client: Client | null = null;
  try {
    const url = new URL(server.endpoint);
    const sdkTransport = server.transport === 'http-sse'
      ? new SSEClientTransport(url, {
          requestInit: { headers },
          fetch: ssrfSafeFetch,
        })
      : new StreamableHTTPClientTransport(url, {
          requestInit: { headers },
          sessionId: storedSessionId,
          fetch: ssrfSafeFetch,
        });

    client = new Client(
      { name: 'aamarva-floor', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(sdkTransport);
    const toolRes = await client.callTool({
      name: tool.name,
      arguments: toolArgs || {},
    });

    const newSessionId = (sdkTransport as any).sessionId;
    if (newSessionId && newSessionId !== storedSessionId) {
      serverSessionStore.set(server.id, newSessionId);
      try {
        const enc = encryptMcpCredential(newSessionId);
        const supabase = getSupabaseClient();
        const hasCol = await checkSessionIdColumnSupport();
        if (hasCol) {
          const { error } = await supabase.from('mcp_servers').update({ session_id_encrypted: enc }).eq('id', server.id);
          if (error && (error.message?.includes('session_id_encrypted') || (error as any).code === 'PGRST204')) {
            dbHasSessionIdColumn = false;
            await supabase.from('mcp_servers').update({
              server_info: { ...(server.server_info || {}), _session_id_encrypted: enc }
            }).eq('id', server.id);
          }
        } else {
          await supabase.from('mcp_servers').update({
            server_info: { ...(server.server_info || {}), _session_id_encrypted: enc }
          }).eq('id', server.id);
        }
      } catch (err) {
        if (shouldFailOnDbError()) throw err;
      }
    }

    return {
      success: true,
      result: toolRes
    };
  } catch (sdkErr: any) {
    const errMsg = sdkErr?.message || '';
    if (errMsg.includes('401') || errMsg.includes('Unauthorized')) {
      return {
        success: false,
        error: `Authentication failed (HTTP 401): Remote MCP server rejected credentials for tool '${tool.name}'.`
      };
    }
    if (errMsg.includes('403') || errMsg.includes('Forbidden')) {
      return {
        success: false,
        error: `Authentication forbidden (HTTP 403): Remote MCP server denied access to tool '${tool.name}'.`
      };
    }

    // Fall back to direct Streamable HTTP JSON-RPC tools/call if SDK connect/transport failed
    try {
      const callPayload = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: {
          name: tool.name,
          arguments: toolArgs || {}
        }
      };
      const rpcRes = await sendMcpRpcRequest(server.endpoint, callPayload, headers, 15000);
      if (rpcRes.status === 401) {
        return { success: false, error: 'Authentication failed (HTTP 401): Remote MCP server rejected credentials.' };
      }
      if (rpcRes.status === 403) {
        return { success: false, error: 'Authentication forbidden (HTTP 403): Remote MCP server denied execution.' };
      }
      if (rpcRes.status >= 400 || rpcRes.data?.error) {
        return {
          success: false,
          error: `Execution error (HTTP ${rpcRes.status}): ${rpcRes.data?.error?.message || JSON.stringify(rpcRes.data)}`
        };
      }
      if (rpcRes.sessionId && rpcRes.sessionId !== storedSessionId) {
        serverSessionStore.set(server.id, rpcRes.sessionId);
      }
      return {
        success: true,
        result: rpcRes.data?.result
      };
    } catch (fallbackErr: any) {
      return {
        success: false,
        error: `Execution error: ${fallbackErr?.message || sdkErr?.message || 'Remote MCP server failed to execute tool'}`
      };
    }
  } finally {
    if (client) {
      await client.close().catch(() => {});
    }
  }
}

// ============================================================================
// 6. MCP SERVER INVENTORY & LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * List all configured MCP servers belonging to the user
 */
export async function listUserMcpServers(userId: string): Promise<McpServerRecord[]> {
  const supabase = getSupabaseClient();
  let servers: McpServerRecord[] = [];

  try {
    const { data, error } = await supabase
      .from('mcp_servers')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      servers = data;
    } else if (error && shouldFailOnDbError()) {
      throw error;
    } else {
      servers = Array.from(inMemoryServers.values()).filter((s) => s.owner_id === userId);
    }
  } catch (err) {
    if (shouldFailOnDbError()) throw err;
    servers = Array.from(inMemoryServers.values()).filter((s) => s.owner_id === userId);
  }

  // Augment with tool counts & strictly redact credentials and session tokens
  const sanitized = await Promise.all(
    servers.map(async (server) => {
      const tools = await listToolsForServer(userId, server.id);
      const assignments = await listAssignmentsForServer(server.id);
      const uniqueAssigned = new Set(assignments.map((a) => a.agent_id));

      const { auth_credential_encrypted, session_id_encrypted, server_info, ...rest } = server;
      return {
        ...rest,
        has_credential: Boolean(auth_credential_encrypted && auth_credential_encrypted.length > 0),
        server_info: sanitizeServerInfo(server_info),
        tools_count: tools.length,
        assigned_agents_count: uniqueAssigned.size
      };
    })
  );

  return sanitized;
}

/**
 * Retrieve a specific MCP server with ownership verification
 */
export async function getMcpServer(userId: string, serverId: string): Promise<McpServerRecord | null> {
  const supabase = getSupabaseClient();
  let server: McpServerRecord | null = null;

  try {
    const { data, error } = await supabase
      .from('mcp_servers')
      .select('*')
      .eq('id', serverId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (!error && data) {
      server = data;
    } else if (error && shouldFailOnDbError()) {
      throw error;
    } else {
      server = inMemoryServers.get(serverId) || null;
      if (server && server.owner_id !== userId) server = null;
    }
  } catch (err) {
    if (shouldFailOnDbError()) throw err;
    server = inMemoryServers.get(serverId) || null;
    if (server && server.owner_id !== userId) server = null;
  }

  if (!server) return null;

  const tools = await listToolsForServer(userId, server.id);
  const assignments = await listAssignmentsForServer(server.id);
  const uniqueAssigned = new Set(assignments.map((a) => a.agent_id));

  return {
    ...server,
    has_credential: Boolean(server.auth_credential_encrypted && server.auth_credential_encrypted.length > 0),
    auth_credential_encrypted: undefined, // Strictly redact credential
    session_id_encrypted: undefined, // Strictly redact session identifier
    server_info: sanitizeServerInfo(server.server_info), // Strictly redact session identifiers
    tools_count: tools.length,
    assigned_agents_count: uniqueAssigned.size
  };
}

/**
 * Adds an MCP server, validates connection, performs live handshake, encrypts credentials at rest, and discovers tools
 */
export async function addMcpServerWithDiscovery(
  userId: string,
  params: {
    name: string;
    endpoint: string;
    description?: string;
    transport?: 'http-streamable' | 'http-sse';
    auth_type?: 'none' | 'bearer' | 'api-key' | 'custom-header';
    auth_header_name?: string;
    auth_credential?: string;
  }
): Promise<{ server: McpServerRecord; tools: McpToolRecord[]; error?: string }> {
  const name = params.name.trim();
  const endpoint = params.endpoint.trim();
  const transport = params.transport || 'http-streamable';
  const authType = params.auth_type || 'none';
  const headerName = params.auth_header_name?.trim();
  const credential = params.auth_credential?.trim();

  if (transport !== 'http-streamable' && transport !== 'http-sse') {
    throw new Error(`Unsupported transport '${transport}'. Only 'http-streamable' and 'http-sse' are supported.`);
  }

  // 1. SSRF Boundary Enforcement & HTTPS verification
  const ssrf = await validateEndpointUrl(endpoint, authType, Boolean(credential));
  if (!ssrf.valid) {
    throw new Error(ssrf.error || 'Invalid or forbidden endpoint URL.');
  }

  // 1b. Validate authentication header and credential
  const headerValidation = validateAuthHeader(authType, headerName, credential);
  if (!headerValidation.valid) {
    throw new Error(headerValidation.error || 'Invalid authentication parameters.');
  }
  const normalizedHeaderName = headerValidation.normalizedHeaderName;

  // 2. Perform live protocol handshake and discovery
  const discovery = await testMcpConnectionAndDiscover(endpoint, authType, credential, normalizedHeaderName, transport);

  if (!discovery.success || discovery.status === 'error') {
    throw new Error(discovery.error || 'Failed to authenticate and connect to MCP server.');
  }

  const serverId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Store session identifier privately on backend and encrypt for serverless persistence
  let encryptedSessionId: string | undefined = undefined;
  if (discovery.sessionId) {
    serverSessionStore.set(serverId, discovery.sessionId);
    encryptedSessionId = encryptMcpCredential(discovery.sessionId);
  }

  // 3. Encrypt credential at rest using AES-256-GCM
  const encryptedCredential = credential ? encryptMcpCredential(credential) : undefined;

  const newServerRecord: McpServerRecord = {
    id: serverId,
    owner_id: userId,
    name,
    description: params.description?.trim() || '',
    transport,
    endpoint,
    auth_type: authType,
    auth_header_name: normalizedHeaderName,
    auth_credential_encrypted: encryptedCredential,
    session_id_encrypted: encryptedSessionId,
    status: discovery.status,
    last_checked: now,
    last_error: discovery.error,
    server_info: sanitizeServerInfo(discovery.serverInfo),
    created_at: now,
    updated_at: now
  };

  const supabase = getSupabaseClient();
  let savedServer = newServerRecord;

  try {
    const hasCol = await checkSessionIdColumnSupport();
    const insertPayload: any = { ...newServerRecord };

    // If session_id_encrypted column is missing or undefined, omit from table columns
    // and preserve inside server_info._session_id_encrypted for serverless recovery
    if (!hasCol || !insertPayload.session_id_encrypted) {
      if (insertPayload.session_id_encrypted) {
        insertPayload.server_info = {
          ...(insertPayload.server_info || {}),
          _session_id_encrypted: insertPayload.session_id_encrypted
        };
      }
      delete insertPayload.session_id_encrypted;
    }

    const { data, error } = await supabase
      .from('mcp_servers')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      const isColErr =
        error.message?.includes('session_id_encrypted') ||
        (error as any).code === 'PGRST204';

      if (isColErr) {
        dbHasSessionIdColumn = false;
        const retryPayload = { ...insertPayload };
        if (retryPayload.session_id_encrypted) {
          retryPayload.server_info = {
            ...(retryPayload.server_info || {}),
            _session_id_encrypted: retryPayload.session_id_encrypted
          };
        }
        delete retryPayload.session_id_encrypted;

        const { data: retryData, error: retryErr } = await supabase
          .from('mcp_servers')
          .insert(retryPayload)
          .select()
          .single();

        if (retryErr && shouldFailOnDbError()) {
          throw new Error(`Database persistence failed: ${retryErr.message}`);
        }
        if (!retryErr && retryData) {
          savedServer = retryData;
        }
      } else if (shouldFailOnDbError()) {
        throw new Error(`Database persistence failed: ${error.message}`);
      }
    } else if (data) {
      savedServer = data;
    }
  } catch (err: any) {
    if (err?.message?.includes('Database persistence failed')) {
      throw err;
    }
    if (shouldFailOnDbError()) throw err;
  }
  inMemoryServers.set(serverId, savedServer);

  // 4. Save discovered tools
  const savedTools: McpToolRecord[] = [];
  for (const t of discovery.tools) {
    const toolId = crypto.randomUUID();
    const toolRecord: McpToolRecord = {
      id: toolId,
      server_id: serverId,
      owner_id: userId,
      name: t.name,
      description: t.description || '',
      input_schema: t.inputSchema || { type: 'object' },
      is_enabled: true,
      created_at: now,
      updated_at: now
    };

    let savedTool = toolRecord;
    try {
      const { data, error } = await supabase
        .from('mcp_tools')
        .insert(toolRecord)
        .select()
        .single();

      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error saving tool '${t.name}': ${error.message}`);
      }
      if (!error && data) {
        savedTool = data;
      }
    } catch (err) {
      if (shouldFailOnDbError()) throw err;
    }
    inMemoryTools.set(savedTool.id, savedTool);
    savedTools.push(savedTool);
  }

  // Redact credentials and session IDs before returning to client
  const sanitized = {
    ...savedServer,
    has_credential: Boolean(credential),
    auth_credential_encrypted: undefined,
    session_id_encrypted: undefined,
    server_info: sanitizeServerInfo(savedServer.server_info),
    tools_count: savedTools.length,
    assigned_agents_count: 0
  };

  return {
    server: sanitized,
    tools: savedTools,
    error: discovery.error
  };
}

/**
 * Updates an existing MCP server configuration.
 * - If auth_type changed to 'none': clears credential and header name.
 * - If auth_type changed to credentialed method: requires a new credential and never reuses stale credentials.
 * - If auth_type is unchanged: preserves existing encrypted credential if omitted/blank, or updates if provided.
 * - Validates header names (no CRLF, valid HTTP token chars, no protected headers).
 * - Tests the updated connection and re-syncs tools.
 */
export async function updateMcpServer(
  userId: string,
  serverId: string,
  params: {
    name?: string;
    endpoint?: string;
    description?: string;
    transport?: 'http-streamable' | 'http-sse';
    auth_type?: 'none' | 'bearer' | 'api-key' | 'custom-header';
    auth_header_name?: string;
    auth_credential?: string;
  }
): Promise<{ server: McpServerRecord; tools: McpToolRecord[]; error?: string }> {
  const supabase = getSupabaseClient();
  let existing: McpServerRecord | null = null;

  try {
    const { data, error } = await supabase
      .from('mcp_servers')
      .select('*')
      .eq('id', serverId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (error && shouldFailOnDbError()) {
      throw error;
    }
    existing = data;
  } catch (err) {
    if (shouldFailOnDbError()) throw err;
  }

  if (!existing) {
    existing = inMemoryServers.get(serverId) || null;
    if (existing && existing.owner_id !== userId) existing = null;
  }

  if (!existing) {
    throw new Error('MCP server not found or unauthorized.');
  }

  const targetName = params.name !== undefined ? params.name.trim() : existing.name;
  if (!targetName) {
    throw new Error('Server display name cannot be empty.');
  }

  const targetEndpoint = params.endpoint !== undefined ? params.endpoint.trim() : existing.endpoint;
  const targetTransport = params.transport !== undefined ? params.transport : existing.transport;
  const targetDescription = params.description !== undefined ? params.description.trim() : existing.description;
  const targetAuthType = params.auth_type !== undefined ? params.auth_type : existing.auth_type;

  let finalEncryptedCredential: string | undefined = undefined;
  let finalHeaderName: string | undefined = undefined;
  let rawCredentialToTest: string | undefined = undefined;

  if (targetAuthType === 'none') {
    finalEncryptedCredential = undefined;
    finalHeaderName = undefined;
    rawCredentialToTest = undefined;
  } else if (targetAuthType !== existing.auth_type) {
    // Auth method changed: require a fresh credential; do NOT reuse stale credential
    const newCred = params.auth_credential?.trim();
    if (!newCred) {
      throw new Error(`A credential is required when changing authentication method to '${targetAuthType}'.`);
    }

    const validation = validateAuthHeader(targetAuthType, params.auth_header_name, newCred);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    finalHeaderName = validation.normalizedHeaderName;
    finalEncryptedCredential = encryptMcpCredential(newCred);
    rawCredentialToTest = newCred;
  } else {
    // Same auth method: if new secret provided, update; otherwise preserve existing
    const newCred = params.auth_credential?.trim();
    if (newCred) {
      const validation = validateAuthHeader(targetAuthType, params.auth_header_name || existing.auth_header_name, newCred);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      finalHeaderName = validation.normalizedHeaderName;
      finalEncryptedCredential = encryptMcpCredential(newCred);
      rawCredentialToTest = newCred;
    } else {
      finalEncryptedCredential = existing.auth_credential_encrypted;
      finalHeaderName = params.auth_header_name !== undefined ? params.auth_header_name.trim() : existing.auth_header_name;
      if (finalEncryptedCredential) {
        try {
          rawCredentialToTest = decryptMcpCredential(finalEncryptedCredential);
        } catch {
          throw new Error('Failed to decrypt existing stored credential.');
        }
      }
    }
  }

  // SSRF validation
  const ssrf = await validateEndpointUrl(targetEndpoint, targetAuthType, Boolean(finalEncryptedCredential));
  if (!ssrf.valid) {
    throw new Error(ssrf.error || 'Invalid endpoint URL.');
  }

  // Live test and discovery
  const discovery = await testMcpConnectionAndDiscover(
    targetEndpoint,
    targetAuthType,
    rawCredentialToTest,
    finalHeaderName,
    targetTransport
  );

  if (!discovery.success || discovery.status === 'error') {
    throw new Error(discovery.error || 'Failed to authenticate and connect to MCP server with updated configuration.');
  }

  const now = new Date().toISOString();
  let updatedEncryptedSessionId = existing.session_id_encrypted;
  if (discovery.sessionId) {
    serverSessionStore.set(serverId, discovery.sessionId);
    updatedEncryptedSessionId = encryptMcpCredential(discovery.sessionId);
  }

  const updatedRecord: McpServerRecord = {
    ...existing,
    name: targetName,
    endpoint: targetEndpoint,
    description: targetDescription,
    transport: targetTransport,
    auth_type: targetAuthType,
    auth_header_name: finalHeaderName,
    auth_credential_encrypted: finalEncryptedCredential,
    session_id_encrypted: updatedEncryptedSessionId,
    status: discovery.status,
    last_checked: now,
    last_error: undefined,
    server_info: sanitizeServerInfo(discovery.serverInfo),
    updated_at: now
  };

  try {
    const hasCol = await checkSessionIdColumnSupport();
    const updatePayload: any = {
      name: targetName,
      endpoint: targetEndpoint,
      description: targetDescription,
      transport: targetTransport,
      auth_type: targetAuthType,
      auth_header_name: finalHeaderName || null,
      auth_credential_encrypted: finalEncryptedCredential || null,
      status: discovery.status,
      last_checked: now,
      last_error: null,
      server_info: {
        ...sanitizeServerInfo(discovery.serverInfo),
        ...(updatedEncryptedSessionId ? { _session_id_encrypted: updatedEncryptedSessionId } : {})
      },
      updated_at: now
    };
    if (hasCol && updatedEncryptedSessionId) {
      updatePayload.session_id_encrypted = updatedEncryptedSessionId;
    }

    const { error } = await supabase
      .from('mcp_servers')
      .update(updatePayload)
      .eq('id', serverId);

    if (error && shouldFailOnDbError()) {
      throw error;
    }
  } catch (err) {
    if (shouldFailOnDbError()) throw err;
  }

  inMemoryServers.set(serverId, updatedRecord);

  // Sync tools
  const existingTools = await listToolsForServer(userId, serverId);
  const remoteToolMap = new Map<string, { name: string; description?: string; inputSchema?: Record<string, any> }>();
  for (const rt of discovery.tools) {
    remoteToolMap.set(rt.name, rt);
  }

  const finalTools: McpToolRecord[] = [];
  for (const localTool of existingTools) {
    const remoteDef = remoteToolMap.get(localTool.name);
    if (remoteDef) {
      localTool.description = remoteDef.description || '';
      localTool.input_schema = remoteDef.inputSchema || { type: 'object' };
      localTool.updated_at = now;
      inMemoryTools.set(localTool.id, localTool);
      try {
        await supabase
          .from('mcp_tools')
          .update({
            description: localTool.description,
            input_schema: localTool.input_schema,
            updated_at: now
          })
          .eq('id', localTool.id);
      } catch {}
      finalTools.push(localTool);
      remoteToolMap.delete(localTool.name);
    } else {
      inMemoryTools.delete(localTool.id);
      try {
        await supabase.from('mcp_tools').delete().eq('id', localTool.id);
      } catch {}
    }
  }

  for (const [, newTool] of remoteToolMap) {
    const toolId = crypto.randomUUID();
    const toolRecord: McpToolRecord = {
      id: toolId,
      server_id: serverId,
      owner_id: userId,
      name: newTool.name,
      description: newTool.description || '',
      input_schema: newTool.inputSchema || { type: 'object' },
      is_enabled: true,
      created_at: now,
      updated_at: now
    };
    inMemoryTools.set(toolId, toolRecord);
    try {
      await supabase.from('mcp_tools').insert(toolRecord);
    } catch {}
    finalTools.push(toolRecord);
  }

  const assignments = await listAssignmentsForServer(serverId);
  const uniqueAssigned = new Set(assignments.map((a) => a.agent_id));

  const sanitized = {
    ...updatedRecord,
    has_credential: Boolean(finalEncryptedCredential),
    auth_credential_encrypted: undefined,
    session_id_encrypted: undefined,
    server_info: sanitizeServerInfo(updatedRecord.server_info),
    tools_count: finalTools.length,
    assigned_agents_count: uniqueAssigned.size
  };

  return {
    server: sanitized,
    tools: finalTools
  };
}

/**
 * Re-validates connection and fully synchronizes tools (updates schemas, adds new tools, removes deleted tools).
 * Propagates production database errors instead of silently converting them into a missing-server result.
 */
export async function revalidateAndSyncMcpServer(
  userId: string,
  serverId: string
): Promise<{ server: McpServerRecord; tools: McpToolRecord[]; error?: string }> {
  const supabase = getSupabaseClient();
  let server: McpServerRecord | null = null;

  try {
    const { data, error } = await supabase
      .from('mcp_servers')
      .select('*')
      .eq('id', serverId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (error && shouldFailOnDbError()) {
      throw new Error(`Database error retrieving MCP server: ${error.message}`);
    }
    server = data;
  } catch (err) {
    if (shouldFailOnDbError()) throw err;
  }

  if (!server) {
    server = inMemoryServers.get(serverId) || null;
    if (server && server.owner_id !== userId) server = null;
  }

  if (!server) {
    throw new Error('MCP server not found or unauthorized.');
  }

  const discovery = await testMcpConnectionAndDiscover(
    server.endpoint,
    server.auth_type,
    server.auth_credential_encrypted,
    server.auth_header_name,
    server.transport
  );

  const now = new Date().toISOString();
  const updatedStatus = discovery.status;
  const updatedError = discovery.error || null;
  const sanitizedServerInfo = sanitizeServerInfo(discovery.serverInfo);

  let updatedEncryptedSessionId = server.session_id_encrypted;
  if (discovery.sessionId) {
    serverSessionStore.set(serverId, discovery.sessionId);
    updatedEncryptedSessionId = encryptMcpCredential(discovery.sessionId);
  }

  const hasCol = await checkSessionIdColumnSupport();
  const updatePayload: any = {
    status: updatedStatus,
    last_checked: now,
    last_error: updatedError,
    server_info: {
      ...sanitizedServerInfo,
      ...(updatedEncryptedSessionId ? { _session_id_encrypted: updatedEncryptedSessionId } : {})
    },
    updated_at: now
  };
  if (hasCol && updatedEncryptedSessionId) {
    updatePayload.session_id_encrypted = updatedEncryptedSessionId;
  }

  try {
    const { error } = await supabase
      .from('mcp_servers')
      .update(updatePayload)
      .eq('id', serverId);

    if (error) {
      const isColErr =
        error.message?.includes('session_id_encrypted') ||
        (error as any).code === 'PGRST204';

      if (isColErr) {
        dbHasSessionIdColumn = false;
        delete updatePayload.session_id_encrypted;
        const { error: retryErr } = await supabase
          .from('mcp_servers')
          .update(updatePayload)
          .eq('id', serverId);
        if (retryErr && shouldFailOnDbError()) {
          throw new Error(`Database error updating server status: ${retryErr.message}`);
        }
      } else if (shouldFailOnDbError()) {
        throw new Error(`Database error updating server status: ${error.message}`);
      }
    }
  } catch (err) {
    if (shouldFailOnDbError()) throw err;
  }

  server.status = updatedStatus;
  server.last_checked = now;
  server.last_error = updatedError || undefined;
  server.server_info = sanitizedServerInfo;
  server.session_id_encrypted = updatedEncryptedSessionId;
  server.updated_at = now;
  inMemoryServers.set(serverId, server);

  // If connection was successful, synchronize tools
  if (discovery.success) {
    const existingTools = await listToolsForServer(userId, serverId);
    const remoteToolMap = new Map<string, { name: string; description?: string; inputSchema?: Record<string, any> }>();
    for (const rt of discovery.tools) {
      remoteToolMap.set(rt.name, rt);
    }

    // 1. Update existing tools or remove tools no longer exposed by server
    for (const existing of existingTools) {
      const matchingRemote = remoteToolMap.get(existing.name);
      if (matchingRemote) {
        try {
          await supabase
            .from('mcp_tools')
            .update({
              description: matchingRemote.description || '',
              input_schema: matchingRemote.inputSchema || { type: 'object' },
              updated_at: now
            })
            .eq('id', existing.id);
        } catch {}
        const updatedRec = {
          ...existing,
          description: matchingRemote.description || '',
          input_schema: matchingRemote.inputSchema || { type: 'object' },
          updated_at: now
        };
        inMemoryTools.set(existing.id, updatedRec);
      } else {
        // Tool was removed on remote: prune assignments and delete tool
        try {
          await supabase.from('mcp_tool_assignments').delete().eq('tool_id', existing.id);
          await supabase.from('mcp_tools').delete().eq('id', existing.id);
        } catch {}
        inMemoryTools.delete(existing.id);
        for (const [aId, a] of inMemoryAssignments.entries()) {
          if (a.tool_id === existing.id) inMemoryAssignments.delete(aId);
        }
      }
    }

    // 2. Add newly discovered tools (start unassigned / zero-trust)
    for (const [name, rt] of remoteToolMap.entries()) {
      const alreadyExists = existingTools.some((et) => et.name === name);
      if (!alreadyExists) {
        const toolId = crypto.randomUUID();
        const toolRec: McpToolRecord = {
          id: toolId,
          server_id: serverId,
          owner_id: userId,
          name: rt.name,
          description: rt.description || '',
          input_schema: rt.inputSchema || { type: 'object' },
          is_enabled: true,
          created_at: now,
          updated_at: now
        };
        try {
          await supabase.from('mcp_tools').insert(toolRec);
        } catch {}
        inMemoryTools.set(toolId, toolRec);
      }
    }
  }

  const currentTools = await listToolsForServer(userId, serverId);
  const assignments = await listAssignmentsForServer(serverId);
  const uniqueAssigned = new Set(assignments.map((a) => a.agent_id));

  return {
    server: {
      ...server,
      has_credential: Boolean(server.auth_credential_encrypted),
      auth_credential_encrypted: undefined,
      session_id_encrypted: undefined,
      server_info: sanitizeServerInfo(server.server_info),
      tools_count: currentTools.length,
      assigned_agents_count: uniqueAssigned.size
    },
    tools: currentTools,
    error: discovery.error
  };
}

/**
 * Removes an MCP server and cascades deletion of its tools & assignments
 */
export async function removeMcpServer(userId: string, serverId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  try {
    const { error: assnErr } = await supabase.from('mcp_tool_assignments').delete().eq('server_id', serverId);
    if (assnErr && shouldFailOnDbError()) throw assnErr;

    try {
      await supabase.from('mcp_tool_grants').delete().eq('server_id', serverId);
      await supabase.from('mcp_tool_requests').delete().eq('server_id', serverId);
    } catch {}

    const { error: toolsErr } = await supabase.from('mcp_tools').delete().eq('server_id', serverId).eq('owner_id', userId);
    if (toolsErr && shouldFailOnDbError()) throw toolsErr;

    const { error: srvErr } = await supabase.from('mcp_servers').delete().eq('id', serverId).eq('owner_id', userId);
    if (srvErr && shouldFailOnDbError()) throw srvErr;
  } catch (err) {
    if (shouldFailOnDbError()) throw err;
  }

  inMemoryServers.delete(serverId);
  serverSessionStore.delete(serverId);
  for (const [tId, t] of inMemoryTools.entries()) {
    if (t.server_id === serverId) inMemoryTools.delete(tId);
  }
  for (const [aId, a] of inMemoryAssignments.entries()) {
    if (a.server_id === serverId) inMemoryAssignments.delete(aId);
  }
  for (const [gId, g] of inMemoryPersistentGrants.entries()) {
    if (g.server_id === serverId) inMemoryPersistentGrants.delete(gId);
  }
  for (const [rId, r] of inMemoryToolRequests.entries()) {
    if (r.server_id === serverId) inMemoryToolRequests.delete(rId);
  }
  return true;
}

/**
 * List all tools for a specific server with user ownership check
 */
export async function listToolsForServer(userId: string, serverId: string): Promise<McpToolRecord[]> {
  const supabase = getSupabaseClient();
  let tools: McpToolRecord[] = [];

  try {
    const { data, error } = await supabase
      .from('mcp_tools')
      .select('*')
      .eq('server_id', serverId)
      .eq('owner_id', userId);

    if (!error && Array.isArray(data)) {
      tools = data;
    } else {
      tools = Array.from(inMemoryTools.values()).filter(
        (t) => t.server_id === serverId && t.owner_id === userId
      );
    }
  } catch {
    tools = Array.from(inMemoryTools.values()).filter(
      (t) => t.server_id === serverId && t.owner_id === userId
    );
  }

  // Attach assigned agents list
  const assignments = await listAssignmentsForServer(serverId);
  return tools.map((t) => {
    const assigned = assignments.filter((a) => a.tool_id === t.id).map((a) => a.agent_id);
    return {
      ...t,
      assigned_agents: assigned
    };
  });
}

/**
 * List all assignments for a specific server
 */
export async function listAssignmentsForServer(serverId: string): Promise<McpToolAssignmentRecord[]> {
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('mcp_tool_assignments')
      .select('*')
      .eq('server_id', serverId);

    if (!error && Array.isArray(data)) {
      return data;
    }
  } catch {}

  return Array.from(inMemoryAssignments.values()).filter((a) => a.server_id === serverId);
}

/**
 * Toggles or sets agent access to a specific tool with fleet membership verification
 */
export async function setToolAssignment(
  userId: string,
  toolId: string,
  agentId: string,
  granted: boolean
): Promise<{ success: boolean; assigned: boolean }> {
  if (typeof granted !== 'boolean') {
    throw new Error('granted must be a boolean');
  }

  // 1. Verify target agent belongs to operator's authentic fleet
  const isFleetMember = await verifyAgentInOperatorFleet(userId, agentId);
  if (!isFleetMember) {
    throw new Error(`Target agent '${agentId}' does not belong to operator's fleet.`);
  }

  const supabase = getSupabaseClient();

  // 2. Verify tool exists and belongs to this operator
  let tool = inMemoryTools.get(toolId);
  if (!tool) {
    try {
      const { data } = await supabase.from('mcp_tools').select('*').eq('id', toolId).maybeSingle();
      tool = data;
    } catch {}
  }

  if (!tool || tool.owner_id !== userId) {
    throw new Error('Tool not found or unauthorized.');
  }

  if (!granted) {
    // Revoke access
    try {
      const { error } = await supabase
        .from('mcp_tool_assignments')
        .delete()
        .eq('tool_id', toolId)
        .eq('agent_id', agentId);

      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error revoking assignment: ${error.message}`);
      }
    } catch (err) {
      if (shouldFailOnDbError()) throw err;
    }

    for (const [k, v] of inMemoryAssignments.entries()) {
      if (v.tool_id === toolId && v.agent_id === agentId) {
        inMemoryAssignments.delete(k);
      }
    }
    return { success: true, assigned: false };
  } else {
    // Grant access
    const assignmentId = crypto.randomUUID();
    const assignmentRecord: McpToolAssignmentRecord = {
      id: assignmentId,
      tool_id: toolId,
      server_id: tool.server_id,
      owner_id: userId,
      agent_id: agentId,
      granted_by: userId,
      created_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase.from('mcp_tool_assignments').insert(assignmentRecord);
      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error granting assignment: ${error.message}`);
      }
    } catch (err) {
      if (shouldFailOnDbError()) throw err;
    }

    inMemoryAssignments.set(assignmentId, assignmentRecord);
    return { success: true, assigned: true };
  }
}

// ============================================================================
// PERSISTENT TOOL PERMISSIONS & ACCESS REQUESTS GOVERNANCE
// ============================================================================

/**
 * Checks whether an account has an active, persistent grant for a specific tool.
 * Evaluates persistent grants, respects explicit revocations, and checks assignments.
 */
export async function hasActiveToolGrant(
  serverId: string,
  toolId: string,
  accountId: string
): Promise<boolean> {
  if (!serverId || !toolId || !accountId) return false;

  // 1. Check in-memory persistent grants first
  for (const grant of inMemoryPersistentGrants.values()) {
    if (grant.server_id === serverId && grant.tool_id === toolId && grant.account_id === accountId) {
      if (grant.status === 'revoked') return false;
      if (grant.status === 'active') return true;
    }
  }

  // 2. Query persistent database table if Supabase is configured
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('mcp_tool_grants')
        .select('*')
        .eq('server_id', serverId)
        .eq('tool_id', toolId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error verifying tool grant: ${error.message}`);
      }

      if (data) {
        inMemoryPersistentGrants.set(data.id, data);
        if (data.status === 'revoked') return false;
        if (data.status === 'active') return true;
      }
    } catch (err: any) {
      if (shouldFailOnDbError()) throw err;
    }
  }

  // 3. Fallback to existing assignments (ensures zero regression for existing assignments)
  const assignments = await listAssignmentsForServer(serverId);
  const isAssigned = assignments.some(
    (a) => a.tool_id === toolId && a.agent_id === accountId
  );
  if (isAssigned) {
    // Verify it was not explicitly revoked in memory
    for (const grant of inMemoryPersistentGrants.values()) {
      if (grant.server_id === serverId && grant.tool_id === toolId && grant.account_id === accountId && grant.status === 'revoked') {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Grants an account permanent, indefinitely-active access to a specific tool.
 */
export async function grantToolAccess(
  operatorUserId: string,
  serverId: string,
  toolId: string,
  accountId: string
): Promise<{ success: boolean; grant: McpToolGrantRecord }> {
  if (!operatorUserId || !serverId || !toolId || !accountId) {
    throw new Error('Operator ID, server ID, tool ID, and target account ID are required.');
  }

  // 1. Verify target agent belongs to operator's authentic fleet or is operator themselves
  const isFleetMember = await verifyAgentInOperatorFleet(operatorUserId, accountId);
  if (!isFleetMember && accountId !== operatorUserId) {
    throw new Error(`Target account '${accountId}' does not belong to operator's authentic fleet.`);
  }

  // 2. Verify tool exists, belongs to this server and is owned by operator
  const tool = await getToolRecord(toolId);
  if (!tool || tool.owner_id !== operatorUserId || tool.server_id !== serverId) {
    throw new Error('MCP tool not found or unauthorized.');
  }

  const now = new Date().toISOString();
  let existingGrantId: string | null = null;
  for (const [id, g] of inMemoryPersistentGrants.entries()) {
    if (g.server_id === serverId && g.tool_id === toolId && g.account_id === accountId) {
      existingGrantId = id;
      break;
    }
  }

  const grantId = existingGrantId || `grant_${crypto.randomBytes(8).toString('hex')}`;
  const grantRecord: McpToolGrantRecord = {
    id: grantId,
    server_id: serverId,
    tool_id: toolId,
    account_id: accountId,
    granted_by: operatorUserId,
    status: 'active',
    created_at: now,
    updated_at: now
  };

  // 3. Persist to database if configured
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    try {
      const { data, error } = await supabase
        .from('mcp_tool_grants')
        .upsert(
          {
            id: grantId,
            server_id: serverId,
            tool_id: toolId,
            account_id: accountId,
            granted_by: operatorUserId,
            status: 'active',
            updated_at: now
          },
          { onConflict: 'server_id,tool_id,account_id' }
        )
        .select()
        .maybeSingle();

      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error persisting tool grant: ${error.message}`);
      }
      if (data) {
        Object.assign(grantRecord, data);
      }

      // Mark any pending access requests for this tool and account as approved
      await supabase
        .from('mcp_tool_requests')
        .update({
          status: 'approved',
          reviewed_by: operatorUserId,
          reviewed_at: now,
          updated_at: now
        })
        .eq('server_id', serverId)
        .eq('tool_id', toolId)
        .eq('account_id', accountId)
        .eq('status', 'pending');
    } catch (err: any) {
      if (shouldFailOnDbError()) throw err;
    }
  }

  // 4. Update in-memory stores and synchronize tool assignments table
  inMemoryPersistentGrants.set(grantRecord.id, grantRecord);
  await setToolAssignment(operatorUserId, toolId, accountId, true);

  for (const req of inMemoryToolRequests.values()) {
    if (req.server_id === serverId && req.tool_id === toolId && req.account_id === accountId && req.status === 'pending') {
      req.status = 'approved';
      req.reviewed_by = operatorUserId;
      req.reviewed_at = now;
      req.updated_at = now;
    }
  }

  return { success: true, grant: grantRecord };
}

/**
 * Manually revokes an active grant from an account.
 */
export async function revokeToolAccess(
  operatorUserId: string,
  serverId: string,
  toolId: string,
  accountId: string
): Promise<{ success: boolean; revoked: boolean }> {
  if (!operatorUserId || !serverId || !toolId || !accountId) {
    throw new Error('Operator ID, server ID, tool ID, and target account ID are required.');
  }

  const tool = await getToolRecord(toolId);
  if (!tool || tool.owner_id !== operatorUserId || tool.server_id !== serverId) {
    throw new Error('MCP tool not found or unauthorized.');
  }

  const now = new Date().toISOString();

  // 1. Mark grant as revoked in database
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    try {
      const { error } = await supabase
        .from('mcp_tool_grants')
        .update({ status: 'revoked', updated_at: now })
        .eq('server_id', serverId)
        .eq('tool_id', toolId)
        .eq('account_id', accountId);

      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error revoking tool grant: ${error.message}`);
      }
    } catch (err: any) {
      if (shouldFailOnDbError()) throw err;
    }
  }

  // 2. Mark revoked in in-memory persistent grants
  let foundInMem = false;
  for (const [id, g] of inMemoryPersistentGrants.entries()) {
    if (g.server_id === serverId && g.tool_id === toolId && g.account_id === accountId) {
      g.status = 'revoked';
      g.updated_at = now;
      foundInMem = true;
    }
  }
  if (!foundInMem) {
    const revokedGrant: McpToolGrantRecord = {
      id: `grant_${crypto.randomBytes(8).toString('hex')}`,
      server_id: serverId,
      tool_id: toolId,
      account_id: accountId,
      granted_by: operatorUserId,
      status: 'revoked',
      created_at: now,
      updated_at: now
    };
    inMemoryPersistentGrants.set(revokedGrant.id, revokedGrant);
  }

  // 3. Remove from tool assignments table
  await setToolAssignment(operatorUserId, toolId, accountId, false);

  return { success: true, revoked: true };
}

/**
 * Lists all tool grants for a specific server.
 */
export async function listToolGrantsForServer(
  operatorUserId: string,
  serverId: string
): Promise<McpToolGrantRecord[]> {
  const supabase = getSupabaseClient();
  const grantsMap = new Map<string, McpToolGrantRecord>();

  // 1. Database grants
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('mcp_tool_grants')
        .select('*')
        .eq('server_id', serverId);

      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error listing tool grants: ${error.message}`);
      }
      if (Array.isArray(data)) {
        for (const g of data) {
          grantsMap.set(`${g.tool_id}:${g.account_id}`, g);
        }
      }
    } catch (err: any) {
      if (shouldFailOnDbError()) throw err;
    }
  }

  // 2. In-memory grants overlay
  for (const g of inMemoryPersistentGrants.values()) {
    if (g.server_id === serverId) {
      grantsMap.set(`${g.tool_id}:${g.account_id}`, g);
    }
  }

  // 3. Sync from assignments if not explicitly present in grants
  const assignments = await listAssignmentsForServer(serverId);
  for (const a of assignments) {
    const key = `${a.tool_id}:${a.agent_id}`;
    if (!grantsMap.has(key)) {
      grantsMap.set(key, {
        id: a.id,
        server_id: a.server_id,
        tool_id: a.tool_id,
        account_id: a.agent_id,
        granted_by: a.granted_by,
        status: 'active',
        created_at: a.created_at,
        updated_at: a.created_at
      });
    }
  }

  return Array.from(grantsMap.values());
}

// Concurrency mutex for access request creation to prevent race condition duplicates
const accessRequestLocks = new Map<string, Promise<void>>();

async function acquireAccessRequestLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  while (accessRequestLocks.has(lockKey)) {
    try {
      await accessRequestLocks.get(lockKey);
    } catch {
      // Continue and try again
    }
  }

  let resolveLock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  accessRequestLocks.set(lockKey, lockPromise);

  try {
    return await fn();
  } finally {
    accessRequestLocks.delete(lockKey);
    resolveLock();
  }
}

/**
 * Records or updates an access request when an unauthorized caller invokes a tool.
 * Deduplicates pending requests by updating the existing pending request timestamp & args.
 */
export async function recordOrReuseAccessRequest(params: {
  serverId: string;
  toolId: string;
  toolName: string;
  serverName: string;
  accountId: string;
  callerId: string;
  agentName?: string;
  requestedOperation?: string;
  arguments?: Record<string, any>;
}): Promise<McpToolRequestRecord> {
  const lockKey = `${params.serverId}:${params.toolId}:${params.accountId}`;
  return await acquireAccessRequestLock(lockKey, async () => {
    const now = new Date().toISOString();

    // 1. Check in-memory for existing pending request for this account + tool + server
    for (const req of inMemoryToolRequests.values()) {
      if (
        req.server_id === params.serverId &&
        req.tool_id === params.toolId &&
        req.account_id === params.accountId &&
        req.status === 'pending'
      ) {
        req.updated_at = now;
        if (params.arguments) req.arguments = params.arguments;
        if (params.requestedOperation) req.requested_operation = params.requestedOperation;
        if (params.agentName) req.agent_name = params.agentName;

        if (isSupabaseConfigured()) {
          try {
            const supabase = getSupabaseClient();
            await supabase
              .from('mcp_tool_requests')
              .update({
                updated_at: now,
                arguments: req.arguments,
                requested_operation: req.requested_operation,
                agent_name: req.agent_name
              })
              .eq('id', req.id);
          } catch {}
        }
        return req;
      }
    }

    // 2. Check Supabase for existing pending request
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseClient();
        const { data: existing, error: findErr } = await supabase
          .from('mcp_tool_requests')
          .select('*')
          .eq('server_id', params.serverId)
          .eq('tool_id', params.toolId)
          .eq('account_id', params.accountId)
          .eq('status', 'pending')
          .maybeSingle();

        if (!findErr && existing) {
          existing.updated_at = now;
          existing.arguments = params.arguments || existing.arguments;
          existing.requested_operation = params.requestedOperation || existing.requested_operation;
          if (params.agentName) existing.agent_name = params.agentName;

          await supabase
            .from('mcp_tool_requests')
            .update({
              updated_at: now,
              arguments: existing.arguments,
              requested_operation: existing.requested_operation,
              agent_name: existing.agent_name
            })
            .eq('id', existing.id);

          inMemoryToolRequests.set(existing.id, existing);
          return existing;
        }
      } catch {}
    }

    // 3. Create brand-new pending request
    const newReqId = `req_${crypto.randomBytes(8).toString('hex')}`;
    const newRecord: McpToolRequestRecord = {
      id: newReqId,
      server_id: params.serverId,
      tool_id: params.toolId,
      tool_name: params.toolName,
      server_name: params.serverName,
      account_id: params.accountId,
      caller_id: params.callerId,
      agent_name: params.agentName || params.accountId,
      requested_operation: params.requestedOperation || 'tool_invocation',
      arguments: params.arguments || {},
      status: 'pending',
      created_at: now,
      updated_at: now
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('mcp_tool_requests')
          .insert(newRecord)
          .select()
          .single();

        if (error) {
          if (
            error.code === '23505' ||
            error.message?.includes('duplicate key') ||
            error.message?.includes('unique constraint') ||
            error.message?.includes('unique_pending')
          ) {
            const { data: existingConflict } = await supabase
              .from('mcp_tool_requests')
              .select('*')
              .eq('server_id', params.serverId)
              .eq('tool_id', params.toolId)
              .eq('account_id', params.accountId)
              .eq('status', 'pending')
              .maybeSingle();

            if (existingConflict) {
              existingConflict.updated_at = now;
              if (params.arguments) existingConflict.arguments = params.arguments;
              inMemoryToolRequests.set(existingConflict.id, existingConflict);
              return existingConflict;
            }
          }
          if (shouldFailOnDbError()) {
            throw new Error(`Database error creating access request: ${error.message}`);
          }
        }
        if (data) Object.assign(newRecord, data);
      } catch (err: any) {
        if (
          err?.code === '23505' ||
          err?.message?.includes('duplicate key') ||
          err?.message?.includes('unique constraint') ||
          err?.message?.includes('unique_pending')
        ) {
          try {
            const supabase = getSupabaseClient();
            const { data: existingConflict } = await supabase
              .from('mcp_tool_requests')
              .select('*')
              .eq('server_id', params.serverId)
              .eq('tool_id', params.toolId)
              .eq('account_id', params.accountId)
              .eq('status', 'pending')
              .maybeSingle();

            if (existingConflict) {
              existingConflict.updated_at = now;
              if (params.arguments) existingConflict.arguments = params.arguments;
              inMemoryToolRequests.set(existingConflict.id, existingConflict);
              return existingConflict;
            }
          } catch {}
        }
        if (shouldFailOnDbError()) throw err;
      }
    }

    inMemoryToolRequests.set(newRecord.id, newRecord);
    return newRecord;
  });
}

/**
 * Lists tool access requests for an operator's MCP servers.
 * Supports filtering by serverId and request status ('pending', 'approved', 'rejected', 'all').
 */
export async function listToolAccessRequests(
  operatorUserId: string,
  serverId?: string,
  status?: string
): Promise<McpToolRequestRecord[]> {
  const operatorServers = await listUserMcpServers(operatorUserId);
  const operatorServerIds = operatorServers.map((s) => s.id);

  if (serverId && !operatorServerIds.includes(serverId)) {
    throw new Error('Forbidden: Operator does not own the requested server.');
  }

  const targetServerIds = serverId ? [serverId] : operatorServerIds;
  const filterStatus = status && status.toLowerCase() !== 'all' ? status.toLowerCase() : null;

  const resultsMap = new Map<string, McpToolRequestRecord>();

  // 1. Fetch from database if configured
  if (isSupabaseConfigured() && targetServerIds.length > 0) {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('mcp_tool_requests')
        .select('*')
        .in('server_id', targetServerIds);

      if (filterStatus) {
        query = query.eq('status', filterStatus);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error listing access requests: ${error.message}`);
      }
      if (Array.isArray(data)) {
        for (const r of data) {
          resultsMap.set(r.id, r);
        }
      }
    } catch (err: any) {
      if (shouldFailOnDbError()) throw err;
    }
  }

  // 2. Overlay in-memory requests
  for (const r of inMemoryToolRequests.values()) {
    if (targetServerIds.includes(r.server_id)) {
      if (!filterStatus || r.status.toLowerCase() === filterStatus) {
        resultsMap.set(r.id, r);
      }
    }
  }

  // Sort by created_at descending
  return Array.from(resultsMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Approves a pending tool access request:
 * - Persists a permanent grant for the exact requesting account, server, and tool.
 * - Updates the request status to 'approved'.
 * - Immediately available for subsequent tool calls.
 */
export async function approveToolAccessRequest(
  operatorUserId: string,
  requestId: string
): Promise<{ success: boolean; request: McpToolRequestRecord; grant: McpToolGrantRecord }> {
  // Find request
  let request: McpToolRequestRecord | null = inMemoryToolRequests.get(requestId) || null;
  if (!request && isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('mcp_tool_requests').select('*').eq('id', requestId).maybeSingle();
      if (data) request = data;
    } catch {}
  }

  if (!request) {
    throw new Error('Access request not found.');
  }

  // Verify operator owns the server
  const server = await getMcpServer(operatorUserId, request.server_id);
  if (!server) {
    throw new Error('Forbidden: Operator does not own the associated MCP server.');
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot approve request in '${request.status}' state.`);
  }

  // 1. Grant permanent tool access
  const grantResult = await grantToolAccess(operatorUserId, request.server_id, request.tool_id, request.account_id);

  // 2. Update request status to approved
  const now = new Date().toISOString();
  request.status = 'approved';
  request.reviewed_by = operatorUserId;
  request.reviewed_at = now;
  request.updated_at = now;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('mcp_tool_requests')
        .update({
          status: 'approved',
          reviewed_by: operatorUserId,
          reviewed_at: now,
          updated_at: now
        })
        .eq('id', requestId);

      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error approving access request: ${error.message}`);
      }
    } catch (err: any) {
      if (shouldFailOnDbError()) throw err;
    }
  }

  inMemoryToolRequests.set(request.id, request);
  return { success: true, request, grant: grantResult.grant };
}

/**
 * Rejects a pending tool access request:
 * - Updates the request status to 'rejected'.
 * - Does not grant permission or execute the unauthorized call.
 * - Retains the decision in request history.
 */
export async function rejectToolAccessRequest(
  operatorUserId: string,
  requestId: string,
  reason?: string
): Promise<{ success: boolean; request: McpToolRequestRecord }> {
  let request: McpToolRequestRecord | null = inMemoryToolRequests.get(requestId) || null;
  if (!request && isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('mcp_tool_requests').select('*').eq('id', requestId).maybeSingle();
      if (data) request = data;
    } catch {}
  }

  if (!request) {
    throw new Error('Access request not found.');
  }

  const server = await getMcpServer(operatorUserId, request.server_id);
  if (!server) {
    throw new Error('Forbidden: Operator does not own the associated MCP server.');
  }

  if (request.status !== 'pending') {
    throw new Error(`Cannot reject request in '${request.status}' state.`);
  }

  const now = new Date().toISOString();
  request.status = 'rejected';
  request.reviewed_by = operatorUserId;
  request.reviewed_at = now;
  request.rejection_reason = reason?.trim() || 'Access denied by operator policy.';
  request.updated_at = now;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('mcp_tool_requests')
        .update({
          status: 'rejected',
          reviewed_by: operatorUserId,
          reviewed_at: now,
          rejection_reason: request.rejection_reason,
          updated_at: now
        })
        .eq('id', requestId);

      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error rejecting access request: ${error.message}`);
      }
    } catch (err: any) {
      if (shouldFailOnDbError()) throw err;
    }
  }

  inMemoryToolRequests.set(request.id, request);
  return { success: true, request };
}

export async function getToolRecord(toolId: string): Promise<McpToolRecord | null> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('mcp_tools').select('*').eq('id', toolId).maybeSingle();
      if (error && shouldFailOnDbError()) {
        throw new Error(`Database error retrieving tool: ${error.message}`);
      }
      if (data) {
        inMemoryTools.set(data.id, data);
        return data;
      }
      return null;
    } catch (err: any) {
      if (shouldFailOnDbError()) throw err;
    }
  }
  return inMemoryTools.get(toolId) || null;
}

export async function getToolHitlPolicy(toolId: string): Promise<McpToolPolicyRecord | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('mcp_tool_policies').select('*').eq('tool_id', toolId).maybeSingle();
    if (error) {
      throw new Error(`Failed to evaluate tool HITL policy: ${error.message || 'Database error'}`);
    }
    if (data) {
      inMemoryPolicies.set(toolId, data);
      return data;
    }
    return null;
  }
  return inMemoryPolicies.get(toolId) || null;
}

export async function setToolHitlPolicy(
  userId: string,
  toolId: string,
  hitlEnabled: boolean
): Promise<McpToolPolicyRecord> {
  const tool = await getToolRecord(toolId);
  if (!tool) {
    throw new Error('MCP tool not found.');
  }
  if (tool.owner_id !== userId) {
    throw new Error('Forbidden: Operator does not own this tool.');
  }

  const now = new Date().toISOString();
  let policy: McpToolPolicyRecord = {
    id: `pol_${crypto.randomBytes(8).toString('hex')}`,
    tool_id: toolId,
    hitl_enabled: hitlEnabled,
    created_at: now,
    updated_at: now
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('mcp_tool_policies')
      .upsert(
        { tool_id: toolId, hitl_enabled: hitlEnabled, updated_at: now },
        { onConflict: 'tool_id' }
      )
      .select()
      .single();
    if (error && shouldFailOnDbError()) {
      throw new Error(`Database error setting tool policy: ${error.message}`);
    }
    if (!error && data) {
      policy = data;
    }
  }

  inMemoryPolicies.set(toolId, policy);
  return policy;
}

export async function getPendingInvocationRecord(invocationId: string): Promise<PendingToolInvocationRecord | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('pending_tool_invocations').select('*').eq('id', invocationId).maybeSingle();
    if (error && shouldFailOnDbError()) {
      throw new Error(`Database error retrieving tool invocation: ${error.message}`);
    }
    if (data) {
      inMemoryInvocations.set(data.id, data);
      return data;
    }
    return null;
  }
  return inMemoryInvocations.get(invocationId) || null;
}

export async function updateInvocationRecord(inv: Partial<PendingToolInvocationRecord> & { id: string }): Promise<void> {
  const existing = inMemoryInvocations.get(inv.id);
  if (existing) {
    Object.assign(existing, inv, { updated_at: new Date().toISOString() });
  } else {
    inMemoryInvocations.set(inv.id, inv as PendingToolInvocationRecord);
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('pending_tool_invocations').update(inv).eq('id', inv.id);
    if (error && shouldFailOnDbError()) {
      throw new Error(`Database error updating tool invocation state: ${error.message}`);
    }
  }
}

export async function createToolGrantRecord(grant: ToolExecutionGrantRecord): Promise<void> {
  inMemoryGrants.set(grant.invocation_id, grant);
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('tool_execution_grants').insert(grant);
    if (error && shouldFailOnDbError()) {
      throw new Error(`Database error persisting tool grant: ${error.message}`);
    }
  }
}

/**
 * Concurrency-safe atomic conditional approval for pending invocations
 */
export async function approvePendingInvocation(
  operatorId: string,
  invocationId: string
): Promise<{ success: boolean; invocation?: PendingToolInvocationRecord; error?: string }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const grantExpiresAt = new Date(now.getTime() + 60 * 1000).toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const grantSecret = crypto.randomBytes(32).toString('hex');
    const grantHash = crypto.createHash('sha256').update(grantSecret).digest('hex');
    const grantId = `grant_${crypto.randomBytes(8).toString('hex')}`;

    try {
      await supabase.rpc('approve_and_grant_invocation', {
        p_operator_id: operatorId,
        p_invocation_id: invocationId,
        p_grant_id: grantId,
        p_grant_token_hash: grantHash,
        p_expires_at: grantExpiresAt,
        p_now: nowIso
      });
      const { data: updated } = await supabase.from('pending_tool_invocations').select('*').eq('id', invocationId).single();
      return { success: true, invocation: updated };
    } catch (err: any) {
      return { success: false, error: `Failed to approve invocation: ${err.message}` };
    }
  }

  const inv = inMemoryInvocations.get(invocationId);
  if (!inv) return { success: false, error: 'Invocation not found.' };
  if (inv.owner_id !== operatorId) return { success: false, error: 'Forbidden: Operator does not own this tool.' };
  if (inv.status !== 'pending') return { success: false, error: `Invocation is already in '${inv.status}' state.` };
  if (new Date(inv.expires_at).getTime() <= Date.now()) {
    inv.status = 'expired';
    return { success: false, error: 'Invocation has expired.' };
  }

  const grantSecret = crypto.randomBytes(32).toString('hex');
  const grantHash = crypto.createHash('sha256').update(grantSecret).digest('hex');
  const grantId = `grant_${crypto.randomBytes(8).toString('hex')}`;

  const grantRecord: ToolExecutionGrantRecord = {
    id: grantId,
    invocation_id: invocationId,
    grant_token_hash: grantHash,
    expires_at: grantExpiresAt,
    created_at: nowIso
  };
  inMemoryGrants.set(invocationId, grantRecord);

  inv.status = 'approved';
  inv.updated_at = nowIso;
  return { success: true, invocation: inv };
}








/**
 * Concurrency-safe atomic conditional denial for pending invocations
 */
export async function denyPendingInvocation(
  operatorId: string,
  invocationId: string
): Promise<{ success: boolean; invocation?: PendingToolInvocationRecord; error?: string }> {
  const nowIso = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data: updated, error } = await supabase
      .from('pending_tool_invocations')
      .update({ status: 'denied', updated_at: nowIso })
      .eq('id', invocationId)
      .eq('owner_id', operatorId)
      .eq('status', 'pending')
      .gt('expires_at', nowIso)
      .select()
      .single();

    if (error || !updated) {
      const { data: existing } = await supabase
        .from('pending_tool_invocations')
        .select('*')
        .eq('id', invocationId)
        .maybeSingle();

      if (!existing) return { success: false, error: 'Invocation not found.' };
      if (existing.owner_id !== operatorId) return { success: false, error: 'Forbidden: Operator does not own this tool.' };
      if (existing.status !== 'pending') return { success: false, error: `Invocation is already in '${existing.status}' state.` };
      if (new Date(existing.expires_at).getTime() <= Date.now()) return { success: false, error: 'Invocation has expired.' };
      return { success: false, error: 'Failed to deny invocation.' };
    }

    return { success: true, invocation: updated };
  }

  const inv = inMemoryInvocations.get(invocationId);
  if (!inv) return { success: false, error: 'Invocation not found.' };
  if (inv.owner_id !== operatorId) return { success: false, error: 'Forbidden: Operator does not own this tool.' };
  if (inv.status !== 'pending') return { success: false, error: `Invocation is already in '${inv.status}' state.` };
  if (new Date(inv.expires_at).getTime() <= Date.now()) {
    inv.status = 'expired';
    return { success: false, error: 'Invocation has expired.' };
  }

  inv.status = 'denied';
  inv.updated_at = nowIso;
  return { success: true, invocation: inv };
}

/**
 * Lists all currently pending unexpired tool invocations for an operator's tools
 */
export async function listPendingInvocationsForOwner(ownerId: string): Promise<any[]> {
  const nowIso = new Date().toISOString();
  let invocations: any[] = [];
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('pending_tool_invocations')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('status', 'pending')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false });
    if (error && shouldFailOnDbError()) {
      throw new Error(`Database error listing pending invocations: ${error.message}`);
    }
    if (error) {
      throw new Error(`Failed to list pending invocations: ${error.message}`);
    }
    if (Array.isArray(data)) invocations = data;
  } else {
    invocations = Array.from(inMemoryInvocations.values()).filter(
      (inv) => inv.owner_id === ownerId && inv.status === 'pending' && new Date(inv.expires_at).getTime() > Date.now()
    );
  }

  const results = [];
  for (const inv of invocations) {
    const tool = await getToolRecord(inv.tool_id);
    let serverName = 'Unknown Server';
    if (tool) {
      let server = inMemoryServers.get(tool.server_id);
      if (!server && isSupabaseConfigured()) {
        try {
          const supabase = getSupabaseClient();
          const { data: s } = await supabase.from('mcp_servers').select('name').eq('id', tool.server_id).maybeSingle();
          if (s) server = s as any;
        } catch {}
      }
      if (server) serverName = server.name;
    }
    results.push({
      ...inv,
      tool_name: tool?.name || 'Unknown Tool',
      server_name: serverName
    });
  }
  return results;
}

/**
 * Server-governed Tool Execution Proxy:
 * Verifies server runtime state, enforces agent-level tool assignment, audits execution, and validates schema
 */
export async function invokeAuthorizedTool(
  caller: { userId: string; agentId: string; isMaster?: boolean },
  toolId: string,
  args: Record<string, any>,
  invocationId?: string,
  grantToken?: string
): Promise<{
  success: boolean;
  result?: any;
  error?: string;
  invocationId?: string;
  requiresApproval?: boolean;
  requestId?: string;
  requiresAccessApproval?: boolean;
}> {
  const supabase = getSupabaseClient();

  // 1. Fetch tool record
  let tool = await getToolRecord(toolId);
  if (!tool) {
    return { success: false, error: 'Tool not found.' };
  }

  if (!tool.is_enabled) {
    await logAgentFootprint(
      caller.userId,
      'MCP_TOOL_INVOCATION_BLOCKED',
      `Blocked: Tool '${tool.name}' is disabled by policy`,
      tool.id,
      caller.agentId
    );
    return { success: false, error: 'Forbidden: Tool is disabled by operator policy.' };
  }

  // 2. Fetch server record
  let server = inMemoryServers.get(tool.server_id);
  if (!server && isSupabaseConfigured()) {
    try {
      const { data } = await supabase.from('mcp_servers').select('*').eq('id', tool.server_id).maybeSingle();
      server = data;
    } catch {}
  }

  if (!server) {
    return { success: false, error: 'Associated MCP server not found.' };
  }

  // 3. Enforce Server Lifecycle Runtime State
  if (server.status !== 'connected') {
    return {
      success: false,
      error: `MCP server is not connected (current status: '${server.status}').`
    };
  }

  // 4. Authorization Check & Persistent Access Request Integration
  const hasGrant =
    (await hasActiveToolGrant(server.id, toolId, caller.agentId)) ||
    (await hasActiveToolGrant(server.id, toolId, caller.userId));

  if (!hasGrant) {
    // 1. Block execution of the unauthorized tool call
    // 2. Create a persistent access request or reuse an existing pending request
    const accessReq = await recordOrReuseAccessRequest({
      serverId: server.id,
      toolId: tool.id,
      toolName: tool.name,
      serverName: server.name,
      accountId: caller.agentId || caller.userId,
      callerId: caller.userId,
      agentName: caller.agentId,
      requestedOperation: 'tool_invocation',
      arguments: args
    });

    await logAgentFootprint(
      caller.userId,
      'MCP_TOOL_INVOCATION_BLOCKED',
      `Blocked: Tool '${tool.name}' not authorized for account '${caller.agentId || caller.userId}'. Access request '${accessReq.id}' created.`,
      tool.id,
      caller.agentId
    );

    return {
      success: false,
      error: `Forbidden: Tool not authorized or assigned to caller. Access request created for operator approval (request: ${accessReq.id}).`,
      requestId: accessReq.id,
      requiresAccessApproval: true
    };
  }

  // 5. HITL Check
  let executionArgs = args;
  if (invocationId) {
    const invocation = await getPendingInvocationRecord(invocationId);
    if (!invocation || invocation.status !== 'approved') {
      return { success: false, error: 'HITL_APPROVAL_REQUIRED_OR_INVALID', invocationId: invocation?.id };
    }

    if (invocation.tool_id !== toolId) {
      return { success: false, error: 'Forbidden: Tool ID does not match approved invocation tool.' };
    }

    if (new Date(invocation.expires_at).getTime() <= Date.now()) {
      invocation.status = 'expired';
      await updateInvocationRecord({ id: invocation.id, status: 'expired' });
      return { success: false, error: 'HITL_INVOCATION_EXPIRED' };
    }

    const matchesAgent = caller.agentId === invocation.agent_id;
    const matchesOwnerScope = (
      caller.userId === invocation.caller_id ||
      caller.userId === invocation.owner_id ||
      (caller.isMaster && invocation.owner_id === caller.userId)
    );
    if (!matchesAgent || !matchesOwnerScope) {
      return { success: false, error: `Forbidden: Account '${caller.agentId}' does not match requesting agent.` };
    }

    const incomingHash = hashToolArguments(args);
    if (incomingHash !== invocation.args_hash) {
      return { success: false, error: 'HITL_ARGUMENTS_MISMATCH' };
    }

    const grant = inMemoryGrants.get(invocationId);
    if (grant) {
      if (new Date(grant.expires_at).getTime() <= Date.now()) {
        return { success: false, error: 'HITL_GRANT_EXPIRED' };
      }
      if (grantToken) {
        const expectedHash = crypto.createHash('sha256').update(grantToken).digest('hex');
        if (expectedHash !== grant.grant_token_hash) {
          return { success: false, error: 'HITL_GRANT_INVALID' };
        }
      }
      inMemoryGrants.delete(invocationId);
    } else if (isSupabaseConfigured()) {
      if (grantToken) {
        const tokenHash = crypto.createHash('sha256').update(grantToken).digest('hex');
        try {
          await supabase.rpc('consume_grant', {
            p_invocation_id: invocationId,
            p_token_hash: tokenHash
          });
        } catch {
          return { success: false, error: 'HITL_GRANT_CONSUMED_OR_INVALID' };
        }
      }
    }

    invocation.status = 'executed';
    await updateInvocationRecord({ id: invocation.id, status: 'executed' });
    executionArgs = invocation.args || args;
  } else {
    const policy = await getToolHitlPolicy(toolId);
    if (policy && policy.hitl_enabled) {
      const invId = `inv_${crypto.randomBytes(8).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const argsHash = hashToolArguments(args);
      const nowIso = new Date().toISOString();

      const pendingRecord: PendingToolInvocationRecord = {
        id: invId,
        tool_id: toolId,
        caller_id: caller.userId,
        agent_id: caller.agentId,
        owner_id: tool.owner_id,
        args,
        args_hash: argsHash,
        status: 'pending',
        expires_at: expiresAt,
        created_at: nowIso,
        updated_at: nowIso
      };

      inMemoryInvocations.set(invId, pendingRecord);
      if (isSupabaseConfigured()) {
        try {
          await supabase.from('pending_tool_invocations').insert(pendingRecord);
        } catch (err: any) {
          if (shouldFailOnDbError()) {
            throw new Error(`Database error saving pending invocation: ${err.message}`);
          }
        }
      }

      return {
        success: false,
        requiresApproval: true,
        error: 'HITL_APPROVAL_REQUIRED',
        invocationId: invId
      };
    }
  }
  
  // 6. Dispatch and Audit Outcome
  const execResult = await executeRemoteMcpTool(server, tool, executionArgs);
  return execResult;
}

/**
 * Returns tools authorized exclusively for the requesting agent
 */
export async function getAuthorizedToolsForAgent(
  caller: { userId: string; agentId: string }
): Promise<Array<{ id: string; name: string; description: string; input_schema: any; server_name: string }>> {
  const supabase = getSupabaseClient();
  let assignments: McpToolAssignmentRecord[] = [];

  try {
    const { data } = await supabase
      .from('mcp_tool_assignments')
      .select('*')
      .or(`agent_id.eq.${caller.agentId},agent_id.eq.${caller.userId}`);
    if (Array.isArray(data)) assignments = data;
  } catch {}

  const inMem = Array.from(inMemoryAssignments.values()).filter(
    (a) => a.agent_id === caller.agentId || a.agent_id === caller.userId
  );
  for (const m of inMem) {
    if (!assignments.some((a) => a.id === m.id)) assignments.push(m);
  }

  // Also include any tools with active grants for this agent/user
  for (const grant of inMemoryPersistentGrants.values()) {
    if ((grant.account_id === caller.agentId || grant.account_id === caller.userId) && grant.status === 'active') {
      if (!assignments.some((a) => a.tool_id === grant.tool_id)) {
        assignments.push({
          id: grant.id,
          server_id: grant.server_id,
          tool_id: grant.tool_id,
          agent_id: grant.account_id,
          created_at: grant.created_at
        } as any);
      }
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const { data: dbGrants } = await supabase
        .from('mcp_tool_grants')
        .select('*')
        .or(`account_id.eq.${caller.agentId},account_id.eq.${caller.userId}`)
        .eq('status', 'active');
      if (Array.isArray(dbGrants)) {
        for (const g of dbGrants) {
          if (!assignments.some((a) => a.tool_id === g.tool_id)) {
            assignments.push({
              id: g.id,
              server_id: g.server_id,
              tool_id: g.tool_id,
              agent_id: g.account_id,
              created_at: g.created_at
            } as any);
          }
        }
      }
    } catch {}
  }

  const results: Array<{ id: string; name: string; description: string; input_schema: any; server_name: string }> = [];

  for (const assn of assignments) {
    let tool = inMemoryTools.get(assn.tool_id);
    if (!tool) {
      try {
        const { data } = await supabase.from('mcp_tools').select('*').eq('id', assn.tool_id).maybeSingle();
        if (data) tool = data;
      } catch {}
    }
    let server = inMemoryServers.get(assn.server_id);
    if (!server) {
      try {
        const { data } = await supabase.from('mcp_servers').select('*').eq('id', assn.server_id).maybeSingle();
        if (data) server = data;
      } catch {}
    }
    if (tool && tool.is_enabled && server && server.status === 'connected') {
      results.push({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
        server_name: server.name
      });
    }
  }

  return results;
}
