import { config } from 'dotenv';
config();
import jwt from 'jsonwebtoken';

// Note: set frontendConfig if needed
import {
  apiFetch,
  apiFetchAgent,
  apiFetchHuman,
  apiFetchPublic,
  setAccessToken,
  getAccessToken,
  setRefreshToken,
  getRefreshToken,
  loginAgentApi,
  loginUserApi,
  logoutAgentApi,
  logoutHumanApi,
  rotateApiKey,
} from './src/services/authApi';

const BASE_URL = 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'aamarva-dev-jwt-secret-key-at-least-32-chars-long';

async function runComprehensiveVerification() {
  console.log('================================================================');
  console.log('🔒 AAMARVA COMPREHENSIVE AUTHENTICATION & REFRESH VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
      throw new Error(`Assertion Failed: ${name}`);
    }
  }

  try {
    // ---------------------------------------------------------
    // SETUP: Register test agent / human account
    // ---------------------------------------------------------
    console.log('👉 SETUP: Registering test accounts for verification');
    const testEmail = `verify_auth_${Date.now()}@aamarva.net`;
    const testPassword = 'TestPassword123!';
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        name: 'Verification Master Agent',
        password: testPassword,
        bio: 'Automated Auth Router & Refresh Verifier',
      }),
    });
    const regData = await regRes.json();
    assert(regRes.ok && regData.success, 'Registration succeeded');
    const agentId = regData.data.agentId;
    const initialApiKey = regData.data.apiKey;
    const regSetCookie = regRes.headers.get('set-cookie');
    const humanCookie = regSetCookie ? regSetCookie.split(';')[0] : '';
    console.log(`   Registered Agent ID: ${agentId}`);

    // ---------------------------------------------------------
    // 1. HUMAN AUTHENTICATION & ENDPOINT BOUNDARY
    // ---------------------------------------------------------
    console.log('\n👉 1. HUMAN AUTHENTICATION & BOUNDARIES');
    
    // Human login
    const humanLoginRes = await fetch(`${BASE_URL}/api/auth/human/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, password: testPassword }),
    });
    assert(humanLoginRes.ok, 'Human login returns 200 OK');
    const humanLoginCookie = humanLoginRes.headers.get('set-cookie')?.split(';')[0] || '';
    assert(humanLoginCookie.includes('aamarva_human_session'), 'Human login sets HttpOnly human session cookie');

    // Human session -> Human-only endpoint (POST /api/auth/change-email/request)
    const humanOnlyRes = await fetch(`${BASE_URL}/api/auth/change-email/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': humanLoginCookie },
      body: JSON.stringify({ newEmail: `new_${Date.now()}@aamarva.net`, appUrl: BASE_URL }),
    });
    assert(humanOnlyRes.ok, 'Human session -> Human-only endpoint -> SUCCESS');

    // Human session -> Dual-auth endpoint (GET /api/agents/me)
    const humanDualRes = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'GET',
      headers: { 'Cookie': humanLoginCookie },
    });
    const humanDualData = await humanDualRes.json();
    assert(humanDualRes.ok && humanDualData.data?.agentId === agentId, 'Human session -> Dual-auth endpoint (GET /api/agents/me) -> SUCCESS');

    // Human session -> Agent-only endpoint (POST /api/posts) -> REJECTED
    const humanWrongAgentPost = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': humanLoginCookie },
      body: JSON.stringify({ content: 'Invalid human attempt on agent endpoint', type: 'emit' }),
    });
    assert(humanWrongAgentPost.status === 401 || humanWrongAgentPost.status === 403, 'Human session -> Agent-only endpoint -> REJECTED (401/403)');

    // ---------------------------------------------------------
    // 2. AGENT AUTHENTICATION & ENDPOINT BOUNDARY
    // ---------------------------------------------------------
    console.log('\n👉 2. AGENT AUTHENTICATION & BOUNDARIES');

    // Agent login
    const agentLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, apiKey: initialApiKey }),
    });
    const agentLoginData = await agentLoginRes.json();
    assert(agentLoginRes.ok && agentLoginData.success, 'Agent login returns 200 OK');
    const agentAccessToken = agentLoginData.data.tokens.accessToken;
    const agentRefreshToken = agentLoginData.data.tokens.refreshToken;
    const agentRefreshCookie = agentLoginRes.headers.get('set-cookie')?.split(';')[0] || '';

    // Agent token -> Agent-only endpoint (POST /api/posts)
    const agentPostRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentAccessToken}`,
      },
      body: JSON.stringify({ content: 'Autonomous agent verified broadcast', type: 'emit' }),
    });
    assert(agentPostRes.ok, 'Agent token -> Agent-only endpoint (POST /api/posts) -> SUCCESS');

    // Agent token -> Dual-auth endpoint (GET /api/agents/me)
    const agentDualRes = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${agentAccessToken}` },
    });
    const agentDualData = await agentDualRes.json();
    assert(agentDualRes.ok && agentDualData.data?.agentId === agentId, 'Agent token -> Dual-auth endpoint (GET /api/agents/me) -> SUCCESS');

    // Agent token -> Human-only endpoint (POST /api/auth/change-email/request) -> REJECTED
    const agentWrongHumanReq = await fetch(`${BASE_URL}/api/auth/change-email/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentAccessToken}`,
      },
      body: JSON.stringify({ newEmail: `new_${Date.now()}@aamarva.net` }),
    });
    assert(agentWrongHumanReq.status === 401, 'Agent token -> Human-only endpoint -> REJECTED (401)');

    // ---------------------------------------------------------
    // 3. UNAUTHENTICATED & MALFORMED REQUEST BOUNDARIES
    // ---------------------------------------------------------
    console.log('\n👉 3. UNAUTHENTICATED & MALFORMED BOUNDARIES');

    // No credentials -> Protected agent endpoint -> REJECTED
    const noCredAgent = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'No credentials' }),
    });
    assert(noCredAgent.status === 401, 'No credentials -> Protected agent endpoint -> REJECTED (401)');

    // No credentials -> Dual auth endpoint -> REJECTED
    const noCredDual = await fetch(`${BASE_URL}/api/agents/me`, { method: 'GET' });
    assert(noCredDual.status === 401, 'No credentials -> Dual-auth endpoint -> REJECTED (401)');

    // Malformed Authorization header -> REJECTED
    const malformedAuth = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'GET',
      headers: { 'Authorization': 'Basic invalid-credentials-string' },
    });
    assert(malformedAuth.status === 401, 'Malformed Authorization header -> REJECTED (401)');

    // Invalid JWT token -> REJECTED
    const invalidJwt = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature' },
    });
    assert(invalidJwt.status === 401, 'Invalid JWT token -> REJECTED (401)');

    // Expired JWT token -> REJECTED
    const expiredToken = jwt.sign(
      { agentId, role: 'agent', iat: Math.floor(Date.now() / 1000) - 3600, exp: Math.floor(Date.now() / 1000) - 1800 },
      JWT_SECRET
    );
    const expiredRes = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${expiredToken}` },
    });
    assert(expiredRes.status === 401, 'Expired JWT token -> REJECTED (401)');

    // ---------------------------------------------------------
    // 4. REAL FRONTEND apiFetchAgent() AUTOMATIC REFRESH FLOW
    // ---------------------------------------------------------
    console.log('\n👉 4. FRONTEND apiFetchAgent() AUTOMATIC SINGLE-FLIGHT REFRESH');

    // Configure the in-memory frontend client with an EXPIRED access token and VALID refresh token
    setAccessToken(expiredToken);
    setRefreshToken(agentRefreshToken);

    // Instrument fetch to count refresh HTTP requests
    let singleRefreshRequestCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input && (input as any).url) || '';
      if (url.includes('/api/auth/refresh')) {
        singleRefreshRequestCount++;
      }
      return originalFetch(input, init);
    };

    let autoRefreshedProfile;
    try {
      // Call apiFetchAgent with the expired token in memory
      // apiFetchAgent should:
      // 1. Send request with expired token -> 401
      // 2. Automatically invoke POST /api/auth/refresh
      // 3. Update in-memory access token & rotated refresh token
      // 4. Retry the original request once
      // 5. Succeed and return the profile data
      autoRefreshedProfile = await apiFetchAgent(`${BASE_URL}/api/agents/me`, { method: 'GET' });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert(
      autoRefreshedProfile.success && autoRefreshedProfile.data?.agentId === agentId,
      'apiFetchAgent() with expired token automatically refreshes and retries successfully'
    );
    assert(singleRefreshRequestCount === 1, 'Exactly ONE refresh HTTP request was initiated during single refresh');

    const rotatedAccessToken1 = getAccessToken();
    assert(rotatedAccessToken1 !== expiredToken && !!rotatedAccessToken1, 'Refreshed access token saved in in-memory state');
    const rotatedRefreshToken1 = getRefreshToken();
    assert(!!rotatedRefreshToken1 && rotatedRefreshToken1 !== agentRefreshToken, 'Refreshed refresh token was rotated and updated in in-memory state');

    // ---------------------------------------------------------
    // 5. CONCURRENT EXPIRED-TOKEN REQUESTS & SINGLE-FLIGHT REFRESH
    // ---------------------------------------------------------
    console.log('\n👉 5. CONCURRENT REQUESTS SINGLE-FLIGHT REFRESH VERIFICATION');

    // Ensure we are using the CURRENT rotated refresh token from Section 4 (do NOT reuse old consumed token)
    const currentRefreshTokenBeforeConcurrency = getRefreshToken();
    assert(
      !!currentRefreshTokenBeforeConcurrency && currentRefreshTokenBeforeConcurrency === rotatedRefreshToken1,
      'Concurrency test uses CURRENT valid rotated refresh token from application state'
    );

    // Reset access token to an expired token to force refresh across all 5 concurrent calls
    setAccessToken(expiredToken);

    // Instrument fetch to:
    // 1. Count refresh HTTP requests (MUST be exactly 1)
    // 2. Add an artificial delay to the refresh HTTP request to simulate real-world latency
    //    and guarantee all 5 concurrent requests hit 401 and encounter the active refreshPromise
    let concurrencyRefreshRequestCount = 0;
    const retryAuthHeaders: string[] = [];

    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input && (input as any).url) || '';
      if (url.includes('/api/auth/refresh')) {
        concurrencyRefreshRequestCount++;
        // Asynchronous timing pressure: delay the refresh response so all 5 concurrent requests hit the refresh barrier
        await new Promise(r => setTimeout(r, 60));
      } else if (url.includes('/api/agents/me') && init && init.headers) {
        const headers = new Headers(init.headers as any);
        const authHdr = headers.get('Authorization');
        if (authHdr && authHdr !== `Bearer ${expiredToken}`) {
          retryAuthHeaders.push(authHdr);
        }
      }
      return originalFetch(input, init);
    };

    let concurrentResults: any[] = [];
    try {
      console.log('   Sending 5 simultaneous agent requests with expired access token...');
      concurrentResults = await Promise.all([
        apiFetchAgent(`${BASE_URL}/api/agents/me`, { method: 'GET' }),
        apiFetchAgent(`${BASE_URL}/api/agents/me`, { method: 'GET' }),
        apiFetchAgent(`${BASE_URL}/api/agents/me`, { method: 'GET' }),
        apiFetchAgent(`${BASE_URL}/api/agents/me`, { method: 'GET' }),
        apiFetchAgent(`${BASE_URL}/api/agents/me`, { method: 'GET' }),
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const [resA, resB, resC, resD, resE] = concurrentResults;

    assert(
      concurrencyRefreshRequestCount === 1,
      `PROVEN: Exactly ONE refresh HTTP request occurred during 5 concurrent expired requests (count=${concurrencyRefreshRequestCount})`
    );
    assert(resA.success && resA.data?.agentId === agentId, 'Concurrent Request A succeeded after single refresh');
    assert(resB.success && resB.data?.agentId === agentId, 'Concurrent Request B succeeded after single refresh');
    assert(resC.success && resC.data?.agentId === agentId, 'Concurrent Request C succeeded after single refresh');
    assert(resD.success && resD.data?.agentId === agentId, 'Concurrent Request D succeeded after single refresh');
    assert(resE.success && resE.data?.agentId === agentId, 'Concurrent Request E succeeded after single refresh');
    assert(retryAuthHeaders.length === 5, 'All 5 original requests retried with the newly issued access token');

    const rotatedAccessToken2 = getAccessToken();
    assert(rotatedAccessToken2 !== expiredToken && !!rotatedAccessToken2, 'New access token updated after concurrency refresh');
    const rotatedRefreshToken2 = getRefreshToken();
    assert(!!rotatedRefreshToken2 && rotatedRefreshToken2 !== currentRefreshTokenBeforeConcurrency, 'Refresh token rotated again during concurrency refresh');

    // ---------------------------------------------------------
    // 6. FAILED REFRESH DETERMINISTIC REJECTION
    // ---------------------------------------------------------
    console.log('\n👉 6. FAILED REFRESH DETERMINISTIC REJECTION');

    // Set invalid tokens in memory
    setAccessToken(expiredToken);
    setRefreshToken('invalid_refresh_token_string');

    let failedRefreshRequestCount = 0;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input && (input as any).url) || '';
      if (url.includes('/api/auth/refresh')) {
        failedRefreshRequestCount++;
      }
      return originalFetch(input, init);
    };

    let refreshFailedCaught = false;
    try {
      await apiFetchAgent(`${BASE_URL}/api/agents/me`, { method: 'GET' });
    } catch (err: any) {
      refreshFailedCaught = true;
      const lower = err.message.toLowerCase();
      assert(lower.includes('401') || lower.includes('unauthorized') || lower.includes('token') || lower.includes('refresh') || lower.includes('agent'), `Deterministic error thrown on failed refresh: ${err.message}`);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert(refreshFailedCaught, 'apiFetchAgent() deterministically throws on invalid refresh token without infinite loop');
    assert(failedRefreshRequestCount === 1, 'Refresh request count did not continue increasing indefinitely (count=1)');

    // ---------------------------------------------------------
    // 7. API-KEY ROTATION BEHAVIOR
    // ---------------------------------------------------------
    console.log('\n👉 7. API-KEY ROTATION & INVALIDATION');

    // Perform human login to obtain a fresh session for key rotation
    const freshHumanLogin = await fetch(`${BASE_URL}/api/auth/human/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, password: testPassword }),
    });
    const freshHumanCookie = freshHumanLogin.headers.get('set-cookie')?.split(';')[0] || '';

    // Rotate API key
    const rotateRes = await fetch(`${BASE_URL}/api/auth/agent/rotate-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': freshHumanCookie },
      body: JSON.stringify({ password: testPassword }),
    });
    const rotateData = await rotateRes.json();
    assert(rotateRes.ok && rotateData.success && !!rotateData.data?.apiKey, 'API-key rotation request succeeded');
    const newApiKey = rotateData.data.apiKey;
    assert(newApiKey !== initialApiKey, 'New API key differs from old API key');

    // Verify OLD API key is rejected
    const oldKeyLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, apiKey: initialApiKey }),
    });
    assert(oldKeyLoginRes.status === 401, 'Old API key is immediately REJECTED (401)');

    // Verify NEW API key is accepted
    const newKeyLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, apiKey: newApiKey }),
    });
    const newKeyLoginData = await newKeyLoginRes.json();
    assert(newKeyLoginRes.ok && newKeyLoginData.success, 'New rotated API key is ACCEPTED (200 OK)');

    // ---------------------------------------------------------
    // 8. LOGOUT & SESSION INVALIDATION
    // ---------------------------------------------------------
    console.log('\n👉 8. LOGOUT & SESSION INVALIDATION');

    // Human Logout
    const logoutHumanRes = await fetch(`${BASE_URL}/api/auth/human/logout`, {
      method: 'POST',
      headers: { 'Cookie': freshHumanCookie },
    });
    assert(logoutHumanRes.ok, 'Human logout returns 200 OK');

    // Verify invalidated session cookie cannot access protected endpoints
    const postLogoutHumanCheck = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'GET',
      headers: { 'Cookie': freshHumanCookie },
    });
    assert(postLogoutHumanCheck.status === 401, 'Logged-out human session cookie is REJECTED (401)');

    // Agent Logout
    const agentFreshTokens = newKeyLoginData.data.tokens;
    const logoutAgentRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${agentFreshTokens.accessToken}` },
    });
    assert(logoutAgentRes.ok, 'Agent logout returns 200 OK');

    console.log('\n================================================================');
    console.log(`🎉 ALL AUTHENTICATION & REFRESH TESTS PASSED! (${passed} passed, ${failed} failed)`);
    console.log('================================================================');
  } catch (err: any) {
    console.error('\n❌ Comprehensive Verification Aborted with Error:', err.message);
    process.exit(1);
  }
}

runComprehensiveVerification();
