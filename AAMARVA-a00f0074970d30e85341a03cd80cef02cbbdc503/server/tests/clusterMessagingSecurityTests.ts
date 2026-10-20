import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import clusterRouter, { getClusterTables } from '../routes/clusterRoutes';
import aamarvaRouter from '../routes/aamarvaRoutes';
import { getSupabaseClient } from '../supabase';
import { registerUser, createHumanSession } from '../authService';
import { generateE2EEKeyPair } from '../../src/lib/e2ee';
import { encryptMessageForRecipients, decryptMessageForRecipient } from '../../src/lib/clusterCrypto';

export async function runClusterMessagingSecurityTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA CLUSTER MESSAGING SECURITY RECIPIENT MODEL SUITE ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Pure Cryptographic Recipient-Specific E2EE Verification
    // -------------------------------------------------------------------------
    const ownerPair = await generateE2EEKeyPair();
    const recipientAPair = await generateE2EEKeyPair();
    const recipientBPair = await generateE2EEKeyPair();
    
    const plaintext = 'Secret message';
    const clusterId = 'test-cluster-crypto';
    
    const recipients = {
      'AMR-A': recipientAPair.publicKey,
      'AMR-B': recipientBPair.publicKey
    };
    
    const envelope = await encryptMessageForRecipients(
      plaintext,
      recipients,
      ownerPair.privateKey,
      'AMR-OWNER',
      clusterId,
      1
    );
    
    // 1. Authorized Recipient Decryption
    const decryptedA = await decryptMessageForRecipient(
      envelope.ciphertext,
      recipientAPair.privateKey,
      envelope.keys,
      ownerPair.publicKey,
      'AMR-A',
      clusterId,
      'AMR-OWNER',
      1
    );
    recordResult('test_recipient_decryption_success', decryptedA === plaintext, 'Authorized recipient decrypted correctly');

    // 2. Unauthorized Recipient Rejection
    const intruderPair = await generateE2EEKeyPair();
    let intruderFailed = false;
    try {
      await decryptMessageForRecipient(
        envelope.ciphertext,
        intruderPair.privateKey,
        envelope.keys,
        ownerPair.publicKey,
        'AMR-INTRUDER',
        clusterId,
        'AMR-OWNER',
        1
      );
    } catch {
      intruderFailed = true;
    }
    recordResult('test_unauthorized_recipient_rejection', intruderFailed, 'Unauthorized recipient rejected');

    // 3. Multi-Epoch Cryptographic Authentication Coordination
    const epoch = 5;
    const epochEnvelope = await encryptMessageForRecipients(
      'Multi-epoch secret',
      recipients,
      ownerPair.privateKey,
      'AMR-OWNER',
      clusterId,
      epoch
    );
    recordResult('test_epoch_metadata_present', epochEnvelope.keyEpoch === epoch && epochEnvelope.version === 2, 'Epoch metadata matches');

    const decryptedWithEpoch = await decryptMessageForRecipient(
      epochEnvelope.ciphertext,
      recipientBPair.privateKey,
      epochEnvelope.keys,
      ownerPair.publicKey,
      'AMR-B',
      clusterId,
      'AMR-OWNER',
      epoch
    );
    recordResult('test_epoch_decryption_success', decryptedWithEpoch === 'Multi-epoch secret', 'Decrypted with coordinated keyEpoch');

    // 4. Mismatched Epoch Cryptographic Rejection
    let mismatchedEpochFailed = false;
    try {
      await decryptMessageForRecipient(
        epochEnvelope.ciphertext,
        recipientBPair.privateKey,
        { keys: epochEnvelope.keys, keyEpoch: 999, version: 2 },
        ownerPair.publicKey,
        'AMR-B',
        clusterId,
        'AMR-OWNER',
        999
      );
    } catch {
      mismatchedEpochFailed = true;
    }
    recordResult('test_mismatched_epoch_rejection', mismatchedEpochFailed, 'Mismatched keyEpoch strictly rejected via AAD');

    // 5. Crypto helper rejects version !== 2
    let version1Failed = false;
    try {
      await decryptMessageForRecipient(
        epochEnvelope.ciphertext,
        recipientBPair.privateKey,
        { keys: epochEnvelope.keys, keyEpoch: epoch, version: 1 },
        ownerPair.publicKey,
        'AMR-B',
        clusterId,
        'AMR-OWNER',
        epoch
      );
    } catch {
      version1Failed = true;
    }
    recordResult('test_crypto_v1_rejected', version1Failed, 'Cryptographic helper rejects version 1 envelopes');

    // 6. Crypto helper rejects missing keyEpoch
    let missingEpochFailed = false;
    try {
      const envelopeNoEpoch = {
        type: 'AAMARVA_RECIPIENT_E2EE_v2',
        version: 2,
        keys: epochEnvelope.keys,
        ciphertext: 'fakeCiphertext',
        nonce: 'fakeNonce'
      };
      await decryptMessageForRecipient(
        Buffer.from(JSON.stringify(envelopeNoEpoch)).toString('base64'),
        recipientBPair.privateKey,
        { keys: epochEnvelope.keys, version: 2 },
        ownerPair.publicKey,
        'AMR-B',
        clusterId,
        'AMR-OWNER'
      );
    } catch {
      missingEpochFailed = true;
    }
    recordResult('test_crypto_missing_epoch_rejected', missingEpochFailed, 'Cryptographic helper fails closed when keyEpoch is missing');

    // 6b. Crypto helper rejects missing version
    let missingVersionFailed = false;
    try {
      const envelopeNoVersion = {
        type: 'AAMARVA_RECIPIENT_E2EE_v2',
        keyEpoch: epoch,
        keys: epochEnvelope.keys,
        ciphertext: 'fakeCiphertext',
        nonce: 'fakeNonce'
      };
      await decryptMessageForRecipient(
        Buffer.from(JSON.stringify(envelopeNoVersion)).toString('base64'),
        recipientBPair.privateKey,
        { keys: epochEnvelope.keys, keyEpoch: epoch },
        ownerPair.publicKey,
        'AMR-B',
        clusterId,
        'AMR-OWNER',
        epoch
      );
    } catch {
      missingVersionFailed = true;
    }
    recordResult('test_crypto_missing_version_rejected', missingVersionFailed, 'Cryptographic helper fails closed when version is missing');

    // 6c. Encryption helper rejects missing keyEpoch
    let encryptMissingEpochFailed = false;
    try {
      await (encryptMessageForRecipients as any)(
        'Secret message',
        recipients,
        ownerPair.privateKey,
        'AMR-OWNER',
        clusterId
      );
    } catch {
      encryptMissingEpochFailed = true;
    }
    recordResult('test_crypto_encrypt_missing_epoch_rejected', encryptMissingEpochFailed, 'Encryption helper fails closed when keyEpoch is omitted');

    // 6d. Crypto helper rejects malformed JSON envelope wrapper
    let malformedWrapperFailed = false;
    try {
      const malformedJsonB64 = Buffer.from('{"ciphertext": "incomplete', 'utf-8').toString('base64');
      await decryptMessageForRecipient(
        malformedJsonB64,
        recipientBPair.privateKey,
        { keys: epochEnvelope.keys, version: 2, keyEpoch: epoch },
        ownerPair.publicKey,
        'AMR-B',
        clusterId,
        'AMR-OWNER',
        epoch
      );
    } catch {
      malformedWrapperFailed = true;
    }
    recordResult('test_crypto_malformed_json_wrapper_rejected', malformedWrapperFailed, 'Cryptographic helper rejects malformed JSON envelope wrapper');

    // 6e. Crypto helper rejects invalid Base64
    let invalidBase64Failed = false;
    try {
      await decryptMessageForRecipient(
        'not-a-valid-base64-string!!!',
        recipientBPair.privateKey,
        { keys: epochEnvelope.keys, version: 2, keyEpoch: epoch },
        ownerPair.publicKey,
        'AMR-B',
        clusterId,
        'AMR-OWNER',
        epoch
      );
    } catch {
      invalidBase64Failed = true;
    }
    recordResult('test_crypto_invalid_base64_rejected', invalidBase64Failed, 'Cryptographic helper rejects invalid Base64');

    // 6f. Crypto helper rejects non-wrapper ciphertext
    let nonWrapperFailed = false;
    try {
      await decryptMessageForRecipient(
        Buffer.from('plain-text-not-json-wrapper').toString('base64'),
        recipientBPair.privateKey,
        { keys: epochEnvelope.keys, version: 2, keyEpoch: epoch },
        ownerPair.publicKey,
        'AMR-B',
        clusterId,
        'AMR-OWNER',
        epoch
      );
    } catch {
      nonWrapperFailed = true;
    }
    recordResult('test_crypto_non_wrapper_rejected', nonWrapperFailed, 'Cryptographic helper rejects non-wrapper ciphertext');

    // -------------------------------------------------------------------------
    // SECTION 2: Endpoint Enforcement Verification (HTTP Protocol & Authorization)
    // -------------------------------------------------------------------------
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api', aamarvaRouter);
    app.use('/api', clusterRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const helperFetch = async (endpoint: string, options: any = {}) => {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {}
      return { status: res.status, json, text };
    };

    const ts = Date.now();
    const supabase = getSupabaseClient();
    const tables = await getClusterTables(supabase);

    // Register test cluster owner and an active peer member
    const regOwner = await registerUser({ email: `msg_owner_${ts}@aamarva.test`, password: 'Password123!', agentName: 'Msg Owner' });
    const ownerUser = regOwner.user;
    const ownerSession = await createHumanSession(ownerUser.id);
    const ownerCookie = `aamarva_human_session=${ownerSession}`;

    // Set owner's registered E2EE public key and fingerprint
    const ownerECKey = await generateE2EEKeyPair();
    await supabase.auth.admin.updateUserById(ownerUser.id, {
      user_metadata: {
        e2eePublicKey: ownerECKey.publicKey,
        e2eePublicKeyFingerprint: ownerECKey.fingerprint
      }
    });

    const regPeer = await registerUser({ email: `msg_peer_${ts}@aamarva.test`, password: 'Password123!', agentName: 'Msg Peer' });
    const peerUser = regPeer.user;
    const peerECKey = await generateE2EEKeyPair();
    await supabase.auth.admin.updateUserById(peerUser.id, {
      user_metadata: {
        e2eePublicKey: peerECKey.publicKey,
        e2eePublicKeyFingerprint: peerECKey.fingerprint
      }
    });

    const regInactive = await registerUser({ email: `msg_inactive_${ts}@aamarva.test`, password: 'Password123!', agentName: 'Msg Inactive' });
    const inactiveUser = regInactive.user;

    // Create a test cluster
    const clusterRowId = `cluster_${crypto.randomUUID()}`;
    await supabase.from(tables.clusters).insert({
      id: clusterRowId,
      name: 'Security Test Cluster',
      ownerUserId: ownerUser.id,
      ownerAgentId: ownerUser.agentId,
      status: 'active',
      createdAt: new Date().toISOString()
    });

    // Add owner as active member
    await supabase.from(tables.members).insert({
      id: `mem_${crypto.randomUUID()}`,
      clusterId: clusterRowId,
      userId: ownerUser.id,
      agentId: ownerUser.agentId,
      role: 'owner',
      status: 'active'
    });

    // Add peer as active member
    await supabase.from(tables.members).insert({
      id: `mem_${crypto.randomUUID()}`,
      clusterId: clusterRowId,
      userId: peerUser.id,
      agentId: peerUser.agentId,
      role: 'member',
      status: 'active'
    });

    // Add inactive member
    await supabase.from(tables.members).insert({
      id: `mem_${crypto.randomUUID()}`,
      clusterId: clusterRowId,
      userId: inactiveUser.id,
      agentId: inactiveUser.agentId,
      role: 'member',
      status: 'inactive'
    });

    const validNonce = Buffer.alloc(12, 1).toString('base64');
    const validIv = Buffer.alloc(12, 2).toString('base64');
    const validKey = Buffer.alloc(32, 3).toString('base64');
    const validEnvelopeObj = {
      type: 'AAMARVA_RECIPIENT_E2EE_v2',
      clusterId: clusterRowId,
      senderAgentId: ownerUser.agentId,
      version: 2,
      keyEpoch: 1,
      nonce: Buffer.alloc(12, 4).toString('base64'),
      ciphertext: Buffer.from('inner_body_ciphertext').toString('base64'),
      keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
    };
    const validCiphertext = Buffer.from(JSON.stringify(validEnvelopeObj)).toString('base64');

    // 7. Endpoint rejects legacy version 1 cluster messages
    const resV1 = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 1,
        keyEpoch: 1,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult('endpoint_rejects_version_1', resV1.status === 400 && resV1.json?.error?.code === 'UNSUPPORTED_VERSION', `Status: ${resV1.status}, code: ${resV1.json?.error?.code}`);

    // 8. Endpoint rejects missing version
    const resNoVer = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        keyEpoch: 1,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult('endpoint_rejects_missing_version', resNoVer.status === 400 && resNoVer.json?.error?.code === 'MISSING_VERSION', `Status: ${resNoVer.status}, code: ${resNoVer.json?.error?.code}`);

    // 9. Endpoint rejects missing keyEpoch
    const resNoEpoch = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult('endpoint_rejects_missing_key_epoch', resNoEpoch.status === 400 && resNoEpoch.json?.error?.code === 'MISSING_KEY_EPOCH', `Status: ${resNoEpoch.status}, code: ${resNoEpoch.json?.error?.code}`);

    // 10. Endpoint rejects missing recipient keys map
    const resNoKeys = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId]
      })
    });
    recordResult('endpoint_rejects_missing_keys_map', resNoKeys.status === 400 && resNoKeys.json?.error?.code === 'MISSING_RECIPIENT_KEYS', `Status: ${resNoKeys.status}, code: ${resNoKeys.json?.error?.code}`);

    // 10b. Endpoint rejects missing intended-recipients list
    const resNoRecipients = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        keyEpoch: 1,
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult('endpoint_rejects_missing_intended_recipients', resNoRecipients.status === 400 && resNoRecipients.json?.error?.code === 'MISSING_INTENDED_RECIPIENTS', `Status: ${resNoRecipients.status}, code: ${resNoRecipients.json?.error?.code}`);

    // 10c. Endpoint rejects empty intended-recipients list
    const resEmptyRecipients = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        keyEpoch: 1,
        recipients: [],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult('endpoint_rejects_empty_intended_recipients', resEmptyRecipients.status === 400 && resEmptyRecipients.json?.error?.code === 'EMPTY_RECIPIENTS', `Status: ${resEmptyRecipients.status}, code: ${resEmptyRecipients.json?.error?.code}`);

    // 10d. Endpoint rejects duplicate intended recipients
    const resDupRecipients = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId, peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult('endpoint_rejects_duplicate_intended_recipients', resDupRecipients.status === 400 && resDupRecipients.json?.error?.code === 'DUPLICATE_RECIPIENT', `Status: ${resDupRecipients.status}, code: ${resDupRecipients.json?.error?.code}`);

    // 11. Endpoint rejects unauthorized (non-member) recipient
    const resUnauthRec = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        keyEpoch: 1,
        recipients: ['AMR-NON-EXISTENT-AGENT'],
        keys: { 'AMR-NON-EXISTENT-AGENT': { iv: validIv, key: validKey } }
      })
    });
    recordResult('endpoint_rejects_unauthorized_recipient', resUnauthRec.status === 403 && resUnauthRec.json?.error?.code === 'UNAUTHORIZED_RECIPIENT', `Status: ${resUnauthRec.status}, code: ${resUnauthRec.json?.error?.code}`);

    // 12. Endpoint rejects inactive cluster recipient
    const resInactiveRec = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        keyEpoch: 1,
        recipients: [inactiveUser.agentId],
        keys: { [inactiveUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult('endpoint_rejects_inactive_recipient', resInactiveRec.status === 403 && resInactiveRec.json?.error?.code === 'INACTIVE_RECIPIENT', `Status: ${resInactiveRec.status}, code: ${resInactiveRec.json?.error?.code}`);

    // 13. Endpoint rejects malformed envelope IV length
    const resBadIv = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: Buffer.alloc(8).toString('base64'), key: validKey } } // 8 bytes instead of 12
      })
    });
    recordResult('endpoint_rejects_malformed_envelope_iv', resBadIv.status === 400 && resBadIv.json?.error?.code === 'MALFORMED_RECIPIENT_ENVELOPE', `Status: ${resBadIv.status}, code: ${resBadIv.json?.error?.code}`);

    // 14. Endpoint rejects intended recipients set mismatch
    const resIntendedMismatch = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId, 'AMR-ANOTHER-AGENT'],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult('endpoint_rejects_intended_recipients_mismatch', resIntendedMismatch.status === 400 && resIntendedMismatch.json?.error?.code === 'MISSING_RECIPIENT_ENVELOPE', `Status: ${resIntendedMismatch.status}, code: ${resIntendedMismatch.json?.error?.code}`);

    // 15. Endpoint accepts valid version 2 recipient-envelope message
    const resValidMsg = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult('endpoint_accepts_valid_v2_envelope', resValidMsg.status === 201 && resValidMsg.json?.success === true, `Status: ${resValidMsg.status}, id: ${resValidMsg.json?.data?.id}`);

    // 15b. Verify error response no longer lists outer nonce as required
    const resNoCiphertext = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    const requiredFields = resNoCiphertext.json?.error?.required_fields || {};
    const outerNonceNotRequired = resNoCiphertext.status === 400 &&
      resNoCiphertext.json?.error?.code === 'MISSING_CIPHERTEXT' &&
      !('nonce' in requiredFields);
    recordResult('endpoint_error_response_outer_nonce_not_required', outerNonceNotRequired, 'Error response does not list outer nonce as required');

    // 15c. Regression test: Valid version-2 message without outer nonce can be stored and retrieved
    const v2Plaintext = 'Confidential cluster message without outer nonce';
    const v2EnvelopeNoOuterNonce = await encryptMessageForRecipients(
      v2Plaintext,
      { [peerUser.agentId]: peerECKey.publicKey },
      ownerECKey.privateKey,
      ownerUser.agentId,
      clusterRowId,
      1
    );

    const resStoreNoOuterNonce = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: v2EnvelopeNoOuterNonce.ciphertext,
        // Outer nonce is deliberately omitted
        version: v2EnvelopeNoOuterNonce.version,
        keyEpoch: v2EnvelopeNoOuterNonce.keyEpoch,
        recipients: [peerUser.agentId],
        keys: v2EnvelopeNoOuterNonce.keys
      })
    });

    const storedMsgId = resStoreNoOuterNonce.json?.data?.id;
    const storeSuccess = resStoreNoOuterNonce.status === 201 && !!storedMsgId && (resStoreNoOuterNonce.json?.data?.nonce === null || resStoreNoOuterNonce.json?.data?.nonce === undefined);
    recordResult('endpoint_stores_v2_message_without_outer_nonce', storeSuccess, `Status: ${resStoreNoOuterNonce.status}, id: ${storedMsgId}`);

    // Retrieve the message via GET /api/clusters/:clusterId/messages
    const resGetMessages = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'GET',
      headers: { Cookie: ownerCookie }
    });

    const retrievedList = resGetMessages.json?.data || [];
    const retrievedMsg = retrievedList.find((m: any) => m.id === storedMsgId);
    const retrieveSuccess = resGetMessages.status === 200 &&
      !!retrievedMsg &&
      retrievedMsg.ciphertext === v2EnvelopeNoOuterNonce.ciphertext &&
      retrievedMsg.version === 2 &&
      retrievedMsg.keyEpoch === 1 &&
      (retrievedMsg.nonce === null || retrievedMsg.nonce === undefined);

    recordResult('endpoint_retrieves_v2_message_without_outer_nonce', retrieveSuccess, `Retrieved message id: ${retrievedMsg?.id}, nonce is null: ${retrievedMsg?.nonce === null}`);

    // Confirm that the recipient can decrypt the message using the inner envelope nonce
    let decryptedWithoutOuterNonce: string | null = null;
    if (retrievedMsg) {
      decryptedWithoutOuterNonce = await decryptMessageForRecipient(
        retrievedMsg.ciphertext,
        peerECKey.privateKey,
        retrievedMsg.keys,
        ownerECKey.publicKey,
        peerUser.agentId,
        clusterRowId,
        ownerUser.agentId,
        retrievedMsg.keyEpoch
      );
    }
    recordResult('v2_message_without_outer_nonce_decrypted_with_inner_nonce', decryptedWithoutOuterNonce === v2Plaintext, 'Message without outer nonce decrypted successfully via inner envelope nonce');

    // 15d. Confirm inner envelope nonce remains required for authenticated decryption
    let innerNonceMissingRejected = false;
    try {
      const decodedJson = Buffer.from(v2EnvelopeNoOuterNonce.ciphertext, 'base64').toString('utf-8');
      const innerObj = JSON.parse(decodedJson);
      delete innerObj.nonce; // Strip inner envelope nonce
      const tamperedCiphertext = Buffer.from(JSON.stringify(innerObj), 'utf-8').toString('base64');

      await decryptMessageForRecipient(
        tamperedCiphertext,
        peerECKey.privateKey,
        v2EnvelopeNoOuterNonce.keys,
        ownerECKey.publicKey,
        peerUser.agentId,
        clusterRowId,
        ownerUser.agentId,
        1
      );
    } catch {
      innerNonceMissingRejected = true;
    }
    recordResult('inner_envelope_nonce_strictly_required_for_decryption', innerNonceMissingRejected, 'Inner envelope nonce is strictly required for authenticated decryption');

    // 15e. Regression test: Server rejects mismatched embedded keys
    const mismatchedKeysEnvelopeObj = {
      ...validEnvelopeObj,
      keys: { 'AMR-TAMPERED-RECIPIENT': { iv: validIv, key: validKey } }
    };
    const resMismatchedKeys = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: Buffer.from(JSON.stringify(mismatchedKeysEnvelopeObj)).toString('base64'),
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult(
      'endpoint_rejects_mismatched_embedded_keys',
      resMismatchedKeys.status === 400 && resMismatchedKeys.json?.error?.code === 'ENVELOPE_KEYS_MISMATCH',
      `Status: ${resMismatchedKeys.status}, code: ${resMismatchedKeys.json?.error?.code}`
    );

    // 15f. Regression test: Server rejects mismatched embedded epoch
    const mismatchedEpochEnvelopeObj = {
      ...validEnvelopeObj,
      keyEpoch: 99
    };
    const resMismatchedEpoch = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: Buffer.from(JSON.stringify(mismatchedEpochEnvelopeObj)).toString('base64'),
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult(
      'endpoint_rejects_mismatched_embedded_epoch',
      resMismatchedEpoch.status === 400 && resMismatchedEpoch.json?.error?.code === 'ENVELOPE_EPOCH_MISMATCH',
      `Status: ${resMismatchedEpoch.status}, code: ${resMismatchedEpoch.json?.error?.code}`
    );

    // 15g. Regression test: Server rejects mismatched embedded cluster ID
    const mismatchedClusterEnvelopeObj = {
      ...validEnvelopeObj,
      clusterId: 'cluster_mismatched_999'
    };
    const resMismatchedCluster = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: Buffer.from(JSON.stringify(mismatchedClusterEnvelopeObj)).toString('base64'),
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult(
      'endpoint_rejects_mismatched_embedded_cluster_id',
      resMismatchedCluster.status === 400 && resMismatchedCluster.json?.error?.code === 'ENVELOPE_CLUSTER_MISMATCH',
      `Status: ${resMismatchedCluster.status}, code: ${resMismatchedCluster.json?.error?.code}`
    );

    // 15h. Regression test: Server rejects mismatched embedded sender ID
    const mismatchedSenderEnvelopeObj = {
      ...validEnvelopeObj,
      senderAgentId: 'AMR-IMPOSTOR-AGENT'
    };
    const resMismatchedSender = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: Buffer.from(JSON.stringify(mismatchedSenderEnvelopeObj)).toString('base64'),
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult(
      'endpoint_rejects_mismatched_embedded_sender_id',
      resMismatchedSender.status === 400 && resMismatchedSender.json?.error?.code === 'ENVELOPE_SENDER_MISMATCH',
      `Status: ${resMismatchedSender.status}, code: ${resMismatchedSender.json?.error?.code}`
    );

    // 15i. Regression test: Server rejects invalid envelope type or malformed envelope
    const invalidTypeEnvelopeObj = {
      ...validEnvelopeObj,
      type: 'INVALID_TYPE_v1'
    };
    const resInvalidType = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: Buffer.from(JSON.stringify(invalidTypeEnvelopeObj)).toString('base64'),
        version: 2,
        keyEpoch: 1,
        recipients: [peerUser.agentId],
        keys: { [peerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult(
      'endpoint_rejects_invalid_embedded_envelope_type',
      resInvalidType.status === 400 && resInvalidType.json?.error?.code === 'INVALID_ENVELOPE_TYPE',
      `Status: ${resInvalidType.status}, code: ${resInvalidType.json?.error?.code}`
    );

    // 15j. Verify GET messages returns recipients for each message
    const resGetMsgs = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'GET',
      headers: { Cookie: ownerCookie }
    });
    const fetchedMsgs = resGetMsgs.json?.data || [];
    const hasRecipientsField = fetchedMsgs.length > 0 && fetchedMsgs.every((m: any) => Array.isArray(m.recipients));
    recordResult(
      'endpoint_returns_recipients_for_each_message',
      resGetMsgs.status === 200 && hasRecipientsField,
      `Status: ${resGetMsgs.status}, messages count: ${fetchedMsgs.length}`
    );

    // 16. Verify cluster owner is NOT automatically authorized unless qualifying as active member
    // Create another cluster where owner is not an active member in tables.members
    const unauthOwnerClusterId = `cluster_unauth_${crypto.randomUUID()}`;
    await supabase.from(tables.clusters).insert({
      id: unauthOwnerClusterId,
      name: 'Unauth Owner Test Cluster',
      ownerUserId: ownerUser.id,
      ownerAgentId: ownerUser.agentId,
      status: 'active',
      createdAt: new Date().toISOString()
    });
    // Add only peer as active member, do NOT add owner to tables.members
    await supabase.from(tables.members).insert({
      id: `mem_${crypto.randomUUID()}`,
      clusterId: unauthOwnerClusterId,
      userId: peerUser.id,
      agentId: peerUser.agentId,
      role: 'member',
      status: 'active'
    });
    // Peer attempts to send message to owner: owner must be rejected because owner is not in members table
    const peerSession = await createHumanSession(peerUser.id);
    const peerCookie = `aamarva_human_session=${peerSession}`;
    const resOwnerUnauth = await helperFetch(`/api/clusters/${unauthOwnerClusterId}/messages`, {
      method: 'POST',
      headers: { Cookie: peerCookie },
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 2,
        keyEpoch: 1,
        recipients: [ownerUser.agentId],
        keys: { [ownerUser.agentId]: { iv: validIv, key: validKey } }
      })
    });
    recordResult('owner_not_automatically_authorized_without_membership', resOwnerUnauth.status === 403 && resOwnerUnauth.json?.error?.code === 'UNAUTHORIZED_RECIPIENT', `Status: ${resOwnerUnauth.status}, code: ${resOwnerUnauth.json?.error?.code}`);

    server.close();
  } catch (err: any) {
    console.error('Test suite error:', err);
    recordResult('Test Suite Execution', false, err?.message);
  }

  return results;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('clusterMessagingSecurityTests')) {
  runClusterMessagingSecurityTests().then(results => {
    const hasFailures = Object.values(results).some(r => r.status === 'FAILED');
    if (hasFailures) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
