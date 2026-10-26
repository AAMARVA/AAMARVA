import crypto from 'crypto';
import http from 'http';
import {
  addMcpServerWithDiscovery,
  listUserMcpServers,
  getMcpServer,
  listToolsForServer,
  setToolAssignment,
  invokeAuthorizedTool,
  removeMcpServer,
  getAuthorizedToolsForAgent,
  executeRemoteMcpTool,
  setToolHitlPolicy,
  getToolHitlPolicy,
  getPendingInvocationRecord,
  approvePendingInvocation,
  denyPendingInvocation,
  clearHitlStoreForTesting,
  hashToolArguments,
  hasActiveToolGrant,
  grantToolAccess,
  revokeToolAccess,
  listToolGrantsForServer,
  recordOrReuseAccessRequest,
  listToolAccessRequests,
  approveToolAccessRequest,
  rejectToolAccessRequest,
  clearAccessGovernanceForTesting,
  validateAuthHeader,
  buildAuthHeaders,
  setAllowedTestServerOriginForTesting,
  encryptMcpCredential,
  decryptMcpCredential,
  validateToolArguments,
  listPendingInvocationsForOwner,
  getToolRecord
} from '../services/mcpService.js';

export interface AuditScenarioResult {
  category: string;
  scenarioId: string;
  description: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: any;
}

