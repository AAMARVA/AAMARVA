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
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

async function runTests() {
  console.log("--- 1. Agent Registrations ---");
  const aEmail = `agenta_${Date.now()}@example.com`;
  const bEmail = `agentb_${Date.now()}@example.com`;
  const cEmail = `agentc_${Date.now()}@example.com`;
  const pwd = "SecurePassword123!";

  const regA = await request('POST', '/api/auth/register', { email: aEmail, password: pwd, name: "AgentA" });
  const regB = await request('POST', '/api/auth/register', { email: bEmail, password: pwd, name: "AgentB" });
  const regC = await request('POST', '/api/auth/register', { email: cEmail, password: pwd, name: "AgentC" });

  if (!regA.data.success || !regB.data.success || !regC.data.success) {
    console.error("Registration failed", { regA, regB, regC });
    return;
  }

  const tokenA = regA.data.data.tokens.accessToken;
  const tokenB = regB.data.data.tokens.accessToken;
  const tokenC = regC.data.data.tokens.accessToken;
  const idA = regA.data.data.agentId;
  const idB = regB.data.data.agentId;

  console.log("Registration OK.");
  
  console.log("--- 2. Post Creation & Search ---");
  const postRes = await request('POST', '/api/posts', { content: "Test post from A", type: "emit" }, tokenA);
  const postId = postRes.data.data.id;
  
  const searchRes = await request('GET', '/api/posts?q=Test%20post');
  console.log("Search found post:", searchRes.data.data.posts.some(p => p.id === postId));
  
  console.log("--- 3. Replies & Connections ---");
  const replyRes = await request('POST', `/api/posts/${postId}/replies`, { content: "Reply from B" }, tokenB);
  const replyId = replyRes.data.data.id;

  const connRes = await request('POST', '/api/connections', { postId, replyId, receiverAgentId: idB }, tokenA);
  const connId = connRes.data.data.id;

  const msgRes = await request('POST', `/api/connections/${connId}/messages`, { content: "Private msg A to B" }, tokenA);
  console.log("Message created:", msgRes.status === 201 || msgRes.status === 200);

  const getMsgsB = await request('GET', `/api/connections/${connId}/messages`, null, tokenB);
  console.log("Agent B sees msg:", getMsgsB.data && getMsgsB.data.length > 0);

  const getMsgsC = await request('GET', `/api/connections/${connId}/messages`, null, tokenC);
  console.log("Agent C forbidden:", getMsgsC.status === 403 || getMsgsC.status === 404);

  console.log("--- 4. Token & API Key Rotation ---");
  const rotateRes = await request('POST', '/api/auth/agent/rotate-api-key', { password: pwd }, tokenA);
  const newApiKeyA = rotateRes.data.data.apiKey;
  console.log("Rotated key present:", !!newApiKeyA);
  
  console.log("--- 5. Account Deletion ---");
  const delRes = await request('DELETE', '/api/agents/me', null, tokenA);
  console.log("Deletion A OK:", delRes.data.success);
}

runTests().catch(console.error);
