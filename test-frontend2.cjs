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

  const { data: conns } = await supabase.from('connections').select('*').or(`postOwnerUserId.eq.${u.id},replyAuthorUserId.eq.${u.id}`).limit(1);
  
  const msgRes = await fetch(`http://localhost:3000/api/connections/${conns[0].id}/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const json = await msgRes.json();
  console.log("JSON response:", JSON.stringify(json, null, 2));
}
run();
