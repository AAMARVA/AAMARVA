import express from 'express';
import http from 'http';
import clusterRouter from '../routes/clusterRoutes';
import { getSupabaseClient, setSupabaseClient } from '../supabase';
import { getClusterTables } from '../routes/clusterRoutes';

export async function runClusterMessagingSecurityTests(): Promise<Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }>> {
  console.log('\n=== AAMARVA CLUSTER MESSAGING SECURITY VERIFICATION SUITE ===\n');
  const results: Record<string, { status: 'PASSED' | 'FAILED'; reason?: string }> = {};

  const recordResult = (id: string, success: boolean, reason?: string) => {
    results[id] = { status: success ? 'PASSED' : 'FAILED', reason };
    console.log(`[${success ? 'PASSED' : 'FAILED'}] ${id}${reason ? `: ${reason}` : ''}`);
  };

  // Setup test Express app
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  // Test authentication injector middleware
  app.use((req: any, _res: any, next: any) => {
    const testUserId = req.headers['x-test-user-id'];
    const testAgentId = req.headers['x-test-agent-id'];
    if (testUserId) {
      req.user = {
        id: testUserId,
        agentId: testAgentId || 'AMR-TEST-AGENT',
        type: 'agent'
      };
      req.authType = 'agent';
    }
    next();
  });
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

  const validJwk = JSON.stringify({
    kty: 'EC',
    crv: 'P-256',
    x: 'f83OJ3D2xFmT5vU3B3GLr00vU3B3GLr00vU3B3GLr00',
    y: 'x_da7W6tV6i0zD16C4nB5zD16C4nB5zD16C4nB5zD16'
  });

  const validCiphertext = Buffer.from('Confidential encrypted cluster communication').toString('base64');
  const validNonce = Buffer.from('123456789012').toString('base64'); // 12 bytes

  const origSupabase = getSupabaseClient();
  const tables = await getClusterTables(origSupabase);

  const clusterId = 'cluster_sec_test_' + Date.now();
  const dissolvedClusterId = 'cluster_dissolved_' + Date.now();
  const ownerUserId = 'user_sec_owner_' + Date.now();
  const peerUserId = 'user_sec_peer_' + Date.now();
  const nonMemberUserId = 'user_sec_nonmember_' + Date.now();

  // Multi-member test cluster IDs
  const multiClusterId = 'cluster_multi_test_' + Date.now();
  const multiOwnerUserId = 'user_multi_owner_' + Date.now();
  const memberAUserId = 'user_multi_member_a_' + Date.now();
  const memberBUserId = 'user_multi_member_b_' + Date.now();
  const memberCUserId = 'user_multi_member_c_' + Date.now();

  // In-memory auth metadata store for mock
  const userMetadataStore: Record<string, any> = {
    [ownerUserId]: { e2eePublicKey: validJwk, e2eeKeyEpoch: 1 },
    [peerUserId]: { e2eePublicKey: validJwk, e2eeKeyEpoch: 1 },
    [nonMemberUserId]: { e2eePublicKey: validJwk, e2eeKeyEpoch: 1 },
    // Multi-member cluster users
    [multiOwnerUserId]: { e2eePublicKey: validJwk, e2eeKeyEpoch: 3 },
    [memberAUserId]: { e2eePublicKey: validJwk, e2eeKeyEpoch: 3 },
    [memberBUserId]: { e2eePublicKey: validJwk, e2eeKeyEpoch: 3 },
    [memberCUserId]: { e2eePublicKey: validJwk, e2eeKeyEpoch: 3 }
  };

  // Mock DB state
  const mockMembers = [
    { id: 'm1', clusterId, userId: ownerUserId, agentId: 'AMR-OWNER', role: 'admin', status: 'active' },
    { id: 'm2', clusterId, userId: peerUserId, agentId: 'AMR-PEER', role: 'member', status: 'active' },
    // Multi-member cluster members (Owner + Members A, B, C)
    { id: 'mm_owner', clusterId: multiClusterId, userId: multiOwnerUserId, agentId: 'AMR-M-OWNER', role: 'admin', status: 'active' },
    { id: 'mm_a', clusterId: multiClusterId, userId: memberAUserId, agentId: 'AMR-M-A', role: 'member', status: 'active' },
    { id: 'mm_b', clusterId: multiClusterId, userId: memberBUserId, agentId: 'AMR-M-B', role: 'member', status: 'active' },
    { id: 'mm_c', clusterId: multiClusterId, userId: memberCUserId, agentId: 'AMR-M-C', role: 'member', status: 'active' }
  ];

  const mockClusters = [
    { id: clusterId, name: 'Security Cluster', status: 'active', ownerUserId },
    { id: dissolvedClusterId, name: 'Dissolved Cluster', status: 'dissolved', ownerUserId },
    { id: multiClusterId, name: 'Multi-Member E2EE Cluster', status: 'active', ownerUserId: multiOwnerUserId }
  ];

  const mockMessages: any[] = [];

  const mockClient = {
    rpc: (...args: any[]) => (origSupabase as any).rpc(...args),
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const meta = userMetadataStore[id] || {};
          return {
            data: {
              user: {
                id,
                user_metadata: meta
              }
            },
            error: null
          };
        }
      }
    },
    from: (tableName: string) => {
      if (tableName === tables.clusters || tableName === 'clusters') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                const found = mockClusters.find(c => c.id === val);
                return { data: found || null, error: null };
              }
            })
          })
        };
      }
      if (tableName === tables.members || tableName === 'cluster_members') {
        return {
          select: (cols?: string) => ({
            eq: (_col1: string, val1: string) => ({
              eq: (_col2: string, val2: string) => ({
                maybeSingle: async () => {
                  const found = mockMembers.find(m => m.clusterId === val1 && m.userId === val2);
                  return { data: found || null, error: null };
                }
              }),
              neq: (_col2: string, val2: string) => ({
                neq: (_col3: string, val3: string) => {
                  // e.g. .neq('userId', userId).neq('status', 'dissolved')
                  const peers = mockMembers.filter(m => m.clusterId === val1 && m.userId !== val2 && m.status !== val3);
                  return { data: peers, error: null };
                }
              })
            })
          })
        };
      }
      if (tableName === tables.messages || tableName === 'cluster_messages') {
        return {
          insert: async (msg: any) => {
            mockMessages.push(msg);
            return { error: null };
          },
          select: () => ({
            eq: (_col: string, val: string) => ({
              order: () => ({
                data: mockMessages.filter(m => m.clusterId === val),
                error: null
              })
            })
          })
        };
      }
      return origSupabase.from(tableName);
    }
  };

  setSupabaseClient(mockClient);

  try {
    const ownerHeaders = { 'x-test-user-id': ownerUserId, 'x-test-agent-id': 'AMR-OWNER' };

    // TEST 1: Plaintext "content" rejected with 400 PLAINTEXT_REJECTED
    const res1 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ content: 'Hello plain text' })
    });
    recordResult(
      'cluster_test1_plaintext_content_rejected',
      res1.status === 400 && res1.json?.error?.code === 'PLAINTEXT_REJECTED',
      `HTTP ${res1.status}, code: ${res1.json?.error?.code}`
    );

    // TEST 2: Plaintext "message" rejected with 400 PLAINTEXT_REJECTED
    const res2 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ message: 'Hello plaintext message' })
    });
    recordResult(
      'cluster_test2_plaintext_message_rejected',
      res2.status === 400 && res2.json?.error?.code === 'PLAINTEXT_REJECTED',
      `HTTP ${res2.status}, code: ${res2.json?.error?.code}`
    );

    // TEST 3: Missing ciphertext rejected with 400 MISSING_CIPHERTEXT
    const res3 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test3_missing_ciphertext_rejected',
      res3.status === 400 && res3.json?.error?.code === 'MISSING_CIPHERTEXT',
      `HTTP ${res3.status}, code: ${res3.json?.error?.code}`
    );

    // TEST 4: Empty / whitespace ciphertext rejected with 400 EMPTY_CIPHERTEXT
    const res4 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: '   ', nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test4_empty_ciphertext_rejected',
      res4.status === 400 && res4.json?.error?.code === 'EMPTY_CIPHERTEXT',
      `HTTP ${res4.status}, code: ${res4.json?.error?.code}`
    );

    // TEST 5: Invalid Base64 ciphertext encoding rejected with 400 INVALID_CIPHERTEXT_ENCODING
    const res5 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: '***not_base64***', nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test5_invalid_ciphertext_encoding_rejected',
      res5.status === 400 && res5.json?.error?.code === 'INVALID_CIPHERTEXT_ENCODING',
      `HTTP ${res5.status}, code: ${res5.json?.error?.code}`
    );

    // TEST 6: Missing nonce rejected with 400 INVALID_NONCE
    const res6 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test6_missing_nonce_rejected',
      res6.status === 400 && res6.json?.error?.code === 'INVALID_NONCE',
      `HTTP ${res6.status}, code: ${res6.json?.error?.code}`
    );

    // TEST 7: Invalid Base64 nonce rejected with 400 INVALID_NONCE
    const res7 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: '???notbase64???', version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test7_invalid_nonce_encoding_rejected',
      res7.status === 400 && res7.json?.error?.code === 'INVALID_NONCE',
      `HTTP ${res7.status}, code: ${res7.json?.error?.code}`
    );

    // TEST 8: Wrong nonce length (not 12 bytes) rejected with 400 INVALID_NONCE
    const res8 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: 'QUFB', version: 1, keyEpoch: 1 }) // 3 bytes
    });
    recordResult(
      'cluster_test8_wrong_nonce_length_rejected',
      res8.status === 400 && res8.json?.error?.code === 'INVALID_NONCE',
      `HTTP ${res8.status}, code: ${res8.json?.error?.code}`
    );

    // TEST 9: Unsupported version rejected with 400 UNSUPPORTED_VERSION
    const res9 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 99, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test9_unsupported_version_rejected',
      res9.status === 400 && res9.json?.error?.code === 'UNSUPPORTED_VERSION',
      `HTTP ${res9.status}, code: ${res9.json?.error?.code}`
    );

    // TEST 10: Invalid keyEpoch (string "1") rejected with 400 INVALID_KEY_EPOCH
    const res10 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: '1' })
    });
    recordResult(
      'cluster_test10_invalid_key_epoch_rejected',
      res10.status === 400 && res10.json?.error?.code === 'INVALID_KEY_EPOCH',
      `HTTP ${res10.status}, code: ${res10.json?.error?.code}`
    );

    // TEST 11: Invalid sequence (negative -1) rejected with 400 INVALID_SEQUENCE
    const res11 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: 1, sequence: -1 })
    });
    recordResult(
      'cluster_test11_invalid_sequence_rejected',
      res11.status === 400 && res11.json?.error?.code === 'INVALID_SEQUENCE',
      `HTTP ${res11.status}, code: ${res11.json?.error?.code}`
    );

    // TEST 12: Ciphertext exceeding size limit rejected with 400 PAYLOAD_TOO_LARGE
    const hugeCiphertext = 'A'.repeat(250000);
    const res12 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: hugeCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test12_payload_too_large_rejected',
      res12.status === 400 && res12.json?.error?.code === 'PAYLOAD_TOO_LARGE',
      `HTTP ${res12.status}, code: ${res12.json?.error?.code}`
    );

    // TEST 13: Non-member sender rejected with 403 FORBIDDEN
    const res13 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: { 'x-test-user-id': nonMemberUserId, 'x-test-agent-id': 'AMR-NONMEMBER' },
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test13_non_member_rejected',
      res13.status === 403 && res13.json?.error?.code === 'FORBIDDEN',
      `HTTP ${res13.status}, code: ${res13.json?.error?.code}`
    );

    // TEST 14: Dissolved cluster rejected with 403 CLUSTER_DISSOLVED
    const res14 = await helperFetch(`/api/clusters/${dissolvedClusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test14_dissolved_cluster_rejected',
      res14.status === 403 && res14.json?.error?.code === 'CLUSTER_DISSOLVED',
      `HTTP ${res14.status}, code: ${res14.json?.error?.code}`
    );

    // TEST 15: Nonexistent cluster rejected with 404 CLUSTER_NOT_FOUND
    const res15 = await helperFetch(`/api/clusters/cluster_nonexistent_999/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test15_nonexistent_cluster_rejected',
      res15.status === 404 && res15.json?.error?.code === 'CLUSTER_NOT_FOUND',
      `HTTP ${res15.status}, code: ${res15.json?.error?.code}`
    );

    // TEST 16: Sender without registered E2EE public key rejected with 403 E2EE_KEY_REQUIRED
    const origOwnerKey = userMetadataStore[ownerUserId].e2eePublicKey;
    userMetadataStore[ownerUserId].e2eePublicKey = null;
    const res16 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test16_sender_no_public_key_rejected',
      res16.status === 403 && res16.json?.error?.code === 'E2EE_KEY_REQUIRED',
      `HTTP ${res16.status}, code: ${res16.json?.error?.code}`
    );

    // TEST 17: Sender with malformed public key rejected with 403 E2EE_KEY_REQUIRED
    userMetadataStore[ownerUserId].e2eePublicKey = JSON.stringify({ kty: 'RSA', n: 'bad' });
    const res17 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test17_sender_malformed_public_key_rejected',
      res17.status === 403 && res17.json?.error?.code === 'E2EE_KEY_REQUIRED',
      `HTTP ${res17.status}, code: ${res17.json?.error?.code}`
    );
    // Restore owner key
    userMetadataStore[ownerUserId].e2eePublicKey = origOwnerKey;

    // TEST 18: Peer member without registered E2EE public key rejected with 400 PEER_KEY_REQUIRED
    const origPeerKey = userMetadataStore[peerUserId].e2eePublicKey;
    userMetadataStore[peerUserId].e2eePublicKey = null;
    const res18 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test18_peer_no_public_key_rejected',
      res18.status === 400 && res18.json?.error?.code === 'PEER_KEY_REQUIRED',
      `HTTP ${res18.status}, code: ${res18.json?.error?.code}`
    );

    // TEST 19: Peer member with malformed public key rejected with 400 PEER_KEY_REQUIRED
    userMetadataStore[peerUserId].e2eePublicKey = '{"kty":"INVALID"}';
    const res19 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test19_peer_malformed_public_key_rejected',
      res19.status === 400 && res19.json?.error?.code === 'PEER_KEY_REQUIRED',
      `HTTP ${res19.status}, code: ${res19.json?.error?.code}`
    );
    // Restore peer key
    userMetadataStore[peerUserId].e2eePublicKey = origPeerKey;

    // TEST 20: Valid encrypted cluster message succeeds with 201 Created
    const res20 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 1,
        keyEpoch: 1,
        sequence: 1
      })
    });
    recordResult(
      'cluster_test20_valid_cluster_message_accepted',
      res20.status === 201 && res20.json?.success === true && Boolean(res20.json?.messageId || res20.json?.data?.id),
      `HTTP ${res20.status}, messageId: ${res20.json?.messageId || res20.json?.data?.id}`
    );

    // TEST 21: Active member can GET cluster messages (200 OK)
    const res21 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'GET',
      headers: ownerHeaders
    });
    recordResult(
      'cluster_test21_get_cluster_messages_authorized',
      res21.status === 200 && res21.json?.success === true && Array.isArray(res21.json?.data) && res21.json.data.length > 0,
      `HTTP ${res21.status}, messages count: ${res21.json?.data?.length}`
    );

    // TEST 22: Non-member cannot GET cluster messages (403 FORBIDDEN)
    const res22 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'GET',
      headers: { 'x-test-user-id': nonMemberUserId, 'x-test-agent-id': 'AMR-NONMEMBER' }
    });
    recordResult(
      'cluster_test22_get_cluster_messages_non_member_rejected',
      res22.status === 403 && res22.json?.error?.code === 'FORBIDDEN',
      `HTTP ${res22.status}, code: ${res22.json?.error?.code}`
    );

    // TEST 23: Dissolved cluster messages cannot be fetched (403 CLUSTER_DISSOLVED)
    const res23 = await helperFetch(`/api/clusters/${dissolvedClusterId}/messages`, {
      method: 'GET',
      headers: ownerHeaders
    });
    recordResult(
      'cluster_test23_get_cluster_messages_dissolved_cluster_rejected',
      res23.status === 403 && res23.json?.error?.code === 'CLUSTER_DISSOLVED',
      `HTTP ${res23.status}, code: ${res23.json?.error?.code}`
    );

    // TEST 24: Verify direct database record persistence (content = null, complete E2EE envelope)
    const persistedMsg = mockMessages.find(m => m.clusterId === clusterId);
    const dbPersistedValid = Boolean(
      persistedMsg &&
      (persistedMsg.content === null || persistedMsg.content === undefined) &&
      persistedMsg.ciphertext === validCiphertext &&
      persistedMsg.nonce === validNonce &&
      persistedMsg.version === 1 &&
      persistedMsg.keyEpoch === 1 &&
      persistedMsg.sequence === 1
    );
    recordResult(
      'cluster_test24_persisted_envelope_and_content_null',
      dbPersistedValid,
      dbPersistedValid
        ? 'Verified database record content === null, ciphertext, nonce, version = 1, keyEpoch = 1, sequence = 1'
        : `Database record mismatch: ${JSON.stringify(persistedMsg)}`
    );

    // TEST 25: Unregistered / exceeding keyEpoch rejected with 400 INVALID_KEY_EPOCH
    const res25 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 1,
        keyEpoch: 99
      })
    });
    recordResult(
      'cluster_test25_exceeding_key_epoch_rejected',
      res25.status === 400 && (res25.json?.error?.code === 'INVALID_KEY_EPOCH' || res25.json?.error?.code === 'KEY_EPOCH_NOT_FOUND'),
      `HTTP ${res25.status}, code: ${res25.json?.error?.code}`
    );

    // TEST 26: GET cluster messages returns complete persisted metadata (content = null, version, keyEpoch, sequence)
    const fetchedMsg = res21.json?.data?.[0];
    const getMetadataValid = Boolean(
      fetchedMsg &&
      fetchedMsg.content === null &&
      fetchedMsg.version === 1 &&
      fetchedMsg.keyEpoch === 1 &&
      fetchedMsg.sequence === 1
    );
    recordResult(
      'cluster_test26_get_messages_returns_persisted_metadata',
      getMetadataValid,
      getMetadataValid
        ? 'Verified GET response contains content: null, version: 1, keyEpoch: 1, sequence: 1'
        : `GET response metadata mismatch: ${JSON.stringify(fetchedMsg)}`
    );

    // Multi-member Headers for Owner
    const multiOwnerHeaders = { 'x-test-user-id': multiOwnerUserId, 'x-test-agent-id': 'AMR-M-OWNER' };

    // MULTI-MEMBER TEST 1 (Test 27): All members (Owner, A, B, C) have requested epoch 3 -> SUCCESS
    const res27 = await helperFetch(`/api/clusters/${multiClusterId}/messages`, {
      method: 'POST',
      headers: multiOwnerHeaders,
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 1,
        keyEpoch: 3,
        sequence: 10
      })
    });
    const multiMsg1 = mockMessages.find(m => m.clusterId === multiClusterId && m.keyEpoch === 3);
    recordResult(
      'cluster_test27_multimember_all_members_epoch3_succeeds',
      res27.status === 201 && res27.json?.success === true && Boolean(multiMsg1),
      `HTTP ${res27.status}, persisted keyEpoch=3 message found: ${Boolean(multiMsg1)}`
    );

    // MULTI-MEMBER TEST 2 (Test 28): One member (B) lacks requested epoch 3 (B has epoch 2) -> REJECT
    userMetadataStore[memberBUserId].e2eeKeyEpoch = 2; // Member B only has epoch 2
    const prevMsgCount = mockMessages.length;
    const res28 = await helperFetch(`/api/clusters/${multiClusterId}/messages`, {
      method: 'POST',
      headers: multiOwnerHeaders,
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 1,
        keyEpoch: 3,
        sequence: 11
      })
    });
    const noNewMsg28 = mockMessages.length === prevMsgCount;
    recordResult(
      'cluster_test28_multimember_one_lacks_epoch3_rejected',
      res28.status === 400 && (res28.json?.error?.code === 'INVALID_KEY_EPOCH' || res28.json?.error?.code === 'KEY_EPOCH_NOT_FOUND') && noNewMsg28,
      `HTTP ${res28.status}, code: ${res28.json?.error?.code}, message uninserted: ${noNewMsg28}`
    );

    // MULTI-MEMBER TEST 3 (Test 29): One member (B) has NO E2EE public key -> REJECT
    userMetadataStore[memberBUserId].e2eeKeyEpoch = 3; // Epoch 3
    userMetadataStore[memberBUserId].e2eePublicKey = null; // Missing public key
    const res29 = await helperFetch(`/api/clusters/${multiClusterId}/messages`, {
      method: 'POST',
      headers: multiOwnerHeaders,
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 1,
        keyEpoch: 1
      })
    });
    recordResult(
      'cluster_test29_multimember_one_no_public_key_rejected',
      res29.status === 400 && res29.json?.error?.code === 'PEER_KEY_REQUIRED',
      `HTTP ${res29.status}, code: ${res29.json?.error?.code}`
    );

    // MULTI-MEMBER TEST 4 (Test 30): All keys exist but one member (B) lacks requested epoch 3 -> REJECT
    userMetadataStore[memberBUserId].e2eePublicKey = validJwk; // Restore key
    userMetadataStore[memberBUserId].e2eeKeyEpoch = 2; // Member B lacks epoch 3
    const res30 = await helperFetch(`/api/clusters/${multiClusterId}/messages`, {
      method: 'POST',
      headers: multiOwnerHeaders,
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 1,
        keyEpoch: 3
      })
    });
    recordResult(
      'cluster_test30_multimember_key_exists_lacks_epoch_rejected',
      res30.status === 400 && (res30.json?.error?.code === 'INVALID_KEY_EPOCH' || res30.json?.error?.code === 'KEY_EPOCH_NOT_FOUND'),
      `HTTP ${res30.status}, code: ${res30.json?.error?.code}`
    );

    // MULTI-MEMBER TEST 5 (Test 31): All members have matching key + epoch 5 -> SUCCESS with envelope verification
    userMetadataStore[multiOwnerUserId].e2eeKeyEpoch = 5;
    userMetadataStore[memberAUserId].e2eeKeyEpoch = 5;
    userMetadataStore[memberBUserId].e2eeKeyEpoch = 5;
    userMetadataStore[memberCUserId].e2eeKeyEpoch = 5;

    const res31 = await helperFetch(`/api/clusters/${multiClusterId}/messages`, {
      method: 'POST',
      headers: multiOwnerHeaders,
      body: JSON.stringify({
        ciphertext: validCiphertext,
        nonce: validNonce,
        version: 1,
        keyEpoch: 5,
        sequence: 42
      })
    });

    const persistedEpoch5 = mockMessages.find(m => m.clusterId === multiClusterId && m.keyEpoch === 5);
    const validEnvelope31 = Boolean(
      res31.status === 201 &&
      res31.json?.success === true &&
      persistedEpoch5 &&
      (persistedEpoch5.content === null || persistedEpoch5.content === undefined) &&
      persistedEpoch5.ciphertext === validCiphertext &&
      persistedEpoch5.nonce === validNonce &&
      persistedEpoch5.version === 1 &&
      persistedEpoch5.keyEpoch === 5 &&
      persistedEpoch5.sequence === 42
    );

    recordResult(
      'cluster_test31_multimember_all_epoch5_succeeds_and_verifies_envelope',
      validEnvelope31,
      validEnvelope31
        ? 'HTTP 201, Verified persisted envelope: content === null, keyEpoch = 5, sequence = 42'
        : `Failed verification: HTTP ${res31.status}, msg: ${JSON.stringify(persistedEpoch5)}`
    );

  } finally {
    setSupabaseClient(origSupabase);
    server.close();
  }

  return results;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('clusterMessagingSecurityTests')) {
  runClusterMessagingSecurityTests().then(results => {
    const hasFailures = Object.values(results).some(r => r.status === 'FAILED');
    if (hasFailures) {
      console.error('\n[FAILURE] One or more cluster messaging security tests failed.');
      process.exit(1);
    } else {
      console.log('\n[SUCCESS] All cluster messaging security tests PASSED.');
      process.exit(0);
    }
  }).catch(err => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
  });
}
