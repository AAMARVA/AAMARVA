import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import clusterRouter, { getClusterTables } from '../routes/clusterRoutes';
import aamarvaRouter from '../routes/aamarvaRoutes';
import { getSupabaseClient } from '../supabase';
import { registerUser, createHumanSession } from '../authService';
import { getAgentProfile } from '../services/agentService';

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
  app.use('/api', aamarvaRouter);
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

    // Register peer member
    const regPeer = await registerUser({ email: `peer_edit_${ts}@aamarva.test`, password: 'Password123!', agentName: 'Peer Edit' });
    const peerUser = regPeer.user;
    const peerSession = await createHumanSession(peerUser.id);

    // Register slave user under owner
    const slaveId = `slave_user_${ts}`;
    const slaveAgentId = `AMR-SLAVE-${ts.toString().slice(-6)}`;
    await supabase.from('users').insert({
      id: slaveId,
      agentId: slaveAgentId,
      email: `slave_${ts}@aamarva.test`,
      name: 'Slave Agent',
      master_id: ownerUser.id,
      account_type: 'slave',
      role: 'slave',
      is_slave: true,
      status: 'active',
      createdAt: new Date().toISOString()
    });
    const slaveSession = await createHumanSession(slaveId);

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

    // Test 4: Add eligible agent (peerUser)
    const resAdd = await helperFetch(`/api/clusters/${clusterId}`, {
      method: 'PATCH',
      headers: { Cookie: cookieHeader },
      body: JSON.stringify({ memberAgentIds: [ownerUser.agentId, peerUser.agentId] })
    });
    const { data: membersAdded } = await supabase.from(tables.members).select('agentId, status').eq('clusterId', clusterId);
    const hasAddedAgent = (membersAdded || []).some((m: any) => m.agentId.toLowerCase() === peerUser.agentId.toLowerCase());
    recordResult('Add eligible agent', resAdd.status === 200 && hasAddedAgent, `Status: ${resAdd.status}, found added agent: ${hasAddedAgent}`);

    // Test 4b: Active membership visible to newly added peer
    const peerProfileBefore = await getAgentProfile(peerUser.agentId, true);
    const peerHasActiveCluster = (peerProfileBefore?.clusters || []).some((c: any) => c.id === clusterId && c.status === 'active');
    recordResult('Added agent sees active cluster', peerHasActiveCluster, `Cluster found in peer profile: ${peerHasActiveCluster}`);

    // Test 5: Owner cannot remove themselves via DELETE member endpoint
    const resRemoveOwner = await helperFetch(`/api/clusters/${clusterId}/members/${ownerUser.agentId}`, {
      method: 'DELETE',
      headers: { Cookie: cookieHeader }
    });
    recordResult('Owner removal prevented', resRemoveOwner.status === 400, `Status: ${resRemoveOwner.status}, message: ${resRemoveOwner.json?.error?.message}`);

    // Test 6: Remove member (peerUser) via DELETE member endpoint
    const resKick = await helperFetch(`/api/clusters/${clusterId}/members/${peerUser.agentId}`, {
      method: 'DELETE',
      headers: { Cookie: cookieHeader }
    });
    recordResult('Remove member endpoint succeeded', resKick.status === 200, `Status: ${resKick.status}`);

    // Test 7: Removed member no longer appears in Active Clusters
    const peerProfileAfter = await getAgentProfile(peerUser.agentId, true);
    const peerActiveClusters = (peerProfileAfter?.clusters || []).filter((c: any) => c.status !== 'dissolved');
    const stillInActiveClusters = peerActiveClusters.some((c: any) => c.id === clusterId);
    recordResult('Removed agent dashboard excludes cluster from Active Clusters', !stillInActiveClusters, `Cluster still active in profile: ${stillInActiveClusters}`);

    // Test 8: Removed member's direct API requests are rejected (403 Forbidden)
    const peerCookieHeader = `aamarva_human_session=${peerSession}`;
    const resPeerGetCluster = await helperFetch(`/api/clusters/${clusterId}`, {
      headers: { Cookie: peerCookieHeader }
    });
    const resPeerGetCrypto = await helperFetch(`/api/clusters/${clusterId}/members/crypto`, {
      headers: { Cookie: peerCookieHeader }
    });
    const resPeerGetMessages = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      headers: { Cookie: peerCookieHeader }
    });
    const resPeerPostMessage = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: { Cookie: peerCookieHeader },
      body: JSON.stringify({
        ciphertext: Buffer.from('test').toString('base64'),
        nonce: Buffer.from('123456789012').toString('base64'),
        version: 1,
        keyEpoch: 1
      })
    });
    const allRejected403 = resPeerGetCluster.status === 403 &&
                          resPeerGetCrypto.status === 403 &&
                          resPeerGetMessages.status === 403 &&
                          resPeerPostMessage.status === 403;
    recordResult(
      'Removed member direct API access rejected with 403',
      allRejected403,
      `GET cluster: ${resPeerGetCluster.status}, crypto: ${resPeerGetCrypto.status}, messages: ${resPeerGetMessages.status}, POST message: ${resPeerPostMessage.status}`
    );

    // Test 9: Slave UI messaging rejected on connection messages (403 SLAVE_UI_MESSAGING_DISABLED)
    const slaveCookieHeader = `aamarva_human_session=${slaveSession}`;
    const resSlaveConnMsg = await helperFetch(`/api/connections/messages/peer-test-id`, {
      method: 'POST',
      headers: { Cookie: slaveCookieHeader },
      body: JSON.stringify({
        ciphertext: Buffer.from('test').toString('base64'),
        nonce: Buffer.from('123456789012').toString('base64')
      })
    });
    const slaveConnRejected = resSlaveConnMsg.status === 403 && resSlaveConnMsg.json?.error?.code === 'SLAVE_UI_MESSAGING_DISABLED';
    recordResult('Slave account connection messaging rejected in UI session', slaveConnRejected, `Status: ${resSlaveConnMsg.status}, code: ${resSlaveConnMsg.json?.error?.code}`);

    // Test 10: Slave UI messaging rejected on cluster messages (403 SLAVE_UI_MESSAGING_DISABLED)
    const resSlaveClusterMsg = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: { Cookie: slaveCookieHeader },
      body: JSON.stringify({
        ciphertext: Buffer.from('test').toString('base64'),
        nonce: Buffer.from('123456789012').toString('base64'),
        version: 1,
        keyEpoch: 1
      })
    });
    const slaveClusterRejected = resSlaveClusterMsg.status === 403 && resSlaveClusterMsg.json?.error?.code === 'SLAVE_UI_MESSAGING_DISABLED';
    recordResult('Slave account cluster messaging rejected in UI session', slaveClusterRejected, `Status: ${resSlaveClusterMsg.status}, code: ${resSlaveClusterMsg.json?.error?.code}`);

    // Test 11: Owner remains a member after reload
    const { data: reloadMembers } = await supabase.from(tables.members).select('*').eq('clusterId', clusterId).neq('status', 'dissolved');
    const ownerMemberPresent = (reloadMembers || []).some((m: any) => (m.role === 'owner' || m.role === 'admin') && m.userId === ownerUser.id);
    recordResult('Owner remains active member in database after reload', ownerMemberPresent, `Owner present: ${ownerMemberPresent}, active members count: ${reloadMembers?.length}`);

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
