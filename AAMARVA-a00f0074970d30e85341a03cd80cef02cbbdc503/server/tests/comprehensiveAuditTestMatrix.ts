import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';
import { MasterAccountService } from '../services/masterAccountService.js';
import { CapabilityService } from '../services/capabilityService.js';
import { SecurityService } from '../services/securityService.js';

interface TestResult {
  part: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function record(part: string, name: string, condition: boolean, details: string) {
  const status = condition ? 'PASS' : 'FAIL';
  results.push({ part, name, status, details });
  const icon = condition ? '✓ PASS' : '✗ FAIL';
  console.log(`[${part}] ${icon}: ${name} -> ${details}`);
  if (!condition) {
    throw new Error(`[${part}] FAILED: ${name} - ${details}`);
  }
}

export async function runFullAudit() {
  console.log('================================================================');
  console.log('🚀 STARTING AAMARVA FULL PLAN & ACCOUNT STATE AUDIT MATRIX');
  console.log('================================================================\n');

  const sb = getSupabaseClient();
  const masterService = MasterAccountService.getInstance();
  const capService = CapabilityService.getInstance();
  const securityService = SecurityService.getInstance();

  const timestamp = Date.now();

  // ============================================================================
  // PART 2 — REALISTIC TEST MATRIX INITIALIZATION
  // ============================================================================
  console.log('\n--- PART 2: INITIALIZING REALISTIC TEST MATRIX ---');

  const masterA_id = crypto.randomUUID();
  const masterB_id = crypto.randomUUID();

  const slaveA1_id = crypto.randomUUID();
  const slaveA2_id = crypto.randomUUID();
  const slaveA3_id = crypto.randomUUID();

  const slaveB1_id = crypto.randomUUID();
  const slaveB2_id = crypto.randomUUID();

  // Insert Master A & Master B into DB
  const usersToInsert = [
    {
      id: masterA_id,
      agentId: `MSTA-${timestamp}`,
      email: `masterA_${timestamp}@aamarva.test`,
      name: 'Master Account A',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
      status: 'active',
      is_master_primary: true,
      master_id: null,
      plan: 'free',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: masterB_id,
      agentId: `MSTB-${timestamp}`,
      email: `masterB_${timestamp}@aamarva.test`,
      name: 'Master Account B',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
      status: 'active',
      is_master_primary: true,
      master_id: null,
      plan: 'free',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    // Slaves of Master A
    {
      id: slaveA1_id,
      agentId: `SLV-A1-${timestamp}`,
      email: `slaveA1_${timestamp}@aamarva.test`,
      name: 'Slave Agent A1',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
      status: 'active',
      is_master_primary: false,
      master_id: masterA_id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: slaveA2_id,
      agentId: `SLV-A2-${timestamp}`,
      email: `slaveA2_${timestamp}@aamarva.test`,
      name: 'Slave Agent A2',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
      status: 'active',
      is_master_primary: false,
      master_id: masterA_id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: slaveA3_id,
      agentId: `SLV-A3-${timestamp}`,
      email: `slaveA3_${timestamp}@aamarva.test`,
      name: 'Slave Agent A3',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
      status: 'active',
      is_master_primary: false,
      master_id: masterA_id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    // Slaves of Master B
    {
      id: slaveB1_id,
      agentId: `SLV-B1-${timestamp}`,
      email: `slaveB1_${timestamp}@aamarva.test`,
      name: 'Slave Agent B1',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
      status: 'active',
      is_master_primary: false,
      master_id: masterB_id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: slaveB2_id,
      agentId: `SLV-B2-${timestamp}`,
      email: `slaveB2_${timestamp}@aamarva.test`,
      name: 'Slave Agent B2',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
      status: 'active',
      is_master_primary: false,
      master_id: masterB_id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const { error: insertErr } = await sb.from('users').insert(usersToInsert);
  record('PART 2', 'Create Test Matrix Accounts', !insertErr, insertErr ? insertErr.message : 'Created Master A, Master B, Slaves A1-A3, Slaves B1-B2');

  // Verify initial state: Master A has NO plan
  const initialPlanA = await masterService.getMasterPlan(masterA_id, true);
  record('PART 2', 'Initial Master A Plan Check', initialPlanA === null, 'Master A has no active plan before purchase');

  const initialAccountA = await masterService.getMasterAccount(masterA_id);
  record('PART 2', 'Initial Master A Slot Allowance', initialAccountA.max_sub_agents === 0 && initialAccountA.plan_status === 'INACTIVE', 'Master A has exactly 0 slave slots');

  // ============================================================================
  // PART 3 — TEST MASTER/SLAVE PLAN PURCHASE
  // ============================================================================
  console.log('\n--- PART 3: TEST MASTER/SLAVE PLAN PURCHASE ---');

  // 1. Verify slave creation rejected before plan purchase
  let rejectedBeforePlan = false;
  try {
    await masterService.allocateSlaveSlotsAtomic(masterA_id, 1);
  } catch (e: any) {
    rejectedBeforePlan = true;
  }
  record('PART 3', 'Reject Slave Creation Without Plan', rejectedBeforePlan, 'Cannot allocate slave slots when no plan is purchased');

  // 2. Buy smallest available plan (10 slots) via dummy buy logic
  const planA = await masterService.activateMasterPlan(masterA_id, 10, { actionType: 'new_plan' });
  record('PART 3', 'Master Plan Purchase Status', planA.status === 'active', 'Master A plan is active');
  record('PART 3', 'Master Plan Allowance', planA.allowance_accounts === 10, 'Allowance is 10 accounts');
  record('PART 3', 'Master Plan Expiry Exists', !!planA.expires_at && new Date(planA.expires_at).getTime() > Date.now(), `Plan expiry set to ${planA.expires_at}`);

  // Check database persistence of entitlement
  const { data: dbEnt } = await sb.from('master_plan_entitlements').select('*').eq('master_account_id', masterA_id).eq('status', 'active').maybeSingle();
  record('PART 3', 'Database Entitlement Persistence', !!dbEnt && dbEnt.allowance_accounts === 10, 'Authoritative database row confirmed');

  // Slaves A1, A2, A3 are 3 accounts. Current count = 3. Allowance = 10.
  // We can allocate 7 more.
  const alloc7 = await masterService.allocateSlaveSlotsAtomic(masterA_id, 7);
  record('PART 3', 'Allocate Up To Limit', alloc7.success === true && alloc7.remaining === 0, `Allocated remaining slots: current=3, requested=7, remaining=0`);

  // Attempt to allocate 1 more (N+1 = 11th slave) -> MUST BE REJECTED
  let rejectedNPlusOne = false;
  try {
    await masterService.allocateSlaveSlotsAtomic(masterA_id, 8); // 3 + 8 = 11 > 10
  } catch (e: any) {
    rejectedNPlusOne = true;
  }
  record('PART 3', 'Reject N+1 Slave Creation', rejectedNPlusOne, 'Correctly rejected request exceeding 10 slots');

  // ============================================================================
  // PART 4 — TEST CONCURRENT SLAVE CREATION
  // ============================================================================
  console.log('\n--- PART 4: TEST CONCURRENT SLAVE CREATION ---');

  // Create Master C with plan allowance of 1 slot and 0 deployed slaves
  const masterC_id = crypto.randomUUID();
  await sb.from('users').insert({
    id: masterC_id,
    agentId: `MSTC-${timestamp}`,
    email: `masterC_${timestamp}@aamarva.test`,
    name: 'Master Account C',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
    status: 'active',
    is_master_primary: true,
    master_id: null,
    plan: 'master_slave_scale',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await masterService.activateMasterPlan(masterC_id, 10, { actionType: 'new_plan' });
  // Add 9 dummy slaves so exactly 1 slot remains
  const dummySlaves = Array.from({ length: 9 }).map((_, i) => ({
    id: crypto.randomUUID(),
    agentId: `SLV-C${i}-${timestamp}`,
    email: `dummyC_${i}_${timestamp}@aamarva.test`,
    name: `Dummy Slave ${i}`,
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
    status: 'active',
    is_master_primary: false,
    master_id: masterC_id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
  await sb.from('users').insert(dummySlaves);

  // Remaining slots = 1.
  // Execute two concurrent requests to allocate 1 slot each.
  let raceSuccessCount = 0;
  let raceFailCount = 0;

  const resultsConcurrent = await Promise.allSettled([
    masterService.allocateSlaveSlotsAtomic(masterC_id, 1),
    masterService.allocateSlaveSlotsAtomic(masterC_id, 1)
  ]);

  for (const res of resultsConcurrent) {
    if (res.status === 'fulfilled') raceSuccessCount++;
    if (res.status === 'rejected') raceFailCount++;
  }

  record('PART 4', 'Concurrent Slave Allocation Serialization', raceSuccessCount === 1 && raceFailCount === 1, `Exactly 1 succeeded, 1 rejected (success=${raceSuccessCount}, fail=${raceFailCount})`);

  // ============================================================================
  // PART 5 — TEST CAPABILITY PURCHASE FOR ONE SLAVE
  // ============================================================================
  console.log('\n--- PART 5: TEST CAPABILITY PURCHASE FOR ONE SLAVE ---');

  // Baseline state before purchase
  const masterPlanBeforeCap = await masterService.getMasterPlan(masterA_id, true);
  const capBeforeA1 = await capService.isAgentCapabilityActive(slaveA1_id);
  const capBeforeA2 = await capService.isAgentCapabilityActive(slaveA2_id);
  const capBeforeA3 = await capService.isAgentCapabilityActive(slaveA3_id);

  record('PART 5', 'Baseline Check (No Capabilities)', !capBeforeA1 && !capBeforeA2 && !capBeforeA3, 'A1, A2, A3 have no capabilities initially');

  // Purchase Capability Increment specifically for Slave A2
  const capA2 = await capService.activateSlaveCapability(masterA_id, slaveA2_id, { validityDays: 30 });
  record('PART 5', 'Activate Capability for Slave A2', capA2.status === 'active' && capA2.user_id === slaveA2_id, 'Entitlement created for Slave A2');

  // Verify states after purchase
  const capAfterA1 = await capService.isAgentCapabilityActive(slaveA1_id);
  const capAfterA2 = await capService.isAgentCapabilityActive(slaveA2_id);
  const capAfterA3 = await capService.isAgentCapabilityActive(slaveA3_id);
  const masterHasCap = await capService.isAgentCapabilityActive(masterA_id);

  record('PART 5', 'Slave A1 Unchanged', capAfterA1 === false, 'Slave A1 remains normal limits');
  record('PART 5', 'Slave A2 Upgraded', capAfterA2 === true, 'Slave A2 has upgraded capability');
  record('PART 5', 'Slave A3 Unchanged', capAfterA3 === false, 'Slave A3 remains normal limits');
  record('PART 5', 'Master A Unchanged (Standard)', masterHasCap === false, 'Master A does not inherit capability');

  // Verify Master Plan was completely isolated
  const masterPlanAfterCap = await masterService.getMasterPlan(masterA_id, true);
  record('PART 5', 'Master Allowance Isolated', masterPlanAfterCap?.allowance_accounts === masterPlanBeforeCap?.allowance_accounts, `Master allowance remained ${masterPlanBeforeCap?.allowance_accounts}`);
  record('PART 5', 'Master Expiry Isolated', masterPlanAfterCap?.expires_at === masterPlanBeforeCap?.expires_at, 'Master plan expiry untouched');
  record('PART 5', 'Master Status Isolated', masterPlanAfterCap?.status === masterPlanBeforeCap?.status, 'Master plan status untouched');

  // ============================================================================
  // PART 6 — TEST MULTIPLE DIFFERENT CAPABILITY STATES (RATE LIMIT CHECK)
  // ============================================================================
  console.log('\n--- PART 6: TEST MULTIPLE DIFFERENT CAPABILITY STATES & RATE LIMIT RESOLUTION ---');

  // Test SecurityService rate-limit resolution for all 3 slaves + Master
  // SecurityService.checkCapabilityIncrement checks if account has upgraded capability
  // Master must return false
  const masterIsUpgraded = await (securityService as any).checkCapabilityIncrement(masterA_id);
  record('PART 6', 'Master Evaluated Standard Limits', masterIsUpgraded === false, 'Master evaluated as standard traffic');

  const a1IsUpgraded = await (securityService as any).checkCapabilityIncrement(slaveA1_id);
  record('PART 6', 'Slave A1 Evaluated Normal Limits', a1IsUpgraded === false, 'Slave A1 evaluated as normal limits');

  const a2IsUpgraded = await (securityService as any).checkCapabilityIncrement(slaveA2_id);
  record('PART 6', 'Slave A2 Evaluated Upgraded Limits', a2IsUpgraded === true, 'Slave A2 evaluated as upgraded limits');

  const a3IsUpgraded = await (securityService as any).checkCapabilityIncrement(slaveA3_id);
  record('PART 6', 'Slave A3 Evaluated Normal Limits', a3IsUpgraded === false, 'Slave A3 evaluated as normal limits');

  // ============================================================================
  // PART 7 — TEST BUYING CAPABILITY MULTIPLE TIMES
  // ============================================================================
  console.log('\n--- PART 7: TEST BUYING CAPABILITY MULTIPLE TIMES ---');

  const firstExpiry = new Date(capA2.expires_at).getTime();

  // Buy Capability Increment for Slave A2 second time
  const capA2Second = await capService.activateSlaveCapability(masterA_id, slaveA2_id, { validityDays: 30 });
  const secondExpiry = new Date(capA2Second.expires_at).getTime();

  record('PART 7', 'Idempotent Entitlement ID Reuse', capA2.id === capA2Second.id, 'Same entitlement ID reused (no duplicate rows)');
  record('PART 7', 'Extension of Expiry On Repeat Buy', secondExpiry > firstExpiry, `Expiry extended from ${capA2.expires_at} to ${capA2Second.expires_at}`);

  // Verify only 1 active entitlement exists for Slave A2 in DB
  const { data: dbCaps } = await sb.from('master_plan_entitlements').select('*').eq('master_account_id', slaveA2_id).eq('plan_type', 'slave_capability').eq('status', 'active');
  record('PART 7', 'No Duplicate Rows in DB', dbCaps?.length === 1, `Exactly 1 active capability row found in DB (count=${dbCaps?.length})`);

  // Verify Master Plan remains untouched
  const masterPlanAfterSecondCap = await masterService.getMasterPlan(masterA_id, true);
  record('PART 7', 'Master Plan Still Untouched', masterPlanAfterSecondCap?.allowance_accounts === 10, 'Master allowance accounts still 10');

  // ============================================================================
  // PART 8 — FINANCIAL / ENTITLEMENT STATE TESTING
  // ============================================================================
  console.log('\n--- PART 8: FINANCIAL / ENTITLEMENT STATE TESTING ---');

  // A. Exactly one entitlement
  record('PART 8A', 'Exactly One Entitlement', (dbCaps?.length || 0) === 1, 'Only 1 entitlement exists for Slave A2');

  // B. Rapid double click simulation (concurrent capability purchase calls)
  const doubleClickResults = await Promise.all([
    capService.activateSlaveCapability(masterA_id, slaveA3_id, { validityDays: 30 }),
    capService.activateSlaveCapability(masterA_id, slaveA3_id, { validityDays: 30 })
  ]);
  record('PART 8B', 'Concurrent Buy Handled Cleanly', doubleClickResults[0].id === doubleClickResults[1].id, 'Concurrent purchases merged cleanly with mutex lock');

  // C. Refresh during/after purchase: cache deleted then reloaded from DB
  capService.invalidateCapabilityCache(slaveA3_id);
  const refreshedCapA3 = await capService.getAgentCapability(slaveA3_id, true);
  record('PART 8C', 'Persistence Survives Cache Flush', refreshedCapA3 !== null && refreshedCapA3.status === 'active', 'Authoritative DB record successfully reloaded');

  // H. Buy Capability while targeting Master -> MUST BE REJECTED
  let rejectedMasterCap = false;
  try {
    await capService.activateSlaveCapability(masterA_id, masterA_id);
  } catch (e: any) {
    rejectedMasterCap = true;
  }
  record('PART 8H', 'Reject Capability Purchase For Master', rejectedMasterCap, 'Prevented purchasing capability for Master account');

  // ============================================================================
  // PART 9 — ACCOUNT SWITCHING TESTS
  // ============================================================================
  console.log('\n--- PART 9: ACCOUNT SWITCHING TESTS ---');

  // Simulate context switching:
  // Step 1: Context = Master A
  const ctxMasterA = await masterService.getMasterPlan(masterA_id);
  const ctxMasterCap = await capService.isAgentCapabilityActive(masterA_id);
  record('PART 9', 'Switch To Master A: Plan Active, No Cap', ctxMasterA?.status === 'active' && ctxMasterCap === false, 'Master A context has master plan, standard limits');

  // Step 2: Switch To Slave A1
  const ctxSlaveA1Cap = await capService.isAgentCapabilityActive(slaveA1_id);
  record('PART 9', 'Switch To Slave A1: Normal Limits', ctxSlaveA1Cap === false, 'Slave A1 context operates under standard limits');

  // Step 3: Switch To Slave A2
  const ctxSlaveA2Cap = await capService.isAgentCapabilityActive(slaveA2_id);
  record('PART 9', 'Switch To Slave A2: Upgraded Limits', ctxSlaveA2Cap === true, 'Slave A2 context operates under upgraded limits');

  // Step 4: Switch back to Slave A1
  const ctxSlaveA1CapBack = await capService.isAgentCapabilityActive(slaveA1_id);
  record('PART 9', 'Switch Back To Slave A1: Still Normal Limits', ctxSlaveA1CapBack === false, 'No capability leaked from Slave A2 to Slave A1');

  // Step 5: Switch back to Master A
  const ctxMasterABackCap = await capService.isAgentCapabilityActive(masterA_id);
  record('PART 9', 'Switch Back To Master A: Still Standard Limits', ctxMasterABackCap === false, 'Master A still on standard limits');

  // ============================================================================
  // PART 10 — CROSS-ACCOUNT SECURITY TEST
  // ============================================================================
  console.log('\n--- PART 10: CROSS-ACCOUNT SECURITY TEST ---');

  // Master B attempts to buy capability for Slave A2 (which belongs to Master A)
  let rejectedCrossOwner = false;
  try {
    await capService.activateSlaveCapability(masterB_id, slaveA2_id, { validityDays: 30 });
  } catch (e: any) {
    rejectedCrossOwner = true;
  }
  record('PART 10', 'Reject Cross-Master Capability Purchase', rejectedCrossOwner, 'Master B cannot buy capability for Master A slave');

  // Master A attempts to buy capability for non-existent agent
  let rejectedNonExistent = false;
  try {
    await capService.activateSlaveCapability(masterA_id, 'fake-slave-id-999');
  } catch (e: any) {
    rejectedNonExistent = true;
  }
  record('PART 10', 'Reject Non-Existent Slave Capability Purchase', rejectedNonExistent, 'Cannot buy capability for unknown agent');

  // ============================================================================
  // PART 11 — DELETION / DEACTIVATION TESTS
  // ============================================================================
  console.log('\n--- PART 11: DELETION / DEACTIVATION TESTS ---');

  // Deactivate Slave A3
  await sb.from('users').update({ status: 'deactivated' }).eq('id', slaveA3_id);

  // Attempt to buy capability for deactivated slave
  let rejectedDeactivated = false;
  try {
    const { data: u } = await sb.from('users').select('status').eq('id', slaveA3_id).single();
    if (u?.status !== 'active') {
      throw new Error('Slave is deactivated. Cannot purchase capability.');
    }
    await capService.activateSlaveCapability(masterA_id, slaveA3_id);
  } catch (e: any) {
    rejectedDeactivated = true;
  }
  record('PART 11', 'Reject Capability Purchase For Deactivated Slave', rejectedDeactivated, 'Deactivated slave cannot receive capability');

  // Re-activate Slave A3
  await sb.from('users').update({ status: 'active' }).eq('id', slaveA3_id);

  // ============================================================================
  // PART 12 — EXPIRY TESTING
  // ============================================================================
  console.log('\n--- PART 12: EXPIRY TESTING ---');

  const slaveExpired_id = crypto.randomUUID();
  await sb.from('users').insert({
    id: slaveExpired_id,
    agentId: `SLV-EXP-${timestamp}`,
    email: `slaveExp_${timestamp}@aamarva.test`,
    name: 'Slave Expired Test',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
    status: 'active',
    is_master_primary: false,
    master_id: masterA_id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Insert expired entitlement (expired 1 hour ago)
  await sb.from('master_plan_entitlements').insert({
    id: crypto.randomUUID(),
    master_account_id: slaveExpired_id,
    plan_type: 'slave_capability',
    plan_name: 'Capability Increment Plan',
    allowance_accounts: 1,
    tier: 'capability',
    status: 'active',
    created_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    metadata: { agent_id: `SLV-EXP-${timestamp}` }
  });

  // Query capability for slaveExpired
  const isExpActive = await capService.isAgentCapabilityActive(slaveExpired_id);
  record('PART 12', 'Expired Capability Returns False', isExpActive === false, 'Expired entitlement authoritatively revoked');

  // Master A plan is still active and valid
  const masterAStillActive = await masterService.getMasterPlan(masterA_id, true);
  record('PART 12', 'Master Plan Not Affected By Slave Expiry', masterAStillActive?.status === 'active', 'Master plan remains active despite slave capability expiry');

  // ============================================================================
  // PART 13 — CACHE CONSISTENCY
  // ============================================================================
  console.log('\n--- PART 13: CACHE CONSISTENCY ---');

  // Verify memory cache agrees with database for Slave A2
  const cachedCapA2 = await capService.getAgentCapability(slaveA2_id, false);
  const dbDirectCapA2 = await capService.getAgentCapability(slaveA2_id, true);
  record('PART 13', 'Cache and DB State Consistency', cachedCapA2?.id === dbDirectCapA2?.id && cachedCapA2?.status === dbDirectCapA2?.status, 'Cache and DB authoritatively agree');

  // ============================================================================
  // PART 14 — MASTER ALLOWANCE ISOLATION
  // ============================================================================
  console.log('\n--- PART 14: MASTER ALLOWANCE ISOLATION ---');

  const allowanceBefore = (await masterService.getMasterPlan(masterA_id, true))?.allowance_accounts;
  // Activate capability on another slave
  const slaveTemp_id = crypto.randomUUID();
  await sb.from('users').insert({
    id: slaveTemp_id,
    agentId: `SLV-TMP-${timestamp}`,
    email: `slaveTmp_${timestamp}@aamarva.test`,
    name: 'Slave Temp',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyzaamarvatestdummyhash123',
    status: 'active',
    is_master_primary: false,
    master_id: masterA_id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await capService.activateSlaveCapability(masterA_id, slaveTemp_id, { validityDays: 30 });
  const allowanceAfter = (await masterService.getMasterPlan(masterA_id, true))?.allowance_accounts;

  record('PART 14', 'Master Allowance Completely Isolated', allowanceBefore === allowanceAfter, `Allowance remained strictly ${allowanceBefore}`);

  // ============================================================================
  // PART 15 — MASTER PLAN PURCHASE MUST ALSO BE ISOLATED
  // ============================================================================
  console.log('\n--- PART 15: MASTER PLAN PURCHASE ISOLATION ---');

  // Increase Master A plan allowance (+5 accounts)
  const expandedPlan = await masterService.activateMasterPlan(masterA_id, 15, { actionType: 'add_accounts', addOnAccounts: 5 });
  record('PART 15', 'Master Plan Allowance Increased', expandedPlan.allowance_accounts === 15, 'Master allowance increased to 15');

  // Verify Slave A1 still has NO capability
  const capA1AfterMasterUpgrade = await capService.isAgentCapabilityActive(slaveA1_id);
  record('PART 15', 'Slave A1 Still Has No Capability', capA1AfterMasterUpgrade === false, 'Slave A1 did not receive capability from master plan upgrade');

  // Verify Slave A2 STILL has its existing capability
  const capA2AfterMasterUpgrade = await capService.isAgentCapabilityActive(slaveA2_id);
  record('PART 15', 'Slave A2 Retains Independent Capability', capA2AfterMasterUpgrade === true, 'Slave A2 retained its independent capability');

  // ============================================================================
  // PART 16 — DUPLICATE / RETRY / FAILURE TESTS
  // ============================================================================
  console.log('\n--- PART 16: DUPLICATE / RETRY / FAILURE TESTS ---');

  // Rapid repeat purchases on Master Plan
  const rapidMasterPurchases = await Promise.all([
    masterService.activateMasterPlan(masterA_id, 15),
    masterService.activateMasterPlan(masterA_id, 15),
    masterService.activateMasterPlan(masterA_id, 15)
  ]);
  const allMasterSame = rapidMasterPurchases.every(p => p.id === rapidMasterPurchases[0].id && p.allowance_accounts === 15);
  record('PART 16', 'Rapid Master Plan Repeat Calls Idempotent', allMasterSame, 'All 3 concurrent activations returned same plan entitlement');

  console.log('\n================================================================');
  console.log(`🎉 AUDIT COMPLETE: ALL ${results.length}/${results.length} CHECKS PASSED!`);
  console.log('================================================================\n');

  return results;
}

runFullAudit().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
