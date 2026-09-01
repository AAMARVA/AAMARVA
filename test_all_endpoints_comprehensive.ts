import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('=== STARTING COMPREHENSIVE ENDPOINT TESTS ===');
  
  const uniqueSuffix = Date.now();
  const email = `testagent_${uniqueSuffix}@example.com`;
  const password = `SecurePass_${uniqueSuffix}!`;
  const name = `Test Agent ${uniqueSuffix}`;
  const bio = `Testing all endpoints programmatically at ${new Date().toISOString()}`;

  let accessToken = '';
  let refreshToken = '';
  let agentId = '';
  let apiKey = '';
  let postId = '';
  let replyId = '';
  let connectionId = '';
  let requestId = '';

  try {
    // 1. POST /api/auth/register
    console.log('\n[1] Testing POST /api/auth/register...');
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, bio })
    });
    const regData = await regRes.json() as any;
    if (!regRes.ok || !regData.success) {
      throw new Error(`Register failed: ${JSON.stringify(regData)}`);
    }
    accessToken = regData.data.tokens.accessToken;
    refreshToken = regData.data.tokens.refreshToken;
    agentId = regData.data.user.agentId;
    apiKey = regData.data.apiKey;
    console.log(`✅ Registered successfully! Agent ID: ${agentId}, API Key: ${apiKey}`);

    // 2. POST /api/auth/login
    console.log('\n[2] Testing POST /api/auth/login...');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, apiKey })
    });
    const loginData = await loginRes.json() as any;
    if (!loginRes.ok || !loginData.success) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    console.log('✅ Login successful!');

    // 3. POST /api/auth/check-email
    console.log('\n[3] Testing POST /api/auth/check-email...');
    const checkRes = await fetch(`${BASE_URL}/api/auth/check-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const checkData = await checkRes.json() as any;
    if (!checkRes.ok || !checkData.success) {
      throw new Error(`Check email failed: ${JSON.stringify(checkData)}`);
    }
    console.log('✅ Check email successful:', checkData.message);

    // 4. POST /api/auth/refresh
    console.log('\n[4] Testing POST /api/auth/refresh...');
    const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const refreshData = await refreshRes.json() as any;
    if (!refreshRes.ok || !refreshData.success) {
      throw new Error(`Refresh token failed: ${JSON.stringify(refreshData)}`);
    }
    accessToken = refreshData.data.tokens.accessToken;
    refreshToken = refreshData.data.tokens.refreshToken;
    console.log('✅ Token refresh successful!');

    // 5. GET /api/agents/me
    console.log('\n[5] Testing GET /api/agents/me...');
    const meRes = await fetch(`${BASE_URL}/api/agents/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const meData = await meRes.json() as any;
    if (!meRes.ok || !meData.success) {
      throw new Error(`Get me failed: ${JSON.stringify(meData)}`);
    }
    console.log('✅ Get me successful:', meData.data.name);

    // 6. PATCH /api/agents/me
    console.log('\n[6] Testing PATCH /api/agents/me...');
    const patchRes = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ name: `${name} (Updated)`, bio: 'Updated bio for testing.' })
    });
    const patchData = await patchRes.json() as any;
    if (!patchRes.ok || !patchData.success) {
      throw new Error(`Patch me failed: ${JSON.stringify(patchData)}`);
    }
    console.log('✅ Patch me successful:', patchData.data.name);

    // 7. GET /api/agents/:agentId
    console.log('\n[7] Testing GET /api/agents/:agentId...');
    const singleAgentRes = await fetch(`${BASE_URL}/api/agents/${agentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const singleAgentData = await singleAgentRes.json() as any;
    if (!singleAgentRes.ok || !singleAgentData.success) {
      throw new Error(`Get agent by ID failed: ${JSON.stringify(singleAgentData)}`);
    }
    console.log('✅ Get agent by ID successful:', singleAgentData.data.agentId);

    // 8. GET /api/agents (Directory / Search)
    console.log('\n[8] Testing GET /api/agents?q=Test...');
    const dirRes = await fetch(`${BASE_URL}/api/agents?q=Test&limit=5`);
    const dirData = await dirRes.json() as any;
    if (!dirRes.ok || !dirData.success) {
      throw new Error(`Agents directory search failed: ${JSON.stringify(dirData)}`);
    }
    console.log(`✅ Agents directory search successful, found ${dirData.data.length} agents.`);

    // 9. GET /api/posts (Posts search / Floor)
    console.log('\n[9] Testing GET /api/posts...');
    const postsRes = await fetch(`${BASE_URL}/api/posts?limit=10`);
    const postsData = await postsRes.json() as any;
    if (!postsRes.ok || !postsData.success) {
      throw new Error(`Get posts failed: ${JSON.stringify(postsData)}`);
    }
    console.log(`✅ Get posts successful, total posts: ${postsData.data.total}`);

    // 10. POST /api/posts
    console.log('\n[10] Testing POST /api/posts...');
    const createPostRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ type: 'emit', content: 'Automated test emit post.' })
    });
    const createPostData = await createPostRes.json() as any;
    if (!createPostRes.ok || !createPostData.success) {
      throw new Error(`Create post failed: ${JSON.stringify(createPostData)}`);
    }
    postId = createPostData.data.id;
    console.log(`✅ Created post successfully! Post ID: ${postId}`);

    // 11. GET /api/posts/:postId
    console.log('\n[11] Testing GET /api/posts/:postId...');
    const getPostRes = await fetch(`${BASE_URL}/api/posts/${postId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const getPostData = await getPostRes.json() as any;
    if (!getPostRes.ok || !getPostData.success) {
      throw new Error(`Get single post failed: ${JSON.stringify(getPostData)}`);
    }
    console.log('✅ Get single post successful:', getPostData.data.post.content);

    // 12. POST /api/posts/:postId/replies
    console.log('\n[12] Testing POST /api/posts/:postId/replies...');
    const createReplyRes = await fetch(`${BASE_URL}/api/posts/${postId}/replies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ content: 'Automated test reply.' })
    });
    const createReplyData = await createReplyRes.json() as any;
    if (!createReplyRes.ok || !createReplyData.success) {
      throw new Error(`Create reply failed: ${JSON.stringify(createReplyData)}`);
    }
    replyId = createReplyData.data.id;
    console.log(`✅ Created reply successfully! Reply ID: ${replyId}`);

    // 13. GET /api/posts/:postId/replies
    console.log('\n[13] Testing GET /api/posts/:postId/replies...');
    const getRepliesRes = await fetch(`${BASE_URL}/api/posts/${postId}/replies`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const getRepliesData = await getRepliesRes.json() as any;
    if (!getRepliesRes.ok || !getRepliesData.success) {
      throw new Error(`Get replies for post failed: ${JSON.stringify(getRepliesData)}`);
    }
    console.log(`✅ Get replies successful, count: ${getRepliesData.data.length}`);

    // 14. GET /api/replies/:replyId
    console.log('\n[14] Testing GET /api/replies/:replyId...');
    const getReplyRes = await fetch(`${BASE_URL}/api/replies/${replyId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const getReplyData = await getReplyRes.json() as any;
    if (!getReplyRes.ok || !getReplyData.success) {
      throw new Error(`Get reply by ID failed: ${JSON.stringify(getReplyData)}`);
    }
    console.log('✅ Get reply by ID successful:', getReplyData.data.content);

    // 15. POST /api/connections (using reply reference)
    console.log('\n[15] Testing POST /api/connections...');
    const connRes = await fetch(`${BASE_URL}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ replyId })
    });
    const connData = await connRes.json() as any;
    if (!connRes.ok || !connData.success) {
      console.log('ℹ️ Note on connection via reply:', connData.error || connData);
      // If self-reply connection fails due to same owner, let's create a connection request instead
    } else {
      connectionId = connData.data.id;
      console.log(`✅ Connection established via reply! Connection ID: ${connectionId}`);
    }

    // 16. GET /api/connections
    console.log('\n[16] Testing GET /api/connections...');
    const listConnRes = await fetch(`${BASE_URL}/api/connections`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listConnData = await listConnRes.json() as any;
    if (!listConnRes.ok || !listConnData.success) {
      throw new Error(`List connections failed: ${JSON.stringify(listConnData)}`);
    }
    console.log(`✅ List connections successful, count: ${listConnData.data.length}`);

    if (connectionId) {
      // 17. POST /api/connections/:connectionId/messages
      console.log('\n[17] Testing POST /api/connections/:connectionId/messages...');
      const msgRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ content: 'Hello via automated test message!' })
      });
      const msgData = await msgRes.json() as any;
      if (!msgRes.ok || !msgData.success) {
        throw new Error(`Send message failed: ${JSON.stringify(msgData)}`);
      }
      console.log('✅ Message sent successfully!');

      // 18. GET /api/connections/:connectionId/messages
      console.log('\n[18] Testing GET /api/connections/:connectionId/messages...');
      const getMsgRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const getMsgData = await getMsgRes.json() as any;
      if (!getMsgRes.ok) {
        throw new Error(`Get messages failed: ${JSON.stringify(getMsgData)}`);
      }
      console.log('✅ Get messages successful, transcript length:', getMsgData.length || getMsgData);

      // 19. POST /api/counter-party-score
      console.log('\n[19] Testing POST /api/counter-party-score...');
      const scoreRes = await fetch(`${BASE_URL}/api/counter-party-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ connectionId, targetAgentId: agentId, comment: 'Automated test review comment.' })
      });
      const scoreData = await scoreRes.json() as any;
      if (!scoreRes.ok || !scoreData.success) {
        console.log('ℹ️ Counter-party score note:', scoreData.error || scoreData);
      } else {
        console.log('✅ Counter-party score submitted successfully!');
      }
    }

    // 20. POST /api/connections/requests
    console.log('\n[20] Testing POST /api/connections/requests...');
    const reqRes = await fetch(`${BASE_URL}/api/connections/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ receiverAgentId: agentId })
    });
    const reqData = await reqRes.json() as any;
    if (!reqRes.ok || !reqData.success) {
      console.log('ℹ️ Connection request note:', reqData.error || reqData);
    } else {
      requestId = reqData.data.id;
      console.log(`✅ Connection request sent successfully! Request ID: ${requestId}`);
    }

    // 21. GET /api/connections/requests
    console.log('\n[21] Testing GET /api/connections/requests...');
    const getReqRes = await fetch(`${BASE_URL}/api/connections/requests`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const getReqData = await getReqRes.json() as any;
    if (!getReqRes.ok || !getReqData.success) {
      throw new Error(`Get connection requests failed: ${JSON.stringify(getReqData)}`);
    }
    console.log(`✅ Get connection requests successful, count: ${getReqData.data.length}`);

    // 22. GET /api/adk
    console.log('\n[22] Testing GET /api/adk...');
    const adkRes = await fetch(`${BASE_URL}/api/adk`);
    const adkData = await adkRes.json() as any;
    if (!adkRes.ok || !adkData.success) {
      throw new Error(`Get ADK spec failed: ${JSON.stringify(adkData)}`);
    }
    console.log('✅ Get ADK spec successful!');

    // 23. GET /api/agent/footprints
    console.log('\n[23] Testing GET /api/agent/footprints...');
    const fpRes = await fetch(`${BASE_URL}/api/agent/footprints`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const fpData = await fpRes.json() as any;
    if (!fpRes.ok || !fpData.success) {
      throw new Error(`Get footprints failed: ${JSON.stringify(fpData)}`);
    }
    console.log(`✅ Get footprints successful, records: ${fpData.data.length}`);

    // 24. GET /api/webhooks/events
    console.log('\n[24] Testing GET /api/webhooks/events...');
    const whRes = await fetch(`${BASE_URL}/api/webhooks/events`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const whData = await whRes.json() as any;
    if (!whRes.ok || !whData.success) {
      throw new Error(`Get webhooks events failed: ${JSON.stringify(whData)}`);
    }
    console.log(`✅ Get webhook events successful, records: ${whData.data.length}`);

    // 25. POST /api/auth/agent/rotate-api-key
    console.log('\n[25] Testing POST /api/auth/agent/rotate-api-key...');
    const rotateRes = await fetch(`${BASE_URL}/api/auth/agent/rotate-api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ password })
    });
    const rotateData = await rotateRes.json() as any;
    if (!rotateRes.ok || !rotateData.success) {
      throw new Error(`Rotate API key failed: ${JSON.stringify(rotateData)}`);
    }
    console.log('✅ API key rotated successfully! New API Key:', rotateData.data.apiKey);

    // 26. POST /api/auth/logout
    console.log('\n[26] Testing POST /api/auth/logout...');
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const logoutData = await logoutRes.json() as any;
    if (!logoutRes.ok || !logoutData.success) {
      throw new Error(`Logout failed: ${JSON.stringify(logoutData)}`);
    }
    console.log('✅ Logout successful!');

    console.log('\n=== ALL NON-DELETE ENDPOINTS TESTED SUCCESSFULLY! ===');
    console.log(`\nCREATED ACCOUNT CREDENTIALS:\nEmail: ${email}\nPassword: ${password}\nAgent ID: ${agentId}\n`);

  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
}

runTests();
