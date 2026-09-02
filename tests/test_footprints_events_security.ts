import crypto from 'crypto';
import { getSupabaseClient } from '../server/supabase.js';
import { generateApiKey, computeApiKeyFingerprint, generateAgentAccessToken } from '../server/authService.js';
import bcrypt from 'bcryptjs';

const BASE_URL = 'http://localhost:3000';

interface TestAgent {
  id: string;
  agentId: string;
  name: string;
  email: string;
  apiKey: string;
  token: string;
}

async function createTestAgent(prefix: string): Promise<TestAgent> {
  const supabase = getSupabaseClient();
  const id = `usr_test_${crypto.randomUUID()}`;
  const agentId = `${prefix}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const apiKey = generateApiKey();
  const apiKeyHash = await bcrypt.hash(apiKey, 10);
  const apiKeyFingerprint = computeApiKeyFingerprint(apiKey);
  const email = `${agentId.toLowerCase()}@test.aamarva.internal`;
  const name = `Test Node ${agentId}`;
  const now = new Date().toISOString();

  const userRecord = {
    id,
    agentId,
    email,
    passwordHash: 'TEST_HASH_NOT_FOR_LOGIN',
    apiKeyHash,
    apiKeyFingerprint,
    name,
    status: 'active',
    avatar: `https://robohash.org/${agentId}.png`,
    bio: 'Test agent bio',
    createdAt: now,
    updatedAt: now
  };

  const { error } = await supabase.from('users').insert([userRecord]);

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  const token = generateAgentAccessToken(userRecord as any);

  return {
    id,
    agentId,
    name,
    email,
    apiKey,
    token
  };
}

async function cleanupAgent(agent: TestAgent) {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('agent_footprints').delete().eq('user_id', agent.id);
    await supabase.from('external_events').delete().eq('user_id', agent.id);
    await supabase.from('messages').delete().eq('senderUserId', agent.id);
    await supabase.from('reviews').delete().eq('reviewerUserId', agent.id);
    await supabase.from('connection_requests').delete().or(`senderUserId.eq.${agent.id},receiverUserId.eq.${agent.id}`);
    await supabase.from('connections').delete().or(`postOwnerUserId.eq.${agent.id},replyAuthorUserId.eq.${agent.id}`);
    await supabase.from('replies').delete().eq('userId', agent.id);
    await supabase.from('posts').delete().eq('userId', agent.id);
    await supabase.from('users').delete().eq('id', agent.id);
  } catch (e) {
    // ignore
  }
}

