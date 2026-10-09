import { MasterAccountService } from '../services/masterAccountService.js';
import { CapabilityService } from '../services/capabilityService.js';
import { SecurityService } from '../services/securityService.js';
import { getSupabaseClient } from '../supabase.js';

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING SEPARATE MASTER/SLAVE PLAN & CAPABILITY TEST SUITE');
  console.log('================================================================');

  const sb = getSupabaseClient();
  const masterService = MasterAccountService.getInstance();
  const capService = CapabilityService.getInstance();
  const securityService = SecurityService.getInstance();

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

  // Generate valid UUIDs for PostgreSQL schema compatibility
  const testMasterId = crypto.randomUUID();
  const testSlaveAId = crypto.randomUUID();
  const testSlaveBId = crypto.randomUUID();
  const testSlaveCId = crypto.randomUUID();

  console.log(`\nUsing test Master: ${testMasterId}`);
  console.log(`Using test Slaves: ${testSlaveAId}, ${testSlaveBId}, ${testSlaveCId}`);

  // Setup mock records in users table
  const { error: insertErr } = await sb.from('users').insert([
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
      id: testSlaveAId,
      agentId: 'AMR-SLVA-' + testSlaveAId.substring(0, 6),
      name: 'Test Slave Node A',
      email: `slave-a-${testSlaveAId.substring(0, 8)}@aamarva.net`,
      passwordHash: 'test_hash_slave_a',
      status: 'active',
      master_id: testMasterId,
      is_master_primary: false
    },
    {
      id: testSlaveBId,
      agentId: 'AMR-SLVB-' + testSlaveBId.substring(0, 6),
      name: 'Test Slave Node B',
      email: `slave-b-${testSlaveBId.substring(0, 8)}@aamarva.net`,
      passwordHash: 'test_hash_slave_b',
      status: 'active',
      master_id: testMasterId,
      is_master_primary: false
    },
    {
      id: testSlaveCId,
      agentId: 'AMR-SLVC-' + testSlaveCId.substring(0, 6),
      name: 'Test Slave Node C',
      email: `slave-c-${testSlaveCId.substring(0, 8)}@aamarva.net`,
      passwordHash: 'test_hash_slave_c',
      status: 'active',
      master_id: testMasterId,
      is_master_primary: false
    }
  ]);

  if (insertErr) {
    console.error('Insert error creating test users:', insertErr);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // TEST 1: No-plan state must remain genuinely inactive (0 slots, no fallback)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 1: Genuinely Inactive No-Plan State (0 slots, no 10-slot fallback) ---');
  {
    const plan = await masterService.getMasterPlan(testMasterId, true);
    assert(plan === null, 'No plan returned for unpurchased account');

    const account = await masterService.getMasterAccount(testMasterId);
    assert(account?.plan_status === 'INACTIVE', 'Master account status is INACTIVE');
    assert(account?.max_sub_agents === 0, 'Available slave slots is strictly 0 (not manufactured 10)');

    let allocationFailed = false;
    try {
      await masterService.allocateSlaveSlotsAtomic(testMasterId, 1);
    } catch (e: any) {
      allocationFailed = true;
      assert(e.message.includes('No active Master/Slave plan'), 'Allocation rejected with 0 slots available');
    }
    assert(allocationFailed, 'Cannot allocate slaves without an active Master plan');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Master/Slave Plan Activation & Authoritative Allowance
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Master/Slave Plan Controls Slave Account Slots ---');
  {
    const plan = await masterService.activateMasterPlan(testMasterId, 10, { actionType: 'new_plan' });
    assert(plan.status === 'active', 'Master plan activated');
    assert(plan.allowance_accounts === 10, 'Master plan allowance set to 10');

    // Verify rate limit on Master is NOT capability upgraded
    const masterHasCap = await (securityService as any).checkCapabilityIncrement(testMasterId);
    assert(masterHasCap === false, 'Master does NOT receive capability increment from plan activation');

    // Verify Slaves do NOT inherit capability
    const slaveAHasCap = await (securityService as any).checkCapabilityIncrement(testSlaveAId);
    assert(slaveAHasCap === false, 'Slave A does NOT inherit capability increment from Master plan');
  }

  // -------------------------------------------------------------------------
  // TEST 3: Capability Increment Rejects Master Account Target
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Capability Increment Cannot Attach to Master ---');
  {
    let masterRejected = false;
    try {
      await capService.activateSlaveCapability(testMasterId, testMasterId);
    } catch (e: any) {
      masterRejected = true;
      assert(e.message.includes('cannot be attached to the Master'), 'Explicit error when targeting Master');
    }
    assert(masterRejected, 'Master cannot be assigned a capability increment');
  }

  // -------------------------------------------------------------------------
  // TEST 4: Capability Increment Targets Specific Slave (Slave A)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Capability Increment Targets Specific Slave Only ---');
  {
    const initialMasterPlan = await masterService.getMasterPlan(testMasterId, true);
    const initialAllowance = initialMasterPlan!.allowance_accounts;
    const initialExpiry = initialMasterPlan!.expires_at;

    const capA = await capService.activateSlaveCapability(testMasterId, testSlaveAId, { validityDays: 30 });
    assert(capA !== null, 'Capability entitlement activated for Slave A');
    assert(capA.user_id === testSlaveAId, 'Capability tied strictly to Slave A user_id');
    assert(capA.agent_id.startsWith('AMR-SLVA-') || capA.agent_id === testSlaveAId, 'Capability tied strictly to Slave A agent_id');
    assert(capA.agent_id !== testMasterId, 'Capability is NOT tied to Master account ID');
    assert(capA.status === 'active', 'Capability status is active');

    // CRITICAL: Buying capability for Slave A must NOT modify Master plan or allowance
    const postMasterPlan = await masterService.getMasterPlan(testMasterId, true);
    assert(postMasterPlan!.allowance_accounts === initialAllowance, 'Slave A capability did NOT alter Master allowance');
    assert(postMasterPlan!.expires_at === initialExpiry, 'Slave A capability did NOT alter Master expiry');

    // Verify Slave B has NO capability entitlement
    const capB = await capService.getAgentCapability(testSlaveBId);
    assert(capB === null, 'Slave B has NO capability entitlement');
  }

  // -------------------------------------------------------------------------
  // TEST 5: Rate-limit Lookup Uses Requesting Slave's Entitlement
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Rate-Limit Lookup Uses Requesting Slave Identity Directly ---');
  {
    // Slave A has capability increment → TRUE
    const slaveAUpgraded = await (securityService as any).checkCapabilityIncrement(testSlaveAId);
    assert(slaveAUpgraded === true, 'Slave A receives boosted capability limits');

    // Slave B has no capability increment → FALSE
    const slaveBUpgraded = await (securityService as any).checkCapabilityIncrement(testSlaveBId);
    assert(slaveBUpgraded === false, 'Slave B remains on normal rate limits');

    // Slave C: activate capability → TRUE
    await capService.activateSlaveCapability(testMasterId, testSlaveCId, { validityDays: 30 });
    const slaveCUpgraded = await (securityService as any).checkCapabilityIncrement(testSlaveCId);
    assert(slaveCUpgraded === true, 'Slave C receives boosted capability limits');

    // Slave B STILL FALSE
    const slaveBStillNormal = await (securityService as any).checkCapabilityIncrement(testSlaveBId);
    assert(slaveBStillNormal === false, 'Slave B remains strictly normal while A and C are boosted');
  }

  // -------------------------------------------------------------------------
  // TEST 6: Authoritative Capability Expiry
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Authoritative Capability Expiry (Individual Slave Expiry) ---');
  {
    // Manually set Slave A's capability to expired in past
    const pastDate = new Date(Date.now() - 10000).toISOString();
    await sb
      .from('capability_entitlements')
      .update({ expires_at: pastDate })
      .or(`agent_id.eq.${testSlaveAId},user_id.eq.${testSlaveAId}`);
    
    capService.invalidateCapabilityCache(testSlaveAId);

    // Slave A should now evaluate to normal limits
    const slaveAAfterExpiry = await (securityService as any).checkCapabilityIncrement(testSlaveAId);
    assert(slaveAAfterExpiry === false, 'Expired Slave A returns to normal rate limits');

    // Slave C remains active and unaffected
    const slaveCAfterSlaveAExpiry = await (securityService as any).checkCapabilityIncrement(testSlaveCId);
    assert(slaveCAfterSlaveAExpiry === true, 'Slave C capability remains active and unaffected');
  }

  // -------------------------------------------------------------------------
  // TEST 7: Atomic Slave-Slot Allocation with FOR UPDATE
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: Atomic Slave-Slot Allocation (FOR UPDATE Boundary Protection) ---');
  {
    // Master plan has 10 allowance. Deployed slaves under testMasterId: 3 (Slave A, B, C).
    // Requesting 7 more slots should succeed (3 + 7 = 10)
    const allocSuccess = await masterService.allocateSlaveSlotsAtomic(testMasterId, 7);
    assert(allocSuccess.success === true, 'Allocating within allowance succeeds');

    // Requesting 8 slots should fail (3 + 8 = 11 > 10)
    let overflowCaught = false;
    try {
      await masterService.allocateSlaveSlotsAtomic(testMasterId, 8);
    } catch (e: any) {
      overflowCaught = true;
      assert(e.message.includes('allowance limit exceeded'), 'Overflow request blocked atomically');
    }
    assert(overflowCaught, 'Atomic check prevented exceeding Master plan allowance');
  }

  // -------------------------------------------------------------------------
  // TEST 8: Authoritative Master-Plan Expiry
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 8: Authoritative Master-Plan Expiry (No Resurrections) ---');
  {
    const pastDate = new Date(Date.now() - 60000).toISOString();
    await sb
      .from('master_plan_entitlements')
      .update({ expires_at: pastDate })
      .eq('master_account_id', testMasterId);

    masterService.invalidateMasterPlanCache(testMasterId);

    const expiredPlan = await masterService.getMasterPlan(testMasterId, true);
    assert(expiredPlan === null, 'Expired master plan yields null active plan');

    let createOnExpiredBlocked = false;
    try {
      await masterService.allocateSlaveSlotsAtomic(testMasterId, 1);
    } catch (e: any) {
      createOnExpiredBlocked = true;
      assert(e.message.includes('expired') || e.message.includes('No active Master/Slave plan'), 'Slave creation blocked on expired plan');
    }
    assert(createOnExpiredBlocked, 'Expired Master plan prohibits creating additional Slaves');
  }

  // Cleanup test records
  console.log('\n--- Cleaning up test records ---');
  await sb.from('capability_entitlements').delete().or(`master_id.eq.${testMasterId},agent_id.eq.${testSlaveAId},agent_id.eq.${testSlaveBId},agent_id.eq.${testSlaveCId}`);
  await sb.from('master_plan_entitlements').delete().eq('master_account_id', testMasterId);
  await sb.from('users').delete().or(`id.eq.${testMasterId},id.eq.${testSlaveAId},id.eq.${testSlaveBId},id.eq.${testSlaveCId}`);

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================\n');
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
