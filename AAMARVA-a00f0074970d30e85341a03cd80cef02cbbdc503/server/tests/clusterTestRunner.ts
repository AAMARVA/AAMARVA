import { getSupabaseClient } from '../supabase';
import { getClusterTables } from '../routes/clusterRoutes';

export async function runClusterDissolveTests() {
  console.log('[CLUSTER_TEST] Starting cluster dissolve & membership status tests...');
  const supabase = getSupabaseClient();
  const tables = await getClusterTables(supabase);

  // 1. Create a test cluster directly or via database helper
  const clusterId = `cluster_test_${Date.now()}`;
  const ownerUserId = 'test_owner_user_id_' + Date.now();
  const ownerAgentId = 'AMR-OWNER-' + Math.floor(Math.random() * 10000);

  // Ensure test owner user exists in users table if needed (or mock foreign key)
  // Let's create dummy users for test owner and member
  const memberUserId = 'test_member_user_id_' + Date.now();
  const memberAgentId = 'AMR-MEMBER-' + Math.floor(Math.random() * 10000);

  console.log('[CLUSTER_TEST] Inserting test users...');
  await supabase.from('users').upsert([
    {
      id: ownerUserId,
      agentId: ownerAgentId,
      email: `owner_${Date.now()}@test.com`,
      passwordHash: 'dummy',
      name: 'Test Owner Agent'
    },
    {
      id: memberUserId,
      agentId: memberAgentId,
      email: `member_${Date.now()}@test.com`,
      passwordHash: 'dummy',
      name: 'Test Member Agent'
    }
  ]);

  console.log('[CLUSTER_TEST] Creating test cluster...');
  await supabase.from(tables.clusters).insert({
    id: clusterId,
    name: 'Test Dissolve Cluster',
    description: 'Testing cluster dissolve status',
    ownerUserId: ownerUserId,
    ownerAgentId: ownerAgentId,
    status: 'active'
  });

  // Insert owner as admin member
  const ownerMemberId = `member_owner_${Date.now()}`;
  await supabase.from(tables.members).insert({
    id: ownerMemberId,
    clusterId,
    userId: ownerUserId,
    agentId: ownerAgentId,
    role: 'admin',
    status: 'active'
  });

  // Insert regular member
  const regMemberId = `member_reg_${Date.now()}`;
  await supabase.from(tables.members).insert({
    id: regMemberId,
    clusterId,
    userId: memberUserId,
    agentId: memberAgentId,
    role: 'member',
    status: 'active'
  });

  console.log('[CLUSTER_TEST] Test setup complete. Testing Scenario 1: Member leaves cluster...');
  // Simulate member leaving
  await supabase
    .from(tables.members)
    .update({ status: 'dissolved' })
    .eq('id', regMemberId);

  const { data: memberCheck } = await supabase
    .from(tables.members)
    .select('status')
    .eq('id', regMemberId)
    .single();

  if (memberCheck?.status !== 'dissolved') {
    throw new Error(`Scenario 1 failed: Member status should be 'dissolved', got '${memberCheck?.status}'`);
  }
  console.log('[CLUSTER_TEST] ✅ Scenario 1 passed: Member status is dissolved after leaving.');

  console.log('[CLUSTER_TEST] Testing Scenario 2: Cluster gets disbanded...');
  // Simulate cluster disbanding -> cluster status 'dissolved' and all members 'dissolved'
  await supabase
    .from(tables.clusters)
    .update({ status: 'dissolved', updatedAt: new Date().toISOString() })
    .eq('id', clusterId);

  await supabase
    .from(tables.members)
    .update({ status: 'dissolved' })
    .eq('clusterId', clusterId);

  const { data: clusterCheck } = await supabase
    .from(tables.clusters)
    .select('status')
    .eq('id', clusterId)
    .single();

  const { data: allMembersCheck } = await supabase
    .from(tables.members)
    .select('agentId, status')
    .eq('clusterId', clusterId);

  if (clusterCheck?.status !== 'dissolved') {
    throw new Error(`Scenario 2 failed: Cluster status should be 'dissolved'`);
  }

  for (const m of (allMembersCheck || [])) {
    if (m.status !== 'dissolved') {
      throw new Error(`Scenario 2 failed: Member ${m.agentId} status should be 'dissolved', got '${m.status}'`);
    }
  }

  console.log('[CLUSTER_TEST] ✅ Scenario 2 passed: Cluster and all members (including admin) status are dissolved.');

  // Cleanup test data
  await supabase.from(tables.members).delete().eq('clusterId', clusterId);
  await supabase.from(tables.clusters).delete().eq('id', clusterId);
  await supabase.from('users').delete().in('id', [ownerUserId, memberUserId]);

  console.log('[CLUSTER_TEST] All cluster dissolve tests completed successfully!');
}
