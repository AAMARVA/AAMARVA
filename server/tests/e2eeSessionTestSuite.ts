import { createApp } from '../../server.js';
import { getSupabaseClient } from '../supabase.js';
import { registerUser, createHumanSession } from '../authService.js';
import { 
  deriveAgentCryptoIdentity, 
  encryptMessage, 
  decryptMessage 
} from '../../src/lib/e2ee.js';

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse JSON from ${res.url} (Status ${res.status}): ${text}`);
  }
}

export async function runE2EESessionTestSuite() {
  console.log('====================================================');
  console.log('    AAMARVA E2EE HUMAN & AGENT SESSION TEST SUITE   ');
  console.log('====================================================\n');

  process.env.VERCEL = '1';
  const app = await createApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const BASE_URL = `http://127.0.0.1:${port}`;

  try {

  const supabase = getSupabaseClient();
  const timestamp = Date.now();

  // ==============================================================
  // 1. HUMAN SESSION E2EE FLOW
  // ==============================================================
  console.log('[SECTION 1] HUMAN SESSION REGISTRATION, PEER-KEY & MESSAGING');

  // Register Human User A
  const emailHA = `human_a_${timestamp}@aamarva.test`;
  const pwdHA = 'HumanPassword123!';
  const regHA = await registerUser({ email: emailHA, password: pwdHA, agentName: 'Human User Alpha' });
  const userHA = regHA.user;
  const humanSessionA = await createHumanSession(userHA.id);

  // Register Human User B
  const emailHB = `human_b_${timestamp}@aamarva.test`;
  const pwdHB = 'HumanPassword123!';
  const regHB = await registerUser({ email: emailHB, password: pwdHB, agentName: 'Human User Beta' });
  const userHB = regHB.user;
  const humanSessionB = await createHumanSession(userHB.id);

  // Derive E2EE keys locally (client-side simulation)
  const keysHA = await deriveAgentCryptoIdentity(userHA.agentId, pwdHA);
  const keysHB = await deriveAgentCryptoIdentity(userHB.agentId, pwdHB);

  // Register E2EE public key for Human A via Human session cookie
  const regKeyHARes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `aamarva_human_session=${humanSessionA}`,
      'Authorization': `Bearer ${humanSessionA}`
    },
    body: JSON.stringify({
      publicKey: keysHA.e2eePublicKey,
      fingerprint: keysHA.fingerprint,
      identityKey: keysHA.identityPublicKey,
      signature: keysHA.signature,
      keyEpoch: 1,
      allowRotation: false
    })
  });
  const regKeyHAJson = await safeJson(regKeyHARes);
  if (!regKeyHARes.ok || !regKeyHAJson.success) {
    throw new Error(`Human A key registration failed: ${JSON.stringify(regKeyHAJson)}`);
  }

  // Register E2EE public key for Human B via Human session cookie
  const regKeyHBRes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `aamarva_human_session=${humanSessionB}`,
      'Authorization': `Bearer ${humanSessionB}`
    },
    body: JSON.stringify({
      publicKey: keysHB.e2eePublicKey,
      fingerprint: keysHB.fingerprint,
      identityKey: keysHB.identityPublicKey,
      signature: keysHB.signature,
      keyEpoch: 1,
      allowRotation: false
    })
  });
  const regKeyHBJson = await safeJson(regKeyHBRes);
  if (!regKeyHBRes.ok || !regKeyHBJson.success) {
    throw new Error(`Human B key registration failed: ${JSON.stringify(regKeyHBJson)}`);
  }

  // Confirm Human A's registered key via GET /api/agents/me/e2ee
  const getE2eeHARes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
    headers: {
      'Cookie': `aamarva_human_session=${humanSessionA}`,
      'Authorization': `Bearer ${humanSessionA}`
    }
  });
  const getE2eeHAJson = await safeJson(getE2eeHARes);
  if (getE2eeHAJson.data?.fingerprint !== keysHA.fingerprint) {
    throw new Error(`Human A GET key confirmation mismatch: ${getE2eeHAJson.data?.fingerprint} !== ${keysHA.fingerprint}`);
  }
  console.log('  ✓ [1.1] Human registration and GET confirmation verified.');

  // Create persisted connection record between Human A and Human B in DB
  const humanConnId = `conn_human_${timestamp}`;
  await supabase.from('connections').insert({
    id: humanConnId,
    user1_id: userHA.id,
    user1_agent_id: userHA.agentId,
    user2_id: userHB.id,
    user2_agent_id: userHB.agentId,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Human A retrieves peer-key for Human B using Human session
  const peerKeyHARes = await fetch(`${BASE_URL}/api/connections/${humanConnId}/peer-key`, {
    headers: {
      'Cookie': `aamarva_human_session=${humanSessionA}`,
      'Authorization': `Bearer ${humanSessionA}`
    }
  });
  const peerKeyHAJson = await safeJson(peerKeyHARes);
  if (!peerKeyHARes.ok || !peerKeyHAJson.success) {
    throw new Error(`Human A failed to retrieve peer key: ${JSON.stringify(peerKeyHAJson)}`);
  }
  if (peerKeyHAJson.data?.peerE2eePublicKey !== keysHB.e2eePublicKey) {
    throw new Error(`Peer public key returned does not match Human B's registered key!`);
  }
  console.log('  ✓ [1.2] Human peer-key retrieval verified.');

  // Human A sends encrypted message to Human B
  const humanPlaintext = 'Top secret human communication via AAMARVA E2EE!';
  const humanEnc = await encryptMessage(
    humanPlaintext,
    keysHA.e2eePrivateKey,
    keysHB.e2eePublicKey,
    humanConnId,
    userHA.agentId,
    1
  );

  const sendMsgHARes = await fetch(`${BASE_URL}/api/connections/${humanConnId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `aamarva_human_session=${humanSessionA}`,
      'Authorization': `Bearer ${humanSessionA}`
    },
    body: JSON.stringify({
      ciphertext: humanEnc.ciphertext,
      nonce: humanEnc.nonce,
      version: humanEnc.version,
      keyEpoch: humanEnc.keyEpoch,
      sequence: 1
    })
  });
  const sendMsgHAJson = await safeJson(sendMsgHARes);
  if (!sendMsgHARes.ok || !sendMsgHAJson.success) {
    throw new Error(`Human A message send failed: ${JSON.stringify(sendMsgHAJson)}`);
  }
  const humanMsgId = sendMsgHAJson.data?.id || sendMsgHAJson.data?.messageId;

  // Human B retrieves messages and decrypts locally
  const getMsgsHBRes = await fetch(`${BASE_URL}/api/connections/${humanConnId}/messages`, {
    headers: {
      'Cookie': `aamarva_human_session=${humanSessionB}`,
      'Authorization': `Bearer ${humanSessionB}`
    }
  });
  const getMsgsHBJson = await safeJson(getMsgsHBRes);
  const fetchedMsgHB = (getMsgsHBJson.data || []).find((m: any) => m.id === humanMsgId);
  if (!fetchedMsgHB) throw new Error('Human B could not find encrypted message in conversation transcript.');

  const decryptedHB = await decryptMessage(
    { ciphertext: fetchedMsgHB.ciphertext, nonce: fetchedMsgHB.nonce, version: fetchedMsgHB.version, keyEpoch: fetchedMsgHB.keyEpoch },
    keysHB.e2eePrivateKey,
    keysHA.e2eePublicKey,
    humanConnId,
    userHA.agentId
  );
  if (decryptedHB !== humanPlaintext) {
    throw new Error(`Decrypted plaintext mismatch for human session: "${decryptedHB}" !== "${humanPlaintext}"`);
  }
  console.log('  ✓ [1.3] Human encrypted message persistence, retrieval & local decryption verified.\n');

  // ==============================================================
  // 2. AGENT SESSION E2EE FLOW
  // ==============================================================
  console.log('[SECTION 2] AGENT SESSION REGISTRATION, PEER-KEY & MESSAGING');

  // Register Agent User X
  const emailAX = `agent_x_${timestamp}@aamarva.test`;
  const pwdAX = 'AgentPassword123!';
  const regAX = await registerUser({ email: emailAX, password: pwdAX, agentName: 'Autonomous Agent X' });
  const userAX = regAX.user;
  const loginAX = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: userAX.agentId, apiKey: regAX.apiKey })
  });
  const loginAXJson = await safeJson(loginAX);
  const agentTokenX = loginAXJson.data?.tokens?.accessToken;

  // Register Agent User Y
  const emailAY = `agent_y_${timestamp}@aamarva.test`;
  const pwdAY = 'AgentPassword123!';
  const regAY = await registerUser({ email: emailAY, password: pwdAY, agentName: 'Autonomous Agent Y' });
  const userAY = regAY.user;
  const loginAY = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: userAY.agentId, apiKey: regAY.apiKey })
  });
  const loginAYJson = await safeJson(loginAY);
  const agentTokenY = loginAYJson.data?.tokens?.accessToken;

  // Derive E2EE keys locally for Agents
  const keysAX = await deriveAgentCryptoIdentity(userAX.agentId, pwdAX);
  const keysAY = await deriveAgentCryptoIdentity(userAY.agentId, pwdAY);

  // Register E2EE public key for Agent X via Bearer token
  const regKeyAXRes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agentTokenX}`
    },
    body: JSON.stringify({
      publicKey: keysAX.e2eePublicKey,
      fingerprint: keysAX.fingerprint,
      identityKey: keysAX.identityPublicKey,
      signature: keysAX.signature,
      keyEpoch: 1,
      allowRotation: false
    })
  });
  const regKeyAXJson = await safeJson(regKeyAXRes);
  if (!regKeyAXRes.ok || !regKeyAXJson.success) {
    throw new Error(`Agent X key registration failed: ${JSON.stringify(regKeyAXJson)}`);
  }

  // Register E2EE public key for Agent Y via Bearer token
  const regKeyAYRes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agentTokenY}`
    },
    body: JSON.stringify({
      publicKey: keysAY.e2eePublicKey,
      fingerprint: keysAY.fingerprint,
      identityKey: keysAY.identityPublicKey,
      signature: keysAY.signature,
      keyEpoch: 1,
      allowRotation: false
    })
  });
  const regKeyAYJson = await safeJson(regKeyAYRes);
  if (!regKeyAYRes.ok || !regKeyAYJson.success) {
    throw new Error(`Agent Y key registration failed: ${JSON.stringify(regKeyAYJson)}`);
  }

  // Confirm Agent X's registered key via GET /api/agents/me/e2ee
  const getE2eeAXRes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
    headers: { 'Authorization': `Bearer ${agentTokenX}` }
  });
  const getE2eeAXJson = await safeJson(getE2eeAXRes);
  if (getE2eeAXJson.data?.fingerprint !== keysAX.fingerprint) {
    throw new Error(`Agent X GET key confirmation mismatch: ${getE2eeAXJson.data?.fingerprint} !== ${keysAX.fingerprint}`);
  }
  console.log('  ✓ [2.1] Agent registration and GET confirmation verified.');

  // Create persisted connection record between Agent X and Agent Y in DB
  const agentConnId = `conn_agent_${timestamp}`;
  await supabase.from('connections').insert({
    id: agentConnId,
    user1_id: userAX.id,
    user1_agent_id: userAX.agentId,
    user2_id: userAY.id,
    user2_agent_id: userAY.agentId,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Agent X retrieves peer-key for Agent Y using Bearer token
  const peerKeyAXRes = await fetch(`${BASE_URL}/api/connections/${agentConnId}/peer-key`, {
    headers: { 'Authorization': `Bearer ${agentTokenX}` }
  });
  const peerKeyAXJson = await safeJson(peerKeyAXRes);
  if (!peerKeyAXRes.ok || !peerKeyAXJson.success) {
    throw new Error(`Agent X failed to retrieve peer key: ${JSON.stringify(peerKeyAXJson)}`);
  }
  if (peerKeyAXJson.data?.peerE2eePublicKey !== keysAY.e2eePublicKey) {
    throw new Error(`Peer public key returned does not match Agent Y's registered key!`);
  }
  console.log('  ✓ [2.2] Agent peer-key retrieval verified.');

  // Agent X sends encrypted message to Agent Y
  const agentPlaintext = 'AAMARVA Autonomous Agent Mission Protocol 0x42';
  const agentEnc = await encryptMessage(
    agentPlaintext,
    keysAX.e2eePrivateKey,
    keysAY.e2eePublicKey,
    agentConnId,
    userAX.agentId,
    1
  );

  const sendMsgAXRes = await fetch(`${BASE_URL}/api/connections/${agentConnId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agentTokenX}`
    },
    body: JSON.stringify({
      ciphertext: agentEnc.ciphertext,
      nonce: agentEnc.nonce,
      version: agentEnc.version,
      keyEpoch: agentEnc.keyEpoch,
      sequence: 1
    })
  });
  const sendMsgAXJson = await safeJson(sendMsgAXRes);
  if (!sendMsgAXRes.ok || !sendMsgAXJson.success) {
    throw new Error(`Agent X message send failed: ${JSON.stringify(sendMsgAXJson)}`);
  }
  const agentMsgId = sendMsgAXJson.data?.id || sendMsgAXJson.data?.messageId;

  // Agent Y retrieves messages and decrypts locally
  const getMsgsAYRes = await fetch(`${BASE_URL}/api/connections/${agentConnId}/messages`, {
    headers: { 'Authorization': `Bearer ${agentTokenY}` }
  });
  const getMsgsAYJson = await safeJson(getMsgsAYRes);
  const fetchedMsgAY = (getMsgsAYJson.data || []).find((m: any) => m.id === agentMsgId);
  if (!fetchedMsgAY) throw new Error('Agent Y could not find encrypted message in conversation transcript.');

  const decryptedAY = await decryptMessage(
    { ciphertext: fetchedMsgAY.ciphertext, nonce: fetchedMsgAY.nonce, version: fetchedMsgAY.version, keyEpoch: fetchedMsgAY.keyEpoch },
    keysAY.e2eePrivateKey,
    keysAX.e2eePublicKey,
    agentConnId,
    userAX.agentId
  );
  if (decryptedAY !== agentPlaintext) {
    throw new Error(`Decrypted plaintext mismatch for agent session: "${decryptedAY}" !== "${agentPlaintext}"`);
  }
  console.log('  ✓ [2.3] Agent encrypted message persistence, retrieval & local decryption verified.\n');

  // ==============================================================
  // 3. PERSISTED CONNECTION ID & ERROR GUARD SCENARIOS
  // ==============================================================
  console.log('[SECTION 3] NONEXISTENT CONNECTION & AUTHORIZATION GUARDS');

  // 3.1 Nonexistent Connection ID on peer-key endpoint returns 404 without constructing connection
  const nonExistentConnId = `nonexistent_conn_${timestamp}`;
  const nonExistentPeerKeyRes = await fetch(`${BASE_URL}/api/connections/${nonExistentConnId}/peer-key`, {
    headers: { 'Authorization': `Bearer ${agentTokenX}` }
  });
  if (nonExistentPeerKeyRes.status !== 404) {
    throw new Error(`Expected 404 for nonexistent connection peer-key lookup, got HTTP ${nonExistentPeerKeyRes.status}`);
  }
  // Verify that the server did NOT create a dummy connection record in DB
  const { data: phantomConn } = await supabase.from('connections').select('*').eq('id', nonExistentConnId).maybeSingle();
  if (phantomConn) {
    throw new Error(`Violation: Peer-key lookup constructed a connection record in the database for nonexistent ID!`);
  }
  console.log('  ✓ [3.1] Nonexistent connection ID returns 404 and does not construct a record.');

  // 3.2 Nonexistent Connection ID on messages POST returns 404
  const nonExistentMsgRes = await fetch(`${BASE_URL}/api/connections/${nonExistentConnId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agentTokenX}`
    },
    body: JSON.stringify({
      ciphertext: agentEnc.ciphertext,
      nonce: agentEnc.nonce,
      version: 1,
      keyEpoch: 1
    })
  });
  if (nonExistentMsgRes.status !== 404) {
    throw new Error(`Expected 404 for nonexistent connection message send, got HTTP ${nonExistentMsgRes.status}`);
  }
  console.log('  ✓ [3.2] Nonexistent connection ID message send returns 404.');

  // 3.3 Unauthorized participant on peer-key endpoint returns 403
  // Agent X tries to access peer-key of Human connection (UserHA <-> UserHB)
  const unauthPeerKeyRes = await fetch(`${BASE_URL}/api/connections/${humanConnId}/peer-key`, {
    headers: { 'Authorization': `Bearer ${agentTokenX}` }
  });
  if (unauthPeerKeyRes.status !== 403) {
    throw new Error(`Expected 403 for unauthorized peer-key lookup, got HTTP ${unauthPeerKeyRes.status}`);
  }
  console.log('  ✓ [3.3] Unauthorized participant peer-key lookup rejected with HTTP 403.');

  // 3.4 Unauthorized participant on messages POST returns 403
  const unauthMsgRes = await fetch(`${BASE_URL}/api/connections/${humanConnId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${agentTokenX}`
    },
    body: JSON.stringify({
      ciphertext: agentEnc.ciphertext,
      nonce: agentEnc.nonce,
      version: 1,
      keyEpoch: 1
    })
  });
  if (unauthMsgRes.status !== 403) {
    throw new Error(`Expected 403 for unauthorized message send, got HTTP ${unauthMsgRes.status}`);
  }
  console.log('  ✓ [3.4] Unauthorized participant message send rejected with HTTP 403.');

  console.log('\n====================================================');
  console.log('   ALL HUMAN & AGENT SESSION E2EE TESTS PASSED!     ');
  console.log('====================================================\n');
  return { success: true };
  } finally {
    server.close();
  }
}

if (process.argv[1] && process.argv[1].includes('e2eeSessionTestSuite')) {
  runE2EESessionTestSuite().catch(err => {
    console.error('❌ E2EE Session Test Suite Failure:', err);
    process.exit(1);
  });
}
