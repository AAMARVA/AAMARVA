import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import clusterRouter, { getClusterTables } from '../routes/clusterRoutes';
import { getSupabaseClient } from '../supabase';
import { registerUser, createHumanSession, getJwtSecret } from '../authService';
import jwt from 'jsonwebtoken';

export async function runClusterHumanOnlyTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA CLUSTER HUMAN-ONLY ENDPOINT SECURITY TEST SUITE ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  // 1. Setup real express app with standard cookie and JSON middleware
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', clusterRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const helperFetch = async (endpoint: string, options: any = {}) => {
    const res = await fetch(`${baseUrl}${endpoint}`, {
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
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);
    const ts = Date.now();

    // Setup Test Users:
    // Human A (Owner)
    const emailA = `cluster_human_owner_${ts}@aamarva.test`;
    const regA = await registerUser({ email: emailA, password: 'OwnerPassword123!', agentName: 'Cluster Owner' });
    const userA = regA.user;
    const sessionA = await createHumanSession(userA.id);

    // Human B (Non-owner)
    const emailB = `cluster_human_intruder_${ts}@aamarva.test`;
    const regB = await registerUser({ email: emailB, password: 'IntruderPassword123!', agentName: 'Cluster Intruder' });
    const userB = regB.user;
    const sessionB = await createHumanSession(userB.id);

    // Create a test cluster owned by Human A
    const cluster1Id = `clu_test_${ts}_1`;
    await supabase.from(tables.clusters).insert({
      id: cluster1Id,
      name: 'Original Cluster Name',
      description: 'Original Description',
      ownerUserId: userA.id,
      ownerAgentId: userA.agentId,
      status: 'active',
      createdAt: new Date().toISOString()
    });
    await supabase.from(tables.members).insert({
      id: `mem_${cluster1Id}_${userA.id}`,
      clusterId: cluster1Id,
      userId: userA.id,
      agentId: userA.agentId,
      role: 'admin',
      createdAt: new Date().toISOString()
    });

    // Create a second test cluster owned by Human A for deletion test
    const cluster2Id = `clu_test_${ts}_2`;
    await supabase.from(tables.clusters).insert({
      id: cluster2Id,
      name: 'Cluster To Disband',
      description: 'Disband Description',
      ownerUserId: userA.id,
      ownerAgentId: userA.agentId,
      status: 'active',
      createdAt: new Date().toISOString()
    });
    await supabase.from(tables.members).insert({
      id: `mem_${cluster2Id}_${userA.id}`,
      clusterId: cluster2Id,
      userId: userA.id,
      agentId: userA.agentId,
      role: 'admin',
      createdAt: new Date().toISOString()
    });

    // -------------------------------------------------------------
    // Test 1: Unauthenticated PATCH
    // -------------------------------------------------------------
    const test1 = await helperFetch(`/api/clusters/${cluster1Id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Hacked Name' })
    });
    recordResult(
      'unauthenticated_patch_rejected',
      test1.status === 401 && test1.json?.error?.code === 'UNAUTHORIZED',
      `HTTP ${test1.status}, code: ${test1.json?.error?.code}`
    );

    // -------------------------------------------------------------
    // Test 2: Agent API-key PATCH
    // -------------------------------------------------------------
    const test2a = await helperFetch(`/api/clusters/${cluster1Id}`, {
      method: 'PATCH',
      headers: { 'x-api-key': 'sk_amr_live_mock_agent_key_456' },
      body: JSON.stringify({ name: 'Agent Mod Name' })
    });
    const test2b = await helperFetch(`/api/clusters/${cluster1Id}`, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer sk_amr_live_mock_agent_key_456' },
      body: JSON.stringify({ name: 'Agent Mod Name 2' })
    });
    recordResult(
      'agent_api_key_patch_rejected',
      test2a.status === 403 && test2a.json?.error?.code === 'AGENT_ACCESS_FORBIDDEN' &&
      test2b.status === 403 && test2b.json?.error?.code === 'AGENT_ACCESS_FORBIDDEN',
      `Header x-api-key: HTTP ${test2a.status} (${test2a.json?.error?.code}), Bearer sk_amr: HTTP ${test2b.status}`
    );

    // -------------------------------------------------------------
    // Test 3: Valid human PATCH with permission
    // -------------------------------------------------------------
    const test3 = await helperFetch(`/api/clusters/${cluster1Id}`, {
      method: 'PATCH',
      headers: {
        'Cookie': `aamarva_human_session=${sessionA}`,
        'Authorization': `Bearer ${sessionA}`
      },
      body: JSON.stringify({ name: 'Updated Human Cluster', description: 'Updated Mission by Owner' })
    });
    const { data: updatedClu1 } = await supabase.from(tables.clusters).select('name, description').eq('id', cluster1Id).maybeSingle();
    recordResult(
      'valid_human_patch_with_permission_allowed',
      test3.status === 200 && test3.json?.success === true && updatedClu1?.name === 'Updated Human Cluster',
      `HTTP ${test3.status}, persisted name: ${updatedClu1?.name}`
    );

    // -------------------------------------------------------------
    // Test 4: Valid human PATCH without permission
    // -------------------------------------------------------------
    const test4 = await helperFetch(`/api/clusters/${cluster1Id}`, {
      method: 'PATCH',
      headers: {
        'Cookie': `aamarva_human_session=${sessionB}`
      },
      body: JSON.stringify({ name: 'Unauthorized Intrusion' })
    });
    const { data: nonUpdatedClu1 } = await supabase.from(tables.clusters).select('name').eq('id', cluster1Id).maybeSingle();
    recordResult(
      'valid_human_patch_without_permission_rejected',
      test4.status === 403 && test4.json?.error?.message?.includes('Only an admin or master can update this cluster') && nonUpdatedClu1?.name === 'Updated Human Cluster',
      `HTTP ${test4.status}, message: ${test4.json?.error?.message}`
    );

    // -------------------------------------------------------------
    // Test 5: Unauthenticated DELETE
    // -------------------------------------------------------------
    const test5 = await helperFetch(`/api/clusters/${cluster2Id}`, {
      method: 'DELETE'
    });
    recordResult(
      'unauthenticated_delete_rejected',
      test5.status === 401 && test5.json?.error?.code === 'UNAUTHORIZED',
      `HTTP ${test5.status}, code: ${test5.json?.error?.code}`
    );

    // -------------------------------------------------------------
    // Test 6: Agent API-key DELETE
    // -------------------------------------------------------------
    const test6a = await helperFetch(`/api/clusters/${cluster2Id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': 'sk_amr_live_mock_agent_key_456' }
    });
    const test6b = await helperFetch(`/api/clusters/${cluster2Id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer sk_amr_live_mock_agent_key_456' }
    });
    recordResult(
      'agent_api_key_delete_rejected',
      test6a.status === 403 && test6a.json?.error?.code === 'AGENT_ACCESS_FORBIDDEN' &&
      test6b.status === 403 && test6b.json?.error?.code === 'AGENT_ACCESS_FORBIDDEN',
      `Header x-api-key: HTTP ${test6a.status} (${test6a.json?.error?.code}), Bearer sk_amr: HTTP ${test6b.status}`
    );

    // -------------------------------------------------------------
    // Test 7: Valid human DELETE without permission
    // -------------------------------------------------------------
    const test7 = await helperFetch(`/api/clusters/${cluster2Id}`, {
      method: 'DELETE',
      headers: {
        'Cookie': `aamarva_human_session=${sessionB}`
      }
    });
    const { data: intactClu2 } = await supabase.from(tables.clusters).select('status').eq('id', cluster2Id).maybeSingle();
    recordResult(
      'valid_human_delete_without_permission_rejected',
      test7.status === 403 && test7.json?.error?.message?.includes('Only the owner can disband this cluster') && intactClu2?.status === 'active',
      `HTTP ${test7.status}, message: ${test7.json?.error?.message}`
    );

    // -------------------------------------------------------------
    // Test 8: Valid human DELETE with permission
    // -------------------------------------------------------------
    const test8 = await helperFetch(`/api/clusters/${cluster2Id}`, {
      method: 'DELETE',
      headers: {
        'Cookie': `aamarva_human_session=${sessionA}`,
        'Authorization': `Bearer ${sessionA}`
      }
    });
    const { data: dissolvedClu2 } = await supabase.from(tables.clusters).select('status').eq('id', cluster2Id).maybeSingle();
    recordResult(
      'valid_human_delete_with_permission_allowed',
      test8.status === 200 && test8.json?.success === true && dissolvedClu2?.status === 'dissolved',
      `HTTP ${test8.status}, status in DB: ${dissolvedClu2?.status}`
    );

    // -------------------------------------------------------------
    // Test 9: Invalid or expired human session
    // -------------------------------------------------------------
    // 9a. Forged JWT
    const forgedToken = jwt.sign({ userId: userA.id, type: 'human', sessionId: 'fake' }, 'wrong_secret');
    const test9a = await helperFetch(`/api/clusters/${cluster1Id}`, {
      method: 'PATCH',
      headers: { 'Cookie': `aamarva_human_session=${forgedToken}` },
      body: JSON.stringify({ name: 'Forged Update' })
    });
    // 9b. Expired JWT
    const expiredToken = jwt.sign(
      { userId: userA.id, type: 'human', sessionId: 'expired_sess', exp: Math.floor(Date.now() / 1000) - 3600 },
      getJwtSecret()
    );
    const test9b = await helperFetch(`/api/clusters/${cluster1Id}`, {
      method: 'PATCH',
      headers: { 'Cookie': `aamarva_human_session=${expiredToken}` },
      body: JSON.stringify({ name: 'Expired Update' })
    });
    recordResult(
      'invalid_or_expired_human_session_rejected',
      test9a.status === 401 && test9a.json?.error?.code === 'UNAUTHORIZED' &&
      test9b.status === 401 && test9b.json?.error?.code === 'UNAUTHORIZED',
      `Forged token: HTTP ${test9a.status}, Expired token: HTTP ${test9b.status}`
    );

    // -------------------------------------------------------------
    // Test 10: Nonexistent cluster
    // -------------------------------------------------------------
    const test10patch = await helperFetch(`/api/clusters/nonexistent_cluster_999999`, {
      method: 'PATCH',
      headers: { 'Cookie': `aamarva_human_session=${sessionA}` },
      body: JSON.stringify({ name: 'Does Not Exist' })
    });
    const test10delete = await helperFetch(`/api/clusters/nonexistent_cluster_999999`, {
      method: 'DELETE',
      headers: { 'Cookie': `aamarva_human_session=${sessionA}` }
    });
    recordResult(
      'nonexistent_cluster_preserved_404',
      test10patch.status === 404 && test10patch.json?.error?.message === 'Cluster not found.' &&
      test10delete.status === 404 && test10delete.json?.error?.message === 'Cluster not found.',
      `PATCH: HTTP ${test10patch.status}, DELETE: HTTP ${test10delete.status}`
    );

    // -------------------------------------------------------------
    // Test 11: Agent bypass attempt (human-looking identity in body/headers)
    // -------------------------------------------------------------
    const test11 = await helperFetch(`/api/clusters/${cluster1Id}`, {
      method: 'PATCH',
      headers: {
        'x-api-key': 'sk_amr_live_mock_agent_key_456',
        'x-user-type': 'human',
        'x-user-id': userA.id,
        'x-role': 'human'
      },
      body: JSON.stringify({
        name: 'Spoofed Human Update',
        type: 'human',
        userId: userA.id,
        user: { id: userA.id, type: 'human' }
      })
    });
    recordResult(
      'agent_bypass_attempt_rejected',
      test11.status === 403 && test11.json?.error?.code === 'AGENT_ACCESS_FORBIDDEN',
      `HTTP ${test11.status}, code: ${test11.json?.error?.code}`
    );

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  return results;
}
