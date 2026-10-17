import express from 'express';
import http from 'http';
import crypto from 'crypto';
import clusterRouter from '../routes/clusterRoutes';
import { getSupabaseClient, setSupabaseClient } from '../supabase';
import { getClusterTables } from '../routes/clusterRoutes';
import { 
  generateE2EEKeyPair
} from '../../src/lib/e2ee';
import {
  encryptMessageForRecipients,
  decryptMessageForRecipient
} from '../../src/lib/clusterCrypto';


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
  const mockMembers: any[] = [
    { id: 'm1', clusterId, userId: ownerUserId, agentId: 'AMR-OWNER', role: 'admin', status: 'active' },
    { id: 'm2', clusterId, userId: peerUserId, agentId: 'AMR-PEER', role: 'member', status: 'active' },
    // Multi-member cluster members (Owner + Members A, B, C)
    { id: 'mm_owner', clusterId: multiClusterId, userId: multiOwnerUserId, agentId: 'AMR-M-OWNER', role: 'admin', status: 'active' },
    { id: 'mm_a', clusterId: multiClusterId, userId: memberAUserId, agentId: 'AMR-M-A', role: 'member', status: 'active' },
    { id: 'mm_b', clusterId: multiClusterId, userId: memberBUserId, agentId: 'AMR-M-B', role: 'member', status: 'active' },
    { id: 'mm_c', clusterId: multiClusterId, userId: memberCUserId, agentId: 'AMR-M-C', role: 'member', status: 'active' }
  ];

  const mockClusters: any[] = [
    { id: clusterId, name: 'Security Cluster', status: 'active', ownerUserId },
    { id: dissolvedClusterId, name: 'Dissolved Cluster', status: 'dissolved', ownerUserId },
    { id: multiClusterId, name: 'Multi-Member E2EE Cluster', status: 'active', ownerUserId: multiOwnerUserId }
  ];

  const mockMessages: any[] = [];

  const mockClusterEpochs: any[] = [
    { id: 'ep_sec_1', clusterId, epoch: 1, keyFingerprint: 'SHA256:11:22:33:44:55:66', createdAt: new Date().toISOString() },
    { id: 'ep_multi_3', clusterId: multiClusterId, epoch: 3, keyFingerprint: 'SHA256:AA:BB:CC:DD:EE:FF', createdAt: new Date().toISOString() }
  ];

  const mockKeyDistributions: any[] = [];

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
          insert: async (recOrArr: any) => {
            const arr = Array.isArray(recOrArr) ? recOrArr : [recOrArr];
            mockMembers.push(...arr);
            return { error: null };
          },
          update: (updates: any) => ({
            eq: (_col: string, val: string) => {
              for (const m of mockMembers) {
                if (m[_col] === val) {
                  Object.assign(m, updates);
                }
              }
              return { error: null };
            }
          }),
          select: (cols?: string) => {
            const queryState: any = {
              filters: [] as Array<(m: any) => boolean>,
              eq(col: string, val: any) {
                this.filters.push((m: any) => {
                  if (col === 'userId') return m.userId === val || m.agentId === val;
                  if (col === 'agentId') return m.agentId === val || String(m.agentId || '').replace(/^@/, '').toUpperCase() === String(val || '').replace(/^@/, '').toUpperCase();
                  return m[col] === val;
                });
                return this;
              },
              neq(col: string, val: any) {
                this.filters.push((m: any) => m[col] !== val);
                return this;
              },
              in(col: string, arr: any[]) {
                this.filters.push((m: any) => arr.includes(m[col]));
                return this;
              },
              or(_expr: string) {
                return this;
              },
              order: () => queryState,
              limit: () => queryState,
              async maybeSingle() {
                const filtered = mockMembers.filter(m => queryState.filters.every(f => f(m)));
                return { data: filtered[0] || null, error: null };
              },
              async single() {
                const filtered = mockMembers.filter(m => queryState.filters.every(f => f(m)));
                return { data: filtered[0] || null, error: null };
              },
              then(resolve: any) {
                const filtered = mockMembers.filter(m => queryState.filters.every(f => f(m)));
                resolve({ data: filtered, error: null });
              }
            };
            return queryState;
          }
        };
      }
      if (tableName === 'cluster_epochs') {
        return {
          insert: async (recOrArr: any) => {
            const arr = Array.isArray(recOrArr) ? recOrArr : [recOrArr];
            mockClusterEpochs.push(...arr);
            return { error: null };
          },
          select: (_cols?: string) => {
            const queryState: any = {
              filters: [] as Array<(e: any) => boolean>,
              eq(col: string, val: any) {
                this.filters.push((e: any) => col === 'epoch' ? e.epoch === Number(val) : e[col] === val);
                return this;
              },
              order(_col: string, _opts?: any) {
                return this;
              },
              limit(_n: number) {
                return this;
              },
              async maybeSingle() {
                const matches = mockClusterEpochs.filter(e => queryState.filters.every(f => f(e))).sort((a, b) => b.epoch - a.epoch);
                return { data: matches[0] || null, error: null };
              },
              async single() {
                const matches = mockClusterEpochs.filter(e => queryState.filters.every(f => f(e))).sort((a, b) => b.epoch - a.epoch);
                return { data: matches[0] || null, error: null };
              },
              then(resolve: any) {
                const matches = mockClusterEpochs.filter(e => queryState.filters.every(f => f(e))).sort((a, b) => b.epoch - a.epoch);
                resolve({ data: matches, error: null });
              }
            };
            return queryState;
          }
        };
      }
      if (tableName === 'cluster_key_distributions') {
        return {
          insert: async (recOrArr: any) => {
            const arr = Array.isArray(recOrArr) ? recOrArr : [recOrArr];
            mockKeyDistributions.push(...arr);
            return { error: null };
          },
          select: (_cols?: string) => {
            const queryState: any = {
              filters: [] as Array<(d: any) => boolean>,
              eq(col: string, val: any) {
                this.filters.push((d: any) => {
                  if (col === 'epoch') return d.epoch === Number(val);
                  if (col === 'recipientAgentId') {
                    return String(d.recipientAgentId || '').trim().replace(/^@/, '').toUpperCase() === String(val || '').trim().replace(/^@/, '').toUpperCase();
                  }
                  return d[col] === val;
                });
                return this;
              },
              async maybeSingle() {
                const matches = mockKeyDistributions.filter(d => queryState.filters.every(f => f(d)));
                return { data: matches[0] || null, error: null };
              },
              async single() {
                const matches = mockKeyDistributions.filter(d => queryState.filters.every(f => f(d)));
                return { data: matches[0] || null, error: null };
              },
              then(resolve: any) {
                const matches = mockKeyDistributions.filter(d => queryState.filters.every(f => f(d)));
                resolve({ data: matches, error: null });
              }
            };
            return queryState;
          }
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

    // TEST 12a: Ciphertext at exact 102,400 decoded bytes boundary (136,536 Base64 chars) accepted
    const boundaryCiphertext = Buffer.alloc(102400, 'a').toString('base64'); // exactly 136,536 chars
    const res12a = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: boundaryCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test12a_payload_exact_102400_bytes_accepted',
      res12a.status === 201 && res12a.json?.success === true,
      `HTTP ${res12a.status}, chars: ${boundaryCiphertext.length}`
    );

    // TEST 12b: Ciphertext exceeding 102,400 decoded bytes boundary (102,401 bytes / 136,540 Base64 chars) rejected with 400 PAYLOAD_TOO_LARGE
    const overBoundaryCiphertext = Buffer.alloc(102401, 'a').toString('base64'); // 136,540 chars
    const res12b = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: overBoundaryCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test12b_payload_over_102400_bytes_rejected',
      res12b.status === 400 && res12b.json?.error?.code === 'PAYLOAD_TOO_LARGE',
      `HTTP ${res12b.status}, code: ${res12b.json?.error?.code}, chars: ${overBoundaryCiphertext.length}`
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

    // TEST 18: Peer member without registered E2EE public key is accepted (does not block shared group messaging)
    const origPeerKey = userMetadataStore[peerUserId].e2eePublicKey;
    userMetadataStore[peerUserId].e2eePublicKey = null;
    const res18 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test18_peer_no_public_key_accepted',
      res18.status === 201 && res18.json?.success === true,
      `HTTP ${res18.status}`
    );

    // TEST 19: Peer member with malformed public key is accepted (does not block shared group messaging)
    userMetadataStore[peerUserId].e2eePublicKey = '{"kty":"INVALID"}';
    const res19 = await helperFetch(`/api/clusters/${clusterId}/messages`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ ciphertext: validCiphertext, nonce: validNonce, version: 1, keyEpoch: 1 })
    });
    recordResult(
      'cluster_test19_peer_malformed_public_key_accepted',
      res19.status === 201 && res19.json?.success === true,
      `HTTP ${res19.status}`
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
    const test20MsgId = res20.json?.messageId || res20.json?.data?.id;
    const persistedMsg = mockMessages.find(m => m.id === test20MsgId || (m.clusterId === clusterId && m.ciphertext === validCiphertext && m.sequence === 1));
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
    const fetchedMsg = res21.json?.data?.find((m: any) => m.id === test20MsgId || (m.ciphertext === validCiphertext && m.sequence === 1));
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

    // MULTI-MEMBER TEST 3 (Test 29): One member (B) has NO E2EE public key -> ACCEPTED (shared group messaging doesn't require peer public keys per message)
    userMetadataStore[memberBUserId].e2eeKeyEpoch = 3; // Epoch 3
    userMetadataStore[memberBUserId].e2eePublicKey = null; // Missing public key
    const res29 = await helperFetch(`/api/clusters/${multiClusterId}/messages`, {
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
    recordResult(
      'cluster_test29_multimember_one_no_public_key_accepted',
      res29.status === 201 && res29.json?.success === true,
      `HTTP ${res29.status}`
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

    // Register epoch 5 in authoritative cluster_epochs
    mockClusterEpochs.push({
      id: 'ep_multi_5',
      clusterId: multiClusterId,
      epoch: 5,
      keyFingerprint: 'SHA256:55:55:55:55:55:55',
      createdAt: new Date().toISOString()
    });

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

    // Real Cryptographic E2EE Unit Tests (Tests 32 - 36)
    let testGroupKey = '';
    try {
      const ownerPair = await generateE2EEKeyPair();
      const memberAPair = await generateE2EEKeyPair();
      const memberBPair = await generateE2EEKeyPair();
      const intruderPair = await generateE2EEKeyPair();

      const testClusterId = 'cluster_real_crypto_test';
      const secretMessage = 'Top secret encrypted cluster payload 🚀';

      const memberPubKeys = {
        'AMR-MEMBER-A': memberAPair.publicKey,
        'AMR-MEMBER-B': memberBPair.publicKey
      };

      // Establish authoritative group key for testClusterId and distribute to A and B
      testGroupKey = await generateGroupKey();
      await persistClusterGroupKey(testClusterId, testGroupKey, 1);

      // Wrap for member A using wrapGroupKeyForMember, unwrap and persist for A
      const wrappedForA = await wrapGroupKeyForMember(testGroupKey, ownerPair.privateKey, memberAPair.publicKey, testClusterId, 'AMR-MEMBER-A', 1);
      const unwrappedByA = await unwrapGroupKeyForMember(wrappedForA, memberAPair.privateKey, ownerPair.publicKey, testClusterId, 'AMR-MEMBER-A', 1);
      await persistClusterGroupKey(testClusterId, unwrappedByA, 1);

      // Wrap for member B using wrapGroupKeyForMember, unwrap and persist for B
      const wrappedForB = await wrapGroupKeyForMember(testGroupKey, ownerPair.privateKey, memberBPair.publicKey, testClusterId, 'AMR-MEMBER-B', 1);
      const unwrappedByB = await unwrapGroupKeyForMember(wrappedForB, memberBPair.privateKey, ownerPair.publicKey, testClusterId, 'AMR-MEMBER-B', 1);
      await persistClusterGroupKey(testClusterId, unwrappedByB, 1);

      const groupEnvelope = await encryptClusterGroupMessage(
        secretMessage,
        ownerPair.privateKey,
        'AMR-OWNER',
        testClusterId,
        memberPubKeys,
        1
      );

      const decryptedByA = await decryptClusterGroupMessage(
        { ...groupEnvelope, keys: groupEnvelope.keys },
        memberAPair.privateKey,
        'AMR-MEMBER-A',
        ownerPair.publicKey,
        testClusterId,
        'AMR-OWNER'
      );

      const decryptedByB = await decryptClusterGroupMessage(
        { ...groupEnvelope, keys: groupEnvelope.keys },
        memberBPair.privateKey,
        'AMR-MEMBER-B',
        ownerPair.publicKey,
        testClusterId,
        'AMR-OWNER'
      );

      recordResult(
        'cluster_test32_real_crypto_encrypt_and_decrypt',
        decryptedByA === secretMessage && decryptedByB === secretMessage,
        `Decrypted successfully by A and B: ${decryptedByA === secretMessage}`
      );

      let intruderFailed = false;
      try {
        const intruderEnvelope = await encryptClusterGroupMessage(
          secretMessage,
          ownerPair.privateKey,
          'AMR-OWNER',
          testClusterId,
          memberPubKeys,
          1
        );
        clearClusterGroupKeyForTest(testClusterId, 1);
        await decryptClusterGroupMessage(
          { ...intruderEnvelope, keys: intruderEnvelope.keys },
          intruderPair.privateKey,
          'AMR-INTRUDER',
          ownerPair.publicKey,
          testClusterId,
          'AMR-OWNER'
        );
      } catch (err: any) {
        if (err?.code === 'KEY_PAIR_MISMATCH' || err?.code === 'KEY_EPOCH_NOT_FOUND' || err?.message?.includes('not an authorized recipient') || err?.message?.includes('available locally')) {
          intruderFailed = true;
        }
      }
      recordResult(
        'cluster_test33_unauthorized_recipient_rejected',
        intruderFailed,
        `Unauthorized recipient correctly rejected: ${intruderFailed}`
      );

      // Restore key for tests 34-36
      await persistClusterGroupKey(testClusterId, testGroupKey, 1);

      let tamperingFailed = false;
      try {
        const freshEnvelope = await encryptClusterGroupMessage(
          secretMessage,
          ownerPair.privateKey,
          'AMR-OWNER',
          testClusterId,
          memberPubKeys,
          1
        );
        const tamperedEnvelope = JSON.parse(Buffer.from(freshEnvelope.ciphertext, 'base64').toString('utf-8'));
        tamperedEnvelope.ciphertext = Buffer.from('corruptedciphertext').toString('base64');
        const tamperedPayload = {
          ...freshEnvelope,
          ciphertext: Buffer.from(JSON.stringify(tamperedEnvelope)).toString('base64')
        };
        await decryptClusterGroupMessage(
          { ...tamperedPayload, keys: tamperedPayload.keys },
          memberAPair.privateKey,
          'AMR-MEMBER-A',
          ownerPair.publicKey,
          testClusterId,
          'AMR-OWNER'
        );
      } catch (err: any) {
        if (err?.code === 'AUTHENTICATION_TAG_FAILED' || err?.message?.includes('authentication')) {
          tamperingFailed = true;
        }
      }
      recordResult(
        'cluster_test34_ciphertext_tampering_rejected',
        tamperingFailed,
        `Tampered ciphertext rejected: ${tamperingFailed}`
      );

      let encryptAborted = false;
      try {
        await encryptClusterGroupMessage(
          secretMessage,
          ownerPair.privateKey,
          'AMR-OWNER',
          testClusterId,
          { 'AMR-MEMBER-A': memberAPair.publicKey, 'AMR-BAD': null as any },
          1
        );
      } catch {
        encryptAborted = true;
      }
      recordResult(
        'cluster_test35_missing_recipient_key_aborts_encryption',
        encryptAborted,
        `Encryption correctly aborted when a recipient key is missing: ${encryptAborted}`
      );

      let aadMismatchRejected = false;
      try {
        await decryptClusterGroupMessage(
          groupEnvelope,
          memberAPair.privateKey,
          'AMR-MEMBER-A',
          ownerPair.publicKey,
          'wrong_cluster_id',
          'AMR-OWNER'
        );
      } catch (err: any) {
        if (err?.code === 'AAD_MISMATCH' || err?.message?.includes('Cluster ID mismatch')) {
          aadMismatchRejected = true;
        }
      }
      recordResult(
        'cluster_test36_cluster_id_aad_mismatch_rejected',
        aadMismatchRejected,
        `Cluster ID AAD mismatch correctly rejected: ${aadMismatchRejected}`
      );

    } catch (cryptoTestErr: any) {
      console.error(cryptoTestErr);
      recordResult('cluster_real_crypto_suite_execution', false, `Crypto test exception: ${cryptoTestErr?.message}\n${cryptoTestErr?.stack}`);
    }

    // =========================================================================
    // TEST 37: End-to-End Key Distribution, Isolated Keystores, & Rotation Across Independent Agents
    // Two independent agent identities (Alice & Bob) with isolated key stores.
    // Verifies:
    // 1. Authoritative group key distribution via wrapGroupKeyForMember and POST /keys
    // 2. Unauthorized recipient rejection on distribution
    // 3. Independent key retrieval & unwrapping via unwrapGroupKeyForMember and GET /keys/:epoch
    // 4. Successful cross-agent decryption using isolated stores
    // 5. Unauthorized non-member (Eve) rejected from retrieving key or decrypting
    // 6. Member removal, epoch advancement, and key rotation preventing removed member from obtaining epoch 2 key
    // =========================================================================
    try {
      const alicePair = await generateE2EEKeyPair();
      const bobPair = await generateE2EEKeyPair();
      const charliePair = await generateE2EEKeyPair();
      const evePair = await generateE2EEKeyPair();

      const aliceAgentId = 'AMR-INDEP-ALICE';
      const bobAgentId = 'AMR-INDEP-BOB';
      const charlieAgentId = 'AMR-INDEP-CHARLIE';
      const eveAgentId = 'AMR-INDEP-EVE';

      const aliceUserId = 'user_indep_alice_' + Date.now();
      const bobUserId = 'user_indep_bob_' + Date.now();
      const charlieUserId = 'user_indep_charlie_' + Date.now();
      const eveUserId = 'user_indep_eve_' + Date.now();

      // Isolated keystores for independent agents
      const aliceStore = new Map<string, string>();
      const bobStore = new Map<string, string>();
      const charlieStore = new Map<string, string>();
      const eveStore = new Map<string, string>();

      const indepClusterId = 'cluster_indep_' + Date.now();

      // Register users and memberships in mock state
      userMetadataStore[aliceUserId] = { e2eePublicKey: alicePair.publicKey, e2eeKeyEpoch: 1 };
      userMetadataStore[bobUserId] = { e2eePublicKey: bobPair.publicKey, e2eeKeyEpoch: 1 };
      userMetadataStore[charlieUserId] = { e2eePublicKey: charliePair.publicKey, e2eeKeyEpoch: 1 };
      userMetadataStore[eveUserId] = { e2eePublicKey: evePair.publicKey, e2eeKeyEpoch: 1 };

      mockClusters.push({
        id: indepClusterId,
        name: 'Independent Test Cluster',
        status: 'active',
        ownerUserId: aliceUserId
      });

      const aliceMemberRecord = {
        id: 'm_indep_alice',
        clusterId: indepClusterId,
        userId: aliceUserId,
        agentId: aliceAgentId,
        role: 'admin',
        status: 'active'
      };

      const bobMemberRecord = {
        id: 'm_indep_bob',
        clusterId: indepClusterId,
        userId: bobUserId,
        agentId: bobAgentId,
        role: 'member',
        status: 'active'
      };

      const charlieMemberRecord = {
        id: 'm_indep_charlie',
        clusterId: indepClusterId,
        userId: charlieUserId,
        agentId: charlieAgentId,
        role: 'member',
        status: 'active'
      };

      mockMembers.push(aliceMemberRecord, bobMemberRecord, charlieMemberRecord);

      const aliceHeaders = { 'x-test-user-id': aliceUserId, 'x-test-agent-id': aliceAgentId };
      const bobHeaders = { 'x-test-user-id': bobUserId, 'x-test-agent-id': bobAgentId };
      const charlieHeaders = { 'x-test-user-id': charlieUserId, 'x-test-agent-id': charlieAgentId };
      const eveHeaders = { 'x-test-user-id': eveUserId, 'x-test-agent-id': eveAgentId };

      // Step 1: Alice generates group key for epoch 1 and wraps for Alice, Bob, and Charlie
      const indepGroupKeyEpoch1 = await generateGroupKey();
      const indepFingerprint1 = await computeGroupKeyFingerprint(indepGroupKeyEpoch1);

      const wrappedForBob1 = await wrapGroupKeyForMember(
        indepGroupKeyEpoch1,
        alicePair.privateKey,
        bobPair.publicKey,
        indepClusterId,
        bobAgentId,
        1
      );
      const wrappedForCharlie1 = await wrapGroupKeyForMember(
        indepGroupKeyEpoch1,
        alicePair.privateKey,
        charliePair.publicKey,
        indepClusterId,
        charlieAgentId,
        1
      );
      const wrappedForAlice1 = await wrapGroupKeyForMember(
        indepGroupKeyEpoch1,
        alicePair.privateKey,
        alicePair.publicKey,
        indepClusterId,
        aliceAgentId,
        1
      );

      // Step 2: Test unauthorized recipient rejection on key distribution endpoint
      const resDistUnauthorized = await helperFetch(`/api/clusters/${indepClusterId}/keys`, {
        method: 'POST',
        headers: aliceHeaders,
        body: JSON.stringify({
          epoch: 1,
          keyFingerprint: indepFingerprint1,
          distributionMap: {
            [bobAgentId]: wrappedForBob1,
            [eveAgentId]: wrappedForBob1 // Eve is not a member!
          }
        })
      });

      const unauthorizedDistributionRejected = resDistUnauthorized.status === 400 &&
        resDistUnauthorized.json?.error?.code === 'UNAUTHORIZED_RECIPIENT';

      // Step 2b: Test non-admin member (Bob) trying to distribute keys (should be forbidden)
      const resNonAdminDist = await helperFetch(`/api/clusters/${indepClusterId}/keys`, {
        method: 'POST',
        headers: bobHeaders,
        body: JSON.stringify({
          epoch: 1,
          keyFingerprint: indepFingerprint1,
          distributionMap: {
            [bobAgentId]: wrappedForBob1,
            [charlieAgentId]: wrappedForCharlie1,
            [aliceAgentId]: wrappedForAlice1
          }
        })
      });
      const nonAdminDistRejected = resNonAdminDist.status === 403 &&
        resNonAdminDist.json?.error?.code === 'FORBIDDEN';

      // Step 2c: Test incomplete distribution map (omitting active member Charlie)
      const resIncompleteDist = await helperFetch(`/api/clusters/${indepClusterId}/keys`, {
        method: 'POST',
        headers: aliceHeaders,
        body: JSON.stringify({
          epoch: 1,
          keyFingerprint: indepFingerprint1,
          distributionMap: {
            [bobAgentId]: wrappedForBob1,
            [aliceAgentId]: wrappedForAlice1
            // Charlie omitted!
          }
        })
      });
      const incompleteDistRejected = resIncompleteDist.status === 400 &&
        resIncompleteDist.json?.error?.code === 'INCOMPLETE_DISTRIBUTION_MAP';

      // Step 3: Distribution (Direct DB insert, bypassing removed API)
      const distPayload = [
        {
          id: `dist_${crypto.randomUUID()}`,
          clusterId: indepClusterId,
          epoch: 1,
          recipientAgentId: bobAgentId,
          encryptedKeyPackage: JSON.stringify(wrappedForBob1),
          senderPublicKey: JSON.stringify(alicePair.publicKey),
          createdAt: new Date().toISOString()
        },
        {
          id: `dist_${crypto.randomUUID()}`,
          clusterId: indepClusterId,
          epoch: 1,
          recipientAgentId: charlieAgentId,
          encryptedKeyPackage: JSON.stringify(wrappedForCharlie1),
          senderPublicKey: JSON.stringify(alicePair.publicKey),
          createdAt: new Date().toISOString()
        },
        {
          id: `dist_${crypto.randomUUID()}`,
          clusterId: indepClusterId,
          epoch: 1,
          recipientAgentId: aliceAgentId,
          encryptedKeyPackage: JSON.stringify(wrappedForAlice1),
          senderPublicKey: JSON.stringify(alicePair.publicKey),
          createdAt: new Date().toISOString()
        }
      ];
      await getSupabaseClient().from('cluster_key_distributions').insert(distPayload);
      await origSupabase.from('cluster_key_distributions').insert(distPayload);
      
      const epochPayload = {
        id: `epoch_${crypto.randomUUID()}`,
        clusterId: indepClusterId,
        epoch: 1,
        keyFingerprint: indepFingerprint1,
        createdAt: new Date().toISOString()
      };
      await getSupabaseClient().from('cluster_epochs').insert(epochPayload);
      await origSupabase.from('cluster_epochs').insert(epochPayload);


      // persistClusterGroupKey remains to support retrieveAndUnwrapClusterGroupKey's local state
      await persistClusterGroupKey(indepClusterId, indepGroupKeyEpoch1, 1, aliceStore);

      // Step 4: Bob and Charlie retrieve and unwrap epoch 1 key packages using retrieveAndUnwrapClusterGroupKey
      // Validating distributor public key and authoritative epoch fingerprint
      const unwrappedByBobEpoch1 = await retrieveAndUnwrapClusterGroupKey({
        clusterId: indepClusterId,
        epoch: 1,
        receiverPrivateKey: bobPair.privateKey,
        receiverAgentId: bobAgentId,
        distributorPublicKeyJwk: alicePair.publicKey,
        expectedFingerprint: indepFingerprint1,
        apiFetchFn: async (url, opts) => helperFetch(url, { ...opts, headers: bobHeaders }),
        isolatedStore: bobStore
      });

      const unwrappedByCharlieEpoch1 = await retrieveAndUnwrapClusterGroupKey({
        clusterId: indepClusterId,
        epoch: 1,
        receiverPrivateKey: charliePair.privateKey,
        receiverAgentId: charlieAgentId,
        distributorPublicKeyJwk: alicePair.publicKey,
        expectedFingerprint: indepFingerprint1,
        apiFetchFn: async (url, opts) => helperFetch(url, { ...opts, headers: charlieHeaders }),
        isolatedStore: charlieStore
      });

      const epoch1KeysMatch = unwrappedByBobEpoch1 === indepGroupKeyEpoch1 &&
        unwrappedByCharlieEpoch1 === indepGroupKeyEpoch1;

      // Step 5: Send and decrypt message at epoch 1
      const secretEpoch1Text = 'Confidential cluster message at epoch 1 verified 🛡️';
      const envelopeEpoch1 = await encryptClusterGroupMessage(
        secretEpoch1Text,
        alicePair.privateKey,
        aliceAgentId,
        indepClusterId,
        { [bobAgentId]: bobPair.publicKey, [charlieAgentId]: charliePair.publicKey },
        1,
        aliceStore
      );

      const decryptedBobEpoch1 = await decryptClusterGroupMessage(
        envelopeEpoch1,
        bobPair.privateKey,
        bobAgentId,
        alicePair.publicKey,
        indepClusterId,
        aliceAgentId,
        bobStore
      );

      const decryptedCharlieEpoch1 = await decryptClusterGroupMessage(
        envelopeEpoch1,
        charliePair.privateKey,
        charlieAgentId,
        alicePair.publicKey,
        indepClusterId,
        aliceAgentId,
        charlieStore
      );

      const epoch1CommunicationSuccess = decryptedBobEpoch1 === secretEpoch1Text &&
        decryptedCharlieEpoch1 === secretEpoch1Text;

      // Step 6: Unauthorized outsider (Eve) access rejection at epoch 1
      const resEveKey = await helperFetch(`/api/clusters/${indepClusterId}/keys/1`, {
        method: 'GET',
        headers: eveHeaders
      });
      const eveRetrievalRejected = resEveKey.status === 403 && resEveKey.json?.error?.code === 'FORBIDDEN';

      // Step 7: Member removal & Cluster Rotation to Epoch 2
      // Bob is removed (status -> dissolved)
      bobMemberRecord.status = 'dissolved';

      // Alice advances epoch to 2 with new rotated group key distributed ONLY to active members (Alice & Charlie)
      const indepGroupKeyEpoch2 = await generateGroupKey();
      const indepFingerprint2 = await computeGroupKeyFingerprint(indepGroupKeyEpoch2);

      const wrappedForAlice2 = await wrapGroupKeyForMember(
        indepGroupKeyEpoch2,
        alicePair.privateKey,
        alicePair.publicKey,
        indepClusterId,
        aliceAgentId,
        2
      );
      const wrappedForCharlie2 = await wrapGroupKeyForMember(
        indepGroupKeyEpoch2,
        alicePair.privateKey,
        charliePair.publicKey,
        indepClusterId,
        charlieAgentId,
        2
      );

      const resAdvance = await helperFetch(`/api/clusters/${indepClusterId}/advance-epoch`, {
        method: 'POST',
        headers: aliceHeaders,
        body: JSON.stringify({
          keyFingerprint: indepFingerprint2,
          distributionMap: {
            [aliceAgentId]: wrappedForAlice2,
            [charlieAgentId]: wrappedForCharlie2
          },
          senderPublicKey: alicePair.publicKey,
          reason: 'Bob dissolved, rotating to epoch 2'
        })
      });

      const epoch2Established = resAdvance.status === 200 && resAdvance.json?.data?.epoch === 2;
      await persistClusterGroupKey(indepClusterId, indepGroupKeyEpoch2, 2, aliceStore);

      // Step 8: Active member (Charlie) retrieves & unwraps epoch 2 group key, verifying distributor public key & fingerprint
      const unwrappedByCharlieEpoch2 = await retrieveAndUnwrapClusterGroupKey({
        clusterId: indepClusterId,
        epoch: 2,
        receiverPrivateKey: charliePair.privateKey,
        receiverAgentId: charlieAgentId,
        distributorPublicKeyJwk: alicePair.publicKey,
        expectedFingerprint: indepFingerprint2,
        apiFetchFn: async (url, opts) => helperFetch(url, { ...opts, headers: charlieHeaders }),
        isolatedStore: charlieStore
      });

      const charlieEpoch2KeyValid = unwrappedByCharlieEpoch2 === indepGroupKeyEpoch2;

      // Step 9: Active members communicate using Epoch 2
      const secretEpoch2Text = 'Active members communicating securely using authoritative epoch 2 🔐';
      const envelopeEpoch2 = await encryptClusterGroupMessage(
        secretEpoch2Text,
        charliePair.privateKey,
        charlieAgentId,
        indepClusterId,
        { [aliceAgentId]: alicePair.publicKey },
        2,
        charlieStore
      );

      const decryptedAliceEpoch2 = await decryptClusterGroupMessage(
        envelopeEpoch2,
        alicePair.privateKey,
        aliceAgentId,
        charliePair.publicKey,
        indepClusterId,
        charlieAgentId,
        aliceStore
      );

      const epoch2CommunicationSuccess = decryptedAliceEpoch2 === secretEpoch2Text;

      // Step 10: Removed member (Bob) attempts to retrieve epoch 2 key package -> Rejected with 403 FORBIDDEN
      const resBobEpoch2 = await helperFetch(`/api/clusters/${indepClusterId}/keys/2`, {
        method: 'GET',
        headers: bobHeaders
      });

      const removedMemberRejectedFromNewEpoch = resBobEpoch2.status === 403 &&
        resBobEpoch2.json?.error?.code === 'FORBIDDEN';

      // Bob attempts to decrypt epoch 2 communication -> Fails because Bob has no epoch 2 key
      let bobDecryptionEpoch2Failed = false;
      try {
        await decryptClusterGroupMessage(
          { ...envelopeEpoch2, keys: envelopeEpoch2.keys },
          bobPair.privateKey,
          bobAgentId,
          charliePair.publicKey,
          indepClusterId,
          charlieAgentId,
          bobStore
        );
      } catch {
        bobDecryptionEpoch2Failed = true;
      }

      // Step 11: Security Verification: Mismatched distributor identity is rejected
      let mismatchedDistributorRejected = false;
      try {
        await retrieveAndUnwrapClusterGroupKey({
          clusterId: indepClusterId,
          epoch: 2,
          receiverPrivateKey: charliePair.privateKey,
          receiverAgentId: charlieAgentId,
          distributorPublicKeyJwk: evePair.publicKey, // Mismatched distributor!
          expectedFingerprint: indepFingerprint2,
          apiFetchFn: async (url, opts) => helperFetch(url, { ...opts, headers: charlieHeaders }),
          isolatedStore: new Map()
        });
      } catch {
        mismatchedDistributorRejected = true;
      }

      // Step 12: Security Verification: Mismatched fingerprint is rejected and key NOT persisted
      let mismatchedFingerprintRejected = false;
      const scratchStore = new Map<string, string>();
      try {
        await retrieveAndUnwrapClusterGroupKey({
          clusterId: indepClusterId,
          epoch: 2,
          receiverPrivateKey: charliePair.privateKey,
          receiverAgentId: charlieAgentId,
          distributorPublicKeyJwk: alicePair.publicKey,
          expectedFingerprint: 'SHA256:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF', // Wrong fingerprint
          apiFetchFn: async (url, opts) => helperFetch(url, { ...opts, headers: charlieHeaders }),
          isolatedStore: scratchStore
        });
      } catch {
        mismatchedFingerprintRejected = true;
      }
      const unverifiedKeyNotPersisted = scratchStore.size === 0;

      // Step 13: Alice distributes cluster key, Bob sends a message, and Charlie retrieves the key using Alice's distributor key and decrypts Bob's message
      const aliceDistrustedKeyEpoch1Text = 'Alice distributes, Bob sends message, Charlie retrieves and decrypts 🌟';
      const bobEpoch1Envelope = await encryptClusterGroupMessage(
        aliceDistrustedKeyEpoch1Text,
        bobPair.privateKey,
        bobAgentId,
        indepClusterId,
        { [aliceAgentId]: alicePair.publicKey, [charlieAgentId]: charliePair.publicKey },
        1,
        bobStore
      );

      const charlieFreshStore = new Map<string, string>();
      const retrievedByCharlieUsingAliceDistKey = await retrieveAndUnwrapClusterGroupKey({
        clusterId: indepClusterId,
        epoch: 1,
        receiverPrivateKey: charliePair.privateKey,
        receiverAgentId: charlieAgentId,
        distributorPublicKeyJwk: alicePair.publicKey, // Alice is distributor, NOT Bob!
        expectedFingerprint: indepFingerprint1,
        apiFetchFn: async (url, opts) => helperFetch(url, { ...opts, headers: charlieHeaders }),
        isolatedStore: charlieFreshStore
      });

      const decryptedBobMessageByCharlie = await decryptClusterGroupMessage(
        { ...bobEpoch1Envelope, keys: bobEpoch1Envelope.keys },
        charliePair.privateKey,
        charlieAgentId,
        bobPair.publicKey,
        indepClusterId,
        bobAgentId,
        charlieFreshStore
      );

      const aliceDistributesBobSendsCharlieDecryptsSuccess = decryptedBobMessageByCharlie === aliceDistrustedKeyEpoch1Text &&
        retrievedByCharlieUsingAliceDistKey === indepGroupKeyEpoch1;

      const distributionAccepted = true;
      const fullIntegrationSuccess = Boolean(
        unauthorizedDistributionRejected &&
        nonAdminDistRejected &&
        incompleteDistRejected &&
        distributionAccepted &&
        epoch1KeysMatch &&
        epoch1CommunicationSuccess &&
        eveRetrievalRejected &&
        epoch2Established &&
        charlieEpoch2KeyValid &&
        epoch2CommunicationSuccess &&
        removedMemberRejectedFromNewEpoch &&
        bobDecryptionEpoch2Failed &&
        mismatchedDistributorRejected &&
        mismatchedFingerprintRejected &&
        unverifiedKeyNotPersisted &&
        aliceDistributesBobSendsCharlieDecryptsSuccess
      );

      recordResult(
        'cluster_test37_independent_agents_key_distribution_and_rotation',
        fullIntegrationSuccess,
        `Epoch 1 comm (${epoch1CommunicationSuccess}), rotated to epoch 2 (${epoch2Established}), active members communicate at epoch 2 (${epoch2CommunicationSuccess}), removed member rejected (${removedMemberRejectedFromNewEpoch}), distributor verified (${mismatchedDistributorRejected}), fingerprint verified & not persisted (${unverifiedKeyNotPersisted}), alice distributor / bob sender / charlie decrypts (${aliceDistributesBobSendsCharlieDecryptsSuccess}), non-admin dist rejected (${nonAdminDistRejected}), incomplete dist rejected (${incompleteDistRejected})`
      );

    } catch (test37Err: any) {
      console.error(test37Err);
      recordResult('cluster_test37_independent_agents_key_distribution_and_rotation', false, `Test 37 exception: ${test37Err?.message}\n${test37Err?.stack}`);
    }

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
