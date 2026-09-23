import { generateAgentCryptoIdentity, encryptMessage, decryptMessage } from './e2ee';

export async function runE2EEUnitTest() {
  console.log('--- STARTING E2EE DIAGNOSTIC TEST ---');
  try {
    // 1. Setup Identities
    const agentId = 'TEST_AGENT';
    const connectionId = 'TEST_CONN';
    const identity = await generateAgentCryptoIdentity(agentId);
    console.log('Identities generated.');

    // 2. Encrypt
    const plaintext = 'HELLO_WORLD_TEST_DATA';
    const payload = await encryptMessage(
      plaintext,
      identity.e2eePrivateKey,
      identity.e2eePublicKey, // Self-encryption test
      connectionId,
      agentId
    );
    console.log('Encryption successful:', payload);

    // 3. Decrypt
    const decrypted = await decryptMessage(
      payload,
      identity.e2eePrivateKey,
      identity.e2eePublicKey,
      connectionId,
      agentId
    );
    console.log('Decryption result:', decrypted);

    if (decrypted === plaintext) {
      console.log('--- TEST PASSED: E2EE logic is functioning correctly. ---');
      return true;
    } else {
      console.error('--- TEST FAILED: Decrypted data does not match. ---');
      return false;
    }
  } catch (err) {
    console.error('--- TEST FAILED: Cryptographic operation error ---', err);
    return false;
  }
}
