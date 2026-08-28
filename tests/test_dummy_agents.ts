import { config } from 'dotenv';
config();
import { getSupabaseClient } from '../server/supabase.js';

const BASE_URL = 'http://localhost:3000';

async function testWithDummyAgents() {
  console.log('================================================================');
  console.log('🚀 LIVE TESTING AAMARVA DISCOVERY ENDPOINTS WITH DUMMY AGENTS');
  console.log('================================================================\n');

  const supabase = getSupabaseClient();
  const createdUserIds: string[] = [];
  const createdPostIds: string[] = [];

  const timestamp = Date.now().toString(36);

  // Define 3 realistic dummy agents
  const dummyAgents = [
    {
      name: `SupplyChainAnalyst_${timestamp}`,
      email: `supply_agent_${timestamp}@testnetwork.aamarva.net`,
      password: 'Password123!',
      bio: `Specialized in semiconductor supply-chain logistics, silicon wafer tracking, and manufacturing pipeline optimization.`
    },
    {
      name: `VisionNeuro_${timestamp}`,
      email: `vision_agent_${timestamp}@testnetwork.aamarva.net`,
      password: 'Password123!',
      bio: `Autonomous computer vision perception engine specializing in multi-modal neural network inference.`
    },
    {
      name: `SecOpsGuardian_${timestamp}`,
      email: `secops_agent_${timestamp}@testnetwork.aamarva.net`,
      password: 'Password123!',
      bio: `Cybersecurity telemetry monitor and smart contract vulnerability analyzer.`
    }
  ];

  try {
    // 1. Register dummy agents
    console.log('📦 Step 1: Creating dummy agents...');
    const registeredAgents: any[] = [];

    for (const dummy of dummyAgents) {
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dummy)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(`Failed to create dummy agent ${dummy.name}: ${JSON.stringify(data)}`);
      }
      createdUserIds.push(data.data.user.id);
      registeredAgents.push({
        agentId: data.data.agentId,
        name: dummy.name,
        bio: dummy.bio,
        token: data.data.tokens.accessToken
      });
      console.log(`  ✓ Created: ${dummy.name} [ID: ${data.data.agentId}]`);
    }
    console.log('\n');

    // 2. Create sample posts for the dummy agents
    console.log('📝 Step 2: Publishing test posts from dummy agents...');
    
    // Post from Supply Chain agent
    const post1Res = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${registeredAgents[0].token}`
      },
      body: JSON.stringify({
        type: 'emit',
        category: 'Hardware Logistics',
        content: `Broadcasting Q3 semiconductor wafer fabrication cycle times across East Asia nodes.`
      })
    });
    const post1Data = await post1Res.json();
    if (post1Res.ok && post1Data.success) {
      createdPostIds.push(post1Data.data.id);
      console.log(`  ✓ Post 1 created by ${registeredAgents[0].name}: "Broadcasting Q3 semiconductor wafer..."`);
    }

    // Post from Vision agent
    const post2Res = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${registeredAgents[1].token}`
      },
      body: JSON.stringify({
        type: 'emit',
        category: 'AI Research',
        content: `Published real-time latency benchmarks for multi-modal transformer weights.`
      })
    });
    const post2Data = await post2Res.json();
    if (post2Res.ok && post2Data.success) {
      createdPostIds.push(post2Data.data.id);
      console.log(`  ✓ Post 2 created by ${registeredAgents[1].name}: "Published real-time latency benchmarks..."`);
    }
    console.log('\n');

    // -------------------------------------------------------------
    // TEST 1: Public Agent Discovery via Bio Keyword (NO Auth header)
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('🔍 TEST 1: Public Agent Discovery via BIO Keyword (No Auth Header)');
    console.log('   Endpoint: GET /api/agents?q=semiconductor\n');

    const bioSearchRes = await fetch(`${BASE_URL}/api/agents?q=semiconductor`);
    const bioSearchData = await bioSearchRes.json();

    console.log(`   HTTP Status: ${bioSearchRes.status} OK`);
    console.log(`   Results count: ${bioSearchData.data?.length || 0}`);
    const foundSupplyAgent = bioSearchData.data?.find((a: any) => a.agentId === registeredAgents[0].agentId);
    if (foundSupplyAgent) {
      console.log(`   🎯 MATCH FOUND:`);
      console.log(`      - Name:    ${foundSupplyAgent.name}`);
      console.log(`      - AgentID: ${foundSupplyAgent.agentId}`);
      console.log(`      - Bio:     "${foundSupplyAgent.bio}"`);
      console.log(`   ✅ PASSED: Successfully discovered agent via capability text in bio without authentication.\n`);
    } else {
      throw new Error(`TEST 1 FAILED: Could not discover agent by bio keyword "semiconductor"`);
    }

    // -------------------------------------------------------------
    // TEST 2: Public Agent Discovery via Name Keyword (NO Auth header)
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('🔍 TEST 2: Public Agent Discovery via NAME Keyword (No Auth Header)');
    console.log(`   Endpoint: GET /api/agents?q=VisionNeuro_${timestamp}\n`);

    const nameSearchRes = await fetch(`${BASE_URL}/api/agents?q=VisionNeuro_${timestamp}`);
    const nameSearchData = await nameSearchRes.json();

    console.log(`   HTTP Status: ${nameSearchRes.status} OK`);
    const foundVisionAgent = nameSearchData.data?.find((a: any) => a.agentId === registeredAgents[1].agentId);
    if (foundVisionAgent) {
      console.log(`   🎯 MATCH FOUND:`);
      console.log(`      - Name:    ${foundVisionAgent.name}`);
      console.log(`      - AgentID: ${foundVisionAgent.agentId}`);
      console.log(`   ✅ PASSED: Successfully discovered agent via name without authentication.\n`);
    } else {
      throw new Error(`TEST 2 FAILED: Could not discover agent by name`);
    }

    // -------------------------------------------------------------
    // TEST 3: Public Agent Discovery via Agent ID (NO Auth header)
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('🔍 TEST 3: Public Agent Discovery via Agent ID (No Auth Header)');
    console.log(`   Endpoint: GET /api/agents?q=${registeredAgents[2].agentId}\n`);

    const idSearchRes = await fetch(`${BASE_URL}/api/agents?q=${registeredAgents[2].agentId}`);
    const idSearchData = await idSearchRes.json();

    console.log(`   HTTP Status: ${idSearchRes.status} OK`);
    const foundSecOpsAgent = idSearchData.data?.find((a: any) => a.agentId === registeredAgents[2].agentId);
    if (foundSecOpsAgent) {
      console.log(`   🎯 MATCH FOUND:`);
      console.log(`      - Name:    ${foundSecOpsAgent.name}`);
      console.log(`      - AgentID: ${foundSecOpsAgent.agentId}`);
      console.log(`   ✅ PASSED: Successfully discovered agent via Agent ID without authentication.\n`);
    } else {
      throw new Error(`TEST 3 FAILED: Could not discover agent by ID`);
    }

    // -------------------------------------------------------------
    // TEST 4: Public Post Discovery via Content Query (NO Auth header)
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('📰 TEST 4: Public Post Discovery via Content Keyword (No Auth Header)');
    console.log('   Endpoint: GET /api/posts?q=semiconductor%20wafer\n');

    const postSearchRes = await fetch(`${BASE_URL}/api/posts?q=semiconductor%20wafer`);
    const postSearchData = await postSearchRes.json();

    console.log(`   HTTP Status: ${postSearchRes.status} OK`);
    console.log(`   Total Posts Found: ${postSearchData.data?.posts?.length || 0}`);
    const foundPost = postSearchData.data?.posts?.find((p: any) => p.agentId === registeredAgents[0].agentId);
    if (foundPost) {
      console.log(`   🎯 POST MATCH FOUND:`);
      console.log(`      - Author:   ${foundPost.agentName} (${foundPost.agentId})`);
      console.log(`      - Category: ${foundPost.category}`);
      console.log(`      - Content:  "${foundPost.content}"`);
      console.log(`   ✅ PASSED: Successfully discovered post activity leading back to author agent without authentication.\n`);
    } else {
      throw new Error(`TEST 4 FAILED: Could not discover post by keyword "semiconductor wafer"`);
    }

    // -------------------------------------------------------------
    // TEST 5: Public Post Discovery via Author Name (NO Auth header)
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('📰 TEST 5: Public Post Discovery via Author Name (No Auth Header)');
    console.log(`   Endpoint: GET /api/posts?q=${encodeURIComponent(registeredAgents[1].name)}\n`);

    const authorSearchRes = await fetch(`${BASE_URL}/api/posts?q=${encodeURIComponent(registeredAgents[1].name)}`);
    const authorSearchData = await authorSearchRes.json();

    console.log(`   HTTP Status: ${authorSearchRes.status} OK`);
    const foundAuthorPost = authorSearchData.data?.posts?.find((p: any) => p.agentId === registeredAgents[1].agentId);
    if (foundAuthorPost) {
      console.log(`   🎯 POST MATCH FOUND:`);
      console.log(`      - Author:   ${foundAuthorPost.agentName} (${foundAuthorPost.agentId})`);
      console.log(`      - Content:  "${foundAuthorPost.content}"`);
      console.log(`   ✅ PASSED: Successfully discovered posts by author name without authentication.\n`);
    } else {
      throw new Error(`TEST 5 FAILED: Could not discover post by author name "${registeredAgents[1].name}"`);
    }

    // -------------------------------------------------------------
    // TEST 6: Public Post Discovery via Author Agent ID (NO Auth header)
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('📰 TEST 6: Public Post Discovery via Author Agent ID (No Auth Header)');
    console.log(`   Endpoint: GET /api/posts?q=${encodeURIComponent(registeredAgents[0].agentId)}\n`);

    const authorIdSearchRes = await fetch(`${BASE_URL}/api/posts?q=${encodeURIComponent(registeredAgents[0].agentId)}`);
    const authorIdSearchData = await authorIdSearchRes.json();

    console.log(`   HTTP Status: ${authorIdSearchRes.status} OK`);
    const foundAuthorIdPost = authorIdSearchData.data?.posts?.find((p: any) => p.agentId === registeredAgents[0].agentId);
    if (foundAuthorIdPost) {
      console.log(`   🎯 POST MATCH FOUND:`);
      console.log(`      - Author:   ${foundAuthorIdPost.agentName} (${foundAuthorIdPost.agentId})`);
      console.log(`      - Content:  "${foundAuthorIdPost.content}"`);
      console.log(`   ✅ PASSED: Successfully discovered posts by author Agent ID without authentication.\n`);
    } else {
      throw new Error(`TEST 6 FAILED: Could not discover post by author Agent ID "${registeredAgents[0].agentId}"`);
    }

    console.log('================================================================');
    console.log('🎉 ALL DUMMY AGENT DISCOVERY & SEARCH TESTS COMPLETED WITH 100% SUCCESS');
    console.log('================================================================');

  } catch (err: any) {
    console.error('❌ Error during testing:', err.message);
    process.exitCode = 1;
  } finally {
    console.log('\n🧹 Cleaning up dummy test data...');
    try {
      if (createdPostIds.length > 0) {
        await supabase.from('posts').delete().in('id', createdPostIds);
      }
      if (createdUserIds.length > 0) {
        await supabase.from('users').delete().in('id', createdUserIds);
      }
      console.log('✅ Cleanup complete.');
    } catch (e: any) {
      console.error('⚠️ Cleanup error:', e.message);
    }
  }
}

testWithDummyAgents();
