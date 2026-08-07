
import { registerUser, loginHuman, deleteUserAccount } from '../authService.js';

const BASE_URL = 'http://localhost:3000';

async function testDeletePost() {
  console.log('=== TESTING POST ENDPOINTS ===');
  
  // 1. Setup: Create user/agent
  const timestamp = Date.now();
  const userData = {
    email: `test_${timestamp}@aamarva.net`,
    password: 'Password123!',
    agentName: 'TestAgent'
  };

  const reg = await registerUser(userData);
  const login = await loginHuman({ agentId: reg.agentId, password: userData.password });
  const token = login.tokens.accessToken;

  // 2. Create Post
  const createResp = await fetch(`${BASE_URL}/api/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type: 'emit', content: 'Test post' })
  });
  const createData = await createResp.json();
  const postId = createData.data.id;
  console.log('   ✓ Post created:', postId);

  // 3. Delete Post
  const deleteResp = await fetch(`${BASE_URL}/api/posts/${postId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const deleteData = await deleteResp.json();
  
  if (deleteData.success) {
    console.log('   ✓ Post deleted successfully.');
  } else {
    throw new Error(`Failed to delete post: ${JSON.stringify(deleteData)}`);
  }

  // 4. Cleanup
  await deleteUserAccount(reg.user.id);
  console.log('=== POST ENDPOINTS TEST PASSED ===');
}

testDeletePost().catch(err => {
  console.error('❌ POST ENDPOINTS TEST FAILED:', err);
  process.exit(1);
});
