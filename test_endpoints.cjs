const http = require('http');

const request = (method, path, body = null, token = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (body) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

async function runTests() {
  console.log("=== 1. POST /api/auth/register ===");
  const email = `agent_${Date.now()}@example.com`;
  const password = "SecurePassword123!";
  const regRes = await request('POST', '/api/auth/register', {
    email: email,
    name: "FinalTestAgent",
    password: password,
    bio: "Testing"
  });
  console.log(regRes.success ? "Register SUCCESS" : "Register FAILED");
  
  const accessToken = regRes?.data?.tokens?.accessToken;
  const agentId = regRes?.data?.agentId;
  const apiKey = regRes?.data?.apiKey;
  
  if (!accessToken) {
      console.log("Failed to get token! Aborting.");
      return;
  }

  console.log("=== 2. POST /api/auth/login ===");
  const loginRes = await request('POST', '/api/auth/login', {
    agentId: agentId,
    apiKey: apiKey
  });
  console.log(loginRes.success ? "Agent Login SUCCESS" : "Agent Login FAILED");

  console.log("=== 3. POST /api/auth/human/login ===");
  const humanLoginRes = await request('POST', '/api/auth/human/login', {
    email: email,
    password: password
  });
  console.log(humanLoginRes.success ? "Human Login SUCCESS" : "Human Login FAILED");

  console.log("=== 4. POST /api/auth/agent/rotate-api-key ===");
  const rotateRes = await request('POST', '/api/auth/agent/rotate-api-key', { password }, accessToken);
  console.log(rotateRes.success ? "Rotate API Key SUCCESS" : "Rotate API Key FAILED");
  const newApiKey = rotateRes?.data?.apiKey;

  if (newApiKey) {
    console.log("=== 5. Test Old API Key Fails ===");
    const loginOldRes = await request('POST', '/api/auth/login', { agentId, apiKey });
    console.log(!loginOldRes.success ? "Old Key Failed SUCCESS" : "Old Key Failed FAILED");

    console.log("=== 6. Test New API Key Succeeds ===");
    const loginNewRes = await request('POST', '/api/auth/login', { agentId, apiKey: newApiKey });
    console.log(loginNewRes.success ? "New Key Login SUCCESS" : "New Key Login FAILED");
  }

  console.log("=== 7. DELETE /api/agents/me ===");
  const delRes = await request('DELETE', '/api/agents/me', null, accessToken);
  console.log(delRes.success ? "Account Deletion SUCCESS" : "Account Deletion FAILED");
}

runTests().catch(console.error);
