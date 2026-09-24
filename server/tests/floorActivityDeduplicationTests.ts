import { deduplicateFloorActivities } from '../utils/floorDeduplication';

export async function runFloorDeduplicationTests() {
  console.log('==================================================');
  console.log('RUNNING FLOOR ACTIVITY DEDUPLICATION TESTS');
  console.log('==================================================');

  let passed = 0;
  let total = 7;

  // Test 1: One post producing generic + rich event (generic first, rich second)
  {
    console.log('\n--- Test 1: One post producing generic + rich event (Generic first, Rich second) ---');
    const before = [
      { id: 'gen_1', type: 'post', agentId: 'AGENT1', text: 'made a post on the floor', createdAt: '2026-09-24T08:00:00Z' },
      { id: 'rich_1', type: 'post', agentId: 'AGENT1', text: 'made a post on the floor', post: { id: 'post_123', content: 'Hello world' }, createdAt: '2026-09-24T08:00:01Z' }
    ];
    console.log('BEFORE events count:', before.length);
    console.log(JSON.stringify(before, null, 2));

    const after = deduplicateFloorActivities(before);
    console.log('AFTER events count:', after.length);
    console.log(JSON.stringify(after, null, 2));

    const success = after.length === 1 && after[0].id === 'rich_1' && after[0].post !== undefined;
    if (success) {
      console.log('RESULT: PASS. Duplicate generic event (gen_1) successfully removed; rich event (rich_1) retained.');
      passed++;
    } else {
      console.log('RESULT: FAIL');
    }
  }

  // Test 2: One reply producing generic + rich event
  {
    console.log('\n--- Test 2: One reply producing generic + rich event ---');
    const before = [
      { id: 'rich_2', type: 'reply', agentId: 'AGENT1', peerName: 'Agent2', text: 'made a reply', post: { id: 'reply_456', content: 'Nice reply' }, createdAt: '2026-09-24T08:05:00Z' },
      { id: 'gen_2', type: 'reply', agentId: 'AGENT1', peerName: 'Agent2', text: 'made a reply', createdAt: '2026-09-24T08:05:01Z' }
    ];
    console.log('BEFORE events count:', before.length);
    console.log(JSON.stringify(before, null, 2));

    const after = deduplicateFloorActivities(before);
    console.log('AFTER events count:', after.length);
    console.log(JSON.stringify(after, null, 2));

    const success = after.length === 1 && after[0].id === 'rich_2';
    if (success) {
      console.log('RESULT: PASS. Duplicate generic event (gen_2) successfully removed; rich event (rich_2) retained.');
      passed++;
    } else {
      console.log('RESULT: FAIL');
    }
  }

  // Test 3: One connection producing generic + rich event
  {
    console.log('\n--- Test 3: One connection producing generic + rich event ---');
    const before = [
      { id: 'gen_3', type: 'connection', agentId: 'AGENT1', peerName: 'Agent3', text: 'formed a connection', createdAt: '2026-09-24T08:10:00Z' },
      { id: 'rich_3', type: 'connection', agentId: 'AGENT1', peerName: 'Agent3', text: 'formed a connection', post: { id: 'conn_789' }, createdAt: '2026-09-24T08:10:02Z' }
    ];
    console.log('BEFORE events count:', before.length);
    console.log(JSON.stringify(before, null, 2));

    const after = deduplicateFloorActivities(before);
    console.log('AFTER events count:', after.length);
    console.log(JSON.stringify(after, null, 2));

    const success = after.length === 1 && after[0].id === 'rich_3';
    if (success) {
      console.log('RESULT: PASS. Duplicate generic event (gen_3) successfully removed; rich event (rich_3) retained.');
      passed++;
    } else {
      console.log('RESULT: FAIL');
    }
  }

  // Test 4: Rich event first, generic second
  {
    console.log('\n--- Test 4: Rich event first, generic second ---');
    const before = [
      { id: 'rich_4', type: 'post', agentId: 'AGENT2', text: 'made a post', post: { id: 'post_999' }, createdAt: '2026-09-24T08:15:00Z' },
      { id: 'gen_4', type: 'post', agentId: 'AGENT2', text: 'made a post', createdAt: '2026-09-24T08:15:02Z' }
    ];
    console.log('BEFORE events count:', before.length);
    console.log(JSON.stringify(before, null, 2));

    const after = deduplicateFloorActivities(before);
    console.log('AFTER events count:', after.length);
    console.log(JSON.stringify(after, null, 2));

    const success = after.length === 1 && after[0].id === 'rich_4';
    if (success) {
      console.log('RESULT: PASS. Later generic event (gen_4) ignored when rich event arrived first.');
      passed++;
    } else {
      console.log('RESULT: FAIL');
    }
  }

  // Test 5: Generic event first, rich second
  {
    console.log('\n--- Test 5: Generic event first, rich second ---');
    const before = [
      { id: 'gen_5', type: 'post', agentId: 'AGENT3', text: 'made a post', createdAt: '2026-09-24T08:20:00Z' },
      { id: 'rich_5', type: 'post', agentId: 'AGENT3', text: 'made a post', post: { id: 'post_888' }, createdAt: '2026-09-24T08:20:01Z' }
    ];
    console.log('BEFORE events count:', before.length);
    console.log(JSON.stringify(before, null, 2));

    const after = deduplicateFloorActivities(before);
    console.log('AFTER events count:', after.length);
    console.log(JSON.stringify(after, null, 2));

    const success = after.length === 1 && after[0].id === 'rich_5';
    if (success) {
      console.log('RESULT: PASS. Earlier generic event (gen_5) replaced/superseded by rich event (rich_5).');
      passed++;
    } else {
      console.log('RESULT: FAIL');
    }
  }

  // Test 6: Two different posts
  {
    console.log('\n--- Test 6: Two different posts ---');
    const before = [
      { id: 'rich_6a', type: 'post', agentId: 'AGENT1', text: 'made a post', post: { id: 'post_A' }, createdAt: '2026-09-24T08:25:00Z' },
      { id: 'rich_6b', type: 'post', agentId: 'AGENT1', text: 'made a post', post: { id: 'post_B' }, createdAt: '2026-09-24T08:26:00Z' }
    ];
    console.log('BEFORE events count:', before.length);
    console.log(JSON.stringify(before, null, 2));

    const after = deduplicateFloorActivities(before);
    console.log('AFTER events count:', after.length);
    console.log(JSON.stringify(after, null, 2));

    const success = after.length === 2;
    if (success) {
      console.log('RESULT: PASS. Two different posts retained correctly.');
      passed++;
    } else {
      console.log('RESULT: FAIL');
    }
  }

  // Test 7: One legitimate activity with no duplicate
  {
    console.log('\n--- Test 7: One legitimate activity with no duplicate ---');
    const before = [
      { id: 'reg_1', type: 'AGENT_REGISTERED', agentId: 'AGENT_NEW', text: 'registered on the floor', createdAt: '2026-09-24T08:30:00Z' }
    ];
    console.log('BEFORE events count:', before.length);
    console.log(JSON.stringify(before, null, 2));

    const after = deduplicateFloorActivities(before);
    console.log('AFTER events count:', after.length);
    console.log(JSON.stringify(after, null, 2));

    const success = after.length === 1 && after[0].id === 'reg_1';
    if (success) {
      console.log('RESULT: PASS. Legitimate generic activity with no duplicate kept normally.');
      passed++;
    } else {
      console.log('RESULT: FAIL');
    }
  }

  console.log('\n==================================================');
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('==================================================');
  return passed === total;
}
