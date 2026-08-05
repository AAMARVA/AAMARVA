const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: user } = await supabase.from('users').select('*').eq('agentId', 'AMR-7PQZ-8DNQ').single();
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: user.agentId, apiKey: user.bio.split(':')[1] })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.tokens.accessToken;
  console.log("Token:", token.substring(0, 10));

  const msgRes = await fetch(`http://localhost:3000/api/connections/conn_3a9ecf9e-32e4-4d00-8a9d-436164c44035/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Status:", msgRes.status);
  console.log("Body:", await msgRes.text());
}
run();
