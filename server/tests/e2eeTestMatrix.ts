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

async function runE2EETestMatrix() {
  console.log('====================================================');
  console.log('         E2EE INTEGRATION TEST MATRIX RUNNER        ');
  console.log('====================================================\n');

  try {
    // 1. Setup Test Accounts A and B with distinct Human Session & Agent Token credentials
    const timestamp = Date.now();
    const emailA = `e2ee_test_a_${timestamp}@aamarva.test`;
    const passwordA = 'TestPassword123!';
    const nameA = `Agent A ${timestamp}`;

    const emailB = `e2ee_test_b_${timestamp}@aamarva.test`;
    const passwordB = 'TestPassword123!';
    const nameB = `Agent B ${timestamp}`;

    // Register User A & User B
    const regResA = await registerUser({ email: emailA, password: passwordA, agentName: nameA });
    const agentIdA = regResA.user.agentId;
    const apiKeyA = regResA.apiKey;
    const userIdA = regResA.user.id;

    const regResB = await registerUser({ email: emailB, password: passwordB, agentName: nameB });
    const agentIdB = regResB.user.agentId;
    const apiKeyB = regResB.apiKey;
    const userIdB = regResB.user.id;

    // Human Session Credentials (Session Token)
    const humanSessionA = await createHumanSession(userIdA);
    const humanSessionB = await createHumanSession(userIdB);

    // Agent Access Tokens (Bearer Token)
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

    console.log(`[AUTH CHECK] Human A Session: ${humanSessionA ? 'OK' : 'FAIL'}`);
    console.log(`[AUTH CHECK] Agent A Token:   ${agentTokenA ? 'OK' : 'FAIL'}`);
    console.log(`[AUTH CHECK] Human B Session: ${humanSessionB ? 'OK' : 'FAIL'}`);
    console.log(`[AUTH CHECK] Agent B Token:   ${agentTokenB ? 'OK' : 'FAIL'}\n`);

    // 2. Initialize and Synchronize Keys for Agent A and Agent B
    const keysA = await deriveAgentCryptoIdentity(agentIdA, passwordA);
    const keysB = await deriveAgentCryptoIdentity(agentIdB, passwordB);

    // Register Key A via Human Session
    const regKeyARes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${humanSessionA}`
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

    // Fetch registered keys from server to verify invariant
    const getE2eeARes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
      headers: { 'Authorization': `Bearer ${humanSessionA}` }
    });
    const getE2eeAJson = await safeJson(getE2eeARes);
    const serverFpA = getE2eeAJson.data?.fingerprint;

    const getE2eeBRes = await fetch(`${BASE_URL}/api/agents/me/e2ee`, {
      headers: { 'Authorization': `Bearer ${agentTokenB}` }
    });
    const getE2eeBJson = await safeJson(getE2eeBRes);
    const serverFpB = getE2eeBJson.data?.fingerprint;

    // Output Section 10 Diagnostics
    console.log('--- SECTION 10: E2EE KEY SYNCHRONIZATION DIAGNOSTIC REPORT ---');
    console.log(`Agent ID:                                   ${agentIdA}`);
    console.log(`Local Derived Public-Key Fingerprint (A):  ${keysA.fingerprint}`);
    console.log(`Server Registered Public-Key Fingerprint (A): ${serverFpA}`);
    console.log(`Key Epoch (A):                              1`);
    console.log(`MATCH STATUS (A):                           ${keysA.fingerprint === serverFpA ? 'MATCH' : 'MISMATCH'}`);
    console.log('');
    console.log(`Agent ID:                                   ${agentIdB}`);
    console.log(`Local Derived Public-Key Fingerprint (B):  ${keysB.fingerprint}`);
    console.log(`Server Registered Public-Key Fingerprint (B): ${serverFpB}`);
    console.log(`Key Epoch (B):                              1`);
    console.log(`MATCH STATUS (B):                           ${keysB.fingerprint === serverFpB ? 'MATCH' : 'MISMATCH'}`);
    console.log('-------------------------------------------------------------\n');

    if (keysA.fingerprint !== serverFpA || keysB.fingerprint !== serverFpB) {
      throw new Error('E2EE Key invariant check failed!');
    }

    // 3. Establish Connection between Agent A and Agent B
    // Create post by A
    const postRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({ content: 'Test post for E2EE messaging channel' })
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
      body: JSON.stringify({ content: 'Test reply for E2EE connection' })
    });
    const replyJson = await safeJson(replyRes);
    const replyId = replyJson.data?.id || replyJson.data?.replyId;

    // Connection established by A
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

    // -------------------------------------------------------------
    // TEST 1: Human A -> Human B
    // -------------------------------------------------------------
    console.log('Running TEST 1: Human A -> Human B...');
    const plaintext1 = 'Test 1: Confidential transmission from Human A to Human B';
    const enc1 = await encryptMessage(plaintext1, keysA.e2eePrivateKey, keysB.e2eePublicKey, connectionId, agentIdA, 1);

    const sendRes1 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${humanSessionA}`
      },
      body: JSON.stringify({
        ciphertext: enc1.ciphertext,
        nonce: enc1.nonce,
        version: enc1.version,
        keyEpoch: enc1.keyEpoch
      })
    });
    const sendJson1 = await safeJson(sendRes1);
    if (!sendRes1.ok || !sendJson1.success) throw new Error(`TEST 1 send failed: ${JSON.stringify(sendJson1)}`);
    const msgId1 = sendJson1.data?.id || sendJson1.data?.messageId;

    // Verify DB storage for msgId1: content must be null, ciphertext non-empty
    const { data: dbMsg1 } = await supabase.from('messages').select('*').eq('id', msgId1).single();
    if (dbMsg1.content !== null) throw new Error(`TEST 1 DB storage violation! content was not null: ${dbMsg1.content}`);
    if (!dbMsg1.ciphertext || !dbMsg1.nonce) throw new Error('TEST 1 DB storage violation! missing ciphertext or nonce');

    // Human B fetches and decrypts
    const fetchRes1 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      headers: { 'Authorization': `Bearer ${humanSessionB}` }
    });
    const fetchJson1 = await safeJson(fetchRes1);
    const fetchedMsg1 = (fetchJson1.data || []).find((m: any) => m.id === msgId1);
    
    const dec1 = await decryptMessage(
      { ciphertext: fetchedMsg1.ciphertext, nonce: fetchedMsg1.nonce, version: fetchedMsg1.version, keyEpoch: fetchedMsg1.keyEpoch },
      keysB.e2eePrivateKey,
      keysA.e2eePublicKey,
      connectionId,
      agentIdA
    );
    if (dec1 !== plaintext1) throw new Error(`TEST 1 Decryption mismatch! Got: ${dec1}`);
    console.log('✓ TEST 1 PASSED: Human A -> Human B (Verified DB content=null & E2EE decryption)\n');

    // -------------------------------------------------------------
    // TEST 2: Agent A -> Agent B
    // -------------------------------------------------------------
    console.log('Running TEST 2: Agent A -> Agent B...');
    const plaintext2 = 'Test 2: Confidential transmission from Agent A to Agent B';
    const enc2 = await encryptMessage(plaintext2, keysA.e2eePrivateKey, keysB.e2eePublicKey, connectionId, agentIdA, 1);

    const sendRes2 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: enc2.ciphertext,
        nonce: enc2.nonce,
        version: enc2.version,
        keyEpoch: enc2.keyEpoch
      })
    });
    const sendJson2 = await safeJson(sendRes2);
    if (!sendRes2.ok || !sendJson2.success) throw new Error(`TEST 2 send failed: ${JSON.stringify(sendJson2)}`);
    const msgId2 = sendJson2.data?.id || sendJson2.data?.messageId;

    // Verify DB storage for msgId2
    const { data: dbMsg2 } = await supabase.from('messages').select('*').eq('id', msgId2).single();
    if (dbMsg2.content !== null) throw new Error(`TEST 2 DB storage violation! content was not null`);

    // Agent B fetches and decrypts
    const fetchRes2 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      headers: { 'Authorization': `Bearer ${agentTokenB}` }
    });
    const fetchJson2 = await safeJson(fetchRes2);
    const fetchedMsg2 = (fetchJson2.data || []).find((m: any) => m.id === msgId2);

    const dec2 = await decryptMessage(
      { ciphertext: fetchedMsg2.ciphertext, nonce: fetchedMsg2.nonce, version: fetchedMsg2.version, keyEpoch: fetchedMsg2.keyEpoch },
      keysB.e2eePrivateKey,
      keysA.e2eePublicKey,
      connectionId,
      agentIdA
    );
    if (dec2 !== plaintext2) throw new Error(`TEST 2 Decryption mismatch!`);
    console.log('✓ TEST 2 PASSED: Agent A -> Agent B (Verified DB content=null & E2EE decryption)\n');

    // -------------------------------------------------------------
    // TEST 3: Agent A -> Human B
    // -------------------------------------------------------------
    console.log('Running TEST 3: Agent A -> Human B...');
    const plaintext3 = 'Test 3: Confidential transmission from Agent A to Human B';
    const enc3 = await encryptMessage(plaintext3, keysA.e2eePrivateKey, keysB.e2eePublicKey, connectionId, agentIdA, 1);

    const sendRes3 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agentTokenA}`
      },
      body: JSON.stringify({
        ciphertext: enc3.ciphertext,
        nonce: enc3.nonce,
        version: enc3.version,
        keyEpoch: enc3.keyEpoch
      })
    });
    const sendJson3 = await safeJson(sendRes3);
    const msgId3 = sendJson3.data?.id || sendJson3.data?.messageId;

    // Verify DB storage for msgId3
    const { data: dbMsg3 } = await supabase.from('messages').select('*').eq('id', msgId3).single();
    if (dbMsg3.content !== null) throw new Error(`TEST 3 DB storage violation! content was not null`);

    // Human B fetches and decrypts
    const fetchRes3 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      headers: { 'Authorization': `Bearer ${humanSessionB}` }
    });
    const fetchJson3 = await safeJson(fetchRes3);
    const fetchedMsg3 = (fetchJson3.data || []).find((m: any) => m.id === msgId3);

    const dec3 = await decryptMessage(
      { ciphertext: fetchedMsg3.ciphertext, nonce: fetchedMsg3.nonce, version: fetchedMsg3.version, keyEpoch: fetchedMsg3.keyEpoch },
      keysB.e2eePrivateKey,
      keysA.e2eePublicKey,
      connectionId,
      agentIdA
    );
    if (dec3 !== plaintext3) throw new Error(`TEST 3 Decryption mismatch!`);
    console.log('✓ TEST 3 PASSED: Agent A -> Human B (Verified DB content=null & E2EE decryption)\n');

    // -------------------------------------------------------------
    // TEST 4: Human A -> Agent B
    // -------------------------------------------------------------
    console.log('Running TEST 4: Human A -> Agent B...');
    const plaintext4 = 'Test 4: Confidential transmission from Human A to Agent B';
    const enc4 = await encryptMessage(plaintext4, keysA.e2eePrivateKey, keysB.e2eePublicKey, connectionId, agentIdA, 1);

    const sendRes4 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${humanSessionA}`
      },
      body: JSON.stringify({
        ciphertext: enc4.ciphertext,
        nonce: enc4.nonce,
        version: enc4.version,
        keyEpoch: enc4.keyEpoch
      })
    });
    const sendJson4 = await safeJson(sendRes4);
    const msgId4 = sendJson4.data?.id || sendJson4.data?.messageId;

    // Verify DB storage for msgId4
    const { data: dbMsg4 } = await supabase.from('messages').select('*').eq('id', msgId4).single();
    if (dbMsg4.content !== null) throw new Error(`TEST 4 DB storage violation! content was not null`);

    // Agent B fetches and decrypts
    const fetchRes4 = await fetch(`${BASE_URL}/api/connections/${connectionId}/messages`, {
      headers: { 'Authorization': `Bearer ${agentTokenB}` }
    });
    const fetchJson4 = await safeJson(fetchRes4);
    const fetchedMsg4 = (fetchJson4.data || []).find((m: any) => m.id === msgId4);

    const dec4 = await decryptMessage(
      { ciphertext: fetchedMsg4.ciphertext, nonce: fetchedMsg4.nonce, version: fetchedMsg4.version, keyEpoch: fetchedMsg4.keyEpoch },
      keysB.e2eePrivateKey,
      keysA.e2eePublicKey,
      connectionId,
      agentIdA
    );
    if (dec4 !== plaintext4) throw new Error(`TEST 4 Decryption mismatch!`);
    console.log('✓ TEST 4 PASSED: Human A -> Agent B (Verified DB content=null & E2EE decryption)\n');

    // -------------------------------------------------------------
    // TEST 5: Verify Fail-Closed Decryption Security
    // -------------------------------------------------------------
    console.log('Running TEST 5: Verify Fail-Closed Decryption Security...');
    const fakeKeys = await deriveAgentCryptoIdentity('FAKE_AGENT', 'WrongPassword!');
    try {
      await decryptMessage(
        { ciphertext: fetchedMsg4.ciphertext, nonce: fetchedMsg4.nonce, version: fetchedMsg4.version, keyEpoch: fetchedMsg4.keyEpoch },
        fakeKeys.e2eePrivateKey,
        keysA.e2eePublicKey,
        connectionId,
        agentIdA
      );
      throw new Error('FAIL! Decryption with wrong key should have thrown an error, but returned data!');
    } catch (e: any) {
      if (e.message.includes('FAIL!')) throw e;
      console.log(`✓ TEST 5 PASSED: Fail-closed decryption correctly rejected invalid key (${e.message})\n`);
    }

    console.log('====================================================');
    console.log('  ALL E2EE TEST MATRIX SCENARIOS SUCCEEDED (5/5)   ');
    console.log('====================================================');

  } catch (err: any) {
    console.error('❌ E2EE Test Matrix Failure:', err.message || err);
    process.exit(1);
  }
}

runE2EETestMatrix();
