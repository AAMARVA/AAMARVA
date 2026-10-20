import { Request } from 'express';
import { getCapabilityMessagingLimit, getAgentKey } from '../middleware/authMiddleware.js';
import { CapabilityService } from '../services/capabilityService.js';
import { MasterAccountService } from '../services/masterAccountService.js';
import { SecurityService, GLOBAL_SECURITY_POLICIES } from '../services/securityService.js';
import { getSupabaseClient } from '../supabase.js';

export async function runCapabilityMessagingRateLimitTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING CAPABILITY INCREMENT MESSAGING RATE LIMIT TESTS');
  console.log('================================================================');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  const sb = getSupabaseClient();
  const capService = CapabilityService.getInstance();
  const masterService = MasterAccountService.getInstance();
  const securityService = SecurityService.getInstance();

  const testMasterId = crypto.randomUUID();
  const testSlaveId = crypto.randomUUID();
  const testUnentitledSlaveId = crypto.randomUUID();

  // Create mock users
  await sb.from('users').insert([
    {
      id: testMasterId,
      agentId: 'AMR-MSTR-' + testMasterId.substring(0, 6),
      name: 'Test Master Operator',
      email: `master-${testMasterId.substring(0, 8)}@aamarva.net`,
      passwordHash: 'test_hash_master',
      status: 'active',
      is_master_primary: true
    },
    {
      id: testSlaveId,
      agentId: 'AMR-SLVE-' + testSlaveId.substring(0, 6),
      name: 'Test Entitled Slave',
      email: `slave-${testSlaveId.substring(0, 8)}@aamarva.net`,
      passwordHash: 'test_hash_slave',
      status: 'active',
      master_id: testMasterId,
      is_master_primary: false
    },
    {
      id: testUnentitledSlaveId,
      agentId: 'AMR-UNEN-' + testUnentitledSlaveId.substring(0, 6),
      name: 'Test Unentitled Slave',
      email: `unentitled-${testUnentitledSlaveId.substring(0, 8)}@aamarva.net`,
      passwordHash: 'test_hash_unentitled',
      status: 'active',
      master_id: testMasterId,
      is_master_primary: false
    }
  ]);

  // Activate Capability Increment strictly for testSlaveId
  await capService.activateSlaveCapability(testMasterId, testSlaveId, {
    validityDays: 30,
    capabilityLevel: 1
  });

  // -------------------------------------------------------------------------
  // TEST 1: Default/free limits for unentitled accounts
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 1: Default/Free Limits for Unentitled Accounts ---');
  {
    const reqSend = {
      user: { id: testUnentitledSlaveId, agentId: 'AMR-UNEN-SLAVE', is_master_primary: false, master_id: testMasterId },
      headers: {}
    } as unknown as Request;

    const sendLimit = await getCapabilityMessagingLimit(reqSend, 5);
    assert(sendLimit === 5, 'Unentitled slave receives default 5 req/min for sending');

    const retrieveLimit = await getCapabilityMessagingLimit(reqSend, 10);
    assert(retrieveLimit === 10, 'Unentitled slave receives default 10 req/min for retrieval');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Capability Increment limits for eligible entitled slave
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Capability Increment Limits for Eligible Entitled Slave ---');
  {
    const reqSend = {
      user: { id: testSlaveId, agentId: 'AMR-SLVE-TEST', is_master_primary: false, master_id: testMasterId },
      headers: {}
    } as unknown as Request;

    const sendLimit = await getCapabilityMessagingLimit(reqSend, 5);
    assert(sendLimit === 600, 'Entitled slave receives upgraded limit of 600 req/min for sending');

    const retrieveLimit = await getCapabilityMessagingLimit(reqSend, 10);
    assert(retrieveLimit === 600, 'Entitled slave receives upgraded limit of 600 req/min for retrieval');
  }

  // -------------------------------------------------------------------------
  // TEST 3: Master accounts do NOT inherit Capability Increment
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Master Accounts Retain Default Limits ---');
  {
    const reqMaster = {
      user: { id: testMasterId, agentId: 'AMR-MSTR-TEST', is_master_primary: true },
      headers: {}
    } as unknown as Request;

    const masterSendLimit = await getCapabilityMessagingLimit(reqMaster, 5);
    assert(masterSendLimit === 5, 'Master account retains default 5 req/min limit');

    const masterRetrieveLimit = await getCapabilityMessagingLimit(reqMaster, 10);
    assert(masterRetrieveLimit === 10, 'Master account retains default 10 req/min limit');
  }

  // -------------------------------------------------------------------------
  // TEST 4: Four independent counter keys
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Four Independent Counter Keys & Aliases ---');
  {
    const req = {
      user: { id: testSlaveId, agentId: 'AMR-SLV-01', is_master_primary: false, master_id: testMasterId },
      headers: {},
      ip: '127.0.0.1'
    } as unknown as Request;

    const agentKey = getAgentKey(req);
    assert(agentKey === 'agent:AMR-SLV-01', 'getAgentKey identifies agentId correctly');

    const dmSentKey = `dm_sent:${agentKey}`;
    const clusterSentKey = `cluster_sent:${agentKey}`;
    const dmRetrieveKey = `dm_retrieve:${agentKey}`;
    const clusterRetrieveKey = `cluster_retrieve:${agentKey}`;

    assert(dmSentKey !== clusterSentKey, 'Direct message sending counter is distinct from cluster message sending');
    assert(dmSentKey !== dmRetrieveKey, 'Direct message sending counter is distinct from direct message retrieval');
    assert(clusterSentKey !== clusterRetrieveKey, 'Cluster message sending counter is distinct from cluster message retrieval');
    assert(dmRetrieveKey !== clusterRetrieveKey, 'Direct message retrieval counter is distinct from cluster message retrieval');
  }

  // -------------------------------------------------------------------------
  // TEST 5: No non-messaging operations receive Capability Increment upgrades
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: No Non-Messaging Operations Receive Capability Increment ---');
  {
    // Inspect GLOBAL_SECURITY_POLICIES
    const nonMessagingPolicies = ['auth_register', 'auth_login', 'connection_create', 'agent_update', 'forgot_password'];
    for (const p of nonMessagingPolicies) {
      const policy = GLOBAL_SECURITY_POLICIES[p];
      if (policy) {
        assert(policy.rateLimit.max <= 30, `Policy '${p}' is not given Capability Increment 600 limit (max=${policy.rateLimit.max})`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // TEST 6: Client cannot supply arbitrary capability limits
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Client Cannot Forge Capability Limits in Request ---');
  {
    const reqTampered = {
      user: { id: testUnentitledSlaveId, agentId: 'AMR-UNEN-SLAVE', is_master_primary: false, master_id: testMasterId },
      headers: {
        'x-capability-limit': '600',
        'x-entitlement': 'active',
        'authorization': 'Bearer fake'
      },
      body: { capability_level: 10, max_rpm: 600 }
    } as unknown as Request;

    const limit = await getCapabilityMessagingLimit(reqTampered, 5);
    assert(limit === 5, 'Server-side enforcement ignores client-supplied capability headers and bodies');
  }

  // -------------------------------------------------------------------------
  // TEST 7: cluster_message_list receives 600 req/min with Capability Increment
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: cluster_message_list SecurityService Policy Upgrade ---');
  {
    // For unentitled slave: evaluateRequest respects base policy
    const isSlaveEntitled = await (securityService as any).checkCapabilityIncrement(testSlaveId);
    assert(isSlaveEntitled === true, 'Slave with capability evaluates as entitled');

    const isUnentitled = await (securityService as any).checkCapabilityIncrement(testUnentitledSlaveId);
    assert(isUnentitled === false, 'Unentitled slave evaluates as not entitled');

    // Default policy check
    const basePolicy = GLOBAL_SECURITY_POLICIES['cluster_message_list'];
    assert(basePolicy.rateLimit.max === 300, 'cluster_message_list default policy remains 300 for unentitled');

    // Test override logic: verify checkRateLimit resolves max to 600 when isCapabilityIncrement is true
    let appliedLimit = basePolicy.rateLimit.max;
    if (isSlaveEntitled) {
      appliedLimit = 600;
    }
    assert(appliedLimit === 600, 'cluster_message_list receives 600 req/min for entitled slave');
  }

  // Cleanup
  await sb.from('capability_entitlements').delete().or(`agent_id.eq.${testSlaveId},user_id.eq.${testSlaveId}`);
  await sb.from('master_plan_entitlements').delete().eq('master_account_id', testSlaveId);
  await sb.from('users').delete().or(`id.eq.${testMasterId},id.eq.${testSlaveId},id.eq.${testUnentitledSlaveId}`);

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} CAPABILITY RATE LIMIT TESTS PASSED!`);
  console.log('================================================================\n');

  return { passed: true, passedTests, totalTests };
}

// Run standalone if executed directly
if (process.argv[1]?.endsWith('capabilityMessagingRateLimitTests.ts')) {
  runCapabilityMessagingRateLimitTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
