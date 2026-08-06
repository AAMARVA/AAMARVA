
import {
  registerUser,
  loginHuman,
  deleteUserAccount,
} from '../authService.js';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function testAllEndpoints() {
  console.log('=== STARTING ALL ENDPOINTS AUDIT ===\n');

  const timestamp = Date.now();
  
  // 1. Setup: Register & Login
  console.log('[1] Testing Auth...');
  const regData = {
    email: `test_${timestamp}@aamarva.net`,
    password: 'Password123!',
    agentName: 'TestAgent'
  };
  const reg = await registerUser(regData);
  const login = await loginHuman({ agentId: reg.agentId, password: regData.password });
  const token = login.tokens.accessToken;
  console.log('   ✓ Registered and Logged in.');

  // Check email
  const checkEmail = await (await fetch(`${BASE_URL}/api/auth/check-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: regData.email })
  })).json() as any;
  if (!checkEmail.success) throw new Error('Check email failed');
  console.log('   ✓ Check email working.');

  // 2. Profile
  console.log('[2] Testing Profile/Agents...');
  // GET /api/agents/me
  const profile = await (await fetch(`${BASE_URL}/api/agents/me`, { headers: { 'Authorization': `Bearer ${token}` } })).json() as any;
  if (!profile.success) throw new Error('Profile GET failed');
  console.log('   ✓ Profile GET working.');

  // GET /api/agents
  const agents = await (await fetch(`${BASE_URL}/api/agents`)).json() as any;
  if (!agents.success) throw new Error('Agents GET failed');
  console.log('   ✓ Agents GET working.');

  // 3. Posts
  console.log('[3] Testing Posts...');
  // POST
  const createPost = await (await fetch(`${BASE_URL}/api/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type: 'emit', category: 'general', content: 'Test post' })
  })).json() as any;
  const postId = createPost.data.id;
  console.log('   ✓ Post created.');

  // GET
  const listPosts = await (await fetch(`${BASE_URL}/api/posts`, { headers: { 'Authorization': `Bearer ${token}` } })).json() as any;
  if (!listPosts.success) throw new Error('Posts GET failed');
  console.log('   ✓ Posts GET working.');

  // DELETE
  const deletePost = await (await fetch(`${BASE_URL}/api/posts/${postId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  })).json() as any;
  if (!deletePost.success) throw new Error('Post DELETE failed');
  console.log('   ✓ Post DELETE working.');

  // 4. ADK & Stats
  console.log('[4] Testing ADK & Stats...');
  const adk = await (await fetch(`${BASE_URL}/api/adk`)).json() as any;
  if (!adk.success) throw new Error('ADK GET failed');
  console.log('   ✓ ADK GET working.');

  const stats = await (await fetch(`${BASE_URL}/api/stats`)).json() as any;
  if (!stats.success) throw new Error('Stats GET failed');
  console.log('   ✓ Stats GET working.');

  // 5. Cleanup & Auth Final
  console.log('[5] Testing Logout & Cleanup...');
  // Logout
  const logoutResp = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const logoutText = await logoutResp.text();
  let logout;
  try {
    logout = JSON.parse(logoutText);
  } catch (e) {
    throw new Error('Logout failed, response was not JSON: ' + logoutText);
  }
  if (!logout.success) {
    console.error('Logout error response:', logout);
    if (logout.error && logout.error.stack) {
      console.error('Logout error stack:', logout.error.stack);
    }
    throw new Error('Logout failed: ' + JSON.stringify(logout));
  }
  console.log('   ✓ Logout working.');

  // DELETE /api/agents/me (using fresh login)
  const login2 = await loginHuman({ agentId: reg.agentId, password: regData.password });
  const token2 = login2.tokens.accessToken;
  const deleteAcc = await (await fetch(`${BASE_URL}/api/agents/me`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token2}` }
  })).json() as any;
  if (!deleteAcc.success) throw new Error('Account DELETE failed');
  console.log('   ✓ Account DELETE working.');

  console.log('\n=== ALL ENDPOINTS AUDIT PASSED ===\n');
}

testAllEndpoints().catch(err => {
  console.error('❌ AUDIT FAILED:', err);
  process.exit(1);
});
