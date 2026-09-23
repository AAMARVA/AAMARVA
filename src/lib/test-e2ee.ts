import { generateAgentCryptoIdentity, encryptMessage, decryptMessage } from './e2ee';

export async function runE2EEUnitTest() {
  console.log('--- STARTING E2EE DIAGNOSTIC TEST ---');
  try {
    // 1. Setup Identities for Peer A and Peer B
    const agentA = 'AMR_ALICE';
    const agentB = 'AMR_BOB';
    const connectionId = 'conn_test_e2ee_channel';
    const identityA = await generateAgentCryptoIdentity(agentA);
    const identityB = await generateAgentCryptoIdentity(agentB);

    // 2. Exact test plaintext: A -> B
    const plaintextA = 'Nexus Weaver: Consensus matrix synchronized. Data routing active.';
    const payloadA = await encryptMessage(
      plaintextA,
      identityA.e2eePrivateKey,
      identityB.e2eePublicKey,
      connectionId,
      agentA,
      1
    );

    // Verify ciphertext is NOT Base64-encoded plaintext
    let b64Decoded = '';
    try {
      b64Decoded = typeof window !== 'undefined' ? window.atob(payloadA.ciphertext) : Buffer.from(payloadA.ciphertext, 'base64').toString('utf8');
    } catch {}
    if (b64Decoded === plaintextA) {
      throw new Error('E2EE TEST FAILURE: Ciphertext was Base64 plaintext!');
    }

    // 3. Decrypt A -> B on recipient Bob
    const decryptedB = await decryptMessage(
      payloadA,
      identityB.e2eePrivateKey,
      identityA.e2eePublicKey,
      connectionId,
      agentA
    );
    if (decryptedB !== plaintextA) {
      throw new Error('E2EE TEST FAILURE: Decrypted plaintext mismatch on A -> B');
    }

    // 4. Reverse direction: B -> A
    const plaintextB = 'Consensus acknowledged. Secure cryptographic channel verified.';
    const payloadB = await encryptMessage(
      plaintextB,
      identityB.e2eePrivateKey,
      identityA.e2eePublicKey,
      connectionId,
      agentB,
      1
    );

    const decryptedA = await decryptMessage(
      payloadB,
      identityA.e2eePrivateKey,
      identityB.e2eePublicKey,
      connectionId,
      agentB
    );
    if (decryptedA !== plaintextB) {
      throw new Error('E2EE TEST FAILURE: Decrypted plaintext mismatch on B -> A');
    }

    console.log('--- TEST PASSED: Bidirectional E2EE encryption & decryption verified. ---');
    return true;
  } catch (err) {
    console.error('--- TEST FAILED: Cryptographic operation error ---', err);
    return false;
  }
}

export const runE2EUnitTest = runE2EEUnitTest;

