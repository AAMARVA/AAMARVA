import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import clusterRouter, { getClusterTables } from '../routes/clusterRoutes';
import aamarvaRouter from '../routes/aamarvaRoutes';
import { getSupabaseClient } from '../supabase';
import { registerUser, createHumanSession } from '../authService';
import { generateE2EEKeyPair } from '../../src/lib/e2ee';
import { generateClusterGroupKey, encryptClusterMessage, decryptClusterMessage, wrapClusterGroupKeyForMember, unwrapClusterGroupKeyFromPackage } from '../../src/lib/clusterCrypto';

export async function runClusterMessagingSecurityTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA SHARED GROUP-KEY CLUSTER MESSAGING SECURITY SUITE ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Pure Cryptographic Shared Group-Key E2EE Verification
    // -------------------------------------------------------------------------
    const ownerPair = await generateE2EEKeyPair();
    const recipientAPair = await generateE2EEKeyPair();
    const clusterId = 'test-cluster-group-key';
    const epoch = 1;

    // 1. Generate shared group key
    const groupKeyData = await generateClusterGroupKey();
    recordResult('test_generate_group_key', Boolean(groupKeyData.key && groupKeyData.rawKey), 'Generated 256-bit AES-GCM group key');

    // 2. Encrypt once using shared group key
    const plaintext = 'Secret cluster shared message';
    const envelope = await encryptClusterMessage(
      plaintext,
      groupKeyData.key,
      'AMR-OWNER',
      clusterId,
      epoch
    );
    recordResult('test_encrypt_cluster_message', Boolean(envelope.ciphertext && envelope.nonce), 'Encrypted cluster message once with shared group key');

    // 3. Authorized Member Decryption
    const decryptedA = await decryptClusterMessage(
      envelope.ciphertext,
      envelope.nonce,
      groupKeyData.key,
      'AMR-OWNER',
      clusterId,
      epoch,
      envelope.version
    );
    recordResult('test_authorized_decryption_success', decryptedA === plaintext, 'Authorized member decrypted cluster message successfully');

    // 4. Key Distribution Wrapping & Unwrapping
    const wrappedPackage = await wrapClusterGroupKeyForMember(
      groupKeyData.rawKey,
      ownerPair.privateKey,
      recipientAPair.publicKey,
      clusterId,
      epoch
    );
    recordResult('test_wrap_group_key', Boolean(wrappedPackage.key && wrappedPackage.iv), 'Wrapped group key for member');

    const unwrapped = await unwrapClusterGroupKeyFromPackage(
      wrappedPackage,
      recipientAPair.privateKey,
      ownerPair.publicKey,
      clusterId,
      epoch
    );
    recordResult('test_unwrap_group_key', Boolean(unwrapped.groupKey), 'Unwrapped group key successfully');

    // 5. Decrypt using unwrapped key
    const decryptedWrapped = await decryptClusterMessage(
      envelope.ciphertext,
      envelope.nonce,
      unwrapped.groupKey,
      'AMR-OWNER',
      clusterId,
      epoch,
      envelope.version
    );
    recordResult('test_decrypted_with_unwrapped_key', decryptedWrapped === plaintext, 'Decrypted cluster message using unwrapped group key');

    // 6. Unauthorized Member Rejection (Wrong Group Key)
    const wrongGroupKeyData = await generateClusterGroupKey();
    let wrongKeyFailed = false;
    try {
      await decryptClusterMessage(
        envelope.ciphertext,
        envelope.nonce,
        wrongGroupKeyData.key,
        'AMR-OWNER',
        clusterId,
        epoch,
        envelope.version
      );
    } catch {
      wrongKeyFailed = true;
    }
    recordResult('test_unauthorized_group_key_rejection', wrongKeyFailed, 'Unauthorized user without group key strictly rejected');

    // 7. Invalid Ciphertext Rejection
    let invalidCiphertextFailed = false;
    try {
      await decryptClusterMessage(
        'not-valid-ciphertext',
        envelope.nonce,
        groupKeyData.key,
        'AMR-OWNER',
        clusterId,
        epoch,
        envelope.version
      );
    } catch {
      invalidCiphertextFailed = true;
    }
    recordResult('test_invalid_ciphertext_rejection', invalidCiphertextFailed, 'Invalid ciphertext strictly rejected');

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

    // 8. Endpoint rejects version !== 2
    const resV1 = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: envelope.ciphertext,
        nonce: envelope.nonce,
        version: 1,
        keyEpoch: 1
      })
    });
    recordResult('endpoint_rejects_version_1', resV1.status === 400 && resV1.json?.error?.code === 'UNSUPPORTED_VERSION', `Status: ${resV1.status}, code: ${resV1.json?.error?.code}`);

    // 9. Endpoint accepts valid shared-key message with recipients
    const resValidMsg = await helperFetch(`/api/clusters/${clusterRowId}/messages`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        ciphertext: envelope.ciphertext,
        nonce: envelope.nonce,
        version: 2,
        keyEpoch: 1,
        recipientAgentIds: [peerUser.agentId]
      })
    });
    recordResult('endpoint_accepts_valid_shared_key_message', resValidMsg.status === 201 && resValidMsg.json?.success === true, `Status: ${resValidMsg.status}, id: ${resValidMsg.json?.data?.id}`);

    // 10. Verify GET messages returns recipients for each message
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

    // 11. Key distribution and rotation endpoints test
    const resDist = await helperFetch(`/api/clusters/${clusterRowId}/key-distribution`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        epoch: 1,
        keyFingerprint: groupKeyData.fingerprint,
        distributions: [
          {
            recipientAgentId: peerUser.agentId,
            encryptedKeyPackage: wrappedPackage
          }
        ]
      })
    });
    recordResult('endpoint_key_distribution_success', resDist.status === 201 && resDist.json?.success === true, `Status: ${resDist.status}`);

    const resRotate = await helperFetch(`/api/clusters/${clusterRowId}/rotate-key`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
      body: JSON.stringify({
        nextEpoch: 2,
        keyFingerprint: 'ROTATED_FP',
        distributions: [
          {
            recipientAgentId: peerUser.agentId,
            encryptedKeyPackage: wrappedPackage
          }
        ]
      })
    });
    recordResult('endpoint_rotate_key_success', resRotate.status === 200 && resRotate.json?.success === true, `Status: ${resRotate.status}`);

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
