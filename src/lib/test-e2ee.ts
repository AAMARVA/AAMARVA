import { 
  generateAgentCryptoIdentity, 
  encryptMessage, 
  decryptMessage, 
  constructAAD,
  normalizeAgentId,
  E2EEDecryptionError 
} from './e2ee';

export async function runE2EEUnitTest() {
  console.log('--- STARTING E2EE DIAGNOSTIC TEST SUITE ---');
  try {
    // 1. Setup Identities for Peer A (Alice) and Peer B (Bob) and Peer C (Mallory)
    const agentA = 'AMR_ALICE';
    const agentB = 'AMR_BOB';
    const agentC = 'AMR_MALLORY';
    const connectionId = 'conn_test_e2ee_channel';
    const identityA = await generateAgentCryptoIdentity(agentA);
    const identityB = await generateAgentCryptoIdentity(agentB);
    const identityC = await generateAgentCryptoIdentity(agentC);

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

    // 5. Simulated Production Serialization Path (JSON serialization / DB transport simulation)
    const simulatedDbRow = JSON.parse(JSON.stringify({
      id: 'msg_simulated_db_123',
      connectionId,
      senderAgentId: agentA,
      ciphertext: payloadA.ciphertext,
      nonce: payloadA.nonce,
      version: payloadA.version,
      keyEpoch: payloadA.keyEpoch,
      content: null
    }));

    const decryptedFromDbRow = await decryptMessage(
      {
        ciphertext: simulatedDbRow.ciphertext,
        nonce: simulatedDbRow.nonce,
        version: simulatedDbRow.version,
        keyEpoch: simulatedDbRow.keyEpoch
      },
      identityB.e2eePrivateKey,
      identityA.e2eePublicKey,
      simulatedDbRow.connectionId,
      simulatedDbRow.senderAgentId
    );
    if (decryptedFromDbRow !== plaintextA) {
      throw new Error('E2EE TEST FAILURE: Production serialization round-trip failed.');
    }

    // 6. Tamper Test: Wrong Recipient Private Key (Mallory tries to decrypt Bob's message)
    let wrongRecipientCaught = false;
    try {
      await decryptMessage(
        payloadA,
        identityC.e2eePrivateKey, // Wrong private key
        identityA.e2eePublicKey,
        connectionId,
        agentA
      );
    } catch (err: any) {
      wrongRecipientCaught = true;
    }
    if (!wrongRecipientCaught) {
      throw new Error('E2EE SECURITY FAILURE: Wrong recipient private key decrypted the message!');
    }

    // 7. Tamper Test: Wrong Sender Public Key
    let wrongSenderCaught = false;
    try {
      await decryptMessage(
        payloadA,
        identityB.e2eePrivateKey,
        identityC.e2eePublicKey, // Wrong sender public key
        connectionId,
        agentA
      );
    } catch {
      wrongSenderCaught = true;
    }
    if (!wrongSenderCaught) {
      throw new Error('E2EE SECURITY FAILURE: Wrong sender public key decrypted the message!');
    }

    // 8. Tamper Test: Modified / Tampered Ciphertext
    let modifiedCiphertextCaught = false;
    try {
      const rawBytes = typeof Buffer !== 'undefined' ? Buffer.from(payloadA.ciphertext, 'base64') : new Uint8Array(Array.from(atob(payloadA.ciphertext)).map(c => c.charCodeAt(0)));
      rawBytes[0] ^= 0xff; // Flip bits
      const tamperedB64 = typeof Buffer !== 'undefined' ? rawBytes.toString('base64') : btoa(String.fromCharCode(...rawBytes));

      await decryptMessage(
        { ...payloadA, ciphertext: tamperedB64 },
        identityB.e2eePrivateKey,
        identityA.e2eePublicKey,
        connectionId,
        agentA
      );
    } catch {
      modifiedCiphertextCaught = true;
    }
    if (!modifiedCiphertextCaught) {
      throw new Error('E2EE SECURITY FAILURE: Modified ciphertext was not rejected by AES-GCM tag verification!');
    }

    // 9. Tamper Test: Modified Nonce / IV
    let modifiedNonceCaught = false;
    try {
      const rawNonce = typeof Buffer !== 'undefined' ? Buffer.from(payloadA.nonce, 'base64') : new Uint8Array(Array.from(atob(payloadA.nonce)).map(c => c.charCodeAt(0)));
      rawNonce[0] ^= 0xff;
      const tamperedNonceB64 = typeof Buffer !== 'undefined' ? rawNonce.toString('base64') : btoa(String.fromCharCode(...rawNonce));

      await decryptMessage(
        { ...payloadA, nonce: tamperedNonceB64 },
        identityB.e2eePrivateKey,
        identityA.e2eePublicKey,
        connectionId,
        agentA
      );
    } catch {
      modifiedNonceCaught = true;
    }
    if (!modifiedNonceCaught) {
      throw new Error('E2EE SECURITY FAILURE: Modified nonce was not rejected by AES-GCM tag verification!');
    }

    // 10. Tamper Test: Wrong Connection ID (Channel Hijacking Prevention via AAD)
    let wrongConnectionCaught = false;
    try {
      await decryptMessage(
        payloadA,
        identityB.e2eePrivateKey,
        identityA.e2eePublicKey,
        'conn_different_channel_hijack_attempt',
        agentA
      );
    } catch {
      wrongConnectionCaught = true;
    }
    if (!wrongConnectionCaught) {
      throw new Error('E2EE SECURITY FAILURE: Wrong connection ID in AAD was not rejected!');
    }

    console.log('--- ALL E2EE DIAGNOSTIC & TAMPER TESTS PASSED ---');
    return true;
  } catch (err) {
    console.error('--- TEST FAILED: Cryptographic operation error ---', err);
    return false;
  }
}

export const runE2EUnitTest = runE2EEUnitTest;

