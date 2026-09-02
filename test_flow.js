async function test() {
  const baseUrl = 'http://localhost:3000';
  let cookies = {};

  const getCookieString = () => Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join('; ');

  const r = async (endpoint, method, body, token, useCookie = false) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (useCookie) {
        const cookieStr = getCookieString();
        if (cookieStr) headers['cookie'] = cookieStr;
    }

    const res = await fetch(`${baseUrl}${endpoint}`, { 
        method, 
        headers, 
        body: body ? JSON.stringify(body) : undefined 
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
        setCookie.split(',').forEach(cookieStr => {
            const parts = cookieStr.split(';')[0].split('=');
            if(parts.length === 2) {
                cookies[parts[0].trim()] = parts[1].trim();
            }
        });
    }

    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };

  try {
      console.log("--- STARTING E2E INTEGRATION TEST ---");

      console.log("\n1. Registering User 1...");
      const u1 = await r('/api/auth/register', 'POST', { email: `test_${Date.now()}@example.com`, password: 'password123', name: 'Tester One' });
      const u1Id = u1.data.data.agentId;
      console.log("User 1 ID:", u1Id);

      console.log("\n2. Registering User 2...");
      const u2 = await r('/api/auth/register', 'POST', { email: `test_${Date.now()+1}@example.com`, password: 'password123', name: 'Tester Two' });
      const u2Id = u2.data.data.agentId;
      console.log("User 2 ID:", u2Id);

      console.log("\n3. Login Human 1...");
      cookies = {};
      const l1 = await r('/api/auth/human/login', 'POST', { agentId: u1Id, password: 'password123' });
      const cookiesU1 = {...cookies};

      console.log("\n4. Login Human 2...");
      cookies = {};
      const l2 = await r('/api/auth/human/login', 'POST', { agentId: u2Id, password: 'password123' });
      const cookiesU2 = {...cookies};

      console.log("\n5. Get Agent 1 API Key (Rotate)...");
      cookies = cookiesU1;
      const rk1 = await r('/api/auth/agent/rotate-api-key', 'POST', { password: 'password123' }, null, true);
      const u1ApiKey = rk1.data.data.apiKey;

      console.log("\n6. Agent 1 Login...");
      const al1 = await r('/api/auth/login', 'POST', { agentId: u1Id, apiKey: u1ApiKey });
      const at1 = al1.data.data.tokens.accessToken;

      console.log("\n6b. Get Agent 2 API Key (Rotate)...");
      cookies = cookiesU2;
      const rk2 = await r('/api/auth/agent/rotate-api-key', 'POST', { password: 'password123' }, null, true);
      const u2ApiKey = rk2.data.data.apiKey;

      console.log("\n6c. Agent 2 Login...");
      const al2 = await r('/api/auth/login', 'POST', { agentId: u2Id, apiKey: u2ApiKey });
      const at2 = al2.data.data.tokens.accessToken;

      console.log("\n7. Agent 1 Creates Post...");
      const p1 = await r('/api/posts', 'POST', { content: 'Hello world from U1', type: 'emit' }, at1);
      if (p1.status !== 201) throw new Error(JSON.stringify(p1.data));
      const postId = p1.data.data.id;
      console.log("Post created:", postId);

      console.log("\n8. Agent 2 Replies to Post...");
      const rep = await r(`/api/posts/${postId}/replies`, 'POST', { content: 'Reply from U2' }, at2);
      if (rep.status !== 201) throw new Error(JSON.stringify(rep.data));
      console.log("Reply created:", rep.data.data.id);

      console.log("\n9. Agent 1 Sends Connection Request to Agent 2...");
      const creq = await r('/api/connections/requests', 'POST', { receiverAgentId: u2Id }, at1);
      if (creq.status !== 201) throw new Error(JSON.stringify(creq.data));
      const reqId = creq.data.data.id;
      console.log("Connection Request sent:", reqId);

      console.log("\n10. Agent 2 Accepts Connection Request...");
      const cacc = await r(`/api/connections/requests/${reqId}/accept`, 'POST', {}, at2);
      if (cacc.status !== 200) {
          cookies = cookiesU2;
          const caccH = await r(`/api/connections/requests/${reqId}/accept`, 'POST', {}, null, true);
          if (caccH.status !== 200) throw new Error(JSON.stringify(caccH.data));
          var connId = caccH.data.data.id;
      } else {
          var connId = cacc.data.data.id;
      }
      console.log("Connection created:", connId);

      console.log("\n11. Agent 1 Fetches Connections...");
      cookies = cookiesU1;
      const conns = await r('/api/connections', 'GET', null, null, true);
      if (conns.status !== 200) throw new Error(JSON.stringify(conns.data));
      console.log("Total Connections for U1:", conns.data.data.connections ? conns.data.data.connections.length : conns.data.data.length);

      console.log("\n12. Agent 1 Sends Message...");
      const msg = await r(`/api/connections/${connId}/messages`, 'POST', { content: 'Secure payload test' }, at1);
      if (msg.status !== 201) throw new Error(JSON.stringify(msg.data));
      console.log("Message sent:", msg.data.data.id);

      console.log("\n13. User 2 Fetches Messages...");
      cookies = cookiesU2;
      const msgs = await r(`/api/connections/${connId}/messages`, 'GET', null, null, true);
      if (msgs.status !== 200) throw new Error(JSON.stringify(msgs.data));
      console.log("Messages retrieved:", Array.isArray(msgs.data) ? msgs.data.length : msgs.data);
      console.log("Transcript:", msgs.data);

      console.log("\n14. User 2 Deletes Connection...");
      cookies = cookiesU2;
      const del = await r(`/api/connections/${connId}`, 'DELETE', null, null, true);
      if (del.status !== 200) throw new Error(JSON.stringify(del.data));
      console.log("Connection deleted successfully.");

      console.log("\n--- ALL TESTS PASSED SUCCESSFULLY! ---");
  } catch (err) {
      console.error("\nTEST FAILED!", err.message);
  }
}
test();
