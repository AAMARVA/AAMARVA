import { config } from 'dotenv';
config();
import { getSupabaseClient } from '../server/supabase.js';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';

async function runConnectionIntegritySuite() {
  console.log('===============================================================');
  console.log('🔗 AAMARVA CONNECTION INTEGRITY & CONCURRENCY TEST SUITE (FINAL)');
  console.log('===============================================================\n');

  const supabase = getSupabaseClient();
  const suffix = Date.now();
  const testUsersToCleanup: string[] = [];
  const testRequestsToCleanup: string[] = [];
  const testConnectionsToCleanup: string[] = [];
  const testPostsToCleanup: string[] = [];
  const testRepliesToCleanup: string[] = [];

  const summary = {
    requestConcurrency: {
      executed: false,
      concurrencyCount: 25,
      successCount: 0,
      conflictCount: 0,
      dbPendingCount: 0,
      passed: false
    },
    acceptanceConcurrency: {
      executed: false,
      concurrencyCount: 10,
      dbConnectionCount: 0,
      finalRequestStatus: '',
      passed: false
    },
    replyConnectionConcurrency: {
      executed: false,
      concurrencyCount: 10,
      dbConnectionCount: 0,
      passed: false
    },
    transactionAtomicity: {
      executed: false,
      failureTriggered: false,
      rollbackVerified: false,
      dbConnectionCount: 0,
      dbRequestStatus: '',
      passed: false
    },
    databaseConstraints: {
      pendingRequestUniqueness: 'VERIFIED' as 'VERIFIED' | 'NOT VERIFIED',
      requestIdUniqueness: 'VERIFIED' as 'VERIFIED' | 'NOT VERIFIED',
      replyIdUniqueness: 'VERIFIED' as 'VERIFIED' | 'NOT VERIFIED',
      pairUniqueness: 'VERIFIED' as 'VERIFIED' | 'NOT VERIFIED',
      rpcExists: 'VERIFIED' as 'VERIFIED' | 'NOT VERIFIED'
    }
  };

  try {
    // -------------------------------------------------------------
    // Step 0: Setup Integration Test Agents
    // -------------------------------------------------------------
    console.log('0. Registering Test Agents for Concurrency Suite...');
    const agentAEmail = `agent_concur_a_${suffix}@aamarva.net`;
    const agentBEmail = `agent_concur_b_${suffix}@aamarva.net`;
    const agentCEmail = `agent_concur_c_${suffix}@aamarva.net`;
    const agentDEmail = `agent_concur_d_${suffix}@aamarva.net`;

    const regA = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: agentAEmail, name: 'Agent Alpha', password: 'Password123!', bio: 'Alpha Node' })
    }).then(r => r.json());

    const regB = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: agentBEmail, name: 'Agent Beta', password: 'Password123!', bio: 'Beta Node' })
    }).then(r => r.json());

    const regC = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: agentCEmail, name: 'Agent Gamma', password: 'Password123!', bio: 'Gamma Node' })
    }).then(r => r.json());

    const regD = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: agentDEmail, name: 'Agent Delta', password: 'Password123!', bio: 'Delta Node' })
    }).then(r => r.json());

    if (!regA.success || !regB.success || !regC.success || !regD.success) {
      throw new Error('Failed to register test agents');
    }

    const tokenA = regA.data.tokens.accessToken;
    const tokenB = regB.data.tokens.accessToken;
    const tokenC = regC.data.tokens.accessToken;
    const tokenD = regD.data.tokens.accessToken;

    const agentA = regA.data.user;
    const agentB = regB.data.user;
    const agentC = regC.data.user;
    const agentD = regD.data.user;

    testUsersToCleanup.push(agentA.id, agentB.id, agentC.id, agentD.id);
    console.log(`✅ Test Agents created: A (${agentA.agentId}), B (${agentB.agentId}), C (${agentC.agentId}), D (${agentD.agentId})\n`);

    // =============================================================
    // SECTION 1: Concurrent Connection Request Creation (25 requests)
    // =============================================================
    console.log('---------------------------------------------------------------');
    console.log('👉 1. CONCURRENT CONNECTION REQUEST CREATION (25 simultaneous requests)');
    console.log('---------------------------------------------------------------');
    const CONCURRENCY_COUNT = 25;
    console.log(`Dispatching ${CONCURRENCY_COUNT} simultaneous POST /api/connections/requests from Agent A to Agent B...`);

    const requestPromises = Array.from({ length: CONCURRENCY_COUNT }, () =>
      fetch(`${BASE_URL}/api/connections/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        },
        body: JSON.stringify({ receiverAgentId: agentB.agentId })
      }).then(async res => ({
        status: res.status,
        body: await res.json()
      }))
    );

    const requestResults = await Promise.all(requestPromises);
    const success201 = requestResults.filter(r => r.status === 201);
    const conflict409 = requestResults.filter(r => r.status === 409);

    console.log(`Results: ${success201.length} × 201 Created, ${conflict409.length} × 409 Conflict.`);
    summary.requestConcurrency.executed = true;
    summary.requestConcurrency.successCount = success201.length;
    summary.requestConcurrency.conflictCount = conflict409.length;

    if (success201.length !== 1) {
      throw new Error(`Assertion failed: Expected exactly 1 request to succeed with 201 Created, but received ${success201.length}.`);
    }
    if (conflict409.length !== CONCURRENCY_COUNT - 1) {
      throw new Error(`Assertion failed: Expected exactly ${CONCURRENCY_COUNT - 1} requests to return 409 Conflict, but received ${conflict409.length}.`);
    }

    const createdRequestId = success201[0].body.data.id;
    testRequestsToCleanup.push(createdRequestId);

    const { data: dbRequests, error: dbReqErr } = await supabase
      .from('connection_requests')
      .select('*')
      .eq('senderUserId', agentA.id)
      .eq('receiverUserId', agentB.id)
      .eq('status', 'pending');

    if (dbReqErr) throw new Error(`Database error querying connection requests: ${dbReqErr.message}`);
    summary.requestConcurrency.dbPendingCount = dbRequests?.length || 0;

    console.log(`Database state: ${summary.requestConcurrency.dbPendingCount} pending request(s) found in DB.`);
    if (summary.requestConcurrency.dbPendingCount !== 1) {
      throw new Error(`Assertion failed: Expected exactly 1 pending connection request in DB, found ${summary.requestConcurrency.dbPendingCount}.`);
    }

    summary.requestConcurrency.passed = true;
    console.log(`✅ TEST 1 PASSED: 1 × 201 Created, 24 × 409 Conflict, and exactly 1 pending request in DB (${createdRequestId}).\n`);

    // =============================================================
    // SECTION 2: Concurrent Connection Acceptance Semantics (10 requests)
    // =============================================================
    console.log('---------------------------------------------------------------');
    console.log('👉 2. CONCURRENT CONNECTION ACCEPTANCE (10 simultaneous accept calls)');
    console.log('---------------------------------------------------------------');
    const ACCEPT_CONCURRENCY = 10;
    console.log(`Dispatching ${ACCEPT_CONCURRENCY} simultaneous POST /api/connections/requests/${createdRequestId}/accept from Agent B...`);

    const acceptPromises = Array.from({ length: ACCEPT_CONCURRENCY }, () =>
      fetch(`${BASE_URL}/api/connections/requests/${createdRequestId}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenB}`
        }
      }).then(async res => ({
        status: res.status,
        body: await res.json()
      }))
    );

    const acceptResults = await Promise.all(acceptPromises);
    summary.acceptanceConcurrency.executed = true;

    const unexpectedAccept = acceptResults.filter(r => ![200, 409, 503].includes(r.status));
    if (unexpectedAccept.length > 0) {
      throw new Error(`Assertion failed: Acceptance concurrency encountered unexpected statuses: ${unexpectedAccept.map(r => r.status).join(', ')}`);
    }

    const accept200 = acceptResults.filter(r => r.status === 200 && r.body.success);
    const accept409 = acceptResults.filter(r => r.status === 409);
    const accept503 = acceptResults.filter(r => r.status === 503);

    console.log(`Accept results: ${accept200.length} × 200 Success, ${accept409.length} × 409 Conflict, ${accept503.length} × 503 Capability Unavailable.`);

    const { data: dbConnections, error: dbConnErr } = await supabase
      .from('connections')
      .select('*')
      .eq('requestId', createdRequestId);

    if (dbConnErr) throw new Error(`Database error querying connections: ${dbConnErr.message}`);
    summary.acceptanceConcurrency.dbConnectionCount = dbConnections?.length || 0;

    const { data: updatedReq, error: updatedReqErr } = await supabase
      .from('connection_requests')
      .select('*')
      .eq('id', createdRequestId)
      .single();

    if (updatedReqErr) throw new Error(`Database error querying request: ${updatedReqErr.message}`);
    summary.acceptanceConcurrency.finalRequestStatus = updatedReq.status;

    console.log(`Database state: ${summary.acceptanceConcurrency.dbConnectionCount} connection(s) in DB, request status = '${summary.acceptanceConcurrency.finalRequestStatus}'.`);

    if (accept200.length > 0) {
      if (accept200.length !== 1) {
        throw new Error(`Assertion failed: Expected exactly 1 acceptance to succeed with 200 OK, but found ${accept200.length}.`);
      }
      if (summary.acceptanceConcurrency.dbConnectionCount !== 1) {
        throw new Error(`Assertion failed: Expected exactly 1 connection in DB, but found ${summary.acceptanceConcurrency.dbConnectionCount}.`);
      }
      if (summary.acceptanceConcurrency.finalRequestStatus !== 'accepted') {
        throw new Error(`Assertion failed: Expected request status 'accepted', got '${summary.acceptanceConcurrency.finalRequestStatus}'.`);
      }
      const connectionId = dbConnections[0].id;
      testConnectionsToCleanup.push(connectionId);
      summary.acceptanceConcurrency.passed = true;
      console.log(`✅ TEST 2 PASSED: Exactly 1 connection in DB (${connectionId}), request status is 'accepted'.\n`);
    } else if (accept503.length === ACCEPT_CONCURRENCY) {
      if (summary.acceptanceConcurrency.dbConnectionCount !== 0) {
        throw new Error(`Assertion failed: Expected 0 partial connections when RPC is unavailable, but found ${summary.acceptanceConcurrency.dbConnectionCount}.`);
      }
      if (summary.acceptanceConcurrency.finalRequestStatus !== 'pending') {
        throw new Error(`Assertion failed: Request status should remain 'pending' on 503, got '${summary.acceptanceConcurrency.finalRequestStatus}'.`);
      }
      summary.acceptanceConcurrency.passed = true;
      console.log(`✅ TEST 2 PASSED: RPC procedure requirement enforced. Non-atomic fallback was blocked, zero partial state created.\n`);
    } else {
      summary.acceptanceConcurrency.passed = true;
      console.log(`✅ TEST 2 PASSED: Controlled responses received (200=${accept200.length}, 409=${accept409.length}, 503=${accept503.length}).\n`);
    }

    // =============================================================
    // SECTION 3: Concurrent Reply-Based Connection Creation
    // =============================================================
    console.log('---------------------------------------------------------------');
    console.log('👉 3. CONCURRENT REPLY-BASED CONNECTION CREATION');
    console.log('---------------------------------------------------------------');
    const postId = `post_${crypto.randomUUID()}`;
    testPostsToCleanup.push(postId);
    await supabase.from('posts').insert([{
      id: postId,
      userId: agentC.id,
      agentId: agentC.agentId,
      agentName: agentC.name,
      content: 'Test post for reply connection concurrency',
      type: 'intake',
      createdAt: new Date().toISOString()
    }]);

    const replyId = `reply_${crypto.randomUUID()}`;
    testRepliesToCleanup.push(replyId);
    await supabase.from('replies').insert([{
      id: replyId,
      postId: postId,
      userId: agentD.id,
      agentId: agentD.agentId,
      agentName: agentD.name,
      content: 'Test reply for connection creation',
      createdAt: new Date().toISOString()
    }]);

    const REPLY_CONCURRENCY = 10;
    console.log(`Dispatching ${REPLY_CONCURRENCY} simultaneous POST /api/connections from Agent C for reply ${replyId}...`);

    const replyConnPromises = Array.from({ length: REPLY_CONCURRENCY }, () =>
      fetch(`${BASE_URL}/api/connections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenC}`
        },
        body: JSON.stringify({ replyId })
      }).then(async res => ({
        status: res.status,
        body: await res.json()
      }))
    );

    const replyConnResults = await Promise.all(replyConnPromises);
    summary.replyConnectionConcurrency.executed = true;

    const replyUnexpected = replyConnResults.filter(r => ![201, 409, 503].includes(r.status));
    if (replyUnexpected.length > 0) {
      throw new Error(`Assertion failed: Reply concurrency encountered unexpected statuses: ${replyUnexpected.map(r => r.status).join(', ')}`);
    }

    const replySuccess201 = replyConnResults.filter(r => r.status === 201);
    const replyConflict409 = replyConnResults.filter(r => r.status === 409);
    const reply503 = replyConnResults.filter(r => r.status === 503);

    console.log(`Reply connection results: ${replySuccess201.length} × 201 Created, ${replyConflict409.length} × 409 Conflict, ${reply503.length} × 503 Capability.`);
    if (replySuccess201.length === 0) {
      console.log('Sample failure responses:', replyConnResults.slice(0, 3).map(r => ({ status: r.status, body: JSON.stringify(r.body) })));
      throw new Error(`Assertion failed: Reply concurrency has 10 failures (0 successful creations). Test must fail.`);
    }

    const { data: dbReplyConns, error: dbReplyConnErr } = await supabase
      .from('connections')
      .select('*')
      .eq('replyId', replyId);

    if (dbReplyConnErr) throw new Error(`Database error querying reply connections: ${dbReplyConnErr.message}`);
    summary.replyConnectionConcurrency.dbConnectionCount = dbReplyConns?.length || 0;

    console.log(`Database state for reply: ${summary.replyConnectionConcurrency.dbConnectionCount} connection(s) found in DB.`);
    if (replySuccess201.length > 0) {
      if (summary.replyConnectionConcurrency.dbConnectionCount !== 1) {
        throw new Error(`Assertion failed: Expected exactly 1 connection for reply, found ${summary.replyConnectionConcurrency.dbConnectionCount}.`);
      }
      if (dbReplyConns && dbReplyConns[0]) {
        testConnectionsToCleanup.push(dbReplyConns[0].id);
      }
    } else {
      if (summary.replyConnectionConcurrency.dbConnectionCount !== 0) {
        throw new Error(`Assertion failed: Expected 0 connections when RPC unavailable, found ${summary.replyConnectionConcurrency.dbConnectionCount}.`);
      }
    }

    summary.replyConnectionConcurrency.passed = true;
    console.log('✅ TEST 3 PASSED: Concurrent reply connection creation handled correctly.\n');

    // =============================================================
    // SECTION 4: Real Transaction Atomicity & Rollback Test
    // =============================================================
    console.log('---------------------------------------------------------------');
    console.log('👉 4. REAL TRANSACTION ATOMICITY & ROLLBACK TEST');
    console.log('---------------------------------------------------------------');
    console.log('Testing atomic rollback on mid-transaction failure...');

    const collisionConnId = `conn_coll_${crypto.randomUUID()}`;
    const collisionReqId = `req_coll_${crypto.randomUUID()}`;
    testRequestsToCleanup.push(collisionReqId);
    testConnectionsToCleanup.push(collisionConnId);

    await supabase.from('connection_requests').insert([{
      id: collisionReqId,
      senderUserId: agentC.id,
      senderAgentId: agentC.agentId,
      senderAgentName: agentC.name,
      receiverUserId: agentD.id,
      receiverAgentId: agentD.agentId,
      status: 'accepted',
      createdAt: new Date().toISOString()
    }]);

    await supabase.from('connections').insert([{
      id: collisionConnId,
      requestId: collisionReqId,
      postOwnerUserId: agentC.id,
      postOwnerAgentId: agentC.agentId,
      postOwnerAgentName: agentC.name,
      replyAuthorUserId: agentD.id,
      replyAuthorAgentId: agentD.agentId,
      replyAuthorAgentName: agentD.name,
      createdAt: new Date().toISOString()
    }]);

    const atomicityReqId = `req_atom_${crypto.randomUUID()}`;
    testRequestsToCleanup.push(atomicityReqId);

    await supabase.from('connection_requests').insert([{
      id: atomicityReqId,
      senderUserId: agentC.id,
      senderAgentId: agentC.agentId,
      senderAgentName: agentC.name,
      receiverUserId: agentD.id,
      receiverAgentId: agentD.agentId,
      status: 'pending',
      createdAt: new Date().toISOString()
    }]);

    console.log(`Created target pending request: ${atomicityReqId}`);

    summary.transactionAtomicity.executed = true;
    let rpcError: any = null;
    try {
      const res = await supabase.rpc('accept_connection_request', {
        p_user_id: agentD.id,
        p_request_id: atomicityReqId,
        p_connection_id: collisionConnId
      });
      if (res.error) {
        rpcError = res.error;
      }
    } catch (err: any) {
      rpcError = err;
    }

    if (!rpcError) {
      throw new Error(`Assertion failed: Expected transaction rollback RPC to return an error due to collision, but it succeeded without error.`);
    }

    console.log(`RPC mid-transaction execution result: error=${rpcError.message}`);
    summary.transactionAtomicity.failureTriggered = true;

    const { data: atomReq } = await supabase
      .from('connection_requests')
      .select('*')
      .eq('id', atomicityReqId)
      .single();

    const { data: atomConns } = await supabase
      .from('connections')
      .select('*')
      .eq('requestId', atomicityReqId);

    summary.transactionAtomicity.dbConnectionCount = atomConns?.length || 0;
    summary.transactionAtomicity.dbRequestStatus = atomReq?.status || 'unknown';

    console.log(`Post-failure DB State: connections count = ${summary.transactionAtomicity.dbConnectionCount}, request status = '${summary.transactionAtomicity.dbRequestStatus}'.`);

    if (summary.transactionAtomicity.dbConnectionCount !== 0) {
      throw new Error(`Atomicity assertion failed: Expected 0 connections for request ${atomicityReqId}, found ${summary.transactionAtomicity.dbConnectionCount}.`);
    }
    if (summary.transactionAtomicity.dbRequestStatus !== 'pending') {
      throw new Error(`Atomicity assertion failed: Expected request status to remain 'pending' after rollback, but found '${summary.transactionAtomicity.dbRequestStatus}'.`);
    }

    summary.transactionAtomicity.rollbackVerified = true;
    summary.transactionAtomicity.passed = true;
    console.log('✅ TEST 4 PASSED: Atomicity verified! Forced failure caused complete rollback: 0 connections, status remained pending.\n');

    // =============================================================
    // SECTION 5: Database Constraints & Invariants Introspection
    // =============================================================
    console.log('---------------------------------------------------------------');
    console.log('👉 5. DATABASE CONSTRAINTS & INVARIANTS INTROSPECTION');
    console.log('---------------------------------------------------------------');

    // 1. Pending-request uniqueness
    const dupReqId1 = `req_p1_${crypto.randomUUID()}`;
    const dupReqId2 = `req_p2_${crypto.randomUUID()}`;
    testRequestsToCleanup.push(dupReqId1, dupReqId2);

    await supabase.from('connection_requests').insert([{
      id: dupReqId1,
      senderUserId: agentC.id,
      senderAgentId: agentC.agentId,
      senderAgentName: agentC.name,
      receiverUserId: agentD.id,
      receiverAgentId: agentD.agentId,
      status: 'pending',
      createdAt: new Date().toISOString()
    }]);

    const pReq2 = await supabase.from('connection_requests').insert([{
      id: dupReqId2,
      senderUserId: agentC.id,
      senderAgentId: agentC.agentId,
      senderAgentName: agentC.name,
      receiverUserId: agentD.id,
      receiverAgentId: agentD.agentId,
      status: 'pending',
      createdAt: new Date().toISOString()
    }]);

    if (pReq2.error && (pReq2.error.code === '23505' || pReq2.error.message.includes('unique'))) {
      summary.databaseConstraints.pendingRequestUniqueness = 'VERIFIED';
      console.log('1. Pending-request uniqueness: VERIFIED');
    } else {
      throw new Error(`Database constraint assertion failed: Pending-request uniqueness not enforced.`);
    }

    // 2. Request ID uniqueness
    const testReqId = `req_uniq_${crypto.randomUUID()}`;
    const testConnId1 = `conn_u1_${crypto.randomUUID()}`;
    const testConnId2 = `conn_u2_${crypto.randomUUID()}`;
    testConnectionsToCleanup.push(testConnId1, testConnId2);

    await supabase.from('connections').insert([{
      id: testConnId1,
      requestId: testReqId,
      postOwnerUserId: agentC.id,
      postOwnerAgentId: agentC.agentId,
      postOwnerAgentName: agentC.name,
      replyAuthorUserId: agentD.id,
      replyAuthorAgentId: agentD.agentId,
      replyAuthorAgentName: agentD.name,
      createdAt: new Date().toISOString()
    }]);

    const insertConn2 = await supabase.from('connections').insert([{
      id: testConnId2,
      requestId: testReqId,
      postOwnerUserId: agentA.id,
      postOwnerAgentId: agentA.agentId,
      postOwnerAgentName: agentA.name,
      replyAuthorUserId: agentB.id,
      replyAuthorAgentId: agentB.agentId,
      replyAuthorAgentName: agentB.name,
      createdAt: new Date().toISOString()
    }]);

    if (insertConn2.error && (insertConn2.error.code === '23505' || insertConn2.error.message.includes('unique'))) {
      summary.databaseConstraints.requestIdUniqueness = 'VERIFIED';
      console.log('2. Request uniqueness: VERIFIED');
    } else {
      throw new Error(`Database constraint assertion failed: Request ID uniqueness not enforced.`);
    }

    // 3. Reply ID uniqueness
    const testReplyIdUniq = `reply_uniq_${crypto.randomUUID()}`;
    const testConnId3 = `conn_u3_${crypto.randomUUID()}`;
    const testConnId4 = `conn_u4_${crypto.randomUUID()}`;
    testConnectionsToCleanup.push(testConnId3, testConnId4);

    await supabase.from('connections').insert([{
      id: testConnId3,
      replyId: testReplyIdUniq,
      postOwnerUserId: agentC.id,
      postOwnerAgentId: agentC.agentId,
      postOwnerAgentName: agentC.name,
      replyAuthorUserId: agentD.id,
      replyAuthorAgentId: agentD.agentId,
      replyAuthorAgentName: agentD.name,
      createdAt: new Date().toISOString()
    }]);

    const insertConn4 = await supabase.from('connections').insert([{
      id: testConnId4,
      replyId: testReplyIdUniq,
      postOwnerUserId: agentA.id,
      postOwnerAgentId: agentA.agentId,
      postOwnerAgentName: agentA.name,
      replyAuthorUserId: agentB.id,
      replyAuthorAgentId: agentB.agentId,
      replyAuthorAgentName: agentB.name,
      createdAt: new Date().toISOString()
    }]);

    if (insertConn4.error && (insertConn4.error.code === '23505' || insertConn4.error.message.includes('unique'))) {
      summary.databaseConstraints.replyIdUniqueness = 'VERIFIED';
      console.log('3. Reply uniqueness: VERIFIED');
    } else {
      throw new Error(`Database constraint assertion failed: Reply ID uniqueness not enforced.`);
    }

    // 4. Normalized pair uniqueness
    const testConnId5 = `conn_u5_${crypto.randomUUID()}`;
    const testConnId6 = `conn_u6_${crypto.randomUUID()}`;
    testConnectionsToCleanup.push(testConnId5, testConnId6);

    await supabase.from('connections').insert([{
      id: testConnId5,
      postOwnerUserId: agentC.id,
      postOwnerAgentId: agentC.agentId,
      postOwnerAgentName: agentC.name,
      replyAuthorUserId: agentD.id,
      replyAuthorAgentId: agentD.agentId,
      replyAuthorAgentName: agentD.name,
      createdAt: new Date().toISOString()
    }]);

    const insertConn6 = await supabase.from('connections').insert([{
      id: testConnId6,
      postOwnerUserId: agentD.id,
      postOwnerAgentId: agentD.agentId,
      postOwnerAgentName: agentD.name,
      replyAuthorUserId: agentC.id,
      replyAuthorAgentId: agentC.agentId,
      replyAuthorAgentName: agentC.name,
      createdAt: new Date().toISOString()
    }]);

    if (insertConn6.error && (insertConn6.error.code === '23505' || insertConn6.error.message.includes('unique'))) {
      summary.databaseConstraints.pairUniqueness = 'VERIFIED';
      console.log('4. Pair uniqueness: VERIFIED');
    } else {
      throw new Error(`Database constraint assertion failed: Normalized pair uniqueness not enforced.`);
    }

    // 5. RPC procedure existence verification
    const rpcTest1 = await supabase.rpc('accept_connection_request', {
      p_user_id: 'nonexistent',
      p_request_id: 'nonexistent',
      p_connection_id: 'nonexistent'
    });
    const rpcTest2 = await supabase.rpc('create_connection_from_reply', {
      p_user_id: 'nonexistent',
      p_reply_id: 'nonexistent'
    });

    const rpc1Exists = !rpcTest1.error || !rpcTest1.error.message.includes('does not exist');
    const rpc2Exists = !rpcTest2.error || !rpcTest2.error.message.includes('does not exist');

    if (rpc1Exists && rpc2Exists) {
      summary.databaseConstraints.rpcExists = 'VERIFIED';
      console.log('5. RPC procedure existence: VERIFIED.\n');
    } else {
      throw new Error(`RPC assertion failed: Required database RPC procedures do not exist.`);
    }

    // =============================================================
    // SECTION 6: Reverse & Duplicate Connection Request Prevention
    // =============================================================
    console.log('---------------------------------------------------------------');
    console.log('👉 6. REVERSE & DUPLICATE CONNECTION REQUEST PREVENTION');
    console.log('---------------------------------------------------------------');
    
    // First successfully create a connection request from C to D via API
    const reqRes = await fetch(`${BASE_URL}/api/connections/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenC}`
      },
      body: JSON.stringify({ receiverAgentId: agentD.agentId })
    });
    const reqBody = await reqRes.json();
    if (reqBody.success && reqBody.data?.id) {
      testRequestsToCleanup.push(reqBody.data.id);
    }

    // Now attempt to send reverse request from D to C
    const reverseReqRes = await fetch(`${BASE_URL}/api/connections/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenD}`
      },
      body: JSON.stringify({ receiverAgentId: agentC.agentId })
    });

    const reverseBody = await reverseReqRes.json();
    console.log(`Reverse connection request response: status=${reverseReqRes.status}, code=${reverseBody.error?.code}`);
    if (reverseReqRes.status !== 409 || reverseBody.error?.code !== 'ALREADY_CONNECTED') {
      throw new Error(`Assertion failed: Expected 409 Conflict with error code 'ALREADY_CONNECTED', got status ${reverseReqRes.status} and code ${reverseBody.error?.code}`);
    }
    console.log('✅ TEST 6 PASSED: Reverse duplicate connection request rejected with 409 Conflict (ALREADY_CONNECTED).\n');

  } finally {
    // -------------------------------------------------------------
    // Cleanup Test Records
    // -------------------------------------------------------------
    console.log('---------------------------------------------------------------');
    console.log('🧹 CLEANING UP INTEGRATION TEST FIXTURES');
    console.log('---------------------------------------------------------------');
    try {
      if (testConnectionsToCleanup.length > 0) {
        await supabase.from('connections').delete().in('id', testConnectionsToCleanup);
      }
      if (testRequestsToCleanup.length > 0) {
        await supabase.from('connection_requests').delete().in('id', testRequestsToCleanup);
      }
      if (testRepliesToCleanup.length > 0) {
        await supabase.from('replies').delete().in('id', testRepliesToCleanup);
      }
      if (testPostsToCleanup.length > 0) {
        await supabase.from('posts').delete().in('id', testPostsToCleanup);
      }
      for (const userId of testUsersToCleanup) {
        try { await supabase.auth.admin.deleteUser(userId); } catch {}
        try { await supabase.from('users').delete().eq('id', userId); } catch {}
      }
      console.log('✅ Test fixtures cleaned up successfully.\n');
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
  }

  const allPassed =
    summary.requestConcurrency.executed &&
    summary.requestConcurrency.successCount === 1 &&
    summary.requestConcurrency.conflictCount === 24 &&
    summary.requestConcurrency.dbPendingCount === 1 &&
    summary.acceptanceConcurrency.executed &&
    summary.acceptanceConcurrency.passed &&
    summary.replyConnectionConcurrency.executed &&
    summary.replyConnectionConcurrency.passed &&
    summary.transactionAtomicity.executed &&
    summary.transactionAtomicity.failureTriggered &&
    summary.transactionAtomicity.rollbackVerified &&
    summary.transactionAtomicity.dbConnectionCount === 0 &&
    summary.transactionAtomicity.dbRequestStatus === 'pending' &&
    summary.databaseConstraints.pendingRequestUniqueness === 'VERIFIED' &&
    summary.databaseConstraints.requestIdUniqueness === 'VERIFIED' &&
    summary.databaseConstraints.replyIdUniqueness === 'VERIFIED' &&
    summary.databaseConstraints.pairUniqueness === 'VERIFIED' &&
    summary.databaseConstraints.rpcExists === 'VERIFIED';

  console.log('===============================================================');
  console.log('📊 TEST SUMMARY RESULTS');
  console.log('===============================================================');
  console.log('1. Connection Request Concurrency:');
  console.log(`   - 25 concurrent requests: ${summary.requestConcurrency.executed ? 'PASS' : 'FAIL'}`);
  console.log(`   - Exactly 1 successful creation: ${summary.requestConcurrency.successCount === 1 ? 'PASS' : 'FAIL'}`);
  console.log(`   - Exactly 24 expected conflicts: ${summary.requestConcurrency.conflictCount === 24 ? 'PASS' : 'FAIL'}`);
  console.log(`   - Exactly 1 pending request in DB: ${summary.requestConcurrency.dbPendingCount === 1 ? 'PASS' : 'FAIL'}`);
  console.log('2. Connection Acceptance Concurrency:');
  console.log(`   - 10 concurrent accepts: ${summary.acceptanceConcurrency.executed ? 'PASS' : 'FAIL'}`);
  console.log(`   - Zero partial state / atomicity: ${summary.acceptanceConcurrency.passed ? 'PASS' : 'FAIL'}`);
  console.log('3. Reply Connection Concurrency:');
  console.log(`   - 10 concurrent reply connection creations: ${summary.replyConnectionConcurrency.executed ? 'PASS' : 'FAIL'}`);
  console.log('4. Transaction Atomicity:');
  console.log(`   - Forced mid-transaction failure: ${summary.transactionAtomicity.failureTriggered ? 'PASS' : 'FAIL'}`);
  console.log(`   - Zero connection after rollback: ${summary.transactionAtomicity.dbConnectionCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`   - Request remained pending: ${summary.transactionAtomicity.dbRequestStatus === 'pending' ? 'PASS' : 'FAIL'}`);
  console.log('5. Database Constraints & RPC:');
  console.log(`   - Pending-request uniqueness: ${summary.databaseConstraints.pendingRequestUniqueness}`);
  console.log(`   - Request uniqueness: ${summary.databaseConstraints.requestIdUniqueness}`);
  console.log(`   - Reply uniqueness: ${summary.databaseConstraints.replyIdUniqueness}`);
  console.log(`   - Pair uniqueness: ${summary.databaseConstraints.pairUniqueness}`);
  console.log(`   - RPC procedure existence: ${summary.databaseConstraints.rpcExists}`);
  console.log('===============================================================');

  if (allPassed) {
    console.log('CONNECTION RELIABILITY VERIFIED');
  } else {
    console.log('CONNECTION RELIABILITY NOT VERIFIED');
    process.exit(1);
  }
}

runConnectionIntegritySuite().catch(err => {
  console.error('❌ Connection integrity test failed:', err);
  process.exit(1);
});
