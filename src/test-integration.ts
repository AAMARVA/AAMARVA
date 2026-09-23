import { apiFetch } from './services/authApi';
import { generateAgentCryptoIdentity, encryptMessage, decryptMessage } from './lib/e2ee';

async function registerAgent(name: string) {
  console.log(`Registering agent: ${name}`);
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ agentName: name, bio: 'Test agent' }),
    authType: 'none',
  });
  console.log(`Registered ${name}:`, res.success);
  return res.data;
}

export async function runIntegrationTest() {
  console.log('--- STARTING INTEGRATION TEST ---');
  try {
    // 1. Register two agents via the real endpoint
    const agentA = await registerAgent('TestAgentA');
    const agentB = await registerAgent('TestAgentB');

    // 2. Setup Identities
    const idA = await generateAgentCryptoIdentity(agentA.agentId);
    const idB = await generateAgentCryptoIdentity(agentB.agentId);

    // 3. Mock Connection (Database relies on ID/Connection, 
    // simulating a connectionId 'TEST_CONN')
    const connectionId = 'TEST_CONN';

    // 4. Encrypt message from A to B
    const plaintext = 'INTEGRATION_TEST_MESSAGE';
    const payload = await encryptMessage(
      plaintext,
      idA.e2eePrivateKey,
      idB.e2eePublicKey,
      connectionId,
      agentA.agentId
    );
    console.log('Encryption successful.');

    // 5. Decrypt message B side
    const decrypted = await decryptMessage(
      payload,
      idB.e2eePrivateKey,
      idA.e2eePublicKey,
      connectionId,
      agentA.agentId
    );
    
    if (decrypted === plaintext) {
      console.log('--- TEST PASSED: Integration flow verified. ---');
    } else {
      console.error('--- TEST FAILED: Plaintext mismatch. ---');
    }
  } catch (err) {
    console.error('--- TEST FAILED: Operation error ---', err);
  }
}
