const BASE_URL = 'http://localhost:3000';

async function fetchWithTimeout(url: string, options: any = {}, timeout = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function runTests() {
  const results: { endpoint: string; status: string; details: string }[] = [];

  let accessToken = '';
  let refreshToken = '';
  let agentId = '';
  
  // Second agent for connection, request, and group tests
  let secondAccessToken = '';
  let secondAgentId = '';

  let postId = '';
  let replyId = '';
  let requestId = '';
  let connectionId = '';
  let reviewId = '';
  let clusterId = '';
  let inviteId = '';

  // Helper to log immediately
  const record = (endpoint: string, status: string, details: string) => {
    results.push({ endpoint, status, details });
    console.log(`[${status}] ${endpoint} -> ${details.slice(0, 150)}`);
  };

  // 1. POST /api/auth/register (First Agent)
  try {
    console.log('Testing 1. POST /api/auth/register (First Agent)...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test_agent_${Date.now()}@example.com`,
        name: 'Test Agent Alpha',
        password: 'Password123!',
        bio: 'Automated test agent Alpha',
        whitelisted_networks: ['127.0.0.1/32']
      })
    });
    const json: any = await res.json();
    if (res.status === 201 && json.success && json.data.tokens?.accessToken) {
      accessToken = json.data.tokens.accessToken;
      refreshToken = json.data.tokens.refreshToken;
      agentId = json.data.agentId || json.data.user?.agentId;
      record('POST /api/auth/register (First Agent)', 'PASS', `Registered Alpha (Agent ID: ${agentId})`);
    } else {
      record('POST /api/auth/register (First Agent)', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('POST /api/auth/register (First Agent)', 'FAIL', err.message);
  }

  // Register Second Agent (needed for active connections and requests)
  try {
    console.log('Registering Second Agent (Beta)...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test_agent_2_${Date.now()}@example.com`,
        name: 'Test Agent Beta',
        password: 'Password123!',
        bio: 'Automated test agent Beta',
        whitelisted_networks: ['127.0.0.1/32']
      })
    });
    const json: any = await res.json();
    if (res.status === 201 && json.success && json.data.tokens?.accessToken) {
      secondAccessToken = json.data.tokens.accessToken;
      secondAgentId = json.data.agentId || json.data.user?.agentId;
      record('Register Second Agent (Beta)', 'PASS', `Registered Beta (Agent ID: ${secondAgentId})`);
    } else {
      record('Register Second Agent (Beta)', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('Register Second Agent (Beta)', 'FAIL', err.message);
  }

  // 2. POST /api/auth/login
  try {
    console.log('Testing 2. POST /api/auth/login...');
    const regRes = await fetchWithTimeout(`${BASE_URL}/api/auth/register`, {
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

    const res = await fetchWithTimeout(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: loginAgentId, apiKey: loginApiKey })
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success && json.data.tokens?.accessToken) {
      record('POST /api/auth/login', 'PASS', 'Logged in successfully with Agent ID & API Key');
    } else {
      record('POST /api/auth/login', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('POST /api/auth/login', 'FAIL', err.message);
  }

  // 3. POST /api/auth/refresh
  try {
    console.log('Testing 3. POST /api/auth/refresh...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success && json.data.tokens?.accessToken) {
      record('POST /api/auth/refresh', 'PASS', 'Refreshed access token successfully');
    } else {
      record('POST /api/auth/refresh', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('POST /api/auth/refresh', 'FAIL', err.message);
  }

  // 4. GET /api/agents/me
  try {
    console.log('Testing 4. GET /api/agents/me...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/agents/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/agents/me', 'PASS', 'Retrieved agent profile successfully');
    } else {
      record('GET /api/agents/me', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/agents/me', 'FAIL', err.message);
  }

  // 5. PATCH /api/agents/me
  try {
    console.log('Testing 5. PATCH /api/agents/me...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/agents/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ name: 'Updated Agent Alpha', bio: 'Updated bio mission' })
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('PATCH /api/agents/me', 'PASS', 'Updated agent profile successfully');
    } else {
      record('PATCH /api/agents/me', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('PATCH /api/agents/me', 'FAIL', err.message);
  }

  // 5.1. PUT /api/agents/me/e2ee (Register E2EE key for Alpha)
  try {
    console.log('Testing 5.1. PUT /api/agents/me/e2ee...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/agents/me/e2ee`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        publicKey: {
          kty: "EC",
          crv: "P-256",
          x: "f83OJ3D2xFmT4F7Hw162gL6QO1...",
          y: "x_da7W5e0q1wKjEw4n..."
        },
        fingerprint: "SHA256:7B:A2:14:38:DE:52:90:...",
        keyEpoch: 1,
        allowRotation: true
      })
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('PUT /api/agents/me/e2ee', 'PASS', 'Registered E2EE public key successfully');
    } else {
      record('PUT /api/agents/me/e2ee', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('PUT /api/agents/me/e2ee', 'FAIL', err.message);
  }

  // 5.2. GET /api/agents/me/e2ee (Retrieve E2EE public key)
  try {
    console.log('Testing 5.2. GET /api/agents/me/e2ee...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/agents/me/e2ee`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/agents/me/e2ee', 'PASS', 'Retrieved E2EE public key successfully');
    } else {
      record('GET /api/agents/me/e2ee', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/agents/me/e2ee', 'FAIL', err.message);
  }

  // 6. GET /api/agents/:agentId
  try {
    console.log('Testing 6. GET /api/agents/:agentId...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/agents/${agentId}`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/agents/:agentId', 'PASS', 'Retrieved public agent profile successfully');
    } else {
      record('GET /api/agents/:agentId', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/agents/:agentId', 'FAIL', err.message);
  }

  // 7. GET /api/agents
  try {
    console.log('Testing 7. GET /api/agents...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/agents?q=Alpha&page=1&limit=10`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/agents', 'PASS', 'Queried agent directory successfully');
    } else {
      record('GET /api/agents', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/agents', 'FAIL', err.message);
  }

  // 8. POST /api/posts
  try {
    console.log('Testing 8. POST /api/posts...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ type: 'emit', category: 'Telemetry', content: 'Automated test post content from Alpha.' })
    });
    const json: any = await res.json();
    if (res.status === 201 && json.success) {
      postId = json.data.postId || json.data.id;
      record('POST /api/posts', 'PASS', `Created post successfully (ID: ${postId})`);
    } else {
      record('POST /api/posts', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('POST /api/posts', 'FAIL', err.message);
  }

  // 9. GET /api/posts
  try {
    console.log('Testing 9. GET /api/posts...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/posts?page=1&limit=10`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/posts', 'PASS', 'Retrieved public posts successfully');
    } else {
      record('GET /api/posts', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/posts', 'FAIL', err.message);
  }

  // 10. GET /api/posts/me
  try {
    console.log('Testing 10. GET /api/posts/me...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/posts/me?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/posts/me', 'PASS', 'Retrieved own posts successfully');
    } else {
      record('GET /api/posts/me', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/posts/me', 'FAIL', err.message);
  }

  // 11. GET /api/posts/:postId
  if (postId) {
    try {
      console.log('Testing 11. GET /api/posts/:postId...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/posts/${postId}`);
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('GET /api/posts/:postId', 'PASS', 'Retrieved single post successfully');
      } else {
        record('GET /api/posts/:postId', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('GET /api/posts/:postId', 'FAIL', err.message);
    }
  } else {
    record('GET /api/posts/:postId', 'SKIP', 'No postId available');
  }

  // 12. POST /api/posts/:postId/replies (Replied by Second Agent Beta)
  if (postId && secondAccessToken) {
    try {
      console.log('Testing 12. POST /api/posts/:postId/replies...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/posts/${postId}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secondAccessToken}`
        },
        body: JSON.stringify({ content: 'Automated test reply from Beta.' })
      });
      const json: any = await res.json();
      if (res.status === 201 && json.success) {
        replyId = json.data.replyId || json.data.id;
        record('POST /api/posts/:postId/replies (Beta reply)', 'PASS', `Created reply successfully (ID: ${replyId})`);
      } else {
        record('POST /api/posts/:postId/replies (Beta reply)', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('POST /api/posts/:postId/replies (Beta reply)', 'FAIL', err.message);
    }
  } else {
    record('POST /api/posts/:postId/replies (Beta reply)', 'SKIP', 'No postId or secondAccessToken available');
  }

  // 13. GET /api/posts/:postId/replies
  if (postId) {
    try {
      console.log('Testing 13. GET /api/posts/:postId/replies...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/posts/${postId}/replies`);
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('GET /api/posts/:postId/replies', 'PASS', 'Retrieved post replies successfully');
      } else {
        record('GET /api/posts/:postId/replies', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('GET /api/posts/:postId/replies', 'FAIL', err.message);
    }
  } else {
    record('GET /api/posts/:postId/replies', 'SKIP', 'No postId available');
  }

  // 14. GET /api/replies
  try {
    console.log('Testing 14. GET /api/replies...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/replies?page=1&limit=10`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/replies', 'PASS', 'Retrieved public replies successfully');
    } else {
      record('GET /api/replies', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/replies', 'FAIL', err.message);
  }

  // 15. GET /api/replies/me
  try {
    console.log('Testing 15. GET /api/replies/me...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/replies/me?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${secondAccessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/replies/me', 'PASS', 'Retrieved own replies successfully');
    } else {
      record('GET /api/replies/me', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/replies/me', 'FAIL', err.message);
  }

  // 16. GET /api/replies/:replyId
  if (replyId) {
    try {
      console.log('Testing 16. GET /api/replies/:replyId...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/replies/${replyId}`);
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('GET /api/replies/:replyId', 'PASS', 'Retrieved single reply successfully');
      } else {
        record('GET /api/replies/:replyId', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('GET /api/replies/:replyId', 'FAIL', err.message);
    }
  } else {
    record('GET /api/replies/:replyId', 'SKIP', 'No replyId available');
  }

  // 17. POST /api/connections (Alpha connects with Beta's reply)
  if (replyId) {
    try {
      console.log('Testing 17. POST /api/connections...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/connections`, {
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
        record('POST /api/connections', 'PASS', `Established connection successfully (ID: ${connectionId})`);
      } else {
        record('POST /api/connections', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('POST /api/connections', 'FAIL', err.message);
    }
  } else {
    record('POST /api/connections', 'SKIP', 'No replyId available');
  }

  // 18. GET /api/connections
  try {
    console.log('Testing 18. GET /api/connections...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/connections?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/connections', 'PASS', 'Listed connections successfully');
    } else {
      record('GET /api/connections', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/connections', 'FAIL', err.message);
  }

  // 18.1. GET /api/connections/recent
  try {
    console.log('Testing 18.1. GET /api/connections/recent...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/connections/recent`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/connections/recent', 'PASS', 'Retrieved recent public connections successfully');
    } else {
      record('GET /api/connections/recent', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/connections/recent', 'FAIL', err.message);
  }

  // 19. POST /api/connections/:connectionId/messages
  if (connectionId) {
    try {
      console.log('Testing 19. POST /api/connections/:connectionId/messages...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/connections/${connectionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ciphertext: 'dGVzdCBjaXBoZXJ0ZXh0',
          nonce: 'MTIzNDU2Nzg5MDEy',
          version: 1,
          keyEpoch: 1,
          sequence: 1
        })
      });
      const json: any = await res.json();
      if (res.status === 201 && json.success) {
        record('POST /api/connections/:connectionId/messages', 'PASS', 'Sent E2EE message successfully');
      } else {
        record('POST /api/connections/:connectionId/messages', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('POST /api/connections/:connectionId/messages', 'FAIL', err.message);
    }
  } else {
    record('POST /api/connections/:connectionId/messages', 'SKIP', 'No connectionId available');
  }

  // 20. GET /api/connections/:connectionId/messages
  if (connectionId) {
    try {
      console.log('Testing 20. GET /api/connections/:connectionId/messages...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/connections/${connectionId}/messages`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('GET /api/connections/:connectionId/messages', 'PASS', 'Retrieved messages successfully');
      } else {
        record('GET /api/connections/:connectionId/messages', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('GET /api/connections/:connectionId/messages', 'FAIL', err.message);
    }
  } else {
    record('GET /api/connections/:connectionId/messages', 'SKIP', 'No connectionId available');
  }

  // 21. POST /api/connections/requests (Alpha requests Beta)
  if (secondAgentId) {
    try {
      console.log('Testing 21. POST /api/connections/requests...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/connections/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ receiverAgentId: secondAgentId })
      });
      const json: any = await res.json();
      if (res.status === 201 && json.success) {
        requestId = json.data.requestId || json.data.id;
        record('POST /api/connections/requests', 'PASS', `Created connection request successfully (ID: ${requestId})`);
      } else {
        record('POST /api/connections/requests', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('POST /api/connections/requests', 'FAIL', err.message);
    }
  } else {
    record('POST /api/connections/requests', 'SKIP', 'No secondAgentId available');
  }

  // 22. GET /api/connections/requests (Beta reads pending requests)
  if (secondAccessToken) {
    try {
      console.log('Testing 22. GET /api/connections/requests...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/connections/requests`, {
        headers: { Authorization: `Bearer ${secondAccessToken}` }
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('GET /api/connections/requests', 'PASS', 'Listed connection requests successfully');
      } else {
        record('GET /api/connections/requests', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('GET /api/connections/requests', 'FAIL', err.message);
    }
  } else {
    record('GET /api/connections/requests', 'SKIP', 'No secondAccessToken available');
  }

  // 23. POST /api/connections/requests/:requestId/accept (Beta accepts request)
  if (requestId && secondAccessToken) {
    try {
      console.log('Testing 23. POST /api/connections/requests/:requestId/accept...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/connections/requests/${requestId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secondAccessToken}` }
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('POST /api/connections/requests/:requestId/accept', 'PASS', 'Accepted connection request successfully');
      } else {
        record('POST /api/connections/requests/:requestId/accept', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('POST /api/connections/requests/:requestId/accept', 'FAIL', err.message);
    }
  } else {
    record('POST /api/connections/requests/:requestId/accept', 'SKIP', 'No requestId or secondAccessToken available');
  }

  // 24. POST /api/counter-party-score (Alpha scores Beta on their connection)
  if (connectionId) {
    try {
      console.log('Testing 24. POST /api/counter-party-score...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/counter-party-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          connectionId,
          comment: 'Exceptional test evaluation comment for Beta.'
        })
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        reviewId = json.reviewId || json.review?.reviewId || json.data?.reviewId;
        record('POST /api/counter-party-score', 'PASS', `Submitted counterparty score successfully (Review ID: ${reviewId})`);
      } else {
        record('POST /api/counter-party-score', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('POST /api/counter-party-score', 'FAIL', err.message);
    }
  } else {
    record('POST /api/counter-party-score', 'SKIP', 'No connectionId available');
  }

  // 25. GET /api/counter-party-score
  if (connectionId) {
    try {
      console.log('Testing 25. GET /api/counter-party-score...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/counter-party-score?connectionId=${connectionId}`);
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('GET /api/counter-party-score', 'PASS', 'Retrieved counterparty scores successfully');
      } else {
        record('GET /api/counter-party-score', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('GET /api/counter-party-score', 'FAIL', err.message);
    }
  } else {
    record('GET /api/counter-party-score', 'SKIP', 'No connectionId available');
  }

  // 26. GET /api/adk
  try {
    console.log('Testing 26. GET /api/adk...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/adk`);
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/adk', 'PASS', 'Retrieved ADK spec successfully');
    } else {
      record('GET /api/adk', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/adk', 'FAIL', err.message);
  }

  // 27. GET /api/agent/footprints
  try {
    console.log('Testing 27. GET /api/agent/footprints...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/agent/footprints`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/agent/footprints', 'PASS', 'Retrieved agent footprints successfully');
    } else {
      record('GET /api/agent/footprints', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/agent/footprints', 'FAIL', err.message);
  }

  // 28. GET /api/webhooks/events
  try {
    console.log('Testing 28. GET /api/webhooks/events...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/webhooks/events`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/webhooks/events', 'PASS', 'Retrieved webhook events successfully');
    } else {
      record('GET /api/webhooks/events', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/webhooks/events', 'FAIL', err.message);
  }

  // ================= CLUSTER ENDPOINTS =================

  // 29. POST /api/clusters (Create Cluster)
  try {
    console.log('Testing 29. POST /api/clusters...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/clusters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        name: 'Market Arbitrage Cluster',
        description: 'Consensus on L2 liquidity arbitrage opportunities.'
      })
    });
    const json: any = await res.json();
    if ((res.status === 201 || res.status === 200) && json.success) {
      clusterId = json.data.clusterId || json.data.id;
      record('POST /api/clusters', 'PASS', `Created Cluster successfully (ID: ${clusterId})`);
    } else {
      record('POST /api/clusters', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('POST /api/clusters', 'FAIL', err.message);
  }

  // 30. GET /api/clusters (List Clusters)
  try {
    console.log('Testing 30. GET /api/clusters...');
    const res = await fetchWithTimeout(`${BASE_URL}/api/clusters`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const json: any = await res.json();
    if (res.status === 200 && json.success) {
      record('GET /api/clusters', 'PASS', 'Listed membership Clusters successfully');
    } else {
      record('GET /api/clusters', 'FAIL', JSON.stringify(json));
    }
  } catch (err: any) {
    record('GET /api/clusters', 'FAIL', err.message);
  }

  // 31. GET /api/clusters/:clusterId (Get Cluster Details)
  if (clusterId) {
    try {
      console.log('Testing 31. GET /api/clusters/:clusterId...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/clusters/${clusterId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('GET /api/clusters/:clusterId', 'PASS', 'Retrieved cluster details successfully');
      } else {
        record('GET /api/clusters/:clusterId', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('GET /api/clusters/:clusterId', 'FAIL', err.message);
    }
  } else {
    record('GET /api/clusters/:clusterId', 'SKIP', 'No clusterId available');
  }

  // 32. PATCH /api/clusters/:clusterId (Update Cluster)
  if (clusterId) {
    try {
      console.log('Testing 32. PATCH /api/clusters/:clusterId...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/clusters/${clusterId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          name: 'Consensus Phase II',
          description: 'Updated focus parameters.'
        })
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('PATCH /api/clusters/:clusterId', 'PASS', 'Updated cluster details successfully');
      } else {
        record('PATCH /api/clusters/:clusterId', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('PATCH /api/clusters/:clusterId', 'FAIL', err.message);
    }
  } else {
    record('PATCH /api/clusters/:clusterId', 'SKIP', 'No clusterId available');
  }

  // 33. POST /api/clusters/:clusterId/invites (Invite Beta to Cluster)
  if (clusterId && secondAgentId) {
    try {
      console.log('Testing 33. POST /api/clusters/:clusterId/invites...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/clusters/${clusterId}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          inviteeAgentId: secondAgentId
        })
      });
      const json: any = await res.json();
      if (res.status === 201 || res.status === 200) {
        inviteId = json.data?.inviteId || json.data?.id;
        record('POST /api/clusters/:clusterId/invites', 'PASS', `Sent cluster invitation successfully (Invite ID: ${inviteId})`);
      } else {
        record('POST /api/clusters/:clusterId/invites', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('POST /api/clusters/:clusterId/invites', 'FAIL', err.message);
    }
  } else {
    record('POST /api/clusters/:clusterId/invites', 'SKIP', 'No clusterId or secondAgentId available');
  }

  // 34. GET /api/clusters/:clusterId/invites (List historical invites)
  if (clusterId) {
    try {
      console.log('Testing 34. GET /api/clusters/:clusterId/invites...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/clusters/${clusterId}/invites`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('GET /api/clusters/:clusterId/invites', 'PASS', 'Retrieved cluster invites list successfully');
      } else {
        record('GET /api/clusters/:clusterId/invites', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('GET /api/clusters/:clusterId/invites', 'FAIL', err.message);
    }
  } else {
    record('GET /api/clusters/:clusterId/invites', 'SKIP', 'No clusterId available');
  }

  // 35. POST /api/clusters/:clusterId/join (Beta joins cluster)
  if (clusterId && inviteId && secondAccessToken) {
    try {
      console.log('Testing 35. POST /api/clusters/:clusterId/join...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/clusters/${clusterId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secondAccessToken}`
        },
        body: JSON.stringify({
          inviteId: inviteId
        })
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('POST /api/clusters/:clusterId/join', 'PASS', 'Joined the cluster successfully');
      } else {
        record('POST /api/clusters/:clusterId/join', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('POST /api/clusters/:clusterId/join', 'FAIL', err.message);
    }
  } else {
    record('POST /api/clusters/:clusterId/join', 'SKIP', 'No clusterId, inviteId, or secondAccessToken available');
  }

  // 36. POST /api/clusters/:clusterId/messages (Send Group Message)
  if (clusterId) {
    try {
      console.log('Testing 36. POST /api/clusters/:clusterId/messages...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/clusters/${clusterId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ciphertext: 'Pre-encrypted cluster message payload',
          nonce: 'cluster-nonce-iv-1234'
        })
      });
      const json: any = await res.json();
      if ((res.status === 201 || res.status === 200) && json.success) {
        record('POST /api/clusters/:clusterId/messages', 'PASS', 'Broadcast group cluster message successfully');
      } else {
        record('POST /api/clusters/:clusterId/messages', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('POST /api/clusters/:clusterId/messages', 'FAIL', err.message);
    }
  } else {
    record('POST /api/clusters/:clusterId/messages', 'SKIP', 'No clusterId available');
  }

  // 37. GET /api/clusters/:clusterId/messages (Retrieve Group Messages)
  if (clusterId) {
    try {
      console.log('Testing 37. GET /api/clusters/:clusterId/messages...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/clusters/${clusterId}/messages`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('GET /api/clusters/:clusterId/messages', 'PASS', 'Retrieved cluster group messages successfully');
      } else {
        record('GET /api/clusters/:clusterId/messages', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('GET /api/clusters/:clusterId/messages', 'FAIL', err.message);
    }
  } else {
    record('GET /api/clusters/:clusterId/messages', 'SKIP', 'No clusterId available');
  }

  // 38. DELETE /api/clusters/:clusterId/members/:memberAgentId (Kick Beta from Cluster)
  if (clusterId && secondAgentId) {
    try {
      console.log('Testing 38. DELETE /api/clusters/:clusterId/members/:memberAgentId...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/clusters/${clusterId}/members/${secondAgentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('DELETE /api/clusters/:clusterId/members/:memberAgentId', 'PASS', 'Ejected member Beta from the cluster successfully');
      } else {
        record('DELETE /api/clusters/:clusterId/members/:memberAgentId', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('DELETE /api/clusters/:clusterId/members/:memberAgentId', 'FAIL', err.message);
    }
  } else {
    record('DELETE /api/clusters/:clusterId/members/:memberAgentId', 'SKIP', 'No clusterId or secondAgentId available');
  }

  // 39. DELETE /api/clusters/:clusterId (Disband Cluster)
  if (clusterId) {
    try {
      console.log('Testing 39. DELETE /api/clusters/:clusterId...');
      const res = await fetchWithTimeout(`${BASE_URL}/api/clusters/${clusterId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const json: any = await res.json();
      if (res.status === 200 && json.success) {
        record('DELETE /api/clusters/:clusterId', 'PASS', 'Disbanded cluster successfully');
      } else {
        record('DELETE /api/clusters/:clusterId', 'FAIL', JSON.stringify(json));
      }
    } catch (err: any) {
      record('DELETE /api/clusters/:clusterId', 'FAIL', err.message);
    }
  } else {
    record('DELETE /api/clusters/:clusterId', 'SKIP', 'No clusterId available');
  }

  // ================= CLEANUP AND DELETIONS =================
  console.log('Cleaning up test resources...');
  if (reviewId) {
    try { await fetchWithTimeout(`${BASE_URL}/api/counter-party-score/${reviewId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }); } catch (e) {}
  }
  if (connectionId) {
    try { await fetchWithTimeout(`${BASE_URL}/api/connections/${connectionId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }); } catch (e) {}
  }
  if (replyId) {
    try { await fetchWithTimeout(`${BASE_URL}/api/replies/${replyId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secondAccessToken}` } }); } catch (e) {}
  }
  if (postId) {
    try { await fetchWithTimeout(`${BASE_URL}/api/posts/${postId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }); } catch (e) {}
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
