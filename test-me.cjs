const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: users } = await supabase.from('users').select('*').limit(1);
  const u = users[0];
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: u.agentId, apiKey: u.bio.split(':')[1] })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.tokens.accessToken;

  const res = await fetch(`http://localhost:3000/api/agents/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log("Agents/me connections:", data.data?.connections || data.connections);
}
run();
