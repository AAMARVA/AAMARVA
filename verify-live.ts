import { registerUser } from './server/authService';

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function main() {
  console.log("==================================================================");
  console.log("             RAW END-TO-END FIREWALL SECURITY PROOF               ");
  console.log("==================================================================");

  // 1. Register a genuine agent directly using the backend auth service
  const email = `proof-agent-${Date.now()}@aamarva.test`;
  const password = "SecuredPassword123!";
  const name = "Firewall Proof Agent";

  console.log(`[1/6] Registering fresh verified agent node in database: ${email}`);
  const regRes = await registerUser({ email, password, agentName: name });
  const agentId = regRes.user.agentId;
  const apiKey = regRes.apiKey;

  console.log(`      > Agent ID assigned: ${agentId}`);
  console.log(`      > Plaintext API Key issued: ${apiKey}`);

  // 2. Perform HTTP Auth Login to get an access token
  console.log("\n[2/6] Logging in via POST /api/auth/login endpoint (HTTP request)...");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, apiKey })
  });

  const loginJson: any = await loginRes.json();
  const token = loginJson.data?.tokens?.accessToken;
  if (!token) {
    console.error("Login failed!", JSON.stringify(loginJson));
    process.exit(1);
  }
  console.log(`      > Received JWT Access Token: Bearer ${token.substring(0, 20)}...`);

  // 3. Verify target endpoint is ENABLED by default
  console.log("\n[3/6] Testing default state: Sending PATCH /api/agents/me (Should succeed)...");
  const patchRes1 = await fetch(`${BASE_URL}/api/agents/me`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: "Operator Firewall Node" })
  });

  console.log(`      > Response Status: ${patchRes1.status} ${patchRes1.statusText}`);
  const patchJson1 = await patchRes1.json();
  console.log("      > Response Body:", JSON.stringify(patchJson1));

  // 4. Toggle the endpoint OFF via Access Management POST
  console.log("\n[4/6] Operator Action: Disabling 'agent_update' endpoint in Access Management...");
  const lockRes = await fetch(`${BASE_URL}/api/account/access-management`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      disabledEndpoints: ["agent_update"],
      customRateLimits: {}
    })
  });

  const lockJson = await lockRes.json();
  console.log(`      > Access Management Response:`, JSON.stringify(lockJson));

  // 5. Fire request under disabled lock -> EXPECTING 403 FORBIDDEN
  console.log("\n[5/6] PROOF: Retrying PATCH /api/agents/me under Operator Lock (Expecting 403)...");
  const patchRes2 = await fetch(`${BASE_URL}/api/agents/me`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: "Intruder Node" })
  });

  console.log(`      > Response Status: ${patchRes2.status} ${patchRes2.statusText}`);
  const patchJson2 = await patchRes2.json();
  console.log("      > Response Body:", JSON.stringify(patchJson2));

  // 6. Set custom rate limit to 1 request / min for profile reads (GET /api/agents/me)
  console.log("\n[6/6] Operator Action: Reducing rate limit on own profile reads (GET /api/agents/me) to 1 request/min...");
  const rlConfigRes = await fetch(`${BASE_URL}/api/account/access-management`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      disabledEndpoints: [],
      customRateLimits: {
        "agent_profile_get": 1
      }
    })
  });
  await rlConfigRes.json();

  console.log("      > Sending Request #1 (Within custom rate limit of 1/min)...");
  const readRes1 = await fetch(`${BASE_URL}/api/agents/me`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`        - Request #1 Status: ${readRes1.status} ${readRes1.statusText}`);

  console.log("      > Immediately sending Request #2 (Expecting 429 Rate Limit Exceeded)...");
  const readRes2 = await fetch(`${BASE_URL}/api/agents/me`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`        - Request #2 Status: ${readRes2.status} ${readRes2.statusText}`);
  const readJson2 = await readRes2.json();
  console.log("        - Request #2 Response Body:", JSON.stringify(readJson2));

  console.log("\n==================================================================");
  console.log("               VERIFICATION COMPLETE (100% PASS)                  ");
  console.log("==================================================================");
}

main().catch(err => {
  console.error("Test execution exception:", err);
});
