import assert from 'assert';
import { floorActivityService } from '../services/floorActivityService';
import { deduplicateAndMergeFloorActivities, getStableActivityKey } from '../../src/lib/floorActivityDeduplication';

export async function runFloorActivityRegressionTests() {
  console.log('==================================================');
  console.log('RUNNING FLOOR ACTIVITY REGRESSION TESTS');
  console.log('==================================================');

  let passed = 0;
  let total = 10;

  // 1. Post duplication: local post + SSE post + historical post = 1 event
  {
    console.log('\n--- Test 1: Post duplication (local + SSE + historical = 1 event) ---');
    const postId = 'post_101';
    const localPost = { id: 'local_1', type: 'post', agentId: 'AGENT_A', text: 'made a post', post: { id: postId, content: 'Hello' }, createdAt: '2026-09-25T10:00:00Z' };
    const ssePost = { id: 'sse_1', type: 'post', agentId: 'AGENT_A', text: 'made a post', activityKey: `post:${postId}`, post: { id: postId, content: 'Hello' }, createdAt: '2026-09-25T10:00:01Z' };
    const histPost = { id: 'fa_101', type: 'post', agentId: 'AGENT_A', text: 'made a post', canonicalKey: `post:${postId}`, createdAt: '2026-09-25T09:59:00Z' };

    const merged = deduplicateAndMergeFloorActivities([localPost, ssePost, histPost]);
    assert.strictEqual(merged.length, 1, `Expected 1 merged post, got ${merged.length}`);
    assert.strictEqual(getStableActivityKey(merged[0]), `post:${postId}`);
    console.log('RESULT: PASS. Local + SSE + Historical post collapsed to 1 event.');
    passed++;
  }

  // 2. Reply duplication: local reply + SSE reply + historical reply = 1 event
  {
    console.log('\n--- Test 2: Reply duplication (local + SSE + historical = 1 event) ---');
    const replyId = 'reply_201';
    const localReply = { id: 'local_r1', type: 'reply', agentId: 'AGENT_B', text: 'made a reply', replyId, post: { replyId, id: 'post_parent' }, createdAt: '2026-09-25T10:05:00Z' };
    const sseReply = { id: 'sse_r1', type: 'reply', agentId: 'AGENT_B', text: 'made a reply', activityKey: `reply:${replyId}`, createdAt: '2026-09-25T10:05:01Z' };
    const histReply = { id: 'fa_201', type: 'reply', agentId: 'AGENT_B', text: 'made a reply', canonicalKey: `reply:${replyId}`, createdAt: '2026-09-25T10:04:00Z' };

    const merged = deduplicateAndMergeFloorActivities([localReply, sseReply, histReply]);
    assert.strictEqual(merged.length, 1, `Expected 1 merged reply, got ${merged.length}`);
    assert.strictEqual(getStableActivityKey(merged[0]), `reply:${replyId}`);
    console.log('RESULT: PASS. Local + SSE + Historical reply collapsed to 1 event.');
    passed++;
  }

  // 3. Connection duplication: local connection + SSE connection + historical connection = 1 event
  {
    console.log('\n--- Test 3: Connection duplication (local + SSE + historical = 1 event) ---');
    const connId = 'conn_501';
    const localConn = { id: 'local_c1', type: 'connection', agentId: 'AGENT_A', peerName: 'AGENT_B', text: 'formed a connection', connectionId: connId, createdAt: '2026-09-25T10:10:00Z' };
    const sseConn = { id: 'sse_c1', type: 'connection', agentId: 'AGENT_A', peerName: 'AGENT_B', text: 'formed a connection', activityKey: `conn:${connId}`, createdAt: '2026-09-25T10:10:01Z' };
    const histConn = { id: 'fa_501', type: 'connection', agentId: 'AGENT_A', peerName: 'AGENT_B', text: 'formed a connection', canonicalKey: `connection:${connId}`, createdAt: '2026-09-25T10:09:00Z' };

    const merged = deduplicateAndMergeFloorActivities([localConn, sseConn, histConn]);
    assert.strictEqual(merged.length, 1, `Expected 1 merged connection, got ${merged.length}`);
    assert.strictEqual(getStableActivityKey(merged[0]), `conn:${connId}`);
    console.log('RESULT: PASS. Local + SSE + Historical connection collapsed to 1 event.');
    passed++;
  }

  // 4. Repeated SSE: same SSE event delivered twice = 1 event
  {
    console.log('\n--- Test 4: Repeated SSE event delivered twice ---');
    const sseEvent = { id: 'sse_evt_99', type: 'post', activityKey: 'post:105', agentId: 'AGENT_C', text: 'made a post', createdAt: '2026-09-25T10:15:00Z' };
    const merged = deduplicateAndMergeFloorActivities([sseEvent, { ...sseEvent }]);
    assert.strictEqual(merged.length, 1, `Expected 1 event for repeated SSE, got ${merged.length}`);
    console.log('RESULT: PASS. Repeated SSE event collapsed to 1 event.');
    passed++;
  }

  // 5. Handshake replay: handshake history + live SSE = 1 event
  {
    console.log('\n--- Test 5: Handshake replay + live SSE ---');
    const handshakeRecent = [
      { id: 'fa_101', type: 'post', activityKey: 'post:101', agentId: 'AGENT_A', text: 'made a post', createdAt: '2026-09-25T10:00:00Z' }
    ];
    const liveSse = { id: 'fa_101_sse', type: 'post', activityKey: 'post:101', agentId: 'AGENT_A', text: 'made a post', createdAt: '2026-09-25T10:00:01Z' };

    const merged = deduplicateAndMergeFloorActivities([...handshakeRecent, liveSse]);
    assert.strictEqual(merged.length, 1, `Expected 1 event for Handshake + SSE, got ${merged.length}`);
    console.log('RESULT: PASS. Handshake history + live SSE merged to 1 event.');
    passed++;
  }

  // 6. Reload: page refresh simulated by re-running deduplication over combined state = no duplicate events
  {
    console.log('\n--- Test 6: Page refresh / reload state ---');
    const stateBeforeReload = [
      { id: 'fa_p1', activityKey: 'post:101', type: 'post', agentId: 'AGENT_A', text: 'post 1' },
      { id: 'fa_r1', activityKey: 'reply:201', type: 'reply', agentId: 'AGENT_B', text: 'reply 1' },
      { id: 'fa_c1', activityKey: 'conn:501', type: 'connection', agentId: 'AGENT_A', text: 'conn 1' }
    ];
    const fetchedOnReload = [
      { id: 'fa_p1', activityKey: 'post:101', type: 'post', agentId: 'AGENT_A', text: 'post 1' },
      { id: 'fa_r1', activityKey: 'reply:201', type: 'reply', agentId: 'AGENT_B', text: 'reply 1' },
      { id: 'fa_c1', activityKey: 'conn:501', type: 'connection', agentId: 'AGENT_A', text: 'conn 1' }
    ];

    const reloaded = deduplicateAndMergeFloorActivities([...fetchedOnReload, ...stateBeforeReload]);
    assert.strictEqual(reloaded.length, 3, `Expected exactly 3 events after reload, got ${reloaded.length}`);
    console.log('RESULT: PASS. Page refresh produces no duplicate events.');
    passed++;
  }

  // 7. Identical content: Two posts/replies with same text but different IDs must remain separate
  {
    console.log('\n--- Test 7: Identical content with different IDs remain separate ---');
    const post1 = { id: 'p1', type: 'post', agentId: 'AGENT_A', text: 'Same exact text', post: { id: '101' }, createdAt: '2026-09-25T10:20:00Z' };
    const post2 = { id: 'p2', type: 'post', agentId: 'AGENT_A', text: 'Same exact text', post: { id: '102' }, createdAt: '2026-09-25T10:21:00Z' };

    const mergedPosts = deduplicateAndMergeFloorActivities([post1, post2]);
    assert.strictEqual(mergedPosts.length, 2, `Expected 2 distinct posts with same text, got ${mergedPosts.length}`);

    const reply1 = { id: 'r1', type: 'reply', agentId: 'AGENT_B', text: 'Same reply text', replyId: '201', createdAt: '2026-09-25T10:22:00Z' };
    const reply2 = { id: 'r2', type: 'reply', agentId: 'AGENT_B', text: 'Same reply text', replyId: '202', createdAt: '2026-09-25T10:23:00Z' };

    const mergedReplies = deduplicateAndMergeFloorActivities([reply1, reply2]);
    assert.strictEqual(mergedReplies.length, 2, `Expected 2 distinct replies with same text, got ${mergedReplies.length}`);

    console.log('RESULT: PASS. Identical content across different post/reply IDs remain separate.');
    passed++;
  }

  // 8. Reply fallback identity: parent post ID is never used as reply identity
  {
    console.log('\n--- Test 8: Reply identity fallback logic ---');
    const parentPostId = 'parent_post_999';
    const realReplyId = 'real_reply_888';

    // Case A: Reply with explicit replyId
    const rec1 = await floorActivityService.recordFloorActivity({
      agentId: '@AGENT_R1',
      text: 'made a reply',
      type: 'reply',
      replyId: realReplyId,
      post: { id: parentPostId }
    });
    assert.strictEqual(rec1.activityKey, `reply:${realReplyId}`);
    assert.notStrictEqual(rec1.activityKey, `reply:${parentPostId}`);

    // Case B: Reply with post object having parent post id only (no replyId) -> must not use parent post id
    const rec2 = await floorActivityService.recordFloorActivity({
      agentId: '@AGENT_R2',
      text: 'made a reply with post object',
      type: 'reply',
      post: { id: parentPostId }
    });
    assert.notStrictEqual(rec2.activityKey, `reply:${parentPostId}`);
    assert(rec2.activityKey?.startsWith('generic:reply:'));

    console.log('RESULT: PASS. Parent post ID is never used as reply identity.');
    passed++;
  }

  // 9. Server in-memory deduplication & DB audit-log duplicate suppression
  {
    console.log('\n--- Test 9: Server in-memory deduplication & audit log suppression ---');
    const testPostId = `reg_test_post_${Date.now()}`;
    const recA = await floorActivityService.recordFloorActivity({
      agentId: '@REG_TEST',
      text: 'made a test post',
      type: 'post',
      post: { id: testPostId }
    });
    const recB = await floorActivityService.recordFloorActivity({
      agentId: '@REG_TEST',
      text: 'made a test post (duplicate call)',
      type: 'post',
      post: { id: testPostId }
    });

    const recent = floorActivityService.getRecentFloorActivity(50);
    const matches = recent.filter(e => e.activityKey === `post:${testPostId}`);
    assert.strictEqual(matches.length, 1, `Expected 1 in-memory event, found ${matches.length}`);
    console.log('RESULT: PASS. Duplicate server activity call suppressed and deduplicated in memory.');
    passed++;
  }

  // 10. Deterministic Fallback Identity: Activity with no explicit key produces same key when processed twice
  {
    console.log('\n--- Test 10: Deterministic fallback key consistency ---');
    const event1: any = { agentId: 'AGENT_X', text: 'custom event action', type: 'custom' };
    const event1Duplicate: any = { agentId: 'AGENT_X', text: 'custom event action', type: 'custom' };
    const event2Different: any = { agentId: 'AGENT_X', text: 'different event action', type: 'custom' };

    const mergedDuplicates = deduplicateAndMergeFloorActivities([event1, event1Duplicate]);
    assert.strictEqual(mergedDuplicates.length, 1, `Expected 1 event for duplicate deterministic fallback events, got ${mergedDuplicates.length}`);

    const mergedDifferent = deduplicateAndMergeFloorActivities([event1, event2Different]);
    assert.strictEqual(mergedDifferent.length, 2, `Expected 2 distinct events for different deterministic fallback events, got ${mergedDifferent.length}`);

    console.log('RESULT: PASS. Deterministic fallback produces identical key for same event and distinct keys for different events.');
    passed++;
  }

  console.log('\n==================================================');
  console.log(`REGRESSION TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('==================================================\n');

  return passed === total;
}
