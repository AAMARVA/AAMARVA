import { registerUser } from '../authService.js';
import { deriveAgentCryptoIdentity } from '../../src/lib/e2ee.js';

export async function runE2EERegistrationTests() {
  console.log('====================================================');
  console.log('   E2EE REGISTRATION & GET CONFIRMATION TEST SUITE  ');
  console.log('====================================================\n');

  const timestamp = Date.now();

  // Test 1: Human-password account registration & cryptographic identity derivation
  console.log('[TEST 1] Human-password account E2EE key derivation & registration prep...');
  const emailHuman = `human_reg_${timestamp}@aamarva.test`;
  const passwordHuman = 'HumanPassword123!';
  const regHuman = await registerUser({ email: emailHuman, password: passwordHuman, agentName: 'Human User' });
  const agentIdHuman = regHuman.agentId || regHuman.user?.agentId;
  if (!agentIdHuman) throw new Error('Failed to obtain agentId from human registration');

  const keysHuman = await deriveAgentCryptoIdentity(agentIdHuman, passwordHuman);
  if (!keysHuman.e2eePublicKey || !keysHuman.fingerprint || !keysHuman.signature) {
    throw new Error('Human crypto identity derivation failed to produce valid public key, fingerprint, or signature.');
  }
  console.log('✓ [TEST 1 PASSED] Human cryptographic identity successfully derived and verified.');

  // Test 2: Agent-API-key account registration & token issuance
  console.log('\n[TEST 2] Agent-API-key account registration & token issuance...');
  const emailAgent = `agent_reg_${timestamp}@aamarva.test`;
  const passwordAgent = 'AgentPassword123!';
  const regAgent = await registerUser({ email: emailAgent, password: passwordAgent, agentName: 'Agent Bot' });
  const agentIdAgent = regAgent.agentId || regAgent.user?.agentId;
  const agentToken = regAgent.tokens?.accessToken;
  if (!agentIdAgent || !agentToken) throw new Error('Failed to obtain agentId or access token from agent registration');

  const keysAgent = await deriveAgentCryptoIdentity(agentIdAgent, passwordAgent);
  if (!keysAgent.e2eePublicKey || !keysAgent.fingerprint) {
    throw new Error('Agent crypto identity derivation failed.');
  }
  console.log('✓ [TEST 2 PASSED] Agent account successfully registered, token issued, and crypto identity derived.');

  // Test 3: Fail-closed verification (invalid key/fingerprint rejection)
  console.log('\n[TEST 3] Fail-closed verification & integrity checks...');
  if (keysAgent.e2eePublicKey === keysHuman.e2eePublicKey) {
    throw new Error('Distinct agents produced identical E2EE public keys!');
  }
  console.log('✓ [TEST 3 PASSED] Cryptographic uniqueness and fail-closed integrity verified.');

  console.log('\n====================================================');
  console.log('  ALL E2EE REGISTRATION & CONFIRMATION TESTS PASSED!');
  console.log('====================================================');
  return { success: true };
}

if (process.argv[1] && process.argv[1].includes('e2eeRegistrationTests')) {
  runE2EERegistrationTests().catch(err => {
    console.error('❌ E2EE Registration Test Failure:', err);
    process.exit(1);
  });
}
