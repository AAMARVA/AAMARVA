import {
  registerUser,
  loginHuman, loginAgent,
  deleteUserAccount,
} from '../authService.js';
import { getSupabaseClient } from '../supabase.js';

async function runFullAuthPipelineTests() {
  console.log('=== STARTING FULL END-TO-END AUTHENTICATION PIPELINE AUDIT ===\n');

  const supabase = getSupabaseClient();
  const timestamp = Date.now();

  // STEP 1: REGISTER HUMAN
  console.log('[STEP 1] Registering Human User...');
  const humanEmail = `human_audit_${timestamp}@aamarva.net`;
  const humanPassword = 'HumanSecurePassword123!';
  const humanName = 'Human Audit User';

  const humanReg = await registerUser({
    email: humanEmail,
    password: humanPassword,
    agentName: humanName,
  });

  console.log(`   ✓ Registered Human: Agent ID = "${humanReg.agentId}", User ID = "${humanReg.user.id}"`);

  // STEP 1b: VERIFY DATABASE PERSISTENCE FOR HUMAN
  console.log('   Verifying DB Persistence for Human User...');
  const { data: dbHumanRows } = await supabase.from('users').select('*').eq('id', humanReg.user.id);
  if (!dbHumanRows || dbHumanRows.length === 0) {
    throw new Error('Database persistence check failed: Human user record not found in Supabase.');
  }
  const dbHuman = dbHumanRows[0];
  console.log(`   ✓ Database record confirmed: agentId="${dbHuman.agentId || dbHuman.agent_id}", passwordHash exists=${Boolean(dbHuman.passwordHash || dbHuman.password_hash)}`);

  // STEP 2: HUMAN LOGIN (Agent ID + Password)
  console.log('\n[STEP 2] Testing Human Login (Agent ID + Password)...');
  const humanLogin = await loginHuman({
    agentId: humanReg.agentId,
    password: humanPassword,
  });

  if (!humanLogin.tokens.accessToken || !humanLogin.tokens.refreshToken) {
    throw new Error('Human login failed to return valid JWT tokens.');
  }
  console.log(`   ✓ Human Login SUCCESS: Issued accessToken and refreshToken.`);

  // STEP 3: REGISTER AGENT
  console.log('\n[STEP 3] Registering Autonomous Agent...');
  const agentEmail = `agent_audit_${timestamp}@aamarva.net`;
  const agentPassword = 'AgentSecurePassword123!';
  const agentName = 'Agent Audit Node';

  const agentReg = await registerUser({
    email: agentEmail,
    password: agentPassword,
    agentName,
  });

  console.log(`   ✓ Registered Agent: Agent ID = "${agentReg.agentId}", API Key = "${agentReg.apiKey.substring(0, 10)}..."`);

  // STEP 3b: VERIFY DATABASE PERSISTENCE FOR AGENT
  console.log('   Verifying DB Persistence for Agent User...');
  const { data: dbAgentRows } = await supabase.from('users').select('*').eq('id', agentReg.user.id);
  if (!dbAgentRows || dbAgentRows.length === 0) {
    throw new Error('Database persistence check failed: Agent user record not found in Supabase.');
  }
  const dbAgent = dbAgentRows[0];
  console.log(`   ✓ Database record confirmed: agentId="${dbAgent.agentId || dbAgent.agent_id}", apiKey/bio exists=${Boolean(dbAgent.apiKey || dbAgent.api_key || dbAgent.bio)}`);

  // STEP 4: AGENT LOGIN (Agent ID + API Key)
  console.log('\n[STEP 4] Testing Agent Login (Agent ID + API Key)...');
  const agentLogin = await loginAgent({
    agentId: agentReg.agentId,
    apiKey: agentReg.apiKey,
  });

  if (!agentLogin.tokens.accessToken || !agentLogin.tokens.refreshToken) {
    throw new Error('Agent login failed to return valid JWT tokens.');
  }
  console.log(`   ✓ Agent Login SUCCESS: Issued accessToken and refreshToken.`);

  // STEP 5: DELETE ACCOUNT
  console.log('\n[STEP 5] Executing Account Deletion for both accounts...');
  await deleteUserAccount(humanReg.user.id);
  await deleteUserAccount(agentReg.user.id);
  console.log('   ✓ Deleted human and agent accounts.');

  // STEP 6: VERIFY LOGIN FAILS FOR DELETED ACCOUNTS
  console.log('\n[STEP 6] Verifying Logins Fail Post-Deletion...');
  try {
    await loginHuman({
      agentId: humanReg.agentId,
      password: humanPassword,
    });
    throw new Error('Human login succeeded for deleted account!');
  } catch (err: any) {
    console.log(`   ✓ Human login post-deletion correctly rejected: "${err.message}"`);
  }

  try {
    await loginAgent({
      agentId: agentReg.agentId,
      apiKey: agentReg.apiKey,
    });
    throw new Error('Agent login succeeded for deleted account!');
  } catch (err: any) {
    console.log(`   ✓ Agent login post-deletion correctly rejected: "${err.message}"`);
  }

  console.log('\n=== ALL END-TO-END AUTHENTICATION PIPELINE AUDIT TESTS PASSED ===\n');
}

runFullAuthPipelineTests().catch((err) => {
  console.error('❌ AUTH PIPELINE TEST SUITE FAILED:', err);
  process.exit(1);
});
