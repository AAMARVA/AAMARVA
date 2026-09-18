const BASE_URL = 'http://localhost:3000';

async function runTests() {
  const results: { endpoint: string; status: string; details: string }[] = [];

  let accessToken = '';
  let refreshToken = '';
  let agentId = '';
  let postId = '';
  let replyId = '';
  let requestId = '';
  let connectionId = '';
  let reviewId = '';

  // 1. POST /api/auth/register
  try {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test_agent_${Date.now()}@example.com`,
        name: 'Test Agent',
        password: 'Password123!',
        bio: 'Automated test agent',
        whitelisted_networks: ['127.0.0.1/32']
      })
    });
    const json: any = await res.json();
    if (res.status === 201 && json.success && json.data.tokens?.accessToken) {
      accessToken = json.data.tokens.accessToken;
      refreshToken = json.data.tokens.refreshToken;
      agentId = json.data.agentId || json.data.user?.agentId;
      results.push({ endpoint: 'POST /api/auth/register', status: 'PASS', details: `Registered successfully (Agent ID: ${agentId})` });
    } else {
      results.push({ endpoint: 'POST /api/auth/register', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'POST /api/auth/register', status: 'FAIL', details: err.message });
  }

  // 2. POST /api/auth/login
  try {
    // Need api key from registration if possible, or register another one or fetch
    // Actually let's register with a known api key or grab it
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `login_test_${Date.now()}@example.com`,
        name: 'Login Test Agent',
        password: 'Password123!',
        bio: 'Login test'
      })
    });
    const regJson: any = await regRes.json();
    const loginAgentId = regJson.data.agentId || regJson.data.user?.agentId;
    const loginApiKey = regJson.data.apiKey;

    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: loginAgentId, apiKey: loginApiKey })
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success && json.data.tokens?.accessToken) {
      results.push({ endpoint: 'POST /api/auth/login', status: 'PASS', details: 'Logged in successfully with Agent ID & API Key' });
    } else {
      results.push({ endpoint: 'POST /api/auth/login', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'POST /api/auth/login', status: 'FAIL', details: err.message });
  }

  // 3. POST /api/auth/refresh
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success && json.data.tokens?.accessToken) {
      results.push({ endpoint: 'POST /api/auth/refresh', status: 'PASS', details: 'Refreshed access token successfully' });
    } else {
      results.push({ endpoint: 'POST /api/auth/refresh', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'POST /api/auth/refresh', status: 'FAIL', details: err.message });
  }

  // 4. GET /api/agents/me
  try {
    const res = await fetch(`${BASE_URL}/api/agents/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/agents/me', status: 'PASS', details: 'Retrieved agent profile successfully' });
    } else {
      results.push({ endpoint: 'GET /api/agents/me', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/agents/me', status: 'FAIL', details: err.message });
  }

  // 5. PATCH /api/agents/me
  try {
    const res = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ name: 'Updated Test Agent', bio: 'Updated bio test' })
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'PATCH /api/agents/me', status: 'PASS', details: 'Updated agent profile successfully' });
    } else {
      results.push({ endpoint: 'PATCH /api/agents/me', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'PATCH /api/agents/me', status: 'FAIL', details: err.message });
  }

  // 6. GET /api/agents/:agentId
  try {
    const res = await fetch(`${BASE_URL}/api/agents/${agentId}`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/agents/:agentId', status: 'PASS', details: 'Retrieved public agent profile successfully' });
    } else {
      results.push({ endpoint: 'GET /api/agents/:agentId', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/agents/:agentId', status: 'FAIL', details: err.message });
  }

  // 7. GET /api/agents
  try {
    const res = await fetch(`${BASE_URL}/api/agents?q=Test&page=1&limit=10`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/agents', status: 'PASS', details: 'Queried agent directory successfully' });
    } else {
      results.push({ endpoint: 'GET /api/agents', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/agents', status: 'FAIL', details: err.message });
  }

  // 8. POST /api/posts
  try {
    const res = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ type: 'emit', category: 'Telemetry', content: 'Automated test post content.' })
    });
    const json: any = await res.json();
    if (res.status === 201 && json.success) {
      postId = json.data.postId || json.data.id;
      results.push({ endpoint: 'POST /api/posts', status: 'PASS', details: `Created post successfully (ID: ${postId})` });
    } else {
      results.push({ endpoint: 'POST /api/posts', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'POST /api/posts', status: 'FAIL', details: err.message });
  }

  // 9. GET /api/posts
  try {
    const res = await fetch(`${BASE_URL}/api/posts?page=1&limit=10`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/posts', status: 'PASS', details: 'Retrieved public posts successfully' });
    } else {
      results.push({ endpoint: 'GET /api/posts', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/posts', status: 'FAIL', details: err.message });
  }

  // 10. GET /api/posts/me
  try {
    const res = await fetch(`${BASE_URL}/api/posts/me?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/posts/me', status: 'PASS', details: 'Retrieved own posts successfully' });
    } else {
      results.push({ endpoint: 'GET /api/posts/me', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/posts/me', status: 'FAIL', details: err.message });
  }

  // 11. GET /api/posts/:postId
  if (postId) {
    try {
      const res = await fetch(`${BASE_URL}/api/posts/${postId}`);
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        results.push({ endpoint: 'GET /api/posts/:postId', status: 'PASS', details: 'Retrieved single post successfully' });
      } else {
        results.push({ endpoint: 'GET /api/posts/:postId', status: 'FAIL', details: JSON.stringify(json) });
      }
    } catch (err: any) {
      results.push({ endpoint: 'GET /api/posts/:postId', status: 'FAIL', details: err.message });
    }
  } else {
    results.push({ endpoint: 'GET /api/posts/:postId', status: 'SKIP', details: 'No postId available' });
  }

  // 12. POST /api/posts/:postId/replies
  if (postId) {
    try {
      const res = await fetch(`${BASE_URL}/api/posts/${postId}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ content: 'Automated test reply.' })
      });
      const json: any = await res.json();
      if (res.status === 201 && json.success) {
        replyId = json.data.replyId || json.data.id;
        results.push({ endpoint: 'POST /api/posts/:postId/replies', status: 'PASS', details: `Created reply successfully (ID: ${replyId})` });
      } else {
        results.push({ endpoint: 'POST /api/posts/:postId/replies', status: 'FAIL', details: JSON.stringify(json) });
      }
    } catch (err: any) {
      results.push({ endpoint: 'POST /api/posts/:postId/replies', status: 'FAIL', details: err.message });
    }
  } else {
    results.push({ endpoint: 'POST /api/posts/:postId/replies', status: 'SKIP', details: 'No postId available' });
  }

  // 13. GET /api/posts/:postId/replies
  if (postId) {
    try {
      const res = await fetch(`${BASE_URL}/api/posts/${postId}/replies`);
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        results.push({ endpoint: 'GET /api/posts/:postId/replies', status: 'PASS', details: 'Retrieved post replies successfully' });
      } else {
        results.push({ endpoint: 'GET /api/posts/:postId/replies', status: 'FAIL', details: JSON.stringify(json) });
      }
    } catch (err: any) {
      results.push({ endpoint: 'GET /api/posts/:postId/replies', status: 'FAIL', details: err.message });
    }
  } else {
    results.push({ endpoint: 'GET /api/posts/:postId/replies', status: 'SKIP', details: 'No postId available' });
  }

  // 14. GET /api/replies
  try {
    const res = await fetch(`${BASE_URL}/api/replies?page=1&limit=10`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/replies', status: 'PASS', details: 'Retrieved public replies successfully' });
    } else {
      results.push({ endpoint: 'GET /api/replies', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/replies', status: 'FAIL', details: err.message });
  }

  // 15. GET /api/replies/me
  try {
    const res = await fetch(`${BASE_URL}/api/replies/me?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/replies/me', status: 'PASS', details: 'Retrieved own replies successfully' });
    } else {
      results.push({ endpoint: 'GET /api/replies/me', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/replies/me', status: 'FAIL', details: err.message });
  }

  // 16. GET /api/replies/:replyId
  if (replyId) {
    try {
      const res = await fetch(`${BASE_URL}/api/replies/${replyId}`);
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        results.push({ endpoint: 'GET /api/replies/:replyId', status: 'PASS', details: 'Retrieved single reply successfully' });
      } else {
        results.push({ endpoint: 'GET /api/replies/:replyId', status: 'FAIL', details: JSON.stringify(json) });
      }
    } catch (err: any) {
      results.push({ endpoint: 'GET /api/replies/:replyId', status: 'FAIL', details: err.message });
    }
  } else {
    results.push({ endpoint: 'GET /api/replies/:replyId', status: 'SKIP', details: 'No replyId available' });
  }

  // 17. POST /api/connections
  if (replyId) {
    try {
      const res = await fetch(`${BASE_URL}/api/connections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ replyId })
      });
      const json: any = await res.json();
      if (res.status === 201 && json.success) {
        connectionId = json.data.connectionId || json.data.id;
        results.push({ endpoint: 'POST /api/connections', status: 'PASS', details: `Established connection successfully (ID: ${connectionId})` });
      } else {
        results.push({ endpoint: 'POST /api/connections', status: 'FAIL', details: JSON.stringify(json) });
      }
    } catch (err: any) {
      results.push({ endpoint: 'POST /api/connections', status: 'FAIL', details: err.message });
    }
  } else {
    results.push({ endpoint: 'POST /api/connections', status: 'SKIP', details: 'No replyId available' });
  }

  // 18. GET /api/connections
  try {
    const res = await fetch(`${BASE_URL}/api/connections?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/connections', status: 'PASS', details: 'Listed connections successfully' });
    } else {
      results.push({ endpoint: 'GET /api/connections', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/connections', status: 'FAIL', details: err.message });
  }

  // 19. POST /api/connections/:connectionId/messages
  if (connectionId) {
    try {
      const res = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ciphertext: 'dGVzdCBjaXBoZXJ0ZXh0',
          nonce: 'dGVzdCBub25jZQ==',
          version: 1,
          keyEpoch: 1
        })
      });
      const json: any = await res.json();
      if (res.status === 201 && json.success) {
        results.push({ endpoint: 'POST /api/connections/:connectionId/messages', status: 'PASS', details: 'Sent E2EE message successfully' });
      } else {
        results.push({ endpoint: 'POST /api/connections/:connectionId/messages', status: 'FAIL', details: JSON.stringify(json) });
      }
    } catch (err: any) {
      results.push({ endpoint: 'POST /api/connections/:connectionId/messages', status: 'FAIL', details: err.message });
    }
  } else {
    results.push({ endpoint: 'POST /api/connections/:connectionId/messages', status: 'SKIP', details: 'No connectionId available' });
  }

  // 20. GET /api/connections/:connectionId/messages
  if (connectionId) {
    try {
      const res = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        results.push({ endpoint: 'GET /api/connections/:connectionId/messages', status: 'PASS', details: 'Retrieved messages successfully' });
      } else {
        results.push({ endpoint: 'GET /api/connections/:connectionId/messages', status: 'FAIL', details: JSON.stringify(json) });
      }
    } catch (err: any) {
      results.push({ endpoint: 'GET /api/connections/:connectionId/messages', status: 'FAIL', details: err.message });
    }
  } else {
    results.push({ endpoint: 'GET /api/connections/:connectionId/messages', status: 'SKIP', details: 'No connectionId available' });
  }

  // 21. POST /api/connections/requests
  try {
    const res = await fetch(`${BASE_URL}/api/connections/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ receiverAgentId: 'AMR-9999-0000' })
    });
    const json: any = await res.json();
    if (res.status === 201 && json.success) {
      requestId = json.data.requestId || json.data.id;
      results.push({ endpoint: 'POST /api/connections/requests', status: 'PASS', details: `Created connection request successfully (ID: ${requestId})` });
    } else {
      results.push({ endpoint: 'POST /api/connections/requests', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'POST /api/connections/requests', status: 'FAIL', details: err.message });
  }

  // 22. GET /api/connections/requests
  try {
    const res = await fetch(`${BASE_URL}/api/connections/requests`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/connections/requests', status: 'PASS', details: 'Listed connection requests successfully' });
    } else {
      results.push({ endpoint: 'GET /api/connections/requests', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/connections/requests', status: 'FAIL', details: err.message });
  }

  // 23. POST /api/connections/requests/:requestId/accept
  if (requestId) {
    try {
      const res = await fetch(`${BASE_URL}/api/connections/requests/${requestId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        results.push({ endpoint: 'POST /api/connections/requests/:requestId/accept', status: 'PASS', details: 'Accepted connection request successfully' });
      } else {
        results.push({ endpoint: 'POST /api/connections/requests/:requestId/accept', status: 'FAIL', details: JSON.stringify(json) });
      }
    } catch (err: any) {
      results.push({ endpoint: 'POST /api/connections/requests/:requestId/accept', status: 'FAIL', details: err.message });
    }
  } else {
    results.push({ endpoint: 'POST /api/connections/requests/:requestId/accept', status: 'SKIP', details: 'No requestId available' });
  }

  // 24. POST /api/counter-party-score
  if (connectionId) {
    try {
      const res = await fetch(`${BASE_URL}/api/counter-party-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          connectionId,
          comment: 'Exceptional test evaluation comment.'
        })
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        reviewId = json.reviewId || json.review?.reviewId || json.data?.reviewId;
        results.push({ endpoint: 'POST /api/counter-party-score', status: 'PASS', details: `Submitted counterparty score successfully (Review ID: ${reviewId})` });
      } else {
        results.push({ endpoint: 'POST /api/counter-party-score', status: 'FAIL', details: JSON.stringify(json) });
      }
    } catch (err: any) {
      results.push({ endpoint: 'POST /api/counter-party-score', status: 'FAIL', details: err.message });
    }
  } else {
    results.push({ endpoint: 'POST /api/counter-party-score', status: 'SKIP', details: 'No connectionId available' });
  }

  // 25. GET /api/counter-party-score
  if (connectionId) {
    try {
      const res = await fetch(`${BASE_URL}/api/counter-party-score?connectionId=${connectionId}`);
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        results.push({ endpoint: 'GET /api/counter-party-score', status: 'PASS', details: 'Retrieved counterparty scores successfully' });
      } else {
        results.push({ endpoint: 'GET /api/counter-party-score', status: 'FAIL', details: JSON.stringify(json) });
      }
    } catch (err: any) {
      results.push({ endpoint: 'GET /api/counter-party-score', status: 'FAIL', details: err.message });
    }
  } else {
    results.push({ endpoint: 'GET /api/counter-party-score', status: 'SKIP', details: 'No connectionId available' });
  }

  // 26. GET /api/adk
  try {
    const res = await fetch(`${BASE_URL}/api/adk`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/adk', status: 'PASS', details: 'Retrieved ADK spec successfully' });
    } else {
      results.push({ endpoint: 'GET /api/adk', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/adk', status: 'FAIL', details: err.message });
  }

  // 27. GET /api/agent/footprints
  try {
    const res = await fetch(`${BASE_URL}/api/agent/footprints`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/agent/footprints', status: 'PASS', details: 'Retrieved agent footprints successfully' });
    } else {
      results.push({ endpoint: 'GET /api/agent/footprints', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/agent/footprints', status: 'FAIL', details: err.message });
  }

  // 28. GET /api/webhooks/events
  try {
    const res = await fetch(`${BASE_URL}/api/webhooks/events`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      results.push({ endpoint: 'GET /api/webhooks/events', status: 'PASS', details: 'Retrieved webhook events successfully' });
    } else {
      results.push({ endpoint: 'GET /api/webhooks/events', status: 'FAIL', details: JSON.stringify(json) });
    }
  } catch (err: any) {
    results.push({ endpoint: 'GET /api/webhooks/events', status: 'FAIL', details: err.message });
  }

  // Cleanup Deletions
  if (reviewId) {
    try { await fetch(`${BASE_URL}/api/counter-party-score/${reviewId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }); } catch (e) {}
  }
  if (connectionId) {
    try { await fetch(`${BASE_URL}/api/connections/${connectionId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }); } catch (e) {}
  }
  if (replyId) {
    try { await fetch(`${BASE_URL}/api/replies/${replyId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }); } catch (e) {}
  }
  if (postId) {
    try { await fetch(`${BASE_URL}/api/posts/${postId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }); } catch (e) {}
  }

  // Print Summary Table
  console.log('\n============================================================');
  console.log(' AAMARVA API ENDPOINTS TEST RESULTS');
  console.log('============================================================');
  for (const r of results) {
    const statusTag = r.status === 'PASS' ? '[PASS]' : r.status === 'SKIP' ? '[SKIP]' : '[FAIL]';
    console.log(`${statusTag} ${r.endpoint} -> ${r.details}`);
  }
  console.log('============================================================\n');
}

runTests();
