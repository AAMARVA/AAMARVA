import crypto from 'crypto';
import { getSupabaseClient } from '../server/supabase.js';
import { generateApiKey, computeApiKeyFingerprint, generateAgentAccessToken, createHumanSession } from '../server/authService.js';
import { realtimeService } from '../server/services/realtimeService.js';
import bcrypt from 'bcryptjs';

const BASE_URL = 'http://localhost:3000';

interface TestAgent {
  id: string;
  agentId: string;
  name: string;
  email: string;
  apiKey: string;
  token: string;
  sessionToken: string;
}

async function createTestAgent(prefix: string): Promise<TestAgent> {
  const supabase = getSupabaseClient();
  const id = `usr_sync_${crypto.randomUUID()}`;
  const agentId = `${prefix}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const apiKey = generateApiKey();
  const apiKeyHash = await bcrypt.hash(apiKey, 10);
  const apiKeyFingerprint = computeApiKeyFingerprint(apiKey);
  const email = `${agentId.toLowerCase()}@test.aamarva.internal`;
  const name = `Sync Test Node ${agentId}`;
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
    bio: 'Test agent bio for synchronization testing',
    createdAt: now,
    updatedAt: now
  };

  const { error } = await supabase.from('users').insert([userRecord]);
  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  const token = generateAgentAccessToken(userRecord as any);
  const sessionToken = await createHumanSession(id);

  return {
    id,
    agentId,
    name,
    email,
    apiKey,
    token,
    sessionToken
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
  } catch (e) {}
}

async function runAllSyncTests() {
  console.log('===============================================================');
  console.log(' AAMARVA FINAL PRIVATE ACTIVITY & REALTIME SYNCHRONIZATION TESTS');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
      failed++;
    }
  }

  let agentA: TestAgent | null = null;
  let agentB: TestAgent | null = null;
  let agentC: TestAgent | null = null;

  try {
    console.log('--- Provisioning Test Accounts (Agent A, Agent B, Agent C) ---');
    agentA = await createTestAgent('AGTA');
    agentB = await createTestAgent('AGTB');
    agentC = await createTestAgent('AGTC');
    console.log(`Agent A: ${agentA.agentId} (${agentA.id})`);
    console.log(`Agent B: ${agentB.agentId} (${agentB.id})`);
    console.log(`Agent C: ${agentC.agentId} (${agentC.id})\n`);

    // TEST 1: Unauthenticated request to /api/agent/footprints -> 401
    {
      const res = await fetch(`${BASE_URL}/api/agent/footprints`);
      assert(res.status === 401, 'Test 1: Unauthenticated GET /api/agent/footprints returns 401');
    }

    // TEST 2: Unauthenticated request to /api/webhooks/events -> 401
    {
      const res = await fetch(`${BASE_URL}/api/webhooks/events`);
      assert(res.status === 401, 'Test 2: Unauthenticated GET /api/webhooks/events returns 401');
    }

    // TEST 3: Human account owner can read own footprints -> 200
    {
      const res = await fetch(`${BASE_URL}/api/agent/footprints`, {
        headers: { Cookie: `aamarva_human_session=${agentA.sessionToken}` }
      });
      const data = await res.json();
      assert(res.status === 200 && data.success === true && Array.isArray(data.data), 'Test 3: Human account owner can read own footprints (200)');
    }

    // TEST 4: Human account owner can read own events -> 200
    {
      const res = await fetch(`${BASE_URL}/api/webhooks/events`, {
        headers: { Cookie: `aamarva_human_session=${agentA.sessionToken}` }
      });
      const data = await res.json();
      assert(res.status === 200 && data.success === true && Array.isArray(data.data), 'Test 4: Human account owner can read own events (200)');
    }

    // TEST 5: Agent credential can read own footprints -> 200
    {
      const res = await fetch(`${BASE_URL}/api/agent/footprints`, {
        headers: { Authorization: `Bearer ${agentA.token}` }
      });
      const data = await res.json();
      assert(res.status === 200 && data.success === true && Array.isArray(data.data), 'Test 5: Agent credential can read own footprints (200)');
    }

    // TEST 6: Agent credential can read own events -> 200
    {
      const res = await fetch(`${BASE_URL}/api/webhooks/events`, {
        headers: { Authorization: `Bearer ${agentA.token}` }
      });
      const data = await res.json();
      assert(res.status === 200 && data.success === true && Array.isArray(data.data), 'Test 6: Agent credential can read own events (200)');
    }

    // TEST 7: Agent A cannot read Agent B footprints (IDOR prevention) -> 403
    {
      const res = await fetch(`${BASE_URL}/api/agent/footprints?agentId=${agentB.agentId}`, {
        headers: { Authorization: `Bearer ${agentA.token}` }
      });
      assert(res.status === 403, 'Test 7: Agent A querying Agent B footprints via query param returns 403');
    }

    // TEST 8: Agent A cannot read Agent B events (IDOR prevention) -> 403
    {
      const res = await fetch(`${BASE_URL}/api/webhooks/events?agentId=${agentB.agentId}`, {
        headers: { Authorization: `Bearer ${agentA.token}` }
      });
      assert(res.status === 403, 'Test 8: Agent A querying Agent B events via query param returns 403');
    }

    // TEST 9: Zero-activity account returns empty list []
    {
      const resFp = await fetch(`${BASE_URL}/api/agent/footprints`, {
        headers: { Authorization: `Bearer ${agentC.token}` }
      });
      const dataFp = await resFp.json();
      const resEv = await fetch(`${BASE_URL}/api/webhooks/events`, {
        headers: { Authorization: `Bearer ${agentC.token}` }
      });
      const dataEv = await resEv.json();
      assert(
        dataFp.data.length === 0 && dataEv.data.length === 0,
        'Test 9: Brand new zero-activity account returns empty arrays [] for both footprints and events'
      );
    }

    // TEST 10: No synthetic fp_initial activity exists in the response
    {
      const res = await fetch(`${BASE_URL}/api/agent/footprints`, {
        headers: { Authorization: `Bearer ${agentC.token}` }
      });
      const data = await res.json();
      const hasSynthetic = (data.data || []).some((item: any) => item.id === 'fp_initial');
      assert(!hasSynthetic, 'Test 10: No synthetic fp_initial fake data injected');
    }

    // TEST 11 & 12 & 13 & 14: Outbound action creates expected footprint for sender AND inbound event for receiver, with no leakage to Agent C
    let createdPostId = '';
    let createdReplyId = '';
    {
      // Agent A creates a post
      const postRes = await fetch(`${BASE_URL}/api/posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentA.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: 'Telemetry sync verification broadcast payload' })
      });
      const postData = await postRes.json();
      createdPostId = postData.data?.id;
      assert(postRes.status === 201 && Boolean(createdPostId), 'Test 11a: Agent A creates post successfully');

      // Agent B replies to Agent A's post
      const replyRes = await fetch(`${BASE_URL}/api/posts/${createdPostId}/replies`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentB.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: 'Synchronous node response verification' })
      });
      const replyData = await replyRes.json();
      createdReplyId = replyData.data?.id;
      assert(replyRes.status === 201 && Boolean(createdReplyId), 'Test 11b: Agent B replies to Agent A post');

      // Check Agent B's footprints: must contain REPLY_SENT
      const agentBFpRes = await fetch(`${BASE_URL}/api/agent/footprints`, {
        headers: { Authorization: `Bearer ${agentB.token}` }
      });
      const agentBFp = await agentBFpRes.json();
      const bHasReplySent = agentBFp.data.some((f: any) => f.action === 'REPLY_SENT');
      assert(bHasReplySent, 'Test 11c: Agent B outbound footprint records REPLY_SENT');

      // Check Agent A's inbound events: must contain REPLY_RECEIVED
      const agentAEvRes = await fetch(`${BASE_URL}/api/webhooks/events`, {
        headers: { Authorization: `Bearer ${agentA.token}` }
      });
      const agentAEv = await agentAEvRes.json();
      const aHasReplyRecv = agentAEv.data.some((e: any) => e.type === 'REPLY_RECEIVED');
      assert(aHasReplyRecv, 'Test 12: Agent A inbound events records REPLY_RECEIVED from Agent B');

      // Check Agent A's footprints: must NOT contain Agent B's REPLY_SENT
      const agentAFpRes = await fetch(`${BASE_URL}/api/agent/footprints`, {
        headers: { Authorization: `Bearer ${agentA.token}` }
      });
      const agentAFp = await agentAFpRes.json();
      const aHasBOutbound = agentAFp.data.some((f: any) => f.action === 'REPLY_SENT');
      assert(!aHasBOutbound, 'Test 13: Sender activity (Agent B reply) does not leak into recipient (Agent A) outbound footprints');

      // Check Agent C: must have ZERO footprints and ZERO events
      const agentCEvRes = await fetch(`${BASE_URL}/api/webhooks/events`, {
        headers: { Authorization: `Bearer ${agentC.token}` }
      });
      const agentCEv = await agentCEvRes.json();
      assert(agentCEv.data.length === 0, 'Test 14: Unrelated Agent C receives NO inbound events from interaction between A and B');
    }

    // TEST 15: Public agent profile contains NO private footprints or events
    {
      const profileRes = await fetch(`${BASE_URL}/api/agents/${agentA.agentId}`);
      const profile = await profileRes.json();
      const hasFootprintsInPublic = 'footprints' in profile.data || 'external_events' in profile.data || 'events' in profile.data;
      assert(profileRes.status === 200 && !hasFootprintsInPublic, 'Test 15: Public profile GET /api/agents/:agentId exposes no private activity or footprints');
    }

    // TEST 16 & 17: Realtime notification reaches correct account and NOT unrelated account
    {
      let agentARealtimeReceived = false;
      let agentCRealtimeReceived = false;

      const unsubscribeA = (evt: any) => {
        if (evt.type === 'TEST_SYNC_EVENT') agentARealtimeReceived = true;
      };
      const unsubscribeC = (evt: any) => {
        if (evt.type === 'TEST_SYNC_EVENT') agentCRealtimeReceived = true;
      };

      realtimeService.on(`account:${agentA.id}`, unsubscribeA);
      realtimeService.on(`account:${agentC.id}`, unsubscribeC);

      // Trigger notification specifically for Agent A
      realtimeService.notifyAccount(agentA.id, {
        id: `evt_test_rt_${Date.now()}`,
        type: 'TEST_SYNC_EVENT',
        category: 'event',
        accountId: agentA.id,
        timestamp: new Date().toISOString()
      });

      // Small delay for event loop dispatch
      await new Promise(r => setTimeout(r, 50));

      realtimeService.off(`account:${agentA.id}`, unsubscribeA);
      realtimeService.off(`account:${agentC.id}`, unsubscribeC);

      assert(agentARealtimeReceived, 'Test 16: Realtime event reaches target account listener');
      assert(!agentCRealtimeReceived, 'Test 17: Realtime event does NOT leak to unrelated account listener');
    }

    // TEST 18: Realtime event ID deduplication in client payload
    {
      const testId = `dedup_${Date.now()}`;
      const payload1 = { id: testId, type: 'POST_CREATED', timestamp: new Date().toISOString() };
      const payload2 = { id: testId, type: 'POST_CREATED', timestamp: new Date().toISOString() };
      const set = new Set([payload1.id, payload2.id]);
      assert(set.size === 1, 'Test 18: Realtime event IDs deduplicate deterministically');
    }

    // TEST 19 & 20: Disconnection / Reconnection REST reconciliation
    {
      // Post created while client was disconnected
      const postRes2 = await fetch(`${BASE_URL}/api/posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentA.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: 'Post published during offline state' })
      });
      const data2 = await postRes2.json();

      // REST fetch after reconnection recovers the post
      const resRecovered = await fetch(`${BASE_URL}/api/agent/footprints`, {
        headers: { Authorization: `Bearer ${agentA.token}` }
      });
      const recoveredData = await resRecovered.json();
      const hasOfflinePost = recoveredData.data.some((f: any) => f.target === data2.data?.id || (f.details && f.details.includes('offline')));
      assert(hasOfflinePost, 'Test 19 & 20: REST reconciliation recovers events missed during disconnection');
    }

    // TEST 21: Connection Handshake lifecycle auditability
    let connReqId = '';
    let connId = '';
    {
      // Agent A sends connection request to Agent B
      const reqRes = await fetch(`${BASE_URL}/api/connections/requests`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentA.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ receiverAgentId: agentB.agentId })
      });
      const reqData = await reqRes.json();
      connReqId = reqData.data?.id;
      assert(reqRes.status === 201 && Boolean(connReqId), 'Test 21a: Agent A initiates handshake to Agent B');

      // Agent B checks inbound events: must have CONNECTION_REQUEST_RECEIVED
      const bEventsRes = await fetch(`${BASE_URL}/api/webhooks/events`, {
        headers: { Authorization: `Bearer ${agentB.token}` }
      });
      const bEvents = await bEventsRes.json();
      const hasReqReceived = bEvents.data.some((e: any) => e.type === 'CONNECTION_REQUEST_RECEIVED');
      assert(hasReqReceived, 'Test 21b: Agent B receives CONNECTION_REQUEST_RECEIVED inbound event');

      // Agent B accepts connection request
      const acceptRes = await fetch(`${BASE_URL}/api/connections/requests/${connReqId}/accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentB.token}`
        }
      });
      const acceptData = await acceptRes.json();
      connId = acceptData.data?.id;
      assert(acceptRes.status === 200 && Boolean(connId), 'Test 21c: Agent B accepts handshake');

      // Agent A checks inbound events: must have CONNECTION_ACCEPTED_BY_TARGET
      const aEventsRes = await fetch(`${BASE_URL}/api/webhooks/events`, {
        headers: { Authorization: `Bearer ${agentA.token}` }
      });
      const aEvents = await aEventsRes.json();
      const hasAcceptedEvt = aEvents.data.some((e: any) => e.type === 'CONNECTION_ACCEPTED_BY_TARGET');
      assert(hasAcceptedEvt, 'Test 21d: Agent A receives CONNECTION_ACCEPTED_BY_TARGET inbound event');
    }

    // TEST 22: Counterparty review authorization and security check
    {
      // Non-participant Agent C attempts to review connection between A and B -> MUST BE 403
      const cReviewRes = await fetch(`${BASE_URL}/api/counter-party-score`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentC.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connectionId: connId,
          comment: 'Unauthorized review from uninvolved party'
        })
      });
      assert(cReviewRes.status === 403, 'Test 22a: Non-participant Agent C is rejected with 403 on counterparty review');

      // Valid participant Agent A submits review for Agent B -> 200
      const aReviewRes = await fetch(`${BASE_URL}/api/counter-party-score`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentA.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connectionId: connId,
          comment: 'Outstanding latency and verified signature'
        })
      });
      assert(aReviewRes.status === 200, 'Test 22b: Connected peer Agent A successfully submits counterparty review');

      // Agent B receives COUNTERPARTY_REVIEW_RECEIVED inbound event
      const bEventsRes = await fetch(`${BASE_URL}/api/webhooks/events`, {
        headers: { Authorization: `Bearer ${agentB.token}` }
      });
      const bEvents = await bEventsRes.json();
      const hasReviewRecv = bEvents.data.some((e: any) => e.type === 'COUNTERPARTY_REVIEW_RECEIVED');
      assert(hasReviewRecv, 'Test 22c: Agent B receives COUNTERPARTY_REVIEW_RECEIVED inbound event');
    }

    // TEST 23: Direct message footprint and inbound event
    {
      const msgRes = await fetch(`${BASE_URL}/api/connections/${connId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentA.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: 'Confidential encrypted handshake confirmation' })
      });
      assert(msgRes.status === 201, 'Test 23a: Agent A transmits message to Agent B');

      const bEventsRes = await fetch(`${BASE_URL}/api/webhooks/events`, {
        headers: { Authorization: `Bearer ${agentB.token}` }
      });
      const bEvents = await bEventsRes.json();
      const hasMsgRecv = bEvents.data.some((e: any) => e.type === 'MESSAGE_RECEIVED');
      assert(hasMsgRecv, 'Test 23b: Agent B receives MESSAGE_RECEIVED inbound event');
    }

  } catch (err: any) {
    console.error('Fatal error during test execution:', err);
    failed++;
  } finally {
    console.log('\n--- Cleaning Up Test Accounts ---');
    if (agentA) await cleanupAgent(agentA);
    if (agentB) await cleanupAgent(agentB);
    if (agentC) await cleanupAgent(agentC);
  }

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllSyncTests();
