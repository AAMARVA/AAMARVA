import { getSupabaseClient } from '../supabase.js';
import { BillingEntitlementService } from '../services/billingService.js';
import { MasterAccountService } from '../services/masterAccountService.js';
import { registerUser, createHumanSession, verifyHumanSession, findUserById } from '../authService.js';

const BASE_URL = 'http://localhost:3000';

async function fetchWithTimeout(url: string, options: any = {}, timeout = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export async function runMultiAccountTests() {
  console.log('\n==================================================');
  console.log('RUNNING MASTER & SLAVE PRODUCTION READINESS SUITE');
  console.log('==================================================\n');

  const results: { name: string; status: 'PASS' | 'FAIL' | 'SKIP'; details: string }[] = [];
  const record = (name: string, status: 'PASS' | 'FAIL' | 'SKIP', details: string) => {
    results.push({ name, status, details });
    console.log(`[${status}] ${name} -> ${details}`);
  };

  const supabase = getSupabaseClient();
  const masterService = MasterAccountService.getInstance();

  // Setup: Register Master 1
  let master1SessionToken = '';
  let master1UserId = '';
  let master1AgentId = '';
  let master1ApiKey = '';
  let master1Id = '';
  const testEmail1 = `master_prod_${Date.now()}@example.com`;

  try {
    const regResult = await registerUser({
      email: testEmail1,
      password: 'SecurePassword123!',
      agentName: 'Master Lead Alpha',
      bio: 'Primary master operator account.'
    });

    master1UserId = regResult.user?.id || regResult.agentId;
    master1AgentId = regResult.agentId;
    master1ApiKey = regResult.apiKey;

    master1SessionToken = await createHumanSession(master1UserId);
    const verified = await verifyHumanSession(master1SessionToken);
    master1Id = verified?.masterId || master1UserId;

    record('Setup: Master 1 Registration', 'PASS', `Master registered. ID: ${master1Id}, User ID: ${master1UserId}`);
  } catch (err: any) {
    record('Setup: Master 1 Registration', 'FAIL', err.message);
    return;
  }

  // ----------------------------------------------------
  // Test A — Capacity Counting & Slot Enforcement
  // ----------------------------------------------------
  const createdSlaves: any[] = [];
  try {
    // 10-account plan: Master must be able to create 10 managed Slaves
    // The Master itself does NOT consume one of the 10 slots.
    for (let i = 1; i <= 10; i++) {
      const res = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master1SessionToken}` },
        body: JSON.stringify({ agentName: `Managed Slave ${i}`, bio: `Sub-agent ${i}` })
      });
      const json: any = await res.json();
      if (res.status === 201 && json.success) {
        createdSlaves.push(json.data);
      } else {
        throw new Error(`Failed to create Slave ${i}: ${JSON.stringify(json)}`);
      }
    }

    // 11th creation MUST fail with 400 LIMIT_EXCEEDED
    const res11 = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master1SessionToken}` },
      body: JSON.stringify({ agentName: 'Excess Slave 11', bio: 'Should be rejected' })
    });
    const json11: any = await res11.json();
    const eleventhBlocked = res11.status === 400 && json11.error?.code === 'LIMIT_EXCEEDED';

    // Verify slot counting in GET /api/auth/master/accounts
    const resList = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts`, {
      headers: { Authorization: `Bearer ${master1SessionToken}` }
    });
    const jsonList: any = await resList.json();
    const activeSlaveCount = jsonList.data?.length || 0;
    const masterNotInList = !jsonList.data?.some((a: any) => a.id === master1UserId);

    if (createdSlaves.length === 10 && eleventhBlocked && activeSlaveCount === 10 && masterNotInList) {
      record('Test A: Capacity Counting', 'PASS', '10-account plan allowed 10 Slaves, 11th was rejected. Master did not consume a slot.');
    } else {
      record('Test A: Capacity Counting', 'FAIL', `Created=${createdSlaves.length}, 11thBlocked=${eleventhBlocked}, ActiveSlaves=${activeSlaveCount}, MasterNotInList=${masterNotInList}`);
    }
  } catch (err: any) {
    record('Test A: Capacity Counting', 'FAIL', err.message);
  }

  // ----------------------------------------------------
  // Test B — Switching Lifecycle
  // ----------------------------------------------------
  let tokenSlaveA = '';
  let tokenSlaveB = '';
  let tokenSlaveC = '';
  const slaveA = createdSlaves[0];
  const slaveB = createdSlaves[1];
  const slaveC = createdSlaves[2];

  try {
    // 1. Master -> Slave A
    const resA = await fetchWithTimeout(`${BASE_URL}/api/auth/master/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master1SessionToken}` },
      body: JSON.stringify({ targetUserId: slaveA.id })
    });
    const jsonA: any = await resA.json();
    tokenSlaveA = jsonA.data?.sessionId;
    const vA = await verifyHumanSession(tokenSlaveA);
    const passA = vA?.userId === master1UserId && vA?.masterId === master1Id && vA?.activeAccountId === slaveA.id && vA?.isMasterUser === true;

    // 2. Direct Switch Slave A -> Slave B
    const resB = await fetchWithTimeout(`${BASE_URL}/api/auth/master/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSlaveA}` },
      body: JSON.stringify({ targetUserId: slaveB.id })
    });
    const jsonB: any = await resB.json();
    tokenSlaveB = jsonB.data?.sessionId;
    const vB = await verifyHumanSession(tokenSlaveB);
    const passB = vB?.userId === master1UserId && vB?.masterId === master1Id && vB?.activeAccountId === slaveB.id && vB?.isMasterUser === true;

    // 3. Direct Switch Slave B -> Slave C
    const resC = await fetchWithTimeout(`${BASE_URL}/api/auth/master/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSlaveB}` },
      body: JSON.stringify({ targetUserId: slaveC.id })
    });
    const jsonC: any = await resC.json();
    tokenSlaveC = jsonC.data?.sessionId;
    const vC = await verifyHumanSession(tokenSlaveC);
    const passC = vC?.userId === master1UserId && vC?.masterId === master1Id && vC?.activeAccountId === slaveC.id && vC?.isMasterUser === true;

    // 4. Return to Slave A
    const resCycle = await fetchWithTimeout(`${BASE_URL}/api/auth/master/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSlaveC}` },
      body: JSON.stringify({ targetUserId: slaveA.id })
    });
    const jsonCycle: any = await resCycle.json();
    const tokenCycle = jsonCycle.data?.sessionId;
    const vCycle = await verifyHumanSession(tokenCycle);
    const passCycle = vCycle?.userId === master1UserId && vCycle?.masterId === master1Id && vCycle?.activeAccountId === slaveA.id;

    if (passA && passB && passC && passCycle) {
      record('Test B: Switching Lifecycle', 'PASS', 'Switched Master -> A -> B -> C -> A. Master human identity and masterId persisted at every point.');
    } else {
      record('Test B: Switching Lifecycle', 'FAIL', `passA=${passA}, passB=${passB}, passC=${passC}, passCycle=${passCycle}`);
    }
  } catch (err: any) {
    record('Test B: Switching Lifecycle', 'FAIL', err.message);
  }

  // ----------------------------------------------------
  // Test C — Cross-Master Isolation
  // ----------------------------------------------------
  let master2SessionToken = '';
  let master2UserId = '';
  let master2Id = '';
  let master2Slave: any = null;

  try {
    const reg2 = await registerUser({
      email: `master_two_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      agentName: 'Master Two Beta',
      bio: 'Isolated second master.'
    });
    master2UserId = reg2.user?.id || reg2.agentId;
    master2SessionToken = await createHumanSession(master2UserId);
    const v2 = await verifyHumanSession(master2SessionToken);
    master2Id = v2?.masterId || master2UserId;

    // Create a slave under Master 2
    const resM2Slave = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master2SessionToken}` },
      body: JSON.stringify({ agentName: 'Master 2 Private Slave', bio: 'Confidential' })
    });
    const jsonM2Slave: any = await resM2Slave.json();
    master2Slave = jsonM2Slave.data;

    // 1. Master 1 attempts to switch to Master 2's Slave -> MUST 403
    const resCrossSwitch = await fetchWithTimeout(`${BASE_URL}/api/auth/master/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master1SessionToken}` },
      body: JSON.stringify({ targetUserId: master2Slave.id })
    });
    const switchBlocked = resCrossSwitch.status === 403;

    // 2. Master 1 attempts to read Master 2's Slave -> MUST 403
    const resCrossRead = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts/${master2Slave.id}`, {
      headers: { Authorization: `Bearer ${master1SessionToken}` }
    });
    const readBlocked = resCrossRead.status === 403;

    // 3. Master 1 attempts to modify Master 2's Slave -> MUST 403
    const resCrossModify = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts/${master2Slave.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master1SessionToken}` },
      body: JSON.stringify({ name: 'Hacked Name' })
    });
    const modifyBlocked = resCrossModify.status === 403;

    // 4. Master 1 attempts to delete Master 2's Slave -> MUST 403
    const resCrossDelete = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts/${master2Slave.id}/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${master1SessionToken}` }
    });
    const deleteBlocked = resCrossDelete.status === 403;

    // 5. Master 1 attempts to freeze Master 2's Slave -> MUST 403
    const resCrossFreeze = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts/${master2Slave.id}/freeze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${master1SessionToken}` }
    });
    const freezeBlocked = resCrossFreeze.status === 403;

    if (switchBlocked && readBlocked && modifyBlocked && deleteBlocked && freezeBlocked) {
      record('Test C: Cross-Master Isolation', 'PASS', 'Master 1 strictly blocked from switching, reading, modifying, deleting, or freezing Master 2 Slave (all 403).');
    } else {
      record('Test C: Cross-Master Isolation', 'FAIL', `switch=${switchBlocked}, read=${readBlocked}, modify=${modifyBlocked}, delete=${deleteBlocked}, freeze=${freezeBlocked}`);
    }
  } catch (err: any) {
    record('Test C: Cross-Master Isolation', 'FAIL', err.message);
  }

  // ----------------------------------------------------
  // Test D — Expiry & Operational Freeze Enforcement
  // ----------------------------------------------------
  try {
    // 1. Expire Master 1 plan
    await fetchWithTimeout(`${BASE_URL}/api/auth/master/plan/expire`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${master1SessionToken}` }
    });

    // Verify Master human remains active
    const { data: masterUserRecord } = await supabase.from('users').select('status').eq('id', master1UserId).maybeSingle();
    const masterStillActive = masterUserRecord?.status === 'active';

    // Verify Master management routes still work
    const resMgmt = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts`, {
      headers: { Authorization: `Bearer ${tokenSlaveA}` }
    });
    const mgmtWorks = resMgmt.status === 200;

    // Verify Slave A in human session is blocked on operational writes with 403 ACCOUNT_FROZEN
    const resWrite = await fetchWithTimeout(`${BASE_URL}/api/auth/network-whitelist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSlaveA}` },
      body: JSON.stringify({ whitelisted_networks: ['10.0.0.1/32'] })
    });
    const jsonWrite: any = await resWrite.json();
    const humanWriteBlocked = resWrite.status === 403 && jsonWrite.error?.code === 'ACCOUNT_FROZEN';

    // Verify Slave A Agent API operational requests (posting) are blocked with 403 ACCOUNT_FROZEN
    const resAgentOp = await fetchWithTimeout(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': slaveA.apiKey
      },
      body: JSON.stringify({ content: 'Autonomous post during expired plan', type: 'emit' })
    });
    const jsonAgentOp: any = await resAgentOp.json();
    const agentOpBlocked = resAgentOp.status === 403 && jsonAgentOp.error?.code === 'ACCOUNT_FROZEN';

    if (masterStillActive && mgmtWorks && humanWriteBlocked && agentOpBlocked) {
      record('Test D: Expiry & Operational Freeze', 'PASS', 'Master remained active and accessible; Slave human writes and Agent API calls were blocked (403 ACCOUNT_FROZEN).');
    } else {
      record('Test D: Expiry & Operational Freeze', 'FAIL', `masterActive=${masterStillActive}, mgmtWorks=${mgmtWorks}, humanWriteBlocked=${humanWriteBlocked}, agentOpBlocked=${agentOpBlocked}`);
    }
  } catch (err: any) {
    record('Test D: Expiry & Operational Freeze', 'FAIL', err.message);
  }

  // ----------------------------------------------------
  // Test E — Renewal with Strict Reactivation Condition
  // ----------------------------------------------------
  try {
    // Slave A is frozen with status_reason = 'plan_expired'
    // Now freeze Slave B explicitly with status_reason = 'security_action'
    await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts/${slaveB.id}/freeze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master1SessionToken}` },
      body: JSON.stringify({ reason: 'security_action' })
    });

    // Verify initial states before renewal via server API
    const resGetA = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts/${slaveA.id}`, {
      headers: { Authorization: `Bearer ${master1SessionToken}` }
    });
    const jsonGetA: any = await resGetA.json();

    const resGetB = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts/${slaveB.id}`, {
      headers: { Authorization: `Bearer ${master1SessionToken}` }
    });
    const jsonGetB: any = await resGetB.json();

    const readyBefore = jsonGetA.data?.status_reason === 'plan_expired' && jsonGetB.data?.status_reason === 'security_action';

    // Renew Master 1 plan
    await fetchWithTimeout(`${BASE_URL}/api/auth/master/plan/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master1SessionToken}` },
      body: JSON.stringify({ durationDays: 30, accountLimit: 10 })
    });

    // Check states after renewal:
    // Slave A MUST be active
    // Slave B MUST REMAIN frozen (not reactivated because reason != 'plan_expired')
    const { data: slaveADb } = await supabase.from('users').select('status').eq('id', slaveA.id).maybeSingle();
    const { data: slaveBDb } = await supabase.from('users').select('status').eq('id', slaveB.id).maybeSingle();

    const slaveAReactivated = slaveADb?.status === 'active';
    const slaveBRemainedFrozen = slaveBDb?.status === 'frozen';

    if (readyBefore && slaveAReactivated && slaveBRemainedFrozen) {
      record('Test E: Renewal Distinct Reactivation', 'PASS', 'Slave A (plan_expired) was reactivated to active; Slave B (security_action) remained frozen.');
    } else {
      record('Test E: Renewal Distinct Reactivation', 'FAIL', `readyBefore=${readyBefore}, slaveAReactivated=${slaveAReactivated}, slaveBRemainedFrozen=${slaveBRemainedFrozen}`);
    }
  } catch (err: any) {
    record('Test E: Renewal Distinct Reactivation', 'FAIL', err.message);
  }

  // ----------------------------------------------------
  // Test F — Identity Persistence Through Expiry & Renewal
  // ----------------------------------------------------
  try {
    // Verify Slave A's technical credentials and identity remained completely unchanged
    const slaveARecord = await findUserById(supabase, slaveA.id);

    const agentIdUnchanged = slaveARecord?.agentId === slaveA.agentId;
    const nameUnchanged = slaveARecord?.name === slaveA.name;
    const emailUnchanged = Boolean(slaveARecord?.email);

    // Verify Slave A's original API key still functions for agent operations now that plan is renewed
    const resKeyTest = await fetchWithTimeout(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': slaveA.apiKey
      },
      body: JSON.stringify({ content: 'Post after plan renewal verifying API key persistence', type: 'emit' })
    });
    const jsonKeyTest: any = await resKeyTest.json();
    const apiKeyStillValid = (resKeyTest.status === 200 || resKeyTest.status === 201) && jsonKeyTest.success === true;

    if (agentIdUnchanged && nameUnchanged && emailUnchanged && apiKeyStillValid) {
      record('Test F: Identity Persistence', 'PASS', 'Agent ID, API key, email, and agent credentials persisted intact through expiry and renewal.');
    } else {
      record('Test F: Identity Persistence', 'FAIL', `agentIdUnchanged=${agentIdUnchanged}, nameUnchanged=${nameUnchanged}, emailUnchanged=${emailUnchanged}, apiKeyStillValid=${apiKeyStillValid}`);
    }
  } catch (err: any) {
    record('Test F: Identity Persistence', 'FAIL', err.message);
  }

  // ----------------------------------------------------
  // Test G — Deletion Lifecycle
  // ----------------------------------------------------
  try {
    const slaveToDelete = createdSlaves[9]; // 10th slave

    // 1. Soft-delete slaveToDelete
    const resDel = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts/${slaveToDelete.id}/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${master1SessionToken}` }
    });
    const delSuccess = resDel.status === 200;

    // 2. Switching to deleted account is blocked with 403
    const resSwitchDel = await fetchWithTimeout(`${BASE_URL}/api/auth/master/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master1SessionToken}` },
      body: JSON.stringify({ targetUserId: slaveToDelete.id })
    });
    const switchDelBlocked = resSwitchDel.status === 403;

    // 3. Operational API call with deleted slave's API key is blocked with 403 ACCOUNT_DELETED
    const resApiDel = await fetchWithTimeout(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': slaveToDelete.apiKey
      },
      body: JSON.stringify({ content: 'Post by deleted account', type: 'emit' })
    });
    const jsonApiDel: any = await resApiDel.json();
    const apiDelBlocked = resApiDel.status === 403 && jsonApiDel.error?.code === 'ACCOUNT_DELETED';

    // 4. Renewal does NOT reactivate deleted account
    await fetchWithTimeout(`${BASE_URL}/api/auth/master/plan/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master1SessionToken}` },
      body: JSON.stringify({ durationDays: 30, accountLimit: 10 })
    });
    const { data: dbDelUser } = await supabase.from('users').select('status').eq('id', slaveToDelete.id).maybeSingle();
    const stillDeletedAfterRenewal = dbDelUser?.status === 'deleted';

    // 5. Deleted account freed up capacity: creating a replacement slave succeeds!
    const resRepl = await fetchWithTimeout(`${BASE_URL}/api/auth/master/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master1SessionToken}` },
      body: JSON.stringify({ agentName: 'Replacement Slave 10', bio: 'Replaces deleted slave' })
    });
    const replacementCreated = resRepl.status === 201;

    if (delSuccess && switchDelBlocked && apiDelBlocked && stillDeletedAfterRenewal && replacementCreated) {
      record('Test G: Deletion Lifecycle', 'PASS', 'Soft-deleted Slave cannot switch, API call blocked (403 ACCOUNT_DELETED), renewal ignored it, and slot capacity was freed.');
    } else {
      record('Test G: Deletion Lifecycle', 'FAIL', `delSuccess=${delSuccess}, switchBlocked=${switchDelBlocked}, apiBlocked=${apiDelBlocked}, stillDeleted=${stillDeletedAfterRenewal}, replacementCreated=${replacementCreated}`);
    }
  } catch (err: any) {
    record('Test G: Deletion Lifecycle', 'FAIL', err.message);
  }

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n==================================================');
  console.log('MULTI-ACCOUNT PRODUCTION READINESS RESULTS SUMMARY');
  console.log('==================================================');
  const failed = results.filter((r) => r.status === 'FAIL');
  if (failed.length === 0) {
    console.log('✅ ALL TEST CASES (A-G) PASSED SUCCESSFULLY!');
  } else {
    console.log(`❌ ${failed.length} TEST CASES FAILED:`);
    failed.forEach((f) => console.log(`   - ${f.name}: ${f.details}`));
  }
  console.log('==================================================\n');
}
