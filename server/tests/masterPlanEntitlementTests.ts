import { MasterAccountService } from '../services/masterAccountService.js';
import { getSupabaseClient } from '../supabase.js';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING MASTER PLAN ENTITLEMENT TEST SUITE');
  console.log('====================================================');

  const sb = getSupabaseClient();
  const masterService = MasterAccountService.getInstance();

  // Find or use an existing test user in Supabase
  const { data: users, error: userFetchErr } = await sb
    .from('users')
    .select('id, email, status')
    .eq('status', 'active')
    .limit(2);

  if (userFetchErr || !users || users.length < 1) {
    console.error('❌ Failed to fetch test users from Supabase:', userFetchErr);
    process.exit(1);
  }

  const masterUserA = users[0];
  const masterUserB = users.length > 1 ? users[1] : null;

  console.log(`✅ Using Master Account A: ${masterUserA.id} (${masterUserA.email})`);
  if (masterUserB) {
    console.log(`✅ Using Master Account B: ${masterUserB.id} (${masterUserB.email})`);
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

  // TEST 1: Normal Purchase / Activation
  console.log('\n--- TEST 1: Normal Purchase / Activation ---');
  {
    const plan = await masterService.activateMasterPlan(masterUserA.id, 10, { actionType: 'new_plan' });
    assert(plan !== null, 'Plan was returned upon activation');
    assert(plan.status === 'active', 'Plan status is active');
    assert(plan.allowance_accounts === 10, 'Allowance is 10 accounts');
    assert(plan.master_account_id === masterUserA.id, 'Plan belongs strictly to Master Account A');

    // Verify reading from database
    const fetchedPlan = await masterService.getMasterPlan(masterUserA.id, true);
    assert(fetchedPlan !== null, 'Fetched plan from database is non-null');
    assert(fetchedPlan?.status === 'active', 'Database plan is active');
    assert(fetchedPlan?.allowance_accounts === 10, 'Database allowance is 10');
  }

  // TEST 2: Idempotency (Rapid Repeat Calls / Double Click)
  console.log('\n--- TEST 2: Idempotency (Rapid Repeat / Double Click) ---');
  {
    const firstCall = await masterService.activateMasterPlan(masterUserA.id, 10);
    const secondCall = await masterService.activateMasterPlan(masterUserA.id, 10);
    const thirdCall = await masterService.activateMasterPlan(masterUserA.id, 10);

    assert(firstCall.id === secondCall.id, 'Second purchase returned identical entitlement ID (no duplicate)');
    assert(secondCall.id === thirdCall.id, 'Third purchase returned identical entitlement ID (no duplicate)');
    assert(secondCall.allowance_accounts === 10, 'Allowance remains unchanged');
  }

  // TEST 3: Concurrency Protection (Parallel simultaneous requests)
  console.log('\n--- TEST 3: Concurrency Protection (Parallel Simultaneous Requests) ---');
  {
    const parallelPromises = [
      masterService.activateMasterPlan(masterUserA.id, 20),
      masterService.activateMasterPlan(masterUserA.id, 20),
      masterService.activateMasterPlan(masterUserA.id, 20)
    ];

    const results = await Promise.all(parallelPromises);
    const firstId = results[0].id;

    assert(results.every(r => r.id === firstId), 'All concurrent requests resolved to the same entitlement ID');
    assert(results.every(r => r.allowance_accounts === 20), 'All concurrent requests settled on 20 accounts allowance');

    // Confirm database state after concurrent bursts
    const finalPlan = await masterService.getMasterPlan(masterUserA.id, true);
    assert(finalPlan?.allowance_accounts === 20, 'Authoritative database allowance is 20');
  }

  // TEST 4: Master Account Isolation
  if (masterUserB) {
    console.log('\n--- TEST 4: Multi-Tenant Master Account Isolation ---');
    {
      const planB = await masterService.activateMasterPlan(masterUserB.id, 10, { actionType: 'new_plan' });
      const planA = await masterService.getMasterPlan(masterUserA.id, true);

      assert(planB.master_account_id === masterUserB.id, 'Plan B belongs strictly to Master B');
      assert(planA?.master_account_id === masterUserA.id, 'Plan A belongs strictly to Master A');
      assert(planB.id !== planA?.id, 'Master A and Master B have completely distinct plan IDs');
      assert(planA?.allowance_accounts === 20, 'Master A retains 20 accounts');
      assert(planB.allowance_accounts === 10, 'Master B has 10 accounts');
    }
  }

  // TEST 5: Allowance Bounds Protection (Cannot go below 10, cannot exceed 1000)
  console.log('\n--- TEST 5: Allowance Bounds (Min 10, Max 1000) ---');
  {
    const boundedMin = await masterService.activateMasterPlan(masterUserA.id, 2);
    assert(boundedMin.allowance_accounts === 10, 'Requested 2 clamped to minimum 10 accounts');

    const boundedMax = await masterService.activateMasterPlan(masterUserA.id, 5000);
    assert(boundedMax.allowance_accounts === 1000, 'Requested 5000 clamped to maximum 1000 accounts');

    // Reset back to 10 accounts
    await masterService.activateMasterPlan(masterUserA.id, 10);
  }

  // TEST 6: Invalid User Rejection
  console.log('\n--- TEST 6: Security - Nonexistent Account Rejection ---');
  {
    let caught = false;
    try {
      await masterService.activateMasterPlan('nonexistent-uuid-999999', 10);
    } catch (e: any) {
      caught = true;
      assert(e.message.includes('not found'), 'Nonexistent account was properly rejected');
    }
    assert(caught, 'Activation failed for nonexistent account');
  }

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('====================================================\n');
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
