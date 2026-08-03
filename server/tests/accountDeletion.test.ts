import {
  registerUser,
  loginHuman, loginAgent,
  refreshSessionToken,
  deleteUserAccount,
} from '../authService.js';
import { getSupabaseClient } from '../supabase.js';
import { createPost } from '../services/postService.js';
import { createReply } from '../services/replyService.js';
import { createConnection, sendMessage } from '../services/connectionService.js';

async function runAccountDeletionTests() {
  console.log('=== RUNNING ACCOUNT DELETION & AUTHENTICATION INTEGRATION TESTS ===\n');

  const supabase = getSupabaseClient();
  const testEmail = `test_delete_${Date.now()}@aamarva.net`;
  const testPassword = 'TestSecurePassword123!';
  const testAgentName = 'DeleteTestAgent';

  // 1. REGISTER USER
  console.log('1. Registering test user...');
  const regResult = await registerUser({
    email: testEmail,
    password: testPassword,
    agentName: testAgentName,
  });

  const userId = regResult.user.id;
  const agentId = regResult.agentId;
  const apiKey = regResult.apiKey;

  console.log(`   Registered User ID: ${userId}, Agent ID: ${agentId}`);

  // 2. AUTHENTICATION MATRIX VALIDATION
  console.log('\n2. Testing Authentication Matrix...');

  // A. Human Login: Agent ID + Password -> PASS
  const humanLoginPass = await loginHuman({ agentId, password: testPassword });
  console.log('   ✓ Human Login (Agent ID + Password): PASS');

  // B. Human Login: Agent ID + API Key -> FAIL
  try {
    await loginHuman({ agentId, password: apiKey });
    console.error('   ❌ Human Login with API Key should have failed!');
    process.exit(1);
  } catch (err: any) {
    if (err.message === 'Invalid Agent ID or Password.') {
      console.log('   ✓ Human Login (Agent ID + API Key): REJECTED as expected');
    } else {
      console.error('   ❌ Unexpected error message for API Key UI login:', err.message);
      process.exit(1);
    }
  }

  // C. Human Login: Email + Password -> FAIL
  try {
    await loginHuman({ email: testEmail, password: testPassword } as any);
    console.error('   ❌ Human Login with Email should have failed!');
    process.exit(1);
  } catch (err: any) {
    if (err.message === 'Invalid Agent ID or Password.') {
      console.log('   ✓ Human Login (Email + Password): REJECTED as expected');
    } else {
      console.error('   ❌ Unexpected error message for Email login:', err.message);
      process.exit(1);
    }
  }

  // D. Human Login: Missing Agent ID -> FAIL
  try {
    await loginHuman({ password: testPassword } as any);
    console.error('   ❌ Human Login with missing Agent ID should have failed!');
    process.exit(1);
  } catch (err: any) {
    if (err.message === 'Invalid Agent ID or Password.') {
      console.log('   ✓ Human Login (Missing Agent ID): REJECTED as expected');
    } else {
      console.error('   ❌ Unexpected error message for missing Agent ID:', err.message);
      process.exit(1);
    }
  }

  // E. Agent Login: Agent ID + API Key -> PASS
  const agentLoginPass = await loginAgent({ agentId, apiKey });
  console.log('   ✓ Agent Login (Agent ID + API Key): PASS');

  // 3. CREATE DEPENDENT DATA
  console.log('\n3. Creating dependent resources (Posts, Replies, Connections, Messages)...');
  
  // Register second agent to interact with
  const secondAgent = await registerUser({
    email: `partner_${Date.now()}@aamarva.net`,
    password: 'PartnerPassword123!',
    agentName: 'PartnerAgent',
  });

  const post = await createPost(userId, 'Test post for deletion verification', 'General', 'intake');
  const reply = await createReply(post.id, secondAgent.user.id, 'Test reply on post');
  const conn = await createConnection(userId, reply.id);
  const msg = await sendMessage(conn.id, userId, 'Test message in connection');

  console.log(`   Created Post: ${post.id}, Reply: ${reply.id}, Connection: ${conn.id}, Message: ${msg.id}`);

  // 4. EXECUTE ATOMIC ACCOUNT DELETION
  console.log('\n4. Executing Account Deletion...');
  await deleteUserAccount(userId);
  console.log('   ✓ Account deletion completed successfully.');

  // 5. POST-DELETION VERIFICATION
  console.log('\n5. Verifying Post-Deletion Invariant Enforcement...');

  // A. Human Login must fail
  try {
    await loginHuman({ agentId, password: testPassword });
    console.error('   ❌ Human Login succeeded for deleted user!');
    process.exit(1);
  } catch (err: any) {
    console.log('   ✓ Human Login after deletion: REJECTED (User not found)');
  }

  // B. Agent Login must fail
  try {
    await loginAgent({ agentId, apiKey });
    console.error('   ❌ Agent Login succeeded for deleted user!');
    process.exit(1);
  } catch (err: any) {
    console.log('   ✓ Agent Login after deletion: REJECTED (User not found)');
  }

  // C. Refresh token must fail
  try {
    await refreshSessionToken(humanLoginPass.tokens.refreshToken);
    console.error('   ❌ Session refresh succeeded for deleted user!');
    process.exit(1);
  } catch (err: any) {
    console.log('   ✓ Refresh token after deletion: REJECTED');
  }

  // D. Database user record must no longer exist
  const { data: checkUser } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
  if (checkUser) {
    console.error('   ❌ User record still exists in database!');
    process.exit(1);
  } else {
    console.log('   ✓ User record verified completely removed from database');
  }

  // E. Refresh tokens must no longer exist
  const { data: checkTokens } = await supabase.from('refreshTokens').select('id').eq('userId', userId);
  if (checkTokens && checkTokens.length > 0) {
    console.error('   ❌ Refresh tokens still exist for deleted user!');
    process.exit(1);
  } else {
    console.log('   ✓ All refresh tokens verified removed');
  }

  // F. Re-deleting deleted account must be handled safely
  try {
    await deleteUserAccount(userId);
    console.error('   ❌ Re-deleting same account should have thrown an error!');
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes('not found or already deleted')) {
      console.log('   ✓ Re-deleting deleted account: Handled safely with error');
    } else {
      console.error('   ❌ Unexpected re-deletion error message:', err.message);
      process.exit(1);
    }
  }

  // Clean up second agent created for testing
  await deleteUserAccount(secondAgent.user.id);

  console.log('\n=== ALL ACCOUNT DELETION TESTS PASSED PERFECTLY ===\n');
}

runAccountDeletionTests().catch((err) => {
  console.error('❌ ACCOUNT DELETION TEST SUITE FAILED:', err);
  process.exit(1);
});
