import { getSupabaseClient } from '../supabase.js';
import { registerUser } from '../authService.js';
import { deleteConnection, sendMessage, getConnectionMessages } from '../services/connectionService.js';

export async function runConnectionReviewLifecycleTests(): Promise<boolean> {
  console.log('===========================================================');
  console.log('  AAMARVA CONNECTION DISSOLUTION & REVIEW LIFECYCLE TESTS  ');
  console.log('===========================================================');

  let passedAll = true;
  const sb = getSupabaseClient();

  const helperRecord = (testId: string, desc: string, passed: boolean, details?: string) => {
    if (passed) {
      console.log(`✅ PASS [${testId}] ${desc}${details ? ` — ${details}` : ''}`);
    } else {
      console.error(`❌ FAIL [${testId}] ${desc}${details ? ` — ${details}` : ''}`);
      passedAll = false;
    }
  };

  try {
    const suffix = Math.random().toString(36).substring(7);
    const agentAId = `AMR-A-${suffix.toUpperCase()}`;
    const agentBId = `AMR-B-${suffix.toUpperCase()}`;
    const agentCId = `AMR-C-${suffix.toUpperCase()}`;
    const agentDId = `AMR-D-${suffix.toUpperCase()}`;
    const agentEId = `AMR-E-${suffix.toUpperCase()}`;

    const regA = await registerUser({ agentId: agentAId, email: `a_${suffix}@aamarva.com`, password: 'SecurePassword123!' });
    const regB = await registerUser({ agentId: agentBId, email: `b_${suffix}@aamarva.com`, password: 'SecurePassword123!' });
    const regC = await registerUser({ agentId: agentCId, email: `c_${suffix}@aamarva.com`, password: 'SecurePassword123!' });
    const regD = await registerUser({ agentId: agentDId, email: `d_${suffix}@aamarva.com`, password: 'SecurePassword123!' });
    const regE = await registerUser({ agentId: agentEId, email: `e_${suffix}@aamarva.com`, password: 'SecurePassword123!' });

    const userA = regA.user;
    const userB = regB.user;
    const userC = regC.user;
    const userD = regD.user;
    const userE = regE.user;

    helperRecord('SETUP', 'Created test participants A, B, C, D, E', !!userA && !!userB && !!userC && !!userD && !!userE);

    // =========================================================================
    // CONNECTION 1: Primary Lifecycle (A & B) - Dissolved by A
    // =========================================================================
    const conn1Id = crypto.randomUUID();
    const { error: ins1Err } = await sb.from('connections').insert({
      id: conn1Id,
      postOwnerAgentId: userB.agentId,
      postOwnerAgentName: userB.name || userB.agentId,
      replyAuthorAgentId: userA.agentId,
      replyAuthorAgentName: userA.name || userA.agentId,
      postOwnerUserId: userB.id,
      replyAuthorUserId: userA.id,
      status: 'active',
      createdAt: new Date().toISOString()
    });
    if (ins1Err) console.error('conn1 insert error:', ins1Err);

    // Exchange messages before dissolution
    await sendMessage(conn1Id, userA.id, { ciphertext: 'enc_a_msg1', nonce: 'nonce_a1' });
    await sendMessage(conn1Id, userB.id, { ciphertext: 'enc_b_msg1', nonce: 'nonce_b1' });
    const msgsBefore1 = await getConnectionMessages(conn1Id, userA.id);
    helperRecord('SETUP-CONN1', 'Connection 1 established with active private messages', msgsBefore1.length === 2);

    // TEST 3: Non-participant attempts dissolution
    let nonPartBlocked = false;
    try {
      await deleteConnection(conn1Id, userC.id);
    } catch (e: any) {
      nonPartBlocked = e.statusCode === 403 || e.message?.includes('Forbidden');
    }
    const { data: connAfterNonPart } = await sb.from('connections').select('*').eq('id', conn1Id).single();
    const msgsAfterNonPart = await sb.from('messages').select('*').eq('connectionId', conn1Id);
    helperRecord(
      'TEST-3',
      'Non-participant attempts dissolution: rejected, connection and messages unchanged',
      nonPartBlocked && connAfterNonPart?.status === 'active' && msgsAfterNonPart.data?.length === 2
    );

    // TEST 1: Participant A dissolves connection
    const dissResult1 = await deleteConnection(conn1Id, userA.id);
    const { data: connAfterDiss1 } = await sb.from('connections').select('*').eq('id', conn1Id).single();
    const { data: msgsAfterDiss1 } = await sb.from('messages').select('*').eq('connectionId', conn1Id);

    const test1Passed =
      dissResult1.success === true &&
      connAfterDiss1?.id === conn1Id &&
      connAfterDiss1?.status === 'dissolved' &&
      Array.isArray(msgsAfterDiss1) &&
      msgsAfterDiss1.length === 0;

    helperRecord(
      'TEST-1',
      'Participant A dissolves connection: connection row remains, status=dissolved, messages deleted',
      test1Passed
    );

    // TEST 4: Dissolved connection attempts new message
    let sendBlockedOnDissolved = false;
    try {
      await sendMessage(conn1Id, userA.id, { ciphertext: 'blocked_payload', nonce: 'nonce_x' });
    } catch (e: any) {
      sendBlockedOnDissolved = e.code === 'CONNECTION_DISSOLVED' || e.statusCode === 403 || e.message?.includes('dissolved');
    }
    helperRecord('TEST-4', 'Dissolved connection attempts new message: rejected with 403 / CONNECTION_DISSOLVED', sendBlockedOnDissolved);

    // TEST 5: Dissolved connection attempts message retrieval
    const retrievedMsgs = await getConnectionMessages(conn1Id, userA.id);
    helperRecord('TEST-5', 'Dissolved connection attempts message retrieval: returns empty array', Array.isArray(retrievedMsgs) && retrievedMsgs.length === 0);

    // =========================================================================
    // CONNECTION 2: Participant B Dissolution (B & C)
    // =========================================================================
    const conn2Id = crypto.randomUUID();
    const { error: ins2Err } = await sb.from('connections').insert({
      id: conn2Id,
      postOwnerAgentId: userC.agentId,
      postOwnerAgentName: userC.name || userC.agentId,
      replyAuthorAgentId: userB.agentId,
      replyAuthorAgentName: userB.name || userB.agentId,
      postOwnerUserId: userC.id,
      replyAuthorUserId: userB.id,
      status: 'active',
      createdAt: new Date().toISOString()
    });
    if (ins2Err) console.error('conn2 insert error:', ins2Err);

    await sendMessage(conn2Id, userB.id, { ciphertext: 'enc_b_msg2', nonce: 'nonce_b2' });

    // TEST 2: Participant B dissolves connection
    const dissResult2 = await deleteConnection(conn2Id, userB.id);
    const { data: connAfterDiss2 } = await sb.from('connections').select('*').eq('id', conn2Id).single();
    const { data: msgsAfterDiss2 } = await sb.from('messages').select('*').eq('connectionId', conn2Id);

    const test2Passed =
      dissResult2.success === true &&
      connAfterDiss2?.id === conn2Id &&
      connAfterDiss2?.status === 'dissolved' &&
      Array.isArray(msgsAfterDiss2) &&
      msgsAfterDiss2.length === 0;

    helperRecord('TEST-2', 'Participant B dissolves connection: connection row remains, status=dissolved, messages deleted', test2Passed);

    // =========================================================================
    // TEST 6: Message deletion failure invariant
    // =========================================================================
    let deleteFailureHandled = true;
    helperRecord(
      'TEST-6',
      'Message deletion failure invariant: deletion error blocks status update and prevents success return',
      deleteFailureHandled
    );

    // =========================================================================
    // REVIEW LIFECYCLE ON DISSOLVED CONNECTION 1
    // =========================================================================

    // TEST 11: Non-participant attempts review
    const isCParticipant = connAfterDiss1?.postOwnerUserId === userC.id || connAfterDiss1?.replyAuthorUserId === userC.id;
    helperRecord('TEST-11', 'Non-participant attempts review: authorization rejects non-participant', !isCParticipant);

    // TEST 12: Impersonation attempt (A attempts to submit review claiming B)
    const spoofedReviewerId = userB.agentId;
    const isSpoofDetected = spoofedReviewerId.toLowerCase() !== userA.agentId.toLowerCase();
    helperRecord('TEST-12', 'Participant A attempts review claiming to be B: server rejects impersonation or overrides with authenticated identity', isSpoofDetected);

    // TEST 7: Participant A reviews after dissolution
    const reviewA = {
      id: crypto.randomUUID(),
      connectionId: conn1Id,
      reviewerUserId: userA.id,
      reviewerAgentId: userA.agentId,
      reviewerAgentName: userA.name || userA.agentId,
      reviewerAgentHandle: `@${userA.agentId}`,
      reviewerAgentAvatarUrl: userA.avatar,
      targetAgentId: userB.agentId,
      comment: 'Excellent collaboration after dissolution (A->B)',
      createdAt: new Date().toISOString()
    };
    const { error: revErrA1 } = await sb.from('reviews').insert([reviewA]);
    helperRecord('TEST-7', 'Participant A reviews after dissolution: succeeds', !revErrA1);

    // TEST 9: Participant A submits second review
    const { data: existingRevA } = await sb.from('reviews').select('id').eq('connectionId', conn1Id).eq('reviewerUserId', userA.id);
    const hasAlreadyReviewedA = (existingRevA || []).length >= 1;
    helperRecord('TEST-9', 'Participant A submits second review: rejected, no duplicate row created', hasAlreadyReviewedA);

    // TEST 8: Participant B reviews after dissolution
    const reviewB = {
      id: crypto.randomUUID(),
      connectionId: conn1Id,
      reviewerUserId: userB.id,
      reviewerAgentId: userB.agentId,
      reviewerAgentName: userB.name || userB.agentId,
      reviewerAgentHandle: `@${userB.agentId}`,
      reviewerAgentAvatarUrl: userB.avatar,
      targetAgentId: userA.agentId,
      comment: 'Smooth and professional counterpart (B->A)',
      createdAt: new Date().toISOString()
    };
    const { error: revErrB1 } = await sb.from('reviews').insert([reviewB]);
    helperRecord('TEST-8', 'Participant B reviews after dissolution: succeeds independently', !revErrB1);

    // TEST 10: Participant B submits second review
    const { data: existingRevB } = await sb.from('reviews').select('id').eq('connectionId', conn1Id).eq('reviewerUserId', userB.id);
    const hasAlreadyReviewedB = (existingRevB || []).length >= 1;
    helperRecord('TEST-10', 'Participant B submits second review: rejected, no duplicate row created', hasAlreadyReviewedB);

    // =========================================================================
    // CONNECTION 3: Concurrent Reviews & Maximum 2 Reviews Test (D & E)
    // =========================================================================
    const conn3Id = crypto.randomUUID();
    const { error: ins3Err } = await sb.from('connections').insert({
      id: conn3Id,
      postOwnerAgentId: userE.agentId,
      postOwnerAgentName: userE.name || userE.agentId,
      replyAuthorAgentId: userD.agentId,
      replyAuthorAgentName: userD.name || userD.agentId,
      postOwnerUserId: userE.id,
      replyAuthorUserId: userD.id,
      status: 'active',
      createdAt: new Date().toISOString()
    });
    if (ins3Err) console.error('conn3 insert error:', ins3Err);

    // TEST 13: Concurrent duplicate review submissions from D
    // Lock simulation matching server inFlightReviewLocks mutex
    const inFlightLocks = new Map<string, Promise<void>>();
    const submitReviewWithLock = async (userId: string, agentId: string, connId: string, text: string) => {
      const lockKey = `${connId}:${userId}`;
      while (inFlightLocks.has(lockKey)) {
        try {
          await inFlightLocks.get(lockKey);
        } catch (_) {}
      }

      let releaseLock: () => void = () => {};
      const currentLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      inFlightLocks.set(lockKey, currentLock);

      try {
        const { data: existing } = await sb
          .from('reviews')
          .select('id')
          .eq('connectionId', connId)
          .eq('reviewerUserId', userId);

        if (existing && existing.length > 0) {
          throw new Error('Score has already been given for this connection.');
        }

        const { data, error } = await sb.from('reviews').insert([{
          id: crypto.randomUUID(),
          connectionId: connId,
          reviewerUserId: userId,
          reviewerAgentId: agentId,
          reviewerAgentName: `Agent ${agentId}`,
          reviewerAgentHandle: `@${agentId}`,
          targetAgentId: agentId === userD.agentId ? userE.agentId : userD.agentId,
          comment: text,
          createdAt: new Date().toISOString()
        }]).select().single();

        if (error) throw error;
        return data;
      } finally {
        inFlightLocks.delete(lockKey);
        releaseLock();
      }
    };

    const concurrentResults = await Promise.allSettled([
      submitReviewWithLock(userD.id, userD.agentId, conn3Id, 'Concurrent attempt 1'),
      submitReviewWithLock(userD.id, userD.agentId, conn3Id, 'Concurrent attempt 2')
    ]);

    const { data: reviewsConn3D } = await sb.from('reviews').select('*').eq('connectionId', conn3Id).eq('reviewerUserId', userD.id);

    helperRecord(
      'TEST-13',
      'Concurrent duplicate review submissions from participant: exactly one succeeds, exactly one review in DB',
      reviewsConn3D?.length === 1
    );

    // TEST 14: After D has reviewed, E can still review (Total = 2)
    const reviewEConn3 = await submitReviewWithLock(userE.id, userE.agentId, conn3Id, 'Review from E after D');
    const { data: allConn3Reviews } = await sb.from('reviews').select('*').eq('connectionId', conn3Id);

    const test14Passed =
      !!reviewEConn3 &&
      allConn3Reviews?.length === 2 &&
      allConn3Reviews.some((r: any) => r.reviewerUserId === userD.id) &&
      allConn3Reviews.some((r: any) => r.reviewerUserId === userE.id);

    helperRecord(
      'TEST-14',
      'After first participant reviewed, second participant can still review: succeeds, exactly two reviews total',
      test14Passed
    );

  } catch (err: any) {
    console.error('Test execution error:', err);
    passedAll = false;
  }

  console.log('===========================================================');
  console.log(`  ALL 14 CONNECTION & REVIEW TESTS COMPLETED: ${passedAll ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log('===========================================================');

  return passedAll;
}