async function runSecurityTests() {
  console.log('====================================================');
  console.log('  AAMARVA FOOTPRINTS & EVENTS SECURITY TEST SUITE   ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  let agentA: TestAgent | null = null;
  let agentB: TestAgent | null = null;
  let agentFresh: TestAgent | null = null;

  try {
    console.log('Provisioning isolated test agents in Supabase...');
    agentA = await createTestAgent('AGENTA');
    agentB = await createTestAgent('AGENTB');
    agentFresh = await createTestAgent('FRESH');
    console.log(`Agent A: @${agentA.agentId} (${agentA.id})`);
    console.log(`Agent B: @${agentB.agentId} (${agentB.id})`);
    console.log(`Agent Fresh: @${agentFresh.agentId} (${agentFresh.id})\n`);

    // TEST 1: Unauthenticated GET /api/agent/footprints returns 401
    const t1 = await fetch(`${BASE_URL}/api/agent/footprints`);
    assert(t1.status === 401, 'Test 1: Unauthenticated GET /api/agent/footprints rejected with 401');

    // TEST 2: Unauthenticated GET /api/webhooks/events returns 401
    const t2 = await fetch(`${BASE_URL}/api/webhooks/events`);
    assert(t2.status === 401, 'Test 2: Unauthenticated GET /api/webhooks/events rejected with 401');

    // TEST 3: Authenticated Agent A cannot pass ?agentId=AGENTB to read Agent B's footprints (403 Forbidden)
    const t3 = await fetch(`${BASE_URL}/api/agent/footprints?agentId=${agentB.agentId}`, {
      headers: { Authorization: `Bearer ${agentA.token}` }
    });
    assert(t3.status === 403, 'Test 3: IDOR prevention on footprints - Agent A querying Agent B footprints returns 403');

    // TEST 4: Authenticated Agent A cannot pass ?agentId=AGENTB to read Agent B's events (403 Forbidden)
    const t4 = await fetch(`${BASE_URL}/api/webhooks/events?agentId=${agentB.agentId}`, {
      headers: { Authorization: `Bearer ${agentA.token}` }
    });
    assert(t4.status === 403, 'Test 4: IDOR prevention on events - Agent A querying Agent B events returns 403');

    // TEST 5: Fresh account with 0 activities returns empty list [] without fp_initial mock
    const t5 = await fetch(`${BASE_URL}/api/agent/footprints`, {
      headers: { Authorization: `Bearer ${agentFresh.token}` }
    });
    const t5Data = await t5.json();
    const hasMock = Array.isArray(t5Data.data) && t5Data.data.some((f: any) => f.id === 'fp_initial');
    assert(t5.status === 200 && Array.isArray(t5Data.data) && t5Data.data.length === 0 && !hasMock,
      'Test 5: Zero-activity account returns empty array without synthetic fp_initial');

    // TEST 6: Outbound action by Agent A (Create Post) appears in Agent A footprints
    const postRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentA.token}`
      },
      body: JSON.stringify({
        content: 'Transmission from Node A for footprints test.',
        category: 'Engineering',
        type: 'emit'
      })
    });
    const postData = await postRes.json();
    assert(postRes.status === 201 && postData.success, 'Test 6a: Agent A creates post transmission');

    const t6Footprints = await fetch(`${BASE_URL}/api/agent/footprints`, {
      headers: { Authorization: `Bearer ${agentA.token}` }
    });
    const t6Data = await t6Footprints.json();
    const postFootprint = t6Data.data?.find((f: any) => f.action === 'POST_CREATED' && f.target === postData.data.id);
    assert(!!postFootprint, 'Test 6b: Agent A footprints accurately contain POST_CREATED with deterministic target');

    // TEST 7: Agent A's outbound action does NOT appear in Agent B's footprints
    const t7Footprints = await fetch(`${BASE_URL}/api/agent/footprints`, {
      headers: { Authorization: `Bearer ${agentB.token}` }
    });
    const t7Data = await t7Footprints.json();
    const leakedFootprint = t7Data.data?.find((f: any) => f.target === postData.data.id);
    assert(!leakedFootprint, 'Test 7: Complete isolation - Agent A outbound post does NOT leak into Agent B footprints');

    // TEST 8: Agent A sends connection request to Agent B -> appears in Agent B's webhooks/events inbox
    const reqRes = await fetch(`${BASE_URL}/api/connections/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentA.token}`
      },
      body: JSON.stringify({
        receiverAgentId: agentB.agentId
      })
    });
    const reqData = await reqRes.json();
    assert(reqRes.status === 201 && reqData.success, 'Test 8a: Agent A sends connection request to Agent B');

    const t8Events = await fetch(`${BASE_URL}/api/webhooks/events`, {
      headers: { Authorization: `Bearer ${agentB.token}` }
    });
    const t8Data = await t8Events.json();
    const connReqEvent = t8Data.data?.find((e: any) => e.type === 'CONNECTION_REQUEST_RECEIVED' && (e.senderId === agentA.agentId || e.senderId === agentA.id));
    assert(!!connReqEvent, 'Test 8b: Inbound event inbox for Agent B contains CONNECTION_REQUEST_RECEIVED from Agent A');

    // TEST 9: Inbound event for Agent B does NOT appear in Agent A's webhooks/events inbox
    const t9Events = await fetch(`${BASE_URL}/api/webhooks/events`, {
      headers: { Authorization: `Bearer ${agentA.token}` }
    });
    const t9Data = await t9Events.json();
    const leakedEvent = t9Data.data?.find((e: any) => e.type === 'CONNECTION_REQUEST_RECEIVED' && e.id === connReqEvent?.id);
    assert(!leakedEvent, 'Test 9: Complete isolation - Inbound request event for Agent B does NOT appear in Agent A events');

    // TEST 10: Public profile queries do NOT expose private footprints or inbox events
    const t10 = await fetch(`${BASE_URL}/api/agents/${agentA.agentId}`);
    const t10Data = await t10.json();
    const hasFootprintsInProfile = !!t10Data.footprints || !!t10Data.events || !!t10Data.apiKeyHash || !!t10Data.passwordHash;
    assert(t10.status === 200 && !hasFootprintsInProfile, 'Test 10: Public profile endpoints strictly do NOT expose private footprints or event inboxes');

    // TEST 11: Agent B accepts connection request from Agent A -> Connection established
    const acceptRes = await fetch(`${BASE_URL}/api/connections/requests/${reqData.data.id}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentB.token}`
      }
    });
    const acceptData = await acceptRes.json();
    assert(acceptRes.status === 200 && acceptData.success, 'Test 11a: Agent B accepts connection request');

    const connectionId = acceptData.data.id;

    // Agent A submits counterparty review for Agent B
    const reviewRes = await fetch(`${BASE_URL}/api/counter-party-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentA.token}`
      },
      body: JSON.stringify({
        connectionId,
        comment: 'High throughput, zero packet loss peer node.'
      })
    });
    const reviewData = await reviewRes.json();
    assert(reviewRes.status === 200 && reviewData.success, 'Test 11b: Connected Agent A submits counterparty review for Agent B');

    // Check Agent A footprints for COUNTER_PARTY_REVIEW
    const t11Footprints = await fetch(`${BASE_URL}/api/agent/footprints`, {
      headers: { Authorization: `Bearer ${agentA.token}` }
    });
    const t11FpData = await t11Footprints.json();
    const reviewFootprint = t11FpData.data?.find((f: any) => f.action === 'COUNTER_PARTY_REVIEW');
    assert(!!reviewFootprint, 'Test 11c: Agent A footprints log COUNTER_PARTY_REVIEW outbound activity');

    // Check Agent B events for COUNTERPARTY_REVIEW_RECEIVED
    const t11Events = await fetch(`${BASE_URL}/api/webhooks/events`, {
      headers: { Authorization: `Bearer ${agentB.token}` }
    });
    const t11EvtData = await t11Events.json();
    const reviewInboundEvent = t11EvtData.data?.find((e: any) => e.type === 'COUNTERPARTY_REVIEW_RECEIVED');
    assert(!!reviewInboundEvent, 'Test 11d: Agent B private event inbox receives COUNTERPARTY_REVIEW_RECEIVED notification');

    // TEST 12: Non-participant (Agent Fresh) attempting to submit counterparty review on connection returns 403 Forbidden
    const unauthReviewRes = await fetch(`${BASE_URL}/api/counter-party-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentFresh.token}`
      },
      body: JSON.stringify({
        connectionId,
        comment: 'Intruder review.'
      })
    });
    assert(unauthReviewRes.status === 403, 'Test 12: Non-participant agent submitting counterparty review on connection is rejected with 403 Forbidden');

  } catch (error: any) {
    console.error('Fatal error during test run:', error);
    failed++;
  } finally {
    console.log('\nCleaning up test agents...');
    if (agentA) await cleanupAgent(agentA);
    if (agentB) await cleanupAgent(agentB);
    if (agentFresh) await cleanupAgent(agentFresh);
    console.log('Cleanup complete.');
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests();
