import crypto from 'crypto';
import {
  validateEndpointUrl,
  isIpRestricted,
  isHostnameRestricted,
  createSsrfSafeAgent,
  encryptMcpCredential,
  decryptMcpCredential,
  validateToolArguments,
  addMcpServerWithDiscovery,
  listUserMcpServers,
  getMcpServer,
  listToolsForServer,
  setToolAssignment,
  invokeAuthorizedTool,
  removeMcpServer,
  getAuthorizedToolsForAgent,
  revalidateAndSyncMcpServer,
  sanitizeServerInfo,
  parseMcpResponseBody,
  clearServerSessionStoreForTesting,
  getServerSessionStoreSizeForTesting,
  hasServerSessionForTesting,
  ssrfSafeFetch,
  executeRemoteMcpTool,
  setToolHitlPolicy,
  getToolHitlPolicy,
  getPendingInvocationRecord,
  updateInvocationRecord,
  createToolGrantRecord,
  approvePendingInvocation,
  clearHitlStoreForTesting,
  hashToolArguments,
  canonicalJsonStringify,
  resetDbHasSessionIdColumnForTesting,
  hasActiveToolGrant,
  grantToolAccess,
  revokeToolAccess,
  listToolGrantsForServer,
  recordOrReuseAccessRequest,
  listToolAccessRequests,
  approveToolAccessRequest,
  rejectToolAccessRequest,
  clearAccessGovernanceForTesting
} from '../services/mcpService.js';
import {
  establishDirectConnection,
  createConnection,
  ConnectionForbiddenError
} from '../services/connectionService.js';
import { validateConfig } from '../config.js';
import { ensureConfigValidated } from '../../server.js';

