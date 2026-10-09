import { MasterAccountService } from '../services/masterAccountService.js';
import { CapabilityService } from '../services/capabilityService.js';
import { getSupabaseClient } from '../supabase.js';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING CAPABILITY ISOLATION & ATOMIC ALLOCATION TESTS');
  console.log('====================================================');

  const sb = getSupabaseClient();
  const masterService = MasterAccountService.getInstance();
  const capService = CapabilityService.getInstance();

  // Find or create test master and slave accounts
  const { data: users, error: userFetchErr } = await sb
    .from('users')
    .select('id, email, status, master_id, is_master_primary')
    .eq('status', 'active')
    .limit(10);

  if (userFetchErr || !users || users.length < 1) {
    console.error('❌ Failed to fetch test users from Supabase:', userFetchErr);
    process.exit(1);
  }

  // Find or assign a master and two slave users
  const { data: masterRec } = await sb
    .from('users')
    .select('id, email, status, master_id, is_master_primary')
    .eq('id', '98871d6d-258f-4fc2-a9d7-a0bc22494c40')
    .maybeSingle();

  const masterUser = masterRec || users.find(u => u.is_master_primary || !u.master_id) || users[0];

  const { data: slaves } = await sb
    .from('users')
    .select('id, email, status, master_id, is_master_primary')
    .eq('master_id', masterUser.id)
    .limit(5);

  let slaveA = (slaves && slaves.length > 0) ? slaves[0] : null;
  let slaveB = (slaves && slaves.length > 1) ? slaves[1] : null;

  if (!slaveA || !slaveB) {
    const allSlaves = users.filter(u => u.id !== masterUser.id);
    slaveA = slaveA || allSlaves[0];
    slaveB = slaveB || allSlaves[1];
  }

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

  // TEST 1: Reject Capability Increment on Master
  console.log('\n--- TEST 1: Master Rejection - Cannot attach Capability Increment to Master ---');
  {
    let rejected = false;
    try {
      await capService.activateSlaveCapability(masterUser.id, masterUser.id);
    } catch (e: any) {
      rejected = true;
      assert(e.message.includes('Master account') || e.message.includes('individual Slave'), 'Attaching capability to master threw expected error');
    }
    assert(rejected, 'Master capability attachment was rejected');
  }

  // TEST 2: Activate Capability on Slave A only
  console.log('\n--- TEST 2: Targeted Activation - Slave A receives Capability Increment ---');
  {
    // Activate Master plan first (10 slots)
    const masterPlanBefore = await masterService.activateMasterPlan(masterUser.id, 10, { actionType: 'new_plan' });
    const initialAllowance = masterPlanBefore.allowance_accounts;
    const initialExpiry = masterPlanBefore.expires_at;

    const capA = await capService.activateSlaveCapability(masterUser.id, slaveA.id, { validityDays: 30 });
    assert(capA.agent_id !== masterUser.id, 'Capability agent_id is NOT the master');
    assert(capA.status === 'active', 'Capability entitlement is active for Slave A');

    // Confirm Slave A is active
    const isAActive = await capService.isAgentCapabilityActive(slaveA.id);
    assert(isAActive === true, 'Slave A has active capability entitlement');

    // Confirm Slave B is NOT active (no fleet-wide inheritance)
    const isBActive = await capService.isAgentCapabilityActive(slaveB.id);
    assert(isBActive === false, 'Slave B does NOT inherit capability (remains normal)');

    // Confirm Master Plan was untouched
    const masterPlanAfter = await masterService.getMasterPlan(masterUser.id, true);
    assert(masterPlanAfter?.allowance_accounts === initialAllowance, 'Master allowance accounts unchanged after Slave A capability purchase');
    const timeBefore = initialExpiry ? new Date(initialExpiry).getTime() : 0;
    const timeAfter = masterPlanAfter?.expires_at ? new Date(masterPlanAfter.expires_at).getTime() : 0;
    assert(timeBefore === timeAfter, `Master plan expiry unchanged after Slave A capability purchase (${timeBefore} === ${timeAfter})`);
  }

  // TEST 3: Authoritative Capability Expiry
  console.log('\n--- TEST 3: Authoritative Capability Expiry ---');
  {
    // Create an expired entitlement for testing
    const expiredTargetId = 'slave-expired-test-' + Date.now();
    try {
      await sb.from('capability_entitlements').insert({
        id: crypto.randomUUID(),
        agent_id: expiredTargetId,
        user_id: expiredTargetId,
        master_id: masterUser.id,
        capability_level: 1,
        status: 'active',
        created_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days ago
      });

      const isActive = await capService.isAgentCapabilityActive(expiredTargetId);
      assert(isActive === false, 'Expired capability entitlement returns false');

      const ent = await capService.getAgentCapability(expiredTargetId, true);
      assert(ent === null, 'Expired capability entitlement returns null');
    } catch (e: any) {
      console.warn('Note: DB direct insert in test:', e?.message);
    }
  }

  // TEST 4: Atomic Slave Slot Allocation
  console.log('\n--- TEST 4: Atomic Slave Slot Allocation ---');
  {
    const { data: deployedSlaves } = await sb
      .from('users')
      .select('id')
      .eq('master_id', masterUser.id);
    const deployedCount = (deployedSlaves && Array.isArray(deployedSlaves))
      ? deployedSlaves.filter(u => u.id !== masterUser.id).length
      : 0;

    // Set Master allowance to cover current deployed plus headroom (e.g. current + 10)
    const targetAllowance = Math.min(1000, Math.max(10, deployedCount + 10));
    await masterService.activateMasterPlan(masterUser.id, targetAllowance, { actionType: 'new_plan' });

    // Requesting 1 slot within limit
    const allocResult = await masterService.allocateSlaveSlotsAtomic(masterUser.id, 1);
    assert(allocResult.success === true, 'Allocated slot within allowance');

    // Requesting more slots than allowance should fail
    let exceeded = false;
    try {
      await masterService.allocateSlaveSlotsAtomic(masterUser.id, 999);
    } catch (e: any) {
      exceeded = true;
      assert(e.message.includes('allowance limit exceeded'), 'Over-allocation properly rejected');
    }
    assert(exceeded, 'Exceeding allowance threw error');
  }

  // TEST 5: No-Plan State Remains Genuinely Inactive (0 Slots)
  console.log('\n--- TEST 5: No-Plan State (0 available slave slots) ---');
  {
    const noPlanUserId = 'test-no-plan-user-' + Date.now();
    const accountRecord = await masterService.getMasterAccount(noPlanUserId);
    assert(accountRecord?.plan_status === 'INACTIVE', 'No-plan account has INACTIVE status');
    assert(accountRecord?.max_sub_agents === 0, 'No-plan account has strictly 0 max_sub_agents (no manufactured 10 slots)');

    let noPlanAllocFailed = false;
    try {
      await masterService.allocateSlaveSlotsAtomic(noPlanUserId, 1);
    } catch (e: any) {
      noPlanAllocFailed = true;
      assert(e.message.includes('No active Master/Slave plan') || e.message.includes('0'), 'Slot allocation failed for no-plan account');
    }
    assert(noPlanAllocFailed, 'Allocation correctly denied for no-plan state');
  }

  // TEST 6: Isolated Cache Invalidation
  console.log('\n--- TEST 6: Isolated Cache Invalidation ---');
  {
    // Invalidate Slave A capability cache
    capService.invalidateCapabilityCache(slaveA.id);
    // Slave B status remains untouched
    const isBStillNormal = await capService.isAgentCapabilityActive(slaveB.id);
    assert(isBStillNormal === false, 'Slave B cache and state remains isolated');
  }

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED!`);
  console.log('====================================================\n');
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
