import { establishDirectConnection } from '../services/connectionService.ts';
import { getSupabaseClient } from '../supabase.ts';
import { watchtowerActivityService } from '../services/watchtowerActivityService.ts';

export async function runDirectConnectionAndClusterTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA DIRECT CONNECTION & CLUSTER MEMBERSHIP TEST SUITE ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  try {
    const supabase = getSupabaseClient();
    const testMasterId = `usr_test_master_${Date.now()}`;
    const testSlaveId = `usr_test_slave_${Date.now()}`;
    const testPeerMasterId = `usr_test_peer_${Date.now()}`;
    const testSlavePeerId = `usr_test_slave_peer_${Date.now()}`;

    // Seed test users in Supabase / mock store
    await supabase.from('users').insert([
      { id: testMasterId, agentId: `agent_m_${Date.now()}`, name: 'Test Master', account_type: 'master', is_master_primary: true },
      { id: testSlaveId, agentId: `agent_s_${Date.now()}`, name: 'Test Slave', account_type: 'slave', master_id: testMasterId },
      { id: testPeerMasterId, agentId: `agent_pm_${Date.now()}`, name: 'Test Peer Master', account_type: 'master', is_master_primary: true },
      { id: testSlavePeerId, agentId: `agent_sp_${Date.now()}`, name: 'Test Slave Peer', account_type: 'slave', master_id: testPeerMasterId },
    ]);

    // Test 1: Authorized direct connection succeeds without a request
    try {
      const conn = await establishDirectConnection(testMasterId, testPeerMasterId);
      if (conn && conn.id && conn.status === 'active') {
        recordResult('authorized_direct_connection_succeeds', true, `Connection established: ${conn.id}`);
      } else {
        recordResult('authorized_direct_connection_succeeds', false, 'Did not return active connection record');
      }
    } catch (e: any) {
      recordResult('authorized_direct_connection_succeeds', false, e?.message);
    }

    // Test 2: Unauthorized connections remain blocked (Slave-to-Slave connection forbidden)
    try {
      await establishDirectConnection(testSlaveId, testSlavePeerId);
      recordResult('unauthorized_slave_to_slave_blocked', false, 'Expected slave-to-slave connection to be forbidden');
    } catch (e: any) {
      if (e?.statusCode === 403 || e?.code === 'SLAVE_TO_SLAVE_CONNECTION_FORBIDDEN' || e?.message?.includes('prohibited')) {
        recordResult('unauthorized_slave_to_slave_blocked', true, 'Slave-to-slave connection successfully blocked');
      } else {
        recordResult('unauthorized_slave_to_slave_blocked', false, `Unexpected error: ${e?.message}`);
      }
    }

    // Test 3: Direct cluster member addition and removal without invitation
    const clusterId = `cls_${Date.now()}`;
    const { error: clusterErr } = await supabase.from('clusters').insert([
      { id: clusterId, name: 'Direct Cluster', ownerUserId: testMasterId, isPublic: true }
    ]);
    if (clusterErr) {
      recordResult('direct_cluster_operations', false, `Failed to create cluster: ${clusterErr.message}`);
    } else {
      // Add member directly without invitation
      const { error: memberErr } = await supabase.from('cluster_members').insert([
        { clusterId, userId: testPeerMasterId, role: 'member', joinedAt: new Date().toISOString() }
      ]);
      if (memberErr) {
        recordResult('direct_cluster_operations', false, `Failed to add member directly: ${memberErr.message}`);
      } else {
        // Verify member exists
        const { data: memberRec } = await supabase.from('cluster_members').select('*').eq('clusterId', clusterId).eq('userId', testPeerMasterId).maybeSingle();
        if (memberRec) {
          // Remove member directly
          await supabase.from('cluster_members').delete().eq('clusterId', clusterId).eq('userId', testPeerMasterId);
          const { data: removedRec } = await supabase.from('cluster_members').select('*').eq('clusterId', clusterId).eq('userId', testPeerMasterId).maybeSingle();
          if (!removedRec) {
            recordResult('direct_cluster_operations', true, 'Direct member addition and removal succeeded without invitation');
          } else {
            recordResult('direct_cluster_operations', false, 'Failed to remove member');
          }
        } else {
          recordResult('direct_cluster_operations', false, 'Member record not found after direct addition');
        }
      }
    }

    // Test 4: Watchtower records real state change exactly once and no retired events
    const activityKey = `test_watchtower_${Date.now()}`;
    await watchtowerActivityService.recordWatchtowerActivity({
      agentId: 'agent_m_test',
      agentName: 'Test Agent',
      avatar: '🤖',
      emailVerified: true,
      text: 'formed a connection with peer',
      type: 'connection',
      activityKey,
      actorUserId: testMasterId,
      masterId: testMasterId,
      createdAt: new Date().toISOString()
    });

    const activities = watchtowerActivityService.getRecentWatchtowerActivity({ userId: testMasterId, isMaster: true });
    const matched = (activities || []).filter((a: any) => a.activityKey === activityKey);
    if (matched.length === 1) {
      recordResult('watchtower_records_state_change_once', true, 'Recorded state change exactly once');
    } else {
      recordResult('watchtower_records_state_change_once', false, `Recorded count: ${matched.length}`);
    }

    // Cleanup test data
    await supabase.from('users').delete().in('id', [testMasterId, testSlaveId, testPeerMasterId, testSlavePeerId]);
    await supabase.from('clusters').delete().eq('id', clusterId);
    await supabase.from('connections').delete().or(`user1_id.eq.${testMasterId},user2_id.eq.${testMasterId}`);

  } catch (err: any) {
    recordResult('direct_connection_and_cluster_suite', false, err?.message || String(err));
  }

  return results;
}
