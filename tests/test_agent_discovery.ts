import { config } from 'dotenv';
config();
import { getSupabaseClient } from '../server/supabase.js';

const BASE_URL = 'http://localhost:3000';

async function runDiscoveryTests() {
  console.log('===============================================================');
  console.log('🔍 AAMARVA AGENT DISCOVERY & BIO SEARCH TEST SUITE');
  console.log('===============================================================\n');

  const supabase = getSupabaseClient();
  const testUsersToCleanup: string[] = [];
  const testPostsToCleanup: string[] = [];

  const uniqueSuffix = Date.now().toString(36);
  const testAgentName = `QuantumAnalyst_${uniqueSuffix}`;
  const testBioKeyword = `semiconductor_${uniqueSuffix}`;
  const testPostKeyword = `superconductor_${uniqueSuffix}`;

  let testAgentId = '';
  let token = '';

  try {
    // Setup Test Agent 1 with specific Name, ID, and Bio
    console.log('👉 Setup: Registering Test Agent with unique Bio keyword...');
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `agent_disc_${uniqueSuffix}@aamarva.net`,
        name: testAgentName,
        password: 'Password123!',
        bio: `Specializes in ${testBioKeyword} supply-chain analysis and capability routing.`
      })
    });
    const regData = await regRes.json();
    if (!regRes.ok || !regData.success) {
      throw new Error(`Failed to register test agent: ${JSON.stringify(regData)}`);
    }

    testAgentId = regData.data.agentId;
    token = regData.data.tokens.accessToken;
    testUsersToCleanup.push(regData.data.user.id);
    console.log(`✅ Created test agent: ${testAgentName} (${testAgentId}) with bio keyword: ${testBioKeyword}\n`);

    // Setup Test Agent 2 with null/empty bio
    console.log('👉 Setup: Registering Test Agent with empty bio...');
    const emptyBioName = `EmptyBioAgent_${uniqueSuffix}`;
    const regEmptyRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `agent_empty_${uniqueSuffix}@aamarva.net`,
        name: emptyBioName,
        password: 'Password123!',
        bio: ''
      })
    });
    const regEmptyData = await regEmptyRes.json();
    if (regEmptyRes.ok && regEmptyData.success) {
      testUsersToCleanup.push(regEmptyData.data.user.id);
      console.log(`✅ Created empty-bio test agent: ${emptyBioName}\n`);
    }

    // Setup Test Post for Post search verification
    console.log('👉 Setup: Creating a test post for post discovery verification...');
    const postRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        type: 'emit',
        category: 'DiscoveryTest',
        content: `Broadcasting research note regarding ${testPostKeyword} material synthesis.`
      })
    });
    const postData = await postRes.json();
    if (postRes.ok && postData.success) {
      testPostsToCleanup.push(postData.data.id);
      console.log(`✅ Created test post with keyword: ${testPostKeyword}\n`);
    }

    // -------------------------------------------------------------
    // TEST 1: A query matching the agent name returns the agent.
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 1: Query matching agent name returns the agent');
    const t1Res = await fetch(`${BASE_URL}/api/agents?q=${encodeURIComponent(testAgentName)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const t1Data = await t1Res.json();
    if (!t1Res.ok || !t1Data.success) throw new Error(`TEST 1 failed: HTTP ${t1Res.status}`);
    const t1Found = t1Data.data.some((a: any) => a.agentId === testAgentId);
    if (!t1Found) {
      throw new Error(`TEST 1 Failed: Agent ${testAgentId} not found when searching by name "${testAgentName}"`);
    }
    console.log(`✅ TEST 1 PASSED: Found agent by name ("${testAgentName}").\n`);

    // -------------------------------------------------------------
    // TEST 2: A query matching the agent ID returns the agent.
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 2: Query matching agent ID returns the agent');
    const t2Res = await fetch(`${BASE_URL}/api/agents?q=${encodeURIComponent(testAgentId)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const t2Data = await t2Res.json();
    if (!t2Res.ok || !t2Data.success) throw new Error(`TEST 2 failed: HTTP ${t2Res.status}`);
    const t2Found = t2Data.data.some((a: any) => a.agentId === testAgentId);
    if (!t2Found) {
      throw new Error(`TEST 2 Failed: Agent ${testAgentId} not found when searching by ID "${testAgentId}"`);
    }
    console.log(`✅ TEST 2 PASSED: Found agent by ID ("${testAgentId}").\n`);

    // -------------------------------------------------------------
    // TEST 3: A query appearing ONLY in the agent bio returns the agent.
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 3: Query appearing ONLY in agent bio returns the agent');
    const t3Res = await fetch(`${BASE_URL}/api/agents?q=${encodeURIComponent(testBioKeyword)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const t3Data = await t3Res.json();
    if (!t3Res.ok || !t3Data.success) throw new Error(`TEST 3 failed: HTTP ${t3Res.status}`);
    const t3Found = t3Data.data.some((a: any) => a.agentId === testAgentId);
    if (!t3Found) {
      throw new Error(`TEST 3 Failed: Agent ${testAgentId} not found when searching by bio keyword "${testBioKeyword}"`);
    }
    console.log(`✅ TEST 3 PASSED: Found agent by bio keyword ("${testBioKeyword}").\n`);

    // -------------------------------------------------------------
    // TEST 4: A query matching neither name, ID, nor bio does not return the agent.
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 4: Query matching neither name, ID, nor bio does not return the agent');
    const nonExistentQuery = `nonexistent_query_${Date.now()}_xyz`;
    const t4Res = await fetch(`${BASE_URL}/api/agents?q=${encodeURIComponent(nonExistentQuery)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const t4Data = await t4Res.json();
    if (!t4Res.ok || !t4Data.success) throw new Error(`TEST 4 failed: HTTP ${t4Res.status}`);
    const t4Found = t4Data.data.some((a: any) => a.agentId === testAgentId);
    if (t4Found || t4Data.data.length > 0) {
      throw new Error(`TEST 4 Failed: Unexpected agent match for nonexistent query "${nonExistentQuery}"`);
    }
    console.log(`✅ TEST 4 PASSED: Nonexistent query correctly returned 0 results.\n`);

    // -------------------------------------------------------------
    // TEST 5: An agent with null/empty/missing bio does not cause an error.
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 5: Search with agents having null/empty/missing bio does not cause an error');
    const t5Res = await fetch(`${BASE_URL}/api/agents?q=${encodeURIComponent(emptyBioName)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const t5Data = await t5Res.json();
    if (!t5Res.ok || !t5Data.success) {
      throw new Error(`TEST 5 Failed: Search errored with null/empty bio agent: HTTP ${t5Res.status}`);
    }
    console.log(`✅ TEST 5 PASSED: Handled empty/null bio safely without errors.\n`);

    // -------------------------------------------------------------
    // TEST 6: Existing pagination behavior remains unchanged.
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 6: Existing pagination behavior remains unchanged');
    const t6Page1Res = await fetch(`${BASE_URL}/api/agents?page=1&limit=2`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const t6Page1Data = await t6Page1Res.json();
    if (!t6Page1Res.ok || !t6Page1Data.success) throw new Error('TEST 6 Page 1 Failed');
    if (!Array.isArray(t6Page1Data.data) || t6Page1Data.data.length > 2) {
      throw new Error(`TEST 6 Failed: limit=2 exceeded: got ${t6Page1Data.data.length}`);
    }

    const t6Page2Res = await fetch(`${BASE_URL}/api/agents?page=2&limit=2`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const t6Page2Data = await t6Page2Res.json();
    if (!t6Page2Res.ok || !t6Page2Data.success) throw new Error('TEST 6 Page 2 Failed');

    console.log(`✅ TEST 6 PASSED: Pagination (page=1, page=2, limit=2) verified.\n`);

    // -------------------------------------------------------------
    // TEST 7: Existing /api/posts?q= behavior remains unchanged.
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 7: Existing /api/posts?q= behavior remains unchanged');
    const t7Res = await fetch(`${BASE_URL}/api/posts?q=${encodeURIComponent(testPostKeyword)}&page=1&limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const t7Data = await t7Res.json();
    if (!t7Res.ok || !t7Data.success) throw new Error(`TEST 7 failed: HTTP ${t7Res.status}`);
    const postFound = (t7Data.data?.posts || []).some((p: any) => p.content.includes(testPostKeyword));
    if (!postFound) {
      throw new Error(`TEST 7 Failed: Post with keyword "${testPostKeyword}" not found via /api/posts?q=`);
    }
    console.log(`✅ TEST 7 PASSED: /api/posts?q= successfully found post by content keyword.\n`);

    console.log('===============================================================');
    console.log('🎉 ALL 7 DISCOVERY AND SEARCH TESTS PASSED SUCCESSFULLY!');
    console.log('===============================================================');

  } catch (err: any) {
    console.error('❌ Test Suite Failed:', err.message);
    process.exitCode = 1;
  } finally {
    // Cleanup created test records
    console.log('\n🧹 Cleaning up test users and posts...');
    try {
      if (testPostsToCleanup.length > 0) {
        await supabase.from('posts').delete().in('id', testPostsToCleanup);
      }
      if (testUsersToCleanup.length > 0) {
        await supabase.from('users').delete().in('id', testUsersToCleanup);
      }
      console.log('✅ Cleanup completed.');
    } catch (cleanErr: any) {
      console.error('⚠️ Cleanup warning:', cleanErr.message);
    }
  }
}

runDiscoveryTests();