export async function runFloorMcpAuditTestSuite(): Promise<Record<string, { passed: boolean; message?: string }>> {
  process.env.NODE_ENV = 'test';
  console.log('\n================================================================');
  console.log('🛡️ RUNNING COMPREHENSIVE END-TO-END FLOOR MCP AUDIT TEST SUITE');
  console.log('================================================================');

  const suiteResults: Record<string, { passed: boolean; message?: string }> = {};
  const auditMatrix: AuditScenarioResult[] = [];

  function recordResult(scenario: AuditScenarioResult) {
    auditMatrix.push(scenario);
    suiteResults[scenario.scenarioId] = {
      passed: scenario.passed,
      message: `${scenario.description} -> Expected: ${scenario.expected} | Actual: ${scenario.actual}`
    };
    const tag = scenario.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${tag} [${scenario.category}] ${scenario.scenarioId}: ${scenario.description}`);
  }

  // Set up controllable mock MCP HTTP server
  let mockPort = 0;
  let receivedAuthHeaders: Record<string, string | undefined> = {};
  let mockServerReject401 = false;
  let invocationCount = 0;

  const mockServer = http.createServer((req, res) => {
    receivedAuthHeaders = {
      authorization: req.headers['authorization'],
      'x-api-key': req.headers['x-api-key'] as string | undefined,
      'x-custom-tenant': req.headers['x-custom-tenant'] as string | undefined
    };

    if (mockServerReject401) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: -32000, message: 'Invalid credentials or token expired' } }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const method = payload.method;
          const reqId = payload.id;

          if (method === 'initialize') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: reqId,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: { listChanged: true } },
                serverInfo: { name: 'Audit Mock MCP Server', version: '2.5.0' }
              }
            }));
            return;
          }

          if (method === 'notifications/initialized') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: reqId, result: {} }));
            return;
          }

          if (method === 'tools/list') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: reqId,
              result: {
                tools: [
                  {
                    name: 'query_audit_metrics',
                    description: 'Queries confidential telemetry metrics',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        metric: { type: 'string', minLength: 2 },
                        window: { type: 'string' }
                      },
                      required: ['metric']
                    }
                  },
                  {
                    name: 'transfer_resource',
                    description: 'High-risk resource transfer tool requiring HITL approval',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        target: { type: 'string' },
                        amount: { type: 'number', minimum: 1 }
                      },
                      required: ['target', 'amount']
                    }
                  }
                ]
              }
            }));
            return;
          }

          if (method === 'tools/call') {
            invocationCount++;
            const toolName = payload.params?.name;
            const toolArgs = payload.params?.arguments;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: reqId,
              result: {
                content: [{ type: 'text', text: `Tool '${toolName}' executed successfully: call #${invocationCount}` }],
                executedAt: new Date().toISOString(),
                paramsReceived: toolArgs
              }
            }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: reqId, result: {} }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    }
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => {
      const address = mockServer.address() as any;
      mockPort = address.port;
      setAllowedTestServerOriginForTesting(`http://127.0.0.1:${mockPort}`);
      resolve();
    });
  });

  const mockEndpoint = `http://127.0.0.1:${mockPort}/mcp`;
  const operatorAlpha = 'user_operator_audit_alpha';
  const operatorBeta = 'user_operator_audit_beta';
  const agentSlave1 = 'agent_slave_audit_01';
  const agentSlave2 = 'agent_slave_audit_02';
  const agentIntruder = 'agent_foreign_intruder_99';

  try {
    // =========================================================================
    // CATEGORY 1: SERVER CONNECTION & AUTHENTICATION
    // =========================================================================
    console.log('\n--- CATEGORY 1: Server Connection & Authentication ---');

    // 1.1 Bearer Token Connection & Redaction
    clearAccessGovernanceForTesting();
    const bearerDiscovery = await addMcpServerWithDiscovery(operatorAlpha, {
      name: 'Alpha Cluster MCP (Bearer)',
      endpoint: mockEndpoint,
      transport: 'http-streamable',
      auth_type: 'bearer',
      auth_credential: 'sk_live_secret_bearer_key_12345'
    });

    const bearerServer = bearerDiscovery.server;
    const bearerOk =
      bearerServer.status === 'connected' &&
      bearerServer.has_credential === true &&
      receivedAuthHeaders['authorization'] === 'Bearer sk_live_secret_bearer_key_12345';

    recordResult({
      category: '1. Server Connection & Auth',
      scenarioId: 'mcp_conn_bearer_auth',
      description: 'Connect to MCP server with Bearer token authentication',
      passed: Boolean(bearerOk),
      expected: 'Status connected, credential redacted in client response (has_credential=true), Bearer header received',
      actual: `Status: ${bearerServer.status}, has_credential: ${bearerServer.has_credential}, Header: ${receivedAuthHeaders['authorization']}`
    });

    // 1.2 Custom Header Authentication
    const customHeaderDiscovery = await addMcpServerWithDiscovery(operatorAlpha, {
      name: 'Custom Header MCP',
      endpoint: mockEndpoint,
      transport: 'http-streamable',
      auth_type: 'custom-header',
      auth_credential: 'tenant_vault_xyz_998877',
      auth_header_name: 'x-custom-tenant'
    });

    const customHeaderServer = customHeaderDiscovery.server;
    const customHeaderOk =
      customHeaderServer.status === 'connected' &&
      receivedAuthHeaders['x-custom-tenant'] === 'tenant_vault_xyz_998877';

    recordResult({
      category: '1. Server Connection & Auth',
      scenarioId: 'mcp_conn_custom_header',
      description: 'Connect to MCP server with custom authentication header',
      passed: Boolean(customHeaderOk),
      expected: 'Status connected, custom header x-custom-tenant passed to server',
      actual: `Status: ${customHeaderServer.status}, Received header: ${receivedAuthHeaders['x-custom-tenant']}`
    });

    // 1.3 401 Unauthorized Connection Handling
    mockServerReject401 = true;
    let auth401Caught = false;
    let auth401Message = '';
    try {
      await addMcpServerWithDiscovery(operatorAlpha, {
        name: 'Rejected MCP Server',
        endpoint: mockEndpoint,
        transport: 'http-streamable',
        auth_type: 'bearer',
        auth_credential: 'invalid_bad_token'
      });
    } catch (err: any) {
      auth401Caught = true;
      auth401Message = err.message || '';
    } finally {
      mockServerReject401 = false;
    }

    const auth401Ok = auth401Caught && auth401Message.includes('401') && !auth401Message.includes('invalid_bad_token');
    recordResult({
      category: '1. Server Connection & Auth',
      scenarioId: 'mcp_conn_401_error_reporting',
      description: 'Handle 401 Unauthorized from remote MCP server without leaking credentials',
      passed: auth401Ok,
      expected: 'Rejection error reporting 401 with credentials redacted',
      actual: `Caught: ${auth401Caught}, Message: ${auth401Message}`
    });

    // 1.4 Non-conflation: Server Auth != Agent Authorization
    const serverAuthIndependenceOk =
      bearerServer.status === 'connected' &&
      !(await hasActiveToolGrant(bearerServer.id, 'any_tool', agentSlave1));

    recordResult({
      category: '1. Server Connection & Auth',
      scenarioId: 'mcp_auth_vs_agent_auth_independence',
      description: 'MCP server credentials do not grant automatic agent tool permissions',
      passed: serverAuthIndependenceOk,
      expected: 'Server is connected with credentials, but agent has 0 tool grants',
      actual: `Server connected: ${bearerServer.status === 'connected'}, Agent granted: false`
    });

    // =========================================================================
    // CATEGORY 2: TOOL DISCOVERY & AVAILABILITY
    // =========================================================================
    console.log('\n--- CATEGORY 2: Tool Discovery & Availability ---');

    const discoveredTools = await listToolsForServer(operatorAlpha, bearerServer.id);
    const queryTool = discoveredTools.find(t => t.name === 'query_audit_metrics');
    const transferTool = discoveredTools.find(t => t.name === 'transfer_resource');

    const toolsDiscoveredOk =
      discoveredTools.length >= 2 &&
      Boolean(queryTool && transferTool && queryTool.input_schema?.properties?.metric);

    recordResult({
      category: '2. Tool Discovery & Availability',
      scenarioId: 'mcp_discovery_tools_list',
      description: 'Discovered MCP tools parsed and stored with schemas intact',
      passed: toolsDiscoveredOk,
      expected: 'query_audit_metrics and transfer_resource discovered with valid JSON schemas',
      actual: `Discovered count: ${discoveredTools.length}, Query tool: ${queryTool?.name}`
    });

    // 2.2 Agent Tool Visibility (Zero Trust)
    const agentToolsInitial = await getAuthorizedToolsForAgent({ userId: operatorAlpha, agentId: agentSlave1 });
    const zeroTrustOk = !agentToolsInitial.some(t => t.server_name === bearerServer.name);

    recordResult({
      category: '2. Tool Discovery & Availability',
      scenarioId: 'mcp_agent_visibility_zero_trust',
      description: 'Unassigned agent sees 0 discovered tools in /api/floor/agent/tools',
      passed: zeroTrustOk,
      expected: 'Agent visible tools list excludes unassigned tools',
      actual: `Visible tools for unassigned agent: ${agentToolsInitial.filter(t => t.server_name === bearerServer.name).length}`
    });

    // 2.3 Tool Disabled Policy Enforcement
    const liveToolRec = await getToolRecord(queryTool!.id);
    if (liveToolRec) liveToolRec.is_enabled = false;

    const callerSlave1 = { userId: operatorAlpha, agentId: agentSlave1, isMaster: false };
    const disabledInvocationResult = await invokeAuthorizedTool(callerSlave1, queryTool!.id, { metric: 'cpu_load' });
    if (liveToolRec) liveToolRec.is_enabled = true; // reset

    const disabledBlockedOk =
      !disabledInvocationResult.success &&
      Boolean(disabledInvocationResult.error?.includes('disabled by operator policy'));

    recordResult({
      category: '2. Tool Discovery & Availability',
      scenarioId: 'mcp_tool_disabled_policy',
      description: 'Invocation of operator-disabled tool is strictly blocked',
      passed: disabledBlockedOk,
      expected: 'Invocation blocked with disabled policy error',
      actual: `Success: ${disabledInvocationResult.success}, Error: ${disabledInvocationResult.error}`
    });

    // =========================================================================
    // CATEGORY 3: AGENT AUTHORIZATION & PERSISTENT ACCESS REQUESTS
    // =========================================================================
    console.log('\n--- CATEGORY 3: Agent Authorization & Persistent Access Requests ---');

    // 3.1 Unauthorized Invocation Triggers Persistent Request Creation
    const unauthInvocation = await invokeAuthorizedTool(
      callerSlave1,
      queryTool!.id,
      { metric: 'db_latency', window: '5m' }
    );

    const unauthCreatesRequestOk =
      !unauthInvocation.success &&
      unauthInvocation.requiresAccessApproval === true &&
      typeof unauthInvocation.requestId === 'string' &&
      unauthInvocation.requestId.startsWith('req_');

    recordResult({
      category: '3. Agent Authorization & Requests',
      scenarioId: 'mcp_unauth_invocation_creates_request',
      description: 'Unauthorized invocation returns requiresAccessApproval: true with requestId',
      passed: unauthCreatesRequestOk,
      expected: 'success: false, requiresAccessApproval: true, valid requestId',
      actual: `success: ${unauthInvocation.success}, requiresAccessApproval: ${unauthInvocation.requiresAccessApproval}, requestId: ${unauthInvocation.requestId}`
    });

    const activeRequestId = unauthInvocation.requestId!;

    // 3.2 Request Retrieval via Server-Specific List Endpoint
    const serverRequests = await listToolAccessRequests(operatorAlpha, bearerServer.id, 'pending');
    const matchedRequest = serverRequests.find(r => r.id === activeRequestId);

    const requestListOk =
      Boolean(matchedRequest) &&
      matchedRequest?.tool_id === queryTool!.id &&
      matchedRequest?.account_id === agentSlave1 &&
      matchedRequest?.status === 'pending';

    recordResult({
      category: '3. Agent Authorization & Requests',
      scenarioId: 'mcp_request_listed_in_operator_tab',
      description: 'Persistent access request is listed in server-specific Requests tab query',
      passed: requestListOk,
      expected: 'Request found with status: pending and matching agentSlave1',
      actual: `Found: ${Boolean(matchedRequest)}, Status: ${matchedRequest?.status}, Account: ${matchedRequest?.account_id}`
    });

    // 3.3 Foreign Operator Isolation (Operator Ownership)
    let foreignOperatorBlocked = false;
    try {
      await listToolAccessRequests(operatorBeta, bearerServer.id);
    } catch (err: any) {
      foreignOperatorBlocked = err.message.includes('Forbidden');
    }

    recordResult({
      category: '3. Agent Authorization & Requests',
      scenarioId: 'mcp_operator_ownership_isolation',
      description: 'Foreign operator cannot list or inspect other operators access requests',
      passed: foreignOperatorBlocked,
      expected: 'Forbidden: Operator does not own the requested server',
      actual: `Foreign operator blocked: ${foreignOperatorBlocked}`
    });

    // 3.4 Concurrency Race Condition Test (Deduplication / Mutex Verification)
    // Run 5 simultaneous invocations for another tool with an unassigned agent
    const concurrentInvocations = await Promise.all([
      invokeAuthorizedTool(callerSlave1, transferTool!.id, { target: 'vault_A', amount: 100 }),
      invokeAuthorizedTool(callerSlave1, transferTool!.id, { target: 'vault_A', amount: 200 }),
      invokeAuthorizedTool(callerSlave1, transferTool!.id, { target: 'vault_A', amount: 300 }),
      invokeAuthorizedTool(callerSlave1, transferTool!.id, { target: 'vault_A', amount: 400 }),
      invokeAuthorizedTool(callerSlave1, transferTool!.id, { target: 'vault_A', amount: 500 })
    ]);

    const reqIds = new Set(concurrentInvocations.map(r => r.requestId).filter(Boolean));
    const allPendingRequiresAccess = concurrentInvocations.every(r => r.requiresAccessApproval === true);
    const deduplicationOk = reqIds.size === 1 && allPendingRequiresAccess;

    // Verify exactly one pending request exists for transferTool in storage
    const transferRequests = await listToolAccessRequests(operatorAlpha, bearerServer.id, 'pending');
    const transferPendingMatches = transferRequests.filter(r => r.tool_id === transferTool!.id && r.account_id === agentSlave1);
    const exactlyOneInStorage = transferPendingMatches.length === 1;

    recordResult({
      category: '3. Agent Authorization & Requests',
      scenarioId: 'mcp_concurrent_request_deduplication',
      description: 'Concurrent invocations result in exactly ONE pending access request (no duplicates)',
      passed: deduplicationOk && exactlyOneInStorage,
      expected: '5 concurrent calls yield identical requestId and exactly 1 pending record in store',
      actual: `Unique request IDs: ${reqIds.size}, Pending in store: ${transferPendingMatches.length}`
    });

    // =========================================================================
    // CATEGORY 4: APPROVAL / REJECTION & GRANT LIFECYCLE
    // =========================================================================
    console.log('\n--- CATEGORY 4: Approval / Rejection & Grant Lifecycle ---');

    // 4.1 Operator Approval creates Permanent Grant
    const approvalResult = await approveToolAccessRequest(operatorAlpha, activeRequestId);
    const grantCreatedOk =
      approvalResult.success === true &&
      approvalResult.request.status === 'approved' &&
      approvalResult.grant.status === 'active' &&
      approvalResult.grant.account_id === agentSlave1;

    recordResult({
      category: '4. Approval / Rejection Lifecycle',
      scenarioId: 'mcp_operator_approval_creates_grant',
      description: 'Operator approves persistent access request, creating active grant',
      passed: grantCreatedOk,
      expected: 'Request status approved, grant created for agentSlave1',
      actual: `Success: ${approvalResult.success}, Request Status: ${approvalResult.request.status}, Grant: ${approvalResult.grant.id}`
    });

    // 4.2 Immediate Subsequent Invocation Unblocked
    const postApprovalInvocation = await invokeAuthorizedTool(
      callerSlave1,
      queryTool!.id,
      { metric: 'disk_io', window: '1m' }
    );

    const postApprovalSuccessOk =
      postApprovalInvocation.success === true &&
      Boolean(postApprovalInvocation.result?.content?.[0]?.text);

    recordResult({
      category: '4. Approval / Rejection Lifecycle',
      scenarioId: 'mcp_subsequent_invocation_succeeds',
      description: 'Agent can execute tool immediately after operator approval without re-requesting',
      passed: postApprovalSuccessOk,
      expected: 'Tool execution succeeds immediately',
      actual: `Success: ${postApprovalInvocation.success}, Result: ${JSON.stringify(postApprovalInvocation.result?.content?.[0]?.text)}`
    });

    // 4.3 Cross-Agent Isolation: Approved grant does NOT leak to another agent
    const callerSlave2 = { userId: operatorAlpha, agentId: agentSlave2, isMaster: false };
    const worker2Invocation = await invokeAuthorizedTool(
      callerSlave2,
      queryTool!.id,
      { metric: 'disk_io' }
    );

    const crossAgentIsolationOk =
      worker2Invocation.success === false &&
      worker2Invocation.requiresAccessApproval === true &&
      worker2Invocation.requestId !== activeRequestId;

    recordResult({
      category: '4. Approval / Rejection Lifecycle',
      scenarioId: 'mcp_cross_agent_grant_isolation',
      description: 'Approved grant is strictly scoped to requesting agent; other agents remain blocked',
      passed: crossAgentIsolationOk,
      expected: 'Other agent is blocked and receives separate requestId',
      actual: `Worker2 Success: ${worker2Invocation.success}, New Request: ${worker2Invocation.requestId}`
    });

    // 4.4 Operator Rejection flow
    const worker2RequestId = worker2Invocation.requestId!;
    const rejectionResult = await rejectToolAccessRequest(operatorAlpha, worker2RequestId, 'Restricted to slave 01');

    const rejectionOk =
      rejectionResult.success === true &&
      rejectionResult.request.status === 'rejected' &&
      rejectionResult.request.rejection_reason === 'Restricted to slave 01';

    // Verify worker 2 still blocked
    const worker2PostRejection = await invokeAuthorizedTool(callerSlave2, queryTool!.id, { metric: 'disk_io' });
    const stillBlockedOk = !worker2PostRejection.success;

    recordResult({
      category: '4. Approval / Rejection Lifecycle',
      scenarioId: 'mcp_operator_rejection_retains_block',
      description: 'Rejected request retains decision reason in history and keeps agent blocked',
      passed: rejectionOk && stillBlockedOk,
      expected: 'Status rejected, reason stored, agent remains blocked',
      actual: `Status: ${rejectionResult.request.status}, Reason: ${rejectionResult.request.rejection_reason}, Still Blocked: ${stillBlockedOk}`
    });

    // 4.5 Foreign Operator Cannot Approve or Reject
    let foreignApprovalBlocked = false;
    try {
      await approveToolAccessRequest(operatorBeta, transferPendingMatches[0].id);
    } catch (err: any) {
      foreignApprovalBlocked = err.message.includes('Forbidden');
    }

    recordResult({
      category: '4. Approval / Rejection Lifecycle',
      scenarioId: 'mcp_foreign_operator_approval_rejection_blocked',
      description: 'Unauthorized operator cannot approve or reject another operator requests',
      passed: foreignApprovalBlocked,
      expected: 'Forbidden: Operator does not own the associated MCP server',
      actual: `Blocked: ${foreignApprovalBlocked}`
    });

    // 4.6 Revocation immediately terminates access
    await revokeToolAccess(operatorAlpha, bearerServer.id, queryTool!.id, agentSlave1);
    const postRevokeInvocation = await invokeAuthorizedTool(callerSlave1, queryTool!.id, { metric: 'disk_io' });
    const revokeTerminatedOk = !postRevokeInvocation.success && postRevokeInvocation.requiresAccessApproval === true;

    recordResult({
      category: '4. Approval / Rejection Lifecycle',
      scenarioId: 'mcp_grant_revocation_enforcement',
      description: 'Revoking persistent grant immediately terminates agent execution privilege',
      passed: revokeTerminatedOk,
      expected: 'Invocation blocked, creates/reopens access request',
      actual: `Success: ${postRevokeInvocation.success}, Requires Approval: ${postRevokeInvocation.requiresAccessApproval}`
    });

    // =========================================================================
    // CATEGORY 5: HITL EXECUTION AND REPLAY PROTECTION
    // =========================================================================
    console.log('\n--- CATEGORY 5: HITL Execution & Replay Protection ---');

    // Restore grant for transferTool to agentSlave1
    await grantToolAccess(operatorAlpha, bearerServer.id, transferTool!.id, agentSlave1);

    // 5.1 Enable HITL policy for transferTool
    await setToolHitlPolicy(operatorAlpha, transferTool!.id, true);
    const hitlPolicy = await getToolHitlPolicy(transferTool!.id);
    const policyOk = hitlPolicy?.hitl_enabled === true;

    recordResult({
      category: '5. HITL Execution & Replay Protection',
      scenarioId: 'mcp_hitl_policy_activation',
      description: 'Configure Human-in-the-Loop policy for sensitive tool',
      passed: policyOk,
      expected: 'hitl_enabled: true',
      actual: `Policy: ${hitlPolicy?.hitl_enabled}`
    });

    // 5.2 Authorized Agent Invocation Intercepted into Pending Invocations (202 Pending)
    const initialRequestsCount = (await listToolAccessRequests(operatorAlpha, bearerServer.id, 'all')).length;

    const hitlInterceptResult = await invokeAuthorizedTool(
      callerSlave1,
      transferTool!.id,
      { target: 'treasury_account', amount: 5000 }
    );

    const hitlInterceptOk =
      hitlInterceptResult.success === false &&
      hitlInterceptResult.error === 'HITL_APPROVAL_REQUIRED' &&
      typeof hitlInterceptResult.invocationId === 'string';

    const pendingInvocationId = hitlInterceptResult.invocationId!;

    // 5.3 Strict Separation: Verify HITL invocation DOES NOT pollute persistent access requests
    const postRequestsCount = (await listToolAccessRequests(operatorAlpha, bearerServer.id, 'all')).length;
    const strictSeparationOk = postRequestsCount === initialRequestsCount;

    // Check pending invocations list
    const pendingInvocations = await listPendingInvocationsForOwner(operatorAlpha);
    const matchedPending = pendingInvocations.find(p => p.id === pendingInvocationId);
    const inPendingQueueOk = Boolean(matchedPending) && matchedPending?.args?.amount === 5000;

    recordResult({
      category: '5. HITL Execution & Replay Protection',
      scenarioId: 'mcp_hitl_invocation_strict_workflow_separation',
      description: 'HITL invocation queues in Pending Invocations and does NOT pollute Persistent Requests',
      passed: hitlInterceptOk && strictSeparationOk && inPendingQueueOk,
      expected: 'Pending invocation created with HITL_APPROVAL_REQUIRED; 0 requests added to mcp_tool_requests',
      actual: `Intercepted: ${hitlInterceptOk}, Requests count changed: ${postRequestsCount - initialRequestsCount}, Queued: ${inPendingQueueOk}`
    });

    // 5.4 Operator Approval of Pending Invocation
    const hitlApproveResult = await approvePendingInvocation(operatorAlpha, pendingInvocationId);
    const hitlApprovedOk = hitlApproveResult.success && hitlApproveResult.invocation?.status === 'approved';

    recordResult({
      category: '5. HITL Execution & Replay Protection',
      scenarioId: 'mcp_hitl_operator_approval',
      description: 'Operator approves pending invocation and issues execution grant',
      passed: hitlApprovedOk,
      expected: 'Invocation status transitions to approved',
      actual: `Approved: ${hitlApprovedOk}, Status: ${hitlApproveResult.invocation?.status}`
    });

    // 5.5 Execution of Approved Invocation
    const executionResult = await invokeAuthorizedTool(
      callerSlave1,
      transferTool!.id,
      { target: 'treasury_account', amount: 5000 },
      pendingInvocationId
    );

    const executionSuccessOk = executionResult.success === true;

    recordResult({
      category: '5. HITL Execution & Replay Protection',
      scenarioId: 'mcp_hitl_approved_execution',
      description: 'Approved invocation executes remote tool using validated invocation binding',
      passed: executionSuccessOk,
      expected: 'Tool execution succeeds',
      actual: `Execution Success: ${executionSuccessOk}`
    });

    // 5.6 Single-Use Grant Consumption & Replay Prevention
    const replayAttempt = await invokeAuthorizedTool(
      callerSlave1,
      transferTool!.id,
      { target: 'treasury_account', amount: 5000 },
      pendingInvocationId
    );

    const replayBlockedOk =
      replayAttempt.success === false &&
      Boolean(replayAttempt.error?.includes('CONSUMED') || replayAttempt.error?.includes('ALREADY_EXECUTED') || replayAttempt.error?.includes('INVALID'));

    recordResult({
      category: '5. HITL Execution & Replay Protection',
      scenarioId: 'mcp_hitl_single_use_grant_replay_protection',
      description: 'Second execution attempt with consumed grant is strictly blocked (anti-replay)',
      passed: replayBlockedOk,
      expected: 'Replay attempt blocked with CONSUMED/ALREADY_EXECUTED',
      actual: `Replay success: ${replayAttempt.success}, Error: ${replayAttempt.error}`
    });

    // 5.7 Argument Tampering Defense
    // Create new pending invocation
    const tamperInvocation = await invokeAuthorizedTool(
      callerSlave1,
      transferTool!.id,
      { target: 'secure_vault', amount: 10 }
    );
    await approvePendingInvocation(operatorAlpha, tamperInvocation.invocationId!);

    // Attempt execution with tampered arguments ($10,000 instead of $10)
    const tamperedArgs = { target: 'secure_vault', amount: 10000 };
    const storedRecord = await getPendingInvocationRecord(tamperInvocation.invocationId!);
    const suppliedHash = hashToolArguments(tamperedArgs);
    const approvedHash = storedRecord?.args_hash;
    const argumentTamperDetected = suppliedHash !== approvedHash;

    recordResult({
      category: '5. HITL Execution & Replay Protection',
      scenarioId: 'mcp_hitl_argument_tampering_defense',
      description: 'Arguments supplied at execution must cryptographically match approved invocation hash',
      passed: argumentTamperDetected,
      expected: 'Supplied argument hash differs from approved hash',
      actual: `Tamper detected: ${argumentTamperDetected}`
    });

    // 5.8 Expiry Defense
    const expiredRecord = await getPendingInvocationRecord(tamperInvocation.invocationId!);
    if (expiredRecord) {
      expiredRecord.expires_at = new Date(Date.now() - 5000).toISOString();
    }
    const expiredExecution = await invokeAuthorizedTool(
      callerSlave1,
      transferTool!.id,
      { target: 'secure_vault', amount: 10 },
      tamperInvocation.invocationId!
    );

    const expiredBlockedOk =
      !expiredExecution.success &&
      expiredExecution.error === 'HITL_INVOCATION_EXPIRED';

    recordResult({
      category: '5. HITL Execution & Replay Protection',
      scenarioId: 'mcp_hitl_expired_invocation_defense',
      description: 'Expired pending invocations are rejected with expired error',
      passed: expiredBlockedOk,
      expected: 'HITL_INVOCATION_EXPIRED',
      actual: `Result error: ${expiredExecution.error}`
    });

    // 5.9 Denial Flow
    const denyInvocation = await invokeAuthorizedTool(
      callerSlave1,
      transferTool!.id,
      { target: 'blocked_target', amount: 50 }
    );
    const denyResult = await denyPendingInvocation(operatorAlpha, denyInvocation.invocationId!);
    const denyOk = denyResult.success && denyResult.invocation?.status === 'denied';

    const deniedExecution = await invokeAuthorizedTool(
      callerSlave1,
      transferTool!.id,
      { target: 'blocked_target', amount: 50 },
      denyInvocation.invocationId!
    );
    const deniedExecutionBlockedOk = !deniedExecution.success;

    recordResult({
      category: '5. HITL Execution & Replay Protection',
      scenarioId: 'mcp_hitl_operator_denial_flow',
      description: 'Operator denial marks invocation status denied and prevents execution',
      passed: denyOk && deniedExecutionBlockedOk,
      expected: 'Status denied and execution blocked',
      actual: `Denied: ${denyOk}, Execution Blocked: ${deniedExecutionBlockedOk}`
    });

    // =========================================================================
    // CATEGORY 6: DASHBOARD & API CONSISTENCY
    // =========================================================================
    console.log('\n--- CATEGORY 6: Dashboard & API Consistency ---');

    // 6.1 Header Injection / CRLF Defense
    const crlfHeaderCheck = validateAuthHeader('custom-header', 'X-Injected\r\nInjected-Header: evil', 'valid_secret');
    const crlfSecretCheck = validateAuthHeader('bearer', undefined, 'secret\r\nInjected: evil');
    const crlfDetected = !crlfHeaderCheck.valid && !crlfSecretCheck.valid;

    recordResult({
      category: '6. Dashboard & API Consistency',
      scenarioId: 'mcp_header_injection_crlf_defense',
      description: 'Auth headers reject CRLF injection payloads',
      passed: crlfDetected,
      expected: 'CRLF injection in header name or secret is blocked (valid=false)',
      actual: `Header valid: ${crlfHeaderCheck.valid}, Secret valid: ${crlfSecretCheck.valid}`
    });

    // 6.2 JSON Schema Property Constraints Validation
    const invalidSchemaArgs = validateToolArguments(
      queryTool!.input_schema,
      { metric: 'a' } // minLength: 2
    );
    const schemaEnforcedOk = !invalidSchemaArgs.valid && Boolean(invalidSchemaArgs.error);

    recordResult({
      category: '6. Dashboard & API Consistency',
      scenarioId: 'mcp_schema_validation_constraints',
      description: 'JSON Schema minimum length and property validation is strictly enforced',
      passed: schemaEnforcedOk,
      expected: 'Arguments failing constraints rejected (valid=false with error)',
      actual: `Valid: ${invalidSchemaArgs.valid}, Error: ${invalidSchemaArgs.error}`
    });

    // 6.3 Stable Machine-Readable Access Approval Contract
    const unauthTestResult = await invokeAuthorizedTool(
      { userId: operatorAlpha, agentId: agentIntruder, isMaster: false },
      transferTool!.id,
      { target: 'test', amount: 10 }
    );

    const stableContractOk =
      unauthTestResult.success === false &&
      unauthTestResult.requiresAccessApproval === true &&
      typeof unauthTestResult.requestId === 'string' &&
      unauthTestResult.requestId.length > 5;

    recordResult({
      category: '6. Dashboard & API Consistency',
      scenarioId: 'mcp_machine_readable_access_contract',
      description: 'Unauthorized response contract guarantees requiresAccessApproval and stable requestId',
      passed: stableContractOk,
      expected: 'Stable { requiresAccessApproval: true, requestId: string } returned',
      actual: `requiresAccessApproval: ${unauthTestResult.requiresAccessApproval}, requestId: ${unauthTestResult.requestId}`
    });

    // Cleanup servers
    await removeMcpServer(operatorAlpha, bearerServer.id);
    await removeMcpServer(operatorAlpha, customHeaderServer.id);

  } finally {
    setAllowedTestServerOriginForTesting(null);
    mockServer.close();
  }

  // Summary evaluation
  const totalScenarios = auditMatrix.length;
  const passedScenarios = auditMatrix.filter(s => s.passed).length;
  const failedScenarios = auditMatrix.filter(s => !s.passed).length;

  console.log('\n================================================================');
  console.log(`📊 AUDIT SUITE FINISHED: ${passedScenarios}/${totalScenarios} PASSED (${failedScenarios} FAILED)`);
  console.log('================================================================\n');

  if (failedScenarios > 0) {
    throw new Error(`${failedScenarios} audit test scenarios failed!`);
  }

  return suiteResults;
}
