import { floorActivityService } from '../../server/services/floorActivityService.js';
import assert from 'assert';

async function runRuntimeTests() {
  console.log('--- RUNTIME FLOOR ACTIVITY DEDUPLICATION & CANONICAL TEST SUITE ---');

  // Reset or initialize service
  await floorActivityService.init();

  const postId = `post_${Date.now()}`;
  const replyId = `reply_${Date.now()}`;
  const connectionId = `conn_${Date.now()}`;

  // Test 1: Record a post event (Rich event)
  console.log('Test 1: Recording rich post event...');
  const ev1 = await floorActivityService.recordFloorActivity({
    agentId: '@AGENT_TEST_1',
    text: 'made a post on the floor',
    type: 'post',
    post: { id: postId, content: 'Test transmission content' }
  });

  assert(ev1.canonicalKey === `post:${postId}`, `Expected canonicalKey post:${postId}, got ${ev1.canonicalKey}`);
  console.log(`[PASS] Recorded post with canonicalKey: ${ev1.canonicalKey}`);

  // Test 2: Simulate historical generic event arriving with same canonicalKey
  console.log('Test 2: Simulating historical generic event arrival...');
  await floorActivityService.recordFloorActivity({
    agentId: '@AGENT_TEST_1',
    text: 'made a post on the floor',
    type: 'post',
    canonicalKey: `post:${postId}`
  });

  const recent = floorActivityService.getRecentFloorActivity(20);
  const matchingPosts = recent.filter(e => e.canonicalKey === `post:${postId}`);
  
  assert.strictEqual(matchingPosts.length, 1, `Expected exactly 1 entry for post:${postId}, found ${matchingPosts.length}`);
  assert(matchingPosts[0].post !== undefined, 'Expected surviving post to retain rich metadata object');
  console.log('[PASS] Historical duplicate collapsed into 1 enriched entry successfully.');

  // Test 3: Test Reply canonical key & deduplication
  console.log('Test 3: Testing reply canonical key & deduplication...');
  await floorActivityService.recordFloorActivity({
    agentId: '@AGENT_TEST_2',
    text: 'made a reply',
    type: 'reply',
    post: { id: replyId }
  });
  await floorActivityService.recordFloorActivity({
    agentId: '@AGENT_TEST_2',
    text: 'made a reply (duplicate)',
    type: 'reply',
    canonicalKey: `reply:${replyId}`
  });

  const matchingReplies = floorActivityService.getRecentFloorActivity(20).filter(e => e.canonicalKey === `reply:${replyId}`);
  assert.strictEqual(matchingReplies.length, 1, `Expected 1 entry for reply:${replyId}, found ${matchingReplies.length}`);
  console.log('[PASS] Reply deduplication verified.');

  // Test 4: Test Connection canonical key & deduplication
  console.log('Test 4: Testing connection canonical key & deduplication...');
  await floorActivityService.recordFloorActivity({
    agentId: '@AGENT_TEST_1',
    peerName: 'AGENT_TEST_2',
    text: 'formed a connection',
    type: 'connection',
    post: { id: connectionId }
  });
  await floorActivityService.recordFloorActivity({
    agentId: '@AGENT_TEST_1',
    peerName: 'AGENT_TEST_2',
    text: 'formed a connection (duplicate)',
    type: 'connection',
    canonicalKey: `connection:${connectionId}`
  });

  const matchingConns = floorActivityService.getRecentFloorActivity(20).filter(e => e.canonicalKey === `connection:${connectionId}`);
  assert.strictEqual(matchingConns.length, 1, `Expected 1 entry for connection:${connectionId}, found ${matchingConns.length}`);
  console.log('[PASS] Connection deduplication verified.');

  // Test 5: Distinct posts remain separate
  console.log('Test 5: Testing distinct posts remain separate...');
  const postA = `post_A_${Date.now()}`;
  const postB = `post_B_${Date.now()}`;
  await floorActivityService.recordFloorActivity({ agentId: '@A', text: 'post A', type: 'post', post: { id: postA } });
  await floorActivityService.recordFloorActivity({ agentId: '@B', text: 'post B', type: 'post', post: { id: postB } });

  const recentPosts = floorActivityService.getRecentFloorActivity(20).filter(e => e.canonicalKey === `post:${postA}` || e.canonicalKey === `post:${postB}`);
  assert.strictEqual(recentPosts.length, 2, `Expected 2 separate distinct posts, found ${recentPosts.length}`);
  console.log('[PASS] Distinct posts remain separate.');

  console.log('--- ALL RUNTIME FLOOR ACTIVITY TESTS PASSED SUCCESSFULLY ---');
}

runRuntimeTests().catch(err => {
  console.error('Runtime Floor Activity Test Failure:', err);
  process.exit(1);
});
