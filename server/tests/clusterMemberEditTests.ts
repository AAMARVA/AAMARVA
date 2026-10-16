import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import clusterRouter, { getClusterTables } from '../routes/clusterRoutes';
import { getSupabaseClient } from '../supabase';
import { registerUser, createHumanSession } from '../authService';

export async function runClusterMemberEditTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA EDIT CLUSTER MEMBER & SAVE REGRESSION TEST SUITE ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

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

    // Register test owner
    const regOwner = await registerUser({ email: `owner_edit_${ts}@aamarva.test`, password: 'Password123!', agentName: 'Owner Edit' });
    const ownerUser = regOwner.user;
    const ownerSession = await createHumanSession(ownerUser.id);

    const clusterId = `clu_edit_test_${ts}`;
    await supabase.from(tables.clusters).insert({
      id: clusterId,
      name: 'Initial Name',
      description: 'Initial Description',
      ownerUserId: ownerUser.id,
      ownerAgentId: ownerUser.agentId,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    await supabase.from(tables.members).insert({
      id: `mem_${clusterId}_owner`,
      clusterId,
      userId: ownerUser.id,
      agentId: ownerUser.agentId,
      role: 'owner',
      status: 'active',
      createdAt: new Date().toISOString()
    });

    const cookieHeader = `aamarva_human_session=${ownerSession}`;

    // Test 1: Save changed name without overwriting description
    const resName = await helperFetch(`/api/clusters/${clusterId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieHeader },
      body: JSON.stringify({ name: 'Updated Cluster Name' })
    });
    const { data: clFetched } = await supabase.from(tables.clusters).select('name, description').eq('id', clusterId).single();
    recordResult('Save changed name', resName.status === 200 && clFetched?.name === 'Updated Cluster Name' && clFetched?.description === 'Initial Description', `Status: ${resName.status}, name: ${clFetched?.name}, desc: ${clFetched?.description}`);

    // Test 2: Save changed description without overwriting name
    const resDesc = await helperFetch(`/api/clusters/${clusterId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieHeader },
      body: JSON.stringify({ description: 'Updated Description Text' })
    });
    const { data: clFetched2 } = await supabase.from(tables.clusters).select('name, description').eq('id', clusterId).single();
    recordResult('Save changed description', resDesc.status === 200 && clFetched2?.name === 'Updated Cluster Name' && clFetched2?.description === 'Updated Description Text', `Status: ${resDesc.status}, name: ${clFetched2?.name}, desc: ${clFetched2?.description}`);

    // Test 3: Clear description (send null/empty)
    const resClearDesc = await helperFetch(`/api/clusters/${clusterId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieHeader },
      body: JSON.stringify({ description: null })
    });
    const { data: clFetched3 } = await supabase.from(tables.clusters).select('description').eq('id', clusterId).single();
    recordResult('Clear description', resClearDesc.status === 200 && !clFetched3?.description, `Status: ${resClearDesc.status}, desc: ${clFetched3?.description}`);

    // Test 4: Add eligible agent / master-slave agent
    const testAgentId = `agent_test_${ts}`;
    const resAdd = await helperFetch(`/api/clusters/${clusterId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieHeader },
      body: JSON.stringify({ memberAgentIds: [ownerUser.agentId, testAgentId] })
    });
    const { data: membersAdded } = await supabase.from(tables.members).select('agentId').eq('clusterId', clusterId);
    const hasAddedAgent = (membersAdded || []).some((m: any) => m.agentId.toLowerCase() === testAgentId.toLowerCase());
    recordResult('Add eligible agent', resAdd.status === 200 && hasAddedAgent, `Status: ${resAdd.status}, found added agent: ${hasAddedAgent}`);

    // Test 5: Remove member by omitting from memberAgentIds
    const resRemove = await helperFetch(`/api/clusters/${clusterId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieHeader },
      body: JSON.stringify({ memberAgentIds: [ownerUser.agentId] })
    });
    const { data: membersAfterRemove } = await supabase.from(tables.members).select('agentId').eq('clusterId', clusterId);
    const stillHasAgent = (membersAfterRemove || []).some((m: any) => m.agentId.toLowerCase() === testAgentId.toLowerCase());
    recordResult('Remove member', resRemove.status === 200 && !stillHasAgent, `Status: ${resRemove.status}, agent removed: ${!stillHasAgent}`);

    // Test 6: Persisted membership and owner protection after reload
    const { data: reloadMembers } = await supabase.from(tables.members).select('*').eq('clusterId', clusterId);
    const ownerMemberPresent = (reloadMembers || []).some((m: any) => m.role === 'owner' || m.role === 'admin');
    recordResult('Persisted membership and owner protection', ownerMemberPresent && reloadMembers?.length === 1, `Owner/admin present: ${ownerMemberPresent}, total members: ${reloadMembers?.length}`);

  } catch (err: any) {
    console.error('Test suite error:', err);
    recordResult('Test Suite Execution', false, err?.message);
  } finally {
    server.close();
  }

  const failures = Object.values(results).filter(r => r.status === 'FAILED');
  if (failures.length > 0) {
    console.error(`\n[FAILURE] ${failures.length} test(s) failed in Cluster Member Edit suite.`);
  } else {
    console.log('\n[SUCCESS] All Cluster Member Edit tests PASSED.');
  }

  return results;
}
