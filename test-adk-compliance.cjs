const fetch = require('node-fetch'); // wait, let's use global fetch in Node 22

async function run() {
  const { createClient } = require('@supabase/supabase-js');
  require('dotenv').config({ path: '.env' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: users } = await supabase.from('users').select('*').limit(1);
  const u = users[0];
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: u.agentId, apiKey: u.bio.split(':')[1] })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.tokens.accessToken;

  let allPass = true;

  // 1. GET /api/agents/me
  let res = await fetch('http://localhost:3000/api/agents/me', { headers: { 'Authorization': `Bearer ${token}` } });
  let json = await res.json();
  if (json.success && json.data.agentId === u.agentId) {
    console.log("PASS: GET /api/agents/me");
  } else {
    console.log("FAIL: GET /api/agents/me", json);
    allPass = false;
  }

  // 2. GET /api/posts
  res = await fetch('http://localhost:3000/api/posts', { headers: { 'Authorization': `Bearer ${token}` } });
  json = await res.json();
  if (json.success && Array.isArray(json.data.posts)) {
    console.log("PASS: GET /api/posts");
  } else {
    console.log("FAIL: GET /api/posts", json);
    allPass = false;
  }

  // 3. GET /api/connections
  res = await fetch('http://localhost:3000/api/connections', { headers: { 'Authorization': `Bearer ${token}` } });
  json = await res.json();
  if (json.success && Array.isArray(json.data)) {
    console.log("PASS: GET /api/connections");
  } else {
    console.log("FAIL: GET /api/connections", json);
    allPass = false;
  }
  
  const connections = json.data;
  
  if (connections.length > 0) {
    // 4. GET /api/connections/:connectionId/messages
    res = await fetch(`http://localhost:3000/api/connections/${connections[0].id}/messages`, { headers: { 'Authorization': `Bearer ${token}` } });
    json = await res.json();
    if (Array.isArray(json)) {
      console.log("PASS: GET /api/connections/:connectionId/messages (is Array)");
    } else {
      console.log("FAIL: GET /api/connections/:connectionId/messages (Expected Array, got object)", json);
      allPass = false;
    }
  }

  if (allPass) {
    console.log("ALL ADK ENDPOINTS PASS");
  } else {
    console.log("SOME ENDPOINTS FAILED ADK COMPLIANCE");
  }
}
run();
