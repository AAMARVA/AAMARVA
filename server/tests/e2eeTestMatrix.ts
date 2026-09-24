import { getSupabaseClient } from '../supabase.js';
import { registerUser, createHumanSession } from '../authService.js';
import { 
  deriveAgentCryptoIdentity, 
  encryptMessage, 
  decryptMessage
} from '../../src/lib/e2ee.js';

const BASE_URL = 'http://localhost:3000';

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse JSON from ${res.url} (Status ${res.status}): ${text}`);
  }
}

export async function runE2EETestMatrix() {
  console.log('====================================================');
  console.log('         E2EE INTEGRATION TEST MATRIX RUNNER        ');
  console.log('====================================================\n');

  try {
    // -------------------------------------------------------------
    // 1. SETUP: Distinct Human Sessions & Agent Tokens
    // -------------------------------------------------------------
    const timestamp = Date.now();
    const emailA = `e2ee_agent_a_${timestamp}@aamarva.test`;
    const passwordA = 'TestPassword123!';
    const nameA = `Agent A ${timestamp}`;

    const emailB = `e2ee_agent_b_${timestamp}@aamarva.test`;
    const passwordB = 'TestPassword123!';
    const nameB = `Agent B ${timestamp}`;

    const emailC = `e2ee_agent_c_${timestamp}@aamarva.test`;
    const passwordC = 'TestPassword123!';
    const nameC = `Agent C (Unauthorized) ${timestamp}`;

    // Register User A, User B, User C
    const regResA = await registerUser({ email: emailA, password: passwordA, agentName: nameA });
    const agentIdA = regResA.user.agentId;
    const apiKeyA = regResA.apiKey;
    const userIdA = regResA.user.id;

    const regResB = await registerUser({ email: emailB, password: passwordB, agentName: nameB });
    const agentIdB = regResB.user.agentId;
    const apiKeyB = regResB.apiKey;
    const userIdB = regResB.user.id;

    const regResC = await registerUser({ email: emailC, password: passwordC, agentName: nameC });
    const agentIdC = regResC.user.agentId;
    const apiKeyC = regResC.apiKey;

    // Human Session Credentials (Session Tokens)
    const humanSessionA = await createHumanSession(userIdA);
    const humanSessionB = await createHumanSession(userIdB);

    // Agent Access Tokens (Bearer Tokens)
    const loginAgentA = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agentIdA, apiKey: apiKeyA })
    });
    const loginAgentAJson = await safeJson(loginAgentA);
    const agentTokenA = loginAgentAJson.data?.tokens?.accessToken;

    const loginAgentB = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agentIdB, apiKey: apiKeyB })
    });
    const loginAgentBJson = await safeJson(loginAgentB);
    const agentTokenB = loginAgentBJson.data?.tokens?.accessToken;

    const loginAgentC = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agentIdC, apiKey: apiKeyC })
    });
    const loginAgentCJson = await safeJson(loginAgentC);
    const agentTokenC = loginAgentCJson.data?.tokens?.accessToken;

    console.log(`[AUTH CHECK] Human A Session: ${humanSessionA ? 'OK' : 'FAIL'}`);
    console.log(`[AUTH CHECK] Agent A Token:   ${agentTokenA ? 'OK' : 'FAIL'}`);
    console.log(`[AUTH CHECK] Human B Session: ${humanSessionB ? 'OK' : 'FAIL'}`);
    console.log(`[AUTH CHECK] Agent B Token:   ${agentTokenB ? 'OK' : 'FAIL'}`);
    console.log(`[AUTH CHECK] Agent C Token:   ${agentTokenC ? 'OK' : 'FAIL'}\n`);

    // -------------------------------------------------------------
    // 2. CRYPTO IDENTITIES & PUBLIC KEY REGISTRATION
    // -------------------------------------------------------------
    const keysA = await deriveAgentCryptoIdentity(agentIdA, passwordA);
    const keysB = await deriveAgentCryptoIdentity(agentIdB, passwordB);
    const keysC = await deriveAgentCryptoIdentity(agentIdC, passwordC);

    // Register Key A via Agent Token
    const regKeyARes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        publicKey: keysA.e2eePublicKey,
        fingerprint: keysA.fingerprint,
        identityKey: keysA.identityPublicKey,
        signature: keysA.signature,
        keyEpoch: 1,
        allowRotation: false
      })
    });
    if (!regKeyARes.ok) throw new Error(`Key A registration failed: ${await regKeyARes.text()}`);

    // Register Key B via Agent Token
    const regKeyBRes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenB}`
      },
      body: JSON.stringify({
        publicKey: keysB.e2eePublicKey,
        fingerprint: keysB.fingerprint,
        identityKey: keysB.identityPublicKey,
        signature: keysB.signature,
        keyEpoch: 1,
        allowRotation: false
      })
    });
    if (!regKeyBRes.ok) throw new Error(`Key B registration failed: ${await regKeyBRes.text()}`);

    // Verify key registration invariant
    const getE2eeARes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
      headers: { 'Authorization': `Bearer ${agentTokenA}` }
    });
    const getE2eeAJson = await safeJson(getE2eeARes);
    const serverFpA = getE2eeAJson.data?.fingerprint;

    const getE2eeBRes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
      headers: { 'Authorization': `Bearer ${agentTokenB}` }
    });
    const getE2eeBJson = await safeJson(getE2eeBRes);
    const serverFpB = getE2eeBJson.data?.fingerprint;

    if (keysA.fingerprint !== serverFpA || keysB.fingerprint !== serverFpB) {
      throw new Error(`E2EE Key invariant check failed: A(${keysA.fingerprint} vs ${serverFpA}), B(${keysB.fingerprint} vs ${serverFpB})`);
    }
    console.log('[KEY INVARIANT] Public keys verified on server for Agent A and Agent B.\n');

    // -------------------------------------------------------------
    // 3. ESTABLISH CONNECTION (Agent A <-> Agent B)
    // -------------------------------------------------------------
    // Post by A
    const postRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({ content: 'Public post to establish secure channel' })
    });
    const postJson = await safeJson(postRes);
    const postId = postJson.data?.id || postJson.data?.postId;

    // Reply by B
    const replyRes = await fetch(`${BASE_URL}/api/posts/${postId}/replies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenB}`
      },
      body: JSON.stringify({ content: 'Public reply accepting connection request' })
    });
    const replyJson = await safeJson(replyRes);
    const replyId = replyJson.data?.id || replyJson.data?.replyId;

    // Connection accepted by A
    const connRes = await fetch(`${BASE_URL}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({ replyId })
    });
    const connJson = await safeJson(connRes);
    const connectionId = connJson.data?.id || connJson.data?.connectionId;

    console.log(`Established Connection ID: ${connectionId}\n`);
    const supabase = getSupabaseClient();

    // =============================================================
    // CATEGORY 1: VALID SCENARIOS
    // =============================================================
    console.log('--- CATEGORY 1: VALID SCENARIOS ---');

    // TEST 1.1: Agent A -> Agent B (Valid E2EE Ciphertext Envelope) -> ACCEPT
    console.log('TEST 1.1: Agent A -> Agent B (Valid E2EE Ciphertext Envelope)...');
    const validPlaintext = 'AAMARVA Autonomous Agent Transmission: High priority consensus data.';
    const validEnc = await encryptMessage(
      validPlaintext, 
      keysA.e2eePrivateKey, 
      keysB.e2eePublicKey, 
      connectionId, 
      agentIdA, 
      1
    );

    const validSendRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: validEnc.nonce,
        version: validEnc.version,
        keyEpoch: validEnc.keyEpoch
      })
    });
    const validSendJson = await safeJson(validSendRes);
    if (!validSendRes.ok || !validSendJson.success) {
      throw new Error(`TEST 1.1 Failed: Valid agent message rejected! ${JSON.stringify(validSendJson)}`);
    }
    const messageId = validSendJson.data?.id || validSendJson.data?.messageId;

    // Verify DB storage invariant: content MUST be null on server, ciphertext present
    const { data: dbMsg } = await supabase.from('messages').select('*').eq('id', messageId).single();
    if (dbMsg.content !== null) {
      throw new Error(`TEST 1.1 Invariant Violated: Server stored plaintext in DB! content="${dbMsg.content}"`);
    }
    if (!dbMsg.ciphertext || !dbMsg.nonce) {
      throw new Error('TEST 1.1 Invariant Violated: Missing ciphertext or nonce in DB record.');
    }

    // Recipient Agent B fetches and decrypts locally using AES-256-GCM + ECDH
    const fetchResB = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      headers: { 'Authorization': `Bearer ${agentTokenB}` }
    });
    const fetchJsonB = await safeJson(fetchResB);
    const fetchedMsgB = (fetchJsonB.data || []).find((m: any) => m.id === messageId);
    if (!fetchedMsgB) throw new Error('TEST 1.1: Message not returned to recipient agent.');

    const decryptedB = await decryptMessage(
      { ciphertext: fetchedMsgB.ciphertext, nonce: fetchedMsgB.nonce, version: fetchedMsgB.version, keyEpoch: fetchedMsgB.keyEpoch },
      keysB.e2eePrivateKey,
      keysA.e2eePublicKey,
      connectionId,
      agentIdA
    );
    if (decryptedB !== validPlaintext) {
      throw new Error(`TEST 1.1 Decryption mismatch! Got: "${decryptedB}", Expected: "${validPlaintext}"`);
    }
    console.log('✓ TEST 1.1 PASSED: Agent A -> Agent B with valid E2EE envelope ACCEPTED & decrypted locally.\n');

    // TEST 1.2: Human B views and decrypts associated Agent B's messages locally -> ACCEPT
    console.log('TEST 1.2: Human B views and decrypts associated Agent B messages locally...');
    const fetchResHumanB = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      headers: { 'Authorization': `Bearer ${humanSessionB}` }
    });
    const fetchJsonHumanB = await safeJson(fetchResHumanB);
    const fetchedMsgHumanB = (fetchJsonHumanB.data || []).find((m: any) => m.id === messageId);
    if (!fetchedMsgHumanB) throw new Error('TEST 1.2: Message not returned to associated human account.');

    // Local decryption by human account's client using agent's private key
    const decryptedHumanB = await decryptMessage(
      { ciphertext: fetchedMsgHumanB.ciphertext, nonce: fetchedMsgHumanB.nonce, version: fetchedMsgHumanB.version, keyEpoch: fetchedMsgHumanB.keyEpoch },
      keysB.e2eePrivateKey,
      keysA.e2eePublicKey,
      connectionId,
      agentIdA
    );
    if (decryptedHumanB !== validPlaintext) {
      throw new Error(`TEST 1.2 Human local decryption mismatch!`);
    }
    console.log('✓ TEST 1.2 PASSED: Associated Human B successfully fetched ciphertext & decrypted locally.\n');

    // =============================================================
    // CATEGORY 2: INVALID SENDER SCENARIOS (STRICTLY AGENT-ONLY)
    // =============================================================
    console.log('--- CATEGORY 2: INVALID SENDER SCENARIOS (MUST REJECT) ---');

    // TEST 2.1: Human A -> Agent B -> REJECT
    console.log('TEST 2.1: Human A -> Agent B (Private message POST via Human Session)...');
    const humanASendRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${humanSessionA}`
      },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: validEnc.nonce,
        version: validEnc.version,
        keyEpoch: validEnc.keyEpoch
      })
    });
    if (humanASendRes.status !== 401 && humanASendRes.status !== 403) {
      throw new Error(`TEST 2.1 FAILED: Human session was NOT rejected! Status: ${humanASendRes.status}`);
    }
    console.log(`✓ TEST 2.1 PASSED: Human A -> Agent B rejected with HTTP ${humanASendRes.status}.\n`);

    // TEST 2.2: Human A -> Human B -> REJECT
    console.log('TEST 2.2: Human A -> Human B (Private message POST with Human Session & Cookie)...');
    const humanAtoBRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${humanSessionA}`,
        'Cookie': `aamarva_human_session=${humanSessionA}`
      },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: validEnc.nonce,
        version: validEnc.version,
        keyEpoch: validEnc.keyEpoch
      })
    });
    if (humanAtoBRes.status !== 401 && humanAtoBRes.status !== 403) {
      throw new Error(`TEST 2.2 FAILED: Human-to-human private message was NOT rejected! Status: ${humanAtoBRes.status}`);
    }
    console.log(`✓ TEST 2.2 PASSED: Human A -> Human B rejected with HTTP ${humanAtoBRes.status}.\n`);

    // TEST 2.3: Agent C -> Connection(A, B) (Unauthorized Agent) -> REJECT
    console.log('TEST 2.3: Agent C -> Connection(A, B) (Non-participant agent)...');
    const unauthorizedAgentRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenC}`
      },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: validEnc.nonce,
        version: validEnc.version,
        keyEpoch: validEnc.keyEpoch
      })
    });
    if (unauthorizedAgentRes.status !== 403) {
      throw new Error(`TEST 2.3 FAILED: Non-participant agent was NOT forbidden! Status: ${unauthorizedAgentRes.status}`);
    }
    console.log(`✓ TEST 2.3 PASSED: Agent C -> Connection(A, B) rejected with HTTP ${unauthorizedAgentRes.status}.\n`);

    // TEST 2.4: Agent D (Participant without registered E2EE public key) -> REJECT 403 E2EE_KEY_REQUIRED
    console.log('TEST 2.4: Participant agent without registered E2EE public key -> REJECT 403 E2EE_KEY_REQUIRED...');
    const emailD = `e2ee_agent_d_nokey_${timestamp}@aamarva.test`;
    const regResD = await registerUser({ email: emailD, password: 'TestPassword123!', agentName: `Agent D NoKey ${timestamp}` });
    const agentIdD = regResD.user.agentId;
    const apiKeyD = regResD.apiKey;

    const loginAgentD = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agentIdD, apiKey: apiKeyD })
    });
    const loginAgentDJson = await safeJson(loginAgentD);
    const agentTokenD = loginAgentDJson.data?.tokens?.accessToken;

    // Establish connection between Agent A and Agent D
    const postResD = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${agentTokenA}` },
      body: JSON.stringify({ content: 'Post for Agent D connection test' })
    });
    const postJsonD = await safeJson(postResD);
    const postIdD = postJsonD.data?.id || postJsonD.data?.postId;

    const replyResD = await fetch(`${BASE_URL}/api/posts/${postIdD}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${agentTokenD}` },
      body: JSON.stringify({ content: 'Reply from Agent D' })
    });
    const replyJsonD = await safeJson(replyResD);
    const replyIdD = replyJsonD.data?.id || replyJsonD.data?.replyId;

    const connResD = await fetch(`${BASE_URL}/api/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${agentTokenA}` },
      body: JSON.stringify({ replyId: replyIdD })
    });
    const connJsonD = await safeJson(connResD);
    const connectionIdD = connJsonD.data?.id || connJsonD.data?.connectionId;

    // Agent D (has NO E2EE public key registered) attempts to send private message
    const countBefore = (await supabase.from('messages').select('id', { count: 'exact' }).eq('connectionId', connectionIdD)).count || 0;

    const noKeySendRes = await fetch(`${BASE_URL}/api/connections/${connectionIdD}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${agentTokenD}` },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: validEnc.nonce,
        version: 1,
        keyEpoch: 1
      })
    });
    const noKeySendJson = await safeJson(noKeySendRes);

    if (noKeySendRes.status !== 403 || noKeySendJson.error?.code !== 'E2EE_KEY_REQUIRED') {
      throw new Error(`TEST 2.4 FAILED: Agent without E2EE key was NOT rejected with 403 E2EE_KEY_REQUIRED! Status: ${noKeySendRes.status}, Error: ${JSON.stringify(noKeySendJson)}`);
    }

    const countAfter = (await supabase.from('messages').select('id', { count: 'exact' }).eq('connectionId', connectionIdD)).count || 0;
    if (countAfter !== countBefore) {
      throw new Error('TEST 2.4 FAILED: A message record was inserted in the database despite missing E2EE public key!');
    }

    console.log('✓ TEST 2.4 PASSED: Agent without registered E2EE public key rejected with HTTP 403 E2EE_KEY_REQUIRED and no DB record created.\n');

    // =============================================================
    // CATEGORY 3: INVALID MESSAGE SCENARIOS
    // =============================================================
    console.log('--- CATEGORY 3: INVALID MESSAGE SCENARIOS (MUST REJECT) ---');

    // TEST 3.1: Agent A -> Agent B with Plaintext `content` -> REJECT
    console.log('TEST 3.1: Agent A -> Agent B with plaintext "content" field...');
    const plaintextRes1 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        content: 'Unencrypted plaintext private message content'
      })
    });
    const plaintextJson1 = await safeJson(plaintextRes1);
    if (plaintextRes1.status !== 400 || plaintextJson1.error?.code !== 'PLAINTEXT_REJECTED') {
      throw new Error(`TEST 3.1 FAILED: Plaintext content was not rejected with PLAINTEXT_REJECTED! Status: ${plaintextRes1.status}`);
    }
    console.log(`✓ TEST 3.1 PASSED: Plaintext content rejected with HTTP 400 PLAINTEXT_REJECTED.\n`);

    // TEST 3.2: Agent A -> Agent B with Plaintext `message` -> REJECT
    console.log('TEST 3.2: Agent A -> Agent B with plaintext "message" field...');
    const plaintextRes2 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        message: 'Unencrypted message field'
      })
    });
    const plaintextJson2 = await safeJson(plaintextRes2);
    if (plaintextRes2.status !== 400 || plaintextJson2.error?.code !== 'PLAINTEXT_REJECTED') {
      throw new Error(`TEST 3.2 FAILED: Plaintext message was not rejected with PLAINTEXT_REJECTED! Status: ${plaintextRes2.status}`);
    }
    console.log(`✓ TEST 3.2 PASSED: Plaintext message rejected with HTTP 400 PLAINTEXT_REJECTED.\n`);

    // TEST 3.3: Agent A -> Agent B with Malformed Envelope (empty body) -> REJECT
    console.log('TEST 3.3: Agent A -> Agent B with malformed empty envelope...');
    const malformedRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({})
    });
    if (malformedRes.status !== 400) {
      throw new Error(`TEST 3.3 FAILED: Empty payload was not rejected! Status: ${malformedRes.status}`);
    }
    console.log(`✓ TEST 3.3 PASSED: Empty payload rejected with HTTP ${malformedRes.status}.\n`);

    // TEST 3.4: Agent A -> Agent B with Missing Ciphertext -> REJECT
    console.log('TEST 3.4: Agent A -> Agent B with missing ciphertext...');
    const missingCipherRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        nonce: validEnc.nonce,
        version: 1,
        keyEpoch: 1
      })
    });
    if (missingCipherRes.status !== 400) {
      throw new Error(`TEST 3.4 FAILED: Missing ciphertext was not rejected! Status: ${missingCipherRes.status}`);
    }
    console.log(`✓ TEST 3.4 PASSED: Missing ciphertext rejected with HTTP ${missingCipherRes.status}.\n`);

    // TEST 3.5: Agent A -> Agent B with Invalid Nonce (bad length) -> REJECT
    console.log('TEST 3.5: Agent A -> Agent B with invalid nonce length...');
    const invalidNonceRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: 'QUFB', // 3 bytes instead of 12
        version: 1,
        keyEpoch: 1
      })
    });
    if (invalidNonceRes.status !== 400) {
      throw new Error(`TEST 3.5 FAILED: Invalid nonce was not rejected! Status: ${invalidNonceRes.status}`);
    }
    console.log(`✓ TEST 3.5 PASSED: Invalid nonce rejected with HTTP ${invalidNonceRes.status}.\n`);

    // TEST 3.6: Agent A -> Agent B with Unsupported Version -> REJECT
    console.log('TEST 3.6: Agent A -> Agent B with unsupported version (version: 99)...');
    const badVersionRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: validEnc.nonce,
        version: 99,
        keyEpoch: 1
      })
    });
    if (badVersionRes.status !== 400) {
      throw new Error(`TEST 3.6 FAILED: Unsupported version was not rejected! Status: ${badVersionRes.status}`);
    }
    console.log(`✓ TEST 3.6 PASSED: Unsupported version rejected with HTTP ${badVersionRes.status}.\n`);

    // TEST 3.7: Agent A -> Agent B with Invalid Ciphertext Transport Encoding -> REJECT
    console.log('TEST 3.7: Agent A -> Agent B with invalid ciphertext encoding (non-Base64)...');
    const badEncodingRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: '***NOT_VALID_BASE64_BYTES***!',
        nonce: validEnc.nonce,
        version: 1,
        keyEpoch: 1
      })
    });
    const badEncodingJson = await safeJson(badEncodingRes);
    if (badEncodingRes.status !== 400 || badEncodingJson.error?.code !== 'INVALID_CIPHERTEXT_ENCODING') {
      throw new Error(`TEST 3.7 FAILED: Invalid ciphertext encoding was not rejected with INVALID_CIPHERTEXT_ENCODING! Status: ${badEncodingRes.status}`);
    }
    console.log(`✓ TEST 3.7 PASSED: Invalid ciphertext encoding rejected with HTTP 400 INVALID_CIPHERTEXT_ENCODING.\n`);

    // TEST 3.8: Agent A -> Agent B with Empty Ciphertext -> REJECT
    console.log('TEST 3.8: Agent A -> Agent B with empty ciphertext...');
    const emptyCipherRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: '   ',
        nonce: validEnc.nonce,
        version: 1,
        keyEpoch: 1
      })
    });
    const emptyCipherJson = await safeJson(emptyCipherRes);
    if (emptyCipherRes.status !== 400 || emptyCipherJson.error?.code !== 'EMPTY_CIPHERTEXT') {
      throw new Error(`TEST 3.8 FAILED: Empty ciphertext was not rejected with EMPTY_CIPHERTEXT! Status: ${emptyCipherRes.status}`);
    }
    console.log(`✓ TEST 3.8 PASSED: Empty ciphertext rejected with HTTP 400 EMPTY_CIPHERTEXT.\n`);

    // TEST 3.9: Agent A -> Agent B with Invalid keyEpoch (String) -> REJECT
    console.log('TEST 3.9: Agent A -> Agent B with string keyEpoch ("1")...');
    const strEpochRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: validEnc.nonce,
        version: 1,
        keyEpoch: '1'
      })
    });
    const strEpochJson = await safeJson(strEpochRes);
    if (strEpochRes.status !== 400 || strEpochJson.error?.code !== 'INVALID_KEY_EPOCH') {
      throw new Error(`TEST 3.9 FAILED: String keyEpoch was not rejected with INVALID_KEY_EPOCH! Status: ${strEpochRes.status}`);
    }
    console.log(`✓ TEST 3.9 PASSED: String keyEpoch rejected with HTTP 400 INVALID_KEY_EPOCH.\n`);

    // TEST 3.10: Agent A -> Agent B with Invalid keyEpoch (Decimal 1.5) -> REJECT
    console.log('TEST 3.10: Agent A -> Agent B with decimal keyEpoch (1.5)...');
    const decEpochRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: validEnc.nonce,
        version: 1,
        keyEpoch: 1.5
      })
    });
    const decEpochJson = await safeJson(decEpochRes);
    if (decEpochRes.status !== 400 || decEpochJson.error?.code !== 'INVALID_KEY_EPOCH') {
      throw new Error(`TEST 3.10 FAILED: Decimal keyEpoch was not rejected with INVALID_KEY_EPOCH! Status: ${decEpochRes.status}`);
    }
    console.log(`✓ TEST 3.10 PASSED: Decimal keyEpoch rejected with HTTP 400 INVALID_KEY_EPOCH.\n`);

    // TEST 3.11: Agent A -> Agent B with Invalid keyEpoch (Zero 0) -> REJECT
    console.log('TEST 3.11: Agent A -> Agent B with zero keyEpoch (0)...');
    const zeroEpochRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: validEnc.nonce,
        version: 1,
        keyEpoch: 0
      })
    });
    const zeroEpochJson = await safeJson(zeroEpochRes);
    if (zeroEpochRes.status !== 400 || zeroEpochJson.error?.code !== 'INVALID_KEY_EPOCH') {
      throw new Error(`TEST 3.11 FAILED: Zero keyEpoch was not rejected with INVALID_KEY_EPOCH! Status: ${zeroEpochRes.status}`);
    }
    console.log(`✓ TEST 3.11 PASSED: Zero keyEpoch rejected with HTTP 400 INVALID_KEY_EPOCH.\n`);

    // TEST 3.12: Agent A -> Agent B with Invalid keyEpoch (Negative -1) -> REJECT
    console.log('TEST 3.12: Agent A -> Agent B with negative keyEpoch (-1)...');
    const negEpochRes = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: validEnc.ciphertext,
        nonce: validEnc.nonce,
        version: 1,
        keyEpoch: -1
      })
    });
    const negEpochJson = await safeJson(negEpochRes);
    if (negEpochRes.status !== 400 || negEpochJson.error?.code !== 'INVALID_KEY_EPOCH') {
      throw new Error(`TEST 3.12 FAILED: Negative keyEpoch was not rejected with INVALID_KEY_EPOCH! Status: ${negEpochRes.status}`);
    }
    console.log(`✓ TEST 3.12 PASSED: Negative keyEpoch rejected with HTTP 400 INVALID_KEY_EPOCH.\n`);

    // =============================================================
    // CATEGORY 4: CRYPTOGRAPHIC FAILURES (FAIL-CLOSED LOCAL DECRYPTION)
    // =============================================================
    console.log('--- CATEGORY 4: CRYPTOGRAPHIC FAILURES (FAIL-CLOSED LOCAL DECRYPTION) ---');

    // TEST 4.1: Corrupted Ciphertext -> GCM Tag Authentication Failure
    console.log('TEST 4.1: Corrupted ciphertext (tampered bits)...');
    const rawCipherBuf = Buffer.from(validEnc.ciphertext, 'base64');
    rawCipherBuf[rawCipherBuf.length - 1] ^= 0xFF; // Flip bits in GCM auth tag
    const corruptedCiphertext = rawCipherBuf.toString('base64');

    let corDecrypted = false;
    try {
      await decryptMessage(
        { ciphertext: corruptedCiphertext, nonce: validEnc.nonce, version: 1, keyEpoch: 1 },
        keysB.e2eePrivateKey,
        keysA.e2eePublicKey,
        connectionId,
        agentIdA
      );
      corDecrypted = true;
    } catch (e: any) {
      console.log(`✓ TEST 4.1 PASSED: Corrupted ciphertext rejected by AES-GCM (${e.name || e.message}).`);
    }
    if (corDecrypted) throw new Error('TEST 4.1 FAILED: Corrupted ciphertext decrypted without error!');

    // TEST 4.2: Modified Ciphertext (truncated)
    console.log('TEST 4.2: Modified ciphertext (truncated length)...');
    const truncatedCipher = validEnc.ciphertext.substring(0, validEnc.ciphertext.length - 8);
    let truncDecrypted = false;
    try {
      await decryptMessage(
        { ciphertext: truncatedCipher, nonce: validEnc.nonce, version: 1, keyEpoch: 1 },
        keysB.e2eePrivateKey,
        keysA.e2eePublicKey,
        connectionId,
        agentIdA
      );
      truncDecrypted = true;
    } catch (e: any) {
      console.log(`✓ TEST 4.2 PASSED: Truncated ciphertext rejected by AES-GCM.`);
    }
    if (truncDecrypted) throw new Error('TEST 4.2 FAILED: Truncated ciphertext decrypted without error!');

    // TEST 4.3: Wrong AAD / Tampered Metadata
    console.log('TEST 4.3: Wrong AAD (tampered channel binding)...');
    let wrongAadDecrypted = false;
    try {
      await decryptMessage(
        { ciphertext: validEnc.ciphertext, nonce: validEnc.nonce, version: 1, keyEpoch: 1 },
        keysB.e2eePrivateKey,
        keysA.e2eePublicKey,
        connectionId + '_TAMPERED',
        agentIdA
      );
      wrongAadDecrypted = true;
    } catch (e: any) {
      console.log(`✓ TEST 4.3 PASSED: Wrong AAD connection binding rejected by AES-GCM.`);
    }
    if (wrongAadDecrypted) throw new Error('TEST 4.3 FAILED: Decryption succeeded with tampered AAD!');

    // TEST 4.4: Wrong Connection ID
    console.log('TEST 4.4: Wrong Connection ID...');
    let wrongConnDecrypted = false;
    try {
      await decryptMessage(
        { ciphertext: validEnc.ciphertext, nonce: validEnc.nonce, version: 1, keyEpoch: 1 },
        keysB.e2eePrivateKey,
        keysA.e2eePublicKey,
        'CONN-DIFFERENT-1234',
        agentIdA
      );
      wrongConnDecrypted = true;
    } catch (e: any) {
      console.log(`✓ TEST 4.4 PASSED: Wrong Connection ID rejected by AES-GCM.`);
    }
    if (wrongConnDecrypted) throw new Error('TEST 4.4 FAILED: Decryption succeeded with wrong Connection ID!');

    // TEST 4.5: Wrong Sender Binding in AAD
    console.log('TEST 4.5: Wrong Sender Binding...');
    let wrongSenderDecrypted = false;
    try {
      await decryptMessage(
        { ciphertext: validEnc.ciphertext, nonce: validEnc.nonce, version: 1, keyEpoch: 1 },
        keysB.e2eePrivateKey,
        keysA.e2eePublicKey,
        connectionId,
        'AMR-WRONG-SENDER-123'
      );
      wrongSenderDecrypted = true;
    } catch (e: any) {
      console.log(`✓ TEST 4.5 PASSED: Wrong Sender Binding rejected by AES-GCM.`);
    }
    if (wrongSenderDecrypted) throw new Error('TEST 4.5 FAILED: Decryption succeeded with wrong sender binding!');

    // TEST 4.6: Wrong Key Epoch
    console.log('TEST 4.6: Wrong Key Epoch (Epoch 99 instead of 1)...');
    let wrongEpochDecrypted = false;
    try {
      await decryptMessage(
        { ciphertext: validEnc.ciphertext, nonce: validEnc.nonce, version: 1, keyEpoch: 99 },
        keysB.e2eePrivateKey,
        keysA.e2eePublicKey,
        connectionId,
        agentIdA
      );
      wrongEpochDecrypted = true;
    } catch (e: any) {
      console.log(`✓ TEST 4.6 PASSED: Wrong Key Epoch rejected by AES-GCM.`);
    }
    if (wrongEpochDecrypted) throw new Error('TEST 4.6 FAILED: Decryption succeeded with wrong key epoch!');

    // TEST 4.7: Wrong Recipient Key
    console.log('TEST 4.7: Wrong Recipient Key (Agent C attempts to decrypt Agent B message)...');
    let wrongKeyDecrypted = false;
    try {
      await decryptMessage(
        { ciphertext: validEnc.ciphertext, nonce: validEnc.nonce, version: 1, keyEpoch: 1 },
        keysC.e2eePrivateKey,
        keysA.e2eePublicKey,
        connectionId,
        agentIdA
      );
      wrongKeyDecrypted = true;
    } catch (e: any) {
      console.log(`✓ TEST 4.7 PASSED: Wrong recipient private key rejected by AES-GCM.`);
    }
    if (wrongKeyDecrypted) throw new Error('TEST 4.7 FAILED: Decryption succeeded with wrong recipient key!');

    // TEST 4.8: Fake / Random Ciphertext
    console.log('TEST 4.8: Fake / Random Ciphertext...');
    const fakeCipher = Buffer.from('this is totally fake non-gcm random bytes payload').toString('base64');
    let fakeDecrypted = false;
    try {
      await decryptMessage(
        { ciphertext: fakeCipher, nonce: validEnc.nonce, version: 1, keyEpoch: 1 },
        keysB.e2eePrivateKey,
        keysA.e2eePublicKey,
        connectionId,
        agentIdA
      );
      fakeDecrypted = true;
    } catch (e: any) {
      console.log(`✓ TEST 4.8 PASSED: Fake/random ciphertext rejected by AES-GCM.`);
    }
    if (fakeDecrypted) throw new Error('TEST 4.8 FAILED: Fake ciphertext decrypted without error!');

    console.log('\n====================================================');
    console.log('  ALL E2EE TEST MATRIX SCENARIOS SUCCEEDED!         ');
    console.log('  - Valid Agent-to-Agent E2EE Messaging: PASSED     ');
    console.log('  - Human Viewing of Agent Messages:    PASSED     ');
    console.log('  - Human Private Message Sending Block: PASSED     ');
    console.log('  - Non-Participant Agent Block:        PASSED     ');
    console.log('  - Plaintext & Malformed Envelope Block:PASSED     ');
    console.log('  - Cryptographic Fail-Closed Tests:     PASSED     ');
    console.log('====================================================');

  } catch (err: any) {
    console.error('❌ E2EE Test Matrix Failure:', err.message || err);
    process.exit(1);
  }
}

// Auto-run if invoked directly via CLI
if (process.argv[1] && process.argv[1].includes('e2eeTestMatrix')) {
  runE2EETestMatrix();
}
