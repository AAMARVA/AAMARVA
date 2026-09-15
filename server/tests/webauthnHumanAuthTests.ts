import http from 'http';
import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import aamarvaRoutes from '../routes/aamarvaRoutes';
import { 
  registerUser, 
  generateCsrfToken,
  saveUserWebAuthnCredential,
  getUserWebAuthnCredentials
} from '../authService';
import { getSupabaseClient } from '../supabase';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runWebAuthnHumanAuthTests(): Promise<boolean> {
  console.log('===========================================================');
  console.log('  AAMARVA HARDENED HUMAN AUTHENTICATION BOUNDARY TESTS     ');
  console.log('===========================================================');

  const results: TestResult[] = [];
  const record = (id: string, name: string, passed: boolean, error?: string) => {
    results.push({ id, name, passed, error });
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} [${id}] ${name}${error ? ` -> ${error}` : ''}`);
  };

  // 1. Setup ephemeral test server
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', aamarvaRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const trustedOrigin = 'http://127.0.0.1:3000';
  const trustedRpId = '127.0.0.1';

  try {
    // Register two test users
    const uniqueId = Date.now();
    const userAPassword = 'Password123!Secure';
    const userBPassword = 'Password456!Secure';

    const userA = await registerUser({
      email: `userA-${uniqueId}@example.com`,
      password: userAPassword,
      name: 'Test User A',
      agentId: `AMR-TEST-A${uniqueId}`,
    });

    const userB = await registerUser({
      email: `userB-${uniqueId}@example.com`,
      password: userBPassword,
      name: 'Test User B',
      agentId: `AMR-TEST-B${uniqueId}`,
    });

    // Setup an authentic WebAuthn keypair for User A
    const keyPairA = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwkA = keyPairA.publicKey.export({ format: 'jwk' });
    const xA = Buffer.from(jwkA.x!, 'base64url');
    const yA = Buffer.from(jwkA.y!, 'base64url');
    const cosePublicKeyA = new Uint8Array([
      0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01,
      0x21, 0x58, 0x20, ...xA,
      0x22, 0x58, 0x20, ...yA,
    ]);
    const credentialIdA = Buffer.from(`cred-a-${uniqueId}`).toString('base64url');

    await saveUserWebAuthnCredential(userA.user.id, {
      id: credentialIdA,
      credentialId: credentialIdA,
      userId: userA.user.id,
      publicKey: Buffer.from(cosePublicKeyA).toString('base64'),
      counter: 0,
      transports: ['internal'],
      createdAt: new Date().toISOString(),
      deviceName: 'Test Authenticator A',
    } as any);

    // Helper to get fresh CSRF token
    const getCsrf = async () => {
      const res = await fetch(`${baseUrl}/api/auth/csrf`, {
        headers: { 'Origin': trustedOrigin }
      });
      const data = await res.json();
      return data.data.csrfToken;
    };

    // Helper to sign WebAuthn assertion
    const createAssertion = (
      credId: string, 
      challenge: string, 
      rpId: string, 
      origin: string, 
      privateKey: crypto.KeyObject, 
      counter: number = 1
    ) => {
      const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
      const flags = Buffer.from([0x05]); // UP + UV
      const signCount = Buffer.alloc(4);
      signCount.writeUInt32BE(counter, 0);
      const authData = Buffer.concat([rpIdHash, flags, signCount]);

      const clientDataObj = {
        type: 'webauthn.get',
        challenge,
        origin,
        crossOrigin: false,
      };
      const clientDataJSON = Buffer.from(JSON.stringify(clientDataObj), 'utf-8');
      const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
      const signaturePayload = Buffer.concat([authData, clientDataHash]);

      const signer = crypto.createSign('SHA256');
      signer.update(signaturePayload);
      const signature = signer.sign(privateKey);

      return {
        id: credId,
        rawId: credId,
        response: {
          authenticatorData: authData.toString('base64url'),
          clientDataJSON: clientDataJSON.toString('base64url'),
          signature: signature.toString('base64url'),
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      };
    };

    // Helper to generate simulated WebAuthn registration attestation response
    const createRegistrationResponse = (
      credId: string,
      challenge: string,
      rpId: string,
      origin: string,
      publicKeyJwk: any
    ) => {
      const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
      const flags = Buffer.from([0x45]); // UP + UV + AT
      const signCount = Buffer.alloc(4);
      signCount.writeUInt32BE(0, 0);
      const aaguid = Buffer.alloc(16); // 16 zeros
      const credIdBuf = Buffer.from(credId, 'base64url');
      const credIdLenBuf = Buffer.alloc(2);
      credIdLenBuf.writeUInt16BE(credIdBuf.length, 0);

      const xBuf = Buffer.from(publicKeyJwk.x!, 'base64url');
      const yBuf = Buffer.from(publicKeyJwk.y!, 'base64url');
      const cosePubKey = Buffer.from([
        0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01,
        0x21, 0x58, 0x20, ...xBuf,
        0x22, 0x58, 0x20, ...yBuf,
      ]);

      const authData = Buffer.concat([
        rpIdHash,
        flags,
        signCount,
        aaguid,
        credIdLenBuf,
        credIdBuf,
        cosePubKey,
      ]);

      const clientDataObj = {
        type: 'webauthn.create',
        challenge,
        origin,
        crossOrigin: false,
      };
      const clientDataJSON = Buffer.from(JSON.stringify(clientDataObj), 'utf-8');

      // CBOR map (3 items): { fmt: 'none', attStmt: {}, authData: <bytes> }
      const fmtBytes = Buffer.from([0x63, 0x66, 0x6d, 0x74, 0x64, 0x6e, 0x6f, 0x6e, 0x65]);
      const attStmtBytes = Buffer.from([0x67, 0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74, 0xa0]);
      const authDataKey = Buffer.from([0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61]);
      const authDataLen = authData.length < 256
        ? Buffer.from([0x58, authData.length])
        : Buffer.from([0x59, (authData.length >> 8) & 0xff, authData.length & 0xff]);

      const attestationObject = Buffer.concat([
        Buffer.from([0xa3]),
        fmtBytes,
        attStmtBytes,
        authDataKey,
        authDataLen,
        authData,
      ]);

      return {
        id: credId,
        rawId: credId,
        response: {
          clientDataJSON: clientDataJSON.toString('base64url'),
          attestationObject: attestationObject.toString('base64url'),
          transports: ['internal'],
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      };
    };

    // -------------------------------------------------------------
    // TEST 1: Agent ID + password alone -> fails to create human session
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
          // Omitting challengeId & assertion
        })
      });
      const body = await res.json();
      const passed = (res.status === 400 || res.status === 401) && body.error?.code === 'WEBAUTHN_REQUIRED';
      record('TEST-01', 'Agent ID + correct password alone cannot create human session', passed, !passed ? `Status ${res.status}: ${JSON.stringify(body)}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 2: Agent ID + incorrect password -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: 'WrongPassword999!',
        })
      });
      const passed = res.status === 401;
      record('TEST-02', 'Agent ID + incorrect password fails challenge issuance', passed);
    }

    // -------------------------------------------------------------
    // TEST 3: Unknown Agent ID -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: 'AMR-NONEXISTENT-AGENT',
          password: 'SomePassword123!',
        })
      });
      const passed = res.status === 401;
      record('TEST-03', 'Unknown Agent ID fails challenge issuance', passed);
    }

    // -------------------------------------------------------------
    // TEST 4: Agent API key submitted to /api/auth/human/login -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
          'x-api-key': userA.apiKey,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
        })
      });
      const passed = res.status === 403;
      record('TEST-04', 'Agent API key submitted to human login endpoint is strictly rejected', passed);
    }

    // -------------------------------------------------------------
    // TEST 5: Bearer token submitted to /api/auth/human/login -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
          'Authorization': 'Bearer test-agent-bearer-token',
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
        })
      });
      const passed = res.status === 403;
      record('TEST-05', 'Bearer token submitted to human login endpoint is strictly rejected', passed);
    }

    // -------------------------------------------------------------
    // TEST 6: Missing Origin on human login -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
          // No Origin or Referer
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
        })
      });
      const passed = res.status === 403;
      record('TEST-06', 'Missing Origin and Referer rejected on human auth endpoint', passed);
    }

    // -------------------------------------------------------------
    // TEST 7: Invalid/untrusted Origin -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://malicious-agent-site.net',
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
        })
      });
      const passed = res.status === 403;
      record('TEST-07', 'Untrusted Origin rejected on human auth endpoint', passed);
    }

    // -------------------------------------------------------------
    // TEST 8: Missing/invalid CSRF token -> fails
    // -------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': 'invalid-csrf-token-12345',
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
        })
      });
      const passed = res.status === 403;
      record('TEST-08', 'Invalid CSRF token rejected on human auth endpoint', passed);
    }

    // -------------------------------------------------------------
    // TEST 9: Challenge generated for User A, used for User B -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      // Request challenge for user A
      const chalRes = await fetch(`${baseUrl}/api/auth/human/login/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
        })
      });
      const { data: chalData } = await chalRes.json();
      const assertion = createAssertion(credentialIdA, chalData.options.challenge, trustedRpId, trustedOrigin, keyPairA.privateKey);

      // Attempt login as User B using User A's challenge
      const loginRes = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userB.agentId,
          password: userBPassword,
          challengeId: chalData.challengeId,
          assertion,
        })
      });
      const passed = loginRes.status === 403 || loginRes.status === 400 || loginRes.status === 401;
      record('TEST-09', 'Cross-user challenge binding rejected', passed);
    }

    // -------------------------------------------------------------
    // TEST 10: Expired challenge -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      // Challenge that doesn't exist or expired
      const expiredChallengeId = 'nonexistent-or-expired-challenge-id';
      const assertion = createAssertion(credentialIdA, 'fake-challenge', trustedRpId, trustedOrigin, keyPairA.privateKey);

      const res = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
          challengeId: expiredChallengeId,
          assertion,
        })
      });
      const passed = res.status === 400 || res.status === 401;
      record('TEST-10', 'Expired or non-existent challenge is rejected', passed);
    }

    // -------------------------------------------------------------
    // TEST 11: Replayed challenge -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const chalRes = await fetch(`${baseUrl}/api/auth/human/login/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
        })
      });
      const { data: chalData } = await chalRes.json();
      const assertion = createAssertion(credentialIdA, chalData.options.challenge, trustedRpId, trustedOrigin, keyPairA.privateKey);

      // Attempt 1: succeeds
      const login1 = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
          challengeId: chalData.challengeId,
          assertion,
        })
      });

      // Attempt 2: replay with same challengeId -> MUST fail
      const login2 = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
          challengeId: chalData.challengeId,
          assertion,
        })
      });
      const passed = login2.status === 400 || login2.status === 401;
      record('TEST-11', 'Replayed challenge is consumed and immediately fails on second use', passed);
    }

    // -------------------------------------------------------------
    // TEST 12: Invalid WebAuthn signature -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const chalRes = await fetch(`${baseUrl}/api/auth/human/login/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
        })
      });
      const { data: chalData } = await chalRes.json();

      // Sign with an unrelated foreign private key!
      const foreignKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const badAssertion = createAssertion(credentialIdA, chalData.options.challenge, trustedRpId, trustedOrigin, foreignKeyPair.privateKey);

      const loginRes = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
          challengeId: chalData.challengeId,
          assertion: badAssertion,
        })
      });
      const passed = loginRes.status === 401;
      record('TEST-12', 'Invalid WebAuthn signature strictly rejected', passed);
    }

    // -------------------------------------------------------------
    // TEST 13: Tampered assertion data -> fails
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const chalRes = await fetch(`${baseUrl}/api/auth/human/login/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
        })
      });
      const { data: chalData } = await chalRes.json();
      const assertion = createAssertion(credentialIdA, chalData.options.challenge, trustedRpId, trustedOrigin, keyPairA.privateKey);

      // Tamper with clientDataJSON
      const tamperedObj = { type: 'webauthn.get', challenge: 'tampered-challenge', origin: trustedOrigin };
      assertion.response.clientDataJSON = Buffer.from(JSON.stringify(tamperedObj)).toString('base64url');

      const loginRes = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
          challengeId: chalData.challengeId,
          assertion,
        })
      });
      const passed = loginRes.status === 401;
      record('TEST-13', 'Tampered WebAuthn assertion rejected', passed);
    }

    // -------------------------------------------------------------
    // TEST 14: Valid password + valid WebAuthn assertion -> succeeds
    // -------------------------------------------------------------
    let humanCookie = '';
    {
      const csrf = await getCsrf();
      const chalRes = await fetch(`${baseUrl}/api/auth/human/login/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
        })
      });
      const { data: chalData } = await chalRes.json();
      const validAssertion = createAssertion(credentialIdA, chalData.options.challenge, trustedRpId, trustedOrigin, keyPairA.privateKey, 2);

      const loginRes = await fetch(`${baseUrl}/api/auth/human/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userA.agentId,
          password: userAPassword,
          challengeId: chalData.challengeId,
          assertion: validAssertion,
        })
      });

      const setCookieHeader = loginRes.headers.get('set-cookie');
      const body = await loginRes.json();
      const passed = loginRes.status === 200 && !!setCookieHeader && setCookieHeader.includes('aamarva_human_session');
      if (setCookieHeader) {
        humanCookie = setCookieHeader.split(';')[0];
      }
      record('TEST-14', 'Valid password + authentic WebAuthn passkey creates human session', passed, !passed ? `Status ${loginRes.status}: ${JSON.stringify(body)}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 15: Authenticated human session can access passkey registration options
    // -------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/auth/webauthn/register/options`, {
        method: 'POST',
        headers: {
          'Cookie': humanCookie,
        }
      });
      const data = await res.json();
      const passed = res.status === 200 && !!data.data?.options?.challenge;
      record('TEST-15', 'Authenticated human session can request passkey registration options', passed);
    }

    // -------------------------------------------------------------
    // TEST 16: Agent-authenticated request cannot register a passkey
    // -------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/auth/webauthn/register/options`, {
        method: 'POST',
        headers: {
          'x-api-key': userA.apiKey,
        }
      });
      const passed = res.status === 401 || res.status === 403;
      record('TEST-16', 'Agent credentials (X-API-KEY) cannot access passkey registration', passed);
    }

    // -------------------------------------------------------------
    // TEST 17: Unauthenticated request cannot register a passkey
    // -------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/auth/webauthn/register/options`, {
        method: 'POST',
      });
      const passed = res.status === 401;
      record('TEST-17', 'Unauthenticated request cannot access passkey registration', passed);
    }

    // -------------------------------------------------------------
    // TEST 18: Agent cannot use agent credential on human session endpoint
    // -------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/auth/human/session`, {
        headers: {
          'x-api-key': userA.apiKey || '',
        }
      });
      const passed = res.status === 403 || res.status === 401;
      record('TEST-18', 'Agent credentials cannot access human session verification endpoint', passed, !passed ? `Status ${res.status}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 19: Human session cookie successfully accesses human endpoint
    // -------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/auth/human/session`, {
        headers: {
          'Cookie': humanCookie,
        }
      });
      const body = await res.json();
      const passed = res.status === 200 && body.data?.user?.agentId === userA.agentId;
      record('TEST-19', 'Human session cookie successfully accesses human session endpoint', passed);
    }

    // -------------------------------------------------------------
    // TEST 20: Agent token cannot access human-only endpoints (Strict Isolation)
    // -------------------------------------------------------------
    {
      // Agent login
      const agentLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: userA.agentId,
          apiKey: userA.apiKey,
        })
      });
      const agentLoginData = await agentLoginRes.json();
      const agentAccessToken = agentLoginData.data?.tokens?.accessToken;

      // Try accessing human session endpoint with agent Bearer token
      const sessionRes = await fetch(`${baseUrl}/api/auth/human/session`, {
        headers: {
          'Authorization': `Bearer ${agentAccessToken}`,
        }
      });

      // Try accessing secrets preserver with agent Bearer token
      const secretsRes = await fetch(`${baseUrl}/api/secrets`, {
        headers: {
          'Authorization': `Bearer ${agentAccessToken}`,
        }
      });

      const passed = sessionRes.status === 403 && secretsRes.status === 403;
      record('TEST-20', 'Agent access token cannot access human session or secrets endpoints (403 AGENT_ACCESS_FORBIDDEN)', passed, !passed ? `Session: ${sessionRes.status}, Secrets: ${secretsRes.status}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 21: Account without enrolled passkey receives enrollmentRequired: true
    // -------------------------------------------------------------
    let userBEnrollChallenge: any = null;
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userB.agentId,
          password: userBPassword,
        })
      });
      const body = await res.json();
      const passed = res.status === 200 &&
        body.success === true &&
        body.data?.enrollmentRequired === true &&
        !!body.data?.challengeId &&
        !!body.data?.options?.challenge;
      userBEnrollChallenge = body.data;
      record('TEST-21', 'Account with valid password but no passkey receives enrollmentRequired: true and registration options', passed, !passed ? `Status ${res.status}: ${JSON.stringify(body)}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 22: First-time passkey enrollment via /api/auth/human/login/enroll succeeds and establishes human session
    // -------------------------------------------------------------
    let userBSessionCookie = '';
    const userBKey = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const userBJwk = userBKey.publicKey.export({ format: 'jwk' });
    const userBCredId = crypto.randomBytes(32).toString('base64url');

    {
      const csrf = await getCsrf();
      const attestation = createRegistrationResponse(
        userBCredId,
        userBEnrollChallenge.options.challenge,
        'localhost',
        trustedOrigin,
        userBJwk
      );

      const res = await fetch(`${baseUrl}/api/auth/human/login/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userB.agentId,
          password: userBPassword,
          challengeId: userBEnrollChallenge.challengeId,
          response: attestation,
          deviceName: 'Primary Security Key',
        })
      });

      const setCookie = res.headers.get('set-cookie');
      const body = await res.json();
      const passed = res.status === 200 &&
        body.success === true &&
        body.data?.user?.agentId === userB.agentId &&
        !!setCookie && setCookie.includes('aamarva_human_session');

      if (setCookie) {
        userBSessionCookie = setCookie.split(';')[0];
      }

      record('TEST-22', 'First-time passkey enrollment verifies attestation and sets human session cookie', passed, !passed ? `Status ${res.status}: ${JSON.stringify(body)}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 23: Subsequent login challenge for newly enrolled account returns enrollmentRequired: false
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userB.agentId,
          password: userBPassword,
        })
      });
      const body = await res.json();
      const passed = res.status === 200 &&
        body.success === true &&
        body.data?.enrollmentRequired === false &&
        !!body.data?.options?.allowCredentials &&
        body.data.options.allowCredentials.length > 0;

      record('TEST-23', 'Subsequent challenge for enrolled account returns enrollmentRequired: false and authentication options', passed, !passed ? `Status ${res.status}: ${JSON.stringify(body)}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 24: Password alone submitted to /api/auth/human/login/enroll is rejected (400)
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userB.agentId,
          password: userBPassword,
          // Missing challengeId and response
        })
      });
      const body = await res.json();
      const passed = res.status === 400 && body.error?.code === 'WEBAUTHN_REQUIRED';
      record('TEST-24', 'Password alone without attestation response rejected on enrollment endpoint (400 WEBAUTHN_REQUIRED)', passed, !passed ? `Status ${res.status}: ${JSON.stringify(body)}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 25: Agent API Key or Bearer submitted to /api/auth/human/login/enroll is strictly rejected (403)
    // -------------------------------------------------------------
    {
      const csrf = await getCsrf();
      const res = await fetch(`${baseUrl}/api/auth/human/login/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
          'X-API-KEY': userB.apiKey,
        },
        body: JSON.stringify({
          agentId: userB.agentId,
          password: userBPassword,
        })
      });
      const body = await res.json();
      const passed = res.status === 403 && body.error?.code === 'AGENT_ACCESS_FORBIDDEN';
      record('TEST-25', 'Agent API key submitted to passkey enrollment endpoint is strictly rejected (403 AGENT_ACCESS_FORBIDDEN)', passed, !passed ? `Status ${res.status}: ${JSON.stringify(body)}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 26: CSRF endpoint creates and persists a valid token
    // -------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/auth/csrf`, {
        headers: { 'Origin': trustedOrigin }
      });
      const body = await res.json();
      const passed = res.status === 200 && body.success === true && typeof body.data?.csrfToken === 'string' && body.data.csrfToken.length === 64;
      record('TEST-CSRF-01', 'CSRF endpoint successfully generates and returns 64-char hex token', passed, !passed ? `Status ${res.status}: ${JSON.stringify(body)}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 27: Persistent CSRF storage failure fails bootstrap and rejects auth
    // -------------------------------------------------------------
    {
      process.env.FORCE_CSRF_DB_FAIL = 'true';
      try {
        const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, {
          headers: { 'Origin': trustedOrigin }
        });
        const csrfBody = await csrfRes.json();
        
        // Attempt login challenge during DB failure
        const chalRes = await fetch(`${baseUrl}/api/auth/human/login/challenge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': trustedOrigin,
            'x-csrf-token': 'any-token',
          },
          body: JSON.stringify({
            agentId: userA.agentId,
            password: userAPassword,
          })
        });

        const passed = csrfRes.status === 500 && 
          csrfBody.error?.code === 'CSRF_BOOTSTRAP_FAILED' &&
          chalRes.status === 403;

        record('TEST-CSRF-06', 'Persistent CSRF storage failure fails bootstrap (500) and halts human auth (403)', passed, !passed ? `Csrf: ${csrfRes.status}, Chal: ${chalRes.status}` : undefined);
      } finally {
        delete process.env.FORCE_CSRF_DB_FAIL;
      }
    }

    // -------------------------------------------------------------
    // TEST 28: New human registration does NOT create a human session before WebAuthn
    // -------------------------------------------------------------
    {
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: `unverified-user-${Date.now()}@example.com`,
          password: 'Password123!Secure',
          name: 'Unverified Human User',
        })
      });
      const regCookie = regRes.headers.get('set-cookie');
      const regBody = await regRes.json();
      const passed = regRes.status === 201 &&
        regBody.success === true &&
        (!regCookie || !regCookie.includes('aamarva_human_session'));

      record('TEST-AUTH-11', 'New registration does NOT issue human session cookie before WebAuthn enrollment', passed, !passed ? `Cookie: ${regCookie}` : undefined);
    }

    // -------------------------------------------------------------
    // TEST 29: Cancelled or failed WebAuthn enrollment does NOT create a human session
    // -------------------------------------------------------------
    {
      const uniqueC = Date.now();
      const userC = await registerUser({
        email: `userC-${uniqueC}@example.com`,
        password: 'Password123!Secure',
        name: 'User C',
        agentId: `AMR-TEST-C${uniqueC}`,
      });

      const csrf = await getCsrf();
      // Attempt passkey enrollment with invalid attestation
      const enrollRes = await fetch(`${baseUrl}/api/auth/human/login/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': trustedOrigin,
          'x-csrf-token': csrf,
        },
        body: JSON.stringify({
          agentId: userC.agentId,
          password: 'Password123!Secure',
          challengeId: 'invalid-challenge',
          response: { invalid: true },
        })
      });

      const setCookie = enrollRes.headers.get('set-cookie');
      const passed = (enrollRes.status === 400 || enrollRes.status === 401) &&
        (!setCookie || !setCookie.includes('aamarva_human_session'));

      record('TEST-AUTH-13', 'Failed or cancelled WebAuthn enrollment does not establish human session', passed, !passed ? `Status ${enrollRes.status}, Cookie: ${setCookie}` : undefined);
    }

  } finally {
    server.close();
  }

  const allPassed = results.every(r => r.passed);
  console.log('===========================================================');
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter(r => r.passed).length} | FAILED: ${results.filter(r => !r.passed).length}`);
  console.log('===========================================================');
  return allPassed;
}