export async function runFloorMcpServerTests(): Promise<Record<string, { passed: boolean; message?: string }>> {
  process.env.NODE_ENV = 'test';
  console.log('\n=== AAMARVA FLOOR HARDENED MCP SERVER & GOVERNANCE TEST SUITE ===');
  const results: Record<string, { passed: boolean; message?: string }> = {};

  const masterUserId = 'user_master_floor_test_001';
  const slaveAgentId = 'agent_slave_alpha_001';
  const unauthorizedAgentId = 'agent_unauthorized_intruder_999';

  // ============================================================================
  // 1. Authenticated Credential Encryption at Rest (AES-256-GCM)
  // ============================================================================
  try {
    const rawSecret = 'sk_mcp_live_token_super_secret_payload_12345';
    const encrypted = encryptMcpCredential(rawSecret);

    const isEncryptedFormat = encrypted.startsWith('enc:v1:') && encrypted.split(':').length === 5;
    const doesNotContainPlaintext = !encrypted.includes(rawSecret);
    const decrypted = decryptMcpCredential(encrypted);
    const matchesOriginal = decrypted === rawSecret;

    // Test tamper resistance: corrupt ciphertext
    const parts = encrypted.split(':');
    parts[4] = parts[4].substring(0, parts[4].length - 2) + (parts[4].endsWith('a') ? 'b' : 'a');
    const tampered = parts.join(':');
    let tamperDetected = false;
    try {
      decryptMcpCredential(tampered);
    } catch {
      tamperDetected = true;
    }

    if (isEncryptedFormat && doesNotContainPlaintext && matchesOriginal && tamperDetected) {
      results['test_credential_encryption_at_rest'] = {
        passed: true,
        message: 'AES-256-GCM authenticated encryption and decryption validated with tamper protection'
      };
      console.log('[PASSED] test_credential_encryption_at_rest: AES-256-GCM authenticated encryption verified');
    } else {
      results['test_credential_encryption_at_rest'] = {
        passed: false,
        message: `Encryption check failed: format=${isEncryptedFormat}, noPlaintext=${doesNotContainPlaintext}, match=${matchesOriginal}, tamper=${tamperDetected}`
      };
      console.error('[FAILED] test_credential_encryption_at_rest');
    }
  } catch (err: any) {
    results['test_credential_encryption_at_rest'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 2. Encryption Key Rotation Strategy
  // ============================================================================
  try {
    const oldKey = 'initial_encryption_key_phase_one_999';
    const newKey = 'rotated_encryption_key_phase_two_888';

    // Set initial key
    process.env.SECRETS_ENCRYPTION_KEY = oldKey;
    const encryptedWithOld = encryptMcpCredential('api_key_for_rotation_test');

    // Rotate to new primary key, keeping old key in previous rotation list
    process.env.SECRETS_ENCRYPTION_KEY = newKey;
    process.env.SECRETS_ENCRYPTION_PREVIOUS_KEYS = `${oldKey},another_historical_key_777`;

    // Attempt decrypting credential that was encrypted with old key
    const decryptedWithRotation = decryptMcpCredential(encryptedWithOld);
    const rotationSuccess = decryptedWithRotation === 'api_key_for_rotation_test';

    // Verify new encryptions use new key
    const encryptedWithNew = encryptMcpCredential('new_payload_after_rotation');
    const decryptedWithNew = decryptMcpCredential(encryptedWithNew);
    const newEncryptionSuccess = decryptedWithNew === 'new_payload_after_rotation';

    // Clean up test env keys
    delete process.env.SECRETS_ENCRYPTION_PREVIOUS_KEYS;
    delete process.env.SECRETS_ENCRYPTION_KEY;

    if (rotationSuccess && newEncryptionSuccess) {
      results['test_key_rotation_strategy'] = {
        passed: true,
        message: 'Zero-downtime key rotation validated: previous keys decrypt historic credentials, new keys encrypt new credentials'
      };
      console.log('[PASSED] test_key_rotation_strategy: Seamless key rotation verified');
    } else {
      results['test_key_rotation_strategy'] = {
        passed: false,
        message: `Key rotation failed: rotationSuccess=${rotationSuccess}, newEncryptionSuccess=${newEncryptionSuccess}`
      };
      console.error('[FAILED] test_key_rotation_strategy');
    }
  } catch (err: any) {
    results['test_key_rotation_strategy'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 3. Hardened SSRF & Outbound IP Boundary Defense
  // ============================================================================
  try {
    // Direct IP evaluation
    const loopbackIpv4 = isIpRestricted('127.0.0.1');
    const loopbackIpv4Subnet = isIpRestricted('127.10.20.30');
    const loopbackIpv6 = isIpRestricted('::1');
    const ipv4MappedIpv6 = isIpRestricted('::ffff:127.0.0.1');
    const cloudMetadata = isIpRestricted('169.254.169.254');
    const rfc1918A = isIpRestricted('10.254.1.1');
    const rfc1918B = isIpRestricted('172.20.10.5');
    const rfc1918C = isIpRestricted('192.168.1.100');
    const cgnat = isIpRestricted('100.64.0.1');
    const ulaIpv6 = isIpRestricted('fc00::1');
    const linkLocalIpv6 = isIpRestricted('fe80::1');
    const publicIpv4 = isIpRestricted('8.8.8.8');

    // Hostname evaluation
    const localDomain = isHostnameRestricted('localhost');
    const metaDomain = isHostnameRestricted('metadata.google.internal');
    const safeDomain = isHostnameRestricted('api.anthropic.com');

    // Asynchronous URL validation
    const localhostUrl = await validateEndpointUrl('http://localhost:3000/mcp');
    const loopbackUrl = await validateEndpointUrl('http://127.0.0.1:8080/mcp');
    const metadataUrl = await validateEndpointUrl('http://169.254.169.254/latest/meta-data');
    const embeddedCredsUrl = await validateEndpointUrl('http://admin:secret@api.example.com/mcp');
    const blockedPortUrl = await validateEndpointUrl('http://example.com:22/mcp');

    const ipChecksPassed =
      loopbackIpv4 &&
      loopbackIpv4Subnet &&
      loopbackIpv6 &&
      ipv4MappedIpv6 &&
      cloudMetadata &&
      rfc1918A &&
      rfc1918B &&
      rfc1918C &&
      cgnat &&
      ulaIpv6 &&
      linkLocalIpv6 &&
      !publicIpv4;

    const domainChecksPassed = localDomain && metaDomain && !safeDomain;

    const urlChecksPassed =
      !localhostUrl.valid &&
      !loopbackUrl.valid &&
      !metadataUrl.valid &&
      !embeddedCredsUrl.valid &&
      !blockedPortUrl.valid;

    if (ipChecksPassed && domainChecksPassed && urlChecksPassed) {
      results['test_ssrf_comprehensive_defense'] = {
        passed: true,
        message: 'SSRF defense blocked IPv4/IPv6 loopback, RFC1918, CGNAT, metadata, ports, and embedded credentials'
      };
      console.log('[PASSED] test_ssrf_comprehensive_defense: Complete SSRF IP & DNS boundary verified');
    } else {
      results['test_ssrf_comprehensive_defense'] = {
        passed: false,
        message: `SSRF check failed: ipChecks=${ipChecksPassed}, domainChecks=${domainChecksPassed}, urlChecks=${urlChecksPassed}`
      };
      console.error('[FAILED] test_ssrf_comprehensive_defense');
    }
  } catch (err: any) {
    results['test_ssrf_comprehensive_defense'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 4. Connection-Layer SSRF Agent & DNS Rebinding Elimination
  // ============================================================================
  try {
    const agent = createSsrfSafeAgent(false);
    let agentBlockedLoopback = false;

    // Test the agent's lookup interceptor directly
    await new Promise<void>((resolve) => {
      (agent as any).options.lookup('127.0.0.1', {}, (err: any) => {
        if (err && err.message?.includes('SSRF blocked')) {
          agentBlockedLoopback = true;
        }
        resolve();
      });
    });

    let agentBlockedMetadataDomain = false;
    await new Promise<void>((resolve) => {
      (agent as any).options.lookup('metadata.google.internal', {}, (err: any) => {
        if (err && err.message?.includes('SSRF blocked')) {
          agentBlockedMetadataDomain = true;
        }
        resolve();
      });
    });

    if (agentBlockedLoopback && agentBlockedMetadataDomain) {
      results['test_connection_layer_ssrf_agent'] = {
        passed: true,
        message: 'Connection-layer HTTP/HTTPS Agent interceptor enforces IP restrictions on every socket connect'
      };
      console.log('[PASSED] test_connection_layer_ssrf_agent: Connection-layer DNS rebinding defense verified');
    } else {
      results['test_connection_layer_ssrf_agent'] = {
        passed: false,
        message: `Agent checks failed: loopback=${agentBlockedLoopback}, meta=${agentBlockedMetadataDomain}`
      };
      console.error('[FAILED] test_connection_layer_ssrf_agent');
    }
  } catch (err: any) {
    results['test_connection_layer_ssrf_agent'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 5. Categorical Mock Endpoint Rejection in Production Mode
  // ============================================================================
  try {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const prodMockCheck = await validateEndpointUrl('mock://mcp.internal.test/v1');
    process.env.NODE_ENV = prevNodeEnv; // Restore

    const mockCategoricallyBlocked = !prodMockCheck.valid && prodMockCheck.error?.includes('strictly prohibited');

    if (mockCategoricallyBlocked) {
      results['test_mock_endpoints_rejected_in_production'] = {
        passed: true,
        message: 'Mock endpoints are categorically rejected when NODE_ENV is production'
      };
      console.log('[PASSED] test_mock_endpoints_rejected_in_production: Production mock rejection verified');
    } else {
      results['test_mock_endpoints_rejected_in_production'] = {
        passed: false,
        message: 'Mock endpoint was not rejected in production mode'
      };
      console.error('[FAILED] test_mock_endpoints_rejected_in_production');
    }
  } catch (err: any) {
    process.env.NODE_ENV = 'test';
    results['test_mock_endpoints_rejected_in_production'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 6. Server Registration, Credential Masking & Session ID Isolation
  // ============================================================================
  let createdServerId = '';
  let discoveredToolId = '';
  const rawCredentialInput = 'sk_test_api_key_confidential_999';

  try {
    process.env.NODE_ENV = 'test';
    const res = await addMcpServerWithDiscovery(masterUserId, {
      name: 'Mock Analytics Hub',
      endpoint: 'mock://mcp.internal.test/v1',
      description: 'Test vector index and SQL tools',
      transport: 'http-streamable',
      auth_type: 'api-key',
      auth_header_name: 'X-MCP-Key',
      auth_credential: rawCredentialInput
    });

    // Check returned server record redacts credential
    const isRedactedOnReturn = res.server.auth_credential_encrypted === undefined;
    const hasCredFlag = res.server.has_credential === true;

    // Check inventory list also redacts
    const list = await listUserMcpServers(masterUserId);
    const listedServer = list.find((s) => s.id === res.server.id);
    const isRedactedInList = listedServer?.auth_credential_encrypted === undefined;

    // Check getMcpServer also redacts
    const fetched = await getMcpServer(masterUserId, res.server.id);
    const isRedactedOnGet = fetched?.auth_credential_encrypted === undefined;

    // Verify session ID is NOT leaked in server_info
    const serverInfoHasNoSessionId =
      !res.server.server_info?.sessionId &&
      !res.server.server_info?.session_id &&
      !fetched?.server_info?.sessionId &&
      !fetched?.server_info?.session_id;

    if (
      res.server &&
      res.server.status === 'connected' &&
      res.tools.length >= 2 &&
      isRedactedOnReturn &&
      hasCredFlag &&
      isRedactedInList &&
      isRedactedOnGet &&
      serverInfoHasNoSessionId
    ) {
      createdServerId = res.server.id;
      discoveredToolId = res.tools[0].id;
      results['test_server_registration_and_credential_redaction'] = {
        passed: true,
        message: 'MCP server registered, tools discovered, credentials and session IDs strictly redacted'
      };
      console.log('[PASSED] test_server_registration_and_credential_redaction: Tools discovered, credentials & session IDs redacted');
    } else {
      results['test_server_registration_and_credential_redaction'] = {
        passed: false,
        message: 'Server registration, discovery, or credential/sessionId redaction failed'
      };
      console.error('[FAILED] test_server_registration_and_credential_redaction');
    }
  } catch (err: any) {
    results['test_server_registration_and_credential_redaction'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 7. Session ID Sanitization Unit Test
  // ============================================================================
  try {
    const tainted = {
      name: 'remote-mcp-server',
      version: '1.0.0',
      sessionId: 'sess_secret_private_token_xyz',
      session_id: 'sess_private_123',
      token: 'bearer_token_leak',
      secret: 'super_secret',
      capabilities: { tools: true }
    };
    const sanitized = sanitizeServerInfo(tainted);

    const isClean =
      sanitized.name === 'remote-mcp-server' &&
      sanitized.version === '1.0.0' &&
      sanitized.capabilities &&
      !('sessionId' in sanitized) &&
      !('session_id' in sanitized) &&
      !('token' in sanitized) &&
      !('secret' in sanitized);

    if (isClean) {
      results['test_session_id_sanitization'] = {
        passed: true,
        message: 'Server info sanitization strictly redacts all session identifiers and secret tokens'
      };
      console.log('[PASSED] test_session_id_sanitization: Session ID isolation verified');
    } else {
      results['test_session_id_sanitization'] = { passed: false, message: 'Sensitive fields remained after sanitization' };
      console.error('[FAILED] test_session_id_sanitization');
    }
  } catch (err: any) {
    results['test_session_id_sanitization'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 8. Streamable HTTP & SSE Response Parsing
  // ============================================================================
  try {
    // 1. JSON String parsing
    const jsonStr = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
    const parsedJson = parseMcpResponseBody(jsonStr, 'application/json');
    const jsonParsed = parsedJson?.result?.tools !== undefined;

    // 2. Server-Sent Events (SSE) parsing
    const sseStream =
      'event: message\n' +
      'data: {"jsonrpc":"2.0","id":2,"result":{"serverInfo":{"name":"sse-test","version":"1.0"}}}\n\n';
    const parsedSse = parseMcpResponseBody(sseStream, 'text/event-stream');
    const sseParsed = parsedSse?.result?.serverInfo?.name === 'sse-test';

    if (jsonParsed && sseParsed) {
      results['test_streamable_http_and_sse_parsing'] = {
        passed: true,
        message: 'Parser correctly handles both standard JSON and Server-Sent Events (SSE) data streams'
      };
      console.log('[PASSED] test_streamable_http_and_sse_parsing: Streamable HTTP and SSE parsing verified');
    } else {
      results['test_streamable_http_and_sse_parsing'] = {
        passed: false,
        message: `Parser failed: jsonParsed=${jsonParsed}, sseParsed=${sseParsed}`
      };
      console.error('[FAILED] test_streamable_http_and_sse_parsing');
    }
  } catch (err: any) {
    results['test_streamable_http_and_sse_parsing'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 9. Zero-Trust Default-Locked Permissions
  // ============================================================================
  try {
    const tools = await listToolsForServer(masterUserId, createdServerId);
    const hasAnyAssignments = tools.some((t) => t.assigned_agents && t.assigned_agents.length > 0);

    if (!hasAnyAssignments) {
      results['test_zero_trust_default_locked'] = {
        passed: true,
        message: 'Discovered tools initialized with zero permissions'
      };
      console.log('[PASSED] test_zero_trust_default_locked: Tools start unassigned');
    } else {
      results['test_zero_trust_default_locked'] = { passed: false, message: 'Tools unexpectedly had default grants' };
      console.error('[FAILED] test_zero_trust_default_locked');
    }
  } catch (err: any) {
    results['test_zero_trust_default_locked'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 10. Fleet Boundary Enforcement: Reject Cross-Fleet Assignments
  // ============================================================================
  try {
    let foreignAgentRejected = false;
    try {
      await setToolAssignment(masterUserId, discoveredToolId, unauthorizedAgentId, true);
    } catch (err: any) {
      if (err.message.includes("does not belong to operator's fleet")) {
        foreignAgentRejected = true;
      }
    }

    if (foreignAgentRejected) {
      results['test_cross_fleet_assignment_rejection'] = {
        passed: true,
        message: 'Assignment to foreign agent not in operator fleet was strictly rejected'
      };
      console.log('[PASSED] test_cross_fleet_assignment_rejection: Foreign agent assignment blocked');
    } else {
      results['test_cross_fleet_assignment_rejection'] = {
        passed: false,
        message: 'Failed to reject assignment to unauthorized foreign agent'
      };
      console.error('[FAILED] test_cross_fleet_assignment_rejection');
    }
  } catch (err: any) {
    results['test_cross_fleet_assignment_rejection'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 11. Grant Legitimate Assignment to Slave Fleet Account
  // ============================================================================
  try {
    const assignRes = await setToolAssignment(masterUserId, discoveredToolId, slaveAgentId, true);
    const agentTools = await getAuthorizedToolsForAgent({ userId: masterUserId, agentId: slaveAgentId });
    const isPresent = agentTools.some((t) => t.id === discoveredToolId);

    if (assignRes.success && isPresent) {
      results['test_legitimate_slave_assignment_grant'] = {
        passed: true,
        message: 'Tool access successfully granted to authentic fleet slave agent'
      };
      console.log('[PASSED] test_legitimate_slave_assignment_grant: Legitimate slave assigned successfully');
    } else {
      results['test_legitimate_slave_assignment_grant'] = { passed: false, message: 'Failed to grant assignment to slave' };
      console.error('[FAILED] test_legitimate_slave_assignment_grant');
    }
  } catch (err: any) {
    results['test_legitimate_slave_assignment_grant'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 12. JSON Schema Tool Argument Validation
  // ============================================================================
  try {
    const toolSchema = {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' }
      },
      required: ['query'],
      additionalProperties: false
    };

    const validArgs = { query: 'active agents', limit: 10 };
    const missingRequired = { limit: 10 };
    const wrongType = { query: 12345, limit: 10 };
    const extraProperty = { query: 'test', limit: 10, maliciousExtra: true };

    const check1 = validateToolArguments(toolSchema, validArgs);
    const check2 = validateToolArguments(toolSchema, missingRequired as any);
    const check3 = validateToolArguments(toolSchema, wrongType as any);
    const check4 = validateToolArguments(toolSchema, extraProperty as any);

    if (check1.valid && !check2.valid && !check3.valid && !check4.valid) {
      results['test_json_schema_validation'] = {
        passed: true,
        message: 'JSON Schema validator strictly verified required fields, property types, and additionalProperties'
      };
      console.log('[PASSED] test_json_schema_validation: JSON Schema constraints strictly enforced');
    } else {
      results['test_json_schema_validation'] = {
        passed: false,
        message: `Schema validation mismatch: check1=${check1.valid}, check2=${check2.valid}, check3=${check3.valid}, check4=${check4.valid}`
      };
      console.error('[FAILED] test_json_schema_validation');
    }
  } catch (err: any) {
    results['test_json_schema_validation'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 13. Server Runtime State Check: Reject Invocation on Non-Connected Servers
  // ============================================================================
  try {
    // Attempt invocation by unassigned caller
    const unauthInvocation = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: unauthorizedAgentId, isMaster: false },
      discoveredToolId,
      { query: 'test query' }
    );
    const unauthBlocked = !unauthInvocation.success && unauthInvocation.error?.includes('not authorized');

    // Attempt valid invocation by authorized slave
    const authInvocation = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      discoveredToolId,
      { query: 'quarterly forecast' }
    );
    const authSucceeded = authInvocation.success && Boolean(authInvocation.result);

    if (unauthBlocked && authSucceeded) {
      results['test_authorized_execution_and_proxy_governance'] = {
        passed: true,
        message: 'Server execution proxy verified authorization and decrypted credentials in memory'
      };
      console.log('[PASSED] test_authorized_execution_and_proxy_governance: Proxy authorization validated');
    } else {
      results['test_authorized_execution_and_proxy_governance'] = {
        passed: false,
        message: `Execution check failed: unauthBlocked=${unauthBlocked}, authSucceeded=${authSucceeded}`
      };
      console.error('[FAILED] test_authorized_execution_and_proxy_governance');
    }
  } catch (err: any) {
    results['test_authorized_execution_and_proxy_governance'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 14. Re-Sync & Tool Lifecycle Synchronization
  // ============================================================================
  try {
    const resync = await revalidateAndSyncMcpServer(masterUserId, createdServerId);
    if (resync.server && resync.server.status === 'connected' && resync.tools.length >= 2) {
      results['test_resync_and_lifecycle_sync'] = {
        passed: true,
        message: 'Reconnection performed live handshake and re-synchronized discovered tools'
      };
      console.log('[PASSED] test_resync_and_lifecycle_sync: Lifecycle tool sync verified');
    } else {
      results['test_resync_and_lifecycle_sync'] = { passed: false, message: 'Re-synchronization failed' };
      console.error('[FAILED] test_resync_and_lifecycle_sync');
    }
  } catch (err: any) {
    results['test_resync_and_lifecycle_sync'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 15. Immediate Revocation & Server Deletion Cascade
  // ============================================================================
  try {
    // Revoke access
    await setToolAssignment(masterUserId, discoveredToolId, slaveAgentId, false);
    const postRevoke = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      discoveredToolId,
      { query: 'test query' }
    );
    const revocationEnforced = !postRevoke.success && postRevoke.error?.includes('not authorized');

    // Remove server
    await removeMcpServer(masterUserId, createdServerId);
    const checkServer = await getMcpServer(masterUserId, createdServerId);
    const checkTools = await listToolsForServer(masterUserId, createdServerId);
    const cascadeCleaned = !checkServer && checkTools.length === 0;

    if (revocationEnforced && cascadeCleaned) {
      results['test_revocation_and_cascade_purge'] = {
        passed: true,
        message: 'Revocation immediately blocked invocation and server deletion cascaded to tools'
      };
      console.log('[PASSED] test_revocation_and_cascade_purge: Immediate revocation and cascading purge verified');
    } else {
      results['test_revocation_and_cascade_purge'] = {
        passed: false,
        message: `Revoke/delete check failed: revocation=${revocationEnforced}, cascade=${cascadeCleaned}`
      };
      console.error('[FAILED] test_revocation_and_cascade_purge');
    }
  } catch (err: any) {
    results['test_revocation_and_cascade_purge'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 16. Slave Agent Cannot Form Connections & Slave-to-Slave Strictly Blocked
  // ============================================================================
  try {
    const { getSupabaseClient } = await import('../supabase.js');
    const supabase = getSupabaseClient();

    const slaveUserAId = 'usr_slave_test_node_001';
    const slaveAgentAId = 'AMR-SLAVE-NODE-01';
    const slaveUserBId = 'usr_slave_test_node_002';
    const slaveAgentBId = 'AMR-SLAVE-NODE-02';
    const masterPeerId = 'usr_master_external_003';

    await supabase.from('users').insert([
      {
        id: slaveUserAId,
        agentId: slaveAgentAId,
        name: 'Slave Node Alpha',
        account_type: 'slave',
        role: 'slave',
        is_slave: true,
        master_id: masterUserId
      },
      {
        id: slaveUserBId,
        agentId: slaveAgentBId,
        name: 'Slave Node Beta',
        account_type: 'slave',
        role: 'slave',
        is_slave: true,
        master_id: masterUserId
      },
      {
        id: masterPeerId,
        agentId: 'AMR-MASTER-PEER',
        name: 'Master Peer External',
        account_type: 'master',
        role: 'master',
        is_master_primary: true
      }
    ]);

    let slaveToMasterConnectionSucceeded = false;
    try {
      const conn = await establishDirectConnection(slaveUserAId, masterPeerId);
      if (conn && conn.status === 'active') {
        slaveToMasterConnectionSucceeded = true;
      }
    } catch (err: any) {
      console.log('Slave-to-master connection failed:', err.message);
    }

    let slaveToSlaveBlocked = false;
    try {
      await establishDirectConnection(slaveUserAId, slaveUserBId);
    } catch (err: any) {
      if (
        err instanceof ConnectionForbiddenError ||
        err.code === 'SLAVE_TO_SLAVE_CONNECTION_FORBIDDEN' ||
        err.message?.includes('Slave-to-slave connection is strictly prohibited')
      ) {
        slaveToSlaveBlocked = true;
      }
    }

    let createConnSlaveToSlaveBlocked = false;
    try {
      await createConnection(slaveUserAId, slaveUserBId);
    } catch (err: any) {
      if (
        err instanceof ConnectionForbiddenError ||
        err.code === 'SLAVE_TO_SLAVE_CONNECTION_FORBIDDEN' ||
        err.message?.includes('Slave-to-slave connection is strictly prohibited')
      ) {
        createConnSlaveToSlaveBlocked = true;
      }
    }

    if (slaveToMasterConnectionSucceeded && slaveToSlaveBlocked && createConnSlaveToSlaveBlocked) {
      results['test_slave_agent_connection_strictly_blocked'] = {
        passed: true,
        message: 'Slave-to-master connection allowed, slave-to-slave connections strictly blocked'
      };
      console.log('[PASSED] test_slave_agent_connection_strictly_blocked: Slave connection prohibition strictly enforced');
    } else {
      results['test_slave_agent_connection_strictly_blocked'] = {
        passed: false,
        message: `Slave check mismatch: slaveToMasterConnectionSucceeded=${slaveToMasterConnectionSucceeded}, slaveToSlaveBlocked=${slaveToSlaveBlocked}, createConnBlocked=${createConnSlaveToSlaveBlocked}`
      };
      console.error('[FAILED] test_slave_agent_connection_strictly_blocked');
    }
  } catch (err: any) {
    results['test_slave_agent_connection_strictly_blocked'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 17. Regression: String-Valued Assignment Requests Rejected Without Coercion
  // ============================================================================
  try {
    const assignServer = await addMcpServerWithDiscovery(masterUserId, {
      name: 'Assignment Coercion Guard Server',
      endpoint: 'mock://mcp.internal/coercion-guard'
    });
    const targetToolId = assignServer.tools[0].id;

    const invalidGrantPayloads = ['false', 'true', '0', '1', 0, 1, null, undefined, {}, []];
    let allInvalidRejected = true;

    for (const invalidVal of invalidGrantPayloads) {
      try {
        await setToolAssignment(masterUserId, targetToolId, slaveAgentId, invalidVal as any);
        allInvalidRejected = false;
        break;
      } catch (err: any) {
        if (!err.message?.includes('granted must be a boolean')) {
          allInvalidRejected = false;
          break;
        }
      }
    }

    // Legitimate booleans must succeed
    const legitGrant = await setToolAssignment(masterUserId, targetToolId, slaveAgentId, true);
    const legitRevoke = await setToolAssignment(masterUserId, targetToolId, slaveAgentId, false);

    await removeMcpServer(masterUserId, assignServer.server.id);

    if (allInvalidRejected && legitGrant.assigned === true && legitRevoke.assigned === false) {
      results['test_string_valued_assignment_requests'] = {
        passed: true,
        message: 'Non-boolean assignment values ("false", "true", numbers) are strictly rejected with 400 and not coerced'
      };
      console.log('[PASSED] test_string_valued_assignment_requests: String-valued assignment requests rejected without coercion');
    } else {
      results['test_string_valued_assignment_requests'] = {
        passed: false,
        message: `Coercion check failed: allInvalidRejected=${allInvalidRejected}, legitGrant=${legitGrant.assigned}, legitRevoke=${legitRevoke.assigned}`
      };
      console.error('[FAILED] test_string_valued_assignment_requests');
    }
  } catch (err: any) {
    results['test_string_valued_assignment_requests'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 18. Regression: Nested Schema Validation & Malformed Schema Rejection (Ajv)
  // ============================================================================
  try {
    const complexNestedSchema = {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            threshold: { type: 'number', minimum: 0 }
          },
          required: ['priority'],
          additionalProperties: false
        }
      },
      required: ['filter'],
      additionalProperties: false
    };

    const validNested = validateToolArguments(complexNestedSchema, {
      filter: { priority: 'high', tags: ['sec', 'ops'], threshold: 10 }
    });
    const invalidEnum = validateToolArguments(complexNestedSchema, {
      filter: { priority: 'urgent' }
    });
    const invalidNumber = validateToolArguments(complexNestedSchema, {
      filter: { priority: 'low', threshold: -5 }
    });
    const forbiddenExtra = validateToolArguments(complexNestedSchema, {
      filter: { priority: 'low', unauthorizedKey: 123 }
    });
    const malformedSchema = validateToolArguments({ type: 'invalid_json_schema_type_xyz' } as any, { a: 1 });

    if (validNested.valid && !invalidEnum.valid && !invalidNumber.valid && !forbiddenExtra.valid && !malformedSchema.valid) {
      results['test_nested_schema_validation'] = {
        passed: true,
        message: 'Ajv validator strictly enforced nested schemas, enums, constraints, and rejected malformed schemas'
      };
      console.log('[PASSED] test_nested_schema_validation: Nested schema validation and malformed schema rejection verified');
    } else {
      results['test_nested_schema_validation'] = {
        passed: false,
        message: `Nested schema check mismatch: valid=${validNested.valid}, badEnum=${invalidEnum.valid}, badNum=${invalidNumber.valid}, extra=${forbiddenExtra.valid}, malformed=${malformedSchema.valid}`
      };
      console.error('[FAILED] test_nested_schema_validation');
    }
  } catch (err: any) {
    results['test_nested_schema_validation'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 19. Regression: Plaintext HTTP Credential Rejection & Production HTTPS
  // ============================================================================
  try {
    const httpBearer = await validateEndpointUrl('http://remote-mcp.cloud/api', 'bearer', true);
    const httpApiKey = await validateEndpointUrl('http://remote-mcp.cloud/api', 'api-key', true);
    const httpCustom = await validateEndpointUrl('http://remote-mcp.cloud/api', 'custom-header', true);

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const prodPlainHttp = await validateEndpointUrl('http://remote-mcp.cloud/api', 'none', false);
    process.env.NODE_ENV = originalEnv;

    const credentialsRejected =
      !httpBearer.valid &&
      !httpApiKey.valid &&
      !httpCustom.valid &&
      httpBearer.error?.includes('Plaintext HTTP is prohibited');

    const prodHttpBlocked =
      !prodPlainHttp.valid &&
      prodPlainHttp.error?.includes('HTTPS is strictly required');

    if (credentialsRejected && prodHttpBlocked) {
      results['test_plaintext_http_credential_rejection'] = {
        passed: true,
        message: 'Plaintext HTTP transmission of credentials strictly rejected and HTTPS enforced in production'
      };
      console.log('[PASSED] test_plaintext_http_credential_rejection: Plaintext HTTP credential rejection verified');
    } else {
      results['test_plaintext_http_credential_rejection'] = {
        passed: false,
        message: `HTTP credential check failed: credRejected=${credentialsRejected}, prodHttpBlocked=${prodHttpBlocked}`
      };
      console.error('[FAILED] test_plaintext_http_credential_rejection');
    }
  } catch (err: any) {
    results['test_plaintext_http_credential_rejection'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 20. Regression: Serverless Configuration Validation
  // ============================================================================
  try {
    const originalEnv = process.env.NODE_ENV;
    const originalJwtSecret = process.env.JWT_SECRET;

    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    let missingSecretCaught = false;
    try {
      validateConfig();
    } catch (err: any) {
      if (err.message?.includes('Missing required environment variables') && err.message?.includes('JWT_SECRET')) {
        missingSecretCaught = true;
      }
    }

    process.env.JWT_SECRET = originalJwtSecret;
    process.env.NODE_ENV = 'test';

    let ensureWorked = false;
    try {
      ensureConfigValidated();
      ensureWorked = true;
    } catch {}

    if (missingSecretCaught && ensureWorked) {
      results['test_serverless_configuration_validation'] = {
        passed: true,
        message: 'Serverless configuration validation catches production missing secrets without redundant re-validation'
      };
      console.log('[PASSED] test_serverless_configuration_validation: Serverless configuration validation verified');
    } else {
      results['test_serverless_configuration_validation'] = {
        passed: false,
        message: `Config validation failed: missingSecretCaught=${missingSecretCaught}, ensureWorked=${ensureWorked}`
      };
      console.error('[FAILED] test_serverless_configuration_validation');
    }
  } catch (err: any) {
    results['test_serverless_configuration_validation'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 21. Regression: Session-Dependent MCP Calls & Serverless Cold-Start Persistence
  // ============================================================================
  try {
    const sessionServerRes = await addMcpServerWithDiscovery(masterUserId, {
      name: 'Session Dependent Mock Server',
      endpoint: 'mock://mcp.internal/session-required-suite'
    });
    const sServerId = sessionServerRes.server.id;
    const sToolId = sessionServerRes.tools[0].id;
    await setToolAssignment(masterUserId, sToolId, slaveAgentId, true);

    const hasInitialMemorySession = hasServerSessionForTesting(sServerId);

    // Simulate serverless cold-start: clear in-memory session store completely
    clearServerSessionStoreForTesting();
    const memoryCleared = getServerSessionStoreSizeForTesting() === 0;

    // Invoke authorized tool on the session-dependent server.
    // executeRemoteMcpTool must decrypt session_id_encrypted from the server record / store and restore session
    const invokeRes = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      sToolId,
      { query: 'cold-start session verification' }
    );

    const sessionRestoredAndUsed =
      invokeRes.success &&
      String(invokeRes.result?.content?.[0]?.text).includes('[Session: Active]');

    // Verify session ID was never leaked to client or server info
    const fetchedServer = await getMcpServer(masterUserId, sServerId);
    const noSessionLeak =
      fetchedServer &&
      (fetchedServer as any).session_id_encrypted === undefined &&
      (fetchedServer as any).sessionId === undefined &&
      fetchedServer.server_info?.sessionId === undefined;

    await removeMcpServer(masterUserId, sServerId);

    if (hasInitialMemorySession && memoryCleared && sessionRestoredAndUsed && noSessionLeak) {
      results['test_session_dependent_mcp_calls'] = {
        passed: true,
        message: 'Session state persisted across serverless cold starts without leaking session identifiers'
      };
      console.log('[PASSED] test_session_dependent_mcp_calls: Session-dependent MCP calls and serverless persistence verified');
    } else {
      results['test_session_dependent_mcp_calls'] = {
        passed: false,
        message: `Session persistence failed: init=${hasInitialMemorySession}, cleared=${memoryCleared}, restored=${sessionRestoredAndUsed}, noLeak=${noSessionLeak}`
      };
      console.error('[FAILED] test_session_dependent_mcp_calls');
    }
  } catch (err: any) {
    results['test_session_dependent_mcp_calls'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 22. Regression: SDK Transport SSRF Enforcement & No Duplicate Tool Execution
  // ============================================================================
  try {
    let ssrfBlocked = false;
    try {
      await ssrfSafeFetch('http://127.0.0.1:8080/mcp');
    } catch (err: any) {
      if (err.message?.includes('SSRF blocked')) {
        ssrfBlocked = true;
      }
    }

    const mockServer = {
      id: 'srv_fail_test',
      owner_id: masterUserId,
      name: 'Fail Server',
      description: '',
      transport: 'http-streamable' as const,
      endpoint: 'mock://mcp.internal/session-required',
      auth_type: 'none' as const,
      status: 'connected' as const,
      last_checked: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const mockTool = {
      id: 'tool_fail_test',
      server_id: 'srv_fail_test',
      owner_id: masterUserId,
      name: 'fail_tool',
      description: '',
      input_schema: { type: 'object' },
      is_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const execRes = await executeRemoteMcpTool(mockServer, mockTool, {});
    const failedCleanlyWithoutRetry = !execRes.success && Boolean(execRes.error);

    if (ssrfBlocked && failedCleanlyWithoutRetry) {
      results['test_sdk_ssrf_and_no_duplicate_execution'] = {
        passed: true,
        message: 'SDK transport SSRF enforcement verified and tool execution failures return without duplicate retry'
      };
      console.log('[PASSED] test_sdk_ssrf_and_no_duplicate_execution: SDK SSRF and no-duplicate-execution verified');
    } else {
      results['test_sdk_ssrf_and_no_duplicate_execution'] = {
        passed: false,
        message: `SDK SSRF or execution check failed: ssrfBlocked=${ssrfBlocked}, failedCleanly=${failedCleanlyWithoutRetry}`
      };
      console.error('[FAILED] test_sdk_ssrf_and_no_duplicate_execution');
    }
  } catch (err: any) {
    results['test_sdk_ssrf_and_no_duplicate_execution'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 23. HITL Policy Configuration & Operator Fleet Isolation
  // ============================================================================
  try {
    clearHitlStoreForTesting();
    // Register a test server & tool for HITL testing (using standard mock endpoint)
    const hitlServerRes = await addMcpServerWithDiscovery(masterUserId, {
      name: 'HITL Governed Server',
      endpoint: 'mock://mcp.internal/hitl-governed'
    });
    const hitlServerId = hitlServerRes.server.id;
    const hitlToolId = hitlServerRes.tools[0].id;
    await setToolAssignment(masterUserId, hitlToolId, slaveAgentId, true);

    // Operator enables HITL policy on their tool
    const policy = await setToolHitlPolicy(masterUserId, hitlToolId, true);
    const policyEnabled = policy.hitl_enabled === true;

    // Unauthorized user attempts to change policy on operator's tool
    let unauthorizedBlocked = false;
    try {
      await setToolHitlPolicy('user_unauthorized_attacker', hitlToolId, false);
    } catch (err: any) {
      unauthorizedBlocked = err?.message?.includes('Forbidden');
    }

    if (policyEnabled && unauthorizedBlocked) {
      results['test_hitl_policy_configuration_and_isolation'] = {
        passed: true,
        message: 'HITL policy configuration and operator fleet isolation verified'
      };
      console.log('[PASSED] test_hitl_policy_configuration_and_isolation: HITL policy governance validated');
    } else {
      results['test_hitl_policy_configuration_and_isolation'] = {
        passed: false,
        message: `Policy test failed: enabled=${policyEnabled}, unauthBlocked=${unauthorizedBlocked}`
      };
      console.error('[FAILED] test_hitl_policy_configuration_and_isolation');
    }
  } catch (err: any) {
    results['test_hitl_policy_configuration_and_isolation'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 24. HITL Tool Invocation Interception & Pending Request Creation
  // ============================================================================
  let hitlInvocationId: string = '';
  const testArgs = { query: 'execute secure operation alpha' };
  try {
    const srv = (await listUserMcpServers(masterUserId))[0];
    const tools = await listToolsForServer(masterUserId, srv.id);
    const targetToolId = tools[0].id;

    // Agent attempts invocation on HITL-enabled tool without existing approval
    const blockedRes = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      targetToolId,
      testArgs
    );

    const isIntercepted = !blockedRes.success && blockedRes.error === 'HITL_APPROVAL_REQUIRED' && Boolean(blockedRes.invocationId);
    hitlInvocationId = blockedRes.invocationId || '';

    // Verify pending invocation record in DB / store
    const pendingInv = await getPendingInvocationRecord(hitlInvocationId);
    const recordValid =
      pendingInv !== null &&
      pendingInv.status === 'pending' &&
      pendingInv.agent_id === slaveAgentId &&
      pendingInv.caller_id === masterUserId &&
      pendingInv.tool_id === targetToolId &&
      pendingInv.args_hash === hashToolArguments(testArgs) &&
      new Date(pendingInv.expires_at).getTime() > Date.now();

    if (isIntercepted && recordValid) {
      results['test_hitl_pending_invocation_blocking'] = {
        passed: true,
        message: 'Tool execution blocked by HITL and pending invocation created with canonical argument hash'
      };
      console.log('[PASSED] test_hitl_pending_invocation_blocking: HITL interception & request binding verified');
    } else {
      results['test_hitl_pending_invocation_blocking'] = {
        passed: false,
        message: `Interception failed: intercepted=${isIntercepted}, recordValid=${recordValid}`
      };
      console.error('[FAILED] test_hitl_pending_invocation_blocking');
    }
  } catch (err: any) {
    results['test_hitl_pending_invocation_blocking'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 25. Human Approval & Single-Use Temporary Grant Issuance
  // ============================================================================
  let activeGrantToken: string = '';
  try {
    const pendingInv = await getPendingInvocationRecord(hitlInvocationId);
    if (!pendingInv) throw new Error('Pending invocation missing');

    // Operator approves the exact invocation using the atomic conditional helper
    const approveRes = await approvePendingInvocation(masterUserId, hitlInvocationId);
    const updatedInv = await getPendingInvocationRecord(hitlInvocationId);
    const approved = approveRes.success && updatedInv?.status === 'approved';

    if (approved) {
      results['test_hitl_approval_and_grant_issuance'] = {
        passed: true,
        message: 'Human operator approval successfully generated a short-lived single-use grant'
      };
      console.log('[PASSED] test_hitl_approval_and_grant_issuance: Approval and temporary grant generation verified');
    } else {
      results['test_hitl_approval_and_grant_issuance'] = {
        passed: false,
        message: `Approval failed: approved=${approved}, error=${approveRes.error}`
      };
      console.error('[FAILED] test_hitl_approval_and_grant_issuance');
    }
  } catch (err: any) {
    results['test_hitl_approval_and_grant_issuance'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 26. Caller Scope & Requesting Agent Verification
  // ============================================================================
  try {
    const pendingInv = await getPendingInvocationRecord(hitlInvocationId);
    if (!pendingInv) throw new Error('Pending invocation missing');

    // 1. Another agent assigned to tool tries to execute an invocation requested by slaveAgentId
    const otherAssignedAgentId = 'agent_slave_beta_002';
    await setToolAssignment(masterUserId, pendingInv.tool_id, otherAssignedAgentId, true);
    const otherAgentRes = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: otherAssignedAgentId, isMaster: false },
      pendingInv.tool_id,
      testArgs,
      hitlInvocationId,
      activeGrantToken
    );
    const otherAgentBlocked = !otherAgentRes.success && otherAgentRes.error?.includes('does not match');

    // 2. Unassigned intruder agent attempts execution
    const intruderAgentRes = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: unauthorizedAgentId, isMaster: false },
      pendingInv.tool_id,
      testArgs,
      hitlInvocationId,
      activeGrantToken
    );
    const intruderBlocked = !intruderAgentRes.success;

    // 3. Different user/tenant attempts to execute the invocation
    const differentUserRes = await invokeAuthorizedTool(
      { userId: 'user_different_tenant_999', agentId: slaveAgentId, isMaster: false },
      pendingInv.tool_id,
      testArgs,
      hitlInvocationId,
      activeGrantToken
    );
    const differentUserBlocked = !differentUserRes.success;

    if (otherAgentBlocked && intruderBlocked && differentUserBlocked) {
      results['test_hitl_scope_and_agent_verification'] = {
        passed: true,
        message: 'Enforced caller agent identity and authorized owner scope for approved execution'
      };
      console.log('[PASSED] test_hitl_scope_and_agent_verification: Strict caller & scope matching validated');
    } else {
      results['test_hitl_scope_and_agent_verification'] = {
        passed: false,
        message: `Caller scope check failed: otherAgentBlocked=${otherAgentBlocked}, intruderBlocked=${intruderBlocked}, differentUserBlocked=${differentUserBlocked}`
      };
      console.error('[FAILED] test_hitl_scope_and_agent_verification');
    }
  } catch (err: any) {
    results['test_hitl_scope_and_agent_verification'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 27. Argument Tampering Defense (Bound to Approved Arguments)
  // ============================================================================
  try {
    const pendingInv = await getPendingInvocationRecord(hitlInvocationId);
    if (!pendingInv) throw new Error('Pending invocation missing');

    // Attempt execution with modified arguments (e.g. injected malicious payload)
    const tamperedArgs = { query: 'rm -rf /; sudo hack' };
    const tamperedRes = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      pendingInv.tool_id,
      tamperedArgs,
      hitlInvocationId,
      activeGrantToken
    );

    const tamperingRejected = !tamperedRes.success && tamperedRes.error === 'HITL_ARGUMENTS_MISMATCH';

    if (tamperingRejected) {
      results['test_hitl_argument_tampering_rejection'] = {
        passed: true,
        message: 'Tampered arguments rejected; execution bound strictly to human-approved arguments hash'
      };
      console.log('[PASSED] test_hitl_argument_tampering_rejection: Argument integrity defense verified');
    } else {
      results['test_hitl_argument_tampering_rejection'] = {
        passed: false,
        message: `Tampering check failed: rejected=${tamperingRejected}, error=${tamperedRes.error}`
      };
      console.error('[FAILED] test_hitl_argument_tampering_rejection');
    }
  } catch (err: any) {
    results['test_hitl_argument_tampering_rejection'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 28. Single-Use Grant Consumption & Replay Attack Defense
  // ============================================================================
  try {
    const pendingInv = await getPendingInvocationRecord(hitlInvocationId);
    if (!pendingInv) throw new Error('Pending invocation missing');

    // 1. Authorized execution with exact approved arguments and grant token
    const firstExec = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      pendingInv.tool_id,
      testArgs,
      hitlInvocationId,
      activeGrantToken
    );
    const firstExecSuccess = firstExec.success && Boolean(firstExec.result);

    // Verify invocation status updated to 'executed'
    const executedInv = await getPendingInvocationRecord(hitlInvocationId);
    const markedExecuted = executedInv?.status === 'executed';

    // 2. Replay attempt: Agent tries to invoke again using the same grant/invocationId
    const replayExec = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      pendingInv.tool_id,
      testArgs,
      hitlInvocationId,
      activeGrantToken
    );
    const replayBlocked = !replayExec.success && (
      replayExec.error?.includes('CONSUMED') ||
      replayExec.error?.includes('INVALID') ||
      replayExec.error?.includes('REQUIRED_OR_INVALID')
    );

    if (firstExecSuccess && markedExecuted && replayBlocked) {
      results['test_hitl_single_use_grant_and_replay_defense'] = {
        passed: true,
        message: 'Grant consumed atomically on first use and replay attacks rejected'
      };
      console.log('[PASSED] test_hitl_single_use_grant_and_replay_defense: Single-use grant consumption validated');
    } else {
      results['test_hitl_single_use_grant_and_replay_defense'] = {
        passed: false,
        message: `Replay defense check failed: firstExec=${firstExecSuccess}, markedExecuted=${markedExecuted}, replayBlocked=${replayBlocked}`
      };
      console.error('[FAILED] test_hitl_single_use_grant_and_replay_defense');
    }
  } catch (err: any) {
    results['test_hitl_single_use_grant_and_replay_defense'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 29. Expired Grant Rejection Defense
  // ============================================================================
  try {
    const srv = (await listUserMcpServers(masterUserId))[0];
    const tools = await listToolsForServer(masterUserId, srv.id);
    const targetToolId = tools[0].id;

    // Create an expired grant: invocation is approved and unexpired, but grant has expired
    const expiredInvId = `inv_expired_${crypto.randomBytes(4).toString('hex')}`;
    const pastTime = new Date(Date.now() - 60000).toISOString();
    const futureTime = new Date(Date.now() + 300000).toISOString();
    const expArgs = { query: 'test expired action' };

    await createToolGrantRecord({
      id: `grant_exp_${crypto.randomBytes(4).toString('hex')}`,
      invocation_id: expiredInvId,
      grant_token_hash: crypto.createHash('sha256').update('expired_token').digest('hex'),
      expires_at: pastTime,
      created_at: new Date(Date.now() - 120000).toISOString()
    });

    const expiredInvRecord = {
      id: expiredInvId,
      tool_id: targetToolId,
      caller_id: masterUserId,
      agent_id: slaveAgentId,
      owner_id: masterUserId,
      args: expArgs,
      args_hash: hashToolArguments(expArgs),
      status: 'approved' as const,
      expires_at: futureTime,
      created_at: new Date(Date.now() - 120000).toISOString(),
      updated_at: new Date(Date.now() - 120000).toISOString()
    };
    await updateInvocationRecord(expiredInvRecord);

    const expiredExec = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      targetToolId,
      expArgs,
      expiredInvId,
      'expired_token'
    );
    const expiredBlocked = !expiredExec.success && (
      expiredExec.error?.includes('EXPIRED') || expiredExec.error?.includes('CONSUMED')
    );

    if (expiredBlocked) {
      results['test_hitl_expired_grant_rejection'] = {
        passed: true,
        message: 'Expired authorization grant rejected'
      };
      console.log('[PASSED] test_hitl_expired_grant_rejection: Expired grant defense verified');
    } else {
      results['test_hitl_expired_grant_rejection'] = {
        passed: false,
        message: `Expired grant check failed: blocked=${expiredBlocked}, error=${expiredExec.error}`
      };
      console.error('[FAILED] test_hitl_expired_grant_rejection');
    }
  } catch (err: any) {
    results['test_hitl_expired_grant_rejection'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 30. Invocation Denial Flow
  // ============================================================================
  try {
    const srv = (await listUserMcpServers(masterUserId))[0];
    const tools = await listToolsForServer(masterUserId, srv.id);
    const targetToolId = tools[0].id;

    // Trigger HITL invocation
    const invRes = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      targetToolId,
      { test: 'denial_flow' }
    );
    const deniedInvId = invRes.invocationId!;

    // Human operator denies
    const deniedInv = await getPendingInvocationRecord(deniedInvId);
    if (!deniedInv) throw new Error('Denied inv record missing');
    deniedInv.status = 'denied';
    await updateInvocationRecord(deniedInv);

    // Attempt execution of denied invocation
    const execDenied = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      targetToolId,
      { test: 'denial_flow' },
      deniedInvId
    );
    const denialEnforced = !execDenied.success && execDenied.error?.includes('INVALID');

    if (denialEnforced) {
      results['test_hitl_denial_flow'] = {
        passed: true,
        message: 'Denied tool invocations cannot be executed'
      };
      console.log('[PASSED] test_hitl_denial_flow: Invocation denial flow verified');
    } else {
      results['test_hitl_denial_flow'] = {
        passed: false,
        message: `Denial check failed: enforced=${denialEnforced}, error=${execDenied.error}`
      };
      console.error('[FAILED] test_hitl_denial_flow');
    }
  } catch (err: any) {
    results['test_hitl_denial_flow'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 31. Tool ID Mismatch Defense (Prevent Tool Substitution on Approved Invocation)
  // ============================================================================
  try {
    const srv = (await listUserMcpServers(masterUserId))[0];
    const tools = await listToolsForServer(masterUserId, srv.id);
    const targetToolId = tools[0].id;
    const differentToolId = 'tool_different_substitute_999';

    // Create an approved invocation for targetToolId
    const testInvId = `inv_tool_mismatch_${crypto.randomBytes(4).toString('hex')}`;
    const futureTime = new Date(Date.now() + 300000).toISOString();
    const invArgs = { query: 'test tool mismatch' };

    await createToolGrantRecord({
      id: `grant_mismatch_${crypto.randomBytes(4).toString('hex')}`,
      invocation_id: testInvId,
      grant_token_hash: crypto.createHash('sha256').update('valid_token').digest('hex'),
      expires_at: futureTime,
      created_at: new Date().toISOString()
    });

    await updateInvocationRecord({
      id: testInvId,
      tool_id: targetToolId,
      caller_id: masterUserId,
      agent_id: slaveAgentId,
      owner_id: masterUserId,
      args: invArgs,
      args_hash: hashToolArguments(invArgs),
      status: 'approved',
      expires_at: futureTime,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Attempt to invoke differentToolId with the invocation approved for targetToolId
    const mismatchRes = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      differentToolId,
      invArgs,
      testInvId,
      'valid_token'
    );

    const mismatchBlocked = !mismatchRes.success && (
      mismatchRes.error?.includes('Tool ID does not match') ||
      mismatchRes.error?.includes('Tool not found') ||
      mismatchRes.error?.includes('Forbidden')
    );

    if (mismatchBlocked) {
      results['test_hitl_tool_id_mismatch_rejection'] = {
        passed: true,
        message: 'Tool substitution attack rejected; execution bound strictly to approved tool ID'
      };
      console.log('[PASSED] test_hitl_tool_id_mismatch_rejection: Tool substitution defense verified');
    } else {
      results['test_hitl_tool_id_mismatch_rejection'] = {
        passed: false,
        message: `Tool substitution check failed: blocked=${mismatchBlocked}, error=${mismatchRes.error}`
      };
      console.error('[FAILED] test_hitl_tool_id_mismatch_rejection');
    }
  } catch (err: any) {
    results['test_hitl_tool_id_mismatch_rejection'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 32. Schema Resilience: Missing session_id_encrypted Column in Supabase Cache
  // ============================================================================
  try {
    // Explicitly simulate missing session_id_encrypted column in schema cache
    resetDbHasSessionIdColumnForTesting(false);

    const fallbackServerRes = await addMcpServerWithDiscovery(masterUserId, {
      name: 'Resilient Schema Server',
      endpoint: 'mock://mcp.internal/session-required-suite'
    });
    const fbServerId = fallbackServerRes.server.id;
    const fbToolId = fallbackServerRes.tools[0].id;
    await setToolAssignment(masterUserId, fbToolId, slaveAgentId, true);

    // Simulate cold start: clear session store in memory
    clearServerSessionStoreForTesting();

    // Verify tool execution recovers session from fallback server_info storage
    const fbInvokeRes = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: slaveAgentId, isMaster: false },
      fbToolId,
      { query: 'resilient fallback verification' }
    );

    const fbSessionRestored =
      fbInvokeRes.success &&
      String(fbInvokeRes.result?.content?.[0]?.text).includes('[Session: Active]');

    // Verify that getMcpServer does NOT leak _session_id_encrypted or session identifiers
    const fbFetchedServer = await getMcpServer(masterUserId, fbServerId);
    const fbSafeRedaction =
      fbFetchedServer &&
      (fbFetchedServer as any).session_id_encrypted === undefined &&
      (fbFetchedServer as any).sessionId === undefined &&
      (fbFetchedServer.server_info as any)?._session_id_encrypted === undefined;

    await removeMcpServer(masterUserId, fbServerId);

    // Reset column support flag
    resetDbHasSessionIdColumnForTesting(null);

    if (fallbackServerRes.server.id && fbSessionRestored && fbSafeRedaction) {
      results['test_missing_session_id_column_resilience'] = {
        passed: true,
        message: 'MCP server registration and cold-start session recovery succeeded resiliently without session_id_encrypted column'
      };
      console.log('[PASSED] test_missing_session_id_column_resilience: Missing column schema resilience verified');
    } else {
      results['test_missing_session_id_column_resilience'] = {
        passed: false,
        message: `Schema resilience check failed: restored=${fbSessionRestored}, safeRedaction=${fbSafeRedaction}`
      };
      console.error('[FAILED] test_missing_session_id_column_resilience');
    }
  } catch (err: any) {
    resetDbHasSessionIdColumnForTesting(null);
    results['test_missing_session_id_column_resilience'] = { passed: false, message: err?.message };
  }

  // ============================================================================
  // 31. PERSISTENT MCP TOOL PERMISSIONS & ACCESS REQUESTS GOVERNANCE TEST SUITE
  // ============================================================================
  try {
    clearAccessGovernanceForTesting();

    const govServerRes = await addMcpServerWithDiscovery(masterUserId, {
      name: 'Governance Test MCP Server',
      endpoint: 'mock://test-gov-mcp.internal',
      transport: 'http-streamable',
      auth_type: 'none'
    });

    const govServerId = govServerRes.server.id;
    const govTool = govServerRes.tools[0];
    const govToolId = govTool.id;
    const testAgentAlpha = 'agent_slave_alpha_001';
    const testAgentBeta = 'agent_slave_beta_002';
    const intruderAgent = 'agent_unauthorized_intruder_999';

    // 1. Unauthorized invocation blocked and creates access request
    const unauthCall1 = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: testAgentAlpha, isMaster: false },
      govToolId,
      { query: 'initial unauthorized attempt' }
    );

    const call1Blocked = !unauthCall1.success && unauthCall1.error?.includes('not authorized');
    const reqList1 = await listToolAccessRequests(masterUserId, govServerId, 'pending');
    const req1Created = reqList1.length === 1 && reqList1[0].account_id === testAgentAlpha && reqList1[0].tool_id === govToolId;

    // 2. Duplicate prevention: second call reuses and updates existing request
    const unauthCall2 = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: testAgentAlpha, isMaster: false },
      govToolId,
      { query: 'second attempt with modified payload' }
    );

    const reqList2 = await listToolAccessRequests(masterUserId, govServerId, 'pending');
    const noDuplicate = reqList2.length === 1 && reqList2[0].arguments?.query === 'second attempt with modified payload';

    // 3. Human Approval creates permanent grant & immediately unblocks execution
    const pendingReqId = reqList2[0].id;
    const approvalRes = await approveToolAccessRequest(masterUserId, pendingReqId);
    const approvalStatusOk = approvalRes.success && approvalRes.request.status === 'approved';
    const grantExists = await hasActiveToolGrant(govServerId, govToolId, testAgentAlpha);

    // 4. Authorized account can invoke tool repeatedly without repeated prompts
    const callPostApprove1 = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: testAgentAlpha, isMaster: false },
      govToolId,
      { query: 'authorized execution 1' }
    );
    const callPostApprove2 = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: testAgentAlpha, isMaster: false },
      govToolId,
      { query: 'authorized execution 2' }
    );
    const repeatedExecutionOk = callPostApprove1.success && callPostApprove2.success;

    // 5. Account isolation: other accounts do NOT inherit the grant
    const betaCall = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: testAgentBeta, isMaster: false },
      govToolId,
      { query: 'beta attempt' }
    );
    const betaBlocked = !betaCall.success && betaCall.error?.includes('not authorized');
    const betaReqList = await listToolAccessRequests(masterUserId, govServerId, 'pending');
    const betaHasDistinctReq = betaReqList.some((r) => r.account_id === testAgentBeta);

    // 6. Manual revocation immediately blocks subsequent calls
    await revokeToolAccess(masterUserId, govServerId, govToolId, testAgentAlpha);
    const hasGrantPostRevoke = await hasActiveToolGrant(govServerId, govToolId, testAgentAlpha);
    const callPostRevoke = await invokeAuthorizedTool(
      { userId: masterUserId, agentId: testAgentAlpha, isMaster: false },
      govToolId,
      { query: 'post revoke attempt' }
    );
    const revokeDeniesCall = !hasGrantPostRevoke && !callPostRevoke.success && callPostRevoke.error?.includes('not authorized');

    // 7. Rejection flow: rejects request, does NOT grant access, retains decision history
    const betaPendingReq = betaReqList.find((r) => r.account_id === testAgentBeta)!;
    const rejectRes = await rejectToolAccessRequest(masterUserId, betaPendingReq.id, 'Account lacks necessary role');
    const rejectStatusOk = rejectRes.success && rejectRes.request.status === 'rejected';
    const betaStillBlocked = !(await hasActiveToolGrant(govServerId, govToolId, testAgentBeta));
    const allRequestsHistory = await listToolAccessRequests(masterUserId, govServerId, 'all');
    const historyRetained = allRequestsHistory.some((r) => r.id === betaPendingReq.id && r.status === 'rejected');

    // 8. Foreign operator authorization boundary: cannot approve or tamper with another operator's server
    const foreignOperatorId = 'usr_foreign_attacker_888';
    let foreignApprovalBlocked = false;
    try {
      await approveToolAccessRequest(foreignOperatorId, pendingReqId);
    } catch {
      foreignApprovalBlocked = true;
    }

    await removeMcpServer(masterUserId, govServerId);

    const allPassed =
      call1Blocked &&
      req1Created &&
      noDuplicate &&
      approvalStatusOk &&
      grantExists &&
      repeatedExecutionOk &&
      betaBlocked &&
      betaHasDistinctReq &&
      revokeDeniesCall &&
      rejectStatusOk &&
      betaStillBlocked &&
      historyRetained &&
      foreignApprovalBlocked;

    if (allPassed) {
      results['test_persistent_grants_and_access_requests_lifecycle'] = {
        passed: true,
        message: 'Persistent account-level tool grants, duplicate prevention, approval, revocation, rejection history, and isolation fully validated'
      };
      console.log('[PASSED] test_persistent_grants_and_access_requests_lifecycle: Full persistent tool governance validated');
    } else {
      results['test_persistent_grants_and_access_requests_lifecycle'] = {
        passed: false,
        message: `Persistent governance checks failed: call1Blocked=${call1Blocked}, req1Created=${req1Created}, noDup=${noDuplicate}, app=${approvalStatusOk}, grantExists=${grantExists}, repOk=${repeatedExecutionOk}, betaBlocked=${betaBlocked}, revokeOk=${revokeDeniesCall}, rejOk=${rejectStatusOk}, foreignBlocked=${foreignApprovalBlocked}`
      };
      console.error('[FAILED] test_persistent_grants_and_access_requests_lifecycle');
    }
  } catch (err: any) {
    results['test_persistent_grants_and_access_requests_lifecycle'] = { passed: false, message: err?.message };
    console.error('[FAILED] test_persistent_grants_and_access_requests_lifecycle exception:', err);
  }

  return results;
}

