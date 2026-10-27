import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import floorRouter from '../routes/floorRoutes.js';
import {
  addMcpServerWithDiscovery,
  removeMcpServer,
  grantToolAccess,
  revokeToolAccess,
  setToolHitlPolicy,
  approvePendingInvocation,
  denyPendingInvocation,
  approveToolAccessRequest,
  rejectToolAccessRequest,
  getPendingInvocationRecord,
  updateInvocationRecord,
  getAuthorizedToolsForAgent,
  recordOrReuseAccessRequest,
  clearHitlStoreForTesting,
  clearAccessGovernanceForTesting,
  setAllowedTestServerOriginForTesting
} from '../services/mcpService.js';

export async function runFloorAgentFacingApiTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA FLOOR AGENT-FACING API SPECIFICATION TEST SUITE ===\n');
  process.env.NODE_ENV = 'test';
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  // Mock server harness with custom caller injection middleware for testing
  let testCaller: { id: string; agentId?: string; masterId?: string; type: string } = {
    id: 'user_master_agent_spec_001',
    agentId: 'agent_slave_spec_001',
    masterId: 'user_master_agent_spec_001',
    type: 'agent'
  };

  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  // Test-auth injector middleware
  app.use((req, res, next) => {
    (req as any).user = { ...testCaller };
    (req as any).authType = 'agent';
    next();
  });

  app.use('/api/floor', floorRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const fetchApi = async (path: string, options: any = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  };

  try {
    const operatorId = 'user_master_agent_spec_001';
    const slaveAgentId = 'agent_slave_spec_001';
    const foreignAgentId = 'agent_foreign_intruder_999';

    // Set up mock test MCP server with 2 tools
    setAllowedTestServerOriginForTesting('mock://agent-spec-mcp.internal');
    const registered = await addMcpServerWithDiscovery(operatorId, {
      name: 'Agent Facing Spec Server',
      endpoint: 'mock://agent-spec-mcp.internal',
      transport: 'http-streamable',
      auth_type: 'none'
    });

    const mcpServer = registered.server;
    const tools = registered.tools;
    const toolEcho = tools[0]; // mock tool with query string
    const toolCalc = tools[1];

    // =========================================================================
    // 1. Discover Tools: GET /api/floor/agent/tools
    // =========================================================================
    console.log('--- 1. Discover Tools (GET /api/floor/agent/tools) ---');

    // Initially unassigned: agent sees 0 tools
    testCaller = { id: operatorId, agentId: slaveAgentId, masterId: operatorId, type: 'agent' };
    const initialToolsRes = await fetchApi('/api/floor/agent/tools');
    recordResult(
      'discover_tools_unassigned_hidden',
      initialToolsRes.status === 200 && Array.isArray(initialToolsRes.json?.data) && initialToolsRes.json.data.length === 0,
      'Unassigned agent sees 0 tools (zero-trust)'
    );

    // Grant access to toolEcho
    await grantToolAccess(operatorId, mcpServer.id, toolEcho.id, slaveAgentId);

    // Query tools again
    const discoveredRes = await fetchApi('/api/floor/agent/tools');
    const discoveredTools = discoveredRes.json?.data;
    const discoveredItem = Array.isArray(discoveredTools) ? discoveredTools.find((t: any) => t.id === toolEcho.id) : null;

    const schemaComplete =
      discoveredItem &&
      discoveredItem.id === toolEcho.id &&
      typeof discoveredItem.name === 'string' &&
      typeof discoveredItem.description === 'string' &&
      discoveredItem.input_schema &&
      discoveredItem.inputSchema &&
      discoveredItem.access_status === 'granted' &&
      discoveredItem.accessStatus === 'granted' &&
      discoveredItem.server_id === mcpServer.id;

    recordResult('discover_tools_returns_schema_and_status', Boolean(schemaComplete), 'Returns id, name, description, inputSchema, accessStatus');

    // Test HITL status reflection
    await setToolHitlPolicy(operatorId, toolEcho.id, true);
    const hitlToolsRes = await fetchApi('/api/floor/agent/tools');
    const hitlItem = hitlToolsRes.json?.data?.find((t: any) => t.id === toolEcho.id);
    const hitlStatusOk = hitlItem?.access_status === 'hitl' && hitlItem?.accessStatus === 'hitl';
    recordResult('discover_tools_reflects_hitl_status', Boolean(hitlStatusOk), 'accessStatus changes to "hitl" when HITL enabled');

    // Reset HITL policy for now
    await setToolHitlPolicy(operatorId, toolEcho.id, false);

    // =========================================================================
    // 2. Send Tool Request: POST /api/floor/tools/:toolId/invoke
    // =========================================================================
    console.log('\n--- 2. Send Tool Request (POST /api/floor/tools/:toolId/invoke) ---');

    // 2.1 Non-existent tool returns 404
    const notFoundToolRes = await fetchApi('/api/floor/tools/non_existent_tool_id_999/invoke', {
      method: 'POST',
      body: JSON.stringify({ arguments: { query: 'hello' }, reason: 'test non existent', requestType: 'access' })
    });
    recordResult('tool_invoke_non_existent_404', notFoundToolRes.status === 404, 'Returns 404 when tool does not exist');

    // 2.2 Missing arguments returns 400
    const missingArgsRes = await fetchApi(`/api/floor/tools/${toolEcho.id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'missing arguments object' })
    });
    recordResult('tool_invoke_missing_args_400', missingArgsRes.status === 400, 'Returns 400 when arguments field missing or invalid');

    // 2.3 Invalid arguments failing tool input_schema returns 400
    // Mock server schema: query must be string if provided
    const invalidArgsRes = await fetchApi(`/api/floor/tools/${toolEcho.id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({
        arguments: { query: 123456 }, // schema expects string
        reason: 'test invalid argument type',
        requestType: 'access'
      })
    });
    recordResult('tool_invoke_schema_validation_failure_400', invalidArgsRes.status === 400, 'Returns 400 when arguments violate schema');

    // 2.4 Permitted direct execution when authorized and no HITL
    const validExecRes = await fetchApi(`/api/floor/tools/${toolEcho.id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({
        arguments: { query: 'Tokyo' },
        reason: 'Authorized query'
      })
    });
    recordResult('tool_invoke_authorized_direct_execution_200', validExecRes.status === 200 && validExecRes.json?.success === true, 'Direct execution succeeds with 200');

    // 2.5 Access Request required when caller lacks grant (toolCalc is not assigned to slaveAgentId)
    testCaller = { id: operatorId, agentId: slaveAgentId, masterId: operatorId, type: 'agent' };
    const accessReqRes1 = await fetchApi(`/api/floor/tools/${toolCalc.id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({
        arguments: { query: 'Tokyo' },
        reason: 'Need access to calculation tool',
        requestType: 'access'
      })
    });

    const accessReq1Id = accessReqRes1.json?.data?.requestId || accessReqRes1.json?.requestId;
    const accessPending1Ok =
      accessReqRes1.status === 202 &&
      accessReqRes1.json?.status === 'pending' &&
      typeof accessReq1Id === 'string';

    recordResult('tool_invoke_access_request_created_202', accessPending1Ok, 'Returns 202 pending with requestId without executing tool');

    // Deduplication check: repeated call reuses existing request ID
    const accessReqRes2 = await fetchApi(`/api/floor/tools/${toolCalc.id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({
        arguments: { query: 'Tokyo' },
        reason: 'Second call for calculation tool',
        requestType: 'access'
      })
    });
    const accessReq2Id = accessReqRes2.json?.data?.requestId || accessReqRes2.json?.requestId;
    recordResult('tool_invoke_access_request_deduplication', accessReq1Id === accessReq2Id, 'Repeated invocation reuses pending requestId');

    // 2.6 HITL approval request when policy enabled
    await setToolHitlPolicy(operatorId, toolEcho.id, true);

    const hitlInvokeRes1 = await fetchApi(`/api/floor/tools/${toolEcho.id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({
        arguments: { query: 'Tokyo' },
        reason: 'Sensitive query needing human review',
        requestType: 'hitl'
      })
    });

    const hitlReq1Id = hitlInvokeRes1.json?.data?.requestId || hitlInvokeRes1.json?.requestId || hitlInvokeRes1.json?.invocationId;
    const hitlPending1Ok =
      hitlInvokeRes1.status === 202 &&
      hitlInvokeRes1.json?.status === 'pending' &&
      typeof hitlReq1Id === 'string';

    recordResult('tool_invoke_hitl_request_created_202', hitlPending1Ok, 'HITL invocation returns 202 pending without executing tool');

    // Deduplication check for pending HITL invocations
    const hitlInvokeRes2 = await fetchApi(`/api/floor/tools/${toolEcho.id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({
        arguments: { query: 'Tokyo' },
        reason: 'Repeated HITL query',
        requestType: 'hitl'
      })
    });
    const hitlReq2Id = hitlInvokeRes2.json?.data?.requestId || hitlInvokeRes2.json?.requestId || hitlInvokeRes2.json?.invocationId;
    recordResult('tool_invoke_hitl_request_deduplication', hitlReq1Id === hitlReq2Id, 'Repeated HITL call reuses pending invocationId');

    // =========================================================================
    // 3. Get Temporary Access: POST /api/floor/invocations/:invocationId/access
    // =========================================================================
    console.log('\n--- 3. Get Temporary Access (POST /api/floor/invocations/:invocationId/access) ---');

    // 3.1 Missing reason returns 400
    const missingReasonRes = await fetchApi(`/api/floor/invocations/${hitlReq1Id}/access`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    recordResult('temp_access_missing_reason_400', missingReasonRes.status === 400, 'Returns 400 when reason is missing');

    // 3.2 Non-existent invocation returns 404
    const notFoundInvRes = await fetchApi('/api/floor/invocations/inv_missing_99999/access', {
      method: 'POST',
      body: JSON.stringify({ reason: 'test' })
    });
    recordResult('temp_access_non_existent_404', notFoundInvRes.status === 404, 'Returns 404 when invocation not found');

    // 3.3 Foreign caller blocked with 403
    testCaller = { id: 'usr_foreign_999', agentId: foreignAgentId, masterId: 'usr_foreign_999', type: 'agent' };
    const foreignAccessRes = await fetchApi(`/api/floor/invocations/${hitlReq1Id}/access`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Unauthorized intruder attempt' })
    });
    recordResult('temp_access_foreign_agent_forbidden_403', foreignAccessRes.status === 403, 'Returns 403 when caller is not the requesting agent');

    // Switch back to authentic agent
    testCaller = { id: operatorId, agentId: slaveAgentId, masterId: operatorId, type: 'agent' };

    // 3.4 Unapproved invocation returns 403
    const unapprovedAccessRes = await fetchApi(`/api/floor/invocations/${hitlReq1Id}/access`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Premature attempt before approval' })
    });
    recordResult('temp_access_unapproved_forbidden_403', unapprovedAccessRes.status === 403, 'Returns 403 when invocation is still pending');

    // Operator approves the pending invocation
    await approvePendingInvocation(operatorId, hitlReq1Id);

    // 3.5 Approved invocation retrieves temporary credentials without executing tool
    const approvedAccessRes = await fetchApi(`/api/floor/invocations/${hitlReq1Id}/access`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Retrieve temporary credentials for execution' })
    });

    const accessData = approvedAccessRes.json?.data;
    const accessOk =
      approvedAccessRes.status === 200 &&
      approvedAccessRes.json?.success === true &&
      typeof accessData?.grantToken === 'string' &&
      typeof accessData?.accessToken === 'string' &&
      accessData?.scope === 'tool:invoke' &&
      typeof accessData?.expiresAt === 'string' &&
      accessData?.invocationId === hitlReq1Id;

    recordResult('temp_access_retrieval_success_200', Boolean(accessOk), 'Retrieves grantToken, scope, expiresAt without executing tool');

    // 3.6 Token reuse / Anti-replay protection: Second call returns 409
    const replayAccessRes = await fetchApi(`/api/floor/invocations/${hitlReq1Id}/access`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Replay attempt to get duplicate credentials' })
    });
    recordResult('temp_access_anti_replay_single_retrieval_409', replayAccessRes.status === 409, 'Second retrieval rejected with 409 (single-retrieval / anti-replay)');

    // 3.7 Expired invocation defense: returns 410
    // Create new pending invocation and approve it, then expire it
    const expireInvRes = await fetchApi(`/api/floor/tools/${toolEcho.id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ arguments: { query: 'expire_test' }, reason: 'expire test', requestType: 'hitl' })
    });
    const expireInvId = expireInvRes.json?.data?.requestId;
    await approvePendingInvocation(operatorId, expireInvId);
    const expireRec = await getPendingInvocationRecord(expireInvId);
    if (expireRec) {
      expireRec.expires_at = new Date(Date.now() - 10000).toISOString();
      await updateInvocationRecord(expireRec);
    }
    const expiredRes = await fetchApi(`/api/floor/invocations/${expireInvId}/access`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Attempt expired retrieval' })
    });
    recordResult('temp_access_expired_returns_410', expiredRes.status === 410, 'Returns 410 when invocation is expired');

    // =========================================================================
    // 4. Check Request Status: GET /api/floor/requests/:requestId
    // =========================================================================
    console.log('\n--- 4. Check Request Status (GET /api/floor/requests/:requestId) ---');

    // 4.1 Non-existent request returns 404
    const notFoundReqRes = await fetchApi('/api/floor/requests/req_nonexistent_99999');
    recordResult('check_status_non_existent_404', notFoundReqRes.status === 404, 'Returns 404 for unknown request ID');

    // 4.2 Foreign agent checking request returns 403
    testCaller = { id: 'usr_foreign_999', agentId: foreignAgentId, masterId: 'usr_foreign_999', type: 'agent' };
    const foreignCheckRes = await fetchApi(`/api/floor/requests/${hitlReq1Id}`);
    recordResult('check_status_foreign_caller_403', foreignCheckRes.status === 403, 'Returns 403 for unauthorized caller');

    // 4.3 Check pending access request status
    testCaller = { id: operatorId, agentId: slaveAgentId, masterId: operatorId, type: 'agent' };
    const pendingStatusRes = await fetchApi(`/api/floor/requests/${accessReq1Id}`);
    const pendingOk =
      pendingStatusRes.status === 200 &&
      pendingStatusRes.json?.success === true &&
      pendingStatusRes.json?.data?.requestId === accessReq1Id &&
      pendingStatusRes.json?.data?.status === 'pending';
    recordResult('check_status_pending_request', Boolean(pendingOk), 'Returns status: "pending" for active request');

    // 4.4 Approve access request -> status: "accepted"
    await approveToolAccessRequest(operatorId, accessReq1Id);
    const acceptedStatusRes = await fetchApi(`/api/floor/requests/${accessReq1Id}`);
    const acceptedOk =
      acceptedStatusRes.status === 200 &&
      acceptedStatusRes.json?.data?.status === 'accepted';
    recordResult('check_status_accepted_request', Boolean(acceptedOk), 'Returns status: "accepted" for approved request');

    // 4.5 Reject access request -> status: "rejected"
    // Revoke access first, request again, then reject
    await revokeToolAccess(operatorId, mcpServer.id, toolCalc.id, slaveAgentId);
    const rejectReqRes = await fetchApi(`/api/floor/tools/${toolCalc.id}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ arguments: { query: 'to be rejected' }, reason: 'to be rejected', requestType: 'access' })
    });
    const rejectReqId = rejectReqRes.json?.data?.requestId;
    await rejectToolAccessRequest(operatorId, rejectReqId, 'Operator denied access');
    const rejectedStatusRes = await fetchApi(`/api/floor/requests/${rejectReqId}`);
    const rejectedOk =
      rejectedStatusRes.status === 200 &&
      rejectedStatusRes.json?.data?.status === 'rejected';
    recordResult('check_status_rejected_request', Boolean(rejectedOk), 'Returns status: "rejected" for rejected request');

    // 4.6 Check invocation requests through /requests/:requestId
    testCaller = { id: operatorId, agentId: slaveAgentId, masterId: operatorId, type: 'agent' };
    const invStatusRes = await fetchApi(`/api/floor/requests/${hitlReq1Id}`);
    const invStatusOk =
      invStatusRes.status === 200 &&
      invStatusRes.json?.data?.status === 'accepted'; // hitlReq1Id was approved earlier
    recordResult('check_status_invocation_request_compatibility', Boolean(invStatusOk), 'Seamlessly checks pending invocation status (accepted)');

    // Clean up
    await removeMcpServer(operatorId, mcpServer.id);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  return results;
}
