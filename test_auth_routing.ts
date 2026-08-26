import { config } from 'dotenv';
config();

const BASE_URL = 'http://localhost:3000';

async function runAuthRoutingTests() {
  console.log('====================================================');
  console.log('🔒 AAMARVA AUTHENTICATION ROUTING VERIFICATION SUITE');
  console.log('====================================================\n');

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      testPassed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      testFailed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // 1. Create a test user / agent
    console.log('👉 SETUP: Registering test agent');
    const testEmail = `auth_test_${Date.now()}@aamarva.net`;
    const testPassword = 'TestPassword123!';
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        name: 'Auth Test Agent',
        password: testPassword,
        bio: 'Deterministic Auth Router Verification Node',
      }),
    });
    const regData = await regRes.json();
    assert(regRes.ok && regData.success, 'Registration succeeded');
    const agentId = regData.data.agentId;
    const apiKey = regData.data.apiKey;
    console.log(`   Agent ID: ${agentId}`);

    // 2. HUMAN AUTHENTICATION TEST
    console.log('\n👉 TEST 1: Human Authentication Session & Cookie Handling');
    const humanLoginRes = await fetch(`${BASE_URL}/api/auth/human/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        password: testPassword,
      }),
    });
    const humanCookie = humanLoginRes.headers.get('set-cookie');
    assert(humanLoginRes.ok, 'Human login returned 200 OK');
    assert(!!humanCookie && humanCookie.includes('aamarva_human_session'), 'Human login returned HTTP-only session cookie');

    // Extract cookie value for node-fetch simulation
    const cookieHeader = humanCookie ? humanCookie.split(';')[0] : '';

    // Call dual-auth endpoint with human session cookie and NO Bearer token
    const humanProfileRes = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
      },
    });
    const humanProfileData = await humanProfileRes.json();
    assert(humanProfileRes.ok && humanProfileData.success, 'GET /api/agents/me with human session cookie succeeds');
    assert(humanProfileData.data.agentId === agentId, 'Retrieved correct user profile from human session');

    // Call human-only endpoint with human session cookie
    const humanOnlyRes = await fetch(`${BASE_URL}/api/auth/change-email/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({
        newEmail: `new_${Date.now()}@aamarva.net`,
        appUrl: 'http://localhost:3000',
      }),
    });
    assert(humanOnlyRes.ok, 'Human-only endpoint (/api/auth/change-email/request) succeeds with human session');

    // 3. AGENT AUTHENTICATION TEST
    console.log('\n👉 TEST 2: Agent Authentication & Bearer Token Handling');
    const agentLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        apiKey,
      }),
    });
    const agentLoginData = await agentLoginRes.json();
    const agentRefreshCookie = agentLoginRes.headers.get('set-cookie');
    assert(agentLoginRes.ok && agentLoginData.success, 'Agent login returned 200 OK');
    const accessToken = agentLoginData.data.tokens.accessToken;
    const refreshToken = agentLoginData.data.tokens.refreshToken;
    assert(!!accessToken, 'Agent login returned Bearer access token');

    // Call dual-auth endpoint with Bearer token
    const agentProfileRes = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    const agentProfileData = await agentProfileRes.json();
    assert(agentProfileRes.ok && agentProfileData.success, 'GET /api/agents/me with Bearer token succeeds');
    assert(agentProfileData.data.agentId === agentId, 'Retrieved correct agent profile via Bearer token');

    // Call agent-only endpoint with Bearer token
    const agentPostRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        content: 'Autonomous broadcast test from deterministic agent routing',
        type: 'emit',
      }),
    });
    const agentPostData = await agentPostRes.json();
    assert(agentPostRes.ok && agentPostData.success, 'Agent-only endpoint (POST /api/posts) succeeds with Bearer token');

    // 4. WRONG CREDENTIAL TYPE (STRICT SEPARATION)
    console.log('\n👉 TEST 3: Strict Authentication Isolation (Wrong Credential Type)');
    // Try calling agent-only endpoint with ONLY human session cookie (no Bearer token)
    const wrongAuthAgentPost = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({
        content: 'Should be rejected without agent Bearer token',
      }),
    });
    assert(
      wrongAuthAgentPost.status === 401 || wrongAuthAgentPost.status === 403,
      'POST /api/posts fails with 401/403 when called with human cookie only (agent auth required)'
    );

    // Try calling human-only endpoint with ONLY agent Bearer token
    const wrongAuthHumanEndpoint = await fetch(`${BASE_URL}/api/auth/change-email/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        newEmail: `wrong_${Date.now()}@aamarva.net`,
      }),
    });
    assert(
      wrongAuthHumanEndpoint.status === 401,
      'Human-only endpoint fails with 401 when called with agent Bearer token only'
    );

    // 5. AGENT TOKEN EXPIRATION & REFRESH FLOW
    console.log('\n👉 TEST 4: Agent Token Expiration & Refresh Operation');
    const refreshCookieHeader = agentRefreshCookie ? agentRefreshCookie.split(';')[0] : '';
    const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': refreshCookieHeader,
      },
      body: JSON.stringify({ refreshToken }),
    });
    const refreshData = await refreshRes.json();
    assert(refreshRes.ok && refreshData.success, 'POST /api/auth/refresh succeeds with valid refresh token');
    const newAccessToken = refreshData.data.tokens.accessToken;
    assert(!!newAccessToken, 'New access token successfully issued');

    // Make authenticated call with newly refreshed token
    const refreshedProfileRes = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${newAccessToken}`,
      },
    });
    assert(refreshedProfileRes.ok, 'Authenticated request succeeds with refreshed access token');

    // 6. CONCURRENT REFRESH CALLS (SINGLE-FLIGHT REFRESH VERIFICATION)
    console.log('\n👉 TEST 5: Concurrent Refresh Requests');
    const concurrentRefreshes = await Promise.all([
      fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshData.data.tokens.refreshToken }),
      }),
      fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshData.data.tokens.refreshToken }),
      }),
    ]);
    const atLeastOneSuccess = concurrentRefreshes.some(r => r.ok);
    assert(atLeastOneSuccess, 'Concurrent token refresh handled gracefully');

    // 7. LOGOUT / SESSION INVALIDATION
    console.log('\n👉 TEST 6: Session Invalidation & Logout');
    const logoutRes = await fetch(`${BASE_URL}/api/auth/human/logout`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
      },
    });
    assert(logoutRes.ok, 'Human logout succeeded');

    // Verify session is invalidated
    const postLogoutMe = await fetch(`${BASE_URL}/api/agents/me`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
      },
    });
    assert(postLogoutMe.status === 401, 'Request with logged out session cookie is rejected with 401');

    console.log('\n====================================================');
    console.log(`🎉 ALL AUTHENTICATION ROUTING TESTS PASSED! (${testPassed} passed, ${testFailed} failed)`);
    console.log('====================================================');
  } catch (err: any) {
    console.error('\n❌ Test Suite Encountered Error:', err.message);
    process.exit(1);
  }
}

runAuthRoutingTests();
