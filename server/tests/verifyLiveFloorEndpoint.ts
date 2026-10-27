import http from 'http';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';

import { createApp } from '../../server.js';
import { getJwtSecret } from '../authService.js';
import {
  addMcpServerWithDiscovery,
  setToolAssignment,
  grantToolAccess,
  setToolHitlPolicy,
  revokeToolAccess,
  setAllowedTestServerOriginForTesting,
} from '../services/mcpService.js';
import { getSupabaseClient } from '../supabase.js';

async function verifyFloorEndpoint() {
  console.log('================================================================');
  console.log('E2E TEST: VERIFYING GET /api/floor/agent/tools SPECIFICATION');
  console.log('================================================================\n');

  // Initialize the real Express server application
  const app = await createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test Server] Running on ${baseUrl}`);

  const supabase = getSupabaseClient();

  // Create operator & slave agent in DB
  const operatorId = `usr_op_${Date.now()}`;
  const slaveId = `usr_slave_${Date.now()}`;
  const slaveAgentId = `AMR-SLAVE-${Date.now().toString().slice(-4)}`;

  await supabase.from('users').insert([
    {
      id: operatorId,
      agentId: `AMR-MASTER-0001`,
      name: 'Master Fleet Operator',
      email: 'master@fleet.internal',
      role: 'master',
      account_type: 'master',
      is_master_primary: true,
      status: 'active'
    },
    {
      id: slaveId,
      agentId: slaveAgentId,
      name: 'Slave Agent Node 1',
      email: `slave+${slaveAgentId}@fleet.internal`,
      role: 'slave',
      account_type: 'slave',
      master_id: operatorId,
      is_master_primary: false,
      status: 'active'
    }
  ]);

  // Generate tokens
  const operatorToken = jwt.sign(
    { id: operatorId, agentId: 'AMR-MASTER-0001', email: 'master@fleet.internal', type: 'agent' },
    getJwtSecret(),
    { expiresIn: '1h' }
  );

  const slaveToken = jwt.sign(
    { id: slaveId, agentId: slaveAgentId, email: `slave+${slaveAgentId}@fleet.internal`, type: 'agent' },
    getJwtSecret(),
    { expiresIn: '1h' }
  );

  // Helper fetch function
  const callApi = async (path: string, token?: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    const status = res.status;
    let json: any = null;
    try {
      json = await res.json();
    } catch {}
    return { status, json };
  };

  // 1. Unauthenticated check
  console.log('--- Step 0: Unauthenticated GET /api/floor/agent/tools ---');
  const unauthRes = await callApi('/api/floor/agent/tools');
  console.log(`Unauthenticated Status: ${unauthRes.status}`);
  if (unauthRes.status === 401) {
    console.log('✅ Correctly returns 401 Unauthorized when missing credentials.');
  } else {
    console.error('❌ Expected 401, got:', unauthRes.status);
    process.exit(1);
  }

  // 2. Register an MCP server with mock tools for this operator
  setAllowedTestServerOriginForTesting('mock://e2e-floor-test.internal');
  const registered = await addMcpServerWithDiscovery(operatorId, {
    name: 'E2E Floor Test Integration',
    endpoint: 'mock://e2e-floor-test.internal',
    transport: 'http-streamable',
    auth_type: 'none'
  });

  const mcpServer = registered.server;
  const tools = registered.tools;
  const targetTool = tools[0];

  console.log(`\n[Setup] Registered MCP server "${mcpServer.name}" (${mcpServer.id}) with ${tools.length} tools`);
  console.log(`[Setup] Primary Tool: "${targetTool.name}" (${targetTool.id})`);

  // 3. Query as Operator: Master Operator should see all tools
  console.log('\n--- Step 1: Master Operator calling GET /api/floor/agent/tools ---');
  const masterRes = await callApi('/api/floor/agent/tools', operatorToken);
  console.log(`Master HTTP Status: ${masterRes.status}`);
  console.log(`Master Tools Returned: ${masterRes.json?.data?.length}`);
  if (masterRes.status === 200 && Array.isArray(masterRes.json?.data) && masterRes.json.data.length >= tools.length) {
    console.log('✅ Operator correctly discovers all enabled server tools.');
  } else {
    console.error('❌ Operator tool discovery failed:', masterRes.json);
    process.exit(1);
  }

  // 4. Query as Slave Agent before assignment: Zero tools (Zero-Trust)
  console.log('\n--- Step 2: Slave Agent calling GET /api/floor/agent/tools (Pre-Assignment) ---');
  const slavePreRes = await callApi('/api/floor/agent/tools', slaveToken);
  console.log(`Slave Pre-Assignment HTTP Status: ${slavePreRes.status}`);
  console.log(`Slave Pre-Assignment Tools Returned: ${slavePreRes.json?.data?.length}`);
  if (slavePreRes.status === 200 && slavePreRes.json?.data?.length === 0) {
    console.log('✅ Slave Agent has 0 tools by default (Zero-Trust isolation verified).');
  } else {
    console.error('❌ Expected 0 tools for unassigned slave, got:', slavePreRes.json);
    process.exit(1);
  }

  // 5. Assign tool to Slave Agent
  console.log(`\n--- Step 3: Granting Tool "${targetTool.name}" to Slave "${slaveAgentId}" ---`);
  await grantToolAccess(operatorId, mcpServer.id, targetTool.id, slaveAgentId);
  console.log('Tool access granted successfully.');

  // 6. Query as Slave Agent after assignment: Tool should now be present!
  console.log('\n--- Step 4: Slave Agent calling GET /api/floor/agent/tools (Post-Assignment) ---');
  const slavePostRes = await callApi('/api/floor/agent/tools', slaveToken);
  console.log(`Slave Post-Assignment HTTP Status: ${slavePostRes.status}`);
  console.log(`Slave Post-Assignment Tools Returned: ${slavePostRes.json?.data?.length}`);
  const assignedTool = slavePostRes.json?.data?.find((t: any) => t.id === targetTool.id);

  if (slavePostRes.status === 200 && assignedTool) {
    console.log('✅ Assigned Tool found in response!');
    console.log('Tool Payload:', JSON.stringify(assignedTool, null, 2));
    console.log(`accessStatus: ${assignedTool.accessStatus || assignedTool.access_status}`);
    console.log(`server_name: ${assignedTool.server_name}`);
  } else {
    console.error('❌ Assigned tool not returned in slave response:', slavePostRes.json);
    process.exit(1);
  }

  // 7. Test HITL policy reflection
  console.log('\n--- Step 5: Enabling HITL Policy on Tool ---');
  await setToolHitlPolicy(operatorId, targetTool.id, true);
  const slaveHitlRes = await callApi('/api/floor/agent/tools', slaveToken);
  const hitlTool = slaveHitlRes.json?.data?.find((t: any) => t.id === targetTool.id);
  console.log(`Tool accessStatus after HITL enabled: ${hitlTool?.accessStatus || hitlTool?.access_status}`);
  if (hitlTool?.accessStatus === 'hitl' || hitlTool?.access_status === 'hitl') {
    console.log('✅ HITL status dynamically reflected to agent discovery.');
  } else {
    console.error('❌ Expected hitl accessStatus, got:', hitlTool);
    process.exit(1);
  }

  // 8. Revoke access
  console.log('\n--- Step 6: Revoking Tool Access ---');
  await setToolAssignment(operatorId, targetTool.id, slaveAgentId, false);
  const slaveRevokedRes = await callApi('/api/floor/agent/tools', slaveToken);
  console.log(`Slave Post-Revocation Tools Returned: ${slaveRevokedRes.json?.data?.length}`);
  if (slaveRevokedRes.status === 200 && slaveRevokedRes.json?.data?.length === 0) {
    console.log('✅ Immediate tool access revocation verified (0 tools returned).');
  } else {
    console.error('❌ Revocation failed to hide tool:', slaveRevokedRes.json);
    process.exit(1);
  }

  server.close();

  console.log('\n================================================================');
  console.log('ALL LIVE ENDPOINT CHECKS PASSED PERFECTLY (100% SPEC COMPLIANT)');
  console.log('================================================================');
}

verifyFloorEndpoint().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
