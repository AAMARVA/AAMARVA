import { getSupabaseClient } from '../server/supabase.js';
import { registerUser } from '../server/authService.js';
import crypto from 'crypto';

async function main() {
  const email1 = `demo_agent_1_${Date.now()}@aamarva.net`;
  const email2 = `demo_agent_2_${Date.now()}@aamarva.net`;
  const password1 = 'ClusterPass123!';
  const password2 = 'ClusterPass123!';

  console.log('1. Registering Account 1...');
  const res1 = await registerUser({
    email: email1,
    password: password1,
    name: 'Alpha Founder Agent',
    bio: 'Founder of test cluster'
  });

  console.log('1. Account 1 created:', {
    email: res1.user.email,
    agentId: res1.user.agentId,
    password: password1
  });

  console.log('2. Registering Account 2...');
  const res2 = await registerUser({
    email: email2,
    password: password2,
    name: 'Beta Member Agent',
    bio: 'Member of test cluster'
  });

  console.log('2. Account 2 created:', {
    email: res2.user.email,
    agentId: res2.user.agentId,
    password: password2
  });

  const supabase = getSupabaseClient();

  console.log('3. Creating cluster by Account 1...');
  const clusterId = `cls_${Date.now().toString(36)}`;
  const clusterName = 'Delta Protocol Alliance';
  
  const { data: clusterData, error: clusterErr } = await supabase
    .from('clusters')
    .insert({
      id: clusterId,
      name: clusterName,
      description: 'A test cluster demonstrating cluster formation, multi-agent membership, and member departure.',
      ownerUserId: res1.user.id,
      ownerAgentId: res1.user.agentId,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    .select()
    .single();

  if (clusterErr) {
    console.error('Failed to create cluster:', clusterErr);
    return;
  }

  console.log('Cluster created:', clusterData.id, clusterData.name);

  console.log('4. Adding Account 1 as admin/founder member...');
  const { error: member1Err } = await supabase
    .from('cluster_members')
    .insert({
      id: `member_${crypto.randomUUID()}`,
      clusterId: clusterId,
      userId: res1.user.id,
      agentId: res1.user.agentId,
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString()
    });

  if (member1Err) {
    console.error('Failed to add member 1:', member1Err);
    return;
  }

  console.log('5. Adding Account 2 as active member...');
  const { error: member2Err } = await supabase
    .from('cluster_members')
    .insert({
      id: `member_${crypto.randomUUID()}`,
      clusterId: clusterId,
      userId: res2.user.id,
      agentId: res2.user.agentId,
      role: 'member',
      status: 'active',
      createdAt: new Date().toISOString()
    });

  if (member2Err) {
    console.error('Failed to add member 2:', member2Err);
    return;
  }

  console.log('Both Account 1 and Account 2 are now active members of cluster:', clusterId);

  console.log('6. Account 2 leaves the cluster...');
  const { error: leaveErr } = await supabase
    .from('cluster_members')
    .update({ status: 'dissolved' })
    .eq('clusterId', clusterId)
    .eq('userId', res2.user.id);

  if (leaveErr) {
    console.error('Failed to leave cluster:', leaveErr);
    return;
  }

  console.log('Account 2 has left the cluster (membership status updated to dissolved).');

  console.log('\n==================================================');
  console.log('          CREATED ACCOUNTS & CLUSTER              ');
  console.log('==================================================');
  console.log('ACCOUNT 1 (Founder / Admin):');
  console.log(`  Email:    ${res1.user.email}`);
  console.log(`  Password: ${password1}`);
  console.log(`  Agent ID: ${res1.user.agentId}`);
  console.log('--------------------------------------------------');
  console.log('ACCOUNT 2 (Member who left):');
  console.log(`  Email:    ${res2.user.email}`);
  console.log(`  Password: ${password2}`);
  console.log(`  Agent ID: ${res2.user.agentId}`);
  console.log('--------------------------------------------------');
  console.log('CLUSTER DETAILS:');
  console.log(`  Cluster ID:   ${clusterId}`);
  console.log(`  Cluster Name: ${clusterName}`);
  console.log(`  Status:       Active (Account 1: Active Admin, Account 2: Dissolved/Left)`);
  console.log('==================================================\n');
}

main().catch(console.error);
